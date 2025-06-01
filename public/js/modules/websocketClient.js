// websocketClient.js

// This module will need access to UI update functions (showStatus, showError, etc.)
// These will be passed in during initialization or as callbacks.
let uiUpdaters = {};
let progressWebSocket = null;
let currentSessionId = null;

function connect(sessionId, uiCallbacks) {
    if (progressWebSocket && progressWebSocket.readyState === WebSocket.OPEN) {
        console.log('WebSocket already open for session:', currentSessionId);
        if (currentSessionId === sessionId) return; // Already connected for this session
        progressWebSocket.close(); // Close old connection if for a different session
    }

    currentSessionId = sessionId;
    uiUpdaters = uiCallbacks; // Store callbacks: { showStatus, showQueueStatus, showError, showDownloadLink }

    const wsProtocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${wsProtocol}//${window.location.host}?sessionId=${sessionId}`;
    
    console.log(`[WebSocketClient] Connecting to ${wsUrl}`);
    progressWebSocket = new WebSocket(wsUrl);

    progressWebSocket.onopen = () => {
        console.log(`[WebSocketClient] Connection established for session ${sessionId}.`);
        if (uiUpdaters.onOpen) {
            uiUpdaters.onOpen();
        } else {
            // Fallback or default behavior if onOpen is not provided
            uiUpdaters.showStatus('Connected. Waiting for server updates...', true, 5);
        }
    };

    progressWebSocket.onmessage = (event) => {
        const data = JSON.parse(event.data);
        console.log('[WebSocketClient] Message received:', data);

        switch (data.type) {
            case 'connection_ack':
                console.log('[WebSocketClient] Connection Acknowledged by server:', data.message);
                // uiUpdaters.showStatus(data.message, true, data.progress !== undefined ? data.progress : 5);
                break;
            case 'queue_update':
                uiUpdaters.showQueueStatus(data.message, data.queuePosition, data.queueLength, data.estimatedWaitTime);
                break;
            case 'processing_started':
                uiUpdaters.showStatus(data.message, true, 5, null, false, true); // isProcessingStarted = true
                break;
            case 'status':
                uiUpdaters.showStatus(data.message, true, data.progress, null, false, false);
                break;
            case 'file_status':
                let fileStatusDisplay = data.message;
                if (data.totalFiles > 1) {
                    fileStatusDisplay += ` (${data.currentFile} of ${data.totalFiles})`;
                }
                uiUpdaters.showStatus(fileStatusDisplay, true, data.progress, null, false, false);
                break;
            case 'file_complete':
                let fileCompleteDisplay = data.message;
                if (data.totalFiles > 1) {
                    fileCompleteDisplay += ` (${data.currentFile} of ${data.totalFiles} completed)`;
                } else {
                    fileCompleteDisplay = "File conversion complete.";
                }
                uiUpdaters.showStatus(fileCompleteDisplay, true, data.progress, null, false, false);
                break;
            case 'complete':
                uiUpdaters.showStatus(data.message, true, 100, null, false, false);
                setTimeout(() => {
                    uiUpdaters.showDownloadLink(data.downloadUrl, data.downloadType);
                    closeConnection(); // Close WS on completion
                    if (uiUpdaters.onComplete) uiUpdaters.onComplete(); // Notify UI module
                }, 500);
                break;
            case 'error':
                uiUpdaters.showError(data.message + (data.details ? ` Details: ${JSON.stringify(data.details)}` : ''));
                closeConnection(); // Close WS on error
                if (uiUpdaters.onError) uiUpdaters.onError(); // Notify UI module
                break;
            default:
                console.warn('[WebSocketClient] Unknown message type:', data.type);
        }
    };

    progressWebSocket.onerror = (error) => {
        console.error('[WebSocketClient] WebSocket error:', error);
        uiUpdaters.showError('Error connecting for progress updates. Please try again.');
        closeConnection(); // Ensure cleanup
        if (uiUpdaters.onError) uiUpdaters.onError(); // Notify UI module
    };

    progressWebSocket.onclose = (event) => {
        console.log(`[WebSocketClient] Connection closed. Code: ${event.code}, Reason: ${event.reason}`);
        progressWebSocket = null; // Clear the instance
        currentSessionId = null;
        if (uiUpdaters.onClose) {
            uiUpdaters.onClose(event.wasClean);
        }
    };
}

function closeConnection() {
    if (progressWebSocket) {
        console.log('[WebSocketClient] Closing connection.');
        progressWebSocket.close();
    }
}

function getWebSocketState() {
    if (!progressWebSocket) return WebSocket.CLOSED; // Or a custom state like 'UNINITIALIZED'
    return progressWebSocket.readyState;
}

export { connect, closeConnection, getWebSocketState };
