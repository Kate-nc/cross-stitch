# Stash-Adapt — Phase 2.6 — Match-Quality UI Options

The hard rule from the spec: *"Match quality communication must be
honest. If a match is poor, say so clearly."*

## What stitchers actually need to know

In priority order:

1. **Will this look wrong in the finished piece?** (binary, gut-level)
2. **Why might it look wrong?** (lighter, darker, hue-shifted, lower
   chroma…)
3. **Is there a better option I'm missing?** (one click to see)
4. **What does the original look like vs the substitute?** (side-by-side
   swatch)

What they do *not* need:

- "87% match" vs "91% match" (false precision; ΔE units don't translate).
- Raw ΔE numbers (meaningless to the audience; fine in a power-user
  tooltip).
- Five tiers (more cognitive load than the underlying signal warrants).

## Building blocks

| Block | What it shows | Pros | Cons |
|---|---|---|---|
| **Tier label** | "Close" / "Good" / "Fair" / "Poor" / "No match" | Quick read; honest words | Words alone can be missed in scan |
| **Coloured dot** | Green / amber / red filled circle | Instant scan; survives small UI | No info on direction |
| **4-segment bar** | ●●●● → ●●○○ visual | Calibrated, scannable | Easy to mistake for "battery" |
| **Side-by-side swatch** | Original swatch ▮ Substitute swatch | Most honest visual signal | Costs horizontal space |
| **Diff annotation** | "Slightly lighter, less saturated" | Educates; helps decide | Hard to phrase well; verbose |
| **ΔE number in tooltip** | `ΔE 4.2 (CIEDE2000)` | For power users / debugging | Noise to most |

## Three combinations

### Combo 1 — *Dot + tier label + side-by-side*

```
 ●  DMC 310    →  ●  DMC 310    ● Exact
 ●  DMC 824    →  ●  DMC 939    ● Good
 ●  DMC 3801   →  ●  DMC 309    ● Fair
 ●  DMC 3849   →  ○  none       ◌ No match
```

- Two swatches per row are the side-by-side signal.
- Tier label spelled out, never abbreviated.
- ΔE number lives in a hover tooltip.

**Pros:** the dot + word combo is the literal definition of "say it
clearly." Side-by-side is unambiguous.

**Cons:** the dot is decorative if the words are present; could be seen
as redundant.

### Combo 2 — *Calibrated bar + tier label + side-by-side*

```
 ●  DMC 310    →  ●  DMC 310     ●●●●  Exact
 ●  DMC 824    →  ●  DMC 939     ●●●○  Good
 ●  DMC 3801   →  ●  DMC 309     ●●○○  Fair
 ●  DMC 3849   →  ○  none        ○○○○  No match
```

- The bar gives an at-a-glance ranking even before the eye reaches the
  word.
- The same vocabulary across the app for scanning long lists.

**Pros:** scans fastest of the three for sorted/filtered review. Plays
well with the "Sort by quality" filter.

**Cons:** segmented bars look like a battery / signal-strength
indicator; can imply quantitative precision the formula doesn't quite
deliver.

### Combo 3 — *Dot + tier label + side-by-side + diff hint*

```
 ●  DMC 310    →  ●  DMC 310    ● Exact
 ●  DMC 824    →  ●  DMC 939    ● Good — slightly darker
 ●  DMC 3801   →  ●  DMC 309    ● Fair — pinker, less orange
 ●  DMC 3849   →  ○  none       ◌ No match
```

- A short Lab-derived hint per non-exact match.
- Hint phrasing comes from comparing Lab axes:
  - `L` delta → "lighter" / "darker"
  - `a` delta → "more red" / "more green" (in stitcher-friendly terms,
    "warmer" / "cooler" can be ambiguous)
  - `b` delta → "more yellow" / "more blue"
  - chroma delta → "richer" / "duller"
- Hint only shown for non-Exact matches with `|ΔL|+|Δa|+|Δb| > 1`.

**Pros:** maximally honest; teaches users to predict.

**Cons:** verbose; can be tonally awkward ("pinker" reads odd to some);
risks over-prescribing what the user will perceive (lighting, fabric
colour change the actual outcome).

## Recommendation: **Combo 1**, with Combo 3's diff hint promoted to a hover/expand affordance

Default rendering = dot + tier label + side-by-side. Hovering or
tapping a row's quality chip reveals the Lab-derived hint and the raw
ΔE2000 value:

```
hover/tap →   Fair · ΔE2000 5.4
              "Replacement is pinker and less orange than the original."
```

Reasons:

- Combo 1 is the cleanest in the table view, where most decisions get
  made.
- The diff hint's value is high *when needed* (deciding on a fair/poor
  row) and noise everywhere else; on-demand exposure is the right
  trade.
- Falls back gracefully on mobile: hint is a tap, not a hover.

The bar from Combo 2 is **rejected** — the battery-meter ambiguity is a
real risk for a feature whose explicit purpose is honest signalling.

## Tier definitions (already established in report 2)

| Tier | ΔE2000 | Dot colour token |
|---|---|---|
| Exact | < 1 | `--success` (filled) |
| Close | < 3 | `--success` (filled) |
| Good | < 5 | `--success` |
| Fair | < 10 | `--warn` (amber) |
| Poor | < 20 | `--danger` |
| No match | ≥ 20 *or* `target === null` | `--danger` (ring only, hollow) |

> "Exact" and "Close" share a colour token because the visual difference
> at ΔE 0 vs ΔE 2.5 is below most stitchers' thresholds; we collapse
> them visually but keep the label distinct so the rare ΔE-0 cases
> ("310 → 310") are explicitly recognisable.

## Accessibility

- Colour is never the only signal: every dot is paired with the tier
  word.
- Hollow vs filled distinguishes "no match" from "match" without
  relying on colour alone.
- Side-by-side swatches use a 1px border (`--line`) so users with
  reduced colour vision still see the swatch boundary against any
  background.
- ΔE chip in the tooltip is read by screen readers via `aria-label`:
  *"Match quality: Good. Delta E 4.2."*

## Where else the indicator appears

- **Review screen rows** (primary).
- **Picker / detail modal** — every option in the picker shows its tier
  chip relative to the row's source colour.
- **Editor palette panel** for adapted patterns — small chip beside each
  swap row in a "Show changes" view.
- **Export PDF metadata** — adaptation summary lists original →
  replacement → tier word (no dot in print). Plain text so it survives
  black-and-white printing.
- **Project list** for adapted patterns — *aggregate* badge: "23 close,
  4 fair, 3 no match" or, when all good, "All matches close." The list
  doesn't try to render per-colour quality.
