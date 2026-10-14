# Compare snapshot controls bug hunt

Branch: `feat/snapshot-controls`. Automatic Compare history is now opt-in, with a global device preference defaulting to false for existing and new users. No project-data migration deletes existing history.

## Findings and fixes

- Queued idle work previously checked only the project ID. A preference disable/re-enable or an A > B > A project switch could let stale work run. A generation token now invalidates work on preference changes, day-end changes, project loads and unmount; the callback and its state updater also check the live opt-in value.
- Enabling needs a baseline for projects that are not currently open. The latest opt-in timestamp is persisted globally and clips the restored project baseline, preventing snapshots for days before opt-in while preserving later rollover across reloads.
- Reset Preferences previously did not notify live consumers. It now sends the existing preference-change event, invalidating queued snapshots immediately.
- Comparison controls did not receive the dashboard's read-only flag. It now reaches ComparisonView; save and both deletion actions are guarded and disabled.
- A deleted selection or a size-mismatched snapshot could leave old pixels on the comparison canvas. Selection cleanup and canvas clearing now remove stale comparisons.
- Sync previously retained only local Compare history and had no deletion records. Tracking merges now union snapshots by ID, apply deletion records from either device, preserve manual/recovery history and cap automatic history at 60.
- Creator project load/refresh and Tracker manual export/handoff paths needed to preserve deletion records. They now carry `deletedSnapshotIds` alongside Compare history. Autosave and session recording remain independent of the preference.
- Current main added validated portable preference backups. The toggle now participates in that contract; restore establishes a new local opt-in baseline, invalidates queued work, and preserves excluded device state. Older preference sections default the toggle to off.
- A new manual snapshot labelled `auto` previously looked automatic. New manual snapshots carry `kind: 'manual'`, which bulk deletion and retention respect. Legacy snapshots still use the existing `label: 'auto'` convention because old data has no separate origin marker.

## Coverage

`tests/snapshotControls.test.js` executes the preference store, queued rollover callbacks and lifecycle subscription, renders ComparisonView with React, and exercises sync merges. Coverage includes existing-user defaults; opt-in timestamp persistence; rapid off/on and reset; day-end changes; project-load invalidation; one-per-rollover creation; compression/dimensions; confirmation cancellation; both deletion actions; selection cleanup; manual labels; recovery preservation; read-only guards; portable restore rebasing; and repeatable two-device merge behavior. `tests/projectStorageProgress.test.js` also verifies that IDB full saves and small progress records retain deletion records and remaining manual/recovery snapshots.

`tests/e2e/snapshot-controls.spec.js` exercises the full Tracker's opt-in baseline, queued work, manual save, both confirmed deletion actions, IDB flush and reload. Existing daily-rollover browser tests explicitly opt in. Existing pattern-change browser tests check recovery snapshots while the default remains off.

Help, README, Tracker guide, Sync guide and APP_CHANGELOG document the setting and deletion behavior. Runtime and Creator bundles are regenerated from source.

## Validation

- All six focused Chromium browser tests pass, including the complete controls/reload flow, read-only existing history, daily rollover in an open Tracker and across reloads, and both pattern-change recovery choices with automatic snapshots off.
- The new controls and portable-backup tests pass (28 tests across the two suites). Focused storage, persistence, recovery and sync checks also pass.
- Runtime and Creator bundles rebuilt; `node build-runtime-js.js --check`, terminology lint and `git diff --check` pass. CSS token lint reports 13 existing non-blocking advisories in unchanged `styles.css`.
- The sandbox denied the freshness test's `spawnSync` call (`EPERM`), despite a passing direct check; the full suite is run with child-process access. Browser installation and local-server access were resolved before the successful run.
- Full suite: `npm test -- --maxWorkers=2` passes all 325 suites and 4,430 tests, plus the icon snapshot. One earlier run alongside browser checks exceeded an existing backstitch timing threshold by 10 ms (510 ms versus 500 ms); all 27 backstitch tests passed in isolation and the complete repeat run passed without changing implementation or assertions.

## Remaining limitations

Legacy snapshots encode their origin only through `label: 'auto'`. An older manually named `auto` snapshot is indistinguishable from an automatic one; new manual snapshots have an explicit origin marker. No other functional issues were identified by the focused bug hunt.
