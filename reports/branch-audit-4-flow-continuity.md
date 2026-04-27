# Branch Audit · Report 4 — Flow Continuity & Broken Journeys

Method: walked each end-to-end persona journey from
[ux-2-user-journeys.md](ux-2-user-journeys.md) on the redesign
branch, flagging every place the user is interrupted, loses
context, or sees a confusing state. Severity legend matches reports
7-8.

## J1 · Beginner Bea — image to printed PDF

Steps as documented in ux-2 §"Bea's first journey", revisited:

| Step | Outcome on branch | Δ vs main |
|---|---|---|
| 1. Land on `/` from a friend's link | `/home` dashboard. | New surface; first-impression nicer (cross-mode visible). |
| 2. Welcome wizard | Same 3-step wizard, Workshop polish. Skippable. | ✅ |
| 3. Drop cat photo | Onto "From image" tile — deep-links into Creator with the import path open. | ✅ |
| 4. Pattern generates | Same pipeline. | ✅ |
| 5. Sidebar density | Unchanged on this branch (Plan A's sidebar split is **not** in scope; deferred). | ⚠️ Bea's biggest friction (P-W1-M2) is still present. |
| 6. "Limit to stash" warning shown when no stash | Still present (no targeted fix in this program). | ⚠️ Not regressed but not fixed (F-W1-H2). |
| 7. **Print PDF** | **One click** on the action bar. Bea is unblocked. | **W (−4 clicks)** |
| 8. PDF opens on phone | Unchanged. | ✅ |

**Outcome.** Bea's headline blocker (Print PDF buried) is removed.
Sidebar density and "limit to stash" warning persist as carry-forward
issues but no longer block the W1 outcome.

## J2 · Beginner Bea — tracking on her phone

| Step | Outcome on branch | Δ vs main |
|---|---|---|
| 1. Open `stitch.html` on Android | Babel still compiles; first paint still slow. | = |
| 2. Project picker | HeaderProjectSwitcher offers her recent project in 1 tap; or she can pick from `/home` if she landed there. | W |
| 3. Tracker view | Floating dock + bottom mode pill + safe-area honoured. Canvas now ≥ 80% of viewport. | **Big W** |
| 4. Tap stitches | 44 px tool buttons; tap target on actual cell unchanged (cell size is pattern-dependent). | = (cell-tap is the same; surrounding chrome better) |
| 5. Edit-mode foot-gun | Mode pill makes Edit a deliberate switch (was a single small icon on main). | W |
| 6. Colour drawer | Current colour now pinned at top (chip with DMC ID + name + remaining). Bottom drawer no longer the only way to see it. | **Big W** |
| 7. Screen sleep | **Wake-lock chip** in header. Bea taps it; the screen stays awake. | **Big W (M-H3 fix)** |
| 8. Welcome Back recap | Unchanged — still works. | ✅ |

**Outcome.** Mobile tracker is materially better. Two of Bea's
top-three frictions resolved.

⚠️ **Continuity gap C1.** When the user switches project from the
tracker rail (tablet/desktop), `tracker-app.js` does
`window.location.reload()`. Eli's "open another WIP from the rail"
is now a 3-5 s wait on mid-range Android. Same click count as main
but feels *slower*. See report 7 ⚠️ M-T1.

## J3 · Experienced Eli — import a 60-page PDF and start tracking

Eli's flow is unchanged from main. Sync, drag-mark, and PDF importer
remain on their existing surfaces (out of scope for this program per
ux-12). One specific affordance gain:

- Cross-page navigation is now 1 click (mode pill in header), down
  from 2 (header tabs/hamburger). For a user juggling 30+ WIPs this
  is a quality-of-life improvement.

⚠️ **Continuity gap C2.** No "Open in Tracker" / "Edit in Creator"
buttons added to the Manager Pattern card despite being part of the
plan-c-creator-design / plan-c-creator-use wireframes. Still 4
clicks to edit a Manager pattern. **Carried-over regression.** See
report 7 🟠 N-H1-r.

## J4 · Designer Devi — design + export sellable PDF

| Step | Outcome on branch | Δ vs main |
|---|---|---|
| Designer Branding fields | Still on Project tab (was Plan C's territory; Plan B/Hybrid scope didn't move them to Output). | ⚠️ Carried-over (F-W6-H1). |
| Watermark control | Not present (out of scope). | ⚠️ Carried-over (F-W6-H3). |
| PDF Workshop print theme | New optional theme via `creator.pdfWorkshopTheme` pref. PK-compat default unchanged. | ➕ |
| Anchor cross-ref in legend | Not present (out of scope). | ⚠️ Carried-over. |

**Outcome.** Devi gains the optional Workshop print theme and a nicer
header workflow but her headline blockers are still unaddressed.
Acceptable per the Hybrid 4 plan (Devi was prioritised lower).

## Cross-cutting flow concerns

### CF1 · `/home` deep-link round-trips
- **Trigger.** User clicks a `/home` quick-action tile.
- **Behaviour now.** Deep-links work after `24c0f75` fixed them. Verified existing test: `tests/landingRedirect.test.js`.
- **Risk.** None remaining. Closed.

### CF2 · Modal interruptions during onboarding
- **Trigger.** First-visit Tracker user sees both WelcomeWizard and StitchingStyleOnboarding.
- **Behaviour now.** WelcomeWizard mounts first; style picker is gated behind the `cs_welcome_tracker_done` flag (tracker-app.js style-picker `useState`). They appear sequentially. Phase-5 test plan documents the merge attempt; the standalone style modal remains for the toolbar reopener path.
- **Verdict.** ✅ No double-pop-up.

### CF3 · Service worker cache eviction across the v9→v10 bump
- **Trigger.** Returning user with PWA installed at v9 visits after v10 ship.
- **Behaviour.** SW v10 cleans v9. `tests/swPrecache.test.js` verifies precache list. Browsers will pull the new bundle on the next cycle.
- **Risk.** Users who had the broken v9 bundle cached should be auto-recovered. Acceptable. ✅

### CF4 · Modal stack with HelpDrawer + Overlay
- **Trigger.** User opens any Overlay-based dialog, presses `?` to open the Help drawer.
- **Behaviour.** Help drawer is a side drawer (`role="dialog" aria-modal="false"`) — page behind remains scrollable. ESC closes the topmost. Tested.
- **Risk.** None. ✅

### CF5 · Mode pill vs header tabs duplication
- **Trigger.** Header now has both the mode pill *and* the project switcher.
- **Behaviour.** Mode pill is the primary mode jumper; the existing Header tabs (Pattern / Project / Materials etc. inside Creator) are *page-internal* tabs and remain. No conflict.
- **Risk.** Possible confusion on phone where space is tight. See report 5.

### CF6 · ⌘K opens nothing on phones (no modifier key easily reachable)
- **Trigger.** Phone user tries to use the command palette.
- **Behaviour.** No on-screen affordance to *open* the palette on phone. ⌘K is keyboard-only.
- **Risk.** ⚠️ Discoverability gap. See report 7 (low) — add a header search-icon button that opens the palette on touch. `Icons.search` already exists.

## Verdict on flow continuity

- 0 broken journeys.
- 2 continuity gaps that exist on **both** branches (Manager → Editor jump; sidebar density). Carry-forward — call out in report 8.
- 1 continuity time-regression (project switch from rail). Cheap to fix — report 9.
- 1 missing-affordance issue on phone (no ⌘K touch entry-point). Cheap to fix.
