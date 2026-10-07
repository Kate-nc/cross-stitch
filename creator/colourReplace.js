/* creator/colourReplace.js ────────────────────────────────────────────────
   Pure helpers behind the Replace colour modal (ColourReplaceModal.js) and
   useMagicWand.applyGlobalColourReplacement. No DOM, no React.

   Exposed as window.ColourReplace:
     countMatches(pat, srcIds, mask)
       → { total, inSelection }   inSelection is null when mask is falsy.
     replaceInPattern(pat, srcIds, dstEntry, mask)
       → { pat: newPat, changes: [{ idx, old }] }
         mask (Uint8Array | null) limits the change to selected cells.
         srcIds is one id or an array / Set of ids (similar shades).
     similarIds(srcEntry, palette, tol, opts)
       → ids of palette entries within dE <= tol of srcEntry (always
         including srcEntry.id), closest first. opts: { labOf, distance }.
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

  function toIdSet(ids) {
    if (ids instanceof Set) return ids;
    if (Array.isArray(ids)) return new Set(ids.filter(Boolean));
    return new Set(ids ? [ids] : []);
  }

  function countMatches(pat, srcIds, mask) {
    var total = 0, inSel = 0;
    var src = toIdSet(srcIds);
    if (!pat || !src.size) return { total: 0, inSelection: mask ? 0 : null };
    for (var i = 0; i < pat.length; i++) {
      var cell = pat[i];
      if (!isStitch(cell) || !src.has(cell.id)) continue;
      total++;
      if (mask && mask[i]) inSel++;
    }
    return { total: total, inSelection: mask ? inSel : null };
  }

  function replaceInPattern(pat, srcIds, dstEntry, mask) {
    var np = pat.slice();
    var changes = [];
    var src = toIdSet(srcIds);
    if (!src.size || !dstEntry) return { pat: np, changes: changes };
    for (var i = 0; i < np.length; i++) {
      if (mask && !mask[i]) continue;
      var cell = np[i];
      // Cells already in the destination colour are left alone (it can be
      // inside the similar-shades set).
      if (!isStitch(cell) || !src.has(cell.id) || cell.id === dstEntry.id) continue;
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

  function similarIds(srcEntry, palette, tol, opts) {
    if (!srcEntry || !srcEntry.id) return [];
    var ids = [srcEntry.id];
    if (!srcEntry.rgb || !palette || !(tol > 0)) return ids;
    var near = rankBySimilarity(srcEntry.rgb, palette, Object.assign({}, opts || {}, { excludeIds: [srcEntry.id] }));
    for (var i = 0; i < near.length && near[i].dE <= tol; i++) {
      var id = near[i].thread.id;
      if (id !== '__skip__' && id !== '__empty__' && ids.indexOf(id) === -1) ids.push(id);
    }
    return ids;
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
    similarIds: similarIds,
    similarityLabel: similarityLabel
  };
})();
