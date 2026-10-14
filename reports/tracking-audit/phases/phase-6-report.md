# Phase 6 report: stitch types and extras

Status: TRACK-04, TRACK-13 and TRACK-14 are done across five batches (PRs 307, 308, 309, 310 and 311, all merged), with the decisions you gave at the start: backstitch is its own row, beads are kept, notes and photos are built, and fractional weights may shift percentages. This closing PR holds the end-of-phase hunt (one real fault found and fixed), the whole-phase performance check and this report. I have not written the programme summary yet; the prompt says to do that once Phase 6 is merged.

## What shipped

| PR | Batch | Findings | Outcome |
|---|---|---|---|
| #307 | 1: data model | TRACK-04 (data), beads | Optional project fields `bsDone`, `partialDone`, `beads` (version stays 11). Helpers `backstitch.js` and `fractional.js`. Carried by the progress record, the cross-tab merge, device sync, the Tracker and the Creator (resize and its undo). A separate `backstitch` count in `ProgressUnits`. OXS beads are kept (own name and colour) and written back on export |
| #308 | 2: quarter stitches | TRACK-04 | Mark a quarter with a mouse, a finger or Enter at the guide; Undo and Redo; a not-done quarter is faded; legend `2/3 fractional`; quarters count 0.25 in every progress figure |
| #309 | 3: backstitch | TRACK-04 | Mark a line by tap, drag along a run (one undo step), the Creator's loupe on touch, `B` then `Enter` at the keyboard, a legend `3/8 lines` and a per-colour Lines button; a spatial index built once per pattern; a Backstitch row in Progress info, outside the percentage |
| #310 | 4: Unpick area | TRACK-13 | Unmarks every kind of stitch in a rectangle as one undo step: touch via the rectangle bar, mouse by Shift+click then Alt at release, keyboard Ctrl/Cmd+Shift+Enter; recorded as a `frog` session event and shown as `Unpicked N`, never a negative day |
| #311 | 5: notes and photos | TRACK-14 | A Notes box and up to 12 compressed photos in the Session tab; photos in the BlobStore, read only when the tab is showing, in backups, deleted with the project |
| this PR | closing | end-of-phase hunt | Quarter marks are now held back and remapped when a pattern is edited after tracking; hunt harness, evidence, this report |

Changelog entries 1.0.136 to 1.0.142 and the in-app help (Backstitch lines, Quarter stitches, Unpick area, Notes and photos, the shortcut table, "How progress is counted") cover all of it. Review rounds: none of the five PRs drew a review comment before you merged.

## Acceptance criteria against the prompt

| Criterion | Result |
|---|---|
| 8 backstitch lines of 310, mark 3: legend `3/8 lines`, progress panel `Backstitch 3/8`, a tap on a line no longer marks the stitch under it | Pass in the browser (`p6b3.js`), including undo and redo and a legend button that marks and clears all. The Progress info row and the strip say `3/8 backstitch lines` |
| "Stats, share and the Home card agree" | Pass for the percentage (backstitch is outside it, so every page reads the same figure). Home, Stats and share text show no backstitch row at all; only the Tracker does (Progress info, strip and legend) |
| Survives reload, backup and `.csync` | Reload: pass in the browser. Device sync: unit-tested (union). A backup carries the whole project, so `bsDone` goes with it; I did not run a backup-restore round trip with `bsDone` in it specifically (photos were round-tripped) |
| 912 TL+BR plus a neighbour TL reads `2/3 fractional` and 0.5 units; undo and redo exact | Pass (unit test and browser; the unit count is 0.5 for two marked quarters) |
| Creator round trip preserves `bsDone` and `partialDone`; old projects unchanged; old builds ignore new fields | Pass: preserved through Creator open, autosave and a second Tracker visit (`p6b1.js`); resize moves the marks (unit-tested helpers, not run in a browser); all fields optional and the version stays 11 |
| Unpick area: one undo step, every type, `frog` event, `Unpicked 80`, not a negative day, mouse, keyboard and touch | Pass for all three inputs on a fixture with all five kinds; the saved session shows added 0, unpicked 6.5 units. "Unpicked 80" is the journal's existing format for a count of 80 (`unpick.test.js` checks a rectangle of 80 reads 80) |
| Notes and photos: a field, a photo strip in the BlobStore, in backup, compressed, capped, lazy, never on the chart path | Pass, with the sync exception below |
| Performance: a spatial index, partial repaints, tap and drag measured on 5,000 lines and the 300x300 fixture | Measured (below). A line tap costs about 15 ms at both 5,000 and 10,000 lines |

## End-of-phase bug hunt

`harness/p6hunt.js`, run against the final build. All stitch types in one cell and its neighbours; undo and redo across types; the colour lock; a pattern edited after tracking.

- **Every type in one cell:** a whole stitch, a quarter, a line along its edge and a knot at its corner were marked in turn (`1/1`, `1/1 fractional`, `1/1 lines`, `1/1 knots`); four undos took them all out, four redos put them all back.
- **Colour lock:** with 310 selected, a 666 stitch and a 666 line could not be marked; a 310 line could.
- **Pattern edited after tracking (the Phase 1 reconciliation):** found a real fault. Quarter marks are keyed by cell index but were neither held back nor remapped when the pattern's size no longer matched the saved marks, so they could land on the wrong cells. Fixed: they are held back with the rest, and carried to their new cells (where a quarter exists) when the earlier marks are kept. Backstitch marks are keyed by coordinates and colour and need no remap. Browser check passes.
- **Palette swap preserving marks:** the existing swap test for whole stitches stays green; backstitch marks follow their lines through a colour replace and its undo and redo (unit-tested `remapDone`).
- **PDF export:** `pdf-export-worker.js`, `creator/pdfChartLayout.js` and `creator/pdfExport.js` have no change since the start of the phase (`git diff` of the three files is empty).
- **Imported OXS with knots and beads:** parsed, kept in the project and written back (`oxsKnots.test.js`).
- **Spotlight and work areas:** every marking path checks the work area; checked at source and in the unpick plan's tests, not run in a browser.
- **10,000 backstitch lines:** index, paint and mark costs measured (see Performance).

Faults found and fixed along the way in the batches are listed in `phase-6-bughunt.md` (among them: a line along a cell's edge that the spatial index missed, a compact-format project that would have dropped every backstitch mark on load, and recoloured lines that would have lost their marks).

## Performance

Rule: nothing slows the app by more than 5%. Every batch was measured interleaved against `main` (see `phase-6-progress.md`). Whole phase, interleaved against the commit before Phase 6 (1.0.136), 300x300 fixture with 20% done, desktop, medians:

| | before | now | change |
|---|---|---|---|
| zoom step (full repaint), `drawbench`, 4 rounds x 2 browsers | 81.5 ms | 85.0 ms | +4.3% |
| zoom step, `p6bsbench` (zoom and pan only), 6 rounds x 3 browsers | 31.0 ms | 32.6 ms | **+5.0%** |
| pan step, `drawbench` | 21.0 ms | 22.7 ms | **+7.7%** |
| pan step, `p6bsbench` | 6.33 ms | 6.47 ms | +2.3% |
| drag of 60 cells | 725 ms | 735 ms | +1.3% |
| single mark | 30.0 ms | 30.7 ms | +2.6% |
| JS heap after GC | 19.4 MB | 19.5 MB | +0.6% |
| 5,000 backstitch lines: zoom step | 32.1 ms | 33.3 ms | +3.7% |
| 5,000 backstitch lines: pan step | 6.6 ms | 7.1 ms | **+7.4%** |

Marking backstitch (branch only): a single line tap 15.0 ms at 5,000 lines and 15.3 ms at 10,000; a 60-step drag along lines 277 ms and 275 ms. Unpicking a 91x91 rectangle (6,232 stitches) on a chart with 10,000 lines took 387 ms including the repaint, and 197 ms to undo.

**What to read into this.** Run-to-run noise in this sandbox is 5 to 8% on one figure, and the figures above swing by about that between benchmarks (the pan step reads +7.7% in one and +2.3% in the other). No change in this phase touches the per-cell draw path for a chart with no fractional or backstitch work: the cost sits in the Tracker's render, which gained about twenty hooks and memos across the five batches. The zoom step is consistently a few percent slower (+4.3%, +5.0%, +3.7%), and the pan step is at or just over the line in two of four readings, so I cannot say the 5% rule was met for the zoom and pan steps, and I cannot show it was broken beyond the noise either. Single marks, drags and memory are clearly inside it.

## Data and migration statement (as shipped)

- **Projects:** version stays 11. New optional fields: `bsDone` (backstitch line keys), `partialDone` (quarter stitches done, per cell), `beads` (OXS beads), `notes` (text). Each is saved only when non-empty, preserved by the Creator, merged by sync (the first three are unions or kept from whichever side has them; `notes` follows the existing newest-wins rule), and included in backups. A mark whose line or quarter no longer exists is dropped on load.
- **Photos:** two records per photo in the existing `pendingImports` store (`photo:` and `photothumb:`), no schema change. In backups as an optional `photos` list; not in sync; deleted with the project.
- **Session data:** an unpicked area adds a `{kind: "frog"}` event to a session's log and counts in its unpicked figure; no existing session is rewritten.
- **Old projects and old builds:** open as before; older builds ignore every new field. A chart that has quarter stitches shows a lower percentage than before until they are stitched (weights shifting percentages was accepted).

## Decisions and deviations you may want to revisit

- **Backstitch is outside the percentage**, as you chose, and has its own row only in the Tracker. Adding a row to Home, Stats or the share text would be a small follow-up.
- **"Petite" has no data model.** Only quarters exist; the Petite layer stays at zero and the `petite` weight stays in the table for when it does.
- **A press near a backstitch line marks the line**, within 14 px for a mouse and 20 px for a finger (never more than half a stitch), unless the stitch under it is nearer than the line. A quarter drawn in a cell corner next to an edge line is therefore marked by pressing a little nearer the centre of the cell. Within the snap distance of a diagonal line (which crosses the cell centre) the line wins.
- **The mouse route to Unpick area is click, Shift+click, then hold Alt as you let go** (Alt at the press is the spotlight's). Touch and keyboard routes are as the prompt asked. The corners of a mouse or touch rectangle must be stitches (the existing rectangle gesture's rule).
- **Photos do not travel with Sync.** They are in backups.
- **Unpick respects a colour lock.** It takes out only that colour.
- **Notes are separate from the project Description** (which the Creator edits).

## Open items

- Imported `.oxs` backstitch has never kept its colour, so those lines count and can be marked but have no legend row.
- The touch loupe appears for presses that land on a line, not for any finger down.
- A session already closed keeps its `Unpicked` figure if the unpick is undone later.
- Quarter counts are not in a work area's figures (like knots).
- Screen-reader work (announcing the `B` selection, quarter and unpick state, the Phase 5 deferrals) is still deferred.
- Tests that fail on `main` too, not caused by Phase 6: as listed in the Phase 5 report.

## Not verified

Safari and Firefox (including the Alt+Shift+click route and `color-mix` in the photo viewer); real phones and tablets (touch was driven with emulated touch events and CDP touch, not a finger on glass); a physical Mac keyboard for Cmd+Shift+Enter; the work area and Spotlight in a browser for marking; a Creator canvas resize with marks in a browser; a backup-restore round trip of backstitch marks; HEIC photos; `npm run test:mobile-audit` (cannot run in this sandbox).
