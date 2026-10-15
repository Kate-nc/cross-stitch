# Tracker session durability (QA-10 / QA-14)

## Lifecycle and timing

An automatic run opens on a mark; Start timer opens an explicit manual-mode run. Empty automatic runs are discarded. Explicit runs with at least one active second can be saved without marks. The stop dialog offers minutes to correct. The forgot-to-stop dialog still offers an explicit discard when nothing was marked.

The existing event-log engine is shared by live display, finalisation and checkpoint previews. Classic mode caps each inter-mark gap and the tail; batch-aware mode credits inter-batch spans and caps the tail; manual mode counts running elapsed time. Hidden intervals and manual pauses are excluded in every mode. A mark resumes a manual pause. Opening while hidden starts paused. Per-day mark counters retain completed and undone units, catch-up, and colours; time-only days now participate in splitting. Day boundaries use local calendar arithmetic, including DST, rather than adding 24 hours. The day-end setting is captured when the run starts.

A run owns its project ID and a timestamp plus UUID identity, independent of the shared active-project pointer. Loading another project finalises the departing run before replacing that identity. Reloading the same project inside a mounted Tracker also finalises its current run instead of resetting it silently.

## Checkpoint format and persistence

No IndexedDB schema upgrade. `pendingImports` stores a small record at `session:<projectId>:<sessionId>`:

```
{ id, v: 1, projectId, sessionId, checkpointAt, revision,
  records: [ /* normal, day-split session records calculated through checkpointAt */ ] }
```

Records contain duration, timing basis/mode, completed/undone stitches and units, catch-up, colours, milestones and per-day attribution. The event log and pattern are not copied into the journal. A monotonically increasing per-run revision rejects delayed older writes even when idle trimming moves the endpoint backwards.

The 400 ms throttled progress writer also submits a checkpoint. A separate 5 s interval covers running timers without marks. Full Tracker snapshots carry a current preview; the storage transaction journals it atomically with the project save, then omits the transient preview from the full stored project. Full-pattern saves retain their existing debounce and maximum wait; timer ticks do not rewrite patterns. No synchronous storage is added to a mark handler.

## Recovery and retirement

Tracker load merges checkpoint records into history by stable record ID and applies deletion tombstones. It closes the recovered run at the checkpoint endpoint. It never restarts its clock or credits crash downtime. Repeated opens before a successful save read the same IDs; a committed full save closes the journal entry in the same transaction as writing history. Closed entries retain only `{id, projectId, sessionId, closed:true}` to fence delayed writes. Session deletion and explicit discard also retire checkpoints; project deletion and full restore remove associated journal entries.

A live run holds a Web Lock named `cs-session:<sessionId>`. Other tabs exclude locked runs from recovery. Chromium releases the lock on actual renderer failure, without pagehide. Distinct tabs use distinct session IDs. Browsers lacking Web Locks can recover checkpoints, but cannot reliably distinguish another live tab; avoid editing the same project concurrently in those browsers. Existing full-save cross-tab conflict resolution remains in place.

The finalisation localStorage backup is retained as a navigation fallback, accumulates consecutive unsaved runs, and is cleared only for IDs included in a successful full save or tombstoned there. Loading alone never clears it. A save finishing for another project cannot erase this project's backup. Failed saves retain recovery data. Checkpoint failures produce an error toast and are retried by later writes; full-save failures use the existing save indicator.

## Loss window and limits

With a responsive foreground renderer and successful IndexedDB commits, time-only checkpoints are attempted every 5 seconds, plus transaction latency. Mark-associated session updates are attempted after the existing 400 ms throttle, plus transaction latency. These are expected loss windows, not hard upper bounds: background throttling, suspension, busy event loops and storage failure can extend them. This is not zero-loss or disk-fsync durability. A whole browser/profile/device failure is outside the renderer-crash guarantee.

Recovery/unattended departure trims an explicit timer idle beyond the configured threshold to its last mark; with no marks it caps at the threshold after Start timer. When idle finalisation is disabled, that safeguard uses 30 minutes. Recovery never credits time after its saved endpoint. An explicitly confirmed stop may retain a longer duration. Checkpoints are local recovery journals; portable backup/sync currently carries finalised session history, not these local active journals. Export a backup after ending the run to include its time.

## Verification

See the PR description for executed commands and results. The crash regression uses three actual canvas marks, awaits `__flushProjectToIDB()`, independently checks the committed `pendingImports` checkpoint, attaches CDP, sends `Page.crash`, awaits Playwright's `crash` event, opens a fresh Tracker page, and flushes again. It compares recovered time to the committed endpoint and reopens twice to check identity deduplication. Normal close is tested separately and is not used as evidence of abrupt-failure safety.

## Staged bug hunts and final review

- After explicit-timer changes: found and corrected the stop dialog's mark-count gate and missing time-only days at midnight. Explicit discard remains available in the forgot-to-stop prompt. Immediate activity, including unpicking, is retained even before one elapsed second.
- After journal persistence: checked same-size project switching, independent tab identities, repeated recovery, stale revisions, full-save/checkpoint overlap, deletion/discard, and transaction failures. Added monotonically increasing revisions because idle trimming can move the endpoint backwards. Concurrent full saves and checkpoint writes are exercised against fake-indexeddb transactions.
- During recovery integration: fixed same-project mounted reload dropping its active run, accumulated consecutive finalisation backups, and moved backup retirement from load/autosave callbacks into successful project-save completion. Read project history and journal fences in one transaction to avoid mixing an older history with a newer retirement marker. Excluded transient checkpoint fields from cross-tab structural comparisons.
- Final review: checked the diff against v1.0.155 (`e0f59318`), regenerated the runtime bundle, checked generated-file freshness and terminology, and verified real renderer crashes independently of normal navigation. No pre-existing working-tree edits were present. No schema, pattern export or PDF changes.

## Verification results

- Latest-base baseline: `npm test -- --maxWorkers=2` — 328 suites, 4,464 tests passed, one snapshot passed. No unrelated unit/audit baseline failures. The optional QA review filenames in the task are absent in this checkout.
- Final full unit suite: `npm test -- --maxWorkers=2` — 330 suites, 4,483 tests and one snapshot passed. London timing/storage run: `TZ=Europe/London npm test -- --maxWorkers=2 tests/sessionDurability.test.js tests/sessionCheckpointStorage.test.js tests/projectStorageProgress.test.js tests/computeActiveMs.test.js tests/phase2Batch4.test.js tests/phase3Batch2.test.js` — six suites, 89 tests passed. Broad mobile/iPad browser audit suites were not run.
- Browser regressions: 22 existing tests passed in the combined timer/midnight/save-durability run. The remaining idle-departure test asserted that the localStorage backup must still exist even after a successful save; updated it to accept committed history or a recovery copy, then reran it successfully. All nine new session-durability browser tests passed, including three actual renderer crashes (marked session, live-tab ownership release and timer-only checkpoint), repeated recovery, normal close/reload/hidden saves, pause/resume and failure feedback. This is 32 distinct relevant browser tests passing across the runs.
- Final browser command: `E2E_LOCAL_CDN=1 PLAYWRIGHT_BROWSERS_PATH=/workspace/.playwright-browsers npx playwright test --project=touch-tablet-chromium tests/e2e/session-durability.spec.js tests/e2e/phase3-batch2.spec.js --grep '60-second|actual renderer|other live|checkpoint failure|records exactly|periodic|pause/resume|leaving the page' --workers=1` — 10 passed.
- Initial restricted-shell attempts could not bind the local server or reach the proxy; the first baseline compiled-file subprocess check also returned no output there. Network-enabled execution resolved those environment issues; the build freshness check and subsequent complete baseline passed. These were tooling failures, not remaining application failures.
