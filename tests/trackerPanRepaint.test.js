/**
 * Chart repaint cost while panning — reports/mobile-experience-audit.md A4.
 *
 * Two independent per-frame costs made panning a large chart unusable on a
 * phone. Both were found only after the harness was fixed to drive a gesture
 * that actually scrolls (the earlier figure in the report was retracted
 * because it never reached the pan path at all).
 *
 *   1. Every scroll frame ran a full renderStitch, repainting the visible
 *      slice from scratch — even though drawStitch already paints a 20-cell
 *      margin around it, so most frames had nothing new to show.
 *      Measured: 285,513 fillRect calls across 8 pan gestures.
 *
 *   2. The recommendation-pulse overlay is sized to the whole chart
 *      (4030x5030 on a 200x250 pattern) and cleared itself entirely on every
 *      animation frame. Measured: 4.2 BILLION pixels cleared across the same
 *      8 gestures.
 *
 * The behavioural numbers live in tests/mobile-audit/pan-cost.spec.js; these
 * are the structural guards.
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const tracker = fs.readFileSync(path.join(ROOT, 'tracker-app.js'), 'utf8');
const css = fs.readFileSync(path.join(ROOT, 'styles.css'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');

describe('scroll does not repaint while the viewport is inside the painted region', () => {
  test('the overdraw margin has a single definition', () => {
    // renderStitch and drawStitch must agree on how far past the viewport is
    // painted, or the skip logic would serve blank pixels. A tiled caller
    // supplies its own margin (0 — the tile already contains it); everything
    // else still derives it from the one helper.
    expect(tracker).toMatch(/function chartOverdraw\(cSz\)\{return Math\.max\(40,20\*cSz\);\}/);
    expect(tracker).toMatch(/const OVERDRAW=\(viewportRect&&typeof viewportRect\.overdraw==="number"\)\?viewportRect\.overdraw:chartOverdraw\(cSz\);/);
    // ...and nowhere recomputes it by hand.
    expect(tracker).not.toMatch(/OVERDRAW\s*=\s*Math\.max\(40,\s*20\s*\*\s*cSz\)/);
  });

  test('renderStitch records the region it painted', () => {
    expect(tracker).toMatch(/paintedRectRef\.current=\{[\s\S]{0,200}left:viewportRect\.left-od/);
    // A null viewportRect means the whole chart was drawn, so every scroll
    // position is already covered.
    expect(tracker).toMatch(/paintedRectRef\.current=\{left:-Infinity,top:-Infinity,right:Infinity,bottom:Infinity/);
  });

  test('the scroll handler skips the repaint when still inside that region', () => {
    const fn = tracker.slice(tracker.indexOf('const renderStitchIfScrolledOut'), tracker.indexOf('// PERF: single/bulk stitch toggles'));
    expect(fn).toMatch(/painted\.scs===scs/);
    expect(fn).toMatch(/l>=painted\.left&&t>=painted\.top&&r<=painted\.right&&b<=painted\.bottom\)return;/);
    expect(fn).toMatch(/renderStitch\(\);/);
  });

  test('onScroll goes through the skip check, not straight to renderStitch', () => {
    expect(tracker).toMatch(/onScroll=\{\(\)=>\{[^}]*renderStitchIfScrolledOut\(\)/);
    expect(tracker).not.toMatch(/onScroll=\{\(\)=>\{[^}]*\{renderStitch\(\);scrollRafRef/);
  });

  test('the cell size is part of the validity check', () => {
    // A zoom change resizes the canvas and invalidates everything on it, so a
    // painted region recorded at a different scs must never be trusted.
    expect(tracker).toMatch(/scs:scs\s*\n?\s*\};/);
  });
});

describe('the recommendation pulse clears only what it drew', () => {
  test('it no longer clears the whole overlay every frame', () => {
    const block = tracker.slice(tracker.indexOf('Recommendation pulsing border animation'), tracker.indexOf('Focus area three-zone dimming overlay'));
    // The full clear survives only as the first-frame fallback and after the
    // surface is invalidated, never as the per-frame path.
    expect(block).toMatch(/for\(const b of prev\)\{const p=b\.lw\+2;ctx\.clearRect\(b\.x-p,b\.y-p,b\.w\+p\*2,b\.h\+p\*2\);\}/);
    expect(block).toMatch(/else clearOverlayTile\(ctx,prep\.tile\);/);
  });

  test('an invalidated surface skips the clear, because it is already blank', () => {
    const block = tracker.slice(tracker.indexOf('Recommendation pulsing border animation'), tracker.indexOf('Focus area three-zone dimming overlay'));
    // Both a resize and a tile *move* blank the canvas — whatever it held was
    // painted for the old origin — so the incremental clear must be skipped
    // for either. applyChartTile reports both as `invalidated`.
    expect(block).toMatch(/const resized=prep\.invalidated;/);
    expect(block).toMatch(/if\(!resized\)\{/);
    const apply = tracker.slice(tracker.indexOf('function applyChartTile'), tracker.indexOf('function clearWholeChartCanvas'));
    expect(apply).toMatch(/invalidated:resized\|\|moved/);
  });

  test('the drawn rectangles are remembered for the next frame', () => {
    expect(tracker).toMatch(/const recPulseBoxesRef=useRef\(null\);/);
    expect(tracker).toMatch(/recPulseBoxesRef\.current=boxes;/);
  });
});

describe('remaining tracker touch targets', () => {
  test('the highlight-style buttons carry a class so CSS can reach them', () => {
    // They have inline padding, which outranks any stylesheet rule, so
    // without a class of their own they cannot be enlarged for touch.
    expect(tracker).toMatch(/<button key=\{v\} className="ppal-hl-mode-btn"/);
    expect(css).toMatch(/\.ppal-hl-mode-btn,[\s\S]{0,80}\{ min-height:44px/);
  });

  test('panel checkboxes are sized by class, not inline', () => {
    // Same trap: `style={{width:16,height:16}}` beat the coarse-pointer rule.
    expect(tracker).not.toMatch(/style=\{\{width:16,height:16,cursor:"pointer"\}\}/);
    expect(tracker).toMatch(/className="ppal-check"/);
    expect(css).toMatch(/\.ppal-check\{ width:16px; height:16px; cursor:pointer; \}/);
    expect(css).toMatch(/input\[type=checkbox\], \.ppal-check\{ width:24px; height:24px; \}/);
  });
});
