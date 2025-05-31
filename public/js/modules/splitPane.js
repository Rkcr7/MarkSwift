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
        this.startLeftWidth = 0;
        this.containerWidth = 0;
        
        // Constraints
        this.minLeftWidth = 300; // Minimum editor width (300px)
        this.minRightWidth = 300; // Minimum preview width (300px)
        this.maxLeftWidth = 70; // Maximum editor width (70% of container)
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
        this.splitter.addEventListener('mousedown', (e) => this.startDrag(e));
        document.addEventListener('mousemove', (e) => this.onDrag(e));
        document.addEventListener('mouseup', () => this.endDrag());
        
        // Touch events for mobile
        this.splitter.addEventListener('touchstart', (e) => this.startDrag(e.touches[0]));
        document.addEventListener('touchmove', (e) => this.onDrag(e.touches[0]));
        document.addEventListener('touchend', () => this.endDrag());
        
        // Prevent default drag behavior
        this.splitter.addEventListener('dragstart', (e) => e.preventDefault());
        
        // Handle window resize
        window.addEventListener('resize', () => this.handleResize());
    }
    
    startDrag(event) {
        this.isDragging = true;
        this.startX = event.clientX;
        this.containerWidth = this.container.offsetWidth;
        this.startLeftWidth = this.leftPane.offsetWidth;
        
        // Add dragging class for visual feedback
        this.splitter.classList.add('dragging');
        
        // Prevent text selection during drag
        document.body.classList.add('no-select');
        
        // Prevent default to avoid text selection
        event.preventDefault();
        
        this.logMessage('info', '[SplitPane] Started dragging');
    }
    
    onDrag(event) {
        if (!this.isDragging) return;
        
        const currentX = event.clientX;
        const deltaX = currentX - this.startX;
        const newLeftWidth = this.startLeftWidth + deltaX;
        
        // Calculate constraints
        const maxLeftWidthPx = (this.containerWidth * this.maxLeftWidth) / 100;
        const minRightWidthRequired = this.containerWidth - this.minRightWidth;
        
        // Apply constraints
        let constrainedLeftWidth = Math.max(this.minLeftWidth, newLeftWidth);
        constrainedLeftWidth = Math.min(constrainedLeftWidth, maxLeftWidthPx);
        constrainedLeftWidth = Math.min(constrainedLeftWidth, minRightWidthRequired);
        
        // Calculate percentage for CSS
        const leftWidthPercent = (constrainedLeftWidth / this.containerWidth) * 100;
        
        // Apply the new width
        this.leftPane.style.width = `${leftWidthPercent}%`;
        
        // The right pane will automatically adjust due to flex: 1
        
        event.preventDefault();
    }
    
    endDrag() {
        if (!this.isDragging) return;
        
        this.isDragging = false;
        
        // Remove dragging class
        this.splitter.classList.remove('dragging');
        
        // Re-enable text selection
        document.body.classList.remove('no-select');
        
        // Save the current layout preference
        this.saveLayoutPreference();
        
        this.logMessage('info', '[SplitPane] Finished dragging');
    }
    
    handleResize() {
        // Ensure constraints are maintained on window resize
        if (!this.container || !this.leftPane) return;
        
        const currentLeftWidth = this.leftPane.offsetWidth;
        const newContainerWidth = this.container.offsetWidth;
        const currentLeftPercent = (currentLeftWidth / newContainerWidth) * 100;
        
        // Check if current width violates constraints
        const maxLeftWidthPercent = this.maxLeftWidth;
        const minLeftWidthPercent = (this.minLeftWidth / newContainerWidth) * 100;
        const minRightWidthPercent = (this.minRightWidth / newContainerWidth) * 100;
        const maxAllowedLeftPercent = 100 - minRightWidthPercent;
        
        let newLeftPercent = currentLeftPercent;
        
        if (currentLeftPercent < minLeftWidthPercent) {
            newLeftPercent = minLeftWidthPercent;
        } else if (currentLeftPercent > maxLeftWidthPercent) {
            newLeftPercent = maxLeftWidthPercent;
        } else if (currentLeftPercent > maxAllowedLeftPercent) {
            newLeftPercent = maxAllowedLeftPercent;
        }
        
        if (newLeftPercent !== currentLeftPercent) {
            this.leftPane.style.width = `${newLeftPercent}%`;
        }
    }
    
    saveLayoutPreference() {
        // Save the current split ratio to localStorage
        try {
            const leftWidth = this.leftPane.offsetWidth;
            const containerWidth = this.container.offsetWidth;
            const ratio = leftWidth / containerWidth;
            
            localStorage.setItem('markswift-split-ratio', ratio.toString());
            this.logMessage('info', `[SplitPane] Saved layout preference: ${Math.round(ratio * 100)}%/${Math.round((1 - ratio) * 100)}%`);
        } catch (error) {
            this.logMessage('warn', '[SplitPane] Could not save layout preference:', error);
        }
    }
    
    loadLayoutPreference() {
        // Load and apply saved split ratio from localStorage
        try {
            const savedRatio = localStorage.getItem('markswift-split-ratio');
            if (savedRatio && this.container && this.leftPane) {
                const ratio = parseFloat(savedRatio);
                
                // Validate the ratio is reasonable
                if (ratio >= 0.2 && ratio <= 0.8) {
                    const containerWidth = this.container.offsetWidth;
                    const leftWidthPx = containerWidth * ratio;
                    
                    // Check constraints
                    const maxLeftWidthPx = (containerWidth * this.maxLeftWidth) / 100;
                    const minRightWidthRequired = containerWidth - this.minRightWidth;
                    
                    let constrainedLeftWidth = Math.max(this.minLeftWidth, leftWidthPx);
                    constrainedLeftWidth = Math.min(constrainedLeftWidth, maxLeftWidthPx);
                    constrainedLeftWidth = Math.min(constrainedLeftWidth, minRightWidthRequired);
                    
                    const leftWidthPercent = (constrainedLeftWidth / containerWidth) * 100;
                    this.leftPane.style.width = `${leftWidthPercent}%`;
                    
                    this.logMessage('info', `[SplitPane] Loaded layout preference: ${Math.round(leftWidthPercent)}%/${Math.round(100 - leftWidthPercent)}%`);
                }
            }
        } catch (error) {
            this.logMessage('warn', '[SplitPane] Could not load layout preference:', error);
        }
    }
    
    // Reset to default 45/55 split
    resetToDefault() {
        if (this.leftPane) {
            this.leftPane.style.width = '45%';
            this.saveLayoutPreference();
            this.logMessage('info', '[SplitPane] Reset to default 45/55 layout');
        }
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
