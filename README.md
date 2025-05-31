# MarkSwift

<div align="center">
  <img src="public/images/logo.png" alt="MarkSwift Logo" width="120" height="120">
  <p><em>Swiftly convert your Markdown files to PDF</em></p>
  
  <p><strong><a href="https://markswift-1032065492518.asia-south2.run.app" target="_blank" rel="noopener noreferrer">🚀 Live at MarkSwift 🚀</a></strong></p>
  
  <!-- Demo GIF -->
  <img src="public/images/MarkSwift.gif" alt="MarkSwift Demo" width="600" style="border-radius: 8px; margin: 20px 0; box-shadow: 0 4px 8px rgba(0,0,0,0.1);">
  
  <p><strong>See MarkSwift in action!</strong> Upload multiple Markdown files and convert them to PDF with real-time progress tracking.</p>
</div>

## Summary

MarkSwift is a web application that allows users to upload multiple Markdown files (.md, .markdown) and convert them into PDF documents. It provides real-time progress updates via WebSockets and offers different concurrency modes for conversion. Processed files can be downloaded as individual PDFs or as a single ZIP archive if multiple files were converted.

## Features

*   **Beautiful PDF Output:** Generates professionally formatted, clean PDFs with proper typography, styling, and layout preservation from your Markdown content.
*   **Batch Conversion:** Upload and convert multiple Markdown files simultaneously.
*   **Web Interface:** User-friendly interface for uploading files and selecting conversion mode.
*   **Real-time Progress & Queue Management:**
    *   Track the conversion status of your files in real-time using WebSockets.
    *   Accurate queue position updates and estimated wait time display.
    *   Minimum display duration for queue status ensures visibility even for quick jobs.
    *   Reduced per-file processing messages on the client for a cleaner status view.
*   **Concurrency Modes:**
    *   **Normal:** Balances speed and resource usage (default: 4 concurrent processes).
    *   **Fast:** Prioritizes quicker processing (default: 7 concurrent processes).
    *   **Max:** Utilizes maximum configured concurrent processes for the fastest possible conversion (default: 10 concurrent processes).
*   **Download Options:**
    *   Download a single PDF if only one file is successfully converted.
    *   Download a ZIP archive containing all successfully converted PDFs for batch uploads.
*   **Session Management:** Each conversion batch is handled in an isolated session with unique identifiers.
*   **Automatic Cleanup:** Temporary files (uploads, generated PDFs, ZIPs) are automatically cleaned up after download or a configurable timeout period (default: 20 minutes, scanned every 10 minutes).
*   **File Validation:** Accepts only Markdown files (`.md`, `.markdown`) and has a file size limit (10MB per file).
*   **Secure by Design:** Uses `crypto` for secure session ID generation and `multer` for robust file upload handling.
*   **Modern Frontend:** Styled with Tailwind CSS.

## Functionality Overview

1.  **Upload:** The user selects one or more Markdown files through the web interface and chooses a conversion mode.
2.  **Session Initiation:** The server receives the files, generates a unique session ID, and immediately responds to the client.
3.  **WebSocket Connection:** The client-side JavaScript uses this session ID to establish a WebSocket connection with the server.
4.  **Conversion Process:**
    *   The server uses the `MarkdownToPDFConverter` (leveraging Puppeteer for accurate rendering) to convert each Markdown file to PDF.
    *   The number of concurrent conversions is determined by the selected mode.
5.  **Progress Updates:** The server sends progress updates (e.g., "Preparing files...", "Converting file X of Y...", "Zipping files...") to the client over the WebSocket connection.
6.  **Completion & Download:**
    *   Once all files are processed, the server sends a 'complete' message with a download link.
    *   If one PDF was generated, a direct link to the PDF is provided.
    *   If multiple PDFs were generated, they are zipped, and a link to the ZIP file is provided.
7.  **Cleanup:** After the user downloads the file(s), or after a certain period of inactivity, the server automatically deletes the temporary files associated with that session.

## Setup and Running the Project

### Prerequisites

*   Node.js (v16.x or later recommended)
*   npm (comes with Node.js)

### Installation & Setup

1.  **Clone the repository (if applicable):**
    ```bash
    git clone https://github.com/Rkcr7/MarkSwift 
    cd MarkSwift
    ```

2.  **Install dependencies:**
    ```bash
    npm install
    ```
    This will install all necessary packages listed in `package.json`, including Express, Puppeteer, Tailwind CSS, etc.

3.  **Build Tailwind CSS:**
    MarkSwift uses Tailwind CSS. The CSS needs to be built from `public/css/input.css` to `public/css/tailwind.css`.
    *   For a one-time build:
        ```bash
        npm run build:css
        ```
    *   The `start` and `dev` scripts automatically handle CSS building.

### Running the Application

*   **Development Mode:**
    This mode uses `nodemon` to automatically restart the server on file changes and `concurrently` to watch for CSS changes and rebuild Tailwind CSS.
    ```bash
    npm run dev
    ```

*   **Production Mode:**
    This mode first builds the CSS and then starts the server.
    ```bash
    npm run start
    ```

After starting the server, the application will typically be accessible at:
`http://localhost:3000` (or the port specified by `process.env.PORT`).

## Project Structure

```
.
├── DEPLOYMENT_DO.md            # Deployment guide for DigitalOcean
├── DEPLOYMENT_GCP.md           # Deployment guide for Google Cloud Platform
├── MAINTENANCE.md              # Server maintenance and troubleshooting guide
├── Dockerfile                  # Docker configuration for containerization
├── public/                     # Client-side static assets
│   ├── css/
│   │   ├── custom.css          # Custom user styles
│   │   ├── input.css           # Tailwind CSS input
│   │   └── tailwind.css        # Generated Tailwind CSS
│   ├── images/
│   │   ├── favicon.ico         # Website favicon
│   │   ├── logo.png            # MarkSwift logo
│   │   └── MarkSwift.gif       # Demo showcase GIF
│   ├── js/
│   │   └── main.js             # Client-side JavaScript for UI and WebSocket
│   └── index.html              # Main HTML page
├── scripts/                    # Deployment and utility scripts
│   ├── deploy.sh
│   ├── nginx.conf.template
│   ├── setup-server.sh
│   └── update-app.sh
├── server/                     # Backend server logic
│   ├── converted-pdfs/         # Temporary storage for generated PDFs (session-based)
│   ├── uploads/                # Temporary storage for uploaded Markdown files (session-based)
│   ├── zips/                   # Temporary storage for generated ZIP archives (session-based)
│   ├── converter.js            # Core Markdown to PDF conversion logic (uses Puppeteer)
│   └── server.js               # Express server setup, API routes, WebSocket handling
├── .gitignore
├── config.json                 # Application configuration (auto-generated if not present)
├── package.json
├── package-lock.json
├── tailwind.config.js          # Tailwind CSS configuration
└── README.md                   # This file
```

## API Endpoints

*   `POST /api/convert`:
    *   Handles multipart/form-data file uploads (field name: `markdownFiles`).
    *   Accepts `mode` in the form body (`normal`, `fast`, `max`).
    *   Returns a JSON response with `sessionId`.
*   `GET /api/download/pdf/:sessionId/:filename`:
    *   Downloads a single converted PDF file.
*   `GET /api/download/zip/:sessionId/:filename`:
    *   Downloads a ZIP archive of multiple converted PDF files.
*   **WebSocket Endpoint:** `ws://localhost:PORT/?sessionId=<sessionId>`
    *   Used for real-time progress updates from server to client.

## Configuration

MarkSwift uses a `config.json` file to manage important settings. This file is automatically created with default values when the server starts if it doesn't exist. It's recommended to include your customized `config.json` in the root of your repository for deployment.

### Configuration File (`config.json`)

The configuration file contains the following settings:

```json
{
    "appName": "MarkSwift",
    "port": 3000,
    "fileUploadLimits": {
        "maxFileSizeMB": 10,
        "maxFilesPerBatch": 100
    },
    "concurrencyModes": {
        "normal": 4,
        "fast": 7,
        "max": 10
    },
    "cleanupSettings": {
        "periodicScanIntervalMinutes": 10,
        "orphanedSessionAgeMinutes": 20
    },
    "logging": {
        "level": "info"
    },
    "queueSettings": {
        "maxConcurrentSessions": 2,
        "maxQueueSize": 50,
        "queueCheckIntervalMs": 2000,
        "jobTimeoutMs": 300000,
        "maxRequestsPerMinute": 10,
        "defaultAvgTimePerFileMs": 900,
        "defaultBaseJobOverheadMs": 10000,
        "maxProcessingHistory": 20,
        "minimumQueueDisplayTimeMs": 2000
    }
}
```

### Configuration Options

**File Upload Limits:**
*   `maxFileSizeMB`: Maximum file size per uploaded file (default: 10MB)
*   `maxFilesPerBatch`: Maximum number of files per upload batch (default: 100)

**Concurrency Modes:**
*   `normal`: Balanced processing (default: 4 concurrent files)
*   `fast`: Faster processing (default: 7 concurrent files)
*   `max`: Maximum speed processing (default: 10 concurrent files)

**Cleanup Settings:**
*   `periodicScanIntervalMinutes`: How often to scan for orphaned session files (default: 10 minutes)
*   `orphanedSessionAgeMinutes`: Age threshold in minutes for cleaning up orphaned session files (default: 20 minutes)

**Queue Settings:**
*   `maxConcurrentSessions`: Maximum number of user sessions that can process conversions simultaneously (default: 2).
*   `maxQueueSize`: Maximum number of jobs allowed in the queue (default: 50).
*   `queueCheckIntervalMs`: How often the queue manager checks to process new jobs (default: 2000ms).
*   `jobTimeoutMs`: (Currently informational) Intended maximum duration for a single job (default: 300000ms).
*   `maxRequestsPerMinute`: Rate limit for conversion requests per IP (default: 10).
*   `defaultAvgTimePerFileMs`: Default average time assumed per file for initial wait time estimates (default: 900ms).
*   `defaultBaseJobOverheadMs`: Default base overhead assumed per job for initial wait time estimates (default: 10000ms).
*   `maxProcessingHistory`: Number of completed jobs to keep for recalculating average processing times (default: 20).
*   `minimumQueueDisplayTimeMs`: Minimum time (in ms) a user sees their queue status before processing starts, even if their wait is shorter (default: 2000ms).

**Other Settings:**
*   `port`: Server port (default: 3000, can be overridden by `PORT` environment variable)
*   `appName`: Application name used in branding
*   `logging.level`: Logging level for future logging enhancements

### File Cleanup Strategy

MarkSwift implements a multi-layered cleanup strategy to prevent server storage issues:

1. **Immediate Cleanup:**
   - Upload files are deleted immediately after processing
   - Individual PDF files are deleted after being zipped (for multi-file conversions)

2. **Download Cleanup:**
   - Remaining files are cleaned up 5 seconds after successful download

3. **Periodic Cleanup:**
   - Every 10 minutes (configurable via `periodicScanIntervalMinutes`), the server scans for orphaned session files.
   - Files older than 20 minutes (configurable via `orphanedSessionAgeMinutes`) are automatically deleted.
   - Runs on server startup and then at regular intervals.

## Deployment

MarkSwift is designed to be deployed using Docker, making it suitable for various cloud platforms and virtual private servers. We provide detailed guides for deploying to popular platforms:

*   **[DigitalOcean Droplet Deployment Guide](./DEPLOYMENT_DO.md):** Step-by-step instructions for deploying MarkSwift to a DigitalOcean Droplet using Docker, Nginx (as a reverse proxy), and Certbot (for SSL).
*   **[Google Cloud Platform Deployment Guide](./DEPLOYMENT_GCP.md):** Instructions for deploying to Google Cloud Platform, primarily focusing on Google Cloud Run for serverless container deployment, and also mentioning Google Compute Engine (GCE) as an alternative.

These guides include server setup, application deployment scripts, Nginx configuration, SSL setup, and maintenance tips. The `MAINTENANCE.md` file provides general server upkeep and troubleshooting advice applicable to most Docker-based deployments.

## Development

### Scripts

*   `npm run start` - Build CSS and start the production server
*   `npm run dev` - Start development mode with auto-restart and CSS watching
*   `npm run build:css` - Build Tailwind CSS once

### Puppeteer Configuration for Different Environments

MarkSwift uses Puppeteer for PDF conversion. The configuration for Puppeteer's Chrome/Chromium executable path is handled automatically based on the environment:

*   **Production (Docker/Cloud Run):**
    *   When `NODE_ENV` is set to `production` (as it is in the `Dockerfile`), the application expects `google-chrome-stable` to be installed at `/usr/bin/google-chrome-stable` within the Docker container.
    *   The `Dockerfile` includes steps to install `google-chrome-stable` in the `puppeteer_deps` stage.
    *   The `server/converter.js` file will set Puppeteer's `executablePath` to this location.

*   **Local Development (e.g., Windows, macOS, Linux without global Chrome for Puppeteer):**
    *   When `NODE_ENV` is not `production` (e.g., during local development using `npm run dev`), `server/converter.js` does *not* set a specific `executablePath`.
    *   In this scenario, Puppeteer will attempt to:
        1.  Use a version of Chromium it downloads itself (usually into `node_modules/puppeteer/.local-chromium`).
        2.  Find a locally installed version of Chrome/Chromium if available and configured in your system's PATH or via Puppeteer environment variables (like `PUPPETEER_EXECUTABLE_PATH`).
    *   This ensures that local development works out-of-the-box on different operating systems without requiring a globally installed Chrome specifically for Puppeteer, as long as Puppeteer can download its own Chromium version or find a suitable local one.

This conditional configuration allows MarkSwift to run seamlessly in both Dockerized production environments and diverse local development setups.

### Troubleshooting

*   If you encounter issues with Puppeteer installation, try running `npm install puppeteer --force`
*   On Windows, ensure you have the necessary build tools installed for native dependencies
*   If the application fails to start, check that port 3000 is available or set the `PORT` environment variable

## License

This project is licensed under the MIT License.
