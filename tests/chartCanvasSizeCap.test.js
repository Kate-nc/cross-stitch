/**
 * Chart canvas size cap (mobile freeze fix).
 *
 * The tracker sizes its chart and every overlay to the whole pattern at the
 * current zoom (`canvas.width = sW*scs + G + 2`). Mobile browsers refuse
 * oversized canvases — iOS Safari caps a single canvas at 16,777,216 px^2
 * (~4096x4096) and many mobile GPUs will not texture a surface wider than
 * 4096 px. Neither throws: the canvas silently renders blank while the tab
 * thrashes memory. `maxChartCellSize()` derives the largest cell size that
 * stays inside the device's limits, and the tracker uses it as a zoom
 * ceiling so `scs`, the zoom read-out and the pinch/wheel scroll maths all
 * stay consistent.
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const overlaysSrc = fs.readFileSync(path.join(ROOT, 'useCanvasOverlays.js'), 'utf8');
const trackerSrc = fs.readFileSync(path.join(ROOT, 'tracker-app.js'), 'utf8');

const G = 28;
const PAD = G + 2;

/** Load useCanvasOverlays.js against a stubbed window/navigator. */
function loadWith({ deviceMemory, maxSide, coarse }) {
  const win = {
    React: { useState: () => [], useRef: () => ({}), useEffect: () => {}, useMemo: () => {}, useCallback: () => {} },
    matchMedia: (q) => ({ matches: /pointer:\s*coarse/.test(q) ? !!coarse : false }),
  };
  const doc = {
    createElement() {
      const c = { _w: 0, height: 1 };
      Object.defineProperty(c, 'width', {
        get() { return this._w; },
        // Emulate the browser refusing an oversized backing store.
        set(v) { this._w = Math.min(v, maxSide); },
      });
      c.getContext = () => ({
        fillRect() {},
        set fillStyle(_) {},
        // Only the last real pixel of an accepted canvas reads back opaque.
        getImageData: (x) => ({ data: [0, 0, 0, x < c._w ? 255 : 0] }),
      });
      return c;
    },
  };
  const nav = deviceMemory === undefined ? {} : { deviceMemory };
  // eslint-disable-next-line no-new-func
  new Function('window', 'document', 'navigator', overlaysSrc)(win, doc, nav);
  win.__resetCanvasLimits();
  return win;
}

describe('maxChartCellSize — device canvas budget', () => {
  test('iOS-like device (no deviceMemory, coarse pointer, 4096 side) caps a 200x250 chart', () => {
    const win = loadWith({ deviceMemory: undefined, maxSide: 4096, coarse: true });
    const scs = win.maxChartCellSize(200, 250);
    const w = 200 * scs + PAD, h = 250 * scs + PAD;
    expect(w).toBeLessThanOrEqual(4096);
    expect(h).toBeLessThanOrEqual(4096);
    expect(w * h).toBeLessThanOrEqual(16777216);
    // Still a usable chart, not degenerate.
    expect(scs).toBeGreaterThanOrEqual(8);
  });

  test('the cap is the largest cell size that fits — one step more would not', () => {
    const win = loadWith({ deviceMemory: undefined, maxSide: 4096, coarse: true });
    const scs = win.maxChartCellSize(200, 250);
    const over = scs + 1;
    const tooWide = 200 * over + PAD > 4096;
    const tooTall = 250 * over + PAD > 4096;
    const tooBig = (200 * over + PAD) * (250 * over + PAD) > 16777216;
    expect(tooWide || tooTall || tooBig).toBe(true);
  });

  test('desktop keeps the full 4x zoom range on ordinary pattern sizes', () => {
    const win = loadWith({ deviceMemory: 8, maxSide: 16384, coarse: false });
    // scs ceiling is 20 * ZOOM_MAX(4) = 80 — unchanged from before the fix.
    expect(win.maxChartCellSize(60, 60)).toBe(80);    // 4830^2  =  23 Mpx
    expect(win.maxChartCellSize(100, 100)).toBe(80);  // 8030^2  =  65 Mpx
  });

  test('desktop caps only where the browser would have refused the canvas anyway', () => {
    const win = loadWith({ deviceMemory: 8, maxSide: 16384, coarse: false });
    // A 200x250 chart at scs 80 would be 16030x20030 = 321 Mpx. Chrome's own
    // hard limit is 268 Mpx, so the *old* code already produced a blank chart
    // at that zoom — the cap turns a silent failure into a lower ceiling.
    const scs = win.maxChartCellSize(200, 250);
    expect(scs).toBeLessThan(80);
    expect((200 * scs + PAD) * (250 * scs + PAD)).toBeLessThanOrEqual(134217728);
    // The default zoom-1 view (scs 20, 20.3 Mpx) is untouched on desktop.
    expect(scs).toBeGreaterThanOrEqual(20);
  });

  test('the desktop budget leaves room for the second full-size overlay canvas', () => {
    // The tracker mounts the chart plus at least one overlay at identical
    // dimensions, so a per-canvas budget of half Chrome's 268 Mpx limit is
    // what keeps the *pair* inside it.
    const win = loadWith({ deviceMemory: 8, maxSide: 16384, coarse: false });
    const scs = win.maxChartCellSize(200, 250);
    const one = (200 * scs + PAD) * (250 * scs + PAD);
    expect(one * 2).toBeLessThanOrEqual(268435456);
  });

  test('a low-memory device gets the tightest budget', () => {
    const win = loadWith({ deviceMemory: 1, maxSide: 4096, coarse: true });
    const scs = win.maxChartCellSize(200, 250);
    expect((200 * scs + PAD) * (250 * scs + PAD)).toBeLessThanOrEqual(16777216);
  });

  test('returns 0 when a pattern cannot fit at the minimum usable cell size', () => {
    const win = loadWith({ deviceMemory: undefined, maxSide: 4096, coarse: true });
    expect(win.maxChartCellSize(5000, 5000)).toBe(0);
  });

  test('unknown pattern size returns the uncapped ceiling', () => {
    const win = loadWith({ deviceMemory: 8, maxSide: 16384, coarse: false });
    expect(win.maxChartCellSize(0, 0)).toBe(80);
    expect(win.maxChartCellSize(undefined, undefined)).toBe(80);
  });

  test('a blocked canvas probe fails safe to the conservative 4096 side limit', () => {
    const win = loadWith({ deviceMemory: undefined, maxSide: 0, coarse: true });
    const lim = win.canvasSizeLimits();
    expect(lim.side).toBe(4096);
  });
});

describe('the cap is actually wired into the tracker', () => {
  test('useCanvasOverlays receives sH as well as sW', () => {
    expect(trackerSrc).toMatch(/useCanvasOverlays\(\s*\{\s*sW\s*,\s*sH\s*\}\s*\)/);
  });

  test('scs is clamped by maxCellSize, not just derived from zoom', () => {
    expect(overlaysSrc).toMatch(/const\s+scs\s*=\s*useMemo\(\s*\(\)\s*=>\s*Math\.min\(/);
    expect(overlaysSrc).toMatch(/maxCellSize\(sW\s*,\s*sH\)\)\s*,\s*\[stitchZoom\s*,\s*sW\s*,\s*sH\]/);
  });

  test('setStitchZoom is a clamping wrapper over the raw state setter', () => {
    expect(overlaysSrc).toMatch(/const\s*\[\s*stitchZoom\s*,\s*_setStitchZoom\s*\]\s*=\s*useState/);
    expect(overlaysSrc).toMatch(/Math\.min\(next\s*,\s*maxZoomRef\.current\)/);
  });

  test('the wheel and pinch handlers clamp to maxZoom, not the bare 4', () => {
    // Ceiling applied last so it still wins when maxZoom < the 0.3 floor.
    expect(trackerSrc).toMatch(/Math\.min\(maxZoom,Math\.max\(0\.3,oldZoom\+delta\)\)/);
    expect(trackerSrc).toMatch(/Math\.min\(maxZoom,Math\.max\(0\.3,oldZoom\*scale\)\)/);
    expect(trackerSrc).not.toMatch(/Math\.min\(4,oldZoom/);
  });

  test('scheduleZoomUpdate clamps the ref the scroll maths reads back', () => {
    expect(trackerSrc).toMatch(/stitchZoomRef\.current=Math\.min\(newZoom,maxZoom\)/);
  });

  test('tracker rejects projects that cannot fit at the minimum cell size', () => {
    expect(trackerSrc).toMatch(/maxChartCellSize\(nextW,nextH\)<2/);
  });
});

describe('animation loops release the main thread', () => {
  test('the recommendation pulse bails out before starting its rAF loop', () => {
    // The early return must precede `const draw`, otherwise the loop is
    // scheduled anyway and only its body no-ops (the original bug).
    const guard = trackerSrc.indexOf('if(!recommendations||!recommendations.top||!recommendations.top.length||!recEnabled||!analysisResult){');
    const drawDecl = trackerSrc.indexOf('const draw=', guard - 500);
    expect(guard).toBeGreaterThan(-1);
    expect(drawDecl).toBeGreaterThan(guard);
  });

  test('the recommendation pulse suspends while the tab is hidden', () => {
    expect(trackerSrc).toMatch(/document\.addEventListener\("visibilitychange",onVis\)/);
  });

  test('the recommendation pulse respects reduced motion', () => {
    const block = trackerSrc.slice(trackerSrc.indexOf('const recPulseRef'), trackerSrc.indexOf('// ═══ Focus area three-zone dimming overlay ═══'));
    expect(block).toMatch(/prefers-reduced-motion: reduce/);
    expect(block).toMatch(/if\(prefersReducedMotion\)\{draw\(true\);return;\}/);
  });

  test('the marching-ants timer respects reduced motion and tab visibility', () => {
    const block = trackerSrc.slice(trackerSrc.indexOf('const hlAntsIntervalRef'), trackerSrc.indexOf('const updateHoverOverlay'));
    expect(block).toMatch(/prefers-reduced-motion: reduce/);
    expect(block).toMatch(/visibilitychange/);
    expect(block).toMatch(/setInterval\(\(\)=>setAntsOffset/);
  });
});
