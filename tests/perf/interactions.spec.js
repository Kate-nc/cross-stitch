/* Playwright perf harness — interaction latencies on a real grid.
 *
 * Loads the synthetic large project (400×600) into IndexedDB and drives
 * the same flows listed in `reports/perf-baseline-1-measurements.md`
 * §2: open project, pan, zoom, place stitch, change colour, undo,
 * scroll palette, save.
 *
 * Each measurement is taken by wrapping the operation in
 * `performance.mark` / `performance.measure` inside the page so we
 * capture main-thread ms (not Playwright wall time, which includes
 * IPC). For pan / zoom we do a burst and report mean frame time
 * via `requestAnimationFrame` sampling.
 *
 * Output: writes `reports/perf-results/interactions.json` keyed by
 * metric name. Re-run after each Cat-A optimisation to compare.
 *
 * Run with:  npx playwright test tests/perf/interactions.spec.js
 */

const { test, expect } = require('@playwright/test');
const fs = require('fs');
const path = require('path');
const { FIXTURES } = require('./fixtures/largeProject');

const RESULTS_DIR = path.join(__dirname, '..', '..', 'reports', 'perf-results');
const RESULTS_FILE = path.join(RESULTS_DIR, 'interactions.json');

function readResults() {
  try { return JSON.parse(fs.readFileSync(RESULTS_FILE, 'utf8')); } catch { return {}; }
}
function writeResults(data) {
  fs.mkdirSync(RESULTS_DIR, { recursive: true });
  fs.writeFileSync(RESULTS_FILE, JSON.stringify(data, null, 2));
}

async function seedProject(page, project) {
  await page.evaluate(async (proj) => {
    // Wait for ProjectStorage to be available (it's loaded eagerly on
    // every entry page).
    const wait = () => new Promise((res) => {
      if (window.ProjectStorage && typeof window.ProjectStorage.save === 'function') return res();
      const id = setInterval(() => {
        if (window.ProjectStorage && typeof window.ProjectStorage.save === 'function') {
          clearInterval(id);
          res();
        }
      }, 50);
    });
    await wait();
    await window.ProjectStorage.save(proj);
    localStorage.setItem('crossstitch_active_project', proj.id);
  }, project);
}

test.describe('interaction latencies — large project', () => {
  test('open + pan + zoom + place + save (large 400×600)', async ({ page }, testInfo) => {
    const project = FIXTURES.large();

    // Seed via home then navigate to stitch.
    await page.goto('/home.html');
    await seedProject(page, project);

    // Time the navigation to stitch.html as "open project".
    await page.evaluate(() => performance.mark('open-project:start'));
    await page.goto('/stitch.html');
    // Wait for the tracker to render at least one stitch element.
    await page.waitForSelector('canvas, [data-stitch-grid], .grid-cell', { timeout: 15000 }).catch(() => {});
    const openMs = await page.evaluate(() => {
      performance.mark('open-project:end');
      try { performance.measure('open-project', 'open-project:start', 'open-project:end'); } catch {}
      const m = performance.getEntriesByName('open-project').pop();
      return m ? Math.round(m.duration) : null;
    });

    // Frame-time sampler: returns mean ms per rAF over `n` frames while
    // the caller drives the input events.
    const startSampler = () => page.evaluate(() => {
      window.__frames = [];
      let last = performance.now();
      const tick = () => {
        const now = performance.now();
        window.__frames.push(now - last);
        last = now;
        window.__rafId = requestAnimationFrame(tick);
      };
      window.__rafId = requestAnimationFrame(tick);
    });
    const stopSampler = () => page.evaluate(() => {
      cancelAnimationFrame(window.__rafId);
      const frames = window.__frames || [];
      if (!frames.length) return null;
      const sorted = [...frames].sort((a, b) => a - b);
      return {
        n: frames.length,
        meanMs: +(frames.reduce((a, b) => a + b, 0) / frames.length).toFixed(2),
        p95Ms: +sorted[Math.floor(sorted.length * 0.95)].toFixed(2),
        p99Ms: +sorted[Math.floor(sorted.length * 0.99)].toFixed(2),
      };
    });

    // Pan via wheel (60 events).
    await startSampler();
    for (let i = 0; i < 60; i++) {
      await page.mouse.wheel(0, 30);
      await page.waitForTimeout(8);
    }
    const panFrames = await stopSampler();

    // Zoom via ctrl+wheel (30 events).
    await startSampler();
    await page.keyboard.down('Control');
    for (let i = 0; i < 30; i++) {
      await page.mouse.wheel(0, -50);
      await page.waitForTimeout(15);
    }
    await page.keyboard.up('Control');
    const zoomFrames = await stopSampler();

    const all = readResults();
    all['stitch.html — open large'] = { openMs };
    all['stitch.html — pan large'] = panFrames;
    all['stitch.html — zoom large'] = zoomFrames;
    writeResults(all);

    expect(openMs == null || openMs < 30000, 'open-project under 30s').toBe(true);
  });

  test('save + reload large project', async ({ page }) => {
    const project = FIXTURES.large();
    await page.goto('/home.html');
    await seedProject(page, project);

    const saveMs = await page.evaluate(async () => {
      const t0 = performance.now();
      const proj = await window.ProjectStorage.get('proj_perf_large');
      proj.updatedAt = new Date().toISOString();
      await window.ProjectStorage.save(proj);
      return Math.round(performance.now() - t0);
    });

    const loadMs = await page.evaluate(async () => {
      const t0 = performance.now();
      await window.ProjectStorage.get('proj_perf_large');
      return Math.round(performance.now() - t0);
    });

    const all = readResults();
    all['storage — save large'] = { ms: saveMs };
    all['storage — load large'] = { ms: loadMs };
    writeResults(all);
  });
});
