// project-storage.js
// Shared multi-project storage built on the existing CrossStitchDB IndexedDB.
// Projects are stored under their own IDs (e.g. "proj_1712345678"), leaving the
// legacy "auto_save" key untouched for backwards compatibility.

const ProjectStorage = (() => {
  const DB_NAME = "CrossStitchDB";
  const STORE_NAME = "projects";
  const META_STORE = "project_meta";
  const STATS_STORE = "stats_summaries";
  const ACTIVE_KEY = "crossstitch_active_project";

  // Build a lightweight stats summary for the global dashboard.
  function buildStatsSummary(p) {
    const totalSt = p.pattern
      ? p.pattern.filter(c => c && c.id !== "__skip__" && c.id !== "__empty__").length
      : (p.totalStitches || 0);
    const done = p.done;
    const completedSt = done
      ? (ArrayBuffer.isView(done) || Array.isArray(done) ? Array.prototype.reduce.call(done, (n, v) => n + (v === 1 ? 1 : 0), 0) : 0)
      : (p.completedStitches || 0);
    return {
      id: p.id,
      name: p.name || 'Untitled',
      createdAt: p.createdAt,
      updatedAt: p.updatedAt,
      totalStitches: totalSt,
      completedStitches: completedSt,
      isComplete: totalSt > 0 && completedSt >= totalSt,
      statsSessions: p.statsSessions || [],
      achievedMilestones: p.achievedMilestones || [],
      palette: (p.palette || []).map(c => ({ id: c.id, name: c.name, rgb: c.rgb })),
      projectColor: p.projectColor || null,
    };
  }

  // Extract lightweight metadata from a full project object.
  function buildMeta(p) {
    const s = p.settings || {};
    const totalSt = p.pattern
      ? p.pattern.filter(c => c && c.id !== "__skip__" && c.id !== "__empty__").length
      : 0;
    const completedSt = p.done
      ? p.done.reduce((count, val) => count + (val === 1 ? 1 : 0), 0)
      : 0;
    const sessions = p.statsSessions || [];
    const totalMinutes = sessions.reduce((sum, s) => sum + (s.durationMinutes || 0), 0);
    const totalNet = sessions.reduce((sum, s) => sum + (s.netStitches || 0), 0);
    const uniqueDays = new Set(sessions.map(s => s.date).filter(Boolean)).size;
    return {
      id: p.id,
      name: p.name || `${s.sW || "?"}×${s.sH || "?"} pattern`,
      createdAt: p.createdAt,
      updatedAt: p.updatedAt,
      dimensions: { width: s.sW || 0, height: s.sH || 0 },
      totalStitches: totalSt,
      completedStitches: completedSt,
      source: p.source || p.page || "unknown",
      sessionCount: sessions.length,
      totalMinutes: totalMinutes,
      uniqueActiveDays: uniqueDays,
      stitchesPerHour: totalMinutes > 0 ? Math.round(totalNet / (totalMinutes / 60)) : 0,
    };
  }

  let _cachedDB = null;

  function getDB() {
    if (_cachedDB) {
      try { _cachedDB.transaction(STORE_NAME); return Promise.resolve(_cachedDB); } catch(_) { _cachedDB = null; }
    }
    return new Promise((resolve, reject) => {
      ensurePersistence();
      let request = indexedDB.open(DB_NAME, 3);
      request.onupgradeneeded = (e) => {
        let db = e.target.result;
        let upgradeTx = e.target.transaction;
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          db.createObjectStore(STORE_NAME);
        }
        if (!db.objectStoreNames.contains(META_STORE)) {
          let metaStore = db.createObjectStore(META_STORE);
          // Migrate lightweight metadata from any existing proj_* entries.
          if (e.oldVersion >= 1) {
            let projectsStore = upgradeTx.objectStore(STORE_NAME);
            let cursorReq = projectsStore.openCursor();
            cursorReq.onsuccess = (evt) => {
              let cursor = evt.target.result;
              if (!cursor) return;
              let p = cursor.value;
              if (p && p.id && typeof p.id === "string" && p.id.startsWith("proj_")) {
                metaStore.put(buildMeta(p), p.id);
              }
              cursor.continue();
            };
          }
        }
        if (!db.objectStoreNames.contains(STATS_STORE)) {
          db.createObjectStore(STATS_STORE);
        }
      };
      request.onblocked = () => console.warn("ProjectStorage IndexedDB open was blocked by another open connection.");
      request.onsuccess = () => {
        let db = request.result;
        db.onversionchange = () => {
          db.close();
          if (_cachedDB === db) _cachedDB = null;
        };
        _cachedDB = db;
        resolve(db);
      };
      request.onerror = () => reject(request.error);
    });
  }

  return {
    // Mark projects as synced (sets lastSyncedAt on each).
    async markSynced(projectIds, timestamp) {
      const ts = timestamp || new Date().toISOString();
      for (const id of projectIds) {
        try {
          const p = await this.get(id);
          if (p) {
            if (!p.syncMeta) p.syncMeta = {};
            p.syncMeta.lastSyncedAt = ts;
            p.syncMeta.syncVersion = (p.syncMeta.syncVersion || 0) + 1;
            // Save without bumping updatedAt — only sync metadata changed
            const db = await getDB();
            await new Promise((resolve, reject) => {
              const tx = db.transaction([STORE_NAME, META_STORE, STATS_STORE], "readwrite");
              tx.objectStore(STORE_NAME).put(p, p.id);
              tx.objectStore(META_STORE).put(buildMeta(p), p.id);
              if (p.id && p.id.startsWith("proj_")) {
                tx.objectStore(STATS_STORE).put(buildStatsSummary(p), p.id);
              }
              tx.oncomplete = () => resolve();
              tx.onerror = () => reject(tx.error);
            });
          }
        } catch (e) { console.warn("markSynced failed for", id, e); }
      }
    },

    // Save a project. Assigns a new ID and createdAt if the project has none.
    // Returns a Promise<string> of the saved project ID.
    async save(project) {
      if (!project.id) {
        project.id = "proj_" + Date.now();
        project.createdAt = new Date().toISOString();
      }
      project.updatedAt = new Date().toISOString();

      // Fingerprints are computed by sync-specific export/classification flows.
      // Avoid doing expensive whole-project fingerprinting on every normal save.
      try {
        const db = await getDB();
        return new Promise((resolve, reject) => {
          let tx = db.transaction([STORE_NAME, META_STORE, STATS_STORE], "readwrite");
          let store = tx.objectStore(STORE_NAME);
          let metaStore = tx.objectStore(META_STORE);
          let statsStore = tx.objectStore(STATS_STORE);
          store.put(project, project.id);
          metaStore.put(buildMeta(project), project.id);
          if (project.id && project.id.startsWith("proj_")) {
            statsStore.put(buildStatsSummary(project), project.id);
          }
          tx.oncomplete = () => {
            // Trigger auto-export to sync folder if enabled
            if (typeof SyncEngine !== "undefined" && SyncEngine.triggerAutoExport) {
              try { SyncEngine.triggerAutoExport(); } catch (e) {}
            }
            resolve(project.id);
          };
          tx.onerror = () => reject(tx.error);
        });
      } catch (err) {
        console.error("ProjectStorage.save failed:", err);
        throw err;
      }
    },

    // Load a single project by ID. Returns null if not found.
    async get(id) {
      try {
        const db = await getDB();
        return new Promise((resolve, reject) => {
          let tx = db.transaction(STORE_NAME, "readonly");
          let store = tx.objectStore(STORE_NAME);
          let request = store.get(id);
          request.onsuccess = () => resolve(request.result || null);
          request.onerror = () => reject(request.error);
        });
      } catch (err) {
        console.error("ProjectStorage.get failed:", err);
        return null;
      }
    },

    // Return lightweight metadata for all named projects (those with IDs starting "proj_"),
    // sorted newest-first. Reads from the dedicated metadata store — no pattern data is loaded.
    async listProjects() {
      try {
        const db = await getDB();
        const all = await new Promise((resolve, reject) => {
          let tx = db.transaction(META_STORE, "readonly");
          let store = tx.objectStore(META_STORE);
          let request = store.getAll();
          request.onsuccess = () => resolve(request.result || []);
          request.onerror = () => reject(request.error);
        });
        return all
          .filter(p => p && p.id && typeof p.id === "string" && p.id.startsWith("proj_"))
          .sort((a, b) => new Date(b.updatedAt || 0) - new Date(a.updatedAt || 0));
      } catch (err) {
        console.error("ProjectStorage.listProjects failed:", err);
        return [];
      }
    },

    // Delete a project by ID.
    async delete(id) {
      try {
        const db = await getDB();
        return new Promise((resolve, reject) => {
          let tx = db.transaction([STORE_NAME, META_STORE, STATS_STORE], "readwrite");
          let store = tx.objectStore(STORE_NAME);
          let metaStore = tx.objectStore(META_STORE);
          let statsStore = tx.objectStore(STATS_STORE);
          store.delete(id);
          metaStore.delete(id);
          statsStore.delete(id);
          tx.oncomplete = () => resolve();
          tx.onerror = () => reject(tx.error);
        });
      } catch (err) {
        console.error("ProjectStorage.delete failed:", err);
        throw err;
      }
    },

    // Mark a project as the currently active one (stored in localStorage as a pointer).
    setActiveProject(id) {
      try { localStorage.setItem(ACTIVE_KEY, id); } catch (e) {}
    },

    getActiveProjectId() {
      try { return localStorage.getItem(ACTIVE_KEY); } catch (e) { return null; }
    },

    // Load the currently active project from IndexedDB. Returns null if none set.
    async getActiveProject() {
      const id = this.getActiveProjectId();
      if (!id) return null;
      return this.get(id);
    },

    clearActiveProject() {
      try { localStorage.removeItem(ACTIVE_KEY); } catch (e) {}
    },

    // Return all stats summaries for the global dashboard.
    async getAllStatsSummaries() {
      try {
        const db = await getDB();
        const data = await new Promise((resolve, reject) => {
          let tx = db.transaction([STATS_STORE, META_STORE], "readonly");
          let statsStore = tx.objectStore(STATS_STORE);
          let metaStore = tx.objectStore(META_STORE);
          let statsReq = statsStore.getAll();
          let metaReq = metaStore.getAll();
          let stats = null, meta = null, done = false;
          function finish() {
            if (done || stats === null || meta === null) return;
            done = true;
            resolve({ stats, meta });
          }
          statsReq.onsuccess = () => { stats = statsReq.result || []; finish(); };
          metaReq.onsuccess = () => { meta = metaReq.result || []; finish(); };
          statsReq.onerror = () => { if (!done) { done = true; reject(statsReq.error); } };
          metaReq.onerror = () => { if (!done) { done = true; reject(metaReq.error); } };
          tx.onerror = () => { if (!done) { done = true; reject(tx.error); } };
        });
        const validIds = new Set((data.meta || []).map(m => m && m.id).filter(Boolean));
        return (data.stats || []).filter(s => s && s.id && s.id.startsWith("proj_") && validIds.has(s.id));
      } catch (err) {
        console.error("ProjectStorage.getAllStatsSummaries failed:", err);
        return [];
      }
    },

    // Build stats summaries for all existing projects (migration / one-time build).
    async buildAllStatsSummaries() {
      try {
        const db = await getDB();
        const projects = await new Promise((resolve, reject) => {
          let tx = db.transaction(STORE_NAME, "readonly");
          let store = tx.objectStore(STORE_NAME);
          let request = store.getAll();
          request.onsuccess = () => resolve(request.result || []);
          request.onerror = () => reject(request.error);
        });
        const summaries = projects
          .filter(p => p && p.id && p.id.startsWith("proj_"))
          .map(buildStatsSummary);
        if (summaries.length > 0) {
          const writeTx = db.transaction(STATS_STORE, "readwrite");
          const statsStore = writeTx.objectStore(STATS_STORE);
          summaries.forEach(s => statsStore.put(s, s.id));
          await new Promise((resolve, reject) => {
            writeTx.oncomplete = () => resolve();
            writeTx.onerror = () => reject(writeTx.error);
          });
        }
        return summaries;
      } catch (err) {
        console.error("ProjectStorage.buildAllStatsSummaries failed:", err);
        return [];
      }
    },

    // Estimate storage used by IndexedDB (requires navigator.storage API).
    // Returns { used: bytes, quota: bytes, persistent: boolean } or null if unsupported.
    async getStorageEstimate() {
      if (navigator.storage && navigator.storage.estimate) {
        try {
          // Request persistence before reading the flag so the result reflects the
          // grant/deny outcome of this session rather than a stale prior check.
          await ensurePersistence();
          const est = await navigator.storage.estimate();
          const persistent = navigator.storage.persisted ? await navigator.storage.persisted() : false;
          return { used: est.usage || 0, quota: est.quota || 0, persistent };
        } catch (e) {}
      }
      return null;
    },
  };
})();
