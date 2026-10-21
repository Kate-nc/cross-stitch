# Cleanup 15: fractional-stitch render dispatch (F-010)

Base: `origin/main` at `96e58ec` (PRs 01-04 are merged ancestors). The audited lines (about 428-447 and 805-824) have moved; the finding is current: `drawPatternOnCanvas` and `drawPatternBaseOnCanvas` each carried an identical analyse-then-dispatch block for quarter, half and three-quarter stitches.

## What changed

`creator/canvasRenderer.js` gains a private `_drawPartialStitches(ctx2d, px, py, cSz, psEntry, m, cmap, dimAlpha, view)` and both pipelines call it. The base/full cell pipelines stay separate. `creator/bundle.js` and the `sw.js` fingerprints are regenerated. No other source, global, export, preference or format changes.

## State each caller keeps

| | `drawPatternOnCanvas` | `drawPatternBaseOnCanvas` |
| --- | --- | --- |
| Style tracking | none (every style is set directly) | `lastFill`, `lastStroke`, `lineOne`, `symFontSet` |
| After the fractional block | nothing | `stylesChanged()` (the helpers change fill, stroke, width, cap and font) |
| `psEntry` lookup and `if (psEntry)` guard | caller | caller |
| `px`, `py`, `dimAlpha`, banding limits | caller | caller |
| `save`/`restore`, clipping | none around the block | none around the block |

The helper owns only `analysePartialStitches`, the per-instruction symbol lookup and the type dispatch (draw order and arguments unchanged). It uses a plain loop where the old code allocated a `forEach` closure per fractional cell; there are no new per-stitch objects.

## Preservation evidence

- `tests/canvasRendererFractionalDispatch.test.js` (added first, passing on the unchanged base): 78 tests. The renderer runs on a recording proxy over a real node-canvas context; the expected operations come from calling the real `analysePartialStitches` and `draw*` helpers directly. Covers every quarter, half and three-quarter orientation, stitched and empty base cells, a colour missing from the colour map, both pipelines, three views, cell sizes 3/4/5/9/10/12 (each side of the grid, line and symbol thresholds), isolate-dimmed alpha, cropped viewports, draw order (each block directly after its cell's grid stroke), balanced `save`/`restore`, final `globalAlpha`, base-pipeline cache invalidation (exactly one extra fill, stroke and line-width write after a fractional cell) and no extra writes on the full pipeline, plus pixels.
- Mutation check: dropping `stylesChanged()`, passing `1` instead of `dimAlpha`, shifting the half-line (5) or half-symbol (10) thresholds, or changing the view argument each fail the test file.
- `differential.cjs`: 2,880 seeded configurations (3 pipelines including PatternCanvas-style banding, 3 views, 8 cell sizes including 7.5, DPR 1 and 2, 6 highlight modes, light and dark fabric, texture, overlay and cropped offsets) hashing every canvas call and property write plus the pixels. Base and head: 0 differences over 7,542,048 operations. Base against base is identical, so the harness is deterministic.
- `bench-browser.cjs` in Chromium 141: 192 pixel configurations per run (DPR 1 and 2, light and dark fabric), 0 differences in each of 4 runs.

## Performance and memory

Same container for every run (Linux x64, two CPU-equivalents, Node 22.22, Chromium 141 via the pre-installed binary because the lockfile's Playwright expects revision 1217). No target device or budget exists, so none is invented. Base and head alternate in ABBA order after discarded warmups; fresh processes repeat the measurement; a base-against-base control gives the noise floor.

**Allocation** (Node, large heap so no scavenge runs during a draw; Chromium sampling heap profiler including collected objects): reproducibly lower with head wherever fractional cells exist, and unchanged where there are none. Node 300x300 at 40% fractional: 168,878 to 166,513 KiB (full) and 141,962 to 139,652 KiB (base), about 1.4-1.6% (one closure per fractional cell). At 5%: about 0.5-1.8%. Chromium: 40% base pipeline 81,679 to 80,533 KiB (-1.4%), 40% full -1.0%, 5% base -1.0%; no-fractional rows move by 0.06-0.07%. Base-against-base moves by at most about 0.3% on the large charts with fractional cells; small charts and the 8 MiB no-fractional canvas row move by up to about 1.8%, so differences of that size on those rows are not evidence. Retained JS heap after forced GC and ten draws: 12.01 to 12.01 MiB (base) and 12.03 to 12.03 MiB (head), the same in all three A/B runs.

**Time** is inside the noise band. Node, three fresh A/B processes, head/base median ratio per process: 0.88-1.08 on every row with fractional cells except the 40x40 base pipeline on a real canvas (0.63-0.98, head faster). The A/A control spans 0.90-1.09, so none of these ratios separates the revisions. Chromium, three A/B processes: large charts 0.85-1.02, small charts noisy at 0.69-1.44 (draws of 9-19 ms); A/A 0.97-1.04. Raw samples are in `results/`; regenerate the tables with `summarise-bench.cjs`.

**One reading that was investigated.** The Node row "300x300, no fractional, base pipeline, no-op context" read 1.35-1.62x slower for head in all three first A/B processes. That row never calls the changed code (no partial stitches). Isolated, 60 rounds in each of three processes, both files read 57-64 ms and 8.9 MiB. With the file roles swapped, and on the stub-only sequence in both orders, the difference follows the slot the file is loaded into, not the file (the base file reads 1.05-1.21x slower in the second slot); one full sequence with swapped roles reads 60.4 ms (head) and 67.1 ms (base). The base file occasionally takes a ~40 ms mode in the first slot of multi-case sequences. I could not reproduce that outside those sequences and did not diagnose its cause (a JIT/heap-state effect is the likely suspect). The Chromium run of the same row reads 340-380 ms (head) against 370-447 ms (base). I treat it as a benchmark artefact, not a regression, with that limit.

## Limits

Not measured: a physical device, GPU-backed canvases, Safari/WebKit, long-session memory slope, true peak memory (only forced-GC retained heap and sampled allocation). The Tracker has its own use of `analysePartialStitches` in `tracker-app.js`; it is a different renderer and is not part of this change. Pixel equality is established for the matrix above, not for every possible state.

## Reproduce

```sh
git show origin/main:creator/canvasRenderer.js > /tmp/base-canvasRenderer.js
node reports/cleanup-15/differential.cjs /tmp/base-canvasRenderer.js /tmp/base.json
node reports/cleanup-15/differential.cjs creator/canvasRenderer.js /tmp/head.json
node reports/cleanup-15/compare-differential.cjs /tmp/base.json /tmp/head.json
node --expose-gc --min-semi-space-size=256 --max-semi-space-size=256 reports/cleanup-15/bench-node.cjs /tmp/base-canvasRenderer.js creator/canvasRenderer.js 40 8 /tmp/bench.json
node reports/cleanup-15/summarise-bench.cjs /tmp/bench.json
CHROMIUM_PATH=/opt/pw-browsers/chromium node reports/cleanup-15/bench-browser.cjs /tmp/base-canvasRenderer.js creator/canvasRenderer.js 12 /tmp/browser.json
```
