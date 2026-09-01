/* devicePixelRatio-correct chart rendering — Part 8 / task 4.
   ═══════════════════════════════════════════════════════════════════════════
   Chart canvases were rendered at 1 CSS px per device pixel and upscaled by
   the browser, so symbols and grid lines were visibly soft on every phone and
   tablet (DPR 2-3). mobile-experience-audit.md A5 flagged it and gated it on
   viewport tiling, which has since landed.

   The change is narrow: the chart's *backing store* is multiplied by
   `chartRenderScale()`, its CSS size is not, and the scale folds into the
   same transform that already carries the tile origin. Overlays stay at 1x.

   Three ways this could go wrong, one test each:

     1. the chart renders at double size (CSS size left to follow the backing
        store);
     2. taps land in the wrong cell (the scale is missing from a
        screen-to-chart conversion);
     3. the memory it costs pushes the page past the device budget — which
        would trade the freeze back for sharpness.
*/
const { test, expect } = require('@playwright/test');
const { fixtureFor } = require('../_helpers/trackerFixture');
const {
  MEMORY, emulateDeviceMemory, canvasCensus, budgetReport, suppressOnboarding, SCROLLER_FN,
} = require('../_helpers/deviceEmulation');

async function openTracker(page, sizeName) {
  const errors = [];
  page.on('pageerror', e => errors.push(String(e)));
  await page.goto('/stitch.html?from=home', { waitUntil: 'load', timeout: 120000 });
  await page.locator('input[type="file"]').first().setInputFiles(fixtureFor(sizeName || 'large'));
  await page.waitForSelector('canvas', { timeout: 90000 });
  await page.waitForTimeout(3500);
  return errors;
}

const chartGeometry = (page) => page.evaluate(() => {
  const c = document.querySelector('canvas');
  const r = c.getBoundingClientRect();
  return {
    backing: [c.width, c.height],
    cssAttr: [c.style.width, c.style.height],
    rect: [Math.round(r.width), Math.round(r.height)],
    scale: window.chartRenderScale ? window.chartRenderScale() : null,
    dpr: window.devicePixelRatio,
  };
});

test('the chart backing store scales with DPR but its CSS size does not', async ({ page }) => {
  await suppressOnboarding(page);
  await emulateDeviceMemory(page, MEMORY.highEnd);
  const errors = await openTracker(page);
  const g = await chartGeometry(page);
  console.log('DPR_GEOMETRY ' + JSON.stringify(g));

  expect(errors).toEqual([]);
  expect(g.scale, 'a DPR-2.5 tablet with budget headroom should render above 1x').toBeGreaterThan(1);
  // The element occupies its CSS size on the page...
  expect(g.rect[0]).toBe(parseInt(g.cssAttr[0], 10));
  // ...while the backing store is that size times the scale. If the CSS size
  // were left unset the element would take the backing store's dimensions and
  // the whole chart would render at double size.
  expect(g.backing[0]).toBe(Math.round(g.rect[0] * g.scale));
  expect(g.backing[1]).toBe(Math.round(g.rect[1] * g.scale));
});

test('overlays stay at 1x — the headroom is spent on the chart', async ({ page }) => {
  // Overlays draw large flat shapes (dimming, block outlines, breadcrumbs)
  // where a finer raster buys almost nothing, and scaling them too would
  // multiply the memory for no visible gain.
  await suppressOnboarding(page);
  await emulateDeviceMemory(page, MEMORY.highEnd);
  await openTracker(page);
  const r = await page.evaluate(() => [...document.querySelectorAll('canvas')]
    .filter(c => c.width > 0)
    .map(c => ({ backing: c.width, css: parseInt(c.style.width, 10) || null })));
  console.log('DPR_OVERLAYS ' + JSON.stringify(r));
  const scaled = r.filter(c => c.css && c.backing > c.css);
  // Exactly one canvas — the chart — is scaled.
  expect(scaled.length).toBe(1);
});

test('DPR does not push the page past the device budget', async ({ page }) => {
  await suppressOnboarding(page);
  await emulateDeviceMemory(page, MEMORY.highEnd);
  await openTracker(page, 'huge');
  const [b, c] = [await budgetReport(page), await canvasCensus(page)];
  console.log('DPR_BUDGET ' + JSON.stringify({ budget: b, canvas: c }));
  expect(c.totalPx, 'sharper chart must not cost more than the device allows').toBeLessThanOrEqual(b.area);
});

test('a low-memory device does not spend its memory on sharpness', async ({ page }) => {
  await suppressOnboarding(page);
  await emulateDeviceMemory(page, MEMORY.lowEnd);
  await openTracker(page);
  const g = await chartGeometry(page);
  console.log('DPR_LOWEND ' + JSON.stringify(g));
  expect(g.scale).toBe(1);
  expect(g.backing[0]).toBe(g.rect[0]);
});

test('a tap still lands on the cell under it at DPR > 1', async ({ page }) => {
  // The scale is folded into the same transform as the tile origin, and every
  // screen-to-chart conversion goes through getBoundingClientRect, which is in
  // CSS pixels. If that assumption were wrong, taps would land at half or
  // double the intended cell — so this checks the app's saved record against
  // an index computed independently from the scroller.
  await suppressOnboarding(page);
  await emulateDeviceMemory(page, MEMORY.highEnd);
  await openTracker(page);

  await page.evaluate((fn) => {
    const el = eval('(' + fn + ')')();
    el.scrollLeft = 900; el.scrollTop = 1100;
    el.dispatchEvent(new Event('scroll'));
  }, SCROLLER_FN.toString());
  await page.waitForTimeout(1000);

  const target = await page.evaluate((fn) => {
    const el = eval('(' + fn + ')')();
    const sr = el.getBoundingClientRect();
    const px = Math.round(sr.left + sr.width * 0.55);
    const py = Math.round(sr.top + sr.height * 0.55);
    const G = 28, scs = 20;
    return {
      px, py,
      gx: Math.floor((el.scrollLeft + (px - sr.left) - G) / scs),
      gy: Math.floor((el.scrollTop + (py - sr.top) - G) / scs),
      scale: window.chartRenderScale(),
    };
  }, SCROLLER_FN.toString());

  expect(target.scale, 'test is vacuous at scale 1').toBeGreaterThan(1);

  await page.mouse.click(target.px, target.py);
  await page.waitForTimeout(7000);   // past the 5 s autosave debounce

  const marked = await page.evaluate(() => new Promise((resolve) => {
    const req = indexedDB.open('CrossStitchDB');
    req.onerror = () => resolve({ error: 'open failed' });
    req.onsuccess = () => {
      const tx = req.result.transaction('projects', 'readonly');
      const all = tx.objectStore('projects').getAll();
      all.onsuccess = () => {
        const rows = (all.result || []).filter(p => p && p.done && p.settings);
        if (!rows.length) return resolve({ error: 'no saved project' });
        const p = rows.sort((a, b) => String(b.updatedAt || '').localeCompare(String(a.updatedAt || '')))[0];
        const idx = [];
        for (let i = 0; i < p.done.length && idx.length < 4; i++) if (p.done[i]) idx.push(i);
        resolve({ sW: p.settings.sW, marked: idx });
      };
      all.onerror = () => resolve({ error: 'read failed' });
    };
  }));
  console.log('DPR_TAP ' + JSON.stringify({ target, marked }));

  expect(marked.error).toBeUndefined();
  expect(marked.marked.length, 'the tap marked nothing').toBeGreaterThan(0);
  expect({
    gx: marked.marked[0] % marked.sW,
    gy: Math.floor(marked.marked[0] / marked.sW),
  }).toEqual({ gx: target.gx, gy: target.gy });
});
