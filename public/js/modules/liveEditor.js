// public/js/modules/liveEditor.js

let previewUpdateTimeout;
const PREVIEW_UPDATE_DELAY = 500; // 500ms debounce

class LiveEditor {
    constructor() {
        this.markdownTextarea = null;
        this.documentContainer = null;
        this.isInitialized = false;
        this.lastContent = '';
    }

    init() {
        if (this.isInitialized) {
            console.warn('[LiveEditor] Already initialized');
            return;
        }

        // Get DOM elements with correct IDs from our HTML
        this.markdownTextarea = document.getElementById('markdown-input');
        this.documentContainer = document.getElementById('pdf-preview-container');
        this.clearButton = document.getElementById('editor-clear-button');

        if (!this.markdownTextarea) {
            console.error('[LiveEditor] markdown-input element not found');
            return;
        }

        if (!this.documentContainer) {
            console.error('[LiveEditor] pdf-preview-container element not found');
            return;
        }

        console.log('[LiveEditor] Found all required DOM elements');

        // Set up event listeners
        this.setupEventListeners();
        
        // Load saved content from localStorage
        this.loadSavedContent();

        this.isInitialized = true;
        console.log('[LiveEditor] Initialized successfully with improved layout');
    }

    setupEventListeners() {
        // Debounced input listener for live preview
        this.markdownTextarea.addEventListener('input', () => {
            console.log('[LiveEditor] Input detected, updating preview...');
            this.debouncedPreviewUpdate();
            this.saveContentToLocalStorage();
        });

        // Clear button
        if (this.clearButton) {
            this.clearButton.addEventListener('click', () => {
                this.clearEditor();
            });
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
        const content = this.markdownTextarea.value.trim();
        console.log('[LiveEditor] Updating preview with content length:', content.length);
        
        // Don't update if content hasn't changed
        if (content === this.lastContent) {
            console.log('[LiveEditor] Content unchanged, skipping update');
            return;
        }

        this.lastContent = content;

        // If empty, show placeholder
        if (!content) {
            console.log('[LiveEditor] Empty content, showing placeholder');
            this.showEmptyPreview();
            return;
        }

        try {
            console.log('[LiveEditor] Sending preview request to server...');
            const response = await fetch('/api/editor/preview-html', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ markdownText: content })
            });

            if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }

            const data = await response.json();
            console.log('[LiveEditor] Received preview HTML from server');
            this.displayPreview(data.html);

        } catch (error) {
            console.error('[LiveEditor] Preview update failed:', error);
            this.showPreviewError(error.message);
        }
    }

    displayPreview(html) {
        console.log('[LiveEditor] Displaying preview HTML');
        // Display the HTML content in the professional document container
        if (this.documentContainer) {
            // The HTML from the API already includes proper styling and padding
            // We just need to display it in our document container
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
            this.markdownTextarea.value = '';
            this.lastContent = '';
            this.showEmptyPreview();
            this.clearLocalStorage();
            this.markdownTextarea.focus();
        }
    }

    saveContentToLocalStorage() {
        try {
            localStorage.setItem('markswift-editor-content', this.markdownTextarea.value);
        } catch (error) {
            console.warn('[LiveEditor] Failed to save to localStorage:', error);
        }
    }

    loadSavedContent() {
        try {
            const savedContent = localStorage.getItem('markswift-editor-content');
            if (savedContent) {
                this.markdownTextarea.value = savedContent;
                this.lastContent = savedContent;
                console.log('[LiveEditor] Loaded saved content from localStorage');
                // Update preview with saved content
                this.updatePreview();
            }
        } catch (error) {
            console.warn('[LiveEditor] Failed to load from localStorage:', error);
        }
    }

    clearLocalStorage() {
        try {
            localStorage.removeItem('markswift-editor-content');
        } catch (error) {
            console.warn('[LiveEditor] Failed to clear localStorage:', error);
        }
    }

    onTabActivated() {
        // Focus the editor when tab is activated
        if (this.markdownTextarea) {
            this.markdownTextarea.focus();
        }
        // Re-initialize if needed
        if (!this.isInitialized) {
            this.init();
        }
    }

    // Public method to get current content
    getContent() {
        return this.markdownTextarea ? this.markdownTextarea.value : '';
    }

    // Public method to set content
    setContent(content) {
        if (this.markdownTextarea) {
            this.markdownTextarea.value = content;
            this.lastContent = content;
            this.updatePreview();
            this.saveContentToLocalStorage();
        }
    }
}

// Create and export instance
const liveEditor = new LiveEditor();

export { liveEditor };
