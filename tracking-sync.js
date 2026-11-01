/* Causal completion registers for .csync. Cross-tab merging still uses TrackingMerge's loaded base.
 * Each mark keeps the frontier of edits, with a vector clock per edit. Observed edits are superseded;
 * concurrent edits are retained and unpick wins until a subsequent explicit mark observes both.
 * Empty legacy fields carry no removal evidence. Never infer a deletion during import.
 */
(function (root) {
  var fields = ['done', 'halfDone', 'partialDone', 'knotsDone', 'bsDone', 'beadsDone', 'specialtyDone'];
  var own = function (o, k) { return Object.prototype.hasOwnProperty.call(o, k); };
  var actor = 'tab-' + (typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36) + Math.random().toString(36).slice(2));
  function index(v) {
    if (v == null || typeof v === 'boolean' || (typeof v === 'string' && !v.trim())) return null;
    var n = Number(v);
    return Number.isSafeInteger(n) && n >= 0 ? n : null;
  }
  function hasDone(p) { return !!p && (Array.isArray(p.done) || ArrayBuffer.isView(p.done)); }
  function marks(p) {
    var out = Object.create(null);
    if (hasDone(p)) {
      for (var i = 0; i < p.done.length; i++) if (p.done[i]) out['d:' + i] = 1;
    }
    var other = otherMarks(p);
    Object.keys(other).forEach(function (k) { out[k] = 1; });
    return out;
  }
  // Every mark but full crosses: few, so these are always listed in full.
  function otherMarks(p) {
    var out = Object.create(null);
    if (!p) return out;
    [['halfDone', 'h:', ['fwd', 'bck']], ['partialDone', 'q:', ['TL', 'TR', 'BL', 'BR']]].forEach(function (spec) {
      (Array.isArray(p[spec[0]]) ? p[spec[0]] : []).forEach(function (e) {
        if (!Array.isArray(e) || e.length !== 2) return;
        var n = index(e[0]);
        if (n === null || !e[1]) return;
        spec[2].forEach(function (s) {
          if (spec[0] === 'halfDone' ? e[1][s] : Array.isArray(e[1]) && e[1].indexOf(s) >= 0) out[spec[1] + n + ':' + s] = 1;
        });
      });
    });
    [['knotsDone', 'k:'], ['bsDone', 'b:'], ['beadsDone', 'e:'], ['specialtyDone', 's:']].forEach(function (spec) {
      (Array.isArray(p[spec[0]]) ? p[spec[0]] : []).forEach(function (k) { if (typeof k === 'string') out[spec[1] + k] = 1; });
    });
    return out;
  }
  function validKey(k) { return /^(d:\d+|h:\d+:(fwd|bck)|q:\d+:(TL|TR|BL|BR)|[kbse]:.+)$/.test(k); }
  function cleanEvent(e) {
    if (!e || (e.value !== 0 && e.value !== 1) || !e.clock || typeof e.clock !== 'object' || Array.isArray(e.clock)) return null;
    var clock = Object.create(null);
    var keys = Object.keys(e.clock).sort();
    for (var i = 0; i < keys.length; i++) {
      var n = e.clock[keys[i]];
      if (!Number.isSafeInteger(n) || n < 1 || keys[i] === '__proto__') return null;
      Object.defineProperty(clock, keys[i], { value: n, enumerable: true, writable: true, configurable: true });
    }
    // An unversioned legacy seed may add a mark, but cannot remove one.
    if (!keys.length && !e.value) return null;
    return { value: e.value, clock: clock };
  }
  function dominates(a, b) {
    return Object.keys(b).every(function (k) { return (own(a, k) ? a[k] : 0) >= b[k]; });
  }
  /* Registers are never edited once made, so identical ones are kept as one
     shared array. A chart that is well under way holds one register per
     finished stitch, nearly all alike ([{value:1,clock:{}}], or one tab's
     first mark); sharing them means IndexedDB stores and clones each distinct
     one once (structured clone keeps shared references, and reads them back
     shared), and normalising a register read back is done once per distinct
     array instead of once per stitch. JSON (sync files, backups) is unchanged. */
  var INTERN_MAX = 4096;
  var interned = new Map();                       // JSON of a register -> its one shared array
  var normalised = typeof WeakMap === 'function' ? new WeakMap() : null;   // array as read -> frontier
  function intern(list) {
    if (!list.length) return list;
    var key = JSON.stringify(list), hit = interned.get(key);
    if (hit) return hit;
    if (interned.size >= INTERN_MAX) interned.clear();
    interned.set(key, list);
    return list;
  }
  var SEED = [{ value: 1, clock: {} }];
  function seed() { return intern(SEED); }
  // frontier() of a register read from storage, remembered per array.
  function normalisedFrontier(list) {
    var hit = normalised && normalised.get(list);
    if (hit) return hit;
    var f = intern(frontier(list));
    if (normalised) normalised.set(list, f);
    return f;
  }
  function frontier(list) {
    var byClock = new Map();
    list.forEach(function (raw) {
      var e = cleanEvent(raw);
      if (!e) return;
      var k = JSON.stringify(e.clock), prev = byClock.get(k);
      if (!prev || e.value < prev.value) byClock.set(k, e);
    });
    var all = Array.from(byClock.values());
    return all.filter(function (e, i) { return !all.some(function (other, j) { return i !== j && dominates(other.clock, e.clock); }); })
      .sort(function (a, b) { return JSON.stringify(a).localeCompare(JSON.stringify(b)); });
  }
  // The order registers are read in does not matter: every consumer sorts.
  function records(p) {
    var out = Object.create(null), meta = p && p.trackingSync;
    if (meta && meta.version === 1 && meta.marks && typeof meta.marks === 'object') {
      var keys = Object.keys(meta.marks);
      for (var i = 0; i < keys.length; i++) {
        var k = keys[i], list = meta.marks[k];
        if (!validKey(k) || !Array.isArray(list)) continue;
        var f = normalisedFrontier(list);
        if (f.length) out[k] = f;
      }
    }
    Object.keys(otherMarks(p)).forEach(function (k) { if (!own(out, k)) out[k] = seed(); });
    if (hasDone(p)) {
      for (var j = 0; j < p.done.length; j++) if (p.done[j] && !own(out, 'd:' + j)) out['d:' + j] = seed();
    }
    return out;
  }
  function metadata(r) {
    var out = {};
    Object.keys(r).sort().forEach(function (k) { out[k] = r[k]; });
    return { version: 1, marks: out };
  }
  // Capture only explicit arrays. A serializer from an older build that omits a field cannot unpick it.
  // Called at the persistence boundary against the previous saved project/progress overlay.
  // What records() would read back from each output this module produced, kept
  // so the next save of the same chain need not re-read every register (see `from`).
  var readBack = typeof WeakMap === 'function' ? new WeakMap() : null;
  // Only the marks that differ between base and next get a new register. Full
  // crosses are compared array to array rather than listed as keys first: on a
  // well-progressed chart that listing, done twice per save, was most of the cost.
  //
  // `from`, optional: the `trackingSync.marks` object an earlier record() call
  // returned, when the caller knows base.trackingSync is that output read back
  // from storage (ProjectStorage.saveProgress checks its own last write). The
  // registers are then taken from that call instead of re-read from base. Each
  // output can be used this way once; anything unknown falls back to reading.
  function record(base, next, author, from) {
    base = base || {};
    var r = null;
    if (from && readBack) { r = readBack.get(from) || null; readBack.delete(from); }
    if (!r) r = records(base);
    var out = Object.assign({}, next), written = [];
    fields.forEach(function (f) { if (next[f] == null && base[f] != null) out[f] = base[f]; });
    var prefix = { d: 'done', h: 'halfDone', q: 'partialDone', k: 'knotsDone', b: 'bsDone', e: 'beadsDone', s:'specialtyDone' };
    var a = author || actor;
    function write(k, on) {
      var clock = Object.create(null);
      (r[k] || []).forEach(function (e) { Object.keys(e.clock).forEach(function (x) { clock[x] = Math.max(clock[x] || 0, e.clock[x]); }); });
      clock[a] = (clock[a] || 0) + 1;
      r[k] = intern([{ value: on ? 1 : 0, clock: clock }]);
      written.push(k);
    }
    var before = otherMarks(base), after = otherMarks(next);
    new Set(Object.keys(before).concat(Object.keys(after))).forEach(function (k) {
      var field = prefix[k[0]];
      if (!Array.isArray(next[field]) && !ArrayBuffer.isView(next[field])) return;
      if (!!before[k] === !!after[k]) return;
      write(k, after[k]);
    });
    if (hasDone(next)) {
      var bd = hasDone(base) ? base.done : null, nd = next.done, n = Math.max(nd.length, bd ? bd.length : 0);
      for (var i = 0; i < n; i++) {
        var was = !!(bd && bd[i]), on = !!nd[i];
        if (was !== on) write('d:' + i, on);
      }
    }
    // New projects and unchanged legacy marks acquire positive seeds, never invented removals.
    // (Marks unchanged since base already have one from records(base); changed marks were just written.)
    var seeded = [];
    Object.keys(after).forEach(function (k) { if (!own(r, k)) { r[k] = seed(); seeded.push(k); } });
    out.trackingSync = metadata(r);
    if (readBack) {
      // records() of the stored copy normalises each register (clock keys sorted),
      // drops a name it does not accept and seeds it again if it is marked.
      // Only keys this call added can be ones it does not accept: the rest came from
      // records() or an earlier pass of this.
      written.forEach(function (k) { r[k] = intern(frontier(r[k])); });
      written.concat(seeded).forEach(function (k) {
        if (k.charCodeAt(0) === 100 || validKey(k)) return;   // 'd:<n>' is always valid
        if (after[k]) r[k] = seed(); else delete r[k];
      });
      readBack.set(out.trackingSync.marks, r);
    }
    return out;
  }
  /* Progress records hold only the registers that differ from their base's.
     ProjectStorage's progress record used to carry trackingSync for the whole
     chart: one register per finished stitch, read back, rebuilt, sorted and
     written again on every progress write (most of a second on a phone at
     30% of a 200 000-stitch chart, as a freeze shortly after marking). It is
     based on one full save (its baseWriteAt), and that save already holds
     every register the marks have not changed since, so the record now keeps
     just the changed ones: a "delta" of { version: 1, marks: { key: register } }.

     `p` below is always the base project (its trackingSync as saved) with a
     progress record's marks laid over it. withDelta(p, delta) is then
     records(p) with the delta's registers in place, the trackingSync the
     record stands for, and gives what record() would have stored, as
     records() reads it back. */
  // records(p)[k] for one key, without listing them all. `other` is otherMarks(p).
  function baseRegister(p, k, other) {
    var meta = p && p.trackingSync;
    if (meta && meta.version === 1 && meta.marks && typeof meta.marks === 'object' && own(meta.marks, k) && validKey(k) && Array.isArray(meta.marks[k])) {
      var f = normalisedFrontier(meta.marks[k]);
      if (f.length) return f;
    }
    if (own(other, k)) return seed();
    if (k.charCodeAt(0) === 100 && hasDone(p)) {   // 'd:<n>', seeded by records() only in that spelling
      var i = Number(k.slice(2));
      if (String(i) === k.slice(2) && p.done[i]) return seed();
    }
    return null;
  }
  // A delta as read from storage: valid keys only, each register normalised.
  function cleanDelta(delta) {
    var out = Object.create(null), m = delta && delta.version === 1 && delta.marks;
    if (!m || typeof m !== 'object') return out;
    Object.keys(m).forEach(function (k) {
      if (!validKey(k) || !Array.isArray(m[k])) return;
      var f = normalisedFrontier(m[k]);
      if (f.length) out[k] = f;
    });
    return out;
  }
  // The progress record that follows one whose marks `previous` carries (over
  // the base's trackingSync) and whose registers were `delta`: `delta` plus a
  // register for each mark that differs between `previous` and `next`. The
  // same writes record(previous with the full trackingSync, next) would make,
  // in time proportional to the chart's cells and the delta, not the marks.
  function recordDelta(previous, delta, next, author) {
    previous = previous || {};
    var out = cleanDelta(delta), a = author || actor;
    var before = otherMarks(previous), after = otherMarks(next);
    var prefix = { d: 'done', h: 'halfDone', q: 'partialDone', k: 'knotsDone', b: 'bsDone', e: 'beadsDone', s: 'specialtyDone' };
    function write(k, on) {
      // A name records() does not accept is never read back: it is seeded
      // again while marked, so a register for it would be dropped anyway.
      if (k.charCodeAt(0) !== 100 && !validKey(k)) return;
      var clock = Object.create(null), cur = own(out, k) ? out[k] : baseRegister(previous, k, before);
      (cur || []).forEach(function (e) { Object.keys(e.clock).forEach(function (x) { clock[x] = Math.max(clock[x] || 0, e.clock[x]); }); });
      clock[a] = (clock[a] || 0) + 1;
      out[k] = intern(frontier([{ value: on ? 1 : 0, clock: clock }]));
    }
    new Set(Object.keys(before).concat(Object.keys(after))).forEach(function (k) {
      var field = prefix[k[0]];
      if (!Array.isArray(next[field]) && !ArrayBuffer.isView(next[field])) return;
      if (!!before[k] === !!after[k]) return;
      write(k, after[k]);
    });
    if (hasDone(next)) {
      var bd = hasDone(previous) ? previous.done : null, nd = next.done, n = Math.max(nd.length, bd ? bd.length : 0);
      for (var i = 0; i < n; i++) {
        var was = !!(bd && bd[i]), on = !!nd[i];
        if (was !== on) write('d:' + i, on);
      }
    }
    return { version: 1, marks: out };
  }
  function withDelta(p, delta) {
    var r = records(p), d = cleanDelta(delta);
    Object.keys(d).forEach(function (k) { r[k] = d[k]; });
    return metadata(r);
  }
  // The delta for a full trackingSync (from an older build's progress record):
  // its registers that differ from records(p).
  function deltaFrom(p, full) {
    var out = Object.create(null), m = full && full.version === 1 && full.marks, other = otherMarks(p);
    if (!m || typeof m !== 'object') return { version: 1, marks: out };
    Object.keys(m).forEach(function (k) {
      if (!validKey(k) || !Array.isArray(m[k])) return;
      var f = normalisedFrontier(m[k]);
      if (!f.length) return;
      var b = baseRegister(p, k, other);
      if (f !== b && (!b || JSON.stringify(f) !== JSON.stringify(b))) out[k] = f;
    });
    return { version: 1, marks: out };
  }
  function merge(local, remote) {
    var l = records(local), r = records(remote), all = Object.create(null), active = Object.create(null);
    Array.from(new Set(Object.keys(l).concat(Object.keys(r)))).sort().forEach(function (k) {
      // records() registers are already frontiers, and frontier() of a frontier is
      // itself: only a key both sides hold needs combining.
      all[k] = l[k] && r[k] ? intern(frontier(l[k].concat(r[k]))) : (l[k] || r[k]);
      if (all[k].length && all[k].every(function (e) { return e.value === 1; })) active[k] = 1;
    });
    var out = { trackingSync: metadata(all) };
    var len = ((local.pattern || remote.pattern || local.p || remote.p) || []).length;
    out.done = local.done == null && remote.done == null && !Object.keys(all).some(function (k) { return k[0] === 'd'; })
      ? null : Array.from({ length: len }, function (_, i) { return active['d:' + i] ? 1 : 0; });
    function pairs(prefix, sides, quarter) {
      var cells = new Map();
      Object.keys(active).forEach(function (k) {
        if (k.slice(0, 2) !== prefix) return;
        var parts = k.split(':'), n = Number(parts[1]);
        var v = cells.get(n) || (quarter ? [] : {});
        if (quarter) { if (v.indexOf(parts[2]) < 0) v.push(parts[2]); } else v[parts[2]] = 1;
        cells.set(n, v);
      });
      return Array.from(cells).sort(function (a, b) { return a[0] - b[0]; }).map(function (e) {
        if (quarter) e[1] = sides.filter(function (s) { return e[1].indexOf(s) >= 0; });
        else { var v = {}; sides.forEach(function (s) { if (e[1][s]) v[s] = 1; }); e[1] = v; }
        return e;
      });
    }
    out.halfDone = pairs('h:', ['fwd', 'bck'], false);
    [['partialDone', 'q:'], ['knotsDone', 'k:'], ['bsDone', 'b:'], ['beadsDone', 'e:'], ['specialtyDone', 's:']].forEach(function (spec) {
      if (Array.isArray(local[spec[0]]) || Array.isArray(remote[spec[0]]) || Object.keys(all).some(function (k) { return k.slice(0, 2) === spec[1]; })) {
        out[spec[0]] = spec[0] === 'partialDone' ? pairs('q:', ['TL', 'TR', 'BL', 'BR'], true)
          : Object.keys(active).filter(function (k) { return k.slice(0, 2) === spec[1]; }).map(function (k) { return k.slice(2); }).sort();
      }
    });
    return out;
  }
  // Multi-value causal registers for fields that cannot be safely unioned.
  var valueFields = ['name', 'state', 'finishStatus', 'projectColor', 'notes', 'description', 'designer', 'settings', 'threadOwned', 'parkMarkers'];
  function canonical(v) {
    if (Array.isArray(v)) return '[' + v.map(canonical).join(',') + ']';
    if (v && typeof v === 'object') return '{' + Object.keys(v).sort().map(function(k) { return JSON.stringify(k) + ':' + canonical(v[k]); }).join(',') + '}';
    return JSON.stringify(v);
  }
  function valueFrontier(events) {
    var byEvent = new Map();
    (events || []).forEach(function(e) {
      if (!e || !own(e, 'value') || !e.clock || typeof e.clock !== 'object' || Array.isArray(e.clock)) throw new Error('Invalid sync register');
      var clock = Object.create(null);
      Object.keys(e.clock).sort().forEach(function(k) {
        if (!Number.isSafeInteger(e.clock[k]) || e.clock[k] < 1 || k === '__proto__') throw new Error('Invalid sync clock');
        clock[k] = e.clock[k];
      });
      var event = {value:e.value, clock:clock};
      byEvent.set(canonical(event), event);
    });
    var all = Array.from(byEvent.values());
    return all.filter(function(e, i) { return !all.some(function(o,j) {
      return i !== j && dominates(o.clock,e.clock) && !dominates(e.clock,o.clock);
    }); }).sort(function(a,b) { return canonical(a).localeCompare(canonical(b)); });
  }
  function valueRecord(events, value, author) {
    var old = valueFrontier(events);
    if (old.length === 1 && canonical(old[0].value) === canonical(value)) return old;
    var clock = Object.create(null);
    old.forEach(function(e) { Object.keys(e.clock).forEach(function(k) { clock[k] = Math.max(clock[k] || 0,e.clock[k]); }); });
    var a = author || actor;
    clock[a] = (clock[a] || 0) + 1;
    return [{value:value, clock:clock}];
  }
  function valuesOf(p) {
    var values = {};
    valueFields.forEach(function(f) { if (p && own(p,f)) values[f] = p[f]; });
    ['statsSessions','sessions'].forEach(function(field) {
      (p && p[field] || []).forEach(function(row) {
        if (!row) return;
        var id = row.id || row.startTime || row.start || row.date;
        if (id != null) { var authored = Object.assign({},row); delete authored.totalAtEnd; delete authored.percentAtEnd; values['journal_' + field + '_' + encodeURIComponent(id)] = authored; }
      });
    });
    return values;
  }
  function fieldsOf(a,b) {
    return Array.from(new Set(valueFields.concat(Object.keys(valuesOf(a)),Object.keys(valuesOf(b)),
      Object.keys(a && a.valueSync && a.valueSync.fields || {}),Object.keys(b && b.valueSync && b.valueSync.fields || {})))).sort();
  }
  function valueEvents(p, field) {
    var meta = p && p.valueSync;
    if (meta && meta.version !== 1) throw new Error('Unsupported value sync version');
    var events = meta && meta.fields && meta.fields[field];
    if (events) return valueFrontier(events);
    var values = valuesOf(p);
    return own(values,field) ? [{value:values[field],clock:{}}] : [];
  }
  function mergeValues(local, remote, choices) {
    var fields = {}, values = {}, conflicts = [];
    var lValues = valuesOf(local), rValues = valuesOf(remote);
    fieldsOf(local,remote).forEach(function(f) {
      // Legacy parking lists were additive; only authored registers prove removal.
      if (f === 'parkMarkers' && !(local.valueSync && local.valueSync.fields[f]) && !(remote.valueSync && remote.valueSync.fields[f])) return;
      var events = valueFrontier(valueEvents(local,f).concat(valueEvents(remote,f)));
      var distinct = new Set(events.map(function(e) { return canonical(e.value); }));
      if (distinct.size > 1) {
        var choice = choices && choices[f];
        if (choice === 'keep-local' || choice === 'keep-remote') events = valueRecord(events, (choice === 'keep-local' ? lValues : rValues)[f]);
        else conflicts.push(f);
      }
      if (events.length) {
        fields[f] = events;
        if (distinct.size <= 1 || (choices && choices[f])) values[f] = events[0].value;
      }
    });
    return {values:values, valueSync:{version:1,fields:fields}, conflicts:conflicts};
  }
  var recordMarks = record;
  record = function(base,next,author,from) {
    var out = recordMarks(base,next,author,from), fields = {};
    valueFields.forEach(function(f) { if (!own(next,f) && base && own(base,f)) out[f] = base[f]; });
    var beforeValues = valuesOf(base), nextValues = valuesOf(next);
    fieldsOf(base,next).forEach(function(f) {
      var events = valueEvents(base,f);
      if (own(nextValues,f) && canonical(nextValues[f]) !== canonical(beforeValues[f])) events = valueRecord(events,nextValues[f],author);
      if (events.length) fields[f] = events;
    });
    out.valueSync = {version:1,fields:fields};
    return out;
  };
  var api = { record: record, recordDelta: recordDelta, withDelta: withDelta, deltaFrom: deltaFrom, merge: merge, marks: marks, mergeValues: mergeValues, valueRecord: valueRecord, valueFrontier: valueFrontier, canonical: canonical, valuesOf: valuesOf };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.TrackingSync = api;
})(typeof window !== 'undefined' ? window : this);
