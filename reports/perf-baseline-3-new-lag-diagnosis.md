# Perf Baseline 3 — Diagnosis of New Lag

> Comparing today’s codebase to the pre-import-feature codebase. Each
> finding is classified:
>
> - 🔵 **Caused by the new import feature** (lives in / loaded by the
>   import path).
> - ⚪ **Pre-existing**, now more noticeable because the app is
>   heavier.

## 1. 🔵 Import engine loads on every page

**Evidence.** `import-engine/bundle.js` (126.5 KB) is referenced as a
plain `<script src=...>` on `home.html`, `index.html`, `create.html`,
and `stitch.html`. It is downloaded, parsed, and executed before the
React app on each of those pages can mount.

**What runs at parse time.**

- `wireApp.js` IIFE — registers `window.ImportEngine.openImportPicker`
  + `importAndReview`, installs a global `unhandledrejection`
  listener, drains 5 sessionStorage breadcrumb keys.
- `registry.js` IIFE — instantiates the strategy registry and registers
  four parsing strategies.
- `pipeline.js`, `pipeline/*.js`, `pdf/*.js`, `strategies/*.js`,
  `classifier/*.js`, `ui/ImportReviewModal.js` — all defined as
  function constants, attached to `window.ImportEngine.*`.

**Cost.** ~126 KB of source has to be parsed by V8 on every page load
that doesn’t actually use the importer. On a mid-range Android
(throttled 4× CPU) this is ~80–150 ms of main-thread work that the
user pays for *every* visit.

**Caller surface that needs to keep working after lazy-loading.** Only
three identifiers are read by code outside the bundle:

- `window.ImportEngine.openImportPicker` — called by
  [home-app.js](../home-app.js) when the user clicks the Import button.
- `window.ImportEngine.importAndReview(file, opts)` — called by
  [home-app.js](../home-app.js) when a user drops/selects a pattern
  file directly, and by [creator-main.js](../creator-main.js) on
  pattern-file drag-drop into the Creator.
- `window.ImportEngine.__build` — read by `home-app.js` for a debug
  log line.

A lazy-load shim that defines those three identifiers and pulls
`import-engine/bundle.js` on first call is sufficient. The shim must
preserve the existing presence checks (`typeof
window.ImportEngine.importAndReview === 'function'`) so callers keep
their graceful-fallback path.

## 2. 🔵 wireApp.js sessionStorage breadcrumb drain on every page load

**Evidence.** [import-engine/wireApp.js#L28-L44](../import-engine/wireApp.js)
runs the following at startup *every* page load:

```js
var __traceKeys = ['__import_trace_openReview', '__import_trace_modalClose',
                   '__import_trace_save', '__import_trace_navigate',
                   '__import_trace_creatorBoot'];
__traceKeys.forEach(function (k) {
  var v = sessionStorage.getItem(k);
  if (v) { … console.log('[import-trace]', k, JSON.parse(v)); … }
});
```

**Cost.** Five `sessionStorage.getItem` calls (synchronous) and a
`JSON.parse` for each non-null value. Negligible CPU but it is debug
instrumentation living in the production hot path. Once §1 is fixed
this code only runs after the user actually triggers an import — but
ideally it should be gated behind a debug flag regardless.

## 3. ⚪ Render-blocking script tags

**Evidence.** Every `<script>` tag in every entry HTML is a classic
script with no `defer` / `async` / `type="module"`. They block the
HTML parser and execute strictly in source order.

**Cost.** This is a pre-existing constraint of the no-build
architecture, not new. But the import feature adds 126 KB to that
chain, which makes the chain slower for everyone. Lazy-loading per §1
is the right fix; converting the whole stack to `defer` would be a
larger refactor that risks load-order bugs (the codebase relies on
the explicit order).

## 4. ⚪ Babel-standalone runtime compilation

**Evidence.** [index.html](../index.html) caches Babel-compiled
`tracker-app.js`, `creator-main.js`, and several stats files in
localStorage with versioned keys. The cache busting code clears 15+
stale keys on every `loadTrackerApp()` call (and similarly for
creator/stats).

**Cost.** Pre-existing. First visit on each device pays a 200–500 ms
Babel pass per file; cached visits are free. Not in scope for this
pass.

## 5. 🔵 Import-related global event listener never removed

**Evidence.** [wireApp.js](../import-engine/wireApp.js#L48-L73)
installs an `unhandledrejection` listener on `window` guarded by
`window.__importEngineRejectionHandlerInstalled`. The listener is
never removed.

**Cost.** Negligible per call (a regex test against the rejection
message). But it is allocated as soon as the bundle parses, which —
once §1 lands — only happens when the user actually opens the
importer. So the §1 fix solves this transparently.

## 6. ⚪ `creator/bundle.js` is 889 KB and eager

**Evidence.** Loaded on `index.html` / `create.html`. The user is
*on* the Creator on those pages, so the eager load is justified — but
the bundle includes the import wizard (`creator/ImportWizard.js`,
21 KB) and the import review components which are import-flow only.

**Classification.** ⚪ pre-existing in the sense that the creator
bundle has always been large; the import-feature additions to it
(ImportWizard + related hooks) made it larger.

**Out of scope for Cat A.** Splitting the creator bundle is Cat C
work (the build script would need a code-splitting concept).

## 7. 🔵 Import metadata may travel on every project save

**Evidence.** Imported projects can carry confidence scores and
extraction provenance. Whether those fields are saved into the v8
project object on every subsequent edit (as opposed to being kept
out-of-band in `project_meta`) needs verification by reading
[import-engine/pipeline/materialise.js](../import-engine/pipeline/materialise.js)
and the consumer in `useProjectIO.js`.

**Status.** Open question — to be confirmed by reading
`materialise.js` before any Cat D work begins. If the fields *are*
in the main project, they are syncing on every save even though they
never change after import.

## 8. ⚪ Anchor + thread-conversion data eager on every page

**Evidence.** [anchor-data.js](../anchor-data.js) (45 KB) and
[thread-conversions.js](../thread-conversions.js) (65 KB) are loaded
on every page even though only the Adapt flow uses them.

**Classification.** ⚪ pre-existing.

**Out of scope for Cat A.** Lazy-loading these requires touching the
Adapt UI to await the data — not zero-risk and not import-related.

## Summary — what to fix in Category A

| Priority | Finding | Category A fix |
|---|---|---|
| 1 | §1 import bundle eager-loaded | Replace eager `<script>` with a lazy-load shim that fetches the bundle on first `openImportPicker` / `importAndReview` call. |
| 2 | §2 wireApp sessionStorage drain | Becomes a non-issue once §1 lands (only runs after first import). No standalone fix needed. |
| 3 | §5 unhandledrejection listener leak | Becomes a non-issue once §1 lands. No standalone fix needed. |
| 4 | §7 import metadata in main project (open question) | Audit `materialise.js`. If confirmed, add a single test pinning the v8 project shape and move the metadata to `project_meta`. |

Items 2/3/5 collapse into item 1 — fixing §1 yields the entire Cat-A
import-isolation win in a single change. That makes §1 the right
first commit.
