# MarkSwift Development Roadmap: Live Editor & Modularization

This document tracks the development progress for implementing the "Live Markdown Editor" feature and the associated codebase modularization for MarkSwift.

## 1. Project Overview

**Goal:** Enhance MarkSwift with a live Markdown editor that provides real-time HTML preview and on-demand PDF conversion. Simultaneously, refactor the existing codebase for better modularity, maintainability, and scalability.

**Key Features to Implement:**
*   **Live Editor Tab:** A new tab/section for pasting/editing Markdown.
*   **Split View:** Markdown input on one side, live HTML preview on the other.
*   **Real-time Preview:** HTML preview updates as the user types (debounced).
*   **PDF Conversion:** Ability to convert the editor's content to PDF.
*   **Sync Scrolling:** Optional synchronized scrolling between editor and preview.
*   **Persistence:** Editor content saved to localStorage.
*   **Modular Codebase:** Refactor backend and frontend into smaller, focused modules.

## 2. Current Status

*   **Overall Progress:** 80%
*   **Current Phase:** Phase 9 - Live Editor - Synchronized Scrolling
*   **Next Step:** Implement and test synchronized scrolling.

## 3. Phase Breakdown & Task Checklist

The project will be implemented in several phases. Each phase will be completed, tested, and then committed by the user.

---

### Phase 0: Planning & Setup ✅ COMPLETED
*   [x] Define scope for Live Editor feature.
*   [x] Define scope for modularization.
*   [x] Agree on phased implementation approach.
*   [x] Create `DEVELOPMENT_ROADMAP.md`.

---

### Phase 1: Backend Modularization - Routes & Initial Services ✅ COMPLETED
*   **Status:** Completed
*   **Objective:** Extract route handling from `server/server.js` and establish a basic service structure.
*   **Tasks:**
    *   [x] Create `server/routes/` directory.
    *   [x] Create `server/routes/uploadRoutes.js` for existing `/api/convert` (file upload).
    *   [x] Create `server/routes/downloadRoutes.js` for existing `/api/download/...` endpoints.
    *   [x] Modify `server/server.js` to use these route modules.
    *   [x] Create `server/services/` directory.
    *   [x] Create `server/services/conversionService.js`.

---

### Phase 2: Backend Modularization - Core Services & Controllers ✅ COMPLETED
*   **Status:** Completed
*   **Objective:** Further modularize backend logic into controllers and services.
*   **Tasks:**
    *   [x] Create `server/controllers/` structure.
        *   [x] `uploadController.js`: Logic for handling file uploads.
        *   [x] `downloadController.js`: Logic for handling file downloads.
    *   [x] Expand `server/services/`.
        *   [x] `cleanupService.js`: Encapsulated cleanup functionality.
    *   [x] Update route files to use controllers.
    *   [x] Implement configurable post-download cleanup delay.

---

### Phase 3: Backend Modularization - WebSocket & Utilities ✅ COMPLETED
*   **Status:** Completed
*   **Objective:** Modularize WebSocket handling and utility functions.
*   **Tasks:**
    *   [x] Create `server/websocket/websocketHandler.js`.
    *   [x] Create middleware directory with rate limiting and error handling.
    *   [x] Update `server/server.js` to use modular components.

---

### Phase 4: Frontend Modularization - Basic Structure & File Upload ✅ COMPLETED
*   **Status:** Completed
*   **Objective:** Reorganize `public/js/main.js` into modules.
*   **Tasks:**
    *   [x] Create `public/js/modules/` directory.
    *   [x] `fileUploadUI.js`: Handles UI interactions for file upload.
    *   [x] `websocketClient.js`: Manages WebSocket connection and message handling.
    *   [x] Update `main.js` to be a lean entry point.

---

### Phase 5: Live Editor - Backend API ✅ COMPLETED
*   **Status:** Completed
*   **Objective:** Create backend endpoints to support the live editor.
*   **Tasks:**
    *   [x] Install `marked` library for Markdown to HTML conversion.
    *   [x] Create `server/services/previewService.js` using `marked`.
    *   [x] Create `server/controllers/editorController.js` with handlers for HTML preview and PDF conversion.
    *   [x] Create `server/routes/editorRoutes.js` defining API endpoints.
    *   [x] Update `server/server.js` to use new routes and services.

---

### Phase 6: Live Editor - Frontend UI Shell & Tabs ✅ COMPLETED
*   **Status:** Completed
*   **Objective:** Implement the basic UI structure for the Live Editor (tabs, split-pane).
*   **Tasks:**
    *   [x] Modify `public/index.html` to include tab navigation and Live Editor shell.
    *   [x] Create `public/js/modules/tabManager.js` to handle tab switching.
    *   [x] Update `public/js/main.js` to initialize tab manager.
    *   [x] Optimize layout for maximum space usage in Live Editor.

---

### Phase 7: Live Editor - Markdown Editor & HTML Preview
*   **Status:** In Progress
*   **Objective:** Integrate live Markdown editing with real-time HTML preview.
*   **Tasks:**
    *   [x] Create `public/js/modules/liveEditor.js` with core editor functionality.
    *   [x] Implement client-side Markdown to HTML preview (using `marked.js` and `DOMPurify`).
    *   [x] Add localStorage persistence for editor content and selected theme.
    *   [x] Implement clear editor functionality.
    *   [x] Add editor theme selector (Material Light, Dracula Dark, Neat Light) with persistence.
    *   [x] Update `public/js/main.js` to initialize live editor.
    *   [x] **Backend Cleanup:** Removed server-side HTML preview endpoint (`/api/editor/preview-html`), `server/services/previewService.js`, and related controller logic as preview is now client-side.
    *   [ ] **Testing:** Verify live preview works with client-side rendering, content and theme persist, clear button functions, theme selector works.
    *   [ ] **User Commit Point**

---

### Phase 8: Live Editor - PDF Conversion & Download ✅ COMPLETED
*   **Status:** Completed
*   **Objective:** Enable PDF conversion and download from the Live Editor, with UI enhancements for status messages.
*   **Tasks:**
    *   [x] Connect "Download PDF" button to send content to `/api/editor/convert-pdf`.
    *   [x] Handle response with session ID and job ID.
    *   [x] Integrate with `websocketClient.js` to show progress for editor conversions.
    *   [x] Provide download link upon completion.
    *   [x] **UI Enhancement:** Added close buttons and improved layout for status, error, and download messages in the Live Editor.
    *   [x] **Testing:** PDF conversion from editor works, progress is shown, download is successful, UI enhancements function correctly.
    *   [x] **User Commit Point**

---

### Phase 9: Live Editor - Advanced Features (Sync Scroll)
*   **Status:** In Progress
*   **Objective:** Implement synchronized scrolling between the Markdown editor and HTML preview.
*   **Tasks:**
    *   [ ] Implement synchronized scrolling logic.
    *   [ ] Add toggle checkbox for sync scroll feature (ensure good UI/UX).
    *   [ ] Persist sync scroll toggle state in localStorage.
    *   [ ] **Testing:** Verify sync scroll works accurately in both directions and toggle functions correctly.
    *   [ ] ~~Enhance localStorage persistence with auto-save indicators.~~ (Deferred by user)
    *   [ ] **User Commit Point**

---

### Phase 10: Final Polish, Testing & Documentation
*   **Status:** Not Started
*   **Objective:** Ensure UI/UX consistency, performance, and update documentation.
*   **Tasks:**
    *   [ ] Review UI for consistency with the existing application.
    *   [ ] Optimize performance of editor and preview.
    *   [ ] Thorough cross-browser and responsiveness testing.
    *   [ ] Update `README.md` with information about the new Live Editor feature.
    *   [ ] Add JSDoc comments and code cleanup.
    *   [ ] **Testing:** Full end-to-end testing of all features.
    *   [ ] **Final User Commit Point**

---

## 4. Testing Requirements

*   **Unit Tests:** (Future consideration) For critical utility functions and services.
*   **Integration Tests:** Verify interaction between modules (e.g., API endpoint to service to converter).
*   **End-to-End (E2E) Manual Testing:** After each phase, the user will perform E2E tests covering:
    *   All existing functionalities.
    *   Newly implemented functionalities for the current phase.
    *   UI responsiveness and consistency.
    *   Error handling.

## 5. Commit Strategy

*   The user (`Rkcr7`) will perform commits after each phase is completed and successfully tested.
*   This ensures a clean, verifiable commit history.
*   Cline will await user confirmation before proceeding to the next phase.

## 6. Future Enhancements (Post v2.0)

*   User accounts and saved snippets.
*   Custom CSS for PDF output.
*   More Markdown editor themes/features.
*   Direct import from URL (e.g., GitHub gists).
*   Team collaboration features.

---
*This document will be updated as development progresses.*
