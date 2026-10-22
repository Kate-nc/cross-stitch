# Cleanup 20: sync scheduling and lifecycle, as it behaves on `main` (ca971d4)

Written before the extraction and kept as the reference the golden traces (`tests/fixtures/syncScheduler.golden.json`)
were captured against. Everything here lives in `sync-engine.js` unless stated. `WebDAVSync` has its own scheduling and
is not touched.

## Owners of state

| State | Owner | Notes |
|---|---|---|
| `_autoExportTimer`, `_lastExportStartedAt`, `_exportInFlight`, `_exportQueued` | auto-export debounce | the unit extracted by this PR |
| `_lastPermWarningAt` (60 s) | auto-export work | notification policy, stays in the engine |
| `_watchDirHandle` | engine | read when the timer fires, not when the save was made |
| `_watcherInterval`, `_watcherVisHandler` | watcher lifecycle | stays in the engine |
| `_watcherInFlight` | watcher tick | set only after the tick's awaits, see below; stays in the engine |
| `_permissionLossAnnounced` | watcher tick / `requestFolderPermission` | stays in the engine |
| `_diagnostics` counters | watcher tick | stays in the engine |

Constants: `FAST_EXPORT_DELAY` 2000 ms, `COOLDOWN_MS` 30000 ms, `PERM_WARN_COOLDOWN_MS` 60000 ms,
`WATCHER_INTERVAL_MS` 10000 ms (or the number passed to `startWatching`).

## Auto-export

Callers of `triggerAutoExport()`: `ProjectStorage.save` (transaction complete) and the two `StashBridge` mutators.

```
triggerAutoExport
  1. WebDAVSync.changed()                         (if present; always, before any gate)
  2. isAutoSyncEnabled() false          -> return
  3. handle = _watchDirHandle || getWatchDirectory()   (async)
        none                            -> return
        rejects                         -> _reportSyncError("auto-export")
  4. _watchDirHandle = handle; _scheduleAutoExport()

_scheduleAutoExport
  inFlight                              -> queued = true; return
  timer pending                         -> return                      (coalesce)
  delay = 2000 when no write has started yet or >= 30000 ms since the last write STARTED,
          else max(2000, 30000 - sinceStart)
  timer = setTimeout(_runAutoExport, delay)

_runAutoExport                           (timer fired)
  timer = null
  handle = _watchDirHandle  (re-read now)   none -> return   (inFlight untouched, nothing queued is cleared)
  inFlight = true; queued = false
  queryPermission(readwrite)
     not granted -> at most once per 60 s: _reportSyncError("auto-export", "Write permission not granted ...")
                    (no write, cooldown NOT consumed)
     granted     -> lastStartedAt = now
                    exportToFolder()  (protocol state "pending"; permission re-check; exportSync; compress;
                                        getFileHandle; createWritable; write; close; mark complete;
                                        event-log "export-success")
                    -> cs:syncStatusChanged {reason:"exported"}
  any rejection -> _reportSyncError("auto-export", e)
  settle (success or failure): inFlight = false; if queued { queued = false; _scheduleAutoExport() }
```

`_reportSyncError(stage, err)` order: `console.warn`, `cs:syncError` event, event-log entry (`export-fail`; its own
`cs:syncEventLogChanged`), then the "folder permission was revoked" toast only when the message matches `/permission/i`.

Behaviours that follow from this and are easy to change by accident (all pinned by the traces):

- The pending timer is never cancelled. Disconnecting the folder, stopping the watcher or switching auto-sync off does not
  clear it; it fires and, with no folder, ends without touching `inFlight`.
- The gate in step 2 is only checked when a save arrives. A timer already pending, and a follow-up already queued behind
  a running write, still run after auto-sync is switched off.
- The folder handle is read when the timer fires. A write that began on one folder finishes on it; its queued follow-up
  uses whichever folder is current when that timer fires.
- The cooldown is measured from the start of the last real write, so a write slower than the cooldown makes its queued
  follow-up use the 2000 ms fast delay.
- A permission refusal does not consume the cooldown and does not set the stamp.
- Two tabs each have their own debounce and both may export; export takes no cross-tab lock.

## Watcher

```
startWatching(ms)   stopWatching(); hydrate the persisted pending plan; setInterval(_runWatcherTick, ms || 10000);
                    add document "visibilitychange" listener (tick when visible); run one tick now
stopWatching()      clearInterval; remove the listener.  Does not touch the export timer, an export in flight or a tick in flight
isWatching()        interval handle present
_runWatcherTick     watcherInFlight -> return
                    document not visible -> skipsHidden++, return
                    handle = _watchDirHandle || getWatchDirectory()   none -> skipsNoHandle++, return
                    queryPermission(read) not granted -> skipsNoPermission++; first time per loss: cs:syncPermissionNeeded,
                                          event-log "permission-needed", revoked toast; return
                    watcherInFlight = true (note: after the awaits above, so two ticks can overlap while those are pending)
                    tickCount++, lastTickAt
                    navigator.locks "cs_sync_import" ifAvailable:  no lock -> skipsLockHeld++, return
                    checkForUpdates -> _processFolderUpdates
                    failure -> tickFailures++, _reportSyncError("watcher")
                    finally watcherInFlight = false
```

Callers: `setWatchDirectory` starts it (after enabling auto-sync if the user has expressed no preference);
`clearWatchDirectory` stops it, nulls the handle and removes the auto-sync preference; `requestFolderPermission` clears
the announcement latch and starts it on a grant; `startAutoWatch` (from `header.js` on every page) starts it when a
persisted handle already has read permission, otherwise announces `cs:syncPermissionNeeded`.

## What this PR moves

Only the first block: the timer, the in-flight flag, the queued flag, the start stamp, the two constants, the delay
decision and `settle`. The engine keeps `triggerAutoExport` (its gates and `WebDAVSync.changed()` ordering) and
`_runAutoExport` (handle read, permission probe, stamp placement, write, notifications, rate limit). The watcher is not
moved: its in-flight guard is entangled with the tick body (it is raised only after the tick's awaits), so separating it
would risk changing which ticks overlap.
