// backup-restore.js
// Full app backup & restore — exports both IndexedDB databases and relevant
// localStorage keys into a single JSON file, and can restore from one.

const BackupRestore = (() => {
  // Read all key-value pairs from an IndexedDB object store
  function readStore(db, storeName) {
    return new Promise((resolve, reject) => {
      const tx = db.transaction(storeName, "readonly");
      const store = tx.objectStore(storeName);
      const entries = [];
      const req = store.openCursor();
      req.onsuccess = (e) => {
        const cursor = e.target.result;
        if (cursor) {
          entries.push({ key: cursor.key, value: cursor.value });
          cursor.continue();
        } else {
          resolve(entries);
        }
      };
      req.onerror = () => reject(req.error);
    });
  }

  // Open an IndexedDB by name, creating expected stores if needed
  function openDB(name, version, storeNames) {
    return new Promise((resolve, reject) => {
      const req = indexedDB.open(name, version);
      req.onupgradeneeded = (e) => {
        const db = e.target.result;
        storeNames.forEach(s => {
          if (!db.objectStoreNames.contains(s)) db.createObjectStore(s);
        });
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }

  // LocalStorage keys worth backing up (excludes Babel caches & temp handoffs)
  const LS_KEYS = [
    "crossstitch_active_project",
    "crossstitch_custom_palettes",
    "shortcuts_hint_dismissed",
    "cs_global_goals",
    "cs_stats_settings"
  ];

  return {
    // Creates a full backup JSON object
    async createBackup() {
      // Flush any in-flight React state to IndexedDB before reading
      if (window.__flushProjectToIDB) {
        try { await window.__flushProjectToIDB(); } catch (e) { console.warn("Backup: pre-flush failed:", e); }
      }
      const backup = {
        _format: "cross-stitch-backup",
        _version: 1,
        _createdAt: new Date().toISOString(),
        databases: {},
        localStorage: {}
      };

      // 1. CrossStitchDB
      try {
        const db = await openDB("CrossStitchDB", 3, ["projects", "project_meta", "stats_summaries"]);
        backup.databases.CrossStitchDB = {
          projects: await readStore(db, "projects"),
          project_meta: await readStore(db, "project_meta"),
          stats_summaries: await readStore(db, "stats_summaries")
        };
        db.close();
      } catch (e) {
        console.warn("Backup: could not read CrossStitchDB:", e);
        backup.databases.CrossStitchDB = null;
      }

      // 2. stitch_manager_db
      try {
        const db = await openDB("stitch_manager_db", 1, ["manager_state"]);
        backup.databases.stitch_manager_db = {
          manager_state: await readStore(db, "manager_state")
        };
        db.close();
      } catch (e) {
        console.warn("Backup: could not read stitch_manager_db:", e);
        backup.databases.stitch_manager_db = null;
      }

      // 3. localStorage
      LS_KEYS.forEach(key => {
        try {
          const val = localStorage.getItem(key);
          if (val !== null) backup.localStorage[key] = val;
        } catch (e) {}
      });

      return backup;
    },

    // Downloads the backup as a .json file
    async downloadBackup() {
      const backup = await this.createBackup();
      const json = JSON.stringify(backup);
      const blob = new Blob([json], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "cross-stitch-backup-" + new Date().toISOString().slice(0, 10) + ".json";
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      return backup;
    },

    // Validates a backup object. Returns { valid: bool, error?: string, summary?: {} }
    validate(backup) {
      if (!backup || backup._format !== "cross-stitch-backup") {
        return { valid: false, error: "Not a valid Cross Stitch backup file." };
      }
      if (backup._version !== 1) {
        return { valid: false, error: "Unsupported backup version: " + backup._version };
      }
      const summary = {
        createdAt: backup._createdAt || "unknown",
        projectCount: 0,
        threadCount: 0,
        patternCount: 0
      };
      try {
        const csdb = backup.databases.CrossStitchDB;
        if (csdb && csdb.project_meta) {
          summary.projectCount = csdb.project_meta.filter(
            e => e.key && typeof e.key === "string" && e.key.startsWith("proj_")
          ).length;
        }
        const mdb = backup.databases.stitch_manager_db;
        if (mdb && mdb.manager_state) {
          const threadsEntry = mdb.manager_state.find(e => e.key === "threads");
          if (threadsEntry && threadsEntry.value) {
            summary.threadCount = Object.keys(threadsEntry.value).filter(
              id => threadsEntry.value[id].owned > 0
            ).length;
          }
          const patternsEntry = mdb.manager_state.find(e => e.key === "patterns");
          if (patternsEntry && Array.isArray(patternsEntry.value)) {
            summary.patternCount = patternsEntry.value.length;
          }
        }
      } catch (e) {}
      return { valid: true, summary };
    },

    // Restores from a backup object. Overwrites current data.
    async restore(backup) {
      const check = this.validate(backup);
      if (!check.valid) throw new Error(check.error);

      // 1. CrossStitchDB
      if (backup.databases.CrossStitchDB) {
        const db = await openDB("CrossStitchDB", 3, ["projects", "project_meta", "stats_summaries"]);
        const data = backup.databases.CrossStitchDB;
        for (const storeName of ["projects", "project_meta", "stats_summaries"]) {
          if (!data[storeName]) continue;
          await new Promise((resolve, reject) => {
            const tx = db.transaction(storeName, "readwrite");
            const store = tx.objectStore(storeName);
            store.clear();
            data[storeName].forEach(entry => store.put(entry.value, entry.key));
            tx.oncomplete = () => resolve();
            tx.onerror = () => reject(tx.error);
          });
        }
        db.close();
      }

      // 2. stitch_manager_db
      if (backup.databases.stitch_manager_db) {
        const db = await openDB("stitch_manager_db", 1, ["manager_state"]);
        const data = backup.databases.stitch_manager_db;
        for (const storeName of ["manager_state"]) {
          if (!data[storeName]) continue;
          await new Promise((resolve, reject) => {
            const tx = db.transaction(storeName, "readwrite");
            const store = tx.objectStore(storeName);
            store.clear();
            data[storeName].forEach(entry => store.put(entry.value, entry.key));
            tx.oncomplete = () => resolve();
            tx.onerror = () => reject(tx.error);
          });
        }
        db.close();
      }

      // 3. localStorage
      if (backup.localStorage) {
        for (const [key, val] of Object.entries(backup.localStorage)) {
          // Only restore known safe keys
          if (LS_KEYS.includes(key)) {
            try { localStorage.setItem(key, val); } catch (e) {}
          }
        }
      }

      return check.summary;
    }
  };
})();
