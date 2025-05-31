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
    constructor(options = {}) {
        this.browser = null;
        // maxConcurrency will be passed during processUploadedFiles
        this.processedCount = 0;
        this.totalFiles = 0;
        this.sendProgress = null; // Added for WebSocket progress
        this.puppeteerLaunchOptions = {
            headless: true,
            args: [
                '--no-sandbox',
                '--disable-setuid-sandbox',
                '--disable-dev-shm-usage',
                '--disable-accelerated-2d-canvas',
                '--no-first-run',
                '--no-zygote',
                '--disable-gpu'
            ]
        };
    }

    async init(sendProgressCallback) { // Modified to accept callback
        this.sendProgress = sendProgressCallback; // Store the callback
        if (this.sendProgress) this.sendProgress({ type: 'status', message: 'Initializing converter...', progress: 0 });
        if (!this.browser) {
            // console.log('🌐 Launching browser for conversion...');
            if (this.sendProgress) this.sendProgress({ type: 'status', message: 'Launching browser...', progress: 2 });
            this.browser = await puppeteer.launch(this.puppeteerLaunchOptions);
            if (this.sendProgress) this.sendProgress({ type: 'status', message: 'Browser launched.', progress: 5 });
        }
    }

    async convertMarkdownToHTML(markdownContent) {
        const options = {
            headerIds: false,
            mangle: false
        };
        const html = marked.parse(markdownContent, options);
        const sanitized = DOMPurify.sanitize(html);
        
        return `
<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Markdown PDF</title>
    <style>
        body {
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", "Noto Sans", Helvetica, Arial, sans-serif;
            font-size: 16px;
            line-height: 1.6;
            color: #24292f;
            background-color: #ffffff;
            margin: 0;
            padding: 5mm; /* Unified small padding */
            max-width: none;
            word-wrap: break-word; /* For general body text */
        }
        h1, h2, h3, h4, h5, h6 { margin-top: 24px; margin-bottom: 16px; font-weight: 600; line-height: 1.25; }
        h1 { font-size: 2em; border-bottom: 1px solid #d1d9e0; padding-bottom: 10px; }
        h2 { font-size: 1.5em; border-bottom: 1px solid #d1d9e0; padding-bottom: 8px; }
        h3 { font-size: 1.25em; }
        h4 { font-size: 1em; }
        h5 { font-size: 0.875em; }
        h6 { font-size: 0.85em; color: #656d76; }
        p { margin-top: 0; margin-bottom: 16px; }
        blockquote { padding: 0 1em; color: #656d76; border-left: 0.25em solid #d1d9e0; margin: 0 0 16px 0; }
        ul, ol { margin-top: 0; margin-bottom: 16px; padding-left: 2em; }
        li { margin: 0.25em 0; }
        table { 
            border-spacing: 0; 
            border-collapse: collapse; 
            margin-top: 0; 
            margin-bottom: 16px; 
            display: table; /* Changed from block */
            width: 100%; /* Make table use full available width */
            table-layout: fixed; /* Helps with word wrapping in cells */
            max-width: 100%; 
            overflow: auto; /* Fallback if content is still too wide */
        }
        table th, table td { 
            padding: 6px 13px; 
            border: 1px solid #d1d9e0; 
            word-wrap: break-word; /* Wrap text within cells */
        }
        table th { background-color: #f6f8fa; font-weight: 600; }
        code { 
            padding: 0.2em 0.4em; 
            background-color: #f6f8fa; 
            border-radius: 6px; 
            font-size: 85%; 
            font-family: ui-monospace, SFMono-Regular, "SF Mono", Consolas, "Liberation Mono", Menlo, monospace;
            overflow-wrap: break-word; /* Prefer breaking at word boundaries for inline code */
            word-break: normal; /* Use with overflow-wrap */
        }
        pre { 
            padding: 16px; 
            overflow: visible; 
            background-color: #f6f8fa; 
            border-radius: 6px; 
            margin-top: 0; 
            margin-bottom: 16px; 
            white-space: pre-wrap;  /* Wrap long lines in pre blocks */
            overflow-wrap: break-word; /* Prefer breaking at word boundaries */
            word-break: normal; /* Use with overflow-wrap */
        }
        pre code { 
            padding: 0; 
            background-color: transparent; 
            border-radius: 0; 
            white-space: pre-wrap; 
            overflow-wrap: break-word; /* Prefer breaking at word boundaries */
            word-break: normal; /* Use with overflow-wrap */
        }
        img { max-width: 100%; height: auto; border-radius: 6px; }
        a { color: #0969da; text-decoration: none; }
        a:hover { text-decoration: underline; }
        @media print {
            body { margin: 0; padding: 5mm; } /* Matched to main body padding */
            h1, h2, h3, h4, h5, h6 { page-break-after: avoid; }
            img { page-break-inside: avoid; }
            table { page-break-inside: avoid; }
            pre { page-break-inside: avoid; }
        }
    </style>
</head>
<body>
    <div class="markdown-body">
        ${sanitized}
    </div>
</body>
</html>`;
    }

    async convertFileToPDF(inputFile, outputFile, originalFileName) {
        const startTime = Date.now();
        const currentFileProgress = this.processedCount + 1;
        const baseProgress = 10 + (this.processedCount / this.totalFiles * 70); // Base progress before this file

        try {
            // console.log(`📄 [${currentFileProgress}/${this.totalFiles}] Processing: ${originalFileName}`);
            // More generic message, focusing on count
            if (this.sendProgress) this.sendProgress({ type: 'file_status', message: `Processing file`, currentFile: currentFileProgress, totalFiles: this.totalFiles, progress: baseProgress });

            const markdownContent = await fs.readFile(inputFile, 'utf8');
            // Intermediate steps can be less verbose or skipped for client update if too frequent
            // if (this.sendProgress) this.sendProgress({ type: 'file_status', message: `Reading file`, currentFile: currentFileProgress, totalFiles: this.totalFiles, progress: baseProgress + 5 });
            
            const htmlContent = await this.convertMarkdownToHTML(markdownContent);
            // if (this.sendProgress) this.sendProgress({ type: 'file_status', message: `Converting to HTML`, currentFile: currentFileProgress, totalFiles: this.totalFiles, progress: baseProgress + 10 });
            
            const page = await this.browser.newPage();
            await page.setContent(htmlContent, { waitUntil: 'networkidle0' });
            // if (this.sendProgress) this.sendProgress({ type: 'file_status', message: `Loading in browser`, currentFile: currentFileProgress, totalFiles: this.totalFiles, progress: baseProgress + 15 });
            
            await page.pdf({
                path: outputFile,
                format: 'A4',
                margin: { top: '5mm', right: '5mm', bottom: '5mm', left: '5mm' },
                printBackground: true,
                preferCSSPageSize: true 
            });
            // if (this.sendProgress) this.sendProgress({ type: 'file_status', message: `Generating PDF`, currentFile: currentFileProgress, totalFiles: this.totalFiles, progress: baseProgress + 25 });
            
            await page.close();
            
            this.processedCount++;
            const duration = ((Date.now() - startTime) / 1000).toFixed(1);
            // console.log(`✅ [${this.processedCount}/${this.totalFiles}] Generated: ${path.basename(outputFile)} for ${originalFileName} (${duration}s)`);
            // More generic completion message for the file
            if (this.sendProgress) this.sendProgress({ type: 'file_complete', message: `File processed`, currentFile: this.processedCount, totalFiles: this.totalFiles, progress: 10 + (this.processedCount / this.totalFiles * 70) });
            return { success: true, input: originalFileName, output: outputFile, duration };
            
        } catch (error) {
            this.processedCount++; // Increment even on error for correct counting
            console.error(`❌ [${this.processedCount}/${this.totalFiles}] Error processing ${originalFileName}:`, error.message);
            if (this.sendProgress) this.sendProgress({ type: 'file_error', message: `Error processing file`, currentFile: this.processedCount, totalFiles: this.totalFiles, progress: 10 + (this.processedCount / this.totalFiles * 70), originalFileName: originalFileName /* Keep original name for error reporting if needed */ });
            return { success: false, input: originalFileName, error: error.message };
        }
    }

    async processConcurrently(fileTasks, maxConcurrency) {
        const results = [];
        this.maxConcurrency = Math.max(1, Math.min(10, maxConcurrency));
        // console.log(`⚡ Concurrency level for this batch: ${this.maxConcurrency} files at once`);
        if (this.sendProgress) this.sendProgress({ type: 'status', message: `Starting batch processing. Concurrency: ${this.maxConcurrency}`, progress: 10 + (this.processedCount / this.totalFiles * 70) });


        for (let i = 0; i < fileTasks.length; i += this.maxConcurrency) {
            const batch = fileTasks.slice(i, i + this.maxConcurrency);
            const batchNumber = Math.floor(i / this.maxConcurrency) + 1;
            const totalBatches = Math.ceil(fileTasks.length / this.maxConcurrency);
            
            // console.log(`🚀 Processing batch ${batchNumber}/${totalBatches} (${batch.length} files)`);
            if (this.sendProgress) this.sendProgress({ type: 'status', message: `Processing batch ${batchNumber}/${totalBatches}`, progress: 10 + (this.processedCount / this.totalFiles * 70) });
            
            const batchPromises = batch.map(({ tempFilePath, outputFile, originalName }) => 
                this.convertFileToPDF(tempFilePath, outputFile, originalName)
            );
            
            const batchResults = await Promise.allSettled(batchPromises);
            results.push(...batchResults.map(r => r.status === 'fulfilled' ? r.value : { success: false, error: r.reason?.message || 'Unknown error', input: r.reason?.input || 'Unknown file' }));
            
            if (i + this.maxConcurrency < fileTasks.length) {
                await new Promise(resolve => setTimeout(resolve, 100)); 
            }
        }
        return results;
    }

    async processUploadedFiles(uploadedFiles, outputDir, concurrency, sendProgressCallback) { // Modified
        this.sendProgress = sendProgressCallback; // Store callback for this run
        const overallStartTime = Date.now();
        this.processedCount = 0; 
        this.totalFiles = uploadedFiles.length;

        if (this.totalFiles === 0) {
            // console.log('📝 No files provided for conversion.');
            if (this.sendProgress) this.sendProgress({ type: 'status', message: 'No files to convert.', progress: 0 });
            return [];
        }

        // console.log(`📚 Received ${this.totalFiles} file(s) for conversion.`);
        if (this.sendProgress) this.sendProgress({ type: 'status', message: `Received ${this.totalFiles} file(s). Preparing...`, progress: 5, totalFiles: this.totalFiles });
        
        const fileTasks = [];
        for (const uploadedFile of uploadedFiles) {
            const originalName = uploadedFile.originalname;
            const tempFilePath = uploadedFile.path; 
            const outputFileName = originalName.replace(/\.(md|markdown)$/i, '.pdf');
            const outputFile = path.join(outputDir, outputFileName);
            
            await fs.ensureDir(path.dirname(outputFile)); 
            
            fileTasks.push({ tempFilePath, outputFile, originalName });
        }
        
        // console.log('🔥 Starting concurrent processing of uploaded files...');
        if (this.sendProgress) this.sendProgress({ type: 'status', message: 'Starting conversion process...', progress: 10, totalFiles: this.totalFiles });
        const conversionResults = await this.processConcurrently(fileTasks, concurrency);
        
        const totalDuration = ((Date.now() - overallStartTime) / 1000).toFixed(1);
        const successfulConversions = conversionResults.filter(r => r.success).length;
        
        // console.log('🎉 Batch conversion for uploaded files completed!');
        // console.log(`📊 Processed ${this.totalFiles} files. Successful: ${successfulConversions}, Failed: ${this.totalFiles - successfulConversions}. Total time: ${totalDuration}s`);
        if (this.sendProgress) this.sendProgress({ type: 'status', message: `Batch complete. Processed: ${this.totalFiles}, Successful: ${successfulConversions}.`, progress: 85 });
        
        return conversionResults;
    }

    async cleanup() {
        if (this.browser) {
            await this.browser.close();
            this.browser = null; // Important to allow re-init
            // console.log('🔒 Browser closed after conversion job.');
        }
    }
}

module.exports = MarkdownToPDFConverter;
