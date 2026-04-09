// project-storage.js
// Shared multi-project storage built on the existing CrossStitchDB IndexedDB.
// Projects are stored under their own IDs (e.g. "proj_1712345678"), leaving the
// legacy "auto_save" key untouched for backwards compatibility.

const ProjectStorage = (() => {
  const DB_NAME = "CrossStitchDB";
  const STORE_NAME = "projects";
  const META_STORE = "project_meta";
  const ACTIVE_KEY = "crossstitch_active_project";

  // Extract lightweight metadata from a full project object.
  function buildMeta(p) {
    const s = p.settings || {};
    const totalSt = p.pattern
      ? p.pattern.filter(c => c && c.id !== "__skip__" && c.id !== "__empty__").length
      : 0;
    const completedSt = p.done
      ? p.done.reduce((count, val) => count + (val === 1 ? 1 : 0), 0)
      : 0;
    return {
      id: p.id,
      name: p.name || `${s.sW || "?"}×${s.sH || "?"} pattern`,
      createdAt: p.createdAt,
      updatedAt: p.updatedAt,
      dimensions: { width: s.sW || 0, height: s.sH || 0 },
      totalStitches: totalSt,
      completedStitches: completedSt,
      source: p.source || p.page || "unknown",
    };
  }

  function getDB() {
    return new Promise((resolve, reject) => {
      ensurePersistence();
      let request = indexedDB.open(DB_NAME, 2);
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
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  return {
    // Save a project. Assigns a new ID and createdAt if the project has none.
    // Returns a Promise<string> of the saved project ID.
    async save(project) {
      if (!project.id) {
        project.id = "proj_" + Date.now();
        project.createdAt = new Date().toISOString();
      }
      project.updatedAt = new Date().toISOString();
      try {
        const db = await getDB();
        return new Promise((resolve, reject) => {
          let tx = db.transaction([STORE_NAME, META_STORE], "readwrite");
          let store = tx.objectStore(STORE_NAME);
          let metaStore = tx.objectStore(META_STORE);
          store.put(project, project.id);
          metaStore.put(buildMeta(project), project.id);
          tx.oncomplete = () => resolve(project.id);
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
          let tx = db.transaction([STORE_NAME, META_STORE], "readwrite");
          let store = tx.objectStore(STORE_NAME);
          let metaStore = tx.objectStore(META_STORE);
          store.delete(id);
          metaStore.delete(id);
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

    // Estimate storage used by IndexedDB (requires navigator.storage API).
    // Returns { used: bytes, quota: bytes, persistent: boolean } or null if unsupported.
    async getStorageEstimate() {
      if (navigator.storage && navigator.storage.estimate) {
        try {
          const est = await navigator.storage.estimate();
          const persistent = navigator.storage.persisted ? await navigator.storage.persisted() : false;
          return { used: est.usage || 0, quota: est.quota || 0, persistent };
        } catch (e) {}
      }
      return null;
    },
  };
})();
