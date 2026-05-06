# Welcome+Style as one wizard, Creator requireClick, install-hooks fallback, Husky migration, state schema map, true-idle HelpHintBanner, focus-aware HelpHintBanner, Manager sparkline, Stash donut, Bulk-Add shortcut, view-prefs preview — Test Plan

Phase 5 follow-up to `HELP_AND_ONBOARDING_TEST_PLAN_PHASE4.md`. Covers eleven follow-on items that close the carry-forward list from Phase 4:

1. **Single Welcome+Style as one wizard** — `StitchingStyleOnboarding`'s body is extracted as `StitchingStyleStepBody` and embedded as a `customComponent` step inside the WelcomeWizard. Both `cs_welcome_tracker_done` and `cs_styleOnboardingDone` get marked done together.
2. **More requireClick steps** — the Creator first-visit wizard's "Upload an image" step now requires the user to click the **From image** button on the home dashboard before Next enables.
3. **Hook installer fallback for non-Git installs** — `scripts/install-hooks.js` now exits 0 with a copy-pasteable recovery one-liner when the working tree is not a Git repo.
4. **Husky-based hook bundle** — `husky` added to devDependencies; new `.husky/pre-commit` mirrors the `.githooks/pre-commit` lint script. The installer prefers Husky when available and falls back to `.githooks` otherwise.
5. **Cache-key compatibility map** — `user-prefs.js` now exposes `STATE_SCHEMA_VERSION` + `SCHEMA_BREAKS`; on load, any pending wipes are applied and the version is stamped in `cs_state_schema_version`.
6. **HelpHintBanner true-idle trigger** — replaces the absolute 30 s timer with a true idle countdown: any `keydown` / `mousemove` / `click` / `touchstart` / `scroll` / `wheel` resets it.
7. **Focus-aware HelpHintBanner** — auto-hides while the user is typing in any `input` / `textarea` / `select` / contenteditable; reappears when focus returns elsewhere.
8. **Per-card progress sparkline** — `buildMeta` now precomputes `weeklyStitches[7]`; the Manager card `cardExtras` renders a 7-bar SVG sparkline beside the % badge.
9. **Stash panel wishlist/owned donut** — the home STASH panel renders a 56 px SVG donut showing `owned / (owned + wishlist)`.
10. **Stash panel keyboard shortcut** — pressing **B** anywhere on the home screen (with no input focused & no modifier held) opens Bulk Add Threads. The button label shows the shortcut.
11. **Per-pattern view-prefs preview** — Tutorials tab gains a "Preview" toggle next to the Clear button that lists the actual pattern names mapped from `cs_pview_<id>` keys (with "(deleted)" prefix for missing IDs).

---

## 1. Where users see each change

| Change | User-visible location |
|---|---|
| Single Welcome+Style wizard | `stitch.html` first visit. The wizard now has 3 steps; the third step renders the stitching-style picker inline (no second modal opens). |
| Creator requireClick | `index.html` first visit. The "1. Upload an image" wizard step highlights the **From image** button and the Next button reads "Waiting…" until the user clicks it. |
| Non-Git installer fallback | `npm install` outside a Git repo. The console prints `not inside a Git working tree — skipping hook install` plus a copy-pasteable command (`npx husky` or `git config core.hooksPath .githooks`). |
| Husky-based hook bundle | After `npm install` inside a Git repo. `git config --get core.hooksPath` returns `.husky/_` (Husky managed) when husky is installed; otherwise `.githooks`. `git commit` runs the lint either way. |
| State schema map | Internal — bumping `STATE_SCHEMA_VERSION` in `user-prefs.js` plus adding `SCHEMA_BREAKS[N]` triggers an auto-wipe of matching localStorage entries on next page load. The current version is stored in `cs_state_schema_version`. |
| HelpHintBanner true-idle | Any page in a fresh browser. The pill never appears while the user is actively interacting; it appears after ~30 s of *no* input. |
| HelpHintBanner focus-aware | While the pill is visible, focusing any text input hides it; blurring the input reveals it again. |
| Manager card sparkline | Manager → Patterns tab. Each card with weekly stitching activity now shows a 7-bar mini-bar chart between the % badge and the kitting badge. Tooltip reads "Last 7 days: N stitches". |
| Stash panel donut | `index.html` home view → STASH panel. A circular gauge shows the owned-vs-wishlist ratio (or "–" when neither is set). |
| Bulk-Add B shortcut | Anywhere on the home view. Press **B** → Bulk Add Threads modal opens. The button now shows a `B` keycap. |
| View-prefs preview | Preferences → Tutorials → "Per-pattern view preferences" row. Click **Preview** to expand a scrollable list of pattern names; click **Clear** to delete them. |

---

## 2. Manual QA steps

### Single Welcome+Style wizard

1. Clear `cs_welcome_tracker_done`, `cs_styleOnboardingDone`, `cs_stitchStyle` from localStorage.
2. Reload `stitch.html`. The WelcomeWizard appears with step indicators showing **3 dots** instead of 2.
3. Page through steps 1–2. The wizard chrome (close ×, indicator, Skip tour) is consistent.
4. Step 3 renders the **"How do you usually work through a pattern?"** picker inline — no second modal pops over the wizard.
5. Pick a method → continue through the picker's internal screens to a corner choice → on commit, both `cs_welcome_tracker_done="1"` and `cs_styleOnboardingDone="1"` are set.
6. Reload — neither modal reappears.
7. Repeat the flow but click **Skip tour** on step 3 → the picker is replaced by the standalone modal as a fallback (so users who skip don't lose helpful defaults).
8. After the wizard is done, open the Tracker toolbar → "Stitching style: …" → confirm the standalone `StitchingStyleOnboarding` modal still opens (toolbar reopener is unchanged).

### Creator requireClick

1. Clear `cs_welcome_creator_done`. Reload `index.html`.
2. The wizard advances to step 1 ("Welcome…") — Next button enabled.
3. Click Next → step 2 ("1. Upload an image"). The **From image** button is highlighted with a teal ring; Next reads **Waiting…** and is disabled.
4. Click the **From image** button → file picker opens; Next now enables. Cancel the file picker to stay on this step.
5. Click Next → continues through remaining steps as before.

### Hook installer fallback for non-Git installs

1. In a temporary directory, copy `package.json` + `scripts/install-hooks.js` (do **not** run `git init`).
2. Run `node scripts/install-hooks.js`.
3. Console prints:
   ```
   install-hooks: not inside a Git working tree — skipping hook install.
                To enable hooks later (after `git init`), run:
                git config core.hooksPath .githooks
   ```
   (or `npx husky` when husky is installed).
4. Exit code is **0** so an `npm install` in the same directory does not fail.

### Husky-based hook bundle

1. Ensure husky is installed: `npm install` (it's now a devDependency).
2. Run `node scripts/install-hooks.js`.
3. Console prints `install-hooks: configured Husky (.husky/) for Git hooks` and `git config --get core.hooksPath` returns `.husky/_`.
4. Stage a benign change → `git commit` → lint runs via `.husky/pre-commit`.
5. Add the literal word `Color` somewhere → stage → `git commit` → commit blocked, file:line listed.
6. `git commit --no-verify` still bypasses.
7. Uninstall husky (`npm rm husky`) and re-run `node scripts/install-hooks.js` → it falls back to `.githooks/` and prints `install-hooks: configured Git to use .githooks/ for hooks`. Commits still trigger the same lint.

### Cache-key compatibility map

1. Open DevTools console on any page → `localStorage.getItem("cs_state_schema_version")` returns `"1"`.
2. To simulate a future break, in `user-prefs.js` set `STATE_SCHEMA_VERSION = 2` and `SCHEMA_BREAKS[2] = { wipe: ['cs_pview_*'] }`. Reload the page.
3. All `cs_pview_*` entries are removed from localStorage; `cs_state_schema_version` is now `"2"`.
4. Reload again → no further wipes (idempotent).
5. Revert the diff. `cs_state_schema_version` stays at `"2"` (a downgrade does not re-run earlier wipes).

### HelpHintBanner true-idle trigger

1. Clear `cs_help_hint_dismissed`. Reload any page.
2. Move the mouse, type, or scroll continuously — the pill **never appears** while you're active.
3. Stop interacting. After ~30 s of true idleness, the pill fades in.
4. Touching the keyboard/mouse before 30 s elapses resets the countdown.
5. Click the pill → dismissed and persisted; never returns until reset.

### HelpHintBanner focus-aware

1. With the pill visible (per the previous step), click into any text input on the page.
2. The pill disappears immediately.
3. Click outside the input (e.g. the page background) → the pill reappears.
4. Repeat with `<textarea>` and a contenteditable element — same behaviour.

### Manager card sparkline

1. Track at least one session per day across the past 2–3 days on a project.
2. Open `manager.html` → Patterns tab. The matching card now shows a small 7-bar SVG between the % badge and the kitting badge.
3. Hover the sparkline → tooltip reads e.g. "Last 7 days: 432 stitches".
4. Bars represent days oldest → newest, rightmost = today. Days with zero stitches show as low grey ticks.
5. Patterns with no recent activity (or no linked project) show no sparkline.

### Stash panel donut

1. Open `index.html`. The STASH panel shows a circular gauge.
2. With no threads owned and none on wishlist → donut is grey, centre reads "–".
3. Add some owned threads via Bulk Add → donut fills teal proportionally; centre reads e.g. "100%".
4. In the Stash Manager, mark a few unowned threads as `tobuy` → return to the home view. The donut now shows the proportion of owned vs (owned + wishlist).
5. Hover the SVG → `aria-label` reads "N threads owned, M on wishlist".

### Bulk-Add B shortcut

1. Open `index.html`. Press **B** (no modifier) → Bulk Add modal opens. Close it.
2. Focus a text input (e.g. a future search box) → press **B** → modal does **not** open and the letter is typed normally.
3. Press **Ctrl+B** / **Cmd+B** → the shortcut is ignored (browser may use it for bold).
4. The Bulk Add button on the STASH panel shows a `B` keycap badge as a discoverability hint.

### View-prefs preview

1. Open a few patterns to populate `cs_pview_*` keys.
2. Open Preferences → Tutorials → row "Per-pattern view preferences (N saved)" now has a **Preview** button next to Clear.
3. Click Preview → an expandable scrollable list shows each pattern's name (or "(deleted) proj_…" for orphan keys whose project no longer exists).
4. Click **Clear** → keys are deleted, the count drops to 0, the preview hides automatically.
5. Hover any list entry → tooltip shows the raw `proj_…` ID.

---

## 3. Automated tests

`npm test -- --runInBand` runs **547 tests across 46 suites** (unchanged from Phase 4):

```
Test Suites: 46 passed, 46 total
Tests:       547 passed, 547 total
```

Lint:

- `npm run lint:terminology` → exits 0, `Terminology lint passed — no forbidden terms found in 15 files.`
- The pre-commit hook (Husky or `.githooks` fallback) delegates to the same script.

No existing tests required modification.

---

## 4. Files changed

**New:**
- `.husky/pre-commit` — Husky-managed pre-commit hook running the terminology lint.
- `docs/test-plans/HELP_AND_ONBOARDING_TEST_PLAN_PHASE5.md` — this document.

**Modified:**
- `onboarding-wizard.js` — supports `extraSteps` prop and `customComponent` step type so callers can append page-specific steps without mutating shared `STEPS`. Adds `requireClick` + `target` on the Creator "Upload an image" step.
- `home-screen.js` — added `data-onboard="home-from-image"` to the From image button (anchor for the Creator wizard requireClick); added `data-onboard="home-bulk-add"` to the Bulk Add button; added `B` keycap label and a `useEffect` global keydown listener that opens Bulk Add (skipped while in inputs / with modifiers); replaced the STASH panel content block with a 56 px SVG donut + owned/wishlist breakdown.
- `tracker-app.js` — extracted `StitchingStyleStepBody` (the picker UI, no modal chrome) and refactored `StitchingStyleOnboarding` to wrap it; the WelcomeWizard mount now passes `extraSteps={[{ customComponent: StitchingStyleStepBody, onCommit: … }]}` instead of `lastStepLabel`/`onLastStep` chaining.
- `keyboard-utils.js` — replaced `HINT_DELAY_MS` setTimeout with a true-idle countdown reset by any input event; added a `focusin`/`focusout` listener that hides the banner while typing.
- `preferences-modal.js` — Tutorials tab adds a Preview/Hide toggle and inline scrollable list of per-pattern names mapped from `cs_pview_<id>` keys via `ProjectStorage.listProjects`. Preview state resets on Clear.
- `project-storage.js` — `buildMeta` now emits `weeklyStitches` (7-element array, oldest → newest, ending today) so per-card sparklines have a precomputed source.
- `manager-app.js` — `cardExtras` looks up the linked project in `storedProjects` to pull `totalStitches`/`completedStitches`/`weeklyStitches`; renders a 7-bar SVG sparkline when total weekly stitches > 0.
- `user-prefs.js` — added `STATE_SCHEMA_VERSION`, `SCHEMA_BREAKS`, `migrateState()` (auto-runs on load), and exposed `listPatternStateIds()` on `window.UserPrefs`.
- `scripts/install-hooks.js` — prefers Husky (`npx --no-install husky`) when present, falls back to `.githooks`, and prints a copy-pasteable recovery one-liner when run outside a Git working tree (always exits 0).
- `package.json` — added `husky@^9.1.7` to devDependencies.

---

## 5. Validation summary

| Check | Result |
|---|---|
| `node build-creator-bundle.js` | bundle 668,792 bytes, cache key unchanged at `babel_creator_cd4fdbd450` (no creator/* edits in this phase) |
| `npm test -- --runInBand` | **547 passed / 46 suites** |
| `npm run lint:terminology` | clean |
| `node scripts/install-hooks.js` | falls back to `.githooks` (until husky is installed via `npm install`) |
