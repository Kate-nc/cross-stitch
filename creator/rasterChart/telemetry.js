/* creator/rasterChart/telemetry.js
 * ════════════════════════════════════════════════════════════════════════
 *   Local-only Phase 1 telemetry for the raster cross-stitch chart
 *   importer. Captures per-stage timings, confidence scores, manual
 *   correction events, final acceptance state, and an anonymised
 *   fingerprint of every import.
 *
 *   GUARANTEES
 *     • No network. Everything is written to the importerTelemetry
 *       object store inside CrossStitchDB. The test suite asserts there
 *       are zero fetch / XHR / sendBeacon / WebSocket call sites in
 *       this file.
 *     • Opt-out. The user pref `importer.telemetryEnabled` defaults to
 *       true but the user can flip it off in settings. When disabled,
 *       every record/append call is a no-op.
 *     • Anonymised. Records contain image dimensions and chart
 *       dimensions but no pixel data, no file names, no original
 *       images. The fingerprint is a SHA-256 of dimensions only.
 *     • Exportable. The user can call `exportJSON()` and share the
 *       resulting Blob with maintainers if they choose.
 *
 *   STORAGE
 *     CrossStitchDB version 5, store 'importerTelemetry', keyPath 'id'.
 *     The schema upgrade is idempotent and additive — existing stores
 *     are preserved.
 *
 *   RECORD SHAPE  (one per import)
 *     {
 *       id:            string,                  // 'tel_<ts>_<rand>'
 *       createdAt:     ISO-8601 string,
 *       schemaVersion: 1,
 *       timings:       { preprocess, grid, cells, cluster,
 *                        'legend-ocr', match },           // ms
 *       confidence: {
 *         grid:    { peakProminenceRatio: number },
 *         cluster: { meanSilhouette: number,
 *                    noiseCount: number,
 *                    clusterCount: number },
 *         legend:  { meanWordConfidence: number,
 *                    regexValidatedCount: number,
 *                    confusionRepairedCount: number },
 *         match:   { matchedCount: number,
 *                    unmatchedCount: number }
 *       },
 *       corrections: [
 *         { surface: string, at: ISO, details: object }
 *       ],
 *       acceptance: {
 *         state: 'pending' | 'accepted' | 'abandoned' | 'revised',
 *         at:    ISO | null
 *       },
 *       input: {
 *         imageW: number, imageH: number,
 *         chartCols: number | null, chartRows: number | null,
 *         paletteSize: number | null,
 *         sourceType: 'screenshot' | 'photo' | 'unknown'
 *       },
 *       fingerprint: string                    // hex SHA-256
 *     }
 * ════════════════════════════════════════════════════════════════════════
 */

(function () {
  'use strict';

  const DB_NAME = 'CrossStitchDB';
  const DB_VERSION = 5;
  const STORE = 'importerTelemetry';
  const PREF_KEY = 'cs_pref_importer.telemetryEnabled';
  const SCHEMA_VERSION = 1;

  function isEnabled() {
    try {
      const raw = (typeof localStorage !== 'undefined') &&
                  localStorage.getItem(PREF_KEY);
      if (raw === null || raw === undefined) return true; // default on
      return JSON.parse(raw) === true;
    } catch (_) { return true; }
  }

  function setEnabled(on) {
    try { localStorage.setItem(PREF_KEY, JSON.stringify(!!on)); } catch (_) {}
  }

  // ─── DB plumbing ────────────────────────────────────────────────────
  // Mirrors pendingImportStore.openDB exactly so version bumps stay in lockstep.
  function openDB() {
    return new Promise((resolve, reject) => {
      if (typeof indexedDB === 'undefined') {
        reject(new Error('indexedDB not available')); return;
      }
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains('projects')) {
          db.createObjectStore('projects', { keyPath: 'id' });
        }
        if (!db.objectStoreNames.contains('project_meta')) {
          db.createObjectStore('project_meta', { keyPath: 'id' });
        }
        if (!db.objectStoreNames.contains('stats_summaries')) {
          db.createObjectStore('stats_summaries', { keyPath: 'date' });
        }
        if (!db.objectStoreNames.contains('pendingImports')) {
          db.createObjectStore('pendingImports', { keyPath: 'id' });
        }
        if (!db.objectStoreNames.contains(STORE)) {
          db.createObjectStore(STORE, { keyPath: 'id' });
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

  // ─── Fingerprint ────────────────────────────────────────────────────
  // SHA-256 hash of "imageW×imageH|chartCols×chartRows". This is
  // enough to group repeat imports of the same chart without leaking
  // anything identifying about the chart's content.
  async function fingerprint(imageW, imageH, chartCols, chartRows) {
    const key = [imageW | 0, imageH | 0, chartCols | 0, chartRows | 0].join('|');
    if (typeof crypto !== 'undefined' && crypto.subtle) {
      const buf = new TextEncoder().encode(key);
      const dig = await crypto.subtle.digest('SHA-256', buf);
      return Array.from(new Uint8Array(dig))
        .map(b => b.toString(16).padStart(2, '0')).join('');
    }
    // Fallback: 32-bit FNV-1a, hex-padded. Lower entropy but acceptable
    // for clustering by dimensions in dev / Node test environments.
    let h = 0x811c9dc5;
    for (let i = 0; i < key.length; i++) {
      h ^= key.charCodeAt(i);
      h = (h + ((h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24))) >>> 0;
    }
    return ('00000000' + h.toString(16)).slice(-8);
  }

  // ─── Recording ──────────────────────────────────────────────────────
  function newRecord(seed) {
    seed = seed || {};
    const id = 'tel_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8);
    return {
      id,
      createdAt: new Date().toISOString(),
      schemaVersion: SCHEMA_VERSION,
      timings: Object.assign(
        { preprocess: 0, grid: 0, cells: 0, cluster: 0, 'legend-ocr': 0, match: 0 },
        seed.timings || {}
      ),
      confidence: Object.assign({
        grid:    { peakProminenceRatio: 0 },
        cluster: { meanSilhouette: 0, noiseCount: 0, clusterCount: 0 },
        legend:  { meanWordConfidence: 0, regexValidatedCount: 0, confusionRepairedCount: 0 },
        match:   { matchedCount: 0, unmatchedCount: 0 },
      }, seed.confidence || {}),
      corrections: [],
      acceptance: { state: 'pending', at: null },
      input: Object.assign({
        imageW: 0, imageH: 0,
        chartCols: null, chartRows: null,
        paletteSize: null,
        sourceType: 'unknown',
      }, seed.input || {}),
      fingerprint: seed.fingerprint || '',
    };
  }

  function recordImport(record) {
    if (!isEnabled()) return Promise.resolve(null);
    const rec = Object.assign(newRecord(), record || {});
    return tx('readwrite', s => { s.put(rec); return rec; }).catch(() => null);
  }

  function recordCorrection(importId, surface, details) {
    if (!isEnabled()) return Promise.resolve(null);
    if (!importId) return Promise.resolve(null);
    const ev = { surface, at: new Date().toISOString(), details: details || {} };
    return tx('readwrite', s => new Promise((resolve, reject) => {
      const g = s.get(importId);
      g.onsuccess = () => {
        const rec = g.result;
        if (!rec) { resolve(null); return; }
        rec.corrections.push(ev);
        const p = s.put(rec);
        p.onsuccess = () => resolve(rec);
        p.onerror = () => reject(p.error);
      };
      g.onerror = () => reject(g.error);
    })).catch(() => null);
  }

  function markAcceptance(importId, state) {
    if (!isEnabled()) return Promise.resolve(null);
    if (!importId) return Promise.resolve(null);
    if (!['accepted', 'abandoned', 'revised'].includes(state)) {
      return Promise.resolve(null);
    }
    return tx('readwrite', s => new Promise((resolve, reject) => {
      const g = s.get(importId);
      g.onsuccess = () => {
        const rec = g.result;
        if (!rec) { resolve(null); return; }
        rec.acceptance = { state, at: new Date().toISOString() };
        const p = s.put(rec);
        p.onsuccess = () => resolve(rec);
        p.onerror = () => reject(p.error);
      };
      g.onerror = () => reject(g.error);
    })).catch(() => null);
  }

  function list() {
    return tx('readonly', s => new Promise((resolve, reject) => {
      const out = [];
      const c = s.openCursor();
      c.onsuccess = (ev) => {
        const cur = ev.target.result;
        if (!cur) { resolve(out); return; }
        out.push(cur.value);
        cur.continue();
      };
      c.onerror = () => reject(c.error);
    })).catch(() => []);
  }

  function clear() {
    return tx('readwrite', s => new Promise((resolve, reject) => {
      const r = s.clear();
      r.onsuccess = () => resolve(true);
      r.onerror  = () => reject(r.error);
    })).catch(() => false);
  }

  // ─── Aggregates for the debug UI ────────────────────────────────────
  function median(xs) {
    if (!xs || !xs.length) return 0;
    const a = xs.slice().sort((p, q) => p - q);
    const m = a.length >> 1;
    return a.length % 2 ? a[m] : 0.5 * (a[m - 1] + a[m]);
  }

  function aggregate(records) {
    records = records || [];
    if (!records.length) {
      return {
        n: 0, medianTotalMs: 0, medianSilhouette: 0,
        acceptanceRate: 0, abandonmentRate: 0,
        correctionFrequency: {},
        sourceMix: { screenshot: 0, photo: 0, unknown: 0 },
      };
    }
    const totals = records.map(r => {
      const t = r.timings || {};
      return (t.preprocess || 0) + (t.grid || 0) + (t.cells || 0) +
             (t.cluster || 0) + (t['legend-ocr'] || 0) + (t.match || 0);
    });
    const silhouettes = records
      .map(r => r.confidence && r.confidence.cluster && r.confidence.cluster.meanSilhouette)
      .filter(x => typeof x === 'number');
    const accepted   = records.filter(r => r.acceptance && r.acceptance.state === 'accepted').length;
    const abandoned  = records.filter(r => r.acceptance && r.acceptance.state === 'abandoned').length;
    const correctionFrequency = {};
    for (const r of records) {
      for (const c of (r.corrections || [])) {
        correctionFrequency[c.surface] = (correctionFrequency[c.surface] || 0) + 1;
      }
    }
    const sourceMix = { screenshot: 0, photo: 0, unknown: 0 };
    for (const r of records) {
      const k = (r.input && r.input.sourceType) || 'unknown';
      sourceMix[k] = (sourceMix[k] || 0) + 1;
    }
    return {
      n: records.length,
      medianTotalMs: median(totals),
      medianSilhouette: median(silhouettes),
      acceptanceRate:  accepted  / records.length,
      abandonmentRate: abandoned / records.length,
      correctionFrequency,
      sourceMix,
    };
  }

  function exportJSON() {
    return list().then(records => {
      const payload = {
        exportedAt: new Date().toISOString(),
        schemaVersion: SCHEMA_VERSION,
        records,
        aggregate: aggregate(records),
      };
      return JSON.stringify(payload, null, 2);
    });
  }

  const api = {
    SCHEMA_VERSION,
    PREF_KEY,
    isEnabled, setEnabled,
    fingerprint,
    newRecord,
    recordImport,
    recordCorrection,
    markAcceptance,
    list, clear, aggregate, exportJSON,
  };

  if (typeof window !== 'undefined') window.RasterChartTelemetry = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})();
