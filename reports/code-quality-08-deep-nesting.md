# Code Quality Audit: Deep Nesting Analysis

**Scope:** Functions with pyramid-of-doom nesting, deeply nested loops/conditionals, complex ternaries, JSX nesting.

## Summary

Found **18 actionable refactoring opportunities** across priority files. Most critical patterns:

1. Canvas rendering in tracker-app.js — deeply nested draw functions (depth 4–5)
2. Pattern cleanup in creator/generate.js — nested loops with conditional filtering (depth 3–4)
3. k-means clustering in embroidery.js — triple-nested loops (depth 4–5)
4. Pattern reconciliation in manager-app.js — async/await with nested try-catch and loops
5. React render functions — complex conditionals in modals.js and manager-app.js JSX

---

## Checklist (Ordered by Nesting Depth × Function Length)

### TIER 1: High Priority (Depth 4–5, 80+ lines)

- [ ] **embroidery.js — `kMeans()` [L109–150]** *Nesting: 5 | Length: ~80 lines*
  Pattern: `for (i=0..N) { for (c of centroids) { if (data[idx+3]<=30) { ... } } }`
  Refactor: Extract `findNearestCentroid(pixel, centroids)`, `updateCentroids(labels, N, data, k)`. Guard at start: `if (!data.length || k <= 0) return ...`.

- [ ] **tracker-app.js — `TrackerPreviewModal` → `drawCross()` [L63–130]** *Nesting: 4–5 | Length: ~70 lines*
  Pattern: `if(lvl===1) {} else if(lvl===2) {} else { for(si...) {} }`
  Refactor: Extract `drawCross_L1`, `drawCross_L2`, `drawCross_L34`. Replace with early dispatch.

- [ ] **creator/generate.js — `runGenerationPipeline()` palette enforcement [L115–167]** *Nesting: 4 | Length: ~60 lines*
  Pattern: `for (safe=0..5) { for (k...) { ... } ... for (k3...) { if (...) mapped[k3] = ... } }`
  Refactor: Extract `buildPaletteUsageMap`, `findTopThreads`, `migrateNonKeptColors`. Use early `break` when `ids.size <= maxC`.

- [ ] **manager-app.js — `reconcileAutoSyncedPatterns()` [L164–195]** *Nesting: 3–4 | Length: ~35 lines (async + try-catch)*
  Refactor: Extract `updateTitleIfChanged`, `addUnlinkedPatterns`. Early return if `unlinked.length === 0`.

- [ ] **modals.js — `ThreadSelector()` render [L71–150]** *Nesting: 3–4 JSX | Length: ~80 lines*
  Pattern: `filteredThreads.map(t => ({ ...nested ternaries... }))`
  Refactor: Extract `SwapBanner`, `ThreadListItem`, `EmptyThreadList`. Early return for empty list.

### TIER 2: Medium Priority (Depth 3–4, 50–80 lines)

- [ ] **manager-app.js — `filteredPatterns` useMemo [L576–610]** *Nesting: 3 | Length: ~35 lines*
  Refactor: Extract `matchesSearch`, `matchesFilter`, `comparePatterns`.

- [ ] **creator/generate.js — orphan removal pass [L115–125]** *Nesting: 3 | Length: ~12 lines*
  Refactor: Extract `findBestMatchInPalette`, `buildReplacementMap`. Replace forEach with map+lookup.

- [ ] **manager-app.js — low-stock alert building [L430–450]** *Nesting: 3 | Length: ~25 lines*
  Refactor: Extract `extractBrandAndId`, `calculateEffectiveMinStock`, `isThreadLowStock`. Use filter+map.

- [ ] **pdf-export-worker.js — `drawCoverPage()` logo handling [L130–165]** *Nesting: 3 | Length: ~40 lines (try-catch)*
  Refactor: Extract `embedAndPlaceLogoImage`, `computeLogoPosition`. Guard: `if (!branding.designerLogo) return;`

- [ ] **sync-engine.js — `computeFingerprint()` byte encoding [L50–80]** *Nesting: 3 | Length: ~35 lines*
  Refactor: Extract `stringToUint8Array(str)` and `computeDeflateFingerprint(bytes,w,h)`. Guard: `if (typeof pako === 'undefined') return simpleHash(raw);`

- [ ] **insights-engine.js — `generateProjections()` loop [L95–140]** *Nesting: 3 | Length: ~50 lines*
  Refactor: Extract `calculateRecentPace`, `computeCompletionProjection`. Map projects through the helpers.

### TIER 3: Medium-Low Priority (Depth 3, 30–50 lines)

- [ ] **import-formats.js — `parseOXS()` dimension extraction [L45–85]** *Nesting: 3 | Length: ~45 lines*
  Refactor: Extract `extractDimension(doc, chart, sizeEls, attr)`. Guard against NaN/0/oversize early.

- [ ] **tracker-app.js — cell color resolution [L164–175]** *Nesting: 3 | Length: ~15 lines*
  Refactor: Extract `isBlendId`, `resolveCellColor(cell, cmap)`.

- [ ] **creator/useCreatorState.js — UserPrefs state init [L90–110]** *Nesting: 3 (try-catch in lazy init) | Length: ~25 lines*
  Refactor: Extract `loadUserPref(key, fallback)`. Replaces all `useState(() => loadUserPref(...))`.

- [ ] **embroidery.js — `traceContour()` direction loop [L111–140]** *Nesting: 3–4 | Length: ~35 lines*
  Refactor: Extract `findNextContourEdge(cx,cy,cd,mask,w,h,dirs,mk)`. Loop body becomes one assignment.

- [ ] **pdf-export-worker.js — legend page iteration [L165–195]** *Nesting: 3 | Length: ~30 lines*
  Refactor: Extract `filterValidPaletteEntries`, `computeLegendPageCount`.

- [ ] **manager-app.js — thread filter logic [L548–560]** *Nesting: 3 | Length: ~15 lines*
  Refactor: Extract `matchesThreadFilter(thread, filter, threshold)`. Guard: `if (d.compositeKey === expandedThread) return true;`

---

## Notes on Acceptable Nesting

The following are NOT flagged because they're architecturally clean or problem-driven:

1. **Natural 2D grid iteration** (tracker-app.js L160–190) — flat-array pattern grids; standard pattern.
2. **Bounded multi-stage cleanup pipeline** (creator/generate.js L87–167) — outer safety loop is documented safeguard.
3. **Scope-limited JSX in guards** (manager-app.js L755–800) — guard ensures non-empty data.
4. **Async error handling** (pdf-export-worker.js L92–100) — try-catch around async ops is appropriate.
5. **Minified utility loops** (embroidery.js L96–112) — pure-function hot-path loops; refactoring would slow them.

---

## Recommended Implementation Order

1. **kMeans** — highest complexity, performance-critical
2. **drawCross** — high-complexity canvas, well-tested
3. **runGenerationPipeline** — enables other cleanups
4. **reconcileAutoSyncedPatterns** — sync logic clarity
5. **filteredPatterns / filteredThreads** — useMemo clarity
6. **Modals/UI renderers** — lower risk, polishing
