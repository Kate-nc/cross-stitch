/* tests/pdfExportWorkerCSP.test.js
 *
 * Regression guard: ensures every URL inside importScripts() calls in
 * pdf-export-worker.js is either:
 *   - a relative path (no protocol), or
 *   - on the one external CDN allowed by the app's Content-Security-Policy
 *     (https://cdnjs.cloudflare.com).
 *
 * The CSP in all HTML entry-points only whitelists cdnjs.cloudflare.com for
 * external scripts. Any other absolute URL (e.g. cdn.jsdelivr.net, unpkg.com)
 * will be blocked by the browser and cause a runtime NetworkError in the worker.
 *
 * Allowed origins:
 *   - relative paths (no protocol)            ← 'self' in CSP
 *   - https://cdnjs.cloudflare.com/**         ← explicitly allowed
 */

const fs = require('fs');
const path = require('path');

const WORKER_FILE = path.join(__dirname, '..', 'pdf-export-worker.js');
const ALLOWED_EXTERNAL_ORIGIN = 'https://cdnjs.cloudflare.com';

// Extract every argument string from importScripts(...) calls.
// Handles single/double quotes and multi-line call blocks.
function extractImportScriptsUrls(src) {
  const urls = [];
  // Match each importScripts( ... ) block (potentially multi-line)
  const blockRe = /importScripts\s*\(([\s\S]*?)\)/g;
  let blockMatch;
  while ((blockMatch = blockRe.exec(src)) !== null) {
    const args = blockMatch[1];
    // Extract individual quoted strings within the block
    const strRe = /["']([^"']+)["']/g;
    let strMatch;
    while ((strMatch = strRe.exec(args)) !== null) {
      urls.push(strMatch[1]);
    }
  }
  return urls;
}

describe('pdf-export-worker.js — CSP-compliant importScripts URLs', () => {
  let workerSrc;
  let importedUrls;

  beforeAll(() => {
    workerSrc = fs.readFileSync(WORKER_FILE, 'utf8');
    importedUrls = extractImportScriptsUrls(workerSrc);
  });

  test('worker file exists and contains at least one importScripts call', () => {
    expect(workerSrc.length).toBeGreaterThan(0);
    expect(importedUrls.length).toBeGreaterThan(0);
  });

  test('every importScripts URL is either a relative path or on cdnjs.cloudflare.com', () => {
    const violations = importedUrls.filter((url) => {
      // Relative paths are fine ('self' matches them in CSP)
      if (!url.startsWith('http://') && !url.startsWith('https://')) return false;
      // cdnjs is explicitly whitelisted
      if (url.startsWith(ALLOWED_EXTERNAL_ORIGIN)) return false;
      // Everything else is a violation
      return true;
    });

    if (violations.length > 0) {
      throw new Error(
        `pdf-export-worker.js imports scripts from CSP-blocked origins:\n` +
          violations.map((u) => `  - ${u}`).join('\n') +
          `\n\nOnly relative paths and ${ALLOWED_EXTERNAL_ORIGIN} are permitted.\n` +
          `To fix: copy the package to assets/ and reference it as a relative path.`
      );
    }
  });

  test('fontkit is NOT loaded from an external CDN (must use local assets/)', () => {
    const externalFontkit = importedUrls.find(
      (url) => url.includes('fontkit') && (url.startsWith('http://') || url.startsWith('https://'))
    );
    expect(externalFontkit).toBeUndefined();
  });

  test('local fontkit asset file exists on disk', () => {
    const fontkitAsset = path.join(__dirname, '..', 'assets', 'fontkit.umd.min.js');
    expect(fs.existsSync(fontkitAsset)).toBe(true);
  });
});
