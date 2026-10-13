/* backstitch.js — done marks for backstitch lines (tracking audit TRACK-04, Phase 6).
 *
 * A project carries `bsLines: [{x1, y1, x2, y2, color?, colorId?}]`: each line runs between two points of the
 * stitch grid, in cells (a whole number is a grid corner, a .5 is a cell edge midpoint or centre). Lines have no
 * id of their own.
 *
 * The Tracker's done state is `bsDone: ["x1,y1,x2,y2,colour", ...]`, the keys of the lines marked done. A key is
 * made from the endpoints and the colour, so that:
 *   - drawing the same line the other way round gives the same key (the endpoints are put in order);
 *   - editing the pattern in the Creator cannot move a done mark onto another line: a key whose line is gone
 *     simply matches nothing and is ignored, as a French knot's done key is (knots.js);
 *   - two identical lines share one mark, and both count.
 * The colour part is the line's `colorId` when it has one (a thread id), otherwise its `color` (a #hex), otherwise
 * empty. Changing a line's colour therefore changes its key: it reads as a different line and starts not done,
 * which is the safe way round (a mark is never carried onto a thread it was not made in).
 *
 * `bsDone` is optional: a project without it has no backstitch marked, and older builds ignore it (the project
 * format stays at version 11).
 *
 * Loaded as a plain <script> on the Creator and Tracker pages; also require()-able for tests.
 */
(function (root) {
  function colourOf(line) {
    if (!line) return "";
    if (line.colorId !== undefined && line.colorId !== null && line.colorId !== "") return String(line.colorId);
    if (line.color !== undefined && line.color !== null) return String(line.color);
    return "";
  }

  // Endpoints in order (left to right, then top to bottom) so a line and its reverse are one line.
  function key(line) {
    var x1 = Number(line.x1), y1 = Number(line.y1), x2 = Number(line.x2), y2 = Number(line.y2);
    if (x2 < x1 || (x2 === x1 && y2 < y1)) { var tx = x1, ty = y1; x1 = x2; y1 = y2; x2 = tx; y2 = ty; }
    return x1 + "," + y1 + "," + x2 + "," + y2 + "," + colourOf(line);
  }

  function wellFormed(line) {
    return !!line && isFinite(Number(line.x1)) && isFinite(Number(line.y1)) && isFinite(Number(line.x2)) && isFinite(Number(line.y2)) &&
      !(Number(line.x1) === Number(line.x2) && Number(line.y1) === Number(line.y2));
  }

  // Length in half-cell units (a line along one cell edge is 2). Used to weigh a line if backstitch ever counts toward
  // a percentage; today it is shown on its own row and not in the headline figure.
  function lengthUnits(line) {
    var dx = Number(line.x2) - Number(line.x1), dy = Number(line.y2) - Number(line.y1);
    return Math.sqrt(dx * dx + dy * dy) * 2;
  }

  // key -> array of the line indexes that share it.
  function index(lines) {
    var m = new Map();
    (lines || []).forEach(function (ln, i) {
      if (!wellFormed(ln)) return;
      var k = key(ln), a = m.get(k);
      if (a) a.push(i); else m.set(k, [i]);
    });
    return m;
  }

  function keysOf(lines) { return Array.from(index(lines).keys()); }

  // The done keys that still match a line, once each, sorted: what is worth saving. Keys that match nothing (the
  // line was removed, or recoloured, or the key is not a string) are dropped.
  function live(done, lines) {
    if (!Array.isArray(done) || !done.length) return [];
    var have = index(lines), seen = new Set(), out = [];
    done.forEach(function (k) {
      if (typeof k !== "string" || seen.has(k) || !have.has(k)) return;
      seen.add(k); out.push(k);
    });
    return out.sort();
  }

  // Marking or unmarking one line: a new array, the done list otherwise unchanged. `on` forces the result
  // (true: marked, false: not); omitted, the mark flips.
  function toggle(done, k, on) {
    var list = Array.isArray(done) ? done : [], i = list.indexOf(k), has = i !== -1;
    var want = on === undefined ? !has : !!on;
    if (want === has) return list.slice();
    return want ? list.concat([k]) : list.slice(0, i).concat(list.slice(i + 1));
  }

  // {total, done}: lines counted one by one, so two identical lines are two (and are marked together).
  function progress(lines, done) {
    var set = new Set(done || []), total = 0, n = 0;
    (lines || []).forEach(function (ln) {
      if (!wellFormed(ln)) return;
      total++;
      if (set.has(key(ln))) n++;
    });
    return { total: total, done: n };
  }

  // { colour: {total, done} } with the colour as colourOf() gives it ("" for a line with none).
  function byColour(lines, done) {
    var set = new Set(done || []), out = {};
    (lines || []).forEach(function (ln) {
      if (!wellFormed(ln)) return;
      var c = colourOf(ln), e = out[c] || (out[c] = { total: 0, done: 0 });
      e.total++;
      if (set.has(key(ln))) e.done++;
    });
    return out;
  }

  // Done keys after the canvas moved by whole cells (Creator resize or crop), so a mark stays with its line. A key
  // that cannot be read is dropped.
  function offsetDone(done, dx, dy) {
    var out = [];
    (done || []).forEach(function (k) {
      if (typeof k !== "string") return;
      var p = k.split(",");
      if (p.length < 5) return;
      var n = [Number(p[0]) + dx, Number(p[1]) + dy, Number(p[2]) + dx, Number(p[3]) + dy];
      if (!n.every(isFinite)) return;
      out.push(n.join(",") + "," + p.slice(4).join(","));
    });
    return out;
  }

  // As saved: unique string keys, sorted. An empty list is undefined so the field is not written at all.
  function forSave(done) {
    if (!Array.isArray(done) || !done.length) return undefined;
    var seen = new Set(), out = [];
    done.forEach(function (k) { if (typeof k === "string" && !seen.has(k)) { seen.add(k); out.push(k); } });
    return out.length ? out.sort() : undefined;
  }

  var api = {
    key: key, colourOf: colourOf, wellFormed: wellFormed, lengthUnits: lengthUnits, index: index, keysOf: keysOf,
    live: live, toggle: toggle, progress: progress, byColour: byColour, offsetDone: offsetDone, forSave: forSave
  };
  root.Backstitch = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof window !== "undefined" ? window : globalThis);
