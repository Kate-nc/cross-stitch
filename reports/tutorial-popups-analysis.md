# Pop-up tutorials: why they feel persistent and janky

*October 2026 — analysis only; no tutorial behaviour has been changed yet.*

There are three onboarding systems, built at different times, that don't know about each other:

| System | File | Where | Remembered in |
|---|---|---|---|
| Welcome walkthroughs | [onboarding-wizard.js](../onboarding-wizard.js) | Creator, Tracker, Stash Manager | `localStorage["cs_welcome_<page>_done"]` |
| Stitching-style picker | `StitchingStyleOnboarding` in [tracker-app.js](../tracker-app.js) | Tracker | `localStorage["cs_styleOnboardingDone"]` |
| Coachmarks | [coaching.js](../coaching.js) | Creator (2), Tracker (2) | `UserPrefs["onboarding.coached.<id>"]` |

(The "Press ? for help" pill in [keyboard-utils.js](../keyboard-utils.js) is well behaved: it waits for 30 s of idleness and stays dismissed.)

Most of the "persistent" feeling comes from the coachmarks. Most of the "janky" feeling comes from overlays that block the thing they ask you to do, stack on top of each other, or are positioned with guessed sizes.

---

## 1. Dismissing a coachmark doesn't count — it comes back on every visit

**This is the main cause of persistence.**

`useCoachingSequence().skip()` deliberately does **not** save anything ([coaching.js:177-187](../coaching.js#L177-L187)); it only hides the remaining tips *for the life of the component*. Only the primary "Got it" button, or doing the action, saves the tip as seen.

Every other way out goes through `skip`:

- **Skip** button
- **Escape** ([coaching.js:269-272](../coaching.js#L269-L272))
- **Clicking anywhere outside the card** — the full-screen scrim's `onClick` is `handleSkip` ([coaching.js:317-323](../coaching.js#L317-L323))
- **Learn more** — calls `handleSkip()` before opening Help ([coaching.js:342-353](../coaching.js#L342-L353))

So a user who closes the tip in any natural way sees it again on the next page load, and the next, until they find and press "Got it". The trigger conditions make it worse:

- **"Tools and View are now unlocked"** ([creator-main.js:875-886](../creator-main.js#L875-L886)) is described as firing "once after the first generation", but its only condition is `state.pat && state.pal`. It appears 600 ms after opening **any** project in the Creator.
- **"Paint your first stitch"** ([creator-main.js:848-867](../creator-main.js#L848-L867)) shows whenever the Creator is in edit mode with an empty undo history — which is true every time a project is opened.
- **"Select a rectangle of stitches"** ([tracker-app.js:6809-6841](../tracker-app.js#L6809-L6841)) fires once a project has 4 or more stitches done. On any established project that's true immediately, so it appears ~600 ms after every Tracker load, mid-stitching.
- **"Mark your first stitch"** appears for every new project with no stitches, every visit.

## 2. The scrim blocks the action the tip asks for

The coachmark scrim is a full-screen layer with `pointer-events: auto` at `z-index: 10000` ([styles.css:4730-4734](../styles.css#L4730-L4734)), and the highlight ring is drawn on top of it with `pointer-events: none`. Nothing cuts a hole in the scrim.

- "Paint your first stitch — click a cell to paint" and "Mark your first stitch — tap a cell": the user's click on the chart lands on the scrim, which **skips** the tip (unsaved — see §1) and swallows the click, so no stitch is painted. The user has to click twice and the tip comes back next time.
- "Tools and View are now unlocked" highlights the Tools tab with a pulsing ring, but the tab is under the scrim; clicking it dismisses the tip without opening the tab.
- "Select a rectangle" interrupts active stitching: the next tap the user makes on the chart is eaten.

This is the main source of the "janky" feel: the tutorial teaches an action and then prevents it.

## 3. The Tracker's "Skip tour" opens a pop-up you can't skip

On a first Tracker visit the welcome walkthrough ends with the stitching-style picker as a custom step. Any way of leaving the walkthrough early — **Skip tour**, the ✕, Escape, or clicking the backdrop — runs its `onClose`, which opens the standalone picker because no style was chosen ([tracker-app.js:7916-7922](../tracker-app.js#L7916-L7922)).

That standalone picker ([tracker-app.js:517-526](../tracker-app.js#L517-L526)) has **no close button, no Escape handler and no backdrop dismiss**; its "Skip for now" was removed on purpose ([tracker-app.js:475](../tracker-app.js#L475)). So "Skip tour" leads straight into a 2–3 screen questionnaire that must be answered. (It doesn't return after a reload only because an unrelated effect writes `cs_stitchStyle` on mount.)

## 4. Pop-ups stack instead of queuing

Nothing co-ordinates the three systems on the Creator page:

- The Creator welcome walkthrough (`.modal-overlay`, z-index 1000) is owned by `UnifiedApp` ([creator-main.js:1495](../creator-main.js#L1495), [1553](../creator-main.js#L1553)); the coachmarks (z-index 10000) are owned by `CreatorApp` and never check `welcomeOpen`. A first-time user who opens a project gets the walkthrough **and**, 600 ms later, a coachmark scrim on top of it.
- The coachmark's Escape listener ([coaching.js:270-285](../coaching.js#L270-L285)) and the shared `useEscape` stack ([keyboard-utils.js:40-63](../keyboard-utils.js#L40-L63)) are both capture-phase listeners on `document`. `stopPropagation()` doesn't stop other listeners on the same node, so a single Escape closes the walkthrough **and** skips the coachmark (unsaved, so it returns — §1). Escape on a coachmark also closes whatever modal is on top of the `useEscape` stack.
- Both components move keyboard focus to their own primary button on mount, so they fight over focus.

The Tracker does gate its coachmarks on `welcomeOpen` / `styleOnboardingOpen` — the Creator should too.

## 5. The Creator walkthrough talks about a different page

The Creator's walkthrough steps ([onboarding-wizard.js:40-58](../onboarding-wizard.js#L40-L58)) describe Home: "Your saved projects appear in the Projects tab. The Create new tab is how you begin…", and step 3 targets `[data-onboard="home-from-image"]`, which only exists on Home. The walkthrough is only ever mounted in the Creator (`mode==='design'`), so the target is never found: the card falls back to a centred modal that says "Clicking the highlighted tile will close this tour" with nothing highlighted.

## 6. Positioning uses guessed sizes and goes stale

- The walkthrough assumes its card is 200 px tall and 160 px above/below centre ([onboarding-wizard.js:312-327](../onboarding-wizard.js#L312-L327)); coachmarks assume 160 px ([coaching.js:92-93](../coaching.js#L92-L93)). Cards with a tip or long copy are taller, so they overlap the element they point at or run off the bottom of short screens (phones in landscape, iPad with the keyboard up).
- Both only re-measure on `resize` and `scroll` ([onboarding-wizard.js:256-257](../onboarding-wizard.js#L256-L257), [coaching.js:233-242](../coaching.js#L233-L242)). When the target moves for any other reason — a sidebar opening, tabs unlocking after generation (the very event the Tools coachmark announces), lazy content loading — the ring and card stay where the target *was*.
- The walkthrough's highlight ring animates `top/left/width/height` ([onboarding-wizard.js:341-343](../onboarding-wizard.js#L341-L343)), so on scroll it visibly trails behind the element.
- In targeted mode the walkthrough's wrapper and dimming are `pointer-events: none` ([onboarding-wizard.js:446-457](../onboarding-wizard.js#L446-L457)) so the highlighted target can be clicked — but so can everything else. The user can carry on using the page with the walkthrough card floating over it, which reads as "stuck".

## 7. Two reset buttons that reset different things

- Help > Getting Started > **Restart guided tours** calls `resetCoaching()` — coachmarks only — and toasts "Tutorials reset. They will show again when you start a new project" ([coaching.js:393-398](../coaching.js#L393-L398)). That isn't what happens: they show on the next page load if their (loose) conditions hold.
- Preferences > Onboarding & help > **Reset every walkthrough** ([preferences-modal.js:1433](../preferences-modal.js#L1433)) resets the welcome walkthroughs, the style picker and the help pill — but **not** the coachmarks.
- `useCoachingSequence` reads the saved flags once on mount ([coaching.js:147-156](../coaching.js#L147-L156)) and ignores `cs:prefsChanged`, so a reset on the current page does nothing until a reload.

## 8. Smaller issues

- **"Learn more" searched for nothing.** The Creator first-stitch tip opened Help with the query "painting", which matched no article ("No matches."). Fixed as a side effect of the help rewrite — there is now a "Painting and editing stitches" article — but the button still dismisses the tip unsaved (§1).
- **Hooks after an early return** in `WelcomeWizard`: `if (!steps.length) return null;` ([onboarding-wizard.js:201](../onboarding-wizard.js#L201)) sits before three `useEffect` calls. Harmless today (every page has steps) but a rules-of-hooks violation.
- **`useEscape` re-registers every render** in `WelcomeWizard` because it is passed a new inline function each time ([onboarding-wizard.js:199](../onboarding-wizard.js#L199)), moving the walkthrough to the top of the Escape stack on every render — so it can steal Escape from a modal opened above it.
- **`targetMissing` is computed and never used** ([onboarding-wizard.js:143-145](../onboarding-wizard.js#L143-L145)).

---

## Recommended fixes (in priority order)

1. **Make every dismissal stick.** In `useCoachingSequence`, have `skip` call `markCoached` for the active step (or for the whole sequence when the user presses Skip). Escape, backdrop and Learn more then stop resurrecting tips. One small change; removes most of the persistence.
2. **Stop blocking the action.** For action-teaching tips (first stitch, rectangle, Tools tab), drop the full-screen scrim: render a non-modal card (`pointer-events: none` on the wrapper, `auto` on the card only) and let the real click through — the existing auto-complete effects (`editHistory.length > 0`, `doneCount > 0`, `_rectSelectUsed`) already mark them done. Keep the scrim only for purely informational tips, and cut a hole in it for the highlighted target.
3. **Tighten triggers.** Fire "Tools unlocked" only on the transition from no pattern to pattern within a session (not on project open); fire "first stitch" only for projects created in this session or when no project has ever been edited; fire "rectangle" only after N stitches marked *this session*, not N in the project.
4. **Let "Skip tour" skip.** Give `StitchingStyleOnboarding` a close / "Use defaults" button and Escape handling, and don't open it from the walkthrough's `onClose` — apply the default style silently instead.
5. **One onboarding queue per page.** Gate the Creator coachmarks on the welcome walkthrough (lift `welcomeOpen` into a context, or have `Coachmark` check a shared `window.__onboardingActive` flag), and never show two onboarding overlays at once.
6. **Fix the Creator walkthrough copy** to describe the Creator (sidebar tabs, Generate, Materials & Output), and target an element that exists there — or move this walkthrough to Home, where its content belongs.
7. **Measure, don't guess.** Position from the card's real `getBoundingClientRect()` after render, re-measure the target with a `ResizeObserver` (plus a `requestAnimationFrame` loop while visible, as the target can move without resizing), and drop the CSS transition on the ring's position.
8. **One reset.** Make both buttons call a single `resetAllOnboarding()` that clears walkthroughs, the style picker, coachmarks and the help pill, and have `useCoachingSequence` listen for `cs:prefsChanged` so resets apply without a reload. Fix the toast copy.

Fixes 1, 2 and 4 together should remove nearly all of the complaints; 5–7 address the remaining visual jank.

---

## Appendix: other issues found during the documentation audit

Fixed on this branch:

- **Preferences text corruption.** `preferences-modal.js` was saved in a legacy encoding and then re-saved as UTF-8 in `b75b507` (May 2026), turning 41 lines' worth of `×`, `—`, `£`, `€`, `©`, `…` and curly quotes into `�` — visible as "� GBP", "Choose folder�", "5 � 5", "Level 1 � Chart only" etc. Restored from the last clean revision.
- **Backups couldn't be selected for restore on iPad/Android.** Backups download as `.csb` by default but both restore pickers declared `accept=".json"`.
- **Sync popover and Preferences** pointed users to a Home "Sync section" that no longer exists, and said folder checking / conflict handling were "not available yet".
- **In-app changelog** stopped at 1.0.58; entries added up to 1.0.71.

Not fixed (behaviour changes — need a decision):

- **Tracker `F` is bound twice.** `tracker.layer.full` (scope `tracker.notedit`) and `tracker.focus.toggle` ("Toggle spotlight focus area", scope `tracker`) both use `F`; the more specific scope wins, so the spotlight toggle is unreachable from the keyboard.
- **Tracker row mode is half-built.** `R` / Layers > Row mode highlights a "current row", but `currentRow` is only ever set to 0 — there is no way to advance it.
- **Tracker edit mode is unreachable.** `isEditMode` has UI and undo paths but `setIsEditMode` is only ever called with `false`.
- **File > Export PDF… ignores the Export tab.** It uses fixed settings (auto page size, all optional pages, overlap on) rather than the user's choices on Materials & Output > Export; only branding and the Workshop theme carry over.
- **`SharedModals.Shortcuts`** (registry-driven shortcuts list in `modals.js`) is no longer used anywhere.
- **`sync.conflictBehaviour`, `sync.pollIntervalSec`, `sync.defaultConflictAction`** prefs exist in `user-prefs.js` but nothing reads them.
