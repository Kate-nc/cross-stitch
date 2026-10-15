# Track history accounting (QA-05, QA-13)

Base: latest fetched `origin/main`, `e1f015d8` (accepted PR #327 progress consistency, PR #325 session durability, PR #326 thread deductions and PR #324 sync preservation). The workspace was clean. Fetch succeeded with network access enabled for the command.

## Entry and persistence map

| Entry | Chart / progress | Session contribution | Undo / Redo |
| --- | --- | --- | --- |
| Array of `{idx, oldVal}` | One full stitch or whole-colour completion; incremental full/per-colour counters | Counts actual additions/removals, one unit each; optional catch-up | Swaps prior cell values, transfers the same receipt |
| `BULK_TOGGLE` | Full-stitch drag or rectangle, one step; incremental counters | Exact changed cells, with catch-up classification for an eligible rectangle | Same marks and receipt, no new work |
| `HALF` | Cell, direction, prior state; half unit; updates half colour counters incrementally | One half-side and 0.5 units | Restores prior side without losing the other side |
| `QUARTER` | Cell and corner; immutable sparse map; 0.25 units | One corner and 0.25 units | Flips the corner and reverses/restores its receipt |
| `KNOT` | Knot key; immutable list; one unit | One knot and one unit | Flips the key and reverses/restores its receipt |
| `BS` | Changed line keys and new state; separate line counts, excluded from stitch progress units | No stitch units (existing supported behaviour) | Restores lines; no stitching activity |
| `PARK` | Added/removed park markers; no progress | None | Restores marker changes |
| `UNPICK` | Plan of full, half, quarter, knot and backstitch marks; full counters incrementally updated, half colours updated incrementally | Physical work: original day's unpicked counts/units, not negative additions; backstitch remains line-only | Restoring marks cancels the original unpicked receipt, without adding stitching; Redo restores that receipt |

All entries share the 50-step limit and redo invalidation. Marks and journals use existing project snapshots and progress records. Stacks, receipts and event references stay in memory and are cleared on project load and cross-tab reconciliation. Restart never restores undo history.

## Accounting model and boundary policy

An action records activity synchronously and retains a receipt identifying its session, stitching day, exact counts/units, catch-up and original timing event. History moves that same receipt between applied and unapplied states. `ProgressUnits.sessionAdded` retains its existing additions-minus-catch-up definition; physical unpicking remains separate rather than being flattened into net progress. It never calls ordinary activity recording. The count-observation effect remains responsible for milestones and optional daily snapshots, not activity inference; mixed opposing changes cannot cancel each other's accounting between renders.

For an open session, correction adjusts that receipt's original `byDay` bucket, even after the stitching-day boundary. No new timing event, automatic resume, session, date or idle extension is created. The original event is excluded while undone and restored on Redo. An all-undone session retains a zero-addition journal row when ended so a subsequent Redo can restore its original attribution. Zero additions do not qualify for streaks or pace.

After finalisation, correction adjusts the original saved row's contribution and the cumulative progress of later day fragments in that same run, retaining measured time, notes and other fragments' additions. It never charges another active session. Explicit journal edits, notes, merges and deletions replace the row: they are authoritative, so subsequent chart history leaves that row alone. Loading/switching projects clears history; a project-ID check also guards receipts.

Session and mark refs update synchronously with React state. Full snapshots and small progress writes read these refs. Corrected finalised rows carry `historyCorrectedAt` and `historyCorrectionRevision` so pending-session recovery can replace an older row with the same ID while preserving a later explicit journal edit. Recovery retains all pending rows, including multiple finalisations before a full save.

## Staged bug hunts

1. Half history: latest-action ordering, independent slash directions, 50-entry limit, new action after Undo, many operations before render. Found stale history/redo closures; replaced their updater wrappers with synchronous mirrors and made full-stitch Undo/Redo read/write the live mark ref.
2. Activity bookkeeping: repeated cycles, mixed signs, catch-up and physical-unpick restoration. The accepted base reconciles half-colour counts in an effect; added an incremental half-side update so rapid history operations also see correct counters before that effect, without rescanning full cells. Removed activity inference from the asynchronous count effect.
3. Mixed/bulk/boundaries: exact multi-type round trips, finalise while undone, new session on another day, project isolation and recovery. Found stale saved-session/half/quarter/knot snapshots and pending-session replacement/overwrite gaps; snapshots read live refs and recovery handles corrected existing IDs.

Existing `tests/qaTrackReview.test.js` and `tests/e2e/qa-track-review.spec.js` are unchanged; new behaviour tests live in separate history-accounting suites.

## Exact reproductions covered

- Mark a full stitch, then either half direction. Undo removes the last half and leaves the earlier full stitch alone. Redo restores it; a new half action after Undo empties Redo. Each thread's half counter follows the chart.
- Mark one full stitch, repeat Undo/Redo four times with keyboard shortcuts, click End session, save and reload: one saved record with `unitsCompleted: 1`, `unitsUndone: 0`, `units: 1`; both history stacks empty after reload. Unit coverage repeats twenty cycles and checks additions, active-day eligibility and measured time.
- In one React batch, mark two full stitches, one half, one quarter, one knot and a backstitch line. Undo all six steps, Redo all six, unpick the entire area and alternate history restoration. End session saves exactly 3.75 completed units, no undone units and the original line.
- Mark a colour's 118 full stitches as catch-up, Undo/Redo and End session: 118 completed, 118 catch-up, zero added. Correct the finalised row, Redo it and mark a half in another session: the original catch-up classification remains and the new session adds only 0.5 units.
- Mark 1.5 units and physically unpick them, then End session: 1.5 completed and 1.5 unpicked. Undoing that unpick after finalisation restores marks and removes only its unpicked contribution. It starts no session and adds no stitching.
- With a fixed UTC browser clock, mark before midnight and mark a half after midnight. Undo/Redo then End session retains the original two days' 1 and 0.5 additions. More corrections after advancing another day change no attribution. Unit coverage also checks later fragments' cumulative totals.
- Load another project in the mounted Tracker after saving a half: both stacks reset immediately and neither chart history nor session contributions transfer.

## Final review additions

The final review found two more boundary cases and added executable regressions: a completed session whose every action is undone must survive the short-empty-session discard rule, and undoing an explicit journal edit must not reattach a chart correction that previously skipped that edited record. The small progress writer now also reads live backstitch keys, with a browser transaction forced before React renders to cover mixed-container durability. A correction revision also fences recovery retirement: an older full save of the same session ID cannot clear the newer correction's backup. History corrections use the canonical capped percentage for corrected cumulative progress.

## Verification results

- Final browser run: `E2E_LOCAL_CDN=1 npx playwright test -c work/playwright.config.js track-history-accounting.spec.js qa-track-review.spec.js session-durability.spec.js --workers=1` — **20 tests passed** (4 preserved QA, 9 preserved durability, 7 new history/accounting cases). This includes a real small-progress transaction before React renders and a full mixed-mark reload after End session.

- Final full unit suite: `npm test -- --maxWorkers=2` — **337 suites, 4,529 tests and one snapshot passed**. Jest emitted a worker-teardown warning, also seen in earlier baseline runs; no assertion failed.
- Post-review save-path/accounting checks: `npm test -- --runTestsByPath tests/trackHistoryAccounting.test.js tests/sessionCheckpointStorage.test.js tests/trackerPhaseA.test.js tests/backstitchMarkingWiring.test.js` — **103 tests passed**. The dedicated accounting suite also passed with explicit calculated pace, speed and streak assertions.
- Previously failing branch suites and preserved unit QA/durability checks rerun in isolation: **9 suites, 84 tests passed**, including encryption, convergence, backstitch performance and generated-file checks.
- `node build-runtime-js.js --check`, terminology lint and `git diff --check` passed; the generated tracker runtime is included.

### Baseline versus regressions

The untouched latest-base archive (`e1f015d8`) initially produced 7 failing suites / 8 failed tests under competing jobs: wake-lock timeouts, backstitch indexing's wall-clock threshold, convergence timeouts, PDF import timeouts (`pdfDesigns` and `pdfHalfStitches`), a stored-Stats timeout and an empty-output child-process build check. The first branch-wide run produced 4 failing suites / 7 failed tests: backstitch, convergence and the build-check issue also occurred on the clean base; encryption additionally timed out, followed by a passphrase-state failure. All four branch failures passed on the isolated rerun, and the final full suite passed all 4,529 tests. No unrelated test or production fix was committed to mask these failures.

The existing QA unit and browser files are preserved. Their progress, colour-count, completion-scope and session-durability reproductions remain intact. Browser runs use local CDN assets and the system Chromium binary; video is disabled only in the temporary runner config because its ffmpeg binary is unavailable. Preserved browser suites use the repository's tablet device preset, while the new history cases use desktop Chromium. Accounting assertions explicitly end the session first.
