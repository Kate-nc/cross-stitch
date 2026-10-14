# Phase 6 bug hunt

## Batch 1 (data model)
- Marks whose line or quarter was edited away are dropped on load, not carried onto another line (browser check, `harness/p6b1.js`).
- A progress record from a build that does not know the new fields must not erase the project's own marks; it does not (unit test).

## Batch 2 (quarter stitches)
- The first mark in a browser run seemed lost: it was the "How do you usually work through a pattern?" dialog covering the chart, not the marking. Harness fixed (it now sets the style preference).

## Batch 3 (backstitch marking)
Found and fixed while building:
- `inCell` missed a line that only runs along a cell's edge (the spatial index puts such a line in the neighbouring cell's bucket), so `B` found nothing on the row above a line. It now reads the nine buckets around the cell, and ignores a line that only meets the cell at a corner. Unit tests for both.
- A completion dialog (the only stitches were marked) covered the chart and swallowed the drag in a first browser run; the fixture now has a second stitch.
- The compact project format keeps its lines as `.bs`; loading marks against `project.bsLines` alone would have dropped every mark. It now reads `bsLines || bs`.
- Recolouring a thread in the Creator changed the lines' keys and would have orphaned their marks; the marks now follow (and follow through undo and redo).
- A colour used only for backstitch had no legend entry; it now has one, with no `0/0`.

Checked and fine: undo and redo across stitch, quarter and backstitch marks (one history, one entry per gesture); a drag that ends off the canvas (pointer capture); a colour lock (lines of other colours refused); the work area (lines outside it refused, and "all of this colour" limited to it); PDF export files untouched; marks survive reload.

Not done or left alone:
- Imported `.oxs` backstitch has never kept its colour (lines draw `#333`, key colour is empty): such lines count in the totals and can be marked, but have no legend row and are not reached by a colour's Lines button.
- The loupe is shown for presses that land on a line, not for any finger down; a finger that misses by more than the snap distance marks the stitch beneath without it.
- Diagonal lines pass through the centre of a cell, so within the snap distance of one the line wins over the stitch beneath; zoom in or press near the stitch's corner to mark the stitch.
- No screen-reader announcements for the line chosen with `B` (screen-reader work is deferred).
