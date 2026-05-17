# Raster Chart Importer — Clustering Quality Roadmap

> Captures the post-Phase-1/2 research into improving how the raster chart
> importer groups grid cells into clusters and matches each cluster to a
> DMC floss. Born from the observation that printed colour charts often
> have **slightly different colours that share a printed symbol**, or **a
> single colour whose symbol is rendered with sub-pixel variation across
> the chart** — neither of which the original Phase 2 design handled well
> because the two cues (shape and colour) were processed in series rather
> than combined.

## Shipped quick wins

### 1. Combined shape + colour clustering in colour mode (shipped)

Phase 2 originally ran two separate clustering passes:

1. `featurise` → HOG + dHash per cell → `cluster` (DBSCAN on glyph
   features only) → produced `clu.assignments` used as the canonical
   cluster index.
2. `colourCluster` (DBSCAN on Lab only) → produced
   `colourLabels` used purely to *name* clusters created in step 1.

The result: two colours sharing a printed symbol were merged into one
cluster (and got a single DMC label that wrong on at least one of them),
and a colour whose glyph was rendered with sub-pixel jitter was split
into multiple clusters that all auto-labelled to the same DMC.

The shipped fix:

- `featurise` runs first in **both** modes.
- In colour mode, the strategy hands HOG features + dHashes to
  `colourCluster`, which concatenates them with the per-cell Lab vector
  and runs a **single** DBSCAN pass with `labWeight = 0.6` (the value
  Phase 2 §2 already committed to for the standalone Lab path).
- The post-cluster Hamming-merge step that the B&W path already used
  (`mergeByHashHamming`, threshold = 4) now also runs in colour mode, so
  near-identical glyphs with marginal Lab differences collapse into one
  cluster.

This is bit-stable for B&W mode (no behaviour change) and should
materially reduce the "two reds merged" and "one red split in three"
failure modes on printed colour charts.

### 2. Auto-seed empty cluster labels (shipped)

The Symbols tab now seeds `labels[cid]` with the top-1 DMC suggestion
derived from each cluster's average colour as soon as the correction UI
mounts. Worker-side `findBest` matches and user-typed codes are
preserved. Effect: the Symbols tab is now "review and accept" rather
than "type from scratch" even on charts where the worker's findBest
couldn't match a few clusters.

### 3. Median per-cell RGB (D, shipped)

`extractCellColors` now collects per-channel R/G/B from each cell's
inner ~70 % window and returns the **median** instead of the mean. On
printed charts the cell border tends to clip a thin grid-line strip
even after `cellInwardPadFrac` padding; the mean was biased toward
black by that one-sided contamination. Median is robust against the
asymmetric outliers. Pad-frac was also raised to a hard floor of 18 %
of cell pitch.

### 4. CIEDE2000 for cluster → DMC matching (B, shipped)

`CorrectionUI.topNDmcMatches` (the chip strip in the Symbols / Needs-
review tabs) and the strategy's auto-label step both use ΔE2000 now.
Previously the strategy was calling `findBest(lab[0], lab[1], lab[2],
palette)` with a misordered argument list, throwing inside `findSolid`
and silently swallowing the result — so auto-labels were a no-op. They
now fire and use a perceptual metric instead of plain Euclidean.

### 5. Palette-seeded clustering with shape sub-splitting (C + A, shipped)

The colour-mode default is now `paletteSeededCluster`:

1. Every cell is snapped to its nearest DMC code by ΔE2000.
2. Cells sharing a code form a cluster (with `minPts = 2` to drop
   single-cell noise).
3. Within each palette cluster (≥ 8 cells) a second DBSCAN pass on the
   per-cell HOG features detects multi-symbol palette groups and splits
   them. Sub-noise cells are reattached to the largest sub-group to
   avoid dropping legitimate cells.

Cluster labels are now exact (the palette index is the cluster seed
itself, no medoid re-matching). The old generic-DBSCAN combined path
stays as a fallback when `window.DMC` is somehow empty. This addresses
the original failure modes from §1 directly: two reds that map to two
different DMC codes are now two clusters, and a red whose glyphs jitter
is a single cluster because every cell still hits the same DMC code.

### 6. Legend-restricted palette (E, shipped)

Legend OCR now runs **before** colour clustering. When the OCR returns
≥ 3 exact-source DMC codes, the palette-seeded cluster step is
restricted to just those codes (plus any 'repaired'-source codes) — a
chart whose printed legend lists 14 colours can no longer have a cell
snap to a 15th. Falls back to the full DMC catalogue when the legend is
short, low-confidence, or missing.

`colourResult.paletteRestricted` exposes whether the restriction fired
so downstream UI / telemetry can distinguish the two paths.

### 7. Lab-space silhouette telemetry (shipped)

`computeSilhouetteProxy` now prefers `clu.labFeatures` over HOG
features when present, which is the case for every colour-mode run
(palette-seeded path). The medoid-based silhouette score therefore
actually reflects what was clustered — previously it was scoring the
new palette-seeded clusters against shape features the clusters didn't
use, producing meaningless numbers. The B&W / fallback DBSCAN path
keeps using HOG features so its historical numbers stay comparable.
Telemetry now records `confidence.cluster.silhouetteMode = 'lab' |
'shape'` so the two populations can be analysed separately.

### 8. Background-tint normalisation (shipped)

`paletteSeededCluster` now estimates a per-image background a*,b*
offset from the brightest near-neutral cells (top 10 % by L* whose
|a*|+|b*| ≤ 12) and subtracts it from every cell's Lab before the
palette snap. This closes the gap where cream paper, scanned charts,
or photos under non-D50 lighting tilt every cell consistently —
previously a 310 swatch on cream paper drifted ~ΔE 4–6 from the
catalogue 310, often enough to snap to ECRU-adjacent neighbours.
Only fires when the drift is large enough to matter (|a̅| or |b̅| ≥
1.0), so clean screenshots are bit-stable. The detected offset is
returned as `clu.bgOffset` and recorded in
`confidence.cluster.bgOffset` for telemetry.

### 9. OCR legend tolerance for `#` prefix (shipped)

`ocrRepair.CODE_PATTERNS` now accepts `#310`, `DMC #310`,
`Anchor #47`, etc. The same prefix is stripped before set lookup in
`repairCode` and `parseLegendLine`. Some print exporters
(particularly Pattern Maker and a handful of Etsy templates) emit
`#NNN` in the legend; previously those rows were silently dropped and
the chart fell back to the full DMC catalogue.

### 10. Major-grid pitch refinement (shipped)

`projectionProfile.refinePitchFromMajors` re-derives the cell pitch
from the span between bold every-10-cell major lines whenever
`detectMajorPeriod` returns 10. The span between widely-spaced majors
is sub-pixel-accurate because peak-rounding noise averages out over
10+ cells, where minor-gap medians can drift one pixel per cell on
photographed charts with anti-aliased minor lines. The refined value
is only adopted when it agrees with the peak-derived pitch within 5 %
(rejects stray bold lines / watermarks) and when the major-to-major
spans themselves are within ±15 % of their own median (rejects
mis-detected majors). `gridFromProfiles` reports `pitchSource:
'majors'` when the refinement is taken.

### 11. Legend swatch Lab anchors (shipped)

The OCR worker now samples the mean RGB of a small region directly
left of every code-bearing word's bounding box and attaches it as
`swatchRgb` on the word record. `buildLegend` maps each parsed legend
entry back to its word and copies the swatch through. In
`parseColourMode`, when building the restricted palette, every entry
with a swatchRgb has its Lab recomputed via `rgbToLab(swatchRgb)`
instead of the catalogue Lab. The printed swatch is a ground-truth
measurement of *how the printer rendered this specific code on this
specific chart*, so it tracks ink-shift and lighting automatically —
catalogue Lab is calibrated for skein silk under D50 lighting, which
almost never matches a printed-and-photographed chart. Telemetry adds
`cluster.swatchOverrideCount`. Near-white (likely an empty gap to the
left of a code) and near-black (likely a glyph leaking into the
swatch ROI) samples are dropped silently.

### 12. Skip-the-symbol cell sampling (shipped)

`cvPipeline.extractCellColors` previously took a per-channel median
over every pixel inside the inward-padded cell ROI. On real charts
the printed symbol covers 25–50 % of the inner box; with a 14 %
inward pad the symbol is still inside the sample window, so the
median is biased toward black ink and every cell snaps to the
darkest few DMC codes (310 / 3799 / 535 / 939). The new algorithm
is a **modal-window median**: bin per-pixel Rec. 601 luma into 16
buckets of width 16 Y, find the densest bucket (= background, since
the background is the largest connected colour region in the cell),
keep only pixels whose Y is within ±1 bucket of the mode, then
median R/G/B over that subset. Falls back to the full-cell median
when the kept subset drops below 20 % of the cell — this preserves
the uniform-colour test fixture's bit-exact output and handles
degenerate cells (covers > 80 %) without producing garbage.

Works for both glyph polarities (dark glyph on light background,
light glyph on dark background) because the heuristic locks onto
the densest luminance, not the brighter or darker tail. Scratch
buffers (`rBuf`, `gBuf`, `bBuf`, `yBuf`, `Int32Array(16)` histogram)
are reused across cells to avoid millions of per-cell allocations
on a 200×200 chart. Regression test in
`tests/rasterChart-phase2.test.js` constructs a light-blue cell with
a 25 % dark-glyph patch and verifies the output is exactly the
background colour, not a darkened mix.

### 13. Grid tab visual diagnostic & pitch ruler (shipped)

Two changes to `CorrectionUI.GridEditor` aimed at the failure mode
where the auto-detected grid drifts ~0.5 px per cell on
photographed charts — by the time the warp reaches the far edge the
sample window has slid into a grid-line and every cell snaps to
black:

* **`CellSamplePreview`** — a new compact swatch grid rendered
  beneath the warped-preview overlay. One tiny 2–8 px swatch per
  cell, sampled live from the warped preview using the same
  modal-window-median heuristic as §12 above. Re-samples on every
  grid nudge so the user can confirm "the swatches look mostly
  coloured, not grey" before committing. When the grid is
  misaligned the diagnostic is unmistakeable — long bands of grey /
  black across rows that have drifted onto a grid-line.

* **Pitch ruler** — a two-click manual measurement tool. User
  enters how many cells apart the two reference intersections are
  (default 10), clicks "Measure pitch", then clicks each
  intersection on the overlay. The system computes
  `pitch = max(|Δx|, |Δy|) / spanCells` in working-image px and
  also snaps the origin to the first click, so a single 10-cell
  measurement aligns the entire grid sub-pixel-accurately. Useful
  when auto-detection latches onto an off-by-one period or when
  perspective correction left a residual gradient that the global
  ±1 px nudges can't fix. Marks `pitchSource: 'user-ruler'` on the
  grid record. `GridOverlayPreview` was extended with an
  `onCanvasClick(canvasX, canvasY)` callback and a `rulerPoint`
  marker (crosshair + disc) so the first click stays visible while
  the user lines up the second.

## Larger changes — research notes & plan

Each item below is a deliberately separate commit because they have
distinct telemetry signals and risk profiles. Pick the one whose
telemetry confirms a real-world failure mode before implementing.

### A. Two-stage colour-then-shape clustering — *shipped as part of palette-seeded mode (§5)*

Originally proposed as DBSCAN-on-colour → DBSCAN-on-shape-per-bucket.
The shipped palette-seeded pipeline does exactly this: palette buckets
*are* the colour buckets, and the per-bucket HOG-DBSCAN sub-split is the
shape pass. The standalone two-stage DBSCAN variant is no longer worth
implementing.

### B. ΔE2000 instead of ΔE76 / Euclidean Lab — *shipped (§4)*

In use for cluster→DMC matching (`topNDmcMatches` + the strategy auto-
label loop) and for the palette-seeded per-cell snap. DBSCAN's internal
neighbour search still uses normalised Euclidean — appropriate for
shape+Lab feature vectors where the Lab columns are only 3 of N
dimensions.

### C. Use the DMC palette as initial cluster seeds — *shipped (§5)*

Implemented as `paletteSeededCluster` in the worker; now the default
for colour mode.

### D. Median Lab per cell (instead of mean) — *shipped (§3)*

### E. Use OCR'd legend codes to restrict the palette — *shipped (§6)*

The legend OCR already finds the legend swatch position. We sample its
RGB but never use it to disambiguate clusters. If the legend says
`"310 — Black"` and the cluster whose Lab is closest to the legend
swatch RGB is cluster #5, we have a *very* high-confidence label for
cluster #5 that beats any palette-nearest-neighbour guess.

**Telemetry trigger:** `corrections.surface == 'legend-manual-map'`
frequency > 20 % (already noted in Phase 2 §3).

**Effort:** medium. Requires the legend OCR pass to also emit swatch
RGB, plus a strategy-level bipartite-match step (Hungarian algorithm or
greedy nearest-Lab) between legend swatches and cluster medoids.

### F. HDBSCAN swap (Phase 2 §2 trigger, unchanged)

Phase 2 already gated this on
`confidence.cluster.meanSilhouette < 0.4`. Document here as a known
follow-up: with combined features now in the picture the silhouette
metric may rise (good) and obviate HDBSCAN, *or* it may drop (because
the higher feature dimensionality creates more sparse neighbourhoods),
in which case HDBSCAN becomes more attractive.

## Telemetry adds (Phase 2.5)

The shipped combined-clustering change should emit the same
`timings.cluster` and `confidence.cluster.{meanSilhouette,noiseCount,
clusterCount}` fields as before, so existing dashboards compare apples
to apples. Add a single new field to distinguish runs:

- `input.clusterMode`: `"shape-only"` | `"colour-only"` | `"combined"`

This lets the post-Phase-2 review separate the three populations when
making A/B comparisons.

## Won't do

- **Per-cell user-paintable correction grid.** The cluster gallery is the
  right abstraction; nudging individual cells is what the existing
  Pattern Creator paint mode is for after import.
- **Tesseract recognition of every cell.** Charts that print the DMC code
  *inside* every cell are rare and the legend OCR pass already handles
  them via the side-table.
