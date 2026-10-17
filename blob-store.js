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
 *   photo:<projectId>:<id>       a progress photo kept with a project (photos.js), compressed JPEG.
 *   photothumb:<projectId>:<id>  its small thumbnail, in its own record so a list never reads a full picture.
 *
 * Backups carry photo, photothumb, trace and session records owned by saved projects;
 * progress journals are folded into project records. Handoffs, drafts and orphaned blobs are excluded. Sync carries owned attachments through a verified manifest;
 * attachment deletion evidence shares this store.
 *
 *   BlobStore.put(id, record)   → Promise (record is stored with its id)
 *   BlobStore.get(id)           → Promise<record | null>
 *   BlobStore.delete(id)        → Promise
 *   BlobStore.list(prefix)      → Promise<record[]>, newest first
 *   BlobStore.sweep(prefix, maxAgeMs) → Promise<number deleted>
 *   BlobStore.newId(kind)       → "kind:<random>"
 *   BlobStore.keys(prefix)      → Promise<string[]>, the ids that start with prefix (no record is read)
 *   BlobStore.deletePrefix(prefix) → Promise, deletes every record whose id starts with prefix
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
    rec.syncRevision = newId('revision');
    return run('readwrite', function (s) { return s.put(rec); }).then(function () { return rec; });
  }

  function get(id) {
    return run('readonly', function (s) { return s.get(id); }).then(function (r) { return r || null; });
  }

  // Record attachment removals in the same transaction as deleting the bytes.
  // Imports may arrive before the next export; absence alone is not evidence.
  function erase(key) {
    return run('readwrite', function(s) {
      var rows = s.getAll(key), manifest = s.get('sync:attachments'), ready = 0;
      function finish() {
        if (++ready !== 2) return;
        try {
          var known = new Map(((manifest.result || {}).manifest || []).map(function(e) { return [e.id,e]; }));
          rows.result.forEach(function(row) {
            var id = row.id;
            if (/^(trace|photo|photothumb):/.test(id)) {
              var pid = row.projectId || (id.indexOf('trace:') === 0 ? id.slice(6) : id.slice(id.indexOf(':') + 1,id.lastIndexOf(':')));
              known.set(id,{id:id,projectId:pid,deleted:true});
            }
            s.delete(id);
          });
          if (known.size > 10000) throw new Error('Attachment deletion record limit reached; explicitly reset sync.');
          s.put({id:'sync:attachments',manifest:Array.from(known.values())});
        } catch(e) { s.transaction.abort(); }
      }
      rows.onsuccess = finish; manifest.onsuccess = finish;
    });
  }

  function del(id) { return erase(id); }

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

  // A key range covering every string that starts with `prefix`.
  function prefixRange(prefix) {
    return IDBKeyRange.bound(prefix, prefix + '\uffff');
  }

  function keys(prefix) {
    return run('readonly', function (s) { return s.getAllKeys(prefixRange(prefix)); }).then(function (k) { return k || []; });
  }

  function deletePrefix(prefix) {
    return erase(prefixRange(prefix));
  }

  function newId(kind) {
    return kind + ':' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  }

  function available() {
    try { return typeof indexedDB !== 'undefined' && !!indexedDB; } catch (_) { return false; }
  }

  var api = {
    put: put, get: get, delete: del, list: list, sweep: sweep, newId: newId, keys: keys, deletePrefix: deletePrefix,
    available: available, HANDOFF_TTL_MS: HANDOFF_TTL_MS,
    _setOpener: function (fn) { opener = fn; }
  };
  root.BlobStore = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
