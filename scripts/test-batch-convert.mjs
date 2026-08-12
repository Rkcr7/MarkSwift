#!/usr/bin/env node
/**
 * Batch conversion smoke test.
 *
 * Why this exists: the multi-file branch in server.js is the only code path
 * that touches archiver, and it only runs when more than one file converts
 * successfully. An `archiver` major upgrade once shipped with every
 * single-file conversion working perfectly while every batch failed at 100%
 * with "archiver is not a function" — because archiver v8 dropped its callable
 * default export. Testing the converter in isolation could not catch that.
 *
 * This drives the real HTTP server: multer -> queue -> converter -> archiver
 * -> download, and asserts a genuine ZIP comes back with one entry per input.
 *
 * Usage:
 *   node server/server.js &                 # or npm start
 *   node scripts/test-batch-convert.mjs     # defaults to localhost:3000
 *
 * Env:
 *   BASE   base URL           (default http://127.0.0.1:3000)
 *   N      number of files    (default 5)
 *   MODE   normal|fast|max    (default normal)
 *   TIMEOUT  seconds to wait  (default 180)
 */

const BASE = process.env.BASE || 'http://127.0.0.1:3000';
const N = Number(process.env.N || 5);
const MODE = process.env.MODE || 'normal';
const TIMEOUT = Number(process.env.TIMEOUT || 180);

const ZIP_LOCAL_HEADER = '504b0304';
const ZIP_EOCD = '504b0506';

function fail(message) {
    console.error(`\n  FAIL: ${message}`);
    process.exit(1);
}

function buildForm() {
    const form = new FormData();
    for (let i = 1; i <= N; i++) {
        const markdown = [
            `# Document ${i}`,
            '',
            `Paragraph with **bold**, _italic_ and \`code\`.`,
            '',
            '| Metric | Value |',
            '|--------|-------|',
            `| Index  | ${i}   |`,
            '',
            `> Blockquote ${i}`,
            '',
        ].join('\n');
        form.append('markdownFiles', new Blob([markdown], { type: 'text/markdown' }), `doc-${i}.md`);
    }
    form.append('mode', MODE);
    return form;
}

async function main() {
    console.log(`Batch convert: ${N} file(s), mode=${MODE}, base=${BASE}`);
    const startedAt = Date.now();

    const response = await fetch(`${BASE}/api/convert`, { method: 'POST', body: buildForm() });
    if (!response.ok) {
        fail(`POST /api/convert returned ${response.status}: ${await response.text()}`);
    }

    const { sessionId } = await response.json();
    if (!sessionId) fail('response did not include a sessionId');
    console.log(`  queued as ${sessionId}`);

    // A single file comes back as a bare PDF, more than one as a ZIP named
    // after the first document (see buildArchiveName in server.js).
    const isBatch = N > 1;
    const name = isBatch ? `doc-1-and-${N - 1}-more.zip` : 'doc-1.pdf';
    const url = `${BASE}/api/download/${isBatch ? 'zip' : 'pdf'}/${sessionId}/${encodeURIComponent(name)}`;

    let body = null;
    for (let attempt = 0; attempt < TIMEOUT; attempt++) {
        await new Promise((resolve) => setTimeout(resolve, 1000));
        const download = await fetch(url);
        if (download.ok) {
            body = Buffer.from(await download.arrayBuffer());
            break;
        }
    }
    if (!body) fail(`output never became downloadable within ${TIMEOUT}s`);

    const elapsed = ((Date.now() - startedAt) / 1000).toFixed(1);

    if (!isBatch) {
        if (body.subarray(0, 5).toString() !== '%PDF-') fail('downloaded file is not a PDF');
        console.log(`  PDF ok: ${body.length} bytes in ${elapsed}s`);
        console.log('\nPASS');
        return;
    }

    if (body.subarray(0, 4).toString('hex') !== ZIP_LOCAL_HEADER) {
        fail(`downloaded file is not a ZIP (magic ${body.subarray(0, 4).toString('hex')})`);
    }

    // Entry count lives in the end-of-central-directory record.
    const eocd = body.lastIndexOf(Buffer.from(ZIP_EOCD, 'hex'));
    if (eocd < 0) fail('ZIP has no end-of-central-directory record');
    const entries = body.readUInt16LE(eocd + 10);

    console.log(`  ZIP ok: ${(body.length / 1024).toFixed(0)} KB, ${entries} entries, ${elapsed}s`);
    if (entries !== N) fail(`expected ${N} entries in the archive, got ${entries}`);

    console.log('\nPASS');
}

main().catch((error) => fail(error.message));
