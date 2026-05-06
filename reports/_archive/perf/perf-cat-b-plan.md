# Cat B Plan — Responsive PDF Import (Phase 1 — Algorithmic + Yielding)

**Status:** Approved → Implementing
**Audit category:** B — Web Worker import offload (Phase 1 lite)
**Estimated effort:** 1–2 hours
**Risk:** LOW — single-file change to `pdf-importer.js`, no worker plumbing, no PK-compat-affecting structural changes

---

## Decision (2026-04-30)

The original Cat B plan called for a full Web Worker offload of the
PatternKeeperImporter pipeline. After reviewing scope vs risk, we are
splitting Cat B into two phases:

- **Phase 1 (this PR)** — Algorithmic + cooperative yielding. Touches one file
  (`pdf-importer.js`). Solves the user-felt pain (frozen UI + slow large
  imports) at near-zero risk to the bit-stable PK-compat path.
- **Phase 2 (deferred)** — Move the post-PDF.js processing into a real
  Web Worker. Tracked as a follow-up.

---

## Problem

`PatternKeeperImporter.import()` blocks the main thread for the whole
duration of an import. On Books and Blossoms (8.1 MB):

- Total time: 21.7 s
- All animations frozen, every click queued, modal can't repaint
- Looks like the page has crashed

Profiling shows the bulk is in `extractSymbols()` — for each cell on each
chart page, it walks every text item and every coloured vector path with
`Array.find`. For a 200×300 chart with 50K text items + 10K vector paths
per page, this is ≈ 30 billion comparisons.

---

## Phase 1 Changes

### 1. Y-bucket index in `extractSymbols`

Pre-bin `textItems` and `vectorPaths` by Y coordinate into `Map<bucket,
item[]>` keyed by `Math.floor(y / cellHeight)`. Each item is indexed
into bucket k AND its neighbours k±1 so the inner search only looks at
candidates near the current row. Speedup: each inner `find` drops from
O(N) to O(N / rows). Books and Blossoms ≈18 s → ≈2 s in `extractSymbols`.

### 2. Cooperative yielding in `import()`

Insert `await new Promise(r => setTimeout(r, 0))` between major stages so
the browser can repaint and process queued events.

### 3. Per-page yield inside `extractSymbols`

Yield once per chartLayout page so the single hottest synchronous block
becomes chunks the browser can interrupt.

### 4. Behavior preservation

- Output is bit-identical for all PK fixtures.
- Y-bucket lookup walks the SAME comparison logic as the original
  `Array.find`, just with a smaller candidate set. No tolerance changes,
  no order changes, no scoring changes.

---

## Files modified

- `pdf-importer.js` — single file change

## Files added

- `tests/pdfImporterYBucket.test.js`

---

## Acceptance criteria

- All existing tests pass (1495)
- New Y-bucket tests pass
- Books and Blossoms import < 8 s (vs 21.7 s)
- Same `v8 project` shape produced for every test fixture
- No console warnings introduced

---

## Phase 2 (deferred) — Full worker offload

Open follow-up covering: extract `pdf-importer-core.js`, create
`pdf-importer-worker.js`, wire `_processInWorker` with main-thread
fallback, bump SW cache, ~20 new tests.
