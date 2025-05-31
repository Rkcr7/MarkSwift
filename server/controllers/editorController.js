// server/controllers/editorController.js
const crypto = require('crypto');
const fs = require('fs-extra');
const path = require('path');

// Dependencies will be injected: logMessage, previewService, queueManager, config, UPLOADS_DIR_BASE

const handleHtmlPreview = (logMessage, previewService) => (req, res) => {
    const { markdownText } = req.body;
    if (typeof markdownText !== 'string') {
        logMessage('warn', '[EditorController] HTML preview request with invalid markdownText type.');
        return res.status(400).json({ message: 'Invalid input: markdownText must be a string.' });
    }
    try {
        const html = previewService.convertToHtml(markdownText);
        res.json({ html });
    } catch (error) {
        logMessage('error', '[EditorController] Error generating HTML preview:', error);
        res.status(500).json({ message: 'Failed to generate HTML preview.' });
    }
};

const handlePdfConversionFromText = (logMessage, queueManager, config, UPLOADS_DIR_BASE) => async (req, res) => {
    const { markdownText, mode = 'normal' } = req.body;

    if (typeof markdownText !== 'string') {
        logMessage('warn', '[EditorController] PDF conversion request with invalid markdownText type.');
        return res.status(400).json({ message: 'Invalid input: markdownText must be a string.' });
    }
    if (!markdownText.trim()) {
        logMessage('warn', '[EditorController] PDF conversion request with empty markdownText.');
        return res.status(400).json({ message: 'Markdown text cannot be empty.' });
    }

    const sessionId = crypto.randomBytes(16).toString('hex');
    logMessage('info', `[${sessionId}] [EditorController] Received new PDF conversion request from text.`);

    // Create a temporary .md file from the text
    const tempFileName = `editor-content-${sessionId}.md`;
    const sessionUploadPath = path.join(UPLOADS_DIR_BASE, sessionId);
    const tempFilePath = path.join(sessionUploadPath, tempFileName);

    try {
        await fs.ensureDir(sessionUploadPath);
        await fs.writeFile(tempFilePath, markdownText, 'utf8');
        logMessage('info', `[${sessionId}] [EditorController] Temporary Markdown file created: ${tempFilePath}`);

        // Create a mock file object similar to what Multer produces
        const mockFile = {
            path: tempFilePath,
            originalname: tempFileName,
            mimetype: 'text/markdown', // Assuming it's Markdown
            size: Buffer.from(markdownText).length // Approximate size
        };

        const jobId = queueManager.addJob(sessionId, [mockFile], mode);
        logMessage('info', `[${sessionId}] [EditorController] Job ${jobId} (from text) added to queue. Queue size: ${queueManager.getQueueStatus().queueLength}`);

        const initialQueueStatus = queueManager.getJobBySessionId(sessionId);
        res.json({
            sessionId,
            jobId,
            message: "Request (from text) received and queued. Connect via WebSocket for real-time updates.",
            queuePosition: initialQueueStatus ? initialQueueStatus.queuePosition : -1,
            queueLength: queueManager.getQueueStatus().queueLength
        });

    } catch (error) {
        logMessage('error', `[${sessionId}] [EditorController] Error processing PDF conversion from text:`, error);
        // Attempt to clean up the temporary file if created
        if (await fs.pathExists(tempFilePath)) {
            await fs.remove(tempFilePath).catch(cleanupErr => 
                logMessage('warn', `[${sessionId}] [EditorController] Failed to cleanup temp file ${tempFilePath} on error:`, cleanupErr)
            );
        }
        res.status(500).json({ message: 'Failed to process PDF conversion from text.' });
    }
};

module.exports = {
    handleHtmlPreview,
    handlePdfConversionFromText
};
