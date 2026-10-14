/* unpick.js — taking a whole rectangle's marks back out at once (tracking audit TRACK-13, Phase 6 batch 4).
 *
 * "Unpick area" unmarks every kind of stitch in a rectangle of cells: whole stitches, half-stitch sides, quarter
 * stitches, French knots, and the backstitch lines that lie wholly inside it. plan() works out what would change from
 * the Tracker's marks, as plain data, without touching anything; the Tracker applies it as one undo step and undo
 * and redo use the same plan the other way round, so they are exact. Pure and require()-able; no DOM.
 *
 *   plan({ sW, sH, pat, done, halfStitches, halfDone, partialStitches, partialDone, knots, knotsDone, bsLines, bsDone,
 *          set, lockId }) -> { full, half, quarter, knots, bs, counts, units, stitches, empty }
 *
 *   full     [{ idx, oldVal }]               cells whose whole stitch was done
 *   half     [{ idx, before, after }]        a cell's { fwd, bck } marks before and after (after is null when none is left)
 *   quarter  [{ idx, before, after }]        a cell's done positions before and after (arrays in TL TR BL BR order)
 *   knots    [key]                           knot keys ("x,y") that were done
 *   bs       [key]                           backstitch keys (backstitch.js) that were done
 *   units    the same unit progress uses (half 0.5, quarter 0.25, knot 1, full 1); backstitch is counted on its own
 *   stitches whole stitches + half sides + quarters + knots, as a number to tell the person ("Unpicked 80")
 *
 * `lockId` is the colour lock: only marks of that thread are taken out.
 */
(function (root) {
  var QPOS = ["TL", "TR", "BL", "BR"];

  function skipCell(c) { return !c || c.id === "__skip__" || c.id === "__empty__"; }

  function plan(o) {
    var sW = o.sW, sH = o.sH, pat = o.pat || [], done = o.done, set = o.set, lock = o.lockId || null;
    var out = { full: [], half: [], quarter: [], knots: [], bs: [], counts: { full: 0, half: 0, quarter: 0, knot: 0, backstitch: 0 }, units: 0, stitches: 0, empty: true };
    if (!set || !set.size || !(sW > 0)) return out;
    var x0 = 1e9, y0 = 1e9, x1 = -1, y1 = -1;
    set.forEach(function (idx) {
      var x = idx % sW, y = (idx - x) / sW;
      if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
    });

    set.forEach(function (idx) {
      if (idx < 0 || idx >= pat.length) return;
      var cell = pat[idx];
      if (done && done[idx] === 1 && !skipCell(cell) && (!lock || cell.id === lock)) {
        out.full.push({ idx: idx, oldVal: 1 });
      }
      var hd = o.halfDone && o.halfDone.get(idx);
      if (hd && (hd.fwd || hd.bck)) {
        var hs = o.halfStitches && o.halfStitches.get(idx) || {}, after = {}, removed = 0;
        ["fwd", "bck"].forEach(function (d) {
          if (!hd[d]) return;
          if (lock && !(hs[d] && hs[d].id === lock)) { after[d] = hd[d]; return; }
          removed++;
        });
        if (removed) {
          out.half.push({ idx: idx, before: Object.assign({}, hd), after: (after.fwd || after.bck) ? after : null, removed: removed });
        }
      }
      var qd = o.partialDone && o.partialDone.get(idx);
      if (qd && qd.size) {
        var ps = o.partialStitches && o.partialStitches.get(idx) || {};
        var before = QPOS.filter(function (p) { return qd.has(p); });
        var keep = before.filter(function (p) { return lock && !(ps[p] && ps[p].id === lock); });
        if (keep.length !== before.length) {
          out.quarter.push({ idx: idx, before: before, after: keep.length ? keep : null, removed: before.length - keep.length });
        }
      }
    });

    var kd = new Set(o.knotsDone || []);
    if (kd.size) (o.knots || []).forEach(function (k) {
      var key = k.x + "," + k.y;
      if (!kd.has(key)) return;
      var cx = Math.min(sW - 1, k.x >> 1), cy = Math.min(sH - 1, k.y >> 1);
      if (!set.has(cy * sW + cx)) return;
      if (lock && k.id !== lock) return;
      if (out.knots.indexOf(key) === -1) out.knots.push(key);
    });

    // A backstitch line goes when both its ends lie within the rectangle (its edges included).
    var bd = new Set(o.bsDone || []), B = root.Backstitch || (typeof require === "function" ? safeRequire("./backstitch.js") : null);
    if (bd.size && B) (o.bsLines || []).forEach(function (ln) {
      if (!B.wellFormed(ln)) return;
      var key = B.key(ln);
      if (!bd.has(key) || out.bs.indexOf(key) !== -1) return;
      var lx0 = Math.min(Number(ln.x1), Number(ln.x2)), lx1 = Math.max(Number(ln.x1), Number(ln.x2));
      var ly0 = Math.min(Number(ln.y1), Number(ln.y2)), ly1 = Math.max(Number(ln.y1), Number(ln.y2));
      if (lx0 < x0 || lx1 > x1 + 1 || ly0 < y0 || ly1 > y1 + 1) return;
      if (lock && String(ln.colorId) !== String(lock)) return;
      out.bs.push(key);
    });

    var halfSides = 0, quarters = 0;
    out.half.forEach(function (h) { halfSides += h.removed; });
    out.quarter.forEach(function (q) { quarters += q.removed; });
    out.counts = { full: out.full.length, half: halfSides, quarter: quarters, knot: out.knots.length, backstitch: out.bs.length };
    out.units = out.counts.full + out.counts.half * 0.5 + out.counts.quarter * 0.25 + out.counts.knot;
    out.stitches = out.counts.full + out.counts.half + out.counts.quarter + out.counts.knot;
    out.empty = !(out.stitches || out.counts.backstitch);
    return out;
  }
  function safeRequire(p) { try { return require(p); } catch (_) { return null; } }

  // The containers after applying (undo=false) or taking back (undo=true) a plan. Each returns a new container, or the
  // same one when the plan has nothing for it.
  function nextHalfDone(map, p, undo) {
    if (!p.half.length) return map;
    var m = new Map(map);
    p.half.forEach(function (h) {
      var v = undo ? h.before : h.after;
      if (v && (v.fwd || v.bck)) m.set(h.idx, Object.assign({}, v)); else m.delete(h.idx);
    });
    return m;
  }
  function nextPartialDone(map, p, undo) {
    if (!p.quarter.length) return map;
    var m = new Map();
    map.forEach(function (s, k) { m.set(k, new Set(s)); });
    p.quarter.forEach(function (q) {
      var v = undo ? q.before : q.after;
      if (v && v.length) m.set(q.idx, new Set(v)); else m.delete(q.idx);
    });
    return m;
  }
  function nextKnotsDone(list, p, undo) {
    if (!p.knots.length) return list;
    var set = new Set(list || []);
    p.knots.forEach(function (k) { if (undo) set.add(k); else set.delete(k); });
    return Array.from(set);
  }

  var api = { plan: plan, nextHalfDone: nextHalfDone, nextPartialDone: nextPartialDone, nextKnotsDone: nextKnotsDone };
  root.Unpick = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof window !== "undefined" ? window : globalThis);
