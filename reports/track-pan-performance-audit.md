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

1. ~~**Pinch zoom repaints the full tile on every cell-size step.**~~ **Done**,
   see [Follow-up: zoom preview](#follow-up-zoom-preview).
2. ~~**Per-cell drawing cost.**~~ **Done** for backgrounds and outlines, see
   [Follow-up: per-cell drawing cost](#follow-up-per-cell-drawing-cost). Symbol
   text (a `fillText` per cell) is what is left.
3. ~~**Overlays redraw the whole tile on every move.**~~ **Done** for the
   canvas overlays, see [Follow-up: overlays](#follow-up-overlays). The
   outline-highlight ants (SVG) still rebuild their path on each move.
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

## Follow-up: zoom preview

**Problem.** During a pinch the zoom changed on every touch move. Each change
re-rendered `TrackerApp`, and every time the cell size moved by a pixel it
repainted the whole tile: about 40 full repaints to pinch from 100% to 300%.
The anchor also lagged during the gesture, because the scroll was set in a
separate animation frame from the zoom. Ctrl/Cmd + wheel and trackpad pinches
(which arrive as wheel events) did the same per event.

**Change.** While zooming, the chart layer (`.tracker-chart-layer`: the canvas,
every overlay, the guide and hover lines) is moved and scaled with a CSS
transform, which the compositor applies with no repaint and no React render.
The zoom is committed once: when fewer than two fingers remain, the touch is
cancelled, a press arrives, or (wheel) 160 ms after the last event. The commit
renders synchronously (`ReactDOM.flushSync`), a layout effect puts the stitch
that was under the anchor back under it (worked out in cells, measured against
where the chart box is after the new render), the redraw effect paints, and the
transform comes off in the same task, so no intermediate frame shows. The
preview is committed early and begun again (a "rebase") when the scaled tile
would no longer cover the part of the view that shows chart, or at 1.6×, where
the stretched pixels get soft. A zoom change from anywhere else drops the
preview. The rulers and the detail tier update at the commit.

**Measured** (phone emulation, 4× CPU, 400 × 500 chart, one pinch of 30 moves
with the midpoint drifting 20 × 10 px):

| Gesture | Before: frames over 50 ms / worst / fillRect | After |
|---|---|---|
| Spread 120 → 300 px from 100% (to 238%) | 53 / 817 ms / 56 244 | 5 / 317 ms / 1 726 |
| Pinch 240 → 90 px from 100% (to 39%) | 30 / 1 600 ms / 219 347 | 4 / 1 500 ms / 60 698 |
| Pinch 240 → 90 px from 40% (to 16%) | 20 / 1 233 ms / 678 311 | 4–7 / 1 300–1 800 ms / 195 000 |

The stitch under the fingers stays put during and after the gesture (to
within a pixel at the final cell size); before, it wandered by up to 13 cells
mid-gesture. The remaining long frames are the rebases and the final commit,
each one full repaint; zooming out to 3–8 px cells means a tile of up to
~130 000 cells, which recommendation 2 (cheaper per-cell drawing) addresses.
Desktop Ctrl + wheel from 100% to 350% and back: 1 and 4 frames over 50 ms,
worst 150 ms. A two-finger pan that never pinches is unchanged (0 frames over
50 ms).

## Follow-up: per-cell drawing cost

**Problem.** Every cell in a tile cost a `fillStyle` and `fillRect` for its
background, a `strokeStyle` and `strokeRect` for its outline, and from Tier 3 a
`font` and `fillText` for its symbol: about 64 000 canvas calls for a desktop
tile at 75%, 170 000 at 30%. Switching each kind off in turn (phone emulation,
4x CPU) put the outlines at about a third of the drawing time zoomed out, the
backgrounds at most of the rest, and the text at most of it once symbols show.

**What changed** (in `drawStitch`):

- **Backgrounds as one image.** A full stitch's background is one flat colour
  in every view (Isolate's 25% fill becomes its colour over the fabric, worked
  out). The colours go into an `ImageData` with one pixel per cell, drawn once
  and scaled up with smoothing off; the loop skips those fills. Unstitched
  cells, Tier 1 cells with quarter stitches and the Tint overlay still draw
  themselves.
- **Outlines as grid lines.** The loop records each cell's outline style; after
  it, `drawOutlineGrid` draws one `fillRect` per run of one style along each
  grid line, so a tile costs about rows + columns calls. Per-cell strokes were
  half covered by the next cell's fill, leaving an edge two layers dark on one
  side and one on the other; a line is now one even layer of the same overall
  darkness (`OUTLINE_LINE`). Row mode (outlines under each row's tint) and
  Tier 1 keep the per-cell `strokeRect`.
- Every symbol goes through one `drawGlyph`.

**Tried and dropped.** Batching outlines into one path of small rectangles per
row and colour, reproducing the old strokes exactly region by region, made a
tile slower (desktop 30%: 121 to 317 ms): the rasteriser handles one path of
thousands of small rectangles worse than as many `strokeRect`s. A glyph atlas
(each symbol drawn once, copied with `drawImage`) was also slower than
`fillText`, which already draws from the browser's glyph cache, and skipping
unchanged `font` assignments drew symbols in the wrong font where a caller's
`restore()` had put the old one back.

**Measured** (one full-tile repaint, median of 20, 400 x 500 chart):

| | Desktop before | after | Phone 4x before | after |
|---|---:|---:|---:|---:|
| Symbol 30% | 121 ms | 51-68 ms | 649 ms | 416 ms |
| Symbol 75% | 85 ms | 62 ms | 275 ms | 287 ms |
| Symbol 160% | 42 ms | 39 ms | 175 ms | 206 ms |
| Colour 75% | 72 ms | 70 ms | 289 ms | 241 ms |
| Isolate 100% | 87 ms | 57 ms | 388 ms | 271 ms |

The phone figures vary by ±50 ms run to run, and on this harness a repaint
with every draw call switched off still takes ~190 ms (the jump and the
CPU-drawn canvas), so from 75% up the phone change is within the noise.
Canvas calls per desktop tile at 75%: ~64 000 before, ~28 000 after, nearly
all of them the symbols' `fillStyle`, `font` and `fillText`.

**Look.** Captured before and after in 48 cases (Symbol, Colour and the four
highlight styles; zoom 15% to 230%; DPR 1, 1.5 and 2) and compared pixel by
pixel: the mean difference is 0.3 to 2 levels out of 255. The largest are
single pixels where grid lines cross (up to 66 at 2x), where the old strokes
left a 4/3/2/1-layer gradient over the crossing's four pixels and the lines
now leave an even two. At DPR 1.5 zoomed far out the old per-cell fills left
faint pale seams between stitches (their edges fall on half pixels); the
image has none. Tile shifting still matches a full paint to within the usual
anti-aliasing noise.

## Follow-up: overlays

**Problem.** Every tile move called each overlay's draw for the whole tile:
the canvas overlays cleared and redrew everything, and the per-cell ones (the
thread-usage map, counting aids) walked every cell of the tile. Timed per
overlay over a 150-frame pan of a 400 x 500 chart at 100% (15 moves):

| Overlay | Desktop | Phone 4x |
|---|---:|---:|
| Thread usage | 274 ms | 617 ms |
| Ants (SVG path) | 25 ms | 103 ms |
| Counting aids | 12 ms | 85 ms |
| Recommendation boxes | 5 ms | 58 ms |

The thread-usage overlay cannot currently be turned on: `setThreadUsageMode`
has no caller left in the app. It is fixed anyway, since it is the overlay
the change helps most, but nobody hits it today.

**Change.** `registerChartOverlay` takes a third argument returning the
overlay's canvas. `shiftChartTile` now calls `shiftChartOverlays`, which for
each such overlay copies the overlap to its new place on the same canvas
(with `globalCompositeOperation = "copy"`: an overlay is translucent, and
drawing it over its own old pixels stacked them, turning the focus overlay's
94% dim into 99.6%), then for each uncovered strip clips to it, clears it and
calls the overlay's draw with the strip. Any draw is correct under the clip;
the thread-usage overlay and counting aids also use the strip to walk only
its cells (counting aids widened by 20 px, as a badge can reach past its
column). Focus dimming, breadcrumbs and the recommendation boxes draw as
before, clipped. An overlay whose canvas is not on the previous tile (resized,
released while the page was hidden) and the SVG ants are drawn whole, as
before.

**Measured** (same pan, overlay time inside tile moves):

| Overlay | Desktop before | after | Phone before | after |
|---|---:|---:|---:|---:|
| Thread usage | 274 ms | 59 ms | 617 ms | 253 ms |
| Counting aids | 12 ms | 8 ms | 85 ms | 44 ms |
| Recommendation boxes | 5 ms | 4.5 ms | 57 ms | 22 ms |

**Checked** by panning in four directions at 100% and 160% (desktop and phone)
with the thread-usage map, counting aids, focus dimming and the
recommendation boxes on, then comparing every overlay canvas with a full
redraw of the same view: thread usage, focus and recommendations identical;
counting aids within 20-116 pixels of anti-aliasing on badges and ticks, the
same as two full redraws at different tile positions differ (0-43 pixels,
measured with `?tileshift=0`). The ants still follow the tile.

**Not changed.** A highlight view on the phone emulation runs at ~50 ms a
frame even between moves; that is the compositor blending several
tile-sized overlay canvases on the CPU, which a real device does on its GPU.

## Real-device check

Outstanding, as for the earlier reports. On the largest real pattern
available, zoomed out and at normal zoom:

1. Open `stitch.html?perf=1`, pan for 10 s with one finger and 10 s with two,
   including along the right edge, pinch in and out a few times, and press
   **Copy**. While pinching, check that the stitch under your fingers stays
   there and that the chart comes back sharp when you lift them.
2. Repeat with `stitch.html?perf=1&tileshift=0` (old full repaint on each tile
   move; fixes #1, #2, #4 and #5 still apply).
3. Paste both into this report. If the first is not clearly better, fall back
   to recommendation 4.
