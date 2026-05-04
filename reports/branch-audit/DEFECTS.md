# Defect Report

Synthesised from Phase 1 verification (groups A–E) and Phase 2 cross-cutting findings.

Severity scale:
- **CRITICAL** — data corruption, crash on common path, security
- **HIGH** — primary use case broken, or silent data loss on a realistic user action
- **MEDIUM** — edge-case failure, recoverable, or affects non-primary path
- **LOW** — cosmetic, dev-only, or tech debt

---

## DEFECT-001 — Restore-stash semantics broken across enable/disable cycles

- **Severity**: HIGH
- **Category**: Missing implementation
- **Source commit(s)**: `7e34511`
- **File(s)**: [tracker-app.js#L645–660](tracker-app.js#L645) (snapshot capture on toggle), [#L7054–7093](tracker-app.js#L7054) (restore modal)
- **What should happen**: "Restore stash" in the rt_disable_confirm modal should reverse *all* deductions made while live tracking was active during this project session, returning the stash to its pre-tracking state.
- **What actually happens**: The snapshot in `rtStashSnapshotRef` is **captured fresh every time the user toggles Live ON** (line 654). After a sequence of (enable → stitch → disable-with-keep → re-enable → stitch → disable-with-restore), "restore" only reverts the second batch's deductions; the first batch's effect on the stash is permanent and unrecoverable.
- **Reproduction path**:
  1. Stash 310 = 5 skeins.
  2. Enable Live, stitch 100 of 310 (consumes ≈0.8 skein) → flush → stash = 4.2.
  3. Disable Live, choose "Keep deductions".
  4. Re-enable Live (snapshot now = 4.2). Stitch 100 more → flush → stash = 3.4.
  5. Disable Live, choose "Restore stash" → writes 4.2 (the recent snapshot), not 5.
  6. User believes stash should be 5; it's 4.2; first session's 0.8 deduction is lost.
- **Suggested fix**: Take the snapshot only when `wastePrefs.enabled` transitions from false → true *and* `rtStashSnapshotRef.current` is empty for this project. Clear the snapshot on `rt_complete_summary` confirm or on project switch (already done in `resetAll`-equivalent), but NOT on subsequent toggle-on. Alternatively, accumulate cumulative `skeinsConsumed` per project rather than per enable cycle.
- **Fix complexity**: Moderate (1–4 hrs)
- **Blocks merge?**: **Yes** — this is the user-facing safety net for the new feature; if it can lose stash data silently, the disable flow is misleading.

---

## DEFECT-002 — `applyGlobalColorReplacement` silently no-ops when destination unknown

- **Severity**: MEDIUM
- **Category**: Error propagation / user feedback
- **Source commit(s)**: `fa3c594` (source); `255142d` (bundle)
- **File(s)**: `creator/useMagicWand.js` (function body, ~L451–481 in source)
- **What should happen**: If the user picks a destination that can't be resolved (cmap, `findThreadInCatalog`, DMC array all return null), show a toast like "Couldn't find that thread" so the user knows nothing happened.
- **What actually happens**: Function returns silently; modal closes; pattern unchanged; no toast, no console message.
- **Reproduction path**: Hard to trigger via UI (the modal only lists DMC threads), but possible if a future entry point passes a non-DMC id like `anchor:403`, or if DMC catalog data is corrupted at runtime.
- **Suggested fix**: `if (!dstEntry) { state.addToast?.('Replacement colour not found', {type:'error', duration:3500}); return; }`
- **Fix complexity**: Trivial
- **Blocks merge?**: No — current entry points (DMC modal) make this unreachable for end users.

---

## DEFECT-003 — Replace tool silently does nothing if bundle is stale

- **Severity**: LOW (dev-only — release builds always include the rebuilt bundle)
- **Category**: Error propagation
- **Source commit(s)**: `fa3c594`, `255142d`
- **File(s)**: [creator-main.js#L827–831](creator-main.js#L827)
- **What should happen**: If `window.ColourReplaceModal` global is missing (forgotten bundle rebuild), the developer should see a console error or fallback UI.
- **What actually happens**: Conditional `state.colourReplaceModal && typeof window.ColourReplaceModal !== 'undefined'` renders `null`. Tool, context-menu item, and chip swap button all do nothing.
- **Suggested fix**: When `state.colourReplaceModal` is truthy but the modal global is undefined, log a `console.error` and show a temporary toast.
- **Fix complexity**: Trivial
- **Blocks merge?**: No.

---

## DEFECT-004 — "Revert to generated palette" silently destroys all stitching progress

- **Severity**: HIGH
- **Category**: State integrity (silent data loss)
- **Source commit(s)**: `bcca388`
- **File(s)**: [palette-swap.js#L1225](palette-swap.js#L1225) — `setDone(new Uint8Array(snap.pat.length))`
- **What should happen**: If the user has marked any stitches done (i.e. `done` array contains any `1`s), prompt them with a confirmation modal explaining that revert will discard those marks. Or save them under undo so the user can recover.
- **What actually happens**: `revertToGenPalette` unconditionally allocates a fresh zeroed Uint8Array and replaces `done`. The history entry it pushes (`{type:'revert_to_gen', changes:[…]}`) records the *cell-id* changes for palette undo, but **does not capture the prior `done` array**. Even Ctrl-Z cannot recover the wiped progress.
- **Reproduction path**:
  1. Generate a pattern.
  2. Apply a palette swap (any change to make the revert button enabled).
  3. Mark several stitches done in the Creator's edit view.
  4. Click "Revert to generated palette" in the palette-swap section.
  5. All `done` marks gone; Ctrl-Z restores the palette but not the `done` data.
- **Suggested fix**: Either (a) include `oldDone: done.slice()` in the history entry and have the generic undo handler restore it, or (b) prompt with `confirm('Reverting will clear your stitching progress. Continue?')` when `done?.some(v => v === 1)`. Option (a) is cleaner; (b) is faster.
- **Fix complexity**: Moderate
- **Blocks merge?**: **Yes** — silent destructive action with no warning is unacceptable.

---

## DEFECT-005 — Spelling drift between `colorReplace` and `colourReplace`

- **Severity**: LOW
- **Category**: Consistency / maintainability
- **Source commit(s)**: `fa3c594`
- **File(s)**: `creator/useMagicWand.js` (history type `'colorReplace'`, function `applyGlobalColorReplacement`), `creator/ColourReplaceModal.js`, `creator/ContextMenu.js`, `creator/useCanvasInteraction.js` (tool name `'colourReplace'`), `creator-main.js`
- **What should happen**: Pick one spelling and use it everywhere. AGENTS.md mandates British English in user-facing strings; the AGENTS.md doesn't cover internal symbol names but the rest of the file uses British (`colourReplace`).
- **What actually happens**: Mixed — tool name and modal global use British; history-entry type and function name use American.
- **Suggested fix**: Rename `'colorReplace'` (history type) → `'colourReplace'` and `applyGlobalColorReplacement` → `applyGlobalColourReplacement`. Note: history type is persisted in undo stack only (in-memory), not on disk, so no migration needed.
- **Fix complexity**: Trivial (rename + bundle rebuild)
- **Blocks merge?**: No.

---

## DEFECT-006 — `previewFabricBg` boolean removed without preference migration

- **Severity**: LOW
- **Category**: Regression / state integrity
- **Source commit(s)**: `d5cf109`
- **File(s)**: [creator/PreviewCanvas.js](creator/PreviewCanvas.js); `user-prefs.js` (not modified — that's the issue)
- **What should happen**: Existing users with `previewFabricBg=true` should see their previous beige background somewhere — ideally migrated to `fabricColour=#F5F0E6`.
- **What actually happens**: PreviewCanvas now reads `app.fabricColour` (a `#RRGGBB` user-pref). If unset or malformed (3-char hex), falls back to white. The previous boolean is no longer read anywhere; users who turned it on now silently see a different background.
- **Suggested fix**: Add a one-time migration in `user-prefs.js`: `if (legacy previewFabricBg === true && fabricColour is unset) set fabricColour = '#F5F0E6'`.
- **Fix complexity**: Trivial
- **Blocks merge?**: No (cosmetic, one-time visual change).

---

## DEFECT-007 — Per-project `wastePrefs` not written back on save

- **Severity**: MEDIUM
- **Category**: Missing implementation
- **Source commit(s)**: `7e34511`
- **File(s)**: `tracker-app.js` (project-save serialiser, not in branch diff — needs to be located)
- **What should happen**: When the user changes waste settings via the gear flyout while a project is loaded, the change should persist *both* globally (so new projects use the same default) and *per-project* (so this project keeps its own customisation).
- **What actually happens**: gear flyout writes to `wastePrefs` state → useEffect persists to global UserPrefs only. Project save does not include the current `wastePrefs` in `settings.wastePrefs`. On reload, project hydrates from `settings.wastePrefs` (which is stale or absent) then falls back to global UserPrefs (which has the latest value), so the change *appears* to stick — but per-project isolation is impossible.
- **Reproduction path**: Set global waste = 10%; load project A; in gear flyout set waste = 20% for project A; load project B; project B inherits 20% from global — correct. Now load project A again — project A also reads 20% from global (its `settings.wastePrefs` either doesn't exist or is stale). User cannot have different waste for different projects.
- **Suggested fix**: In the project-save serialiser, include `settings.wastePrefs = wastePrefs` (or just the user-overridable subset). Also, on hydration, prefer per-project over global.
- **Fix complexity**: Moderate
- **Blocks merge?**: No, but the feature is documented as "persisted per-project" in the commit message, so the feature is incomplete.

---

## DEFECT-008 — Multi-tab live-stash conflict with no cross-tab coordination

- **Severity**: MEDIUM
- **Category**: State integrity
- **Source commit(s)**: `7e34511`
- **File(s)**: [tracker-app.js#L1665–1675](tracker-app.js#L1665) (flushRtStashWrite)
- **What should happen**: If two tracker tabs are open with Live enabled (different projects), each tab's deductions should compose correctly (they're independent threads in different proportions).
- **What actually happens**: Each tab maintains its own `rtStashSnapshotRef` and computes `newOwned = snapshot.owned - skeinsConsumed`. Tab A and Tab B both write `newOwned` based on their own snapshot; the later write overwrites the earlier. Net deduction = max(A, B), not A+B.
- **Suggested fix**: Either prevent multi-tab usage (BroadcastChannel + show "another tab is tracking" warning) or switch to relative deductions (`newOwned = current_owned - delta_since_last_write`) using an atomic IDB read-modify-write in `StashBridge.updateThreadOwned`.
- **Fix complexity**: Significant (StashBridge atomicity refactor)
- **Blocks merge?**: No — single-tab use is the documented assumption.

---

## DEFECT-009 — Manager edit mid-session is silently overwritten

- **Severity**: HIGH
- **Category**: State integrity (silent data loss for the user)
- **Source commit(s)**: `7e34511`
- **File(s)**: [tracker-app.js#L1665–1675](tracker-app.js#L1665) (flushRtStashWrite); snapshot updated only at toggle-on
- **What should happen**: If the user opens Manager mid-session (or Manager auto-syncs from a backup/import) and adjusts a thread quantity, the tracker's next debounced flush should not blow that change away.
- **What actually happens**: Snapshot is captured at toggle-on and never refreshed. The flush writes `snapshot - consumption`, ignoring the manager's edit. Example: snapshot=5, manager-edit→7, tracker flush→4.2 (overwrites 7).
- **Reproduction path**:
  1. Enable Live tracking; stitch a few of thread 310.
  2. Open Manager in another tab; click +1 on 310 (now should be 6 + remaining consumption).
  3. Continue stitching for 30 s in tracker tab → debounce fires.
  4. Manager's +1 is gone.
- **Suggested fix**: Listen for `cs:stashChanged` from external sources in tracker; when fired, refresh `rtStashSnapshotRef` to the latest IDB value (and recompute baseline so existing consumed remains valid). Or implement relative-delta writes (see DEFECT-008).
- **Fix complexity**: Moderate
- **Blocks merge?**: **Yes** — this is invisible data loss on a plausible workflow (user wants to record a stash purchase mid-session).

---

## DEFECT-010 — `handleViewProject` polling fails silently after 2 s

- **Severity**: LOW
- **Category**: Error propagation
- **Source commit(s)**: `3044d38`
- **File(s)**: [stats-page.js#L1798–1813](stats-page.js#L1798)
- **What should happen**: If the tracker doesn't expose `__openTrackerStats` within 50×40 ms = 2 s, surface a toast / log so the user knows the navigation succeeded but stats won't auto-open.
- **What actually happens**: `tries++ < 50` cap reached; `tryOpen()` exits silently. User lands on the tracker but stats panel is closed.
- **Suggested fix**: When `tries === 50`, `console.warn('Tracker stats hook never appeared')` and (optionally) a non-blocking toast.
- **Fix complexity**: Trivial
- **Blocks merge?**: No.

---

## DEFECT-011 — `liveAutoStitches` can go negative; UI unguarded

- **Severity**: LOW
- **Category**: Edge-case handling
- **Source commit(s)**: `0f528c9`
- **File(s)**: [tracker-app.js#L1762](tracker-app.js#L1762) and downstream display sites
- **What should happen**: `setLiveAutoStitches(Math.max(0, completed - undone))` so the live counter, end-session totals, and progress percentages never display negative numbers.
- **What actually happens**: If the user undoes more stitches than they completed in this session (e.g. clearing pre-existing stitches), the value goes negative. Progress percentage can compute > 100 %.
- **Suggested fix**: Clamp at the source (`Math.max(0, ...)`); also clamp `netSessionDelta` if needed.
- **Fix complexity**: Trivial
- **Blocks merge?**: No.

---

## DEFECT-012 — `colorReplace` and `revert_to_gen` undo/redo rely on generic handler

- **Severity**: LOW
- **Category**: Maintainability / fragility
- **Source commit(s)**: `fa3c594`, `bcca388`
- **File(s)**: `creator/useEditHistory.js` (no dedicated branch for either type)
- **What should happen**: Either an explicit branch for each known history type, or an explicit comment that the generic handler covers them.
- **What actually happens**: Both types are handled implicitly by the catch-all that iterates `entry.changes`. Works because both types use the same shape, but a future refactor of the generic handler could break either silently.
- **Suggested fix**: Add a comment in `useEditHistory.js` listing every history type and which branch handles it. Optionally add explicit no-op branches for `colorReplace` and `revert_to_gen` to lock in the contract.
- **Fix complexity**: Trivial
- **Blocks merge?**: No.

---

## DEFECT-013 — `lowStockNeeded` named in commit message but not located

- **Severity**: LOW
- **Category**: Test gap / verification gap
- **Source commit(s)**: `5b2ebff`
- **File(s)**: `stats-page.js` / `manager-app.js` (subagent could not locate function literally named `lowStockNeeded`)
- **What should happen**: Either the function exists and was patched, or the commit message uses a colloquial name for a different symbol.
- **What actually happens**: Subagent grep found the blend-split changes but no `lowStockNeeded` symbol. Possible the commit message refers to a *concept* (low-stock needed display) rather than a literal function name.
- **Suggested fix**: Verify with the author whether `lowStockNeeded` was meant literally; if so, locate the function and confirm the split was applied.
- **Fix complexity**: Trivial (verification)
- **Blocks merge?**: No.

---

## DEFECT-014 — Commit messages mis-aligned with diffs (`fa3c594` ↔ `255142d`)

- **Severity**: LOW
- **Category**: Repository hygiene
- **Source commit(s)**: `fa3c594`, `255142d`
- **File(s)**: commit metadata only
- **What should happen**: Commits should describe what they actually change.
- **What actually happens**: `fa3c594`'s message describes only the rebuildPreservingZeros fix but the diff also contains the entire colour-swap source. `255142d`'s message describes the colour-swap feature but the diff is only the rebuilt bundle. Future `git blame`/`git log` will mislead.
- **Suggested fix**: If the branch is rebased before merge, split or amend. If merged with `--no-ff`, add a clarifying note in the merge commit.
- **Fix complexity**: Trivial (interactive rebase) or zero (accept as-is and document)
- **Blocks merge?**: No.

---

## DEFECT-015 — Test coverage gap (aggregate)

- **Severity**: HIGH (in aggregate, not per-feature)
- **Category**: Test gap
- **Source commit(s)**: All except `f36436a` (which did adjust one test)
- **File(s)**: `tests/` directory — only 2 minor changes across 18 commits
- **What should happen**: At minimum, every NEW_FEATURE commit should add unit tests for its public API surface.
- **What actually happens**: 10+ new public-ish APIs (`removeUnusedColours`, `applyGlobalColorReplacement`, `revertToGenPalette`, `threadCostPerStitch`, `rtConsumption` math, `calcDifficulty` new factors, palette derivation in `buildStatsSummary`, blend split in 6 sites, stash V3 stamping, debounced stash flush) have **zero** new tests. The `creatorActionBar.test.js` change is a one-line assertion update; the icon snapshot is automatic.
- **Suggested fix**: Before merge, add (at minimum) unit tests for: `threadCostPerStitch` (pure helper, easy), blend-id splitting in `splitBlendId` and `buildStatsSummary` (small fixture), `calcDifficulty` (pure function), `removeUnusedColours` (state hook test). The Creator UI tests are harder and can come post-merge as a follow-up.
- **Fix complexity**: Significant (4+ hrs to do well)
- **Blocks merge?**: **Yes for the pure-function helpers** (threadCostPerStitch, splitBlendId, calcDifficulty); No for the React hook surfaces.

---

## Defect summary by severity

| Severity | Count | Defect IDs |
|---|---|---|
| CRITICAL | 0 | — |
| HIGH | 4 | 001, 004, 009, 015 |
| MEDIUM | 3 | 002, 007, 008 |
| LOW | 8 | 003, 005, 006, 010, 011, 012, 013, 014 |

**Total: 15 defects.**
