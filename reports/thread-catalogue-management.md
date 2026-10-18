# Thread catalogue management review

## Model and migration

Custom CSV catalogues are append-only user reference data stored as an array under `manager_state/customThreadCatalogues` in the existing versionless manager database. Each record contains `key`, `brand`, `code`, `name`, nullable `rgb`, `status`, optional `substitute`, and user-supplied `provenance`. Identity is `brand:code`; codes remain strings, including leading zeros, non-numeric codes and Unicode. Brand slugs are lowercase ASCII, and code case is significant. Built-in brand slugs are reserved. There is no new database version or destructive migration.

Existing DMC/Anchor stash composite keys and legacy bare DMC keys remain readable. Unknown valid brand slugs survive project serialization and library keys and no longer borrow DMC catalogue entries. New project saves snapshot available RGB, name, provenance, status and substitution alongside the existing cell ID and brand representation. Existing explicit RGB always wins when restoring. Legacy compact saves without RGB reconstruct from their original catalogue; their historical RGB is unrecoverable from IDs alone. New snapshots increase uncompressed save size; existing serialization memoisation remains in place.

Reference catalogues do not enter Creator matching/conversion pools or mutate existing project palettes, symbols or stock. Creator custom palettes remain separate localStorage colour palettes. CSV export is the portable backup for this new store; existing full backup payloads do not yet include it.

## Import validation

Strict quoted CSV parsing rejects unterminated quotes, embedded unquoted quotes, text after a closing quote, wrong headers/field counts, invalid brand/code, invalid RGB, invalid status, self substitutions and absent provenance. RGB is either absent or exactly #RRGGBB; missing RGB is not invented. The preview shows every valid row and all errors/duplicates. Any error or duplicate blocks the whole import. Commit rereads and revalidates against persisted records within one readwrite transaction, preventing stale previews and concurrent-tab duplicate insertion. A failed transaction publishes no subset.

Exports quote every field and use reversible apostrophe escaping for formula-like fields, leading control whitespace and original apostrophes. This applies to every user-entered field. Spreadsheet users must still preserve code columns as text to prevent spreadsheet type conversion.

## Separate bug-hunting pass

- Identity collisions: removed unknown-brand DMC lookup fallback and non-DMC legacy bare-key stock fallback. Retained valid unknown brand slugs. Duplicate detection uses Set; bulk lookup maps have no prototype.
- Palette remapping: custom catalogues remain outside matching pools; substitutions are metadata only. Added save/load regression coverage against changed built-in RGB/name metadata.
- Malformed colours: custom CSV accepts only full six-digit hexadecimal RGB or no colour; malformed inputs cannot commit.
- Partial bulk commits: replaced per-thread Bulk Add writes with a single stash transaction. Invalid tokens now block the entire batch; opposite-brand prefixes are not stripped into the selected brand. Existing stock quantities are retained.
- Provenance: clarified historical Anchor reconciliation claims and replaced the visible “Official match” label with “Chart-listed approximation”. No new manufacturer data was added: trustworthy redistribution evidence was not established. No restricted sources were scraped.

## Verification

Focused catalogue, project compatibility, identity, serialization, bulk parser and stash transaction suites pass (92 tests). They cover cross-brand duplicate numeric codes, leading zeros, non-numeric codes, Unicode, missing RGB, malformed CSV/RGB, round-trip CSV, formula escaping, concurrent duplicate imports, all-or-nothing invalid batches, existing stock counts, unavailable brands and changed catalogue metadata.

Generated creator/runtime bundles and service-worker fingerprints were rebuilt. Terminology lint passes. CSS token lint passes with 13 existing advisory findings in unchanged styles.css. Full Jest run: 357 suites passed, 1 skipped; 4,926 tests passed, 4 skipped; 1 snapshot passed (118.298 seconds). A final targeted rerun passed 108 tests across 8 suites, covering the last prototype-key guards and generated assets.
