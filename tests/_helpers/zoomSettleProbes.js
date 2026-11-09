/* zoomSettleProbes.js — checks for a zoom's settling paint
   (reports/track-zoom-settle.md).
   ═══════════════════════════════════════════════════════════════════════════
   When a pinch or wheel zoom settles, the tracker paints the view first and
   the rest of the chart tile in the frames after. These read the chart canvas
   to prove nothing was lost on the way:

     recordPaints / readPaints   every drawStitch call, through the tracker's
                                 own phase timer (window.__chartPaintPhases):
                                 its cell size and how many cells it covered
     tileCells                   the cells a full paint of the current tile covers
     blankInView                 unpainted (transparent) canvas pixels inside the
                                 part of the scroller that shows chart: a blank
                                 edge (drawStitch fills everything it paints)
     blankInCanvas               the same over the whole canvas: is the tile
                                 finished?
     panCheckingBlank            pans 20 frames straight away, checking each
     alignedFreshPaint           the canvas against a fresh full paint of the
                                 same view, compared in chart coordinates (the
                                 fresh paint can place the tile a pixel away:
                                 its origin is the rounded scroll position)
     pinch, ctrlWheel            the gestures

   Counts and pixels only; nothing here is timed. */

const recordPaints = (page) => page.evaluate(() => { window.__chartPaintPhases = { paints: [] }; });
const readPaints = (page) => page.evaluate(() => {
  const p = window.__chartPaintPhases; window.__chartPaintPhases = null;
  return p ? p.paints.map((x) => ({ cSz: x.cSz, cells: x.cells || 0 })) : [];
});

/** Cells a full paint of the current tile covers: one return-from-hidden repaint, recorded. */
const tileCells = (page) => page.evaluate(async () => {
  await new Promise((r) => requestAnimationFrame(() => setTimeout(r, 0)));
  window.__chartPaintPhases = { paints: [] };
  document.dispatchEvent(new Event('visibilitychange'));
  const p = window.__chartPaintPhases.paints.find((x) => x.cells > 0);
  window.__chartPaintPhases = null;
  return p ? p.cells : 0;
});

function blankIn(whole) {
  const cv = document.querySelector('.tracker-chart-layer canvas'), sc = document.querySelector('.tracker-chart-scroll');
  let x0 = 0, y0 = 0, w = cv.width, h = cv.height;
  if (!whole) {
    const r = cv.getBoundingClientRect(), s = sc.getBoundingClientRect(), k = cv.width / r.width;
    // The rulers take the first 28 px of the scroller; the chart can end before the scroller does.
    const l = Math.max(r.left, s.left + 28), t = Math.max(r.top, s.top + 28);
    const rr = Math.min(r.right, s.left + sc.clientWidth), b = Math.min(r.bottom, s.top + sc.clientHeight);
    if (rr <= l || b <= t) return { blank: 0, checked: 0 };
    x0 = Math.floor((l - r.left) * k); y0 = Math.floor((t - r.top) * k); w = Math.floor((rr - l) * k); h = Math.floor((b - t) * k);
  }
  const d = cv.getContext('2d').getImageData(x0, y0, w, h).data;
  let blank = 0; for (let i = 3; i < d.length; i += 4) if (d[i] === 0) blank++;
  return { blank, checked: w * h };
}
const blankInView = (page) => page.evaluate(blankIn, false);
const blankInCanvas = (page) => page.evaluate(blankIn, true);

/** Pan straight away, 20 frames of 30 x 20 px, checking every frame for
 *  unpainted canvas in view. Returns the worst frame's count (sampled every
 *  16th pixel). */
const panCheckingBlank = (page) => page.evaluate(() => new Promise((done) => {
  const sc = document.querySelector('.tracker-chart-scroll'), cv = document.querySelector('.tracker-chart-layer canvas');
  let i = 0, worst = 0;
  (function step() {
    const r = cv.getBoundingClientRect(), s = sc.getBoundingClientRect(), k = cv.width / r.width;
    const l = Math.max(r.left, s.left + 28), t = Math.max(r.top, s.top + 28), rr = Math.min(r.right, s.left + sc.clientWidth), b = Math.min(r.bottom, s.top + sc.clientHeight);
    if (rr > l && b > t) {
      const d = cv.getContext('2d').getImageData(Math.floor((l - r.left) * k), Math.floor((t - r.top) * k), Math.floor((rr - l) * k), Math.floor((b - t) * k)).data;
      let n = 0; for (let j = 3; j < d.length; j += 64) if (d[j] === 0) n++;
      worst = Math.max(worst, n);
    }
    if (i++ >= 20) { done(worst); return; }
    sc.scrollLeft += 30; sc.scrollTop += 20;
    requestAnimationFrame(step);
  })();
}));

/** The canvas against a fresh full paint of the same view (the page's own
 *  return-from-hidden repaint), in chart coordinates. Pixels differing by
 *  more than 2 levels in the overlap. */
const alignedFreshPaint = (page) => page.evaluate(async () => {
  const cv = document.querySelector('.tracker-chart-layer canvas');
  const snap = () => ({ x: parseFloat(cv.style.left), y: parseFloat(cv.style.top), k: cv.width / parseFloat(cv.style.width), w: cv.width, h: cv.height, d: cv.getContext('2d').getImageData(0, 0, cv.width, cv.height).data });
  const a = snap();
  document.dispatchEvent(new Event('visibilitychange'));
  await new Promise((r) => requestAnimationFrame(() => r()));
  const b = snap();
  const dx = Math.round((b.x - a.x) * a.k), dy = Math.round((b.y - a.y) * a.k);
  let diff = 0, max = 0, n = 0;
  for (let y = Math.max(0, -dy); y < Math.min(b.h, a.h - dy); y++) for (let x = Math.max(0, -dx); x < Math.min(b.w, a.w - dx); x++) {
    const i = (y * b.w + x) * 4, j = ((y + dy) * a.w + x + dx) * 4;
    const d = Math.max(Math.abs(a.d[j] - b.d[i]), Math.abs(a.d[j + 1] - b.d[i + 1]), Math.abs(a.d[j + 2] - b.d[i + 2]), Math.abs(a.d[j + 3] - b.d[i + 3]));
    n++; if (d > 2) diff++; if (d > max) max = d;
  }
  return { diff, max, compared: n, shift: [dx, dy], sameScale: a.k === b.k };
});

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Two fingers at y, centred on x, from `spread` to `spreadTo` px apart (and
 *  on to `back`, within the same gesture), over `moves` moves. */
async function pinch(cdp, x, y, spread, spreadTo, back, moves = 30) {
  const at = (d) => [{ x: x - d / 2, y, id: 1, radiusX: 6, radiusY: 6, force: 1 }, { x: x + d / 2, y, id: 2, radiusX: 6, radiusY: 6, force: 1 }];
  const path = [];
  for (let k = 0; k <= moves; k++) path.push(spread + (spreadTo - spread) * k / moves);
  if (back != null) for (let k = 1; k <= moves; k++) path.push(spreadTo + (back - spreadTo) * k / moves);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: at(path[0]) });
  for (const d of path.slice(1)) { await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: at(d) }); await sleep(16); }
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
}
/** `n` Ctrl + wheel events of deltaY `dy` at x, y. */
async function ctrlWheel(page, x, y, dy, n) {
  await page.mouse.move(x, y);
  await page.keyboard.down('Control');
  for (let i = 0; i < n; i++) { await page.mouse.wheel(0, dy); await sleep(16); }
  await page.keyboard.up('Control');
}

module.exports = { recordPaints, readPaints, tileCells, blankInView, blankInCanvas, panCheckingBlank, alignedFreshPaint, pinch, ctrlWheel };
