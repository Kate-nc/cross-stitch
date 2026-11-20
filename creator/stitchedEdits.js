/* creator/stitchedEdits.js ─────────────────────────────────────────────────
   Pure helpers that keep stitching progress (`done`) consistent when the
   pattern is edited in the Creator. No DOM, no React.

   Exposed as window.StitchedEdits:
     cellChanged(oldCell, newCell)
       → true when the colour or stitch type differs (a symbol-only change
         is not a change: the stitch is still the same thread).
     stitchedResets(done, changes, newPat)
       → [idx] of cells that were marked done and whose colour or type the
         edit changes. `changes` is the history shape [{ idx, old }].
         Returns [] when there is nothing to reset.
     clearDone(done, idxs)  → new Uint8Array with those cells not done.
     restoreDone(done, idxs) → new Uint8Array with those cells done again.
     resetMessage(n)  → the toast text for n reset cells.
     markedCount(done) → how many cells are marked done.
     markedWith(done, pat, ids, mask) → how many marked cells use one of the
         thread ids (inside mask, when given).
     actionReach(t) → one sentence on how far the chosen tool reaches (one
         stitch, a brush's worth, every joined stitch of a colour, every
         stitch of a colour, or the selection), or null. Stage 3: said
         beside the progress note so nobody is surprised which marks clear.
   window.creatorActionReach(cv, ctx, stitchedView) reads the Creator's
   contexts into actionReach.
   ────────────────────────────────────────────────────────────────────────── */

window.StitchedEdits = (function() {
  function isBlank(cell) {
    return !cell || cell.id === "__skip__" || cell.id === "__empty__";
  }

  function cellChanged(a, b) {
    if (isBlank(a) && isBlank(b)) return false;
    if (isBlank(a) !== isBlank(b)) return true;
    return a.id !== b.id || (a.type || "solid") !== (b.type || "solid");
  }

  function stitchedResets(done, changes, newPat) {
    var out = [];
    if (!done || !changes || !changes.length || !newPat) return out;
    var seen = {};
    for (var i = 0; i < changes.length; i++) {
      var c = changes[i], idx = c && c.idx;
      if (idx == null || seen[idx] || idx < 0 || idx >= done.length || done[idx] !== 1) continue;
      seen[idx] = true;
      if (cellChanged(c.old, newPat[idx])) out.push(idx);
    }
    return out;
  }

  function clearDone(done, idxs) {
    var n = new Uint8Array(done);
    for (var i = 0; i < idxs.length; i++) n[idxs[i]] = 0;
    return n;
  }

  function restoreDone(done, idxs) {
    var n = new Uint8Array(done);
    for (var i = 0; i < idxs.length; i++) n[idxs[i]] = 1;
    return n;
  }

  function resetMessage(n) {
    return n.toLocaleString() + " stitched cell" + (n === 1 ? "" : "s") + " reset to not done.";
  }

  function markedCount(done) {
    var n = 0;
    if (!done) return 0;
    for (var i = 0; i < done.length; i++) if (done[i] === 1) n++;
    return n;
  }

  function markedWith(done, pat, ids, mask) {
    var n = 0;
    if (!done || !pat || !ids || !ids.length) return 0;
    var want = {};
    for (var k = 0; k < ids.length; k++) want[ids[k]] = true;
    for (var i = 0; i < pat.length; i++) {
      if (done[i] !== 1 || !pat[i] || !want[pat[i].id]) continue;
      if (mask && !mask[i]) continue;
      n++;
    }
    return n;
  }

  function brushReach(verb, size) {
    size = Math.max(1, Math.round(Number(size) || 1));
    if (size === 1) return verb + " one stitch at a time.";
    return verb + " up to " + (size * size).toLocaleString() + " stitches at a time (a " + size + " \u00D7 " + size + " brush).";
  }

  // t: { drawMode, activeTool, brushMode, stitchType, brushSize, partialStitchTool,
  //      hasSelection, selectionCount, mirrorOn, stitchedView }
  function actionReach(t) {
    if (!t || t.stitchedView || t.drawMode === false) return null;
    var tool = t.activeTool;
    if (t.hasSelection && (t.selectionCount || 0) > 0) {
      var n = t.selectionCount;
      return "Delete, Move and the Selection menu change only the " + n.toLocaleString() + " selected stitch" + (n === 1 ? "" : "es") + ".";
    }
    if (tool === "colourReplace") return "Replace colour changes every stitch of the colour you click.";
    if (tool === "fill") return "Fill changes every joined stitch of the colour you click.";
    if (t.stitchType === "erase" || tool === "eraseAll") return brushReach("Erase clears", t.brushSize);
    if (tool === "line" || tool === "rect" || tool === "ellipse") return "A shape changes only the stitches it covers.";
    if (tool === "text") return "Text changes only the stitches its letters cover.";
    if (tool === "paint" || (t.partialStitchTool && t.partialStitchTool !== "erase")) {
      return brushReach("Paint changes", t.brushSize) + (t.mirrorOn ? " Mirror drawing changes the mirrored stitches too." : "");
    }
    return null;
  }

  return { cellChanged: cellChanged, stitchedResets: stitchedResets, clearDone: clearDone,
    restoreDone: restoreDone, resetMessage: resetMessage, markedCount: markedCount,
    markedWith: markedWith, actionReach: actionReach };
})();

window.creatorActionReach = function(cv, ctx, stitchedView) {
  return window.StitchedEdits.actionReach({
    drawMode: cv.drawMode, activeTool: cv.activeTool, brushMode: cv.brushMode, stitchType: cv.stitchType,
    brushSize: cv.brushSize, partialStitchTool: ctx && ctx.partialStitchTool,
    hasSelection: !!cv.hasSelection, selectionCount: cv.selectionCount || 0,
    mirrorOn: !!(cv.mirror && cv.mirror.on), stitchedView: !!stitchedView
  });
};
