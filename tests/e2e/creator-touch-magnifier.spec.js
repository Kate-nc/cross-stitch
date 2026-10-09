// Precise stitch placement on touch screens (P1-3, audit DRAW-03).
//
// At the fitted zoom on a Pixel 5 a cell is under 10 CSS px, smaller than a
// fingertip. A one-finger tap in Draw mode now places its stitch when the
// finger lifts, at the cell the finger (and the loupe above it) ended on, so
// a finger that lands a little off can settle on the right cell first.
const { test, expect } = require('@playwright/test');
const { device, generateLogo, pickDarkSwatch, isCompact } = require('./creator-helpers');

const G = 28;

// Mulberry32: a small seeded PRNG so the jitter is the same every run.
function rng(seed) {
  let a = seed >>> 0;
  return function() {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

async function chooseDrawPaint(page) {
  if (await isCompact(page)) {
    await page.locator('.creator-rail').getByRole('radio', { name: 'Draw' }).tap();
  }
  await page.getByRole('button', { name: 'Paint tool' }).tap();
}

async function selectedColourId(page) {
  const label = await page.locator('.swatch-scroll-inner button[aria-pressed="true"]').getAttribute('aria-label');
  return /Select DMC (\S+)/.exec(label)[1];
}

// The chart canvas, its size in stitches and its cell size in CSS px.
async function chartGeometry(page) {
  return page.evaluate(function() {
    const c = document.querySelector('.cs-chart-scroll canvas');
    const r = c.getBoundingClientRect();
    return { left: r.left, top: r.top, width: r.width, height: r.height, cw: c.width };
  });
}

async function savedPattern(page) {
  return page.evaluate(async function() {
    const p = await ProjectStorage.getActiveProject();
    return p ? { w: p.w || (p.settings && p.settings.sW), h: p.h || (p.settings && p.settings.sH), ids: p.pattern.map(function(c) { return c.id; }) } : null;
  });
}

async function touch(cdp, type, x, y) {
  await cdp.send('Input.dispatchTouchEvent', {
    type: type,
    touchPoints: type === 'touchEnd' ? [] : [{ x: x, y: y, radiusX: 4, radiusY: 4, force: 1 }],
  });
}

test.describe('Touch placement on Pixel 5', function() {
  test.use(device('Pixel 5'));

  test('20 jittered taps paint the intended cell at fitted zoom', async function({ page }) {
    await generateLogo(page);
    await chooseDrawPaint(page);
    await pickDarkSwatch(page);
    const colour = await selectedColourId(page);

    await expect.poll(async function() { return !!(await savedPattern(page)); }, { timeout: 10000 }).toBe(true);
    const before = await savedPattern(page);
    const geo = await chartGeometry(page);
    const sW = before.w, sH = before.h;
    const cs = (geo.width - G - 2) / sW;
    expect(cs).toBeLessThan(12);

    // Visible cells away from the chart's edges that don't already have the
    // colour, spread across the chart.
    const vis = await page.locator('.cs-chart-scroll').boundingBox();
    const rand = rng(1234);
    const targets = [];
    const used = new Set();
    for (let guard = 0; targets.length < 20 && guard < 5000; guard++) {
      const gx = 1 + Math.floor(rand() * (sW - 2));
      const gy = 1 + Math.floor(rand() * (sH - 2));
      const idx = gy * sW + gx;
      if (used.has(idx) || before.ids[idx] === colour) continue;
      const cx = geo.left + G + (gx + 0.5) * cs;
      const cy = geo.top + G + (gy + 0.5) * cs;
      if (cx < vis.x + 8 || cx > vis.x + vis.width - 8 || cy < vis.y + 8 || cy > vis.y + vis.height - 8) continue;
      // Keep targets apart so one tap can't be scored for another.
      let near = false;
      for (const t of targets) if (Math.abs(t.gx - gx) <= 1 && Math.abs(t.gy - gy) <= 1) near = true;
      if (near) continue;
      used.add(idx);
      targets.push({ gx, gy, idx, cx, cy });
    }
    expect(targets.length).toBe(20);

    const cdp = await page.context().newCDPSession(page);
    let loupeSeen = 0;
    for (const t of targets) {
      // The finger lands up to 6px off, then settles on the cell centre
      // (what the loupe shows) before lifting. Both moves are inside the tap
      // slop, so this is a tap, not a stroke.
      const jx = (rand() * 2 - 1) * 6, jy = (rand() * 2 - 1) * 6;
      await touch(cdp, 'touchStart', t.cx + jx, t.cy + jy);
      if (await page.locator('.creator-loupe').isVisible()) {
        loupeSeen++;
        // The loupe never covers the target.
        const b = await page.locator('.creator-loupe').boundingBox();
        const lx = b.x + b.width / 2, ly = b.y + b.height / 2;
        expect(Math.hypot(t.cx - lx, t.cy - ly)).toBeGreaterThan(b.width / 2);
      }
      await touch(cdp, 'touchMove', t.cx + jx / 2, t.cy + jy / 2);
      await touch(cdp, 'touchMove', t.cx, t.cy);
      await touch(cdp, 'touchEnd');
      await expect(page.locator('.creator-loupe')).toHaveCount(0);
      await page.waitForTimeout(40);
    }
    expect(loupeSeen).toBe(20);

    let after;
    await expect.poll(async function() {
      after = await savedPattern(page);
      return targets.filter(function(t) { return after.ids[t.idx] === colour; }).length;
    }, { timeout: 10000 }).toBeGreaterThanOrEqual(19);
    // Taps place single stitches: nothing else changed colour.
    const changed = after.ids.filter(function(id, i) { return id !== before.ids[i]; }).length;
    expect(changed).toBeLessThanOrEqual(20);
  });

  test('a second finger before lifting places nothing', async function({ page }) {
    await generateLogo(page);
    await chooseDrawPaint(page);
    await pickDarkSwatch(page);
    const geo = await chartGeometry(page);
    const cdp = await page.context().newCDPSession(page);
    const x = geo.left + geo.width / 2, y = geo.top + geo.height / 3;
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: x, y: y, id: 1 }] });
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: x, y: y, id: 1 }, { x: x + 80, y: y + 40, id: 2 }] });
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: x - 10, y: y, id: 1 }, { x: x + 100, y: y + 50, id: 2 }] });
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await page.waitForTimeout(200);
    await expect(page.getByRole('button', { name: 'Undo', exact: true }).first()).toBeDisabled();
  });

  test('the loupe does not appear in Navigate', async function({ page }) {
    await generateLogo(page);
    const geo = await chartGeometry(page);
    const cdp = await page.context().newCDPSession(page);
    await touch(cdp, 'touchStart', geo.left + geo.width / 2, geo.top + geo.height / 2);
    await page.waitForTimeout(100);
    await expect(page.locator('.creator-loupe')).toHaveCount(0);
    await touch(cdp, 'touchEnd');
  });

  test('precision cursor places the stitch 40px above the finger', async function({ page }) {
    await generateLogo(page);
    await page.locator('.creator-rail button[aria-label="More tools"]').click();
    await page.getByRole('checkbox', { name: 'Precision cursor' }).check();
    await page.locator('.tb-overflow-wrap > button[aria-label="More tools"]').click();
    await chooseDrawPaint(page);
    await pickDarkSwatch(page);
    const colour = await selectedColourId(page);
    await expect.poll(async function() { return !!(await savedPattern(page)); }, { timeout: 10000 }).toBe(true);
    const before = await savedPattern(page);
    const geo = await chartGeometry(page);
    const cs = (geo.width - G - 2) / before.w;
    // A target cell that lacks the colour, in the middle of the chart.
    let gx = Math.floor(before.w / 2), gy = Math.floor(before.h / 2);
    while (before.ids[gy * before.w + gx] === colour) gx++;
    const cx = geo.left + G + (gx + 0.5) * cs, cy = geo.top + G + (gy + 0.5) * cs;
    const cdp = await page.context().newCDPSession(page);
    // Finger down 40px below the target, wander, come back, lift.
    await touch(cdp, 'touchStart', cx + 30, cy + 70);
    await expect(page.locator('.creator-precision-cursor')).toBeVisible();
    await touch(cdp, 'touchMove', cx + 15, cy + 55);
    await touch(cdp, 'touchMove', cx, cy + 40);
    await touch(cdp, 'touchEnd');
    await expect(page.locator('.creator-precision-cursor')).toHaveCount(0);
    await expect.poll(async function() {
      const after = await savedPattern(page);
      return after.ids[gy * before.w + gx];
    }, { timeout: 10000 }).toBe(colour);
    // Moving the cursor painted nothing along the way.
    const after = await savedPattern(page);
    expect(after.ids.filter(function(id, i) { return id !== before.ids[i]; }).length).toBe(1);
  });

  test('double-tap in Navigate zooms to 300% on the tap, and back to Fit', async function({ page }) {
    await generateLogo(page);
    const pat = await expect.poll(async function() { return !!(await savedPattern(page)); }, { timeout: 10000 }).toBe(true);
    void pat;
    const { w } = await savedPattern(page);
    const cellSize = async function() { const g = await chartGeometry(page); return (g.cw - G - 2) / w; };
    const fitCs = await cellSize();
    expect(fitCs).toBeLessThan(20);
    const geo = await chartGeometry(page);
    const box = await page.locator('.cs-chart-scroll').boundingBox();
    const x = box.x + box.width / 2, y = box.y + box.height / 2;
    const gx = Math.floor((x - geo.left - G) / fitCs);

    await page.touchscreen.tap(x, y);
    await page.waitForTimeout(60);
    await page.touchscreen.tap(x, y);
    await expect.poll(cellSize).toBe(60);
    // The tapped stitch is still in the middle of the view.
    await expect.poll(async function() {
      const g = await chartGeometry(page);
      return Math.floor((x - g.left - G) / 60);
    }).toBe(gx);
    // No stitch menu from the double-tap.
    await page.waitForTimeout(400);
    await expect(page.getByRole('menu')).toHaveCount(0);

    await page.touchscreen.tap(x, y);
    await page.waitForTimeout(60);
    await page.touchscreen.tap(x, y);
    await expect.poll(cellSize).toBe(fitCs);
  });
});
