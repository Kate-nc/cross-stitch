/* Keyboard parity for the Tracker chart (tracking audit TRACK-10): the whole mark, rectangle, undo, colour, legend and mode
   loop without a pointer. Screen-reader announcements are deliberately out of scope (deferred), and nothing here asserts them. */
const { test, expect } = require('@playwright/test');
const { installLocalCdn } = require('./local-cdn');
const { TRACKER_CANVAS } = require('./touch-helpers');

test.use({
  viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1, hasTouch: false, isMobile: false,
  userAgent: 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
});
test.beforeEach(async ({ context }) => { await installLocalCdn(context); });

async function open(page, { W = 120, H = 120, zoom = 0.95 } = {}) {
  await page.addInitScript(() => { try {
    localStorage.setItem('cs_stitchStyle', 'block');
    ['tracker', 'creator', 'manager', 'home'].forEach(k => localStorage.setItem('cs_welcome_' + k + '_done', '1'));
    localStorage.setItem('cs_sessionOnboardingDone', '1');
    ['firstStitch_tracker', 'rectSelect_tracker', 'firstStitch_creator', 'import', 'undo', 'progress', 'save'].forEach(k => localStorage.setItem('cs_pref_onboarding.coached.' + k, 'true'));
    localStorage.setItem('cs_pref_trackerDefaultView', JSON.stringify('symbol'));
    sessionStorage.setItem('cs_eviction_warned', '1');
  } catch (_) {} });
  await page.goto('/home.html');
  await page.waitForFunction(() => window.ProjectStorage);
  const id = await page.evaluate(async ({ W, H, zoom }) => {
    const pal = [['310', [0, 0, 0]], ['666', [200, 0, 0]], ['798', [40, 80, 160]], ['typ', [230, 200, 60]]];
    const pattern = Array.from({ length: W * H }, (_, i) => { const x = i % W, y = (i - x) / W; const p = pal[(x + y) % pal.length]; return { id: p[0], type: 'solid', rgb: p[1] }; });
    const id = await ProjectStorage.save({ id: 'proj_p5b3', name: 'Keys', settings: { sW: W, sH: H, fabricCt: 14 }, pattern, done: new Array(W * H).fill(0), savedZoom: zoom, savedScroll: { left: 0, top: 0 },
      originalPaletteState: pal.map((p, i) => ({ id: p[0], type: 'solid', name: p[0], rgb: p[1], lab: [i * 10, 0, 0], count: 3600, symbol: String.fromCharCode(65 + i) })) });
    ProjectStorage.setActiveProject(id); return id; }, { W, H, zoom });
  await page.goto('/stitch.html?id=' + id);
  await page.waitForSelector(TRACKER_CANVAS);
  await page.waitForTimeout(1500);
}
const doneCount = page => page.evaluate(() => { const t = (document.querySelector('.info-strip-counts') || {}).textContent || ''; const m = t.match(/([\d,]+)\s*done/); return m ? +m[1].replace(/,/g, '') : -1; });
const guideText = page => page.evaluate(() => (document.querySelector('.tracker-hover-bar') || {}).textContent || '');
const press = async (page, key, n = 1) => { for (let i = 0; i < n; i++) { await page.keyboard.press(key); await page.waitForTimeout(40); } };
// Put keyboard focus on the chart the way a keyboard user would: Tab until it lands there.
async function tabToChart(page) {
  await page.evaluate(() => { document.activeElement && document.activeElement.blur && document.activeElement.blur(); document.body.focus(); window.scrollTo(0, 0); });
  for (let i = 0; i < 80; i++) {
    await page.keyboard.press('Tab');
    const on = await page.evaluate(() => document.activeElement && document.activeElement.tagName === 'CANVAS' && /Cross stitch pattern grid/.test(document.activeElement.getAttribute('aria-label') || ''));
    if (on) return i + 1;
  }
  throw new Error('Tab never reached the chart');
}

test('the chart is reachable by Tab and shows a focus outline', async ({ page }) => {
  await open(page);
  const presses = await tabToChart(page);
  console.log('TABS to chart ' + presses);
  const ring = await page.evaluate(() => { const sc = document.querySelector('.tracker-chart-scroll'); const cs = getComputedStyle(sc); return { style: cs.outlineStyle, width: cs.outlineWidth }; });
  expect(ring.style).not.toBe('none'); expect(parseFloat(ring.width)).toBeGreaterThanOrEqual(2);
});

test('keyboard only: move the guide, mark, unmark, rectangle, undo, colour, legend, mode, Esc', async ({ page }) => {
  await open(page);
  await tabToChart(page);
  const base = await doneCount(page);
  // Space with no keyboard guide does not mark (it stays hold-to-pan).
  await press(page, 'Space'); expect(await doneCount(page)).toBe(base);
  // Arrow keys drop and move the guide.
  await press(page, 'ArrowRight', 3); await press(page, 'ArrowDown', 2);
  expect(await guideText(page)).toMatch(/Guide\s+Row:\s*\d+\s+Col:\s*\d+/);
  const g1 = await guideText(page);
  await press(page, 'ArrowRight'); expect(await guideText(page)).not.toBe(g1);
  await press(page, 'ArrowLeft');
  // Enter marks, Enter again unmarks.
  await press(page, 'Enter'); await page.waitForTimeout(150);
  expect(await doneCount(page), 'Enter marks the stitch at the guide').toBe(base + 1);
  await press(page, 'Enter'); await page.waitForTimeout(150);
  expect(await doneCount(page), 'Enter again unmarks it').toBe(base);
  // Space marks too, now the keyboard has the guide.
  await press(page, 'Space'); await page.waitForTimeout(150);
  expect(await doneCount(page)).toBe(base + 1);
  // Shift+Enter fills the rectangle from that stitch to the guide: 5 columns by 3 rows, 15 stitches with the first.
  await press(page, 'ArrowRight', 4); await press(page, 'ArrowDown', 2);
  await press(page, 'Shift+Enter'); await page.waitForTimeout(400);
  expect(await doneCount(page), 'a 5 by 3 rectangle').toBe(base + 15);
  // Undo takes the rectangle back as one step.
  await press(page, 'Control+z'); await page.waitForTimeout(300);
  expect(await doneCount(page)).toBe(base + 1);
  // ] and [ change the selected colour (the legend's selection) without a pointer.
  const sel = () => page.evaluate(() => { const t = document.querySelector('.ppal-tile--on'); return t ? t.getAttribute('aria-label') : null; });
  await press(page, ']'); const c1 = await sel(); expect(c1).toBeTruthy();
  await press(page, ']'); const c2 = await sel(); expect(c2).not.toBe(c1);
  await press(page, '['); expect(await sel()).toBe(c1);
  // G goes to the legend.
  await press(page, 'g'); await page.waitForTimeout(300);
  expect(await page.evaluate(() => !!document.activeElement && document.activeElement.classList.contains('ppal-tile'))).toBe(true);
  // Shift+G goes back to the chart without Tabbing, and N switches to Navigate mode, where Enter does not mark.
  await press(page, 'Shift+G'); await page.waitForTimeout(200);
  expect(await page.evaluate(() => document.activeElement && document.activeElement.tagName)).toBe('CANVAS');
  await press(page, 'n'); await page.waitForTimeout(200);
  const before = await doneCount(page);
  await press(page, 'ArrowRight'); await press(page, 'Enter'); await page.waitForTimeout(150);
  expect(await doneCount(page), 'Navigate mode never marks').toBe(before);
  await press(page, 't'); await page.waitForTimeout(200);
  // Esc clears the guide.
  await press(page, 'ArrowRight'); expect(await guideText(page)).toMatch(/Guide/);
  await press(page, 'Escape'); await page.waitForTimeout(200);
  expect(await guideText(page)).not.toMatch(/Guide\s+Row/);
});

test('row mode keeps Up and Down for rows while the arrows still move the guide sideways', async ({ page }) => {
  await open(page);
  await tabToChart(page);
  await press(page, 'r'); await page.waitForTimeout(300);
  const row = () => page.evaluate(() => { const e = document.querySelector('.work-area-bar__pct'); return e ? e.getAttribute('aria-label') : ''; });
  const r0 = await row();
  await press(page, 'ArrowDown'); await page.waitForTimeout(200);
  expect(await row(), 'Down went to the next row').not.toBe(r0);
  await press(page, 'ArrowRight'); expect(await guideText(page)).toMatch(/Guide/);
});

test('a shut controls panel is out of the tab order, and opens normally', async ({ page }) => {
  await open(page);
  const vis = () => page.evaluate(() => getComputedStyle(document.getElementById('ppal-more-panel')).visibility);
  expect(await vis()).toBe('hidden');
  // Walk the whole tab order: nothing inside the panel takes focus.
  await page.evaluate(() => { document.activeElement && document.activeElement.blur(); document.body.focus(); });
  let inPanel = 0, total = 0;
  for (let i = 0; i < 120; i++) {
    await page.keyboard.press('Tab'); total++;
    if (await page.evaluate(() => !!document.activeElement && !!document.activeElement.closest('#ppal-more-panel'))) inPanel++;
  }
  expect(inPanel, 'no stop inside the shut panel').toBe(0);
  await page.locator('.ppal-mode-btn', { hasText: /More/i }).click(); await page.waitForTimeout(500);
  expect(await vis()).toBe('visible');
  await page.locator('.ppal-more-tab', { hasText: 'View' }).click();
  await expect(page.locator('.ppal-more-content')).toBeVisible();
});

test('the pointer still marks, and Space pans again after a click hands the guide back', async ({ page }) => {
  await open(page);
  await tabToChart(page);
  await press(page, 'ArrowRight'); await press(page, 'Enter'); await press(page, 'Enter'); await page.waitForTimeout(150);
  const base = await doneCount(page);
  const pt = await page.evaluate(() => { const c = document.querySelector('canvas[aria-label^="Cross stitch pattern grid"]'); const t = c.__chartTile || { x: 0, y: 0 }; const r = c.getBoundingClientRect();
    const scs = document.querySelector('.tracker-chart-scroll > div').children[1].getBoundingClientRect().width; return { x: r.left - t.x + 28 + 20.5 * scs, y: r.top - t.y + 28 + 20.5 * scs }; });
  await page.mouse.click(pt.x, pt.y); await page.waitForTimeout(300);
  expect(await doneCount(page), 'a click marks one stitch').toBe(base + 1);
  await press(page, 'Space'); await page.waitForTimeout(200);
  expect(await doneCount(page), 'Space no longer marks after a click').toBe(base + 1);
});

test('the Clear guide button hands the guide back from the keyboard (no hidden anchor, and Space does not recreate the guide)', async ({ page }) => {
  await open(page);
  await tabToChart(page);
  await press(page, 'ArrowRight'); await press(page, 'Enter'); await press(page, 'Enter'); await page.waitForTimeout(200);
  const base = await doneCount(page);
  await page.locator('.tracker-hover-bar__clear').click(); await page.waitForTimeout(200);
  expect(await guideText(page)).not.toMatch(/Guide\s+Row/);
  await page.evaluate(() => document.querySelector('canvas[aria-label^="Cross stitch pattern grid"]').focus());
  await press(page, 'Space'); await page.waitForTimeout(200);
  expect(await doneCount(page), 'Space does not mark').toBe(base);
  expect(await guideText(page), 'and does not bring the guide back').not.toMatch(/Guide\s+Row/);
  // The old anchor is gone: a Shift+Enter as the first mark marks the one stitch at the guide, not a rectangle back to the old anchor.
  await press(page, 'ArrowRight', 6); await press(page, 'Shift+Enter'); await page.waitForTimeout(250);
  expect(await doneCount(page), 'one stitch, not a rectangle').toBe(base + 1);
});
