# Agent 4 — Change Detection (Link [4])  ★ PRIMARY BREAK ★

## VERDICT: BROKEN

The app on Device B does **not** detect when the `.csync` files in the watch
folder change externally. There is **no file watcher and no polling loop** of
any kind. `SyncEngine.checkForUpdates()` is invoked in only three places, and
none of them runs while the user is sitting on the page after the initial
load.

This is the explanation for the user's observation: the file is being saved
by Device A, the cloud service is moving it to Device B, but Device B's
running app simply never looks at it again.

## Where `checkForUpdates()` is called

| # | Trigger | Citation |
|---|---|---|
| 1 | Page load (after restoring the persisted directory handle) | home-screen.js:1278 |
| 2 | Right after the user picks a sync folder for the first time | home-screen.js:1414 |
| 3 | Manual "Check for updates" button | home-screen.js:1449–1453 |

There are **no** other invocations. In particular:

- No `setInterval` polling
- No `FileSystemObserver` (the new draft API) usage
- No `focus` listener that re-checks
- The `visibilitychange` listener (home-screen.js:1309–1313 and
  project-library.js:78–83) only calls a local `reload()` that re-queries
  IndexedDB. It does **not** call `SyncEngine.checkForUpdates()`. So
  alt-tabbing back into the app does *not* refresh from the watch folder.

## Even if it were invoked, the import is not automatic

When `checkForUpdates()` does run and finds new files, it sets React state
and shows an "N update(s) available" banner (home-screen.js:2085). The user
must click **Apply** before `executeImport()` actually runs and the new
projects land in IndexedDB.

This is a separate UX issue but worth noting: even with polling added, the
basic Device-A-to-Device-B propagation will require one extra click unless
auto-apply is added.

## Reproduction (no code changes required)

1. Device A: save a new pattern, wait 60 s for the auto-export to fire.
2. On Device B's file system, confirm the cloud has delivered the updated
   `.csync` file (the modified timestamp should be recent).
3. Leave Device B's browser tab open and untouched. Wait several minutes.
4. **Observed:** no banner, no toast, no refresh. The new pattern is not
   visible on Device B.
5. Click "Check for updates" (or reload the tab). The banner appears; click
   Apply; the pattern shows up.

## Recommended fix sketch

Two parts; both should ship together.

### A. Periodic poll while the tab is visible

In `SyncEngine`, expose a `startWatching(intervalMs)` /
`stopWatching()` pair that internally runs `checkForUpdates()` on a timer
when `document.visibilityState === 'visible'`. Suggested interval: 10 s.
Cancel on hidden, restart on visible.

Wire it from the same component that already calls `checkForUpdates()` on
page load (home-screen.js around line 1278) and from `project-library.js`
where the folder UI lives.

### B. Re-check on visibility change

Augment the existing `visibilitychange` handler (home-screen.js:1309) so
that — in addition to its current `reload()` of IndexedDB — it calls
`SyncEngine.checkForUpdates(handle)` with the persisted directory handle.
This catches the common "user switches back from another app" case
without waiting for the polling tick.

### C. (Optional, recommended for Phase 3) Auto-apply low-risk updates

If the only updates are `new-remote` (i.e. no conflicts and no
merge-tracking ambiguity), apply them silently and show a toast
("2 new patterns synced from Katie's iPad"). Keep the manual banner only
for genuine conflicts.

## Verification once fixed

```
1. Open Device B with the app on /home and a watch folder configured.
2. Externally drop or modify a .csync file in the watch folder.
3. Within ~10 seconds, observe either the banner appearing or (with C)
   a "Synced N patterns" toast and the dashboard showing the new project.
```
