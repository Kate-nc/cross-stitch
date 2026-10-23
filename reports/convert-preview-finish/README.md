# Convert: estimates, phone layout and pinned previews

23 October 2026. This finishes changes 1–5. The optional viewport-only close-up renderer is deferred to a separate PR; this change retains the existing canvas budgets and renderer.

## Before and after

Baseline commit: `fd37f01b8f1e565caea60d07568fc1e9cb404a9e`. Baseline screenshots use the committed `HEAD` assets served through Playwright routes. After screenshots use the working tree. Both use the same logo fixture and the same viewport. The photo comparison uses the accuracy harness's astronaut fixture.

| Change | Before | After |
| --- | --- | --- |
| Shared Pattern estimates and thread labels | [Desktop estimates](before-estimates-desktop.png), [phone estimates](before-estimates-phone.png) | [Desktop estimates](after-estimates-desktop.png), [phone estimates](after-estimates-phone.png) |
| Picture strip above a full-width phone preview | [Phone layout](before-phone.png) | [Phone layout](after-phone.png) |
| Show what changed in every view | [Stitched baseline without this control](before-desktop.png) | [Stitched](changed-stitched-desktop.png), [Flat](changed-flat-desktop.png), [Before / after](changed-compare-desktop.png); [phone Stitched](changed-stitched-phone.png), [phone Flat](changed-flat-phone.png), [phone Before / after](changed-compare-phone.png) |
| Pin and compare choices before generating | [Baseline without a pin](before-desktop.png) | [Balanced and Tidier together](photo-pinned-desktop.png), [phone switch](photo-pinned-phone.png); [changed geometry and settings](pinned-desktop.png) |
| Logo edge and lettering threads | [Original logo conversion](before-desktop.png) | [Fixed conversion](after-desktop.png) |

The estimates retain stitches, skipped stitches, chart symbols, threads, skeins, time and cost. Project no longer repeats the preview estimates. Confetti has its own section using the finished preview's single-stitch count. Thread rows are buttons with persistent selection, work across all views and use `formatThread` for brand and blend labels.

Below 900 pixels the source picture, Crop and Change form a short strip. The preview has the full middle-column width. The Pixel 5 test requires at least 90% of the screen width and verifies every picture/preview button is horizontally on screen.

The change overlay is made from cell identities and colours in `usePreview`, using completed results only. Dimension changes clear it because cells cannot be compared directly. The slider no longer calculates image differences. Its overlay shares the same data as Stitched and Flat and stays clipped to the preview side.

A pin retains a completed cell array, summary, settings signature and editable settings. Wide screens show two stitched pictures; phones switch between Pinned and Current. The difference line covers changed stitches, confetti, threads and skeins. Applying a pin restores dimensions, image adjustments, shading, cleanup, brand, exact mode, stash constraints, the original thread limit, variation, fabric and preset provenance. A new image or crop clears the pin. The generated chart is still changed only by Generate/Regenerate.

## Logo investigation

The browser failure reproduced before changing the conversion pipeline: 7 threads against the unchanged limit of 5. Look-alike separation was disabled for this fixture, so it was not adding colours.

Tracing the actual 100 × 100 browser input through the accuracy harness found 8 mapped threads before edge folding. The original fold removed only the red/yellow intermediate shade (`722`), leaving 7. Pink background-edge thread `3688`, pale lettering shades `762`/`03` and dark lettering-edge thread `317` remained. Rare-colour folding did not change this.

For undithered pictures with background skipping, the fold now recognises the background as an endpoint while preserving the existing coverage mask. A populated pale lettering shade can serve as an interior endpoint; nearby edge patches can reach it through up to three thin patches. Perceptually close duplicate shades can merge into a touching endpoint. The original neighbour order is retained so tie-breaking in photo conversions is unchanged. Dithered conversions retain the original path.

The logo now uses **4 threads** (`347`, `742`, `820`, `03`), below the original limit of 5. It retains all **3,268 stitched cells** and **6,732 skipped cells**, has no near-white stitched threads, and meets the existing confetti limit. A unit regression also verifies page/worker parity and exact preservation of the coverage mask.

## Verification

Results are recorded below after the final runs. Photo colour error, blurred colour error, edge error, confetti, small patches and thread counts are in [photo-measurements.json](photo-measurements.json).

Commands:

```sh
npm test -- --maxWorkers=2
npm run lint:terminology
node scripts/check-generated-bundles.js
node build-runtime-js.js --check
node build-sw.js --check
CHROMIUM_PATH=/usr/bin/chromium E2E_LOCAL_CDN=1 npx playwright test --config=playwright.creator.config.js
BASELINE_REF=fd37f01b8f1e565caea60d07568fc1e9cb404a9e node scripts/conversion-accuracy/preview-finish.js
```

`CHROMIUM_PATH` is optional; this environment uses its installed Chromium. The browser configuration covers desktop and Pixel 5, with existing tests also exercising tablet and landscape layouts. The help drawer, changelog, README and wiki Convert guidance are updated.

Final checks:

- Unit suite: **6,133 passed**, 4 skipped; 416 suites passed and 1 skipped. The earlier backstitch timing failure under heavy concurrent load passed in the final full run.
- Terminology lint, generated bundles, compiled JavaScript, service-worker fingerprints and `git diff --check`: passed.
- Photo accuracy: **20 of 20 charts identical** to the baseline (ten photos, shaded and undithered), including all recorded colour-error and confetti measurements.
- The unchanged logo browser regression passes with 4 threads, no near-white stitches and confetti below its existing 1% limit.
- All **18 final preview/pin checks pass** across the desktop and phone projects, including exact mode, brand changes and restoration of the raw thread limit behind a stash constraint. All twelve preview-fidelity checks pass after replacing the retired slider-diff assertions with the shared-overlay contract.

The broad browser sweep also includes the older `creator-touch.spec.js` tests. Both call `loadCreatorFixture`, which opens `/index.html` and waits for an `Open file` control that the current Home flow no longer exposes. That setup timeout was reproduced using committed baseline assets. It does not reach any touch gesture assertions. These legacy cases are reported separately from the passing current phone gesture tests (`creator-behaviour`, `creator-draw-navigate`, `creator-touch-magnifier` and `creator-touch-no-auto-paint`).

The stitched-edit regression was adjusted to allow a legitimate result of the logo fix: folding edge shades can join a whole marked region, so repainting may reset every marked stitch and hide the banner. The test still checks the saved reset and that Undo restores the stitches.


The initial full browser sweep ran **186 checks: 172 passed, 14 failed**. Eight failed executions were resolved by correcting the exact-mode stash fixture, replacing retired slider-diff assertions, choosing a genuinely noisy fixture for tidied-overlay checks, and allowing a fully reset stitched region. The corresponding final checks pass on rerun. The remaining **six executions cover three pre-existing cases** run in both projects: the two legacy touch cases above and the PDF naming prompt case. The PDF case expects a `Name this pattern` heading that does not appear; the same failure was also reproduced with committed baseline assets. No PDF export code was changed.

The full initial sweep and the final focused reruns are retained in [verification/](verification/). These baseline browser failures are not reported as green checks. A PR has not been opened.
