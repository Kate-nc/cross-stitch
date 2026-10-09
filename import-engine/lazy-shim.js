/* import-engine/lazy-shim.js — startup placeholder for window.ImportEngine.
 *
 * Runs in the browser before the real `import-engine/bundle.js` is fetched.
 * Exposes the public methods callers expect:
 *   - openImportPicker(opts)   — used by home-app.js
 *   - importAndReview(file, opts) — used by home-app.js + creator-main.js
 *   - importPattern(file, opts) — convenience wrapper for external callers
 *   - openReview(opts) — the review dialog alone, for a project already imported
 *   - preload() — warms the bundle without showing any UI; safe to call
 *                 from `requestIdleCallback`.
 *
 * On first call to any of those methods, fetches `import-engine/bundle.js`
 * by appending one `<script>` tag to <head>. When the bundle resolves it
 * overwrites these stubs with the real implementations via
 * `Object.assign(window.ImportEngine || {}, …)`. The shim then forwards
 * the original arguments to the real method and resolves with its result.
 *
 * Concurrent calls during the loading window share the same load promise
 * — only one bundle <script> is ever appended.
 *
 * The OXS and image strategies call the parsers in import-formats.js
 * (window.parseOXS, window.parseImagePattern). A page that forgot to include
 * it broke every .oxs import (home.html did, audit B-03), so the shim loads
 * it first whenever window.parseOXS is missing.
 *
 * This file is loaded synchronously and runs to completion before the
 * page's React entry points; keep it tiny and side-effect-free until a
 * call comes in.
 *
 * Tested by: tests/import/lazyLoadShim.test.js. See
 * reports/perf-opt-2-spec.md for the rationale.
 */

(function () {
  'use strict';
  if (typeof window === 'undefined') return;
  // If the real bundle is somehow already loaded (e.g. dev override),
  // do not stomp on it.
  if (window.ImportEngine && !window.ImportEngine.__lazy && typeof window.ImportEngine.openImportPicker === 'function') return;

  var SRC = 'import-engine/bundle.js';
  var FORMATS_SRC = 'import-formats.js';
  var loadingPromise = null;

  function appendScript(src) {
    return new Promise(function (resolve, reject) {
      try {
        var s = document.createElement('script');
        s.tag = 'script';            // for test sandbox introspection
        s.src = src;
        s.async = false;             // preserve global side-effects ordering
        s.onload = function () { resolve(); };
        s.onerror = function (e) {
          // Remove the failed <script> tag so the DOM doesn't accumulate
          // orphans across repeated failures.
          if (s.parentNode) try { s.parentNode.removeChild(s); } catch (_) {}
          reject(e);
        };
        document.head.appendChild(s);
      } catch (e) {
        reject(e);
      }
    });
  }

  // null when the parsers are already there, else a promise that settles
  // once import-formats.js has loaded (or failed to).
  function ensureFormats() {
    if (typeof window.parseOXS === 'function') return null;
    var load = typeof window.loadScript === 'function'
      ? window.loadScript(FORMATS_SRC, { test: function () { return typeof window.parseOXS === 'function'; } })
      : appendScript(FORMATS_SRC);
    // Not fatal here: the engine still handles PDFs and JSON, and the OXS
    // strategy reports a clear error if the parser is still missing.
    return load.catch(function () {});
  }

  function loadBundle() {
    if (loadingPromise) return loadingPromise;
    var formats = ensureFormats();
    loadingPromise = (formats ? formats.then(function () { return appendScript(SRC); }) : appendScript(SRC))
      .then(function () { return window.ImportEngine; }, function (e) {
        // Reset the gate so a retry can attempt a fresh load (e.g. network
        // recovered).
        loadingPromise = null;
        throw e;
      });
    return loadingPromise;
  }

  function lazy(method) {
    return function () {
      var args = Array.prototype.slice.call(arguments);
      return loadBundle().then(function (engine) {
        var fn = engine && engine[method];
        if (typeof fn !== 'function') {
          throw new Error('ImportEngine.' + method + ' missing after load');
        }
        return fn.apply(engine, args);
      });
    };
  }

  window.ImportEngine = {
    __lazy: true,
    openImportPicker: lazy('openImportPicker'),
    importAndReview:  lazy('importAndReview'),
    importPattern:    lazy('importPattern'),
    // The review dialog on its own, for callers that ran the import
    // themselves (the tracker's PDF import, to let multi-page charts be
    // rearranged before they are saved).
    openReview:       lazy('openReview'),
    preload: function () { return loadBundle().then(function () { /* swallow */ }); },
  };
})();
