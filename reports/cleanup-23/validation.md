# Cleanup 23: code-anchored colour key reader out of pdf-importer.js (F-013)

Base: `369a64ef9f1244c54c9c11dcafcb1c3e99d53598` (`origin/main`, v1.0.214). Prerequisites merged: #362 to #365 (cleanup 01 to 04), #383 (cleanup 21)
and #384 (cleanup 22). Branch `claude/relaxed-shannon-uvuadu` (the branch the session was assigned; the prompt's
`cleanup/23-pdf-legend-boundary` was not created, see "Limitations").

## Finding and boundary

F-013 (pdf-importer.js is one ~4 100-line class) is still current. The audit is not in the checkout, so the responsibility was chosen by reading the
legend code. The importer has four legend pieces:

| method | what it does | touches |
|---|---|---|
| `parseKeyEntries(page, exclude)` | code-anchored reader: finds every thread code on a page and builds its entry from the swatch, symbol, sample and text around it | page data in, new entries out; no `this`, no globals |
| `parseLegendLegacy(pages)` | the original row/column reader | page data in, new legend out |
| `parseLegend(legendPages, chartPages)` | runs both readers per page, decides which reading wins, drops repeats, carries the brand | `this.parseKeyEntries`, `parseLegendLegacy`, `gridOf` |
| `linkSymbolsToThreads(cells, legend)` | maps each chart cell to a thread (symbol, swatch, nearest, catalogue, placeholder) | **writes** `legend.matchReport` and `cell.symbol`; `this.hslToRgb`, `this.matchPictures`; DMC/colour globals |

Moved: `parseKeyEntries` only, to the classic script `pdf-key-reader.js` (global `PdfKeyReader`, also `module.exports`) as `readKeyEntries(page, exclude)`.
The body is lifted verbatim (checked line for line against the base file), 187 lines. `parseKeyEntries(page, exclude)` keeps its name, signature and doc comment on
the class and is now `return PdfKeyReader.readKeyEntries(page, exclude);`.

Why this one: it is the only piece that interprets the printed key from raw page geometry, it is pure (reads two arguments, writes nothing, keeps no state,
asynchronous nowhere), and its inputs and outputs are already plain data, so no raster or page structure is copied and no ownership contract changes:
the page is passed by reference exactly as before, the returned array and entries are new objects as before, and the swatch and sample colours are
fresh arrays as before.

Deliberately not moved:

* `parseLegend`: the pooling decision (which reading wins, the "page where both readers found next to nothing is not a key" rule, the dedupe key, the
  brand) and its call order stay put, so confidence thresholds, fallback order and what callers see are untouched.
* `parseLegendLegacy`: a second, separate reader; moving it is a different (equally pure) step.
* `linkSymbolsToThreads`: the symbol-to-thread mapping. It mutates `legend.matchReport` and the caller's cells and depends on the catalogue and colour
  globals, so it needs its own design for mutation and identity contracts. Left for a later phase.
* `matchPictures`, `readSymbolPictures`, the raster path, `analyseChart`/`buildFromLayout`, progress and cancellation. Unchanged.

Strict mode: the code used to run inside a class body, which is always strict. The new IIFE declares `'use strict'` so it keeps that. (Before adding
it, head's `parseKeyEntries` measured consistently 8 to 11% slower than base in three interleaved pairs of the benchmark below; after it the sign changes
from pair to pair. Whether that was the cause or noise was not isolated, and the strict mode is kept either way for fidelity.)

Protected PDF export files (`pdf-export-worker.js`, `creator/pdfChartLayout.js`, `creator/pdfExport.js`) are not in the diff and none of them, nor
`scripts/verify-pdf-pk-baseline.cjs`, references the importer or the new file (grep: 0 matches), so no PK regression check applies and
`verify-pdf-pk-baseline.cjs` was not run.

## Loading

`pdf-key-reader.js` is loaded after `pdf-picture-pixels.js` and immediately before `pdf-importer.js` in every chain that loads the importer: `create.html`,
`index.html`, `stitch.html` (`loadPdfStack`) and `import-engine/strategies/pdfGlyphStrategy.js` (and so `import-engine/bundle.js`, regenerated with
`node build-import-bundle.js`; its diff is the one added loader line). Added to `sw.js` PRECACHE_URLS; fingerprints and BUILD_ID regenerated with
`node build-sw.js`. The Jest setup file exposes the global the way pages do. `tests/pdfKeyReaderLoading.test.js` fails if a loader omits it or orders
it wrongly, if the service worker stops listing it, or if it stops being standalone. README file list and the Key Files table in
`.github/copilot-instructions.md` gained one line each. Pure cleanup: no help-drawer or APP_CHANGELOG entry.

## Evidence

Commands from the repository root, Node 22.22.0, base and head in the same container.

1. **Characterisation** (`tests/import/pdfKeyReader.test.js`, 42 tests). Committed first, against the unmodified importer (41 tests), then two boundary cases
   added (40.5 points of sample reach, 4 versus 4.5 thin bar) and the whole file re-run against a clean checkout of the base commit: 42 passed on base and on head. It
   covers code shapes and order, the exclusion box edges, swatch shape rules and choice (reach, tie, previous-code limit), symbol choice (inside the swatch, nearest left,
   `U+`, pictures, font label), backstitch samples, names/counts/strands/table columns, non-mutation of the page, fresh output objects and field order, and `parseLegend`'s
   pooling (multi-page, repeats by swatch, case of the code, one-entry page dropped as noise only when another key exists, key printed on a chart page with the chart masked).
2. **Mutation check** (`mutation-check.cjs`): 20 small mutations of the moved file, each run against the Jest file and the differential. 19 caught; the survivor
   (`o.prefixX >= a.c.x`) is equivalent, since a following entry's prefix is always strictly right of the previous code on the line. Two mutants initially survived
   (sample reach 41, thin bar 5) and drove the two extra tests. Output in `mutation-check-output.txt`.
3. **Randomised base-versus-head differential** (`differential.cjs`, 5 000 seeded cases, 12 487 key pages, 50 560 legend entries; base and head importers in separate vm
   contexts with the DMC table and colour maths loaded): 0 mismatches in `parseKeyEntries` results (field order included), thrown error class and message, writes to the page,
   output objects that are page objects, the pooled `parseLegend` result, and, downstream, `linkSymbolsToThreads` results, match report, `legend.matchReport` and the symbol
   written back onto the caller's cells (4 743 runs; `parseLegend` threw in 257 cases on malformed pages, identically on both). Inputs: multi-column and table layouts, text/`U+`/picture symbols,
   every swatch shape, samples, repeated and look-alike codes, ties, missing fields, an exclusion box. Run on the final `pdf-key-reader.js`.
4. **Real fixtures through the whole importer in Node** (`real-pdf-differential.cjs`, pdf.js 4.2.67 legacy build, `analyse` + `buildFromLayout`; session, placement, parsed legend
   with match report and stated facts, project, progress and warnings compared as text): SAME for all six `TestUploads` PDFs and for four malformed inputs. Legend entries read:
   Books and Blossoms 30, PAT1968_2 8, PAT2171_2 11 (key printed on the chart page), gen-3 102, gen1 105 (two entries a line), lord-libidan 105 (MacStitch table, picture symbols).
   `readKeyEntries` was reached 2, 4, 3, 37, 13 and 75 times respectively. Run on the final file.
5. **Full import journey in Chromium** (`journey.cjs`, base page from a worktree of the base commit on :8001, head on :8000): 16 scenarios SAME, 0 differing, no page errors. For
   PAT2171_2, PAT1968_2, gen1 and Books and Blossoms: drop on Home's import tile, review text and Palette tab text (SHA-256), notes, then Start stitching (Tracker),
   Edit first (Creator) and Cancel in the review. For lord-libidan and gen-3: Start stitching. Saved projects were read back from IndexedDB, then the page was reloaded (reopen) and read
   again; stored project (minus ids, timestamps, last-write stamp and per-tab clock names) identical base versus head and unchanged by reopening. Also Cancel on the progress
   card (no review, nothing saved) and a non-PDF dropped as `.pdf` (no review, nothing saved).
6. **Playwright** on a scratch config (iPad Mini touch project, Chromium 141 from `/opt/pw-browsers`, head server): `import-review-phone`, `import-pages-touch`,
   `import-friendly-errors`, `import-verification`, `import-wizard-preview`, `import-wizard-tracker`, `import-home-oxs`, `home-create-three-paths`: 22 passed.
7. **Full Jest** (`npm test -- --ci --reporters=default --maxWorkers=2`): baseline 404 suites passed, 1 skipped; 5 924 passed, 4 skipped. Head 406 suites passed, 1 skipped;
   5 976 passed, 4 skipped (the 52 extra tests are the 42 characterisation and 10 loading tests). `npm run lint:terminology` passed; `npm run lint:css-tokens` is advisory
   (no CSS changed); `node build-creator-bundle.js` and `node scripts/check-generated-bundles.js` leave the creator bundles unchanged; `node build-runtime-js.js --check` up to
   date; `node build-import-bundle.js` then `node build-sw.js` then `--check` clean; `git diff --check` clean.
8. **Performance and memory on a large legend** (`bench.cjs`, one page of 2 000 entries, about 8 000 text items and 2 000 paths, 5 runs a case, three interleaved base/head process pairs).
   `parseKeyEntries` medians base 1979/1854/2011 ms, head 1781/1946/1884 ms; `parseLegend` 1983/1821/2148 ms base, 1932/1841/1936 ms head; the sign of the difference changes
   between pairs, so no measurable difference beyond noise. Heap after GC with one result held: 0.82 to 0.89 MB on both sides; peak RSS 104 to 108 MB base, 105 to 110 MB head.
   Real-PDF end to end in Node (item 4, single runs, run alongside other work): gen-3 27.3 s base / 24.8 s head, lord-libidan 30.5 s / 29.8 s. The reader is quadratic in
   entries per page by construction (unchanged).

## Not run / limitations

* **Branch name.** The prompt asks for `cleanup/23-pdf-legend-boundary`; the session was assigned `claude/relaxed-shannon-uvuadu` and pushes only there, so the work is on that branch.
* **Real-fixture classes not available.** All six `TestUploads` PDFs use DMC codes. There is no real fixture for: Anchor, Madeira or other-brand keys, a key with a genuinely duplicated or ambiguous
  symbol, a multi-design booklet, a scanned (raster-only) chart, or a key spread across several pages whose text is not in the PDF. Duplicate/ambiguous symbols, repeated codes and
  multi-page keys are covered by the Jest characterisation and the randomised differential (synthetic pages), not by real files; those synthetic cases say nothing about format coverage.
* The brand: `parseLegend` sets `brand: "DMC"` unconditionally and the reader never looks at it; this is unchanged and not "fixed" here.
* The bad-file scenario in `journey.cjs` records no error text (its toast selector found nothing; the hash is that of an empty string), so it establishes only "no review, nothing saved,
  no page error", identically on both sides. The friendly error text itself is covered by `import-friendly-errors.spec.js` (passed).
* Progress-card cancel was driven once (gen1, 1.5 s in); cancellation inside the reader is not a thing (it is synchronous and has no checkpoint), and the checkpoints around it are unchanged.
* The service-worker lifecycle suite (`npm run test:sw`) was not run (it needs CDN downloads the sandbox proxy refuses); precache listing and fingerprints are covered by `swPrecacheSync`,
  `pdfKeyReaderLoading` and `node build-sw.js --check`. Offline behaviour on a real service worker is **untested**.
* The full e2e suite, iPad WebKit and mobile-audit projects were not run, and Playwright's pinned Chromium build is not installed (Chromium 141 through a scratch config; the repo config was not edited).
* Not exercised: Stash/library, Stats, export/backup/sync and the experimental tools were inspected for references to the moved function (none: `parseKeyEntries` is called only by `parseLegend`
  and by tests) but not driven.
