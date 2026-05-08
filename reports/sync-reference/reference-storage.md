# Agent 1 — Where is the sync file reference stored?

> Companion to [00_DIAGNOSIS.md](00_DIAGNOSIS.md). Cross-references the
> earlier [reports/sync/](../sync/) audit; do not re-read sections covered
> there.

## Verdict (read this first)

The app stores **three independent "sync references"**, and **none of them
travel with the `.csync` file**:

| # | Reference | Storage | Cross-device visible? |
|---|---|---|---|
| 1 | Watch-folder `FileSystemDirectoryHandle` | IndexedDB `cross_stitch_sync_meta` → `sync_state` → key `watchDirHandle` ([sync-engine.js:1487-1515](../../sync-engine.js#L1487-L1515)) | **No** — handle is a browser permission grant, origin+device bound |
| 2 | "Last received import plan" | In-memory module variable `_lastReceivedPlan` in [header.js:14-30](../../header.js#L14-L30) | **No** — never persisted, lost on tab reload |
| 3 | Per-device import history | localStorage `cs_sync_lastImportPerDevice` ([sync-engine.js:196-213](../../sync-engine.js#L196-L213)) | **No** — browser-local |

Plus two informational items already covered in the prior audit:
device identity (`cs_sync_deviceId` / `cs_sync_deviceName` in
localStorage, written into each `.csync` for display only — see
[file-format.md](../sync/file-format.md)) and the snapshot store used
for three-way conflict detection (`CrossStitchDB` →
`sync_snapshots` → `latest`, device-local).

**Crucially: nothing is written *into* the `.csync` file to mark "device
joined" or "this is an active sync session".** A `.csync` file is a
one-shot transport blob; it does not carry a sync-relationship record.
This is confirmed by the existing
[file-format.md](../sync/file-format.md) audit and by the open→write→close
pattern in [sync-engine.js:1568-1570](../../sync-engine.js#L1568-L1570).

## The watch-folder handle is the most consequential one

`setWatchDirectory(dirHandle)` does
`put(dirHandle, "watchDirHandle")` into IndexedDB
([sync-engine.js:1487-1500](../../sync-engine.js#L1487-L1500)). Browsers
serialise `FileSystemDirectoryHandle` into IndexedDB as an opaque
permission token, **not** as a path string. That token is bound to the
origin **on this device only**. Even if Device A and Device B are signed
into the same browser profile, Device B's IndexedDB is a separate
database file and contains no handle.

The practical consequence: **every device must independently call
`showDirectoryPicker()` and select the shared folder once.** There is no
way to transfer the picker grant. This is a browser-security invariant,
not an app bug.

## The "last received plan" is the source of the user-visible bug

[header.js:24-33](../../header.js#L24-L33) listens for the
`sync-plan-ready` CustomEvent and stashes `e.detail` into the module
variable `_lastReceivedPlan`. `sync-plan-ready` is dispatched from
exactly **one** place: the manual file picker handler at
[header.js:850-862](../../header.js#L850-L862).

The background watcher (`SyncEngine._processFolderUpdates`,
[sync-engine.js:1786-1830](../../sync-engine.js#L1786-L1830)) **does not
dispatch `sync-plan-ready`**. It dispatches one of two different events:

- `cs:backupRestored` — when the plan is auto-applicable (no conflicts)
- `cs:syncUpdatesAvailable` — when the plan has conflicts; the
  home-screen banner reads this

So when Device B sits on `/create` or `/stitch` and clicks "Review sync",
[header.js:865-874](../../header.js#L865-L874) calls
`window.SyncReviewGate.open(_lastReceivedPlan, …)` with `null` because
the watcher path never set it. Agent 2 covers the consequence —
[review-gate.md](review-gate.md).

## What is NOT being stored anywhere persistent

Worth calling out because their absence drives Phase 2 options:

- The path / name / mtime of any `.csync` file the watcher most recently
  saw. The watcher iterates the directory each tick and rebuilds its
  view; the result is not snapshotted to IndexedDB.
- A "user has connected to sync at all" boolean separate from the
  `watchDirHandle` presence. The two are conflated in
  [home-screen.js:1338-1348](../../home-screen.js#L1338-L1348).
- A foreign-device-id allow-list. `_deviceId` in incoming files is
  informational only ([file-format.md](../sync/file-format.md)).
- Any sidecar metadata file (e.g. `.csync-config.json`) in the shared
  folder.

## DevTools verification (copy-paste)

```js
// 1) Is a watch-folder handle persisted on this device?
indexedDB.open('cross_stitch_sync_meta', 1).onsuccess = (e) => {
  const tx = e.target.result.transaction('sync_state', 'readonly');
  tx.objectStore('sync_state').get('watchDirHandle').onsuccess = (g) => {
    console.log('watchDirHandle:', g.target.result instanceof FileSystemDirectoryHandle);
  };
};

// 2) Per-device import history (only what THIS device has imported)
console.log(JSON.parse(localStorage.getItem('cs_sync_lastImportPerDevice') || '{}'));

// 3) Confirm sync-plan-ready only fires from the manual file picker
window.addEventListener('sync-plan-ready', e => console.log('manual import plan:', e.detail));
window.addEventListener('cs:syncUpdatesAvailable', e => console.log('watcher updates:', e.detail));
window.addEventListener('cs:backupRestored', () => console.log('watcher auto-applied'));
// Now (a) drop a .csync into the watch folder and wait, then (b) use the
// "Import Sync (.csync)…" file picker. Only (b) prints "manual import plan".
```

## Cross-references

- [reports/sync/cloud-sync.md](../sync/cloud-sync.md) — confirms the
  app does not hold the `.csync` file open and uses per-device filenames.
- [reports/sync/file-format.md](../sync/file-format.md) — confirms
  `.csync` carries no device-joining metadata.
- [reports/sync/change-detection.md](../sync/change-detection.md) —
  the (now-fixed?) polling loop that delivers files to
  `_processFolderUpdates`.
