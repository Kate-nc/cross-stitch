# Sync deep-dive: imported patterns are counted but not visible

**Date:** 2026-08-24 · **Branch:** `investigate/sync-import-visibility`
**Symptom:** A pattern is exported on browser A (`.csync`) and imported on device B.
Device B's Pattern Library **count** shows the patterns, but **no pattern cards
render** anywhere in the interface.

**Repro test:** `tests/syncImportVisibility.test.js` (4 tests, all passing —
they reproduce the divergence end-to-end against the real `sync-engine.js`).

---

## 1. Why the count and the cards can disagree at all

The number and the cards come from **two different databases**:

| Surface | Source |
| --- | --- |
| Manager "Pattern Library" badge (`manager-app.js:937`) and stats row (`manager-app.js:1324`) | `stitch_manager_db → manager_state → "patterns"` array (the stash library) |
| Home "Stash" tab Patterns KPI (`home-app.js:1026`) | same stash `patterns` array |
| Visible pattern cards (Manager + Home) | `ProjectLibrary` → `ProjectStorage.listProjects()` (CrossStitchDB `project_meta`, ids starting `proj_`) **plus** stash entries **without** `linkedProjectId` (`project-library.js:60`) |

A stash `patterns` entry that **has** a `linkedProjectId` is *never rendered
directly* — it's assumed to be represented by its linked project's card. So any
stash entry whose linked project is missing from CrossStitchDB is **counted but
invisible**. Nothing in the codebase ever prunes or flags these orphans:
`reconcileAutoSyncedPatterns` (`manager-app.js:192`) only *adds* entries for
unlinked projects and updates titles — it never removes entries pointing at
projects that no longer exist.

## 2. How sync manufactures those orphans

`SyncEngine.mergeStash` (`sync-engine.js:1425-1442`) upserts **every** remote
stash-library entry by id, unconditionally. It does not check whether the
entry's `linkedProjectId` refers to a project that was actually imported (or
declined). Meanwhile the *projects* side of the same import can decline or
lose projects through several independent gates. Whenever that happens, the
import produces: stash entry written (count +1), project absent (cards +0).

### Root cause A — tombstones after "Delete all patterns" (most likely the reported case)

- `ProjectStorage.clearAllProjects({ tombstone: true })`
  (`project-storage.js:764-847`, wired to Settings ▸ "Delete all patterns",
  **fixed to actually delete in v1.0.52**, commit `0b612f8`) writes a tombstone
  for **every** project id and deletes the linked stash entries locally.
- On the next import, `classifyProjects` (`sync-engine.js:991-1008`) declines
  every remote project whose id is tombstoned, unless the remote copy was
  edited **after** the deletion (`remote.updatedAt > deletedAt`). An export
  made before the wipe fails that test for every project.
- But the remote's stash still carries the linked library entries, and
  `mergeStash` writes them all straight back.
- Net effect on device B: **count = N, visible = 0.** Confirmed by test
  *"after 'Delete all patterns' + re-import: count 1, visible 0"*.

The only user-visible trace is a `tombstone-skipped` entry in the Sync
Activity log (`sync-engine.js:2219-2231`) — nothing in the library UI says
"N patterns were declined". The v1.0.52 delete-all fix made this pathway easy
to hit: delete everything on B, re-import from A, get phantom counts.

### Root cause B — the session-delete guard makes `save()` a silent no-op

`ProjectStorage.save()` returns early — **pretending success** — for any id in
`this._deletedIds` (`project-storage.js:392-394`). After "Delete all patterns",
every id sits in that set until the page reloads. Consequences in the same
browser session:

- Even if the user releases a tombstone (`SyncEngine.forgetTombstone(id)`) and
  re-imports, `executeImport` → `save()` silently drops the project and still
  reports it in `result.imported` (`sync-engine.js:2296`), shows the success
  toast, and marks it synced. Nothing lands. Only a reload "fixes" it.

### Root cause C — shape gate rejects compact-format projects

`_isProjectShapeValid` (`sync-engine.js:2944-2965`) requires a top-level
`pattern` **array**. Projects stored in the compact `.p` form (v8 / URL-shared
imports — explicitly supported by `project-storage.js countTotalStitches`,
line 22-25) fail the check. Via the folder watcher, `_partitionPlan`
(`sync-engine.js:3053-3113`) shunts them to manual review; if *all* projects in
a file are rejected, the whole plan waits on the review gate, and when the user
clicks through, only the stash/prefs side effects apply. Confirmed by tests
*"orphaned linked entries also arrive when the project import fails shape
validation"* and *"declined-everything plan still carries the stash side
effects"*.

Related: `buildMeta` (`project-storage.js:135`) computes `totalStitches` only
from `p.pattern` (no `.p` fallback), so a compact project that *does* land
shows 0/0 stitches and is categorised `queued`/`design` on the dashboard.

### Aggravating factor — collapsed dashboard sections

`MultiProjectDashboard` buckets projects by state (`home-screen.js:766-783`);
`paused`, `complete` and the catch-all `design` sections default to collapsed
(`home-screen.js:659-664`). Freshly imported Creator-only patterns infer state
`design` (`home-screen.js:116-123`, when `source === 'creator'` and
`sessionCount === 0`), so even successfully imported patterns can start life
inside a collapsed section — which compounds the "I can't see them" impression.

## 3. Recommended fixes (in priority order)

1. **Surface declined imports in the library UI, not just the activity log.**
   When `plan.skippedTombstoned.length > 0`, show a banner/toast on completion:
   "N patterns were skipped because they were deleted on this device — Restore?"
   with a one-click `forgetTombstone` + re-import.
2. **Make `mergeStash` consistency-aware.** Skip (or strip `linkedProjectId`
   from) remote entries whose linked project is not present locally *and* was
   not imported in the same plan. That kills the phantom count regardless of
   which gate declined the project.
3. **Fix the `save()` silent no-op.** `executeImport` writes should either
   bypass the `_deletedIds` guard (an import is an intentional resurrection)
   or `save()` should throw/return a sentinel so `executeImport` can report a
   real number instead of claiming success.
4. **Prune or badge orphans in `reconcileAutoSyncedPatterns`.** On Manager
   load, entries whose `linkedProjectId` matches no project should be dropped
   (tags include `auto-synced`) or downgraded to manual entries so they at
   least render.
5. **Teach `_isProjectShapeValid` and `buildMeta` about the compact `.p`
   format** (accept `Array.isArray(p.pattern) || Array.isArray(p.p)`), so
   legacy/URL-shared projects sync unattended and show real stitch counts.
6. **(UX) Consider expanding the `design` section** — or a "New from sync"
   grouping — when an import just added projects to a collapsed bucket.

## 4. What was verified working

- The core pipeline on a genuinely fresh device is sound: `prepareImport` →
  `executeImport` → `ProjectStorage.save` writes both the project record and
  its `project_meta` row, fires `cs:projectsChanged`, and the card appears
  (control test passes).
- Ids are minted as `proj_*` everywhere (creator, tracker, import-engine), so
  the `listProjects` prefix filter is not dropping imported projects.
- All exports in production code paths are `mode: "full"` — incremental mode
  exists but is never invoked, so "empty projects array" files are not the
  cause.
- Existing sync suites still pass (142 tests across `sync-engine`,
  `syncResetForResync`, `syncTier1Hardening`).
