# Tracking sync preservation

Base: `7657c3e3` (fetched `origin/main` before publication). The working tree was clean before creating `fix/track-sync-preservation`.

## Actual data path

- Tracker `buildSnapshot` / `snapshotNow` serialise full marks as arrays, halves as `[cellIndex, {fwd,bck}]`, quarters as `[cellIndex, [positions]]`, and knots/backstitch as string-key arrays. Empty completion fields are explicit arrays. `doSaveProject` includes removal history in JSON downloads after flushing pending progress.
- `ProjectStorage.saveProgress` saves the short-lived `progress:<id>` record. `applyProgressRecord`, recovery and backup overlays use the full project's `lastWriteAt` and grid length to validate it. Full `save` reads the project and overlay in the write transaction; local changes capture causal edits, imports with `preserveUpdatedAt` retain incoming history without inventing removals.
- `SyncEngine.exportSync` flushes Tracker state, reads `ProjectStorage.get` (including valid overlays), normalises typed full-stitch arrays, wraps each entire project with its fingerprint, and `compress` writes the `.csync` payload.
- Import decompresses/validates, `prepareImport` reads local storage and classifies projects. Fingerprints compare chart structure; equal timestamps also require equal canonical completion history and parking state. Fractional structure is now included; advertised fingerprints are recomputed from incoming chart data.
- `executeImport` re-reads local state, `mergeTrackingProgress` merges completion registers and parking identities, preserves existing unrelated-field policies, then saves without restamping `updatedAt`. New projects and chosen structural versions go through the existing save path. Tracker reload restores numeric half indices, quarter sets and knot/backstitch keys. Mismatched full-array lengths remain available for existing pattern-recovery/remapping.

Cross-tab merging is separate: `TrackingMerge` still compares against the tab's loaded/saved base. It merges each completion type three ways and asks about unrelated changes. `trackingSync` is bookkeeping, not a reason to reject an otherwise safe cross-tab merge. Numeric/string half and quarter indices now refer to the same cell.

## Merge semantics and migration

`trackingSync: {version: 1, marks: {...}}` is additive project metadata; no database or `.csync` envelope version change is needed. Keys identify a full cell (`d:`), half cell/direction (`h:`), quarter cell/position (`q:`), knot (`k:`) or backstitch (`b:`). Each mark retains the causal frontier of `{value, clock}` edits. Local persisted transitions join the observed clocks and advance the current page actor. Dominated edits are discarded; concurrent edits remain. All surviving values must be marked for the resulting mark to be completed, so concurrent mark/unpick resolves to unpicked. A re-mark after receiving the merged removal supersedes it. There is no wall-clock or whole-project winner.

Old positive marks become unversioned positive seeds. Missing metadata, fields, and empty legacy lists never author removals during import. A recorded removal defeats a stale legacy addition. Missing fields on local saves preserve the older field; only explicit completion arrays can record changes. Full saves, progress writes, navigation recovery and JSON downloads preserve the new history. Unsupported or malformed metadata cannot supply unversioned deletion evidence.

Parking remains an additive set keyed by numeric x/y, colour ID and corner (default `BL`). Payloads are normalised for Tracker hit testing; duplicate identities use a deterministic payload choice. Legacy explicit indices, including zero, are supported without using list position.

## Staged bug hunts

1. **Half marks:** exact QA-01 plus both directions, cell zero, string/numeric indices, duplicates, empty values, input immutability, reverse merge order and repeats. Found and fixed cross-tab half/quarter index aliases.
2. **Parking:** exact QA-02 plus several colours/corners in one cell, duplicates in a single remote list, reverse order, repeats and index zero. Fixed missing insertion-set updates through set-based deduplication; normalised coordinates/colour/default corner so identity and hit testing agree.
3. **Removal semantics:** exact QA-03 (`[1,0]` baseline, A `[0,0]`, B `[1,1]`, merged `[0,1]`), all five completion types, independent additions/removals, observed re-marks, concurrent changes and three-device regrouping. Found and fixed timestamp-only classification hiding edits; unchanged projects still classify identical. Fractional structure edits now take review, including stale advertised fingerprints. Legacy progress records no longer clear omitted knots. Navigation recovery retains prior exported progress history. Monotonic full-write revisions retire stale overlays even when saves occur in one millisecond.
4. **Final hunt/review:** generated causal histories exercise associativity, commutativity and idempotence. Page load-order and service-worker tests cover the new shared helper. Real fake-IndexedDB tests exercise compression, export, classification, actual import, persistence and reload, repeated imports, reverse device order, legacy files and structure review. Existing full-array pattern recovery remains intact.

## Limitations

- Removals made before migration or by old app builds have no reconstructible intent. Update every device; import older work, then unpick again in the updated app. Old files cannot re-mark versioned removals; sync and re-mark in the updated app.
- Parking removal is not versioned; a peer's parked marker can return after a local clear. This change fixes marker identity and duplicate insertion, not parking deletion semantics.
- Causal frontiers and removal records are retained to protect against arbitrarily stale files. Metadata grows with edited marks and contributing page actors; no unsafe time-based garbage collection is used.
- Unrelated project metadata continues to use the existing per-field policies; the causal conflict policy applies to completion marks.

## Verification results

Final `npm test -- --maxWorkers=2 --silent`: **327 suites / 4,463 tests passed**, one snapshot passed; the sole failing test is `compiledUpToDate.test.js`. A clean archive of base `7657c3e3` produced **325 suites / 4,437 tests passed** and the same failure: the environment rejects nested Node `spawnSync` with `EPERM`, leaving no build-check output. Direct `node build-runtime-js.js --check` passes, along with terminology lint and `git diff --check`. The Tracker bundle was regenerated from source. The initial unconstrained baseline run also exceeded an existing backstitch timing threshold; that test passes in the bounded full runs. No existing assertions were weakened.
