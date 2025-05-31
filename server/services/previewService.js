// server/services/previewService.js
const { marked } = require('marked');
const createDOMPurify = require('dompurify');
const { JSDOM } = require('jsdom');

// Setup DOMPurify for Node.js (same as converter.js)
const window = new JSDOM('').window;
const DOMPurify = createDOMPurify(window);

class PreviewService {
    constructor(logMessage) {
        this.logMessage = logMessage;
        // Configure marked to match converter.js settings
        this.logMessage('info', '[PreviewService] Initialized with PDF-matching configuration.');
    }

    convertToHtml(markdownText) {
        if (typeof markdownText !== 'string') {
            this.logMessage('warn', '[PreviewService] convertToHtml called with non-string input.');
            return '';
        }
        
        try {
            // Use same options as converter.js
            const options = { headerIds: false, mangle: false };
            const html = marked.parse(markdownText, options);
            const sanitized = DOMPurify.sanitize(html);
            
            // Return HTML with professional styling optimized for our preview container
            const styledHtml = this.wrapWithPreviewStyles(sanitized);
            
            return styledHtml;
        } catch (error) {
            this.logMessage('error', '[PreviewService] Error converting Markdown to HTML:', error);
            throw new Error('Failed to parse Markdown to HTML.');
        }
    }

    wrapWithPreviewStyles(htmlContent) {
        // Optimized CSS for the professional preview container
        // This matches PDF output but is optimized for web display in our container
        return `
            <style>
                .preview-content { 
                    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", "Noto Sans", Helvetica, Arial, sans-serif; 
                    font-size: 16px; 
                    line-height: 1.6; 
                    color: #24292f; 
                    background-color: transparent; 
                    margin: 0; 
                    padding: 0; 
                    max-width: none; 
                    word-wrap: break-word; 
                }
                .preview-content h1, .preview-content h2, .preview-content h3, 
                .preview-content h4, .preview-content h5, .preview-content h6 { 
                    margin-top: 24px; 
                    margin-bottom: 16px; 
                    font-weight: 600; 
                    line-height: 1.25; 
                }
                .preview-content h1 { 
                    font-size: 2em; 
                    border-bottom: 1px solid #d1d9e0; 
                    padding-bottom: 10px; 
                }
                .preview-content h2 { 
                    font-size: 1.5em; 
                    border-bottom: 1px solid #d1d9e0; 
                    padding-bottom: 8px; 
                }
                .preview-content h3 { font-size: 1.25em; } 
                .preview-content h4 { font-size: 1em; } 
                .preview-content h5 { font-size: 0.875em; } 
                .preview-content h6 { font-size: 0.85em; color: #656d76; }
                .preview-content p { 
                    margin-top: 0; 
                    margin-bottom: 16px; 
                }
                .preview-content blockquote { 
                    padding: 0 1em; 
                    color: #656d76; 
                    border-left: 0.25em solid #d1d9e0; 
                    margin: 0 0 16px 0; 
                }
                .preview-content ul, .preview-content ol { 
                    margin-top: 0; 
                    margin-bottom: 16px; 
                    padding-left: 2em; 
                } 
                .preview-content li { 
                    margin: 0.25em 0; 
                }
                .preview-content table { 
                    border-spacing: 0; 
                    border-collapse: collapse; 
                    margin-top: 0; 
                    margin-bottom: 16px; 
                    display: table; 
                    width: 100%; 
                    table-layout: fixed; 
                    max-width: 100%; 
                    overflow: auto; 
                }
                .preview-content table th, .preview-content table td { 
                    padding: 6px 13px; 
                    border: 1px solid #d1d9e0; 
                    word-wrap: break-word; 
                }
                .preview-content table th { 
                    background-color: #f6f8fa; 
                    font-weight: 600; 
                }
                .preview-content code { 
                    padding: 0.2em 0.4em; 
                    background-color: #f6f8fa; 
                    border-radius: 6px; 
                    font-size: 85%; 
                    font-family: ui-monospace, SFMono-Regular, "SF Mono", Consolas, "Liberation Mono", Menlo, monospace; 
                    overflow-wrap: break-word; 
                    word-break: normal; 
                }
                .preview-content pre { 
                    padding: 16px; 
                    overflow: visible; 
                    background-color: #f6f8fa; 
                    border-radius: 6px; 
                    margin-top: 0; 
                    margin-bottom: 16px; 
                    white-space: pre-wrap; 
                    overflow-wrap: break-word; 
                    word-break: normal; 
                }
                .preview-content pre code { 
                    padding: 0; 
                    background-color: transparent; 
                    border-radius: 0; 
                    white-space: pre-wrap; 
                    overflow-wrap: break-word; 
                    word-break: normal; 
                }
                .preview-content img { 
                    max-width: 100%; 
                    height: auto; 
                    border-radius: 6px;
                    display: inline-block !important;
                    margin: 2px 4px;
                    vertical-align: middle;
                }
                .preview-content a { 
                    color: #0969da; 
                    text-decoration: none; 
                } 
                .preview-content a:hover { 
                    text-decoration: underline; 
                }
                .preview-content hr {
                    border: none;
                    border-top: 1px solid #d1d9e0;
                    margin: 24px 0;
                }
                /* Ensure first element has no top margin */
                .preview-content > *:first-child {
                    margin-top: 0 !important;
                }
                /* Ensure last element has proper bottom margin */
                .preview-content > *:last-child {
                    margin-bottom: 0 !important;
                }
                /* FIXED: Centered divs with badges - NO SCROLLING */
                .preview-content div[align="center"] {
                    text-align: center;
                    padding: 8px 0;
                    margin: 16px 0;
                    line-height: 1.8;
                    /* Allow natural wrapping, no forced horizontal scrolling */
                }
                /* Shield badges specific styling - NO FORCED WIDTH */
                .preview-content a img[src*="shields.io"],
                .preview-content a img[src*="badge"],
                .preview-content img[src*="shields.io"],
                .preview-content img[src*="badge"] {
                    display: inline !important;
                    margin: 3px 4px !important;
                    vertical-align: middle !important;
                    border-radius: 4px !important;
                    max-width: none !important;
                    width: auto !important;
                    /* Natural wrapping behavior */
                }
            </style>
            <div class="preview-content">${htmlContent}</div>
        `;
    }
}

module.exports = PreviewService;
