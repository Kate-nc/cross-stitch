# Performance Audit — Expensive Patterns & Algorithmic Issues (Agent 6)

> Read-only audit. Findings are starting hypotheses. Every I0–I2 includes a
> measurement method per the rule in
> [reports/00_PERFORMANCE_CONTEXT.md](../00_PERFORMANCE_CONTEXT.md#section-6).

## Top 3 summary

1. **[I1] Stats page reloads the entire project library 4× per visit.**
   `StatsPage` mounts ~four independent `useEffect` hooks
   ([stats-page.js](../../stats-page.js#L1079), [stats-page.js](../../stats-page.js#L1154),
   [stats-page.js](../../stats-page.js#L1210), [stats-page.js](../../stats-page.js#L1274))
   that each call `ProjectStorage.listProjects()` and then `Promise.all(metas.map(m => ProjectStorage.get(m.id)))`.
   Every project blob is `JSON.parse`d four times on the main thread on every
   stats-tab open. For a library of 50 projects @ 200 KB each, this is ~40 MB
   of redundant JSON parsing. Compound with [stats-activity.js](../../stats-activity.js#L42)
   which does it again when the Activity tab loads.

2. **[I1] `JSON.parse(JSON.stringify(srcProject))` deep-clone on full project payloads.**
   [creator/adaptationEngine.js:482](../../creator/adaptationEngine.js#L482) clones the
   *entire* source project (pattern array of W×H cells, often >1 MB) on the main
   thread when adapting a project. `structuredClone` is already used elsewhere
   ([sync-engine.js:11](../../sync-engine.js#L11), [tracker-app.js:8](../../tracker-app.js#L8))
   and is 2–5× faster on the same payload.

3. **[I1] Hot-path `console.log` of full project payloads in import flow.**
   [import-engine/wireApp.js](../../import-engine/wireApp.js#L251) logs the entire
   `shape` (= the freshly built project) per save, plus a post-save read-back
   ([wireApp.js#L283](../../import-engine/wireApp.js#L283)). Combined with the
   "[import-trace]" / "[creator-boot]" diagnostic logs at
   [wireApp.js#L37](../../import-engine/wireApp.js#L37),
   [wireApp.js#L95](../../import-engine/wireApp.js#L95),
   [wireApp.js#L107](../../import-engine/wireApp.js#L107),
   [creator/useProjectIO.js#L501](../../creator/useProjectIO.js#L501),
   [creator/useProjectIO.js#L536](../../creator/useProjectIO.js#L536) and the
   `JSON.stringify` calls feeding sessionStorage breadcrumbs at
   [creator/useProjectIO.js#L502](../../creator/useProjectIO.js#L502),
   [creator/useProjectIO.js#L537](../../creator/useProjectIO.js#L537), the import
   path stringifies & logs a multi-MB object during a UX-critical navigation.
   Even when DevTools is closed Chrome still serialises args.

---

## Detailed findings

### I1 — Stats page: 4× full-library load

**Location:** [stats-page.js](../../stats-page.js#L1079),
[stats-page.js](../../stats-page.js#L1154),
[stats-page.js](../../stats-page.js#L1210),
[stats-page.js](../../stats-page.js#L1274) and
[stats-activity.js](../../stats-activity.js#L48).

Each effect independently fans out `Promise.all(metas.map(m => ProjectStorage.get(m.id)))`.
There is no shared cache, so the library is re-fetched and re-parsed by
IndexedDB on every effect, every tab switch, every stash/projects change event.
The effect at [stats-page.js#L1147](../../stats-page.js#L1147) explicitly
chooses *sequential* loading for memory reasons but the other three load
everything in parallel — peak heap is the sum.

Fix sketch: introduce a single `useFullProjectLibrary()` hook (or a
`ProjectStorage.getAll()` cached for one tick) and have all four effects derive
from it.

**Measurement:** seed IndexedDB with 30 fake projects of 80×80 cells each
(`scripts/seed-stats.js` would need to be added).
`console.time('statsLoad')` around the four effects and the activity tab open.
Expect <300 ms after dedup vs. >1 s today on a mid-tier laptop.

---

### I1 — `JSON.parse(JSON.stringify(srcProject))` deep-clone

**Location:** [creator/adaptationEngine.js:482](../../creator/adaptationEngine.js#L482).

Replace with `(typeof structuredClone === 'function' ? structuredClone(srcProject) : JSON.parse(JSON.stringify(srcProject)))`
matching the `_clone` helper in [sync-engine.js:11](../../sync-engine.js#L11).

**Measurement:** with a 200×200 pattern (40 000 cells, ~3 MB project),
`console.time('adapt-clone')` around the clone in `adaptationEngine.js`. Expect
the clone to drop from ~80 ms to ~25 ms. Re-bundle creator after edit per
[AGENTS.md](../../AGENTS.md#read-this-first).

---

### I1 — `console.log` of full project payloads on hot paths

**Locations** (all need to be removed or gated behind a `__IMPORT_DEBUG__` flag
that defaults to off):

- [import-engine/wireApp.js#L37](../../import-engine/wireApp.js#L37) (loop over
  every breadcrumb key, JSON.parsing each)
- [import-engine/wireApp.js#L95](../../import-engine/wireApp.js#L95)
- [import-engine/wireApp.js#L107](../../import-engine/wireApp.js#L107)
- [import-engine/wireApp.js#L132](../../import-engine/wireApp.js#L132)
- [import-engine/wireApp.js#L251](../../import-engine/wireApp.js#L251) — logs whole project
- [import-engine/wireApp.js#L274](../../import-engine/wireApp.js#L274)
- [import-engine/wireApp.js#L283](../../import-engine/wireApp.js#L283) — logs read-back project
- [import-engine/wireApp.js#L310](../../import-engine/wireApp.js#L310)
- [import-engine/ui/ImportReviewModal.js#L238](../../import-engine/ui/ImportReviewModal.js#L238)
- [import-engine/ui/ImportReviewModal.js#L269](../../import-engine/ui/ImportReviewModal.js#L269)
- [creator/useProjectIO.js#L501](../../creator/useProjectIO.js#L501)
- [creator/useProjectIO.js#L536](../../creator/useProjectIO.js#L536)
- [creator/bundle.js#L8716](../../creator/bundle.js#L8716) — regenerated; same source as above
- [home-app.js#L481](../../home-app.js#L481)

**Measurement:** open DevTools, profile an import of `TestUploads/exported_pattern.pdf`
(1.7 MB PDF, generates ~10 000-cell pattern). Record string-conversion time
in the "Console" tab. Expect ~20–80 ms saved depending on log line. Keep
`sw-register.js`/`anchor-data.js`/`stash-bridge.js` `console.log`s — they're
one-shot at startup.

Counts (excluding `node_modules`, `pdf.worker.min.js`, build scripts, tests,
`creator/bundle.js`, `import-engine/bundle.js`):

| File | console.log/info/debug calls |
|---|---:|
| [import-engine/wireApp.js](../../import-engine/wireApp.js) | 9 |
| [import-engine/ui/ImportReviewModal.js](../../import-engine/ui/ImportReviewModal.js) | 4 |
| [creator/useProjectIO.js](../../creator/useProjectIO.js) | 2 |
| [home-app.js](../../home-app.js) | 1 |
| [helpers.js](../../helpers.js#L195) | 1 (storage-persistence one-shot) |
| [sw-register.js](../../sw-register.js#L5) | 1 (SW registration) |
| [stash-bridge.js](../../stash-bridge.js#L190) | 1 (one-shot migration) |
| [project-storage.js](../../project-storage.js#L637) | 1 (one-shot migration) |
| [anchor-data.js](../../anchor-data.js#L755) | 1 (one-shot warning) |

The first three rows are the hot-path concern. The rest are one-shot and may stay.

---

### I2 — `manager-app.js` patterns row: `find()` called twice in JSX

**Location:** [manager-app.js:1237](../../manager-app.js#L1237). The same
`p.threads.find(t => t.id === d.id)` is invoked twice in one row — once in
the conditional, once for the qty access. Hoist to a `const need = ...` so the
list scan runs once per row.

**Measurement:** with a stash of 80 owned threads and 30 patterns referencing
each, `console.time('threadList')` around the parent map. Expect ~halving of
the per-render cost (<5 ms today; this is mainly hygiene).

---

### I2 — `tracker-app.js`: repeated `focusableColors.find(...)` and `pal.find(...)` in keyboard / view handlers

**Location:** [tracker-app.js:4994](../../tracker-app.js#L4994),
[tracker-app.js:5008](../../tracker-app.js#L5008),
[tracker-app.js:5026](../../tracker-app.js#L5026),
[tracker-app.js:5158](../../tracker-app.js#L5158),
[tracker-app.js:5610](../../tracker-app.js#L5610),
[tracker-app.js:6026](../../tracker-app.js#L6026),
[tracker-app.js:6609](../../tracker-app.js#L6609).

Same predicate `(p => { const dc=colourDoneCounts[p.id]; return !dc||dc.done<dc.total; })`
is duplicated five times. With 200-colour patterns each call is O(n) over `pal`.
Memoise once per render (`firstUnfinishedColour = useMemo(...)`).

**Measurement:** `pal` length 200, repeatedly press `[`/`]` (palette navigation).
`console.time` inside the handler; expect <0.5 ms per press today, but cleanup
removes 5 copies of the same closure.

---

### I2 — Stats reduce/filter chains over session arrays

**Location:** [insights-engine.js:312-340](../../insights-engine.js#L312)
clones `allSessions` then performs three independent `.reduce` passes
(`netStitches`, two `getSessionDurationSeconds` reductions) followed by
`.filter().reduce()` pairs at L335 and L338. Single forward pass collecting
all three accumulators is straightforward.

[stats-activity.js:102](../../stats-activity.js#L102) chains
`.filter().map().sort()` over `days` (calendar grid up to 365 entries) for
median; could be a single pass to a typed array.

**Measurement:** with a year of dense session data (~3000 sessions),
`console.time('insights')` around `computeInsights`. Expect ≤200 ms today,
~30% drop after collapsing passes.

---

### I2 — `palette-swap.js`: `findSimilarDmc` re-scans full DMC on every preview

**Location:** [palette-swap.js:690](../../palette-swap.js#L690).
Loops over 500-entry `DMC[]` and `push()`-then-`sort()` for every preview row.
For the previews at L893/L937/L1206 this adds up.

Fix sketch: cache top-K via partial-sort or the existing `getDmcById` map; or
memoise per (lab, count) pair on the hook.

**Measurement:** in palette-swap modal, open *Themes → preview each preset*
(~30 presets × ~10 colours each = 300 calls). `console.time('similarDmc')`
around the loop. Expect 100–200 ms today, near-zero after cache.

---

### I2 — buildPalette + sort runs on every drag-paint commit

**Location:** [colour-utils.js:352](../../colour-utils.js#L352) called by
[creator/useCreatorState.js:691](../../creator/useCreatorState.js#L691) and via
`rebuildPreservingZeros` at
[creator/useCanvasInteraction.js:32](../../creator/useCanvasInteraction.js#L32)
on every drag-paint end and every fill-bucket. It walks the entire pattern,
allocates a `usage` object per unique id, then `Object.values(...).sort(...)`.

For 300×300 (90 000 cells, max), each commit is ~2–5 ms — acceptable but the
sort runs even when only counts changed (symbols are stable). When only counts
change, prefer `rebuildPaletteCounts` ([colour-utils.js:373](../../colour-utils.js#L373))
which is O(n) without sort/symbol assignment.

**Measurement:** 300×300 pattern, drag-paint a 50-stitch line. `console.time`
inside `rebuildPreservingZeros`. Expect 3–6 ms today; <1 ms if delta-rebuild
is used for the no-new-id case.

---

### I3 — `compress()` in sync-engine builds JSON then re-encodes to bytes

**Location:** [sync-engine.js:312](../../sync-engine.js#L312). `JSON.stringify` →
`TextEncoder` → `pako.deflate` happens on the main thread. For a multi-project
sync export this can be hundreds of ms. Move to a Web Worker (this matches the
pattern of [generate-worker.js](../../generate-worker.js) /
[pdf-export-worker.js](../../pdf-export-worker.js)).

**Measurement:** `console.time('compress')` with 10 projects × 100×100 cells.
Expect ~150 ms; offload to worker to keep UI responsive.

---

### I3 — `find()` inside JSX render in `tracker-app.js` colour rail

**Location:** [tracker-app.js:549](../../tracker-app.js#L549),
[tracker-app.js:552](../../tracker-app.js#L552). For each rendered thread row
the JSX scans the whole `pal` for a solid + a blend match. Lift out via a
`Map<id, entry>` (one-time cost per palette change).

---

### I3 — `manager-app.js` lookups should use `getDmcById`

**Location:** [manager-app.js:1617](../../manager-app.js#L1617),
[manager-app.js:1731](../../manager-app.js#L1731),
[manager-app.js:1741](../../manager-app.js#L1741).

There are already guards (`typeof getDmcByIdCI === 'function'`) but the
`DMC.find(...)` fallbacks remain reachable in old script-load orderings. Drop
the fallbacks since helpers.js loads before manager-app.js in
[manager.html](../../manager.html). Per-call O(500) → O(1).

---

### I3 — Heavy regex on extracted PDF text

**Location:** [pdf-importer.js](../../pdf-importer.js) parses `pa.points` and
runs token-level regex over multi-page extracted text. Not directly measured
in this audit but flagged: PDF imports already happen off the React render
loop, so this is I3 unless a user-reported lag exists.

**Measurement:** profile import of `TestUploads/Books and Blossoms.pdf` (8 MB)
end-to-end. If parsing >2 s, escalate to I1.

---

### I3 — `findBest.precomputeBlends` is O(palette²)

**Location:** [colour-utils.js:39](../../colour-utils.js#L39). For a 200-thread
allowed palette this is 19 900 entries. Already memoised per palette identity
via `findBest._blendPalette`, so usually fine. Verify generate-worker doesn't
re-precompute on every tile of a large pattern.

**Measurement:** add `console.time('precomputeBlends')` in
[generate-worker.js](../../generate-worker.js); ensure it logs once per
generate, not per pixel/tile.

---

### I4 — Hygiene

- [sync-engine.js:111](../../sync-engine.js#L111) — `JSON.stringify(project.bsLines)`
  for hashing. For long backstitch lists this is non-trivial. Use a fast hash
  over the array directly.
- [stats-activity.js:184](../../stats-activity.js#L184) — `Object.entries(days).sort(...localeCompare...)`
  on ISO dates. `localeCompare` is much slower than `<`/`>` for ASCII strings;
  swap to numeric / lexicographic compare.
- [stats-activity.js:178](../../stats-activity.js#L178) — `Object.values(map).sort().slice(0,5)`
  could use a partial-sort (insertion into 5-slot heap) for large maps; rare
  in practice (top-N projects).
- [creator/zipBundle.js:215](../../creator/zipBundle.js#L215) — `JSON.stringify`
  the full project to embed in the bundle export. Already off the hot interaction
  path (user-initiated export), but worth knowing.

---

## Items investigated and ruled out

- **DMC / Anchor lookup tables.** Already memoised. `helpers.js` builds
  `_DMC_BY_ID` and `_DMC_BY_ID_CI` lazily on first call
  ([helpers.js:88-115](../../helpers.js#L88-L115)). `ANCHOR` similarly via
  `_getAnchorById`. No per-call rebuild. `ANCHOR` itself runs `rgbToLab` once at
  module load ([anchor-data.js:742](../../anchor-data.js#L742)).
- **k-means in `quantize`.** Already optimised: pre-allocated `px[]`, reusable
  `Float64Array` sums, exact-match early exit in `findSolid`
  ([colour-utils.js:1](../../colour-utils.js#L1) — see existing `PERF (perf-1...)`
  comments).
- **`doDither` second-best lookup.** Already short-circuited via id-map
  ([colour-utils.js:165-200](../../colour-utils.js#L165-L200)).
- **Workers.** `embroidery.js` heavy path (bilateral, canny, saliency) already
  runs in [generate-worker.js](../../generate-worker.js) and
  [analysis-worker.js](../../analysis-worker.js). No main-thread duplication
  was observed.
- **`tracker-app.js` deepClone.** Already prefers `structuredClone`
  ([tracker-app.js:8](../../tracker-app.js#L8)).
- **String concat in OXS export / import.** Already uses `lines.join('\n')`
  ([creator/zipBundle.js:166](../../creator/zipBundle.js#L166)) and DOMParser
  for OXS read ([import-formats.js:103](../../import-formats.js#L103)).

