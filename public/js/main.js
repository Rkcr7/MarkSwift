document.addEventListener('DOMContentLoaded', () => {
    const dropArea = document.getElementById('drop-area');
    const fileInput = document.getElementById('file-input');
    const fileListSection = document.getElementById('file-list-section');
    const fileList = document.getElementById('file-list');
    const emptyState = document.getElementById('empty-state');
    const fileCount = document.getElementById('file-count');
    const convertButton = document.getElementById('convert-button');
    const modeRadios = document.querySelectorAll('input[name="conversion-mode"]');

    const statusArea = document.getElementById('status-area');
    const queueStatusMessage = document.getElementById('queue-status-message'); 
    const estimatedWaitTimeMessage = document.getElementById('estimated-wait-time'); // New element for wait time
    const statusMessage = document.getElementById('status-message');
    const progressBarContainer = document.getElementById('progress-bar-container');
    const progressBar = document.getElementById('progress-bar');
    
    const downloadArea = document.getElementById('download-area');
    const downloadLink = document.getElementById('download-link');
    
    const errorArea = document.getElementById('error-area');
    const errorMessage = document.getElementById('error-message');
    const resetButton = document.getElementById('reset-button');

    let selectedFiles = [];
    let progressWebSocket = null; // Added for WebSocket

    // Initialize mode selection visual states
    function initializeModeSelection() {
        const modeCards = document.querySelectorAll('.conversion-mode-card');
        modeCards.forEach(card => {
            const radio = card.querySelector('input[type="radio"]');
            const indicator = card.querySelector('.mode-indicator div');
            
            card.addEventListener('click', () => {
                radio.checked = true;
                updateModeVisuals();
            });
        });
        updateModeVisuals();
    }

    function updateModeVisuals() {
        const modeCards = document.querySelectorAll('.conversion-mode-card');
        modeCards.forEach(card => {
            const radio = card.querySelector('input[type="radio"]');
            const cardDiv = card.querySelector('div');
            const indicator = card.querySelector('.mode-indicator div');
            
            if (radio.checked) {
                cardDiv.classList.add('ring-2', 'ring-offset-2');
                indicator.classList.remove('opacity-0');
                indicator.classList.add('opacity-100');
                
                // Add specific ring colors based on mode
                if (radio.value === 'normal') {
                    cardDiv.classList.add('ring-green-400');
                } else if (radio.value === 'fast') {
                    cardDiv.classList.add('ring-orange-400');
                } else if (radio.value === 'max') {
                    cardDiv.classList.add('ring-red-400');
                }
            } else {
                cardDiv.classList.remove('ring-2', 'ring-offset-2', 'ring-green-400', 'ring-orange-400', 'ring-red-400');
                indicator.classList.add('opacity-0');
                indicator.classList.remove('opacity-100');
            }
        });
    }

    // Enhanced drag and drop with better visual feedback
    dropArea.addEventListener('dragover', (event) => {
        event.preventDefault();
        dropArea.classList.add('border-blue-500', 'bg-blue-50/70', 'scale-105');
        dropArea.querySelector('.fa-cloud-upload-alt').classList.add('animate-bounce');
    });

    dropArea.addEventListener('dragleave', (event) => {
        // Only remove styles if we're leaving the drop area completely
        if (!dropArea.contains(event.relatedTarget)) {
            dropArea.classList.remove('border-blue-500', 'bg-blue-50/70', 'scale-105');
            dropArea.querySelector('.fa-cloud-upload-alt').classList.remove('animate-bounce');
        }
    });

    dropArea.addEventListener('drop', (event) => {
        event.preventDefault();
        dropArea.classList.remove('border-blue-500', 'bg-blue-50/70', 'scale-105');
        dropArea.querySelector('.fa-cloud-upload-alt').classList.remove('animate-bounce');
        
        const files = Array.from(event.dataTransfer.files).filter(file => 
            file.name.endsWith('.md') || file.name.endsWith('.markdown')
        );
        handleFiles(files);
    });

    // File Input
    fileInput.addEventListener('change', (event) => {
        const files = Array.from(event.target.files).filter(file => 
            file.name.endsWith('.md') || file.name.endsWith('.markdown')
        );
        handleFiles(files);
    });

    function handleFiles(files) {
        selectedFiles.push(...files);
        updateFileList();
        updateConvertButtonState();
        clearMessages();
    }

    function updateFileList() {
        if (selectedFiles.length === 0) {
            fileList.classList.add('hidden');
            emptyState.classList.remove('hidden');
            fileCount.classList.add('hidden');
            return;
        }

        fileList.classList.remove('hidden');
        emptyState.classList.add('hidden');
        fileCount.classList.remove('hidden');
        fileCount.textContent = `${selectedFiles.length} file${selectedFiles.length !== 1 ? 's' : ''}`;

        fileList.innerHTML = ''; // Clear existing list
        
        selectedFiles.forEach((file, index) => {
            const listItem = document.createElement('li');
            listItem.className = 'group';
            
            // Get file extension for icon
            const isMarkdown = file.name.endsWith('.md') || file.name.endsWith('.markdown');
            const fileSize = (file.size / 1024).toFixed(2);
            
            listItem.innerHTML = `
                <div class="bg-white/50 backdrop-blur-sm rounded-xl p-4 border border-slate-200 hover:border-blue-300 hover:shadow-md transition-all duration-200 group-hover:bg-white/70">
                    <div class="flex items-center justify-between">
                        <div class="flex items-center flex-1 min-w-0">
                            <div class="w-10 h-10 bg-gradient-to-r ${isMarkdown ? 'from-blue-500 to-blue-600' : 'from-purple-500 to-purple-600'} rounded-lg flex items-center justify-center mr-3 shadow-sm">
                                <i class="fab fa-markdown text-white text-lg"></i>
                            </div>
                            <div class="flex-1 min-w-0">
                                <div class="font-medium text-slate-700 truncate" title="${file.name}">
                                    ${file.name}
                                </div>
                                <div class="text-sm text-slate-500">
                                    ${fileSize} KB
                                </div>
                            </div>
                        </div>
                        <button class="remove-file-btn ml-4 w-8 h-8 bg-red-100 hover:bg-red-200 text-red-600 hover:text-red-700 rounded-lg flex items-center justify-center transition-all duration-200 opacity-0 group-hover:opacity-100" title="Remove file">
                            <i class="fas fa-trash text-sm"></i>
                        </button>
                    </div>
                </div>
            `;
            
            const removeButton = listItem.querySelector('.remove-file-btn');
            removeButton.onclick = (e) => {
                e.stopPropagation();
                removeFile(index);
            };
            
            fileList.appendChild(listItem);
        });
    }

    function removeFile(index) {
        // Add removal animation
        const listItem = fileList.children[index];
        listItem.style.transform = 'translateX(100%)';
        listItem.style.opacity = '0';
        
        setTimeout(() => {
            selectedFiles.splice(index, 1);
            updateFileList();
            updateConvertButtonState();
        }, 200);
    }

    function updateConvertButtonState() {
        const hasFiles = selectedFiles.length > 0;
        convertButton.disabled = !hasFiles;
        
        if (hasFiles) {
            convertButton.classList.remove('opacity-50', 'cursor-not-allowed');
        } else {
            convertButton.classList.add('opacity-50', 'cursor-not-allowed');
        }
    }

    function clearMessages() {
        statusArea.classList.add('hidden');
        statusMessage.textContent = '';
        if (queueStatusMessage) queueStatusMessage.textContent = '';
        if (queueStatusMessage) queueStatusMessage.classList.add('hidden');
        if (estimatedWaitTimeMessage) estimatedWaitTimeMessage.textContent = ''; // Clear wait time
        if (estimatedWaitTimeMessage) estimatedWaitTimeMessage.classList.add('hidden');
        progressBarContainer.classList.add('hidden');
        progressBar.style.width = '0%';
        downloadArea.classList.add('hidden');
        downloadLink.href = '#';
        errorArea.classList.add('hidden');
        errorMessage.textContent = '';
    }
    
    function showStatus(message, showProgress = false, progressValue = 0, fileDetails = null, isQueueUpdate = false) {
        statusArea.classList.remove('hidden');

        if (isQueueUpdate && queueStatusMessage) {
            queueStatusMessage.textContent = message;
            queueStatusMessage.classList.remove('hidden');
            // Main status message might show something generic like "Waiting in queue..."
            // For now, let's ensure the main status message is also updated or cleared.
            // statusMessage.textContent = "Waiting in queue..."; // Or clear it if queue message is primary
        } else if (queueStatusMessage && !isQueueUpdate) {
            // If it's not a queue update, hide the queue message if it was visible
            // queueStatusMessage.classList.add('hidden'); 
            // queueStatusMessage.textContent = '';
        }
        
        // Always update the main status message for non-queue updates or as a fallback
        // If it's a queue update, the main status message might be different or cleared.
        // This logic needs refinement based on desired UI behavior.
        // For now, let's have queue messages in queueStatusMessage and others in statusMessage.
        if (!isQueueUpdate) {
            statusMessage.textContent = message;
            if (fileDetails) {
                statusMessage.textContent += ` (${fileDetails})`;
            }
        }


        if (showProgress) {
            progressBarContainer.classList.remove('hidden');
            progressBar.style.width = `${progressValue}%`;
        } else if (!isQueueUpdate) { // Don't hide progress bar if it's just a queue text update
            // progressBarContainer.classList.add('hidden');
            // progressBar.style.width = '0%';
        }
    }
    
    function showQueueStatus(message, queuePosition, queueLength, estimatedWaitTimeStr) {
        statusArea.classList.remove('hidden');
        
        if (queueStatusMessage) {
            queueStatusMessage.textContent = message;
            queueStatusMessage.classList.remove('hidden');
        } else { 
            statusMessage.textContent = message; // Fallback
        }

        if (estimatedWaitTimeMessage) {
            if (estimatedWaitTimeStr) {
                estimatedWaitTimeMessage.textContent = `Estimated wait: ${estimatedWaitTimeStr}`;
                estimatedWaitTimeMessage.classList.remove('hidden');
            } else {
                estimatedWaitTimeMessage.classList.add('hidden');
            }
        }
        
        progressBarContainer.classList.add('hidden'); // Always hide progress bar for queue status
        statusMessage.textContent = "Waiting in queue..."; // General status
    }


    function showError(message) {
        clearMessages();
        errorMessage.textContent = message;
        errorArea.classList.remove('hidden');
        
        // Add shake animation to error area
        errorArea.style.animation = 'shake 0.5s ease-in-out';
        setTimeout(() => {
            errorArea.style.animation = '';
        }, 500);
    }

    function showDownloadLink(url, type) {
        clearMessages();
        downloadArea.classList.remove('hidden');
        downloadLink.href = url;
        
        // Add success animation
        downloadArea.style.transform = 'scale(0.9)';
        downloadArea.style.opacity = '0';
        setTimeout(() => {
            downloadArea.style.transform = 'scale(1)';
            downloadArea.style.opacity = '1';
        }, 100);
    }

    // Convert Button Click with enhanced feedback
    convertButton.addEventListener('click', async () => {
        if (selectedFiles.length === 0) {
            showError('Please select at least one Markdown file.');
            return;
        }
        
        clearMessages();
        showStatus('Initiating conversion...', true, 0); // Initial message
        convertButton.disabled = true;

        const buttonContent = convertButton.querySelector('span');
        const originalButtonContent = buttonContent.innerHTML;
        buttonContent.innerHTML = '<i class="fas fa-spinner fa-spin mr-2"></i>Working...';

        const formData = new FormData();
        selectedFiles.forEach(file => {
            formData.append('markdownFiles', file);
        });
        const selectedMode = document.querySelector('input[name="conversion-mode"]:checked').value;
        formData.append('mode', selectedMode);

        try {
            // Step 1: Initial HTTP request to start conversion and get sessionId
            const initialResponse = await fetch('/api/convert', {
                method: 'POST',
                body: formData,
            });

            if (!initialResponse.ok) {
                const errorData = await initialResponse.json().catch(() => ({ message: 'Failed to initiate conversion process.' }));
                throw new Error(errorData.message || `Server error: ${initialResponse.status}`);
            }

            const initialResult = await initialResponse.json();
            const sessionId = initialResult.sessionId;
            const jobId = initialResult.jobId; 
            const initialQueuePos = initialResult.queuePosition;
            const initialQueueLen = initialResult.queueLength;
            // initialResult might also send estimatedWaitTime directly if calculated on initial add.
            // For now, we rely on the first 'queue_update' for estimatedWaitTime.

            if (!sessionId) {
                throw new Error('Session ID not received from server.');
            }

            if (initialQueuePos && initialQueuePos > 0) {
                showQueueStatus(
                    `Request queued. Position: ${initialQueuePos} of ${initialQueueLen}.`, 
                    initialQueuePos, 
                    initialQueueLen,
                    initialResult.estimatedWaitTime || "Calculating..." // Use if provided
                );
            } else if (jobId) { // If not immediately queued, it might be processing or just ack'd
                 showStatus('Request received. Connecting for updates...', true, 2);
            } else {
                 showStatus('Connecting for progress updates...', true, 2);
            }


            // Step 2: Establish WebSocket connection
            // Ensure to use wss:// if your site is on https://
            const wsProtocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
            progressWebSocket = new WebSocket(`${wsProtocol}//${window.location.host}?sessionId=${sessionId}`);

            progressWebSocket.onopen = () => {
                console.log('WebSocket connection established.');
                showStatus('Connected. Starting file upload and processing...', true, 5);
                // Server should start sending progress after this connection
            };

            progressWebSocket.onmessage = (event) => {
                const data = JSON.parse(event.data);
                console.log('Progress update:', data);

                switch (data.type) {
                    case 'connection_ack':
                        // Optional: Acknowledge connection if server sends one
                        // If not already in queue or processing, this is a good place to confirm connection.
                        // If already showing queue status, this might be redundant or just a log.
                        console.log('Connection Acknowledged by server:', data.message);
                        // showStatus(data.message, true, data.progress !== undefined ? data.progress : progressBar.style.width.replace('%',''));
                        break;
                    case 'queue_update':
                        showQueueStatus(data.message, data.queuePosition, data.queueLength, data.estimatedWaitTime);
                        statusMessage.textContent = "Waiting in queue..."; // Main status
                        progressBarContainer.classList.add('hidden'); 
                        if (estimatedWaitTimeMessage && data.estimatedWaitTime) {
                            estimatedWaitTimeMessage.textContent = `Estimated wait: ${data.estimatedWaitTime}`;
                            estimatedWaitTimeMessage.classList.remove('hidden');
                        } else if (estimatedWaitTimeMessage) {
                            estimatedWaitTimeMessage.classList.add('hidden');
                        }
                        break;
                    case 'processing_started':
                        if (queueStatusMessage) queueStatusMessage.classList.add('hidden'); 
                        if (estimatedWaitTimeMessage) estimatedWaitTimeMessage.classList.add('hidden');
                        showStatus(data.message, true, 5); 
                        break;
                    case 'status':
                        if (queueStatusMessage) queueStatusMessage.classList.add('hidden');
                        if (estimatedWaitTimeMessage) estimatedWaitTimeMessage.classList.add('hidden');
                        showStatus(data.message, true, data.progress);
                        break;
                    case 'file_status': 
                        if (queueStatusMessage) queueStatusMessage.classList.add('hidden');
                        if (estimatedWaitTimeMessage) estimatedWaitTimeMessage.classList.add('hidden');
                        let fileStatusDisplay = data.message; // e.g., "Processing file"
                        if (data.totalFiles > 1) {
                            fileStatusDisplay += ` (${data.currentFile} of ${data.totalFiles})`;
                        }
                        showStatus(fileStatusDisplay, true, data.progress);
                        break;
                    case 'file_complete': // Handles individual file completion
                        let fileCompleteDisplay = data.message; // e.g., "File processed"
                        if (data.totalFiles > 1) {
                            fileCompleteDisplay += ` (${data.currentFile} of ${data.totalFiles} completed)`;
                        } else {
                            fileCompleteDisplay = "File conversion complete."; // Simpler for single file
                        }
                        showStatus(fileCompleteDisplay, true, data.progress);
                        break;
                    case 'complete':
                        showStatus(data.message, true, 100);
                        setTimeout(() => { // Give a moment for the 100% to show
                            showDownloadLink(data.downloadUrl, data.downloadType);
                            if (progressWebSocket) progressWebSocket.close();
                        }, 500);
                        // Reset button state here as process is complete
                        convertButton.disabled = false;
                        buttonContent.innerHTML = originalButtonContent;
                        updateConvertButtonState();
                        break;
                    case 'error':
                        showError(data.message + (data.details ? ` Details: ${JSON.stringify(data.details)}` : ''));
                        if (progressWebSocket) progressWebSocket.close();
                        // Reset button state on error
                        convertButton.disabled = false;
                        buttonContent.innerHTML = originalButtonContent;
                        updateConvertButtonState();
                        break;
                    default:
                        console.warn('Unknown WebSocket message type:', data.type);
                }
            };

            progressWebSocket.onerror = (error) => {
                console.error('WebSocket error:', error);
                showError('Error connecting for progress updates. Please try again.');
                if (progressWebSocket) progressWebSocket.close(); // Clean up
                // Reset button state on WebSocket error
                convertButton.disabled = false;
                buttonContent.innerHTML = originalButtonContent;
                updateConvertButtonState();
            };

            progressWebSocket.onclose = () => {
                console.log('WebSocket connection closed.');
                // Don't reset button here if close was due to completion.
                // It's handled in 'complete' or 'error' cases.
                // If it closes unexpectedly, the error handler or a timeout should manage UI.
            };

        } catch (error) {
            console.error('Conversion initiation error:', error);
            showError(`Error: ${error.message}`);
            // Reset button state on initial fetch error
            convertButton.disabled = false;
            buttonContent.innerHTML = originalButtonContent;
            updateConvertButtonState();
            if (progressWebSocket) { // Clean up if WS was somehow initiated
                progressWebSocket.close();
            }
        }
        // Note: 'finally' block is removed because button state is managed within async flow now
    });

    // Reset Button Click with animation
    resetButton.addEventListener('click', () => {
        if (progressWebSocket && progressWebSocket.readyState === WebSocket.OPEN) {
            progressWebSocket.close();
            console.log('WebSocket connection closed by reset.');
        }
        // Add reset animation
        resetButton.style.transform = 'rotate(180deg)';
        setTimeout(() => {
            resetButton.style.transform = 'rotate(0deg)';
        }, 300);
        
        selectedFiles = [];
        updateFileList();
        updateConvertButtonState();
        clearMessages();
        
        // Reset conversion mode to default
        const defaultModeRadio = document.querySelector('input[name="conversion-mode"][value="normal"]');
        if (defaultModeRadio) {
            defaultModeRadio.checked = true;
            updateModeVisuals();
        }
        
        // Clear file input
        if (fileInput) {
            fileInput.value = '';
        }
    });

    // Add CSS for animations
    const style = document.createElement('style');
    style.textContent = `
        @keyframes shake {
            0%, 100% { transform: translateX(0); }
            25% { transform: translateX(-5px); }
            75% { transform: translateX(5px); }
        }
        
        .conversion-mode-card {
            transition: all 0.2s ease-in-out;
        }
        
        .conversion-mode-card:hover {
            transform: translateY(-2px);
        }
        
        #file-list li {
            transition: all 0.2s ease-in-out;
        }
        
        #reset-button {
            transition: transform 0.3s ease-in-out;
        }
        
        #download-area {
            transition: all 0.3s ease-in-out;
        }
    `;
    document.head.appendChild(style);

    // Initialize everything
    initializeModeSelection();
    updateConvertButtonState();
});
