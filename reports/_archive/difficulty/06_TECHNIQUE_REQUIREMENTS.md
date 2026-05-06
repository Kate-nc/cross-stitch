# Factor 06 — Edge Cases & Technique Requirements
**Cross-Stitch Pattern Difficulty Calculator — Research Report**
*Date: 2026-05-04*

---

## 1. Definition

This factor captures difficulty that is **not universal** — it applies only when the pattern uses specific techniques or materials that go beyond the cross-stitch baseline of:

- Full cross-stitches only
- Standard stranded cotton (DMC or Anchor regular)
- Aida fabric (clearly-holed, punched weave)
- No fractional stitches
- Minimal or no backstitching

Because these sub-factors are conditional, they should be computed independently and combined carefully. A pattern that uses none of these techniques scores zero on this factor, regardless of how large or colour-complex it is.

---

## 2. Sub-factors

### A. Specialty Thread Difficulty

#### What the app tracks

The stash manager stores threads by brand + id key (e.g. `dmc:310`, `anchor:403`). Thread records have the shape:

```js
{ owned: number, tobuy: boolean, partialStatus: null | string, min_stock: number }
```

There is **no `type` field**. The stash entry carries only inventory data.

#### What `dmc-data.js` actually contains

Verified by direct inspection. Every entry in `DMC_RAW` is a 5-tuple: `[id, name, R, G, B]`. The exported `DMC` array maps these to `{ id, name, rgb, lab }`. There are **no additional fields** — no `type`, no `category`, no `series`, no `finish` flag.

The dataset covers only DMC Stranded Cotton (the standard 6-strand embroidery floss). **DMC Light Effects metallics (E168, E310, E415, E677, E3821, E5200, etc.), Color Variations (variegated 4000-series), Satin floss, Pearl Cotton (#3, #5, #8, #12), and any other specialty lines are entirely absent** from `dmc-data.js`.

Similarly, `anchor-data.js` contains only Anchor Stranded Cotton: `[id, name, R, G, B]` with no type metadata.

#### Specialty thread categories (external knowledge)

| Thread Type | Handling Notes | Difficulty |
|---|---|---|
| Standard cotton (DMC/Anchor stranded) | Baseline | None |
| DMC Light Effects metallics (E-series) | Must be cut short (max 15 cm); catches on fabric weave; split-strand technique different; tangles constantly; cannot be ironed | High |
| Kreinik metallic (braid/cord) | Even more rigid than DMC metallics; requires beeswax; needle must be much larger hole | High |
| Silk floss | Slippery; catches on rough fingers/fabric; expensive so mistakes costly; beautiful tension hard to maintain | Medium–High |
| Overdyed/variegated (e.g. DMC Color Variations 4xxx) | Colour planning is hard; striping vs blending depends on stitch direction; cannot be easily matched to reference | Medium |
| Glow-in-the-dark / fluorescent | Synthetic fibre; more friction; cannot be pressed with iron; needle size often different | Low–Medium |
| Pearl cotton | Cannot be split into strands; thread is much thicker; needle and fabric requirements change completely | Medium |
| Tapestry wool / Persian wool | Needle must be significantly larger; distorts counted-thread fabrics; only suits canvas/needlepoint | High (if misused) |

#### Limitation and recommendation

Because neither `dmc-data.js` nor `anchor-data.js` includes a `type` field, **automatic specialty thread detection is not currently possible**. Two practical paths:

1. **Enrich `dmc-data.js`**: add an optional `series` or `type` field to the `DMC_RAW` tuples (or a parallel lookup object `DMC_TYPES`). The metallic E-series IDs are identifiable by their `E` prefix. A hardcoded set would cover most cases:

   ```js
   const DMC_METALLIC_IDS = new Set([
     'E168','E310','E317','E321','E334','E415','E436','E677','E699',
     'E700','E702','E718','E720','E745','E746','E815','E3821','E3852',
     'E5200','E5282','E5283','E5284','E5289','E5290'
   ]);
   ```

2. **Manual flag in stash**: add a `specialty: boolean` or `type: 'cotton'|'metallic'|'silk'|'overdyed'` field to the stash thread record. The stash manager UI would show this as an optional tag. This is more user-driven but doesn't require enriching the catalogue.

**For the difficulty calculator**: until one of these paths is implemented, specialty thread detection **must be marked as out-of-scope / manual-only**. The calculator cannot derive it from any existing data.

---

### B. Full Coverage vs. Partial Coverage

#### Data available

`totalStitchable` = count of non-`__skip__` / non-`__empty__` cells in `pattern[]`.  
`w * h` = total grid cells (settings `sW × sH`).

Both are already computed: `totalStitchable` is a `useMemo` in `useCreatorState.js` (line 562). The grid dimensions `sW`, `sH` are in `settings`.

**Coverage ratio**: `coverageRatio = totalStitchable / (sW * sH)`

This is fully derivable from existing saved-project data with no new fields.

#### Difficulty analysis

| Coverage range | Characteristic | Stitching concern |
|---|---|---|
| >80% | Near or full coverage | Mistakes are hidden by neighbours; very forgiving. More total work but no precision premium. |
| 50–80% | Partial coverage | Background fabric visible in patches. Misplaced stitches on visible fabric are noticeable. |
| 20–50% | Open design | Large patches of bare fabric. Incorrect stitch direction or offset is highly visible. |
| <20% | Outline / motif only | Essentially a line drawing on bare fabric. Every stitch position matters. Mistakes on bare Aida are very hard to remove cleanly without leaving a mark. |

**Precision penalty**: partial coverage patterns are harder because:
- A stitch placed one cell off on open fabric is obvious
- Removing and replacing a stitch on bare fabric risks pulling fabric threads
- The stitcher cannot rely on existing stitches as positional anchors

**Proposed scoring** (0–1 scale):

```js
function coveragePenalty(coverageRatio) {
  if (coverageRatio >= 0.8) return 0.0;   // full coverage — no penalty
  if (coverageRatio >= 0.5) return 0.15;  // moderate partial
  if (coverageRatio >= 0.2) return 0.35;  // open design
  return 0.55;                             // outline/motif pattern
}
```

---

### C. Extensive Backstitching

#### Data available

`bsLines` is an array of line segments. Each segment is `{ x1, y1, x2, y2 }` (grid-coordinate endpoints). There is no per-line colour or thread ID stored in the saved project JSON (the colour used was whatever `selectedColorId` was at draw time — this is not persisted per-segment in the v8 format).

`bsLines.length` is the count of individual backstitch strokes.

The tracker also computes `layerCounts.backstitch` as `bsLines.length`.

#### Technique difficulty analysis

**Why backstitching is harder than cross-stitch:**

- Cross-stitch has a predictable rhythm: every stitch occupies one grid cell in a fixed X shape. Block-stitching one row at a time is efficient and consistent.
- Backstitch requires tracking continuous paths across the grid. The path can change direction at every stitch, including diagonals that cross between grid-cell corners.
- Diagonal backstitch segments (e.g. `x1=3, y1=4` to `x2=5, y2=6`) are common for curved details. These are disorienting to count on a grid.
- Maintaining consistent tension on backstitch without the thread looping through on the back requires more experience.
- Dense backstitch detail work (e.g. facial features) cannot be done in a block-stitching rhythm — each line must be followed individually.

**Proposed ratio metric:**

```js
backstichRatio = bsLines.length / Math.max(1, totalStitchable)
```

This normalises backstitch density against the pattern size. A 5000-stitch pattern with 500 backstitch segments is genuinely dense; the same 500 segments on a 20,000-stitch pattern is light outlining.

**Proposed scoring** (0–1 scale):

```js
function backstichPenalty(bsLines, totalStitchable) {
  if (!bsLines || bsLines.length === 0) return 0;
  const ratio = bsLines.length / Math.max(1, totalStitchable);
  if (ratio < 0.05) return 0.0;   // occasional outline — negligible
  if (ratio < 0.15) return 0.15;  // moderate detail outlining
  if (ratio < 0.35) return 0.30;  // extensive backstitch detail
  return 0.50;                     // backstitch-dominant pattern
}
```

**Edge case — all-backstitch design:** a pattern with `totalStitchable === 0` and `bsLines.length > 0` is an all-backstitch design (a line drawing with no fill). This is a fundamentally different technique. The ratio formula produces `Infinity` which must be clamped. Treat `ratio >= 1.0` as the maximum penalty (0.50).

---

### D. Fractional Stitches on Different Fabric Types

#### Data available

`halfStitches`: in the saved project v8 format this is an array of `[cellIdx, { fwd?, bck? }]` pairs (serialised from a Map in memory). In memory (both creator and tracker), it is a `Map<number, { fwd?: threadEntry, bck?: threadEntry }>`.

Count of fractional cells: `Object.keys(halfStitches).length` (on the JSON object) or `halfStitches.size` (on the in-memory Map).

`settings.fabricCt`: numeric fabric count (stitches per inch). Common values: 11, 14, 16, 18, 22, 25, 28, 32, 36. The `FABRIC_COUNTS` constant in `constants.js` holds the full list.

#### Technique difficulty analysis

**On Aida fabric (11–18 count typically):**
Aida has a rigid, square-holed weave where each stitch position has clearly defined corner holes. To place a quarter-stitch, the needle must **pierce the fabric between holes** — this splits the woven threads and can damage the weave if done incorrectly. It also requires a sharp (not blunt/tapestry) needle, which is a different tool entirely. A stitcher who owns only tapestry needles cannot do fractional stitches on Aida without acquiring new equipment.

**On evenweave / linen (28–36 count, stitching over 2 threads):**
The open weave has natural gaps between fabric threads. A fractional stitch passes between threads without piercing them. The over-2 convention makes this much more natural — the needle finds the same gap it would for a full stitch, just stopping at the midpoint. Fractional stitches on 28+ evenweave are considered **significantly easier** than on Aida.

**Fabric count boundary:**
The conventional dividing line is 18 vs 22+ count. 14-count Aida is the most common fabric for beginners; 28-count evenweave is the most common "advanced" ground. The app's `FABRIC_COUNTS` list separates these well.

**Proposed scoring:**

```js
function fractionalPenalty(halfStitchCount, fabricCt) {
  if (halfStitchCount === 0) return 0;
  // Base penalty for having any fractional stitches
  // Aida (<=18 count) = harder (must pierce weave)
  // Evenweave (>=22 count) = easier (passes between threads)
  const isAida = fabricCt <= 18;
  const densityFactor = Math.min(1, halfStitchCount / 50); // saturates at 50 fractional stitches
  if (isAida) {
    return 0.1 + 0.3 * densityFactor; // 0.1–0.40
  } else {
    return 0.05 + 0.1 * densityFactor; // 0.05–0.15
  }
}
```

Note: the app does not currently distinguish Aida from evenweave directly — it stores only a numeric `fabricCt`. Low counts (11, 14, 16, 18) are almost always Aida; higher counts (22, 25, 28, 32, 36) are usually evenweave. This heuristic is imperfect (18-count evenweave exists) but is a reasonable proxy given the available data.

---

### E. Blended / Combined Threads

#### Data available

`blendCount = pal.filter(p => p.type === "blend").length` (from `useCreatorState.js` line 596). Already computed as a `useMemo`.

Blend IDs are composite: `"310+550"` — two DMC IDs joined with `+`.

The **existing** `calcDifficulty` already adds +1 if `blendCount > 0` and +1 if `blendCount > 5`. This is a count-based step function, not a ratio.

#### What blends actually require from the stitcher

1. **Preparation**: both threads must be cut to the same length (longer is particularly wasteful since you're effectively halving the usable length of each skein). The pair must be threaded together.
2. **Tension difference**: two strands of different DMC colours may not be twisted the same direction; they can separate and look uneven, especially on high-count fabric.
3. **Bulking**: two standard 2-strand setups for blends means you're passing 4 total strand-ends through the needle eye if you're doing a loop start — many stitchers cut each component to 1 strand instead, complicating the whole threading process.
4. **Reference ambiguity**: if you're stitching from a printed pattern or working from the app screen and lose your place, identifying which threads were used in a blend requires checking both component colours, not just one.
5. **Visual accuracy sensitivity**: unlike a solid colour, a blend's appearance on fabric is affected by how tightly the two strands are twisted together — more variation in outcome.

#### Why the current approach is weak

The current step function (`blendCount > 0` → +1, `blendCount > 5` → +1) treats blends as a count, not as a density or a proportion of the palette. A pattern with 1 blend out of 30 colours is very different from a pattern that is 60% blends.

**Proposed ratio metric:**

```js
blendRatio = blendCount / Math.max(1, pal.length)
```

**Proposed scoring** (0–1 scale, as a modifying factor):

```js
function blendPenalty(blendCount, palLength) {
  if (blendCount === 0) return 0;
  const ratio = blendCount / Math.max(1, palLength);
  if (ratio < 0.1)  return 0.1;   // 1–2 blends in a large palette — minor
  if (ratio < 0.25) return 0.2;   // several blends — moderate
  if (ratio < 0.5)  return 0.35;  // blend-heavy palette — significant
  return 0.5;                      // blend-dominant palette
}
```

**High blend count edge case (>20 blends):**
A palette with 20+ blend entries means the stitcher must prepare 20+ pairs of matched threads at the start. This is a substantial upfront preparation burden even if the total stitch count is low. The ratio metric handles this correctly — if `palLength` is 25 and `blendCount` is 20, `ratio = 0.8` → score = 0.5.

---

### F. Multi-Fabric / Multi-Piece Patterns

Some patterns (e.g. ornaments with a front and back piece, sampler panels, triptych designs) are designed to be stitched on multiple separate pieces of fabric that are then assembled.

**Is there any data?** No. The app's project format (`v8`) stores a single `w × h` grid. There is no concept of multiple pieces, frames, or assembly instructions.

**Verdict: out-of-scope.** This factor cannot be computed automatically. If it becomes important:
- Add a `pieces: number` field to the project settings, defaulting to `1`
- The stitch tracker's per-project settings UI could expose this
- Difficulty could add a flat penalty for `pieces > 1`

Until then, mark as **"manual flag only — not implemented."**

---

## 3. Data Availability Table

| Sub-factor | Data Available? | Source | Notes |
|---|---|---|---|
| Specialty threads (metallic) | **No** | `dmc-data.js` / stash | Neither catalogue nor stash has a `type` field. Metallic E-series IDs absent from DMC dataset entirely. |
| Coverage ratio | **Yes** (derived) | `totalStitchable`, `sW * sH` | Both are available in `useCreatorState` and in saved project JSON (`pattern[]`, `settings.sW/sH`) |
| Backstitching density | **Yes** | `bsLines.length`, `totalStitchable` | Each backstitch segment is `{x1,y1,x2,y2}`. Count is immediately available. |
| Fractional stitches | **Yes** | `halfStitches` (Map or Array), `settings.fabricCt` | Half-stitch count from Map size / array length; fabric count from `settings.fabricCt` |
| Thread blends | **Yes** | `blendCount` (already in `useCreatorState`) | Already used by existing `calcDifficulty`. Ratio not yet computed. |
| Multi-fabric / pieces | **No** | — | Not in data model. Manual flag required. |

---

## 4. Combined Technique Requirements Score

### Component scores (all 0–1):

```
S_coverage     = coveragePenalty(coverageRatio)
S_backstitch   = backstichPenalty(bsLines.length, totalStitchable)
S_fractional   = fractionalPenalty(halfStitchCount, fabricCt)
S_blend        = blendPenalty(blendCount, pal.length)
S_specialty    = specialtyPenalty(...)  // future, currently 0
```

### Combination method: weighted additive, clamped to [0, 1]

**Why not multiplicative?**
Multiplicative combination (`S_a * S_b`) produces near-zero scores when any sub-factor is zero — which would be wrong for a pattern that has heavy backstitching but no fractional stitches. It also compresses the range badly. Multiplication should be reserved for scaling the *final* composite score (see Section 5).

**Why not max?**
Taking the max (`Math.max(S_a, S_b, ...)`) discards information. A pattern with moderate backstitch AND moderate fractional stitches AND some blends is genuinely harder than a pattern with just one of those. The max treats them identically.

**Why weighted additive?**
Each sub-factor contributes independently. Different technique combinations produce different total burdens. Weighting allows importance to be tuned.

**Proposed weights:**

| Sub-factor | Weight | Rationale |
|---|---|---|
| Specialty thread | 0.35 | Metallic thread adds the most handling difficulty per-unit. High weight when detectable. |
| Coverage (precision) | 0.20 | Open fabric is a real precision burden, but less technique-knowledge than metallics. |
| Backstitching | 0.25 | Dense backstitch is a major technique hurdle, especially for rhythm-stitching flow. |
| Fractional stitches | 0.10 | Worst on Aida; minor on evenweave. Lower weight because the fabric modifier handles most variation. |
| Blend threads | 0.10 | Preparation burden, but less than specialty threads. |

```js
function techniqueScore(components) {
  const raw =
    0.35 * components.specialty +
    0.20 * components.coverage +
    0.25 * components.backstitch +
    0.10 * components.fractional +
    0.10 * components.blend;
  return Math.min(1.0, raw);
}
```

---

## 5. The Difficulty Multiplier Concept

### Should technique requirements add or multiply?

The base factors (colour count, confetti stitches, pattern size) establish a baseline difficulty score for the *stitching process itself*. Technique requirements change the **nature** of the work, not just the quantity. A beginner pattern that requires metallics doesn't become longer — it becomes unfamiliar.

This argues for a **multiplier** rather than an additive term. Examples:

- A 20×20 beginner pattern with 5 colours and metallic thread is not actually "Intermediate" in the palette-and-size sense — it's still small and simple. But it requires the stitcher to acquire and manage a fundamentally different material.
- An advanced 150×150 pattern that adds extensive backstitch and fractional stitches *on top of* its already high base score becomes Expert. The multiplier correctly inflates an already high score further.

### Proposed multiplier range: 0.9× – 1.6×

```js
function techniqueMultiplier(techniqueScore) {
  // techniqueScore is 0–1 from Section 4
  // Range: 0.9 (very clean pattern — slight reduction for over-estimating base)
  //        to 1.6 (all specialist techniques active simultaneously)
  return 0.9 + 0.7 * techniqueScore;
}
```

At `techniqueScore = 0`: multiplier = 0.90 (a "pure" standard pattern is slightly more approachable than average — the 0.9 lower bound can be tuned to 1.0 if no downward adjustment is desired).  
At `techniqueScore = 0.5`: multiplier = 1.25 (25% harder than baseline).  
At `techniqueScore = 1.0`: multiplier = 1.60 (60% harder — dramatically escalates any tier).

### Tier threshold interaction

If the base score produces "Intermediate" and the multiplier is 1.5×, the result may push the composite score into "Advanced" or "Expert". This is the correct behaviour — metallic thread genuinely changes the difficulty tier.

However, the multiplier should be applied to the **raw numeric score**, not to the tier label. Compute a final score, then re-apply tier thresholds.

### Separate axis vs. single composite

**Option A — Separate axis**: show two ratings. "Pattern Complexity: Advanced / Technique Requirements: High." This is more informative but adds UI complexity.

**Option B — Single composite score**: fold technique into the final number. Simpler, single badge.

**Recommendation**: use the multiplier approach (Option B) for the main difficulty badge, but surface technique requirements as a **secondary detail list** (e.g. "Includes metallics, fractional stitches on Aida") so the stitcher understands *why* the rating is high. This gives the simplicity of a single badge with the transparency of a separate axis.

---

## 6. DMC Metallic / Specialty Thread Detection: Full Findings

### What `dmc-data.js` contains

The file defines `DMC_RAW` as a flat array of 5-tuples: `[id, name, R, G, B]`. The `DMC` array (the exported catalogue) maps these to `{ id, name, rgb, lab }`. There are **no additional fields**.

The dataset is exclusively DMC Stranded Cotton. Metallic Light Effects threads (which start with `E`), Color Variations (4000-series), Satin, Pearl Cotton, or any other specialist DMC product line are not present. The last few IDs in the file are `3880`–`3895` (all cotton).

### What `anchor-data.js` contains

Identical structure: `ANCHOR_RAW` as `[id, name, R, G, B]` tuples, exported as `ANCHOR` array with `{ id, name, rgb, lab }`. No type metadata. Only Anchor Stranded Cotton.

### Conclusion

Metallic thread detection requires one of:

1. **Hardcoded ID set**: maintain a `const DMC_SPECIALTY` map listing known metallic, satin, and variegated IDs. Requires manual maintenance when DMC releases new products. Manageable given the slow pace of DMC product releases.

2. **Catalogue enrichment**: add `type: 'cotton' | 'metallic' | 'satin' | 'variegated' | 'glow'` to `DMC_RAW` tuples. Would require expanding the tuple from 5 to 6 elements and updating the mapping code.

3. **Stash manager flag**: let users tag threads as specialty in the stash UI. Zero cost to the catalogue data, but requires user action — won't work for patterns loaded from external sources where the user hasn't specifically visited the stash manager.

The cleanest long-term approach is (2) combined with (1) as a bootstrap: add the `type` field, populate it for the known metallic E-series, and use the hardcoded set as a fallback for threads not in the catalogue.

---

## 7. Edge Cases

| Scenario | Handling |
|---|---|
| 0 backstitches, 0 halfStitches | `S_backstitch = 0`, `S_fractional = 0`. Only coverage and blend sub-factors apply. |
| All-backstitch design (`totalStitchable === 0`, `bsLines.length > 0`) | Coverage ratio = 0/0 → treat as full penalty (0.55). Backstitch ratio = infinity → clamp to maximum (0.50). `blendCount` and `halfStitches` are likely 0. |
| High blend count (>20 blends) | If `palLength ≥ 20` and `blendCount > 20`, ratio ≥ 1.0 → `blendPenalty` = 0.5 (maximum). This reflects the real preparation burden of 20+ distinct thread combinations. |
| Very small pattern with any backstitching | `backstichRatio` will be large even with few segments. E.g. a 50-stitch motif with 15 backstitch lines → ratio = 0.30 → "extensive" penalty. This is arguably correct — 15 backstitch lines on a 50-stitch pattern IS proportionally extensive. |
| Fractional stitches on high-count evenweave (32+) | `fabricCt = 32` → `isAida = false` → lower penalty. Correct — stitching over 2 threads of 32-count is not especially difficult for fractionals. |
| Pattern with metallic thread in current app | Metallic is undetectable → `S_specialty = 0` always. Document this gap prominently in the UI as: "Note: if your pattern uses metallic or specialty threads, the difficulty may be higher than shown." |

---

## 8. TODO & Open Questions

1. **Specialty thread detection** (blocker for sub-factor A):
   - Decide between catalogue enrichment vs. hardcoded set vs. stash flag
   - If catalogue enrichment: decide tuple expansion vs. parallel lookup object
   - E-series (metallic) and 4xxx (Color Variations) are the most important cases

2. **Coverage ratio**: straightforward to implement. Should the threshold `>80%` for "full coverage" be tuned? Some patterns designed for 16-count with a white background genuinely look full but may be 70–75%. Consider making the "no penalty" threshold a tunable constant.

3. **Backstitch colour-per-segment**: the `bsLines` format stores only `{x1,y1,x2,y2}`. There is no per-segment colour. Difficulty from a backstitch perspective doesn't depend on colour, so this is fine. But if future work wants to flag "all-backstitch with 3 backstitch thread colours = extra complexity", the data model would need to be extended.

4. **Fractional stitch type distinction**: `halfStitches` stores both half-stitches (`fwd` only or `bck` only) and three-quarter stitches (both `fwd` and `bck`). Three-quarter stitches on Aida are harder than true half-stitches (they require piercing AND covering more of the cell). The current data does distinguish these; a more nuanced fractional score could separate quarter/three-quarter from half.

5. **UI representation**: should technique requirements appear as a separate badge/accordion in the pattern stats panel, or fold silently into the main score? Recommendation: fold into the multiplied main score, but add a "Techniques" detail row (e.g. "Fractional stitches on Aida fabric", "Dense backstitching") visible on hover or expand. This preserves single-badge simplicity while providing transparency.

6. **Interaction with base factors**: the blend multiplier in the **existing** `calcDifficulty` (helper lines 139–141) adds raw score points for blends. This must be rationalised against the new blend sub-factor to avoid double-counting when `calcDifficulty` is refactored.

7. **All-backstitch patterns**: are there any in the test corpus? If so, verify that `totalStitchable === 0` and `bsLines.length > 0` produces sensible results and does not trigger divide-by-zero elsewhere (e.g. `progressPct` computation in `useCreatorState.js` line 618 already guards against this with `> 0` check).
