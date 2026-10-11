/* progress-units.js — the one definition of "how far along".
 *
 * Every progress figure (the Tracker's strip, header and popover, project and global Stats, Home cards, the library,
 * share text, the progress image, the stash completion status) comes from here, so they cannot disagree
 * (tracking audit STATS-01). A project's progress is measured in UNITS: one full cross stitch is one unit, and the
 * other stitch types count for a fraction of one, set in the WEIGHTS table below. Change a weight, or add a type
 * (Phase 6 adds quarter, petite and backstitch tracking), by editing that one table.
 *
 *   counts → { full: {done, total}, half: {done, total}, knot: {done, total}, ... }
 *
 * `half` counts half-stitch SIDES (a cell with both legs is two), as the Tracker's counters do.
 * Backstitch is listed separately: it is not part of the percentage.
 *
 * Older sessions mixed units (a half stitch was counted as a whole stitch); they are never rewritten. New
 * sessions carry `units`, and sessionNet() reads `units` when it is there and `netStitches` otherwise.
 *
 * Plain script (window.ProgressUnits) and require()-able for tests.
 */
(function (root) {
  // type → weight in units. One row per stitch type; this is the only place the weights live.
  var WEIGHTS = { full: 1, half: 0.5, quarter: 0.25, petite: 0.25, knot: 1 };
  // Short names for "2 half, 1 knot" style breakdowns.
  var LABELS = { full: "full", half: "half", quarter: "quarter", petite: "petite", knot: "knot" };
  var ORDER = ["full", "half", "quarter", "petite", "knot"];
  // Counted on their own, not in the percentage.
  var SEPARATE = ["backstitch"];

  function num(v) { return typeof v === "number" && isFinite(v) && v > 0 ? v : 0; }

  // opts.include: an array of type names (or an object of name: boolean) limiting which types count, for
  // "visible layers only" figures. Absent means all types.
  function included(type, include) {
    if (!include) return true;
    if (Array.isArray(include)) return include.indexOf(type) !== -1;
    return !!include[type];
  }

  function progressUnits(counts, opts) {
    counts = counts || {};
    var include = opts && opts.include;
    var doneUnits = 0, totalUnits = 0, breakdown = {};
    for (var i = 0; i < ORDER.length; i++) {
      var t = ORDER[i], c = counts[t];
      if (!c) continue;
      var d = num(c.done), tot = num(c.total), w = WEIGHTS[t];
      if (!included(t, include)) continue;
      breakdown[t] = { done: d, total: tot, weight: w, doneUnits: d * w, totalUnits: tot * w };
      doneUnits += d * w;
      totalUnits += tot * w;
    }
    var out = { doneUnits: doneUnits, totalUnits: totalUnits, breakdown: breakdown };
    out.remainingUnits = Math.max(0, totalUnits - doneUnits);
    // One decimal place, never above 100, the way every display has shown it.
    out.percent = totalUnits > 0 ? Math.min(100, Math.round(doneUnits / totalUnits * 1000) / 10) : 0;
    out.complete = totalUnits > 0 && doneUnits >= totalUnits;
    var sep = {};
    for (var j = 0; j < SEPARATE.length; j++) { var s = counts[SEPARATE[j]]; if (s) sep[SEPARATE[j]] = { done: num(s.done), total: num(s.total) }; }
    out.separate = sep;
    return out;
  }

  // Units shown to the person: whole numbers (a half stitch is half a unit, so the total can be fractional).
  function roundUnits(n) { return Math.round(n); }
  // One formatter, built once: toLocaleString builds a new one on every call, which showed up on the tap path.
  var NF = null;
  try { NF = new Intl.NumberFormat("en-GB"); } catch (e) { NF = null; }
  function fmt(n) { return NF ? NF.format(n) : n.toLocaleString("en-GB"); }
  function formatUnits(n) { return fmt(roundUnits(n)); }
  // "To go" as a whole number that adds up with the whole "done" and "total" shown beside it (rounding each of
  // the three on its own can leave them one apart).
  function remainingWhole(result) { return Math.max(0, roundUnits(result.totalUnits) - roundUnits(result.doneUnits)); }

  // "2 half, 1 knot done": the non-full types that have anything in the project. `useDone` false lists totals.
  function breakdownText(result, useDone) {
    var parts = [];
    for (var i = 0; i < ORDER.length; i++) {
      var t = ORDER[i];
      if (t === "full") continue;
      var b = result.breakdown[t];
      if (!b || !b.total) continue;
      parts.push(fmt(useDone === false ? b.total : b.done) + " " + LABELS[t]);
    }
    return parts.join(", ");
  }

  // Units for one mark event: change is { full: n, half: n, knot: n ... } with signed counts.
  function sessionUnits(change) {
    var u = 0;
    for (var t in change) if (Object.prototype.hasOwnProperty.call(change, t) && WEIGHTS[t] != null) u += (change[t] || 0) * WEIGHTS[t];
    return u;
  }

  // A session still running (the Tracker's live one): its marks so far, net, in units. Falls back to the stitch
  // counts for a session object without units.
  function liveSessionNet(cur) {
    if (!cur) return 0;
    if (cur.unitsCompleted != null) return (cur.unitsCompleted || 0) - (cur.unitsUndone || 0);
    return (cur.stitchesCompleted || 0) - (cur.stitchesUndone || 0);
  }

  // What a session added, net, in the unit progress uses. Sessions from before this existed have netStitches only.
  function sessionNet(s) {
    if (!s) return 0;
    return s.units != null ? s.units : (s.netStitches || 0);
  }

  // Stitches ADDED by a session, in units: what it marked, leaving out catch-up marks (bulk "mark all" and the
  // like, which raise progress but are not stitching done today) and never reduced by unpicking. This is what
  // Today, speed, pace, goals, best day and streaks read. Sessions from before units existed carry
  // stitchesCompleted; from before that, only a net figure (a negative one means nothing was added).
  function sessionAdded(s) {
    if (!s) return 0;
    var c = s.unitsCompleted != null ? s.unitsCompleted
      : (s.stitchesCompleted != null ? s.stitchesCompleted : Math.max(0, sessionNet(s)));
    return Math.max(0, (c || 0) - (s.catchUp || 0));
  }
  // Stitches taken out again (unpicked), in units, shown on their own line and never netted into pace.
  function sessionUnpicked(s) {
    if (!s) return 0;
    if (s.unitsUndone != null) return s.unitsUndone || 0;
    if (s.stitchesUndone != null) return s.stitchesUndone || 0;
    return Math.max(0, -sessionNet(s));
  }
  // Whether a session counts as stitching activity for streaks and active days: it added something. A session
  // with no stitch figures at all (hand-made or imported with only a duration) still counts, as it always did.
  function sessionActive(s) {
    if (!s) return false;
    if (s.unitsCompleted == null && s.units == null && s.stitchesCompleted == null && s.netStitches == null) return true;
    return sessionAdded(s) > 0;
  }
  // A running session keeps what it has added per stitching day (`byDay`: { date: { uc, uu, cu, sc, su } }), so it
  // can be read for one day or since a day, and saved as one record per day.
  function liveAddedOn(cur, date) {
    if (!cur) return 0;
    if (!cur.byDay) return date === cur.date ? liveSessionAdded(cur) : 0;
    var d = cur.byDay[date];
    return d ? Math.max(0, (d.uc || 0) - (d.cu || 0)) : 0;
  }
  function liveAddedFrom(cur, startDate) {
    if (!cur) return 0;
    if (!cur.byDay) return cur.date >= startDate ? liveSessionAdded(cur) : 0;
    var t = 0;
    for (var k in cur.byDay) if (Object.prototype.hasOwnProperty.call(cur.byDay, k) && k >= startDate) t += Math.max(0, (cur.byDay[k].uc || 0) - (cur.byDay[k].cu || 0));
    return t;
  }
  function sessionCatchUp(s) { return (s && s.catchUp) || 0; }
  // The live session's additions so far (see sessionAdded).
  function liveSessionAdded(cur) {
    if (!cur) return 0;
    var c = cur.unitsCompleted != null ? cur.unitsCompleted : (cur.stitchesCompleted || 0);
    return Math.max(0, c - (cur.catchUp || 0));
  }

  // ── From a stored project record (Home, library, Stats pages: no Tracker counters there) ──
  // Cached per array reference, like the counts the library always kept, so a save does not rescan an unchanged chart.
  var _totalCache = (typeof WeakMap !== "undefined") ? new WeakMap() : null;
  var _doneCache = (typeof WeakMap !== "undefined") ? new WeakMap() : null;

  function countStitchCells(pat) {
    if (!pat || !pat.length) return 0;
    var cached = _totalCache && _totalCache.get(pat);
    if (cached !== undefined) return cached;
    var n = 0;
    for (var i = 0; i < pat.length; i++) {
      var c = pat[i];
      if (!c) continue;
      // `.p` cells are short arrays like ["310"] or ["310","k"]; "k" is skipped background.
      if (Array.isArray(c)) { if (c[1] !== "k" && c[0] !== "__skip__" && c[0] !== "__empty__") n++; }
      else if (c.id !== "__skip__" && c.id !== "__empty__") n++;
    }
    if (_totalCache) _totalCache.set(pat, n);
    return n;
  }

  function countMarked(done) {
    if (!done || typeof done !== "object") return 0;
    var cached = _doneCache && _doneCache.get(done);
    if (cached !== undefined) return cached;
    var n = 0;
    if ((typeof ArrayBuffer !== "undefined" && ArrayBuffer.isView(done)) || Array.isArray(done)) {
      for (var i = 0; i < done.length; i++) if (done[i] === 1) n++;
    }
    if (_doneCache) _doneCache.set(done, n);
    return n;
  }

  // Half-stitch sides in a record: halfStitches is [[cellIndex, {fwd, bck}], ...], halfDone the same for marks.
  function countSides(list) {
    var n = 0;
    if (!Array.isArray(list)) return 0;
    for (var i = 0; i < list.length; i++) {
      var e = list[i], v = e && e[1];
      if (v) { if (v.fwd) n++; if (v.bck) n++; }
    }
    return n;
  }

  function countsFromProject(p) {
    if (!p) return {};
    var pat = p.pattern || p.p;
    var knots = Array.isArray(p.knots) ? p.knots : [];
    var knotKeys = new Set(Array.isArray(p.knotsDone) ? p.knotsDone : []);
    var kd = 0;
    for (var i = 0; i < knots.length; i++) if (knots[i] && knotKeys.has(knots[i].x + "," + knots[i].y)) kd++;
    var fullTotal = (pat && pat.length) ? countStitchCells(pat) : (p.totalStitches || 0);
    var fullDone = p.done ? countMarked(p.done) : (p.completedStitches || 0);
    return {
      full: { done: fullDone, total: fullTotal },
      half: { done: countSides(p.halfDone), total: countSides(p.halfStitches) },
      knot: { done: kd, total: knots.length }
    };
  }

  function fromProject(p, opts) { return progressUnits(countsFromProject(p), opts); }

  var api = {
    WEIGHTS: WEIGHTS, progressUnits: progressUnits, fromProject: fromProject, countsFromProject: countsFromProject,
    sessionUnits: sessionUnits, sessionNet: sessionNet, liveSessionNet: liveSessionNet,
    sessionAdded: sessionAdded, sessionUnpicked: sessionUnpicked, sessionCatchUp: sessionCatchUp, sessionActive: sessionActive, liveAddedOn: liveAddedOn, liveAddedFrom: liveAddedFrom, liveSessionAdded: liveSessionAdded, formatUnits: formatUnits, roundUnits: roundUnits, remainingWhole: remainingWhole,
    breakdownText: breakdownText
  };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.ProgressUnits = api;
})(typeof window !== "undefined" ? window : this);
