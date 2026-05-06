# Import 4 — Parsing Techniques

> Phase 1, Step 4. Survey of the technical approaches available for
> extracting structured pattern data from PDFs and raster images **in
> the browser** (this app is a fully client-side PWA — no server-side
> processing is permitted). Focused on what is realistic for a v1 ship,
> with explicit performance and bundle-size budgets.

---

## TL;DR

- The app is **client-side only**. Every approach below must run in a browser tab (or a Web Worker) on a mid-range device. Server-side OCR is not an option.
- **Three parsing strategies cover the entire PDF problem space**: (1) **operator-stream walking** (vector cells), (2) **glyph-position extraction** (symbol charts), (3) **rasterise-then-image-process** (scanned / opaque charts). The pipeline picks one per document, not per system.
- **pdf.js is the right primary tool.** It is already a dependency. It exposes everything we need: `getTextContent()` for glyphs, `getOperatorList()` for vector ops, the document XObject store for embedded images. mupdf.js is faster but introduces an AGPL-flavoured licence question and a 3 MB WASM bundle — defer.
- **Don't reach for OCR until you have to.** OCR (Tesseract.js) is slow, large, and unreliable on cross-stitch glyphs. Use it only as a last-resort fallback for raster-only PDFs.
- **The colour → DMC pipeline already exists** in [colour-utils.js](../colour-utils.js) (`findBest`, `findSolid`, ΔE2000). Reuse it; do not write a second one.
- **Workerise everything that touches > 1 000 cells.** Vector-cell DMC charts have 1 000–8 000 fill ops per page; running the operator walk on the main thread blocks the UI for 200 ms+. Move it into a worker following the existing `analysis-worker.js` / `pdf-export-worker.js` patterns.

---

## 1. PDF parsing in the browser

### 1.1 pdf.js — the workhorse

Already a dependency: see [pdf.worker.min.js](../pdf.worker.min.js) and the legacy build referenced from [scripts/analyse-dmc-pdfs.js](../scripts/analyse-dmc-pdfs.js).

Capabilities relevant to import:

| API | What it gives us | Used for |
|---|---|---|
| `pdfjs.getDocument({ data })` → `PDFDocumentProxy` | Document metadata: `info`, XMP `metadata`, `numPages`, fingerprints | Publisher detection (Producer / Creator strings), language, page count |
| `doc.getPage(n)` → `PDFPageProxy` | Per-page accessor | Iterating pages |
| `page.getViewport({ scale })` | Page dimensions in user-space points | Coordinate transforms |
| `page.getTextContent({ includeMarkedContent: false })` → `{ items: TextItem[] }` | Every text fragment with `{ str, fontName, transform: [a,b,c,d,e,f], width, height, hasEOL }` | Glyph-chart cell extraction; legend text; page-marker detection |
| `page.getOperatorList()` → `{ fnArray, argsArray }` | The raw PDF content-stream operators after pdf.js's own parser/decoder | Vector-cell extraction; image references; backstitch geometry |
| `page.commonObjs.get(id)` / `page.objs.get(id)` | Resolved XObject / Image / Font dictionaries | Embedded raster extraction; font glyph-name lookup |
| `page.cleanup()` / `doc.cleanup()` / `doc.destroy()` | Free per-page resources | Memory hygiene on multi-page chart imports |

#### Walking the operator stream

`OPS` is pdf.js's enum of operator codes. The ops we care about for vector-cell extraction:

```js
const OPS = pdfjs.OPS;
// Fill colour
OPS.setFillRGBColor       // args = [r,g,b] in 0..1
OPS.setFillColor / setFillColorN  // colour-space-aware variants
// Path construction (combined into a single op in pdf.js)
OPS.constructPath         // args = [[op, op, ...], [...coords...], minMax]
//   inner ops include OPS.rectangle, OPS.lineTo, OPS.moveTo, OPS.curveTo*
// Path painting
OPS.fill | OPS.eoFill | OPS.fillStroke
OPS.stroke | OPS.closeStroke
// Graphics state
OPS.save | OPS.restore | OPS.transform   // CTM stack management
// Images
OPS.paintImageXObject | OPS.paintImageMaskXObject | OPS.paintInlineImageXObject
```

The walk maintains:

- a **CTM stack** (multiplied on every `transform`, pushed/popped on `save`/`restore`),
- a **current fill colour** (last `setFillRGBColor` / setFillColor),
- a **pending path** (accumulated rectangles from the most recent `constructPath`).

When a `fill` op fires, emit one cell record per accumulated rectangle, transformed by the current CTM. After the page completes, cluster the cells into a regular grid (see §1.4).

#### Detecting chart pages cheaply

Per-page heuristics that avoid full operator walks:

| Signal | Cheap to compute | Threshold for "this is a chart page" |
|---|---|---|
| `getOperatorList().fnArray.length` | Yes (just `.length`) | > 1 000 |
| Count of `setFillRGBColor` ops | Yes (one pass) | > 50 distinct values |
| Count of `singleChars` from `getTextContent()` | Yes | > 1 000 → glyph chart |
| `paintImageXObject` count | Yes | exactly 1 large image + few text items → raster chart |
| Aspect ratio | Trivial | usually portrait A4 / Letter |

Ship the cheap pass first to classify every page in a multi-page document; then run the expensive parser only on the page(s) classified as chart.

### 1.2 mupdf.js — faster, but heavier and licence-encumbered

Artifex's MuPDF compiled to WASM. ~3 MB bundle, AGPL/commercial dual-licence. Returns structured text and path data with less manual state-tracking than pdf.js. **Faster** by ~5×–10× on large operator streams.

Verdict: **not v1**. The licensing risk and bundle bloat are unacceptable for a PWA where a hot import has to fit in a few hundred KB of new shipped code. Revisit only if pdf.js performance proves intolerable on real corpora.

### 1.3 pdf-lib — wrong tool

pdf-lib is for *creating and editing* PDFs. It does not expose operator lists or a structured-text API. Out of scope.

### 1.4 Multi-page chart assembly

Most large patterns split the chart across `N of M` pages. The assembly algorithm:

1. **Detect page-marker text** using a regex that accepts the publisher patterns we know:
   - `/^\s*(\d+)\s*\/\s*(\d+)\s*$/` (DMC: `"3/4"`)
   - `/page\s+(\d+)\s+of\s+(\d+)/i` (HAED, generic English)
   - `/(\d+)\s*sur\s*(\d+)/i` (French)
2. **Group chart pages** by stitching ID (any text run that appears identically on every page — usually the title + page-marker prefix).
3. **Detect overlap columns/rows.** Most publishers repeat 1–3 rows/columns at page boundaries with reference numbering. Look for the leftmost column whose stitches duplicate those of the previous page's rightmost column. Confirm with cell-colour identity, not just position.
4. **Snap to a single grid.** Reproject all pages into one output grid using the page-1 origin and cell size as the canonical reference.
5. **Resolve conflicts.** When the same logical cell appears on two pages with different colours (rare but possible due to PDF rendering rounding), take the leftmost / topmost page's value.

The DMC layout-A case (one page = colour fills, next page = backstitch overlay) is a special instance of this: same grid, two layers. Detect by op-signature (high `setFillRGBColor` cardinality vs near-zero on the second page) rather than by page-marker.

### 1.5 Embedded raster extraction

When `paintImageXObject` shows up:

1. Capture the `imageName` argument.
2. Resolve via `page.objs.get(imageName)` (or `commonObjs` for shared images).
3. The returned object is a pdf.js `PDFImage` with `data: Uint8Array`, `width`, `height`, and a colour-space identifier.
4. Render to a 2D canvas using `ctx.putImageData()` after expanding indexed / CMYK colour spaces.
5. Hand off to the raster pipeline (§3).

---

## 2. Glyph-symbol recognition (for symbol-chart PDFs)

This is the existing [pdf-importer.js](../pdf-importer.js) territory. Reusable patterns for the new architecture:

### 2.1 Per-document glyph → DMC mapping

The chart cells use single characters whose meaning is **per-document**, not universal. Same `'W'` glyph can be DMC 310 in one PDF and DMC 3865 in another.

Pipeline:

1. **Find the legend page.** Heuristic: a page with both (a) ~50–200 single-char text items in a vertical column on the left edge AND (b) ~50–200 multi-char text items (`"DMC 310"`, `"Black"`) in adjacent columns is the legend.
2. **Pair up legend rows by `y`-coordinate.** Sort all text items by descending `y` (PDF coordinates), then group items whose `y` differs by less than `cellHeight / 2`.
3. **For each row, extract**:
   - the glyph (the leftmost single char),
   - the font name (from `fontName`),
   - the DMC code (the first `\d+` in the text after the glyph, accepting `B5200`, `E334`, `D225`, etc.),
   - optionally the colour name.
4. **Build the lookup**: `{ [`${fontName}|${glyph}`]: dmcId }`.
5. **Walk the chart page**, emitting cells using the lookup. Unknown glyphs become `__empty__` and are reported as confidence misses.

### 2.2 Font subset gotchas

PDF fonts may be subsetted (`AAAAA+SymbolFont`) and have non-standard encodings. Trust `fontName + str`, not `str` alone. If two pages use the same logical font but pdf.js reports different `fontName` strings (because the font was re-embedded), normalise via the font's `BaseFont` name when available (`page.commonObjs.get(fontKey)`).

### 2.3 Rotated / decorative text

DMC layout B page 1 shows rotated single-character text artefacts (vertical typesetting). Filter glyphs by:

```js
const t = textItem.transform;        // [a, b, c, d, e, f]
const skewed   = Math.abs(t[1]) > 0.001 || Math.abs(t[2]) > 0.001;
const sized    = Math.abs(t[3]) > 1;  // upright, real font size
if (skewed || !sized) continue;       // not a chart cell
```

---

## 3. Image / OCR processing (for raster charts)

When the PDF turns out to be a single embedded raster image, or when the user uploads a JPG/PNG of a chart directly, fall back to image processing.

### 3.1 Grid detection

Two approaches, in order of preference:

**Autocorrelation (fast, robust)**:
1. Project the image: `rowSum[y] = Σ_x luminance(x, y)`.
2. Compute autocorrelation of `rowSum` for shift `k = 1..maxCellSize`.
3. The first strong peak's lag = vertical cell pitch.
4. Repeat for columns. Done in O(N log N) via FFT or O(N · maxLag) directly.

**Hough line transform (slower, handles skew)**:
1. Canny edge detection (already present in [embroidery.js](../embroidery.js)).
2. Hough vote space.
3. Cluster line angles into two perpendicular families → grid axes.
4. Useful when the source is photographed (perspective / skew) rather than scanned flat.

For v1, ship autocorrelation only. Add Hough later if real-world inputs need it.

### 3.2 Per-cell colour sampling

Once a grid is detected:

1. For each cell, sample the centre `cellWidth/2 × cellHeight/2` region.
2. Take the **median** RGB (not mean — robust against the symbol glyph drawn over the colour).
3. If the cell has near-zero saturation across all pixels, treat as `__empty__`.

### 3.3 Colour → DMC mapping

Reuse [colour-utils.js](../colour-utils.js):

- `findSolid(rgb)` returns the nearest single DMC by ΔE2000 against the LAB-cached palette.
- `findBest(rgb, palette)` accepts a constrained palette — **use this** when the legend extractor has already given us the set of expected DMCs. Constraining the search dramatically reduces false positives (especially for the desaturated browns / greys that are a known DMC look-alike cluster).

### 3.4 Realistic accuracy expectations

| Source quality | Expected colour-match accuracy | Confidence-flagged cells |
|---|---|---|
| Vector PDF (DMC, exact RGB available) | > 99 % | < 1 % (only blends) |
| Glyph PDF with clean legend | > 95 % | < 5 % (font-mapping failures) |
| 300 dpi raster scan, well-lit | 80–90 % | 10–20 % (need user review) |
| Phone photo of paper chart | 50–70 % | 30–50 % |

Build the UI assuming the bottom two rows: every imported pattern goes through a "review and fix" step where flagged cells are highlighted and the user can click to correct.

### 3.5 Why not Tesseract.js for chart symbols?

- Tesseract is trained for *prose*. Cross-stitch glyphs (`▲`, `◆`, `Ω`, `¶`, custom font cells) are not in any of its training corpora.
- It is huge (≈1 MB of JS + 4 MB of model weights per language).
- It is slow (5–30 s per image on a chart page).
- It is unreliable on isolated single characters.

Use Tesseract **only** for the legend's text portion when nothing else is available, and only after the user explicitly opts into a "deep parse" mode.

---

## 4. Hybrid extraction pipeline

```
              ┌────────────────────────────────────────┐
              │  1. Sniff: file extension + magic bytes │
              └────────────────────────────────────────┘
                            │
        ┌───────────────────┼─────────────────────┐
        ▼                   ▼                     ▼
   .oxs / .xml         .json / .ofg          .pdf / image
        │                   │                     │
        ▼                   ▼                     ▼
   parseOXS          parseProject          PDF dispatcher
        │                   │                     │
        └───────┬───────────┘                     ▼
                │                  ┌──────────────────────────┐
                │                  │ 2. Per-page classify pass │
                │                  │   - vector?               │
                │                  │   - glyph?                │
                │                  │   - raster?               │
                │                  │   - cover/blank?          │
                │                  └──────────────────────────┘
                │                                 │
                │           ┌─────────────────────┼──────────────┐
                │           ▼                     ▼              ▼
                │  vectorCellExtractor   glyphExtractor   rasterPipeline
                │           │                     │              │
                │           └────────┬────────────┴──────┬───────┘
                │                    │                   │
                │                    ▼                   ▼
                │          legendExtractor (always runs in parallel)
                │                    │
                ▼                    ▼
        ┌────────────────────────────────────────┐
        │  3. Multi-page assembly + layer merge  │
        └────────────────────────────────────────┘
                            │
                            ▼
        ┌────────────────────────────────────────┐
        │  4. Normalise to internal pattern model│
        │     (the v8 project schema)            │
        └────────────────────────────────────────┘
                            │
                            ▼
        ┌────────────────────────────────────────┐
        │  5. Validate + cross-check vs legend   │
        │     (per-thread cell counts, palette   │
        │      coverage, geometry sanity)        │
        └────────────────────────────────────────┘
                            │
                            ▼
        ┌────────────────────────────────────────┐
        │  6. UI review surface — confidence    │
        │     scores, flagged cells, manual fix  │
        └────────────────────────────────────────┘
```

### Progressive enhancement

- **Phase A (always)**: structural fast paths (operator walk / glyph collect / image extract). 100–500 ms per page. Cancellable.
- **Phase B (on demand)**: cross-validation with legend, multi-page assembly. 500 ms–2 s.
- **Phase C (only if Phase A failed and user opts in)**: OCR / template matching. 5–30 s. Always shown behind a "Deep parse" button, never auto-run.

### Use the legend to constrain everything downstream

The legend is the single most valuable artefact in any pattern PDF. Once extracted, it constrains:

- the **expected DMC palette** (filter out colour-match candidates outside this set),
- the **expected stitch-type set** (do we expect backstitches at all?),
- the **expected total stitch count** (sum of per-thread counts in Layout-B-style legends — direct cross-check),
- the **expected art lines** (don't look up `5310` in the mouliné table when the legend says it's perlé metallisé).

---

## 5. Library survey (browser)

| Library | npm name | Min+gz | Already used? | Verdict |
|---|---|---|---|---|
| **pdf.js** | `pdfjs-dist` | ~600 KB worker + ~150 KB main | Yes, via [pdf.worker.min.js](../pdf.worker.min.js) | **Use.** Primary parser. |
| **pdf-lib** | `pdf-lib` | ~180 KB | No | Skip — wrong tool. |
| **mupdf.js** | `mupdf` | ~3 MB | No | Defer (licence + bundle). |
| **Tesseract.js** | `tesseract.js` | ~1 MB JS + 4 MB models | No | Defer to v2; opt-in only. |
| **OpenCV.js** | `opencv-ts` | ~7 MB | No | Skip — too heavy. |
| **Comlink** | `comlink` | ~3 KB | No | Optional — nice-to-have for worker RPC. |
| **`colour-utils.js`** (in-repo) | – | already loaded | Yes | **Use** for all colour matching. |
| **`embroidery.js`** Canny / saliency (in-repo) | – | already loaded | Yes | Reuse for raster grid detection prep. |

---

## 6. Performance and size budget

### Per-document budget

| Pattern type | Pages | Cells | Target wall-clock | Notes |
|---|---|---|---|---|
| DMC small (Layout B, ~100×100) | 3 | ~3 000 | < 1 s end-to-end | Pure operator walk; no images. |
| DMC large (Layout A, ~150×150) | 4 | ~10 000 | < 2 s | Two grid layers + legend. |
| HAED-style glyph chart | 50–200 | 50 000+ | < 10 s | Cancellable, with progress; per-page worker pool. |
| Raster scan (single page, 300 dpi) | 1 | ≤ 5 000 inferred | < 5 s + user review | Autocorrelation grid + per-cell sample. |
| Raster scan with OCR fallback | 1 | ≤ 5 000 inferred | up to 30 s | Opt-in. |

Budgets assume a mid-2022 mid-range laptop / current-gen tablet. Target devices for this app are stitchers' iPads and Windows laptops, not high-end workstations.

### Memory ceiling

- A single A4 page operator list is typically 50 KB–500 KB serialised. Hold one page at a time, not the whole document.
- Cell arrays: 10 000 × ~40 bytes/cell ≈ 400 KB in memory before normalisation. Trivial.
- Raster page rasters at 1.5× scale: 595 × 842 × 1.5² × 4 bytes ≈ 4.5 MB per page. Release after extraction.
- Hard cap: **refuse imports > 500 pages** with a clear error rather than OOM the tab.

### Worker strategy

Follow the patterns already established by [analysis-worker.js](../analysis-worker.js), [generate-worker.js](../generate-worker.js), and [pdf-export-worker.js](../pdf-export-worker.js):

- One **dedicated `import-worker.js`** owns the entire parse pipeline. The main thread sends `{ kind, fileBytes, options }` and receives `{ kind: 'progress' | 'partial' | 'done' | 'error', ... }` messages.
- pdf.js itself spawns its own worker (`pdf.worker.min.js`); the import worker is a *second* worker that drives pdf.js's high-level API. This keeps both the UI thread and the import-orchestration thread responsive.
- Progress reporting is per-page (`{ page: 3, total: 4, kind: 'classify' | 'extract-grid' | 'extract-legend' }`) so the UI can stream a meaningful spinner.

### Cancellability

A user closing the import modal must terminate work within 100 ms. Implement by:

- Keeping the worker alive but maintaining a `cancelToken` that every per-page step checks before continuing.
- On cancel, call `worker.terminate()` and recreate next time. pdf.js handles `doc.destroy()` cleanly inside a terminated worker.

---

## 7. References

- pdf.js API: <https://mozilla.github.io/pdf.js/api/>
- pdf.js wiki — operator interfaces: <https://github.com/mozilla/pdf.js/wiki>
- mupdf.js docs: <https://mupdfjs.readthedocs.io/>
- pdf-lib: <https://pdf-lib.js.org/>
- Tesseract.js: <https://github.com/naptha/tesseract.js>
- OpenCV.js tutorials: <https://docs.opencv.org/4.x/d0/d84/tutorial_js_root.html>
- Comlink: <https://github.com/GoogleChromeLabs/comlink>
- Hough transform reference: <https://en.wikipedia.org/wiki/Hough_transform>
- CIE ΔE2000 reference: <https://en.wikipedia.org/wiki/Color_difference#CIEDE2000>
- Web Workers + structured cloning: <https://developer.mozilla.org/en-US/docs/Web/API/Web_Workers_API>
- This repo's existing colour pipeline: [colour-utils.js](../colour-utils.js)
- This repo's existing raster pipeline: [embroidery.js](../embroidery.js)
- This repo's existing PDF importer (target for refactor): [pdf-importer.js](../pdf-importer.js)
