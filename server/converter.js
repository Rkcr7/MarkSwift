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

    async init() {
        if (!this.browser) {
            console.log('🌐 Launching browser for conversion...');
            this.browser = await puppeteer.launch(this.puppeteerLaunchOptions);
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
        try {
            console.log(`📄 [${this.processedCount + 1}/${this.totalFiles}] Processing: ${originalFileName}`);
            
            const markdownContent = await fs.readFile(inputFile, 'utf8');
            const htmlContent = await this.convertMarkdownToHTML(markdownContent);
            
            const page = await this.browser.newPage();
            await page.setContent(htmlContent, { waitUntil: 'networkidle0' });
            
            await page.pdf({
                path: outputFile,
                format: 'A4',
                margin: { top: '5mm', right: '5mm', bottom: '5mm', left: '5mm' }, // Minimized PDF margins
                printBackground: true,
                preferCSSPageSize: true 
            });
            
            await page.close();
            
            this.processedCount++;
            const duration = ((Date.now() - startTime) / 1000).toFixed(1);
            console.log(`✅ [${this.processedCount}/${this.totalFiles}] Generated: ${path.basename(outputFile)} for ${originalFileName} (${duration}s)`);
            return { success: true, input: originalFileName, output: outputFile, duration };
            
        } catch (error) {
            this.processedCount++;
            console.error(`❌ [${this.processedCount}/${this.totalFiles}] Error processing ${originalFileName}:`, error.message);
            return { success: false, input: originalFileName, error: error.message };
        }
    }

    async processConcurrently(fileTasks, maxConcurrency) {
        const results = [];
        this.maxConcurrency = Math.max(1, Math.min(10, maxConcurrency)); // Validate and set
        console.log(`⚡ Concurrency level for this batch: ${this.maxConcurrency} files at once`);

        for (let i = 0; i < fileTasks.length; i += this.maxConcurrency) {
            const batch = fileTasks.slice(i, i + this.maxConcurrency);
            
            console.log(`🚀 Processing batch ${Math.floor(i / this.maxConcurrency) + 1}/${Math.ceil(fileTasks.length / this.maxConcurrency)} (${batch.length} files)`);
            
            const batchPromises = batch.map(({ tempFilePath, outputFile, originalName }) => 
                this.convertFileToPDF(tempFilePath, outputFile, originalName)
            );
            
            const batchResults = await Promise.allSettled(batchPromises);
            results.push(...batchResults.map(r => r.status === 'fulfilled' ? r.value : { success: false, error: r.reason?.message || 'Unknown error', input: r.reason?.input || 'Unknown file' }));
            
            if (i + this.maxConcurrency < fileTasks.length) {
                await new Promise(resolve => setTimeout(resolve, 100)); // Small delay
            }
        }
        return results;
    }

    async processUploadedFiles(uploadedFiles, outputDir, concurrency) {
        // uploadedFiles is an array of objects like { path: tempFilePath, originalname: originalFileName }
        const overallStartTime = Date.now();
        this.processedCount = 0; // Reset for each call
        this.totalFiles = uploadedFiles.length;

        if (this.totalFiles === 0) {
            console.log('📝 No files provided for conversion.');
            return [];
        }

        console.log(`📚 Received ${this.totalFiles} file(s) for conversion.`);
        
        const fileTasks = [];
        for (const uploadedFile of uploadedFiles) {
            const originalName = uploadedFile.originalname;
            const tempFilePath = uploadedFile.path; // Path where multer saved the file
            const outputFileName = originalName.replace(/\.(md|markdown)$/i, '.pdf');
            const outputFile = path.join(outputDir, outputFileName);
            
            await fs.ensureDir(path.dirname(outputFile)); // Ensure output sub-directory exists if any
            
            fileTasks.push({ tempFilePath, outputFile, originalName });
        }
        
        console.log('🔥 Starting concurrent processing of uploaded files...');
        const conversionResults = await this.processConcurrently(fileTasks, concurrency);
        
        const totalDuration = ((Date.now() - overallStartTime) / 1000).toFixed(1);
        const successfulConversions = conversionResults.filter(r => r.success).length;
        
        console.log('🎉 Batch conversion for uploaded files completed!');
        console.log(`📊 Processed ${this.totalFiles} files. Successful: ${successfulConversions}, Failed: ${this.totalFiles - successfulConversions}. Total time: ${totalDuration}s`);
        
        return conversionResults; // Array of { success: boolean, input: string, output?: string, error?: string, duration?: string }
    }

    async cleanup() {
        if (this.browser) {
            await this.browser.close();
            this.browser = null; // Important to allow re-init
            console.log('🔒 Browser closed after conversion job.');
        }
    }
}

module.exports = MarkdownToPDFConverter;
