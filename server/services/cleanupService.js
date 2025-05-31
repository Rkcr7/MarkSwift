const fs = require('fs-extra');
const path = require('path');

class CleanupService {
    constructor(logMessage, config, UPLOADS_DIR_BASE, CONVERTED_PDFS_DIR_BASE, ZIPS_DIR_BASE) {
        this.logMessage = logMessage;
        this.config = config;
        this.UPLOADS_DIR_BASE = UPLOADS_DIR_BASE;
        this.CONVERTED_PDFS_DIR_BASE = CONVERTED_PDFS_DIR_BASE;
        this.ZIPS_DIR_BASE = ZIPS_DIR_BASE;

        this.logMessage('info', '[CleanupService] Initialized.');
    }

    async scanAndCleanupOrphanedSessions() {
        this.logMessage('info', "[CleanupService] Starting scan for orphaned sessions.");
        const now = Date.now();
        const orphanedAgeMinutes = this.config.cleanupSettings.orphanedSessionAgeMinutes || 
                                 (this.config.cleanupSettings.orphanedSessionAgeHours * 60) || 
                                 180;
        const maxAgeMs = orphanedAgeMinutes * 60 * 1000;
        const directoriesToScan = [this.UPLOADS_DIR_BASE, this.CONVERTED_PDFS_DIR_BASE, this.ZIPS_DIR_BASE];
        let cleanedCount = 0;

        for (const baseDir of directoriesToScan) {
            try {
                const sessionFolders = await fs.readdir(baseDir);
                for (const sessionId of sessionFolders) {
                    const sessionPath = path.join(baseDir, sessionId);
                    try {
                        const stats = await fs.stat(sessionPath);
                        if (stats.isDirectory() && (now - stats.mtimeMs > maxAgeMs)) {
                            this.logMessage('info', `[CleanupService] Cleaning up orphaned session directory: ${sessionPath}`);
                            await fs.remove(sessionPath);
                            cleanedCount++;
                        }
                    } catch (statErr) {
                        this.logMessage('warn', `[CleanupService] Error stating/removing session folder ${sessionPath} during scan:`, { message: statErr.message });
                    }
                }
            } catch (readDirErr) {
                this.logMessage('warn', `[CleanupService] Error reading base directory ${baseDir} for cleanup scan:`, { message: readDirErr.message });
            }
        }
        if (cleanedCount > 0) {
            this.logMessage('info', `[CleanupService] Orphaned session scan complete. Cleaned ${cleanedCount} session(s).`);
        } else {
            this.logMessage('info', "[CleanupService] Orphaned session scan complete. No old sessions found to clean.");
        }
    }

    async cleanupSessionFiles(sessionId) {
        this.logMessage('info', `[CleanupService] Initiating cleanup for session: ${sessionId}`);
        const sessionUploadPath = path.join(this.UPLOADS_DIR_BASE, sessionId);
        const sessionPdfPath = path.join(this.CONVERTED_PDFS_DIR_BASE, sessionId);
        const sessionZipPath = path.join(this.ZIPS_DIR_BASE, sessionId);
        
        try { await fs.remove(sessionUploadPath); this.logMessage('debug', `[CleanupService] Removed upload dir for session ${sessionId}`, { path: sessionUploadPath }); } catch (err) { /* ignore */ }
        try { await fs.remove(sessionPdfPath); this.logMessage('debug', `[CleanupService] Removed PDF dir for session ${sessionId}`, { path: sessionPdfPath }); } catch (err) { /* ignore */ }
        try { await fs.remove(sessionZipPath); this.logMessage('debug', `[CleanupService] Removed ZIP dir for session ${sessionId}`, { path: sessionZipPath }); } catch (err) { /* ignore */ }
        
        this.logMessage('info', `[CleanupService] Cleanup completed for session: ${sessionId}`);
    }

    startPeriodicCleanup() {
        const intervalMinutes = this.config.cleanupSettings.periodicScanIntervalMinutes || 30;
        setInterval(() => this.scanAndCleanupOrphanedSessions(), intervalMinutes * 60 * 1000);
        // Initial scan shortly after server start
        setTimeout(() => this.scanAndCleanupOrphanedSessions(), 5000); 
        this.logMessage('info', `[CleanupService] Periodic cleanup scheduled every ${intervalMinutes} minutes.`);
    }
}

module.exports = CleanupService;
