// project-storage.js
// Shared multi-project storage built on the existing CrossStitchDB IndexedDB.
// Projects are stored under their own IDs (e.g. "proj_1712345678"), leaving the
// legacy "auto_save" key untouched for backwards compatibility.

const ProjectStorage = (() => {
  const DB_NAME = "CrossStitchDB";
  const STORE_NAME = "projects";
  const ACTIVE_KEY = "crossstitch_active_project";

  function getDB() {
    return new Promise((resolve, reject) => {
      let request = indexedDB.open(DB_NAME, 1);
      request.onupgradeneeded = (e) => {
        let db = e.target.result;
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          db.createObjectStore(STORE_NAME);
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
          let tx = db.transaction(STORE_NAME, "readwrite");
          let store = tx.objectStore(STORE_NAME);
          let request = store.put(project, project.id);
          request.onsuccess = () => resolve(project.id);
          request.onerror = () => reject(request.error);
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
    // sorted newest-first. The full pattern data is excluded for performance.
    async listProjects() {
      try {
        const db = await getDB();
        const all = await new Promise((resolve, reject) => {
          let tx = db.transaction(STORE_NAME, "readonly");
          let store = tx.objectStore(STORE_NAME);
          let request = store.getAll();
          request.onsuccess = () => resolve(request.result || []);
          request.onerror = () => reject(request.error);
        });
        return all
          .filter(p => p && p.id && typeof p.id === "string" && p.id.startsWith("proj_"))
          .map(p => {
            const s = p.settings || {};
            const doneArr = p.done;
            const totalSt = p.pattern
              ? p.pattern.filter(c => c && c.id !== "__skip__" && c.id !== "__empty__").length
              : 0;
            const completedSt = doneArr
              ? doneArr.reduce((n, v) => n + (v === 1 ? 1 : 0), 0)
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
          })
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
          let tx = db.transaction(STORE_NAME, "readwrite");
          let store = tx.objectStore(STORE_NAME);
          let request = store.delete(id);
          request.onsuccess = () => resolve();
          request.onerror = () => reject(request.error);
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
    // Returns { used: bytes, quota: bytes } or null if unsupported.
    async getStorageEstimate() {
      if (navigator.storage && navigator.storage.estimate) {
        try {
          const est = await navigator.storage.estimate();
          return { used: est.usage || 0, quota: est.quota || 0 };
        } catch (e) {}
      }
      return null;
    },
  };
})();
