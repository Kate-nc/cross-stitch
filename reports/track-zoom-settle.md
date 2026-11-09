# Track Mode: the paint when a zoom settles

**Date:** 2026-11-09 · **Base:** `main` at `08c78b4` (`1.0.243`)
**Scope:** the full chart-tile paint the Stitch Tracker (`stitch.html`) makes when a pinch or Ctrl + wheel zoom preview rebases or commits, what it costs by phase, which ways of reducing it were weighed, and what changed. Follows the zoom preview in [track-pan-performance-audit.md](track-pan-performance-audit.md) and the detail-tier work in [track-zoom-tier-transition.md](track-zoom-tier-transition.md).

## Summary

**When a zoom settles, the chart now paints what is on screen first and the stitches just off screen in the frames after.** The tile reaches 300 px past the view on every side so that a pan finds stitches already drawn, which on a phone is about three screens. All of it used to be painted in the task that ends the gesture. Now that task paints the view and 100 px around it (25-56% of the tile, measured), and up to four strips finish the tile, one per frame. Nothing unpainted is ever in view, and the finished canvas is pixel for pixel a fresh full paint.

Ten settles per case, each a zoom under the 1.6x rebase, medians (phone: Pixel 5 emulation, DPR 2.75, 4x CPU; software raster; **emulated, not a device**):

| Phone, 400 x 500 chart | Task ending the pinch, before | after | Worst frame around it, before | after | Long-frame time, before | after |
|---|---:|---:|---:|---:|---:|---:|
| Full stitches, 30% (6 px stitches) | 68 ms | **58 ms** | 233 ms | **150 ms** | 202 ms | **111 ms** |
| Full stitches, 100% (symbols) | 84 ms | **64 ms** | 167 ms | **117 ms** | 164 ms | **127 ms** |
| Mixed stitches, 30% | 111 ms | **74 ms** | 283 ms | **167 ms** | 258 ms | **149 ms** |
| Mixed stitches, 100% | 80 ms | **74 ms** | 183 ms | **133 ms** | 174 ms | **131 ms** |
| Work area, 30% | 57 ms | 56 ms | 150 ms | **100 ms** | 170 ms | **139 ms** |
| Work area, 100% | 71 ms | **62 ms** | 150 ms | **100 ms** | 140 ms | **96 ms** |
| Highlight, counting aids and Spotlight on, 30% | 76 ms | 70 ms | 233 ms | **167 ms** | 200 ms | **136 ms** |
| The same, 100% | 90 ms | **67 ms** | 183 ms | **133 ms** | 173 ms | **120 ms** |

The worst frame is the one the stitcher sees stall as the chart sharpens. It fell by 30-40% in every phone case, and the per-run spread barely overlaps (full stitches at 30%: 183-283 ms before, 117-200 ms after; mixed at 30%: 233-350 ms before, 133-217 ms after). Tasks over 50 ms in the second after a settle, the strips included, did not grow: none at 30%, and at 100% one that follows the zoom both before and after (96-112 ms before, 65-87 ms after). On desktop (1440 x 900, no throttle) the settle was already under 50 ms; its worst frame went from 17-67 ms to 17-33 ms (DPR 2: 67 to 33 ms and 50 to 33 ms).

Raw results: [zoom-settle-repeated-before.json](track-mode-baseline/zoom-settle-repeated-before.json) / [-after.json](track-mode-baseline/zoom-settle-repeated-after.json) (the table), [zoom-settle-before.json](track-mode-baseline/zoom-settle-before.json) / [-after.json](track-mode-baseline/zoom-settle-after.json) (paint breakdown and whole gestures). `npm run perf:zoom-settle` reruns them (`SETTLE_ONLY=1 SETTLES=10` for the table alone).

## Accounting for what had already shipped

- **The detail fade** ([track-zoom-tier-transition.md](track-zoom-tier-transition.md)) is gone: a zoom across a tier threshold is one paint, not 4-13. Confirmed here: every gesture's paints are its rebases and its commit, no repeats at one cell size.
- **The zoom preview** ([track-pan-performance-audit.md](track-pan-performance-audit.md), "Zoom preview") already turned ~40 repaints a pinch into one per rebase (at 1.6x, or when the scaled tile stops covering the view) and one at the end. This work is about those remaining paints.
- **Per-cell drawing** (same report, "Per-cell drawing cost"): backgrounds as one image, outlines as grid lines, symbols through `fillText`. A glyph atlas was measured slower than `fillText` then; not tried again (see below).

## Where a settling paint's time goes

`drawStitch` now times its own phases when a harness sets `window.__chartPaintPhases` (one property read a paint otherwise). Full repaints of the tile at a fixed zoom, medians of five, before the change. "Raster" is a 1-pixel `getImageData` straight after, which makes the canvas draw what was recorded.

| Case | Stitches in tile | Recording (all phases) | of which backgrounds | cell loop | symbols (`fillText`) | specialty objects | outlines + grid | Raster |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| Phone, full, 30% | 32 039 | 24 ms | 10 ms | 10 ms | – | 0 | 1.6 ms | **125 ms** |
| Phone, full, 100% | 2 989 | 20 ms | 1.4 ms | 15.5 ms | 11.3 ms | 0 | 0.1 ms | **68 ms** |
| Phone, mixed, 30% | 30 429 | 59 ms | 7.4 ms | 21 ms | – | 23.9 ms | 1.2 ms | **152 ms** |
| Phone, mixed, 100% | 2 842 | 32 ms | 1.5 ms | 22.6 ms | 14.7 ms | 6.1 ms | 0.4 ms | **87 ms** |
| Phone, highlight + aids, 100% | 2 744 | 45 ms | 1.2 ms | 39 ms | 21.4 ms | 0 | 0.6 ms | **83 ms** |
| Desktop DPR 1, full, 30% | 56 400 | 10 ms | 3.5 ms | 4.8 ms | – | 0 | 0.7 ms | 9 ms |
| Desktop DPR 1, mixed, 30% | 56 400 | 27 ms | 4.6 ms | 11.7 ms | – | 11.3 ms | 0.6 ms | 25 ms |
| Desktop DPR 2, full, 30% | 56 400 | 7 ms | 2.6 ms | 2.9 ms | – | 0 | 0.5 ms | 26 ms |

(Markers: the chart border, work-area fade and park markers, under 0.1 ms everywhere. Texture is off by default.)

- **On the phone profile the raster dominates**: 68-152 ms against 20-60 ms of script. Raster cost is set by how many device pixels are painted (4.1-4.6 million for a phone tile, which renders at 2x), not by what is in them. That is why painting less of the tile at the settle helps, and why making any one phase cheaper could not: the biggest script phase, symbols at 100%, is 11-21 ms.
- **Overlays** (the Highlight outline, counting aids, Spotlight) are separate canvases, redrawn whole when the tile changes, so at every commit. The breakdown's repaint keeps the tile and does not redraw them; their cost shows in the table above as the gap between "Highlight, counting aids and Spotlight on" and "Full stitches": 6-8 ms more on the commit task. Unchanged here.
- **Software raster.** The emulated phone draws canvases on the CPU and the 4x throttle slows that too. On a phone's GPU the raster share is likely smaller and the gain from painting less smaller with it. **Device hypothesis, untested.**

## What was weighed

| Option | Measured or reasoned | Taken? |
|---|---|---|
| **Paint the view first, the overscan after** | Settle paint covers 25-56% of the tile; worst frame -30 to -40% (table above) | **Yes**, for the final commit |
| ...also for rebases mid-gesture | A view-only rebase left a pinch that reverses (spread, then back) with less to scale into, so it rebased again sooner: an extra full paint, and its longest task went from 150-222 ms to 197-313 ms, worse in 5 of 6 phone cases; and the wheel's strips ran between wheel events | No: rebases paint the whole tile, as before |
| Smaller overscan for good | The overscan exists so a pan or fling finds stitches drawn; shrinking it moves the cost to every tile move during a pan | No: the overscan is the same size, just painted later |
| Drop symbols while zooming (detail reduction) | Symbols are 11-21 ms of recording at 4x in a 65-150 ms paint; the raster saving would be the glyph pixels only. A rebase's paint is shown, scaled, for the rest of the gesture, so dropping symbols there makes them blink out and back | No |
| Cache the cell-background image across zooms | It is one pixel per stitch whatever the zoom, so a cache would fit; but building it is 1-10 ms at 4x, a small share | No |
| Glyph atlas | Measured slower than `fillText` before ([track-pan-performance-audit.md](track-pan-performance-audit.md)); nothing here suggests otherwise | Not repeated |
| Render in a worker (`OffscreenCanvas`) | Would move raster and recording off the main thread, but the chart, its strips, the one-stitch repaints and every overlay share one canvas and one set of state; the simpler change met the target | Not attempted |

## What changed

All in [tracker-app.js](../tracker-app.js), "A zoom's settling paint: the view first, the overscan after".

- `commitZoomPreview` tells the paint it causes that it is a final commit (or a rebase). On a final commit `renderStitch` clears the canvas and paints only the view plus `CHART_PAN_LOOKAHEAD` (100 px) around it, through `drawStitch` clipped, the way a tile move paints its strips. The rest of the tile (left, right, above, below) is queued.
- The queued strips are painted one per frame, each after the frame before has been shown (`requestAnimationFrame` then `setTimeout`), and not while another zoom is being previewed.
- **Nothing unpainted can show.** A scroll that reaches past what is painted paints all remaining strips at once, before that frame (`renderStitchIfScrolledOut`); a tile move finishes them before copying (`shiftChartTile`); a new zoom preview counts only the painted part as covered, so it commits (rebases) before anything unpainted could be scaled into view. The unpainted part is cleared, so if anything ever did show it, it would be blank rather than the old zoom's stitches.
- **Nothing stale survives.** Any newer full paint discards the queue (a paint counter), and a strip whose tile has moved, been resized or released is dropped. The strips draw from the latest state (marks made meanwhile included).
- **Exact pixels.** A clip edge that crosses an anti-aliased shape (a symbol, bead, knot, petite or long stitch, backstitch, half or quarter stitch, park marker) rasterises a few levels off a full paint along it. Every part (the view and each strip) is therefore grown to stitch boundaries and past any object its edge would cut, using the same `objectDirtyBox` the one-stitch repaint uses. Parts may overlap; repainting a pixel already painted gives the same pixel. Where objects chain on too far to settle, the view-first paint is skipped and the whole tile is painted as before.
- **Tile moves get the same growth.** `shiftChartTile`'s strips had the same seams on mixed charts (a plain pan of the mixed fixture left 1 227 pixels off a fresh paint, up to 59 levels). They now go through the same `objectSafeRect`: 374 left, along tile rows unrelated to objects (see "Not covered").
- No new canvas or cache: canvas memory is unchanged (22 MB for a phone tile; 15.6 MB desktop DPR 1; 38.7 MB DPR 2).

## Tests

- [tests/mobile-audit/zoom-settle.spec.js](../tests/mobile-audit/zoom-settle.spec.js) (phone, 4x CPU): a pinch's settling paint covers under 60% of the tile and at most four strips follow; no transparent pixel in view one frame after the commit; the tile finished; the stitch under the fingers kept; after a 2x spread with a rebase, a pinch out, a reversal within a pinch, two pinches 40 ms apart, and a pan straight after a pinch, the settled canvas equals a fresh full paint (aligned in chart coordinates) and no frame of the pan shows unpainted canvas; the same in and out on a mixed-stitch chart, a work area and at 100% with symbols.
- [tests/mobile-audit/desktop-zoom-settle.spec.js](../tests/mobile-audit/desktop-zoom-settle.spec.js): Ctrl + wheel in, out and in again at DPR 1 and 2, full-cross and mixed: no blank after the commit, tile finished, exact; no blank while panning straight after.
- Existing specs updated where they counted paints: `panProbes` and `zoomTierProbes` count a settling paint (clipped, after a whole-canvas clear) as the full paint it stands for; the pinch and wheel tests in `pan-large.spec.js` and `desktop-pan-large.spec.js` assert at most six settling paints and at most four strips. `zoom-tier.spec.js` and `desktop-zoom-tier.spec.js` pass unchanged (every commit at its tier, no fade repaints, settled canvas exact).
- [tests/trackerPanRepaint.test.js](../tests/trackerPanRepaint.test.js) (Jest) checks the rules above in the source: final commit only, the queue dropped by every full paint, the scroll and tile-move paths finishing it, the preview counting only the painted part.
- Run: the 30 tests of `pan-large`, `zoom-tier`, `zoom-settle` and their desktop counterparts pass. Of the other Track specs run, 8 fail identically on `main` without this change (fixture uploads timing out in this sandbox, and `desktop-work-area`'s colour-list checks), so they say nothing about it either way.

## Not covered

- **Physical devices.** None used; all times are emulated with software raster. A device check: open a large chart with `?perf=1`, pinch in and out a few times at 30% and 100%, then pan straight away; the chart should never show a blank edge.
- **WebKit.** No WebKit build in the sandbox. The change uses `requestAnimationFrame`, `setTimeout` and canvas clipping, nothing engine-specific.
- **Tile-move seams that remain.** After a pan, a few hundred pixels can still differ from a fresh paint by a few levels: along the tile's last device rows at DPR 2 (129, was 176) and on some rows of the mixed fixture (374, was 1 227). They predate this change (a plain pan does it on `main`) and last until the next full paint.
- **Rebases mid-gesture** still paint the whole tile (see "What was weighed"), as do keyboard and button zoom steps (baseline finding 5).
