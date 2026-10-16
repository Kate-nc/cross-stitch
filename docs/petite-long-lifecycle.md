# Petite and long stitches: supported lifecycle

Petites are miniature complete crosses, not diagonal quarters or individually tracked full-cross legs. Long stitches are independent straight segments. Neither replaces the full cross, half stitch, quarter, knot or backstitch underneath it.

## Capability matrix

| Capability | Before this change | Petite after this change | Long stitch after this change |
| --- | --- | --- | --- |
| Creator creation | Neither had a tool/model | More tools > Petite and long stitches: choose thread and top-left half-cell coordinates | Same panel: choose thread and two half-cell endpoints |
| Native JSON import | No independent objects; PDF extraction could leave a `type: petite` grid cell | Versioned object extension; legacy petite cells explicitly migrated | Versioned object extension |
| OXS import | Miniature crosses reported unsupported; straight stitches treated as backstitch | `quarter` ornaments with `petit=true` (or omitted), and `petite` ornaments | `straightstitch` / `longstitch` backstitch-section objects |
| PDF/image import | No reliable independent geometry | PDF labels without geometry rejected explicitly; raster conversion still creates full crosses | Same limitation; no inferred endpoints |
| Selection/edit/delete | Absent | Independently select by list, edit thread/position/type, delete; undo/redo | Independently select by list, edit thread/endpoints/type, delete; undo/redo |
| General Creator canvas selection tools | No objects to transform | Use the object panel; move/copy/paste/flip/rotate/global colour replacement do not edit these objects | Same |
| Resize/crop | No model | Offset with chart origin; discard objects outside the new chart; resize undo/redo restores identities | Same; retain only segments whose entire geometry fits |
| Chart rendering | Layer label only | Two crossed half-cell diagonals, selection outline, marked appearance | Segment, selection outline, marked appearance |
| Realistic/3D previews | No model | Not supported; use chart or PNG | Same |
| Counts | Layer hard-coded to zero | Actual object count and done count, colour count, weighted project progress | Same |
| Tracker selection/marking | Absent | Tap/click rendered geometry; Layers list disambiguates overlaps and supports keyboard operation | Same, including endpoints on chart edges |
| Marking undo/redo/session accounting | Absent | Existing tracking history and synchronous unit activity | Same |
| Area unpick | Absent | Whole objects wholly inside rectangle, colour lock respected, one undo step | Same |
| Save/reload/handoff | Absent | Native JSON, IDB, navigation progress recovery, Creator preservation, sync | Same |
| Native JSON export | Absent | Lossless objects, IDs, explicit thread/geometry and marks | Same |
| PNG export | Absent | Drawn on exported raster | Drawn on exported raster |
| OXS export | Absent | Miniature-cross ornaments; imported IDs are local to the new project, OXS carries no tracking | Unsupported; writer returns an affected-object count, UI surfaces warning; native JSON retains objects |
| PDF and PDF-containing ZIP export | Absent / could omit unknown data | Explicit error; use JSON or PNG | Explicit error; use JSON or PNG |
| Material estimates/live stash usage | No model | Live consumption uses half the full-cross linear geometry and tail allowance; captured assumptions persist in consumption events. Shopping estimates are unchanged. | Live consumption measures front plus return path by segment length; captured assumptions persist. Shopping estimates are unchanged. |

## Storage and compatibility

The existing project envelope stays at version 11. An additive independently versioned extension is explicit:

```json
{
  "specialtyVersion": 1,
  "specialtyStitches": [
    {"uid":"object-1","type":"petite","x":0.5,"y":0,"thread":{"id":"310","brand":"dmc","rgb":[0,0,0]}},
    {"uid":"object-2","type":"long_stitch","x1":0,"y1":0,"x2":4,"y2":2,"thread":{"id":"666","brand":"dmc","rgb":[227,29,66]}}
  ],
  "specialtyDone": ["object-1"]
}
```

Coordinates are in chart cells, on a half-cell grid. A petite occupies `[x,x+0.5] × [y,y+0.5]`, and must fit completely. Long endpoints may lie on the closed chart boundary, must differ, and must both fit. Reject non-finite, negative and off-grid geometry and invalid thread colours. IDs are unrelated to colour, index or geometry. New objects use UUIDs, imported objects get deterministic IDs, and missing/duplicate IDs are repaired deterministically without colliding with existing IDs. Persist repaired IDs; marks reference IDs, so coincident objects are independent.

Missing extension fields mean an empty layer, preserving v8-v11 files, compact grids and ordinary quarter/half encodings. Old grid cells explicitly labelled `type: petite` migrate to one top-left miniature cross in that cell, preserving a full-cell done mark on the new object and replacing the old cell with skip. This is the explicit legacy interpretation because that old spelling supplied no quadrant geometry. The migration is idempotent and does not reinterpret `partialStitches` as petites. New PDF extraction refuses geometry-free petite labels instead of creating another ambiguous legacy cell. Older builds do not understand this extension; use the updated application when editing these projects.

Progress summary row version advances from 3 to 4 so existing Home/Stats metadata is recalculated. IndexedDB stores and database version do not change. Unmark operations use the existing causal sync tombstones with an independent mark prefix, and chart fingerprints include specialty objects so geometry edits cannot be mistaken for progress-only changes.

## Progress contract

Full cross = 1 unit; half side = 0.5; quarter = 0.25; **petite object = 0.25; long-stitch object = 0.5**; knot = 1. A long object is one straight stitch, weighted like an existing half-stitch side, independent of length. Its two endpoints do not create two units. Backstitch remains separate and does not enter the percentage. No full-cross leg marking is introduced.

Example: one full cross, two overlapping petites and one long object total **2 units**. Only one petite done gives **12.5%**; one petite and the long done gives **37.5%**. All four objects done gives **100%**. Visibility filters can change the strip's visible-only number, but project completion uses all objects. Deleted IDs and repeated marks do not inflate progress. Home, library, Stats and persisted summaries use the same `ProgressUnits` reader; colour totals include object-only threads.

## Validation evidence

Validation commands and final results are recorded in the draft PR. Automated regressions cover strict boundary geometry, coincident IDs, mark deduplication, weighted totals/percentages, ID repair and reorder stability, resize/crop identity, old-project migration, hidden rendering, colour progress, area unpick and sync tombstones. OXS tests exercise petite round trips, long import and explicit unsupported-export counts. Browser regressions exercise actual Creator/Tracker controls, marking/unmarking and undo/redo, overlapping selection and native persistence/reload.

A separate bug-hunting pass checks double counting, hidden selection, unstable IDs, out-of-bounds geometry and migration. It also checks partial chart repaint, object-only thread rows, progress journalling, schema compatibility and export entry points.
