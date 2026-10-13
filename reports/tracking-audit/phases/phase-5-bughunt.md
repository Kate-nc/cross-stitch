# Phase 5 bug hunt

## Batch 1 (done style and low-zoom colour)

Visual regression against `main` (`harness/lookdiff.js`; screenshots in `reports/tracking-audit/screens/phase5/hunt-*`), then reading what the new code touches.

- **Highlight view unchanged:** pixel-identical to `main` at 19, 8 and 3 px cells (0 differing pixels), so the isolate / outline / tint / spotlight styles, the focus colour and its dimming are untouched.
- **Half stitches, partial stitches, French knots, backstitch** (the special-stitches fixture, a third of the stitches done, Symbol and Colour views at 19 px): all still draw (the red diagonal half stitches, the green partial crosses, the knot rings, the dashed backstitch and the guide); only the done cells' fill changed.
- **Dark theme:** the chart paints its own fabric as before; the done fill and dimmed symbol read on it. Not a change.
- **A single mark repaints only its own cell** (spec: the marked cell turns to its thread colour; a neighbour and a distant block are pixel-identical); undo and redo go through the same `paintDoneChanges`, covered by the existing partial-repaint tests.
- **White and cream threads:** done is held to luminance 180, so a done white cell is a visible light grey against the fabric; the colour helper's guarantee (not-done at least 48 luminance units lighter than done, over a fine colour grid) is a unit test.
- **PDF export untouched:** none of `pdf-export-worker.js`, `creator/pdfChartLayout.js`, `creator/pdfExport.js` is in the diff.
- **A performance regression in my first version** (full repaint +26%, pan +30%) found by the draw benchmark, fixed (see the performance section of the progress notes).
- **A test-environment trap, not an app bug:** the iPad profile of the touch-tablet Playwright project (iPad user agent, 2x density) holds a 300x300 chart to about 5 px cells under the iOS canvas limits whatever zoom is saved, which made the first measuring spec read the wrong zoom. It now runs as a desktop browser at 1x.
- `save-durability` "marks made a moment before a reload" failed once in a 94-spec run and passed 22 of 22 on repeat: the known intermittent test, not this batch.

Known limits and decisions to revisit:
- **Colour view changed more than Symbol view:** a not-done stitch in Colour view is now a lighter, desaturated thread colour (it was the full thread colour, identical to done); done is the full colour. That is what makes done readable in Colour view (greyscale gap 3 to 65 to 95), but someone who used Colour view to preview the finished piece in full colour now sees the not-done part pale. The fade is the existing `lowZoomFade` setting at the solid tiers and 0.5 at symbol tiers.
- Highlight views keep their own rules (no change), and the Creator and PDF paths are separate code.
- Not verified: Safari and real devices; the realistic fabric texture preference (`trackerCanvasTexture`) with the new fills was not compared by eye.
