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

  let _migrationDone = false;

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
            if (!threads[key]) threads[key] = { owned: 0, tobuy: false, partialStatus: null };
            threads[key].owned = newCount;
            store.put(threads, "threads");
            tx.oncomplete = () => resolve();
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
    async syncProjectToLibrary(projectId, projectName, skeinData, status) {
      try {
        const db = await openManagerDB();
        return new Promise((resolve, reject) => {
          const tx = db.transaction("manager_state", "readwrite");
          const store = tx.objectStore("manager_state");
          const req = store.get("patterns");
          req.onsuccess = () => {
            const patterns = req.result || [];
            const existingIdx = patterns.findIndex(p => p.linkedProjectId === projectId);
            const entry = {
              id: existingIdx >= 0 ? patterns[existingIdx].id : Date.now().toString(),
              linkedProjectId: projectId,
              title: projectName,
              designer: "",
              status: status || "inprogress",
              tags: ["auto-synced"],
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
          for (const t of pat.threads) {
            const key = _normaliseKey(t.id);
            if (!demand[key]) demand[key] = { total: 0, patterns: [] };
            const skeins = t.unit === "stitches" ? (typeof skeinEst === "function" ? skeinEst(t.qty, 14) : Math.ceil(t.qty / 200)) : t.qty;
            demand[key].total += skeins;
            demand[key].patterns.push({ title: pat.title, qty: skeins });
          }
        }
        const conflicts = [];
        for (const [key, d] of Object.entries(demand)) {
          const parsed = key.indexOf(':') >= 0 ? key.split(':') : ['dmc', key];
          const brand = parsed[0];
          const id = parsed[1];
          const owned = ((threadsData[key] || {}).owned || (threadsData[id] || {}).owned || 0);
          if (d.total > owned) {
            const info = typeof getThreadByKey === "function"
              ? getThreadByKey(key)
              : (brand === "anchor"
                ? (typeof ANCHOR !== "undefined" ? ANCHOR.find(x => x.id === id) : null)
                : (typeof DMC !== "undefined" ? DMC.find(x => x.id === id) : null));
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
          let covered = 0, missing = [];
          for (const t of pat.threads) {
            const skeins = t.unit === "stitches" ? (typeof skeinEst === "function" ? skeinEst(t.qty, 14) : Math.ceil(t.qty / 200)) : t.qty;
            const key = _normaliseKey(t.id);
            const owned = ((threadsData[key] || {}).owned || (threadsData[t.id] || {}).owned || 0);
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
    // Returns a Promise resolving to the new owned count.
    async addToStash(id, count) {
      const key = _normaliseKey(id);
      const increment = count == null ? 1 : Number(count);
      if (!Number.isFinite(increment) || !Number.isInteger(increment) || increment < 1) {
        throw new Error("addToStash count must be a finite integer greater than or equal to 1");
      }
      const stash = await StashBridge.getGlobalStash();
      const current = (stash[key] && stash[key].owned) || 0;
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
      let target = null;
      if (srcBrand === 'anchor' && typeof ANCHOR !== 'undefined') {
        target = ANCHOR.find(d => d.id === srcId);
      } else if (typeof DMC !== 'undefined') {
        target = DMC.find(d => d.id === srcId);
      }
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
        let info = null;
        if (brand === 'anchor' && typeof ANCHOR !== 'undefined') {
          info = ANCHOR.find(d => d.id === id);
        } else if (typeof DMC !== 'undefined') {
          info = DMC.find(d => d.id === id);
        }
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
    async updateThreadToBuy(dmcId, toBuy) {
      const key = _normaliseKey(dmcId);
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
    }
  };
})();

// Auto-run migration on script load (best-effort; errors are swallowed internally).
StashBridge.migrateSchemaToV2();
