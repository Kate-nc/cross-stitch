# Ready to stitch review validation

The review uses the current chart, not the conversion thumbnail. It reuses the editor chart renderer, realistic full-cross renderer, confetti analyser and Threads shopping calculation. No replacement quality score is introduced.

## Scenarios

- Synthetic portrait: reuse `makePortrait` from `scripts/bug-hunt-usm.js`, upload through Home, generate through the existing converter, then compare original, chart and actual stitch simulation. Inspect an enlarged sample around facial detail.
- Pixel art: two-colour block edges, current chart and sample rendering.
- Low-colour design: two large colour regions; zero isolated crosses is not presented as evidence of visual fidelity.
- Sparse chart: 36 full crosses in 1,920 grid cells; empty fabric remains empty and full-grid dimensions remain explicit.
- Blends: distinct component colours in the simulation; constituent shopping rows and equal strand shares.
- No source image / manual chart: review and sample export remain available with an explicit absent-source message.

The browser tests choose columns 6–13 and rows 8–13, export the PNG, decode it and compare every chart pixel with the displayed 8 × 6 sample. Filename, dimensions and clamping at the final column are checked. Fabric changes between 14 count, 28 count over two, and 18 count verify effective sizing and current assumptions.

## Separate bug-hunting pass

- Manual erase and Undo change the full-cross and isolated-cross metrics immediately, without regeneration.
- Opening the existing cleanup controls never applies cleanup or changes saved cells. The links use the real names “Fix outline colours” and “Tidy stray stitches”. Conversion keeps the existing edited-chart confirmation.
- Clear the previous project's image during restoration; missing or corrupt sources stay absent, and an older decode cannot attach its image to a newer chart. A unit regression exercises late image completion.
- Cross-boundary backstitch segments are clipped to the sample rather than omitted. Export rendering excludes source overlays, highlights, edit ghosts and pending cleanup.
- Finished dimensions use effective fabric count and the exact inch/cm conversion. Summaries and Threads now share the two-strand, 20% waste shopping estimate; blends no longer count a full solid allocation for both components in the summary.
- The review simulation uses a stated two-strand assumption and hides the renderer's illustrative coverage percentage. Fabric-colour changes invalidate its rendering cache. Charts beyond the bounded full simulation show a message and retain sample inspection.
- Narrow 390 px and 320 px phone layouts contain enlarged sample canvases. Dark mode and keyboard tab navigation are checked.

## Checks

- `npm test` — 347 suites / 4,696 tests / 1 snapshot passed on the latest main; full Jest suite, including actual PDF worker/Pattern Keeper compatibility tests, OXS export checks, source restoration, metrics, material assumptions and generated bundle/service-worker checks.
- `PLAYWRIGHT_CHROMIUM_EXECUTABLE=/usr/bin/chromium E2E_LOCAL_CDN=1 npx playwright test tests/e2e/ready-review.spec.js --project=touch-tablet-chromium --workers=1` — all 8 tests pass: six scenarios plus two separate bug-hunting regressions. System Chromium and the repository's local CDN shim are used in this environment; video recording is disabled for this spec.
- `npm run lint:terminology` passes.
- `npm run lint:css-tokens` passes with the existing 13 advisory findings outside the new review rules.
- Creator/runtime bundles regenerated; `node build-sw.js --check` and `git diff --check` pass.

After the final blend-rendering fallback and non-life-size print wording were polished, 8 focused suites / 59 tests (including PDF compatibility and generated-file checks) and all 8 browser tests were rerun successfully.

## Limits made visible in the review

Screen thread colours are approximations, not physical calibration. The stitch simulation covers full crosses; the chart remains the reference for other objects. Existing material models may not account for every non-cross stitch, and unusual blend ratios need manual confirmation. Finished sizes include blank grid cells and exclude framing margins. Samples have printed coordinates, material assumptions and a full-cross symbol key; they are not guaranteed life-size prints or proof of whole-project fidelity.

## Representative screenshots

- [Portrait overview](portrait.png)
- [Portrait sample](portrait-sample.png)
- [Blend review](blends.png)
- [Blend sample](blends-sample.png)
- [Phone without a source image](no-source.png)
- [Phone sample](no-source-sample.png)
