# Sync 1 — Architecture Map

> Read-only audit. No code changes. Purpose: build a complete mental
> model of the current sync system before Phase 2 design work.

## TL;DR

The app has a **device-scoped file-based sync** model that relies on
a third-party shared drive (OneDrive, Google Drive, Dropbox, iCloud)
to physically distribute files between machines. The app itself only
reads/writes files; it does not push, pull, or talk to any server.

Each device writes **its own `.csync` file** named after its device
ID into a user-chosen folder, and reads every other device's `.csync`
file from the same folder. There is **no shared state file**, no
canonical "projects.json", and no merge that runs unprompted — every
import is gated behind a "Sync Summary" modal.

| Aspect                  | Reality |
|-------------------------|---------|
| File system access      | File System Access API (showDirectoryPicker), opt-in, persisted in IndexedDB |
| Permissions             | Re-prompted on every page load (browser limitation) |
| On-disk format          | One pako-deflated JSON blob per device (`.csync`), ~50–500 KB |
| Local source of truth   | IndexedDB (`CrossStitchDB`) — sync folder is a peer/snapshot |
| Read trigger            | App startup if folder is configured + manual "Check for updates" |
| Write trigger           | Manual download, manual "Export to folder", or 30 s debounced auto-export after a save |
| File watching           | None — no FileSystemObserver, no polling |
| Identity                | Project ID (`proj_<ts>_<rand>`) + per-device UUID in localStorage |
| Conflict resolution     | Per-project, user-driven via modal: keep local / keep remote / keep both |
| Atomic writes           | **No** — uses `createWritable()` + `write()` + `close()` (truncate-in-place) |

---

## 1. File system access

### API used

[sync-engine.js](../sync-engine.js#L671) calls
`window.showDirectoryPicker({ mode: 'readwrite' })` from
[home-screen.js](../home-screen.js#L1300). This is the **File System
Access API**, which is Chromium-only at time of writing (Chrome,
Edge, Opera, Brave; **not** Safari, **not** Firefox).

Capability detection:

```js
function hasFolderWatchSupport() {
  return typeof window.showDirectoryPicker === "function";
}
```
[sync-engine.js#L820](../sync-engine.js#L820)

When unsupported, the UI falls back to a manual `.csync`
download/upload flow — the user moves files between devices by
hand using their cloud drive's web UI.

### Permissions

Permissions are checked with
`dirHandle.queryPermission({ mode: "readwrite" })` and re-requested
with `requestPermission` if needed. See
[sync-engine.js#L760](../sync-engine.js#L760) (`exportToFolder`) and
[sync-engine.js#L780](../sync-engine.js#L780) (`scanFolder`).

**Browser-level limitation:** stored `FileSystemDirectoryHandle`
objects need an explicit user gesture to re-grant write permission
in most browsers. The auto-export path is aware of this and silently
no-ops if permission isn't already granted:

> [sync-engine.js#L860](../sync-engine.js#L860)
> "auto-export skipped — permission not granted (re-open sync panel
> to re-authorise)"

### Persistence of access

The directory handle is persisted in a dedicated IndexedDB database
`cross_stitch_sync_meta` (object store `sync_state`, key
`watchDirHandle`). See [sync-engine.js#L735](../sync-engine.js#L735).

This means the user does **not** re-pick the folder on every page
load — but they **do** need to re-grant permission, because Chromium
doesn't auto-grant readwrite to a stored handle without a recent
user gesture.

### What happens if the folder moves / is deleted / permission revoked

- **Folder deleted**: `scanFolder` and `exportToFolder` reject. The
  UI surfaces the error string in `setSyncResult({ type: 'error' })`
  ([home-screen.js#L1340](../home-screen.js#L1340)). The handle is
  **not** cleared automatically — next page load will silently
  re-fail.
- **Permission revoked**: same as above, plus auto-export silently
  no-ops with a console warning.
- **Folder moved**: the handle still resolves to the old path (file
  system handles are inode-like, not path-like), so this generally
  works on macOS/Linux. On Windows the handle becomes invalid.

---

## 2. Data format on disk

### Files written

For each device, **one** file:

```
cross-stitch-sync[-<deviceName>]-<deviceId>.csync
```

Naming code:
[sync-engine.js#L770](../sync-engine.js#L770)

```js
var fileName = "cross-stitch-sync" + namePart + "-" + idPart + ".csync";
```

Examples:
- `cross-stitch-sync-Tablet-dev_1729e_8f3a.csync`
- `cross-stitch-sync-MacBook_Pro-dev_1730a_19b2.csync`

There is **no manifest file**, **no shared/canonical file**, and
**no separate stash file**. Everything for a device is in its one
`.csync`.

### Format

Each `.csync` is **pako-deflated UTF-8 JSON** of a single object:

```jsonc
{
  "_format": "cross-stitch-sync",
  "_version": 1,
  "_createdAt": "2026-04-29T12:34:56.789Z",
  "_deviceId": "dev_1729e_8f3a",
  "_deviceName": "Tablet",
  "_mode": "full",                  // or "incremental"
  "_since": null,                   // or ISO timestamp
  "_projectCountTotal": 7,

  "projects": [
    {
      "id": "proj_1712345678_a1b2c",
      "updatedAt": "2026-04-28T09:00:00.000Z",
      "fingerprint": "fp_80x80_789a45...c2_1024",
      "data": { /* full project object — see below */ }
    },
    ...
  ],

  "stash": {                        // optional
    "threads": { "310": { owned: 2, tobuy: false, ... }, ... },
    "patterns": [ { id, name, ... }, ... ],
    "userProfile": { ... }
  },

  "prefs": {                        // opt-in only
    "crossstitch_active_project": "proj_...",
    "crossstitch_custom_palettes": "[ ... ]"
  }
}
```

### Project payload

Each `projects[i].data` is a full v8 project object — see
[.github/copilot-instructions.md](../.github/copilot-instructions.md):

```jsonc
{
  "v": 8,
  "id": "proj_1712345678_a1b2c",
  "name": "Cottage Garden Sampler",
  "createdAt": "2026-03-01T12:00:00Z",
  "updatedAt": "2026-04-28T09:00:00Z",
  "w": 80, "h": 80,
  "settings": { "sW": 80, "sH": 80, "fabricCt": 14 },
  "pattern":  [ ... w*h cells ... ],
  "done":     [ ... w*h ints ... ] | null,
  "halfStitches": {}, "halfDone": {},
  "parkMarkers": [], "totalTime": 12345,
  "sessions": [], "statsSessions": [], "achievedMilestones": [],
  "threadOwned": {},
  "syncMeta": { "lastSyncedAt": "...", "syncVersion": 3 }
}
```

The pattern array is the largest field — for an 80×80 pattern that
is 6 400 cell objects. Worst case in this app (200×300) is 60 000
cells. Compressed `.csync` files typically run **50–500 KB**.
A "DMC 3-page Pattern" sized project (~120×180) compresses to ~150 KB.

### Schema versioning

Top-level: `_format` and `_version` (currently `1`). Any other
version triggers `validate()` to reject:
[sync-engine.js#L300](../sync-engine.js#L300)

```js
if (syncObj._version !== SYNC_VERSION) {
  return { valid: false, error: "Unsupported sync file version: ..." };
}
```

There is **no migration path**. A device on an older app version
sees a sync file from a newer version and gets a hard error.

### Metadata files

**None.** No README, no manifest, no `.lock` file, no version
marker file at folder level. The folder is just a directory of
device-suffixed `.csync` blobs.

### Human-readability

Files are pako-deflated binary. A user inspecting the folder sees
opaque blobs — they cannot diff, recover from a partial corruption,
or hand-edit a file.

---

## 3. Local storage

### Primary store: `CrossStitchDB` (IndexedDB v3)

[project-storage.js](../project-storage.js) — three object stores:

| Store              | Key             | Value                                          |
|--------------------|-----------------|------------------------------------------------|
| `projects`         | `proj_<id>` or `auto_save` | Full v8 project object              |
| `project_meta`     | `proj_<id>`     | Lightweight metadata (name, dimensions, totals)|
| `stats_summaries`  | `proj_<id>`     | Stats summary (palette, sessions, milestones)  |

### Secondary store: `stitch_manager_db` (v1)

Object store `manager_state` keys: `threads`, `patterns`,
`userProfile`. See `readManagerStore` at
[sync-engine.js#L100](../sync-engine.js#L100).

### Sync metadata: `cross_stitch_sync_meta` (v1)

Object store `sync_state`, key `watchDirHandle` — the persisted
directory handle.

### localStorage keys touched by sync

| Key                              | Purpose                          |
|----------------------------------|----------------------------------|
| `cs_sync_deviceId`               | Per-device UUID                  |
| `cs_sync_deviceName`             | User-facing device label         |
| `cs_sync_lastExportAt`           | ISO timestamp of last export     |
| `cs_sync_lastImportAt`           | ISO timestamp of last import     |
| `cs_sync_folderAutoSync`         | "1" or absent (boolean)          |
| `crossstitch_active_project`     | Pointer to active project ID     |
| `crossstitch_custom_palettes`    | (only if user opts into prefs sync) |

### Relationship between local and sync folder

The sync folder is **a snapshot**, not a live mirror. Local
IndexedDB is the source of truth at all times. The .csync file
lags behind:

- After a save in the Creator, IDB is updated immediately. The
  .csync file is updated 30 seconds later by the debounced
  auto-export ([sync-engine.js#L850](../sync-engine.js#L850)).
- Imports always go IDB ← .csync. The import pipeline never
  modifies the .csync file as a side effect.

### Can the app run without sync?

Yes. The folder watch is entirely opt-in. With no folder
configured, `triggerAutoExport` early-returns
([sync-engine.js#L848](../sync-engine.js#L848)) and no sync UI
elements show beyond "Choose sync folder". The app is a
local-first PWA; sync is bolted on top.

---

## 4. Read/write patterns

### Reads

| Trigger                          | Code path                        |
|----------------------------------|----------------------------------|
| Page load (Home)                 | [home-screen.js#L1195](../home-screen.js#L1195) — `getWatchDirectory().then(checkForUpdates)` |
| Manual "Check for updates" button| [home-screen.js#L1346](../home-screen.js#L1346) — `SyncEngine.checkForUpdates()` |
| Manual `.csync` upload           | [home-screen.js#L1257](../home-screen.js#L1257) — `readSyncFile(file)` |
| Header File menu "Import .csync" | [header.js#L660](../header.js#L660)         |

There is **no file watcher**. No `FileSystemObserver`. No timer.
No focus/blur listener. The app does not notice when the cloud
drive drops a new file into the folder unless the user revisits
the Home page or clicks "Check for updates".

### Writes

| Trigger                          | Code path                        |
|----------------------------------|----------------------------------|
| `ProjectStorage.save()` (debounced) | [project-storage.js#L249](../project-storage.js#L249) → `triggerAutoExport()` → 30 s timer → `exportToFolder` |
| Manual "Export to folder"        | [home-screen.js#L1336](../home-screen.js#L1336) |
| Manual download                  | [home-screen.js#L1244](../home-screen.js#L1244) — produces a downloadable file |
| Header File menu "Export .csync" | [header.js#L643](../header.js#L643)             |

The auto-export is **debounced**, not coalesced — every save
restarts the 30 s timer. A burst of 100 saves in 5 minutes still
results in one write.

### Read while writing

There is **no locking**. If a user clicks "Check for updates"
while a debounced auto-export is in flight, both run concurrently:

- `checkForUpdates` reads files but *not* the file we are writing
  (it filters out our own deviceId early —
  [sync-engine.js#L817](../sync-engine.js#L817)). So self-read
  during self-write isn't a concern.
- But if **another device's** file is being uploaded by the cloud
  drive at the moment we read, we might decompress a partial blob
  and bail with "Could not decompress sync file. It may be
  corrupted." The error is *swallowed* in `scanFolder`:
  > [sync-engine.js#L808](../sync-engine.js#L808): `console.warn("SyncEngine: skipping unreadable file:", entry.name, e)`

So a partial file silently disappears from the "updates" list and
will reappear on the next refresh once it's complete. This is
benign-but-invisible — a user will not know their other device's
file is still en route.

### Atomic writes

**No.** [sync-engine.js#L777](../sync-engine.js#L777):

```js
var writable = await fileHandle.createWritable();
await writable.write(compressed);
await writable.close();
```

`createWritable` truncates the file immediately. If the page is
closed mid-write, the file is left truncated/empty. Next read
errors with "could not decompress" and the file is silently
skipped — but **also** no longer reflects the device's actual
state. Worse, on Chromium, a partially-written file is what gets
uploaded by the cloud drive to other devices.

---

## 5. Identity & deduplication

### Project IDs

`ProjectStorage.newId()` produces `proj_<Date.now()>_<5 chars random>`.
[project-storage.js#L420](../project-storage.js#L420). Collisions are
extremely rare but possible if two devices independently create
projects at the same instant; the random suffix is intended for
double-clicks within the same millisecond, not cross-device.

### Device IDs

`SyncEngine.getDeviceId()` produces `dev_<Date.now()>_<6 chars random>`,
stored in `localStorage` under `cs_sync_deviceId`.
[sync-engine.js#L29](../sync-engine.js#L29). Persisted across pages,
**not** persisted across browsers, profiles, or browser-data clears.

### How "same project" is determined

Strictly by **project ID**. See `classifyProjects`:
[sync-engine.js#L320](../sync-engine.js#L320).

```js
var local = localProjectsMap[remote.id] || null;
```

There is **no name-matching, no content-matching, no
fuzzy-matching**. If the same logical pattern was created
independently on two devices (different IDs), they will sync as two
separate projects forever.

### Timestamps & version markers

- `updatedAt` (ISO string) is set on every `ProjectStorage.save`.
- `syncMeta.lastSyncedAt` and `syncMeta.syncVersion` are set by
  `markSynced` after a successful import
  ([project-storage.js#L190](../project-storage.js#L190)).
- `fingerprint` (a deflate-based structural hash of the pattern
  cells, [sync-engine.js#L66](../sync-engine.js#L66)) — used to
  distinguish "chart structure unchanged, only progress differs"
  from "chart structure changed too".

### Classifications

`classifyProjects` produces one of four labels per remote project:

| Classification     | Condition                                              |
|--------------------|--------------------------------------------------------|
| `new-remote`       | no local project with this ID                          |
| `identical`        | local and remote `updatedAt` strings are equal         |
| `merge-tracking`   | timestamps differ but fingerprints match               |
| `conflict`         | timestamps and fingerprints both differ                |

Local projects not present in the remote file are returned in
`plan.localOnly` and are **always kept** — there is no "delete on
peer" propagation.

---

## 6. Where the sync UI lives

| Location              | Surface                                                                |
|-----------------------|------------------------------------------------------------------------|
| [home-screen.js](../home-screen.js#L1180) (legacy) | Full sync card on the dashboard: device name, sync folder, manual export/import, auto-sync toggle, updates list |
| [header.js](../header.js#L640) (every page)        | "Export .csync" / "Import .csync" inside the File menu          |
| [preferences-modal.js](../preferences-modal.js#L897) (Sync, backup & data panel) | The "Sync" section currently only contains "Add new patterns to the library automatically" — sync prefs proper are **stubbed out** with the comment "Auto-sync stitch progress hidden — multi-device sync not implemented yet." |
| [home-app.js](../home-app.js)                       | The new `/home` landing page has **no sync UI at all** |
| [modals.js](../modals.js#L406)                      | `SyncSummaryModal` + `SyncConflictCard` (the import-preview modal) |

Note: the Workshop refresh moved the default landing from the legacy
`home-screen.js` to `home-app.js`, but the sync UI was *not* ported
across. Today, a user landing on `/home` has no visible entry point
to sync setup unless they also visit the legacy dashboard via
`index.html`.

---

## 7. What runs at app startup

1. `home-screen.js` mounts (only on `index.html`).
2. `getWatchDirectory()` resolves the persisted handle. **No
   permission re-prompt** — `queryPermission` only.
3. If a handle exists, `checkForUpdates(handle)` runs. This reads
   every `.csync` file in the folder and decompresses it.
4. Updates from other devices that are newer than
   `cs_sync_lastImportAt` populate `setFolderUpdates`, surfacing a
   "Sync updates available" UI block.
5. **No actual import happens automatically.** The user must click
   each update to open the Sync Summary modal and confirm.

This is intentional — the import is gated by the user — but it also
means a user who simply opens the app, edits a project, and closes
it will never receive the other device's changes that arrived
overnight.

---

## End of architecture map
