# Known behaviour held apart from cleanup

## Snapshot tolerates a rejected live flush

`SyncEngine.writeSnapshot()` deliberately catches a rejected `window.__flushProjectToIDB()` and continues to read stored metadata and write the snapshot. `exportSync()` propagates that error instead. A snapshot may therefore describe the previously stored project while live saving is paused. The added test `known behaviour: snapshot still records metadata when the live flush rejects` reproduces this on unchanged product code. No bug fix is authorised or included here. A future consistency fix needs its own explicit behaviour decision and regression.

## Deliberate Tracker fallback retention

Tracker unmount replaces `__flushProjectToIDB` with a closure over its latest snapshot instead of deleting it. Backup/sync can flush during the handoff gap before Creator registers its handler. The browser test executes that fallback and checks the exact saved marks. This is a compatibility contract, not evidence of a newly discovered leak. Do not remove it merely because the mounted component is gone.

The old single-run import/mark/save/reopen timings are smoke observations, not budgets. Differences in the repeated A/A measurements must not be used to invent an acceptable slowdown or silently change algorithms.

## Inherited browser baseline remains unresolved

[The prerequisite validation guide](../../docs/validation-baseline.md) records 41 failures in its full 447-case touch-tablet matrix, reproduced on that task's unchanged base. This PR does not fix those failures or rerun the entire matrix. Its focused journeys and full Jest results must not be represented as a green full browser baseline. Keep the PR draft while that baseline remains unresolved.
