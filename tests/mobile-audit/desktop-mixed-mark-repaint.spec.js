/* An ordinary mark on a chart with beads, petites or long stitches repaints only
   the marked stitches, and what it paints is what a full redraw would paint.
   ═══════════════════════════════════════════════════════════════════════════
   reports/track-mode-performance-baseline.md, finding 4. A tap paints its own
   stitch (repaintChartCells: drawStitch clipped to the cell plus 2 px, over a
   range one cell wider on every side) and the commit that follows then skips
   the full redraw. The skip used to be refused on any chart that had a bead or
   a petite or long stitch anywhere, so every mark on such a chart repainted the
   whole tile as well (9 full repaints for 8 taps).

   Each check here compares the chart canvas, device pixel by device pixel,
   after partial repaints with the same canvas after a forced full redraw of
   the same state (the full-stitch layer hidden and shown again). Counts come
   from trackProbes.js. Desktop project; zoom and DPR vary per configuration. */
const { test, expect } = require('@playwright/test');
const { fixtureFor, fixturePalette, SIZES } = require('../_helpers/trackerFixture');
const { suppressOnboarding } = require('../_helpers/deviceEmulation');
const { waitForSaved } = require('../_helpers/perfProbes');
const { installTrackProbes } = require('../_helpers/trackProbes');
const { fixtureWith } = require('../_helpers/panProbes');
const { routeCdnLocally } = require('../_helpers/offlineCdn');

const W = 400, H = 500;            // the large fixture
const STEP = 9, FIRST = 3;         // mixed objects sit on grid points FIRST + STEP * k
const COLS = Math.floor((W - 3 - FIRST - 1) / STEP) + 1;   // grid points per row (x < W - 3)

async function open(page, { zoom, fields = {}, storage = null, file = null, scroll = null }) {
  await routeCdnLocally(page);
  await suppressOnboarding(page);
  if (storage) await page.addInitScript((kv) => { for (const k of Object.keys(kv)) localStorage.setItem(k, kv[k]); }, storage);
  await installTrackProbes(page);
  await page.goto('/stitch.html?from=home', { waitUntil: 'load', timeout: 120000 });
  const src = file || fixtureFor('large', { doneFraction: 0.5, mixed: true });
  const scs = Math.max(1, Math.round(20 * zoom));
  await page.locator('input[type="file"]').first().setInputFiles(fixtureWith(src, Object.assign({
    // The top-left stitch on screen lands just before grid point 120 (= 3 + 9 x 13).
    id: 'proj_mixrepaint', savedZoom: zoom, savedScroll: scroll || { left: 28 + 118 * scs, top: 28 + 118 * scs },
  }, fields)));
  await page.waitForSelector('.tracker-chart-layer canvas', { timeout: 120000 });
  await waitForSaved(page, 120000);
  await page.waitForTimeout(800);
  // Start from a full paint: scrolling to the saved place on load can move the tile,
  // and a strip painted after a tile move differs from a full paint by a few levels
  // along its edges (reports/track-pan-performance-audit.md). That is not what is
  // measured here.
  await forceFullRedraw(page);
}

/** Client point of a fractional chart position (in stitches). */
const pointAt = (page, cx, cy) => page.evaluate(([cx, cy]) => {
  const cv = document.querySelector('.tracker-chart-layer canvas'), layer = document.querySelector('.tracker-chart-layer');
  const sW = +/(\d+) columns/.exec(document.getElementById('tracker-chart-summary').textContent)[1];
  const scs = (parseFloat(layer.style.width) - 2) / sW;
  const r = cv.getBoundingClientRect(), k = r.width / parseFloat(cv.style.width);
  return [r.left + (cx * scs - parseFloat(cv.style.left)) * k, r.top + (cy * scs - parseFloat(cv.style.top)) * k];
}, [cx, cy]);
/** The stitch range on screen (whole stitches inside the scroller). */
const visibleCells = (page) => page.evaluate(() => {
  const cv = document.querySelector('.tracker-chart-layer canvas'), layer = document.querySelector('.tracker-chart-layer');
  const sW = +/(\d+) columns/.exec(document.getElementById('tracker-chart-summary').textContent)[1];
  const scs = (parseFloat(layer.style.width) - 2) / sW;
  const r = cv.getBoundingClientRect(), k = r.width / parseFloat(cv.style.width);
  const sc = document.querySelector('.tracker-chart-scroll').getBoundingClientRect();
  const at = (px, py) => [(px - r.left) / k / scs + parseFloat(cv.style.left) / scs, (py - r.top) / k / scs + parseFloat(cv.style.top) / scs];
  const [x0, y0] = at(sc.left + 40, sc.top + 40), [x1, y1] = at(sc.right - 20, sc.bottom - 20);
  return { x0: Math.ceil(x0), y0: Math.ceil(y0), x1: Math.floor(x1) - 1, y1: Math.floor(y1) - 1, scs };
});
/** A grid point whose objects (up to 8 stitches right and down) are all on screen. */
function gridPointIn(v) {
  const gx = FIRST + STEP * Math.ceil((v.x0 - FIRST) / STEP), gy = FIRST + STEP * Math.ceil((v.y0 - FIRST) / STEP);
  if (gx + 8 > v.x1 || gy + 8 > v.y1) throw new Error('no whole grid point on screen: ' + JSON.stringify(v));
  return { x: gx, y: gy, n: ((gy - FIRST) / STEP) * COLS + (gx - FIRST) / STEP };
}
async function tapCell(page, cx, cy, fx = 0.75, fy = 0.75) {
  const [x, y] = await pointAt(page, cx + fx, cy + fy);
  await page.mouse.click(x, y);
  await page.waitForTimeout(250);
}
const paints = (page) => page.evaluate(() => ({ full: window.__tp.fullPaints.length, partial: window.__tp.partialPaints.length }));
/** Wait until no full repaint has landed for 600 ms, so one owed to an earlier
 *  action (selecting a bead from its list) is not counted against the next step:
 *  under load it can land after a fixed wait. */
async function settle(page) {
  let last = -1;
  for (let i = 0; i < 30; i++) {
    const n = (await paints(page)).full;
    if (n === last) return;
    last = n;
    await page.waitForTimeout(600);
  }
}

/* Pixel comparison of the chart canvas: a copy now (after partial repaints),
   then a full redraw of the same state, then the difference. */
const snap = (page) => page.evaluate(() => {
  const cv = document.querySelector('.tracker-chart-layer canvas');
  window.__snap = { w: cv.width, h: cv.height, tile: JSON.stringify(cv.__chartTile), d: cv.getContext('2d').getImageData(0, 0, cv.width, cv.height).data.slice() };
});
async function forceFullRedraw(page) {
  const before = (await paints(page)).full;
  await page.mouse.move(2, 2);
  await page.keyboard.press('Shift+F'); await page.waitForTimeout(250);
  await page.keyboard.press('Shift+F'); await page.waitForTimeout(400);
  expect((await paints(page)).full - before, 'the layer toggles did not repaint the chart').toBeGreaterThanOrEqual(2);
}
const diffWithSnap = (page) => page.evaluate(() => {
  const cv = document.querySelector('.tracker-chart-layer canvas'), s = window.__snap;
  if (cv.width !== s.w || cv.height !== s.h || JSON.stringify(cv.__chartTile) !== s.tile) return { moved: true };
  const d = cv.getContext('2d').getImageData(0, 0, cv.width, cv.height).data;
  let over8 = 0, over48 = 0, max = 0, x0 = 1e9, y0 = 1e9, x1 = -1, y1 = -1;
  for (let i = 0; i < d.length; i += 4) {
    const m = Math.max(Math.abs(d[i] - s.d[i]), Math.abs(d[i + 1] - s.d[i + 1]), Math.abs(d[i + 2] - s.d[i + 2]), Math.abs(d[i + 3] - s.d[i + 3]));
    if (m > 8) { over8++; const p = i / 4, x = p % s.w, y = (p - x) / s.w; x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); }
    if (m > 48) over48++;
    if (m > max) max = m;
  }
  return { over8, over48, max, box: over8 ? [x0, y0, x1, y1] : null, px: s.w * s.h };
});
async function compare(page, label, out) {
  await snap(page);
  await forceFullRedraw(page);
  const d = await diffWithSnap(page);
  out.push(Object.assign({ step: label }, d));
  return d;
}

const CONFIGS = [
  { dpr: 1, zoom: 1 },      // 20 px stitches
  { dpr: 2, zoom: 1 },
  { dpr: 1.5, zoom: 0.6 },  // 12 px, fractional device pixels
  { dpr: 2, zoom: 2 },      // 40 px
  // Zoomed this far out, this fixture's objects (a group every 9 stitches) reach each
  // other right across the chart, so a mark's region cannot settle: the mark paints its
  // stitch and its commit repaints the tile in full, as every mark used to. At 5 px and
  // up every region settles (3 to 20 stitches; see tests/chartObjectDirtyRegion.test.js).
  { dpr: 1, zoom: 0.15, chained: true },   // 3 px: beads reach past the culled range
  { dpr: 2, zoom: 0.05, chained: true },   // 1 px stitches: the clip is wider than one stitch
];

for (const c of CONFIGS) {
  test.describe(`DPR ${c.dpr}, zoom ${c.zoom * 100}%`, () => {
    test.use({ deviceScaleFactor: c.dpr });

    test('marks near beads, petites and long stitches paint only their stitches, and match a full redraw', async ({ page }) => {
      test.setTimeout(240000);
      const control = process.env.REPAINT_CONTROL === '1';   // the same steps on a full-cross chart
      await open(page, { zoom: c.zoom, file: control ? fixtureFor('large', { doneFraction: 0.5 }) : null });
      const v = await visibleCells(page);
      const g = gridPointIn(v);
      const log = [];
      const counts = [];
      const step = async (label, fn) => {
        await settle(page);
        const p0 = await paints(page);
        await fn();
        const p1 = await paints(page);
        counts.push({ step: label, full: p1.full - p0.full, partial: p1.partial - p0.partial });
        await compare(page, label, log);
      };
      // The stitch under the bead (bead at its centre) and its neighbours, the petite's
      // stitch and its neighbours, the stitches either side of the long stitch, beside
      // the half stitch, and under the end of the backstitch line.
      const cells = [[g.x, g.y + 4, 0.1, 0.1], [g.x + 1, g.y + 4], [g.x + 2, g.y + 4], [g.x, g.y + 5],
        [g.x + 6, g.y + 6], [g.x + 5, g.y + 6], [g.x + 7, g.y + 6], [g.x + 1, g.y + 6, 0.5, 0.5], [g.x + 1, g.y + 7, 0.5, 0.5],
        [g.x + 3, g.y, 0.5, 0.5], [g.x + 1, g.y + 1, 0.5, 0.75]];
      await step('mark', async () => { for (const [x, y, fx, fy] of cells) await tapCell(page, x, y, fx, fy); });
      await step('unmark', async () => { for (const [x, y, fx, fy] of cells) await tapCell(page, x, y, fx, fy); });
      await step('undo and redo', async () => {
        await page.mouse.move(2, 2);
        for (let i = 0; i < 4; i++) { await page.keyboard.press('Control+z'); await page.waitForTimeout(200); }
        for (let i = 0; i < 2; i++) { await page.keyboard.press('Control+y'); await page.waitForTimeout(200); }
      });
      await step('bulk stroke', async () => {
        const [ax, ay] = await pointAt(page, g.x + 0.8, g.y + 3.5), [bx, by] = await pointAt(page, g.x + 8.2, g.y + 3.5);
        await page.mouse.move(ax, ay); await page.mouse.down();
        for (let i = 1; i <= 12; i++) await page.mouse.move(ax + (bx - ax) * i / 12, ay + (by - ay) * i / 12);
        await page.mouse.up(); await page.waitForTimeout(400);
      });
      if (control) {
        console.log(`CONTROL dpr=${c.dpr} zoom=${c.zoom} scs=${v.scs} ` + JSON.stringify({ counts, log }));
        for (const d of log) expect(d.over8).toBe(0);
        return;
      }
      // Select the long stitch (a press on it selects it and toggles its mark: a full
      // redraw, not counted), then mark the stitches it lies along.
      const [lx, ly] = await pointAt(page, g.x + 1.5, g.y + 7);
      await page.mouse.click(lx, ly); await page.waitForTimeout(400);
      await step('marks beside a selected long stitch', async () => { await tapCell(page, g.x + 2, g.y + 6, 0.5, 0.4); await tapCell(page, g.x + 2, g.y + 7, 0.5, 0.6); await tapCell(page, g.x + 3, g.y + 7, 0.3, 0.6); });
      // Select the bead from the bead list, then mark around it.
      // (Dispatched: on this desktop layout the palette header sits over the Beads button.)
      await page.getByRole('button', { name: /^Beads \d+\/\d+$/ }).dispatchEvent('click');
      await page.getByRole('button', { name: new RegExp('^Select bead ' + (g.n + 1) + ':') }).dispatchEvent('click');
      await page.getByRole('button', { name: /^Beads \d+\/\d+$/ }).dispatchEvent('click');
      await page.waitForTimeout(400);
      await step('marks around a selected bead', async () => { await tapCell(page, g.x + 1, g.y + 3); await tapCell(page, g.x, g.y + 3, 0.9, 0.1); await tapCell(page, g.x + 1, g.y + 5); });
      console.log(`MIXED_REPAINT dpr=${c.dpr} zoom=${c.zoom} scs=${v.scs} ` + JSON.stringify({ counts, log }));
      for (const k of counts) {
        expect(k.partial, `${k.step}: nothing was painted, so nothing was marked`).toBeGreaterThan(0);
        // Before: one full repaint per mark (the chart has beads and petite and long stitches).
        if (c.chained) expect(k.full, `${k.step}: more full repaints than marks`).toBeLessThanOrEqual(k.partial);
        else expect(k.full, `${k.step}: ${k.full} full repaints`).toBe(0);
      }
      for (const d of log) {
        expect(d.moved, `${d.step}: the tile moved, so nothing was compared`).toBeFalsy();
        // A full-cross chart (REPAINT_CONTROL=1) differs from a full redraw by at most 1 level here.
        expect(d.over8, `${d.step}: ${d.over8} pixels differ from a full redraw by more than 8 levels (max ${d.max}, at ${JSON.stringify(d.box)})`).toBe(0);
      }
    });
  });
}

/* One bead and one long stitch in a far corner of an otherwise full-cross chart:
   the case the old refusal hit hardest, since nothing near the marks is drawn. */
test('marks on a full-cross chart with one bead and one long stitch far away repaint no tile', async ({ page }) => {
  test.setTimeout(180000);
  const far = { beads: [{ uid: 'far-bead', x: 2 * 395 + 1, y: 2 * 495 + 1, id: 'MH-1', brand: 'millhill', label: 'Bead', rgb: [200, 40, 40] }],
    specialtyVersion: 1, specialtyStitches: [{ uid: 'far-long', type: 'long_stitch', x1: 380, y1: 490, x2: 390, y2: 490, thread: { id: '310', type: 'solid', rgb: [0, 0, 0] } }], specialtyDone: [] };
  await open(page, { zoom: 1, file: fixtureFor('large', { doneFraction: 0.5 }), fields: far });
  const v = await visibleCells(page);
  const p0 = await paints(page);
  for (let i = 0; i < 6; i++) await tapCell(page, v.x0 + 2 + i * 3, v.y0 + 2 + i);
  const p1 = await paints(page);
  console.log('FAR_OBJECTS ' + JSON.stringify({ full: p1.full - p0.full, partial: p1.partial - p0.partial }));
  expect(p1.partial - p0.partial, 'the taps did not paint their stitches').toBe(6);
  expect(p1.full - p0.full, 'a mark repainted the whole tile because the chart has a bead and a long stitch somewhere').toBe(0);
});

/* Highlight views draw each stitch differently by colour; a mark's repaint must
   still draw the bead, petite and long stitch over it as the full paint does. */
for (const [mode, key] of [['isolate', '1'], ['tint', '3']]) {
  test(`marks in Highlight view (${mode}) beside a bead match a full redraw`, async ({ page }) => {
    test.setTimeout(180000);
    await open(page, { zoom: 1 });
    const g = gridPointIn(await visibleCells(page));
    // Right-click the stitch under the bead (selects its colour and opens Highlight
    // view), then choose the highlight style.
    const [rx, ry] = await pointAt(page, g.x + 0.1, g.y + 4.1);
    await page.mouse.click(rx, ry, { button: 'right' });
    await page.waitForTimeout(400);
    await page.mouse.move(2, 2);
    await page.keyboard.press(key);
    await page.waitForTimeout(600);
    const p0 = await paints(page), log = [];
    await tapCell(page, g.x, g.y + 4, 0.1, 0.1);
    await tapCell(page, g.x, g.y + 7, 0.5, 0.75);       // the same colour three rows down (1 200 stitches on), under the long stitch
    const p1 = await paints(page);
    const d = await compare(page, mode, log);
    console.log(`HIGHLIGHT_${mode.toUpperCase()} ` + JSON.stringify({ full: p1.full - p0.full, partial: p1.partial - p0.partial, d }));
    expect(p1.partial - p0.partial, 'the taps did not paint their stitches').toBeGreaterThanOrEqual(2);
    expect(p1.full - p0.full, 'a mark in Highlight view repainted the whole tile').toBe(0);
    expect(d.moved).toBeFalsy();
    expect(d.over8, `${d.over8} pixels differ from a full redraw (max ${d.max})`).toBe(0);
  });
}

test('marks with petites, long stitches and knots hidden match a full redraw', async ({ page }) => {
  test.setTimeout(180000);
  const hidden = JSON.stringify({ full: true, half: true, backstitch: true, quarter: true, petite: false, french_knot: false, long_stitch: false });
  await open(page, { zoom: 1, storage: { cs_layerVis_proj_mixrepaint: hidden } });
  const g = gridPointIn(await visibleCells(page));
  const p0 = await paints(page), log = [];
  // (Not the knot's own stitch: a tap there toggles the knot, hidden or not, which is not an ordinary mark.)
  for (const [x, y] of [[g.x + 6, g.y + 6], [g.x + 1, g.y + 6], [g.x + 1, g.y + 7], [g.x + 3, g.y], [g.x + 5, g.y]]) await tapCell(page, x, y, 0.75, 0.75);
  const p1 = await paints(page);
  const d = await compare(page, 'hidden layers', log);
  console.log('HIDDEN_LAYERS ' + JSON.stringify({ full: p1.full - p0.full, partial: p1.partial - p0.partial, d }));
  expect(p1.full - p0.full, 'a mark with layers hidden repainted the whole tile').toBe(0);
  expect(d.moved).toBeFalsy();
  expect(d.over8, `${d.over8} pixels differ from a full redraw (max ${d.max})`).toBe(0);
});

/* The chart's bottom-right corner (its border, and objects on the last grid point)
   and the stitch cut by the edge of the view. */
test('marks at the chart corner and the left of the view match a full redraw', async ({ page }) => {
  test.setTimeout(180000);
  await open(page, { zoom: 1, scroll: { left: 1e6, top: 1e6 } });
  await page.evaluate(() => { const sc = document.querySelector('.tracker-chart-scroll'); sc.scrollLeft = sc.scrollWidth; sc.scrollTop = sc.scrollHeight; });
  await page.waitForTimeout(800);
  const v = await visibleCells(page);
  expect(v.x1, 'the view is not at the right edge of the chart').toBeGreaterThanOrEqual(W - 2);
  const p0 = await paints(page), log = [];
  // The last grid point is 390, 489 (objects up to 398, 498); the last stitches, whose
  // region runs past the chart's edge; and the leftmost whole stitch on screen.
  // (Clear of the petite's arms, which a tap toggles, and of the row ruler.)
  for (const [x, y, fx, fy] of [[W - 1, H - 1, 0.5, 0.5], [W - 2, H - 1, 0.5, 0.5], [396, 495, 0.85, 0.85], [397, 497, 0.75, 0.75], [v.x0, v.y0 + 3, 0.5, 0.5]]) await tapCell(page, x, y, fx, fy);
  const p1 = await paints(page);
  const d = await compare(page, 'corner', log);
  console.log('CORNER ' + JSON.stringify({ v, full: p1.full - p0.full, partial: p1.partial - p0.partial, d }));
  expect(p1.partial - p0.partial).toBeGreaterThanOrEqual(5);
  expect(p1.full - p0.full, 'a mark at the corner repainted the whole tile').toBe(0);
  expect(d.moved).toBeFalsy();
  expect(d.over8, `${d.over8} pixels differ from a full redraw (max ${d.max})`).toBe(0);
});

/* Park markers zoomed far out. A marker keeps a 4 px triangle and a 3.5 px ring
   however small a stitch gets, so at 1-3 px it overhangs its stitch by several
   stitches: a mark that hides or shows it must repaint all of it, or pieces of it
   are left behind (or cut off). Full-cross chart with one bead far away. */
// (Not DPR 1.5 this far out: a 3 px stitch is then 4.5 device pixels, and marks on a
// plain full-cross chart already differ from a full redraw there, by up to 57 levels
// on ~70 pixels, with or without markers, before this region existed.)
for (const c of [{ dpr: 2, zoom: 0.05 }, { dpr: 1, zoom: 0.1 }, { dpr: 1, zoom: 0.15 }, { dpr: 2, zoom: 0.15 }]) {
  test.describe(`park markers, DPR ${c.dpr}`, () => {
  test.use({ deviceScaleFactor: c.dpr });
  test(`marks on and beside park markers at ${Math.round(20 * c.zoom)} px a stitch (DPR ${c.dpr}) match a full redraw`, async ({ page }) => {
    test.setTimeout(240000);
    const scs = Math.max(1, Math.round(20 * c.zoom));
    // The view starts at stitch 118, 118 (open()); the markers sit a little inside it, on
    // stitches still to do (odd columns: the fixture finishes every other stitch, and a
    // marker on a finished stitch is spent and dropped on load).
    const pal = fixturePalette(SIZES.large.nColours), col = (x, y) => pal[(y * W + x) % pal.length];
    const at = [[141, 140, 'BL'], [143, 140, 'TR'], [145, 141, 'TL'], [141, 143, 'BR'], [151, 150, 'BL']];
    const parkMarkers = at.map(([x, y, corner]) => ({ x, y, corner, colorId: col(x, y).id, rgb: col(x, y).rgb }));
    const far = { beads: [{ uid: 'far-bead', x: 2 * 395 + 1, y: 2 * 495 + 1, id: 'MH-1', brand: 'millhill', label: 'Bead', rgb: [200, 40, 40] }], parkMarkers };
    await open(page, { zoom: c.zoom, file: fixtureFor('large', { doneFraction: 0.5 }), fields: far });
    const kept = await page.evaluate(async () => ((await window.ProjectStorage.get('proj_mixrepaint')).parkMarkers || []).length);
    expect(kept, 'the park markers did not load, so nothing here tests them').toBe(at.length);
    const log = [], counts = [];
    const step = async (label, fn) => {
      await settle(page);
      const p0 = await paints(page);
      await fn();
      const p1 = await paints(page);
      counts.push({ step: label, full: p1.full - p0.full, partial: p1.partial - p0.partial });
      await compare(page, label, log);
    };
    // Each marked stitch, a stitch next to it, and one two stitches from a marker.
    const cells = [[141, 140], [143, 140], [145, 141], [141, 143], [142, 142], [151, 150], [153, 150]];
    await step('mark', async () => { for (const [x, y] of cells) await tapCell(page, x, y, 0.5, 0.5); });
    await step('unmark', async () => { for (const [x, y] of cells) await tapCell(page, x, y, 0.5, 0.5); });
    await step('undo and redo', async () => {
      await page.mouse.move(2, 2);
      for (let i = 0; i < 5; i++) { await page.keyboard.press('Control+z'); await page.waitForTimeout(200); }
      for (let i = 0; i < 3; i++) { await page.keyboard.press('Control+y'); await page.waitForTimeout(200); }
    });
    console.log(`PARK_REPAINT dpr=${c.dpr} scs=${scs} ` + JSON.stringify({ counts, log }));
    for (const k of counts) {
      expect(k.partial, `${k.step}: nothing was painted, so nothing was marked`).toBeGreaterThan(0);
      expect(k.full, `${k.step}: ${k.full} full repaints`).toBe(0);
    }
    for (const d of log) {
      expect(d.moved, `${d.step}: the tile moved, so nothing was compared`).toBeFalsy();
      expect(d.over8, `${d.step}: ${d.over8} pixels differ from a full redraw by more than 8 levels (max ${d.max}, at ${JSON.stringify(d.box)})`).toBe(0);
    }
  });
  });
}

/* A long backstitch outline: every segment reaches the next, so a mark beside it
   cannot take the whole outline in. Hidden, it is not drawn and does not count.
   Shown, on a chart with no beads or specialty stitches, the mark is painted as
   marks there always were (no full repaint); where the clip edge crosses the
   line its pixels differ from a full paint by a few levels on a handful of pixels. */
for (const shown of [false, true]) {
  test(`marks beside a long ${shown ? 'shown' : 'hidden'} backstitch outline repaint no tile`, async ({ page }) => {
    test.setTimeout(180000);
    const pal = fixturePalette(SIZES.large.nColours);
    const Y = 140, bsLines = Array.from({ length: 200 }, (_, i) => ({ x1: 60 + i, y1: Y, x2: 61 + i, y2: Y, colorId: pal[0].id }));
    const vis = JSON.stringify({ full: true, half: true, backstitch: shown, quarter: true, petite: true, french_knot: true, long_stitch: true });
    await open(page, { zoom: 1, file: fixtureFor('large', { doneFraction: 0.5 }), fields: { bsLines, bsDone: [] }, storage: { cs_layerVis_proj_mixrepaint: vis } });
    const p0 = await paints(page), log = [];
    // Stitches below and above the outline (it runs along the top edge of row Y).
    for (const [x, y] of [[125, Y], [128, Y - 1], [131, Y], [134, Y - 1], [137, Y]]) await tapCell(page, x, y, 0.5, 0.5);
    const p1 = await paints(page);
    const d = await compare(page, shown ? 'shown outline' : 'hidden outline', log);
    console.log(`BS_OUTLINE_${shown ? 'SHOWN' : 'HIDDEN'} ` + JSON.stringify({ full: p1.full - p0.full, partial: p1.partial - p0.partial, d }));
    expect(p1.partial - p0.partial, 'the taps did not paint their stitches').toBeGreaterThanOrEqual(5);
    expect(p1.full - p0.full, 'a mark beside a backstitch outline repainted the whole tile').toBe(0);
    expect(d.moved).toBeFalsy();
    if (!shown) expect(d.over8, `${d.over8} pixels differ from a full redraw (max ${d.max})`).toBe(0);
    else expect(d.over48, `${d.over48} pixels differ from a full redraw by more than 48 levels (max ${d.max})`).toBe(0);
  });
}
