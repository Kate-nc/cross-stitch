# Code Quality Audit: Intra-file Cleanups & Rearrangements

## Summary
Identified 28 actionable intra-file refactorings across 8 files. Focus areas: repeated localStorage patterns, multi-useState on single lines, duplicated event listener registration, overly complex drawing functions, and lazy-initialized state patterns.

## Findings Checklist (ordered by impact)

### creator/useCreatorState.js (~1100 lines)

- [ ] **Extract persistedPref helper factory** (Lines 92–98, 142, 184–192, 195–197, 246–276): 20+ repeated `useState(function() { try { localStorage.getItem(...) } catch(_) { return default } })` blocks. Create factory: `function createPersisted(key, parser, defaultVal)` to reduce ~80 lines.
- [ ] **Consolidate localStorage setter functions** (Lines 186, 192, 197, 256, 260, 265, 268, 273): 10+ similar setter functions follow `function setX(v) { _x[1](v); try { localStorage.setItem(...) } catch(_) {} }`. Extract to higher-order function or use useCallback factory.
- [ ] **Consolidate highlight mode setters** (Lines 254–276): `setBgDimOpacity`, `setBgDimDesaturation`, `setTintColor`, `setTintOpacity`, `setSpotDimOpacity` are near-identical. Create `createPersistenceEffect(state, key, parser)` or similar.
- [ ] **Collapse multi-line useState destructuring** (Lines 28–88): 60+ lines destructuring pattern `var _x = useState(...); var x = _x[0], setX = _x[1];` on consecutive lines. Use object spread or helper to reduce verbosity by ~40%.
- [ ] **Merge addToast + dismissToast logic** (Lines 286–297): Both functions update `setToasts` with similar `.filter()` / `.concat()` patterns. Extract common `updateToasts(predicate, transformer)` helper.
- [ ] **Consolidate generateGallery loop** (Lines 814–864): 50+ lines with nested `setTimeout` and `setGallerySlots`. Extract inner `genSlot(slotIdx)` to a separate named function outside loop for readability.
- [ ] **Inline single-use helper** (Lines 757–763): `_buildRoulette(pool, n, seed)` is called exactly once (line 765). Inline its logic.

### tracker-app.js (~4300 lines)

- [ ] **Consolidate event listener registration** (Lines 428–437): Three identical useEffect blocks for 'cs:openHelp', 'cs:openShortcuts', 'cs:showWelcome'. Extract to `function registerWindowEventListener(eventName, handler, setter)`.
- [ ] **Merge multi-variable useState declarations** (Lines 414–421, 540, 554, 628): Lines like `const[sW,setSW]=useState(80),[sH,setSH]=useState(80);` span multiple dimensions. Separate one per line.
- [ ] **Extract fabric count to stroke opacity mapping** (Line 3157+): `if(stitchingStyle==="royal"){if(dx===0&&dy===1)op=0.88;else if(dx===1&&dy===0)op=0.81;else op=0.31;}` should be a Map or lookup table.
- [ ] **Convert if-elif-else SC calculation to lookup** (Line 52): `if(fc<=11){SC=3;}else if(fc<=17){SC=2;}else{SC=1;}` should be a pre-computed table.
- [ ] **Extract nested drawing function helpers** (Lines 53–122): Extract 8+ nested functions (makeGrad, drawSeg, drawLeg3, drawLeg3a) to module scope or a drawing utilities object.
- [ ] **Consolidate palette/pattern lookups** (Lines 147–175): Two separate loops over `pat` with similar `cmap` lookups. Merge into one pass.
- [ ] **Inline single-use utility** (Lines 3–9): `uint8ToBase64(bytes)` called once. Inline or remove if unused.
- [ ] **Reduce nested if-else in keydown** (Line 3968 area): Long chain of modifier+key checks. Extract to a command map.

### manager-app.js (~1500 lines)

- [ ] **Consolidate multi-variable useState**: Extract repeated pattern `const [x, setX] = useState(null)` triplets into a custom hook.
- [ ] **Merge similar useEffect event listeners** (Lines ~90–110, 110–120, 120–130): Multiple useEffect blocks for 'cs:openHelp', 'cs:openShortcuts', 'cs:openBulkAdd'. Extract factory.
- [ ] **Extract 'B' key handler boilerplate** (Lines 115–130): 15+ lines with modifier checks and type checks. Move to `useKeyShortcut()` hook.
- [ ] **Consolidate buildAutoSyncedPattern** (Multiple calls): Check duplication; extract thread list building to separate function.
- [ ] **Merge thread data transformation steps** (Lines ~200–270): Multiple passes over thread data for migration and filtering. Combine where possible.

### components.js (~800 lines)

- [ ] **Extract Tooltip positioning logic** (Lines ~30–60): Complex inline position calculations with Math.max/Math.min. Extract to `function calculateTooltipPosition(rect, width)`.
- [ ] **Consolidate button style patterns**: Multiple buttons with identical style objects. Extract to CSS classes or `BUTTON_STYLES` constant.
- [ ] **Inline single-use helpers** (~50–100): Check for helpers called exactly once; inline or rename.

### embroidery.js (~500 lines)

- [ ] **Extract nested closure functions in processing pipeline**: `kMeans`, `quantize` have 5+ nested functions each. Extract to module scope.
- [ ] **Consolidate Canny/bilateral parameter defaults** (Lines 10–30): Pipeline constants scattered. Consolidate into single `PIPELINE_CONFIG` object.
- [ ] **Reduce nested loops in kMeans** (Line ~200): Double nested loop over centroids and data. Cache distances or restructure.

### modals.js (~600 lines)

- [ ] **Extract modal style inline objects**: Multiple modals pass nearly-identical style objects as inline JSX. Extract to `MODAL_STYLES` constant.
- [ ] **Consolidate ThreadSelector search/filter logic** (~250 lines): Extract filter to `function filterDMCBySearch(query)` for testing/reuse.

### helpers.js (~1100 lines)

- [ ] **Consolidate stats calculation functions**: `getStatsTodayStitches`, `getStatsThisWeekStitches`, `getStatsThisMonthStitches` use similar `.filter().reduce()` patterns. Extract parameterized helper.
- [ ] **Extract session date filtering pattern** (Lines 554–578): Three functions doing similar `sessions.filter(...)`. Create `filterSessionsByDateRange(sessions, matcher)`.
- [ ] **Inline helper called once** (e.g. `formatDurationCompact`): Check single-call helpers.
- [ ] **Consolidate draw functions**: `drawHalfTriangle`, `drawHalfLine`, `drawQuarterStitch` etc. have structural similarities. Extract common pattern or factory.

### stash-bridge.js (~300 lines)

- [ ] **Extract repeated migration boilerplate** (Lines 40–100): `migrateSchemaToV2`, `migrateSchemaToV3` share error handling and transaction patterns. Extract migration factory.
- [ ] **Merge thread key parsing logic** (Lines 8–28): `_normaliseKey`, `_parseThreadKey` do related transformations. Consolidate.

### colour-utils.js (~400 lines)

- [ ] **Consolidate colour matching loop** (Lines ~40–80): `findSolid` and manual blend search both iterate palette with distance comparisons. Parameterize.
- [ ] **Extract quantize k-means logic** (Lines 150–200): 50+ lines of k-means iteration; candidate for separate module if tested independently.

---

## Larger Structural Changes (Future Multi-Step Efforts)

- **Create custom hooks layer**: `useLocalStorage(key, parser, default)`, `useKeyboardShortcut(key, modifier, handler)`, `useEventListener(event, handler)` to eliminate boilerplate across files.
- **Extract rendering utilities**: Consolidate canvas, PDF, and realistic preview rendering logic into a utilities module with reusable draw helpers.
- **Establish stats calculation layer**: Consolidate all stitch/time/progress calculations into a single, testable `StatsCalculator` class or module.
