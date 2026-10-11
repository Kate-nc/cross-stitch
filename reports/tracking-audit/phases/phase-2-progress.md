# Phase 2 progress log: one truth for the numbers, plus quick bug fixes

## Plan (agreed with the user at the start of the phase)
Order kept as written in `phase-02-one-truth-for-numbers.md`. Batch 1 additionally carries three items the user approved after the Phase 1 report:
the daily-snapshot fix, the backup reminder on Home, and a time-boxed look at the intermittent `save-durability` test.

| Batch | Scope | Status |
|---|---|---|
| 1 | BUG-01 to BUG-05, daily snapshot fix, Home backup reminder, flaky-test look | in review |
| 2 | Shared `progress-units` module, counters, every display (STATS-01) | not started |
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
