# Sync 2 — Duplication Bug Diagnosis

> Read-only audit. Reproduces the known "syncing on a device with
> existing local projects appends rather than merges" bug, traces it
> to specific lines, and classifies the failure mode.

## TL;DR

The duplication bug is **not** in `SyncEngine`'s import pipeline —
that pipeline correctly classifies remote projects by ID and only
imports new IDs. The bug is in **the model itself**: there is no
mechanism to recognise that two projects on two devices, created
independently, are "the same logical project." The current design
is **ID-based deduplication**, and IDs are local-only and not
shared at the moment of project creation.

The pre-sync user journey produces two independent IDs for the same
work, and once both IDs exist, no amount of import logic can
collapse them.

There are also three secondary code paths that compound the
duplicate count:

1. **Conflict resolution "keep both"** explicitly creates a
   duplicate by stripping the ID and resaving (intended behaviour,
   but in this scenario it's the only way users can avoid losing
   work).
2. **Stash patterns** are upserted by `id`, same problem class.
3. **Stash threads** correctly merge by ID (the IDs *are* shared:
   DMC numbers).

---

## Reproduction

### Setup

- **Device A**: Used the app for 2 weeks. Has 4 named projects:
  `Cottage Garden`, `Mountains 3-page`, `Test`, `WIP — Stars`.
  IDs: `proj_171_a`, `proj_172_a`, `proj_173_a`, `proj_174_a`.
- **Device B**: Used the app for 2 weeks. Has 3 named projects.
  Two of them — `Cottage Garden` and `Mountains 3-page` — were
  re-imported from PDF on B because the user thought "the cloud
  will handle it". IDs: `proj_180_b`, `proj_181_b`, `proj_182_b`.

### Steps

1. Both devices have local data. Neither is configured for sync.
2. User opens `/index.html` on Device A → Home dashboard.
3. User clicks "Choose sync folder", picks `~/Dropbox/cross-stitch`.
4. `setWatchDirectory(dirHandle)` persists the handle.
   [sync-engine.js#L716](../sync-engine.js#L716)
5. Auto-sync is enabled. The first time the user saves any project
   on A, `triggerAutoExport` fires after 30 s, writing
   `cross-stitch-sync-A-dev_171_a.csync` to the Dropbox folder
   containing all 4 of A's projects.
   [sync-engine.js#L760](../sync-engine.js#L760)
6. Dropbox propagates that file to Device B over the next ~minute.
7. User opens the app on Device B. Picks the same Dropbox folder.
8. `checkForUpdates(handle)` finds A's `.csync` file. UI shows
   "1 update available from Device A".
9. User clicks "Import" on the update. `prepareImport(syncObj)` runs.

### What happens at step 9

`prepareImport` reads B's local IDB and builds `localMap`:

```
{ proj_180_b: ..., proj_181_b: ..., proj_182_b: ... }
```

Then `classifyProjects(remote.projects, localMap)` runs. For each of
A's 4 projects:

| Remote ID         | Local lookup              | Classification |
|-------------------|---------------------------|----------------|
| `proj_171_a`      | `localMap[proj_171_a]` → null | **`new-remote`** |
| `proj_172_a`      | null                      | **`new-remote`** |
| `proj_173_a`      | null                      | **`new-remote`** |
| `proj_174_a`      | null                      | **`new-remote`** |

The Sync Summary modal opens with **"4 new projects to add"** and a
local-only section listing B's 3 projects "kept as-is".

User clicks Apply. `executeImport` calls `ProjectStorage.save` four
times.

### Final state on Device B

| Project name      | ID            | Came from |
|-------------------|---------------|-----------|
| Cottage Garden    | `proj_171_a`  | imported  |
| Mountains 3-page  | `proj_172_a`  | imported  |
| Test              | `proj_173_a`  | imported  |
| WIP — Stars       | `proj_174_a`  | imported  |
| Cottage Garden    | `proj_180_b`  | local     |
| Mountains 3-page  | `proj_181_b`  | local     |
| (other B project) | `proj_182_b`  | local     |

**6 visible "Cottage Garden / Mountains" rows when the user expects 2.**

### Compounding on subsequent syncs

When B's auto-export fires, it writes a `.csync` containing **all 7
of B's now-local projects**. Device A picks that up. From A's
perspective, 4 of those 7 IDs match locally (the just-imported
copies it originally exported), 3 are `new-remote`. So A imports
B's 3 originals.

Now both devices have 7 distinct project entries: A's original 4
plus B's original 3. The sync is "stable" — no further duplication
on this round-trip. **But the visible name-level duplicates are
permanent.** The user must manually delete one of each pair, on
each device, and they have no UI hint that "this is the duplicate
and that is the original".

---

## Code path

The bug surface is the entire `classifyProjects` function:

```js
// sync-engine.js:320
function classifyProjects(remoteProjects, localProjectsMap) {
  var results = [];
  for (var i = 0; i < remoteProjects.length; i++) {
    var remote = remoteProjects[i];
    var local = localProjectsMap[remote.id] || null;   // ← ID-only lookup
    var entry = { id: remote.id, remote: remote, local: local, classification: "new-remote" };

    if (!local) {
      entry.classification = "new-remote";              // ← unconditional
    } else {
      // ... fingerprint comparison only when ID already matches
    }
    results.push(entry);
  }
  return results;
}
```

There is no scan over `localProjectsMap` looking for unmatched
remotes that *might* be the same content as an unmatched local. The
function's contract is: "remote projects are partitioned into one
of four buckets by ID." If a remote ID isn't in local, it's new.

Combined with the fact that `proj_<timestamp>_<rand>` is generated
purely on-device with no shared seed, two devices that
independently create the same logical pattern (e.g. by importing
the same PDF, or by manually re-creating it) will always have
distinct IDs.

---

## Is this a design flaw or a bug?

**Design flaw.** The merge engine is internally consistent: it does
exactly what its contract says. The contract is wrong for the
"first sync between two pre-existing devices" scenario.

A merge strategy that handles this scenario was never built. Look
for evidence in the source: there are no `findByContent`,
`findByFingerprint`, `matchExistingLocal`, or `reconcileFirstSync`
helpers anywhere in [sync-engine.js](../sync-engine.js). The
"first-time sync" case isn't called out in any comment. The
[SyncSummaryModal](../modals.js#L408) has no copy that prepares the
user for "you may be about to create duplicates".

The existing `fingerprint` field could be repurposed to detect this
case post-hoc — and that is the cheapest fix — but doing so
requires opting into a behaviour change in `classifyProjects` and
adding a new "possible duplicate" classification that the modal can
present.

---

## Does this affect data other than projects?

### Stash threads — **safe**.

`mergeStash` keys threads by DMC ID
([sync-engine.js#L489](../sync-engine.js#L489)) and DMC IDs are
universal (310, 550, etc.), so two devices necessarily use the same
keys. Per-thread merge is `Math.max` for `owned` and OR for
`tobuy`, so a fresh sync between two pre-populated stashes
correctly takes the larger inventory.

### Stash patterns — **vulnerable to the same bug**.

[sync-engine.js#L520](../sync-engine.js#L520) upserts pattern-library
entries by `id`. Pattern-library entries are written by
`StashBridge.syncProjectToLibrary` whenever a project is saved
([project-storage.js#L257](../project-storage.js#L257)) and they
inherit the project's `id`. So they only ever exist on the device
that authored the project — duplicate projects → duplicate library
entries. Same root cause.

### Sessions / progress — **safe within a project**.

`mergeSessions` deduplicates by `start` timestamp
([sync-engine.js#L380](../sync-engine.js#L380)). But this only fires
when the chart fingerprints match (`merge-tracking` classification),
which never happens for the duplication bug since the projects
don't match by ID at all. So duplicate projects also produce
duplicate session histories.

### `done` arrays — **safe within a project**, lost across the duplicate.

`mergeDoneArrays` ORs the arrays
([sync-engine.js#L362](../sync-engine.js#L362)). Same proviso as
sessions: only runs for matched IDs.

### Settings / preferences — **safe-ish**.

`prefs` syncing is opt-in (`includePrefs === true`), and even when
included it's just two specific localStorage keys:
`crossstitch_active_project` and `crossstitch_custom_palettes`.
The active-project pointer being overwritten on a sync is its own
small surprise (Device B suddenly has Device A's last-opened
project as "active"), but it's not a duplication issue.

### Folder watch handle — **per-device**.

Stored in IDB, never synced. Correct.

---

## Adjacent observations (collected for sync-3)

These came up while tracing the bug; they are filed in detail in
[sync-3-all-issues.md](sync-3-all-issues.md).

- **No "first time meeting populated sync folder" prompt.** The
  reconciliation rule the user wants — "show me what's about to
  happen, let me match these by name, then commit" — has no UI
  surface today.
- **Local-only projects are silently kept on every import**. Good
  default, but combined with the duplicate-ID problem, it means a
  user has no way to say "actually that local-only one IS the same
  as that remote one, please merge them."
- **Projects can never be deleted across devices.** A delete on
  Device A doesn't propagate; the next import on A from B's file
  re-creates the project A just deleted (because B still has it).
  Tombstones are not implemented.
- **`auto_save` legacy key.** The legacy single-project key is
  excluded from sync (`listProjects` filters to `proj_*` only) but
  `ProjectStorage.delete` clears `auto_save` if it points to the
  deleted project — sync doesn't see this.

---

## Minimum viable fix

The smallest patch that resolves the user-visible bug:

1. In `classifyProjects`, after the existing ID-match pass, run a
   second pass over remote projects classified as `new-remote` and
   compare each one's `fingerprint` against the fingerprints of
   `localOnly` projects (computed lazily). On a match, reclassify
   as a new bucket: `possible-duplicate`.
2. Add a "Possible duplicates" section to `SyncSummaryModal` with
   per-row choice: "Merge into local" (adopt remote ID, keep local
   data, run tracking-merge), "Keep separate" (current behaviour),
   "Replace local" (overwrite).
3. On "Merge into local", invoke a new `mergeIntoLocal(localId,
   remoteData)` that calls `mergeTrackingProgress` and saves under
   `localId`, then records the remote's ID as a tombstone so the
   next sync won't re-import it.
4. Persist a small per-device `id_aliases.json` map so subsequent
   syncs of A's `.csync` from B already know "their `proj_171_a`
   is our `proj_180_b`".

This is the substance of Phase 2 / Phase 5 design work — it is
**not a one-line fix**, despite the underlying logic being clear.
The trade-offs (auto-merge vs. user prompt, what counts as a
"close enough" fingerprint match) are explicitly the user-facing
decisions Phase 3 will gather.

---

## End of duplication bug diagnosis
