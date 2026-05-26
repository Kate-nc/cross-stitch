# Delete Wrong-Target Bug — Diagnosis Report

*Phase 1 report. Read [delete-recovery.md](./delete-recovery.md) first if
you are trying to recover an already-deleted project.*

---

## 1. Symptom

Clicking **Delete** on a specific project in the project dashboard
(home-screen.js `MultiProjectDashboard`) or the Stash Manager
"Saved Cross-Stitch Projects" list deletes the **most recently
edited/opened project** instead of the project in the clicked row.

The symptom is identical to the navigation bug documented in
[edit-track-navigation-bug.md](./edit-track-navigation-bug.md).

---

## 2. Delete Code Paths

There are exactly **two** user-facing delete paths in the application:

| Path | File | Trigger |
|---|---|---|
| A | `home-screen.js` `doBulkDelete` | "..." per-card menu → "Delete project…", or bulk-select "Delete selected" |
| B | `manager-app.js` inline handler | "Saved Cross-Stitch Projects" → "Delete" button |

Neither `creator-main.js` nor `tracker-app.js` contains a
`ProjectStorage.delete()` call — there is no delete action inside the
Creator or Stitch Tracker pages.

---

## 3. Code Trace — Path A (home-screen.js)

```
openMenu(proj)                          // "..." button click
  → setMenuProj(proj.id)               // stores the clicked row's ID
  → re-render: menuProj === proj.id
      → StateChangeMenu({ proj, onDeleteSingle: handleSingleDelete })
          → user clicks "Delete project…"
          → onDeleteSingle(proj)        // proj is the map-iteration binding
              → handleSingleDelete(proj)
                  → setConfirmDelete([proj.id])   // explicit per-row ID
  → BulkDeleteModal shown (lists proj.name for confirmation)
  → user clicks "Delete N project(s)"
  → doBulkDelete()
      → ids = confirmDelete.slice()    // [proj.id]
      → ProjectStorage.deleteMany(ids)
```

`proj` is a `function(proj)` map-callback parameter — a new binding per
iteration. `setConfirmDelete` captures `proj.id` before any state change.
**No step in this path reads `getActiveProjectId()` as the deletion target.**

---

## 4. Code Trace — Path B (manager-app.js)

```
storedProjects.map(p => { ... onClick: async () => {
  await ProjectStorage.delete(p.id);   // p is the arrow-fn map parameter
}})
```

`p` is an arrow-function map parameter — correctly scoped per iteration.
**No step reads `getActiveProjectId()` as the deletion target.**

---

## 5. Root Cause Analysis

### 5.1 No wrong-target delete bug in current code

After tracing both paths in full, **the current code routes to the correct
project ID in all delete operations**. Neither path falls back to the
`crossstitch_active_project` localStorage pointer as the delete target.

### 5.2 Why the symptom was (is) observed

The most probable explanation is an **indirect interaction with the
navigation bug** (documented in `edit-track-navigation-bug.md`):

1. The navigation bug caused Track/Edit buttons to open the **wrong**
   project — always the most-recently-edited one (project A) instead of
   the clicked row's project (project B).
2. When a user visited project A via the broken Track/Edit button, project A
   became the "most recently touched" project and moved to the **top of the
   sorted active list** (sorted by `lastSessionDate || updatedAt`).
3. The user returned to the dashboard intending to delete project B. But the
   list had **silently reordered**: project A was now row 1 and project B
   was row 2. If the user clicked the "..." on what they believed was
   project B (remembering it as "second in the list"), they were actually
   clicking on project A's row.
4. The delete confirmed and removed project A — the most recently edited
   project — exactly matching the symptom.

The navigation bug has been fixed (three-layer belt-and-suspenders pattern:
`setActiveProject` + `window.__navigatingAway` + `?id=` URL param — see the
companion report). With that fix applied, the list should no longer silently
reorder as a side effect of clicking Track/Edit, and the wrong-target symptom
should cease.

### 5.3 Confirmed bugs that remain

Even though the wrong-target route through `getActiveProjectId()` does not
exist, two real bugs were found during the investigation:

| ID | File | Description |
|---|---|---|
| DEL-BUG-001 | `project-storage.js` | Hard delete — no soft-delete / recycle bin. Data is irrecoverable once Toast Undo expires. |
| DEL-BUG-002 | `home-screen.js` `doBulkDelete` | Toast Undo **silently fails**: `undoAction` calls `ProjectStorage.save(p)` but does not call `ProjectStorage._deletedIds.delete(p.id)` first. `save()` guards against IDs in `_deletedIds` and silently no-ops, so the restore is swallowed with no error or feedback. |
| DEL-BUG-003 | `home-screen.js` `BulkDeleteModal` | Modal copy says "This cannot be undone" but a Toast Undo button is shown immediately after deletion (though it is broken per DEL-BUG-002). The text is factually correct today but will become misleading once DEL-BUG-002 is fixed. |

DEL-BUG-002 also means a user who *did* accidentally delete the wrong
project has **no way to recover** via the Undo button even within the
6-second window, compounding the impact of any wrong-target deletion.

---

## 6. Fix Plan

### Phase 2 — Fix DEL-BUG-002 (undo silently fails)

In `home-screen.js` `doBulkDelete`, inside the `undoAction` callback,
add `ProjectStorage._deletedIds.delete(p.id)` before each
`ProjectStorage.save(p)` call. This mirrors the already-correct pattern
in `manager-app.js`'s inline handler.

### Phase 3 — Fix DEL-BUG-003 (misleading modal copy)

After DEL-BUG-002 is fixed, update the `BulkDeleteModal` body text from
"This cannot be undone" to reflect the 6-second undo window.

### Phase 3b — Guard: confirmation dialog already names the target

`BulkDeleteModal` already lists up to 5 project names before the user
confirms (implemented in fix-3.5). This is the primary safeguard against
wrong-target deletion — the user can verify the name before clicking
"Delete N project(s)".

### Considered but deferred — soft-delete / recycle bin

Adding a `deleted: true` flag to project metadata and a "Recently deleted"
section would make DEL-BUG-001 a non-issue. This is a larger change and is
deferred to a future iteration. The immediate priority is fixing the broken
Toast Undo so users at least have the 6-second recovery window.

---

## 7. Regression Coverage

See `tests/multiSelectDashboard.test.js` for existing source-level contracts
on `doBulkDelete`, `handleSingleDelete`, `handleBulkDelete`, and the
`BulkDeleteModal`. New tests for the undo fix are added in
`tests/deleteUndoGuardrail.test.js` (Phase 4).
