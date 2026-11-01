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

  test('renderStitch paints the whole tile and records it, and who painted it', () => {
    const fn = tracker.slice(tracker.indexOf('const renderStitch=useCallback('), tracker.indexOf('// Scroll-driven repaint.'));
    // A full tile used to paint only the viewport plus a margin, and repaint
    // as you scrolled out of it, on a canvas that already covered everything.
    expect(fn).toMatch(/drawStitch\(ctx,scs,\{left:tile\.x, top:tile\.y, right:tile\.x\+paintW, bottom:tile\.y\+paintH,/);
    expect(fn).not.toMatch(/tile\.full \? viewportRect/);
    expect(fn).toMatch(/paintedRectRef\.current=\{\s*left:tile\.x, top:tile\.y, right:tile\.x\+tile\.w, bottom:tile\.y\+tile\.h, scs:scs\s*\};/);
    expect(fn).toMatch(/chartPaintedByRef\.current=renderStitch;/);
  });

  test('the scroll handler skips the repaint when still inside that region', () => {
    const fn = tracker.slice(tracker.indexOf('const renderStitchIfScrolledOut'), tracker.indexOf('// PERF: single/bulk stitch toggles'));
    expect(fn).toMatch(/painted\.scs===scs/);
    expect(fn).toMatch(/l>=painted\.left&&t>=painted\.top&&r<=painted\.right&&b<=painted\.bottom\)return;/);
    expect(fn).toMatch(/if\(shiftChartTile\(\)\)return;\n  renderStitch\(\);/);
  });

  test('only the part of the view that is chart is checked', () => {
    // The scroller runs a few px past the chart (ruler borders; 60 px on
    // tablets for the controls strip), which the tile can never cover. At the
    // right or bottom edge the check failed on every frame, so each scroll
    // frame repainted the whole tile: 150-350 ms frames when zoomed out.
    const fn = tracker.slice(tracker.indexOf('const renderStitchIfScrolledOut'), tracker.indexOf('function shiftChartTile('));
    expect(fn).toMatch(/const cr=off\.x\+G\+\(v\.x1-v\.x0\)\*scs\+2, cb=off\.y\+G\+\(v\.y1-v\.y0\)\*scs\+2;/);
    expect(fn).toMatch(/const r=Math\.min\(cr,/);
    expect(fn).toMatch(/b=Math\.min\(cb,/);
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

describe('a tile move keeps what is already drawn', () => {
  const fn = tracker.slice(tracker.indexOf('function shiftChartTile('), tracker.indexOf('// PERF: single/bulk stitch toggles'));

  test('it copies the overlap and paints only the uncovered strips, clipped', () => {
    expect(fn).toMatch(/ctx\.drawImage\(canvas, ddx>0\?ax:0, ddy>0\?ay:0, W-ax, H-ay, ddx>0\?0:ax, ddy>0\?0:ay, W-ax, H-ay\);/);
    expect(fn).toMatch(/ctx\.rect\(l,t,r-l,b-t\);ctx\.clip\(\);/);
    expect(fn).toMatch(/drawStitch\(ctx,scs,\{left:l-m,top:t-m,right:r\+m,bottom:b\+m,/);
    expect(fn).toMatch(/shiftChartOverlays\(prev,tile\);\n  return true;/);
  });

  test('it refuses whenever the pixels on the canvas cannot be kept as they are', () => {
    // Something drawn changed since the last full paint.
    expect(fn).toMatch(/if\(chartPaintedByRef\.current!==renderStitch\)return false;/);
    // A different size or render scale, a move bigger than the tile, or a
    // move that is not a whole number of device pixels.
    expect(fn).toMatch(/if\(tile\.full\|\|tile\.w!==prev\.w\|\|tile\.h!==prev\.h\)return false;/);
    expect(fn).toMatch(/if\(want!==s\|\|canvas\.width!==Math\.round\(tile\.w\*s\)\|\|canvas\.height!==Math\.round\(tile\.h\*s\)\)return false;/);
    expect(fn).toMatch(/Math\.abs\(dx\)>=tile\.w\|\|Math\.abs\(dy\)>=tile\.h\)return false;/);
    expect(fn).toMatch(/Math\.abs\(ddx-Math\.round\(ddx\)\)>1e-6\|\|Math\.abs\(ddy-Math\.round\(ddy\)\)>1e-6\)return false;/);
  });

  test('every paint uses the detail tier for the current cell size', () => {
    // The tier effect runs after the redraw effect, so a zoom across the Tier
    // 3/4 boundary painted the previous tier and nothing repainted it. A kept
    // tile would keep that mistake, so drawStitch works the tier out itself.
    const draw = tracker.slice(tracker.indexOf('function drawStitch(ctx,cSz,viewportRect,isDoneAt){'), tracker.indexOf('const symAlpha='));
    expect(draw).toMatch(/if\(!lockDetailLevel\)tierRef\.current=computeDetailTier\(cSz,tierRef\.current\);\n  const tier=lockDetailLevel\?3:tierRef\.current;/);
  });
});

describe('two-finger pans', () => {
  test('a zoom too small to change the cell size does not repaint the chart', () => {
    // drawStitch draws with scs, never stitchZoom; with stitchZoom in the
    // dependencies every fraction-of-a-percent zoom repainted the whole tile.
    const deps = tracker.match(/\n\},\[pat,cmap,scs,sW,sH,showCtr,bsLines,done,[^\]]*\]\);/)[0];
    expect(deps).not.toMatch(/stitchZoom/);
    const inputs = tracker.slice(tracker.indexOf('const inputs=['), tracker.indexOf('const prev=redrawInputsRef.current;'));
    expect(inputs).not.toMatch(/stitchZoom/);
  });

  test('the fingers must pinch past a dead band before the chart zooms', () => {
    // Finger drift of a pixel or two zoomed on every move, and each zoom
    // re-rendered the tracker: 79 frames over 50 ms in a 6-gesture pan.
    expect(tracker).toMatch(/const PINCH_ZOOM_DEADBAND=0\.04;/);
    expect(tracker).toMatch(/if\(!ts\.pinchZooming\)\{\n    if\(Math\.abs\(dist\/ts\.pinchDist-1\)<PINCH_ZOOM_DEADBAND\)dist=ts\.pinchDist;\n    else\{ts\.pinchZooming=true;ts\.pinchDist=dist;\}\n  \}/);
    expect(tracker).toMatch(/ts\.pinchZoom=stitchZoomRef\.current;\n    ts\.startZoom=ts\.pinchZoom;\n    ts\.pinchZooming=false;/);
  });
});

describe('zoom preview: a pinch or wheel zoom is a transform until it ends', () => {
  const block = tracker.slice(tracker.indexOf('// ═══ Zoom preview'), tracker.indexOf('// Throttle React zoom state to one update per animation frame.'));
  const move = tracker.slice(tracker.indexOf('function handleTouchMove(e){'), tracker.indexOf('function handleTouchEnd(e){'));
  const end = tracker.slice(tracker.indexOf('function handleTouchEnd(e){'), tracker.indexOf('function toggleOwned('));
  const wheel = tracker.slice(tracker.indexOf('function handleStitchWheel(e){'), tracker.indexOf('// R6 — who owns a one-finger drag'));

  test('the chart layer is what gets transformed', () => {
    expect(tracker).toMatch(/<div ref=\{chartLayerRef\} className="tracker-chart-layer"/);
    expect(block).toMatch(/layer\.style\.transform="translate\("\+tx\+"px,"\+ty\+"px\) scale\("\+k\+"\)";/);
  });

  test('a pinch move updates the transform, not the zoom state, once zooming has engaged', () => {
    expect(move).toMatch(/if\(ts\.pinchZooming\)\{[\s\S]*?if\(zoomPreviewRef\.current\)\{[\s\S]*?updateZoomPreview\(newZoom,cmx,cmy\)[\s\S]*?return;\n    \}\n  \}\n  if\(newZoom!==stitchZoomRef\.current\)scheduleZoomUpdate\(newZoom\);/);
  });

  test('it rebases when the scaled tile stops covering the view or is stretched too far', () => {
    expect(block).toMatch(/const ZOOM_PREVIEW_MAX_SCALE=1\.6;/);
    expect(block).toMatch(/if\(k>=ZOOM_PREVIEW_MAX_SCALE\)return false;/);
    expect(block).toMatch(/return X\(p\.canvas\.l\)<=nl\+1&&Y\(p\.canvas\.t\)<=nt\+1&&X\(p\.canvas\.r\)>=nr-1&&Y\(p\.canvas\.b\)>=nb-1;/);
    expect(move).toMatch(/commitZoomPreview\(\);\n        ts\.pinchZoom=stitchZoomRef\.current;ts\.pinchDist=dist;/);
  });

  test('the commit renders synchronously and places the anchored stitch before the redraw', () => {
    expect(block).toMatch(/if\(flush\)flush\(\(\)=>setStitchZoom\(z\)\);else setStitchZoom\(z\);/);
    // Layout effects run before the redraw effect, so the chart paints at the new scroll.
    expect(block).toMatch(/React\.useLayoutEffect\(\(\)=>\{\n  if\(pendingZoomAnchorRef\.current\)applyZoomAnchor\(scs\);\n  else if\(zoomPreviewRef\.current\)cancelZoomPreview\(\);\n\},\[scs,stitchZoom\]\);/);
    // The anchor is measured against the chart box where it is after the new zoom rendered.
    expect(block).toMatch(/const v=viewBoundsRef\.current, sr=el\.getBoundingClientRect\(\);/);
    // A redraw the commit already did is not done twice.
    expect(tracker).toMatch(/if\(chartPaintedByRef\.current===renderStitch\)return;/);
  });

  test('it is committed when the pinch ends, is cancelled, or a press arrives', () => {
    expect(end).toMatch(/if\(zoomPreviewRef\.current&&ts\.mode==="pinch"&&!\(e\.touches&&e\.touches\.length>=2\)\)commitZoomPreview\(\);\n  if\(e\.touches&&e\.touches\.length>0\)return;/);
    expect(tracker).toMatch(/canvas\.addEventListener\("touchcancel",te,\{passive:false\}\);/);
    expect(tracker).toMatch(/function handleCanvasPointerDownCapture\(e\)\{\n[\s\S]{0,200}if\(zoomPreviewRef\.current&&touchStateRef\.current\.mode!=="pinch"\)commitZoomPreview\(\);/);
  });

  test('hover hit-tests the pointer as it would be without the preview scale', () => {
    // gridCoord measures from the canvas's box on screen, which the preview scales.
    expect(tracker).toMatch(/let gc=gridCoord\(stitchRef,unpreviewedPoint\(e\),scs,G,false,chartTileRef\.current\);/);
    expect(block).toMatch(/return\{clientX:r\.left\+\(e\.clientX-r\.left\)\/p\.k,clientY:r\.top\+\(e\.clientY-r\.top\)\/p\.k\};/);
  });

  test('a scroll during a preview cannot put the old anchor back', () => {
    // A plain wheel lands the preview before it scrolls natively ...
    expect(wheel).toMatch(/if\(!e\.ctrlKey&&!e\.metaKey\)\{if\(zoomPreviewRef\.current\)commitZoomPreview\(\);return;\}/);
    // ... and the commit reads the layer's box on screen now, not the origin recorded when the preview began.
    expect(block).toMatch(/const lr=layer\.getBoundingClientRect\(\);\n  pendingZoomAnchorRef\.current=\{\n    cx:\(p\.mx-lr\.left\)\/p\.k\/cs0, cy:\(p\.my-lr\.top\)\/p\.k\/cs0,/);
  });

  test('wheel zoom previews too and commits when the events pause', () => {
    expect(wheel).toMatch(/const p=zoomPreviewRef\.current\|\|beginZoomPreview\(e\.clientX,e\.clientY\);/);
    expect(wheel).toMatch(/wheelCommitTimerRef\.current=setTimeout\(commitZoomPreview,ZOOM_PREVIEW_WHEEL_IDLE_MS\);/);
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

describe('overlays follow a tile move the way the chart does', () => {
  const shift = tracker.slice(tracker.indexOf('function shiftChartOverlays(prev,tile){'), tracker.indexOf('function regionCellRange('));

  test('shiftChartTile hands the move to shiftChartOverlays instead of redrawing them whole', () => {
    const fn = tracker.slice(tracker.indexOf('function shiftChartTile('), tracker.indexOf('// PERF: single/bulk stitch toggles'));
    expect(fn).toMatch(/shiftChartOverlays\(prev,tile\);\n  return true;/);
    expect(fn).not.toMatch(/redrawChartOverlays\(\)/);
  });

  test('the overlap is copied with "copy", so translucent overlays do not stack on themselves', () => {
    // source-over turned the focus overlay's 94% dim into 99.6% after a few moves.
    expect(shift).toMatch(/ctx\.globalAlpha=1;ctx\.globalCompositeOperation="copy";\n      ctx\.drawImage\(canvas,/);
    expect(shift).toMatch(/applyChartTile\(canvas,tile,G,\{scale:1,blankOnMove:false\}\);/);
  });

  test('each uncovered strip is clipped and cleared before the overlay draws into it', () => {
    expect(shift).toMatch(/ctx\.rect\(st\.l,st\.t,st\.r-st\.l,st\.b-st\.t\);ctx\.clip\(\);\n        ctx\.clearRect\(st\.l,st\.t,st\.r-st\.l,st\.b-st\.t\);\n        o\.draw\(st\);/);
  });

  test('an overlay whose canvas is not on the previous tile is drawn whole', () => {
    expect(shift).toMatch(/if\(!canvas\|\|!at\|\|at\.x!==prev\.x\|\|at\.y!==prev\.y\|\|at\.w!==W\|\|at\.h!==H\|\|\(at\.scale\|\|1\)!==1\|\|canvas\.width!==W\|\|canvas\.height!==H\)\{o\.draw\(\);continue;\}/);
  });

  test('the canvas overlays register their canvas; the SVG ants are redrawn whole', () => {
    for (const [name, ref] of [['threadUsage', 'threadUsageCanvasRef'], ['countingAids', 'countingAidsCanvasRef'], ['recPulse', 'recOverlayCanvasRef'], ['focusBlock', 'focusOverlayCanvasRef'], ['breadcrumbs', 'breadcrumbCanvasRef']]) {
      expect(tracker).toMatch(new RegExp('registerChartOverlay\\("' + name + '",[^\\n]*\\(\\)=>' + ref + '\\.current\\)'));
    }
    expect(tracker).toMatch(/registerChartOverlay\("ants",draw\)/);
  });

  test('the per-cell overlays only walk the uncovered strip, and ignore rAF timestamps', () => {
    const tu = tracker.slice(tracker.indexOf('═══ Thread usage overlay rendering ═══'), tracker.indexOf('═══ Recommendation pulsing border animation ═══'));
    expect(tu).toMatch(/const rg=\(region&&typeof region==="object"\)\?region:null;/);
    expect(tu).toMatch(/const r0=regionCellRange\(tileCellRange\(prep\.tile,scs\),rg,scs\);/);
    const ca = tracker.slice(tracker.indexOf('═══ Counting aids overlay ═══'), tracker.indexOf('Marching-ants outline'));
    expect(ca).toMatch(/const rg=\(region&&typeof region==="object"\)\?region:null;/);
    expect(ca).toMatch(/const cr=regionCellRange\(tileCellRange\(prep\.tile,scs\),rg&&\{l:rg\.l-20,t:rg\.t-20,r:rg\.r\+20,b:rg\.b\+20\},scs\);/);
  });

  test('regionCellRange narrows the tile cells to those a region touches', () => {
    const src = tracker.slice(tracker.indexOf('function regionCellRange('), tracker.indexOf('// Point an overlay canvas at the chart'));
    const fn = new Function('G', src + 'return regionCellRange;')(28);
    const tileCells = { x0: 10, y0: 20, x1: 60, y1: 90 };
    expect(fn(tileCells, null, 10)).toBe(tileCells);
    // chart px 28 + 10*c is the left of cell c
    expect(fn(tileCells, { l: 28 + 400, t: 28 + 300, r: 28 + 455, b: 28 + 301 }, 10)).toEqual({ x0: 40, y0: 30, x1: 46, y1: 31 });
    // never outside the tile
    expect(fn(tileCells, { l: 0, t: 0, r: 99999, b: 99999 }, 10)).toEqual(tileCells);
  });
});

describe('a mouse pan does not re-render the tracker', () => {
  test('panning is a ref, and the cursor is written directly', () => {
    // As state it re-rendered all of TrackerApp when each pan started and
    // ended: ~3 500 elements per drag in Navigate mode.
    expect(tracker).not.toMatch(/\[isPanning,setIsPanning\]=useState/);
    expect(tracker).not.toMatch(/setIsPanning\(/);
    expect(tracker).toMatch(/const isPanningRef=useRef\(false\);/);
    expect(tracker).toMatch(/function setPanning\(on\)\{\n  if\(isPanningRef\.current===on\)return;\n  isPanningRef\.current=on;\n  refreshChartCursor\(\);\n\}/);
    expect(tracker).toMatch(/function chartCursorNow\(\)\{return isPanningRef\.current\?"grabbing":isSpaceDownRef\.current\?"grab":chartCursorRef\.current;\}/);
  });

  test('every pan start and end goes through setPanning', () => {
    const start = tracker.slice(tracker.indexOf('function startPan(e){'), tracker.indexOf('function doPan(e){'));
    expect(start).toMatch(/setPanning\(true\);/);
    const nav = tracker.slice(tracker.indexOf('function beginNavPress('), tracker.indexOf('function toggleGuideAt('));
    expect(nav).toMatch(/press\.dragging=true;[\s\S]{0,200}setPanning\(true\);/);
    expect(nav).toMatch(/if\(press\.dragging\)\{setPanning\(false\);return;\}/);
    expect(tracker).toMatch(/function handleStitchMouseMove\(e\)\{\n  if\(isPanningRef\.current\)\{/);
  });

  test('the render keeps the resting cursor for setPanning, and Space updates it without a render', () => {
    expect(tracker).toMatch(/cursor:\(chartCursorRef\.current=\(/);
    expect(tracker).toMatch(/isSpaceDownRef\.current=true;spaceDownTimeRef\.current=Date\.now\(\);spacePannedRef\.current=false;refreshChartCursor\(\);/);
    expect(tracker).toMatch(/if\(e\.code==="Space"\)\{isSpaceDownRef\.current=false;spacePannedRef\.current=false;refreshChartCursor\(\);\}/);
  });
});
