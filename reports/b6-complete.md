# B6 — Help & Shortcuts Merged Drawer (completion report)

Closes **F3 🔴** (dual-onboarding offender).

## Summary

The Pattern Creator, Stitch Tracker, and Stash Manager previously each
shipped three discoverability surfaces:

1. A `SharedModals.Help` modal backed by `help-content.js` (tabbed Help
   Centre — six topics, embedded shortcut list, "Show welcome tour again"
   footer).
2. An auto-generated `SharedModals.Shortcuts` modal backed by `shortcuts.js`'s
   runtime registry (mostly invisible — only ever rendered through the same
   Help modal).
3. A first-run coach-mark / step-by-step "tour" implemented by
   `onboarding.js`, with its own welcome modal, persona picker, stitching-
   style picker, sample-pattern loader, and per-page hint banners — the
   F3 🔴 dual-onboarding offender that overlapped with `onboarding-wizard.js`'s
   per-page WelcomeWizard.

These have been collapsed into a single side drawer at
[help-drawer.js](../help-drawer.js) exposing `window.HelpDrawer`.
`help-content.js` and `onboarding.js` are deleted.
`onboarding-wizard.js` (the modern WelcomeWizard) is preserved.

## API contract

```js
window.HelpDrawer.open({
  tab:     'help' | 'shortcuts' | 'getting-started',  // optional
  context: 'creator' | 'tracker' | 'manager' | null,  // optional
  query:   string | null                              // optional
});
window.HelpDrawer.close();
window.HelpDrawer.toggle(opts);
window.HelpDrawer.isOpen();      // → boolean

// Test hooks (not part of the public surface):
window.HelpDrawer._filter(items, query);
window.HelpDrawer._helpItems;
window.HelpDrawer._shortcutItems;
window.HelpDrawer._gettingStarted;
```

Behaviours:

- Slide-in side drawer (380 px desktop / 100 vw on ≤480 px). Not modal —
  the page behind keeps scrolling and remains interactive
  (`role="dialog" aria-modal="false"`).
- `Escape` closes; `?` toggles (the drawer owns this globally — replaces
  the manager-only handler that previously lived in
  [command-palette.js](../command-palette.js)).
- Search input filters Help and Shortcuts in real time
  (case-insensitive substring on heading + body + bullets / scope + keys + description).
- Contextual default: `open({ context: 'tracker' })` selects the Shortcuts
  tab and re-orders shortcut groups so Tracker comes first. Same for
  `creator` and `manager`.
- Persists last-open tab in `localStorage["cs_help_drawer_tab"]` (cleared
  if invalid).
- Focus-trap on `Tab` / `Shift+Tab`; auto-focus the search input on open.
- Listens for the existing `cs:openHelp`, `cs:openHelpDesign`, and
  `cs:openShortcuts` events so call sites that still dispatch via those
  bridges (command-palette, page-level event listeners) keep working
  with no further changes.

## Files

### Added

- [help-drawer.js](../help-drawer.js) — drawer + content + event bridges.
- [tests/helpDrawer.test.js](../tests/helpDrawer.test.js) — API surface,
  filter, contextual default, content migration coverage, source-level
  guarantees (no raw glyphs, retired files removed, HTML script tags
  updated), back-compat shim.

### Modified

- [index.html](../index.html), [stitch.html](../stitch.html),
  [manager.html](../manager.html) — replaced
  `<script src="help-content.js">` and `<script src="onboarding.js">`
  with a single `<script src="help-drawer.js">`. `onboarding-wizard.js`
  retained.
- [modals.js](../modals.js) — `SharedModals.Help` is now a 12-line shim
  that opens the drawer on mount and closes the parent modal state. This
  lets every page that already renders `<SharedModals.Help defaultTab="…" />`
  (creator-main.js, manager-app.js, tracker-app.js) route into the new
  drawer with zero call-site edits in those large files.
- [header.js](../header.js) — the two header buttons ("Shortcuts" /
  "Help") now call `window.HelpDrawer.open(...)` directly with a
  `setModal` fallback for safety.
- [command-palette.js](../command-palette.js) — removed the
  `act_reset_tour` action (onboarding gone); the existing `cs:openHelp`
  and `cs:openShortcuts` dispatchers continue to work via the drawer's
  event bridges.
- [styles.css](../styles.css) — appended a `B6 — Help & Shortcuts drawer`
  block: slide-in keyframes, focus-visible outlines, mobile full-width
  override.
- [scripts/lint-terminology.js](../scripts/lint-terminology.js) —
  `help-content.js` → `help-drawer.js` in the lint target list.

### Deleted

- `help-content.js` (content fully migrated; `window.HELP_TOPICS` and
  `window.HelpCentre` are still re-exported by `help-drawer.js` as
  back-compat shims).
- `onboarding.js` (content migrated to "Getting Started" tab where the
  surface still exists; see "Dropped onboarding surfaces" below).
- `tests/helpContent.test.js` (target file gone; replaced by
  `tests/helpDrawer.test.js`'s migration-coverage assertions).
- `tests/onboardingStyles.test.js` (target file gone; the persona /
  style picker no longer exists — see "Dropped onboarding surfaces").

### Preserved (NOT deleted, contrary to the brief's prefer-DELETE
guidance for `shortcuts.js`)

- `shortcuts.js` — exposes the runtime keyboard-shortcut registry
  (`window.Shortcuts.register`, `window.useShortcuts`, `window.useScope`,
  `window.Shortcuts.list`, `window.Shortcuts.formatKey`, etc.). Used
  pervasively across `tracker-app.js`, `creator/useKeyboardShortcuts.js`,
  `command-palette.js`, and `tests/shortcutsModal.test.js`. The brief
  conflated this file with the help-modal shortcut renderer (which was
  actually inside `help-content.js`). Deleting it would have broken the
  app immediately.

## Content migration

### Help topics

All five legacy `HELP_TOPICS` areas migrated verbatim where wording was
already correct, with minor copy-edits to comply with house terminology
conventions ("Colours Drawer" not "Color drawer", "Sessions and timer",
"Saving and Backup"):

- Pattern Creator
- Stitch Tracker
- Stash Manager
- Saving and Backup
- Glossary

The standalone "Keyboard" topic that lived inside `HELP_TOPICS` was
collapsed into the dedicated Shortcuts tab.

### Shortcuts

All shortcut definitions from `help-content.js`'s "Keyboard" topic are
present as `SHORTCUTS` rows in `help-drawer.js`. Test
`every legacy shortcut description is present in the new dataset`
asserts 11 canonical descriptions; the full set covers Global, Creator,
Tracker (including the Highlight-view subset), and Manager scopes.
Runtime entries from `window.Shortcuts.list()` are intentionally NOT
merged in — the drawer is the canonical, always-visible reference;
the runtime dispatcher remains the source of truth for what actually
fires.

### Onboarding → Getting Started

`onboarding.js` was a heavy state machine (welcome modal → persona pick
→ stitching-style pick → per-style sample loader → tracker hint banner
→ manager hint banner → `complete`), driven by a `cs_onboarding_step`
key. Per the brief ("evergreen list of hints under headings") the
drawer's Getting Started tab carries the *intent* — make a pattern,
track stitches, manage your stash — but not the multi-step machinery.

Five evergreen entries:

1. **Make your first pattern** — deep-link button "Try a sample pattern"
   that calls `window.buildSampleProject()` (still exposed by
   [home-screen.js](../home-screen.js)) and navigates to `stitch.html`.
2. **Track your stitches** — deep-link "Replay the Tracker walkthrough"
   that resets and re-mounts `WelcomeWizard` for the Tracker via the
   existing `cs:showWelcome` event.
3. **Manage your stash** — same pattern, page=`manager`.
4. **Take the Creator walkthrough** — same pattern, page=`creator`.
5. **Learn the shortcuts** — text-only, points users at `?` and the
   Shortcuts tab.

#### Dropped onboarding surfaces (no longer reachable)

- **Persona picker** (Beginner / Intermediate / Advanced) — UI lived
  inside the legacy welcome modal. Not surfaced anywhere else; the app
  now infers experience from preferences / behaviour. Dropped.
- **Stitching-style picker** (Cross-country / Block / Parking /
  Freestyle, with their canned sample projects). The four canned style
  samples were also removed from `ProjectStorage` on `reset()`. No
  current call site requests these. Dropped — `home-screen.js` still
  loads its own one-off sample via `buildSampleProject()`.
- **Per-step hint banners** in the Tracker and Manager (the
  `TrackerHints` / `ManagerHints` components). These coach-marks
  pointed at specific buttons (parking marker, drawer toggle, etc.).
  The buttons still exist; the coach-marks are replaced by the always-
  available Help tab text. Dropped.
- **`Reset Onboarding Tour`** command-palette action. Dropped — the
  per-page WelcomeWizard replays in Getting Started supersede it.

#### Deep-link buttons explicitly omitted

- A direct "Open Pattern Creator" deep-link in Getting Started (the
  app's home button + the "Make your first pattern" sample loader
  already cover the case; a third entry would be redundant).
- A "Reset all preferences" link (lives in `SharedModals.Shortcuts`'s
  footer; out of scope for B6).

## Test count

- **Before B6 (most recent green):** 612 (mobile / responsive landing).
- **After B1 + B2 + B6 (this commit):** 825 (B1 and B2 added a large
  number of mobile / partial-stitch / drag-mark tests in parallel; B6
  added 22 in `tests/helpDrawer.test.js` and removed 2 obsolete suites
  by deleting `tests/helpContent.test.js` and
  `tests/onboardingStyles.test.js`).
- **All-green confirmed:** `Test Suites: 75 passed, 75 total · Tests:
  825 passed`.

## House-rule compliance

- No emoji or forbidden glyphs in any new user-facing string. The
  drawer's close button uses `Icons.x()`; the tab icons use `Icons.info`,
  `Icons.keyboard`, `Icons.lightbulb` (all already in
  [icons.js](../icons.js); no snapshot bump needed).
- British English throughout ("colour", "organise", "centre", "Colours
  Drawer"); `npm run lint:terminology` passes (15 files, 0 forbidden
  terms).
- No new modals — the drawer is the new pattern.
- `creator/*` untouched; no bundle rebuild required.

## F3 🔴 status

**CLOSED.** `onboarding.js` is deleted; the only first-run flow now is
`onboarding-wizard.js`'s per-page `WelcomeWizard`, replayable from the
drawer's Getting Started tab. There is exactly one onboarding surface.

## Cross-track concerns

- B1 was queued to add `components/PartialStitchThumb.js` plus script
  tags between `components.js` and `home-screen.js` in all three HTML
  files. B6's HTML edits sit further down (between `modals.js` and the
  next non-help script) and do not touch the B1 line range — git
  three-way merge handles them cleanly.
- B2 was queued to add `useDragMark.js` plus a script tag before
  `tracker-app.js`. Same story — non-overlapping line ranges in the
  HTML files; B6 does not touch `tracker-app.js`,
  `components/PartialStitchThumb.js`, `useDragMark.js`, or anything
  under `components/`.
- `tracker-app.js`'s existing `cs:openHelp` / `cs:openShortcuts`
  listeners still flip its `modal` state to `'help'` / `'shortcuts'`,
  which renders `<SharedModals.Help …>`, which now routes to the
  drawer via the shim. That round-trip is harmless and keeps B2's
  edits to `tracker-app.js` cleanly merge-able.

## Does not unblock further work

**Does not unblock further work — B5 already unblocked by B1.**
