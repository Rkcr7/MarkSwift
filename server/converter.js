const fs = require('fs-extra');
const path = require('path');
const puppeteer = require('puppeteer');
const { marked } = require('marked');
const createDOMPurify = require('dompurify');
const { JSDOM } = require('jsdom');

// Setup DOMPurify for Node.js
const window = new JSDOM('').window;
const DOMPurify = createDOMPurify(window);

class MarkdownToPDFConverter {
    constructor(sessionId, logMessageCallback, options = {}) { // Added sessionId and logMessageCallback
        this.sessionId = sessionId;
        this.logMessage = logMessageCallback || function(level, msg, data) { console[level](`[CONVERTER_FALLBACK_LOG] ${msg}`, data || ''); }; // Fallback logger
        
        this.browser = null;
        this.processedCount = 0;
        this.totalFiles = 0;
        this.sendProgress = null; 
        this.puppeteerLaunchOptions = {
            headless: true,
            args: [
                '--no-sandbox',
                '--disable-setuid-sandbox',
                '--disable-dev-shm-usage', // Crucial for Docker/Cloud Run
                '--disable-accelerated-2d-canvas',
                '--no-first-run',
                '--no-zygote',
                '--disable-gpu' // Often recommended for server environments
            ],
            // timeout: 60000 // Optional: Increase Puppeteer's own launch timeout
        };
        this.logMessage('info', `[${this.sessionId}] MarkdownToPDFConverter instance created.`, { options, puppeteerLaunchOptions: this.puppeteerLaunchOptions });
    }

    async init(sendProgressCallback) {
        this.sendProgress = sendProgressCallback;
        this.logMessage('info', `[${this.sessionId}] Initializing converter...`);
        if (this.sendProgress) this.sendProgress({ type: 'status', message: 'Initializing converter...', progress: 0 });
        
        if (!this.browser) {
            this.logMessage('info', `[${this.sessionId}] Launching Puppeteer browser with options:`, this.puppeteerLaunchOptions);
            if (this.sendProgress) this.sendProgress({ type: 'status', message: 'Launching browser...', progress: 2 });
            try {
                this.browser = await puppeteer.launch(this.puppeteerLaunchOptions);
                this.logMessage('info', `[${this.sessionId}] Puppeteer browser launched successfully.`);
                if (this.sendProgress) this.sendProgress({ type: 'status', message: 'Browser launched.', progress: 5 });
            } catch (error) {
                this.logMessage('error', `[${this.sessionId}] CRITICAL: Failed to launch Puppeteer browser:`, { message: error.message, stack: error.stack });
                if (this.sendProgress) this.sendProgress({ type: 'error', message: `Failed to launch browser: ${error.message}` });
                throw error; // Re-throw to be caught by the caller in server.js
            }
        } else {
            this.logMessage('info', `[${this.sessionId}] Puppeteer browser already initialized.`);
        }
    }

    async convertMarkdownToHTML(markdownContent) {
        // this.logMessage('debug', `[${this.sessionId}] Converting Markdown to HTML.`); // Can be verbose
        const options = { headerIds: false, mangle: false };
        const html = marked.parse(markdownContent, options);
        const sanitized = DOMPurify.sanitize(html);
        // this.logMessage('debug', `[${this.sessionId}] Markdown to HTML conversion complete. Sanitized.`);
        
        return `
<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Markdown PDF</title>
    <style>
        body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", "Noto Sans", Helvetica, Arial, sans-serif; font-size: 16px; line-height: 1.6; color: #24292f; background-color: #ffffff; margin: 0; padding: 5mm; max-width: none; word-wrap: break-word; }
        h1, h2, h3, h4, h5, h6 { margin-top: 24px; margin-bottom: 16px; font-weight: 600; line-height: 1.25; }
        h1 { font-size: 2em; border-bottom: 1px solid #d1d9e0; padding-bottom: 10px; }
        h2 { font-size: 1.5em; border-bottom: 1px solid #d1d9e0; padding-bottom: 8px; }
        h3 { font-size: 1.25em; } h4 { font-size: 1em; } h5 { font-size: 0.875em; } h6 { font-size: 0.85em; color: #656d76; }
        p { margin-top: 0; margin-bottom: 16px; }
        blockquote { padding: 0 1em; color: #656d76; border-left: 0.25em solid #d1d9e0; margin: 0 0 16px 0; }
        ul, ol { margin-top: 0; margin-bottom: 16px; padding-left: 2em; } li { margin: 0.25em 0; }
        table { border-spacing: 0; border-collapse: collapse; margin-top: 0; margin-bottom: 16px; display: table; width: 100%; table-layout: fixed; max-width: 100%; overflow: auto; }
        table th, table td { padding: 6px 13px; border: 1px solid #d1d9e0; word-wrap: break-word; }
        table th { background-color: #f6f8fa; font-weight: 600; }
        code { padding: 0.2em 0.4em; background-color: #f6f8fa; border-radius: 6px; font-size: 85%; font-family: ui-monospace, SFMono-Regular, "SF Mono", Consolas, "Liberation Mono", Menlo, monospace; overflow-wrap: break-word; word-break: normal; }
        pre { padding: 16px; overflow: visible; background-color: #f6f8fa; border-radius: 6px; margin-top: 0; margin-bottom: 16px; white-space: pre-wrap; overflow-wrap: break-word; word-break: normal; }
        pre code { padding: 0; background-color: transparent; border-radius: 0; white-space: pre-wrap; overflow-wrap: break-word; word-break: normal; }
        img { max-width: 100%; height: auto; border-radius: 6px; }
        a { color: #0969da; text-decoration: none; } a:hover { text-decoration: underline; }
        @media print { body { margin: 0; padding: 5mm; } h1, h2, h3, h4, h5, h6 { page-break-after: avoid; } img { page-break-inside: avoid; } table { page-break-inside: avoid; } pre { page-break-inside: avoid; } }
    </style>
</head>
<body> <div class="markdown-body"> ${sanitized} </div> </body>
</html>`;
    }

    async convertFileToPDF(inputFile, outputFile, originalFileName) {
        const startTime = Date.now();
        const currentFileProgress = this.processedCount + 1;
        const baseProgress = 10 + (this.processedCount / this.totalFiles * 70);
        let page; // Declare page here to ensure it's in scope for finally block if needed

        this.logMessage('info', `[${this.sessionId}] [File ${currentFileProgress}/${this.totalFiles}] Starting conversion: ${originalFileName} -> ${outputFile}`);
        if (this.sendProgress) this.sendProgress({ type: 'file_status', message: `Processing file`, currentFile: currentFileProgress, totalFiles: this.totalFiles, progress: baseProgress });

        try {
            this.logMessage('debug', `[${this.sessionId}] [File ${currentFileProgress}] Reading content from: ${inputFile}`);
            const markdownContent = await fs.readFile(inputFile, 'utf8');
            
            this.logMessage('debug', `[${this.sessionId}] [File ${currentFileProgress}] Converting Markdown to HTML for: ${originalFileName}`);
            const htmlContent = await this.convertMarkdownToHTML(markdownContent);
            
            this.logMessage('debug', `[${this.sessionId}] [File ${currentFileProgress}] Creating new Puppeteer page for: ${originalFileName}`);
            page = await this.browser.newPage();
            this.logMessage('debug', `[${this.sessionId}] [File ${currentFileProgress}] New page created. Setting content for: ${originalFileName}`);
            
            await page.setContent(htmlContent, { waitUntil: 'networkidle0', timeout: 60000 }); // Added timeout
            this.logMessage('debug', `[${this.sessionId}] [File ${currentFileProgress}] Content set in page. Generating PDF for: ${originalFileName}`);
            
            await page.pdf({
                path: outputFile,
                format: 'A4',
                margin: { top: '5mm', right: '5mm', bottom: '5mm', left: '5mm' },
                printBackground: true,
                preferCSSPageSize: true,
                timeout: 60000 // Added timeout
            });
            this.logMessage('info', `[${this.sessionId}] [File ${currentFileProgress}] PDF generated successfully: ${outputFile}`);
            
            this.processedCount++;
            const duration = ((Date.now() - startTime) / 1000).toFixed(1);
            this.logMessage('info', `[${this.sessionId}] [File ${this.processedCount}/${this.totalFiles}] ✅ Success: ${path.basename(outputFile)} for ${originalFileName} (${duration}s)`);
            if (this.sendProgress) this.sendProgress({ type: 'file_complete', message: `File processed`, currentFile: this.processedCount, totalFiles: this.totalFiles, progress: 10 + (this.processedCount / this.totalFiles * 70) });
            return { success: true, input: originalFileName, output: outputFile, duration };
            
        } catch (error) {
            this.processedCount++; // Increment even on error
            this.logMessage('error', `[${this.sessionId}] [File ${this.processedCount}/${this.totalFiles}] ❌ Error processing ${originalFileName}:`, { message: error.message, stack: error.stack, inputFile, outputFile });
            if (this.sendProgress) this.sendProgress({ type: 'file_error', message: `Error processing file: ${originalFileName}`, currentFile: this.processedCount, totalFiles: this.totalFiles, progress: 10 + (this.processedCount / this.totalFiles * 70), originalFileName: originalFileName, error: error.message });
            return { success: false, input: originalFileName, error: error.message };
        } finally {
            if (page) {
                try {
                    this.logMessage('debug', `[${this.sessionId}] [File ${currentFileProgress}] Closing Puppeteer page for: ${originalFileName}`);
                    await page.close();
                    this.logMessage('debug', `[${this.sessionId}] [File ${currentFileProgress}] Page closed for: ${originalFileName}`);
                } catch (closeError) {
                    this.logMessage('warn', `[${this.sessionId}] [File ${currentFileProgress}] Error closing page for ${originalFileName}:`, { message: closeError.message });
                }
            }
        }
    }

    async processConcurrently(fileTasks, maxConcurrency) {
        const results = [];
        this.maxConcurrency = Math.max(1, Math.min(maxConcurrency, 10)); // Ensure maxConcurrency from config is respected but also capped
        this.logMessage('info', `[${this.sessionId}] Starting concurrent processing. Max concurrency for this batch: ${this.maxConcurrency} files at once.`);
        if (this.sendProgress) this.sendProgress({ type: 'status', message: `Starting batch processing. Concurrency: ${this.maxConcurrency}`, progress: 10 + (this.processedCount / this.totalFiles * 70) });

        for (let i = 0; i < fileTasks.length; i += this.maxConcurrency) {
            const batch = fileTasks.slice(i, i + this.maxConcurrency);
            const batchNumber = Math.floor(i / this.maxConcurrency) + 1;
            const totalBatches = Math.ceil(fileTasks.length / this.maxConcurrency);
            
            this.logMessage('info', `[${this.sessionId}] Processing batch ${batchNumber}/${totalBatches} (${batch.length} files)`);
            if (this.sendProgress) this.sendProgress({ type: 'status', message: `Processing batch ${batchNumber}/${totalBatches}`, progress: 10 + (this.processedCount / this.totalFiles * 70) });
            
            const batchPromises = batch.map(({ tempFilePath, outputFile, originalName }) => 
                this.convertFileToPDF(tempFilePath, outputFile, originalName)
            );
            
            const batchResultsSettled = await Promise.allSettled(batchPromises);
            this.logMessage('debug', `[${this.sessionId}] Batch ${batchNumber}/${totalBatches} results (settled):`, batchResultsSettled.map(r => ({status: r.status, value: r.value || r.reason})));
            
            const currentBatchResults = batchResultsSettled.map(r => {
                if (r.status === 'fulfilled') return r.value;
                // Log detailed reason for rejection
                this.logMessage('warn', `[${this.sessionId}] A file in batch ${batchNumber} failed (promise rejected):`, { reason: r.reason });
                return { success: false, error: r.reason?.message || 'Unknown error during Promise.allSettled', input: r.reason?.input || 'Unknown file from rejected promise' };
            });
            results.push(...currentBatchResults);
            
            if (i + this.maxConcurrency < fileTasks.length) {
                this.logMessage('debug', `[${this.sessionId}] Pausing briefly between batches.`);
                await new Promise(resolve => setTimeout(resolve, 100)); 
            }
        }
        this.logMessage('info', `[${this.sessionId}] All batches processed. Total results: ${results.length}`);
        return results;
    }

    async processUploadedFiles(uploadedFiles, outputDir, concurrency, sendProgressCallback) {
        this.sendProgress = sendProgressCallback;
        const overallStartTime = Date.now();
        this.processedCount = 0; 
        this.totalFiles = uploadedFiles.length;

        this.logMessage('info', `[${this.sessionId}] processUploadedFiles called. Total files: ${this.totalFiles}, Output dir: ${outputDir}, Concurrency: ${concurrency}`);

        if (this.totalFiles === 0) {
            this.logMessage('info', `[${this.sessionId}] No files provided for conversion.`);
            if (this.sendProgress) this.sendProgress({ type: 'status', message: 'No files to convert.', progress: 0 });
            return [];
        }

        if (this.sendProgress) this.sendProgress({ type: 'status', message: `Received ${this.totalFiles} file(s). Preparing...`, progress: 5, totalFiles: this.totalFiles });
        
        const fileTasks = [];
        for (const uploadedFile of uploadedFiles) {
            const originalName = uploadedFile.originalname;
            const tempFilePath = uploadedFile.path; 
            const outputFileName = originalName.replace(/\.(md|markdown)$/i, '.pdf');
            const outputFile = path.join(outputDir, outputFileName);
            
            this.logMessage('debug', `[${this.sessionId}] Preparing task for ${originalName}: tempPath=${tempFilePath}, outputPath=${outputFile}`);
            await fs.ensureDir(path.dirname(outputFile)); 
            
            fileTasks.push({ tempFilePath, outputFile, originalName });
        }
        this.logMessage('info', `[${this.sessionId}] Created ${fileTasks.length} file tasks.`);
        
        if (this.sendProgress) this.sendProgress({ type: 'status', message: 'Starting conversion process...', progress: 10, totalFiles: this.totalFiles });
        const conversionResults = await this.processConcurrently(fileTasks, concurrency);
        
        const totalDuration = ((Date.now() - overallStartTime) / 1000).toFixed(1);
        const successfulConversions = conversionResults.filter(r => r.success).length;
        
        this.logMessage('info', `[${this.sessionId}] Batch conversion for uploaded files completed!`);
        this.logMessage('info', `[${this.sessionId}] Processed ${this.totalFiles} files. Successful: ${successfulConversions}, Failed: ${this.totalFiles - successfulConversions}. Total time: ${totalDuration}s`);
        if (this.sendProgress) this.sendProgress({ type: 'status', message: `Batch complete. Processed: ${this.totalFiles}, Successful: ${successfulConversions}.`, progress: 85 });
        
        return conversionResults;
    }

    async cleanup() {
        this.logMessage('info', `[${this.sessionId}] Cleanup called for converter instance.`);
        if (this.browser) {
            this.logMessage('info', `[${this.sessionId}] Closing Puppeteer browser.`);
            try {
                await this.browser.close();
                this.logMessage('info', `[${this.sessionId}] Puppeteer browser closed successfully.`);
            } catch (error) {
                this.logMessage('error', `[${this.sessionId}] Error closing Puppeteer browser:`, { message: error.message, stack: error.stack });
            } finally {
                this.browser = null; // Important to allow re-init
            }
        } else {
            this.logMessage('info', `[${this.sessionId}] No active Puppeteer browser to close during cleanup.`);
        }
    }
}

module.exports = MarkdownToPDFConverter;
