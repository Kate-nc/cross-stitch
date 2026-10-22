# Cleanup 22: decoded-picture pixel conversion out of pdf-importer.js (F-013)

Base: `9e07f05c790ef9cbb53353b36718398111f944c2` (`origin/main`, v1.0.213). Prerequisites merged: #362, #363, #364, #365
(cleanup 01 to 04) and #383 (cleanup 21). Branch `claude/epic-meitner-mdbc28` (the branch the session was assigned; the prompt's
`cleanup/22-pdf-raster-boundary` was not created, see "Limitations").

## Finding and boundary

F-013 (pdf-importer.js is one ~4 100-line class) is still current. The audit is not in the checkout, so the phase was chosen by reading
the raster code in `pdf-importer.js` and `pdf-raster-chart.js`:

* `pdf-raster-chart.js` is already a standalone set of pure functions over `{ width, height, data }` (grid finding, cell reading,
  grouping), loaded by the raster worker as well. Nothing in it needed separating.
* In the importer, the raster work is page rendering (`renderPagePixels`, tied to pdf.js and a canvas), the scanned-page loop and worker
  (`importScanned`, `rasterReader`, async, cancellable, ownership of the kept page pixels), the symbol-picture cut-out
  (`scannedSamples`), and the conversion of a decoded symbol picture to pixels (`pictureRgba`, then `pictureShape`).

The phase moved is the byte-level half of `pictureRgba`: raw bytes from pdf.js (1-bit grey, grey, RGB, RGBA, told apart by `kind` or by
bytes per pixel) to an RGBA buffer, and the composite of an RGBA buffer onto white. Its inputs and outputs are plain data, it reads no
pdf.js, DOM, canvas, storage or timer, and it is synchronous.

Moved to the classic script `pdf-picture-pixels.js` (global `PdfPicturePixels`, also `module.exports`), bodies lifted verbatim:

| function | what it is | caller |
|---|---|---|
| `rawToRgba(img, w, h)` | the `img.data` branch: allocate `w*h*4`, expand per `kind`, return the buffer or `null` | `pictureRgba` |
| `onWhite(src, w, h)` | composite onto white, return `{ w, h, data }` | `pictureRgba` |

`pictureRgba(img)` keeps its name and signature and its size check, and still owns the `img.bitmap` branch: the `canvasFactory` /
`OffscreenCanvas` / `document` choice, `drawImage`, `getImageData`, and the try/catch that turns any canvas failure into `null`. Canvas
lifetime and the `canvasFactory` option are therefore untouched. `readSymbolPictures` (cancellation checkpoint before each new decode,
FNV key, `_pictures` store, `pictureShape`) and everything in `importScanned` are unchanged.

Not moved: `pictureShape`, `matchPictures`, `renderPagePixels`, `importScanned`, `rasterReader`, `scannedSamples`, the raster worker, and all of
`pdf-raster-chart.js`. Protected PDF export files (`pdf-export-worker.js`, `creator/pdfChartLayout.js`, `creator/pdfExport.js`) and the export path are
untouched and share nothing with the changed code (`pdf-picture-pixels.js` is loaded only by the importer's loaders), so no PK regression check
applies; `scripts/verify-pdf-pk-baseline.cjs` does not reference the importer and was not run.

Memory ownership is unchanged by construction and was measured: `pictureRgba` allocates exactly two `w*h*4` `Uint8ClampedArray`s on the raw
path (the expansion buffer, then the opaque result) and one result plus the canvas read-back on the bitmap path, before and after; neither new
function keeps a reference. The differential below compares allocation count and bytes per call.

## Loading

`pdf-picture-pixels.js` is loaded after `pdf-chart-geometry.js` and immediately before `pdf-importer.js` in every chain that loads the importer:
`create.html`, `index.html`, `stitch.html` (`loadPdfStack`) and `import-engine/strategies/pdfGlyphStrategy.js` (and so `import-engine/bundle.js`,
regenerated with `node build-import-bundle.js`; its diff is the one added loader line). Added to `sw.js` PRECACHE_URLS; fingerprints and BUILD_ID
regenerated with `node build-sw.js`. The Jest setup file exposes the global the way pages do. `tests/pdfPicturePixelsLoading.test.js` fails if a loader
omits it or orders it wrongly, if the service worker stops listing it, or if it stops being standalone. README file list and the Key Files table in
`.github/copilot-instructions.md` gained one line each. Pure cleanup: no help-drawer or APP_CHANGELOG entry.

## Evidence

Commands from the repository root, Node 22.22.0, base and head in the same container.

1. **Characterisation** (`tests/import/pdfPicturePixels.test.js`, 21 tests). Written and committed against the unmodified importer first
   (commit 1), extended with rounding and row-padding cases (commit 2, passing on base), and re-run against the base importer after the final edit:
   21 passed on both. Mutation check on the moved file: `Math.round` to `Math.floor`, `255` to `254` for a set bit, the third-channel index, the
   1-bit row width, the channel-count lower bound and the alpha channel each fail at least one test (the first and the row width only after the
   commit 2 cases were added).
2. **Randomised base-versus-head differential** (`differential.cjs`, 20 000 images, seeded; base and head importers in separate vm contexts with a counting
   `Uint8ClampedArray`): 0 mismatches in returned bytes and size, error class and message, input mutation, output/input aliasing, the canvas calls made
   (create, draw, read-back) and typed-array allocations (count and bytes). Base threw 176, returned null 9 444 and converted 10 380 (2 132 through a canvas);
   head matched all. The same script reports 742, 256, 770, 1 972 and 77 mismatches in 3 000 images for five mutants of the moved file (rounding, set-bit
   value, channel index, an extra allocation, the channel-count bound), so it can see a difference including an extra allocation.
3. **Real fixtures through the whole importer in Node** (`real-pdf-differential.cjs`, pdf.js 4.2.67 legacy build, `analyse` + `buildFromLayout`; whole
   session/placement/project/progress and warnings compared as serialised text): SAME for all six `TestUploads` PDFs and for four malformed inputs
   (identical "Failed to parse PDF" errors). Only lord-libidan (MacStitch, symbol pictures) reaches the moved code: 3 355 `rawToRgba` and 3 355 `onWhite`
   calls, identical output. The other five never call it.
4. **Real fixtures in Chromium, where pdf.js returns ImageBitmaps** (`browser-compare.cjs`, base page served from a worktree of the base commit on :8001,
   head on :8000): PAT1968_2 (103x94, 5 347 stitches) and lord-libidan (299x474, 141 726 stitches) hash identically on base and head (project plus progress events;
   75 progress events on lord-libidan on both). All 3 356 decodes on lord-libidan were bitmaps, so this is the canvas branch; `pictureRgba` total 873 ms base,
   888 ms head over 3 356 calls. This is the only run that exercises the canvas branch on a real PDF.
5. **Full import journey** (`home-journey.cjs`): lord-libidan dropped on the Home import tile on base and on head, the import review text is byte-identical
   (SHA-256 prefix `fec7a3ea9b44a1ee`, "299 x 474 stitches", "100% matched to the key"), no page errors. `browser-smoke.cjs` on head: the four PDF-using pages
   (`create.html`, `index.html`, `stitch.html`, Home) request the five PDF scripts in the right order, all 200, `window.PdfPicturePixels` defined, PAT1968_2 imports
   103x94 / 5 347 stitches through each of the three `loadPdfStack` pages and the review opens from Home. Four PDF-related Playwright specs (13 tests,
   `import-review-phone`, `import-pages-touch`, `import-friendly-errors`, `home-create-three-paths`) passed on `touch-tablet-chromium`.
6. **Full Jest** (`npm test -- --ci --reporters=default --maxWorkers=2`): baseline 402 suites passed, 1 skipped; 5 893 passed, 4 skipped. Head 404 suites
   passed, 1 skipped; 5 924 passed, 4 skipped (the 31 extra tests are the 21 characterisation and 10 loading tests; the skipped suite is the optional XSD
   reference one). `npm run lint:terminology` passed; `npm run lint:css-tokens` reports its existing advisory findings (no CSS changed);
   `node build-creator-bundle.js` and `node scripts/check-generated-bundles.js` leave the creator bundles unchanged; `node build-runtime-js.js --check` up to
   date; `node build-sw.js` then `--check` clean; `git diff --check` clean.
7. **Performance and memory** (`bench.cjs`, 1000x1000 pixels, 25 conversions a case, one side per process): interleaved base/head medians for raw RGBA
   830/810/967/884/792/812 ms base against 891/818/808/816/721/872 ms head, raw RGB 754/693/669/645/679/735 against 640/645/722/673/666/688, with the sign
   changing from run to run, so no measurable difference beyond noise. Peak RSS 142.3 to 143.1 MB base, 141.5 to 141.9 MB head. The retained-ArrayBuffer figures in
   `bench-output.txt` fluctuate with garbage-collection timing (including negative values) on both sides and are **not** evidence; the allocation counts and bytes in
   item 2 are the memory comparison. Real-PDF end-to-end times are in items 3 and 4 (lord-libidan 45.9 s base / 45.2 s head in Node; 12.9 s / 12.7 s in
   Chromium; single runs).

## Not run / limitations

* **Branch name.** The prompt asks for `cleanup/22-pdf-raster-boundary`; the session was assigned `claude/epic-meitner-mdbc28` and pushes only there, so the work is on
  that branch.
* Cancellation and failure paths: `pictureRgba` is synchronous and the cancellation checkpoint (`checkCancelled()` before each new decode in `readSymbolPictures`) is
  untouched; it is covered by the new characterisation test, not by driving a cancel in a browser. Canvas failures (no context, throwing draw, throwing read-back, throwing
  factory) are covered by the characterisation and the differential. The scanned-page path (`importScanned`, `rasterReader`, worker termination on cancel) was not changed and
  was not re-driven beyond the unchanged `pdfScannedImport`, `pdfRasterChart` and lifecycle Jest suites.
* The kinds and transparency of lord-libidan's pictures were not recorded (raw bytes in Node, bitmaps in Chromium), so no real fixture is known to cover 1-bit or
  transparent pictures; those are covered by the Jest characterisation and the differential only.
* The service-worker lifecycle suite (`npm run test:sw`) was not run (it needs CDN downloads the sandbox proxy refuses). Precache listing and fingerprints are covered by
  `swPrecacheSync`, `pdfPicturePixelsLoading` and `node build-sw.js --check`; offline behaviour on a real service worker is **untested**.
* The full e2e suite, iPad WebKit and mobile-audit projects were not run, and Playwright's pinned Chromium build is not installed (Chromium 141 from
  `/opt/pw-browsers/chromium-1194` was used through a scratch config; the repo config was not edited).
* Observation, not changed (out of scope): the `ImageBitmap` that `decodePicture` returns is never `close()`d by the importer, before or after this change.
