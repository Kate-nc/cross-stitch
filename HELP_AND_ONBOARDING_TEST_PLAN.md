# Help Centre, Onboarding & ESC Polish — Test Plan

This plan covers four follow-up changes to the UX consolidation work that
shipped with `PROJECT_LIBRARY_ESC_TEST_PLAN.md`:

1. **T2.10 — Tabbed/searchable Help Centre** (`help-content.js`)
2. **Onboarding parity** — first-visit Welcome wizard for Creator + Manager
   (`onboarding-wizard.js`)
3. **Manager grid soft-enhance** — clarified roles between unified library and
   detailed grid view
4. **`useEscape` adoption in Creator + Stats modals**
5. **Terminology sweep** — "Inventory" → "Stash" in user-facing labels

---

## 1. Where users see each change

| Change | User-visible location |
|---|---|
| Help Centre (tabs + search) | Click **Help** in any header (Creator, Tracker, Manager) — the modal now shows a left sidebar with 5 tabs (Pattern Creator, Stitch Tracker, Stash Manager, Saving & Backup, Keyboard) and a search box at the top. Default tab matches the current page. |
| Welcome wizard (Creator) | First visit to `index.html` (Creator home screen). Shows a 4-step intro. Skip/Get-started persists `cs_welcome_creator_done` in localStorage. |
| Welcome wizard (Manager) | First visit to `manager.html`. Shows a 4-step intro. Persists `cs_welcome_manager_done`. |
| Tracker — generic welcome | (Optional, defined but not auto-shown — Tracker keeps its existing `StitchingStyleOnboarding`.) |
| Manager grid clarification | Patterns tab: above the detail grid there's now a small heading "Pattern details & shopping list" with a hint about ticking patterns for the shopping list, separating it from the unified "Your Projects" cards above. |
| ESC closes Creator modals | Open the Creator's **Convert Palette**, **Bulk Add Threads**, or **Substitute From Stash** modals — pressing ESC now closes them via the shared `useEscape` stack hook. |
| ESC closes Creator context menu | Right-click the canvas to open the context menu, press ESC — closes via the shared stack hook. |
| ESC closes Stats modals | Open Stats → Customise / Share Card / (third stats modal). ESC closes each via `useEscape` (with legacy `useEffect` fallback retained). |
| Terminology — Stash | Manager: tab labelled **Thread Stash** (was "Thread Inventory"). Detail panel header **Stash** (was "Inventory"). Confirm dialog text says "Remove from your stash?" / "Remove from stash" button label. |

---

## 2. Manual QA steps

### Help Centre

1. From Creator home, click **Help** → modal opens with sidebar tabs. The
   "Pattern Creator" tab is active by default.
2. Click each tab — content updates, no console errors.
3. Type "backup" into the search box → side-by-side layout collapses into a
   flat list of matching sections across all topics; each result shows its
   parent topic label.
4. Clear the search → tabbed layout returns.
5. Press **ESC** → modal closes (and only this modal).
6. Repeat from Manager (`manager.html` → Help). Default tab should be
   "Stash Manager".
7. Repeat from Tracker (`stitch.html` → Help). Default tab should be
   "Stitch Tracker".
8. With the Help modal open on top of any other modal stack, press ESC →
   only the Help modal closes; underlying modal remains.

### Welcome wizard (first-visit onboarding)

1. In DevTools, run `localStorage.removeItem('cs_welcome_creator_done')` and
   reload `index.html` → Welcome wizard appears with step 1/4.
2. Click **Next** through all 4 steps. Final button reads "Get started".
   Click it → wizard closes; `localStorage.cs_welcome_creator_done === '1'`.
3. Reload — wizard does NOT reappear.
4. Repeat for Manager: clear `cs_welcome_manager_done`, reload `manager.html`
   → wizard appears with the manager script.
5. From any step, press **ESC** or click **Skip tour** → wizard closes and
   the flag is set so it does not return.
6. From any step, click the X close button → same as ESC.
7. Click outside the modal (overlay) → closes and persists.

### Manager grid clarification

1. Go to Manager → Patterns tab.
2. Verify the unified "Your Projects" panel sits above with the existing
   subtitle "Linked Creator/Tracker projects + Stash Manager-only entries".
3. Below the shopping-list selection bar, verify the new heading
   "Pattern details & shopping list" with the hint
   "Tick a pattern to add its missing threads to the shopping list".
4. Confirm the existing pattern cards still render and behave as before
   (selection checkboxes, Edit/Delete, Pattern detail panel).

### ESC adoption

1. Creator → open **Edit menu → Convert palette to Anchor (or vice versa)**
   → press ESC → modal closes.
2. Creator → open **Edit menu → Bulk add threads** → press ESC → modal closes.
3. Creator → with Magic Wand, open **Substitute from stash** modal → press
   ESC → modal closes.
4. Creator → right-click on canvas → context menu opens → press ESC →
   menu closes (clicking outside also still works).
5. Stats page → open **Customise** modal → ESC closes it.
6. Stats page → open **Share Card** modal → ESC closes it.
7. Stats showcase → open **Share** modal → ESC closes it.
8. With ANY of the above modals open and an underlying Help/Settings modal
   below, ESC should close only the topmost modal (stack behaviour).

### Terminology — Stash

1. Manager → top tabs read **Thread Stash** | **Pattern Library**.
2. Click a thread row → right-side detail panel header reads **Stash**
   (with the existing icon and stats).
3. In the detail panel, click **Remove from stash** → confirm dialog says
   "Remove [DMC|Anchor] [id] from your stash?".

---

## 3. Automated tests

All run via `npm test -- --runInBand`.

| File | Coverage |
|---|---|
| `tests/helpContent.test.js` | HELP_TOPICS structure (id, label, icon, sections), unique ids, expected tabs exist, `HelpCentre` is a function. |
| `tests/onboardingWizard.test.js` | `shouldShow` gating across all 3 pages, `markDone` / `reset` flag handling, unknown-page fallback, STEPS shape. |
| `tests/projectLibrary.test.js` (existing) | Still passing. |
| `tests/useEscape.test.js` (existing) | Still passing. |
| `tests/e2e/manager-touch.spec.js` | Updated to expect "Thread Stash" tab label. |

**Current totals:** 541 tests across 44 suites. Previously 529.

---

## 4. Files changed

- `help-content.js` (new) — Help Centre content + tabbed renderer
- `onboarding-wizard.js` (new) — Welcome wizard component + helpers
- `modals.js` — `SharedModals.Help` delegates to `window.HelpCentre`
- `creator-main.js` — passes `defaultTab="creator"` to Help; mounts Welcome wizard on home
- `manager-app.js` — passes `defaultTab="manager"` to Help; mounts Welcome wizard; pattern-grid heading; "Stash" terminology
- `tracker-app.js` — passes `defaultTab="tracker"` to Help
- `index.html`, `manager.html`, `stitch.html` — load `help-content.js` and `onboarding-wizard.js`; `CREATOR_CACHE_KEY` bumped to `babel_creator_v20`
- `creator/ConvertPaletteModal.js`, `creator/BulkAddModal.js`, `creator/SubstituteFromStashModal.js`, `creator/ContextMenu.js` — adopt `window.useEscape`
- `stats-page.js`, `stats-showcase.js` — adopt `window.useEscape` (with legacy fallback)
- `creator/bundle.js` — regenerated (668792 bytes)
- `tests/helpContent.test.js`, `tests/onboardingWizard.test.js` — new
- `tests/e2e/manager-touch.spec.js` — updated label assertion

---

## 5. Recommended next steps

These are deferred follow-ups:

- **Bind `?` shortcut to open Help** globally (when focus not in a text
  field). The Help Centre already lists this in the Keyboard tab.
- **Reset onboarding from Help menu**: add a "Show welcome tour again"
  button inside `HelpCentre` that calls `WelcomeWizard.reset(currentPage)`
  and relaunches it.
- **Aggressive Manager grid replacement**: move shopping-list selection,
  pattern detail and missing-thread badges directly onto `ProjectLibrary`
  cards (manager mode) and hide the legacy `pat-grid` behind a toggle.
  Currently the two views co-exist as a non-breaking bridge.
- **Codify glossary**: create `TERMINOLOGY.md` with Project / Pattern /
  Save / Download / Stash definitions and lint-check user-facing strings.
- **Tracker generic welcome**: decide whether to auto-fire the new generic
  Tracker welcome before the existing `StitchingStyleOnboarding` (currently
  the steps exist but are not auto-mounted to avoid double-onboarding).
- **Targeted onboarding triggers**: anchor wizard steps to specific DOM
  elements (with arrows/highlights) rather than centred modals.
