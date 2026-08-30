/**
 * Chart canvas budget — the gaps tests/chartCanvasSizeCap.test.js leaves open.
 *
 * That suite checks one canvas at a time against a per-canvas budget, on a
 * device correctly identified as iOS. Three things slip through, all recorded
 * in reports/mobile-freeze-large-patterns.md:
 *
 *   §1.2  The budget is spent once and charged up to six times — the chart plus
 *         five overlays all size to the same geometry, so an ordinary
 *         highlight + counting-aids + focus-block session allocates 4x the cap.
 *   §1.3  The iOS arm is gated on `pointer: coarse`, which iPadOS reports as
 *         `fine` whenever a trackpad or mouse is attached. Such an iPad takes
 *         the *desktop* budget: ~500 MB per canvas.
 *   §1.1  Where the clamp does engage it caps `scs` below the Tier 3 threshold,
 *         so patterns from ~300x400 up can never display symbols at any zoom.
 *
 * These are behaviour assertions on `maxChartCellSize`, not restatements of it:
 * each one fails against the pre-fix module.
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const overlaysSrc = fs.readFileSync(path.join(ROOT, 'useCanvasOverlays.js'), 'utf8');
const trackerSrc = fs.readFileSync(path.join(ROOT, 'tracker-app.js'), 'utf8');

const G = 28;
const PAD = G + 2;
const IOS_TOTAL_BUDGET = 16777216;   // Safari's ceiling for ALL canvas backing store
const SCS_PER_ZOOM = 20;

/* The tracker mounts the chart plus up to five overlays on identical geometry
   (tracker-app.js — the canvas elements around the stitchRef canvas). Four is
   the realistic concurrent count: chart + counting aids + focus block +
   breadcrumbs. Kept here as the number the budget has to survive. */
const TYPICAL_CONCURRENT_CANVASES = 4;

/** Load useCanvasOverlays.js against a stubbed window/navigator/document.
 *
 *  `innerWidth`/`innerHeight` decide which regime maxCellSize takes: supplying
 *  them models a real screen, where the chart is a viewport-sized tile;
 *  omitting them models "no window to measure", where it falls back to the
 *  pattern-proportional clamp. Both paths are exercised below. */
function loadWith({ deviceMemory, maxSide, coarse, isIOS, maxTouchPoints, innerWidth, innerHeight }) {
  const win = {
    React: { useState: () => [], useRef: () => ({}), useEffect: () => {}, useMemo: () => {}, useCallback: () => {} },
    matchMedia: (q) => ({ matches: /pointer:\s*coarse/.test(q) ? !!coarse : false }),
    innerWidth, innerHeight,
  };
  if (isIOS !== undefined) win.Platform = { isIOS: () => !!isIOS };
  const doc = {
    createElement() {
      const c = { _w: 0, height: 1 };
      Object.defineProperty(c, 'width', {
        get() { return this._w; },
        set(v) { this._w = Math.min(v, maxSide); },
      });
      c.getContext = () => ({
        fillRect() {},
        set fillStyle(_) {},
        getImageData: (x) => ({ data: [0, 0, 0, x < c._w ? 255 : 0] }),
      });
      return c;
    },
  };
  const nav = deviceMemory === undefined ? {} : { deviceMemory };
  if (maxTouchPoints !== undefined) nav.maxTouchPoints = maxTouchPoints;
  // eslint-disable-next-line no-new-func
  new Function('window', 'document', 'navigator', overlaysSrc)(win, doc, nav);
  win.__resetCanvasLimits();
  return win;
}

const areaAt = (sW, sH, scs) => (sW * scs + PAD) * (sH * scs + PAD);

/* computeDetailTier lives inside the TrackerApp component, so lift it out of
   the source the same way the other suites lift helpers they cannot import.
   Its body depends only on its arguments. */
function loadComputeDetailTier() {
  const sig = 'function computeDetailTier(cSz,cur){';
  const start = trackerSrc.indexOf(sig);
  if (start < 0) throw new Error('computeDetailTier not found in tracker-app.js');
  let depth = 0, end = -1;
  for (let i = trackerSrc.indexOf('{', start); i < trackerSrc.length; i++) {
    if (trackerSrc[i] === '{') depth++;
    else if (trackerSrc[i] === '}') { depth--; if (depth === 0) { end = i + 1; break; } }
  }
  // eslint-disable-next-line no-new-func
  return new Function(trackerSrc.slice(start, end) + '\nreturn computeDetailTier;')();
}
const computeDetailTier = loadComputeDetailTier();

/* The tier walk has hysteresis, so "can this cell size show symbols?" means
   "does the tier settle at 3+ when climbing from the bottom", which is what a
   user zooming in actually does. */
function tierWhenZoomingIn(cSz) {
  let t = 1;
  for (let i = 0; i < 8; i++) {
    const n = computeDetailTier(cSz, t);
    if (n === t) break;
    t = n;
  }
  return t;
}
const SYMBOL_TIER = 3;

describe('the tier walk itself (guards the assertions below)', () => {
  test('symbols need Tier 3, and Tier 3 needs a cell of at least 13 px', () => {
    expect(tierWhenZoomingIn(12)).toBeLessThan(SYMBOL_TIER);
    expect(tierWhenZoomingIn(13)).toBeGreaterThanOrEqual(SYMBOL_TIER);
  });
});

describe('§1.3 — an iPad with a trackpad is still an iPad', () => {
  // iPadOS 13.4+ switches the primary pointer to `fine` when a Magic Keyboard,
  // trackpad or Bluetooth mouse is attached. Safari reports no deviceMemory
  // either way, so `pointer: coarse` is the only thing standing between such a
  // device and the 134 Mpx desktop budget.
  const IPAD_WITH_TRACKPAD = {
    deviceMemory: undefined, maxSide: 16384, coarse: false, isIOS: true, maxTouchPoints: 5,
  };

  test('gets the iOS budget, not the desktop one', () => {
    const win = loadWith(IPAD_WITH_TRACKPAD);
    expect(win.canvasSizeLimits().area).toBeLessThanOrEqual(IOS_TOTAL_BUDGET);
  });

  test('does not hand a 200x250 pattern a half-gigabyte canvas', () => {
    const win = loadWith(IPAD_WITH_TRACKPAD);
    const scs = win.maxChartCellSize(200, 250);
    const bytes = areaAt(200, 250, scs) * 4;
    expect(bytes).toBeLessThanOrEqual(IOS_TOTAL_BUDGET * 4);
  });

  test('a real desktop is unaffected — it is not iOS and keeps its budget', () => {
    const win = loadWith({ deviceMemory: 8, maxSide: 16384, coarse: false, isIOS: false, maxTouchPoints: 0 });
    expect(win.canvasSizeLimits().area).toBeGreaterThan(IOS_TOTAL_BUDGET);
  });

  test('detection survives helpers.js not having loaded yet', () => {
    // useCanvasOverlays.js is a plain <script>; it must not hard-depend on
    // load order, so an absent window.Platform falls back to the media query.
    const win = loadWith({ deviceMemory: undefined, maxSide: 16384, coarse: true, isIOS: undefined });
    expect(win.canvasSizeLimits().area).toBeLessThanOrEqual(IOS_TOTAL_BUDGET);
  });
});

/* An iPad's screen. Small enough that a viewport tile plus overscan fits the
   per-canvas share of the iOS budget, which is the case that matters — if it
   did not fit, tiling would buy nothing. */
const IPAD = {
  deviceMemory: undefined, maxSide: 16384, coarse: true, isIOS: true, maxTouchPoints: 5,
  innerWidth: 1024, innerHeight: 1366,
};
/* Same device with nothing to measure — first paint, or a non-browser host.
   Exercises the pattern-proportional fallback. */
const IPAD_UNMEASURED = Object.assign({}, IPAD, { innerWidth: undefined, innerHeight: undefined });

describe('§1.2 — the budget covers every canvas that mounts, not just one', () => {
  // Asserted on the fallback regime, where the canvas really is
  // pattern-proportional and the arithmetic is visible from here. The tiled
  // regime allocates a viewport-sized surface instead, which only a running
  // page can measure — tests/mobile-audit/chart-canvas-budget.spec.js sums the
  // real backing stores there.
  test.each([[200, 250], [300, 400], [400, 500], [600, 800]])(
    'a %ix%i chart plus its overlays stays inside the total budget (untiled)', (sW, sH) => {
      const win = loadWith(IPAD_UNMEASURED);
      const scs = win.maxChartCellSize(sW, sH);
      const total = areaAt(sW, sH, scs) * TYPICAL_CONCURRENT_CANVASES;
      expect(total).toBeLessThanOrEqual(IOS_TOTAL_BUDGET);
    });

  test('one canvas may take only its share of the device budget', () => {
    const win = loadWith(IPAD_UNMEASURED);
    expect(win.chartPerCanvasBudget() * TYPICAL_CONCURRENT_CANVASES)
      .toBeLessThanOrEqual(win.canvasSizeLimits().area);
  });

  test('the tracker really does mount the overlays this test assumes', () => {
    // If overlays are ever consolidated, TYPICAL_CONCURRENT_CANVASES should
    // move with them rather than this suite quietly over-budgeting.
    const overlayRefs = [
      'ref={threadUsageCanvasRef}', 'ref={recOverlayCanvasRef}',
      'ref={breadcrumbCanvasRef}', 'ref={focusOverlayCanvasRef}',
      'ref={countingAidsCanvasRef}',
    ];
    const mounted = overlayRefs.filter(r => trackerSrc.includes(r));
    expect(mounted.length + 1).toBeGreaterThanOrEqual(TYPICAL_CONCURRENT_CANVASES);
  });
});

describe('§1.1 — symbols stay reachable at every pattern size', () => {
  // The whole point of the tracker is telling one symbol from another. A chart
  // that cannot reach Tier 3 is a grid of coloured squares. Before tiling, the
  // clamp held a 400x500 chart at scs 9 and a 600x800 at scs 5.
  test.each([[100, 100], [200, 250], [300, 400], [400, 500], [600, 800]])(
    'a %ix%i pattern can be zoomed until symbols render', (sW, sH) => {
      const win = loadWith(IPAD);
      const scs = win.maxChartCellSize(sW, sH);
      expect(tierWhenZoomingIn(scs)).toBeGreaterThanOrEqual(SYMBOL_TIER);
    });

  test('the zoom ceiling does not collapse as patterns grow', () => {
    const win = loadWith(IPAD);
    const zoomCeiling = (sW, sH) => win.maxChartCellSize(sW, sH) / SCS_PER_ZOOM;
    // The surface cost tracks the viewport, not the pattern, so a 600x800
    // chart gets the same zoom range as a 100x100 one.
    expect(zoomCeiling(600, 800)).toBe(zoomCeiling(100, 100));
    expect(zoomCeiling(600, 800)).toBeGreaterThanOrEqual(1);
  });

  test('a tile that does not fit the budget still falls back to clamping', () => {
    // A very large screen on a very small budget: the tile itself is
    // unaffordable, so the pattern-proportional clamp has to take over rather
    // than waving through an unbounded cell size.
    const win = loadWith(Object.assign({}, IPAD, { innerWidth: 6000, innerHeight: 4000 }));
    const scs = win.maxChartCellSize(600, 800);
    expect(areaAt(600, 800, scs)).toBeLessThanOrEqual(win.chartPerCanvasBudget());
  });
});
