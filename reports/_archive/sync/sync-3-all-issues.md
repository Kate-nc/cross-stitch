# Sync 3 — All Sync Issues

> Read-only audit. Catalogues every failure mode discovered while
> tracing the sync code paths. Severity scale: 🔴 data loss / silent
> corruption • 🟠 user-visible bug or missing feature • 🟡 papercut
> or unclear UX • 🟢 architectural smell.

A "code path" entry of "—" means no code currently handles the case.

| #  | Severity | Title                                                  |
|----|----------|--------------------------------------------------------|
| 1  | 🔴 | Cross-device "same logical project" duplicates                |
| 2  | 🔴 | Non-atomic writes can leave a truncated file behind          |
| 3  | 🔴 | Two open tabs both auto-export, last writer wins, no merge   |
| 4  | 🔴 | Pre-sync local data is overwritten by stale remote (timestamp shenanigans) |
| 5  | 🟠 | Deleted projects resurrect on next sync                       |
| 6  | 🟠 | Concurrent edits on two devices: chart-only conflict picks one and discards the other entirely |
| 7  | 🟠 | "keep-local" silently discards all remote progress            |
| 8  | 🟠 | First-time sync has no preview / reconciliation prompt        |
| 9  | 🟠 | Cloud "conflicted copy" files (e.g. `…(1).csync`) are imported as another device |
| 10 | 🟠 | No file watching — updates only appear on Home dashboard load |
| 11 | 🟠 | Auto-export silently no-ops on permission lapse               |
| 12 | 🟠 | Folder permission lost → handle stays in IDB, fails forever   |
| 13 | 🟠 | Active-project pointer overwritten by sync (when prefs synced)|
| 14 | 🟠 | `/home` (new landing) has no sync UI at all                   |
| 15 | 🟡 | No integrity hash — corrupt file silently skipped             |
| 16 | 🟡 | Disk full mid-write → no recovery, no surfaced error          |
| 17 | 🟡 | Partial cloud download read as corrupt, never re-tried        |
| 18 | 🟡 | "Last sync" timestamps are local clocks, can drift            |
| 19 | 🟡 | No backup before destructive import                           |
| 20 | 🟡 | Per-project sync status not surfaced anywhere                 |
| 21 | 🟡 | Folder content has no manifest — looks empty/scary to user    |
| 22 | 🟢 | One large file per device → constant cloud re-uploading       |
| 23 | 🟢 | No tombstone format → deletes are never propagatable          |
| 24 | 🟢 | Settings ("which prefs to sync") fully hard-coded             |
| 25 | 🟢 | Schema bump = hard error on every older device, no migration  |

Each issue below is short, with the code reference, the failure
mode, the practical user impact, and a one-line proposed fix
(detail belongs in Phase 2).

---

### 1. 🔴 Cross-device "same logical project" duplicates

**Code:** [sync-engine.js#L320](../sync-engine.js#L320) (`classifyProjects`)
**Failure:** Project IDs are device-local. Two devices independently creating the same pattern produce two IDs and `classifyProjects` cannot reunite them.
**Impact:** The headline bug. After first sync, every "common ancestor" project is duplicated.
**Fix:** Add fingerprint-based fallback match to a new `possible-duplicate` bucket; UI lets the user merge or keep separate. See [sync-2](sync-2-duplication-bug.md).

### 2. 🔴 Non-atomic writes can leave a truncated file behind

**Code:** [sync-engine.js#L777](../sync-engine.js#L777) (`exportToFolder`)
**Failure:** `createWritable()` truncates immediately. A crash, tab close, or OS swap mid-write leaves a 0–N byte file. Cloud drive uploads the truncated file. Other devices see a "corrupt" file (silently skipped — issue 15) and forget this device entirely.
**Impact:** Other devices never see the latest data; effectively a data-loss event for the offline-edited project until the next clean export.
**Fix:** Atomic write — write to `<name>.tmp`, then `move()` (FSAA supports `FileSystemFileHandle.move`).

### 3. 🔴 Two open tabs both auto-export, last writer wins, no merge

**Code:** [sync-engine.js#L848](../sync-engine.js#L848) (`triggerAutoExport`); fileName is per-device, not per-tab.
**Failure:** Both tabs write the same `cross-stitch-sync-…-<deviceId>.csync`. Tab B's full IDB snapshot overwrites Tab A's, even if tabs edited different projects. The IDB itself is fine (last write wins is per-record), but the *exported* snapshot only reflects one tab's view-of-the-world if React state was unflushed.
**Impact:** Edits made in Tab A but not yet flushed via `__flushProjectToIDB` may be missing from the export Tab B writes.
**Fix:** A cross-tab `BroadcastChannel`/`navigator.locks` mutex around export; or, more robustly, build the export *after* re-reading IDB (which `exportSync` already does — verify this is air-tight; the regression risk is in the React `__flushProjectToIDB` call only flushing the calling tab).

### 4. 🔴 Pre-sync local data is overwritten by stale remote (timestamp shenanigans)

**Code:** [sync-engine.js#L335](../sync-engine.js#L335) (string `updatedAt` equality)
**Failure:** `classifyProjects` calls two projects "identical" only when `updatedAt` strings are *exactly* equal. Otherwise, when fingerprints differ, it's a `conflict`, default-resolved as "keep-local". So far so good. But cloud drives sometimes round modification timestamps (Google Drive truncates to second precision; Dropbox preserves; iCloud rewrites to upload time). If a future sync round-trip causes a remote to be *older* than local but the user accepts "keep-remote" without realising, local newer work is silently overwritten with no backup.
**Impact:** Silent loss of the newer project state on user error.
**Fix:** Always snapshot local-before-overwrite; offer one-click undo. Show "this remote is older than your local" in red on the conflict card.

### 5. 🟠 Deleted projects resurrect on next sync

**Code:** [sync-engine.js#L320](../sync-engine.js#L320) — no tombstones; [project-storage.js#L358](../project-storage.js#L358) deletes do not record an event the sync layer can see.
**Failure:** User deletes `Cottage Garden` on Device A. Device B still has it and exports a `.csync` with it. Device A imports → re-creates. Device A is annoyed.
**Impact:** Inability to delete projects across devices.
**Fix:** Tombstone store: on delete, write `{ id, deletedAt, deletedOn }` into a small `cs_sync_tombstones` IDB store. Include in export. On import, drop any project whose tombstone is newer than its `updatedAt`. GC tombstones older than ~90 days.

### 6. 🟠 Concurrent edits on two devices: chart-only conflict picks one and discards the other entirely

**Code:** [sync-engine.js#L320–L350](../sync-engine.js#L320), [modals.js#L500](../modals.js#L500) (SyncConflictCard).
**Failure:** When chart structure differs (palette swap, cell edit, resize), classification is `conflict`. The three choices are keep-local / keep-remote / keep-both. There is no per-field merge. So if A added a row of stitches and B changed the background colour, the user must pick a side and lose the other change, or keep two copies.
**Impact:** Forces "fork on conflict" any time both devices touch the chart.
**Fix:** For a single-user app, the recommended Phase 2 strategy is "fork on conflict" by default (auto-create `…(from Device B)`) and let user manually reconcile. Document this clearly in the modal so the user understands the trade.

### 7. 🟠 "keep-local" silently discards all remote progress

**Code:** [sync-engine.js#L654](../sync-engine.js#L654) — `if (resolution === "keep-local") /* do nothing */`
**Failure:** On a `conflict` the default resolution is `keep-local`. If the remote's `done` array has stitches the user genuinely completed on the other device, those stitches are discarded.
**Impact:** Direct violation of the "stitches cannot be un-done by sync" rule.
**Fix:** Even for `conflict`, always merge `done` arrays additively. Only let the user choose between local/remote/both for the *chart structure* — the progress data should always be unioned.

### 8. 🟠 First-time sync has no preview / reconciliation prompt

**Code:** [home-screen.js#L1257](../home-screen.js#L1257) — first import path is the same as the steady-state path.
**Failure:** A user setting up sync on Device 2 sees the same `SyncSummaryModal` as a normal "incoming changes from sister device" modal. There is no "this is the first time, here is how we'll match things up" copy, no name-based suggestion, no batch-merge.
**Impact:** This is the moment the duplication bug is birthed and the moment the user has the most context for resolving it. We waste it.
**Fix:** Detect first-sync (`cs_sync_lastImportAt` empty AND there is local data AND there is remote data). Show a dedicated "Welcome to sync" wizard that surfaces fingerprint-matched candidates as suggested merges.

### 9. 🟠 Cloud "conflicted copy" files imported as another device

**Code:** [sync-engine.js#L786](../sync-engine.js#L786) — `entry.name.endsWith(".csync")`
**Failure:** Dropbox creates `cross-stitch-sync-Tablet-dev_x (Macbook's conflicted copy 2026-04-29).csync`. Our scanner reads it, the embedded `_deviceId` matches Tablet, and it shows up as another update from Tablet. User imports it; it overwrites the latest legitimate Tablet snapshot in the user's mental model.
**Impact:** User confusion; possible re-introduction of stale data.
**Fix:** Detect cloud-conflict markers (`(conflicted copy`, ` (1).csync`, ` (Apple).csync`, etc.); surface them as "Possible cloud conflict — review before importing"; never auto-import.

### 10. 🟠 No file watching

**Code:** —
**Failure:** No `FileSystemObserver`, no polling, no focus listener. New `.csync` files arriving in the folder while the app is open are invisible until the user navigates back to the Home dashboard.
**Impact:** "I edited on my tablet 10 minutes ago, why don't I see it on my desktop?"
**Fix:** Lightweight 30 s polling timer when the sync folder is configured AND the page is visible. (FileSystemObserver is too new to rely on.)

### 11. 🟠 Auto-export silently no-ops on permission lapse

**Code:** [sync-engine.js#L859](../sync-engine.js#L859)
**Failure:** Console-warn only. The user thinks auto-sync is working.
**Impact:** Silent sync failure for hours/days.
**Fix:** Surface a subtle but persistent "sync paused — re-grant access" pill in the header.

### 12. 🟠 Folder permission lost → handle stays in IDB, fails forever

**Code:** [sync-engine.js#L760](../sync-engine.js#L760)
**Failure:** `requestPermission` fails (user clicked Block, browser cleared site data partially), handle is not cleared, every page load attempts to use it and fails.
**Impact:** Silent recurring sync failure.
**Fix:** Distinguish "permission denied" from "folder gone" and from "transient error"; offer "Re-pick folder" CTA after N failed attempts.

### 13. 🟠 Active-project pointer overwritten when prefs synced

**Code:** [sync-engine.js#L210](../sync-engine.js#L210), [sync-engine.js#L194](../sync-engine.js#L194)
**Failure:** If `includePrefs` is opted into, importing on Device B sets B's "currently open project" to whatever A had open. Jarring on next page load.
**Impact:** Mild surprise.
**Fix:** Exclude active-project pointer from sync; it's a per-device concern.

### 14. 🟠 `/home` (new landing) has no sync UI

**Code:** [home-app.js](../home-app.js) — no SyncEngine references except in `cs:projectsChanged`.
**Failure:** The new Workshop-themed `/home` landing page (now the default) has no entry point to sync setup, status, or "check for updates". Users discover sync only by navigating to `index.html` and finding the legacy dashboard.
**Impact:** Sync is invisible to most new users.
**Fix:** A small "Sync" status pill in the header and/or a Sync card in the new home grid.

### 15. 🟡 No integrity hash — corrupt file silently skipped

**Code:** [sync-engine.js#L808](../sync-engine.js#L808) — caught and `console.warn`.
**Failure:** A truncated, corrupt, or mis-encoded file is dropped from the updates list with no user feedback.
**Impact:** "Why doesn't my tablet's sync show up?" — invisible.
**Fix:** Add SHA-256 integrity field; on hash mismatch, surface "corrupt sync file detected: <name>" with [Try again] [Show details] [Delete].

### 16. 🟡 Disk full mid-write → no recovery

**Code:** [sync-engine.js#L777](../sync-engine.js#L777)
**Failure:** `writable.write()` throws. The file may be truncated. No retry, no surfaced error path.
**Impact:** Subsequent sync silently broken; combine with #2 for full effect.
**Fix:** Atomic write (write to .tmp, verify size, move) plus an explicit error toast.

### 17. 🟡 Partial cloud download read as corrupt, never re-tried

**Code:** [sync-engine.js#L808](../sync-engine.js#L808)
**Failure:** Same swallow path as #15. Cloud drive is mid-download; we read a partial blob; we drop it.
**Impact:** Update appears, then disappears, then re-appears later. Confusing.
**Fix:** Retry-with-backoff (3 attempts, 5s/15s/45s); after final failure, surface "still downloading" status if file size is increasing.

### 18. 🟡 Last-sync timestamps are local clocks

**Code:** [sync-engine.js#L173](../sync-engine.js#L173), [sync-engine.js#L660](../sync-engine.js#L660)
**Failure:** Devices with skewed clocks compare apples and oranges. `_createdAt` is producing-device local time; `cs_sync_lastImportAt` is consuming-device local time. `checkForUpdates` then compares them numerically.
**Impact:** Files from a device with a clock 5 minutes fast appear "newer than they are"; files from a device with a clock 5 minutes slow are missed for 5 minutes.
**Fix:** For the "is this newer than what I've already imported" check, store the consuming device's *receipt* timestamp keyed by `(otherDeviceId, fileSize, hash)`, not by remote-clock timestamp. Drift becomes irrelevant.

### 19. 🟡 No backup before destructive import

**Code:** [sync-engine.js#L595–L680](../sync-engine.js#L595)
**Failure:** "keep-remote" overwrites local with no shadow copy. User cannot undo.
**Impact:** A wrong choice in the conflict modal is permanent.
**Fix:** Before any `keep-remote` or `merge-tracking` save, snapshot the local project to an `cs_sync_undo` IDB store (TTL: 7 days, max 20 entries). Surface "Undo last sync" in the header for the next 60 seconds.

### 20. 🟡 Per-project sync status not surfaced

**Code:** `syncMeta.lastSyncedAt` is written ([project-storage.js#L207](../project-storage.js#L207)) but read by no UI.
**Failure:** No way to see "this project is synced", "this is local-only", or "this is in conflict".
**Impact:** User can't tell which projects sync covers.
**Fix:** A small badge on each project card on `/home` and `/manager`.

### 21. 🟡 Folder content has no manifest

**Code:** —
**Failure:** A user opening the sync folder sees opaque `.csync` blobs and nothing explaining what they are.
**Impact:** User uncertainty; risk that a tidy-up deletes the wrong file.
**Fix:** Write a `README.txt` ("This folder is managed by Cross Stitch. Don't rename or delete files unless instructed.") on first export; refresh on schema bumps.

### 22. 🟢 One large file per device → constant cloud re-uploading

**Code:** [sync-engine.js#L760](../sync-engine.js#L760)
**Failure:** A single edit forces a full project-corpus re-upload. For a user with 30 projects, that may be 5–10 MB compressed. Dropbox/Google Drive re-upload the whole blob.
**Impact:** Bandwidth, sync latency, cloud-storage churn.
**Fix:** Per-project files (`projects/<id>.csync`) plus a small index file. Dropbox's block-level dedup helps a bit but per-project is dramatically better.

### 23. 🟢 No tombstone format

See #5. Architectural prerequisite.

### 24. 🟢 Settings are hard-coded

**Code:** [sync-engine.js#L20](../sync-engine.js#L20) — `SYNC_LS_KEYS` is a frozen array.
**Failure:** Adding a new pref to sync requires a code change. No user toggle for "sync stash but not preferences" etc.
**Impact:** Future flexibility.
**Fix:** Per-domain switches: projects / progress / stash / prefs.

### 25. 🟢 Schema bump = hard error

**Code:** [sync-engine.js#L300](../sync-engine.js#L300)
**Failure:** New version on Device A → Device B (still on old version) sees "Unsupported sync file version". Catastrophic if not all devices update simultaneously.
**Impact:** Coupled-update requirement.
**Fix:** Forward-compat migration table; older clients ignore unknown fields rather than reject.

---

## End of issues catalogue
