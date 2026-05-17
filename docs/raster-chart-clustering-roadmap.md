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
