// main.js - Entry point for frontend JavaScript
import { init as initFileUploadUI } from './modules/fileUploadUI.js';
import { initTabs } from './modules/tabManager.js';
import { liveEditor } from './modules/liveEditor.js';

document.addEventListener('DOMContentLoaded', () => {
    console.log("DOM fully loaded and parsed. Initializing UI modules...");
    
    // Initialize tab manager first
    initTabs();
    
    // Initialize file upload UI
    initFileUploadUI();
    
    // Initialize live editor
    liveEditor.init();
    
    console.log("All modules initialized successfully.");
});
