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
