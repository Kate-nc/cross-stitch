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

Status: PR open, waiting for review and merge.

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

## Open questions
- None blocking. Batch 2 will propose the exact layout of the progress record (compressed `done` array vs run-length encoding) with measured sizes.
