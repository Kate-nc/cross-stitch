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
