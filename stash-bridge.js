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
    // PERF (perf-2 #3): prefer cached id-maps from helpers.js (O(1)) over O(n)
    // Array.find scans across the full DMC/ANCHOR palettes.
    if (parsed.brand === "anchor") {
      if (typeof _getAnchorById === "function") {
        const m = _getAnchorById();
        if (m) return m[parsed.id] || null;
      }
      return typeof ANCHOR !== "undefined" ? ANCHOR.find(x => x.id === parsed.id) : null;
    }
    if (typeof _getDmcById === "function") {
      const m = _getDmcById();
      if (m) return m[parsed.id] || null;
    }
    return typeof DMC !== "undefined" ? DMC.find(x => x.id === parsed.id) : null;
  }

  let _migrationDone = false;
  // Schema version tracked in stash data. V2 = composite keys, V3 = addedAt/history fields,
  // V4 = tobuy_qty / tobuy_added_at fields on each entry (lazy: defaults to 0/null when absent).
  let _schemaVersion = 0;

  // Fires the cross-app 'cs:stashChanged' event so listeners (Home, Manager,
  // Tracker, Creator) reload from the live DB. Guarded for non-browser test
  // environments where window/CustomEvent are unavailable.
  function _dispatchStashChanged() {
    if (typeof window === 'undefined' || typeof window.dispatchEvent !== 'function') return;
    if (typeof CustomEvent !== 'function') return;
    try { window.dispatchEvent(new CustomEvent('cs:stashChanged')); } catch (_) { /* swallow */ }
  }

  // Mirror of the above for the patterns store. Fired after the manager-side
  // pattern library is mutated (auto-sync from the Creator, manual unlink, or
  // any other writer) so any open Manager / Home / Shopping view rebuilds in
  // place rather than waiting for the next visibilitychange.
  function _dispatchPatternsChanged() {
    if (typeof window === 'undefined' || typeof window.dispatchEvent !== 'function') return;
    if (typeof CustomEvent !== 'function') return;
    try { window.dispatchEvent(new CustomEvent('cs:patternsChanged')); } catch (_) { /* swallow */ }
  }

  // Pure helper: builds the sorted shopping-list rows from a raw threads dict.
  // Exposed for unit tests via window.StashBridge._buildShoppingListRows.
  // infoLookup(brand, id) -> { name, rgb } | null. Defaults to a stub when
  // catalog globals aren't available (Node tests).
  function _buildShoppingListRows(threadsDict, infoLookup) {
    const lookup = typeof infoLookup === 'function' ? infoLookup : function(brand, id) {
      if (typeof findThreadInCatalog === 'function') return findThreadInCatalog(brand, id);
      return null;
    };
    const rows = [];
    if (!threadsDict || typeof threadsDict !== 'object') return rows;
    for (const key of Object.keys(threadsDict)) {
      const entry = threadsDict[key];
      if (!entry || !entry.tobuy) continue;
      const colon = key.indexOf(':');
      const brand = colon < 0 ? 'dmc' : key.slice(0, colon);
      const id = colon < 0 ? key : key.slice(colon + 1);
      const info = lookup(brand, id) || null;
      rows.push({
        key: key,
        brand: brand,
        id: id,
        name: info ? info.name : id,
        rgb: info ? info.rgb : [200, 200, 200],
        owned: entry.owned || 0,
        tobuyQty: Number(entry.tobuy_qty) > 0 ? Number(entry.tobuy_qty) : 0,
        tobuyAddedAt: entry.tobuy_added_at || null,
      });
    }
    rows.sort(function(a, b) {
      // Most recently added first; ties broken by brand then numeric id.
      const at = a.tobuyAddedAt || '';
      const bt = b.tobuyAddedAt || '';
      if (at !== bt) return bt.localeCompare(at);
      if (a.brand !== b.brand) return a.brand.localeCompare(b.brand);
      const an = /^\d+$/.test(a.id) ? Number(a.id) : Infinity;
      const bn = /^\d+$/.test(b.id) ? Number(b.id) : Infinity;
      if (an !== bn) return an - bn;
      return String(a.id).localeCompare(String(b.id));
    });
    return rows;
  }

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

    // Reads the manager_state.patterns array (the Stash Manager pattern library).
    // Used by the Shopping tab so manager-only patterns (added via the Manager's
    // Add Pattern modal, or wishlist entries with no live ProjectStorage row)
    // are still considered when computing thread deficits.
    async getManagerPatterns() {
      try {
        const db = await openManagerDB();
        return new Promise((resolve, reject) => {
          const tx = db.transaction("manager_state", "readonly");
          const store = tx.objectStore("manager_state");
          const req = store.get("patterns");
          req.onsuccess = () => resolve(req.result || []);
          req.onerror = () => reject(req.error);
        });
      } catch (e) {
        console.error("StashBridge.getManagerPatterns failed:", e);
        return [];
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
              _dispatchStashChanged();
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
        // PERF (perf-5 #3): parallel fetch instead of N sequential awaits.
        const fulls = await Promise.all(allMeta.map(m => ProjectStorage.get(m.id).catch(() => null)));
        for (let i = 0; i < allMeta.length; i++) {
          const meta = allMeta[i];
          const full = fulls[i];
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
            tx.oncomplete = () => { _dispatchPatternsChanged(); resolve(); };
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
            tx.oncomplete = () => {
              if (filtered.length !== patterns.length) _dispatchPatternsChanged();
              resolve();
            };
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
            // Clear quantity when toggling off so the My-list view doesn't show stale rows.
            if (!toBuy) {
              threads[key].tobuy_qty = 0;
              threads[key].tobuy_added_at = null;
            }
            store.put(threads, "threads");
            tx.oncomplete = () => { _dispatchStashChanged(); resolve(); };
          };
          req.onerror = () => reject(req.error);
        });
      } catch (e) {
        console.error("StashBridge.updateThreadToBuy failed:", e);
      }
    },

    // A1 (UX Phase 5) — batched tobuy flag update. Accepts an array of
    // composite keys or bare legacy IDs and flips the tobuy flag on each in a
    // single transaction. Returns the number of entries actually changed
    // (i.e. ones whose tobuy flag was different from `toBuy` beforehand) so
    // callers can show "X added, Y already on the list" style toasts.
    //
    // Optional 3rd arg `qtyMap`: { [keyOrId]: number } — when adding (toBuy=true)
    // any key that has a positive qty in the map seeds tobuy_qty and bumps
    // tobuy_added_at to now if the entry wasn't already on the list. Existing
    // tobuy_qty values are preserved if the key is omitted from qtyMap.
    async markManyToBuy(keysOrIds, toBuy, qtyMap) {
      if (!Array.isArray(keysOrIds) || keysOrIds.length === 0) return 0;
      const flag = !!toBuy;
      const keys = keysOrIds.map(_normaliseKey);
      const qtyByKey = {};
      if (qtyMap && typeof qtyMap === 'object') {
        for (const k of Object.keys(qtyMap)) qtyByKey[_normaliseKey(k)] = Number(qtyMap[k]) || 0;
      }
      try {
        const db = await openManagerDB();
        return new Promise((resolve, reject) => {
          const tx = db.transaction("manager_state", "readwrite");
          const store = tx.objectStore("manager_state");
          let settled = false;
          function resolveOnce(val) { if (!settled) { settled = true; resolve(val); } }
          function rejectOnce(err) { if (!settled) { settled = true; reject(err); } }
          tx.onerror = () => rejectOnce(tx.error);
          tx.onabort = () => rejectOnce(tx.error || new Error('Transaction aborted'));
          const req = store.get("threads");
          req.onsuccess = () => {
            const threads = req.result || {};
            const now = new Date().toISOString();
            let changed = 0;
            for (const key of keys) {
              if (!threads[key]) threads[key] = { owned: 0, tobuy: false, partialStatus: null };
              const wasOn = !!threads[key].tobuy;
              if (wasOn !== flag) {
                threads[key].tobuy = flag;
                changed++;
              }
              if (flag) {
                const qty = qtyByKey[key];
                if (qty > 0) {
                  threads[key].tobuy_qty = qty;
                }
                if (!wasOn && !threads[key].tobuy_added_at) {
                  threads[key].tobuy_added_at = now;
                }
              } else {
                // Toggling off: drop the qty + added-at so My-list rows stay clean.
                threads[key].tobuy_qty = 0;
                threads[key].tobuy_added_at = null;
              }
            }
            const putReq = store.put(threads, "threads");
            putReq.onerror = () => rejectOnce(putReq.error);
            tx.oncomplete = () => { _dispatchStashChanged(); resolveOnce(changed); };
          };
          req.onerror = () => rejectOnce(req.error);
        });
      } catch (e) {
        console.error("StashBridge.markManyToBuy failed:", e);
        return 0;
      }
    },

    // Schema v4 (Shopping List rebuild) — sets the desired purchase quantity
    // on a single thread. qty <= 0 clears the row from the shopping list
    // (tobuy=false). Otherwise tobuy is forced true and tobuy_added_at is
    // stamped to now if the row wasn't already on the list.
    async setToBuyQty(keyOrId, qty) {
      const key = _normaliseKey(keyOrId);
      const n = Math.max(0, Math.floor(Number(qty) || 0));
      try {
        const db = await openManagerDB();
        return new Promise((resolve, reject) => {
          const tx = db.transaction("manager_state", "readwrite");
          const store = tx.objectStore("manager_state");
          const req = store.get("threads");
          req.onsuccess = () => {
            const threads = req.result || {};
            if (!threads[key]) threads[key] = { owned: 0, tobuy: false, partialStatus: null };
            const wasOn = !!threads[key].tobuy;
            if (n <= 0) {
              threads[key].tobuy = false;
              threads[key].tobuy_qty = 0;
              threads[key].tobuy_added_at = null;
            } else {
              threads[key].tobuy = true;
              threads[key].tobuy_qty = n;
              if (!wasOn || !threads[key].tobuy_added_at) {
                threads[key].tobuy_added_at = new Date().toISOString();
              }
            }
            store.put(threads, "threads");
            tx.oncomplete = () => { _dispatchStashChanged(); resolve(n); };
          };
          req.onerror = () => reject(req.error);
        });
      } catch (e) {
        console.error("StashBridge.setToBuyQty failed:", e);
        return 0;
      }
    },

    // Schema v4 (Shopping List rebuild) — bulk version of setToBuyQty.
    // qtyMap: { [keyOrId]: number }. Returns count of rows whose state changed.
    async setToBuyQtyMany(qtyMap) {
      if (!qtyMap || typeof qtyMap !== 'object') return 0;
      const entries = Object.keys(qtyMap).map(function(k) {
        return { key: _normaliseKey(k), qty: Math.max(0, Math.floor(Number(qtyMap[k]) || 0)) };
      });
      if (entries.length === 0) return 0;
      try {
        const db = await openManagerDB();
        return new Promise((resolve, reject) => {
          const tx = db.transaction("manager_state", "readwrite");
          const store = tx.objectStore("manager_state");
          const req = store.get("threads");
          req.onsuccess = () => {
            const threads = req.result || {};
            const now = new Date().toISOString();
            let changed = 0;
            for (const { key, qty } of entries) {
              if (!threads[key]) threads[key] = { owned: 0, tobuy: false, partialStatus: null };
              const wasOn = !!threads[key].tobuy;
              const wasQty = Number(threads[key].tobuy_qty) || 0;
              if (qty <= 0) {
                if (wasOn || wasQty > 0) {
                  threads[key].tobuy = false;
                  threads[key].tobuy_qty = 0;
                  threads[key].tobuy_added_at = null;
                  changed++;
                }
              } else {
                if (!wasOn || wasQty !== qty) changed++;
                threads[key].tobuy = true;
                threads[key].tobuy_qty = qty;
                if (!wasOn || !threads[key].tobuy_added_at) threads[key].tobuy_added_at = now;
              }
            }
            store.put(threads, "threads");
            tx.oncomplete = () => { _dispatchStashChanged(); resolve(changed); };
          };
          req.onerror = () => reject(req.error);
        });
      } catch (e) {
        console.error("StashBridge.setToBuyQtyMany failed:", e);
        return 0;
      }
    },

    // Schema v4 (Shopping List rebuild) — closes the loop: the user has bought
    // `qty` skeins of `keyOrId`. Adds qty to owned (recording V3 history) AND
    // clears the shopping-list flags in a single transaction so a concurrent
    // writer (e.g. another setToBuyQty in flight) cannot land between the two
    // mutations and leave the row in an inconsistent state.
    // qty defaults to the row's current tobuy_qty (or 1 if the row had no qty).
    async markBought(keyOrId, qty) {
      const key = _normaliseKey(keyOrId);
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
            }
            const entry = threads[key];
            let n = Number(qty);
            if (!Number.isFinite(n) || n <= 0) {
              n = Number(entry.tobuy_qty) > 0 ? Number(entry.tobuy_qty) : 1;
            }
            n = Math.max(1, Math.floor(n));
            const oldOwned = entry.owned || 0;
            const newOwned = oldOwned + n;
            entry.owned = newOwned;
            // V3 history tracking — same shape as updateThreadOwned writes.
            if (isV3) {
              const now = new Date().toISOString();
              entry.lastAdjustedAt = now;
              if (entry.addedAt === undefined) entry.addedAt = now;
              if (entry.acquisitionSource === undefined) entry.acquisitionSource = null;
              if (!Array.isArray(entry.history)) entry.history = [];
              entry.history.push({ date: now, delta: n });
              if (entry.history.length > 500) {
                entry.history = entry.history.slice(entry.history.length - 500);
              }
            }
            // Clear the shopping-list state in the same tx.
            entry.tobuy = false;
            entry.tobuy_qty = 0;
            entry.tobuy_added_at = null;
            store.put(threads, "threads");
            tx.oncomplete = () => {
              if (typeof invalidateStatsCache === 'function') invalidateStatsCache();
              _dispatchStashChanged();
              resolve({ key: key, addedSkeins: n, newOwned: newOwned });
            };
          };
          req.onerror = () => reject(req.error);
        });
      } catch (e) {
        console.error("StashBridge.markBought failed:", e);
        return null;
      }
    },

    // Schema v4 (Shopping List rebuild) — bulk version of markBought used by
    // the "Mark all bought" header action. Single tx, single dispatch.
    // qtyMap: { [keyOrId]: number } (qty defaults to current tobuy_qty when
    // the value is missing, 0 or negative).
    async markBoughtMany(qtyMap) {
      if (!qtyMap || typeof qtyMap !== 'object') return [];
      const entries = Object.keys(qtyMap).map(function (k) {
        return { key: _normaliseKey(k), qty: Number(qtyMap[k]) };
      });
      if (entries.length === 0) return [];
      try {
        const db = await openManagerDB();
        return new Promise((resolve, reject) => {
          const tx = db.transaction("manager_state", "readwrite");
          const store = tx.objectStore("manager_state");
          const req = store.get("threads");
          req.onsuccess = () => {
            const threads = req.result || {};
            const isV3 = _schemaVersion >= 3;
            const now = new Date().toISOString();
            const results = [];
            for (const { key, qty } of entries) {
              if (!threads[key]) {
                threads[key] = { owned: 0, tobuy: false, partialStatus: null };
                if (isV3) {
                  threads[key].addedAt = now;
                  threads[key].lastAdjustedAt = null;
                  threads[key].acquisitionSource = null;
                  threads[key].history = [];
                }
              }
              const entry = threads[key];
              let n = qty;
              if (!Number.isFinite(n) || n <= 0) {
                n = Number(entry.tobuy_qty) > 0 ? Number(entry.tobuy_qty) : 1;
              }
              n = Math.max(1, Math.floor(n));
              const oldOwned = entry.owned || 0;
              const newOwned = oldOwned + n;
              entry.owned = newOwned;
              if (isV3) {
                entry.lastAdjustedAt = now;
                if (entry.addedAt === undefined) entry.addedAt = now;
                if (entry.acquisitionSource === undefined) entry.acquisitionSource = null;
                if (!Array.isArray(entry.history)) entry.history = [];
                entry.history.push({ date: now, delta: n });
                if (entry.history.length > 500) {
                  entry.history = entry.history.slice(entry.history.length - 500);
                }
              }
              entry.tobuy = false;
              entry.tobuy_qty = 0;
              entry.tobuy_added_at = null;
              results.push({ key: key, addedSkeins: n, newOwned: newOwned });
            }
            store.put(threads, "threads");
            tx.oncomplete = () => {
              if (typeof invalidateStatsCache === 'function') invalidateStatsCache();
              _dispatchStashChanged();
              resolve(results);
            };
          };
          req.onerror = () => reject(req.error);
        });
      } catch (e) {
        console.error("StashBridge.markBoughtMany failed:", e);
        return [];
      }
    },

    // Schema v4 (Shopping List rebuild) — returns the user's current shopping
    // list as sorted rows. Reads the live stash and uses _buildShoppingListRows
    // for the pure shaping/sort (testable without IndexedDB).
    async getShoppingList() {
      try {
        const stash = await StashBridge.getGlobalStash();
        return _buildShoppingListRows(stash);
      } catch (e) {
        console.error("StashBridge.getShoppingList failed:", e);
        return [];
      }
    },

    // Schema v4 (Shopping List rebuild) — clears every tobuy flag/qty in one
    // transaction. Returns the number of rows cleared.
    async clearShoppingList() {
      try {
        const db = await openManagerDB();
        return new Promise((resolve, reject) => {
          const tx = db.transaction("manager_state", "readwrite");
          const store = tx.objectStore("manager_state");
          const req = store.get("threads");
          req.onsuccess = () => {
            const threads = req.result || {};
            let cleared = 0;
            for (const key of Object.keys(threads)) {
              const e = threads[key];
              if (e && (e.tobuy || (Number(e.tobuy_qty) || 0) > 0)) {
                e.tobuy = false;
                e.tobuy_qty = 0;
                e.tobuy_added_at = null;
                cleared++;
              }
            }
            store.put(threads, "threads");
            tx.oncomplete = () => { _dispatchStashChanged(); resolve(cleared); };
          };
          req.onerror = () => reject(req.error);
        });
      } catch (e) {
        console.error("StashBridge.clearShoppingList failed:", e);
        return 0;
      }
    },

    // A1 (UX Phase 5) — pure helper. Given a Creator displayPal (palette
    // entries with `.id`, `.type`, `.count`) and the current globalStash dict,
    // returns the composite keys of palette threads that are NOT sufficiently
    // owned (status === 'needed'). Mirrors the per-chip logic in
    // creator/Sidebar.js so the warning panel and the chip dots agree.
    //
    // Pure (no IndexedDB, no DOM). Safe to unit test. Caller supplies the
    // catalog lookups so this can be exercised under Node without DMC/ANCHOR
    // globals.
    //
    // options:
    //   fabricCt (number)             — defaults to 14
    //   skeinEst(stitches, fabricCt)  — defaults to a Math.ceil(stitches/1800) fallback
    //   resolveBrand(id)              — required: returns 'dmc' | 'anchor' for a given id
    //   splitBlendId(id)              — required: returns [a,b] for a 'A+B' blend id
    computeUnownedPaletteIds(displayPal, globalStash, options) {
      if (!Array.isArray(displayPal) || displayPal.length === 0) return [];
      const stash = globalStash || {};
      const opts = options || {};
      const fabricCt = opts.fabricCt || 14;
      const estimator = typeof opts.skeinEst === 'function'
        ? opts.skeinEst
        : function(stitches) { return Math.max(1, Math.ceil((stitches || 0) / 1800)); };
      const resolveBrand = typeof opts.resolveBrand === 'function'
        ? opts.resolveBrand
        : function() { return 'dmc'; };
      const splitBlend = typeof opts.splitBlendId === 'function'
        ? opts.splitBlendId
        : function(id) { return String(id || '').split('+'); };
      const requiredByKey = Object.create(null);
      const order = [];
      for (const p of displayPal) {
        if (!p || !p.id || p.id === '__skip__' || p.id === '__empty__') continue;
        const ids = (p.type === 'blend' && typeof p.id === 'string' && p.id.indexOf('+') !== -1)
          ? splitBlend(p.id)
          : [p.id];
        const needed = (p.count != null) ? estimator(p.count, fabricCt) : 1;
        for (const id of ids) {
          if (!id || id === '__skip__' || id === '__empty__') continue;
          const brand = p.brand || resolveBrand(id);
          const key = brand + ':' + id;
          if (requiredByKey[key] == null) {
            requiredByKey[key] = 0;
            order.push(key);
          }
          requiredByKey[key] += needed;
        }
      }
      const unowned = [];
      for (const key of order) {
        const fallbackId = key.indexOf(':') >= 0 ? key.split(':').slice(1).join(':') : key;
        const entry = stash[key] || stash[fallbackId];
        const owned = entry && entry.owned ? entry.owned : 0;
        if (owned < requiredByKey[key]) unowned.push(key);
      }
      return unowned;
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
          // PERF (perf-5 #4): parallel fetch.
          const fulls = await Promise.all(projects.map(m => ProjectStorage.get(m.id).catch(() => null)));
          for (const proj of fulls) {
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

    // Test surface for the Shopping List rebuild (Schema v4). Pure helper —
    // exposes the row-shaping logic without requiring IndexedDB.
    _buildShoppingListRows: _buildShoppingListRows,
  };
})();

// Auto-run migrations on script load (best-effort; errors are swallowed internally).
StashBridge.migrateSchemaToV2()
  .then(function() { return StashBridge.migrateSchemaToV3(); })
  .catch(function() { /* migrations log internally */ });

// Top-level `const` in a classic <script> creates a global binding but does
// NOT attach to `window`. Several callers (BulkAddModal.js, ShoppingListModal.js,
// creator-main.js, home-app.js) feature-test via `window.StashBridge`, so
// without this assignment they silently fail or show the
// "StashBridge is not available" error. Mirror onto window explicitly.
try { if (typeof window !== 'undefined') window.StashBridge = StashBridge; } catch (_) {}
