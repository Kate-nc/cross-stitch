# Phase 2 Cross-Cutting Verification

Five cross-cutting concerns audited across the 18-commit branch. Findings synthesised from subagent investigations + spot-checks.

## CC-1 Type / Contract Consistency

| Contract | Verdict |
|---|---|
| `wastePrefs` shape (`{enabled, tailAllowanceIn, threadRunLength, generalWasteMultiplier, strandCountOverride, lastWrittenAt}`) | ✅ CLEAN — defaults defined ([tracker-app.js#L1213](tracker-app.js#L1213)); `threadCostPerStitch` reads each key with `\|\|` fallback. **Caveat**: commit message lists *different* key names (`tailAllowance`, `runLength`, `waste`, `strands`); doc/code drift. |
| `genPatSnapshot` shape | ✅ CLEAN — bounds check before iteration; cleared in `resetAll`. |
| `colourReplaceModal` shape (`{srcId, srcName, srcRgb}`) | ✅ CLEAN — set with all three at every call site; modal reads with safe defaults. |
| `summaries[].palette` shape (now contains `[128,128,128]` for blend components in Creator projects) | ⚠️ RISKY but acceptable — current consumers (insights-engine, stats-insights) read for set membership/count, not swatch rendering. Future swatch consumer would render grey. |
| `proj.statsSessions[].netStitches` field | ⚠️ PARTIAL — present in newly-saved sessions; absent in pre-existing. Reducers tolerate absence with `stitchesCompleted` fallback (semantic drift but acceptable). |
| `previewFabricBg` boolean → `fabricColour` string migration | ⚠️ RISKY — see Group D / DEFECT-006. No `user-prefs.js` migration step verified. |

**No `as any` / type-coercion shortcuts** were added in this branch (it's a JS codebase; no static types).

## CC-2 State / Data Integrity

| Concern | Verdict |
|---|---|
| Tracker `done` vs StashBridge `owned` (30 s debounce window) | ⚠️ ACCEPTABLE — documented design tradeoff; window ≤30 s; recovery is manual. |
| `setLiveAutoStitches` invariant (`completed − undone`) | ✅ CLEAN — both producer (recordAutoActivity) and consumer (end-session) use the same definition. |
| `genPatSnapshot` lifetime | ✅ CLEAN — session-scoped, cleared in `resetAll`. |
| `proj.palette` derivation accidentally written back to disk | ✅ SAFE — purely in-memory in stats summary. |
| V3 migration → manager auto-save race | ✅ CLEAN — dispatch fires inside `tx.oncomplete`; manager auto-save is debounced. |
| **Multi-tab / manager-edit-mid-session clobber** | ❌ DEFECT — Tracker's debounced flush blindly overwrites stash with `snapshot − consumption`. Manager edits made between snapshot and flush are silently lost. **DEFECT-009 (HIGH)**. |
| Restore-stash semantics across enable/disable cycles | ❌ DEFECT — Snapshot captured fresh each enable; "restore" only reverses the most recent enable's deductions. **DEFECT-001 (HIGH)**. |

## CC-3 Error Propagation

| Path | Verdict |
|---|---|
| `applyGlobalColorReplacement` unknown dst | ❌ silent no-op (DEFECT-002). |
| `ColourReplaceModal` global missing | ❌ silent no-op (DEFECT-003). |
| `revertToGenPalette` length mismatch | ✅ early return. |
| Debounced flush write failure | ✅ try/catch + `console.warn`; no user toast though. |
| `migrateSchemaToV3` transaction failure | ✅ `tx.onerror` → reject. |
| `buildStatsSummary` palette derivation throw | ✅ no throw possible (pure array iteration with guards). |
| Polling `__openTrackerStats` timeout | ❌ silent (DEFECT-010). |

**Pattern**: this branch consistently chooses *silent* failure over *visible* failure for "couldn't find a thing" cases. Each is individually defensible but the cumulative effect is poor UX feedback. See SUMMARY.md "tech debt" list.

## CC-4 Inter-Commit Interaction

| Pair | Finding |
|---|---|
| `fa3c594` (msg: rebuildPreservingZeros) ↔ `255142d` (msg: direct colour swap) | **Mismatch (metadata only)** — fa3c594's diff actually contains the entire colour-swap source, 255142d's diff is just the bundle. Code works; commit log misleads. **DEFECT-014 (LOW)**. |
| `3c41d15` (`remove_unused_colours` history branch) ↔ `fa3c594` (palette rebuild path) | ✅ Compatible — `rebuildPreservingZeros` is on paint/fill paths only; remove-unused uses its own flow. |
| `useEditHistory.js` branches: `remove_unused_colours` (explicit) vs `colorReplace` (generic) vs `revert_to_gen` (generic) | ⚠️ Two of three rely on the generic `{changes}` handler. Works today; brittle if the generic handler is refactored. **DEFECT-012 (LOW)**. |
| `0f528c9` (`setLiveAutoStitches(completed-undone)`) ↔ `7e34511` (rtConsumption) | ✅ Compatible — rtConsumption reads `colourDoneCountsRef`, which has its own undo accounting. |
| `e54d5c1` + `5b2ebff` blend splitting coverage | ✅ All grep'd sites covered, with the caveat that `lowStockNeeded` (named in 5b2ebff message) doesn't exist as a literal symbol (DEFECT-013). |
| Spelling drift `colorReplace` vs `colourReplace` (DEFECT-005) | LOW. |
| Two tools/buttons that touch ActionBar gating (`dde642f` adds difficulty rendering, `f36436a` adds always-render) | ✅ Compatible — full-bar branch unchanged. |

## CC-5 Test Coverage Gap

**Branch test changes**: 2 (one assertion, one snapshot bump). Production code changes: ~1.5k lines.

| Feature | New test? | Existing module tests cover? | Verdict |
|---|---|---|---|
| `removeUnusedColours` (history, undo, redo) | ❌ | helpers/components only | NO TEST |
| `applyGlobalColorReplacement` | ❌ | none | NO TEST |
| `revertToGenPalette` (incl. silent done-wipe!) | ❌ | none | NO TEST |
| `threadCostPerStitch` | ❌ | `tests/threadCalc.test.js` exists for `stitchesToSkeins` only | NO TEST |
| `rtConsumption` blend aggregation | ❌ | none | NO TEST |
| `calcDifficulty` new signature/factors | ❌ | `tests/helpers.test.js` covers `fmtTimeL` only | NO TEST |
| Blend split in palette derivation | ❌ | none | NO TEST |
| `statsSessions` fallback in 4 readers | ❌ | none directly | NO TEST |
| `migrateSchemaToV3` dispatch | ❌ | none | NO TEST |
| Manager `updateThread` V3 stamping | ❌ | none | NO TEST |
| ActionBar always-render | ✅ adjusted | `tests/creatorActionBar.test.js` | EXPLICIT (only structural; doesn't run the component) |
| `colourSwap` icon | ✅ snapshot | `tests/icons.test.js` | EXPLICIT (snapshot only) |

**Verdict**: ❌ DEFECT — 18 commits, 10+ untested features. **DEFECT-015 (HIGH severity in aggregate)**.

## CC-6 Dependency / Configuration

- `package.json` — **not touched**. No new dependencies, no version bumps.
- `build-creator-bundle.js` — adds `creator/ColourReplaceModal.js` to concat order. Verified: file present, ordering puts it after dependencies.
- `manifest.json`, `sw.js`, `sw-register.js` — unchanged.
- No `.env`, CI, or build-config files changed.
- `index.html` — only `CREATOR_CACHE_KEY` was bumped per commit (cache-bust).

**Verdict**: ✅ CLEAN. No dependency or configuration risk.
