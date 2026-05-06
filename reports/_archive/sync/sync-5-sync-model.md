# Sync 5 — Sync Model Recommendations

> Phase 2 design. Six core architectural decisions, each with the
> options evaluated and a recommended choice.

## Recap of constraints

- **Single user, multiple devices.** No collaboration. Same person
  on tablet, laptop, desktop.
- **Local-first.** App must function fully offline with no sync.
- **No server.** Folder is mediated by Dropbox / Google Drive / iCloud / OneDrive.
- **Data loss is the only unacceptable outcome.** Duplicates are
  tolerable; silent loss is not.
- **Stitch progress is monotonic.** A done stitch cannot be undone
  by a sync conflict (only by an explicit user undo).

## 1. Source of truth — RECOMMENDED: **local IDB is the truth, sync folder is a snapshot**

| Option | Pros | Cons | Verdict |
|--------|------|------|---------|
| Sync folder is truth, local is cache | Simple "always re-read on launch"; never lose folder data | Useless offline (no folder access on a flight); cloud delays = stale UI; permission lapse breaks app | ❌ Violates offline-first |
| Local is truth, folder is snapshot/backup | Offline-first; cloud is opt-in enhancement | Need merge logic for incoming snapshots | ✅ Recommended |
| Both are peers, full CRDT | Most robust; rich merge | Massive implementation cost; per-stitch CRDT is overkill for single-user | ❌ Overengineered |

**Recommendation:** Local IDB is canonical. Sync folder is a
distributed log of per-device snapshots. Each device produces its
own snapshot of "what I know"; reading other devices' snapshots
augments (never replaces) local. Imports are explicit reconciliation
events.

This matches the existing model and the existing folder shape — no
disruptive migration is required.

## 2. Conflict resolution — RECOMMENDED: **fork-on-chart-conflict, additive-on-progress, prompt-on-fingerprint-collision**

The unit being conflicted matters:

| Data class | Strategy | Why |
|-----------|----------|-----|
| `done` array (per-stitch progress) | **Additive union** (logical OR) — always | Stitches are monotonic; both devices completing a stitch is the same fact |
| `halfDone` per-cell quarter stitches | **Additive union** (logical OR per quarter) | Same monotonicity |
| `sessions` / `statsSessions` | **Dedup by `start` timestamp, union remaining** | Sessions are append-only history |
| `threadOwned` (per-project) | **OR (any device says owned ⇒ owned)** | Inventory is monotonic |
| `parkMarkers`, `achievedMilestones` | **Union by position/id** | Same |
| Chart cells (`pattern[]`), palette, dimensions | **Fork on conflict** — keep both as separate projects with clear naming | Per-cell merge would silently miss intent; user is best judge |
| Project metadata (`name`, `designer`, `description`) | **Last-write-wins by `updatedAt`**, with a "history of edits" stored for 30 days | Cosmetic; revertable |
| Stash threads | **Per-thread `Math.max(owned)`, OR(tobuy)** — already correct | Same as today |
| Stash patterns | **Newest `updatedAt` wins, with link back to source project** | Already correct |
| Stash inventory history (`history[]`) | **Dedup-and-union by `(date, delta)`** — already correct | Append-only |

The new "fingerprint match without ID match" case is presented to
the user as **"possible duplicate"** with three actions:

1. **Merge into local** — adopt the local ID, keep local chart, do
   `mergeTrackingProgress` from remote (additive on done/sessions),
   record an alias `remoteId → localId` so future syncs route
   correctly.
2. **Keep separate** — current behaviour; both remain.
3. **Replace local with remote** — current `keep-remote`; backed up
   to undo store first.

**Default suggested action:** _Merge into local_ when the project
contents are unambiguously the same logical pattern (fingerprint
matches AND name fuzzy-matches). Otherwise no default — user must
choose.

## 3. Change detection — RECOMMENDED: **fingerprint + receipt-tracking, NOT mtime**

| Option | Issue |
|--------|-------|
| `lastModified` mtime | Cloud drives rewrite mtimes during sync; clocks drift between devices |
| Per-project `updatedAt` | Already used, but compares strings; fine within one project, useless across the sync layer |
| Content hash (SHA-256) | Authoritative; detects same-content-different-timestamp |
| Per-receipt log on consumer | Tracks "I have already imported file <hash> from device <id>"; immune to mtime games |

**Recommendation:** Add a `_contentHash` field to each `.csync`
(SHA-256 of the canonical-JSON of `projects[]+stash`). On the
consumer side, store `cs_sync_receipts: { [deviceId]: lastImportedHash }`
in IDB. `checkForUpdates` compares incoming hash to the receipt
for that device. If the same, skip. If different, surface as an
update. mtime is only used as a heuristic for "this file is being
written right now" detection (size growing across reads).

Per-project, **`updatedAt` + `syncVersion` counter + per-cell
fingerprint** stays; that triple is what classification uses.

## 4. Sync granularity — RECOMMENDED: **per-device snapshot today; per-project snapshot in v2**

| Option | Pros | Cons |
|--------|------|------|
| Whole IDB as one blob | Atomic; simple | Constant cloud re-uploading; bandwidth |
| Per-device blob (today) | Smaller updates than "whole DB"; one file per device is intuitive | Still re-uploads everything on a single edit |
| Per-project files (`projects/<id>.csync`) + small index | Minimal upload churn; fine-grained conflict scope | More files; needs index file for browser folder enum |
| Per-project + per-tracking-data split | Lets progress sync independently of chart data | Overengineered for single-user |

**Recommendation for Phase 5 implementation now:** keep
**per-device snapshots** to minimise risk. The bug fix doesn't
require a granularity change.

**Recommendation for v2 (post-bug-fix):** migrate to
`projects/<projectId>/<deviceId>.csync` + `index.json`. Each device
writes one file *per project it edited*, plus its index. Cloud only
re-uploads what changed.

This is non-destructive: v2 reads can absorb v1 files seamlessly
because the index file is optional ("if no index found, scan all
.csync files at root and treat as v1").

## 5. Sync trigger — RECOMMENDED: **on-load read + 30 s debounced write + 60 s visible-page poll + manual button**

| Trigger | Use it? | Why |
|---------|---------|-----|
| On app startup | ✅ | Catches overnight changes |
| On window `visibilitychange` → visible | ✅ | User came back to the tab |
| On every save | ❌ direct write; ✅ schedules debounced write | Direct writes hammer cloud |
| Debounced 30 s after last save | ✅ (already implemented) | Coalesces bursts |
| Polling timer | ✅, every 60 s, only when page is visible AND folder is configured | The missing piece — finds inbound updates without user action |
| `FileSystemObserver` | ❌ for now | Too new, Chromium-only experimental |
| Manual "Sync now" | ✅ | User control / recovery |

The polling step is new and is what closes issue #10 from
[sync-3](sync-3-all-issues.md).

## 6. First-time sync behaviour — THE DUPLICATION FIX

When a device with **existing local data** points at a sync folder
that **already contains data**, the system should:

1. **Detect the first-time case explicitly.** Conditions:
   `cs_sync_lastImportAt` is null AND there is at least one local project AND the
   folder contains at least one `.csync` from another device.
2. **Open a dedicated reconciliation wizard** (not the regular
   Sync Summary modal):
   - Step 1: "We found 5 projects locally and 7 projects in the
     sync folder. Let's match them up before merging."
   - Step 2: A two-column matcher. Left: local projects. Right:
     remote projects. Suggested matches (fingerprint AND fuzzy
     name) pre-filled with a link line. User can confirm, change,
     or break the suggestion.
   - Step 3: For each matched pair, choose **Merge** (local +
     remote tracking unioned), **Keep both** (current bug
     behaviour, but now opt-in), or **Replace local with remote**.
   - Step 4: Confirmation: "X merged, Y kept separate, Z imported
     fresh. Local backup created. Continue?"
3. **Snapshot local IDB to the undo store before any write.**
4. **Persist the alias mapping.** When a remote `proj_X` is
   merged into local `proj_Y`, store `aliases[proj_X] = proj_Y`
   in IDB. Future syncs of the same source file route remote
   `proj_X` to local `proj_Y` automatically — no second prompt.
5. **Post-import banner with single-click undo for 60 seconds.**

For the suggested matches:

- Strong match: same `fingerprint` (chart structure identical) →
  pre-select "Merge".
- Medium match: similar fingerprint (same dimensions, same palette
  IDs, > 90 % cell overlap) AND fuzzy name match → pre-select
  "Merge" with a yellow caution badge.
- Weak match: name fuzzy-match only → suggest as a candidate but
  do not pre-select.
- No match: present as "new" or "local-only" as today.

This is the **single most important change** in the whole design;
it directly resolves the user's reported bug.

---

## End of sync model recommendations
