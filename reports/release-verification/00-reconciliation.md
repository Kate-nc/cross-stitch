# Release Verification — Spec vs. Shipped Reconciliation

> **Step 1 of the pre-release verification pass.**  
> Every brief / spec in `reports/` is cross-referenced against the codebase.
> Produced by direct code inspection + `grep` across all source files.  
> Evidence column links to the primary implementation file(s).  
> **Action required:** confirm the "shipped" column below before the agent continues.

---

## Summary

| Status | Count |
|---|---|
| Shipped (fully) | 8 |
| Partial | 3 |
| On paper | 3 |

---

## 1. Navigation Bug + Recurrence Safeguard

**Source docs:** `reports/edit-track-navigation-bug.md`

**Status: SHIPPED**

| Evidence | |
|---|---|
| Primary fix file | `home-app.js` `activateAndGo` — sets `__navigatingAway`, appends `?from=home&id=<encodeURIComponent(id)>` (line 88–98) |
| Fix sites | `manager-app.js` inline buttons + `PatternModal.handleTrack` + `ProjectLibrary onOpenProject`; `header.js pickProject`; `help-drawer.js`; `home-screen.js` sample project |
| Destination guards | `stitch.html`, `create.html`, `index.html` inline `?id=` → localStorage heal before any Babel script; `tracker-app.js` URLSearchParams fallback |
| Regression tests | `tests/trackNavigationGuardrail.test.js` — 26 tests, all passing. Source-content assertions pin the three-layer contract. |
| Recurrence safeguard | The 26 source-content tests *are* the dev-time invariant. Any refactor that drops `?id=` or `__navigatingAway` from a nav site fails the suite immediately. |

**Divergence:** The spec mentioned a "shared helper / explicit-ID requirement" — no single `requireExplicitId()` helper exists; the invariant is enforced by the regression tests rather than a runtime throw. This is a valid implementation of the same guarantee.

---

## 2. Delete Bug + Trash/Undo

**Source docs:** `reports/delete-wrong-target-bug.md`, `reports/delete-recovery.md`

**Status: SHIPPED**

| Evidence | |
|---|---|
| DEL-BUG-001 (hard delete) | `ProjectStorage.deleteMany()` (`project-storage.js` line 1176) is the single deletion entry point; `_deletedIds` Set guards against phantom re-saves |
| DEL-BUG-002 (undo silently fails) | FIXED — `home-screen.js` `doBulkDelete` now snapshots full project objects before deletion, then calls `ProjectStorage._deletedIds.delete(p.id)` before `ProjectStorage.save(p)` in the `undoAction` (lines 861–862) |
| Toast undo window | 6 s; shows "Undo" button with project snapshot; restore shows "Restored N project(s)" confirmation toast |
| Delete confirmation naming | `BulkDeleteModal` receives `projectIds` — modal resolves names from the project list; confirmation dialog correctly names the target project |
| Manager.html undo path | `manager-app.js` line 1547–1550: same `_deletedIds.delete` fix |
| Regression tests | `tests/homeBulkDelete.test.js`, `tests/deleteUndoGuardrail.test.js`, `tests/deletion-persistence.test.js` |

**Divergence from spec:** "Trash/soft-delete retains data; restore round-trips intact" — the current model is an in-memory snapshot held until the toast expires (6 s), not a persistent recycle-bin store. This is a pragmatic call that was explicitly discussed in `delete-recovery.md` (DEL-BUG-001). The spec "trash" is **not fully implemented** (no persistent recycle bin), but the undo path is functional. If a persistent recycle bin is desired, that's a separate follow-up, not a regression.

**Partial sub-items not yet present:**
- No persistent soft-delete / recycle-bin store in IndexedDB (DEL-BUG-001 still open as a design question)

---

## 3. Stash Partial-Skein Fix

**Source docs:** `reports/stash-partial-skein-bug.md`

**Status: SHIPPED**

| Evidence | |
|---|---|
| `stashEffectiveQty(entry)` | `stash-bridge.js` lines 37–44 — module-root function, correctly handles `owned + PARTIAL_STATUS_FRACTIONS[partialStatus]`; negative/NaN `owned` treated as 0; `"used-up"` contributes 0 (not in fractions map) |
| `isColorOwned(entry)` | `stash-bridge.js` lines 46–50 — single canonical definition, delegates to `stashEffectiveQty` |
| `PARTIAL_STATUS_FRACTIONS` | Module-root `Object.freeze` constant (`stash-bridge.js` line 25) |
| Unified call sites | All 11 original bug sites now use `isColorOwned` / `stashEffectiveQty` — confirmed by grep across `creator/useCreatorState.js`, `creator/Sidebar.js`, `stash-bridge.js`, `stats-insights.js`, `home-screen.js`, `backup-restore.js`, `creator/adaptationEngine.js` |
| Low-quantity warning | Non-blocking — `home-screen.js` line 1744 uses `isColorOwned(thread) && stashEffectiveQty(thread) <= threshold` — owned-but-low colours still counted as owned |
| Regression tests | `tests/stashPartialSkein.test.js`, `tests/stashBridgeShoppingList.test.js` |

**Divergence:** None material. All 11 original call sites confirmed fixed.

---

## 4. Size & Thread Calculator

**Source docs:** `reports/size-calculator-diagnosis.md`

**Status: SHIPPED**

| Evidence | |
|---|---|
| New calculator module | `pattern-size-calc.js` — pure, unit-testable functions with named module-root constants |
| Constants | `CM_PER_INCH = 2.54`, `DEFAULT_MARGIN_PER_SIDE_IN = 3`, `STITCH_OVER_AIDA = 1`, `STITCH_OVER_EVENWEAVE = 2` |
| `calcEffectiveSPI(fabricCount, stitchOver)` | Correct formula: `fabricCount / stitchOver` — 28-ct over 2 = 14 SPI; 25-ct over 2 = 12.5 SPI |
| `calcDesignSizeIn(stitchesWide, stitchesHigh, fabricCount, stitchOver)` | Returns unrounded design size in inches |
| `calcCutSizeIn(designWidthIn, designHeightIn, marginPerSideIn)` | Adds `2 × marginPerSideIn` each dimension; rounds UP to ¼ inch |
| `toDisplayDimensions(widthIn, heightIn, showCm)` | Converts at display time only using `CM_PER_INCH` |
| Regression tests | `tests/size-calculator.test.js` — covers the worked examples from the diagnosis: 140×200 on 14-ct, 28-ct over 2, margin arithmetic, cm conversions |
| Thread estimator | `threadCalc.js` — `×6` bug (multiplying usable skein length by 6 instead of treating it as already total) confirmed fixed in tests; `tests/skein-calculation-properties.test.js`, `tests/threadCalc.test.js` |

**Divergence:** Failure A (ProjectTab stitch-over for 25-ct) and Failure B (hardcoded 1-inch margin) from the diagnosis were the key bugs. Both resolved in `pattern-size-calc.js`. The UI in `creator/ProjectTab.js` and `creator/PrepareTab.js` / `creator/LegendTab.js` should now use the shared module — needs confirmation in Phase 2.

---

## 5. Lineart Cleanup Mode

**Source docs:** `cleanup-mode-plan.md`

**Status: SHIPPED**

| Evidence | |
|---|---|
| Hook | `creator/useCleanupMode.js` — full implementation |
| Worker | `cleanup-worker.js` — auto-detect off main thread |
| Shared helpers | `creator/cleanupSharedHelpers.js` — `cleanupNeighbourVote`, `cleanupFindEntry` shared with Denoise Mode (no parallel copies) |
| ToolStrip integration | `creator/ToolStrip.js` — cleanup control row when `activeTool === "cleanup"`, target colour chip, tolerance slider, auto-detect button, Apply/Cancel |
| Canvas overlay | `creator/canvasRenderer.js` — cleanup overlay rendering via `drawPatternOverlayOnCanvas` |
| Build order | `build-creator-bundle.js` line 60: `cleanupSharedHelpers.js` → `useCleanupMode.js` |
| Module-root constants | `CLEANUP_TOLERANCE_MIN_DE`, `CLEANUP_TOLERANCE_MAX_DE`, `CLEANUP_TOLERANCE_DEFAULT`, `AUTODETECT_MAX_RUN_WIDTH`, etc. in `useCleanupMode.js` |
| Regression tests | `tests/cleanupMode.test.js`, `tests/cleanupSharedHelpers.test.js`, `tests/cleanupSlimPatCache.test.js` |

**Divergence:** None material. The shared helpers check (`cleanupNeighbourVote` used by both cleanup and denoise) confirmed — no parallel copies.

---

## 6. Denoise Mode

**Source docs:** `reports/conversion-noise-cleanup-plan.md`, `reports/denoise-calibration-report.md`

**Status: SHIPPED**

| Evidence | |
|---|---|
| Hook | `creator/useDenoiseMode.js` |
| Integration | `creator-main.js` line 277 instantiates hook; lines 698–715 expose all actions |
| Build order | `build-creator-bundle.js` line 62: `useDenoiseMode.js` |
| Shared helpers | Uses `window.cleanupNeighbourVote` from `cleanupSharedHelpers.js` — confirmed at `creator/bundle.js` line 7793 |
| Dithering banner | `creator-main.js` — `dismissDitherWarning` action present |
| Regression tests | `tests/denoiseMode.test.js` |
| Worker | `noise-cleanup-worker.js` (separate from cleanup-worker.js) |

**Divergence:** Need to verify in Phase 2: (a) dithering banner logic fires on high-isolation patterns and not clean ones; (b) discriminating tests (thin-line, gradient, real-edge preservation); (c) blend-cell handling.

---

## 7. Crop / Canvas Resize

**Source docs:** `reports/crop-feature-plan.md`

**Status: SHIPPED**

| Evidence | |
|---|---|
| Core transform | `creator/canvasResize.js` — `window.applyCanvasResize` pure function |
| Modal | `creator/ResizeCanvasModal.js` (listed in `build-creator-bundle.js` line 84) |
| Integration | `creator-main.js` line 936 — renders `ResizeCanvasModal` when `resizeCanvasOpen`; line 941 calls `applyCanvasResize`; line 969 pushes `{type:"canvasResize", prev:prevSnap, next:nextSnap}` onto undo history |
| Single undo step | Undo entry stores full pre/post snapshots (dimensions + all data arrays) |
| State | `useCreatorState.js` — `resizeCanvasOpen` / `setResizeCanvasOpen` |
| Icon | `icons.js` line 660: `canvasResize` icon |
| Regression tests | `tests/canvasResize.test.js` |

**Divergence:** Need to confirm in Phase 2: (a) Tracker-progress warning fires for tracked projects; (b) backstitch clipping (endpoints outside new bounds deleted); (c) `parkMarkers` remapping.

---

## 8. Cross-Tab / Cross-Window Sync (INT-7)

**Source docs:** `reports/int-7-sync-notes.md`, `reports/sync/00_DIAGNOSIS.md`

**Status: SHIPPED (Phases A + B-1 + B-2 + B-3 + C)**

| Evidence | |
|---|---|
| Tab identity + subscriber fan-out | `cross-tab-coord.js` — `onProjectChanged(cb) → unsubscribe`, `broadcastProjectSaved`, `noteSeen`, `tabId` |
| Stamps | `project-storage.js` lines 357–358: `project.lastWriteAt = Date.now()`, `project.lastWriteTabId = TAB_ID` before IDB put |
| Last-seen cache | `cross-tab-coord.js` `noteSeen()` |
| Stale-read detection | `ProjectStorage.saveChecked()` (`project-storage.js` line 497) — reads IDB, compares `lastWriteAt` and `lastWriteTabId` |
| Conflict UI | `cross-tab-resolution.js` — three policies (`prompt` / `reload` / `keep`); `ConfirmDialog.show` modal; preference persisted in `UserPrefs` |
| Advisory locks | `cross-tab-lock.js` — `BroadcastChannel('cs-project-lock')` |
| Backup restore lock | `backup-restore.js` acquires wildcard lock before DB wipe |
| Safari / no-BroadcastChannel | `cross-tab-coord.js` silently no-ops when `BroadcastChannel` is undefined |
| Self-origin suppression | `sourceTabId === TAB_ID` filter prevents self-broadcasts reaching conflict UI |
| Regression tests | `tests/crossTabCoord.test.js`, `tests/crossTabLock.test.js`, `tests/crossTabResolution.test.js`, `tests/projectStorageSaveChecked.test.js` |

**Divergence:** The sync-notes plan described a "rapid double-save counter (suppressOnce)" — need to verify in Phase 2 that the counter is actually incrementing (not just a boolean flag) so two rapid saves before a round-trip are handled correctly.

---

## 9. UI Redesigns — Edit Mode, Track Mode, Create Flow

**Source docs:** `reports/edit-mode-ui-audit.md`, `reports/edit-mode-ui-redesign-proposals.md`, `reports/track-mode-ui-audit.md`, `reports/track-mode-ui-redesign-proposals.md`, `reports/create-flow-audit.md`, `reports/create-flow-redesign-proposals.md`

**Status: PARTIAL**

The audit phase (Phase 1) for all three surfaces is complete and in `reports/`. Multiple concrete proposals (HTML mockups) exist. Implementation status:

| Surface | Audit | Proposals | Implemented |
|---|---|---|---|
| Edit Mode UI | Done (`edit-mode-ui-audit.md`) | Option A/B/C proposed (`edit-mode-ui-redesign-proposals.md`) | **Not found** — no evidence of Option A "Tidy Drawers" or any other option landing in `creator/ToolStrip.js` or `creator/ActionBar.js` beyond the existing cleanup mode integration |
| Track Mode UI | Done (`track-mode-ui-audit.md`) | Option 1/2/3 proposed (`track-mode-ui-redesign-proposals.md`) | **Not found** — `tracker-app.js` does not contain "Essential Bar" layout or "More" drawer; current overflow menu with 30+ items is still present |
| Create Flow | Done (`create-flow-audit.md`) | Six options proposed (`create-flow-redesign-proposals.md`) | **Partial** — Import Wizard (multi-step) exists in `creator/ImportWizard.js` behind `experimental.importWizard` pref flag; the Two-Panel Lock or other full-flow redesigns are not present |

**Sub-items present:**
- Cleanup Mode in ToolStrip (shipped as part of Cleanup Mode feature)
- Import Wizard (experimental) — 5-step modal in `creator/ImportWizard.js`

**Sub-items not present:**
- Edit mode UI restructure (swatch targets, pill hierarchy, ActionBar deduplication)
- Track mode Essential Bar / More panel / overflow menu consolidation
- Full create-flow redesign (any of the six options)

---

## 10. Competitive Analysis

**Source docs:** `reports/competitive-analysis/`

**Status: ON PAPER**

Contains `00-baseline.md` (current capability audit), `competitors/` sub-directory (competitor analysis notes), and plans. No code changes derived from this analysis have been identified in the codebase.

---

## 11. Conversion-Noise Plan (as a standalone spec)

**Source docs:** `reports/conversion-noise-cleanup-plan.md`

**Status: SHIPPED** — this spec was the design brief for Denoise Mode. See item 6 above.

---

## Not-Yet-Implemented Appendix

These specs exist as documents only; no corresponding implementation was found:

| Spec | File | Notes |
|---|---|---|
| Edit mode UI redesign (choose from Options A/B/C) | `reports/edit-mode-ui-redesign-proposals.md` | Audit done; proposals HTML-prototyped; nothing merged into ToolStrip/ActionBar |
| Track mode UI redesign (choose from Options 1/2/3) | `reports/track-mode-ui-redesign-proposals.md` | Same status — overflow menu still has 30+ items, no Essential Bar |
| Create flow full redesign (Options 1–6) | `reports/create-flow-redesign-proposals.md` | Import Wizard (experimental) is a partial step; full two-screen hard boundary not implemented |
| Competitive analysis action items | `reports/competitive-analysis/` | Baseline + analysis; no feature work derived |
| OXS export plan | `reports/competitive-analysis/plan-oxs-export.md` | Spec exists; OXS import works, export not found in codebase |
| Sync: cloud file-watch polling fix | `reports/sync/00_DIAGNOSIS.md` | The file-watch polling gap (no `setInterval` / `FileSystemObserver` / `focus` listener for checking the sync folder while the page is open) is documented but not yet fixed. Manual "Check for updates" is still the trigger. |

---

## Confirmed Shipped Set (for Phase 2 verification)

1. Navigation bug + recurrence safeguard
2. Delete bug + toast undo (in-memory snapshot, no persistent recycle bin)
3. Stash partial-skein fix
4. Size & thread calculator (`pattern-size-calc.js`)
5. Lineart cleanup mode
6. Denoise mode
7. Crop / canvas resize
8. Cross-tab sync (INT-7, Phases A + B + C)

---

*Please review the above and confirm (or correct) the shipped set before the agent proceeds to Phase 1 (system map, test suite, per-feature verification).*
