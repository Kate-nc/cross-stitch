# Stash-Adapt — Phase 1.1 — Existing Code Map

> Scope: every system the "Adapt to my stash" feature has to integrate with
> or replace. **Headline finding:** much of the algorithmic work already
> exists ([creator/SubstituteFromStashModal.js](../creator/SubstituteFromStashModal.js)
> and [creator/ConvertPaletteModal.js](../creator/ConvertPaletteModal.js)).
> The new feature is primarily a **product-level reframing**:
> non-destructive duplication, unified entry points, honest match-quality UI,
> and gracefully working when the stash is empty.

---

## 1. Stash / inventory

### 1.1 Storage

- **DB:** `stitch_manager_db` (IndexedDB v1) → object store `manager_state`
  → key `"threads"` holds a flat object.
- **Composite-key schema (v2+):** entries are keyed `"dmc:310"`,
  `"anchor:403"`. Bare `"310"` keys still accepted on read for legacy data
  ([stash-bridge.js#L51-L54](../stash-bridge.js#L51), migration at
  [stash-bridge.js#L138-L200](../stash-bridge.js#L138)).
- **Entry shape (v4):**
  ```js
  {
    owned: number,                 // skeins owned (integer ≥ 0)
    tobuy: boolean,
    partialStatus: "mostly-full" | "about-half" | "remnant" | "used-up" | null,
    addedAt: ISO8601,              // v3
    lastAdjustedAt: ISO8601 | null,
    acquisitionSource: "purchased"|"inherited"|"gifted"|"swapped"|"unknown"|null,
    history: [{ date, delta }],    // capped at 500
    tobuy_qty: number,             // v4
    tobuy_added_at: ISO8601 | null,
    min_stock: number              // manager-local, low-stock threshold
  }
  ```
- **Migrations are idempotent + lazy** — first read of `getGlobalStash()` /
  `getManagerPatterns()` runs them.

### 1.2 `window.StashBridge` API ([stash-bridge.js](../stash-bridge.js))

The cross-page bridge — every reader/writer of stash data goes through this.

| Method | Returns | Notes |
|---|---|---|
| `getGlobalStash()` | `Promise<{ [key]: Entry }>` | Authoritative read; runs v2 migration |
| `getStashByBrand(brand?)` | `Promise<Object>` | Filter by `'dmc'` / `'anchor'` |
| `addToStash(id, count, opts?)` | `Promise<number>` | Increments; pre-populates v3 fields |
| `updateThreadOwned(id, n)` | `Promise<void>` | Sets exact value; appends history |
| `updateThreadToBuy(id, b)` | `Promise<void>` | Toggles shopping flag |
| `markManyToBuy(ids, b, qtyMap?)` | `Promise<number>` | Bulked, single-tx |
| `setToBuyQty(id, qty)` / `setToBuyQtyMany(map)` | `Promise<…>` | v4 |
| `markBought(id, qty?)` | `Promise<{key, addedSkeins, newOwned}>` | Atomically clears tobuy + increments owned |
| `markBoughtMany(qtyMap)` | `Promise<Array>` | Bulked |
| `getShoppingList()` / `clearShoppingList()` | — | Aggregated rows |
| `getManagerPatterns()` | `Promise<Array>` | Pattern library |
| `syncProjectToLibrary(...)` / `unlinkProjectFromLibrary(id)` | — | Project ↔ library sync |
| `getProjectsUsingThread(dmcId)` | `Promise<Array>` | Reverse index |
| `detectConflicts()` | — | Threads needed by patterns but understocked |
| `whatCanIStart()` | — | Readiness % per pattern |
| **`suggestAlternatives(key, max?, ownedThreads?)`** | `Array` | **Synchronous** — searches the user's *owned* stash for nearest matches by ΔE. **Already half of what this feature needs.** |

**There is no `loadStash()`** — that name is incorrect (was a bug fixed in
recent home-app commit). The right call is `getGlobalStash()`.

**Soft-delete only** — there is no `removeThread()`; the manager zeroes the
counts instead. We need to handle this when designing "stash empty" cases.

### 1.3 Ownership-vs-count UX surface

- Stash always stores a numeric `owned` count. The "yes/no ownership" mode
  is rendered by treating `owned > 0` as "owned"; the actual numeric stays.
- Project-level overlay: `threadOwned: { [dmcId]: "owned"|"tobuy"|"" }` in
  [creator/useCreatorState.js#L267](../creator/useCreatorState.js#L267).
  **Ephemeral** — not persisted, resets on project load. Diverges from
  global stash. Worth being aware of but probably out of scope for this
  feature.
- Preference `creatorStashOnlyDefault` (default `false`,
  [user-prefs.js#L59](../user-prefs.js#L59)) — when on, pattern generation
  is constrained to owned threads. This is the closest existing analogue
  to "adapt to my stash" but it operates at *generate* time rather than as
  a post-hoc retrofit on an existing pattern.

### 1.4 Manager UI

- Two tabs: `inventory` and `patterns` ([manager-app.js#L25-L30](../manager-app.js#L25)).
  Deep-link via `?tab=`.
- Inventory: search box, chip filters
  (`all|owned|lowstock|remnants|usedup`), brand chips (`all|dmc|anchor`),
  thread grid → right slide-out detail panel with skein +/− and partial gauge.
- Anchor entries are seeded on load if missing
  ([manager-app.js#L350-L360](../manager-app.js#L350)) and tagged with
  inline `A` badge.

### 1.5 Rough edges relevant to this feature

1. **Project `threadOwned` ↔ global stash mismatch** — a pattern can think
   it "owns" something the stash says it doesn't. We must read from
   `StashBridge`, not project state.
2. **Soft delete only** — entries with `owned: 0` still show up in the
   raw stash object. Filter on `owned > 0` when computing "what's
   available to substitute with."
3. **Schema migration runs on first read** — slight cold-start delay but
   acceptable.
4. **Filter / search state lost on tab switch in manager** — UX concern,
   not a blocker for adaptation.

---

## 2. Colour / thread system

### 2.1 Catalogues

- **DMC** ([dmc-data.js](../dmc-data.js)): 585 entries, each
  `{ id, name, rgb:[R,G,B], lab:[L,a,b] }`. Lab pre-computed on load with
  a per-RGB memo cache.
- **Anchor** ([anchor-data.js](../anchor-data.js)): ~500 entries, same
  shape. The header documents the reconciliation methodology — 7 IDs are
  flagged as contested (multiple sources disagreed).
- Both are exposed as `window.DMC` / `window.ANCHOR` and `module.exports`
  (Jest tests).

### 2.2 Thread conversions ([thread-conversions.js](../thread-conversions.js))

- Container: `CONVERSIONS` object keyed by composite `"dmc:310"`.
- Value: `{ anchor: { id, confidence } }` (or `{ dmc: { ... } }` for
  reverse). **Bidirectional but not symmetric.**
- Confidence tiers:
  - `official` — all consulted sources agree (multi-source ΔE2000 < 3)
  - `reconciled` — sources disagreed (ΔE 3–5); median picked
  - `single-source` — only one source had a mapping
- Sources: official DMC chart, official Coats/Anchor chart, Stitchtastic,
  Cross-Stitched.com, sibalman/thread-converter.
- **~500 mappings** — far from exhaustive on rare/new IDs.
  Algorithmic fallback (`dE2000` nearest) is used when a mapping is missing.
- Helper `getOfficialMatch(srcKey, targetBrand)` returns the mapping or
  `null`.

### 2.3 Colour-distance maths ([colour-utils.js](../colour-utils.js))

| Function | Formula | Used in |
|---|---|---|
| `rgbToLab(r,g,b)` | sRGB γ-correct → Lab D65 | Everywhere; cached |
| `dE(a,b)` | CIE76 (Euclidean in Lab) | Hot loops where speed wins |
| `dE2(a,b)` | CIE76 squared | Tightest hot loops (no `sqrt`) |
| `dE2000(a,b)` | Full CIEDE2000 | Reconciliation, conversion, "is this match good" calls |
| `findSolid(lab, palette)` | Nearest-by-CIE76 single colour | Quantize/dither |
| `findBest(lab, palette, allowBlends)` | Nearest single or blend | Quantize/dither |
| `quantize(...)` | k-means++ | Pattern generation |
| `doDither(...)` | Floyd-Steinberg + confetti control | Pattern generation |
| `buildPalette(pat)` | Extract uniques + assign symbols | After every palette mutation |

**Threshold constants** to reuse:
- `UNIQUE_THRESHOLD_DE` (≈ 5) — flags "this colour has no equivalent in
  the target brand."
- The substitute modal uses CIEDE2000 at thresholds 5 / 10 / >10 to bucket
  matches into `good` / `fair` / `poor`
  ([SubstituteFromStashModal.js#L17-L22](../creator/SubstituteFromStashModal.js#L17)).

### 2.4 Pattern data ([project-storage.js](../project-storage.js))

Project schema **v11** (the second subagent saw v8 in the older
copilot-instructions; v11 is current). Pattern array length = `sW * sH`
flat. Cell shape:

```js
{ id: "310",     type: "solid", rgb: [0,0,0] }            // solid
{ id: "310+550", type: "blend", rgb: […], threads: [a,b] } // blend (canonical "a+b" sorted)
{ id: "__skip__"  }                                        // background skipped
{ id: "__empty__" }                                        // unstitched
```

Tracking arrays (`done`, `halfStitches`, `halfDone`) are **index-aligned**
to the pattern array. **Substituting a colour does not touch tracking
indices** — that's what makes in-place colour-swap safe today, and what
makes a deep-copy duplicate trivially correct.

**Footprint** (rough):
- 100×100, 30 colours: ~600 KB pattern array in RAM, ~1–2 MB JSON in IDB.
- 300×300, 80 colours: ~5.5 MB in RAM, ~10–15 MB in IDB.
- Source `imgData` (base64 PNG) is the dominant cost when present.

A non-destructive duplicate of even a large pattern is well under
20 MB — fine for IndexedDB. We don't need copy-on-write.

### 2.5 Runtime palette ([creator/useCreatorState.js](../creator/useCreatorState.js))

- `_pat`, `_pal`, `_cmap` state — `pal` is sorted by frequency; `cmap` is
  `id → palette entry`.
- `rebuildPaletteCounts(pat, existingPal)` keeps symbol assignments stable
  on incremental edits — important for adapted-pattern UX (we don't want
  symbols shuffling visually after a substitution).

---

## 3. Existing colour-swap surface

### 3.1 `palette-swap.js` (the "Palette Swap" tool)

- Full hue-shift, preset-palette, harmony-rule remapper for the *whole*
  active pattern. Operates **in place** via `state.setPat(...)`.
- Calls `applyMapping(pat, mapping)` which preserves `done` /
  `halfStitches` (pattern indices unchanged, only `id`/`rgb` swap).
- Includes a WCAG luminance contrast check
  ([palette-swap.js#L708-L745](../palette-swap.js#L708)) — useful for
  warning when substitutions destroy colour separation.

### 3.2 `creator/SubstituteFromStashModal.js` — **already shipping**

- Mounted from
  [Sidebar.js#L259](../creator/Sidebar.js#L259) and
  [ProjectTab.js#L245](../creator/ProjectTab.js#L245).
- Builds proposals: per pattern thread, finds top-5 owned-stash candidates
  by ΔE2000, prefers ones with sufficient skein count, deduplicates
  targets, optionally enforces pairwise contrast.
- Status buckets `good` (ΔE<5) / `fair` (ΔE<10) / `poor` (≥10) /
  `insufficient` (not enough skeins).
- Skip reasons: `no_stash_match` (no candidate at all),
  `all_above_threshold` (everything too far away — collects up to 3
  "near-miss" candidates between threshold and 1.5×threshold).
- Includes a `ComparisonSlider` preview canvas (Feature 2 in the file
  header) and "Preserve contrast" toggle (Feature 4).
- **Applies in place.** No duplication step. No "this was adapted from X"
  metadata. No way to re-run on the same project later without overwriting.
- Uses `ctx.substituteModalKey` as a remount lever (set the key, the modal
  re-mounts with fresh proposals).

### 3.3 `creator/ConvertPaletteModal.js` — **already shipping (Phase 1)**

- Cross-brand conversion (DMC ↔ Anchor) using `CONVERSIONS` table first,
  then ΔE2000 nearest-colour fallback.
- Returns proposals with `confidence: 'official'|'reconciled'|'single-source'|'nearest'`
  and `isUnique: true` when no acceptable target exists.
- Same in-place model; same lack of non-destructive snapshot.

### 3.4 Single-cell / single-colour swap

- Cell-level edits: paint tool replaces one cell at a time
  ([creator/PatternCanvas.js](../creator/PatternCanvas.js) +
  [creator/useCanvasInteraction.js](../creator/useCanvasInteraction.js)).
- Whole-colour swap: there is **no dedicated "swap colour A for colour B
  everywhere"** UI today. The palette-swap tool can do it via "manual
  override," but that's a multi-step workflow buried behind hue / preset /
  harmony tabs. Building Flow B (swap one colour) is genuinely new UX
  work even though the engine to do it exists.

---

## 4. Pattern duplication today

- `ProjectStorage.save(p)` keys on `p.id`; the only way to fork is to
  hand-write a new id and save under it.
- **No `duplicateProject` / `cloneProject` / "Save As" anywhere in the
  codebase.** (`grep -i 'duplicate|clone|saveAs|fork'` returns nothing
  relevant.)
- Users can manually export → re-import JSON via
  [creator/useProjectIO.js](../creator/useProjectIO.js); the importer
  mints a new id. That's the only existing duplication path and it's
  explicit / round-trips through the file system — not adequate for this
  feature.
- `serializePattern` (perf optimisation) strips RGB for cells whose id is
  in the DMC catalogue. We must round-trip via `deserializePattern` when
  copying — *or* deep-copy the in-memory pattern and let the existing save
  pipeline handle stripping.

---

## 5. What's actually missing for "Adapt to stash"

| Capability | Status |
|---|---|
| Stash read API | ✅ `StashBridge.getGlobalStash` + `suggestAlternatives` |
| ΔE2000 + lookup-table conversion | ✅ `colour-utils.js` + `thread-conversions.js` |
| Stash-based per-thread proposal generator | ✅ `SubstituteFromStashModal` proposal builder |
| Cross-brand proposal generator | ✅ `ConvertPaletteModal.proposeConversion` |
| In-place application of a substitution mapping | ✅ same modals |
| Tracking-state preservation across swaps | ✅ pattern indices stable |
| **Non-destructive duplication** | ❌ does not exist |
| **"Adapted from" / mapping metadata persistence** | ❌ proposals are throwaway |
| **Unified entry point for substitute / convert / general swap** | ❌ three scattered surfaces |
| **One-click "swap colour A → B everywhere"** | ❌ buried in palette-swap |
| **Project-list visual marker for adapted patterns** | ❌ no flag exists |
| **"Re-run auto-match on remaining colours" after manual edits** | ❌ proposals are one-shot |
| **Undo within the adaptation flow** | ⚠️ only via global undo stack ([useEditHistory.js](../creator/useEditHistory.js)); not granular per substitution |
| **"You used my stash as of [date]" snapshot** | ❌ no snapshot is captured |
| **Empty-stash graceful path** | ⚠️ modal currently shows mostly-empty results — not great |
| **Match-quality visualisation beyond a coloured pill** | ⚠️ basic `good/fair/poor` chip |
