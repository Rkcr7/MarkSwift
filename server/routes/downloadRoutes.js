const express = require('express');
const router = express.Router();
const path = require('path');

// Note: logMessage, CONVERTED_PDFS_DIR_BASE, ZIPS_DIR_BASE, cleanupSessionFiles
// will be passed from server.js or imported from a central place later.

module.exports = (logMessage, CONVERTED_PDFS_DIR_BASE, ZIPS_DIR_BASE, cleanupSessionFiles) => {
    router.get('/pdf/:sessionId/:filename', (req, res) => {
        const { sessionId, filename } = req.params;
        logMessage('info', `[${sessionId}] PDF download request: ${filename}`);
        const filePath = path.join(CONVERTED_PDFS_DIR_BASE, sessionId, decodeURIComponent(filename));
        
        res.download(filePath, decodeURIComponent(filename), (err) => {
            if (err) {
                logMessage('error', `[${sessionId}] Error downloading PDF ${filename}:`, { message: err.message });
                if (!res.headersSent) {
                    res.status(404).send('File not found or error during download.');
                }
            } else {
                logMessage('info', `[${sessionId}] PDF ${filename} downloaded successfully. Scheduling cleanup.`);
                setTimeout(() => cleanupSessionFiles(sessionId), 5000);
            }
        });
    });

    router.get('/zip/:sessionId/:filename', (req, res) => {
        const { sessionId, filename } = req.params;
        logMessage('info', `[${sessionId}] ZIP download request: ${filename}`);
        const filePath = path.join(ZIPS_DIR_BASE, sessionId, decodeURIComponent(filename));

        res.download(filePath, decodeURIComponent(filename), (err) => {
            if (err) {
                logMessage('error', `[${sessionId}] Error downloading ZIP ${filename}:`, { message: err.message });
                if (!res.headersSent) {
                    res.status(404).send('File not found or error during download.');
                }
            } else {
                logMessage('info', `[${sessionId}] ZIP ${filename} downloaded successfully. Scheduling cleanup.`);
                setTimeout(() => cleanupSessionFiles(sessionId), 5000);
            }
        });
    });

    return router;
};
