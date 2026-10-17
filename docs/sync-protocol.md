# File synchronisation protocol and storage semantics

## Version and identity contract

New exports use `cross-stitch-sync` envelope version **2**; readers accept versions **1 and 2** and reject future envelopes, project schemas and causal-register versions. Project JSON remains version 11, CrossStitchDB remains version 5 and sync metadata remains version 1. No new store, hosted service or automatic cloud transport is introduced. Manual `.csync` sharing and the existing watched folder remain the transports. Encryption covers the attachment envelope and deletion records as well as projects, stash and preferences.

Each new delivery has an opaque `_deliveryId`. Folder polling compares delivery identity rather than wall-clock ordering for version-2 files. Timestamps remain display metadata. Replaying an older delivery is safe; the current file per device is a snapshot, not an ordered command queue. Export construction does not acknowledge delivery; only a successful folder close or browser handoff records an export. This cannot confirm remote receipt.

Project IDs are authoritative in version 2. Identical chart content does not prove two independently named projects are the same project. Version-1 imports retain the historical fingerprint-based identity reconciliation, guarded by complete chart comparison. The old deflate-prefix fingerprint is only an index hint. Full cell/thread/geometry structures must agree before completion identities can be combined. Structural differences require explicit review. A keep-both fork has a deterministic ID and replay does not create another copy. Forking a chart with attachments remains an explicit unresolved conflict until the user saves a separate project copy; attachments are never silently reassigned.

## Merge rules

| Data | Application rule | Concurrent or ambiguous edits |
| --- | --- | --- |
| Full crosses, half sides, diagonal quarters, knots, backstitch, petite/long objects, beads | Existing per-mark causal frontier; observed edits supersede earlier edits, replay is a no-op | Concurrent mark/unpick resolves to unpicked; sync, then explicitly mark again to restore |
| Notes, name/status/finish status, project colour, description, designer, settings, thread-owned flags and parking list | `valueSync.version: 1` multi-value registers, captured at the persistence boundary | Unequal concurrent values remain in the frontier and require a choice; clock time never chooses the text |
| Sessions and session notes | Registers per stable session ID, with distinct sessions retained independently | Conflicting versions of a shared session require a choice; running totals are recomputed after choosing authored values |
| Session/snapshot deletion IDs | Union deletion evidence and filter rows before publication | Old rows cannot resurrect deleted IDs; missing legacy arrays supply no deletion intent |
| Project deletion | Persist deletion evidence before local removal; incoming live/deleted ambiguity requires review | A future timestamp cannot resurrect a removed project; explicit Restore releases the deletion record |
| Gross stash baseline | Causal register for stock and non-derived thread fields, excluding consumption-derived history/write counters | Incompatible baselines require an explicit snapshot choice; a purchase arriving during review rejects the stale choice |
| Consumption history | Validate and union immutable `thread_consumption_v2` events, baselines and receipts from accepted PR #337 | Rewritten events, incompatible baselines, contradictory receipts or combined overdraw stop the import; no speculative reconciliation |
| Net stash quantity | Selected gross baseline minus the union's recorded net debits, once | Balances, event history, legacy checkpoints and the accepted inventory register commit in one manager transaction |
| Attachments | Manifest identities, verified content, atomic blob publication and removal evidence | Same attachment ID with differing content/metadata is an explicit unresolved conflict; no arbitrary winner |

Causal values retain their competing alternatives in metadata. Explicit choices create a subsequent event observing both alternatives, so a stale file cannot undo the choice. Legacy unequal values have no causal evidence and are conservatively reviewed. Missing fields are omission, not deletion. Legacy parking remains an additive union until authored removal history exists. Legacy session keys fall back to start/date; ambiguous identical keys require review instead of silently losing notes.

Derived thumbnails and the optional original source image retain the existing prefer-present behaviour. Work-area focus retains its existing field-specific rule. Portable preferences retain the existing review gate. These are not new distributed accounting operations.

## Attachments

The envelope's `attachments` object has version 1, a manifest, content blobs keyed by SHA-256, and an explicit source-image inclusion/exclusion declaration. Manifest rows bind a project ID and logical attachment ID to a content identity, byte length, media type and portable record metadata. Trace pictures, photo originals and thumbnails are required when declared; photo pairs are checked. Optional original source images use manifest rows explicitly marked excluded, or verified content matching the inline project image. Unreferenced content, duplicate/orphaned IDs, mismatched sizes and hashes are rejected. SHA-256 is content identity and corruption detection, not sender authentication.

Only project-owned attachments are exported. Temporary handoffs/drafts, orphaned blobs, active-tab progress overlays and local recovery-session outboxes are not sync attachments. Session history and progress are carried in the project. Content travels inside the existing compressed/encrypted sync file, avoiding unauthorised paths or a new blob endpoint. Identical bytes share a content key within the delivery. Transfer is retried by resending/reimporting the complete file; there is no byte-range resume claim.

`BlobStore.delete` and `deletePrefix` commit attachment removal evidence with deletion of the bytes. This prevents resurrection even if an incoming file arrives before the deleting device exports. The importer checks local content before replacing any attachment and uses storage revisions to detect concurrent blob changes. Blob rows and the accepted manifest commit together in one `pendingImports` transaction. Aborting it publishes no partial blobs. No persistent staging copies accumulate.

Project and attachment tombstones are bounded at 10,000 entries. Reaching the bound fails the operation without evicting old evidence. Neither age nor a peer's clock proves all offline files have been retired. Safe compaction would require an explicit new epoch/checkpoint protocol with all peers acknowledged; that is not implemented here. A deliberate reset/re-pair must retire old files, and Restore is an explicit exception to deletion. Malformed deletion storage fails closed.

## Storage boundaries and state

`prepareImport` validates envelope/schema identities, required attachments and integrity, loads local state and produces pending/conflicted work. The importer refuses missing explicit resolutions. Projects use separate transactions; a conditional check inside `ProjectStorage.save` rejects a write if another tab changed the saved revision or progress frontier after the merge read. Status stamping reads current projects inside its write transaction and cannot resurrect a concurrent deletion. Stash merging reads current balances and history inside its write transaction, including when the optional cross-tab lock is unavailable.

An import is not an atomic transaction across both databases and every project. Interruption may leave already committed projects applied. Retry deduplicates them and completes the remaining work; the completion timestamp and source-delivery cursor are recorded only after required writes finish. Attachment failure does not claim completion. Missing required blobs are **pending**, unresolved edits are **conflicted**, corrupt data or aborted writes are **failed**, and successful local application is **completed**. Import and export states are separate in the existing cloud popover. A successful export does not hide a conflicted import.

## Compatibility and accepted dependencies

The checked-out base lacked already accepted accounting PR #337. The accounting base was verified against exact upstream merge `5fec84fe1272298ff744bb76b5c93eacc9fa0397`. The final branch also preserves accepted Creator review #338 and version bumps through `ebdb78ac7b888aebfd9504108ebd5351e1c327a2`; no PR was merged by this task. Petite/long lifecycle (#334), bead lifecycle (#335), recovery (#336), and earlier accounting/history changes (#326/#328) are present in that base. Existing durable accounting validation and event identities are preserved.

Version-1 files, compact `.p` projects and legacy typed/object completion encodings remain readable. Version-1 absence cannot prove attachment completeness or reconstruct old deletions. The summary labels attachment coverage as legacy unknown. Older apps deliberately reject new version-2 files; update every device instead of round-tripping through an app that discards the metadata. Unknown future accounting/register/project schemas stop the operation.

Validation and separate review findings: [sync protocol bug-hunting evidence](sync-protocol-review.md).
