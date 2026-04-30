/* Playwright perf harness — startup cost per entry page.
 *
 * Measures, in a real browser, what `reports/perf-baseline-1-measurements.md`
 * could only describe statically:
 *   - bytes transferred for the eager script tags (network breakdown)
 *   - parse + execute time on the main thread before `DOMContentLoaded`
 *   - time to `load`
 *   - JS heap size after settling
 *
 * Output: writes `reports/perf-results/startup.json`.
 *
 * Run with:  npx playwright test tests/perf/startup.spec.js --project=chromium
 *
 * Re-run after each Cat-A optimisation to fill the before/after columns
 * in `reports/perf-results-1-final-measurements.md`.
 */

const { test, expect, devices } = require('@playwright/test');
const fs = require('fs');
const path = require('path');

const PAGES = ['/home.html', '/index.html', '/create.html', '/stitch.html', '/manager.html'];
const RESULTS_DIR = path.join(__dirname, '..', '..', 'reports', 'perf-results');
const RESULTS_FILE = path.join(RESULTS_DIR, 'startup.json');

function ensureDir() { fs.mkdirSync(RESULTS_DIR, { recursive: true }); }

function readResults() {
  try { return JSON.parse(fs.readFileSync(RESULTS_FILE, 'utf8')); } catch { return {}; }
}

function writeResults(data) {
  ensureDir();
  fs.writeFileSync(RESULTS_FILE, JSON.stringify(data, null, 2));
}

for (const route of PAGES) {
  test(`startup cost — ${route}`, async ({ page, browserName }, testInfo) => {
    // Capture every script the browser fetches so we can size the eager
    // bundle without trusting source order.
    const scripts = [];
    page.on('response', async (resp) => {
      const url = resp.url();
      const req = resp.request();
      if (req.resourceType() !== 'script') return;
      let bytes = 0;
      try { const buf = await resp.body(); bytes = buf.length; } catch { /* ignore */ }
      scripts.push({ url, status: resp.status(), bytes });
    });

    const t0 = Date.now();
    await page.goto(route, { waitUntil: 'load' });
    const wallLoadMs = Date.now() - t0;

    // Wait for the page to settle (idle network for 500ms, capped at 3s)
    await page.waitForLoadState('networkidle').catch(() => {});

    const timings = await page.evaluate(() => {
      const nav = performance.getEntriesByType('navigation')[0] || {};
      const paint = performance.getEntriesByType('paint');
      const fcp = paint.find((p) => p.name === 'first-contentful-paint');
      // performance.memory is Chromium-only; gracefully degrade.
      const mem = performance.memory ? {
        usedJSHeap: performance.memory.usedJSHeapSize,
        totalJSHeap: performance.memory.totalJSHeapSize,
      } : null;
      return {
        domContentLoaded: nav.domContentLoadedEventEnd ? Math.round(nav.domContentLoadedEventEnd - nav.startTime) : null,
        load: nav.loadEventEnd ? Math.round(nav.loadEventEnd - nav.startTime) : null,
        fcp: fcp ? Math.round(fcp.startTime) : null,
        memory: mem,
      };
    });

    const totalScriptBytes = scripts.reduce((a, s) => a + (s.bytes || 0), 0);
    const projectScriptBytes = scripts
      .filter((s) => !/cdnjs\.cloudflare\.com/.test(s.url))
      .reduce((a, s) => a + (s.bytes || 0), 0);

    const all = readResults();
    all[route] = {
      wallLoadMs,
      timings,
      browser: browserName,
      device: testInfo.project.name,
      totals: {
        scripts: scripts.length,
        totalScriptBytes,
        projectScriptBytes,
      },
      scriptsBreakdown: scripts.sort((a, b) => b.bytes - a.bytes).slice(0, 20),
      capturedAt: new Date().toISOString(),
    };
    writeResults(all);

    expect(timings.load, `load time for ${route}`).toBeLessThan(30000);
  });
}
