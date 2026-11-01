/* Panning and pinching a large, many-coloured chart on a phone — the gaps
   reports/track-pan-performance-audit.md found in pan-cost.spec.js.
   ═══════════════════════════════════════════════════════════════════════════
   pan-cost.spec.js pans a one-colour 200 x 250 chart with two perfectly rigid
   fingers and never reaches the chart's edge, so it could not see:

     1. two-finger pans that zoomed by a fraction of a percent on every move
        (real fingers drift), re-rendering the tracker and repainting the
        whole tile every frame — 79 frames over 50 ms in 6 gestures;
     2. the right and bottom edges, where the painted-region check could never
        pass and every scroll frame repainted the whole tile;
     3. whether a tile move keeps its pixels and draws only the uncovered
        strip, rather than repainting the tile;
     4. a pinch, which re-rendered and repainted on every cell-size step and
        now previews with a CSS transform;
     5. a chart with half stitches, backstitch, knots, beads and petite and
        long stitches, whose petites and long stitches were all stroked on
        every paint (clipped away) wherever the view was.

   Each runs on the 400 x 500, 60-colour fixture at 4x CPU and asserts on
   counted work (see tests/_helpers/panProbes.js); wall time is logged only. */
const { test, expect } = require('@playwright/test');
const { fixtureFor } = require('../_helpers/trackerFixture');
const { suppressOnboarding } = require('../_helpers/deviceEmulation');
const { installProbes, resetProbes, readProbes, chartBox, cpuThrottle, waitForSaved } = require('../_helpers/perfProbes');
const { installPanProbes, resetPanProbes, readPanProbes, fixtureWith, zoomPercent, cellAt, scrollFrames } = require('../_helpers/panProbes');
const { routeCdnLocally } = require('../_helpers/offlineCdn');

async function openLarge(page, fields, fixture) {
  await routeCdnLocally(page);
  await suppressOnboarding(page);
  await installProbes(page);
  await installPanProbes(page);
  await page.goto('/stitch.html?from=home', { waitUntil: 'load', timeout: 120000 });
  await page.locator('input[type="file"]').first().setInputFiles(
    fixtureWith(fixture || fixtureFor('large', { doneFraction: 0.3 }), Object.assign({ savedZoom: 1, savedScroll: { left: 2000, top: 2000 } }, fields)));
  await page.waitForSelector('canvas', { timeout: 90000 });
  // The import's own save, the analysis and the first paints settle first.
  await page.waitForTimeout(12000);  // The import is saved in full a few seconds after it opens, which re-renders the tracker: let that finish first.
  await waitForSaved(page);
}

/** Two fingers `spread` px apart (plus `drift` alternating per move), their
 *  midpoint moving by step per move. */
async function twoFingerGesture(cdp, x, y, { moves, step, spread, spreadTo, drift = 0 }) {
  const pts = (k) => {
    const f = k / moves, d = spread + ((spreadTo == null ? spread : spreadTo) - spread) * f + (k % 2 ? drift : -drift);
    const mx = x + step[0] * k, my = y + step[1] * k;
    return [
      { x: mx - d / 2, y: my, id: 1, radiusX: 6, radiusY: 6, force: 1 },
      { x: mx + d / 2, y: my, id: 2, radiusX: 6, radiusY: 6, force: 1 },
    ];
  };
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: pts(0) });
  for (let k = 1; k <= moves; k++) {
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: pts(k) });
    await new Promise((r) => setTimeout(r, 16));
  }
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
}

test('a two-finger pan with finger drift neither zooms nor re-renders', async ({ page }) => {
  test.setTimeout(240000);
  await openLarge(page);
  const box = await chartBox(page);
  expect(box, 'no chart scroller found').not.toBeNull();
  const zoom0 = await zoomPercent(page);
  const cdp = await cpuThrottle(page, 4);
  await resetProbes(page); await resetPanProbes(page);
  const s0 = await page.evaluate(() => { const s = document.querySelector('.tracker-chart-scroll'); return [s.scrollLeft, s.scrollTop]; });
  for (let g = 0; g < 6; g++) {
    await twoFingerGesture(cdp, Math.round(box.x + box.w * 0.3), Math.round(box.y + box.h * 0.6),
      { moves: 12, step: [-3, -6], spread: 120, drift: 1 });
    await page.waitForTimeout(100);
  }
  await page.waitForTimeout(800);
  const s1 = await page.evaluate(() => { const s = document.querySelector('.tracker-chart-scroll'); return [s.scrollLeft, s.scrollTop]; });
  const r = await readProbes(page), p = await readPanProbes(page);
  console.log('TWO_FINGER_DRIFT ' + JSON.stringify({ scrolled: [s1[0] - s0[0], s1[1] - s0[1]], elements: r.elements, fills: r.fills, ...p }));

  expect(Math.abs(s1[0] - s0[0]) + Math.abs(s1[1] - s0[1]), 'the gesture did not pan the chart').toBeGreaterThan(100);
  expect(await zoomPercent(page), 'a pan with finger drift changed the zoom').toBe(zoom0);
  // Before the dead band: every move set the zoom and re-rendered TrackerApp,
  // and each re-render repainted the whole tile (~70 paints, 208 000 fills).
  expect(r.elements, `${r.elements} React elements during a two-finger pan`).toBeLessThan(500);
  expect(p.paints, `${p.paints} chart paints during a two-finger pan`).toBeLessThan(10);
  await cdp.detach().catch(() => {});
});

test('panning along the right edge repaints only when the tile moves', async ({ page }) => {
  test.setTimeout(240000);
  await openLarge(page, { savedZoom: 0.4 });
  await page.evaluate(() => { const s = document.querySelector('.tracker-chart-scroll'); s.scrollLeft = s.scrollWidth; s.scrollTop = 200; });
  await page.waitForTimeout(1500);
  const cdp = await cpuThrottle(page, 4);
  await resetProbes(page); await resetPanProbes(page);
  const FRAMES = 120;
  const end = await scrollFrames(page, 0, 12, FRAMES);
  const p = await readPanProbes(page), r = await readProbes(page);
  const atEdge = await page.evaluate(() => { const s = document.querySelector('.tracker-chart-scroll'); return s.scrollLeft >= s.scrollWidth - s.clientWidth - 1; });
  console.log('RIGHT_EDGE ' + JSON.stringify({ end, atEdge, frames: FRAMES, fills: r.fills, ...p }));

  expect(atEdge, 'the view is not at the right edge — the test is not measuring the edge').toBe(true);
  expect(end[1], 'the chart did not scroll').toBeGreaterThan(FRAMES * 6);
  // Before: the scroller's extent runs past the chart, the check failed on
  // every frame, and each of the 120 frames repainted the whole tile.
  expect(p.paints, `${p.paints} chart paints in ${FRAMES} frames along the edge`).toBeLessThan(FRAMES / 4);
  await cdp.detach().catch(() => {});
});

test('a tile move keeps its pixels and paints only the uncovered strip', async ({ page }) => {
  test.setTimeout(240000);
  await openLarge(page, { savedZoom: 0.75 });
  const cdp = await cpuThrottle(page, 4);
  await resetProbes(page); await resetPanProbes(page);
  await scrollFrames(page, 24, 12, 150);
  const p = await readPanProbes(page), r = await readProbes(page);
  console.log('TILE_MOVES ' + JSON.stringify({ fills: r.fills, ...p }));

  expect(p.chartCopies, 'no tile move kept its pixels — every move repainted the tile').toBeGreaterThanOrEqual(5);
  // One strip for a sideways or an up/down move, two for a diagonal one, and
  // the odd full repaint (a tap, an analysis result): never a repaint per move
  // on top of the strips.
  expect(p.paints, `${p.paints} paints for ${p.chartCopies} tile moves`).toBeLessThanOrEqual(2 * p.chartCopies + 3);
  expect(r.elements, 'scrolling re-rendered the tracker').toBe(0);
  await cdp.detach().catch(() => {});
});

test('a pinch previews with a transform and keeps the stitch under the fingers', async ({ page }) => {
  test.setTimeout(240000);
  await openLarge(page);
  const box = await chartBox(page);
  const x = Math.round(box.x + box.w / 2), y = Math.round(box.y + box.h / 2);
  const before = await cellAt(page, x, y);
  const zoom0 = await zoomPercent(page);
  const cdp = await cpuThrottle(page, 4);
  await resetProbes(page); await resetPanProbes(page);
  await twoFingerGesture(cdp, x, y, { moves: 30, step: [20 / 30, 10 / 30], spread: 120, spreadTo: 300 });
  await page.waitForTimeout(1000);
  const r = await readProbes(page), p = await readPanProbes(page);
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 1 });
  const after = await cellAt(page, x + 20, y + 10);
  const zoom1 = await zoomPercent(page);
  const transform = await page.evaluate(() => document.querySelector('.tracker-chart-layer').style.transform);
  console.log('PINCH ' + JSON.stringify({ zoom0, zoom1, before, after, elements: r.elements, fills: r.fills, ...p }));

  expect(zoom1, 'the pinch did not zoom in').toBeGreaterThan(zoom0 * 1.8);
  expect(transform, 'the zoom preview transform was left on the chart').toBe('');
  // The stitch that was under the fingers is under them again.
  expect(Math.abs(after.cx - before.cx)).toBeLessThan(1);
  expect(Math.abs(after.cy - before.cy)).toBeLessThan(1);
  // Before: each cell-size step (about 28 here) re-rendered TrackerApp and
  // repainted the whole tile. Now: a repaint per rebase (at 1.6x) and one at
  // the end, and a render for each.
  expect(p.paints, `${p.paints} chart paints during one pinch`).toBeLessThanOrEqual(6);
  await cdp.detach().catch(() => {});
});

test('panning a mixed-stitch chart strokes only the objects in view', async ({ page }) => {
  test.setTimeout(240000);
  await openLarge(page, {}, fixtureFor('large', { doneFraction: 0.3, mixed: true }));
  const cdp = await cpuThrottle(page, 4);
  await resetProbes(page); await resetPanProbes(page);
  await scrollFrames(page, 24, 12, 150);
  const p = await readPanProbes(page);
  console.log('MIXED_PAN ' + JSON.stringify(p));

  expect(p.paints, 'the pan did not paint anything').toBeGreaterThanOrEqual(5);
  // The fixture has ~2 400 petites (2 strokes each) and as many long stitches:
  // ~7 300 strokes per paint when every object was drawn. A full tile at 100%
  // holds a few hundred; a strip far fewer.
  expect(p.strokes / p.paints, `${Math.round(p.strokes / p.paints)} strokes per paint`).toBeLessThan(1500);
  await cdp.detach().catch(() => {});
});
