/* The device-check settings for the tiled chart (useCanvasOverlays.js):
   ?overscan=N and ?chartscale=1, read together with ?tileshift=0 by the
   ?perf=1 readout so panning can be compared on a real device
   (reports/track-progress-write-cost.md, Part 2). Absent, nothing changes;
   present, they can only move within bounds the canvas budget already checks. */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const SRC = fs.readFileSync(path.join(ROOT, 'useCanvasOverlays.js'), 'utf8');

function load(search, { dpr = 2, innerWidth = 393, innerHeight = 851 } = {}) {
  const win = {
    React: { useState: () => [], useRef: () => ({}), useEffect: () => {}, useMemo: () => {}, useCallback: () => {} },
    matchMedia: () => ({ matches: false }), innerWidth, innerHeight, devicePixelRatio: dpr,
  };
  const doc = {
    createElement() {
      const c = { width: 0, height: 1 };
      c.getContext = () => ({ fillRect() {}, set fillStyle(_) {}, getImageData: () => ({ data: [0, 0, 0, 255] }) });
      return c;
    },
  };
  // eslint-disable-next-line no-new-func
  new Function('window', 'document', 'navigator', 'location', SRC)(win, doc, {}, { search });
  win.__resetCanvasLimits();
  return win;
}

test('without the settings the margin is 300 px and the chart renders at the device ratio', () => {
  const w = load('?from=home');
  expect(w.chartTileOverscan).toBe(300);
  expect(w.chartRenderScale(1000 * 1000)).toBe(2);
});

test('?overscan sets the margin, kept between 100 and 600 px', () => {
  expect(load('?overscan=150').chartTileOverscan).toBe(150);
  expect(load('?from=home&overscan=450&perf=1').chartTileOverscan).toBe(450);
  expect(load('?overscan=20').chartTileOverscan).toBe(100);
  expect(load('?overscan=99999').chartTileOverscan).toBe(600);
  expect(load('?overscan=abc').chartTileOverscan).toBe(300);
});

test('?chartscale=1 draws the chart at 1x, and nothing else does', () => {
  expect(load('?chartscale=1').chartRenderScale(1000 * 1000)).toBe(1);
  expect(load('?chartscale=2').chartRenderScale(1000 * 1000)).toBe(2);
  expect(load('?chartscale=10').chartRenderScale(1000 * 1000)).toBe(2);
});

test('a larger margin is still held to the canvas budget', () => {
  // The largest tile the budget is asked about grows with the margin, and the
  // same figure decides the render scale and the cell-size ceiling.
  expect(SRC).toMatch(/var w = window\.innerWidth \+ TILE_OVERSCAN \* 2;/);
  expect(SRC).toMatch(/if \(DEVICE_CHECK\.overscan\) TILE_OVERSCAN = DEVICE_CHECK\.overscan;/);
});

test('the perf readout reports how the chart was set up and counts tile copies', () => {
  const hud = fs.readFileSync(path.join(ROOT, 'perf-hud.js'), 'utf8');
  expect(hud).toMatch(/chart: chart\(\)/);
  expect(hud).toMatch(/tileShift: !\/\[\?&\]tileshift=0/);
  expect(hud).toMatch(/overscan: window\.chartTileOverscan/);
  expect(hud).toMatch(/src === this\.canvas && arguments\.length >= 9/);
});
