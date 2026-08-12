const { rateLimit } = require('express-rate-limit');

module.exports = (logMessage, config) => {
    return rateLimit({
        windowMs: 1 * 60 * 1000, // 1 minute
        // v7 renamed `max` to `limit`; `max` was removed in v8.
        limit: config.queueSettings?.maxRequestsPerMinute || 10,
        message: { message: 'Too many conversion requests from this IP, please try again after a minute.' },
        standardHeaders: 'draft-7', // RateLimit-* headers
        legacyHeaders: false, // Disable the X-RateLimit-* headers
        // No custom keyGenerator on purpose. The built-in one normalises IPv6
        // addresses to a /56 subnet, so a single client cannot rotate through a
        // huge address block to sidestep the limit. Passing `req.ip` straight
        // through (as this used to) reintroduces that bypass.
        handler: (req, res, next, options) => {
            const clientIdentifier = req.sessionId || req.ip;
            logMessage('warn', `[${clientIdentifier}] Rate limit exceeded for /api/convert. IP: ${req.ip}`);
            res.status(options.statusCode).json(options.message);
        }
    });
};
