const multer = require('multer');

// logMessage will be passed in or imported from a central logger
module.exports = (logMessage) => (err, req, res, next) => {
    const sessionId = req.sessionId || 'N/A'; // req.sessionId might be set by previous middleware
    
    logMessage('error', `[${sessionId}] Global error handler caught error:`, { 
        message: err.message, 
        type: err.constructor.name,
        stack: err.stack // Good to log the stack for debugging
    });

    if (err instanceof multer.MulterError) {
        return res.status(400).json({ message: `File upload error: ${err.message}` });
    }
    
    // Handle other specific error types if needed
    // if (err instanceof MyCustomError) {
    //     return res.status(err.statusCode || 400).json({ message: err.message });
    // }

    // Generic error
    if (res.headersSent) {
        // If headers already sent, delegate to default Express error handler
        return next(err);
    }
    
    res.status(err.status || err.statusCode || 500).json({
        message: err.message || 'An unexpected error occurred on the server.'
    });
};
