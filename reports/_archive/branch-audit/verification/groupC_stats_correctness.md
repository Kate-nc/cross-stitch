# Phase 1 Verification — Group C: Stats Correctness Sweep

**Commits** (chronological): `7575577` (SABLE/stash-age), `be2e2b6` (statsSessions fallback), `e9342bb` (swatch colour), `ee6bf97` (buildStatsSummary palette), `e54d5c1` (split blends), `5b2ebff` (split blends in 3 more sites).

## 1.1 Intended behaviour

Six-commit sweep that fixes silent statistical inaccuracies introduced when (a) Creator-generated projects don't populate `proj.palette`, (b) older projects don't populate `proj.stitchLog`, (c) blend ids like `'310+550'` were treated as a single thread. After the sweep:
- Stats dashboard shows accurate swatches and counts for Creator projects.
- Lifetime stitches/recent activity work for projects last saved before `stitchLog` derivation existed.
- "Highest-impact wishlist threads", "Use what you have", "Threads not used", "Low-stock needed" all correctly account for both blend components.
- Manager thread edits properly stamp V3 acquisition fields so SABLE timeseries and stash-age distribution include them.
- V3 schema migration emits `cs:stashChanged` after the IDB transaction so an already-loaded Manager doesn't auto-save stale state back over the migrated fields.

## 1.2 Code-path traces

See subagent report for full per-commit detail. Key sites:

- `project-storage.js`:
  - `buildStatsSummary` ([L65–88](project-storage.js#L65)) — derives palette from cells when absent
  - `getMostUsedColours` ([L757–845](project-storage.js#L757)) — palette + statsSessions fallback + blend split
  - `getLifetimeStitches` ([L660–676](project-storage.js#L660)) — statsSessions fallback
  - `getStitchLogByDay` ([L679–716](project-storage.js#L679)) — statsSessions fallback
- `stash-bridge.js`:
  - `getAcquisitionTimeseries` — statsSessions fallback for "used" series
  - `migrateSchemaToV3` ([L161–210](stash-bridge.js#L161)) — dispatch `cs:stashChanged` in `tx.oncomplete`
- `manager-app.js`:
  - `updateThread` ([L645–710](manager-app.js#L645)) — V3 acquisition + history fields on first ownership / on every delta
- `stats-page.js`:
  - `richProjects` palette Set — split blend ids; `palLen = palette.size` of bare ids
  - `buyingImpact` — expand blended threads to both components
  - `neverUsedData` / `useWhatYouHaveRecs` — split blend ids
  - `lowStockNeeded` — subagent could not find a function literally named `lowStockNeeded`; commit `5b2ebff`'s message lists it but the diff actually touches `stats-page.js` blend-split sites elsewhere. See DEFECT-013.

## 1.3 Implementation check

| Aspect | Verdict |
|---|---|
| Palette derivation in `buildStatsSummary` for Creator projects | ✅ IMPLEMENTED — scans cells, dedupes by id, blend-component placeholder `[128,128,128]`. |
| Palette derivation in `getMostUsedColours` for Creator projects | ✅ IMPLEMENTED |
| `statsSessions` fallback in 4 readers | ✅ IMPLEMENTED |
| Blend-id splitting in 6 sites | ✅ IMPLEMENTED — `splitBlendId` from helpers.js handles N≥2 components. |
| `manager.updateThread` V3 fields mirror `StashBridge.updateThreadOwned` | ✅ IMPLEMENTED |
| `migrateSchemaToV3` dispatches event | ✅ IMPLEMENTED — inside `tx.oncomplete`. |
| `lowStockNeeded` function exists / split applied | 🔍 UNVERIFIABLE — name not present in codebase; might be in a different commit or the message names a concept rather than a literal symbol. See DEFECT-013. |
| Test for any of the above | ❌ MISSING — none added. |

## 1.4 Failure modes

| Mode | Verdict |
|---|---|
| `proj.pattern` missing entirely | ✅ HANDLED — early returns at multiple sites (`if (!p.pattern) ...`). |
| `__skip__` / `__empty__` cells | ✅ HANDLED — explicitly filtered in palette derivation. |
| 3+ component blends (`'310+550+666'`) | ✅ HANDLED — `splitBlendId` splits on `+` and works for any N. |
| `[128,128,128]` placeholder rendered as actual grey | ⚠️ RISKY but acceptable — current consumers (`insights-engine.js`, `stats-insights.js`) use palette for set membership/count, not for swatch rendering. If a future view renders blend-component swatches, they'll look identical to other "missing" entries. |
| `getAcquisitionTimeseries` "used" fallback bucketing mismatch | ✅ SAFE — both paths use the same date format. |
| `migrateSchemaToV3` re-runs in a loop | ✅ SAFE — schema-version guard + `_migrationDone` flag. |
| Manager auto-save races migration dispatch | ⚠️ IMPLICITLY HANDLED — auto-save is debounced; the dispatch fires inside `tx.oncomplete` before any post-migration state could be re-read. Window is small but not zero. |
| `updateThread` decrement to 0 then re-increment | ✅ HANDLED — V3 history tracks every delta; re-acquisition logic only triggers when `addedAt === LEGACY_EP`. |
| Performance of cell-scan in `buildStatsSummary` for 200×200 patterns | ⚠️ RISKY — O(n) per save; ≈40k cells. Acceptable for typical use; could be a concern for heavy users with many large projects. |
| `buyingImpact` double-counts a blend's components when both owned | ✅ HANDLED — owned-check skips that component before tally. |

## 1.5 Regression check

| Risk | Verdict |
|---|---|
| `richProjects.palette` shape change (now bare ids) breaks `calcDifficulty` | ✅ SAFE — `calcDifficulty` expects bare-id count + blendCount separately, which is exactly what `richProjects` now provides. |
| Other readers of `proj.stitchLog` not updated | ✅ SAFE — subagent grep confirmed all primary readers in `project-storage.js`, `stats-activity.js`, `tracker-app.js` have either fallbacks or derive at write time. |
| `proj.palette` derivation accidentally written back to disk | ✅ SAFE — derivation result is in-memory only; not assigned to `proj.palette`. |
| Migration dispatch causes loop | ✅ SAFE |

**Group verdict**: Six clean fixes; one untraceable name (`lowStockNeeded`) and one PARTIAL (placeholder grey is acceptable but tech debt).
