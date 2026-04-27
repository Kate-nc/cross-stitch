# Branch Audit · Report 5 — Visual Regressions

Static analysis of the rendered chrome on the redesign branch
against the approved Workshop wireframes / showcase mocks.
Examined breakpoints: **375 px (phone), 768 px (tablet portrait),
1024 px (tablet landscape / small desktop), 1440 px (desktop).**

⚠️ This report is informed by code inspection, not by running
Playwright at each breakpoint. **A `npm run test:e2e` pass at the
above viewports is recommended before merge.**

Severity legend: 🔴 critical · 🟠 high · 🟡 medium · 🟢 cosmetic.

## V1 · Tracker `lpanel` is now a bottom sheet at *all* viewports — 🟠 high

- **Where.** [tracker-app.js](../tracker-app.js); CSS in [styles.css](../styles.css) under `.lpanel`.
- **What changed.** Commit `8918971` made the left panel render as a bottom-sheet at every viewport. The original wireframe `reports/wireframes/plan-a-tracker-tablet.html` shows a *persistent* left rail of options on tablet/desktop.
- **Impact.** On desktop (1024 / 1440), the user can no longer keep settings/options open beside the canvas — opening the panel now occludes the bottom of the canvas instead of the side.
- **Why it shipped.** The previous implementation ate horizontal canvas space on desktop too (a real bug it was solving).
- **Fix path.** Restore a side-pane variant for `≥1024px` only; keep bottom-sheet for `<1024px`. See report 9.

## V2 · ActionBar wrap at narrow phone widths — 🟡 medium

- **Where.** [creator/ActionBar.js](../creator/ActionBar.js).
- **What changed.** The four buttons (Print PDF · Track · Share ▾ · Export ▾) live in a flexbox row.
- **Impact.** At <360 px width the row wraps to two lines, eating ~44 px of vertical canvas above the chart.
- **Fix path.** Hide Share + Export menus into a single overflow `…` button below 360 px. Print PDF + Track stay primary. See report 9.

## V3 · `/home` quick-action tile spacing — 🟡 medium

- **Where.** [home.html](../home.html), [home-app.js](../home-app.js); polish commits `f84d9d9`, `9c2616f`.
- **What changed.** Two follow-up commits suggest layout polish wasn't fully settled at first ship. Verified by reading the latest `home-app.js` — quick-action tiles use a `grid-template-columns: repeat(auto-fit, minmax(220px, 1fr))` pattern. At 768 px tablet portrait this collapses to a 3-up grid; at 320 px phone this renders 1-up.
- **Impact.** Probably fine. Worth a screenshot pass to confirm the hero-card / recent-list / quick-tiles balance is right.
- **Fix path.** Visual QA check; bump `minmax` lower bound if tiles look cramped at 768 px.

## V4 · Mode pill prominence vs `plan-c-header-switcher.html` — 🟡 medium

- **Where.** [header.js](../header.js) renders the mode pill in `tb-context-actions`.
- **What changed.** The wireframe shows the mode pill as the *primary* visual hierarchy element in the header (large, segmented control). The shipped version is a small ghost "Track ›" button in `tb-context-btn`. Same click count but quieter.
- **Impact.** Users may not notice the mode pill exists. Discoverability of cross-mode jump regresses vs the wireframe's intent.
- **Fix path.** Apply `tb-context-btn--primary` styling to the mode pill, or restyle as a 3-segment control on tablet/desktop.

## V5 · Dark mode coverage — 🟢 cosmetic, mostly resolved

- **Where.** [styles.css](../styles.css) `[data-theme="dark"]` rules.
- **What changed.** End-to-end dark mode shipped in P2; sprints 3-4 swept remaining hex tokens. The carried-over `COLOURS` palette in [preferences-modal.js](../preferences-modal.js) (lines ~85-90) uses raw hex (`teal: "#B85C38"`, `tealBg: "#F4DDCF"`, etc.) and applies them via inline `style`. This means the Preferences modal's *internal* colour scheme (sidebar buttons, inputs) does **not** respond to dark mode.
- **Impact.** Preferences modal in dark theme has light cream/teal panels that clash with the page chrome. Bad first impression for accessibility-conscious users.
- **Fix path.** Replace `COLOURS.teal` with `var(--accent)`, `COLOURS.line` with `var(--border)`, etc. ~25-line patch. See report 9.

## V6 · `_sprint3_tokens.js` / `_sprint4_css_tokens.js` at repo root — 🟢 cosmetic

- **Where.** Repo root.
- **Impact.** Visible to anyone exploring the repo (e.g. via the file tree on the deployed site if served statically). Not loaded by any HTML page (verified). Just noise.
- **Fix path.** Move under `scripts/` or delete.

## V7 · Onboarding wizard popover near edge of viewport at 320 px — 🟡 medium (suspected)

- **Where.** [onboarding-wizard.js](../onboarding-wizard.js) `recompute()` function.
- **Behaviour.** Falls back to centred when target is missing or 0×0. When the target is on-screen, popover positions relative to it.
- **Risk.** On the smallest phones the Manager onboarding step that targets the Threads tab might overflow the right viewport edge. The code doesn't appear to clamp to viewport.
- **Fix path.** Add a `Math.min(maxLeft, …)` clamp. Verify with Playwright at 320 px.

## V8 · Sticky header + safe-area-inset-top on iOS — 🟢 cosmetic

- **Where.** [stitch.html](../stitch.html) declares `viewport-fit=cover`. Header CSS in [styles.css](../styles.css) handles `padding-top: env(safe-area-inset-top, 0)`.
- **Risk.** Verify that the wake-lock chip and the active project badge don't clip behind the iOS status bar at the notch.

## V9 · Workshop accent contrast in dark mode — 🟢 cosmetic (verify)

- **Where.** [styles.css](../styles.css) `--accent` value in `[data-theme="dark"]`.
- **Risk.** Workshop's terracotta accent (`#B85C38` light) needs to lift to a brighter shade in dark to maintain contrast on `--surface` dark backgrounds. Verify per WCAG 2.2 AA — `npx pa11y` recommended.

## V10 · Stats page tokenisation — 🟢

- **Where.** [stats-page.js](../stats-page.js), [stats-activity.js](../stats-activity.js), [stats-insights.js](../stats-insights.js), [stats-showcase.js](../stats-showcase.js).
- **Status.** All tokenised in the sprint passes; `6a774dc` cleaned up double `var(...)` typos. ✅

## V11 · Manager card extras alignment — 🟢

- **Where.** [manager-app.js](../manager-app.js) `cardExtras` callback.
- **Per HELP_AND_ONBOARDING_TEST_PLAN_PHASE5.md** the cards now show shopping-list pill + missing-thread badge + N% stitched + 7-bar sparkline. With four small badges in a card footer, line-wrap behaviour at narrow widths needs a screenshot pass.

## Recommended viewport pass

Before merge, capture screenshots at 375/768/1024/1440 of:

1. `/home` (light + dark)
2. Creator Pattern view with ActionBar (light + dark)
3. Tracker phone with dock + mode pill + wake-lock chip
4. Tracker tablet with project rail + right palette panel + lpanel as bottom-sheet
5. Preferences modal (light + dark) — to confirm V5 fix landed
6. HeaderProjectSwitcher dropdown open
7. ⌘K command palette open
8. Manager Patterns tab with the 4 card-extras

A `npm run test:e2e -- --update-snapshots` pass after V1, V2, V5
fixes would lock in the regression baseline.
