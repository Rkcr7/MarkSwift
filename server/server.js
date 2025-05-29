const express = require('express');
const path = require('path');
const fs = require('fs-extra');
const multer = require('multer');
const archiver = require('archiver');
const crypto = require('crypto');
const MarkdownToPDFConverter = require('./converter');

const app = express();
const PORT = process.env.PORT || 3000;

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
}, upload.array('markdownFiles', 25), async (req, res) => { // Max 25 files
    const sessionId = req.sessionId;
    const files = req.files;
    const mode = req.body.mode || 'normal';

    if (!files || files.length === 0) {
        return res.status(400).json({ message: 'No Markdown files uploaded.' });
    }

    const concurrency = getConcurrencyFromMode(mode);
    const converter = new MarkdownToPDFConverter();

    const sessionUploadPath = path.join(UPLOADS_DIR_BASE, sessionId); // Already created by multer
    const sessionPdfPath = path.join(CONVERTED_PDFS_DIR_BASE, sessionId);
    const sessionZipPath = path.join(ZIPS_DIR_BASE, sessionId);
    await fs.ensureDir(sessionPdfPath);
    await fs.ensureDir(sessionZipPath);

    // Map multer file objects to what converter expects
    const uploadedFileObjects = files.map(f => ({
        path: f.path, // multer provides the full path where the file is saved
        originalname: f.originalname
    }));

    try {
        await converter.init();
        const results = await converter.processUploadedFiles(uploadedFileObjects, sessionPdfPath, concurrency);
        await converter.cleanup();

        const successfulPdfs = results.filter(r => r.success && r.output).map(r => r.output);

        if (successfulPdfs.length === 0) {
            // Cleanup even if no PDFs were made, but some files might have been uploaded
            // setTimeout(() => cleanupSessionFiles(sessionId), 60 * 1000 * 10); // 10 min
            return res.status(500).json({ message: 'Conversion failed for all files.', details: results });
        }

        if (successfulPdfs.length === 1) {
            const pdfFileName = path.basename(successfulPdfs[0]);
            // setTimeout(() => cleanupSessionFiles(sessionId), 60 * 1000 * 10); // 10 min
            res.json({
                type: 'pdf',
                downloadUrl: `/api/download/pdf/${sessionId}/${encodeURIComponent(pdfFileName)}`,
                message: 'Conversion successful.'
            });
        } else {
            const zipFileName = `converted_markdown_${sessionId}.zip`;
            const zipFilePath = path.join(sessionZipPath, zipFileName);
            const output = fs.createWriteStream(zipFilePath);
            const archive = archiver('zip', { zlib: { level: 9 } });

            output.on('close', () => {
                console.log(`ZIP created: ${zipFilePath} (${archive.pointer()} total bytes)`);
                // setTimeout(() => cleanupSessionFiles(sessionId), 60 * 1000 * 10); // 10 min
                res.json({
                    type: 'zip',
                    downloadUrl: `/api/download/zip/${sessionId}/${encodeURIComponent(zipFileName)}`,
                    message: 'Conversion successful. Files zipped.'
                });
            });
            archive.on('error', err => { throw err; });
            archive.pipe(output);
            successfulPdfs.forEach(pdfPath => {
                archive.file(pdfPath, { name: path.basename(pdfPath) });
            });
            await archive.finalize();
        }
    } catch (error) {
        console.error('Conversion process error:', error);
        await converter.cleanup(); // Ensure browser is closed on error
        // setTimeout(() => cleanupSessionFiles(sessionId), 60 * 1000 * 10); // 10 min
        res.status(500).json({ message: error.message || 'An error occurred during conversion.' });
    }
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


// --- Start Server ---
app.listen(PORT, () => {
    console.log(`🚀 Batch Converter Server listening on http://localhost:${PORT}`);
    console.log(`📁 Uploads will be stored temporarily in: ${UPLOADS_DIR_BASE}`);
    console.log(`📄 Converted PDFs will be stored temporarily in: ${CONVERTED_PDFS_DIR_BASE}`);
    console.log(`📦 ZIPs will be stored temporarily in: ${ZIPS_DIR_BASE}`);
});
