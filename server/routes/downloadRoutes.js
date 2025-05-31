const express = require('express');
const router = express.Router();
const downloadController = require('../controllers/downloadController');

// Dependencies (logMessage, CONVERTED_PDFS_DIR_BASE, ZIPS_DIR_BASE, cleanupSessionFiles) are passed in.
module.exports = (logMessage, CONVERTED_PDFS_DIR_BASE, ZIPS_DIR_BASE, cleanupSessionFiles) => {
    router.get(
        '/pdf/:sessionId/:filename',
        downloadController.handlePdfDownload(logMessage, CONVERTED_PDFS_DIR_BASE, cleanupSessionFiles)
    );

    router.get(
        '/zip/:sessionId/:filename',
        downloadController.handleZipDownload(logMessage, ZIPS_DIR_BASE, cleanupSessionFiles)
    );

    return router;
};
