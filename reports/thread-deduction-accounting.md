# Durable thread consumption accounting (v2)

## Accounting rules

`manager_state.thread_consumption_v2` contains versioned project baselines, immutable consumption events and replay receipts. Each event identifies a saved project, a progress-unit key and a monotonically increasing occurrence number; its ID is the JSON encoding of those three values. Token receipts also deduplicate recovered operations. Event identity does not depend on a timestamp. Different projects and brands remain independent.

A mark stores its estimated quantities and the assumptions used **when the progress action occurred**: model version, fabric count, over-one/over-two, strands, constituent weights, tail inches, stitches per run, waste multiplier and single-strand skein capacity. Later preferences never revalue it. Event date records the action time, rather than a delayed retry time. Stock deductions are capped at the usable stock in the transaction. The event retains both the full estimate and the actual debit, including a zero debit. Insufficient stock creates no claim against a later addition.

Owned inventory is the existing `threads` dictionary. Consumed estimates and applied debits are event data, not an `owned` or `reserved` field. This PR introduces no project reservations or purchasing functionality. Quantities remain unrounded skeins internally; only history presentation rounds to six decimal places.

Ordinary unmark, Undo and progress reset correct accidental marks: a correction appends an event, credits only that occurrence's actual remaining debit, and never guesses historical credits. **Unpick area** means physically removing thread: it appends an unpick event without credit. Marking those stitches again consumes new thread even below an earlier completion peak. Undoing an accidental Unpick area restores its accounting state without a new charge; Redo re-establishes the unpick. Whole-project correction credits eligible event debits, not physically discarded thread or legacy stock guesses. Earlier events are never deleted or repriced.

While live deductions are off, newly recorded marks are history observations with zero debit. Re-enabling charges subsequent stitching, not work recorded while off. This is an intentional replacement of v1's preference-dependent catch-up behaviour. Imported or reconciled marks are not evidence of fresh stitching in the receiving tab.

## Estimation rules

All lengths are inches. One standard skein is **6 × 315 = 1,890 single-strand inches**, retaining the previous live geometry calibration. The rounded shopping estimator is unchanged and separate.

For a counted stitch with weight `w`:

```
effectiveCount = fabricCount / stitchOver
geometry = 4.8 * w * totalWorkingStrands / effectiveCount
tails = 2 * tailAllowanceIn / stitchesPerRun * w
skeins = (geometry + tails) * wasteMultiplier / 1890
```

Full crosses use `w = 1`; half sides use `0.5`; each diagonal quarter uses `0.25`. Independent petite crosses have half the linear dimensions of a full cross and use `w = 0.5` for geometry and amortised tails, regardless of their separate 0.25 progress weight. Three-quarter stitches use the three occupied quarter positions. Equivalent legacy halves and quarter encodings are deduplicated through ProgressUnits. French knots are explicitly approximated by one full-cross allowance, rather than inferred from progress percentages.

For backstitch and independent long stitches, `L = hypot(x2-x1, y2-y1)` in **grid cells**, including fractional endpoints. Use `2 * L * totalWorkingStrands / effectiveCount` geometry (front path plus an estimated return path) and `L` times the amortised tail allowance. Thus diagonal and long lines are measured by length, not by line count. Identical/reversed lines share the existing canonical progress identity and one charge. Beads retain their separate owned/used bead quantities; this PR does not infer a thread allowance for attaching them. These are estimates, not measurements of recovered thread.

Blend amounts divide the combined geometry, tails and waste by constituent strand weights. A strand override changes total working strands while preserving proportions. Brands stay in composite keys (`dmc:310`, `anchor:310`). Default invalid preferences fall back to finite model defaults. Invalid event quantities and owned edits are rejected.

Example: 100 full crosses, 14 count, two strands, zero tails and multiplier 1 use `100 * 4.8 * 2 / 14 / 1890 = 0.03628117914` skeins. A 1+1 blend assigns half to each constituent. 28 count over two has the same geometry. One half uses half that per-cross quantity; a quarter uses one quarter. A 3-4-5 backstitch path uses `2 * 5 * 2 / 14 / 1890 = 0.000755857899` skeins before tails/waste.

## Migration evidence

The first v2 baseline records the loaded marks and explicitly states: “Existing stock preserved; historical consumption unknown”. It performs **no stock debit or credit**. Any existing `rt_deduction:<project>` v1 record is copied as legacy migration evidence, without converting its high-water estimates into invented stitch events. Existing usable balances and partial-skein status are unchanged. Subsequent corrections cannot refund unknown baseline marks; fresh stitching after an unpick or correction is a new event.

Executable migration fixture: existing owned stock 1 skein and a v1 checkpoint `{observed: 0.3, deducted: 0.2}` remain exactly 1 skein after initialisation, with zero consumption events. Correcting a historical baseline mark still leaves 1 skein. Marking a new occurrence then charges only its freshly captured estimate. Old backups without v2 data restore their stock and receive a new explicit baseline when opened.

## Atomicity, retries and portable history

Every event batch reads the live stash, ledger and legacy record, then commits the new events, receipts and inventory in one `manager_state` IndexedDB readwrite transaction. Request callbacks enqueue all writes without awaiting inside the transaction. Transaction serialisation protects concurrent tabs even without CrossTabLock. A committed event cannot debit again after retry, duplicate delivery or lost acknowledgement. Manager delta saves preserve concurrent consumption.

Tracker queues capture each rendered progress transition rather than subtracting cumulative estimates. A per-context, recovery-generation-scoped localStorage outbox records original assumptions before asynchronous writes and event identities before attempting the transaction. Reopening replays pending identities. Recovery keys are distinct per context; duplicate recovered tokens are removed before allocating occurrence numbers, and cleanup removes a recovered record only if its contents have not changed. If recovery storage fails, the open tab retains its queue and reports the failure. Page termination before browser storage succeeds cannot be guaranteed; keep the tab open when a write error is reported.

Full `.csb`/JSON backups already export every manager_state key; the new ledger therefore travels with its stock through the existing staged recovery protocol. Export flushes pending consumption first. Restore validates the event chain before staging. The existing additive recovery contract rejects conflicting stock or accounting keys and atomically publishes a complete new storage generation; repeated identical restores are no-ops. Outboxes are scoped to their recovery generation and cannot replay over newly published inventory. Older backups without consumption history remain historical baselines; no retrospective usage is inferred. Restore a conflicting older stock/history pair into a fresh profile, as required by the existing recovery contract.

`.csync` exports the ledger and legacy checkpoints. Import unions events and receipts by identity, validates causal sequences and correction credits, reconstructs each side's inventory before its known event debits, reconciles inventory, then subtracts the union exactly once. Import re-reads and merges inside the **write transaction**, so an optional lock timeout cannot clobber an intervening local debit. Snapshots retain net event consumption separately to distinguish inventory edits from event-only balance changes. Gate resolutions apply their inventory adjustment to the fresh merge. Existing no-snapshot inventory policy remains conservative (maximum pre-consumption stock); quantities from independent inventory edits may still need reconciliation.

Conflicting immutable payloads or baselines, incomplete histories and combined independent consumption exceeding recorded stock fail with an inventory-reconciliation message. They do not rewrite history, silently double-charge or create negative inventory. Update every device before syncing this format: old clients cannot enforce these invariants. Independent offline copies are not a distributed inventory transaction. A project-only transfer without its stash is a historical baseline, not authorisation to debit the receiving inventory.

## User-readable history

More > Tools > Thread consumption history shows the project baseline explanation, dated stitch/correction/unpick descriptions, unit identity, per-thread estimates, actual debits/credits and captured count/strand/waste/tail assumptions. The durable ledger is not truncated when ordinary stash adjustment history reaches its legacy display limit.

## Verification and separate bug hunt

`tests/consumptionEvents.test.js` exercises real fake-indexeddb transactions, independent bridge instances, duplicate/retried events, abort rollback, migration with legacy evidence, preference changes, physical restitching, accidental corrections, undo/redo of unpicks, zero/partial stock, blends and brands, fractional/backstitch inch geometry, 1,100-event rounding/history retention, sync union/replay, immutable-history conflicts, and compressed backup/restore followed by replay. Tracker boundary tests exercise the real event queue and stock balances during project switches and lost acknowledgements. Existing v1 tests continue to verify the retained compatibility API.

The separate bug-hunting pass checked negative and non-finite stock/event quantities, inches versus grid-cell backstitch units, over-two fabrics, duplicate legacy fractional encodings, fractional precision, repeated corrections, sync overdraw and irreversible history edits. It added rejection probes for forged credits and incomplete chains. It also fixed recovery cleanup racing a live peer, event-only differences being mistaken for inventory edits, recovery-generation outbox isolation, and history replay work growing quadratically within a batch. No purchasing or reservation changes were made.

Final validation on the rebased upstream: the full Jest run passed **346 suites, 4,687 tests and one snapshot**. The final affected accounting/queue/generated-asset regressions passed after the last recovery/validation edits. The Chromium browser regression exercises real mark/correction/Redo, physical unpick/Undo/Redo, restitching, readable history and reload, asserting stored balances and event history. Runtime compilation, service-worker fingerprints, terminology lint and diff whitespace checks passed. CSS-token lint retains pre-existing non-blocking findings; no CSS was changed.
