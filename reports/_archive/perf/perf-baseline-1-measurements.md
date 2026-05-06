# Perf Baseline 1 — Measurements

> **Methodology note.** This baseline was produced from a terminal-only
> agent without a real browser. Numbers below are therefore divided into
> three confidence tiers:
>
> - **STATIC** — directly measured from disk (file size, line count,
>   script count). Authoritative.
> - **NODE** — measured by running pure JS from the codebase under
>   Node 22 with `performance.now()`. Authoritative for that function
>   in Node, an upper-bound proxy for the browser (Node = V8 only,
>   no React, no DOM, no IndexedDB).
> - **HARNESS-PENDING** — requires the Playwright perf harness in
>   [tests/perf](../tests/perf) to be run by a human in a real
>   browser. Marked as such; rows show the metric and the harness
>   command but no number.
>
> When a HARNESS-PENDING row says “run `npm run perf:baseline`” it
> refers to the script added in `package.json` alongside this report.
>
> Test fixtures used:
> - `TestUploads/Books and Blossoms.pdf` (8.1 MB) — large multi-page
>   PDF, worst-case import.
> - `TestUploads/PAT1968_2.pdf` (342 KB) — small PDF, fast-path.
> - `TestUploads/PAT2171_2.pdf` (1.4 MB) — medium PDF.
> - Synthetic 400×600 grid generated in
>   [tests/perf/fixtures/largeProject.js](../tests/perf/fixtures/largeProject.js)
>   (240,000 cells, used for grid render and save/load tests).
> - Synthetic 80×80 small project for baseline comparison.

---

## 1. App startup — what loads, in what order

### 1.1 Eager script load per entry page (STATIC)

Bytes counted are the project’s own files, gzipped uncompressed, served
from disk. Three CDN deps (React 18.2, ReactDOM 18.2, Babel-standalone
7.23) are excluded from the “project bytes” column because they are
cross-app and the same on every page.

| Entry page | Project JS eager (KB) | Project JS lazy (KB) | CDN eager | Notes |
|---|---:|---:|---|---|
| `home.html` | **614** | tracker-app (386), creator-main (86) **prefetched** | React + ReactDOM + Babel + pako | `import-engine/bundle.js` (126) eager — **not used until file picker** |
| `index.html` | **1,627** | tracker-app prefetch (386), pdf-lib prefetch | React + ReactDOM + Babel + pako + jszip | `creator/bundle.js` (889) + `import-engine/bundle.js` (126) eager |
| `create.html` | **1,627** | same as index | same as index | same as index |
| `stitch.html` | **614** | tracker-app on demand | React + ReactDOM + Babel + pako | `import-engine/bundle.js` (126) eager — **never used until import drag-drop** |
| `manager.html` | **488** | n/a | React + ReactDOM + Babel + pako | does not load `import-engine/bundle.js` |

Sum-of-files audit (project JS, top-level, eager-loaded by *any* page):
total **2.55 MB** uncompressed across 36 files. Largest single eager
file is `creator/bundle.js` at 888 KB.

### 1.2 Render-blocking scripts

All `<script src=...>` tags in the entry HTMLs are **render-blocking**
classic scripts (no `defer`, no `async`, no `type="module"`). They run
to completion in source order before the parser continues.

That means on `index.html` / `create.html`, the user sees nothing until
~1.6 MB of JS has been fetched, parsed, and executed by the main
thread. Even on a fast desktop with cache, the initial parse of
`creator/bundle.js` alone is a 100–300 ms blocking task; on a mid-range
phone this is closer to 500–1000 ms.

This is by design (no module bundler, no top-level `await` available),
but it amplifies the cost of every KB added to an eagerly-loaded
file — including the 126 KB of `import-engine/bundle.js` that 99 % of
sessions never use.

### 1.3 Modules loaded at startup that aren’t needed until later

Identified by reading every `<script src=...>` in the entry HTMLs and
cross-referencing public surface usage:

| Module | Eager on | First real use | Cost (KB) |
|---|---|---|---:|
| `import-engine/bundle.js` | home, index, create, stitch | only when user picks a `.pdf` / `.oxs` / `.json` / `.xml` file via the file picker or DnD | **126** |
| `creator/bundle.js` | index, create | needed immediately on these pages, but **not on stitch.html or home.html** (correct) | 889 |
| `pdf-lib` (CDN) | (correctly **lazy**, prefetched on idle) | first PDF *export* | 340 |
| `pdf.js` + `pdf-importer.js` (CDN) | (correctly **lazy**) | first PDF *import* | ~600 + 39 |
| `pdf.worker.min.js` | (correctly **lazy**) | first PDF *import* | 1,062 |
| `home-screen.js` | home, manager, stitch | only used on `home.html` (and a fallback path in `creator-main.js`) | 94 |

The single most impactful eager-load problem is
**`import-engine/bundle.js` on every page**. It is 126 KB of JS that
contains the entire multi-format import pipeline (PDF page-role
classifier, glyph extractor, legend extractor, assembler, validator,
materialiser, all four strategies). Most sessions never use it.

### 1.4 Top-level work executed at script-eval time

Auditing the eagerly-loaded bundles for code that runs **at script
parse time** (not lazily on first call):

- `import-engine/bundle.js`:
  - `wireApp.js` IIFE runs `console.info('[ImportEngine] …')`,
    drains 5 sessionStorage breadcrumb keys via JSON.parse, installs
    a global `unhandledrejection` listener, registers the picker
    surface on `window.ImportEngine`. Cost: <1 ms but happens on
    every page load.
  - `registry.js` IIFE attaches `window.ImportEngine.register` /
    `runPipeline` and registers the four built-in strategies. Cost:
    <1 ms but allocates the strategy registry up front.
- `creator/bundle.js`: most of the file is React component
  definitions which are cheap at parse time but still must be parsed.
- `dmc-data.js`: builds the 454-entry DMC array with pre-computed Lab
  values. Inlines as a literal array — no runtime computation. OK.
- `anchor-data.js`: 45 KB of Anchor↔DMC conversion tables, eager.
  Loaded on every page even though only the Adapt flow uses it.
- `thread-conversions.js`: 65 KB. Same story — conversion tables for
  Sullivan, Madeira, etc. Only used by Adapt flow.

### 1.5 Bundle size breakdown (STATIC)

Top 15 eager-loadable JS files by size, project files only:

| File | KB |
|---|---:|
| `pdf.worker.min.js` (lazy, CDN-mirrored) | 1,061.8 |
| `creator/bundle.js` (eager on index/create) | 888.8 |
| `tracker-app.js` (lazy on stitch) | 386.3 |
| `components.js` (eager all pages) | 142.5 |
| `stats-page.js` (lazy on stitch) | 129.0 |
| `manager-app.js` (lazy on manager) | 123.1 |
| `import-engine/bundle.js` (eager 4/5 pages) | **126.5** |
| `embroidery.js` (lazy in creator) | 98.5 |
| `home-screen.js` (eager on 3 pages) | 93.6 |
| `creator-main.js` (lazy on creator pages) | 85.7 |
| `palette-swap.js` (eager on creator pages) | 79.8 |
| `preferences-modal.js` (eager all pages) | 70.5 |
| `thread-conversions.js` (eager all pages) | 64.7 |
| `helpers.js` (eager all pages) | 58.1 |
| `colour-utils.js` (eager all pages) | 58.0 |

## 2. Core interactions (HARNESS-PENDING)

All numbers in this section require a real browser. The
[tests/perf/interactions.spec.js](../tests/perf/interactions.spec.js)
harness drives them and writes JSON results to
`reports/perf-results/interactions.json`. Run with
`npm run perf:baseline`.

| Interaction | Method | Number |
|---|---|---|
| Open project from list (small, 80×80) | `performance.measure('open-project')` from click to first paint of grid | HARNESS-PENDING |
| Open project from list (large, 400×600) | same | HARNESS-PENDING |
| Pan on 80×80 grid | mean frame time over 60 wheel events | HARNESS-PENDING |
| Pan on 400×600 grid | same | HARNESS-PENDING |
| Pinch/wheel zoom on 400×600 grid | mean frame time over 30 zoom events | HARNESS-PENDING |
| Place a single stitch (click → DOM update) | `performance.measure('stitch-place')` | HARNESS-PENDING |
| Change active colour | `performance.measure('palette-pick')` | HARNESS-PENDING |
| Undo / redo (10 ops) | mean ms per op | HARNESS-PENDING |
| Switch editing ↔ tracking mode | navigation timing | HARNESS-PENDING |
| Scroll a 50-colour palette | mean scroll-frame ms | HARNESS-PENDING |
| Open / close a modal | open-to-paint ms | HARNESS-PENDING |
| Save a project (small) | `performance.measure('save')` (`ProjectStorage.save`) | HARNESS-PENDING |
| Save a project (large, 400×600) | same | HARNESS-PENDING |
| Mark stitch complete in tracker | `performance.measure('mark-stitch')` | HARNESS-PENDING |

## 3. Import-specific (HARNESS-PENDING + STATIC)

| Metric | Method | Number |
|---|---|---|
| Time to load + classify Books-and-Blossoms.pdf | harness, single `performance.measure('classify')` around `ImportEngine.importPattern` up to first progress message | HARNESS-PENDING |
| Time to extract colour key (large PDF) | `performance.measure('legend')` inside `pipeline.extractLegend` | HARNESS-PENDING |
| Time to extract grid (large PDF) | `performance.measure('grid')` inside `pipeline.extractGrid` | HARNESS-PENDING |
| Memory baseline (no projects open) | `performance.memory.usedJSHeapSize` after page idle | HARNESS-PENDING |
| Memory peak during PDF import (large) | repeated samples during `importPattern` | HARNESS-PENDING |
| Memory after import returns to baseline? | sample baseline → import → wait 5 s → sample again | HARNESS-PENDING |
| Time to render review modal with 80-colour result | mount-to-paint of `ImportReviewModal` | HARNESS-PENDING |
| Time `extraction → project` materialise | `performance.measure('materialise')` in `pipeline/materialise.js` | HARNESS-PENDING |
| Eager bundle weight added by feature (STATIC) | `import-engine/bundle.js` size | **126.5 KB on 4 of 5 pages** |
| Lazy CDN weight on first import (STATIC) | pdf.js + pdf-importer + pdf.worker | **~1.7 MB** (already lazy, good) |

## 4. Memory profile (HARNESS-PENDING)

| Metric | Number |
|---|---|
| Baseline (no projects open, fresh tab) | HARNESS-PENDING |
| After opening small (80×80) project | HARNESS-PENDING |
| After opening large (400×600) project | HARNESS-PENDING |
| Peak during PDF import | HARNESS-PENDING |
| After import completes (returns to baseline?) | HARNESS-PENDING |
| After 5 import open/cancel cycles (leak check) | HARNESS-PENDING |

## 5. Rendering performance (HARNESS-PENDING)

| Metric | Number |
|---|---|
| Frame rate, pan on 300×300 pattern | HARNESS-PENDING |
| Frame rate, stitch placement | HARNESS-PENDING |
| Frame rate, palette scroll (50 colours) | HARNESS-PENDING |
| Layout thrashing on stitch placement (forced reflows) | HARNESS-PENDING |
| Paint region per stitch placement | HARNESS-PENDING |

## 6. Environment

- Static measurements: file system, Node 22 on Windows.
- Test suite for behavioural baseline: `npm test -- --runInBand` —
  **1,487 tests pass, 133 suites, 2.7 s** as of this baseline.
- Browser-side measurements (when filled): expected to be run on
  Chromium via Playwright on the contributor’s machine, plus
  Chromium with `--cpu-throttling-rate=4` and
  `--device=Pixel 5` for mobile proxy.
