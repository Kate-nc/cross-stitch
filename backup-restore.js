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
  function readStore(db, storeName, range) {
    return new Promise((resolve, reject) => {
      const tx = db.transaction(storeName, "readonly");
      const store = tx.objectStore(storeName);
      const entries = [];
      const req = store.openCursor(range);
      req.onsuccess = (e) => {
        const cursor = e.target.result;
        if (cursor) {
          entries.push({ key: cursor.key, value: cursor.value });
          cursor.continue();
        }
      };
      tx.oncomplete = () => resolve(entries);
      tx.onabort = () => reject(tx.error || new Error("Backup read aborted."));
      req.onerror = () => reject(req.error);
    });
  }

  // ── Progress photos (photos.js): "photo:<project>:<n>" and "photothumb:<project>:<n>" in pendingImports ──
  // Records hold a Blob; in a backup each is a plain object with its picture as base64 so it survives JSON.
  // Older builds of the app ignore the `photos` list, which is optional.
  const PHOTO_PREFIXES = ["photo:", "photothumb:"];
  function blobToBase64(blob) {
    if (typeof blob.arrayBuffer === "function") {
      return blob.arrayBuffer().then(buf => {
        const bytes = new Uint8Array(buf), parts = [], CHUNK = 0x8000;
        for (let i = 0; i < bytes.length; i += CHUNK) parts.push(String.fromCharCode.apply(null, bytes.subarray(i, i + CHUNK)));
        return btoa(parts.join(""));
      });
    }
    return new Promise((resolve, reject) => {
      const r = new FileReader();
      r.onload = () => { const s = String(r.result || ""); resolve(s.slice(s.indexOf(",") + 1)); };
      r.onerror = () => reject(r.error || new Error("Could not read a photo."));
      r.readAsDataURL(blob);
    });
  }
  function base64ToBlob(b64, type) {
    const bin = atob(b64), bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return new Blob([bytes], { type: type || "image/jpeg" });
  }
  async function readPhotos(db) {
    if (!db.objectStoreNames.contains("pendingImports") || typeof IDBKeyRange === "undefined") return [];
    const recs = [];
    for (const prefix of PHOTO_PREFIXES) {
      const got = await new Promise((resolve, reject) => {
        const req = db.transaction("pendingImports", "readonly").objectStore("pendingImports").getAll(IDBKeyRange.bound(prefix, prefix + "\uffff"));
        req.onsuccess = () => resolve(req.result || []);
        req.onerror = () => reject(req.error);
      });
      got.forEach(r => { if (r && r.blob) recs.push(r); });
    }
    const out = [];
    for (const r of recs) {
      out.push({ id: r.id, projectId: r.projectId, type: r.type || "image/jpeg", w: r.w, h: r.h, bytes: r.bytes, createdAt: r.createdAt, data: await blobToBase64(r.blob) });
    }
    return out;
  }
  async function restorePhotos(db, photos) {
    if (!db.objectStoreNames.contains("pendingImports") || typeof IDBKeyRange === "undefined") return 0;
    const recs = [];
    (photos || []).forEach(p => {
      if (!p || typeof p.id !== "string" || typeof p.data !== "string" || !PHOTO_PREFIXES.some(x => p.id.indexOf(x) === 0)) return;
      try { recs.push({ id: p.id, projectId: p.projectId, type: p.type || "image/jpeg", w: p.w, h: p.h, bytes: p.bytes, createdAt: p.createdAt || Date.now(), updatedAt: Date.now(), blob: base64ToBlob(p.data, p.type) }); }
      catch (e) { console.warn("Restore: skipped an unreadable photo", e); }
    });
    await new Promise((resolve, reject) => {
      const tx = db.transaction("pendingImports", "readwrite");
      const store = tx.objectStore("pendingImports");
      // The backup replaces the photos: the ones now on the device go, then the backup's come in.
      PHOTO_PREFIXES.forEach(prefix => store.delete(IDBKeyRange.bound(prefix, prefix + "\uffff")));
      recs.forEach(r => store.put(r));
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error || new Error("Photos could not be restored."));
    });
    return recs.length;
  }

  // Open an IndexedDB by name, creating expected stores if needed
  // version === null opens at whatever version already exists (creating the
  // database at 1 if absent) and then repairs any missing stores with a
  // version bump. stitch_manager_db needs this: a versionless open elsewhere
  // can leave it existing-but-storeless, and a hard-coded open(name, 1) then
  // never fires onupgradeneeded, so the store is never created.
  // repair === false: never upgrade the database to add a missing store. The app owns
  // CrossStitchDB's schema version (helpers.js getDB); a bump here would make the app's
  // own open at its version fail with VersionError. Callers handle missing stores.
  function openDB(name, version, storeNames, repair) {
    function createMissing(db) {
      storeNames.forEach(s => {
        if (!db.objectStoreNames.contains(s)) db.createObjectStore(s);
      });
    }
    return new Promise((resolve, reject) => {
      const req = (version == null) ? indexedDB.open(name) : indexedDB.open(name, version);
      req.onupgradeneeded = (e) => createMissing(e.target.result);
      req.onblocked = () => {
        reject(new Error(name + " upgrade blocked — close other tabs and retry."));
      };
      req.onsuccess = () => {
        const db = req.result;
        const missing = storeNames.filter(s => !db.objectStoreNames.contains(s));
        // A pinned version means the caller owns the schema — don't fight it.
        if (!missing.length || version != null || repair === false) { resolve(db); return; }
        const next = db.version + 1;
        db.close();
        const up = indexedDB.open(name, next);
        up.onupgradeneeded = (e) => createMissing(e.target.result);
        up.onsuccess = () => resolve(up.result);
        up.onerror = () => reject(up.error);
        up.onblocked = () => {
          reject(new Error(name + " upgrade blocked — close other tabs and retry."));
        };
      };
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
        try {
          const result = await window.__flushProjectToIDB();
          if (result && result.ok === false) throw new Error(result.reason || "Project was not saved.");
        } catch (e) {
          throw new Error("The latest changes could not be included in the backup. Keep this page open, resolve the save problem and retry Export Backup.", { cause: e });
        }
      }
      const backup = {
        _format: "cross-stitch-backup",
        _version: 1,
        _createdAt: new Date().toISOString(),
        databases: {},
        localStorage: {}
      };

      // 1. CrossStitchDB
      let projectDB;
      try {
        const db = projectDB = await openDB("CrossStitchDB", null, ["projects", "project_meta", "stats_summaries", "sync_snapshots"], false);
        // A store the app has not created is read as empty; never upgrade the database here.
        const readIfThere = (name) => db.objectStoreNames.contains(name) ? readStore(db, name) : Promise.resolve([]);
        // PERF (perf-3 #4 / perf-5): read all three stores in parallel rather
        // than awaiting them sequentially.
        const [projects, project_meta, stats_summaries, sync_snapshots] = await Promise.all([
          readIfThere("projects"),
          readIfThere("project_meta"),
          readIfThere("stats_summaries"),
          readIfThere("sync_snapshots")
        ]);
        // A Tracker may have closed after its small progress write but before
        // its full save. Fold only valid records into their existing project;
        // replace the matching summaries rather than adding duplicate projects.
        const progress = db.objectStoreNames.contains("pendingImports") && typeof IDBKeyRange !== "undefined"
          ? await readStore(db, "pendingImports", IDBKeyRange.bound("progress:", "progress:\uffff")) : [];
        for (const entry of progress) {
          const project = projects.find(e => e.key === entry.value.projectId);
          if (!project) continue;
          if (!window.ProjectStorage || !window.ProjectStorage.backupProgressRows) throw new Error("Could not include saved Tracker progress.");
          const rows = window.ProjectStorage.backupProgressRows(project.value, entry.value);
          if (!rows) continue;
          project.value = rows.project;
          const legacy = projects.find(e => e.key === "auto_save" && e.value.id === project.key);
          if (legacy) {
            const legacyRows = window.ProjectStorage.backupProgressRows(legacy.value, entry.value);
            if (legacyRows) legacy.value = legacyRows.project;
          }
          for (const [list, value] of [[project_meta, rows.meta], [stats_summaries, rows.stats]]) {
            const existing = list.find(e => e.key === project.key);
            if (existing) existing.value = value;
            else list.push({ key: project.key, value });
          }
        }
        backup.databases.CrossStitchDB = { projects, project_meta, stats_summaries, sync_snapshots };
        // Progress photos, when there are any (an optional list; older builds ignore it).
        const photos = await readPhotos(db);
        if (photos.length) backup.photos = photos;
      } catch (e) {
        console.warn("Backup: could not read CrossStitchDB:", e);
        throw new Error("Could not read all project data for the backup.", { cause: e });
      } finally {
        if (projectDB) projectDB.close();
      }

      // 2. stitch_manager_db
      let stashDB;
      try {
        const db = stashDB = await openDB("stitch_manager_db", null, ["manager_state"]);
        backup.databases.stitch_manager_db = {
          manager_state: await readStore(db, "manager_state")
        };
      } catch (e) {
        console.warn("Backup: could not read stitch_manager_db:", e);
        throw new Error("Could not read stash data for the backup.", { cause: e });
      } finally {
        if (stashDB) stashDB.close();
      }

      // 3. localStorage
      LS_KEYS.forEach(key => {
        try {
          const val = localStorage.getItem(key);
          if (val !== null) backup.localStorage[key] = val;
        } catch (e) { throw new Error("Could not read settings for the backup.", { cause: e }); }
      });

      return backup;
    },

    // Downloads the backup as a .json file (or .csb when compression is on)
    async downloadBackup() {
      let url = null;
      try {
        const backup = await this.createBackup();
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
        // Remember when, for the File menu line and the backup reminder (helpers.js).
        try { localStorage.setItem("cs_last_backup_at", String(Date.now())); } catch (_) {}
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
        // Defer revocation so Safari has time to start the download before the
        // Blob URL is invalidated (synchronous revoke races the browser's
        // download initiation on Safari).
        if (url) { setTimeout(function() { try { URL.revokeObjectURL(url); } catch (_) {} }, 5000); }
      }
    },

    // Validates a backup object. Returns { valid: bool, error?: string, summary?: {} }
    validate(backup) {
      if (!backup || backup._format !== "cross-stitch-backup") {
        return { valid: false, error: "Not a valid stitchx backup file." };
      }
      if (backup._version !== 1) {
        return { valid: false, error: "Unsupported backup version: " + backup._version };
      }
      // S-2: cross-field structural checks. Without these, validate() will
      // happily accept a backup whose top-level keys exist but whose nested
      // databases shape is wrong, and the restore loop then explodes
      // halfway through with a less helpful error.
      if (!backup.databases || typeof backup.databases !== "object") {
        return { valid: false, error: "Backup is missing the databases section." };
      }
      const expectedDbs = ["CrossStitchDB", "stitch_manager_db"];
      for (let i = 0; i < expectedDbs.length; i++) {
        const dbKey = expectedDbs[i];
        const db = backup.databases[dbKey];
        if (db === undefined) continue; // partial backups are allowed
        if (!db || typeof db !== "object") {
          return { valid: false, error: "Backup field databases." + dbKey + " is malformed." };
        }
        const stores = Object.keys(db);
        for (let s = 0; s < stores.length; s++) {
          if (!Array.isArray(db[stores[s]])) {
            return { valid: false, error: "Backup field databases." + dbKey + "." + stores[s] + " must be an array of records." };
          }
        }
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
              id => isColorOwned(threadsEntry.value[id])
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
    // Restores a backup. While it runs, and for a short time after, ProjectStorage and the
    // legacy auto-save refuse to write (window.__restoringBackup), because the page reloads
    // afterwards and its unload save would otherwise put the open project back over the
    // restored one. The mark expires on its own, so a restore that does not reload cannot
    // leave saving switched off.
    async restore(backup) {
      try {
        return await this._restoreWithoutGuard(backup);
      } catch (e) {
        if (typeof window !== "undefined") window.__restoringBackup = 0;
        throw e;
      }
    },

    async _restoreWithoutGuard(backup) {
      const check = this.validate(backup);
      if (!check.valid) throw new Error(check.error);

      // INT-7 Phase C — ask peer tabs if any of them has a project open
      // before we wipe both databases. A whole-DB restore uses the
      // wildcard '*' so any active peer objects. On objection we prompt
      // the user through ConfirmDialog (when available) and abort with a
      // clear cancellation error on refusal. Missing lock module/channel
      // falls through to today's behaviour; if peers object and dialog is
      // unavailable we fail closed (cancel restore).
      try {
        if (typeof window !== 'undefined' && window.CrossTabLock &&
            typeof window.CrossTabLock.requestLock === 'function') {
          const lockResult = await window.CrossTabLock.requestLock('*', 'restore-backup');
          if (lockResult && !lockResult.ok && lockResult.denials && lockResult.denials.length > 0) {
            let proceed = false;
            if (window.ConfirmDialog && typeof window.ConfirmDialog.show === 'function') {
              const peerCount = lockResult.denials.length;
              const peerWord = peerCount === 1 ? 'another tab' : (peerCount + ' other tabs');
              try {
                proceed = await window.ConfirmDialog.show({
                  title: 'Other tabs have projects open',
                  message: 'Restoring a backup will overwrite all projects, including any that ' + peerWord + ' may be editing. Unsaved work in those tabs will be lost. Continue?',
                  confirmLabel: 'Restore anyway',
                  cancelLabel: 'Cancel',
                  danger: true
                });
              } catch (_) { proceed = false; }
            } else {
              // No dialog available — fail closed (refuse) rather than
              // silently destroy peer state; the cancellation throw happens
              // in the `if (!proceed)` check below.
              proceed = false;
            }
            if (!proceed) {
              throw new Error('Restore cancelled — another tab has a project open.');
            }
          }
        }
      } catch (e) {
        // Re-throw the cancellation; swallow only internal lock failures.
        if (e && typeof e.message === 'string' && e.message.indexOf('Restore cancelled') === 0) throw e;
        // Lock check itself errored — proceed (best-effort).
      }

      // From here on this page must not write projects (see restore above).
      if (typeof window !== "undefined") window.__restoringBackup = Date.now() + 30000;

      // 1. CrossStitchDB
      if (backup.databases.CrossStitchDB) {
        const db = await openDB("CrossStitchDB", null, ["projects", "project_meta", "stats_summaries", "sync_snapshots"], false);
        const missingStores = ["projects", "project_meta", "stats_summaries", "sync_snapshots"].filter(n => !db.objectStoreNames.contains(n));
        if (missingStores.length) {
          db.close();
          throw new Error("Restore stopped: the project database is missing " + missingStores.join(", ") + ". Reload the app once so it can repair its storage, then try again.");
        }
        const data = backup.databases.CrossStitchDB;
        for (const storeName of ["projects", "project_meta", "stats_summaries", "sync_snapshots"]) {
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
        // Tracker progress records ("progress:<id>" in pendingImports) describe the
        // projects as they were before this restore. They are not part of a backup,
        // and one that outlived the restore could put old marks over the restored ones.
        if (db.objectStoreNames.contains("pendingImports")) {
          await new Promise((resolve, reject) => {
            const tx = db.transaction("pendingImports", "readwrite");
            const store = tx.objectStore("pendingImports");
            const keysReq = store.getAllKeys();
            keysReq.onsuccess = () => {
              (keysReq.result || []).forEach(k => { if (typeof k === "string" && k.indexOf("progress:") === 0) store.delete(k); });
            };
            tx.oncomplete = () => resolve();
            tx.onerror = () => reject(tx.error);
          });
        }
        // Photos: a backup that has the list replaces the photos on the device; an older one leaves them alone.
        if (Array.isArray(backup.photos)) {
          try { await restorePhotos(db, backup.photos); }
          catch (e) { console.warn("Restore: photos could not be restored:", e); }
        }
        db.close();
      }

      // 2. stitch_manager_db
      if (backup.databases.stitch_manager_db) {
        const db = await openDB("stitch_manager_db", null, ["manager_state"]);
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

// Top-level `const` in a classic <script> creates a global *lexical* binding,
// not a property of `window` — the same trap stash-bridge.js documents. Call
// sites are split between bare `BackupRestore` (header.js, manager-app.js),
// which resolved, and `window.BackupRestore` (command-palette.js,
// preferences-modal.js), which silently did not: both of those feature-test the
// window property and so had been dead since they were written. Mirroring it
// explicitly is required for the lazy loader in lazy-modules.js to hand the
// module back to a caller at all, and revives those two entry points as a
// side effect. See Part 10 of reports/mobile-freeze-large-patterns.md.
try { if (typeof window !== 'undefined') window.BackupRestore = BackupRestore; } catch (_) {}
