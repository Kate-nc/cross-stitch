# Competitive Report 11: Consolidated Prioritised Recommendations

> **Purpose:** Combines all findings from Reports 5–10 into a single, ranked,
> actionable list. Each recommendation includes the source reports, the target
> user segment, the effort level, and the expected impact.
>
> **Priority tiers:**
> - **P0 — Quick wins:** Low effort, high impact. Do these immediately.
> - **P1 — Core improvements:** Medium effort, high impact. Plan now.
> - **P2 — Phase 2:** Medium–high effort or medium impact. Next cycle.
> - **P3 — Phase 3:** High effort or lower priority. Consider later.
> - **Deferred:** Valid ideas but not recommended in current product phase.

---

## P0 — Quick Wins (Low Effort, High Impact)

These items require only copy changes, small UI additions, or exposing existing
features. None require new functionality. Collectively they represent the biggest
ROI of any work in this analysis.

### R01: Communicate free tier and no-export-limits
**Source:** Gap U3, Clarity CG-1, Strength S3
**Effort:** Half a day (copy only)
**Impact:** HIGH — removes assumption that paywalls exist

**Actions:**
- Home page hero: add "Free forever. No account needed. No export limits."
- Export tab: add "Export is free — no charges, no limits" near the Export button
- Any onboarding first-run state

---

### R02: Add "Pattern Keeper compatible" badge to export
**Source:** Gap U1, Clarity CG-2, Strength S6
**Effort:** 1 day (badge component + badge image)
**Impact:** HIGH — addresses the #1 trust question for Android users

**Actions:**
- Display a "Pattern Keeper compatible" badge in the export tab
- Add PK mention to home page "why choose us" section
- Note in the export success notification

---

### R03: Rename "Orphan removal" to "Confetti cleanup"
**Source:** Clarity CG-6, Gap C2
**Effort:** 2 hours (string replacements)
**Impact:** MEDIUM — maps feature to user vocabulary

**Actions:**
- Replace "Orphan removal" label with "Confetti cleanup" throughout the UI
- Update any tooltip/help text to use both terms: "Confetti cleanup (removes
  isolated single stitches)"

---

### R04: State maximum canvas size in the UI
**Source:** Gap U2, Clarity CG-3
**Effort:** 1 hour (tooltip)
**Impact:** MEDIUM — converts users who left because of size limits elsewhere

**Actions:**
- Add tooltip to the size inputs in the creation wizard:
  "Up to 5000 × 5000 stitches"

---

### R05: Make tour re-triggerable; add parking and stash-aware tooltips
**Source:** Clarity CG-8, CG-10, CG-15
**Effort:** 1–2 days (re-trigger entry point + 2 new tooltips)
**Impact:** MEDIUM — surfaces buried differentiators

**Actions:**
- Add "Restart tour" option in help menu for all pages
- Parking marker button tooltip: explain the parking technique briefly
- Creator first run: "Have a thread stash? Enable 'Limit to stash' to generate
  patterns using threads you already own."

---

### R06: Export preset profiles (Personal / Pattern Keeper / Etsy)
**Source:** Flow FI-06, Clarity CG-14
**Effort:** 2–3 days
**Impact:** MEDIUM — reduces export confusion and time-to-export

**Actions:**
- Add 3 preset buttons to the export tab
- Each preset configures the export state to sensible defaults for that use case
- Keep all individual settings accessible below the preset

---

### R07: SABLE index tooltip
**Source:** Clarity CG-7
**Effort:** 30 minutes
**Impact:** LOW–MEDIUM — makes stats legible for new users

**Actions:**
- Add info icon to SABLE widget with tooltip explanation

---

## P1 — Core Improvements (Medium Effort, High Impact)

### R08: Live preview generation panel
**Source:** Flow FI-01, Gap C1, C2
**Effort:** 1–2 weeks
**Impact:** HIGH — aligns our generation UX with the market standard

**Actions:**
- Redesign the Import Wizard from 5 sequential steps to a 2-panel view
- Left: settings (colour count, dithering, size, confetti cleanup)
- Right: live-updating preview
- Mobile: stack vertically

**See wireframe WF-01.**

---

### R09: Stitchability score (Stitch Score)
**Source:** Gap C1, Blue Ocean BO-1, Flow FI-02
**Effort:** 1 week
**Impact:** HIGH — differentiates our quality positioning; makes orphan removal visible

**Actions:**
- After generation, compute and display:
  - Stitch Score (0–100): `(1 - confetti_ratio) × 100`
  - Confetti %: isolated stitches / total non-empty cells
  - Estimated thread changes (heuristic)
- Add confetti overlay toggle (highlights isolated stitches in amber)
- Score updates when cleanup settings change

**See wireframe WF-02.**

---

### R10: Thread gap shopping list
**Source:** Blue Ocean BO-3, Flow FI-05, Gap S5
**Effort:** 1–2 weeks
**Impact:** HIGH — closes the most significant stash workflow gap

**Actions:**
- On pattern library wishlist/owned entries: show "Threads owned vs needed"
  table
- Compare pattern palette (DMC IDs from pattern JSON) against user stash
- "Add missing to shopping list" button sets `toBuy: true` on gap threads
- Shopping list view in stash manager aggregates all flagged threads

**See wireframe WF-04.**

---

### R11: Row mode in stitch tracker
**Source:** Gap T1, Flow FI-03
**Effort:** 1 week
**Impact:** HIGH — directly closes the gap vs Pattern Keeper for row-by-row stitchers

**Actions:**
- Add Row/Cell mode toggle to tracker toolbar
- Row mode: highlights current row; dims others
- Prev/Next row navigation buttons
- Row counter displayed: "Row 14 / 80"

**See wireframe WF-03.**

---

### R12: Home page first-run state
**Source:** Flow FI-07, Clarity CG-16
**Effort:** 2–3 days
**Impact:** HIGH — reduces new-user drop-off at first landing

**Actions:**
- Detect `projectCount === 0`
- Show: welcome message + value proposition + 3 CTAs (photo convert / template / import)
- Link to starter kits
- Normal dashboard shown on all subsequent visits

---

### R13: Post-session summary card
**Source:** Flow FI-04
**Effort:** 3–5 days
**Impact:** MEDIUM — retention mechanism; social sharing vector

**Actions:**
- After stopping a session: show session stats card (stitches, time, speed, % progress)
- Highlight streaks and personal bests
- Optional "Share" button generating a PNG card

---

### R14: Completion date projection on project cards
**Source:** Blue Ocean BO-4
**Effort:** 1–2 days (if projection data exists in stats)
**Impact:** MEDIUM — makes stats actionable at a glance

**Actions:**
- On active project home cards: show projected completion date based on recent
  stitching velocity
- "At your current pace, estimated finish: Nov 2026"

---

## P2 — Phase 2 (Medium–High Effort or Medium Impact)

### R15: Text tool (basic — 5–8 fonts)
**Source:** Gap C4
**Effort:** 2–3 weeks
**Impact:** MEDIUM — closes the most visible creation feature gap vs StitchMate

**Actions:**
- Text tool in creator toolbar: type → select font → place on grid
- 5–8 pixel-grid-optimised fonts (not proportional fonts; stitch-optimised)
- Preview renders as stitches in real time

---

### R16: Mobile tracker ergonomics improvement
**Source:** Gap T2
**Effort:** 1–2 weeks
**Impact:** MEDIUM — improves on-sofa / mobile-tracking experience

**Actions:**
- Larger hit targets for stitch cells at high zoom
- Swipe gesture for row advance in row mode
- Landscape layout optimisation for tablet
- "Stitching mode" that hides non-tracking controls

---

### R17: Stash CSV import/export
**Source:** Gap S3, Flow FI-08
**Effort:** 3–5 days
**Impact:** MEDIUM — reduces migration friction for spreadsheet users

**Actions:**
- Export stash as CSV (brand, code, name, hex, owned count, to-buy flag)
- Bulk import from CSV via BulkAddModal extension
- Document CSV format for power users

---

### R18: Stash-aware creation onboarding
**Source:** Strength S7, Clarity CG-10
**Effort:** 1 day
**Impact:** MEDIUM — activates a unique differentiator for stash users

**Actions:**
- First-run prompt in creator: "You have a stash — want to limit your palette
  to what you own?"
- Quick-enable toggle for "Limit to stash" in the generation settings

---

### R19: Live colour completion list in tracker sidebar
**Source:** Gap T1 (secondary), competitor Pattern Keeper feature
**Effort:** 3–5 days
**Impact:** MEDIUM — makes it easier to see which colours are done

**Actions:**
- Sidebar panel in tracker showing palette colours with completion percentage per colour
- Clicking a colour highlights all remaining stitches of that colour on canvas

---

### R20: Shareable stats cards
**Source:** Blue Ocean BO-7, Flow FI-04
**Effort:** 1–2 weeks
**Impact:** MEDIUM–HIGH — organic social sharing vector

**Actions:**
- "Share my stats" button on stats page
- Generates a styled PNG card (like Spotify Wrapped): key stats + visual
- Output can be shared to Instagram, Reddit, Discord

---

## P3 — Phase 3 (Higher Effort or Lower Priority)

### R21: Anchor brand support in creator pipeline
**Source:** Gap C3
**Effort:** 3–5 weeks (schema migration, pipeline changes)
**Impact:** MEDIUM (for Anchor users)

Requires namespacing IDs in the pattern format and updating the quantisation
pipeline. High technical risk; should be a dedicated project with regression testing.

---

### R22: Improved sync UX (clearer file-based flow)
**Source:** Gap T3
**Effort:** 1–2 weeks
**Impact:** MEDIUM

Actions: Improve sync onboarding; add a "Last synced" indicator; add one-click
Google Drive backup (via GDrive JS API).

---

### R23: Specialty / hand-dyed brand support
**Source:** Gap S2
**Effort:** 1 week
**Impact:** LOW–MEDIUM (niche users)

Add "Custom brand" entry in stash manager with free-text name and hex colour.

---

### R24: Project journal / timeline
**Source:** Blue Ocean BO-2
**Effort:** 2–3 weeks
**Impact:** MEDIUM

Chronological view of sessions with optional notes; shareable project page URL.

---

### R25: French knot support
**Source:** Gap C5
**Effort:** 1–2 weeks
**Impact:** LOW (niche stitch type)

---

## Deferred (Not Recommended in Current Phase)

### RD-01: Knitting / crochet multi-craft support
**Why deferred:** Stitch Fiddle already owns this space; scope creep risk is
very high; our core user is a cross-stitcher. Expanding to other crafts would
dilute the product focus without a proportionate return.

### RD-02: Layer system
**Why deferred:** High complexity, low user demand outside pixel-art power users.
Undo/redo already provides non-destructive editing for most cases.

### RD-03: Etsy / marketplace integration (buy threads in-app)
**Why deferred:** Platform complexity; affiliate/commercial considerations;
not core to the app's value proposition. This is a "someday" feature.

### RD-04: Physical pattern OCR (photo → trackable pattern)
**Why deferred:** Requires complex computer vision (not just PDF parsing);
Markup R-XP has an established user base here; not a web-first feature.

---

## Summary by Priority

| ID | Recommendation | Priority | Effort |
|---|---|---|---|
| R01 | Free tier copy | P0 | 0.5 day |
| R02 | PK compatible badge | P0 | 1 day |
| R03 | Rename orphan removal | P0 | 2 hours |
| R04 | State max canvas size | P0 | 1 hour |
| R05 | Tour + parking tooltips | P0 | 2 days |
| R06 | Export presets | P0 | 3 days |
| R07 | SABLE tooltip | P0 | 0.5 hour |
| R08 | Live preview panel | P1 | 2 weeks |
| R09 | Stitchability score | P1 | 1 week |
| R10 | Thread gap shopping | P1 | 2 weeks |
| R11 | Row mode tracker | P1 | 1 week |
| R12 | Home first-run state | P1 | 3 days |
| R13 | Post-session summary | P1 | 4 days |
| R14 | Completion date projection | P1 | 2 days |
| R15 | Text tool | P2 | 3 weeks |
| R16 | Mobile tracker UX | P2 | 2 weeks |
| R17 | Stash CSV | P2 | 4 days |
| R18 | Stash-aware onboarding | P2 | 1 day |
| R19 | Colour completion sidebar | P2 | 4 days |
| R20 | Shareable stats cards | P2 | 2 weeks |
| R21 | Anchor in creator | P3 | 5 weeks |
| R22 | Sync UX improvements | P3 | 2 weeks |
| R23 | Specialty brands | P3 | 1 week |
| R24 | Project journal | P3 | 3 weeks |
| R25 | French knots | P3 | 1 week |
