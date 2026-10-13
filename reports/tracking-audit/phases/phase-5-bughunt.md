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

## Batch 2 (pattern overview and Fit)

Found and fixed during the work (each by a failing check or a screenshot):
- **Fit did not fit 300x300**: cells could not go under 2 px, so a 300-row pattern overflowed a 600 px box by about 35 px; the tall 120x400 fixture overflowed by 230 px. The floor is now 1 px.
- **The map sat below the chart**, over the hover bar's Clear guide button, and then (first try at a corner) under the tool rail. It now sits in the bottom corner of the chart box opposite the rail, by handedness.
- **The phone's map button appeared at the page's top left**: its position was computed from `offsetParent`, which is null while an element is hidden, and nothing re-ran it once the button showed. Position now comes from the parent element and re-runs when the map's state changes.
- **Drag-60 cost**: the map repainted per marked cell; it now gathers blocks and paints once a frame. The layout reads that ran on every zoom step now run only when the map's corner, size or state changes.
- The used-icon snapshot test failed when the icon was first referenced by the Tracker and passed again once the button moved into the module (the snapshot is unchanged).

Checked and fine: marking and undo keep the map right (undo restores its pixel), and a load builds it; switching projects frees and rebuilds it; a pattern that fits shows no map and builds none; resizing the window keeps it in the chart box; left-handed layout moves it right; phone Focus starts closed and the button opens it; dark theme; print hides it; no emojis (an SVG icon is used).

Not driven: Safari and a real phone or tablet; a screen reader on the map (screen-reader work is deferred by instruction; the map has a plain group name and arrow-key operation only); work-area mode with the map shown (it maps the whole pattern, the rectangle follows the area's scroll through the same offsets, but I did not look at it); a 1000x1000 pattern in a browser (only the compute was timed); high-contrast mode beyond a forced-colours rule that I did not render.

## Batch 3 (keyboard parity)

Found and fixed while building:
- **Space doubled as pan and mark.** Marking on Space would have broken hold-to-pan for anyone whose chart had focus after a click. Space marks only while the keyboard has the guide (arrow keys or Enter took it), and a pointer press, Esc or a mode change gives it back. Tested both ways.
- **A guide left over from Navigate mode** (a click there sets it) would have made the first Enter in Mark mode mark under it. The first Enter only takes the guide.
- **A colour lock that refuses a mark** must not become the anchor for Shift+Enter; the anchor moves only when the stitch actually changed.
- **Key auto-repeat** would toggle a stitch on and off while Enter is held; repeats are ignored.
- **`helpDrawerShortcutsSync` skipped any key list containing `[` or `]`** because its regexes ended a list at the first `]`, so `[` and `]` were never checked either way. Fixed; the real entries pass.
- **The shut More panel was in the tab order** (it was only translated off screen): 0 stops in 120 Tabs now.

Checked and fine: Shift+arrows move 10 stitches; the guide scrolls into view; Edit mode ignores the keys; typing in a text field never reaches the chart handler (it is on the canvas) or the single-key shortcuts (the registry's input guard); Alt+arrows still move the spotlight; a click still marks; the dark theme outline; reduced motion (the panel's visibility change is instant then).

Not driven: a physical keyboard on a Mac (Cmd+Z is the registry's `mod`); stitches that are half stitches or French knots at the guide (Enter toggles the full stitch only; parking is still Shift+F10 or Menu); a colour lock refusing a keyboard mark in the browser (pinned at source level and by the shared function only); Safari and Firefox focus-ring behaviour of `:has(canvas:focus-visible)` (Chromium only); any screen-reader behaviour, by instruction.

Review round on #303 (Copilot), all three real and fixed:
- **The Clear guide button left the keyboard's guide and range anchor behind**, so Space recreated the guide instead of panning and a later Shift+Enter could fill from a hidden old anchor. Esc, the button and the keyboard now go through one `clearGuide()`; a browser test covers the button.
- **The range anchor advanced even when nothing was committed** (every stitch filtered by a colour lock) or while the "mark all as" question was open (cancelling it left the anchor at an endpoint never marked). `_commitBulk` now returns whether it committed, and the anchor moves only then. One consequence: if the question is answered "yes" the stitches are marked but the anchor stays where it was, so the next Shift+Enter fills from the earlier anchor. That is the safe side of the two, and it is noted here rather than hidden.
- **A different pattern did not hand the guide back** (only a mode change did), so Space or Enter could mark a stale coordinate in the next project. The reset now also runs when the pattern changes (checked at source level; a project switch in the browser with a keyboard guide held was not driven).

## Batch 4 (accessibility fixes without a screen reader)

Found and fixed while doing it:
- **The default accent was written inline on every load**, which pinned the light theme's value over the dark theme's (the biggest single cause of the 166 contrast failures: all accent text on dark).
- **A token that did not exist** (`--surface-primary`) made the Stats colour panel a white box under pale text in dark mode.
- **Two buttons I added in batches 1 and 2** (finished-stitch style, pattern overview Show/Hide) had accent-ink text on an accent fill (2.6:1 light, 2.1 dark), like five existing ones; all now use `--text-on-accent`.
- **The focus ring on buttons and inputs was a pale peach**, because `button:focus` (more specific than `*:focus-visible`) set it to `--accent-border`.
- **My own first reading of the focus sweep was wrong**: nine stops looked ringless only because the ring eases in over 120 ms and the sweep read it at once. Stated in the audit script and the notes; no ring was missing.
- **200% zoom**: on first use the palette opened as a sheet over the entire chart on a non-touch device 720 px wide, and the main controls could not be clicked.
- **The progress chart's lines**: the Actual line was a hard-coded purple while its legend swatch was the accent; the pace line was `#CFC4AC`; the what-if line shared the pace line's dash. Now solid, dashed, dotted, in token colours.
- After raising `--text-tertiary` the whole app shifted slightly darker in captions; I looked at Home, Manager, Stats and the Tracker in both themes (`reports/tracking-audit/screens/phase5/a11y-*.png`) and nothing broke.

Checked and fine: a chosen accent colour still wins and survives a theme change; the first-use banner is 8.96:1; the Focus bar's idle fade still recedes (0.8, primary-coloured labels); reduced motion is unaffected (no new animation); the PDF export files are untouched. The Creator shares these tokens and was not looked at.

Not done or not driven: a screen reader on any of it, by instruction; `aria-required-children` and `nested-interactive` (24 nodes) remain; a chosen custom accent colour is not checked for contrast; the Creator and Manager pages were looked at but not run through axe (the prompt scopes this to the Tracker and both Stats pages); the heatmap ramp and multi-project colours on Stats were left (see above); Windows high-contrast mode was not rendered; text-only zoom and OS large-text settings were not exercised (the app sizes text in px).
