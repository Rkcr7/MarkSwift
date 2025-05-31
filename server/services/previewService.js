// server/services/previewService.js
const { marked } = require('marked'); // Use named import for ES modules or default import if CJS

class PreviewService {
    constructor(logMessage) {
        this.logMessage = logMessage;
        // Configure marked (optional, but good for consistency)
        marked.setOptions({
            renderer: new marked.Renderer(),
            pedantic: false,
            gfm: true,
            breaks: false,
            sanitize: false, // IMPORTANT: Ensure output is sanitized on the client if displaying raw HTML from untrusted sources. For our own editor, this might be okay.
            smartLists: true,
            smartypants: false,
            xhtml: false
        });
        this.logMessage('info', '[PreviewService] Initialized.');
    }

    convertToHtml(markdownText) {
        if (typeof markdownText !== 'string') {
            this.logMessage('warn', '[PreviewService] convertToHtml called with non-string input.');
            return ''; // Or throw an error
        }
        try {
            const html = marked.parse(markdownText);
            // this.logMessage('debug', '[PreviewService] Markdown converted to HTML successfully.');
            return html;
        } catch (error) {
            this.logMessage('error', '[PreviewService] Error converting Markdown to HTML:', error);
            throw new Error('Failed to parse Markdown to HTML.'); // Or return an error string
        }
    }
}

module.exports = PreviewService;
