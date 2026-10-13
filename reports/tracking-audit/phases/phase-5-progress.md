# Phase 5 progress: legibility, orientation and accessibility

Prompt: `phase-05-legibility-orientation-accessibility.md`. Findings: TRACK-09, TRACK-10, COMMON-02 (Fit was fixed in Phase 2).

## Scope change (from the user, at the start)

**Screen-reader work is deferred to a later phase.** Not in this phase: the live-region announcements after each move and mark, the screen-reader walkthrough, and the ARIA names, roles and `aria-pressed` states work. Axe findings of those kinds are *recorded* below but not fixed. Everything else stays: the done-state cue, low-zoom colour, minimap, true Fit, keyboard marking, visible focus, contrast, 200% zoom, no colour-only information. Where a "screen-reader" item is really a keyboard fault (the closed More panel keeps its controls focusable), it is treated as keyboard work.

## Plan (four batches, one PR each)

1. Done-state style and low-zoom colour (TRACK-09 core), with draw-path performance numbers.
2. Minimap and a check of Fit (square, wide, tall); orientation aids if the data exists.
3. Keyboard parity (TRACK-10): mark and unmark at the guide, Shift+Enter rectangle, arrow-key overload resolved and documented, `[` `]` colours, legend and mode without a pointer; the closed More panel no longer in the tab order; Esc predictable. No live region.
4. Accessibility audit fixes (COMMON-02, without the screen-reader items): contrast, visible focus everywhere, 200% zoom, colour-only information (done state, highlighted colour, chart series, milestones).

Then the end-of-phase hunt, whole-phase performance check, `phase-5-report.md` and a closing PR. Do not start Phase 6.

## Evidence reproduced first (on `main` at 1.0.131)

### TRACK-09: done versus not-done (`harness/look.js`)
300x300 fixture, 20% marked in 10x10 blocks, desktop 1440x900, natural detail tiers. Mean luminance (0 to 255) of a done 10x10 block against a not-done one, inner cells only. Screenshots (colour and greyscale) in `reports/tracking-audit/screens/phase5/baseline-*`.

| View | 3 px cells | 8 px cells | 19 px cells |
|---|---|---|---|
| Symbol (default) | 222 vs 253, gap 31 | 217 vs 247, gap 30 | 221 vs 236, gap 15 |
| Colour | gap 3 | gap 3 | gap 3 |

At 3 px the chart is a white grid with a pale green wash; at 19 px a done stitch loses its symbol and takes the same pale green, so the cue is colour alone and weak in greyscale. In Colour view done and not-done are both the thread colour (gap about 3, invisible in greyscale). Below 3 px cells there is already a flat-colour tier (done in the thread colour, not-done faded), but a 300x300 pattern at Fit on a 1440x900 screen is 3 px, one tier above it.

### COMMON-02 audit, before any fix (`harness/a11y-audit.js`, axe-core 4.10.2 from a temporary folder, `reports/tracking-audit/a11y/phase5-audit-before.json`)
Tracker (default, More panel open), project Stats and global Stats; light and dark; 1440x900 and 393x727.

| Finding | Where | Scope |
|---|---|---|
| `color-contrast` (serious): 166 nodes in all, e.g. the header's `Create` / `Edit` tabs, Stats text; far more in dark Stats (30 to 37 nodes) | tracker, More panel, project Stats, global Stats | in scope (batch 4) |
| `aria-required-children` (critical): `.ppal-tile-list` | tracker | recorded, deferred (screen reader) |
| `nested-interactive` (serious): 24 nodes, the palette tiles (`div[aria-label="Select DMC ..."]` holding a Done button) | tracker | recorded, deferred |
| `aria-hidden-focus` (serious): `#ppal-more-panel` is `aria-hidden` while closed but its buttons stay focusable | tracker | the focusable part is keyboard work (batch 3); the ARIA part is deferred |

Tab sweep (desktop, 69 stops): 9 stops show no focus indicator, all the header navigation tabs (`.tb-app-tab`: Create, Edit, Track, Stash, Stats). Everything else in the sweep has an outline or a ring.

Hint banners: the `tracker-hint` "Click or drag to mark/unmark cross stitches" line is 3.48:1 (brand colour on the pale tint), below 4.5:1; the "Tap any stitch" line is 8.96:1.

200% zoom: covered by the Phase 4 hunt (no sideways scroll at 196, 384 and 720 px wide; the controls strip now scrolls when short). Colour-only information, by inspection: the done state (above), the highlighted colour (a dim of the others, no second cue beyond the pattern), Stats chart series and milestone achieved versus upcoming (to be checked in batch 4).

### Baseline performance on `main` (`harness/drawbench.js`, 300x300 fixture, 20% done)
Chrome task time (CDP `TaskDuration`) so paint work counts wherever it runs; medians of sessions.

| Measure | 1x CPU (5 sessions) | 4x throttle (3 sessions) |
|---|---|---|
| Zoom step (full tile repaint), ms per step | 121 | 553 |
| Pan, ms of task time per 37 px step; p95 frame gap | 32 ms; 100 ms | 127 ms; 700 ms |
| Drag-mark of 60 cells, ms of task time for the stroke | 779 | 5,130 |
| Single mark (partial repaint), ms per mark | 30.5 | 135 |
| JS heap after GC, before and after | 20.8 and 19.0 MB | 20.8 and 19.0 MB |

Raw output in `reports/tracking-audit/perf/phase5-baseline/`. These are comparisons, not absolutes: the task-time figures include the harness's own mouse and key events. Phone-emulated tap latency (`phonebench.js`) is the other guard.

## Batch 1: done-state style and low-zoom colour (TRACK-09 core)

What changed:
- **Two looks, one cache** (`colour-utils.js`: `doneStitchLook`, `pendingStitchLook`). Done is the thread colour held to at most luminance 180 (so white and cream threads stay clearly darker than the fabric); not done is the thread colour desaturated 55% and lightened 65% (the fade is the existing `lowZoomFade` setting when it is set). Both are cached per colour in a map, so drawing no longer builds a colour string per cell. Over a fine colour grid the not-done look is at least 48 luminance units lighter than the done look for every thread.
- **Below the symbol tiers** (tier 1, and tier 2 up to about 12 px) every cell in Symbol and Colour views is one solid pixel: done in its thread colour, not done faded. A tiny symbol is still drawn from 7 px up. Highlight views keep their own rules.
- **From the symbol tiers up** (default style, "Thread colour"): a done cell fills with its thread colour and keeps a dimmed symbol; a not-done cell is the fabric with its symbol in Symbol view and a lighter thread colour with its symbol in Colour view. The old pale green wash is gone.
- **Corner tick** (the other style, selectable in More > View and in Preferences > Stitch Tracker > Finished stitches, key `trackerDoneStyle`, default `fill`): a done cell keeps its not-done look and gains a dark corner triangle with a pale edge. Below the symbol tiers the tick falls back to the solid look (a tick would be a pixel).
- Everything goes through `drawStitch`, so `repaintChartCells` / `paintDoneChanges` repaint a marked stitch in the new look with no other change: one cell per mark, as before.
- Help ("Finished stitches") and changelog 1.0.132.

Evidence after (`harness/look.js`, same fixture; the spec asserts these, threshold 40 luminance units):

| View | 3 px | 8 px | 19 px |
|---|---|---|---|
| Symbol | gap 95 (was 31) | gap 94 (was 30) | gap 121 (was 15) |
| Colour | gap 95 (was 3) | gap 94 (was 3) | gap 65 (was 3) |

Tick style: the corner of a done cell is 0 to 126 luminance against 255 for a not-done corner at 19 px; at 3 and 8 px it uses the solid look (gap above 40).

Tests: `tests/doneStyle.test.js` (16), `tests/e2e/phase5-batch1.spec.js` (12: the greyscale gaps in both views at 3, 8 and 19 px, the tick, single-stitch repaint touching only its own cell, switching the style live, the View tab control).

Found while testing: the touch-tablet Playwright project's iPad profile (user agent and 2x density) holds a 300x300 chart at about 5 px cells under the iOS canvas limits whatever zoom is saved, so the measuring spec runs as a desktop browser at 1x. That is existing behaviour (a real iPad has the same ceiling for that pattern), not a change.
