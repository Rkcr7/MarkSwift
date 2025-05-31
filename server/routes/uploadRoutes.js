const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs-extra');
const uploadController = require('../controllers/uploadController');

// Dependencies (logMessage, config, queueManager, UPLOADS_DIR_BASE) are passed in.
module.exports = (logMessage, config, queueManager, UPLOADS_DIR_BASE) => {
    const storage = multer.diskStorage({
        destination: (req, file, cb) => {
            // req.sessionId is now set by the assignSessionId middleware from the controller
            if (!req.sessionId) {
                // This case should ideally not be hit if middleware runs first.
                logMessage('error', "Session ID missing in multer destination. This shouldn't happen.", { file: file.originalname });
                return cb(new Error("Session ID missing for upload destination."), null);
            }
            const sessionUploadPath = path.join(UPLOADS_DIR_BASE, req.sessionId);
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
                logMessage('warn', "Invalid file type rejected.", { filename: file.originalname, mimetype: file.mimetype, sessionId: req.sessionId });
                cb(new Error('Invalid file type. Only Markdown files (.md, .markdown) are allowed.'), false);
            }
        },
        limits: { fileSize: config.fileUploadLimits.maxFileSizeMB * 1024 * 1024 }
    });

    // Use controller methods
    // The assignSessionId middleware needs logMessage
    // The handleConvertUpload handler needs logMessage and queueManager
    router.post(
        '/convert',
        uploadController.assignSessionId(logMessage),
        upload.array('markdownFiles', config.fileUploadLimits.maxFilesPerBatch),
        uploadController.handleConvertUpload(logMessage, queueManager)
    );

    return router;
};
