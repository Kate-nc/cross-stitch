# Phase 2 report: one truth for the numbers, plus quick bug fixes

Status: all five batches are merged (PRs 282 to 286). This closing PR holds the end-of-phase hunt (new tests, a few stale-label fixes it found) and this report. Phase 3 has not been started and will not be until you say so.

## What shipped

| PR | Batch | Findings | Outcome |
|---|---|---|---|
| #282 | 1: quick bug fixes | BUG-01 to BUG-05, daily snapshot, Home backup reminder | Activity tab opens; share image shows the streak; page titles repaired; Fit fits both axes; wording fixed; the daily automatic snapshot works (it never saved before); Home offers the backup reminder |
| #283 | 2: one definition of progress | STATS-01 | `progress-units.js`: full 1, half 0.5, knot 1, quarter and petite 0.25 in one table; the strip, header, popover, project Stats, Home, library, global Stats, stash, share text and CSV all read it; summary rows rewritten once in idle time |
| #284 | 3: unpicking and catch-up | STATS-04, STATS-07 | Today, pace, best day and streaks count what was added; "Unpicked" and "Catch-up" shown on their own; marking a whole colour done asks once whether it counts as catch-up |
| #285 | 4: day boundaries | STATS-05 | Each stitch on the day it was made (a session across the day end is saved as one record per day); one date helper; one "Day ends at" setting beside the goals and in Preferences |
| #286 | 5: one estimator | STATS-02 | One calculation, range and basis everywhere; "Not enough history yet" under 3 stitching days or 5%; Home cards no longer count hours as days |
| this PR | closing | end-of-phase hunt | Consistency matrix, clock-change and legacy-project tests, the audit's history project pinned, stale labels fixed, a dead control removed |

Version entries 1.0.113 to 1.0.119 are in the in-app changelog; help text covers how progress is counted, unpicking, catch-up, day boundaries and finish estimates.

## Acceptance criteria against the prompt

| Criterion | Result |
|---|---|
| Units: 1,742 full + 30 half sides + 2 knots, mark 2 full, 2 half, 1 knot: 4 / 1,759 (0.2%) in the strip, header, popover, project Stats, Home card, share text, CSV and image | Pass for the strip, header, popover, project Stats, Home and library rows, global dashboard and share text (matrix test `phase2-matrix`, all three fixtures). The progress image shows the same percentage (it reads the shared overview); the session CSV carries cumulative totals in units; neither is drawn or parsed in a browser test |
| Only half stitches done (3 sides = 1.5 units) | Pass: 2 / 1,759 (0.1%) everywhere (1.5 shows as 2, the percentage is exact) |
| Unpicking: +50 and -80 is Today 50, "Unpicked 80", net -30; a day of only -80 is not an active day; speed uses additions only | Pass (unit `phase2Batch3`, e2e `phase2-batch3`) |
| Midnight: 10 at 23:50 and 20 at 00:02 are 10 on the 10th and 20 on the 11th; with a 2:00 AM day end all on the 10th; "today" identical before and after the session closes | Pass in the browser with a faked clock (3 and 2 stand in for 10 and 20; `phase2-batch4`). Today is 2 live and 2 after saving, in Progress info; project Stats and global Stats do not show a "today" figure of their own |
| Clocks going back (25 October 2026) | Pass: 23:58 on the 24th and 00:01 on the 25th (the 25-hour day) are two days; with a 2:00 AM day end both 01:30s (BST then GMT) belong to the 24th. Unit tests also cover the 29 March 23-hour day |
| Estimate for the history fixture: "about 5 days (around 16 Oct)" everywhere, with one basis line; fewer than 3 stitching days shows "Not enough history yet" | Pass for the date, the words and the basis. **One difference from the prompt:** the fixture's mean is 135 stitches per stitching day (1,350 over 10 days), not 145; 145 was the old recency-weighted figure. The answer (2 stitching days, about 5 calendar days, 16 Oct) is the same either way |
| Catch-up: a 387-stitch colour done as catch-up adds 387 to progress and 0 to pace, speed, goal and streak; the journal shows "Catch-up 387" | Pass (units, journal line in `components-stats.js`; browser test uses a 200-stitch colour) |
| Statistics hand-verified in the audit unchanged for the history fixture (milestone dates 18 Sep, 24 Sep, 2 Oct, 8 Oct; streaks 1 / 3; best day 300; average session 47 min; week 440 vs 250, +76%; weekly streak 4; 84.4%; speed 172) | Pass (`phase2HistoryFixture`, pinned with a fixed clock). The only deliberate change is the finish estimate, from "13 Oct" and "~17 Oct" to one answer, 16 Oct |
| Activity tab opens and renders the calendar; share image shows the streak; page titles correct | Pass (batch 1 tests) |

## End-of-phase bug hunt

Exercised, with results in `phase-2-bughunt.md`:
- **Figure-consistency matrix** (special, history and only-halves fixtures; browser): every place a figure appears yields the same value: percent, done, remaining, Today, week, pace, estimate and its basis, in the strip, header chip, Progress info, project Stats, share text, Home and library rows, and the global dashboard.
- **Clock changes** (browser, Europe/London): see the criteria table.
- **Legacy project with only `totalTime` and no sessions:** Home, Home Stats, global Stats and the Tracker show the project with its progress (100 of 400, 25%), the old time (2 hrs 0 min) and speed (50 st/hr), no NaN or undefined anywhere, and "Not enough history yet" instead of an invented estimate.
- **The audit's history project, pinned:** every value the audit verified by hand is a test now.
- **Stale labels (found and fixed here):**
  - the share text said "N/day average" (an average that was neither per stitching day nor per calendar day) and a bare "Est. completion" date; it now says "per stitching day recently" and gives the one estimate with its range and what it is based on;
  - the progress picture said "Stitches/day"; it says "Per stitching day" and uses the same pace;
  - "Pace needed" and the daily-goal line said "/day"; they say "per stitching day";
  - the "Pace calculation" choice (active days or calendar days) no longer changed anything after the single estimator, so the control is removed (the saved value is left alone and harmless).
- **Dead code (found and removed here):** the Tracker had a private copy of the share text (`copyProgressSummary`, with an emoji and its own estimate) that nothing called, and its helper `copyText`. A persistence test that was inspecting that dead line now checks the live share text.
- **Full unit suite and browser suite** (see "Failing browser tests" below).

## Performance

The rule for the phase was no update may slow the app. Every batch was measured interleaved against `main` (never against an old baseline file, because this machine drifts), with a tap-only benchmark added in batch 2. All five batches finished inside the 5% line; two of them (batches 2 and 5) first read over it, which is why the benchmark was added and why batch 2's number-formatting cost was fixed before its PR. Whole phase, interleaved against the commit before Phase 2 began (two passes, 12 runs each, medians):

| Measure | Before Phase 2 | Now (pass 1 / pass 2) | Change |
|---|---|---|---|
| Load to drawn 300x300 chart | 1,741 / 1,819 ms | 1,720 / 1,720 ms | -1.2% / -5.5% |
| Tap latency, one tap (1 ms timer, ranges overlap) | 21 / 23 ms | 24 / 19 ms | +14% / -17% (noise) |
| Tap latency, 25 taps x 2 sessions x 3 rounds | median 11.2 ms, mean 12.3 | median 10.5 ms, mean 11.5 | -6% |
| 60-move drag | 1,114 / 1,108 ms | 1,119 / 1,076 ms | +0.5% / -2.9% |
| Drag p95 frame gap | 17 ms | 17 ms | 0% |
| Project Stats open (500 sessions) | 90 / 84 ms | 98 / 84 ms | +8.8% / 0% (noise; ranges overlap) |
| Global Stats open (500 sessions) | 908 / 894 ms | 860 / 834 ms | -5.2% / -6.6% |

Pass 1's project Stats reading (+8.8%) was over the line; pass 2 read 0%, with ranges that overlap in both, so it is noise, but I am reporting it rather than only the pass that looks better. Raw files are under `reports/tracking-audit/perf/` (one folder per batch and `phase2-end/`).

## Data and migration statement (as shipped)

- **Projects:** no change to `done`, no schema change, version stays 11. Old sessions are never rewritten.
- **Sessions, new optional fields:** `units`, `unitsCompleted`, `unitsUndone`, `catchUp`, `groupId` (and split records per stitching day). Readers use `units ?? netStitches`, so sessions from before units existed still add up. Past days can read differently: a day that was +50 and -80 used to show -30 and now shows 50 (additions); percentages are exact because they derive from `done`.
- **Summary rows** (`project_meta`, `stats_summaries`): new optional fields `unitsV`, `anyProgress`, `pct`, `paceDaily`, `firstActiveDate`, `activeDaysTotal`; the row version is 2 and a one-time idle refresh from Home rewrites older rows (only the two summary rows, never the project).
- **Preferences:** new `statsDayEndHour` (the app-wide day end; a project's old per-project value becomes it the first time that project is opened, if none is set, and is used until then) and `trackerMarkAllAs` (ask, catch-up or today's stitching). A new browser event `cs:prefchange` announces preference writes.
- **Removed:** the "Pace calculation" choice in Stats settings (see above).

## Decisions and deviations you may want to revisit

- The estimate is hidden under 3 stitching days or 5% (before it showed a date from one short session).
- The pace is the mean per stitching day over the last 4 weeks, not the recency-weighted average (simpler to say in one line; the prompt's 145 therefore reads 135 on the audit's own fixture).
- Pace is "per stitching day" everywhere; hours remaining and speed still use overall stitches per active hour, because how time and speed are measured is Phase 3 (STATS-03).
- Catch-up is tagged for "mark a whole colour done" only. Undo of marks from an earlier session shows as Unpicked (the session that made a mark is not stored), edit-mode changes do not move done marks, and rectangle or drag marking is ordinary stitching.
- A stitch marked and then unpicked in the same session still counts once as added.
- A catch-up-only session records about a minute of active time, which dilutes pace very slightly.
- The day-end setting is one value for the whole app, not per project.

## Failing browser tests: what they were, and whether they touch `main`

None of them can reach `main` or its CI: CI runs only the Jest job (`npm test` plus the bundle checks), never the Playwright specs, so these only show when someone runs the browser specs locally. Running the whole browser suite here at the start of the closing PR gave 9 failures after retry (161 passed). I ran those same specs against the code from before Phase 2 and all 9 failed there too, so none is a Phase 2 regression. Causes and what I did:

| Specs | Cause | Result |
|---|---|---|
| 30 specs (every Creator, convert, import, Home-create, fabric, French-knots and generate spec) | They load React and other libraries from cdnjs, which this sandbox blocks; the opt-in local library server (`E2E_LOCAL_CDN=1`) was only wired into 14 specs | Every spec now installs it (a no-op when the variable is unset); the local server now also serves pdf-lib and pdf.js (the pinned 4.2.67), which fixed all import and Print PDF specs |
| `french-knots` "a tap on a knot marks it done" | **Stale after batch 2 (mine):** it expected the strip to say "0 done" after tapping a knot, from when the strip counted full stitches only | Expectation updated to "2 done" (a knot is one unit) |
| `manager-touch` | The Manager page redirects to Home unless opened as Home opens it (`?from=home`), the Stash sections are now a menu, and a first-run tour covered the buttons | Spec follows the current flow |
| `tracker-touch` "two-finger fling coasts" | Timing: momentum only starts if the last move was under 80 ms before the lift, and on a loaded machine the test's own waits exceeded that; the app is correct | The last move and the lift are now sent together (4 of 4 passes; it failed 3 of 3 before) |
| `creator-touch` (2 specs) | Stale: they target the old desktop-style Creator toolbar (`.tb-strip`, `.tb-zoom-pct`) and an "Open file" button that the redesigned compact Creator and Home flow no longer have | **Not fixed**: rewriting them for the compact touch Creator is a separate piece of work; the newer `creator-touch-hints`, `-magnifier` and `-no-auto-paint` specs cover touch on the current UI |

Whole browser suite after these changes: 168 passed, 2 failed (the two `creator-touch` specs). Unit suite: 301 suites, 4,012 tests, all passing.

Still open from earlier phases: `save-durability` "second drag after the first autosave" is intermittent (about 1 run in 6 to 12), also on the commit before Phase 1; undiagnosed (it passed in every run in this pass).

## Not verified

Safari and Firefox; real devices and iOS storage; the Recent Pace card in `stats-page.js` and the Insights-page project cards (shared function unit-tested, not driven in a browser; the card is off by default); the progress image and CSV opened as files; `.csync` round trip with unit-bearing sessions; screen-reader behaviour of the catch-up dialog and the new settings; a time zone change in the middle of a session.

## Open questions for you

1. Phase 3 (time and history) next as written? It owns STATS-03 (what "time" and "speed" mean), which the estimate's hours remaining depends on, and STATS-06 (editing and deleting sessions), which interacts with the split records from batch 4.
2. Are you happy that the "Pace calculation" choice is gone (the one control this phase removed)?
3. Should catch-up also be offered for the other bulk actions (rectangle fill, "mark everything I did on paper"), or is the colour-done case enough until Phase 6?
