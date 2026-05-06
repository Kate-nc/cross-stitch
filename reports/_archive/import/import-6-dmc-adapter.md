# Import 6 — DMC PDF Adapter Design

> Phase 2, Step 2. Concrete extraction strategy for DMC pattern PDFs.
> Builds on [import-2-dmc-file-analysis.md](import-2-dmc-file-analysis.md)
> (raw structural findings) and [import-reference-dmc-format.md](import-reference-dmc-format.md)
> (format spec). Slots into the pluggable strategy contract defined in
> [import-5-architecture.md §3](import-5-architecture.md#3-the-strategy-interface).

---

## TL;DR

- DMC ships **two layout variants**: Layout A (4-page split chart with separate colour-fill + backstitch raster pages and a separate legend page) and Layout B (3-page combined chart+legend with title page). The classifier disambiguates by counting `setFillRGBColor` cardinality and `lineTo` symmetry between adjacent chart pages.
- Charts are **vector-fill rectangles**, not glyphs. Cell extraction is "walk the operator stream, accumulate fill colour + path bounds, snap to grid."
- The legend is parsed **first** (per §10's "key before grid" rule). The legend's RGB swatches become the **palette dictionary**; chart cells are then matched against this dictionary, not the full DMC palette. This collapses cell classification from "nearest of 500" to "nearest of ~20."
- Multi-page assembly relies on the **N/M page marker** (e.g. `1/4`, `Page 2 of 4`) extracted from the page footer. When markers are absent, fall back to **edge-overlap correlation** of the right edge of page N against the left edge of page N+1.
- Every output cell carries an explicit `confidence ∈ [0, 1]` and a `source` tag (`legend-exact`, `legend-nearest`, `dmc-fallback`, `unknown`).

---

## 1. Adapter shape

```js
// strategies/pdfDmcStrategy.js
window.PdfDmcStrategy = {
  id: 'pdf-dmc',
  formats: ['pdf'],

  async canHandle(probe) {
    if (probe.pdfMeta?.publisher === 'DMC') return 0.95;
    // soft match — Adobe InDesign producer + dmc footer fragment
    if (probe.pdfMeta?.creator?.includes('Adobe InDesign') &&
        probe.pdfMeta?.firstPageText?.includes('dmc library')) return 0.7;
    return 0;
  },

  async parse(probe, opts, ctx) {
    const doc = await loadPdf(probe);
    const pages = await classifyPagesDmc(doc, ctx);
    const legend = await extractLegend(doc, pages.legend, ctx);     // run FIRST
    const grid = await extractGrid(doc, pages.chart, legend, ctx);  // constrained by legend
    const meta = await extractMeta(doc, pages, ctx);
    return { grid, legend, meta, flags: collectFlags(grid, legend) };
  },
};

window.ImportRegistry.register(window.PdfDmcStrategy);
```

The strategy returns a `RawExtraction` and is **forbidden** from constructing a v8 project (per [import-5 §3](import-5-architecture.md#3-the-strategy-interface)). Stage 6 owns materialisation.

---

## 2. Page classification

DMC pages are classified into one of:

| Role | Heuristic | Confidence floor |
|---|---|---|
| `cover` | First page, contains `paintImageXObject` covering ≥ 60 % of page, no chart cells | 0.9 if image fills page |
| `chart-vector-colour` | ≥ 200 distinct `setFillRGBColor` calls, ≥ 1000 small filled rectangles in a regular grid pattern, no text glyphs in chart bbox | 0.9 |
| `chart-vector-bs` | Same number of `lineTo` ops as the partner colour page, mostly black `setStrokeColor`, very few `setFillRGBColor` | 0.85 |
| `chart-combined` | Layout B: chart cells + a vertical band of text on the right side matching the legend table pattern | 0.8 |
| `legend` | Dense `Tj`/`TJ` text with `\b\d{2,5}\b` codes appearing in regular vertical stride; presence of "stitches" / "skeins" tokens | 0.85 |
| `instructions` | Mostly text, no large image, very few non-text vector ops, contains tokens like "wash" / "frame" / "starting" | 0.7 |
| `materials` | Contains a fabric SKU pattern (`/\b1[1-9]ct\b/`, `Aida`, `Étamine`) and small swatch-like image | 0.75 |
| `blank` | < 50 ops total | 1.0 |

### Algorithm

```js
function classifyPagesDmc(doc, ctx) {
  const result = { cover: [], chart: [], legend: [], instructions: [], materials: [], blank: [] };
  for (let i = 1; i <= doc.numPages; i++) {
    const page = await doc.getPage(i);
    const stats = await cheapPageStats(page);   // counts only — no full op-list materialisation
    const role  = scoreAndPick(stats);          // returns { role, confidence }
    if (role.confidence < 0.5) flagForReview(i, role);
    result[bucketOf(role.role)].push({ pageNum: i, role: role.role, stats, confidence: role.confidence });
    page.cleanup();
    ctx.reportProgress({ stage: 'classify', page: i, total: doc.numPages });
  }
  return inferLayoutVariant(result);   // tags result with 'layout-A' or 'layout-B'
}
```

`cheapPageStats` does NOT call `getOperatorList()` — that's expensive and we'll do it once during extraction. Instead it samples:

- `getTextContent({ disableCombineTextItems: true })` → token count, code-token count, language detection
- `page.commonObjs.has('img_*')` → presence of paintable images (without loading them)
- A single op-list pass with op-type tally only (no path data retained)

### Layout-variant inference

```js
function inferLayoutVariant(result) {
  // Layout A: pairs of chart pages with identical lineTo counts
  if (result.chart.length >= 2) {
    const [a, b] = result.chart;
    if (a.stats.lineToCount === b.stats.lineToCount &&
        Math.abs(a.stats.fillCount - b.stats.fillCount) > a.stats.fillCount * 0.4) {
      result.layoutVariant = 'A';   // colour + backstitch separated
      return result;
    }
  }
  // Layout B: chart-combined role detected
  if (result.chart.some(p => p.role === 'chart-combined')) {
    result.layoutVariant = 'B';
    return result;
  }
  result.layoutVariant = 'unknown';
  result.flags = (result.flags || []).concat('LAYOUT_INDETERMINATE');
  return result;
}
```

### Fallback

If no chart page is identified with confidence ≥ 0.5, the strategy returns `RawExtraction` with `grid: []` and `flags.warnings: ['NO_CHART_PAGES']`. The pipeline propagates this; the UI shows the page-classification result and offers manual region selection (per §10 "graceful degradation" rule).

---

## 3. Colour key extraction (run FIRST)

The legend is parsed before the grid — per [§10 "Parse the colour key BEFORE the grid"](#10-rules-applied). The legend gives us:

- A **dictionary** of `{ rgbBucket → { dmcCode, artLine, stitchType } }`
- An expected **stitch-count total per code** (Layout A) or **skein total per code** (Layout B), used in validation

### Legend table model

A DMC legend row is a horizontal band on the page containing:

```
[swatch rect]  [dmc code]  [stitch type label EN/FR/ES]  [count]
```

with optional **art-line headers** (`mouliné spécial 117`, `perlé metallisé 315`) appearing as wide rows that span the table width and apply to all subsequent rows until the next header.

### Algorithm

```js
async function extractLegend(doc, legendPages, ctx) {
  const rows = [];
  let currentArtLine = null;

  for (const pageInfo of legendPages) {
    const page = await doc.getPage(pageInfo.pageNum);
    const ops = await page.getOperatorList();
    const text = await page.getTextContent({ includeMarkedContent: true });

    // 1. Collect filled rectangles that look like swatches (small, square, non-white, non-grid-aligned).
    const swatches = collectSwatches(ops);

    // 2. Collect text items, group by Y-band (within 2 pt).
    const textBands = groupByYBand(text.items, 2);

    // 3. Walk bands top-to-bottom. For each band:
    for (const band of textBands) {
      const isArtLine = matchArtLineHeader(band);   // see import-reference-dmc-format §5
      if (isArtLine) { currentArtLine = isArtLine; continue; }

      const swatch = nearestSwatch(swatches, band);  // by Y proximity
      const code   = parseDmcCode(band);             // /\b(B?D?\d{2,5}|E\d{2,4})\b/
      const totals = parseTotals(band);              // 'stitches' / 'skeins' tokens
      const stitchType = classifyStitchType(band);   // 'cross' | 'half' | 'backstitch' | ...

      if (!code) { ctx.log('legend', 'unparsed band', band); continue; }

      rows.push({
        glyph:        null,
        swatchRgb:    swatch?.rgb ?? null,
        code:         code,
        artLine:      currentArtLine,
        stitchType:   stitchType,
        strands:      inferStrands(currentArtLine, stitchType),  // mouliné=2 default, perlé=1
        totalStitches: totals.stitches ?? null,
        totalSkeins:   totals.skeins ?? null,
        confidence:   scoreLegendRow({ swatch, code, stitchType }),
      });
    }
    page.cleanup();
  }

  return cleanupAndDedupe(rows);
}
```

### Code regex

The regex per [import-2 §B](import-2-dmc-file-analysis.md):

```js
const DMC_CODE = /\b(B5200|D\d{3}|E\d{3,4}|\d{2,5})\b/;
```

This accepts:
- Plain three-digit codes (`310`, `550`)
- Two-digit codes (`09`)
- Four-digit perlé / metallic (`5200`, `5310`)
- Variegated `D225`
- Light effects `E334`, `E3852`
- The single special code `B5200` (snow white)

Rejects: arbitrary numbers (years, page numbers, fabric counts) by requiring the code appears in a band that also contains a stitch-type label OR has an adjacent swatch.

### Cross-validation (legend-internal)

After extraction:
- Every row must have either a `swatchRgb` or a `glyph`. Rows with neither are demoted to `confidence: 0.3` and flagged.
- Duplicate codes within one art-line are merged.
- Codes appearing in the legend totals section (often `Total: 3 skeins`) are filtered by checking they have an adjacent stitch-type label.

---

## 4. Grid extraction

With the legend in hand, grid extraction becomes "for each filled rectangle, decide which legend entry it matches."

### Step 1: Detect the chart bounding box

```js
function detectChartBbox(ops, page) {
  // Filled rectangles that are small (< 0.5% of page area) and clustered in a regular grid.
  const cells = collectGridCells(ops);
  if (cells.length < 100) return null;

  const xs = cells.map(c => c.x).sort((a, b) => a - b);
  const ys = cells.map(c => c.y).sort((a, b) => a - b);
  return { x0: xs[0], y0: ys[0], x1: xs[xs.length-1], y1: ys[ys.length-1], cells };
}
```

### Step 2: Infer cell pitch

The pitch is found by autocorrelation of cell X coordinates (per [import-4 §2.3](import-4-parsing-techniques.md)):

```js
function inferPitch(cells) {
  const xs = cells.map(c => c.x);
  const dx = sortedDiffs(xs).filter(d => d > 0.5);    // ignore intra-cell jitter
  const mode = histogramMode(dx, 0.1);                 // bucket size 0.1 pt
  return mode;
}
```

For DMC PDFs analysed in [import-2-raw/](import-2-raw/), pitch is consistently 8.5 pt at native scale. We do not assume this — we measure it.

### Step 3: Snap cells to integer grid

```js
function snapToGrid(cell, bbox, pitch) {
  return {
    gx: Math.round((cell.x - bbox.x0) / pitch),
    gy: Math.round((cell.y - bbox.y0) / pitch),
    rgb: cell.fillRgb,
  };
}
```

Cells whose snap residual exceeds 0.3 × pitch are flagged as `low_grid_alignment` and emit a warning. This catches misaligned chart pages or non-rectangular chart regions.

### Step 4: Match cell to legend

```js
function matchCellToLegend(cell, legendDict) {
  // legendDict is keyed by quantised RGB bucket (8-bit per channel).
  const key = quantiseRgb(cell.rgb, 8);
  const exact = legendDict.exact.get(key);
  if (exact) return { code: exact.code, source: 'legend-exact', confidence: 1.0 };

  // Within ΔE < 2.0 of any legend entry → near-exact (anti-aliasing tolerance)
  const near = nearestInLegend(cell.rgb, legendDict.entries, 2.0);
  if (near) return { code: near.code, source: 'legend-nearest', confidence: 0.95 };

  // Within ΔE < 5.0 → soft match, flag for review
  const soft = nearestInLegend(cell.rgb, legendDict.entries, 5.0);
  if (soft) return { code: soft.code, source: 'legend-soft', confidence: 0.7 };

  // No legend match → fall back to global DMC palette via colour-utils.findSolid
  const global = window.findSolid(cell.rgb);
  if (global) return { code: global.id, source: 'dmc-fallback', confidence: 0.5 };

  return { code: '__unknown__', source: 'unknown', confidence: 0.0 };
}
```

`legendDict.exact` is built once at the top of grid extraction by quantising every legend swatch RGB into an 8-bits-per-channel bucket. PDF anti-aliasing means most chart cells are pixel-perfect matches to their swatch (same `setFillRGBColor` op), so `legend-exact` covers ≥ 95 % of cells in well-formed DMC PDFs.

### Step 5: Backstitch (Layout A only)

When `chart-vector-bs` page is present:

```js
function extractBackstitch(ops, bbox, pitch) {
  const segments = [];
  walkOpStream(ops, (op, args, state) => {
    if (op === OPS.constructPath) {
      const innerOps = args[0], innerArgs = args[1];
      if (innerOps.length === 2 && innerOps[0] === OPS.moveTo && innerOps[1] === OPS.lineTo) {
        const [x1, y1, x2, y2] = innerArgs;
        segments.push({
          x1: (x1 - bbox.x0) / pitch,
          y1: (y1 - bbox.y0) / pitch,
          x2: (x2 - bbox.x0) / pitch,
          y2: (y2 - bbox.y0) / pitch,
          rgb: state.strokeRgb,
        });
      }
    }
  });
  return segments;
}
```

These map directly to the v8 schema's `bsLines` array.

---

## 5. Multi-page grid assembly

The hardest part. Per [§10 "Multi-page grid assembly is the hardest problem"](#10-rules-applied), this is tested exhaustively.

### Page ordering

Three signals, in priority order:

1. **N/M page marker** — Regex from [import-reference-dmc-format §6](import-reference-dmc-format.md): `/\b(\d+)\s*[\/\-of]+\s*(\d+)\b/i`. Highest priority.
2. **PDF page index** — Falls back to natural PDF page order if markers are absent.
3. **Edge-overlap correlation** — For each candidate ordering, compute the L2 distance between the right-edge column of page N and the left-edge column of page N+1. Pick the ordering that minimises total cross-page edge distance.

### Stitching

```js
function assembleMultiPage(extractions, ordering, ctx) {
  // Each extraction has: { cellsByPage: Map<pageNum, { cells, bbox, pitch }>, marker: { current, total } | null }
  const pageOrder = orderPages(extractions, ordering);
  const layout = layoutFromMarkers(pageOrder);   // either { rows, cols } or 'linear'

  // Detect overlap by looking for matching cell colours along shared edges.
  for (let i = 1; i < pageOrder.length; i++) {
    const overlap = detectOverlap(pageOrder[i-1], pageOrder[i]);
    pageOrder[i].xOffset = pageOrder[i-1].xOffset + pageOrder[i-1].cols - overlap.cols;
    pageOrder[i].yOffset = pageOrder[i-1].yOffset;   // adjust for grid layout
  }

  return mergeIntoSingleGrid(pageOrder);
}
```

### Overlap detection

DMC charts often overlap by 1–2 cells at page boundaries (the same column repeated on both pages, used as a registration guide). The detector:

1. Takes the rightmost K columns of page N.
2. Takes the leftmost K columns of page N+1.
3. For each candidate overlap width (0..K), counts cell-by-cell colour matches.
4. Picks the overlap width with the highest match ratio, provided ratio > 0.95 over ≥ 5 cells. Otherwise overlap = 0.

### Conflict resolution

If overlapping cells disagree on colour:
- Mark the merged cell with `confidence = min(left.confidence, right.confidence) * 0.8`.
- Prefer the cell from the page whose internal grid alignment was higher.
- Add a per-cell warning `EDGE_CONFLICT_PAGE_{N}_{N+1}`.

### Tests

The test plan (Phase 2 Step 4) will cover:
- `PAT1968_2.pdf` Layout A: 2-page chart, expected 80 × 80 grid (or whatever the analysis shows).
- `PAT2171_2.pdf` Layout B: combined chart, expected single-page grid.
- Synthetic 4-page and 6-page assembly with hand-authored op-stream fixtures.
- A deliberately misordered PDF with N/M markers (proves marker-based ordering wins over page index).

---

## 6. Metadata extraction

| Field | Source | Fallback |
|---|---|---|
| `title` | First page text content, largest font size | Filename without extension |
| `designer` | "Designed by …" / "Conçu par …" / "Diseñado por …" line in instructions | empty string |
| `copyright` | Footer line containing `©` or `Copyright` | empty string |
| `finishedSize` | Materials page text matching `/(\d+\.?\d*)\s*[x×]\s*(\d+\.?\d*)\s*(cm|in|inches)/i` | derived from grid dims + fabric count |
| `fabricCount` | Materials page text matching `/\b(\d{1,2})\s*(?:ct|count|fils|hilos)\b/i` | 14 (DMC default) |
| `fabricSku` | Materials page text matching DMC SKU regex | empty string |
| `languages` | Detected from token frequency: EN markers (`stitches`, `skeins`), FR (`points`, `écheveaux`), ES (`puntos`, `madejas`) | `['en']` |
| `thumbnail` | Largest `paintImageXObject` from cover page | first chart-page render |

All metadata extraction failures are non-fatal. Missing metadata becomes a `MetadataMissing` warning surfaced in the review pane.

---

## 7. Confidence model (DMC-specific)

Per-cell confidence (combined from sub-scores):

```
cellConf = min(
  pageRoleConf,         // confidence the cell's source page was a chart page
  gridAlignmentConf,    // 1 - normalised snap residual
  legendMatchConf,      // from matchCellToLegend
  multipageMergeConf    // 1 if not on a page boundary, else from overlap detector
)
```

Per-palette-entry confidence:

```
paletteConf = mean(
  swatchPresentConf,    // 1 if RGB swatch found, 0.6 if glyph-only
  codeRegexConf,        // 1 for unambiguous match, 0.7 for soft match
  artLineAttachedConf,  // 1 if art-line context known, 0.8 if defaulted
  totalsConsistentConf  // 1 if cell count vs legend total matches ±10%, drops linearly
)
```

Per-pattern overall confidence:

```
overallConf = mean(perCellConf) * 0.5
            + mean(perPaletteConf) * 0.3
            + pageClassificationConf * 0.2
```

These thresholds drive UI behaviour (per [import-7-review-ui.md](import-7-review-ui.md)):

| Range | UI behaviour |
|---|---|
| ≥ 0.95 | "Looks good — Import" fast path |
| 0.80–0.95 | Standard review pane, low-confidence cells highlighted |
| 0.60–0.80 | Mandatory review, palette confirmation step gated |
| < 0.60 | Guided-correction wizard, side-by-side with original PDF page |

---

## 8. Edge cases and pitfalls

Cross-referenced with [import-reference-dmc-format.md §11 "Pitfalls"](import-reference-dmc-format.md). The DMC adapter explicitly handles:

1. **`E` and `B5200` codes** — regex covers them.
2. **Two-digit codes (`09`, `48`)** — regex covers them.
3. **Art-line propagation** — header rows tracked across the whole legend.
4. **Trilingual labels** — stitch-type classifier accepts EN/FR/ES tokens via `import-reference-dmc-format.md §7` table.
5. **Layout A's identical lineTo counts on colour + backstitch pages** — used as the layout-variant signal, not a confusion source.
6. **Anti-aliased fill RGB** — quantised to 8-bit buckets before legend matching.
7. **Cells partly on the chart border** — flagged as `border_clip` and excluded from autocorrelation pitch detection.
8. **Rotated chart pages** (rare but seen in some HAED-style DMC freebies) — detected by aspect-ratio mismatch on chart bbox vs page bbox; chart is unrotated before extraction.
9. **Empty grid intersections (background fabric showing through)** — these have no `setFillRGBColor` op and produce no cell. Materialised as `__skip__`.
10. **Paint-by-numbers cells (no glyph, just fill)** — this is the DMC default. The fact that chart cells are RGB-only is _why_ legend-first parsing is mandatory.

---

## 9. Falsifiable success criteria

For Phase 5 to be considered done:

- `PAT1968_2.pdf` round-trips with ≥ 99 % cell-match against the manually verified ground truth.
- `PAT2171_2.pdf` round-trips with ≥ 99 % cell-match against the manually verified ground truth.
- Both PDFs' palettes recover all DMC codes listed in the legend with no false positives.
- Multi-page assembly produces zero cell offset errors on both files.
- Total wall-clock import time on a mid-range laptop < 2 s for either file.
- Memory peak < 200 MB for either file.

---

## 10. Rules applied

The §10 rules from the original brief are honoured as follows:

| Rule | How this design honours it |
|---|---|
| No DMC-specific code in the pipeline | `pdfDmcStrategy` lives entirely under `strategies/`; pipeline never references it by name |
| Parse the colour key BEFORE the grid | `extractLegend` runs before `extractGrid`; legend dict constrains cell matching |
| Confidence not optional | Every `RawCell` carries a `confidence` from the matcher; legend rows score themselves; pages score themselves |
| Never silently guess | Cells with confidence < 0.6 are surfaced; ambiguous matches (two legend entries within 2 ΔE of cell) emit both candidates with scores |
| Example files are ground truth | All thresholds are derived from analysis JSONs in [import-2-raw/](import-2-raw/) |
| Multi-page assembly tested exhaustively | Synthetic + real fixtures; marker + overlap + ordering all tested independently |
| Identical capability to native patterns | Stage 6 produces a v8 project; nothing in this adapter prevents editing/tracking/export |
| Preserve the original file | The pipeline (not this adapter) attaches `meta.rawSourcePages` and the original bytes |
| Handle copyright respectfully | `copyright` and `designer` extracted into metadata, surfaced in review |
| Performance matters | Strategy runs in the import worker; per-page progress reports; bbox detection avoids materialising full op-streams during classification |
| Resources system gets a format spec | [import-reference-dmc-format.md](import-reference-dmc-format.md) is the spec; this adapter is its implementation |
| Graceful degradation | Each stage can short-circuit and emit partial extraction with warnings; pipeline always returns _something_ |
| Don't build adapters for unanalysed formats | This adapter exists only because we have two real DMC files and full structural analysis |

---

## Next

[import-7-review-ui.md](import-7-review-ui.md) — the review and correction UI that consumes this adapter's output.
