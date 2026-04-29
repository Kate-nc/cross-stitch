# Import Engine — Phase 5 Comprehensive Review

> Branch: `import-improver`
> Range: `0ad1997` (Unit 1) … `a2b4565` (Unit 14)
> Tests: 1467 passing across 131 suites
> Bundle: `import-engine/bundle.js` (110 KB, 22 modules)

## What shipped

The Phase 5 implementation delivers a fully pluggable, worker-isolated pattern
import engine that supersedes the previous ad-hoc dispatch in
[tracker-app.js](../tracker-app.js#L2895) and [creator-main.js](../creator-main.js).

| Unit | Module(s) | Purpose |
|------|-----------|---------|
| 1 | `pipeline.js`, `types.js` | 7-stage pipeline, error taxonomy, abort tokens, confidence math |
| 2 | `worker.js`, `workerClient.js` | Off-main-thread import host with cancellation |
| 3 | `classifier/sniffMagic.js` | Magic-byte + extension + MIME format probe |
| 4 | `strategies/{oxs,json,image}Strategy.js` | Wraps the legacy parsers behind the registry |
| 5 | `pdf/{pdfDocLoader,operatorWalker,textBands,publishers}.js` | PDF.js operator-list traversal + publisher detection |
| 6 | `pdf/dmcPageRoles.js` | DMC PDF page classification (chart / legend / materials / cover) |
| 7 | `pdf/legendExtractor.js` | Trilingual (EN/FR/ES) legend row extraction with stitch-type detection |
| 8 | `pdf/gridExtractor.js`, `pipeline/assemble.js` | Grid-pitch detection, snap-to-grid, multi-tile chart assembly |
| 9 | `pdf/metaExtractor.js` | Title / designer / fabric / finished-size extraction |
| 10 | `pipeline/validate.js` | Per-thread count vs legend, palette coverage, layout sanity |
| 11 | `pipeline/materialise.js` | Builds a v8 project shape-identical to `importResultToProject` |
| 12 | `ui/ImportReviewModal.js` | Preview / Palette / Details / Compare panes + warnings list |
| 13 | `wireApp.js` + HTML/`home-app.js` edits | "From pattern file…" entry, picker → review → save → navigate |
| 14 | `strategies/pdfGlyphStrategy.js` | Adopts `PatternKeeperImporter` as a strategy |
| 15 | (deferred) | Image fallback polish — existing path adequate for v1 |

## Architecture compliance

- **No build step required** for non-bundled files — the engine ships as a
  single `import-engine/bundle.js` produced by `node build-import-bundle.js`,
  mirroring the `creator/` pattern.
- **Strategy pattern**: every parser registers via
  `window.ImportEngine.register({id, formats, canHandle, parse})`. The
  registry returns the highest-scoring strategy per probe, with explicit
  thresholds (DMC 0.95 > FlossCross 0.9 > pdfGlyph 0.7).
- **Confidence ladder is honoured end-to-end**: format → palette → grid
  combine via `combineConfidence` and `pickReviewMode` selects fast-path
  (≥0.95), standard (≥0.80), or guided wizard (<0.80). v1 always shows the
  review modal per the locked spec.
- **Workshop-only theme & no emoji rule**: all UI uses `window.Icons.*`
  (added six new icons in `icons.js`: `confidenceHigh`, `confidenceLow`,
  `magnifier`, `splitView`, `gridOverlay`, `wandFix`). British English in
  user-facing strings ("colour", "palette").
- **PK-compat regression check**: untouched
  [pdf-export-worker.js](../pdf-export-worker.js),
  [creator/pdfChartLayout.js](../creator/pdfChartLayout.js),
  [creator/pdfExport.js](../creator/pdfExport.js) — the new engine doesn't
  cross those module boundaries.
- **CommonJS dual-export**: every module exposes both `window.ImportEngine.*`
  in the browser and `module.exports` in Node so Jest can `require()` them
  directly without `eval()` shenanigans.

## Test coverage

```
tests/import/
├── pipeline.test.js              (16 — stages, abort, confidence math)
├── workerClient.test.js          ( 5 — message protocol, cancellation)
├── sniffMagic.test.js            ( 9 — magic + ext + MIME)
├── legacyStrategies.test.js      ( ?? — OXS/JSON/image parity)
├── pdfInfra.test.js              (14 — operator walker, publishers, fixtures)
├── pdfDmcClassify.test.js        (13 — page roles + layout-A/B inference)
├── pdfLegendExtractor.test.js    (15 — code regex, trilingual types)
├── pdfGridAssemble.test.js       (16 — pitch detection, tile assembly)
├── pdfMetaExtractor.test.js      (15 — title/designer/fabric/size)
├── validateExtraction.test.js    ( 8 — warnings + coverage)
├── materialise.test.js           ( 8 — v8 shape, attachments)
├── uiReviewModal.test.js         ( 5 — mergeEdits + registry)
└── pdfGlyphStrategy.test.js      ( 4 — registration + canHandle)
```

Two real PDF analysis fixtures (`PAT1968_2`, `PAT2171_2`) drive page
classifier tests, validating both Layout-A (separate BS + legend pages) and
Layout-B (combined chart + inline legend) detection.

## Known gaps & next-iteration work

1. **Wizard UI is stubbed.** `ImportReviewModal` exposes an "Open guided
   wizard" button when coverage <0.95, but the `<0.80` wizard flow itself
   isn't implemented — clicking it currently resolves with `action:
   'wizard'` and the caller has no follow-up behaviour. Build out a
   step-by-step grid/legend-correction wizard in Phase 6.
2. **Tracker import path still uses the legacy code.** [tracker-app.js
   `loadProject()`](../tracker-app.js#L2895) hasn't been migrated — only
   the new home tile routes through the engine. Migrate the tracker dialog
   to call `ImportEngine.importAndReview()` so all entry points share the
   review experience.
3. **DMC chart parsing accuracy.** Page classification, legend extraction,
   and grid extraction all have unit tests against synthetic data and
   page-stat fixtures, but no end-to-end fixture parses an actual DMC PDF
   into a v8 project yet. The pipeline runs in the browser but needs
   visual QA against the two `TestUploads/` fixtures.
4. **Edge-overlap fallback for tile alignment** (`assemble.js`
   `edgeOverlapScore`) is implemented but not yet *used* — `assembleTiles`
   relies on N/M page markers. Add an overlap-search fallback when markers
   are absent.
5. **`originalFile` attachment ceiling.** `attachOriginalFile` blindly
   compresses bytes; PDFs over ~5 MB will fatten saved projects. Add a
   size cap (e.g. skip attachment >2 MB after compression) per the design
   doc.
6. **No localised UI strings.** The review modal hard-codes English. The
   trilingual legend detector handles French/Spanish for *parsing* but UI
   labels are EN-only.
7. **Image strategy uses the legacy `parseImagePattern`** unchanged. Unit
   15's "polish" — palette deduping, dithering toggle in the review modal
   — is deferred per the spec.

## How to use

```js
// In any page that loads import-engine/bundle.js:
const result = await window.ImportEngine.importPattern(file);
if (!result.ok) { /* show error */ return; }

const review = await window.ImportEngine.openReview({
  project: result.project,
  warnings: result.warnings,
  coverage: result.confidence.overall,
  reviewMode: result.reviewMode,
});

if (review.action === 'confirm') {
  await ProjectStorage.save(review.project);
}

// One-shot helper used by the home-page tile:
await window.ImportEngine.openImportPicker();
```

## Verification commands

```bash
node build-import-bundle.js     # Rebuild the bundle after engine edits
npm test                        # Full suite — 1467 tests across 131 suites
node --check import-engine/bundle.js  # Syntax sanity
```
