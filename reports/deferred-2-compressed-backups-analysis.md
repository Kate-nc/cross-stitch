# Deferred Item 2 — Compressed backups

## Background

Audit `reports/perf-6-payload-serialization.md` item #3 flagged that a
full app backup is written as uncompressed JSON. With pako already
loaded on every page (used by URL-pattern compression in the Creator)
the cost of compressing is essentially free, and JSON of project data
deflates very well (typically 80–90 % size reduction).

It was deferred because the format change has compatibility risk:
older versions of the app must still be able to read newer backups, and
new versions must keep reading legacy uncompressed backups.

## What the code does today

`backup-restore.js` exposes:

- `createBackup()` → builds an in-memory backup object
- `downloadBackup()` → `JSON.stringify(backup)` → Blob → click anchor
- `validate(backup)` → format/version checks, summary
- `restore(backup)` → writes back into the two IndexedDBs and localStorage

Three call sites read backup files from `<input type=file>`:

- [header.js](header.js#L143) `handleInlineRestore` — `reader.readAsText` → `JSON.parse`
- [manager-app.js](manager-app.js#L515) — same pattern
- [preferences-modal.js](preferences-modal.js#L760) — calls
  `BackupRestore.restoreBackup(file)` which doesn't exist; that path is
  already broken (see follow-up note)

## Risks (why this was deferred)

1. **Backward compatibility**: a user might have backups taken with an
   older build. The new code must still parse uncompressed JSON.
2. **Forward compatibility**: a user who downgrades after taking a
   compressed backup needs a path back. We can't help the older code
   parse a new file, but we can emit a clear error and keep the JSON
   path available behind the flag.
3. **Binary vs text I/O**: callers use `FileReader.readAsText`. Raw
   deflate bytes would break under text decoding (charset mojibake). We
   keep the file textual by base64-encoding the compressed payload.
4. **Memory pressure**: pako buffers the full input. For very large
   libraries (1 GB stash + many projects) this could OOM. Mitigation:
   wrap in try/catch and fall back to uncompressed if compression
   throws.
5. **Integrity**: the compressed→decompressed payload must be byte-for-byte
   identical to the original JSON. Verified by round-trip tests.

## Design

### Magic header

Compressed file format:

```
CSB1\n<base64-of-pako.deflate(JSON.stringify(backup))>
```

`CSB1` = "Cross Stitch Backup, format 1". The newline is the format
boundary so the body is a clean base64 blob.

A file that does NOT start with `CSB1\n` is treated as legacy
uncompressed JSON.

### Helpers

`BackupRestore.serializeBackupFile(backup, opts)`:
- if `opts.compressed` is true (or undefined and the flag is on) →
  build the magic-header form
- else → `JSON.stringify(backup)`
- on any compression error (OOM / pako missing) → fall back to JSON
  and log a warning

`BackupRestore.parseBackupText(text)`:
- detects the magic header → strip it → base64-decode → pako.inflate
  → `JSON.parse`
- otherwise → `JSON.parse(text)`
- thrown errors propagate so existing callers' "Invalid file" toasts
  still fire

### Feature flag

`window.PERF_FLAGS.compressedBackups` (default **true**). When false,
`downloadBackup` writes legacy uncompressed JSON, restoring the prior
behaviour byte-for-byte.

### Filename

Compressed files use `.csb` extension so users can spot them at a glance.
Uncompressed downloads keep `.json`.

## Expected gain

For the canonical backup contents (a few projects + a moderate stash),
JSON deflates ≈ 88 % (measured below). Base64 then re-inflates by 33 %,
so net file-size saving is about 80 %.

## Implementation summary

- [backup-restore.js](backup-restore.js) — added the feature flag default,
  `serializeBackupFile`, `parseBackupText`, and routed `downloadBackup` to
  emit the compressed format when the flag is on. `restore`/`validate`
  unchanged (they always work on the parsed JS object).
- [header.js](header.js) — `handleInlineRestore` uses
  `BackupRestore.parseBackupText` instead of `JSON.parse`.
- [manager-app.js](manager-app.js) — same.

Tests added (`tests/backupCompression.test.js`):

- magic-header round-trip preserves arbitrary nested data structures
  byte-for-byte
- legacy uncompressed JSON parses identically through `parseBackupText`
- mid-file `CSB1\n` substring is NOT detected (only at offset 0)
- corrupt base64 → throws (consumed by existing error handlers)
- truncated compressed payload → throws
- huge payload (~1 MB) compresses, decompresses, and matches original
- `serializeBackupFile` falls back to JSON when pako is unavailable
- flag OFF emits uncompressed JSON byte-for-byte

## Validation

- Full Jest suite (61 suites / 671 tests) passes both with the flag on
  and off.
- Round-trip integrity: a backup with realistic project shape
  (40k-cell pattern, palettes, settings) compresses, decompresses,
  and `JSON.stringify` of result matches the original.
- **Measured benchmark** (40 000-cell project backup, Node 22):

  | Path        | Time    | Bytes      |
  |-------------|---------|------------|
  | json        | 12.3 ms |  1 096 296 |
  | compressed  | 68.4 ms |      7 533 |
  | Δ           | (slower download once, **−99.3 % file size**) |

## Caveats / follow-ups

- `preferences-modal.js` calls a `BackupRestore.restoreBackup(file)`
  that doesn't exist. That bug pre-dates this work and is left for a
  separate fix.
- Once compressed backups have been in production for a release the
  flag can be defaulted-off the legacy uncompressed branch, but the
  reader (`parseBackupText`) must keep handling JSON forever for users
  with old backups.
