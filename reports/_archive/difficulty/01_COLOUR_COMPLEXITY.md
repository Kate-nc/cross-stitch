# Colour Complexity — Research Report

_Difficulty Redesign Series, Report 01_  
_Research agent, May 2026._

---

{% raw %}

## 1. Definition

**Colour complexity** is the cognitive and physical burden that a pattern's colour palette places on the stitcher. It is deliberately distinct from _raw colour count_ (palette length), which is only one of five contributing factors.

The clearest way to separate the two concepts is with concrete examples:

| Pattern A | Pattern B |
|---|---|
| 40 colours — every one a clearly different hue (red, blue, green, yellow, orange…) | 40 colours — 30 of them are greens spanning "Very Light Yellow-Green" to "Dark Forest Green" |

Pattern B is dramatically harder than Pattern A, even though both have 40 colours. The stitcher of Pattern B must:

- Distinguish 30 closely related greens on a printed chart under task lighting.
- Constantly pick up, verify, and put down similar spools (is this 367 or 369?).
- Maintain sharp spatial attention even in areas where the colour differences are subtle.
- Follow a chart where the printed symbols for similar colours may themselves look similar.

Pattern A, by contrast, requires managing many spools, but each one is unambiguous — there is no risk of stitching "orange" where "green" should be.

**Colour complexity is therefore a function of:**

1. How many colours there are (raw count).
2. How _perceptually distinguishable_ those colours are from each other.
3. Whether any colours are _blended_ (two threads in the needle simultaneously).
4. How _evenly_ the colours are used across the pattern.
5. Whether any colours appear only as _rare accents_.

---

## 2. Why Each Factor Affects Difficulty

### 2a. Total Colour Count

Large palettes require:
- More spools physically present at the workspace.
- Memorising more chart symbols.
- More needle-parking management (many stitchers use a dedicated needle per colour; running out of needles at 30+ colours forces sequential working).
- Longer search time when picking up a colour after stitching elsewhere.
- More entries in the thread legend to cross-reference.

**Real-world thresholds** (informed by typical commercial kit sizing and community experience):

| Palette size | Experience level | Typical pattern type |
|---|---|---|
| 1–5 | Trivial | Children's kits, simple samplers, monograms |
| 6–15 | Easy–Beginner | Standard greetings-card kits, simple animals |
| 16–30 | Moderate | Typical intermediate kits, detailed flowers |
| 31–50 | Hard | Advanced scenes, detailed portraits |
| 51+ | Extreme | Hyperrealistic photo conversions |

### 2b. Perceptual Colour Similarity

When two (or more) colours in a palette are perceptually close, the stitcher must:
- Visually verify thread identity before every pass ("is this 3363 or 3364?").
- Return incorrectly placed stitches — a time cost and psychological toll.
- Track their physical position in the thread tray more carefully.
- Interpret chart symbols that may be visually close (circle vs open circle).

The _ΔE2000_ metric (CIEDE2000) measures perceptual difference between colours. Unlike raw Euclidean Lab distance, CIEDE2000 accounts for non-uniformity in perceptual sensitivity across hue families — it is significantly more accurate in the blues, purples, and saturated reds where many DMC thread families cluster.

Thresholds relevant to cross-stitch:
- **ΔE2000 < 3**: Essentially identical under typical conditions. Even side-by-side on white aida, a stitcher would struggle to distinguish these.
- **ΔE2000 3–6**: Very confusable. Distinguishable in good lighting with careful comparison, but will be mixed up under typical task-lamp conditions, especially when the spool is not directly next to the other.
- **ΔE2000 6–10**: Somewhat confusable. Noticeable difference but the stitcher cannot rely on casual visual inspection — explicit thread-number checking is required.
- **ΔE2000 10–15**: Distinguishable. A careful stitcher can tell these apart without the thread code.
- **ΔE2000 > 15**: Clearly different. No meaningful confusion risk.

The existing codebase uses `UNIQUE_THRESHOLD_DE = 5` (in `colour-utils.js` line ~1456) to flag threads with "no good cross-brand equivalent". This is directly adjacent to the "very confusable" threshold and validates the ΔE2000 6 boundary chosen here.

### 2c. Blend/Combined Thread Colours

A blend (e.g. `310+550`) requires holding two strands of different threads in the needle simultaneously. This adds difficulty in several ways:

- **Tension management**: two different thread types have slightly different weights, making consistent stitch tension harder.
- **Thread preparation**: each needle load requires pulling and measuring two separate strands.
- **Visual verification**: the blended stitch only looks correct after it is complete — there is no mid-stitch colour check.
- **Planning complexity**: blends consume both parent threads; counting required skeins is more complex.
- **Chart symbol interpretation**: blend symbols are often the same symbol in a different colour, requiring chart attention.

A pattern with 0 blends imposes none of these costs. A pattern where most colours are blends is significantly harder regardless of total palette size.

### 2d. Colour Distribution Evenness

A pattern with 40 colours where three colours account for 90% of stitches is much easier than one where all 40 are used roughly equally, because:

- **Dominant colours** can be stitched across large areas with simple motion, building muscle memory.
- **Rare accent colours** (used in <5% of stitches each) still require finding the right spool, but the cognitive overhead is brief.
- **Balanced distributions** mean every stitch requires the same level of colour-checking. There is no "safe zone" where you can stitch without consulting the chart.

Shannon entropy captures this: a perfectly even distribution has maximum entropy (maximum cognitive load per stitch), while a distribution dominated by one or two colours has very low entropy (most stitches are "easy", with isolated moments of complexity).

### 2e. Accent Colour Penalty (Rare Colours)

Colours used in fewer than ~5 stitches are "accent colours". They create a specific type of difficulty that the distribution score alone does not capture:

- They require precise placement from the chart — there is no tolerance for approximation.
- The stitcher must find a specific cell (or 2–3 cells) out of potentially thousands.
- The thread must be threaded, used once or twice, and then either parked or cut — increasing thread waste and interruption frequency.
- Even a small number of accent colours forces careful chart reading for every stitch in their vicinity.

A 100-stitch pattern with 3 accent colours is not trivially easy. Each accent placement requires the same attention as in a 10,000-stitch pattern.

---

## 3. How to Compute Each Sub-metric

All algorithms below are designed to run synchronously on the already-computed `pal` array and the flat `pattern` array. No image data or I/O is required.

### Available Data (Confirmed from Codebase)

From `colour-utils.js` line 352, `buildPalette(patArr)` produces entries of shape:

```js
{
  id:      string,       // e.g. "310" or "310+550" for blends
  type:    "solid" | "blend",
  name:    string,       // e.g. "Black" or "310+550"
  rgb:     [r, g, b],    // 8-bit RGB
  lab:     [L, a, b],    // CIE Lab — ALWAYS PRESENT after restoreStitch (see §6)
  threads: array|undefined,  // for blends: [threadObj, threadObj]; else undefined
  count:   number,       // stitches used
  symbol:  string        // chart symbol character
}
```

The `lab` field is always populated after `restoreStitch`:
- Solid DMC: taken from `dmc.lab` (pre-computed at module load in `dmc-data.js` line 50).
- Solid non-DMC (Anchor etc.): computed via `rgbToLab(m.rgb)` as fallback (see §5).
- Blend: averaged component Lab values: `[(t0.lab[0]+t1.lab[0])/2, ...]`

From `colour-utils.js` line 1361, `dE2000(lab1, lab2)` is the full CIEDE2000 implementation. It is cached (Map, 5000 entries, 10% batch eviction when full) and exported to `globalThis.dE2000`.

From `dmc-data.js` line 42, `dE2(a, b)` returns squared Euclidean Lab distance (fast; use only for inner-loop operations where CIEDE2000 is too slow).

---

### Sub-metric (a): Unique Colour Count Score

**Purpose**: Normalise raw palette length into a 0–1 score.

**Algorithm**:

```
function rawCountScore(n):
  // n = pal.length (solid + blend entries; excludes __skip__ and __empty__)
  // Uses piecewise linear interpolation between calibrated breakpoints.
  
  if n <= 1:  return 0.0
  if n <= 5:  return lerp(0.05, 0.15,  (n - 2)  / 3)   // 2→5
  if n <= 15: return lerp(0.20, 0.45,  (n - 6)  / 9)   // 6→15
  if n <= 30: return lerp(0.50, 0.75, (n - 16) / 14)   // 16→30
  if n <= 50: return lerp(0.75, 0.90, (n - 31) / 19)   // 31→50
  else:       return min(1.0, 0.90 + (n - 51) * 0.002) // 51+ (asymptote near 1.0)
  
  // lerp(a, b, t) = a + (b - a) * t   where t is clamped to [0, 1]
```

**Threshold justification**:

- **1 colour**: No palette navigation whatsoever. Score = 0.
- **2–5 colours**: Simple kits (ABC samplers, ornaments). Trivial palette management; a beginner can hold all threads in one hand.
- **6–15**: Typical beginner commercial kit range. Manageable but requires a thread tray.
- **16–30**: Standard intermediate kit. The stitcher cannot memorise all symbols simultaneously.
- **31–50**: Advanced kits. Requires systematic workflow (working by colour sections).
- **51+**: Hyperrealistic conversions. The stitcher may be stitching a single colour for only seconds before switching.

**Score at key reference points**:

| n | score |
|---|---|
| 1 | 0.00 |
| 5 | 0.15 |
| 10 | 0.33 |
| 15 | 0.45 |
| 20 | 0.57 |
| 30 | 0.75 |
| 40 | 0.83 |
| 50 | 0.90 |
| 100 | 0.99 |

---

### Sub-metric (b): Perceptual Similarity Score

**Purpose**: Measure how many palette colours have a "near-twin" in the same palette.

**Algorithm**:

```
function perceptualSimilarityScore(pal):
  n = pal.length
  if n <= 1: return 0.0
  
  VERY_CONFUSABLE_THRESHOLD  = 6.0   // ΔE2000 < 6  → will be mixed up
  SOMEWHAT_CONFUSABLE_THRESHOLD = 10.0  // ΔE2000 < 10 → requires explicit verification
  
  // For each colour, find its minimum ΔE2000 distance to any other palette colour.
  // This "nearest-neighbour distance" tells us: "how close is this colour to its
  // most similar twin?"
  
  perEntryScores = []
  
  for each entry e_i in pal:
    minDist = Infinity
    for each entry e_j in pal (j ≠ i):
      d = dE2000(e_i.lab, e_j.lab)
      if d < minDist: minDist = d
    
    // Map minimum distance to a confusion score for this entry:
    if minDist < 3.0:         confScore = 1.0   // essentially identical twin
    else if minDist < 6.0:    confScore = 0.80  // very confusable
    else if minDist < 10.0:   confScore = 0.45  // somewhat confusable
    else if minDist < 15.0:   confScore = 0.15  // noticeable but safe
    else:                     confScore = 0.0   // clearly distinct
    
    perEntryScores.push(confScore)
  
  // Return mean confusion score across all palette entries.
  // A score of 0 = all colours clearly distinct from every other colour.
  // A score of 1 = every colour has an essentially identical twin in the palette.
  return mean(perEntryScores)
```

**Why nearest-neighbour, not all-pairs count?**

The nearest-neighbour distance is more meaningful than counting all confusable pairs because:

1. A colour causes confusion only because of its _closest_ twin — not distant pairs.
2. All-pairs count grows quadratically with palette size, making normalisation awkward. The nearest-neighbour mean is always in [0, 1] without normalisation by palette size.
3. It is interpretable: "what fraction of my palette colours have a near-twin?"

**Why dE2000 and not dE2 (Euclidean squared)?**

CIEDE2000 is required here (not `dE2`) because:

- `dE2` (Euclidean squared Lab) is inaccurate in blues and purples — two colours that are clearly distinct to the eye can have a small `dE2` if they cluster in Lab space.
- The existing codebase already uses `dE2000` for blend search and solid-vs-blend decisions (`findBest` in `colour-utils.js` lines 6–28) precisely because of this accuracy requirement.
- Palette-level similarity comparison is not a per-pixel hot path (at most 19,900 comparisons for a 200-colour palette), so the ~5–8× `dE2000` overhead vs `dE2` is negligible.

**ΔE2000 threshold calibration (6.0 for "very confusable")**:

The codebase already uses `UNIQUE_THRESHOLD_DE = 5` as the boundary between "has a cross-brand equivalent" and "unique" for thread conversion (`colour-utils.js` line ~1456). Extending this by one unit to 6.0 for "will be mixed up under stitching conditions" is consistent with:

- Published CIEDE2000 JND data (~1–2 under optimal conditions → ~6–8 under practical stitching conditions with small thread swatches and variable lighting).
- The observation that DMC "sister" colours (e.g. 367/368/369 Pistachio family, all used in the same foliage areas) typically differ by ΔE2000 4–9.

**Computational note**: For a 200-colour palette, pairwise comparison requires 200×199/2 = 19,900 `dE2000` calls. The `dE2000` function has a 5,000-entry cache; for a fixed palette these pairs will be computed once and cached. Total wall time on a 2024 laptop: well under 1 ms.

---

### Sub-metric (c): Blend Complexity Score

**Purpose**: Score the difficulty added by blended (two-thread) colours.

**Algorithm**:

```
function blendComplexityScore(pal):
  totalColours = pal.length
  if totalColours === 0: return 0.0
  
  blendCount = pal.filter(e => e.type === "blend").length
  
  if blendCount === 0: return 0.0
  
  blendRatio = blendCount / totalColours   // 0.0 → 1.0
  
  // The difficulty of blends is:
  //   (a) any blend at all is a qualitative step up from all-solid → base penalty
  //   (b) the proportion matters: 1 blend in 30 is minor; 20 blends in 30 is extreme
  //
  // Formula: 0.1 base (for "at least one blend exists") + 0.9 * blendRatio
  // This gives:
  //   1 blend in 50 colours (ratio ≈ 0.02): score ≈ 0.12
  //   1 blend in 2 colours  (ratio = 0.5):  score = 0.55
  //   All blends (ratio = 1.0):             score = 1.0
  
  return 0.10 + 0.90 * blendRatio
```

**Reference values**:

| Scenario | blendRatio | score |
|---|---|---|
| No blends | 0.00 | 0.00 |
| 1 blend in 50-colour palette | 0.02 | 0.12 |
| 3 blends in 20-colour palette | 0.15 | 0.24 |
| 5 blends in 15-colour palette | 0.33 | 0.40 |
| Half blends (50% of palette) | 0.50 | 0.55 |
| Mostly blends (80% of palette) | 0.80 | 0.82 |
| All blends | 1.00 | 1.00 |

**Note on blend identification**: `pal` entries have `type === "blend"` OR their `id` contains a `+` character (e.g. `"310+550"`). Use either check; both are set by `buildPalette` → `restoreStitch`.

---

### Sub-metric (d): Colour Distribution Evenness Score

**Purpose**: Measure how evenly the colours are used across the pattern, with a more even distribution scoring higher (harder).

**Why Shannon entropy**:

Shannon entropy from information theory measures the "unpredictability" of a random draw from a distribution. When applied to stitch colour usage:

- A pattern with one dominant colour (90% of stitches) has very low entropy — nearly every stitch is predictable.
- A pattern where all 40 colours are used roughly equally has maximum entropy — every stitch requires chart consultation.

Gini coefficient measures inequality in the opposite direction but encodes the same information. Shannon entropy is preferred here because:

1. It has a well-defined maximum for N colours (`log₂(N)`), enabling clean normalisation.
2. It is computationally trivial.
3. The interpretation ("bits of surprise per stitch") maps naturally to "how often do I need to check the chart?"

**Algorithm**:

```
function distributionEvennessScore(pal, totalStitchable):
  n = pal.length
  if n <= 1: return 0.0          // trivially, single colour
  if totalStitchable === 0: return 0.0
  
  // Stitch counts are already in pal[i].count (built by buildPalette/buildPaletteWithScratch)
  // For safety, recompute from pal.count rather than re-walking the pattern array.
  
  counts = pal.map(e => e.count)
  total  = sum(counts)           // should equal totalStitchable
  if total === 0: return 0.0
  
  // Shannon entropy H = -Σ(p_i * log₂(p_i))
  // H_max = log₂(n)  (perfectly uniform distribution)
  // Normalised entropy = H / H_max  ∈ [0, 1]
  
  H = 0
  for each count c in counts:
    if c > 0:
      p  = c / total
      H += -p * log2(p)            // note: -p*log₂(p) ≥ 0 for p ∈ (0,1]
  
  H_max = log2(n)
  if H_max === 0: return 0.0     // n=1 edge case (should be caught above)
  
  normalisedEntropy = H / H_max  // ∈ [0, 1]
  
  // More even = higher entropy = higher difficulty score
  return normalisedEntropy
```

**Interpretation**:

| Distribution shape | Normalised entropy | Score |
|---|---|---|
| One colour = 99% of stitches | ≈ 0.05 | ≈ 0.05 |
| Two colours share 80%, rest scattered | ≈ 0.4 | ≈ 0.40 |
| Moderate hierarchy (few dominant, many accents) | ≈ 0.6 | ≈ 0.60 |
| Roughly even across all colours | ≈ 0.9 | ≈ 0.90 |
| Perfectly even (all equal) | 1.00 | 1.00 |

**Note on blend entry counts**: `pal` entries for blends have `type === "blend"`. Their `.count` represents stitches of that specific blend. The sub-metric correctly includes these in the distribution, since blended stitches contribute to palette management load just as solids do.

---

### Sub-metric (e): Accent Colour Penalty

**Purpose**: Score the difficulty contribution of colours used in very few stitches — they require precise chart placement but are not captured well by entropy (which smooths them into the distribution).

**Algorithm**:

```
function accentColourScore(pal, totalStitchable):
  n = pal.length
  if n <= 1 || totalStitchable === 0: return 0.0
  
  ACCENT_ABS_THRESHOLD  = 5      // fewer than 5 stitches in absolute terms
  ACCENT_PCT_THRESHOLD  = 0.001  // fewer than 0.1% of total stitches
  
  // A colour is an "accent" if it is present but used very rarely:
  accentCount = pal.filter(e => {
    c = e.count
    return c > 0 &&
           (c < ACCENT_ABS_THRESHOLD ||
            c / totalStitchable < ACCENT_PCT_THRESHOLD)
  }).length
  
  accentRatio = accentCount / n   // fraction of palette that is accent colours
  
  // Scale: 0 accents = 0, one-third accents = 1.0 (capped)
  // Rationale: a palette where 33% of colours appear ≤4 times is extremely
  // demanding of chart precision. Beyond 33%, the incremental difficulty
  // is still present but diminishing.
  return min(1.0, accentRatio * 3.0)
```

**Threshold justification**:

- **5 stitches absolute**: Below this count, even an experienced stitcher would not stitch this colour "from memory" — every single placement must come directly from chart inspection. The visual area covered is about 5–15 mm² on 14ct aida.
- **0.1% relative**: On a 10,000-stitch pattern, 0.1% = 10 stitches. This is appropriate because a 10-stitch colour in a large pattern is still a precise accent placement task, while a 10-stitch colour in a 50-stitch pattern is not an accent.
- The formula uses `OR` (not `AND`): a colour is an accent if either threshold is triggered.

**Reference values**:

| Scenario | accentRatio | score |
|---|---|---|
| No accent colours | 0.00 | 0.00 |
| 2 accent colours in 20-colour palette | 0.10 | 0.30 |
| 5 accent colours in 20-colour palette | 0.25 | 0.75 |
| 7 accent colours in 20-colour palette | 0.35 | 1.00 (capped) |

---

## 4. Combined Colour Complexity Score

### Formula

```
function colourComplexityScore(pal, pattern, w, h, totalStitchable):
  
  n = pal.length (entries where id !== "__skip__" && id !== "__empty__")
  
  if n === 0: return { score: 0.0, breakdown: {...all zeros} }
  
  a = rawCountScore(n)                                    // §3a
  b = perceptualSimilarityScore(pal)                      // §3b
  c = blendComplexityScore(pal)                           // §3c
  d = distributionEvennessScore(pal, totalStitchable)     // §3d
  e = accentColourScore(pal, totalStitchable)             // §3e
  
  // Weighted linear combination:
  score = 0.25 * a   // raw count: important foundation, but not the whole story
        + 0.35 * b   // perceptual similarity: the strongest single predictor of
                     //   actual confusion events during stitching
        + 0.20 * c   // blend complexity: major qualitative step up, but bounded
        + 0.12 * d   // distribution evenness: moderate impact, often correlated with b
        + 0.08 * e   // accent penalty: real but minor compared to structural factors
  
  return { score: clamp(score, 0.0, 1.0), breakdown: {a, b, c, d, e} }
```

### Output Range and Interpretation

Output: **0.0 – 1.0**.

| Score | Label | Real-world description |
|---|---|---|
| 0.00–0.10 | Trivial | 1–3 distinct colours, no blends, one dominant colour. |
| 0.10–0.25 | Simple | 5–12 clearly distinct colours, possible single blend. Simple hierarchy. |
| 0.25–0.45 | Moderate | 15–25 colours, a few similar families, minor blending. Standard intermediate kit. |
| 0.45–0.65 | Complex | 25–40 colours with confusable families OR significant blending (>20% blends). |
| 0.65–0.80 | Hard | 40+ colours or many near-identical pairs. Several blends. Careful thread management required. |
| 0.80–1.00 | Extreme | 50+ colours, many confusable pairs, majority blends, or photo-realistic with near-identical colour bands. |

**Weight rationale**:

- Perceptual similarity (35%) ranks highest because it is the dominant cause of actual stitching errors. You can manage 40 clearly distinct colours. You cannot easily manage 15 near-identical greens.
- Raw count (25%) is important but only as a management overhead proxy, not an error predictor.
- Blends (20%) always introduce a qualitative step-change in technique (double-thread handling).
- Distribution evenness (12%) is a useful signal but is correlated with raw count; lower weight prevents double-penalising diverse palettes.
- Accent penalty (8%) is real but narrow in scope — it is a precision burden, not a sustained cognitive load.

### Combination method

Linear weighted average (not product, not max) because:
- Product (`score = a * b * c * ...`) would collapse to near-zero whenever any single sub-score is low, which is incorrect (a 1-colour pattern with a single extremely rare accent is not trivially easy in isolation of the accent).
- Max (`score = max(a, b, c, ...)`) ignores cumulative burden — a pattern that scores moderately on all five factors is harder than one that scores high on one and zero on the rest.
- Weighted average correctly accumulates difficulty: a 40-colour pattern with many confusable pairs AND significant blending is harder than either factor alone.

---

## 5. Edge Cases

### 5a. Single-colour patterns (n = 1)

- `rawCountScore(1)` = 0.0 by explicit check.
- `perceptualSimilarityScore` with n=1: the inner loop `for j ≠ i` has no iterations, so `minDist = Infinity` → `confScore = 0.0` for the only entry → mean = 0.0.
- `blendComplexityScore`: blendCount = 0 or 1. If the single colour is a blend, score = 1.0; but a single-colour blend pattern is genuinely an edge case (all stitches use the same blend — unusual but valid). The score of 1.0 for the blend sub-metric is then damped by its 20% weight, giving overall ≤ 0.20.
- `distributionEvennessScore` with n=1: `H_max = log₂(1) = 0` → return 0.0.
- `accentColourScore` with n=1: n ≤ 1 → return 0.0.
- **Overall result**: score ≈ 0.0 (correct).

### 5b. 200+ colour patterns (hyperrealistic photo conversions)

- `rawCountScore(200)` = min(1.0, 0.90 + 149 × 0.002) ≈ min(1.0, 1.19) = 1.0. Correct: 200-colour patterns are extreme palette management tasks.
- `perceptualSimilarityScore`: 200×199/2 = 19,900 `dE2000` calls. With the existing cache, this is fast (< 2 ms on modern hardware). In photo-realistic conversions, many nearby colours _will_ be close in ΔE2000, so this score will naturally be high.
- `distributionEvennessScore`: Photo conversions are typically moderately uneven (face tones dominate background), but more even than simple patterns. Score will be in the 0.5–0.8 range.
- `accentColourScore`: Photo conversions often have many 1–3-stitch accent colours (isolated pixels). This sub-metric correctly penalises this.
- **Graceful degradation**: The formula has no components that break or overflow for large n. The `dE2000` cache handles 200+ colour palettes. All scores remain in [0, 1].
- **Practical note**: The stitcher will experience score ≈ 0.85–1.0, which correctly maps to "Extreme". Implementation agents should not attempt to cap n.

### 5c. Patterns where all colours are blends

- `blendComplexityScore` = 0.10 + 0.90 × 1.0 = 1.0.
- All other sub-metrics apply normally; blend Lab values (averaged components) are correctly computed by `restoreStitch`.
- Overall score receives 20% weight × 1.0 from blend sub-metric + contributions from other factors. A 20-colour all-blend palette with similar colours will correctly score very high (0.75+).

### 5d. Anchor (non-DMC) threads

`restoreStitch` (in `colour-utils.js` line ~385) handles non-DMC threads via a fallback:

```js
// Abbreviated from restoreStitch source:
let dmc = findThreadInCatalog('dmc', m.id);
if (dmc) return { ..., lab: dmc.lab };
// Fallback for non-DMC (Anchor, custom, etc.):
return { ..., lab: rgbToLab(...(m.rgb || [128, 128, 128])) };
```

This means:
- Anchor solid thread `pal` entries will have `.lab` computed from their stored RGB via `rgbToLab`.
- The RGB values for Anchor threads come from `anchor-data.js`, which populates each thread's `lab` via `rgbToLab` at module load (same pattern as `dmc-data.js`).
- **However**, if the pattern was saved with `rgb` stripped (the `stripRgbOnSave` optimisation in `helpers.js`), and the thread is Anchor, then `m.rgb` will be `undefined` and the fallback produces `rgbToLab(128, 128, 128)` = grey Lab ≈ `[53.4, 0, 0]`. This is incorrect.
- **Risk**: This is low in practice today (Anchor threads are always saved with RGB because the strip-on-save logic only skips RGB for DMC threads whose RGB matches the catalogue exactly — see `stripCellForSave` in `helpers.js` line ~1316). But this should be verified.

**Safe fallback for the implementation agent**: When walking `pal` entries and `e.lab` is `[53.4, 0, 0]` or is the default grey, check whether `e.rgb` is defined and recompute `rgbToLab(e.rgb[0], e.rgb[1], e.rgb[2])` as a safety pass. This adds negligible cost.

**For blend entries with Anchor components**: `restoreStitch` for blends currently calls `findThreadInCatalog('dmc', ids[0])` and `findThreadInCatalog('dmc', ids[1])` only. If either component is Anchor, the blend Lab average will be computed from the fallback path's result (grey), which is incorrect. This is an existing limitation worth flagging to the implementation agent — blend Anchor threads need `findThreadInCatalog('anchor', ...)` in `restoreStitch`.

---

## 6. Implementation Notes for the Codebase

### Functions already available — do not reimplement

| Function | Location | Use in colour complexity |
|---|---|---|
| `dE2000(lab1, lab2)` | `colour-utils.js` line 1361 | Pairwise similarity (sub-metric b) |
| `dE2(a, b)` | `dmc-data.js` line 42 | Not recommended for this metric (inaccurate in blue/purple) |
| `dE00(lab1, lab2)` | `dmc-data.js` line 43 | Alternative to `dE2000`; equivalent result, less caching. Prefer `dE2000`. |
| `rgbToLab(r, g, b)` | `dmc-data.js` line 40 | Lab fallback for non-catalogue RGB |
| `DMC` | `dmc-data.js` line 50 | Global array, each entry has `.lab` |
| `ANCHOR` | `anchor-data.js` | Global array, each entry has `.lab` |
| `buildPalette(patArr)` | `colour-utils.js` line 352 | Produces `pal` with `.lab` on each entry |
| `isBlendId(id)` | `helpers.js` line ~1277 | Identify blend entries |
| `splitBlendId(id)` | `helpers.js` line ~1281 | Get component thread IDs from blend |
| `findThreadInCatalog(brand, id)` | `helpers.js` line 1256 | Lookup by brand and ID |

### Is `dE2000` already computed somewhere in the pipeline?

Yes, in two places:

1. `findBest` (colour-utils.js lines 6–28): uses `dE2000` for solid-vs-blend comparison during image dithering.
2. `adaptationEngine` (creator/adaptationEngine.js): uses `dE2000` for pattern adaptation analysis.

Neither location caches pairwise palette distances for later use. The colour complexity algorithm will compute its own pairwise distances; this is acceptable given the low computation cost.

### Do `pal` entries have `.lab`?

**Yes**, after `restoreStitch` is called. Specifically:

- The `pattern` array (saved on disk) contains hydrated cells after `restoreStitch` is called during project load.
- `buildPalette(patArr)` (colour-utils.js line 352) directly copies `m.lab` from each pattern cell: `usage[m.id] = {id:m.id, type:m.type, name:m.name, rgb:m.rgb, lab:m.lab, ...}`.
- Therefore, at all call sites where `pal` is built from a loaded project, `pal[i].lab` is defined.

**Caveat**: At the moment a brand-new pattern is first created (before any `restoreStitch` pass), cells may lack `.lab`. The implementation should guard: `e.lab || rgbToLab(e.rgb[0], e.rgb[1], e.rgb[2])`.

### Lab values for blend palette entries

Blend `pal` entries have `lab` = per-channel average of the two component thread Lab values:

```js
// From restoreStitch in colour-utils.js line ~383:
lab: [(t0.lab[0]+t1.lab[0])/2, (t0.lab[1]+t1.lab[1])/2, (t0.lab[2]+t1.lab[2])/2]
```

This averaged Lab is what `pal[i].lab` contains for blends. The pairwise `dE2000` in sub-metric (b) will correctly use this averaged value when comparing a blend colour to its neighbours.

### Computational complexity

| Operation | Complexity | N=20 | N=50 | N=200 |
|---|---|---|---|---|
| Raw count score | O(1) | — | — | — |
| Pairwise ΔE2000 (sub-metric b) | O(n²/2) | 190 | 1,225 | 19,900 |
| Blend ratio | O(n) | 20 | 50 | 200 |
| Distribution entropy | O(n) | 20 | 50 | 200 |
| Accent count | O(n) | 20 | 50 | 200 |

The pairwise ΔE2000 computation dominates. Even at n=200, 19,900 `dE2000` calls with the existing 5,000-entry cache is well under 5 ms on a 2024 laptop. The function is called once per render (same memoisation pattern as `calcDifficulty` at its call sites). No batching or web worker is needed.

### Where to add the new function

Following the existing pattern:

- **Define in `helpers.js`** alongside `calcDifficulty` (~line 136). This is the correct location as it is:
  - Loaded globally before all consumer pages.
  - Not part of the `creator/` bundle (which requires a rebuild step).
  - Pure: takes `pal`, `pattern`, `w`, `h`, `totalStitchable` and returns a plain object.
- **Call `dE2000` via `globalThis.dE2000`** — it is exported there by `colour-utils.js`.
- **The new function must not use `import` / `require`** — all pages use plain `<script>` globals.

---

## 7. Proposed Scoring Model — Pseudocode

```javascript
/**
 * Computes the colour complexity sub-score for a cross-stitch pattern.
 *
 * @param {Array}  pal             - Palette entries from buildPalette/buildPaletteWithScratch.
 *                                   Each entry: { id, type, rgb, lab, count, threads? }
 *                                   `lab` must be defined (call restoreStitch before buildPalette).
 * @param {Array}  pattern         - Flat pattern array (length w*h).
 *                                   Cells: { id, type, rgb } — __skip__/__empty__ for background.
 *                                   Not directly used here; stitch counts come from pal[].count.
 * @param {number} w               - Pattern width in stitches.
 * @param {number} h               - Pattern height in stitches.
 * @param {number} totalStitchable - Count of non-background stitches (pre-computed).
 *
 * @returns {{ score: number, breakdown: object }}
 *   score:     0.0–1.0 colour complexity score.
 *   breakdown: { countScore, similarityScore, blendScore, distributionScore, accentScore }
 */
function colourComplexityScore(pal, pattern, w, h, totalStitchable) {

  // ── Filter to stitchable entries only ──────────────────────────────────────
  var entries = pal.filter(function(e) {
    return e.id !== '__skip__' && e.id !== '__empty__';
  });
  var n = entries.length;

  if (n === 0) {
    return { score: 0, breakdown: { countScore:0, similarityScore:0, blendScore:0, distributionScore:0, accentScore:0 } };
  }

  // ── (a) Raw count score ────────────────────────────────────────────────────
  var countScore = (function(n) {
    function lerp(a, b, t) { return a + (b - a) * Math.min(1, Math.max(0, t)); }
    if (n <= 1)  return 0.0;
    if (n <= 5)  return lerp(0.05, 0.15,  (n - 2)  / 3);
    if (n <= 15) return lerp(0.20, 0.45,  (n - 6)  / 9);
    if (n <= 30) return lerp(0.50, 0.75, (n - 16) / 14);
    if (n <= 50) return lerp(0.75, 0.90, (n - 31) / 19);
    return Math.min(1.0, 0.90 + (n - 51) * 0.002);
  }(n));

  // ── (b) Perceptual similarity score ───────────────────────────────────────
  var similarityScore = (function(entries) {
    if (entries.length <= 1) return 0.0;
    // Resolve lab for each entry; fall back to rgbToLab if .lab is missing.
    var labs = entries.map(function(e) {
      return e.lab && e.lab.length === 3
        ? e.lab
        : rgbToLab(e.rgb[0], e.rgb[1], e.rgb[2]);
    });
    var n = labs.length;
    var perEntryScores = [];
    for (var i = 0; i < n; i++) {
      var minDist = Infinity;
      for (var j = 0; j < n; j++) {
        if (j === i) continue;
        var d = dE2000(labs[i], labs[j]);   // globalThis.dE2000
        if (d < minDist) minDist = d;
      }
      var confScore;
      if      (minDist < 3.0)  confScore = 1.00;
      else if (minDist < 6.0)  confScore = 0.80;
      else if (minDist < 10.0) confScore = 0.45;
      else if (minDist < 15.0) confScore = 0.15;
      else                     confScore = 0.00;
      perEntryScores.push(confScore);
    }
    // Mean confusion score across all entries:
    return perEntryScores.reduce(function(s, v) { return s + v; }, 0) / n;
  }(entries));

  // ── (c) Blend complexity score ─────────────────────────────────────────────
  var blendScore = (function(entries) {
    var blendCount = entries.filter(function(e) {
      return e.type === 'blend' || (typeof e.id === 'string' && e.id.indexOf('+') >= 0);
    }).length;
    if (blendCount === 0) return 0.0;
    var blendRatio = blendCount / entries.length;
    return Math.min(1.0, 0.10 + 0.90 * blendRatio);
  }(entries));

  // ── (d) Distribution evenness (normalised Shannon entropy) ─────────────────
  var distributionScore = (function(entries, totalStitchable) {
    var n = entries.length;
    if (n <= 1 || totalStitchable === 0) return 0.0;
    var total = entries.reduce(function(s, e) { return s + (e.count || 0); }, 0);
    if (total === 0) return 0.0;
    var H = 0;
    entries.forEach(function(e) {
      var c = e.count || 0;
      if (c > 0) {
        var p = c / total;
        H += -p * Math.log2(p);
      }
    });
    var H_max = Math.log2(n);
    if (H_max === 0) return 0.0;
    return Math.min(1.0, H / H_max);
  }(entries, totalStitchable));

  // ── (e) Accent colour penalty ──────────────────────────────────────────────
  var accentScore = (function(entries, totalStitchable) {
    var n = entries.length;
    if (n <= 1 || totalStitchable === 0) return 0.0;
    var ACCENT_ABS = 5;
    var ACCENT_PCT = 0.001;
    var accentCount = entries.filter(function(e) {
      var c = e.count || 0;
      return c > 0 && (c < ACCENT_ABS || c / totalStitchable < ACCENT_PCT);
    }).length;
    var accentRatio = accentCount / n;
    return Math.min(1.0, accentRatio * 3.0);
  }(entries, totalStitchable));

  // ── Combined score ─────────────────────────────────────────────────────────
  var score = 0.25 * countScore
            + 0.35 * similarityScore
            + 0.20 * blendScore
            + 0.12 * distributionScore
            + 0.08 * accentScore;

  return {
    score: Math.min(1.0, Math.max(0.0, score)),
    breakdown: {
      countScore:        Math.round(countScore        * 1000) / 1000,
      similarityScore:   Math.round(similarityScore   * 1000) / 1000,
      blendScore:        Math.round(blendScore         * 1000) / 1000,
      distributionScore: Math.round(distributionScore  * 1000) / 1000,
      accentScore:       Math.round(accentScore         * 1000) / 1000
    }
  };
}
```

### `breakdown` fields for UI

The `breakdown` object is intended for use in an expanded difficulty detail panel:

| Field | Display name | Tooltip |
|---|---|---|
| `countScore` | "Palette size" | "How many different colours are used" |
| `similarityScore` | "Colour confusion" | "How many colours look similar to each other" |
| `blendScore` | "Blended threads" | "How many colours use two threads at once" |
| `distributionScore` | "Even distribution" | "Whether colours are used roughly equally across the pattern" |
| `accentScore` | "Precise accents" | "Colours used in only a few stitches — require exact placement" |

---

## 8. TODO & Open Questions

### TODO before implementation

1. **Verify `pal[i].lab` availability at every call site**.  
   Confirm that the three call sites (`creator/useCreatorState.js`, `tracker-app.js`, `stats-page.js`) all pass a `pal` array whose entries have been through `restoreStitch`. Check whether `stats-page.js` operates on raw (disk) JSON or on a restored/hydrated project.

2. **Check `Math.log2` availability in all target browsers**.  
   `Math.log2` is ES6 and unavailable in IE11. If IE11 is still a concern (unlikely given the React 18 + Babel CDN setup), replace with `Math.log(x) / Math.LN2`.

3. **Verify `globalThis.dE2000` is accessible from `helpers.js`**.  
   `colour-utils.js` assigns `_colourUtilsGlobal.dE2000 = dE2000` (line ~1461). `helpers.js` is loaded _after_ `colour-utils.js` (per the canonical load order in copilot-instructions.md). At the _call site_ of `colourComplexityScore`, `dE2000` should be available as a global. Verify the page load order for each consumer.

4. **Decide whether to cache the pairwise distance matrix**.  
   The `dE2000` function has its own 5,000-entry cache. For repeated calls with the same palette (e.g. React re-renders that don't change `pal`), the outer function should be wrapped in `useMemo` with `[pal]` as dependency — exactly the pattern already used for `calcDifficulty`.

5. **Write Jest unit tests** for:
   - All five sub-metrics in isolation with known inputs.
   - The combined formula with a manually calibrated "typical" palette.
   - Edge cases: n=0, n=1, all-blend palette, all-accent palette.
   - Verify that `dE2000` is mocked for test environments (it reads `globalThis`; tests run in Node).

6. **Calibrate weights against real patterns**.  
   The proposed weights (0.25 / 0.35 / 0.20 / 0.12 / 0.08) are principled estimates. Before shipping, run the formula against 10–20 real patterns of known difficulty (community ratings from Ravelry, Etsy, or the DMC starter kit range) and adjust weights to fit.

7. **Decide on Anchor blend `restoreStitch` fix**.  
   As noted in §5d, blends containing Anchor component threads will have incorrect Lab values (grey fallback). This is a pre-existing limitation. The colour complexity implementation can work around it by checking `e.threads` for blends and recomputing Lab from component RGB if needed.

### Open Questions

**Q1**: Does every `pal` entry passed to `calcDifficulty` call sites already have `.lab`, or only entries built from fully-restored patterns?

_Action_: Read the `useMemo` dependencies in `creator/useCreatorState.js` (~line 597) to confirm that `pal` is the post-`restoreStitch` palette.

---

**Q2**: What ΔE2000 thresholds best match the "real table, real lighting" stitching experience?

The report uses 6.0 / 10.0 / 15.0. These are principled estimates. A calibration study — asking experienced stitchers which DMC pairs they actually confuse — could sharpen these. The `UNIQUE_THRESHOLD_DE = 5` constant already used in the codebase provides indirect validation for the 6.0 boundary.

---

**Q3**: Should `accentScore` use an absolute threshold, a percentage threshold, or both?

The report proposes `OR` logic. Alternative: use only the percentage threshold (`< 0.1%`), which scales with pattern size. The absolute threshold (< 5 stitches) protects small patterns where 0.1% = 0.01 stitches (meaningless). Test both on real patterns before committing.

---

**Q4**: Should blends receive a _higher_ per-entry perceptual similarity score than solids?

In sub-metric (b), blends are treated identically to solids when computing nearest-neighbour distance. But blends are inherently harder to distinguish (their visual colour is the average of two threads; subtle differences in blending technique alter the apparent colour). A possible enhancement: when the nearest-neighbour is also a blend, multiply the `confScore` by 1.2. This is an open question for calibration.

---

**Q5**: For the `stats-page.js` scatter plot (`DifficultyScatter`), should `colourComplexityScore` replace or supplement the existing `calcDifficulty` stars?

The new score returns 0–1. The scatter plot currently uses `stars` (1–4). Options:
- Map `score` to `stars` via the same thresholds as the combined difficulty rating.
- Add a second dimension to the scatter plot (x = colour complexity, y = size/stitch complexity).
- Keep `calcDifficulty` for the starred rating but use `colourComplexityScore` as one input factor.

This is a UX decision for the implementation/design phase, not the research phase.

---

**Q6**: How should the `breakdown` sub-scores be presented in the UI?

The `breakdown` object exposes five 0–1 values. Possible UI: a mini spider/radar chart (5-spoke), a horizontal bar breakdown within the difficulty popover, or tooltip-only. No decision required here; flagged for the implementation agent.

---

_End of report._

{% endraw %}
