# Agent 1 — Write Path (Link [1])

## VERDICT: WORKING (with a 30-second data-loss window)

When a user saves a pattern in the Creator, the `.csync` file IS automatically
written to disk — provided the user has previously enabled auto-sync and picked
a watch folder. The bytes do reach disk, properly flushed and closed. The only
real risk is timing: the write is debounced 30 s, so a browser/tab closure
within that window means the change never reaches the file.

## Direct answer

**Conditional YES**: writes happen automatically iff
`SyncEngine.isAutoSyncEnabled()` is true AND `_watchDirHandle` is configured.
Otherwise the only on-disk artefact is IndexedDB; nothing reaches the
`.csync` file.

## Save → bytes-on-disk chain

```
1. Creator auto-save (creator/useProjectIO.js:769)
   ctrl.schedule(persistAll)              // 1 s debounce
2. persistAll() (creator/useProjectIO.js:743–768)
   ProjectStorage.save(project)
3. ProjectStorage.save tx.oncomplete (project-storage.js:294–295)
   SyncEngine.triggerAutoExport()         // fire-and-forget, NOT awaited
4. triggerAutoExport (sync-engine.js:1552–1574)
   setTimeout(exportToFolder, 30000)      // 30 s debounce
5. exportToFolder (sync-engine.js:1450–1470)
   getFileHandle({create:true}) →
   createWritable() →
   write(compressed) →
   await writable.close()                  // proper flush + close
```

## Per-question findings

| Question | Answer | Citation |
|---|---|---|
| Automatic? | Yes (debounced) | sync-engine.js:1552 |
| Full rewrite vs delta? | Full rewrite (truncate + write) | sync-engine.js:1468–1470 |
| Sync w.r.t. user feedback? | No — toast fires after IDB commit, well before disk write | project-storage.js:294 |
| File System Access API? | Yes (`showDirectoryPicker`, `createWritable`, `close`, `queryPermission`, `requestPermission`) | sync-engine.js:1454–1470 |
| Handle held open? | No — `await writable.close()` after each write | sync-engine.js:1470 |
| Write-then-rename? | No — direct overwrite | sync-engine.js:1468 |
| Handle persisted across sessions? | Yes (IndexedDB `cross_stitch_sync_meta` / `sync_state`) | sync-engine.js:1387–1398 |
| Permission re-prompt? | Yes (`queryPermission` then `requestPermission` if needed) | sync-engine.js:1454–1460 |

## Concerns

1. **30-second debounce + no await** — user sees "Saved" within ~1 s, but the
   actual `.csync` write is up to 30 s later. Closing the tab inside this
   window loses the write. Not a sync-across-devices bug per se, but a
   user-trust issue.
2. **Silent failure on permission revocation** — if the OS-level permission
   for the watch folder is revoked, the next export logs to console and
   gives up. No UI indication.
3. **No retry/back-off** — a single failed write must wait for the next
   user-triggered save before another attempt.

## Verification (copy-paste in Device A's DevTools console)

```js
// 1. Confirm auto-sync is configured
SyncEngine.getSyncStatus();
// Expect: { hasWatchDir: true, autoSync: true, lastExportAt: "..." }

// 2. Force an immediate export (bypass the 30 s debounce)
await SyncEngine.exportToFolder();
// Expect resolution; check console for any permission errors.

// 3. In your OS file explorer, open the sync folder.
//    There should be a file named:
//      cross-stitch-sync-<deviceName>-<deviceId>.csync
//    Its "modified" timestamp should match the time you ran step 2.
```

If step 3 shows the file modified — Link [1] is verified working.
