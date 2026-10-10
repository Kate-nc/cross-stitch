/* knots.js — French knots (audit DRAW-04 item 6).
 *
 * A project may carry `knots: [{x, y, id, rgb}]`. x and y are in
 * HALF-STITCH units: a cell's top-left corner is (2·cx, 2·cy) and its centre
 * is (2·cx + 1, 2·cy + 1), so a knot sits on a corner (both even) or a
 * centre (both odd), as on printed charts. Edge midpoints (one odd, one
 * even) aren't used. `id` is the thread id; `rgb` is kept for drawing, as
 * partial stitches keep theirs.
 *
 * The Tracker's done state is `knotsDone: ["x,y", ...]`, the keys of the
 * knots marked done. Keys rather than array positions, so editing knots in
 * the Creator can't move a done mark onto another knot; a key whose knot was
 * removed is ignored.
 *
 * Both fields are optional: a project without them has no knots, and older
 * builds ignore them (the project format stays at version 11).
 *
 * Loaded as a plain <script> on the Creator and Tracker pages; also
 * require()-able for tests.
 */
(function (root) {
  // Thread for one knot, in full cross stitches' worth. A two-wrap knot in
  // two strands takes about as much thread as one cross stitch at 14 count
  // (roughly 3 cm with the travel behind the fabric), so each knot adds one
  // stitch to the thread estimate.
  var THREAD_ALLOWANCE = 1;

  function key(k) { return k.x + "," + k.y; }

  function onLattice(x, y) {
    return Number.isInteger(x) && Number.isInteger(y) && (x & 1) === (y & 1);
  }

  // The corner or centre nearest a point given in cells (fx, fy may be
  // fractional), clamped to a sW × sH pattern.
  function snap(fx, fy, sW, sH) {
    var cx = Math.max(0, Math.min(sW, Math.round(fx))), cy = Math.max(0, Math.min(sH, Math.round(fy)));
    var mx = Math.max(0, Math.min(sW - 1, Math.floor(fx))), my = Math.max(0, Math.min(sH - 1, Math.floor(fy)));
    var dCorner = Math.pow(fx - cx, 2) + Math.pow(fy - cy, 2);
    var dCentre = Math.pow(fx - (mx + 0.5), 2) + Math.pow(fy - (my + 0.5), 2);
    return dCentre < dCorner ? { x: 2 * mx + 1, y: 2 * my + 1 } : { x: 2 * cx, y: 2 * cy };
  }

  // Well-formed knots inside the pattern, one per spot (the last wins).
  function normalise(list, sW, sH) {
    if (!Array.isArray(list)) return [];
    var byKey = {}, order = [];
    list.forEach(function (k) {
      if (!k || typeof k.id !== "string" && typeof k.id !== "number") return;
      var x = Number(k.x), y = Number(k.y);
      if (!onLattice(x, y)) return;
      if (sW != null && (x < 0 || y < 0 || x > 2 * sW || y > 2 * sH)) return;
      var n = { x: x, y: y, id: String(k.id) };
      if (Array.isArray(k.rgb) && k.rgb.length === 3) n.rgb = k.rgb.slice();
      var kk = key(n);
      if (!(kk in byKey)) order.push(kk);
      byKey[kk] = n;
    });
    return order.map(function (kk) { return byKey[kk]; });
  }

  function find(list, x, y) {
    for (var i = 0; i < (list || []).length; i++) if (list[i].x === x && list[i].y === y) return i;
    return -1;
  }

  // Tap with the knot tool: a knot already there is removed, else one in
  // `thread` ({id, rgb}) is added. Returns a new array.
  function toggle(list, x, y, thread) {
    list = list || [];
    var i = find(list, x, y);
    if (i !== -1) return { knots: list.slice(0, i).concat(list.slice(i + 1)), added: false };
    var k = { x: x, y: y, id: String(thread.id) };
    if (thread.rgb) k.rgb = thread.rgb.slice();
    return { knots: list.concat([k]), added: true };
  }

  // The cell a knot belongs to for selections: a centre's own cell, a
  // corner's cell to the bottom right (or the last row / column).
  function cellOf(k, sW, sH) {
    return { x: Math.min(sW - 1, k.x >> 1), y: Math.min(sH - 1, k.y >> 1) };
  }

  // Where mirror drawing puts copies of a knot (mirror as in
  // ShapeTools.mirrorPoints: axes ax, ay in cells, on grid lines or through
  // cell middles).
  function mirrorKnot(x, y, mirror) {
    var out = [{ x: x, y: y }];
    if (!mirror || !mirror.on) return out;
    var mx = Math.round(4 * mirror.ax - x), my = Math.round(4 * mirror.ay - y);
    if (mirror.axis === "v" || mirror.axis === "both") out.push({ x: mx, y: y });
    if (mirror.axis === "h" || mirror.axis === "both") out.push({ x: x, y: my });
    if (mirror.axis === "both") out.push({ x: mx, y: my });
    var seen = {};
    return out.filter(function (p) { var kk = key(p); if (seen[kk]) return false; seen[kk] = true; return true; });
  }

  // Knots inside a selection box (cells minX..maxX, minY..maxY) whose cell
  // is selected in `mask`.
  function inSelection(k, mask, sW, sH) {
    var c = cellOf(k, sW, sH);
    return !!mask[c.y * sW + c.x];
  }

  // Move every knot by whole cells, dropping any that leave a w × h pattern
  // (canvas resize).
  function offset(list, dx, dy, w, h) {
    return (list || []).map(function (k) { return Object.assign({}, k, { x: k.x + 2 * dx, y: k.y + 2 * dy }); })
      .filter(function (k) { return k.x >= 0 && k.y >= 0 && k.x <= 2 * w && k.y <= 2 * h; });
  }
  function offsetDone(done, dx, dy) {
    return (done || []).map(function (kk) {
      var p = String(kk).split(",");
      return (Number(p[0]) + 2 * dx) + "," + (Number(p[1]) + 2 * dy);
    });
  }

  // The nearest knot to a point in cells, within `radius` cells, or null.
  function hitTest(list, fx, fy, radius) {
    var best = null, bestD = radius * radius;
    (list || []).forEach(function (k) {
      var d = Math.pow(k.x / 2 - fx, 2) + Math.pow(k.y / 2 - fy, 2);
      if (d <= bestD) { bestD = d; best = k; }
    });
    return best;
  }

  // {total, done} with the done keys that still match a knot.
  function progress(list, done) {
    var set = new Set(done || []), n = 0;
    (list || []).forEach(function (k) { if (set.has(key(k))) n++; });
    return { total: (list || []).length, done: n };
  }

  // { threadId: {total, done} }.
  function byThread(list, done) {
    var set = new Set(done || []), out = {};
    (list || []).forEach(function (k) {
      var e = out[k.id] || (out[k.id] = { total: 0, done: 0 });
      e.total++;
      if (set.has(key(k))) e.done++;
    });
    return out;
  }

  // A palette ([{id, type, count, ...}]) with the knots' thread added: each
  // entry's count grows by THREAD_ALLOWANCE per knot and gains `knots` (how
  // many); a thread used only for knots gets an entry of its own (`restore`,
  // when given, fills in its name, colour and blend threads from an id).
  // Returns the palette itself when there are no knots.
  function withKnotCounts(pal, list, restore) {
    if (!pal || !list || !list.length) return pal;
    var n = {}, rgbOf = {}, order = [];
    list.forEach(function (k) {
      if (!(k.id in n)) { n[k.id] = 0; order.push(k.id); }
      n[k.id]++;
      if (k.rgb && !rgbOf[k.id]) rgbOf[k.id] = k.rgb;
    });
    var seen = {};
    var out = pal.map(function (p) {
      if (!(p.id in n)) return p;
      seen[p.id] = true;
      return Object.assign({}, p, { count: (p.count || 0) + n[p.id] * THREAD_ALLOWANCE, knots: n[p.id] });
    });
    order.forEach(function (id) {
      if (seen[id]) return;
      var base = typeof restore === "function"
        ? restore({ id: id, type: id.indexOf("+") !== -1 ? "blend" : "solid", rgb: rgbOf[id] })
        : { id: id, type: "solid", name: id, rgb: rgbOf[id] || [128, 128, 128] };
      out.push(Object.assign({}, base, { count: n[id] * THREAD_ALLOWANCE, knots: n[id], knotsOnly: true }));
    });
    return out;
  }

  var api = {
    THREAD_ALLOWANCE: THREAD_ALLOWANCE,
    key: key, onLattice: onLattice, snap: snap, normalise: normalise, find: find, toggle: toggle,
    cellOf: cellOf, mirrorKnot: mirrorKnot, inSelection: inSelection, offset: offset, offsetDone: offsetDone,
    hitTest: hitTest, progress: progress, byThread: byThread, withKnotCounts: withKnotCounts
  };
  root.Knots = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof window !== "undefined" ? window : globalThis);
