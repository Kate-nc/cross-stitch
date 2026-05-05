/* creator/useEditHistory.js — Undo/redo for pixel/partial-stitch/backstitch edits.
   Uses a delta (change-list) approach: each history entry stores the OLD values
   of changed cells so they can be restored without keeping full snapshots.
   Expects a `state` object returned from useCreatorState.

   Known entry shapes (DEFECT-012 — explicit catalogue so future contributors
   don't have to reverse-engineer the branches):
     - { type: "add_colour", addedEntry, changes }
         Specific branch in undoEdit/redoEdit. Pops/pushes a colour on the
         scratch palette and rebuilds pal/cmap.
     - { type: "remove_unused_colours", removedFromPal, removedFromScratch }
         Specific branch in undoEdit/redoEdit. Restores palette entries.
     - { type: "colourReplace", changes }    // British spelling — see DEFECT-005.
     - { type: "paint" | "erase" | "fill" | "rect" | "lasso" | undefined,
         changes, psChanges?, bsLines? }
         Generic fallthrough: handled by the same `last.changes` loop. The
         `type` string is *preserved* on the redo stack but never inspected —
         any new edit type that produces a `changes` array will Just Work
         without touching this file. New types that need bespoke palette
         handling must add their own branch above the generic loop.
*/

window.useEditHistory = function useEditHistory(state) {
  function undoEdit() {
    var editHistory = state.editHistory;
    var pat = state.pat;
    var partialStitches = state.partialStitches;
    var bsLines = state.bsLines;
    var EDIT_HISTORY_MAX = state.EDIT_HISTORY_MAX;
    var buildPaletteWithScratch = state.buildPaletteWithScratch;

    if (!editHistory.length) return;
    var last = editHistory[editHistory.length - 1];

    // Handle add_colour undo: remove the added colour from scratchPalette, pal, cmap
    if (last.type === "add_colour" && last.addedEntry) {
      var aid = last.addedEntry.id;
      var removedWasSelected = state.selectedColorId === aid;
      var nextScratchPalette = Array.isArray(state.scratchPalette) ? state.scratchPalette.filter(function(p) { return p.id !== aid; }) : null;
      var nextPal = Array.isArray(state.pal) ? state.pal.filter(function(p) { return p.id !== aid; }) : null;
      var fallbackSelectedColorId = null;
      if (removedWasSelected) {
        if (nextScratchPalette && nextScratchPalette.length) fallbackSelectedColorId = nextScratchPalette[nextScratchPalette.length - 1].id;
        else if (nextPal && nextPal.length) fallbackSelectedColorId = nextPal[0].id;
      }
      state.setScratchPalette(function(prev) { return prev.filter(function(p) { return p.id !== aid; }); });
      state.setPal(function(prev) { return prev ? prev.filter(function(p) { return p.id !== aid; }) : prev; });
      state.setCmap(function(prev) { if (!prev) return prev; var n = Object.assign({}, prev); delete n[aid]; return n; });
      if (removedWasSelected && state.setSelectedColorId) state.setSelectedColorId(fallbackSelectedColorId);
      state.setEditHistory(function(prev) { return prev.slice(0, -1); });
      state.setRedoHistory(function(prev) {
        var n = prev.concat([{ type: "add_colour", changes: [], addedEntry: last.addedEntry }]);
        if (n.length > EDIT_HISTORY_MAX) n = n.slice(n.length - EDIT_HISTORY_MAX);
        return n;
      });
      if (state.addToast) state.addToast("Undo: removed added colour " + aid, {type:"info", duration:1500});
      return;
    }

    // Handle remove_unused_colours undo: restore the removed colours
    if (last.type === "remove_unused_colours") {
      var restoredFromPal = last.removedFromPal || [];
      var restoredFromScratch = last.removedFromScratch || [];
      state.setPal(function(prev) {
        if (!prev) return restoredFromPal.slice();
        var existingIds = new Set(prev.map(function(p) { return p.id; }));
        return prev.concat(restoredFromPal.filter(function(p) { return !existingIds.has(p.id); }));
      });
      state.setScratchPalette(function(prev) {
        var existingIds = new Set(prev.map(function(p) { return p.id; }));
        return prev.concat(restoredFromScratch.filter(function(p) { return !existingIds.has(p.id); }));
      });
      state.setCmap(function(prev) {
        if (!prev) return prev;
        var n = Object.assign({}, prev);
        restoredFromPal.forEach(function(p) { n[p.id] = p; });
        return n;
      });
      state.setEditHistory(function(prev) { return prev.slice(0, -1); });
      state.setRedoHistory(function(prev) {
        var n = prev.concat([{ type: "remove_unused_colours", removedFromPal: restoredFromPal, removedFromScratch: restoredFromScratch }]);
        if (n.length > EDIT_HISTORY_MAX) n = n.slice(n.length - EDIT_HISTORY_MAX);
        return n;
      });
      if (state.addToast) state.addToast("Undo: restored " + restoredFromPal.length + " colour" + (restoredFromPal.length !== 1 ? "s" : "") + " to palette", {type:"info", duration:1500});
      return;
    }

    var np = pat.slice();
    var redoChanges = last.changes.map(function(c) { return { idx: c.idx, old: Object.assign({}, np[c.idx]) }; });
    last.changes.forEach(function(c) { np[c.idx] = Object.assign({}, c.old); });
    state.setPat(np);

    var redoPsChanges = null;
    if (last.psChanges) {
      var nm = new Map(partialStitches);
      redoPsChanges = last.psChanges.map(function(c) { return { idx: c.idx, old: nm.has(c.idx) ? Object.assign({}, nm.get(c.idx)) : null }; });
      last.psChanges.forEach(function(c) { if (c.old) nm.set(c.idx, c.old); else nm.delete(c.idx); });
      state.setPartialStitches(nm);
    }

    var redoBsLines = null;
    if (last.bsLines) {
      redoBsLines = bsLines.slice();
      state.setBsLines(last.bsLines);
    }

    state.setEditHistory(function(prev) { return prev.slice(0, -1); });
    state.setRedoHistory(function(prev) {
      var n = prev.concat([{ type: last.type, changes: redoChanges, psChanges: redoPsChanges, bsLines: redoBsLines }]);
      if (n.length > EDIT_HISTORY_MAX) n = n.slice(n.length - EDIT_HISTORY_MAX);
      return n;
    });
    var result = buildPaletteWithScratch(np);
    state.setPal(result.pal); state.setCmap(result.cmap);
    if (state.addToast) state.addToast("Undo: reverted " + last.changes.length + " cell" + (last.changes.length !== 1 ? "s" : ""), {type:"info", duration:1500});
  }

  function redoEdit() {
    var redoHistory = state.redoHistory;
    var pat = state.pat;
    var partialStitches = state.partialStitches;
    var bsLines = state.bsLines;
    var EDIT_HISTORY_MAX = state.EDIT_HISTORY_MAX;
    var buildPaletteWithScratch = state.buildPaletteWithScratch;

    if (!redoHistory.length) return;
    var last = redoHistory[redoHistory.length - 1];

    // Handle add_colour redo: re-add the colour
    if (last.type === "add_colour" && last.addedEntry) {
      var entry = last.addedEntry;
      state.setScratchPalette(function(prev) { return prev.filter(function(p) { return p.id !== entry.id; }).concat([entry]); });
      state.setPal(function(prev) { return prev ? prev.concat([entry]) : [entry]; });
      state.setCmap(function(prev) { return prev ? Object.assign({}, prev, { [entry.id]: entry }) : { [entry.id]: entry }; });
      state.setRedoHistory(function(prev) { return prev.slice(0, -1); });
      state.setEditHistory(function(prev) {
        var n = prev.concat([{ type: "add_colour", changes: [], addedEntry: entry }]);
        if (n.length > EDIT_HISTORY_MAX) n = n.slice(n.length - EDIT_HISTORY_MAX);
        return n;
      });
      if (state.addToast) state.addToast("Redo: re-added colour " + entry.id, {type:"info", duration:1500});
      return;
    }

    // Handle remove_unused_colours redo: re-remove the colours
    if (last.type === "remove_unused_colours") {
      var toRemove = last.removedFromPal || [];
      var toRemoveScratch = last.removedFromScratch || [];
      var toRemoveIds = new Set(toRemove.map(function(p) { return p.id; }));
      state.setPal(function(prev) { return prev ? prev.filter(function(p) { return !toRemoveIds.has(p.id); }) : prev; });
      state.setScratchPalette(function(prev) { return prev.filter(function(p) { return !toRemoveIds.has(p.id); }); });
      state.setCmap(function(prev) { if (!prev) return prev; var n = Object.assign({}, prev); toRemoveIds.forEach(function(id) { delete n[id]; }); return n; });
      state.setRedoHistory(function(prev) { return prev.slice(0, -1); });
      state.setEditHistory(function(prev) {
        var n = prev.concat([{ type: "remove_unused_colours", removedFromPal: toRemove, removedFromScratch: toRemoveScratch }]);
        if (n.length > EDIT_HISTORY_MAX) n = n.slice(n.length - EDIT_HISTORY_MAX);
        return n;
      });
      if (state.addToast) state.addToast("Redo: removed " + toRemove.length + " unused colour" + (toRemove.length !== 1 ? "s" : ""), {type:"info", duration:1500});
      return;
    }

    var np = pat.slice();
    var undoChanges = last.changes.map(function(c) { return { idx: c.idx, old: Object.assign({}, np[c.idx]) }; });
    last.changes.forEach(function(c) { np[c.idx] = Object.assign({}, c.old); });
    state.setPat(np);

    var undoPsChanges = null;
    if (last.psChanges) {
      var nm = new Map(partialStitches);
      undoPsChanges = last.psChanges.map(function(c) { return { idx: c.idx, old: nm.has(c.idx) ? Object.assign({}, nm.get(c.idx)) : null }; });
      last.psChanges.forEach(function(c) { if (c.old) nm.set(c.idx, c.old); else nm.delete(c.idx); });
      state.setPartialStitches(nm);
    }

    var undoBsLines = null;
    if (last.bsLines) {
      undoBsLines = bsLines.slice();
      state.setBsLines(last.bsLines);
    }

    state.setRedoHistory(function(prev) { return prev.slice(0, -1); });
    state.setEditHistory(function(prev) {
      var n = prev.concat([{ type: last.type, changes: undoChanges, psChanges: undoPsChanges, bsLines: undoBsLines }]);
      if (n.length > EDIT_HISTORY_MAX) n = n.slice(n.length - EDIT_HISTORY_MAX);
      return n;
    });
    var result = buildPaletteWithScratch(np);
    state.setPal(result.pal); state.setCmap(result.cmap);
    if (state.addToast) state.addToast("Redo: restored " + last.changes.length + " cell" + (last.changes.length !== 1 ? "s" : ""), {type:"info", duration:1500});
  }

  return { undoEdit: undoEdit, redoEdit: redoEdit };
};
