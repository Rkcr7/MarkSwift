// fileUploadUI.js
import * as wsClient from './websocketClient.js';

let selectedFiles = [];

// DOM Elements (will be initialized in init)
let dropArea, fileInput, fileListSection, fileList, emptyState, fileCount, convertButton, modeRadios;
let statusArea, queueStatusMessage, estimatedWaitTimeMessage, statusMessage, progressBarContainer, progressBar;
let downloadArea, downloadLink;
let errorArea, errorMessage;
let resetButton;
let originalButtonContent = ''; // To store original convert button text

function initializeDOMElements() {
    dropArea = document.getElementById('drop-area');
    fileInput = document.getElementById('file-input');
    fileListSection = document.getElementById('file-list-section');
    fileList = document.getElementById('file-list');
    emptyState = document.getElementById('empty-state');
    fileCount = document.getElementById('file-count');
    convertButton = document.getElementById('convert-button');
    modeRadios = document.querySelectorAll('input[name="conversion-mode"]');

    statusArea = document.getElementById('status-area');
    queueStatusMessage = document.getElementById('queue-status-message');
    estimatedWaitTimeMessage = document.getElementById('estimated-wait-time');
    statusMessage = document.getElementById('status-message');
    progressBarContainer = document.getElementById('progress-bar-container');
    progressBar = document.getElementById('progress-bar');
    
    downloadArea = document.getElementById('download-area');
    downloadLink = document.getElementById('download-link');
    
    errorArea = document.getElementById('error-area');
    errorMessage = document.getElementById('error-message');
    resetButton = document.getElementById('reset-button');

    if (convertButton) {
        const buttonSpan = convertButton.querySelector('span');
        if (buttonSpan) originalButtonContent = buttonSpan.innerHTML;
    }
}

function initializeModeSelection() {
    const modeCards = document.querySelectorAll('.conversion-mode-card');
    modeCards.forEach(card => {
        card.addEventListener('click', () => {
            const radio = card.querySelector('input[type="radio"]');
            if (radio) radio.checked = true;
            updateModeVisuals();
        });
    });
    updateModeVisuals();
}

function updateModeVisuals() {
    const modeCards = document.querySelectorAll('.conversion-mode-card');
    modeCards.forEach(card => {
        const radio = card.querySelector('input[type="radio"]');
        const cardDiv = card.querySelector('div'); // The main div inside the label
        const indicator = card.querySelector('.mode-indicator div');

        if (!radio || !cardDiv || !indicator) return;

        if (radio.checked) {
            cardDiv.classList.add('ring-2', 'ring-offset-2');
            indicator.classList.remove('opacity-0');
            indicator.classList.add('opacity-100');
            
            cardDiv.classList.remove('ring-green-400', 'ring-orange-400', 'ring-red-400'); // Clear previous
            if (radio.value === 'normal') cardDiv.classList.add('ring-green-400');
            else if (radio.value === 'fast') cardDiv.classList.add('ring-orange-400');
            else if (radio.value === 'max') cardDiv.classList.add('ring-red-400');
        } else {
            cardDiv.classList.remove('ring-2', 'ring-offset-2', 'ring-green-400', 'ring-orange-400', 'ring-red-400');
            indicator.classList.add('opacity-0');
            indicator.classList.remove('opacity-100');
        }
    });
}

function handleFileSelection(files) {
    selectedFiles.push(...files);
    renderFileList();
    updateConvertButtonUIState();
    clearAllMessages();
}

function renderFileList() {
    if (!fileList || !emptyState || !fileCount) return;

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
    fileList.innerHTML = '';
    
    selectedFiles.forEach((file, index) => {
        const listItem = document.createElement('li');
        listItem.className = 'group';
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
                            <div class="font-medium text-slate-700 truncate" title="${file.name}">${file.name}</div>
                            <div class="text-sm text-slate-500">${fileSize} KB</div>
                        </div>
                    </div>
                    <button class="remove-file-btn ml-4 w-8 h-8 bg-red-100 hover:bg-red-200 text-red-600 hover:text-red-700 rounded-lg flex items-center justify-center transition-all duration-200 opacity-0 group-hover:opacity-100" title="Remove file">
                        <i class="fas fa-trash text-sm"></i>
                    </button>
                </div>
            </div>`;
        listItem.querySelector('.remove-file-btn').onclick = (e) => {
            e.stopPropagation();
            removeFileFromList(index);
        };
        fileList.appendChild(listItem);
    });
}

function removeFileFromList(index) {
    const listItem = fileList.children[index];
    if (listItem) {
        listItem.style.transform = 'translateX(100%)';
        listItem.style.opacity = '0';
        setTimeout(() => {
            selectedFiles.splice(index, 1);
            renderFileList();
            updateConvertButtonUIState();
        }, 200);
    }
}

function updateConvertButtonUIState(isWorking = false) {
    if (!convertButton) return;
    const hasFiles = selectedFiles.length > 0;
    convertButton.disabled = !hasFiles || isWorking;
    
    const buttonSpan = convertButton.querySelector('span');

    if (isWorking) {
        convertButton.classList.add('opacity-50', 'cursor-not-allowed');
        if (buttonSpan) buttonSpan.innerHTML = '<i class="fas fa-spinner fa-spin mr-2"></i>Working...';
    } else {
        if (hasFiles) {
            convertButton.classList.remove('opacity-50', 'cursor-not-allowed');
        } else {
            convertButton.classList.add('opacity-50', 'cursor-not-allowed');
        }
        if (buttonSpan) buttonSpan.innerHTML = originalButtonContent || 'Convert to PDF';
    }
}


function clearAllMessages() {
    if (statusArea) statusArea.classList.add('hidden');
    if (statusMessage) statusMessage.textContent = '';
    if (queueStatusMessage) {
        queueStatusMessage.textContent = '';
        queueStatusMessage.classList.add('hidden');
    }
    if (estimatedWaitTimeMessage) {
        estimatedWaitTimeMessage.textContent = '';
        estimatedWaitTimeMessage.classList.add('hidden');
    }
    if (progressBarContainer) progressBarContainer.classList.add('hidden');
    if (progressBar) progressBar.style.width = '0%';
    if (downloadArea) downloadArea.classList.add('hidden');
    if (downloadLink) downloadLink.href = '#';
    if (errorArea) errorArea.classList.add('hidden');
    if (errorMessage) errorMessage.textContent = '';
}

// Added isProcessingStarted to hide queue messages when processing actually starts
function displayStatus(message, showProgress = false, progressValue = 0, fileDetails = null, isQueueUpdate = false, isProcessingStarted = false) {
    if (!statusArea || !statusMessage) return;
    statusArea.classList.remove('hidden');

    if (isQueueUpdate && queueStatusMessage) {
        queueStatusMessage.textContent = message;
        queueStatusMessage.classList.remove('hidden');
        statusMessage.textContent = "Waiting in queue..."; // General status
    } else {
        if (queueStatusMessage && (isProcessingStarted || !showProgress)) { // Hide queue if processing starts or if it's a final message
            queueStatusMessage.classList.add('hidden');
            queueStatusMessage.textContent = '';
        }
        statusMessage.textContent = message;
        if (fileDetails) statusMessage.textContent += ` (${fileDetails})`;
    }

    if (showProgress && progressBarContainer && progressBar) {
        progressBarContainer.classList.remove('hidden');
        progressBar.style.width = `${progressValue}%`;
    } else if (!isQueueUpdate && progressBarContainer) { // Don't hide for queue text updates
        // progressBarContainer.classList.add('hidden'); // Let's not hide it if it was already visible for a status
    }
    if (isProcessingStarted && estimatedWaitTimeMessage) { // Hide wait time when processing starts
        estimatedWaitTimeMessage.classList.add('hidden');
    }
}

function displayQueueStatus(message, queuePosition, queueLength, estimatedWaitTimeStr) {
    if (!statusArea) return;
    statusArea.classList.remove('hidden');
    
    if (queueStatusMessage) {
        queueStatusMessage.textContent = message;
        queueStatusMessage.classList.remove('hidden');
    } else if (statusMessage) {
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
    if (progressBarContainer) progressBarContainer.classList.add('hidden');
    if (statusMessage) statusMessage.textContent = "Waiting in queue...";
}

function displayError(message) {
    clearAllMessages();
    if (!errorArea || !errorMessage) return;
    errorMessage.textContent = message;
    errorArea.classList.remove('hidden');
    errorArea.style.animation = 'shake 0.5s ease-in-out';
    setTimeout(() => { errorArea.style.animation = ''; }, 500);
    updateConvertButtonUIState(false); // Reset button on error
}

function displayDownloadLink(url, type) {
    clearAllMessages();
    if (!downloadArea || !downloadLink) return;
    downloadArea.classList.remove('hidden');
    downloadLink.href = url;
    downloadArea.style.transform = 'scale(0.9)';
    downloadArea.style.opacity = '0';
    setTimeout(() => {
        downloadArea.style.transform = 'scale(1)';
        downloadArea.style.opacity = '1';
    }, 100);
    updateConvertButtonUIState(false); // Reset button on completion
}

async function handleConvertClick() {
    if (selectedFiles.length === 0) {
        displayError('Please select at least one Markdown file.');
        return;
    }
    
    clearAllMessages();
    displayStatus('Initiating conversion...', true, 0);
    updateConvertButtonUIState(true); // Set button to working state

    const formData = new FormData();
    selectedFiles.forEach(file => formData.append('markdownFiles', file));
    const selectedMode = document.querySelector('input[name="conversion-mode"]:checked')?.value || 'normal';
    formData.append('mode', selectedMode);

    try {
        const initialResponse = await fetch('/api/convert', { method: 'POST', body: formData });
        if (!initialResponse.ok) {
            const errorData = await initialResponse.json().catch(() => ({ message: 'Failed to initiate conversion.' }));
            throw new Error(errorData.message || `Server error: ${initialResponse.status}`);
        }
        const initialResult = await initialResponse.json();
        if (!initialResult.sessionId) throw new Error('Session ID not received.');

        if (initialResult.queuePosition && initialResult.queuePosition > 0) {
            displayQueueStatus(
                `Request queued. Position: ${initialResult.queuePosition} of ${initialResult.queueLength}.`,
                initialResult.queuePosition, initialResult.queueLength,
                initialResult.estimatedWaitTime || "Calculating..."
            );
        } else {
            displayStatus('Request received. Connecting for updates...', true, 2);
        }
        
        // Connect WebSocket
        wsClient.connect(initialResult.sessionId, {
            showStatus: displayStatus,
            showQueueStatus: displayQueueStatus,
            showError: displayError,
            showDownloadLink: displayDownloadLink,
            onOpen: () => displayStatus('Connected. Processing files...', true, 5),
            onComplete: () => updateConvertButtonUIState(false), // Reset button
            onError: () => updateConvertButtonUIState(false),    // Reset button
            onClose: (wasClean) => {
                console.log('FileUploadUI: WebSocket closed.', wasClean ? 'Cleanly.' : 'Uncleanly.');
                // If not closed cleanly and not already handled by complete/error, reset button
                if(!wasClean && downloadArea.classList.contains('hidden') && errorArea.classList.contains('hidden')) {
                    updateConvertButtonUIState(false);
                }
            }
        });

    } catch (error) {
        console.error('Conversion initiation error:', error);
        displayError(`Error: ${error.message}`);
        updateConvertButtonUIState(false); // Reset button on fetch error
        wsClient.closeConnection(); // Ensure WS is closed if fetch fails
    }
}

function handleResetClick() {
    wsClient.closeConnection();
    if (resetButton) {
        resetButton.style.transform = 'rotate(180deg)';
        setTimeout(() => { resetButton.style.transform = 'rotate(0deg)'; }, 300);
    }
    selectedFiles = [];
    renderFileList();
    updateConvertButtonUIState();
    clearAllMessages();
    const defaultModeRadio = document.querySelector('input[name="conversion-mode"][value="normal"]');
    if (defaultModeRadio) {
        defaultModeRadio.checked = true;
        updateModeVisuals();
    }
    if (fileInput) fileInput.value = '';
}

function addDragAndDropListeners() {
    if (!dropArea) return;
    dropArea.addEventListener('dragover', (event) => {
        event.preventDefault();
        dropArea.classList.add('border-blue-500', 'bg-blue-50/70', 'scale-105');
        dropArea.querySelector('.fa-cloud-upload-alt')?.classList.add('animate-bounce');
    });
    dropArea.addEventListener('dragleave', (event) => {
        if (!dropArea.contains(event.relatedTarget)) {
            dropArea.classList.remove('border-blue-500', 'bg-blue-50/70', 'scale-105');
            dropArea.querySelector('.fa-cloud-upload-alt')?.classList.remove('animate-bounce');
        }
    });
    dropArea.addEventListener('drop', (event) => {
        event.preventDefault();
        dropArea.classList.remove('border-blue-500', 'bg-blue-50/70', 'scale-105');
        dropArea.querySelector('.fa-cloud-upload-alt')?.classList.remove('animate-bounce');
        const files = Array.from(event.dataTransfer.files).filter(f => f.name.endsWith('.md') || f.name.endsWith('.markdown'));
        handleFileSelection(files);
    });
}

function addFileInputListener() {
    if (!fileInput) return;
    fileInput.addEventListener('change', (event) => {
        const files = Array.from(event.target.files).filter(f => f.name.endsWith('.md') || f.name.endsWith('.markdown'));
        handleFileSelection(files);
    });
}

function addGlobalEventListeners() {
    if (convertButton) convertButton.addEventListener('click', handleConvertClick);
    if (resetButton) resetButton.addEventListener('click', handleResetClick);
}

function init() {
    initializeDOMElements();
    if (!dropArea) { // Basic check if critical elements are missing
        console.error("FileUploadUI: Critical DOM elements not found. Aborting initialization.");
        return;
    }
    initializeModeSelection();
    addDragAndDropListeners();
    addFileInputListener();
    addGlobalEventListeners();
    updateConvertButtonUIState(); // Initial state
    renderFileList(); // Initial render (empty)

    // Add CSS for animations (idempotent)
    const styleId = 'fileUploadUI-animations';
    if (!document.getElementById(styleId)) {
        const style = document.createElement('style');
        style.id = styleId;
        style.textContent = `
            @keyframes shake { 0%, 100% { transform: translateX(0); } 25% { transform: translateX(-5px); } 75% { transform: translateX(5px); } }
            .conversion-mode-card { transition: all 0.2s ease-in-out; }
            .conversion-mode-card:hover { transform: translateY(-2px); }
            #file-list li { transition: all 0.2s ease-in-out; }
            #reset-button { transition: transform 0.3s ease-in-out; }
            #download-area { transition: all 0.3s ease-in-out; }`;
        document.head.appendChild(style);
    }
    console.log("FileUploadUI initialized.");
}

export { init };
