# Phase 2 bug hunt log

## Batch 1 (BUG-01 to 05, daily snapshot, Home backup reminder)

### Exercised
- `npm test` (293 suites, 3,930 tests), terminology lint, `node build-runtime-js.js --check`; Playwright: `phase2-batch1` (5), plus the Phase 1 specs for the area touched (see PR).
- Reproduced each original failure before fixing: BUG-01 with the old files in a VM (`Identifier 'useState' has already been declared`) and in the browser (the Activity tab test fails on the old files, passes on the new); BUG-03 with the old `home.html` (4 mojibake sequences); the snapshot with the old code (it throws `getStitchingDateLocal is not defined` into a swallowed catch).
- Fit: a 40x160 pattern fits the box on both axes (checked scroll size against client size).
- Snapshot: a faked clock moved a day forward; the first mark of the new day produced one `auto` snapshot with the pattern size.
- Home reminder: shows for a project with stitches done and a 20-day-old backup; does not show when nothing is stitched.
- Data safety: no stored data format changed; `doneSnapshots` entries gain optional `w` and `h`; old entries (no `w`/`h`) are handled by data length.
- Performance: see the progress log (interleaved A/B).

### Bugs found
- **Fixed here:** Compare drew any snapshot on today's grid, so a snapshot from before a size change looked wrong; it now says so.
- **Pre-existing, noted and not fixed:** the first mark of a new day is included in that day's snapshot of "yesterday" (the snapshot is taken after the mark is counted), so it is off by one stitch.
- **Intermittent `save-durability` test ("marks made a moment before a reload", second drag marks nothing, about 1 run in 6 to 12):** time-boxed look. A stripped copy that does the same two drags and records what is under the pointer passed 14 of 14 and always found the canvas under the pointer, so I could not reproduce the cause in isolation. It also fails on the commit before Phase 1, so it is not a regression. Left undiagnosed; if it appears in CI, re-run once and report.
- `index.html?mode=stats` redirects to Home when there is no active project (the audit's reproduction assumed one). Not a bug; the new test sets an active project.

### Not verified
Safari and Firefox; real devices; the Activity tab with a very large history (the 500-session project was timed for Stats open, not Activity).

### CI round (batch 1)
- CI failed on the first push: `creator/bundle.js` was stale (I had edited `creator/useCreatorState.js` and not rebuilt the bundle). `npm test` did not catch it because the staleness check is a CI step, not a test. Rebuilt and pushed, and added `tests/bundlesUpToDate.test.js`, which runs the same builds and fails (leaving the tree unchanged) if a committed bundle would differ; checked by appending a line to a Creator source file.

### Review round 1 (Copilot on PR 282; four findings, all verified)
- **Deferred snapshot could land in another project (High).** True: the idle callback was not tied to the project that scheduled it. It now captures the project id and drops itself if another project is open when it runs (a snapshot lost to a project switch within the idle window is acceptable; wrong-project data is not).
- **Daily snapshot never fired across a reload (Medium).** True, and the E2E test hid it by advancing the clock inside one mounted page. The last stitching day is now restored on load from the newest session, then `lastTouchedAt`, then `updatedAt` (a very short session is not recorded at all, found while testing, so the fallbacks matter). New browser test reloads between the two days.
- **Size mismatch used only the cell count (Medium).** True (10x20 and 20x10 have the same count). The stored `w` and `h` now decide, length is the fallback for older snapshots, and manual snapshots record the size too.
- **Home gate missed half-stitch-only projects (Medium).** True: `completedStitches` counts full stitches and knots only. Project meta rows now carry `anyProgress` (includes half stitches); Home uses it. Rows saved before this change get the field the next time the project is saved, so a legacy half-stitch-only project does not trigger the reminder until then.

## Batch 2: one definition of progress

### Exercised
- `npm test` (297 suites, 3,955 tests), terminology lint, `node build-runtime-js.js --check`, bundle-freshness test; Playwright regression 43 of 43 (Phase 1 and Phase 2 specs) on this code, plus `progress-units.spec.js` (3).
- Cross-check on one project (1,759 stitches, 4 done): the strip, header chip, Progress popover, project Stats, the Home/library row and share text all say 4 done and 0.2%. A half-stitch-only project shows the same figure everywhere (1.5 shown as 2).
- Data safety: old sessions with only `netStitches` still add up (`units ?? netStitches`); old summary rows are rewritten once by `refreshProgressRows`, which writes only the two summary rows, never the project; a second run changes nothing.
- Performance: interleaved A/B in the progress log. First run was over the 5% line on tap latency and global Stats; fixed (cached formatter, single breakdown computation) and re-measured.

### Bugs found
- **Fixed here:** "to go" and "done" rounded separately could disagree with the total by one (2 done + 1,758 to go vs 1,759); `remainingWhole` derives it from the two rounded numbers.
- **Fixed here:** formatter built per call on the tap path (performance, above).
- **Noted, not changed:** the sync fingerprint for sessions still reads `netStitches` on purpose; share text still starts with an emoji.

### Not verified
Safari, Firefox, real devices; a `.csync` round trip with unit-bearing sessions.

### Review round 1 (Copilot on PR 283; six findings)
- **Rows rounded away the exact percentage (High).** True for very small projects (1 full + 1 half side with only the half done is 33.3% but whole 1/2 reads 50%). Both summary rows now carry `pct` (one decimal from the unrounded units), and the library, Manager, command palette and Stats project lists use it, falling back to done/total for older rows.
- **Home card still counted full stitches (Medium).** True; `projectPct` in `home-app.js` now uses `ProgressUnits.fromProject`.
- **Breakdown listed hidden types (Medium).** True; `include` now filters the breakdown too.
- **Header chip and popover followed the strip's layer filter (Medium).** True; only the strip is filtered, the chip and popover use all layers like Stats and share text.
- **Milestones weighted half stitches as 1 and ignored knots (Medium).** True; the check now uses weighted units and the unit total.
- **Project Stats: rounded props, and other-project tabs counted full stitches only (Medium).** The other-project tab was true and is fixed (`fromProject`). The rounded props for the open project differ from the exact figure only on projects of a few stitches; the percentage shown there comes from the whole numbers, so I left it and say so on the thread.

## Batch 3: unpicking and catch-up

### Exercised
- `npm test` (298 suites, 3,968 tests), terminology lint, `node build-runtime-js.js --check`. Playwright: `phase2-batch3` (5), plus `progress-units`, `phase2-batch1`, `save-badge`, `backup-reminder`, `cross-tab-merge`, `pattern-change`, `phase1-hunt` (36 passed together).
- The audit's worked example in a unit test and in the browser: unmarking three earlier stitches leaves Today at 0 and shows "Unpicked today 3"; the unit test of +50 / -80 gives Today 50, Unpicked 80, net -30, and a streak that counts the day only because of the +50.
- Catch-up in the browser: marking a 200-stitch colour done and choosing Catch-up raises the strip from 20 to 220 done and leaves Today at 0; the remembered choice stops the question; "Today's stitching" gives Today 200; Preferences shows the row and saves the choice.
- Data safety: no format change (optional `catchUp`); sessions without units, without `stitchesCompleted`, or with no stitch figures at all are read without error (unit tests); old sessions are untouched. A session with no stitch figures still counts as an active day.
- Performance: interleaved A/B and tap bench, all within noise (progress log).

### Bugs found
- **Fixed here:** the first draft of the streak change would have dropped hand-made sessions that carry only a duration; `sessionActive` keeps them.
- **Noted, not fixed:** a catch-up-only session still records at least a minute of active time (the session duration has a one-minute floor and a tail credit), which dilutes pace very slightly. Excluding the time of catch-up-only sessions is a small follow-up if wanted.
- **Noted, not fixed:** a stitch marked and then unpicked in the same session still counts once as "added".
- **Noted:** tagging "undo of marks from an earlier session" as catch-up was not done (the session that made a mark is not stored); undo is shown as Unpicked instead.

### Not verified
Safari, Firefox, real devices; the catch-up dialog with a screen reader (it uses the shared Overlay, which traps focus); a very large `.csync` round trip with `catchUp` sessions.

### Review round 1 (Copilot on PR 284; six findings, all verified)
- **Active days still counted inactive sessions (Medium, five places).** True: the streak helpers had the filter but the overview of recent pace (`insights-engine.js`), the weekly summary (`stats-insights.js`), global Stats active days and the this-week/last-week comparison (`components-stats.js`), project comparison metadata (`project-storage.js`) and `computeWeightedPace` (`helpers.js`, which gave an unpick-only day a zero weight that pulled pace down) still counted every dated session. All now use `ProgressUnits.sessionActive`. Two unit tests added (pace unchanged by an unpick-only or catch-up-only day; overview active days).
- **Report said four e2e tests (Low).** True, there are five; corrected.

## Batch 4: day boundaries

### Exercised
- `npm test` (299 suites, 3,982 tests), terminology lint, `node build-runtime-js.js --check`. Playwright: `phase2-batch4` (4), plus `progress-units`, `phase2-batch1`, `phase2-batch3`, `save-badge`, `backup-reminder`, `cross-tab-merge`, `phase1-hunt` and `tracker-touch` (42 of 43 passed; the one failure is the two-finger fling test, see below).
- The audit's worked example with a faked clock: 3 marks at 23:58 and 2 at 00:01 save as 3 on the 10th and 2 on the 11th (one group, unique ids); Today reads 2 live and 2 after the session is saved; with the day ending at 2:00 AM they are one day of 5.
- Clock changes: the 25-hour day (25 October 2026) and 23-hour day (29 March 2026) end at the right wall-clock time; both 01:30s of the repeated hour belong to the previous day under a 2:00 AM day end.
- Data safety: no format change (optional `groupId` and per-day records; ids unique); existing sessions are not touched; a pending-session backup written by the old code (one object) still loads.
- Performance: interleaved A/B and the tap benchmark, all inside the 5% line (progress log).

### Bugs found
- **Fixed here:** Activity, the week comparison, Insights streaks and the global recent pace used the raw clock for "today", so late-night stitching counted for the wrong week or day on the global pages. They use the stitching calendar now.
- **Pre-existing, noted and not fixed:** `tests/e2e/tracker-touch.spec.js` "a two-finger fling coasts after release" is timing-sensitive; it fails 3 of 3 on `main` in this container as well (and only passed earlier on retry). Not related to this batch.
- **Noted:** a session left open across the day end with no further marks keeps showing the old day's live figure until the next mark or until it closes on idle (10 minutes by default).

### Not verified
Safari, Firefox, real devices; the day-end setting on a device whose time zone changes mid-session (the boundary is computed in the device's local time); global Stats and Activity with a faked clock (covered by the shared helper's unit tests, not by a browser run).

### Review round 1 (Copilot on PR 285; five findings)
- **Unload save stored the unsplit run and duplicated split records (High).** True: `finaliseAutoSession` returned the whole-run record and the unload handler merged that one into its snapshot, while the pending backup held the split records; recovery then skipped the first (same id) and added the rest. The finalise function now also exposes the saved records (a non-enumerable `records` property) and the unload save merges every record that is not already there. Source test added.
- **Split durations could exceed the run's total (Medium).** True (two 0.6 s parts each rounded up to 1 s). The run's saved seconds are now shared out by each day's active time with cumulative rounding, so the parts add up exactly; minutes follow. Unit tests added.
- **Split records inherited all the run's colours (Medium).** True: colours were copied to every part, so the journal and the colour timeline showed colours on the wrong day. Colours are now kept per day while the session runs and each part gets its own day's (older sessions in progress fall back to the run's list). Unit test added.
- **Changing the day-end hour left the running session's boundary stale (Medium).** True: the cached boundary and day were from the old setting. The preference store now announces changes (`cs:prefchange`) and a change to the day-end hour closes the running session, so earlier marks keep the day they were attributed to and the next mark starts a session under the new setting. Browser test added.
- **Migration ignored a project set to midnight (Medium), not changed.** 0 is the value every project is seeded with (`dayEndHour: 0` in the default settings), so a saved 0 cannot be told from "never set". Claiming it would let the first project opened, nearly always an untouched default, block the migration of a value the person did choose in another project. Replied on the thread with this.

## Batch 5: one estimator

### Exercised
- `npm test` (300 suites, 4,000 tests), terminology lint, `node build-runtime-js.js --check`. Playwright: `phase2-batch5` (4) in the touch-tablet project.
- The audit's worked example in a unit test and in the browser: 10 stitching days in the last 25, 145 per stitching day, 250 left gives "about 5 days" with "Based on your last 25 days: 2.8 stitching days a week, 145 stitches per stitching day" in the Tracker strip, Progress info, project Stats and on the Home card, and the date in the strip equals the date in Stats. A project with two stitching days says "Not enough history yet" in the strip, popover and Stats and shows no Home estimate.
- The what-if slider: 145 per stitching day gives "about 5 days at 2.8 stitching days a week". Global dashboard: the Goals pace line uses the same pace.
- Edge cases: unpicking-only and catch-up-only days are not stitching days; sessions older than 28 days are ignored; the cadence floor of one a fortnight; a project younger than 4 weeks uses its age; the day-end hour moves the window with the stitching calendar; nothing stitched for 4 weeks says so.
- Data safety: no stored data changed except new optional fields on the summary rows (`paceDaily`, `firstActiveDate`, `activeDaysTotal`); the row version bump makes Home's one-time idle refresh fill them in (it writes only the two summary rows, never the project).
- Performance: interleaved A/B and the tap benchmark, all inside the 5% line (progress log).

### Bugs found
- **Fixed here (found while reading the copies):** Home project cards computed "Est. 3 weeks" as remaining stitches / stitches per hour and read the hours as days, so a stitcher who does 100 stitches an hour with 3,000 left was told "Est. 2 days" regardless of how often they stitch. They use the estimator now.
- **Fixed here:** the "pace needed" for a target date (per calendar day) was compared with the average per active day, which could not be compared; both are per stitching day now.
- **Noted, not fixed:** hours remaining still uses overall speed (stitches per active hour), whose definition is STATS-03 (Phase 3). The mini stats bar and Stats "Speed" are unchanged.
- **Noted, not fixed:** the legacy dashboard card in `home-screen.js` ("Est. remaining" in hours) is hours of stitching, not a date, so it was left as is.

### Not verified
The global Recent Pace card in `stats-page.js` and the Insights-page project cards in `stats-insights.js` were checked by unit tests of the shared function and by code reading, not in a browser (the card is off by default in the page's settings and the Insights page needs a project in progress); Safari, Firefox and real devices.

### Review round 1 (Copilot on PR 286; seven findings)
- **Home's refresh gate still tested for version 1 (Medium).** True, and my browser test could not see it because it seeded a fresh row. With the row version bumped to 2, rows saved before never counted as stale on Home, so they never got `paceDaily` and showed no Home estimate until the project happened to be saved again. `ProjectStorage` now exposes `PROGRESS_ROW_VERSION` and Home compares against it (one shared check). New browser test: a project's row is made to look as it did before (version 1, no pace figures) and Home fills the estimate in.
- **What-if chart line ended on the wrong date (Medium).** True: it counted from the last recorded session, while the "about N days" beside it counts from today, and its day count lacked the estimator's outer round-up. The line now counts from today on the stitching calendar with the same two round-ups.
- **Pace needed could miss the target (Medium).** True (400 stitches in 20 days at 4/7 cadence gave 35 per stitching day, which needs 12 stitching days and 21 calendar days). It now divides by the whole stitching opportunities available (rounded down). Unit test checks the pace always gets there in time.
- **Arrow glyph in the what-if label (Low).** True, house rule; replaced with a colon.
- **"28 stitching days" wording (three places, Low).** True: the window is 28 calendar days with the stitching days inside it. Comments and the progress report corrected.

## End of phase

### Exercised
- `npm test` (301 suites, 4,012 tests); the whole browser suite (168 passed, 2 failed: the two stale `creator-touch` specs, see the report); the figure-consistency matrix, the audit's history project, the clock changes and the legacy `totalTime` project (new tests `phase2-matrix`, `phase2HistoryFixture`).
- Whole-phase performance against the commit before Phase 2, two interleaved passes plus the tap benchmark (report).

### Bugs found
- **Stale labels (fixed):** the share text said "N/day average" and a bare "Est. completion" date; the progress picture said "Stitches/day"; "Pace needed" and the daily-goal line said "/day". All now say what they measure ("per stitching day") and the share text carries the one estimate with its range and basis.
- **A control that did nothing (removed):** the "Pace calculation" choice (active days or calendar days) stopped affecting any figure once every pace and estimate used the one calculation.
- **Dead code (removed):** the Tracker's private copy of the share text (with its own estimate and an emoji) and its clipboard helper were called by nothing; a persistence test that inspected that dead line now checks the live share text.
- **A stale test of mine (fixed):** `french-knots` still expected the pre-batch-2 strip ("0 done" after a knot); it was not in the browser subset I ran for batch 2.
- **Spec setup (fixed):** see the report: 30 specs could not load their libraries in a sandbox; two specs followed old UI flows; one was timing-sensitive.
- **Discrepancy with the prompt (reported, not a bug):** the history fixture's mean is 135 per stitching day, not the prompt's 145 (the old weighted pace); the answer, 5 days and 16 October, is the same.

### Not verified
Safari, Firefox, real devices; the progress image and CSV opened as files; the two `creator-touch` specs' scenarios on the current compact Creator (covered by the newer touch specs, not these).
