// stash-bridge.js
// Reads the global stash from stitch_manager_db without depending on manager-app.js state.
// Shared read layer used by Creator, Tracker, and Stash Manager pages.

const StashBridge = (() => {
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
    // Returns { [dmcId]: { owned: number, tobuy: bool, partialStatus: string|null } }
    async getGlobalStash() {
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

    // Updates a single thread's owned count in the global stash
    async updateThreadOwned(dmcId, newCount) {
      try {
        const db = await openManagerDB();
        return new Promise((resolve, reject) => {
          const tx = db.transaction("manager_state", "readwrite");
          const store = tx.objectStore("manager_state");
          const req = store.get("threads");
          req.onsuccess = () => {
            const threads = req.result || {};
            if (!threads[dmcId]) threads[dmcId] = { owned: 0, tobuy: false, partialStatus: null };
            threads[dmcId].owned = newCount;
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
        const demand = {}; // { dmcId: { total, patterns: [{title, qty}] } }
        for (const pat of active) {
          if (!pat.threads) continue;
          for (const t of pat.threads) {
            if (!demand[t.id]) demand[t.id] = { total: 0, patterns: [] };
            const skeins = t.unit === "stitches" ? (typeof skeinEst === "function" ? skeinEst(t.qty, 14) : Math.ceil(t.qty / 200)) : t.qty;
            demand[t.id].total += skeins;
            demand[t.id].patterns.push({ title: pat.title, qty: skeins });
          }
        }
        const conflicts = [];
        for (const [id, d] of Object.entries(demand)) {
          const owned = (threadsData[id] || {}).owned || 0;
          if (d.total > owned) {
            const info = typeof DMC !== "undefined" ? DMC.find(x => x.id === id) : null;
            conflicts.push({ id, name: info ? info.name : id, rgb: info ? info.rgb : [128,128,128], owned, totalNeeded: d.total, deficit: d.total - owned, patterns: d.patterns });
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
            const owned = (threadsData[t.id] || {}).owned || 0;
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
    // Returns a Promise resolving to the new owned count.
    async addToStash(id, count) {
      count = count || 1;
      const stash = await StashBridge.getGlobalStash();
      const current = (stash[id] && stash[id].owned) || 0;
      await StashBridge.updateThreadOwned(id, current + count);
      return current + count;
    },

    // Finds similar DMC colours to a given DMC ID from your owned stash.
    // Returns top N alternatives sorted by colour distance (deltaE).
    suggestAlternatives(dmcId, maxResults = 5, ownedThreads = {}) {      const target = DMC.find(d => d.id === dmcId);
      if (!target) return [];
      const targetLab = rgbToLab(target.rgb[0], target.rgb[1], target.rgb[2]);
      const candidates = [];
      for (const [id, state] of Object.entries(ownedThreads)) {
        if (id === dmcId || !state.owned || state.owned <= 0) continue;
        const info = DMC.find(d => d.id === id);
        if (!info) continue;
        const lab = rgbToLab(info.rgb[0], info.rgb[1], info.rgb[2]);
        const dist = dE(targetLab, lab);
        candidates.push({ id, name: info.name, rgb: info.rgb, owned: state.owned, deltaE: Math.round(dist * 10) / 10 });
      }
      candidates.sort((a, b) => a.deltaE - b.deltaE);
      return candidates.slice(0, maxResults);
    },

    // Updates a single thread's tobuy flag in the global stash
    async updateThreadToBuy(dmcId, toBuy) {
      try {
        const db = await openManagerDB();
        return new Promise((resolve, reject) => {
          const tx = db.transaction("manager_state", "readwrite");
          const store = tx.objectStore("manager_state");
          const req = store.get("threads");
          req.onsuccess = () => {
            const threads = req.result || {};
            if (!threads[dmcId]) threads[dmcId] = { owned: 0, tobuy: false, partialStatus: null };
            threads[dmcId].tobuy = toBuy;
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
