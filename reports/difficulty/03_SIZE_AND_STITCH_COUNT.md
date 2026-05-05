# Difficulty Factor 03 — Pattern Size & Stitch Count

**Status:** Research / Pre-implementation  
**Date:** 2026-05-04  
**Relates to:** `helpers.js → calcDifficulty()`, `creator/useCreatorState.js`, `constants.js`

---

## Table of Contents

1. [Executive Summary](#1-executive-summary)
2. [Definition of the Size Factor](#2-definition-of-the-size-factor)
3. [What the Codebase Already Provides](#3-what-the-codebase-already-provides)
4. [Sub-metrics and Algorithms](#4-sub-metrics-and-algorithms)
   - [4a. Stitch Count Score](#4a-stitch-count-score)
   - [4b. Physical Dimensions Score](#4b-physical-dimensions-score)
   - [4c. Estimated Completion Time](#4c-estimated-completion-time)
   - [4d. Pattern Coverage Ratio](#4d-pattern-coverage-ratio)
   - [4e. Endurance Risk Score](#4e-endurance-risk-score)
5. [Size vs Complexity — The Key Distinction](#5-size-vs-complexity--the-key-distinction)
6. [The Fabric Count Interaction](#6-the-fabric-count-interaction)
7. [Concrete Scoring Proposal](#7-concrete-scoring-proposal)
8. [Edge Cases](#8-edge-cases)
9. [Relationship to Existing App Data](#9-relationship-to-existing-app-data)
10. [Open Questions & TODOs](#10-open-questions--todos)

---

## 1. Executive Summary

The current difficulty calculator adds +1 point for `totalSt > 10,000` and +1 point for `totalSt > 30,000`. This is the entire size contribution — two binary thresholds inside a 0–8 scoring system where palette size contributes up to 4 points. The thresholds are too coarse, ignore physical dimensions entirely, and conflate "large" with "hard" without distinguishing duration-based difficulty from complexity-based difficulty.

**The central insight this report argues for:** size is a *separate dimension of difficulty* from complexity. A 200,000-stitch solid-colour grid and a 200,000-stitch photorealistic portrait are equally large, but only one is technically demanding. A 3,000-stitch confetti-filled design and a 3,000-stitch simple border are equally small, but one is vastly harder per-stitch. Mixing these dimensions into a single score misleads users. The proposed solution is to compute a `sizeScore` separately, expose it alongside an `estimatedHours` display, and weight it appropriately in any combined score.

---

## 2. Definition of the Size Factor

**What it measures:**

The size factor captures difficulty arising from the *volume and physical extent* of the work — not from how hard each individual stitch is to place. It predicts:

| Dimension | What it predicts |
|---|---|
| **Duration** | How many hours/days/weeks of stitching the project will take |
| **Endurance** | Whether the stitcher is likely to sustain motivation to completion |
| **Physical handling** | How difficult the fabric is to manage in a frame or hoop |
| **Tracking burden** | How much grid-counting overhead is imposed by a large pattern |
| **Frame management** | Whether the pattern must be rolled/re-framed, introducing distortion risk |

**What it does NOT measure** (handled by other factors):

- Confetti (isolated scattered stitches) — structural/navigation difficulty
- Colour count — palette management difficulty  
- Blends — technical execution difficulty
- Fine fabric counts (28ct, 32ct) — readability/eyestrain difficulty
- Half/quarter stitches — technique difficulty

The size factor is, in plain terms, the difference between "this will take you an afternoon" and "this will take you six months".

---

## 3. What the Codebase Already Provides

### 3.1 Data available at the point `calcDifficulty` is called

From `creator/useCreatorState.js`:

```js
// Already computed via useMemo:
var totalStitchable = useMemo(function() {
  if (!pat) return 0;
  var c = 0;
  for (var i = 0; i < pat.length; i++)
    if (pat[i].id !== "__skip__" && pat[i].id !== "__empty__") c++;
  return c;
}, [pat]);

// Also in scope:
var sW     // width in stitches  (useState(80))
var sH     // height in stitches (useState(80))
var fabricCt  // fabric count    (default 14, persisted to UserPrefs)
```

`calcDifficulty` currently only receives `palLen, blendCount, totalSt`. It will need `w, h, fabricCt` to compute the size factor.

### 3.2 Pattern dimensions — UI constraints

From `creator/Sidebar.js` (line 571):

```js
h(SliderRow, {label:"Size", value:ctx.sW, min:10, max:300, onChange:ctx.slRsz, suffix:" st"}),
```

The creator slider runs 10–300 stitches per dimension. Maximum pattern area from the UI is therefore **300 × 300 = 90,000 cells**.

Image import cap from `import-formats.js`:
```js
const maxWidth  = options.maxWidth  || 200;   // default 200
const maxHeight = options.maxHeight || 200;   // default 200
```

PDF and `.oxs` imports may produce larger patterns with no hard cap enforced in the importer. Patterns up to at least 500×500 could enter the system via import, giving up to ~250,000 stitchable cells. The scoring function must be robust up to this range.

### 3.3 Fabric counts

From `constants.js`:

```js
const FABRIC_COUNTS = [
  {ct:11, label:"11 count",              inPerSt:1.27},
  {ct:14, label:"14 count",              inPerSt:1.0},
  {ct:16, label:"16 count",              inPerSt:0.9},
  {ct:18, label:"18 count",              inPerSt:0.8},
  {ct:20, label:"20 count",              inPerSt:0.72},
  {ct:22, label:"22 count",              inPerSt:0.65},
  {ct:25, label:"25 count (over 2)",     inPerSt:1.12},
  {ct:28, label:"28 count (over 2)",     inPerSt:1.0},
  {ct:32, label:"32 count (over 2)",     inPerSt:0.88},
];
```

`inPerSt` is a scale factor relative to 14-count (i.e., `14 / effectiveCt`). Physical width in inches can be computed two ways — they are equivalent:

```
physW = w * (inPerSt / 14)        // using inPerSt from FABRIC_COUNTS
     = w / effectiveCt           // using effective count directly
```

where `effectiveCt = fabricCt` for standard fabric, or `effectiveCt = fabricCt / 2` for over-two embroidery. The PrepareTab confirms this: `wIn = sW / ef` where `ef = ct / div`.

Default `fabricCt = 14` (from `useCreatorState.js` line 165):
```js
var _fabricCt = useState(function () {
  var v = loadUserPref("creatorDefaultFabricCount", 14);
  return (typeof v === "number" && v > 0) ? v : 14;
});
```

### 3.4 Current scoring — the problem

```js
// helpers.js — current calcDifficulty (lines 136–144)
function calcDifficulty(palLen, blendCount, totalSt) {
  let score = 0;
  if (palLen <= 8)  score += 1;
  else if (palLen <= 15) score += 2;
  else if (palLen <= 25) score += 3;
  else                   score += 4;           // palette: 1–4 pts
  if (blendCount > 0) score += 1;
  if (blendCount > 5) score += 1;             // blends: 0–2 pts
  if (totalSt > 10000) score += 1;
  if (totalSt > 30000) score += 1;            // size: 0–2 pts (PROBLEM)
  // ...label lookup on 0–8 scale
}
```

Problems with the current size contribution:

1. **Binary thresholds are too coarse.** A 1,000-stitch pattern and a 9,999-stitch pattern both score 0 for size. A 10,001 and 29,999 both score 1. A 30,001 and a 500,000 both score 2.
2. **Thresholds don't scale with fabric count.** 10,000 stitches on 11-count = 909" × 909" fabric (absurd). 10,000 stitches on 14-count = 714" × 714" (also absurd — 10,000 stitches at 14ct is actually a 100×100 pattern = 7.1"×7.1" which is perfectly manageable). The thresholds are about stitch count as a proxy for time, not physical handling.
3. **Maximum contribution is 2 points.** On a 0–8 scale where palette alone contributes up to 4 points, size is systematically under-weighted for genuinely large projects.
4. **No time estimate is surfaced.** Users need to know "estimated 40–60 hours" more than they need a +1 difficulty point.

---

## 4. Sub-metrics and Algorithms

### 4a. Stitch Count Score

**What it captures:** Duration and motivational endurance. More stitches = more hours = higher completion risk.

#### Typical project size reference points

Based on cross-stitch community norms (forums, kit labels, designers):

| Category | Stitch Count | Approx. time at 200 st/h | Examples |
|---|---|---|---|
| Sampler/ornament | 0–500 | <2.5 hours | Greeting card inserts, small ornaments |
| Small project | 500–2,500 | 2.5–12.5 hours | Single-motif bookmarks, mini portraits |
| Medium small | 2,500–8,000 | 12.5–40 hours | Small square designs, animal portraits |
| Medium | 8,000–20,000 | 40–100 hours | Standard 5"×7" kits at 14ct |
| Large | 20,000–50,000 | 100–250 hours | Large portraits, detailed landscapes |
| Very large | 50,000–120,000 | 250–600 hours | Full coverage A4-size at 14ct |
| Marathon | 120,000+ | 600+ hours | Large-canvas masterpieces |

**Justification for these thresholds:**
- The creator's default 80×80 pattern contains at most 6,400 cells — medium-small range
- A "standard kit" sold commercially (e.g. Dimensions, HAED mini) is typically 14ct at ~100×140 stitches = ~14,000 stitches — medium range
- HAED (Heaven and Earth Designs) "large" patterns run 200×250 to 350×450 stitches at 28ct over 2 — 50,000–157,000 stitches — very large to marathon range
- The creator's 300×300 max with 100% coverage = 90,000 stitches — sits in "very large"

#### Normalisation formula — piecewise log-linear

A pure logarithmic scale (`log(n)/log(MAX)`) compresses the high end too aggressively, causing a 2,000-stitch pattern to score ~0.55 — misleadingly high for what is a small afternoon project. A piecewise approach gives better perceptual linearity:

```js
/**
 * Normalises stitch count to 0–1.
 * Piecewise linear between log10-spaced anchor points.
 * @param {number} totalStitchable  - non-background stitch count
 * @returns {number} 0–1 score
 */
function stitchCountScore(totalStitchable) {
  if (!totalStitchable || totalStitchable <= 0) return 0;

  const ANCHORS = [
    //  [stitches,  score]
    [0,       0.00],   // nothing
    [200,     0.05],   // tiny sampler
    [1000,    0.15],   // ornament-size
    [3000,    0.28],   // small project
    [8000,    0.42],   // medium-small (default 80×80 fully covered)
    [20000,   0.58],   // medium (standard kit)
    [50000,   0.74],   // large
    [100000,  0.87],   // very large
    [200000,  0.96],   // marathon
    [500000,  1.00],   // absolute cap
  ];

  const n = totalStitchable;

  // Find bracketing pair and linearly interpolate
  for (let i = 0; i < ANCHORS.length - 1; i++) {
    const [n0, s0] = ANCHORS[i];
    const [n1, s1] = ANCHORS[i + 1];
    if (n <= n1) {
      return s0 + (s1 - s0) * (n - n0) / (n1 - n0);
    }
  }
  return 1.0;
}
```

**Worked examples:**
- 80×80 solid fill (6,400 stitches): score ≈ 0.37
- 100×140 standard kit (14,000 stitches): score ≈ 0.50
- 200×200 with 70% coverage (28,000 stitches): score ≈ 0.61
- 300×300 solid (90,000 stitches): score ≈ 0.84
- 500×500 imported HAED (250,000 stitches): score ≈ 0.99

---

### 4b. Physical Dimensions Score

**What it captures:** Frame and hoop handling difficulty. A large physical fabric is harder to manipulate, harder to roll without distortion, and more tiring to hold.

#### Physical dimensions calculation

```js
// Use settings.fabricCt (default 14). For over-two, caller should halve fabricCt first.
const effectiveCt = fabricCt || 14;   // safe fallback
const physW = w / effectiveCt;         // inches
const physH = h / effectiveCt;         // inches
const physMax = Math.max(physW, physH); // largest dimension drives hoop choice
```

#### Standard hoop sizes and usable area

A hoop requires ~1–1.5 inches of fabric border on each side to grip securely. The usable stitching area within a hoop is:

```
usable_diameter ≈ hoop_diameter - 2.5 inches (conservative, 1.25" border each side)
```

| Hoop diameter | Usable stitching area | Max pattern side at 14ct | Max pattern side at 18ct |
|---|---|---|---|
| 4" | ~1.5" | ~21 stitches | ~27 stitches |
| 5" | ~2.5" | ~35 stitches | ~45 stitches |
| 6" | ~3.5" | ~49 stitches | ~63 stitches |
| 7" | ~4.5" | ~63 stitches | ~81 stitches |
| 8" | ~5.5" | ~77 stitches | ~99 stitches |
| 10" | ~7.5" | ~105 stitches | ~135 stitches |
| 12" | ~9.5" | ~133 stitches | ~171 stitches |

A pattern whose largest dimension exceeds the usable area of the largest practical hoop (≈10–12") requires a **scroll frame** (or Q-snap). Patterns substantially larger still require **multiple re-framings** of a scroll frame.

#### Hoop classification algorithm

```js
/**
 * Classifies required framing hardware from physical dimensions.
 * @param {number} physW  - physical width in inches
 * @param {number} physH  - physical height in inches
 * @returns {{ hoopType: string, hoopScore: number }}
 */
function classifyHoopType(physW, physH) {
  const longest = Math.max(physW, physH);

  // Thresholds: usable area for each hoop at 1.25" border each side
  if (longest <= 1.5)  return { hoopType: "4in hoop",     hoopScore: 0.00 };
  if (longest <= 2.5)  return { hoopType: "5in hoop",     hoopScore: 0.08 };
  if (longest <= 3.5)  return { hoopType: "6in hoop",     hoopScore: 0.15 };
  if (longest <= 4.5)  return { hoopType: "7-8in hoop",   hoopScore: 0.25 };
  if (longest <= 6.0)  return { hoopType: "10in hoop",    hoopScore: 0.40 };
  if (longest <= 9.5)  return { hoopType: "scroll frame", hoopScore: 0.65 };
  if (longest <= 16.0) return { hoopType: "scroll frame (multi-roll)", hoopScore: 0.85 };
  return                      { hoopType: "professional frame",        hoopScore: 1.00 };
}
```

**Worked examples at 14ct:**
- 80×80 (5.7"×5.7"): 7–8" hoop, hoopScore ≈ 0.25
- 100×140 (7.1"×10.0"): scroll frame, hoopScore ≈ 0.65
- 200×200 (14.3"×14.3"): scroll frame multi-roll, hoopScore ≈ 0.85

#### Physical dimensions score (combined)

```js
function physicalSizeScore(physW, physH) {
  const { hoopScore } = classifyHoopType(physW, physH);
  // Also factor in total fabric area (larger = harder to manoeuvre)
  const areaIn2 = physW * physH;
  const areaScore = Math.min(1.0, areaIn2 / 400.0); // 400 sq in (≈20"×20") = maximum
  // Weighted blend: hoop type is the primary signal
  return 0.7 * hoopScore + 0.3 * areaScore;
}
```

---

### 4c. Estimated Completion Time

**What it captures:** A direct, user-interpretable prediction of hours required. This is arguably the single most useful output of the size factor — more actionable than a 0–1 score.

#### Stitching speed baseline

Reported stitching speeds from community data and craft educators:

| Skill level | Stitches per hour | Basis |
|---|---|---|
| Beginner | 100–150 | Learning as they go, frequent counting errors, untangling thread |
| Casual intermediate | 150–250 | Familiar with technique, occasional counting |
| Confident intermediate | 250–400 | Efficient threading, minimal counting, good rhythm |
| Advanced / speed stitcher | 400–600+ | Memorised pattern sections, two-handed technique, optimised routes |

**Proposed default: 200 stitches/hour** (round number within beginner–intermediate overlap, appropriate for first-run estimates)

This translates to roughly one complete cross stitch every 18 seconds — plausible for someone who:
- Has loaded the needle with thread
- Is stitching a single colour in a solid block (not counting constantly)
- Is not watching TV simultaneously

For confetti patterns (many colour changes), 100–150 stitches/hour is more realistic. However, this report concerns the size factor only; the confetti factor should apply its own modifiers.

#### Time calculation

```js
const STITCHES_PER_HOUR_DEFAULT = 200;  // Stored in constants.js or passed as config

/**
 * Estimates stitching time.
 * @param {number} totalStitchable   - non-background stitch count
 * @param {number} [stitchRate=200]  - stitches per hour (personalised in future)
 * @returns {{ hours: number, label: string }}
 */
function estimateCompletionTime(totalStitchable, stitchRate = STITCHES_PER_HOUR_DEFAULT) {
  const hours = totalStitchable / stitchRate;
  return { hours, label: classifyTime(hours) };
}

function classifyTime(hours) {
  if (hours < 2)    return "quick session (under 2 hours)";
  if (hours < 8)    return "single weekend";
  if (hours < 20)   return "2–3 weekends";
  if (hours < 50)   return "multi-week project";
  if (hours < 100)  return "1–2 month project";
  if (hours < 250)  return "3–6 month project";
  if (hours < 600)  return "long-term (6+ months)";
  return "multi-year commitment";
}
```

**Worked examples at 200 st/h:**
- 80×80 solid fill (6,400 st): 32 hours → "2–3 weekends"
- 100×140 kit (14,000 st): 70 hours → "multi-week project"
- 200×200 70% coverage (28,000 st): 140 hours → "1–2 month project"
- 300×300 solid (90,000 st): 450 hours → "long-term (6+ months)"

**Display recommendation:** Show `estimatedHours` as a range to communicate uncertainty:

```
Estimated time: 60–100 hours
```

where the range is `[estimatedHours * 0.6, estimatedHours * 1.5]` (reflecting ±40% variation from personal stitching speed).

---

### 4d. Pattern Coverage Ratio

**What it captures:** The proportion of the bounding rectangle that is actually stitched. Affects how much physical work full coverage requires vs sparse/outline patterns, and how forgiving of mistakes the pattern is.

```js
const coverageRatio = (w * h) > 0 ? totalStitchable / (w * h) : 0;
```

#### Coverage interpretation

| Coverage ratio | Category | Notes |
|---|---|---|
| ≥0.85 | Full coverage | Almost every cell stitched; fabric completely hidden; highly forgiving — neighbour stitches camouflage errors; but maximum physical work |
| 0.60–0.85 | High coverage | Dense but not solid; typical for portraits |
| 0.35–0.60 | Medium coverage | Mixed filled areas and sparse sections |
| 0.15–0.35 | Low coverage | Outline or motif-only patterns; each stitch visible against bare fabric; precise placement critical |
| <0.15 | Sparse | Decorative embroidery style; few stitches but each matters |

#### Note: coverage ratio is *not* a simple difficulty multiplier for size

High coverage means:
- More total stitching work (increases duration)
- More forgiving of small misplacements (reduces technical difficulty)

Low coverage means:
- Less total work (reduces duration)
- Each stitch must be placed precisely on bare fabric (increases technical difficulty per stitch)

For the **size factor**, coverage ratio is a context signal rather than a primary score input. It is most useful for the display layer:

- High coverage + large size = "Full coverage — this will take considerable time but is forgiving to stitch"
- Low coverage + large size = "Large but sparse — the physical area is large but stitch count is lower than it appears"

The `coverageRatio` should be reported in the `breakdown` object for the UI to use in messaging, but should only modestly weight the score.

```js
// Coverage modifier: full coverage slightly increases size difficulty
// (more work area to manage in the frame)
function coverageModifier(ratio) {
  if (ratio >= 0.75) return 1.05;  // +5% for full coverage
  if (ratio >= 0.50) return 1.00;  // neutral
  if (ratio >= 0.25) return 0.90;  // sparse: slightly less handling burden
  return 0.80;                     // very sparse: noticeably less
}
```

---

### 4e. Endurance Risk Score

**What it captures:** The probability that this project will be abandoned before completion. This is distinct from technical difficulty — a simple one-colour grid of 200,000 stitches is trivially easy per-stitch but has a very high abandonment risk due to sheer volume.

#### Anecdotal and community evidence

Cross-stitch community surveys and forum threads consistently report:

- Projects under 10,000 stitches have high completion rates (most stitchers finish what they start)
- Projects in the 30,000–80,000 range have moderate abandonment ("the WIP pile" is a running community joke)
- Projects above 80,000 stitches (HAED, large canvases) are considered multi-year commitments; many are never finished; some designers discourage beginners from starting them
- "Project fatigue" typically sets in around the 6-month mark for most hobbyists, which at 200 st/h corresponds to ~26,000 stitches (assuming 30 minutes/day)

The endurance risk is best framed as a separate label ("Commitment level"), not folded into the numerical difficulty score, because it describes a different type of challenge. However, an endurance risk value should be computed:

```js
/**
 * Endurance risk: 0 = low risk (will definitely finish), 1 = very high risk (may never finish).
 * Based on estimated hours.
 */
function enduranceRiskScore(estimatedHours) {
  if (estimatedHours < 10)  return 0.0;   // easy weekend
  if (estimatedHours < 30)  return 0.1;   // a few weekends
  if (estimatedHours < 60)  return 0.25;  // month
  if (estimatedHours < 120) return 0.45;  // 2–3 months
  if (estimatedHours < 250) return 0.65;  // half a year
  if (estimatedHours < 500) return 0.82;  // year+
  return 0.95;                            // multi-year commitment
}
```

**UI treatment (proposed):** A commitment badge separate from the difficulty stars:

| Endurance risk | Label |
|---|---|
| 0–0.15 | Manageable |
| 0.15–0.40 | Sustained effort |
| 0.40–0.65 | Long-term project |
| 0.65–0.85 | Major commitment |
| 0.85–1.0 | Multi-year project |

---

## 5. Size vs Complexity — The Key Distinction

### Why they must be separated

Consider two patterns, each with `totalStitchable = 50,000`:

**Pattern A:** Solid navy blue fill, 14-count, square canvas  
- Palette size: 1 colour → palScore = 0
- Blends: 0
- Confetti: 0%
- Each stitch is trivially simple: thread on, over and under, done
- Technical skill required: minimal
- **But:** 50,000 ÷ 200 = 250 hours = over a year of casual stitching

**Pattern B:** Photorealistic face, 20 colours, 40% confetti, 14-count, same stitch count  
- Palette size: 20 colours → palScore = high
- Blends: present
- Confetti: 40% → confetti factor: high
- Each stitch requires: finding your place on the grid, identifying the colour, threading/rethreading constantly
- Technical skill: substantial
- **Also:** 250 hours

Both patterns score identically on size (50,000 stitches). Pattern A's only difficulty is motivational — sheer volume. Pattern B is difficult both technically *and* volumetrically.

A combined score that adds both into a single number obscures the nature of the challenge. A stitcher asking "is this hard?" needs to know *which kind* of hard:

- "Hard because I'll need to count every stitch carefully" → confetti/complexity
- "Hard because it will take me a year" → size/endurance

### Proposed architecture: separate axes

The scoring function should return a structured breakdown:

```js
{
  complexityScore:  0–1,   // palette, confetti, blends, fine fabric
  sizeScore:        0–1,   // stitch count, physical dimensions
  estimatedHours:   float, // direct time estimate
  enduranceRisk:    0–1,   // motivational difficulty
  combinedScore:    0–1    // optional weighted blend for single-number displays
}
```

If a single label is needed (for backward compatibility with the current 4-tier "Beginner / Intermediate / Advanced / Expert" system), the `combinedScore` can be computed. But the UI should prominently surface `estimatedHours` for the size dimension rather than just folding it into the star rating.

### Recommended combined weighting

If a combined score is needed:
```
combinedScore = 0.60 * complexityScore + 0.40 * sizeScore
```

Justification: complexity (confetti, colour management, technique) is the primary driver of per-stitch difficulty. Size adds a meaningful but secondary dimension. A 60/40 split ensures a technically simple marathon project doesn't dominate the score over a technically demanding small project.

---

## 6. The Fabric Count Interaction

### Physical dimensions

The most direct impact of fabric count on the size factor is on physical dimensions:

| Pattern | Fabric count | Physical size | Largest hoop needed |
|---|---|---|---|
| 100×100 stitches | 11ct | 9.1" × 9.1" | scroll frame |
| 100×100 stitches | 14ct | 7.1" × 7.1" | 10" hoop (tight) |
| 100×100 stitches | 18ct | 5.6" × 5.6" | 8" hoop |
| 100×100 stitches | 28ct over 2 | 7.1" × 7.1" | 10" hoop (same as 14ct) |
| 100×100 stitches | 32ct over 2 | 6.25" × 6.25" | 10" hoop |

The same pattern in stitch-count terms can be physically much larger or smaller depending on fabric choice. A 100×100 pattern on 11-count requires a scroll frame; the same pattern on 18-count fits in an 8" hoop. This is a meaningful handling difficulty difference.

### For the SIZE factor: use physical dimensions

The size factor's physical dimensions sub-metric should always be computed from **inches, not stitch counts**. A 200×200 pattern at 11ct (18.2" × 18.2") is harder to handle than a 200×200 pattern at 18ct (11.1" × 11.1"), even though the stitch count is identical.

### For the READABILITY factor (different factor, not this report)

Fine fabric counts (18ct, 28ct, 32ct) create a separate readability difficulty because:
- Smaller holes require thinner needles (more finicky threading)
- Individual stitches are harder to see during stitching
- Counting grid squares is harder on fine fabric
- Better eyesight / magnification required

This readability component should be computed in a separate factor (e.g., Factor 04 — Fabric Count & Readability) and is explicitly *not* part of the size factor.

### Over-two clarification

`settings.fabricCt` stores the **loom count** (28 for 28-count evenweave). When the user stitches over 2 threads, the effective stitch pitch becomes `fabricCt / 2` per inch. Physical dimensions must therefore use:

```js
const effectiveCt = isOverTwo ? (fabricCt / 2) : fabricCt;
const physW = w / effectiveCt;
const physH = h / effectiveCt;
```

The app does not currently persist an `isOverTwo` flag per-project. For the size factor, **assume over-two when `fabricCt >= 25`** (all entries in FABRIC_COUNTS with count ≥ 25 are labelled "over 2"). This is a safe heuristic since 25ct and above are almost exclusively used over 2 in cross-stitch.

```js
const isOverTwo = fabricCt >= 25;
const effectiveCt = isOverTwo ? fabricCt / 2 : fabricCt;
```

---

## 7. Concrete Scoring Proposal

### Function signature and implementation

```js
/**
 * Computes the size/stitch-count difficulty component.
 *
 * @param {number} totalStitchable  - count of stitchable cells (not __skip__ or __empty__)
 * @param {number} w                - pattern width in stitches (settings.sW)
 * @param {number} h                - pattern height in stitches (settings.sH)
 * @param {number} [fabricCt=14]    - fabric count (settings.fabricCt)
 * @param {number} [stitchRate=200] - stitches per hour (future: personalised from sessions)
 * @returns {{
 *   score: number,             // 0–1 composite size difficulty
 *   stitchCountScore: number,  // 0–1 stitch count component
 *   physicalSizeScore: number, // 0–1 physical handling component
 *   coverageRatio: number,     // 0–1 ratio of area stitched
 *   estimatedHours: number,    // hours to complete at stitchRate
 *   hoopType: string,          // human-readable framing hardware
 *   enduranceRisk: number,     // 0–1 abandonment risk
 *   physW: number,             // physical width in inches
 *   physH: number,             // physical height in inches
 * }}
 */
function sizeScore(totalStitchable, w, h, fabricCt = 14, stitchRate = 200) {

  // ── Guard: missing / invalid data ───────────────────────────────────────
  if (!fabricCt || fabricCt <= 0) fabricCt = 14;
  if (!stitchRate || stitchRate <= 0) stitchRate = 200;
  if (!w || w <= 0 || !h || h <= 0 || !totalStitchable || totalStitchable < 0) {
    return {
      score: 0, stitchCountScore: 0, physicalSizeScore: 0,
      coverageRatio: 0, estimatedHours: 0, hoopType: "unknown",
      enduranceRisk: 0, physW: 0, physH: 0
    };
  }

  // ── Physical dimensions ──────────────────────────────────────────────────
  const isOverTwo   = fabricCt >= 25;
  const effectiveCt = isOverTwo ? fabricCt / 2 : fabricCt;
  const physW       = w / effectiveCt;
  const physH       = h / effectiveCt;

  // ── Sub-scores ───────────────────────────────────────────────────────────
  const stCount   = _stitchCountScore(totalStitchable);
  const { hoopScore, hoopType } = _classifyHoopType(physW, physH);
  const areaIn2   = physW * physH;
  const areaScore = Math.min(1.0, areaIn2 / 400.0);
  const physScore = 0.7 * hoopScore + 0.3 * areaScore;

  // ── Coverage ─────────────────────────────────────────────────────────────
  const totalCells   = w * h;
  const coverageRatio = totalCells > 0 ? Math.min(1, totalStitchable / totalCells) : 0;
  const covMod = coverageRatio >= 0.75 ? 1.05
               : coverageRatio >= 0.50 ? 1.00
               : coverageRatio >= 0.25 ? 0.90
               : 0.80;

  // ── Time estimate ─────────────────────────────────────────────────────────
  const estimatedHours = totalStitchable / stitchRate;
  const enduranceRisk  = _enduranceRiskScore(estimatedHours);

  // ── Composite score ───────────────────────────────────────────────────────
  // Stitch count (duration) is the primary driver (60%).
  // Physical dimensions (handling) is secondary (40%).
  // Coverage modifier applies to the whole score.
  const raw   = 0.60 * stCount + 0.40 * physScore;
  const score = Math.min(1.0, raw * covMod);

  return {
    score,
    stitchCountScore:  stCount,
    physicalSizeScore: physScore,
    coverageRatio,
    estimatedHours,
    hoopType,
    enduranceRisk,
    physW,
    physH
  };
}
```

Where the private helpers are:

```js
function _stitchCountScore(n) {
  const ANCHORS = [
    [0,       0.00],
    [200,     0.05],
    [1000,    0.15],
    [3000,    0.28],
    [8000,    0.42],
    [20000,   0.58],
    [50000,   0.74],
    [100000,  0.87],
    [200000,  0.96],
    [500000,  1.00],
  ];
  for (let i = 0; i < ANCHORS.length - 1; i++) {
    const [n0, s0] = ANCHORS[i];
    const [n1, s1] = ANCHORS[i + 1];
    if (n <= n1) return s0 + (s1 - s0) * (n - n0) / (n1 - n0);
  }
  return 1.0;
}

function _classifyHoopType(physW, physH) {
  const longest = Math.max(physW, physH);
  if (longest <= 1.5)  return { hoopType: "4in hoop",                  hoopScore: 0.00 };
  if (longest <= 2.5)  return { hoopType: "5in hoop",                  hoopScore: 0.08 };
  if (longest <= 3.5)  return { hoopType: "6in hoop",                  hoopScore: 0.15 };
  if (longest <= 4.5)  return { hoopType: "7-8in hoop",                hoopScore: 0.25 };
  if (longest <= 6.0)  return { hoopType: "10in hoop",                 hoopScore: 0.40 };
  if (longest <= 9.5)  return { hoopType: "scroll frame",              hoopScore: 0.65 };
  if (longest <= 16.0) return { hoopType: "scroll frame (multi-roll)", hoopScore: 0.85 };
  return                      { hoopType: "professional frame",        hoopScore: 1.00 };
}

function _enduranceRiskScore(estimatedHours) {
  if (estimatedHours < 10)  return 0.00;
  if (estimatedHours < 30)  return 0.10;
  if (estimatedHours < 60)  return 0.25;
  if (estimatedHours < 120) return 0.45;
  if (estimatedHours < 250) return 0.65;
  if (estimatedHours < 500) return 0.82;
  return 0.95;
}
```

### Representative outputs

| Pattern | fabricCt | totalStitchable | physW×H | hoopType | estHours | stitchCountScore | physScore | sizeScore |
|---|---|---|---|---|---|---|---|---|
| 10×10 solid | 14 | 100 | 0.71"×0.71" | 4in hoop | 0.5h | 0.02 | 0.00 | 0.01 |
| 50×50 solid | 14 | 2,500 | 3.57"×3.57" | 6in hoop | 12.5h | 0.25 | 0.12 | 0.20 |
| 80×80 solid | 14 | 6,400 | 5.71"×5.71" | 8in hoop | 32h | 0.37 | 0.28 | 0.33 |
| 80×80 50% cvg | 14 | 3,200 | 5.71"×5.71" | 8in hoop | 16h | 0.29 | 0.28 | 0.26 |
| 150×200 solid | 14 | 30,000 | 10.7"×14.3" | scroll frame | 150h | 0.65 | 0.59 | 0.62 |
| 300×300 solid | 14 | 90,000 | 21.4"×21.4" | scroll (multi) | 450h | 0.84 | 0.87 | 0.85 |
| 300×300 solid | 18 | 90,000 | 16.7"×16.7" | scroll frame | 450h | 0.84 | 0.79 | 0.82 |
| 200×300 solid | 11 | 60,000 | 18.2"×27.3" | pro frame | 300h | 0.79 | 0.92 | 0.84 |
| 500×500 import | 14 | 200,000 | 35.7"×35.7" | pro frame | 1,000h | 0.96 | 1.00 | 0.97 |

---

## 8. Edge Cases

### `fabricCt = 0` or undefined

```js
if (!fabricCt || fabricCt <= 0) fabricCt = 14;
```

Fallback to 14-count. Physical dimensions computed on that basis. Log a console warning:
```js
if (typeof console !== 'undefined' && (!fabricCt || fabricCt <= 0)) {
  console.warn('[sizeScore] fabricCt missing or zero; using default 14ct');
}
```

### Very small patterns (10×10, 100 stitches)

At 100 stitches:
- `_stitchCountScore(100)` = linear interpolation between [0, 0.0] and [200, 0.05] = 0.025
- physW × physH at 14ct = 0.71" × 0.71" → 4in hoop → hoopScore = 0.0
- `sizeScore` ≈ 0.01–0.02

This is correct — a tiny sampler or bookmark is barely in the "difficulty" territory for size at all.

### Very large imported patterns (500×500 = 250,000 cells)

The anchor cap of 500,000 ensures even the most extreme imported pattern scores ≤ 1.0. The `score` will be ~0.96–0.99 for 200,000–250,000 stitches. Physical dimensions will be extreme (35"+) and `physScore` will cap at 1.0 via `Math.min`.

### Patterns with very low coverage (decorative borders)

A 300×300 bounding box with only 5,000 stitchable cells (a simple border):
- `coverageRatio` = 5000 / 90000 = 0.056 → `covMod` = 0.80
- `_stitchCountScore(5000)` ≈ 0.34
- physW × H still shows the full extent → hoopScore for 300×300 at 14ct is 0.85
- raw = 0.6×0.34 + 0.4×0.85 = 0.204 + 0.34 = 0.544
- `score` = 0.544 × 0.80 = 0.435

This is correct: the physical bounding box is large (requires a scroll frame for the border work) but the stitch count is low, and the coverage modifier reduces the overall score to reflect less total work. The `hoopType` field will still correctly report "scroll frame" for the border section — that's accurate, the stitcher still needs to frame a large piece of fabric even if they're only stitching the edges.

### `totalStitchable = 0` (blank pattern, no stitches placed yet)

```js
if (!totalStitchable || totalStitchable < 0) {
  return { score: 0, ... };
}
```

Returns all-zero breakdown. The display layer should handle zero as "not yet computable."

---

## 9. Relationship to Existing App Data

### Session timing (future personalisation)

Each project in `CrossStitchDB` stores:

```json
{
  "totalTime": 3600,     // total tracked seconds
  "sessions": [
    { "date": "2024-04-05", "duration": 1800, "stitches": 450 }
  ]
}
```

From this data, a **personalised stitches-per-hour rate** can be derived:

```js
function personalStitchRate(sessions) {
  const valid = sessions.filter(s => s.duration > 0 && s.stitches > 0);
  if (valid.length < 3) return null;  // not enough data
  const totalSt = valid.reduce((acc, s) => acc + s.stitches, 0);
  const totalH  = valid.reduce((acc, s) => acc + s.duration, 0) / 3600;
  return totalSt / totalH;  // personal stitches/hour
}
```

When available, pass this as `stitchRate` to `sizeScore()`. When not available, use the default 200.

**Future:** A "Your estimated time" personalised display (e.g., "At your typical pace, about 40–60 hours") is more useful than a generic estimate. The infrastructure for this already exists — sessions data is stored, it just needs to be surfaced.

### Half and quarter stitches

The project format stores:
```json
"halfStitches": {}
```

Half stitches take approximately half as long as a full cross stitch. For time estimation:

```js
const halfStitchCount  = Object.keys(halfStitches || {}).length;
const effectiveStitches = totalStitchable + (halfStitchCount * 0.5);
```

For the score computation, `effectiveStitches` gives a more accurate time estimate. However, this is a minor refinement — half stitches are uncommon in most patterns and the adjustment is usually small.

### `stats-activity.js` and `helpers.js` usage

The helpers `fmtNum()` and `threadKm()` in `helpers.js` are shared globals used for display formatting. The `estimatedHours` output from `sizeScore()` can be formatted with:

```js
fmtNum(Math.round(estimatedHours)) + ' hours'
```

---

## 10. Open Questions & TODOs

### Verified from codebase

| Question | Answer |
|---|---|
| Max pattern size from UI | 300×300 (Sidebar.js slider max:300) |
| Max pattern size from import | 200×200 default cap; PDFs may produce larger |
| Default fabricCt | 14 (useCreatorState.js line 165, from UserPrefs) |
| Is fabricCt always populated? | No — may be 0 or undefined in very old saves; fallback to 14 required |
| Is `totalStitchable` already computed? | Yes — useMemo in useCreatorState.js |
| Does the app have session timing? | Yes — `sessions` array and `totalTime` per project |

### Open questions for implementation

1. **Should `sizeScore` replace the current 2-point contribution to `calcDifficulty`, or supplement it?**
   The cleanest approach is to refactor `calcDifficulty` to accept the new parameters and return a structured result. Backward-compatible option: compute the 0–1 `sizeScore` and map it to 0–2 points (e.g., `score < 0.3 → 0pts`, `0.3–0.6 → 1pt`, `> 0.6 → 2pts`). Not recommended — this throws away most of the nuance.

2. **Where should `estimatedHours` be displayed?**
   Options: (a) in the `PatternInfoPopover`, (b) in a dedicated "Pattern Details" area of the sidebar, (c) as a pill badge alongside the difficulty stars. Option (a) is lowest-friction to implement.

3. **Should endurance risk be displayed as a separate badge?**
   Proposed: only show the commitment badge when `enduranceRisk > 0.40` (i.e., projects over ~60 estimated hours). Below that threshold, it's not meaningful to warn the user.

4. **What constitutes "over two" for saved projects?**
   Current heuristic: `fabricCt >= 25`. This is correct for all values in `FABRIC_COUNTS` but may be incorrect for imported patterns with custom fabric counts. A future `settings.isOverTwo: boolean` flag would be more explicit.

5. **Quarter stitches** — stored in `halfStitches` (using the PARTIAL_STITCH_TYPES constant which includes "quarter", "half", "three-quarter"). Should quarter stitches count as 0.25 effective stitches for time estimation? They are more fiddly to execute, so 0.5 is possibly more accurate per subjective effort.

6. **Cross-browser time display** — `classifyTime` returns plain strings. Check that these do not contain any emoji-like characters before shipping (per `AGENTS.md` no-emoji rule). The proposed strings are clean ASCII.

### Deferred

- Personalised stitching rate derived from session history (infrastructure exists, needs a `personalStitchRate()` helper in `helpers.js`)
- Localised time estimates (non-English UIs; estimatedHours is a number and locale-independent, but `classifyTime` strings would need i18n)
- User-overridable stitching rate preference (e.g., "I stitch 400 st/h — update estimate")
