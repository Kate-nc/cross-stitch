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
