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

*   **Overall Progress:** 0%
*   **Current Phase:** Phase 0 - Planning & Setup
*   **Next Step:** Begin Phase 1 - Backend Modularization (Routes & Initial Services)

## 3. Phase Breakdown & Task Checklist

The project will be implemented in several phases. Each phase will be completed, tested, and then committed by the user.

---

### Phase 0: Planning & Setup (Completed)
*   [x] Define scope for Live Editor feature.
*   [x] Define scope for modularization.
*   [x] Agree on phased implementation approach.
*   [x] Create `DEVELOPMENT_ROADMAP.md`.

---

### Phase 1: Backend Modularization - Routes & Initial Services
*   **Status:** In Progress
*   **Objective:** Extract route handling from `server/server.js` and establish a basic service structure.
*   **Tasks:**
    *   [x] Create `server/routes/` directory (implicitly done by creating files within it).
    *   [x] Create `server/routes/uploadRoutes.js` for existing `/api/convert` (file upload).
    *   [x] Create `server/routes/downloadRoutes.js` for existing `/api/download/...` endpoints.
    *   [x] Modify `server/server.js` to use these route modules.
    *   [x] Create `server/services/` directory (implicitly done).
    *   [x] Create `server/services/conversionService.js` (placeholder created).
    *   [ ] Create `server/controllers/` directory (deferred to Phase 2, as current route handlers are simple enough).
    *   [ ] **Testing:** Ensure existing file upload and download functionality works perfectly.
    *   [ ] **User Commit Point**

---

### Phase 2: Backend Modularization - Core Services & Controllers
*   **Status:** In Progress
*   **Objective:** Further modularize backend logic into controllers and services.
*   **Tasks:**
    *   [x] Refine `server/controllers/` structure.
        *   [x] `uploadController.js`: Logic for handling file uploads created.
        *   [x] `downloadController.js`: Logic for handling file downloads created.
    *   [x] Expand `server/services/`.
        *   [ ] `sessionService.js`: Logic for session ID generation and management (deferred, as current crypto usage is simple and handled in `uploadController`).
        *   [x] `cleanupService.js`: Encapsulated `scanAndCleanupOrphanedSessions` and `cleanupSessionFiles`.
    *   [x] Update route files (`uploadRoutes.js`, `downloadRoutes.js`) to use controllers.
    *   [x] `server/server.js` is now leaner, using `CleanupService` and updated route modules.
    *   [ ] **Testing:** Verify all existing functionalities (upload, download, cleanup).
    *   [ ] **User Commit Point**

---

### Phase 3: Backend Modularization - WebSocket & Utilities
*   **Status:** Not Started
*   **Objective:** Modularize WebSocket handling and utility functions.
*   **Tasks:**
    *   [ ] Create `server/websocket/websocketHandler.js` to manage WebSocket connections, message routing, and `activeConnections`.
    *   [ ] `server/server.js` to delegate WebSocket setup to `websocketHandler.js`.
    *   [ ] Create `server/utils/logger.js` (if `logMessage` needs more features or standardization).
    *   [ ] Create `server/utils/configManager.js` to handle loading and accessing `config.json`.
    *   [ ] Create `server/middleware/` directory.
        *   [ ] `rateLimitMiddleware.js` (move existing rate limiter setup).
        *   [ ] `errorMiddleware.js` (centralized error handling).
    *   [ ] **Testing:** Verify all existing functionalities, especially WebSocket communication and error handling.
    *   [ ] **User Commit Point**

---

### Phase 4: Frontend Modularization - Basic Structure & File Upload
*   **Status:** Not Started
*   **Objective:** Reorganize `public/js/main.js` into modules, starting with the existing file upload functionality.
*   **Tasks:**
    *   [ ] Create `public/js/modules/` directory.
    *   [ ] Create `public/js/utils/` directory (for DOM helpers, API calls).
    *   [ ] `public/js/modules/fileUploadUI.js`: Handles UI interactions for file upload (form, progress display).
    *   [ ] `public/js/modules/websocketClient.js`: Manages WebSocket connection and message handling.
    *   [ ] `public/js/main.js` becomes an entry point, initializing modules.
    *   [ ] **Testing:** Ensure file upload, progress display, and download links work as before.
    *   [ ] **User Commit Point**

---

### Phase 5: Live Editor - Backend API
*   **Status:** Not Started
*   **Objective:** Create backend endpoints to support the live editor.
*   **Tasks:**
    *   [ ] Create `server/routes/editorRoutes.js`.
    *   [ ] Endpoint `POST /api/editor/preview-html`: Accepts Markdown text, returns rendered HTML.
        *   [ ] Create `server/services/previewService.js` (uses a Markdown-to-HTML library like `marked` or `markdown-it`).
    *   [ ] Endpoint `POST /api/editor/convert-pdf`: Accepts Markdown text, initiates PDF conversion (can reuse/adapt `conversionService.js`).
        *   This will involve creating a temporary .md file from the text to feed into the existing Puppeteer pipeline.
    *   [ ] Update `server/controllers/editorController.js` to handle these requests.
    *   [ ] **Testing:** Test new API endpoints using a tool like Postman or curl.
    *   [ ] **User Commit Point**

---

### Phase 6: Live Editor - Frontend UI Shell & Tabs
*   **Status:** Not Started
*   **Objective:** Implement the basic UI structure for the Live Editor (tabs, split-pane).
*   **Tasks:**
    *   [ ] Modify `public/index.html` to include a tab navigation structure ("Upload Files", "Live Editor").
    *   [ ] Create `public/js/modules/tabManager.js` to handle tab switching.
    *   [ ] Design the split-pane layout for the "Live Editor" tab (Markdown input left, Preview right).
        *   HTML structure for editor and preview areas.
        *   Basic CSS for layout (Tailwind CSS).
    *   [ ] **Testing:** Tabs switch correctly, layout is responsive.
    *   [ ] **User Commit Point**

---

### Phase 7: Live Editor - Markdown Editor & HTML Preview
*   **Status:** Not Started
*   **Objective:** Integrate a Markdown editor and display live HTML preview.
*   **Tasks:**
    *   [ ] Integrate CodeMirror or Monaco Editor into the left pane.
        *   `public/js/components/markdownEditor.js`.
    *   [ ] Fetch Markdown content from the editor.
    *   [ ] On editor change (debounced), send content to `POST /api/editor/preview-html`.
    *   [ ] Display the returned HTML in the right preview pane.
        *   `public/js/components/htmlPreview.js`.
    *   [ ] Style the HTML preview to resemble the final PDF output as closely as possible.
    *   [ ] **Testing:** Editor works, HTML preview updates live, styling is reasonable.
    *   [ ] **User Commit Point**

---

### Phase 8: Live Editor - PDF Conversion & Download
*   **Status:** Not Started
*   **Objective:** Enable PDF conversion and download from the Live Editor.
*   **Tasks:**
    *   [ ] Add "Download PDF" button.
    *   [ ] On click, send editor content to `POST /api/editor/convert-pdf`.
    *   [ ] Handle the response (similar to file upload: session ID, job ID, WebSocket for progress).
    *   [ ] Integrate with `websocketClient.js` to show progress for editor conversions.
    *   [ ] Provide download link upon completion.
    *   [ ] **Testing:** PDF conversion from editor works, progress is shown, download is successful.
    *   [ ] **User Commit Point**

---

### Phase 9: Live Editor - Advanced Features (Sync Scroll, Persistence)
*   **Status:** Not Started
*   **Objective:** Implement sync scrolling and localStorage persistence.
*   **Tasks:**
    *   [ ] Implement synchronized scrolling between editor and HTML preview.
        *   `public/js/components/syncScroll.js`.
        *   Add a checkbox to toggle this feature.
    *   [ ] Save editor content to localStorage automatically (debounced).
        *   `public/js/utils/storage.js`.
    *   [ ] Load content from localStorage when the Live Editor tab is opened.
    *   [ ] Add a "Clear Editor" button.
    *   [ ] **Testing:** Sync scroll works, content persists across page reloads, clear button works.
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
