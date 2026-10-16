# Petite and long stitch lifecycle validation

Starting commit: `563a4e62` (the supplied checkout). Scope and limitations: [capability matrix](../docs/petite-long-lifecycle.md).

## Automated checks

| Check | Result |
| --- | --- |
| `npm test -- --maxWorkers=4` | 341 suites, 4,633 tests and one snapshot passed |
| Targeted final model, progress, OXS and progress-journal tests | 4 suites, 76 tests passed after the final legacy done-bit cleanup |
| Explicit PDF compatibility: `pdfExportSmoke`, `pdfKnots`, `pdfTheme`, `pdfThemePref` | 4 suites, 27 tests passed; includes the real worker's deterministic PK byte comparison |
| Playwright `specialty-lifecycle` and `track-history-accounting`, Chromium, local CDN fixtures | 13 passed: six new lifecycle checks and seven existing history/accounting checks |
| Existing `resize-half-stitches` expansion cases | Both passed |
| Existing `resize-half-stitches` crop cases | Four failures, also reproduced on the untouched starting commit; see below |
| Creator, runtime and import bundle regeneration | Completed; committed generated files |
| Runtime bundle freshness | Passed, including the full suite's subprocess check |
| Terminology lint / whitespace check | Passed |
| CSS token lint | Existing 13 advisory findings; no CSS files changed |

Browser commands used `E2E_LOCAL_CDN=1`, the downloaded Chromium cache selected with `PLAYWRIGHT_BROWSERS_PATH`, and `--project=touch-tablet-chromium --workers=1`. The lifecycle file also uses desktop input for Creator/list selection and a separate iPad Mini touch test. Local servers and browser processes required lifting the execution sandbox's socket restriction. The initial sandbox-only runtime-check failure was a subprocess `EPERM`; the complete suite subsequently passed outside that restriction.

## Lifecycle evidence

- Creation/editing: actual Creator controls add both types, choose different threads, reject a petite at x=chart width, edit a valid boundary petite, select and delete an object, and undo/redo deletion. A long object is created with an endpoint on the closed chart boundary.
- Selection/overlap: two petites at the same coordinates have different IDs and independent list selection and marks. A full cross underneath remains independent. Real chart mouse and touch events mark whole objects. Hidden layers disappear from the list and cannot be marked through object handlers.
- Progress: one full + two petites + one long totals 2 units. One petite = 12.5%; petite + long = 37.5%. Reload preserves the numerator and denominator. Pure model tests verify exact 100% only when all counted work is done, visible-only filtering, duplicate/orphan mark rejection and object-only colour progress.
- History/accounting: mark/unmark and Undo/Redo use the existing history. After End session and reload, the tested sequence records 1 unit added and 0.25 undone, leaving 0.75 done. Existing rapid mixed-stitch, finalised-session, catch-up, midnight and physical-unpick history cases also pass.
- Resize/crop: actual canvas expansion offsets geometry without changing IDs or marks; Undo/Redo restores coordinates and reopening in Tracker retains progress. Strict model tests reject segments or petite crosses outside the new chart, zero-length segments, non-finite and off-grid coordinates. Area-unpick tests remove wholly contained objects and respect thread locks.
- Persistence: native JSON, IDB saves, Creator-to-Tracker handoff, navigation journal records, explicit empty unmark lists and causal sync tombstones preserve the independent marks. Stable IDs survive geometry/thread edits and save/reload; new and imported identities do not derive from thread or position.
- Import/export: OXS petites round-trip twice, including overlapping objects at the bottom-right boundary. Straight/long OXS objects import with explicit thread/endpoints. OXS long export returns an affected-object warning; the UI and ZIP writer warning contract surface it. Real PNG output is decoded and pixel-checked for the petite, long segment and cloth background. The PDF UI and central facade reject unsupported output before starting a worker.
- Compatibility: v8-v11 projects without these fields are unchanged. Old `type: petite` grid cells migrate once to a top-left petite, transfer the mark and clear the old full-cross bit. Missing/duplicate IDs are repaired deterministically. Catalogue-only legacy thread RGB is restored. Unknown future extension versions are rejected before changing live project state.

## Separate bug-hunting pass

Performed after the first implementation, separately from the initial lifecycle walkthrough:

| Risk | Finding and disposition |
| --- | --- |
| Double counting | Kept petites out of `partialStitches` and long objects out of `bsLines`; overlap with a real full cross counts independently. Legacy migration replaces the old grid cell and clears its done bit. Duplicate done IDs cannot inflate units. |
| Hidden but selectable | Shared eligibility checks cover pointer hits, list entries and marking; hidden selection outlines are also omitted. Touch and mouse checks pass. |
| Unstable identities | UUID creation, deterministic import/repair and identity-preserving edits/resize history are covered. Collision repair reserves existing IDs before generating replacements. |
| Out-of-bounds geometry | Strict half-cell validation rejects negative/non-finite coordinates, zero-length segments and incomplete boundary petites. Resize/crop retains only complete geometry. |
| Old-project migration | Idempotent explicit migration; no quarter-to-petite inference. Future schemas fail before UI mutation. Null guarding remains first. |
| Partial repaint | Full-cell fast repaints could erase specialty ink; charts with specialty objects also perform the normal redraw. |
| Object-only colours | Added independent thread palette entries and count labels, avoiding `0/0` full-cross rows. |
| Persistence and unmarking | Added specialty marks to progress journals, Creator preservation, three-way tab merging and causal sync removals; chart fingerprints include geometry. |
| PNG output | Canvas cannot resolve a CSS `var()` colour as its fillStyle; PNG now uses the actual cloth colour so black objects remain visible. |
| External export | New objects reach every active PDF/OXS export context. Unsupported PDF/ZIP output errors explicitly; OXS reports omitted long objects by count. |

## Pre-existing crop failures (left unchanged)

The broader browser run found these existing cases failing:

- `crop left removes both encodings and Undo/Redo saves them together`
- `crop right removes both encodings and Undo/Redo saves them together`
- `crop top removes both encodings and Undo/Redo saves them together`
- `crop bottom removes both encodings and Undo/Redo saves them together`

All four were rerun in a separate detached worktree at **the untouched `563a4e62` starting commit**, with its committed runtime and the same browser/dependencies, on a separate local port. All four fail there as well: the saved `partialDone` still contains `[[22,["BL","TR"]]]` after the quarter/half geometry has been cropped away, whereas the tests expect an empty array. The new specialty resize case and both existing expansion cases pass. No quarter-stitch crop fix or additional stitch feature is included in this PR. The temporary baseline worktree was removed after preserving these results.
