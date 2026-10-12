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
- Undo after a later change is refused with a message, but Toast then also shows its own "Undone".
- Restoring an old backup over a project brings back sessions deleted since (a restore replaces the project).
- Merge joins only records on the same stitching day.
