# Cleanup 21: ruler-to-grid placement maths out of pdf-importer.js (F-013)

Base: `7633e1ff2984b6cf57784f05aa5f341651e29890` (`origin/main`, v1.0.212). Prerequisites merged: #362, #363, #364, #365
(cleanup 01 to 04). Branch `cleanup/21-pdf-geometry` (did not exist on the remote; created from the verified `main`).

## Finding and boundary

F-013 (pdf-importer.js is one ~4 400-line class) is still current. The audit itself is not in the checkout, so the family was chosen
by reading the class: the placement arithmetic that turns a page's printed rulers into absolute cells took explicit inputs, held no
importer state and reached no pdf.js, DOM, storage or timer API.

Moved to the classic script `pdf-chart-geometry.js` (global `PdfChartGeometry`, also `module.exports`), bodies lifted verbatim
(only `this.chartContentBox(` and `this.gridFromRuler(` became plain calls to the sibling function):

| function | callers in the importer |
|---|---|
| `chartContentBox(page, pitchX, pitchY)` | `rulerCellSpan`; `readRulerLayout` (left-out remainder pages) |
| `rulerCellSpan(page, ruler, limitCols, limitRows)` | `readRulerLayout` (fallback when the grid cannot be anchored) |
| `anchorGridToRuler(grid, ruler, limitCols, limitRows)` | `readRulerLayout` (vector and glyph charts) |
| `gridFromRuler(ruler, span, fallback)` | `samplingGrid` |
| `samplingGrid(pInfo)` | `analyseChart`, `extractSymbols`, `collectBackstitch` (vector, legend-linked and per-page review paths) |

`PatternKeeperImporter` keeps all five methods with the same names and signatures, now one-line delegates, so anything reaching
them through the class (tests, `ImportEngine` consumers) is unchanged. Not moved: `readRulerLayout` (reads `PdfAxisLabels`, mutates the
page records it is given, carries the remainder-page handling), `detectGrid`, the fractional-stitch shape helpers, `gridOf`, and
everything in `pdf-raster-chart.js`, `pdf-axis-labels.js` and the workers. Protected PDF export files
(`pdf-export-worker.js`, `creator/pdfChartLayout.js`, `creator/pdfExport.js`) and the PDF export path are untouched, and nothing
shared with them is touched: `pdf-chart-geometry.js` is loaded only by the importer's loaders. No PK regression check is therefore
required, and none was run; `scripts/verify-pdf-pk-baseline.cjs` was not run because there is no export-path change for it to cover.

## Loading

`pdf-chart-geometry.js` is loaded after `pdf-axis-labels.js` and `pdf-raster-chart.js` and immediately before `pdf-importer.js` in
every chain that loads the importer: `create.html`, `index.html`, `stitch.html` (`loadPdfStack`) and
`import-engine/strategies/pdfGlyphStrategy.js` (and therefore `import-engine/bundle.js`, regenerated with
`node build-import-bundle.js`). Added to `sw.js` PRECACHE_URLS; fingerprints and BUILD_ID regenerated with `node build-sw.js`. The Jest
setup file exposes the global to eval-based importer tests the way pages do. No worker loads the importer. `tests/pdfChartGeometryLoading.test.js`
fails if a loader omits it or orders it wrongly, if a new loader of the importer appears, or if the service worker stops listing it.

Pure cleanup: no help-drawer or APP_CHANGELOG entry. README file list and the Key Files table in `.github/copilot-instructions.md`
gained one line each.

## Evidence

Commands run from the repository root with Node 22.22.0, base and head in the same container.

1. **Characterisation (`tests/import/pdfRulerGeometry.test.js`, 32 tests plus boundaries).** Written and committed against the unmodified
   importer first (commits 1 and 2); the identical file passes on the head and was re-run against the base importer after the final
   edit. Mutation check: nudging the 4% tolerance (either axis), either backdrop dimension, the two-cell extension limit, or the
   on-line label offset each fails at least one test.
2. **Randomised base-versus-head differential** (`differential.cjs`, 20 000 iterations per method, 120 000 comparisons, malformed
   shapes, NaN/Infinity/undefined, seeded): 0 mismatches in return value, thrown error class and message, input mutation and returned-object
   identity; 2 980 cases threw in the base and 24 171 returned null, and head matched them all. The same script reports mismatches for the
   mutants above (66, 9, 150 for three of them), so it can see a difference. It cannot see an exact-boundary mutant by chance (the white-backdrop
   `>` to `>=` case), which the Jest boundary tests catch.
3. **Real fixtures through the whole importer** (`real-pdf-differential.cjs`, pdf.js 4.2.67 legacy build, `analyse` + `buildFromLayout`,
   whole session/placement/project/progress/warnings compared as serialised text, pdf.js's per-document font counter normalised):
   SAME for all six `TestUploads` PDFs (dimensions 226x285, 103x94, 73x72, 309x467, 256x450, 299x474) and for four malformed inputs
   (empty buffer, garbage bytes, a 20 KB truncation of gen1.pdf, a header-only file: the identical "Failed to parse PDF" errors).
   Call counts on the head show what the real PDFs exercise: `samplingGrid` on all, `anchorGridToRuler` (36/12/60 calls) on gen-3, gen1 and
   lord-libidan, and `chartContentBox` directly (12) on lord-libidan. `rulerCellSpan` and `gridFromRuler` are **not reached** by any of
   the six real PDFs; they are covered by the Jest characterisation and the existing synthetic MacStitch/ruler tests only.
4. **Full Jest** (`npm test -- --ci --reporters=default --maxWorkers=2`): 402 suites passed, 1 skipped (the optional XSD reference suite,
   needs `XSD_REFERENCE_ROOT`); 5 893 tests passed, 4 skipped (same 4 as the baseline). Baseline on the same base: 400 suites, 5 851 passed.
   The 42 extra tests are the 32 characterisation and 10 loading tests.
5. **Lints and generators:** `npm run lint:terminology` passed; `npm run lint:css-tokens` reports its existing advisory findings (no CSS
   changed); `node build-creator-bundle.js` and `node scripts/check-generated-bundles.js` leave the creator bundles unchanged;
   `node build-import-bundle.js` changes only `import-engine/bundle.js` (the added loader line); `node build-runtime-js.js --check` up to
   date; `node build-sw.js` then `--check` clean; `git diff --check` clean.
6. **Browser** (Chromium 141 at `/opt/pw-browsers/chromium-1194`, via a scratch wrapper config because Playwright's pinned build 1217 is not
   installed; the repo config was not edited): the four PDF-related e2e specs (`import-review-phone`, `import-pages-touch`,
   `import-friendly-errors`, `home-create-three-paths`), 13 tests, passed on the touch-tablet-chromium project. `browser-smoke.cjs` loads
   `create.html`, `index.html?mode=stats`, `stitch.html` and Home, records the script requests (all four in the right order, all 200,
   no page errors), then imports PAT1968_2.pdf through each chain (103x94, 5 347 stitches in each of the three `loadPdfStack` pages;
   the import review opens from Home).
7. **Performance** (`bench.cjs`, a synthetic 300x400-cell page: 120 000 filled cells, 120 000 glyphs, 70 ruler labels; four runs of 15
   interleaved rounds): median 193 to 229 ms on base against 195 to 250 ms on head, with the sign changing between runs, so no
   measurable difference beyond noise; heap delta 0.11 MB for both. Real PDFs end to end (single runs, one machine, up to ~10% noise):
   gen-3 27.6 s / 28.8 s, lord-libidan 32.2 s / 35.7 s (earlier run 34.6 s / 33.9 s), gen1 4.7 s / 4.5 s (base / head).

## Not run / limitations

- The service-worker lifecycle suite (`tests/service-worker`, `npm run test:sw`) could not run: it downloads CDN assets with `curl`
  and the sandbox proxy answers 403. Precache listing and fingerprints are covered by `swPrecacheSync.test.js`,
  `pdfChartGeometryLoading.test.js` and `node build-sw.js --check` only; offline behaviour on a real service worker is **untested**.
- The full e2e suite, iPad WebKit, mobile-audit and perf projects were not run; only the PDF-related specs above.
- No real fixture reaches `rulerCellSpan` or `gridFromRuler` (item 3), and no scanned (picture-only) or multi-design PDF fixture is
  in `TestUploads`; those paths are covered by the existing synthetic Jest suites (`pdfScannedImport`, `pdfDesigns`, `pdfMacStitch`,
  cancellation and worker tests) which pass unchanged.
- Page selection, cancellation and warnings were compared on the real fixtures (progress events and warnings are part of the compared
  output) and by the existing lifecycle/cancel suites; no interactive cancel was driven in a browser.
- PDF export / Pattern Keeper output: unaffected by construction (no shared file changed); not measured.
