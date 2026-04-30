/* import-engine/lazy-shim.js — startup placeholder for window.ImportEngine.
 *
 * Runs in the browser before the real `import-engine/bundle.js` is fetched.
 * Exposes the public methods callers expect:
 *   - openImportPicker(opts)   — used by home-app.js
 *   - importAndReview(file, opts) — used by home-app.js + creator-main.js
 *   - importPattern(file, opts) — convenience wrapper for external callers
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
  var loadingPromise = null;

  function loadBundle() {
    if (loadingPromise) return loadingPromise;
    loadingPromise = new Promise(function (resolve, reject) {
      try {
        var s = document.createElement('script');
        s.tag = 'script';            // for test sandbox introspection
        s.src = SRC;
        s.async = false;             // preserve global side-effects ordering
        s.onload = function () { resolve(window.ImportEngine); };
        s.onerror = function (e) { loadingPromise = null; reject(e); };
        document.head.appendChild(s);
      } catch (e) {
        loadingPromise = null;
        reject(e);
      }
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
    preload: function () { return loadBundle().then(function () { /* swallow */ }); },
  };
})();
