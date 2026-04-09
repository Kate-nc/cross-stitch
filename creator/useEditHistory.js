/* creator/useEditHistory.js — Undo/redo for pixel/half-stitch/backstitch edits.
   Uses a delta (change-list) approach: each history entry stores the OLD values
   of changed cells so they can be restored without keeping full snapshots.
   Expects a `state` object returned from useCreatorState. */

window.useEditHistory = function useEditHistory(state) {
  function undoEdit() {
    var editHistory = state.editHistory;
    var pat = state.pat;
    var halfStitches = state.halfStitches;
    var bsLines = state.bsLines;
    var EDIT_HISTORY_MAX = state.EDIT_HISTORY_MAX;
    var buildPaletteWithScratch = state.buildPaletteWithScratch;

    if (!editHistory.length) return;
    var last = editHistory[editHistory.length - 1];
    var np = pat.slice();
    var redoChanges = last.changes.map(function(c) { return { idx: c.idx, old: Object.assign({}, np[c.idx]) }; });
    last.changes.forEach(function(c) { np[c.idx] = Object.assign({}, c.old); });
    state.setPat(np);

    var redoHsChanges = null;
    if (last.hsChanges) {
      var nm = new Map(halfStitches);
      redoHsChanges = last.hsChanges.map(function(c) { return { idx: c.idx, old: nm.has(c.idx) ? Object.assign({}, nm.get(c.idx)) : null }; });
      last.hsChanges.forEach(function(c) { if (c.old) nm.set(c.idx, c.old); else nm.delete(c.idx); });
      state.setHalfStitches(nm);
    }

    var redoBsLines = null;
    if (last.bsLines) {
      redoBsLines = bsLines.slice();
      state.setBsLines(last.bsLines);
    }

    state.setEditHistory(function(prev) { return prev.slice(0, -1); });
    state.setRedoHistory(function(prev) {
      var n = prev.concat([{ type: last.type, changes: redoChanges, hsChanges: redoHsChanges, bsLines: redoBsLines }]);
      if (n.length > EDIT_HISTORY_MAX) n = n.slice(n.length - EDIT_HISTORY_MAX);
      return n;
    });
    var result = buildPaletteWithScratch(np);
    state.setPal(result.pal); state.setCmap(result.cmap);
  }

  function redoEdit() {
    var redoHistory = state.redoHistory;
    var pat = state.pat;
    var halfStitches = state.halfStitches;
    var bsLines = state.bsLines;
    var EDIT_HISTORY_MAX = state.EDIT_HISTORY_MAX;
    var buildPaletteWithScratch = state.buildPaletteWithScratch;

    if (!redoHistory.length) return;
    var last = redoHistory[redoHistory.length - 1];
    var np = pat.slice();
    var undoChanges = last.changes.map(function(c) { return { idx: c.idx, old: Object.assign({}, np[c.idx]) }; });
    last.changes.forEach(function(c) { np[c.idx] = Object.assign({}, c.old); });
    state.setPat(np);

    var undoHsChanges = null;
    if (last.hsChanges) {
      var nm = new Map(halfStitches);
      undoHsChanges = last.hsChanges.map(function(c) { return { idx: c.idx, old: nm.has(c.idx) ? Object.assign({}, nm.get(c.idx)) : null }; });
      last.hsChanges.forEach(function(c) { if (c.old) nm.set(c.idx, c.old); else nm.delete(c.idx); });
      state.setHalfStitches(nm);
    }

    var undoBsLines = null;
    if (last.bsLines) {
      undoBsLines = bsLines.slice();
      state.setBsLines(last.bsLines);
    }

    state.setRedoHistory(function(prev) { return prev.slice(0, -1); });
    state.setEditHistory(function(prev) {
      var n = prev.concat([{ type: last.type, changes: undoChanges, hsChanges: undoHsChanges, bsLines: undoBsLines }]);
      if (n.length > EDIT_HISTORY_MAX) n = n.slice(n.length - EDIT_HISTORY_MAX);
      return n;
    });
    var result = buildPaletteWithScratch(np);
    state.setPal(result.pal); state.setCmap(result.cmap);
  }

  return { undoEdit: undoEdit, redoEdit: redoEdit };
};
