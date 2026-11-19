# November 2026 audit scripts

Measurements behind [reports/photo-conversion-audit-2026-11.md](../../../reports/photo-conversion-audit-2026-11.md).
They reuse `../harness.js` (the real `generate-worker.js` in a Node `vm`) and the ten
test photos from `../fetch-images.sh`. Run from the repository root after `npm ci`.

| Script | What it measures |
|---|---|
| `measure.js` | The current Photo default, each Detail and tidiness step, blends off, plain matching, and five palette seeds |
| `stages-and-sharpen.js` | Which stage costs accuracy (shading, Stitch Cleanup, the edge-shade fold), and Sharpen details |
| `blend-model-and-coverage.js` | Blend colours mixed in gamma against linear light; nearest-thread distance with the current and the pre-calibration catalogue |
| `catalogue-gaps.js` | How far photo colours are from any thread, with and without blends, and which colours are missing |
| `edge-fold-renders.js <outdir>` | Stitches the edge-shade fold changes on each photo, plus side-by-side renders |
| `saliency-coverage.js` | Saliency ("detail") map and edge-map coverage on photos |
| `crisp-edges.js <outdir>` | Prototype "dominant colour" shrink against the light average, plus renders |
| `spot-checks.js` | The second audit's three-photo spot checks, plus Balanced without the edge-shade fold |
| `background-fixtures.js` | Background removal: a pale stripe touching the border, one pixel at alpha 254, and alpha after shrinking |

`measure.js` and `stages-and-sharpen.js` take about 3 minutes each.
