/* sync-merge-helpers.js: the pure record-merge primitives that SyncEngine.mergeTrackingProgress is built from.
 *
 * Sessions and their tombstones, the running totals rebuilt after two journals are joined, fractional-stitch
 * pairs, the per-day stitch log, parking markers, the work area, lifecycle dates, and the legacy done-array union.
 * Every function takes its inputs as arguments and returns its result. None reads storage, keys, timers or
 * globals, and none is asynchronous. The two that copy structures (mergeIndexedPairs, mergeParkingMarkers) take
 * the copy function as their last argument, so sync-engine.js keeps deciding between structuredClone and the JSON
 * fallback.
 *
 * sync-engine.js calls these through thin wrappers that keep its original function names; it does not re-export
 * this object. Loaded as a plain <script> before sync-engine.js on every page that loads it, from sw.js's
 * precache list, and by require() in tests.
 */
(function (root) {
  // Legacy, unversioned union only. Project imports use TrackingSync registers.
  function mergeDoneArrays(localDone, remoteDone, length) {
    if (!localDone && !remoteDone) return null;
    if (!localDone) return remoteDone;
    if (!remoteDone) return localDone;
    var merged = new Array(length);
    for (var i = 0; i < length; i++) {
      merged[i] = (localDone[i] || remoteDone[i]) ? 1 : 0;
    }
    return merged;
  }

  // Sessions are a union by id. The same id on both sides keeps the later edit (`editedAt`; a record never edited
  // counts as the oldest, so the local one stays). `deletedIds` are the tombstones of both devices: a session deleted
  // on either one is not brought back by the other. Records without an id fall back to date + minutes + stitches.
  function mergeSessions(localSessions, remoteSessions, deletedIds) {
    var gone = {};
    (deletedIds || []).forEach(function (x) { gone[x] = true; });
    function alive(s) { return s && !(s.id != null && gone[s.id]); }
    var localList = (localSessions || []).filter(alive);
    var remoteList = (remoteSessions || []).filter(alive);
    if (!localList.length) return remoteList;
    if (!remoteList.length) return localList;
    function sessionKey(s) {
      if (s.id != null) return "i:" + s.id;
      if (s.start) return "s:" + s.start;
      return "d:" + (s.date || "") + ":" + (s.durationMinutes || 0) + ":" + (s.netStitches || 0);
    }
    function editedAt(s) { var t = s && s.editedAt ? new Date(s.editedAt).getTime() : 0; return isNaN(t) ? 0 : t; }
    var at = {};
    var merged = [];
    for (var i = 0; i < localList.length; i++) {
      var key = sessionKey(localList[i]);
      if (at[key] === undefined) { at[key] = merged.length; merged.push(localList[i]); }
    }
    for (var j = 0; j < remoteList.length; j++) {
      var key2 = sessionKey(remoteList[j]);
      if (at[key2] === undefined) { at[key2] = merged.length; merged.push(remoteList[j]); }
      else if (editedAt(remoteList[j]) > editedAt(merged[at[key2]])) merged[at[key2]] = remoteList[j];
    }
    merged.sort(function (a, b) {
      return new Date(a.startTime || a.start || a.date || 0) - new Date(b.startTime || b.start || b.date || 0);
    });
    return merged;
  }

  // After two journals are joined, each record still carries the "done so far" its own device wrote, which does not
  // include what the other device added or changed. Rebuild them as a running sum from the stitches that were done
  // before the first record (the same on both sides, so either side's will do). Records that come out the same stay
  // as they are.
  function recomputeMergedTotals(merged, localList, remoteList) {
    function net(s) { return s.units != null ? s.units : (s.netStitches || 0); }
    function startMs(s) { var t = new Date(s.startTime || s.start || s.date || 0).getTime(); return isNaN(t) ? 0 : t; }
    function baselineOf(list) {
      var first = (list || []).slice().sort(function (a, b) { return startMs(a) - startMs(b); })[0];
      return first && typeof first.totalAtEnd === "number" ? Math.max(0, first.totalAtEnd - net(first)) : null;
    }
    if (!merged.length) return merged;
    var base = baselineOf(localList);
    if (base == null) base = baselineOf(remoteList);
    if (base == null) return merged;
    // The size of the project, worked out from the record with the most precise percentage, to cap the total and
    // to give a changed record its percentage.
    var total = 0, bestPct = 0;
    merged.forEach(function (s) {
      if (typeof s.totalAtEnd === "number" && typeof s.percentAtEnd === "number" && s.percentAtEnd > bestPct) { bestPct = s.percentAtEnd; total = s.totalAtEnd * 100 / s.percentAtEnd; }
    });
    var run = base;
    return merged.slice().sort(function (a, b) { return startMs(a) - startMs(b); }).map(function (s) {
      run += net(s);
      var at = Math.max(0, run);
      if (total > 0) at = Math.min(at, Math.round(total));
      if (s.totalAtEnd === at) return s;
      var copy = Object.assign({}, s, { totalAtEnd: at });
      if (total > 0) copy.percentAtEnd = Math.round(at / total * 1000) / 10;
      return copy;
    });
  }

  function mergeDeletedIds(a, b) {
    var seen = {}, out = [];
    (a || []).concat(b || []).forEach(function (x) { if (x != null && !seen[x]) { seen[x] = true; out.push(x); } });
    return out;
  }

  // Total duration (seconds) recorded across a session array. Mirrors the
  // field precedence used by ProjectStorage.buildMeta so the two agree.
  function _sumSessionSeconds(sessions) {
    if (!sessions || !sessions.length) return 0;
    var total = 0;
    for (var i = 0; i < sessions.length; i++) {
      var s = sessions[i];
      if (!s) continue;
      if (typeof s.durationSeconds === "number" && isFinite(s.durationSeconds)) {
        total += s.durationSeconds;
      } else if (typeof s.durationMinutes === "number" && isFinite(s.durationMinutes)) {
        total += s.durationMinutes * 60;
      }
    }
    return total;
  }

  // Union of `[index, detail]` pair arrays — the serialised-Map shape used by
  // halfStitches ([idx, {fwd, bck}]) and partialStitches ([k, {TL,TR,BL,BR}]).
  // Local wins per sub-key so a device never loses its own fractional work;
  // remote contributes only the positions local hasn't recorded.
  function mergeIndexedPairs(localPairs, remotePairs, clone) {
    var lp = Array.isArray(localPairs) ? localPairs : [];
    var rp = Array.isArray(remotePairs) ? remotePairs : [];
    if (!lp.length && !rp.length) return Array.isArray(localPairs) ? localPairs : (Array.isArray(remotePairs) ? remotePairs : []);
    var byIndex = Object.create(null);
    var order = [];
    function absorb(pairs, isLocal) {
      for (var i = 0; i < pairs.length; i++) {
        var pair = pairs[i];
        if (!Array.isArray(pair) || pair.length < 2) continue;
        var key = String(pair[0]);
        var detail = pair[1];
        if (!Object.prototype.hasOwnProperty.call(byIndex, key)) {
          byIndex[key] = clone(detail);
          order.push({ key: key, raw: pair[0] });
          continue;
        }
        if (isLocal) continue; // local already claimed this index
        var existing = byIndex[key];
        if (existing && detail && typeof existing === "object" && typeof detail === "object") {
          var sub = Object.keys(detail);
          for (var s = 0; s < sub.length; s++) {
            if (existing[sub[s]] === undefined || existing[sub[s]] === null) {
              existing[sub[s]] = clone(detail[sub[s]]);
            }
          }
        }
      }
    }
    absorb(lp, true);
    absorb(rp, false);
    var out = [];
    for (var o = 0; o < order.length; o++) out.push([order[o].raw, byIndex[order[o].key]]);
    return out;
  }

  // Union of per-day stitch counts ([{date, count}]). Takes the MAX count per
  // date rather than the sum: summing is not idempotent, so a project re-merged
  // after each peer edit would inflate its history without bound. The cost is
  // under-counting a day both devices stitched on — the same trade-off, and for
  // the same reason, as merged totalTime.
  function mergeStitchLogs(localLog, remoteLog) {
    var ll = Array.isArray(localLog) ? localLog : [];
    var rl = Array.isArray(remoteLog) ? remoteLog : [];
    if (!ll.length && !rl.length) return Array.isArray(localLog) ? localLog : (Array.isArray(remoteLog) ? remoteLog : []);
    var byDate = Object.create(null);
    function absorb(entries) {
      for (var i = 0; i < entries.length; i++) {
        var e = entries[i];
        if (!e || !e.date) continue;
        var count = (typeof e.count === "number" && isFinite(e.count)) ? e.count : 0;
        if (byDate[e.date] === undefined || count > byDate[e.date]) byDate[e.date] = count;
      }
    }
    absorb(ll);
    absorb(rl);
    var dates = Object.keys(byDate).sort();
    var out = [];
    for (var d = 0; d < dates.length; d++) out.push({ date: dates[d], count: byDate[dates[d]] });
    return out;
  }

  // Earliest / latest of two ISO timestamps, ignoring blanks.
  function _earlierIso(a, b) {
    if (!a) return b || null;
    if (!b) return a;
    return (new Date(a).getTime() <= new Date(b).getTime()) ? a : b;
  }
  function _laterIso(a, b) {
    if (!a) return b || null;
    if (!b) return a;
    return (new Date(a).getTime() >= new Date(b).getTime()) ? a : b;
  }

  // Newer `setAt` wins; null means "never used" and loses to any value. A
  // tie keeps local so repeated merges are a no-op.
  function mergeWorkArea(local, remote) {
    if (!remote || typeof remote !== "object") return local || null;
    if (!local || typeof local !== "object") return remote;
    var lt = typeof local.setAt === "number" && isFinite(local.setAt) ? local.setAt : 0;
    var rt = typeof remote.setAt === "number" && isFinite(remote.setAt) ? remote.setAt : 0;
    return rt > lt ? remote : local;
  }

  function mergeParkingMarkers(local, remote, clone) {
    var parked = new Map();
    (Array.isArray(local) ? local : []).concat(Array.isArray(remote) ? remote : []).forEach(function (marker) {
      if (!marker || typeof marker !== "object") return;
      var positioned = marker.x != null && marker.y != null && isFinite(Number(marker.x)) && isFinite(Number(marker.y));
      if (positioned) marker = Object.assign({}, marker, { x: Number(marker.x), y: Number(marker.y), colorId: String(marker.colorId), corner: marker.corner || "BL" });
      var key = positioned ? JSON.stringify([marker.x, marker.y, marker.colorId, marker.corner])
        : marker.idx != null || marker.cellIdx != null
          ? JSON.stringify(["legacy", Number(marker.idx != null ? marker.idx : marker.cellIdx), marker.colorId, marker.corner || "BL"])
          : JSON.stringify(marker);
      // Deterministic payload for duplicate identities (e.g. stale cached RGB).
      var prev = parked.get(key);
      if (!prev || JSON.stringify(marker) < JSON.stringify(prev)) parked.set(key, marker);
    });
    return Array.from(parked.keys()).sort().map(function (key) { return clone(parked.get(key)); });
  }

  var api = {
    mergeDoneArrays: mergeDoneArrays, mergeSessions: mergeSessions, recomputeMergedTotals: recomputeMergedTotals,
    mergeDeletedIds: mergeDeletedIds, sumSessionSeconds: _sumSessionSeconds, mergeIndexedPairs: mergeIndexedPairs,
    mergeStitchLogs: mergeStitchLogs, earlierIso: _earlierIso, laterIso: _laterIso, mergeWorkArea: mergeWorkArea,
    mergeParkingMarkers: mergeParkingMarkers
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.SyncMergeHelpers = api;
})(typeof window !== 'undefined' ? window : this);
