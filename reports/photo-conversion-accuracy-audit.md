# Photo conversion changes: follow-up audit

22 October 2026. This audit checks the work in
[Kate-nc/cross-stitch#389](https://github.com/Kate-nc/cross-stitch/pull/389), which implements
[photo-conversion-accuracy-review.md](photo-conversion-accuracy-review.md), for anything
missed or made worse. Findings marked **Applied** are fixed in the same pull request.

## Summary

The first round fixed the Creator's Convert step but missed two other places that turn a
picture into stitches. It also introduced one regression and one slowdown:

- **Missed path (fixed):** importing a picture straight into the Stitch Tracker, and the
  experimental import wizard, still sampled the picture instead of averaging it. On a fine
  black and white checker this gave a stitch luminance of 132 instead of 188.
- **Regression (fixed):** without the edge-map padding, the Pixel art preset changed more
  deliberate pixels (25 per test sprite, against 18). Pixel art now starts with Stitch
  Cleanup off, so none change.
- **Slowdown (fixed):** brightness, contrast and saturation ran as a canvas filter over the
  full-size picture, about 230 ms on each slider move. They now run on the stitch-sized
  picture, with the averaged picture cached: 118 ms the first time and about 0 ms after.
- **Smaller issues (fixed):** very large uploads were sampled in one low-quality step, and
  the help still described the old Photo preset.
- **Not done:** six recommendations are left for a decision. See
  [Recommendations not applied](#recommendations-not-applied).

## How this was checked

- **Image paths:** searched every `drawImage` and image-to-pattern path (`parseImagePattern`,
  upload handling, gallery, Compare options, preview, Generate).
- **Old against new:** ran the old (`main`) and new worker side by side, using a `main`
  worktree, on drawn test graphics:
  - three 40 × 40 pixel-art sprites, with 1-pixel highlights and shadows, hand-dithered
    shading and single grass blades;
  - a 120 × 60 logo, with lettering, small text, three small dots and a 1-pixel grey rule.

  Each was scored by the stitches that differ from plain nearest-thread matching.
- **Real browser:** timed and verified `gridPixels` in Chromium on all ten test photos, and
  ran the real `generate-worker.js` there.
- **Text:** re-read the help drawer, wiki, Preferences and Sidebar text against the new
  behaviour.

## Findings

| # | Finding | Evidence | Status |
|---|---|---|---|
| 1 | Stitch Tracker image import and the import wizard (`parseImagePattern`, `import-formats.js`) shrank with one `drawImage`. It used nearest-neighbour up to 2:1 and default-quality bilinear beyond, so each stitch took the colour of whichever pixel it hit, in gamma space. | A 1-pixel black and white checker at 5 pixels per stitch imports as grey of luminance 132 on `main`. The light average is 188. | **Applied.** The oriented crop is drawn at its own size and averaged as light (`linearAreaDownscale`). Enlarging keeps crisp unsmoothed pixels. New test in `tests/imageImportWizardPipeline.test.js`; it fails on `main`. |
| 2 | Pixel art at its own size: confetti cleanup changes deliberate pixels. The old dilated edge map happened to shield most of them; the undilated one does not. | Stitches changed from plain matching, per sprite: `main` 18, branch 25. The edge-shade fold alone accounts for 18; Reduce confetti adds 7 (highlights and grass blades). | **Applied.** The Pixel art preset now turns Stitch Cleanup off (0 changed). Presets carry `cleanup: true/false` instead of `cleanupStrength`, which no longer did anything. Exact pixel-art import was already untouched. |
| 3 | Logos: does the undilated edge map hurt lettering? | 200 stitches changed against 170 on `main`. The render shows the extra 30 are the pale anti-aliased fringe around the large lettering. Dots, the 1-pixel rule and small text all survive. | No change needed: it is an improvement. |
| 4 | Speed regression from round one. `gridPixels` applied brightness, contrast and saturation with `ctx.filter` on the full-size picture, so every slider move re-read the whole photo. | Chromium, 2000 × 1333 photo: about 230–260 ms per call with an adjustment (the filter and read alone took 170–260 ms), against 41 ms for the averaging. | **Applied.** Adjustments run on the stitch-sized picture (`_applyImageFilters`, the CSS formulas, now clamping after each step as CSS does), so every browser gives the same result and the `ctx.filter` fallback is gone. The averaged picture is cached per image element and size: first call 118 ms, then about 0 ms. |
| 5 | Large uploads (over 2000 × 2000 or 5 MB) were shrunk to 2000 pixels with one default-quality `drawImage`. A 48-megapixel photo was sampled about one pixel in four along each side. | Code reading (`useProjectIO.js`). | **Applied.** Halving steps with high-quality smoothing, then the final size (`creatorShrinkUpload`). At 2000 pixels the remaining gamma averaging is far finer than a stitch. |
| 6 | The help drawer and wiki still described the Photo preset as "up to 20 threads … balanced cleanup". | Text search. | **Applied.** Both now say 24 threads and Stitch Cleanup, and that Pixel art keeps every pixel. |
| 7 | Dead code: a `useEffect` still saved the hidden Cleanup strength to Preferences on every change, and `_canvasFilterSupported` had no users left. | Code reading. | **Applied.** Both removed; the Preferences key stays so older backups restore. |

## Recommendations not applied

These need a decision about behaviour or design, not just a fix.

1. **The preview tidies large charts more than Generate does.** The preview is capped at
   200 × 200 stitches. Reduce confetti's patch sizes are counted in stitches, so for a bigger
   chart the preview merges patches that are relatively larger. Options: scale the level
   for the preview, or raise the cap where the device is fast enough.
2. **Some existing projects and Preferences behave differently.**
   - A project or draft saved with Stitch Cleanup on and Reduce confetti 0 used to be tidied
     at the hidden strength's size. It now gets no confetti removal when regenerated.
   - Preferences with Stitch Cleanup off but Reduce confetti above 0 used to still remove
     confetti; they no longer do.

   Both now behave as the controls say. The changelog explains the new controls, but not this
   case. A one-off migration (for example, set Reduce confetti to 2 when it is 0 with
   cleanup on) would keep old results, at the cost of overriding a value someone may have
   chosen.
3. **The Tracker's image import still has no cleanup.** It never got the automatic
   stray-colour fold, edge-shade fold or Reduce confetti that the Creator has, so its charts
   are noisier. Routing it through the same pipeline is the fix. It changes another tool's
   output, so it is left for a decision.
4. **Blends nearly double the chart symbols.** On the photos, 24 threads gave about 31
   symbols on average and 44 on the portrait. That is within the 112-symbol limit, but harder
   to read. Consider a symbol budget, for example dropping the least-used blends when symbols
   exceed about 1.5 × threads.
5. **The browser tests have not run anywhere.** CI runs only Jest, and the Playwright specs
   could not run in the sandbox because cdnjs was blocked. That includes
   `convert-preview-fidelity.spec.js`, whose filter test this pull request simplifies. Run
   `npm run test:e2e` locally before merging.
6. **Still open from the original report:** run *Soften* at source resolution, weight the
   palette towards small salient subjects such as faces, and recalibrate the saliency map.
   The post-generation **Reduce confetti** tool (More tools) uses separate algorithms and was
   not measured; the harness in `scripts/conversion-accuracy/` could be pointed at it.

## Verification after the fixes

- **Jest:** all suites pass except `tests/import/pdfScannedImport.test.js`. It fails
  identically on `main` here, because pdfjs-dist's nested `canvas` did not build in the
  sandbox. The generated bundles, service-worker fingerprints and terminology lint are clean.
- **Chromium:** `gridPixels` matches the reference light average exactly (maximum difference
  0) on all ten photos. Brightness raises the result, and pre-sharpen and enlarging work. The
  real worker runs with the new defaults.
- **Photo results:** the conversion pipeline itself is unchanged by this audit, so the
  report's figures stand (Option A: confetti 4.27%, stitch error 5.43).
