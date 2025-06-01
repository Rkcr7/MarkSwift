// main.js - Entry point for frontend JavaScript
import { init as initFileUploadUI } from './modules/fileUploadUI.js';
import { initTabs } from './modules/tabManager.js';
import { liveEditor } from './modules/liveEditor.js';
import SplitPane from './modules/splitPane.js';

document.addEventListener('DOMContentLoaded', () => {
    console.log("DOM fully loaded and parsed. Initializing UI modules...");
    
    // Initialize tab manager first
    initTabs();
    
    // Initialize file upload UI
    initFileUploadUI();
    
    // Initialize live editor
    liveEditor.init();
    
    // Split pane is auto-initialized by its module
    console.log("Split pane module loaded for draggable layout");
    
    console.log("All modules initialized successfully.");
});
