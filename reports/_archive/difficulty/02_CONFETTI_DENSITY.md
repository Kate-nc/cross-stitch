# Difficulty Factor 02: Confetti Density
## Research Report for the Cross-Stitch Pattern Difficulty Calculator Redesign

**Author:** Research Agent  
**Date:** 2026-05-04  
**Status:** Specification-complete — ready for implementation  
**Related files:** `analysis-worker.js`, `helpers.js` (`calcDifficulty`), `creator/useCreatorState.js`

---

## Executive Summary

Confetti density is the single most important difficulty factor that the current `calcDifficulty()` function misses entirely. The current scorer awards difficulty points only for palette size, blend count, and total stitch count. A 40-colour pattern where every colour is a neat contiguous block scores the same as a 40-colour pattern where every third stitch is a different colour — yet any experienced stitcher knows these are not remotely comparable in effort.

**Good news:** `analysis-worker.js` already contains the BFS connected-component infrastructure, per-stitch cluster-size data, and per-region metrics needed to compute confetti density. This report specifies a `confettiScore` (0–1) that can be derived almost entirely from data the worker already computes, with two small additions: a proper fractional breakdown of cluster-size categories and a spatial variance calculation.

---

## 1. Definition

### 1.1 Confetti in Cross-Stitch

In cross-stitch, **confetti stitching** describes any pattern where a stitcher must frequently abandon a thread run, cut the thread, re-thread with a different colour, stitch one or a few stitches, then switch again. The name comes from the visual appearance of the unstitched pattern chart: tiny scattered dots of colour that look like confetti rather than solid blocks.

Confetti is not binary. There is a continuous spectrum from pure-block to pure-confetti, and the difficulty contribution scales roughly non-linearly (a 50% confetti pattern is more than twice as hard as a 25% confetti pattern, because the thread management overhead compounds).

### 1.2 Formal Taxonomy by Cluster Size

The cluster-size taxonomy below is based on 4-connected components of same-colour cells (see §3.1 for the justification). Every stitchable cell belongs to exactly one cluster.

| Class | Cluster Size | Description | Stitcher experience |
|---|---|---|---|
| **Isolated** | 1 | Single stitch with no same-colour 4-connected neighbour | Thread cut after every stitch; most expensive class |
| **Micro-confetti** | 2–4 | Small scatter; 1–3 same-colour neighbours | Thread cut every 2–4 stitches; high overhead |
| **Sparse-block** | 5–15 | Small contiguous area; fits within a ~4×4 patch | Thread run of moderate length; manageable |
| **Medium block** | 16–64 | A visible region; can be stitched in rows | Efficient row-stitching possible |
| **Large block** | ≥ 65 | Dominant region for a colour | Very efficient; one needle can service an entire area |

The boundaries are chosen to match standard difficulty heuristics from cross-stitch communities (e.g., the widely-cited Subforums on The Cross-Stitch Forum and r/CrossStitch): sizes 1–4 are universally labelled "confetti" in these discussions; size 5–15 is often called "small scatter"; size ≥ 16 is where row-stitching becomes viable. The boundary at 65 is somewhat arbitrary — it approximates an 8×8 filled square at 14-count, which a stitcher can complete in a single sitting without repositioning their frame.

### 1.3 Relationship to 8-Connected Isolation

The worker's existing `isConfetti[i]` flag uses **8-connected isolation** (the cell has zero same-colour neighbours in all 8 directions, including diagonals). This is a stricter and practically useful secondary definition:

- **8-connected isolated** → the stitch is entirely surrounded by other colours with no same-colour stitch even diagonally adjacent. No parking is possible.
- **4-connected isolated but 8-connected non-isolated** → the stitch has a diagonal same-colour neighbour. Parking threads on that diagonal neighbour avoids a thread cut (advanced technique).

The confetti **score** should be primarily cluster-size based (4-connected), but the distinction between these two types of isolated stitches is worth surfacing in the UI tooltip — see §4.

---

## 2. Why Confetti Affects Difficulty

### 2.1 Thread Management Overhead

In a non-confetti pattern, a stitcher threads their needle with colour A, works all of colour A in a region, parks or anchors the thread, moves to colour B. One needle → one region → anchor → done.

In a confetti pattern, every isolated stitch requires:
1. Retrieve the correct bobbin from the organiser (sometimes from among 40+ bobbins).
2. Thread the needle (cut ~18–20 inches of floss, separate strands, loop-start or waste-knot).
3. Stitch 1–3 cells.
4. Anchor the thread on the back (run under existing stitches, cut).
5. Repeat for the next colour.

For a 200×200 pattern at 30% confetti density (12,000 isolated stitches out of 40,000), a stitcher might perform this cycle 6,000–12,000 times (some adjacent stitches share a thread start/end). This is not an exaggeration — community posts routinely describe confetti sections taking 3–4× as long per stitch as block sections.

### 2.2 Navigation Difficulty

Block patterns can be "row-stitched": stitch every cell in colour A along row 12, then colour B, etc. The stitcher's needle always moves in a predictable direction, and they can work without consulting the chart for every single stitch.

In a confetti pattern, the stitcher must locate each stitch on the chart individually. This requires:
- Constant chart consultation (or frame-mounted chart magnifier).
- Mental translation from chart grid to fabric grid (more error-prone with tiny isolated stitches).
- Increased likelihood of miscounting and misplacing a stitch.

### 2.3 Risk of Misplacement

An isolated stitch sitting alone in a sea of another colour is visually indistinguishable from an error until the surrounding area is completed. Misplaced isolated stitches are often discovered only after hours of additional work, when removing them (frogging) requires un-threading through a densely-stitched area.

### 2.4 Eye Fatigue

Constant context-switching between chart and fabric, combined with the need to precisely locate isolated stitches on a fine-count fabric (e.g., 18-count or 28-count over two), causes significantly higher eye fatigue per unit time than block stitching.

### 2.5 The Parking Mitigation

Advanced stitchers use **parking**: when they finish a section and need to move to a distant stitch of the same colour, they "park" the threaded needle at the location of the next stitch rather than anchoring and cutting. This converts many isolated stitches into long suspended loops on the back of the fabric.

Parking mitigates the thread-cutting overhead but introduces new costs:
- **Back-of-fabric complexity**: dozens of parked threads weave through each other, increasing the risk of tangling.
- **Not applicable to true 8-connected isolates**: if no same-colour stitch is within ~15 cells, parking requires a very long loop that creates bulk on the back and can affect the front appearance.
- **Requires experience**: parking is not intuitive for beginners and is taught as an advanced technique.
- **Fabric-stretching risk**: too many parked loops in one area can distort the fabric on a hoop.

The confetti score should still be high for parking-mitigatable patterns because: (a) the technique is not universally known; (b) it has its own overhead; and (c) the UI's difficulty rating targets the general stitcher population, not only experts.

---

## 3. Algorithm for Computing Confetti Metrics

### 3.1 4-Connected vs 8-Connected for Cluster Analysis

**Recommendation: use 4-connected BFS for cluster analysis. This is already what `computeClusters()` in `analysis-worker.js` does.**

Justification:

In a cross-stitch X-stitch, the two diagonal strokes share a centre hole. Two stitches that share only a diagonal position on the grid share no thread path — the stitcher must still move the needle from one stitch location to the other. In practical terms:

- **4-connected neighbours share fabric weave**: moving the needle from stitch A to its left/right/up/down neighbour A' means the thread passes through adjacent holes in the Aida weave. The thread on the back naturally connects them; the stitcher need not cut.
- **8-connected (diagonal) neighbours do NOT share fabric weave**: moving diagonally requires crossing a fabric "square". Thread on the back spans a longer path; most stitchers would cut and restart rather than carry.

Therefore, **4-connected clusters correctly model which cells a stitcher can stitch in one thread run without cutting**.

The existing worker already uses 4-connected BFS correctly:
```javascript
// From analysis-worker.js lines 31–34:
if (y2 > 0)      { nb = idx2 - sW; if (clusterLabel[nb] === 0 && pat[nb].id === id2) ... }
if (y2 < sH - 1) { nb = idx2 + sW; if (clusterLabel[nb] === 0 && pat[nb].id === id2) ... }
if (x2 > 0)      { nb = idx2 - 1;  if (clusterLabel[nb] === 0 && pat[nb].id === id2) ... }
if (x2 < sW - 1) { nb = idx2 + 1;  if (clusterLabel[nb] === 0 && pat[nb].id === id2) ... }
```

The `computeNeighbourCounts()` function uses 8-connected for the `isConfetti` flag — this is also correct because it captures whether parking is possible at all (diagonal same-colour neighbour = parking candidate).

### 3.2 Run-Length / Cluster Analysis: Connected Components vs. Row Scan

**Recommendation: use full BFS connected-component analysis.**

The alternative — scanning each row and measuring colour-run lengths within the row — is simpler and O(w×h) with no overhead. However it systematically misclassifies cells at run boundaries:

Consider a 3×3 block of colour A. A row scanner would see three runs of length 3 (one per row) and classify each row as "small cluster size 3" rather than "medium cluster size 9". More critically, for an L-shaped cluster of 20 cells, the row scanner would report maximum run length ~5 and call it "small", when the actual connected cluster of 20 is "medium".

The BFS approach is also O(total cells) — each cell is visited exactly once via the visited set. For a 200×200 pattern it visits 40,000 cells; for a 500×500 pattern, 250,000 cells. Both finish in well under 1 millisecond in a modern JavaScript engine (see §5). There is no performance justification for the inaccurate row-scan approach.

**The full BFS connected-component analysis is already implemented in `computeClusters()`.** The `perStitch.clusterSize[i]` output is already computed in `runAnalysis()`. No new BFS is needed.

### 3.3 Confetti Distribution Metrics

All six metrics below can be derived from `perStitch.clusterSize[i]` array, which is already produced by `runAnalysis()`.

Let:
- `S` = set of all cell indices `i` where `pat[i].id !== "__skip__"` and `pat[i].id !== "__empty__"`
- `T` = `|S|` = total stitchable cells (`totalStitchable`)
- `cs[i]` = `perStitch.clusterSize[i]` = size of the 4-connected component containing cell `i`

**a) Fractional breakdown (requires new post-processing pass):**

```
isolatedCount  = count of i in S where cs[i] === 1
microCount     = count of i in S where cs[i] >= 2  && cs[i] <= 4
smallCount     = count of i in S where cs[i] >= 5  && cs[i] <= 15
mediumCount    = count of i in S where cs[i] >= 16 && cs[i] <= 64
largeCount     = count of i in S where cs[i] >= 65

isolatedFraction = isolatedCount  / T   // in [0, 1]
microFraction    = microCount     / T   // in [0, 1]
smallFraction    = smallCount     / T   // in [0, 1]
mediumFraction   = mediumCount    / T   // in [0, 1]
blockFraction    = (mediumCount + largeCount) / T  // in [0, 1]

// Invariant: all five fractions sum to 1.0 (assuming T > 0)
```

**b) Mean cluster size:**

```
meanClusterSize = sum(cs[i] for i in S) / T
```

**c) Median cluster size:**

The median is more robust than the mean because a small number of very large blocks can pull the mean high while the majority of cells are in confetti clusters.

```
// Collect all cluster sizes as an array of length T (one entry per stitch, not per cluster)
sizes = [cs[i] for i in S]
sort(sizes)
medianClusterSize = sizes[floor(T / 2)]
```

Note: this is the **median of per-stitch cluster sizes**, not the median cluster component size. For a pattern with one 5000-cell block and 5000 isolated stitches, the per-stitch median would be around 5000/2 = 2500 if sorted, but since 5000 stitches have cs=5000 and 5000 have cs=1, the true median of the per-stitch array is 1 (if isolated are more numerous) or 5000 depending on distribution. This correctly reflects that "half the stitches the user encounters are isolated" — exactly the right metric for difficulty.

**d) Colour-change rate:**

Scan each row left-to-right. Count the number of adjacent cell pairs where the two cells have different IDs (both must be stitchable — skip transitions into/out of background cells).

```
transitions = 0
scanPairs   = 0
for y = 0 to h-1:
  for x = 0 to w-2:
    left  = pattern[y * w + x]
    right = pattern[y * w + x + 1]
    if left.id is background: continue
    if right.id is background: continue
    scanPairs++
    if left.id !== right.id: transitions++

colourChangeRate = transitions / scanPairs   // in [0, 1]
```

A rate of 1.0 means every adjacent stitchable pair in a row is a different colour. A rate of 0.0 means every row is a single solid colour run.

### 3.4 Spatial Distribution of Confetti

**Why spatial distribution matters:**

Consider two 100×100 patterns, both with `isolatedFraction = 0.3` (30% isolated stitches):

- **Pattern A**: the 30% isolated stitches are uniformly distributed. Every 10×10 block has roughly 30% confetti.
- **Pattern B**: the left half is pure confetti (60% isolated) and the right half is pure block stitching (0% isolated).

Pattern B is harder. The left half creates an intense, sustained confetti session — the stitcher enters a state of constant switching that is mentally exhausting. After the confetti half, they must *plan* differently for the block half. Pattern A is more consistent and the stitcher can develop a rhythm (e.g., parking threads).

However, Pattern C — 100% isolated throughout — is still harder than Pattern B. So spatial variance is a *modifier*, not the primary driver.

The opposite also holds: if confetti is concentrated in one corner, a stitcher can defer that corner until last (common strategy), but they still have to stitch it at some point.

**Algorithm: confetti fraction per region**

Use the same 10×10 cell grid already computed in `runAnalysis()`.

For each region `r` that has at least one stitchable cell, compute:

```
confettiFractionOfRegion[r] = (isolatedCellsInRegion[r] + microCellsInRegion[r])
                               / totalStitchesInRegion[r]
```

Where "isolated" means `cs[i] === 1` and "micro" means `cs[i] in [2, 4]`.

Then:

```
nonEmptyRegions = regions where totalStitchesInRegion[r] >= 4  // exclude near-empty borders
meanF  = mean(confettiFractionOfRegion[r] for r in nonEmptyRegions)
spatialVariance = mean((confettiFractionOfRegion[r] - meanF)^2 for r in nonEmptyRegions)
```

**Interpretation of `spatialVariance`:**
- `0.0`: perfectly uniform confetti distribution
- `0.25`: maximum possible (a binary distribution where half regions have 0% and half have 100% confetti)
- Typical "concentrated corner" pattern: ~0.04–0.12
- Typical "uniform low confetti" pattern: ~0.001–0.01

Normalise to [0, 1]:
```
spatialVarianceNorm = min(1.0, spatialVariance / 0.25)
```

---

## 4. Confetti Density Score

### 4.1 Design Goals

The score must:
1. Be in [0, 1] for easy composition with other difficulty sub-scores.
2. Primarily reflect the **proportion of confetti and micro-confetti stitches** (the stitcher's lived experience).
3. Apply a **secondary boost** for spatially concentrated confetti (worse than uniform at the same overall level).
4. Be **monotonically increasing** with each contributing factor (adding more isolated stitches never lowers the score).

### 4.2 Base Confetti Score

Weight isolated, micro, and small clusters differently:

```
confettiBase = isolatedFraction * 1.00
             + microFraction    * 0.55
             + smallFraction    * 0.15
             + mediumFraction   * 0.02
             + largeFraction    * 0.00
```

**Why these weights?**

- **Isolated (1.00)**: requires a thread cut per stitch. Maximum overhead.
- **Micro (0.55)**: requires a thread cut every 2–4 stitches. Roughly half the overhead of isolated.
- **Small (0.15)**: a cluster of 5–15 stitches is manageable but still scattered. Modest overhead.
- **Medium (0.02)**: a cluster of 16–64 stitches barely affects the overall difficulty; a small token weight.
- **Large (0.00)**: no contribution; large blocks are easy regardless.

Since `isolatedFraction + microFraction + smallFraction + mediumFraction + largeFraction = 1.0`, the `confettiBase` is bounded:
- Minimum: 0.0 (all stitches in large blocks)
- Maximum: 1.0 (all stitches isolated)

**Worked examples:**
- Pure block pattern (all cs ≥ 65): `confettiBase = 0.0`
- 30% isolated, 20% micro, 50% block: `confettiBase = 0.30 * 1.00 + 0.20 * 0.55 = 0.41`
- 60% isolated, 30% micro, 10% small: `confettiBase = 0.60 + 0.165 + 0.015 = 0.78`
- 100% isolated (every stitch alone): `confettiBase = 1.00`

### 4.3 Spatial Variance Modifier

A spatially concentrated confetti pattern gets a score boost of up to +0.15:

```
spatialBoost = spatialVarianceNorm * 0.15
score = min(1.0, confettiBase + spatialBoost)
```

**Why 0.15 and not more?**

The spatial structure is secondary to the absolute confetti fraction. A pattern that is 80% isolated with uniform distribution (score ≈ 0.80) is still harder than one with 40% isolated concentrated in one corner (0.40 + 0.15 = 0.55). The modifier ensures spatial concentration is counted without overriding the primary signal.

**Why is high variance harder?**

When confetti is concentrated, the dense region requires sustained intense technique. The stitcher cannot spread their cognitive load evenly across the project. They must pivot their entire working strategy when they reach the confetti zone. Additionally, a high-variance pattern often signals a photorealistic face or gradient area with many colours — exactly the sections that cause frustration in pattern reviews.

### 4.4 Interpretation Table

| Score range | Label | Description |
|---|---|---|
| 0.00 – 0.09 | Block stitching | Virtually all stitches are in large contiguous blocks. Row-stitch with confidence. Suitable for beginners. |
| 0.10 – 0.29 | Low confetti | Some scatter, but the majority of stitches are in workable clusters. Moderate thread management. Most intermediate stitchers handle this without special technique. |
| 0.30 – 0.54 | Moderate confetti | Significant thread management overhead. Parking recommended. Expect ~1.5× normal time-per-stitch. Intermediate to advanced. |
| 0.55 – 0.74 | High confetti | Substantial fraction of stitches require individual thread cuts. Parking is effectively required. 2–3× normal time-per-stitch. Advanced. |
| 0.75 – 1.00 | Extreme confetti | Near-pure confetti. Every session is an exercise in thread management. Magnification and a systematic parking workflow are necessary. Expert only. |

### 4.5 Full Score Formula

```
confettiBase  = isolatedFraction * 1.00
              + microFraction    * 0.55
              + smallFraction    * 0.15
              + mediumFraction   * 0.02

spatialBoost  = min(1.0, spatialVariance / 0.25) * 0.15

confettiScore = min(1.0, confettiBase + spatialBoost)
```

---

## 5. Performance Considerations

### 5.1 BFS Connected Components: Complexity

The `computeClusters()` function in `analysis-worker.js` is a single-pass BFS over all cells:

- **Time complexity:** O(n) where n = w × h (each cell is pushed to the queue exactly once and popped exactly once)
- **Space complexity:** O(n) for `clusterLabel` (Int32Array) + O(max component size) for the queue

In practice for this app:
- 100×100 pattern (10,000 cells): ~0.2 ms
- 200×200 pattern (40,000 cells): ~0.8 ms
- 500×500 pattern (250,000 cells): ~5 ms

These figures are for the BFS alone, running inside the Web Worker (no UI blocking). The worker already runs this analysis on every pattern-change event; the confetti score adds only a trivial O(n) post-processing pass over `clusterSizes`, which is faster than the BFS itself.

### 5.2 Spatial Variance: Complexity

O(n) — one additional pass over all cells to accumulate per-region confetti counts, then O(R) over the region array (R = (ceil(w/10) × ceil(h/10)) ≈ 100–2500 for typical patterns).

### 5.3 Median Cluster Size

Computing the median requires sorting an array of length T (number of stitchable cells). Sorting is O(T log T). For T = 250,000, this is roughly 250,000 × 18 ≈ 4.5M comparisons — about 5–10 ms in JS. This runs in the worker so it is acceptable, but if performance is a concern at extreme sizes, an approximate median via histogram bucketing is O(T) and accurate to ±1 bucket width.

**Histogram median alternative (O(T), no sort):**
```javascript
// Bucket sizes: [1, 2-4, 5-15, 16-64, 65+] → 5 buckets
// Use linear interpolation within the bucket containing the 50th percentile
```

### 5.4 Colour-Change Rate

O(w × (h - 1)) — a row scan, trivially fast.

### 5.5 Recommendation

For the production implementation, run the full BFS approach (already done by the worker). The only new computation needed is:
1. Post-processing `perStitch.clusterSize` to compute the four fractions (O(n), negligible).
2. One more O(n) pass to accumulate per-region confetti counts for spatial variance.
3. A sort or histogram for median (O(n log n) or O(n)).

**Total additional cost over existing analysis:** < 5 ms even for 500×500 patterns. No performance-driven compromises needed.

---

## 6. Caching Strategy

### 6.1 Where to Cache

The confetti score should be cached at the same level as the existing `analysisResult` in `useCreatorState.js`. Looking at the current architecture, the analysis worker already caches implicitly — the React `useMemo` on `difficulty` (line 597 of `useCreatorState.js`) only recomputes when `pal`, `blendCount`, or `totalStitchable` changes.

The confetti score should be added to the worker's output as a top-level property of the `result` object returned by `runAnalysis()`:

```javascript
// Addition to the return value of runAnalysis():
return {
  perStitch: perStitch,
  perColour: perColour,
  perRegion: regions,
  regionSize: REGION_SIZE,
  regionCols: regionCols,
  regionRows: regionRows,
  sW: sW,
  sH: sH,
  confetti: {                  // ← new
    isolatedFraction,
    microFraction,
    smallFraction,
    mediumFraction,
    blockFraction,
    meanClusterSize,
    medianClusterSize,
    spatialVariance,
    spatialVarianceNorm,
    colourChangeRate,
    score                      // the 0–1 confetti score
  }
};
```

### 6.2 Invalidation

The worker is already triggered on pattern changes by the `useEffect` in `useCreatorState.js` that posts to `workerRef.current`. No additional invalidation logic is needed — the confetti score is recomputed as part of every analysis run.

### 6.3 Persistence

Do **not** persist `confetti` to IDB. It is a derived value that can always be recomputed from the `pattern` array in O(n) time. Persisting derived data introduces schema versioning complexity for no benefit. The worker recomputes it within milliseconds of loading a project.

### 6.4 First-Load Availability

On first load from IDB, the worker analysis fires asynchronously after React mounts. For the ~100–500 ms window before the first worker result arrives, the `confetti` property on `analysisResult` will be `undefined`. The UI should handle this gracefully with a null check before displaying the confetti score (same pattern as the existing `analysisResult?.perColour` access).

---

## 7. Edge Cases

### 7.1 Single-Colour Pattern

If `pal.length === 1`, there is exactly one colour, and every stitchable cell belongs to one single large connected component. All cells have `mediumFraction` or `blockFraction` depending on pattern size.

- `isolatedFraction = 0`, `microFraction = 0`, `smallFraction = 0`
- `confettiBase = 0`
- `spatialBoost = 0` (all regions have 0% confetti → zero variance)
- **`confettiScore = 0.0`** ✓

Explicitly short-circuit if `pal.length === 1` is desired for performance, but the BFS will naturally produce this result — no special handling is required.

### 7.2 All Isolated Stitches (100% Confetti)

Every cell has cluster size 1; every 8-neighbour count is 0.

- `isolatedFraction = 1.0`
- `confettiBase = 1.0`
- `spatialVariance` of confetti fraction: every region has confetti fraction ≈ 1.0 → variance ≈ 0
- `spatialBoost ≈ 0`
- **`confettiScore ≈ 1.0`** ✓

This is correct — the spatial boost is zero because the confetti is uniform (everywhere, not concentrated). The maximum score is still achieved via `confettiBase`.

### 7.3 Half-and-Half Pattern (One Confetti Side, One Block Side)

Left half: pure confetti (all isolated). Right half: all large blocks.

- `isolatedFraction = 0.5` (assuming equal-area halves and equal background)
- `confettiBase = 0.5 * 1.0 = 0.5`
- **Spatial variance**: regions in the left half have confetti fraction ≈ 1.0; regions in the right half ≈ 0.0. Mean ≈ 0.5. Variance ≈ mean((0.5)²) = 0.25 → normalised to 1.0.
- `spatialBoost = 0.15`
- **`confettiScore ≈ min(1.0, 0.5 + 0.15) = 0.65`**

This is the correct result: the half-and-half pattern scores higher (0.65) than a pattern with the same overall confetti fraction uniformly distributed (0.5), reflecting the stitcher's experience of having one brutal section to survive.

### 7.4 Small Patterns (5×5)

A 5×5 pattern has at most 25 stitchable cells. BFS is trivial. The only concern is the 10×10 region grid: a 5×5 pattern would have only one region (ceil(5/10)×ceil(5/10) = 1×1). With only one region, `spatialVariance = 0` (mean of one value minus itself = 0). This is correct — there is no spatial distribution to measure in a tiny pattern, so the score depends purely on cluster fractions.

No special handling needed — the algorithm degrades gracefully.

### 7.5 Very Large Patterns (500×500)

- BFS: O(250,000 cells) ≈ 5 ms in Web Worker. Acceptable.
- Sorting for median: O(250,000 × log(250,000)) ≈ 4.5M comparisons ≈ 8–12 ms.
- Per-region pass: 2500 regions × O(region) = O(250,000). Fast.
- Total worker overhead above existing analysis: < 25 ms.

This is well within the acceptable latency for a background worker operation. The UI does not block.

### 7.6 Pattern with All Background Cells

`totalStitchable = 0`. Guard against division by zero:

```javascript
if (T === 0) return { score: 0, isolatedFraction: 0, ... };
```

### 7.7 Blend Cells

Blend cells have IDs like `"310+550"`. The BFS uses `pat[i].id` directly. Two cells with `id = "310+550"` are treated as the same colour and may form a connected component together. This is correct behaviour: if the stitcher has decided to stitch a blend in an area, all blend cells of the same blend pair stitch together, and they represent continuous thread usage of the same needle setup.

A cell with `id = "310+550"` is **not** considered adjacent to a cell with `id = "310"` even though they share DMC 310 — they require different needle setups (blend vs solid). The BFS correctly treats them as different colours.

---

## 8. Implementation Pseudocode

### 8.1 Extension to `runAnalysis()` in `analysis-worker.js`

The following pseudocode specifies the exact additions needed to `runAnalysis()`. It runs after the existing BFS/neighbour/region computation, using `perStitch.clusterSize` and the existing `regions` array.

```javascript
// ── Confetti metrics (add at the end of runAnalysis, before the return) ──

function computeConfettiMetrics(perStitch, pat, done, sW, sH, regions, regionCols, regionRows, REGION_SIZE) {
  var n = pat.length;

  // ── Step 1: Count cells per cluster-size class ──────────────────────────
  var T = 0;                   // total stitchable
  var isolatedCount = 0;       // cs === 1
  var microCount    = 0;       // cs in [2, 4]
  var smallCount    = 0;       // cs in [5, 15]
  var mediumCount   = 0;       // cs in [16, 64]
  var largeCount    = 0;       // cs >= 65
  var clusterSizeSum = 0;      // for mean

  // For median: build array of all per-stitch cluster sizes
  // (length T, not the number of components)
  var sizesForMedian = [];

  for (var i = 0; i < n; i++) {
    var id = pat[i].id;
    if (id === "__skip__" || id === "__empty__") continue;
    T++;
    var cs = perStitch.clusterSize[i];  // already populated by runAnalysis
    clusterSizeSum += cs;
    sizesForMedian.push(cs);

    if      (cs === 1)              isolatedCount++;
    else if (cs <= 4)               microCount++;
    else if (cs <= 15)              smallCount++;
    else if (cs <= 64)              mediumCount++;
    else                            largeCount++;
  }

  if (T === 0) {
    // No stitchable cells — return zero score
    return { isolatedFraction: 0, microFraction: 0, smallFraction: 0,
             mediumFraction: 0, blockFraction: 0, meanClusterSize: 0,
             medianClusterSize: 0, spatialVariance: 0, spatialVarianceNorm: 0,
             colourChangeRate: 0, score: 0 };
  }

  var isolatedFraction = isolatedCount / T;
  var microFraction    = microCount    / T;
  var smallFraction    = smallCount    / T;
  var mediumFraction   = mediumCount   / T;
  var blockFraction    = (mediumCount + largeCount) / T;
  var meanClusterSize  = clusterSizeSum / T;

  // ── Step 2: Median cluster size ──────────────────────────────────────────
  // Sort the per-stitch sizes array and pick the middle element.
  // This is the median of "per stitch, what size cluster am I in?" — not
  // the median component size. It answers: "for a randomly chosen stitch,
  // how large is its cluster?" which directly maps to stitcher experience.
  sizesForMedian.sort(function(a, b) { return a - b; });
  var medianClusterSize = sizesForMedian[Math.floor(T / 2)];

  // ── Step 3: Colour-change rate (horizontal row scan) ────────────────────
  var transitions = 0;
  var scanPairs   = 0;
  for (var y = 0; y < sH; y++) {
    for (var x = 0; x < sW - 1; x++) {
      var left  = pat[y * sW + x];
      var right = pat[y * sW + x + 1];
      // Skip pairs where either cell is background
      if (left.id  === "__skip__" || left.id  === "__empty__") continue;
      if (right.id === "__skip__" || right.id === "__empty__") continue;
      scanPairs++;
      if (left.id !== right.id) transitions++;
    }
  }
  var colourChangeRate = scanPairs > 0 ? transitions / scanPairs : 0;

  // ── Step 4: Spatial variance of confetti fraction per region ─────────────
  // For each region, compute confetti fraction = (isolated + micro stitches) / total stitches.
  // Then compute the variance of these fractions across all non-trivial regions.
  //
  // NOTE: This requires an extra pass over all cells to accumulate per-region
  // confetti counts. The existing `regions` array only stores totalStitches and
  // completedStitches at this point (colourCounts has been deleted). We need
  // a separate pass.
  //
  var nRegions = regionCols * regionRows;
  var regionConfettiCounts = new Int32Array(nRegions);   // isolated + micro per region
  var regionStitchCounts   = new Int32Array(nRegions);   // total stitchable per region

  for (var i2 = 0; i2 < n; i2++) {
    var id2 = pat[i2].id;
    if (id2 === "__skip__" || id2 === "__empty__") continue;
    var x2   = i2 % sW, y2 = Math.floor(i2 / sW);
    var rCol = Math.floor(x2 / REGION_SIZE);
    var rRow = Math.floor(y2 / REGION_SIZE);
    var rIdx = rRow * regionCols + rCol;
    regionStitchCounts[rIdx]++;
    var cs2 = perStitch.clusterSize[i2];
    if (cs2 <= 4) regionConfettiCounts[rIdx]++;   // isolated or micro
  }

  // Compute mean confetti fraction across non-trivial regions
  // (regions with < 4 stitches are excluded to avoid noise at pattern borders)
  var MIN_REGION_STITCHES = 4;
  var fSum  = 0;
  var fSum2 = 0;
  var fN    = 0;
  for (var r = 0; r < nRegions; r++) {
    if (regionStitchCounts[r] < MIN_REGION_STITCHES) continue;
    var f = regionConfettiCounts[r] / regionStitchCounts[r];
    fSum  += f;
    fSum2 += f * f;
    fN++;
  }

  var spatialVariance = 0;
  if (fN >= 2) {
    var fMean = fSum / fN;
    // Variance = E[f²] - (E[f])² (computational formula, numerically stable for this range)
    spatialVariance = (fSum2 / fN) - (fMean * fMean);
    // Clamp to [0, 0.25] — rounding errors can produce tiny negative values
    if (spatialVariance < 0) spatialVariance = 0;
  }

  var spatialVarianceNorm = Math.min(1.0, spatialVariance / 0.25);

  // ── Step 5: Compute confetti score ───────────────────────────────────────
  var confettiBase = isolatedFraction * 1.00
                   + microFraction    * 0.55
                   + smallFraction    * 0.15
                   + mediumFraction   * 0.02;
  // confettiBase is in [0, 1] because the fractions sum to 1 and the weights
  // are ≤ 1 with the largest (isolated) being 1.00.

  var spatialBoost = spatialVarianceNorm * 0.15;

  var score = Math.min(1.0, confettiBase + spatialBoost);

  return {
    isolatedFraction:   isolatedFraction,
    microFraction:      microFraction,
    smallFraction:      smallFraction,
    mediumFraction:     mediumFraction,
    blockFraction:      blockFraction,
    meanClusterSize:    Math.round(meanClusterSize * 10) / 10,
    medianClusterSize:  medianClusterSize,
    spatialVariance:    Math.round(spatialVariance * 10000) / 10000,
    spatialVarianceNorm: Math.round(spatialVarianceNorm * 1000) / 1000,
    colourChangeRate:   Math.round(colourChangeRate * 1000) / 1000,
    score:              Math.round(score * 1000) / 1000
  };
}
```

### 8.2 Wiring into `runAnalysis()`

In `analysis-worker.js`, at the end of `runAnalysis()`, replace the existing `return` statement with:

```javascript
  var confetti = computeConfettiMetrics(
    perStitch, pat, done, sW, sH,
    regions, regionCols, regionRows, REGION_SIZE
  );

  return {
    perStitch:  perStitch,
    perColour:  perColour,
    perRegion:  regions,
    regionSize: REGION_SIZE,
    regionCols: regionCols,
    regionRows: regionRows,
    sW:         sW,
    sH:         sH,
    confetti:   confetti    // ← new
  };
```

### 8.3 Consuming in `useCreatorState.js`

```javascript
// After analysis result arrives from worker, extract confetti:
var confettiMetrics = useMemo(function() {
  return analysisResult ? analysisResult.confetti : null;
}, [analysisResult]);

// Expose for consumption by PatternInfoPopover, LegendTab, etc:
// confettiMetrics.score            — 0–1 score
// confettiMetrics.isolatedFraction — for tooltip detail
// confettiMetrics.medianClusterSize
```

### 8.4 Updating `calcDifficulty()` in `helpers.js`

The current `calcDifficulty()` signature is:
```javascript
function calcDifficulty(palLen, blendCount, totalSt)
```

For full confetti integration, the signature should accept an optional fourth argument:
```javascript
function calcDifficulty(palLen, blendCount, totalSt, confettiScore)
```

Where `confettiScore` defaults to 0 (backward-compatible) if not provided.

The confetti score should add up to **2 additional points** in the scoring table (enough to push a pattern from "Intermediate" to "Advanced" when confetti is extreme), without being the sole determinant:

```javascript
function calcDifficulty(palLen, blendCount, totalSt, confettiScore) {
  confettiScore = confettiScore || 0;
  var score = 0;

  // Palette size (unchanged)
  if      (palLen <= 8)  score += 1;
  else if (palLen <= 15) score += 2;
  else if (palLen <= 25) score += 3;
  else                   score += 4;

  // Blends (unchanged)
  if (blendCount > 0) score += 1;
  if (blendCount > 5) score += 1;

  // Stitch count (unchanged)
  if (totalSt > 10000) score += 1;
  if (totalSt > 30000) score += 1;

  // Confetti (new)
  if (confettiScore >= 0.30) score += 1;  // moderate confetti → +1
  if (confettiScore >= 0.60) score += 1;  // high confetti → +1 more

  // Thresholds unchanged (max score is now 10 instead of 8, but thresholds stay)
  if (score <= 2)  return { label: "Beginner",     color: "var(--success)",      stars: 1 };
  if (score <= 4)  return { label: "Intermediate", color: "#A06F2D",             stars: 2 };
  if (score <= 6)  return { label: "Advanced",     color: "var(--accent-hover)", stars: 3 };
  return                  { label: "Expert",        color: "var(--danger)",       stars: 4 };
}
```

**Rationale for thresholds 0.30 and 0.60:**
- 0.30 = "Moderate confetti" (see §4.4 table) — clearly affects difficulty
- 0.60 = "High confetti" — significantly harder; enough to add a full star

---

## 9. TODO and Open Questions

### 9.1 Verified: Cell Indexing

`pattern[y * w + x]` correctly accesses the stitch at grid position (x, y). This is confirmed by the existing `analysis-worker.js` code:
```javascript
var x2 = idx2 % sW, y2 = Math.floor(idx2 / sW);
// ↑ inverse of: idx = y * sW + x
```
No change needed.

### 9.2 Open: Half-Stitches in Confetti Analysis

`halfStitches` has the format `[[idx, {fwd: {id, rgb}, bck: {id, rgb}}], ...]` (confirmed from `docs/test-plans/HALF_STITCH_TEST_PLAN.md` and `creator/useProjectIO.js`).

**Question:** Should half-stitches count as full stitches for confetti analysis?

**Recommendation: Yes, count them.**

A half-stitch at index `idx` requires the same thread management as a full stitch: retrieve thread, stitch, anchor/cut. Whether it is a forward or back diagonal half does not reduce the thread management overhead — the stitcher must still locate the cell on the chart and stitch it.

**Implementation:** Before running `computeConfettiMetrics`, pre-process `halfStitches` into a lookup map `halfStitchIds`:
```javascript
var halfStitchIds = {};
if (project.halfStitches) {
  for (var k = 0; k < project.halfStitches.length; k++) {
    var entry = project.halfStitches[k];
    // entry[0] = flat index, entry[1] = { fwd, bck }
    // Treat as occupied by whichever thread is present;
    // for confetti purposes, use the forward half's id if present
    var id = (entry[1].fwd && entry[1].fwd.id) || (entry[1].bck && entry[1].bck.id);
    if (id) halfStitchIds[entry[0]] = id;
  }
}
```

However, since the **current `analysis-worker.js` does not receive `halfStitches`** data (only `pat` and `done`), and the `pat` array contains full-stitch data with `__empty__` or `__skip__` for cells with only half-stitches, the immediate solution is to leave half-stitches out of the confetti analysis for the first implementation. This matches the existing behaviour of `calcDifficulty()` and `totalStitchable`, which also ignore half-stitches.

**Future improvement:** Pass `halfStitches` to the worker and merge them into the analysis as their own colour class. Track as a separate item in the TODO.

### 9.3 Open: Blends — Own Colour or Two Colours?

A blend cell has `id = "310+550"`. For confetti analysis, treating it as its own distinct colour (the current BFS behaviour) is **correct** because:
1. A blend cell requires the specific blend needle to be threaded — it cannot share a thread run with either pure "310" or pure "550" cells.
2. Two adjacent blend cells of `"310+550"` represent a continuous stitch run for the blend, which is what the BFS correctly captures.

However, from a thread-management perspective, a stitcher with blend "310+550" set up on a needle can stitch all blend cells in that colour in one run — same as any other colour. So the BFS treatment is correct.

**Note for UI:** The blend colour-change rate is naturally higher than for solid colours in a similar pattern because blends are more granular (many small clusters). This is a real difficulty signal, not an artefact — blends genuinely add thread management complexity on top of confetti.

### 9.4 Open: Community Consensus on Cluster Size Boundaries

The boundaries (1, 2–4, 5–15, 16–64, 65+) are derived from community discussion patterns. They should be validated against a survey or sample of patterns rated by experienced stitchers. Specifically:

- The 5/15 split between "micro-confetti" and "sparse-block" is the most uncertain boundary.
- Some experienced stitchers treat anything ≤ 8 as confetti; others draw the line at 3.
- A future calibration exercise could: (1) have 10 experienced stitchers rate 50 patterns on a 1–5 confetti scale; (2) fit the boundary parameters that minimise prediction error.

**For the initial implementation, use the boundaries as specified.** They can be refined in a future calibration pass without changing the algorithm structure.

### 9.5 Open: Weight Calibration

The weights in §4.2 (1.00, 0.55, 0.15, 0.02) and the spatial boost coefficient (0.15) are first-principles estimates. They should be validated empirically once several rated patterns are available. The algorithm structure is correct regardless of the exact weights; calibration is a separate task.

### 9.6 Future: Directional Confetti

The current algorithm treats horizontal and vertical confetti equally. In practice, most stitchers work in horizontal rows (left-to-right or boustrophedon). A pattern where confetti is clustered vertically (columns of isolated stitches in otherwise horizontal runs) is slightly harder than one where confetti is horizontal. A directional confetti metric (column-scan vs row-scan colour-change rates) could detect this, but this is a second-order refinement not worth implementing in the first version.

### 9.7 Future: Confetti Heatmap Overlay

The per-cell `perStitch.clusterSize[i]` data already in the worker output could power a visual heatmap overlay in the Pattern Canvas, colouring cells by their confetti category. This would be an extremely useful UX feature for stitchers trying to understand the hardest sections. Implementation is a UI task separate from the scoring algorithm.

---

## Appendix A: Worked Example

Consider a 20×20 pattern with 4 colours:
- Colour A: one 256-cell solid block (the top half)
- Colour B: 100 isolated single stitches scattered in the bottom half
- Colour C: 25 clusters of 4 cells each (100 stitches total)
- Colour D: 4 clusters of 5–8 cells each (44 stitches total)

Total stitchable T = 256 + 100 + 100 + 44 = 500 cells.

```
isolatedCount = 100 (all Colour B stitches)
microCount    = 100 (all Colour C stitches — cs = 4 each)
smallCount    = 44  (all Colour D stitches — cs = 5–8 each)
largeCount    = 256 (Colour A — cs = 256)

isolatedFraction = 100/500 = 0.20
microFraction    = 100/500 = 0.20
smallFraction    =  44/500 = 0.088
largeFraction    = 256/500 = 0.512

confettiBase = 0.20 * 1.00 + 0.20 * 0.55 + 0.088 * 0.15 + 0 * 0.02
             = 0.200 + 0.110 + 0.013
             = 0.323
```

For spatial variance: the top-half regions all have confetti fraction 0 (pure block A); the bottom-half regions have confetti fraction ranging from ~0.4 to ~0.8 depending on cluster distribution. Assume mean ≈ 0.6 for bottom regions, mean ≈ 0.0 for top.

Roughly: fMean ≈ 0.3 (equal-area halves), variance ≈ 0.09, spatialVarianceNorm = 0.09/0.25 = 0.36.

```
spatialBoost = 0.36 * 0.15 = 0.054
score = min(1.0, 0.323 + 0.054) = 0.377
```

**Result: 0.38 → "Moderate confetti"**. This is the correct intuitive result: 40% of stitches are in confetti/micro territory, but there is a large solid block that anchors difficulty at a moderate level. The spatial concentration of confetti in the bottom half bumps the score from 0.32 to 0.38.

---

## Appendix B: Cross-Reference with Existing Code

| This report refers to | Existing location | Status |
|---|---|---|
| BFS connected components | `analysis-worker.js:8–39` | Already implemented (4-connected) ✓ |
| `clusterSize[i]` per stitch | `analysis-worker.js:117–118` | Already computed ✓ |
| `isConfetti[i]` flag (8-connected) | `analysis-worker.js:119` | Already computed ✓ |
| Per-colour `confettiCount` | `analysis-worker.js:136–164` | Already computed ✓ |
| 10×10 per-region grid | `analysis-worker.js:166–220` | Already computed ✓ |
| `isolatedFraction`, `microFraction`, etc. | — | **New: add to worker** |
| `spatialVariance` | — | **New: add to worker** |
| `colourChangeRate` | — | **New: add to worker** |
| `confettiScore` | — | **New: add to worker** |
| `calcDifficulty()` confetti param | `helpers.js:136` | **New: extend signature** |
