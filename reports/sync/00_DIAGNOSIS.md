# Sync Engine Diagnosis — Patterns Not Appearing Across Devices

> Read first: [write-path.md](write-path.md), [file-format.md](file-format.md),
> [cloud-sync.md](cloud-sync.md), [change-detection.md](change-detection.md),
> [read-path.md](read-path.md).

## TL;DR

The user is right that the file *is* being saved on Device A and the cloud
service *is* delivering it to Device B. The bug is on Device B: the running
web app **never re-reads the watch folder after the initial page load**.
There is no file watcher and no polling loop. Even when the cloud service
delivers a new `.csync` file 10 seconds later, the app simply doesn't look.

A secondary issue is that *even if* the app were to notice, today it would
only show a banner ("N updates available") and wait for a manual click to
apply. Sync should feel automatic.

## The broken link

**Primary: Link [4] — change detection.** See
[change-detection.md](change-detection.md).

`SyncEngine.checkForUpdates()` is invoked in three places only, none of
which fire while the user is sitting on the page:

| # | Trigger | Citation |
|---|---|---|
| 1 | Initial page load | [home-screen.js:1278](../../home-screen.js#L1278) |
| 2 | Immediately after the user first picks a watch folder | [home-screen.js:1414](../../home-screen.js#L1414) |
| 3 | Manual "Check for updates" button | [home-screen.js:1449](../../home-screen.js#L1449) |

There is no `setInterval`, no `FileSystemObserver`, no `focus` listener,
and the existing `visibilitychange` handler
([home-screen.js:1309](../../home-screen.js#L1309)) only re-queries
IndexedDB — it does **not** ask `SyncEngine` to re-scan the folder.

## Other links — verified healthy

| Link | Status | Notes |
|---|---|---|
| [1] Write path | Working | Atomic open/write/close via the File System Access API; debounced 30 s. One latent risk: the toast says "Saved" before the disk write completes, so a tab close inside the 30 s window loses that export. See [write-path.md](write-path.md). |
| [2]+[3] Cloud-service interaction | App-side is fine | App does not hold the file open, no `.lock` sidecars, per-device filenames avoid conflict copies. Whether Dropbox/iCloud/OneDrive *actually* sync is outside the app — see manual checks in [cloud-sync.md](cloud-sync.md). |
| Format | Working | JSON + pako.deflate; `_version === 1` strictly enforced (cross-version upgrades will need a bump and migration). No device-ID filtering, no encryption keyed to a device. See [file-format.md](file-format.md). |
| [5] Read path | Working | Once `executeImport()` runs, new projects are saved through `ProjectStorage.save()`, which dispatches `cs:projectsChanged` and the dashboard re-renders with an immutable array. See [read-path.md](read-path.md). |

## Root cause in plain English

The app treats the `.csync` files in the watch folder like a one-shot
"check at startup" rather than like a live shared inbox. Once the page is
loaded, the in-memory project list and the on-disk `.csync` files drift
apart with no mechanism to reconcile them. The user can prove this to
themselves by clicking the existing "Check for updates" button (or
reloading the tab) — the banner will appear and the missing patterns will
import.

## Secondary issue (UX, not correctness)

Even when `checkForUpdates()` does fire, `executeImport()` is gated behind
a user click on the updates banner
([home-screen.js:2085](../../home-screen.js#L2085)). For genuine
auto-sync, low-risk updates (only `new-remote`, no conflicts) should
apply automatically with a "Synced N patterns from <Device>" toast.

## Recommended fix order

Fix in this order so each step is testable on its own:

1. **Add a polling loop and visibility re-check (Link [4]).**
   - Expose `SyncEngine.startWatching(intervalMs = 10000)` /
     `stopWatching()`. Internally `setInterval` that calls
     `checkForUpdates(handle)` only while `document.visibilityState ===
     'visible'`. Suspend on `hidden`, resume on `visible`.
   - In the existing `visibilitychange` handler, also call
     `checkForUpdates` once on each transition to `visible`, so a quick
     alt-tab back catches changes without waiting for the next tick.
   - Start it from `home-screen.js` (and any other surface that already
     calls `checkForUpdates` on mount) once a watch directory is
     configured.

2. **Auto-apply pure-new-remote updates (Link [4] UX).**
   - In the banner handler, if the plan has zero conflicts and zero
     merge-tracking entries, call `executeImport(plan)` automatically and
     show a toast ("2 patterns synced from Katie's iPad"). Keep the
     manual banner for plans that contain conflicts.

3. **(Phase 3, hardening) Tighten the write side.**
   - Lower or eliminate the 30 s `AUTO_EXPORT_DELAY` for the *first*
     write after a save (e.g. fire after 2 s, then debounce subsequent
     writes within a 30 s window) so a tab close shortly after editing
     doesn't lose the change.
   - Add a "sync health" indicator: last-export-at, last-import-at,
     last-error. Surface permission revocations as a visible warning
     instead of a console.warn.

## Verification checklist (post-fix)

```
## Basic sync
- [ ] Save a pattern on Device A. Within ~60 s, it appears on Device B
      with no manual action on Device B.
- [ ] Save a pattern on Device B. Within ~60 s, it appears on Device A
      with no manual action on Device A.
- [ ] Patterns saved on both devices in the same minute both end up on
      both devices (each writes its own .csync, no overwrites).

## File handling
- [ ] While the app is running, the .csync file is NOT held open
      (rename it from the OS file explorer succeeds).
- [ ] The .csync file's mtime updates within ~30 s of every save on
      that device.
- [ ] Externally dropping a hand-edited .csync into the watch folder
      causes the app to detect and offer it within ~10 s.

## Edge cases
- [ ] Device B's app is in another tab. Save on A. Switch to B's tab —
      pattern appears within a few seconds.
- [ ] Device B is offline; save on A; reconnect B — pattern appears
      after the cloud service catches up and within one polling tick.

## User feedback
- [ ] "Saved" toast on Device A only fires once the .csync write has
      completed (Phase 3).
- [ ] If the watch-folder permission is revoked, a visible warning
      appears (Phase 3).
```

---

**Stopping here for human review per the directive — no code changes have
been made.** Once you approve the fix plan, the recommended starting point
is the polling loop in `sync-engine.js` plus the visibility hook in
`home-screen.js`.
