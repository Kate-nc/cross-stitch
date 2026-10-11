# Phase 1 progress log

Findings: TRACK-01, TRACK-02, TRACK-03, TRACK-12, BUG-06, BUG-07.
Working agreement: [phase-00-working-agreement.md](phase-00-working-agreement.md).

## Baseline (current `main` at 9c38d70, headless Chromium, `harness/p1.js` on the 300x300 fixture)

| Measure | Baseline (3 runs) |
|---|---|
| Load to drawn chart | 1,513 / 1,661 / 1,719 ms |
| Idle max frame gap | 17 ms |
| 60-move drag-mark (23 cells) | 1,215 / 1,276 / 1,340 ms (dominated by Playwright round trips; used for relative comparison) |
| `npm test` | 280 suites, 3,800 tests, all passing |

`npm run perf:baseline` was not run: it loads React from the CDN, which the sandbox blocks. The harness numbers above stand in for it.

## Plan (batches, one PR each, each waits for merge)

1. **Core durability** (this PR): reproduction tests, `ProjectStorage.save` refuses to overwrite a patterned record with a patternless one, `__flushProjectToIDB` rewritten to save a complete current snapshot, unload and flush no longer race, save on tab hidden, autosave maximum wait, backup/restore database version bug found during the hunt.
2. Dedicated small progress record, load-order logic, backup/export flush through that record (rest of TRACK-01).
3. Honest save badge (TRACK-02, BUG-07).
4. Cross-tab merge, earlier stale-tab notice, backup reminder (TRACK-03).
5. Pattern-change reconciliation and recap (TRACK-12, BUG-06), Creator remap.

## Batch 1

Status: merged ([PR #275](https://github.com/Kate-nc/cross-stitch/pull/275)).

### What changed
- `tracker-app.js`: new `snapshotNow()` (a full snapshot using the synchronously updated `doneRef` and any uncommitted drag, reads refs only, never touches drag state); `__flushProjectToIDB` now saves that instead of a hand-built partial record on top of the last autosave; stands aside while the unload handler runs; tab-hidden handler saves when there are unsaved changes; `pageshow` clears the unloading flag after a back/forward-cache restore (it used to stay set and block new sessions); the debounce has a maximum wait.
- `project-storage.js`: `save()` refuses, inside the write transaction, to replace a record that has a pattern (`pattern` or compact `p`) with one that has none; shows a Toast and rejects.
- `backup-restore.js`: found during the bug hunt. It opened `CrossStitchDB` at version 4 while the app has used version 5; the open failed with `VersionError`, so every backup had `databases.CrossStitchDB = null` (no projects, no progress) and restore could not write projects back. Now opens at the existing version (`null`).
- `version.js`: changelog entry for 1.0.106.

### Decisions and deviations from the phase prompt
- **Debounce cap is 10 s, but 20 s for charts over 40,000 stitches.** Serialising a 300x300 chart costs about 20 ms, but IndexedDB's structured clone of the 2.6 MB record is about 77 ms; a full save measured 140-280 ms in total. A 10 s cap on those charts would put a 150 ms hitch every 10 s into continuous marking, which breaks the "never slow the app" rule. Batch 2 moves durability to a small record, after which the cap for large charts can come back down.
- **The dedicated progress record is deferred to batch 2**, as planned. Until then the bound on what a hard kill can lose is the debounce: up to 5 s after the last mark, never more than the cap (10 s, or 20 s for very large charts) of continuous marking. The tab-hidden save closes the common mobile case (switching app or locking the screen).
- **Sync engine unload flush left in place.** The tracker flush now stands aside while the tracker's own unload handler runs and otherwise writes the same fresh data, so the race is harmless; removing the flush call would change Creator/Home/Manager behaviour for no gain.
- The phase prompt did not anticipate the backup version bug. It is in scope because the Phase 1 acceptance criteria require a backup taken right after marking to restore with those marks.

### Tests added
- `tests/projectStoragePatternGuard.test.js` (5 tests, fail on old code).
- `tests/trackerSaveDurability.test.js` (source-level guards for flush, `snapshotNow`, debounce cap, unload and hidden handlers).
- `tests/backupDbVersion.test.js` (3 tests with `fake-indexeddb`: backup of a version-5 database, restore into a version-5 database, restore into a browser with no database that the app then upgrades to 5; all fail on old code).
- `tests/e2e/save-durability.spec.js` (6 Playwright tests: reload after marking, flush before/after first autosave, backup right after marking, reload straight after opening, tab hidden, steady marking; all fail on old code). `tests/e2e/local-cdn.js` lets e2e specs run where the CDN is unreachable (`E2E_LOCAL_CDN=1`; no effect otherwise).
- Updated three older tests that pinned the old hand-copied flush (`persistence.test.js`, `creatorStrokeAndNamePrompt.test.js`, `fabricPerProject.test.js`) and one that pinned the wrong database version (`blobStore.test.js`). They now assert the flush goes through the single snapshot builder, which carries the same fields.

### Performance after batch 1 (same harness, 3 runs)

| Measure | Baseline | After |
|---|---|---|
| Load to drawn chart | 1,513-1,719 ms | 1,366-1,523 ms |
| Idle max frame gap | 17 ms | 17 ms |
| 60-move drag-mark | 1,215-1,340 ms | 1,228-1,282 ms |

No regression. Cost of the new work, 300x300 chart (90,000 cells): a flush (what Backup, Sync, tab-hidden and the debounce cap run) takes 138-280 ms in total and the longest frame during it was 33 ms. It runs only when there are unsaved changes at tab-hide, at backup/sync, and at most every 20 s during continuous marking on such charts. Nothing was added to the per-mark path.

### Data and migration statement
No schema change, no new stored fields, no migration. Existing projects and history are untouched. The `save()` guard only blocks writes that would have erased a pattern.

### Review round 1 (Copilot code review on PR 275; all four findings verified and fixed)
- **High, backup could bump the app's schema.** `openDB(..., null)` repaired a missing store by upgrading to version 6, after which the app's own open at version 5 would fail with `VersionError`. `openDB` now takes `repair === false` for `CrossStitchDB`: backup reads a missing store as empty, restore stops with a clear message instead of upgrading. Test: a v5 database missing `sync_snapshots` is still backed up, restore refuses, and the app can still open it at 5.
- **Medium, `snapshotNow` did not include an in-progress drag.** True: `dragStateRef`/`dragChangesRef` are never populated (the pre-existing unload code that used them was dead too, and is removed). `useDragMark` now exposes a synchronous `getDragState()`; `snapshotNow` applies cells of a `drag` in progress (not unconfirmed ranges) with the same filters as `_commitBulk` (skip/empty cells, colour lock). New e2e test flushes mid-drag; the source test no longer passes on dead code.
- **Medium, hidden-tab flush left the dirty flags set.** Replaced with change/flush generation counters; the hidden handler writes only when something changed since the last successful write and never touches the debounce. A failed or conflicted save does not count as flushed. New e2e test: hiding twice writes once.
- **Low, release note.** Now states both limits (10 s, 20 s over 40,000 stitches).

Both new e2e tests fail on the previous head and pass now. Perf re-measured after the changes: load 1,512-1,714 ms, drag 1,197-1,264 ms (baseline 1,513-1,719 / 1,215-1,340): no regression.

## Batch 2: the small progress record (rest of TRACK-01)

Status: PR open, waiting for review and merge.

### What changed
- **`project-storage.js`:** `saveProgress(id, {done, halfDone, knotsDone, baseWriteAt, tabId})` writes one small record, `progress:<projectId>`, into the existing `pendingImports` store (the same store `BlobStore` already uses for trace pictures, so **no schema or database version change**). `get()` applies it only when it is still current (see below). `delete`, `clearAllProjects` and `clearAllProgress` remove it.
- **`tracker-app.js`:** a throttled writer (at most one write every 400 ms, trailing) driven by the committed `done`/`halfDone`/`knotsDone` state; written first thing on tab-hidden and on unload; refreshed after a full save if marks arrived while it ran. Nothing was added to the mark path itself (an effect on the committed state schedules a timer).
- **`backup-restore.js`:** restore deletes `progress:` records, because they describe the projects as they were before the restore.
- Not changed: the full-save debounce caps (10 s, 20 s over 40,000 stitches). The full save still carries everything else (history, settings, park markers, view), so lowering the large-chart cap is a separate trade-off; with marks now safe the cap could be raised later to cut hitches further. Left for a decision.

### Design decisions
- **Typed array, no compression or run-length encoding.** The phase prompt left this open pending measurement: a 300x300 chart's `done` is a 90 KB `Uint8Array`, structured-cloned natively. Measured on the 300x300 fixture: 0.0-0.2 ms of main-thread time to issue the write and about 1 ms to commit, against 138-280 ms for a full save. Smaller encodings would not help.
- **When the record is believed.** It stores `baseWriteAt`, the project's `lastWriteAt` when it was written. `get()` applies it only if that still equals the project's current `lastWriteAt` and the cell count matches. Any later write to the project (the Tracker's own full save, a sync import, a rename, a Creator save) changes `lastWriteAt`, which retires the record automatically; a restore also deletes it explicitly because restored records keep their old `lastWriteAt`. A stale record can therefore never override newer data.
- **Applied inside `ProjectStorage.get()`**, so every consumer of a project (Tracker, Creator, Home, Stats, sync export) sees the same marks. The Creator in particular saves `done` back, and would have discarded recovered marks if it had loaded the stale record.
- **A consistent (id, state) pair** is captured in an effect after each committed render and used by the writer, so one project's marks can never be written under another project's id while switching (checked with two same-size projects).
- **The record is not in backups** (the full project record is always flushed fresh before a backup, so a backup has the marks); it is not read by sync or the project list.

### Tests added
- `tests/projectStorageProgress.test.js` (9): applied when current; half/knot marks; retired by any later project write; ignored on cell-count mismatch; legacy project with no write time; removed on delete and bulk clear; never written for a deleted id; invisible to `listProjects`; ignored when based on another write.
- `tests/backupDbVersion.test.js` (+1): restore removes progress records and leaves other `pendingImports` records alone.
- `tests/trackerSaveDurability.test.js` (+5): writer shape, throttling, unload/hidden order, no rewrite on load or switch, refresh after a full save.
- `tests/e2e/save-durability.spec.js` (+2, and the earlier tests now read the raw project record so they keep testing the full save): hard close 0.7 s after marking recovers all marks while the stored project still has none; marks made after a full save are kept.
- `tests/blobStore.test.js` updated: the guard "storage never reads pendingImports" now allows the one by-id read of `progress:` records and still forbids listing or scanning it.
- The two new e2e tests fail on the batch-1 code and pass now.

### Performance (300x300 fixture, headless Chromium, 3 runs)

| Measure | Baseline (pre-phase) | After batch 2 |
|---|---|---|
| Load to drawn chart | 1,513-1,719 ms | 1,376-1,547 ms |
| Idle max frame gap | 17 ms | 17 ms |
| 60-move drag | 1,215-1,340 ms | 1,191-1,226 ms |
| Progress write, 90,000 cells | n/a | 0.0-0.2 ms main thread, about 1 ms to commit |

### Data and migration statement
No schema change, no change to the project record format, no migration. One new record per project in `pendingImports` (about 90 KB for a 300x300 chart), overwritten in place, removed with the project. Old builds ignore it. Existing projects load exactly as before until the new writer produces a record.

### Remaining for Phase 1
Batch 3 (honest save badge), batch 4 (cross-tab merge, stale-tab notice, backup reminder), batch 5 (pattern-change reconciliation).

