/* tracking-merge.js — three-way merge of stitch marks saved by two tabs (TRACK-03).
 *
 * Two tabs open on one project each keep their own marks. When one saves, the other
 * used to be asked to throw its work away or overwrite the other's. Marks are
 * independent facts about cells, so they can be combined without asking:
 *
 *   base   what this tab last loaded or saved
 *   local  what this tab has now
 *   remote what the other tab saved
 *
 * For every cell: if the other tab changed it since base, take the other tab's value;
 * otherwise keep ours. So a stitch marked in either tab stays marked, and a stitch
 * unpicked in either tab stays unpicked (it is not brought back by the other tab's
 * older copy). Sets (knots done) and sessions merge the same way / by id.
 *
 * Only marks and sessions are merged. If the other tab changed anything else about the
 * project (the pattern, its name, thread settings...) canMerge() says no and the caller
 * shows the usual question instead.
 *
 * Loaded as a plain <script> on the Tracker page; also require()-able for tests.
 */
(function (root) {
  // Fields a merge does not compare. Either they are merged here (marks, sessions,
  // milestones), or they are view state / write metadata / figures derived from the marks
  // and sessions, which the other tab changes just by stitching. Every OTHER persisted
  // field counts: if the other tab changed one, a merge would let this tab's next save
  // restore its stale value, so the caller asks instead.
  var NOT_COMPARED = {
    id: 1, page: 1, version: 1, pattern: 1, createdAt: 1, updatedAt: 1, lastWriteAt: 1, lastWriteTabId: 1,
    done: 1, halfDone: 1, knotsDone: 1, statsSessions: 1, achievedMilestones: 1,
    savedZoom: 1, savedScroll: 1, hlRow: 1, hlCol: 1, focusBlock: 1, breadcrumbs: 1,
    doneSnapshots: 1, stitchLog: 1, totalTime: 1, lastTouchedAt: 1, startedAt: 1, completedAt: 1, finishStatus: 1
  };

  // "Nothing" is spelled several ways (missing, "", [], {}) depending on whether a record
  // was loaded or just built; they all mean the same here.
  function blank(v) {
    return v == null || v === "" || (Array.isArray(v) && !v.length) ||
      (typeof v === "object" && !Array.isArray(v) && !Object.keys(v).length);
  }
  function same(a, b) {
    if (a === b) return true;
    if (blank(a) || blank(b)) return blank(a) && blank(b);
    try { return JSON.stringify(a) === JSON.stringify(b); }
    catch (_) { return false; }
  }

  function sameRgb(a, b) {
    if (a === b) return true;
    return Array.isArray(a) && Array.isArray(b) && a.length === b.length && a.every(function (v, i) { return v === b[i]; });
  }

  function samePattern(a, b) {
    if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) return false;
    for (var i = 0; i < a.length; i++) {
      var x = a[i], y = b[i];
      if (x === y) continue;
      if (!x || !y || x.id !== y.id || x.type !== y.type || x.brand !== y.brand || !sameRgb(x.rgb, y.rgb)) return false;
    }
    return true;
  }

  // True when remote differs from base in marks and sessions only, and the pattern
  // we hold is the pattern it holds.
  function canMerge(base, local, remote) { return whyNot(base, local, remote) === null; }

  // null when the merge can go ahead, otherwise what stops it (for the console).
  function whyNot(base, local, remote) {
    if (!base || !remote) return "missing";
    // Unchanged by the other tab if it matches what we started from or what we have now
    // (a loaded record and a saved snapshot can spell a cell's brand or type differently).
    if (!samePattern(base.pattern, remote.pattern) && !(local && samePattern(local.pattern, remote.pattern))) return "pattern";
    if (local && local.pattern && local.pattern.length !== remote.pattern.length) return "local pattern";
    var done = remote.done;
    if (!Array.isArray(done) || done.length !== remote.pattern.length) return "done";
    var keys = {};
    [base, remote].forEach(function (o) { Object.keys(o).forEach(function (k) { keys[k] = 1; }); });
    var names = Object.keys(keys);
    for (var i = 0; i < names.length; i++) {
      var k = names[i];
      if (NOT_COMPARED[k]) continue;
      // Unchanged by the other tab: it matches what we started from, or what we have now
      // (a record that was loaded and one that was built can spell the same thing differently).
      if (!same(base[k], remote[k]) && !(local && same(local[k], remote[k]))) return k;
    }
    return null;
  }

  // Per cell: the other tab's value if it changed since base, otherwise ours.
  function mergeDone(base, local, remote) {
    var n = local.length, out = new Array(n);
    for (var i = 0; i < n; i++) out[i] = remote[i] !== base[i] ? remote[i] : local[i];
    return out;
  }

  function entriesToMap(list) {
    var m = new Map();
    (Array.isArray(list) ? list : []).forEach(function (e) { if (e && e.length === 2) m.set(e[0], e[1]); });
    return m;
  }

  // halfDone is a list of [cellIndex, { fwd, bck }]. Merged per cell and per side.
  function mergeHalfDone(base, local, remote) {
    var b = entriesToMap(base), l = entriesToMap(local), r = entriesToMap(remote);
    var keys = new Set();
    [b, l, r].forEach(function (m) { m.forEach(function (_, k) { keys.add(k); }); });
    var out = [];
    keys.forEach(function (k) {
      var bv = b.get(k) || {}, lv = l.get(k) || {}, rv = r.get(k) || {}, merged = {};
      ["fwd", "bck"].forEach(function (side) {
        var v = !!rv[side] !== !!bv[side] ? rv[side] : lv[side];
        if (v) merged[side] = v;
      });
      if (merged.fwd || merged.bck) out.push([k, merged]);
    });
    return out;
  }

  // A set of keys: kept if the other tab did not remove it, added if the other tab added it.
  function mergeSet(base, local, remote) {
    var b = new Set(base || []), l = new Set(local || []), r = new Set(remote || []);
    var out = [];
    l.forEach(function (k) { if (r.has(k) || !b.has(k)) out.push(k); });
    r.forEach(function (k) { if (!b.has(k) && !l.has(k)) out.push(k); });
    return out;
  }

  // Sessions by id, three ways. A session this tab already had (base) and the other tab no
  // longer has was deleted there. One the other tab changed since base (a note, a duration)
  // takes the other tab's version; otherwise ours. New sessions on either side are kept.
  function mergeSessions(base, local, remote) {
    var inBase = {}, inRemote = {}, have = {}, out = [];
    (base || []).forEach(function (s) { if (s && s.id != null) inBase[s.id] = s; });
    (remote || []).forEach(function (s) { if (s && s.id != null) inRemote[s.id] = s; });
    (local || []).forEach(function (s) {
      if (!s) return;
      if (s.id == null) { out.push(s); return; }
      if (inBase[s.id] && !inRemote[s.id]) return;
      have[s.id] = 1;
      var r = inRemote[s.id];
      out.push(r && inBase[s.id] && !same(r, inBase[s.id]) ? r : s);
    });
    (remote || []).forEach(function (s) {
      if (s && s.id != null && !have[s.id] && !inBase[s.id]) { have[s.id] = 1; out.push(s); }
    });
    return out;
  }

  function mergeMilestones(local, remote) {
    var seen = {}, out = [];
    (local || []).concat(remote || []).forEach(function (m) {
      var k = m && typeof m === "object" ? JSON.stringify(m) : String(m);
      if (!seen[k]) { seen[k] = 1; out.push(m); }
    });
    return out;
  }

  var api = {
    canMerge: canMerge, whyNot: whyNot, samePattern: samePattern, mergeDone: mergeDone,
    mergeHalfDone: mergeHalfDone, mergeSet: mergeSet, mergeSessions: mergeSessions,
    mergeMilestones: mergeMilestones
  };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.TrackingMerge = api;
})(typeof window !== "undefined" ? window : this);
