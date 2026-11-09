# Track Mode: detail changes while zooming

**Date:** 2026-11-09 · **Base:** `main` at `76985d7` (`1.0.241`)
**Scope:** what the Stitch Tracker (`stitch.html`) paints when a zoom crosses a
detail-tier threshold, and what changed. Follows finding 5 of
[track-mode-performance-baseline.md](track-mode-performance-baseline.md)
("extra full repaints from the tier fade animation") and the zoom work in
[track-pan-performance-audit.md](track-pan-performance-audit.md).

## Summary

**Each zoom that crosses a detail threshold now paints the chart once. Before,
it painted it 4 to 13 times.** The tracker shows more detail as stitches get
bigger:

| Tier | Cell size (zoom) | Adds |
|---|---|---|
| 1 | under 5 px | flat colour |
| 2 | from 5 px (25%) | half stitches, backstitch |
| 3 | from 13 px (65%) | symbols |
| 4 | from 26 px (130%) | more |

Hysteresis applies: a tier goes only below a lower size (Tier 3 below 10 px, Tier 2 below 3 px).

Crossing into or out of Tiers 2 and 3 started a `requestAnimationFrame` loop
(`tierFadeRef`). It faded the new detail in over 200 ms, or the old detail out
over 150 ms, by calling `renderStitch`, a full repaint of the chart tile, on
every frame. That came on top of the zoom's own repaint. Each of those paints
showed a half-faded state, so a chart could be seen at Tier 2 with symbols
half drawn.

The fade is gone. `drawStitch` draws symbols at full strength from Tier 3 and
none below it, and draws half stitches and backstitch from Tier 2. Those
values come from the tier it works out for the cell size it is drawing at, so
the zoom's single paint is the final picture.

| Desktop, no throttle (counts are exact; times emulated) | Before | After |
|---|---:|---:|
| Full paints, 27 key steps 20% → 140% → 10% → 30% | 55 | **27** |
| Full paints on the 6 of those steps that cross a tier | 34 | **6** |
| Full paints, 7 zoom-button presses alternating 40% / 65% | 37 | **7** |
| Repaints at an unchanged cell size (fade frames), all desktop tests | 114 | **0** |
| Paints showing another tier's detail, all tests | 86 | **0** |
| Frames over 50 ms on crossing steps, desktop tests | 40 | **6** |

On the phone profile (Pixel 5 emulation, 4× CPU) a crossing pinch went from
3–6 full paints to 1–2 (a preview rebase, then the commit). Its worst frame
went from 383–700 ms to 217–300 ms; the remainder is the zoom's own repaint.
A button press across a threshold went from 3 paints to 1, worst frame 433–767 ms to 217–400 ms.

The baseline harness's own zoom scenario (`ONLY=zoom-large`: 16 key presses,
20% to 100% and back, phone profile) reproduces the figure behind baseline
finding 5. Before this change it made **20 full paints for 16 steps**; now it
makes **16**. The other figures from that run:

| Figure | Before | After |
|---|---:|---:|
| Slowest step | 744 ms | 504 ms |
| Longest task | 462 ms | 295 ms |
| Long frames: script | 2,230 ms | 1,669 ms |
| Long frames: rendering | 544 ms | 181 ms |

Each build ran once, so these times are indicative only. The raw results are in
[zoom-tier-baseline-harness-before.json](track-mode-baseline/zoom-tier-baseline-harness-before.json)
and [-after.json](track-mode-baseline/zoom-tier-baseline-harness-after.json).
Both files record commit `76985d7` as dirty, because both runs were made from
this branch's working tree. For the "before" run, `main`'s compiled tracker was
put back in place first.

The settled chart is pixel-identical to a fresh paint of the same view in
every test, before and after. The stitch under the fingers stays put through a
crossing pinch.

## What was measured

Two new Playwright specs drive the real app on the 400 × 500, 60-colour
fixture (`fixtureFor('large')`, 30% done) and its mixed-stitch twin (half
stitches, backstitch, knots, beads, petites, long stitches). Each step is
followed by a pause of 0.9 s on desktop and 1.5 s on the phone, long enough for
the old fade to finish:

- [tests/mobile-audit/desktop-zoom-tier.spec.js](../tests/mobile-audit/desktop-zoom-tier.spec.js),
  desktop 1440 × 900, no throttle:
  - keyboard: every threshold, both ways;
  - zoom buttons;
  - Ctrl + wheel, including zooming in and back out before the preview commits;
  - seven button presses 30 ms apart, each landing inside the last one's fade;
  - the mixed chart across the Tier 1/2 threshold (half stitches and backstitch) and Tier 2/3.
- [tests/mobile-audit/zoom-tier.spec.js](../tests/mobile-audit/zoom-tier.spec.js),
  Pixel 5 emulation, 4× CPU:
  - pinch out and in across the symbol threshold, with the stitch under the fingers checked;
  - out and back within one gesture;
  - a gesture ended by `touchcancel`;
  - the zoom buttons.

Counters are in [tests/_helpers/zoomTierProbes.js](../tests/_helpers/zoomTierProbes.js).
Every value below is per step, from an init script installed before the app loads:

- **Full paints.** `drawStitch`'s opening whole-chart fill on the chart canvas
  with no clip active. Strip and one-stitch repaints are not counted.
- **Repeats.** A paint at the same cell size as the paint before it in the same step.
  The zoom did not change between them, so the only cause was a fade frame.
- **Tier.** The tier each paint should have used, from `computeDetailTier`
  (lifted from `tracker-app.js`) walked over every paint since the page opened.
- **Another tier's detail.** In Symbol view, a Tier 3+ paint that drew no
  symbols or drew them below full strength, or a Tier 1-2 paint that drew any.
- **Strokes.** Lines drawn per paint. Only paints at the same zoom are
  compared, because totals depend mostly on how much chart is in view. At 20%,
  Tier 1 draws 7,483 strokes against 8,717 at Tier 2: backstitch is not drawn
  in Tier 1. At 50% and 60%, Tier 3 draws more than Tier 2 (half-stitch
  diagonals). At 40%, Tier 2 twice gives 2,351 both times.
- **Frames.** `requestAnimationFrame` gaps, and Long Animation Frames split
  into script time and time after `renderStart` (style, layout, paint).
- **Final picture.** After the last step, the chart canvas's pixels are compared
  with a fresh full paint of the same view. The fresh paint comes from the
  page's own return-from-hidden repaint.

Both builds were run with identical specs; for "before", the committed
`compiled/tracker-app.compiled.js` from `main` was put back for the run. Raw rows:
[zoom-tier-before.json](track-mode-baseline/zoom-tier-before.json),
[zoom-tier-after.json](track-mode-baseline/zoom-tier-after.json). All 7 tests
fail before and pass after.

**Caveat.** Headless Chromium draws canvases in software (SwiftShader), and the
phone rows add a 4× CPU throttle. Paint counts, repeats and the tier checks
are exact on any machine. Frame times are emulated, so read them as relative
sizes. None of this ran on a physical device.

## Results

Per test, totals over all steps (before / after):

| Test | Steps | Full paints | Repeats at same size | Paints with another tier's detail | Frames > 50 ms | Worst frame | Long-frame time |
|---|---:|---:|---:|---:|---:|---:|---:|
| Keyboard, all tiers (desktop) | 27 | 55 / 27 | 28 / 0 | 8 / 0 | 7 / 2 | 167 / 67 ms | 304 / 111 ms |
| Zoom buttons (desktop) | 5 | 18 / 5 | 13 / 0 | 10 / 0 | 9 / 2 | 233 / 83 ms | 477 / 220 ms |
| Ctrl + wheel (desktop) | 3 | 28 / 9 | 19 / 0 | 15 / 0 | 7 / 1 | 250 / 67 ms | 975 / 304 ms |
| Rapid flips, then buttons (desktop) | 5 | 50 / 11 | 39 / 0 | 33 / 0 | 13 / 1 | 200 / 67 ms | 1,348 / 426 ms |
| Mixed-stitch chart (desktop) | 11 | 26 / 11 | 15 / 0 | 5 / 0 | 11 / 8 | 283 / 183 ms | 525 / 183 ms |
| Pinch (phone, 4×) | 4 | 17 / 7 | 10 / 0 | 10 / 0 | 14 / 9 | 700 / 300 ms | 2,399 / 1,492 ms |
| Zoom buttons (phone, 4×) | 5 | 11 / 5 | 6 / 0 | 5 / 0 | 9 / 8 | 767 / 400 ms | 2,101 / 1,647 ms |

Only the steps that change tier (before / after):

| Test | Crossings | Full paints | Frames > 50 ms | Worst frame | Long frames: script + render |
|---|---:|---:|---:|---:|---:|
| Keyboard, all tiers | 6 | 34 / 6 | 4 / 0 | 167 / 50 ms | 174 + 124 / 0 + 0 ms |
| Zoom buttons | 3 | 16 / 3 | 9 / 1 | 233 / 83 ms | 427 + 286 / 97 + 2 ms |
| Ctrl + wheel | 3 | 28 / 9 | 7 / 1 | 250 / 67 ms | 875 + 502 / 217 + 11 ms |
| Rapid flips | 3 | 48 / 9 | 13 / 0 | 200 / 50 ms | 1,165 + 757 / 174 + 4 ms |
| Mixed-stitch chart | 4 | 19 / 4 | 7 / 4 | 283 / 183 ms | 305 + 217 / 0 + 0 ms |
| Pinch (phone) | 4 | 17 / 7 | 14 / 9 | 700 / 300 ms | 1,680 + 746 / 784 + 59 ms |
| Zoom buttons (phone) | 3 | 9 / 3 | 7 / 6 | 767 / 400 ms | 1,058 + 569 / 477 + 17 ms |

Reading these:

- **How many fade frames ran depended on how fast a paint was.** Unthrottled,
  the fade got 5–12 frames in. At 4× it got 1–2, because each repaint took
  longer than the fade itself. A faster device paints more often, so it would
  have repainted more times, not fewer.
- **Some fades changed nothing on screen.** Zooming out to 10% faded
  backstitch out over 7 extra paints on a chart with no backstitch. Zooming in
  to 30% faded it back in over 12. Below 7 px symbols are never drawn, so a
  symbol fade at those sizes repainted identical pixels.
- **"Render" time fell more than script time.** Each fade frame was a full
  canvas raster and composite (in software here). After the change, the
  render side of crossing steps is close to zero. The phone's remaining long
  frames are the zoom's own single repaint, mostly script in `drawStitch`
  (symbol `fillText`).
- **Rapid direction changes** used to restart the fade from wherever it was,
  so seven presses 30 ms apart produced 37 paints, 26 of them half-faded. Now
  it is one paint per press, each at its own tier. The last one is at Tier 3
  with symbols at full strength.

## Choosing the fix

The brief offered three options:

- a single detail transition;
- a fade on a separate layer, animated by the compositor;
- another measured approach.

The single transition was chosen; the other two were weighed against measured
paint costs and the canvas budget.

**Separate layer, cross-faded by the compositor.** The chart canvas would show
the new tier. A second, tile-sized canvas on top would hold the old tier, at
the new size, and fade out with a CSS opacity animation. The two pictures
blend linearly, so this looks the same as the old per-frame `globalAlpha`
fade. It was not taken, for two reasons:

1. **It would make the crossing step slower to appear.** The old-tier layer is
   a second full paint at the new size. It has to be ready in the same task as
   the zoom's own paint, or one frame shows the new detail before the fade
   starts. So the frame the user waits for after a crossing zoom would cost two
   full paints instead of one: 2 × 230 ms at 4× for a step whose own paint
   already dominates (baseline finding 5).
2. **There is no room for it in the iOS canvas budget.** The layer must be
   rastered at the chart's render scale, or it would look soft for its first
   frames. Using the app's own `chartRenderScale` and `canvasSizeLimits`
   (`useCanvasOverlays.js`), with a tile of the scroller plus 300 px overscan:

   | Device (emulated budget arm) | Budget | Chart tile (scale) | Projected now (chart + 5 overlays) | Headroom | Fade layer |
   |---|---:|---:|---:|---:|---:|
   | iPad, DPR 2 (iOS) | 16.8 Mpx | 4.25 Mpx (1.5×) | 13.71 Mpx | 3.07 Mpx | **4.25 Mpx, does not fit** |
   | iPhone-class, DPR 3 (iOS) | 16.8 Mpx | 4.69 Mpx (2×) | 10.55 Mpx | 6.23 Mpx | 4.69 Mpx (17.9 MB) |
   | Pixel 5, DPR 2.75 (Android) | 33.6 Mpx | 4.57 Mpx (2×) | 10.28 Mpx | 23.27 Mpx | 4.57 Mpx (17.4 MB) |
   | Galaxy Tab S9, DPR 2.25 (Android) | 33.6 Mpx | 8.54 Mpx (2×) | 19.21 Mpx | 14.34 Mpx | 8.54 Mpx (32.6 MB) |

   On the iPad, the device the canvas budget exists for, the layer would push
   the page past Safari's ceiling. The Pixel 5 tile matches what the spec
   measured (1918 × 2382 device px at 2×). Fitting it there would mean
   dropping the chart to 1× during a fade, a visible blur, or a fade only on
   some devices: two code paths for a 200 ms effect.

**Single transition.** The detail switches in the zoom's own paint: 0 extra
paints and 0 extra memory. It is also the only option where the answer to
"which tier is on screen?" never depends on timing. There is no animation
left, so reduced-motion preferences need no separate handling. The visible
difference is that symbols appear and go at once instead of over a fifth of a
second, as Tier 4 detail already did.

## What changed

[tracker-app.js](../tracker-app.js):

- `tierFadeRef`, and the effect that animated it on every `scs` or
  `lockDetailLevel` change, are removed.
- In `drawStitch`, `symAlpha` is `tier>=3?1:0` and `bsHsAlpha` is
  `tier>=2?1:0`. The tier is still worked out at the top of `drawStitch` for
  the cell size it is drawing at. That already happens for every paint (full,
  strip after a tile move, or one stitch), so it applies to each. Lock detail
  level still forces Tier 3 with both at full strength. It also sets the
  remembered tier to 3, which the removed effect used to do: unlocking at a
  size between the thresholds (say 60%) then keeps symbols, as before, rather
  than falling back to the tier from before the lock (review on the PR).
- `renderStitchRef` stays: the return from a hidden tab uses it.

Also: `compiled/tracker-app.compiled.js` (rebuilt), `sw.js` (fingerprints),
[help-drawer.js](../help-drawer.js) (Finished stitches says at which zooms each
kind of detail appears, and that it switches with the zoom),
[changelog.js](../changelog.js).

**Unchanged:**

- the tier thresholds and hysteresis;
- pinch and wheel previews, rebases and anchoring;
- tile shifting;
- partial repaints for marks;
- anything to do with progress, undo, sessions, saves, sync or imports. The
  change touches drawing only: no state, storage or worker code.

## Regression coverage

- [tests/trackerZoomTierTransition.test.js](../tests/trackerZoomTierTransition.test.js)
  (Jest, runs in `npm test`) lifts the tier block out of `drawStitch` and
  replays zoom sequences through it. It checks:
  - every threshold, both ways, the button steps and rapid flips;
  - opacities are 0 or 1 by tier;
  - a second paint at the same size is identical;
  - hysteresis holds;
  - Lock detail level shows everything.

  It also checks that no fade state or animation loop reaches `renderStitch`.
  Five of its seven tests fail against `main`. The other two guard behaviour
  that did not change.
- The two Playwright specs above assert, per step:
  - exact full-paint counts for key and button steps;
  - no repeats;
  - no paint with another tier's detail;
  - the tiers crossed;
  - the stroke comparison on the mixed chart;
  - the settled chart equal to a fresh paint;
  - the pinch anchor within a cell, with no transform left behind.

Existing specs re-run on this branch:

- `pan-large.spec.js` (phone pinch, edge pan, tile moves, mixed pan): 5 passed.
- `desktop-pan-large.spec.js` and `desktop-mixed-mark-repaint.spec.js`
  (Ctrl + wheel anchoring, mouse pans, overlays, navigation records, mixed
  marks): 26 passed.
- `npm test`: passes.

## Not covered

- **Physical devices.** None used. The frame times are emulated; the counts
  are not.
- **WebKit.** The `ipad-webkit` project could not run here: the sandbox has no
  WebKit build. The change removes code rather than adding any, so it has no
  engine-specific path.
- **The zoom's own repaint is unchanged.** A crossing step still costs one full
  paint. On the phone profile that is 200–400 ms, dominated by symbol `fillText`
  (baseline finding 5's other half, with the minimap's layout read).
  This change removes the paints on top of it, not the paint itself.
