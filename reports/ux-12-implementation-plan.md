# UX-12 — Implementation Plan (Hybrid 4 · Workshop · Feature-Preserving)

> **Decision recorded** (25 Apr 2026, revised):
> - Visual direction: **Workshop** ([ux-11](ux-11-visual-direction.md), [showcase/](showcase/))
> - Plan: **Hybrid 4 — threaded ship train** (A → B → C)
> - Constraint: **No *feature* is removed or hidden.** Every tool,
>   control, modal, setting, shortcut, and preference remains reachable.
>   *Surfaces* (landing pages, navigation chrome) may be replaced when
>   the replacement is a strict superset.
> - **No feature flags / beta toggle.** Single user, ship straight to
>   Workshop. No `data-theme="legacy"` fallback.
> - **`/home` replaces** the per-page landings (Creator splash,
>   Tracker home, Manager home). Direct URLs to `index.html`,
>   `stitch.html`, `manager.html` still work and drop users straight
>   into the relevant tool.
>
> App name confirmed as **`stitch.`** for the duration of this plan
> (revisitable in a single token).

---

## How "no feature loss" reshapes Hybrid 4

Hybrid 4 was originally six destinations:

> tokens → modal primitive → Tracker mobile → action bar → project
> switcher → mode pill → Creator collapse

Two of those — **mode pill replacing page tabs** and **Creator
collapse** — *remove* top-level surfaces (Plan C's whole premise was
"reduce nav by collapsing"). Under the no-loss constraint they become:

| Original Plan C move | Becomes |
|---|---|
| Mode pill *replaces* Pattern / Project / Materials tabs | Mode pill *added alongside* tabs as a faster cross-page jump; tabs stay where they are |
| Creator collapsed to "Chart + Source &amp; settings" | Creator tabs unchanged; new outcome action-bar (Plan A) carries the promotion work |
| Single Home Dashboard *replaces* Creator/Tracker/Manager landings | **Kept as-is — `/home` is the new default landing.** Direct URLs to the per-tool pages still work. |
| Materials becomes a right-rail disclosure | Materials tab unchanged; right-rail panes added as a *parallel* surface |

Everything else from Hybrid 4 lands in full.

---

## Ship train — eight phases, ~one PR per phase

Each phase is independently reviewable, independently revertable, and
ends with green CI (`npm test -- --runInBand`) plus a manual smoke pass.
No phase removes a feature. No feature flags — Workshop ships directly,
phase by phase.

### Phase 0 · Pre-flight (no user-visible change)

**Goal.** Set the workspace up so the rest of the train is mechanical.

**Work.**
- Add the full Workshop token set to `styles.css` (single source of
  truth — `reports/showcase/_workshop.css` mirrors it). Light tokens
  on `:root`, dark tokens on `[data-theme="dark"]`.
- Where a Workshop token name collides with an existing legacy var
  (`--accent`, `--surface`, `--text-primary`, `--text-secondary`,
  `--radius-sm`, `--shadow-sm`), introduce the Workshop value
  under a `--ws-*` alias for now. Phase 1 migrates rules from the
  legacy var to the `--ws-*` alias; the final cleanup PR renames
  `--ws-*` → canonical Workshop names.
- All non-conflicting tokens (`--accent-2`, `--accent-soft`,
  `--success`, `--warning`, `--danger`, `--line`, `--line-2`,
  `--surface-raised`, `--surface-sunken`, `--surface-ink`,
  `--text-on-accent`, `--text-muted`, `--tint-thread`,
  `--tint-fabric`, `--radius-pill`, `--motion`, `--motion-fast`,
  `--motion-slow`, full type/spacing scales) land under their
  canonical names directly.

**Files touched.** `styles.css` (head only).

**Tests.** Existing snapshots unchanged (no rules consume the new
tokens yet). `npm test -- --runInBand` green.

**Deferred to Phase 1.** Stylelint rule warning on raw hex/px in
new code (not yet installed; pulled forward when Phase 1 starts
consuming tokens at scale).

**No functionality change.** None. Pure infrastructure.

---

### Phase 1 · Workshop palette across the chrome

**Goal.** The app *looks* Workshop. No structural change anywhere.

**Work.**
- Replace every page-chrome rule that uses raw colour with a token.
  Order: header → sidebars → modals frame → cards → buttons →
  inputs → toasts → tooltips.
- Update PWA `manifest.json`'s `theme_color` and `background_color`
  to the Workshop linen + ink values.
- Update favicons / app icon to the terracotta-X mark from showcase
  page 5 (`05-onboarding-and-artefacts.html`). Keep the existing
  paths so caches still resolve.

**Files touched.** `styles.css` (~80% of the page), `manifest.json`,
`assets/fonts/`, new icon PNGs in `assets/icons/`.

**Tests.** Existing visual-regression snapshots updated. Smoke test
each page (Creator / Tracker / Manager).

**No functionality change.** Every button, tab, modal, control still
works. Only colours / type / radii change.

---

### Phase 2 · Dark mode

**Goal.** Workshop dark renders as designed, end-to-end.

**Work.**
- Implement `data-theme="dark"` (and `prefers-color-scheme: dark`
  default) using the dark token values in `_workshop.css`.
- Confirm the existing `prefs.theme.mode = system | light | dark`
  preference works with the new tokens.
- Audit colour-only signals (toast success/error, "owned" pills,
  status dots) and verify each is *also* paired with an icon
  (addresses A-H4 + V-H4 pre-emptively).

**Files touched.** `styles.css`, `apply-prefs.js`, `toast.js`,
`components.js` (status pills).

**Tests.** New jest test that asserts every pill / toast / badge
renders an SVG icon next to its colour.

**No functionality change.** Pure addition.

---

### Phase 3 · Modal / Sheet / Drawer primitive

**Goal.** One component family for the 12 dialogs across the app
(addresses A-H3, V-H3, V-M2, M-H4).

**Work.**
- Build `components/Overlay.js` exposing `<Overlay variant=
  "dialog|sheet|drawer">` with focus trap, ESC handler, ARIA
  `role=dialog` + `aria-modal=true`, and `env(safe-area-inset-bottom)`
  padding for sheets.
- Migrate dialogs one-at-a-time. Each migration is its own commit so
  bisect remains useful. The list, in order of risk:
  1. `palette-swap.js`
  2. `backup-restore.js`
  3. `creator/BulkAddModal.js`
  4. `creator/ConvertPaletteModal.js`
  5. `creator/ShoppingListModal.js`
  6. `creator/SubstituteFromStashModal.js`
  7. `creator/ImportWizard.js`
  8. `preferences-modal.js`
  9. `onboarding-wizard.js`
  10. `modals.js` (the shared modals)
- Each migration is *visual + a11y only*: every option, button, and
  side effect of the dialog must remain identical.

**Files touched.** Above list + new `components/Overlay.js` + tests.

**Tests.** Per-modal: open, close (ESC), close (scrim), close
(button) all still fire. Focus moves into modal on open and back on
close. Tab cycles within trap.

**No functionality change.** Each modal does what it did before; it
just inherits the primitive.

---

### Phase 4 · Tracker — mobile-first redesign

**Goal.** The phone Tracker matches showcase page 2. Tablet / desktop
get the same visual upgrade with their wider layouts retained.

**Work.**
- Apply Workshop component refactor to `tracker-app.js`:
  - Floating tool dock (44px buttons) on phone, persistent in the
    new sidebar on tablet/desktop.
  - Bottom mode-pill above safe area on phone (Stitch / Find / Edit).
  - Wake-lock indicator chip in the header.
  - Current-colour chip pinned at top with DMC ID + name + remaining.
  - Right-side palette + Today stats panel on tablet/desktop.
- **Crucial:** every existing tracker tool, keyboard shortcut,
  highlight mode, park feature, half-stitch mode, undo/redo,
  symbol-rendering setting, zoom level, find-next, page navigation,
  parking marker UI, session timer, and stat — all retained, just
  surfaced via the new chrome.
- The persistent-left-rail of recent projects on tablet adds an
  *additional* fast switcher; the existing project-picker modal
  remains accessible from the same menu.

**Files touched.** `tracker-app.js`, `stitch.html`, `styles.css`
sections for tracker, `useDragMark.js`.

**Tests.** Existing tracker test suite must pass unchanged. Add
playwright tests for the new floating dock + safe-area behaviour
on a 360px viewport.

**No functionality change.** Every existing tool stays, with
identical behaviour. The mobile-overhaul reorganises the surface,
not the feature set.

---

### Phase 5 · Outcome action bar in Creator

**Goal.** Print PDF and Track-this-pattern surface as one-click
actions (showcase page 3, addresses N-H3 click-depth, F-W2-H2).

**Work.**
- Add a persistent action bar above the Creator's page-tabs.
  Contents: `[Print PDF]` (primary) · `[Track this pattern]` ·
  `[Share / QR ▾]` (ghost) · `[Export… ▾]` (ghost).
- "Track this" wires to the existing `auto_save → tracker` path —
  no new storage, no new pipeline. It just bundles "save current
  pattern → set active project pointer → navigate to `stitch.html`".
- "Share / QR" and "Export…" surface the same options that already
  live under the Output / Materials sub-tabs. Those sub-tabs stay
  exactly where they are. The action bar is an *alias*, not a
  replacement.
- Right-side stats block (size, fabric, colour count, skein est)
  reads from the existing `useCreatorState` hook with no new state.

**Files touched.** `creator/PatternTab.js`, `creator/ProjectTab.js`,
`creator/Sidebar.js`, `creator/useCreatorState.js`,
`creator/useProjectIO.js` (only to expose the existing track-handoff
function more conveniently).

**Tests.** Snapshot of the new action bar. Integration test:
clicking "Track this" creates a tracker session pointing to the
current pattern.

**No functionality change.** Every existing export, share, and
output option remains where it was, plus a faster path is added.

---

### Phase 6 · Header consolidation (additive)

**Goal.** The header gets a project switcher and ⌘K command palette,
borrowed from Plan C but added *alongside* the existing nav, not
replacing it (showcase page 5 home, plan-c-header-switcher).

**Work.**
- New `<HeaderProjectSwitcher>` component in `header.js`. Always
  shows the active project + thumbnail. Clicking opens the same
  project list the project-picker modal already shows. The existing
  modal continues to work; the switcher is a faster surface.
- New `command-palette.js` already exists in the workspace — extend
  it to register: project switching, mode jumping (Creator ↔
  Tracker ↔ Manager), settings, help, common actions. Bound to ⌘K.
- Mode pill (Designing / Tracking / Managing) is added to the
  header as a quick cross-page jump. Page tabs remain in their
  current positions on each page. The pill is a shortcut, not a
  navigation replacement.

**Files touched.** `header.js`, `command-palette.js`,
`project-storage.js` (read-only, to populate the switcher),
`shortcuts.js` (register ⌘K).

**Tests.** Switcher renders the active project. ⌘K opens the
palette. Mode-pill click navigates to the corresponding page.

**No functionality change.** Existing nav and project picker
unchanged. Header gets two new affordances.

---

### Phase 7 · First-impression polish + `/home` landing

**Goal.** Splash, install prompt, welcome wizard, **the new `/home`
dashboard**, PDF export, marketing cards — all wear the Workshop
language (showcase page 5).

**Work.**
- Refresh `onboarding-wizard.js` to the three-step Workshop wizard
  visuals. Same questions, same outcomes, new look.
- **Build the cross-mode `/home` page** (`reports/wireframes/plan-c-home.html`,
  `reports/showcase/05-onboarding-and-artefacts.html` § 4) as the
  new default landing. Implementation detail:
  - New file `home.html` at the repo root, with a thin
    `home-app.js` that pulls active project, recent projects, stash
    summary, and quick-action tiles.
  - Update `sw.js` precache list and `CREATOR_CACHE_KEY` /
    relevant cache keys.
  - Update `vercel.json` rewrites (and any `serve.js` defaults) so
    `/` resolves to `home.html`.
  - Replace the *landing portion* of `index.html`, `stitch.html`,
    `manager.html` with a redirect to `/home` **only when no project
    is active**. When a project *is* active (the common case once
    you're in flow), the page loads its tool directly so deep links
    and PWA shortcuts still work.
  - Retire `home-screen.js`'s standalone landing block; the file
    keeps its exported helpers (recent-project list rendering, etc.)
    which `/home` reuses.
- Update `pdf-export-worker.js` and `creator/pdfChartLayout.js`
  output to use Workshop colours (terracotta major-grid, terracotta
  centre arrows, linen page background as an option). The
  Pattern-Keeper-compat path **must remain bit-identical** — gate
  the visual changes behind a "Workshop print theme" toggle in the
  PDF export dialog.
- Marketing card / press-kit PNGs exported from showcase page 5 §8
  for the README.
- Flip the stylelint rule from warn → error: any new raw hex or
  raw px in `styles.css` fails CI from now on.

**Files touched.** `onboarding-wizard.js`, new `home.html`, new
`home-app.js`, `home-screen.js` (trim), `index.html` /
`stitch.html` / `manager.html` (no-active-project redirect),
`sw.js`, `vercel.json`, `serve.js`, `pdf-export-worker.js`,
`creator/pdfChartLayout.js`, `creator/pdfExport.js`,
`manifest.json` (verify start_url → `/home`), `README.md`,
`.stylelintrc`.

**Tests.** PDF export under both themes. Welcome wizard records the
same answers it did before. PWA install prompt shows the new icons.
New playwright tests: visiting `/` lands on `/home`; visiting
`/stitch.html` with active project skips the landing redirect.

**No *feature* change.** Every tool reachable from the old landings
is reachable from `/home` (or via the existing direct URLs / PWA
shortcuts). The standalone landing *surface* on each tool page is
removed and replaced by the unified `/home`.

---

### Phase 8 · Cleanup

**Goal.** Tidy the codebase now Workshop is the sole theme.

**Work.**
- Squash any transient compatibility shims out of `styles.css`.
- Remove dead code paths in `home-screen.js` left over from the
  old per-tool landings.
- Bump `CREATOR_CACHE_KEY`, `TRACKER_CACHE_KEY`, etc. one final
  time so every client gets the lean stylesheet.
- Update `AGENTS.md` and `.github/copilot-instructions.md` with a
  note pointing future contributors to `_workshop.css` as the
  single source of truth, and `/home` as the default landing.

**Files touched.** `styles.css`, `home-screen.js`, `sw.js`,
`AGENTS.md`, `.github/copilot-instructions.md`.

**Tests.** Full test pass plus visual regression sign-off.

**No functionality change.** Pure cleanup.

---

## What ships in each PR (if you prefer a flat PR list)

| # | PR title | Phase |
|---|---|---|
| 1 | `chore(theme): scaffold Workshop tokens` | 0 |
| 2 | `feat(theme): apply Workshop palette across page chrome` | 1 |
| 3 | `feat(theme): Workshop dark mode` | 2 |
| 4 | `feat(components): unified Overlay primitive (dialog/sheet/drawer)` | 3 |
| 5 | `refactor(modals): migrate the 10 dialogs to Overlay` | 3 |
| 6 | `feat(tracker): mobile-first floating dock + bottom mode pill` | 4 |
| 7 | `feat(tracker): wake-lock chip + safe-area handling` | 4 |
| 8 | `feat(tracker): tablet/desktop project rail + side panel` | 4 |
| 9 | `feat(creator): persistent outcome action bar` | 5 |
| 10 | `feat(header): project switcher + mode pill` | 6 |
| 11 | `feat(palette): ⌘K command palette across all pages` | 6 |
| 12 | `feat(onboarding): Workshop wizard polish` | 7 |
| 13 | `feat(home): /home cross-mode landing replaces per-tool landings` | 7 |
| 14 | `feat(pdf): optional Workshop print theme (PK-compat unchanged)` | 7 |
| 15 | `chore(theme): tidy stylesheet, bump cache keys, update docs` | 8 |

Each PR is small enough to review in one sitting. The order matters
(later PRs assume earlier ones), but PRs within a phase can ship
in any order.

---

## Non-negotiables that survive this plan

These are repeated from
[ux-11 § cross-direction non-negotiables](ux-11-visual-direction.md#cross-direction-non-negotiables)
and apply at every phase:

- **No emojis in user-facing UI.** Inline SVG icons via
  `window.Icons.{name}()` only. Add new icons to `icons.js` as needed.
- **British English** throughout.
- **DMC swatch + ID + name** together in every thread chip ([P2](ux-3-domain-reference.md)).
- **Pattern-Keeper compatibility** of the PK-compat PDF path is
  bit-stable. Any visual changes to print output sit behind a
  separate, opt-in "Workshop print theme" toggle.
- **44 px minimum** touch targets on `pointer: coarse`.
- **Reduced-motion** strictly respected; mark-stitch celebration and
  sheet-entry animations replaced by instant state changes.
- **Existing IndexedDB schema and project JSON shape unchanged** —
  no migrations required by this plan.
- **Every existing keyboard shortcut, preference, setting, modal,
  tab, and tool remains reachable.** Per-tool *landing surfaces* are
  the one exception — they're replaced by the unified `/home`
  landing in Phase 7. Direct deep links to `index.html`,
  `stitch.html`, and `manager.html` continue to work.

---

## Decisions locked in (25 Apr 2026 revision)

1. **No feature flags / beta toggle.** Workshop ships directly each
   phase. No `data-theme="legacy"` fallback, no
   `prefs.theme.visualDirection` toggle.
2. **`/home` replaces** the per-tool landings. Phase 7 builds it.
   Direct URLs to per-tool pages still work and skip the redirect
   when a project is already active.

Starting Phase 0 now.
