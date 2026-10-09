/* blob-store.js — files kept in IndexedDB between pages and reloads
 * (audit COMMON-07).
 *
 * Uses CrossStitchDB's `pendingImports` object store (keyPath "id"), which
 * every opener (helpers.js, project-storage.js, sync-engine.js) already
 * creates, so there is no schema change. Records are told apart by id:
 *
 *   handoff:<random>   the picture Home hands to the Creator. Read once and
 *                      deleted; anything older than 30 minutes is swept.
 *   draft:<random>     a Convert draft: the picture and its conversion
 *                      settings, kept until the first pattern is generated.
 *   trace:<projectId>  a tracing picture for a scratch design (P2-4).
 *
 * Neither backups (backup-restore.js reads only the project stores) nor sync
 * read this store, and the project list, stats and sync only see projects.
 *
 *   BlobStore.put(id, record)   → Promise (record is stored with its id)
 *   BlobStore.get(id)           → Promise<record | null>
 *   BlobStore.delete(id)        → Promise
 *   BlobStore.list(prefix)      → Promise<record[]>, newest first
 *   BlobStore.sweep(prefix, maxAgeMs) → Promise<number deleted>
 *   BlobStore.newId(kind)       → "kind:<random>"
 *
 * Plain script; uses helpers.js getDB(). Tests can swap the opener with
 * BlobStore._setOpener(fn).
 */
(function (root) {
  'use strict';

  var STORE = 'pendingImports';
  var HANDOFF_TTL_MS = 30 * 60 * 1000;
  var opener = null;

  function openDb() {
    if (opener) return opener();
    if (typeof getDB === 'function') return getDB();
    return Promise.reject(new Error('IndexedDB is not available'));
  }

  function run(mode, fn) {
    return openDb().then(function (db) {
      return new Promise(function (resolve, reject) {
        var tx = db.transaction(STORE, mode);
        var result;
        tx.oncomplete = function () { resolve(result); };
        tx.onerror = function () { reject(tx.error); };
        tx.onabort = function () { reject(tx.error || new Error('Transaction aborted')); };
        var req = fn(tx.objectStore(STORE));
        if (req) req.onsuccess = function () { result = req.result; };
      });
    });
  }

  function put(id, record) {
    var rec = Object.assign({}, record, { id: id });
    if (!rec.createdAt) rec.createdAt = Date.now();
    rec.updatedAt = Date.now();
    return run('readwrite', function (s) { return s.put(rec); }).then(function () { return rec; });
  }

  function get(id) {
    return run('readonly', function (s) { return s.get(id); }).then(function (r) { return r || null; });
  }

  function del(id) {
    return run('readwrite', function (s) { return s.delete(id); });
  }

  function list(prefix) {
    return run('readonly', function (s) { return s.getAll(); }).then(function (all) {
      return (all || []).filter(function (r) {
        return r && typeof r.id === 'string' && (!prefix || r.id.indexOf(prefix) === 0);
      }).sort(function (a, b) { return (b.updatedAt || b.createdAt || 0) - (a.updatedAt || a.createdAt || 0); });
    });
  }

  function sweep(prefix, maxAgeMs, now) {
    var cutoff = (now || Date.now()) - (maxAgeMs == null ? HANDOFF_TTL_MS : maxAgeMs);
    return list(prefix).then(function (recs) {
      var old = recs.filter(function (r) { return (r.createdAt || 0) < cutoff; });
      return Promise.all(old.map(function (r) { return del(r.id); })).then(function () { return old.length; });
    });
  }

  function newId(kind) {
    return kind + ':' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  }

  function available() {
    try { return typeof indexedDB !== 'undefined' && !!indexedDB; } catch (_) { return false; }
  }

  var api = {
    put: put, get: get, delete: del, list: list, sweep: sweep, newId: newId,
    available: available, HANDOFF_TTL_MS: HANDOFF_TTL_MS,
    _setOpener: function (fn) { opener = fn; }
  };
  root.BlobStore = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
