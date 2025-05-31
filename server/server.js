const express = require('express');
const path = require('path');
const fs = require('fs-extra');
const multer = require('multer');
const archiver = require('archiver');
const crypto = require('crypto');
const WebSocket = require('ws'); // Added
const MarkdownToPDFConverter = require('./converter');

// Load configuration
let config;
const defaultConfig = {
    appName: "MarkSwift",
    port: 3000,
    fileUploadLimits: { maxFileSizeMB: 10, maxFilesPerBatch: 100 }, // Corrected here
    concurrencyModes: { normal: 4, fast: 7, max: 10 },
    cleanupSettings: { periodicScanIntervalMinutes: 30, orphanedSessionAgeHours: 3 },
    logging: { level: "info" }
};

try {
    const configPath = path.join(__dirname, '../config.json');
    if (fs.existsSync(configPath)) {
        const configFile = fs.readFileSync(configPath, 'utf8');
        config = JSON.parse(configFile);
        // Merge with defaults to ensure all keys are present
        // Important: Ensure defaultConfig is used as the base for merging
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
        // console.log("Configuration loaded from config.json");
    } else {
        config = defaultConfig;
        // console.log("config.json not found, using default configuration.");
        // Optionally create default config.json
        fs.writeJsonSync(configPath, defaultConfig, { spaces: 4 });
        // console.log("Created default config.json. Please review and customize if needed.");
    }
} catch (error) {
    console.error("Error loading or parsing config.json, using default configuration:", error.message);
    config = defaultConfig; // Fallback to original defaultConfig on error
}

const app = express();
const PORT = process.env.PORT || config.port;
const server = require('http').createServer(app); // Added for WebSocket
const wss = new WebSocket.Server({ server }); // Added WebSocket Server

// Store active WebSocket connections, mapping sessionId to ws client
const activeConnections = new Map(); // Added

// --- Configuration ---
const UPLOADS_DIR_BASE = path.join(__dirname, 'uploads');
const CONVERTED_PDFS_DIR_BASE = path.join(__dirname, 'converted-pdfs');
const ZIPS_DIR_BASE = path.join(__dirname, 'zips');

fs.ensureDirSync(UPLOADS_DIR_BASE);
fs.ensureDirSync(CONVERTED_PDFS_DIR_BASE);
fs.ensureDirSync(ZIPS_DIR_BASE);

// --- Middleware ---
app.use(express.json());
app.use(express.static(path.join(__dirname, '../public')));

// Multer setup for file uploads
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        const sessionId = req.sessionId; 
        if (!sessionId) {
            return cb(new Error("Session ID not set for upload"), null);
        }
        const sessionUploadPath = path.join(UPLOADS_DIR_BASE, sessionId);
        fs.ensureDirSync(sessionUploadPath);
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
            cb(new Error('Invalid file type. Only Markdown files (.md, .markdown) are allowed.'), false);
        }
    },
    limits: { fileSize: config.fileUploadLimits.maxFileSizeMB * 1024 * 1024 }
});

// --- Helper Functions ---
function getConcurrencyFromMode(mode) {
    switch (mode) {
        case 'fast': return config.concurrencyModes.fast;
        case 'max': return config.concurrencyModes.max;
        case 'normal':
        default: return config.concurrencyModes.normal;
    }
}

async function scanAndCleanupOrphanedSessions() {
    const now = Date.now();
    const maxAgeMs = config.cleanupSettings.orphanedSessionAgeHours * 60 * 60 * 1000;
    const directoriesToScan = [UPLOADS_DIR_BASE, CONVERTED_PDFS_DIR_BASE, ZIPS_DIR_BASE];

    for (const baseDir of directoriesToScan) {
        try {
            const sessionFolders = await fs.readdir(baseDir);
            for (const sessionId of sessionFolders) {
                const sessionPath = path.join(baseDir, sessionId);
                try {
                    const stats = await fs.stat(sessionPath);
                    if (stats.isDirectory() && (now - stats.mtimeMs > maxAgeMs)) {
                        await fs.remove(sessionPath);
                    }
                } catch (statErr) { /* console.error(`Error stating/removing session folder ${sessionPath}:`, statErr.message); */ }
            }
        } catch (readDirErr) { /* console.error(`Error reading base directory ${baseDir} for cleanup:`, readDirErr.message); */ }
    }
}

async function cleanupSessionFiles(sessionId) {
    const sessionUploadPath = path.join(UPLOADS_DIR_BASE, sessionId);
    const sessionPdfPath = path.join(CONVERTED_PDFS_DIR_BASE, sessionId);
    const sessionZipPath = path.join(ZIPS_DIR_BASE, sessionId);
    try { await fs.remove(sessionUploadPath); } catch (err) { /* ignore */ }
    try { await fs.remove(sessionPdfPath); } catch (err) { /* ignore */ }
    try { await fs.remove(sessionZipPath); } catch (err) { /* ignore */ }
}

// --- API Routes ---
app.post('/api/convert', (req, res, next) => {
    req.sessionId = crypto.randomBytes(16).toString('hex');
    next();
}, upload.array('markdownFiles', config.fileUploadLimits.maxFilesPerBatch), async (req, res) => {
    const sessionId = req.sessionId;
    const files = req.files;
    const mode = req.body.mode || 'normal';

    if (!files || files.length === 0) {
        return res.status(400).json({ message: 'No Markdown files uploaded.' });
    }
    
    res.json({ sessionId, message: "Conversion process started. Awaiting WebSocket connection for progress." });

    const sendProgress = (progressData) => {
        const ws = activeConnections.get(sessionId);
        if (ws && ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify(progressData));
        }
    };
    
    (async () => {
        const concurrency = getConcurrencyFromMode(mode);
        const converter = new MarkdownToPDFConverter();
        const sessionUploadPath = path.join(UPLOADS_DIR_BASE, sessionId);
        const sessionPdfPath = path.join(CONVERTED_PDFS_DIR_BASE, sessionId);
        const sessionZipPath = path.join(ZIPS_DIR_BASE, sessionId);
        
        try {
            await fs.ensureDir(sessionPdfPath);
            await fs.ensureDir(sessionZipPath);
            sendProgress({ type: 'status', message: 'Preparing files...', progress: 5 });
            const uploadedFileObjects = files.map(f => ({ path: f.path, originalname: f.originalname }));
            await converter.init(sendProgress);
            sendProgress({ type: 'status', message: 'Converter initialized. Starting file processing...', progress: 10 });
            const results = await converter.processUploadedFiles(uploadedFileObjects, sessionPdfPath, concurrency, sendProgress);
            sendProgress({ type: 'status', message: 'File processing complete. Finalizing...', progress: 85 });
            await converter.cleanup();

            try { await fs.remove(sessionUploadPath); } catch (err) { /* ignore */ }

            const successfulPdfs = results.filter(r => r.success && r.output).map(r => r.output);

            if (successfulPdfs.length === 0) {
                sendProgress({ type: 'error', message: 'Conversion failed for all files.', details: results });
                return;
            }

            if (successfulPdfs.length === 1) {
                const pdfFileName = path.basename(successfulPdfs[0]);
                sendProgress({ type: 'complete', downloadType: 'pdf', downloadUrl: `/api/download/pdf/${sessionId}/${encodeURIComponent(pdfFileName)}`, message: 'Conversion successful.', progress: 100 });
            } else {
                const zipFileName = `converted_markdown_${sessionId}.zip`;
                const zipFilePath = path.join(sessionZipPath, zipFileName);
                const output = fs.createWriteStream(zipFilePath);
                const archive = archiver('zip', { zlib: { level: 9 } });

                archive.on('progress', (progress) => {
                    const overallProgress = 85 + (progress.fs.processedBytes / progress.fs.totalBytes * 10);
                    sendProgress({ type: 'status', message: `Zipping files: ${Math.round(overallProgress)}%`, progress: Math.round(overallProgress) });
                });

                output.on('close', async () => {
                    try { await fs.remove(sessionPdfPath); } catch (err) { /* ignore */ }
                    sendProgress({ type: 'complete', downloadType: 'zip', downloadUrl: `/api/download/zip/${sessionId}/${encodeURIComponent(zipFileName)}`, message: 'Conversion successful. Files zipped.', progress: 100 });
                });
                archive.on('error', err => { 
                    sendProgress({ type: 'error', message: `Error creating ZIP file: ${err.message}` });
                });
                archive.pipe(output);
                successfulPdfs.forEach(pdfPath => archive.file(pdfPath, { name: path.basename(pdfPath) }));
                await archive.finalize();
            }
        } catch (error) {
            if (converter) await converter.cleanup();
            sendProgress({ type: 'error', message: error.message || 'An error occurred during conversion.' });
        }
    })();
});

app.get('/api/download/pdf/:sessionId/:filename', (req, res) => {
    const { sessionId, filename } = req.params;
    const filePath = path.join(CONVERTED_PDFS_DIR_BASE, sessionId, decodeURIComponent(filename));
    res.download(filePath, decodeURIComponent(filename), async (err) => {
        if (err && !res.headersSent) res.status(404).send('File not found or error during download.');
        if (!err) setTimeout(() => cleanupSessionFiles(sessionId), 5000); 
    });
});

app.get('/api/download/zip/:sessionId/:filename', (req, res) => {
    const { sessionId, filename } = req.params;
    const filePath = path.join(ZIPS_DIR_BASE, sessionId, decodeURIComponent(filename));
    res.download(filePath, decodeURIComponent(filename), async (err) => {
        if (err && !res.headersSent) res.status(404).send('File not found or error during download.');
        if (!err) setTimeout(() => cleanupSessionFiles(sessionId), 5000);
    });
});

app.use((err, req, res, next) => {
    if (err instanceof multer.MulterError) return res.status(400).json({ message: `File upload error: ${err.message}` });
    if (err) return res.status(400).json({ message: err.message });
    next();
});

wss.on('connection', (ws, req) => {
    const urlParams = new URLSearchParams(req.url.substring(req.url.indexOf('?')));
    const sessionId = urlParams.get('sessionId');
    if (!sessionId) { ws.close(); return; }

    activeConnections.set(sessionId, ws);
    ws.send(JSON.stringify({ type: 'connection_ack', message: 'WebSocket connection established.' }));
    ws.on('close', () => activeConnections.delete(sessionId));
    ws.on('error', () => activeConnections.delete(sessionId));
});

server.listen(PORT, () => {
    console.log(`🚀 MarkSwift Server (with WebSocket) listening on http://localhost:${PORT}`);
    setInterval(scanAndCleanupOrphanedSessions, config.cleanupSettings.periodicScanIntervalMinutes * 60 * 1000);
    setTimeout(scanAndCleanupOrphanedSessions, 5000);
});
