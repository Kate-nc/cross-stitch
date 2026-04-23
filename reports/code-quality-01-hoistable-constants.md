# Constants & Recreated Values Audit — Cross-Stitch Repository

## Summary
Identified **26 high-impact wasteful recreations** across priority files. Primary patterns: inline style objects in React renders (ExportTab, tracker-app), RegExp literals built per-call, HUE_BUCKETS array on every image analysis, DataURL regex in worker, and DMC.find() loops instead of pre-indexed maps.

## Actionable TODOs (Ordered by Impact)

- [ ] **creator/ExportTab.js, lines 201–203**: Hoist `presetCardBase`, `presetCardActive`, `ctaStyle`, `disabledCta`, `sectionToggle` style objects. Currently recreated on every render; move to module scope as static constants.
  - **Why wasteful**: ExportTab renders frequently; each render allocates new objects with identical values, defeating object identity checks and causing unnecessary GC.
  - **Fix**: Define at module level: `const PRESET_CARD_BASE = { flex: 1, padding: 14, ... }` etc.; reuse in render.

- [ ] **tracker-app.js, line 277**: Move `CORNERS` array outside `StitchingStyleStepBody` component. Currently: `const CORNERS=[["TL","Top-left"],...]` inside render.
  - **Why wasteful**: Array recreated on every component mount/update despite identical contents.
  - **Fix**: Define at module scope, consume inside component.

- [ ] **tracker-app.js, line 449**: Extract default `pdfSettings` object into a module-level constant. Currently: `useState({ chartStyle: 'symbols', cellSize: 3, ... })`.
  - **Why wasteful**: Default object allocated on every component initialization.
  - **Fix**: `const DEFAULT_PDF_SETTINGS = { chartStyle: 'symbols', ... }; useState(DEFAULT_PDF_SETTINGS)`.

- [ ] **creator/pdfExport.js, lines 261 & 337**: Hoist regex `/[^\w\-]+/g` for filename sanitization. Currently recreated in two places: `replace(/[^\w\-]+/g, "_")`.
  - **Why wasteful**: Regex compiled per call to export functions.
  - **Fix**: `const UNSAFE_FILENAME_CHARS = /[^\w\-]+/g;` at module scope; reuse: `name.replace(UNSAFE_FILENAME_CHARS, "_")`.

- [ ] **colour-utils.js, lines 256–277**: Move `HUE_BUCKETS` array out of `analyseColourCoverage()`. Currently recreated per image analysis call.
  - **Why wasteful**: Constant array with 7 hue categories allocated on every image coverage check.
  - **Fix**: Define at module scope; pass as argument or access globally in analyseColourCoverage.

- [ ] **pdf-export-worker.js, line 65**: Hoist regex `/^data:([^;,]+)?(?:;charset=[^;,]+)?(;base64)?,(.*)$/` in `dataUrlToBytes()`. Recreated per image embedded in PDF.
  - **Why wasteful**: Complex regex compiled on every cover photo or image data URL parse.
  - **Fix**: `const DATA_URL_REGEX = /^data:...$/;` at module scope; use `DATA_URL_REGEX.exec(dataUrl)`.

- [ ] **manager-app.js, lines 4–12**: Hoist `segments` object in `PartialGauge()` component. Currently: `const segments = { "null": { count: 0, ... }, ... }` recreated per render.
  - **Why wasteful**: Static object with gauge states rebuilt on every PartialGauge render.
  - **Fix**: Move to module scope (or use `useMemo` if gauges change dynamically).

- [ ] **creator/ExportTab.js**: Audit inline style objects in `h()` calls (lines 212–370+). Examples: `{ display: "flex", ... }`, `{ fontSize: 12, ... }` allocated per render.
  - **Why wasteful**: Hundreds of inline style objects created during each render cycle.
  - **Fix**: Extract repeated patterns into named constants (e.g., `const FLEX_CENTER = { display: "flex", alignItems: "center" }`); cache others in module scope.

- [ ] **helpers.js, lines 879 & 895**: Hoist regex patterns `/"/g` and `/[^a-zA-Z0-9]/g` for CSV escaping and filename sanitization.
  - **Why wasteful**: Regexes compiled on every export/name-sanitization call.
  - **Fix**: `const QUOTE_CHAR = /"/g; const UNSAFE_CHARS = /[^a-zA-Z0-9]/g;` at module scope.

- [ ] **helpers.js, lines 1119 & 1124**: Replace `ANCHOR.find()` and `DMC.find()` loops with pre-indexed Maps.
  - **Why wasteful**: Linear O(n) search per thread lookup; no caching.
  - **Fix**: Build `DMC_BY_ID = new Map(DMC.map(t => [t.id, t]));` at startup; lookup via `DMC_BY_ID.get(id)`.

- [ ] **generate-worker.js, line 30**: Verify `STRENGTH_MAP` is not recreated. Check if it can be shared with creator/generate.js via global.
  - **Why wasteful**: If duplicated, each worker instantiation allocates identical constant.
  - **Fix**: Export to global scope or consolidate definition.

- [ ] **project-storage.js, lines ~250–260**: Audit `Object.entries(project.threadOwned)` in `get()` method normalisation loop. If called frequently per project load, consider pre-indexing threadOwned keys on save.
  - **Why wasteful**: Repeated Object.entries() on every project retrieval.
  - **Fix**: Cache normalised threadOwned on save; skip normalization on get unless migration is pending.

- [ ] **stash-bridge.js, line 82 (Object.entries on threads during migration)**: In `migrateSchemaToV2()` and `migrateSchemaToV3()`, `Object.entries(threads)` is correct for one-time migration; verify not called repeatedly in hot paths.
  - **Why wasteful** (if in hot path): Object.entries called on entire stash every sync.
  - **Fix**: Ensure migrations only run once; use `_migrationDone` flags correctly.

- [ ] **creator/pdfChartLayout.js, line 198**: Regex `/^(\d+)/` used in `numericKey()`. Called inside sort loop. Hoist or memoize.
  - **Why wasteful**: Regex recreated per sort comparison during palette ordering.
  - **Fix**: `const LEADING_DIGITS = /^(\d+)/;` at module scope.

- [ ] **creator/ProjectTab.js, line 307, 313, 319**: Repeated `Object.keys(ctx.globalStash).some(...)` to check stash ownership. Called three times in render chain.
  - **Why wasteful**: O(n) key enumeration repeated per conditional check.
  - **Fix**: Cache stash ownership check in variable; use `useMemo` if ctx changes.

- [ ] **tracker-app.js, lines 4954, 4962, 4969, 4972**: Inline style objects in PDF settings UI (select boxes, checkboxes, buttons). Dozens of `{ padding: "...", ... }` per render.
  - **Why wasteful**: Hundreds of small style objects allocated per render.
  - **Fix**: Extract to CSS classes or named style constants.

- [ ] **colour-utils.js, lines 287–289, 787**: Audit `Object.keys(counts)` and `Object.values(usage).sort()` in buildPalette and palette analysis. If called per-frame, consider pre-sorting or indexing.
  - **Why wasteful**: Sorting palette entries repeatedly; could cache sorted order.
  - **Fix**: Cache palette sort results; invalidate only on palette change.

- [ ] **analysis-worker.js, line 56 onward**: Verify no repeated allocations of clustering structures (clusterLabel, clusterSizes, colourMap, etc.). These are computed per analysis—acceptable if not called redundantly per frame.
  - **Why check**: Worker is performance-sensitive; ensure no double-allocation patterns.

- [ ] **creator/generate.js**: Search for repeated `DMC.map(...)` or lookups; consider pre-indexing if generator pipeline calls DMC accessor multiple times.
  - **Why wasteful**: If generate processes many palettes, pre-indexing saves repeated linear searches.
  - **Fix**: Build DMC index at generator initialization.

- [ ] **insights-engine.js, line 21 (fmtDate)**: Each insight call may invoke `toLocaleDateString('en-GB', ...)` with new options object. Hoist options.
  - **Why wasteful**: Options object allocated per format call.
  - **Fix**: `const DATE_FORMAT_OPTIONS = { day: 'numeric', month: 'short', year: 'numeric' };` at module scope.

- [ ] **pdf-export-worker.js, buildPdf() function**: Audit if any Intl.NumberFormat or date formatters are recreated per page. Look for `.toLocaleString()` or `.toLocaleDateString()` called in loops.
  - **Why wasteful**: Intl instances are expensive; should be created once.
  - **Fix**: Create Intl formatters at worker init; reuse across all pages.

- [ ] **creator/BulkAddModal.js, lines 23–32**: Regex patterns in `parseBulkThreadList()` (`/[\s,;\n]+/`, `/^anchor\s*/i`, etc.) recreated per paste or kit load.
  - **Why wasteful**: Four regexes compiled on every text parse.
  - **Fix**: `const DELIM_REGEX = /[\s,;\n]+/;` etc. at module scope.

- [ ] **components.js, lines 200, 892, 1815**: `Object.keys().sort()` and `Object.entries().sort()` in stats rendering components.
  - **Why wasteful**: Sorting happens per render; if data is stable, cache sorted keys.
  - **Fix**: Use `useMemo` to cache sorted results.

## Out of Scope / Nice-to-Have

- **Intl.Collator for locale-aware sorts**: Many `Object.keys().sort()` and `.localeCompare()` calls could use cached Collator; low priority unless sort performance is measurable issue.
- **Canvas context re-acquisition in realistic preview**: tracker-app.js TrackerPreviewModal repeatedly calls `canvas.getContext("2d")`; could cache context across renders if canvas persists.
- **JSON.parse/stringify in sync flows**: sync-engine.js likely calls JSON routines per message; low-level optimization but acceptable for correctness.
- **Repeated Math.min/max in layout**: embroidery.js and RealisticCanvas have repeated Math.max(0, ...) and clamping; negligible unless profiler shows issue.
