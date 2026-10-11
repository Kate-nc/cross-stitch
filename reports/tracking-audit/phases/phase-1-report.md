# Phase 1 report: save safety

Status: all batches merged except this closing PR (end-of-phase bug hunt, fixes it found, this report). Phase 2 has not been started and will not be until you say so.

## What shipped

| PR | Batch | Findings | Outcome |
|---|---|---|---|
| #275 | 1: durable marks | TRACK-01 | Marks survive refresh, tab switch, hard close, Backup and Sync flush; a patternless record can no longer overwrite a patterned one; backups were empty because of a wrong database version and now contain projects |
| #276 | 2: progress record | TRACK-01 | A small separate record written every 0.4 s, believed only while newer than the project record; marks safe within about half a second |
| #277 | 3: honest save badge | TRACK-02, BUG-07 | Saving / Saved just now / Save failed with Retry / Not saved yet; per-project epochs; 13 persisted fields that never triggered a save now do |
| #278 | 4: cross-tab merge | TRACK-03 | Marks, half stitches, knots and sessions from two tabs are combined; the question is asked only when the other tab changed more than marks |
| #279 | 5: backup reminder | TRACK-03 (rec. 3) | "Last backed up N days ago" in the File menu; one offer per session after 14 days |
| #280 | 6: pattern changed after stitching | TRACK-12, BUG-06 | Never zeroes silently: keep where cells match / start again / leave; nothing written while the question is open; snapshot of the earlier marks; recap waits for the kept figures |
| this PR | closing | end-of-phase hunt | Restore no longer undone by the open page; "Keep my edits" answers once |

Version entries 1.0.106 to 1.0.112 are in the in-app changelog; help text covers saving, save status, two tabs, backup reminder and pattern changes.

## Acceptance criteria against the prompt

| Criterion | Result |
|---|---|
| Mark 10, reload at +0.2 s: 10 present | Pass (e2e `save-durability`) |
| Hard close at +0.3 s: marks present | Pass, via the progress record (loss bound: marks made in the last ~0.4 s) |
| Open and reload at +0.2 s: always opens with its pattern | Pass |
| `__flushProjectToIDB()` leaves stored marks equal to the screen, never lacks the pattern; save refuses patternless overwrite | Pass (unit + e2e) |
| Backup or `.csync` right after marking restores those marks | Backup: pass. `.csync` shares the same flush; not separately exercised in a browser |
| Continuous marking: saves at least every 10 s (20 s over 40,000 stitches) | Pass (unit/source + e2e) |
| Badge states incl. error with Retry and conflict | Pass |
| Two tabs: A marks 10, B marks 5 different cells: 15, merge Toast, no dialog | Pass (e2e). The "stale tab shows a banner within 1 s" part was dropped on purpose: with the merge the other tab's save needs no decision |
| Resize: add a row keeps all marks; remove a column drops only removed cells' marks; mismatch never saves zeros without confirmation; old marks recoverable; recap shows kept figures | Pass (e2e `pattern-change`), with the stated limit that only bottom/right changes can be remapped |
| Existing projects round-trip | Pass (unit suites unchanged and green) |

## Bug hunt (end of phase)

Exercised, with results in `phase-1-bughunt.md`:
- **Restore while the Tracker has unsaved marks: FOUND AND FIXED.** The restore wiped the database and reloaded the page; the open Tracker's unload save wrote its old project straight back over the restored one (20 marks on screen, backup held 10; the page won). A short-lived mark, set by `restore()` and checked by `ProjectStorage.save`, `saveProgress` and the legacy auto-save, now stops every writer; it expires on its own so a restore that does not reload cannot leave saving off.
- **"Keep my edits" asked twice: FOUND AND FIXED.** Answering the broadcast question did not record the remote write as seen, so the next save looked stale and asked again. It now notes it as seen.
- **Disk full (QuotaExceededError on every put):** marking keeps working, the progress record fails quietly, a later save lands once space returns. No code change needed.
- **Offline:** marking and saving work (everything is local). Service worker is blocked in the test browser, so offline reload from cache was not exercised.
- **Creator rename while the Tracker holds marks:** the Tracker keeps its marks and asks; Keep my edits writes 15.
- Pre-existing, not from this phase, found on the way: the Tracker's daily automatic snapshot has never saved (it calls `getStitchingDateLocal`, defined only inside `useAutoSession`, inside a swallowed try/catch). Left for Phase 3 (history).
- One browser test (`save-durability`, second drag after the first autosave) is intermittent, about 1 run in 6 to 12. I ran the same test on the commit before Phase 1 began and it failed there at a similar rate (1 in 12), so it is not a regression; the second drag occasionally marks nothing. Not yet diagnosed.

## Performance

Measured on the 300x300 fixture after batch 3 (within run-to-run noise): load to drawn chart 1,346 to 1,740 ms (baseline 1,513 to 1,719), 60-move drag 1,176 to 1,314 ms (baseline 1,215 to 1,340). Batches 4 to 6 add work only on a cross-tab conflict, on a size-mismatched load, and a few localStorage reads per session; the mark and paint path is untouched, but I did not re-run the numbers after batch 3, so that is reasoned, not measured.

## Decisions you may want to revisit
- Folder sync does not count as a backup for the reminder.
- Kept marks after a size change assume the change was at the bottom or right edge (the dialog says so); "open the previous version" is not offered because no previous pattern is stored.
- Knots alone do not trigger the pattern-change question (their keys are lattice positions).
- Marks are merged across tabs, but `doneSnapshots` are not.

## Not verified
Safari and Firefox (BroadcastChannel, IndexedDB under unload, Overlay focus trap), real iOS storage eviction, screen-reader behaviour of the save badge and the new dialog, `.csync` round trip in a browser, three or more tabs.

## Open questions for you
1. Phase 2 next as written, or reorder (the unpick-area and history features in Phases 3 and 6 interact with the snapshot fix)?
2. Should the daily automatic snapshot fix go into Phase 2 as a quick bug fix instead of waiting for Phase 3?
3. Is a once-per-session backup reminder in the Tracker enough, or should Home show it too?
