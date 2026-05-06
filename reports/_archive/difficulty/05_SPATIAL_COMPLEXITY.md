# Difficulty Factor 05: Spatial Complexity & Symbol Readability
## Research Report for the Cross-Stitch Pattern Difficulty Calculator Redesign

**Author:** Research Agent  
**Date:** 2026-05-04  
**Status:** Specification-complete — ready for implementation  
**Related files:** `constants.js`, `creator/symbolFontSpec.js`, `analysis-worker.js`, `helpers.js` (`calcDifficulty`)

---

{% raw %}

## Executive Summary

Spatial complexity captures how hard the pattern is to **read and navigate**, as opposed to how hard it is to physically stitch. A beginner pattern and an expert pattern can share the same stitching motions, yet differ enormously in how often the stitcher must consult the chart, how easy it is to find a specific cell, and whether the chart symbols can be decoded at a glance.

This factor decomposes into five sub-factors, each independently scoreable from data already in the project object:

| Sub-factor | Key data | Weight |
|---|---|---|
| A. Fabric count / grid density | `settings.fabricCt`, `FABRIC_COUNTS` | 0.25 |
| B. Symbol count & ambiguity | `pal.length` vs 96-glyph spec | 0.25 |
| C. Navigability (large-block vs chaotic) | reuse from confetti analysis | 0.10 |
| D. Backstitch complexity | `bsLines.length` | 0.25 |
| E. Fractional stitch complexity | `Object.keys(halfStitches).length` | 0.15 |

The navigability weight is intentionally low (0.10) because the confetti score (Factor 02) already captures the same fragmentation information. The two factors must not double-count.

---

## 1. Definition — Three Distinct Difficulty Axes

Understanding this factor requires distinguishing three concepts that beginners routinely conflate:

### 1.1 Stitching Difficulty
The physical demands of placing a stitch: pulling thread through fabric, managing strand tension, handling a needle. Driven primarily by fabric count (size of the hole to aim for) and thread type.

### 1.2 Spatial / Navigational Difficulty
The cognitive work of **finding the right cell** before placing the stitch. Driven by:
- How densely packed the fabric grid is.
- Whether the pattern has landmarks (large blocks) to locate oneself relative to, or whether every stitch must be counted from a reference point.
- Whether backstitching requires following line paths across the grid.

### 1.3 Symbol Readability Difficulty
The cognitive work of **decoding which colour belongs in a cell** when reading the chart. Driven by:
- How many symbols must be held in memory simultaneously.
- How visually similar the symbols for different colours are.
- Whether chart printing at standard sizes makes symbols legible.

A pattern can score high on one axis and low on another: a 32-count linen project with a 6-colour geometric design has high stitching difficulty and high navigational difficulty (fine fabric, need to count threads) but very low symbol readability difficulty (only 6 unambiguous symbols to learn). Conversely, a photorealistic portrait on 14-count Aida with 80 colours has moderate stitching difficulty but very high symbol readability difficulty.

---

## 2. Sub-factor A: Fabric Count and Grid Density

### 2.1 FABRIC_COUNTS in `constants.js`

The app exposes the following fabric counts (read directly from `constants.js`):

```js
const FABRIC_COUNTS = [
  { ct:  11, label: "11 count",             inPerSt: 1.27 },
  { ct:  14, label: "14 count",             inPerSt: 1.0  },  // default
  { ct:  16, label: "16 count",             inPerSt: 0.9  },
  { ct:  18, label: "18 count",             inPerSt: 0.8  },
  { ct:  20, label: "20 count",             inPerSt: 0.72 },
  { ct:  22, label: "22 count",             inPerSt: 0.65 },
  { ct:  25, label: "25 count (over 2)",    inPerSt: 1.12 },
  { ct:  28, label: "28 count (over 2)",    inPerSt: 1.0  },
  { ct:  32, label: "32 count (over 2)",    inPerSt: 0.88 },
];
```

The `inPerSt` column is the physical stitch size normalised to 14-count as 1.0. The derivation confirms the over-2 convention:

- **Aida counts (no over-2):** `inPerSt ≈ 14 / ct` — a higher count gives a smaller stitch.
- **Evenweave over 2:** `inPerSt ≈ (14 × 2) / ct` — stitching over 2 threads halves the effective count, so the physical stitch is larger than the raw fabric count implies.

Verification:
- 28ct over 2: `(14×2)/28 = 1.0` → exactly the same physical stitch size as 14-count Aida.
- 32ct over 2: `(14×2)/32 = 0.875 ≈ 0.88` → same physical size as ~16-count Aida.
- 25ct over 2: `(14×2)/25 = 1.12` → *slightly larger* than 14-count Aida.

The default count is **14** (`settings.fabricCt` default in the app). A value not in this list (e.g., 40-count) is not currently a selectable option in the UI — the highest supported count is 32ct over 2.

### 2.2 Two Distinct Difficulty Dimensions

For fabric count, there are **two independent difficulty contributions**:

**A1. Physical cell size** (how small is each stitch on the actual fabric)  
→ Directly captured by `inPerSt`. Smaller `inPerSt` = harder to see and aim for the holes.

**A2. Over-2 navigation penalty** (must find the correct 2×2 thread intersection)  
→ Applies whenever the label contains "over 2". Even if the physical stitch size is identical to a standard count (e.g., 28ct over 2 = 14ct Aida physically), the stitcher must identify both entry and exit points within a finer grid of threads. A 14-count Aida has pre-woven holes that are visually obvious; 28-count evenweave has 28 threads per inch with no pre-formed holes, and each stitch spans a pair of thread intersections that must be located by counting.

### 2.3 Fabric Score Formula

```
fabricScore(ct):
  1. Look up inPerSt from FABRIC_COUNTS table.
     If ct not in table, use inPerSt = 14/ct (clamped to [0.4, 1.4]).
  2. isOver2 = label includes "(over 2)".

  // Cell-size component: inverted inPerSt, normalised to [0,1]
  // inPerSt range in the app: [0.65, 1.27]
  // Clamp to [0.5, 1.3] to handle out-of-table values.
  cellSizeScore = clamp((1.3 - inPerSt) / (1.3 - 0.5), 0, 1)
  // → 0.0 at inPerSt=1.3 (11ct, very easy)
  // → 0.0 at inPerSt=1.27 (11ct maps to ~0.04 ≈ 0)
  // → 0.0 at inPerSt=1.12 (25ct/2)
  // → 0.0 at inPerSt=1.0  (14ct, inPerSt=1.0 → score = 0.375) — WRONG
```

Wait — the intent is that **14-count = 0 difficulty on the fabric axis** (it is the standard, forgiving baseline). Adjust:

```
fabricScore(ct):
  inPerSt = lookup from table, or clamp(14/ct, 0.4, 1.4)
  isOver2 = label includes "(over 2)"

  // Cell-size component: 0 at inPerSt=1.0 (14ct baseline), 1.0 at inPerSt=0.5
  // For counts LARGER than 14ct (11ct, 25ct/2), score stays at 0 — no difficulty penalty.
  rawCellScore = clamp((1.0 - inPerSt) / (1.0 - 0.5), 0, 1)
  // → 0.0  at inPerSt ≥ 1.0 (11ct=0, 14ct=0, 25ct/2=0, 28ct/2=0)
  // → 0.25 at inPerSt = 0.875 (32ct/2 → same physical size as ~16ct)
  // → 0.40 at inPerSt = 0.80  (18ct)
  // → 0.70 at inPerSt = 0.65  (22ct)

  // Over-2 navigation penalty: flat +0.10 for any "over 2" fabric.
  over2Penalty = isOver2 ? 0.10 : 0.0

  fabricScore = clamp(rawCellScore + over2Penalty, 0, 1)
```

Resulting scores for the supported fabric counts:

| Fabric | ct | inPerSt | rawCellScore | over2Penalty | fabricScore |
|---|---|---|---|---|---|
| 11 count | 11 | 1.27 | 0.00 | 0 | **0.00** |
| 14 count | 14 | 1.00 | 0.00 | 0 | **0.00** |
| 16 count | 16 | 0.90 | 0.20 | 0 | **0.20** |
| 18 count | 18 | 0.80 | 0.40 | 0 | **0.40** |
| 20 count | 20 | 0.72 | 0.56 | 0 | **0.56** |
| 22 count | 22 | 0.65 | 0.70 | 0 | **0.70** |
| 25 count (over 2) | 25 | 1.12 | 0.00 | 0.10 | **0.10** |
| 28 count (over 2) | 28 | 1.00 | 0.00 | 0.10 | **0.10** |
| 32 count (over 2) | 32 | 0.88 | 0.24 | 0.10 | **0.34** |

These scores align well with practical experience: 22-count non-over-2 is the hardest supported fabric (0.70), 28-count over 2 is identical in physical stitch size to 14-count but adds a small over-2 navigation penalty (0.10), and 32-count over 2 sits between the two at 0.34.

### 2.4 Symbol Readability vs Fabric Count

For **symbol readability** specifically, the relevant question is: how small are the cells on a **printed chart** (not the physical fabric)?

Charts are printed at a fixed density (typically 10 squares/inch for 14-count charts). The chart cell size does not change based on fabric count — the chart always shows the same grid, just labelled differently. Therefore **symbol readability does not depend on `fabricCt`**; it depends only on `pal.length` (see Sub-factor B).

The fabric score captures the physical stitching and navigation difficulty that comes from working on small-scale fabric, not chart-reading difficulty.

---

## 3. Sub-factor B: Symbol Count and Symbol Ambiguity

### 3.1 The Symbol Font Specification

`creator/symbolFontSpec.js` defines exactly **96 glyphs** in 6 families of 16, assigned to Unicode PUA codepoints U+E000–U+E05F. The spec validates this count with a hard assertion:

```js
if (glyphs.length !== 96) {
  throw new Error("symbolFontSpec: expected 96 glyphs, got " + glyphs.length);
}
```

Assignment is **frequency-ordered**: the most-used palette colour in a pattern gets U+E000, the second-most-used gets U+E001, and so on. This is the right strategy — the most visually distinct symbols go to the most common colours, where chart-reading speed matters most.

### 3.2 Glyph Families and Distinctiveness Analysis

The six families, with distinctiveness notes at typical chart print sizes (~8pt):

#### Family 0 (slots 1–16): Filled solid shapes
Square, 4 directional triangles, diamond, circle, hexagon, inset square, vertical bar, horizontal bar, 5-point star, heart, parallelogram, trapezoid, kite.

**Genuinely distinct from other families:** Yes — filled opaque shapes stand out clearly from outlines and from pip patterns.

**Confusable pairs within family:**
- `tri.up` / `tri.dn` / `tri.lt` / `tri.rt` — all filled triangles, only orientation differs. At 8pt these are 4–5 pixels tall and orientation differences require scrutiny.
- `bar.v` / `bar.h` — 90° rotation of the same bar shape.
- `para.fill` / `trap` — both are filled quadrilaterals with slanted sides; very similar at small sizes.

**Realistically distinct after accounting for confusable pairs:** ~10–11 of 16.

#### Family 1 (slots 17–32): Outline shapes
Outline versions of geometric shapes (square, circle, triangles, diamond, hexagon, parallelogram, trapezoid) plus thin-stroke variants and compound forms (nested rings, double rings, ring+dot, square+dot, diamond+dot).

**Confusable groups within family:**
- `sq.line` / `sq.line.thin` / `sq.nested` / `sq.line.dot` — all square outlines differentiated only by stroke weight and a small interior detail. **At 8pt on a chart, stroke weight differences are near-invisible.**
- `circ.ring` / `circ.ring.thin` / `circ.nested` / `circ.dring` / `circ.ring.dot` — five circle variants differentiated by stroke weight, inner dot, or concentric ring. Highly confusable at small print size.
- `tri.up.line` / `tri.dn.line` — orientation-only variants of the same outline triangle.

**Realistically distinct after accounting for confusable groups:** ~7–9 of 16.

#### Family 2 (slots 33–48): Dot / pip patterns
Arrangements of small dots: 1-centre, 2-horizontal, 2-vertical, 2-diagonal×2, 3-horizontal, 3-vertical, 4-corner, 4-edge, 5, 6, 9, dot+ring, dot-pair+ring, mixed-sizes, ring-of-8.

**Confusable pairs within family:**
- `pip.2h` / `pip.2v` — 2 dots, horizontal vs vertical. Orientation-only.
- `pip.2d1` / `pip.2d2` — 2 dots, two diagonal orientations.
- `pip.3h` / `pip.3v` — 3 dots, horizontal vs vertical.
- `pip.ring` / `pip.2v.ring` — both have a ring; the interior differs only in dot count/position.

Family 2 is more distinguishable from Families 0 and 1 (dots look nothing like filled shapes) but internally has significant confusion potential. **Realistically distinct from prior families, but ~7–9 of 16 are distinct within the family.**

#### Family 3 (slots 49–64): Cross / plus / x marks
Plus (3 weights), X (3 weights), plus+box, x+box, plus+circle, x+circle, asterisk (2 weights), T, inverted-T, H, I.

**Confusable groups:**
- `plus` / `plus.fat` / `plus.thin` — three stroke weights of the same plus shape. At small sizes these will merge visually or be misidentified.
- `x` / `x.fat` / `x.thin` — same issue.
- `ast` / `ast.thin` — asterisk weight variants.
- `T` / `T.inv` — upside-down T; orientation-only, both look like a bar with a stub.
- `H` / `I` — both are symmetric vertical/horizontal bar combos; at 8pt these will frequently be confused.

**Realistically distinct from prior families:** Yes (crossing lines are visually distinct from dots and outlines). **Distinct within family:** ~7–8 of 16.

#### Family 4 (slots 65–80): Bars and chevrons
Stripes (top/bottom/left/right), diagonal slash/backslash, chevrons (4 directions), double-stripe pairs (horizontal/vertical), triple bars (horizontal/vertical), zig-zag, double-slash.

**Confusable groups:**
- `stripe.top` / `stripe.bot` — horizontal band, upper vs lower half. Easily confused.
- `stripe.lt` / `stripe.rt` — vertical band, left vs right.
- `chev.up` / `chev.dn` / `chev.lt` / `chev.rt` — same V-shape, 4 orientations.
- `stripe.2h` / `stripe.2v` — two-stripe patterns; only orientation differs.
- `stripe.3h` / `stripe.3v` — three-bar patterns; only orientation.
- `slash` / `bslash` — diagonal lines, different direction.

Family 4 is highly orientation-dependent. Stitchers working with a chart under artificial light at varying angles will frequently misread orientation-only distinctions. **Distinctiveness within family is poor: ~6–7 of 16 are reliably distinct.**

#### Family 5 (slots 81–96): Compound / quartered shapes
Quartered squares (2 arrangements), halved rectangles (4 directions), diagonal half-triangles (4 corners), square+inner ring, circle+cross, diamond+dot, triangle+dot, split squares (2 orientations).

**Confusable groups:**
- `halfdiag.tl` / `halfdiag.tr` / `halfdiag.bl` / `halfdiag.br` — identical shape (right-angle triangle), 4 corner orientations. These are arguably the hardest symbols to distinguish at any size.
- `half.t` / `half.b` / `half.l` / `half.r` — half-rectangles, 4 orientations.
- `split.tb` / `split.lr` — orientation-only.
- `quart.tlbr` / `quart.trbl` — both "checkerboard" halves; diagonally opposite arrangement.

**Family 5 is the hardest family to read.** ~5–6 of 16 are reliably distinct.

### 3.3 Cumulative Distinctiveness Summary

| Symbol range | Family | Cumulative reliable-distinct count | Notes |
|---|---|---|---|
| 1–16 | Filled solids | ~11 | 5 confusable from orientation/similar-shape pairs |
| 17–32 | Outlines | ~18–20 | Stroke-weight variants very confusable |
| 33–48 | Pip patterns | ~25–28 | Good inter-family distinction; intra-family pairs confusable |
| 49–64 | Crosses | ~32–36 | Weight variants and T/H/I confusable |
| 65–80 | Bars/chevrons | ~38–44 | Heavily orientation-dependent; poor intra-family distinction |
| 81–96 | Quartered/compound | ~43–50 | Worst family; orientation-only distinctions dominant |

The practical consequence: the app can reliably support about **40–50 unambiguous symbols** in a printed chart at standard resolution. Beyond that, symbols start overlapping in visual space and chart errors multiply.

### 3.4 Symbol Score Formula

The score should be 0 for small palettes, growing non-linearly because the marginal symbol becomes harder to distinguish as the total count grows:

```
symbolScore(palLength):
  // Piecewise linear through empirical thresholds:
  if palLength <= 8:    return 0.0   // trivial — all from distinct Family-0 shapes
  if palLength <= 16:   return lerp(0.0, 0.15, (palLength - 8) / 8)
  // → up to 0.15 at 16 symbols (end of Family 0; minor orientation confusable pairs)

  if palLength <= 30:   return lerp(0.15, 0.40, (palLength - 16) / 14)
  // → up to 0.40 at 30 symbols (mid Family 2; pip patterns distinguishable but intra-family pairs)

  if palLength <= 50:   return lerp(0.40, 0.70, (palLength - 30) / 20)
  // → up to 0.70 at 50 symbols (mid Family 3 into Family 4; weight variants; chevron orientation)

  if palLength <= 70:   return lerp(0.70, 0.88, (palLength - 50) / 20)
  // → up to 0.88 at 70 symbols (Family 4 exhausted; Family 5 started)

  return lerp(0.88, 1.0, clamp((palLength - 70) / 26, 0, 1))
  // → 1.0 at 96 symbols (all families used; maximum confusion)
```

The breakpoints at 8, 16, 30, 50, 70 correspond to empirical distinctiveness cliff-edges in the symbol families:
- **8:** All symbols from the first half of Family 0 — square, 4 triangles, diamond, circle, hexagon. Unambiguous.
- **16:** End of Family 0. Some confusable pairs have been assigned by now.
- **30:** Most of Family 2 (pip patterns). Good inter-family distinction but intra-family pairs are moderate confusion risk.
- **50:** Into Family 4. Orientation-only variants now dominate, significantly raising error rate.
- **70:** Family 5 beginning. Worst symbols.
- **96:** All symbols assigned.

### 3.5 Practical Implication for Chart Design

The app currently displays symbols by frequency. A 60-colour pattern would use symbols up through most of Family 4 (bars and chevrons). Family 4's orientation-only distinctions (`stripe.top` vs `stripe.bot`, four chevron directions) are genuinely difficult to read in a printed chart. This is worth surfacing in the UI ("This pattern uses 60 symbols — some may look similar on a printed chart").

---

## 4. Sub-factor C: Navigability (Large Block vs. Chaotic Structure)

### 4.1 Why Navigability Matters

In a pattern with large contiguous colour blocks, a stitcher navigates by reference to regions: "I'm stitching the dark blue sky; I can see I'm about 10 stitches above the horizon line." This qualitative landmark-based navigation is low-effort and highly reliable.

In a chaotic pattern (many small regions), every single stitch requires either:
1. Counting from a known reference point (a corner, the centre cross, a colour boundary).
2. Consulting the chart for every cell and translating the chart grid position to the fabric.

Counting errors compound: a single miscounted row at position 50 means all subsequent stitches in that column are wrong.

### 4.2 Relationship to Confetti Analysis (Factor 02)

The confetti analysis in `analysis-worker.js` already computes:
- `perStitch.clusterSize[i]` — the 4-connected component size for each stitch.
- `clusterSizes` — an array of all component sizes.
- `perColour[id].largestClusterSize` — the largest cluster for each colour.

The **navigability score** is essentially the complement of the confetti score: a pattern dominated by large clusters is easy to navigate and low on confetti; a pattern dominated by isolated/micro stitches is hard to navigate and high on confetti.

**Recommendation: do not compute a separate navigability score.** Instead, define the navigability component as:

```
navigabilityScore = 1.0 - largeBlockFraction
```

where `largeBlockFraction` is the fraction of stitchable cells in clusters of size ≥ 65 (the "Large block" threshold from the confetti taxonomy). This metric is already computable from the cluster data the worker produces.

If the confetti score (Factor 02) is already a first-class factor in the composite difficulty, the navigability weight here must be low (0.10) to avoid double-counting. The confetti factor covers isolated/micro stitches directly; this navigability sub-factor adds only the marginal information about whether large landmark blocks exist.

### 4.3 Landmark Regions

An additional refinement (optional): a pattern that has at least one large colour block near its centre or along a border provides a "home base" for counting. The worker's per-colour bounding boxes could identify such anchors:

```
hasLandmark = any colour where:
  largestClusterSize >= 100  AND
  boundingBox centre is within 25% of pattern centre (Manhattan distance)
```

If `hasLandmark` is true, apply a small navigability bonus (reduce navigabilityScore by 0.10, floor 0). This is optional and can be deferred to Phase 2.

### 4.4 Navigability Score Formula

```
navigabilityScore(analysisData, totalStitchable):
  // analysisData is the output of runAnalysis() from analysis-worker.js
  stitchesInLargeBlocks = sum over all clusters where clusterSize >= 65 of clusterSize
  largeBlockFraction = stitchesInLargeBlocks / totalStitchable
  navigabilityScore = clamp(1.0 - largeBlockFraction, 0, 1)
  // 0.0 = everything is in large blocks (easy to navigate)
  // 1.0 = nothing is in large blocks (very hard to navigate)

  // Optional: landmark bonus
  if hasLandmark(analysisData): navigabilityScore = max(0, navigabilityScore - 0.10)

  return navigabilityScore
```

**Note:** if confetti analysis data is not available (e.g., called from a context without the worker), fall back to estimating from palette size and stitch count, or simply return 0.5.

---

## 5. Sub-factor D: Backstitch Complexity

### 5.1 What Backstitch Requires

In cross-stitch, all stitches are placed at grid intersections on the fabric. A stitcher builds up automatic muscle memory for finding the next hole: "up through this hole, down through the hole two to the right."

Backstitch breaks this rhythm. A backstitch segment is a straight line between two points on the fabric — it follows the chart but **the points may not be at the familiar cross-stitch intersections**. A diagonal backstitch, for example, requires finding a hole between the cross-stitch grid holes. A corner backstitch at half-stitch positions requires precision insertion that is physically different from placing a cross-stitch.

Backstitching also requires maintaining a separate thread for each outline colour, which adds to the already-managed multi-needle workspace.

### 5.2 Available Data

The project object stores `bsLines` as an array of segments `{x1, y1, x2, y2, color}`. Each element is one straight backstitch stroke.

**What `bsLines.length` captures:** The raw count of distinct line segments. A 200-segment outline means 200 individual needle placements in addition to all the cross-stitch placements.

**What `bsLines.length` does not capture:**
- Whether segments are axis-aligned (easier: standard grid holes) vs diagonal (harder: between-grid holes).
- Whether all segments share one colour or span many colours (many backstitch colours = more needle management overhead).
- How densely the backstitch covers the pattern area.

### 5.3 Backstitch Complexity Metrics

**Primary metric — ratio of backstitch segments to stitchable cells:**

```
bsRatio = bsLines.length / totalStitchable
```

This normalises for pattern size. A 50×50 pattern with 200 backstitch segments has a higher effective backstitch density than a 200×200 pattern with the same 200 segments.

**Secondary metric — diagonal backstitch fraction:**

A segment is diagonal if `Math.abs(x2-x1) !== 0 && Math.abs(y2-y1) !== 0` (i.e., it is not purely horizontal or vertical). Diagonal backstitch is harder because it requires hitting fabric holes that fall between the cross-stitch grid intersections. On Aida fabric (rigid structure), this is noticeably more difficult.

```
diagonalFraction = segments where (|dx| > 0 && |dy| > 0) / total segments
```

**Tertiary metric — unique backstitch colours:**

```
bsColourCount = new Set(bsLines.map(s => s.color)).size
```

Multiple backstitch colours multiply the thread-management overhead: the stitcher must manage separate needles or re-thread for each colour.

### 5.4 Backstitch Score Formula

```
backstitch_score(bsLines, totalStitchable):
  if bsLines.length === 0: return 0.0   // no penalty

  bsRatio = bsLines.length / totalStitchable

  // Base score from ratio
  // Thresholds:
  //   bsRatio < 0.02: minimal backstitch (just a few outlines)
  //   bsRatio 0.02–0.10: moderate backstitch
  //   bsRatio 0.10–0.25: heavy backstitch
  //   bsRatio > 0.25: very dense backstitch (uncommon — this many segments typically means
  //                   detailed internal outlining of every sub-element)
  baseScore = piecewiseLerp(bsRatio,
    [[0.0, 0.0], [0.02, 0.15], [0.10, 0.45], [0.25, 0.75], [0.50, 1.0]])

  // Diagonal penalty: up to +0.10 for fully diagonal backstitch
  diagonalFraction = diagonal segments / bsLines.length
  diagPenalty = diagonalFraction * 0.10

  // Multi-colour penalty: up to +0.10 for many backstitch colours
  bsColours = Set(bsLines.map(s => s.color)).size
  colourPenalty = clamp((bsColours - 1) / 5, 0, 1) * 0.10
  // 0.0 at 1 colour, 0.10 at 6+ colours

  return clamp(baseScore + diagPenalty + colourPenalty, 0, 1)
```

**Rationale for 0.25 weight:** Backstitch is not simply "another colour to stitch." It is a categorically different technique (running stitch backward vs cross-stitch), requires precise diagonal needle placement, and is typically added last when the fabric is already crowded with completed cross-stitches. Dense backstitch on a complex pattern is genuinely challenging even for experienced stitchers — and a pattern with 0 backstitch gets a full 0.25 of difficulty removed from its score.

### 5.5 Edge Cases

- `bsLines = []` → score = 0.0. No penalty. This is correct — absence of backstitch is not a difficulty contribution.
- `bsLines` undefined → treat as empty array. The project format guarantees `bsLines` exists (set to `[]` if not used), but defensive coding is warranted.
- Very short backstitch arrays (1–3 segments): likely just a border or a few accent lines. The `bsRatio` for these will be near zero on any non-trivial pattern, so the score will remain appropriately low.

---

## 6. Sub-factor E: Fractional Stitch Complexity

### 6.1 Types of Fractional Stitches

Cross-stitch patterns may include:
- **Half-stitches:** A single diagonal leg of a cross-stitch (either `\` or `/` direction).
- **Three-quarter stitches:** One full diagonal + one short leg to the centre hole.
- **Quarter stitches:** A single short leg from a corner to the centre hole.

All fractional types require inserting the needle at the **centre point** of a fabric square — the point between four grid holes on Aida, or at a specific thread intersection on evenweave. On Aida specifically, this requires piercing the woven fabric block rather than going through a pre-formed hole, which demands a sharp needle and more force.

The project object stores fractional stitches in `halfStitches` (object keyed by cell position string). The `PARTIAL_STITCH_TYPES` constant in `constants.js` confirms the three types: `["quarter", "half", "three-quarter"]`.

### 6.2 Available Data

```js
halfStitchCount = Object.keys(halfStitches).length
halfStitchRatio  = halfStitchCount / totalStitchable
```

The `halfStitches` object maps cell keys to stitch-type data. The count of keys represents the number of cells that contain at least one fractional stitch (a cell could in theory contain multiple fractional stitch types — a quarter stitch plus a three-quarter stitch).

**Note:** The app does not currently distinguish quarter vs three-quarter vs half-stitch difficulty in `halfStitches` — all three types require the same centre-point needle placement. A future refinement could weight three-quarter stitches higher (they require two distinct insertions per cell), but this is a minor distinction.

### 6.3 Fractional Stitch Score Formula

```
fractionalScore(halfStitches, totalStitchable):
  if Object.keys(halfStitches).length === 0: return 0.0

  halfStitchRatio = Object.keys(halfStitches).length / totalStitchable

  // Piecewise linear:
  //   ratio < 0.01: incidental (rounded corners only)
  //   ratio 0.01–0.05: light use (smoothed curves, rounded corners)
  //   ratio 0.05–0.15: moderate use (significant curve work, e.g., portrait or floral)
  //   ratio 0.15–0.30: heavy use (most curves, detailed blending)
  //   ratio > 0.30: extreme (nearly as many fractional stitches as full stitches)
  return piecewiseLerp(halfStitchRatio,
    [[0.0, 0.0], [0.01, 0.05], [0.05, 0.25], [0.15, 0.55], [0.30, 0.80], [0.50, 1.0]])
```

**Rationale for 0.15 weight:** Fractional stitches add real technique overhead (fabric-piercing, managing smaller stitch coverage), but they are a localised challenge — a pattern that is otherwise simple with a few fractional stitches along curved edges is not globally hard. The moderate weight reflects that fractional stitches matter but do not dominate the overall pattern difficulty in the way backstitch or fabric count can.

### 6.4 Note on French Knots and Beading

The current project format does not appear to include French knots or beading as first-class stitch types (they are not in `PARTIAL_STITCH_TYPES`, and there is no `frenchKnots` or `beads` field in the v8 project schema). If these are ever added:

- **French knots** should be treated similarly to fractional stitches (same centre-of-cell placement challenge, plus thread-wrapping technique).
- **Beading** is a distinct skill (applying a bead with a beading needle) but occupies the same position in the pattern grid. It would warrant its own sub-factor or an extended fractional stitch score.

For now: the `halfStitches` count provides a complete picture of all supported fractional stitch types.

---

## 7. Combined Spatial Complexity Score

### 7.1 Weights Justification

| Sub-factor | Weight | Justification |
|---|---|---|
| fabricScore | **0.25** | Fabric count has a strong multiplying effect: even a simple design becomes hard on 22-count non-over-2 fabric. This affects all stitches equally throughout the project, making it a foundational difficulty contributor. |
| symbolScore | **0.25** | Symbol readability is a persistent tax on every chart consultation. A 60-colour pattern requires the stitcher to distinguish among 60 symbols every time they check the chart — which may be thousands of times. Equal weight to fabric count is appropriate because both affect the full project duration. |
| navigabilityScore | **0.10** | Low weight because the confetti score (Factor 02) already captures fragmented spatial structure. This sub-factor captures only the marginal additional difficulty of having no large landmark blocks, not the full confetti burden. |
| backstitch_score | **0.25** | Backstitch is a categorically different technique. Dense or diagonal backstitch on a complex background adds a qualitatively different challenge, not just "more stitches." Equal weight to fabric and symbol is appropriate. |
| fractionalScore | **0.15** | Fractional stitches matter but are typically localised to edge-softening and curve details. They do not pervade the whole pattern the way fabric count or symbol count do. Moderate weight is appropriate. |

Total weights: 0.25 + 0.25 + 0.10 + 0.25 + 0.15 = **1.00**

### 7.2 Function Signature and Return Value

```js
/**
 * Compute the spatial complexity score for a pattern.
 *
 * @param {Array}  pal           - Palette array (one entry per unique colour/blend).
 * @param {Array}  bsLines       - Backstitch segments [{x1,y1,x2,y2,color}].
 * @param {Object} halfStitches  - Object keyed by cell-position string → stitch data.
 * @param {Object} settings      - Project settings object. Uses settings.fabricCt.
 * @param {number} totalStitchable - Count of non-skip/non-empty cells.
 * @param {Object|null} analysisData - Output of analysis-worker runAnalysis(), or null.
 *
 * @returns {{
 *   score: number,          // 0–1 composite spatial complexity
 *   breakdown: {
 *     fabricScore:      number,  // 0–1 sub-score A
 *     symbolScore:      number,  // 0–1 sub-score B
 *     navigabilityScore:number,  // 0–1 sub-score C
 *     backstitch_score: number,  // 0–1 sub-score D
 *     fractionalScore:  number,  // 0–1 sub-score E
 *   }
 * }}
 */
function spatialComplexityScore(pal, bsLines, halfStitches, settings, totalStitchable, analysisData) {
  const ct      = (settings && settings.fabricCt) || 14;
  const bsArr   = bsLines || [];
  const hsObj   = halfStitches || {};
  const palLen  = (pal || []).length;

  const fabricScore       = computeFabricScore(ct);
  const symbolScore       = computeSymbolScore(palLen);
  const navigabilityScore = computeNavigabilityScore(analysisData, totalStitchable);
  const backstitch_score  = computeBackstitchScore(bsArr, totalStitchable);
  const fractionalScore   = computeFractionalScore(hsObj, totalStitchable);

  const score =
    0.25 * fabricScore +
    0.25 * symbolScore +
    0.10 * navigabilityScore +
    0.25 * backstitch_score +
    0.15 * fractionalScore;

  return {
    score: Math.min(1, Math.max(0, score)),
    breakdown: { fabricScore, symbolScore, navigabilityScore, backstitch_score, fractionalScore }
  };
}
```

### 7.3 Score Interpretation

| Combined score | Interpretation |
|---|---|
| 0.00–0.10 | Very easy — standard fabric, few symbols, no backstitch, no fractional stitches |
| 0.11–0.25 | Moderate — typical patterns with 20–40 colours, some backstitch, standard fabric |
| 0.26–0.50 | Hard — either high fabric count, many symbols, or significant backstitch |
| 0.51–0.75 | Very hard — multiple contributing factors at high levels |
| 0.76–1.00 | Expert — extreme combination: high-count fabric + 50+ symbols + dense backstitch + fractional stitches |

---

## 8. Illustrative Score Examples

### Example A: Beginner sampler
- 14ct Aida, 8 colours, no backstitch, no fractional stitches, large blocks.
- fabricScore=0.00, symbolScore=0.0, navigabilityScore≈0.05 (mostly large blocks), backstitch_score=0.00, fractionalScore=0.00
- **Combined: ≈ 0.005 → Easy**

### Example B: Intermediate floral
- 14ct Aida, 25 colours, light backstitch (bsRatio≈0.02), some fractional stitches (ratio≈0.03), moderate fragmentation.
- fabricScore=0.00, symbolScore=0.22, navigabilityScore≈0.30, backstitch_score=0.15, fractionalScore=0.10
- **Combined: 0.25×0 + 0.25×0.22 + 0.10×0.30 + 0.25×0.15 + 0.15×0.10 ≈ 0.12 → Moderate**

### Example C: Portrait on 18-count
- 18ct Aida, 50 colours, moderate backstitch (bsRatio≈0.08), many fractional stitches (ratio≈0.12), high fragmentation.
- fabricScore=0.40, symbolScore=0.55, navigabilityScore≈0.75, backstitch_score=0.40, fractionalScore=0.40
- **Combined: 0.25×0.40 + 0.25×0.55 + 0.10×0.75 + 0.25×0.40 + 0.15×0.40 ≈ 0.47 → Hard**

### Example D: Fine art 22-count non-over-2
- 22ct Aida (non-over-2), 70 colours, heavy backstitch (bsRatio≈0.20, 40% diagonal), heavy fractional stitches (ratio≈0.25), chaotic structure.
- fabricScore=0.70, symbolScore=0.82, navigabilityScore≈0.90, backstitch_score=0.68, fractionalScore=0.73
- **Combined: 0.25×0.70 + 0.25×0.82 + 0.10×0.90 + 0.25×0.68 + 0.15×0.73 ≈ 0.74 → Very Hard**

---

## 9. Edge Cases and Special Handling

### 9.1 Default Fabric Count
`settings.fabricCt` defaults to 14 in the app. `fabricScore(14) = 0.0`. The fabric axis does not penalise a default-count pattern — this is the intended behaviour.

### 9.2 Fabric Count Not in FABRIC_COUNTS Table
If a `fabricCt` value is passed that is not in the FABRIC_COUNTS table (e.g., a hypothetical 40-count), use the fallback formula: `inPerSt = clamp(14/ct, 0.4, 1.4)`. The over-2 flag should also be checked against the label string — if not in the table, default to `isOver2 = false`.

### 9.3 No Backstitching
`bsLines = []` → `backstitch_score = 0.0`. No penalty. This is correct: the absence of backstitch is not a difficulty contribution; it is the presence that adds difficulty.

### 9.4 No Fractional Stitches
`halfStitches = {}` → `fractionalScore = 0.0`. Same logic.

### 9.5 High Fabric Count with Small Palette
Example: 22-count non-over-2, 8 colours, no backstitch, no fractionals, large blocks.
- fabricScore=0.70, symbolScore=0.0, navigabilityScore≈0.05, backstitch_score=0.0, fractionalScore=0.0
- Combined: 0.25×0.70 + 0 + 0.01 + 0 + 0 ≈ 0.19 → Moderate
This accurately reflects the actual difficulty: the pattern is simple to read but physically demanding to stitch on small fabric.

### 9.6 Analysis Data Unavailable
If `analysisData` is null (e.g., the worker has not yet run, or it is called from a context without the worker), set `navigabilityScore = 0.5` (neutral) rather than 0 or 1. This avoids artificially inflating or deflating the score when the data is simply absent.

### 9.7 Zero Stitchable Cells
Guard against division by zero: if `totalStitchable = 0`, return `{ score: 0, breakdown: all zeros }`.

---

## 10. Open Questions

### Q1: Should the symbol readability score account for the specific colours in the palette?

Currently the score uses only `pal.length`. A refinement would also consider how visually similar the printed colours are — if 20 of a pattern's 30 colours are all greens, the reader must distinguish similar symbols *and* cannot use colour as a fallback to identify a misread symbol. This would link Symbol Readability back to the Colour Complexity analysis (Factor 01, specifically the CIE ΔE minimum pairwise distance metric).

**Recommendation:** Implement the `pal.length`-only version first. Add the colour-similarity refinement as a Phase 2 enhancement.

### Q2: Is `bsLines` guaranteed to be present?

From the project schema (v8): `bsLines` is a field in the saved project object initialised as `[]`. The app's save/load logic should always populate it. Defensive handling (`bsLines || []`) is still warranted for older project formats or partially-constructed in-memory objects.

### Q3: Should French knots or beading count as specialty stitches?

Not currently supported in the project format. When added, French knots should be included in the fractional stitch score (same technique demand: centre-cell needle placement). Beading may warrant a separate sub-factor due to the distinct tool (beading needle vs tapestry needle) and bead attachment technique.

### Q4: Should navigability reuse confetti data or compute independently?

**Reuse.** The cluster-size distribution from `analysis-worker.js` already contains everything needed. Computing it independently would introduce inconsistency (different BFS seeds, different handling of `__skip__` cells) and waste CPU. The `navigabilityScore` should be derived directly from the same `perStitch.clusterSize` array that the confetti score uses.

### Q5: How many symbols is the app currently showing users?

The app generates symbols for patterns using the frequency-sorted assignment from `symbolFontSpec.js`. A 50-colour pattern uses the first 50 symbols. Based on the analysis in §3.2, symbol slots 37–50 are in Family 3 (crosses) and the start of Family 4 (bars/chevrons), a region with moderate-to-high intra-family confusion. Patterns with palettes above ~35–40 colours should receive a visible "symbol readability" caution in the UI.

### Q6: Are the 96 symbols ordered by distinctiveness?

Partially. The assignment from the spec is positional (Family 0 first, then 1, 2, ...), and Family 0 contains the most distinct shapes. However, within families the ordering is roughly by shape complexity rather than by distinctiveness from other symbols in the family. The frequency-based assignment (most common colour → first symbol) helps in practice because the most common colours typically get the most distinct symbols, but this is incidental rather than by design.

---

## 11. Implementation Notes

### 11.1 Where to Implement

The `spatialComplexityScore` function should live in `helpers.js` alongside the existing `calcDifficulty`, `skeinEst`, and other pattern-level utility functions. It is a pure function with no browser dependencies and is straightforward to unit-test.

### 11.2 Testing Strategy

Following the project convention of extracting functions from source files via `fs.readFileSync + eval`:

- `spatialComplexityScore([], [], {}, {fabricCt:14}, 1000, null)` → score ≈ 0.
- `spatialComplexityScore(mockPal60, [], {}, {fabricCt:14}, 1000, null)` → symbolScore > 0.60.
- `spatialComplexityScore([], [], {}, {fabricCt:22}, 1000, null)` → fabricScore ≈ 0.70.
- `spatialComplexityScore([], mockBsHeavy, {}, {fabricCt:14}, 1000, null)` → backstitch_score > 0.40.
- Edge cases: totalStitchable=0, bsLines=undefined, halfStitches=undefined.

### 11.3 Integration with Existing `calcDifficulty`

The existing `calcDifficulty(palLen, blendCount, totalSt)` in `helpers.js` is a simple heuristic returning a star rating. The new spatial complexity score is one of several factors feeding into a redesigned composite scorer. The integration point is at the composite scorer level, not inside `calcDifficulty` itself.

---

## 12. Summary of Findings

1. **96 symbols** are defined in `symbolFontSpec.js`. Practical unambiguous capacity at standard chart print size is approximately **40–50 symbols**, after which orientation-only and stroke-weight-only distinctions dominate. The score formula reflects this with a non-linear curve.

2. **FABRIC_COUNTS** contains 9 entries from 11-count to 32-count (over 2). The `inPerSt` field directly encodes the physical stitch size relative to the 14-count baseline, with over-2 counts correctly reflecting the halved effective stitch density. The 14-count default scores 0; 22-count non-over-2 scores 0.70 (the hardest standard fabric in the app).

3. The **over-2 convention** introduces two distinct difficulty contributions: physical cell size (captured by `inPerSt`) and hole-finding navigation (a flat +0.10 penalty). Both must be scored independently.

4. **Navigability** should reuse confetti analysis data rather than compute separately. A small 0.10 weight prevents double-counting against the confetti factor.

5. **Backstitch** is the most implementation-complex sub-factor because it benefits from secondary metrics (diagonal fraction, colour count) beyond the simple segment count. The primary `bsRatio` is sufficient for a first-pass implementation.

6. **Fractional stitches** are fully captured by `Object.keys(halfStitches).length`. The challenge is technique-level (piercing Aida fabric between holes), not navigational.

{% endraw %}
