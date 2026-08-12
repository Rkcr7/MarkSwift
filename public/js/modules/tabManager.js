// public/js/modules/tabManager.js

function initTabs() {
    const tabButtons = document.querySelectorAll('.tab-button');
    const tabContents = document.querySelectorAll('.tab-content');

    if (tabButtons.length === 0 || tabContents.length === 0) {
        console.warn('[TabManager] No tab buttons or content found. Tab functionality will not be initialized.');
        return;
    }

    // Appearance is CSS's job. This module only records which tab is active by
    // toggling `active-tab`; `.tab-button` and `.tab-button.active-tab` in
    // custom.css decide what that looks like. It used to add and remove
    // hardcoded colour utilities (text-blue-600, text-slate-500, ...), which
    // meant the active tab could not follow the light/dark theme and the design
    // was split across two files.
    function deactivateAll() {
        tabButtons.forEach(button => {
            button.classList.remove('active-tab');
            button.setAttribute('aria-selected', 'false');
        });
        tabContents.forEach(content => {
            content.classList.remove('active-content');
            content.classList.add('hidden');
        });
    }

    // Function to activate a specific tab
    function activateTab(button, targetContentId) {
        deactivateAll();

        // Activate button
        button.classList.add('active-tab');
        button.setAttribute('aria-selected', 'true');

        // Activate content
        const targetContent = document.querySelector(targetContentId);
        if (targetContent) {
            targetContent.classList.add('active-content');
            targetContent.classList.remove('hidden');
        } else {
            console.error(`[TabManager] Target content not found for ID: ${targetContentId}`);
        }
    }

    tabButtons.forEach(button => {
        button.addEventListener('click', () => {
            const targetContentId = button.dataset.tabTarget;
            if (targetContentId) {
                activateTab(button, targetContentId);
            } else {
                console.error('[TabManager] Tab button is missing data-tab-target attribute.');
            }
        });
    });

    // Activate the first tab by default if none are marked active in HTML
    // (Our HTML already marks the first one as active, but this is a good fallback)
    const initiallyActiveButton = document.querySelector('.tab-button.active-tab');
    if (initiallyActiveButton) {
        const target = initiallyActiveButton.dataset.tabTarget;
        if (target) {
             // Ensure only the correct content is active
            tabContents.forEach(content => {
                if (content.id === target.substring(1)) {
                    content.classList.add('active-content');
                    content.classList.remove('hidden');
                } else {
                    content.classList.remove('active-content');
                    content.classList.add('hidden');
                }
            });
        }
    } else if (tabButtons.length > 0) {
        // Fallback: activate the very first tab if no .active-tab class is set
        const firstButtonTarget = tabButtons[0].dataset.tabTarget;
        if (firstButtonTarget) {
            activateTab(tabButtons[0], firstButtonTarget);
        }
    }
}

export { initTabs };
