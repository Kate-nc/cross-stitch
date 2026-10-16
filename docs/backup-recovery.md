# Backup recovery contract

Full backup v2 (`cross-stitch-backup`) uses JSON or the existing `CSB1\n` deflate/base64 envelope. Version 1 remains readable, including partial database exports and files without portable preferences. Project records are preserved wholesale, including older `v`/compact grids understood by the normal project readers. The current project version is 11; future declared versions are rejected. Normal app migrations operate on the newly published generation, never the previous databases. The migration marker is reset for imported projects.

## Recovery inventory

| Data | Recovery source |
| --- | --- |
| Chart cells, custom colours/blends, backstitch, half/fractional stitches, knots, parking markers | Entire `projects` records; no lossy field selection |
| Completion, removal history, notes, settings, snapshots, saved sessions and project inventory references | Entire project records; validated persisted Tracker progress/recovery journals are folded into the project before export |
| Active timer recovery | Project-owned `session:` checkpoints, including retirement fences |
| Photographs and thumbnails | Project-owned `photo:` / `photothumb:` records, full Blob bytes and metadata |
| Tracing pictures | Project-owned `trace:` records, full Blob bytes and metadata |
| Library, threads, purchase history, allocations and live deduction checkpoints (`rt_deduction:<project>`) | Every `manager_state` record, including unknown accounting keys |
| Global portable preferences, branding/logo, goals and custom palettes | Versioned preference allowlist and explicit safe localStorage keys |
| Lightweight summaries and prior Sync snapshot | `project_meta`, `stats_summaries`, `sync_snapshots` |

Temporary handoffs, unconverted drafts, orphaned blobs, importer telemetry, device preferences, browser permissions and Sync credentials/configuration are explicitly excluded. A new full backup includes an attachment manifest even when empty. CRC32 over the entire JSON payload detects accidental corruption; it is not a signature, encryption or proof of authenticity. Legacy archives cannot prove which attachments were absent at export, and are always labelled as legacy/possibly partial. A new archive with missing required sections, mismatched photo pairs, referenced tracing pictures missing, or a mismatched manifest/integrity checksum is rejected.

## Validation and publication

The file is capped at 64 MiB before FileReader runs. Streaming inflate is capped at 64 MiB of output; decompression never allocates an unbounded output buffer. JSON has bounded nesting and rejects prototype-mutating keys, unsupported databases/stores, malformed/duplicate records, ID mismatches, chart/progress dimension mismatches, invalid base64 and attachment sizes/owners. No archive paths are extracted to a filesystem or fetched as URLs.

`recovery-storage.js` loads before all storage consumers on each app entry page. It pins logical IndexedDB names and an explicit list of localStorage keys to a recovery generation. This routing includes every existing raw opener, schema upgrade and database deletion. It preserves logical localStorage enumeration for preference resets/migrations, while sessionStorage remains separate.

Restore takes a private JSON copy, validates it, checks peer tabs, flushes the current project, pauses the existing folder watcher, and reads coherent per-database snapshots. The current databases are copied to new physical names; incoming data is added there in strict-durability transactions. All portable settings are written under a new private namespace. One localStorage pointer publishes the two completed databases and those settings together. A quota error at any earlier step cannot change the active data. There is no clear-and-repopulate window. The pointer write itself is atomic; interruption before it leaves the old generation active, and interruption after it leaves the completed new generation active. A reload is required because open handles and application state still belong to the preceding generation.

Previous databases/settings are deliberately retained, costing additional storage. Abandoned staging databases/settings have a durable staging manifest and are collected on startup under the Web Locks restore mutex. Safe restore requires Web Locks; browsers without it receive an update-browser message before any write. Browser eviction or clearing site data can still remove all local copies: keep downloaded files elsewhere. This contract covers application interruption and browser storage failures, not hardware-level guarantees beyond the browser's storage APIs.

## Duplicates and collisions

Restore is an additive import. Identical records are skipped; a repeated identical archive has no publication and reports “already present”. A differing record with the same project, attachment, summary or accounting key rejects the entire import. Thread dictionaries merge distinct thread keys and pattern libraries merge distinct pattern IDs, rejecting conflicting values without summing stock. No project IDs or accounting references are silently remapped, and stock is never summed. Use a fresh browser profile to recover a conflicting version. The legacy `auto_save` alias never replaces an existing alias. Existing destination Sync baselines take precedence over archived baselines, which are device-local derived state. Safe portable settings supplied by the archive intentionally replace the destination choices; sections omitted by legacy archives leave destination data/settings alone. Imported projects' local recovery pointers are cleared in the staged settings so stale device journals cannot overwrite their imported marks.

Concurrent restores use Web Locks where supported and compare the active pointer immediately before publication. An older tab cannot start an export/restore from its pinned old generation after a restore elsewhere. Other tabs pause project saving and folder watching and request a reload when the pointer changes. Browsers without Web Locks are refused before staging; close other tabs before restore. No automatic sync service is added.

## Status and user outcomes

Local-save status continues to describe an IndexedDB write. Sync status continues to describe the existing folder sync. Backup reminders and storage-persistence requests are retained. The backup timestamp records a validated download request; browser download APIs cannot establish that the user kept the file, so success copy asks the user to check Downloads. Failed export/flush/validation never advances that timestamp. Corruption, unsupported versions, missing attachments, conflicts and storage failures return actionable errors instead of “backup complete”. Legacy completeness warnings appear in restore confirmation and result metadata.

## Verification evidence

See `tests/e2e/recovery-safety.spec.js` for a 6,400-cell populated project and fresh-profile downloaded-file recovery with semantic equality and attachment-byte comparison, duplicate import, corruption/missing attachments/future versions/ID collision, injected project/stash/settings/publication quota failures, page interruption during staging, and bounded compressed input. Historical v1 JSON/CSB and preference compatibility are covered by the unit fixtures and `backupCompression`, `backupDbVersion`, `portableBackupPrefs` tests. Existing reminder and failed-save browser tests remain in place.
