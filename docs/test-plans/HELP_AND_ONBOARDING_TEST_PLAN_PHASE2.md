# Bulk Add visibility, ? shortcut, Reset onboarding, Aggressive Manager grid, Glossary, Targeted onboarding — Test Plan

Follow-up pass to `HELP_AND_ONBOARDING_TEST_PLAN.md`. Covers seven items:

1. **Manager bulk-add visibility fix** — load `creator/BulkAddModal.js` in `manager.html`
2. **Global `?` shortcut** opens Help Centre
3. **Reset onboarding** button inside Help Centre
4. **Aggressive Manager grid replacement** — legacy `pat-grid` collapsed by default
5. **Glossary tab** in Help Centre + new `TERMINOLOGY.md`
6. **Generic Tracker welcome** auto-fires before `StitchingStyleOnboarding`
7. **Targeted onboarding** — wizard steps can anchor to DOM elements with highlight ring

---

## 1. Where users see each change

| Change | User-visible location |
|---|---|
| Bulk Add (Manager) | Manager → Threads tab. The **+ Bulk Add** button next to the brand filter is now visible (was dead because `window.BulkAddModal` was never loaded). Clicking opens the same paste/kit modal used in the Creator. |
| Global `?` shortcut | Press `?` anywhere on Creator/Tracker/Manager (when focus is not in a text field) → Help Centre opens. Listed in the Keyboard tab. |
| Reset onboarding | Open Help Centre → footer shows **Show welcome tour again** button. Click → Help closes, Welcome wizard reopens for that page. |
| Aggressive Manager grid | Manager → Patterns tab. Legacy detail grid is **hidden by default**. New "Show detailed grid" / "Hide detailed grid" toggle. State persists in `localStorage["mgr_show_detail_grid"]`. |
| Glossary tab in Help | Help Centre → new **📖 Glossary** sidebar tab (last in the list). 4 sections: Core concepts, Save vs. Download vs. Export, Surface names, Naming conventions. |
| `TERMINOLOGY.md` | Repo root. Same definitions as the Glossary tab, plus an "Anti-patterns" reference for contributors. |
| Tracker generic welcome | First visit to `stitch.html` → 2-step Welcome wizard appears alongside the existing `StitchingStyleOnboarding` (style picker shows after dismissal). |
| Targeted onboarding | Manager wizard step 2 ("Build your stash") highlights the **Threads** tab with a teal ring. Step 3 ("Browse your patterns") highlights the **Patterns** tab. Backdrop dims with a cut-out hole around the target. |

---

## 2. Manual QA steps

### Manager Bulk Add

1. Open `manager.html` → Threads tab.
2. Verify **+ Bulk Add** button appears next to the brand filter (top-right area of the threads bar).
3. Click → Bulk Add modal opens with two tabs: **Paste list** and **From a kit**.
4. Paste e.g. `310 550 666` → modal shows recognised threads as green chips and any unknowns in red.
5. Click **Add to stash** → owned counts increment in the Threads list.
6. Press **ESC** → modal closes.
7. Repeat the steps from Anchor brand: switch brand picker to Anchor, paste Anchor IDs, verify recognition.

### Global `?` shortcut

1. On any page (Creator, Tracker, Manager), with focus NOT in a text field, press `?`.
2. Help Centre opens. Default tab matches the current page.
3. Click into a text input (e.g. search field) and press `?` → Help does NOT open (the `?` types into the field).
4. Press Ctrl+? → Help does NOT open.
5. From within an open modal, press `?` → Help opens on top of it. Press ESC → only Help closes.
6. Tracker: pressing `?` previously opened the **Shortcuts** modal. Now it opens **Help** with default tab "Stitch Tracker", which contains shortcuts in the Keyboard tab.

### Reset onboarding from Help Centre

1. On Manager: open Help Centre → footer reads "Need a refresher? **Show welcome tour again**".
2. Click → Help closes, Welcome wizard for "manager" reappears at step 1.
3. Step through and dismiss → flag set, won't show on next reload.
4. Repeat from Creator and Tracker pages — each shows their own page's wizard.

### Aggressive Manager grid replacement

1. Manager → Patterns tab.
2. Verify the unified "Your Projects" cards are visible at the top.
3. Below the shopping-list selection bar, verify the **Show detailed grid** button (legacy grid is hidden).
4. A grey dashed banner reads: "Use the cards above to open patterns. Tap **Show detailed grid** when you need per-pattern checkboxes for shopping-list selection."
5. Click **Show detailed grid** → the legacy `pat-grid` appears (cards with checkboxes, status pills, etc.). Button text becomes **Hide detailed grid**.
6. Refresh the page → toggle state persists (in `localStorage["mgr_show_detail_grid"]`).
7. With grid hidden, the Pattern Detail right-panel is still reachable when a card in the unified view is opened (`onOpenManagerOnly` callback).

### Glossary tab + TERMINOLOGY.md

1. Open Help Centre → click **📖 Glossary** in the sidebar.
2. Verify 4 sections appear: Core concepts (Project, Pattern, Stash…), Save vs. Download vs. Export, Surface names, Naming conventions.
3. Type "stash" in the search box → at least one Glossary section appears in the flat results, alongside the existing Stash Manager topic.
4. Open `TERMINOLOGY.md` at the repo root → same definitions plus a contributor-facing Anti-patterns table.

### Tracker generic welcome

1. In DevTools: `localStorage.removeItem("cs_welcome_tracker_done"); localStorage.removeItem("cs_styleOnboardingDone"); localStorage.removeItem("cs_stitchStyle");` then reload `stitch.html`.
2. Two onboarding modals appear: the new generic 2-step Welcome wizard (top of stack) AND the existing StitchingStyleOnboarding behind it.
3. Dismiss the Welcome wizard (Get started or ESC) → the StitchingStyleOnboarding becomes interactive.
4. After both are dismissed, neither reappears on next reload.

### Targeted onboarding

1. Reset Manager onboarding: `localStorage.removeItem("cs_welcome_manager_done")` and reload `manager.html`.
2. Step 1 is centred (no target).
3. Click **Next** → Step 2 ("Build your stash") shifts to a popover positioned BELOW the Threads tab, with a teal ring around the tab and the rest of the page dimmed.
4. Resize the window — popover and ring track the tab position.
5. Click **Next** → Step 3 ("Browse your patterns") highlights the Patterns tab.
6. Click **Next** → Step 4 returns to centred (no target).
7. Click **Get started** → wizard closes, flag persists.

---

## 3. Automated tests

`npm test -- --runInBand` — **546 tests, 45 suites, all passing.**

| File | Coverage |
|---|---|
| `tests/helpContent.test.js` | HELP_TOPICS shape; Glossary tab presence; Save/Stash/Project/Pattern terms in glossary |
| `tests/helpShortcut.test.js` (new) | Global `?` dispatches `cs:openHelp`; suppressed when focus in text input or modifier held |
| `tests/onboardingWizard.test.js` | shouldShow/markDone/reset gating across pages |
| `tests/projectLibrary.test.js` | Existing — still passing |
| `tests/useEscape.test.js` | Existing — still passing |
| `tests/e2e/manager-touch.spec.js` | Updated to expect "Thread Stash" label |

---

## 4. Files changed

**New**
- `TERMINOLOGY.md` — repo-root glossary
- `tests/helpShortcut.test.js` — global `?` dispatcher tests

**Modified**
- `manager.html` — load `creator/BulkAddModal.js` directly
- `keyboard-utils.js` — install global `?` listener that dispatches `cs:openHelp`
- `help-content.js` — Glossary tab; "Show welcome tour again" footer; dispatches `cs:showWelcome`
- `onboarding-wizard.js` — DOM-anchored popovers (target/placement) with highlight ring
- `manager-app.js` — `cs:openHelp` listener, `cs:showWelcome` listener; `data-onboard` attributes on tabs; `showDetailGrid` toggle (legacy pat-grid hidden by default)
- `tracker-app.js` — `cs:openHelp` listener; `cs:showWelcome` listener; generic Tracker WelcomeWizard mount; `?` key now opens Help (was Shortcuts modal)
- `creator-main.js` — `cs:openHelp` listener (home + design via `cs:openHelpDesign` bridge); `cs:showWelcome` listener
- `tests/helpContent.test.js` — added Glossary assertion

**No bundle/cache changes**: no `creator/*.js` files were touched this round. `creator/bundle.js` and `CREATOR_CACHE_KEY` (still `babel_creator_v20`) are unchanged.

---

## 5. Recommended next steps

- **Aggressive Manager grid Phase 2**: move shopping-list checkboxes and missing-thread badges directly onto the `ProjectLibrary` cards in manager mode, so the legacy grid can be permanently removed (currently `pat-grid` is opt-in).
- **Tracker first-visit ordering**: gate `StitchingStyleOnboarding` behind the new generic Welcome flag so they appear sequentially rather than stacked.
- **Sequence onboarding with action requirement**: e.g. step 2 ("Build your stash") requires the user to actually click the Threads tab before allowing **Next**. Currently steps progress freely.
- **Lint user-facing strings against TERMINOLOGY.md**: write a small script that greps for forbidden words ("Inventory" → "Stash") and runs in CI.
- **Wire Bulk Add into the Creator's Edit menu** (the modal exists but is reached via a less prominent path).
- **`?` shortcut discoverability**: add a small "press ? for help" hint to first-load empty states, dismissible after the first use.
- **Reset *all* onboarding** from Preferences → "Restore tutorials" — for users who want to replay every wizard.
