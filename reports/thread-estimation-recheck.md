# Thread estimation recheck

Rechecked 23 October 2026 against the current local implementation. External pages were reopened during this check. Comparisons below are recalculated from published formulas/tables; they are not claims of interactive submissions to competitors or measured stitching consumption.

## Result

The planning arithmetic is correct across the checked settings and the default full-cross estimate falls inside the checked tools' range. One additional substitution bug was found and corrected: planning had renamed the stock identity without converting quantities between different skein lengths. A 3.175-skein DMC requirement now becomes 2.54 Madeira skeins when the replacement skein is 10 m rather than 8 m: buy three rather than four from scratch. Reverse conversion and merging several source threads conserve material length. Consumption-event remapping deliberately retains its original model units; stored debits and stock are not revalued.

This verifies software arithmetic and benchmark consistency. It does not establish physical accuracy for every stitching technique. Knot/petite/outline allowances remain model estimates, and a measured sample is still needed for empirical calibration.

## Refreshed comparisons

5,000 full crosses in one colour, two strands, no owned stock. Each cell is **fractional skeins / whole skeins to buy**. stitchx uses its default 20% allowance; Knytstudio uses its published 15%. Crossie publishes total per-skein capacities without a separately adjustable allowance.

| Fabric count | stitchx | Knytstudio | Crossie |
|---|---:|---:|---:|
| 11 | 4.041 / 5 | 4.426 / 5 | 4.167 / 5 |
| 14 | 3.175 / 4 | 3.477 / 4 | 2.941 / 3 |
| 16 | 2.778 / 3 | 3.043 / 4 | 2.500 / 3 |
| 18 | 2.469 / 3 | 2.705 / 3 | 2.083 / 3 |
| 22 | 2.020 / 3 | 2.213 / 3 | 1.724 / 2 |
| 28 over 2 | 3.175 / 4 | 3.477 / 4 | 2.941 / 3 |
| 32 over 2 | 2.778 / 3 | 3.043 / 4 | 2.500 / 3 |

- [Knytstudio](https://www.knytstudio.com/tools/skein-calculator): eight square-widths of working thread per strand, 15% allowance, 48 m single-strand material per skein. At the same 20% final allowance, its 14-count estimate is 3.629 skeins versus our 3.175. The 12.5% difference is the documented eight-width versus seven-width base assumption, not a unit error.
- [Crossie](https://crossie.app/cross-stitch-fabric-calculator/): publishes 1,200 / 1,700 / 2,000 / 2,400 / 2,900 full crosses per skein at 11 / 14 / 16 / 18 / 22 count. Our estimate is about 3% lower at 11-count and 8–19% higher at 14–22 count. It remains somewhat more conservative on finer fabrics; different whole-skein advice near boundaries is expected.
- [CrossStitchCalc](https://www.crossstitchcalc.com/cross-stitch-thread-calculator/): at 14-count and matched 15% allowance, our result is **3.042708** versus its published formula's **3.042328** skeins, a **0.0125%** difference. It uses 315 inches for an 8 m skein; we use the exact 8 m conversion. Both advise four skeins. Its formula does not scale to other fabric counts, so it is not used as a finer-fabric benchmark.
- [Thread Bare](https://www.thread-bare.com/blog/why-clear-cross-stitch-pattern-important): its approximate example of just over 6,200 stitches on 16-count/two strands is 3.25 skeins, rounded to a quarter. At exactly 6,200, our result is 3.445. This is a loose check only, because its exact stitch count and allowance are not supplied.

For the original reference case, the previous implementation estimated 4.445 skeins (buy five); the current one estimates 3.175 (buy four), a 28.6% reduction in fractional demand. The reduction is not applied indiscriminately to every stitch type: outlines and other chart units have explicit material weights.

## Checks rerun

- **6,400 independent arithmetic assertions**: fabric counts 11, 14, 16, 18, 22, 25, 28 and 32; one to six strands (1, 2, 3, 4, 6); allowances 0%, 10%, 15%, 20%, 30%; stitch counts from zero through 10,000 including whole-skein boundaries; 8 m and 10 m skeins. Expected amounts were calculated directly in millimetres and divided by single-strand metre capacity, separately from application constants. Raw quantities and final purchase rounding agree.
- **Complete Jest suite**: 417 suites passed, one existing suite skipped; 6,145 tests passed, four skipped; one snapshot passed. The full run began before the additional substitution regression cases were added.
- **Post-fix focused run**: five suites, 120 tests passed, including the two new substitution cases, mixed-brand blends, boundaries, partial stash, fractional stitches and recorded accounting behaviour.
- **Browser rerun**: all five passed, including the newly extended real-browser substitution check; Materials/profile fabric/partial stash/library consistency; reservation JSON; Tracker accounting history/reload; sample chart PNG export.
- Runtime bundle freshness and `git diff --check` passed. `node build-sw.js` regenerated the service-worker fingerprints after the small correction and help/changelog updates.

Reproduction code and numeric results are in `work/recheck-comparisons.cjs` and `work/recheck-comparisons.json`; test logs are `work/recheck-*-tests.log`.
