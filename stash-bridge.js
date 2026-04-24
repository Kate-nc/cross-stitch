// stash-bridge.js
// Reads the global stash from stitch_manager_db without depending on manager-app.js state.
// Shared read layer used by Creator, Tracker, and Stash Manager pages.

const StashBridge = (() => {
  // Normalise a bare DMC id like '310' to the composite key 'dmc:310'.
  // Composite keys already containing ':' are returned unchanged.
  function _normaliseKey(keyOrId) {
    if (typeof keyOrId !== 'string') keyOrId = String(keyOrId);
    return keyOrId.indexOf(':') < 0 ? 'dmc:' + keyOrId : keyOrId;
  }

  function _getOwnedCount(threadsData, key, fallbackId) {
    var entry = threadsData[key];
    var byKey = (entry && typeof entry === 'object' && typeof entry.owned === 'number') ? entry.owned : 0;
    if (byKey > 0) return byKey;
    var fallback = threadsData[fallbackId];
    return (fallback && typeof fallback === 'object' && typeof fallback.owned === 'number') ? fallback.owned : 0;
  }

  function _parseThreadKey(key) {
    if (key.indexOf(':') < 0) return { brand: 'dmc', id: key };
    const parts = key.split(':');
    const brand = parts[0];
    const id = parts.slice(1).join(':');
    if (!id) return { brand: 'dmc', id: key };
    return { brand: brand, id: id };
  }

  function _getThreadInfoByKey(key) {
    if (typeof getThreadByKey === "function") return getThreadByKey(key);
    const parsed = _parseThreadKey(key);
    if (parsed.brand === "anchor") {
      return typeof ANCHOR !== "undefined" ? ANCHOR.find(x => x.id === parsed.id) : null;
    }
    return typeof DMC !== "undefined" ? DMC.find(x => x.id === parsed.id) : null;
  }

  let _migrationDone = false;
  // Schema version tracked in stash data. V2 = composite keys, V3 = addedAt/history fields.
  let _schemaVersion = 0;

  // Legacy epoch: used for stash entries that existed before tracking was added.
  // Deliberately set to a fixed past date so the UI can show 'before tracking'
  // rather than misleadingly showing 'added today' on the migration date.
  const LEGACY_EPOCH = '2020-01-01T00:00:00Z';

  // One-time migration: converts legacy bare DMC keys (e.g. "310") in the
  // "threads" store to composite keys (e.g. "dmc:310").
  async function migrateSchemaToV2() {
    if (_migrationDone) return;
    try {
      const db = await openManagerDB();
      await new Promise((resolve, reject) => {
        const tx = db.transaction("manager_state", "readwrite");
        const store = tx.objectStore("manager_state");
        const req = store.get("threads");
        req.onsuccess = () => {
          const threads = req.result || {};
          let changed = false;
          const migrated = {};
          for (const [key, val] of Object.entries(threads)) {
            if (key.indexOf(':') < 0) {
              migrated['dmc:' + key] = val;
              changed = true;
            } else {
              migrated[key] = val;
            }
          }
          if (changed) {
            store.put(migrated, "threads");
            tx.oncomplete = () => { _migrationDone = true; resolve(); };
            tx.onerror = () => reject(tx.error);
          } else {
            _migrationDone = true;
            resolve();
          }
        };
        req.onerror = () => reject(req.error);
      });
    } catch (e) {
      console.warn('StashBridge: schema migration failed', e);
    }
  }

  // V3 migration: adds addedAt, lastAdjustedAt, acquisitionSource, history to every stash entry.
  // Must run after V2 migration completes.
  async function migrateSchemaToV3() {
    try {
      const db = await openManagerDB();
      const sv = await new Promise((resolve, reject) => {
        const tx = db.transaction("manager_state", "readonly");
        const req = tx.objectStore("manager_state").get("schema_version");
        req.onsuccess = () => resolve(req.result || 0);
        req.onerror = () => resolve(0);
      });
      if (sv >= 3) { _schemaVersion = sv; return; }

      await new Promise((resolve, reject) => {
        const tx = db.transaction("manager_state", "readwrite");
        const store = tx.objectStore("manager_state");
        const req = store.get("threads");
        req.onsuccess = () => {
          const threads = req.result || {};
          for (const [key, entry] of Object.entries(threads)) {
            if (!entry.addedAt) {
              entry.addedAt = LEGACY_EPOCH;
              entry.lastAdjustedAt = LEGACY_EPOCH;
              entry.acquisitionSource = 'legacy';
              entry.history = [];
            }
          }
          store.put(threads, "threads");
          store.put(3, "schema_version");
          tx.oncomplete = () => {
            _schemaVersion = 3;
            console.log('Schema migrated to v3');
            resolve();
          };
          tx.onerror = () => reject(tx.error);
        };
        req.onerror = () => reject(req.error);
      });
    } catch (e) {
      console.warn('StashBridge: v3 migration failed', e);
    }
  }

  function openManagerDB() {
    return new Promise((resolve, reject) => {
      if (typeof ensurePersistence === 'function') ensurePersistence();
      const req = indexedDB.open("stitch_manager_db", 1);
      req.onupgradeneeded = (e) => {
        const db = e.target.result;
        if (!db.objectStoreNames.contains("manager_state")) {
          db.createObjectStore("manager_state");
        }
      };
      req.onsuccess = (e) => resolve(e.target.result);
      req.onerror = (e) => reject(e.target.error);
    });
  }

  return {
    migrateSchemaToV2,

    // Returns { [compositeKey]: { owned: number, tobuy: bool, partialStatus: string|null } }
    async getGlobalStash() {
      await migrateSchemaToV2();
      try {
        const db = await openManagerDB();
        return new Promise((resolve, reject) => {
          const tx = db.transaction("manager_state", "readonly");
          const store = tx.objectStore("manager_state");
          const req = store.get("threads");
          req.onsuccess = () => resolve(req.result || {});
          req.onerror = () => reject(req.error);
        });
      } catch (e) {
        console.error("StashBridge.getGlobalStash failed:", e);
        return {};
      }
    },

    // Returns threads filtered by brand from the composite-keyed stash.
    // brand: 'dmc' | 'anchor' | undefined (all)
    async getStashByBrand(brand) {
      const all = await StashBridge.getGlobalStash();
      if (!brand) return all;
      const result = {};
      for (const [key, val] of Object.entries(all)) {
        const colon = key.indexOf(':');
        const keyBrand = colon < 0 ? 'dmc' : key.slice(0, colon);
        if (keyBrand === brand) result[key] = val;
      }
      return result;
    },

    // Updates a single thread's owned count in the global stash.
    // Accepts composite keys ('dmc:310') or bare legacy IDs ('310').
    // Tracks history of owned-count changes for stats.
    async updateThreadOwned(dmcId, newCount) {
      const key = _normaliseKey(dmcId);
      try {
        const db = await openManagerDB();
        return new Promise((resolve, reject) => {
          const tx = db.transaction("manager_state", "readwrite");
          const store = tx.objectStore("manager_state");
          const req = store.get("threads");
          req.onsuccess = () => {
            const threads = req.result || {};
            const isV3 = _schemaVersion >= 3;
            if (!threads[key]) {
              threads[key] = { owned: 0, tobuy: false, partialStatus: null };
              if (isV3) {
                threads[key].addedAt = new Date().toISOString();
                threads[key].lastAdjustedAt = null;
                threads[key].acquisitionSource = null;
                threads[key].history = [];
              }
            } else if (isV3) {
              if (threads[key].addedAt === undefined) threads[key].addedAt = new Date().toISOString();
              if (threads[key].lastAdjustedAt === undefined) threads[key].lastAdjustedAt = null;
              if (threads[key].acquisitionSource === undefined) threads[key].acquisitionSource = null;
              if (!Array.isArray(threads[key].history)) threads[key].history = [];
            }
            const oldCount = threads[key].owned || 0;
            const delta = newCount - oldCount;
            threads[key].owned = newCount;
            // V3 history tracking
            if (delta !== 0 && isV3) {
              const now = new Date().toISOString();
              threads[key].lastAdjustedAt = now;
              if (!Array.isArray(threads[key].history)) threads[key].history = [];
              threads[key].history.push({ date: now, delta: delta });
              // Cap history at 500 entries per thread
              if (threads[key].history.length > 500) {
                threads[key].history = threads[key].history.slice(threads[key].history.length - 500);
              }
            }
            store.put(threads, "threads");
            tx.oncomplete = () => {
              if (typeof invalidateStatsCache === 'function') invalidateStatsCache();
              resolve();
            };
          };
          req.onerror = () => reject(req.error);
        });
      } catch (e) {
        console.error("StashBridge.updateThreadOwned failed:", e);
      }
    },

    // Returns array of projects that use a given DMC thread ID
    // Scans ProjectStorage metadata + manager pattern library
    async getProjectsUsingThread(dmcId) {
      const projects = [];
      // 1. Check ProjectStorage (generated patterns from Creator/Tracker)
      try {
        const allMeta = await ProjectStorage.listProjects();
        for (const meta of allMeta) {
          const full = await ProjectStorage.get(meta.id);
          if (!full || !full.pattern) continue;
          const uses = full.pattern.some(cell =>
            cell && cell.id === dmcId
          );
          if (uses) projects.push({
            source: "project",
            id: meta.id,
            name: meta.name,
            type: "generated"
          });
        }
      } catch (e) { /* ProjectStorage may not be loaded */ }
      // 2. Check manager pattern library
      try {
        const db = await openManagerDB();
        const patterns = await new Promise((resolve, reject) => {
          const tx = db.transaction("manager_state", "readonly");
          const req = tx.objectStore("manager_state").get("patterns");
          req.onsuccess = () => resolve(req.result || []);
          req.onerror = () => reject(req.error);
        });
        for (const pat of patterns) {
          if (pat.threads && pat.threads.some(t => t.id === dmcId)) {
            projects.push({
              source: "library",
              id: pat.id,
              name: pat.title,
              type: "manual"
            });
          }
        }
      } catch (e) { /* silent */ }
      return projects;
    },

    // Syncs a generated project's thread requirements into the manager's pattern library.
    // Called after pattern generation and on project save.
    // skeinData: array of { id, name, stitches, skeins, rgb }
    // fabricCt: the project's fabric count (e.g. 14, 18, 28) — stored so conflict
    //           detection can convert stitches to skeins using the correct count.
    async syncProjectToLibrary(projectId, projectName, skeinData, status, fabricCt) {
      try {
        const db = await openManagerDB();
        return new Promise((resolve, reject) => {
          const tx = db.transaction("manager_state", "readwrite");
          const store = tx.objectStore("manager_state");
          const req = store.get("patterns");
          req.onsuccess = () => {
            const patterns = req.result || [];
            const existingIdx = patterns.findIndex(p => p.linkedProjectId === projectId);
            const existing = existingIdx >= 0 ? patterns[existingIdx] : null;
            const entry = {
              id: existing ? existing.id : Date.now().toString(),
              linkedProjectId: projectId,
              title: projectName,
              // Preserve user-edited designer and tags; only set defaults for new entries.
              designer: existing ? existing.designer : "",
              status: status || (existing ? existing.status : "inprogress"),
              tags: existing ? existing.tags : ["auto-synced"],
              fabricCt: fabricCt || 14,
              threads: skeinData.map(d => ({
                id: d.id,
                name: d.name,
                qty: d.stitches,
                unit: "stitches",
                brand: "DMC"
              }))
            };
            if (existingIdx >= 0) patterns[existingIdx] = entry;
            else patterns.push(entry);
            store.put(patterns, "patterns");
            tx.oncomplete = () => resolve();
          };
          req.onerror = () => reject(req.error);
        });
      } catch (e) {
        console.error("StashBridge.syncProjectToLibrary failed:", e);
      }
    },

    // Brief D — remove the auto-synced pattern library entry linked to a deleted project.
    // No-op when nothing is linked. Safe to call on every project delete.
    async unlinkProjectFromLibrary(projectId) {
      try {
        const db = await openManagerDB();
        return new Promise((resolve, reject) => {
          const tx = db.transaction("manager_state", "readwrite");
          const store = tx.objectStore("manager_state");
          const req = store.get("patterns");
          req.onsuccess = () => {
            const patterns = req.result || [];
            const filtered = patterns.filter(p => p.linkedProjectId !== projectId);
            if (filtered.length !== patterns.length) {
              store.put(filtered, "patterns");
            }
            tx.oncomplete = () => resolve();
          };
          req.onerror = () => reject(req.error);
        });
      } catch (e) {
        console.error("StashBridge.unlinkProjectFromLibrary failed:", e);
      }
    },

    // Detects conflicts: threads where total demand across active patterns > owned supply.
    // Returns [ { id, name, rgb, owned, totalNeeded, patterns: [{title, qty}] } ]
    async detectConflicts() {
      try {
        const db = await openManagerDB();
        const tx = db.transaction("manager_state", "readonly");
        const store = tx.objectStore("manager_state");
        const [threadsData, patternsData] = await Promise.all([
          new Promise((r, j) => { const q = store.get("threads"); q.onsuccess = () => r(q.result || {}); q.onerror = () => j(q.error); }),
          new Promise((r, j) => { const q = store.get("patterns"); q.onsuccess = () => r(q.result || []); q.onerror = () => j(q.error); })
        ]);
        // Only consider active patterns (owned, inprogress, wishlist — exclude completed)
        const active = patternsData.filter(p => p.status !== "completed");
        const demand = {}; // { threadKey: { total, patterns: [{title, qty}] } }
        for (const pat of active) {
          if (!pat.threads) continue;
          const fc = pat.fabricCt || 14;
          for (const t of pat.threads) {
            const key = _normaliseKey(t.id);
            if (!demand[key]) demand[key] = { total: 0, patterns: [] };
            const skeins = t.unit === "stitches" ? (typeof skeinEst === "function" ? skeinEst(t.qty, fc) : Math.ceil(t.qty / 200)) : t.qty;
            demand[key].total += skeins;
            demand[key].patterns.push({ title: pat.title, qty: skeins });
          }
        }
        const conflicts = [];
        for (const [key, d] of Object.entries(demand)) {
          const parsed = _parseThreadKey(key);
          const brand = parsed.brand;
          const id = parsed.id;
          const owned = _getOwnedCount(threadsData, key, id);
          if (d.total > owned) {
            const info = _getThreadInfoByKey(key);
            conflicts.push({ key, brand, id, name: info ? info.name : id, rgb: info ? info.rgb : [128,128,128], owned, totalNeeded: d.total, deficit: d.total - owned, patterns: d.patterns });
          }
        }
        conflicts.sort((a, b) => b.deficit - a.deficit);
        return conflicts;
      } catch (e) {
        console.error("StashBridge.detectConflicts failed:", e);
        return [];
      }
    },

    // Returns patterns you can fully start with your current stash.
    // Each result: { id, title, status, totalThreads, coveredThreads, missing }
    async whatCanIStart() {
      try {
        const db = await openManagerDB();
        const tx = db.transaction("manager_state", "readonly");
        const store = tx.objectStore("manager_state");
        const [threadsData, patternsData] = await Promise.all([
          new Promise((r, j) => { const q = store.get("threads"); q.onsuccess = () => r(q.result || {}); q.onerror = () => j(q.error); }),
          new Promise((r, j) => { const q = store.get("patterns"); q.onsuccess = () => r(q.result || []); q.onerror = () => j(q.error); })
        ]);
        const notStarted = patternsData.filter(p => p.status !== "completed" && p.status !== "inprogress");
        const results = [];
        for (const pat of notStarted) {
          if (!pat.threads || pat.threads.length === 0) continue;
          const fc = pat.fabricCt || 14;
          let covered = 0, missing = [];
          for (const t of pat.threads) {
            const skeins = t.unit === "stitches" ? (typeof skeinEst === "function" ? skeinEst(t.qty, fc) : Math.ceil(t.qty / 200)) : t.qty;
            const key = _normaliseKey(t.id);
            const owned = _getOwnedCount(threadsData, key, t.id);
            if (owned >= skeins) covered++;
            else missing.push({ id: t.id, name: t.name, need: skeins, have: owned });
          }
          results.push({ id: pat.id, title: pat.title, status: pat.status, totalThreads: pat.threads.length, coveredThreads: covered, missing, pct: Math.round(covered / pat.threads.length * 100) });
        }
        results.sort((a, b) => b.pct - a.pct);
        return results;
      } catch (e) {
        console.error("StashBridge.whatCanIStart failed:", e);
        return [];
      }
    },

    // Add a thread to the stash (increment owned count, default +1).
    // Accepts composite keys ('dmc:310') or bare legacy IDs ('310').
    // options.acquisitionSource: 'purchased' | 'inherited' | 'gifted' | 'swapped' | 'unknown'
    // Returns a Promise resolving to the new owned count.
    async addToStash(id, count, options) {
      const key = _normaliseKey(id);
      const increment = count == null ? 1 : Number(count);
      if (!Number.isFinite(increment) || !Number.isInteger(increment) || increment < 1) {
        throw new Error("addToStash count must be a finite integer greater than or equal to 1");
      }
      // Ensure new entries get V3 fields before updateThreadOwned runs
      const stash = await StashBridge.getGlobalStash();
      const current = (stash[key] && stash[key].owned) || 0;
      const isNew = !stash[key] || current === 0;
      if (isNew && _schemaVersion >= 3) {
        // Pre-create with V3 fields so updateThreadOwned's history append works
        try {
          const db = await openManagerDB();
          await new Promise((resolve, reject) => {
            const tx = db.transaction("manager_state", "readwrite");
            const store = tx.objectStore("manager_state");
            const req = store.get("threads");
            req.onsuccess = () => {
              const threads = req.result || {};
              const now = new Date().toISOString();
              const src = (options && options.acquisitionSource) || 'purchased';
              if (!threads[key]) {
                threads[key] = { owned: 0, tobuy: false, partialStatus: null,
                  addedAt: now, lastAdjustedAt: now, acquisitionSource: src, history: [] };
              } else if (!threads[key].addedAt) {
                threads[key].addedAt = now;
                threads[key].lastAdjustedAt = now;
                threads[key].acquisitionSource = src;
                threads[key].history = threads[key].history || [];
              }
              store.put(threads, "threads");
              tx.oncomplete = () => resolve();
            };
            req.onerror = () => reject(req.error);
          });
        } catch (e) { /* best effort */ }
      }
      const next = current + increment;
      await StashBridge.updateThreadOwned(key, next);
      return next;
    },

    // Finds similar threads to a given thread key from your owned stash.
    // threadKeyOrId: composite key ('dmc:310') or bare DMC id ('310').
    // Compares using CIEDE2000 (dE2000) when available, falls back to dE.
    // Searches across all owned brands (DMC + Anchor).
    suggestAlternatives(threadKeyOrId, maxResults = 5, ownedThreads = {}) {
      const normKey = _normaliseKey(threadKeyOrId);
      const colon = normKey.indexOf(':');
      const srcBrand = colon < 0 ? 'dmc' : normKey.slice(0, colon);
      const srcId = colon < 0 ? normKey : normKey.slice(colon + 1);
      // Resolve source thread
      const target = (typeof findThreadInCatalog === 'function')
        ? findThreadInCatalog(srcBrand, srcId)
        : null;
      if (!target || typeof rgbToLab !== 'function') return [];
      const targetLab = target.lab || rgbToLab(target.rgb[0], target.rgb[1], target.rgb[2]);
      const distFn = typeof dE2000 === 'function' ? dE2000 : (typeof dE === 'function' ? dE : null);
      if (!distFn) return [];
      const candidates = [];
      for (const [key, state] of Object.entries(ownedThreads)) {
        if (key === normKey || !state.owned || state.owned <= 0) continue;
        const c2 = key.indexOf(':');
        const brand = c2 < 0 ? 'dmc' : key.slice(0, c2);
        const id = c2 < 0 ? key : key.slice(c2 + 1);
        const info = (typeof findThreadInCatalog === 'function') ? findThreadInCatalog(brand, id) : null;
        if (!info) continue;
        const lab = info.lab || rgbToLab(info.rgb[0], info.rgb[1], info.rgb[2]);
        const dist = distFn(targetLab, lab);
        candidates.push({ key, brand, id, name: info.name, rgb: info.rgb, owned: state.owned, deltaE: Math.round(dist * 10) / 10 });
      }
      candidates.sort((a, b) => a.deltaE - b.deltaE);
      return candidates.slice(0, maxResults);
    },

    // Updates a single thread's tobuy flag in the global stash.
    // Accepts composite keys ('dmc:310') or bare legacy IDs ('310').
    async updateThreadToBuy(keyOrId, toBuy) {
      const key = _normaliseKey(keyOrId);
      try {
        const db = await openManagerDB();
        return new Promise((resolve, reject) => {
          const tx = db.transaction("manager_state", "readwrite");
          const store = tx.objectStore("manager_state");
          const req = store.get("threads");
          req.onsuccess = () => {
            const threads = req.result || {};
            if (!threads[key]) threads[key] = { owned: 0, tobuy: false, partialStatus: null };
            threads[key].tobuy = toBuy;
            store.put(threads, "threads");
            tx.oncomplete = () => resolve();
          };
          req.onerror = () => reject(req.error);
        });
      } catch (e) {
        console.error("StashBridge.updateThreadToBuy failed:", e);
      }
    },

    // Returns stash age distribution for the age chart.
    // Buckets: under1Yr, 1to3Yr, 3to5Yr, over5Yr, legacy (before tracking).
    async getStashAgeDistribution() {
      const stash = await StashBridge.getGlobalStash();
      const now = Date.now();
      const DAY = 86400000;
      const result = { bucketUnder1Yr: 0, bucket1to3Yr: 0, bucket3to5Yr: 0, bucketOver5Yr: 0, legacy: 0, oldest: null };
      for (const [key, entry] of Object.entries(stash)) {
        if (!entry.owned || entry.owned <= 0) continue;
        if (!entry.addedAt || entry.acquisitionSource === 'legacy') {
          result.legacy++;
          continue;
        }
        const ageDays = (now - new Date(entry.addedAt).getTime()) / DAY;
        if (ageDays < 365) result.bucketUnder1Yr++;
        else if (ageDays < 1095) result.bucket1to3Yr++;
        else if (ageDays < 1825) result.bucket3to5Yr++;
        else result.bucketOver5Yr++;
        // Track oldest non-legacy thread
        if (!result.oldest || entry.addedAt < result.oldest.addedAt) {
          const info = _getThreadInfoByKey(key);
          result.oldest = { key: key, addedAt: entry.addedAt, name: info ? info.name : key, id: key };
        }
      }
      return result;
    },

    // Returns monthly acquisition vs. usage timeseries for the SABLE chart.
    // months: number of months to include (default 12).
    async getAcquisitionTimeseries(months) {
      months = months || 12;
      const stash = await StashBridge.getGlobalStash();
      const now = new Date();
      const points = [];
      for (let i = months - 1; i >= 0; i--) {
        const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
        const monthStr = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
        points.push({ month: monthStr, added: 0, used: 0 });
      }
      const monthSet = new Set(points.map(p => p.month));
      const monthMap = {};
      points.forEach(p => { monthMap[p.month] = p; });

      // Count stash additions per month from history arrays
      for (const [, entry] of Object.entries(stash)) {
        if (!entry.history || entry.acquisitionSource === 'legacy') continue;
        for (const evt of entry.history) {
          if (evt.delta > 0) {
            const m = evt.date.slice(0, 7); // 'YYYY-MM'
            if (monthMap[m]) monthMap[m].added += evt.delta;
          }
        }
        // Also count the initial addedAt if it's a non-legacy entry
        if (entry.addedAt && entry.addedAt !== LEGACY_EPOCH) {
          const m = entry.addedAt.slice(0, 7);
          // Only count if not already captured in history
          if (monthMap[m] && (!entry.history || entry.history.length === 0 || entry.history[0].date !== entry.addedAt)) {
            // The addedAt thread was created — its first history entry should already capture this
          }
        }
      }

      // Count stitchLog usage per month (converted to skeins)
      // ~1800 stitches per skein at 14-count Aida
      const STITCHES_PER_SKEIN = 1800;
      if (typeof ProjectStorage !== 'undefined' && ProjectStorage.listProjects) {
        try {
          const projects = await ProjectStorage.listProjects();
          for (const meta of projects) {
            const proj = await ProjectStorage.get(meta.id);
            if (!proj || !proj.stitchLog) continue;
            for (const log of proj.stitchLog) {
              const m = log.date.slice(0, 7);
              if (monthMap[m]) monthMap[m].used += log.count / STITCHES_PER_SKEIN;
            }
          }
        } catch (e) { /* ProjectStorage may not be loaded */ }
      }

      // Round 'used' to 1 decimal
      points.forEach(p => { p.used = Math.round(p.used * 10) / 10; });
      return points;
    },

    // Returns the legacy epoch constant for external use
    get LEGACY_EPOCH() { return LEGACY_EPOCH; },

    // Expose migration functions
    migrateSchemaToV3,
  };
})();

// Auto-run migrations on script load (best-effort; errors are swallowed internally).
StashBridge.migrateSchemaToV2()
  .then(function() { return StashBridge.migrateSchemaToV3(); })
  .catch(function() { /* migrations log internally */ });
