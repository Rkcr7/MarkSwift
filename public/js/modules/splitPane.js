// Split Pane Module - Draggable Resizer for Live Editor
// Provides a draggable interface to resize editor and preview panes

class SplitPane {
    constructor() {
        this.container = null;
        this.leftPane = null;
        this.rightPane = null;
        this.splitter = null;
        this.isDragging = false;
        this.startX = 0;
        this.startY = 0;
        this.startPaneSize = 0; // Used for width or height
        this.containerDimension = 0; // Used for container width or height
        this.isVertical = false; // True if panes are stacked vertically
        
        // Constraints (can be re-interpreted for vertical)
        this.minPaneSize = 100; // Minimum pane width or height (e.g., 100px)
        this.maxPanePercent = 90; // Maximum percentage for the first pane (e.g., 90%)
        this.defaultRatio = 0.45; // Default 45/55 split
        
        this.init();
    }
    
    init() {
        // Wait for DOM to be ready
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', () => this.setupSplitPane());
        } else {
            this.setupSplitPane();
        }
    }
    
    setupSplitPane() {
        this.container = document.querySelector('.split-pane-container');
        this.leftPane = document.querySelector('.split-pane-left');
        this.rightPane = document.querySelector('.split-pane-right');
        this.splitter = document.querySelector('.split-pane-splitter');
        
        if (!this.container || !this.leftPane || !this.rightPane || !this.splitter) {
            console.log('[SplitPane] Elements not found, split pane not initialized');
            return;
        }
        
        this.attachEventListeners();
        this.logMessage('info', '[SplitPane] Draggable split pane initialized with 45/55 default');
    }
    
    attachEventListeners() {
        // Mouse events
        this.splitter.addEventListener('mousedown', (e) => {
            e.preventDefault();
            this.startDrag(e);
        });
        document.addEventListener('mousemove', (e) => {
            if (this.isDragging) {
                e.preventDefault();
            }
            this.onDrag(e);
        });
        document.addEventListener('mouseup', () => this.endDrag());
        
        // Touch events for mobile
        this.splitter.addEventListener('touchstart', (e) => {
            e.preventDefault();
            this.startDrag(e.touches[0]);
        }, { passive: false });
        document.addEventListener('touchmove', (e) => {
            if (this.isDragging) {
                e.preventDefault();
            }
            this.onDrag(e.touches[0]);
        }, { passive: false });
        document.addEventListener('touchend', () => this.endDrag());
        
        // Prevent default drag behavior for the splitter element itself
        this.splitter.addEventListener('dragstart', (e) => e.preventDefault());
        
        // Handle window resize
        window.addEventListener('resize', () => this.handleResize());
    }
    
    startDrag(event) {
        this.isDragging = true;
        
        // Determine orientation based on splitter dimensions or container flex-direction
        // A simple check: if splitter width is much larger than its height, it's horizontal (acting as row resizer)
        if (this.splitter.offsetWidth > this.splitter.offsetHeight * 2) { // Heuristic for horizontal splitter
            this.isVertical = true; // Panes are stacked, splitter is horizontal, drag is vertical
        } else {
            this.isVertical = false; // Panes are side-by-side, splitter is vertical, drag is horizontal
        }

        if (this.isVertical) {
            this.startY = event.clientY;
            this.startPaneSize = this.leftPane.offsetHeight; // Top pane's height
            this.containerDimension = this.container.offsetHeight;
        } else {
            this.startX = event.clientX;
            this.startPaneSize = this.leftPane.offsetWidth; // Left pane's width
            this.containerDimension = this.container.offsetWidth;
        }
        
        // Add dragging class for visual feedback
        this.splitter.classList.add('dragging');
        
        // Prevent text selection during drag
        document.body.classList.add('no-select');
        
        // event.preventDefault(); // Removed: Handled in listener
        
        this.logMessage('info', '[SplitPane] Started dragging');
    }
    
    onDrag(event) { // event here is either MouseEvent or Touch object
        if (!this.isDragging || this.containerDimension === 0) return;

        let newPaneSize;
        if (this.isVertical) {
            const currentY = event.clientY;
            const deltaY = currentY - this.startY;
            newPaneSize = this.startPaneSize + deltaY;
        } else {
            const currentX = event.clientX;
            const deltaX = currentX - this.startX;
            newPaneSize = this.startPaneSize + deltaX;
        }
        
        // Calculate constraints
        const maxPanePx = (this.containerDimension * this.maxPanePercent) / 100;
        // Ensure the second pane (right or bottom) also has minPaneSize
        const minOtherPaneRequired = this.containerDimension - this.minPaneSize; 
        
        // Apply constraints
        let constrainedPaneSize = Math.max(this.minPaneSize, newPaneSize);
        constrainedPaneSize = Math.min(constrainedPaneSize, maxPanePx);
        constrainedPaneSize = Math.min(constrainedPaneSize, minOtherPaneRequired);
        
        // Calculate percentage for CSS
        const panePercent = (constrainedPaneSize / this.containerDimension) * 100;
        
        // Apply the new size
        if (this.isVertical) {
            this.leftPane.style.height = `${panePercent}%`;
            // Right pane (actually bottom pane) will adjust due to flex: 1 on its parent or specific height styles
        } else {
            this.leftPane.style.width = `${panePercent}%`;
            // Right pane will automatically adjust due to flex: 1
        }
    }
    
    endDrag() {
        if (!this.isDragging) return;
        
        this.isDragging = false;
        
        this.splitter.classList.remove('dragging');
        document.body.classList.remove('no-select');
        
        this.saveLayoutPreference();
        
        this.logMessage('info', '[SplitPane] Finished dragging');
    }
    
    handleResize() {
        if (!this.container || !this.leftPane) return;

        // Re-determine orientation as it might change on resize (e.g. CSS media queries)
        if (this.splitter.offsetWidth > this.splitter.offsetHeight * 2) {
            this.isVertical = true;
        } else {
            this.isVertical = false;
        }

        let currentPaneSize, containerDimension, styleProperty;

        if (this.isVertical) {
            currentPaneSize = this.leftPane.offsetHeight;
            containerDimension = this.container.offsetHeight;
            styleProperty = 'height';
        } else {
            currentPaneSize = this.leftPane.offsetWidth;
            containerDimension = this.container.offsetWidth;
            styleProperty = 'width';
        }
        
        if (containerDimension === 0) return; // Avoid division by zero if container not rendered

        const currentPercent = (currentPaneSize / containerDimension) * 100;
        
        const maxAllowedPercent = this.maxPanePercent;
        const minPixelPercent = (this.minPaneSize / containerDimension) * 100;
        // Ensure the "other" pane (right or bottom) also respects minPaneSize
        const maxConstrainedByOtherPane = 100 - ((this.minPaneSize / containerDimension) * 100);

        let newPercent = currentPercent;

        if (currentPercent < minPixelPercent) {
            newPercent = minPixelPercent;
        } else if (currentPercent > maxAllowedPercent) {
            newPercent = maxAllowedPercent;
        }
        // This constraint must be applied after the maxAllowedPercent
        if (newPercent > maxConstrainedByOtherPane) {
             newPercent = maxConstrainedByOtherPane;
        }
        
        // Ensure newPercent is not NaN or Infinity if containerDimension was briefly 0
        if (isFinite(newPercent) && newPercent !== currentPercent) {
             this.leftPane.style[styleProperty] = `${newPercent}%`;
        }
    }
    
    saveLayoutPreference() {
        if (!this.container || !this.leftPane || this.containerDimension === 0) return;
        // Only save preference for horizontal layout for now, or adapt to save orientation-specific
        if (this.isVertical) {
            // Optionally save vertical preference or reset
            // For now, let's log but not save, to avoid 100%/0% issues from logs
            const paneSize = this.leftPane.offsetHeight;
            const ratio = paneSize / this.containerDimension;
            this.logMessage('info', `[SplitPane] Vertical layout ratio (not saved): ${Math.round(ratio * 100)}%/${Math.round((1 - ratio) * 100)}%`);
            return; 
        }

        try {
            const paneSize = this.leftPane.offsetWidth; // Horizontal
            const ratio = paneSize / this.containerDimension;
            
            localStorage.setItem('markswift-split-ratio', ratio.toString());
            this.logMessage('info', `[SplitPane] Saved horizontal layout preference: ${Math.round(ratio * 100)}%/${Math.round((1 - ratio) * 100)}%`);
        } catch (error) {
            this.logMessage('warn', '[SplitPane] Could not save layout preference:', error);
        }
    }
    
    loadLayoutPreference() {
        // Only load for horizontal layout initially
        if (this.splitter.offsetWidth <= this.splitter.offsetHeight * 2) { // If horizontal
            try {
                const savedRatio = localStorage.getItem('markswift-split-ratio');
                if (savedRatio && this.container && this.leftPane) {
                    const ratio = parseFloat(savedRatio);
                    const containerWidth = this.container.offsetWidth;

                    // Adjust ratio validation to match new wider range
                    if (ratio >= 0.1 && ratio <= 0.9 && containerWidth > 0) { 
                        const targetPaneSizePx = containerWidth * ratio;
                        
                        const maxPanePx = (containerWidth * this.maxPanePercent) / 100;
                        const minOtherPaneRequired = containerWidth - this.minPaneSize;
                        
                        let constrainedPaneSize = Math.max(this.minPaneSize, targetPaneSizePx);
                        constrainedPaneSize = Math.min(constrainedPaneSize, maxPanePx);
                        constrainedPaneSize = Math.min(constrainedPaneSize, minOtherPaneRequired);
                        
                        const panePercent = (constrainedPaneSize / containerWidth) * 100;
                        if(isFinite(panePercent)) {
                            this.leftPane.style.width = `${panePercent}%`;
                            this.logMessage('info', `[SplitPane] Loaded horizontal layout preference: ${Math.round(panePercent)}%/${Math.round(100 - panePercent)}%`);
                        }
                    }
                }
            } catch (error) {
                this.logMessage('warn', '[SplitPane] Could not load layout preference:', error);
            }
        } else {
            // For vertical layout, set a default like 50% if no specific logic is added
            if (this.leftPane && this.container && this.container.offsetHeight > 0) {
                 // Check if CSS already set a height, if not, apply 50%
                // Ensure style.height is checked properly, or rely on CSS to set initial 50%
                if (!this.leftPane.style.height || this.leftPane.style.height === '') { 
                    this.leftPane.style.height = '50%'; 
                }
                this.logMessage('info', '[SplitPane] Vertical layout detected, using CSS/default height.');
            }
        } // This closes the main else block for vertical layout check
    } // This closes the loadLayoutPreference method properly
    
    // Reset to default 45/55 split (horizontal) or 50/50 (vertical)
    resetToDefault() {
        if (!this.leftPane || !this.container) return;

        // Determine current orientation to reset correctly
        // This check should be consistent with how isVertical is set elsewhere (e.g., in startDrag or handleResize)
        const currentFlexDirection = window.getComputedStyle(this.container).flexDirection;
        const isCurrentlyVertical = currentFlexDirection === 'column';

        if (isCurrentlyVertical) {
            this.leftPane.style.height = '50%'; // Default for vertical
            this.leftPane.style.width = ''; // Clear width if it was set
            // For vertical, we are not saving preference yet, so no localStorage interaction here.
            this.logMessage('info', '[SplitPane] Reset to default 50%/50% vertical layout');
        } else {
            this.leftPane.style.width = `${this.defaultRatio * 100}%`; // Use defaultRatio for horizontal
            this.leftPane.style.height = ''; // Clear height if it was set
            this.saveLayoutPreference(); // This will save the horizontal preference
            this.logMessage('info', `[SplitPane] Reset to default horizontal layout: ${this.defaultRatio * 100}%`);
        }
        // Trigger a resize or re-check constraints after reset to ensure UI updates.
        // A small delay might be needed if CSS transitions are involved.
        setTimeout(() => this.handleResize(), 0);
    }
    
    // Set specific ratio (0.0 to 1.0)
    setRatio(ratio) {
        if (ratio < 0.2 || ratio > 0.8) {
            this.logMessage('warn', '[SplitPane] Invalid ratio, must be between 0.2 and 0.8');
            return;
        }
        
        if (this.leftPane && this.container) {
            const containerWidth = this.container.offsetWidth;
            const leftWidthPx = containerWidth * ratio;
            
            // Apply constraints
            const maxLeftWidthPx = (containerWidth * this.maxLeftWidth) / 100;
            const minRightWidthRequired = containerWidth - this.minRightWidth;
            
            let constrainedLeftWidth = Math.max(this.minLeftWidth, leftWidthPx);
            constrainedLeftWidth = Math.min(constrainedLeftWidth, maxLeftWidthPx);
            constrainedLeftWidth = Math.min(constrainedLeftWidth, minRightWidthRequired);
            
            const leftWidthPercent = (constrainedLeftWidth / containerWidth) * 100;
            this.leftPane.style.width = `${leftWidthPercent}%`;
            
            this.saveLayoutPreference();
            this.logMessage('info', `[SplitPane] Set ratio to ${Math.round(leftWidthPercent)}%/${Math.round(100 - leftWidthPercent)}%`);
        }
    }
    
    // Utility method for logging (can be overridden)
    logMessage(level, message, ...args) {
        if (window.logMessage) {
            window.logMessage(level, message, ...args);
        } else {
            console.log(`[${level.toUpperCase()}]`, message, ...args);
        }
    }
    
    // Public API
    getAPI() {
        return {
            resetToDefault: () => this.resetToDefault(),
            setRatio: (ratio) => this.setRatio(ratio),
            loadPreference: () => this.loadLayoutPreference(),
            getCurrentRatio: () => {
                if (this.leftPane && this.container) {
                    return this.leftPane.offsetWidth / this.container.offsetWidth;
                }
                return this.defaultRatio; // Return 45% default ratio
            }
        };
    }
}

// Auto-initialize when the module is loaded
const splitPane = new SplitPane();

// Expose API globally for other modules
window.SplitPaneAPI = splitPane.getAPI();

// Load saved preference after a short delay to ensure layout is ready
setTimeout(() => {
    splitPane.loadLayoutPreference();
}, 100);

export default SplitPane;
