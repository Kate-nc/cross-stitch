/* creator/stitchTypeConvert.js ───────────────────────────────────────────
   Pure helpers behind "Stitch type" on a selection: turn every stitch in it
   into a full cross or a half stitch, keeping each cell's colour. No DOM,
   no React.

   A cell's stitch is its full stitch (pat[idx]) plus any part stitches over
   it (partialStitches.get(idx) = { TL?, TR?, BL?, BR? }). Part-stitch
   quadrants override the full stitch's colour in their corner, so a red
   full stitch with a black TL quadrant draws as a red three-quarter and a
   black quarter. A half stitch is two opposite quadrants on a blank cell:
   "/" is BL + TR, "\" is TL + BR.

   Exposed as window.StitchTypeConvert:
     TARGETS → ["full", "half-fwd", "half-bck"]
     cellKind(cell, psEntry)
       → "full" | "half-fwd" | "half-bck" | "other" | null (no stitch)
     selectionKind(pat, partials, mask)
       → the kind every stitched cell in the selection shares, "mixed" when
         they differ, or null when the selection has no stitches.
     convertSelection(pat, partials, mask, target, cmap)
       → { pat, partials, changes: [{ idx, old }], psChanges: [{ idx, old }] }
         pat / partials are new only when something changed (else the ones
         passed in). changes / psChanges are the edit-history shape:
         psChanges[].old is null where the cell had no part stitches.
         Background (__skip__) and empty cells with no part stitches are
         left alone, as are cells already of the target kind.
     partColourIds(partials, bsLines, knots)
       → Set of the thread ids used by part stitches, backstitch lines or
         French knots. A palette entry's count is full stitches only, so a
         colour turned wholly into half stitches reads 0 but is still in
         use: Remove unused leaves these alone.

   Each cell keeps the colour that covers most of it. On a tie (two half
   stitches of different colours, say) a half stitch keeps the colour
   already on its diagonal, and a full stitch keeps the colour of the full
   stitch underneath, else the first corner in TL, TR, BL, BR order.
   ────────────────────────────────────────────────────────────────────────── */

window.StitchTypeConvert = (function() {
  var QUADS = ["TL", "TR", "BL", "BR"];
  var DIAG = { "half-fwd": ["BL", "TR"], "half-bck": ["TL", "BR"] };
  var TARGETS = ["full", "half-fwd", "half-bck"];

  function isBlank(cell) {
    return !cell || cell.id === "__skip__" || cell.id === "__empty__";
  }

  function hasQuads(ps) {
    return !!ps && !!(ps.TL || ps.TR || ps.BL || ps.BR);
  }

  function cellKind(cell, ps) {
    var quads = hasQuads(ps);
    if (!quads) return isBlank(cell) ? null : "full";
    if (!isBlank(cell)) return "other";
    var on = QUADS.filter(function(q) { return !!ps[q]; });
    if (on.length !== 2 || ps[on[0]].id !== ps[on[1]].id) return "other";
    var key = on.join(",");
    if (key === "TR,BL") return "half-fwd";
    if (key === "TL,BR") return "half-bck";
    return "other";
  }

  function selectionKind(pat, partials, mask) {
    if (!pat || !mask) return null;
    var kind = null;
    for (var i = 0; i < pat.length; i++) {
      if (!mask[i]) continue;
      var k = cellKind(pat[i], partials ? partials.get(i) : null);
      if (!k) continue;
      if (kind === null) kind = k;
      else if (kind !== k) return "mixed";
    }
    return kind;
  }

  // The colour {id, rgb} that covers most of the cell (see the header).
  function dominantColour(cell, ps, target) {
    var counts = {}, colours = {}, order = [];
    var base = isBlank(cell) ? null : cell;
    QUADS.forEach(function(q) {
      var src = (ps && ps[q]) || base;
      if (!src) return;
      if (!counts[src.id]) { counts[src.id] = 0; colours[src.id] = src; order.push(src.id); }
      counts[src.id] += 2;
      if (DIAG[target] && DIAG[target].indexOf(q) !== -1) counts[src.id] += 1;
    });
    if (!order.length) return null;
    if (base && counts[base.id] != null && target === "full") counts[base.id] += 1;
    var best = order[0];
    order.forEach(function(id) { if (counts[id] > counts[best]) best = id; });
    return colours[best];
  }

  function quadEntry(src) {
    var o = { id: src.id, rgb: src.rgb };
    if (src.brand) o.brand = src.brand;
    if (src.type && src.type !== "solid") o.type = src.type;
    if (src.threads) o.threads = src.threads;
    if (src.blendRatio) o.blendRatio = src.blendRatio;
    if (src.blend_ratio) o.blend_ratio = src.blend_ratio;
    return o;
  }

  function fullEntry(src, cmap) {
    var e = cmap && cmap[src.id];
    if (e) return Object.assign({}, e);
    var inferredType = src.type || (typeof src.id === "string" && src.id.indexOf("+") !== -1 ? "blend" : "solid");
    var o = { id: src.id, type: inferredType, rgb: src.rgb };
    if (src.brand) o.brand = src.brand;
    if (src.threads) o.threads = src.threads;
    if (src.blendRatio) o.blendRatio = src.blendRatio;
    if (src.blend_ratio) o.blend_ratio = src.blend_ratio;
    return o;
  }

  function convertSelection(pat, partials, mask, target, cmap) {
    var out = { pat: pat, partials: partials, changes: [], psChanges: [] };
    if (!pat || !mask || TARGETS.indexOf(target) === -1) return out;
    var np = null, nm = null;
    for (var i = 0; i < pat.length; i++) {
      if (!mask[i]) continue;
      var cell = pat[i], ps = partials ? partials.get(i) : null;
      var kind = cellKind(cell, ps);
      if (!kind || kind === target) continue;
      var colour = dominantColour(cell, ps, target);
      if (!colour) continue;

      var nextCell = cell, nextPs = null;
      if (target === "full") {
        nextCell = fullEntry(colour, cmap);
      } else {
        if (!isBlank(cell)) nextCell = { id: "__empty__", rgb: [255, 255, 255] };
        nextPs = {};
        DIAG[target].forEach(function(q) { nextPs[q] = quadEntry(colour); });
      }

      if (nextCell !== cell) {
        if (!np) np = pat.slice();
        out.changes.push({ idx: i, old: Object.assign({}, cell) });
        np[i] = nextCell;
      }
      if (ps || nextPs) {
        if (!nm) nm = new Map(partials || []);
        out.psChanges.push({ idx: i, old: ps ? Object.assign({}, ps) : null });
        if (nextPs) nm.set(i, nextPs); else nm.delete(i);
      }
    }
    if (np) out.pat = np;
    if (nm) out.partials = nm;
    return out;
  }

  function partColourIds(partials, bsLines, knots, specialtyStitches) {
    var ids = new Set();
    if (partials) partials.forEach(function(entry) {
      QUADS.forEach(function(q) { if (entry && entry[q] && entry[q].id != null) ids.add(String(entry[q].id)); });
    });
    (bsLines || []).forEach(function(ln) { if (ln && ln.colorId != null) ids.add(String(ln.colorId)); });
    (knots || []).forEach(function(k) { if (k && k.id != null) ids.add(String(k.id)); });
    (specialtyStitches || []).forEach(function(st) {
      var sid = st && st.thread && st.thread.id != null ? st.thread.id : (st && st.id != null ? st.id : null);
      if (sid != null) ids.add(String(sid));
    });
    return ids;
  }

  return {
    TARGETS: TARGETS,
    partColourIds: partColourIds,
    dominantColour: dominantColour,
    cellKind: cellKind,
    selectionKind: selectionKind,
    convertSelection: convertSelection
  };
})();
