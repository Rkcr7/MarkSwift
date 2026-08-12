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

// Fired on <document> whenever the theme changes, with detail.dark.
export const THEME_EVENT = 'markswift:themechange';

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
    const dark = theme === 'dark';
    document.documentElement.classList.toggle('dark', dark);

    // Broadcast rather than reaching into other modules. The live editor uses
    // this to keep CodeMirror's theme in step, since a light code pane inside a
    // dark shell is the harshest thing on the screen.
    document.dispatchEvent(new CustomEvent(THEME_EVENT, { detail: { dark } }));
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

    // The OS preference is intentionally not followed. Light is the product's
    // default because the preview pane renders a white printed page, so light
    // is the theme where the chrome and the document agree. Dark is opt-in and
    // sticky once chosen.
}

export default { initThemeToggle };
