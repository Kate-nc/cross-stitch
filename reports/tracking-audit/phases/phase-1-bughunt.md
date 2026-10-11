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

## Batch 3 (honest save badge)

### Exercised
1. **Automated:** `npm test` 286 suites, 3,852 tests, all passing; terminology lint pass; `compiled/` current. Browser specs `save-durability` (11) and `save-badge` (5) pass.
2. **By hand in the running app (Chromium):** badge text through the whole cycle (All changes saved, Saving..., Saved just now), zoom only (unchanged), forced `Disk is full` (Save failed with Retry, then Saved after Retry), two tabs (B shows Saving..., then Not saved yet while the dialog is open, then Saved just now after Keep my edits). Screenshots of the error state and the conflict state are in the shared screenshots folder (`track-save-badge-*-desktop.png` from the harness runs).
3. **Neighbours:** Creator tests that use the same badge component (`saveStatusController`) pass unchanged; cross-tab tests (107) pass.
4. **Performance:** see the progress log; no regression.

### Bugs found
- **Fixed in this batch:** an error from one project stayed on the badge after switching to another (found while writing the project-switch test; the loaded project now starts with its own save state).
- Not fixed, belongs to Phase 4 (TRACK-07): on phone widths the badge is clipped by the header (seen in the audit screenshots); the Save failed and Not saved yet texts are longer than "Saved", so Phase 4 should give the badge an icon-only phone layout with the text in `aria-label`.
- ~~Known limitation: an in-flight save for the previous project can still finish after a switch.~~ Fixed after review with a per-project UI epoch (see the progress log).
- **Found by code review, pre-existing, fixed in this PR:** the autosave effect did not depend on 13 of the state variables the snapshot persists (designer, description, partial stitches, fabric colour, thread brand, stitching style, block size, start corner, colour sequence, work area, breadcrumbs, spotlight block), so editing only one of them was not saved until something else changed. A source test now enumerates what the snapshot persists.
- Unverified: screen reader announcement (live region) was not exercised with assistive technology; Safari and Firefox not tested.


## Batch 4 (cross-tab merge)

### Exercised
- `npm test`, terminology lint, `compiled/` current; `cross-tab-merge` e2e (4) pass.
### Bugs found and fixed in this batch
- First e2e run showed the dialog instead of merging: the loaded project record and the tab's snapshot differ in spelling (`designer` undefined vs "", then `settings` gaining defaults). Fixed by treating empty values alike and comparing the other tab's fields to ours as well as to the base.
- A handler that became asynchronous broke the synchronous "dialog announces open" contract for pages without a merger; fixed by asking at once when no merger is registered.
### Known gaps
- Tab B's own unsaved edits to non-mark fields (e.g. a rename) are kept by A's next save, overwriting nothing from B's marks but a rename made in B before A saved is shown the dialog (conservative).
- "Edit in Creator" from the tracker does not wait for its save; if that save ends in a merge the Creator receives the pre-merge fields. Pre-existing pattern (it never awaited), narrow.
- Three tabs: each merges against its own base; not exercised.
- Safari/Firefox BroadcastChannel behaviour not tested.

### Batch 4, review round 1 (Copilot; all four verified)
- **Denylist of compared fields was incomplete (High).** True: `statsSettings`, `threadOwned`, `originalPaletteState`, `stitchingStyle`, `workArea` and others were not compared, so another tab's change to one would have been overwritten by this tab's next save. Now every persisted field is compared except those merged here, view state, write metadata and figures derived from stitching (listed in `NOT_COMPARED`). Cost: if the other tab's stitching also changes one of the compared fields (for example stash deduction changing `threadOwned`), the question is asked instead of merging; conservative.
- **Pattern compared by id only (High).** True: a brand, type or colour change on the same thread number passed. Now the full cell shape is compared.
- **Edited sessions lost (High).** True: only presence of a session id was compared. Now three-way per session: the other tab's version wins if it changed since base.
- **Hidden Tracker stayed the global merger (Medium).** True (the unified page keeps the Tracker mounted). The merger is registered only while the Tracker is active.
- Found while fixing: a loaded record and a saved snapshot spell cells and settings differently, so "unchanged by the other tab" now means equal to the base or equal to ours (pattern as well as fields).
- Known gap: `doneSnapshots` are not merged (derived; this tab keeps its own).
