// public/js/modules/liveEditor.js

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
        const content = this.cmInstance ? this.cmInstance.getValue().trim() : (this.markdownTextarea ? this.markdownTextarea.value.trim() : '');
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
}

// Create and export instance
const liveEditor = new LiveEditor();

export { liveEditor };
