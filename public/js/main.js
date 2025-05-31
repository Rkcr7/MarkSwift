// main.js - Entry point for frontend JavaScript
import { init as initFileUploadUI } from './modules/fileUploadUI.js';

document.addEventListener('DOMContentLoaded', () => {
    console.log("DOM fully loaded and parsed. Initializing UI modules...");
    initFileUploadUI();
});
