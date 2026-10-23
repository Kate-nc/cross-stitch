# Thread estimate repair plan and implementation

## Plan

1. Preserve unrounded per-thread demand and subtract usable stash before whole-skein rounding. Keep the existing rounded API field for display compatibility, with a separate raw value for arithmetic.
2. Share constituent strand counts, case-insensitive brand lengths and aggregation across keys, Materials, Stash, library sync, project planning and export inputs. Use the actual project's fabric count. Include fractional crosses, knots, petite crosses and line lengths explicitly.
3. Recalibrate future shopping estimates to 0.5 inches per used strand on 14-count, scaling inversely with effective fabric count. Apply a configurable waste allowance once, default 20%. This gives about 1,575 full crosses per standard 8 m skein using two strands.
4. Separate estimated consumption, usable stash and whole-skein purchases in UI/copy/share. Explain per-colour rounding and approximate partial skeins. Correct the previous audit's unit error and update in-app help/changelog.
5. Verify audit cases, blend/brand identity, raw precision, non-full stitch types, linked library sync, reservation allocation and immutable historical consumption. Rebuild Creator/runtime/service-worker assets and run unit and focused browser regressions.

## Calibration decision and limits

This is an explicit planning benchmark, not a claim of physical measurement. An ordinary full-cross path is about 4.83 square widths per strand. The planning model uses seven widths (0.5 inches at 14-count) to allow for travel and fabric thickness, then adds 20% for tails, rework and other waste. It produces 3.175 skeins for 5,000 full crosses, buy four from scratch. Source comparisons and their limitations are in `thread-estimation-audit.md`.

The selected default sits between Knytstudio's roughly 1,437 and Crossie's roughly 1,700 crosses per skein at 14-count/two strands. CrossStitchCalc uses the same half-inch strand length, with a 15% final allowance. Published tools disagree; these numbers establish a reasonable planning range, not one universally correct figure.

Outline/long-stitch material is twice the measured grid path per used strand. Outlines default to one strand, crosses to two, and explicit strand counts/blend ratios win. A half is half a cross; a quarter is one quarter; a petite cross uses half the full-cross thread geometry. Knots use one cross equivalent as a coarse allowance. Beads and fabric are separate. These are material weights, not progress weights.

Colour keys describe one chart symbol's full-cross requirement. Materials/Stash include other stitch objects too. Library sync stores two-strand full-cross equivalents by physical thread so blend and outline contributions are not charged again as full two-strand crosses.

Creator estimates describe the whole design. Project reservations describe unfinished work and share free stock once across projects; their totals can legitimately differ. Future reservations now use the planning model. Recorded consumption remains model 2: no historical events, existing usable balances or reservation intent are rewritten. Effective claims recalculate on refresh, as they already do after chart edits.

## Physical validation still needed

A software environment cannot stitch a measured sample. Before claiming empirical accuracy, stitch a counted block and a representative scattered-colour sample on 14-count using two strands, recording thread cut lengths and unused tails. Repeat on 18-count. Compare actual single-strand material against model predictions and record method, stitch counts, waste and results. Adjust the documented benchmark only from this evidence; never retrospectively revalue consumption events.

## Verification

Regression cases are in `tests/threadPlanning.test.js`, the existing calculator/key tests, and reservation tests. Focused browser tests verify the real Materials/Stash path, partial-stock coverage, library/planning agreement and absence of page errors. Final commands/results are recorded after verification below.


Completed verification:

- `npm test`: 417 suites passed, one existing suite skipped; 6,145 tests passed, four existing tests skipped; one snapshot passed. Exit status 0.
- Final focused demand/key/reservation/conflict regression run after export-metadata refinements: four suites, 90 tests passed.
- Chromium browser regressions: five passed — Creator Materials/partial stock/profile fabric/library consistency; browser blend/brand/boundary figures; project reservations and shopping JSON; Tracker accounting mark/correction/undo/redo/history/reload; and pixel-art sample PNG export. Used the installed `/usr/bin/chromium`, local CDN fixtures and a local test server.
- `node build-creator-bundle.js`, `node build-runtime-js.js`, `node build-sw.js` completed. `node build-runtime-js.js --check` and `git diff --check` passed. PDF layout/worker sources were not modified; the full suite includes the existing Pattern Keeper compatibility regressions.

The first full-suite attempt was blocked by sandbox loopback restrictions; the successful run enabled local test-server networking. The desktop sample-export test also exposed an existing helper that checked for a backdrop's existence instead of visibility; that helper now checks visibility.

All software steps above are implemented. Physical swatch validation remains an explicit calibration limitation, with the procedure documented above. No deployment or publication was performed.


## Subsequent independent recheck

See `thread-estimation-recheck.md` for refreshed comparisons, 6,400 independent arithmetic assertions, full-suite and browser reruns, and the additional correction for substitutions between different skein lengths. Planning now converts replacement quantities through material length. Historical consumption units remain unchanged.
