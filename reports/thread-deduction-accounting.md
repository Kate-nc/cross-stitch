# Live thread deduction accounting (QA-06, QA-07, QA-08)

## Data flow and invariants

- Pattern, full-cross completion marks, fabric count and waste preferences persist in project JSON. `skeinData` is a derived shopping estimate with existing rounding/calibration; it is not inventory or an accounting balance.
- `rtThreadUsage` derives unrounded cumulative single-strand skein consumption from full-cross cells and their actual brands. It does not use bare palette ids or rounded shopping estimates. Half/quarter stitches, knots and backstitch remain outside the supported live model.
- `manager_state['threads']` persists current usable stock. Qualitative partial-skein stock is included; the first debit folds its fraction into exact `owned` and clears `partialStatus` to prevent counting it twice.
- `manager_state['rt_deduction:' + projectId]` persists versioned per-composite-thread `{observed, deducted}` checkpoints. `observed` is the consumption high-water mark, including skipped historical/insufficient-stock usage. `deducted` is this project's actual stock debit, available for an explicit erroneous-mark correction.
- Remaining-stock previews are live usable stock minus positive consumption beyond the checkpoint. They are advisory; writes always read the latest stock inside the transaction.

## Applying usage

For each `brand:id`, `delta = max(0, currentConsumption - observed)` and `debit = min(availableStock, delta)`. Subtract debit, advance observed to `max(observed, currentConsumption)` and add debit to deducted. All constituent stock changes and that project's ledger commit in one IndexedDB `manager_state` readwrite transaction. Requests are queued from IDB callbacks without awaiting between reads and writes, including schema migration. Errors abort the transaction and propagate.

IndexedDB serialises overlapping transactions across same-origin tabs, including when optional CrossTabLock is unavailable or times out. Different project ledgers retain both deductions from shared stock. Same-project duplicate/stale totals cannot debit the same high-water interval twice. The model assumes cumulative project marks are reconciled; independently editing different copies of the same project still needs the existing tracking merge workflow. This is not a distributed inventory ledger.

Manager autosave/unload merge changes relative to their displayed baseline inside the same transactional bridge, rather than writing a stale whole-stash snapshot. Owned edits apply their user-entered delta to live owned stock; unchanged fields retain concurrent changes. An explicit zero/used-up edit is treated as stock reconciliation and zeros live owned stock. Other changed fields are explicit user edits. A pending local edit is retained when a same-page stash refresh arrives. The baseline advances only after a successful save, and saves are serialised within the Manager.

## Initialisation, toggles and failure recovery

On load, snapshot consumption from the restored project's marks and preferences, never from stock. If no ledger exists, checkpoint that historical consumption without taking any stock. This deliberately leaves uncertain historical use alone: the app cannot establish whether the previous implementation already deducted it. No refund or retrospective blend correction is guessed. The first fresh zero-progress project starts at zero; later marks charge normally.

Initialising an existing ledger does not advance its checkpoint or debit stock. Enabled writes then apply only additional usage. Disabled projects do not write usage. Keep-deductions disable flushes pending usage first; re-enable retains accounting and catches up new totals, including marks made while disabled. Failed initialisation can retry through the atomic apply path. Failed live writes report the error and schedule a retry. Completion keeps accounting and remains open if flushing fails. Explicit correction reports failure and stays enabled if crediting fails.

Project switches capture the departing project's id, amounts and initial baseline before awaiting, and late callbacks do not publish its result into the new project. Page-hide/unload/visibility attempts are best effort: browsers can terminate before an async transaction starts. A committed checkpoint is authoritative even when the caller never receives success; repeating the write is safe. If project marks were saved and the stash transaction did not commit, the next enabled apply catches up from the persisted checkpoint. Unknown legacy history is always checkpointed rather than guessed.

Empty stock does not create debt against later purchases. Observed usage advances even when debit is zero. An explicit correction credits actual recorded debits only, clears the refundable amount, and retains observed consumption so retries/re-enabling cannot recharge it.

## Units and blend formula

The live model retains the existing RT geometry calibration; shopping calculations retain their separate supported 1.4-inch reference calibration and rounding.

For one full cross:

```
effectiveCount = fabricCount / stitchOverFor(fabricCount)
geometryIn = 4.8 * totalUsedStrands / effectiveCount
combinedTailIn = 2 * tailAllowanceIn / stitchesPerRun
singleStrandIn = (geometryIn + combinedTailIn) * generalWasteMultiplier
skeins = singleStrandIn / (6 * 315)
constituentSkeins = skeins * constituentWeight / sum(constituentWeights)
```

All lengths here are inches. Capacity is 1,890 single-strand inches per standard skein. Tail allowance retains the existing combined working-thread allowance per tail (not an extra allowance per constituent). Waste is a multiplier (`1.10` adds 10%). Blend weights are `blendRatio` or constituent `strands`, defaulting to equal shares. Strand override changes total working strands, retaining the blend ratio. Existing restored two-thread blends use equal shares; this change does not introduce a ratio editor or change project serialisation.

For 100 crosses at 14 count, two total strands, zero tails, multiplier 1: each member of a 1+1 blend uses `100 * (4.8 * 2 / 14) / 1890 / 2 = 0.01814058957` skeins. 28 count over two matches 14 count over one. Doubling total strands doubles geometry. Combined tails and waste are allocated once across the blend.

## Unmark/reset and product questions

Inspected ordinary unmark/Undo, rectangle unpick and project loading/reset. They remove completion marks and can record unpicking in sessions, but do not establish that usable thread returned. The checkpoint never automatically credits a decreasing total. The existing explicit restore action now means correction of erroneous accounting: it credits only recorded actual debits, preserving purchases and other projects. It never restores an old absolute stock snapshot.

Product decisions still needed:

1. Per-stitch physical restitch usage versus erroneous marks/catch-up: the high-water model cannot distinguish these. Restitching below the old peak currently needs a manual stash adjustment, and correcting only one erroneous stroke has no dedicated credit workflow. Do not describe whole-project correction as physical thread recovery.
2. Whether disabling should exclude intervening stitches permanently; current compatible behaviour catches up the cumulative increase on re-enable.
3. A distributed inventory protocol, and backup/restore treatment. Ledger records are local manager_state keys, not portable project settings, and current backup/sync formats export threads/patterns rather than these keys. A new browser checkpoints unknown historical usage safely; restoring older stock over an existing local ledger requires deliberate inventory reconciliation. No cross-device atomicity is claimed.
4. Whether preference changes should revalue prior consumption and how fractional/other stitch geometry should enter a future event-based model. Currently increases in derived cumulative usage are charged; decreases do not refund.

## Verification and bug hunts

Between accounting and blend stages, storage probes found and fixed stale Manager autosaves and migration reads outside the transaction. Abort injection verifies both stock and ledger roll back before an idempotent retry. Tests use actual fake-indexeddb transactions with independent bridge instances and no cross-tab locks.

Between blend and presence stages, probes cover zero stock/usage, partial stock, repeated writes, additions, equal numbers in different brands, ratios, fabric count/over-two, tails, waste and strand overrides. Existing thread-calculation tests remain compatible.

Presence uses a join/active protocol: a join solicits one active response per peer; active messages and periodic heartbeats never reply. Both BroadcastChannel and localStorage handlers run in bounded queue tests, including timer/listener cleanup. Stale, malformed, foreign-type and self messages are ignored. Presence is advisory and never changes stock.
