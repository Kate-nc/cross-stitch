# Competitive Report 12: Phased Roadmap

> **Purpose:** Convert Report 11's recommendations into a time-sequenced
> roadmap. Phases are based on effort estimates and strategic dependencies,
> not calendar dates. Each phase has a coherent theme and a "done looks like"
> statement to make completion criteria clear.

---

## Roadmap Principles

1. **Communication before construction.** Most P0 items are copy and badge
   changes. Ship them first — they improve the app's perceived value without
   any new engineering.

2. **Feedback loops before features.** The stitchability score and live
   preview close a loop users currently cannot close themselves. These unblock
   the user from needing to iterate blind.

3. **Integration over addition.** Our strategic advantage is integration.
   The thread gap analysis (R10) is more valuable than any standalone feature
   because it connects stash data to patterns — something no competitor can do.

4. **Strengths visible.** Every phase should make at least one existing
   strength more visible.

---

## Phase 0 — "Say What We Already Are" (~1 week total)

**Theme:** Make existing advantages visible without writing a single new feature.

**Done looks like:** A new user landing on the home page can immediately answer:
"Is this free? Does it work offline? Does it export to Pattern Keeper?" All
answers are yes; all are now visible.

| ID | Action | Effort |
|---|---|---|
| R01 | Add "Free, no account, no limits" copy to home + export | 0.5 day |
| R02 | Pattern Keeper compatible badge on export tab | 1 day |
| R03 | Rename "Orphan removal" → "Confetti cleanup" | 2 hours |
| R04 | Add "Up to 5000×5000 stitches" tooltip to size inputs | 1 hour |
| R07 | SABLE index tooltip | 0.5 hour |
| R05 (part) | Parking marker tooltip explaining the technique | 1 hour |

**Phase 0 risk:** Very low. All changes are text, labels, or small UI additions.
No data model changes, no new components.

---

## Phase 1 — "First Run That Works" (~2–3 weeks)

**Theme:** New users get immediate value; existing users discover buried features.

**Done looks like:** A first-time user who arrives with a photo gets a
stitchable pattern with a quality score in under 2 minutes, understands what
they are looking at, and knows the app is free. An existing user notices the
new home page state and finds the tour re-triggerable.

| ID | Action | Effort |
|---|---|---|
| R12 | Home page first-run state | 3 days |
| R06 | Export preset profiles | 3 days |
| R05 (rest) | Tour re-triggerable; "Limit to stash" first-use prompt | 2 days |
| R09 | Stitchability score below preview | 1 week |
| R13 | Post-session summary card | 4 days |

**Dependencies:**
- R09 (stitchability score) requires the pattern grid to be in memory
  post-generation — it is, so no new plumbing needed.
- R12 requires `ProjectStorage.listProjects()` call — already exists.

**Phase 1 risk:** Low–Medium. The live preview (R08) is not in this phase —
that is more complex. The score display (R09) is a read of existing data.

---

## Phase 2 — "The Feedback Loops" (~4–6 weeks)

**Theme:** Close the three critical feedback loops that competitors have solved
and we have not: generation quality feedback, tracker navigation, and stash-
to-pattern purchasing.

**Done looks like:** A user converting a portrait can see the confetti overlay,
understand what to fix, and have a high-scoring pattern in 3 iterations. A
tracker user can work row-by-row with highlighted navigation. A user with a
wishlist pattern can see exactly which threads to buy.

| ID | Action | Effort |
|---|---|---|
| R08 | Live preview generation panel (2-panel, live update) | 2 weeks |
| R11 | Row mode in stitch tracker | 1 week |
| R10 | Thread gap shopping list | 2 weeks |
| R14 | Completion date projection on project cards | 2 days |

**Dependencies:**
- R08 (live preview) requires refactoring the Import Wizard; test coverage of
  existing generate.js functions should be verified before refactor.
- R10 (thread gap) requires a working stash-bridge.js read from the project
  library page — verify this path before building the UI.

**Phase 2 risk:** Medium. R08 is the highest-risk item (wizard refactor
touching a core flow). Should be feature-flagged during development.

---

## Phase 3 — "Polish and Depth" (~4–6 weeks)

**Theme:** Add depth for power users and close secondary gaps that become
visible once the core improvements are in place.

**Done looks like:** A Etsy seller can create a pattern, get a score, add a
cover page with their logo, export to PK-compatible PDF, all in one flow.
A stats user can share a card to social media. A serious stitcher can use
the colour completion sidebar to work systematically.

| ID | Action | Effort |
|---|---|---|
| R15 | Basic text tool (5–8 fonts) | 3 weeks |
| R16 | Mobile tracker ergonomics | 2 weeks |
| R17 | Stash CSV import/export | 4 days |
| R18 | Stash-aware creation onboarding | 1 day |
| R19 | Colour completion sidebar in tracker | 4 days |
| R20 | Shareable stats cards | 2 weeks |

---

## Phase 4 — "Expand and Consolidate" (~6–10 weeks)

**Theme:** Address the highest-effort items that have been validated as user
priorities by Phase 1–3 adoption data.

| ID | Action | Effort | Gate condition |
|---|---|---|---|
| R21 | Anchor brand in creator pipeline | 5 weeks | Validated demand; schema migration plan |
| R22 | Sync UX improvements | 2 weeks | User feedback on current sync friction |
| R23 | Specialty / custom brand in stash | 1 week | — |
| R24 | Project journal / timeline | 3 weeks | — |
| R25 | French knot support | 1 week | — |

**Phase 4 gate:** R21 (Anchor in creator) requires a breaking change to the
project schema (namespaced IDs). This should only be undertaken after verifying
it is a real adoption barrier and after implementing a migration strategy.

---

## Roadmap Summary Timeline

```
Phase 0 (1 week)
├── R01: Free tier copy
├── R02: PK badge
├── R03: Rename orphan removal
├── R04: Canvas size tooltip
├── R07: SABLE tooltip
└── R05 (parking tooltip)

Phase 1 (2–3 weeks)
├── R12: First-run home state
├── R06: Export presets
├── R05 (rest): Tour retrigger + stash prompt
├── R09: Stitchability score
└── R13: Post-session summary

Phase 2 (4–6 weeks) ← highest impact on acquisition
├── R08: Live preview panel
├── R11: Row mode tracker
├── R10: Thread gap shopping
└── R14: Completion projection

Phase 3 (4–6 weeks) ← depth + retention
├── R15: Text tool
├── R16: Mobile tracker
├── R17: Stash CSV
├── R18: Stash-aware onboarding
├── R19: Colour completion sidebar
└── R20: Shareable stats

Phase 4 (6–10 weeks) ← based on validated demand
├── R21: Anchor in creator
├── R22: Sync UX
├── R23: Specialty brands
├── R24: Project journal
└── R25: French knots
```

---

## What Each Phase Achieves Competitively

| Phase | Key competitive outcome |
|---|---|
| Phase 0 | Users can now evaluate us vs competitors on correct information (free, PK-compat, no size limit) |
| Phase 1 | First-run drop-off reduced; stitchability score is a differentiator vs Stitch Fiddle |
| Phase 2 | Generation quality loop closes gap vs StitchMate; thread gap analysis is unique in market |
| Phase 3 | Text tool closes gap vs StitchMate; stats sharing creates organic growth vector |
| Phase 4 | Anchor support removes the last significant technical limitation for multi-brand users |

---

## Risk Register

| Risk | Phase | Mitigation |
|---|---|---|
| Live preview (R08) breaks generation flow | Phase 2 | Feature flag; keep wizard as fallback |
| Anchor schema migration (R21) corrupts existing projects | Phase 4 | Migration script + full backup before upgrade |
| Stitchability score (R09) misleads users into thinking confetti % is the only quality metric | Phase 1 | Good tooltip copy; "Higher is better" explanation |
| Export presets (R06) hide customisation options users expect | Phase 0–1 | Keep "Customise" expand/collapse; presets are defaults not locks |
| Row mode (R11) confuses users who expect cell mode | Phase 2 | Default to cell mode; row mode is opt-in |
