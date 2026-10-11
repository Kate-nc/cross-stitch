# Phase 1 bug hunt

## Batch 1 (core durability)

### Exercised
1. **Automated:** `npm test` (283 suites, 3,816 tests, all passing), `npm run lint:terminology` (pass), `npm run lint:css-tokens` (non-blocking warnings only; none from this change), `node build-runtime-js.js --check` (up to date).
2. **Audit harness re-runs against the fix** (all four original failures gone): `e12` (flush before first autosave: pattern now kept), `e13` (flush after marking: IndexedDB `done` 20 = strip 20; was 10), `e8` (mark, mark, reload at once: 20 after reload; was 10), `e11` (open then reload at 0.2 s: project opens with its marks; was "Could not load a project").
3. **Neighbour regressions:** `e9b` (two tabs: the "Project changed in another tab" dialog still appears at the second tab's save), `s1` (history fixture: every figure identical to the audit: 1,350/1,600, week 440, speed 172, Est. finish 13 Oct, popover ~17 Oct), `c1` (midnight run: figures identical; the stored session now persists where it previously read back empty).
4. **Playwright specs on iPad emulation:** `tracker-touch` 7 of 8 pass.
5. **New failing-first tests:** each new Jest test and Playwright spec was run against the old code and fails there, passes on the fix.
6. **Performance:** see the progress log; no regression.
7. **Cost of the new saves:** flush 138-280 ms on 90,000 cells, one 33 ms frame; none on the mark path.

### Bugs found
- **Fixed in this batch: Backup and Restore never included projects** (`backup-restore.js` opened `CrossStitchDB` at version 4; the app is at 5; `VersionError` was swallowed with a console warning, leaving `databases.CrossStitchDB = null`). Found because the new "backup right after marking" spec returned null. Regression tests added. Worth telling users who relied on backups made since the version-5 schema shipped (check `git log -S"indexedDB.open(DB_NAME, 5)"`); those files lack their projects.
- **Pre-existing, not changed:** `tests/e2e/tracker-touch.spec.js` "a two-finger fling coasts after release" fails in this sandbox on the original code too (0 of 5 passes on unmodified `main` in this environment, 1 pass in an earlier single run). It is timing-sensitive (momentum scrolling) and unrelated to saving. Not investigated further.
- **Known limitation, by design for this batch:** a hard kill can still lose marks made since the last save (up to the debounce, 5 s after the last mark, never more than the cap of 10 s, or 20 s above 40,000 stitches). Batch 2 closes this with a small progress record.
- **Unverified:** iOS Safari and Android behaviour of the tab-hidden save (only Chromium available); real-device timing.

### Review round 1
A code review of the PR found four real issues in my own batch (backup could upgrade the app's database to a version the app cannot open; the in-progress-drag support did nothing because it read refs that are never written; the hidden-tab flush repeated on every tab switch; changelog understated the 20 s cap). All fixed with tests that fail on the previous head. Lesson recorded for later batches: a source-text test can pass on dead code, so each durability claim now has a behavioural e2e test as well.

### Not exercised yet (later batches / phases)
Quota-exceeded and offline chaos tests, restore-while-unsaved, two tabs plus Creator: planned for the Phase 1 closing bug hunt, after batches 2-5.

## Batch 2 (progress record)

### Exercised
1. **Automated:** `npm test` 284 suites, 3,834 tests, all passing; terminology lint pass; `compiled/` current.
2. **Hard kill, the original failure:** mark 10, wait 0.7 s, close the page with no unload handlers: the stored project record still has 0 marks, `ProjectStorage.get()` returns 10, and reopening the project shows 10. (Batch 1 alone lost them.)
3. **Staleness:** a full save after a progress write retires it (marks made before and after a 6.5 s full save are both kept); a record based on another write, or for a different cell count, is ignored (unit tests).
4. **Project switching with two same-size projects** (the dangerous case for an id/state mix-up): marks made in A within the 400 ms window before switching stay in A (5), none leak into B; marking in B afterwards writes to B (1,346 after unmarking 4).
5. **Neighbour regressions:** the batch-1 reproductions (`e8`, `e11`, `e12`, `e13`), two tabs (`e9b`, dialog still appears at the second tab's save), history statistics (`s1`, identical to the audit), midnight (`c1`), and the resized-pattern case (`ed1`, still wipes progress as in the audit; that is TRACK-12, batch 5).
6. **Restore:** progress records are removed and other `pendingImports` records are kept (unit test).
7. **Performance:** see the progress log; no regression; progress write 0.0-0.2 ms on a 90,000-cell chart.

### Bugs found
- **Fixed in this batch (found by code review, then reproduced):** switching project inside the page within 400 ms of a mark dropped the old project's marks, because the pending timer was retargeted to the new project. The earlier "project switching" check in this hunt used the header project switcher, which reloads the page and so goes through the unload path; File > Switch Project… is the in-place route and is now covered by an e2e test. Lesson: check which UI routes are in-page before claiming a switch scenario is covered.
- Same pre-existing gap, not caused by this work: an in-page switch never full-saves the old project (the autosave timer is cleared by the state change), so non-mark state of the old project from the last few seconds (park markers, view, session) is not saved by that route; marks are now safe through the progress record. Worth a follow-up in a later batch.

### Known gaps
- **Two tabs on one project:** both tabs write the same record (last writer wins) until a full save retires it, so a kill in the first 5-10 seconds can recover the other tab's marks rather than this tab's. This is no worse than before (those marks were lost entirely) and the conflict dialog still appears at the next full save; proper merging is batch 4.
- Recovered marks have no session record (the stitching-time statistics for those few seconds come from the existing `cs_pending_session_*` recovery, which is unchanged).
- Unverified: iOS Safari and Android (Chromium only), real-device write timing.

