# Phase 1 Verification — Group B: Live Stash Deduction (Proposal D)

**Commit**: `7e34511` — feat(tracker): live stash deduction.

**Sources**: subagent C trace + spot-check at `tracker-app.js#L645–680` (snapshot toggle) and `palette-swap.js#L1225` (unrelated cross-check).

## 1.1 Intended behaviour

Real-time thread consumption: as the user marks stitches in the tracker, derive per-thread skein consumption from a configurable waste model and asynchronously deduct from the global stash via `StashBridge.updateThreadOwned`. Surface as a 4 px per-row meter, threshold toast at <0.25 skeins, and grouping into "Need more" vs "In stash". User can disable mid-session (with optional restore) and confirms a usage summary on project completion.

## 1.2 Code-path trace

1. **Toggle ON** ([tracker-app.js#L653–660](tracker-app.js#L653)) → `StashBridge.getGlobalStash()` snapshot → `window.__setRtStashSnapshot(snap)` → `setWastePrefs({...prev, enabled:true})`.
2. **Snapshot stored** in `rtStashSnapshotRef` ([tracker-app.js#L1218–1231](tracker-app.js#L1218)).
3. **wastePrefs persistence**: useEffect writes to `UserPrefs.set('rtWastePrefs', ...)` on every change ([L1239–1242](tracker-app.js#L1239)). Per-project `settings.wastePrefs` is **read on project load** ([L3059–3076](tracker-app.js#L3059)) but **never written back** by the gear-flyout edits — see DEFECT-007.
4. **Stitch marked**: `recordAutoActivity(completed, undone)` updates `colourDoneCountsRef` and bumps `countsVer`; `setLiveAutoStitches(completed - undone)` ([L1762](tracker-app.js#L1762), commit `0f528c9`).
5. **rtConsumption memo** ([L1620–1653](tracker-app.js#L1620)) recomputes per-thread `{skeinsConsumed, skeinsRemaining, ownedSkeins, effectiveCostIn}` keyed by thread id; aggregates blend palette entries onto component thread ids.
6. **Debounced flush** ([L1685–1690](tracker-app.js#L1685)): 30 s idle timer resets on each `countsVer` change; on fire calls `flushRtStashWrite()`.
7. **flushRtStashWrite** ([L1665–1675](tracker-app.js#L1665)): for each thread with `skeinsConsumed > 0`, `StashBridge.updateThreadOwned(id, max(0, ownedSkeins - skeinsConsumed))`. Errors caught + console-warned.
8. **beforeunload** ([L3594–3650](tracker-app.js#L3594)) clears the debounce and force-flushes.
9. **Disable confirm modal** ([L7054–7093](tracker-app.js#L7054)): keep / restore-stash / cancel. "Restore" rewrites every thread to `ownedSkeins` (the snapshot value).
10. **Complete summary modal** ([L7095–7146](tracker-app.js#L7095)): table of used/remaining; confirm flushes write.

## 1.3 Implementation check

| Aspect | Verdict |
|---|---|
| `threadCostPerStitch` defined and exported | ✅ IMPLEMENTED ([threadCalc.js#L108–124](threadCalc.js#L108)) |
| `RT_WASTE_DEFAULTS` constant | ✅ IMPLEMENTED — but commit message names keys `tailAllowance`, `runLength`, `waste`, `strands`; the actual code uses `tailAllowanceIn`, `threadRunLength`, `generalWasteMultiplier`, `strandCountOverride`. (Cosmetic doc/code drift.) |
| Snapshot at enable | ✅ IMPLEMENTED |
| Debounced 30 s + beforeunload flush | ✅ IMPLEMENTED |
| Per-row meter + grouping | ✅ IMPLEMENTED |
| Two new modals | ✅ IMPLEMENTED |
| Blend done-count aggregation | ✅ IMPLEMENTED |
| Low-thread toast (once per thread per session) | ✅ IMPLEMENTED ([L1698–1707](tracker-app.js#L1698)) |
| `setStashDeducted` referenced on project load | ⚠️ DEAD STATE — `stashDeducted` is set but never *read* anywhere. Setting it to `false` on load has no effect. |
| `rtWastePrefs` registered as a UserPrefs key | ⚠️ NOT VERIFIED — UserPrefs schema check needed; subagent reports no entry in DEFAULTS. |
| Per-project `settings.wastePrefs` written back | ❌ MISSING — see DEFECT-007. Project load reads it; gear-flyout writes only to global UserPrefs. |
| Unit test for `threadCostPerStitch` | ❌ MISSING — `tests/threadCalc.test.js` was not updated. |

## 1.4 Failure modes

| Mode | Verdict | Note |
|---|---|---|
| Browser force-quit before debounce + beforeunload | ⚠️ UNHANDLED — first batch of stitches lost from stash; tracker `done` is persisted, stash is not. Acceptable risk per PWA constraints, but document. |
| Two tracker tabs on different projects with Live on | ⚠️ UNHANDLED — last-writer-wins; no cross-tab coordination. See DEFECT-008. |
| Manager edits stash mid-session | ❌ UNHANDLED — manager edits are silently overwritten by the next debounce flush. Tracker does not refresh `rtStashSnapshotRef` on `cs:stashChanged`. **DEFECT-009**. |
| Undone > Completed in current session | ⚠️ HANDLED for stash (rtConsumption uses net), but `liveAutoStitches` can go negative; UI displays negative value. See Group D. |
| Blend uses thread that's also a solid in same project | ✅ HANDLED — both palette entries' done counts are summed onto the thread id. |
| `threadCostPerStitch` with fabricCount=0/NaN | ✅ HANDLED — defaults to 14. |
| Low-thread toast spam | ✅ HANDLED — `rtLowToastedRef` Set, once per thread per session. |
| **Re-enable after disable-with-keep**, then disable-with-restore | ❌ UNHANDLED — snapshot is captured *fresh on every toggle-on*. "Restore" reverts only the most recent enable's deductions, losing earlier ones. **DEFECT-001 (HIGH)**. |
| `rt_complete_summary` closed without confirming | ⚠️ IMPLICITLY HANDLED — pending debounce will still fire; benign duplicate write. |
| Race: beforeunload + pending debounce | ✅ HANDLED — beforeunload clears debounce before flush. |

## 1.5 Regression check

| Risk | Verdict |
|---|---|
| `stitchesToSkeins` callers unchanged | ✅ SAFE — `threadCostPerStitch` is additive, no callers replaced. |
| RT memo runs when disabled | ✅ SAFE — early return when `!wastePrefs.enabled`. |
| Manager re-renders on tracker write | ✅ SAFE — `updateThreadOwned` dispatches `cs:stashChanged`. |
| `recordAutoActivity` net-stitches change | ✅ SAFE for RT (uses colourDoneCountsRef independently); see Group D for negative-value risk. |

**Group verdict**: One HIGH defect (multi-session restore semantics), one HIGH defect (manager-edit clobber), one MEDIUM gap (per-project wastePrefs write-back), plus dead state and missing test.
