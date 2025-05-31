const path = require('path');

// Dependencies (logMessage, CONVERTED_PDFS_DIR_BASE, ZIPS_DIR_BASE, cleanupSessionFiles)
// will be injected or imported.

const handlePdfDownload = (logMessage, CONVERTED_PDFS_DIR_BASE, cleanupSessionFiles) => (req, res) => {
    const { sessionId, filename } = req.params;
    logMessage('info', `[${sessionId}] Controller: PDF download request: ${filename}`);
    const filePath = path.join(CONVERTED_PDFS_DIR_BASE, sessionId, decodeURIComponent(filename));

    res.download(filePath, decodeURIComponent(filename), (err) => {
        if (err) {
            logMessage('error', `[${sessionId}] Controller: Error downloading PDF ${filename}:`, { message: err.message });
            if (!res.headersSent) {
                res.status(404).send('File not found or error during download.');
            }
        } else {
            logMessage('info', `[${sessionId}] Controller: PDF ${filename} downloaded successfully. Scheduling cleanup.`);
            setTimeout(() => cleanupSessionFiles(sessionId), 5000);
        }
    });
};

const handleZipDownload = (logMessage, ZIPS_DIR_BASE, cleanupSessionFiles) => (req, res) => {
    const { sessionId, filename } = req.params;
    logMessage('info', `[${sessionId}] Controller: ZIP download request: ${filename}`);
    const filePath = path.join(ZIPS_DIR_BASE, sessionId, decodeURIComponent(filename));

    res.download(filePath, decodeURIComponent(filename), (err) => {
        if (err) {
            logMessage('error', `[${sessionId}] Controller: Error downloading ZIP ${filename}:`, { message: err.message });
            if (!res.headersSent) {
                res.status(404).send('File not found or error during download.');
            }
        } else {
            logMessage('info', `[${sessionId}] Controller: ZIP ${filename} downloaded successfully. Scheduling cleanup.`);
            setTimeout(() => cleanupSessionFiles(sessionId), 5000);
        }
    });
};

module.exports = {
    handlePdfDownload,
    handleZipDownload
};
