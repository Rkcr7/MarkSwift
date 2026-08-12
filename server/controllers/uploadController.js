const crypto = require('crypto');

// Dependencies (logMessage, queueManager) will be injected or imported
// For now, assume they are available in the scope where these functions are called,
// or passed via a constructor if this becomes a class.

// Middleware to generate sessionId
const assignSessionId = (logMessage) => (req, res, next) => {
    req.sessionId = crypto.randomBytes(16).toString('hex');
    logMessage('info', `[${req.sessionId}] Assigned new session ID for conversion request.`);
    next();
};

const VALID_MODES = new Set(['normal', 'fast', 'max']);

const handleConvertUpload = (logMessage, queueManager) => (req, res) => {
    const sessionId = req.sessionId;
    const files = req.files;

    // Express 5 leaves req.body undefined when no body parser matched the
    // request, where Express 4 defaulted it to {}. Reading `.mode` off it
    // directly threw a TypeError and turned every malformed POST into a 500.
    const requestedMode = req.body?.mode;
    const mode = VALID_MODES.has(requestedMode) ? requestedMode : 'normal';

    logMessage('info', `[${sessionId}] Controller: Handling /api/convert. Files: ${files ? files.length : 0}, Mode: ${mode}`);

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
};

module.exports = {
    assignSessionId,
    handleConvertUpload
};
