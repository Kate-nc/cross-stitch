/* creator/useCanvasInteraction.js — All canvas mouse handlers, brush application,
   and crop handlers. Extracted from CreatorApp.
   Depends on globals: React, gridCoord, drawCk, drawPatternOnCanvas (for full
   redraws during drag-erase of backstitch). */

// Grid cells on the line from (x0, y0) to (x1, y1), both ends included,
// each touching the previous one (Bresenham). Pointer moves arrive tens of
// pixels apart on a fast stroke, so a drag paints along this line rather
// than only under each sample (audit B-11).
function lineCells(x0, y0, x1, y1) {
  var cells = [];
  var dx = Math.abs(x1 - x0), dy = -Math.abs(y1 - y0);
  var sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1;
  var err = dx + dy;
  for (;;) {
    cells.push({ x: x0, y: y0 });
    if (x0 === x1 && y0 === y1) break;
    var e2 = 2 * err;
    if (e2 >= dy) { err += dy; x0 += sx; }
    if (e2 <= dx) { err += dx; y0 += sy; }
  }
  return cells;
}
window.lineCells = lineCells;

/* computePinchScroll — pure maths for the two-finger gesture. `pinch` holds
   the scroll position and finger midpoint captured when the gesture began,
   plus the scroll container's viewport origin and the canvas's offset inside
   the scrolled content. Returns the scroll position that keeps the chart
   point that was under the starting midpoint under the current midpoint,
   after scaling by `ratio` (current zoom / starting zoom). With ratio 1 this
   is a plain pan: the chart follows the fingers. */
window.computePinchScroll = function computePinchScroll(pinch, midX, midY, ratio) {
  var originX = pinch.originX || 0, originY = pinch.originY || 0;
  var padX = pinch.padX || 0, padY = pinch.padY || 0;
  var focalX = pinch.startScrollLeft + (pinch.startMidX - originX) - padX;
  var focalY = pinch.startScrollTop + (pinch.startMidY - originY) - padY;
  return {
    scrollLeft: Math.max(0, focalX * ratio + padX - (midX - originX)),
    scrollTop: Math.max(0, focalY * ratio + padY - (midY - originY)),
  };
};

window.useCanvasInteraction = function useCanvasInteraction(state, history) {
  // Internal drag refs (not in state — don't need React rendering)
  var isDraggingRef        = React.useRef(false);
  var lastDragCellRef      = React.useRef(null);  // last cell the stroke reached
  var dragChangesRef       = React.useRef([]);
  var dragCellsRef         = React.useRef(new Set());
  var dragActionRef        = React.useRef(null);
  var dragPatRef           = React.useRef(null);
  var dragPartialStitchesRef = React.useRef(null);
  var dragBsLinesRef       = React.useRef(null);
  var activePointersRef    = React.useRef(new Map());
  var pinchStateRef        = React.useRef(null);
  var panStateRef          = React.useRef(null);
  var pendingTapRef        = React.useRef(null);
  var longPressTimerRef    = React.useRef(null);
  var longPressTriggeredRef = React.useRef(false);
  var touchDrawRef         = React.useRef(null);  // one finger drawing (loupe / tap-on-lift)
  var navTapRef            = React.useRef(null);  // last Navigate tap, for double-tap zoom
  var navTapTimerRef       = React.useRef(null);

  var TC = (typeof window !== 'undefined' && window.TouchConstants) || null;
  var TOUCH_TAP_SLOP = TC ? TC.TAP_SLOP_PX : 10;
  var LONG_PRESS_MS = TC ? TC.LONG_PRESS_MS : 500;
  var DOUBLE_TAP_MS = TC ? TC.DOUBLE_TAP_MAX_MS : 300;
  var DOUBLE_TAP_DIST = TC ? TC.DOUBLE_TAP_MAX_DIST_PX : 24;
  var DOUBLE_TAP_ZOOM = 3;

  // Line / Rectangle / Ellipse being dragged (audit DRAW-04):
  // { tool, x0, y0, x1, y1 } in cells, or null. Drawn as a preview by the
  // canvas overlay (shapePreview); stitched when the pointer is released.
  var shapeRef = React.useRef(null);
  function isShapeTool(t) { return t === "line" || t === "rect" || t === "ellipse"; }
  function notifyOverlay() {
    try { window.dispatchEvent(new Event("cs:shape-preview")); } catch (_) {}
  }
  // A shape being dragged is dropped (not stitched) when the gesture turns
  // into a pinch or the pointer is cancelled.
  function cancelShape() {
    if (!shapeRef.current) return;
    shapeRef.current = null;
    notifyOverlay();
  }
  function shapePreview() {
    var sh = shapeRef.current;
    if (!sh || !window.ShapeTools) return null;
    return {
      tool: sh.tool,
      cells: window.ShapeTools.shapeCells(sh.tool, { x: sh.x0, y: sh.y0 }, { x: sh.x1, y: sh.y1 },
        { snap: !!state.lineSnap, filled: !!state.shapeFilled })
    };
  }

  function getActiveTool() { return state.activeToolRef ? state.activeToolRef.current : state.activeTool; }
  function getPartialStitchTool() { return state.partialStitchToolRef ? state.partialStitchToolRef.current : state.partialStitchTool; }

  // After painting, preserve any pal entries that just dropped to 0 stitches.
  // buildPaletteWithScratch drops them entirely; this keeps them as count:0 so
  // the "unused" chip dimming and × / Remove-unused button can appear.
  function rebuildPreservingZeros(np) {
    var r = state.buildPaletteWithScratch(np);
    var existingPal = state.pal || [];
    var inResult = new Set(r.pal.map(function(p) { return p.id; }));
    var zeroed = existingPal
      .filter(function(p) { return !inResult.has(p.id); })
      .map(function(p) { return Object.assign({}, p, { count: 0 }); });
    if (!zeroed.length) return r;
    var cmap2 = Object.assign({}, r.cmap);
    zeroed.forEach(function(p) { cmap2[p.id] = p; });
    return { pal: r.pal.concat(zeroed), cmap: cmap2 };
  }

  // Hand tool acts as "explicit pan mode" — for the purposes of the
  // pointer handlers below it is treated identically to "no active
  // tool", which already has a 1-finger touch pan + mouse-drag pan
  // path. This way Hand works for mouse, pen and touch users without
  // a separate code branch.
  function isPanTool() { return getActiveTool() === "hand"; }
  // Navigate mode (audit DRAW-01): no tool acts on the chart. One finger or a
  // mouse drag pans, a tap shows the stitch's thread, a long-press opens the
  // menu. Two fingers pan and zoom in either mode.
  function isNavigate() { return !!(state.drawModeRef && state.drawModeRef.current === false); }

  // Open the stitch context menu for the cell under a viewport point.
  function openCellMenuAt(clientX, clientY) {
    if (typeof state.setContextMenu !== "function" || !state.pat || !state.pcRef || !state.pcRef.current) return false;
    var gc = gridCoord(state.pcRef, { clientX: clientX, clientY: clientY }, state.cs, state.G, false);
    if (!gc || gc.gx < 0 || gc.gx >= state.sW || gc.gy < 0 || gc.gy >= state.sH) return false;
    var idx = gc.gy * state.sW + gc.gx;
    state.setContextMenu({ x: clientX, y: clientY, gx: gc.gx, gy: gc.gy, idx: idx, cell: state.pat[idx] });
    return true;
  }

  // ─── Touch drawing (audit DRAW-03) ───────────────────────────────────────────
  // With one finger in Draw mode these tools wait for the finger to lift: a
  // tap places one stitch at the last target cell, so the finger can settle
  // (with the loupe showing what is under it) and a second finger arriving
  // for a pinch cancels cleanly. Beyond the tap slop, Paint, Erase and the
  // half stitches stroke as they do with a mouse.
  function touchDrawKind() {
    var t = getActiveTool(), p = getPartialStitchTool();
    if (p) return p === "half-fwd" || p === "half-bck" ? "stroke" : "single";
    if (t === "paint" || t === "eraseAll") return "stroke";
    if (isShapeTool(t)) return "stroke";
    if (t === "eyedropper") return "single";
    if (t === "text") return "single";
    if (t === "knot") return "single";
    return null;
  }
  function precisionOn() { return !!(state.precisionCursorRef && state.precisionCursorRef.current); }
  function magnifierOn() { return !!(state.magnifierRef && state.magnifierRef.current); }
  function pointEvent(x, y) {
    return { clientX: x, clientY: y, button: 0, pointerType: "touch", shiftKey: false, altKey: false, ctrlKey: false, metaKey: false, preventDefault: function() {}, stopPropagation: function() {} };
  }
  function loupeColour() {
    var t = getActiveTool();
    if (t === "eraseAll" || t === "eyedropper") return null;
    var entry = state.selectedColorId && state.cmap ? state.cmap[state.selectedColorId] : null;
    var rgb = entry && entry.rgb;
    return rgb && rgb.length >= 3 ? "rgb(" + rgb[0] + "," + rgb[1] + "," + rgb[2] + ")" : null;
  }
  // Show the loupe / precision cursor for a finger at (x, y), and the hover
  // highlight on the target cell.
  function showTouchTarget(x, y, precision, snap) {
    var target = window.precisionTarget ? window.precisionTarget(x, y, precision) : { x: x, y: y };
    var gc = state.pcRef && state.pcRef.current ? gridCoord(state.pcRef, { clientX: target.x, clientY: target.y }, state.cs, state.G, !!snap) : null;
    if (gc) {
      var hc = state.hoverCoords;
      if (!hc || hc.gx !== gc.gx || hc.gy !== gc.gy) state.setHoverCoords(gc);
    }
    var loupe = window.creatorLoupe;
    if (!loupe) return target;
    var magnify = magnifierOn();
    if (!gc || (!magnify && !precision)) { loupe.hide(); return target; }
    loupe.show({
      x: target.x, y: target.y, cell: gc, snap: !!snap,
      cs: state.cs, G: state.G, source: state.pcRef.current,
      magnifier: magnify, precision: precision, colour: loupeColour()
    });
    return target;
  }
  function hideTouchTarget() {
    if (window.creatorLoupe) window.creatorLoupe.hide();
  }
  function cancelTouchDraw() {
    if (!touchDrawRef.current) return;
    touchDrawRef.current = null;
    hideTouchTarget();
  }
  function clearNavTap() {
    navTapRef.current = null;
    if (navTapTimerRef.current) { clearTimeout(navTapTimerRef.current); navTapTimerRef.current = null; }
  }

  // Double-tap in Navigate: zoom to 300% centred on the tap, or back to Fit
  // when already there.
  function toggleDoubleTapZoom(clientX, clientY) {
    var sc = state.scrollRef && state.scrollRef.current, pc = state.pcRef && state.pcRef.current;
    if (!sc || !pc) return;
    if (state.zoom >= DOUBLE_TAP_ZOOM - 0.01) {
      if (typeof state.fitZ === "function") state.fitZ();
      return;
    }
    var pRect = pc.getBoundingClientRect();
    var fx = (clientX - pRect.left - state.G) / state.cs;
    var fy = (clientY - pRect.top - state.G) / state.cs;
    var newCs = Math.max(2, Math.round(20 * DOUBLE_TAP_ZOOM));
    var wantW = state.sW * newCs + state.G + 2;
    state.setZoom(DOUBLE_TAP_ZOOM);
    var tries = 0;
    function centre() {
      var sc2 = state.scrollRef.current, pc2 = state.pcRef.current;
      if (!sc2 || !pc2) return;
      // The canvas resizes a frame or two after the zoom changes.
      if (pc2.width < Math.min(wantW, 16384) && ++tries < 30) { requestAnimationFrame(centre); return; }
      var cRect = sc2.getBoundingClientRect(), p2 = pc2.getBoundingClientRect();
      var padX = p2.left - cRect.left + sc2.scrollLeft;
      var padY = p2.top - cRect.top + sc2.scrollTop;
      sc2.scrollLeft = padX + state.G + fx * newCs - sc2.clientWidth / 2;
      sc2.scrollTop = padY + state.G + fy * newCs - sc2.clientHeight / 2;
    }
    requestAnimationFrame(centre);
  }

  function isPrimaryButton(e) {
    return (e.button == null ? 0 : e.button) === 0;
  }

  function isTouchPointer(e) {
    return e.pointerType === "touch";
  }

  function clearLongPressTimer() {
    if (longPressTimerRef.current) {
      clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
  }

  function clearPendingTap() {
    pendingTapRef.current = null;
    longPressTriggeredRef.current = false;
    clearLongPressTimer();
  }

  function redrawCanvasFromState(patOverride, partialStitchesOverride, bsLinesOverride) {
    var pcRef = state.pcRef;
    if (!pcRef.current || !state.pat) return;
    var ctx2 = pcRef.current.getContext("2d");
    drawPatternOnCanvas(ctx2, 0, 0, state.sW, state.sH, state.cs, state.G, Object.assign({}, state, {
      pat: patOverride || state.pat,
      partialStitches: partialStitchesOverride || state.partialStitches,
      bsLines: bsLinesOverride || state.bsLines,
    }));
  }

  function cancelDragSession() {
    if (!isDraggingRef.current) return;
    isDraggingRef.current = false;
    lastDragCellRef.current = null;
    dragChangesRef.current = [];
    dragCellsRef.current.clear();
    dragActionRef.current = null;
    dragPatRef.current = null;
    dragPartialStitchesRef.current = null;
    dragBsLinesRef.current = null;
    redrawCanvasFromState();
  }

  function startPinchGesture() {
    var scrollRef = state.scrollRef, pcRef = state.pcRef;
    if (!scrollRef.current || !pcRef.current || activePointersRef.current.size !== 2) return;
    if (pinchStateRef.current && pinchStateRef.current.previewing) commitPinchPreview(pinchStateRef.current);
    var pts = Array.from(activePointersRef.current.values());
    var midX = (pts[0].x + pts[1].x) / 2;
    var midY = (pts[0].y + pts[1].y) / 2;
    var sc = scrollRef.current;
    var originX = 0, originY = 0, padX = 0, padY = 0;
    if (sc.getBoundingClientRect) {
      // Viewport origin of the scroll container, and the canvas's offset
      // inside its scrolled content (gutter / centring padding).
      var cRect = sc.getBoundingClientRect();
      var pRect = pcRef.current.getBoundingClientRect();
      originX = cRect.left; originY = cRect.top;
      padX = pRect.left - cRect.left + sc.scrollLeft;
      padY = pRect.top - cRect.top + sc.scrollTop;
    }
    pinchStateRef.current = {
      startDist: Math.hypot(pts[1].x - pts[0].x, pts[1].y - pts[0].y),
      startZoom: state.zoom,
      lastAppliedZoom: state.zoom,
      startScrollLeft: sc.scrollLeft,
      startScrollTop: sc.scrollTop,
      startMidX: midX,
      startMidY: midY,
      originX: originX, originY: originY,
      padX: padX, padY: padY,
      canvasLeft: pRect ? pRect.left : 0, canvasTop: pRect ? pRect.top : 0,
    };
  }

  // While two fingers zoom, the chart is scaled with a CSS transform rather
  // than redrawn: redrawing a large chart at every step made pinch-zoom lag
  // badly (each step resizes and repaints a canvas thousands of pixels
  // across). The zoom is applied once, when the fingers lift, and the scroll
  // set so the stitch that was under them stays there (computePinchScroll).
  function previewPinch(pinch, zoom, midX, midY) {
    var canvas = state.pcRef.current;
    if (!canvas) return;
    if (!pinch.previewing) {
      // Where the canvas is now (pans before the zoom started have scrolled
      // it), measured before any transform.
      var r = canvas.getBoundingClientRect();
      pinch.previewing = true;
      pinch.previewLeft = r.left; pinch.previewTop = r.top;
      canvas.style.willChange = "transform";
    }
    pinch.pendingZoom = zoom;
    pinch.lastMidX = midX; pinch.lastMidY = midY;
    // The chart point that was under the starting midpoint, in canvas CSS
    // pixels, is the transform origin; it moves to the current midpoint.
    var px = pinch.startMidX - pinch.canvasLeft, py = pinch.startMidY - pinch.canvasTop;
    var tx = midX - (pinch.previewLeft + px), ty = midY - (pinch.previewTop + py);
    canvas.style.transformOrigin = px + "px " + py + "px";
    canvas.style.transform = "translate(" + tx + "px," + ty + "px) scale(" + (zoom / pinch.startZoom) + ")";
  }
  function commitPinchPreview(pinch) {
    var canvas = state.pcRef.current, scrollRef = state.scrollRef;
    pinch.previewing = false;
    var zoom = pinch.pendingZoom;
    var next = window.computePinchScroll(pinch, pinch.lastMidX, pinch.lastMidY, zoom / pinch.startZoom);
    function settle() {
      if (canvas) { canvas.style.transform = ""; canvas.style.transformOrigin = ""; canvas.style.willChange = ""; }
      if (scrollRef.current) { scrollRef.current.scrollLeft = next.scrollLeft; scrollRef.current.scrollTop = next.scrollTop; }
    }
    if (zoom === state.zoom) { settle(); return; }
    // Settle once PatternCanvas has resized the canvas for the new zoom (in
    // the frame it draws it, before it is shown), so the scroll isn't clamped
    // to the old size and the transform isn't applied to the new drawing;
    // until then the transform keeps showing the zoomed view.
    var done = false, fallback = null;
    var canListen = typeof window.addEventListener === "function";
    function onDrawn() {
      if (done) return;
      done = true;
      if (canListen) window.removeEventListener("cs:chart-sized", onDrawn);
      clearTimeout(fallback);
      settle();
    }
    if (canListen) window.addEventListener("cs:chart-sized", onDrawn);
    fallback = setTimeout(onDrawn, 1000);
    state.setZoom(zoom);
  }
  // The pinch is over (fewer than two fingers): apply a previewed zoom.
  function endPinchIfDone() {
    if (activePointersRef.current.size >= 2) return;
    var pinch = pinchStateRef.current;
    pinchStateRef.current = null;
    if (pinch && pinch.previewing) commitPinchPreview(pinch);
  }

  // The scroll position always follows the midpoint of the two fingers, so a
  // steady two-finger drag pans; zoom is applied only when its rounded value
  // changes, keeping the content point under the starting midpoint pinned.
  function updatePinchGesture() {
    var pinch = pinchStateRef.current;
    var scrollRef = state.scrollRef, pcRef = state.pcRef;
    if (!pinch || !scrollRef.current || !pcRef.current || activePointersRef.current.size !== 2) return;
    var pts = Array.from(activePointersRef.current.values());
    var midX = (pts[0].x + pts[1].x) / 2;
    var midY = (pts[0].y + pts[1].y) / 2;
    var dist = Math.hypot(pts[1].x - pts[0].x, pts[1].y - pts[0].y);
    if (!dist || !pinch.startDist) return;
    var nextZoom = Math.max(0.05, Math.min(state.maxZoom || 3, Math.round((pinch.startZoom * (dist / pinch.startDist)) * 100) / 100));
    pinch.lastAppliedZoom = nextZoom;
    // Zooming (now or earlier in this gesture): scale the drawn chart until
    // the fingers lift. A steady two-finger drag still pans by scrolling.
    if (nextZoom !== pinch.startZoom || pinch.previewing) {
      previewPinch(pinch, nextZoom, midX, midY);
      return;
    }
    var next = window.computePinchScroll(pinch, midX, midY, 1);
    scrollRef.current.scrollLeft = next.scrollLeft;
    scrollRef.current.scrollTop = next.scrollTop;
  }

  // ─── applyBrush ─────────────────────────────────────────────────────────────
  function applyBrush(gx, gy, action) {
    var sW = state.sW, sH = state.sH, cs = state.cs, G = state.G;
    var pcRef = state.pcRef;
    var selectedColorId = state.selectedColorId;
    var cmap = state.cmap;
    var brushSize = state.brushSize;
    var showOverlay = state.showOverlay;
    var overlayOpacity = state.overlayOpacity;
    var bsLines = state.bsLines;

    var np = dragPatRef.current;
    var nm = dragPartialStitchesRef.current;
    var colorEntry = selectedColorId && cmap ? cmap[selectedColorId] : null;

    // Mirror drawing (audit DRAW-04): each brush cell is also stitched at
    // its mirror images, half stitches turned to match.
    var mirror = state.mirror, ST = window.ShapeTools;
    var mirrorOn = !!(ST && mirror && mirror.on);
    for (var dy = 0; dy < brushSize; dy++) {
      for (var dx = 0; dx < brushSize; dx++) {
        var bx = gx + dx, by = gy + dy;
        if (!mirrorOn) { brushCell(bx, by, action); continue; }
        var pts = ST.mirrorPoints(bx, by, mirror);
        for (var pi = 0; pi < pts.length; pi++) {
          brushCell(pts[pi].x, pts[pi].y, ST.mirrorHalf(action, pts[pi].flipH, pts[pi].flipV));
        }
      }
    }

    function brushCell(x, y, action) {
      if (x < 0 || x >= sW || y < 0 || y >= sH) return;
      var idx = y * sW + x;
      if (dragCellsRef.current.has(idx)) return;
      dragCellsRef.current.add(idx);

      if (action === "paint" && np) {
        // Allow painting over both __empty__ (manually erased) and __skip__
        // (background-removed) cells — users expect the brush to put a
        // stitch back wherever they click, not silently skip it.
        if (!colorEntry) return;
        var selMask = state.selectionMask;
        if (selMask && !selMask[idx]) return;
        if (np[idx].id !== colorEntry.id) {
          dragChangesRef.current.push({ idx: idx, old: Object.assign({}, np[idx]) });
          np[idx] = Object.assign({}, colorEntry);
          if (pcRef.current) {
            var ctx2 = pcRef.current.getContext("2d");
            ctx2.fillStyle = "rgb(" + colorEntry.rgb + ")";
            ctx2.fillRect(G + x * cs, G + y * cs, cs, cs);
            ctx2.strokeStyle = "rgba(0,0,0,0.1)";
            ctx2.lineWidth = 0.5;
            ctx2.strokeRect(G + x * cs, G + y * cs, cs, cs);
          }
        }
      } else if (action === "eraseAll" && np) {
        if (np[idx].id === "__skip__") return;
        var selMaskE = state.selectionMask;
        if (selMaskE && !selMaskE[idx]) return;
        var changed = false;
        if (np[idx].id !== "__empty__") {
          dragChangesRef.current.push({ idx: idx, old: Object.assign({}, np[idx]) });
          np[idx] = { id: "__empty__", rgb: [255, 255, 255] };
          changed = true;
        }
        if (nm.has(idx)) { nm.delete(idx); changed = true; }
        if (changed && pcRef.current) {
          var ctx3 = pcRef.current.getContext("2d");
          ctx3.fillStyle = "#ffffff";
          ctx3.fillRect(G + x * cs, G + y * cs, cs, cs);
          drawCk(ctx3, G + x * cs, G + y * cs, cs);
          ctx3.strokeStyle = "rgba(0,0,0,0.1)";
          ctx3.lineWidth = 0.5;
          ctx3.strokeRect(G + x * cs, G + y * cs, cs, cs);
        }
        // Erase nearby backstitch
        var prevBs = dragBsLinesRef.current;
        if (prevBs && prevBs.length > 0) {
          var closestIdx = -1, minD = Infinity;
          prevBs.forEach(function(ln, i) {
            var A = x - ln.x1, B = y - ln.y1, C = ln.x2 - ln.x1, D = ln.y2 - ln.y1;
            var dot = A * C + B * D, lenSq = C * C + D * D, param = -1;
            if (lenSq !== 0) param = dot / lenSq;
            var xx, yy;
            if (param < 0) { xx = ln.x1; yy = ln.y1; }
            else if (param > 1) { xx = ln.x2; yy = ln.y2; }
            else { xx = ln.x1 + param * C; yy = ln.y1 + param * D; }
            var d = Math.sqrt(Math.pow(x - xx, 2) + Math.pow(y - yy, 2));
            if (d < minD) { minD = d; closestIdx = i; }
          });
          if (minD <= 0.6 && closestIdx >= 0) {
            var nBs = prevBs.slice();
            nBs.splice(closestIdx, 1);
            dragBsLinesRef.current = nBs;
            if (pcRef.current) {
              var ctx4 = pcRef.current.getContext("2d");
              // Full redraw for backstitch erase
              drawPatternOnCanvas(ctx4, 0, 0, sW, sH, cs, G, Object.assign({}, state, {
                pat: dragPatRef.current,
                partialStitches: dragPartialStitchesRef.current,
                bsLines: nBs,
              }));
            }
          }
        }
      } else if (action && (action === "half-fwd" || action === "half-bck") && np) {
        if (np[idx].id === "__skip__") return;
        var selMaskH = state.selectionMask;
        if (selMaskH && !selMaskH[idx]) return;
        var quadsH = action === "half-fwd" ? ["BL", "TR"] : ["TL", "BR"];
        var ce = colorEntry;
        if (!ce) {
          var m = np[idx];
          if (m && m.id !== "__empty__" && cmap) ce = cmap[m.id];
        }
        if (!ce) return;
        var existing = nm.get(idx) || {};
        var newEntry = Object.assign({}, existing);
        var allSameH = quadsH.every(function(q) { return existing[q] && existing[q].id === ce.id; });
        if (allSameH) {
          quadsH.forEach(function(q) { delete newEntry[q]; });
        } else {
          quadsH.forEach(function(q) { newEntry[q] = { id: ce.id, rgb: ce.rgb }; });
        }
        if (!newEntry.TL && !newEntry.TR && !newEntry.BL && !newEntry.BR) nm.delete(idx); else nm.set(idx, newEntry);
      }
    }
  }

  // ─── handlePatClick ──────────────────────────────────────────────────────────
  function doEyedropSample(pat, cmap, sW, sH, partialStitches, gx, gy) {
    if (gx < 0 || gx >= sW || gy < 0 || gy >= sH) return;
    var idx = gy * sW + gx;
    var cell = pat[idx];
    // After a successful pick, switch to the Paint tool (with the just-picked
    // colour) rather than returning to whatever was active before — that's
    // the gesture users expect ("now I want to paint with this").
    function activatePaintWithPick() {
      if (typeof state.setBrushMode === "function") state.setBrushMode("paint");
      state.setActiveTool("paint");
      if (typeof state.setPartialStitchTool === "function") state.setPartialStitchTool(null);
      if (typeof state.setBsStart === "function") state.setBsStart(null);
      if (state.previousToolRef) state.previousToolRef.current = null;
    }
    if (cell && cell.id !== "__skip__" && cell.id !== "__empty__" && cmap && cmap[cell.id]) {
      state.setSelectedColorId(cell.id);
      activatePaintWithPick();
    } else {
      var ps = partialStitches.get(idx);
      if (ps) {
        var qKeys = ["TL", "TR", "BL", "BR"];
        for (var qi = 0; qi < qKeys.length; qi++) {
          var qe = ps[qKeys[qi]];
          if (qe && cmap[qe.id]) {
            state.setSelectedColorId(qe.id);
            activatePaintWithPick();
            return;
          }
        }
      }
      state.setEyedropperEmpty(true);
      if (state.addToast) state.addToast("That cell is empty \u2014 no colour to sample.", {type:"warning", duration:1500});
      setTimeout(function() { state.setEyedropperEmpty(false); }, 1200);
    }
  }

  function handlePatClick(e) {
    var pat = state.pat, cmap = state.cmap, sW = state.sW, sH = state.sH;
    var cs = state.cs, G = state.G, pcRef = state.pcRef;
    var activeTool = getActiveTool();
    var partialStitchTool = getPartialStitchTool();
    var selectedColorId = state.selectedColorId, bsLines = state.bsLines;
    var bsStart = state.bsStart, bsContinuous = state.bsContinuous;
    var partialStitches = state.partialStitches, brushMode = state.brushMode;
    var EDIT_HISTORY_MAX = state.EDIT_HISTORY_MAX;
    var buildPaletteWithScratch = state.buildPaletteWithScratch;

    if (!pcRef.current || !pat) return;
    var gc = gridCoord(pcRef, e, cs, G, activeTool === "backstitch");
    if (!gc) return;
    var gx = gc.gx, gy = gc.gy;

    // Cleanup tool click (click sub-tool only; brush drag handled in mousedown/move/up)
    if (activeTool === "cleanup") {
      var _ch = state.cleanupHandlersRef && state.cleanupHandlersRef.current;
      if (_ch && state.cleanupSelTool === "click") _ch.handleCleanupClick(gx, gy);
      return;
    }

    // Denoise tool: click selects nothing directly (auto sub-tool has no per-cell click action).
    if (activeTool === "denoise") return;

    // Temporary eyedropper: Alt+click samples colour without switching tool
    if (e.altKey && activeTool !== "magicWand" && activeTool !== "lasso") {
      doEyedropSample(pat, cmap, sW, sH, partialStitches, gx, gy);
      return;
    }

    if (activeTool === "lasso") {
      if (gx < 0 || gx >= sW || gy < 0 || gy >= sH) return;
      var opModeL = (e.shiftKey && e.altKey) ? "intersect"
        : e.shiftKey ? "add"
        : e.altKey ? "subtract"
        : (state.lassoOpMode || state.wandOpMode || "replace");

      if (state.lassoMode === "polygon" || state.lassoMode === "magnetic") {
        // Close/finalise if user clicks near the start anchor after at least 3 points
        if (state.isNearStart && state.isNearStart(gx, gy) && state.lassoPoints && state.lassoPoints.length >= 3) {
          state.finalizeLasso(opModeL);
        } else {
          state.startLasso(gx, gy, opModeL);
        }
      }
      return;
    }

    if (activeTool === "magicWand") {
      if (gx < 0 || gx >= sW || gy < 0 || gy >= sH) return;
      var opMode = (e.shiftKey && e.altKey) ? "intersect"
        : e.shiftKey ? "add"
        : e.altKey ? "subtract"
        : state.wandOpMode;
      state.applyWandSelect(gx, gy, opMode);
      return;
    }

    if (activeTool === "eyedropper") {
      doEyedropSample(pat, cmap, sW, sH, partialStitches, gx, gy);
      return;
    }

    if (activeTool === "colourReplace") {
      if (gx < 0 || gx >= sW || gy < 0 || gy >= sH) return;
      var idx0 = gy * sW + gx;
      var cell0 = pat[idx0];
      if (cell0 && cell0.id !== '__skip__' && cell0.id !== '__empty__' && cmap && cmap[cell0.id]) {
        var entry0 = cmap[cell0.id];
        state.setColourReplaceModal({ srcId: cell0.id, srcName: entry0.name || cell0.id, srcRgb: entry0.rgb || cell0.rgb });
      } else if (state.addToast) {
        // Without this, clicking an unstitched cell silently does nothing.
        state.addToast("That cell has no stitch \u2014 click a stitched cell to choose the colour to replace.", { type: "info", duration: 2500 });
      }
      return;
    }

    if (partialStitchTool) {
      if (gx < 0 || gx >= sW || gy < 0 || gy >= sH) return;
      var nm1 = new Map(partialStitches);
      var ce1 = selectedColorId && cmap ? cmap[selectedColorId] : null;
      if (!ce1) { var m1 = pat[gy * sW + gx]; if (m1 && m1.id !== "__skip__" && m1.id !== "__empty__" && cmap) ce1 = cmap[m1.id]; }
      if (!ce1) return;
      // The quadrant under the pointer, for the quarter tools.
      var hitQ = null;
      if (partialStitchTool === "quarter" || partialStitchTool === "three-quarter") {
        var rect1 = pcRef.current.getBoundingClientRect();
        var scaleX1 = pcRef.current.width / (pcRef.current.clientWidth || 1);
        var scaleY1 = pcRef.current.height / (pcRef.current.clientHeight || 1);
        var localX1 = (e.clientX - rect1.left) * scaleX1 - G - gx * cs;
        var localY1 = (e.clientY - rect1.top) * scaleY1 - G - gy * cs;
        hitQ = hitTestQuadrant(localX1, localY1, cs);
      }
      // With mirror drawing on, the same part stitch goes at each mirror
      // image, turned to match (audit DRAW-04).
      var psPts = (window.ShapeTools && state.mirror && state.mirror.on)
        ? window.ShapeTools.mirrorPoints(gx, gy, state.mirror) : [{ x: gx, y: gy, flipH: false, flipV: false }];
      var tapped = [];
      psPts.forEach(function(pt) {
        if (pt.x < 0 || pt.x >= sW || pt.y < 0 || pt.y >= sH) return;
        var tool = window.ShapeTools ? window.ShapeTools.mirrorHalf(partialStitchTool, pt.flipH, pt.flipV) : partialStitchTool;
        var q = hitQ && window.ShapeTools ? window.ShapeTools.mirrorQuadrant(hitQ, pt.flipH, pt.flipV) : hitQ;
        var at = pt.y * sW + pt.x;
        if (tapped.indexOf(at) === -1) tapped.push(at);
        placePartial(at, tool, q);
      });
      // One undo step for the tap and its mirror images.
      var psChangesTap = [];
      tapped.forEach(function(at) {
        var ov = partialStitches.get(at), nv = nm1.get(at);
        if (ov !== nv) psChangesTap.push({ idx: at, old: ov ? Object.assign({}, ov) : null });
      });
      state.setPartialStitches(nm1);
      if (psChangesTap.length) {
        state.setEditHistory(function(prev) {
          var n = prev.concat([{ type: partialStitchTool, changes: [], psChanges: psChangesTap }]);
          if (n.length > EDIT_HISTORY_MAX) n = n.slice(n.length - EDIT_HISTORY_MAX);
          return n;
        });
        state.setRedoHistory([]);
      }
      return;
    }

    function placePartial(idx1, partialStitchTool, hitQ) {
      var ex1 = nm1.get(idx1) || {};
      var upd1 = Object.assign({}, ex1);
      if (partialStitchTool === "half-fwd" || partialStitchTool === "half-bck") {
        var quads1 = partialStitchTool === "half-fwd" ? ["BL", "TR"] : ["TL", "BR"];
        var allSame1 = quads1.every(function(q) { return ex1[q] && ex1[q].id === ce1.id; });
        if (allSame1) { quads1.forEach(function(q) { delete upd1[q]; }); }
        else { quads1.forEach(function(q) { upd1[q] = { id: ce1.id, rgb: ce1.rgb }; }); }
      } else {
        // quarter or three-quarter, at the quadrant hit-tested above
        if (partialStitchTool === "quarter") {
          if (upd1[hitQ] && upd1[hitQ].id === ce1.id) delete upd1[hitQ];
          else upd1[hitQ] = { id: ce1.id, rgb: ce1.rgb };
        } else { // three-quarter
          var oppositeQ = { "TL": "BR", "TR": "BL", "BL": "TR", "BR": "TL" }[hitQ];
          var threeQ = ["TL", "TR", "BL", "BR"].filter(function(q) { return q !== oppositeQ; });
          var allSame3 = threeQ.every(function(q) { return ex1[q] && ex1[q].id === ce1.id; });
          if (allSame3) { threeQ.forEach(function(q) { delete upd1[q]; }); }
          else { threeQ.forEach(function(q) { upd1[q] = { id: ce1.id, rgb: ce1.rgb }; }); }
        }
      }
      if (!upd1.TL && !upd1.TR && !upd1.BL && !upd1.BR) nm1.delete(idx1); else nm1.set(idx1, upd1);
    }

    if ((activeTool === "paint" || activeTool === "fill") && selectedColorId && cmap) {
      if (gx < 0 || gx >= sW || gy < 0 || gy >= sH) return;
      var idx2 = gy * sW + gx;
      // Both __skip__ (background-removed) and __empty__ (manually erased)
      // cells are paintable \u2014 the user expects to put a stitch back there.
      var pe = cmap[selectedColorId]; if (!pe) return;
      var np2 = pat.slice();
      if (activeTool === "fill") {
        // With mirror drawing on, the same fill runs from each mirror image
        // of the clicked cell, all in one undo step (audit DRAW-04).
        var ch = [], vis = new Set();
        var selMask2 = state.selectionMask;
        var fillSeeds = (window.ShapeTools && state.mirror && state.mirror.on)
          ? window.ShapeTools.mirrorPoints(gx, gy, state.mirror) : [{ x: gx, y: gy }];
        fillSeeds.forEach(function(sd) {
          if (sd.x < 0 || sd.x >= sW || sd.y < 0 || sd.y >= sH) return;
          var seed = sd.y * sW + sd.x, tid = pat[seed].id;
          if (tid === pe.id || vis.has(seed)) return;
          var q = [seed];
          while (q.length) {
            var id2 = q.pop();
            if (vis.has(id2)) continue;
            if (selMask2 && !selMask2[id2]) continue;
            if (pat[id2].id !== tid) continue;
            vis.add(id2);
            ch.push({ idx: id2, old: Object.assign({}, pat[id2]) });
            var x2 = id2 % sW, y2 = Math.floor(id2 / sW);
            if (x2 > 0) q.push(id2 - 1);
            if (x2 < sW - 1) q.push(id2 + 1);
            if (y2 > 0) q.push(id2 - sW);
            if (y2 < sH - 1) q.push(id2 + sW);
          }
        });
        if (!ch.length) return;
        state.setEditHistory(function(prev) {
          var n = prev.concat([{ type: "fill", changes: ch }]);
          if (n.length > EDIT_HISTORY_MAX) n = n.slice(n.length - EDIT_HISTORY_MAX);
          return n;
        });
        state.setRedoHistory([]);
        ch.forEach(function(c2) { np2[c2.idx] = Object.assign({}, pe); });
      } else {
        return; // paint handled by mousedown drag
      }
      state.setPat(np2);
      var r2 = rebuildPreservingZeros(np2); state.setPal(r2.pal); state.setCmap(r2.cmap);
      return;
    }

    if (activeTool === "backstitch") {
      if (gx < 0 || gx > sW || gy < 0 || gy > sH) return;
      var pt = { x: gx, y: gy };
      if (!bsStart) { state.setBsStart(pt); }
      else {
        var prevBsForHistory = bsLines.slice();
        state.setBsLines(function(prev) { return prev.concat([{ x1: bsStart.x, y1: bsStart.y, x2: pt.x, y2: pt.y }]); });
        state.setEditHistory(function(prev) {
          var n = prev.concat([{ type: "backstitch", changes: [], bsLines: prevBsForHistory }]);
          if (n.length > EDIT_HISTORY_MAX) n = n.slice(n.length - EDIT_HISTORY_MAX);
          return n;
        });
        state.setRedoHistory([]);
        state.setBsStart(bsContinuous ? pt : null);
      }
    }

    if (activeTool === "eraseBs") {
      if (bsLines.length === 0) return;
      var mci = -1, mmd = Infinity;
      bsLines.forEach(function(ln, i) {
        var A = gx - ln.x1, B = gy - ln.y1, C = ln.x2 - ln.x1, D = ln.y2 - ln.y1;
        var dot = A * C + B * D, lenSq = C * C + D * D, param = -1;
        if (lenSq !== 0) param = dot / lenSq;
        var xx, yy;
        if (param < 0) { xx = ln.x1; yy = ln.y1; }
        else if (param > 1) { xx = ln.x2; yy = ln.y2; }
        else { xx = ln.x1 + param * C; yy = ln.y1 + param * D; }
        var dx = gx - xx, dy = gy - yy, d = Math.sqrt(dx * dx + dy * dy);
        if (d < mmd) { mmd = d; mci = i; }
      });
      if (mmd <= 0.7 && mci >= 0) {
        var prevBsForErase = bsLines.slice();
        var nBs2 = bsLines.slice(); nBs2.splice(mci, 1);
        state.setBsLines(nBs2);
        state.setEditHistory(function(prev) {
          var n = prev.concat([{ type: "eraseBs", changes: [], bsLines: prevBsForErase }]);
          if (n.length > EDIT_HISTORY_MAX) n = n.slice(n.length - EDIT_HISTORY_MAX);
          return n;
        });
        state.setRedoHistory([]);
      }
    }
  }

  // ─── Mouse event handlers ────────────────────────────────────────────────────
  function handlePatMouseDown(e) {
    if (!isPrimaryButton(e)) return;
    var pat = state.pat, pcRef = state.pcRef, cs = state.cs, G = state.G;
    var activeTool = getActiveTool();
    var partialStitchTool = getPartialStitchTool();
    var selectedColorId = state.selectedColorId, cmap = state.cmap;
    if (!pcRef.current || !pat) return;

    // Temporary eyedropper: Alt+click samples colour without switching tool
    if (e.altKey && activeTool !== "magicWand" && activeTool !== "lasso") {
      var gc0 = gridCoord(pcRef, e, cs, G, false);
      if (gc0) doEyedropSample(pat, cmap, state.sW, state.sH, state.partialStitches, gc0.gx, gc0.gy);
      return;
    }

    if (!activeTool && !partialStitchTool) return;
    var gc = gridCoord(pcRef, e, cs, G, activeTool === "backstitch");
    if (!gc) return;
    var gx = gc.gx, gy = gc.gy;

    // Cleanup brush drag — pointer down starts the drag-paint
    if (activeTool === "cleanup" && state.cleanupSelTool === "brush") {
      var _chdp = state.cleanupHandlersRef && state.cleanupHandlersRef.current;
      if (_chdp) { _chdp.handleCleanupPointerDown(gx, gy); }
      return;
    }

    // Denoise brush drag — pointer down
    if (activeTool === "denoise" && state.denoiseSelTool === "brush") {
      var _dndp = state.denoiseHandlersRef && state.denoiseHandlersRef.current;
      if (_dndp) { _dndp.handleDenoisePointerDown(gx, gy); }
      return;
    }

    // A floating paste / flip / rotate: drag it from inside, place it by
    // pressing outside (audit DRAW-04).
    if (activeTool === "float") {
      var clipF = state.clip;
      if (!clipF) return;
      if (clipF.isInside(gx, gy)) clipF.startDrag(gx, gy);
      else clipF.commit();
      return;
    }

    if (activeTool === "move") {
      if (gx < 0 || gx >= state.sW || gy < 0 || gy >= state.sH) return;
      var selMaskM = state.selectionMask;
      if (selMaskM && selMaskM[gy * state.sW + gx]) state.startMove(gx, gy);
      return;
    }

    if (activeTool === "lasso") {
      if (gx < 0 || gx >= state.sW || gy < 0 || gy >= state.sH) return;
      var opModeL = (e.shiftKey && e.altKey) ? "intersect"
        : e.shiftKey ? "add"
        : e.altKey ? "subtract"
        : (state.lassoOpMode || state.wandOpMode || "replace");
      if (state.lassoMode === "freehand") {
        state.startLasso(gx, gy, opModeL);
      } else {
        handlePatClick(e);
      }
      return;
    }

    if (activeTool === "eyedropper" || activeTool === "fill" || activeTool === "backstitch" || activeTool === "eraseBs" || activeTool === "magicWand" || activeTool === "colourReplace") {
      handlePatClick(e);
      return;
    }

    // quarter/three-quarter tools require hit-testing — delegate to handlePatClick (no drag)
    if (partialStitchTool === "quarter" || partialStitchTool === "three-quarter") {
      handlePatClick(e);
      return;
    }

    // French knot (audit DRAW-04): a tap puts a knot on the nearest grid
    // corner or stitch centre, or removes the knot already there. With mirror
    // drawing on, the mirror images change with it. One undo step.
    if (activeTool === "knot") {
      if (!window.Knots || typeof state.setKnots !== "function") return;
      var kW = state.sW, kH = state.sH, kMax = state.EDIT_HISTORY_MAX;
      var kRect = pcRef.current.getBoundingClientRect();
      var kfx = ((e.clientX - kRect.left) * (pcRef.current.width / (pcRef.current.clientWidth || 1)) - G) / cs;
      var kfy = ((e.clientY - kRect.top) * (pcRef.current.height / (pcRef.current.clientHeight || 1)) - G) / cs;
      if (kfx < -0.5 || kfy < -0.5 || kfx > kW + 0.5 || kfy > kH + 0.5) return;
      var kp = window.Knots.snap(kfx, kfy, kW, kH);
      var oldKnots = state.knots || [];
      var removing = window.Knots.find(oldKnots, kp.x, kp.y) !== -1;
      var kThread = selectedColorId && cmap ? cmap[selectedColorId] : null;
      if (!removing && !kThread) {
        if (state.addToast) state.addToast("Choose a colour first.", { type: "info", duration: 2000 });
        return;
      }
      var newKnots = oldKnots;
      window.Knots.mirrorKnot(kp.x, kp.y, state.mirror).forEach(function (pt) {
        if (pt.x < 0 || pt.y < 0 || pt.x > 2 * kW || pt.y > 2 * kH) return;
        var there = window.Knots.find(newKnots, pt.x, pt.y) !== -1;
        if (there === removing) newKnots = window.Knots.toggle(newKnots, pt.x, pt.y, kThread || {}).knots;
      });
      if (newKnots === oldKnots) return;
      state.setKnots(newKnots);
      state.setEditHistory(function (prev) {
        var n = prev.concat([{ type: "knot", changes: [], knots: oldKnots.slice() }]);
        if (n.length > kMax) n = n.slice(n.length - kMax);
        return n;
      });
      state.setRedoHistory([]);
      return;
    }

    // Text tool (audit DRAW-04): a tap opens the text sheet with the text's
    // top-left corner at that stitch.
    if (activeTool === "text") {
      if (typeof state.setTextSheet === "function") {
        state.setTextSheet({ x: Math.max(0, Math.min(state.sW - 1, gx)), y: Math.max(0, Math.min(state.sH - 1, gy)) });
      }
      return;
    }

    if (isShapeTool(activeTool)) {
      if (!selectedColorId || !cmap || !cmap[selectedColorId]) {
        if (state.addToast) state.addToast("Choose a colour first.", { type: "info", duration: 2000 });
        return;
      }
      shapeRef.current = { tool: activeTool, x0: gx, y0: gy, x1: gx, y1: gy };
      notifyOverlay();
      return;
    }

    isDraggingRef.current = true;
    lastDragCellRef.current = { gx: gx, gy: gy };
    dragChangesRef.current = [];
    dragCellsRef.current.clear();
    dragPatRef.current = pat.slice();
    dragPartialStitchesRef.current = new Map(state.partialStitches);
    dragBsLinesRef.current = state.bsLines;

    if (activeTool === "paint" && selectedColorId && cmap) {
      dragActionRef.current = "paint";
      applyBrush(gx, gy, "paint");
    } else if (activeTool === "eraseAll") {
      dragActionRef.current = "eraseAll";
      applyBrush(gx, gy, "eraseAll");
    } else if (partialStitchTool) {
      dragActionRef.current = partialStitchTool;
      applyBrush(gx, gy, dragActionRef.current);
    }
  }

  function handlePatMouseMove(e) {
    var pat = state.pat, pcRef = state.pcRef, cs = state.cs, G = state.G;
    var activeTool = getActiveTool();
    var partialStitchTool = getPartialStitchTool();
    if (!pcRef.current || !pat || (!activeTool && !partialStitchTool)) return;
    var gc = gridCoord(pcRef, e, cs, G, activeTool === "backstitch" || activeTool === "eraseBs");
    if (!gc) return;
    var hc = state.hoverCoords;
    if (!hc || hc.gx !== gc.gx || hc.gy !== gc.gy) state.setHoverCoords(gc);

    // Cleanup brush drag move
    if (activeTool === "cleanup" && state.cleanupSelTool === "brush") {
      var _chm = state.cleanupHandlersRef && state.cleanupHandlersRef.current;
      if (_chm) _chm.handleCleanupPointerMove(gc.gx, gc.gy);
      return;
    }

    // Denoise brush drag move
    if (activeTool === "denoise" && state.denoiseSelTool === "brush") {
      var _dndm = state.denoiseHandlersRef && state.denoiseHandlersRef.current;
      if (_dndm) _dndm.handleDenoisePointerMove(gc.gx, gc.gy);
      return;
    }

    if (activeTool === "move") {
      if (state.moveActive) state.updateMove(gc.gx, gc.gy);
      return;
    }
    if (activeTool === "float") {
      if (state.clip && state.clip.isDragging()) state.clip.updateDrag(gc.gx, gc.gy);
      return;
    }
    if (shapeRef.current) {
      var shm = shapeRef.current;
      if (shm.x1 !== gc.gx || shm.y1 !== gc.gy) { shm.x1 = gc.gx; shm.y1 = gc.gy; notifyOverlay(); }
      return;
    }

    if (activeTool === "lasso") {
      if (gc.gx >= 0 && gc.gx < state.sW && gc.gy >= 0 && gc.gy < state.sH) {
        state.setLassoCursor({ x: gc.gx, y: gc.gy });
        if (state.lassoMode === "freehand" && state.lassoActive) state.extendLasso(gc.gx, gc.gy);
      }
      return;
    }
    if (isDraggingRef.current) {
      // Fill the gap since the last sample so a fast stroke stays continuous.
      // Same drag session, so the whole stroke is still one undo step.
      var last = lastDragCellRef.current;
      if (last && (last.gx !== gc.gx || last.gy !== gc.gy)) {
        lineCells(last.gx, last.gy, gc.gx, gc.gy).forEach(function(c) {
          applyBrush(c.x, c.y, dragActionRef.current);
        });
      } else {
        applyBrush(gc.gx, gc.gy, dragActionRef.current);
      }
      lastDragCellRef.current = { gx: gc.gx, gy: gc.gy };
    }
  }

  function handlePatMouseUp(e) {
    // Cleanup brush drag end
    if (getActiveTool() === "cleanup" && state.cleanupSelTool === "brush") {
      var _chup = state.cleanupHandlersRef && state.cleanupHandlersRef.current;
      if (_chup) _chup.handleCleanupPointerUp();
      return;
    }
    // Denoise brush drag end
    if (getActiveTool() === "denoise" && state.denoiseSelTool === "brush") {
      var _dnup = state.denoiseHandlersRef && state.denoiseHandlersRef.current;
      if (_dnup) _dnup.handleDenoisePointerUp();
      return;
    }
    if (getActiveTool() === "move") {
      if (state.moveActive) state.commitMove();
      return;
    }
    if (getActiveTool() === "float") {
      if (state.clip) state.clip.endDrag();
      return;
    }
    if (shapeRef.current) {
      // Stitch the shape through the brush (so brush size and mirror
      // drawing apply), then commit it below as one undo step.
      var sh = shapeRef.current, prev = shapePreview();
      shapeRef.current = null;
      if (!state.pat || !prev) { notifyOverlay(); return; }
      isDraggingRef.current = true;
      lastDragCellRef.current = null;
      dragChangesRef.current = [];
      dragCellsRef.current.clear();
      dragPatRef.current = state.pat.slice();
      dragPartialStitchesRef.current = new Map(state.partialStitches);
      dragBsLinesRef.current = state.bsLines;
      dragActionRef.current = "paint";
      prev.cells.forEach(function(c) { applyBrush(c.x, c.y, "paint"); });
      dragActionRef.current = sh.tool;
      notifyOverlay();
    }
    if (getActiveTool() === "lasso") {
      if (state.lassoMode === "freehand" && state.lassoActive) state.finalizeLasso();
      return;
    }
    if (!isDraggingRef.current) return;
    isDraggingRef.current = false;
    lastDragCellRef.current = null;

    var pat = state.pat, partialStitches = state.partialStitches, bsLines = state.bsLines;
    var EDIT_HISTORY_MAX = state.EDIT_HISTORY_MAX;
    var buildPaletteWithScratch = state.buildPaletteWithScratch;

    var madeChanges = dragChangesRef.current.length > 0;
    var oldPs = partialStitches, newPs = dragPartialStitchesRef.current;
    var psChanged = false;
    if (dragActionRef.current === "eraseAll" || dragActionRef.current === "half-fwd" || dragActionRef.current === "half-bck") {
      if (oldPs.size !== newPs.size) psChanged = true;
      else {
        oldPs.forEach(function(v, k) { if (!newPs.has(k) || newPs.get(k) !== v) psChanged = true; });
      }
    }
    var psChanges = [];
    if (psChanged) {
      var allKeys = new Set([].concat(Array.from(oldPs.keys()), Array.from(newPs.keys())));
      allKeys.forEach(function(k) {
        var ov = oldPs.get(k), nv = newPs.get(k);
        if (ov !== nv) psChanges.push({ idx: k, old: ov ? Object.assign({}, ov) : null });
      });
    }
    var bsLinesChanged = dragBsLinesRef.current !== bsLines;

    if (madeChanges || psChanged || bsLinesChanged) {
      if (madeChanges) state.setPat(dragPatRef.current);
      if (psChanged) state.setPartialStitches(newPs);
      if (bsLinesChanged) state.setBsLines(dragBsLinesRef.current);
      var changes = dragChangesRef.current.slice();
      state.setEditHistory(function(prev) {
        var n = prev.concat([{
          type: dragActionRef.current,
          changes: changes,
          psChanges: psChanges.length > 0 ? psChanges : undefined,
          bsLines: bsLinesChanged ? bsLines : undefined,
        }]);
        if (n.length > EDIT_HISTORY_MAX) n = n.slice(n.length - EDIT_HISTORY_MAX);
        return n;
      });
      state.setRedoHistory([]);
      if (madeChanges) {
        var r = rebuildPreservingZeros(dragPatRef.current);
        state.setPal(r.pal); state.setCmap(r.cmap);
      }
    }
    dragPatRef.current = null;
    dragPartialStitchesRef.current = null;
    dragBsLinesRef.current = null;
    dragActionRef.current = null;
    dragCellsRef.current.clear();
  }

  function handlePatMouseLeave(e) {
    state.setHoverCoords(null);
    if (getActiveTool() === "lasso" && state.lassoMode === "freehand" && state.lassoActive) {
      state.finalizeLasso();
      return;
    }
    handlePatMouseUp(e);
  }

  // ─── Pointer event handlers ─────────────────────────────────────────────────
  function handlePatPointerDown(e) {
    var activeTool = state.activeTool, partialStitchTool = state.partialStitchTool;
    var scrollRef = state.scrollRef;
    if (e.pointerType === "mouse" && !isPrimaryButton(e)) return;

    activePointersRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (e.target && e.target.setPointerCapture) {
      try { e.target.setPointerCapture(e.pointerId); } catch (_) {}
    }

    if (activePointersRef.current.size === 2) {
      if (isDraggingRef.current) cancelDragSession();
      cancelShape();
      cancelTouchDraw();
      clearNavTap();
      clearPendingTap();
      panStateRef.current = null;
      state.setHoverCoords(null);
      startPinchGesture();
      e.preventDefault();
      return;
    }
    if (activePointersRef.current.size > 2) {
      e.preventDefault();
      return;
    }

    if ((isTouchPointer(e) || isPanTool() || isNavigate()) && (isPanTool() || isNavigate() || (!activeTool && !partialStitchTool)) && scrollRef.current) {
      panStateRef.current = {
        pointerId: e.pointerId,
        moved: false,
        startX: e.clientX,
        startY: e.clientY,
        scrollLeft: scrollRef.current.scrollLeft,
        scrollTop: scrollRef.current.scrollTop,
      };
      state.setHoverCoords(null);
      // Long-press = touch equivalent of right-click context menu.
      // Skip the long-press recogniser when the explicit Hand tool is
      // active — the user picked Hand to pan, not to summon a menu.
      longPressTriggeredRef.current = false;
      clearLongPressTimer();
      if (isTouchPointer(e) && !isPanTool()
          && typeof state.setContextMenu === "function" && state.pat && state.pcRef && state.pcRef.current) {
        var pressClientX = e.clientX, pressClientY = e.clientY;
        var pressEvtLike = { clientX: pressClientX, clientY: pressClientY };
        longPressTimerRef.current = setTimeout(function() {
          // Only fire if user hasn't started panning
          if (!panStateRef.current) return;
          // If panState is still at its origin scroll, treat as no-move
          if (panStateRef.current.startX !== pressClientX || panStateRef.current.startY !== pressClientY) return;
          var gc = gridCoord(state.pcRef, pressEvtLike, state.cs, state.G, false);
          if (!gc || gc.gx < 0 || gc.gx >= state.sW || gc.gy < 0 || gc.gy >= state.sH) return;
          var idx = gc.gy * state.sW + gc.gx;
          var cell = state.pat[idx];
          longPressTriggeredRef.current = true;
          panStateRef.current = null;
          state.setContextMenu({ x: pressClientX, y: pressClientY, gx: gc.gx, gy: gc.gy, idx: idx, cell: cell });
          longPressTimerRef.current = null;
        }, LONG_PRESS_MS);
      }
      e.preventDefault();
      return;
    }

    var tdKind = isTouchPointer(e) ? touchDrawKind() : null;
    if (tdKind && state.pat && state.pcRef && state.pcRef.current) {
      var tdPrecision = precisionOn();
      touchDrawRef.current = {
        pointerId: e.pointerId,
        startX: e.clientX, startY: e.clientY,
        x: e.clientX, y: e.clientY,
        precision: tdPrecision,
        canStroke: tdKind === "stroke" && !tdPrecision,
        promoted: false,
      };
      showTouchTarget(e.clientX, e.clientY, tdPrecision, false);
      e.preventDefault();
      return;
    }

    if (isTouchPointer(e) && activeTool === "backstitch") {
      showTouchTarget(e.clientX, e.clientY, precisionOn(), true);
      pendingTapRef.current = {
        pointerId: e.pointerId,
        startX: e.clientX,
        startY: e.clientY,
        moved: false,
      };
      longPressTriggeredRef.current = false;
      clearLongPressTimer();
      if (state.bsStart) {
        longPressTimerRef.current = setTimeout(function() {
          state.setBsStart(null);
          state.setHoverCoords(null);
          longPressTriggeredRef.current = true;
          pendingTapRef.current = null;
          longPressTimerRef.current = null;
        }, LONG_PRESS_MS);
      }
      e.preventDefault();
      return;
    }

    if (isPanTool() || isNavigate()) return;
    if (!activeTool && !partialStitchTool) return;
    e.preventDefault();
    handlePatMouseDown(e);
  }

  function handlePatPointerMove(e) {
    if (activePointersRef.current.has(e.pointerId)) {
      activePointersRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    }

    if (activePointersRef.current.size === 2 && pinchStateRef.current) {
      clearPendingTap();
      panStateRef.current = null;
      state.setHoverCoords(null);
      e.preventDefault();
      updatePinchGesture();
      return;
    }

    if (panStateRef.current && panStateRef.current.pointerId === e.pointerId && state.scrollRef.current) {
      var dx = e.clientX - panStateRef.current.startX;
      var dy = e.clientY - panStateRef.current.startY;
      if (Math.hypot(dx, dy) > TOUCH_TAP_SLOP) { clearLongPressTimer(); clearNavTap(); panStateRef.current.moved = true; }
      state.scrollRef.current.scrollLeft = panStateRef.current.scrollLeft - dx;
      state.scrollRef.current.scrollTop = panStateRef.current.scrollTop - dy;
      state.setHoverCoords(null);
      e.preventDefault();
      return;
    }

    var td = touchDrawRef.current;
    if (td && td.pointerId === e.pointerId) {
      td.x = e.clientX; td.y = e.clientY;
      if (!td.promoted && window.touchDrawOutcome &&
          window.touchDrawOutcome({ x: td.startX, y: td.startY }, { x: td.x, y: td.y }, TOUCH_TAP_SLOP, td.canStroke) === "stroke") {
        // A stroke: start it where the finger went down, as a mouse would.
        td.promoted = true;
        handlePatMouseDown(pointEvent(td.startX, td.startY));
      }
      if (td.promoted) handlePatMouseMove(e);
      showTouchTarget(td.x, td.y, td.precision, false);
      e.preventDefault();
      return;
    }

    if (pendingTapRef.current && pendingTapRef.current.pointerId === e.pointerId) {
      var moved = Math.hypot(e.clientX - pendingTapRef.current.startX, e.clientY - pendingTapRef.current.startY) > TOUCH_TAP_SLOP;
      // With the precision cursor the finger is aiming, not cancelling.
      if (moved) {
        clearLongPressTimer();
        if (!precisionOn()) pendingTapRef.current.moved = true;
      }
      e.preventDefault();
      var bsTarget = showTouchTarget(e.clientX, e.clientY, precisionOn(), true);
      handlePatMouseMove(pointEvent(bsTarget.x, bsTarget.y));
      return;
    }

    if (activePointersRef.current.size > 1 && isTouchPointer(e)) {
      e.preventDefault();
      return;
    }

    if (isTouchPointer(e)) e.preventDefault();
    handlePatMouseMove(e);
  }

  function handlePatPointerUp(e) {
    var hadPinch = !!pinchStateRef.current;
    var wasPendingTap = pendingTapRef.current && pendingTapRef.current.pointerId === e.pointerId ? pendingTapRef.current : null;
    var wasPan = panStateRef.current && panStateRef.current.pointerId === e.pointerId ? panStateRef.current : null;
    var wasTouchDraw = touchDrawRef.current && touchDrawRef.current.pointerId === e.pointerId ? touchDrawRef.current : null;

    activePointersRef.current.delete(e.pointerId);
    if (e.target && e.target.releasePointerCapture) {
      try { e.target.releasePointerCapture(e.pointerId); } catch (_) {}
    }

    if (wasPan) {
      var panTap = !wasPan.moved && !longPressTriggeredRef.current && !hadPinch;
      panStateRef.current = null;
      clearLongPressTimer();
      // A tap in Navigate shows that stitch's thread (the stitch menu), once
      // it is clear it isn't the first half of a double-tap, which zooms.
      if (panTap && isTouchPointer(e) && isNavigate()) {
        var now = Date.now(), prev = navTapRef.current;
        if (prev && now - prev.t <= DOUBLE_TAP_MS && Math.hypot(e.clientX - prev.x, e.clientY - prev.y) <= DOUBLE_TAP_DIST) {
          clearNavTap();
          toggleDoubleTapZoom(e.clientX, e.clientY);
        } else {
          clearNavTap();
          var tapX = e.clientX, tapY = e.clientY;
          navTapRef.current = { t: now, x: tapX, y: tapY };
          navTapTimerRef.current = setTimeout(function() {
            navTapTimerRef.current = null;
            navTapRef.current = null;
            openCellMenuAt(tapX, tapY);
          }, DOUBLE_TAP_MS);
        }
      }
      state.setHoverCoords(null);
      e.preventDefault();
      return;
    }

    if (wasTouchDraw) {
      touchDrawRef.current = null;
      hideTouchTarget();
      if (wasTouchDraw.promoted) {
        handlePatMouseUp(e);
      } else if (!hadPinch) {
        // A tap: one stitch at the last target cell.
        var tgt = window.precisionTarget ? window.precisionTarget(wasTouchDraw.x, wasTouchDraw.y, wasTouchDraw.precision) : { x: wasTouchDraw.x, y: wasTouchDraw.y };
        var tapEv = pointEvent(tgt.x, tgt.y);
        handlePatMouseDown(tapEv);
        handlePatMouseUp(tapEv);
      }
      endPinchIfDone();
      state.setHoverCoords(null);
      e.preventDefault();
      return;
    }

    if (wasPendingTap) {
      clearLongPressTimer();
      hideTouchTarget();
      if (!wasPendingTap.moved && !longPressTriggeredRef.current && !hadPinch) {
        var bsAt = window.precisionTarget ? window.precisionTarget(e.clientX, e.clientY, precisionOn()) : { x: e.clientX, y: e.clientY };
        handlePatClick(bsAt.y === e.clientY ? e : pointEvent(bsAt.x, bsAt.y));
      }
      clearPendingTap();
      state.setHoverCoords(null);
      e.preventDefault();
      return;
    }

    endPinchIfDone();
    if (hadPinch) {
      state.setHoverCoords(null);
      e.preventDefault();
      return;
    }

    if (isTouchPointer(e)) e.preventDefault();
    handlePatMouseUp(e);
    if (activePointersRef.current.size === 0) state.setHoverCoords(null);
  }

  function handlePatPointerLeave(e) {
    if (e.pointerType === "mouse" && !isDraggingRef.current) {
      state.setHoverCoords(null);
    }
  }

  function handlePatPointerCancel(e) {
    cancelShape();
    activePointersRef.current.delete(e.pointerId);
    hideTouchTarget();
    clearNavTap();
    if (touchDrawRef.current && touchDrawRef.current.pointerId === e.pointerId) {
      // A cancelled tap places nothing; a cancelled stroke keeps what it drew.
      var tdc = touchDrawRef.current;
      touchDrawRef.current = null;
      if (!tdc.promoted) {
        endPinchIfDone();
        state.setHoverCoords(null);
        return;
      }
    }
    if (e.target && e.target.releasePointerCapture) {
      try { e.target.releasePointerCapture(e.pointerId); } catch (_) {}
    }
    clearPendingTap();
    panStateRef.current = null;
    endPinchIfDone();
    state.setHoverCoords(null);
    handlePatMouseUp(e);
  }

  // ─── Crop handlers ───────────────────────────────────────────────────────────
  function handleCropMouseDown(e) {
    var cropRef = state.cropRef, cropStartRef = state.cropStartRef, isCropping = state.isCropping;
    if (!isCropping || !cropRef.current) return;
    if (!isPrimaryButton(e)) return;
    e.preventDefault();
    var r = cropRef.current.getBoundingClientRect();
    cropStartRef.current = { x: e.clientX - r.left, y: e.clientY - r.top };
    state.setCropRect({ x: cropStartRef.current.x, y: cropStartRef.current.y, w: 0, h: 0 });
  }

  function handleCropMouseMove(e) {
    var cropRef = state.cropRef, cropStartRef = state.cropStartRef, isCropping = state.isCropping;
    if (!isCropping || !cropStartRef.current || !cropRef.current) return;
    var r = cropRef.current.getBoundingClientRect();
    var cx = Math.max(0, Math.min(r.width, e.clientX - r.left));
    var cy = Math.max(0, Math.min(r.height, e.clientY - r.top));
    var x = Math.min(cropStartRef.current.x, cx), y = Math.min(cropStartRef.current.y, cy);
    var w = Math.abs(cx - cropStartRef.current.x), h = Math.abs(cy - cropStartRef.current.y);
    state.setCropRect({ x: x, y: y, w: w, h: h });
  }

  function handleCropMouseUp(e) {
    if (!state.isCropping || !state.cropStartRef.current) return;
    state.cropStartRef.current = null;
  }

  function handleCropPointerDown(e) {
    if (e.pointerType === "mouse" && !isPrimaryButton(e)) return;
    if (e.target && e.target.setPointerCapture) {
      try { e.target.setPointerCapture(e.pointerId); } catch (_) {}
    }
    handleCropMouseDown(e);
  }

  function handleCropPointerMove(e) {
    if (!state.isCropping || !state.cropStartRef.current) return;
    e.preventDefault();
    handleCropMouseMove(e);
  }

  function handleCropPointerUp(e) {
    if (e.target && e.target.releasePointerCapture) {
      try { e.target.releasePointerCapture(e.pointerId); } catch (_) {}
    }
    handleCropMouseUp(e);
  }

  function handleCropPointerCancel(e) {
    handleCropPointerUp(e);
  }

  function applyCrop() {
    var cropRect = state.cropRect, cropRef = state.cropRef, img = state.img;
    if (!cropRect || cropRect.w < 10 || cropRect.h < 10 || !cropRef.current || !img) {
      state.setIsCropping(false);
      return;
    }
    var r = cropRef.current.getBoundingClientRect();
    var scaleX = img.width / r.width, scaleY = img.height / r.height;
    var cropX = Math.floor(cropRect.x * scaleX), cropY = Math.floor(cropRect.y * scaleY);
    var cropW = Math.floor(cropRect.w * scaleX), cropH = Math.floor(cropRect.h * scaleY);
    var c = document.createElement("canvas"); c.width = cropW; c.height = cropH;
    var cx = c.getContext("2d");
    cx.drawImage(img, cropX, cropY, cropW, cropH, 0, 0, cropW, cropH);
    var newImg = new Image();
    newImg.onload = function() {
      state.setImg(newImg);
      state.setOrigW(newImg.width);
      state.setOrigH(newImg.height);
      var newAr = newImg.width / newImg.height;
      state.setAr(newAr);
      if (state.arLock) state.setSH(Math.max(10, Math.round(state.sW / newAr)));
      state.setIsCropping(false);
      state.setCropRect(null);
      state.setPat(null); state.setPal(null); state.setCmap(null);
      // Annotations authored against the previous coordinate system are no
      // longer meaningful after crop + regenerate; clear them so they aren't
      // rendered at stale positions.
      if (typeof state.setBsLines === "function") state.setBsLines([]);
      if (typeof state.setParkMarkers === "function") state.setParkMarkers([]);
    };
    newImg.src = c.toDataURL();
  }

  function srcClick(e) {
    var img = state.img, pickBg = state.pickBg;
    if (!pickBg || !img) return;
    var r = e.target.getBoundingClientRect();
    var c = document.createElement("canvas"); c.width = img.width; c.height = img.height;
    var cx = c.getContext("2d"); cx.drawImage(img, 0, 0);
    var p = cx.getImageData(
      Math.floor((e.clientX - r.left) * img.width / r.width),
      Math.floor((e.clientY - r.top) * img.height / r.height),
      1, 1
    ).data;
    state.setBgCol([p[0], p[1], p[2]]);
    state.setPickBg(false);
  }

  function autoCrop() {
    var pat = state.pat, img = state.img, sW = state.sW, sH = state.sH;
    if (!pat || !img) return;
    var minX = sW, minY = sH, maxX = -1, maxY = -1, hasStitches = false;
    for (var y = 0; y < sH; y++) {
      for (var x = 0; x < sW; x++) {
        var idx = y * sW + x;
        if (pat[idx].id !== "__skip__") {
          if (x < minX) minX = x; if (x > maxX) maxX = x;
          if (y < minY) minY = y; if (y > maxY) maxY = y;
          hasStitches = true;
        }
      }
    }
    if (!hasStitches || (minX === 0 && minY === 0 && maxX === sW - 1 && maxY === sH - 1)) return;
    var pxStart = Math.floor(minX * (img.width / sW));
    var pyStart = Math.floor(minY * (img.height / sH));
    var pxEnd = Math.ceil((maxX + 1) * (img.width / sW));
    var pyEnd = Math.ceil((maxY + 1) * (img.height / sH));
    var cropW = pxEnd - pxStart, cropH = pyEnd - pyStart;
    if (cropW <= 0 || cropH <= 0) return;
    var c2 = document.createElement("canvas"); c2.width = cropW; c2.height = cropH;
    var cx2 = c2.getContext("2d");
    cx2.drawImage(img, pxStart, pyStart, cropW, cropH, 0, 0, cropW, cropH);
    var newImg2 = new Image();
    newImg2.onload = function() {
      state.setImg(newImg2);
      state.setOrigW(newImg2.width); state.setOrigH(newImg2.height);
      var newAr2 = newImg2.width / newImg2.height;
      state.setAr(newAr2);
      state.setSW(maxX - minX + 1); state.setSH(maxY - minY + 1);
      state.setPat(null); state.setPal(null); state.setCmap(null);
    };
    newImg2.src = c2.toDataURL();
  }

  return {
    shapePreview: shapePreview,
    handlePatClick: handlePatClick,
    handlePatMouseDown: handlePatMouseDown,
    handlePatMouseMove: handlePatMouseMove,
    handlePatMouseUp: handlePatMouseUp,
    handlePatMouseLeave: handlePatMouseLeave,
    handlePatPointerDown: handlePatPointerDown,
    handlePatPointerMove: handlePatPointerMove,
    handlePatPointerUp: handlePatPointerUp,
    handlePatPointerLeave: handlePatPointerLeave,
    handlePatPointerCancel: handlePatPointerCancel,
    handleCropMouseDown: handleCropMouseDown,
    handleCropMouseMove: handleCropMouseMove,
    handleCropMouseUp: handleCropMouseUp,
    handleCropPointerDown: handleCropPointerDown,
    handleCropPointerMove: handleCropPointerMove,
    handleCropPointerUp: handleCropPointerUp,
    handleCropPointerCancel: handleCropPointerCancel,
    applyCrop: applyCrop,
    srcClick: srcClick,
    autoCrop: autoCrop,
    isDraggingRef: isDraggingRef,
  };
};
