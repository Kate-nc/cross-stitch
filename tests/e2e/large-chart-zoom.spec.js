// Large charts in the Creator: zooming without lag (drawing the visible part
// first, finishing in bands; pinch-zoom previewed with a CSS transform).
const { test, expect } = require('@playwright/test');
const { device, quietOnboarding } = require('./creator-helpers');

const COLOURS = [['310', [0, 0, 0]], ['666', [227, 29, 66]], ['799', [116, 142, 182]], ['742', [255, 191, 87]],
  ['702', [71, 167, 47]], ['3865', [249, 247, 241]], ['550', [92, 24, 78]], ['517', [59, 118, 143]]];

function bigProject(n, savedZoom) {
  const pattern = [];
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
    const d = COLOURS[(x * 7 + y * 13 + ((x ^ y) & 7)) % COLOURS.length];
    pattern.push((x + y) % 31 === 0 ? { id: '__empty__', rgb: [255, 255, 255] } : { id: d[0], type: 'solid', rgb: d[1] });
  }
  return { version: 11, page: 'creator', name: 'Big', settings: { sW: n, sH: n, fabricCt: 14, isScratchMode: true },
    pattern, bsLines: [{ x1: 2, y1: 2, x2: 30, y2: 9 }], done: null, partialStitches: [], parkMarkers: [], sessions: [], threadOwned: {},
    savedZoom: savedZoom };
}

async function open(page, project) {
  await quietOnboarding(page);
  await page.goto('/home.html');
  await page.evaluate(async (p) => {
    p.id = 'proj_bigzoom'; p.createdAt = p.updatedAt = new Date().toISOString();
    await ProjectStorage.save(p, { resurrect: true }); ProjectStorage.setActiveProject(p.id);
  }, project);
  await page.goto('/create.html');
  await page.waitForSelector('.cs-chart-scroll canvas', { timeout: 60000 });
  await page.waitForTimeout(1500);
}

test.describe('Large chart drawing', function() {
  test.use(device('desktop'));
  test.setTimeout(120000);

  test('drawing the visible part first, then in bands, gives exactly the pixels of one full draw', async function({ page }) {
    await open(page, bigProject(20));
    const result = await page.evaluate(() => {
      const N = 90, cs = 12, draw = window.drawPatternBaseOnCanvas;
      const cmap = {}, pat = [];
      const rgbs = [[0, 0, 0], [227, 29, 66], [116, 142, 182], [255, 191, 87], [71, 167, 47]];
      rgbs.forEach((rgb, i) => { cmap['c' + i] = { id: 'c' + i, rgb, symbol: 'ABCDE'[i] }; });
      for (let i = 0; i < N * N; i++) { const k = (i * 7 + ((i / N) | 0) * 3) % 5; pat.push(i % 23 === 0 ? { id: '__empty__', rgb: [255, 255, 255] } : { id: 'c' + k, rgb: rgbs[k] }); }
      const out = {};
      for (const view of ['color', 'both', 'symbol']) for (const hiId of [null, 'c2']) {
        const st = { pat, cmap, sW: N, sH: N, view, hiId, highlightMode: 'isolate', showCtr: true,
          bsLines: [{ x1: 1, y1: 1, x2: 40, y2: 12 }], partialStitches: new Map([[5, { TL: { id: 'c1', rgb: rgbs[1] } }]]),
          knots: [{ x: 3, y: 3, id: 'c1', rgb: rgbs[1] }] };
        const mk = () => { const c = document.createElement('canvas'); c.width = N * cs + 30; c.height = N * cs + 30; return c.getContext('2d', { willReadFrequently: true }); };
        const full = mk(); draw(full, 0, 0, N, N, cs, 28, st);
        const parts = mk();
        draw(parts, 0, 0, N, N, cs, 28, st, { x0: 20, y0: 15, x1: 60, y1: 45 });
        draw(parts, 0, 0, N, N, cs, 28, st, { x0: 0, y0: 0, x1: 0, y1: 0, lines: false, fill: 'all' });
        for (let y = 0; y < N; y += 7) draw(parts, 0, 0, N, N, cs, 28, st, { x0: 0, y0: y, x1: N, y1: Math.min(N, y + 7), frame: false, lines: false, fill: false });
        draw(parts, 0, 0, N, N, cs, 28, st, { x0: 0, y0: 0, x1: 0, y1: 0, frame: false });
        const a = full.getImageData(0, 0, full.canvas.width, full.canvas.height).data;
        const b = parts.getImageData(0, 0, full.canvas.width, full.canvas.height).data;
        let diff = 0; for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) diff++;
        out[view + (hiId ? '+highlight' : '')] = diff;
      }
      return out;
    });
    Object.entries(result).forEach(([k, v]) => expect([k, v]).toEqual([k, 0]));
  });

  test('a large chart is finished after zooming: every stitch drawn', async function({ page }) {
    await open(page, bigProject(240, 0.6));
    await page.locator('.cs-chart-scroll').click({ position: { x: 5, y: 5 } }).catch(() => {});
    for (let i = 0; i < 3; i++) await page.keyboard.press('=');
    // The far corner, off screen: drawn once the bands finish.
    await expect.poll(() => page.evaluate(() => {
      const c = document.querySelector('.cs-chart-scroll canvas');
      const cs = (c.width - 28 - 2) / 240;
      const x = Math.round(28 + 239.5 * cs), y = Math.round(28 + 239.5 * cs);
      const d = c.getContext('2d').getImageData(x, y, 1, 1).data;
      return d[3] === 255 && !(d[0] === 255 && d[1] === 255 && d[2] === 255);
    }), { timeout: 15000 }).toBe(true);
  });
});

test.describe('Large chart pinch-zoom on a phone', function() {
  test.use(device('Pixel 5'));
  test.setTimeout(120000);

  test('the chart scales while the fingers move and is redrawn at the new zoom when they lift', async function({ page }) {
    await open(page, bigProject(240, 0.4));
    const canvas = page.locator('.cs-chart-scroll canvas');
    const w0 = await canvas.evaluate(c => c.width);
    const box = await page.locator('.cs-chart-scroll').boundingBox();
    const mid = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
    const cdp = await page.context().newCDPSession(page);
    const touch = (type, pts) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: pts.map((q, i) => ({ x: Math.round(q.x), y: Math.round(q.y), id: i + 1, radiusX: 4, radiusY: 4, force: 1 })) });
    let d = 40;
    await touch('touchStart', [{ x: mid.x - d, y: mid.y }]);
    await touch('touchStart', [{ x: mid.x - d, y: mid.y }, { x: mid.x + d, y: mid.y }]);
    for (let i = 0; i < 8; i++) { d += 8; await touch('touchMove', [{ x: mid.x - d, y: mid.y }, { x: mid.x + d, y: mid.y }]); }
    // Mid-gesture: a transform, not a redraw.
    expect(await canvas.evaluate(c => c.width)).toBe(w0);
    expect(await canvas.evaluate(c => c.style.transform)).toMatch(/scale\(/);
    await touch('touchEnd', [{ x: mid.x + d, y: mid.y }]);
    await touch('touchEnd', []);
    await expect.poll(() => canvas.evaluate(c => c.style.transform), { timeout: 5000 }).toBe('');
    const w1 = await canvas.evaluate(c => c.width);
    expect(w1).toBeGreaterThan(w0 * 1.8);
    // What is on screen is drawn at once (the rest of the chart follows):
    // points across the visible area are stitches, not blank fabric.
    const drawn = await page.evaluate(() => {
      const c = document.querySelector('.cs-chart-scroll canvas'), sc = document.querySelector('.cs-chart-scroll');
      const cr = c.getBoundingClientRect(), sr = sc.getBoundingClientRect(), k = c.width / cr.width;
      let n = 0;
      for (let i = 1; i <= 5; i++) for (let j = 1; j <= 5; j++) {
        const x = Math.round((sr.left + sr.width * i / 6 - cr.left) * k), y = Math.round((sr.top + sr.height * j / 6 - cr.top) * k);
        const d = c.getContext('2d').getImageData(x, y, 1, 1).data;
        if (d[3] === 255 && !(d[0] > 240 && d[1] > 240 && d[2] > 240)) n++;
      }
      return n;
    });
    expect(drawn).toBeGreaterThanOrEqual(20);
  });
});
