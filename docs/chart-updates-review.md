# Chart update matching and recovery review

The Home action targets an explicit existing project ID. The existing importer
runs recognition and page-arrangement review; an `onReviewedProject` handoff
bypasses creation, saving and navigation. Multi-design booklet updates stop.
The second review produces dimensions, additions, changes/deletions, retained
completion, individual ambiguities, archived annotations and a downloadable diff.

## Matching contract

- Coordinates are zero-based cells. Replacement offsets map old to new;
  append offsets place incoming content on the existing canvas. Old rectangles
  provide separate offsets for insertions. Overlapping mapping rectangles stop.
- Match stitch kind, geometry, half direction / quarter position, thread brand,
  ID and blend composition. Palette order, display symbols, imported completion,
  and page ordinal are not matching keys. Unassigned symbol placeholders require
  decisions. No content-based origin guessing is performed.
- A unique geometry/material match retains completion, object UID and consumption
  identity. Coincident ambiguous objects require explicit one-to-one choices.
  Two old stitches cannot transfer onto one target. Changed threads require
  transfer acceptance or archival; removed content requires archival. Identical
  grid/line/knot overlaps coalesce; conflicting page content needs keep/incoming.
- Geometry crossing differently shifted regions is archived for manual repair.
  Boundary coordinates are not clamped. Malformed grids and out-of-bounds
  specialty objects stop for source repair.
- Notes and sessions stay with the project. Parking markers and breadcrumbs follow
  confirmed offsets; displaced/unknown coordinate annotations need archival.
  Prior edit, snapshot and area/focus caches need acknowledgement and are archived.
  The running edit/mark undo stacks are not reused: updates occur from Home.

## Commit and recovery

The transaction compares the exact stored project, progress overlay and session
journal against the preview token. Project, meta/stat summaries, progress fence,
source file, before/after project records and recovery snapshot commit together.
Failure or stale review publishes nothing. An unfinished session blocks updates.
Ordinary Creator/Tracker saves carry a chart revision; stale editors cannot replace
an updated chart. Explicit backup/sync writes retain their existing reviewed paths.

Snapshots are local `pendingImports` records prefixed `chart-update:<projectId>:`.
They are not swept as transient import drafts and are not portable backup/sync
attachments. The UI downloads native pre-update projects and incoming sources.
Sources already embedded in projects remain in snapshots. Rollback is separately
reviewed, checks the current token, snapshots the current project, and atomically
restores the selected project's earlier state with a fresh revision. Inventory and
immutable consumption events are never rewritten by update or rollback.

Matched stitches retain durable accounting keys through coordinate and UID
changes; new stitches receive revision-qualified keys. Loading migrated completion
establishes the Tracker's last-marks state and does not create mark events. Future
correction/unpick operations still address the original consumption history.

## Validation and separate bug hunt

Unit/storage/import-handoff tests cover appended and inserted pages, positive and
negative origin shifts, overlapping pages, symbols, palette order, substituted
threads/brands/blend ratios, deletion, identical re-imports, notes, parking markers,
partial halves/quarters, backstitch, knots, beads, petite and long stitches.
Failure injection covers errors after snapshot scheduling and during rollback;
retries retain the original base. Concurrent notes/progress and old-editor writes
are rejected. Existing and migrated inventory event identities remain idempotent.

A separate bug-hunting pass added regressions for exclusive rectangle boundaries,
segments crossing shifted interiors, many-to-one mappings, repeated additions
reusing specialty UIDs, clipped annotations, unresolved symbol placeholders and
rollback failures. Random rectangular shifts check coordinate preservation across
80 generated cases. Browser smoke exercises the Home action, alignment/ambiguity
gates, applying a source File, downloading recovery entries and reviewed rollback.

The feature uses existing import coverage; unsupported source objects still need
repair/re-export. Added-page placement is non-negative; use a corrected full chart
to move the canvas origin. Region mapping is an advanced JSON control, not automatic
page recognition. Large ambiguous changes may require many explicit decisions.
