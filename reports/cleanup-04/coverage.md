# Critical-path safeguards (PR 04)

Base: `31a510c936c267b9bf053ee5f6c295fef5372c45`, remote default `main`.
Prerequisites: PR #362 (`382b0263`, validation baseline) and #363 (`200694fb`, isolated bundle checks) are merged ancestors. PR #364 is also on the fetched base. Branch: `cleanup/04-characterise-critical-paths` in a separate clean worktree.

This is a test-only safety net for F-001 and later F-010–F-014 extractions. No product code, generated assets, public exports, dependencies, formats, preferences, database versions, or PDF export sources change. The historical audit SHA is a starting point; the tests execute the current base's implementations. No new assertions inspect source text or sliced function bodies.

## Coverage map and selected gaps

| Target | Existing safeguards used | Added contract |
| --- | --- | --- |
| `tracker-app.js` | `tests/e2e/save-durability.spec.js`, specialty lifecycle, focused save/flush; Jest `trackerSaveDurability`, marking, parking, handoff and shortcut suites (many structural guards) | Real compiled Tracker load/mark/undo/full flush/reopen with exact cell identities; active/inactive rerenders; balanced owned event subscriptions, closed component channels; snapshot fallback flush after unmount |
| `sync-engine.js` | `syncProtocolSemantics`: real storage + fake IndexedDB + two script realms, attachment hash/dedup/missing/corrupt/interrupted-transfer retry/collision tests; `syncMergeFieldCoverage`, `syncTwoDeviceConvergence`, `syncReferenceFixes`, `syncTier1Hardening`, `syncResetForResync`, `syncTimestampPreservation` | Deferred live flush before snapshot read; failed export flush before any reads/delivery; successful/failed writable close before timestamp/completion; deferred cancelled share without delivery metadata on the wire |
| `pdf-importer.js` | `pdfVectorTransform` exercises enclosing matrices, translated/scaled grids; `pdfKeyAndColours` multi-column keys, exact swatches/counts and symbol/thread mapping; `pdfScannedImport` generated raster PDF, symbols/colour grouping and cancellation; `pdfDesigns` generated multi-design booklet and per-design key/build outputs; fractional and half-stitch suites | Reverse-order asynchronous page completion preserves page numbering, text geometry/control glyphs and non-enumerable native page; cancellation during pending page acquisition and pending text/operators; raster factory ceil/scale/background/render settlement and original error propagation |
| `creator/canvasRenderer.js` | Existing ruler, fractional semantics, canvas resize, highlight and structural repaint guards | Complete classic helpers + renderer with native canvas: independent quarter/half/three-quarter pixel probes, empty fabric, cropped viewport offsets; byte-equal full vs banded partial-stitch rendering in colour/symbol/both views |
| `creator-main.js` hooks | Structural Creator guards, `creator-draw-navigate` and conversion entry tests | Mounted real exported ComparisonSlider through its compiled entry: Alt state, prop rerender, stable subscriptions; auto-sweep frame cancellation at unmount |
| `stats-page.js` hooks | `stats-page` structural Rules of Hooks guards, stats script coexistence and storage helpers | Real mounted loading/tab changes (Stitching/Stash/Showcase/Activity/Insights), lazy readiness polling and subscription cleanup; real React/jsdom mount with a controllable migration completion: no data reads or reload subscription after unmount |

Existing assertions are not reproduced wholesale. In particular, attachment integrity and merge convergence use the existing executable integration suite rather than another mock of those algorithms. New sync tests share that suite's existing device harness. Known behaviour requiring separate bug-fix authorisation is recorded in [known-behaviour.md](known-behaviour.md).

## Actual loading and consumers

`stitch.html` loads React/ReactDOM and pako, shared helpers/colour data, causal tracking/progress/storage, stash and sync, preferences/navigation, then runtime/lazy loaders and the standalone Tracker hook scripts before requesting `compiled/tracker-app.compiled.js`. `window.TrackerApp` is also loaded by the unified Creator shell. Its hook calls (`useTrackerPrefs`, `useCanvasOverlays`, `useAutoSession`, `useStitchCounts`) must remain even if a returned binding looks unused: they run at mount/update and own subscriptions, timers or canvas budgets.

`create.html` loads shared helpers and storage before `creator/bundle.js`; its order is declared in `build-creator-bundle.js`. It lazily loads the compiled `creator-main.js` entry through `runtime-loaders.js`. `index.html` supports the legacy unified/stats route; a fresh test must use `from=home` to pass its no-project redirect. Creator's project IO, preview and keyboard hooks execute on every relevant render. ComparisonSlider is an existing public window export; the test adds no product export.

The unified shell keeps Creator and an optionally mounted Tracker hidden across mode changes; StatsPage is lazy loaded, and separately lazy loads Activity/Insights. `manager.html` still loads `home-screen.js` before `project-library.js`. PDF import uses the `pdf-importer.js` classic lexical classes through the lazy PDF/import stack, separate from the protected export workers and layout code.

Browser observation wraps ReactDOM root creation and records registrations by the immediate owning script frame, callback identity and capture flag. It excludes React's permanent document selection listener and sync-engine's page-wide beforeunload snapshot registration. Animation frames and intervals are observed without fake delays. This checks resources owned by the selected entries; it is not a general browser leak detector or proof that every hidden hook binding is redundant.

## Fixtures and limits

New deterministic unit tests control Promise completions directly; they do not sleep. The raster bridge fixture uses native RGBA canvas pixels and a controlled renderer; actual PDF rasterisation and legend interpretation remain covered by existing generated PDF tests. Canvas byte comparisons run on the same installed native canvas backend and avoid external image/font goldens. The partial-stitch fixture contains overrides on empty base cells, mixed colours and a cropped viewport; it does not cover every overlay, sheen texture, fabric or font/browser combination.

Six real PDFs are present in `TestUploads/`: `gen1.pdf`, `gen-3-extended-pattern-colour.pdf`, `PAT1968_2.pdf`, `Books and Blossoms.pdf`, `PAT2171_2.pdf`, and `lord-libidan-pokemon-gen-1-epic-pokemon-extended.pdf`. They are not represented as newly reviewed reference goldens here. The 32-byte `tests/fixtures/pattern.xsd` is a fake signature fixture, not a real Pattern Maker chart. Additional publisher PDFs and real XSD fixtures are unavailable; no XSD or exhaustive publisher/device compatibility claim is made. Existing generated/scanned/vector PDF tests provide reproducible truth without manufacturing commercial reference outputs. PK export sources and paths are unchanged; existing PDF export tests still run in the full suite.

Desktop Chromium and Chromium touch-tablet emulation are the executed browser coverage. Firefox launch timed out in this container (namespace/sandbox startup errors); WebKit cannot launch because required GTK4/graphene/harfbuzz-icu/manette/hyphen/woff libraries are missing. Real iPad/iPhone, mobile browsers, Firefox and Safari/WebKit are untested for these new journeys.

## Validation

Use Node 22 and the existing installed dependencies; no lockfile changes. Commands/results and same-environment performance evidence are recorded in [validation.md](validation.md) and [performance.md](performance.md).
