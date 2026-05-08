# Sync-reference Diagnosis — "Review sync" Empty on the Second Device

> Read first: [reference-storage.md](reference-storage.md),
> [review-gate.md](review-gate.md), [cross-reference.md](cross-reference.md).
> Cross-references the earlier sync audit at
> [../sync/00_DIAGNOSIS.md](../sync/00_DIAGNOSIS.md).

## TL;DR

The user's prompt anticipated a single bug ("the file reference is stored in
a device-local location"). The investigation found a different, narrower
bug, plus several adjacent issues the prior audit missed.

**Primary bug (this audit):** the watcher and the "Review sync" menu surface
speak different events. The watcher publishes
`cs:syncUpdatesAvailable`; the `SyncReviewGate` modal listens (via the
module-local `_lastReceivedPlan` in [header.js](../../header.js#L14-L33)) only
for `sync-plan-ready`. So even when the watcher has already prepared a
plan from Device A's `.csync` file, "Review sync" on every page outside
`/home` reports "Nothing new to review." Closest match in the directive's
taxonomy: **Scenario C** with a UI-side twist (the engine *can* read the
file; the gate just isn't told).

**Secondary issues** the directive flagged that turn out to be non-bugs:
no absolute paths are stored, no `.csync`-internal "joined" record is
needed, and the watch-folder handle being device-local is expected behaviour
for the File System Access API.

## The two-channel mismatch

```
.csync arrives in folder
        │
        ▼
 watcher tick (sync-engine.js:1786 _processFolderUpdates)
        │
        ├── conflict-free?  → executeImport + 'cs:backupRestored'
        │                       → /home reloads project list
        │                       → "Review sync" gate STILL EMPTY (plan never published)
        │
        └── conflicts?      → 'cs:syncUpdatesAvailable'
                                → home-screen.js banner
                                → click "Review & import"
                                  → SyncSummaryModal (different modal!)
                                → "Review sync" gate STILL EMPTY (plan never published)
```

Manual import via the header file picker is the *only* path that fires
`sync-plan-ready` ([header.js](../../header.js#L850-L862)). That's the only
path that populates `_lastReceivedPlan`, which is the only thing the
`SyncReviewGate` will accept.

The empty-state copy at
[modals.js:1311-1318](../../modals.js#L1311-L1318) doesn't distinguish "no
folder ever connected" from "folder connected, watcher has plans queued, but
the gate never received them," so the user gets a misleading instruction to
re-import a file the app has already picked up.

## Cross-device storage map (for the record)

| Reference | Storage | Cross-device? |
|---|---|---|
| Watch-folder handle | IDB `cross_stitch_sync_meta`/`sync_state`/`watchDirHandle` | No — and this is the right design (`FileSystemDirectoryHandle` represents a *permission grant*, not a portable path) |
| Last received plan | In-memory `_lastReceivedPlan` in `header.js` | No (lost on reload) |
| Per-device import history | localStorage `cs_sync_lastImportPerDevice` | No |
| Snapshot baseline | IDB `CrossStitchDB`/`sync_snapshots`/`latest` | No |
| Activity log | localStorage `cs_sync_eventLog` | No |
| Device identity | localStorage `cs_sync_deviceId` / `cs_sync_deviceName` | Stamped into outgoing `.csync` as `_deviceId` / `_deviceName` (informational only) |
| `.csync` file itself | Disk in shared folder | **Yes** — the only cross-device transport, and the only one that needs to be |

Full citations in [reference-storage.md](reference-storage.md).

## Mapping to the directive's three scenarios

### Scenario A — *Move the reference to a cross-device location*
**Doesn't apply.** No usable reference is being stored in the wrong place.
The `.csync` file already *is* the cross-device reference, and the watch
folder is meant to be re-granted on each device for browser-permission
reasons.

### Scenario B — *Each device must import independently, UX is unclear*
**Partly applies.** Each device must connect a watch folder once via
`showDirectoryPicker()`. That's expected. The misleading part is the
"Nothing new to review… import a .csync file" copy, which implies a manual
per-device import is required *every time*, not just the one-off folder
grant.

### Scenario C — *Reference exists cross-device, second device can't read it* — **closest fit**
**Applies, with a twist.** The watcher *can* read the file. The bug is in
the *gate* (UI-side), not in the read path. The plan reaches the engine but
not the gate's in-memory slot.

## Recommended fix (preview — for human review only)

Listed cheapest-first. **No code has been changed.**

1. **Bridge the two channels.** In `_processFolderUpdates`, also dispatch
   `sync-plan-ready` for the most-recent pending plan (or assign it directly
   to a SyncEngine-owned slot like `SyncEngine.getPendingPlan()` that
   `SyncReviewGate` and the header listener both read). One-line behaviour
   change; small, isolated.

2. **Make `SyncReviewGate.open()` actively rescan if no plan is in memory.**
   When `_lastReceivedPlan` is null, call `SyncEngine.checkForUpdates(handle)`
   and surface the most-recent plan if one exists. Falls back to today's
   empty state only when the folder genuinely has nothing new.

3. **Persist the latest pending plan.** Move `_lastReceivedPlan` from
   `header.js` module scope to a small IndexedDB record in
   `cross_stitch_sync_meta` (or onto `SyncEngine`). Survives reloads and is
   visible to every page in the app, not just the tab where the manual
   import happened.

4. **Disambiguate the empty-state copy.** Three states deserve three
   messages:
   - No watch folder connected here → "Connect a sync folder, or import a `.csync` file."
   - Folder connected, nothing new since last review → "You're up to date with [folder name]."
   - Folder connected, error reading it (permission revoked) → existing "Reconnect" UX from [home-screen.js](../../home-screen.js#L2243-L2250).

5. **(Optional, larger.)** Unify `SyncSummaryModal` (banner-driven) and
   `SyncReviewGate` (header-driven) so there's one review UI and one event
   contract. Removes a long-term source of the same class of bug.

The Phase-2 "auto-apply pure-new-remote" recommendation from the earlier
audit ([00_DIAGNOSIS.md §Recommended fix order #2](../sync/00_DIAGNOSIS.md))
is still valid and complementary, but should not run *before* fix #1 above —
otherwise auto-applied plans disappear from "Review sync" entirely with no
way to inspect what was imported.

## Effort & risk

| Fix | Effort | Risk |
|---|---|---|
| #1 Bridge channels | One-line in `_processFolderUpdates` | Low — additive event |
| #2 Rescan on open | ~10 lines in `SyncReviewGate` | Low — opt-in inside gate |
| #3 Persist plan | Small IDB store change | Medium — needs cleanup on apply/dismiss |
| #4 Empty-state copy | UI-only | None |
| #5 Unify modals | Refactor across two files | Medium — touches both `/home` and header surfaces |

## What the prior audit missed (summary)

Documented in full in [cross-reference.md](cross-reference.md). The two
audits together now cover:

- Detection (prior audit): polling loop + visibility re-check.
- Surfacing (this audit): event-channel mismatch, in-memory-only plan,
  passive gate, ambiguous empty state, two parallel review modals.

## Verification before/after fix (hand-runnable)

```
Pre-fix repro on Device B
  1. Connect watch folder (one-time grant).
  2. Externally drop a fresh .csync from Device A into the folder.
  3. Wait ≤10 s for watcher (assuming polling fix is in place).
  4. /home shows the banner ✓     ← engine sees it
  5. Click File → Review sync from /create or /stitch.
  6. Modal says "Nothing new to review." ✗   ← gate doesn't

Post-fix expectation
  Step 5/6: modal shows the same plan the banner is offering, regardless
  of which page it's opened from. Empty state only appears when the
  folder genuinely has no new files since the last review.
```

---

**Stopping here for human review per the directive — no code has been
modified.** Once you're happy with this diagnosis, the cheapest first step
is fix #1 (bridge the event channel in `_processFolderUpdates`).
