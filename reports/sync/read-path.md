# Agent 5 — Read Path (Link [5])

## VERDICT: WORKING

Once `executeImport()` is invoked (today: only when the user clicks Apply on
the updates banner), new projects from another device end up in IndexedDB
and the dashboard re-renders to show them. There is no filtering,
deduplication issue, stale cache, or React reactivity bug that would hide
them.

## Findings

1. **Import path** — `sync-engine.js:1107–1380`
   - `prepareImport(syncObj)`: loads local projects + tombstones, runs
     `classifyProjects()` to build a plan
     (`identical | merge-tracking | conflict | new-remote`).
   - `executeImport(plan)`: writes each `new-remote` and resolved
     conflict/merge through `ProjectStorage.save(...)` (line 1230–1242).

2. **No erroneous deduplication for genuinely new projects.** A new project
   from Device A has a unique id and a unique fingerprint, so the
   classifier puts it in `newRemote`. Tombstones only match by id, so
   nothing on Device B will block a brand-new project unless the user
   previously deleted that exact id (sync-engine.js:437–465).

3. **UI refresh is event-driven.** `ProjectStorage.save()` dispatches a
   `cs:projectsChanged` CustomEvent on `window`
   (project-storage.js:329–331). The `/home` dashboard listens
   (home-app.js:1001–1020) and calls `refreshAll()`
   (home-app.js:891–921), which re-queries IndexedDB and rebuilds the
   project list with a fresh array reference (`.slice().sort(...)` →
   `setList(sorted)`), so React notices.

4. **Active project pointer is independent.** `localStorage["crossstitch_active_project"]`
   is not modified by import; new projects appear in the dashboard list
   regardless of which project is currently "active".

5. **Stash and prefs.** `executeImport` also dispatches
   `cs:backupRestored` (home-screen.js:1381) and `cs:stashChanged`
   (home-screen.js:1384) so the stash manager and preference UIs refresh.

## What's NOT in scope of this break

Today the read path is gated behind a manual "Apply" click on the updates
banner. The actual lossy step is upstream in Link [4] (no polling/watch).
Once Agent 4's fix is in place, this path will work end-to-end without
modification.

## Verification

1. Manually call `await SyncEngine.checkForUpdates()` on Device B's
   DevTools console while there is a newer `.csync` from Device A in the
   folder. Expect a non-empty array of update entries.
2. Click Apply on the resulting banner.
3. Observe a `cs:projectsChanged` event firing in the console (add a
   temporary `window.addEventListener('cs:projectsChanged', e => console.log('ok', e.detail))`).
4. The new project card appears on the home dashboard immediately.
