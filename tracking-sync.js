/* Causal completion registers for .csync. Cross-tab merging still uses TrackingMerge's loaded base.
 * Each mark keeps the frontier of edits, with a vector clock per edit. Observed edits are superseded;
 * concurrent edits are retained and unpick wins until a subsequent explicit mark observes both.
 * Empty legacy fields carry no removal evidence. Never infer a deletion during import.
 */
(function (root) {
  var fields = ['done', 'halfDone', 'partialDone', 'knotsDone', 'bsDone', 'specialtyDone'];
  var own = function (o, k) { return Object.prototype.hasOwnProperty.call(o, k); };
  var actor = 'tab-' + (typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36) + Math.random().toString(36).slice(2));
  function index(v) {
    if (v == null || typeof v === 'boolean' || (typeof v === 'string' && !v.trim())) return null;
    var n = Number(v);
    return Number.isSafeInteger(n) && n >= 0 ? n : null;
  }
  function marks(p) {
    var out = Object.create(null);
    if (!p) return out;
    if (Array.isArray(p.done) || ArrayBuffer.isView(p.done)) Array.from(p.done).forEach(function (v, i) { if (v) out['d:' + i] = 1; });
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
    [['knotsDone', 'k:'], ['bsDone', 'b:'], ['specialtyDone', 's:']].forEach(function (spec) {
      (Array.isArray(p[spec[0]]) ? p[spec[0]] : []).forEach(function (k) { if (typeof k === 'string') out[spec[1] + k] = 1; });
    });
    return out;
  }
  function validKey(k) { return /^(d:\d+|h:\d+:(fwd|bck)|q:\d+:(TL|TR|BL|BR)|[kbs]:.+)$/.test(k); }
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
  function records(p) {
    var out = Object.create(null), meta = p && p.trackingSync;
    if (meta && meta.version === 1 && meta.marks && typeof meta.marks === 'object') {
      Object.keys(meta.marks).sort().forEach(function (k) {
        if (!validKey(k) || !Array.isArray(meta.marks[k])) return;
        var f = frontier(meta.marks[k]);
        if (f.length) out[k] = f;
      });
    }
    Object.keys(marks(p)).forEach(function (k) { if (!own(out, k)) out[k] = [{ value: 1, clock: {} }]; });
    return out;
  }
  function metadata(r) {
    var out = {};
    Object.keys(r).sort().forEach(function (k) { out[k] = r[k]; });
    return { version: 1, marks: out };
  }
  // Capture only explicit arrays. A serializer from an older build that omits a field cannot unpick it.
  // Called at the persistence boundary against the previous saved project/progress overlay.
  function record(base, next, author) {
    base = base || {};
    var out = Object.assign({}, next), before = marks(base), after = marks(next), r = records(base);
    fields.forEach(function (f) { if (next[f] == null && base[f] != null) out[f] = base[f]; });
    var prefix = { d: 'done', h: 'halfDone', q: 'partialDone', k: 'knotsDone', b: 'bsDone', s:'specialtyDone' };
    var keys = new Set(Object.keys(before).concat(Object.keys(after)));
    keys.forEach(function (k) {
      var field = prefix[k[0]];
      if (!Array.isArray(next[field]) && !ArrayBuffer.isView(next[field])) return;
      if (!!before[k] === !!after[k]) return;
      var clock = Object.create(null);
      (r[k] || []).forEach(function (e) { Object.keys(e.clock).forEach(function (a) { clock[a] = Math.max(clock[a] || 0, e.clock[a]); }); });
      var a = author || actor;
      clock[a] = (clock[a] || 0) + 1;
      r[k] = [{ value: after[k] ? 1 : 0, clock: clock }];
    });
    // New projects and unchanged legacy marks acquire positive seeds, never invented removals.
    Object.keys(after).forEach(function (k) { if (!own(r, k)) r[k] = [{ value: 1, clock: {} }]; });
    out.trackingSync = metadata(r);
    return out;
  }
  function merge(local, remote) {
    var l = records(local), r = records(remote), all = Object.create(null), active = Object.create(null);
    Array.from(new Set(Object.keys(l).concat(Object.keys(r)))).sort().forEach(function (k) {
      all[k] = frontier((l[k] || []).concat(r[k] || []));
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
    [['partialDone', 'q:'], ['knotsDone', 'k:'], ['bsDone', 'b:'], ['specialtyDone', 's:']].forEach(function (spec) {
      if (Array.isArray(local[spec[0]]) || Array.isArray(remote[spec[0]]) || Object.keys(all).some(function (k) { return k.slice(0, 2) === spec[1]; })) {
        out[spec[0]] = spec[0] === 'partialDone' ? pairs('q:', ['TL', 'TR', 'BL', 'BR'], true)
          : Object.keys(active).filter(function (k) { return k.slice(0, 2) === spec[1]; }).map(function (k) { return k.slice(2); }).sort();
      }
    });
    return out;
  }
  var api = { record: record, merge: merge, marks: marks };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.TrackingSync = api;
})(typeof window !== 'undefined' ? window : this);
