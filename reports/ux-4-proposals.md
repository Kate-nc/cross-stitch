# UX Audit · 4 (Phase 2) · Three Redesign Proposals

> Phase 2 — three genuinely different scopes for fixing the issues from
> [ux-3-problems.md](ux-3-problems.md). Read the wireframes alongside this
> document; each proposal references its own file set under
> [reports/wireframes/](wireframes/).

---

## Quick comparison

|  | A — Quick wins | B — Targeted redesign | C — Ground-up rethink |
|---|---|---|---|
| **Scope** | Fixes 🔴 issues with no structural change | Restructures specific workflows; same nav model | New navigation model + dashboard reframe |
| **Effort** | ~2 weeks (one engineer) | ~6–8 weeks | ~10–14 weeks |
| **Risk** | Very low | Moderate (muscle-memory cost) | High (existing users must relearn) |
| **🔴 issues addressed** | 9 of 11 | 11 of 11 | 11 of 11 |
| **🟡 issues addressed** | 8 of 34 | 24 of 34 | 32 of 34 |
| **🟢 issues addressed** | 2 of 15 | 8 of 15 | 14 of 15 |
| **New screens / surfaces** | 0 | 1 (unified Materials hub) | 3 (Workspace, Studio, Library) |
| **New components needed** | Button primitive, "first-stitch" coachmark | Plus: pattern-fill-in thumb, drawer pattern, multi-select toolbar | Plus: workspace shell, command-bar, focus mode |

---

## Proposal A — "Quick wins"

> Goal: fix the things that demonstrably block or confuse, with **no
> structural change** and no new screens. Land in days; users should
> feel "the rough edges are gone".

### Changes

| Area | Change | Wireframe |
|---|---|---|
| Onboarding | Replace welcome wizard with a **first-canvas coachmark**: when the Creator opens with an empty grid, a light overlay points at the palette tab and says "Add a colour to begin". A "Try a sample pattern" link in the empty home loads a 50×50 starter from `starter-kits.js`. | [a-home-empty.html](wireframes/a-home-empty.html), [a-creator-firstcanvas.html](wireframes/a-creator-firstcanvas.html) |
| Header navigation | Keep the dual nav, but **visually unify the relationship**: app-section tabs become an underlined row; sub-page becomes a clear secondary toolbar below them with an explicit "in {Project Name}" prefix. Touch targets bumped to 44 px tall on coarse-pointer devices. | [a-header.html](wireframes/a-header.html) |
| Tracker | Edit-mode banner becomes a **prominent red strip across the canvas** ("Edit mode — taps will modify stitches. Exit to resume tracking."), with a one-tap "Exit edit mode" button. Resume modal gains a **"Last session" line** ("47 stitches, 32 minutes, 3 days ago"). | [a-tracker-editmode.html](wireframes/a-tracker-editmode.html), [a-tracker-resume.html](wireframes/a-tracker-resume.html) |
| Creator | Add a **toolbar button** for split-pane preview (currently `\` only). Add a **"first stitch" empty-canvas hint** (described above). Make the cleanup operation **undoable** by snapshotting the pattern into the existing edit-history stack. | [a-creator-toolstrip.html](wireframes/a-creator-toolstrip.html) |
| Stash | "Limit to stash" toggle now **also re-quantises** the pattern (calls `findBest` against owned palette) — or, if disabled, displays an explicit "Pattern uses 3 unowned threads — substitute now" inline warning. | (annotation in [a-creator-toolstrip.html](wireframes/a-creator-toolstrip.html)) |
| Dashboard | De-duplicate Sticky Continue + Suggestion (hide Suggestion when it equals the Continue project). Replace 🔥 / 💡 / 📊 / ✦ emoji with `Icons.fire` / `Icons.lightbulb` / `Icons.barChart` / `Icons.star`. Replace "Stash not checked" placeholder with nothing (only show the badge when a real result exists). | [a-dashboard.html](wireframes/a-dashboard.html) |
| Visual | Introduce one **`<Button>` primitive** (`<Button variant="primary|secondary|ghost|danger" size="sm|md">`) and migrate header + dashboard call-sites only (defer toolbar / modals to B). | (no wireframe; design-token doc in C/Phase 4) |
| Mobile inputs | Apply the recorded mobile form conventions (inputMode, enterKeyHint, autocomplete, inline error) to remaining 4 form-heavy modals. | (annotation in [a-tracker-resume.html](wireframes/a-tracker-resume.html)) |

### What it deliberately does NOT solve

- **A1** parallel navigations — still present, just visually clearer.
- **A4** sub-page tabs duplicated in header dropdown + sidebar — both kept.
- **B1** toolbar/canvas balance — toolbar still wide.
- **C2 / F-6.1** export = two sub-pages — unchanged.
- **C3 / C4** no bulk select / no project search.
- **G2** Creator overflow `⋯` menu still hides tools on tablet.
- Modal architecture stays at 3 patterns; only Button gets unified.
- Dashboard still doesn't show partial-stitched thumbnails.

### Effort by change

| Change | Size |
|---|---|
| First-canvas coachmark | S |
| Sample pattern link | S |
| Header touch target bump + visual unify | S |
| Tracker edit-mode banner + resume recap | S |
| Split-pane button + cleanup undo | M |
| Stash toggle re-quantise | M |
| Dashboard de-duplicate + emoji removal | S |
| `<Button>` primitive (header + dashboard) | M |
| Mobile inputs sweep | S |

### Risks

- The **stash toggle behaviour change** (re-quantise vs. hide) is the
  highest-risk part — users with existing patterns will see colours
  shift on next load. Ship behind a one-time migration toast: "Stash
  filter now matches your stash exactly. Want to revert?".
- The **Button primitive migration** is a code-style risk only; visual
  parity is the gate.

---

## Proposal B — "Targeted redesign"

> Goal: redesign the worst workflows (Materials/Prepare/Export, Tracker
> mark/edit, Dashboard density) without changing the navigation model
> or top-level page structure. The user still has Create / Edit / Track
> / Stash / Stats — but each surface is rethought.

### Changes

Includes everything in Proposal A, plus:

| Area | Change | Wireframe |
|---|---|---|
| **Materials hub** | Collapse the three sub-pages **Materials**, **Prepare**, and **Export** into one **Materials & Output** surface with three side-tabs inside (Legend / Shopping / Export). Header sub-page dropdown shrinks from 5 entries to 3 (Pattern / Project / Materials). | [b-materials.html](wireframes/b-materials.html) |
| **Sidebar refactor** | Right sidebar is **mode-aware**: in Pattern view it shows palette + tools context; in Project view, metadata; in Materials view, sort/filter. Stops mirroring the sub-page tabs. | [b-creator-edit.html](wireframes/b-creator-edit.html) |
| **Tracker layout** | Replace small percent-bar in immersive header with a **mini fill-in preview** (96 × 96 px partial-stitched thumbnail) that doubles as the "open project" tap target. Highlight banner becomes a **persistent chip** in the action bar. | [b-tracker.html](wireframes/b-tracker.html) |
| **Edit mode in tracker** | Becomes a separate **mode toggle in the action bar** (not a sub-banner). When active, the action bar background turns warning-red and the "Mark" button becomes "Modify". | (in [b-tracker.html](wireframes/b-tracker.html)) |
| **Drag-mark** | Tracker supports drag-to-mark on touch with a 200 ms delay (avoids conflict with pinch-zoom). Long-press range-select becomes the alt path. | (annotation in [b-tracker.html](wireframes/b-tracker.html)) |
| **Dashboard rich** | Cards render **partial-stitched thumbnails** (use `done` mask + `pattern` to draw a low-res preview client-side at card mount). Replace `[+ Add]` with a 3-button "Start something new" row (Blank / From image / Import). Add a **collapsible "This week" recent-activity timeline** beneath the cards. | [b-dashboard.html](wireframes/b-dashboard.html) |
| **Search & multi-select** | Add a search field at the top of the dashboard (debounced) and a Cmd/long-press multi-select on cards with a bulk action bar (Archive / Move to queue / Export selection). | (in [b-dashboard.html](wireframes/b-dashboard.html)) |
| **Modal primitive** | Migrate to a single `<Modal>` component (overlay + box + header + close); kill the Manager's inline modals. | (no new wireframe — visual parity) |
| **Help merge** | Help Centre and Shortcuts modal merge into one `<HelpDrawer>` with two tabs (Topics / Shortcuts), reachable from `?` and from a contextual `?` button on each major surface. | [b-help.html](wireframes/b-help.html) |
| **Manager tabs** | Add a third tab **"Shopping list"** that aggregates per-project missing-thread badges across the library (currently scattered). | (annotation in [b-materials.html](wireframes/b-materials.html)) |

### Newly addressed (vs A)

- **A4** sub-page duplication resolved (three sub-pages instead of five,
  sidebar no longer mirrors).
- **A5** scattered stash actions consolidated into Materials hub +
  Manager Shopping tab.
- **B1** toolbar competes with canvas — sidebar collapses to icon-rail
  in Pattern view; canvas gains ~120 px width on tablet.
- **C2** export bundled (Materials hub can produce both PDF + thread
  list as a single zip).
- **C3 / C4** dashboard search + multi-select.
- **C7** drag-mark on touch.
- **D7** mobile fill-in thumbnail.
- **E2** unified Modal.
- **F5** Help + Shortcuts merged.

### Deliberate non-goals

- **A1** still keeps two-tier header navigation (just cleaner).
- **G2** ToolStrip still uses overflow `⋯` menu (tackled in C).
- Creator is still desktop-first.
- Workspace concept (single shell hosting Create + Track + Stash) — not
  attempted.

### Effort by change

| Change | Size |
|---|---|
| Materials hub consolidation | L |
| Sidebar mode-aware refactor | M |
| Tracker layout + drag-mark | L |
| Dashboard cards partial-stitched + search/multi-select | L |
| Modal primitive migration | M |
| Help+Shortcuts merge | S |
| Manager Shopping tab | M |

### Risks

- **Materials hub** is the riskiest — moves three deep-linked surfaces
  into one. Mitigate with a one-time tour (`onboarding.js`).
- **Sidebar refactor** changes scroll position and accordion memory; ship
  with a one-time "we cleaned up the sidebar" toast.
- **Drag-mark** has historically caused mis-marks in similar apps; ship
  behind a preference toggle defaulted on with easy revert.

---

## Proposal C — "Ground-up rethink"

> Goal: redesign the app for *2026* — touch-first, canvas-primary,
> resumable, and mode-aware. Same data model, same engine; new shell.

### Top-level reframing

Instead of three pages stitched together by a header, introduce **one
Workspace shell** with three modes:

```
   Workspace (one URL: /)
   ├── Studio   (== Create + Edit)
   ├── Stitch   (== Track)
   └── Stash    (== Manager)
```

Mode is selected by a **left-edge mode rail** (always visible, 56 px wide,
icon + label that collapses on phones). The canvas/grid is the **primary
content frame** — toolbar and panels float over or alongside it,
collapsible.

The previous five header tabs collapse to **three modes**; the sub-page
dropdown disappears. Materials / Prepare / Export collapse the same way
as in B. Statistics is no longer a "mode" but a pull-out drawer accessible
from any mode.

### Changes

Includes everything in Proposal B, plus:

| Area | Change | Wireframe |
|---|---|---|
| **Workspace shell** | New left rail (Studio / Stitch / Stash) + collapsible top context bar + canvas + collapsible right inspector. Header File menu + Help + Preferences move into a **command bar** (bottom-right floating "K" button on desktop, top-right kebab on mobile). | [c-workspace.html](wireframes/c-workspace.html) |
| **Project switcher in rail** | Bottom of the mode rail shows the current project's mini-thumb + name; tap opens a pop-out switcher (search + recent + new). Removes the project badge from the header. | (in [c-workspace.html](wireframes/c-workspace.html)) |
| **Studio (was Creator)** | Tools become a **floating dock** along the canvas's bottom edge; 7 always-on tools, plus a "More" pill that opens a sheet (no `⋯` overflow). On tablet/phone the dock becomes a horizontally scrollable pill bar. Sub-pages collapse to a single right inspector with three tabs (Project / Materials / Export). | [c-studio.html](wireframes/c-studio.html) |
| **Stitch (was Tracker)** | **Focus mode** by default: only canvas + bottom action bar visible; chrome auto-hides on stitch-tap (no scroll-based heuristic). Tap the bottom corner reveals the action bar. Drag-to-mark + long-press range select + parking markers all surfaced. Resume screen replaced with a **"Welcome back" screen** showing pattern preview, last-session stats, breadcrumb-trail mini-replay, and three CTAs (Continue / Switch project / End). | [c-stitch.html](wireframes/c-stitch.html), [c-stitch-resume.html](wireframes/c-stitch-resume.html) |
| **Stash (was Manager)** | Becomes a **two-pane layout** with a list on the left and a fixed inspector on the right (no slide-in drawer). Threads, patterns and shopping list are tabs at the top of the list pane. | [c-stash.html](wireframes/c-stash.html) |
| **Workspace home** | Replaces the dashboard. **Three rows:** "Resume stitching" (live mini-canvas of last project showing partial fill-in), "Your stitch journal" (this-week heat-map + last 3 sessions + completed milestones), "Library" (queued / paused / completed strips). The Suggestion algorithm is integrated into "Resume stitching" as "Or pick up: …" rather than a separate card. Empty state is a **3-column "What would you like to do?"** with sample-pattern, blank-canvas, image-import. | [c-home.html](wireframes/c-home.html), [c-home-empty.html](wireframes/c-home-empty.html) |
| **Mode-coloured chrome** | Each mode has a **subtle accent shift** (Studio = current teal, Stitch = warm amber, Stash = cool slate) so the user always knows what mode they are in without reading a header. Critically, all three accents are *neutral relative to the DMC palette* (not saturated thread-like hues). | (annotated across c-* wireframes) |
| **Command bar (Cmd-K everywhere)** | Replaces the command palette as the *primary* path to non-modal global actions. Always-visible "K" pill on desktop, swipe-down on mobile. | [c-cmdbar.html](wireframes/c-cmdbar.html) |
| **Stats drawer** | Pull-out from the right of any mode rather than a separate page. Project-scoped if a project is open; global otherwise. | (in [c-workspace.html](wireframes/c-workspace.html)) |
| **Visual system** | Adopt a 4-token system: `--bg`, `--surface`, `--ink`, `--accent-{mode}`. Move all chrome colours to neutral greys/slates so DMC content stands alone. | covered in [ux-6-design-tokens.md] (Phase 4 placeholder) |

### Newly addressed (vs B)

- **A1** parallel navigations resolved (single mode rail).
- **B1** toolbar/canvas balance: floating dock + collapsible inspectors.
- **B3** chrome vs thread colour: deliberately neutral chrome.
- **F-X.10 / G2** Creator becomes mobile-first (floating dock).
- **F4** stitch-style wizard moves into per-project setup, not per-device.
- **D2** resume becomes the dedicated "Welcome back" screen.
- **A8** Preferences subsumed into command bar + per-mode settings panels.

### Deliberate non-goals

- **No data-model changes** — same IndexedDB stores, same pattern JSON,
  same backup format.
- **No removal of the per-cell context menu** — same right-click /
  long-press behaviour.
- Some 🟢 polish items (E10 stats naming, B7 difficulty badges) get
  re-skinned but not removed.

### Effort by change

| Change | Size |
|---|---|
| Workspace shell + mode rail | L |
| Studio rebuild (floating dock + inspector) | L |
| Stitch focus mode + drag-mark + welcome-back screen | L |
| Stash two-pane | M |
| Workspace home (journal + resume + library) | L |
| Command bar promotion + Preferences merge | M |
| Mode-coloured chrome + neutral palette | M |
| Migration tour (one-time) | S |

### Risks

- **Muscle memory cost.** Existing users have the dual-nav header
  memorised; the mode rail is a different mental model.
- **PWA install icon** points at `index.html` today; add backwards-compat
  redirect (`?mode=stitch` → `/`+`mode=stitch` URL state).
- **Engineering surface area** is big — should be staged behind a
  feature flag (`prefs.workspace_v2`) with both shells coexisting until
  parity is reached.

---

## Cross-proposal traceability

Mapping problems → proposals.

| Problem | A | B | C |
|---|:-:|:-:|:-:|
| A1 dual nav | partial | partial | ✔ |
| A2 three open paths | — | partial | ✔ |
| A3 lifecycle split | — | — | ✔ |
| A4 sub-page duplication | — | ✔ | ✔ |
| A5 scattered stash actions | — | ✔ | ✔ |
| A6 stats has 3 doors | — | partial | ✔ |
| A7 embroidery sandbox | remove from build | remove | remove |
| A8 prefs cognitive load | — | — | ✔ |
| B1 toolbar vs canvas | — | partial | ✔ |
| B2 primary blur | ✔ (button primitive) | ✔ | ✔ |
| B3 chrome vs thread colour | — | — | ✔ |
| B4 progress fill = swatch | — | ✔ | ✔ |
| B5 12+ button styles | partial | ✔ | ✔ |
| B6 you-are-here | partial | ✔ | ✔ |
| B7 difficulty emoji | ✔ | ✔ | ✔ |
| B8 save status persistent | ✔ | ✔ | ✔ |
| C1 first-stitch | ✔ | ✔ | ✔ |
| C2 export bundle | — | ✔ | ✔ |
| C3 multi-select | — | ✔ | ✔ |
| C4 project search | — | ✔ | ✔ |
| C5 cleanup undo | ✔ | ✔ | ✔ |
| C6 split-pane button | ✔ | ✔ | ✔ |
| C7 drag-mark | — | ✔ | ✔ |
| C8 shape tools | — | — | partial |
| C9 first-save name | — | partial | ✔ |
| C10 nav cancels worker | — | ✔ | ✔ |
| D1 session-active visibility | — | ✔ | ✔ |
| D2 resume recap | ✔ | ✔ | ✔ |
| D3 cleanup preview | — | ✔ | ✔ |
| D4 generate ETA | — | ✔ | ✔ |
| D5 edit-mode subtle | ✔ | ✔ | ✔ |
| D6 selection lost | — | ✔ | ✔ |
| D7 % only on mobile | — | ✔ | ✔ |
| D8 stash toggle dishonest | ✔ | ✔ | ✔ |
| D9 save status | ✔ | ✔ | ✔ |
| E1 button variants | partial | ✔ | ✔ |
| E2 modal architectures | — | ✔ | ✔ |
| E3 progress bars | — | ✔ | ✔ |
| E4 breakpoints | — | partial | ✔ |
| E5 onboarding overlap | ✔ | ✔ | ✔ |
| E6 emoji violations | ✔ | ✔ | ✔ |
| E7 cleanup undo | ✔ | ✔ | ✔ |
| E8 right-click parity | — | partial | ✔ |
| E9 dual name editing | — | ✔ | ✔ |
| E10 stats naming | — | — | ✔ |
| F1 onboarding talks | ✔ | ✔ | ✔ |
| F2 sample pattern | ✔ | ✔ | ✔ |
| F3 hidden power features | partial | ✔ | ✔ |
| F4 wizard re-runs | — | — | ✔ |
| F5 Help vs Shortcuts | — | ✔ | ✔ |
| F6 suggestion explanation | — | ✔ | ✔ |
| F7 wizard skip wording | ✔ | ✔ | ✔ |
| G1 touch targets | ✔ | ✔ | ✔ |
| G2 creator overflow | — | partial | ✔ |
| G3 immersive heuristic | — | partial | ✔ |
| G4 mobile undo affordance | ✔ | ✔ | ✔ |
| G5 manager drawer covers | — | partial | ✔ |
| G6 modals not full-screen | — | ✔ | ✔ |
| G7 form input hygiene | ✔ | ✔ | ✔ |
| G8 home drop zone hidden | — | ✔ | ✔ |

---

## Wireframe index

All wireframes are static HTML (no JS required); open in a browser.
Each is annotated where the interaction is non-obvious.

### Proposal A wireframes
- [a-home-empty.html](wireframes/a-home-empty.html) — sample-pattern link
- [a-creator-firstcanvas.html](wireframes/a-creator-firstcanvas.html) — coachmark
- [a-creator-toolstrip.html](wireframes/a-creator-toolstrip.html) — split-pane button + stash-toggle warn
- [a-header.html](wireframes/a-header.html) — touch targets + visual unify
- [a-tracker-resume.html](wireframes/a-tracker-resume.html) — last-session line
- [a-tracker-editmode.html](wireframes/a-tracker-editmode.html) — bold edit-mode banner
- [a-dashboard.html](wireframes/a-dashboard.html) — de-dup + emoji removal

### Proposal B wireframes
- [b-dashboard.html](wireframes/b-dashboard.html) — partial-stitched thumbs + search + multi-select
- [b-creator-edit.html](wireframes/b-creator-edit.html) — sidebar mode-aware
- [b-materials.html](wireframes/b-materials.html) — Materials hub with Legend / Shopping / Export
- [b-tracker.html](wireframes/b-tracker.html) — fill-in mini-preview + drag-mark + edit-mode chip
- [b-help.html](wireframes/b-help.html) — Help+Shortcuts merged drawer

### Proposal C wireframes
- [c-workspace.html](wireframes/c-workspace.html) — workspace shell + mode rail + project switcher
- [c-home.html](wireframes/c-home.html) — workspace home (Resume / Journal / Library)
- [c-home-empty.html](wireframes/c-home-empty.html) — three-column empty state
- [c-studio.html](wireframes/c-studio.html) — floating dock + collapsible inspector
- [c-stitch.html](wireframes/c-stitch.html) — focus mode + chrome reveal
- [c-stitch-resume.html](wireframes/c-stitch-resume.html) — Welcome back screen
- [c-stash.html](wireframes/c-stash.html) — two-pane stash
- [c-cmdbar.html](wireframes/c-cmdbar.html) — command bar + Preferences merge
