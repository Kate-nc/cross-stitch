# Phase 4 progress

Findings: TRACK-06, TRACK-07, TRACK-08, TRACK-05, TRACK-11, COMMON-01. Started from `main` at v1.0.125 (Phases 1 to 3 merged).

## Plan (batches, from the phase prompt)

1. TRACK-06 (legend panel over the header) and the touch-target and save-badge fixes.
2. Chart sizing, Focus by default on a phone, banner auto-hide, rail changes (TRACK-07).
3. Touch intent, Paint mode, Lock touches, "Undo N stitches" toast (TRACK-08) with the updated touch spec.
4. Persisted working context and the first-run / recap rework (TRACK-05).
5. Wake lock and the terminology pass (TRACK-11, COMMON-01).

## Things to settle on the way (conflicts with earlier phases and the repo's own docs)

- **COMMON-01 vs `TERMINOLOGY.md`:** the glossary already names the tracker's modes "Mark mode (and Navigate mode)". The audit recommends renaming Navigate to "Move" or "Guide"; the phase prompt says to confirm against the glossary and ask the user if it does not settle it. It does settle it (the other way), so this needs a decision from you in batch 5 before anything is renamed.
- **TRACK-08 vs Phase 2's catch-up question:** a rectangle fill of over 50 stitches already asks "today or catch-up" (batch 0 of Phase 3). The new "Undo N stitches" toast is for drag gestures over 5 cells; the two must not stack for the same gesture.
- **TRACK-05 vs Phase 1 (save safety):** new working-context fields (focus colour, mode, view, highlight style) must be written through the existing debounced save path and must not add a write on the mark path.
- **Phase 3 e2e specs** locate the timer chip by opening the palette; batch 2's rail and Palette changes must keep that reachable.

## Batch 1: legend panel and touch targets (TRACK-06, part of TRACK-07)

Reproduced first (new spec `tests/e2e/phase4-batch1.spec.js`): with the colour panel open the Create tab (and, by the same test, the others) was covered by `.lpanel` at 1024x768, 1280x800 and 1440x900; clear at 1920x1080, as the audit found.

- **TRACK-06:** the docked panel now starts below the header (`top: var(--app-header-height)`) instead of at the top of the window; the header is never covered, and the main column already clears the panel's width, so banners stay inside it. One CSS rule; no JavaScript, no layout variable needed.
- **Targets (phone and tablet, coarse pointer):** rail buttons 44 x 44 (were 40 below 480 px), palette and More close buttons, the legend close, the three tracker banner Dismiss buttons and the Toast Dismiss button all 44 x 44 minimum. The size audit in the new spec walks every visible button, link, input and select on 393x727 and 851x393 and expects none under 44 px.
- **Save badge:** on a phone (below 900 px) the header's project/save pill was a 22 px sliver, clipped and unreadable (the older rule meant to hide it never applied, because a later rule set it back to `display:flex`). It is now the save icon alone, with its words kept for screen readers; the project name stays in the project switcher beside it. A save error or conflict keeps its words on screen.

### Performance (batch 1)
Interleaved against `main`, 3 pairs of 90 taps: median ms main 10.8 / 10.6 / 11.6, branch 11.1 / 10.9 / 11.0. CSS and one wrapping span only; no regression (`perf/phase4-batch1/tap.txt`).

### Known limits
- The project name in the top bar is not shown under 900 px (it was clipped away already); the project switcher still shows it.
- Targets of dense controls elsewhere (More-panel chips, tabs) are the later batches' and the other audits' business; the audit here covers what is visible on the Tracker's first screen at 393x727 and 851x393.

## Batch 2: give the chart the screen (TRACK-07)

Reproduced first (`tests/e2e/phase4-batch2.spec.js`): at 393x727 the chart box was a fixed 600 px starting 155 px down, so it ran 28 px past the bottom of the screen and the bar under it (at 797 px) was out of sight; at 851x393 the 600 px box began at 140 px of a 393 px screen. The Palette pill sat on the hint banner, and the controls strip covered the last columns. Two things found on the way:
- **Focus mode did nothing on this layout.** Its CSS hides `.header`, `.info-strip` and `.toolbar-row`, but the top bar is `.tb-topbar` and the strip `.info-strip-wrap`; pressing F also collides with the "Full-stitch layer" shortcut. Focus is now real, and it is the thing the phone default needs.
- **The "rail" step of the Colours button was invisible** with Focus on (the old rule hid every `.lpanel`), so the first tap did nothing; Focus now leaves an opened panel and the collapsed strip alone.

What changed:
- **Chart sized to the screen** (phone, tablet, or any window under 1024 px): `useFillChartHeight` measures what is above and below the chart box and sets `--tracker-chart-h` (screen height less the space the box starts at, less the bar and hints under it). It runs on layout changes (a banner coming or going, rotating, Focus, the on-screen keyboard through `visualViewport`), through `ResizeObserver` and rAF, never per stitch. Desktop is untouched (a test checks the chart box is still exactly 600 px at 1440x900 and no variable is set).
- **Focus** now hides the top bar, the progress strip and the hint banners; a thin progress line (percentage and stitches left) takes their place and the floating bar keeps Undo, zoom and Exit focus (the Esc legend is hidden on touch). The controls strip stays. **On a phone (a touch screen under 600 px on its short side) it is the default**; `Phones and small screens` in Preferences turns that off. Result: portrait chart 643 of 727 px (88%), landscape 309 of 393 px (79%), nothing scrolls; with Focus off or on a tablet the chart still ends at the bottom of the screen (at least 50%).
- **Hint banners go after the first marked stitch** and stay gone (`trackerHintsSeen`, global). The idle bar under the chart ("—") is hidden on touch until a guide is placed.
- **Controls strip:** the floating Palette pill is gone; the strip's first button shows the current colour (swatch and thread number). The chart has end space equal to the strip so the last column can be scrolled clear of it; Fit leaves that room too. New `trackerHandedness` (Right default, Left in Preferences) moves the strip and gives the chart a matching margin on the left.
- **Fit rounds down.** The chart's cell size is a whole number of pixels (`round(20 x zoom)`), and Fit rounded it up, so a fitted pattern could overshoot the box by up to half a pixel per cell; the old 600 px box had hidden it by luck (the Phase 2 Fit spec failed on the new heights). Both fits now round down.
- **Regression of batch 1 found and fixed:** the compact save status hid the project name and percentage below 900 px, which includes a tablet in portrait; it now applies only to a narrow or short (phone on its side) screen. The Phase 2 matrix spec ("header chip shows 50%") caught it.

### Performance (batch 2)
Phone emulation (393x727 touch, CPU throttled 4x, 300x300 fixture), interleaved against `main`, 3 pairs of 30 taps: median ms main 65.0 / 67.8 / 69.7, branch 64.4 / 67.4 / 64.1; load to chart main 4071 / 4327 / 4238, branch 3997 / 4227 / 4168 (`perf/phase4-batch2/phone.txt`, harness `phonebench.js`). Desktop (1440x900, 3 pairs of 90 taps): median ms main 9.6 / 8.7 / 8.5, branch 9.0 / 8.8 / 8.3 (`tap.txt`). No regression either way.

### Known limits
- No separate toggle to leave Focus for a session: Exit focus is the way back, and it returns on the next open (turn it off in Preferences to stop that).
- Left-handed placement costs the chart about 60 px of width.
- The first-run welcome tour and the persistence toast still open over the chart on a first visit; that is batch 4 (TRACK-05).

## Batch 3: scrolling must not mark (TRACK-08)

Reproduced first: in Mark mode the canvas had `touch-action: none` and every `touchstart` called `preventDefault`, so a one-finger swipe could only ever mark (the pre-existing `tracker-touch` spec even asserted it: "a one-finger drag marks what it crosses and does not pan").

- **Touch intent** (`useDragMark.js`, reducer): for touch and pen, painting starts only after the finger has rested on a stitch for `PAINT_HOLD_MS` (120 ms, `touch-constants.js`) and then moves past the slop. A one-finger swipe that starts moving before that is a **scroll**: the gesture is dropped (new `scroll` state, a new touch is never blocked by a stuck one) and nothing is marked. A tap is still instant. Mouse and trackpad are untouched (armed from the start).
- **Native scroll for a quick swipe:** the canvas is now `touch-action: pan-x pan-y` in Mark mode, and `touchstart`/`touchmove` call `preventDefault` only once the chart owns the gesture (two fingers; a rested, armed finger; a drag; the held end of a long-press rectangle; Paint mode; Lock). So a swipe scrolls on the compositor, with no JS scroll writes.
- **Paint mode** (More > Controls, touch screens only): a one-finger drag paints at once, `touch-action: none`; the Mark button reads "Paint" while it is on.
- **Lock touches** (More > Controls): the chart ignores one-finger touches (marks and scrolling), two fingers still pan and zoom. A "Touches locked. Hold to unlock" pill is always on screen; holding it until it says "Lift to unlock", then lifting, unlocks (Enter or Space unlocks at once). It unlocks 400 ms after the lift: unmounting the pill at the lift made the browser's follow-up click land on whatever was under it (a ghost click that opened the More panel).
- Neither toggle is saved: a reload is a clean start, so nobody is locked out by a stale setting.
- **Undo N stitches:** after one drag or rectangle commit that changes more than `BULK_UNDO_MIN` (5) stitches, a Toast says "N stitches marked" (or "unmarked") with an "Undo N stitches" button for 8 seconds. It is the ordinary Undo of that single history step; the previous such toast is dismissed first. A rectangle of over 50 stitches still asks the Phase 3 catch-up question first, then shows the toast. Toast action buttons are 44 px on touch now. (Undo across a reload stays out of scope, as the prompt says.)
- **Docs and copy:** help (Mark mode, Paint and Lock touches, Undoing a stroke), the hint banner, the Preferences description of drag-to-mark, changelog 1.0.128.

### Deviation to know about
The prompt allows painting to start "after about 120 ms **or** 8 px of movement predominantly along the row or column". I implemented the 120 ms rest only: a quick row-wise swipe that painted would contradict the acceptance criterion in the same section ("a 120 px one-finger swipe in Mark mode marks 0 stitches and scrolls"), and fast runs are what Paint mode is for.

### Performance (batch 3)
Phone emulation (393x727 touch, 4x CPU throttle, 300x300 fixture), interleaved against `main`. Tap median (ms, 3 pairs of 12): main 65.5 / 66.4 / 68.4, branch 68.8 / 62.9 / 68.5. Stroke commit (rest, drag 8 cells with a real touch, time from the lift to the strip changing; 4 pairs of 14 strokes): main 60.5 / 65.6 / 58.1 / 56.7, branch 62.8 / 61.2 / 58.6 / 58.9 (means 60.2 and 60.4). Desktop mouse tap (3 pairs of 60): main 9.8 / 8.8 / 8.9, branch 9.1 / 8.8 / 9.5. No regression (`perf/phase4-batch3/`). The new per-touch cost is one 120 ms timer; the touch handlers read the hook's state through a ref and allocate nothing.

### Known limits
- Real iOS Safari behaviour of calling `preventDefault` on `touchmove` after the rest (iOS may start scrolling in the first few pixels) is unverified; a stylus (pen pointer) is treated like a finger and was not tried with real hardware.
- The mobile-audit `pan-ownership` spec was updated to the new contract but cannot run in this sandbox.
- With Lock on, two fingers still pan and zoom (deliberate gestures); a palm resting with two points could.

## Batch 4: coming back to a project, and first run (TRACK-05)

Reproduced first (393x727 touch, fresh prefs): the welcome tour is a modal with a dimmed scrim, and a click on the scrim closes it, so the first tap on the chart marked nothing (`elementFromPoint` at a cell was `DIV.modal-overlay`, 0 stitches). The "welcome back" recap was a second modal, and the colour, Mark or Navigate and highlight style were thrown away on every load (`setSelectedColorId(null); setFocusColour(null)`; `stitchMode` never saved).

- **Working context** is one optional project field, `workingContext: {colour, mode, view, highlight}`, written by `buildSnapshot()` and the file export, in the autosave dependencies. A default context writes nothing (`undefined`), so older projects and tests see no change and the project version stays 11.
- **Validated on load** (`normaliseWorkingContext`): the colour must exist in the pattern, mode is `track` or `navigate`, view and highlight come from the known values, and the highlight view is dropped when its colour is gone (a pattern edited in the Creator). A project with no saved context now opens in Mark, as a first open does.
- **Carried everywhere the other tracker view fields go:** `__updateCreatorTrackerFields` (both call sites), the Creator preserve paths in `creator/useProjectIO.js` (bundle rebuilt), and `tracking-merge.js` `NOT_COMPARED` so the other tab changing it never raises the overwrite question. Backup and restore already pass unknown fields through (JSON round trip tested).
- **Resume recap is a strip**, not a dialog (`role="status"`, no scrim): the chart works under it, the first mark or 20 s clears it, Stats and Switch project stay as buttons.
- **First run is one sequence:** once a pattern is on the chart the welcome tour steps aside (and marks itself done), so the first tap marks a stitch and the "Mark your first stitch" hint is the only guide. Asking for the tour from Help still opens it over a loaded pattern (`welcomeAskedRef`). The style question keeps its default and stays under More controls > Tools; that was already the "Skip tour" behaviour.
- Help ("Coming back to a project"), changelog 1.0.129.

Tests: `tests/workingContext.test.js` (11), rewritten `tests/resumeRecapModal.test.js`, `tests/e2e/phase4-batch4.spec.js` (5: restore in Navigate, bad context ignored, recap does not block and clears on first mark, first tap after opening a pattern marks, Navigate saved and restored after reload).

### Performance (batch 4)
Interleaved against `main` (current `origin/main`), phone emulation (393x727 touch, 4x CPU throttle, 300x300 fixture), 3 pairs. Tap median (ms): main 71.5 / 70.3 / 66.2, branch 67.6 / 65.9 / 74.3. Stroke commit: main 65.0 / 65.9 / 58.3, branch 62.6 / 61.6 / 63.3. Desktop tap (120 taps, ms): main 9.3 / 9.5 / 9.9, branch 9.4 / 9.9 / 9.0. Load to chart in the first pairs read 4-10% slower on the branch, so it was re-measured with 12 loads each: main median about 4.17 s, branch about 4.15 s, so that gap was noise (the branch server had just been restarted). No change outside noise. Raw output in `reports/tracking-audit/perf/phase4-batch4/`.

### Known limits
- The style question is skipped when a pattern is already open on a first visit (Block applies; it is under More controls > Tools).
- Not verified on real Safari or a real phone.

