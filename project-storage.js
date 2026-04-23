// project-storage.js
// Shared multi-project storage built on the existing CrossStitchDB IndexedDB.
// Projects are stored under their own IDs (e.g. "proj_1712345678"), leaving the
// legacy "auto_save" key untouched for backwards compatibility.

const ProjectStorage = (() => {
  const DB_NAME = "CrossStitchDB";
  const STORE_NAME = "projects";
  const META_STORE = "project_meta";
  const STATS_STORE = "stats_summaries";
  const ACTIVE_KEY = (typeof LOCAL_STORAGE_KEYS !== 'undefined') ? LOCAL_STORAGE_KEYS.activeProject : "crossstitch_active_project";

  // Legacy epoch: same constant as stash-bridge.js for consistent 'before tracking' display
  const LEGACY_EPOCH = '2020-01-01T00:00:00Z';

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
    const totalSeconds = sessions.reduce((sum, s) => sum + (s.durationSeconds != null ? s.durationSeconds : (s.durationMinutes || 0) * 60), 0);
    const totalMinutes = Math.round(totalSeconds / 60);
    const totalNet = sessions.reduce((sum, s) => sum + (s.netStitches || 0), 0);
    const uniqueDays = new Set(sessions.map(s => s.date).filter(Boolean)).size;
    const lastSession = sessions.length > 0 ? sessions[sessions.length - 1] : null;
    // Compute stitches this week and this month for dashboard stats
    const now = new Date();
    const todayStr = now.toISOString().slice(0, 10);
    const monthStr = todayStr.slice(0, 7);
    const dow = now.getDay() === 0 ? 6 : now.getDay() - 1; // Mon=0
    const weekStart = new Date(now); weekStart.setDate(now.getDate() - dow);
    const weekStartStr = weekStart.toISOString().slice(0, 10);
    let stitchesThisWeek = 0, stitchesThisMonth = 0;
    // Per-day breakdown for the most recent 7 days (oldest → newest, ending
    // today). Drives the sparkline rendered on Manager pattern cards.
    const weeklyStitches = [0, 0, 0, 0, 0, 0, 0];
    const dayKeys = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date(now);
      d.setDate(now.getDate() - i);
      dayKeys.push(d.toISOString().slice(0, 10));
    }
    for (const s2 of sessions) {
      if (s2.date >= weekStartStr) stitchesThisWeek += (s2.netStitches || 0);
      if (s2.date && s2.date.slice(0, 7) === monthStr) stitchesThisMonth += (s2.netStitches || 0);
      if (s2.date) {
        const idx = dayKeys.indexOf(s2.date);
        if (idx >= 0) weeklyStitches[idx] += (s2.netStitches || 0);
      }
    }
    return {
      id: p.id,
      name: p.name || `${s.sW || "?"}×${s.sH || "?"} pattern`,
      designer: p.designer || "",
      description: p.description || "",
      createdAt: p.createdAt,
      updatedAt: p.updatedAt,
      dimensions: { width: s.sW || 0, height: s.sH || 0 },
      totalStitches: totalSt,
      completedStitches: completedSt,
      source: p.source || p.page || "unknown",
      sessionCount: sessions.length,
      totalMinutes: totalMinutes,
      uniqueActiveDays: uniqueDays,
      stitchesPerHour: totalSeconds > 0 ? Math.round(totalNet / (totalSeconds / 3600)) : 0,
      lastSessionDate: lastSession ? lastSession.date : null,
      lastSessionStitches: lastSession ? (lastSession.netStitches || 0) : 0,
      stitchesThisWeek,
      stitchesThisMonth,
      weeklyStitches,
      thumbnail: p.thumbnail || null,
      fabricCt: s.fabricCt || 14,
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
        project.id = this.newId();
        project.createdAt = new Date().toISOString();
      }
      // Refuse to save a project that was deleted during this page session.
      if (this._deletedIds.has(project.id)) {
        return project.id;
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
            // Brief D — sync this project's thread requirements into the
            // Stash Manager's pattern library so the inventory & shopping
            // list views stay current without visiting the Manager page.
            // Only sync named projects (proj_*) — skips "auto_save" and
            // similar transient keys.
            if (typeof StashBridge !== "undefined" && StashBridge.syncProjectToLibrary
                && project.id && project.id.startsWith("proj_") && project.pattern) {
              try {
                const counts = {};
                for (const cell of project.pattern) {
                  if (!cell || !cell.id || cell.id === "__skip__" || cell.id === "__empty__") continue;
                  counts[cell.id] = (counts[cell.id] || 0) + 1;
                }
                const fc = (project.settings && project.settings.fabricCt) || 14;
                const skeinData = Object.entries(counts).map(([id, stitches]) => {
                  const dmcEntry = typeof findThreadInCatalog === "function" ? findThreadInCatalog('dmc', id) : null;
                  return {
                    id,
                    name: dmcEntry ? dmcEntry.name : id,
                    stitches,
                    skeins: typeof skeinEst === "function" ? skeinEst(stitches, fc) : 1,
                    rgb: dmcEntry ? dmcEntry.rgb : [128, 128, 128]
                  };
                });
                StashBridge.syncProjectToLibrary(
                  project.id, project.name || "Untitled pattern", skeinData, "inprogress", fc
                ).catch(() => {});
              } catch (e) { /* never block save on sync errors */ }
            }
            // Notify listeners (Home dashboard, Manager pattern library, etc.) that
            // the project list changed so they can refresh without a page reload.
            try {
              if (typeof window !== "undefined" && window.dispatchEvent) {
                window.dispatchEvent(new CustomEvent("cs:projectsChanged", {
                  detail: { reason: "save", id: project.id }
                }));
              }
            } catch (e) {}
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
        const project = await new Promise((resolve, reject) => {
          let tx = db.transaction(STORE_NAME, "readonly");
          let store = tx.objectStore(STORE_NAME);
          let request = store.get(id);
          request.onsuccess = () => resolve(request.result || null);
          request.onerror = () => reject(request.error);
        });
        // Normalise threadOwned keys to bare DMC IDs ("310" not "dmc:310").
        // Creator and Tracker both key threadOwned by palette entry id, which is
        // always a bare id like "310". Any composite keys written by an older
        // migration are stripped back to bare so lookups work correctly.
        if (project && project.threadOwned) {
          let changed = false;
          const normalised = {};
          for (const [key, val] of Object.entries(project.threadOwned)) {
            const bareKey = key.indexOf(':') >= 0 ? key.slice(key.indexOf(':') + 1) : key;
            if (bareKey !== key) changed = true;
            // If we already have a value for this bare key (composite + bare both exist),
            // prefer the non-empty value so we don't lose owned state.
            if (normalised[bareKey] === undefined || !normalised[bareKey]) {
              normalised[bareKey] = val;
            }
          }
          if (changed) project.threadOwned = normalised;
        }
        return project;
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
        // Record the deletion so in-flight auto-saves from Tracker/Creator
        // don't resurrect the project before the page fully reloads.
        this._deletedIds.add(id);
        // Clear the active project pointer if it points to this project, so the
        // Creator/Tracker don't try to load a now-deleted project on next open.
        if (this.getActiveProjectId() === id) this.clearActiveProject();
        const db = await getDB();
        return new Promise((resolve, reject) => {
          let tx = db.transaction([STORE_NAME, META_STORE, STATS_STORE], "readwrite");
          let store = tx.objectStore(STORE_NAME);
          let metaStore = tx.objectStore(META_STORE);
          let statsStore = tx.objectStore(STATS_STORE);
          // Read legacy auto_save first, then perform deletes in one sequence.
          let autoSaveReq = store.get("auto_save");
          autoSaveReq.onsuccess = () => {
            let autoSave = autoSaveReq.result;
            store.delete(id);
            metaStore.delete(id);
            statsStore.delete(id);
            if (autoSave && autoSave.id === id) store.delete("auto_save");
          };
          autoSaveReq.onerror = () => reject(autoSaveReq.error);
          tx.oncomplete = () => {
            // Brief D — remove any auto-synced Manager pattern entry that was
            // linked to this project so the library doesn't show stale entries.
            if (typeof StashBridge !== "undefined" && StashBridge.unlinkProjectFromLibrary) {
              try { StashBridge.unlinkProjectFromLibrary(id).catch(() => {}); } catch (e) {}
            }
            // Notify listeners (Home dashboard, Manager pattern library, etc.) that
            // the project list changed so they can refresh without a page reload.
            try {
              if (typeof window !== "undefined" && window.dispatchEvent) {
                window.dispatchEvent(new CustomEvent("cs:projectsChanged", {
                  detail: { reason: "delete", id: id }
                }));
              }
            } catch (e) {}
            resolve();
          };
          tx.onerror = () => reject(tx.error);
        });
      } catch (err) {
        console.error("ProjectStorage.delete failed:", err);
        throw err;
      }
    },

    // Check whether a project ID was deleted during this page session.
    isDeleted(id) {
      return this._deletedIds.has(id);
    },

    // Internal set of project IDs deleted during this page session.
    _deletedIds: new Set(),

    // Generate a new unique project ID. Single canonical source — every callsite
    // (Creator, Tracker, importers) should use this rather than re-implementing
    // `"proj_" + Date.now()`. The random suffix prevents the (rare) collision
    // when two projects are created within the same millisecond, e.g. a fast
    // double-click on "Generate" or two simultaneous file imports.
    newId() {
      var rand = Math.random().toString(36).slice(2, 7);
      return "proj_" + Date.now() + "_" + rand;
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

    // V3 migration: adds stitchLog, finishStatus, startedAt, lastTouchedAt to projects.
    // Should be called once after the stash-bridge v3 migration.
    async migrateProjectsToV3() {
      try {
        const migrated = localStorage.getItem('cs_projects_v3_migrated');
        if (migrated === '1') return;
        const db = await getDB();
        const projects = await new Promise((resolve, reject) => {
          const tx = db.transaction(STORE_NAME, "readonly");
          const req = tx.objectStore(STORE_NAME).getAll();
          req.onsuccess = () => resolve(req.result || []);
          req.onerror = () => reject(req.error);
        });
        const toUpdate = projects.filter(p => p && p.id && p.id.startsWith("proj_") && !p.finishStatus);
        if (toUpdate.length > 0) {
          const tx = db.transaction([STORE_NAME, META_STORE, STATS_STORE], "readwrite");
          const store = tx.objectStore(STORE_NAME);
          const metaStore = tx.objectStore(META_STORE);
          const statsStore = tx.objectStore(STATS_STORE);
          for (const p of toUpdate) {
            const hasDone = p.done && (Array.isArray(p.done) || ArrayBuffer.isView(p.done));
            const hasStitches = hasDone && Array.prototype.some.call(p.done, v => v === 1);
            p.startedAt = p.createdAt || LEGACY_EPOCH;
            p.lastTouchedAt = p.updatedAt || LEGACY_EPOCH;
            p.finishStatus = hasStitches ? 'active' : 'planned';
            p.stitchLog = [];
            store.put(p, p.id);
            metaStore.put(buildMeta(p), p.id);
            statsStore.put(buildStatsSummary(p), p.id);
          }
          await new Promise((resolve, reject) => {
            tx.oncomplete = () => resolve();
            tx.onerror = () => reject(tx.error);
          });
          console.log('Projects migrated to v3 (' + toUpdate.length + ' projects)');
        }
        localStorage.setItem('cs_projects_v3_migrated', '1');
      } catch (e) {
        console.warn('ProjectStorage: v3 project migration failed', e);
      }
    },

    // Append a stitch count to a project's stitchLog for today.
    // Uses local device date (not UTC) so 11pm stitching counts for today.
    // If an entry for today exists, increments its count.
    async appendStitchLog(projectId, count) {
      if (!count || !projectId) return;
      try {
        const project = await this.get(projectId);
        if (!project) return;
        // Use local date, not UTC
        const now = new Date();
        const today = now.getFullYear() + '-' + String(now.getMonth() + 1).padStart(2, '0') + '-' + String(now.getDate()).padStart(2, '0');
        if (!project.stitchLog) project.stitchLog = [];
        const existing = project.stitchLog.find(e => e.date === today);
        if (existing) {
          existing.count += count;
        } else {
          project.stitchLog.push({ date: today, count: count });
        }
        project.lastTouchedAt = now.toISOString();
        // Auto-transition planned → active on first stitch
        if (project.finishStatus === 'planned' && count > 0) {
          project.finishStatus = 'active';
        }
        await this.save(project);
        if (typeof invalidateStatsCache === 'function') invalidateStatsCache();
      } catch (e) {
        console.error('ProjectStorage.appendStitchLog failed:', e);
      }
    },

    // Mark a project as finished (completed).
    async markProjectFinished(projectId) {
      try {
        const project = await this.get(projectId);
        if (!project) return;
        project.finishStatus = 'completed';
        project.completedAt = new Date().toISOString();
        project.lastTouchedAt = project.completedAt;
        await this.save(project);
        if (typeof invalidateStatsCache === 'function') invalidateStatsCache();
      } catch (e) {
        console.error('ProjectStorage.markProjectFinished failed:', e);
      }
    },

    // Mark a project as UFO (unfinished object / abandoned).
    async markProjectUFO(projectId) {
      try {
        const project = await this.get(projectId);
        if (!project) return;
        project.finishStatus = 'UFO';
        project.lastTouchedAt = new Date().toISOString();
        await this.save(project);
        if (typeof invalidateStatsCache === 'function') invalidateStatsCache();
      } catch (e) {
        console.error('ProjectStorage.markProjectUFO failed:', e);
      }
    },

    // Return lifetime stitch count across all projects from stitchLog.
    async getLifetimeStitches() {
      try {
        const projects = await this.listProjects();
        let total = 0;
        for (const meta of projects) {
          const proj = await this.get(meta.id);
          if (!proj || !proj.stitchLog) continue;
          for (const entry of proj.stitchLog) total += entry.count;
        }
        return total;
      } catch (e) { return 0; }
    },

    // Return aggregated daily stitch totals for charts.
    async getStitchLogByDay(days) {
      days = days || 365;
      try {
        const projects = await this.listProjects();
        const daily = {};
        for (const meta of projects) {
          const proj = await this.get(meta.id);
          if (!proj || !proj.stitchLog) continue;
          for (const entry of proj.stitchLog) {
            daily[entry.date] = (daily[entry.date] || 0) + entry.count;
          }
        }
        // Filter to last N days
        const now = new Date();
        const cutoff = new Date(now.getFullYear(), now.getMonth(), now.getDate() - days);
        const cutoffStr = cutoff.toISOString().slice(0, 10);
        const result = [];
        for (const [date, count] of Object.entries(daily)) {
          if (date >= cutoffStr) result.push({ date, count });
        }
        result.sort((a, b) => a.date.localeCompare(b.date));
        return result;
      } catch (e) { return []; }
    },

    // Return the oldest WIP (active project with longest time since lastTouchedAt).
    async getOldestWIP() {
      try {
        const projects = await this.listProjects();
        let oldest = null;
        for (const meta of projects) {
          const proj = await this.get(meta.id);
          if (!proj || proj.finishStatus !== 'active') continue;
          if (!oldest || (proj.lastTouchedAt && proj.lastTouchedAt < oldest.lastTouchedAt)) {
            const totalSt = proj.pattern ? proj.pattern.filter(c => c && c.id !== '__skip__' && c.id !== '__empty__').length : 0;
            const completedSt = proj.done ? Array.prototype.reduce.call(proj.done, (n, v) => n + (v === 1 ? 1 : 0), 0) : 0;
            oldest = {
              id: proj.id, name: proj.name || 'Untitled',
              lastTouchedAt: proj.lastTouchedAt || proj.updatedAt || LEGACY_EPOCH,
              totalStitches: totalSt, completedStitches: completedSt,
              pct: totalSt > 0 ? Math.round(completedSt / totalSt * 100) : 0
            };
          }
        }
        return oldest;
      } catch (e) { return null; }
    },

    // Return most-used colours approximated from stitchLog + pattern palette ratios.
    // Blend cells (id "310+550") credit each component; halfStitches contribute
    // half-weight to their fwd/bck thread ids.
    // M4: Results are memoised per (project count, latest updatedAt, limit)
    // on window.__csMostUsedCache. The key includes max(updatedAt) so any
    // save naturally busts the cache on the next call.
    async getMostUsedColours(limit) {
      limit = limit || 10;
      try {
        const projects = await this.listProjects();
        // Build cache key from project count and latest updatedAt — any
        // save bumps updatedAt so this detects changes cheaply.
        let latest = 0;
        for (const m of projects) {
          const t = Date.parse(m.updatedAt || m.createdAt || 0) || 0;
          if (t > latest) latest = t;
        }
        const cacheKey = projects.length + ':' + latest + ':' + limit;
        if (typeof window !== 'undefined') {
          const cache = window.__csMostUsedCache;
          if (cache && cache.key === cacheKey && Array.isArray(cache.result)) {
            return cache.result;
          }
        }
        const colourTotals = {}; // { threadKey: { count, name, rgb, id } }
        for (const meta of projects) {
          const proj = await this.get(meta.id);
          if (!proj || !proj.stitchLog || !proj.pattern) continue;
          // Calculate per-thread ratios from the pattern. Blends are split: a
          // "310+550" cell contributes 0.5 to "310" and 0.5 to "550".
          const threadCounts = {};
          let totalStitchable = 0;
          for (const cell of proj.pattern) {
            if (!cell || cell.id === '__skip__' || cell.id === '__empty__') continue;
            const ids = (typeof cell.id === 'string' && cell.id.indexOf('+') !== -1)
              ? splitBlendId(cell.id)
              : [cell.id];
            const share = ids.length > 1 ? 1 / ids.length : 1;
            for (const tid of ids) {
              threadCounts[tid] = (threadCounts[tid] || 0) + share;
            }
            totalStitchable++;
          }
          // Add halfStitches contribution. The shape is [[idx, {fwd, bck}], ...]
          // serialised from a Map. Each half adds 0.5 weight to its thread.
          if (Array.isArray(proj.halfStitches)) {
            for (const entry of proj.halfStitches) {
              if (!entry || !Array.isArray(entry) || entry.length < 2) continue;
              const hs = entry[1];
              if (hs && hs.fwd && hs.fwd.id) {
                threadCounts[hs.fwd.id] = (threadCounts[hs.fwd.id] || 0) + 0.5;
                totalStitchable += 0.5;
              }
              if (hs && hs.bck && hs.bck.id) {
                threadCounts[hs.bck.id] = (threadCounts[hs.bck.id] || 0) + 0.5;
                totalStitchable += 0.5;
              }
            }
          }
          if (totalStitchable === 0) continue;
          // Distribute stitchLog counts across threads proportionally
          const logTotal = proj.stitchLog.reduce((s, e) => s + e.count, 0);
          if (logTotal <= 0) continue;
          for (const [tid, tcount] of Object.entries(threadCounts)) {
            const ratio = tcount / totalStitchable;
            const attributed = logTotal * ratio;
            if (!colourTotals[tid]) {
              const pal = (proj.palette || []).find(p => p.id === tid);
              colourTotals[tid] = { count: 0, name: pal ? pal.name : tid, rgb: pal ? pal.rgb : [128,128,128], id: tid };
            }
            colourTotals[tid].count += attributed;
          }
        }
        const sorted = Object.values(colourTotals).sort((a, b) => b.count - a.count);
        const totalAll = sorted.reduce((s, c) => s + c.count, 0);
        const result = sorted.slice(0, limit).map(c => ({
          id: c.id, name: c.name, rgb: c.rgb,
          count: Math.round(c.count),
          // pct is per-cent (0..100), one decimal place.
          pct: totalAll > 0 ? Math.round(c.count / totalAll * 1000) / 10 : 0
        }));
        if (typeof window !== 'undefined') {
          window.__csMostUsedCache = { key: cacheKey, result: result };
        }
        return result;
      } catch (e) { return []; }
    },

    // Return projects ready to start (wraps StashBridge.whatCanIStart).
    async getProjectsReadyToStart() {
      if (typeof StashBridge === 'undefined' || !StashBridge.whatCanIStart) return [];
      try {
        const results = await StashBridge.whatCanIStart();
        return results;
      } catch (e) { return []; }
    },

    // Dashboard project state management.
    // States: 'active' | 'queued' | 'paused' | 'complete' | 'design'
    // Stored in localStorage so it's fast to read without loading full project data.
    getProjectStates() {
      try { return JSON.parse(localStorage.getItem('cs_projectStates') || '{}'); } catch(e) { return {}; }
    },

    setProjectState(id, state) {
      try {
        var s = this.getProjectStates();
        if (state == null) { delete s[id]; } else { s[id] = state; }
        localStorage.setItem('cs_projectStates', JSON.stringify(s));
      } catch(e) {}
    },
  };
})();
