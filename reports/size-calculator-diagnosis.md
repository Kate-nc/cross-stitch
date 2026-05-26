# Size Calculator Diagnosis

**Date:** May 2026  
**Files examined:** `creator/ProjectTab.js`, `threadCalc.js`, `creator/PrepareTab.js`, `creator/LegendTab.js`

---

## What the current calculators do

### 1. Finished-size table — `creator/ProjectTab.js` `renderFinishedSize`

The fabric table uses a hardcoded list and computes width/height like this:

```js
var fabrics = [
  {ct:14, label:"14 count Aida"},
  {ct:16, label:"16 count Aida"},
  {ct:18, label:"18 count Aida"},
  {ct:20, label:"20 count Aida"},
  {ct:22, label:"22 count Aida"},
  {ct:25, label:"25 count Evenweave"},
  {ct:28, label:"28 count Evenweave (over 2)"}
];

var div = f.ct === 28 ? 14 : f.ct;   // ← only 28-ct gets the over-2 divisor
var wIn = ctx.sW / div;
var hIn = ctx.sH / div;
// ... display columns ...
(wIn + 2).toFixed(0) + "″ × " + (hIn + 2).toFixed(0) + "″"   // ← "with margin"
```

### 2. Fabric calculator — `creator/PrepareTab.js` and `creator/LegendTab.js` `calcFab`

Both files share this helper (defined independently in each):

```js
function calcFab(ct, div) {
  var ef  = div ? ct / div : ct;         // effective SPI
  var wIn = sW / ef + margin * 2;        // ← margin * 2 = margin each side ✓
  var hIn = sH / ef + margin * 2;
  ...
}
// Called as:
calcFab(f.ct, overTwo ? 2 : null)   // overTwo is a user checkbox (default false)
```

### 3. Thread estimator — `threadCalc.js` `stitchesToSkeins`

```js
const holePitchCm      = 2.54 / fabricCount;
const threadPerStitchCm = holePitchCm * 4.8 * strandsUsed;   // ← coefficient 4.8
const totalThreadCm    = stitchCount * threadPerStitchCm;
const skeinLengthCm    = skeinLengthM * 100;
const usablePerSkeinCm = skeinLengthCm * 6 * (1 - wasteFactor);  // ← * 6 bug
let   skeinsRaw        = totalThreadCm / usablePerSkeinCm;
```

---

## Confirmed failure modes

### Failure A — ProjectTab: stitch-over ignored for all fabrics except 28-count

**Root cause:** `var div = f.ct === 28 ? 14 : f.ct` treats only 28-count as
"over 2" evenweave. Every other count is treated as Aida (stitch-over 1).
25-count evenweave is listed in the fabric table but uses `div = 25` instead
of the correct `div = 25 / 2 = 12.5`.

| Fabric | Expected effective SPI | Code's `div` | Code result (140 wide) | Correct result |
|---|---|---|---|---|
| 14-ct Aida (over 1) | 14 | 14 | **10.0″** ✓ | 10.0″ |
| 25-ct Evenweave (over 2) | 12.5 | **25** | **5.6″** ✗ | 11.2″ |
| 28-ct Evenweave (over 2) | 14 | 14 | **10.0″** ✓ (right answer, right reason) | 10.0″ |

For 25-count evenweave, the calculator produces a size **2× too small** — the
classic "ignoring stitch-over" failure mode described in the spec.

### Failure B — ProjectTab: margin hardcoded at 1″ per side, not configurable

**Root cause:** `(wIn + 2)` adds 2 inches total to the width (and height),
which is 1 inch per side. There is no user control and no label telling the
user what margin size is assumed.

The correct formula is `designWidthIn + 2 × marginPerSideIn`. With the
widely-recommended default of 3″ per side for framing, the cut width should
be `designWidthIn + 6″`, not `designWidthIn + 2″`.

**Worked example — 140 stitches wide on 14-ct:**

| Margin per side | Cut width (correct) | Code output |
|---|---|---|
| 1″ (code's assumption) | 10.0 + 2.0 = 12.0″ | 12″ ✓ (but 1″ is too small for framing) |
| 3″ (recommended default) | 10.0 + 6.0 = **16.0″** | 12″ ✗ |

### Failure C — threadCalc.js: `* 6` bug in usable-skein length

**Root cause:** `usablePerSkeinCm = skeinLengthCm * 6 * (1 - wasteFactor)`.
The `* 6` multiplies the skein length by the number of strands in DMC floss,
treating every strand as an independent 8 m skein. This inflates the
calculated usable thread per skein by **6×**.

### Failure D — threadCalc.js: coefficient `4.8` is ~3× too small

**Root cause:** `threadPerStitchCm = holePitchCm * 4.8 * strandsUsed`.
The factor of 4.8 produces 0.686 inches per stitch at 14-ct with 2 strands.
The calibrated reference value (anchored to published calculators, see Phase 2)
is ~1.4 inches per stitch at those parameters. The coefficient should be ~10.3
(in the `holePitchCm × coefficient × strandsUsed` form) to match the reference.

### Combined thread-calc error

Failure C (÷ 6 under-counts thread demand) and Failure D (÷ 2 from the
under-sized coefficient) multiply together:

| | Stitches per skein |
|---|---|
| **Old code** (14-ct 2 strands, 8 m DMC, 20% waste) | ≈ **2 204** |
| **Correct** (same params, 200–250 base range, 20% waste) | ≈ **187** |
| Error factor | ≈ **11.8×** too many stitches per skein |

Practical consequence: the tool told a stitcher they needed ~2 skeins for
5 000 stitches. The correct answer is ~27 skeins (with 20% waste).

---

## PrepareTab / LegendTab — not buggy in margin math

These two components compute margins correctly: `sW / ef + margin * 2` adds
`margin` to BOTH sides (correct). Their "Over two" checkbox correctly halves
the effective count when checked. They are **not** affected by Failures A or B.
They **do** rely on `stitchesToSkeins` from `threadCalc.js` and are therefore
affected by Failures C and D.

---

## Closing note

**Root causes confirmed:**

| ID | Location | Root cause |
|---|---|---|
| A | `ProjectTab.js` | Only `f.ct === 28` gets `÷ 2`; all other evenweave treated as Aida |
| B | `ProjectTab.js` | `+2` hardcoded (1″/side); no user control; should be `+2 × margin` |
| C | `threadCalc.js` | `* 6` in usable-skein formula — 6× too much skein capacity assumed |
| D | `threadCalc.js` | Coefficient 4.8 → 0.686 in/stitch (should be ~1.4 in/stitch at 14-ct 2s) |

**What changed in Phase 2–3:**

- `pattern-size-calc.js` introduces three pure functions: `calcEffectiveSPI`,
  `calcDesignSizeIn`, `calcCutSizeIn`, and `toDisplayDimensions`.
- `threadCalc.js` is rewritten around named module-root constants
  (`BASE_THREAD_PER_STITCH_IN = 1.4`, `BASE_FABRIC_COUNT = 14`,
  `BASE_STRANDS = 2`, `INCHES_PER_METRE = 39.3701`). The `* 6` is removed;
  the formula works in inches; `totalWithWaste = flossLength × (1 + wasteFactor)`.
- `creator/ProjectTab.js` `renderFinishedSize` gains a configurable per-side
  margin (default 3″) and per-row stitch-over derived from the fabric type,
  with a global user override.

**Thread model assumptions and constant sources:**

- `BASE_THREAD_PER_STITCH_IN = 1.4` inches: derived by calibration to satisfy
  all three published stitches-per-skein reference ranges simultaneously
  (14-ct: 200–250, 16-ct: 250–280, 18-ct: 280–300) with no-waste baseline.
  Frequently cited approximation in the cross-stitch community is "~1.5 inches"
  — 1.4 is within that range and the `~` is accurate.
- `SKEIN_LENGTH_M = 8.0` m (DMC standard; Madeira = 10 m as before).
- Strand scaling: `threadPerStitch = BASE × (14/count) × (strands/2)` —
  linear in strand count (each additional strand uses proportionally more thread)
  and inversely proportional to fabric count (smaller stitches use less thread).
- `DEFAULT_WASTE_FACTOR = 0.15` (15%). Applied as a multiplier:
  `totalWithWaste = flossLength × (1 + wasteFactor)`.
- `DEFAULT_MARGIN_PER_SIDE_IN = 3` (both sides applied, so +6″ per dimension).

**Out of scope / coarser estimates:**

- **Backstitch** thread usage is not computed per-stitch because it depends on
  the specific backstitch path length, which is not currently stored as
  segment lengths in the project data format. If added in future, convert
  backstitch segment length (in stitch units) to inches via
  `segmentLengthStitches / effectiveSPI × strandsUsed × threadPerUnitLength`.
- **Quarter and three-quarter stitches** are estimated at the full cross-stitch
  rate; they genuinely use ~50–75% of full stitch thread, so this slightly
  over-estimates for fractional stitch colours.
