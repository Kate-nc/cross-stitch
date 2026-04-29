/* import-engine/workerClient.js — main-thread RPC wrapper for worker.js.
 *
 * Public API:
 *   const client = ImportEngine.createWorkerClient({ scriptUrl, WorkerCtor });
 *   const handle = client.import(file, { onProgress });
 *   handle.cancel();
 *   await handle.result;        // ImportResult
 *
 * `WorkerCtor` lets tests inject a mock Worker. In production it defaults to
 * `Worker`. The client also exposes `terminate()` which kills the worker —
 * any inflight imports reject with AbortedError.
 */

(function () {
  'use strict';

  const ENGINE = (typeof window !== 'undefined' && window.ImportEngine) ||
                 (typeof require === 'function' ? require('./types.js') : {});

  function createWorkerClient(opts) {
    opts = opts || {};
    const WorkerCtor = opts.WorkerCtor ||
                       (typeof Worker !== 'undefined' ? Worker : null);
    if (!WorkerCtor) {
      throw new Error('createWorkerClient: no Worker constructor available');
    }
    const scriptUrl = opts.scriptUrl || 'import-engine/worker.js';

    const worker = new WorkerCtor(scriptUrl);
    let nextId = 1;
    const inflight = new Map(); // id → { resolve, reject, onProgress }

    worker.addEventListener('message', function (ev) {
      const msg = ev.data || {};
      const entry = inflight.get(msg.id);
      if (!entry) return;
      if (msg.type === 'progress') {
        try { entry.onProgress && entry.onProgress(msg.message); } catch (_) {}
        return;
      }
      if (msg.type === 'result') {
        inflight.delete(msg.id);
        entry.resolve(msg.result);
        return;
      }
      if (msg.type === 'error') {
        inflight.delete(msg.id);
        entry.reject(rehydrate(msg.error));
        return;
      }
    });

    function importFile(file, callOpts) {
      callOpts = callOpts || {};
      const id = nextId++;
      let resolve, reject;
      const promise = new Promise(function (res, rej) { resolve = res; reject = rej; });
      inflight.set(id, { resolve, reject, onProgress: callOpts.onProgress });

      // Read bytes once on the main thread, transfer to worker.
      readBytes(file).then(function (bytes) {
        const transfer = bytes && bytes.buffer ? [bytes.buffer] : [];
        worker.postMessage({
          type: 'import',
          id,
          file: { name: file && file.name || '', type: file && file.type || '', bytes: bytes },
          opts: callOpts.engineOpts || {},
        }, transfer);
      }).catch(function (err) {
        inflight.delete(id);
        reject(err);
      });

      return {
        id,
        result: promise,
        cancel: function () {
          if (!inflight.has(id)) return;
          worker.postMessage({ type: 'cancel', id });
        },
      };
    }

    function terminate() {
      try { worker.terminate(); } catch (_) {}
      const aborted = ENGINE.errors && ENGINE.errors.AbortedError;
      for (const [, entry] of inflight) {
        entry.reject(aborted ? aborted('Worker terminated') : new Error('Worker terminated'));
      }
      inflight.clear();
    }

    return { import: importFile, terminate, _worker: worker };
  }

  function readBytes(file) {
    if (!file) return Promise.resolve(new Uint8Array(0));
    if (file.bytes instanceof Uint8Array) return Promise.resolve(file.bytes);
    if (typeof file.arrayBuffer === 'function') {
      return file.arrayBuffer().then(function (buf) { return new Uint8Array(buf); });
    }
    if (file instanceof ArrayBuffer) return Promise.resolve(new Uint8Array(file));
    return Promise.reject(new Error('createWorkerClient: cannot read file bytes'));
  }

  function rehydrate(errObj) {
    if (!errObj) return new Error('unknown');
    const name = errObj.name || 'Error';
    let make = (typeof window !== 'undefined' && window.ImportEngine && window.ImportEngine.errors)
              ? window.ImportEngine.errors[stripPrefix(name)]
              : null;
    if (!make && typeof require === 'function') {
      try { make = require('./types.js').errors[stripPrefix(name)]; } catch (_) {}
    }
    const e = make ? make(errObj.message, errObj.details) : new Error(errObj.message);
    e.name = name;
    return e;
  }

  function stripPrefix(n) {
    // 'ImportAbortedError' → 'AbortedError'
    return n.indexOf('Import') === 0 ? n.substring('Import'.length) : n;
  }

  const api = { createWorkerClient };

  if (typeof window !== 'undefined') {
    window.ImportEngine = Object.assign(window.ImportEngine || {}, api);
  }
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  }
})();
