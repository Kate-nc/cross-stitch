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
  function preferenceAPI() {
    if (!window.UserPrefs || !window.UserPrefs.exportPortable) throw new Error("Preferences could not be loaded. Reload stitchx and retry the backup.");
    return window.UserPrefs;
  }

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

  function readSnapshot(db) {
    return new Promise((resolve, reject) => {
      const names = Array.from(db.objectStoreNames), data = {};
      const tx = db.transaction(names, "readonly");
      names.forEach(name => {
        data[name] = [];
        const req = tx.objectStore(name).openCursor();
        req.onsuccess = () => { const c = req.result; if (c) { data[name].push({ key: c.key, value: c.value }); c.continue(); } };
      });
      tx.oncomplete = () => resolve(data);
      tx.onabort = () => reject(tx.error || new Error("Storage snapshot was interrupted."));
      tx.onerror = () => {};
    });
  }
  function validBase64(value) {
    return typeof value === "string" && value.length % 4 === 0 && !/[^A-Za-z0-9+/=]/.test(value) && !/=/.test(value.slice(0, -2)) && !/=[^=]/.test(value.slice(-2));
  }

  // ── Progress photos (photos.js): "photo:<project>:<n>" and "photothumb:<project>:<n>" in pendingImports ──
  // Records hold a Blob; in a backup each is a plain object with its picture as base64 so it survives JSON.
  // Version 1 used `photos`; version 2 carries every project attachment.
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
  const MAX_BYTES = 64 * 1024 * 1024;
  const CS_STORES = ["projects", "project_meta", "stats_summaries", "sync_snapshots"];
  const ALLOWED = { CrossStitchDB: CS_STORES, stitch_manager_db: ["manager_state"] };
  function sameData(a, b) {
    function ordered(value) {
      if ((ArrayBuffer.isView(value) && typeof value.length === "number") || value instanceof Map || value instanceof Set) return Array.from(value).map(ordered);
      if (value instanceof Date) return value.toJSON();
      if (Array.isArray(value)) return value.map(ordered);
      if (value && typeof value === "object") {
        const out = {};
        Object.keys(value).sort().forEach(key => { out[key] = ordered(value[key]); });
        return out;
      }
      return value;
    }
    return JSON.stringify(ordered(a)) === JSON.stringify(ordered(b));
  }
  function attachmentPlain(record, projectId) {
    const plain = Object.assign({}, record, { projectId });
    delete plain.blob; delete plain.data;
    if (record.blob) { plain.bytes = record.blob.size; plain.type = record.blob.type || record.type || "application/octet-stream"; }
    return plain;
  }
  function mergeManager(key, before, incoming) {
    if (key === "threads") {
      const merged = Object.assign({}, before);
      for (const id of Object.keys(incoming)) {
        if (Object.prototype.hasOwnProperty.call(merged, id) && !sameData(merged[id], incoming[id])) throw new Error("Identifier collision in threads: " + id + ". Restore into a fresh browser profile.");
        merged[id] = incoming[id];
      }
      return merged;
    }
    if (key === "patterns") {
      const merged = before.slice();
      incoming.forEach(pattern => {
        const old = merged.find(p => p && pattern && p.id === pattern.id);
        if (old && !sameData(old, pattern)) throw new Error("Identifier collision in the pattern library. Restore into a fresh browser profile.");
        if (!old) merged.push(pattern);
      });
      return merged;
    }
    return incoming;
  }
  function checksum(text) {
    let crc = -1;
    for (let i = 0; i < text.length; i++) {
      let ch = text.charCodeAt(i);
      for (let byte = 0; byte < 2; byte++, ch >>>= 8) {
        crc ^= ch & 255;
        for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
      }
    }
    return ((crc ^ -1) >>> 0).toString(16).padStart(8, "0");
  }
  function seal(backup) {
    const payload = Object.assign({}, backup);
    delete payload.integrity;
    return checksum(JSON.stringify(payload));
  }
  function owner(id, projects) {
    return projects.find(p => id === "trace:" + p || id.startsWith("photo:" + p + ":") || id.startsWith("photothumb:" + p + ":") || id.startsWith("session:" + p + ":"));
  }
  async function readAttachments(records, projects) {
    const result = []; let blobBytes = 0;
    for (const entry of records) {
      const r = entry.value, pid = owner(String(entry.key), projects);
      if (!pid) continue; // temporary imports and orphaned attachments are not project recovery data
      const record = Object.assign({}, r, { projectId: pid });
      delete record.blob;
      if (r.blob) {
        if (!(r.blob instanceof Blob)) throw new Error("Unreadable attachment: " + entry.key);
        blobBytes += r.blob.size;
        if (blobBytes > MAX_BYTES * 0.75) throw new Error("Attachments exceed the safe 64 MiB archive limit. Reduce attachments and retry.");
        record.data = await blobToBase64(r.blob);
        record.bytes = r.blob.size;
        record.type = r.blob.type || r.type || "application/octet-stream";
      } else if (!String(entry.key).startsWith("session:")) throw new Error("Missing attachment: " + entry.key);
      result.push(record);
    }
    return result;
  }
  function decodeAttachments(backup) {
    return (backup.attachments || backup.photos || []).map(p => {
      const record = Object.assign({}, p);
      delete record.data;
      if (typeof p.data === "string") record.blob = base64ToBlob(p.data, p.type);
      return record;
    });
  }
  function writeStores(db, data) {
    return new Promise((resolve, reject) => {
      const names = Object.keys(data), tx = db.transaction(names, "readwrite", { durability: "strict" });
      tx.oncomplete = resolve;
      tx.onabort = () => reject(tx.error || new Error("Restore staging was interrupted."));
      tx.onerror = () => {}; // onabort is the authoritative failure
      try {
        names.forEach(name => data[name].forEach(e => {
          const store = tx.objectStore(name);
          if (store.keyPath) store.add(e.value); else store.add(e.value, e.key);
        }));
      } catch (e) { tx.abort(); reject(e); }
    });
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
    if (text.length > MAX_BYTES) throw new Error('Backup exceeds the 64 MiB file limit. Use a smaller backup.');
    if (text.startsWith(_BACKUP_MAGIC)) {
      if (typeof pako === 'undefined' || !pako || !pako.inflate) {
        throw new Error('This backup is compressed but pako is not loaded.');
      }
      const body = text.slice(_BACKUP_MAGIC.length).trim();
      if (!validBase64(body)) throw new Error("Compressed backup is corrupt (invalid base64).");
      let bin;
      try { bin = atob(body); }
      catch (e) { throw new Error('Compressed backup is corrupt (base64 decode failed).'); }
      const bytes = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
      let inflated;
      try {
        const chunks = [], stream = new pako.Inflate({ chunkSize: 65536 });
        let size = 0;
        stream.onData = chunk => {
          size += chunk.length;
          if (size > MAX_BYTES) throw new Error('Backup exceeds the 64 MiB expanded limit.');
          chunks.push(chunk);
        };
        stream.push(bytes, true);
        if (stream.err || !stream.ended) throw new Error('Truncated compressed data.');
        const all = new Uint8Array(size); let offset = 0;
        chunks.forEach(chunk => { all.set(chunk, offset); offset += chunk.length; });
        inflated = new TextDecoder('utf-8', { fatal: true }).decode(all);
      } catch (e) { throw new Error('Compressed backup is corrupt or oversized: ' + e.message); }
      return JSON.parse(inflated);
    }
    return JSON.parse(text);
  }

  return {
    maxFileBytes: MAX_BYTES,
    serializeBackupFile,
    parseBackupText,
    // Reads a File/Blob, parses (supports both .json and .csb), validates and restores.
    async restoreBackup(file) {
      if (!file) throw new Error("No backup file selected.");
      if (file.size > MAX_BYTES) throw new Error("Backup exceeds the 64 MiB file limit. Use a smaller backup.");
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
      if (window.RecoveryStorage) window.RecoveryStorage.current();
      // Flush any in-flight React state to IndexedDB before reading
      if (window.__flushProjectToIDB) {
        try {
          const result = await window.__flushProjectToIDB();
          if (result && result.ok === false) throw new Error(result.reason || "Project was not saved.");
        } catch (e) {
          throw new Error("The latest changes could not be included in the backup. Keep this page open, resolve the save problem and retry Export Backup.", { cause: e });
        }
      }
      // Dashboard archive state is local-only. Retire its claims before the
      // portable stash is read, so restoring cannot reactivate archived claims.
      if(window.MaterialReservations&&window.ProjectStorage&&window.StashBridge&&window.StashBridge.projectMaterials)await window.StashBridge.projectMaterials();
      let backup = {
        _format: "cross-stitch-backup",
        _version: 2,
        _createdAt: new Date().toISOString(),
        databases: {},
        localStorage: {}
      };

      // A complete, validated preference snapshot; no prefix scans or Sync settings.
      backup.preferences = preferenceAPI().exportPortable();

      // 1. CrossStitchDB
      let projectDB;
      try {
        const db = projectDB = await openDB("CrossStitchDB", null, ["projects", "project_meta", "stats_summaries", "sync_snapshots"], false);
        const snapshot = await readSnapshot(db);
        const [projects, project_meta, stats_summaries, sync_snapshots] = CS_STORES.map(name => snapshot[name] || []);
        const progress = (snapshot.pendingImports || []).filter(e => String(e.key).startsWith("progress:"));
        for (const project of projects) {
          if (!project.value || project.key !== project.value.id) continue;
          const entry = progress.find(e => e.value && e.value.projectId === project.key);
          const raw = localStorage.getItem("crossstitch_progress_recovery:" + project.key);
          const recovery = raw ? JSON.parse(raw) : null;
          if (!entry && !recovery) continue;
          if (!window.ProjectStorage || !window.ProjectStorage.backupProgressRows) throw new Error("Could not include saved Tracker progress.");
          const rec = entry && entry.value;
          const rows = window.ProjectStorage.backupProgressRows(project.value, rec, recovery);
          if (!rows) continue;
          project.value = rows.project;
          const legacy = projects.find(e => e.key === "auto_save" && e.value.id === project.key);
          if (legacy) {
            const legacyRows = window.ProjectStorage.backupProgressRows(legacy.value, rec, recovery);
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
        const ids = projects.filter(e => e.value && e.key === e.value.id).map(e => e.key);
        backup.attachments = await readAttachments(snapshot.pendingImports || [], ids);
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

      // IndexedDB can hold typed progress arrays and Maps/Sets. Normalise them
      // before JSON and integrity checks; never silently turn a Blob into {}.
      backup = JSON.parse(JSON.stringify(backup, (key, value) => {
        if (ArrayBuffer.isView(value) && typeof value.length === "number") return Array.from(value);
        if (value instanceof Map || value instanceof Set) return Array.from(value);
        if (value instanceof Blob || value instanceof ArrayBuffer || value instanceof DataView) throw new Error("Unsupported binary data outside attachment storage: " + key);
        return value;
      }));
      backup.completeness = { scope: "projects-stash-portable-settings", attachments: backup.attachments.map(a => a.id),
        excluded: ["temporary image handoffs", "unconverted drafts", "device and Sync configuration", "import telemetry"] };
      backup.integrity = { algorithm: "crc32-utf16", value: seal(backup) };
      const check = this.validate(backup);
      if (!check.valid) throw new Error("Backup is incomplete: " + check.error);
      if (new Blob([JSON.stringify(backup)]).size > MAX_BYTES) throw new Error("Backup is too large for safe recovery (64 MiB expanded limit). Reduce attachments and retry.");
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
      if (![1, 2].includes(backup._version)) {
        return { valid: false, error: "Unsupported backup version: " + backup._version };
      }
      // S-2: cross-field structural checks. Without these, validate() will
      // happily accept a backup whose top-level keys exist but whose nested
      // databases shape is wrong, and the restore loop then explodes
      // halfway through with a less helpful error.
      if (!backup.databases || typeof backup.databases !== "object") {
        return { valid: false, error: "Backup is missing the databases section." };
      }
      try {
        const stack = [[backup, 0]];
        while (stack.length) {
          const [value, depth] = stack.pop();
          if (depth > 80) throw new Error("Backup nesting is too deep.");
          if (!value || typeof value !== "object") continue;
          for (const key of Object.keys(value)) {
            if (["__proto__", "constructor", "prototype"].includes(key)) throw new Error("Backup contains an unsafe object key.");
            if (value[key] && typeof value[key] === "object") stack.push([value[key], depth + 1]);
          }
        }
        if (Object.keys(backup.databases).some(k => !ALLOWED[k])) throw new Error("Backup contains an unsupported database.");
        for (const name of Object.keys(backup.databases)) {
          const db = backup.databases[name];
          if (!db || Array.isArray(db)) throw new Error("Malformed database: " + name);
          for (const store of Object.keys(db)) {
            if (!ALLOWED[name].includes(store) || !Array.isArray(db[store])) throw new Error("Unsupported or malformed store: " + store);
            const keys = new Set();
            db[store].forEach(e => {
              if (!e || typeof e.key !== "string" || !e.key || e.value === undefined || keys.has(e.key)) throw new Error("Invalid or duplicate record in " + store);
              keys.add(e.key);
              if (store === "manager_state" && e.key === "threads" && (!e.value || typeof e.value !== "object" || Array.isArray(e.value))) throw new Error("Malformed thread inventory.");
              if (store === "manager_state" && e.key === "patterns" && (!Array.isArray(e.value) || e.value.some(p => !p || typeof p.id !== "string"))) throw new Error("Malformed pattern library.");
              if (store === "projects") {
                const p = e.value;
                if (!p || typeof p !== "object" || (e.key !== "auto_save" && p.id !== e.key)) throw new Error("Project identifier mismatch.");
                if (p.name != null && typeof p.name !== "string") throw new Error("Malformed project name.");
                if (p.p != null && !Array.isArray(p.p)) throw new Error("Malformed compact chart data.");
                for (const field of ["halfStitches", "halfDone", "partialStitches", "partialDone", "bsLines", "bsDone", "knots", "knotsDone", "parkMarkers", "statsSessions"]) {
                  if (p[field] != null && !Array.isArray(p[field])) throw new Error("Malformed project " + field);
                }
                for (const field of ["halfStitches", "halfDone", "partialStitches", "partialDone"]) {
                  if (Array.isArray(p[field]) && p[field].some(row => !Array.isArray(row) || row.length !== 2)) throw new Error("Malformed specialised stitch data: " + field);
                }
                if (p.settings != null && (typeof p.settings !== "object" || Array.isArray(p.settings))) throw new Error("Malformed project settings.");
                if (p.version > 11 || p.v > 11) throw new Error("Unsupported project version. Update stitchx before restoring.");
                if (p.pattern !== undefined && !Array.isArray(p.pattern)) throw new Error("Malformed chart data.");
                const w = p.settings && p.settings.sW, h = p.settings && p.settings.sH;
                if ((w != null && (!Number.isInteger(w) || w < 0)) || (h != null && (!Number.isInteger(h) || h < 0))) throw new Error("Malformed chart dimensions.");
                if (Array.isArray(p.pattern) && Number.isInteger(w) && Number.isInteger(h) && p.pattern.length !== w * h) throw new Error("Chart dimensions do not match its cells.");
                if (Array.isArray(p.done) && Array.isArray(p.pattern) && p.done.length !== p.pattern.length) throw new Error("Progress dimensions do not match the chart.");
              }
            });
          }
        }
        const projects = ((backup.databases.CrossStitchDB || {}).projects || []).filter(e => e.value && e.value.id === e.key).map(e => e.key);
        const attachments = backup.attachments || backup.photos || [];
        if (!Array.isArray(attachments)) throw new Error("Malformed attachments list.");
        const ids = new Set();
        attachments.forEach(p => {
          if (!p || typeof p.id !== "string" || ids.has(p.id) || !owner(p.id, projects)) throw new Error("Duplicate or orphaned attachment.");
          ids.add(p.id);
          if (p.id.startsWith("session:")) { if (p.projectId !== owner(p.id, projects)) throw new Error("Session owner mismatch."); return; }
          if (!validBase64(p.data)) throw new Error("Attachment is corrupt: " + p.id);
          const blob = base64ToBlob(p.data, p.type);
          if (!blob.size || (p.bytes != null && p.bytes !== blob.size)) throw new Error("Attachment size mismatch: " + p.id);
          if (p.projectId && p.projectId !== owner(p.id, projects)) throw new Error("Attachment owner mismatch.");
          if (p.id.startsWith("photo:") && !attachments.some(a => a.id === p.id.replace(/^photo:/, "photothumb:"))) throw new Error("Missing photo thumbnail: " + p.id);
          if (p.id.startsWith("photothumb:") && !attachments.some(a => a.id === p.id.replace(/^photothumb:/, "photo:"))) throw new Error("Missing full photo: " + p.id);
        });
        ((backup.databases.CrossStitchDB || {}).projects || []).forEach(e => {
          if (backup._version === 2 && e.value.settings && e.value.settings.traceImage && !ids.has("trace:" + e.value.id)) throw new Error("Missing tracing picture for " + e.value.id);
        });
        if (backup._version === 2) {
          if (!backup.completeness || backup.completeness.scope !== "projects-stash-portable-settings" || !Array.isArray(backup.completeness.attachments) || JSON.stringify(backup.completeness.attachments) !== JSON.stringify(attachments.map(a => a.id))) throw new Error("Attachment manifest does not match the archive.");
          if (!backup.preferences || !backup.localStorage || Object.keys(ALLOWED).some(n => !backup.databases[n] || ALLOWED[n].some(k => !Array.isArray(backup.databases[n][k])))) throw new Error("Complete backup is missing a required section.");
          if (!backup.integrity || backup.integrity.algorithm !== "crc32-utf16" || backup.integrity.value !== seal(backup)) throw new Error("Backup integrity check failed. The archive is corrupt or incomplete.");
        }
        if (backup.localStorage && (Array.isArray(backup.localStorage) || Object.values(backup.localStorage).some(v => typeof v !== "string"))) throw new Error("Malformed saved settings.");
      } catch (e) { return { valid: false, error: e.message }; }
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
      const managerRows=backup.databases.stitch_manager_db&&backup.databases.stitch_manager_db.manager_state;
      const accounting=managerRows&&managerRows.find(e=>e&&e.key==='thread_consumption_v2');
      if(accounting){
        try{if(!window.ThreadAccounting)throw new Error('Consumption history support is required to restore this backup');window.ThreadAccounting.validate(accounting.value);}
        catch(e){return {valid:false,error:e.message};}
      }
      const reservations=managerRows&&managerRows.find(e=>e&&e.key==='thread_reservations_v1');
      if(reservations){
        try{if(!window.MaterialReservations)throw new Error('Material reservation support is required');window.MaterialReservations.validate(reservations.value);}
        catch(e){return {valid:false,error:e.message};}
      }
      if (Object.prototype.hasOwnProperty.call(backup, "preferences")) {
        try { preferenceAPI().validatePortableSnapshot(backup.preferences); }
        catch (e) { return { valid: false, error: e.message }; }
      }
      const summary = {
        createdAt: backup._createdAt || "unknown",
        projectCount: 0,
        threadCount: 0,
        patternCount: 0,
        completeness: backup._version === 2 ? "Complete project recovery archive" : "Legacy archive: attachment completeness cannot be verified",
        warnings: backup._version === 1 ? ["Legacy or partial backup: omitted data and attachments cannot be recovered from this file."] : []
      };
      try {
        const csdb = backup.databases.CrossStitchDB;
        if (csdb && csdb.projects) {
          summary.projectCount = csdb.projects.filter(
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

    // Restore is an additive import into an isolated generation. Publication is
    // a single localStorage write; neither live database is ever cleared.
    async restore(backup) {
      if (this._busy) throw new Error("A restore is already in progress.");
      this._busy = true;
      try {
        const run = () => this._restoreWithoutGuard(backup);
        if (!window.navigator || !window.navigator.locks) throw new Error("Safe restore requires Web Locks. Update your browser or restore in a current browser profile.");
        return await window.navigator.locks.request("stitchx-restore", run);
      } catch (e) {
        if (typeof window !== "undefined") window.__restoringBackup = 0;
        try { if (window.RecoveryStorage) window.RecoveryStorage.current(); }
        catch (_) { window.__restoringBackup = Number.MAX_SAFE_INTEGER; }
        throw e;
      } finally { this._busy = false; }
    },
    async _restoreWithoutGuard(backup) {
      // Freeze a private, JSON-only copy before the first asynchronous boundary.
      const text = JSON.stringify(backup);
      if (new Blob([text]).size > MAX_BYTES) throw new Error("Backup exceeds the 64 MiB expanded limit.");
      backup = JSON.parse(text);
      const check = this.validate(backup);
      if (!check.valid) throw new Error(check.error);
      const recovery = window.RecoveryStorage;
      if (!recovery) throw new Error("Reload stitchx to load the safe recovery storage, then retry.");
      if (window.CrossTabLock && window.CrossTabLock.requestLock) {
        const lock = await window.CrossTabLock.requestLock('*', 'restore-backup');
        if (!lock || !lock.ok) throw new Error("Restore cancelled — close other stitchx tabs and retry.");
      }
      const expected = recovery.current();
      if (window.__flushProjectToIDB) {
        const flushed = await window.__flushProjectToIDB();
        if (flushed && flushed.ok === false) throw new Error("Save the current project before restoring: " + flushed.reason);
      }
      if (window.SyncEngine && window.SyncEngine.stopWatching) window.SyncEngine.stopWatching();
      await recovery.cleanup();
      const id = "restore_" + (window.crypto && window.crypto.randomUUID ? window.crypto.randomUUID() : Date.now() + "_" + Math.random().toString(36).slice(2));
      const generation = { id, databases: { CrossStitchDB: "CrossStitchDB_" + id, stitch_manager_db: "stitch_manager_db_" + id }, keys: [], previous: expected ? Object.assign({}, JSON.parse(expected), { previous: null }) : null };
      const handles = [];
      let published = false, changed = false, duplicateProjects = 0;
      if (typeof window !== "undefined") window.__restoringBackup = Number.MAX_SAFE_INTEGER;

      // 1. CrossStitchDB and stash are copied, collision-checked and staged.
      try {
        const decoded = decodeAttachments(backup);
        for (const name of Object.keys(ALLOWED)) {
          const db = await openDB(name, null, ALLOWED[name], false);
          handles.push(db);
          const missing = ALLOWED[name].filter(n => !db.objectStoreNames.contains(n));
          if (missing.length) throw new Error("Restore stopped: storage is missing " + missing.join(", ") + ". Reload the app to repair storage.");
          const data = await readSnapshot(db);
          let incoming = backup.databases[name] || {};
          if (name === "stitch_manager_db" && incoming.manager_state && window.StashBridge && window.StashBridge.prepareBackupState) incoming = { manager_state: window.StashBridge.prepareBackupState(incoming.manager_state) };
          for (const store of Object.keys(incoming)) {
            const map = new Map(data[store].map(e => [e.key, e]));
            for (const source of incoming[store]) {
              let entry = source;
              if ((entry.key === "auto_save" || store === "sync_snapshots") && map.has(entry.key)) continue; // legacy alias never replaces an open project
              const old = map.get(entry.key);
              if (old && store === "manager_state" && ["threads", "patterns"].includes(entry.key)) entry = { key: entry.key, value: mergeManager(entry.key, old.value, entry.value) };
              if (old && !sameData(old.value, entry.value) && !(store === "manager_state" && ["threads", "patterns"].includes(entry.key))) throw new Error("Identifier collision in " + store + ": " + entry.key + ". Nothing was replaced. Restore into a fresh browser profile to recover this version.");
              if (!old || !sameData(old.value, entry.value)) changed = true;
              else if (store === "projects" && entry.key !== "auto_save") duplicateProjects++;
              map.set(entry.key, entry);
            }
            data[store] = Array.from(map.values());
          }
          if (name === "CrossStitchDB" && decoded.length) {
            if (!data.pendingImports) data.pendingImports = [];
            const map = new Map(data.pendingImports.map(e => [e.key, e]));
            for (const record of decoded) {
              const old = map.get(record.id);
              if (old) {
                const pid = record.projectId;
                const oldPlain = attachmentPlain(old.value, pid), newPlain = attachmentPlain(record, pid);
                if (!sameData(oldPlain, newPlain) || (old.value.blob && await blobToBase64(old.value.blob)) !== (record.blob && await blobToBase64(record.blob))) throw new Error("Attachment identifier collision: " + record.id + ". Restore into a fresh browser profile.");
              }
              if (!old) changed = true;
              map.set(record.id, { key: record.id, value: record });
            }
            data.pendingImports = Array.from(map.values());
          }
          recovery.markStaging(generation);
          const stage = await new Promise((resolve, reject) => {
            const req = recovery.openPhysical(generation.databases[name], name === "CrossStitchDB" ? 5 : 1);
            req.onupgradeneeded = () => {
              const target = req.result;
              const stores = new Set(Object.keys(data).concat(name === "CrossStitchDB" ? CS_STORES.concat(["pendingImports", "importerTelemetry"]) : ["manager_state"]));
              stores.forEach(store => target.createObjectStore(store, ["pendingImports", "importerTelemetry"].includes(store) ? { keyPath: "id" } : undefined));
            };
            req.onsuccess = () => resolve(req.result);
            req.onerror = () => reject(req.error);
          });
          handles.push(stage);
          await writeStores(stage, data);
        }
        // Stage settings in a private namespace. No live preferences change yet.
        const values = {};
        if (expected) JSON.parse(expected).keys.forEach(key => { values[key] = localStorage.getItem(key); });
        LS_KEYS.forEach(key => { values[key] = localStorage.getItem(key); });
        Object.entries(backup.localStorage || {}).forEach(([key, value]) => { if (LS_KEYS.includes(key)) values[key] = value; });
        if (backup.preferences) {
          const prefs = preferenceAPI().portableStorageValues(backup.preferences);
          const baselineKey = "cs_pref_trackerSnapshotsEnabledAt";
          if (prefs.cs_pref_trackerAutomaticSnapshots === "true" && localStorage.getItem("cs_pref_trackerAutomaticSnapshots") === "true" && localStorage.getItem(baselineKey)) prefs[baselineKey] = localStorage.getItem(baselineKey);
          Object.assign(values, prefs);
        }
        values.cs_projects_v3_migrated = null; // the app runs its idempotent migrations on the published generation
        const imported = ((backup.databases.CrossStitchDB || {}).projects || []).map(e => e.key);
        imported.forEach(pid => { values["crossstitch_progress_recovery:" + pid] = null; });
        if (Object.entries(values).some(([key, value]) => key !== "cs_projects_v3_migrated" && !key.startsWith("crossstitch_progress_recovery:") && localStorage.getItem(key) !== value)) changed = true;
        if (!changed) {
          window.__restoringBackup = 0;
          return Object.assign({}, check.summary, { unchanged: true, duplicateProjects, requiresReload: false });
        }
        generation.keys = Object.keys(values);
        recovery.markStaging(generation);
        for (const key of generation.keys) recovery.stageSetting(id, key, values[key]);
        // Publication makes complete databases and their settings visible together.
        recovery.publish(generation, expected);
        published = true;
        if (window.UserPrefs && window.UserPrefs.cancelPendingPortableWrites) window.UserPrefs.cancelPendingPortableWrites();
        window.__restoringBackup = Number.MAX_SAFE_INTEGER; // reload required; cached handles still refer to the previous generation
        try { window.dispatchEvent(new CustomEvent("cs:backupRestored", { detail: check.summary })); } catch (_) {}
        return Object.assign({}, check.summary, { requiresReload: true, duplicateProjects });
      } finally {
        handles.forEach(db => db.close());
        if (!published) {
          // Keep the durable staging manifest until deletion actually completes.
          // A blocked deletion is retried after the blocking tab closes.
          try { await recovery.cleanup(); } catch (_) {}
        } else recovery.unmarkStaging(id);
      }
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
