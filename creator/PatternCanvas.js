/* creator/PatternCanvas.js — The interactive pattern canvas component.
   Reads from CreatorContext. Loaded as a plain <script> before the main Babel script.
   Depends on: drawPatternBaseOnCanvas, drawPatternOverlayOnCanvas (canvasRenderer.js),
               CreatorContext (context.js) */

window.PatternCanvas = function PatternCanvas() {
  var ctx = React.useContext(window.CreatorContext);
  var h = React.createElement;
  var G = ctx.G;

  // Cache of the base render (stitches + grid + committed bsLines + border).
  // Avoids re-drawing the expensive base on every mouse-move.
  var baseCacheRef = React.useRef(null);

  // requestAnimationFrame handle — used to coalesce rapid zoom-slider changes so
  // at most one full render fires per frame.
  var rafRef = React.useRef(null);

  // ── Effect 1: Full render (base + overlay). Fires when pattern content changes.
  // Uses RAF so rapid zoom-slider drags collapse into a single paint per frame.
  React.useEffect(function() {
    if (!ctx.pat || !ctx.cmap || !ctx.pcRef.current || ctx.tab !== "pattern") return;
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    // Capture values needed inside the RAF callback (avoids stale-closure issues
    // if the component unmounts or re-renders before the frame fires).
    var canvas = ctx.pcRef.current;
    var snap = ctx; // current context snapshot
    rafRef.current = requestAnimationFrame(function() {
      rafRef.current = null;
      if (!canvas) return;
      canvas.width  = snap.sW * snap.cs + G + 2;
      canvas.height = snap.sH * snap.cs + G + 2;
      var context = canvas.getContext("2d");
      drawPatternBaseOnCanvas(context, 0, 0, snap.sW, snap.sH, snap.cs, G, snap);
      baseCacheRef.current = context.getImageData(0, 0, canvas.width, canvas.height);
      drawPatternOverlayOnCanvas(context, 0, 0, snap.sW, snap.sH, snap.cs, G, snap);
    });
    return function() {
      if (rafRef.current) { cancelAnimationFrame(rafRef.current); rafRef.current = null; }
    };
  }, [
    ctx.pat, ctx.cmap, ctx.cs, ctx.sW, ctx.sH, ctx.view, ctx.hiId, ctx.showCtr,
    ctx.bsLines, ctx.tab, ctx.showOverlay, ctx.overlayOpacity,
    ctx.img, ctx.halfStitches, ctx.stitchType, ctx.halfStitchTool,
    ctx.showCleanupDiff, ctx.cleanupDiff
  ]);

  // ── Effect 2: Overlay-only render. Fires cheaply on every mouse-move (hoverCoords).
  // Restores the cached base from ImageData then repaints just the hover elements.
  React.useEffect(function() {
    if (!ctx.pat || !ctx.cmap || !ctx.pcRef.current || ctx.tab !== "pattern") return;
    if (!baseCacheRef.current) return; // base not ready yet — Effect 1 will draw everything
    // Skip restoring the base cache while a drag-draw is in progress: applyBrush
    // imperatively paints directly onto the canvas and the overlay-only redraw
    // must not overwrite those uncommitted pixels with the stale cached image.
    if (ctx.isDraggingRef && ctx.isDraggingRef.current) return;
    var canvas = ctx.pcRef.current;
    var context = canvas.getContext("2d");
    context.putImageData(baseCacheRef.current, 0, 0);
    drawPatternOverlayOnCanvas(context, 0, 0, ctx.sW, ctx.sH, ctx.cs, G, ctx);
  }, [
    ctx.hoverCoords, ctx.selectedColorId, ctx.bsStart,
    // structural deps — needed so the overlay is redrawn correctly when these change
    ctx.pat, ctx.cmap, ctx.cs, ctx.sW, ctx.sH, ctx.tab,
    ctx.activeTool, ctx.brushSize, ctx.stitchType, ctx.halfStitchTool, ctx.bsLines
  ]);

  return h("canvas", {
    ref: ctx.pcRef,
    style: {
      display: "block",
      touchAction: "none",
      userSelect: "none",
      WebkitUserSelect: "none",
      WebkitTouchCallout: "none"
    },
    onPointerDown:   ctx.handlePatPointerDown,
    onPointerUp:     ctx.handlePatPointerUp,
    onPointerMove:   ctx.handlePatPointerMove,
    onPointerLeave:  ctx.handlePatPointerLeave,
    onPointerCancel: ctx.handlePatPointerCancel,
    onContextMenu: function(e) {
      if (ctx.activeTool === "backstitch" && ctx.bsStart) {
        e.preventDefault();
        ctx.setBsStart(null);
      }
    }
  });
};
