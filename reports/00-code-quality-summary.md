# Code Quality Audit — Master Summary

> Synthesis of CQ Reports 01–08. Individual reports with full context are in this directory.
>
> Items are grouped by effort level and impact. Work through them in tier order.

---

## Quick Reference — Report Index

| Report | Topic | Key Risk |
|---|---|---|
| [cq-01-module-root-hoisting.md](cq-01-module-root-hoisting.md) | Data structures created inside hot functions | Performance — 10,000+ unnecessary allocations per render |
| [cq-02-cross-file-duplication.md](cq-02-cross-file-duplication.md) | Logic duplicated across files | Maintenance — bugs must be fixed in N places |
| [cq-03-type-coercions.md](cq-03-type-coercions.md) | parseInt without radix, missing JSON validation | Correctness — octal interpretation of user inputs |
| [cq-04-unhandled-edge-cases.md](cq-04-unhandled-edge-cases.md) | Missing guards for zero/NaN/OOB inputs | Correctness — divide-by-zero, blank canvas, silent crashes |
| [cq-05-mutation-property-testing.md](cq-05-mutation-property-testing.md) | Test coverage gaps | Confidence — key paths lack invariant tests |
| [cq-06-mergeable-rearrangeable.md](cq-06-mergeable-rearrangeable.md) | Large monolithic functions and redundant passes | Maintenance — tracker-app.js at 3000+ LOC |
| [cq-07-abnormal-defensive-code.md](cq-07-abnormal-defensive-code.md) | Exception swallowing, vestigial guards | Debuggability — errors silently absorbed |
| [cq-08-deep-nesting.md](cq-08-deep-nesting.md) | Functions with 5–6 levels of nesting | Maintainability — core rendering is hard to review |

---

## Consolidated Ordered TODO List

### TIER 1 — Correctness Bugs (Fix Immediately)

These items can cause wrong results or silent crashes:

| # | Fix | File(s) | CQ Report |
|---|---|---|---|
| 1 | Add `parseInt(..., 10)` to all 18 bare `parseInt()` calls | [import-formats.js](../import-formats.js), [tracker-app.js](../tracker-app.js), [manager-app.js](../manager-app.js), [creator/useCreatorState.js](../creator/useCreatorState.js), [project-storage.js](../project-storage.js), [helpers.js](../helpers.js), [home-app.js](../home-app.js), [components-stats.js](../components-stats.js) | CQ-03 |
| 2 | Guard `gridCoord()` against zero `cellSize`; clamp gx/gy to grid bounds | [helpers.js](../helpers.js#L203) | CQ-04 |
| 3 | Add canvas size cap (16384px) before width/height assignment | [creator/PatternCanvas.js](../creator/PatternCanvas.js), [creator/PreviewCanvas.js](../creator/PreviewCanvas.js), [creator/RealisticCanvas.js](../creator/RealisticCanvas.js) | CQ-04 |
| 4 | Validate OXS dimensions `w > 0 && h > 0` in `parseOXS()` | [import-formats.js](../import-formats.js#L68) | CQ-04 |
| 5 | Bounds-check `pattern[gy * w + gx]` accesses (or rely on fix #2) | [creator/canvasRenderer.js](../creator/canvasRenderer.js), [colour-utils.js](../colour-utils.js) | CQ-04 |
| 6 | Add `isFinite()` guard in `skeinEst()` | [helpers.js](../helpers.js#L113) | CQ-04 |
| 7 | Fix backstitch OOB check: `> w` → `>= w`, `> h` → `>= h` | [project-storage.js](../project-storage.js#L396) | CQ-04 |
| 8 | Guard NaN `durationMinutes` in `buildMeta()` | [project-storage.js](../project-storage.js#L418) | CQ-04 |
| 9 | Fix `sync-engine.js` `_syncing` boolean not reset on error | [sync-engine.js](../sync-engine.js#L130) | CQ-04 |

### TIER 2 — Data Hazards and Silent Failures

These items cause errors to be swallowed or user feedback to be missing:

| # | Fix | File(s) | CQ Report |
|---|---|---|---|
| 10 | Show user feedback when backup flush fails (not silent) | [backup-restore.js](../backup-restore.js#L123) | CQ-07 |
| 11 | Log localStorage `QuotaExceededError`; show once-per-session toast | [creator/useCreatorState.js](../creator/useCreatorState.js) | CQ-07 |
| 12 | Log failed project loads in `Promise.all`; show partial-load toast | [manager-app.js](../manager-app.js#L238) | CQ-07 |
| 13 | Standardise error handling in backup-restore.js (no silent catch) | [backup-restore.js](../backup-restore.js) | CQ-07 |
| 14 | Add shape validation after `JSON.parse()` in project-storage | [project-storage.js](../project-storage.js#L994), [home-screen.js](../home-screen.js#L758) | CQ-03 |
| 15 | Fix `parseInt("0") \|\| fallback` anti-pattern | [creator/useCreatorState.js](../creator/useCreatorState.js#L399) | CQ-03 |
| 16 | Handle missing DMC in `parseOXS()` (use nearest-colour fallback or skip) | [import-formats.js](../import-formats.js#L243) | CQ-04 |
| 17 | Fix `fmtTime`/`fmtTimeL` for NaN/Infinity input | [helpers.js](../helpers.js#L58) | CQ-04 |

### TIER 3 — Performance (Hoisting Hot-Path Allocations)

These items have measurable impact on large patterns:

| # | Fix | File(s) | CQ Report |
|---|---|---|---|
| 18 | Hoist `DITH_STRENGTH_MAP` to module scope | [creator/useCreatorState.js](../creator/useCreatorState.js#L138) | CQ-01 |
| 19 | Cache `doDither()` palette `Map` (build once, pass in or module-scope) | [colour-utils.js](../colour-utils.js#L162) | CQ-01 |
| 20 | Cache `_hiIndicator()` results per colour (module-scope Map) | [creator/canvasRenderer.js](../creator/canvasRenderer.js#L30) | CQ-01 |
| 21 | Hoist `BANDS` array in `calcDifficulty()` | [helpers.js](../helpers.js#L322) | CQ-01 |
| 22 | Expose shared DMC `Map` from helpers.js; remove duplicate in import-formats.js | [helpers.js](../helpers.js#L21), [import-formats.js](../import-formats.js#L14) | CQ-02 |
| 23 | Replace `DMC.find()` O(n) scans with shared Map lookup | [import-formats.js](../import-formats.js#L243), [creator/adaptationEngine.js](../creator/adaptationEngine.js#L200), [colour-utils.js](../colour-utils.js#L45) | CQ-02 |
| 24 | Merge redundant pattern traversals in `buildStatsSummary()` and `buildMeta()` | [project-storage.js](../project-storage.js#L340) | CQ-06 |
| 25 | Hoist `confettiTier` `TIERS` and `timeAgo` months array | [helpers.js](../helpers.js#L299), [home-app.js](../home-app.js#L43) | CQ-01 |

### TIER 4 — Deduplication (Reduce Maintenance Surface)

| # | Fix | File(s) | CQ Report |
|---|---|---|---|
| 26 | Extract `isCellFilled(cell)` helper | [helpers.js](../helpers.js) | CQ-02 |
| 27 | Extract `downloadBlob(blob, filename)` helper (fixes revocation race too) | [helpers.js](../helpers.js) | CQ-02 |
| 28 | Delete duplicate `timeAgo()` in home-app.js; use home-screen.js version | [home-app.js](../home-app.js#L29) | CQ-02 |
| 29 | Delete `_splitStashKey()` in useCreatorState.js; reuse `parseThreadKey()` | [creator/useCreatorState.js](../creator/useCreatorState.js#L195) | CQ-02 |
| 30 | Enforce `LOCAL_STORAGE_KEYS` registry (remove raw string literals) | Multiple | CQ-02 |
| 31 | Extract `openManagerDB()` as shared utility | [stash-bridge.js](../stash-bridge.js), [backup-restore.js](../backup-restore.js), [manager-app.js](../manager-app.js) | CQ-02 |
| 32 | Extract `captureChart(canvas, filename)` helper in stats-page.js | [stats-page.js](../stats-page.js) | CQ-06 |

### TIER 5 — Refactoring (Structural Improvement)

These items reduce cognitive complexity and improve reviewability. Do them alongside other related changes to avoid standalone refactoring risk:

| # | Fix | File(s) | CQ Report |
|---|---|---|---|
| 33 | Extract `selectBestColourForPixel()` and `diffuseErrorToNeighbours()` from `doDither()` | [colour-utils.js](../colour-utils.js#L138) | CQ-08 |
| 34 | Extract `renderStitchCell()` from `drawPatternOnCanvas()` and `drawPatternBaseOnCanvas()` | [creator/canvasRenderer.js](../creator/canvasRenderer.js) | CQ-08, CQ-06 |
| 35 | Extract `emitBoundarySegment()` from `_drawMarchingAnts()` | [creator/canvasRenderer.js](../creator/canvasRenderer.js#L81) | CQ-08 |
| 36 | Move colour helpers (`_desatRgb`, `_hexToRgba`, `_hexToRgbArr`) to colour-utils.js | [creator/canvasRenderer.js](../creator/canvasRenderer.js) | CQ-06, CQ-08 |
| 37 | Replace inner DMC scan in `parseOXS()` with `findSolid()` call | [import-formats.js](../import-formats.js#L56) | CQ-08 |
| 38 | Extract `computeTileCache()` from TrackerPreviewModal `useEffect` | [tracker-app.js](../tracker-app.js#L50) | CQ-08 |
| 39 | Extract `useTrackerSession()`, `useRealtimeStash()`, `useMilestoneDetection()` hooks | [tracker-app.js](../tracker-app.js) | CQ-06 |
| 40 | Inline single-use helpers in manager-app.js | [manager-app.js](../manager-app.js#L1820) | CQ-06 |

### TIER 6 — Test Coverage Improvements

| # | Test to add | File | CQ Report |
|---|---|---|---|
| 41 | Property tests for `gridCoord()` (identity, inverse, zero-guard) | [tests/gridCoord.test.js](../tests/) | CQ-05 |
| 42 | Property tests for `doDither()` (output length, valid palette entries) | [tests/doDither.test.js](../tests/) | CQ-05 |
| 43 | Output-size tests for `quantize()` | [tests/quantize.test.js](../tests/) | CQ-05 |
| 44 | `dE2` property tests (commutativity, reflexivity, triangle inequality) | [tests/dE2.test.js](../tests/) | CQ-05 |
| 45 | OXS/JSON import-export round-trip tests | [tests/import-roundtrip.test.js](../tests/) | CQ-05 |
| 46 | Expand `stitchesToSkeins` with edge cases (zero fabric count, negative n) | [tests/threadCalc.test.js](../tests/threadCalc.test.js) | CQ-05 |
| 47 | `parseHexColor` round-trip tests | [tests/parseHexColor.test.js](../tests/) | CQ-05 |

### TIER 7 — Cleanup (Low-Risk Polish)

| # | Fix | CQ Report |
|---|---|---|
| 48 | Remove `console.error` wrapped in try/catch | CQ-07 |
| 49 | Remove vestigial IE11 guards (`typeof CustomEvent`, `typeof window.dispatchEvent`) | CQ-07 |
| 50 | Replace 5-condition StashBridge ladder with optional chaining | CQ-07 |
| 51 | Use `x != null` instead of `x !== null && x !== undefined` | CQ-07 |
| 52 | Remove redundant `Array.length > 0` guards before `forEach` | CQ-07 |
| 53 | Replace `null` initialisations before guaranteed assignment with ternary | CQ-07 |
| 54 | Replace `Array.isArray(arr)` + `!arr` with single `!Array.isArray(arr)` | CQ-07 |
| 55 | Replace inline React style objects with module-scope constants (high-render-rate lists) | CQ-01 |

---

## Cross-Report Theme Analysis

### Correctness (CQ-03, CQ-04)
The most impactful quick wins are all the `parseInt(..., 10)` fixes (Tier 1, item #1 — mechanical, 18 files) and the `gridCoord` divide-by-zero guard (#2). Together these address the highest-risk numeric bugs.

### Performance (CQ-01, CQ-02)
The two hottest allocations are the `doDither` palette `Map` (rebuilt every quantise pass) and `_hiIndicator()` objects (rebuilt per highlighted cell per render). Both are straightforward module-scope caching fixes.

### Maintainability (CQ-06, CQ-08)
[tracker-app.js](../tracker-app.js) at 3000+ LOC is the single hardest file to work in. Extracting the three custom hooks (Tier 5, #39) would cut it to ~1500 LOC and make the IDB async bug fixes from Report 08 much easier to apply correctly. The canvasRenderer duplication (#34) is the second priority.

### Testing (CQ-05)
`gridCoord()` has zero test coverage despite being called on every mouse event. That test gap, combined with the divide-by-zero bug found in CQ-04, represents the highest-risk untested code path. Add tests for `gridCoord` and `doDither` before refactoring either function.

### Error Visibility (CQ-07)
The backup flush failure being swallowed silently is the most concerning single issue in this report — a user can download a stale backup without any warning. Fix before the next production release.
