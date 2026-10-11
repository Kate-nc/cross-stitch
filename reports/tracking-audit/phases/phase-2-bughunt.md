# Phase 2 bug hunt log

## Batch 1 (BUG-01 to 05, daily snapshot, Home backup reminder)

### Exercised
- `npm test` (293 suites, 3,930 tests), terminology lint, `node build-runtime-js.js --check`; Playwright: `phase2-batch1` (5), plus the Phase 1 specs for the area touched (see PR).
- Reproduced each original failure before fixing: BUG-01 with the old files in a VM (`Identifier 'useState' has already been declared`) and in the browser (the Activity tab test fails on the old files, passes on the new); BUG-03 with the old `home.html` (4 mojibake sequences); the snapshot with the old code (it throws `getStitchingDateLocal is not defined` into a swallowed catch).
- Fit: a 40x160 pattern fits the box on both axes (checked scroll size against client size).
- Snapshot: a faked clock moved a day forward; the first mark of the new day produced one `auto` snapshot with the pattern size.
- Home reminder: shows for a project with stitches done and a 20-day-old backup; does not show when nothing is stitched.
- Data safety: no stored data format changed; `doneSnapshots` entries gain optional `w` and `h`; old entries (no `w`/`h`) are handled by data length.
- Performance: see the progress log (interleaved A/B).

### Bugs found
- **Fixed here:** Compare drew any snapshot on today's grid, so a snapshot from before a size change looked wrong; it now says so.
- **Pre-existing, noted and not fixed:** the first mark of a new day is included in that day's snapshot of "yesterday" (the snapshot is taken after the mark is counted), so it is off by one stitch.
- **Intermittent `save-durability` test ("marks made a moment before a reload", second drag marks nothing, about 1 run in 6 to 12):** time-boxed look. A stripped copy that does the same two drags and records what is under the pointer passed 14 of 14 and always found the canvas under the pointer, so I could not reproduce the cause in isolation. It also fails on the commit before Phase 1, so it is not a regression. Left undiagnosed; if it appears in CI, re-run once and report.
- `index.html?mode=stats` redirects to Home when there is no active project (the audit's reproduction assumed one). Not a bug; the new test sets an active project.

### Not verified
Safari and Firefox; real devices; the Activity tab with a very large history (the 500-session project was timed for Stats open, not Activity).

### CI round (batch 1)
- CI failed on the first push: `creator/bundle.js` was stale (I had edited `creator/useCreatorState.js` and not rebuilt the bundle). `npm test` did not catch it because the staleness check is a CI step, not a test. Rebuilt and pushed, and added `tests/bundlesUpToDate.test.js`, which runs the same builds and fails (leaving the tree unchanged) if a committed bundle would differ; checked by appending a line to a Creator source file.
