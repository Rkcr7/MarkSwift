const express = require('express');
const path = require('path');
const fs = require('fs-extra');
const multer = require('multer');
const archiver = require('archiver');
const crypto = require('crypto');
const WebSocket = require('ws'); // Added
const MarkdownToPDFConverter = require('./converter');

const app = express();
const PORT = process.env.PORT || 3000;
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
        // Files will be initially saved to a session-specific subfolder in UPLOADS_DIR_BASE
        // This will be created in the /api/convert route handler
        const sessionId = req.sessionId; // Will be set in the route
        if (!sessionId) {
            return cb(new Error("Session ID not set for upload"), null);
        }
        const sessionUploadPath = path.join(UPLOADS_DIR_BASE, sessionId);
        fs.ensureDirSync(sessionUploadPath);
        cb(null, sessionUploadPath);
    },
    filename: (req, file, cb) => {
        // Keep original file names for processing, multer handles sanitization
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
    limits: { fileSize: 10 * 1024 * 1024 } // 10MB limit per file
});

// --- Helper Functions ---
function getConcurrencyFromMode(mode) {
    switch (mode) {
        case 'fast': return 7;
        case 'max': return 10;
        case 'normal':
        default: return 4;
    }
}

async function cleanupSessionFiles(sessionId) {
    console.log(`🧹 Cleaning up session files for ${sessionId}...`);
    const sessionUploadPath = path.join(UPLOADS_DIR_BASE, sessionId);
    const sessionPdfPath = path.join(CONVERTED_PDFS_DIR_BASE, sessionId);
    const sessionZipPath = path.join(ZIPS_DIR_BASE, sessionId);

    try {
        await fs.remove(sessionUploadPath);
        console.log(`Removed ${sessionUploadPath}`);
    } catch (err) {
        console.error(`Error removing upload path ${sessionUploadPath}:`, err);
    }
    try {
        await fs.remove(sessionPdfPath);
        console.log(`Removed ${sessionPdfPath}`);
    } catch (err) {
        console.error(`Error removing PDF path ${sessionPdfPath}:`, err);
    }
    try {
        await fs.remove(sessionZipPath);
        console.log(`Removed ${sessionZipPath}`);
    } catch (err) {
        console.error(`Error removing ZIP path ${sessionZipPath}:`, err);
    }
}


// --- API Routes ---
app.post('/api/convert', (req, res, next) => {
    // Generate a unique session ID for this request
    req.sessionId = crypto.randomBytes(16).toString('hex');
    next();
}, upload.array('markdownFiles', 200), async (req, res) => { // Max 100 files
    const sessionId = req.sessionId;
    const files = req.files;
    const mode = req.body.mode || 'normal';

    if (!files || files.length === 0) {
        // No need to cleanup if no files were even processed by multer
        return res.status(400).json({ message: 'No Markdown files uploaded.' });
    }
    
    // Immediately respond to client with sessionId
    res.json({ sessionId, message: "Conversion process started. Awaiting WebSocket connection for progress." });

    // Define sendProgress function for this session
    const sendProgress = (progressData) => {
        const ws = activeConnections.get(sessionId);
        if (ws && ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify(progressData));
        } else {
            console.log(`WebSocket not open or not found for session ${sessionId}. Progress not sent.`);
        }
    };
    
    // Start conversion process asynchronously
    (async () => {
        const concurrency = getConcurrencyFromMode(mode);
        const converter = new MarkdownToPDFConverter(); // Consider passing sendProgress to constructor if needed early

        const sessionUploadPath = path.join(UPLOADS_DIR_BASE, sessionId);
        const sessionPdfPath = path.join(CONVERTED_PDFS_DIR_BASE, sessionId);
        const sessionZipPath = path.join(ZIPS_DIR_BASE, sessionId);
        
        try {
            await fs.ensureDir(sessionPdfPath); // ensureDir is fine, it won't throw if exists
            await fs.ensureDir(sessionZipPath);

            sendProgress({ type: 'status', message: 'Preparing files...', progress: 5 });

            const uploadedFileObjects = files.map(f => ({
                path: f.path,
                originalname: f.originalname
            }));

            await converter.init(sendProgress); // Pass sendProgress to init if it can provide updates
            sendProgress({ type: 'status', message: 'Converter initialized. Starting file processing...', progress: 10 });
            
            const results = await converter.processUploadedFiles(uploadedFileObjects, sessionPdfPath, concurrency, sendProgress); // Pass sendProgress
            
            sendProgress({ type: 'status', message: 'File processing complete. Finalizing...', progress: 85 });
            await converter.cleanup();

            const successfulPdfs = results.filter(r => r.success && r.output).map(r => r.output);

            if (successfulPdfs.length === 0) {
                sendProgress({ type: 'error', message: 'Conversion failed for all files.', details: results });
                // No need to call cleanupSessionFiles here yet, let download attempt or timeout handle it
                return;
            }

            if (successfulPdfs.length === 1) {
                const pdfFileName = path.basename(successfulPdfs[0]);
                sendProgress({
                    type: 'complete',
                    downloadType: 'pdf',
                    downloadUrl: `/api/download/pdf/${sessionId}/${encodeURIComponent(pdfFileName)}`,
                    message: 'Conversion successful.',
                    progress: 100
                });
            } else {
                const zipFileName = `converted_markdown_${sessionId}.zip`;
                const zipFilePath = path.join(sessionZipPath, zipFileName);
                const output = fs.createWriteStream(zipFilePath);
                const archive = archiver('zip', { zlib: { level: 9 } });

                archive.on('progress', (progress) => {
                    // This progress is for zipping, map it to overall progress (e.g., 85-95%)
                    const overallProgress = 85 + (progress.fs.processedBytes / progress.fs.totalBytes * 10);
                    sendProgress({ type: 'status', message: `Zipping files: ${Math.round(overallProgress)}%`, progress: Math.round(overallProgress) });
                });

                output.on('close', () => {
                    console.log(`ZIP created: ${zipFilePath} (${archive.pointer()} total bytes)`);
                    sendProgress({
                        type: 'complete',
                        downloadType: 'zip',
                        downloadUrl: `/api/download/zip/${sessionId}/${encodeURIComponent(zipFileName)}`,
                        message: 'Conversion successful. Files zipped.',
                        progress: 100
                    });
                });
                archive.on('error', err => { 
                    console.error('Archiving error:', err);
                    sendProgress({ type: 'error', message: `Error creating ZIP file: ${err.message}` });
                    // No cleanup here, let timeout handle
                });
                archive.pipe(output);
                successfulPdfs.forEach(pdfPath => {
                    archive.file(pdfPath, { name: path.basename(pdfPath) });
                });
                await archive.finalize();
            }
        } catch (error) {
            console.error('Conversion process error (async block):', error);
            if (converter) await converter.cleanup(); // Ensure browser is closed on error
            sendProgress({ type: 'error', message: error.message || 'An error occurred during conversion.' });
            // No cleanup here, let timeout handle
        }
        // Note: Session cleanup is now primarily handled by download routes or a more robust general cleanup mechanism
        // For instance, a cron job or on server start for orphaned sessions.
        // The setTimeout for cleanup after download is still in the download routes.
    })(); // Self-invoking async function
});

app.get('/api/download/pdf/:sessionId/:filename', (req, res) => {
    const { sessionId, filename } = req.params;
    const filePath = path.join(CONVERTED_PDFS_DIR_BASE, sessionId, decodeURIComponent(filename));

    res.download(filePath, decodeURIComponent(filename), async (err) => {
        if (err) {
            console.error('Error downloading PDF:', err);
            if (!res.headersSent) {
                 res.status(404).send('File not found or error during download.');
            }
        } else {
            console.log(`PDF ${filename} downloaded successfully for session ${sessionId}.`);
            // Schedule cleanup after a short delay to ensure download completes
            setTimeout(() => cleanupSessionFiles(sessionId), 5000); 
        }
    });
});

app.get('/api/download/zip/:sessionId/:filename', (req, res) => {
    const { sessionId, filename } = req.params;
    const filePath = path.join(ZIPS_DIR_BASE, sessionId, decodeURIComponent(filename));

    res.download(filePath, decodeURIComponent(filename), async (err) => {
        if (err) {
            console.error('Error downloading ZIP:', err);
            if (!res.headersSent) {
                res.status(404).send('File not found or error during download.');
            }
        } else {
            console.log(`ZIP ${filename} downloaded successfully for session ${sessionId}.`);
            // Schedule cleanup
            setTimeout(() => cleanupSessionFiles(sessionId), 5000);
        }
    });
});

// Global error handler for multer
app.use((err, req, res, next) => {
    if (err instanceof multer.MulterError) {
        return res.status(400).json({ message: `File upload error: ${err.message}` });
    } else if (err) {
        // Handle other errors (e.g., file type validation)
        return res.status(400).json({ message: err.message });
    }
    next();
});

// --- WebSocket Handling ---
wss.on('connection', (ws, req) => {
    // Extract sessionId from query parameter (e.g., ws://localhost:3000?sessionId=xxxx)
    // req.url will be like '/?sessionId=xxxx'
    const urlParams = new URLSearchParams(req.url.substring(req.url.indexOf('?')));
    const sessionId = urlParams.get('sessionId');

    if (!sessionId) {
        console.log('WebSocket connection attempt without sessionId. Closing.');
        ws.close();
        return;
    }

    console.log(`WebSocket client connected for session: ${sessionId}`);
    activeConnections.set(sessionId, ws);
    
    ws.send(JSON.stringify({ type: 'connection_ack', message: 'WebSocket connection established.' }));

    ws.on('message', (message) => {
        // Handle messages from client if needed, e.g., cancel request
        console.log(`Received message from ${sessionId}: ${message}`);
    });

    ws.on('close', () => {
        console.log(`WebSocket client disconnected for session: ${sessionId}`);
        activeConnections.delete(sessionId);
        // Consider if session cleanup should be triggered here if conversion wasn't finished
        // For now, cleanup is tied to download or a general timeout/mechanism
    });

    ws.on('error', (error) => {
        console.error(`WebSocket error for session ${sessionId}:`, error);
        activeConnections.delete(sessionId); // Remove on error too
    });
});


// --- Start Server ---
// app.listen(PORT, () => { // Original app.listen
server.listen(PORT, () => { // Use server.listen for WebSocket
    console.log(`🚀 Batch Converter Server (with WebSocket) listening on http://localhost:${PORT}`);
    console.log(`📁 Uploads will be stored temporarily in: ${UPLOADS_DIR_BASE}`);
    console.log(`📄 Converted PDFs will be stored temporarily in: ${CONVERTED_PDFS_DIR_BASE}`);
    console.log(`📦 ZIPs will be stored temporarily in: ${ZIPS_DIR_BASE}`);
});
