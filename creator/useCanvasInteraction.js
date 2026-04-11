/* creator/useCanvasInteraction.js — All canvas mouse handlers, brush application,
   and crop handlers. Extracted from CreatorApp.
   Depends on globals: React, gridCoord, drawCk, drawPatternOnCanvas (for full
   redraws during drag-erase of backstitch). */

window.useCanvasInteraction = function useCanvasInteraction(state, history) {
  // Internal drag refs (not in state — don't need React rendering)
  var isDraggingRef        = React.useRef(false);
  var dragChangesRef       = React.useRef([]);
  var dragCellsRef         = React.useRef(new Set());
  var dragActionRef        = React.useRef(null);
  var dragPatRef           = React.useRef(null);
  var dragHalfStitchesRef  = React.useRef(null);
  var dragBsLinesRef       = React.useRef(null);
  var activePointersRef    = React.useRef(new Map());
  var pinchStateRef        = React.useRef(null);
  var panStateRef          = React.useRef(null);
  var pendingTapRef        = React.useRef(null);
  var longPressTimerRef    = React.useRef(null);
  var longPressTriggeredRef = React.useRef(false);

  var TOUCH_TAP_SLOP = 10;
  var LONG_PRESS_MS = 500;

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

  function redrawCanvasFromState(patOverride, halfStitchesOverride, bsLinesOverride) {
    var pcRef = state.pcRef;
    if (!pcRef.current || !state.pat) return;
    var ctx2 = pcRef.current.getContext("2d");
    drawPatternOnCanvas(ctx2, 0, 0, state.sW, state.sH, state.cs, state.G, Object.assign({}, state, {
      pat: patOverride || state.pat,
      halfStitches: halfStitchesOverride || state.halfStitches,
      bsLines: bsLinesOverride || state.bsLines,
    }));
  }

  function cancelDragSession() {
    if (!isDraggingRef.current) return;
    isDraggingRef.current = false;
    dragChangesRef.current = [];
    dragCellsRef.current.clear();
    dragActionRef.current = null;
    dragPatRef.current = null;
    dragHalfStitchesRef.current = null;
    dragBsLinesRef.current = null;
    redrawCanvasFromState();
  }

  function startPinchGesture() {
    var scrollRef = state.scrollRef, pcRef = state.pcRef;
    if (!scrollRef.current || !pcRef.current || activePointersRef.current.size !== 2) return;
    var pts = Array.from(activePointersRef.current.values());
    var midX = (pts[0].x + pts[1].x) / 2;
    var midY = (pts[0].y + pts[1].y) / 2;
    var rect = pcRef.current.getBoundingClientRect();
    pinchStateRef.current = {
      startDist: Math.hypot(pts[1].x - pts[0].x, pts[1].y - pts[0].y),
      startZoom: state.zoom,
      lastAppliedZoom: state.zoom,
      focalX: scrollRef.current.scrollLeft + (midX - rect.left),
      focalY: scrollRef.current.scrollTop + (midY - rect.top),
    };
  }

  function updatePinchGesture() {
    var pinch = pinchStateRef.current;
    var scrollRef = state.scrollRef, pcRef = state.pcRef;
    if (!pinch || !scrollRef.current || !pcRef.current || activePointersRef.current.size !== 2) return;
    var pts = Array.from(activePointersRef.current.values());
    var midX = (pts[0].x + pts[1].x) / 2;
    var midY = (pts[0].y + pts[1].y) / 2;
    var dist = Math.hypot(pts[1].x - pts[0].x, pts[1].y - pts[0].y);
    if (!dist || !pinch.startDist) return;
    var nextZoom = Math.max(0.05, Math.min(3, Math.round((pinch.startZoom * (dist / pinch.startDist)) * 100) / 100));
    if (nextZoom === pinch.lastAppliedZoom) return;
    pinch.lastAppliedZoom = nextZoom;
    state.setZoom(nextZoom);
    requestAnimationFrame(function() {
      if (!scrollRef.current || !pcRef.current) return;
      var rect = pcRef.current.getBoundingClientRect();
      var ratio = nextZoom / pinch.startZoom;
      var offsetX = midX - rect.left;
      var offsetY = midY - rect.top;
      scrollRef.current.scrollLeft = Math.max(0, pinch.focalX * ratio - offsetX);
      scrollRef.current.scrollTop = Math.max(0, pinch.focalY * ratio - offsetY);
    });
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
    var nm = dragHalfStitchesRef.current;
    var colorEntry = selectedColorId && cmap ? cmap[selectedColorId] : null;

    for (var dy = 0; dy < brushSize; dy++) {
      for (var dx = 0; dx < brushSize; dx++) {
        var x = gx + dx, y = gy + dy;
        if (x < 0 || x >= sW || y < 0 || y >= sH) continue;
        var idx = y * sW + x;
        if (dragCellsRef.current.has(idx)) continue;
        dragCellsRef.current.add(idx);

        if (action === "paint" && np) {
          if (np[idx].id === "__skip__") continue;
          if (!colorEntry) continue;
          var selMask = state.selectionMask;
          if (selMask && !selMask[idx]) continue;
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
          if (np[idx].id === "__skip__") continue;
          var selMaskE = state.selectionMask;
          if (selMaskE && !selMaskE[idx]) continue;
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
                  halfStitches: dragHalfStitchesRef.current,
                  bsLines: nBs,
                }));
              }
            }
          }
        } else if (action && action.startsWith("half-") && np) {
          if (np[idx].id === "__skip__") continue;
          var selMaskH = state.selectionMask;
          if (selMaskH && !selMaskH[idx]) continue;
          var dir = action.replace("half-", "");
          var ce = colorEntry;
          if (!ce) {
            var m = np[idx];
            if (m && m.id !== "__empty__" && cmap) ce = cmap[m.id];
          }
          if (!ce) continue;
          var existing = nm.get(idx) || {};
          if (existing[dir] && existing[dir].id === ce.id) {
            var updated = Object.assign({}, existing);
            delete updated[dir];
            if (!updated.fwd && !updated.bck) nm.delete(idx); else nm.set(idx, updated);
          } else {
            var newEntry = Object.assign({}, existing);
            newEntry[dir] = { id: ce.id, rgb: ce.rgb };
            nm.set(idx, newEntry);
          }
        }
      }
    }
  }

  // ─── handlePatClick ──────────────────────────────────────────────────────────
  function doEyedropSample(pat, cmap, sW, sH, halfStitches, gx, gy) {
    if (gx < 0 || gx >= sW || gy < 0 || gy >= sH) return;
    var idx = gy * sW + gx;
    var cell = pat[idx];
    if (cell && cell.id !== "__skip__" && cell.id !== "__empty__" && cmap && cmap[cell.id]) {
      state.setSelectedColorId(cell.id);
    } else {
      var hs = halfStitches.get(idx);
      if (hs) {
        if (hs.fwd && cmap[hs.fwd.id]) { state.setSelectedColorId(hs.fwd.id); }
        else if (hs.bck && cmap[hs.bck.id]) { state.setSelectedColorId(hs.bck.id); }
      } else {
        state.setEyedropperEmpty(true);
        if (state.addToast) state.addToast("That cell is empty \u2014 no colour to sample.", {type:"warning", duration:1500});
        setTimeout(function() { state.setEyedropperEmpty(false); }, 1200);
      }
    }
  }

  function handlePatClick(e) {
    var pat = state.pat, cmap = state.cmap, sW = state.sW, sH = state.sH;
    var cs = state.cs, G = state.G, pcRef = state.pcRef;
    var activeTool = state.activeToolRef ? state.activeToolRef.current : state.activeTool;
    var halfStitchTool = state.halfStitchToolRef ? state.halfStitchToolRef.current : state.halfStitchTool;
    var selectedColorId = state.selectedColorId, bsLines = state.bsLines;
    var bsStart = state.bsStart, bsContinuous = state.bsContinuous;
    var halfStitches = state.halfStitches, brushMode = state.brushMode;
    var EDIT_HISTORY_MAX = state.EDIT_HISTORY_MAX;
    var buildPaletteWithScratch = state.buildPaletteWithScratch;

    if (!pcRef.current || !pat) return;
    var gc = gridCoord(pcRef, e, cs, G, activeTool === "backstitch");
    if (!gc) return;
    var gx = gc.gx, gy = gc.gy;

    // Temporary eyedropper: Alt+click samples colour without switching tool
    if (e.altKey && activeTool !== "magicWand" && activeTool !== "lasso") {
      doEyedropSample(pat, cmap, sW, sH, halfStitches, gx, gy);
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
      doEyedropSample(pat, cmap, sW, sH, halfStitches, gx, gy);
      return;
    }

    if (halfStitchTool) {
      if (gx < 0 || gx >= sW || gy < 0 || gy >= sH) return;
      var idx1 = gy * sW + gx;
      if (halfStitchTool === "erase") {
        var nm0 = new Map(halfStitches); nm0.delete(idx1); state.setHalfStitches(nm0);
        return;
      }
      var dir1 = halfStitchTool;
      var ce1 = selectedColorId && cmap ? cmap[selectedColorId] : null;
      if (!ce1) { var m1 = pat[idx1]; if (m1 && m1.id !== "__skip__" && m1.id !== "__empty__" && cmap) ce1 = cmap[m1.id]; }
      if (!ce1) return;
      var nm1 = new Map(halfStitches); var ex1 = nm1.get(idx1) || {};
      if (ex1[dir1] && ex1[dir1].id === ce1.id) {
        var upd = Object.assign({}, ex1); delete upd[dir1];
        if (!upd.fwd && !upd.bck) nm1.delete(idx1); else nm1.set(idx1, upd);
      } else {
        var nhe = Object.assign({}, ex1); nhe[dir1] = { id: ce1.id, rgb: ce1.rgb }; nm1.set(idx1, nhe);
      }
      state.setHalfStitches(nm1);
      return;
    }

    if ((activeTool === "paint" || activeTool === "fill") && selectedColorId && cmap) {
      if (gx < 0 || gx >= sW || gy < 0 || gy >= sH) return;
      var idx2 = gy * sW + gx;
      if (pat[idx2].id === "__skip__") return;
      var pe = cmap[selectedColorId]; if (!pe) return;
      var np2 = pat.slice();
      if (activeTool === "fill") {
        var ch = [], vis = new Set(), q = [idx2], tid = pat[idx2].id;
        if (tid === pe.id) return;
        var selMask2 = state.selectionMask;
        while (q.length) {
          var id2 = q.pop();
          if (vis.has(id2)) continue; vis.add(id2);
          if (selMask2 && !selMask2[id2]) continue;
          if (pat[id2].id !== tid) continue;
          ch.push({ idx: id2, old: Object.assign({}, pat[id2]) });
          var x2 = id2 % sW, y2 = Math.floor(id2 / sW);
          if (x2 > 0) q.push(id2 - 1);
          if (x2 < sW - 1) q.push(id2 + 1);
          if (y2 > 0) q.push(id2 - sW);
          if (y2 < sH - 1) q.push(id2 + sW);
        }
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
      var r2 = buildPaletteWithScratch(np2); state.setPal(r2.pal); state.setCmap(r2.cmap);
      return;
    }

    if (activeTool === "backstitch") {
      if (gx < 0 || gx > sW || gy < 0 || gy > sH) return;
      var pt = { x: gx, y: gy };
      if (!bsStart) { state.setBsStart(pt); }
      else {
        state.setBsLines(function(prev) { return prev.concat([{ x1: bsStart.x, y1: bsStart.y, x2: pt.x, y2: pt.y }]); });
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
      if (mmd <= 0.7 && mci >= 0) { var nBs2 = bsLines.slice(); nBs2.splice(mci, 1); state.setBsLines(nBs2); }
    }
  }

  // ─── Mouse event handlers ────────────────────────────────────────────────────
  function handlePatMouseDown(e) {
    if (!isPrimaryButton(e)) return;
    var pat = state.pat, pcRef = state.pcRef, cs = state.cs, G = state.G;
    var activeTool = state.activeToolRef ? state.activeToolRef.current : state.activeTool;
    var halfStitchTool = state.halfStitchToolRef ? state.halfStitchToolRef.current : state.halfStitchTool;
    var selectedColorId = state.selectedColorId, cmap = state.cmap;
    if (!pcRef.current || !pat) return;

    // Temporary eyedropper: Alt+click samples colour without switching tool
    if (e.altKey && activeTool !== "magicWand" && activeTool !== "lasso") {
      var gc0 = gridCoord(pcRef, e, cs, G, false);
      if (gc0) doEyedropSample(pat, cmap, state.sW, state.sH, state.halfStitches, gc0.gx, gc0.gy);
      return;
    }

    if (!activeTool && !halfStitchTool) return;
    var gc = gridCoord(pcRef, e, cs, G, activeTool === "backstitch");
    if (!gc) return;
    var gx = gc.gx, gy = gc.gy;

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

    if (activeTool === "eyedropper" || activeTool === "fill" || activeTool === "backstitch" || activeTool === "eraseBs" || activeTool === "magicWand") {
      handlePatClick(e);
      return;
    }

    isDraggingRef.current = true;
    dragChangesRef.current = [];
    dragCellsRef.current.clear();
    dragPatRef.current = pat.slice();
    dragHalfStitchesRef.current = new Map(state.halfStitches);
    dragBsLinesRef.current = state.bsLines;

    if (activeTool === "paint" && selectedColorId && cmap) {
      dragActionRef.current = "paint";
      applyBrush(gx, gy, "paint");
    } else if (activeTool === "eraseAll") {
      dragActionRef.current = "eraseAll";
      applyBrush(gx, gy, "eraseAll");
    } else if (halfStitchTool) {
      dragActionRef.current = "half-" + halfStitchTool;
      applyBrush(gx, gy, dragActionRef.current);
    }
  }

  function handlePatMouseMove(e) {
    var pat = state.pat, pcRef = state.pcRef, cs = state.cs, G = state.G;
    var activeTool = state.activeTool, halfStitchTool = state.halfStitchTool;
    if (!pcRef.current || !pat || (!activeTool && !halfStitchTool)) return;
    var gc = gridCoord(pcRef, e, cs, G, activeTool === "backstitch" || activeTool === "eraseBs");
    if (!gc) return;
    var hc = state.hoverCoords;
    if (!hc || hc.gx !== gc.gx || hc.gy !== gc.gy) state.setHoverCoords(gc);
    if (activeTool === "lasso") {
      if (gc.gx >= 0 && gc.gx < state.sW && gc.gy >= 0 && gc.gy < state.sH) {
        state.setLassoCursor({ x: gc.gx, y: gc.gy });
        if (state.lassoMode === "freehand" && state.lassoActive) state.extendLasso(gc.gx, gc.gy);
      }
      return;
    }
    if (isDraggingRef.current) applyBrush(gc.gx, gc.gy, dragActionRef.current);
  }

  function handlePatMouseUp(e) {
    if (state.activeTool === "lasso") {
      if (state.lassoMode === "freehand" && state.lassoActive) state.finalizeLasso();
      return;
    }
    if (!isDraggingRef.current) return;
    isDraggingRef.current = false;

    var pat = state.pat, halfStitches = state.halfStitches, bsLines = state.bsLines;
    var EDIT_HISTORY_MAX = state.EDIT_HISTORY_MAX;
    var buildPaletteWithScratch = state.buildPaletteWithScratch;

    var madeChanges = dragChangesRef.current.length > 0;
    var oldHs = halfStitches, newHs = dragHalfStitchesRef.current;
    var hsChanged = false;
    if (dragActionRef.current === "eraseAll" || (dragActionRef.current && dragActionRef.current.startsWith("half-"))) {
      if (oldHs.size !== newHs.size) hsChanged = true;
      else {
        oldHs.forEach(function(v, k) { if (!newHs.has(k) || newHs.get(k) !== v) hsChanged = true; });
      }
    }
    var hsChanges = [];
    if (hsChanged) {
      var allKeys = new Set([].concat(Array.from(oldHs.keys()), Array.from(newHs.keys())));
      allKeys.forEach(function(k) {
        var ov = oldHs.get(k), nv = newHs.get(k);
        if (ov !== nv) hsChanges.push({ idx: k, old: ov ? Object.assign({}, ov) : null });
      });
    }
    var bsLinesChanged = dragBsLinesRef.current !== bsLines;

    if (madeChanges || hsChanged || bsLinesChanged) {
      if (madeChanges) state.setPat(dragPatRef.current);
      if (hsChanged) state.setHalfStitches(newHs);
      if (bsLinesChanged) state.setBsLines(dragBsLinesRef.current);
      var changes = dragChangesRef.current.slice();
      state.setEditHistory(function(prev) {
        var n = prev.concat([{
          type: dragActionRef.current,
          changes: changes,
          hsChanges: hsChanges.length > 0 ? hsChanges : undefined,
          bsLines: bsLinesChanged ? bsLines : undefined,
        }]);
        if (n.length > EDIT_HISTORY_MAX) n = n.slice(n.length - EDIT_HISTORY_MAX);
        return n;
      });
      state.setRedoHistory([]);
      if (madeChanges) {
        var r = buildPaletteWithScratch(dragPatRef.current);
        state.setPal(r.pal); state.setCmap(r.cmap);
      }
    }
    dragPatRef.current = null;
    dragHalfStitchesRef.current = null;
    dragBsLinesRef.current = null;
    dragActionRef.current = null;
    dragCellsRef.current.clear();
  }

  function handlePatMouseLeave(e) {
    state.setHoverCoords(null);
    if (state.activeTool === "lasso" && state.lassoMode === "freehand" && state.lassoActive) {
      state.finalizeLasso();
      return;
    }
    handlePatMouseUp(e);
  }

  // ─── Pointer event handlers ─────────────────────────────────────────────────
  function handlePatPointerDown(e) {
    var activeTool = state.activeTool, halfStitchTool = state.halfStitchTool;
    var scrollRef = state.scrollRef;
    if (e.pointerType === "mouse" && !isPrimaryButton(e)) return;

    activePointersRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (e.target && e.target.setPointerCapture) {
      try { e.target.setPointerCapture(e.pointerId); } catch (_) {}
    }

    if (activePointersRef.current.size === 2) {
      if (isDraggingRef.current) cancelDragSession();
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

    if (isTouchPointer(e) && !activeTool && !halfStitchTool && scrollRef.current) {
      panStateRef.current = {
        pointerId: e.pointerId,
        startX: e.clientX,
        startY: e.clientY,
        scrollLeft: scrollRef.current.scrollLeft,
        scrollTop: scrollRef.current.scrollTop,
      };
      state.setHoverCoords(null);
      e.preventDefault();
      return;
    }

    if (isTouchPointer(e) && activeTool === "backstitch") {
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

    if (!activeTool && !halfStitchTool) return;
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
      state.scrollRef.current.scrollLeft = panStateRef.current.scrollLeft - dx;
      state.scrollRef.current.scrollTop = panStateRef.current.scrollTop - dy;
      state.setHoverCoords(null);
      e.preventDefault();
      return;
    }

    if (pendingTapRef.current && pendingTapRef.current.pointerId === e.pointerId) {
      var moved = Math.hypot(e.clientX - pendingTapRef.current.startX, e.clientY - pendingTapRef.current.startY) > TOUCH_TAP_SLOP;
      if (moved) {
        pendingTapRef.current.moved = true;
        clearLongPressTimer();
      }
      e.preventDefault();
      handlePatMouseMove(e);
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
    var wasPan = panStateRef.current && panStateRef.current.pointerId === e.pointerId;

    activePointersRef.current.delete(e.pointerId);
    if (e.target && e.target.releasePointerCapture) {
      try { e.target.releasePointerCapture(e.pointerId); } catch (_) {}
    }

    if (wasPan) {
      panStateRef.current = null;
      state.setHoverCoords(null);
      e.preventDefault();
      return;
    }

    if (wasPendingTap) {
      clearLongPressTimer();
      if (!wasPendingTap.moved && !longPressTriggeredRef.current && !hadPinch) {
        handlePatClick(e);
      }
      clearPendingTap();
      state.setHoverCoords(null);
      e.preventDefault();
      return;
    }

    if (activePointersRef.current.size < 2) pinchStateRef.current = null;
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
    activePointersRef.current.delete(e.pointerId);
    if (e.target && e.target.releasePointerCapture) {
      try { e.target.releasePointerCapture(e.pointerId); } catch (_) {}
    }
    clearPendingTap();
    panStateRef.current = null;
    if (activePointersRef.current.size < 2) pinchStateRef.current = null;
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
