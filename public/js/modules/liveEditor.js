// public/js/modules/liveEditor.js
import { connect as websocketConnect } from './websocketClient.js';

let previewUpdateTimeout;
const PREVIEW_UPDATE_DELAY = 100; // 500ms debounce

class LiveEditor {
    constructor() {
        this.markdownTextarea = null; // Will be the original textarea, CodeMirror hides it
        this.cmInstance = null; // To store the CodeMirror instance
        this.documentContainer = null;
        this.themeSelector = null; // To store the theme selector element
        this.isInitialized = false;
        this.lastContent = '';
        this.currentTheme = 'neat'; // Default theme updated to 'neat'

        // Elements for PDF conversion UI
        this.convertPdfButton = null;
        this.editorStatusArea = null;
        this.editorStatusMessage = null;
        this.editorProgressBarContainer = null;
        this.editorProgressBar = null;
        this.editorDownloadArea = null;
        this.editorDownloadLink = null;
        this.editorErrorArea = null;
        this.editorErrorMessage = null;
    }

    init() {
        if (this.isInitialized) {
            console.warn('[LiveEditor] Already initialized');
            return;
        }

        // Get DOM elements with correct IDs from our HTML
        this.markdownTextarea = document.getElementById('markdown-input'); // Keep ref to original
        this.documentContainer = document.getElementById('pdf-preview-container');
        this.clearButton = document.getElementById('editor-clear-button');
        this.themeSelector = document.getElementById('theme-selector');

        // PDF Conversion UI Elements
        this.convertPdfButton = document.getElementById('editor-convert-pdf-button');
        this.editorStatusArea = document.getElementById('editor-status-area');
        this.editorStatusMessage = document.getElementById('editor-status-message');
        this.editorProgressBarContainer = document.getElementById('editor-progress-bar-container');
        this.editorProgressBar = document.getElementById('editor-progress-bar');
        this.editorDownloadArea = document.getElementById('editor-download-area');
        this.editorDownloadLink = document.getElementById('editor-download-link');
        this.editorErrorArea = document.getElementById('editor-error-area');
        this.editorErrorMessage = document.getElementById('editor-error-message');


        if (!this.markdownTextarea) {
            console.error('[LiveEditor] markdown-input element not found for CodeMirror');
            return;
        }

        // Load saved theme first, so CM initializes with it
        this.loadTheme();

        // Initialize CodeMirror from the textarea
        if (typeof CodeMirror !== 'undefined') {
            this.cmInstance = CodeMirror.fromTextArea(this.markdownTextarea, {
                mode: 'markdown',
                theme: this.currentTheme, // Use loaded or default theme
                lineNumbers: true,
                lineWrapping: true,
                // You can add more CodeMirror options here:
                // extraKeys: {"Enter": "newlineAndIndentContinueMarkdownList"} // For auto-list continuation
            });
            console.log(`[LiveEditor] CodeMirror initialized with theme: ${this.currentTheme}`);
            
            // Set placeholder if available
            if (this.markdownTextarea.placeholder) {
                // CodeMirror's own placeholder option is usually better if the theme supports it well.
                // Forcing via innerHTML can sometimes be overridden by theme CSS.
                // Check if CM instance has a placeholder option or set it directly
                if (this.cmInstance.options && this.cmInstance.options.placeholder !== undefined) {
                    this.cmInstance.setOption("placeholder", this.markdownTextarea.placeholder);
                } else if (this.cmInstance.display.placeholder) { // Fallback for older/different CM versions
                    this.cmInstance.display.placeholder.innerHTML = this.markdownTextarea.placeholder.replace(/\n/g, '<br>');
                }
            }
            
            // Update the theme selector dropdown to reflect the current theme
            if (this.themeSelector) {
                this.themeSelector.value = this.currentTheme;
            }

        } else {
            console.error('[LiveEditor] CodeMirror library not loaded. Ensure it is included in your HTML.');
            // Fallback to plain textarea if CodeMirror is not available
            // This part can be removed if CodeMirror is a hard dependency
        }

        if (!this.documentContainer) {
            console.error('[LiveEditor] pdf-preview-container element not found');
            return;
        }

        console.log('[LiveEditor] Found all required DOM elements');

        // Set up event listeners
        this.setupEventListeners();
        
        // Load saved content from localStorage
        this.loadSavedContent(); // This will also trigger a preview update if content exists

        this.isInitialized = true;
        console.log('[LiveEditor] Initialized successfully with improved layout');
    }

    setupEventListeners() {
        // Debounced input listener for live preview using CodeMirror's 'change' event
        if (this.cmInstance) {
            this.cmInstance.on('change', () => {
                console.log('[LiveEditor] CodeMirror content changed, updating preview...');
                this.debouncedPreviewUpdate();
                this.saveContentToLocalStorage();
            });
        } else if (this.markdownTextarea) { // Fallback if CM failed
            this.markdownTextarea.addEventListener('input', () => {
                console.log('[LiveEditor] Textarea input detected, updating preview...');
                this.debouncedPreviewUpdate();
                this.saveContentToLocalStorage();
            });
        }

        // Clear button
        if (this.clearButton) {
            this.clearButton.addEventListener('click', () => {
                this.clearEditor();
            });
        }

        // Theme selector listener
        if (this.themeSelector) {
            this.themeSelector.addEventListener('change', (event) => {
                this.setTheme(event.target.value);
            });
        }

        // PDF Convert Button
        if (this.convertPdfButton) {
            this.convertPdfButton.addEventListener('click', () => {
                this.handlePdfConversionRequest();
            });
        } else {
            console.warn('[LiveEditor] editor-convert-pdf-button not found.');
        }

        // Handle tab switching to initialize editor when Live Editor tab is activated
        document.addEventListener('click', (e) => {
            if (e.target.matches('[data-tab-target="#liveEditorTab"]')) {
                console.log('[LiveEditor] Live Editor tab activated');
                // Small delay to ensure tab is switched before initializing
                setTimeout(() => {
                    this.onTabActivated();
                }, 50);
            }
        });
    }

    debouncedPreviewUpdate() {
        clearTimeout(previewUpdateTimeout);
        previewUpdateTimeout = setTimeout(() => {
            this.updatePreview();
        }, PREVIEW_UPDATE_DELAY);
    }

    async updatePreview() {
        const markdownText = this.cmInstance ? this.cmInstance.getValue() : (this.markdownTextarea ? this.markdownTextarea.value : '');
        // No trim() here, let marked.js handle leading/trailing whitespace as it would on server
        
        console.log('[LiveEditor] Updating preview with content length:', markdownText.length);
        
        // Don't update if content hasn't changed (check raw content)
        if (markdownText === this.lastContent) {
            console.log('[LiveEditor] Content unchanged, skipping update');
            return;
        }

        this.lastContent = markdownText;

        // If empty, show placeholder
        if (!markdownText.trim()) { // Trim only for the empty check
            console.log('[LiveEditor] Empty content, showing placeholder');
            this.showEmptyPreview();
            return;
        }

        try {
            if (typeof marked === 'undefined' || typeof DOMPurify === 'undefined') {
                console.error('[LiveEditor] marked.js or DOMPurify is not loaded.');
                this.showPreviewError('Client-side Markdown processor not available.');
                return;
            }

            console.log('[LiveEditor] Converting Markdown on client-side...');
            // Same options as backend's previewService.js
            const markedOptions = { headerIds: false, mangle: false };
            const rawHtml = marked.parse(markdownText, markedOptions);
            
            // Sanitize HTML (ensure DOMPurify is available globally or imported)
            const sanitizedHtml = DOMPurify.sanitize(rawHtml);
            
            // Wrap with the preview-content class for styling
            const finalHtml = `<div class="preview-content">${sanitizedHtml}</div>`;
            
            this.displayPreview(finalHtml);

        } catch (error) {
            console.error('[LiveEditor] Client-side preview update failed:', error);
            this.showPreviewError(error.message || 'Failed to render Markdown preview.');
        }
    }

    displayPreview(html) {
        console.log('[LiveEditor] Displaying client-rendered preview HTML');
        if (this.documentContainer) {
            this.documentContainer.innerHTML = html;
        } else {
            console.error('[LiveEditor] Document container not found during display');
        }
    }

    showEmptyPreview() {
        if (this.documentContainer) {
            this.documentContainer.innerHTML = `
                <div class="flex items-center justify-center h-96 text-slate-400">
                    <div class="text-center">
                        <i class="fas fa-file-text text-5xl mb-6 block text-slate-300"></i>
                        <h3 class="text-lg font-semibold mb-2 text-slate-600">PDF Preview</h3>
                        <p class="text-sm mb-1">Your document will appear here</p>
                        <p class="text-xs text-slate-400">Start typing in the editor to see the magic ✨</p>
                    </div>
                </div>
            `;
        }
    }

    showPreviewError(errorMessage) {
        if (this.documentContainer) {
            this.documentContainer.innerHTML = `
                <div class="flex items-center justify-center h-96 text-red-500">
                    <div class="text-center">
                        <i class="fas fa-exclamation-triangle text-5xl mb-6 block"></i>
                        <h3 class="text-lg font-semibold mb-2 text-red-600">Preview Error</h3>
                        <p class="text-sm mb-1">${errorMessage}</p>
                        <p class="text-xs mt-2 text-slate-500">Check the console for more details</p>
                    </div>
                </div>
            `;
        }
    }

    clearEditor() {
        if (confirm('Are you sure you want to clear the editor? This cannot be undone.')) {
            if (this.cmInstance) {
                this.cmInstance.setValue('');
            } else if (this.markdownTextarea) {
                this.markdownTextarea.value = '';
            }
            this.lastContent = ''; // setValue will trigger change, updating this, but good to be explicit
            this.showEmptyPreview();
            this.clearLocalStorage();
            if (this.cmInstance) {
                this.cmInstance.focus();
            } else if (this.markdownTextarea) {
                this.markdownTextarea.focus();
            }
        }
    }

    saveContentToLocalStorage() {
        try {
            const contentToSave = this.cmInstance ? this.cmInstance.getValue() : (this.markdownTextarea ? this.markdownTextarea.value : '');
            localStorage.setItem('markswift-editor-content', contentToSave);
        } catch (error) {
            console.warn('[LiveEditor] Failed to save to localStorage:', error);
        }
    }

    loadSavedContent() {
        try {
            const savedContent = localStorage.getItem('markswift-editor-content');
            if (savedContent) {
                if (this.cmInstance) {
                    this.cmInstance.setValue(savedContent);
                    // CodeMirror's setValue will trigger the 'change' event,
                    // which calls debouncedPreviewUpdate and saveContentToLocalStorage.
                    // lastContent will be updated by updatePreview.
                } else if (this.markdownTextarea) {
                    this.markdownTextarea.value = savedContent;
                    this.lastContent = savedContent; // Manual update for textarea
                    this.updatePreview(); // Manual update for textarea
                }
                console.log('[LiveEditor] Loaded saved content from localStorage');
            }
        } catch (error) {
            console.warn('[LiveEditor] Failed to load from localStorage:', error);
        }
    }

    clearLocalStorage() {
        try {
            localStorage.removeItem('markswift-editor-content');
        } catch (error) {
            console.warn('[LiveEditor] Failed to clear localStorage for content:', error);
        }
    }

    setTheme(themeName) {
        if (this.cmInstance) {
            this.cmInstance.setOption('theme', themeName);
            this.currentTheme = themeName;
            this.saveTheme();
            console.log(`[LiveEditor] Theme changed to: ${themeName}`);
        }
    }

    saveTheme() {
        try {
            localStorage.setItem('markswift-editor-theme', this.currentTheme);
        } catch (error) {
            console.warn('[LiveEditor] Failed to save theme to localStorage:', error);
        }
    }

    loadTheme() {
        try {
            const savedTheme = localStorage.getItem('markswift-editor-theme');
            if (savedTheme) {
                this.currentTheme = savedTheme;
                console.log(`[LiveEditor] Loaded theme from localStorage: ${savedTheme}`);
            }
            // If themeSelector exists, update its value. This is also done after CM init.
            if (this.themeSelector) {
                this.themeSelector.value = this.currentTheme;
            }
        } catch (error) {
            console.warn('[LiveEditor] Failed to load theme from localStorage:', error);
            this.currentTheme = 'neat'; // Fallback to default, now 'neat'
        }
    }

    onTabActivated() {
        // Focus the editor when tab is activated
        if (this.cmInstance) {
            this.cmInstance.focus();
            this.cmInstance.refresh(); // Refresh CodeMirror when it becomes visible
            console.log('[LiveEditor] CodeMirror focused and refreshed on tab activation.');
        } else if (this.markdownTextarea) {
            this.markdownTextarea.focus();
        }
        // Re-initialize if needed (though init should ideally be called once)
        if (!this.isInitialized) {
            console.log('[LiveEditor] Re-initializing on tab activation because not initialized.');
            this.init();
        } else if (this.cmInstance && !this.cmInstance.getWrapperElement().offsetParent) {
            // This case might happen if CM was initialized while hidden and needs a refresh
            // or if init logic needs to be more robust for deferred initialization.
            console.log('[LiveEditor] CodeMirror might need re-initialization or refresh.');
            // Potentially re-run parts of init or just refresh
            this.cmInstance.refresh();
        }
    }

    // Public method to get current content
    getContent() {
        return this.cmInstance ? this.cmInstance.getValue() : (this.markdownTextarea ? this.markdownTextarea.value : '');
    }

    // Public method to set content
    setContent(content) {
        if (this.cmInstance) {
            this.cmInstance.setValue(content);
            // As with loadSavedContent, setValue will trigger 'change' event
            // which handles preview update and localStorage saving.
        } else if (this.markdownTextarea) {
            this.markdownTextarea.value = content;
            this.lastContent = content;
            this.updatePreview();
            this.saveContentToLocalStorage();
        }
    }

    // --- PDF Conversion Methods ---
    async handlePdfConversionRequest() {
        if (!this.cmInstance) {
            this.displayEditorError('Editor not initialized.');
            return;
        }
        const markdownText = this.getContent();
        if (!markdownText.trim()) {
            this.displayEditorError('Cannot convert empty content.');
            // Or show a more gentle message in status area
            // this.displayEditorStatus('Content is empty. Type some Markdown to convert.', false);
            return;
        }

        this.displayEditorStatus('Preparing PDF conversion...', false);
        this.convertPdfButton.disabled = true;

        try {
            const response = await fetch('/api/editor/convert-pdf', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ markdownText }), // mode defaults to 'normal' on backend
            });

            const result = await response.json();

            if (!response.ok) {
                throw new Error(result.message || `Server error: ${response.status}`);
            }

            this.displayEditorStatus(`Request queued (Job ID: ${result.jobId}). Connecting for updates...`, false);
            console.log(`[LiveEditor] PDF conversion request successful. SessionID: ${result.sessionId}, JobID: ${result.jobId}`);
            
            // Connect WebSocket for progress updates
            websocketConnect(result.sessionId, this.getEditorUiCallbacks());

        } catch (error) {
            console.error('[LiveEditor] PDF conversion request failed:', error);
            this.displayEditorError(error.message || 'Failed to start PDF conversion.');
            this.convertPdfButton.disabled = false;
        }
    }

    getEditorUiCallbacks() {
        return {
            showStatus: (message, showProgress, progressPercent) => {
                this.displayEditorStatus(message, showProgress, progressPercent);
            },
            showQueueStatus: (message, queuePosition, queueLength, estimatedWaitTime, estimatedWaitTimeMs) => {
                const fullMessage = `${message} Est. wait: ${estimatedWaitTime || 'N/A'}`;
                this.displayEditorStatus(fullMessage, false);
            },
            showError: (errorMessage) => {
                this.displayEditorError(errorMessage);
                this.convertPdfButton.disabled = false;
            },
            showDownloadLink: (downloadUrl, downloadType) => {
                this.displayEditorDownload(downloadUrl, downloadType);
                this.convertPdfButton.disabled = false;
            },
            onOpen: () => {
                this.displayEditorStatus('Connected for real-time PDF progress.', false);
            },
            onClose: (wasClean) => {
                // If download or error isn't shown, means it closed unexpectedly or before completion
                if (this.editorDownloadArea.classList.contains('hidden') && this.editorErrorArea.classList.contains('hidden')) {
                    this.displayEditorStatus('PDF progress connection closed.', false);
                }
                this.convertPdfButton.disabled = false; // Re-enable button on close if not completed
            },
            onComplete: () => { // Callback from websocketClient when 'complete' message is processed
                this.convertPdfButton.disabled = false;
            },
            onError: () => { // Callback from websocketClient for WS errors or 'error' message
                this.convertPdfButton.disabled = false;
            }
        };
    }

    // Helper UI functions
    _hideAllStatusAreas() {
        if(this.editorStatusArea) this.editorStatusArea.classList.add('hidden');
        if(this.editorErrorArea) this.editorErrorArea.classList.add('hidden');
        if(this.editorDownloadArea) this.editorDownloadArea.classList.add('hidden');
        if(this.editorProgressBarContainer) this.editorProgressBarContainer.classList.add('hidden');
    }

    displayEditorStatus(message, showProgress = false, progressPercent = 0) {
        this._hideAllStatusAreas();
        if (!this.editorStatusArea || !this.editorStatusMessage) return;

        this.editorStatusArea.classList.remove('hidden');
        this.editorStatusMessage.textContent = message;

        if (showProgress && this.editorProgressBarContainer && this.editorProgressBar) {
            this.editorProgressBarContainer.classList.remove('hidden');
            this.editorProgressBar.style.width = `${progressPercent}%`;
        } else if (this.editorProgressBarContainer) {
            this.editorProgressBarContainer.classList.add('hidden');
        }
    }

    displayEditorError(errorMessage) {
        this._hideAllStatusAreas();
        if (!this.editorErrorArea || !this.editorErrorMessage) return;

        this.editorErrorArea.classList.remove('hidden');
        this.editorErrorMessage.textContent = errorMessage;
    }

    displayEditorDownload(downloadUrl, downloadType) {
        this._hideAllStatusAreas();
        if (!this.editorDownloadArea || !this.editorDownloadLink) return;

        this.editorDownloadArea.classList.remove('hidden');
        this.editorDownloadLink.href = downloadUrl;
        this.editorDownloadLink.textContent = `Download ${downloadType ? downloadType.toUpperCase() : 'PDF'}`;
        // Optional: auto-click
        // this.editorDownloadLink.click(); 
    }
}

// Create and export instance
const liveEditor = new LiveEditor();

export { liveEditor };
