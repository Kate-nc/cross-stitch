# Phase 3 report: honest time and correctable history

Status: all four findings are done across five batches (PRs 288 to 292, all merged). This closing PR holds the end-of-phase hunt (one bug fixed, six new browser tests), the whole-phase performance check and this report. Phase 4 has not been started and will not be until you say so.

## What shipped

| PR | Batch | Findings | Outcome |
|---|---|---|---|
| #288 | 0: catch-up for other bulk actions | follow-up to STATS-07 | A rectangle fill of over 50 stitches asks "today or catch-up" like marking a whole colour done |
| #289 | 1: correct your history | STATS-06 | Edit, delete and merge sessions in the journal with Undo; every total, milestone, streak and estimate rebuilds from the list; sync unions sessions by id and honours deletion tombstones |
| #290 | 2: explicit timer, labelled estimates | STATS-03 | Start/Stop timer; every session has a timing basis (timer, auto, edited); auto-timed figures are labelled estimated everywhere; "Forgot to stop?" prompt; a session no longer lost when switching project |
| #291 | 3: Stats page | STATS-08 | Fits a phone (no sideways scroll at 360 to 430 px), headline first (percent, today, this week, estimate with basis), collapsible seldom-used groups, charts readable by tap or slider with a table, Open Stats from Progress info, axe clean on the project Stats page |
| #292 | 4: calm streaks and goals | STATS-09 | "Show streaks and goals" preference; people with a history or goals keep everything, new people start calm; weekly streak by default, daily on request; plain wording; no celebrations when off |
| this PR | closing | end-of-phase hunt | Cross-tab merge now treats a deleted session as mergeable (a stale tab could bring it back); hunt specs; this report |

Changelog entries 1.0.120 to 1.0.124 and the in-app help (Correcting your journal, Timer and estimated times, Reading the Stats page, Streaks and goals) cover all of it.

## Acceptance criteria against the prompt

| Criterion | Result |
|---|---|
| Delete a session: totals, milestones, streak, estimate and the summary row follow; survives reload; Undo restores exactly | Pass (batch 1 spec; hunt spec for first, last and all) |
| Edit minutes or stitches: marked edited, later totals rebuild | Pass, including legacy sessions and one day of a midnight run |
| Sync: edit on two devices keeps the later edit; delete on one does not come back after import | Pass in unit tests (`phase3Batch1`); not driven through a real `.csync` file round trip |
| Timer: 20 minutes saved as a timed session of 20 min with its speed; estimates labelled | Pass (batch 2 spec) |
| Forgot to stop: prompt, trim to last stitch, keep going | Pass |
| No sideways scroll at 360 to 430 px; first screen shows percent, today, estimate with basis; charts operable without hover; axe | Pass for 393 px in the browser and the CSS for the range; axe has no serious issues on the project Stats page; the five remaining nodes on the global page are the app's top bar (Phase 5) |
| With "Show streaks and goals" off, no streak card, goal bar or celebration anywhere | Pass (batch 4 spec and unit tests) |

## End-of-phase bug hunt

See `phase-3-bughunt.md`. One real bug found and fixed (a session deleted in one tab could be brought back by the other tab's "Keep my edits"). The rest of the prompt's list passed; what was not driven is listed there.

## Performance

Rule: nothing slows the app by more than 5%. Every batch was measured interleaved against `main`; batch 3's first version failed and was fixed before its PR. Whole phase, interleaved against the commit before Phase 3 (`568606c`), raw files in `perf/phase3-end/`:

| Measure | Before Phase 3 | Now | Change |
|---|---|---|---|
| First open of project Stats, 500 sessions (4 pairs, median of first opens) | 54 / 73 / 61 / 66 ms | 55 / 60 / 51 / 57 ms | faster (about -12%) |
| Later opens | 1.3 ms | 1.3 ms | none |
| Tap latency, median, first run (3 pairs, 120 taps each) | 11.4 / 10.6 / 10.6 | 12.3 / 12.3 / 11.4 | +8% (over the line on its own) |
| Tap latency, re-run (3 pairs, 90 taps) | 10.5 / 10.4 / 9.5 | 10.0 / 10.4 / 10.6 | about +2% |
| Tap latency, larger run (5 pairs, 120 taps, alternating order) | 10.7 / 10.6 / 11.9 / 11.4 / 9.9 | 10.3 / 10.6 / 10.2 / 12.0 / 10.8 | -1% (means +1%) |

I am reporting all three tap runs, not only the last. The first one read over the line; the other two did not, and the mean of the 11 per-run medians is +3% (10.7 to 11.0 ms; the individual samples were not pooled), inside this machine's run-to-run spread (the same code varies by about 1 ms between runs). I could not reproduce a regression, so I did not change code for it; if you see tap slowness on a real device, that is the first place to look (the per-tap work Phase 3 added is only the preference read and the timer store).

## Data and migration statement (as shipped)

- **Projects:** no schema change, version stays 11. New optional project field `deletedSessionIds` (tombstones).
- **Sessions, new optional fields:** `timingBasis` (`timer`, `auto`, `edited`; old sessions read as `auto`), `edited`, `editedAt`. No past figure changes; past times are labelled estimated.
- **Preferences:** `showStreaksAndGoals` and `showDailyStreak` (null until decided once from what is already there).
- **CSV:** the session CSV has a new last column, `Time measured`.
- **Sync:** sessions union by `id`, the later `editedAt` wins, tombstones union and apply, derived totals and `stitchLog` are rebuilt.

## Decisions and deviations you may want to revisit

- Streaks default to weeks (Monday start; the week in progress never breaks a run). The daily streak shows only if switched on.
- Undo of a history change is refused (with a message) once anything else has touched the journal, rather than risk overwriting newer data.
- Restoring an old backup brings back sessions deleted since (a restore replaces the project).
- The editor changes minutes, stitches and note, not the date; merge joins records on the same stitching day only.
- The one-time "show streaks" decision loads each project once if nothing cheaper settles it (needed to find goals saved on otherwise empty projects).

## Not verified

Safari and Firefox; real devices and iOS storage; screen-reader behaviour of the new dialogs, tables and switches; the dark theme on the new preference rows; a `.csync` file round trip; restoring a backup through the import screen; the Insights page and Home Stats were not restructured; switches in other Preferences panels still lack accessible names (Phase 5). Open from earlier: two stale `creator-touch` specs, intermittent `save-durability` and `phase3-batch2` leave-the-page tests (passed on retry), `MiniStatsBar` is dead code left untouched.
