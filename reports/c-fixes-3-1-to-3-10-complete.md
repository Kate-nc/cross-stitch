# Quarter C — Pinch-point fixes 3.1–3.10 + C11 · Completion report

> Branch: `ui-improvements`. Closes the ten new pinch points raised in the
> Phase 8 post-B re-audit ([reports/ux-8-post-B-audit.md](ux-8-post-B-audit.md))
> plus the **C11** "British/American alias map for help-drawer search"
> ticket. All work is staged but **not yet committed** — this report
> accompanies the commit set described in §5.

---

## 1 · Summary

Ten audit pinch points (3.1–3.10) and Quarter C ticket C11 were implemented
across the Creator, Tracker, Manager and shared shell. The change touches
fourteen runtime files and adds six new test suites covering the new
behaviour. Test total moved **902 → 943** (+41 tests) across **81 → 85**
suites, with the full Jest run green and `npm run lint:terminology`
passing. No emojis were introduced; new icons (`Icons.help`, plus the
delete-modal trash glyph reused) live in [icons.js](../icons.js).

---

## 2 · Per-fix entries

### Fix 3.1 — Help drawer has no visible affordance (also closes C1 ticket scope)

- **Files changed:** [header.js](../header.js), [icons.js](../icons.js#L339), [help-drawer.js](../help-drawer.js), [styles.css](../styles.css), [index.html](../index.html)
- **Tests added:** [tests/headerHelp.test.js](../tests/headerHelp.test.js)
- A visible `Icons.help` button is now rendered in [header.js](../header.js) on every mode (Creator, Tracker, Manager). It sits to the right of the page selector on desktop and as the right-most header button below 480 px. Clicking it calls `window.HelpDrawer.open()`; the existing `?` keyboard shortcut still works. The button carries an `aria-label="Open help"` and an `aria-keyshortcuts="?"` hint so screen-reader users finally have a path to discover the drawer.

### Fix 3.2 — Materials Hub sub-tabs read like top-level pages

- **Files changed:** [creator/MaterialsHub.js](../creator/MaterialsHub.js), [styles.css](../styles.css), [creator/bundle.js](../creator/bundle.js)
- **Tests added:** [tests/materialsHub.test.js](../tests/materialsHub.test.js) (extended)
- The `.mh-subtabs` strip is now visually demoted: indented 16 px, given a softer secondary background, and prefixed with a "View:" label so it reads as a filter rather than a navigation row. Sub-tab buttons keep their existing `role="tab"` semantics. The change closes the visual ambiguity flagged at audit §3.2 without forcing a vertical sub-rail layout.

### Fix 3.3 — B2 drag-mark silently disabled

- **Files changed:** [tracker-app.js](../tracker-app.js), [preferences-modal.js](../preferences-modal.js), [user-prefs.js](../user-prefs.js)
- **Tests added:** [tests/preferencesDragMark.test.js](../tests/preferencesDragMark.test.js)
- A new **Tracker → Drag to mark stitches (experimental)** toggle was added to the Preferences modal, backed by a `dragMarkEnabled` key in [user-prefs.js](../user-prefs.js). [tracker-app.js](../tracker-app.js) reads the pref in its lazy initialiser and reflects it onto `window.B2_DRAG_MARK_ENABLED` so the existing `useDragMark` hook picks it up; the legacy default-off behaviour is preserved for users who never visit Preferences. Audit §3.3 explicitly accepted this opt-in path while the C3 default-on coordination plan (saved as [reports/c3-plan-b2-default-on.md](c3-plan-b2-default-on.md)) is scheduled.

### Fix 3.4 — "Shopping" lives in two places with two scopes

- **Files changed:** [creator/MaterialsHub.js](../creator/MaterialsHub.js), [manager-shopping.js](../manager-shopping.js), [creator/bundle.js](../creator/bundle.js)
- **Tests added:** [tests/managerShopping.test.js](../tests/managerShopping.test.js) (extended caption assertion)
- The Creator sub-tab now renders **"Shopping for this pattern"** as its caption, and the Manager Shopping tab gained a one-line subtitle reading **"Shopping across all active projects"**. The captions live next to the existing headers so the scope distinction is unmistakable on first glance.

### Fix 3.5 — Bulk delete uses `window.confirm()`

- **Files changed:** [home-screen.js](../home-screen.js), [styles.css](../styles.css)
- **Tests added:** [tests/homeBulkDelete.test.js](../tests/homeBulkDelete.test.js)
- The destructive confirmation is now a styled modal that lists the project names about to be deleted (truncated to five with "and N more"), echoes the count, and exposes the standard Cancel / Delete pair with `Icons.trash`. The native `window.confirm()` call has been removed entirely. The modal honours the existing `.modal` / `.modal-card` styles and traps focus.

### Fix 3.6 — Sidebar mode-swap fade can disorient

- **Files changed:** [styles.css](../styles.css)
- **Tests added:** [tests/sidebarFadeCue.test.js](../tests/sidebarFadeCue.test.js)
- Added a 12 px right-translate on the page content during the existing 160 ms sidebar fade-out, scoped to a new `.creator-page-expanding` body class. Users now perceive the layout *expanding* rather than the sidebar *vanishing*. The animation respects `prefers-reduced-motion` (the keyframe is suppressed by the existing `@media (prefers-reduced-motion: reduce)` block) — no motion-policy regression.

### Fix 3.7 — "Continue stitching" hero is hidden in selection mode

- **Files changed:** [home-screen.js](../home-screen.js), [styles.css](../styles.css)
- **Tests added:** [tests/multiSelectDashboard.test.js](../tests/multiSelectDashboard.test.js) (extended)
- A persistent **"Cancel selection"** button now occupies the slot vacated by the Continue bar when multi-select is active, restoring the path back to the default dashboard and signalling the mode shift. The button uses `Icons.x` and matches the bulk-bar styling.

### Fix 3.8 — MaterialsHub remembers sub-tab globally, not per-project

- **Files changed:** [creator/useCreatorState.js](../creator/useCreatorState.js), [creator/bundle.js](../creator/bundle.js)
- **Tests added:** [tests/useCreatorStateMaterialsTabReset.test.js](../tests/useCreatorStateMaterialsTabReset.test.js)
- The `creator.materialsTab` state is now reset to its default ("Threads") whenever the active project ID changes. Implemented as a project-ID watcher inside [creator/useCreatorState.js](../creator/useCreatorState.js); avoids the need for a per-project storage namespace while still removing the cross-project leak the audit flagged.

### Fix 3.9 — Manager Shopping has no per-row link to source projects

- **Files changed:** [manager-shopping.js](../manager-shopping.js)
- **Tests added:** [tests/managerShopping.test.js](../tests/managerShopping.test.js) (extended)
- Aggregate rows now retain their source project IDs and render a disclosure reading "Used in N projects" that expands to a list of project names. Each name is a button that navigates to the project (via the existing `ProjectStorage.setActive` path). When only one project contributes, the row inlines the single name in place of the disclosure to avoid noise.

### Fix 3.10 — Mobile form hygiene drift on new B4 inputs

- **Files changed:** [creator/MaterialsHub.js](../creator/MaterialsHub.js), [manager-shopping.js](../manager-shopping.js), [creator/bundle.js](../creator/bundle.js)
- **Tests added:** [tests/managerShopping.test.js](../tests/managerShopping.test.js) (extended), [tests/materialsHub.test.js](../tests/materialsHub.test.js) (extended)
- Swept the new B4 inputs (Manager Shopping filter / quantity controls and the MaterialsHub Shopping sub-tab add controls) and applied the standard mobile-form attributes per `.github/copilot-instructions.md`: `inputMode="numeric"` and `min`/`step` on quantity fields, `enterKeyHint="search"` on the filter, and `autocomplete="off"` on transient inputs. The extended test files act as source-content guards analogous to the existing mobile-form tests.

### Ticket C11 — British/American alias map for help-drawer search

- **Files changed:** [help-drawer.js](../help-drawer.js)
- **Tests added:** [tests/helpDrawerAlias.test.js](../tests/helpDrawerAlias.test.js)
- [help-drawer.js](../help-drawer.js) now keeps a small alias map (e.g. `color → colour`, `organize → organise`, `center → centre`, `gray → grey`) that is consulted when a search term yields no direct matches. The drawer remains British-English in copy; the alias only widens the search index. The existing `tests/helpDrawer.test.js` was updated alongside the new alias test to cover the broadened lookup behaviour.

---

## 3 · Test summary

| Metric | Before | After | Delta |
|---|---|---|---|
| Test suites | 81 | 85 | +4 |
| Tests | 902 | 943 | +41 |
| Failures | 0 | 0 | — |

Six new test files (`tests/headerHelp.test.js`, `tests/helpDrawerAlias.test.js`, `tests/homeBulkDelete.test.js`, `tests/preferencesDragMark.test.js`, `tests/sidebarFadeCue.test.js`, `tests/useCreatorStateMaterialsTabReset.test.js`) plus extensions to `tests/helpDrawer.test.js`, `tests/managerShopping.test.js`, `tests/materialsHub.test.js`, and `tests/multiSelectDashboard.test.js`. The `tests/__snapshots__/icons.test.js.snap` snapshot was updated to register the new `Icons.help` glyph.

---

## 4 · Build steps performed

1. `node build-creator-bundle.js` — regenerated [creator/bundle.js](../creator/bundle.js) after edits to [creator/MaterialsHub.js](../creator/MaterialsHub.js) and [creator/useCreatorState.js](../creator/useCreatorState.js).
2. `npm test -- --runInBand` — full Jest suite, 85 suites / 943 tests, all green.
3. `npm run lint:terminology` — passes; no British/American drift introduced.

---

## 5 · Commit plan

Grouped by surface so the diff stays reviewable:

1. **`feat(ui): visible help affordance + B/A alias map [fix-3.1][C11]`** — [header.js](../header.js), [icons.js](../icons.js), [help-drawer.js](../help-drawer.js), [styles.css](../styles.css), [index.html](../index.html), `tests/headerHelp.test.js`, `tests/helpDrawerAlias.test.js`, `tests/helpDrawer.test.js`, `tests/__snapshots__/icons.test.js.snap`.
2. **`feat(creator): MaterialsHub sub-tab differentiation, per-project memory, mobile form hygiene [fix-3.2][fix-3.8][fix-3.10]`** — [creator/MaterialsHub.js](../creator/MaterialsHub.js), [creator/useCreatorState.js](../creator/useCreatorState.js), [creator/bundle.js](../creator/bundle.js), [styles.css](../styles.css), `tests/materialsHub.test.js`, `tests/useCreatorStateMaterialsTabReset.test.js`.
3. **`feat(tracker): drag-mark Preferences toggle [fix-3.3]`** — [tracker-app.js](../tracker-app.js), [preferences-modal.js](../preferences-modal.js), [user-prefs.js](../user-prefs.js), `tests/preferencesDragMark.test.js`.
4. **`feat(ui): Shopping scope captions + per-row source projects [fix-3.4][fix-3.9]`** — [manager-shopping.js](../manager-shopping.js), [manager-app.js](../manager-app.js), `tests/managerShopping.test.js`. (Note: the Creator-side caption ships in commit #2 because it lives in `MaterialsHub.js`; the commit message should cross-reference fix-3.4.)
5. **`feat(home): styled bulk-delete + persistent cancel selection [fix-3.5][fix-3.7]`** — [home-screen.js](../home-screen.js), [styles.css](../styles.css), `tests/homeBulkDelete.test.js`, `tests/multiSelectDashboard.test.js`.
6. **`feat(creator): sidebar mode-swap translate cue [fix-3.6]`** — [styles.css](../styles.css), `tests/sidebarFadeCue.test.js`.
7. **`docs: completion report for ux-8 fixes 3.1–3.10 + C11`** — this file, plus [reports/c3-plan-b2-default-on.md](c3-plan-b2-default-on.md) and [reports/c8-plan-first-stitch-coaching.md](c8-plan-first-stitch-coaching.md).

`creator/bundle.js` is regenerated and ships in commit #2 so the build artefact lands with its source.

---

## 6 · Follow-up — remaining Quarter C work

Pinch points 3.1–3.10 and C11 are now closed. Remaining Quarter C tickets from [reports/ux-8-post-B-audit.md §9](ux-8-post-B-audit.md):

- **C3** — B2 drag-mark default-on coordination (rip out legacy touch handler, flip the flag). Plan saved alongside as [reports/c3-plan-b2-default-on.md](c3-plan-b2-default-on.md).
- **C4** — MaterialsHub sub-tabs as `role="tablist"` (a11y follow-up; visual differentiation is done in fix-3.2).
- **C6** — Honest "coming in B4" toast + actual ZIP bundle export.
- **C7** — Image-import wizard rework. Research notes saved at [memories/session/c7-image-import-research.md] (session memory).
- **C8** — First-stitch interactive coaching tour. Plan saved as [reports/c8-plan-first-stitch-coaching.md](c8-plan-first-stitch-coaching.md).

C5 (Shopping scope captions + source-project links) is closed by fixes 3.4 and 3.9. C9 (mobile-form sweep + guard test) is closed by fix-3.10. C10 (a11y bulk-bar `aria-live` + sub-tabs `role="tablist"`) remains scheduled with C4.

---

## 7 · References

- Source audit: [reports/ux-8-post-B-audit.md](ux-8-post-B-audit.md)
- C3 plan: [reports/c3-plan-b2-default-on.md](c3-plan-b2-default-on.md)
- C8 plan: [reports/c8-plan-first-stitch-coaching.md](c8-plan-first-stitch-coaching.md)
- House rules: [.github/copilot-instructions.md](../.github/copilot-instructions.md), [AGENTS.md](../AGENTS.md)
- Preferences architecture: [user-prefs.js](../user-prefs.js), [preferences-modal.js](../preferences-modal.js), [apply-prefs.js](../apply-prefs.js)
- Creator bundle build: [build-creator-bundle.js](../build-creator-bundle.js)

*End of completion report.*
