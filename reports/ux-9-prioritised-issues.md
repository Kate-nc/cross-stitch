# UX-9 — Prioritised Issues

> Phase 3 synthesis. Consolidates findings from
> [ux-4](ux-4-navigation.md), [ux-5](ux-5-workflow-friction.md),
> [ux-6](ux-6-visual-design.md), [ux-7](ux-7-mobile.md), and
> [ux-8](ux-8-accessibility.md), ranks them, and groups them into
> themes that each Phase 3 plan can address.

Scoring: **Impact** (1–5) × **Reach** (% of users / sessions affected,
1–5) ÷ **Effort** (1–5). Higher = more leverage.

---

## Top 20 issues, ranked

| # | ID | Issue (one line) | Impact | Reach | Effort | Score | Theme |
|---|---|---|---:|---:|---:|---:|---|
| 1 | F-W1-H1 | Primary "Print PDF" buried 4 tabs deep ([ux-5](ux-5-workflow-friction.md#f-w1-h1--four-nested-tab-switches-to-reach-export)) | 5 | 5 | 2 | 12.5 | Primary actions |
| 2 | M-H3 | No screen wake-lock during stitching ([ux-7](ux-7-mobile.md#m-h3--no-wakelock-during-a-stitching-session)) | 5 | 4 | 1 | 20 | Mobile basics |
| 3 | M-H1 | PWA icons missing — install broken ([ux-7](ux-7-mobile.md#m-h1--pwa-manifest-has-no-icons)) | 4 | 5 | 1 | 20 | Mobile basics |
| 4 | F-W3-H1 | Project picker is a full-screen modal, not a sidebar ([ux-5](ux-5-workflow-friction.md#f-w3-h1--project-picker-is-a-full-modal-not-a-sidebar)) | 4 | 5 | 3 | 6.7 | Information arch |
| 5 | N-H3 | Export 5+ clicks deep ([ux-4](ux-4-navigation.md#n-h3--primary-export-action-buried-two-tabs-deep)) | 5 | 5 | 2 | 12.5 | Primary actions |
| 6 | F-W2-H1 | Mandatory project name gate at handoff ([ux-5](ux-5-workflow-friction.md#f-w2-h1--mandatory-name-your-project-gate)) | 4 | 4 | 1 | 16 | Primary actions |
| 7 | A-H4 | Modals lack `role="dialog"` + focus trap ([ux-8](ux-8-accessibility.md#a-h4--modals-lack-dialog-semantics)) | 4 | 5 | 2 | 10 | A11y foundation |
| 8 | M-H4 | Bottom sheet ignores iOS safe-area ([ux-7](ux-7-mobile.md#m-h4--bottom-sheet-modal-ignores-ios-safe-area-inset-bottom)) | 4 | 4 | 1 | 16 | Mobile basics |
| 9 | M-H5 | FAB undo collides with Android gesture pill ([ux-7](ux-7-mobile.md#m-h5--fab-undo-collides-with-android-gesture-pill)) | 4 | 4 | 1 | 16 | Mobile basics |
| 10 | V-H4 | Colour-only state signals (toasts, badges) ([ux-6](ux-6-visual-design.md#v-h4--colour-only-state-signals)) | 3 | 5 | 2 | 7.5 | A11y / visual |
| 11 | N-H1 | Asymmetric cross-page navigation ([ux-4](ux-4-navigation.md#n-h1--asymmetric-cross-page-navigation)) | 4 | 4 | 2 | 8 | Information arch |
| 12 | M-H2 | Babel in-browser slows mobile first-paint ([ux-7](ux-7-mobile.md#m-h2--babel-in-browser-compilation-delays-first-paint)) | 4 | 4 | 4 | 4 | Performance |
| 13 | F-W5-H1 | Shopping list modal-only, not inline ([ux-5](ux-5-workflow-friction.md#f-w5-h1--shopping-list-is-modal-only)) | 3 | 3 | 2 | 4.5 | Workflow |
| 14 | F-W5-H2 | Shopping list cannot be printed/shared ([ux-5](ux-5-workflow-friction.md#f-w5-h2--no-print-or-share-for-the-shopping-list)) | 4 | 3 | 2 | 6 | Workflow |
| 15 | A-H3 | Tracker canvas opaque to AT ([ux-8](ux-8-accessibility.md#a-h3--tracker-canvas-has-no-keyboard-route-or-text-alternative)) | 4 | 2 | 4 | 2 | A11y deep |
| 16 | V-H2 | Dark mode ~10% complete ([ux-6](ux-6-visual-design.md#v-h2--dark-mode-is-10-complete)) | 3 | 4 | 4 | 3 | Visual / theme |
| 17 | V-H5 | No type scale ([ux-6](ux-6-visual-design.md#v-h5--no-defined-type-scale)) | 3 | 5 | 3 | 5 | Visual foundation |
| 18 | V-H3 | Button-class proliferation ([ux-6](ux-6-visual-design.md#v-h3--button-class-proliferation-with-inconsistent-hover-mechanics)) | 3 | 5 | 3 | 5 | Visual foundation |
| 19 | F-W6-H1/H2/H3 | Designer branding fields & no watermark ([ux-5](ux-5-workflow-friction.md#w6--designer-publishes-a-pattern-devi)) | 4 | 1 | 3 | 1.3 | Designer features |
| 20 | N-H2 | Materials sub-tab labels muddled ([ux-4](ux-4-navigation.md#n-h2--materials-sub-tab-labels-do-not-parallel-the-parent)) | 3 | 4 | 1 | 12 | Information arch |

---

## Themes (for Phase 3 plan grouping)

### T1 · Primary actions need to surface

(Issues #1, #5, #6, #20.) The Creator's primary outcomes — print and
track — are buried. The fix is structural (move buttons up the
hierarchy, simplify the Materials tab, make the Pattern tab a true
launchpad). High-impact, medium-effort.

### T2 · Mobile basics

(Issues #2, #3, #8, #9, plus several Medium findings in
[ux-7](ux-7-mobile.md).) PWA icons, wake-lock, safe-area, touch
targets, form input modes. **Mostly small, mostly low-effort,
high-reach.** This bundle is the cheapest single win.

### T3 · Information architecture coherence

(Issues #4, #11, #20, plus several Medium findings.) Cross-page
project continuity, project-picker pattern, label parallelism.
Medium-effort, medium-impact.

### T4 · Visual foundation consolidation

(Issues #10, #16, #17, #18, plus most Medium findings in
[ux-6](ux-6-visual-design.md).) Type scale, button classes, dark mode,
icon-paired colour signals. Medium-effort, broad effect on every
future change.

### T5 · Accessibility foundation

(Issues #7, #15, plus most of [ux-8](ux-8-accessibility.md).) Modal
roles, focus trap, canvas alternatives, contrast. Mix of low and high
effort.

### T6 · Workflow polish

(Issues #13, #14, plus a long tail of Medium findings.) Shopping
list, bulk add, welcome card, wizard stacking. Many small wins.

### T7 · Designer / professional features

(Issue #19, plus the W6 cluster.) Watermark, PDF cover slot, ZIP
filename, multi-brand legend. Lower reach (Devi only) but high impact
for that persona.

### T8 · Performance

(Issue #12 plus M-L2.) Babel compile time on phone, large-pattern
PDF memory. Slow-burn improvements.

---

## What this means for plans A/B/C

The eight themes don't all fit one cohesive product narrative. The
three plans in [ux-10](ux-10-proposals.md) are deliberately
**mutually exclusive in philosophy** — each picks a coherent
*subset* of these themes and bets on it:

- **Plan A — "Tracker-First, Mobile-First"** — bets on T1 + T2 + T5 +
  T8 with the Tracker as the headline beneficiary. Wins Eli, fixes
  Bea's mobile experience, defers Devi.
- **Plan B — "Design System Reset"** — bets on T4 + T5 + T3 first,
  building the foundation that makes T1 / T6 cheap to fix later. Wins
  the long-term consistency story, slower visible payoff.
- **Plan C — "Outcomes Over Tabs"** — bets on T1 + T3 + T6 + T7 with
  a structural overhaul of the Creator's IA. Wins Bea's onboarding
  and Devi's professional output, defers some mobile depth.

Each is detailed in [ux-10](ux-10-proposals.md), with wireframes in
[reports/wireframes/](wireframes/).
