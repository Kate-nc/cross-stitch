/* creator/PatternCanvas.js — The interactive pattern canvas component.
   Reads from CreatorContext and GenerationContext.
   Loaded as a plain <script> before the main Babel script.
   Depends on: drawPatternBaseOnCanvas, drawPatternOverlayOnCanvas (canvasRenderer.js),
               CreatorContext, GenerationContext (context.js) */

window.PatternCanvas = function PatternCanvas() {
  var ctx = window.usePatternData();
  var cv = window.useCanvas();
  var app = window.useApp();
  var gen = window.useGeneration();
  // Hover coords live in their own context (action plan H5 = 2B.1) so the
  // 60 fps mouse-move stream only re-renders the canvas overlay, not the
  // entire CanvasContext consumer tree.
  var hov = window.useHover() || {};
  var h = React.createElement;
  var G = app.G;

  // Cache of the base render (stitches + grid + committed bsLines + border).
  // Avoids re-drawing the expensive base on every mouse-move.
  var baseCacheRef = React.useRef(null);

  // requestAnimationFrame handle — used to coalesce rapid zoom-slider changes so
  // at most one full render fires per frame.
  var rafRef = React.useRef(null);

  // Marching ants animation offset
  var antsOffsetRef = React.useRef(0);
  var antsIntervalRef = React.useRef(null);
  // Latest context snapshot ref — updated every render so the interval callback
  // always reads current state rather than the closed-over stale value.
  // Must be the MERGED snapshot across all 4 contexts because drawPatternBaseOnCanvas
  // and drawPatternOverlayOnCanvas expect the pre-refactor merged state shape.
  var ctxRef = React.useRef({});
  ctxRef.current = Object.assign({}, ctx, cv, gen, hov, { G: G, pcRef: app.pcRef, tab: app.tab });

  // ── Effect: Animated marching ants for highlight outline mode
  var hlAntsRef = React.useRef(null);
  React.useEffect(function() {
    var needAnts = cv.highlightMode === "outline" && cv.hiId;
    if (!needAnts) {
      if (hlAntsRef.current) { clearInterval(hlAntsRef.current); hlAntsRef.current = null; }
      if (cv.antsOffset !== 0 && cv.setAntsOffset) cv.setAntsOffset(0);
      return;
    }
    if (hlAntsRef.current) return;
    hlAntsRef.current = setInterval(function() {
      var latest = ctxRef.current;
      if (!latest.setAntsOffset) return;
      latest.setAntsOffset(function(p) { return (p + 1) % 20; });
      // Redraw overlay from cached base to animate ants without full re-render
      var canvas = latest.pcRef && latest.pcRef.current;
      if (!canvas || !baseCacheRef.current) return;
      if (latest.isDraggingRef && latest.isDraggingRef.current) return;
      var context = canvas.getContext("2d");
      context.putImageData(baseCacheRef.current, 0, 0);
      drawPatternOverlayOnCanvas(context, 0, 0, latest.sW, latest.sH, latest.cs, latest.G, latest);
    }, 100);
    return function() {
      if (hlAntsRef.current) { clearInterval(hlAntsRef.current); hlAntsRef.current = null; }
    };
  }, [cv.highlightMode, cv.hiId]);

  // ── Effect: Animated marching ants for selection mask
  React.useEffect(function() {
    var hasSelection = cv.selectionMask || cv.lassoPreviewMask;
    if (!hasSelection) {
      if (antsIntervalRef.current) { clearInterval(antsIntervalRef.current); antsIntervalRef.current = null; }
      antsOffsetRef.current = 0;
      return;
    }
    if (antsIntervalRef.current) return; // already running
    antsIntervalRef.current = setInterval(function() {
      antsOffsetRef.current = (antsOffsetRef.current + 1) % 20;
      var latest = ctxRef.current;
      var canvas = latest.pcRef.current;
      if (!canvas || !baseCacheRef.current) return;
      if (latest.isDraggingRef && latest.isDraggingRef.current) return;
      var context = canvas.getContext("2d");
      context.putImageData(baseCacheRef.current, 0, 0);
      var snap = Object.assign({}, latest, { antsOffset: antsOffsetRef.current });
      drawPatternOverlayOnCanvas(context, 0, 0, snap.sW, snap.sH, snap.cs, snap.G, snap);
    }, 120);
    return function() {
      if (antsIntervalRef.current) { clearInterval(antsIntervalRef.current); antsIntervalRef.current = null; }
    };
  }, [cv.selectionMask, cv.lassoPreviewMask]);

  // ── Effect 1: Full render (base + overlay). Fires when pattern content changes.
  // Uses RAF so rapid zoom-slider drags collapse into a single paint per frame.
  React.useEffect(function() {
    if (!ctx.pat || !ctx.cmap || !app.pcRef.current || app.tab !== "pattern") return;
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    // Capture values needed inside the RAF callback (avoids stale-closure issues
    // if the component unmounts or re-renders before the frame fires).
    var canvas = app.pcRef.current;
    var snap = ctxRef.current; // merged snapshot across all 4 contexts
    rafRef.current = requestAnimationFrame(function() {
      rafRef.current = null;
      if (!canvas) return;
      canvas.width  = snap.sW * snap.cs + G + 2;
      canvas.height = snap.sH * snap.cs + G + 2;
      var context = canvas.getContext("2d", { willReadFrequently: true });
      drawPatternBaseOnCanvas(context, 0, 0, snap.sW, snap.sH, snap.cs, G, snap);
      baseCacheRef.current = context.getImageData(0, 0, canvas.width, canvas.height);
      drawPatternOverlayOnCanvas(context, 0, 0, snap.sW, snap.sH, snap.cs, G, snap);
    });
    return function() {
      if (rafRef.current) { cancelAnimationFrame(rafRef.current); rafRef.current = null; }
    };
  }, [
    ctx.pat, ctx.cmap, cv.cs, ctx.sW, ctx.sH, cv.view, cv.hiId, cv.showCtr,
    cv.bsLines, app.tab, cv.showOverlay, cv.overlayOpacity,
    gen.img, ctx.partialStitches, cv.stitchType, ctx.partialStitchTool,
    gen.showCleanupDiff, gen.cleanupDiff,
    cv.dimFraction, cv.dimHiId, cv.bgDimOpacity, cv.bgDimDesaturation,
    cv.highlightMode, cv.tintColor, cv.tintOpacity, cv.spotDimOpacity,
    ctx.fabricColour, ctx.canvasTexture
  ]);

  // ── Effect 2: Overlay-only render. Fires cheaply on every mouse-move (hoverCoords).
  // Restores the cached base from ImageData then repaints just the hover elements.
  React.useEffect(function() {
    if (!ctx.pat || !ctx.cmap || !app.pcRef.current || app.tab !== "pattern") return;
    if (!baseCacheRef.current) return; // base not ready yet — Effect 1 will draw everything
    // Skip restoring the base cache while a drag-draw is in progress: applyBrush
    // imperatively paints directly onto the canvas and the overlay-only redraw
    // must not overwrite those uncommitted pixels with the stale cached image.
    if (cv.isDraggingRef && cv.isDraggingRef.current) return;
    var canvas = app.pcRef.current;
    var context = canvas.getContext("2d", { willReadFrequently: true });
    context.putImageData(baseCacheRef.current, 0, 0);
    drawPatternOverlayOnCanvas(context, 0, 0, ctx.sW, ctx.sH, cv.cs, G, ctxRef.current);
  }, [
    hov.hoverCoords, cv.selectedColorId, cv.bsStart,
    // structural deps — needed so the overlay is redrawn correctly when these change
    ctx.pat, ctx.cmap, cv.cs, ctx.sW, ctx.sH, app.tab,
    cv.activeTool, cv.brushSize, cv.stitchType, ctx.partialStitchTool, cv.bsLines,
    cv.lassoMode, cv.lassoPoints, cv.lassoPreviewMask, cv.lassoCursor, cv.lassoInProgress,
    cv.selectionMask, cv.confettiPreview
  ]);

  return h("canvas", {
    ref: app.pcRef,
    style: {
      display: "block",
      touchAction: "none",
      userSelect: "none",
      WebkitUserSelect: "none",
      WebkitTouchCallout: "none"
    },
    onPointerDown:   cv.handlePatPointerDown,
    onPointerUp:     cv.handlePatPointerUp,
    onPointerMove:   cv.handlePatPointerMove,
    onPointerLeave:  cv.handlePatPointerLeave,
    onPointerCancel: cv.handlePatPointerCancel,
    onContextMenu: function(e) {
      if (cv.activeTool === "backstitch" && cv.bsStart) {
        e.preventDefault();
        cv.setBsStart(null);
      }
    }
  });
};
