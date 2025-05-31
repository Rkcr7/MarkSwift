const express = require('express');
const path = require('path');
const fs = require('fs-extra');
const multer = require('multer');
const archiver = require('archiver');
const crypto = require('crypto');
const WebSocket = require('ws'); // Added
const MarkdownToPDFConverter = require('./converter');

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
    logging: { level: "info" } // Default logging level
};

try {
    const configPath = path.join(__dirname, '../config.json');
    if (fs.existsSync(configPath)) {
        const configFile = fs.readFileSync(configPath, 'utf8');
        config = JSON.parse(configFile);
        const mergedFileUploadLimits = { ...defaultConfig.fileUploadLimits, ...config.fileUploadLimits };
        const mergedConcurrencyModes = { ...defaultConfig.concurrencyModes, ...config.concurrencyModes };
        const mergedCleanupSettings = { ...defaultConfig.cleanupSettings, ...config.cleanupSettings };

        config = { 
            ...defaultConfig, 
            ...config,
            fileUploadLimits: mergedFileUploadLimits,
            concurrencyModes: mergedConcurrencyModes,
            cleanupSettings: mergedCleanupSettings
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

const activeConnections = new Map();

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
    const maxAgeMs = config.cleanupSettings.orphanedSessionAgeHours * 60 * 60 * 1000;
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
}, upload.array('markdownFiles', config.fileUploadLimits.maxFilesPerBatch), async (req, res) => {
    const sessionId = req.sessionId;
    const files = req.files;
    const mode = req.body.mode || 'normal';

    logMessage('info', `[${sessionId}] Processing /api/convert. Files: ${files ? files.length : 0}, Mode: ${mode}`);

    if (!files || files.length === 0) {
        logMessage('warn', `[${sessionId}] No Markdown files uploaded.`);
        return res.status(400).json({ message: 'No Markdown files uploaded.' });
    }
    
    res.json({ sessionId, message: "Conversion process started. Awaiting WebSocket connection for progress." });
    logMessage('info', `[${sessionId}] Initial response sent. Starting async conversion process.`);

    const sendProgress = (progressData) => {
        const ws = activeConnections.get(sessionId);
        if (ws && ws.readyState === WebSocket.OPEN) {
            // logMessage('debug', `[${sessionId}] Sending progress via WebSocket:`, progressData); // Can be too verbose
            ws.send(JSON.stringify(progressData));
        } else {
            logMessage('warn', `[${sessionId}] WebSocket not open or not found for sending progress. State: ${ws ? ws.readyState : 'N/A'}`);
        }
    };
    
    (async () => {
        logMessage('info', `[${sessionId}] Async conversion task started.`);
        const concurrency = getConcurrencyFromMode(mode);
        logMessage('info', `[${sessionId}] Concurrency mode: ${mode}, Level: ${concurrency}`);
        const converter = new MarkdownToPDFConverter(sessionId, logMessage); // Pass logger
        const sessionUploadPath = path.join(UPLOADS_DIR_BASE, sessionId);
        const sessionPdfPath = path.join(CONVERTED_PDFS_DIR_BASE, sessionId);
        const sessionZipPath = path.join(ZIPS_DIR_BASE, sessionId);
        
        try {
            logMessage('info', `[${sessionId}] Ensuring session directories.`);
            await fs.ensureDir(sessionPdfPath);
            await fs.ensureDir(sessionZipPath);
            logMessage('info', `[${sessionId}] Session directories ensured.`, { pdfPath: sessionPdfPath, zipPath: sessionZipPath });

            sendProgress({ type: 'status', message: 'Preparing files...', progress: 5 });
            const uploadedFileObjects = files.map(f => ({ path: f.path, originalname: f.originalname }));
            
            logMessage('info', `[${sessionId}] Initializing MarkdownToPDFConverter.`);
            await converter.init(sendProgress); // sendProgress is now for internal converter logging too
            logMessage('info', `[${sessionId}] MarkdownToPDFConverter initialized.`);
            
            sendProgress({ type: 'status', message: 'Converter initialized. Starting file processing...', progress: 10 });
            logMessage('info', `[${sessionId}] Starting processing of ${uploadedFileObjects.length} files.`);
            const results = await converter.processUploadedFiles(uploadedFileObjects, sessionPdfPath, concurrency, sendProgress);
            logMessage('info', `[${sessionId}] File processing completed. Results count: ${results.length}`);
            results.forEach((r, i) => logMessage('debug', `[${sessionId}] Result ${i}:`, r));


            sendProgress({ type: 'status', message: 'File processing complete. Finalizing...', progress: 85 });
            logMessage('info', `[${sessionId}] Cleaning up converter instance.`);
            await converter.cleanup();
            logMessage('info', `[${sessionId}] Converter instance cleaned up.`);

            try {
                logMessage('info', `[${sessionId}] Removing session upload path: ${sessionUploadPath}`);
                await fs.remove(sessionUploadPath);
                logMessage('info', `[${sessionId}] Session upload path removed.`);
            } catch (err) { 
                logMessage('warn', `[${sessionId}] Error removing session upload path: ${sessionUploadPath}`, { message: err.message });
            }

            const successfulPdfs = results.filter(r => r.success && r.output).map(r => r.output);
            logMessage('info', `[${sessionId}] Number of successfully converted PDFs: ${successfulPdfs.length}`);

            if (successfulPdfs.length === 0) {
                logMessage('warn', `[${sessionId}] Conversion failed for all files.`);
                sendProgress({ type: 'error', message: 'Conversion failed for all files.', details: results });
                // No return here, allow cleanup to be called if needed by finally
                return; // Explicitly return after sending error
            }

            if (successfulPdfs.length === 1) {
                const pdfFileName = path.basename(successfulPdfs[0]);
                logMessage('info', `[${sessionId}] Single PDF conversion successful: ${pdfFileName}`);
                sendProgress({ type: 'complete', downloadType: 'pdf', downloadUrl: `/api/download/pdf/${sessionId}/${encodeURIComponent(pdfFileName)}`, message: 'Conversion successful.', progress: 100 });
            } else {
                logMessage('info', `[${sessionId}] Multiple PDFs (${successfulPdfs.length}) converted. Starting ZIP creation.`);
                const zipFileName = `converted_markdown_${sessionId}.zip`;
                const zipFilePath = path.join(sessionZipPath, zipFileName);
                const output = fs.createWriteStream(zipFilePath);
                const archive = archiver('zip', { zlib: { level: 9 } });

                archive.on('progress', (progress) => {
                    const overallProgress = 85 + (progress.fs.processedBytes / progress.fs.totalBytes * 10);
                    // logMessage('debug', `[${sessionId}] ZIP progress:`, progress); // Can be too verbose
                    sendProgress({ type: 'status', message: `Zipping files: ${Math.round(overallProgress)}%`, progress: Math.round(overallProgress) });
                });

                output.on('close', async () => {
                    logMessage('info', `[${sessionId}] ZIP file created successfully: ${zipFilePath}. Size: ${archive.pointer()} bytes.`);
                    try {
                        logMessage('info', `[${sessionId}] Removing temporary PDF directory after zipping: ${sessionPdfPath}`);
                        await fs.remove(sessionPdfPath); 
                        logMessage('info', `[${sessionId}] Temporary PDF directory removed.`);
                    } catch (err) { 
                        logMessage('warn', `[${sessionId}] Error removing PDF dir after zipping: ${sessionPdfPath}`, { message: err.message });
                    }
                    sendProgress({ type: 'complete', downloadType: 'zip', downloadUrl: `/api/download/zip/${sessionId}/${encodeURIComponent(zipFileName)}`, message: 'Conversion successful. Files zipped.', progress: 100 });
                });
                archive.on('error', err => { 
                    logMessage('error', `[${sessionId}] Error creating ZIP file:`, { message: err.message });
                    sendProgress({ type: 'error', message: `Error creating ZIP file: ${err.message}` });
                });
                archive.pipe(output);
                successfulPdfs.forEach(pdfPath => archive.file(pdfPath, { name: path.basename(pdfPath) }));
                logMessage('info', `[${sessionId}] Finalizing ZIP archive.`);
                await archive.finalize();
                logMessage('info', `[${sessionId}] ZIP archive finalized.`);
            }
        } catch (error) {
            logMessage('error', `[${sessionId}] Critical error in conversion process:`, { message: error.message, stack: error.stack });
            if (converter) {
                logMessage('info', `[${sessionId}] Attempting cleanup of converter due to error.`);
                await converter.cleanup();
                logMessage('info', `[${sessionId}] Converter cleaned up after error.`);
            }
            sendProgress({ type: 'error', message: error.message || 'An error occurred during conversion.' });
        }
    })();
});

app.get('/api/download/pdf/:sessionId/:filename', (req, res) => {
    const { sessionId, filename } = req.params;
    logMessage('info', `[${sessionId}] PDF download request: ${filename}`);
    const filePath = path.join(CONVERTED_PDFS_DIR_BASE, sessionId, decodeURIComponent(filename));
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
    const { sessionId, filename } = req.params;
    logMessage('info', `[${sessionId}] ZIP download request: ${filename}`);
    const filePath = path.join(ZIPS_DIR_BASE, sessionId, decodeURIComponent(filename));
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
        ws.close(); 
        return; 
    }

    logMessage('info', `[${sessionId}] WebSocket connection established.`);
    activeConnections.set(sessionId, ws);
    ws.send(JSON.stringify({ type: 'connection_ack', message: 'WebSocket connection established.' }));
    
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
    logMessage('info', `🚀 MarkSwift Server (with WebSocket) listening on http://localhost:${PORT}`);
    logMessage('info', `Periodic session cleanup interval: ${config.cleanupSettings.periodicScanIntervalMinutes} minutes.`);
    logMessage('info', `Orphaned session age for cleanup: ${config.cleanupSettings.orphanedSessionAgeHours} hours.`);
    setInterval(scanAndCleanupOrphanedSessions, config.cleanupSettings.periodicScanIntervalMinutes * 60 * 1000);
    // Initial scan shortly after startup
    setTimeout(scanAndCleanupOrphanedSessions, 5000); 
});
