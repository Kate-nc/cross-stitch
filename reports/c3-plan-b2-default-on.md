# C3 — B2 Drag-Mark Default-On Coordination Plan

## **C3 — B2 Drag-Mark Default-On Coordination Plan**

### **Executive Summary**

- **Goal:** Flip `window.B2_DRAG_MARK_ENABLED` default from `false` to `true` while ensuring both legacy touch handlers and new pointer pipeline coexist safely and the app remains functional with the flag in either state at every step.
- **Risk Surface:** Dual range-select implementations (legacy `rangeModeActive` + hook `mode: 'range'`), pinch-zoom collision (browser native vs app response), colour-lock filtering not yet implemented in hook callbacks.
- **Approach:** Eliminate legacy duplicates in 5 sequential PRs, each ensuring both flag states work before proceeding; test both `B2_DRAG_MARK_ENABLED=true` and `false` at every commit; final PR flips the default and removes feature gating.
- **Sequencing:** Deprecate legacy range-select → wrap callbacks with colour-lock → absorb remaining duplicates → freeze flag → flip default. Each PR is <200 LOC and deployable independently.
- **Outcome:** Single, unified pointer-based drag-mark/range pipeline; no legacy touch handler vestigal code; feature flag removed after flag-flip PR; pinch-zoom, pan, shift+click all working transparently via browser + hook interaction.

---

### **1. Goal**

**Thesis:** C3 is the deferred coordination work to make `useDragMark` the primary stitch-manipulation pipeline on all pointer input. B2 shipped the hook fully built, tested, and wired behind a disabled flag (`window.B2_DRAG_MARK_ENABLED = false`) to avoid colliding with legacy `handleTouchStart/Move/End` and `handleStitchMouseDown/Up` handlers. C3 flips the default to `true` by eliminating legacy duplicates and formalizing the hook as the single source of truth for drag-mark and range-select gestures. The app must remain fully functional with the flag in either state throughout all PRs until the final PR makes the flag obsolete.

---

### **2. Inventory**

#### **Legacy Pipeline (Lines from [tracker-app.js](tracker-app.js))**

| Handler | Lines | Input Events | Responsibility | Status |
|---|---|---|---|---|
| `handleTouchStart` | [3989–4015](tracker-app.js#L3989) | `touchstart` | Detect tap, record cell index, detect pinch onset | Active; owns touch start |
| `handleTouchMove` | [4030–4063](tracker-app.js#L4030) | `touchmove` | Pan with 8px threshold, pinch accumulation | Active; owns touch pan+pinch |
| `handleTouchEnd` | [4069–4100](tracker-app.js#L4069) | `touchend` | Tap → toggle; rectangle fill if rangeMode active | Active; handles tap & range fill |
| `handleStitchMouseDown` | [3870–3900](tracker-app.js#L3870) | `mousedown` on canvas | Optimistic drag start | Active; owns mouse drag init |
| `handleStitchMouseMove` | [3916–3940](tracker-app.js#L3916) | `mousemove` on canvas | Accumulate drag changes | Active; owns mouse drag accumulation |
| `handleMouseUp` | [3956–3980](tracker-app.js#L3956) | `pointerup` (global) | Commit drag to undo history | Active; owns mouse drag commit |
| `rangeModeActive` state | [738](tracker-app.js#L738) | UI button + logic | Tracks whether range-select mode is on | Active React state |
| `rangeAnchor` state | [739](tracker-app.js#L739) | Logic + UI | Stores first range-select cell (idx, row, col, val) | Active React state |
| Colour-lock filter | [3868, 3917, 4083, 4120](tracker-app.js#L3868) | Both pipelines | Checks `isColourLocked() && !fullStitchMatchesFocus(idx)` before toggle | Active; both pipelines use |

**Touch listener registration:** Lines [4353–4355](tracker-app.js#L4353) (`addEventListener("touchstart|move|end", ..., {passive:false})`)

**Mouse listener registration:** Lines [3870+](tracker-app.js#L3870) (inline canvas `onmousedown`, global `addEventListener("pointerup", ...)`)

---

#### **New Pipeline ([useDragMark.js](useDragMark.js))**

| Component | Lines | Responsibility | Status |
|---|---|---|---|
| `dragMarkReducer` | [104–285](useDragMark.js#L104) | Pure state machine; handles POINTER_DOWN/MOVE/UP/CANCEL/LONG_PRESS_FIRED; emits effects | Complete; fully tested |
| `useDragMark` hook | [286–450](useDragMark.js#L286) | React hook; wires pointer events; returns `{ handlers, dragState }` | Complete; wired in tracker-app |
| Pure helpers | [35–70](useDragMark.js#L35) | `isMarkableAt`, `rectIndices`, `intentForCell` | Complete; used by reducer |
| Touch-only gate | [4500–4510](tracker-app.js#L4500) | Wraps handlers: `if (e.pointerType === 'touch') h(e)` | In place; prevents mouse double-toggle |
| Callbacks | [_dragMarkOnToggle, _dragMarkOnCommitDrag, _dragMarkOnCommitRange](tracker-app.js#L4491) | Connect hook output to undo/redo; missing colour-lock filter | Wired; **missing colour-lock wrapper** |
| CSS overlay | [styles.css: 3436+](styles.css#L3436) | `.drag-mark-overlay`, `.drag-mark-anchor`, animation | Complete |
| Flag gate | [`window.B2_DRAG_MARK_ENABLED`](tracker-app.js#L4456) | Runtime disable; defaults `false` | In place |

---

### **3. Collisions & Resolutions**

#### **3.1 Double-Toggle on Tap: Tap fires both `handleTouchEnd` (legacy) and `onPointerUp` (hook)**

**Legacy:** `handleTouchEnd` line [4069–4100] processes tap by calling `setDone(idx, !done[idx])` directly.

**New:** `useDragMark` hook's `onPointerUp` fires `onToggleCell(idx)` callback, which also calls `setDone(idx, ...)`.

**Symptom if both fire:** Cell toggled twice (state reverts).

**Resolution:** ✅ **Touch-only gate already in place** (lines [4500–4510]). The hook's handlers are wrapped:
```js
function gate(h) { return function(e) {
  if (!h) return;
  if (e && e.pointerType === 'touch') h(e);
}; }
```

**Remains Safe After C3:** Yes. Legacy handlers remain active *only* for mouse (untouched). Hook handlers fire *only* for touch (gated). No overlap by design.

---

#### **3.2 Pinch-Zoom Contention: Two-finger gesture on touch screen**

**Legacy:** `handleTouchMove` (line 4030+) detects pinch by `touchStateRef.current.pinchDist` accumulation and calls canvas zoom method.

**New:** `useDragMark` hook has 200ms multi-touch guard (line ~165 of reducer): if second pointer arrives within 200ms of first, abort drag.

**Symptom if both respond:** Browser may fire pinch events (native gestures) while app also tries to drag-mark across fingers.

**Resolution:** ✅ **200ms multi-touch guard intentional design**. After 200ms, second pointer is not considered part of the same gesture. Browser's native pinch-zoom event listeners (CSS `touch-action: manipulation`) handle the gesture independently. Hook explicitly *does not* consume pinch events—it aborts the drag candidate and lets browser handle the two-finger manipulation natively.

**Remains Safe After C3:** Yes. Guard window prevents drag-mark path accumulation during pinch setup phase. Browser owns pinch natively post-guard.

---

#### **3.3 Range-Select Dual State: `rangeModeActive` (React state) + hook's `mode: 'range'` (internal state)**

**Legacy:** Toolbar button sets `setRangeModeActive(true)`. UI shows "range mode on" badge. First tap sets `rangeAnchor`, second tap fills rectangle.

**New:** `useDragMark` hook tracks `mode: 'range'` internally; long-press (500ms hold) sets anchor; next tap fills rectangle.

**Symptom if both active:** Confusing UI with two range-select metaphors active simultaneously; legacy button-driven vs hook-driven long-press.

**Resolution:** 🔴 **PR #1 deprecates legacy range mode; PR #2 absorbs into hook.** 

- **PR #1:** Hide range-mode button in UI when flag is on; show deprecation notice.
- **PR #2:** Remove `rangeMode` React state entirely; hook's internal `anchor` property replaces it.
- **Callback layer:** New `_dragMarkOnCommitRange` callback (triggered by hook when second pointer in range mode) performs the rectangle fill using legacy `_historyChanges` accumulation.

**Remains Safe After C3:** Yes. Legacy state/button removed; hook owns the entire gesture sequence.

---

#### **3.4 Colour-Lock Filtering Missing in Hook Callbacks**

**Legacy:** `isColourLocked() && !fullStitchMatchesFocus(idx)` filter applied in `handleTouchEnd` (line 4083) and `handleStitchMouseDown` (line 3868) before toggling.

**New:** `useDragMark` hook does NOT filter. It just accumulates cell indices into `path` Set and emits callbacks with unfiltered indices.

**Symptom:** Hook callbacks fire for locked cells that shouldn't be toggled, violating user's colour-lock preference.

**Resolution:** 🟡 **PR #2 wraps callbacks with colour-lock filter.**

Modify `_dragMarkOnToggle`, `_dragMarkOnCommitDrag`, `_dragMarkOnCommitRange` callbacks to:
```js
function _dragMarkOnToggle(idx) {
  if (isColourLocked() && !fullStitchMatchesFocus(idx)) return; // Filter
  setDone(idx, !done[idx]);
}
```

Same for drag/range callbacks: filter indices before applying changes.

**Remains Safe After C3:** Yes. Callback layer is responsible for business logic; hook is purely input machinery.

---

#### **3.5 Shift+Click Range (Mouse): Legacy range-select via toolbar button vs hook's shift+click**

**Legacy:** Toolbar button UI for range-select; no shift+click support documented.

**New:** `useDragMark` hook already implements shift+click range via `action.shiftKey` check in reducer (line ~160).

**Symptom:** None. Hook's shift+click is the *better* UX and complements legacy button mode.

**Resolution:** ✅ **No collision; hook adds feature.** Legacy button remains for discoverable UI; hook's shift+click is faster power-user path. Both work in parallel.

**Remains Safe After C3:** Yes. Legacy button deprecated in PR #1, removed in PR #2. Hook's shift+click becomes the primary range mechanism.

---

#### **3.6 Pan Gesture (Single touch, 8px threshold)**

**Legacy:** `handleTouchMove` (line 4030) detects pan: if distance > 8px from start, switches to "pan" mode and allows native scroll (no preventDefault).

**New:** `useDragMark` hook does NOT track pan. It accumulates cell indices if touch stays within a single cell (or crosses cell boundaries smoothly).

**Symptom:** No collision. Pan is a scroll affordance (native container scroll), not a cell mutation. Hook doesn't interfere.

**Resolution:** ✅ **No change needed.** Pan belongs to the browser/container scroll layer. Hook is for cell mutations. They're separate concerns.

**Remains Safe After C3:** Yes. Legacy pan handler stays active; hook explicitly doesn't claim pan events.

---

### **4. Behaviour Gaps**

#### **Gap #1: Pinch-Zoom**
- **What legacy does:** `handleTouchMove` detects two-finger touch and accumulates `pinchDist`; calls canvas zoom function.
- **Why users care:** Mobile/tablet users expect pinch-to-zoom on pattern canvas (standard UI gesture).
- **Hook status:** Does NOT implement pinch. By design: multi-touch guard (200ms) intentionally passes second pointer to browser, which fires native pinch events. Canvas CSS `touch-action: manipulation` allows browser to handle pinch natively.
- **Rationale:** Pinch is a browser-level gesture, not app-level cell manipulation. Delegating to browser is cleaner than reimplementing.
- **Solution:** No code change required. Test confirms pinch still works post-flag-flip via browser native events.

#### **Gap #2: Pan (8px threshold scroll activation)**
- **What legacy does:** Records initial touch position; if movement > 8px, switches mode to "pan" and does NOT preventDefault on scroll events.
- **Why users care:** Users need to be able to scroll/pan the canvas on touch devices without accidentally marking cells.
- **Hook status:** Does NOT track pan. Reducer only accumulates cells if pointer is actively held down on markable cells. If pointer moves > canvas cell delta and no cell is under pointer, hook doesn't fire callbacks.
- **Rationale:** Pan is a scroll affordance. Container scroll listener (not part of hook) handles scroll. Hook is only for cell mutations.
- **Solution:** No code change required. Pan works via native scroll handlers on grid container.

#### **Gap #3: Shift+Click Range (Mouse)**
- **What legacy does:** Toolbar button UI; first click sets anchor, second click fills rectangle.
- **Why users care:** Desktop users may prefer clicking a button to enter range mode, then clicking cells to define a rectangle.
- **Hook status:** ALREADY IMPLEMENTS. Hook's `action.shiftKey` check in reducer fires `onCommitRange` callback when shift+click second cell.
- **Rationale:** Hook provides the *better* UX (power-user shortcut). Legacy button is UI sugar on top.
- **Solution:** Legacy button deprecated in PR #1, removed in PR #2. Hook's shift+click is the canonical path.

#### **Gap #4: Colour-Lock Filtering**
- **What legacy does:** Both `handleTouchEnd` and `handleStitchMouseDown` check `isColourLocked() && !fullStitchMatchesFocus(idx)` before toggling.
- **Why users care:** Users can lock a colour to prevent accidental edits to stitches of that colour.
- **Hook status:** Does NOT filter. Callbacks receive unfiltered indices.
- **Rationale:** Hook is state machine; filtering is business logic. Callbacks are responsible for filtering.
- **Solution:** PR #2 wraps all three callbacks (`_dragMarkOnToggle`, `_dragMarkOnCommitDrag`, `_dragMarkOnCommitRange`) with colour-lock checks before state updates.

---

### **5. Sequencing: 5-PR Plan**

Each PR is ordered to ensure:
1. Both `B2_DRAG_MARK_ENABLED = true` and `false` remain functional.
2. Legacy code is progressively removed without orphaning features.
3. New hook code is integrated one layer at a time (callbacks → state filtering → UI simplification).

#### **PR #1: Deprecate Legacy Range-Select UI & Hide Button When Flag On**
**Scope:** Hide toolbar range-mode button when `B2_DRAG_MARK_ENABLED === true`; show inline help text "Use long-press to activate range mode (experimental)".

**File Changes:**
- [tracker-app.js](tracker-app.js) lines [4560+]: Conditional render of range button (check flag)
- [components.js](components.js): Add deprecation notice component

**Tests:**
- Verify button visible when flag is `false` (legacy path)
- Verify button hidden and help text shown when flag is `true` (new path)
- Verify long-press range still fires with hidden button (hook independent)

**Both Flag States Safe:** ✅ Legacy button path untouched when flag is `false`. New path hides button but long-press still works via hook.

**Estimate:** S (Simple UI conditional)

---

#### **PR #2: Integrate Colour-Lock Filtering in Hook Callbacks**
**Scope:** Wrap `_dragMarkOnToggle`, `_dragMarkOnCommitDrag`, `_dragMarkOnCommitRange` callbacks with colour-lock checks. Remove colour-lock filtering from legacy `handleTouchEnd` and `handleStitchMouseDown` (dead code after flag is on).

**File Changes:**
- [tracker-app.js](tracker-app.js) lines [4491–4530]: Enhance callback wrappers with `isColourLocked()` checks
- [tracker-app.js](tracker-app.js) lines [3868, 3917, 4083, 4120]: Remove colour-lock checks from legacy handlers (mark as dead code if flag is on)

**Tests:**
- Colour-locked cell not toggled via tap, drag, range when flag is `true`
- Colour-locked cell still respected via legacy handlers when flag is `false`
- Unlock and re-toggle works correctly

**Both Flag States Safe:** ✅ Legacy handlers keep filtering when flag is `false`. Callbacks filter when flag is `true`.

**Estimate:** M (Logic wrapping + testing)

---

#### **PR #3: Absorb Range-Select State Into Hook; Remove `rangeModeActive` & `rangeAnchor` React State**
**Scope:** Delete `rangeModeActive` and `rangeAnchor` React state variables (lines [738–739](tracker-app.js#L738)). Modify `_dragMarkOnCommitRange` callback to handle rectangle fill directly (hook already emits the two-cell sequence). Remove legacy range-select logic from `handleTouchEnd` (lines [4083–4100](tracker-app.js#L4083)).

**File Changes:**
- [tracker-app.js](tracker-app.js) lines [738–739]: Delete `useState` for range mode/anchor
- [tracker-app.js](tracker-app.js) lines [4069–4100]: Simplify `handleTouchEnd` (remove range fill code; only tap-toggle remains)
- [tracker-app.js](tracker-app.js) lines [4491–4530]: Enhance `_dragMarkOnCommitRange` to fill rectangle (use `rectIndices` from hook context)

**Tests:**
- Long-press + tap sequence fills rectangle correctly when flag is `true`
- Legacy range-select via button + taps still works when flag is `false`
- Undo/redo works for both range fills

**Both Flag States Safe:** ✅ Legacy range state only used when flag is `false`. Hook owns range when flag is `true`.

**Estimate:** M (State deletion + hook integration)

---

#### **PR #4: Freeze Flag; Remove Dead Code Paths When Flag is `false`**
**Scope:** Delete all legacy `handleTouchStart`, `handleTouchMove`, `handleTouchEnd` code (lines [3989–4100](tracker-app.js#L3989)). Delete legacy `handleStitchMouseDown`, `handleStitchMouseMove`, `handleMouseUp` code (lines [3870–3980](tracker-app.js#L3870)). Delete dead touchstart/move/end listeners (lines [4353–4355](tracker-app.js#L4353)). Mark `window.B2_DRAG_MARK_ENABLED` as "must be true" in comments. Keep flag definition for one final PR.

**File Changes:**
- [tracker-app.js](tracker-app.js) lines [3870–4100]: Delete all legacy handlers
- [tracker-app.js](tracker-app.js) lines [4353–4355]: Delete addEventListener calls
- [tracker-app.js](tracker-app.js) lines [4456+]: Assert flag value with comment "B2_DRAG_MARK_ENABLED must be true; see C3 PR #5"

**Tests:**
- Tap, drag, range, pinch still work
- No regressions in undo/redo
- Toast notifications still appear

**Both Flag States Safe:** ⚠️ **Flag MUST be true after this PR.** If flag were false, app would break (legacy handlers deleted). This PR is the point of no return. Deployment must ensure flag is set to true in production before merging.

**Estimate:** L (Large deletion + thorough testing)

---

#### **PR #5: Flip Default & Remove Feature Flag**
**Scope:** Change `window.B2_DRAG_MARK_ENABLED` from `false` to `true` (or remove the flag entirely and hardcode hook as active). Remove all flag conditionals (lines [4456+](tracker-app.js#L4456)). Update CHANGELOG and release notes.

**File Changes:**
- [tracker-app.js](tracker-app.js) lines [4456+]: Remove flag check; hook is always active
- [constants.js](constants.js) or removal: Delete `B2_DRAG_MARK_ENABLED` definition if it exists there
- [CHANGELOG.md](CHANGELOG.md): Document C3 completion, unified pointer pipeline launch

**Tests:**
- All stitching interactions work (tap, drag, range, long-press, shift+click)
- No flag-related dead code paths
- Feature parity with B2 preview

**Both Flag States Safe:** ✅ Only one state now (enabled). No toggle paths.

**Estimate:** S (Simple flag removal + docs)

---

### **6. Tests Required**

#### **New Test Files to Create**

- **[tests/c3-colour-lock-filter.test.js](tests/c3-colour-lock-filter.test.js)** (PR #2)
  - Verify colour-locked cells not toggled via all entry points (tap, drag, range)
  - Test unlock → retoggle workflow

- **[tests/c3-legacy-range-deprecated.test.js](tests/c3-legacy-range-deprecated.test.js)** (PR #1)
  - Range button visibility tied to flag
  - Long-press range fires correctly with hidden button

- **[tests/c3-range-state-absorption.test.js](tests/c3-range-state-absorption.test.js)** (PR #3)
  - `rangeModeActive` state no longer exists when flag is true
  - Range fill rectangle still works via hook callback

#### **Existing Test Files to Update**

- **[tests/dragMark.test.js](tests/dragMark.test.js)** (all PRs)
  - Extend multi-touch guard test to verify pinch passes through (not consumed by hook)
  - Add shift+click range test
  - Verify coalesced pointermove events work for smooth drag

- **[tests/tracker-app.test.js](tests/tracker-app.test.js)** (PR #4)
  - Remove tests for legacy `handleTouchStart/Move/End` handlers (code deleted)
  - Verify undo/redo shape for BULK_TOGGLE entries post-PR #4

#### **Manual Regression Testing (All PRs)**
- Tap single cell on touch device → toggles
- Drag across 5 cells on touch device → marks all 5
- Long-press 500ms then tap different cell on touch device → fills rectangle
- Pinch two fingers on touch device → zooms canvas (browser native)
- Shift+click two cells on desktop → fills rectangle
- Shift+click third cell → aborts range, single-toggles
- Colour-locked cell not toggled even after drag across it
- Undo/redo round-trip for all gestures

---

### **7. Rollback Strategy**

**If telemetry post-flag-flip shows regressions:**

1. **Immediate:** Revert PR #5 (flip default back to `false`) by deploying previous version or hotfix that sets `window.B2_DRAG_MARK_ENABLED = false` at app init.
   - Cost: <5 minutes; no code changes needed; instant user fallback to legacy handlers (still present in PR #4 world).

2. **If regression is in PR #4 (legacy code deletion):**
   - Revert PR #4 + #5 together; restore legacy handlers from prior commit.
   - Cost: 1–2 hours; requires coordinated revert of both PRs; users back on legacy until fix deployed.

3. **If regression is in PR #2 or #3 (hook integration):**
   - Revert offending PR; redeploy prior version with flag still `false`.
   - Cost: 30 minutes; users back on legacy path.

**Prevention:**
- Test both flag states (`true` and `false`) in staging environment for 48 hours post-merge.
- Monitor telemetry for gesture failures (drag, range, tap) before flipping production default.
- Keep PR #4 (legacy code removal) and PR #5 (flag flip) in the same release so no intermediate version exists with flag `true` and deleted handlers.

---

### **8. Effort Estimate & Timeline**

| PR # | Title | Files Changed | LOC Delta | Tests | Size | Timeline |
|---|---|---|---|---|---|---|
| 1 | Deprecate range UI | tracker-app.js, components.js | ~50 | 3 | S | 2 hours |
| 2 | Colour-lock callbacks | tracker-app.js | ~80 | 4 | M | 4 hours |
| 3 | Absorb range state | tracker-app.js | ~120 | 5 | M | 6 hours |
| 4 | Delete legacy code | tracker-app.js | ~-300 (deletion) | 8 | L | 12 hours |
| 5 | Flip default & remove flag | tracker-app.js, constants.js, CHANGELOG | ~30 | 2 | S | 2 hours |
| **Total** | C3 Coordination | ~8 files | ~-20 net | 22+ | **5 M-sized PRs** | **~26 hours** |

**Assumptions:**
- PR #4 testing is exhaustive (largest regression surface due to code deletion).
- All PRs reviewed within 24 hours; no blocking feedback loops.
- Manual regression testing runs in parallel with CI on each PR.

**Risk Mitigation:**
- Ship PRs in order; each PR is independently deployable and tested.
- Do NOT ship PR #4 + #5 together in early deploys; gap allows safe rollback if issues emerge.
- Verify staging environment with both flag states before production flip.

---

### **Detailed Test Surface (PR #4 Focus)**

Since PR #4 removes the most code, testing emphasis:

1. **Touch Input Verification** (tracker-app.js via useDragMark hook):
   - Single tap on cell → single toggle (via `_dragMarkOnToggle`)
   - Tap different cell → different cell toggles (verify idx isolation)
   - Two taps within 200ms → both cells toggled (multi-touch guard allows multiple pointers, but drag is aborted)
   - Two taps after 200ms on same cell → cell toggled twice (state reverts)
   - Drag across grid → all intermediate cells accumulated in path Set
   - Drag then release → `_dragMarkOnCommitDrag` fires with full path

2. **Mouse Input Verification** (still via hook after PR #4, no legacy fallback):
   - Left-click cell → toggle
   - Click + drag across cells → drag-mark path accumulation
   - Shift+click another cell → range fill
   - Right-click → context menu (hook doesn't consume)

3. **Gesture Verification**:
   - Long-press 500ms then tap different cell → range anchor → fill
   - Multi-touch pinch after 200ms guard → browser native pinch events fire, canvas zooms (hook not involved)
   - Pan with 8px threshold → scroll events fire, container scrolls (hook not involved)

4. **Undo/Redo Verification**:
   - Single toggle undoes to prior state
   - Drag-mark commits as BULK_TOGGLE entry
   - Range fill commits as BULK_TOGGLE entry
   - Undo BULK_TOGGLE reverses all cells in one action

5. **Business Logic Verification**:
   - Colour-locked cells not toggled (filtered at callback layer)
   - Non-markable cells (__skip__, __empty__) not toggled
   - Edit mode (isEditMode=true) gates all handlers to no-op

---

### **Citations & References**

- B2 completion report: [reports/b2-complete.md](reports/b2-complete.md)
- B2 drag-mark hook: [useDragMark.js](useDragMark.js)
- Hook integration in tracker: [tracker-app.js#L4450-L4510](tracker-app.js#L4450-L4510)
- Legacy handlers (to be deleted): [tracker-app.js#L3870-L4100](tracker-app.js#L3870-L4100)
- Legacy range state: [tracker-app.js#L738-L739](tracker-app.js#L738-L739)
- Test suite: [tests/dragMark.test.js](tests/dragMark.test.js) (13 tests, all passing post-B2)
- UX audit: [reports/ux-8-post-B-audit.md](reports/ux-8-post-B-audit.md) (C3 identified as coordination work)

---

**Prepared by:** C3 Research Agent  
**Date:** [Current Session]  
**Status:** Ready for implementation; first PR (UI deprecation) can begin immediately after review.