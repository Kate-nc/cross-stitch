# Separate sync bug-hunting pass

This pass followed the implementation and exercised storage behaviour independently of the primary merge examples. The executable two-device fixtures use isolated VM globals, localStorage and fake IndexedDB factories, real project storage, compression, SHA-256 and Blob bytes. They do not depend on an actual cloud provider or a hosted service.

| Hunt | Finding and result |
| --- | --- |
| Duplicate consumption | Gross stock is reconciled separately from immutable debits. Independent offline project events merge once; reversed/repeated imports retain two events and the exact net quantity. Contradictory receipt mappings now fail instead of choosing by import order. Duplicate informational event dates choose deterministically. |
| Lost notes | Concurrent project and shared-session notes remain explicit conflicts despite clock skew. An explicit choice observes both edits and survives stale replay. Running session totals are rebuilt after the selected authored record is applied. |
| Attachment leaks/resurrection | Hash/length failures stop before publication; unreferenced content is rejected. Injecting an abort on attachment put leaves no partial blob row and a failed state. Whole-file retry publishes intact bytes. Deleting before export records evidence in the same BlobStore transaction, so stale imports cannot restore the bytes. Identifier collisions retain local bytes and remain conflicted. |
| Unbounded tombstones | The old 200-entry eviction could resurrect removed projects. Evidence is now retained up to a hard operational limit. A 10,001st deletion rejects before deleting its project; the oldest tombstone still blocks a future-dated stale copy. There is no unsafe time-based garbage collection. |
| Misleading completion | Missing blobs are pending; corruption, interrupted attachment writes and failed folder close remain failed. Conflicts cannot default silently to local. Export completion follows successful close/handoff and does not assert peer receipt. No-op verified deliveries do not keep generating review prompts. |
| Stale storage writes | A purchase during review rejects a stale inventory choice. A project edit injected after the merge read is rejected inside the save transaction and retained. `markSynced` no longer writes a previously read whole-project snapshot. |
| Replayed keep-both | A stable fork ID replaces generating a new project on every import. Attachment-bearing forks explicitly stop until a separate project copy is saved. |
| Weak chart identity | The historical compressed-prefix fingerprint can match charts with different material brands. Full canonical structure is now checked before combining mark identities; the regression changes only a cell brand and gets an explicit chart conflict. |

## Scenario matrix

The new `syncProtocolSemantics` suite covers two devices editing offline, independent full/half/quarter/petite/long/bead mark histories, unpicks, stale imports after a newer import, repeated bidirectional replay, concurrent notes, session notes, deletion versus future-dated updates, attachment manifest bytes, missing and corrupt blobs, interrupted attachment transfer, deletion before export, inventory reduction conflicts, stale review after a purchase, duplicate accounting application, bounded tombstones, same-peer clocks moving backwards, failed folder close/retry, attachment collisions, storage write races, legacy version-1 imports and rejection of future schemas.

Existing convergence, accounting, tracking, encryption, tombstone, folder-watch, backup and specialised-stitch regressions are retained. Historical fixtures explicitly declare version 1; changed expectations now require explicit choices where the old behaviour silently picked a side or resurrected a deletion.

## Validation results

- Combined accepted-main tree: `npm test -- --maxWorkers=2` — **348 suites, 4,713 tests, one snapshot passed**.
- Final storage/accounting/restore/tombstone/service-worker regressions: **6 suites, 74 tests passed**, including all 18 protocol simulations.
- Runtime compilation freshness, Creator bundle freshness, service-worker fingerprints, terminology lint and `git diff --check` passed.
- CSS token lint completed with 13 existing non-blocking advisories in unchanged CSS.
- The subprocess-based build check requires the managed execution profile that permits child-process probes; it passed with that profile. No tests were skipped or weakened to bypass it.

No CI monitoring, merge or deployment is part of this task.
