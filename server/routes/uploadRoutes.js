const express = require('express');
const router = express.Router();
const multer = require('multer');
const crypto = require('crypto');
const path = require('path');
const fs = require('fs-extra');

// Note: logMessage, config, queueManager, UPLOADS_DIR_BASE will be passed from server.js or imported from a central place later
// For now, we'll assume they are passed in when the router is initialized.

module.exports = (logMessage, config, queueManager, UPLOADS_DIR_BASE) => {
    const storage = multer.diskStorage({
        destination: (req, file, cb) => {
            const sessionId = req.sessionId; // This will be set by middleware in the main server file
            if (!sessionId) {
                logMessage('error', "Session ID not set for upload in multer destination.", { file: file.originalname });
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
                logMessage('warn', "Invalid file type rejected.", { filename: file.originalname, mimetype: file.mimetype, sessionId: req.sessionId });
                cb(new Error('Invalid file type. Only Markdown files (.md, .markdown) are allowed.'), false);
            }
        },
        limits: { fileSize: config.fileUploadLimits.maxFileSizeMB * 1024 * 1024 }
    });

    // Middleware to generate sessionId for the /api/convert route
    const assignSessionId = (req, res, next) => {
        req.sessionId = crypto.randomBytes(16).toString('hex');
        logMessage('info', `[${req.sessionId}] Assigned new session ID for conversion request.`);
        next();
    };

    router.post('/convert', assignSessionId, upload.array('markdownFiles', config.fileUploadLimits.maxFilesPerBatch), (req, res) => {
        const sessionId = req.sessionId;
        const files = req.files;
        const mode = req.body.mode || 'normal';

        logMessage('info', `[${sessionId}] Route /api/convert hit. Files: ${files ? files.length : 0}, Mode: ${mode}`);

        if (!files || files.length === 0) {
            logMessage('warn', `[${sessionId}] No Markdown files uploaded.`);
            return res.status(400).json({ message: 'No Markdown files uploaded.' });
        }

        const jobId = queueManager.addJob(sessionId, files, mode);
        logMessage('info', `[${sessionId}] Job ${jobId} added to queue. Queue size: ${queueManager.getQueueStatus().queueLength}`);

        const initialQueueStatus = queueManager.getJobBySessionId(sessionId);
        res.json({
            sessionId,
            jobId,
            message: "Request received and queued. Connect via WebSocket for real-time updates.",
            queuePosition: initialQueueStatus ? initialQueueStatus.queuePosition : -1,
            queueLength: queueManager.getQueueStatus().queueLength
        });
    });

    return router;
};
