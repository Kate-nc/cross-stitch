# Phase 4 bug hunt log

## Batch 1 (TRACK-06, targets and the save badge)

### Exercised
- `npm test` (304 suites, 4,059 tests), terminology lint, `node build-runtime-js.js --check`. Playwright (Chromium, local CDN): `phase4-batch1` (9 tests: reachability at 1024x768, 1280x800, 1440x900 and 1920x1080; the 44 px size audit and the save status at 393x727 and 851x393; no sideways scroll on Creator, Home and Manager at 393 px).
- Reproduced before fixing: the reachability test failed at 1024, 1280 and 1440 (Create covered by the panel) and passed at 1920, as the audit found.
- Visual check (screenshots): 1440x900 header clear and banners inside the main column; phone portrait and landscape; Creator at 393 px (its own compact header, unaffected).
- Performance: tap latency interleaved against `main`, 3 pairs of 90 taps: medians main 10.8 / 10.6 / 11.6, branch 11.1 / 10.9 / 11.0 (`perf/phase4-batch1/tap.txt`). The change is CSS and one wrapping span, so nothing on the mark path moved.

### Bugs found
- **Fixed here:** the older rule meant to hide the project/save pill on phones (`.tb-proj-badge{display:none}` under 600 px) never applied, because a later rule with equal specificity set it back to `display:flex`; the pill was squeezed to a 22 px sliver instead. The new compact icon replaces it.
- **Found, fixed here:** the save status shares the class of the percentage chip (`tb-proj-badge-pct`), so hiding the percentage on phones would also have hidden the save status; the rule excludes it.
- **Noted, not changed:** the project name in the top bar (editable by tapping) is hidden under 900 px because it was already unusable there; renaming is still possible from the project switcher menu.

### Not verified
`npm run test:mobile-audit`: its specs do not install the local library server, so every spec that needs React times out in this sandbox (cdnjs is blocked), on `main` as well as here; the unit tests that read the same CSS and header source pass. Safari, Firefox, real devices; 200% browser zoom (next batches); the Toast dismiss button on the Creator and Home pages at 44 px (CSS applies on coarse pointers only; not screenshotted on those pages).

## Batch 2 (TRACK-07: give the chart the screen)

### Exercised
- `npm test` (305 suites, 4,063 tests), terminology lint, `node build-runtime-js.js --check`. Playwright (Chromium, local CDN): `phase4-batch2` (14 tests: phone portrait 393x727, phone landscape 851x393, tablet 768x1024, desktop 1440x900), `phase4-batch1`, and the Phase 2 and 3 specs, `tracker-touch`, `french-knots`, `cross-tab-merge`, `save-durability` and `progress-units` together (106 passed, 1 flaky that passed on retry; the failures it first showed are listed below).
- Reproduced before fixing: chart box 600 px starting at 155 px on a 727 px screen (28 px past the bottom, the bar under it 70 px past), 600 px from 140 px on a 393 px screen; the Palette pill over the banner; the strip over the last column. After: portrait 643 px of 727 (88%), landscape 309 of 393 (79%), no page scroll in either, the last column scrolls clear of the strip, rotating re-measures, every visible control in Focus is at least 44 px.
- Not a phone (tablet 768x1024): no Focus by default, chart still ends at the bottom of the screen. Desktop: chart box exactly 600 px and no variable set. Preferences: phone default off, left-handed placement.
- Visual checks (screenshots): phone portrait and landscape in Focus.
- Performance: see the progress log (phone emulation 4x CPU and desktop, interleaved against `main`); no regression.

### Bugs found
- **Fixed here: Focus mode did nothing** on this layout (its CSS named classes the page no longer uses), and the F key it was documented under is also the Full-stitch layer shortcut.
- **Fixed here: Focus hid the colour panel**, so the Colours button (now the strip's first button) opened nothing visible; and its first tap lands on the collapsed strip, which was hidden too.
- **Fixed here: Fit overshot the box.** Cell size is a whole number of pixels, Fit rounded it up, so a fitted pattern could be up to half a pixel per cell too big (60 px on 60 columns). The old 600 px box had hidden it by luck; the Phase 2 Fit spec failed on the new heights. Fit now rounds down and leaves room for the strip.
- **Fixed here, a regression from batch 1 (#294):** the compact save status hid the project name and the percentage below 900 px, which includes a tablet in portrait. The Phase 2 matrix spec ("header chip shows 50%") caught it only when run in this batch; it is now limited to a narrow (under 600 px) or short (under 520 px, a phone on its side) screen.
- **Noted, not changed (pre-existing):** the project name in the top bar is hidden at some widths for reasons outside this change (a tablet test found it hidden; not investigated); the project-name field is not reachable in Focus on a phone (Exit focus brings the top bar back); the F key still toggles the Full-stitch layer, so Focus is only reachable from the More panel or the phone default.

### Not verified
Safari and Firefox (`dvh`, `visualViewport` and the dynamic toolbar are measured through `visualViewport` and `innerHeight`, but only Chromium ran); real phones and real on-screen keyboards (the chart re-measures on `visualViewport` resize, only tested by resizing the window); 200% browser zoom; stylus and palm cases (batch 3's); mouse and trackpad scroll on a narrow window; `npm run test:mobile-audit` (cannot run here, see batch 1).

## Batch 3 (TRACK-08: scrolling must not mark)

### Exercised
- `npm test` (306 suites, 4,075 tests; 37 in `dragMark.test.js`, 9 of them new for touch intent), terminology lint, `node build-runtime-js.js --check`. Playwright (Chromium, real touch through CDP): `phase4-batch3` (7), `tracker-touch` (8, with one expectation moved to the new contract), and the Phase 2, 3 and 4 specs, `french-knots`, `cross-tab-merge`, `save-durability`, `progress-units` together (123 passed, 1 flaky that passed on retry: the known `save-durability`).
- Acceptance: a 120 px quick swipe marks 0 stitches and scrolls the chart; rest then drag across 5 cells marks the rested stitch and 5 more with the chart not moving; a tap marks 1 at once; Paint mode paints on a quick drag; Lock touches blocks a tap and a drag, a tap on the pill does not unlock, hold then lift does; a stroke of 8 stitches offers "Undo 8 stitches" and undoing it removes all 8; a stroke of 4 offers nothing; two-finger pan, pinch, momentum and the second-finger-mid-drag cases still pass; a mouse drag still marks with no rest.
- Performance: phone emulation and desktop, interleaved against `main` (progress log): no regression.

### Bugs found
- **Fixed here, a ghost click:** unmounting the Lock pill at the lift let the browser's follow-up click land on the control underneath (it opened the More panel; the next tap then closed it instead of marking). The pill now stays for 400 ms after the lift.
- **Fixed here:** the toast's action buttons (Undo, View) were about 20 px tall; they are 44 px on touch.
- **Noted, not changed:** the pre-existing `touch-constants.js` still defines `TAP_HOLD_MS` 200 ms for what counts as a tap, so a finger resting between 120 and 200 ms and lifting is still a tap (marks one stitch) while one resting longer without moving is discarded (as before).
- **Out of scope, noted:** the "Mark" and "Nav" labels on the controls strip, and the shortcut F being both Focus and the Full-stitch layer (batch 5, COMMON-01).

### Not verified
Real iOS Safari and Android devices (the page keeps the browser from scrolling only after the rest; iOS may begin a scroll in the first pixels), a real stylus, a resting palm that makes two touch points in Lock, `npm run test:mobile-audit` (the updated `pan-ownership` spec was not run), 200% zoom, and rotation while a stroke is in progress.

### Review round 1 (Copilot on PR 296; two findings, both verified)
- **"Undo N stitches" could undo something else (medium).** True: the button always ran the ordinary Undo, so after another mark, a park or an Undo within the 8 seconds it would have undone that instead. The message is now bound to the exact history entry of its stroke: it goes as soon as that entry is no longer the newest step (a later mark, a park, an Undo, a project switch), and if it is somehow pressed after that it declines and says so. New browser test: stroke of 8, one more tap, the message is gone and nothing was undone.
- **Paint could report an inactive mode (medium).** True: with "Drag to mark stitches" off in Preferences the drag hook is inert, yet the Paint chip and the "Paint" label still appeared. The Paint chip is not offered when drag marking is off, and the strip says Mark. (Lock touches still works there: it stops the touch before the legacy tap handlers see it.) New browser test.

## Batch 4 (TRACK-05: coming back to a project, first run)

Found by reading the diff and by the regression run:
- **A same-project reload would have reset Mark or Navigate mid-session.** `processLoadedProject` has a dozen callers (cross-tab merge, restore, handoff); applying the saved context on each would flip a person back to the autosave's (up to 5 s old) mode. The context is now applied only when the project id differs from the one on screen (`_sameProjectReload`). Colour was already cleared on every load before this batch; unchanged.
- **The "Show welcome tour" command would have been undone at once** by the rule that retires the tour when a pattern is on the chart; asking for it (Help, or `cs:showWelcome`) sets `welcomeAskedRef`, which the rule respects.
- **`if(...)a;b;` slip** while adding that flag to the event handler (the second statement escaped the `if`); caught on re-reading, braces added.
- **Regression run (94 specs):** one failure, `phase3-batch4` "a goal reached says so only when goals are shown". Not an app bug: the spec waited 4 s for the old "Continue stitching" button, which no longer exists, and the goal message (shown on load, auto-dismissed) had gone by the time it looked. The wait is removed from that spec. Passes on `main` and on the branch after the change.
- Two guards tripped and were satisfied rather than relaxed: the auto-save dependency list must end with `achievedMilestones]`, and every Dismiss button needs `tracker-dismiss-btn` (44 px on touch).

Known limits:
- The style question ("How do you usually work") no longer appears when a pattern is already open on first visit; the default (Block) applies and it is under More controls > Tools. A person who opens the Tracker empty still gets the full tour.
- The saved context follows the 5 s autosave, so a change in the last seconds before closing the tab is covered only by the unload flush (same as every other saved field).


### Copilot round 1 (batch 4)
All seven findings checked against the code; all real, all fixed:
- **View value `"colour"` vs `"realistic"`:** the renderer, `useCanvasOverlays`, the V shortcut and Preferences use symbol / colour / highlight; I had whitelisted `"realistic"` and rejected `"colour"`, so a saved Colour view was dropped on load. The validator now accepts symbol, colour, highlight. Separate, pre-existing and not touched here: the Realistic button in More controls sets a `stitchView` the renderer does not draw.
- **Stale context in the Creator:** the refresh path now deletes `workingContext` when the Tracker omits it (as for `deletedSessionIds`), so a Creator save cannot bring an older one back.
- **Project switch / same-project reload:** a switch sets the focus colour from the saved context (or none) and leaves Highlight view for Symbol when the project has no colour saved; a same-project reload keeps the current colour while the pattern still has it.
- **`APP_VERSION`:** I had edited it; CI bumps it on merge. Restored to 1.0.128 (the 1.0.129 changelog entry stays).
- **Banner:** `--app-header-height` instead of an undefined `--tb-h`; buttons 44 px on coarse pointers; the 20 s timeout waits while focus is inside the banner.

## Batch 5 (TRACK-11, COMMON-01)

- **`npm test` would have hung.** The first version of the hook test left 15-minute idle timers running in the jsdom windows, so Jest never exited (found by the test run not finishing; it passed with `--forceExit`). Each window is now closed after its test. The idle timer itself is deliberate.
- **A lock released by the person must not come back.** The old hook re-took the lock on every tab show if the pref said so; with Automatic there is no such pref, so a `wantRef` tracks "should be held": cleared on release, kept when the browser takes the lock (tab hidden). Tested both ways.
- **Date-dependent test:** `phase3Batch4` weekly streak failed on `main` today (see progress). Not caused by this batch; made weekday-proof rather than skipped.
- The V shortcut already cycles symbol / colour / highlight, which showed the "Realistic" button was the stray one.


### Copilot round 1 (batch 5)
Five findings, all real, all fixed:
- **Request race (high):** two quick marks before the first `request()` settled could take two locks and keep only the last, and a request could land after the Tracker closed. A request in flight is now shared (`pendingRef`); `wantRef` is set before the wait, and a lock that arrives after a release or an unmount is released rather than kept.
- **Parking a thread took the lock:** the history also holds `PARK` entries (and shrinks on undo). The trigger now needs a new last entry, no shrink, and not `PARK`.
- **Preference changes were not live:** the hook listens for `cs:prefchange`; Never lets go at once, Always takes the lock now.
- **Idle test only read the source:** it now runs the captured 15-minute timer and checks the release, the inactive state, and that the next mark takes the lock again; further tests cover shared requests, a lock arriving after Never or after unmount, and the preference events.
- **Retired term in the confirmation:** the dialog was still "Turn off live tracking?"; now "Stop using up stash thread as you stitch?".

## End-of-phase hunt (all five batches, merged `main`)

Driven by `tests/e2e/phase4-hunt.spec.js` (8 specs, `HUNT` lines in the log) plus a before/after screenshot comparison (`harness/shots.js`, images in `reports/tracking-audit/screens/phase4/`). "Before" is `7395a58`, the commit before Phase 4.

### Found and fixed
1. **A palm marks stitches.** Three fingers landing together marked three stitches. The second finger correctly cancelled the first finger's gesture, but that left the machine idle, so the third finger started a fresh tap and its release committed it (fingers 1, 3, 5... each marked). The reducer now enters a `multi` mode on the second finger and stays there until every finger has lifted; the hook counts touch pointers (id to landing time, contacts older than 5 s are forgotten so a lost `pointerup` or a palm resting for ages cannot block a later single finger). Pre-existing since the pointer-event drag-mark; Phase 4's one-finger rules made it matter. Six reducer tests and the browser spec.
2. **Browser zoom 200% on a phone (196x364): More could not be reached.** The controls strip is about 330 px tall, the viewport 364 and the strip starts at 105, so More sat at y=381 below the fold; since batch 2 nothing on the page scrolls, so it was unreachable (before Phase 4 it was just far down the page). The strip now has `max-height: calc(100% - 8px)` and scrolls inside the chart column.

### Checked, no change needed
- **200% on a tablet (384x512) and desktop (720x450):** no sideways scroll, chart present, Mark / Nav / More reachable. At 720 px the colour panel opens as an overlay with a backdrop that covers the strip until you tap outside it; the build before Phase 4 did the same (its palette tiles sat over the strip), so this is old behaviour and left alone.
- **Rotation mid-session** (393x727 to 851x393 and back, marks made first): marks survive, no sideways scroll, a tap after the turn lands on the cell under it.
- **Mouse and trackpad:** wheel and two-finger scroll move the chart and mark nothing; Ctrl+wheel zooms the chart (cell size 13 to 27) and not the page (`visualViewport.scale` stays 1).
- **Stylus (pen pointer events):** a tap marks one, a quick swipe adds nothing.
- **On-screen keyboard:** the Tracker offers no rename field below desktop widths in either build (the switcher names the project; probed on the build before Phase 4), so there is no Tracker text field under a phone keyboard. What a keyboard does do, halving the viewport with the More panel open, was driven (393x380): the panel's close button stays on screen and the rest scrolls into view because the chart has a minimum height. Creator and Home rename were not changed by this phase.
- **Creator, Home, Manager before/after** (393x727 and 1440x900): Creator 0 px and 140 px different; Home desktop 138 px; Home phone differs in the shared header only (the clipped pink save-badge sliver from before is gone, batch 1); Manager desktop 0.13% and phone 3% are the order of two tied entries in the thread-conflicts list (310 and 666), not layout.

### Not verified
Safari and Firefox (including Safari dynamic viewport units, which batch 2 relies on); real devices, real stylus pressure or hover, a real on-screen keyboard (only a halved viewport was emulated); real palm rejection by the OS; the dark theme on the Phase 4 additions; screen-reader behaviour of the recap strip, Keep screen on and the Highlight tab; the Wake Lock itself (mocked).

### Copilot round 1 (closing PR)
Four findings, all real or fair:
- **A finger on a French knot bypassed the palm guard.** The Tracker handles a knot touch itself and returns before the drag-mark hook, so that finger was not counted: with one finger already marking and a second on a knot, the count stayed 1 and the mark could still commit. The hook now has `onExtraTouchDown` / `onExtraTouchEnd`, called from the knot branch; they join the finger count, abandon a mark under way, and treat a second finger on an idle chart as a palm. Reducer tests and a wiring test.
- **The palm fix and the short-viewport fix had no help or changelog entry** (AGENTS.md asks for both on user-visible changes). Added: help "A hand on the screen", changelog 1.0.131.
- **Two hunt tests claimed more than they checked.** The rotation test was named for a rectangle selection it never made: renamed to what it checks (marks survive the turn, a tap after it lands on the cell under the finger). The stylus test did not cover the rested drag: it now rests the pen for 250 ms, drags five cells and expects the rested cell and the five (7 stitches in all with the earlier tap).

