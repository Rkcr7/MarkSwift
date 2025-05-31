const express = require('express');
const path = require('path');
const fs = require('fs-extra');
const multer = require('multer');
const archiver = require('archiver');
const crypto = require('crypto');
const WebSocket = require('ws');
const MarkdownToPDFConverter = require('./converter');
const QueueManager = require('./queueManager'); // Added for queue system
const rateLimit = require('express-rate-limit'); // Added for rate limiting

// --- Logging Helper ---
const LOG_PREFIX = "[MarkSwift_Server]";
function logMessage(level, message, data = null) {
    const timestamp = new Date().toISOString();
    if (data) {
        console[level](`${timestamp} ${LOG_PREFIX} [${level.toUpperCase()}] ${message}`, data);
    } else {
        console[level](`${timestamp} ${LOG_PREFIX} [${level.toUpperCase()}] ${message}`);
    }
}

// Load configuration
let config;
const defaultConfig = {
    appName: "MarkSwift",
    port: 3000,
    fileUploadLimits: { maxFileSizeMB: 10, maxFilesPerBatch: 100 },
    concurrencyModes: { normal: 4, fast: 7, max: 10 },
    cleanupSettings: { periodicScanIntervalMinutes: 30, orphanedSessionAgeHours: 3 },
    logging: { level: "info" }, // Default logging level
    queueSettings: { // Default queue settings
        maxConcurrentSessions: 2,
        maxQueueSize: 50,
        queueCheckIntervalMs: 2000,
        jobTimeoutMs: 300000 // 5 minutes, not yet used in QueueManager but good to have
    }
};

try {
    const configPath = path.join(__dirname, '../config.json');
    if (fs.existsSync(configPath)) {
        const configFile = fs.readFileSync(configPath, 'utf8');
        config = JSON.parse(configFile);
        const mergedFileUploadLimits = { ...defaultConfig.fileUploadLimits, ...config.fileUploadLimits };
        const mergedConcurrencyModes = { ...defaultConfig.concurrencyModes, ...config.concurrencyModes };
        const mergedCleanupSettings = { ...defaultConfig.cleanupSettings, ...config.cleanupSettings };
        const mergedQueueSettings = { ...defaultConfig.queueSettings, ...config.queueSettings };


        config = { 
            ...defaultConfig, 
            ...config,
            fileUploadLimits: mergedFileUploadLimits,
            concurrencyModes: mergedConcurrencyModes,
            cleanupSettings: mergedCleanupSettings,
            queueSettings: mergedQueueSettings
        };
        logMessage('info', "Configuration loaded from config.json");
    } else {
        config = defaultConfig;
        logMessage('info', "config.json not found, using default configuration.");
        fs.writeJsonSync(configPath, defaultConfig, { spaces: 4 });
        logMessage('info', "Created default config.json. Please review and customize if needed.");
    }
} catch (error) {
    logMessage('error', "Error loading or parsing config.json, using default configuration:", { message: error.message });
    config = defaultConfig;
}

const app = express();
const PORT = process.env.PORT || config.port;
const server = require('http').createServer(app);
const wss = new WebSocket.Server({ server });

const activeConnections = new Map(); // Stores sessionId -> WebSocket instance

// --- WebSocket Message Sender for QueueManager ---
const sendWebSocketMessageToSession = (sessionId, data) => {
    const ws = activeConnections.get(sessionId);
    if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify(data));
    } else {
        logMessage('warn', `[${sessionId}] WebSocket not open/found for QueueManager message. Type: ${data.type}, State: ${ws ? ws.readyState : 'N/A'}`);
    }
};

// --- Initialize QueueManager ---
const queueManager = new QueueManager(logMessage, config, sendWebSocketMessageToSession);


const UPLOADS_DIR_BASE = path.join(__dirname, 'uploads');
const CONVERTED_PDFS_DIR_BASE = path.join(__dirname, 'converted-pdfs');
const ZIPS_DIR_BASE = path.join(__dirname, 'zips');

fs.ensureDirSync(UPLOADS_DIR_BASE);
fs.ensureDirSync(CONVERTED_PDFS_DIR_BASE);
fs.ensureDirSync(ZIPS_DIR_BASE);
logMessage('info', "Base directories ensured.", { uploads: UPLOADS_DIR_BASE, pdfs: CONVERTED_PDFS_DIR_BASE, zips: ZIPS_DIR_BASE });

app.use(express.json());
app.use(express.static(path.join(__dirname, '../public')));

const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        const sessionId = req.sessionId; 
        if (!sessionId) {
            logMessage('error', "Session ID not set for upload in multer destination.", { file: file.originalname });
            return cb(new Error("Session ID not set for upload"), null);
        }
        const sessionUploadPath = path.join(UPLOADS_DIR_BASE, sessionId);
        fs.ensureDirSync(sessionUploadPath);
        // logMessage('debug', `Multer destination: ${sessionUploadPath} for session ${sessionId}`); // Can be too verbose
        cb(null, sessionUploadPath);
    },
    filename: (req, file, cb) => {
        cb(null, file.originalname);
    }
});
const upload = multer({ 
    storage: storage,
    fileFilter: (req, file, cb) => {
        if (file.mimetype === 'text/markdown' || file.originalname.endsWith('.md') || file.originalname.endsWith('.markdown')) {
            cb(null, true);
        } else {
            logMessage('warn', "Invalid file type rejected.", { filename: file.originalname, mimetype: file.mimetype, sessionId: req.sessionId });
            cb(new Error('Invalid file type. Only Markdown files (.md, .markdown) are allowed.'), false);
        }
    },
    limits: { fileSize: config.fileUploadLimits.maxFileSizeMB * 1024 * 1024 }
});

function getConcurrencyFromMode(mode) {
    switch (mode) {
        case 'fast': return config.concurrencyModes.fast;
        case 'max': return config.concurrencyModes.max;
        case 'normal':
        default: return config.concurrencyModes.normal;
    }
}

async function scanAndCleanupOrphanedSessions() {
    logMessage('info', "Starting scan for orphaned sessions.");
    const now = Date.now();
    // Use orphanedSessionAgeMinutes from config, default to 180 minutes (3 hours) if not set
    const orphanedAgeMinutes = config.cleanupSettings.orphanedSessionAgeMinutes || (config.cleanupSettings.orphanedSessionAgeHours * 60) || 180;
    const maxAgeMs = orphanedAgeMinutes * 60 * 1000;
    const directoriesToScan = [UPLOADS_DIR_BASE, CONVERTED_PDFS_DIR_BASE, ZIPS_DIR_BASE];
    let cleanedCount = 0;

    for (const baseDir of directoriesToScan) {
        try {
            const sessionFolders = await fs.readdir(baseDir);
            for (const sessionId of sessionFolders) {
                const sessionPath = path.join(baseDir, sessionId);
                try {
                    const stats = await fs.stat(sessionPath);
                    if (stats.isDirectory() && (now - stats.mtimeMs > maxAgeMs)) {
                        logMessage('info', `Cleaning up orphaned session directory: ${sessionPath}`);
                        await fs.remove(sessionPath);
                        cleanedCount++;
                    }
                } catch (statErr) { logMessage('warn', `Error stating/removing session folder ${sessionPath} during scan:`, { message: statErr.message }); }
            }
        } catch (readDirErr) { logMessage('warn', `Error reading base directory ${baseDir} for cleanup scan:`, { message: readDirErr.message }); }
    }
    if (cleanedCount > 0) {
        logMessage('info', `Orphaned session scan complete. Cleaned ${cleanedCount} session(s).`);
    } else {
        logMessage('info', "Orphaned session scan complete. No old sessions found to clean.");
    }
}

async function cleanupSessionFiles(sessionId) {
    logMessage('info', `Initiating cleanup for session: ${sessionId}`);
    const sessionUploadPath = path.join(UPLOADS_DIR_BASE, sessionId);
    const sessionPdfPath = path.join(CONVERTED_PDFS_DIR_BASE, sessionId);
    const sessionZipPath = path.join(ZIPS_DIR_BASE, sessionId);
    try { await fs.remove(sessionUploadPath); logMessage('debug', `Removed upload dir for session ${sessionId}`, { path: sessionUploadPath }); } catch (err) { /* ignore */ }
    try { await fs.remove(sessionPdfPath); logMessage('debug', `Removed PDF dir for session ${sessionId}`, { path: sessionPdfPath }); } catch (err) { /* ignore */ }
    try { await fs.remove(sessionZipPath); logMessage('debug', `Removed ZIP dir for session ${sessionId}`, { path: sessionZipPath }); } catch (err) { /* ignore */ }
    logMessage('info', `Cleanup completed for session: ${sessionId}`);
}

app.post('/api/convert', (req, res, next) => {
    req.sessionId = crypto.randomBytes(16).toString('hex');
    logMessage('info', `[${req.sessionId}] Received new conversion request.`);
    next();
}, upload.array('markdownFiles', config.fileUploadLimits.maxFilesPerBatch), (req, res) => {
    const sessionId = req.sessionId;
    const files = req.files; // These are multer file objects { path, originalname, etc. }
    const mode = req.body.mode || 'normal';

    logMessage('info', `[${sessionId}] Received /api/convert. Files: ${files ? files.length : 0}, Mode: ${mode}`);

    if (!files || files.length === 0) {
        logMessage('warn', `[${sessionId}] No Markdown files uploaded.`);
        return res.status(400).json({ message: 'No Markdown files uploaded.' });
    }

    // Add job to queue
    // The 'ws' object will be associated later when the WebSocket connection is established for this sessionId
    // or QueueManager will use the sendWebSocketMessageToSession function which looks up by sessionId.
    const jobId = queueManager.addJob(sessionId, files, mode); 
                                        // files are full multer objects
                                        // originalFilenames can be derived from files if needed

    logMessage('info', `[${sessionId}] Job ${jobId} added to queue. Queue size: ${queueManager.getQueueStatus().queueLength}`);
    
    // Respond to client, indicating the job is queued.
    // Client should then connect via WebSocket using this sessionId for progress.
    const initialQueueStatus = queueManager.getJobBySessionId(sessionId);
    res.json({ 
        sessionId, 
        jobId,
        message: "Request received and queued. Connect via WebSocket for real-time updates.",
        queuePosition: initialQueueStatus ? initialQueueStatus.queuePosition : -1, // Provide initial position
        queueLength: queueManager.getQueueStatus().queueLength
    });
});


// --- Actual Conversion Logic (called by QueueManager) ---
async function processConversionJob(job) {
    const { sessionId, files, mode } = job; // files are multer objects
    logMessage('info', `[${sessionId}] [Job ${job.id}] Starting actual conversion from queue.`);

    // This sendProgress function uses activeConnections, which is fine.
    const sendProgress = (progressData) => {
        const ws = activeConnections.get(sessionId);
        if (ws && ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify(progressData));
        } else {
            logMessage('warn', `[${sessionId}] WebSocket not open/found for sending progress during job processing. State: ${ws ? ws.readyState : 'N/A'}`);
        }
    };

    const concurrency = getConcurrencyFromMode(mode);
    logMessage('info', `[${sessionId}] [Job ${job.id}] Concurrency mode: ${mode}, Level: ${concurrency}`);
    const converter = new MarkdownToPDFConverter(sessionId, logMessage);
    const sessionUploadPath = path.join(UPLOADS_DIR_BASE, sessionId); // Uploads are already here
    const sessionPdfPath = path.join(CONVERTED_PDFS_DIR_BASE, sessionId);
    const sessionZipPath = path.join(ZIPS_DIR_BASE, sessionId);
    let jobStatus = 'failed'; // Default to failed, set to 'completed' on success

    try {
        logMessage('info', `[${sessionId}] [Job ${job.id}] Ensuring session directories for PDF/ZIP.`);
        await fs.ensureDir(sessionPdfPath);
        await fs.ensureDir(sessionZipPath);
        logMessage('info', `[${sessionId}] [Job ${job.id}] Session directories ensured.`);

        // Files are already uploaded and their paths are in job.files.map(f => f.path)
        // The originalnames are also in job.files.map(f => f.originalname)
        const uploadedFileObjects = files.map(f => ({ path: f.path, originalname: f.originalname }));

        logMessage('info', `[${sessionId}] [Job ${job.id}] Initializing MarkdownToPDFConverter.`);
        await converter.init(sendProgress);
        logMessage('info', `[${sessionId}] [Job ${job.id}] MarkdownToPDFConverter initialized.`);
        
        sendProgress({ type: 'status', message: 'Converter initialized. Starting file processing...', progress: 10, sessionId });
        logMessage('info', `[${sessionId}] [Job ${job.id}] Starting processing of ${uploadedFileObjects.length} files.`);
        const results = await converter.processUploadedFiles(uploadedFileObjects, sessionPdfPath, concurrency, sendProgress);
        logMessage('info', `[${sessionId}] [Job ${job.id}] File processing completed. Results count: ${results.length}`);
        results.forEach((r, i) => logMessage('debug', `[${sessionId}] [Job ${job.id}] Result ${i}:`, r));

        sendProgress({ type: 'status', message: 'File processing complete. Finalizing...', progress: 85, sessionId });
        logMessage('info', `[${sessionId}] [Job ${job.id}] Cleaning up converter instance.`);
        await converter.cleanup();
        logMessage('info', `[${sessionId}] [Job ${job.id}] Converter instance cleaned up.`);

        // Uploaded files (original .md) are usually cleaned up by multer or should be cleaned here if not.
        // For now, assuming they are in sessionUploadPath and might need cleanup if not handled by converter.
        // The converter.processUploadedFiles takes paths, so original files in UPLOADS_DIR_BASE/sessionId are read.
        // Let's explicitly clean up the sessionUploadPath after successful processing.
        try {
            logMessage('info', `[${sessionId}] [Job ${job.id}] Removing session upload path: ${sessionUploadPath} after processing.`);
            await fs.remove(sessionUploadPath);
            logMessage('info', `[${sessionId}] [Job ${job.id}] Session upload path removed.`);
        } catch (err) { 
            logMessage('warn', `[${sessionId}] [Job ${job.id}] Error removing session upload path: ${sessionUploadPath}`, { message: err.message });
        }

        const successfulPdfs = results.filter(r => r.success && r.output).map(r => r.output);
        logMessage('info', `[${sessionId}] [Job ${job.id}] Number of successfully converted PDFs: ${successfulPdfs.length}`);

        if (successfulPdfs.length === 0) {
            logMessage('warn', `[${sessionId}] [Job ${job.id}] Conversion failed for all files.`);
            sendProgress({ type: 'error', message: 'Conversion failed for all files.', details: results, sessionId });
            jobStatus = 'failed';
        } else if (successfulPdfs.length === 1) {
            const pdfFileName = path.basename(successfulPdfs[0]);
            logMessage('info', `[${sessionId}] [Job ${job.id}] Single PDF conversion successful: ${pdfFileName}`);
            sendProgress({ type: 'complete', downloadType: 'pdf', downloadUrl: `/api/download/pdf/${sessionId}/${encodeURIComponent(pdfFileName)}`, message: 'Conversion successful.', progress: 100, sessionId });
            jobStatus = 'completed';
        } else {
            logMessage('info', `[${sessionId}] [Job ${job.id}] Multiple PDFs (${successfulPdfs.length}) converted. Starting ZIP creation.`);
            const zipFileName = `converted_markdown_${sessionId}.zip`;
            const zipFilePath = path.join(sessionZipPath, zipFileName);
            const output = fs.createWriteStream(zipFilePath);
            const archive = archiver('zip', { zlib: { level: 9 } });

            archive.on('progress', (progress) => {
                const overallProgress = 85 + (progress.fs.processedBytes / progress.fs.totalBytes * 10);
                sendProgress({ type: 'status', message: `Zipping files: ${Math.round(overallProgress)}%`, progress: Math.round(overallProgress), sessionId });
            });

            await new Promise((resolve, reject) => {
                output.on('close', async () => {
                    logMessage('info', `[${sessionId}] [Job ${job.id}] ZIP file created: ${zipFilePath}. Size: ${archive.pointer()} bytes.`);
                    try {
                        logMessage('info', `[${sessionId}] [Job ${job.id}] Removing temp PDF dir after zipping: ${sessionPdfPath}`);
                        await fs.remove(sessionPdfPath); 
                        logMessage('info', `[${sessionId}] [Job ${job.id}] Temp PDF directory removed.`);
                    } catch (err) { 
                        logMessage('warn', `[${sessionId}] [Job ${job.id}] Error removing PDF dir after zipping: ${sessionPdfPath}`, { message: err.message });
                    }
                    sendProgress({ type: 'complete', downloadType: 'zip', downloadUrl: `/api/download/zip/${sessionId}/${encodeURIComponent(zipFileName)}`, message: 'Conversion successful. Files zipped.', progress: 100, sessionId });
                    jobStatus = 'completed';
                    resolve();
                });
                archive.on('error', err => { 
                    logMessage('error', `[${sessionId}] [Job ${job.id}] Error creating ZIP file:`, { message: err.message });
                    sendProgress({ type: 'error', message: `Error creating ZIP file: ${err.message}`, sessionId });
                    jobStatus = 'failed';
                    reject(err);
                });
                archive.pipe(output);
                successfulPdfs.forEach(pdfPath => archive.file(pdfPath, { name: path.basename(pdfPath) }));
                logMessage('info', `[${sessionId}] [Job ${job.id}] Finalizing ZIP archive.`);
                archive.finalize();
            });
        }
    } catch (error) {
        logMessage('error', `[${sessionId}] [Job ${job.id}] Critical error in conversion process:`, { message: error.message, stack: error.stack });
        if (converter) {
            logMessage('info', `[${sessionId}] [Job ${job.id}] Attempting cleanup of converter due to error.`);
            await converter.cleanup();
            logMessage('info', `[${sessionId}] [Job ${job.id}] Converter cleaned up after error.`);
        }
        sendProgress({ type: 'error', message: error.message || 'An error occurred during conversion.', sessionId });
        jobStatus = 'failed';
    } finally {
        queueManager.jobCompleted(sessionId, jobStatus);
    }
}

// Set the callback for QueueManager to process jobs
queueManager.setOnProcessJobCallback(processConversionJob);


// --- Rate Limiter for /api/convert ---
const convertApiLimiter = rateLimit({
    windowMs: 1 * 60 * 1000, // 1 minute
    max: config.queueSettings?.maxRequestsPerMinute || 10, // Max requests per windowMs per IP
    message: { message: 'Too many conversion requests from this IP, please try again after a minute.' },
    standardHeaders: true, // Return rate limit info in the `RateLimit-*` headers
    legacyHeaders: false, // Disable the `X-RateLimit-*` headers
    keyGenerator: (req) => req.ip, // Use IP address for rate limiting
    handler: (req, res, next, options) => {
        logMessage('warn', `[${req.sessionId || req.ip}] Rate limit exceeded for /api/convert. IP: ${req.ip}`);
        res.status(options.statusCode).json(options.message);
    }
});
app.use('/api/convert', convertApiLimiter); // Apply to the /api/convert route specifically


app.get('/api/download/pdf/:sessionId/:filename', (req, res) => {
    const { sessionId, filename } = req.params; // Make sure filename is properly sanitized if used in paths
    logMessage('info', `[${sessionId}] PDF download request: ${filename}`);
    const filePath = path.join(CONVERTED_PDFS_DIR_BASE, sessionId, decodeURIComponent(filename)); // decodeURIComponent is important
    res.download(filePath, decodeURIComponent(filename), async (err) => {
        if (err) {
            logMessage('error', `[${sessionId}] Error downloading PDF ${filename}:`, { message: err.message });
            if (!res.headersSent) res.status(404).send('File not found or error during download.');
        } else {
            logMessage('info', `[${sessionId}] PDF ${filename} downloaded successfully. Scheduling cleanup.`);
            setTimeout(() => cleanupSessionFiles(sessionId), 5000); 
        }
    });
});

app.get('/api/download/zip/:sessionId/:filename', (req, res) => {
    const { sessionId, filename } = req.params; // Make sure filename is properly sanitized
    logMessage('info', `[${sessionId}] ZIP download request: ${filename}`);
    const filePath = path.join(ZIPS_DIR_BASE, sessionId, decodeURIComponent(filename)); // decodeURIComponent is important
    res.download(filePath, decodeURIComponent(filename), async (err) => {
        if (err) {
            logMessage('error', `[${sessionId}] Error downloading ZIP ${filename}:`, { message: err.message });
            if (!res.headersSent) res.status(404).send('File not found or error during download.');
        } else {
            logMessage('info', `[${sessionId}] ZIP ${filename} downloaded successfully. Scheduling cleanup.`);
            setTimeout(() => cleanupSessionFiles(sessionId), 5000);
        }
    });
});

app.use((err, req, res, next) => {
    const sessionId = req.sessionId || 'N/A';
    logMessage('error', `[${sessionId}] Global error handler caught error:`, { message: err.message, type: err.constructor.name });
    if (err instanceof multer.MulterError) return res.status(400).json({ message: `File upload error: ${err.message}` });
    if (err) return res.status(400).json({ message: err.message });
    next();
});

wss.on('connection', (ws, req) => {
    const urlParams = new URLSearchParams(req.url.substring(req.url.indexOf('?')));
    const sessionId = urlParams.get('sessionId');
    if (!sessionId) {
        logMessage('warn', "WebSocket connection attempt without sessionId. Closing.");
        ws.close(1008, "Session ID required"); 
        return; 
    }

    logMessage('info', `[${sessionId}] WebSocket connection established.`);
    activeConnections.set(sessionId, ws);
    ws.send(JSON.stringify({ type: 'connection_ack', message: 'WebSocket connection established.', sessionId }));

    // If there's a job in queue for this session, send its current status
    const jobInQueue = queueManager.getJobBySessionId(sessionId);
    if (jobInQueue && jobInQueue.status === 'queued') {
        sendWebSocketMessageToSession(sessionId, {
            type: 'queue_update',
            sessionId: sessionId,
            queuePosition: jobInQueue.queuePosition,
            queueLength: queueManager.getQueueStatus().queueLength,
            message: `You are position ${jobInQueue.queuePosition} in the queue.`
        });
    } else if (jobInQueue && jobInQueue.status === 'processing') {
         sendWebSocketMessageToSession(sessionId, {
            type: 'processing_started', // Or a general status update
            sessionId: sessionId,
            message: 'Your files are currently being processed.'
        });
    }
    
    ws.on('message', (message) => {
        try {
            const parsedMessage = JSON.parse(message);
            logMessage('debug', `[${sessionId}] Received WebSocket message:`, parsedMessage);
            // Handle client messages if any (e.g., cancel request)
            if (parsedMessage.type === 'getStatus') {
                 const status = queueManager.getJobBySessionId(sessionId) || { status: 'unknown' };
                 ws.send(JSON.stringify({ type: 'current_status', sessionId, status }));
            }
        } catch (e) {
            logMessage('error', `[${sessionId}] Error parsing WebSocket message: ${message}`, e);
        }
    });

    ws.on('close', (code, reason) => {
        logMessage('info', `[${sessionId}] WebSocket connection closed. Code: ${code}, Reason: ${reason ? reason.toString() : 'N/A'}`);
        activeConnections.delete(sessionId);
    });
    ws.on('error', (error) => {
        logMessage('error', `[${sessionId}] WebSocket error:`, { message: error.message });
        activeConnections.delete(sessionId); // Also remove on error
    });
});

server.listen(PORT, () => {
    logMessage('info', `🚀 MarkSwift Server (with Queue System & WebSocket) listening on http://localhost:${PORT}`);
    logMessage('info', `Max concurrent conversion sessions: ${config.queueSettings.maxConcurrentSessions}`);
    logMessage('info', `Periodic session cleanup interval: ${config.cleanupSettings.periodicScanIntervalMinutes} minutes.`);
    const orphanedAgeMinutesDisplay = config.cleanupSettings.orphanedSessionAgeMinutes || (config.cleanupSettings.orphanedSessionAgeHours * 60) || 180;
    logMessage('info', `Orphaned session age for cleanup: ${orphanedAgeMinutesDisplay} minutes.`);
    setInterval(scanAndCleanupOrphanedSessions, config.cleanupSettings.periodicScanIntervalMinutes * 60 * 1000);
    setTimeout(scanAndCleanupOrphanedSessions, 5000); // Initial scan
});

// Graceful shutdown
process.on('SIGTERM', () => {
    logMessage('info', 'SIGTERM signal received. Closing http server and queue manager.');
    server.close(() => {
        logMessage('info', 'Http server closed.');
        queueManager.shutdown();
        process.exit(0);
    });
});
process.on('SIGINT', () => {
    logMessage('info', 'SIGINT signal received. Closing http server and queue manager.');
    server.close(() => {
        logMessage('info', 'Http server closed.');
        queueManager.shutdown();
        process.exit(0);
    });
});
