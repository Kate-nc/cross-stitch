# Perf Opt 2 — Implementation Spec (Category A)

## Fix #1 — Lazy-load `import-engine/bundle.js`

### Files changed

- `home.html`, `index.html`, `create.html`, `stitch.html` — replace
  the eager `<script src="import-engine/bundle.js">` tag with an
  inline shim.
- `sw.js` — keep the bundle in the precache list so the lazy fetch
  is offline-first; no behavioural change here.

### Change

Replace, in each of the four entry HTMLs:

```html
<script src="import-engine/bundle.js"></script>
```

with the shim:

```html
<script>
/* Lazy-load the import engine. The full bundle is only fetched
 * the first time the user actually triggers an import. Until then
 * we expose three function-shaped placeholders that load the bundle
 * on demand and forward the call. See reports/perf-opt-2-spec.md. */
(function () {
  var SRC = 'import-engine/bundle.js';
  var loadingPromise = null;
  function loadBundle() {
    if (loadingPromise) return loadingPromise;
    loadingPromise = new Promise(function (res, rej) {
      var s = document.createElement('script');
      s.src = SRC;
      s.async = false;  // preserve global side-effects ordering
      s.onload = function () { res(window.ImportEngine); };
      s.onerror = function (e) { loadingPromise = null; rej(e); };
      document.head.appendChild(s);
    });
    return loadingPromise;
  }
  function lazy(method) {
    return function () {
      var args = Array.prototype.slice.call(arguments);
      return loadBundle().then(function (engine) {
        if (!engine || typeof engine[method] !== 'function') {
          throw new Error('ImportEngine.' + method + ' missing after load');
        }
        return engine[method].apply(engine, args);
      });
    };
  }
  // Public surface used by callers outside the bundle:
  //   window.ImportEngine.openImportPicker (home-app.js)
  //   window.ImportEngine.importAndReview  (home-app.js, creator-main.js)
  //   window.ImportEngine.importPattern    (any external caller)
  // The real bundle reassigns window.ImportEngine on load, replacing
  // these stubs with the full implementation including .errors,
  // .register, .runPipeline, .__build, etc.
  window.ImportEngine = {
    __lazy: true,
    openImportPicker: lazy('openImportPicker'),
    importAndReview:  lazy('importAndReview'),
    importPattern:    lazy('importPattern'),
    /* preload() lets the prefetch path warm the bundle without
     * triggering a picker. Call from a `requestIdleCallback`. */
    preload: loadBundle,
  };
})();
</script>
```

### Why this is safe

- The three external callers (`home-app.js` × 2, `creator-main.js` ×
  3) all check `typeof window.ImportEngine.importAndReview ===
  'function'` before invoking. With the shim, that check still
  passes — and the shim returns the same Promise contract the real
  function does.
- The `__build` debug log in `home-app.js` reads
  `window.ImportEngine.__build || 'unknown'`. With the shim it logs
  `'unknown'` until the user triggers an import, then the real
  bundle takes over and `__build` becomes available. Acceptable.
- All callers within the bundle (e.g. `workerClient.js` reading
  `window.ImportEngine.errors`) execute *after* the bundle finishes
  parsing, by which point the shim has been replaced.
- The wireApp IIFE installs `window.ImportEngine = window.ImportEngine
  || {}` and then assigns properties — but this is fine because the
  bundle’s own `(function(){…})()` IIFEs all call
  `window.ImportEngine = window.ImportEngine || {};` then assign,
  meaning they will overwrite our shim properties one by one with
  the real implementations. **This needs to be verified by reading
  the bundle’s top section** before the change ships — see
  “Pre-flight checklist” below.

### Pre-flight checklist

Before editing any HTML:

1. Read `import-engine/bundle.js` lines 1–250 and confirm that every
   IIFE that touches `window.ImportEngine` does so via assignment
   (`window.ImportEngine.X = …`), not via a destructuring or
   wholesale-replacement pattern. If any module does `window.ImportEngine
   = { X }` it will wipe our shim during load — but that wouldn’t
   matter because by then the lazy load completed and the placeholders
   are about to be replaced anyway.

### Tests added before optimisation

- [tests/import/lazyLoadShim.test.js](../tests/import/lazyLoadShim.test.js)
  — pins the lazy-load contract:
  - The shim defines `openImportPicker`, `importAndReview`,
    `importPattern`, `preload`, and `__lazy: true`.
  - Calling any of the three import methods on the shim triggers a
    single fetch of `import-engine/bundle.js` (subsequent calls
    reuse the same promise).
  - Once the bundle has “loaded” (simulated), the shim methods
    forward to the real implementation with the same arguments and
    return value.
  - The shim is type-compatible with the existing presence checks
    in `home-app.js` and `creator-main.js` (smoke-tested by
    importing those snippets verbatim and asserting `typeof ===
    'function'`).

### Test that must pass before AND after

- Full Jest suite (`npm test -- --runInBand`) — currently 1487
  passing. Must remain 1487 passing.
- Add the new lazyLoadShim test — must pass against the new HTML.

### How to measure the improvement

Run **before**:
```powershell
npm run perf:baseline
copy reports\perf-results\startup.json reports\perf-results\startup.before.json
```

Apply the fix.

Run **after**:
```powershell
npm run perf:baseline
```

Compare `projectScriptBytes` and `timings.load` for `/home.html`,
`/index.html`, `/create.html`, `/stitch.html` — should drop by
~126 KB and the corresponding parse time.

### Rollback plan

Revert the four HTMLs (one-line change in each). The bundle script
itself is untouched.
