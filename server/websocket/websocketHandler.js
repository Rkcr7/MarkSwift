const WebSocket = require('ws');

class WebSocketHandler {
    constructor(logMessage, httpServer, queueManager) {
        this.logMessage = logMessage;
        this.queueManager = queueManager;
        this.activeConnections = new Map(); // sessionId -> WebSocket instance
        this.wss = new WebSocket.Server({ server: httpServer });

        this.logMessage('info', '[WebSocketHandler] Initialized and attached to HTTP server.');
        this._initializeListeners();
    }

    _initializeListeners() {
        this.wss.on('connection', (ws, req) => {
            const urlParams = new URLSearchParams(req.url.substring(req.url.indexOf('?')));
            const sessionId = urlParams.get('sessionId');

            if (!sessionId) {
                this.logMessage('warn', "[WebSocketHandler] Connection attempt without sessionId. Closing.");
                ws.close(1008, "Session ID required");
                return;
            }

            this.logMessage('info', `[${sessionId}] [WebSocketHandler] Connection established.`);
            this.activeConnections.set(sessionId, ws);
            ws.send(JSON.stringify({ type: 'connection_ack', message: 'WebSocket connection established.', sessionId }));

            // If there's a job in queue for this session, send its current status
            const jobInQueue = this.queueManager.getJobBySessionId(sessionId);
            if (jobInQueue && jobInQueue.status === 'queued') {
                this.sendMessageToSession(sessionId, {
                    type: 'queue_update',
                    sessionId: sessionId,
                    jobId: jobInQueue.id, // Make sure job object has id
                    queuePosition: jobInQueue.queuePosition,
                    queueLength: this.queueManager.getQueueStatus().queueLength,
                    estimatedWaitTime: jobInQueue.estimatedWaitTime,
                    estimatedWaitTimeMs: jobInQueue.estimatedWaitTimeMs,
                    message: `You are position ${jobInQueue.queuePosition} in the queue.`
                });
            } else if (jobInQueue && jobInQueue.status === 'processing') {
                this.sendMessageToSession(sessionId, {
                    type: 'processing_started',
                    sessionId: sessionId,
                    jobId: jobInQueue.id,
                    message: 'Your files are currently being processed.'
                });
            }

            ws.on('message', (message) => {
                try {
                    const parsedMessage = JSON.parse(message);
                    this.logMessage('debug', `[${sessionId}] [WebSocketHandler] Received message:`, parsedMessage);
                    if (parsedMessage.type === 'getStatus') {
                        const status = this.queueManager.getJobBySessionId(sessionId) || { status: 'unknown', id: null };
                        ws.send(JSON.stringify({ type: 'current_status', sessionId, status, jobId: status.id }));
                    }
                    // Handle other client messages if needed
                } catch (e) {
                    this.logMessage('error', `[${sessionId}] [WebSocketHandler] Error parsing message: ${message}`, e);
                }
            });

            ws.on('close', (code, reason) => {
                this.logMessage('info', `[${sessionId}] [WebSocketHandler] Connection closed. Code: ${code}, Reason: ${reason ? reason.toString() : 'N/A'}`);
                this.activeConnections.delete(sessionId);
            });

            ws.on('error', (error) => {
                this.logMessage('error', `[${sessionId}] [WebSocketHandler] Error:`, { message: error.message });
                this.activeConnections.delete(sessionId); // Also remove on error
            });
        });
    }

    // Method for QueueManager or other services to send messages
    sendMessageToSession(sessionId, data) {
        const ws = this.activeConnections.get(sessionId);
        if (ws && ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify(data));
            // this.logMessage('debug', `[${sessionId}] [WebSocketHandler] Sent message:`, data);
            return true;
        } else {
            this.logMessage('warn', `[${sessionId}] [WebSocketHandler] WebSocket not open/found for sending message. Type: ${data.type}, State: ${ws ? ws.readyState : 'N/A'}`);
            return false;
        }
    }

    // Graceful shutdown for WebSockets (optional, if needed)
    shutdown() {
        this.logMessage('info', '[WebSocketHandler] Shutting down. Closing all connections.');
        this.activeConnections.forEach((ws, sessionId) => {
            ws.close(1000, 'Server shutting down');
            this.logMessage('info', `[${sessionId}] [WebSocketHandler] Closed connection due to server shutdown.`);
        });
        this.wss.close((err) => {
            if (err) {
                this.logMessage('error', '[WebSocketHandler] Error closing WebSocket server:', err);
            } else {
                this.logMessage('info', '[WebSocketHandler] WebSocket server closed.');
            }
        });
    }
}

module.exports = WebSocketHandler;
