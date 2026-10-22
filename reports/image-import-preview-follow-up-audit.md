# Image import preview audit — PR #379 follow-up

Reviewed PR head `10d1797b433766283d0b74835d5545875a9364c6`. Scope includes Convert and the experimental five-step Tracker import wizard.

## What PR #379 fixes

- Transparent/skipped cells sit over the chosen fabric colour, including in the magnifier.
- The orange change overlay is opt-in and clipped to the converted side.
- Preview geometry follows the displayed result while dimensions are being changed.
- Pending full passes are cancelled when conversion settings change.
- Canvas filter support checks the actual context property, so browsers without it use the pixel fallback.

## Additional defects addressed

| Area | Gap | Follow-up |
| --- | --- | --- |
| Preview lifecycle | Replacing/cropping an image retained old results during the debounce; conversion/encoding exceptions could leave loading active and old metadata visible. | Clear source-specific results, clear loading on every failure, show an actionable error and retry. Hide estimates during pending conversion. |
| Progressive comparisons | The quick pass became the diff baseline, so the comparison could describe quick-versus-full processing instead of the user's edit. | Compare settled results only; reset the baseline for a new source. |
| Overlays | Alpha-only changes were missed; heatmap/highlight covered the original half and could describe old pixels. | Compare alpha, clip every diagnostic overlay, hide them while loading, and invalidate highlights when publishing a new result. |
| Magnifier | Its divider used the lens position instead of the magnified sample coordinates. | Compute the split in sampled-pixel coordinates. |
| Filter fallback | Preview assigned a native filter even when the shared capability flag selected fallback. | Use the same native/fallback choice as Generate. |
| Wizard preview | Step 4 displayed the original image; Step 5's partial cache omitted several settings and could stay on “Calculating”. | Debounced converted previews in both steps, complete settings invalidation, recoverable errors, and Generate disabled until the current preview succeeds. |
| Wizard generation | Tracker discarded crop, palette, shading, smoothing, contrast and blend settings. | Pass the complete settings object through the same parser used for preview. |
| Wizard processing | Bayer selected the Atkinson path; rotation/mirroring/crop, contrast and stash restrictions were unwired. | Apply centred crop/orientation, exact requested dimensions, contrast, selected mapper, owned DMC palette, blend metadata and optional saliency display. The audit also caught and fixed missing blend-table initialisation when shading is off. |
| Geometry/transparency | Aspect lock ignored rotation/crop; fractional crops could produce non-integral grids; alpha cutoff disagreed with quantisation. | Use shared geometry, cap locked dimensions together, round output dimensions, and align the alpha cutoff. |

## Regression coverage

- Preview hook tests inject preparation, pipeline and canvas-encoding failures; verify recovery, metadata invalidation, missing input, cancellation and fast/full frame dimensions.
- Real-canvas parser tests cover geometry, all four shading modes, blends through saved-project conversion, owned/partial stash entries, empty stash rejection, contrast, background tolerance, saliency and transparency.
- Browser tests exercise the production comparison component, real Convert import and Generate, native and forced pixel filters, source replacement, retry, completed-frame diffs, overlay clipping and magnifier alignment.
- Wizard browser tests cover edits and final output, confirmation refresh, stash changes, rapid edits and unmount cancellation. A Tracker integration test covers the production handoff and saved-project reload.

Validation:

- Full Jest run: 391 suites passed, 3 failed, 1 skipped; 5,653 tests passed, 3 failed, 4 skipped. The new no-shading blend test exposed a missing blend-table initialisation, which was fixed. The other failures were the unchanged backstitch speed limit and a PDF worker timeout during concurrent browser work.
- Isolated rerun of both timing-sensitive suites, without changing assertions or timeouts: 44/44 passed.
- After the blend fix, the parser, preview lifecycle/reactivity and wizard component suites: 53/53 passed. This resolves all three failures from the full run; the entire suite was not repeated after the one-line blend fix.
- Chromium: all 11 Convert/comparison scenarios, all five wizard scenarios the existing exact-pixel import regression, and Tracker save/reload passed across the final run and targeted rechecks (18 scenarios in total). Early test failures caused by reading before React committed, a CSS serialisation expectation, and incomplete Tracker setup were corrected.
- WebKit: all 12 focused browser scenarios passed, including the actual no-native-filter path and Tracker import/save/reload. Downloaded system libraries were supplied from the workspace to run WebKit; no application dependency or system package installation was changed.
- Creator bundles regenerated and verified unchanged by a second build; compiled runtime check, service-worker fingerprint check, terminology lint and whitespace checks passed. CSS-token lint reported 13 existing advisories in unchanged styles.

## Limits

The Convert preview retains its existing 40,000-cell approximation above that size; exact pixel-art imports bypass that cap. Guided previews use the requested full grid and the existing synchronous parser, so large grids with many blend candidates can still pause the main thread. Moving conversion into a worker remains a performance follow-up. Automated regression checks cannot establish that every image, device or browser version is defect-free.
