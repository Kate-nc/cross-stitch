// backup-restore.js
// Full app backup & restore — exports both IndexedDB databases and relevant
// localStorage keys into a single JSON file, and can restore from one.

// PERF (deferred-2): compressed-backup feature flag. Default ON.
// See reports/deferred-2-compressed-backups-analysis.md.
if (typeof window !== 'undefined') {
  window.PERF_FLAGS = window.PERF_FLAGS || {};
  if (window.PERF_FLAGS.compressedBackups === undefined) window.PERF_FLAGS.compressedBackups = true;
}

// Magic header marks the deflate+base64 file format. The newline is the
// boundary between the header and the base64 body so the body parses cleanly.
const _BACKUP_MAGIC = 'CSB1\n';

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
    LOCAL_STORAGE_KEYS.activeProject,
    "crossstitch_custom_palettes",
    LOCAL_STORAGE_KEYS.shortcutsHint,
    LOCAL_STORAGE_KEYS.globalGoals,
    LOCAL_STORAGE_KEYS.globalGoalsCompat
  ];

  // PERF (deferred-2): serialise a backup object into a single text payload.
  // When the flag is on we deflate the JSON and base64-encode the bytes so
  // the file is still readable via FileReader.readAsText. On any error
  // (e.g. pako missing or OOM) we fall back to uncompressed JSON.
  // Returns { text, format: 'compressed' | 'json', extension }.
  function serializeBackupFile(backup, opts) {
    opts = opts || {};
    const json = JSON.stringify(backup);
    const flagOn = !(typeof window !== 'undefined' && window.PERF_FLAGS && window.PERF_FLAGS.compressedBackups === false);
    const wantCompressed = opts.compressed != null ? !!opts.compressed : flagOn;
    if (!wantCompressed || typeof pako === 'undefined' || !pako || !pako.deflate) {
      return { text: json, format: 'json', extension: 'json' };
    }
    try {
      const bytes = pako.deflate(json);
      // Build a binary string from the byte array, then base64-encode it.
      // Chunk to keep the String.fromCharCode call from blowing the stack on
      // very large patterns (~1 MB+ deflated).
      const binChunks = [];
      const CHUNK = 0x8000;
      for (let i = 0; i < bytes.length; i += CHUNK) {
        binChunks.push(String.fromCharCode.apply(null, bytes.subarray(i, i + CHUNK)));
      }
      const b64 = btoa(binChunks.join(''));
      return { text: _BACKUP_MAGIC + b64, format: 'compressed', extension: 'csb' };
    } catch (err) {
      console.warn('Backup: compression failed, falling back to JSON', err);
      return { text: json, format: 'json', extension: 'json' };
    }
  }

  // PERF (deferred-2): parse a backup file's text. Detects the CSB1\n magic
  // header at offset 0 and decompresses; otherwise treats the input as
  // legacy uncompressed JSON. Throws on malformed input so callers' existing
  // error toasts fire as before.
  function parseBackupText(text) {
    if (typeof text !== 'string') throw new Error('Backup file is empty.');
    if (text.startsWith(_BACKUP_MAGIC)) {
      if (typeof pako === 'undefined' || !pako || !pako.inflate) {
        throw new Error('This backup is compressed but pako is not loaded.');
      }
      const body = text.slice(_BACKUP_MAGIC.length).trim();
      let bin;
      try { bin = atob(body); }
      catch (e) { throw new Error('Compressed backup is corrupt (base64 decode failed).'); }
      const bytes = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
      let inflated;
      try { inflated = pako.inflate(bytes, { to: 'string' }); }
      catch (e) { throw new Error('Compressed backup is corrupt (inflate failed).'); }
      return JSON.parse(inflated);
    }
    return JSON.parse(text);
  }

  return {
    serializeBackupFile,
    parseBackupText,
    // Reads a File/Blob, parses (supports both .json and .csb), validates and restores.
    async restoreBackup(file) {
      if (!file) throw new Error("No backup file selected.");
      const text = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = () => reject(reader.error || new Error("Failed to read backup file."));
        reader.readAsText(file);
      });
      const backup = parseBackupText(text);
      const check = this.validate(backup);
      if (!check.valid) throw new Error(check.error);
      return this.restore(backup);
    },
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
        const db = await openDB("CrossStitchDB", 4, ["projects", "project_meta", "stats_summaries", "sync_snapshots"]);
        // PERF (perf-3 #4 / perf-5): read all three stores in parallel rather
        // than awaiting them sequentially.
        const [projects, project_meta, stats_summaries] = await Promise.all([
          readStore(db, "projects"),
          readStore(db, "project_meta"),
          readStore(db, "stats_summaries")
        ]);
        backup.databases.CrossStitchDB = { projects, project_meta, stats_summaries };
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
        } catch (e) { console.warn("Backup: failed to read localStorage key", key, e); }
      });

      return backup;
    },

    // Downloads the backup as a .json file (or .csb when compression is on)
    async downloadBackup() {
      const backup = await this.createBackup();
      let url = null;
      try {
        // PERF (deferred-2): emit the compressed format when the flag is on.
        // Falls back to JSON automatically if compression throws.
        const out = serializeBackupFile(backup);
        const blob = new Blob([out.text], { type: out.format === 'compressed' ? 'application/octet-stream' : 'application/json' });
        url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = "cross-stitch-backup-" + new Date().toISOString().slice(0, 10) + "." + out.extension;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        return backup;
      } catch (err) {
        // QuotaExceededError, RangeError (string-too-long), or OOM during
        // serialisation — surface a clear, user-visible message rather than a
        // silent failure.
        const msg = "Backup export failed: " + (err && err.message ? err.message
          : "browser ran out of space serialising the backup. Try closing other tabs and retrying.");
        try {
          if (typeof window !== "undefined" && window.Toast && window.Toast.show) {
            window.Toast.show({ message: msg, type: "error", duration: 8000 });
          } else if (typeof console !== "undefined" && console.error) {
            // Toast is part of the standard script load order, so the
            // fallback path should be unreachable in practice. Logging the
            // message instead of calling window.alert() keeps us inside the
            // app's modal styling and avoids the system-dialog violation
            // (audit batch 2 fix #2). The error is still re-thrown below
            // so callers can react.
            console.error("[BackupRestore]", msg);
          }
        } catch (_) {}
        throw err;
      } finally {
        if (url) { try { URL.revokeObjectURL(url); } catch (_) {} }
      }
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
          // PERF (perf-4 #7): index manager_state by key once instead of three
          // separate Array.find() scans.
          const msMap = new Map();
          for (let i = 0; i < mdb.manager_state.length; i++) {
            const e = mdb.manager_state[i];
            if (e && e.key) msMap.set(e.key, e);
          }
          const threadsEntry = msMap.get("threads");
          if (threadsEntry && threadsEntry.value) {
            summary.threadCount = Object.keys(threadsEntry.value).filter(
              id => threadsEntry.value[id].owned > 0
            ).length;
          }
          const patternsEntry = msMap.get("patterns");
          if (patternsEntry && Array.isArray(patternsEntry.value)) {
            summary.patternCount = patternsEntry.value.length;
          }
        }
      } catch (e) { console.warn("Backup: failed to summarise backup contents", e); }
      return { valid: true, summary };
    },

    // Restores from a backup object. Overwrites current data.
    async restore(backup) {
      const check = this.validate(backup);
      if (!check.valid) throw new Error(check.error);

      // 1. CrossStitchDB
      if (backup.databases.CrossStitchDB) {
        const db = await openDB("CrossStitchDB", 4, ["projects", "project_meta", "stats_summaries", "sync_snapshots"]);
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
            try { localStorage.setItem(key, val); } catch (e) { console.warn("Restore: failed to write localStorage key", key, e); }
          }
        }
      }

      // M12: Imported data may be from an older schema. Clear the
      // localStorage migration markers so the next page load (or the
      // explicit calls below) re-runs migrations against the restored
      // databases. The schema_version inside stitch_manager_db reflects
      // the imported state, so StashBridge.migrateSchemaToV3 is idempotent.
      // M5: Skip the re-run when the backup already claims current-schema
      // data — migrations are idempotent but walking every project is slow
      // on large libraries.
      let stashIsV3 = false, projectsAreV3 = false;
      try {
        const mdb = backup.databases && backup.databases.stitch_manager_db;
        if (mdb && mdb.manager_state) {
          // PERF (perf-4 #7): same single-pass index pattern as in validate().
          let sv = null;
          for (let i = 0; i < mdb.manager_state.length; i++) {
            const e = mdb.manager_state[i];
            if (e && e.key === 'schema_version') { sv = e; break; }
          }
          stashIsV3 = sv && Number(sv.value) >= 3;
        }
        const csdb = backup.databases && backup.databases.CrossStitchDB;
        if (csdb && Array.isArray(csdb.projects) && csdb.projects.length > 0) {
          // Representative check: any proj_ entry that already has finishStatus
          // means the export was taken after the v3 project migration.
          projectsAreV3 = csdb.projects.some(e =>
            e && typeof e.key === 'string' && e.key.startsWith('proj_') && e.value && e.value.finishStatus
          );
        }
      } catch (_) { /* fall through to force-migrate */ }
      try { localStorage.removeItem('cs_projects_v3_migrated'); } catch (_) {}
      if (!stashIsV3) {
        try {
          if (typeof StashBridge !== 'undefined' && StashBridge.migrateSchemaToV3) {
            await StashBridge.migrateSchemaToV3();
          }
        } catch (e) {
          console.warn('Post-restore stash migration failed:', e);
          try {
            if (typeof window !== "undefined" && window.Toast && window.Toast.show) {
              window.Toast.show({ message: "Restore: stash migration failed \u2014 some thread data may need a manual refresh.", type: "error" });
            }
          } catch (_) {}
        }
      }
      if (!projectsAreV3) {
        try {
          if (typeof ProjectStorage !== 'undefined' && ProjectStorage.migrateProjectsToV3) {
            await ProjectStorage.migrateProjectsToV3();
          }
        } catch (e) {
          console.warn('Post-restore project migration failed:', e);
          try {
            if (typeof window !== "undefined" && window.Toast && window.Toast.show) {
              window.Toast.show({ message: "Restore: project migration failed \u2014 some projects may need a manual refresh.", type: "error" });
            }
          } catch (_) {}
        }
      } else {
        // Projects are already v3 — mark the migration flag so subsequent
        // page loads don't re-run unnecessarily.
        try { localStorage.setItem('cs_projects_v3_migrated', '1'); } catch (_) {}
      }

      // Notify other tabs/components (e.g. Stash Manager pattern library) so they
      // can re-read their state and reconcile after a restore.
      try {
        window.dispatchEvent(new CustomEvent("cs:backupRestored", { detail: check.summary }));
      } catch (_) { /* best-effort */ }

      return check.summary;
    }
  };
})();
