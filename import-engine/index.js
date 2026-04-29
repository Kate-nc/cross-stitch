/* import-engine/index.js — public entry point.
 *
 * Bundles types + registry + pipeline together. In the browser this file is
 * loaded via the import-engine bundle (or individually for development);
 * in tests it's required directly.
 *
 * Public surface (under window.ImportEngine):
 *   importPattern(file, opts)            — convenience wrapper around runPipeline
 *   register(strategy)                   — strategy registration
 *   listStrategies()                     — diagnostic
 *   runPipeline(probe, opts, ctx)        — low-level pipeline runner
 *   makeAbortToken()                     — for cancellation
 *   THRESHOLDS, errors, ...
 */

(function () {
  'use strict';

  const isBrowser = typeof window !== 'undefined';

  if (!isBrowser) {
    // Eager-require sub-modules in CommonJS so tests get a populated namespace.
    require('./types.js');
    require('./registry.js');
    require('./pipeline.js');
    require('./workerClient.js');
    require('./classifier/sniffMagic.js');
    require('./pdf/operatorWalker.js');
    require('./pdf/textBands.js');
    require('./pdf/publishers.js');
    require('./pdf/dmcPageRoles.js');
    require('./pdf/legendExtractor.js');
    require('./pdf/gridExtractor.js');
    require('./pdf/metaExtractor.js');
    require('./pipeline/assemble.js');
  }

  const ENGINE = isBrowser ? window.ImportEngine : (function () {
    const types = require('./types.js');
    const reg   = require('./registry.js');
    const pipe  = require('./pipeline.js');
    const wc    = require('./workerClient.js');
    const sniff = require('./classifier/sniffMagic.js');
    const ow    = require('./pdf/operatorWalker.js');
    const tb    = require('./pdf/textBands.js');
    const pub   = require('./pdf/publishers.js');
    const dpr   = require('./pdf/dmcPageRoles.js');
    const lex   = require('./pdf/legendExtractor.js');
    const gex   = require('./pdf/gridExtractor.js');
    const mex   = require('./pdf/metaExtractor.js');
    const asm   = require('./pipeline/assemble.js');
    return Object.assign({}, types, reg, pipe, wc, sniff, ow, tb, pub, dpr, lex, gex, mex, asm);
  })();

  // High-level: takes a File-like (browser File, or { name, type, arrayBuffer })
  // and returns an ImportResult.
  async function importPattern(file, opts) {
    opts = opts || {};

    const buffer = await readAllBytes(file);
    const bytes = new Uint8Array(buffer);

    const probe = {
      fileName: file && file.name || '',
      mimeType: file && file.type || '',
      bytes: bytes.subarray(0, Math.min(bytes.length, 1024 * 1024)),
      fullBytes: function () { return Promise.resolve(bytes); },
    };

    const cancelToken = opts.cancelToken || ENGINE.makeAbortToken();
    const ctx = {
      cancelToken,
      reportProgress: typeof opts.onProgress === 'function' ? opts.onProgress : function () {},
      log: typeof opts.log === 'function' ? opts.log : function () {},
    };

    return ENGINE.runPipeline(probe, opts, ctx);
  }

  function readAllBytes(file) {
    if (!file) return Promise.resolve(new ArrayBuffer(0));
    if (typeof file.arrayBuffer === 'function') return file.arrayBuffer();
    if (file.bytes instanceof Uint8Array) return Promise.resolve(file.bytes.buffer);
    if (file instanceof ArrayBuffer) return Promise.resolve(file);
    return Promise.reject(new Error('Unsupported file argument: cannot read bytes'));
  }

  const api = { importPattern };

  if (isBrowser) {
    window.ImportEngine = Object.assign(window.ImportEngine || {}, api);
  }
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = Object.assign({}, ENGINE, api);
  }
})();
