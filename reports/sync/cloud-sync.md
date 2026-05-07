# Agent 3 — Cloud Sync Layer (Links [2] and [3])

## VERDICT: Code is cloud-friendly; no in-app behaviour should prevent the
cloud service from picking up the file.

The File System Access API is used in the textbook
open → write → close pattern. The handle is closed immediately after each
write. There are no `.lock` sidecar files, no advisory locks, no temp-file
rename trickery. Each device writes to its own filename
(`cross-stitch-sync-<name>-<id>.csync`), so cloud "conflict copy" generation
is unlikely.

## Findings

| Concern | Status | Citation |
|---|---|---|
| File handle held open across the session | **No** — opened, written, closed in a single async function | sync-engine.js:1468–1470 |
| `flush()` / `close()` called | Yes — `await writable.close()` | sync-engine.js:1470 |
| `.lock` / sidecar files | None | (search returned 0) |
| Write-then-rename atomic pattern | None — direct in-place overwrite via `createWritable({ keepExistingData: false })` semantics | sync-engine.js:1468 |
| Write frequency | Per save event, debounced 30 s (`AUTO_EXPORT_DELAY = 30000`) | sync-engine.js:1549, 1557 |
| Retry / back-off on failure | **None** — `.catch(e => console.warn(...))`; silent | sync-engine.js:1565–1571 |
| Per-device filename | Yes — collisions impossible | sync-engine.js:1478–1483 |

## Manual checks for the developer

These are outside the app's control and need to be ruled out *before*
blaming the code:

1. **Did the file actually update on Device B?**
   - On Device B, in your OS file explorer, find the file Device A wrote
     (`cross-stitch-sync-<DeviceA-name>-<DeviceA-id>.csync`).
   - Right-click → Properties / Get Info. Note the "Modified" timestamp.
   - Save a new pattern on Device A. Wait ~60 seconds (30 s debounce + cloud
     latency).
   - Refresh and check the timestamp again on Device B. If it did **not**
     change, the cloud service isn't delivering the file. If it **did**
     change, the bug is in Link [4] (Device B not noticing) — see
     `change-detection.md`.

2. **Cloud service health**
   - Tray/menu-bar icon shows "up to date" on both devices?
   - Folder is in the syncing scope (selective-sync not excluding it)?
   - File extension `.csync` not blocked? Try copying a known-good file in
     and renaming to `.json` to test.

3. **File still open by the browser?**
   - Try renaming the `.csync` file while the browser tab is open. If the
     OS allows it, the file is not held open. (We expect the rename to
     succeed.)

## What this layer is NOT responsible for

There is **no in-app file-watcher** that would tell the running app on
Device B that the cloud just downloaded a new version. That is Link [4]
and is the primary break — see `change-detection.md`.
