/* Desktop-side regression checks for the mobile fixes: the canvas clamp and
   the transition/hover changes must not alter desktop behaviour. Runs at
   1440x900 with a fine pointer, where the zoom buttons actually exist. */
const { test, expect } = require('@playwright/test');
const fs = require('fs');
const path = require('path');

const TMP = path.join(__dirname, '..', '.tmp');
function fixture(sW, sH) {
  if (!fs.existsSync(TMP)) fs.mkdirSync(TMP, { recursive: true });
  const file = path.join(TMP, `desk-${sW}x${sH}.json`);
  const total = sW * sH;
  const col = { id: '310', type: 'solid', rgb: [0, 0, 0], symbol: 'A' };
  fs.writeFileSync(file, JSON.stringify({
    version: 9, page: 'tracker', name: `D ${sW}x${sH}`,
    settings: { sW, sH, fabricCt: 14, skeinPrice: 0.95, stitchSpeed: 40 },
    pattern: new Array(total).fill(col), bsLines: [], done: new Array(total).fill(0),
    parkMarkers: [], totalTime: 0, sessions: [], hlRow: -1, hlCol: -1, threadOwned: {},
    originalPaletteState: [{ ...col, name: 'Black', lab: [0, 0, 0], count: total }],
    singleStitchEdits: [], halfStitches: [], halfDone: [], statsSessions: [], statsSettings: {},
    savedZoom: 1, savedScroll: { left: 0, top: 0 },
  }), 'utf8');
  return file;
}

async function setup(page) {
  await page.addInitScript(() => {
    try {
      localStorage.setItem('cs_welcome_tracker_done', '1');
      localStorage.setItem('cs_welcome_manager_done', '1');
    } catch (e) {}
  });
}
async function loadTracker(page, file) {
  await page.goto('/stitch.html?from=home', { waitUntil: 'load', timeout: 120000 });
  await page.locator('input[type="file"]').first().setInputFiles(file);
  await page.waitForSelector('canvas', { timeout: 60000 });
  await page.waitForTimeout(2000);
}
const chart = (page) => page.evaluate(() => {
  const cs = [...document.querySelectorAll('canvas')].map(c => ({ w: c.width, h: c.height, mpx: c.width * c.height }));
  return cs.sort((a, b) => b.mpx - a.mpx)[0] || null;
});
const zoomPct = (page) => page.evaluate(() => {
  const el = document.querySelector('.tb-zoom-pct');
  return el ? el.textContent.trim() : null;
});

// There are no zoom buttons in the current tracker chrome; zoom is
// ctrl+wheel, pinch, or the "=" / "-" shortcuts. The shortcuts are the only
// input this harness can drive reliably, and they run through setStitchZoom —
// the wrapper the clamp lives in.
async function zoomKey(page, key, times) {
  await page.locator('canvas').first().click({ position: { x: 20, y: 20 }, force: true }).catch(() => {});
  for (let i = 0; i < times; i++) { await page.keyboard.press(key); await page.waitForTimeout(60); }
  await page.waitForTimeout(900);
}

test('desktop still reaches 400% zoom on a small pattern (clamp is inert)', async ({ page }) => {
  await setup(page);
  await loadTracker(page, fixture(60, 60));
  await zoomKey(page, '=', 40);             // zoom all the way in
  const c = await chart(page);
  console.log('DESK_MAXZOOM ' + JSON.stringify({ canvas: c, scs: (c.w - 30) / 60 }));
  // 60x60 is far inside every budget, so the pre-existing zoom ceiling of 4
  // (scs 80) must still be reachable: 60*80 + 28 + 2 = 4830.
  expect(c.w).toBe(60 * 80 + 30);
});

test('desktop zoom out still works', async ({ page }) => {
  await setup(page);
  await loadTracker(page, fixture(60, 60));
  await zoomKey(page, '=', 8);
  const before = (await chart(page)).w;
  await zoomKey(page, '-', 5);
  const after = (await chart(page)).w;
  console.log('DESK_ZOOMOUT ' + JSON.stringify({ before, after }));
  expect(after).toBeLessThan(before);
});

test('desktop: zoom-in on a large pattern saturates at the cap', async ({ page }) => {
  await setup(page);
  await loadTracker(page, fixture(200, 250));
  await zoomKey(page, '=', 40);
  const c = await chart(page);
  console.log('DESK_LARGE_ZOOMED ' + JSON.stringify({ canvas: c, scs: (c.w - 30) / 200 }));
  // Must saturate below Chrome's 268 Mpx limit rather than overflow it.
  expect(c.w * c.h).toBeLessThanOrEqual(134217728);
  expect((c.w - 30) / 200).toBeGreaterThan(20);   // but it did zoom in
});

test('desktop: a large pattern is not clamped on a high-memory device', async ({ page }) => {
  await setup(page);
  await loadTracker(page, fixture(200, 250));
  const c = await chart(page);
  console.log('DESK_LARGE ' + JSON.stringify({ canvas: c, scs: (c.w - 30) / 200 }));
  // Desktop budget is 134 Mpx, so the default zoom-1 canvas (20.3 Mpx) stands.
  expect(c.w).toBe(200 * 20 + 30);
  expect(c.h).toBe(250 * 20 + 30);
});

test('desktop hover styling still applies', async ({ page }) => {
  await setup(page);
  await page.goto('/home.html?from=home', { waitUntil: 'load', timeout: 120000 });
  await page.waitForTimeout(1500);
  const r = await page.evaluate(() => ({
    hoverMQ: matchMedia('(hover: hover) and (pointer: fine)').matches,
    transitionProp: getComputedStyle(document.querySelector('button')).transitionProperty,
  }));
  console.log('DESK_HOVER ' + JSON.stringify(r));
  expect(r.hoverMQ).toBe(true);          // hover rules are live on desktop
  expect(r.transitionProp).not.toBe('all');
});

test('desktop manager keeps its 280px side panel', async ({ page }) => {
  await setup(page);
  await page.goto('/manager.html?from=home', { waitUntil: 'load', timeout: 120000 });
  await page.waitForTimeout(3000);
  const r = await page.evaluate(() => {
    const el = document.querySelector('.mgr-rpanel');
    if (!el) return null;
    const cs = getComputedStyle(el);
    return { width: cs.width, position: cs.position, borderLeft: cs.borderLeftWidth };
  });
  console.log('DESK_MGR_PANEL ' + JSON.stringify(r));
  expect(r.position).toBe('relative');
  expect(r.width).toBe('280px');
  expect(r.borderLeft).not.toBe('0px');
});

test('desktop manager filter bar does not overflow the page', async ({ page }) => {
  await setup(page);
  await page.goto('/manager.html?from=home', { waitUntil: 'load', timeout: 120000 });
  await page.waitForTimeout(3000);
  const r = await page.evaluate(() => {
    const bar = document.querySelector('.mgr-filter-bar');
    const input = bar && bar.querySelector('input');
    return {
      icb: document.documentElement.clientWidth,
      scrollW: document.documentElement.scrollWidth,
      barScrollW: bar ? bar.scrollWidth : null,
      barClientW: bar ? bar.clientWidth : null,
      inputW: input ? Math.round(input.getBoundingClientRect().width) : null,
    };
  });
  console.log('DESK_FILTERBAR ' + JSON.stringify(r));
  expect(r.scrollW).toBeLessThanOrEqual(r.icb + 1);
  expect(r.inputW).toBeGreaterThan(150);      // search box did not collapse
});
