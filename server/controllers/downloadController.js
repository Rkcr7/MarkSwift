const path = require('path');

// Session ids are generated with crypto/uuid, so they are always plain hex-ish
// tokens. Anything else in that slot is a probe, not a real request.
const SESSION_ID_PATTERN = /^[A-Za-z0-9_-]{1,128}$/;

/**
 * Resolve a user-supplied filename inside `baseDir` without letting it escape.
 *
 * Two things were wrong with the previous version:
 *   1. It called decodeURIComponent() on req.params.filename, but Express has
 *      *already* decoded that value. The second decode turned `%252e%252e%252f`
 *      into `../`, which is exactly the bypass traversal filters exist to stop.
 *   2. path.join() happily walks above baseDir when given `../`, and nothing
 *      checked the result.
 *
 * Returns null when the request is not safe to serve.
 */
function resolveWithinBase(baseDir, sessionId, filename) {
    if (!SESSION_ID_PATTERN.test(sessionId)) return null;

    // basename() strips any directory component, so `../../etc/passwd` collapses
    // to `passwd` before it can do damage.
    const safeName = path.basename(filename);
    if (!safeName || safeName === '.' || safeName === '..') return null;

    const sessionDir = path.resolve(baseDir, sessionId);
    const resolved = path.resolve(sessionDir, safeName);

    // Belt and braces: confirm the final path really is under the session dir.
    if (resolved !== sessionDir && !resolved.startsWith(sessionDir + path.sep)) {
        return null;
    }
    return { resolved, safeName };
}

const makeDownloadHandler = (kind) =>
    (logMessage, baseDir, cleanupSessionFiles, postDownloadCleanupDelayMs) => (req, res) => {
        const { sessionId, filename } = req.params;
        logMessage('info', `[${sessionId}] Controller: ${kind} download request: ${filename}`);

        const target = resolveWithinBase(baseDir, sessionId, filename);
        if (!target) {
            logMessage('warn', `[${sessionId}] Controller: rejected unsafe ${kind} download path.`, { filename });
            return res.status(400).send('Invalid download request.');
        }

        res.download(target.resolved, target.safeName, (err) => {
            if (err) {
                logMessage('error', `[${sessionId}] Controller: Error downloading ${kind} ${target.safeName}:`, { message: err.message });
                if (!res.headersSent) {
                    res.status(404).send('File not found or error during download.');
                }
                return;
            }
            logMessage('info', `[${sessionId}] Controller: ${kind} ${target.safeName} downloaded successfully. Scheduling cleanup in ${postDownloadCleanupDelayMs}ms.`);
            setTimeout(() => cleanupSessionFiles(sessionId), postDownloadCleanupDelayMs);
        });
    };

const handlePdfDownload = makeDownloadHandler('PDF');
const handleZipDownload = makeDownloadHandler('ZIP');

module.exports = {
    handlePdfDownload,
    handleZipDownload,
    // exported for testing
    resolveWithinBase
};
