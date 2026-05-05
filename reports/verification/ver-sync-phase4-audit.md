# VER-SYNC: Cross-Device Sync Feature Audit (Phase 4)

> Scope: `sync-engine.js`, `home-screen.js`, `header.js`, `modals.js` (`SyncSummaryModal` +
> `SyncConflictCard`), `project-storage.js`, `manager-app.js`, `tracker-app.js`.  
> Methodology: static code analysis. No runtime testing performed.

---

## Area 1 — Data Integrity

- [x] `VER-SYNC-001` [P3] — Export should include all projects (chart + tracking), stash, prefs,
  and palettes per their toggle states; no silently omitted projects.  
  **Finding:** All four data categories are exported correctly per their toggles. The full project
  object `p` is stored verbatim as `data: p`, so `bsLines`, `halfStitches`, `halfDone`,
  `parkMarkers`, `sessions`, and `threadOwned` are all present. **Minor gap:** when
  `ProjectStorage.get()` returns `null` for an individual project (corrupt IDB entry), the entry
  is skipped with `if (fetched[i]) allProjects.push(fetched[i])` — no warning is emitted to the
  console or the user, so the project is silently absent from the export file. In incremental
  mode a project without an `updatedAt` field that post-dates `lastExport` is also silently
  excluded (by design, but undocumented in the UI).  
  **Action:** Log a console warning when a project is skipped due to a null IDB read. Consider
  surfacing a "1 project could not be exported" notice in the export success feedback.  
  **Fixed:** commit `0abff0b` — `console.warn` emitted with the project id when `ProjectStorage.get()`
  returns null during export.  
  <sub>[sync-engine.js#L183](../sync-engine.js) · [sync-engine.js#L186](../sync-engine.js)</sub>

- [x] `VER-SYNC-002` [P2] — `computeFingerprint()` must capture all chart-structural data so
  that backstitch-only edits are classified as "conflict", not "merge-tracking".  
  **Finding:** `computeFingerprint()` hashes only `project.pattern[i].id` values plus dimensions
  (`w×h`). It does **not** incorporate `bsLines` (backstitch lines). Two charts that share
  identical stitch-colour grids but differ in backstitch layout produce the same fingerprint and
  are therefore classified as `"merge-tracking"` instead of `"conflict"`. The merge path
  (`mergeTrackingProgress`) takes the **local** project as base — the remote's `bsLines` are
  silently discarded. Users who drew backstitch on one device and different backstitch on another
  will lose whichever device's lines are in the remote file.  
  **Action:** Include a hash of `JSON.stringify(project.bsLines || [])` in the fingerprint
  string before deflating, so backstitch divergence triggers a conflict rather than a
  silent merge.  
  **Fixed:** commit `70627c1` — `|bs:<simpleHash>` suffix appended when `bsLines` is non-empty.
  Empty-bsLines projects are unaffected (suffix omitted), so existing fingerprints stay stable.  
  <sub>[sync-engine.js#L72](../sync-engine.js) · [sync-engine.js#L508](../sync-engine.js)</sub>

- [x] `VER-SYNC-003` [P3] — After import, no project data should be lost for any of the three
  merge cases (both-exist, local-only, remote-only).  
  **Finding:** All three cases handled correctly under normal operation. The `idRewrite` path
  (fingerprint-based match across differing IDs) deletes the old local record **after** saving
  the canonical merged version, so the save-then-delete ordering prevents data loss on crash.
  If a crash occurs between the two writes, the result is a duplicate entry (both the canonical
  and old local IDs exist), not missing data. Local-only projects are enumerated in
  `plan.localOnly` and left untouched.  
  **Action:** No code change required; the ordering is correct. A follow-up could deduplicate
  orphaned IDs on next import.  
  <sub>[sync-engine.js#L761](../sync-engine.js)</sub>

- [x] `VER-SYNC-004` [P2] — Thread inventory from a sync file must NOT overwrite local owned
  counts unless the user explicitly consents.  
  **Finding:** `mergeStash()` is always additive: it takes `Math.max(l.owned, r.owned)` per
  thread, so local owned counts are **never reduced** by a sync import. However two gaps exist:
  (a) the stash merge executes automatically whenever `plan.stashMerge` is set — the user has no
  way to skip it in the `SyncSummaryModal` short of cancelling the entire import; and (b)
  `Math.max` can silently **increase** local owned counts without surfacing which specific thread
  counts changed or by how much. A user who already consumed skeins on Device A and manually
  reduced owned counts will have those counts restored to the higher Device B value without
  warning.  
  **Action:** (a) Add a "Skip stash update" checkbox to `SyncSummaryModal` next to the stash
  preview section. (b) Consider showing a diff ("3 threads will have owned counts increased")
  rather than just the total count badge.  
  **Fixed:** commit `f931759` — (a) checkbox added; `onApply` now passes `{ skipStash }` as
  second argument. `handleApplySync` clones the plan with `stashMerge: null` when `skipStash`
  is true so the entire stash write step is bypassed.  
  <sub>[sync-engine.js#L595](../sync-engine.js) · [modals.js#L563](../modals.js)</sub>

- [ ] `VER-SYNC-005` [P1] — After a successful sync import that includes stash data,
  `cs:stashChanged` and `cs:backupRestored` must be dispatched so Manager and Tracker reload
  their stash state without a manual page refresh.  
  **Finding:** `executeImport()` writes stash data directly to `stitch_manager_db` (step 4) but
  never dispatches `cs:stashChanged`. The calling code in `home-screen.js handleApplySync()`
  only refreshes the home screen's own project list via `ProjectStorage.listProjects()`. Neither
  `cs:backupRestored` nor `cs:stashChanged` is dispatched. Consequently:
  - `manager-app.js` `handleStashChanged` listener never fires → Manager shows stale thread
    counts until the user navigates to another page or triggers a visibility change.
  - `tracker-app.js` `cs:stashChanged` listener never fires → Tracker's stash-coverage
    indicators remain stale.
  - `header.js` and `home-app.js` similarly listen to `cs:backupRestored` for project list
    refreshes — also never triggered by sync.  
  On **non-home pages** the header.js fallback calls `window.location.reload()` after import,
  which sidesteps the problem for the current page only; other open tabs are still not notified.  
  **Action:** After `executeImport` resolves successfully and stash was updated, dispatch both
  `window.dispatchEvent(new CustomEvent('cs:stashChanged'))` and
  `window.dispatchEvent(new CustomEvent('cs:backupRestored'))` from `handleApplySync()` in
  `home-screen.js`. Mirror the same dispatch in the header.js fallback path (before the
  `window.location.reload()` call).  
  **Fixed:** commit `aaefd64` — events dispatched from both `handleApplySync()` and header.js.
  StashBridge.getGlobalStash() also called to refresh home-screen stash stats.  
  <sub>[sync-engine.js#L793](../sync-engine.js) · [home-screen.js#L1347](../home-screen.js) ·
  [manager-app.js#L444](../manager-app.js) · [tracker-app.js#L1593](../tracker-app.js)</sub>

---

## Area 2 — Conflict Resolution

- [x] `VER-SYNC-006` [P4] — Conflict classification labels shown to the user must be
  human-readable, not raw enum values.  
  **Finding:** All labels are human-readable. Stats row badges read "N new", "N identical",
  "N merge", "N conflicts". The `SyncConflictCard` shows "This device" vs "Sync file" side
  labels, edited dates, and dimensions. One minor verbosity concern: the merge-tracking project
  rows display "tracking → merge" — mildly technical but acceptable for a power-user
  sync workflow.  
  **Action:** None required. Optionally soften "tracking → merge" to "progress to merge" for
  non-technical users.  
  <sub>[modals.js#L492](../modals.js) · [modals.js#L505](../modals.js)</sub>

- [x] `VER-SYNC-007` [P4] — The conflict resolution UI must offer at minimum: keep local,
  keep imported, keep both.  
  **Finding:** All three options are implemented in `SyncConflictCard`: "Keep Local" (discard
  remote changes), "Keep Remote" (overwrite local), "Keep Both" (import remote as a new copy
  with " (synced)" suffix). All three are wired to `executeImport`'s `conflictResolutions` map.
  The "Apply Sync" button is disabled until every conflict has a resolution, preventing
  accidental unresolved imports.  
  **Action:** None required.  
  <sub>[modals.js#L643](../modals.js) · [sync-engine.js#L766](../sync-engine.js)</sub>

- [x] `VER-SYNC-008` [P3] — Merge-tracking progress must be merged additively (union of done
  cells); no device's completed stitches should be silently lost.  
  **Finding:** `mergeDoneArrays()` applies bitwise OR — a stitch done on either device remains
  done. `halfDone` quarter-stitch positions are merged by union per cell. Completed sessions are
  deduplicated by timestamp key and merged without loss. **Gap:** `merged.totalTime` is set to
  `Math.max(local.totalTime, remote.totalTime)` rather than the sum. If both devices stitched
  independently (e.g., 2 h on Device A, 3 h on Device B), the merged total is 3 h instead of
  5 h. Stitching time accumulated on the device with less time is silently discarded.  
  **Action:** Sum `totalTime` rather than taking the max, since `sessions` are already
  deduplicated by timestamp; a simple `(local.totalTime || 0) + (remote.totalTime || 0)` is
  an over-count if sessions overlap, but is closer to correct than max for the independent-device
  case. At minimum document the limitation.  
  **Fixed:** commit `0abff0b` — changed to sum. Test assertion updated from 200 (max) to 300
  (100+200 sum). Comment documents the independent-device rationale.  
  <sub>[sync-engine.js#L574](../sync-engine.js)</sub>

- [ ] `VER-SYNC-009` [P2] — The sync format must handle projects deleted on one device; the
  deletion must not be silently reversed by importing another device's sync file.  
  **Finding:** There is no tombstone / deletion-record mechanism in the sync format. A project
  deleted on Device A is absent from A's local IDB map. When Device B's export (which still
  contains the project) is imported on Device A, `classifyProjects()` finds no local match and
  classifies it as `"new-remote"`. `executeImport()` then saves it back to Device A without
  any warning that it was previously deleted. The project reappears silently.  
  **Action:** Introduce a `deletedIds` list in the sync payload (or a lightweight tombstone store
  in IDB). During import, skip or flag "new-remote" entries whose IDs appear in the local
  tombstone list, and surface them as "Previously deleted — restore?" in `SyncSummaryModal`
  rather than auto-restoring.  
  **Fixed:** commit `ef78b12` — `project-storage.js delete()` writes tombstones to
  `localStorage cs_deleted_project_ids`. `sync-engine.js` includes them in export under
  `deletedProjectIds`, filters them in `classifyProjects()`, stores the plan's `remoteTombstones`,
  and absorbs them in `executeImport()` step 5 so deletions propagate bidirectionally.  
  <sub>[sync-engine.js#L732](../sync-engine.js) · [sync-engine.js#L397](../sync-engine.js)</sub>

- [ ] `VER-SYNC-010` [P2] — Import must be safe to run while another tab has the app open and
  is actively saving.  
  **Finding:** `executeImport()` makes sequential `await ProjectStorage.save()` calls per
  project — there is no wrapping IDB transaction. If another tab is in the middle of a save
  for a project that `executeImport` is about to merge, the sequence is:
  1. `executeImport` reads a fresh copy via `ProjectStorage.get(localId)` (line 752)
  2. Other tab's save completes, writing newer state to IDB
  3. `executeImport` calls `ProjectStorage.save(merged)` with the older snapshot, silently
     overwriting the other tab's newer write.  
  The stash merge (step 4) uses a single `readwrite` transaction covering all three stores and
  is atomic — no race there. The project merge phase is the only vulnerable path.  
  **Action:** Document the known limitation and recommend against running sync when the Creator
  or Tracker is open unsaved in another tab. For a stronger fix, flush all in-flight writes
  (`window.__flushProjectToIDB` is already called at export time; a similar mechanism could
  be called at import time) before the merge loop begins.  
  **Fixed:** commit `0abff0b` — `executeImport()` now calls `window.__flushProjectToIDB()`
  at the very start (before any read/write) to drain in-flight creator auto-saves. Also added
  an atomicity-boundary comment (VER-SYNC-013 combined).  
  <sub>[sync-engine.js#L745](../sync-engine.js) · [sync-engine.js#L791](../sync-engine.js)</sub>

---

## Area 3 — Edge Cases

- [x] `VER-SYNC-011` [P3] — Files from a significantly older (or newer) app version must fail
  gracefully with a human-readable error rather than silently importing corrupt data.  
  **Finding:** `validate()` rejects any file where `_version !== SYNC_VERSION` (currently 1)
  with "Unsupported sync file version: N. Please update the app." This covers both older and
  newer files. The check is strict equality, so there is no migration path for minor version
  bumps. The error message correctly tells the user to update the app, which is the only
  available action when the version is unknown. **Gap:** if a future version 2 file is imported
  on a version 1 client, the error is accurate ("update the app"), but if a version 1 file is
  imported on a version 2 client (after an upgrade), the strict check would also reject it — a
  migration path should be planned before `SYNC_VERSION` is ever incremented.  
  **Action:** No change required now. When `SYNC_VERSION` is incremented in future, add a
  migration function and change the version check to `>` rather than `!==` to remain backward
  compatible with older files.  
  <sub>[sync-engine.js#L340](../sync-engine.js)</sub>

- [ ] `VER-SYNC-012` [P3] — Importing a very large .csync file must either succeed or fail with
  a user-visible warning before the browser runs out of memory.  
  **Finding:** `readSyncFile()` calls `FileReader.readAsArrayBuffer(file)` which reads the
  entire file into memory before `decompress()` is called. There is no file-size check before
  this point. A pathological file (many high-resolution embedded thumbnails, hundreds of
  projects, or a large stash history) could exhaust available memory, causing the tab to crash
  or the browser to kill the read without surfacing an actionable error message. No size
  validation or user warning exists at any point in the import pipeline.  
  **Action:** Before `readAsArrayBuffer`, check `file.size` and warn the user if it exceeds a
  reasonable threshold (e.g., 50 MB). The warning need not block the import — a toast
  "Large file (N MB) — import may take a moment" is sufficient.  
  **Fixed:** commit `a8d8444` — both `home-screen.js handleSyncFileSelect()` and `header.js`
  import `onChange` now show a 6-second informational toast before `readSyncFile()` when
  `file.size > 50 MB`.  
  <sub>[sync-engine.js#L327](../sync-engine.js)</sub>

- [ ] `VER-SYNC-013` [P2] — If the import is interrupted mid-way (tab close, crash), the
  database must not be left in an irrecoverable state.  
  **Finding:** `executeImport()` has no rollback mechanism. Each `ProjectStorage.save()` is an
  independent IDB write. If the tab is closed after saving three of ten new-remote projects,
  those three are committed to IDB while the remaining seven are not. On the next import attempt
  from the same file, the three already-saved projects will be reclassified as "merge-tracking"
  or "identical" rather than "new-remote", so re-importing is safe and will complete the
  remaining seven without duplication. However, a partially-merged project (e.g., `done` array
  merged but `sessions` not yet merged because the crash happened mid-loop) would be
  re-classified as "merge-tracking" on retry and re-merged from the updated local state — this
  is also safe. The `LS_LAST_IMPORT` timestamp not being written means the next retry has no
  false "already synced" gate. The `idRewrite` delete-orphan step is the one path where a
  duplicate (not loss) can be left — acceptable.  
  **Action:** Document the atomicity boundary in a code comment. No functional change required
  given the safe re-import path. A future improvement could wrap the loop in a single IDB
  transaction if `ProjectStorage` exposes a batch-write API.  
  **Fixed:** commit `0abff0b` — detailed atomicity-boundary comment added to `executeImport()`
  explaining the per-transaction model, safe-retry guarantee, and no-corruption guarantee.  
  <sub>[sync-engine.js#L745](../sync-engine.js)</sub>

- [x] `VER-SYNC-014` [P4] — Importing the same .csync file twice must not create duplicate
  projects.  
  **Finding:** On re-import of the same file, the merged project's `updatedAt` was set to
  `Math.max(local, remote)` during the first import. On the second import the remote's
  `updatedAt` equals the local's `updatedAt`, so `classifyProjects()` produces
  `"identical"` for all projects — no action is taken. The stats badge shows "N identical";
  the "Apply Sync" button is disabled ("Nothing to sync"). No duplicates are created.  
  **Action:** None required.  
  <sub>[sync-engine.js#L408](../sync-engine.js) · [modals.js#L433](../modals.js)</sub>

- [x] `VER-SYNC-015` [P3] — Missing or corrupt `cs_sync_deviceId` / `cs_sync_deviceName`
  must not prevent export or import.  
  **Finding:** `getDeviceId()` and `getDeviceName()` both catch `localStorage` errors and
  return `"dev_unknown"` / `""` respectively, so export always succeeds. `validate()` falls
  back to `"unknown"` for a missing `_deviceId`. Manual file-based import is unaffected.
  **Gap:** In the folder-watch auto-sync path, `checkForUpdates()` skips any file whose
  `deviceId === myDeviceId` (to avoid re-importing your own export). If two devices both
  have broken `localStorage` — both reporting `"dev_unknown"` — Device A would incorrectly
  skip Device B's sync file thinking it is its own. This would silently suppress all
  folder-watch auto-import between the two affected devices.  
  **Action:** In `checkForUpdates()`, treat `"dev_unknown"` as a non-skippable ID (do not
  skip files where either side is `"dev_unknown"`).  
  **Fixed:** commit `0abff0b` — guard changed to only skip when both IDs are real (non-unknown)
  and equal: `if (f.deviceId && f.deviceId === myDeviceId && myDeviceId !== "dev_unknown") continue;`  
  <sub>[sync-engine.js#L39](../sync-engine.js) · [sync-engine.js#L958](../sync-engine.js)</sub>

- [x] `VER-SYNC-016` [P4] — The sync plan confirmation dialog must show per-category counts
  (new / merge-tracking / conflict / identical) before the user commits.  
  **Finding:** `SyncSummaryModal` shows a stats row with `statBadge` components for each
  classification (new, identical, merge, conflicts) plus a "stash update" badge when stash is
  included. Below the stats row it lists every affected project by name and size, shows a
  side-by-side diff for each conflict with three resolution buttons, and previews the stash
  thread/pattern counts. The "Apply Sync" button is blocked until all conflicts are resolved.
  This fully satisfies the requirement.  
  **Action:** None required.  
  <sub>[modals.js#L461](../modals.js)</sub>

---

## Area 4 — User-facing Feedback

- [x] `VER-SYNC-017` [P4] — A visible loading/progress state must be shown while the sync
  merge is running. (Previously filed as `VER-FB-010` [P2] — FAIL.)  
  **Finding:** **VER-FB-010 is now PASS.** Code has been updated since the prior audit:  
  - `home-screen.js handleApplySync()`: `window.Toast.show({ message: 'Syncing\u2026', type: 'info', duration: 60000 })` is called immediately before `executeImport()`.
  - `header.js` fallback path (non-home pages): identical `window.Toast.show({ message: 'Syncing\u2026', ... })` added.  
  - `SyncSummaryModal`: the "Apply Sync" button changes to "Applying…" while `applying === true`.  
  - `syncBusy` state disables all other sync action buttons during import.  
  The "Syncing…" toast is dismissed (not just auto-expired) on both success and error paths.  
  **Action:** None required. VER-FB-010 should be updated to PASS in the master TODO.  
  <sub>[home-screen.js#L1351](../home-screen.js) · [header.js#L850](../header.js) ·
  [modals.js#L436](../modals.js)</sub>

- [x] `VER-SYNC-018` [P4] — After a successful import, feedback must show counts of projects
  imported, merged, and conflicts resolved.  
  **Finding:** Two feedback mechanisms fire on success:  
  1. The "Syncing…" toast is replaced with nothing (it is dismissed; no persistent success toast).
  2. `setSyncResult({ type: 'success', message: 'Sync complete: N imported, N merged, N resolved, stash updated.' })` renders as an inline status div in the home screen's sync section. This includes all four requested counts.  
  **Minor gap:** There is no persistent toast shown after a successful sync from the home screen
  (the "Syncing…" toast is dismissed silently on success — unlike the non-home path which
  explicitly shows a success toast). The inline `syncResult` div is visible only if the user
  is on the sync section of the home screen; if they have scrolled away they may miss it.  
  **Action:** After dismissing the "Syncing…" toast on success, show a brief success toast
  (`type: 'success'`) in addition to the inline status div.  
  **Fixed:** commit `aaefd64` — `handleApplySync()` now shows a 5-second success toast with
  the "N imported, N merged…" breakdown in addition to the inline status div.  
  <sub>[home-screen.js#L1353](../home-screen.js) · [home-screen.js#L1360](../home-screen.js)</sub>

- [x] `VER-SYNC-019` [P3] — Import failure messages must be specific enough for the user to
  understand what went wrong and what to do.  
  **Finding:** Four named error cases surface clear messages:  
  - Corrupt/unreadable file → "Could not decompress sync file. It may be corrupted."  
  - Wrong format → "Not a valid Cross Stitch sync file."  
  - Wrong version → "Unsupported sync file version: N. Please update the app."  
  - No project data → "Sync file contains no project data."  
  **Gap:** IDB quota exceeded during `ProjectStorage.save()` propagates as a raw
  `DOMException: QuotaExceededError` from the browser, which reaches the UI as
  "Sync failed: QuotaExceededError (DOM Exception 22)" — actionable to a developer but
  opaque to a user. Similarly, if `ProjectStorage` throws during stash write, the
  `catch (e)` in step 4 of `executeImport` only logs a console warning and continues (stash
  merge failure is silently swallowed, with no indication in the success message that stash
  was not updated).  
  **Action:** (a) Catch `QuotaExceededError` specifically and show "Not enough browser storage —
  free up space or clear cached data.". (b) Make stash-write failure throw (or re-throw) rather
  than continuing silently, so the final result accurately reflects whether stash was updated.  
  **Fixed:** commit `a8d8444` — step 1 (project saves) and step 4 (stash write) now both
  re-throw with human-readable messages. `QuotaExceededError` produces "Not enough browser
  storage to complete the sync — free up space…". Other stash errors produce "Stash update
  failed: <detail>". Both reach the UI catch which shows them verbatim.  
  <sub>[sync-engine.js#L789](../sync-engine.js) · [sync-engine.js#L794](../sync-engine.js)</sub>

- [x] `VER-SYNC-020` [P4] — Sync UI elements must be hidden when `SyncEngine` is not defined;
  no broken UI when the feature is unavailable.  
  **Finding:** All sync surface points are guarded:  
  - `header.js`: Export button, Import label, and divider all wrapped in
    `typeof SyncEngine !== 'undefined' && React.createElement(...)`.
  - `home-screen.js`: Sync section only rendered when `typeof SyncEngine !== 'undefined'`; the
    sync status state is initialised to `null` when SyncEngine is absent, suppressing the entire
    panel.  
  - `header.js` sync indicator button: also guarded with `typeof SyncEngine !== 'undefined'`.  
  No broken UI appears when SyncEngine is absent. This extends and confirms both
  `VER-EL-SCR-035-07-01` (PASS in p1-shared-shell-A) and `VER-EL-SCR-035-11e-01` (PASS in
  p1-shared-shell-A).  
  **Action:** None required.  
  <sub>[header.js#L659](../header.js) · [header.js#L800](../header.js) ·
  [home-screen.js#L1262](../home-screen.js)</sub>

---

## Cross-references to existing VER-IDs

| Existing ID | Status in prior audit | This audit's finding |
|---|---|---|
| `VER-AUTH-009` | PASS (p2-cross-cutting-A) | Confirmed still PASS. Export + classify + merge all present. No change needed. |
| `VER-AUTH-013` | PASS (p3-cross-cutting) | Confirmed still PASS for stitch-colour fingerprinting. **VER-SYNC-002 extends it:** `bsLines` not included in fingerprint is a new gap not covered by AUTH-013's scope. |
| `VER-FB-010` | FAIL (p2-cross-cutting-A) | **Now PASS** — "Syncing…" toast implemented in both home and header paths. Master TODO item should be closed. |
| `VER-EL-SCR-035-07-01` | PASS (p1-shared-shell-A) | Confirmed still PASS by VER-SYNC-020. |
| `VER-EL-SCR-035-11e-01` | PASS (p1-shared-shell-A) | Confirmed still PASS by VER-SYNC-020. |

---

## Summary table

| Area | P0 | P1 | P2 | P3 | P4 | Total |
|------|----|----|----|----|----|----|
| Data integrity | 0 | 1 | 1 | 1 | 1 | **4** |
| Conflict resolution | 0 | 0 | 2 | 1 | 2 | **5** |
| Edge cases | 0 | 0 | 1 | 3 | 1 | **5** |
| User feedback | 0 | 0 | 0 | 1 | 3 | **4** |
| **Total** | **0** | **1** | **4** | **6** | **7** | **18** |

> Items marked `[ ]` (open) require action before Phase 4 closes.  
> Items marked `[x]` (pass or informational) need no code change.

### Post-fix status (all findings resolved)

All 10 open items have been implemented and committed. VER-SYNC-011 deferred by design (no action needed until `SYNC_VERSION` is incremented).

| ID | Sev | Commit | Status |
|----|-----|--------|--------|
| `VER-SYNC-005` | P1 | `aaefd64` | Fixed |
| `VER-SYNC-002` | P2 | `70627c1` | Fixed |
| `VER-SYNC-004` | P2 | `f931759` | Fixed |
| `VER-SYNC-009` | P2 | `ef78b12` | Fixed |
| `VER-SYNC-010` | P2 | `0abff0b` | Fixed |
| `VER-SYNC-013` | P2 | `0abff0b` | Fixed (comment) |
| `VER-SYNC-008` | P3 | `0abff0b` | Fixed |
| `VER-SYNC-001` | P3 (action) | `0abff0b` | Fixed |
| `VER-SYNC-012` | P3 | `a8d8444` | Fixed |
| `VER-SYNC-015` | P3 | `0abff0b` | Fixed |
| `VER-SYNC-018` | P4 | `aaefd64` | Fixed |
| `VER-SYNC-019` | P3 | `a8d8444` | Fixed |
| `VER-SYNC-011` | P3 | — | Deferred (by design) |
