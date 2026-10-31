# Stitch Tracker panning lag on large patterns — audit

**Date:** 2026-10-31 · **Branch:** `claude/trusting-newton-duivcp`
**Scope:** why panning the chart in the Stitch Tracker (`stitch.html`) lags on
large patterns, what was fixed, and what is left. Follows
[track-view-performance-plan.md](track-view-performance-plan.md) and
[mobile-freeze-large-patterns.md](mobile-freeze-large-patterns.md), which made
taps cheap and the chart canvas viewport-sized but measured panning only on a
one-colour 200 × 250 chart with perfectly rigid two-finger gestures.

## Summary

Panning itself is native scrolling. The lag comes from what the tracker
**repaints** while you pan. Four causes were found and fixed, and a fifth bug
turned up while checking the fix:

| # | Cause | When it bites | Fixed by |
|---|---|---|---|
| 1 | A two-finger pan zoomed by a fraction of a percent on every move (the fingers never stay exactly the same distance apart). Each zoom re-rendered the whole tracker and, because `stitchZoom` was in `renderStitch`'s dependencies, repainted the whole chart tile. | Every two-finger pan, every frame | A 4% pinch dead band before zoom engages; `stitchZoom` removed from the redraw dependencies (drawing only uses `scs`) |
| 2 | The scroller's extent is a few px larger than the chart (ruler borders; 60 px on tablets for the controls strip). The tile is clamped to the chart, so at the right or bottom edge the "is the view still inside what was painted?" check could never pass. | Panning along the right or bottom edge, every frame | The check only counts the part of the view that is chart |
| 3 | Every tile move (each ~300 px of travel) repainted the whole tile from scratch: about 5 screens of cells on a phone, 2.4 on a desktop. | Every ~300 px of panning | `shiftChartTile`: copy the overlap to its new place on the same canvas and draw only the strip that comes into view |
| 4 | A tile that already held the whole chart still painted only the viewport plus a margin, and repainted as you scrolled out of that. | Patterns that fit in one tile | A full tile is painted whole, once |
| 5 | The detail tier was updated in an effect that runs after the redraw effect, so zooming across the Tier 3/4 boundary (cells of 26 px, where no fade animates) painted the previous tier and nothing repainted it. Previously hidden by #3, since the next tile move repainted everything. | Zooming in past 26 px cells | `drawStitch` works the tier out itself |

## How it was measured

A Playwright script (not committed; same approach as
[tests/mobile-audit/pan-cost.spec.js](../tests/mobile-audit/pan-cost.spec.js))
loads `trackerFixture` 400 × 500, 60 colours, 30% done, waits for the import
save to finish, then scrolls 24 px right and 12 px down per animation frame for
180 frames (about 1,440 px/s, a brisk drag). It records frame times, counts
canvas calls and samples a CPU profile. "Phone" is Pixel 5 emulation at 4×
CPU throttle (DPR 2.75, so the chart renders at 2×); "desktop" is 1440 × 900
at DPR 1. The two-finger run sends 6 gestures of 12 moves with the second
finger alternating ±1 px.

**Caveat.** The headless browser draws canvases on the CPU (SwiftShader). That
inflates anything a real device does on the GPU, chiefly the tile copy in fix
#3: a 1918 × 2396 self-copy costs ~100–130 ms per move under 4× throttle and
fits in one frame unthrottled. On a phone or tablet the 2D canvas is GPU-backed
and the copy is a texture copy of a few ms. So the phone rows below **understate
the improvement at normal zoom**. Nothing here has been run on a physical
device; see [Real-device check](#real-device-check).

## Results

**Desktop**, scroll, 180 frames:

| Zoom (cell) | Before: median / frames over 50 ms / fillRect | After |
|---|---|---|
| 20% (4 px) | 150 ms / **99** / 11 858 899 | 17 ms / **0** / 88 405 |
| 40% (8 px) | 50 ms / **47** / 3 047 991 | 17 ms / **0** / 83 620 |
| 100% (20 px) | 17 ms / 0 / 62 074 | 17 ms / 0 / 26 258 |

**Phone**, scroll, 180 frames:

| Zoom (cell) | Before: median / frames over 50 ms (typical) / fillRect | After |
|---|---|---|
| 30% (6 px) | **300 ms** / **99** (300–580 ms) / 3 152 572 | 17 ms / 13 (150–220 ms) / 103 694 |
| 60% (12 px) | 17 ms / 13 (170–280 ms) / 97 051 | 17 ms / 21 (150–220 ms) / 51 205 |
| 100% (20 px) | 17 ms / 13 (80–220 ms) / 35 318 | 17 ms / 18 (130–250 ms) / 23 192 |

The remaining phone long frames are the tile copy on the CPU canvas (see the
caveat); the JavaScript side of a move is now a few ms (17 copies took 3 ms of
`drawImage` script time in total). There are more moves after the fix because
the tile now moves on a little before the view reaches its edge
(`CHART_PAN_LOOKAHEAD`, 100 px), so a fast pan does not run into blank canvas.

**Phone**, two-finger pan, ±1 px finger drift, 100% zoom:

| | frames over 50 ms | worst frame | fillRect |
|---|---:|---:|---:|
| Before | **79** of 248 | 283 ms | 208 179 |
| After | **0** of 248 | 17 ms | 0 |

With perfectly rigid fingers (what `pan-cost.spec.js` sends) both versions
show 0, which is why the existing spec never caught it.

**Correctness.** A tile reached by shifting was compared pixel by pixel, in
chart coordinates, with a full paint of the same view, on the mixed fixture
(half stitches, backstitch, knots, beads, petites, long stitches), at 40%,
100% and 160% zoom, DPR 1, 2 and 1.5, along horizontal, vertical, diagonal and
reverse paths. Differences are confined to anti-aliasing on dashed backstitch
and glyph edges, of the same size as two ordinary full paints at different
tile positions differ by (up to ~2 000 px, max 26–62 levels), which the app
already shows today. The one larger difference found (a half stitch drawn at
the wrong tier) was bug #5, fixed.

## What changed

All in [tracker-app.js](../tracker-app.js):

- `renderStitchIfScrolledOut` clamps the view to the chart before checking it
  against the painted region, checks with a 100 px look-ahead, and tries
  `shiftChartTile()` before a full `renderStitch()`.
- `shiftChartTile()` copies the kept part of the tile with `drawImage` of the
  canvas onto itself (device pixels, no transform), moves the canvas, then
  paints the uncovered strips through `drawStitch` clipped to them, one cell
  wider on each side, the same way `repaintChartCells` already does for taps.
  Strips are worked out in device pixels so they meet the copy exactly at
  fractional scales. It returns false, leaving a full repaint, when anything
  drawn changed since the last full paint (`chartPaintedByRef`), the tile
  changed size or render scale, the move is larger than the tile, or the move
  is not a whole number of device pixels.
- `chartPaintedByRef` records which `renderStitch` last made the canvas match
  state; the redraw effect also sets it when a mark's own partial paint stood
  in for a full one.
- `renderStitch` paints the whole tile (including the rounded-up last device
  row and column), full or not.
- `stitchZoom` is out of `renderStitch`'s dependencies and the redraw effect's
  input list.
- `handleTouchMove` ignores pinch distance changes under
  `PINCH_ZOOM_DEADBAND` (4%) until the first time it is exceeded, then zooms
  from that point so it follows the fingers smoothly.
- `drawStitch` updates `tierRef` for the cell size it is drawing at.
- `stitch.html?tileshift=0` turns `shiftChartTile` off, for comparing on a
  device.

Structural guards: [tests/trackerPanRepaint.test.js](../tests/trackerPanRepaint.test.js)
(new `a tile move keeps what is already drawn` and `two-finger pans` blocks)
and [tests/trackerTapLatency.test.js](../tests/trackerTapLatency.test.js).

## Remaining costs and recommendations

Ordered by expected benefit for panning. None of these is done.

1. **Pinch zoom repaints the full tile on every cell-size step.** During a real
   pinch `scs` changes almost every frame, and each change re-renders
   `TrackerApp` and repaints the whole tile. Scale the existing canvas with a
   CSS transform during the gesture and repaint once when it ends (or when the
   scale drifts past, say, 1.5×). This is the next biggest source of jank on
   touch devices.
2. **Per-cell drawing cost.** Every cell is a `fillStyle` set, a `fillRect`,
   a `strokeRect` for its outline and, from Tier 3, a `font` set and a
   `fillText`. In the phone profile the three draw calls split the JS time
   roughly evenly. Options:
   - Stroke all cell outlines as one path per paint instead of a `strokeRect`
     per cell. Not pixel-identical: today each interior edge is stroked twice
     and half-covered by the next cell's fill, so the alpha needs retuning
     (about 0.15 single-stroked for today's 0.08 double) and a visual check.
   - Draw symbols from a small glyph atlas (one per font size, ink colour and
     symbol, rendered at the device scale) with `drawImage` instead of
     `fillText`. Glyph rasterisation is the most expensive per-cell operation.
   - Skip redundant `fillStyle` / `font` assignments when the value has not
     changed since the last cell.
3. **Overlays redraw the whole tile on every move.** `redrawChartOverlays()`
   runs on each tile move. Counting aids and the thread-usage overlay walk
   every cell in the tile; the outline-highlight ants rebuild their SVG path
   for the whole tile. Cheap when those modes are off; with them on, each move
   costs a full-tile pass. They could keep their pixels the same way the chart
   now does.
4. **A fixed grid of tile canvases** (as map apps do) would remove the copy
   entirely: each 512 px tile is painted once when it comes into view and the
   compositor moves it. Worth doing only if the real-device check shows the
   copy is slow somewhere. It touches hit-testing, overlays and the canvas
   budget.
5. **Mouse panning in Navigate mode re-renders `TrackerApp` twice per drag**
   (`setIsPanning(true/false)`, used only for the cursor). A ref plus a direct
   cursor style write would avoid both.
6. **Harness gaps.** `pan-cost.spec.js` uses a one-colour chart, rigid
   two-finger gestures and never reaches the chart's edge, which is how #1
   and #2 went unnoticed. It should add a jittered two-finger pan, a pan to
   the right and bottom edges, and the 400 × 500 multi-colour fixture.

## Real-device check

Outstanding, as for the earlier reports. On the largest real pattern
available, zoomed out and at normal zoom:

1. Open `stitch.html?perf=1`, pan for 10 s with one finger and 10 s with two,
   including along the right edge, and press **Copy**.
2. Repeat with `stitch.html?perf=1&tileshift=0` (old full repaint on each tile
   move; fixes #1, #2, #4 and #5 still apply).
3. Paste both into this report. If the first is not clearly better, fall back
   to recommendation 4.
