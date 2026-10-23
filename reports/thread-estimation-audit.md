# Thread requirement audit

This is the pre-fix baseline. The implementation, calibration decision and completed verification are documented in `thread-estimation-plan.md`.

Audited 23 October 2026 at source commit `29ca590e6d742e4209859b67ddc01d75246b2201`.
Scope: source inspection, execution of real calculator/shopping-row functions, existing unit tests, and comparison with public tools' documented methods. No application behaviour changed. No browser session or user pattern was supplied, so these are controlled reproductions rather than a diagnosis of a particular saved project.

## Main result

The pattern estimator is at the conservative end of the tools checked, and there are independent purchasing bugs. Do not solve this with a blanket percentage reduction: first preserve fractional demand through stash subtraction and unify the inputs used across views, then calibrate the consumption model.

For **5,000 full crosses of one colour, 14-count Aida, two strands, an 8 m six-strand skein, no stash**:

| Tool/model | Estimated use | Whole skeins to buy |
|---|---:|---:|
| stitchx Materials (20% allowance) | 4.45 | 5 |
| stitchx calculator default (15% allowance) | 4.26 | 5 |
| Knytstudio documented formula (15% allowance) | 3.48 | 4 |
| CrossStitchCalc documented formula (15% allowance) | 3.04 | 4 |
| Crossie published 1,700 stitches/skein | 2.94 | 3 |
| stitchx live accounting, default tails/waste | 2.29 | Not a shopping estimate |

External entries are calculations from the tools' published assumptions, not interactive submissions to their calculators. The spread is evidence of differing allowances, not proof that the lowest number is correct. Real use depends on travel, tails, tension and stitching technique.

Sources checked:

- [Knytstudio skein calculator](https://www.knytstudio.com/tools/skein-calculator): eight square-widths of working thread per full cross, strand scaling, six-strand capacity, plus 15%; also handles backstitch separately.
- [CrossStitchCalc thread calculator](https://www.crossstitchcalc.com/cross-stitch-thread-calculator/): 0.5 inches per strand per cross plus 15%. Its base already includes travel/tails; it does not scale to fabric count, so use it here only at the 14-count reference.
- [Crossie fabric and skein calculator](https://crossie.app/cross-stitch-fabric-calculator/): publishes approximately 1,700 full crosses per skein at 14-count/two strands, 2,000 at 16-count and 2,400 at 18-count.
- [Thread Bare's explanation of its pattern key](https://www.thread-bare.com/blog/why-clear-cross-stitch-pattern-important): a separate concrete example gives just over 6,200 stitches on 16-count/two strands as 3.25 skeins. stitchx gives 4.82, buy 5, for 6,200 at 20%. Thread Bare's figure is rounded to a quarter and is not an exact formula benchmark.
- [DMC manufacturer specification](https://www.dmc.com/US/en/products/mouline-stranded-thread/mouline-special): an 8 m skein has six separable strands. That is 48 m of single-strand material, or 24 m when stitched with two strands.

## Findings

### 1. High consumption anchor and misleading calibration history

`threadCalc.js:7–15, 65–73` uses 1.4 aggregate single-strand inches per cross at 14-count/two strands, then adds waste. The live accounting geometry in `thread-accounting.js:23` instead starts from `4.8 × strands / effectiveCount`: approximately 0.686 aggregate inches for the same cross, before tails and waste. The shopping base is **2.04 times** that geometry; the shopping total is about **1.95 times** default live accounting for 5,000 full crosses.

This difference may represent a conservative allowance, but the source calls 1.4 a *no-waste* baseline. Its comments claim 200–250 stitches per skein, whereas the actual current implementation gives about 1,349 with no waste and 1,124 at 20% waste. Those comments no longer describe the formula.

`reports/size-calculator-diagnosis.md:95–120` incorrectly identifies multiplying skein capacity by six as a bug, and claims 5,000 crosses need approximately 27 skeins. Multiplying capacity by six is correct when the numerator is aggregate single-strand consumption. Commit `2c2ed97c` removed the six and introduced the 1.4 anchor; `b2c1c78d` restored the six while retaining that anchor. This explains the current mismatch between calibration claims and implementation.

**Recommendation:** explicitly define lengths as single-strand material, working thread, or six-strand skein length. Choose a documented geometry plus explicit allowances, or an empirically calibrated stitches/skein model. Avoid adding allowances twice. Treat the current anchor as unvalidated, rather than replacing it automatically with the lowest external estimate.

### 2. Active Materials/Stash flow rounds before checking owned thread

`creator/useCreatorState.js:141–157` stores only `skeinsToBuy` as `needed`, then compares stash against that integer. `creator/PrepareTab.js:66–68` and `creator/LegendTab.js:192` subtract stash from this rounded requirement.

**Reproduction:** 800 full crosses, 14-count, two strands, 20% allowance. The core estimates 0.71 skeins. Stash `{owned: 0, partialStatus: 'mostly-full'}` correctly resolves to 0.75. `buildThreadShoppingRows` nevertheless returns `needed: 1, owned: 0.75, status: 'partial'`; Materials then reports 0.25 still needed. The estimated demand is already covered.

**Recommendation:** retain unrounded fractional demand, aggregate by actual thread, subtract usable stash, then round positive shortages once for purchasing:

`toBuy = ceil(max(0, demandExact - ownedUsable))`

Use exact demand for coverage/status. Show separate figures for estimated use and whole skeins to buy. Partial stash fractions themselves are approximate, so keep that visible.

### 3. Brand length differs between the key and shopping rows

`threadKeyUsage` resolves the brand's skein length case-insensitively. `buildThreadShoppingRows` does not pass any brand length, so the calculator defaults to 8 m for every row.

**Reproduction:** a 5,000-cross Madeira row at 14-count produces 3.56 skeins / buy 4 in the key (configured 10 m skein), but buy 5 in shopping rows. Manager also directly indexes the mixed-case `BRAND_SKEIN_LENGTH` with thread brands that may be lower-case (`manager-app.js:2264, 2303`), allowing the same fallback.

**Recommendation:** consistently call `skeinLengthForBrand`, ideally selecting the actual thread product where skein formats vary.

### 4. Unequal blends use different strand assumptions across views

`threadKeyUsage` honours `blendRatio`; `buildThreadShoppingRows` divides equally by constituent count and defaults to two total strands. `creator/ShoppingListModal.js` separately divides blends by two. Both shopping paths discard unequal constituent weights.

**Reproduction:** 3,000 crosses of `310+550` with `blendRatio: [2,1]`. The key gives 2.67 and 1.33 skeins (buy 3 and 2); active shopping rows give buy 2 and 2. This is a consistency defect and can underestimate one component, not simply inflate all estimates.

**Recommendation:** resolve total working strands and constituent strand counts once; aggregate constituent material before rounding. Preserve correct handling of the common 1+1 blend.

### 5. Rounded display precision changes buying advice

`stitchesToSkeins` calculates buying advice from the raw fraction, but `threadKeyUsage` computes it again from the two-decimal display value (`threadCalc.js:249–255`).

**Reproduction:** 1,125 crosses, 14-count/two strands, 20% allowance. Raw use is 1.000125 skeins. Core returns `skeinsExact: 1, skeinsToBuy: 2`; the key returns `skeins: [1], toBuy: [1]`. Both can look like exactly one skein in the UI while disagreeing on purchases.

**Recommendation:** keep unrounded values through all calculations, format only at presentation, and make near-boundary buying advice understandable. Define any tolerance deliberately.

### 6. Additional issues in an apparently unused shopping modal

`creator/ShoppingListModal.js:73–75` prefers the global profile fabric count over the current pattern, replaces a valid zero waste allowance with 20% using `||`, and reads only `entry.owned` rather than `stashEffectiveQty` (`:122–124`). It also duplicates aggregation rather than using the active shopping-row builder.

For a profile on 14-count and a pattern on 18-count, the same 5,000 crosses would calculate as buy 5 rather than buy 4. However, a repository-wide search found the component's declaration/export and generated copy, but **no call site**. These defects are confirmed in source; their current user reach is unconfirmed. They should not be presented as the established cause of the reported symptom.

**Recommendation:** remove the unused path if obsolete, or make it consume the same resolved project inputs and row model before reconnecting it.

### 7. Expected per-colour rounding can make totals look large

Buying one whole skein for each distinct required colour is reasonable when the user has no stash. For example, 20 colours with 100 crosses each require 20 purchasable skeins from scratch, although their combined fractional demand is only about 1.78 skeins under the current model. Colours cannot share physical thread.

**Recommendation:** label total estimated consumption separately from shopping quantity and number of colours. Preserve aggregation of a thread shared between solids and blends; active shopping rows already do that for ordinary equal blends.

## Verification and repair order

Executed the real browser-global constants/calculator and extracted the real `buildThreadShoppingRows` definition in a Node VM. Results are in `work/thread-audit-results.json` (scratch evidence). Verified 28-count over two matches 14-count in the browser-global environment; the six-strand capacity and this over-two conversion are currently correct.

Ran:

```text
npm test -- --runTestsByPath tests/threadCalc.test.js tests/threadCostPerStitch.test.js tests/skein-calculation-properties.test.js tests/threadKey.test.js tests/threadKeyRows.test.js
```

All **5 suites / 114 tests passed**. The existing tests largely assert the current anchor and internal consistency; they do not validate it against measured thread use or external benchmarks. No full-suite or browser verification was needed for this documentation-only audit.

Suggested implementation order:

1. Use one unrounded per-thread demand model and one resolved set of project assumptions across key, Materials, Stash and exports.
2. Correct stash subtraction, brand lengths, unequal blends and boundary precision; add regression cases from this report.
3. Calibrate the consumption constant with documented external comparisons and a measured stitching sample. A default near 1,500–1,700 full crosses per skein at 14-count/two strands would sit near several checked tools, but is a proposed calibration target, not an established physical constant.
4. Show estimated use, allowance, usable stash and whole-skein shortage distinctly. Update help/changelog with any behaviour change, and supersede the erroneous historical audit claims.
5. Verify non-full stitch demand separately before claiming the estimate covers every stitch type: the shopping builder accepts palette counts, while live accounting has explicit paths for halves, quarters, specialty stitches and backstitch. Knot integration already varies between Materials consumers.

Do not retrospectively change recorded consumption events or stock balances when recalibrating future estimates; the durable accounting model records assumptions at the time of each action.
