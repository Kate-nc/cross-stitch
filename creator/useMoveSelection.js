/* creator/useMoveSelection.js — Move-selection tool for the pattern editor.
   Provides:
     window.getSelectionBBox           — pure fn, exported for unit tests
     window.computeMovedPattern        — pure fn, exported for unit tests
     window.computeMovedPartialStitches— pure fn, exported for unit tests
     window.computeMovedBsLines        — pure fn, exported for unit tests
     window.computeMovedMask           — pure fn, exported for unit tests
     window.useMoveSelection           — React hook consumed by useCreatorState

   Behaviour contract (matches the implementation plan):
     • Overlap: overwrite — moved stitches replace destination cells.
     • Out-of-bounds: clip — cells that would leave the canvas are discarded.
     • Backstitches: move lines where BOTH endpoints are inside the selection
       bounding box (integer cell coords).  Clipped to canvas after shift.
     • Undo/redo: a single history entry of type "move" stores the delta
       changes array (compatible with the generic fallthrough in useEditHistory)
       plus prevMask/nextMask for selection-mask restoration.
*/

// ═══════════════════════════════════════════════════════════════════════════
// ── Pure logic helpers ────────────────────────────────────────────────────
// ═══════════════════════════════════════════════════════════════════════════

// Returns {minX, minY, maxX, maxY} covering all selected cells, or null if
// no cell is selected.
window.getSelectionBBox = function getSelectionBBox(selectionMask, sW, sH) {
  if (!selectionMask) return null;
  var minX = sW, minY = sH, maxX = -1, maxY = -1;
  for (var i = 0; i < selectionMask.length; i++) {
    if (!selectionMask[i]) continue;
    var x = i % sW, y = Math.floor(i / sW);
    if (x < minX) minX = x;
    if (y < minY) minY = y;
    if (x > maxX) maxX = x;
    if (y > maxY) maxY = y;
  }
  if (maxX === -1) return null;
  return { minX: minX, minY: minY, maxX: maxX, maxY: maxY };
};

// Computes the result of shifting all selected cells by (dx, dy).
// Returns { newPat, changes } where:
//   newPat  — copy of pat with sources cleared to __empty__ and destinations
//             overwritten with the moved cell values (OOB destinations dropped).
//   changes — [{idx, old}] for every cell that changed (used for undo).
// When dx === 0 && dy === 0, changes will be empty (no-op guard for callers).
window.computeMovedPattern = function computeMovedPattern(pat, selectionMask, dx, dy, sW, sH) {
  // Short-circuit: zero delta is a guaranteed no-op.
  if (dx === 0 && dy === 0) return { newPat: pat.slice(), changes: [] };
  var EMPTY = { id: '__empty__', rgb: [255, 255, 255] };
  var newPat = pat.slice();
  var changes = [];
  // Track which indices have already been recorded in changes so we never
  // store the same index twice (prevents stale old-value on overlap).
  var recorded = {};

  // Collect selected indices and snapshot source values BEFORE any mutation.
  var selected = [];
  var sourceValues = [];
  for (var i = 0; i < selectionMask.length; i++) {
    if (!selectionMask[i]) continue;
    selected.push(i);
    sourceValues.push(Object.assign({}, pat[i]));
  }

  // Phase 1: clear source cells (record old value for undo).
  for (var s = 0; s < selected.length; s++) {
    var srcIdx = selected[s];
    if (!recorded[srcIdx]) {
      changes.push({ idx: srcIdx, old: Object.assign({}, pat[srcIdx]) });
      recorded[srcIdx] = true;
    }
    newPat[srcIdx] = Object.assign({}, EMPTY);
  }

  // Phase 2: write moved values to destination cells.
  for (var d = 0; d < selected.length; d++) {
    var sx = selected[d] % sW, sy = Math.floor(selected[d] / sW);
    var nx = sx + dx, ny = sy + dy;
    if (nx < 0 || nx >= sW || ny < 0 || ny >= sH) continue; // clip OOB
    var dstIdx = ny * sW + nx;
    if (!recorded[dstIdx]) {
      // Capture the pre-move value at the destination for undo.
      changes.push({ idx: dstIdx, old: Object.assign({}, pat[dstIdx]) });
      recorded[dstIdx] = true;
    }
    newPat[dstIdx] = Object.assign({}, sourceValues[d]);
  }

  return { newPat: newPat, changes: changes };
};

// Computes the result of shifting partial stitches in selected cells by (dx, dy).
// Returns { newPs, psChanges } where:
//   newPs     — updated Map (same reference as ps if nothing selected).
//   psChanges — [{idx, old}] compatible with the useEditHistory generic loop.
window.computeMovedPartialStitches = function computeMovedPartialStitches(ps, selectionMask, dx, dy, sW, sH) {
  if (!ps || ps.size === 0) return { newPs: ps, psChanges: [] };
  var toMove = [];
  ps.forEach(function(val, idx) {
    if (selectionMask[idx]) toMove.push({ idx: idx, val: val });
  });
  if (!toMove.length) return { newPs: ps, psChanges: [] };

  var newPs = new Map(ps);
  var psChanges = [];

  // Snapshot source values and clear source entries.
  for (var i = 0; i < toMove.length; i++) {
    psChanges.push({ idx: toMove[i].idx, old: Object.assign({}, toMove[i].val) });
    newPs.delete(toMove[i].idx);
  }

  // Write to destination entries.
  for (var j = 0; j < toMove.length; j++) {
    var sx = toMove[j].idx % sW, sy = Math.floor(toMove[j].idx / sW);
    var nx = sx + dx, ny = sy + dy;
    if (nx < 0 || nx >= sW || ny < 0 || ny >= sH) continue; // clip OOB
    var dstIdx = ny * sW + nx;
    if (newPs.has(dstIdx) && !selectionMask[dstIdx]) {
      // Overwriting an unselected destination — record its old value for undo.
      psChanges.push({ idx: dstIdx, old: Object.assign({}, newPs.get(dstIdx)) });
    }
    newPs.set(dstIdx, Object.assign({}, toMove[j].val));
  }

  return { newPs: newPs, psChanges: psChanges };
};

// Moves backstitch lines whose BOTH endpoints lie within the selection bbox.
// Moved endpoints are clamped to canvas boundaries after shifting.
// Returns { newBsLines, didChange }.
window.computeMovedBsLines = function computeMovedBsLines(bsLines, bbox, dx, dy, sW, sH) {
  if (!bsLines || !bsLines.length || !bbox) return { newBsLines: bsLines, didChange: false };
  var didChange = false;
  var newBsLines = bsLines.map(function(ln) {
    // Backstitch coords are in grid units (can be fractional at half-cell edges).
    // We check using the integer bbox (maxX+1 / maxY+1 to include the right/bottom
    // edges of cells on the boundary row/col).
    var x1In = ln.x1 >= bbox.minX && ln.x1 <= bbox.maxX + 1;
    var y1In = ln.y1 >= bbox.minY && ln.y1 <= bbox.maxY + 1;
    var x2In = ln.x2 >= bbox.minX && ln.x2 <= bbox.maxX + 1;
    var y2In = ln.y2 >= bbox.minY && ln.y2 <= bbox.maxY + 1;
    if (!(x1In && y1In && x2In && y2In)) return ln;
    didChange = true;
    return Object.assign({}, ln, {
      x1: Math.max(0, Math.min(sW, ln.x1 + dx)),
      y1: Math.max(0, Math.min(sH, ln.y1 + dy)),
      x2: Math.max(0, Math.min(sW, ln.x2 + dx)),
      y2: Math.max(0, Math.min(sH, ln.y2 + dy)),
    });
  });
  return { newBsLines: newBsLines, didChange: didChange };
};

// Shifts the selection mask by (dx, dy). Bits that move OOB are dropped.
// Returns a new Uint8Array of the same length.
window.computeMovedMask = function computeMovedMask(selectionMask, dx, dy, sW, sH) {
  var newMask = new Uint8Array(selectionMask.length);
  for (var i = 0; i < selectionMask.length; i++) {
    if (!selectionMask[i]) continue;
    var sx = i % sW, sy = Math.floor(i / sW);
    var nx = sx + dx, ny = sy + dy;
    if (nx < 0 || nx >= sW || ny < 0 || ny >= sH) continue;
    newMask[ny * sW + nx] = 1;
  }
  return newMask;
};

// ─── Float-preview helpers ────────────────────────────────────────────────────
// These write the destination cells on top of the base pattern/ps WITHOUT
// clearing the source — used for the live "float" preview while the move tool
// is active.  The source is only cleared when the float is finalized
// (i.e. when the user deactivates the move tool).

// Copies selected cells to their (dx, dy) displaced position without erasing
// the originals.  Returns a modified copy of basePat.
window.computeFloatPattern = function computeFloatPattern(basePat, floatMask, dx, dy, sW, sH) {
  if (dx === 0 && dy === 0) return basePat.slice();
  var newPat = basePat.slice();
  for (var i = 0; i < floatMask.length; i++) {
    if (!floatMask[i]) continue;
    var sx = i % sW, sy = Math.floor(i / sW);
    var nx = sx + dx, ny = sy + dy;
    if (nx < 0 || nx >= sW || ny < 0 || ny >= sH) continue; // clip OOB
    newPat[ny * sW + nx] = Object.assign({}, basePat[i]);
  }
  return newPat;
};

// Copies selected partial-stitch entries to their displaced position without
// removing the originals.  Returns a new Map (or the original if nothing to do).
window.computeFloatPartialStitches = function computeFloatPartialStitches(basePs, floatMask, dx, dy, sW, sH) {
  if (!basePs || basePs.size === 0) return basePs;
  if (dx === 0 && dy === 0) return basePs;
  var moved = false;
  basePs.forEach(function(_, idx) { if (floatMask[idx]) moved = true; });
  if (!moved) return basePs;
  var newPs = new Map(basePs);
  basePs.forEach(function(val, idx) {
    if (!floatMask[idx]) return;
    var sx = idx % sW, sy = Math.floor(idx / sW);
    var nx = sx + dx, ny = sy + dy;
    if (nx < 0 || nx >= sW || ny < 0 || ny >= sH) return; // clip OOB
    newPs.set(ny * sW + nx, Object.assign({}, val));
  });
  return newPs;
};

// ═══════════════════════════════════════════════════════════════════════════
// ── React hook ────────────────────────────────────────────────────────────
// ═══════════════════════════════════════════════════════════════════════════

window.useMoveSelection = function useMoveSelection(state) {
  var useState = React.useState;
  var useRef = React.useRef;
  var useEffect = React.useEffect;

  var _ma = useState(false);
  var moveActive = _ma[0], setMoveActive = _ma[1];

  var _md = useState(null); // {dx, dy} | null
  var moveDelta = _md[0], setMoveDelta = _md[1];

  // floatActive — true while a float session is in progress.  A float session
  // begins on the first _applyMove call and ends when the tool is deactivated,
  // revertFloat() is called, or an undo discards the session.
  var _fa = useState(false);
  var floatActive = _fa[0], setFloatActive = _fa[1];

  // Refs — always hold the latest values; avoids stale-closure issues.
  var moveSnapshotRef  = useRef(null); // float-origin snapshot used by the ghost overlay
  var moveOriginRef    = useRef(null); // pointer position where the current drag started
  var floatSnapshotRef = useRef(null); // {pat,ps,bsLines,selectionMask} at session start
  var floatDeltaRef    = useRef(null); // {dx,dy} total displacement from float origin

  // ── Finalize on tool deactivation ──────────────────────────────────────────
  // When the user switches away from the move tool (including clicking the Move
  // button off) we commit the whole float session as a single history entry.
  useEffect(function() {
    if (state.activeTool !== 'move') {
      _finalizeFloat();
      setMoveActive(false);
      setMoveDelta(null);
      moveSnapshotRef.current = null;
      moveOriginRef.current = null;
    }
  }, [state.activeTool]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── _finalizeFloat ──────────────────────────────────────────────────────────
  // Commit the float session: clear source cells, write destination, push undo.
  // No-op if no float session is active.
  function _finalizeFloat() {
    if (!floatSnapshotRef.current || !floatDeltaRef.current) {
      floatSnapshotRef.current = null;
      floatDeltaRef.current = null;
      setFloatActive(false);
      return;
    }
    var snap = floatSnapshotRef.current;
    var dx = floatDeltaRef.current.dx, dy = floatDeltaRef.current.dy;
    floatSnapshotRef.current = null;
    floatDeltaRef.current = null;
    setFloatActive(false);

    if (dx === 0 && dy === 0) return; // nothing actually moved

    var sW = state.sW, sH = state.sH;
    var mask = snap.selectionMask;
    var bbox = window.getSelectionBBox(mask, sW, sH);

    var patResult = window.computeMovedPattern(snap.pat, mask, dx, dy, sW, sH);
    var psResult  = window.computeMovedPartialStitches(snap.ps, mask, dx, dy, sW, sH);
    var bsResult  = window.computeMovedBsLines(snap.bsLines, bbox, dx, dy, sW, sH);
    var nextMask  = window.computeMovedMask(mask, dx, dy, sW, sH);

    state.setPat(patResult.newPat);
    if (psResult.psChanges.length) state.setPartialStitches(psResult.newPs);
    if (bsResult.didChange) state.setBsLines(bsResult.newBsLines);
    state.setSelectionMask(nextMask);

    if (patResult.changes.length && state.buildPaletteWithScratch) {
      var r = state.buildPaletteWithScratch(patResult.newPat);
      state.setPal(r.pal);
      state.setCmap(r.cmap);
    }

    var EDIT_HISTORY_MAX = state.EDIT_HISTORY_MAX;
    state.setEditHistory(function(prev) {
      var entry = {
        type: 'move',
        changes: patResult.changes,
        psChanges: psResult.psChanges.length ? psResult.psChanges : undefined,
        bsLines: bsResult.didChange ? snap.bsLines : undefined,
        prevMask: mask,
        nextMask: nextMask,
      };
      var n = prev.concat([entry]);
      if (n.length > EDIT_HISTORY_MAX) n = n.slice(n.length - EDIT_HISTORY_MAX);
      return n;
    });
    state.setRedoHistory([]);
  }

  // ── revertFloat ─────────────────────────────────────────────────────────────
  // Discard the float session and restore the pattern to its pre-move state.
  // Triggered by ESC when not mid-drag.
  function revertFloat() {
    if (!floatSnapshotRef.current) return;
    var snap = floatSnapshotRef.current;
    floatSnapshotRef.current = null;
    floatDeltaRef.current = null;
    setFloatActive(false);
    setMoveActive(false);
    setMoveDelta(null);
    moveSnapshotRef.current = null;
    moveOriginRef.current = null;

    state.setPat(snap.pat);
    state.setPartialStitches(snap.ps);
    state.setBsLines(snap.bsLines);
    state.setSelectionMask(snap.selectionMask);
    if (state.buildPaletteWithScratch) {
      var rv = state.buildPaletteWithScratch(snap.pat);
      state.setPal(rv.pal);
      state.setCmap(rv.cmap);
    }
  }

  // ── startMove ───────────────────────────────────────────────────────────────
  // Begin a pointer drag.  The ghost overlay uses float-origin cells so it
  // correctly shows the original cells dimmed and the destination as a ghost.
  function startMove(gx, gy) {
    moveSnapshotRef.current = floatSnapshotRef.current || {
      pat: state.pat,
      ps: state.partialStitches,
      bsLines: state.bsLines,
      selectionMask: state.selectionMask,
    };
    moveOriginRef.current = { gx: gx, gy: gy };
    setMoveActive(true);
    // Start moveDelta at the current accumulated float delta so the ghost
    // appears at the current position immediately on drag start.
    var base = floatDeltaRef.current;
    setMoveDelta(base ? { dx: base.dx, dy: base.dy } : { dx: 0, dy: 0 });
  }

  // ── updateMove ──────────────────────────────────────────────────────────────
  // Called on every pointer move during a drag.  Computes the TOTAL delta from
  // the float origin (accumulated float delta + current drag displacement).
  function updateMove(gx, gy) {
    if (!moveOriginRef.current) return;
    var base = floatDeltaRef.current || { dx: 0, dy: 0 };
    setMoveDelta({
      dx: gx - moveOriginRef.current.gx + base.dx,
      dy: gy - moveOriginRef.current.gy + base.dy,
    });
  }

  // ── _applyFloat ─────────────────────────────────────────────────────────────
  // Live-update the pattern to show the float preview (source stays, dest is
  // a copy).  totalDx/totalDy are measured from the float-origin position.
  // History is NOT pushed — that happens in _finalizeFloat.
  function _applyFloat(totalDx, totalDy) {
    // First call in this tool activation — create the float snapshot.
    if (!floatSnapshotRef.current) {
      floatSnapshotRef.current = {
        pat: state.pat,
        ps: state.partialStitches,
        bsLines: state.bsLines,
        selectionMask: state.selectionMask,
      };
      setFloatActive(true);
    }

    var snap = floatSnapshotRef.current;
    var mask = snap.selectionMask;
    if (!mask) { _clearDragState(); return; }

    if (totalDx === 0 && totalDy === 0) { _clearDragState(); return; }

    var sW = state.sW, sH = state.sH;
    var bbox = window.getSelectionBBox(mask, sW, sH);

    // Float: write destination cells WITHOUT clearing source.
    var newPat = window.computeFloatPattern(snap.pat, mask, totalDx, totalDy, sW, sH);
    var newPs  = window.computeFloatPartialStitches(snap.ps, mask, totalDx, totalDy, sW, sH);
    // Backstitches are moved (keeping source would create confusing duplicate lines).
    var bsResult = window.computeMovedBsLines(snap.bsLines, bbox, totalDx, totalDy, sW, sH);
    var nextMask = window.computeMovedMask(mask, totalDx, totalDy, sW, sH);

    state.setPat(newPat);
    if (newPs !== snap.ps) state.setPartialStitches(newPs);
    if (bsResult.didChange) state.setBsLines(bsResult.newBsLines);
    state.setSelectionMask(nextMask);

    if (state.buildPaletteWithScratch) {
      var r = state.buildPaletteWithScratch(newPat);
      state.setPal(r.pal);
      state.setCmap(r.cmap);
    }

    floatDeltaRef.current = { dx: totalDx, dy: totalDy };
    _clearDragState();
    // History deferred to _finalizeFloat.
  }

  function _clearDragState() {
    setMoveActive(false);
    setMoveDelta(null);
    moveSnapshotRef.current = null;
    moveOriginRef.current = null;
  }

  // ── commitMove ──────────────────────────────────────────────────────────────
  // Called on pointer-up: commit the current drag to the float preview.
  // Source cells remain; history is NOT pushed yet.
  function commitMove() {
    if (!moveActive || !moveDelta) return;
    _applyFloat(moveDelta.dx, moveDelta.dy);
  }

  // ── cancelMove ──────────────────────────────────────────────────────────────
  // Cancel the current drag only (does NOT revert the float session).
  // Call revertFloat() to undo all moves in the current session.
  function cancelMove() {
    setMoveActive(false);
    setMoveDelta(null);
    moveSnapshotRef.current = null;
    moveOriginRef.current = null;
  }

  // ── nudgeMove ───────────────────────────────────────────────────────────────
  // Arrow-key nudge: accumulates onto the float delta, no history yet.
  function nudgeMove(dx, dy) {
    if (!state.selectionMask) return;
    var base = floatDeltaRef.current || { dx: 0, dy: 0 };
    _applyFloat(base.dx + dx, base.dy + dy);
  }

  return {
    moveActive: moveActive,
    moveDelta: moveDelta,
    floatActive: floatActive,
    moveSnapshotRef: moveSnapshotRef,
    startMove: startMove,
    updateMove: updateMove,
    commitMove: commitMove,
    cancelMove: cancelMove,
    nudgeMove: nudgeMove,
    revertFloat: revertFloat,
  };
};
