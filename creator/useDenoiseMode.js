/* creator/useDenoiseMode.js — Denoise Mode hook.
   Handles mask detection (palette consolidation, speckle, fringe), manual brush
   selection, overlay mask, apply logic (mergeMap + atomic neighbour vote), and
   undo entry creation.

   Exposed on window so it can be called from creator-main.js:
     window.useDenoiseMode(state, history)
     → { enterDenoise, exitDenoise, cancelDenoise, applyDenoise,
         runDenoiseAutoDetect, handleDenoisePointerDown/Move/Up, OVERLAY_COLOR }

   Depends on globals:
     React (useRef/useCallback/useEffect from CDN)
     dE2000 (colour-utils.js)
     gridCoord (helpers.js)
     window.cleanupNeighbourVote, window.cleanupFindEntry (cleanupSharedHelpers.js)
*/

// ═══════════════════════════════════════════════════════════════════════════════
// Module-root constants
// ═══════════════════════════════════════════════════════════════════════════════

// Palette-threshold slider (0–100) maps linearly to this ΔE range.
var DENOISE_THRESHOLD_MAX_DE = 30;

// Fraction of non-skip cells that must be fully surrounded by a different
// colour before the dither warning banner is shown.
var DENOISE_DITHER_WARN_RATIO = 0.15;

// Radius for the wide neighbourhood tie-break during apply (identical to cleanup).
var DENOISE_WIDE_NEIGHBOURHOOD_RADIUS = 2;

// Brush size limits.
var DENOISE_BRUSH_MIN = 1;
var DENOISE_BRUSH_MAX = 10;

// Overlay colour: teal, distinct from cleanup orange.
var DENOISE_OVERLAY_COLOR = 'rgba(0,160,200,0.50)';

// localStorage key prefix for per-project dither-warning dismissal.
var DENOISE_DITHER_WARN_KEY_PREFIX = 'denoise_ditherWarnDismissed_';

// ═══════════════════════════════════════════════════════════════════════════════
// Exported hook
// ═══════════════════════════════════════════════════════════════════════════════

window.useDenoiseMode = function useDenoiseMode(state, history) {
  var useRef      = React.useRef;
  var useCallback = React.useCallback;
  var useEffect   = React.useEffect;

  // Reference to the active noise-cleanup Web Worker instance.
  var workerRef = useRef(null);

  // Cache for the slim {id, lab, type} array sent to the worker.
  // Only rebuilt when pat or cmap reference changes.
  var slimPatCacheRef = useRef({ pat: null, cmap: null, slim: null });

  // ── Threshold in ΔE ───────────────────────────────────────────────────────
  // State now stores the ΔE value directly (integer 1–30).
  function thresholdDe(val) {
    return val || 5;
  }

  // ── Dither warning helpers ─────────────────────────────────────────────────
  function _ditherWarnKey() {
    var pid = state.projectIdRef && state.projectIdRef.current;
    return pid ? DENOISE_DITHER_WARN_KEY_PREFIX + pid : null;
  }
  function _isDitherWarnDismissed() {
    var key = _ditherWarnKey();
    if (!key) return false;
    try { return !!localStorage.getItem(key); } catch (_) { return false; }
  }
  function dismissDitherWarning() {
    var key = _ditherWarnKey();
    if (key) { try { localStorage.setItem(key, '1'); } catch (_) {} }
    state.setDenoiseDitherWarning(false);
  }

  // ── Enter / exit denoise ──────────────────────────────────────────────────
  var enterDenoise = useCallback(function() {
    state.setActiveTool('denoise');
    // Cancel any in-flight worker
    if (workerRef.current) { workerRef.current.terminate(); workerRef.current = null; }
    state.setDenoiseAutoRunning(false);
    state.setDenoiseAutoError(null);
    state.setDenoiseDitherWarning(false);
  }, [state]);

  var exitDenoise = useCallback(function() {
    state.setActiveTool(null);
    state.setDenoisePendingMask(null);
    state.setDenoiseAutoRunning(false);
    state.setDenoiseAutoError(null);
    state.setDenoisePreviewReport(null);
    state.setDenoiseDitherWarning(false);
    if (workerRef.current) { workerRef.current.terminate(); workerRef.current = null; }
  }, [state]);

  var cancelDenoise = useCallback(function() {
    state.setDenoisePendingMask(null);
    state.setDenoiseAutoRunning(false);
    state.setDenoiseAutoError(null);
    state.setDenoisePreviewReport(null);
    if (workerRef.current) { workerRef.current.terminate(); workerRef.current = null; }
  }, [state]);

  // ── Build slim pal for worker ─────────────────────────────────────────────
  function _buildSlimPal(pal, cmap) {
    if (!pal) return [];
    var out = [];
    for (var i = 0; i < pal.length; i++) {
      var p = pal[i];
      if (!p || p.id === '__skip__' || p.id === '__empty__') continue;
      var e = cmap && cmap[p.id];
      out.push({ id: p.id, lab: e ? e.lab : null, count: p.count || 0 });
    }
    return out;
  }

  // ── Auto-detect (Web Worker) ──────────────────────────────────────────────
  var runDenoiseAutoDetect = useCallback(function() {
    var pat  = state.pat;
    var sW   = state.sW;
    var sH   = state.sH;
    var cmap = state.cmap;
    var pal  = state.pal;
    if (!pat) return;

    // Terminate any previous run
    if (workerRef.current) { workerRef.current.terminate(); workerRef.current = null; }
    state.setDenoiseAutoRunning(true);
    state.setDenoiseAutoError(null);

    var worker;
    try {
      worker = new Worker('noise-cleanup-worker.js');
    } catch (e) {
      state.setDenoiseAutoRunning(false);
      state.setDenoiseAutoError('Could not start denoise worker: ' + (e && e.message || String(e)));
      return;
    }
    workerRef.current = worker;

    function releaseWorker(doneWorker) {
      if (doneWorker && typeof doneWorker.terminate === 'function') doneWorker.terminate();
      if (workerRef.current === doneWorker) workerRef.current = null;
    }

    // Build slim pat (cache by pat + cmap reference identity)
    var slimPat;
    var cache = slimPatCacheRef.current;
    if (cache.pat === pat && cache.cmap === cmap && cache.slim && cache.slim.length === pat.length) {
      slimPat = cache.slim;
    } else {
      slimPat = new Array(sW * sH);
      for (var i = 0; i < pat.length; i++) {
        var c = pat[i];
        var cmapEntry = cmap && cmap[c.id];
        slimPat[i] = { id: c.id, lab: cmapEntry ? cmapEntry.lab : null, type: c.type };
      }
      slimPatCacheRef.current = { pat: pat, cmap: cmap, slim: slimPat };
    }

    var slimPal = _buildSlimPal(pal, cmap);
    var ops = state.denoiseOps || { palette: true, speckle: false, fringe: true };

    worker.onmessage = function(e) {
      var msg = e.data;
      if (msg.type === 'result') {
        releaseWorker(worker);
        state.setDenoiseAutoRunning(false);
        state.setDenoisePendingMask(msg.mask);
        state.setDenoisePreviewReport(msg.report || null);
        // Dither warning: check isolation ratio (only show if not dismissed)
        var report = msg.report;
        if (report && typeof report.isolationRatio === 'number'
            && report.isolationRatio > DENOISE_DITHER_WARN_RATIO
            && !_isDitherWarnDismissed()) {
          state.setDenoiseDitherWarning(true);
        } else {
          state.setDenoiseDitherWarning(false);
        }
      } else if (msg.type === 'error') {
        releaseWorker(worker);
        state.setDenoiseAutoRunning(false);
        state.setDenoiseAutoError(msg.message || 'Denoise detection failed');
      }
    };
    worker.onerror = function(ev) {
      releaseWorker(worker);
      state.setDenoiseAutoRunning(false);
      state.setDenoiseAutoError('Worker error: ' + (ev.message || 'unknown'));
    };

    try {
      worker.postMessage({
        type: 'detect',
        pat: slimPat,
        pal: slimPal,
        sW: sW,
        sH: sH,
        paletteThresholdDe:   thresholdDe(state.denoiseThreshold),
        speckleMaxSize:        3,
        speckleDominanceRatio: 0.6,
        fringeTransitionDe:    6.0,
        fringeMinRegionSize:   4,
        enablePalette: !!ops.palette,
        enableSpeckle: !!ops.speckle,
        enableFringe:  !!ops.fringe,
      });
    } catch (postErr) {
      releaseWorker(worker);
      state.setDenoiseAutoRunning(false);
      state.setDenoiseAutoError('Could not run denoise worker: ' + (postErr && postErr.message || String(postErr)));
    }
  }, [state]);

  // Auto-trigger when entering denoise with auto sub-tool, or switching to it.
  useEffect(function() {
    if (state.activeTool !== 'denoise') return;
    if (state.denoiseSelTool !== 'auto') return;
    if (state.denoiseAutoRunning) return;
    runDenoiseAutoDetect();
  }, [state.denoiseSelTool, state.activeTool]);

  // Terminate worker when leaving auto sub-tool so a stale result can't overwrite
  // a manually painted brush mask.
  useEffect(function() {
    if (state.activeTool === 'denoise' && state.denoiseSelTool === 'auto') return;
    if (workerRef.current) {
      workerRef.current.terminate();
      workerRef.current = null;
      if (state.denoiseAutoRunning) state.setDenoiseAutoRunning(false);
    }
  }, [state.denoiseSelTool, state.activeTool]);

  // Re-run when ops toggle while auto sub-tool is active with a result visible.
  useEffect(function() {
    if (state.activeTool !== 'denoise') return;
    if (state.denoiseSelTool !== 'auto') return;
    if (state.denoiseAutoRunning) return;
    if (!state.denoisePendingMask && !state.denoisePreviewReport) return;
    runDenoiseAutoDetect();
  }, [state.denoiseOps]);

  // Re-run when palette threshold changes while auto sub-tool is active with a result visible.
  // Debounced 350ms — the slider fires on every drag tick; only re-run once the
  // user pauses so the layout stays stable and workers are not thrashed.
  useEffect(function() {
    if (state.activeTool !== 'denoise') return;
    if (state.denoiseSelTool !== 'auto') return;
    if (!state.denoisePendingMask && !state.denoisePreviewReport) return;
    var t = setTimeout(function() {
      runDenoiseAutoDetect();
    }, 350);
    return function() { clearTimeout(t); };
  }, [state.denoiseThreshold]);

  // Cleanup worker on unmount.
  useEffect(function() {
    return function() {
      if (workerRef.current) {
        try { workerRef.current.terminate(); } catch (_) {}
        workerRef.current = null;
      }
    };
  }, []);

  // ── Brush drag selection ──────────────────────────────────────────────────
  // Denoise brush: marks any non-skip, non-empty cell (no tolerance filter).
  var brushDragActiveRef = useRef(false);
  var brushMaskRef       = useRef(null);
  var brushRafPendingRef = useRef(false);

  var handleDenoisePointerDown = useCallback(function(gx, gy) {
    if (state.denoiseSelTool !== 'brush') return;
    var sW = state.sW, sH = state.sH;
    brushDragActiveRef.current = true;
    // Start from the existing mask (Array<0|1>) or a fresh one
    var existing = state.denoisePendingMask;
    var size = sW * sH;
    var base;
    if (existing && existing.length === size) {
      base = existing.slice();
    } else {
      base = new Array(size);
      for (var k = 0; k < size; k++) base[k] = 0;
    }
    brushMaskRef.current = base;
    _brushPaint(gx, gy, sW, sH);
  }, [state]);

  var handleDenoisePointerMove = useCallback(function(gx, gy) {
    if (!brushDragActiveRef.current || state.denoiseSelTool !== 'brush') return;
    _brushPaint(gx, gy, state.sW, state.sH);
  }, [state]);

  var handleDenoisePointerUp = useCallback(function() {
    if (!brushDragActiveRef.current) return;
    brushDragActiveRef.current = false;
    if (brushMaskRef.current) {
      state.setDenoisePendingMask(brushMaskRef.current);
      brushMaskRef.current = null;
    }
  }, [state]);

  function _brushPaint(gx, gy, sW, sH) {
    var pat = state.pat;
    var brushSize = state.denoiseBrushSize || 1;
    var mask = brushMaskRef.current;
    if (!pat || !mask) return;

    for (var dy = 0; dy < brushSize; dy++) {
      for (var dx = 0; dx < brushSize; dx++) {
        var x = gx + dx, y = gy + dy;
        if (x < 0 || x >= sW || y < 0 || y >= sH) continue;
        var idx = y * sW + x;
        var cell = pat[idx];
        if (!cell || cell.id === '__skip__' || cell.id === '__empty__') continue;
        mask[idx] = 1;
      }
    }
    // Batch React state update to one rAF per frame (mirrors CL-3 in cleanup mode).
    if (!brushRafPendingRef.current) {
      brushRafPendingRef.current = true;
      var _raf = (typeof window !== 'undefined' && window.requestAnimationFrame)
        ? window.requestAnimationFrame
        : function (fn) { return setTimeout(fn, 16); };
      _raf(function() {
        brushRafPendingRef.current = false;
        if (brushMaskRef.current) {
          state.setDenoisePendingMask(brushMaskRef.current.slice());
        }
      });
    }
  }

  // ── Apply denoise ─────────────────────────────────────────────────────────
  // Two-pass apply (atomically computed):
  //   Pass 1 — palette consolidation: remap cell IDs using mergeMap.
  //   Pass 2 — speckle/fringe replacement: neighbourVote for masked cells.
  //   One combined undo entry (one step to undo both passes).
  var applyDenoise = useCallback(function() {
    var pat  = state.pat;
    var sW   = state.sW;
    var sH   = state.sH;
    var cmap = state.cmap;
    var mask = state.denoisePendingMask;
    var report = state.denoisePreviewReport;

    var mergeMap = report && report.mergeMap ? report.mergeMap : {};
    var fringeReplacementMap = report && report.fringeReplacementMap ? report.fringeReplacementMap : {};

    // Determine if there is anything to do.
    var mergeIds = Object.keys(mergeMap);
    var hasMask = mask && mask.length > 0 && (function() {
      for (var i = 0; i < mask.length; i++) { if (mask[i]) return true; }
      return false;
    }());
    var hasMerge = mergeIds.length > 0;

    if (!pat || (!hasMask && !hasMerge)) return;

    // Immutable original snapshot for "old" values in the undo entry.
    var origPat = pat.slice();

    // Working copy: will be modified by Pass 1 so Pass 2 votes see merged IDs.
    var workingPat = pat.slice();

    var changes = []; // { idx, old }

    // ── Pass 1: palette remap ──────────────────────────────────────────────
    if (hasMerge) {
      // Build a fast lookup: id → representative cmap entry
      var repEntryCache = {};
      for (var mi = 0; mi < mergeIds.length; mi++) {
        var removedId = mergeIds[mi];
        var repId = mergeMap[removedId];
        if (!repEntryCache[repId]) repEntryCache[repId] = cmap ? cmap[repId] : null;
      }

      for (var pi = 0; pi < workingPat.length; pi++) {
        var cell = workingPat[pi];
        if (!cell || cell.id === '__skip__' || cell.id === '__empty__' || cell.type === 'blend') continue;
        var rep = mergeMap[cell.id];
        if (!rep) continue;
        var repEntry = repEntryCache[rep] || (cmap ? cmap[rep] : null);
        var newCell = { id: rep, type: cell.type, rgb: repEntry ? repEntry.rgb : cell.rgb };
        changes.push({ idx: pi, old: Object.assign({}, origPat[pi]) });
        workingPat[pi] = newCell;
      }
    }

    // ── Pass 2: speckle/fringe mask replacement ────────────────────────────
    if (hasMask) {
      // Build the set of indices to replace (mask cells not already changed
      // by palette remap only — both types use the same neighbourhood vote).
      var alreadyChanged = new Set();
      for (var ci = 0; ci < changes.length; ci++) alreadyChanged.add(changes[ci].idx);

      var maskSet = new Set();
      for (var si = 0; si < mask.length; si++) { if (mask[si]) maskSet.add(si); }

      // Multi-pass flood fill so interior cells of a large selected area are
      // replaced from the inside-out, not just at the border.
      //
      // Pass 1: vote for each masked cell using only unmasked neighbours.
      //   → Border cells resolve immediately; interior cells whose 8
      //     neighbours are all masked return null (unresolved).
      // Pass N+1: resolved cells from previous passes are removed from
      //   "stillPending" and treated as valid voters in the next round.
      //   The vote runs on a snapshot of workingPat updated with previous
      //   round results, so the replacement colour floods inward.
      //
      // The loop terminates when either no cells remain pending or no new
      // cells are resolved in a round (shouldn't happen with a fully
      // enclosed selection, but is a safety guard).

      var resolvedMap = {}; // idx → replacement cell
      var stillPending = new Set(maskSet);
      var voteSnap = workingPat.slice(); // snapshot updated each round

      var MAX_PASSES = sW + sH; // generous upper bound
      for (var pass = 0; pass < MAX_PASSES && stillPending.size > 0; pass++) {
        // pendingSet for this round = cells not yet resolved
        var resolvedThisRound = [];
        stillPending.forEach(function(idx) {
          var forcedFringeRepId = fringeReplacementMap[idx];
          var result = null;
          if (forcedFringeRepId) {
            var forcedEntry = cmap && cmap[forcedFringeRepId];
            var fallbackCell = voteSnap[idx];
            result = {
              id: forcedFringeRepId,
              type: (fallbackCell && fallbackCell.type) ? fallbackCell.type : 'solid',
              rgb: forcedEntry ? forcedEntry.rgb : (fallbackCell ? fallbackCell.rgb : null)
            };
          } else {
            result = window.cleanupNeighbourVote(
              idx, voteSnap, stillPending, sW, sH, DENOISE_WIDE_NEIGHBOURHOOD_RADIUS, { ignoreBlend: true }
            );
          }
          if (result !== null) {
            resolvedThisRound.push({ idx: idx, replacement: result });
          }
        });

        if (resolvedThisRound.length === 0) {
          // No progress — fully surrounded interior cells keep their colour.
          stillPending.forEach(function(idx) {
            resolvedMap[idx] = voteSnap[idx]; // keep original
          });
          break;
        }

        for (var rp = 0; rp < resolvedThisRound.length; rp++) {
          var item = resolvedThisRound[rp];
          resolvedMap[item.idx] = item.replacement;
          voteSnap[item.idx] = item.replacement; // make available as voter next pass
          stillPending.delete(item.idx);
        }
      }

      // Flush any remaining unresolved (keep original)
      stillPending.forEach(function(idx) {
        if (!resolvedMap.hasOwnProperty(idx)) resolvedMap[idx] = voteSnap[idx];
      });

      // Apply all resolved replacements and record changes
      var idxKeys = Object.keys(resolvedMap);
      for (var ri = 0; ri < idxKeys.length; ri++) {
        var ridx = Number(idxKeys[ri]);
        var rep = resolvedMap[ridx];
        if (!rep) continue;
        if (!alreadyChanged.has(ridx)) {
          changes.push({ idx: ridx, old: Object.assign({}, origPat[ridx]) });
        }
        workingPat[ridx] = rep;
      }
    }

    if (changes.length === 0) return;

    // ── Commit ────────────────────────────────────────────────────────────
    state.setPat(workingPat);

    // Rebuild palette
    var built = state.buildPaletteWithScratch(workingPat);
    var existingPal = state.pal || [];
    var changedIds = new Set(changes.map(function(ch) { return ch.old && ch.old.id; }));
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

    // Push single undo entry (one step for both passes — per Q2 decision).
    state.setEditHistory(function(prev) {
      var n = prev.concat([{ type: 'denoise', changes: changes }]);
      if (n.length > state.EDIT_HISTORY_MAX) n = n.slice(n.length - state.EDIT_HISTORY_MAX);
      return n;
    });
    state.setRedoHistory([]);

    // Mark pattern as edited
    if (state.setHasEdited) state.setHasEdited(true);

    // Clear pending mask and preview report
    state.setDenoisePendingMask(null);
    state.setDenoisePreviewReport(null);

    // Unused-colour notice (mirrors cleanup mode behaviour)
    if (zeroed.length && state.addToast) {
      zeroed.forEach(function(p) {
        var label = 'DMC ' + p.id + (p.name ? ' \xb7 ' + p.name : '');
        state.addToast(label + ' is no longer used \u2014 remove from palette?', {
          type: 'info',
          duration: 8000,
          action: {
            label: 'Remove',
            onClick: function() {
              var pid = p.id;
              state.setPal(function(prev) { return prev ? prev.filter(function(e) { return e.id !== pid; }) : prev; });
              state.setCmap(function(prev) { if (!prev) return prev; var n2 = Object.assign({}, prev); delete n2[pid]; return n2; });
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

  // ── Keep denoiseHandlersRef up to date ────────────────────────────────────
  if (state.denoiseHandlersRef) {
    state.denoiseHandlersRef.current = {
      handleDenoisePointerDown: handleDenoisePointerDown,
      handleDenoisePointerMove: handleDenoisePointerMove,
      handleDenoisePointerUp: handleDenoisePointerUp,
    };
  }

  // ── Exported overlay colour ────────────────────────────────────────────────
  var OVERLAY_COLOR = DENOISE_OVERLAY_COLOR;

  return {
    enterDenoise: enterDenoise,
    exitDenoise: exitDenoise,
    cancelDenoise: cancelDenoise,
    applyDenoise: applyDenoise,
    runDenoiseAutoDetect: runDenoiseAutoDetect,
    dismissDitherWarning: dismissDitherWarning,
    handleDenoisePointerDown: handleDenoisePointerDown,
    handleDenoisePointerMove: handleDenoisePointerMove,
    handleDenoisePointerUp: handleDenoisePointerUp,
    OVERLAY_COLOR: OVERLAY_COLOR,
    DENOISE_THRESHOLD_MAX_DE: DENOISE_THRESHOLD_MAX_DE,
    DENOISE_BRUSH_MIN: DENOISE_BRUSH_MIN,
    DENOISE_BRUSH_MAX: DENOISE_BRUSH_MAX,
  };
};

// Export constants for use in canvasRenderer.js and tests.
window.DENOISE_OVERLAY_COLOR = DENOISE_OVERLAY_COLOR;
window.DENOISE_THRESHOLD_MAX_DE = DENOISE_THRESHOLD_MAX_DE;
window.DENOISE_DITHER_WARN_RATIO = DENOISE_DITHER_WARN_RATIO;
