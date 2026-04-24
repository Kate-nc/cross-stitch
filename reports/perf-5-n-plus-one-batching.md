# Performance Report: N+1 and Batching Opportunities

## Summary
This audit identifies high-priority N+1 patterns and batching inefficiencies in client-side IndexedDB operations across the Cross Stitch Pattern Generator. Sequential async calls inside loops create unnecessary latency spikes, especially as project counts and pattern libraries grow.

---

## Issues (Prioritized)

### 🔴 1. `sync-engine.js` `exportSync()` — sequential `ProjectStorage.get()` per project
**File/Lines:** [sync-engine.js](sync-engine.js#L155) — Lines 155–160

```javascript
for (var i = 0; i < metaList.length; i++) {
  var full = await ProjectStorage.get(metaList[i].id);  // sequential
  if (full) allProjects.push(full);
}
```
**Why it hurts:** With 50 projects × ~20ms get(), exports take 1000ms+; user sees a hang.
**Fix:** `var allProjects = (await Promise.all(metaList.map(m => ProjectStorage.get(m.id)))).filter(Boolean);`

---

### 🔴 2. `sync-engine.js` import `prepareImport()` — sequential get() for local map
**File/Lines:** [sync-engine.js](sync-engine.js#L555) — Lines 555–562
**Fix:** `Promise.all` then `Object.fromEntries`.

---

### 🔴 3. `stash-bridge.js` `getProjectsUsingThread()` — sequential get() inside nested query
**File/Lines:** [stash-bridge.js](stash-bridge.js#L240) — Lines 240–250
**Why it hurts:** Thread-deletion UI hangs while scanning all projects. ~2s for 100 projects.
**Fix:** `Promise.all(allMeta.map(m => ProjectStorage.get(m.id)))` then iterate.

---

### 🔴 4. `stash-bridge.js` `getAcquisitionTimeseries()` — sequential get() in usage loop
**File/Lines:** [stash-bridge.js](stash-bridge.js#L595) — Lines 595–605
**Fix:** Same `Promise.all` batching pattern.

---

### 🔴 5. `manager-app.js` `addUnlinkedPatterns()` — sequential get() for pattern reconciliation
**File/Lines:** [manager-app.js](manager-app.js#L195) — Lines 195–210
**Fix:** Batch with `Promise.all`.

---

### 🟡 6. `stats-activity.js` `loadStitchData()` — sequential get() for activity timeline
**File/Lines:** [stats-activity.js](stats-activity.js#L40) — Lines 40–55
**Fix:** Batch fetch.

---

### 🟡 7. `stats-page.js` `loadProjectStats()` — multiple sequential get() in colour/conflict scans (3×)
**File/Lines:** [stats-page.js](stats-page.js#L938), [stats-page.js](stats-page.js#L991), [stats-page.js](stats-page.js#L1050)
**Fix:** Load all projects once, then compute all three stats in a single fused pass.

---

### 🟡 8. `openManagerDB()` not cached (unlike `getDB()`)
**File/Lines:** [stash-bridge.js](stash-bridge.js#L143) — Lines 143–160 (12+ call sites)
**Why it hurts:** Each call re-opens IndexedDB; ~5ms overhead × 12 = ~60ms per stash op.
**Fix:** Cache the open db handle; invalidate on `versionchange` event.

---

### 🟡 9. `stash-bridge.js` `addToStash()` — separate read + write opens DB twice
**File/Lines:** [stash-bridge.js](stash-bridge.js#L545) — Lines 545–585
**Fix:** Merge into one transaction.

---

### 🟢 10. `backup-restore.js` `restore()` — sequential `put()` inside open transaction
**File/Lines:** [backup-restore.js](backup-restore.js#L230) — Lines 230–245
**Note:** Already inside one transaction; marginal gain only.
