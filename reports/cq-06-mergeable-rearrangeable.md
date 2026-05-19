# CQ Report 06 — Mergeable / Rearrangeable Code

## Summary

Audited for code blocks that could be merged for clarity, related logic that could be co-located, and utility functions that are either inlined when they shouldn't be or separated when they should be merged.

**Risk Level: MEDIUM** — No bugs created by current arrangement, but two files are large enough that finding and fixing bugs within them is error-prone.

## Findings

### M-01: tracker-app.js Is a Monolithic 3000+ LOC File — CRITICAL
- **File**: [tracker-app.js](../tracker-app.js)
- **Issue**: The file contains the entire React component tree for the Stitch Tracker. Roughly:
  - 80+ `useState` declarations in the root component
  - Multiple `useEffect` hooks of 100–150 lines each
  - Canvas interaction logic, BroadcastChannel sync, session timing, milestone detection, and palette management all in one component
- **Related logic split across effects**:
  - Session timer start is in one effect; session timer stop is in another
  - Stash colour sync depends on BroadcastChannel state set in a third effect
  - Milestone detection runs inline with stitch marking logic
- **Impact**: Adding features, debugging timing issues, and reviewing the IDB interaction pattern all require scrolling thousands of lines.
- **Suggested refactors** (non-breaking):
  - `useTrackerSession()` — extract: session start/stop/save, pause/resume, total time accumulation
  - `useRealtimeStash()` — extract: BroadcastChannel lifecycle, stash snapshot subscribe/unsubscribe
  - `useMilestoneDetection()` — extract: milestone threshold calculation, confetti trigger
- **Severity**: medium (no bugs, but high maintenance risk)

### M-02: project-storage.js Has Redundant Pattern Traversals — HIGH
- **File**: [project-storage.js](../project-storage.js#L340)
- **Issue**: `buildStatsSummary()` (line 340) and `buildMeta()` (line 418) both independently traverse the `pattern` array:
  - `buildStatsSummary()`: counts filled cells, blend cells, skip cells
  - `buildMeta()`: also counts total cells and done cells
  - Each traversal is O(n) over the full pattern
- **Impact**: For a 300×300 pattern, two O(90000) scans happen every time a project is saved.
- **Fix**: Merge into a single `computePatternStats(project)` pass that returns all needed counts.
- **Severity**: medium

### M-03: canvasRenderer.js Has ~90% Duplicate Grid Loop — HIGH
- **File**: [creator/canvasRenderer.js](../creator/canvasRenderer.js#L167)
- **Issue**: `drawPatternOnCanvas()` (line 167) and `drawPatternBaseOnCanvas()` (line 500) contain nearly identical nested `for → for` loops scanning the pattern grid. The only difference is whether hover highlighting is rendered.
- **Small helpers misplaced**: `_desatRgb()`, `_hexToRgba()`, and `_hexToRgbArr()` are defined inside canvasRenderer.js but perform colour conversions that belong in [colour-utils.js](../colour-utils.js).
- **Impact**: Bug fixes to the rendering loop must be applied to two places. Missing a loop in one diverges rendering behaviour.
- **Fix**: Extract one parametrised function `renderPatternGrid(ctx, pattern, state, opts)` with `opts.renderHover` flag. Move colour helpers to colour-utils.js.
- **Severity**: medium

### M-04: manager-app.js Has Inlineable Single-Use Helpers — MEDIUM
- **File**: [manager-app.js](../manager-app.js#L1820)
- **Issue**: `updateTitleIfChanged()` (~15 lines) and `addUnlinkedPatterns()` (~20 lines) are defined as named helper functions but called only once each, in a single `useEffect`. Inlining them into the effect would reduce indirection.
- **Severity**: low

### M-05: creator/generate.js Is Well-Organised — BEST PRACTICE
- **File**: [creator/generate.js](../creator/generate.js)
- **Issue**: None. Clean pipeline separation: `prepareImage()` → `quantizePixels()` → `buildPattern()` → `applyBackstitch()`. Each stage is independently testable.
- **Severity**: low (no issue)

### M-06: helpers.js Intentionally Minified — EXPECTED PATTERN
- **File**: [helpers.js](../helpers.js)
- **Issue**: None. Intentional minified-style JS per project conventions. No reorganisation needed.
- **Severity**: low (no issue)

### M-07: IDB Transaction Helper Could Be Shared — MEDIUM
- **Files**: [stash-bridge.js](../stash-bridge.js#L33), [backup-restore.js](../backup-restore.js#L37), [manager-app.js](../manager-app.js#L46)
- **Issue**: The IDB open/transaction/close pattern is repeated ~8 times across files (also noted in CQ-02). The most complex version (with version migration) is in `openManagerDB()` in stash-bridge.js. All others repeat the simpler pattern.
- **Impact**: The async/await transaction bug (Report 08, F-01) would be fixed in one place rather than 8.
- **Fix**: Extract `openManagerDB()` as a shared utility; import from stash-bridge.js.
- **Severity**: medium

### M-08: stats-page.js Canvas Capture Pattern Repeated 3 Times — MEDIUM
- **File**: [stats-page.js](../stats-page.js#L478), lines 478, 620, 710
- **Issue**: Three nearly-identical `canvas.toBlob(blob => {...})` capture flows for different chart types. Each has the same missing timeout guard.
- **Fix**: Extract `captureChart(canvas, filename)` helper. Fix timeout once.
- **Severity**: medium

## TODO — Priority-Ordered Fix List

1. **[MEDIUM] Extract custom hooks from [tracker-app.js](../tracker-app.js)**: Create `useTrackerSession()`, `useRealtimeStash()`, `useMilestoneDetection()` as separate files. This is a refactor — do NOT change behaviour.
2. **[HIGH] Merge pattern traversals in [project-storage.js](../project-storage.js)**: Combine `buildStatsSummary()` and `buildMeta()` count logic into a single `computePatternStats()` call.
3. **[HIGH] Merge duplicate rendering loops in [creator/canvasRenderer.js](../creator/canvasRenderer.js)**: Parametrised `renderPatternGrid()` function. Move colour helpers to [colour-utils.js](../colour-utils.js).
4. **[MEDIUM] Extract shared `captureChart()` helper** in [stats-page.js](../stats-page.js): Fix the toBlob timeout once for all chart captures.
5. **[MEDIUM] Inline single-use helpers** in [manager-app.js](../manager-app.js): Remove `updateTitleIfChanged` and `addUnlinkedPatterns` function declarations; inline into the effect.
6. **[LOW] Document why helpers.js is minified** — add file header explaining the intentional style.
