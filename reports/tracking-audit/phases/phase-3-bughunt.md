# Phase 3 bug hunt log

Per-batch hunts are in the PR descriptions and in `phase-3-progress.md` ("Review fixes", "Found on the way"). This file is the end-of-phase hunt, run on `main` after all five batches merged (PRs 288 to 292).

## Exercised

New browser specs `tests/e2e/phase3-hunt.spec.js` (5) and `phase3-hunt-clock.spec.js` (1), then the Phase 2 and Phase 3 specs, `cross-tab-merge` and `progress-units` together (71 passed, 1 flaky that passed on retry; see below).

| Scenario (from the phase prompt) | Result |
|---|---|
| Delete the first session, then the last, then every session | Pass. No NaN, undefined or Infinity text at any step; the journal says "No sessions recorded yet"; the summary row reads 0 stitching days and 0 sessions; the 270 stitches themselves stay marked; project Stats, global Stats, Home Stats and Home all open with no page errors |
| Delete or edit a run that crossed midnight (records sharing a `groupId`) | Pass. Deleting either part removes both and Undo brings both back; editing one day changes that day only and later totals follow |
| Timer left running across midnight (clock faked to 23:50) | Pass. Saved as two records with one `groupId`, both `timer`, one per day, units add up to the stitches marked, minutes add up to the run |
| Backgrounded tab, device sleep, project switch while running | Covered by the batch 2 specs (a clock jump past the idle time asks "Forgot to stop?", leaving or switching project ends the session at the last stitch under the right project). Not repeated here |
| Two tabs both deleting sessions | **Found a bug, fixed** (below) |
| Project saved before the new fields (no `units`, `timingBasis`, `groupId`) | Pass. Opens, labelled estimated, can be edited (marked edited) and deleted, later totals rebuilt |
| Global Stats and Home after history edits | Pass: the summary row is rewritten by the same save, and the pages read it after navigation. Not tested live across two open pages (they read on load) |
| Restore an old backup | Same reader as the legacy-project test (sessions with `netStitches` only); the import file path itself was not driven. Known limit from batch 1 stands: restoring a backup brings back sessions deleted since |

## Bugs found

- **Fixed here: a session deleted in one tab made the other tab ask "Project changed in another tab" with "Keep my edits".** Choosing that overwrote the other tab and brought the deleted session back. Cause: `deletedSessionIds` was missing from the fields the cross-tab merge skips (`NOT_COMPARED` in `tracking-merge.js`), so a changed tombstone list made `whyNot` refuse to merge, although `mergeRemoteProject` already unions tombstones and removes the deleted sessions. Reproduced first (the new two-tab spec failed on the dialog), then fixed (passes; a unit test pins that a remote tombstone is mergeable). Copilot then pointed out that unioning tombstones would lose an Undo made in the deleting tab (the receiving tab kept its tombstone and could delete the session again); tombstones now merge three ways like the other sets (`TM.mergeSet`), with a two-tab Undo test that fails on the union and passes now.
- **Not a bug, noted:** the Session editor edits minutes, stitches and note, not the date, so "edit across a day boundary" means editing a record of a run that crossed it.

## Not verified

Safari and Firefox; real devices; a time zone change mid-session; restoring a backup file through the import screen; live updates of an already-open Home page after an edit in another tab (it reads on load).

## Flaky

`phase3-batch2` "leaving the page with a timer left idle" failed once in the long run and passed on retry; it passed 3 repeats earlier and has a polling wait. Left as flaky, not diagnosed further. Still open from earlier: intermittent `save-durability` (not seen this run), two stale `creator-touch` specs.
