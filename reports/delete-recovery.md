# Delete Recovery Options

*Phase 0 report — written before any code changes.*

---

## 1. Overview

`ProjectStorage.delete(id)` is a **hard delete**: it immediately removes the
project from all three stores in `CrossStitchDB` (`projects`, `project_meta`,
`stats_summaries`) within a single IndexedDB transaction. There is no
soft-delete flag, no recycle-bin store, and no server copy. Once the transaction
commits, the only recovery paths are those described below.

> **Do not close, reload, or reset any open tab.** If the deleted project's
> tab is still open in any browser window, the in-memory React state may
> still hold the pattern data. Reloading that tab will destroy the last copy.

---

## 2. Recovery Path A — Toast Undo (still on-screen, ~6 seconds)

Both delete paths show a toast notification with an **Undo** button immediately
after deletion.

| Delete site | File | Undo working? |
|---|---|---|
| Per-project "..." menu or bulk-select ("Delete selected") | `home-screen.js` `doBulkDelete` | **NO — broken** (see [§5](#5-known-bugs)) |
| "Saved Cross-Stitch Projects" inline Delete button | `manager-app.js` inline handler | **Yes** |

If the undo button is still visible on-screen and the delete was triggered from
the **manager.html "Saved Cross-Stitch Projects"** section, click **Undo** now.

If the delete was triggered from the **"..." menu or bulk-select** in the
project dashboard (home-screen.js), the Undo button appears but silently
fails due to bug DEL-BUG-002. Do NOT click it — move on to Path B.

---

## 3. Recovery Path B — Backup file (`.csb` / `.json`)

If the user has previously used **Settings → Export backup** (or the
"Download backup" button in the Stash Manager), a `.csb` or `.json` backup
file was saved to the browser's Downloads folder.

**How to restore:**

1. Open the Stash Manager (`manager.html`).
2. Go to **Settings → Restore from backup**.
3. Select the `.csb` or `.json` file.
4. `BackupRestore.restoreBackup(file)` will:
   - Parse and validate the backup.
   - Restore all `CrossStitchDB` stores (`projects`, `project_meta`,
     `stats_summaries`, `sync_snapshots`) and the Stash Manager's
     `manager_state`.
   - Re-emit `cs:backupRestored` so every open tab refreshes.

**Limitations:** The backup is a point-in-time snapshot. Any work done
*after* the backup was taken will be lost.

---

## 4. Recovery Path C — Exported project JSON

The Creator page offers a **"Download project" / "Export as JSON"** action
(toolbar or File menu). If the user ever downloaded the deleted project as a
`.json` file, it can be re-imported:

1. Open the Creator (`create.html`).
2. Use **File → Import → From JSON file**.
3. Select the `.json` file.

The imported project gets a new `proj_` ID but retains all pattern data,
palette, and stitch history.

---

## 5. Recovery Path D — Another open tab / window

If the deleted project is currently open in a different tab or window (e.g.
the Stitch Tracker on `stitch.html`), **do not reload that tab**.

While the tab is still alive the full `pattern` / `done` arrays live in
React state. The auto-save mechanism (`__flushProjectToIDB`) writes back to
IndexedDB on certain events. To force a save before the data is lost:

1. In the Creator tab: make any minor edit (e.g. paint one stitch and undo
   it). The auto-save will flush the state back to IDB.
2. In the Tracker tab: `window.__flushProjectToIDB && window.__flushProjectToIDB()`
   in the DevTools console will trigger the in-memory save.
3. Then reload the page — the project will reappear in the project list.

---

## 6. Recovery Path E — Stash Manager pattern library entry

When a Creator/Tracker project is linked to a Stash Manager pattern entry
(`linkedProjectId`), the Stash Manager stores the pattern's **metadata**
(title, thread list, fabric count, dimensions) in `stitch_manager_db`.
This metadata survives a `CrossStitchDB` delete because `StashBridge`
only removes the `linkedProjectId` pointer, not the pattern row itself.

**What is saved:** name, thread list, fabric count, dimensions, any notes.  
**What is NOT saved:** the pixel-level pattern grid, stitching progress,
stitch history, thumbnail.

To view it: open the Stash Manager → **Pattern Library** tab. The entry
will appear as an unlinked pattern (no "Open in Tracker" button).

---

## 7. Recovery Path F — `auto_save` legacy key

`ProjectStorage.delete(id)` also deletes the `auto_save` entry if
`autoSave.id === id`. If the deleted project was the **only** project and
was saved under the legacy `"auto_save"` key, all copies are gone once
the transaction commits. There is no additional recovery path beyond
A–E above.

---

## 5. Known Bugs

### DEL-BUG-001 — Hard delete with no soft-delete layer

`ProjectStorage.delete(id)` immediately and irreversibly removes all project
data from IndexedDB. There is no recycle-bin, no tombstone in IDB, and no
purge delay. If the Toast Undo window expires (6 seconds) and no backup
file exists, the project is unrecoverable.

### DEL-BUG-002 — Toast Undo silently fails after dashboard delete

In `home-screen.js` `doBulkDelete`, after calling `ProjectStorage.deleteMany(ids)`,
`ProjectStorage._deletedIds` is populated with the deleted IDs. When the user
then clicks **Undo**, the handler calls `ProjectStorage.save(p)` for each
snapshot — but `ProjectStorage.save()` silently returns early if the ID is
in `_deletedIds`, so the restore is swallowed with no error and no feedback.

**Affected path:** the "..." per-project menu and the bulk-select "Delete
selected" button in `MultiProjectDashboard` (`home-screen.js`).  
**Not affected:** the inline Delete button in `manager-app.js` "Saved
Cross-Stitch Projects" section (that handler correctly calls
`ProjectStorage._deletedIds.delete(fullProject.id)` before saving).

Fix: add `if (ProjectStorage._deletedIds) ProjectStorage._deletedIds.delete(p.id);`
before each `ProjectStorage.save(p)` call in `doBulkDelete`'s `undoAction`.
This is tracked in the accompanying fix commit.

---

## 6. Recommendations for Users

1. **Back up regularly.** Use **Settings → Export backup** at least once per
   session. The `.csb` file is the only reliable recovery path once the
   Toast Undo window expires.
2. **Export individual projects.** Before deleting a project you might want to
   revisit, use **File → Export as JSON** in the Creator to save a portable
   copy.
3. **Use the Undo button immediately** (within ~6 seconds of deletion) while
   it is on-screen — but only if the delete was from the inline Delete button
   in the Stash Manager "Saved Projects" section (the only working undo path
   before the DEL-BUG-002 fix is applied).
