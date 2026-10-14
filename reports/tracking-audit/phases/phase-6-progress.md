# Phase 6 progress: stitch types and extras

Prompt: `phase-06-stitch-types-and-extras.md`. Findings: TRACK-04 (backstitch, quarter and petite stitches), TRACK-13 (Unpick area), TRACK-14 (notes and photos).

## Decisions from the user (at the start)

- **Backstitch is its own row** ("Backstitch 3/8 lines"). It is not in the headline percentage.
- **OXS beads are preserved** (they were dropped at import). They are not tracked.
- **Notes and photos are built** (batch 5).
- **Fractional weights may shift percentages** (quarter and petite count 0.25). To be said in the PR, the help and the changelog when batch 2 wires them in. The weights stay in the `WEIGHTS` table of `progress-units.js`.

## Plan (five batches, one PR each)

1. Data model, helpers, storage, sync, backup and Creator preservation. No marking UI.
2. Quarter and petite stitches: marking and counts.
3. Backstitch: marking, spatial index, legend rows, keyboard, touch loupe.
4. Unpick area.
5. Notes and photos.

Then the end-of-phase hunt, performance check on 5,000 and 10,000 backstitch lines and the 300x300 fixture, `phase-6-report.md`, a closing PR, and `programme-summary.md`.

## Batch 1: data model (no marking UI)

### New fields (all optional; project version stays 11; older builds ignore them)

| Field | Shape | Notes |
|---|---|---|
| `bsDone` | `["x1,y1,x2,y2,colour", ...]` | The keys of backstitch lines marked done (`backstitch.js`). Endpoints are put in order so a line and its reverse share a key. The colour part is `colorId`, else `color`, else empty. A key whose line no longer exists matches nothing and is dropped on load, so a Creator edit cannot move a mark onto another line. Identical lines share one mark and both count |
| `partialDone` | `[[cellIndex, ["TL","BR"]], ...]` | Quarter stitches marked done (`fractional.js`), parallel to `partialStitches`. A mark on a quarter with no thread is dropped on load |
| `beads` | `[{x, y, label?, rgb?}]` | Beads from an imported OXS chart, in half-stitch units like knots. Kept, written back on OXS export, never tracked, not drawn yet |

### Where they travel

| Path | Change |
|---|---|
| Progress record (`progress:<id>`) | carries `bsDone` and `partialDone`; a record from a build that did not know them leaves the project's own marks alone; a record that has the field (even empty) wins |
| Cross-tab merge (`tracking-merge.js`) | `bsDone` merged as a set, `partialDone` per cell and per position (`mergeQuarterDone`); both are out of `NOT_COMPARED` so a mark in the other tab never forces the "which copy" question |
| Device sync (`sync-engine.js`) | `bsDone` and `partialDone` are unions; `beads` come from whichever side has them. A project without any of them gains no field |
| Tracker (`tracker-app.js`) | state, both snapshots, the progress record owner/base refs, the cross-tab merge, load, and both autosave dependency lists |
| Creator | `useProjectIO` keeps the three fields in `trackerFields` (so a Creator save does not drop them); canvas resize offsets `bsDone` (`Backstitch.offsetDone`), remaps `partialDone` (`Fractional.remap`) and offsets `beads`; resize undo and redo restore all three |
| Backup / `.csync` | projects go through whole; nothing to change (checked) |
| Library | `anyProgress` is true when only backstitch or quarter marks exist |
| Counts | `ProgressUnits.countsFromProject` gains a `backstitch: {done, total}` row (separate; percent unchanged). The key function is written out in `progress-units.js` because Home and Stats do not load `backstitch.js`; a test holds the two equal |
| OXS import / export | beads are read from `objecttype="bead"` ornaments with the palette entry's own name and colour (not matched to a DMC thread), snapped like knots, de-duplicated, and written back as bead ornaments. Warning text now says how many beads were kept; other ornaments are still reported as not imported |

New scripts `backstitch.js` and `fractional.js` are loaded by `stitch.html`, `index.html` and `create.html` and precached (`sw.js` cache v66).

### Tests added

`tests/backstitch.test.js` (keys, live, toggle, progress, offset, the `progress-units` row and key parity), `tests/fractional.test.js`, `tests/syncBackstitchQuarters.test.js` (tab merge, device sync, progress record), beads cases in `tests/oxsKnots.test.js`. `trackerSaveDurability.test.js` pin updated for the new dependency list.

### Browser check (`harness/p6b1.js`)

Seeded a project with 3 backstitch lines (one marked plus a ghost key), a quarter cell with TL and BR threads and marks on TL and TR (TR has no thread), and a bead. After a Tracker mark, an autosave, opening the Creator and a second Tracker visit: `bsDone` and `partialDone` survive, the ghost key and the thread-less TR mark are dropped, the bead is unchanged, the library shows `anyProgress`, no page errors.

### Performance

Nothing in the draw or mark path changed in this batch. The additions on the mark path are two reference comparisons in the progress-record effect and two more dependencies on the autosave effects.

## Batch 2: quarter stitches (marking and counts)

### What was built
- **Marking (mouse, touch, keyboard).** In Mark mode a press on a cell that holds quarter stitches marks the quarter nearest the press (`Fractional.pick`: nearest quadrant centre among the quarters that hold a thread; a single quarter takes a tap anywhere in the cell). Mouse and touch share the pointer path the French knots use, so a tap with a finger works the same. At the keyboard, Enter at the guide marks the first quarter not yet done and Enter again the next; with every quarter done it unmarks the last (Undo covers the rest). Only quarters with a thread count: a cell's whole stitch, if it has one, is marked first, as for half stitches. Cells with half stitches keep the half-stitch path. A colour lock refuses a quarter of another colour.
- **Undo and redo.** A `QUARTER` history entry per mark, flipped by Undo and Redo exactly like a knot; a cross-tab merge clears the history as it does for every other mark.
- **Look.** A done quarter, half or three-quarter group is drawn as before; one not yet done is faded (alpha 0.4 against 0.8). It follows the existing Quarter layer switch.
- **Counts.** `quarter` is in `progAll`, `progShown` (visible-layers mode honours the Quarter layer), the live-session units, milestone detection, the layer counts, the colour legend (percent and remaining now include quarters at 0.25) and `ProgressUnits.countsFromProject`, so Home, Stats, the library and share text agree. The legend row reads, for example, `2/3 fractional`; a colour with no whole stitches never shows `0/0` (this also fixes knot-only colours).
- **Weights shift percentages (accepted by you).** A chart with quarter stitches now has more units than before (each quarter is 0.25). Said in the changelog and the help ("How progress is counted").

### Worked example from the prompt (browser, `harness/p6b2.js`, `p6b2touch.js`)
912 TL+BR in one cell plus a TL in the next, on a skip background: legend `0/3 fractional`; mark TL, BR: `2/3`; third: `3/3` (the project reaches 100% and the stash prompt shows). Undo gives `2/3`, Redo `3/3`. A cell with a whole stitch: first tap marks the whole stitch (`1/1`), the second tap marks its quarter (`1/1 fractional`). After an autosave the project holds `partialDone` for all three cells and a reload shows the same legend. Touch taps (hasTouch, 820x1100) marked the same cells.

### Decisions and limits
- **"Petite" has no data model.** The project stores quarters (`partialStitches`) only; the Quarter layer covers them and the Petite layer stays at 0. The weight for `petite` stays in the table.
- Quarter counts are not in a work area's counts (like knots); the area figures count whole and half stitches only.
- If the pattern changes size outside the Creator, the existing reconciliation remaps `done` and `halfDone` only; quarters (the stitches themselves and their marks) are not remapped there. The Creator's resize does remap both.
- A mark on the chart for a quarter repaints the whole tile (as a half-stitch mark does), not a clipped cell.

### Performance (batch 2)
300x300 fixture, 20% done, no quarter cells (the draw loop's per-cell work is unchanged there: `drawPartial` runs only for cells with quarters). Interleaved against `main` (3 rounds of 2 fresh browsers each, 1x CPU, medians):

| | main | branch | delta |
|---|---|---|---|
| zoom step (ms task time) | 90.7 | 94.4 | +4.1% |
| pan step (ms) | 22.2 | 23.5 | +5.7% |
| drag of 60 cells (ms) | 732.9 | 685.7 | -6.4% |
| single mark (ms) | 28.2 | 26.7 | -5.4% |
| heap after GC (MB) | 19.39 | 19.39 | 0.0% |

The sign changes across rows and the sandbox's own run-to-run noise is up to 8% (A/A runs in Phase 5), so this reads as "not distinguishable", not as a regression or a gain. The pan figure is the one nominally above 5%; rounds ranged 21.8 to 26.7 on `main` alone.
