// main.js - Entry point for frontend JavaScript
import { init as initFileUploadUI } from './modules/fileUploadUI.js';
import { initTabs } from './modules/tabManager.js';

document.addEventListener('DOMContentLoaded', () => {
    console.log("DOM fully loaded and parsed. Initializing UI modules...");
    initTabs();
    initFileUploadUI(); // FileUploadUI might depend on tab structure being initialized if it interacts with elements across tabs
});
