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
        // Initialize projected free times for each concurrent slot
        const slotProjectedFreeTimes = new Array(this.maxConcurrentSessions).fill(0);

        // Account for currently active jobs
        const activeJobCompletionEstimates = [];
        this.activeSessions.forEach(activeJob => {
            const estimatedTotalDuration = this._getEstimatedProcessingTimeForJob(activeJob.filesCount);
            const elapsedTime = Date.now() - activeJob.startTime;
            const remainingTime = Math.max(0, estimatedTotalDuration - elapsedTime);
            activeJobCompletionEstimates.push(remainingTime);
        });
        activeJobCompletionEstimates.sort((a, b) => a - b); // Sort by soonest completion

        // Assign remaining times of active jobs to slots
        for (let i = 0; i < Math.min(activeJobCompletionEstimates.length, this.maxConcurrentSessions); i++) {
            slotProjectedFreeTimes[i] = activeJobCompletionEstimates[i];
        }
        // Any remaining slots are considered free now (0 time from now) if fewer active jobs than slots

        // Process the queue to update positions and estimated wait times
        this.queue.forEach((job, index) => {
            job.queuePosition = index + 1;

            const estimatedProcessingTimeForThisJob = this._getEstimatedProcessingTimeForJob(job.files.length);

            // Find the slot that will be free earliest
            let earliestSlotIndex = 0;
            for (let i = 1; i < this.maxConcurrentSessions; i++) {
                if (slotProjectedFreeTimes[i] < slotProjectedFreeTimes[earliestSlotIndex]) {
                    earliestSlotIndex = i;
                }
            }
            
            const estimatedWaitTimeMs = slotProjectedFreeTimes[earliestSlotIndex];
            let formattedWaitTime = this._formatWaitTime(estimatedWaitTimeMs);
            if (!formattedWaitTime) { // Defensive check, though _formatWaitTime should always return a string
                this.logMessage('warn', `[QueueManager] _formatWaitTime returned a falsy value for ${estimatedWaitTimeMs}ms. Defaulting.`, { sessionId: job.sessionId, jobId: job.id });
                formattedWaitTime = "Calculating...";
            }
            job.estimatedWaitTime = formattedWaitTime;
            
            // Update this slot's projected free time by adding the current job's processing time
            slotProjectedFreeTimes[earliestSlotIndex] += estimatedProcessingTimeForThisJob;

            // Use the sendWebSocketMessage callback with sessionId, not job.ws directly
            // as job.ws might be undefined if the WS connection was made after job queuing.
            // The callback (sendWebSocketMessageToSession in server.js) handles finding the active ws by sessionId.
            this.sendWebSocketMessage(job.sessionId, { 
                type: 'queue_update',
                sessionId: job.sessionId,
                    jobId: job.id,
                    queuePosition: job.queuePosition,
                    queueLength: this.queue.length,
                    estimatedWaitTime: job.estimatedWaitTime, // This is the formatted string
                    estimatedWaitTimeMs: estimatedWaitTimeMs, // Send raw ms for potential client-side logic
                    message: `You are position ${job.queuePosition} of ${this.queue.length} in the queue.`
                });
        });
    }

    _getEstimatedProcessingTimeForJob(filesCount) {
        // Returns the total estimated processing time for a job with 'filesCount' files.
        return (this.avgProcessingTimePerFileMs * filesCount) + this.avgBaseJobOverheadMs;
    }

    _formatWaitTime(ms) {
        if (ms <= 0) return "Starting soon"; // If wait time is 0 or negative
        if (ms < 1000) return "< 1 sec"; // More granularity for very short waits
        const totalSeconds = Math.round(ms / 1000);
        if (totalSeconds < 60) return `${totalSeconds} sec`;
        
        const minutes = Math.floor(totalSeconds / 60);
        const seconds = totalSeconds % 60;
        
        if (minutes < 60) {
            return `${minutes} min ${seconds > 0 ? `${seconds} sec` : ''}`.trim();
        }
        
        // For longer waits, could add hours, but let's keep it to minutes for now
        return `${minutes} min`; // Simplified for very long waits
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
