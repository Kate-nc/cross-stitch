# Real-Time Stash Deduction — UI Proposal Ranking

Scores are 1 (worst) → 5 (best) for each criterion.

## Proposals

| # | File | One-line summary |
|---|------|-----------------|
| A | `realtime-deduction-a-minimal-ambient.html` | Numbers update silently; no animations; compact inline bar + collapsible waste settings |
| B | `realtime-deduction-b-visual-satisfying.html` | SVG spools drain visually; burst animation on stitch; first-use wizard |
| C | `realtime-deduction-c-data-forward.html` | Three-tab sidebar with full data table, sparkline projection, and live formula display |
| D | `realtime-deduction-d-inline-fraction.html` | Fractional skein meter in each thread row; low-thread toast; gear-icon flyout for waste settings |

---

## Scoring Matrix

| Criterion | Weight | A Minimal | B Visual | C Data-Forward | D Inline Fraction |
|-----------|--------|-----------|----------|----------------|-------------------|
| **Cognitive load** (lower = better) | ×2 | **5** | 3 | 2 | **5** |
| **Accuracy trust** | ×2 | 3 | 2 | **5** | 4 |
| **Distraction level** (less = better) | ×2 | **5** | 2 | 3 | 4 |
| **Delight / motivation** | ×1 | 2 | **5** | 3 | 3 |
| **Implementation complexity** (simpler = better) | ×2 | **5** | 2 | 3 | 4 |
| **Mobile usability** | ×1 | 3 | 3 | 2 | **5** |
| **Graceful degradation** (disable/skip path) | ×1 | 4 | 3 | 3 | **5** |
| **Consistency with existing UI** | ×2 | **5** | 3 | 3 | 4 |

### Weighted Totals

| Proposal | Score |
|----------|-------|
| A — Minimal/Ambient | (5×2)+(3×2)+(5×2)+(2×1)+(5×2)+(3×1)+(4×1)+(5×2) = **49** |
| B — Visual/Satisfying | (3×2)+(2×2)+(2×2)+(5×1)+(2×2)+(3×1)+(3×1)+(3×2) = **29** |
| C — Data-Forward | (2×2)+(5×2)+(3×2)+(3×1)+(3×2)+(2×1)+(3×1)+(3×2) = **34** |
| D — Inline Fraction | (5×2)+(4×2)+(4×2)+(3×1)+(4×2)+(5×1)+(5×1)+(4×2) = **46** |

---

## Criterion Notes

### Cognitive load
- **A/D** — information density is unchanged. You scan a number; if it doesn't alarm you, you keep stitching.
- **C** — three tabs plus a sparkline chart demand active attention every time you glance at it.
- **B** — animations pull the eye away from the fabric.

### Accuracy trust
- **C** scores highest because the formula is fully visible (every variable labelled in the Settings tab). Power users who care about precision will find this reassuring.
- **D** exposes the cost-per-stitch readout in the gear flyout — sufficient for most users without being noisy.
- **A** hides the formula behind a collapsible; users must choose to look.
- **B** maps accuracy to a visual metaphor (spool fill level), which erodes precision trust for anything finer than "roughly half a skein".

### Distraction level
- **A** uses no animation. Numbers change; you blink and miss it.
- **D** fires a toast only on a low-thread crossing event — rare and actionable.
- **C** is passive distraction: the projection chart changes with every stitch, tempting constant checking.
- **B** is high distraction by design (burst + toast for every completed skein).

### Delight / motivation
- **B** is the clear winner: draining spools and completion celebrations are inherently satisfying.
- **A** offers none — it is purely functional.

### Implementation complexity
- **A** adds one inline display block and one collapsible section — fewest new DOM elements.
- **D** adds a 5px bar row below each thread row — slightly more but still localised.
- **C** adds a whole tab-switcher component plus a charting layer.
- **B** requires an SVG animation pipeline, a multi-step wizard, and stitch-level event hooks.

### Mobile usability
- **D** is designed mobile-first: the inline bar sits inside the existing touch-friendly row; the gear flyout is finger-sized.
- **A** is acceptable but the collapsible waste panel requires a precise small tap.
- **C**'s tab switcher and sparkline are not thumb-friendly.

### Graceful degradation
- **D** shows the mid-project disable modal with two clear resolution paths (keep / restore). The toggle is always visible.
- **A** has a toggle but the disable flow is less prominent.
- **B** and **C** treat enable/disable as secondary concerns.

### Consistency with existing UI
- **A** follows the existing tracker sidebar style exactly — no new interaction paradigms.
- **D** adds one new pattern (the 5px bar under each row) but that's a well-understood convention.
- **B** introduces SVG spools that don't exist anywhere else in the app.
- **C** introduces a tab-switcher within the sidebar panel, which conflicts with the flat-list convention used on every other page.

---

## Recommendation

### Pick: **Proposal A (Minimal/Ambient)** — with one enhancement borrowed from D

**Rationale:**

A scores highest (49 pts) on the criteria that matter most to a cross-stitch tracker:

1. **It does not interrupt flow.** The act of stitching is meditative. Anything that demands eye contact after each stitch is counterproductive.
2. **It matches the existing design language.** New features that are invisible when not needed are far easier to ship and maintain.
3. **It degrades gracefully.** Users who don't care about waste accounting can ignore the feature entirely — it never nags them.

The only weaknesses in A are *mobile usability* and *accuracy transparency*. Both are solved by borrowing one element from D: **replace the collapsible waste-settings section with a gear-icon flyout**. This makes the settings reachable in one tap on mobile without adding layout weight.

**What not to pick, and why:**

- **B** — The visual reward loop is compelling but belongs in a dedicated "stitching companion" mode, not the primary tracker. Animations on every stitch would become fatiguing. Save B as a future opt-in "motivation mode" once the core deduction engine exists.
- **C** — Valuable for power users, but the projection tab and live formula display serve a different user archetype (someone analysing their stitching, not just doing it). Ship C as a separate "Insights" panel once the engine is stable.
- **D** — Strong second choice (46 pts). If the team prefers an explicit visual affordance in the row (the 5px bar) over purely numerical updates, D is a fully valid alternative. The principal difference from A is that D makes consumption *scannable at a glance* without reading numbers.

### Summary table

| | A | B | C | D |
|-|---|---|---|---|
| Weighted score | **49** | 29 | 34 | 46 |
| Recommended for Phase 3? | **Yes** (primary) | Future opt-in | Future power panel | Yes (alternative) |
