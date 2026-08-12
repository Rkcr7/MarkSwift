// themeToggle.js - light/dark theme switching.
//
// The *initial* theme is applied by a tiny inline script in index.html <head>,
// not here. This module is loaded as a deferred ES module, which means it runs
// after first paint — applying the theme from here would show a white flash to
// dark-mode users on every page load.
//
// This module owns everything after that: the toggle button, persistence, and
// following the OS setting for users who have not made an explicit choice.

const STORAGE_KEY = 'markswift-theme';

function readStoredTheme() {
    try {
        return localStorage.getItem(STORAGE_KEY);
    } catch (e) {
        // Storage can throw in private browsing or when cookies are blocked.
        return null;
    }
}

function storeTheme(theme) {
    try {
        localStorage.setItem(STORAGE_KEY, theme);
    } catch (e) {
        // Non-fatal: the toggle still works for this page view.
    }
}

function isDark() {
    return document.documentElement.classList.contains('dark');
}

function syncButton(button, icon) {
    const dark = isDark();
    if (icon) {
        icon.classList.toggle('fa-moon', !dark);
        icon.classList.toggle('fa-sun', dark);
    }
    if (button) {
        const label = dark ? 'Switch to light mode' : 'Switch to dark mode';
        button.setAttribute('aria-label', label);
        button.setAttribute('title', label);
        button.setAttribute('aria-pressed', String(dark));
    }
}

function applyTheme(theme) {
    document.documentElement.classList.toggle('dark', theme === 'dark');
}

export function initThemeToggle() {
    const button = document.getElementById('theme-toggle');
    const icon = document.getElementById('theme-toggle-icon');

    if (!button) {
        console.warn('[ThemeToggle] Toggle button not found; skipping init.');
        return;
    }

    syncButton(button, icon);

    button.addEventListener('click', () => {
        const next = isDark() ? 'light' : 'dark';
        applyTheme(next);
        storeTheme(next);
        syncButton(button, icon);
    });

    // Follow the OS only while the user has not picked a theme themselves. Once
    // they click the toggle we stop overriding their choice.
    const media = window.matchMedia('(prefers-color-scheme: dark)');
    const onSystemChange = (event) => {
        if (readStoredTheme()) return;
        applyTheme(event.matches ? 'dark' : 'light');
        syncButton(button, icon);
    };

    if (typeof media.addEventListener === 'function') {
        media.addEventListener('change', onSystemChange);
    } else if (typeof media.addListener === 'function') {
        media.addListener(onSystemChange); // Safari < 14
    }
}

export default { initThemeToggle };
