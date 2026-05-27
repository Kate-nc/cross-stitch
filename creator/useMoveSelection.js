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

  // Refs so event handlers always see fresh values without stale closures.
  var moveSnapshotRef = useRef(null); // {pat, ps, bsLines, selectionMask}
  var moveOriginRef = useRef(null);   // {gx, gy}

  // Cancel any in-flight move if the user switches away from the move tool.
  useEffect(function() {
    if (state.activeTool !== 'move' && moveActive) {
      setMoveActive(false);
      setMoveDelta(null);
      moveSnapshotRef.current = null;
      moveOriginRef.current = null;
    }
  }, [state.activeTool]); // eslint-disable-line react-hooks/exhaustive-deps

  // Start a drag. Snapshots current state so the ghost overlay can be drawn
  // against the pre-move values during the drag.
  function startMove(gx, gy) {
    moveSnapshotRef.current = {
      pat: state.pat,
      ps: state.partialStitches,
      bsLines: state.bsLines,
      selectionMask: state.selectionMask,
    };
    moveOriginRef.current = { gx: gx, gy: gy };
    setMoveActive(true);
    setMoveDelta({ dx: 0, dy: 0 });
  }

  // Update the live delta during drag.
  function updateMove(gx, gy) {
    if (!moveOriginRef.current) return;
    setMoveDelta({
      dx: gx - moveOriginRef.current.gx,
      dy: gy - moveOriginRef.current.gy,
    });
  }

  // Core apply logic — shared by commitMove and nudgeMove.
  function _applyMove(dx, dy) {
    var snap = moveSnapshotRef.current;
    if (!snap) return;
    var mask = snap.selectionMask;
    if (!mask) return;

    // No-op guard: nothing to commit.
    if (dx === 0 && dy === 0) {
      setMoveActive(false);
      setMoveDelta(null);
      moveSnapshotRef.current = null;
      moveOriginRef.current = null;
      return;
    }

    var sW = state.sW, sH = state.sH;
    var bbox = window.getSelectionBBox(mask, sW, sH);

    var patResult = window.computeMovedPattern(snap.pat, mask, dx, dy, sW, sH);
    var psResult  = window.computeMovedPartialStitches(snap.ps, mask, dx, dy, sW, sH);
    var bsResult  = window.computeMovedBsLines(snap.bsLines, bbox, dx, dy, sW, sH);
    var nextMask  = window.computeMovedMask(mask, dx, dy, sW, sH);

    // Apply state updates.
    state.setPat(patResult.newPat);
    if (psResult.psChanges.length) state.setPartialStitches(psResult.newPs);
    if (bsResult.didChange) state.setBsLines(bsResult.newBsLines);
    state.setSelectionMask(nextMask);

    // Rebuild palette if any cell values changed.
    if (patResult.changes.length && state.buildPaletteWithScratch) {
      var r = state.buildPaletteWithScratch(patResult.newPat);
      state.setPal(r.pal);
      state.setCmap(r.cmap);
    }

    // Push history entry.  The "move" type carries prevMask/nextMask so that
    // useEditHistory can restore the selection mask on undo/redo.
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

    // Clear move state.
    setMoveActive(false);
    setMoveDelta(null);
    moveSnapshotRef.current = null;
    moveOriginRef.current = null;
  }

  // Commit the current drag delta as a history entry.
  function commitMove() {
    if (!moveActive || !moveDelta) return;
    _applyMove(moveDelta.dx, moveDelta.dy);
  }

  // Cancel the current drag without committing (e.g. Escape key).
  function cancelMove() {
    setMoveActive(false);
    setMoveDelta(null);
    moveSnapshotRef.current = null;
    moveOriginRef.current = null;
  }

  // Atomic one-cell move — used by arrow-key nudging.  Each nudge is its own
  // undoable step; uses the current live state as the snapshot.
  function nudgeMove(dx, dy) {
    if (!state.selectionMask) return;
    moveSnapshotRef.current = {
      pat: state.pat,
      ps: state.partialStitches,
      bsLines: state.bsLines,
      selectionMask: state.selectionMask,
    };
    moveOriginRef.current = { gx: 0, gy: 0 };
    _applyMove(dx, dy);
  }

  return {
    moveActive: moveActive,
    moveDelta: moveDelta,
    moveSnapshotRef: moveSnapshotRef,
    startMove: startMove,
    updateMove: updateMove,
    commitMove: commitMove,
    cancelMove: cancelMove,
    nudgeMove: nudgeMove,
  };
};
