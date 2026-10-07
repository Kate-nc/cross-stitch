/* Work area: the chart clipped to a group of Spotlight sections.
   ═══════════════════════════════════════════════════════════════════════════
   reports/work-area-prototype.html and reports/track-view-performance-plan.md
   (Phase 3). Driven through window.__workArea so these checks do not depend
   on where the controls live.

   What must hold:
     - the scroller's extent and the rulers cover the area plus its margin and
       nothing else, and the chart tile stays inside that view;
     - stitches inside the area mark; margin stitches cannot be marked;
     - leaving restores the whole chart;
     - the area is saved with the project and comes back on reload. */
const { test, expect } = require('@playwright/test');
const { fixtureFor } = require('../_helpers/trackerFixture');
const { suppressOnboarding } = require('../_helpers/deviceEmulation');

const G = 28;
const AREA = { x0: 100, y0: 150, x1: 150, y1: 200, bw: 5, bh: 5 };   // 5x5 sections of 10

async function openTracker(page) {
  await suppressOnboarding(page);
  await page.goto('/stitch.html?from=home', { waitUntil: 'load', timeout: 120000 });
  await page.locator('input[type="file"]').first().setInputFiles(fixtureFor('large'));
  await page.waitForSelector('canvas', { timeout: 90000 });
  await page.waitForFunction(() => !!window.__workArea, null, { timeout: 30000 });
  await page.waitForTimeout(2500);
}

const state = (page) => page.evaluate((G) => {
  const el = document.querySelector('.tracker-chart-scroll');
  const c = document.querySelector('canvas[aria-label="Cross stitch pattern grid"]');
  const rulerCells = document.querySelector('.tracker-chart-scroll > div').children.length - 1;
  const rowCells = document.querySelector('.tracker-chart-scroll > div:nth-child(2)').firstElementChild.children.length;
  const cell = document.querySelector('.tracker-chart-scroll > div').children[1].getBoundingClientRect().width;
  return {
    area: window.__workArea.get(), view: window.__workArea.view(),
    scrollW: el.scrollWidth, scrollH: el.scrollHeight, rulerCells, rowCells,
    scs: Math.round(cell), tile: c.__chartTile,
  };
}, G);

/** Canvas pixel a few px into a cell, read through the chart's tile origin. */
const sampleCell = (page, x, y) => page.evaluate(({ x, y, G }) => {
  const c = document.querySelector('canvas[aria-label="Cross stitch pattern grid"]');
  const t = c.__chartTile;
  const scs = Math.round(document.querySelector('.tracker-chart-scroll > div').children[1].getBoundingClientRect().width);
  const px = Math.round((G + x * scs + 4 - t.x) * t.scale), py = Math.round((G + y * scs + 4 - t.y) * t.scale);
  if (px < 0 || py < 0 || px >= c.width || py >= c.height) return null;
  return Array.from(c.getContext('2d').getImageData(px, py, 1, 1).data).join(',');
}, { x, y, G });

/** Click the centre of a cell, located through the canvas's on-screen box. */
const clickCell = (page, x, y) => page.evaluate(({ x, y, G }) => {
  const c = document.querySelector('canvas[aria-label="Cross stitch pattern grid"]');
  const t = c.__chartTile, r = c.getBoundingClientRect();
  const scs = Math.round(document.querySelector('.tracker-chart-scroll > div').children[1].getBoundingClientRect().width);
  return { cx: r.left + (G + x * scs + scs / 2 - t.x), cy: r.top + (G + y * scs + scs / 2 - t.y) };
}, { x, y, G }).then(p => page.mouse.click(p.cx, p.cy));

test('entering clips the chart, its rulers and its extent to the area plus margin', async ({ page }) => {
  await openTracker(page);
  const before = await state(page);
  expect(before.rulerCells).toBe(400);

  await page.evaluate((a) => window.__workArea.enter(a), AREA);
  await page.waitForTimeout(1200);
  const s = await state(page);
  console.log('WORK_AREA_ON ' + JSON.stringify(s));

  expect(s.area).toMatchObject({ active: true, x0: 100, y0: 150, x1: 150, y1: 200 });
  // Default margin of 3 stitches each side.
  expect(s.view).toEqual({ x0: 97, y0: 147, x1: 153, y1: 203 });
  expect(s.rulerCells).toBe(56);
  expect(s.rowCells).toBe(56);
  // The scroller's extent is the view (+ gutter and border), not the pattern.
  // (scrollWidth never drops below the scroller's own width, so a view
  // narrower than the scroller reads as the client width.)
  const sz = await page.evaluate(() => { const el = document.querySelector('.tracker-chart-scroll'); return { cw: el.clientWidth, ch: el.clientHeight }; });
  expect(s.scrollW).toBeLessThanOrEqual(Math.max(sz.cw, G + 56 * s.scs + 2 + 2));
  expect(s.scrollH).toBeLessThanOrEqual(Math.max(sz.ch, G + 56 * s.scs + 2 + 2));
  // ...and far smaller than the whole 400 x 500 pattern at this zoom.
  expect(s.scrollW).toBeLessThan(G + 400 * s.scs);
  // The tile never reaches outside the view.
  expect(s.tile.x).toBeGreaterThanOrEqual(97 * s.scs);
  expect(s.tile.y).toBeGreaterThanOrEqual(147 * s.scs);
  // Entering fits the view to the chart: everything is on screen at once.
  const sc = await page.evaluate(() => { const el = document.querySelector('.tracker-chart-scroll'); return { cw: el.clientWidth, ch: el.clientHeight }; });
  expect(s.scrollW).toBeLessThanOrEqual(sc.cw + 1);
  expect(s.scrollH).toBeLessThanOrEqual(sc.ch + 1);
});

test('stitches inside the area mark; margin stitches do not', async ({ page }) => {
  await openTracker(page);
  await page.evaluate((a) => window.__workArea.enter(a), AREA);
  await page.waitForTimeout(1200);

  const inside = { x: 110, y: 160 }, margin = { x: 98, y: 160 };
  const in0 = await sampleCell(page, inside.x, inside.y);
  const m0 = await sampleCell(page, margin.x, margin.y);
  await clickCell(page, inside.x, inside.y);
  await clickCell(page, margin.x, margin.y);
  await page.waitForTimeout(600);
  const in1 = await sampleCell(page, inside.x, inside.y);
  const m1 = await sampleCell(page, margin.x, margin.y);
  console.log('WORK_AREA_TAPS ' + JSON.stringify({ in0, in1, m0, m1 }));
  expect(in0, 'inside cell not on the tile').not.toBeNull();
  expect(in1, 'the stitch inside the area did not mark').not.toBe(in0);
  expect(m1, 'a margin stitch was marked').toBe(m0);
});

test('leaving restores the whole chart', async ({ page }) => {
  await openTracker(page);
  await page.evaluate((a) => window.__workArea.enter(a), AREA);
  await page.waitForTimeout(1000);
  await page.evaluate(() => window.__workArea.exit());
  await page.waitForTimeout(1000);
  const s = await state(page);
  expect(s.area).toMatchObject({ active: false, x0: 100, y0: 150 });
  expect(s.view).toEqual({ x0: 0, y0: 0, x1: 400, y1: 500 });
  expect(s.rulerCells).toBe(400);
  // Centred on the area just left: its middle column is on screen.
  const midOnScreen = await page.evaluate(({ G }) => {
    const el = document.querySelector('.tracker-chart-scroll');
    const scs = Math.round(document.querySelector('.tracker-chart-scroll > div').children[1].getBoundingClientRect().width);
    const x = G + 125 * scs;
    return x >= el.scrollLeft && x <= el.scrollLeft + el.clientWidth;
  }, { G });
  expect(midOnScreen).toBe(true);
});

test('the area is saved with the project and restored on reload', async ({ page }) => {
  await openTracker(page);
  await page.evaluate((a) => window.__workArea.enter(a), AREA);
  await page.waitForTimeout(800);
  await page.evaluate(() => window.__flushProjectToIDB && window.__flushProjectToIDB());
  await page.waitForTimeout(800);
  const stored = await page.evaluate(async () => {
    const id = window.ProjectStorage.getActiveProjectId ? window.ProjectStorage.getActiveProjectId() : null;
    const p = id ? await window.ProjectStorage.get(id) : null;
    return p && p.workArea;
  });
  expect(stored, 'workArea was not written to the project').toMatchObject({ active: true, x0: 100, y0: 150, x1: 150, y1: 200, bw: 5, bh: 5 });

  await page.reload({ waitUntil: 'load' });
  await page.waitForFunction(() => window.__workArea && window.__workArea.get(), null, { timeout: 60000 });
  await page.waitForTimeout(1500);
  const s = await state(page);
  expect(s.area).toMatchObject({ active: true, x0: 100, y0: 150, x1: 150, y1: 200 });
  expect(s.rulerCells).toBe(56);
});

// ── Controls ──────────────────────────────────────────────────────────────

test('picking an area: the Area button, a tap on the overview, and confirm', async ({ page }) => {
  await openTracker(page);
  await page.locator('.ppal-mode-btn', { hasText: 'Area' }).click();
  const canvas = page.locator('.work-area-picker__canvas');
  await expect(canvas).toBeVisible();
  // 50x50 is the default size on 10x10 sections; tap inside the third area
  // across, second down (columns 101-150, rows 51-100).
  await page.locator('.work-area-seg button', { hasText: '50\u00d750' }).click();
  const box = await canvas.boundingBox();
  const s = box.width / 400;
  await page.mouse.click(box.x + 125 * s, box.y + 75 * s);
  await expect(page.locator('.work-area-picker__summary strong')).toHaveText('Columns 101\u2013150 \u00b7 Rows 51\u2013100');
  await page.getByRole('button', { name: /Work on this area/ }).click();
  await expect(canvas).toHaveCount(0);
  const a = await page.evaluate(() => window.__workArea.get());
  expect(a).toMatchObject({ active: true, x0: 100, y0: 50, x1: 150, y1: 100, bw: 5, bh: 5 });
  await expect(page.locator('.work-area-bar')).toContainText('Columns 101\u2013150 \u00b7 Rows 51\u2013100');
});

test('dragging across the overview selects exactly the sections covered', async ({ page }) => {
  await openTracker(page);
  await page.evaluate(() => window.__workArea.openPicker());
  const canvas = page.locator('.work-area-picker__canvas');
  const box = await canvas.boundingBox();
  const s = box.width / 400;
  await page.mouse.move(box.x + 15 * s, box.y + 15 * s);
  await page.mouse.down();
  await page.mouse.move(box.x + 45 * s, box.y + 25 * s, { steps: 6 });
  await page.mouse.up();
  await expect(page.locator('.work-area-seg__custom')).toBeVisible();
  await expect(page.locator('.work-area-picker__summary strong')).toHaveText('Columns 11\u201350 \u00b7 Rows 11\u201330');
});

test('the area bar: next and previous, margin, and showing the whole pattern', async ({ page }) => {
  await openTracker(page);
  await page.evaluate((a) => window.__workArea.enter(a), { x0: 50, y0: 0, x1: 100, y1: 50, bw: 5, bh: 5 });
  await page.waitForTimeout(800);
  await page.getByRole('button', { name: 'Next unfinished area' }).click();
  await page.waitForTimeout(500);
  expect(await page.evaluate(() => window.__workArea.get())).toMatchObject({ x0: 100, y0: 0, x1: 150, y1: 50 });
  await page.getByRole('button', { name: 'Previous unfinished area' }).click();
  await page.waitForTimeout(500);
  expect(await page.evaluate(() => window.__workArea.get())).toMatchObject({ x0: 50, y0: 0, x1: 100, y1: 50 });

  await page.locator('.work-area-seg button', { hasText: /^10$/ }).click();
  await page.waitForTimeout(400);
  expect(await page.evaluate(() => window.__workArea.view())).toEqual({ x0: 40, y0: 0, x1: 110, y1: 60 });
  await page.locator('.work-area-seg button', { hasText: /^0$/ }).click();
  await page.waitForTimeout(400);
  expect(await page.evaluate(() => window.__workArea.view())).toEqual({ x0: 50, y0: 0, x1: 100, y1: 50 });

  await page.getByRole('button', { name: /Show whole pattern/ }).click();
  await page.waitForTimeout(500);
  await expect(page.locator('.work-area-bar')).toHaveCount(0);
  expect(await page.evaluate(() => window.__workArea.get().active)).toBe(false);
});

test('W opens the picker; Fit fits the area, not the pattern', async ({ page }) => {
  await openTracker(page);
  await page.evaluate((a) => window.__workArea.enter(a), AREA);
  await page.waitForTimeout(800);
  // Zoom in so Fit has something to undo.
  await page.locator('canvas[aria-label="Cross stitch pattern grid"]').focus();
  for (let i = 0; i < 4; i++) { await page.keyboard.press('='); await page.waitForTimeout(60); }
  await page.waitForTimeout(400);
  await page.locator('.ppal-mode-btn', { hasText: 'Fit' }).click();
  await page.waitForTimeout(800);
  const fitted = await page.evaluate(() => { const el = document.querySelector('.tracker-chart-scroll'); return { sw: el.scrollWidth, cw: el.clientWidth, sh: el.scrollHeight, ch: el.clientHeight }; });
  expect(fitted.sw).toBeLessThanOrEqual(fitted.cw + 1);
  expect(fitted.sh).toBeLessThanOrEqual(fitted.ch + 1);

  await page.keyboard.press('w');
  await expect(page.locator('.work-area-picker__canvas')).toBeVisible();
});
