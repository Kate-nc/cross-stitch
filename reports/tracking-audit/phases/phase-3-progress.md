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
