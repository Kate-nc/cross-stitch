# Phase 3 progress

Review before starting (conflicts with Phases 1-2) is in the session notes; the points are folded into each batch below.

## Batch 0: catch-up for rectangle fills (PR 288, merged)
A rectangle fill of more than 50 stitches asks the same "today or catch-up" question as marking a whole colour done.

## Batch 1: edit, delete and merge sessions (STATS-06)
- **Pure functions** in `helpers.js` ("Session history"): `deleteSessionRun`, `editSessionRecord`, `mergeSessionRecords`, `recomputeSessionHistory`, `sessionHistoryBaseline`, `withoutDeletedSessions`. They never change the list they are given, so Undo restores the exact previous list.
- **Day-split runs:** a run that crossed the day end is several records sharing `groupId`. Delete removes the whole run (all parts, all ids tombstoned). Edit changes the one record shown. Merge joins a record with the next one on the same day.
- **Recomputation:** every record's `totalAtEnd` / `percentAtEnd` is rebuilt as a running sum of units from the stitches done before the first record, so milestone dates, the cumulative chart, streaks, best day, week totals and the finish estimate (which all read the list) follow. `stitchLog` is rederived by the existing save path.
- **Fields (all optional):** session `edited`, `editedAt`, `timingBasis: 'edited'` (only when the minutes changed); project `deletedSessionIds`. No migration; version stays 11.
- **Sync (`sync-engine.js`):** sessions union by `id` (was a key on a `start` field that sessions do not have, so two different sessions with the same date, minutes and stitches collapsed); the later `editedAt` wins; tombstones from both sides are unioned and applied; the derived `stitchLog` is rebuilt once tombstones exist (the larger-count-per-day merge would otherwise bring a deleted day back). The Tracker's cross-tab merge unions tombstones too. The Creator keeps `deletedSessionIds` when it saves (`creator/useProjectIO.js`).
- **UI:** Session journal buttons Edit session / Delete session / Merge with next, an inline editor with validation, an "edited" label, and an Undo toast (applies only to the latest change).
- **Not in this batch:** the "Recalculate history" action (not needed: totals are rebuilt on every change).

### Tests
`tests/phase3Batch1.test.js` (17), `tests/e2e/phase3-batch1.spec.js` (4).

### Performance
Project Stats cold open on the 500-session project, interleaved against `main`, 3 pairs: main 68.5 / 67.8 / 68.2 ms, branch 75.6 / 66.2 / 55.5 ms (`perf/phase3-batch1/stats-open.txt`). The only per-render addition is one sort of the list to find which records can merge.

### Known limits
- Undo is refused (with a message, and without the "Undone" toast) unless the journal is still exactly what the change produced, in the same project: a session finishing, a note, another tab's changes or opening another project all make it refuse rather than overwrite.
- Restoring an old backup over a project brings back sessions deleted since (a restore replaces the project).
- Merge joins only records on the same stitching day.

### Review fixes (Copilot, PR 289)
- Stale Undo (High): see the first known limit; `toast.js` skips its "Undone" follow-up when the handler returns `false`.
- Creator kept old tombstones after an Undo: it now clears `deletedSessionIds` when the refreshed project has none.
- Editing the date or minutes dropped the unpicked figure: the editor now offers the figure the journal shows (stitches added) and only a changed figure touches the breakdown; unpicked and catch-up are kept.
- A sync merge left cumulative totals from each device's own list: the merged journal's `totalAtEnd` / `percentAtEnd` are now rebuilt as a running sum from the common starting point.

## Batch 2: explicit timer, labelled estimates, forgot to stop (STATS-03)
- **Timer:** `Start timer` (palette header chip, Session panel) opens a session now, `timer: true`, using the existing "manual" timing rule (the whole time it runs, minus pauses and hidden-tab time). No idle auto-finalise for a timer session. The clock in the progress strip is a button that opens the Session panel (Pause / Resume / Stop timer); the chip is a labelled button, at least 44 px on touch. `Stop timer` shows "You stitched for N min" and lets the minutes be changed before saving; a timer with nothing marked saves nothing (and says so).
- **Timing basis:** every saved session gets `timingBasis`: `timer`, `auto` or `edited` (the minutes were changed when stopping, or in the journal editor). Sessions saved before this read as `auto` (`ProgressUnits.sessionBasis`). No past figure changes; they are labelled.
- **Labels ("estimated"):** journal entries (`(timed)` / `(edited)` / `(estimated)`, plus a per-session speed), Progress info (Time spent, Speed), the share text and picture, global Stats (Time stitching, Average speed) and the session CSV (new last column `Time measured`). `sessionSpeedPerHour` gives no speed for an estimated session under 10 minutes; a timed one always has one.
- **Forgot to stop:** a timer running with the tab visible and nothing marked for the idle time (`trackerIdleMinutes`, or 30 minutes if "never") asks: Trim to my last stitch / Keep going (asks again after another idle period) / Stop now. Leaving the page, or switching project, with a timer left idle ends it at the last mark.
- **Found and fixed on the way:** switching project through the project picker while a session was running dropped the session (it was never saved); it is now finished and saved under the project it belonged to (its backup is recovered when that project is opened). Test `switching project while a timer runs…` fails without the fix.
- **Performance:** the 1 s clock no longer re-renders the Tracker: it lives in a tiny external store read by three small components (`LiveElapsed`). It now shows seconds (m:ss), which costs about two text-node updates a second.
- **Not changed:** the three timing modes stay as they were (they are "auto variants"); Home and Library rows still compute speed without the label (they have no per-session basis in the summary row).

### Review fixes (Copilot, PR 290)
- Merging two records now takes the least certain timing basis (estimated if either was, else edited, else timed).
- A timed or edited run that crossed the day end keeps `timingBasis` on every day record (`splitSessionByDays`).
- Stop freezes the timer: the time the Stop button was pressed is passed with the minutes, so time spent in the dialog is not added and an unchanged figure is not marked edited.
- "Keep going" with the idle preference at "never" waits the same 30 minutes the prompt uses, not 5.
- The ticking clock in the progress strip is hidden from the strip's polite live region (the button keeps its fixed label), so assistive technology does not announce it every second.

## Batch 3: Stats page presentation and discoverability (STATS-08)
- **No sideways scroll at 360, 393 and 430 px.** The cause was not the milestone row alone: a long project name in the tab bar (and other nowrap content) set the *minimum width of the whole page* (`.cs-page-content` has `margin: 0 auto`, which makes a flex item shrink-wrap, so it grew to its widest content: 460 px on a 393 px phone). The Stats page and its container are now exactly the screen's width (`width: 100%; min-width: 0`), the milestones wrap in a grid, the chart header wraps, and the overview grid reflows. Measured with the probing spec `phase3-batch3.spec.js` (before: document 460 px wide at all three widths; after: equal to the screen).
- **Order:** headline card (percent, today, this week, estimated finish with its range and basis, then speed / time / sessions, labelled estimated where they are) -> goals and streaks -> actions -> charts -> milestones -> colour progress -> session journal (latest five days, "View all" for the rest) -> collapsed groups (Colour timeline, Sections, Comparison, Settings). Page height with the same project: about 3,900 px before, about 3,100 px now (the groups only build their contents once opened; the journal shows five days to start with).
- **Settings:** the timing select stays in its group (with an Open Preferences button; Day ends at is in the goals card and in Preferences from Phase 2).
- **Noise:** "~1 stitching days" fixed; a project with no recorded colours shows one sentence in the Colour timeline instead of "No session data" on every colour. ("~1 sessions" had already been fixed on `main`.)
- **Charts without hover:** tap a chart or move the slider (a native range input: keyboard and screen reader) and the value is written under the chart (`role="status"`); a table of the data; a descriptive label on each chart; axis text enlarged (it was about 5 px on a phone); the calendar's days are buttons. The chart marks keep their dashes and an outline for today, so colour is not the only cue.
- **Reachable from stitching:** Progress info (one tap) has an Open Stats button; its mini chart now has a text description.
- **axe-core 4.10.2** (run from a temporary folder, not added to the repo): the project Stats page (all four chart views, groups open) has no serious or critical issues; it had 36 colour-contrast nodes and five unlabelled inputs, which are fixed (labels; small grey text and tinted buttons use darker existing tokens, scoped to the Stats pages). The global Stats page: none in the dashboard; the five remaining nodes are the app's top bar (`tb-app-tab`, project switcher), which belongs to Phase 5 (COMMON-02). Dark theme was not run.
- **Not done:** the Insights page and Home's stats tab were not restructured (not in scope).

### Performance (batch 3)
First open of project Stats on the 500-session project (the number that matters; later opens are about 1.3 ms), interleaved against `main`, 3 pairs. **A first version failed the guard**: branch 90.9 / 117.9 / 147.1 ms against main 61.6 / 92.2 / 102.7 ms. Cause: the new chart tables and tap positions formatted every day of a long project (a date format is not free) although only the latest 40 table rows are shown. Fixed by building only the rows shown and the positions only when a chart is tapped. After the fix: branch 69.0 / 64.2 / 56.6 ms, main 72.2 / 85.4 / 78.9 ms (`perf/phase3-batch3/`).

### Review fixes (Copilot, PR 291)
- The calendar view now has its data table too (the month's days), so every chart view has one; the e2e test opens it.
- Open Stats (and the two other places that opened Stats from the Tracker: the Session panel's View Stats and the welcome-back recap's Stats) set the Stats tab to this project first (`openProjectStats`); before, the first click opened the all-projects tab the page starts on, and later clicks reopened whichever tab was last used. The e2e test now checks the project tab and its headline.

## Batch 4: calm streaks and goals (STATS-09)
- **Preference** `showStreaksAndGoals` (and `showDailyStreak`), in Preferences > Stitch Tracker > "Streaks, goals and celebrations". `null` until decided once (`UserPrefs.resolveMotivation`, run shortly after the page loads, when storage is ready): on, with the daily streak too, if a global goal is set, or any project has a stitching day (or, for a row from before the units, progress), or goals saved with a project; otherwise off. The decision is stored, so stitching a first session later does not change it. Undecided counts as off, so a new person never sees a flash of streaks. Turning the daily switch on also turns streaks on.
- **Off hides:** the goals card (project Stats and the all-projects page), the streak card/rows, the goal line and target pace on the charts, goal and milestone celebrations in the Tracker (a milestone is still recorded; remembered as celebrated so turning it on later does not replay old ones), the streak insights, the weekly-streak card on the Stats page, and the streak in the share text and share picture. "Day ends at" moves to the Settings group on the project Stats page while the goals card is hidden. Best day and average session stay (they are figures).
- **Weekly by default:** `computeWeeklyStreaks` (Monday-start weeks; the week in progress does not break the run); the daily streak only when its switch is on. Wording: "Weeks in a row" / "Most weeks in a row" / "Days in a row"; the insights and goal messages are plain statements ("You've stitched every week for 4 weeks", "Daily goal reached: 140 of 100 stitches"); nothing says "keep it going" or counts a missed day against the person.
- **Not changed:** `MiniStatsBar` in `components.js` (a dead component nothing renders), the legacy `home-screen.js` dashboard's "N-day streak" chip (gated on the daily switch; `cs_globalStreak` is never written, so it never showed), Home (it has no streaks or goals).
- **Found on the way:** the preference switches in Preferences have no accessible name unless given one (`Switch` takes an `aria-label`); the new ones have one. The existing ones in other panels were not touched.
- **Test note:** earlier e2e specs that look at the goals card or the streak (`phase2-batch4/5`, `phase2-matrix`) now set the preference on in their setup: their first page load, before the project was saved, counted as a new person's.

### Performance (batch 4)
Interleaved against `main`, 3 pairs each (`perf/phase3-batch4/`). First open of project Stats on the 500-session project: with the benchmark's profile as it comes (the preference had been decided for a new person before the project was loaded, so the goals card is not built) branch 44.3 / 41.7 / 40.9 ms against main 78.8 / 63.8 / 49.4; with streaks and goals switched on for both (the profile of someone who has them, the case that could have regressed) branch 51.9 / 56.6 / 75.5 against main 61.8 / 63.0 / 87.7. Tap latency (25 taps, median ms) branch 12.1 / 12.8 / 9.7, main 12.0 / 12.9 / 12.1. No regression either way.
