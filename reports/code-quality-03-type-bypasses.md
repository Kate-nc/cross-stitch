# Code Quality Audit: Type Coercions & Bypasses

**Scope:** Plain JS cross-stitch repo — type safety issues, unsafe coercions, and pattern ambiguities

## Summary

This codebase exhibits **17 actionable type coercion anti-patterns** that create runtime risks and obscure data shapes. The most pervasive issues are:

1. **Pattern cell format inconsistency** — cells alternate between string IDs and blend-with-threads objects without explicit type narrowing
2. **Defensive `|| 0` and `|| ""` coercions** hiding missing null-checks at data boundaries
3. **Mixed return types** — functions return `null | false | undefined | 0 | object` sentinels
4. **Unchecked `localStorage.getItem` / `JSON.parse`** without schema validation
5. **Problematic `if (x)` checks** on numeric/object fields where 0 or empty objects are valid

---

## Issues by Impact (Ordered)

### HIGH — Blend/Solid Cell Format Ambiguity

- [ ] **creator/useCreatorState.js Lines 343, 552–558** — Pattern cells have two shapes (solid `{id, type:"solid", rgb}` vs blend `{id, type:"blend", threads:[...]}`). Code must check `.type` AND `.threads.length === 2` to avoid undefined `.threads`. No decoder/validator exists; every consumer reimplements the check. **Fix:** Create a small validator at boundary (import/deserialize) to guarantee one of two canonical shapes. Add JSDoc type hints.

- [ ] **creator/ShoppingListModal.js Line 62** — `var ids = (p.type === 'blend' && typeof p.id === 'string' && p.id.indexOf('+') !== -1) ? p.id.split('+') : [p.id];` Fallback to parsing `.id` string for '+' when `.type` is already present. Suggests the type field is sometimes missing or unreliable. **Fix:** Normalize at import; if `.type` is missing, compute it deterministically (not both).

- [ ] **creator/useProjectIO.js Lines 252, 265** — `type: v[q].type || (typeof v[q].id === "string" && v[q].id.includes("+") ? "blend" : "solid")`. Inferring type from ID string when `.type` field should be trusted. **Fix:** Always write `.type` at serialization time. Validate it on load.

### HIGH — Unchecked JSON.parse Results (Wash Away Type)

- [ ] **sync-engine.js Lines 397–400** — `merged.halfDone = local.halfDone ? JSON.parse(JSON.stringify(local.halfDone)) : {};` (and 3 similar). Used to "wash" types by serializing and re-parsing — but no schema validation afterwards. **Fix:** Replace with `structuredClone` or simple recursive builder; add small validators post-parse.

- [ ] **tracker-app.js Lines 2076–2077** — `JSON.parse(JSON.stringify(pal))` and `JSON.parse(JSON.stringify(threadOwned))` used as type-wash instead of explicit clone. **Fix:** Use dedicated clone function (`structuredClone`).

- [ ] **home-screen.js Line 339** — `var streakData = JSON.parse(localStorage.getItem('cs_globalStreak') || 'null');` If `getItem` throws, the error propagates. No validation of result. **Fix:** Wrap in try/catch + schema validation.

### HIGH — Truthiness Check on Numeric Field (0 is falsy)

- [ ] **creator/useCreatorState.js Line 402** — `return (threadOwned[d.id] || "") === "tobuy" || !(threadOwned[d.id]);` `!(threadOwned[d.id])` is true if the value is 0, false, "", null, or undefined. If meant to be a count (number), this silently treats 0 as "not owned". **Fix:** Check the actual type explicitly.

- [ ] **Multiple Locations: `(entry.owned || 0)` pattern** — creator/ProjectTab.js:228, creator/LegendTab.js:44, creator/PrepareTab.js:36, components.js:828. If `gs.owned` is intentionally 0, this coerces. If `gs` is undefined, the fallback hides it. **Fix:** `const owned = (gs && typeof gs.owned === 'number') ? gs.owned : 0;`

### MEDIUM — Mixed Return Types Across Functions

- [ ] **analysis-worker.js Line 100** — `if (!pat || !sW || !sH) return null;` Returns `null` on error; caller must handle. **Fix:** Validate args at entry; throw or return typed result.

- [ ] **home-screen.js Line 448–468** — Functions return `undefined` on some paths and `null` on others. **Fix:** Use `null` for "not found" consistently.

### MEDIUM — Unsafe `String(x)` / `Number(x)` Coercions

- [ ] **backup-restore.js Line 227** — `e && e.key && String(e.key).startsWith('proj_')`. If `e.key` is a Symbol, produces `Symbol(...)`. **Fix:** `typeof e.key === 'string' && e.key.startsWith('proj_')`.

- [ ] **components.js Line 628** — `var v = parseInt(value);` No radix specified. **Fix:** `parseInt(value, 10)` or `Number.isInteger(value) ? value : parseInt(value, 10)`.

- [ ] **creator/bundle.js Lines 4163, 4227, 4231, 4239, 4244** — `return v != null ? parseFloat(v) : 15;` parseFloat on possibly already-parsed value. **Fix:** Validate range after parse. (Edit source files in `creator/`, not bundle.)

### MEDIUM — Defensive Array Normalisation Hiding Upstream Issues

- [ ] **components.js Line 1672** — `setProjectSummaries(Array.isArray(built) ? built : []);` `ProjectStorage.buildAllStatsSummaries()` should always return an array. **Fix:** Guarantee array in producer; remove defensive check.

- [ ] **components.js Line 1613** — `goals = goals && typeof goals === 'object' ? goals : {};` If `goals` is `null`, defaults to `{}`. Caller might want to distinguish. **Fix:** Let caller decide how to handle null.

### MEDIUM — localStorage Access Without Null/Error Handling

- [ ] **creator/bundle.js Lines 4157, 4163, 4168, 4219, 4227, etc.** — `localStorage.getItem("cs_stashConstrained") === "true"` etc. throws if quota or restricted. **Fix:** Wrap in try/catch with safe default. (Edit creator source files, not bundle.)

- [ ] **index.html Lines 98, 107, 124, 133, 149, 158, 173, 182, 197, 206** — `try { cached = localStorage.getItem(TRACKER_CACHE_KEY); } catch(e) {}` Silent catch; if localStorage broken, subsequent code uses stale values. **Fix:** Log the error or set a flag.

### MEDIUM — Unchecked Property Access on Stash Data

- [ ] **stash-bridge.js Line 16** — `const byKey = (threadsData[key] || {}).owned || 0;` If `threadsData[key]` is not an object, `|| {}` doesn't help. **Fix:** Validate type before access.

- [ ] **creator/ProjectTab.js Line 330** — `var owned2 = (stash[d.id] || {}).owned || 0;` Same issue. **Fix:** Validate stash entry type.

### LOW — Type Coercion Patterns That Work But Are Confusing

- [ ] **analysis-worker.js Line 197** — `reg.colourCounts[id3] = (reg.colourCounts[id3] || 0) + 1;` Works for counting, but no explicit type guarantee. **Fix:** Initialize `colourCounts` with all keys 0 upfront.

- [ ] **creator/RealisticCanvas.js Line 385** — `if (cKey) colourFreq[cKey] = ...` rejects 0 as a key. **Fix:** Use `cKey != null` if 0 is valid.

- [ ] **helpers.js Line 1107** — `if(typeof key!=='string')return{brand:'dmc',id:String(key)};` Silently coerces numeric keys. **Fix:** Add JSDoc.

- [ ] **home-screen.js Lines 7, 37** — `var d = typeof date === 'string' ? new Date(date) : date;` Invalid object → invalid date but no error. **Fix:** Validate and throw.

- [ ] **components.js Line 74** — `onChange:e=>onChange(Number(e.target.value))` `Number("")` returns 0. **Fix:** Validate before passing.

- [ ] **stash-bridge.js Lines 6–8** — `keyOrId.indexOf(':') < 0 ? 'dmc:' + keyOrId : keyOrId;` String concatenation for composite keys is repeated. **Fix:** Centralize as `function makeThreadKey(brand, id)` (see duplication report).

---

## Investigate Further

1. **Half-stitch cell format** — Does `halfDone` store partial-stitch metadata? Are values always `Int8Array` or sometimes objects? See: tracker-app.js L4189, sync-engine.js L397
2. **Pattern cell `rgb` fallback** — Why do some places default RGB to `[128, 128, 128]`? Should this be an error instead? See: creator/pdfExport.js L150, pdf-export-worker.js L222
3. **Stash entry shape** — What is the canonical stash entry? Does `owned` always exist? Can it be 0? See: stash-bridge.js L16

---

## Recommendations

**Priority 1 (Fix Immediately):**
- [ ] Add a `validatePatternCell(cell)` function; call it on import/deserialize.
- [ ] Replace all `JSON.parse(JSON.stringify(...))` with `structuredClone` + schema validation.
- [ ] Add schema validators for `localStorage.getItem` results.
- [ ] Change `(x || 0)` on count fields to explicit `typeof x === 'number' ? x : 0`.

**Priority 2:**
- [ ] Centralize stash key construction (makeThreadKey, normalizeStashKey).
- [ ] Create shared JSDoc typedefs for pattern cells, stash entries, project objects.
- [ ] Replace defensive `Array.isArray(x) ? x : []` checks with guaranteed-array producers.

**Priority 3:**
- [ ] Consider TypeScript migration or JSDoc strict mode.
- [ ] Add a linting rule to flag `JSON.parse` without subsequent validation.
