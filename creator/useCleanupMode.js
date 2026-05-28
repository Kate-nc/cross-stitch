/* creator/useCleanupMode.js — Cleanup Mode hook.
   Handles target-colour selection, tolerance, brush/click/auto-detect
   selection, overlay mask, apply logic (atomic neighbour vote), and undo
   entry creation.

   Exposed on window so it can be called from creator-main.js:
     window.useCleanupMode(state, history)
     → { handlers, applyCleanup, cancelCleanup, runAutoDetect, ... }

   Depends on globals:
     React (useState/useRef/useCallback/useEffect from CDN)
     dE2000, rgbToLab (colour-utils.js)
     gridCoord (helpers.js)
*/

// ═══════════════════════════════════════════════════════════════════════════════
// Module-root constants — all tunable thresholds live here, never inlined.
// ═══════════════════════════════════════════════════════════════════════════════

// Tolerance slider (0–100) maps linearly to this ΔE range (CIEDE2000 units).
// Most lineart-vs-background separations sit well below 15 ΔE; 30 gives room
// to capture near-black tones without spanning the whole palette.
var CLEANUP_TOLERANCE_MAX_DE = 30;

// Auto-detect: a candidate cell is considered "interior to a filled block"
// (not lineart) when it has this many or more cardinal-direction neighbours
// that are also candidate-coloured. 4 = fully surrounded.
var AUTODETECT_INTERIOR_CARDINAL_THRESHOLD = 3;

// Auto-detect: a candidate cell must have at least this fraction of its valid
// 8-connected neighbours belonging to a DIFFERENT colour to qualify as lineart
// (boundary / thin-line criterion).
var AUTODETECT_MIN_FOREIGN_RATIO = 0.35;

// Auto-detect: connected components smaller than this cell count are discarded
// (isolated noise pixels, not real lineart runs).
var AUTODETECT_MIN_RUN_LENGTH = 2;

// Neighbour vote: radius of the wider neighbourhood used for first tie-break.
// 5 means a 5×5 region (radius 2 from center).
var CLEANUP_WIDE_NEIGHBOURHOOD_RADIUS = 2;

// Overlay colour for selected cells (solid semi-transparent warm orange).
var CLEANUP_OVERLAY_COLOR = 'rgba(255,90,0,0.50)';

// Brush size limits.
var CLEANUP_BRUSH_MIN = 1;
var CLEANUP_BRUSH_MAX = 10;

// ═══════════════════════════════════════════════════════════════════════════════
// Exported hook
// ═══════════════════════════════════════════════════════════════════════════════

window.useCleanupMode = function useCleanupMode(state, history) {
  var useRef      = React.useRef;
  var useCallback = React.useCallback;
  var useEffect   = React.useEffect;

  // Reference to the active cleanup Web Worker instance.
  var workerRef = useRef(null);
  var lastAutoToleranceRef = useRef(null);
  // CL-4: cache the slim {id, lab} array built for the auto-detect worker.
  // The slim-pat only depends on `pat` and `cmap`; the tolerance slider
  // alone does not invalidate it. Keying on object identity is safe
  // because useCreatorState rebuilds these references whenever a cell or
  // palette entry changes (regen, paint, palette swap, cleanup apply).
  var slimPatCacheRef = useRef({ pat: null, cmap: null, slim: null });

  // ── Derived: tolerance in ΔE ──────────────────────────────────────────────
  function toleranceDe(sliderVal) {
    return (sliderVal / 100) * CLEANUP_TOLERANCE_MAX_DE;
  }

  // ── Colour-within-tolerance check ─────────────────────────────────────────
  // Returns true if the given palette-entry lab is within tolerance of the
  // target. Uses the globally-available dE2000 from colour-utils.js.
  function isWithinTolerance(cellLab, targetLab, sliderVal) {
    if (!cellLab || !targetLab) return false;
    var de = dE2000(targetLab, cellLab);
    return de <= toleranceDe(sliderVal);
  }

  // ── Darken-palette default-target helper ─────────────────────────────────
  // Returns the id of the darkest colour in the current palette, as a
  // convenience starting point (lineart is usually dark).
  function darkestPaletteId(pal) {
    if (!pal || !pal.length) return null;
    var darkest = pal[0];
    for (var i = 1; i < pal.length; i++) {
      // L* channel of Lab: lower = darker
      if (pal[i].lab && darkest.lab && pal[i].lab[0] < darkest.lab[0]) {
        darkest = pal[i];
      }
    }
    return darkest.id;
  }

  // ── Enter / exit cleanup ──────────────────────────────────────────────────
  var enterCleanup = useCallback(function() {
    var pal = state.pal;
    var cmap = state.cmap;
    // Default target: darkest colour in palette, unless already set and still valid
    var tgt = state.cleanupTargetColorId;
    if (!tgt || !(cmap && cmap[tgt])) {
      tgt = darkestPaletteId(pal);
    }
    if (tgt) state.setCleanupTargetColorId(tgt);
    state.setActiveTool('cleanup');
    // Cancel any in-flight worker
    if (workerRef.current) { workerRef.current.terminate(); workerRef.current = null; }
    state.setCleanupAutoRunning(false);
    state.setCleanupAutoError(null);
  }, [state]);

  var exitCleanup = useCallback(function() {
    state.setActiveTool(null);
    state.setCleanupPendingMask(null);
    state.setCleanupAutoRunning(false);
    state.setCleanupAutoError(null);
    if (workerRef.current) { workerRef.current.terminate(); workerRef.current = null; }
  }, [state]);

  var cancelCleanup = useCallback(function() {
    state.setCleanupPendingMask(null);
    state.setCleanupAutoRunning(false);
    state.setCleanupAutoError(null);
    if (workerRef.current) { workerRef.current.terminate(); workerRef.current = null; }
  }, [state]);

  // ── Mask helpers ─────────────────────────────────────────────────────────
  function getOrCreateMask(sW, sH, existing) {
    if (existing && existing.length === sW * sH) return existing;
    return new Uint8Array(sW * sH);
  }

  // ── Click selection ───────────────────────────────────────────────────────
  // Called when the user clicks a single cell while in click sub-tool.
  // Toggles the cell in the pending mask if it matches within tolerance.
  var handleCleanupClick = useCallback(function(gx, gy) {
    var pat = state.pat;
    var sW  = state.sW;
    var sH  = state.sH;
    var cmap = state.cmap;
    var tgtId = state.cleanupTargetColorId;
    if (!pat || gx < 0 || gx >= sW || gy < 0 || gy >= sH) return;
    var idx = gy * sW + gx;
    var cell = pat[idx];
    if (!cell || cell.id === '__skip__' || cell.id === '__empty__') return;
    var tgtEntry = cmap && tgtId ? cmap[tgtId] : null;
    if (!tgtEntry) return;
    var cellEntry = cmap ? cmap[cell.id] : null;
    if (!isWithinTolerance(cellEntry && cellEntry.lab, tgtEntry.lab, state.cleanupTolerance)) return;

    var mask = getOrCreateMask(sW, sH, state.cleanupPendingMask).slice();
    mask[idx] = mask[idx] ? 0 : 1; // toggle
    state.setCleanupPendingMask(mask);
  }, [state]);

  // ── Brush drag selection ──────────────────────────────────────────────────
  // Drag-paint refs (not React state — updated at 60 fps during drag)
  var brushDragActiveRef = useRef(false);
  var brushMaskRef       = useRef(null);
  // CL-3: coalesce setCleanupPendingMask updates into rAF batches.
  // Without this every pointermove event allocates a fresh w*h Uint8Array
  // via mask.slice() + a React re-render. On a 200×200 grid that is ~40 KB
  // × pointermove rate (60+ Hz), which produces visible GC stutter on
  // mid-range Android devices during long strokes.
  var brushRafPendingRef = useRef(false);

  var handleCleanupPointerDown = useCallback(function(gx, gy) {
    if (state.cleanupSelTool !== 'brush') return;
    var sW = state.sW, sH = state.sH;
    brushDragActiveRef.current = true;
    // Start from a copy of the current mask
    var existing = state.cleanupPendingMask;
    brushMaskRef.current = getOrCreateMask(sW, sH, existing).slice();
    _brushPaint(gx, gy, sW, sH);
  }, [state]);

  var handleCleanupPointerMove = useCallback(function(gx, gy) {
    if (!brushDragActiveRef.current || state.cleanupSelTool !== 'brush') return;
    _brushPaint(gx, gy, state.sW, state.sH);
  }, [state]);

  var handleCleanupPointerUp = useCallback(function() {
    if (!brushDragActiveRef.current) return;
    brushDragActiveRef.current = false;
    if (brushMaskRef.current) {
      state.setCleanupPendingMask(brushMaskRef.current);
      brushMaskRef.current = null;
    }
  }, [state]);

  function _brushPaint(gx, gy, sW, sH) {
    var pat = state.pat;
    var cmap = state.cmap;
    var tgtId = state.cleanupTargetColorId;
    var brushSize = state.cleanupBrushSize;
    var tol = state.cleanupTolerance;
    var mask = brushMaskRef.current;
    if (!pat || !mask || !tgtId) return;
    var tgtEntry = cmap && cmap[tgtId] ? cmap[tgtId] : null;
    if (!tgtEntry) return;

    for (var dy = 0; dy < brushSize; dy++) {
      for (var dx = 0; dx < brushSize; dx++) {
        var x = gx + dx, y = gy + dy;
        if (x < 0 || x >= sW || y < 0 || y >= sH) continue;
        var idx = y * sW + x;
        var cell = pat[idx];
        if (!cell || cell.id === '__skip__' || cell.id === '__empty__') continue;
        var cellEntry2 = cmap ? cmap[cell.id] : null;
        if (!isWithinTolerance(cellEntry2 && cellEntry2.lab, tgtEntry.lab, tol)) continue;
        mask[idx] = 1;
      }
    }
    // CL-3: schedule one slice + setState per animation frame regardless
    // of how many pointermove events arrived. The mask itself was already
    // updated synchronously above, so subsequent moves within the same
    // frame keep accumulating into the same buffer; the React state
    // catches up at 60 fps.
    if (!brushRafPendingRef.current) {
      brushRafPendingRef.current = true;
      var _raf = (typeof window !== 'undefined' && window.requestAnimationFrame)
        ? window.requestAnimationFrame
        : function (fn) { return setTimeout(fn, 16); };
      _raf(function () {
        brushRafPendingRef.current = false;
        if (brushMaskRef.current) {
          state.setCleanupPendingMask(brushMaskRef.current.slice());
        }
      });
    }
  }

  // ── Auto-detect (Web Worker) ──────────────────────────────────────────────
  var runAutoDetect = useCallback(function() {
    var pat = state.pat;
    var sW  = state.sW;
    var sH  = state.sH;
    var cmap = state.cmap;
    var tgtId = state.cleanupTargetColorId;
    if (!pat || !tgtId) return;
    var tgtEntry = cmap && cmap[tgtId] ? cmap[tgtId] : null;
    if (!tgtEntry || !tgtEntry.lab) return;

    // Terminate any previous run
    if (workerRef.current) { workerRef.current.terminate(); workerRef.current = null; }
    state.setCleanupAutoRunning(true);
    state.setCleanupAutoError(null);
    lastAutoToleranceRef.current = state.cleanupTolerance;

    var worker;
    try {
      worker = new Worker('cleanup-worker.js');
    } catch (e) {
      state.setCleanupAutoRunning(false);
      state.setCleanupAutoError('Could not start cleanup worker: ' + (e && e.message || String(e)));
      return;
    }
    workerRef.current = worker;

    function releaseWorker(doneWorker) {
      if (doneWorker && typeof doneWorker.terminate === 'function') doneWorker.terminate();
      if (workerRef.current === doneWorker) workerRef.current = null;
    }

    // Serialise only the data the worker needs — avoid transferring the full
    // React element objects. We send {id, lab} per cell.
    // Pat cells are {id, type, rgb} — lab lives in cmap, so look it up.
    // CL-4: reuse the cached slim-pat across tolerance changes so moving
    // the slider doesn't reallocate sW×sH plain objects on every run.
    var slimPat;
    var cache = slimPatCacheRef.current;
    if (cache.pat === pat && cache.cmap === cmap && cache.slim && cache.slim.length === pat.length) {
      slimPat = cache.slim;
    } else {
      slimPat = new Array(sW * sH);
      for (var i = 0; i < pat.length; i++) {
        var c = pat[i];
        var cmapEntry = cmap && cmap[c.id];
        slimPat[i] = { id: c.id, lab: cmapEntry ? cmapEntry.lab : c.lab };
      }
      slimPatCacheRef.current = { pat: pat, cmap: cmap, slim: slimPat };
    }

    worker.onmessage = function(e) {
      var msg = e.data;
      if (msg.type === 'result') {
        releaseWorker(worker);
        state.setCleanupAutoRunning(false);
        // Worker sends a plain Array of 0/1; convert to Uint8Array
        var arr = new Uint8Array(msg.selected.length);
        for (var j = 0; j < msg.selected.length; j++) arr[j] = msg.selected[j];
        state.setCleanupPendingMask(arr);
      } else if (msg.type === 'error') {
        releaseWorker(worker);
        state.setCleanupAutoRunning(false);
        state.setCleanupAutoError(msg.message || 'Auto-detect failed');
      }
    };
    worker.onerror = function(ev) {
      releaseWorker(worker);
      state.setCleanupAutoRunning(false);
      state.setCleanupAutoError('Worker error: ' + (ev.message || 'unknown'));
    };
    try {
      worker.postMessage({
        type: 'autodetect',
        pat: slimPat,
        sW: sW,
        sH: sH,
        targetLab: tgtEntry.lab,
        toleranceDe: toleranceDe(state.cleanupTolerance),
        // Forward tunable constants so they can be overridden in future without
        // editing the worker file.
        interiorCardinalThreshold: AUTODETECT_INTERIOR_CARDINAL_THRESHOLD,
        minForeignRatio: AUTODETECT_MIN_FOREIGN_RATIO,
        minRunLength: AUTODETECT_MIN_RUN_LENGTH,
      });
    } catch (postErr) {
      releaseWorker(worker);
      state.setCleanupAutoRunning(false);
      state.setCleanupAutoError('Could not run cleanup worker: ' + (postErr && postErr.message || String(postErr)));
    }
  }, [state]);

  // Re-run auto-detect when tolerance changes while auto sub-tool is active
  // and a previous auto-detect result is already shown.
  useEffect(function() {
    if (state.activeTool !== 'cleanup') return;
    if (state.cleanupSelTool !== 'auto') return;
    if (!state.cleanupPendingMask && !state.cleanupAutoRunning) return;
    if (state.cleanupAutoRunning) return;
    if (lastAutoToleranceRef.current === state.cleanupTolerance) return;
    runAutoDetect();
  }, [state.cleanupTolerance, state.cleanupAutoRunning, state.cleanupPendingMask, state.cleanupSelTool, state.activeTool]);

  // Auto-trigger when the user switches to the Auto sub-tool, or enters
  // cleanup mode while Auto is already the active sub-tool.
  useEffect(function() {
    if (state.activeTool !== 'cleanup') return;
    if (state.cleanupSelTool !== 'auto') return;
    if (state.cleanupAutoRunning) return;
    runAutoDetect();
  }, [state.cleanupSelTool, state.activeTool]);

  // CL-5: If the user leaves Auto sub-tool (or leaves cleanup mode entirely)
  // while a worker run is in flight, terminate the worker so its late result
  // can't overwrite a fresh click/brush selection mask. enterCleanup,
  // exitCleanup and cancelCleanup already terminate on those code paths;
  // this covers the sub-tool-switch case the others miss.
  useEffect(function() {
    if (state.activeTool === 'cleanup' && state.cleanupSelTool === 'auto') return;
    if (workerRef.current) {
      workerRef.current.terminate();
      workerRef.current = null;
      if (state.cleanupAutoRunning) state.setCleanupAutoRunning(false);
    }
  }, [state.cleanupSelTool, state.activeTool]);

  // CL-1: Terminate the cleanup worker on unmount so a navigation away from
  // the creator (or a hot-reload) doesn't leave an orphan worker process.
  useEffect(function() {
    return function() {
      if (workerRef.current) {
        try { workerRef.current.terminate(); } catch (_) {}
        workerRef.current = null;
      }
    };
  }, []);

  // ── Neighbour vote ────────────────────────────────────────────────────────
  // Delegates to the shared window.cleanupNeighbourVote (cleanupSharedHelpers.js).
  // Identical algorithm; extracted so useDenoiseMode.js can reuse it.
  function _neighbourVote(idx, prePat, selectedSet, sW, sH) {
    var result = window.cleanupNeighbourVote(idx, prePat, selectedSet, sW, sH, CLEANUP_WIDE_NEIGHBOURHOOD_RADIUS);
    // Original: returned prePat[idx] when no valid neighbours. Keep that behaviour.
    return result !== null ? result : prePat[idx];
  }

  // Thin wrapper retained so internal callers (applyCleanup, tie-break) keep working.
  function _findEntry(prePat, id) {
    return window.cleanupFindEntry(prePat, id);
  }

  // ── Apply cleanup ─────────────────────────────────────────────────────────
  var applyCleanup = useCallback(function() {
    var pat  = state.pat;
    var sW   = state.sW;
    var sH   = state.sH;
    var mask = state.cleanupPendingMask;
    if (!pat || !mask) return;

    // Build selected set
    var selectedSet = new Set();
    for (var i = 0; i < mask.length; i++) { if (mask[i]) selectedSet.add(i); }
    if (selectedSet.size === 0) return;

    // Pre-apply snapshot (votes read from this, writes go to np)
    var prePat = pat.slice();
    var np = pat.slice();

    // Compute ALL replacements first (atomicity), then write them.
    var replacements = [];
    selectedSet.forEach(function(idx) {
      var replacement = _neighbourVote(idx, prePat, selectedSet, sW, sH);
      replacements.push({ idx: idx, replacement: replacement });
    });

    // Record changes and apply
    var changes = [];
    for (var ri = 0; ri < replacements.length; ri++) {
      var r = replacements[ri];
      if (!r.replacement) continue;
      changes.push({ idx: r.idx, old: Object.assign({}, prePat[r.idx]) });
      np[r.idx] = r.replacement;
    }

    if (changes.length === 0) return;

    state.setPat(np);

    // Rebuild palette — rebuildPreservingZeros keeps zero-count colours
    // visible as "unused" chips in the UI.
    var built = state.buildPaletteWithScratch(np);
    var existingPal = state.pal || [];
    var changedIds = new Set(changes.map(function(change) { return change.old && change.old.id; }));
    var inResult = new Set(built.pal.map(function(p) { return p.id; }));
    var zeroed = existingPal
      .filter(function(p) { return changedIds.has(p.id) && !inResult.has(p.id); })
      .map(function(p) { return Object.assign({}, p, { count: 0 }); });
    if (zeroed.length) {
      var cmap2 = Object.assign({}, built.cmap);
      zeroed.forEach(function(p) { cmap2[p.id] = p; });
      state.setPal(built.pal.concat(zeroed));
      state.setCmap(cmap2);
    } else {
      state.setPal(built.pal);
      state.setCmap(built.cmap);
    }

    // Push undo entry (generic changes[] loop in useEditHistory handles this
    // without any new branch — type "cleanup" just passes through).
    state.setEditHistory(function(prev) {
      var n = prev.concat([{ type: 'cleanup', changes: changes }]);
      if (n.length > state.EDIT_HISTORY_MAX) n = n.slice(n.length - state.EDIT_HISTORY_MAX);
      return n;
    });
    // Any apply clears the redo stack.
    state.setRedoHistory([]);

    // Clear the pending mask
    state.setCleanupPendingMask(null);

    // Unused-colour notice: colours that were removed by this cleanup and are
    // now at zero stitch count get a toast with a one-click "Remove" action.
    if (zeroed.length && state.addToast) {
      zeroed.forEach(function(p) {
        var label = 'DMC ' + p.id + (p.name ? ' \xb7 ' + p.name : '');
        state.addToast(label + ' is no longer used — remove from palette?', {
          type: 'info',
          duration: 8000,
          action: {
            label: 'Remove',
            onClick: function() {
              var pid = p.id; // capture per-iteration
              state.setPal(function(prev) { return prev ? prev.filter(function(e) { return e.id !== pid; }) : prev; });
              state.setCmap(function(prev) { if (!prev) return prev; var n2 = Object.assign({}, prev); delete n2[pid]; return n2; });
              // Push a remove_unused_colours undo entry so the user can undo
              // the palette removal independently from the stitch replacement.
              state.setEditHistory(function(prev2) {
                var n3 = prev2.concat([{ type: 'remove_unused_colours', removedFromPal: [p], removedFromScratch: [] }]);
                if (n3.length > state.EDIT_HISTORY_MAX) n3 = n3.slice(n3.length - state.EDIT_HISTORY_MAX);
                return n3;
              });
              state.setRedoHistory([]);
            }
          }
        });
      });
    }
  }, [state, history]);

  // Keep cleanupHandlersRef up to date so useCanvasInteraction can dispatch
  // pointer events without a circular hook dependency.
  // We do this synchronously every render (no useEffect needed — refs are
  // synchronously readable).
  if (state.cleanupHandlersRef) {
    state.cleanupHandlersRef.current = {
      handleCleanupClick: handleCleanupClick,
      handleCleanupPointerDown: handleCleanupPointerDown,
      handleCleanupPointerMove: handleCleanupPointerMove,
      handleCleanupPointerUp: handleCleanupPointerUp,
    };
  }

  // ── Cleanup overlay colour (exported for canvasRenderer) ─────────────────
  var OVERLAY_COLOR = CLEANUP_OVERLAY_COLOR;

  return {
    enterCleanup: enterCleanup,
    exitCleanup: exitCleanup,
    cancelCleanup: cancelCleanup,
    applyCleanup: applyCleanup,
    runAutoDetect: runAutoDetect,
    handleCleanupClick: handleCleanupClick,
    handleCleanupPointerDown: handleCleanupPointerDown,
    handleCleanupPointerMove: handleCleanupPointerMove,
    handleCleanupPointerUp: handleCleanupPointerUp,
    OVERLAY_COLOR: OVERLAY_COLOR,
    CLEANUP_TOLERANCE_MAX_DE: CLEANUP_TOLERANCE_MAX_DE,
    CLEANUP_BRUSH_MIN: CLEANUP_BRUSH_MIN,
    CLEANUP_BRUSH_MAX: CLEANUP_BRUSH_MAX,
  };
};

// Export constants for use in canvasRenderer.js and tests.
window.CLEANUP_OVERLAY_COLOR = CLEANUP_OVERLAY_COLOR;
window.CLEANUP_TOLERANCE_MAX_DE = CLEANUP_TOLERANCE_MAX_DE;
window.AUTODETECT_INTERIOR_CARDINAL_THRESHOLD = AUTODETECT_INTERIOR_CARDINAL_THRESHOLD;
window.AUTODETECT_MIN_FOREIGN_RATIO = AUTODETECT_MIN_FOREIGN_RATIO;
window.AUTODETECT_MIN_RUN_LENGTH = AUTODETECT_MIN_RUN_LENGTH;
