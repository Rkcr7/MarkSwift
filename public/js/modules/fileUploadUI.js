// fileUploadUI.js
import * as wsClient from './websocketClient.js';

let selectedFiles = [];

// DOM Elements (will be initialized in init)
let dropArea, fileInput, fileListSection, fileList, emptyState, fileCount, convertButton, modeRadios;
let statusArea, queueStatusMessage, estimatedWaitTimeMessage, statusMessage, progressBarContainer, progressBar;
let downloadArea, downloadLink;
// Modal elements
// let mobileFileListTrigger, mobileFileCount, fileListModal, closeModalBtn, modalDoneBtn, modalFileList, modalEmptyState; // Old modal elements
let mobileFab, mobileFabButton, mobileFabCount; // New FAB elements
let mobileFileModal, modalBackdrop, modalContent, modalCloseBtn; // New Modal elements
let newMobileFileList, newMobileEmptyState; // Renamed to avoid conflict if old ones are still somehow referenced before full cleanup

let errorArea, errorMessage;
let resetButton;
let originalButtonContent = ''; // To store original convert button text

function initializeDOMElements() {
    dropArea = document.getElementById('drop-area');
    fileInput = document.getElementById('file-input');
    fileListSection = document.getElementById('file-list-section');
    fileList = document.getElementById('file-list');
    emptyState = document.getElementById('empty-state');
    fileCount = document.getElementById('file-count'); // For desktop
    convertButton = document.getElementById('convert-button');
    modeRadios = document.querySelectorAll('input[name="conversion-mode"]');

    // Mobile modal elements
    // mobileFileListTrigger = document.getElementById('mobile-file-list-trigger'); // Old
    // mobileFileCount = document.getElementById('mobile-file-count'); // Old
    // fileListModal = document.getElementById('file-list-modal'); // Old
    // closeModalBtn = document.getElementById('close-modal-btn'); // Old, but new one has same ID
    // modalDoneBtn = document.getElementById('modal-done-btn'); // Old
    // modalFileList = document.getElementById('modal-file-list'); // Old, but new one has same ID
    // modalEmptyState = document.getElementById('modal-empty-state'); // Old, but new one has same ID

    // New FAB and Modal elements
    mobileFab = document.getElementById('mobile-file-fab');
    mobileFabButton = document.getElementById('mobile-fab-button');
    mobileFabCount = document.getElementById('mobile-fab-count'); // This ID is for the span inside the new FAB

    mobileFileModal = document.getElementById('mobile-file-modal');
    modalBackdrop = document.getElementById('modal-backdrop');
    modalContent = document.getElementById('modal-content');
    modalCloseBtn = document.getElementById('modal-close-btn'); // Same ID as old, ensure it's the new one
    
    newMobileFileList = document.getElementById('mobile-file-list'); // New list in new modal
    newMobileEmptyState = document.getElementById('mobile-empty-state'); // New empty state in new modal


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
    // The selected segment is marked with a single class and styled in CSS.
    // This previously applied a per-mode ring colour (green / orange / red),
    // which implied a safety gradient across three options that only differ in
    // how many files are converted at once.
    document.querySelectorAll('.conversion-mode-card').forEach(option => {
        const radio = option.querySelector('input[type="radio"]');
        if (!radio) return;
        option.classList.toggle('is-selected', radio.checked);
    });
}

function handleFileSelection(files) {
    selectedFiles.push(...files);
    renderFileList();
    updateConvertButtonUIState();
    clearAllMessages();
}

function renderFileList() { // This function now primarily updates the desktop list and the mobile trigger count
    const fileCountText = `${selectedFiles.length} file${selectedFiles.length !== 1 ? 's' : ''}`;

    // Update desktop list
    if (fileList && emptyState && fileCount) {
        if (selectedFiles.length === 0) {
            fileList.classList.add('hidden');
            emptyState.classList.remove('hidden');
            fileCount.classList.add('hidden');
        } else {
            fileList.classList.remove('hidden');
            emptyState.classList.add('hidden');
            fileCount.classList.remove('hidden');
            fileCount.textContent = fileCountText;
            fileList.innerHTML = ''; // Clear only desktop list
            selectedFiles.forEach((file, index) => {
                const listItem = createFileListItem(file, index, false); // false for not in modal
                fileList.appendChild(listItem);
            });
        }
    }

    // Update mobile trigger count (Now FAB count)
    updateMobileFabUI();


    // If modal is open, refresh its content too (New Modal)
    if (mobileFileModal && !mobileFileModal.classList.contains('hidden')) {
        renderNewMobileFileList();
    }
}

function createFileListItem(file, index, isModalContext) { // Added isModalContext
    const listItem = document.createElement('li');
    // Use Tailwind classes for mobile items, or specific .mobile-file-item if defined in CSS
    listItem.className = isModalContext ? 'mobile-file-item' : 'file-row';

    const fileSize = (file.size / 1024).toFixed(1);

    // The static chrome is safe to build as markup. The filename is NOT — it is
    // attacker-controllable in the sense that a file named
    // `"><img src=x onerror=...>.md` used to execute when interpolated into
    // innerHTML here. Filenames are therefore set via textContent/setAttribute
    // below, which cannot introduce markup.
    //
    // The 40px gradient tile that used to sit on every row is gone: a list of
    // Markdown files does not need each entry to announce that it is Markdown.
    listItem.innerHTML = `
        <div class="flex items-baseline gap-2 min-w-0 flex-1">
            <span class="js-file-name file-row-name"></span>
            <span class="js-file-size file-row-meta flex-shrink-0"></span>
        </div>
        <button class="remove-file-btn file-remove" title="Remove file" data-index="${index}">
            <i class="fas fa-xmark text-xs" aria-hidden="true"></i>
            <span class="sr-only">Remove file</span>
        </button>
    `;

    const nameEl = listItem.querySelector('.js-file-name');
    nameEl.textContent = file.name;
    nameEl.setAttribute('title', file.name);
    listItem.querySelector('.js-file-size').textContent = `${fileSize} KB`;

    listItem.querySelector('.remove-file-btn').addEventListener('click', (e) => {
        e.stopPropagation();
        removeFileFromList(index); // No need for isModalContext here if removeFileFromList handles both
    });
    return listItem;
}

// New function for FAB
function updateMobileFabUI() {
    if (!mobileFab || !mobileFabCount) return;
    
    if (selectedFiles.length > 0) {
        mobileFabCount.textContent = `${selectedFiles.length} file${selectedFiles.length !== 1 ? 's' : ''}`;
        mobileFab.classList.remove('hidden');
        mobileFab.classList.add('show'); // For animation
        mobileFab.classList.remove('hide');
    } else {
        mobileFab.classList.add('hide');
        mobileFab.classList.remove('show');
        // Wait for animation to finish before truly hiding
        setTimeout(() => {
            if (selectedFiles.length === 0) { // Check again in case files were added back quickly
                mobileFab.classList.add('hidden');
            }
        }, 300); // Match fab-scale-out animation duration
    }
}

// New function to render files in the new mobile modal
function renderNewMobileFileList() {
    if (!newMobileFileList || !newMobileEmptyState) {
        console.error("New mobile list or empty state elements not found for rendering.");
        return;
    }

    newMobileFileList.innerHTML = ''; // Clear existing items

    if (selectedFiles.length === 0) {
        newMobileFileList.style.display = 'none';
        newMobileEmptyState.style.display = 'flex'; // Use flex for centering
    } else {
        newMobileFileList.style.display = 'block'; // Or 'flex' if items are flex column
        newMobileEmptyState.style.display = 'none';
        selectedFiles.forEach((file, index) => {
            const listItem = createFileListItem(file, index, true); // true for modal context
            newMobileFileList.appendChild(listItem);
        });
    }
}

// New function to open the new mobile modal
function openNewMobileModal() {
    if (!mobileFileModal || !modalContent) return;
    
    renderNewMobileFileList(); // Populate list before showing
    mobileFileModal.classList.remove('hidden');
    
    // Add 'show' class to trigger backdrop fade-in (if CSS is set up for it)
    // and prepare content for slide-up
    mobileFileModal.classList.add('show'); 

    // Trigger slide-up animation for modal content
    setTimeout(() => { // Timeout ensures display:block is applied before transform
        modalContent.classList.remove('translate-y-full');
        // modalContent.classList.add('modal-slide-up'); // If using CSS animation class
    }, 10); // Small delay
    document.body.classList.add('overflow-hidden'); 
}

// New function to close the new mobile modal
function closeNewMobileModal() {
    if (!mobileFileModal || !modalContent) return;

    modalContent.classList.add('translate-y-full');
    // modalContent.classList.remove('modal-slide-up');
    // modalContent.classList.add('modal-slide-down'); // If using CSS animation class
    
    setTimeout(() => {
        mobileFileModal.classList.add('hidden');
        mobileFileModal.classList.remove('show'); // Hide backdrop
        // modalContent.classList.remove('modal-slide-down'); // Clean up animation class
    }, 300); // Match transition duration from HTML/CSS
    document.body.classList.remove('overflow-hidden');
}

function removeFileFromList(index) { // Removed isModalContext, function will update all relevant views
    selectedFiles.splice(index, 1);
    renderFileList(); // This updates desktop list and calls updateMobileFabUI
                      // and renderNewMobileFileList if modal is open.
    updateConvertButtonUIState();
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
    // The reset button used to spin 180 degrees on click. Decorative motion on a
    // destructive-ish action draws the eye to the control instead of to the
    // list that just emptied.
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

    // One state class, styled in CSS. This used to toggle hardcoded colour
    // utilities plus a scale-up on the zone and a looping bounce animation on
    // the icon, so the drop target grew and jumped during a drag - motion
    // competing with the thing the user is actually aiming at.
    const setDragState = (active) => dropArea.classList.toggle('is-dragover', active);

    dropArea.addEventListener('dragover', (event) => {
        event.preventDefault();
        setDragState(true);
    });
    dropArea.addEventListener('dragleave', (event) => {
        if (!dropArea.contains(event.relatedTarget)) setDragState(false);
    });
    dropArea.addEventListener('drop', (event) => {
        event.preventDefault();
        setDragState(false);
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
    // New Mobile Modal Listeners
    if (mobileFabButton) {
        mobileFabButton.addEventListener('click', openNewMobileModal);
    }
    if (modalCloseBtn) { // Ensure this is the new modal's close button
        modalCloseBtn.addEventListener('click', closeNewMobileModal);
    }
    if (modalBackdrop) {
        modalBackdrop.addEventListener('click', closeNewMobileModal);
    }
    // Add Escape key listener for the new modal
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && mobileFileModal && !mobileFileModal.classList.contains('hidden')) {
            closeNewMobileModal();
        }
    });

    updateConvertButtonUIState(); // Initial state
    renderFileList(); // Initial render 
    updateMobileFabUI(); // Initialize FAB state

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
