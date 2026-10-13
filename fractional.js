/* fractional.js — done marks for quarter stitches (tracking audit TRACK-04, Phase 6).
 *
 * A project carries `partialStitches: [[cellIndex, {TL?, TR?, BL?, BR?}]]`: for each cell, the quarters that hold
 * a thread (`{id, rgb, brand?}` at each position). They are the fractional stitches: each is a quarter of a cell.
 *
 * The Tracker's done state is `partialDone: [[cellIndex, ["TL", "BR"]]]`, the quarters marked done, parallel to
 * partialStitches and to halfDone. Only a quarter that holds a thread can be done: a mark for a position with
 * no quarter is ignored, so editing the pattern in the Creator cannot leave a stray mark.
 *
 * In memory the marks are a Map of cellIndex -> Set of positions. Both fields are optional: a project without
 * them has no fractional work, and older builds ignore them (the project format stays at version 11).
 *
 * Loaded as a plain <script> on the Creator and Tracker pages; also require()-able for tests.
 */
(function (root) {
  var POSITIONS = ["TL", "TR", "BL", "BR"];

  function isPos(p) { return POSITIONS.indexOf(p) !== -1; }

  // partialStitches in either form (a Map or the saved list) -> Map of idx -> {TL?...}.
  function stitchMap(ps) {
    if (ps instanceof Map) return ps;
    var m = new Map();
    (Array.isArray(ps) ? ps : []).forEach(function (e) { if (e && e.length === 2) m.set(Number(e[0]), e[1] || {}); });
    return m;
  }

  // The saved list -> Map of idx -> Set. Unknown positions and empty cells are dropped.
  function toMap(list) {
    var m = new Map();
    (Array.isArray(list) ? list : []).forEach(function (e) {
      if (!e || e.length !== 2 || !Array.isArray(e[1])) return;
      var idx = Number(e[0]);
      if (!Number.isInteger(idx) || idx < 0) return;
      var s = m.get(idx) || new Set();
      e[1].forEach(function (p) { if (isPos(p)) s.add(p); });
      if (s.size) m.set(idx, s);
    });
    return m;
  }

  // Marks that still sit on a quarter that holds a thread.
  function live(doneMap, partialStitches) {
    var ps = stitchMap(partialStitches), out = new Map();
    (doneMap || new Map()).forEach(function (set, idx) {
      var cell = ps.get(idx);
      if (!cell) return;
      var keep = new Set();
      set.forEach(function (p) { if (cell[p]) keep.add(p); });
      if (keep.size) out.set(idx, keep);
    });
    return out;
  }

  // As saved: cells in index order, positions in TL TR BL BR order. Empty is undefined so the field is not written.
  function forSave(doneMap) {
    if (!doneMap || !doneMap.size) return undefined;
    var out = [];
    Array.from(doneMap.keys()).sort(function (a, b) { return a - b; }).forEach(function (idx) {
      var set = doneMap.get(idx), list = POSITIONS.filter(function (p) { return set.has(p); });
      if (list.length) out.push([idx, list]);
    });
    return out.length ? out : undefined;
  }

  // Marking or unmarking one quarter: a new Map, the old one untouched. `on` forces the result.
  function toggle(doneMap, idx, pos, on) {
    var m = new Map();
    (doneMap || new Map()).forEach(function (s, k) { m.set(k, new Set(s)); });
    var s = m.get(idx) || new Set(), has = s.has(pos), want = on === undefined ? !has : !!on;
    if (want) s.add(pos); else s.delete(pos);
    if (s.size) m.set(idx, s); else m.delete(idx);
    return m;
  }

  function has(doneMap, idx, pos) { var s = doneMap && doneMap.get(idx); return !!(s && s.has(pos)); }

  // {total, done} in quarters.
  function progress(partialStitches, doneMap) {
    var ps = stitchMap(partialStitches), total = 0, n = 0;
    ps.forEach(function (cell, idx) {
      POSITIONS.forEach(function (p) {
        if (!cell || !cell[p]) return;
        total++;
        if (has(doneMap, idx, p)) n++;
      });
    });
    return { total: total, done: n };
  }

  // { threadId: {total, done} } over the quarters.
  function byThread(partialStitches, doneMap) {
    var ps = stitchMap(partialStitches), out = {};
    ps.forEach(function (cell, idx) {
      POSITIONS.forEach(function (p) {
        var q = cell && cell[p];
        if (!q || q.id == null) return;
        var e = out[q.id] || (out[q.id] = { total: 0, done: 0 });
        e.total++;
        if (has(doneMap, idx, p)) e.done++;
      });
    });
    return out;
  }

  // The same marks after the canvas changed from oldW to newW columns with the old origin at (offsetX, offsetY) in the
  // new grid (Creator resize or crop). A cell that falls outside the new grid loses its marks.
  function remap(doneMap, oldW, newW, newH, offsetX, offsetY) {
    var out = new Map();
    (doneMap || new Map()).forEach(function (set, idx) {
      var col = idx % oldW + offsetX, row = Math.floor(idx / oldW) + offsetY;
      if (col < 0 || col >= newW || row < 0 || row >= newH) return;
      out.set(row * newW + col, new Set(set));
    });
    return out;
  }

  var CENTRES = { TL: [0.25, 0.25], TR: [0.75, 0.25], BL: [0.25, 0.75], BR: [0.75, 0.75] };

  // The quarter of a cell nearest a point inside it (nx, ny in 0..1) among those that hold a thread, or null. `onlyId`
  // limits it to quarters of that thread (a colour lock).
  function pick(entry, nx, ny, onlyId) {
    if (!entry) return null;
    var best = null, bd = Infinity;
    POSITIONS.forEach(function (p) {
      var q = entry[p];
      if (!q || (onlyId && q.id !== onlyId)) return;
      var dx = nx - CENTRES[p][0], dy = ny - CENTRES[p][1], d = dx * dx + dy * dy;
      if (d < bd) { bd = d; best = p; }
    });
    return best;
  }

  // For the keyboard: the quarter a press should act on in a cell. The first quarter (in TL TR BL BR order) that is
  // not done yet; when every one is done, the last, so a press unmarks them from the end.
  function nextToMark(entry, doneSet, onlyId) {
    var have = POSITIONS.filter(function (p) { return entry && entry[p] && (!onlyId || entry[p].id === onlyId); });
    if (!have.length) return null;
    for (var i = 0; i < have.length; i++) if (!(doneSet && doneSet.has(have[i]))) return have[i];
    return have[have.length - 1];
  }

  var api = {
    pick: pick, nextToMark: nextToMark,
    POSITIONS: POSITIONS, toMap: toMap, live: live, forSave: forSave, toggle: toggle, has: has,
    progress: progress, byThread: byThread, remap: remap
  };
  root.Fractional = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof window !== "undefined" ? window : globalThis);
