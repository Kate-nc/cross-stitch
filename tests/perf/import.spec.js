/* Playwright perf harness — import pipeline cost on real fixtures.
 *
 * Drives `window.ImportEngine.importPattern` against the example DMC PDFs
 * in `TestUploads/` and times each pipeline stage by listening for the
 * progress callbacks the engine emits.
 *
 * Output: writes `reports/perf-results/import.json` keyed by file name.
 *
 * Run with:  npx playwright test tests/perf/import.spec.js
 *
 * NOTE: this depends on the dev server serving `/TestUploads/*.pdf` —
 * `serve.js` does so by default.
 */

const { test, expect } = require('@playwright/test');
const fs = require('fs');
const path = require('path');

const RESULTS_DIR = path.join(__dirname, '..', '..', 'reports', 'perf-results');
const RESULTS_FILE = path.join(RESULTS_DIR, 'import.json');

const FILES = [
  { url: '/TestUploads/PAT1968_2.pdf', label: 'PAT1968_2 (342 KB)' },
  { url: '/TestUploads/PAT2171_2.pdf', label: 'PAT2171_2 (1.4 MB)' },
  { url: '/TestUploads/Books and Blossoms.pdf', label: 'Books and Blossoms (8.1 MB)' },
];

function readResults() {
  try { return JSON.parse(fs.readFileSync(RESULTS_FILE, 'utf8')); } catch { return {}; }
}
function writeResults(data) {
  fs.mkdirSync(RESULTS_DIR, { recursive: true });
  fs.writeFileSync(RESULTS_FILE, JSON.stringify(data, null, 2));
}

for (const f of FILES) {
  test(`import — ${f.label}`, async ({ page }) => {
    await page.goto('/home.html');

    // Wait for the engine to attach.
    await page.waitForFunction(() =>
      window.ImportEngine && typeof window.ImportEngine.importPattern === 'function',
      null, { timeout: 15000 });

    const heapBefore = await page.evaluate(() =>
      performance.memory ? performance.memory.usedJSHeapSize : null);

    const result = await page.evaluate(async (url) => {
      const resp = await fetch(url);
      const blob = await resp.blob();
      const file = new File([blob], url.split('/').pop(), { type: 'application/pdf' });
      const stages = [];
      const t0 = performance.now();
      const heapPeak = { v: performance.memory ? performance.memory.usedJSHeapSize : 0 };
      const peakSampler = setInterval(() => {
        if (performance.memory) {
          heapPeak.v = Math.max(heapPeak.v, performance.memory.usedJSHeapSize);
        }
      }, 50);
      let result;
      try {
        result = await window.ImportEngine.importPattern(file, {
          onProgress: (msg) => stages.push({ ms: Math.round(performance.now() - t0), ...msg }),
        });
      } finally {
        clearInterval(peakSampler);
      }
      const totalMs = Math.round(performance.now() - t0);
      return {
        ok: !!(result && result.ok),
        warnings: result && result.warnings ? result.warnings.length : 0,
        publisher: result && result.publisher,
        totalMs,
        heapPeak: heapPeak.v,
        stages,
      };
    }, f.url);

    // Force a couple of GC cycles before sampling post-import heap.
    await page.evaluate(() => new Promise((res) => setTimeout(res, 1500)));
    const heapAfter = await page.evaluate(() =>
      performance.memory ? performance.memory.usedJSHeapSize : null);

    const all = readResults();
    all[f.label] = {
      ...result,
      heapBefore,
      heapAfter,
      heapGrowth: heapBefore != null && heapAfter != null ? heapAfter - heapBefore : null,
      capturedAt: new Date().toISOString(),
    };
    writeResults(all);

    expect(result.totalMs).toBeLessThan(60000);
  });
}
