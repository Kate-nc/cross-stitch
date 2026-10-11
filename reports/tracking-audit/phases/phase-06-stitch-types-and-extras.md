# Phase 6: More stitch types and project extras

> **Agent prompt.** You are making backstitch and fractional stitches trackable in the `kate-nc/cross-stitch`
> tracker, adding a simple way to unpick a section, and adding optional project notes and photos. Read
> [phase-00-working-agreement.md](phase-00-working-agreement.md) in full first, then the findings below
> in [reports/tracking-audit.md](../../tracking-audit.md). Phases 1 to 5 must be merged into `main`;
> confirm. This is the largest data-model change in the programme: ask the user before any decision
> this prompt marks "ask first".

## Goal

Backstitch, quarter and petite stitches (and long stitches if the Creator can produce them) have done states,
counts and sensible marking on mouse, keyboard and touch; the progress definition includes them; a section
can be unpicked in one step with history staying honest; a project can hold notes and photos.

## Findings in scope

TRACK-04 (Major), TRACK-13, TRACK-14.

## Evidence to reproduce first

(`harness/gen.js` special fixture; `harness/e6`-style run, results in audit TRACK-04.)

- Clicking a backstitch marks the cross stitch beneath it.
- Clicking a quarter-stitch cell does nothing; a colour used only in quarter stitches shows "0/0".
- The Layers panel lists Backstitch, Quarter, Petite and Long Stitch with fixed zero counts (`layerCounts`
  in `tracker-app.js` ~1938).
- `bsLines` and `partialStitches` are drawn only; there is no `bsDone` or `partialDone`.
- Beads are dropped at OXS import (`import-formats.js` ~381): decide with the user whether to preserve
  them as untracked ornaments (**ask first**).

## Recommended solution (chosen options)

### Data model (follow the `knotsDone` template exactly, see agreement rule 2)

- `bsDone`: set of backstitch line identifiers. Lines currently have no id: derive a stable key from the
  endpoints and colour (`x1,y1,x2,y2,colour`) and normalise direction, as `knots.js` does for knots; keys
  not matching an existing line are ignored (so Creator edits cannot misattribute a done mark). Put the
  helpers in a new small module modelled on `knots.js` (`backstitch.js`), also `require()`-able.
- `partialDone`: map of cell index to the set of quarter positions done (`TL`, `TR`, `BL`, `BR`), parallel to
  `partialStitches` and `halfDone`.
- Both optional on the project, version stays 11, saved only when non-empty, preserved by the Creator,
  merged by sync (union), included in backup and in the Phase 1 progress record, and covered by tests
  modelled on `projectStorageKnots.test.js` and `syncKnots.test.js`.
- Extend `progress-units.js` (Phase 2) with new table rows: quarter 0.25, petite 0.25, backstitch counted in
  its own line by length in half-cell units. **Ask first** whether backstitch should contribute to the
  headline percent or only appear as its own "Backstitch 3/8 lines" row; implement the user's choice
  behind the single table. Extend the incremental counters (no rescans).

### Marking

- **Quarter and petite:** tap the quadrant like half stitches today (`hitTestHalfStitch`, disambiguation
  popup when ambiguous); undo entries as `PARTIAL`; colour lock and highlight rules apply.
- **Backstitch:** a Backstitch layer toggle that is on by default for patterns that have lines. Taps snap to
  the nearest line within a tolerance of 14 px on mouse and 20 px on touch (scaled by zoom, never selecting
  a line farther than half a cell away); drag along a line marks the run; "mark all backstitch of this
  colour" in the legend; a clear visual done state (thicker, in thread colour, with a non-colour cue such
  as a solid vs dashed line, consistent with Phase 5). Show a loupe on touch (reuse the Creator's touch
  magnifier approach, `tests/e2e/creator-touch-magnifier.spec.js`). Clicking a backstitch must no longer
  mark the cross stitch below it; a tap that is nearer a line than the cell centre marks the line.
- **Keyboard:** cycle through backstitch lines in the guide mode (Tab order or `B` then arrows), Enter
  marks (document in the shortcut registry and help).
- Legend rows show "3/8 lines" and "6/18 fractional" next to full counts; colours used only in fractional
  or backstitch work are never "0/0".

### TRACK-13: unpick a section

Add "Unpick area" to the existing rectangle bar (with Park thread here and Cancel): one undo step; unmarks all
types in the rectangle; records a session event `kind: "frog"` shown in the journal ("Unpicked 80"); Phase 2
semantics apply (unpicking is not a negative day). Mouse, keyboard (Shift+Enter variant) and touch.

### TRACK-14: notes and photos (optional, lowest priority; ask first before building)

A project Notes field in the Session or Tools panel and an optional photo strip stored in the existing
`blob-store.js` (included in backup; compressed client-side, capped size, thumbnails lazy-loaded so project
load is unaffected). Photos never load on the chart path.

## Files likely to change

`tracker-app.js`, `useDragMark.js`, `useStitchCounts.js`, `progress-units.js`, new `backstitch.js` (plus
`stitch.html`, `sw.js`), `knots.js` (reference), `project-storage.js`, `sync-engine.js`, `backup-restore.js`,
`blob-store.js`, `creator/useProjectIO.js`, `creator/useEditHistory.js`, `creator-main.js`,
`import-formats.js` (only if the user decides to keep beads), `icons.js`, `help-drawer.js`, `version.js`,
tests (add Jest unit tests for the helpers, storage, sync and Playwright specs for marking on mouse and touch).
Rebuild `compiled/` and `creator/bundle.js`.

## Acceptance criteria

- **Worked example (backstitch):** pattern with 8 backstitch lines of thread 310; mark 3. The legend row
  for 310 reads "3/8 lines", the progress panel shows "Backstitch 3/8", the Stats page, share text and Home card
  agree, and after reload, backup/restore and `.csync` round-trip the same. A tap on a backstitch no
  longer marks the cross stitch beneath.
- **Worked example (fractional):** a cell with TL and BR quarters of 912 and a neighbour with TL only: three
  quarters; marking two shows "2/3 fractional" and, with weight 0.25, 0.5 units in the progress figure;
  undo and redo restore exactly.
- A colour used only in fractional or backstitch work shows a real count and its Done action works.
- Touch: backstitch can be marked with a 20 px tolerance and loupe without marking neighbours; two-finger pan
  unaffected.
- Keyboard-only marking of a backstitch line and a quarter works and is announced.
- "Unpick area" over 80 done stitches clears them in one undo step; the journal shows "Unpicked 80";
  progress drops by 80 units; the day's additions are not reduced.
- Creator round trip: open in Creator, edit unrelated cells, return: `bsDone` and `partialDone` are preserved;
  removing a line removes only its done key; changing colours does not misattribute done marks.
- Old projects load unchanged; old builds ignore the new fields.

## Performance guard

Hit-testing backstitch on tap must use a spatial index (grid buckets by cell) built once per pattern, not a
linear scan of all lines per pointer move; repainting after a mark must stay partial (only the affected
cells and lines). Measure tap-to-paint and drag latency on a pattern with 5,000 backstitch lines and the
300x300 fixture. Counters stay incremental.

## Data and migration statement (include in the PR)

New optional fields `bsDone`, `partialDone` (and optional notes/photos if built). No migration. Past
statistics are unaffected (past sessions simply have no backstitch/fractional counts; progress percentages
for existing projects may change slightly because fractional units now count; state this in the PR, the
help text and the changelog, and make the new weights easy to find in `progress-units.js`).

## Suggested batches

1. Data model, helpers, storage, sync, backup, Creator preservation and unit tests (no UI).
2. Quarter and petite marking and counts.
3. Backstitch marking (spatial index, snapping, loupe, legend actions, keyboard).
4. Unpick area (TRACK-13).
5. Notes and photos (TRACK-14), only if the user confirms.

## Phase bug-hunt additions

Fixture with all stitch types overlapping in one cell and in neighbouring cells; undo/redo across stitch
types; colour lock and highlight modes with each type; Spotlight and work areas; palette swap
(`tests/paletteSwapPreservesDone.test.js` style) must preserve all done sets; pattern edited after tracking
(Phase 1 reconciliation must remap `bsDone`/`partialDone` too); PDF export untouched; imported OXS with
knots and beads; very dense backstitch (10,000 lines) for hit-test and paint cost.

## Programme completion

When this phase is merged, write `reports/tracking-audit/phases/programme-summary.md`: every finding with
its final status (fixed, partly fixed, deferred and why), measured performance deltas across all phases,
remaining risks (Safari, Firefox and real-device checks still unverified), and a refreshed list of open
questions for the user.
