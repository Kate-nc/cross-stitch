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

## Larger changes — research notes & plan

Each item below is a deliberately separate commit because they have
distinct telemetry signals and risk profiles. Pick the one whose
telemetry confirms a real-world failure mode before implementing.

### A. Two-stage colour-then-shape clustering

Cluster on colour first (DBSCAN, generous ε so each colour bucket is
loose), then within each colour bucket run a second pass on HOG + dHash
to split colours whose chart cells were rendered with different symbols
(rare but happens with cross-stitch / quarter-stitch mixed cells).

**Telemetry trigger:** `corrections.surface == 'cluster-split'` rate > 15 %
in colour-mode imports.

**Effort:** medium. Requires DBSCAN to accept a per-point cluster ID
seed (or running it on each sub-bucket from JS).

### B. ΔE2000 instead of ΔE76 / Euclidean Lab

DBSCAN currently uses raw Euclidean distance in normalised Lab, which is
ΔE76 in disguise. ΔE2000 is significantly more perceptual, especially
for desaturated greys and pastels — exactly the failure region for
"two greys merged together".

**Telemetry trigger:** `corrections.surface == 'cluster-merge'` rate
where both clusters' top-1 DMC suggestions disagree but their RGB
distance is < 15.

**Effort:** small (~50 LOC). DBSCAN's distance metric is plugged in via
a callback already. ΔE2000 cost per pair is ~10× ΔE76 — measure first
on a 100×100 chart (10 000 cells × ~20 neighbour comparisons = 2M ops;
should still be well under the 500 ms Lab budget).

### C. Use the DMC palette as initial cluster seeds (constrained
k-means-like start)

Instead of running unsupervised DBSCAN and *then* matching centroids to
DMC, snap each cell directly to its nearest DMC code (k = palette size
≈ 500) and only keep DMC codes used by ≥ 2 cells. This is exactly what
the existing `colour-utils.js findBest()` already does for image-based
pattern generation in the Creator. Symbol features would only be used
for the disambiguation step (when two adjacent DMC matches are within
ΔE < threshold of each other).

**Telemetry trigger:** `confidence.cluster.meanSilhouette` median < 0.4
across captured colour-mode imports (i.e. DBSCAN's natural cluster
boundaries are weak).

**Effort:** medium — but this is the proven approach used elsewhere in
the codebase, so the risk profile is low.

### D. Median Lab per cell (instead of mean)

The current `extractCellColors` returns a per-cell mean. On a printed
chart the inner pixels of a cell are the colour we want, but the
borders pick up the grid-line ink (black) which biases the mean toward
darker. A median over the cell's inner 70 % is robust against this.

**Telemetry trigger:** Across captured colour-mode imports, compute
mean-vs-median ΔE per cell; if median > 5 in > 20 % of cells, ship.

**Effort:** small. `cvPipeline.extractCellColors` is a single function.

### E. Use OCR'd legend swatch RGB to label clusters

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
