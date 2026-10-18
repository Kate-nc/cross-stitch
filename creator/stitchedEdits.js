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

  return { cellChanged: cellChanged, stitchedResets: stitchedResets, clearDone: clearDone,
    restoreDone: restoreDone, resetMessage: resetMessage };
})();
