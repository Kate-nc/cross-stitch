# Track Mode: full saves, thread-usage commits and sync exports

**Date:** 2026-11-09 · **Base:** `main` at `114e11a` (`1.0.242`) · **Follows:** [track-mode-performance-baseline.md](track-mode-performance-baseline.md) (findings 2 and 3, and the "Not changed" note on unload saves), which examined `efb1ef0`.

## Summary

Three costs that grew with the whole chart, the whole thread-usage history or the whole library now grow with what changed:

| | Before | After |
|---|---|---|
| Tracker flush of one mark, huge chart (600 × 800), 4× phone emulation | __SAVE_MARK_HUGE_PHONE__ | |
| Rename only, huge chart, 4× | __SAVE_META_HUGE_PHONE__ | |
| Thread-usage commit of 5 events, 200 000-event history (desktop) | __USAGE_200K__ | |
| Automatic folder export after one change, large chart + 150 projects, 4× | __SYNC_150_PHONE__ | |

See [Measurements](#measurements) for every case, and [Not covered](#not-covered-and-validation-that-was-not-possible) for what these figures are not.

## What was revalidated first

Each hypothesis from the earlier audit was checked on the current `main` before anything changed (`tests/perf/save-cost.cjs`, CPU profile reduced to self time per function; raw results in [track-mode-baseline/](track-mode-baseline/)):

| Hypothesis | On `114e11a` |
|---|---|
| Pattern serialisation dominates a full save | **No longer** (cached per pattern array since the earlier work). What remained, huge chart: the structured clone of the whole record on put, twice per flush (project record and the legacy `auto_save` copy); the in-transaction read of the old record to diff marks; `saveChecked`'s full `get()` (read, recovery, overlay of the progress record) just to compare two stamps; `rememberProgressBase` deep-copying the whole sync-register map; and library thread demand counted stitch by stitch (`projectThreadEntries`, finding 3, still true) |
| A rename or other metadata-only change costs less than a mark | **No**: same full rewrite (12.4 s at 4× on the huge chart) |
| A clean flush (nothing changed) writes nothing | **No**: every sync export and backup flushed a full save and the legacy copy, even straight after the autosave that triggered the export |
| Committing a few thread-usage events is independent of history | **No**: the ledger is one record, read (deserialised), scanned and rewritten whole: 7 ms for 200 events, 0.24 s at 50 000, 1.0 s at 200 000 (desktop) |
| Incremental sync exports read only changed projects | **No**: `exportSync({mode:'incremental'})` read and assembled every project, then filtered by `updatedAt`. No transport uses incremental mode: folder, relay and WebDAV all send the full file |
| Folder export cost is dominated by compression | **Partly**: compression (TextEncoder + pako on the main thread) was about a fifth; reading every project back (`get()`, deserialise, fold progress) was the largest single part, then the redundant flush and `JSON.stringify` |

## What changed

### 1. Tracker saves that leave an unchanged chart unwritten (`project-storage.js`, "Overlay")

`ProjectStorage.save(project, { overlay: true })` (the Tracker's autosave, flush and unload) compares the snapshot's chart (`pattern`, compact `p`, `imgData`) with the stored record's. When it is the same, nothing of the full record is written:

- the marks go to the existing progress record (`progress:<id>`, unchanged shape: `v: 1`, `done` as a typed array, the other mark sets, a sync-register delta over the record's);
- everything else goes to `overlay:<id>` in `pendingImports`: every other field of the snapshot, its value-sync registers, and its own write stamp (`lastWriteAt`, `lastWriteTabId`);
- both rows carry `baseWriteAt`, the full record's `lastWriteAt`, and are written in **one transaction** with the metadata and stats rows.

The chart is compared once per base by content and then by identity (the serialiser returns one array per pattern), using a cached summary of the stored record whose fence token is checked against the metadata row read in the same transaction. A miss reads the record once, in the transaction.

**Revision and fencing.** Any other full write (a Creator save, a sync import, a restore, a chart update, a navigation-journal recovery) gives the record a new `lastWriteAt`, which retires both rows; every one of those writers also deletes the overlay row explicitly. A writer that does not know about overlays (an older build) only changes `lastWriteAt`, and that alone retires it (tested). The overlay's own stamp always moves forward past the record's and the previous overlay's.

**Conflicts.** `get()` reports the overlay's stamp as the project's `lastWriteAt`/`lastWriteTabId`, and the save broadcasts it, so cross-tab conflict detection treats an overlay save exactly like a full one. `saveChecked` now reads the stamps from the metadata row (written in the same transaction as every record or overlay write) instead of assembling the whole project; rows from older builds fall back to `get()`. A progress write or navigation journal named against the overlay's stamp (what the Tracker last saw) is rebased onto the record inside its transaction.

**Edits during a save.** The overlay save's progress row is dated when the snapshot's marks were read (`navigationAt`). A progress write this tab captured after that (a mark made while the save waited) is kept rather than overwritten; one captured before it is turned away, as stale progress writes always were. Another tab's progress record does not outrank this tab's save (the full save's rule).

**Readers.** Every reader that folded the progress record now folds the overlay too, through one function (`storedView`): `get()` (one transaction for record, metadata, session rows, progress and overlay), backups (`backupProgressRows`), chart-update review and apply (overlay included in the change token and the recovery snapshot), summary refresh, Stats rebuild, material planning, `markSynced` (updates the overlay's `syncMeta`), and navigation-journal recovery (materialises record + overlay + journal once, as before). Deleting a project, clearing all projects and clearing progress (restore) remove overlay rows.

**Other full-save costs.** `rememberProgressBase` keeps the sync registers and chart by reference (nothing edits them in place; checked) instead of deep-copying them. Library thread demand is cached per pattern array and stitch lists, so it is counted once per chart. The meta row now carries `lastWriteAt`, `lastWriteTabId`, `baseWriteAt` and `progressAt`.

**Tracker** (`tracker-app.js`): the autosave, `__flushProjectToIDB` and unload use the overlay save; hand-offs to the Creator and imports still write whole records. A flush with nothing changed since the last successful write (generation counters) writes nothing; a held save still reports why. The legacy `auto_save` copy is written once per project per page from the flush (pages open the project record instead whenever the copy names a stored project); unload and Creator hand-off still refresh it in full.

### 2. Thread-usage history stored a record per event (`thread-accounting.js` "Stored form", `stash-bridge.js`)

In the same `manager_state` store (no schema or version change):

| Key | Value |
|---|---|
| `tc2:e\|<project>\|<unit>\|<seq, 16 digits>` | the event, exactly as in the whole ledger |
| `tc2:p\|<project>` | the project's baseline record, event count, and exact running totals per thread |
| `tc2:r\|<token>` | `{token, id}` receipt |
| `tc2:meta` | format marker |

`applyConsumptionEvents` reads, in its one transaction: stock, reservations, the legacy checkpoint, the project row, and for each operation its unit's newest event (reverse cursor over the unit's range), the event at its sequence and its receipt. `ThreadAccounting.apply()` runs unchanged over just those (it only ever looks at them), and the commit writes the events and receipts it adds, the project row and stock. Stock and history still commit together; the lock, idempotent retries (receipts and committed sequences), corrections, unpicks, reversals and the cross-tab "history changed" refusal are unchanged, checked against the whole-ledger implementation over random histories.

Totals: the project row keeps exact running sums (Shewchuk partials), so a total kept up one commit at a time equals one counted from scratch, whatever the order. `ThreadAccounting.totals()` itself is unchanged (its reference test pins it); the two agree to the last bit or within one rounding step. The Tracker's live figures use the row's totals.

**Migration.** The first accounting write after updating finds the old single record (`thread_consumption_v2`), and in the same transaction writes its stored form and deletes it. A whole ledger written under the old key later (a merge-mode restore, a sync import from code that predates this, an older build) is combined with the stored one by the next write using `ThreadAccounting.mergeContained`, which keeps this device's history where the two contradict, as the sync merge does. Readers combine the same way meanwhile, so nothing is hidden before that write.

**Interchange.** Backups, sync files, the import merge and the restore collision check all use the whole form: `ThreadAccounting.fromRows()` assembles it from the stored rows. A backup taken now restores on an older build. A sync import writes its merged ledger back in the stored form.

**Tracker.** It no longer keeps the whole ledger: it numbers a batch with `StashBridge.consumptionLookup` (those units' heads and those tokens' receipts), shows totals from the commit's summary, and reads the project's own events for the history view and the project correction (`getConsumptionAccounting(projectId)`).

### 3. Sync exports that scale with changed projects (`sync-engine.js`)

- **Per-project entry cache.** Each exported entry's JSON (with its fingerprint) is kept for the page, keyed by the project's metadata row: its fence token (new on every record or overlay write), `progressAt` (every progress write), `updatedAt` and write stamp. An unchanged project is not read, fingerprinted or serialised again; the cache holds text, not objects, and stops growing at 48 M characters. The key is read after the export's flush, so every change the export's covered revision promises moved it; a change landing during the export moves the key and is sent next time (tested).
- **Selection before loading.** Incremental exports choose projects from the metadata rows before reading any.
- **Serialisation.** The file is built by splicing the kept entry text into the envelope; the same text `JSON.stringify` makes (tested). Encrypted payloads use the same path.
- **Compression in a worker.** `compressAsync()` encodes and deflates in `sync-compress-worker.js` with the browser's `CompressionStream` (zlib, read by the same `pako.inflate`), falling back to pako on the main thread where workers or `CompressionStream` are missing. The folder export, downloads, the relay and WebDAV use it; `compress()` stays synchronous for compatibility.
- **No redundant flush** (part 1): an export right after the autosave no longer saves the open project again.
- **Attachment rows** are read by their key prefixes instead of every `pendingImports` row (which now includes progress and overlay rows).

Unchanged: full exports stay full (a folder holds one complete file per device), pending marks (`coversChangeRev`), acknowledgements only after delivery, deletion records, attachments and their verification (the codec reads two fields through hints instead of parsing cached entries), retries and conflict review.

## Measurements

__MEASUREMENTS__

## Tests

__TESTS__

## Not covered, and validation that was not possible

__LIMITS__
