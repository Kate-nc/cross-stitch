# Color Report 9 — Proposals for User Approval

## Overview

Based on the investigation in Reports 1–8, three implementation approaches are
proposed. They are not mutually exclusive — Approach A is the minimum viable fix,
and B/C build on it.

**The Phase 4 review gate question for the maintainer:**

> Which approach do you want to implement, and do you want to do it all at once
> or in phases?

---

## Approach A: Data Fix Only (Minimum Viable, Low Risk)

**Summary:** Fix the known data errors and improve data quality. No UI changes.
Ship as a silent bug fix.

**Changes:**
1. Fix `blanc` → `rgb(255, 251, 245)` (distinguish from B5200)
2. Fix `02` → `rgb(178, 178, 178)` (distinguish from 318)  
3. Fix `666` → `rgb(205, 10, 24)` (correct hue: deep warm red, not pink)
4. Run full audit vs community consensus — fix all colors with ΔE₀₀ > 2.0 (~15–30 additional colors)
5. Add provenance header comment to `dmc-data.js`

**Not included:**
- UI changes (no similar-color warnings, no disclaimer, no fabric preview)
- Matching engine upgrade (dE still Euclidean)

**Effort:** Low. One file changed (`dmc-data.js`). Requires writing the audit
script and reviewing its output. Estimated: 2–3 hours of focused work.

**Risk:** Very low. Data-only change. All consumers read the same array format.
Existing tests still pass (they test the algorithm, not specific RGB values).

**User-facing impact:** Colors change subtly for ~20–35 thread codes. Users
who care about accuracy will notice improvements. Users who don't will not notice.
The blanc/B5200 distinction will be visible to anyone using both in a palette.

**Release note:** "Improved colour accuracy: DMC thread colour values updated
to match the community consensus reference. Colours are now more accurate for
several threads including DMC 666 (Christmas Red Bright), DMC blanc, and DMC
B5200. Screen colours remain approximations — always verify against a physical
colour card."

---

## Approach B: Data Fix + Matching Upgrade + Subtle UX Improvements

**Summary:** Everything in Approach A, plus an upgraded color matching engine
and minimal UX additions that improve user understanding without redesigning
anything.

**Changes (on top of A):**
1. Add `dE00()` (CIEDE2000) to `dmc-data.js`
2. Wire `dE00()` into `findBest()` for user-facing matching operations
3. Add similar-color warning in the palette list (icon + tooltip)
4. Add one-line screen disclaimer in the materials/palette header
5. Add fabric background color to canvas (dropdown with presets)

**Effort:** Medium. Multiple files, one moderate-complexity algorithm addition,
several UI touchpoints.

**Risk:** Low-medium. The CIEDE2000 upgrade changes matching results — some
existing stash adaptations will produce slightly different substitution suggestions.
This is an improvement, not a regression. The UI additions are additive.

**User-facing impact:**
- Stash adaptation engine suggests more perceptually accurate substitutions
- Palette users see warnings when two colors are dangerously similar
- Pattern planning benefits from fabric background preview
- Trust improved through honest disclaimer

**Estimated effort:** 6–10 hours spread across multiple files.

---

## Approach C: Data Fix + Full Colour Experience Upgrade

**Summary:** Everything in Approaches A and B, plus a richer color presentation
— texture simulation on swatches and enhanced color information display.

**Changes (on top of B):**
1. CSS texture simulation on color swatches (subtle linear gradient to suggest
   thread specularity — a fine diagonal highlight)
2. Thread color detail popover: show the DMC code prominently, add note "this is
   the authoritative reference", show swatch on multiple fabric backgrounds
   (white, natural, black) side by side
3. Similar-color comparison tool in the palette picker: when you click a color
   that has a similar neighbor, show both swatches large with the ΔE₀₀ value
   and a note ("these threads are very close — ΔE₀₀ 2.1 — barely distinguishable
   even in person")

**Effort:** High. The texture simulation requires careful tuning to not shift
perceived hue. The detail popover requires new component work.

**Risk:** Medium. The texture CSS adds visual complexity. The comparator tool
adds navigation complexity. If not well-executed, these could feel cluttered.

**User-facing impact:** Highest quality thread color experience in any cross
stitch app. Would be a genuine differentiator. The honesty of "these look similar"
warnings positions the app as a trusted advisor rather than a magic oracle.

---

## Decision Matrix

| Criterion | Approach A | Approach B | Approach C |
|-----------|-----------|-----------|-----------|
| Effort | Low | Medium | High |
| Risk | Very Low | Low | Medium |
| Data accuracy | Improved | Improved | Improved |
| Matching accuracy | No change | Improved | Improved |
| User trust building | Slight | Moderate | High |
| Differentiator vs competitors | No | Moderate | Strong |
| Timeline (estimate) | 1 day | 3–4 days | 1–2 weeks |

---

## Recommendation

**Start with Approach B.**

Rationale:
- Approach A is the floor (it must be done regardless) but leaving out the
  similar-color warnings misses the most user-valuable feature
- Approach B covers the matching engine upgrade (which has been deferred for
  long enough — Euclidean LAB is a known inaccuracy, especially for blues)
- The fabric background preview is low-effort and high-value for stitchers
- Approach C's texture simulation has unclear value vs effort ratio — it should
  be evaluated as a future enhancement after B ships and user feedback is gathered

**Phase the delivery:**
1. **Phase B1 (quick win):** Fix blanc/B5200, 02/318, 666 data immediately —
   these three fixes take minutes and address the most glaring errors
2. **Phase B2 (full audit):** Run the audit script, review and apply remaining
   changes, add CIEDE2000
3. **Phase B3 (UX):** Similar-color warnings, disclaimer, fabric preview

---

## Wireframes

Visual mockups for the UX additions (Approach B) are in `reports/color-wireframes/`:

- `color-wireframes/swatch-comparison.html` — side-by-side current vs corrected
  colors for the 20 most affected threads
- `color-wireframes/similar-warning.html` — mockup of the similar-color warning
  in the palette list
- `color-wireframes/fabric-preview.html` — mockup of the fabric background
  color control and its effect on the pattern canvas

---

## One Thing That Must Not Be Done

**Do not claim the app's colors are "exact" or "calibrated."**

Any marketing copy, in-app text, or release note that implies the screen colors
exactly match physical thread will damage trust when users inevitably find
discrepancies (which they will, due to the inherent physics described in
Report 3). The correct framing is:

> "The best available screen approximation of DMC thread colours."

This is honest, defensible, and still significantly better than most competitors.
