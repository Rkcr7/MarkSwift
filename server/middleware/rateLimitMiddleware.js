const rateLimit = require('express-rate-limit');

module.exports = (logMessage, config) => {
    return rateLimit({
        windowMs: 1 * 60 * 1000, // 1 minute
        max: config.queueSettings?.maxRequestsPerMinute || 10, // Max requests per windowMs per IP
        message: { message: 'Too many conversion requests from this IP, please try again after a minute.' },
        standardHeaders: true, // Return rate limit info in the `RateLimit-*` headers
        legacyHeaders: false, // Disable the `X-RateLimit-*` headers
        keyGenerator: (req) => req.ip, // Use IP address for rate limiting
        handler: (req, res, next, options) => {
            // req.sessionId might not be available here if this middleware runs before sessionId is assigned
            const clientIdentifier = req.sessionId || req.ip;
            logMessage('warn', `[${clientIdentifier}] Rate limit exceeded for /api/convert. IP: ${req.ip}`);
            res.status(options.statusCode).json(options.message);
        }
    });
};
