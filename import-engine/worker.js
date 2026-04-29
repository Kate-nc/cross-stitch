/* import-engine/worker.js — dedicated Web Worker host for the import engine.
 *
 * Loaded as `new Worker('import-engine/worker.js')`. The worker imports the
 * engine bundle via importScripts and replies to RPC messages from
 * workerClient.js.
 *
 * Protocol:
 *   in  → { type: 'import', id, file, opts }
 *   in  → { type: 'cancel', id }
 *   out → { type: 'progress', id, message }
 *   out → { type: 'result',   id, result }
 *   out → { type: 'error',    id, error: { name, message, details } }
 *
 * "file" arrives as a transferable: { name, type, bytes: Uint8Array }.
 */

/* eslint-env worker */
/* global importScripts, ImportEngine */

(function () {
  'use strict';

  const isWorker = typeof importScripts === 'function';
  if (!isWorker) return; // file is also loadable in tests for inspection.

  // The worker bundle is built by build-import-bundle.js and contains the
  // engine + all registered strategies. We import it here.
  try {
    importScripts('./bundle.js');
  } catch (e) {
    // Fall back to individual files for development.
    importScripts('./types.js', './registry.js', './pipeline.js', './index.js');
  }

  const inflight = new Map(); // id → cancelToken

  self.addEventListener('message', async function (ev) {
    const msg = ev.data || {};
    if (msg.type === 'cancel') {
      const tok = inflight.get(msg.id);
      if (tok) tok.abort();
      return;
    }
    if (msg.type !== 'import') return;

    const id = msg.id;
    const cancelToken = ImportEngine.makeAbortToken();
    inflight.set(id, cancelToken);

    try {
      const file = msg.file || {};
      const probe = {
        fileName: file.name || '',
        mimeType: file.type || '',
        bytes: file.bytes ? file.bytes.subarray(0, Math.min(file.bytes.length, 1024 * 1024)) : new Uint8Array(0),
        fullBytes: function () { return Promise.resolve(file.bytes || new Uint8Array(0)); },
      };
      const ctx = {
        cancelToken,
        reportProgress: function (m) { self.postMessage({ type: 'progress', id, message: m }); },
        log: function () {},
      };

      const result = await ImportEngine.runPipeline(probe, msg.opts || {}, ctx);
      self.postMessage({ type: 'result', id, result: serialiseResult(result) });
    } catch (err) {
      self.postMessage({ type: 'error', id, error: errToObj(err) });
    } finally {
      inflight.delete(id);
    }
  });

  function serialiseResult(r) {
    if (!r) return r;
    // Coerce typed arrays / errors so postMessage cloning works everywhere.
    const out = {
      ok: r.ok,
      project: r.project || null,
      publisher: r.publisher || null,
      confidence: r.confidence ? {
        overall: r.confidence.overall,
        perCell: Array.from(r.confidence.perCell || []),
        perPaletteEntry: Array.from(r.confidence.perPaletteEntry || []),
      } : null,
      warnings: (r.warnings || []).map(w => ({
        code: w.code, message: w.message, severity: w.severity, target: w.target || null,
      })),
      reviewHints: r.reviewHints || [],
    };
    if (r.error) out.error = errToObj(r.error);
    return out;
  }

  function errToObj(e) {
    if (!e) return { name: 'Error', message: 'unknown' };
    return { name: e.name || 'Error', message: e.message || String(e), details: e.details || null };
  }
})();
