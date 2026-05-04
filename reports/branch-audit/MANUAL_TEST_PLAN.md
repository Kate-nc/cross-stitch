# Manual Test Plan

Tests for behaviour that cannot be verified from code alone. Grouped by feature area; ordered within each group by priority. Total estimate at the bottom.

---

## Live Stash Deduction (Group B)

### TEST-001 — Restore-stash semantics across enable/disable cycles

- **Related defect(s)**: DEFECT-001
- **Preconditions**: At least one Creator-generated project; thread 310 owned, e.g. 5 skeins; Manager and Tracker both available.
- **Steps**:
  1. Open Manager. Confirm thread 310 quantity is 5.0 skeins.
  2. Open the project in Tracker. Toggle "Live" ON.
  3. Mark ~100 stitches of colour 310 in the pattern.
  4. Wait ≥30 s for debounced flush (or close+reopen tab to force `beforeunload`).
  5. Confirm Manager now shows 310 ≈ 4.2 skeins.
  6. Toggle "Live" OFF — choose **"Keep deductions"**.
  7. Toggle "Live" ON again.
  8. Mark another ~100 stitches of 310; wait for flush.
  9. Confirm Manager shows 310 ≈ 3.4 skeins.
  10. Toggle "Live" OFF — choose **"Restore stash"**.
- **Expected result (after fix)**: Manager 310 returns to 5.0 (full restoration of all consumption since first enable on this project).
- **Failure indicator**: Manager 310 shows 4.2 (only the second batch was reversed).
- **Estimated time**: 8 min

### TEST-002 — Mid-session manager edit not clobbered

- **Related defect(s)**: DEFECT-009
- **Preconditions**: Project loaded in Tracker, Live ON, thread 310 owned 5.0.
- **Steps**:
  1. Mark a few stitches of 310 in tracker (don't wait for flush yet).
  2. Open Manager in a separate tab.
  3. In Manager, increase 310 by +2 → expect Manager to show 7.0.
  4. Return to Tracker tab. Mark a few more stitches.
  5. Wait ≥30 s for debounced flush.
- **Expected result (after fix)**: Manager shows ~6.4 (7.0 − ~0.6 consumption); the +2 edit is preserved.
- **Failure indicator**: Manager drops back near 4.4 (snapshot-based overwrite blew away the +2).
- **Estimated time**: 5 min

### TEST-003 — Browser force-quit / mobile background loss

- **Related defect(s)**: documented risk in Group B 1.4 #1
- **Preconditions**: Tracker open with Live ON, on a mobile device or with browser dev-tools "force unload".
- **Steps**:
  1. Mark 50+ stitches.
  2. Within 30 s of last stitch, force-quit the browser (don't navigate away gracefully — kill the process).
  3. Reopen the app.
- **Expected result**: Stitches persisted in tracker `done` array, but stash may not reflect the deduction. Acceptable — document behaviour.
- **Failure indicator**: Tracker `done` array also lost (would be a separate, worse bug).
- **Estimated time**: 5 min

### TEST-004 — Multi-tab clobber

- **Related defect(s)**: DEFECT-008
- **Preconditions**: Two tracker tabs, two different projects, both with Live ON.
- **Steps**:
  1. Tab A: stitch project X (uses thread 310).
  2. Tab B: stitch project Y (uses thread 310).
  3. Wait for both to flush.
- **Expected**: 310 reduced by both tabs' consumption.
- **Failure indicator**: 310 reduced by only one tab's consumption (later writer wins).
- **Estimated time**: 5 min

### TEST-005 — Per-project wastePrefs persistence

- **Related defect(s)**: DEFECT-007
- **Preconditions**: At least two projects.
- **Steps**:
  1. Load project A. Set waste % to 5 in gear flyout.
  2. Load project B. Confirm waste % shows the global default (not 5, unless 5 was already global).
  3. Set waste % to 20 in gear flyout while on project B.
  4. Reload project A.
- **Expected result (after fix)**: Project A still shows 5 % (per-project setting preserved).
- **Failure indicator**: Project A shows 20 % (global override leaked across).
- **Estimated time**: 4 min

---

## Creator colour management (Group D)

### TEST-006 — "Revert to generated palette" data-loss confirmation

- **Related defect(s)**: DEFECT-004
- **Preconditions**: A generated pattern in Creator.
- **Steps**:
  1. Apply any palette swap so the revert button becomes enabled.
  2. Switch to edit mode. Mark 20+ cells as stitched (paint a colour, then mark them done if applicable; or proceed to tracker and mark some, then return).
  3. Click "Revert to generated palette".
- **Expected result (after fix)**: Confirmation dialog appears: "Reverting will clear your stitching progress. Continue?". Cancelling preserves marks; confirming wipes them with full undo support.
- **Failure indicator**: Marks gone, no prompt, Ctrl-Z restores palette but not the marks.
- **Estimated time**: 4 min

### TEST-007 — `applyGlobalColorReplacement` with unknown destination

- **Related defect(s)**: DEFECT-002
- **Preconditions**: Creator pattern with at least one colour.
- **Steps**:
  1. (Hard to trigger via UI alone — requires runtime injection.) In dev tools console, call `state.applyGlobalColorReplacement('310', 'NONEXISTENT')`.
- **Expected (after fix)**: Toast "Couldn't find that thread" or similar.
- **Failure indicator**: Silent no-op.
- **Estimated time**: 3 min (dev test)

### TEST-008 — Replace tool / context menu / chip swap all open the modal

- **Related defect(s)**: exploratory (validates fa3c594 + 9d3bab5 wiring)
- **Preconditions**: Generated pattern in Creator, edit mode.
- **Steps**:
  1. Right-click a stitch → "Replace this colour…" → modal opens with that colour pre-selected as source.
  2. Hover a palette chip in the side panel → swap button visible → click → same modal opens.
  3. Click the Replace tool in the toolbar → click any stitch → same modal opens.
- **Expected result**: All three open the modal with the correct source identification.
- **Failure indicator**: Any of the three does nothing or opens with wrong source.
- **Estimated time**: 5 min

### TEST-009 — Selection mask honoured by colour replacement

- **Related defect(s)**: exploratory
- **Steps**:
  1. Use lasso/magic-wand to select a region.
  2. Open colour-replace via right-click on a cell *inside* the selection.
  3. Choose a new colour.
- **Expected result**: Only cells inside the selection that match the source colour are changed; cells outside are untouched.
- **Failure indicator**: All matching cells changed regardless of selection.
- **Estimated time**: 4 min

### TEST-010 — `fabricColour` migration for existing users

- **Related defect(s)**: DEFECT-006
- **Preconditions**: User who previously had `previewFabricBg=true` set in localStorage.
- **Steps**:
  1. In dev tools, set `localStorage.cs_pref_previewFabricBg = 'true'` and clear `cs_pref_fabricColour`.
  2. Reload Creator preview.
- **Expected (after fix)**: Preview background is the legacy beige (#F5F0E6) or close.
- **Failure indicator**: Preview background is white.
- **Estimated time**: 3 min

---

## Stats correctness (Group C)

### TEST-011 — Creator-only project shows real swatches and lifetime

- **Related defect(s)**: validates be2e2b6/e9342bb/ee6bf97
- **Preconditions**: A Creator-generated project that has *never* been opened in the Tracker (so `proj.palette` is absent and `proj.stitchLog` is empty).
- **Steps**:
  1. Open the standalone Stats page.
  2. Inspect the "Most-Used Colours" card.
  3. Inspect "Lifetime stitches" and the recent-activity bar chart.
- **Expected result**: Swatches show actual project colours (not all grey). Lifetime / activity reflect any historical sessions if `statsSessions` is present, or display 0 if never tracked.
- **Failure indicator**: Grey swatches, lifetime = 0 despite `statsSessions` data existing.
- **Estimated time**: 4 min

### TEST-012 — Blend-thread accounting

- **Related defect(s)**: validates e54d5c1, 5b2ebff
- **Preconditions**: A pattern using a blend like `'310+550'`. User owns 310 only, not 550.
- **Steps**:
  1. Add the pattern to the wishlist (manager).
  2. Inspect "Highest-impact wishlist threads" on Stats.
- **Expected**: 550 appears in the impact list.
- **Failure indicator**: Only one of the two components appears.
- **Estimated time**: 5 min

### TEST-013 — V3 migration dispatch

- **Related defect(s)**: validates 7575577
- **Preconditions**: A Manager IDB at schema v2 (i.e. before V3 fields). Easiest to simulate: in dev tools, downgrade `_schemaVersion` and clear V3 fields.
- **Steps**:
  1. Reload page; migration runs.
  2. Confirm Manager UI re-renders with V3 fields populated (acquisition timeline, history graph if any).
  3. Confirm no auto-save fires before the dispatch.
- **Expected**: Manager state reflects migrated values; no overwrite back to legacy state.
- **Failure indicator**: Manager UI continues to show legacy state until manual reload, or saves overwrite the migrated fields.
- **Estimated time**: 8 min (dev setup heavy)

---

## Tracker / project-stats visibility (Group E)

### TEST-014 — Per-project stats from standalone Stats page

- **Related defect(s)**: validates 3044d38; surfaces DEFECT-010
- **Preconditions**: At least one project with stats data.
- **Steps**:
  1. Open standalone Stats page (Stitching tab).
  2. Click a project's "View Project" button.
- **Expected**: Tracker mounts and per-project stats panel opens automatically within ~2 s.
- **Failure indicator**: Tracker mounts but stats panel doesn't open. (DEFECT-010 says this fails silently — after fix, console warning expected.)
- **Estimated time**: 3 min

### TEST-015 — Net stitches displayed and clamped

- **Related defect(s)**: DEFECT-011, validates 0f528c9
- **Preconditions**: A project with some pre-existing `done` stitches.
- **Steps**:
  1. Start a fresh session (no completed stitches yet).
  2. Use undo to clear ≥3 pre-existing stitches.
- **Expected (after clamp fix)**: Live counter reads "0", not "−3". Progress percentages stay ≤ 100 / ≥ 0.
- **Failure indicator**: Negative counter or progress > 100 %.
- **Estimated time**: 3 min

---

## Difficulty (Group A)

### TEST-016 — Home vs Stats difficulty consistency

- **Related defect(s)**: noted in Group A 1.3 (home passes blendCount=0)
- **Preconditions**: A project with several blend cells.
- **Steps**:
  1. Note difficulty stars on the project's Home tile.
  2. Open same project in Stats; note difficulty there.
- **Expected (after fix)**: Same value on both surfaces.
- **Failure indicator**: Different star count / label between Home and Stats for the same project.
- **Estimated time**: 3 min

---

## Summary

| Group | Tests | Time |
|---|---|---|
| Live stash deduction | TEST-001..005 | 27 min |
| Creator colour mgmt | TEST-006..010 | 19 min |
| Stats correctness | TEST-011..013 | 17 min |
| Visibility / net-stitches | TEST-014..015 | 6 min |
| Difficulty | TEST-016 | 3 min |
| **Total** | **16 tests** | **~72 min** |

Total estimated manual test time is **just over 1 hour**, well under the 2-hour threshold for prioritising. **Highest priority** before merge: TEST-001, TEST-002, TEST-006 (the three HIGH-defect verifications). Lowest priority: TEST-003 (acceptable risk), TEST-013 (devtool-heavy setup), TEST-016 (cosmetic).
