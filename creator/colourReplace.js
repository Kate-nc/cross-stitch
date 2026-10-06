/* creator/colourReplace.js ────────────────────────────────────────────────
   Pure helpers behind the Replace colour modal (ColourReplaceModal.js) and
   useMagicWand.applyGlobalColourReplacement. No DOM, no React.

   Exposed as window.ColourReplace:
     countMatches(pat, srcId, mask)
       → { total, inSelection }   inSelection is null when mask is falsy.
     replaceInPattern(pat, srcId, dstEntry, mask)
       → { pat: newPat, changes: [{ idx, old }] }
         mask (Uint8Array | null) limits the change to selected cells.
   ────────────────────────────────────────────────────────────────────────── */

window.ColourReplace = (function() {
  function isStitch(cell) {
    return !!cell && cell.id !== '__skip__' && cell.id !== '__empty__';
  }

  function countMatches(pat, srcId, mask) {
    var total = 0, inSel = 0;
    if (!pat || !srcId) return { total: 0, inSelection: mask ? 0 : null };
    for (var i = 0; i < pat.length; i++) {
      var cell = pat[i];
      if (!isStitch(cell) || cell.id !== srcId) continue;
      total++;
      if (mask && mask[i]) inSel++;
    }
    return { total: total, inSelection: mask ? inSel : null };
  }

  function replaceInPattern(pat, srcId, dstEntry, mask) {
    var np = pat.slice();
    var changes = [];
    if (!srcId || !dstEntry || srcId === dstEntry.id) return { pat: np, changes: changes };
    for (var i = 0; i < np.length; i++) {
      if (mask && !mask[i]) continue;
      var cell = np[i];
      if (!isStitch(cell) || cell.id !== srcId) continue;
      changes.push({ idx: i, old: Object.assign({}, cell) });
      np[i] = Object.assign({}, dstEntry);
    }
    return { pat: np, changes: changes };
  }

  return {
    countMatches: countMatches,
    replaceInPattern: replaceInPattern
  };
})();
