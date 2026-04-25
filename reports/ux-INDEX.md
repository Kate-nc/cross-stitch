# UX Audit & Redesign — Proposal Pack

This is the index for the full UX research → audit → proposals → wireframes pack.
Phases 1–3 are complete. **Phase 4 (implementation) is paused awaiting your selection of one Plan + one Visual Direction.**

## Phase 1 · Research

- [ux-1 — Domain research & competitive landscape](ux-1-domain-research.md)
- [ux-2 — User journeys (Beginner Bea / Experienced Eli / Designer Devi)](ux-2-user-journeys.md)
- [ux-3 — Cross-stitch domain reference (glossary, workflows, principles, anti-patterns)](ux-3-domain-reference.md)

## Phase 2 · Audit (each finding cites file:line in the codebase)

- [ux-4 — Navigation & information architecture](ux-4-navigation.md)
- [ux-5 — Workflow friction (W1–W7)](ux-5-workflow-friction.md)
- [ux-6 — Visual design & consistency](ux-6-visual-design.md)
- [ux-7 — Mobile & PWA experience](ux-7-mobile.md)
- [ux-8 — Accessibility (WCAG 2.2)](ux-8-accessibility.md)

## Phase 3 · Synthesis

- [ux-9 — Prioritised issues (top-20 by Impact × Reach ÷ Effort, 8 themes)](ux-9-prioritised-issues.md)
- [ux-10 — Proposals (Plan A / B / C — mutually exclusive)](ux-10-proposals.md)
- [ux-11 — Visual directions (Workshop / Studio / Folk)](ux-11-visual-direction.md)

## Wireframes (grayscale — colour applied in Phase 4 once direction is chosen)

| Plan | File |
|---|---|
| A | [plan-a-tracker-mobile.html](wireframes/plan-a-tracker-mobile.html) — Phone tracker with floating tools + safe-area mode pill |
| A | [plan-a-tracker-tablet.html](wireframes/plan-a-tracker-tablet.html) — Tablet tracker with project rail + grouped toolbar |
| A | [plan-a-pattern-tab.html](wireframes/plan-a-pattern-tab.html) — Creator with persistent Print PDF + Track action bar |
| B | [plan-b-token-system.html](wireframes/plan-b-token-system.html) — Type / spacing / colour / button / badge / icon tokens |
| B | [plan-b-dark-mode.html](wireframes/plan-b-dark-mode.html) — Tracker side-by-side light + dark |
| B | [plan-b-modal-primitive.html](wireframes/plan-b-modal-primitive.html) — One Modal/Sheet/Drawer primitive replacing 12 ad-hoc dialogs |
| C | [plan-c-header-switcher.html](wireframes/plan-c-header-switcher.html) — Project switcher + Designing/Tracking/Managing mode + ⌘K |
| C | [plan-c-creator-design.html](wireframes/plan-c-creator-design.html) — Designing mode (Chart + Source only) |
| C | [plan-c-creator-use.html](wireframes/plan-c-creator-use.html) — Using mode (consolidated print/share/export/hand-off) |
| C | [plan-c-home.html](wireframes/plan-c-home.html) — Single home dashboard for all modes |

## The three plans at a glance

| | **Plan A — Tracker-First, Mobile-First** | **Plan B — Design System Reset** | **Plan C — Outcomes Over Tabs** |
|---|---|---|---|
| **Premise** | Stitching is the dominant verb; optimise the Tracker on a tablet on a stitcher's lap, then promote outcomes (Print, Track) to one click. | The cross-cutting cost is inconsistency; ship a token system + primitives + dark mode + a11y baseline that everything else inherits. | Tabs map to features; reorganise around what users came to do (Designing / Tracking / Managing) with a project switcher and ⌘K. |
| **Recommended visual direction** | Workshop (warm, terracotta, paired with A) | Studio (cool, indigo, Linear-like) | Folk (sampler-band, sage + pink) |
| **What ships first** | (1) Mobile tracker overhaul · (2) Print PDF + Track-this CTAs in Creator action bar | (1) Tokens + dark mode · (2) Modal/Sheet/Drawer primitive | (1) Header + project switcher + ⌘K · (2) Creator collapsed to Design / Use |
| **Best for** | Eli — daily stitcher with tablet | Long-term maintainability for everyone | Devi — power user managing many projects |
| **Risk** | Less directly visible improvement for designers | Slow user-visible payoff (foundation work) | Largest IA shake-up; needs deepest user testing |

The three plans are **mutually exclusive philosophies**, not phases. Each ships as 2 substantive PRs to prove the direction; subsequent work compounds in that direction.

## Three things I need from you to start Phase 4

1. **One Plan**: A, B, or C.
2. **One Visual Direction** (the recommended pairing is shown above; you may mix, e.g. "Plan A with Studio direction").
3. **Any vetoes or must-haves** I should respect — for example "don't change the Manager", "ship dark mode regardless of plan", or "Pattern Keeper compatibility is non-negotiable" (it already is, but examples like that).

Once I have those three, I'll produce a phased implementation plan (PRs, files touched, tests, rollout) and start coding.
