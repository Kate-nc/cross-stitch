# Conversion accuracy harness

Measurement scripts behind [reports/photo-conversion-accuracy-review.md](../../reports/photo-conversion-accuracy-review.md).
They load the real `generate-worker.js` pipeline into a Node `vm` context and
score its charts against each photo. Nothing here ships with the app.

```sh
sh scripts/conversion-accuracy/fetch-images.sh         # ten test photos into img/
npm rebuild canvas                                     # node-canvas native build, once
node scripts/conversion-accuracy/sweep-settings.js     # every Convert setting, one at a time (about 15 min)
node scripts/conversion-accuracy/linear-light.js       # linear-light downscale and dithering
node scripts/conversion-accuracy/cleanup-fixes.js      # why cleanup does nothing on photos, and fixes
node scripts/conversion-accuracy/proposed-defaults.js  # proposed default sets, plus side-by-side PNGs in render/
node scripts/conversion-accuracy/picture-type-guess.js # the "What kind of picture is this?" guess on PNG vs JPEG graphics
```

Run them from the repository root. `LONG=150` changes the grid's long side (default 100 stitches).

Metrics (all ΔE are CIEDE2000):
- **cellDE**: mean colour error per stitch against the light-correct average of the photo under that stitch.
- **viewDE**: the same after blurring both by one stitch, roughly how the chart reads from arm's length. Fair to shading.
- **edgeDE**: cellDE over stitches on strong boundaries only.
- **singles%**: confetti stitches (no same-colour neighbour), from the app's own `analyzeConfetti`.
- **conf%**: stitches in patches of 1 to 3.
- **comps/100**: separate same-colour patches per 100 stitches (lower is easier to stitch).
- **chg%**: share of neighbouring stitch pairs that change colour.
- **symbols / threads**: chart symbols (blends count once) and distinct threads to buy.
