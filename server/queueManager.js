const { v4: uuidv4 } = require('uuid');

class QueueManager {
    constructor(logMessage, config, sendWebSocketMessageCallback) {
        this.logMessage = logMessage;
        this.config = config;
        this.sendWebSocketMessage = sendWebSocketMessageCallback; // Function to send messages via WebSocket

        this.queue = []; // Stores { sessionId, files, mode, originalFilenames, ws, timestamp, status, queuePosition, estimatedWaitTime }
        this.activeSessions = new Map(); // Stores sessionId -> { startTime, filesCount, jobId }
        this.maxConcurrentSessions = this.config.queueSettings?.maxConcurrentSessions || 2;
        this.processingHistory = []; // Stores { durationMs, filesCount } for completed jobs
        this.avgProcessingTimePerFileMs = this.config.queueSettings?.defaultAvgTimePerFileMs || 5000; // Default 5s per file
        this.avgBaseJobOverheadMs = this.config.queueSettings?.defaultBaseJobOverheadMs || 10000; // Default 10s base overhead

        this.logMessage('info', '[QueueManager] Initialized.', { 
            maxConcurrentSessions: this.maxConcurrentSessions,
            avgProcessingTimePerFileMs: this.avgProcessingTimePerFileMs,
            avgBaseJobOverheadMs: this.avgBaseJobOverheadMs
        });
        this._processingInterval = setInterval(() => this._processQueue(), this.config.queueSettings?.queueCheckIntervalMs || 2000);
    }

    addJob(sessionId, files, mode, originalFilenames, ws) { // files is an array of multer file objects
        const job = {
            id: uuidv4(),
            sessionId,
            files, // Array of multer file objects
            mode,
            // originalFilenames can be derived from files: files.map(f => f.originalname)
            ws,
            timestamp: Date.now(),
            status: 'queued',
            queuePosition: -1,
            estimatedWaitTime: 'Calculating...' // Initial value
        };
        this.queue.push(job);
        this.logMessage('info', `[QueueManager] Job added for session ${sessionId} (ID: ${job.id}). Files: ${files.length}. Queue size: ${this.queue.length}`);
        this._updateQueuePositionsAndNotify();
        this._processQueue(); // Attempt to process immediately if slots are free
        return job.id;
    }

    getJobBySessionId(sessionId) {
        return this.queue.find(job => job.sessionId === sessionId) || 
               (this.activeSessions.has(sessionId) ? { sessionId, status: 'processing' } : null);
    }
    
    getQueueStatus() {
        return {
            queueLength: this.queue.length,
            activeConversations: this.activeSessions.size,
            maxConcurrentSessions: this.maxConcurrentSessions,
            queuedJobs: this.queue.map(job => ({ sessionId: job.sessionId, position: job.queuePosition, files: job.files.length }))
        };
    }

    _updateQueuePositionsAndNotify() {
        let cumulativeEstimatedWaitTime = 0;
        const jobsCurrentlyProcessingCount = this.activeSessions.size;

        this.queue.forEach((job, index) => {
            job.queuePosition = index + 1;
            
            // Estimate time for this job based on its own files
            const estimatedTimeForThisJob = this._calculateJobEstimate(job.files.length);

            if (job.queuePosition <= this.maxConcurrentSessions - jobsCurrentlyProcessingCount) {
                // This job will likely start in the current batch of processing or next immediate one
                job.estimatedWaitTime = this._formatWaitTime(this.avgBaseJobOverheadMs / 2); // A small base time
            } else {
                 // For jobs further down, add the estimated time of jobs ahead of it that are *also* in the queue
                job.estimatedWaitTime = this._formatWaitTime(cumulativeEstimatedWaitTime + (this.avgBaseJobOverheadMs / 2) );
            }
            
            // Add this job's estimated processing time to the cumulative total for the *next* job in queue
            cumulativeEstimatedWaitTime += estimatedTimeForThisJob;


            if (job.ws && job.ws.readyState === 1) { // WebSocket.OPEN = 1
                this.sendWebSocketMessage(job.ws, { // Send to the specific session's WebSocket
                    type: 'queue_update',
                    sessionId: job.sessionId,
                    jobId: job.id,
                    queuePosition: job.queuePosition,
                    queueLength: this.queue.length,
                    estimatedWaitTime: job.estimatedWaitTime,
                    message: `You are position ${job.queuePosition} of ${this.queue.length} in the queue.`
                });
            }
        });
    }

    _calculateJobEstimate(filesCount) {
        // Simple estimation: (avg time per file * num files) + base overhead
        // Divided by number of concurrent processors to get a rough idea of how long one "slot" takes
        const singleJobTime = (this.avgProcessingTimePerFileMs * filesCount) + this.avgBaseJobOverheadMs;
        return singleJobTime / Math.max(1, this.maxConcurrentSessions); // Avoid division by zero
    }

    _formatWaitTime(ms) {
        if (ms < 1000) return "< 1 min";
        const totalSeconds = Math.round(ms / 1000);
        const minutes = Math.floor(totalSeconds / 60);
        const seconds = totalSeconds % 60;
        if (minutes === 0) return `${seconds} sec`;
        return `${minutes} min ${seconds} sec`;
    }
    
    _recalculateAverages() {
        if (this.processingHistory.length === 0) return;
        let totalDuration = 0;
        let totalFiles = 0;
        this.processingHistory.forEach(item => {
            totalDuration += item.durationMs;
            totalFiles += item.filesCount;
        });
        
        // A more robust average would be per file, then add a base overhead.
        // For now, a simple average job time.
        // This needs to be smarter: (totalDuration - (N * baseOverhead)) / totalFiles = timePerFile
        // avgJobTime = (totalDuration / this.processingHistory.length);
        
        if (totalFiles > 0) {
             // Estimate base overhead by taking the minimum processing time as a proxy, or a fixed portion
            const minDuration = Math.min(...this.processingHistory.map(h => h.durationMs));
            const estimatedBaseOverhead = Math.min(this.avgBaseJobOverheadMs, minDuration * 0.3 || this.avgBaseJobOverheadMs);
            
            this.avgProcessingTimePerFileMs = (totalDuration - (this.processingHistory.length * estimatedBaseOverhead)) / totalFiles;
            this.avgBaseJobOverheadMs = estimatedBaseOverhead; // Or keep it somewhat stable
        } else if (this.processingHistory.length > 0) { // If jobs had 0 files (should not happen)
            this.avgBaseJobOverheadMs = totalDuration / this.processingHistory.length;
        }


        // Cap history size to keep averages relevant
        const maxHistory = this.config.queueSettings?.maxProcessingHistory || 20;
        if (this.processingHistory.length > maxHistory) {
            this.processingHistory.splice(0, this.processingHistory.length - maxHistory);
        }
        this.logMessage('debug', '[QueueManager] Recalculated averages.', { avgFileMs: this.avgProcessingTimePerFileMs, avgOverheadMs: this.avgBaseJobOverheadMs, historySize: this.processingHistory.length });
    }


    _processQueue() {
        if (this.activeSessions.size >= this.maxConcurrentSessions) {
            // this.logMessage('debug', '[QueueManager] Max concurrent sessions reached. Waiting.');
            return;
        }

        if (this.queue.length === 0) {
            // this.logMessage('debug', '[QueueManager] Queue is empty.');
            return;
        }

        const jobToProcess = this.queue.shift(); // Get the first job
        jobToProcess.status = 'processing';
        jobToProcess.queuePosition = 0; // No longer in queue, now processing

        this.activeSessions.set(jobToProcess.sessionId, { 
            startTime: Date.now(), 
            filesCount: jobToProcess.files.length,
            jobId: jobToProcess.id // Keep track of the job ID
        });

        this.logMessage('info', `[QueueManager] Starting job for session ${jobToProcess.sessionId}. Active: ${this.activeSessions.size}/${this.maxConcurrentSessions}`);
        
        if (jobToProcess.ws && jobToProcess.ws.readyState === 1) {
            this.sendWebSocketMessage(jobToProcess.ws, {
                type: 'processing_started',
                sessionId: jobToProcess.sessionId,
                message: 'Your files are now being processed.'
            });
        }
        
        this._updateQueuePositionsAndNotify(); // Update positions for remaining jobs

        // Emit an event or call a callback to start the actual conversion in server.js
        if (this.onProcessJob) {
            this.onProcessJob(jobToProcess);
        } else {
            this.logMessage('warn', '[QueueManager] onProcessJob callback not set. Cannot start conversion.');
        }
    }

    // Called from server.js when a job is finished (successfully or with error)
    jobCompleted(sessionId, status = 'completed') {
        const jobDetails = this.activeSessions.get(sessionId);
        if (jobDetails) {
            const durationMs = Date.now() - jobDetails.startTime;
            this.processingHistory.push({ durationMs, filesCount: jobDetails.filesCount, jobId: jobDetails.jobId });
            this._recalculateAverages();
            
            this.activeSessions.delete(sessionId);
            this.logMessage('info', `[QueueManager] Job ${jobDetails.jobId} for session ${sessionId} completed. Status: ${status}. Duration: ${durationMs}ms. Active: ${this.activeSessions.size}`);
        } else {
            this.logMessage('warn', `[QueueManager] jobCompleted called for session ${sessionId}, but it was not found in active sessions.`);
        }
        this._processQueue(); // Check if new jobs can be started
        this._updateQueuePositionsAndNotify(); // Update wait times for remaining jobs
    }
    
    // Method to register the callback for processing a job
    setOnProcessJobCallback(callback) {
        this.onProcessJob = callback;
    }

    // Graceful shutdown
    shutdown() {
        this.logMessage('info', '[QueueManager] Shutting down...');
        clearInterval(this._processingInterval);
    }
}

module.exports = QueueManager;
