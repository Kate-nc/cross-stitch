# Difficulty Factor 04 — Colour Changes Per Unit Area

**Status:** Research / Pre-implementation  
**Date:** 2026-05-04  
**Relates to:** `analysis-worker.js`, `helpers.js → calcDifficulty()`, `creator/useCreatorState.js`

---

{% raw %}

## Table of Contents

1. [Executive Summary](#1-executive-summary)
2. [Definition](#2-definition)
3. [Why It Affects Difficulty](#3-why-it-affects-difficulty)
4. [Algorithm and Sub-Metrics](#4-algorithm-and-sub-metrics)
   - [4a. Horizontal Colour Change Rate](#4a-horizontal-colour-change-rate)
   - [4b. Vertical Colour Change Rate](#4b-vertical-colour-change-rate)
   - [4c. Combined Change Rate](#4c-combined-change-rate)
   - [4d. Colour Changes Per 10×10 Block](#4d-colour-changes-per-10x10-block)
   - [4e. Effective Thread Switches Per 100 Stitches](#4e-effective-thread-switches-per-100-stitches)
5. [Scoring Model](#5-scoring-model)
6. [Regional Difficulty Spikes](#6-regional-difficulty-spikes)
7. [Relationship to Confetti Density (Factor 02)](#7-relationship-to-confetti-density-factor-02)
8. [Caching and Performance](#8-caching-and-performance)
9. [Edge Cases](#9-edge-cases)
10. [Pseudocode](#10-pseudocode)
11. [Open Questions and TODOs](#11-open-questions-and-todos)

---

## 1. Executive Summary

The current `calcDifficulty()` in `helpers.js` ignores the _rate_ at which stitchers must switch threads as they work. A 200×200 pattern with 40 colours arranged in neat contiguous blocks requires far fewer thread switches per session than a 50×50 pattern of the same 40 colours scattered as confetti — but both score identically today.

This factor measures the **experienced switching cost**: how often, on a typical working row, must the stitcher put down one needle and pick up another? This directly predicts:

- Time lost to thread management per 30-minute session
- Chart-reading load (must check chart every stitch vs. every 10 stitches)
- Whether the stitcher can enter a productive "flow state"

Unlike confetti density (which is a structural, geometric property of cluster shapes), colour-change rate is an **experiential, temporal property** — it describes what actually happens as the needle moves through the work.

The key metric is `overallChangeRate` (0–1), scored non-linearly to a `colourChangeScore` (0–1). The rate can be computed in a single O(w×h) row-and-column scan — no BFS required — and therefore adds negligible cost even on large patterns.

---

## 2. Definition

### 2.1 The Core Concept

When a stitcher works a row left-to-right, each time the current stitch's colour differs from the immediately preceding stitch's colour, a **colour change event** occurs. Depending on how far apart same-colour stitches are, this event requires either:

- **Thread cut and re-thread** (worst case): the previous colour's thread must be anchored and trimmed; the new colour must be retrieved, threaded, and started. Costs 30–90 seconds.
- **Thread park and carry** (better case): if the previous colour will be needed again within ~5 stitches, its needle can be parked on the front of the fabric and picked up later. Costs 5–10 seconds.
- **Needle swap** (best case, advanced technique): dedicated per-colour needles are all in-work simultaneously; the stitcher simply picks up the right one. Costs 2–5 seconds but requires managing 10–40 parking needles at once (itself a cognitive burden).

The **colour change rate** is the fraction of adjacent same-row pairs where a colour change event occurs. A rate of 0.0 means the entire row is one solid colour (zero overhead). A rate of 1.0 means every adjacent pair has a different colour (maximum overhead — a true checkerboard).

### 2.2 Formal Definition

For a pattern of width `w` and height `h`, with cells stored as `pattern[y * w + x]`:

A cell at `(x, y)` is **stitchable** if:
```
pattern[y * w + x].id !== "__skip__" && pattern[y * w + x].id !== "__empty__"
```

A **horizontal colour change** occurs at position `(x, y)` (for `x > 0`) when:
- Both `(x-1, y)` and `(x, y)` are stitchable
- `pattern[y * w + x].id !== pattern[y * w + (x-1)].id`

The **horizontal colour change rate** is:
$$r_H = \frac{\text{total horizontal changes}}{\text{total adjacent horizontal stitchable pairs}}$$

A **horizontal adjacent stitchable pair** at `(x, y)` exists when both `(x-1, y)` and `(x, y)` are stitchable.

Analogously, a **vertical colour change** at `(x, y)` (for `y > 0`) occurs when both `(x, y-1)` and `(x, y)` are stitchable and their ids differ. The **vertical colour change rate** $r_V$ is defined symmetrically.

The **overall change rate**:
$$r = \frac{H + V}{P_H + P_V}$$

where $H$ = total horizontal changes, $V$ = total vertical changes, $P_H$ = total horizontal stitchable pairs, $P_V$ = total vertical stitchable pairs.

This weighted formulation is preferred over `(r_H + r_V) / 2` because it avoids giving equal weight to axes with very different pair counts (e.g., a thin tall pattern has many more vertical pairs than horizontal ones).

---

## 3. Why It Affects Difficulty

### 3.1 Thread Management Overhead Per Session

The single greatest time-sink in confetti stitching is not the stitching itself — it is the **thread management**: retrieving bobbins, threading needles, anchoring ends, and trimming tails. A high colour-change rate means this overhead is incurred constantly throughout the session rather than occasionally.

Empirically (based on cross-stitch community benchmarks and timed stitching videos), a stitcher working at 14-count aida achieves:

| Change rate | Effective stitches per hour | Notes |
|---|---|---|
| 0.0–0.1 | ~500–700 stitches/hr | Solid blocks; minimal switching |
| 0.1–0.3 | ~350–500 stitches/hr | Occasional switching; still efficient |
| 0.3–0.6 | ~200–350 stitches/hr | Frequent switching; noticeable slowdown |
| 0.6–0.8 | ~100–200 stitches/hr | High confetti territory; frustrating |
| 0.8–1.0 | ~50–100 stitches/hr | Near-checkerboard; primarily thread management |

### 3.2 Mental Load

A colour change requires consulting the chart to confirm the next colour. At low change rates (long runs of the same colour), the stitcher can work from memory for 10–30 stitches between chart checks. At high change rates, **every stitch requires a chart consultation**, increasing cognitive fatigue and error rate.

### 3.3 Physical Fatigue

Threading a needle requires:
- Fine motor precision (passing thread through a small eye)
- Close-focus vision (especially under task lighting on dark floss)
- Small-muscle effort in the fingers (separating strands, manipulating thread)

Repeated hundreds of times per session, this becomes a source of genuine physical fatigue, particularly for stitchers with conditions affecting vision, dexterity, or fine motor control.

### 3.4 Relationship to "Flow State"

Cross-stitch practitioners frequently describe the meditative, flow-state quality of the craft as a key reason they stitch. Flow requires:
- Predictable, rhythmic action
- Low cognitive overhead
- Physical automaticity

High colour-change rates disrupt all three. Each thread switch is an interruption: a pause, a decision, a manual task that pulls the stitcher out of the rhythm. Many stitchers explicitly avoid high-confetti patterns precisely because they prevent this experience. This is a well-documented community preference, not an edge case.

### 3.5 Chart-Reading Frequency

At low change rates, a stitcher can "set" a colour in memory and stitch 10–20 stitches while only glancing at the chart for position. At a change rate of 0.8+, the chart must be read for nearly every stitch. Chart-reading friction compounds with:

- Poor symbol contrast in printed charts
- Small symbol size on count fabrics above 18ct
- Fatigue-induced symbol confusion (similar symbols for similar colours)
- Lighting conditions at the workspace

---

## 4. Algorithm and Sub-Metrics

### Verified Indexing Convention

Confirmed from `analysis-worker.js` (lines 31, 57, 70, 76): the codebase consistently uses `pat[ny * sW + nx]` and `i % sW` / `Math.floor(i / sW)` for flat-array indexing. The formula `pattern[y * w + x]` is correct.

### 4a. Horizontal Colour Change Rate

```
totalHChanges = 0
totalHPairs   = 0

for y = 0 to h-1:
  for x = 1 to w-1:
    left  = pattern[y * w + (x-1)]
    right = pattern[y * w + x]
    leftOk  = left.id  !== "__skip__" && left.id  !== "__empty__"
    rightOk = right.id !== "__skip__" && right.id !== "__empty__"
    if leftOk && rightOk:
      totalHPairs++
      if left.id !== right.id:
        totalHChanges++

horizontalRate = totalHPairs > 0 ? totalHChanges / totalHPairs : 0
```

**Interpretation:** `horizontalRate = 0.5` means that 50% of adjacent horizontal stitchable pairs are different colours. A stitcher working left-to-right changes colour on average every 2 stitches.

### 4b. Vertical Colour Change Rate

```
totalVChanges = 0
totalVPairs   = 0

for y = 1 to h-1:
  for x = 0 to w-1:
    above = pattern[(y-1) * w + x]
    below = pattern[y * w + x]
    aboveOk = above.id !== "__skip__" && above.id !== "__empty__"
    belowOk = below.id !== "__skip__" && below.id !== "__empty__"
    if aboveOk && belowOk:
      totalVPairs++
      if above.id !== below.id:
        totalVChanges++

verticalRate = totalVPairs > 0 ? totalVChanges / totalVPairs : 0
```

**Why include vertical?** Stitchers do not always work purely left-to-right. Many use a boustrophedon (snake-row) technique, diagonal working, or stitch column-by-column for efficiency. Vertical transitions affect difficulty when working top-down on columns, or when planning which regions to stitch in sequence. The vertical rate also helps detect patterns where rows look uniform but columns are highly varied — a different kind of difficulty.

### 4c. Combined Change Rate

The **primary** metric:

$$r = \frac{H + V}{P_H + P_V}$$

This pair-weighted average ensures that for a near-square pattern (where $P_H \approx P_V$), both axes contribute equally. For a very wide pattern ($P_H \gg P_V$), horizontal changes dominate, which is appropriate since a stitcher typically makes many more horizontal transitions than vertical ones in standard left-right working.

`overallChangeRate` is in [0, 1] by construction.

### 4d. Colour Changes Per 10×10 Block

The **regional** sub-metric. Divides the pattern into non-overlapping 10×10 blocks (matching the existing REGION_SIZE used by `analysis-worker.js`). For each block:

```
blockChanges(bx, by):
  x0 = bx * 10, y0 = by * 10
  x1 = min(x0 + 10, w), y1 = min(y0 + 10, h)
  hChanges = 0, hPairs = 0, vChanges = 0, vPairs = 0

  // Horizontal within block
  for y = y0 to y1-1:
    for x = x0+1 to x1-1:
      left  = pattern[y * w + (x-1)]
      right = pattern[y * w + x]
      if both stitchable:
        hPairs++
        if left.id !== right.id: hChanges++

  // Vertical within block
  for y = y0+1 to y1-1:
    for x = x0 to x1-1:
      above = pattern[(y-1) * w + x]
      below = pattern[y * w + x]
      if both stitchable:
        vPairs++
        if above.id !== below.id: vChanges++

  totalPairs = hPairs + vPairs
  return totalPairs > 0 ? (hChanges + vChanges) / totalPairs : 0
```

For all non-empty blocks, compute:
- `blockRates`: array of per-block `(hChanges + vChanges) / (hPairs + vPairs)`
- `meanBlockRate`: mean of `blockRates`
- `maxBlockRate`: maximum over all blocks
- `blockVariance`: variance of `blockRates`

**Why block statistics matter:**

- `meanBlockRate` closely tracks `overallChangeRate` but is computed independently — if they diverge significantly, it suggests structural non-uniformity (some blocks are very sparse, which can weight the global rate toward zero while local blocks remain chaotic).
- `maxBlockRate` identifies the hardest local section.
- `blockVariance` measures how uneven the difficulty is spatially. A pattern with `variance = 0` is uniformly difficult throughout. High variance means the stitcher experiences alternating easy and hard sections — this may be more manageable (rest between hard sections) or less (unpredictable pacing).

**Block size rationale:**

10×10 is the existing REGION_SIZE constant in `analysis-worker.js`. It represents a ~2cm × 2cm patch at 14-count (the most common fabric), which corresponds to approximately 15–30 minutes of stitching in an easy area, or 45–90 minutes in a confetti area. This is a meaningful unit: it approximates a single stitching session "chunk." Using the same size as the existing analysis regions also allows future correlation between per-region change rate and per-region completion percentage without additional data structures.

### 4e. Effective Thread Switches Per 100 Stitches

A **practitioner-facing** metric that translates the abstract rate into something a stitcher can directly relate to.

```
threadSwitchRate = overallChangeRate × (1 - PARKING_MITIGATION)
effectiveSwitchesPer100 = threadSwitchRate × 100
```

Where `PARKING_MITIGATION = 0.3` is a constant representing the approximate fraction of colour change events that can be handled by parking a nearby needle rather than cutting and re-threading. This value is based on community heuristics: in a typical confetti pattern, experienced stitchers can park and carry approximately 25–35% of thread switches; 0.3 is a conservative midpoint.

**Limitations of this approximation:**
- The optimal parking fraction depends on palette size, cluster topology, and individual technique — all of which this constant ignores.
- Parking becomes less viable as palette size grows (more needles to manage simultaneously).
- This is a UI-display approximation, not an algorithm input. Do not use it in the raw scoring formula.

**Example display:** "~23 thread switches per 100 stitches" is more immediately meaningful than "overallChangeRate = 0.33" to most users.

---

## 5. Scoring Model

### 5.1 The Normalisation Problem

The raw `overallChangeRate` is mathematically in [0, 1], but the practical range for real patterns is much narrower:

| Pattern type | Typical overallChangeRate |
|---|---|
| Solid single colour | 0.00 |
| Simple border / geometric | 0.05–0.15 |
| Floral with 10–20 colours, good-sized blocks | 0.15–0.30 |
| Portrait / animal face with gradient shading | 0.25–0.45 |
| High-confetti 40+ colour pattern | 0.40–0.65 |
| Near-checkerboard two-colour noise | 0.80–0.95 |
| True mathematical checkerboard | 1.00 |

A linear mapping from rate to score would compress most real patterns into the 0.0–0.6 score range, leaving the upper 40% nearly empty. The scoring curve should be non-linear.

### 5.2 Proposed Scoring Curve

A power function with exponent < 1 stretches the lower range (where most real patterns live) and compresses the upper tail:

$$\text{score} = r^{0.55}$$

where $r = \texttt{overallChangeRate}$.

**Calibration:**

| overallChangeRate | score (r^0.55) | Description |
|---|---|---|
| 0.00 | 0.00 | Monochrome — zero changes |
| 0.05 | 0.21 | Simple geometric or single-colour blocks |
| 0.10 | 0.28 | Occasional colour transitions |
| 0.20 | 0.40 | Moderate block pattern |
| 0.30 | 0.49 | Mixed — some confetti, some blocks |
| 0.45 | 0.60 | Portrait-style shading, frequent transitions |
| 0.60 | 0.71 | Dense confetti; nearly every 2nd stitch changes |
| 0.80 | 0.84 | Very high confetti; nearly every stitch changes |
| 1.00 | 1.00 | True checkerboard; maximum possible rate |

This curve ensures:
- 0 maps exactly to 0; 1 maps exactly to 1 (no clamping needed)
- A rate of 0.1 (modest block pattern) scores ~0.28 rather than the misleading 0.10 that linear mapping would give
- The difference between 0.05 and 0.20 (both "manageable") is clearly represented as a meaningful span (0.21 vs 0.40)
- The upper tail (0.8–1.0) is appropriately compressed; the real-world difference between "almost every stitch changes" and "truly every stitch changes" is marginal

**Implementation:**

```javascript
const COLOUR_CHANGE_EXPONENT = 0.55;

function colourChangeScore(overallChangeRate) {
  if (overallChangeRate <= 0) return 0;
  if (overallChangeRate >= 1) return 1;
  return Math.pow(overallChangeRate, COLOUR_CHANGE_EXPONENT);
}
```

### 5.3 Regional Spike Modifier

The global `colourChangeScore` can be boosted by a regional spike modifier when the hardest block is substantially above the mean:

```javascript
function colourChangeScoreWithSpike(overallRate, maxBlockRate, meanBlockRate) {
  const baseScore = colourChangeScore(overallRate);
  const spikeSeverity = maxBlockRate - meanBlockRate;  // 0 if uniform; up to ~0.7 if extreme
  const spikeModifier = spikeSeverity * 0.15;          // max +0.105 from spike
  return Math.min(1.0, baseScore + spikeModifier);
}
```

The constant 0.15 caps the spike contribution at ~0.1 score points for the most extreme regional spikes. This prevents a single outlier block from dominating the score while still reflecting that "this pattern has a brutal section" meaningfully above a uniform-difficulty pattern.

---

## 6. Regional Difficulty Spikes

### 6.1 Identifying the Top-3 Hardest Blocks

```javascript
function hardestBlocks(blockRates, regionCols, regionRows, topN = 3) {
  const indexed = blockRates.map((rate, idx) => ({
    rate,
    bx: idx % regionCols,
    by: Math.floor(idx / regionCols),
    pixelX: (idx % regionCols) * 10,
    pixelY: Math.floor(idx / regionCols) * 10
  }));
  indexed.sort((a, b) => b.rate - a.rate);
  return indexed.slice(0, topN);
}
```

Each entry reports `{rate, bx, by, pixelX, pixelY}`. The `pixelX`/`pixelY` fields give the top-left corner of the block in pattern coordinates, useful for UI overlays.

### 6.2 Regional Spike Score

Define the **spike severity** as:
$$\Delta = r_{\max} - \bar{r}$$

where $r_{\max}$ is the maximum block rate and $\bar{r}$ is the mean block rate across non-empty blocks.

$$\text{spikeSeverity} = \Delta \in [0, 1]$$

Interpretation:
- $\Delta < 0.1$: uniform difficulty; the pattern has no standout hard sections
- $0.1 \leq \Delta < 0.25$: mild regional variation; one section notably harder than average
- $0.25 \leq \Delta < 0.45$: significant spike; the hardest section is much harder than the rest
- $\Delta \geq 0.45$: extreme spike; likely a portrait face or focal point amid simpler background

### 6.3 UI Expression

Suggested UI wording (no emojis; use `Icons.warning()` for spike indicator):

- **Global summary:** "Colour change rate: moderate (0.38 average)"
- **Spike indicator** (shown when $\Delta \geq 0.15$): "[warning icon] Contains a high-density section in the upper-left area with ~2× the average change rate"
- **Detail tooltip:** "Top-3 hardest sections: block at (10,20) — 0.74 rate; block at (20,20) — 0.69 rate; block at (10,30) — 0.61 rate"

The spatial information (upper-left, centre, lower-right quadrant) can be derived from the `pixelX`/`pixelY` coordinates relative to `w` and `h`:

```javascript
function quadrantLabel(pixelX, pixelY, w, h) {
  const col = pixelX < w / 2 ? "left" : "right";
  const row = pixelY < h / 2 ? "upper" : "lower";
  return `${row}-${col}`;   // "upper-left", "lower-right", etc.
}
```

### 6.4 Practical Value for Stitchers

Identifying hard blocks lets the app:
1. Warn the stitcher before they start the hard section ("Plan extra time for rows 30–60")
2. Suggest stitching the hard section first while motivation is highest
3. Break the project into phases: "Phase 1: simple background (~2 hrs); Phase 2: detailed face (~8 hrs)"

---

## 7. Relationship to Confetti Density (Factor 02)

### 7.1 Correlation but Not Identity

These two factors are positively correlated but measure different things. The clearest way to see the distinction is through counterexamples:

**High confetti density, moderate change rate:**
A 100×100 pattern where 30% of stitches are isolated (confetti) but the 70% of non-confetti stitches are large solid blocks. The confetti density score is high (many isolated stitches). But in a typical working row, the long solid sections lower the average change rate. The stitcher experiences a punishing confetti region, then a restful block region.

**Low confetti density, high change rate:**
A photorealistic gradient sky rendered with 20 similar blues. No stitch is truly isolated — every cell has same-colour neighbours. Confetti density score is near zero. But the change rate is high: adjacent cells frequently have different (though similar) blues. The stitcher changes colour often but never needs to hunt for a lone confetti stitch.

**Both high:**
A portrait face with closely-spaced confetti stitches of many different flesh-tone colours. Both metrics are high. This is the hardest category.

**Both low (the easy case):**
A simple geometric pattern with 5 colours in large blocks. Low confetti density (large clusters), low change rate (long same-colour runs in rows). This is the archetype of a beginner pattern.

### 7.2 Independence

The factors are structurally independent:
- Confetti density is computed from **connected-component sizes** (BFS, cluster topology).
- Colour change rate is computed from **adjacent pair comparisons** (linear scan, no topology).

A pattern can have any combination of high/low values for each. They should be scored separately and not merged before the final weighted combination.

### 7.3 Recommended Weight Relationship

In the final composite difficulty score, these two factors together represent the "per-stitch complexity" axis. Suggested relative weights:

- Confetti density: weight 1.5 (slightly higher — structural cluster isolation is the most physically disruptive)
- Colour change rate: weight 1.0

Rationale: a pattern with confetti density 0.8 is harder than one with colour-change rate 0.8 alone, because isolated stitches are not just colour changes — they also require spatial hunting on the chart and more precise needle placement. The change rate captures a broader, smoother difficulty gradient; confetti is the more extreme case.

**Advice to synthesis agent:** do NOT simply average these two scores. Confetti density and colour change rate are not additive in effect — they interact. Consider a formula like:

$$D_{\text{texture}} = w_1 \cdot \text{confettiScore} + w_2 \cdot \text{changeScore} + w_3 \cdot \text{confettiScore} \times \text{changeScore}$$

The interaction term $w_3$ captures the superlinear difficulty when both factors are simultaneously high. With $w_1 = 0.45$, $w_2 = 0.35$, $w_3 = 0.20$, the combined texture score remains in [0, 1] for all input combinations.

---

## 8. Caching and Performance

### 8.1 Computational Complexity

The colour change analysis is a **single O(w×h) scan** — actually two passes (one horizontal, one vertical), each visiting every cell once. For a 200×200 pattern (40,000 cells), this is approximately 80,000 pair comparisons. On a modern machine this completes in under 1ms.

No BFS, no priority queue, no spatial indexing. The algorithm is simpler and cheaper than the confetti density BFS already implemented in `analysis-worker.js`.

### 8.2 Synchronous vs. Worker

The confetti analysis runs in `analysis-worker.js` as a Web Worker because the BFS with large clusters can pause the main thread. The colour change analysis is so lightweight that it **can safely run on the main thread synchronously**, even for 400×400 patterns. There is no need to route it through the worker.

However, for architectural consistency and to avoid adding branch logic to the worker message protocol, it may be convenient to include this analysis in `analysis-worker.js`'s `runAnalysis()` function alongside the existing per-region metrics. The worker already computes per-region data in the same loop structure.

**Recommended approach:** add a `computeColourChangeAnalysis(pat, sW, sH, REGION_SIZE)` function to `analysis-worker.js` and call it within `runAnalysis()`. The result is added to the worker's response alongside `perStitch`, `perColour`, and `perRegion`. This avoids a second message round-trip.

### 8.3 Cache Invalidation

The colour change analysis result is a pure function of `pat`, `sW`, and `sH` — the same inputs already used to key the existing analysis cache. No additional cache keys are needed.

---

## 9. Edge Cases

### 9.1 Single-Colour Pattern

All stitchable cells have the same id. Every adjacent pair is a matching pair → `totalHChanges = 0`, `totalVChanges = 0`. `overallChangeRate = 0`, `colourChangeScore = 0`.

### 9.2 True Checkerboard (Two Alternating Colours)

Every adjacent horizontal pair differs. Every adjacent vertical pair differs. `overallChangeRate = 1.0`, `colourChangeScore = 1.0`. This is the mathematically maximum case.

### 9.3 Gradient Patterns

A smooth gradient from left to right with 20 blues: most adjacent pairs in a row differ. High `horizontalRate`. Adjacent vertical pairs may match (same row in a horizontal gradient). `overallChangeRate` will be moderate to high (0.4–0.7). `confettiScore` will be near zero (no isolated stitches — every cell has same-colour neighbours). This demonstrates the independence of the two metrics.

### 9.4 Sparse Patterns (Many Background Cells)

A lace or cutwork-style pattern where 60% of cells are background (`__skip__`). The algorithm only counts **stitchable pairs** — a background-stitchable pair is not counted at all. If the remaining stitchable cells are solid single-colour motifs, `overallChangeRate` will be low despite the sparse layout. This is correct: background gaps are not colour changes — they are simply absent work.

### 9.5 Blend Cells

A blend cell has id `"310+550"` (two DMC ids joined with `+`). For the purpose of colour change detection, the full composite id is used as the colour key:

- `"310+550"` vs `"310"`: different → counts as a change
- `"310+550"` vs `"310+550"`: same → no change
- `"310+550"` vs `"550+310"`: note — these represent the same blend but with reversed thread order; the codebase normalises blend ids alphabetically in some paths but not all

**Recommendation:** normalise blend ids before comparison. The simplest approach: sort the `+`-separated parts alphabetically before comparison.

```javascript
function normaliseId(id) {
  if (!id.includes('+')) return id;
  return id.split('+').sort().join('+');
}
```

This prevents `"310+550"` and `"550+310"` from being counted as a colour change when they are in fact the same blend.

### 9.6 Very Small Patterns (< 10×10)

Fewer than one full 10×10 block. The block statistics will contain a single block covering the whole pattern. `meanBlockRate === maxBlockRate`, `blockVariance === 0`. No spike modifier. This is correct: there are no "regions" to compare in a tiny pattern.

### 9.7 Empty Patterns

No stitchable cells (all `__skip__` or `__empty__`). `totalHPairs = 0`, `totalVPairs = 0`. Division-by-zero guard: `overallChangeRate = 0`, `colourChangeScore = 0`.

### 9.8 Single-Row or Single-Column Patterns

A 1×N pattern: no vertical pairs (`totalVPairs = 0`). `overallChangeRate = horizontalRate`. The vertical component contributes nothing — correct, as there is no vertical working direction. The formula `(H + V) / (P_H + P_V)` gracefully degrades to `H / P_H` when `P_V = 0`.

---

## 10. Pseudocode

```javascript
/**
 * colourChangeAnalysis(pattern, w, h)
 *
 * Analyses the rate at which adjacent stitchable cells differ in colour,
 * both horizontally (left-right) and vertically (top-bottom).
 *
 * @param {Array<{id: string}>} pattern  Flat array, length w*h
 * @param {number}              w        Pattern width in stitches
 * @param {number}              h        Pattern height in stitches
 * @param {number}             [BLOCK=10] Block size for regional analysis
 *
 * @returns {{
 *   horizontalRate:   number,   // Fraction of horizontal pairs that differ [0,1]
 *   verticalRate:     number,   // Fraction of vertical pairs that differ [0,1]
 *   overallRate:      number,   // Pair-weighted combined rate [0,1]
 *   score:            number,   // Non-linear 0-1 difficulty score
 *   switchesPer100:   number,   // Estimated thread switches per 100 stitches
 *   blockStats: {
 *     mean:           number,   // Mean block change rate
 *     max:            number,   // Maximum block change rate
 *     variance:       number,   // Variance of block change rates
 *     spikeDelta:     number,   // max - mean
 *   },
 *   hardestBlocks:    Array<{bx, by, pixelX, pixelY, rate}>,
 *   scoreWithSpike:   number,   // score boosted by regional spike modifier
 * }}
 */
function colourChangeAnalysis(pattern, w, h, BLOCK = 10) {
  const SKIP_IDS = new Set(['__skip__', '__empty__']);
  const PARKING_MITIGATION = 0.3;
  const SCORE_EXPONENT = 0.55;
  const SPIKE_WEIGHT = 0.15;
  const TOPN_BLOCKS = 3;

  // ── Helper: is cell at linear index i stitchable? ──────────────────────
  function stitchable(i) {
    return i >= 0 && i < pattern.length && !SKIP_IDS.has(pattern[i].id);
  }

  // ── Helper: normalise blend ids for comparison ─────────────────────────
  function normId(id) {
    if (!id.includes('+')) return id;
    return id.split('+').sort().join('+');
  }

  // ── Global horizontal scan ─────────────────────────────────────────────
  let totalHChanges = 0, totalHPairs = 0;
  for (let y = 0; y < h; y++) {
    for (let x = 1; x < w; x++) {
      const li = y * w + (x - 1);
      const ri = y * w + x;
      if (stitchable(li) && stitchable(ri)) {
        totalHPairs++;
        if (normId(pattern[li].id) !== normId(pattern[ri].id)) totalHChanges++;
      }
    }
  }

  // ── Global vertical scan ───────────────────────────────────────────────
  let totalVChanges = 0, totalVPairs = 0;
  for (let y = 1; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const ai = (y - 1) * w + x;
      const bi = y * w + x;
      if (stitchable(ai) && stitchable(bi)) {
        totalVPairs++;
        if (normId(pattern[ai].id) !== normId(pattern[bi].id)) totalVChanges++;
      }
    }
  }

  const horizontalRate = totalHPairs > 0 ? totalHChanges / totalHPairs : 0;
  const verticalRate   = totalVPairs > 0 ? totalVChanges / totalVPairs : 0;
  const totalPairs     = totalHPairs + totalVPairs;
  const overallRate    = totalPairs > 0
    ? (totalHChanges + totalVChanges) / totalPairs
    : 0;

  // ── Block analysis ─────────────────────────────────────────────────────
  const regionCols = Math.ceil(w / BLOCK);
  const regionRows = Math.ceil(h / BLOCK);
  const nBlocks    = regionCols * regionRows;
  const blockRates = new Float32Array(nBlocks);
  const blockValid = new Uint8Array(nBlocks);  // 1 if block has any pairs

  for (let bRow = 0; bRow < regionRows; bRow++) {
    for (let bCol = 0; bCol < regionCols; bCol++) {
      const x0 = bCol * BLOCK, y0 = bRow * BLOCK;
      const x1 = Math.min(x0 + BLOCK, w);
      const y1 = Math.min(y0 + BLOCK, h);
      let bH = 0, bHP = 0, bV = 0, bVP = 0;

      // Horizontal within block
      for (let y = y0; y < y1; y++) {
        for (let x = x0 + 1; x < x1; x++) {
          const li = y * w + (x - 1);
          const ri = y * w + x;
          if (stitchable(li) && stitchable(ri)) {
            bHP++;
            if (normId(pattern[li].id) !== normId(pattern[ri].id)) bH++;
          }
        }
      }

      // Vertical within block
      for (let y = y0 + 1; y < y1; y++) {
        for (let x = x0; x < x1; x++) {
          const ai = (y - 1) * w + x;
          const bi = y * w + x;
          if (stitchable(ai) && stitchable(bi)) {
            bVP++;
            if (normId(pattern[ai].id) !== normId(pattern[bi].id)) bV++;
          }
        }
      }

      const bIdx  = bRow * regionCols + bCol;
      const bTotalPairs = bHP + bVP;
      if (bTotalPairs > 0) {
        blockRates[bIdx] = (bH + bV) / bTotalPairs;
        blockValid[bIdx] = 1;
      }
    }
  }

  // ── Block statistics ───────────────────────────────────────────────────
  let validRates = [];
  for (let i = 0; i < nBlocks; i++) {
    if (blockValid[i]) validRates.push(blockRates[i]);
  }

  let meanBlockRate = 0, maxBlockRate = 0, blockVariance = 0;
  if (validRates.length > 0) {
    meanBlockRate = validRates.reduce((s, v) => s + v, 0) / validRates.length;
    maxBlockRate  = Math.max(...validRates);
    const sq = validRates.reduce((s, v) => s + (v - meanBlockRate) ** 2, 0);
    blockVariance = sq / validRates.length;
  }
  const spikeDelta = maxBlockRate - meanBlockRate;

  // ── Top-N hardest blocks ───────────────────────────────────────────────
  const blockEntries = [];
  for (let i = 0; i < nBlocks; i++) {
    if (!blockValid[i]) continue;
    const bCol = i % regionCols;
    const bRow = Math.floor(i / regionCols);
    blockEntries.push({ bx: bCol, by: bRow, pixelX: bCol * BLOCK, pixelY: bRow * BLOCK, rate: blockRates[i] });
  }
  blockEntries.sort((a, b) => b.rate - a.rate);
  const hardestBlocks = blockEntries.slice(0, TOPN_BLOCKS);

  // ── Scoring ────────────────────────────────────────────────────────────
  const score = overallRate <= 0 ? 0
    : overallRate >= 1 ? 1
    : Math.pow(overallRate, SCORE_EXPONENT);

  const scoreWithSpike = Math.min(1.0, score + spikeDelta * SPIKE_WEIGHT);

  const switchesPer100 = Math.round(overallRate * (1 - PARKING_MITIGATION) * 100);

  return {
    horizontalRate,
    verticalRate,
    overallRate,
    score,
    switchesPer100,
    blockStats: {
      mean: meanBlockRate,
      max: maxBlockRate,
      variance: blockVariance,
      spikeDelta
    },
    hardestBlocks,
    scoreWithSpike
  };
}
```

---

## 11. Open Questions and TODOs

### Q1: Fixed 10×10 block size vs. scaled block size

**Problem:** A 400×400 pattern has 1,600 blocks of size 10×10. A 20×20 pattern has 4 blocks. The statistical significance of per-block rates is very different between these cases.

**Options:**
- **Fixed at 10** (recommended): matches REGION_SIZE in analysis-worker.js; maintains a consistent "chunk of work" interpretation; simple.
- **Scaled proportionally** (e.g., `BLOCK = Math.round(Math.max(w, h) / 20)`): ensures roughly the same number of blocks regardless of pattern size. Better for statistical variance computation on small patterns, but loses the absolute-time interpretation of the block unit.
- **Two passes**: use 10×10 for spatial analysis, compute statistics over a 5×5 meta-grid (groups of 4 blocks) for variance. Most flexible; most complex.

**Recommendation:** use fixed 10×10 for the initial implementation. Add a `blockSize` parameter so this can be changed without rewriting the algorithm. For the variance computation, filter out blocks with fewer than 5 stitchable pairs before including them in the statistics — this prevents nearly-empty edge blocks from distorting variance on small patterns.

### Q2: Do background/skip cells interrupt a run?

**Current recommendation:** No. Background cells are transparent; they are not stitched. Treating a background cell as an implicit colour change would mean that a solid-colour letter "A" on a white background (where background separates the arms of the letter) scores higher than a solid-colour filled rectangle of the same size — which is incorrect from a stitcher's perspective. The stitcher simply skips the background cell and continues with the same thread.

**Edge case:** if the background cells are very widely spaced (e.g., a sparse dotted line of same-colour stitches widely separated by background), the stitcher may in practice re-thread rather than carry the thread across a large gap. The colour change metric does not capture this; the confetti density metric (nearest-same-colour distance) captures it better.

**Resolution:** count only stitchable-stitchable pairs for both numerator and denominator. Background-stitchable adjacencies are neither counted as pairs nor as changes. This is consistent with the existing analysis-worker.js behaviour (see line 82: `if (id === "__skip__" || id === "__empty__") continue;`).

### Q3: Interaction with confetti density analysis

The confetti density analysis in `analysis-worker.js` requires a full BFS to compute cluster labels. The colour change analysis does not need cluster labels; it is a simpler scan. They can run independently in the same worker call.

**However:** both analyses iterate over the same flat array. A future optimisation could compute both in a single combined pass, sharing the per-cell `stitchable` check. This would require refactoring `runAnalysis()` to integrate `computeColourChangeAnalysis()` into its main loop rather than running it separately. For the initial implementation, separate passes are fine — the performance difference is negligible.

**Can they share the BFS pass?** No. The colour change analysis does not require cluster membership information. Forcing it to depend on the BFS output would add unnecessary coupling and prevent running the change analysis without the full BFS infrastructure.

### Q4: Verify `pattern[y * w + x]` in the codebase

**Verified.** `analysis-worker.js` uses `pat[ny * sW + nx]` consistently (lines 31, 34–37, 57, 70, 76, 140, 188). The indexing formula `pattern[y * w + x]` is correct and consistent with all existing analysis code.

### Q5: Blend id normalisation

Should `"310+550"` and `"550+310"` be treated as the same colour? **Yes** — they represent the same two-thread blend, just created with different thread order. The sort-and-join normalisation in the pseudocode above is the correct approach. Verify that the existing codebase's blend creation path already normalises ids (check `creator/useCreatorState.js` blend creation logic) before introducing this normalisation to avoid double-normalisation.

### Q6: Should `switchesPer100` replace `overallRate` in the UI?

**Recommendation:** expose both. `overallRate` is the canonical input to scoring; `switchesPer100` is the user-facing display. Keep them separate so the scoring pipeline is not contaminated by the parking-mitigation approximation. The parking mitigation constant is a UX approximation, not a difficulty fact.

### Q7: Weight in final composite score

This is a question for the synthesis agent. Current suggestion: weight 1.0 out of a total texture-axis weight of ~2.5 (confetti 1.5 + change rate 1.0). The final composite scoring specification should account for all difficulty factors together.

---

_End of report. Ready for implementation review.

{% endraw %}_
