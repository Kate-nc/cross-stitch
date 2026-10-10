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
  // Avoids re-drawing the expensive base on every mouse-move. It is kept on an
  // offscreen canvas rather than as ImageData: putImageData processes the
  // whole image even for a small dirty rect, while drawImage copies only the
  // region asked for.
  var baseCacheRef = React.useRef(null);
  function restoreBase(context, x, y, w, h) {
    context.clearRect(x, y, w, h);
    context.drawImage(baseCacheRef.current, x, y, w, h, x, y, w, h);
  }

  // requestAnimationFrame handle — used to coalesce rapid zoom-slider changes so
  // at most one full render fires per frame.
  var rafRef = React.useRef(null);
  // Timer for finishing a render that drew only the visible stitches first.
  var fullDrawRef = React.useRef(null);

  // Large charts: the stitches inside the scroll area, plus half a screen
  // round it, in cells ({x0, y0, x1, y1}, ends exclusive), or null to draw
  // them all. Redrawing every stitch of a 300 x 300 chart takes a few hundred
  // milliseconds; doing that on every zoom step made zooming lag, so the
  // visible part is drawn at once and the rest when the changes stop.
  function visibleCells(canvas, snap) {
    var total = snap.sW * snap.sH;
    var sc = app.scrollRef && app.scrollRef.current;
    if (!sc || total < 20000 || !canvas.width) return null;
    var sr = sc.getBoundingClientRect(), cr = canvas.getBoundingClientRect();
    var k = cr.width / canvas.width || 1;   // CSS px per canvas px
    var cs = snap.cs * k, g = G * k;
    var mx = Math.ceil(sr.width / cs / 2), my = Math.ceil(sr.height / cs / 2);
    var x0 = Math.floor((sr.left - cr.left - g) / cs) - mx, x1 = Math.ceil((sr.right - cr.left - g) / cs) + mx;
    var y0 = Math.floor((sr.top - cr.top - g) / cs) - my, y1 = Math.ceil((sr.bottom - cr.top - g) / cs) + my;
    x0 = Math.max(0, x0); y0 = Math.max(0, y0); x1 = Math.min(snap.sW, x1); y1 = Math.min(snap.sH, y1);
    if (x1 <= x0 || y1 <= y0) return null;
    // Not worth splitting when most of the chart is on screen anyway.
    if ((x1 - x0) * (y1 - y0) > total * 0.6) return null;
    return { x0: x0, y0: y0, x1: x1, y1: y1 };
  }

  // The hover position the canvas overlay currently shows, and the other
  // overlay inputs it was last drawn with by Effect 2. Together they let a
  // pure mouse-move repaint only the crosshair bands it touches.
  var shownHoverRef = React.useRef(null);
  var overlayKeyRef = React.useRef(null);

  // Marching ants animation offset
  var antsOffsetRef = React.useRef(0);
  var antsIntervalRef = React.useRef(null);
  // Latest context snapshot ref — updated every render so the interval callback
  // always reads current state rather than the closed-over stale value.
  // Must be the MERGED snapshot across all 4 contexts because drawPatternBaseOnCanvas
  // and drawPatternOverlayOnCanvas expect the pre-refactor merged state shape.
  var ctxRef = React.useRef({});
  // Replace-colour tool: while hovering a stitch, isolate-highlight every
  // stitch of that colour so users see exactly what a click would replace.
  // Overrides the user's own highlight only while the cursor is on a stitch.
  var replaceHoverId = null;
  if (cv.activeTool === "colourReplace" && hov.hoverCoords && ctx.pat) {
    var rhc = hov.hoverCoords;
    var rhCell = (rhc.gx >= 0 && rhc.gx < ctx.sW && rhc.gy >= 0 && rhc.gy < ctx.sH) ? ctx.pat[rhc.gy * ctx.sW + rhc.gx] : null;
    if (rhCell && rhCell.id !== "__skip__" && rhCell.id !== "__empty__") replaceHoverId = rhCell.id;
  }
  ctxRef.current = Object.assign({}, ctx, cv, gen, hov, { G: G, pcRef: app.pcRef, tab: app.tab, fabricColour: app.fabricColour, canvasTexture: app.canvasTexture },
    replaceHoverId ? { hiId: replaceHoverId, dimHiId: replaceHoverId, dimFraction: 1, highlightMode: "isolate" } : null);

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
      restoreBase(context, 0, 0, canvas.width, canvas.height);
      drawPatternOverlayOnCanvas(context, 0, 0, latest.sW, latest.sH, latest.cs, latest.G, latest);
      shownHoverRef.current = latest.hoverCoords;
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
      restoreBase(context, 0, 0, canvas.width, canvas.height);
      var snap = Object.assign({}, latest, { antsOffset: antsOffsetRef.current });
      drawPatternOverlayOnCanvas(context, 0, 0, snap.sW, snap.sH, snap.cs, snap.G, snap);
      shownHoverRef.current = snap.hoverCoords;
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
      var rawW = snap.sW * snap.cs + G + 2;
      var rawH = snap.sH * snap.cs + G + 2;
      var MAX_CANVAS_DIM = 16384; // iOS Safari hard limit
      if (rawW > MAX_CANVAS_DIM || rawH > MAX_CANVAS_DIM) {
        console.warn('PatternCanvas: computed canvas size (' + rawW + '\xd7' + rawH + ') exceeds 16384px limit; clamping.');
      }
      canvas.width  = Math.min(rawW, MAX_CANVAS_DIM);
      canvas.height = Math.min(rawH, MAX_CANVAS_DIM);
      // The base is drawn into the cache, a CPU-backed canvas: its many small
      // cell draws run several times faster there than on a GPU canvas. The
      // visible canvas stays GPU-backed, so each hover repaint only uploads
      // the bands it changes rather than the whole bitmap.
      var cache = baseCacheRef.current || document.createElement("canvas");
      cache.width = canvas.width;   // also clears the previous base
      cache.height = canvas.height;
      var cacheCtx = cache.getContext("2d", { willReadFrequently: true });
      // A pinch-zoom waits for the canvas to take its new size to drop its
      // preview transform and scroll to where the fingers were; that has to
      // happen before the visible part is worked out (same frame, before
      // anything is shown).
      try { window.dispatchEvent(new Event("cs:chart-sized")); } catch (_) {}
      var vis = visibleCells(canvas, snap);
      drawPatternBaseOnCanvas(cacheCtx, 0, 0, snap.sW, snap.sH, snap.cs, G, snap, vis || undefined);
      baseCacheRef.current = cache;
      var context = canvas.getContext("2d");
      if (vis) {
        // Copy just the drawn part: copying (and uploading) the whole of a
        // chart-sized canvas was most of what was left of each zoom step.
        var rx = Math.max(0, G + vis.x0 * snap.cs - 2), ry = Math.max(0, G + vis.y0 * snap.cs - 2);
        restoreBase(context, rx, ry, Math.min(canvas.width - rx, (vis.x1 - vis.x0) * snap.cs + 4), Math.min(canvas.height - ry, (vis.y1 - vis.y0) * snap.cs + 4));
      } else {
        restoreBase(context, 0, 0, canvas.width, canvas.height);
      }
      drawPatternOverlayOnCanvas(context, 0, 0, snap.sW, snap.sH, snap.cs, G, snap);
      shownHoverRef.current = snap.hoverCoords;
      if (!vis) return;
      // The rest of the chart, once nothing has changed for a moment (any
      // change re-runs this effect and cancels it), and not mid-stroke: a
      // drag paints straight onto the canvas until it is committed. It is
      // drawn in bands of rows, a few milliseconds at a time, so the page
      // stays responsive: the frame, then every row top to bottom, then the
      // lines on top — the same pixels as one full draw. The fabric is filled
      // once, under the whole chart, so that translucent (dimmed) stitches
      // blend over the row above exactly as they do in a single draw.
      var bandRows = Math.max(1, Math.floor(4000 / snap.sW));
      var nextRow = -1;
      function finish() {
        fullDrawRef.current = null;
        if (baseCacheRef.current !== cache || app.pcRef.current !== canvas) return;
        var latest = ctxRef.current;
        if (latest.isDraggingRef && latest.isDraggingRef.current) { fullDrawRef.current = setTimeout(finish, 180); return; }
        var t0 = performance.now();
        if (nextRow < 0) {
          drawPatternBaseOnCanvas(cacheCtx, 0, 0, snap.sW, snap.sH, snap.cs, G, snap, { x0: 0, y0: 0, x1: 0, y1: 0, lines: false, fill: "all" });
          nextRow = 0;
        }
        while (nextRow < snap.sH && performance.now() - t0 < 12) {
          var y1 = Math.min(snap.sH, nextRow + bandRows);
          drawPatternBaseOnCanvas(cacheCtx, 0, 0, snap.sW, snap.sH, snap.cs, G, snap,
            { x0: 0, y0: nextRow, x1: snap.sW, y1: y1, frame: false, lines: false, fill: false });
          var by = Math.max(0, G + nextRow * snap.cs - 1);
          restoreBase(context, 0, by, canvas.width, Math.min(canvas.height - by, (y1 - nextRow) * snap.cs + 2));
          nextRow = y1;
        }
        if (nextRow < snap.sH) { fullDrawRef.current = setTimeout(finish, 0); return; }
        drawPatternBaseOnCanvas(cacheCtx, 0, 0, snap.sW, snap.sH, snap.cs, G, snap, { x0: 0, y0: 0, x1: 0, y1: 0, frame: false });
        restoreBase(context, 0, 0, canvas.width, canvas.height);
        drawPatternOverlayOnCanvas(context, 0, 0, latest.sW, latest.sH, latest.cs, G, latest);
        shownHoverRef.current = latest.hoverCoords;
      }
      fullDrawRef.current = setTimeout(finish, 180);
    });
    return function() {
      if (rafRef.current) { cancelAnimationFrame(rafRef.current); rafRef.current = null; }
      if (fullDrawRef.current) { clearTimeout(fullDrawRef.current); fullDrawRef.current = null; }
    };
  }, [
    ctx.pat, ctx.cmap, cv.cs, ctx.sW, ctx.sH, cv.view, cv.hiId, cv.showCtr,
    cv.bsLines, app.tab, cv.showOverlay, cv.overlayOpacity,
    gen.img, ctx.partialStitches, ctx.knots, cv.stitchType, ctx.partialStitchTool,
    gen.showCleanupDiff, gen.cleanupDiff,
    cv.dimFraction, cv.dimHiId, cv.bgDimOpacity, cv.bgDimDesaturation,
    cv.highlightMode, cv.tintColor, cv.tintOpacity, cv.spotDimOpacity,
    app.fabricColour, app.canvasTexture, replaceHoverId
  ]);

  // ── Effect: dragging a floating paste / turn, or a shape (audit DRAW-04). The drag
  // only moves a ghost, so repaint the overlay, at most once a frame, instead
  // of rebuilding the pattern on every move.
  React.useEffect(function() {
    var raf = null;
    function onGhost() {
      if (raf) return;
      raf = requestAnimationFrame(function() {
        raf = null;
        var canvas = app.pcRef.current;
        if (!canvas || !baseCacheRef.current) return;
        var snap = ctxRef.current;
        var context = canvas.getContext("2d");
        restoreBase(context, 0, 0, canvas.width, canvas.height);
        drawPatternOverlayOnCanvas(context, 0, 0, snap.sW, snap.sH, snap.cs, G, snap);
      });
    }
    window.addEventListener("cs:clip-ghost", onGhost);
    // A Line / Rectangle / Ellipse being dragged is drawn the same way.
    window.addEventListener("cs:shape-preview", onGhost);
    return function() {
      window.removeEventListener("cs:clip-ghost", onGhost);
      window.removeEventListener("cs:shape-preview", onGhost);
      if (raf) cancelAnimationFrame(raf);
    };
  }, []);

  // ── Effect 2: Overlay-only render. Fires cheaply on every mouse-move (hoverCoords).
  // Restores the cached base then repaints just the hover elements.
  React.useEffect(function() {
    if (!ctx.pat || !ctx.cmap || !app.pcRef.current || app.tab !== "pattern") return;
    if (!baseCacheRef.current) return; // base not ready yet — Effect 1 will draw everything
    // Effect 1 has a full render queued for the next frame (this commit
    // changed the pattern, zoom or view): repainting from the old base now
    // would clear and copy the whole canvas for nothing, on every zoom step.
    if (rafRef.current) return;
    // Skip restoring the base cache while a drag-draw is in progress: applyBrush
    // imperatively paints directly onto the canvas and the overlay-only redraw
    // must not overwrite those uncommitted pixels with the stale cached image.
    if (cv.isDraggingRef && cv.isDraggingRef.current) return;
    var canvas = app.pcRef.current;
    var context = canvas.getContext("2d");
    var key = [
      ctx.pat, ctx.cmap, cv.cs, ctx.sW, ctx.sH, app.tab, cv.selectedColorId, cv.bsStart,
      cv.activeTool, cv.brushSize, cv.stitchType, ctx.partialStitchTool, cv.bsLines,
      cv.lassoMode, cv.lassoPoints, cv.lassoPreviewMask, cv.lassoCursor, cv.lassoInProgress,
      cv.selectionMask, cv.confettiPreview, cv.cleanupPendingMask, cv.denoisePendingMask, cv.mirror
    ];
    var prevKey = overlayKeyRef.current;
    overlayKeyRef.current = key;
    var onlyHoverMoved = !!prevKey && key.every(function(v, i) { return v === prevKey[i]; });
    // The backstitch tools draw hover lines that cross the chart, so they
    // always take the full repaint.
    var hoverIsLocal = cv.activeTool !== "backstitch" && cv.activeTool !== "eraseBs";
    if (onlyHoverMoved && hoverIsLocal) {
      // Restoring the whole cached base cost ~90 ms per mouse-move on a large
      // chart at 100% (a 6,000 x 9,000 px canvas) and froze the editor. The
      // hover only draws a crosshair row and column (plus the brush preview
      // inside them), so restore and redraw just the old and new bands,
      // clipped. Everything outside them is unchanged since the last paint.
      var bandSize = cv.cs * Math.max(1, cv.brushSize || 1);
      var pad = Math.ceil(cv.cs * 0.1) + 2;
      var rects = [];
      [shownHoverRef.current, hov.hoverCoords].forEach(function(hc) {
        if (!hc || hc.gx < 0 || hc.gy < 0 || hc.gx >= ctx.sW || hc.gy >= ctx.sH) return;
        rects.push([G + hc.gx * cv.cs - pad, 0, bandSize + 2 * pad, canvas.height]);
        rects.push([0, G + hc.gy * cv.cs - pad, canvas.width, bandSize + 2 * pad]);
      });
      context.save();
      context.beginPath();
      rects.forEach(function(r) {
        var x = Math.max(0, r[0]), y = Math.max(0, r[1]);
        var w = Math.min(canvas.width, r[0] + r[2]) - x, h = Math.min(canvas.height, r[1] + r[3]) - y;
        if (w <= 0 || h <= 0) return;
        restoreBase(context, x, y, w, h);
        context.rect(x, y, w, h);
      });
      context.clip();
      drawPatternOverlayOnCanvas(context, 0, 0, ctx.sW, ctx.sH, cv.cs, G, ctxRef.current);
      context.restore();
    } else {
      restoreBase(context, 0, 0, canvas.width, canvas.height);
      drawPatternOverlayOnCanvas(context, 0, 0, ctx.sW, ctx.sH, cv.cs, G, ctxRef.current);
    }
    shownHoverRef.current = hov.hoverCoords;
  }, [
    hov.hoverCoords, cv.selectedColorId, cv.bsStart,
    // structural deps — needed so the overlay is redrawn correctly when these change
    ctx.pat, ctx.cmap, cv.cs, ctx.sW, ctx.sH, app.tab,
    cv.activeTool, cv.brushSize, cv.stitchType, ctx.partialStitchTool, cv.bsLines,
    cv.lassoMode, cv.lassoPoints, cv.lassoPreviewMask, cv.lassoCursor, cv.lassoInProgress,
    cv.selectionMask, cv.confettiPreview,
    cv.cleanupPendingMask, cv.denoisePendingMask, cv.mirror
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
