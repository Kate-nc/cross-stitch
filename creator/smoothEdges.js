/* creator/smoothEdges.js ──────────────────────────────────────────────────
   Pure helpers behind Smooth edges: turn the steps along a selection's
   outline into three-quarter stitches so curves and diagonals look less
   jagged. No DOM, no React.

   The shape is the selection's stitched cells. Every step along its outline
   has an outside corner (a shape cell with nothing of the shape on two sides
   and the diagonal) and, beside it, a notch (an outside cell with the shape
   on two sides and the diagonal).

     "trim"  The corner cell keeps three quarters of its stitch. The cut-off
             quarter takes the colour stitched beside it (so a red shape in a
             black outline gets a red 3/4 and a black 1/4), or is left empty
             when that is bare fabric. The shape shrinks very slightly.
     "fill"  The notch cell gets a 3/4 stitch in the shape's colour; its own
             stitch, if any, keeps the far quarter. The shape grows slightly,
             and these cells are just outside the selection.

   A cell is only changed if it is a plain full stitch (trim) or a full
   stitch or bare fabric (fill): part stitches already there are left alone,
   so running it twice changes nothing more. A 1-wide diagonal line becomes
   half stitches (both its corners are trimmed). With keepSquare, a corner
   where two straight edges meet (both runs at least two cells long) stays.

   Exposed as window.SmoothEdges:
     plan(pat, partials, mask, sW, sH, opts)
       opts: { mode: "trim" | "fill", keepSquare: boolean }
       → { cells: [{ idx, entry, hatch }], counts: { threeQuarter, half, quarter } }
         entry is the new part-stitch entry { TL?, TR?, BL?, BR? } of
         { id, rgb } for that cell. hatch is the corner whose half of the
         cell changes, for drawing a preview. counts.quarter is the 1/4
         stitches of another colour that go with them.
     apply(pat, partials, cells)
       → { pat, partials, changes: [{ idx, old }], psChanges: [{ idx, old }] }
         in the edit-history shape. The cells' full stitches are cleared
         (their colour is now in the part stitches); background (__skip__)
         cells stay background.
   ────────────────────────────────────────────────────────────────────────── */

window.SmoothEdges = (function() {
  var QUADS = ["TL", "TR", "BL", "BR"];
  var OPP = { TL: "BR", TR: "BL", BL: "TR", BR: "TL" };
  // Offsets of the two side neighbours and the diagonal that share a corner.
  var DIR = { TL: [-1, -1], TR: [1, -1], BL: [-1, 1], BR: [1, 1] };

  function isBlank(cell) {
    return !cell || cell.id === "__skip__" || cell.id === "__empty__";
  }

  function hasQuads(ps) {
    return !!ps && !!(ps.TL || ps.TR || ps.BL || ps.BR);
  }

  function q(c) { return { id: c.id, rgb: c.rgb }; }

  // The colour covering most of a cell, or null for bare fabric.
  function colourOf(cell, ps) {
    var base = isBlank(cell) ? null : cell, counts = {}, colours = {}, best = null;
    QUADS.forEach(function(k) {
      var src = (ps && ps[k]) || base;
      if (!src) return;
      counts[src.id] = (counts[src.id] || 0) + 1;
      colours[src.id] = src;
      if (best === null || counts[src.id] > counts[best]) best = src.id;
    });
    return best === null ? null : colours[best];
  }

  // The most common colour of up to three cells; on a tie, the diagonal's
  // (the last one), then the first. Null unless at least `need` have one.
  function majority(list, need) {
    var n = 0, counts = {}, colours = {};
    list.forEach(function(c) { if (!c) return; n++; counts[c.id] = (counts[c.id] || 0) + 1; colours[c.id] = c; });
    if (n < need) return null;
    var order = [list[2], list[0], list[1]].filter(Boolean).map(function(c) { return c.id; });
    var best = order[0];
    order.forEach(function(id) { if (counts[id] > counts[best]) best = id; });
    return colours[best];
  }

  function plan(pat, partials, mask, sW, sH, opts) {
    var out = { cells: [], counts: { threeQuarter: 0, half: 0, quarter: 0 } };
    if (!pat || !mask || !sW || !sH) return out;
    var mode = opts && opts.mode === "fill" ? "fill" : "trim";
    var keepSquare = !opts || opts.keepSquare !== false;
    function at(x, y) { return y * sW + x; }
    function inB(x, y) { return x >= 0 && y >= 0 && x < sW && y < sH; }
    function psAt(i) { return partials ? partials.get(i) : null; }
    // In the shape: selected and stitched (full or part stitches).
    function inside(x, y) {
      if (!inB(x, y)) return false;
      var i = at(x, y);
      return !!mask[i] && (!isBlank(pat[i]) || hasQuads(psAt(i)));
    }
    function colourAt(x, y) { return inB(x, y) ? colourOf(pat[at(x, y)], psAt(at(x, y))) : null; }

    for (var y = 0; y < sH; y++) for (var x = 0; x < sW; x++) {
      var i = at(x, y), cell = pat[i], ps = psAt(i);
      if (hasQuads(ps)) continue;

      if (mode === "trim") {
        if (!inside(x, y) || isBlank(cell)) continue;
        var exposed = QUADS.filter(function(c) {
          var d = DIR[c];
          return !inside(x + d[0], y) && !inside(x, y + d[1]) && !inside(x + d[0], y + d[1]);
        });
        var cut = null;
        if (exposed.length === 1) {
          var d1 = DIR[exposed[0]];
          var square = inside(x - d1[0], y) && !inside(x - d1[0], y + d1[1]) &&
            inside(x, y - d1[1]) && !inside(x + d1[0], y - d1[1]);
          if (!(keepSquare && square)) cut = exposed;
        } else if (exposed.length === 2 && OPP[exposed[0]] === exposed[1]) {
          cut = exposed;                                   // a 1-wide diagonal line
        }
        if (!cut) continue;
        var entry = {}, quarters = 0, same = false;
        QUADS.forEach(function(c) { if (cut.indexOf(c) === -1) entry[c] = q(cell); });
        cut.forEach(function(c) {
          var d = DIR[c];
          var other = majority([colourAt(x + d[0], y), colourAt(x, y + d[1]), colourAt(x + d[0], y + d[1])], 2);
          if (other && other.id === cell.id) same = true;
          else if (other) { entry[c] = q(other); quarters++; }
        });
        if (same) continue;                                // nothing would change
        out.cells.push({ idx: i, entry: entry, hatch: cut[0], hatch2: cut[1] || null });
        if (cut.length === 2) out.counts.half++; else out.counts.threeQuarter++;
        out.counts.quarter += quarters;
      } else {
        if (inside(x, y)) continue;
        var notch = QUADS.filter(function(c) {
          var d = DIR[c];
          if (!(inside(x + d[0], y) && inside(x, y + d[1]) && inside(x + d[0], y + d[1]))) return false;
          return !(keepSquare && inside(x + d[0], y - d[1]) && inside(x - d[0], y + d[1]));
        });
        var sides = [[1, 0], [-1, 0], [0, 1], [0, -1]].filter(function(s) { return inside(x + s[0], y + s[1]); }).length;
        if (notch.length !== 1 || sides !== 2) continue;
        var c0 = notch[0], dd = DIR[c0];
        var shape = majority([colourAt(x + dd[0], y), colourAt(x, y + dd[1]), colourAt(x + dd[0], y + dd[1])], 1);
        if (!shape) continue;
        var own = isBlank(cell) ? null : cell;
        if (own && own.id === shape.id) continue;
        var e2 = {};
        QUADS.forEach(function(c) { if (c !== OPP[c0]) e2[c] = q(shape); });
        if (own) { e2[OPP[c0]] = q(own); out.counts.quarter++; }
        out.cells.push({ idx: i, entry: e2, hatch: c0, hatch2: null });
        out.counts.threeQuarter++;
      }
    }
    return out;
  }

  function apply(pat, partials, cells) {
    var out = { pat: pat, partials: partials, changes: [], psChanges: [] };
    if (!pat || !cells || !cells.length) return out;
    var np = null, nm = new Map(partials || []);
    cells.forEach(function(c) {
      var cell = pat[c.idx];
      if (cell && cell.id !== "__skip__" && cell.id !== "__empty__") {
        if (!np) np = pat.slice();
        out.changes.push({ idx: c.idx, old: Object.assign({}, cell) });
        np[c.idx] = { id: "__empty__", rgb: [255, 255, 255] };
      }
      var old = nm.get(c.idx);
      out.psChanges.push({ idx: c.idx, old: old ? Object.assign({}, old) : null });
      nm.set(c.idx, Object.assign({}, c.entry));
    });
    if (np) out.pat = np;
    out.partials = nm;
    return out;
  }

  return { plan: plan, apply: apply };
})();
