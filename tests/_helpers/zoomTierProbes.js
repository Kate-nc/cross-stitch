/* zoomTierProbes.js — what the chart paints while a zoom crosses a detail tier
   (reports/track-zoom-tier-transition.md).
   ═══════════════════════════════════════════════════════════════════════════
   The tracker draws more detail as stitches get bigger: Tier 1 is flat
   colour, Tier 2 adds half stitches and backstitch, Tier 3 adds symbols and
   Tier 4 more. computeDetailTier (tracker-app.js) has the thresholds, with a
   gap between the size a tier appears at and the size it goes at.

   Counted per zoom step, from an init script installed before any app code:

     paints        full chart paints: drawStitch's opening whole-chart fill on
                   the chart canvas (z-index 2) with no clip active. Strips
                   and one-stitch repaints run under a clip and are not
                   counted here.
     for each paint, the cell size it was drawn at (the chart layer's width
                   over the column count), the symbols it drew (fillText on
                   the chart canvas) and the globalAlpha they were drawn at,
                   and its strokes (backstitch, half stitches and the other
                   line-drawn stitches)
     frames        requestAnimationFrame timestamps, for frame gaps
     loafs         Long Animation Frames: script time, and the time after
                   renderStart (style, layout, paint)

   And a check of the final picture: the chart canvas's pixels after the zoom
   settles, against a fresh full paint of the same view (made by the page's
   own return-from-hidden repaint), plus the tier the paints should have been
   drawn at, worked out here from the thresholds.

   Counts are deterministic. Times are emulated (headless Chromium draws
   canvases in software; the phone project adds a 4x CPU throttle) and are
   logged, never asserted tightly. None of it is a physical-device measurement. */
const fs = require('fs');
const path = require('path');

async function installZoomTierProbes(page) {
  await page.addInitScript(() => {
    const Z = window.__zt = { paints: [], frames: [], loafs: [], cur: null };
    const P = CanvasRenderingContext2D.prototype;
    const depth = new WeakMap();
    const stack = (c) => { let s = depth.get(c); if (!s) { s = [false]; depth.set(c, s); } return s; };
    const oSave = P.save, oRestore = P.restore, oClip = P.clip, oFill = P.fillRect, oText = P.fillText, oStroke = P.stroke;
    P.save = function () { const s = stack(this); s.push(s[s.length - 1]); return oSave.apply(this, arguments); };
    P.restore = function () { const s = stack(this); if (s.length > 1) s.pop(); return oRestore.apply(this, arguments); };
    P.clip = function () { const s = stack(this); s[s.length - 1] = true; return oClip.apply(this, arguments); };
    const isChart = (c) => c.canvas && c.canvas.style && c.canvas.style.zIndex === '2';
    const cellSize = () => {
      const layer = document.querySelector('.tracker-chart-layer');
      const sum = document.getElementById('tracker-chart-summary');
      const m = sum && /(\d+) columns/.exec(sum.textContent);
      return layer && m ? (parseFloat(layer.style.width) - 2) / +m[1] : null;
    };
    P.fillRect = function (x, y, w, h) {
      // drawStitch opens with a fill of the whole chart (gutter + columns x
      // cell size), which is bigger than anything else drawn at 0,0.
      if (x === 0 && y === 0 && w > 300 && h > 300 && isChart(this)) {
        const s = stack(this);
        if (!s[s.length - 1]) {
          Z.cur = { t: performance.now(), cSz: cellSize(), text: 0, alphas: {}, strokes: 0 };
          Z.paints.push(Z.cur);
        } else Z.cur = null;
      }
      return oFill.apply(this, arguments);
    };
    P.fillText = function () {
      if (Z.cur && isChart(this)) {
        Z.cur.text++;
        const a = Math.round(this.globalAlpha * 100) / 100;
        Z.cur.alphas[a] = (Z.cur.alphas[a] || 0) + 1;
      }
      return oText.apply(this, arguments);
    };
    P.stroke = function () {
      if (Z.cur && isChart(this)) Z.cur.strokes++;
      return oStroke.apply(this, arguments);
    };
    (function tick(t) { Z.frames.push(t); requestAnimationFrame(tick); })(performance.now());
    try {
      new PerformanceObserver((list) => {
        for (const e of list.getEntries()) {
          const script = (e.scripts || []).reduce((n, s) => n + s.duration, 0);
          const render = e.renderStart > 0 ? e.startTime + e.duration - e.renderStart : 0;
          Z.loafs.push({ t: e.startTime, d: e.duration, script, render });
        }
      }).observe({ type: 'long-animation-frame', buffered: false });
    } catch (_) {}
  });
}

const nowMs = (page) => page.evaluate(() => performance.now());

/** Everything recorded since t0 (and before t1, if given). */
const readSince = (page, t0, t1) => page.evaluate(([t0, t1]) => {
  const Z = window.__zt, end = t1 == null ? Infinity : t1;
  const inWin = (t) => t >= t0 && t < end;
  const frames = Z.frames.filter(inWin);
  const gaps = [];
  for (let i = 1; i < frames.length; i++) gaps.push(frames[i] - frames[i - 1]);
  return {
    paints: Z.paints.filter((p) => inWin(p.t)).map((p) => ({ t: Math.round(p.t - t0), cSz: p.cSz, text: p.text, alphas: p.alphas, strokes: p.strokes })),
    worstFrame: Math.round(gaps.reduce((m, g) => Math.max(m, g), 0)),
    framesOver50: gaps.filter((g) => g > 50).length,
    loaf: Z.loafs.filter((l) => inWin(l.t)).reduce((a, l) => ({ n: a.n + 1, ms: a.ms + l.d, script: a.script + l.script, render: a.render + l.render }), { n: 0, ms: 0, script: 0, render: 0 }),
  };
}, [t0, t1 == null ? null : t1]);

/* computeDetailTier, lifted out of tracker-app.js the way
   tests/chartCanvasBudget.test.js does, so the expected tier comes from the
   same thresholds the app uses rather than a copy of them. */
function loadComputeDetailTier() {
  const src = fs.readFileSync(path.join(__dirname, '..', '..', 'tracker-app.js'), 'utf8');
  const sig = 'function computeDetailTier(cSz,cur){';
  const start = src.indexOf(sig);
  let depth = 0, end = -1;
  for (let i = src.indexOf('{', start); i < src.length; i++) {
    if (src[i] === '{') depth++;
    else if (src[i] === '}') { depth--; if (depth === 0) { end = i + 1; break; } }
  }
  // eslint-disable-next-line no-new-func
  return new Function(src.slice(start, end) + '\nreturn computeDetailTier;')();
}
const computeDetailTier = loadComputeDetailTier();

/** The tier each paint should have used, walking the thresholds from the
 *  tier the tracker starts in (3) through every size painted so far. */
function expectedTiers(cellSizes, start = 3) {
  let t = start;
  return cellSizes.map((c) => (t = computeDetailTier(c, t)));
}

/** Does a paint's detail match its tier? In Symbol view, symbols are drawn
 *  from Tier 3 up, at full opacity, and not at all below it. (Below Tier 3
 *  the symbol draw is gated only on the fade's opacity, so a fade-out paint
 *  at Tier 2 shows symbols.) */
function paintMatchesTier(p, tier) {
  const alphas = Object.keys(p.alphas).map(Number);
  if (tier >= 3) return p.text > 0 && alphas.every((a) => a >= 0.69);
  return p.text === 0;
}

/** The chart canvas's pixels, then a fresh full paint of the same view (the
 *  page repaints the chart when it becomes visible again), and how many
 *  pixels differ between the two. */
const settledMatchesFreshPaint = (page) => page.evaluate(async () => {
  const cv = document.querySelector('.tracker-chart-layer canvas');
  const read = () => cv.getContext('2d').getImageData(0, 0, cv.width, cv.height).data;
  const a = read();
  const vis = Object.getOwnPropertyDescriptor(Document.prototype, 'visibilityState');
  Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'visible' });
  document.dispatchEvent(new Event('visibilitychange'));
  delete document.visibilityState;
  if (vis) Object.defineProperty(Document.prototype, 'visibilityState', vis);
  await new Promise((r) => requestAnimationFrame(() => r()));
  const b = read();
  let diff = 0, max = 0;
  for (let i = 0; i < a.length; i += 4) {
    const d = Math.max(Math.abs(a[i] - b[i]), Math.abs(a[i + 1] - b[i + 1]), Math.abs(a[i + 2] - b[i + 2]));
    if (d > 2) diff++;
    if (d > max) max = d;
  }
  return { w: cv.width, h: cv.height, diff, max };
});

/** Runs each action, waits `settle` ms, and returns one row per action:
 *  full paints, the tier each was due (walking the thresholds over every
 *  paint since the page opened), paints whose detail did not match it,
 *  repeats (a paint at the same cell size as the one before it in the step:
 *  nothing about the zoom changed, so it can only be a fade frame), and the
 *  frame and Long Animation Frame figures. `last` is the step's last paint. */
async function measureSteps(page, actions, settle) {
  const out = [];
  for (const act of actions) {
    const t0 = await nowMs(page);
    await act.run();
    await page.waitForTimeout(settle);
    const zm = await page.evaluate(() => { const m = /(\d+)% zoom/.exec((document.getElementById('tracker-chart-summary') || {}).textContent || ''); return m ? +m[1] : null; });
    out.push({ step: act.name, zoom: zm, ...(await readSince(page, t0)) });
  }
  const tiers = expectedTiers(await page.evaluate(() => window.__zt.paints.map((p) => p.cSz)));
  let i = tiers.length - out.reduce((n, s) => n + s.paints.length, 0);
  return out.map((s) => {
    const own = s.paints.map(() => tiers[i++]);
    return {
      step: s.step, zoom: s.zoom, paints: s.paints.length, tiers: own.join(''),
      wrongTier: s.paints.filter((p, k) => !paintMatchesTier(p, own[k])).length,
      repeats: s.paints.filter((p, k) => k > 0 && p.cSz === s.paints[k - 1].cSz).length,
      worstFrame: s.worstFrame, over50: s.framesOver50,
      loafMs: Math.round(s.loaf.ms), scriptMs: Math.round(s.loaf.script), renderMs: Math.round(s.loaf.render),
      last: s.paints[s.paints.length - 1] || null,
    };
  });
}

/** Press a zoom button (steps of 25%): they are on the View tab of the More
 *  panel, which is opened first if it is closed. */
async function zoomButton(page, which) {
  const panel = page.locator('#ppal-more-panel');
  if (!(await panel.evaluate((el) => el.classList.contains('ppal-more-panel--open')))) {
    await page.locator('button[title="More controls"]').click();
    await panel.getByRole('button', { name: 'View', exact: true }).click();
  }
  await panel.locator(`button[aria-label="${which === 'in' ? 'Zoom in' : 'Zoom out'}"]`).first().click();
}

module.exports = { installZoomTierProbes, nowMs, readSince, computeDetailTier, expectedTiers, paintMatchesTier, settledMatchesFreshPaint, zoomButton, measureSteps };
