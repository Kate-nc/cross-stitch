# Phase 1: Trust in saved progress

> **Agent prompt.** You are fixing the stitch tracker in `kate-nc/cross-stitch` so that a
> stitcher's marked stitches are never lost and the app tells the truth about whether they
> are saved. Read [phase-00-working-agreement.md](phase-00-working-agreement.md) in full first
> (performance rule, data homogeneity, conventions, batching, bug hunt), then the findings
> listed below in [reports/tracking-audit.md](../../tracking-audit.md). Do not start Phase 2
> until the user tells you to.

## Goal

After this phase: marks survive refresh, tab close, tab kill and background-tab eviction
(within a stated, small bound); the header badge reflects real save state; two tabs or a
stale tab merge progress instead of forcing "reload or overwrite"; and editing the pattern
after tracking can never silently zero progress.

## Findings in scope

TRACK-01 (Blocker), TRACK-02, TRACK-03, TRACK-12, BUG-06 (stale resume recap), BUG-07 (badge vs
conflict dialog).

## Evidence to reproduce first (all observed in the audit)

Use `reports/tracking-audit/harness/` (`e8.js`, `e11.js`, `e12.js`, `e13.js`, `e9b.js`,
`ed1.js`) or write equivalent Jest/Playwright tests that **fail on current `main`**:

1. Mark 10, wait 6.5 s, mark 10 more, reload at once: expect 20, current result 10.
2. Mark and `page.close({runBeforeUnload:false})` under 1 s later: marks missing.
3. `window.__flushProjectToIDB()` right after marking leaves IndexedDB `done` at the last
   autosave (flush spreads a stale `lastSnapshotRef`). Called before the first autosave it
   writes a record with **no `pattern` and no `done`**; reload then shows "Could not load a
   project on mount" (`hasPattern:false`).
4. Two tabs: A saves, B (stale) shows no notice; B's dialog appears only at B's next save
   and offers only "Keep my edits" / "Reload".
5. Project with `done.length !== pattern.length` loads with 0 done, no message; the recap says
   82% while the strip says 0; autosave then overwrites `done` with zeros.

Root causes (verify in code): `tracker-app.js` autosave effect (~3956, pure 5 s debounce reset
by every `done` change), unload handler (~4015), `__flushProjectToIDB` (~4087, lists fields
explicitly and omits `pattern`, `done`, `bsLines`, `statsSessions`, `parkMarkers`),
`sync-engine.js` ~1850 (`beforeunload` handler calls `writeSnapshot`, which calls
`__flushProjectToIDB`), `header.js` `SaveStatusBadge` (tracker never passes `saveStatus`),
`processLoadedProject` (`project.done.length === restored.length` else zero array).

## Recommended solution (chosen options)

### TRACK-01: make progress durable

1. **Dedicated small `done` record.** On each committed mark (single, drag-commit, range, bulk,
   undo, redo) write only the changed information to a small record owned by `ProjectStorage`
   (for example a `progress` store keyed by project id holding the compressed `done`
   array plus `updatedAt`, `lastWriteTabId`). Throttle to about 250 ms with a **max wait of
   2 s**; a write is one IndexedDB put of a few KB for typical patterns (compress with the
   existing pako usage or store a run-length encoding for 90k-cell patterns; measure).
   Run it off the mark path (after the paint, in a microtask/idle callback). The full 5 s
   snapshot continues to handle everything else, with a **max wait of 10 s** added to its
   debounce so continuous stitching still saves.
2. **Load order:** on project load, read the project record and the progress record;
   use whichever has the newer `updatedAt` for `done` (progress record wins ties). When the
   full snapshot saves it also rewrites `done` in the project record and may keep the
   progress record (cheap) so there is always one consistent copy.
3. **Rewrite `__flushProjectToIDB`** to build the snapshot with `buildSnapshotRef.current()`
   (fresh `done`, `pattern`, sessions) and save that. It must be impossible for it to write
   a record lacking `pattern` or `done`: add a guard in `ProjectStorage.save` (and a unit
   test) that refuses to overwrite an existing record that has a pattern with one that
   does not (log and surface a Toast error).
4. **Unload and hidden:** add a `visibilitychange` (hidden) handler that flushes the
   progress record and finalises the session (this is the only reliable mobile hook), keep
   `pagehide`/`beforeunload`, and remove the sync engine's unload flush from tracker/creator
   pages (or make `writeSnapshot` skip the project flush when the page owns its own
   unload save). Only one writer may write project data on unload.
5. **Bulk edits:** `markColourDone` and range marks must produce one progress write.
6. **Backup and `.csync` export** must read after a real flush (`saveNow()` that resolves
   when IndexedDB has committed). Add a test: mark, immediately export a backup, restore into
   a clean profile, marks present.

*Alternative considered:* a `localStorage`/`sendBeacon` journal of deltas replayed on load
(cheap, covers a kill during a write). Add it only if the dedicated record cannot meet the
acceptance bound on real WebKit; ask the user first.

### TRACK-02: honest save badge

Wire the tracker to the Creator's existing state machine (`creator/saveStatus.js`,
`SaveStatusBadge` props `saveStatus`, `savedAt`, `saveError`, `onRetrySave`): "Editing..." while
dirty, "Saving..." during writes, "Saved just now / N s ago" after, "Save failed" with Retry on
error and quota errors, and an "Unsaved: resolve conflict" state while a cross-tab conflict
is pending. On phones show the icon with an `aria-label` and a title; keep it one small chip.
Do not re-render the tracker per tick: the badge owns its own timer and subscribes to a small
store (see how the Creator does it).

### TRACK-03: merge instead of overwrite, and earlier notice

1. When `saveChecked` detects a conflict (`cross-tab-resolution.js`), **auto-merge tracking
   fields**: `done = remote OR local` per cell (treat 1 as stitched), `halfDone`, `knotsDone`
   and `partialDone` (if present) as unions, `statsSessions` unioned by `id`,
   `achievedMilestones` unioned by key, park markers unioned. Pattern/design fields are not
   auto-merged: if `pattern` differs, keep the existing dialog but reword it. After a merge show a
   Toast ("Merged N stitches from another tab") and update the badge. Document the rule that
   an unmark in tab A can be undone by tab B's older state (acceptable and stated in help).
2. **Earlier notice:** the `cs-project-changed` BroadcastChannel message already exists; use it to
   show a non-blocking banner in the stale tab as soon as another tab saves ("Updated in another
   window. Refresh"), with a one-tap Refresh that reloads state without a page reload where
   possible.
3. **Backup reminder:** add `lastBackupAt` to `UserPrefs`; show "Last backed up N days ago" in the File
   menu backup item and a dismissable reminder after 14 days of activity (reuse the Toast; no
   modal). Cloud sync is out of scope.

### TRACK-12: never silently zero progress

In `processLoadedProject`, when `done.length` differs from the pattern size do **not** create a zero
array silently: snapshot the old `done` into `doneSnapshots` (label "before pattern change")
and show a modal ("This pattern changed since you last stitched it") offering: keep progress
where cells still match, start progress again, or open the previous version. Implement the
cell-matching remap when the old and new dimensions are known (`sW/sH` saved in settings;
offset map for added/removed rows and columns; cells with a different thread are not carried
over). In the Creator, remap `done` on crop, add row/column and resize, and replace the
`alert()` about losing progress with the standard modal. BUG-06: the resume recap must be computed
from the post-reconciliation `done`.

## Files likely to change

`tracker-app.js`, `useStitchCounts.js` (read only), `useDragMark.js` (commit hooks),
`project-storage.js`, `sync-engine.js`, `cross-tab-coord.js`, `cross-tab-resolution.js`,
`header.js`, `creator/saveStatus.js`, `creator/useProjectIO.js`, `creator/useCreatorState.js`,
`backup-restore.js`, `user-prefs.js`, `preferences-modal.js`, `help-drawer.js`, `version.js`,
`sw.js` (if a new script is added), tests. Rebuild `compiled/` and `creator/bundle.js`.

## Acceptance criteria

- **Durability (automated Playwright):** mark 10, reload at +0.2 s: 10 present. Mark 10,
  `page.close({runBeforeUnload:false})` at +0.3 s, reopen: marks present or, if the
  throttle window had not elapsed, loss is at most the **last 2 seconds** of marks and
  never more (document the bound in the PR; the audit's failing case lost everything since the
  last 5 s pause). Open and reload at +0.2 s: the project always opens with its pattern.
- `__flushProjectToIDB()` leaves IndexedDB `done` equal to the on-screen done set and never lacks
  `pattern`; `ProjectStorage.save` refuses to overwrite a patterned record with an unpatterned
  one (unit test).
- A backup or `.csync` taken immediately after marking restores with those marks.
- Continuous marking for 60 s (a mark every 2 s) shows saves at least every 10 s.
- Badge states verified: pending, saving, saved with relative time, error with Retry (force a
  failing put), conflict. Never "All changes saved" while data is dirty or a write failed.
- Two tabs: A marks 10, B marks 5 different cells; both persisted; result 15 with a merge Toast
  and no blocking dialog; the stale tab shows the banner within 1 s of A's save.
- Resize fixture (`ed1`): add a row at the bottom keeps all 1,350 marks; removing a column drops
  only the removed cells' marks; a mismatched load never saves zeros without confirmation;
  the pre-change `done` is recoverable from `doneSnapshots`; the recap shows the reconciled
  figures.
- Existing projects (including legacy `totalTime`-only and `halfStitches`/`knots` fixtures)
  load unchanged and round-trip through Creator, backup and `.csync`.

## Performance guard

Mark-to-repaint latency, 60-move drag time on the 300x300 fixture and load time within 5% of
baseline; the progress write for a 90,000-cell pattern measured and reported (target under 5
ms of main-thread time per write and a payload under 50 KB; if the measure is worse, use run-length
encoding or deltas). No change to what the debounce effect's dependency list recomputes per mark.

## Data and migration statement (include in the PR)

New: a progress record per project (and optional `lastBackupAt` preference). Old builds ignore
the progress record and keep reading `done` from the project record, which the full save still
writes, so downgrade is safe. No migration. Past statistics untouched. The progress store is
included in backup/restore, `.csync` and project delete.

## Suggested batches

1. Reproduction tests, the `ProjectStorage.save` guard, `__flushProjectToIDB` rewrite, unload
   writer unification, max-wait debounce (TRACK-01 core, minimal and safe).
2. Dedicated progress record and load-order logic, visibility save, backup/export flush.
3. Save badge wiring (TRACK-02).
4. Cross-tab merge, earlier banner, backup reminder (TRACK-03).
5. Pattern-change reconciliation and recap fix (TRACK-12, BUG-06), Creator remap.

Each batch: bug hunt, PR, wait for merge. End of phase: full bug hunt, phase report, final PR.

## Phase bug-hunt additions

Chaos test the save path: kill the browser process at random times during a 100-mark drag and
after a bulk "Done"; flip `offline`; fill the quota (fake `QuotaExceededError`); run two tabs
plus the Creator; import a project mid-session; delete a project during an in-flight save
(the `_deletedIds` guard must still win); restore a backup while a tab has unsaved marks.
Confirm sessions (`cs_pending_session_*`) still recover and are not duplicated.
