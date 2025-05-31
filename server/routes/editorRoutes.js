// server/routes/editorRoutes.js
const express = require('express');
const router = express.Router();
const editorController = require('../controllers/editorController');

// Dependencies (logMessage, previewService, queueManager, config, UPLOADS_DIR_BASE) are passed in.
module.exports = (logMessage, previewService, queueManager, config, UPLOADS_DIR_BASE) => {
    // Route for generating HTML preview from Markdown text
    router.post(
        '/preview-html',
        editorController.handleHtmlPreview(logMessage, previewService)
    );

    // Route for converting Markdown text to PDF (queues a job)
    router.post(
        '/convert-pdf',
        editorController.handlePdfConversionFromText(logMessage, queueManager, config, UPLOADS_DIR_BASE)
    );

    return router;
};
