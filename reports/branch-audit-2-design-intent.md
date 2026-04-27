# Branch Audit · Report 2 — Design Intent vs Implementation

**Branch under audit:** `ui-improvements-2` · **Baseline:** `main`

This report reconstructs the design intent for the redesign from the
canonical sources in this repo, then walks each major surface to
judge whether the implementation matches and where it deviates.

## Source documents (treat these as the spec)

- Research: [ux-1](ux-1-domain-research.md), [ux-2](ux-2-user-journeys.md), [ux-3](ux-3-domain-reference.md)
- Audit: [ux-4 navigation](ux-4-navigation.md), [ux-5 workflow friction](ux-5-workflow-friction.md), [ux-6 visual](ux-6-visual-design.md), [ux-7 mobile](ux-7-mobile.md), [ux-8 a11y](ux-8-accessibility.md)
- Synthesis: [ux-9 prioritised issues](ux-9-prioritised-issues.md)
- Proposals (mutually exclusive): [ux-10 plans A/B/C](ux-10-proposals.md)
- Visual direction (the chosen one): [ux-11 Workshop](ux-11-visual-direction.md)
- The plan that was actually executed: **[ux-12 implementation plan — Hybrid 4 (A→B→C threaded), Workshop visual](ux-12-implementation-plan.md)**
- Approved wireframes: [reports/wireframes/](wireframes/) (`plan-a-*`, `plan-b-*`, `plan-c-*`)
- Visual showcase: [reports/showcase/](showcase/)

The canonical decision (recorded 25 Apr 2026 in ux-12) is:

> Visual direction: Workshop. Plan: Hybrid 4 — threaded ship train (A → B → C). No `--ws-*` aliases by Phase 8. No feature flags / beta toggle. Workshop ships directly. `/home` replaces per-tool landings; direct URLs still work.

## Per-surface comparison

For each surface: **Goal → Spec → What shipped → Verdict.**
Verdicts: ✅ matches spec · ➕ improvement on spec · ⚠️ deviation worth flagging · 🟥 misses spec.

### S1 · Workshop tokens & dark mode (Phases 0–2 + Sprints 3–4)

- **Goal.** Single source of truth for colour, type, spacing; full dark mode; no raw hex/px in component CSS.
- **Spec.** All `--ws-*` aliases removed by Phase 8 — canonical Workshop names used directly. Light tokens on `:root`, dark on `[data-theme="dark"]`. Mirror lives at `reports/showcase/_workshop.css`. Stylelint warn → error.
- **Shipped.** [styles.css](../styles.css) carries the full Workshop token set on `:root` + `[data-theme="dark"]`; commits `b6f4d98` → `2902e4f` → `63cf575` deliver the migration through to alias removal. `4b9d077` and `0e41880` are the sweep passes. Sprint scripts `_sprint3_tokens.js` + `_sprint4_css_tokens.js` were used to find raw values.
- **Verdict.** ✅ matches spec. ⚠️ minor — the sprint helper scripts were left at repo root rather than in `scripts/`; and `preferences-modal.js` still defines a hard-coded `COLOURS` palette in JS (carried-over, not introduced by this program).

### S2 · Overlay primitive (Phase 3)

- **Goal.** One component family for the 12 dialogs; ARIA dialog + focus trap + safe-area for sheets.
- **Spec.** [components/Overlay.js](../components/Overlay.js) with variants `dialog | sheet | drawer`. Per-modal migration in dependency order: palette-swap → backup-restore → 5 creator modals → preferences-modal → onboarding-wizard → modals.js.
- **Shipped.** Overlay primitive present (213 LOC); 12 modals migrated across `a9af1a4`, `daf7c63`, `e10d990`. `99a8327` restores the `[data-pref-modal]` attribute that the Preferences migration accidentally dropped (it was needed by dark-mode CSS).
- **Verdict.** ✅ matches spec. ➕ Phase-5/6 a11y polish (sprints 5–6) extended ARIA + state icons across non-modal surfaces too.

### S3 · Tracker mobile-first (Phase 4)

- **Goal.** Phone Tracker matches `reports/wireframes/plan-a-tracker-mobile.html`; tablet/desktop match `plan-a-tracker-tablet.html`. Every existing tool / shortcut / mode preserved.
- **Spec.** Floating tool dock (44 px), bottom mode pill (Stitch/Find/Edit), wake-lock chip, current-colour chip with DMC ID + name + remaining, tablet/desktop persistent left project rail + right palette/Today panel.
- **Shipped.** All five spec items in `tracker-app.js` (commits `111c918`, `5f7e275`, `58774d3`). `073454a` suppresses dock transition during active drag. `8918971` makes `lpanel` a bottom-sheet at all viewports — this is a **deviation worth flagging**.
- **Verdict.** ✅ for the dock + chips + rail. ⚠️ for the lpanel: the spec implies the tablet/desktop layouts have a *persistent* left rail, but `lpanel` (the contextual settings drawer) became a bottom-sheet at all viewports to fix a desktop horizontal-canvas regression. This is functionally correct but means desktop users now lose the "left rail of options" affordance the wireframe shows. Report 7 lists this as a 🟠 high.
- ⚠️ **Project switching reloads the page**: `TrackerProjectRail.openProject` does `window.location.reload()` (tracker-app.js ~L455). Spec says "fast switcher"; full reload on a Babel-in-browser app on mobile is the opposite of fast. Report 7 lists this as a 🟠 high (mobile reach).

### S4 · Creator outcome action bar (Phase 5)

- **Goal.** Print PDF and Track-this surface as one-click actions (showcase page 3, addresses N-H3 click depth).
- **Spec.** `[Print PDF]` (primary) · `[Track this pattern]` · `[Share / QR ▾]` (ghost) · `[Export… ▾]` (ghost). Tabs unchanged. Right-side stats block (size, fabric, colour count, skein est).
- **Shipped.** [creator/ActionBar.js](../creator/ActionBar.js) (203 LOC) + mounts in PatternTab and ProjectTab. Roving focus on the Export menu, auto-focus on first item (`b538d73`).
- **Verdict.** ✅ matches spec.
- ⚠️ Mobile note: ActionBar buttons are full-width on phone, but at narrow widths (<360 px) they may wrap or truncate. Verified in report 5.

### S5 · Header project switcher + ⌘K (Phase 6)

- **Goal.** Header gets two new affordances *added alongside* the existing nav.
- **Spec.** `<HeaderProjectSwitcher>` shows active project + thumbnail; click opens recent list with fall-through to existing modal. ⌘K command palette: project switching, mode jumping, settings, help, common actions. Mode pill (Designing / Tracking / Managing) added to header.
- **Shipped.** `HeaderProjectSwitcher` in [header.js](../header.js) (~L96+) with full ARIA + roving focus. Command palette in [command-palette.js](../command-palette.js) extended with cross-page actions and Recent Projects (cached in `window.__cachedProjectList`).
- **Verdict.** ✅ matches spec. The mode pill exists in the header in code but the visual spec from `plan-c-header-switcher.html` shows a slightly different prominence — see report 5.

### S6 · `/home` cross-mode landing (Phase 7)

- **Goal.** Replace the per-tool landings with one cross-mode dashboard (`reports/wireframes/plan-c-home.html`).
- **Spec.** New `home.html` + thin `home-app.js`. Active project hero, recent projects, stash summary, quick-action tiles. Per-tool deep links still resolve directly when a project is active.
- **Shipped.** Both files exist. `home-screen.js` retained (its helpers are reused). Initial Phase-7 cut needed two follow-up commits (`f84d9d9`, `9c2616f`) for layout polish, plus `24c0f75` for deep-link wiring.
- **Verdict.** ✅ for structure. ⚠️ for polish — see report 5 for visual regressions on `/home`.

### S7 · Onboarding wizard polish (Phase 7)

- **Goal.** Workshop visual without changing the onboarding *content*.
- **Spec.** Same 3-step wizard, Workshop tokens, focus ring, reduced-motion suppression, 44 px on `pointer: coarse`.
- **Shipped.** [onboarding-wizard.js](../onboarding-wizard.js) — confirmed inline `<style id="ob-wiz-styles">` injects `.onboarding-focusable:focus-visible{outline:3px solid var(--accent);outline-offset:2px;…}` plus reduced-motion + `@media(pointer:coarse){min-height:44px}`.
- **Verdict.** ✅ matches spec.

### S8 · PDF Workshop print theme (Phase 7)

- **Goal.** Optional Workshop print theme; **PK-compat path bit-identical**.
- **Spec.** Behind `creator.pdfWorkshopTheme` user preference. Never overrides the PK-compat default.
- **Shipped.** `pdf-export-worker.js`, `creator/pdfChartLayout.js`, `creator/pdfExport.js` updates. Tests `tests/pdfTheme.test.js` + `tests/pdfThemePref.test.js` enforce the gating. `d6563fa fix(creator): tokenise PDF Workshop-theme checkbox + 44px target` is the polish commit on the toggle UI.
- **Verdict.** ✅ matches spec exactly.

### S9 · Hybrid 4's "no feature loss" invariant

- **Goal.** No tool, control, modal, setting, shortcut, or preference disappears.
- **Audit.**
  - All keyboard shortcuts in [help-drawer.js](../help-drawer.js) `SHORTCUTS` are still bound: cross-checked against [creator/useKeyboardShortcuts.js](../creator/useKeyboardShortcuts.js) and the tracker handler in `tracker-app.js`. ✅
  - All 12 dialogs migrated to Overlay still expose their original options (per Phase-3 commit messages and `tests/Overlay.test.js`). ✅
  - The legacy project-picker modal is still reachable from the header switcher's "View all" affordance. ✅
  - `home-screen.js` has been *trimmed* but not removed — the standalone Creator landing is still mounted by `creator-main.js` when `mode === 'home'`. ✅ (this is the canonical state per `AGENTS.md` § "Workshop is the sole theme").
- **Verdict.** ✅ invariant honoured.

## Plan-deviation summary

| # | Spec item | Implementation | Type |
|---|---|---|---|
| D1 | Tablet/desktop *persistent* left rail of options (lpanel) per `plan-a-tracker-tablet.html` | `lpanel` is now a bottom-sheet at all viewports (`8918971`). | **Compromise** — fixes a real bug (canvas-eating panel on desktop) but loses the wireframe's affordance. |
| D2 | Project switch from the tracker rail | Currently `window.location.reload()`. | **Regression on intent.** "Fast switcher" → full reload. |
| D3 | Single Welcome+Style wizard | Achieved via `extraSteps`/`customComponent`, but the standalone `StitchingStyleOnboarding` modal is still mounted as the toolbar-reopener path. Test plan documents this. | **Acceptable compromise.** |
| D4 | `--ws-*` aliases removed | Done in P8. | ✅ |
| D5 | "Coming soon" Preferences honesty | Honoured (visible badge). | ✅ |
| D6 | Stylelint warn → error | Plan flagged for P7. Not visible in repo (no `.stylelintrc` change in this program). | **Misses spec.** Worth picking up — see report 9. |
| D7 | Splash / install-prompt PWA icons | `manifest.json` updated; the **icon files themselves** (`assets/icons/*.png`) — list-dir doesn't show an `assets/icons/` directory. PWA install may still be broken (M-H1). | **Misses spec — needs verification (report 7).** |

## Improvements over spec

- ➕ Sprint-5/6 ARIA pass extended state-icon-paired-with-colour discipline beyond what the plan named.
- ➕ Tests added across `tests/Overlay.test.js`, `tests/creatorActionBar.test.js`, `tests/headerProjectSwitcher.test.js`, `tests/homeApp.test.js`, `tests/landingRedirect.test.js`, `tests/pdfTheme.test.js`, `tests/pdfThemePref.test.js`, `tests/swPrecache.test.js` — solid baseline against future regression.
- ➕ Cache-name bump discipline: each phase that broke service-worker assumptions bumps `CACHE_NAME` so existing PWA installs evict stale assets.
- ➕ `8918971` proactively bumped to `cross-stitch-cache-v10` to evict the broken bundle that briefly shipped.
