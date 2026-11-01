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
5. ~~**Mouse panning in Navigate mode re-renders `TrackerApp` twice per drag.**~~
   **Done**, see [Follow-up: mouse pans](#follow-up-mouse-pans).
6. ~~**Harness gaps.**~~ **Done**, see [Follow-up: pan specs](#follow-up-pan-specs).

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

## Follow-up: mouse pans

**Problem.** `isPanning` was React state, used only for the chart's cursor and
for the mouse-move handler's "am I panning?" check. Each mouse pan (a drag in
Navigate mode, the middle button, or Space + drag) set it at the start and
cleared it at the end: two full `TrackerApp` renders per drag. Measured on
desktop at 4x CPU, 5 drags on the 400 x 500 chart: 17 290 React elements
created in Navigate mode (~3 500 a drag), 12 490 for Space and middle-button
pans.

**Change.** `isPanningRef` replaces the state, and `setPanning` writes the
cursor to the scroller directly. The render still works out the resting
cursor (Mark, Navigate, Edit, Shift held) into `chartCursorRef`, and
`chartCursorNow` adds "grabbing" while panning and "grab" while Space is held.
Space down and up now also update the cursor directly; before, releasing Space
left the open hand showing until something else re-rendered the tracker.

**Measured** (same 5 drags): 0 React elements in all three kinds of pan.
Frames over 50 ms fell from 13-17 to 6-9, the rest being tile moves. The
cursor is "grabbing" during each pan, "grab" while Space is still held after
the button is released, and the mode's own cursor after that.

## Follow-up: pan specs

`pan-cost.spec.js` pans a one-colour 200 x 250 chart with two perfectly rigid
fingers and never reaches the chart's edge, which is how the two-finger jitter
and the edge repaint went unnoticed. Two new specs cover each fix in this
report on the 400 x 500, 60-colour fixture at 4x CPU, asserting on counted
work. Counters are in `tests/_helpers/panProbes.js`: `paints` counts
`drawStitch` calls (each starts with a fill of the whole chart rect),
`chartCopies` and `overlayCopies` count canvases drawn onto themselves (a tile
move that kept its pixels).

[pan-large.spec.js](../tests/mobile-audit/pan-large.spec.js) (phone project):

| Test | Old code (before this report) | Now | Asserts |
|---|---|---|---|
| Two-finger pan, fingers drifting ±1 px | 15 168 elements, 58 paints | 0, 4 | zoom unchanged, elements < 500, paints < 10 |
| 120 frames along the right edge at 40% | 120 paints | 6 | paints < frames / 4 |
| 150-frame diagonal pan at 75% | 0 tile moves kept their pixels | 16 kept, 32 paints | copies >= 5, paints <= 2 x copies + 3, no render |
| One pinch to ~240% | 56 paints, 32 200 elements | 2 paints | zoom x1.8, no transform left, stitch under the fingers within 1 cell, paints <= 6 |

[desktop-pan-large.spec.js](../tests/mobile-audit/desktop-pan-large.spec.js) (desktop project):

| Test | Old code | Now | Asserts |
|---|---|---|---|
| 3 mouse pans each: Navigate, middle button, Space | 12 210 / 8 778 / 8 784 elements; Space left the open hand showing after release | 0 each | 0 elements; cursor grabbing while dragging, grab while Space is held, the mode's cursor after |
| 25 Ctrl + wheel events, 100% to ~350% | 43 paints; the point under the pointer drifted 10 cells | 3 paints, within 1 px | zoom x2, no transform left, anchor within 1 cell, paints <= 6 |
| 150-frame pan with counting aids and focus dimming | 0 tile moves kept | 16 moves, 48 overlay copies | overlay copies >= tile moves x overlays |

Each test was run against the code before this report (all 9 fail, with the
figures above) and against this branch (all pass). The wheel anchor drift was
a bug nobody had measured; the transform preview fixed it.

`tests/_helpers/offlineCdn.js` lets these specs (and any that call it) run
without internet access: with `PW_OFFLINE_CDN=1` the cdnjs scripts are served
from `node_modules`, the same versions, so the pages' integrity hashes match.
Without the variable it does nothing.

## Follow-up: the "once-a-second" re-render, navigation saves and mixed charts

**The re-render was not a timer.** `desktop-hover-cost` and
`desktop-highlight-idle-cost` failed on `main` with ~1 470 elements per hover
sweep and ~590 elements/s while idle. The running clock is already an external
store (`elapsedStore`), so a tick re-renders only `LiveElapsed`. Recording
which React state setters fired during the idle window showed instead:

- the spec's click on a colour changed the saved working context, which
  scheduled a **full save of the project** 5 s later (1.4 s of main thread on
  desktop for the 400 x 500 chart);
- `beginSave` / `endSave` set the save badge's state, re-rendering all of
  `TrackerApp` twice, and the save's `cs:projectsChanged` made the header
  reload its project list;
- in the hover spec, the fixture's own first save (every opened project is
  saved in full ~5 s after it opens) landed inside the sweep. The badge reads
  "All changes saved" until that save starts, since it counts edits.

**Navigation no longer saves the project.** `stitchZoom` and the working
context (`focusColour`, `stitchMode`, `stitchView`, `highlightMode`) are out
of the autosave's dependencies. A change to them, or a scroll, writes a small
per-project navigation record to `localStorage` a second after it settles
(`writeNavRecord`, key `cs_nav_<id>`: zoom, scroll in chart pixels, working
context, time). Loading applies the record when it is newer than the project's
`updatedAt` (`navRecordFor`), so a reload comes back to the same zoom, place
and colour; a later save, from this device or another, wins. The project
still carries these fields from its next full save, which leaving the page
always makes, so sync is unchanged. The guide crosshair (`hlRow`/`hlCol`) is
still saved with the project, as before.

The two specs now wait for the fixture's first save (`waitForSaved` in
`tests/_helpers/perfProbes.js`) before measuring, and both pass: 0 elements
for the hover sweep, 0 per second idle in outline and isolate. One run in five
saw a single stray render in the outline case that did not reproduce in four
more runs or in a probe; most likely a late asynchronous result.

**Mixed-stitch charts drew every object on every paint.**
`ProgressUnits.specialty.draw` stroked every petite and long stitch in the
pattern for each `drawStitch` call, clipped away outside the painted cells;
with strip paints and one-stitch repaints that is several times per pan step
or tap. It now takes the painted cells as `bounds` and skips objects outside
them (the Creator's calls pass none and are unchanged), and keeps the done
marks as a `Set` per array instead of building one per paint. Beads are no
longer copied and sorted per paint (`beadDrawOrder`, `beadsDoneSet` are
memoised). Backstitch and knots already skipped out-of-range objects before
drawing.

| Mixed 400 x 500 chart, one full tile | Strokes before | after | Desktop | Phone 4x |
|---|---:|---:|---:|---:|
| 40% zoom | 15 347 | 2 342 | 109 -> 93 ms | 450 -> 377 ms |
| 100% zoom | 7 537 | 475 | 79 -> 59 ms | 350 -> 249 ms |

The 16 desktop view/zoom captures of the mixed fixture are pixel-identical
before and after, and tile shifting matches a full paint as before.

**New specs** (both fail on the commit before these changes and pass now):
`pan-large.spec.js` "panning a mixed-stitch chart strokes only the objects in
view" (7 299 strokes per paint before, 65 now) and
`desktop-pan-large.spec.js` "zooming and picking a colour do not save the
project, and come back after a reload" (1 save before, 0 now).

**Still open, found here.** Opening a project always schedules a full save
~5 s later, even when nothing changed (the autosave treats its first run as a
change). On a large chart that is seconds of main thread on a phone soon after
every open. It is left alone here because loading may rely on that save to
store what it migrates; skipping it safely needs a check of what loading
changes.

## Follow-up: two gaps in the navigation record (PR review audit)

An audit of PR #406 at `4851cbc` found two persistence regressions in the
navigation record, both confirmed and fixed:

1. **A queued full save stored stale navigation.** The autosave timer called
   the `buildSnapshot` of the render that queued it. Navigation is no longer an
   autosave dependency, so a zoom or colour change made while a save was queued
   did not replace the timer, and the save stored the old zoom and working
   context with a newer `updatedAt` than the navigation record, which then lost
   on load. The timer now builds from `buildSnapshotRef.current` (the latest
   render). Reproduced in the browser: open a project, zoom to 160% and pick a
   colour before its first save runs, reload: it came back at 100% with no
   colour. Now it comes back as left.
2. **Pending navigation was not written when the page was hidden.** The record
   was written only by its one-second timer, which a suspended page may never
   run, and the tab-hidden handler returned early because navigation does not
   change the full save's generation. `flushNavRecord` now writes a pending
   record synchronously when the page is hidden (before that check), before a
   different project replaces this one (while the record still belongs to the
   outgoing project's id), and when the Tracker unmounts (keeping the last
   scroll if the scroller is already gone). Reproduced by zooming, stopping all
   timers and hiding the page: no record was written; now it is, with no full
   save.

Guards: `desktop-pan-large.spec.js` "navigation changed while a full save is
queued is what that save stores" and "hiding the page writes navigation still
waiting for its second, without a full save" (both fail on `4851cbc`, pass
now); `workingContext.test.js` checks the timer's builder, the flush before
the generation check, the flush before the project id changes, and the
unmount flush.

## Cross-check: another agent's analysis

An independent analysis of `main` listed five causes. Where each stands on
this branch:

| # | Finding | Status |
|---|---|---|
| 1 | Right-edge panning defeats the repaint cache (80 redraws in 80 steps) | Fixed (first follow-up): the check covers only the chart. `pan-large.spec.js` "right edge" guards it |
| 2 | Finger-spacing noise triggers zoom updates (94 redraws) | Fixed: 4% dead band, the latest pan step only per frame, `stitchZoom` not a redraw input, the anchor kept. Guarded by "two-finger pan with finger drift" |
| 3 | Mixed-stitch charts draw offscreen objects; beads copied and sorted per paint | Fixed in this follow-up: bounds culling for petites and long stitches, cached done sets, memoised bead order. No separate spatial index: the per-object bounds test is a few comparisons, and a full-list walk of the comparisons costs well under a millisecond on these fixtures |
| 4 | Tile replacements redraw the whole tile and overlays | Fixed: `shiftChartTile` and `shiftChartOverlays` keep the overlap and draw the uncovered strip; the tile moves on 100 px before the view reaches its edge |
| 5 | Zoom-only changes trigger heavyweight saves | Fixed for zoom and the working context (navigation record). Not done: lighter conflict-metadata reads and caching material requirements by chart revision, which make every save cheaper; the save on open noted above |

Its last recommendation, validating on iPad (WebKit) and Android, is the
real-device check below; this sandbox has neither.

## Follow-up: panning and marking (the progress write)

Reported after the fixes above: on a large chart the tracker froze often when
going back and forth between panning and marking. Measured with a pan of six
gestures, each followed by five taps, on the 400 x 500 fixture (30% done,
about 60 000 finished stitches) at 4x CPU on a Pixel 5 profile:

| | progress write | worst frame | long tasks |
|---|---|---|---|
| `main` before PR 406 | 410-1070 ms each | ~750 ms | ~4.5 s |
| PR 406 | 480-870 ms each | 680-820 ms | ~5.4 s |
| this follow-up | 17-80 ms each | 280-330 ms | 1.0-1.7 s |

The freezes were not the pan: in both builds they were the progress write
(`ProjectStorage.saveProgress`), throttled to start ~0.4 s after the first
mark and at most every 3 s on a large chart, so it usually landed just as the
next pan began. Its record carried `trackingSync` for the whole chart, one
register per finished stitch, and every write read it back (structured-clone
decode, ~380 ms), rebuilt it (`TrackingSync.record`, ~170 ms), sorted it
(`metadata`, ~120 ms) and wrote it again (~290 ms), however few marks had
changed. The cost grows with how much of the chart is done. PR 406 removed
the pan lag that hid it; a two-finger pan with finger drift no longer stalls
for seconds (max frame 5.6 s before).

Fix: the record keeps only the registers that differ from the full save it is
based on (`trackingSyncDelta`, from `TrackingSync.recordDelta`): the marks
changed since that save, typically a few hundred. Readers rebuild the whole
`trackingSync` from the base project and the delta (`TrackingSync.withDelta`
in `applyProgressRecord`), so loading, full saves, backups and sync see what
the full record held. A full record from an older build is cut down to a
delta by the next write (`TrackingSync.deltaFrom`); an older build reading a
delta record falls back to its legacy path, which rebuilds registers from the
marks, so no marks are lost either way. The write path no longer calls
`TrackingSync.record`, and the reuse of the previous write's registers
(`lastProgressPut`, `writeId`) is gone. With writes this cheap,
`PROGRESS_GAP_LARGE_MS` is 1 s instead of 3 s.

The frames still over 200 ms in that run are tile moves during the pan:
~25 ms of script, then canvas raster in headless Chromium's software GPU, as
noted earlier; the old full repaint cost the same there.

Tests: `tests/progressDelta.test.js` holds the rebuilt metadata to the full
record's (as `records()` reads it back) over random chains with malformed and
legacy metadata, the older-build upgrade, and a 200 000-cell chart whose delta
stays at the changed marks. `tests/progressRecordDelta.test.js` (was
`progressSyncReuse.test.js`) checks the stored record through ProjectStorage:
only changed marks stored, no full `TrackingSync.record` on the write path,
another page's write kept, a new base after a full save, and an older build's
full record cut down.

Not changed: the full save on large charts still rebuilds metadata for the
whole chart, but runs only after a minute's pause in marking (at most five
minutes) or when anything else changes.

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
