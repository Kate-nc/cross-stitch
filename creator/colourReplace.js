/* creator/colourReplace.js ────────────────────────────────────────────────
   Pure helpers behind the Replace colour modal (ColourReplaceModal.js) and
   useMagicWand.applyGlobalColourReplacement. No DOM, no React.

   Exposed as window.ColourReplace:
     countMatches(pat, srcId, mask)
       → { total, inSelection }   inSelection is null when mask is falsy.
     replaceInPattern(pat, srcId, dstEntry, mask)
       → { pat: newPat, changes: [{ idx, old }] }
         mask (Uint8Array | null) limits the change to selected cells.
     rankBySimilarity(srcRgb, threads, opts)
       → [{ thread, dE }] sorted closest first.
         opts: { limit, excludeIds (Set|array), labOf(rgb), distance(labA, labB) }
         labOf/distance default to the globals rgbToLab / dE00 (dmc-data.js).
     similarityLabel(dE) → 'Near-identical' | 'Very close' | 'Close' |
                           'Similar' | null
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

  function defaultLabOf(rgb) {
    if (typeof rgbToLab === 'function') return rgbToLab(rgb[0], rgb[1], rgb[2]);
    return rgb;
  }
  function defaultDistance(a, b) {
    if (typeof dE00 === 'function') return dE00(a, b);
    return Math.sqrt((a[0] - b[0]) * (a[0] - b[0]) + (a[1] - b[1]) * (a[1] - b[1]) + (a[2] - b[2]) * (a[2] - b[2]));
  }

  function rankBySimilarity(srcRgb, threads, opts) {
    opts = opts || {};
    if (!srcRgb || !threads || !threads.length) return [];
    var labOf = opts.labOf || defaultLabOf;
    var distance = opts.distance || defaultDistance;
    var exclude = opts.excludeIds instanceof Set ? opts.excludeIds : new Set(opts.excludeIds || []);
    var srcLab = labOf(srcRgb);
    var out = [];
    for (var i = 0; i < threads.length; i++) {
      var t = threads[i];
      if (!t || !t.rgb || exclude.has(t.id)) continue;
      out.push({ thread: t, dE: distance(srcLab, labOf(t.rgb)) });
    }
    out.sort(function(a, b) { return a.dE - b.dE; });
    return opts.limit > 0 ? out.slice(0, opts.limit) : out;
  }

  // Plain-language bands for CIEDE2000 distances (~2.3 is a just-noticeable
  // difference). Beyond "Similar" the label adds nothing, so return null.
  function similarityLabel(dE) {
    if (dE == null || isNaN(dE)) return null;
    if (dE <= 2) return 'Near-identical';
    if (dE <= 5) return 'Very close';
    if (dE <= 10) return 'Close';
    if (dE <= 20) return 'Similar';
    return null;
  }

  return {
    countMatches: countMatches,
    replaceInPattern: replaceInPattern,
    rankBySimilarity: rankBySimilarity,
    similarityLabel: similarityLabel
  };
})();
