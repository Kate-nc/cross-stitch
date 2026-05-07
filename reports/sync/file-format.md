# Agent 2 — File Format (bridge between Link [1] and Link [5])

## VERDICT: WORKING

The `.csync` format is well-designed for cross-device sync. Projects are keyed
by globally-unique IDs (no device suffix), device metadata is informational
only and never used to filter, and there is no encryption keyed to a single
device. A new project from Device A will be classified `"new-remote"` and
imported on Device B without any silent drop.

## Format

- Outer: `pako.deflate` (raw DEFLATE) of a UTF-8 JSON string
- Filename per device: `cross-stitch-sync-<deviceName>-<deviceId>.csync`
  (each device writes its **own** file — devices do **not** share one file)
- Decompressed payload:

```json
{
  "_format": "cross-stitch-sync",
  "_version": 1,
  "_createdAt": "...ISO...",
  "_deviceId": "dev_...",
  "_deviceName": "...",
  "_mode": "full" | "incremental",
  "_since": null | "...ISO...",
  "_projectCountTotal": 42,
  "deletedProjectIds": ["proj_..."],
  "projects": [{ "id": "...", "updatedAt": "...", "fingerprint": "...", "data": {...} }],
  "stash": {...},
  "prefs": {...}
}
```

Citations: sync-engine.js:7–8 (constants), :240–260 (build payload),
:321/:326 (compress/decompress), :381 (version check).

## Per-question findings

| # | Question | Finding | Citation |
|---|---|---|---|
| 1 | Format | JSON + pako.deflate | sync-engine.js:321,326 |
| 2 | Version negotiation | Strict equality `_version === 1`; mismatch throws "Unsupported sync file version" | sync-engine.js:378–382 |
| 3 | Device-specific filtering | **None** — `_deviceId`/`_deviceName` are informational; never used to gate import | sync-engine.js:248, classifier 437–520 |
| 3a | Project key | Bare `id` (e.g. `proj_<ts>_<rand>`); no device-ID namespacing | sync-engine.js:256 |
| 4 | Classification | new-remote / merge-tracking / conflict / identical / tombstoned | sync-engine.js:437–520 |
| 4a | Tombstones | `cs_deleted_project_ids` localStorage list; remote tombstones absorbed into local list on import | sync-engine.js:60–70, project-storage.js:484–495 |
| 5 | Concurrent writes | Per-device filename → no direct file collision. Project-level conflicts surfaced to user (not silently merged) | sync-engine.js:477–507 |
| 6 | Encryption / signing | None — payload is plaintext after decompress | n/a |

## Could a new pattern from Device A be silently dropped?

**No**, provided:
- Device B has not deleted that project ID (would tombstone it)
- App versions on both devices match (mismatched `SYNC_VERSION` aborts the
  whole import with an error)

## IMPORTANT IMPLICATION FOR THE ACTUAL BUG

Each device writes to its own file. So Device B is **not** looking for changes
to Device B's file (it knows it wrote it). Device B must scan the watch
folder for **other** devices' files and import any whose `_createdAt` /
`updatedAt` is newer than its `LS_LAST_IMPORT` baseline. That scan is
`SyncEngine.checkForUpdates()`. Whether and when that scan is invoked is
covered by Agent 4 — and that is where the chain breaks.

## Verification

1. Decompress a `.csync` file:
   ```js
   const buf = await file.arrayBuffer();
   const json = JSON.parse(new TextDecoder().decode(pako.inflate(new Uint8Array(buf))));
   console.log(json._format, json._version, json.projects.map(p => p.id));
   ```
2. Confirm `_format === "cross-stitch-sync"`, `_version === 1`, no project IDs
   contain a device suffix.
