# Perf Audit 2 — Redundant / repeated computation

12 issues. Quick wins: memoise `colourDoneCounts` by content hash; LRU cache `dE2000` intermediates; cache `precomputeBlends` by palette hash; `useMemo` for `filteredThreads`/`lowStockAlerts`.

---

## 1. precomputeBlends cache reset on every dither 🔴
**File:** colour-utils.js (lines 30–47)
**Problem:** Reference-equality cache key. Any palette re-sort triggers full O(n²) blend recomputation.
**Impact:** 10–20ms per dither.
**Fix:** Cache by palette signature (sorted ID hash).

## 2. buildCodepointMap rebuilt per PDF export 🔴
**File:** creator/pdfChartLayout.js (lines 191–210), pdf-export-worker.js (line 185)
**Problem:** No cache; rebuilt every export.
**Impact:** 2–5ms per export.
**Fix:** Cache by palette hash.

## 3. colourDoneCounts recomputed on every render 🔴
**File:** creator/useCreatorState.js (~lines 1200), tracker-app.js (~615)
**Problem:** `useMemo([pat, done])` busts on array-reference change even when content identical.
**Impact:** 15–40ms per render after generation.
**Fix:** Stable signature or incremental updates.

## 4. DMC palette linear scan in findSolid — no LRU 🔴
**File:** colour-utils.js
**Problem:** ~436 palette × 6,400 px = 2.8M dE calls per 80×80 dither.
**Impact:** 200–400ms per generation.
**Fix:** LRU cache keyed on quantized Lab (2-decimal bin).

## 5. LegendTab.rows recomputes on any stash ref change 🟡
**File:** creator/LegendTab.js (~30–50)
**Fix:** Slice dependency to relevant thread IDs only.

## 6. Tracker doneCount/progressPct recount per render 🟡
**File:** tracker-app.js (~615)
**Fix:** Incremental counter; useMemo([done]).

## 7. filteredThreads & lowStockAlerts not memoised 🟡
**File:** manager-app.js (~600, ~444)
**Fix:** `useMemo` with explicit deps.

## 8. Object.values/keys reductions on threads dict per render 🟡
**File:** manager-app.js (~816)
**Fix:** Memoise aggregates.

## 9. findSimilarDmc full DMC scan per hover 🟡
**File:** palette-swap.js (~686)
**Fix:** LRU keyed on quantized Lab.

## 10. command-palette: action/project list rebuilt per keystroke 🟡
**File:** command-palette.js (~181–250)
**Fix:** Memoise static set; `.slice(0,20)` early.

## 11. ExportTab style spreads per render 🟡
**File:** creator/ExportTab.js (~14–24)
**Fix:** Pre-compute variants at module scope.

## 12. localStorage access in lazy initialisers 🟢
**File:** creator/useCreatorState.js (~1320)
**Fix:** Module-scope cache loaded once.
