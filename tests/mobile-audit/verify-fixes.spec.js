const { test, expect } = require('@playwright/test');
const fs = require('fs');
const path = require('path');

const TMP = path.join(__dirname, '..', '.tmp');
function fixture(sW, sH) {
  if (!fs.existsSync(TMP)) fs.mkdirSync(TMP, { recursive: true });
  const file = path.join(TMP, `verify-${sW}x${sH}.json`);
  const total = sW * sH;
  const col = { id: '310', type: 'solid', rgb: [0, 0, 0], symbol: 'A' };
  fs.writeFileSync(file, JSON.stringify({
    version: 9, page: 'tracker', name: `V ${sW}x${sH}`,
    settings: { sW, sH, fabricCt: 14, skeinPrice: 0.95, stitchSpeed: 40 },
    pattern: new Array(total).fill(col), bsLines: [], done: new Array(total).fill(0),
    parkMarkers: [], totalTime: 0, sessions: [], hlRow: -1, hlCol: -1, threadOwned: {},
    originalPaletteState: [{ ...col, name: 'Black', lab: [0, 0, 0], count: total }],
    singleStitchEdits: [], halfStitches: [], halfDone: [], statsSessions: [], statsSettings: {},
    savedZoom: 1, savedScroll: { left: 0, top: 0 },
  }), 'utf8');
  return file;
}

// Suppress the first-run wizard — it renders a full-screen modal-overlay that
// intercepts every click on the chart and its toolbar.
async function suppressOnboarding(page) {
  await page.addInitScript(() => {
    try {
      localStorage.setItem('cs_welcome_tracker_done', '1');
      localStorage.setItem('cs_welcome_creator_done', '1');
      localStorage.setItem('cs_welcome_manager_done', '1');
      localStorage.setItem('cs_welcome_home_done', '1');
    } catch (e) {}
  });
}

async function emulateIOSLimits(page) {
  await page.addInitScript(() => {
    try { Object.defineProperty(navigator, 'deviceMemory', { get: () => undefined, configurable: true }); } catch (e) {}
    const d = Object.getOwnPropertyDescriptor(HTMLCanvasElement.prototype, 'width');
    Object.defineProperty(HTMLCanvasElement.prototype, 'width', {
      configurable: true,
      get() { return d.get.call(this); },
      set(v) { d.set.call(this, Math.min(v, 4096)); },
    });
  });
}

async function loadTracker(page, file) {
  await page.goto('/stitch.html?from=home', { waitUntil: 'load', timeout: 120000 });
  await page.locator('input[type="file"]').first().setInputFiles(file);
  await page.waitForSelector('canvas', { timeout: 60000 });
  await page.waitForTimeout(2500);
}

const chartSize = (page) => page.evaluate(() => {
  const cs = [...document.querySelectorAll('canvas')].map(c => ({ w: c.width, h: c.height, mpx: c.width * c.height }));
  return { biggest: cs.sort((a, b) => b.mpx - a.mpx)[0] || null, totalMpx: cs.reduce((s, c) => s + c.mpx, 0) };
});
const zoomPct = (page) => page.evaluate(() => {
  const el = document.querySelector('.tb-zoom-pct') || [...document.querySelectorAll('button,span')].find(e => /^\d+%$/.test((e.textContent || '').trim()));
  return el ? el.textContent.trim() : null;
});

test('A1: iOS-like limits keep a 200x250 chart inside 4096px / 16.7Mpx', async ({ page }) => {
  await suppressOnboarding(page); await emulateIOSLimits(page);
  await loadTracker(page, fixture(200, 250));
  const r = await chartSize(page);
  const extent = await page.evaluate(() => {
    const all = [...document.querySelectorAll('.canvas-area div, .canvas-area')];
    const el = all.find(e => e.scrollWidth > e.clientWidth + 10 || e.scrollHeight > e.clientHeight + 10);
    return el ? { scrollW: el.scrollWidth, scrollH: el.scrollHeight } : null;
  });
  console.log('IOS_200x250 ' + JSON.stringify({ ...r, extent }));
  expect(r.biggest.w).toBeLessThanOrEqual(4096);
  expect(r.biggest.h).toBeLessThanOrEqual(4096);
  // Now asserted on the total across every canvas, not just the largest — the
  // chart plus its overlays all share this geometry, and the budget is what
  // the device holds for all of them together.
  expect(r.totalMpx).toBeLessThanOrEqual(16777216);
  // Still a usable chart: the *scroll extent* spans the whole pattern even
  // though the backing store only covers the viewport.
  expect(extent.scrollW).toBe(200 * 20 + 30);
});

// Pinch is the real mobile zoom path (there are no zoom buttons in the
// current tracker chrome) and it is one of the two places the clamp was
// added, so drive it directly through CDP touch events.
async function pinch(page, steps, outward) {
  const box = await page.locator('canvas').first().boundingBox();
  const cx = Math.round(box.x + Math.min(box.width, 300) / 2);
  const cy = Math.round(box.y + Math.min(box.height, 300) / 2);
  const cdp = await page.context().newCDPSession(page);
  let d = outward ? 40 : 300;
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [
    { x: cx - d / 2, y: cy, id: 1, radiusX: 6, radiusY: 6, force: 1 },
    { x: cx + d / 2, y: cy, id: 2, radiusX: 6, radiusY: 6, force: 1 }] });
  for (let i = 0; i < steps; i++) {
    d += outward ? 24 : -12;
    if (d < 20) d = 20;
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [
      { x: Math.round(cx - d / 2), y: cy, id: 1, radiusX: 6, radiusY: 6, force: 1 },
      { x: Math.round(cx + d / 2), y: cy, id: 2, radiusX: 6, radiusY: 6, force: 1 }] });
    await page.waitForTimeout(30);
  }
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await cdp.detach().catch(() => {});
  await page.waitForTimeout(1000);
}

test('A1: pinching in saturates at the cap instead of overflowing it', async ({ page }) => {
  await suppressOnboarding(page); await emulateIOSLimits(page);
  await loadTracker(page, fixture(200, 250));
  const before = await chartSize(page);
  await pinch(page, 60, true);
  const after = await chartSize(page);
  console.log('IOS_PINCH_IN ' + JSON.stringify({ before: before.biggest, after: after.biggest }));
  expect(after.biggest.mpx).toBeLessThanOrEqual(16777216);
  expect(after.biggest.w).toBeLessThanOrEqual(4096);
  expect(after.biggest.h).toBeLessThanOrEqual(4096);
});

test('A1: zooming out still shrinks the chart (clamp does not freeze zoom)', async ({ page }) => {
  await suppressOnboarding(page); await emulateIOSLimits(page);
  await loadTracker(page, fixture(200, 250));
  // Measured on the scroll extent rather than the canvas: the canvas is a
  // viewport-sized tile and stays the same size at every zoom, which is
  // exactly what makes the memory constant. The chart itself must still
  // shrink.
  const extent = () => page.evaluate(() => {
    const all = [...document.querySelectorAll('.canvas-area div, .canvas-area')];
    const el = all.find(e => e.scrollWidth > e.clientWidth + 10 || e.scrollHeight > e.clientHeight + 10);
    return el ? el.scrollWidth : null;
  });
  const before = await extent();
  // "-" shortcut goes through setStitchZoom, the wrapper holding the clamp.
  await page.locator('canvas').first().click({ position: { x: 20, y: 20 }, force: true }).catch(() => {});
  for (let i = 0; i < 5; i++) { await page.keyboard.press('-'); await page.waitForTimeout(60); }
  await page.waitForTimeout(900);
  const after = await extent();
  console.log('IOS_ZOOM_OUT ' + JSON.stringify({ before, after }));
  expect(after).toBeLessThan(before);
});

test('A3: no animation frames held when the recommendation overlay is off', async ({ page }) => {
  await suppressOnboarding(page);
  await page.addInitScript(() => {
    try { localStorage.setItem('cs_recEnabled', '0'); } catch (e) {}
    window.__raf = 0;
    const o = window.requestAnimationFrame;
    window.requestAnimationFrame = function (cb) { window.__raf++; return o.call(window, cb); };
  });
  await loadTracker(page, fixture(60, 60));
  await page.evaluate(() => { window.__raf = 0; });
  await page.waitForTimeout(3000);
  const calls = await page.evaluate(() => window.__raf);
  console.log('RAF_IDLE_RECOFF_3S ' + calls);
  expect(calls).toBeLessThan(30);   // 3s of a free-running loop would be ~180
});

test('B1: no page-level horizontal overflow on any entry page', async ({ page }) => {
  await suppressOnboarding(page);
  const bad = [];
  for (const p of ['/home.html?from=home', '/manager.html?from=home', '/stitch.html?from=home', '/create.html?from=home']) {
    await page.goto(p, { waitUntil: 'load', timeout: 120000 });
    await page.waitForTimeout(3000);
    const m = await page.evaluate(() => ({
      icb: document.documentElement.clientWidth,
      scrollW: document.documentElement.scrollWidth,
      layoutVP: window.innerWidth,
    }));
    console.log('OVERFLOW ' + p + ' ' + JSON.stringify(m));
    if (m.scrollW > m.icb + 1) bad.push(p + ' ' + JSON.stringify(m));
  }
  expect(bad).toEqual([]);
});

test('B2: manager drawer is full-width and docked to the viewport bottom', async ({ page }) => {
  await suppressOnboarding(page);
  await page.goto('/manager.html?from=home', { waitUntil: 'load', timeout: 120000 });
  await page.waitForTimeout(3500);
  const r = await page.evaluate(() => {
    const el = document.querySelector('.mgr-rpanel');
    if (!el) return null;
    const b = el.getBoundingClientRect();
    const cs = getComputedStyle(el);
    return { top: Math.round(b.top), bottom: Math.round(b.bottom), left: Math.round(b.left), right: Math.round(b.right), width: cs.width, position: cs.position, vh: window.innerHeight, vw: document.documentElement.clientWidth };
  });
  console.log('MGR_DRAWER ' + JSON.stringify(r));
  expect(r).not.toBeNull();
  expect(r.position).toBe('fixed');
  expect(r.right - r.left).toBe(r.vw);        // full width
  expect(Math.abs(r.bottom - r.vh)).toBeLessThanOrEqual(2);   // docked to the bottom
});

test('C4: button hover styling is not applied on a touch device', async ({ page }) => {
  await suppressOnboarding(page);
  await page.goto('/home.html?from=home', { waitUntil: 'load', timeout: 120000 });
  await page.waitForTimeout(2000);
  const r = await page.evaluate(() => ({
    hoverMQ: matchMedia('(hover: hover) and (pointer: fine)').matches,
    transition: getComputedStyle(document.querySelector('button')).transitionProperty,
  }));
  console.log('HOVER ' + JSON.stringify(r));
  expect(r.hoverMQ).toBe(false);              // touch device -> hover rules inert
  expect(r.transition).not.toBe('all');       // explicit list, not `all`
});
