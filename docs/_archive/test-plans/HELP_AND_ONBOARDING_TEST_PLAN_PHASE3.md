# Manager grid Phase 2, Tracker onboarding sequencing, action-gated wizards, terminology lint, Bulk Add in Creator, ? hint banner, Restore tutorials — Test Plan

Phase 3 follow-up to `HELP_AND_ONBOARDING_TEST_PLAN_PHASE2.md`. Covers seven items:

1. **Aggressive Manager grid Phase 2** — shopping-list checkboxes + missing-thread badges now live directly on `ProjectLibrary` cards in manager mode; legacy `pat-grid` removed entirely
2. **Tracker first-visit ordering** — `StitchingStyleOnboarding` is gated behind the generic Welcome flag and fires sequentially
3. **Action-gated onboarding** — wizard steps can require the user to click the highlighted target before **Next** is enabled
4. **Terminology lint script** — `scripts/lint-terminology.js` (and matching jest test) enforces TERMINOLOGY.md vocabulary
5. **Bulk Add in the Creator** — wired into the File menu on both home and design surfaces
6. **`?` shortcut discoverability** — bottom-right floating "Press [?] for help" hint, dismissible
7. **Restore tutorials** — new Preferences → **Tutorials** tab with per-page reset buttons and a global "Reset all tutorials" button

---

## 1. Where users see each change

| Change | User-visible location |
|---|---|
| Manager card extras | Manager → Patterns tab. Each `ProjectLibrary` card shows a small **shopping-list checkbox pill** and either a green **✓ Fully kitted** or amber **N threads needed** badge. The legacy `pat-grid` block (and its toggle/banner) are gone. |
| Empty state | Manager → Patterns tab with no patterns: friendly placeholder "No patterns yet…" replaces the dashed banner. |
| Tracker sequencing | First visit to `stitch.html` → only the generic Welcome wizard appears. After dismissing it, the `StitchingStyleOnboarding` modal opens. They no longer stack. |
| Action-gated steps | Manager wizard step 2 ("Build your stash"): **Next** button is grey and labelled **Waiting…** until the highlighted Threads tab is clicked. Same for step 3 (Patterns tab). Tooltip: "Complete the highlighted action to continue." |
| Terminology lint | CLI: `npm run lint:terminology` (or `node scripts/lint-terminology.js`). Jest: `tests/terminologyLint.test.js` runs as part of `npm test`. |
| Creator File menu | Home and Design pages → File menu dropdown now has **Bulk Add Threads…** below Export PDF. Opens the same `BulkAddModal` the Manager uses. |
| `?` hint banner | Bottom-right floating dark pill on first load of any page: **Press [?] for help**. Click the label → Help Centre opens & banner is dismissed. The × button dismisses without opening Help. State persists in `localStorage["cs_help_hint_dismissed"]`. |
| Restore tutorials | Preferences modal → new **Tutorials** tab (4th tab). Three per-page **Reset** buttons (Creator / Manager / Tracker) and a **Reset all tutorials** button. |

---

## 2. Manual QA steps

### Manager grid Phase 2

1. Open `manager.html` → Patterns tab. Confirm there is **no** "Show detailed grid" toggle and **no** dashed `pat-grid` block at the bottom.
2. With at least one pattern in the library, verify each card has:
   - A small checkbox pill: "Add to shopping list" or "On shopping list".
   - A status badge: green **✓ Fully kitted** if all required threads are owned, else amber **N threads needed**.
3. Toggle the shopping-list pill on/off; verify the count in the shopping-list summary panel updates accordingly.
4. Click the amber **N threads needed** badge → opens the same per-pattern detail panel that the legacy grid used (correct pattern selected).
5. Empty the library (delete all patterns or filter to no matches) → "No patterns yet. Click + Add Pattern to start your library, or generate one in the Pattern Creator." replaces the empty grid.

### Tracker first-visit ordering

1. In DevTools → Application → Local Storage, delete: `cs_welcome_tracker_done`, `cs_styleOnboardingDone`, `cs_stitchStyle`.
2. Reload `stitch.html`.
3. Confirm **only** the generic Welcome wizard appears (style picker is suppressed).
4. Dismiss the Welcome wizard → `StitchingStyleOnboarding` opens automatically.
5. Pick a style → reload → neither modal reopens.

### Action-gated onboarding

1. In DevTools → Local Storage, delete `cs_welcome_manager_done`. Reload `manager.html`.
2. Click through to step 2 ("Build your stash"). The **Threads** tab should be highlighted with a teal ring.
3. Verify **Next** is greyed-out, labelled **Waiting…**, and shows tooltip "Complete the highlighted action to continue."
4. Click the highlighted **Threads** tab. Wizard step is satisfied → **Next** becomes active again.
5. Step 3 ("Browse your patterns"): repeat with the **Patterns** tab.
6. **Back** is never blocked by `requireClick`; only **Next** is gated.

### Terminology lint

1. Run `npm run lint:terminology` → exit 0 with `Terminology lint passed — no forbidden terms found in 15 files.`
2. Temporarily insert "Color code or name" into `manager-app.js` (or any TARGET_FILE) → re-run → exit 1, prints `manager-app.js:<line>` with suggested replacement (`Colour`).
3. Revert the change. Run `npm test -- --runInBand` → `tests/terminologyLint.test.js` is included and passes.
4. Allow-listing: append `// terminology-lint-allow` to a line that legitimately contains a forbidden word (e.g. a meta-reference inside `help-content.js`) → that line is skipped.

### Bulk Add in Creator

1. Open `index.html` (Creator). On the home dashboard, click **File** in the header → confirm **Bulk Add Threads…** appears under Export PDF.
2. Click it → `BulkAddModal` opens (same UI as the Manager). Paste IDs and add to stash → values are reflected in the Stash Manager (round-trip via `StashBridge`).
3. Open a design (any pattern) → repeat. The Design-page File menu also has the entry.
4. ESC closes the modal.

### `?` shortcut discoverability

1. Clear `localStorage["cs_help_hint_dismissed"]`. Reload any page.
2. A small dark pill appears bottom-right: **Press [?] for help** with kbd-styled "?" and an × button.
3. Click the **Press [?] for help** label → Help Centre opens and the banner disappears.
4. Reload → banner does not return (persisted dismissal).
5. Clear the key + reload → banner returns. Click the × this time → banner dismisses without opening Help.
6. Open the Preferences → Tutorials tab → click **Reset all tutorials** → reload → banner returns.

### Restore tutorials (Preferences → Tutorials)

1. Open Preferences from the header (gear/cog). Click the new **Tutorials** tab.
2. Three rows: "Pattern Creator welcome", "Stash Manager welcome", "Stitch Tracker welcome + style picker", each with a **Reset** button.
3. Click each → status message "Reset Pattern Creator welcome." (etc.) appears.
4. Click **Reset all tutorials** at the bottom → resets all three flags **and** the help-hint banner. Status: "All tutorials reset — they'll appear next time you visit each page."
5. Reload each page → confirm the corresponding Welcome wizard fires (and Tracker's style picker after).

---

## 3. Automated tests

`npm test -- --runInBand` runs **547 tests across 46 suites**, including the new:

- `tests/terminologyLint.test.js` — fails the suite if any TARGET_FILE re-introduces "Color", "Inventory", "Organize", or "Favorite".

No existing tests required modification.

---

## 4. Files changed

**New:**
- `scripts/lint-terminology.js` — CLI + module exporting `lintAll`, `scanFile`, `FORBIDDEN`, `TARGET_FILES`.
- `tests/terminologyLint.test.js` — jest wrapper around `lintAll`.
- `docs/test-plans/HELP_AND_ONBOARDING_TEST_PLAN_PHASE3.md` — this document.

**Moved into `docs/test-plans/`** (tidy-up):
- `HALF_STITCH_TEST_PLAN.md`
- `HELP_AND_ONBOARDING_TEST_PLAN.md`
- `HELP_AND_ONBOARDING_TEST_PLAN_PHASE2.md`
- `PROJECT_LIBRARY_ESC_TEST_PLAN.md`
- `STATS_PHASE_D_TEST_PLAN.md`
- `UX_ROUND2_TEST_PLAN.md`

**Modified:**
- `tracker-app.js` — gate `styleOnboardingOpen` behind `WelcomeWizard.shouldShow("tracker")`; chain style picker after Welcome closes; mount `HelpHintBanner`; "Color" → "Colour" in PDF and option labels.
- `onboarding-wizard.js` — `requireClick` step support (state, click listener, disabled Next button); manager steps 2 + 3 mark Threads/Patterns tab as required clicks; new `WelcomeWizard.resetAll()`.
- `home-screen.js` — `ProjectCard` and `MultiProjectDashboard` accept optional `cardExtras` render-prop, rendered under each active project card.
- `project-library.js` — forwards `cardExtras` to `MultiProjectDashboard`.
- `manager-app.js` — removed `showDetailGrid` state + persistence + the entire legacy `pat-grid` block + toggle/banner; replaced with empty-state placeholder; added `cardExtras` callback wiring shopping-list checkbox + missing-thread badge per card; mounted `HelpHintBanner`; "Color" → "Colour" in placeholder.
- `header.js` — added `onBulkAddThreads` prop and File-menu item.
- `creator-main.js` — `bulkAddOpen` state in both `CreatorApp` and `UnifiedApp`; wired `onBulkAddThreads` into both Headers; mount `BulkAddModal` in both surfaces; mount `HelpHintBanner` in `UnifiedApp`.
- `keyboard-utils.js` — added `window.HelpHintBanner` floating pill component with `dismissed()` / `reset()` static helpers.
- `preferences-modal.js` — new `TutorialsPanel` component + 4th tab for restoring per-page or all tutorials.
- `help-content.js` — appended `// terminology-lint-allow` to the glossary line that intentionally references "Inventory" as an anti-pattern.
- `index.html` — bumped `CREATOR_CACHE_KEY` from `babel_creator_v20` → `babel_creator_v21` so the in-memory cached `creator-main.js` is refreshed.
- `package.json` — added `lint:terminology` script.

---

## 5. Recommended next steps

Carry-forward + new ideas surfaced during this pass:

- **Single Welcome+Style flow in Tracker** — merge the generic Welcome and the `StitchingStyleOnboarding` into one wizard rather than two sequential modals.
- **Action-gated Tracker onboarding** — apply the same `requireClick` pattern to the Tracker style picker, so users actively select rather than skip.
- **Per-step accessibility** — focus trap inside the onboarding popover, `aria-live` region announcing step changes, and visible-focus state for the Next/Back buttons.
- **Pre-commit hook for `lint:terminology`** — wire husky (or simple Git hook) so the check runs locally as well as in CI.
- **Auto-detect stale `CREATOR_CACHE_KEY`** — hash `creator/bundle.js` + `creator-main.js` content at build time so the cache key bumps automatically.
- **Smarter HelpHintBanner timing** — only show after ~30 s idle on a first visit, not immediately, to reduce visual noise.
- **Tutorials tab extras** — also list and offer to clear per-pattern view-state preferences (`cs_pview_*`) and the dismissed-hint flag explicitly.
- **Manager card extras polish** — surface stitched-progress percentage on each card alongside the shopping-list pill and missing-thread badge.
- **Bulk Add into Stash tab** — once the Creator gains a dedicated Stash tab, move the Bulk Add entry-point there rather than the File menu.
