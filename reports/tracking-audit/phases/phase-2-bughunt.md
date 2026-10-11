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

### Review round 1 (Copilot on PR 282; four findings, all verified)
- **Deferred snapshot could land in another project (High).** True: the idle callback was not tied to the project that scheduled it. It now captures the project id and drops itself if another project is open when it runs (a snapshot lost to a project switch within the idle window is acceptable; wrong-project data is not).
- **Daily snapshot never fired across a reload (Medium).** True, and the E2E test hid it by advancing the clock inside one mounted page. The last stitching day is now restored on load from the newest session, then `lastTouchedAt`, then `updatedAt` (a very short session is not recorded at all, found while testing, so the fallbacks matter). New browser test reloads between the two days.
- **Size mismatch used only the cell count (Medium).** True (10x20 and 20x10 have the same count). The stored `w` and `h` now decide, length is the fallback for older snapshots, and manual snapshots record the size too.
- **Home gate missed half-stitch-only projects (Medium).** True: `completedStitches` counts full stitches and knots only. Project meta rows now carry `anyProgress` (includes half stitches); Home uses it. Rows saved before this change get the field the next time the project is saved, so a legacy half-stitch-only project does not trigger the reminder until then.

## Batch 2: one definition of progress

### Exercised
- `npm test` (297 suites, 3,955 tests), terminology lint, `node build-runtime-js.js --check`, bundle-freshness test; Playwright regression 43 of 43 (Phase 1 and Phase 2 specs) on this code, plus `progress-units.spec.js` (3).
- Cross-check on one project (1,759 stitches, 4 done): the strip, header chip, Progress popover, project Stats, the Home/library row and share text all say 4 done and 0.2%. A half-stitch-only project shows the same figure everywhere (1.5 shown as 2).
- Data safety: old sessions with only `netStitches` still add up (`units ?? netStitches`); old summary rows are rewritten once by `refreshProgressRows`, which writes only the two summary rows, never the project; a second run changes nothing.
- Performance: interleaved A/B in the progress log. First run was over the 5% line on tap latency and global Stats; fixed (cached formatter, single breakdown computation) and re-measured.

### Bugs found
- **Fixed here:** "to go" and "done" rounded separately could disagree with the total by one (2 done + 1,758 to go vs 1,759); `remainingWhole` derives it from the two rounded numbers.
- **Fixed here:** formatter built per call on the tap path (performance, above).
- **Noted, not changed:** the sync fingerprint for sessions still reads `netStitches` on purpose; share text still starts with an emoji.

### Not verified
Safari, Firefox, real devices; a `.csync` round trip with unit-bearing sessions.
