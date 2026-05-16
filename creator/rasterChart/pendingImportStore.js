/* creator/rasterChart/pendingImportStore.js
 * ════════════════════════════════════════════════════════════════════════
 *   IndexedDB persistence for intermediate raster-chart import state.
 *
 *   Key shape: pendingImport_<uploadTimestamp>
 *   Each record contains the per-stage outputs so the UI can resume
 *   mid-pipeline after a crash or page reload.
 *
 *   Stages persisted:
 *     'ingested'      original bytes + downscale meta
 *     'preprocessed'  binary buffer + w/h + otsu flag
 *     'corners'       auto or manual 4-corner result
 *     'warped'        binary buffer post-perspective
 *     'grid'          grid hypothesis
 *     'cells'         extracted cell pixels (Uint8Array[])
 *     'clustered'     cluster assignments + medoids
 *     'legend'        OCR'd legend rows
 *     'matched'       cluster→legend mapping
 *     'finalised'     completed RawExtraction ready for materialise
 *
 *   We piggy-back on the existing CrossStitchDB (version-bumped to 4) by
 *   adding a new object store 'pendingImports'. The schema upgrade is
 *   idempotent — running on an older DB without it triggers the upgrade.
 * ════════════════════════════════════════════════════════════════════════
 */

(function () {
  'use strict';

  const DB_NAME = 'CrossStitchDB';
  const DB_VERSION = 5;
  const STORE = 'pendingImports';

  function openDB() {
    return new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = (ev) => {
        const db = req.result;
        // Don't disturb existing stores; only add ours if missing.
        if (!db.objectStoreNames.contains(STORE)) {
          db.createObjectStore(STORE, { keyPath: 'id' });
        }
        // Phase 1 telemetry store (added in DB v5). Idempotent: created
        // here OR by telemetry.js — whichever opens the DB first.
        if (!db.objectStoreNames.contains('importerTelemetry')) {
          db.createObjectStore('importerTelemetry', { keyPath: 'id' });
        }
        // Preserve the pre-existing stores that other code expects.
        for (const known of ['projects', 'project_meta', 'stats_summaries']) {
          if (!db.objectStoreNames.contains(known)) {
            db.createObjectStore(known, { keyPath: known === 'stats_summaries' ? 'date' : 'id' });
          }
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }

  function tx(mode, fn) {
    return openDB().then(db => new Promise((resolve, reject) => {
      const t = db.transaction(STORE, mode);
      const store = t.objectStore(STORE);
      let result;
      Promise.resolve(fn(store)).then(r => { result = r; }, reject);
      t.oncomplete = () => resolve(result);
      t.onerror = () => reject(t.error);
      t.onabort = () => reject(t.error);
    }));
  }

  function create() {
    const id = 'pendingImport_' + Date.now();
    const record = {
      id,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      stages: {},
      currentStage: null,
    };
    return tx('readwrite', s => { s.put(record); return record; });
  }

  function updateStage(id, stageName, payload) {
    return tx('readwrite', s => new Promise((resolve, reject) => {
      const g = s.get(id);
      g.onsuccess = () => {
        const rec = g.result;
        if (!rec) { reject(new Error('pendingImport not found: ' + id)); return; }
        rec.stages[stageName] = payload;
        rec.currentStage = stageName;
        rec.updatedAt = new Date().toISOString();
        const p = s.put(rec);
        p.onsuccess = () => resolve(rec);
        p.onerror = () => reject(p.error);
      };
      g.onerror = () => reject(g.error);
    }));
  }

  function get(id) {
    return tx('readonly', s => new Promise((resolve, reject) => {
      const g = s.get(id);
      g.onsuccess = () => resolve(g.result || null);
      g.onerror = () => reject(g.error);
    }));
  }

  function list() {
    return tx('readonly', s => new Promise((resolve, reject) => {
      const out = [];
      const c = s.openCursor();
      c.onsuccess = (ev) => {
        const cur = ev.target.result;
        if (!cur) { resolve(out); return; }
        out.push({
          id: cur.value.id,
          createdAt: cur.value.createdAt,
          updatedAt: cur.value.updatedAt,
          currentStage: cur.value.currentStage,
        });
        cur.continue();
      };
      c.onerror = () => reject(c.error);
    }));
  }

  function remove(id) {
    return tx('readwrite', s => { s.delete(id); });
  }

  const api = { create, updateStage, get, list, remove, STORE, DB_NAME, DB_VERSION };
  if (typeof window !== 'undefined') window.PendingImportStore = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})();
