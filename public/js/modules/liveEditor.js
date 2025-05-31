// public/js/modules/liveEditor.js

let previewUpdateTimeout;
const PREVIEW_UPDATE_DELAY = 500; // 500ms debounce

class LiveEditor {
    constructor() {
        this.markdownTextarea = null;
        this.previewPane = null;
        this.isInitialized = false;
        this.lastContent = '';
    }

    init() {
        if (this.isInitialized) {
            console.warn('[LiveEditor] Already initialized');
            return;
        }

        // Get DOM elements
        this.markdownTextarea = document.getElementById('markdown-input');
        this.previewPane = document.getElementById('html-preview-pane');
        this.clearButton = document.getElementById('editor-clear-button');

        if (!this.markdownTextarea || !this.previewPane) {
            console.error('[LiveEditor] Required DOM elements not found');
            return;
        }

        // Set up event listeners
        this.setupEventListeners();
        
        // Load saved content from localStorage
        this.loadSavedContent();

        this.isInitialized = true;
        console.log('[LiveEditor] Initialized successfully');
    }

    setupEventListeners() {
        // Debounced input listener for live preview
        this.markdownTextarea.addEventListener('input', () => {
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
        
        // Don't update if content hasn't changed
        if (content === this.lastContent) {
            return;
        }

        this.lastContent = content;

        // If empty, show placeholder
        if (!content) {
            this.showEmptyPreview();
            return;
        }

        try {
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
            this.displayPreview(data.html);

        } catch (error) {
            console.error('[LiveEditor] Preview update failed:', error);
            this.showPreviewError(error.message);
        }
    }

    displayPreview(html) {
        // Clear any existing content and add the new HTML
        this.previewPane.innerHTML = `<div class="p-3 prose prose-sm max-w-none">${html}</div>`;
    }

    showEmptyPreview() {
        this.previewPane.innerHTML = `
            <div class="p-3 prose prose-sm max-w-none">
                <div class="text-slate-400 text-center py-20">
                    <i class="fas fa-eye text-3xl mb-3 block"></i>
                    <p class="text-sm">Live HTML preview will appear here</p>
                    <p class="text-xs mt-1">Start typing in the editor to see the preview</p>
                </div>
            </div>
        `;
    }

    showPreviewError(errorMessage) {
        this.previewPane.innerHTML = `
            <div class="p-3 prose prose-sm max-w-none">
                <div class="text-red-500 text-center py-20">
                    <i class="fas fa-exclamation-triangle text-3xl mb-3 block"></i>
                    <p class="text-sm font-semibold">Preview Error</p>
                    <p class="text-xs mt-1">${errorMessage}</p>
                    <p class="text-xs mt-2 text-slate-500">Check the console for more details</p>
                </div>
            </div>
        `;
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
