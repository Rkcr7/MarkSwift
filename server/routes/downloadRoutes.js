const express = require('express');
const router = express.Router();
const downloadController = require('../controllers/downloadController');

// Dependencies (logMessage, config, CONVERTED_PDFS_DIR_BASE, ZIPS_DIR_BASE, cleanupSessionFiles) are passed in.
module.exports = (logMessage, config, CONVERTED_PDFS_DIR_BASE, ZIPS_DIR_BASE, cleanupSessionFiles) => {
    const postDownloadCleanupDelayMs = config.cleanupSettings?.postDownloadCleanupDelayMs || 5000; // Default to 5s if not set

    router.get(
        '/pdf/:sessionId/:filename',
        downloadController.handlePdfDownload(logMessage, CONVERTED_PDFS_DIR_BASE, cleanupSessionFiles, postDownloadCleanupDelayMs)
    );

    router.get(
        '/zip/:sessionId/:filename',
        downloadController.handleZipDownload(logMessage, ZIPS_DIR_BASE, cleanupSessionFiles, postDownloadCleanupDelayMs)
    );

    return router;
};
