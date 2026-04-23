# Tracker Welcome+Style merge, action-gated style picker, onboarding a11y, pre-commit hook, auto-bump cache key, smarter HelpHintBanner, Tutorials extras, Manager card progress %, Creator Stash panel — Test Plan

Phase 4 follow-up to `HELP_AND_ONBOARDING_TEST_PLAN_PHASE3.md`. Covers nine items focused on streamlining clicks and tightening UX:

1. **Single Welcome+Style flow in Tracker** — final WelcomeWizard step transitions seamlessly into the `StitchingStyleOnboarding` rather than closing first
2. **Action-gated Tracker style picker** — "Skip for now" removed from the first style screen; users must choose a method to continue
3. **Onboarding accessibility** — focus trap inside the popover, `aria-live` region announcing each step, visible focus rings, dialog ARIA roles
4. **Pre-commit hook for lint:terminology** — `.githooks/pre-commit` + `npm install` auto-configures Git to use it
5. **Auto-bump `CREATOR_CACHE_KEY`** — `build-creator-bundle.js` now hashes `bundle.js` + `creator-main.js` and writes the result back into `index.html`
6. **HelpHintBanner timing** — pill stays hidden for ~30 s after page load, so it doesn't intrude on first impressions
7. **Tutorials tab extras** — explicit "Help-hint banner" reset + "Per-pattern view preferences" clear (with live `cs_pview_*` count)
8. **Manager card progress %** — each `ProjectLibrary` card now shows a stitched-progress badge alongside the shopping-list pill and missing-thread badge
9. **Creator Stash panel** — new STASH panel on the home dashboard with thread/brand counts + "+ Bulk Add Threads" + "Open Stash Manager →"; the File-menu Bulk Add entry has been removed

---

## 1. Where users see each change

| Change | User-visible location |
|---|---|
| Tracker Welcome+Style merge | `stitch.html` first visit. The WelcomeWizard's last step button reads **Pick a stitching style →**. Click it → wizard closes & the style picker opens immediately, with no visible gap. |
| Action-gated style picker | Tracker style picker, screen 1. The "Skip for now" link is gone; users must click "One section at a time", "One colour at a time", or "I don't have a fixed method". |
| Onboarding a11y | Any WelcomeWizard popover. Tab cycles inside the popover, focus is auto-set to the primary action on each step, the title + body announce on step change, focused buttons get a teal focus ring. |
| Pre-commit hook | After `npm install` (or `node scripts/install-hooks.js`), `git commit` runs the terminology lint and blocks if it fails. To bypass once: `git commit --no-verify`. |
| Auto-bump cache key | After `node build-creator-bundle.js`, the build script logs `index.html CREATOR_CACHE_KEY → babel_creator_<hash>`. Old cached compiled JS in users' browsers is invalidated automatically. |
| Help-hint timing | Open any page in a fresh browser. The "Press [?] for help" pill is hidden for the first 30 s, then fades in. Reload before 30 s elapses → never shown that visit. |
| Tutorials tab extras | Preferences → **Tutorials** tab. Two new rows: "Help-hint banner (visible/dismissed)" with Reset button (disabled when not dismissed) and "Per-pattern view preferences (N saved)" with Clear button (disabled when N=0). |
| Manager card progress | Manager → Patterns tab. Each card now has a third badge: "**N% stitched**" (grey/blue/green based on progress). Tooltip shows raw stitch counts. |
| Creator Stash panel | `index.html` home view. New **STASH** panel between the stash alert and SYNC: thread count + brand count + "+ Bulk Add Threads" + "Open Stash Manager →". |
| Header File menu | The "Bulk Add Threads…" entry has been removed from the Header File menu in both Creator surfaces. |

---

## 2. Manual QA steps

### Tracker Welcome+Style merge

1. DevTools → Application → Local Storage. Delete `cs_welcome_tracker_done`, `cs_styleOnboardingDone`, `cs_stitchStyle`.
2. Reload `stitch.html`. The generic Welcome wizard appears (no style picker stacked behind it).
3. Page through the steps. The **last step button reads "Pick a stitching style →"**.
4. Click it → wizard closes and `StitchingStyleOnboarding` opens immediately (no flicker, no second click required).
5. Pick a style → both flags persist; reload → neither modal returns.
6. Repeat with the **Skip tour** button instead of stepping through. The style picker still opens (skip-chains).

### Action-gated Tracker style picker

1. With `cs_styleOnboardingDone` cleared, open the style picker.
2. Screen 1: confirm there is **no "Skip for now"** link.
3. The only way forward is to click one of the three method buttons. Each routes to a follow-up screen which already requires an active selection.

### Onboarding accessibility

1. Open a wizard (e.g. clear `cs_welcome_creator_done` and reload `index.html`).
2. Tab through the controls. Focus stays inside the popover (Shift+Tab from Skip tour wraps to Next; Tab from Next wraps to close ×).
3. Each focused control shows a teal outline.
4. Open a screen reader (NVDA/VoiceOver). On step change, the title and body are announced.
5. The popover element exposes `role="dialog"`, `aria-modal="true"`, and `aria-labelledby` pointing at the step title.
6. Initial focus on each step lands on the **Next**/**Get started**/**Pick a stitching style →** button.

### Pre-commit hook

1. Fresh clone (or run `node scripts/install-hooks.js`).
2. `git config --get core.hooksPath` → prints `.githooks`.
3. Stage a benign change → `git commit -m "test"` → commit succeeds; lint is invoked.
4. Edit any TARGET_FILE and add the literal word `Color` (capital C) → stage → `git commit` → commit is **blocked** with a lint error and the file:line listed.
5. Revert. Confirm a `git commit --no-verify` still works as an escape hatch.
6. On Windows, the hook runs via the system `sh` (Git Bash). On macOS/Linux the script is `chmod 0755`d by `install-hooks.js`.

### Auto-bump CREATOR_CACHE_KEY

1. Note the current `CREATOR_CACHE_KEY` value in `index.html`.
2. Make any tiny edit to a `creator/*.js` source (e.g. add a comment) and run `node build-creator-bundle.js`.
3. Observe console: `index.html CREATOR_CACHE_KEY → babel_creator_<new10char>`. The hash differs from before.
4. Reload the Creator in a browser → previously-cached compiled JS is replaced (`localStorage` key under the new name).
5. Re-run `node build-creator-bundle.js` without further edits → log says `unchanged` and the hash remains stable.

### HelpHintBanner timing

1. Clear `localStorage["cs_help_hint_dismissed"]`. Reload any page.
2. The pill is **not visible** for ~30 s.
3. Wait ~30 s — the pill fades in bottom-right.
4. Reload before the 30 s elapses → the pill is again hidden until 30 s pass.
5. Click the pill (or ×) once it appears → it dismisses & no longer returns.
6. Use Preferences → Tutorials → Reset all → wait 30 s after reload → returns.

### Tutorials tab extras

1. Open Preferences → Tutorials.
2. Two new rows present:
   - **Help-hint banner** with a sub-label `(visible)` or `(dismissed)`. Reset is disabled when status is `(visible)`.
   - **Per-pattern view preferences** with `(N saved)`. Clear is disabled when `N=0`.
3. Dismiss the help hint, reopen Preferences → Tutorials → row shows `(dismissed)` and Reset enables. Click → status confirms reset; reload → banner returns after 30 s.
4. Open a few patterns to populate `cs_pview_*` keys. Reopen Tutorials → count increments. Click Clear → keys deleted, count → 0.
5. **Reset all tutorials** still resets all welcome flags + the help hint banner together.

### Manager card progress %

1. Open `manager.html` → Patterns tab. Verify each card has the new badge:
   - **0%–99% stitched** in blue,
   - **100% stitched** in green,
   - **0% stitched** in grey,
   - hidden if the pattern has no `totalStitches`.
2. Hover the badge → tooltip reads e.g. "1,234 of 5,000 stitches".
3. Track some stitches in the Tracker → return to Manager → percentage updates after the next pattern sync.

### Creator Stash panel

1. Open `index.html` (Creator home).
2. Below the existing stash alert (if any) and above the Sync panel, a new **STASH** panel renders.
3. It shows total owned thread count + brand count.
4. Click **+ Bulk Add Threads** → `BulkAddModal` opens. Add threads → modal closes → counts update on next reload.
5. Click **Open Stash Manager →** → navigates to `manager.html`.
6. Open the Header → **File** menu. Confirm there is **no "Bulk Add Threads…"** entry there.

---

## 3. Automated tests

`npm test -- --runInBand` runs **547 tests across 46 suites** (unchanged from Phase 3). Lint:

- `npm run lint:terminology` → exits 0 with `Terminology lint passed — no forbidden terms found in 15 files.`
- The pre-commit hook delegates to the same script.

No existing tests required modification.

---

## 4. Files changed

**New:**
- `.githooks/pre-commit` — Bash hook that runs the terminology lint on staged JS/MD/HTML files.
- `scripts/install-hooks.js` — Idempotent script that runs at `npm install` (via the `prepare` script) to set `core.hooksPath = .githooks`.
- `docs/test-plans/HELP_AND_ONBOARDING_TEST_PLAN_PHASE4.md` — this document.

**Modified:**
- `onboarding-wizard.js` — added focus trap, ARIA dialog/labelledby, `aria-live` step region, focus-visible outline injection, `lastStepLabel` + `onLastStep` props, `data-ob-primary` attribute for initial focus.
- `tracker-app.js` — passes `lastStepLabel="Pick a stitching style →"` and `onLastStep={…}` to WelcomeWizard so the flows merge; removed "Skip for now" from `StitchingStyleOnboarding` screen 1.
- `keyboard-utils.js` — `HelpHintBanner` now starts hidden and fades in after `HINT_DELAY_MS` (30 s).
- `preferences-modal.js` — `TutorialsPanel` adds "Help-hint banner" and "Per-pattern view preferences" rows with live status + Clear/Reset buttons.
- `manager-app.js` — `cardExtras` callback computes & renders the **N% stitched** badge using `pat.totalStitches` / `pat.completedStitches`.
- `home-screen.js` — `HomeScreen` accepts `onBulkAddThreads`; new STASH panel between stash alert and SYNC with thread/brand counts + Bulk Add + Open Stash Manager actions.
- `creator-main.js` — passes `onBulkAddThreads` to HomeScreen instead of Header; removed the unused `bulkAddOpen` state and modal mount in `CreatorApp`.
- `header.js` — removed the "Bulk Add Threads…" item from the File-menu dropdown (replaced by a comment noting the relocation).
- `build-creator-bundle.js` — auto-computes a SHA-256 hash of `bundle.js` + `creator-main.js` and rewrites `var CREATOR_CACHE_KEY` in `index.html`.
- `package.json` — added `prepare` script (auto-installs Git hooks) and `build:creator` shortcut.
- `index.html` — `CREATOR_CACHE_KEY` now generated as `babel_creator_<hash>` (no manual bumps required).

---

## 5. Recommended next steps

Carry-forward + new ideas surfaced during this pass:

- **Single Welcome+Style as one wizard** — the current implementation makes the transition seamless but they remain two separate components. Refactor `StitchingStyleOnboarding` into a regular WelcomeWizard `customComponent` step so it shares a11y, indicators, and Back/Next chrome.
- **More requireClick steps** — apply to the Creator first-visit wizard (e.g. require the user to click "Open image…" before advancing).
- **Hook installer fallback for non-Git installs** — when running outside a Git repo, surface a one-liner the user can copy.
- **Husky-based hook bundle** — if more hooks are added, switch to Husky for shared hook management.
- **Cache-key compatibility map** — if `creator-main.js` ever has a breaking change to the persisted state, add a guard that wipes related localStorage entries when the cache key changes.
- **HelpHintBanner trigger on idle** — instead of an absolute 30 s timer, listen for true idle (no input for 30 s) before showing.
- **Focus-aware HelpHintBanner** — auto-hide while the user is typing in any input.
- **Per-card progress sparkline** — extend the Manager card extras with a tiny weekly-progress sparkline next to the % badge.
- **Stash panel: wishlist/owned ratio** — add a small donut showing what fraction of a project's threads are already owned.
- **Stash panel keyboard shortcut** — bind `b` (after a brief mod-key) to open Bulk Add from anywhere on home.
- **Per-pattern view-prefs preview** — in the Tutorials tab, list the actual pattern names beside the count so users know what they're clearing.
