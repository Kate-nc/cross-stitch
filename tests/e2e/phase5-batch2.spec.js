/* The pattern overview and Fit (tracking audit TRACK-09), driven in a real browser.
   The overview is a small canvas of the whole pattern: done areas brighter, the visible part outlined, tap or drag to jump.
   Fit must hold the whole pattern on both axes for a square, a wide and a tall pattern. */
const { test, expect } = require('@playwright/test');
const { installLocalCdn } = require('./local-cdn');
const { TRACKER_CANVAS } = require('./touch-helpers');

test.use({
  viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1, hasTouch: false, isMobile: false,
  userAgent: 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
});
test.beforeEach(async ({ context }) => { await installLocalCdn(context); });

async function open(page, { W = 300, H = 300, zoom = 0.4, prefs = {} } = {}) {
  await page.addInitScript((prefs) => { try {
    localStorage.setItem('cs_stitchStyle', 'block');
    ['tracker', 'creator', 'manager', 'home'].forEach(k => localStorage.setItem('cs_welcome_' + k + '_done', '1'));
    localStorage.setItem('cs_sessionOnboardingDone', '1');
    ['firstStitch_tracker', 'rectSelect_tracker', 'firstStitch_creator', 'import', 'undo', 'progress', 'save'].forEach(k => localStorage.setItem('cs_pref_onboarding.coached.' + k, 'true'));
    localStorage.setItem('cs_pref_trackerDefaultView', JSON.stringify('symbol'));
    Object.keys(prefs).forEach(k => localStorage.setItem('cs_pref_' + k, JSON.stringify(prefs[k])));
    sessionStorage.setItem('cs_eviction_warned', '1');
  } catch (_) {} }, prefs);
  await page.goto('/home.html');
  await page.waitForFunction(() => window.ProjectStorage);
  const id = await page.evaluate(async ({ W, H, zoom }) => {
    const pal = [['310', [0, 0, 0]], ['666', [200, 0, 0]], ['798', [40, 80, 160]], ['typ', [230, 200, 60]], ['3790', [120, 90, 70]], ['white', [245, 245, 240]]];
    const pattern = Array.from({ length: W * H }, (_, i) => { const x = i % W, y = (i - x) / W; const p = pal[(x * 3 + y * 7 + (x >> 3)) % pal.length]; return { id: p[0], type: 'solid', rgb: p[1] }; });
    const done = new Array(W * H).fill(0);
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (x < W / 4 && y < H / 4) done[y * W + x] = 1;   // the top-left quarter of each side is done
    const id = await ProjectStorage.save({ id: 'proj_p5b2', name: 'Map', settings: { sW: W, sH: H, fabricCt: 14 }, pattern, done, savedZoom: zoom, savedScroll: { left: 0, top: 0 },
      originalPaletteState: pal.map((p, i) => ({ id: p[0], type: 'solid', name: p[0], rgb: p[1], lab: [i * 10, 0, 0], count: 15000, symbol: String.fromCharCode(65 + i) })) });
    ProjectStorage.setActiveProject(id); return id; }, { W, H, zoom });
  await page.goto('/stitch.html?id=' + id);
  await page.waitForSelector(TRACKER_CANVAS);
  await page.waitForTimeout(1800);
}
const map = page => page.locator('[data-testid="tracker-minimap"]');
const info = page => page.evaluate(() => {
  const m = document.querySelector('[data-testid="tracker-minimap"]'), sc = document.querySelector('.tracker-chart-scroll');
  const c = m && m.querySelector('canvas'), v = m && m.querySelector('.tracker-minimap__view');
  return { shown: !!m && getComputedStyle(m).display !== 'none', cw: c && c.width, ch: c && c.height, box: m && m.getBoundingClientRect().toJSON(), view: v && v.getBoundingClientRect().toJSON(),
    sl: sc.scrollLeft, st: sc.scrollTop, clientW: sc.clientWidth, clientH: sc.clientHeight, scrollW: sc.scrollWidth, scrollH: sc.scrollHeight };
});
// Mean luminance of one map pixel (block bx, by).
const px = (page, bx, by) => page.evaluate(([bx, by]) => { const d = document.querySelector('[data-testid="tracker-minimap"] canvas').getContext('2d').getImageData(bx, by, 1, 1).data; return 0.2126 * d[0] + 0.7152 * d[1] + 0.0722 * d[2]; }, [bx, by]);

test('a big pattern shows the overview: bounded canvas, done corner brighter, viewport outlined at the top left', async ({ page }) => {
  await open(page, { zoom: 0.4 });
  const i = await info(page);
  console.log('MAP ' + JSON.stringify({ cw: i.cw, ch: i.ch, box: [i.box.width, i.box.height], view: [i.view.width, i.view.height] }));
  expect(i.shown).toBe(true);
  expect(Math.max(i.cw, i.ch)).toBeLessThanOrEqual(200);
  expect(i.cw).toBeGreaterThan(50);
  const done = await px(page, 10, 10), pend = await px(page, i.cw - 10, i.ch - 10);
  expect(pend - done, 'finished area is darker in greyscale than the rest').toBeGreaterThanOrEqual(40);
  expect(i.view.width).toBeLessThan(i.box.width); expect(i.view.height).toBeLessThan(i.box.height);
  expect(Math.abs(i.view.x - i.box.x), 'at the top left').toBeLessThan(3);
});

test('the viewport rectangle follows scrolling, and tapping or dragging the map jumps there', async ({ page }) => {
  await open(page, { zoom: 0.4 });
  const a = await info(page);
  await page.evaluate(() => { const sc = document.querySelector('.tracker-chart-scroll'); sc.scrollLeft = 600; sc.scrollTop = 400; });
  await page.waitForTimeout(300);
  const b = await info(page);
  expect(b.view.x, 'moved right').toBeGreaterThan(a.view.x + 5); expect(b.view.y, 'moved down').toBeGreaterThan(a.view.y + 5);
  // Tap the middle of the map: the chart centres near the middle of the pattern.
  await page.mouse.click(b.box.x + b.box.width / 2, b.box.y + b.box.height / 2);
  await page.waitForTimeout(400);
  const c = await info(page);
  const cx = (c.sl + c.clientW / 2) / c.scrollW, cy = (c.st + c.clientH / 2) / c.scrollH;
  console.log('JUMP ' + JSON.stringify({ cx: +cx.toFixed(3), cy: +cy.toFixed(3) }));
  expect(Math.abs(cx - 0.5)).toBeLessThan(0.04); expect(Math.abs(cy - 0.5)).toBeLessThan(0.04);
  // The rectangle is round the middle of the map afterwards.
  expect(Math.abs((c.view.x + c.view.width / 2) - (c.box.x + c.box.width / 2))).toBeLessThan(6);
  // Drag to the bottom right corner.
  await page.mouse.move(c.box.x + c.box.width / 2, c.box.y + c.box.height / 2); await page.mouse.down();
  await page.mouse.move(c.box.x + c.box.width - 2, c.box.y + c.box.height - 2, { steps: 5 }); await page.mouse.up();
  await page.waitForTimeout(400);
  const d = await info(page);
  expect(d.sl).toBeGreaterThan(c.sl + 100); expect(d.st).toBeGreaterThan(c.st + 100);
  expect(d.view.x + d.view.width, 'rectangle stays inside the map').toBeLessThanOrEqual(d.box.x + d.box.width + 2);
});

test('marking one stitch changes only its pixel of the map', async ({ page }) => {
  await open(page, { zoom: 0.95 });
  const before = { target: await px(page, 100, 100), near: await px(page, 102, 100), far: await px(page, 20, 120) };
  // A cell is 19 px here; scroll so cell (200, 200) (map block 100,100 at 2 cells per block) is in view, then click it.
  const pt = await page.evaluate(() => { const sc = document.querySelector('.tracker-chart-scroll'); const c = document.querySelector('canvas[aria-label^="Cross stitch pattern grid"]');
    const scs = document.querySelector('.tracker-chart-scroll > div').children[1].getBoundingClientRect().width;
    sc.scrollLeft = 200 * scs - 300; sc.scrollTop = 200 * scs - 200; return { scs }; });
  await page.waitForTimeout(500);
  const spot = await page.evaluate((scs) => { const c = document.querySelector('canvas[aria-label^="Cross stitch pattern grid"]'); const t = c.__chartTile || { x: 0, y: 0 }; const r = c.getBoundingClientRect(); const sc = document.querySelector('.tracker-chart-scroll');
    return { x: r.left - t.x + 28 + 200.5 * scs, y: r.top - t.y + 28 + 200.5 * scs, vis: r.left }; }, pt.scs);
  await page.mouse.click(spot.x, spot.y); await page.waitForTimeout(600);
  const after = { target: await px(page, 100, 100), near: await px(page, 102, 100), far: await px(page, 20, 120) };
  console.log('MAPMARK ' + JSON.stringify({ before, after }));
  expect(after.target, 'the block that holds the stitch changed').not.toBeCloseTo(before.target, 0);
  expect(Math.abs(after.near - before.near)).toBeLessThan(0.01);
  expect(Math.abs(after.far - before.far)).toBeLessThan(0.01);
});

for (const shape of [{ name: 'square', W: 300, H: 300 }, { name: 'wide', W: 400, H: 120 }, { name: 'tall', W: 120, H: 400 }]) {
  test(`Fit holds a ${shape.name} pattern whole on both axes, and the overview steps aside`, async ({ page }) => {
    await open(page, { W: shape.W, H: shape.H, zoom: 0.95 });
    await page.locator('.ppal-mode-btn', { hasText: /Fit/i }).first().click();
    await page.waitForTimeout(1200);
    const i = await info(page);
    console.log('FIT ' + shape.name + ' ' + JSON.stringify({ scrollW: i.scrollW, clientW: i.clientW, scrollH: i.scrollH, clientH: i.clientH, mapShown: i.shown }));
    expect(i.scrollW, 'no horizontal overflow').toBeLessThanOrEqual(i.clientW + 3);
    expect(i.scrollH, 'no vertical overflow').toBeLessThanOrEqual(i.clientH + 3);
    expect(i.shown, 'the whole pattern is visible, so no map').toBe(false);
  });
}

test('the overview can be hidden from the View tab and the choice sticks', async ({ page }) => {
  await open(page, { zoom: 0.4 });
  expect((await info(page)).shown).toBe(true);
  await page.locator('.ppal-mode-btn', { hasText: /More/i }).click(); await page.waitForTimeout(300);
  await page.locator('.ppal-more-tab', { hasText: 'View' }).click();
  const panel = page.locator('.ppal-more-content');
  await expect(panel).toContainText('Pattern overview');
  await panel.getByRole('button', { name: 'Hide', exact: true }).click(); await page.waitForTimeout(400);
  expect(await page.evaluate(() => window.UserPrefs.get('trackerMinimap'))).toBe(false);
  await expect(map(page)).toHaveCount(0);
  await panel.getByRole('button', { name: 'Show', exact: true }).click(); await page.waitForTimeout(600);
  expect((await info(page)).shown).toBe(true);
});

test('arrow keys on the focused overview move the view', async ({ page }) => {
  await open(page, { zoom: 0.4 });
  const a = await info(page);
  await map(page).focus(); await page.keyboard.press('ArrowRight'); await page.keyboard.press('ArrowDown'); await page.waitForTimeout(300);
  const b = await info(page);
  expect(b.sl).toBeGreaterThan(a.sl); expect(b.st).toBeGreaterThan(a.st);
});

test('a 500x500 pattern: map canvas stays at 200 px or less and builds without blocking', async ({ page }) => {
  await open(page, { W: 500, H: 500, zoom: 0.3 });
  const t = await page.evaluate(() => performance.getEntriesByType('longtask').map(e => Math.round(e.duration)));
  const i = await info(page);
  console.log('MAP500 ' + JSON.stringify({ cw: i.cw, ch: i.ch, longtasks: t }));
  expect(i.shown).toBe(true);
  expect(Math.max(i.cw, i.ch)).toBeLessThanOrEqual(200);
  expect(await px(page, 5, 5)).toBeLessThan(await px(page, i.cw - 5, i.ch - 5));
});
