# Import 9 — Implementation Specification

> Phase 4, Step 2. Implementable breakdown of the import engine.
> Approach A is locked, v1 scope is the existing format set (OXS, JSON,
> image, glyph PDF) plus the new DMC PDF strategy, confidence
> thresholds 0.95 / 0.80.

---

## Scope locked

- **Architecture**: pipeline + strategy plugins per [import-5](import-5-architecture.md). One `importPattern(file, opts)` entry-point that returns an `ImportResult`.
- **UI**: Approach A (modal). Auto-escalate to wizard mode when overall confidence < 0.80. No auto-import — fast-path always shows a one-click confirmation.
- **v1 strategy set**:
  - `oxs-strategy` — wraps existing `parseOXS()` from [import-formats.js](../import-formats.js)
  - `json-strategy` — wraps existing project-JSON loader
  - `image-strategy` — wraps existing `parseImagePattern()`
  - `pdf-glyph-strategy` — wraps existing [pdf-importer.js](../pdf-importer.js)
  - `pdf-dmc-strategy` — new, per [import-6](import-6-dmc-adapter.md)
- **Original-file persistence**: store compressed bytes via `pako` in the v8 project under `meta.attachments.originalFile`.
- **Entry point**: replace the New project menu's `From image…` with `From pattern file…` (image becomes a strategy).

---

## Implementation units

Each unit is a separate commit. Order is dependency-respecting.

### Unit 1 — Core pipeline framework
- **Files**: `import-engine/types.js`, `import-engine/registry.js`, `import-engine/pipeline.js`, `import-engine/index.js`
- **Adds**: `ImportEngine`, `RawCell`/`RawExtraction`/`ImportResult` JSDoc types, strategy registry, pipeline orchestrator (sniff → classify → extract → assemble → palette → validate → materialise)
- **Confidence primitives**: `combineConfidence(...)`, `threshold(value, { fast: 0.95, standard: 0.80 })`
- **Tests** (`tests/import/pipeline.test.js`): mock-strategy round-trip; confidence propagation; failure/abort paths; unknown format → typed `UnsupportedError`
- **Commit**: `feat(import): add general-purpose import pipeline framework`

### Unit 2 — Worker boundary
- **Files**: `import-engine/worker.js`, `import-engine/workerClient.js`
- **Adds**: dedicated worker that hosts the engine; main-thread `importPatternAsync(file, { onProgress })` RPC. Cancellation = `worker.terminate()`.
- **Tests** (`tests/import/workerClient.test.js`): mock `Worker` shim; verify progress + result + error round-trip
- **Commit**: `feat(import): isolate import engine in a dedicated worker`

### Unit 3 — Sniff + format classifier
- **Files**: `import-engine/classifier/sniffMagic.js`
- **Adds**: magic-byte format detection (`%PDF-`, `<?xml`, `{`, image headers); ext+MIME fallback; emits `{ format, confidence }`
- **Tests**: covers each supported format on real bytes from `tests/` fixtures
- **Commit**: `feat(import): add magic-byte format sniffer`

### Unit 4 — Adopt existing strategies (OXS / JSON / image)
- **Files**: `import-engine/strategies/oxsStrategy.js`, `jsonStrategy.js`, `imageStrategy.js`
- **Approach**: thin adapters delegating to the existing `parseOXS`, JSON loader, and `parseImagePattern`. Wrap their output in a `RawExtraction`.
- **Tests** (`tests/import/legacyStrategies.test.js`): parity test — old call vs new pipeline call → identical project objects.
- **Commit**: `feat(import): adopt existing OXS/JSON/image parsers as strategies`

### Unit 5 — PDF processing infrastructure
- **Files**: `import-engine/pdf/pdfDocLoader.js`, `pdf/operatorWalker.js`, `pdf/textBands.js`, `pdf/publishers.js`
- **Adds**: pdfjs-dist wrapper with timeout + memory caps; pure-function operator-stream walker (CTM stack, fill colour, pending path); text-by-Y-band grouper; publisher fingerprint table (DMC + flosscross + PatternKeeper)
- **Tests** (`tests/import/pdfInfra.test.js`): synthetic op-streams + the existing `reports/import-2-raw/*.analysis.json` fixtures (real DMC output)
- **Commit**: `feat(import): add PDF processing infrastructure`

### Unit 6 — DMC PDF strategy: page classifier
- **Files**: `import-engine/strategies/pdfDmcStrategy.js` (page classifier portion), `pdf/dmcPageRoles.js`
- **Tests** (`tests/import/pdfDmcClassify.test.js`): both `PAT*.pdf` analysis JSONs → expected page roles + layout-variant inference (A vs B)
- **Commit**: `feat(import): add DMC PDF page classifier`

### Unit 7 — DMC PDF strategy: legend extractor
- **Files**: `pdf/legendExtractor.js` (DMC-specific portion in `pdfDmcStrategy.js`)
- **Adds**: text-band grouping, swatch detection, art-line propagation, code regex (`B5200|D\d{3}|E\d{3,4}|\d{2,5}`), trilingual stitch-type classifier
- **Tests** (`tests/import/pdfDmcLegend.test.js`): expected DMC codes recovered from both fixtures with no false positives
- **Commit**: `feat(import): add DMC colour key extractor`

### Unit 8 — DMC PDF strategy: grid extractor + multi-page assembly
- **Files**: `pdf/gridExtractor.js`, `pipeline/assemble.js`
- **Adds**: chart bbox detection, autocorrelation pitch inference, snap-to-grid, legend-constrained colour matching (legend-exact / legend-nearest / dmc-fallback), backstitch extraction (Layout A), N/M page-marker reader, edge-overlap correlation
- **Tests** (`tests/import/pdfDmcGrid.test.js`): expected grid dims; ≥99 % cell-match against hand-verified sample regions; multi-page assembly with synthetic fixtures
- **Commit**: `feat(import): add DMC grid extractor with multi-page assembly`

### Unit 9 — DMC metadata extractor
- **Files**: `pdf/metaExtractor.js`
- **Tests** (`tests/import/pdfDmcMeta.test.js`): title / designer / fabric / size from both fixtures
- **Commit**: `feat(import): add DMC metadata extractor`

### Unit 10 — Validation layer
- **Files**: `import-engine/pipeline/validate.js`
- **Adds**: per-thread cell-count vs legend-total cross-check, palette coverage, dimension sanity, empty-cell detection; emits `ImportWarning[]` ranked by severity
- **Tests** (`tests/import/validate.test.js`): synthetic over- and under-counts; missing colours; oversized grids
- **Commit**: `feat(import): add import validation and cross-checking`

### Unit 11 — Materialiser
- **Files**: `import-engine/pipeline/materialise.js`
- **Adds**: builds the v8 project (matches `importResultToProject` exactly so it stays test-comparable); attaches compressed original-file bytes via `pako.deflate`
- **Tests** (`tests/import/materialise.test.js`): output is structurally identical to existing `importResultToProject` for OXS/JSON/image cases
- **Commit**: `feat(import): add v8 project materialiser`

### Unit 12 — Review + correction UI
- **Files**: `import-engine/ui/ImportReviewModal.js`, `ImportPreviewPane.js`, `ImportPaletteList.js`, `ImportMetadataForm.js`, `ImportSideBySide.js`, `ImportProgress.js`, `ImportFilePicker.js`
- **Adds**: Approach A modal with three modes (`fast-path` / `standard` / `guided`), confidence overlay, cell inspector, palette correction, side-by-side PDF render
- **Tests** (`tests/import/reviewUi.test.js`): React Testing Library — mode picker, palette edit roundtrip, fast-path Import button enabled
- **Commit**: `feat(import): add import review and correction UI`

### Unit 13 — Wire into Creator + Tracker
- **Files**: edits in [creator-main.js](../creator-main.js), [tracker-app.js](../tracker-app.js), [home-app.js](../home-app.js); new menu item `From pattern file…` replacing `From image…`
- **Tests** (`tests/import/integration.test.js`): end-to-end with mocked file → review → import → project in IndexedDB
- **Commit**: `feat(import): integrate new import engine into app`

### Unit 14 — Glyph PDF strategy refactor
- **Files**: `import-engine/strategies/pdfGlyphStrategy.js` (wraps existing pdf-importer logic); deprecate the standalone `pdf-importer.js` once parity passes
- **Tests** (`tests/import/pdfGlyph.test.js`): existing PDF fixtures pass through the new engine
- **Commit**: `refactor(import): adopt glyph PDF importer as a strategy`

### Unit 15 — Image-fallback adapter polish
- **Files**: `import-engine/strategies/imageStrategy.js` enhancements (grid-line detection, palette inference)
- Built only if existing image importer is insufficient as the unknown-format fallback. Defer if existing path is adequate.
- **Commit**: `feat(import): improve image-based fallback importer`

---

## Test plan summary

| Layer | Where | What |
|---|---|---|
| Pipeline | `tests/import/pipeline.test.js` | Stage flow, error / abort, unknown format |
| Worker | `tests/import/workerClient.test.js` | RPC + cancellation |
| Strategies (legacy) | `tests/import/legacyStrategies.test.js` | Parity vs old `parseOXS` / etc |
| PDF infra | `tests/import/pdfInfra.test.js` | Op-walker, text bands, publisher fingerprint |
| DMC classify | `tests/import/pdfDmcClassify.test.js` | Page roles, layout-variant |
| DMC legend | `tests/import/pdfDmcLegend.test.js` | All codes recovered, no false positives |
| DMC grid | `tests/import/pdfDmcGrid.test.js` | Dims + cell-match %, multi-page assembly |
| DMC meta | `tests/import/pdfDmcMeta.test.js` | Metadata fields |
| Validate | `tests/import/validate.test.js` | Cross-checks |
| Materialise | `tests/import/materialise.test.js` | v8 project shape |
| UI | `tests/import/reviewUi.test.js` | Mode picker, edits, fast-path |
| Integration | `tests/import/integration.test.js` | End-to-end |

Golden fixtures: the existing `reports/import-2-raw/PAT1968_2.analysis.json` and `PAT2171_2.analysis.json` are bundled into `tests/fixtures/import/` and used by every PDF-DMC test.

---

## Bundling

Sibling `build-import-bundle.js` produces `import-engine/bundle.js` by concatenation, mirroring `build-creator-bundle.js`. `index.html`, `stitch.html`, and `manager.html` add one `<script src="import-engine/bundle.js">` tag after the existing creator bundle.

---

## Out of scope for v1

- Re-import / patch workflow
- Multi-file batch import
- WinStitch XSP, PCStitch, HobbyWare, PatternKeeper internal SQLite
- High-fidelity mockup pass beyond the existing wireframes (the wireframes are the design source for Approach A)

---

## Next

Phase 5 — implementation, working through Unit 1 onwards.
