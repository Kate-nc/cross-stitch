# Round 3 — T1.1 (Unified ProjectLibrary) + T2.8 (Unified ESC) Manual Test Plan

This document covers manual QA for the cross-page ProjectLibrary component and
the stack-aware `useEscape` hook introduced in this pass.

## Build state

- **Bundle:** `creator/bundle.js` rebuilt (668,339 bytes, 32 files).
- **Cache key:** `CREATOR_CACHE_KEY` bumped to `babel_creator_v19` so users on
  v18 will pick up the new modal/keyboard wiring on next load.
- **Tests:** `npm test -- --runInBand` → **529 passing / 0 failing** (was 517).
- **New scripts loaded:**
  - `project-library.js` → index.html, manager.html
  - `keyboard-utils.js` → index.html, manager.html, stitch.html
  - `home-screen.js` → also loaded by manager.html (component definitions only;
    no auto-render).

---

## T1.1 — Unified ProjectLibrary

### Setup

1. Open the app (any port) in a clean browser profile.
2. In the **Creator**, generate at least 2 distinct patterns and save each (so
   `proj_*` entries land in IndexedDB and the Stash Manager pattern library
   gets auto-synced).
3. Open the **Stash Manager** → **Pattern Library** tab → click **+ Add
   Pattern** and create one *manual* pattern (no linked project).

You should now have, for example, 2 linked + 1 manual entry.

### TC-1.1-A — Home dashboard shows all linked projects

1. Visit `index.html` (Home).
2. With ≥ 2 projects, the **multi-project dashboard** renders.
3. **Expected:** all linked projects appear with the rich card UI (thumbnail,
   progress bar, "Continue" button, state pill).
4. **Expected:** *no* manual-only patterns appear (Home stays project-focused).

### TC-1.1-B — Manager pattern library shows the same project cards

1. Visit `manager.html` → **Pattern Library** tab.
2. **Expected:** A new `Your Projects` panel appears above the existing
   pattern grid. It contains the same cards seen on Home, *plus* a "Stash
   Manager only" yellow badge on the manual entry.
3. The existing pattern grid below remains intact (still shows
   shopping-list checkboxes, brand filters, etc.).

### TC-1.1-C — Backup/restore live-refresh

1. On Home, click **File → Download all data** → save the `.csbackup`
   file.
2. Generate a new pattern in the Creator and save it. (Without leaving the
   page,) navigate back to Home — the new project should appear immediately.
3. Click **File → Restore from backup** → choose the backup → confirm.
4. **Expected:** Home dashboard refreshes *without a page reload* and the
   restored project list replaces the current view.
5. Open Manager **Pattern Library** in a new tab.
6. **Expected:** Same restored projects already visible (Manager already had
   the listener; this PR ensures Home does too).

### TC-1.1-D — Cross-tab sync via `cs:projectsChanged`

1. Open Home in tab A and Manager in tab B.
2. In tab A, open a project in the Creator and rename it via the ContextBar.
3. Save the project (autosave or explicit Save).
4. Switch to tab B (Manager). When it gains visibility, the project list
   should re-fetch (visibilitychange listener) and show the renamed project.

### TC-1.1-E — Click behaviour for managerOnly entries

1. In Manager Pattern Library, click the manual pattern's card in the *Your
   Projects* panel.
2. **Expected:** The right-side Pattern Detail panel opens for that manual
   pattern (not a redirect to Tracker), because there's no linked project
   to track.

### TC-1.1-F — Click behaviour for linked entries in Manager

1. Click "Continue" on a linked project in the Manager *Your Projects* panel.
2. **Expected:** Browser navigates to `stitch.html?source=manager` with that
   project active (Tracker loads it).

### TC-1.1-G — Empty state

1. Delete all projects from Home (use the row menu → Delete on each).
2. **Expected:** Home returns to its 0/1-project hero layout (no dashboard).
3. In Manager, the *Your Projects* panel still renders but lists only the
   manual-only entry (or shows the empty placeholder if none exist).

---

## T2.8 — Unified ESC handling

### TC-2.8-A — Single modal closes on ESC

1. Open Home → click the gear icon → **Preferences** modal.
2. Press **ESC**.
3. **Expected:** Modal closes.

### TC-2.8-B — Nested modals: only topmost responds

1. Open Home → File menu → **Restore from backup**.
2. Select a backup. The Sync Summary modal appears.
3. Without dismissing it, somehow open another modal (e.g. via the gear icon
   if accessible) — or alternatively, open Help on top of About by clicking
   one then the other in the header overflow menu.
4. Press **ESC**.
5. **Expected:** Only the most-recently-opened modal closes; the underlying
   one remains open. Press **ESC** again to close the outer.

> Note: nested-modal scenarios in the current UI are limited because most
> menus auto-close. The hook supports stacking for any future nested cases.

### TC-2.8-C — ESC does not close modal while typing in a text input

1. Open the **Name Your Project** modal (e.g. via Creator → File → Download
   when the project has no name). Focus is automatically in the name input.
2. Type some text and press **ESC**.
3. **Expected for `NamePromptModal`:** The modal closes. (This modal opts
   into `skipWhenEditingTextField: false` because its only focusable element
   is the input — without this, ESC would feel broken.)
4. Open the **Preferences** modal. Click into a text field inside (e.g. a
   future search box) and press **ESC**.
5. **Expected:** The modal *does not close* (default behaviour) so you can
   press ESC to clear focus or revert inline edits without dismissing the
   surrounding modal.

### TC-2.8-D — ContextBar inline name editor (regression check)

1. In Creator, click the project name in the header to enter inline edit
   mode. Type something but don't press Enter.
2. Press **ESC**.
3. **Expected:** Name reverts to the previous value, the input loses focus,
   and *no other modal closes* (the input handles ESC inline because it's
   focused — `keyboard-utils.js` skips when a text input is focused).

### TC-2.8-E — Sync Summary modal blocks ESC during apply

1. Open File → Restore from backup → choose a backup → click **Apply**.
2. While the import is in progress, press **ESC**.
3. **Expected:** The modal does *not* close (apply state guards ESC).

---

## Regression checks (smoke)

- Tracker: open a project, click "Open project" picker, press ESC → picker
  closes.
- Manager: open the Add Pattern modal, press ESC → closes.
- Creator: open the ConvertPalette / SubstituteFromStash / BulkAdd modals;
  these still rely on overlay click-outside (no ESC change). Verify they
  open + close via their own buttons.
- Backup restore on Tracker (`stitch.html`): press the gear → trigger restore
  → verify the active project still loads correctly afterwards.

---

## Next logical implementation steps

The Round 3 audit identified Tracks 1+2+3. T1.1 and T2.8 from Track 1+2 are
now complete; Round 3 candidates remain:

### Highest leverage (recommended next)

1. **T2.10 — Centralise Help content.** Help is currently a single modal in
   `modals.js`. Convert it into a tabbed / searchable Help Centre with
   per-page topics (Creator, Tracker, Manager, Backup/Sync, Keyboard
   shortcuts). Add a `?` button consistently on every page header.

2. **Onboarding parity (Section D of audit).** Tracker has a multi-step
   onboarding wizard; Creator + Manager have none. Create
   `OnboardingWizard.js` shared component driven by `localStorage`-backed
   "seen" flags. Reuse `useEscape` for keyboard navigation.

3. **Replace Manager pattern grid with `<ProjectLibrary mode="manager">`.**
   Today the Pattern Library tab shows the new ProjectLibrary panel above
   the legacy pattern grid (additive). The Phase 3 plan called for full
   replacement with the manager-specific affordances (shopping list
   checkboxes, brand filters, status pills) moved into a row context menu
   on the unified card. This needs careful UX work and a follow-up pass.

### Smaller wins

4. **Adopt `useEscape` in stats-page.js / stats-showcase.js modals.** They
   currently use direct `document.addEventListener`. Low-risk refactor that
   ensures *all* modals participate in the stack ordering.

5. **Adopt `useEscape` in Creator modals** (`ConvertPaletteModal`,
   `SubstituteFromStashModal`, `BulkAddModal`). Today they only close via
   overlay click — adding ESC support is a small UX improvement.

6. **Terminology sweep (Section E of audit).** Inconsistent labels:
   "Save" vs "Download", "Project" vs "Pattern", "Stash" vs "Inventory".
   Codify in a single glossary and refactor labels across all three pages.

### Architecture investments

7. **Migrate to a real router and module system.** The current pattern of
   plain `<script>` tags with `window.*` exports works but is fragile.
   Long term, consider Vite/esbuild + ES modules + a tiny client router
   (or Astro) so the three HTML entry points become routes of a single
   compiled app. Would unlock proper tree-shaking, TypeScript, and remove
   the per-file Babel cache complexity.

8. **Define a typed Project schema.** Today `Project` is implicit JSON. A
   shared `types.d.ts` would help: catch typos in `proj.completedStitches`,
   document the shape, and enable IDE refactors. Could be done without
   moving to TypeScript by using JSDoc `@typedef` blocks.

---

## Memory updates

After this PR is merged, `CREATOR_CACHE_KEY` should be incremented again
when the next Creator-touching change ships. The pattern is in
`build-creator-bundle.js:6` and `index.html:112`.
