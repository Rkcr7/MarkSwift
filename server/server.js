const express = require('express');
const path = require('path');
const fs = require('fs-extra');
const multer = require('multer');
const archiver = require('archiver');
const crypto = require('crypto');
// WebSocket is now handled by WebSocketHandler, so direct import might not be needed here unless for types
const MarkdownToPDFConverter = require('./converter');
const QueueManager = require('./queueManager'); // Added for queue system

// --- Middleware Imports ---
const rateLimitMiddleware = require('./middleware/rateLimitMiddleware');
const errorMiddleware = require('./middleware/errorMiddleware');

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
const httpServer = require('http').createServer(app); // Renamed to httpServer for clarity

// --- WebSocket Handler Import ---
const WebSocketHandler = require('./websocket/websocketHandler');

// --- Route Imports ---
const uploadRoutes = require('./routes/uploadRoutes');
const downloadRoutes = require('./routes/downloadRoutes');
const editorRoutes = require('./routes/editorRoutes'); // New route for editor

// --- Service Imports ---
const CleanupService = require('./services/cleanupService');
// const PreviewService = require('./services/previewService'); // REMOVED - No longer needed
// const ConversionService = require('./services/conversionService'); // Placeholder, will be used later

// --- Initialize WebSocket Handler (before QueueManager if QueueManager needs its send method) ---
// Note: WebSocketHandler needs the httpServer instance.
// QueueManager will need the sendMessageToSession method from the webSocketHandler instance.

// Placeholder for webSocketHandler instance, will be initialized after httpServer
let webSocketHandler; 

// --- Initialize QueueManager ---
// We need to pass the sendMessageToSession method from webSocketHandler to queueManager.
// This creates a slight ordering dependency. We'll initialize webSocketHandler first, then queueManager.
// For now, let's define a placeholder function that will be replaced.
let sendMessageCallbackForQueueManager = (sessionId, data) => {
    // This will be replaced by webSocketHandler.sendMessageToSession.bind(webSocketHandler)
    logMessage('warn', `[${sessionId}] WebSocketHandler not yet initialized. Message not sent:`, data);
};
const queueManager = new QueueManager(logMessage, config, sendMessageCallbackForQueueManager);

// Now initialize WebSocketHandler and update the callback for QueueManager
webSocketHandler = new WebSocketHandler(logMessage, httpServer, queueManager);
sendMessageCallbackForQueueManager = webSocketHandler.sendMessageToSession.bind(webSocketHandler);
queueManager.sendWebSocketMessage = sendMessageCallbackForQueueManager; // Update the callback in QueueManager


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

// --- Initialize Services ---
const cleanupService = new CleanupService(logMessage, config, UPLOADS_DIR_BASE, CONVERTED_PDFS_DIR_BASE, ZIPS_DIR_BASE);
// const previewService = new PreviewService(logMessage); // REMOVED
// const conversionService = new ConversionService(logMessage, config, queueManager, webSocketHandler.sendMessageToSession.bind(webSocketHandler), UPLOADS_DIR_BASE, CONVERTED_PDFS_DIR_BASE, ZIPS_DIR_BASE); // Pass correct WS send method


// --- Setup Routes ---
// Note: The rate limiter is applied before the uploadRoutes, so it still protects /api/convert
app.use('/api', uploadRoutes(logMessage, config, queueManager, UPLOADS_DIR_BASE));
// Pass the bound method from cleanupService instance and the config object
app.use('/api/download', downloadRoutes(logMessage, config, CONVERTED_PDFS_DIR_BASE, ZIPS_DIR_BASE, cleanupService.cleanupSessionFiles.bind(cleanupService)));
// Add editor routes - previewService removed from dependencies
app.use('/api/editor', editorRoutes(logMessage, queueManager, config, UPLOADS_DIR_BASE));


// --- Actual Conversion Logic (called by QueueManager) ---
// This function `processConversionJob` is a callback for queueManager, so it stays here for now.
// It could be moved to a service in a later phase.
async function processConversionJob(job) {
    const { sessionId, files, mode } = job; // files are multer objects
    logMessage('info', `[${sessionId}] [Job ${job.id}] Starting actual conversion from queue.`);

    // Use webSocketHandler to send progress messages
    const sendProgress = (progressData) => {
        // Ensure progressData includes sessionId if not already present, or rely on webSocketHandler's method
        if (!progressData.sessionId) progressData.sessionId = sessionId;
        webSocketHandler.sendMessageToSession(sessionId, progressData);
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


// --- Setup Rate Limiter ---
// The '/api/convert' path is handled within uploadRoutes, which is mounted under '/api'
// So, applying the limiter to '/api/convert' should still work.
// Alternatively, pass the limiter to uploadRoutes to apply it specifically there.
// For now, keeping it here as it was.
const convertApiLimiter = rateLimitMiddleware(logMessage, config);
app.use('/api/convert', convertApiLimiter);


// Global error handler - must be the last piece of middleware
app.use(errorMiddleware(logMessage));

// WebSocket setup is now handled by WebSocketHandler, which is initialized with httpServer

httpServer.listen(PORT, () => { // Use httpServer here
    logMessage('info', `🚀 MarkSwift Server (with Queue System & WebSocket) listening on http://localhost:${PORT}`);
    logMessage('info', `Max concurrent conversion sessions: ${config.queueSettings.maxConcurrentSessions}`);
    // Cleanup service now handles its own logging for interval and age
    cleanupService.startPeriodicCleanup(); // Start periodic cleanup
});

// Graceful shutdown
process.on('SIGTERM', () => {
    logMessage('info', 'SIGTERM signal received. Closing http server and queue manager.');
    httpServer.close(() => { // Use httpServer here
        logMessage('info', 'Http server closed.');
        if (webSocketHandler) webSocketHandler.shutdown(); // Shutdown WebSocketHandler
        queueManager.shutdown();
        process.exit(0);
    });
});
process.on('SIGINT', () => {
    logMessage('info', 'SIGINT signal received. Closing http server and queue manager.');
    httpServer.close(() => { // Use httpServer here
        logMessage('info', 'Http server closed.');
        if (webSocketHandler) webSocketHandler.shutdown(); // Shutdown WebSocketHandler
        queueManager.shutdown();
        process.exit(0);
    });
});
