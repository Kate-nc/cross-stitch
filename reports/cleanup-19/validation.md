# Cleanup 19: attachment verification and decoding

Base: `42440c53ce198372a06cc4d5d264928623ac097b` (`main`). Prerequisites: cleanup 01–04 (#362–365) and cleanup 18 (#380) are merged ancestors. PR #380 exact-head CI succeeded. Requested branch: `cleanup/19-sync-attachments`.

## Boundary and inventory

Extract only `_verifyAttachments`, the complete manifest validation/decoding unit, into the classic script `sync-attachment-codec.js`. Its engine adapter returns the codec's Promise directly. There is no additional async wrapper, await, copy, resource, retry or scheduler. The engine supplies its existing owner lookup, base64 decoder, SHA-256 helper, protocol error callback and byte limit as explicit arguments. Export encoding, local collision/deletion policy and transactional application stay in the engine.

- Names/ownership: `source:<project>`, `trace:<project>`, `photo:<project>:<suffix>`, `photothumb:<project>:<suffix>`. Existing first-match project lookup and photo-pair checks stay unchanged.
- Manifest v1 in sync v2: at most 10,000 entries; SHA-256 content addresses; `required`, `bytes`, Blob MIME `type`, `record`, optional source policy and deletion evidence retain their exact shapes. Export sorts by ID; decode visits manifest order. Duplicate IDs/orphans fail; multiple IDs may reference the same content address. Each reference is still decoded, hashed and materialised separately.
- Limits: the existing 64 MiB sync limit and 75% attachment budget are unchanged. Decoded bytes count for each reference; the size check short-circuits before hashing on size/length mismatch.
- Source images: embedded UTF-8 data URLs must agree with project data. Excluded source records are skipped. Source bytes are checked without making a stored Blob. Trace presence and photo partners are checked after all content; deletion records retain their input identity.
- Binary path: engine base64 decoding and secure-context SHA-256 are unchanged; decoded Blobs preserve MIME metadata. No extra full-size byte array is introduced. No object URL, reader, DB connection or network request is acquired by the extracted unit.
- Compatibility: sync v1 without a manifest returns an empty decoded list (unknown completeness, never deletion); sync v2 without a manifest fails. Future sync/project versions remain rejected by the facade. Compression remains outside attachment verification; AES-GCM still wraps attachments inside the encrypted payload.
- Ordering/timing: serial decode/hash/Blob creation, then unused-content, trace and photo-pair checks; prepare waits before local storage reads/collision checks. Export verifies before encryption. Application verifies again before local reads/writes. Existing failures still call engine `protocolError`, including its immediate status write/event; crypto failures retain their original identity.
- Failure/resources: decode fails before any attachment publication. Application still uses one read/write transaction and closes its DB in `finally`, rolls back all attachment rows on abort, and can leave earlier project writes committed. Whole-file retries and transport cancellation remain owned by WebDAV/folder code. The extraction introduces no cancellation API or altered interruption points.

## Loading and impact

The five HTML entry points load the codec immediately before the engine. It is precached and fingerprinted by `build-sw.js`. CommonJS support follows the existing merge-helper script; the Jest setup and the two independent VM device harnesses receive the same dependency. There are no worker or lazy engine loaders.

Home/navigation, Creator conversion/editing/materials, imports, Tracker marking/undo/sessions, save/reopen/recovery, Stash/library, Stats, exports/backups, preferences/accessibility and experimental tools were traced through script loaders and sync consumers. Only sync attachment decoding changes ownership. All SyncEngine public exports, project v11/legacy readers, database versions, preference keys and `cs:prefchange` remain unchanged. No protected PDF sources, JSX or Creator/import bundle inputs change. Pure cleanup has no help/changelog entry.

## Evidence

Results are filled after checks complete. Raw local logs live in scratch `work/` and are not shipped.

## Limits

Controlled folder handles exercise facade ordering, read/write failure and completion; they do not establish OS picker or cloud-mounted filesystem behaviour. Chromium/local CDN tests do not establish production CDN/SRI, physical devices, WebKit or a full offline service-worker lifecycle. CDP samples describe observed JS heap/backing storage, not exact peak renderer/process memory. Unrelated browser matrices are inspected or untested, never claimed to pass.

### Commands and baseline observations

Node 22.23.4 was installed in task scratch (no package/lockfile changes); Playwright Chromium 147.0.7727.15 / revision 1217. Existing installed dependencies are reused. Tests run in parallel with `--maxWorkers=2`, without `--runInBand`.

- Before extraction: `npm test -- --maxWorkers=2 tests/syncAttachmentDecode.test.js`: 22/22 pass. The test harness was calibrated against existing behaviours (project objects can be changed by application; base64 uses strict browser `atob` for the malformed-encoding case). No production bug was fixed.
- After extraction: the same 22 tests plus `syncProtocolSemantics` and `webdavSync`: 59/59 pass. Independent codec loader/status tests: 8/8 pass.
- `node reports/cleanup-19/differential.cjs 42440c53ce198372a06cc4d5d264928623ac097b`: 400/400 full-script facade comparisons agree. Compares results, input mutation, error name/message/state, digest bytes/order and protocol status/events over generated valid, malformed, duplicate, missing-content, deleted, excluded-source and legacy-absent manifests. No source-body extraction is used by this harness.
- `E2E_LOCAL_CDN=1 E2E_FRESH_SERVER=1 playwright test --project=touch-tablet-chromium tests/e2e/webdav-sync.spec.js tests/e2e/critical-lifecycle.spec.js`: base 8/8, head 8/8. Real WebDAV profiles cover CORS, attachments, offline/reconnect, revocation and disconnect; adjacent lifecycle journeys cover Tracker mark/undo/save/reopen, Creator/Stats cleanup and Home/Stash mounting.
- Both lints, `node build-runtime-js.js --check`, `node build-sw.js --check`, `node scripts/check-generated-bundles.js`, syntax checks and `git diff --check` pass. CSS-token advisories are existing, non-blocking and outside this diff. Service-worker diff contains only the new precache entry and affected asset fingerprints/build ID.
- Initial sandbox-only full-suite attempt was interrupted after local-server/child-process permission errors. A Node 22 run started before the malformed-encoding harness calibration was complete was also interrupted, and is not a passing baseline. A full head run alongside browser/benchmark load completed with 396 passed suites, two timed-out suites, one skipped suite: 5,809 passed tests, two timed out and four optional XSD tests skipped. The timed cases (`statsStoredPattern` compact grid and `syncTwoDeviceConvergence` ten round trips) pass on the untouched base in isolation; Stats also passes on head in isolation. A complete head rerun without competing browser/benchmark load follows. Neither timeouts nor interrupted runs are presented as passed checks.
- The benchmark's first fixture used an unexportable ID (`perf`, without `proj_`) and produced empty manifests. Those results were discarded. The committed harness uses `proj_perf` and fails unless three binary attachments are exported and every restored byte matches.

### Final full suite

`npm test -- --maxWorkers=2`, Node 22.23.4, with no concurrent browser/benchmark process: **398 suites / 5,811 tests and one snapshot passed** in 211.498 s. One suite / four optional upstream XSD reference cases skipped. Both earlier timed cases passed. The earlier contended run remains documented above; assertions, timeouts, skips and snapshots were not changed to obtain this result.

### Large-attachment Chromium comparison

`node reports/cleanup-19/browser-comparison.cjs 42440c53ce198372a06cc4d5d264928623ac097b reports/cleanup-19/browser-results.json`

Eight interleaved browser runs (base/head warmups, then three measured runs per side) use one shared 8 MiB binary payload referenced by trace/photo/thumbnail IDs. The harness asserts three required binary manifest entries, exact restored bytes, identical metadata, deterministic compressed attachment payload SHA-256 and digest/folder/WebDAV request ordering. Full sync envelope compressed sizes may vary with timestamps and generated delivery/device IDs; the attachment payload hash matches across all eight runs. WebDAV uses two isolated real browser profiles, a local HTTP server with CORS/auth/conditional writes, and no network fault injection in the benchmark (faults/cancellation are covered by Jest and e2e).

| Measure | Base | Head |
|---|---:|---:|
| Folder export median, ms | 978.3 | 960.9 |
| Folder export/scan/prepare/apply median, ms | 2729.6 | 2349.0 |
| Folder total range, ms | 1863.3–2792.8 | 2284.0–3253.0 |
| Sampled folder fixture peak JS heap range, MiB | 34.2–34.2 | 34.2–34.3 |
| Sampled folder fixture peak backing storage range, MiB | 99.4–107.4 | 105.0–105.0 |
| Folder retained JS heap after GC, MiB | 12.4–12.4 | 12.4–12.4 |
| WebDAV upload median, ms | 784.6 | 812.6 |
| WebDAV receive/apply/re-export median, ms | 2457.7 | 2311.9 |
| WebDAV receive range, ms | 2148.1–2459.8 | 1769.6–3804.9 |
| Sampled WebDAV receiver peak JS heap range, MiB | 34.1–34.1 | 34.1–34.2 |
| Sampled WebDAV receiver peak backing storage range, MiB | 67.6–70.0 | 67.6–67.6 |

These small noisy samples are comparisons, not a performance budget or proof of equal latency. CDP sampling can miss short allocation spikes; Blob/native/process memory is not fully represented. Folder fixture peaks include setup and byte/hash verification as well as transfer. The implementation itself introduces no full-size copy: the moved body matches the base after dependency parameter renames, and the adapter passes existing function/number references without an argument object. Raw measurements and event sequences are in `browser-results.json`.

WebDAV request method sequence (identical in all runs): `OPTIONS / PROPFIND / OPTIONS / GET / OPTIONS / PUT / OPTIONS / PROPFIND / OPTIONS / GET / OPTIONS / GET / OPTIONS / PUT`. No attachment bug was discovered that required a separate fix or issue.
