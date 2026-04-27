# Branch Audit · Report 8 — Redesign Proposals (with wireframes)

For every 🟠 high regression in [report 7](branch-audit-7-issues.md),
this report proposes **two alternatives** and picks one based on the
interaction-cost rule (the chosen alternative MUST have ≤ baseline
click count).

Wireframes live in `reports/redesign-wireframes/` and are linked
from each proposal.

---

## P-I2 · Project switch from tracker rail

**Issue.** `TrackerProjectRail.openProject` does
`window.location.reload()`, costing 3-5 s on mid-range Android.

### Alternative A — Switch in-place (RECOMMENDED)

- **What.** Replace `window.location.reload()` with the existing in-page project-switch path. Mirror what `TrackerProjectPicker.onPick` already does:
  1. `ProjectStorage.setActiveProject(id)`
  2. Trigger the existing tracker-load effect (the same one that fires when the picker modal calls `onPick`).
  3. Dispatch `cs:projectsChanged` to refresh the rail.
- **Click cost.** 1 click (unchanged). **Time cost: −3 to −5 s on phones.**
- **Risk.** Need to re-test focus-block, parking markers, breadcrumbs, undo-history reset on switch — these are reset cleanly by the existing modal path so this is a refactor, not a new code path.
- **Wireframe.** [reports/redesign-wireframes/i2-rail-switch-in-place.html](redesign-wireframes/i2-rail-switch-in-place.html)

### Alternative B — Keep the reload but show a skeleton splash

- **What.** Add a Workshop-themed skeleton splash during reload so the wait *feels* shorter.
- **Click cost.** 1 click. Time cost ~unchanged; perception improves.
- **Risk.** Doesn't address the actual delay; user complaint shifts from "slow" to "always shows a splash".

### Decision

Pick **Alternative A.** It matches the legacy modal path's behaviour
and removes a real time regression. Implementation in report 9.

---

## P-I3 · Tracker `lpanel` lost its desktop side-pane variant

**Issue.** `lpanel` is now bottom-sheet at all viewports, occluding the
canvas on desktop.

### Alternative A — Restore side-pane at ≥1024 px (RECOMMENDED)

- **What.** Two CSS rules in `styles.css`:
  - `@media (min-width: 1024px) { .lpanel { /* side panel layout */ } }`
  - Sheet rules continue to apply below 1024 px.
- **Click cost.** No change — same triggers open the panel.
- **Risk.** Need to re-validate the original "panel eats canvas" bug doesn't come back. The fix is to make the canvas wrapper grid `grid-template-columns: minmax(0, 1fr) auto` so the canvas absorbs all remaining space when the panel is open.
- **Wireframe.** [reports/redesign-wireframes/i3-lpanel-side-vs-sheet.html](redesign-wireframes/i3-lpanel-side-vs-sheet.html)

### Alternative B — Keep bottom-sheet but make it dismissable from the side handle

- **What.** Add a side-tab handle so desktop users can quickly toggle the sheet open/closed.
- **Click cost.** Unchanged; still occludes canvas.
- **Risk.** Doesn't fix the underlying ergonomic regression.

### Decision

Pick **Alternative A.** Honors the Phase-4 wireframe intent; fixes
the canvas-eating bug at its CSS root. Implementation requires care
on the canvas grid; **defer to user approval before coding** because
the original bug existed for a reason.

---

## P-I4 · Manager Pattern cards lack Edit / Open-in-Tracker

**Issue.** Carry-over from main; in-scope per Hybrid 4 ("Manager Patterns
gain Edit and Track buttons" — `plan-c-creator-design.html`).

### Alternative A — Add both buttons to every Manager Pattern card (RECOMMENDED)

- **What.** Two ghost buttons next to the existing "Track" CTA: `[Edit ✎] [Track ▶]`. Each sets the active project pointer and navigates to the corresponding page (`index.html` for Edit; `stitch.html` for Track).
- **Click cost.** **−3 clicks** for the "open Manager pattern in Editor" task. Editing was 4 clicks (Manager → Header tabs → Creator → Open project from list → click row); now 1 click.
- **Risk.** Need to ensure `setActiveProject` then deep-link works the same way the rail's project-switch does (which `TrackerProjectRail` already does correctly via the storage API).
- **Wireframe.** [reports/redesign-wireframes/i4-manager-card-edit-track.html](redesign-wireframes/i4-manager-card-edit-track.html)

### Alternative B — Add a context menu to each card with Edit/Track/Delete

- **What.** Single `…` button opens a menu.
- **Click cost.** 2 clicks (open menu → pick action). Worse than A.
- **Risk.** None new; just slower for the primary case.

### Decision

Pick **Alternative A.** Implementation in report 9 (straightforward fix).

---

## Optional: P-I6 · Mode pill prominence

Not 🟠 but worth noting because the wireframe difference is real.

### Alternative A (RECOMMENDED)

Style mode pill as a 3-segment control on tablet/desktop (like the wireframe), keep the compact "Track ›" / "Edit ›" button on phone. CSS-only change.

### Alternative B

Add a help tooltip "Switch mode" — discoverability bandage. Worse.

---

## Wireframe summary

| Wireframe file | For issue |
|---|---|
| [i2-rail-switch-in-place.html](redesign-wireframes/i2-rail-switch-in-place.html) | I2 — in-place project switch |
| [i3-lpanel-side-vs-sheet.html](redesign-wireframes/i3-lpanel-side-vs-sheet.html) | I3 — restore desktop lpanel |
| [i4-manager-card-edit-track.html](redesign-wireframes/i4-manager-card-edit-track.html) | I4 — add Edit/Track to Manager cards |

## Decision summary

| Issue | Pick | Δ clicks | Approval needed before ship? |
|---|---|---|---|
| I2 | A (in-place switch) | 0 (time −3 to −5 s) | No — equivalent to modal path |
| I3 | A (restore desktop side-pane) | 0 | **Yes** — touches a previously-buggy CSS area |
| I4 | A (Edit + Track on cards) | −3 on the editing task | No — additive, low risk |
