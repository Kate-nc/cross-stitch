# Create colour blends: implementation and follow-up audit

24 October 2026 · [PR #395](https://github.com/Kate-nc/cross-stitch/pull/395) · baseline `12108485`

## Result

All seven areas from the original audit have been addressed on `codex/create-colour-blends`, in separate commits followed by an audit correction. Physical blends now work independently of spatial shading, duplicate manual recipes are prevented, saved recipes retain their components and quantities, matching agrees with screen colour, generated complexity is bounded, and the interface explains and previews the choices more clearly.

The follow-up audit supports these correctness claims. It does **not** establish that the screen model predicts physical floss accurately, or that twelve blend recipes is the best budget for every design. Measurements show a useful but explicit tradeoff between fidelity and stitching complexity.

## Changes and evidence

| Original finding | Implemented change | Verification |
| --- | --- | --- |
| Enabled blends could disappear with shading off | All mapping modes prepare candidates; palette refinement accounts for blends independently of dithering | Fresh mapping and full-pipeline tests using grey `[87,87,87]` and DMC 317/3799; worker/fallback parity tests |
| Reversing a pair could create duplicate symbols | `makeThreadBlend` constructs new recipes consistently; `blendRecipeKey` compares component brands and quantities independently of order; adding an existing recipe selects it | Constructor/identity tests and keyboard browser reproduction on three device profiles |
| Recipe metadata disappeared on save/load | Project serialization snapshots component IDs, brands, names, colours and strand quantities; restoration and palette rebuilding retain ratios | Actual JSON serialization/restoration with an unequal, mixed-brand recipe and custom component colour |
| Matching Lab and display RGB represented different colours | Matching, refinement and restoration derive Lab from the same approximate RGB mixture | Every eligible DMC candidate checked for display/matching agreement; new/legacy save-load consistency tests |
| Physical thread limit did not constrain blend complexity | Separate `maxBlends` setting, default 12; conversion ranks recipes by total original-image colour benefit, penalises isolated stitches, and reserves room within the 112-symbol ceiling | Recipe-ranking, zero-budget, symbol-budget and worker/fallback tests; controlled before/after fixtures |
| “Blend” described two different mechanisms; disabled stash state was confusing | “Two-thread blends” and “Shading pattern” have distinct names; comparison offers blends on/off; stash pairs work from two threads; disabled checkbox reflects effective state | Render tests, updated terminology/help/guides, browser comparison tests |
| Picker lacked a combined preview, complete results and keyboard controls | Native buttons, named removal controls, spelled-out thread names, combined swatch and existing stitch renderer, nearby partner ordering, paginated access to all results | Keyboard selection/removal, 60-to-120 result expansion, preview and duplicate prevention tested on desktop/tablet/phone |

Existing saved IDs are deliberately preserved. Automatically rewriting IDs would require migrating symbols, progress and other references together. New reverse-order duplicates are prevented; this change does not automatically merge duplicate entries already present in older charts.

## Architecture

- [`colour-utils.js`](../../colour-utils.js) owns the shared equal-blend constructor, recipe comparison, appearance calculation, candidate generation and generated-recipe budget.
- Each mapping pass captures its own candidate table and supplies it explicitly to `findBest`. Preparing another palette cannot replace that pass's candidates. The legacy implicit matcher interface remains for existing callers.
- [`helpers.js`](../../helpers.js) serializes component snapshots through the shared project save path. `restoreStitch` hydrates both new recipe records and legacy `A+B` records; palette rebuilding retains strand ratios.
- [`creator/generate.js`](../../creator/generate.js) and [`generate-worker.js`](../../generate-worker.js) call the same budget function after cleanup and thread-limit enforcement. Manual charts are not silently simplified by this function.
- The budget evaluates improvement against original image pixels, rather than error-diffused target pixels. It subtracts the existing 3 ΔE minimum benefit per stitch, discounts recipes with more isolated stitches, and keeps the strongest positive candidates up to the limit. This is a practical heuristic, not a global optimisation of stitching time.
- The symbol budget conservatively reserves a symbol for every selected solid thread. A zero recipe budget disables blend-aware matching/refinement work.
- The normal preview, generation, comparison, saved projects, autosave and pinned-preview restoration carry the new limit. The comparison uses the same size and **maximum** physical thread count; palette refinement may select different actual components for each policy.

## Findings from the follow-up audit

Three improvements were made after opening the PR:

1. Candidate preparation was initially made consistent across mapping modes, but still relied on the matcher's mutable last-prepared table. Mapping passes now retain and pass their own table. A regression test prepares an unrelated palette before using the captured table.
2. Compare options initially displayed confetti from before the final blend-budget pass. Both worker and fallback comparisons now use final-chart confetti, including replacements made by the budget.
3. The picker now uses the shared thread formatter so catalogue abbreviations such as `VDk` appear as “Very Dark” in component labels and accessible names.

The comparison fallback also previously applied smoothing separately before calling a pipeline which already received smoothing settings. That duplicate pass was removed so comparison smoothing is applied once, like the worker path.

## Controlled before/after results

The committed [measurements](measurements.json) contain 18 paired runs: three synthetic fixtures, shading on/off, and recipe limits of 0, 4 and 12. Baseline code ignores the new limit. Inputs and seed were held constant. Colour error below is CIEDE2000 between the original pixel and the **displayed RGB**, computed the same way for both versions.

| Fixture and policy | Before | After | Interpretation |
| --- | --- | --- | --- |
| Flat grey, fixed 317/3799 pool, shading off, limit 12 | 0 blends; mean display ΔE 7.183 | 1 blend; mean display ΔE 0.000 | Confirms the no-shading correctness fix; both threads are necessary |
| Gradient, shading off, limit 12 | 24 symbols; 0 blends; mean ΔE 5.413 | 36 symbols; 12 blends; mean ΔE 4.866 | Better pixel colour match with additional recipe complexity |
| Gradient, shading on, limit 12 | 52 symbols; 28 blends; mean ΔE 4.875 | 35 symbols; 11 blends; mean ΔE 5.503 | Reduced complexity at a measurable fidelity cost |
| Gradient, shading on, limit 4 | 52 symbols; 28 blends | 28 symbols; 4 blends; mean ΔE 5.707 | A tighter limit gives a further deliberate tradeoff |
| Flat three-colour graphic, shading off, limit 12 | 3 symbols; 0 blends; mean ΔE 2.124 | 3 symbols; 0 blends; mean ΔE 2.124 | No extra recipes introduced where these fixtures do not benefit |

These are small synthetic fixtures, not a representative portrait/photo evaluation or a physical stitching study. Per-pixel error also does not fully measure the perceived result of dithering. Elapsed times in the JSON are single-run observations gathered alongside other checks; JIT warm-up and machine load make them unsuitable for a performance claim. Blend-aware no-shading conversion can cost more work than the formerly solid-only path.

The original full-catalogue scan found a maximum discrepancy of about ΔE2000 5.53 between averaged Lab and Lab derived from averaged RGB. The new exhaustive consistency test checks that eligible candidates' stored matching Lab is derived from their displayed RGB. This establishes internal consistency, not physical calibration.

## Browser review

The picker and comparison were exercised in Chromium with these emulated profiles:

| Profile | Viewport width | Document width | Result |
| --- | ---: | ---: | --- |
| Desktop | 1440 | 1440 | Picker and comparison pass |
| iPad Mini | 768 | 768 | Picker and comparison pass |
| Pixel 5 | 393 | 393 | Picker and comparison pass |

Screenshots show the final picker, both components, approximate combined colour and stitch preview:

- [Desktop](desktop.png)
- [Tablet](tablet.png)
- [Phone](phone.png)

Six browser regressions cover keyboard selection/removal, preview visibility, complete result access, reverse-order deduplication, no page overflow, and applying the blends comparison. Device emulation is not a substitute for testing physical iOS/Safari or Android devices.

## Validation

- Full Jest suite after the matcher/statistics audit: **421 suites passed, 6,199 tests passed, 4 tests skipped in one existing skipped suite; 1 snapshot passed**.
- Focused matcher, mapping, dithering, conversion and comparison checks: **71 tests passed**.
- Final browser regressions: **6 passed** across the three profiles, including the final thread-name formatting.
- Creator and runtime bundles regenerated; generated-bundle, runtime and service-worker freshness checks run.
- Terminology lint passed. CSS token lint reports the same seven existing advisory findings; the new CSS introduces no raw hexadecimal tokens.
- PDF exporter/layout source files were not changed. The full suite includes existing export checks; no external Pattern Keeper application certification was performed.

The first broad run inside the restricted execution sandbox could not start existing localhost servers or child-process checks. Those checks were rerun with the required execution access; the successful full-suite figures above are from that rerun, not from the restricted attempt.

## Limits and recommendations

1. **Colour remains approximate.** Keep the current screen-colour qualification and encourage a stitched sample for important skin tones, gradients or brand-critical colours. Compare alternative appearance models with physical samples before claiming better accuracy.
2. **Twelve recipes is a starting policy.** The limit is adjustable. Evaluate portraits, landscapes, subtle gradients and large designs before treating it as the best default. The measurements above demonstrate tradeoffs rather than universal improvement.
3. **Existing charts retain their identities.** Legacy duplicates are not automatically merged. Such a migration must preserve chosen symbols, progress and imported references.
4. **Unequal recipes are preserved, not newly offered as an authoring feature.** The picker still creates equal two-thread recipes. Existing OXS/XSD import restrictions remain; the round-trip test does not establish that those importers accept arbitrary unequal or mixed-brand recipes. Multiple distinct imported recipes still need distinct chart IDs.
5. **Symbol reservation is conservative.** Reserving all selected solids may leave some unused capacity. Manual additions still use the existing export-overflow protection rather than automatic recipe pruning.
6. **The budget is conversion-specific.** It does not silently rewrite imported charts, manual edits or their materials. Experimental import pathways have their own policy wiring; no new recipe-limit UI is claimed for those workflows.
7. **Pipeline structure still has duplicated stages.** Blend construction, appearance and budgeting are shared, and worker/fallback parity is tested. Consolidating every conversion stage into one shared module would be a separate, larger refactor.

The next useful validation is a representative image set paired with physical samples and observed stitching effort. That would support choosing better defaults and deciding whether region connectivity, total thread changes or user-selected protected detail should influence automatic recipe selection.
