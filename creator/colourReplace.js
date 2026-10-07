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
     countPartials(partials, srcIds, mask) / countBackstitch(lines, srcIds, mask, sW, sH)
       → { total, inSelection } (quarter/half stitch cells; backstitch lines)
     replacePartials(partials, srcIds, dstEntry, mask)
       → { map, psChanges: [{ idx, old }] }   map is a new Map only if changed
     replaceBackstitch(lines, srcIds, dstEntry, mask, sW, sH)
       → { lines, count }   lines is a new array only if changed
         Backstitch colour lives in line.colorId (and line.color as hex).
     describeCounts({ full, partial, backstitch }) → "N stitches, …"
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

  // ── Partial (half / quarter) stitches: Map idx → { TL, TR, BL, BR: { id, rgb } }
  var QUADS = ['TL', 'TR', 'BL', 'BR'];
  function partialHasAny(entry, src) {
    if (!entry) return false;
    for (var q = 0; q < QUADS.length; q++) {
      var part = entry[QUADS[q]];
      if (part && src.has(part.id)) return true;
    }
    return false;
  }
  function eachPartial(partials, fn) {
    if (!partials || typeof partials.forEach !== 'function') return;
    partials.forEach(function(entry, idx) { fn(entry, Number(idx)); });
  }
  function countPartials(partials, srcIds, mask) {
    var src = toIdSet(srcIds), total = 0, inSel = 0;
    if (src.size) eachPartial(partials, function(entry, idx) {
      if (!partialHasAny(entry, src)) return;
      total++;
      if (mask && mask[idx]) inSel++;
    });
    return { total: total, inSelection: mask ? inSel : null };
  }
  function replacePartials(partials, srcIds, dstEntry, mask) {
    var src = toIdSet(srcIds), psChanges = [], next = null;
    if (!src.size || !dstEntry) return { map: partials, psChanges: psChanges };
    eachPartial(partials, function(entry, idx) {
      if (mask && !mask[idx]) return;
      if (!partialHasAny(entry, src)) return;
      var updated = Object.assign({}, entry);
      QUADS.forEach(function(q) {
        if (updated[q] && src.has(updated[q].id)) updated[q] = { id: dstEntry.id, rgb: dstEntry.rgb };
      });
      if (!next) next = new Map(partials);
      psChanges.push({ idx: idx, old: Object.assign({}, entry) });
      next.set(idx, updated);
    });
    return { map: next || partials, psChanges: psChanges };
  }

  // ── Backstitch lines: { x1, y1, x2, y2, colorId?, color? } on the grid lattice.
  // A line counts as "in the selection" when a cell touching its midpoint is
  // selected (lines run along cell edges, so the midpoint borders 1-4 cells).
  function lineInMask(ln, mask, sW, sH) {
    if (!mask) return true;
    var mx = (ln.x1 + ln.x2) / 2, my = (ln.y1 + ln.y2) / 2, e = 1e-6;
    var xs = [Math.floor(mx - e), Math.floor(mx + e)], ys = [Math.floor(my - e), Math.floor(my + e)];
    for (var a = 0; a < 2; a++) for (var b = 0; b < 2; b++) {
      var cx = xs[a], cy = ys[b];
      if (cx >= 0 && cx < sW && cy >= 0 && cy < sH && mask[cy * sW + cx]) return true;
    }
    return false;
  }
  function countBackstitch(lines, srcIds, mask, sW, sH) {
    var src = toIdSet(srcIds), total = 0, inSel = 0;
    if (src.size && lines) for (var i = 0; i < lines.length; i++) {
      var ln = lines[i];
      if (!ln || !src.has(ln.colorId)) continue;
      total++;
      if (mask && lineInMask(ln, mask, sW, sH)) inSel++;
    }
    return { total: total, inSelection: mask ? inSel : null };
  }
  function rgbHex(rgb) {
    return '#' + rgb.map(function(v) { var h = Math.max(0, Math.min(255, Math.round(v))).toString(16); return h.length < 2 ? '0' + h : h; }).join('');
  }
  function replaceBackstitch(lines, srcIds, dstEntry, mask, sW, sH) {
    var src = toIdSet(srcIds), next = null, count = 0;
    if (!src.size || !dstEntry || !lines) return { lines: lines, count: 0 };
    for (var i = 0; i < lines.length; i++) {
      var ln = lines[i];
      if (!ln || !src.has(ln.colorId) || !lineInMask(ln, mask, sW, sH)) continue;
      if (!next) next = lines.slice();
      var out = Object.assign({}, ln, { colorId: dstEntry.id });
      if (ln.color !== undefined && dstEntry.rgb) out.color = rgbHex(dstEntry.rgb);
      next[i] = out;
      count++;
    }
    return { lines: next || lines, count: count };
  }

  function describeCounts(c) {
    var parts = [];
    var n = function(x, one, many) { return x.toLocaleString() + ' ' + (x === 1 ? one : many); };
    if (c.full) parts.push(n(c.full, 'stitch', 'stitches'));
    if (c.partial) parts.push(n(c.partial, 'part stitch', 'part stitches'));
    if (c.backstitch) parts.push(n(c.backstitch, 'backstitch line', 'backstitch lines'));
    if (!parts.length) return '0 stitches';
    if (parts.length === 1) return parts[0];
    return parts.slice(0, -1).join(', ') + ' and ' + parts[parts.length - 1];
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
    countPartials: countPartials,
    replacePartials: replacePartials,
    countBackstitch: countBackstitch,
    replaceBackstitch: replaceBackstitch,
    describeCounts: describeCounts,
    rankBySimilarity: rankBySimilarity,
    similarIds: similarIds,
    similarityLabel: similarityLabel
  };
})();
