/* Done versus not done without relying on colour (tracking audit TRACK-09), measured on the canvas itself.
   A 300x300 pattern with about 20% of the stitches done in 10x10 blocks, opened at cells of 3, 8 and 19 px. The mean
   luminance (the greyscale a person would see) of a done block against a not-done block must differ by at least
   MIN_GAP. In the corner-tick style the tick itself is measured at 19 px. A mark repaints only its own cell, and
   switching the style repaints at once. */
const { test, expect } = require('@playwright/test');
const { installLocalCdn } = require('./local-cdn');
const { TRACKER_CANVAS } = require('./touch-helpers');

// A desktop browser at 1x pixel density. The project's iPad profile (user agent and 2x density) puts a 300x300 chart
// under the iOS canvas size limits, which hold it at about 5 px cells whatever zoom is saved.
test.use({
  viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1, hasTouch: false, isMobile: false,
  userAgent: 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
});
test.beforeEach(async ({ context }) => { await installLocalCdn(context); });

const MIN_GAP = 40;          // luminance units, 0 to 255, between a done block and a not-done block
const MIN_TICK_GAP = 100;    // between a done cell's tick corner and the same corner of a not-done cell

async function open(page, { zoom, view = 'symbol', style = 'fill' }) {
  await page.addInitScript(({ view, style }) => { try {
    localStorage.setItem('cs_stitchStyle', 'block');
    ['tracker', 'creator', 'manager', 'home'].forEach(k => localStorage.setItem('cs_welcome_' + k + '_done', '1'));
    localStorage.setItem('cs_sessionOnboardingDone', '1');
    ['firstStitch_tracker', 'rectSelect_tracker', 'firstStitch_creator', 'import', 'undo', 'progress', 'save'].forEach(k => localStorage.setItem('cs_pref_onboarding.coached.' + k, 'true'));
    localStorage.setItem('cs_pref_trackerDefaultView', JSON.stringify(view));
    localStorage.setItem('cs_pref_trackerDoneStyle', JSON.stringify(style));
    sessionStorage.setItem('cs_eviction_warned', '1');
  } catch (_) {} }, { view, style });
  await page.goto('/home.html');
  await page.waitForFunction(() => window.ProjectStorage);
  const id = await page.evaluate(async (zoom) => {
    const W = 300, H = 300; const pal = [['310', [0, 0, 0]], ['666', [200, 0, 0]], ['798', [40, 80, 160]], ['typ', [230, 200, 60]], ['3790', [120, 90, 70]], ['white', [245, 245, 240]]];
    const pattern = Array.from({ length: W * H }, (_, i) => { const x = i % W, y = (i - x) / W; const p = pal[(x * 3 + y * 7 + (x >> 3)) % pal.length]; return { id: p[0], type: 'solid', rgb: p[1] }; });
    const done = new Array(W * H).fill(0);
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (((x / 10 | 0) + (y / 10 | 0)) % 5 === 0) done[y * W + x] = 1;
    const id = await ProjectStorage.save({ id: 'proj_p5b1', name: 'Look', settings: { sW: W, sH: H, fabricCt: 14 }, pattern, done, savedZoom: zoom, savedScroll: { left: 0, top: 0 },
      originalPaletteState: pal.map((p, i) => ({ id: p[0], type: 'solid', name: p[0], rgb: p[1], lab: [i * 10, 0, 0], count: 15000, symbol: String.fromCharCode(65 + i) })) });
    ProjectStorage.setActiveProject(id); return id; }, zoom);
  await page.goto('/stitch.html?id=' + id);
  await page.waitForSelector(TRACKER_CANVAS);
  await page.waitForTimeout(1800);
}
// Mean luminance of a rectangle of cells [cx0, cx1) x [cy0, cy1), inset by `inset` cells; and of one cell's corner.
const sample = (page, args) => page.evaluate((a) => {
  const c = document.querySelector('canvas[aria-label^="Cross stitch pattern grid"]'); const t = c.__chartTile || { x: 0, y: 0, scale: 1 }; const s = t.scale > 0 ? t.scale : 1;
  const scs = document.querySelector('.tracker-chart-scroll > div').children[1].getBoundingClientRect().width; const G = 28; const g = c.getContext('2d');
  const mean = (x0, y0, w, h) => { const px = Math.max(0, Math.round((G + x0 * scs - t.x) * s)), py = Math.max(0, Math.round((G + y0 * scs - t.y) * s)), pw = Math.max(1, Math.round(w * scs * s)), ph = Math.max(1, Math.round(h * scs * s));
    const d = g.getImageData(px, py, pw, ph).data; let sum = 0, n = 0; for (let i = 0; i < d.length; i += 4) { sum += 0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2]; n++; } return sum / n; };
  if (a.kind === 'block') return { cell: Math.round(scs), v: mean(a.bx * 10 + 1, a.by * 10 + 1, 8, 8) };
  if (a.kind === 'corner') return { cell: Math.round(scs), v: mean(a.x + 0.7, a.y + 0.05, 0.25, 0.25) };       // the top-right corner of a cell
  if (a.kind === 'cell') return { cell: Math.round(scs), v: mean(a.x + 0.1, a.y + 0.1, 0.8, 0.8) };
}, args);
const gap = async (page) => { const d = await sample(page, { kind: 'block', bx: 0, by: 0 }), n = await sample(page, { kind: 'block', bx: 1, by: 0 }); return { cell: d.cell, done: d.v, notDone: n.v, gap: Math.abs(n.v - d.v) }; };

for (const view of ['symbol', 'colour']) {
  for (const z of [{ cell: 3, zoom: 0.15 }, { cell: 8, zoom: 0.4 }, { cell: 19, zoom: 0.95 }]) {
    test(`${view} view, ${z.cell} px cells: a done block and a not-done block differ in greyscale by at least ${MIN_GAP}`, async ({ page }) => {
      await open(page, { zoom: z.zoom, view });
      const r = await gap(page);
      console.log('GAP ' + view + ' ' + JSON.stringify(r));
      expect(r.cell).toBe(z.cell);
      expect(r.gap).toBeGreaterThanOrEqual(MIN_GAP);
      expect(r.done, 'done is the darker one').toBeLessThan(r.notDone);
    });
  }
}

test('corner-tick style at 19 px: a done cell has a dark corner a not-done cell lacks, and at 3 and 8 px it falls back to the solid look', async ({ page }) => {
  await open(page, { zoom: 0.95, view: 'symbol', style: 'tick' });
  const done = await sample(page, { kind: 'corner', x: 0, y: 0 }), pend = await sample(page, { kind: 'corner', x: 10, y: 0 });
  console.log('TICK corner done ' + done.v.toFixed(1) + ' not done ' + pend.v.toFixed(1));
  expect(pend.v - done.v).toBeGreaterThanOrEqual(MIN_TICK_GAP);
  // The cell body is not filled in this style: a done block and a not-done block look alike but for the ticks.
  const body = await sample(page, { kind: 'cell', x: 2, y: 2 }), body2 = await sample(page, { kind: 'cell', x: 12, y: 2 });
  // (Different symbols carry a little different ink, hence a margin; the fill style differs by about 120 here.)
  expect(Math.abs(body.v - body2.v), 'the body of a tick-style done cell is the not-done look').toBeLessThan(60);
  await page.close();
});
for (const z of [{ cell: 3, zoom: 0.15 }, { cell: 8, zoom: 0.4 }]) {
  test(`tick style at ${z.cell} px cells still tells done from not done (solid tier)`, async ({ page }) => {
    await open(page, { zoom: z.zoom, view: 'symbol', style: 'tick' });
    const r = await gap(page);
    expect(r.gap).toBeGreaterThanOrEqual(MIN_GAP);
  });
}

test('marking one stitch repaints that stitch to the done look and leaves the others alone', async ({ page }) => {
  await open(page, { zoom: 0.95, view: 'symbol' });
  const before = { target: await sample(page, { kind: 'cell', x: 14, y: 3 }), neighbour: await sample(page, { kind: 'cell', x: 16, y: 3 }), far: await sample(page, { kind: 'block', bx: 3, by: 1 }) };
  const pt = await page.evaluate(() => { const c = document.querySelector('canvas[aria-label^="Cross stitch pattern grid"]'); const t = c.__chartTile || { x: 0, y: 0 }; const r = c.getBoundingClientRect();
    const scs = document.querySelector('.tracker-chart-scroll > div').children[1].getBoundingClientRect().width; return { x: r.left - t.x + 28 + 14.5 * scs, y: r.top - t.y + 28 + 3.5 * scs }; });
  await page.mouse.click(pt.x, pt.y); await page.waitForTimeout(600);
  const after = { target: await sample(page, { kind: 'cell', x: 14, y: 3 }), neighbour: await sample(page, { kind: 'cell', x: 16, y: 3 }), far: await sample(page, { kind: 'block', bx: 3, by: 1 }) };
  console.log('MARK ' + JSON.stringify({ before, after }));
  expect(before.target.v - after.target.v, 'the marked cell turned to its thread colour').toBeGreaterThan(30);
  expect(Math.abs(after.neighbour.v - before.neighbour.v), 'a neighbour is unchanged').toBeLessThan(0.5);
  expect(Math.abs(after.far.v - before.far.v), 'a block elsewhere is unchanged').toBeLessThan(0.5);
});

test('switching the finished-stitch style repaints the chart at once, with no reload', async ({ page }) => {
  await open(page, { zoom: 0.95, view: 'symbol', style: 'fill' });
  const fill = await sample(page, { kind: 'cell', x: 2, y: 2 });
  await page.evaluate(() => window.UserPrefs.set('trackerDoneStyle', 'tick')); await page.waitForTimeout(800);
  const tick = await sample(page, { kind: 'cell', x: 2, y: 2 }), corner = await sample(page, { kind: 'corner', x: 0, y: 0 });
  expect(tick.v - fill.v, 'the body of a done cell is pale again').toBeGreaterThan(40);
  expect(corner.v, 'and its corner is dark (the window straddles the tick\'s edge, so not black; a not-done corner is 255)').toBeLessThan(160);
  await page.evaluate(() => window.UserPrefs.set('trackerDoneStyle', 'fill')); await page.waitForTimeout(800);
  const back = await sample(page, { kind: 'cell', x: 2, y: 2 });
  expect(Math.abs(back.v - fill.v)).toBeLessThan(1);
});

test('the View tab offers both finished-stitch styles and the choice sticks', async ({ page }) => {
  await open(page, { zoom: 0.95, view: 'symbol' });
  await page.locator('.ppal-mode-btn', { hasText: /More/i }).click(); await page.waitForTimeout(300);
  await page.locator('.ppal-more-tab', { hasText: 'View' }).click();
  const panel = page.locator('.ppal-more-content');
  await expect(panel).toContainText('Finished stitches');
  await expect(panel.getByRole('button', { name: 'Thread colour' })).toHaveAttribute('aria-pressed', 'true');
  await panel.getByRole('button', { name: 'Corner tick' }).click(); await page.waitForTimeout(500);
  expect(await page.evaluate(() => window.UserPrefs.get('trackerDoneStyle'))).toBe('tick');
  await expect(panel.getByRole('button', { name: 'Corner tick' })).toHaveAttribute('aria-pressed', 'true');
});
