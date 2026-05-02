# Competitive Report 10: UX Flow Improvements from Adjacent Tools

> **Purpose:** Concrete flow improvement proposals, each grounded in a pattern
> from a competitor or adjacent tool that has been validated by users.
> Each proposal includes a "borrowed from" attribution, the current state, the
> proposed state, and the expected impact.

---

## 1. Flow Improvement FI-01: Live Preview Generation Panel

**Borrowed from:** StitchMate, Aseprite (real-time preview on setting change)

**Current state:**
The Import Wizard presents generation options across 5 sequential steps
(Crop → Palette → Size → Preview → Confirm). Settings and preview are on
different steps. To see the effect of changing colour count, the user must
advance to the Preview step, inspect the result, go back, change the setting,
and advance again.

**Proposed state:**
A 2-panel view with settings on the left and a live-updating preview on the
right. The panel layout mirrors StitchMate's editor UI:

```
┌─────────────────────────────────────────────────────────┐
│  PANEL A: Settings          │  PANEL B: Preview          │
│                             │                            │
│  Colour count: [━━●━━] 18   │  [Pattern preview]         │
│  Dithering: [Balanced ▾]    │                            │
│  Confetti cleanup: [On ▾]   │  Stitch Score: 87/100      │
│  Size: 120 × 90 stitches    │  Confetti: 4.2%            │
│                             │  Thread changes: ~34        │
│  [Advanced options ▾]       │                            │
│                             │  [Generate pattern ▶]      │
└─────────────────────────────────────────────────────────┘
```

The preview updates when major settings change (colour count, dithering mode).
Minor settings (exact size within bounds) update without re-running full
quantisation.

**Expected impact:**
- Reduces iterations needed to reach a satisfactory pattern
- Surfaces the quality score in context where it is actionable
- Matches the mental model users bring from StitchMate and Stitch Fiddle

**Implementation notes:**
- The existing `PreviewCanvas` and `generate.js` components can be repurposed
- Live update on colour-count change requires debouncing (300–500ms)
- Mobile: panels stack vertically (settings above, preview below)

---

## 2. Flow Improvement FI-02: Stitchability Score Display

**Borrowed from:** StitchMate (FLOW Score)

**Current state:**
After generation, users see the pattern with no quality feedback. Orphan removal
is available but silent — no indication of how many orphans were found or removed.

**Proposed state:**
A quality indicator below the generated preview:

```
Stitch Score: 87 / 100   [?]

Confetti: 4.2% (52 isolated stitches)  [Show]
Estimated thread changes: 34
```

- Clicking `[?]` shows a tooltip: "Higher score = easier to stitch. Fewer
  isolated stitches means fewer thread changes and less counting fatigue."
- Clicking `[Show]` overlays isolated stitches in amber on the preview canvas.
- Score recalculates when orphan removal setting is changed.

**Expected impact:**
- Users understand why orphan removal matters (currently it is abstract)
- Users can compare score before/after enabling cleanup
- Makes our quality-focused positioning tangible

**Implementation notes:**
- Score = `(1 - confetti_ratio) * 100` where confetti_ratio = isolated cells / total non-empty cells
- Isolated cell detection: a cell is isolated if all 4 orthogonal neighbours are a different colour
- Overlay rendering: a second canvas layer with amber fill on isolated cells
- Performance: runs on the pattern grid (already in memory post-generation)

---

## 3. Flow Improvement FI-03: Row Mode in Stitch Tracker

**Borrowed from:** Pattern Keeper, Knit Companion (row highlight)

**Current state:**
The tracker marks individual stitches. Users who work row-by-row have no
navigation aid — they must mentally track which row they are on.

**Proposed state:**
A row mode toggle in the tracker toolbar:

```
[Cell mode] [Row mode]

In row mode:
- Current row highlighted (white background, other rows dimmed)
- Previous row button (◀) and next row button (▶) in toolbar
- Row counter: "Row 14 / 80"
- Tapping a stitch marks it done AND advances to that row if different
```

**Expected impact:**
- Directly addresses the #1 UX gap vs Pattern Keeper
- Makes row-by-row workers (a significant proportion of serious stitchers) much
  faster
- Row count gives a visible sense of progress milestone (not just percentage)

**Implementation notes:**
- Row mode state stored in component state (not persisted — resets per session)
- Dimming = CSS filter or overlay on non-current rows
- Row boundaries are defined by `Math.floor(cellIndex / patternWidth)`
- Navigation buttons dispatch `currentRow` state update

---

## 4. Flow Improvement FI-04: Post-Session Summary

**Borrowed from:** fitness tracking apps (Strava, Garmin Connect), adjacent
health apps that celebrate completed sessions

**Current state:**
When a user stops stitching, they close the tracker. The session is silently
logged. No feedback is given about the session.

**Proposed state:**
When the user taps "Stop session" (or when a session is auto-ended), show a
brief summary card:

```
┌─────────────────────────────────┐
│  Session complete!              │
│                                 │
│  Stitches:  312                 │
│  Time:       47 min             │
│  Speed:      6.6 stitches/min   │
│                                 │
│  Progress:  48% → 51%  [+3%]   │
│                                 │
│  Streak: 4 days  [New record!]  │
│                                 │
│  [Done]  [Share]                │
└─────────────────────────────────┘
```

**Expected impact:**
- Provides positive reinforcement (behavioural retention mechanism)
- Surfaces stats that are currently buried in the stats page
- "Share" button creates a shareable image — social vector for discoverability

**Implementation notes:**
- Session data is already logged; this is purely a presentation layer
- "New record!" detection compares current session to personal bests stored in stats
- Share button generates a canvas PNG with the session data (similar to Spotify
  Wrapped cards)

---

## 5. Flow Improvement FI-05: Thread Gap Shopping List

**Borrowed from:** Ravelry (yarn gap analysis for queued projects)

**Current state:**
A user with a wishlist pattern in the project library has no automated way to
see which threads they need to buy. They must open the pattern, read the legend,
and manually cross-reference with their stash.

**Proposed state:**
On the wishlist/owned pattern entry in the project library:

```
Pattern: "Autumn Barn" — Wishlist

Threads needed: 18 colours

┌─────────────────────────────────────────────────────┐
│  In your stash      │  Need to buy                  │
│  DMC 310   Black    │  DMC 356   Medium Terra Cotta  │
│  DMC 400   ...      │  DMC 407   ...                 │
│  (12 colours)       │  (6 colours)                   │
└─────────────────────────────────────────────────────┘

[Add missing threads to shopping list]
```

**Expected impact:**
- Turns the stash manager from inventory tool to purchase planner
- Creates a natural loop: add wishlist patterns → see what to buy → buy →
  add to stash → generate → stitch
- Makes "Limit to stash" more meaningful (users learn which stash entries to
  prioritise buying)

**Implementation notes:**
- Pattern thread list available from pattern JSON (palette entries with id + rgb)
- Stash available from `stash-bridge.js` reads of `stash_manager_db`
- Match by brand:id — note the DMC-only creator limitation (pattern palette is
  DMC; stash has DMC + Anchor; only DMC threads can be gap-matched)
- "Add to shopping list" sets `toBuy: true` on the relevant stash entries

---

## 6. Flow Improvement FI-06: Export Preset Profiles

**Borrowed from:** Print dialog "profiles" in InDesign / similar print software

**Current state:**
The export tab presents many options. A new user must manually configure:
page size, margins, chart mode, cover page, designer branding, backstitch
chart, mini legend, page overlap. The correct settings vary by use case.

**Proposed state:**
Three preset buttons at the top of the export panel:

```
Export presets:
[Personal use]   [For Pattern Keeper]   [For Etsy / selling]

Selected: Personal use
─────────────────────
Page size: A4
Chart: Colour with symbols
Cover page: Off
Mini legend: On per page
...
[Customise ▾]
[Export PDF]
```

Each preset configures sensible defaults. Users can expand "Customise" to
override.

**Expected impact:**
- Reduces time-to-export for the 80% of users who have a standard use case
- Prevents the common mistake of exporting with wrong settings (e.g.,
  accidentally using Workshop theme and breaking PK compatibility)
- Makes "For Etsy" preset an implicit endorsement of commercial use

**Implementation notes:**
- Presets are just JavaScript objects that set the export state
- No new state model needed; just a "apply preset" function
- The "For Pattern Keeper" preset explicitly sets standard theme + PK-safe
  symbols

---

## 7. Flow Improvement FI-07: Home Page First-Run State

**Borrowed from:** StitchMate, Stitch Fiddle (immediate value proposition on
landing page)

**Current state:**
First-time users see an empty project dashboard with quick action buttons.
The value proposition is not stated. There is no sample project or template
gallery.

**Proposed state:**
When `projectCount === 0`:

```
┌─────────────────────────────────────────────────────────┐
│                                                         │
│   Welcome to [App name]                                 │
│                                                         │
│   Free forever. No account. No limits.                  │
│                                                         │
│   [Convert a photo to a pattern ▶]                      │
│                                                         │
│   [Start from a template]   [Import existing .oxs]      │
│                                                         │
│   ──────────────────────────────────────────────────    │
│   One app for the whole journey:                        │
│   Create patterns · Track your stitching · Manage stash │
│                                                         │
└─────────────────────────────────────────────────────────┘
```

When `projectCount > 0`, the normal dashboard is shown.

**Expected impact:**
- Dramatically reduces blank-canvas anxiety for new users
- States the value proposition clearly at the moment of highest attention
- The three CTAs match the three user entry points (create / import / stitch)

**Implementation notes:**
- Conditional rendering based on `ProjectStorage.listProjects().length === 0`
- Starter kit templates exist (`starter-kits.js`) — link to them
- No new data model needed

---

## 8. Flow Improvement FI-08: Stash Quick-Add (Barcode / Text Scan)

**Borrowed from:** Thread Stash (account-based; add threads easily), Yarn Buddy
(photo recognition)

**Current state:**
Adding threads to stash requires: navigate to manager → find thread in list →
toggle owned. For users with large collections, initial setup is tedious.

**Proposed state:**
A "Bulk add" mode (we already have BulkAddModal.js) that accepts:
1. Pasted text list of DMC codes ("310, 317, 318 white")
2. CSV upload (from a spreadsheet)

The bulk add already exists (`BulkAddModal.js`). The improvement is:
- Surface it more prominently (not buried in a menu)
- Accept CSV upload as an alternative to pasting
- Show a "Quick start: paste your DMC codes" prompt on first visit to stash

**Expected impact:**
- Reduces friction for new stash setup from 30+ minutes to 2–5 minutes
- Users who track stash in spreadsheets can migrate instantly

**Implementation notes:**
- `BulkAddModal.js` already exists; extend to accept CSV
- CSV format: columns for brand, code, name, owned count
- On first stash visit: show a "Get started fast" banner pointing to bulk add

---

## 9. Flow Improvement Summary

| Improvement | Borrowed from | Effort | Impact | Priority |
|---|---|---|---|---|
| FI-01: Live preview panel | StitchMate | High | High | **P1** |
| FI-02: Stitchability score | StitchMate | Medium | High | **P1** |
| FI-03: Row mode in tracker | Pattern Keeper | Medium | High | **P1** |
| FI-04: Post-session summary | Fitness apps | Low | Medium | **P2** |
| FI-05: Thread gap shopping | Ravelry | Medium | High | **P1** |
| FI-06: Export preset profiles | Print software | Low | Medium | **P2** |
| FI-07: Home first-run state | StitchMate | Low | High | **P1** |
| FI-08: Stash quick-add CSV | Thread Stash | Low | Medium | **P2** |
