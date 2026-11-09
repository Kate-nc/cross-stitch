# Track Mode: work-area counts per mark

**Date:** 2026-11-09 · **Base:** `main` at `08c78b4` (`1.0.243`)
**Scope:** what the Stitch Tracker (`stitch.html`) recounted after each mark while a work area is active (`areaStats` and `areaColourCounts` in `tracker-app.js`), and what changed. Follows the earlier audit of `efb1ef0`, re-checked against current code first.

## Summary

**A mark inside a work area now costs the cells it changed, not the area's size.** Both memos rescanned the whole area after every mark: the area's progress (the bar and its "% done") and again its per-colour counts (the colour list, highlight cycling and "mark all" while the area is active). Each scan also walked every half stitch on the chart. The counts are now built once, when the area, pattern or marks are replaced, and updated from each mark's changed cells through the same counter hook that keeps the whole-pattern counts (`useStitchCounts.js`).

| 600 x 800 chart, one mark (Node, no browser) | Before | After |
|---|---:|---:|
| Pattern cells read, 100 x 100 area | 20 000 | **1** |
| Pattern cells read, whole chart as the area | 960 000 | **1** |
| Half stitches visited (68 571 on the chart), any area | 137 142 | **0** |
| Time, whole chart as the area (median / p95) | 19.9 / 22.6 ms | **0.011 / 0.027 ms** |
| Time, whole chart with half stitches | 26.3 / 43.4 ms | **0.012 / 0.029 ms** |

In the browser (`npm run perf:track-baseline`, `ONLY=area-mark`, 12 taps a second apart, three runs before and two after, Pixel 5 emulation at 4x CPU; emulated, not a device):

| Scenario | Longest task before | after | Blocking time (TBT) before | after |
|---|---:|---:|---:|---:|
| Huge chart (600 x 800), whole chart as the area | 137-170 ms | **51-54 ms** | 343-460 ms | **1-6 ms** |
| Huge chart, 100 x 100 area | 0-50 ms | 0 ms | 0 ms | 0 ms |
| Desktop, huge, whole chart as the area | 0-59 ms | 0 ms | 0-9 ms | 0 ms |
| Large mixed chart (half stitches), whole chart as the area | 704-752 ms | 707-770 ms | 1 374-1 744 ms | 1 320-1 499 ms |

- **Where it shows.** On a phone, a large area: each tap's counting work made the task after it about 90-120 ms longer (the longest task fell from 137-170 ms to 51-54 ms, and the blocking time with it). Tap latency itself (Event Timing, input to next paint) was already 72-152 ms either side and is unchanged within run-to-run noise: the counts are worked out in the render that follows the tap's own paint, so the cost landed as a stall on whatever came next (the next tap, a scroll) rather than in the tap.
- **Small areas did not need it.** A 100 x 100 area cost about 0.4 ms a tap unthrottled. The change makes no difference there that can be measured in the browser.
- **The mixed chart is slow for a different reason.** Its 0.7 s tasks are taps on half stitches, which repaint the whole tile and re-estimate thread use: baseline finding 4 ([track-mode-performance-baseline.md](track-mode-performance-baseline.md)), not the area counts. Unchanged here.

Raw results: [work-area-counts-before.json](track-mode-baseline/work-area-counts-before.json), [-before-2.json](track-mode-baseline/work-area-counts-before-2.json), [-after.json](track-mode-baseline/work-area-counts-after.json); the Node table is `node tests/perf/area-counts-bench.cjs`.

## Re-validating the earlier audit

At `efb1ef0`, and still on `main` at `08c78b4`:

- `areaStats` was `useMemo(() => countRect(workArea), [areaOn, workArea, pat, done, halfStitches, halfDone, sW])`. `done` is a new array on every mark, so it rescanned the area every mark. `countRect` also walks `halfStitches` in full and tests each against the area.
- `areaColourCounts` had the same dependencies and did the same two walks, keyed by colour.
- Neither had been touched by the tracker work since. The whole-pattern counts already avoided this (the T-5 invariant in `useStitchCounts.js`: one full count on a structural change, deltas from each mark), so the area was the one place still rescanning.

## What changed

**Counting** ([work-area.js](../work-area.js)): `WorkArea.buildCounts(area, pattern, width, done, halfStitches, halfDone)` scans the area once and returns `{ total, done, colours }` in the shape the tracker already used. `applyDoneDelta(state, changes, newDone)` and `applyHalfDelta(state, idx, side, old, new)` update it from changed cells. Weighting is unchanged: a full stitch is 1, each side of a half stitch 0.5 in the totals and 1 in its colour's `halfTotal`/`halfDone`; `__skip__` and `__empty__` cells are not stitches. A delta replaces the colour entries it changes, and the colours object once, so an object a render already saw never changes under it.

**Keeping it in step** ([useStitchCounts.js](../useStitchCounts.js), "Work-area counts"): the hook that keeps the whole-pattern counts now keeps the area's too, through the same two functions every mark already calls. A delta is applied only when it is known to start from the marks the area counts reflect; each mark path now passes the marks it started from (`applyDoneCountsDelta(changes, pattern, newDone, baseDone)`, and the before and after maps for half stitches). The counts are rebuilt, deliberately, when:

| Event | How it is caught |
|---|---|
| Project load, pattern edit, half-stitch layout change | The pattern or half-stitch map is a new object |
| Area chosen, stepped, resized or left | The rectangle differs (left: the counts are dropped) |
| Another tab's or device's progress merged in, reconcile after a pattern change | `recomputeAllCounts` marks them stale |
| Any path that replaces `done` or `halfDone` without a delta | The marks read are not the ones the counts reflect |
| A delta with no starting marks, or from other marks | Marked stale, rebuilt on the next read |

So a missed path costs a rescan (what every mark cost before), never a wrong count.

**Tracker** ([tracker-app.js](../tracker-app.js)): `areaStats` and `areaColourCounts` read the hook's counts in one memo. `countRect` stays for stepping to the next unfinished area (other areas, scanned on demand) and is the reference the tests hold the incremental counts to.

**Not changed.** Progress records, undo and redo history, sessions and thread accounting do not read these counts. Nothing about saving, sync or the cross-tab merge changed; only how the tracker reads its own state for display.

## Tests

[tests/workAreaCounts.test.js](../tests/workAreaCounts.test.js) (Jest, in `npm test`):

- `buildCounts` against an independent full recount, and the half-stitch weighting on a cell with one side done;
- 2 000 random steps (taps anywhere, runs of 1-60 cells that mark or unmark, undos, half-stitch sides), compared with a full recount every 50 steps;
- a mark on a 300 x 300 area reads only the changed cells (pattern reads counted through a proxy);
- through the hook as the tracker uses it: taps, a range across the area's edge, five undos and three redos with no rebuild; half-stitch sides one at a time and several into one map (unpick); 50 marks on a 250 x 250 area reading at most 2 cells each;
- every rebuild path above: area switch, leaving and re-entering, another tab's progress merged in, marks replaced without a delta, a delta without its starting marks, a delta from stale marks, a half-stitch delta from a stale map, a pattern edit and a half-stitch layout change, each followed by a comparison with a full recount;
- the tracker source: the area counts come from the hook, and every `applyDoneCountsDelta` and `applyHalfDoneDelta` call passes its starting marks.

Breaking the delta (a mark-off that does not decrease the area's total) fails 4 of them; trusting a delta whatever its starting marks fails the stale-base test.

## Not covered

- **Physical devices.** None used; the browser figures are emulated (software raster, 4x CPU throttle).
- **WebKit.** The sandbox has no WebKit build. The change is plain JavaScript with no engine-specific path.
