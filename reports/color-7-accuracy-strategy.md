# Color Report 7 — Accuracy Strategy

## What "Accurate" Means for This App

Before choosing a strategy, we must define what accuracy means in this specific
context. The full constraints are:

1. **No official source**: DMC does not publish spectrophotometer RGB values.
   All available data is approximate.
2. **Physical variation exists**: Dye lot variation means any single "correct"
   RGB value is a sample from a distribution with σ ≈ ΔE₀₀ 0.5–2.0.
3. **Display variation exists**: Uncalibrated consumer displays vary by ΔE₀₀ 2–5
   between devices. We cannot control this.
4. **Some colors are outside sRGB gamut**: Highly saturated dyes may clip.
5. **Texture and environment affect perceived color**: Screen swatches will always
   look different from physical thread.

**Achievable accuracy target:** Given these constraints, the realistic accuracy
goal is **ΔE₀₀ ≤ 2.0** between stored RGB and the community consensus reference,
for all colors. This is "just at the threshold of perceptibility" for a typical
observer. It means:
- No color is obviously wrong
- Colors are consistent with the cross stitch community's established reference
- The app is as accurate as other well-regarded tools

**Unachievable goals to avoid committing to:**
- "Exact match to physical thread" — impossible without spectrophotometer data
  and ignores dye lot variation
- "Looks the same on all screens" — impossible without display calibration
- "Looks like the physical thread" — texture, sheen, and environment prevent this

---

## The Three-Layer Strategy

Accuracy should be addressed at three independent layers, in priority order:

### Layer 1: Data Quality (Critical, address first)
Fix the underlying color data to use the best available community consensus values.
This addresses the root cause: our current data has errors that are too large
to be attributable to inherent limitations.

**Specific actions:**
- Fix the three confirmed critical errors: blanc/B5200 conflation, 02/318 conflation,
  DMC 666 hue error
- Audit all 519 colors against the community consensus dataset and replace any
  value where ΔE₀₀ > 2.0 vs the reference
- Add data provenance: a comment block in `dmc-data.js` documenting the source,
  methodology, and known limitations

**Scope:** `dmc-data.js` only (the rendering pipeline is already correct).

**Downstream impact:**
- The color matching engine (`colour-utils.js` `findBest()`) will produce
  different results after the data update. This is intended: the new data is
  more accurate, so matches will be more accurate.
- Existing user projects store pattern data (thread IDs, not RGB values), so
  stored patterns will automatically benefit from the updated colors.
- The stash manager (`manager-app.js`) uses the same DMC data for swatch display.

**Risk:** Any existing user who has made color choices based on the current
(incorrect) values may be surprised to see colors shift. This is unavoidable
and correct — the old values were wrong.

---

### Layer 2: Rendering Context (High value, low risk)
Improve how colors are presented to users to minimize perceptual distortion
and set accurate expectations.

**Specific actions:**
1. **Fabric background preview**: Allow users to set a fabric background color
   when viewing the pattern. White Aida, natural linen, and black Aida all affect
   perceived thread color significantly. This is a practical tool that helps
   stitchers see colors in context.

2. **Similar-color warnings**: When a palette contains two colors with ΔE₀₀ < 3.0,
   show a warning. This is directly useful: "these threads look very similar on
   screen — verify against a physical color card." Also prevents the auto-generation
   engine from producing palettes that are unnecessarily hard to distinguish.

3. **Screen-is-approximate disclaimer**: A small, unobtrusive note near swatches
   or in the color picker: "Colors are screen approximations — use the thread
   code as the authoritative reference." This is Pantone's approach applied to
   cross stitch.

**Scope:** UI components in `components.js`, `creator/`, `manager-app.js`.
No changes to `dmc-data.js` for this layer (data should be correct first).

---

### Layer 3: Color Matching Quality (Medium value, higher complexity)
The color distance function used for thread matching (`dE()` in `colour-utils.js`)
currently uses Euclidean distance in L\*a\*b\* space. This is faster than CIEDE2000
but less perceptually accurate, particularly for blues and purples.

**Specific actions:**
1. Upgrade `dE()` or provide a `dE2000()` alternative for use in `findBest()`
   and similar palette matching operations
2. Keep the fast `dE()` for operations that need speed (e.g., per-pixel closest-color
   in image quantization)
3. Use `dE2000()` for user-facing color comparison operations where accuracy
   matters more than speed

**Scope:** `colour-utils.js`, with cascading effects on `findBest()`, the stash
adaptation engine, and the creator's palette picker.

**Note:** This is a separate concern from data quality. Even with perfect data,
the matching engine uses an inferior distance metric. Conversely, fixing the data
first means any match improvement is not confused by data errors.

---

## Priority Matrix

| Action | Impact | Complexity | Risk | Priority |
|--------|--------|-----------|------|---------|
| Fix blanc/B5200 identical values | High | Very Low | Very Low | P0 |
| Fix 02/318 identical values | High | Very Low | Very Low | P0 |
| Fix DMC 666 hue error | Critical | Very Low | Very Low | P0 |
| Full data audit vs community consensus | High | Medium | Low | P1 |
| Similar-color warnings in palette picker | High | Medium | Low | P1 |
| Screen disclaimer on swatches | Medium | Low | Very Low | P1 |
| Fabric background preview | High | Medium | Low | P2 |
| Upgrade matching to CIEDE2000 | Medium | Medium | Low | P2 |
| Texture simulation on swatches | Low | High | Medium | P3 |
| Photographic thread swatches | Low | Very High | Medium | Backlog |

---

## Data Source Strategy

For the full data audit (P1), the recommended strategy is:

### Primary source: community consensus
Use the community consensus dataset (PC Stitch/Lord Libidan lineage) as the
primary reference. This is the most human-validated dataset available and is
used by or compatible with the major established tools.

### Conflict resolution
Where our current values differ from the community consensus:
- If ΔE₀₀ < 2.0: keep our current value (within acceptable tolerance, not worth
  introducing a change that could surprise users)
- If ΔE₀₀ 2.0–5.0: replace with community consensus value, flag in data comments
- If ΔE₀₀ > 5.0: replace with community consensus value, mandatory fix

### Secondary validation
For the most important colors (top 50 most-used colors in typical patterns:
310, 321, 666, 3865, ecru, blanc, B5200, white, 317, 318, 414, 415, 434, 435,
436, 437, 647, 648, 3787, 3866, plus all primary/secondary hues), cross-check
against the nathantspencer DMC website scrape as a secondary source.

Where both sources agree to within ΔE₀₀ 2.0: high confidence, use value.  
Where sources disagree by > ΔE₀₀ 2.0: flag for manual review, add comment to data.

### Provenance documentation
Every change to `dmc-data.js` should be documented in a header comment block:
```
// DMC thread colors — sourced from [source name] ([year])
// Reference: [URL or citation]
// Methodology: [description]
// Known contested colors: [list]
// Last reviewed: [date]
```

---

## Communicating Changes to Users

When the data update ships:

### What to say in release notes
"Improved color accuracy for DMC thread swatches throughout the app. Colors
now match the cross-stitch community's established reference values more closely.
Screen colors remain approximations — we recommend using the DMC thread number
as the authoritative reference and verifying critical color choices against a
physical color card."

### What NOT to say
"We've made our colors exactly accurate." This is false and will be disproven by
any stitcher who compares screen to physical thread.

### Long-term tone
The app should position itself as providing "the best available screen approximation"
rather than claiming accuracy it cannot achieve. This is more honest and builds
more durable trust.

---

## Success Criteria

After implementation, the changes should be verifiable against these criteria:

### Data quality
- Zero color pairs with ΔE₀₀ = 0.00 (no identical values)
- Zero colors with ΔE₀₀ > 5.0 vs the community consensus reference
- ≤ 20 colors with ΔE₀₀ 2.0–5.0 vs the community consensus reference
- All 519 colors have documented provenance in the data file header

### User-facing
- The colour picker no longer shows visually identical swatches for blanc/B5200
  or 02/318
- A user selecting DMC 666 sees a deep warm red (not a pink)
- The similar-color warning appears when a palette contains ΔE₀₀ < 3.0 pairs

### Regression check
- The PDF export renders pattern thread colors using the same updated data
- Existing saved projects continue to load correctly (they store thread IDs,
  not RGB values — the correct behavior is for the display to update to the
  improved colors)
- The color matching engine produces reasonable results for the test cases in
  `tests/dE.test.js`
