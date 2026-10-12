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
Phone emulation (393x727 touch, CPU throttled 4x, 300x300 fixture), interleaved against `main`, 3 pairs of 30 taps: median ms main 65.0 / 67.8 / 69.7, branch 64.4 / 67.4 / 64.1; load to chart main 4071 / 4327 / 4238, branch 3997 / 4227 / 4168 (`perf/phase4-batch2/phone.txt`, harness `phonebench.js`). Desktop tap latency in `tap.txt`.

### Known limits
- No separate toggle to leave Focus for a session: Exit focus is the way back, and it returns on the next open (turn it off in Preferences to stop that).
- Left-handed placement costs the chart about 60 px of width.
- The first-run welcome tour and the persistence toast still open over the chart on a first visit; that is batch 4 (TRACK-05).
