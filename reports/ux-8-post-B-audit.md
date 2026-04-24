# UX Audit · Phase 8 — Post-B re-audit

> Read-only audit of the Cross Stitch PWA on `ui-improvements` after Phases A
> (A1–A7) and B (B1–B6) shipped. The original audit
> ([ux-3-problems.md](ux-3-problems.md), [ux-4-dashboard-audit.md](ux-4-dashboard-audit.md))
> is now partly stale — half its findings are closed, but the consolidation
> introduced new pinch points. This report flags those, cross-references the
> remaining open items, and proposes the next quarter (Quarter C) backlog.
>
> Method: walked Creator, Tracker, Manager top-to-bottom against the
> ten-criterion rubric (discoverability, information scent, state legibility,
> feedback latency, cognitive load, pinch points, mobile parity, a11y,
> honest copy, cross-mode coherence). Drove off current source, not the
> wireframes in `previews/` (those are pre-B).

---

## 1 · Executive summary — top 5 pinch points

| # | Severity | Pinch point |
|---|---|---|
| 1 | 🔴 | **Help drawer has no visible affordance** — keyboard-only `?` trigger; new users never discover it |
| 2 | 🔴 | **Materials Hub sub-tabs read like top-level pages** — visual ambiguity right after the 5→3 consolidation |
| 3 | 🟡 | **B2 drag-mark silently disabled** — users who try to swipe see nothing happen, no UI explains why |
| 4 | 🟡 | **"Shopping" exists in two places with two scopes** — Creator's project-scoped vs Manager's library-scoped; no signposting |
| 5 | 🟡 | **Bulk delete uses `window.confirm()`** — breaks visual coherence and loses the project-name context |

Full detail in §3.

---

## 2 · What's working well

Honest list — no padding.

- **A1 stash warning** — the panel is now legible and gives the user two
  concrete next actions instead of a passive subtitle. Verified at
  [creator/Sidebar.js](creator/Sidebar.js).
- **A2 edit-mode banner** — the red strip + "Modify" relabel is impossible
  to miss; closes D5 cleanly.
- **A3 resume modal** — the pace-note guard (≥ 3 sessions, ≥ 5 / hr delta)
  keeps the copy honest; no wobbly "0 / hr faster" strings.
- **B1 partial-stitch thumbnails** — the dashboard finally answers "where
  am I on this?" at a glance.
- **B3 5→3 page consolidation** — the dropdown is materially calmer; the
  legacy-ID redirect in [creator/useCreatorState.js](creator/useCreatorState.js)
  means saved prefs and bookmarks survive.
- **B5 multi-select** — selection mode entry is discoverable (long-press +
  card checkbox), and the bulk bar's count + actions are clear.
- **B6 search** — typing in the help drawer filters live; this is a real
  step-change over the old static help page.
- **Cross-mode header consistency** — header.js now resolves the active
  page label across Creator/Tracker/Manager with one component, no drift.

---

## 3 · New pinch points introduced by Phase B

### 3.1 🔴 Help drawer has no visible affordance

- **Where:** every page.
- **Symptom:** the help drawer in [help-drawer.js](help-drawer.js) is opened
  by pressing `?`. There is no help icon in the header, no floating button,
  no "Need help?" prompt on first launch (the `WelcomeWizard` is separate
  and only fires on first run).
- **Cause:** B6 deleted `onboarding.js` and `help-content.js`, both of
  which had on-page entry points. The drawer shim
  `SharedModals.Help` is reachable from existing menu items, but the bare
  `?` shortcut is the only way to open the drawer cold.
- **Fix sketch:** add an `Icons.help` button to [header.js](header.js) on
  every mode that calls `window.HelpDrawer.open()`. Below 480 px keep it as
  the right-most header button. One-line change once the icon exists.

### 3.2 🔴 Materials Hub sub-tabs read like top-level pages

- **Where:** Creator → Materials & Output, [creator/MaterialsHub.js](creator/MaterialsHub.js).
- **Symptom:** the sub-tab strip (Threads / Stash status / Shopping /
  Output) sits horizontally at the top of the page in `.mh-subtabs`, with
  visual weight close to the page selector dropdown directly above it. A
  first-time user pauses to figure out whether they've moved to a new
  page or are filtering the current one.
- **Cause:** the consolidation moved three previously top-level pages into
  one and stacked their entry points using the same horizontal-tab idiom
  as the (now collapsed) page selector — both rows look like nav.
- **Fix sketch:** distinguish the sub-tabs visually: indent the strip,
  use a softer background, label the strip with a "View:" prefix, or move
  to a left-rail vertical sub-nav inside the hub. Document the choice in
  the consolidation map.

### 3.3 🟡 B2 drag-mark silently disabled

- **Where:** Tracker grid, [useDragMark.js](useDragMark.js).
- **Symptom:** users who learn drag-mark from release notes or muscle
  memory will swipe and see nothing happen. No toast, no setting toggle.
- **Cause:** `window.B2_DRAG_MARK_ENABLED` defaults to `false`. The flag
  exists to avoid colliding with the legacy touch handler.
- **Fix sketch:** either ship the coordination PR (rip out the legacy
  handler, default the flag on) or surface an opt-in toggle under
  Preferences → Tracker → "Drag to mark stitches (experimental)" via
  `UserPrefs`. Either way, the silent-disabled state should not persist.

### 3.4 🟡 "Shopping" lives in two places with two scopes

- **Where:** Creator → Materials & Output → Shopping sub-tab AND Manager →
  Shopping tab. [creator/MaterialsHub.js](creator/MaterialsHub.js) and
  [manager-shopping.js](manager-shopping.js).
- **Symptom:** users won't immediately know which Shopping is which.
  Creator's is project-scoped; Manager's aggregates across active
  projects. The two CTAs ("Add to shopping list") look identical.
- **Cause:** the B4 epic shipped both because both have honest use cases,
  but no signposting was added to differentiate them.
- **Fix sketch:** rename the Creator sub-tab to **"Shopping for this
  pattern"** and the Manager tab subtitle to "Shopping across all active
  projects". A one-line caption under each header is enough.

### 3.5 🟡 Bulk delete uses `window.confirm()`

- **Where:** [home-screen.js](home-screen.js) bulk-action bar.
- **Symptom:** the destructive confirmation is the browser's native
  dialog. Generic copy ("Delete 4 items?"), no project-name list, no
  visual coherence with the rest of the app.
- **Cause:** B5 reused the simplest available confirm to ship in scope.
- **Fix sketch:** replace with a styled modal that lists the names of
  the projects about to be deleted (truncated to ~5 + "and N more"),
  echoes the count, and offers the standard Cancel / Delete button pair.

### 3.6 🟡 Sidebar mode-swap fade can disorient

- **Where:** Creator page-switch, [creator/Sidebar.js](creator/Sidebar.js).
- **Symptom:** moving Pattern → Materials & Output makes the entire right
  rail vanish in a 160 ms fade. Users who had their attention on the
  sidebar lose context; nothing tells them the sidebar's content is now
  full-width inside the page.
- **Cause:** the design choice (B3) is correct in principle but lacks a
  micro-cue.
- **Fix sketch:** during the fade-out, briefly slide the page content
  toward the right rail's vacated space (a 12 px translate) so the user
  perceives the layout *expanding* rather than the sidebar *vanishing*.

### 3.7 🟡 "Continue stitching" hero is hidden in selection mode

- **Where:** [home-screen.js](home-screen.js).
- **Symptom:** entering multi-select removes the Continue bar entirely.
  If the user long-pressed by accident, the most useful single button on
  the dashboard disappears with no obvious way back.
- **Cause:** B5 hides the bar to make room for the bulk-action bar.
- **Fix sketch:** keep a small "Cancel selection" button persistent in
  the same slot — this both restores the path home and signals the mode
  shift.

### 3.8 🟡 MaterialsHub remembers sub-tab globally, not per-project

- **Where:** [creator/useCreatorState.js](creator/useCreatorState.js)
  `creator.materialsTab`.
- **Symptom:** opening project A on the Output sub-tab then switching to
  project B drops the user on Output again, even if the natural starting
  point for B is Threads.
- **Cause:** persistence key is global.
- **Fix sketch:** namespace the persisted value by project ID, or simply
  reset to the default sub-tab on project change.

### 3.9 🟡 Manager Shopping has no per-row link to the offending project(s)

- **Where:** [manager-shopping.js](manager-shopping.js).
- **Symptom:** a deficit of "DMC 310 — needed in 3 projects" doesn't say
  *which* three. The user can't validate the figure or jump to context.
- **Cause:** aggregation discards source attribution.
- **Fix sketch:** keep the source-project IDs in the aggregate row;
  expose them as a clickable "Used in 3 projects" disclosure.

### 3.10 🟡 Mobile form hygiene drift on new inputs

- **Where:** Manager Shopping's "Add all deficits" filters and the
  MaterialsHub Shopping sub-tab's add controls.
- **Symptom:** the new search/filter inputs added in B4 don't carry the
  `inputMode`, `enterKeyHint`, `autocomplete` attributes that the
  conventions in `.github/copilot-instructions.md` require.
- **Cause:** new code, mobile-form checklist not enforced for B4 controls.
- **Fix sketch:** sweep the new inputs and apply the standard set; add a
  source-content guard test analogous to the existing mobile-form ones.

---

## 4 · Pinch points still open from the original audit

Cross-referenced to [ux-3-problems.md](ux-3-problems.md):

| ID | Status | Notes |
|---|---|---|
| **A2** image-import wizard rework | 🔴 OPEN | Listed in roadmap as B+; no work done. |
| **C1** no first-stitch coaching | 🔴 OPEN | Help drawer search is not a guide; the welcome wizard fires once and never returns. |
| **C6** split-pane hidden behind `\`` | 🟡 OPEN | Still keyboard-only, no toolbar entry. |
| **F1** "onboarding talks, doesn't guide" | 🟡 OPEN | The deletion of `onboarding.js` removed the worst offender, but the WelcomeWizard is still a static read. |
| **G2** toolbar collapse on tablets | 🟡 PARTIAL | A4 fixed mobile; the tablet (768–960 px) range still wraps awkwardly in two rows. |
| **D2** resume context | ✅ CLOSED by A3 |
| **D5** silent edit-mode mishit | ✅ CLOSED by A2 |
| **D8** silent stash filter | ✅ CLOSED by A1 |
| **F3** triple help system | ✅ CLOSED by B6 |
| **G1** dashboard cards lacked progress | ✅ CLOSED by A5 + B1 |
| **C3** five Creator sub-pages | ✅ CLOSED by B3 |

---

## 5 · Cross-mode coherence

| Convention | Creator | Tracker | Manager | Status |
|---|---|---|---|---|
| Header layout | Title + page selector + actions | Title + project switcher + actions | Title + tab strip + actions | ✅ Consistent |
| Top-level nav idiom | Dropdown (3 pages) | Implicit (one page) | Tab strip (3 tabs) | 🟡 Mixed; defensible per-mode but worth noting |
| Sidebar visibility | Page-dependent | Persistent | None | 🟡 New behaviour from B3 — see §3.6 |
| Toast placement | Bottom-centre | Bottom-centre | Bottom-centre | ✅ Consistent |
| Modal width | `max-width: 540px` | `max-width: 540px` | `max-width: 540px` | ✅ Consistent |
| Help affordance | None visible | None visible | None visible | 🔴 §3.1 |
| Destructive confirm | Styled modal | Styled modal | `window.confirm()` (B5 dashboard) | 🟡 §3.5 |

---

## 6 · Mobile findings (≤ 480 px)

- **Multi-select bulk bar** wraps correctly, but the action labels truncate
  to icons only — `Icons.archive` and `Icons.x` are not labelled with
  visible text on mobile, and `aria-label` strings should be verified.
- **MaterialsHub sub-tab strip** scrolls horizontally on mobile which is
  fine, but there's no scroll affordance (no fade edge, no chevron).
- **Help drawer** goes full-width on mobile per [styles.css](styles.css);
  works well. ESC key is rarely available on mobile keyboards — the
  backdrop tap is the only reliable close path; verify hit target.
- **Manager Shopping** rows wrap to three lines on narrow phones; the Add
  toggle ends up below the deficit number. Acceptable but ugly.
- **A4's 44 × 44 audit** held up under spot-check, except for the new
  sub-tab strip in MaterialsHub where each tab can be < 44 px tall on
  mobile if the label is short.

---

## 7 · Accessibility findings

- **Help drawer** uses `role="dialog"`, `aria-modal="true"`, focus trap is
  present and ESC closes — good.
- **Multi-select bulk bar** lacks `aria-live` on the count (the count
  updates silently for screen readers).
- **MaterialsHub sub-tabs** are buttons in a `<div>` rather than
  `role="tablist"` / `role="tab"`. Screen-reader users won't get
  arrow-key navigation between sub-tabs.
- **Sidebar mode-swap fade** is below the 200 ms threshold so it doesn't
  trigger reduced-motion concerns; OK.
- **Manager Shopping** rows use a checkbox per row; `aria-describedby`
  could link the "needed / owned / deficit" trio.
- **`?` keyboard shortcut** is not announced anywhere; users on
  screen-only keyboard navigation have no path to discover it.

---

## 8 · Honest-copy regressions

None found. A7 + B6 set the bar and the B3/B4/B5 strings hold the line.
The deferred placeholder ("Bulk export coming in B4" toast in
[home-screen.js](home-screen.js)) is now technically dishonest because B4
shipped without the ZIP bundle — rephrase to "Bulk export coming soon"
or "ZIP export not yet available".

---

## 9 · Recommended Quarter C backlog

Prioritised; each ticket sized **S** (a few hours), **M** (a day or two), or
**L** (multi-day, may need its own architecture doc).

| # | Ticket | Closes | Size |
|---|---|---|---|
| **C1** | Add visible Help affordance to header on all modes | §3.1 | **S** |
| **C2** | Replace `window.confirm()` in dashboard bulk-delete with a styled modal listing project names | §3.5 | **S** |
| **C3** | B2 default-on coordination PR — rip out legacy touch handler, flip the flag | §3.3, deferred from B2 | **M** |
| **C4** | Differentiate Materials Hub sub-tabs visually (indented strip, "View:" prefix, or vertical rail) | §3.2 | **M** |
| **C5** | Add scope captions to both Shopping surfaces and link Manager Shopping rows back to their source projects | §3.4, §3.9 | **S** |
| **C6** | Fix the dishonest "coming in B4" toast and add ZIP bundle export (pako is already loaded) | §8, deferred from B4 | **M** |
| **C7** | Image-import wizard rework | A2 (still 🔴 from original audit) | **L** — needs its own doc |
| **C8** | First-stitch interactive coaching — replace the static WelcomeWizard with an in-context guided tour | C1, F1 (original audit) | **L** — needs its own doc |
| **C9** | Mobile-form hygiene sweep over B4 inputs + add a guard test | §3.10 | **S** |
| **C10** | MaterialsHub sub-tabs → `role="tablist"`; bulk bar count → `aria-live` | §7 | **S** |
| **C11** | American → British alias map for help-drawer search index | B6 known limitation | **S** |

Hold for a separate architecture pass: **Proposal C** (mode rail, command
bar, focus mode), **Stats redesign**, **Sync conflict UX**, **Category
infrastructure** (would unhide the B5 "Move to category" affordance).

---

## 10 · Items deliberately NOT flagged

Recording these so a future reviewer doesn't think they were missed.

- **`embroidery.html` sandbox** — orphaned but not linked from the main
  app; users can only reach it by typing the URL. Cleanup is hygiene, not
  UX.
- **Command palette absence on mobile** — the existing palette is
  keyboard-only by design; mobile parity would require a different idiom
  and is not a regression.
- **Stats page dual entry** — the two doors (header + dashboard) lead to
  the same view; behaves as designed.
- **Preferences panel's 12 categories** — high but not a usage blocker;
  worth revisiting only after telemetry justifies grouping.
- **`creator/bundle.js` as a committed artefact** — a build/CI concern,
  not UX.

---

*End of Phase 8 audit. Next document: a Quarter C roadmap if/when the
above backlog is approved for scheduling.*
