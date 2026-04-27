# Branch Audit · Report 1 — Changeset Map

**Branch under audit:** `ui-improvements-2`  
**Baseline:** `main`  
**Diff stats:** 194 files changed, 18,582 insertions, 15,618 deletions, 38 commits  
**Audit date:** 27 Apr 2026

This is the comprehensive map of every change introduced by the
UX-12 "Workshop" redesign program against `main`. It is the
substrate for reports 2–9.

---

## 0 · How the program is structured

The redesign is the **Hybrid 4 ship train** documented in
[reports/ux-12-implementation-plan.md](ux-12-implementation-plan.md):

| Phase | Theme | Headline commits |
|---|---|---|
| **P0** | Workshop tokens scaffolded (alias layer) | `b6f4d98 chore(theme): scaffold Workshop tokens` |
| **P1** | Workshop palette across page chrome | `855dc3b feat(theme): apply Workshop palette across page chrome`, `f4efb0e fix(theme): catch teal variants` |
| **P2** | Workshop dark mode | `b61beb3 feat(theme): Workshop dark mode`, `2902e4f refactor(theme): Phase 2.5 semantic colour migration` |
| **P3a** | Overlay primitive (dialog/sheet/drawer) | `87b648f feat(overlay): unified Overlay primitive` |
| **P3b** | Migrate 12 modals onto Overlay | `a9af1a4`, `daf7c63`, `e10d990`, `99a8327` |
| **P4** | Tracker mobile-first re-layout | `111c918 mobile-first floating dock + bottom mode pill`, `5f7e275 wake-lock chip + safe-area`, `58774d3 tablet/desktop project rail + side panel`, `073454a dock transition during drag` |
| **P5** | Creator persistent outcome action bar | `bb6d82a feat(creator): persistent outcome action bar`, `b538d73 roving focus + auto-focus first item` |
| **P6** | Header consolidation (project switcher + ⌘K) | `50befb7 feat(header,palette): UX-12 Phase 6` |
| **P7** | Onboarding · `/home` landing · PDF Workshop theme | `942d41f`, `4c03d26`, `554127d`, `d6563fa` |
| **P8** | Cleanup, drop `--ws-*` aliases, bump caches, polish | `63cf575`, `223a320` |
| **Post-P8** | Sprints 1–6 (a11y/token compliance pass) + last-mile fixes | `5c86b20 a11y sprint 1`, `521050d tokens sprint 2`, `4b9d077 tokens sprint 3`, `0e41880 tokens sprint 4`, `fd3fe71 a11y sprint 5`, `6a774dc a11y modal ARIA`, `4f5687e a11y sprint 6 + components syntax fix`, `ca398f0 setInterval file-picker hacks`, `057dce1 React.createElement syntax errors`, `8918971 lpanel bottom-sheet + SW v10`, `24c0f75 critical bundle syntax error`, `f84d9d9 + 9c2616f homepage fixes` |

---

## 1 · Files added

| File | Purpose | Phase |
|---|---|---|
| [components/Overlay.js](../components/Overlay.js) | Unified `<Overlay variant="dialog\|sheet\|drawer">` primitive (focus trap, ESC, scrim, ARIA `role=dialog` + `aria-modal=true`, `env(safe-area-inset-bottom)` for sheets). | P3a |
| [creator/ActionBar.js](../creator/ActionBar.js) | Persistent outcome action bar above the Creator's tab strip — Print PDF, Track, Share/QR ▾, Export ▾. | P5 |
| [home.html](../home.html) | New cross-mode landing page (default `/`). | P7 |
| [home-app.js](../home-app.js) | `/home` React app — recent projects, stash summary, quick-action tiles. | P7 |
| [_sprint3_tokens.js](../_sprint3_tokens.js), [_sprint4_css_tokens.js](../_sprint4_css_tokens.js) | Sprint helper scripts to find raw hex/px violations (developer-facing). | Sprints 3-4 |
| [tests/Overlay.test.js](../tests/Overlay.test.js) | Jest tests for the Overlay primitive. | P3a |
| [tests/commandPalettePhase6.test.js](../tests/commandPalettePhase6.test.js) | Tests for Phase-6 ⌘K additions (project switching, mode jump). | P6 |
| [tests/creatorActionBar.test.js](../tests/creatorActionBar.test.js) | Snapshot + integration test for ActionBar. | P5 |
| [tests/headerProjectSwitcher.test.js](../tests/headerProjectSwitcher.test.js) | Switcher renders active project, recent list, falls through to picker modal. | P6 |
| [tests/homeApp.test.js](../tests/homeApp.test.js) | Tests for `/home` data plumbing (recent projects, stash summary). | P7 |
| [tests/landingRedirect.test.js](../tests/landingRedirect.test.js) | Visiting `/` lands on `/home`; visiting per-tool URLs with active project skips redirect. | P7 |
| [tests/pdfTheme.test.js](../tests/pdfTheme.test.js), [tests/pdfThemePref.test.js](../tests/pdfThemePref.test.js) | PK-compat unchanged; Workshop print theme is opt-in via `creator.pdfWorkshopTheme` user pref. | P7 |
| [tests/swPrecache.test.js](../tests/swPrecache.test.js) | Service-worker precache list includes new home assets. | P7 |
| [tests/shortcutsModal.test.js](../tests/shortcutsModal.test.js) | Shortcuts overlay ARIA. | Sprint 5 |

## 2 · Files removed

| File | Note |
|---|---|
| `BRANCH_AUDIT_AND_GAP_BRIEF.md` | Old audit superseded by this program. |
| `POST_FIX_GAP_BRIEF.md` | Same. |
| `PREFERENCES_REDESIGN_PROPOSAL.md` | Folded into Phase 8 cleanup. |
| `reports/architecture-pass-quarter-c.md`, `reports/b1-complete.md`, `reports/b2-complete.md` | Stale completion reports tidied up in `dd936ac chore: remove completed/obsolete reports and proposals`. |

No production functionality was removed.

## 3 · Files significantly modified (≥ 50 LOC change)

Grouped by area. Rough impact size from `git diff main...HEAD --stat`.

### 3.1 Theme & token foundation (P0–P2, Sprints 2–4)

| File | Δ | What changed |
|---|---|---|
| [styles.css](../styles.css) | +2,195 net | Entire Workshop token set on `:root` + `[data-theme="dark"]`; tokenised page chrome (header, sidebars, modals, cards, buttons, inputs, toasts, tooltips). Phase 2.5 semantic-colour migration. Sprints 3+4 token-compliance pass. Phase-8 cleanup removed `--ws-*` aliases. |
| [components.js](../components.js) | +360 −0 net | Tokenised every hardcoded value (sprint 2). Sprint-6 ARIA pass. `057dce1` fixed React.createElement syntax errors that had snuck in. |
| [apply-prefs.js](../apply-prefs.js) | +30 | Theme application + dark-mode support; broadcasts `cs:prefsChanged` for live updates. |
| [manifest.json](../manifest.json) | +6 | Workshop `theme_color` / `background_color` (linen + ink). |
| [vercel.json](../vercel.json) | +6 | `/` → `home.html` rewrite. |

### 3.2 Overlay primitive + modal migrations (P3)

The Overlay primitive replaces 12 ad-hoc dialog implementations.

| File | Migration |
|---|---|
| [components/Overlay.js](../components/Overlay.js) | New (213 LOC). |
| [modals.js](../modals.js) | NamePromptModal + SharedModals.About → Overlay. |
| [palette-swap.js](../palette-swap.js) | → Overlay. |
| [backup-restore.js](../backup-restore.js) | → Overlay. |
| [creator/BulkAddModal.js](../creator/BulkAddModal.js) | → Overlay. |
| [creator/ConvertPaletteModal.js](../creator/ConvertPaletteModal.js) | → Overlay. |
| [creator/ShoppingListModal.js](../creator/ShoppingListModal.js) | → Overlay. |
| [creator/SubstituteFromStashModal.js](../creator/SubstituteFromStashModal.js) | → Overlay. |
| [creator/ImportWizard.js](../creator/ImportWizard.js) | → Overlay. |
| [preferences-modal.js](../preferences-modal.js) | → Overlay (with `[data-pref-modal]` hook preserved for dark-mode CSS — `99a8327`). |
| [onboarding-wizard.js](../onboarding-wizard.js) | Workshop visual polish + Overlay-aware. |

### 3.3 Tracker mobile-first re-layout (P4)

| File | Δ | Notes |
|---|---|---|
| [tracker-app.js](../tracker-app.js) | +955 −0 net | Floating tool dock (44 px buttons); bottom mode pill (Stitch / Find / Edit) above safe area on phone; wake-lock chip (with `cs_wakelock` pref); current-colour chip pinned at top with DMC ID + name + remaining; tablet/desktop project rail (≥ 600 px gate) + right palette/Today panel; bottom-sheet `lpanel` at all viewports as of `8918971`. |
| [stitch.html](../stitch.html) | +19 | Loads new components + meta `viewport-fit=cover` for safe-area. |
| [useDragMark.js](../useDragMark.js) | minor | Compatible with new dock + drag-suppression on dock transition (`073454a`). |

### 3.4 Creator outcome action bar (P5)

| File | Δ | Notes |
|---|---|---|
| [creator/ActionBar.js](../creator/ActionBar.js) | New (203 LOC) | Print PDF (primary) · Track this · Share/QR ▾ · Export ▾. Roving-focus menu with auto-focus on first item. |
| [creator/PatternTab.js](../creator/PatternTab.js) | +66 | Mounts ActionBar above page tabs. |
| [creator/ProjectTab.js](../creator/ProjectTab.js) | +194 | Same. |
| [creator/Sidebar.js](../creator/Sidebar.js) | +542 −0 net | Considerable refactor to host the new chrome. |
| [creator/useProjectIO.js](../creator/useProjectIO.js) | minor | Exposes the existing track-handoff path more conveniently. |
| [creator/bundle.js](../creator/bundle.js) | +1,946 net | Regenerated. |

### 3.5 Header + command palette (P6)

| File | Δ | Notes |
|---|---|---|
| [header.js](../header.js) | +216 net | New `<HeaderProjectSwitcher>` with thumbnail + recent list, falls through to project-picker modal via `onOpenAll`. Mode pill (Designing / Tracking / Managing). Roving focus, ARIA, click-outside, Escape. |
| [command-palette.js](../command-palette.js) | +59 | Cross-page action registry — Switch to Creator/Editor/Tracker, View Stats, Open Stash Manager, View Showcase, Backup, Import, Help, Shortcuts, Preferences, Rename current project. Bound to ⌘K. |

### 3.6 `/home`, onboarding, PDF Workshop theme (P7)

| File | Δ | Notes |
|---|---|---|
| [home.html](../home.html), [home-app.js](../home-app.js) | New | Cross-mode landing — active project hero, recent list, stash summary, quick-action tiles. |
| [home-screen.js](../home-screen.js) | +84 | Trimmed standalone landing block; helpers retained for the deep-link path inside `creator-main.js`. |
| [creator-main.js](../creator-main.js) | +192 | Skips landing redirect when a project is already active; integrates ActionBar. |
| [index.html](../index.html), [stitch.html](../stitch.html), [manager.html](../manager.html) | minor | Per-tool deep-links still work; redirect to `/home` only when no active project (logic in `home-screen.js`). |
| [sw.js](../sw.js) | +4 | Precache `home.html`/`home-app.js`. Cache name bumped — finally to `cross-stitch-cache-v10` in `8918971` to evict the broken bundle that briefly shipped under v9. |
| [onboarding-wizard.js](../onboarding-wizard.js) | +55 | Workshop palette + tokens; focus ring; reduced-motion suppression; `pointer:coarse` 44 px target enforcement. |
| [pdf-export-worker.js](../pdf-export-worker.js) | +57 | Workshop print theme behind `creator.pdfWorkshopTheme` pref. PK-compat path bit-identical. |
| [creator/pdfChartLayout.js](../creator/pdfChartLayout.js) | +23 | Same. |
| [creator/pdfExport.js](../creator/pdfExport.js) | +15 | Threads pref through. |

### 3.7 Page-level surfaces

| File | Δ | Notes |
|---|---|---|
| [manager-app.js](../manager-app.js) | +394 net | Tokenisation; ARIA role pass; hooks to header switcher; bridge to `/home` quick actions. |
| [stats-page.js](../stats-page.js) | +238 net | Tokenisation. |
| [stats-activity.js](../stats-activity.js) | +84 net | Tokens + double-var cleanup (`6a774dc`). |
| [stats-insights.js](../stats-insights.js) | +64 net | Tokens. |
| [stats-showcase.js](../stats-showcase.js) | +100 net | Tokens. |
| [icons.js](../icons.js) | +28 | New icons used by Phase 4–6 surfaces. |

### 3.8 Other touched files (small)

`build-creator-bundle.js`, `embroidery.html`, `embroidery.js`, `helpers.js`,
`keyboard-utils.js`, `palette-swap.js`, `preferences-modal.js`,
`project-library.js`, `serve.js`, `sw-register.js`, `toast.js`,
`user-prefs.js`, `creator/canvasRenderer.js`, `creator/ContextMenu.js`,
`creator/DesignerBrandingSection.js`, `creator/ExportTab.js`,
`creator/LegendTab.js`, `creator/MagicWandPanel.js`, `creator/PrepareTab.js`,
`creator/SplitPane.js`, `creator/Toast.js`, `creator/ToolStrip.js`,
`components/PartialStitchThumb.js`, `help-drawer.js`,
`tests/c7ImportWizardA11y.test.js`, `tests/difficulty-rating-properties.test.js`,
`tests/editModeBanner.test.js`, `tests/icons.test.js`,
`tests/__snapshots__/icons.test.js.snap`, `tests/resumeRecapModal.test.js`,
`tests/trackerLeftSidebar.test.js`. Each is a small token-pass / a11y
adjustment / consequential test update.

---

## 4 · Behaviour-affecting changes (user-facing)

For each, the report grades whether the change was an *intentional
redesign action* per the Phase plan or *incidental* (refactor, bug
fix, dependency cleanup).

| # | Behaviour change | Before (main) | After (branch) | Phase | Intent |
|---|---|---|---|---|---|
| 1 | Default landing on `/` | Each tool had its own splash inside its HTML page; `home-screen.js` rendered an in-Creator dashboard. | `/` resolves to `home.html` (new file). When a project is active, deep links to `index.html`/`stitch.html`/`manager.html` skip the redirect. | P7 | **Intentional.** |
| 2 | Print PDF reachable from Pattern view | 5 deliberate clicks (Materials & Output → Output → preset → Format & settings ▾ → Export PDF) — see [ux-4#N-H3](ux-4-navigation.md). | 1 click: persistent `Print PDF` button on the Creator action bar. | P5 | **Intentional.** |
| 3 | Track-this-pattern from Creator | Two-step (save then navigate). | 1 click: `Track` on the action bar. | P5 | **Intentional.** |
| 4 | Header project switcher | None — only modal project picker per page. | Always-present header dropdown listing recent projects with thumbnails, falls through to the existing modal via "View all". | P6 | **Intentional.** |
| 5 | ⌘K command palette | The `command-palette.js` file existed on main with a small action set. | Extended to cross-page actions (mode jump, settings, help, rename, backup, import). | P6 | **Intentional.** |
| 6 | Tracker phone toolbar | Horizontal pill bar that consumed canvas height. | Floating dock (44 px buttons) + bottom mode pill (Stitch/Find/Edit) above safe-area. | P4 | **Intentional.** |
| 7 | Tracker tablet/desktop chrome | Single column + project-picker modal. | Persistent left project rail (≥ 600 px) + right palette/Today panel. | P4 | **Intentional.** |
| 8 | Wake-lock during stitching | Not present. | Header chip controls a `screen.wakeLock.request('screen')` (with prefs gate). | P4 | **Intentional.** Addresses M-H3. |
| 9 | iOS safe-area on bottom sheets | Bottom sheets ignored `env(safe-area-inset-bottom)`. | All Sheet-variant overlays pad the inset. | P3a / P4 | **Intentional.** Addresses M-H4. |
| 10 | Modal a11y | Most modals lacked `role="dialog"` + focus trap. | Every dialog migrated to Overlay gets dialog ARIA, focus trap, ESC, scrim. Sprints 5–6 closed remaining gaps. | P3 + Sprints 5–6 | **Intentional.** |
| 11 | Dark mode coverage | ~10% of surfaces had dark-mode rules (V-H2). | End-to-end dark mode via `[data-theme="dark"]`. | P2 | **Intentional.** |
| 12 | PDF print theme | Default Pattern-Keeper-compatible only. | PK-compat path is bit-stable; new opt-in Workshop print theme behind `creator.pdfWorkshopTheme` user preference. | P7 | **Intentional.** |
| 13 | Tracker `lpanel` (left panel) | Slid in from the left at all viewports — ate horizontal canvas space on desktop too. | Bottom-sheet at all viewports (`8918971`). | Post-P8 | Bug fix on a Phase-4 regression. |
| 14 | Service worker cache name | `cross-stitch-cache-v9`. | `cross-stitch-cache-v10` to evict the broken bundle that shipped briefly under v9. | Post-P8 | **Bug fix.** |
| 15 | `/home` quick-action deep links | n/a (file didn't exist). | `/home?action=…` deep-links into the right tool. Initial implementation was broken; fixed in `24c0f75 fix: critical bundle syntax error + /home -> tool deep links + tracker UX`. | P7 + post-fix | Intentional + bug fix on the same. |
| 16 | Onboarding wizard polish | Working, plain visual. | Workshop palette + tokens; visible focus ring; `prefers-reduced-motion` honoured; `pointer:coarse` enforces 44 px controls. | P7 | **Intentional.** |
| 17 | Creator setInterval file-picker hacks | Were used in two places to coerce `<input type="file">` into reopening after a state stall — flaky and ugly. | Removed; the affected flows now show a toast-guided "click again" instruction and rely on a clean stable handler. | Post-P8 | Bug fix (`ca398f0`). |
| 18 | React.createElement syntax errors in `components.js` | n/a — introduced as a regression by sprint 5/6 ARIA pass. | Fixed in `057dce1`. | Post-P8 | Bug fix. |
| 19 | Unicode chevron characters (`▴ ▾ ▸`) | Used in several toolbars. | Replaced with `Icons.chevronUp`/`chevronDown`/etc per the no-emoji rule (`223a320`). | P8 polish | **Intentional.** |
| 20 | `--ws-*` alias tokens | Existed (Phase 0). | Removed in Phase 8; canonical Workshop token names used directly. | P8 | **Intentional.** |
| 21 | `home.html` polish (Apr-26-27) | Initial Phase 7 cut had layout bugs on phones, broken deep-links, and inconsistent quick-tile spacing. | `f84d9d9 Update homepage` + `9c2616f Homepage fixes`. | Post-P8 | Bug fix series. |

## 5 · Unfinished / leftover code flags

Items found that look unfinished, placeholder, or otherwise need
follow-up. Each is fed into report 9 (quick wins) or report 7
(issues) as appropriate.

| Flag | Where | Notes |
|---|---|---|
| `_sprint3_tokens.js`, `_sprint4_css_tokens.js` at repo root | Root | Sprint helper scripts. They are *not* loaded by any HTML page (verified — no `<script>` reference). They are dev-only artefacts left in tree. **Quick win** — move under `scripts/` or delete. |
| "Coming soon" badges in Preferences | [preferences-modal.js](../preferences-modal.js) | Documented behaviour: `_soon: true` settings save to `UserPrefs` but are not wired to runtime. Repo-memory note already covers this. Honest disclosure rather than a regression. |
| Commented-out "App appearance" accent-colour section | [preferences-modal.js](../preferences-modal.js) ~line 250 | `/* h(Section, { title: "App appearance" }, ... ) */ null` — leftover JSX block in `ProfilePanel`. **Quick win** — delete the comment (or reactivate behind a `_soon` flag). |
| Hard-coded `COLOURS = { teal: "#B85C38", … }` block | [preferences-modal.js](../preferences-modal.js) lines ~85–90 | Raw hex inside JS — bypasses the `--accent` token. Means the Preferences modal won't track theme accent overrides if/when accent ever ships. **Medium issue.** |
| Per-page WelcomeWizard wrappers + extra `StitchingStyleOnboarding` | [onboarding-wizard.js](../onboarding-wizard.js), [tracker-app.js](../tracker-app.js) | The Phase-5 plan was to merge them into one wizard. Phase-5 test plan documents the merge but the actual code still has both `WelcomeWizard` (3 steps) + `StitchingStyleOnboarding` mounted in tracker. The merge ships as `extraSteps` + `customComponent`, which works but the legacy `StitchingStyleOnboarding` modal is still mounted (test plan acknowledges this as the toolbar reopener). Honest. |
| `console.warn` left in `command-palette.js` | [command-palette.js](../command-palette.js) ~line 70 | `_navigate(...) { … console.warn('CommandPalette: same-doc nav failed, falling back to full nav', _); … }`. Acceptable diagnostic (only fires on error path). |
| `console.error` left in `command-palette.js` | [command-palette.js](../command-palette.js) ~line 130 | `console.error('CommandPalette: backup failed', e);` — same. Acceptable. |
| `try { window.location.reload(); } catch(_){}` in `TrackerProjectRail.openProject` | [tracker-app.js](../tracker-app.js) ~L455 | Switching project from the rail does a full page reload. Functional but wasteful (loses scroll state, restarts Babel compile on slow phones). **Medium issue** for report 7. |
| `[B6] Removed 'act_reset_tour'` comment | [command-palette.js](../command-palette.js) ~L188 | Dead-code comment — fine to leave. |

---

## 6 · Risk surface (the bits most likely to regress)

Listed by surface area × user impact:

1. `tracker-app.js` (+955 net LOC) — biggest single re-layout. The Phase-4 dock transitions, drag-mark, wake-lock, and the bottom-sheet `lpanel` were all re-touched after their initial PRs to fix regressions. **Highest residual risk.**
2. `creator/bundle.js` (+1,946 net LOC) — concatenated bundle. The `24c0f75 fix: critical bundle syntax error` and `057dce1 fix(components): resolve all React.createElement syntax errors` both indicate that the bundle was once shipped broken. SW cache had to be bumped to v10 to evict it. Suggests the build/test loop didn't catch a JSX error that the runtime did.
3. `home.html` + `home-app.js` — newest surface, two polish commits (`f84d9d9`, `9c2616f`) on the very last day before audit. Likely still has visual rough edges (audited in report 5).
4. `styles.css` (+2,195 net LOC) — full token migration. Not behaviour-changing in theory, but a dropped rule changes layout silently.
5. The Phase-3 modal migrations — 12 dialogs now share one primitive. If Overlay's focus trap or scrim has a defect, every dialog inherits it. Phase-3b `99a8327` already had to restore `[data-pref-modal]` for dark-mode CSS.

---

## 7 · What did *not* change (intentional invariants)

- **Project JSON shape** (v8) and **IndexedDB schema** unchanged — no migration required by this program.
- **Pattern-Keeper compatible PDF output** — bit-stable; Workshop print theme is opt-in only.
- **Every existing keyboard shortcut, preference, modal, tab, and tool remains reachable.** The plan's no-feature-loss invariant.
- **No npm dependencies added** to user-shipped code (`pako`, React/Babel CDN, pdf-lib CDN are unchanged). `husky` was added in an earlier round and is dev-only.
