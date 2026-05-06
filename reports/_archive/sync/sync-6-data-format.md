# Sync 6 — Data Format

> Phase 2 design. Versioned on-disk format with integrity hash,
> migration plan from v1 (current), and folder-layout choices that
> play well with cloud drives.

## TL;DR

- Bump format to **v2** (additive, backward compatible: v2 readers can read v1, v1 readers see "unsupported version" but the v2 writer also drops a `*.csync` v1 fallback for one release cycle).
- Add `_contentHash`, `_appVersion`, `_aliases`, `_tombstones`, `_orphanedAliasFrom`.
- Keep one file per device for v2. Plan a v3 transition to per-project folders without breaking v2 readers.
- Avoid problematic filename characters; cap names; document a `README.txt` in the folder so the user knows what these files are.

---

## v2 file shape

```jsonc
{
  "_format": "cross-stitch-sync",
  "_version": 2,
  "_appVersion": "0.42.0",
  "_createdAt": "2026-04-29T12:34:56.789Z",
  "_deviceId": "dev_1729e_8f3a",
  "_deviceName": "Tablet",
  "_mode": "full",
  "_contentHash": "sha256-3f8a…b21c",     // NEW — over canonical-JSON of {projects, stash}
  "_projectCountTotal": 7,

  "projects":   [ … same as v1, with extra `syncMeta` ],
  "stash":      { … same as v1 },
  "prefs":      { … opt-in only },

  "_aliases":     { "proj_171_a": "proj_180_b" },          // NEW — id reroutes
  "_tombstones":  [ { "id": "proj_173_a", "deletedAt": "2026-04-28T…", "scope": "project" } ]
                                                          // NEW — propagatable deletes
}
```

### Field definitions

| Field | Purpose |
|-------|---------|
| `_version` | Bumped to `2`. v1 readers reject; v2 readers can read v1 (treat missing fields as defaults). |
| `_appVersion` | Producing client semver — for diagnostics only. Never used as a gate. |
| `_contentHash` | SHA-256 over canonical-JSON of `{projects, stash}` excluding `_aliases`/`_tombstones`/`_contentHash`. Used by `checkForUpdates` (skip if matches receipt). |
| `_aliases` | `{remoteId: localId}` map. When this device merged a possible-duplicate into a local id, the mapping is included so other devices can adopt the same alias. |
| `_tombstones` | Append-only list of deleted-project events. GC'd locally after 90 days. |
| `syncMeta` (per-project) | Already exists. Add `aliasOf` if this project absorbed another id. |

### What is NOT in the file

- The active-project pointer (`crossstitch_active_project`) — per-device only.
- Folder watch handle — per-device only.
- Per-page UI state (zoom, scroll positions, recent views) — per-device only.

## Integrity check

Before parsing `projects`, the v2 reader recomputes SHA-256 over the
canonical-JSON of `{projects, stash}` and compares to `_contentHash`.

| Hash result | Action |
|-------------|--------|
| Match | Proceed |
| Mismatch | Surface as "Sync file appears damaged: <name>. Local data is safe." with [View details] [Retry] [Delete] |
| `_contentHash` missing (v1 file) | Proceed; treat as opt-out of integrity check |

## Migration from v1

Non-destructive. The migration is one-shot per device-pair:

1. v2 writer reads v1 files in the folder normally (no transformation).
2. v2 writer writes v2 file. Filename unchanged
   (`cross-stitch-sync[-name]-<deviceId>.csync`), so it overwrites
   the device's own v1 file in place.
3. v2 reader reads v2 files normally. Reading another device's v1
   file is supported (treat `_contentHash` and `_aliases` as missing).
4. **One-release-cycle compatibility for v1 readers:** v2 writer
   *also* writes a `cross-stitch-sync-…-<deviceId>.csync.v1` file
   that contains a v1-format-compatible payload (the existing
   `mode === 'full'` payload). v1 readers will ignore unknown
   `.csync.v1` extensions; v2 readers prefer the `.csync`. After
   the next release, drop the `.v1` shadow.

This means a Device A on the old release talking to Device B on the
new release continues to work, with the only loss being that A
doesn't know about aliases/tombstones until A also updates.

## Filename conventions

Today: `cross-stitch-sync[-<deviceName>]-<deviceId>.csync`

- `deviceName` regex: `[^a-zA-Z0-9_-]` stripped, truncated to 20.
- `deviceId` regex: `[^a-zA-Z0-9_-]` stripped, truncated to 30.

Improvements for v2:

- Cap total filename length at 80 chars (Windows-safe under most
  cloud sync paths).
- Reject any control character `< 0x20` (paranoia).
- Truncate device name to **16** to keep room for full deviceId.

This stays compatible with the v1 namespace.

## Folder layout v2 (today's recommendation)

```
~/Dropbox/cross-stitch/
├── README.txt                                       (new — written on first export)
├── cross-stitch-sync-Tablet-dev_1729e_8f3a.csync
├── cross-stitch-sync-MacBook_Pro-dev_1730a_19b2.csync
└── cross-stitch-sync-Desktop-dev_1731b_22c5.csync
```

`README.txt` content (drop-in template):

```
This folder is managed by the Cross Stitch app.

You'll see one .csync file per device that's set up to sync (e.g.
Tablet, MacBook Pro). The app reads and writes these files via
your cloud drive (Dropbox / Google Drive / OneDrive / iCloud).

DO NOT
  • Rename, edit, or delete these files unless you've disconnected
    that device from sync first. Doing so may interrupt syncing.
  • Open them in another app — they're compressed binary blobs.

If something goes wrong, the app keeps an undoable local backup of
your last sync for 7 days. Open the app and look for "Undo last
sync" or visit Preferences → Sync, backup & data.
```

## Folder layout v3 (future, NOT in this implementation pass)

When per-project granularity is needed (sync churn, large stashes):

```
~/Dropbox/cross-stitch/
├── README.txt
├── index.json                                       (per-device hashes & known projects)
├── projects/
│   ├── proj_171_a/
│   │   ├── tablet.csync
│   │   └── desktop.csync
│   └── proj_172_a/
│       ├── tablet.csync
│       └── desktop.csync
├── stash/
│   ├── tablet.csync
│   └── desktop.csync
└── tombstones.csync                                 (single shared file)
```

v2 readers ignore `projects/` and `stash/` subfolders. v3 readers
prefer per-project files when `index.json` is present, fall back
to top-level v2 files otherwise.

## Cloud-drive considerations baked into the format

| Concern | Mitigation |
|---------|------------|
| Cloud rewrites mtime | Use `_contentHash` not mtime for change detection |
| Cloud creates `(conflicted copy)` files | Filename pattern detection: any name matching `/conflicted copy|\(\d+\)\.csync$| \(macOS\)/` flagged for user review, not auto-imported |
| Cloud has file count limits (Dropbox: ~10 K) | One file per device today; per-project layout v3 designed to stay under 1 K files for typical users (10 devices × 100 projects) |
| Cloud ignores 0-byte files for upload | Atomic write (write to `.tmp`, hash-verify, move) prevents 0-byte states |
| Cloud strips Unicode normalisation | Filenames ASCII-only via current regex; preserved |
| Cloud case sensitivity (macOS HFS+ insensitive, Linux sensitive) | Filenames lowercase ASCII + numerics + `_-`; safe across all targets |
| Sharing folder with another user (intended single-user) | Document explicitly in README.txt as unsupported; second user's deviceId would still be unique so behaviour degrades gracefully |

## Reading the folder safely

The new reader (`scanFolder` v2):

1. Read directory entries.
2. Skip files that don't end in `.csync`.
3. Skip files matching cloud-conflict patterns; record them in a
   side-channel for the UI to surface as "review me".
4. For each remaining file:
   - `getFile()` → check `size > 200` (smallest valid v1 is ~200 bytes deflated).
   - `arrayBuffer()` → `decompress()` → `validate()`.
   - On failure, retry once after 5 s (cloud may be mid-download).
   - Compute `_contentHash` if absent (v1 files); compare to
     `cs_sync_receipts[deviceId]`. If unchanged, skip.
5. Return the surviving entries as candidates.

## End of data format design
