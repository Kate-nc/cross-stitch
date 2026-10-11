# Phase 2 progress log: one truth for the numbers, plus quick bug fixes

## Plan (agreed with the user at the start of the phase)
Order kept as written in `phase-02-one-truth-for-numbers.md`. Batch 1 additionally carries three items the user approved after the Phase 1 report:
the daily-snapshot fix, the backup reminder on Home, and a time-boxed look at the intermittent `save-durability` test.

| Batch | Scope | Status |
|---|---|---|
| 1 | BUG-01 to BUG-05, daily snapshot fix, Home backup reminder, flaky-test look | merged (PR 282) |
| 2 | Shared `progress-units` module, counters, every display (STATS-01) | in review |
| 3 | Unpicking and catch-up semantics (STATS-04, STATS-07) | not started |
| 4 | Day-boundary attribution, single date helper (STATS-05) | not started |
| 5 | Shared estimator and presentation (STATS-02) | not started |

## Performance method (user's priority for this phase: no update may compromise it)
`reports/tracking-audit/harness/bench.js <label> [runs]` measures, in fresh browser contexts: load to a drawn 300x300 chart, tap latency (click to counts text change), a 60-move drag and its p95 frame gap, project Stats open time and global Stats open time (500-session project from `hist500.js`). Results are committed under `reports/tracking-audit/perf/`. Baseline taken on `main` at the start of the phase (`baseline-phase2-start.json`, 7 runs). The rule from the working agreement applies to every batch: more than 5% worse on any median is a failed batch. The baseline's own run-to-run spread is wider than 5% on some measures (global Stats 567 to 823 ms, load 1,232 to 1,395 ms), so each batch compares medians and also reports min and max; a difference inside the baseline spread is "no measurable change", not a pass or a fail.

Baseline (medians, ms): load to canvas 1,309; tap 20; drag 60 moves 1,077; drag frame gap p95 17; project Stats open 66; global Stats open 663.

## Batch 1

### What changed
- **BUG-01:** `stats-activity.js` and `stats-page.js` are wrapped in functions, like `stats-insights.js`, so their top-level `useState`, `h` and `ymd` no longer clash. The Activity tab opens.
- **BUG-02:** the progress share image reads `streakInfo.current` (it read a field that does not exist, so the streak was always missing).
- **BUG-03:** the em dashes in `home.html` (title and comments), `index.html` and `create.html` repaired from double-encoded UTF-8; a test scans shipped source for the pattern.
- **BUG-04:** Fit fits the whole pattern on both axes (`fitWholeView`, same method as the work-area fit); the rail Fit button and the Fit chip now both call it.
- **BUG-05:** "~N session(s)" pluralised; global Stats "Projects" reads "N finished" with "M in progress" under it.
- **Daily snapshot:** it called `getStitchingDateLocal`, which only exists inside `useAutoSession`, inside a swallowed try/catch, so it never saved. It now uses the shared `getStitchingDate` with the project's day-end hour, compresses in an idle callback (the compress was a few ms on the mark path before; now it is off it), records the pattern size, and failures are logged. Stats > Compare says so instead of drawing a snapshot from before a size change on today's grid.
- **Home backup reminder:** `home-app.js` calls `BackupReminder.maybeRemind()` 4 s after the project list loads if any project has stitches done; same once-per-session gate as the Tracker, so it never shows twice in a visit, and it never starts the 14-day clock for someone who has stitched nothing.

### Decisions and deviations
- BUG-04 uses the existing work-area fit method rather than a new formula, so the two behave the same.
- Snapshots keep their existing record shape; `w` and `h` are optional new fields (older snapshots are detected by the length of their data instead).
- Daily snapshots begin now: nothing was ever saved before, so there is no history to recover.

### Tests added
`tests/statsScriptsCoexist.test.js` (3, fails on the old files with the exact error), `tests/shippedFilesEncoding.test.js` (4), `tests/phase2Batch1.test.js` (7), `tests/e2e/phase2-batch1.spec.js` (5: Activity opens, tall pattern fits, snapshot on a new day with a faked clock, Home offers the reminder, Home does not offer it when nothing is stitched).

### Performance, batch 1
Two measurements, because the first looked worse and needed explaining.

1. Sequential (baseline run at the start, "after" run an hour later, 7 runs each): load to canvas +7.3% (1,309 to 1,404 ms), project Stats +9.1% (66 to 72 ms), tap -15%, drag -0.3%, frame gap 0%, global Stats -5%. Two medians were over the 5% line, but both sit inside the baseline's own spread (load 1,232 to 1,395 ms) and the machine drifts between runs: the "main" build measured later in the same session loaded in 1,436 ms.
2. Interleaved A/B (main in a worktree on port 8001, this branch on 8000, alternating A,B,A,B,A,B with 4 runs each, 12 runs per side; raw files in `reports/tracking-audit/perf/batch1-ab/`):

| Measure | main (median, range) | this branch | Change |
|---|---|---|---|
| Load to drawn 300x300 chart | 1,436 ms (1,341 to 1,595) | 1,429 ms (1,317 to 1,508) | -0.5% |
| Tap latency | 16 ms (14 to 27) | 17 ms (14 to 24) | +6.2% (1 ms; the timer's resolution; ranges overlap) |
| 60-move drag | 1,078 ms | 1,062 ms | -1.4% |
| Drag p95 frame gap | 17 ms | 17 ms | 0% |
| Project Stats open (500 sessions) | 76 ms | 68 ms | -10.6% |
| Global Stats open (500 sessions) | 682 ms | 672 ms | -1.6% |

Reading: no measurable regression. The tap difference is one millisecond, within the spread of both builds, and the batch changes nothing on the tap path; it is reported rather than hidden. Method lesson for the later batches: compare interleaved, never against an old baseline file.


## Batch 2: one definition of progress (STATS-01)

### What changed
- New `progress-units.js` (plain script, also `require()`-able): `progressUnits(counts, {include})`, `fromProject(record)`, `sessionUnits`, `sessionNet`, `liveSessionNet`, `formatUnits`, `remainingWhole`, `breakdownText`. The weights are one table (`full 1, half 0.5, quarter 0.25, petite 0.25, knot 1`; backstitch counted separately, not in the percentage), so Phase 6 adds a type with one row.
- **Tracker:** the strip, header chip, Progress info popover, project Stats props, share text, estimated completion and the completion projection all read it (they had been mixing full-stitch-only counts with combined counts). The strip shows "4 done · 1,755 to go" and, when the project has them, a short breakdown ("2 half, 1 knot"). The existing incremental counters are the input (O(types) per mark); nothing rescans.
- **Sessions:** new sessions record `units`, `unitsCompleted` and `unitsUndone` beside `netStitches` (kept). Every place that adds sessions up (daily totals, week and month, speed, streak days, Activity, Insights, stash usage, Home meta, CSV) reads `units ?? netStitches` through `ProgressUnits.sessionNet`. `totalAtEnd` and `percentAtEnd` are in units. Old sessions are never rewritten.
- **Stored records (Home, library, global Stats, stash):** `project-storage.js` builds the `project_meta` and `stats_summaries` rows through `progressOf`, which calls the shared module (the three private counters are gone). Rows carry `unitsV: 1`; `ProjectStorage.refreshProgressRows()` rewrites older rows once, in idle time, reading each project and writing only its two summary rows (never the project), triggered from Home. `stats-page.js`'s own count was replaced by `fromProject`.
- Pages that use it load `progress-units.js` (and the service worker precaches it); `tests/progressUnitsLoaded.test.js` checks every page.

### Decisions and deviations
- Totals and "done" are shown as whole units (a half stitch is half a unit, so a half-stitch-only project shows 1.5 as 2). "To go" is worked out from the two rounded numbers, so the three always add up (found by the browser test).
- The strip still follows the visible-layer filter (`statsCountMode`), now through the module's `include` option; every other figure counts all types.
- Share text still begins with an emoji (outside this phase's scope; noted for the house-rule sweep).
- `sync-engine.js`'s session fingerprint still reads `netStitches` on purpose (it identifies a session; changing it would make every old session look different).

### Tests added
`tests/progressUnits.test.js` (10), `tests/progressUnitsLoaded.test.js`, `tests/projectMetaAnyProgress.test.js` (+ refresh), `tests/setup/progress-units.js` (jest setup so tests that run `project-storage.js` alone get the global the pages get from a script tag), and `tests/e2e/progress-units.spec.js` (3: 4 / 1,759 (0.2%) in the strip, popover, Stats and the library row; half-stitch-only; a session records units).

### Batch 2 performance (interleaved A/B, main in a second worktree; raw files in `perf/batch2-ab/`)
The first comparison read tap latency +12.9% and global Stats +7.4%, over the 5% line, so the PR was held. Causes removed: `toLocaleString("en-GB")` built a new number formatter on every call (now one cached `Intl.NumberFormat`), the info strip computed the breakdown text twice (now once), and "to go" no longer formats separately.

| Measure | main (median, range) | this branch | Change |
|---|---|---|---|
| Load to drawn chart | 1,360 ms (1,165 to 1,555) | 1,358 ms (1,222 to 1,471) | -0.1% |
| Tap latency, one tap (1 ms resolution) | 14 ms (13 to 23) | 16 ms (13 to 21) | +14%, a 2 ms step on a rounded timer; ranges overlap |
| Tap latency, 25 taps x 2 sessions x 3 rounds (`tapbench.js`) | median 8.6 ms | median 8.8 ms | +2% (means 9.7 vs 9.4 ms, so noise) |
| 60-move drag | 1,056 ms | 1,072 ms | +1.5% |
| Drag p95 frame gap | 17 ms | 17 ms | 0% |
| Project Stats open (500 sessions) | 66 ms | 63 ms | -3.8% |
| Global Stats open (500 sessions) | 619 ms | 608 ms | -1.9% |

Before the formatter fix the 50-tap bench read medians 8.9 (main) vs 9.4 ms (branch), about +5%. After, +2%.

## Batch 3: unpicking and catch-up (STATS-04, STATS-07)

### What changed
- `progress-units.js` gains `sessionAdded` (what a session marked, without catch-up, never reduced by unpicking), `sessionUnpicked`, `sessionCatchUp`, `sessionActive` and `liveSessionAdded`. `sessionNet` stays for progress (charts, stash, the stored thread log).
- Today, this week and this month, speed and pace (Stats, global Stats, Insights, popover, mini bar), best day, the daily chart, the Activity heatmap, goals, "fastest session" and the saved-session toast all read additions. A session of +50 and -80 is Today 50, Unpicked 80, progress -30.
- Streaks and "active days" (daily and weekly) skip a day that only unpicked or only caught up. A session with no stitch figures at all (hand-made or imported with a duration only) still counts, as before.
- The session journal shows "Unpicked N" and "Catch-up N" beside the stitches; Progress info shows "Unpicked today"; its pace now comes from what sessions added, so it matches the Stats page (the audit saw 162 vs 172).
- Catch-up: sessions carry an optional `catchUp` (units, inside `unitsCompleted`). Marking a whole colour done (palette tile) asks once "Count these as today's stitching?" with Catch-up / Today's stitching / Cancel, and remembers the answer in the new `trackerMarkAllAs` preference (Ask me, Catch-up, Today's stitching) in Preferences, Stitch Tracker, Statistics. Unmarking a whole colour needs no question. The session CSV gains a trailing `Catch-up` column.

### Decisions and deviations
- The prompt's other catch-up triggers (edit-mode changes, undo of marks from an earlier session) are not tagged: edit-mode changes do not move the done marks; an undo is already shown as Unpicked and no longer hurts Today or pace. Tagging undo of older marks would need to know which session made each mark, which is not stored. Noted as a known gap.
- Rectangle-select and drag marking are ordinary stitching, not catch-up (the time was spent).
- A stitch marked and then unpicked in the same session still counts once in "added" (the prompt's definition: additions only). Pace is therefore slightly generous for people who correct mistakes; the unpicked figure is shown beside it.
- Old sessions are not rewritten. Past days can read differently now: a day that was +50/-80 used to show -30 and now shows 50 (the prompt's intent).
- `isComplete`, progress, `totalAtEnd`, the derived stitch log and stash thread usage still use net marks.

### Tests added
`tests/phase2Batch3.test.js` (11: the worked example, old net-only sessions, Today, speed, best day, streaks incl. catch-up and no-figure sessions, CSV), `tests/e2e/phase2-batch3.spec.js` (4: asks once and records catch-up, remembered choice, counted-as-today adds to Today, unpicking shows Unpicked and Today stays 0). Updated `liveAutoStitchesClamp`.

### Batch 3 performance (interleaved A/B, main at `5054ed1`; raw files in `perf/batch3-ab/`)
| Measure | main (median, range) | this branch | Change |
|---|---|---|---|
| Load to drawn chart | 1,424 ms (1,188 to 1,656) | 1,402 ms (1,289 to 1,635) | -1.5% |
| Tap latency, one tap | 18 ms (13 to 22) | 15 ms (13 to 18) | -14% (noise; 1 ms timer) |
| Tap latency, 25 taps x 2 sessions x 3 rounds | median 8.3 ms, mean 8.9 | median 8.2 ms, mean 8.9 | -1% |
| 60-move drag | 1,061 ms | 1,067 ms | +0.6% |
| Drag p95 frame gap | 17 ms | 17 ms | 0% |
| Project Stats open (500 sessions) | 70 ms | 68 ms | -2.9% |
| Global Stats open (500 sessions) | 632 ms | 610 ms | -3.5% |

The mark path gained one ref read per progress change; `sessionAdded` replaces `sessionNet` at the readers with the same cost.
