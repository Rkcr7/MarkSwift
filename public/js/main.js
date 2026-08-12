// main.js - Entry point for frontend JavaScript
import { init as initFileUploadUI } from './modules/fileUploadUI.js';
import { initTabs } from './modules/tabManager.js';
import { liveEditor } from './modules/liveEditor.js';
import { initThemeToggle } from './modules/themeToggle.js';
import SplitPane from './modules/splitPane.js';

document.addEventListener('DOMContentLoaded', () => {
    // Theme first: it only wires up the toggle button (the theme itself is
    // already applied by the inline script in <head>), and doing it up front
    // means the button is never briefly out of sync with the page.
    initThemeToggle();

    initTabs();
    initFileUploadUI();
    liveEditor.init();

    // Split pane is auto-initialized by its module on import.
});
