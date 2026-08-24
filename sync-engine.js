// sync-engine.js
// File-based sync engine for cross-device synchronisation.
// Exports and imports compressed .csync files that can be transferred via
// any cloud drive (OneDrive, Google Drive, Dropbox) or manual file sharing.

const SyncEngine = (() => {
  const SYNC_FORMAT = "cross-stitch-sync";
  const SYNC_VERSION = 1;

  // Prefer structuredClone (faster) but fall back to JSON round-trip for older browsers.
  var _clone = typeof structuredClone === 'function' ? structuredClone : function(x) { return JSON.parse(JSON.stringify(x)); };

  // localStorage keys for sync state
  const LS_LAST_EXPORT = "cs_sync_lastExportAt";
  const LS_LAST_IMPORT = "cs_sync_lastImportAt";
  const LS_DEVICE_ID   = "cs_sync_deviceId";
  const LS_DEVICE_NAME = "cs_sync_deviceName";
  // Encryption: opt-in flag that enables AES-GCM ciphertext payloads on
  // export and required-passphrase on import. The passphrase itself is
  // never written to disk — see _sessionPassphrase below.
  const LS_ENC_ENABLED = "cs_sync_encryption_enabled";
  // Auto-export toggle. "1" = on, "0" = explicitly off, absent = never chosen
  // (which setWatchDirectory upgrades to on — see _defaultAutoSyncOnConnect).
  const LS_AUTO_SYNC = "cs_sync_folderAutoSync";
  // Per-device "last import" map — { deviceId: { at, fileLastModified, deviceName, projectCount } }.
  // Updated in executeImport when the source device is known via plan.syncObj._deviceId.
  // Powers the inline "Devices in this folder" panel (Concept B).
  const LS_LAST_IMPORT_PER_DEVICE = "cs_sync_lastImportPerDevice";
  // Rolling event log — most recent at index 0, capped at EVENT_LOG_MAX entries.
  // Powers the Sync Activity modal (Concept A).
  const LS_EVENT_LOG = "cs_sync_eventLog";
  const EVENT_LOG_MAX = 50;

  // Allowlist of cs_pref_* UserPrefs keys that are safe to sync across devices.
  // Per-device-only keys (active project pointer, sync state, per-device UI) are
  // intentionally excluded. crossstitch_active_project is per-device UI state and
  // must never be included in a sync file.
  const SYNC_PREF_ALLOWLIST = [
    "cs_pref_designerName",
    "cs_pref_designerLogo",
    "cs_pref_designerLogoPosition",
    "cs_pref_designerCopyright",
    "cs_pref_designerContact",
    "cs_pref_units",
    "cs_pref_currency",
    "cs_pref_fabricUnit"
  ];

  // ── Device identity ──────────────────────────────────────────────────────

  function getDeviceId() {
    try {
      let id = localStorage.getItem(LS_DEVICE_ID);
      if (!id) {
        id = "dev_" + Date.now() + "_" + Math.random().toString(36).slice(2, 8);
        localStorage.setItem(LS_DEVICE_ID, id);
      }
      return id;
    } catch (e) { return "dev_unknown"; }
  }

  function getDeviceName() {
    try { return localStorage.getItem(LS_DEVICE_NAME) || ""; } catch (e) { return ""; }
  }

  function setDeviceName(name) {
    try { localStorage.setItem(LS_DEVICE_NAME, String(name).slice(0, 60)); } catch (e) {}
  }

  // Phase B — recovery path for device-id collisions detected by
  // _detectDeviceIdCollision. Generating a fresh id makes this device
  // start writing under a new filename, so it stops overwriting the
  // colliding peer's exports. We DON'T touch lastImport bookkeeping —
  // the next watcher tick will treat existing files as new and re-import
  // them, which is the safe choice (worst case: a few duplicate-detected
  // skips). Returns the new id.
  function regenerateDeviceId() {
    try {
      var fresh = "dev_" + Date.now() + "_" + Math.random().toString(36).slice(2, 8);
      localStorage.setItem(LS_DEVICE_ID, fresh);
      // Reset the collision-warned latch so a future collision can fire.
      try { _collisionWarned = false; } catch (e) {}
      try {
        if (typeof window !== "undefined" && window.dispatchEvent) {
          window.dispatchEvent(new CustomEvent("cs:syncStatusChanged", { detail: { reason: "device-id-regenerated" } }));
        }
      } catch (e) {}
      return fresh;
    } catch (e) { return null; }
  }

  // VER-SYNC-009 — tombstone helpers
  // When a project is deleted locally, project-storage.js writes its id to the
  // 'cs_deleted_project_ids' localStorage array. SyncEngine reads that list
  // when exporting (so remote devices know not to re-import it) and when
  // classifying remote projects (so already-deleted projects are skipped).
  var LS_TOMBSTONE_KEY = "cs_deleted_project_ids";

  function getLocalTombstones() {
    try {
      var raw = localStorage.getItem(LS_TOMBSTONE_KEY);
      var arr = raw ? JSON.parse(raw) : [];
      return Array.isArray(arr) ? arr : [];
    } catch (e) { return []; }
  }

  // ── Fingerprinting ───────────────────────────────────────────────────────
  // Uses pako's crc32 (already loaded) for a fast structural fingerprint of a
  // project's pattern data. This detects whether the chart grid itself changed
  // (colours re-arranged, cells edited) vs. only tracking progress changing.

  function stringToUint8Array(str) {
    if (typeof TextEncoder !== "undefined") return new TextEncoder().encode(str);
    var arr = new Uint8Array(str.length);
    for (var ci = 0; ci < str.length; ci++) arr[ci] = str.charCodeAt(ci) & 0xff;
    return arr;
  }

  function computeDeflateFingerprint(bytes, w, h) {
    var deflated = pako.deflate(bytes);
    var hex = "";
    for (var di = 0; di < Math.min(8, deflated.length); di++) {
      hex += ("0" + deflated[di].toString(16)).slice(-2);
    }
    return "fp_" + w + "x" + h + "_" + hex + "_" + deflated.length;
  }

  function computeFingerprint(project) {
    if (!project) return "empty";
    const pat = project.pattern || project.p;
    if (!pat) return "empty";
    try {
      // Build a compact string of pattern cell IDs — this captures the chart
      // structure without tracking state (done array, sessions, etc.)
      const parts = [];
      for (let i = 0; i < pat.length; i++) {
        const c = pat[i];
        // Accept normal `{id}` cells and compact `.p` array cells ["id",...].
        var cid = c && (Array.isArray(c) ? c[0] : c.id);
        parts.push(cid ? cid : "_");
      }
      // Include dimensions so a resize is detected even if some IDs match
      const w = (project.settings && project.settings.sW) || project.w || 0;
      const h = (project.settings && project.settings.sH) || project.h || 0;
      // Include bsLines (backstitch) so backstitch-only edits produce a different fingerprint
      // and are classified as 'conflict' rather than 'merge-tracking'. Without this, two
      // charts with the same stitch-colour grid but different backstitch layouts would merge
      // silently, discarding the remote device's backstitch work.
      var bsHash = "";
      if (project.bsLines && project.bsLines.length) {
        bsHash = "|bs:" + simpleHash(JSON.stringify(project.bsLines));
      }
      const raw = w + "x" + h + ":" + parts.join(",") + bsHash;

      if (typeof pako === "undefined" || typeof pako.deflate !== "function") {
        return "fp_" + w + "x" + h + "_" + simpleHash(raw);
      }
      return computeDeflateFingerprint(stringToUint8Array(raw), w, h);
    } catch (e) {
      return "fp_error";
    }
  }

  function simpleHash(str) {
    var hash = 0;
    for (var i = 0; i < str.length; i++) {
      hash = ((hash << 5) - hash + str.charCodeAt(i)) | 0;
    }
    return (hash >>> 0).toString(16);
  }

  // ── Sync activity log ────────────────────────────────────────────────────
  // Rolling ring buffer of the last EVENT_LOG_MAX sync events. Powers the
  // "Sync activity" modal (Concept A) so users can audit what flowed in/out
  // and from which device. Stored as a JSON array in localStorage; most
  // recent first. Failures here are silent — the log is informational.

  function getEventLog() {
    try {
      var raw = localStorage.getItem(LS_EVENT_LOG);
      if (!raw) return [];
      var arr = JSON.parse(raw);
      return Array.isArray(arr) ? arr : [];
    } catch (e) { return []; }
  }

  function clearEventLog() {
    try { localStorage.removeItem(LS_EVENT_LOG); } catch (e) {}
    try {
      if (typeof window !== "undefined" && window.dispatchEvent) {
        window.dispatchEvent(new CustomEvent("cs:syncEventLogChanged"));
      }
    } catch (e) {}
  }

  function _logEvent(evt) {
    if (!evt || typeof evt !== "object") return;
    var entry = {
      id: "ev_" + Date.now() + "_" + Math.random().toString(36).slice(2, 6),
      ts: evt.ts || new Date().toISOString(),
      type: String(evt.type || "info"),
      direction: evt.direction || null,        // "in" | "out" | null
      deviceId: evt.deviceId || null,
      deviceName: evt.deviceName || null,
      fileName: evt.fileName || null,
      projectCount: (typeof evt.projectCount === "number") ? evt.projectCount : null,
      conflicts: (typeof evt.conflicts === "number") ? evt.conflicts : null,
      message: evt.message || null
    };
    var log = getEventLog();
    log.unshift(entry);
    if (log.length > EVENT_LOG_MAX) log.length = EVENT_LOG_MAX;
    try { localStorage.setItem(LS_EVENT_LOG, JSON.stringify(log)); } catch (e) {}
    try {
      if (typeof window !== "undefined" && window.dispatchEvent) {
        window.dispatchEvent(new CustomEvent("cs:syncEventLogChanged", { detail: { entry: entry } }));
      }
    } catch (e) {}
  }

  // ── Per-device "last imported" tracking ─────────────────────────────────
  // Records the most recent successful import per source device, so the
  // "Devices in this folder" panel (Concept B) can show "imported ✓" next
  // to each device row.

  function getLastImportPerDevice() {
    try {
      var raw = localStorage.getItem(LS_LAST_IMPORT_PER_DEVICE);
      if (!raw) return {};
      var obj = JSON.parse(raw);
      return (obj && typeof obj === "object") ? obj : {};
    } catch (e) { return {}; }
  }

  function _recordDeviceImport(syncObj, fileLastModified) {
    if (!syncObj || !syncObj._deviceId) return;
    var map = getLastImportPerDevice();
    map[syncObj._deviceId] = {
      at: new Date().toISOString(),
      fileLastModified: fileLastModified || null,
      // Per-device dedup key used by checkForUpdates. Recording the source
      // file's _createdAt (rather than only the wall-clock "at") lets us
      // compare incoming files apples-to-apples against the last one we
      // imported FROM THIS DEVICE, instead of against a single global
      // timestamp that gets poisoned by the most recent peer's clock.
      // This was the root cause of the "changes from Device B never appear
      // on Device A" bug when multiple devices had drifting clocks.
      fileCreatedAt: (syncObj && syncObj._createdAt) || null,
      deviceName: syncObj._deviceName || null,
      projectCount: (syncObj.projects && syncObj.projects.length) || 0
    };
    // QW2: cap the per-device map at 100 entries to bound localStorage
    // growth for power users who sync with many devices over time. Each
    // entry is ~150 bytes; 100 keeps us well under any sane localStorage
    // quota (~5 MB browser default). Eviction is by oldest `at` timestamp
    // — the device we haven't heard from in the longest time. The current
    // device is always preserved (it was just inserted/updated). The
    // while loop guards against the rare case where the oldest entry IS
    // the current device (e.g. corrupted timestamp): we keep scanning
    // until we've actually evicted enough non-current entries.
    var keys = Object.keys(map);
    if (keys.length > 100) {
      keys.sort(function (a, b) {
        var ta = (map[a] && map[a].at) ? Date.parse(map[a].at) : 0;
        var tb = (map[b] && map[b].at) ? Date.parse(map[b].at) : 0;
        return ta - tb; // oldest first
      });
      var needToDrop = keys.length - 100;
      var dropped = 0;
      for (var i = 0; i < keys.length && dropped < needToDrop; i++) {
        if (keys[i] !== syncObj._deviceId) {
          delete map[keys[i]];
          dropped++;
        }
      }
    }
    try { localStorage.setItem(LS_LAST_IMPORT_PER_DEVICE, JSON.stringify(map)); } catch (e) {}
  }

  // ── Stash DB helpers ─────────────────────────────────────────────────────

  function openManagerDB() {
    return new Promise(function (resolve, reject) {
      var req = indexedDB.open("stitch_manager_db", 1);
      req.onupgradeneeded = function (e) {
        var db = e.target.result;
        if (!db.objectStoreNames.contains("manager_state")) {
          db.createObjectStore("manager_state");
        }
      };
      req.onsuccess = function () { resolve(req.result); };
      req.onerror = function () { reject(req.error); };
    });
  }

  function readManagerStore() {
    return openManagerDB().then(function (db) {
      return new Promise(function (resolve, reject) {
        var tx = db.transaction("manager_state", "readonly");
        var store = tx.objectStore("manager_state");
        var result = {};
        var cursorReq = store.openCursor();
        cursorReq.onsuccess = function (e) {
          var cursor = e.target.result;
          if (cursor) {
            result[cursor.key] = cursor.value;
            cursor.continue();
          } else {
            db.close();
            resolve(result);
          }
        };
        cursorReq.onerror = function () { db.close(); reject(cursorReq.error); };
      });
    }).catch(function (e) {
      console.warn("SyncEngine: could not read stash DB:", e);
      return {};
    });
  }

  // ── Export ────────────────────────────────────────────────────────────────

  async function exportSync(options) {
    var opts = options || {};
    var mode = opts.mode || "full";   // "full" | "incremental"
    // Per-feature toggles. Defaults match the design recommendation in
    // reports/sync-7-preferences-design.md (D6 = recommendation A): charts
    // and progress always sync; stash on by default; prefs off by default;
    // palettes on by default. UserPrefs reads (window.UserPrefs.get) take
    // precedence so the Preferences panel can flip them at runtime.
    function _pref(key, fallback) {
      try {
        if (window.UserPrefs && typeof window.UserPrefs.get === "function") {
          var v = window.UserPrefs.get(key);
          return (v === undefined || v === null) ? fallback : v;
        }
      } catch (e) {}
      return fallback;
    }
    var includeStash = (opts.includeStash !== undefined)
      ? !!opts.includeStash
      : !!_pref("sync.includeStash", true);
    var includePrefs = (opts.includePrefs !== undefined)
      ? !!opts.includePrefs
      : !!_pref("sync.includePrefs", false);
    var includePalettes = (opts.includePalettes !== undefined)
      ? !!opts.includePalettes
      : !!_pref("sync.includePalettes", true);

    // Flush any in-flight React state before reading
    if (window.__flushProjectToIDB) {
      try { await window.__flushProjectToIDB(); } catch (e) {}
    }

    // Read all projects
    var allProjects = [];
    try {
      var metaList = await ProjectStorage.listProjects();
      // PERF (perf-5 #1): batch project fetches in parallel via Promise.all
      // instead of awaiting each get() sequentially.
      var fetched = await Promise.all(metaList.map(function(m){ return ProjectStorage.get(m.id); }));
      for (var i = 0; i < fetched.length; i++) {
        if (fetched[i]) {
          allProjects.push(fetched[i]);
        } else {
          // VER-SYNC-001: project entry exists in metadata but the IDB record
          // returned null (record missing or read race). Log so the developer can
          // investigate — we skip it rather than crashing the export.
          console.warn("SyncEngine: project " + (metaList[i] && metaList[i].id) + " returned null from IDB, skipping export.");
        }
      }
    } catch (e) {
      console.error("SyncEngine.export: failed to read projects:", e);
      throw new Error("Could not read projects from database.");
    }

    // For incremental mode, filter to only projects changed since last export
    var lastExport = null;
    if (mode === "incremental") {
      try { lastExport = localStorage.getItem(LS_LAST_EXPORT); } catch (e) {}
    }

    var projectsToExport = allProjects;
    if (mode === "incremental" && lastExport) {
      var since = new Date(lastExport);
      projectsToExport = allProjects.filter(function (p) {
        return !p.updatedAt || new Date(p.updatedAt) > since;
      });
    }

    // Build the sync object
    var syncObj = {
      _format: SYNC_FORMAT,
      _version: SYNC_VERSION,
      _createdAt: new Date().toISOString(),
      _deviceId: getDeviceId(),
      _deviceName: getDeviceName(),
      _mode: mode,
      _since: (mode === "incremental" && lastExport) ? lastExport : null,
      _projectCountTotal: allProjects.length,
      // VER-SYNC-009: include local tombstones so the importing device knows
      // which projects this device has intentionally deleted. The receiving
      // device should not re-import any project whose id appears in this list.
      deletedProjectIds: getLocalTombstones(),
      projects: projectsToExport.map(function (p) {
        return {
          id: p.id,
          updatedAt: p.updatedAt,
          fingerprint: computeFingerprint(p),
          data: p
        };
      })
    };

    // Include stash data
    if (includeStash) {
      try {
        syncObj.stash = await readManagerStore();
      } catch (e) {
        syncObj.stash = {};
      }
    }

    // Build the prefs envelope. Palettes and user preferences are tracked
    // independently. crossstitch_active_project is per-device UI state and is
    // never included. The prefs envelope is omitted entirely when neither
    // includePalettes nor includePrefs is true.
    var prefsEnvelope = {};

    if (includePalettes) {
      try {
        var pal = localStorage.getItem("crossstitch_custom_palettes");
        if (pal !== null) prefsEnvelope["crossstitch_custom_palettes"] = pal;
      } catch (e) {}
    }

    if (includePrefs) {
      SYNC_PREF_ALLOWLIST.forEach(function (key) {
        try {
          var val = localStorage.getItem(key);
          if (val !== null) prefsEnvelope[key] = val;
        } catch (e) {}
      });
    }

    if (Object.keys(prefsEnvelope).length > 0) {
      syncObj.prefs = prefsEnvelope;
    }

    // Record export timestamp
    var exportTime = syncObj._createdAt;
    try { localStorage.setItem(LS_LAST_EXPORT, exportTime); } catch (e) {}

    // Encryption layer (opt-in). If the user has enabled encryption but
    // hasn't set a session passphrase, we throw a typed error so callers
    // (download buttons, folder writers) can prompt without having to
    // sniff the message string. The plaintext envelope fields are kept
    // visible — see the rationale block above _encryptSyncObj.
    if (isEncryptionEnabled()) {
      if (!_sessionPassphrase) throw EncryptionError("passphrase_required", "Encryption is enabled but no passphrase has been set this session");
      try {
        return await _encryptSyncObj(syncObj, _sessionPassphrase);
      } catch (e) {
        if (e && e.name === "EncryptionError") throw e;
        throw EncryptionError("unavailable", (e && e.message) || "Encryption failed");
      }
    }

    return syncObj;
  }

  // ── Compress / Decompress ────────────────────────────────────────────────

  function compress(syncObj) {
    var json = JSON.stringify(syncObj);
    var bytes;
    if (typeof TextEncoder !== "undefined") {
      bytes = new TextEncoder().encode(json);
    } else {
      bytes = [];
      for (var i = 0; i < json.length; i++) bytes.push(json.charCodeAt(i) & 0xff);
      bytes = new Uint8Array(bytes);
    }
    return pako.deflate(bytes);
  }

  function decompress(arrayBuffer) {
    var compressed = new Uint8Array(arrayBuffer);
    var inflated = pako.inflate(compressed);
    var json;
    if (typeof TextDecoder !== "undefined") {
      json = new TextDecoder().decode(inflated);
    } else {
      json = "";
      for (var i = 0; i < inflated.length; i++) json += String.fromCharCode(inflated[i]);
    }
    return JSON.parse(json);
  }

  // ── Encryption (optional, opt-in) ────────────────────────────────────────
  //
  // Design: AES-GCM-256 over the JSON-serialised "inner payload" (projects,
  // stash, prefs, deletedProjectIds and the few count/since metadata
  // fields). The outer envelope (_format, _version, _encrypted, _encryption,
  // _createdAt, _deviceId, _deviceName, _mode) stays in plaintext so the
  // existing devices-in-folder panel and validate() heuristic keep working
  // without a passphrase.
  //
  // Key derivation: PBKDF2-SHA256, 310,000 iterations (OWASP 2023 floor).
  // Per-file random 16-byte salt; per-file random 12-byte IV. Derived keys
  // are cached per (passphrase, saltHex) tuple in this session so a folder
  // tick processing five files only pays the PBKDF2 cost once.
  //
  // Passphrase lifetime: kept in module-level memory only. setEncryption-
  // Passphrase() persists nothing; clearEncryptionPassphrase() wipes it.
  // The user must re-enter on next session — recommendation 1 of the
  // proposal (session-only) without the sessionStorage hop, since this
  // PWA may be installed and run with no separate "session" anyway.
  //
  // See reports/sync-reference/proposals/encrypted-csync-payload.md.

  var ENC_PBKDF2_ITERATIONS = 310000;
  var ENC_SALT_BYTES = 16;
  var ENC_IV_BYTES = 12;
  var ENC_INNER_FIELDS = ["projects", "stash", "prefs", "deletedProjectIds", "_projectCountTotal", "_since"];

  var _sessionPassphrase = null;
  var _derivedKeyCache = new Map(); // key: passphrase + "|" + saltHex + "|" + iter, val: CryptoKey

  function isEncryptionAvailable() {
    try {
      return typeof crypto !== "undefined"
        && !!crypto.subtle
        && typeof TextEncoder !== "undefined";
    } catch (e) { return false; }
  }

  function isEncryptionEnabled() {
    try { return localStorage.getItem(LS_ENC_ENABLED) === "1"; } catch (e) { return false; }
  }

  function setEncryptionEnabled(flag) {
    try {
      if (flag) localStorage.setItem(LS_ENC_ENABLED, "1");
      else localStorage.removeItem(LS_ENC_ENABLED);
    } catch (e) {}
  }

  function setEncryptionPassphrase(p) {
    if (p == null || p === "") { _sessionPassphrase = null; return; }
    _sessionPassphrase = String(p);
  }

  function clearEncryptionPassphrase() {
    _sessionPassphrase = null;
    _derivedKeyCache.clear();
  }

  function getEncryptionStatus() {
    return {
      available: isEncryptionAvailable(),
      enabled: isEncryptionEnabled(),
      hasPassphrase: !!_sessionPassphrase
    };
  }

  // Typed error so callers (UI, watcher) can distinguish "user input
  // needed" from "file is genuinely broken".
  function EncryptionError(code, message) {
    var e = new Error(message || code);
    e.name = "EncryptionError";
    e.code = code; // "passphrase_required" | "incorrect_passphrase" | "unavailable" | "malformed"
    return e;
  }

  function _bytesToHex(u8) {
    var s = "";
    for (var i = 0; i < u8.length; i++) {
      var h = u8[i].toString(16);
      if (h.length === 1) h = "0" + h;
      s += h;
    }
    return s;
  }

  function _hexToBytes(hex) {
    if (typeof hex !== "string" || hex.length % 2 !== 0) throw EncryptionError("malformed", "Bad hex");
    var u8 = new Uint8Array(hex.length / 2);
    for (var i = 0; i < u8.length; i++) {
      u8[i] = parseInt(hex.substr(i * 2, 2), 16);
    }
    return u8;
  }

  function _bytesToBase64(u8) {
    // btoa works on binary strings; chunk to avoid call-stack blowups on
    // multi-MB ciphertexts.
    var s = "";
    var chunk = 0x8000;
    for (var i = 0; i < u8.length; i += chunk) {
      s += String.fromCharCode.apply(null, u8.subarray(i, i + chunk));
    }
    return btoa(s);
  }

  function _base64ToBytes(b64) {
    if (typeof b64 !== "string") throw EncryptionError("malformed", "Bad base64");
    var bin = atob(b64);
    var u8 = new Uint8Array(bin.length);
    for (var i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
    return u8;
  }

  async function _deriveKey(passphrase, saltBytes, iterations) {
    var saltHex = _bytesToHex(saltBytes);
    var cacheKey = passphrase + "|" + saltHex + "|" + iterations;
    if (_derivedKeyCache.has(cacheKey)) return _derivedKeyCache.get(cacheKey);
    var enc = new TextEncoder();
    var pwKey = await crypto.subtle.importKey(
      "raw",
      enc.encode(passphrase),
      "PBKDF2",
      false,
      ["deriveKey"]
    );
    var key = await crypto.subtle.deriveKey(
      { name: "PBKDF2", salt: saltBytes, iterations: iterations, hash: "SHA-256" },
      pwKey,
      { name: "AES-GCM", length: 256 },
      false,
      ["encrypt", "decrypt"]
    );
    _derivedKeyCache.set(cacheKey, key);
    return key;
  }

  // Encrypts the inner payload of `syncObj`, returning a new object with
  // the inner fields removed and replaced with `_encrypted: true`,
  // `_encryption: {...}`, `_ciphertext: base64`. Plaintext envelope fields
  // are passed through unchanged.
  async function _encryptSyncObj(syncObj, passphrase) {
    if (!isEncryptionAvailable()) throw EncryptionError("unavailable", "Web Crypto not available");
    if (!passphrase) throw EncryptionError("passphrase_required", "Passphrase required for encryption");

    var salt = crypto.getRandomValues(new Uint8Array(ENC_SALT_BYTES));
    var iv = crypto.getRandomValues(new Uint8Array(ENC_IV_BYTES));
    var key = await _deriveKey(passphrase, salt, ENC_PBKDF2_ITERATIONS);

    var inner = {};
    for (var i = 0; i < ENC_INNER_FIELDS.length; i++) {
      var f = ENC_INNER_FIELDS[i];
      if (Object.prototype.hasOwnProperty.call(syncObj, f)) inner[f] = syncObj[f];
    }
    var plaintext = new TextEncoder().encode(JSON.stringify(inner));
    var ciphertext = await crypto.subtle.encrypt({ name: "AES-GCM", iv: iv }, key, plaintext);

    // Build the encrypted envelope. Strip the inner fields so consumers
    // that don't decrypt can't accidentally read stale data.
    var out = {};
    for (var k in syncObj) {
      if (!Object.prototype.hasOwnProperty.call(syncObj, k)) continue;
      if (ENC_INNER_FIELDS.indexOf(k) !== -1) continue;
      out[k] = syncObj[k];
    }
    out._encrypted = true;
    out._encryption = {
      algorithm: "AES-GCM-256",
      kdf: "PBKDF2-SHA256",
      iterations: ENC_PBKDF2_ITERATIONS,
      saltHex: _bytesToHex(salt),
      ivHex: _bytesToHex(iv)
    };
    out._ciphertext = _bytesToBase64(new Uint8Array(ciphertext));
    return out;
  }

  // Decrypts an encrypted envelope using the supplied passphrase, returning
  // a fully reconstructed syncObj with the inner fields back in place.
  async function _decryptSyncObj(syncObj, passphrase) {
    if (!isEncryptionAvailable()) throw EncryptionError("unavailable", "Web Crypto not available");
    if (!passphrase) throw EncryptionError("passphrase_required", "Passphrase required to decrypt");
    if (!syncObj || !syncObj._encrypted) return syncObj;
    var meta = syncObj._encryption || {};
    if (!meta.saltHex || !meta.ivHex) throw EncryptionError("malformed", "Missing encryption metadata");
    if (typeof syncObj._ciphertext !== "string") throw EncryptionError("malformed", "Missing ciphertext");

    var salt = _hexToBytes(meta.saltHex);
    var iv = _hexToBytes(meta.ivHex);
    var iterations = (typeof meta.iterations === "number" && meta.iterations > 0)
      ? meta.iterations : ENC_PBKDF2_ITERATIONS;
    var key = await _deriveKey(passphrase, salt, iterations);

    var ctBytes = _base64ToBytes(syncObj._ciphertext);
    var plaintextBuf;
    try {
      plaintextBuf = await crypto.subtle.decrypt({ name: "AES-GCM", iv: iv }, key, ctBytes);
    } catch (e) {
      // GCM tag verification failed — wrong passphrase or tampered file.
      throw EncryptionError("incorrect_passphrase", "Could not decrypt with this passphrase");
    }
    var inner;
    try {
      inner = JSON.parse(new TextDecoder().decode(plaintextBuf));
    } catch (e) {
      throw EncryptionError("malformed", "Decrypted payload was not valid JSON");
    }

    // Stitch back: outer envelope minus the encryption fields, plus the
    // recovered inner fields.
    var out = {};
    for (var k in syncObj) {
      if (!Object.prototype.hasOwnProperty.call(syncObj, k)) continue;
      if (k === "_encrypted" || k === "_encryption" || k === "_ciphertext") continue;
      out[k] = syncObj[k];
    }
    if (inner && typeof inner === "object") {
      for (var ik in inner) {
        if (Object.prototype.hasOwnProperty.call(inner, ik)) out[ik] = inner[ik];
      }
    }
    return out;
  }

  // Public helper for the UI: decrypt an envelope using the session
  // passphrase (or an override). Returns the full syncObj or throws an
  // EncryptionError the caller can branch on.
  async function decryptSyncObj(syncObj, passphrase) {
    var p = (passphrase != null && passphrase !== "") ? String(passphrase) : _sessionPassphrase;
    return _decryptSyncObj(syncObj, p);
  }

  // ── Download ─────────────────────────────────────────────────────────────

  async function downloadSync(options) {
    var syncObj = await exportSync(options);
    var compressed = compress(syncObj);
    var blob = new Blob([compressed], { type: "application/octet-stream" });
    var url = URL.createObjectURL(blob);
    var a = document.createElement("a");
    a.href = url;
    var date = new Date().toISOString().slice(0, 10);
    var deviceName = getDeviceName();
    var namePart = deviceName ? "-" + deviceName.replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 20) : "";
    a.download = "cross-stitch-sync-" + date + namePart + ".csync";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    return syncObj;
  }

  // ── Read a .csync file ───────────────────────────────────────────────────

  function readSyncFile(file) {
    return new Promise(function (resolve, reject) {
      var reader = new FileReader();
      reader.onload = function () {
        try {
          var syncObj = decompress(reader.result);
          resolve(syncObj);
        } catch (e) {
          reject(new Error("Could not decompress sync file. It may be corrupted."));
        }
      };
      reader.onerror = function () { reject(new Error("Could not read file.")); };
      reader.readAsArrayBuffer(file);
    });
  }

  // ── Validation ───────────────────────────────────────────────────────────

  function validate(syncObj) {
    if (!syncObj || syncObj._format !== SYNC_FORMAT) {
      return { valid: false, error: "Not a valid Cross Stitch sync file." };
    }
    if (syncObj._version !== SYNC_VERSION) {
      return { valid: false, error: "Unsupported sync file version: " + syncObj._version + ". Please update the app." };
    }
    // Encrypted envelopes are valid even without a `projects` array — the
    // projects live inside the ciphertext and only become visible after
    // decryption. validate() is intentionally cheap; the decryption flow
    // re-runs validate() on the recovered object, where the projects-array
    // assertion below will fire.
    if (syncObj._encrypted) {
      var encMeta = syncObj._encryption || {};
      if (!encMeta.saltHex || !encMeta.ivHex || typeof syncObj._ciphertext !== "string") {
        return { valid: false, error: "Encrypted sync file is missing encryption metadata." };
      }
      return {
        valid: true,
        summary: {
          createdAt: syncObj._createdAt || "unknown",
          deviceId: syncObj._deviceId || "unknown",
          deviceName: syncObj._deviceName || "",
          mode: syncObj._mode || "full",
          encrypted: true,
          // Project / stash counts are unknown until decryption.
          projectCount: 0,
          totalProjectCount: 0,
          hasStash: false,
          hasPrefs: false
        }
      };
    }
    if (!Array.isArray(syncObj.projects)) {
      return { valid: false, error: "Sync file contains no project data." };
    }
    var summary = {
      createdAt: syncObj._createdAt || "unknown",
      deviceId: syncObj._deviceId || "unknown",
      deviceName: syncObj._deviceName || "",
      mode: syncObj._mode || "full",
      projectCount: syncObj.projects.length,
      totalProjectCount: syncObj._projectCountTotal || syncObj.projects.length,
      hasStash: !!(syncObj.stash && (syncObj.stash.threads || syncObj.stash.patterns)),
      hasPrefs: !!(syncObj.prefs && Object.keys(syncObj.prefs).length > 0)
    };
    return { valid: true, summary: summary };
  }

  // ── Classification (used by merge engine) ────────────────────────────────
  //
  // History — id-only matching produced the duplication bug:
  //   When the same .oxs file was imported on two devices BEFORE either
  //   connected to sync, each device generated an independent project id
  //   (proj_<ts>_<rand>). The classifier saw "no local match by id" on
  //   both sides and called both 'new-remote'. executeImport then dutifully
  //   wrote the remote alongside the local one — duplicate forever.
  //
  // Fix — fingerprint-first, id-second. When the remote id is unknown
  // locally, fall back to matching by chart fingerprint (computeFingerprint
  // already keys on dimensions + cell ids and ignores tracking state).
  // A fingerprint match is treated as 'merge-tracking' with an idRewrite
  // record so executeImport can converge both devices on a single
  // canonical id (lexicographically smallest — deterministic across
  // devices, no clock or device-id required).

  function buildFingerprintIndex(localProjectsArray) {
    var index = Object.create(null);
    for (var i = 0; i < localProjectsArray.length; i++) {
      var p = localProjectsArray[i];
      if (!p) continue;
      var fp = computeFingerprint(p);
      if (fp === "empty" || fp === "fp_error") continue;
      if (!index[fp]) index[fp] = [];
      index[fp].push(p);
    }
    return index;
  }

  function pickCanonicalId(idA, idB) {
    if (!idA) return idB;
    if (!idB) return idA;
    return (idA < idB) ? idA : idB;
  }

  function classifyProjects(remoteProjects, localProjectsMap) {
    // Collect tombstones from both local and remote so we can skip projects
    // that were intentionally deleted on either device.
    // localTombstoneSet: ids deleted on this device (never re-import them).
    var localTombstones = getLocalTombstones();
    var localTombstoneSet = Object.create(null);
    for (var ti = 0; ti < localTombstones.length; ti++) localTombstoneSet[localTombstones[ti]] = true;
    // Build fingerprint index from local projects so we can match remotes
    // whose ids differ but whose chart contents are identical. Only used
    // when there is no direct id match.
    var localArr = [];
    var localKeys = Object.keys(localProjectsMap);
    for (var li = 0; li < localKeys.length; li++) {
      if (localProjectsMap[localKeys[li]]) localArr.push(localProjectsMap[localKeys[li]]);
    }
    var byFp = buildFingerprintIndex(localArr);
    // Track which local projects have already been claimed (by id match or
    // a previous fingerprint match in this batch) so two remotes can't both
    // claim the same local project.
    var claimed = Object.create(null);

    var results = [];
    for (var i = 0; i < remoteProjects.length; i++) {
      var remote = remoteProjects[i];

      // VER-SYNC-009: skip remote projects that this device has tombstoned.
      // If the local user already deleted this project, do not re-import it
      // — treat it as if it were identical (already handled) and continue.
      if (localTombstoneSet[remote.id]) continue;

      var local = localProjectsMap[remote.id] || null;
      var entry = {
        id: remote.id,
        remote: remote,
        local: local,
        classification: "new-remote"
      };

      if (local) {
        claimed[local.id] = true;
        var localUpdated = local.updatedAt || "";
        var remoteUpdated = remote.updatedAt || "";
        if (localUpdated === remoteUpdated) {
          entry.classification = "identical";
        } else {
          // Both exist and differ — check if the chart structure changed
          var localFP = computeFingerprint(local);
          var remoteFP = remote.fingerprint || computeFingerprint(remote.data);
          if (localFP === remoteFP) {
            entry.classification = "merge-tracking";
          } else {
            entry.classification = "conflict";
          }
        }
      } else {
        // No id match — try fingerprint match. This is the duplication-bug fix.
        var remoteFP2 = remote.fingerprint || (remote.data ? computeFingerprint(remote.data) : null);
        if (remoteFP2 && byFp[remoteFP2]) {
          var candidates = byFp[remoteFP2];
          var matched = null;
          for (var ci = 0; ci < candidates.length; ci++) {
            if (!claimed[candidates[ci].id]) { matched = candidates[ci]; break; }
          }
          if (matched) {
            claimed[matched.id] = true;
            entry.local = matched;
            // Same chart, different id. Treat as merge-tracking and record
            // an id rewrite so executeImport converges both devices on a
            // single canonical id.
            entry.classification = "merge-tracking";
            entry.idRewrite = {
              remoteId: remote.id,
              localId: matched.id,
              canonicalId: pickCanonicalId(remote.id, matched.id)
            };
          }
        }
      }
      results.push(entry);
    }
    return results;
  }

  // ── Merge helpers (core logic, called by import in session 2) ────────────

  function mergeDoneArrays(localDone, remoteDone, length) {
    if (!localDone && !remoteDone) return null;
    if (!localDone) return remoteDone;
    if (!remoteDone) return localDone;
    var merged = new Array(length);
    for (var i = 0; i < length; i++) {
      merged[i] = (localDone[i] || remoteDone[i]) ? 1 : 0;
    }
    return merged;
  }

  function mergeSessions(localSessions, remoteSessions) {
    if (!localSessions || !localSessions.length) return remoteSessions || [];
    if (!remoteSessions || !remoteSessions.length) return localSessions || [];
    var seen = {};
    var merged = [];
    // Use start timestamp as dedup key; fall back to date+duration
    function sessionKey(s) {
      if (s.start) return "s:" + s.start;
      return "d:" + (s.date || "") + ":" + (s.durationMinutes || 0) + ":" + (s.netStitches || 0);
    }
    for (var i = 0; i < localSessions.length; i++) {
      var key = sessionKey(localSessions[i]);
      if (!seen[key]) { seen[key] = true; merged.push(localSessions[i]); }
    }
    for (var j = 0; j < remoteSessions.length; j++) {
      var key2 = sessionKey(remoteSessions[j]);
      if (!seen[key2]) { seen[key2] = true; merged.push(remoteSessions[j]); }
    }
    merged.sort(function (a, b) {
      return new Date(a.start || a.date || 0) - new Date(b.start || b.date || 0);
    });
    return merged;
  }

  // Total duration (seconds) recorded across a session array. Mirrors the
  // field precedence used by ProjectStorage.buildMeta so the two agree.
  function _sumSessionSeconds(sessions) {
    if (!sessions || !sessions.length) return 0;
    var total = 0;
    for (var i = 0; i < sessions.length; i++) {
      var s = sessions[i];
      if (!s) continue;
      if (typeof s.durationSeconds === "number" && isFinite(s.durationSeconds)) {
        total += s.durationSeconds;
      } else if (typeof s.durationMinutes === "number" && isFinite(s.durationMinutes)) {
        total += s.durationMinutes * 60;
      }
    }
    return total;
  }

  // ── Field-coverage helpers (sync fix #7) ─────────────────────────────────
  //
  // mergeTrackingProgress takes the LOCAL project as its base, so any field it
  // doesn't explicitly merge silently keeps the local value forever. That is
  // why a "successfully merged" pattern could still look stale: per-day stitch
  // history, fractional stitches, completion status, thumbnail and notes never
  // crossed between devices. Every helper below must be idempotent — these run
  // unattended on every peer publish now that merge-tracking auto-applies.

  // Project-level metadata resolved by "newer updatedAt wins". These are small,
  // user-editable, and CAN legitimately be cleared, so an empty remote value is
  // allowed to replace a non-empty local one when the remote is newer.
  var META_NEWEST_WINS = ["name", "state", "finishStatus", "projectColor",
                          "designer", "description", "notes"];

  // Derived or expensive assets. Newer still wins, but we never replace a
  // present value with an absent one — losing a thumbnail or the source image
  // because the other device hadn't generated one yet is pure data loss, not
  // an edit the user intended.
  var META_PREFER_PRESENT = ["thumbnail", "imgData", "palette", "settings"];

  // Union of `[index, detail]` pair arrays — the serialised-Map shape used by
  // halfStitches ([idx, {fwd, bck}]) and partialStitches ([k, {TL,TR,BL,BR}]).
  // Local wins per sub-key so a device never loses its own fractional work;
  // remote contributes only the positions local hasn't recorded.
  function mergeIndexedPairs(localPairs, remotePairs) {
    var lp = Array.isArray(localPairs) ? localPairs : [];
    var rp = Array.isArray(remotePairs) ? remotePairs : [];
    if (!lp.length && !rp.length) return Array.isArray(localPairs) ? localPairs : (Array.isArray(remotePairs) ? remotePairs : []);
    var byIndex = Object.create(null);
    var order = [];
    function absorb(pairs, isLocal) {
      for (var i = 0; i < pairs.length; i++) {
        var pair = pairs[i];
        if (!Array.isArray(pair) || pair.length < 2) continue;
        var key = String(pair[0]);
        var detail = pair[1];
        if (!Object.prototype.hasOwnProperty.call(byIndex, key)) {
          byIndex[key] = _clone(detail);
          order.push({ key: key, raw: pair[0] });
          continue;
        }
        if (isLocal) continue; // local already claimed this index
        var existing = byIndex[key];
        if (existing && detail && typeof existing === "object" && typeof detail === "object") {
          var sub = Object.keys(detail);
          for (var s = 0; s < sub.length; s++) {
            if (existing[sub[s]] === undefined || existing[sub[s]] === null) {
              existing[sub[s]] = _clone(detail[sub[s]]);
            }
          }
        }
      }
    }
    absorb(lp, true);
    absorb(rp, false);
    var out = [];
    for (var o = 0; o < order.length; o++) out.push([order[o].raw, byIndex[order[o].key]]);
    return out;
  }

  // Union of per-day stitch counts ([{date, count}]). Takes the MAX count per
  // date rather than the sum: summing is not idempotent, so a project re-merged
  // after each peer edit would inflate its history without bound. The cost is
  // under-counting a day both devices stitched on — the same trade-off, and for
  // the same reason, as merged totalTime.
  function mergeStitchLogs(localLog, remoteLog) {
    var ll = Array.isArray(localLog) ? localLog : [];
    var rl = Array.isArray(remoteLog) ? remoteLog : [];
    if (!ll.length && !rl.length) return Array.isArray(localLog) ? localLog : (Array.isArray(remoteLog) ? remoteLog : []);
    var byDate = Object.create(null);
    function absorb(entries) {
      for (var i = 0; i < entries.length; i++) {
        var e = entries[i];
        if (!e || !e.date) continue;
        var count = (typeof e.count === "number" && isFinite(e.count)) ? e.count : 0;
        if (byDate[e.date] === undefined || count > byDate[e.date]) byDate[e.date] = count;
      }
    }
    absorb(ll);
    absorb(rl);
    var dates = Object.keys(byDate).sort();
    var out = [];
    for (var d = 0; d < dates.length; d++) out.push({ date: dates[d], count: byDate[dates[d]] });
    return out;
  }

  // Earliest / latest of two ISO timestamps, ignoring blanks.
  function _earlierIso(a, b) {
    if (!a) return b || null;
    if (!b) return a;
    return (new Date(a).getTime() <= new Date(b).getTime()) ? a : b;
  }
  function _laterIso(a, b) {
    if (!a) return b || null;
    if (!b) return a;
    return (new Date(a).getTime() >= new Date(b).getTime()) ? a : b;
  }

  function mergeTrackingProgress(local, remote, metaOverrides) {
    // Merge a project where the chart structure is identical but tracking differs.
    // Take the LOCAL project as base, deep-clone mutable sub-objects to avoid
    // mutating the original local data.
    // metaOverrides: optional { name: 'keep-local'|'keep-remote', state: ... }
    // from the SyncReviewGate conflict resolution UI. When absent, name/state
    // are resolved automatically using updatedAt as a tiebreaker.
    var merged = Object.assign({}, local);
    // PERF (perf-6 #5): structuredClone is ~2-5x faster than JSON parse/stringify
    // for these merge buffers and avoids round-tripping through string form.
    merged.halfDone = local.halfDone ? _clone(local.halfDone) : {};
    merged.threadOwned = local.threadOwned ? _clone(local.threadOwned) : {};
    merged.parkMarkers = local.parkMarkers ? _clone(local.parkMarkers) : [];
    merged.achievedMilestones = local.achievedMilestones ? _clone(local.achievedMilestones) : [];

    // Merge done arrays (union — stitches completed on either device stay done)
    var patLen = (merged.pattern && merged.pattern.length) || 0;
    merged.done = mergeDoneArrays(local.done, remote.done, patLen);

    // Merge halfDone (per-cell quarter-stitch tracking)
    if (remote.halfDone && typeof remote.halfDone === "object") {
      if (!merged.halfDone) merged.halfDone = {};
      var keys = Object.keys(remote.halfDone);
      for (var i = 0; i < keys.length; i++) {
        var k = keys[i];
        if (!merged.halfDone[k]) {
          merged.halfDone[k] = remote.halfDone[k];
        } else {
          // Merge individual quarter positions
          var lh = merged.halfDone[k];
          var rh = remote.halfDone[k];
          if (typeof lh === "object" && typeof rh === "object") {
            var positions = ["TL", "TR", "BL", "BR"];
            for (var p = 0; p < positions.length; p++) {
              if (rh[positions[p]] && !lh[positions[p]]) lh[positions[p]] = rh[positions[p]];
            }
          }
        }
      }
    }

    // Merge sessions (deduplicate by timestamp)
    merged.statsSessions = mergeSessions(local.statsSessions, remote.statsSessions);
    merged.sessions = mergeSessions(local.sessions, remote.sessions);

    // Total stitching time must be IDEMPOTENT under repeated merges. This was
    // a plain sum (local + remote), which is not: every time the peer edited
    // the project and we re-merged, its entire accumulated total was added to
    // ours again. A + B = 100/0 converged correctly the first time, but after
    // the peer stitched 10 more seconds we computed 100 + 110 = 210 instead of
    // 110, compounding with every subsequent edit. Auto-applying merge-tracking
    // turns that from an occasional manual-merge glitch into continuous drift.
    //
    // The session arrays are already deduplicated unions keyed on start time,
    // so their combined duration is both idempotent and the most accurate
    // record of genuine cross-device work. Take the largest of the three
    // candidates: max() of idempotent inputs is itself idempotent, and the
    // session sum recovers the true total whenever session records exist
    // (the normal case — the tracker writes one per stitching session).
    var mergedSessionSeconds = Math.max(
      _sumSessionSeconds(merged.statsSessions),
      _sumSessionSeconds(merged.sessions)
    );
    merged.totalTime = Math.max(
      local.totalTime || 0,
      remote.totalTime || 0,
      mergedSessionSeconds
    );

    // Merge threadOwned (union: keep owned/tobuy status from either side)
    if (remote.threadOwned && typeof remote.threadOwned === "object") {
      if (!merged.threadOwned) merged.threadOwned = {};
      var tKeys = Object.keys(remote.threadOwned);
      for (var t = 0; t < tKeys.length; t++) {
        if (!merged.threadOwned[tKeys[t]]) {
          merged.threadOwned[tKeys[t]] = remote.threadOwned[tKeys[t]];
        }
      }
    }

    // Merge park markers (union by position)
    if (remote.parkMarkers && remote.parkMarkers.length) {
      if (!merged.parkMarkers) merged.parkMarkers = [];
      var existingPositions = {};
      for (var pm = 0; pm < merged.parkMarkers.length; pm++) {
        var marker = merged.parkMarkers[pm];
        existingPositions[marker.idx || marker.cellIdx || pm] = true;
      }
      for (var rm = 0; rm < remote.parkMarkers.length; rm++) {
        var rMarker = remote.parkMarkers[rm];
        if (!existingPositions[rMarker.idx || rMarker.cellIdx || rm]) {
          merged.parkMarkers.push(rMarker);
        }
      }
    }

    // Merge achieved milestones
    if (remote.achievedMilestones && remote.achievedMilestones.length) {
      if (!merged.achievedMilestones) merged.achievedMilestones = [];
      var existingMs = {};
      for (var mi = 0; mi < merged.achievedMilestones.length; mi++) {
        existingMs[merged.achievedMilestones[mi].pct || merged.achievedMilestones[mi].id || mi] = true;
      }
      for (var mj = 0; mj < remote.achievedMilestones.length; mj++) {
        var rMs = remote.achievedMilestones[mj];
        if (!existingMs[rMs.pct || rMs.id || mj]) merged.achievedMilestones.push(rMs);
      }
    }

    // Update timestamp to latest
    if (remote.updatedAt && (!merged.updatedAt || new Date(remote.updatedAt) > new Date(merged.updatedAt))) {
      merged.updatedAt = remote.updatedAt;
    }

    // Merge fractional-stitch records (sync fix #7). halfDone is handled above;
    // these are the serialised-Map companions that were previously dropped, so
    // quarter/half stitches worked on one device never reached the other.
    merged.halfStitches = mergeIndexedPairs(local.halfStitches, remote.halfStitches);
    merged.partialStitches = mergeIndexedPairs(local.partialStitches, remote.partialStitches);

    // Merge per-day stitch history (sync fix #7). Drives lifetime totals and
    // the activity charts, and was previously local-only.
    merged.stitchLog = mergeStitchLogs(local.stitchLog, remote.stitchLog);

    // Lifecycle timestamps: earliest start, latest touch, first completion.
    merged.startedAt = _earlierIso(local.startedAt, remote.startedAt);
    merged.lastTouchedAt = _laterIso(local.lastTouchedAt, remote.lastTouchedAt);
    merged.completedAt = _earlierIso(local.completedAt, remote.completedAt);

    // Merge project-level metadata. Default strategy: the side with the newer
    // updatedAt timestamp wins. metaOverrides can pin a field to 'keep-local'
    // or 'keep-remote' to respect explicit user choices made in the
    // SyncReviewGate conflict UI.
    //
    // The list used to be just name/state, which is why completion status,
    // colour, notes, designer, description and the thumbnail never travelled
    // between devices — a pattern could merge "successfully" and still show
    // the receiving device's months-old metadata.
    var localTs = local.updatedAt ? new Date(local.updatedAt).getTime() : 0;
    var remoteTs = remote.updatedAt ? new Date(remote.updatedAt).getTime() : 0;
    function _isPresent(v) { return v !== undefined && v !== null && v !== ""; }

    function resolveMetaField(field, preferPresent) {
      if (remote[field] === undefined) return;
      if (remote[field] === local[field]) return;
      var ovr = metaOverrides && metaOverrides[field];
      if (ovr === 'keep-remote') { merged[field] = remote[field]; return; }
      if (ovr === 'keep-local') return; // already in merged via Object.assign
      if (remoteTs <= localTs) return;  // local is newer — it wins
      // Never let a newer-but-empty remote wipe an expensive local asset.
      if (preferPresent && !_isPresent(remote[field]) && _isPresent(local[field])) return;
      merged[field] = remote[field];
    }

    for (var mfi = 0; mfi < META_NEWEST_WINS.length; mfi++) {
      resolveMetaField(META_NEWEST_WINS[mfi], false);
    }
    for (var mpi = 0; mpi < META_PREFER_PRESENT.length; mpi++) {
      resolveMetaField(META_PREFER_PRESENT[mpi], true);
    }

    return merged;
  }

  function mergeStash(localStash, remoteStash) {
    var merged = { threads: {}, patterns: [], userProfile: null };

    // Merge threads: per-thread max owned, OR for tobuy
    var localThreads = (localStash && localStash.threads) || {};
    var remoteThreads = (remoteStash && remoteStash.threads) || {};
    var allIds = Object.create(null);
    Object.keys(localThreads).forEach(function (id) { allIds[id] = true; });
    Object.keys(remoteThreads).forEach(function (id) { allIds[id] = true; });

    Object.keys(allIds).forEach(function (id) {
      var l = localThreads[id] || {};
      var r = remoteThreads[id] || {};
      var entry = {
        owned: Math.max(l.owned || 0, r.owned || 0),
        tobuy: !!(l.tobuy || r.tobuy),
        partialStatus: l.partialStatus || r.partialStatus || null,
        min_stock: Math.max(l.min_stock || 0, r.min_stock || 0)
      };
      // Preserve V3 metadata fields. Prefer local (most recent on this device);
      // fall back to remote if local doesn't have them.
      // History arrays are merged (union by date string) so no entries are lost.
      entry.addedAt = l.addedAt || r.addedAt || null;
      entry.lastAdjustedAt = l.lastAdjustedAt || r.lastAdjustedAt || null;
      entry.acquisitionSource = l.acquisitionSource || r.acquisitionSource || null;
      var lHist = Array.isArray(l.history) ? l.history : [];
      var rHist = Array.isArray(r.history) ? r.history : [];
      if (lHist.length === 0 && rHist.length === 0) {
        entry.history = [];
      } else {
        // Merge by deduplicating on {date, delta} to avoid double-counting.
        var seen = Object.create(null);
        var allHist = lHist.concat(rHist);
        allHist.forEach(function (h) { if (h && h.date) seen[h.date + '|' + h.delta] = h; });
        entry.history = Object.values(seen).sort(function (a, b) { return a.date < b.date ? -1 : a.date > b.date ? 1 : 0; });
        // Cap at 500 entries per thread to match updateThreadOwned
        if (entry.history.length > 500) entry.history = entry.history.slice(-500);
      }
      merged.threads[id] = entry;
    });

    // Merge pattern library: upsert by id, newer updatedAt wins
    var localPatterns = (localStash && localStash.patterns) || [];
    var remotePatterns = (remoteStash && remoteStash.patterns) || [];
    var patternMap = Object.create(null);
    localPatterns.forEach(function (p) { if (p && p.id) patternMap[p.id] = p; });
    remotePatterns.forEach(function (p) {
      if (!p || !p.id) return;
      var existing = patternMap[p.id];
      if (!existing) {
        patternMap[p.id] = p;
      } else {
        // Keep the one with newer updatedAt, or remote if no timestamps
        var eDate = existing.updatedAt ? new Date(existing.updatedAt) : new Date(0);
        var rDate = p.updatedAt ? new Date(p.updatedAt) : new Date(0);
        if (rDate > eDate) patternMap[p.id] = p;
      }
    });
    merged.patterns = Object.values(patternMap);

    // User profile: take whichever exists, prefer local
    merged.userProfile = (localStash && localStash.userProfile) || (remoteStash && remoteStash.userProfile) || null;

    return merged;
  }

  // ── Snapshot storage (sync_snapshots IDB store in CrossStitchDB v4) ─────
  //
  // The snapshot captures the state of THIS device at the moment it last
  // completed a sync (or on beforeunload). It is used for three-way conflict
  // detection: S=snapshot, L=local current, R=remote.
  //   L≠S AND R≠S AND L≠R  → conflict card
  //   R≠S AND L=S           → apply remote change silently
  //   L≠S AND R=S           → keep local, count in summary

  // Human-readable labels for SYNC_PREF_ALLOWLIST keys + palette key.
  // Used by EL-SCR-062-14 conflict card subject lines.
  var PREF_HUMAN_LABELS = {
    "cs_pref_designerName":          "Designer name",
    "cs_pref_designerLogo":          "Designer logo",
    "cs_pref_designerLogoPosition":  "Designer logo position",
    "cs_pref_designerCopyright":     "Designer copyright",
    "cs_pref_designerContact":       "Designer contact",
    "cs_pref_units":                 "Units",
    "cs_pref_currency":              "Currency",
    "cs_pref_fabricUnit":            "Fabric unit",
    "crossstitch_custom_palettes":   "Custom palettes"
  };

  function getPrefLabel(key) {
    return PREF_HUMAN_LABELS[key] || key;
  }

  // Open the main CrossStitchDB directly (schema kept aligned with helpers.js getDB, v5).
  function _openSnapshotDB() {
    return new Promise(function(resolve, reject) {
      var req = indexedDB.open("CrossStitchDB", 5);
      req.onupgradeneeded = function(e) {
        var db = e.target.result;
        var ov = e.oldVersion;
        if (ov < 1) { if (!db.objectStoreNames.contains("projects")) db.createObjectStore("projects"); }
        if (ov < 2) { if (!db.objectStoreNames.contains("project_meta")) db.createObjectStore("project_meta"); }
        if (ov < 3) { if (!db.objectStoreNames.contains("stats_summaries")) db.createObjectStore("stats_summaries"); }
        if (ov < 4) { if (!db.objectStoreNames.contains("sync_snapshots")) db.createObjectStore("sync_snapshots"); }
        if (ov < 5) {
          if (!db.objectStoreNames.contains("importerTelemetry")) db.createObjectStore("importerTelemetry", { keyPath: "id" });
          if (!db.objectStoreNames.contains("pendingImports")) db.createObjectStore("pendingImports", { keyPath: "id" });
        }
      };
      req.onblocked = function() {
        console.warn("SyncEngine: _openSnapshotDB blocked by another open connection.");
        var err = new Error("CrossStitchDB open blocked — another tab may be holding an old connection open.");
        err.isBlockedError = true;
        reject(err);
      };
      req.onsuccess = function() {
        var db = req.result;
        db.onversionchange = function() { try { db.close(); } catch (_) {} };
        resolve(db);
      };
      req.onerror = function() { reject(req.error); };
    });
  }

  // Read the latest snapshot from IDB. Returns the snapshot object or null.
  async function readSnapshot() {
    try {
      var db = await _openSnapshotDB();
      return await new Promise(function(resolve, reject) {
        var tx = db.transaction("sync_snapshots", "readonly");
        var req = tx.objectStore("sync_snapshots").get("latest");
        req.onsuccess = function() { db.close(); resolve(req.result || null); };
        req.onerror = function() { db.close(); reject(req.error); };
      });
    } catch (e) {
      if (e && e.isBlockedError) throw e; // propagate — do not treat as "no snapshot"
      console.warn("SyncEngine: readSnapshot failed:", e);
      return null;
    }
  }

  // Build a snapshot of current local state and write it to IDB.
  // Called after executeImport() and on beforeunload.
  async function writeSnapshot() {
    try {
      // Flush in-flight React state first
      if (window.__flushProjectToIDB) { try { await window.__flushProjectToIDB(); } catch (_) {} }

      // Read projects (metadata only: name, state, updatedAt)
      var projectsSnap = {};
      try {
        var metaList = await ProjectStorage.listProjects();
        for (var mi = 0; mi < metaList.length; mi++) {
          var m = metaList[mi];
          if (m && m.id) {
            projectsSnap[m.id] = {
              name: m.name || null,
              state: m.state || null,
              updatedAt: m.updatedAt || null
            };
          }
        }
      } catch (_) {}

      // Read stash (threads owned counts)
      var stashSnap = {};
      try {
        var stashData = await readManagerStore();
        var threads = (stashData && stashData.threads) || {};
        var tKeys = Object.keys(threads);
        for (var ti = 0; ti < tKeys.length; ti++) {
          var tid = tKeys[ti];
          var t = threads[tid];
          if (t && typeof t.owned === "number") stashSnap[tid] = t.owned;
        }
      } catch (_) {}

      // Read synced prefs (SYNC_PREF_ALLOWLIST + custom palettes)
      var prefsSnap = {};
      var prefKeys = SYNC_PREF_ALLOWLIST.concat(["crossstitch_custom_palettes"]);
      for (var pi = 0; pi < prefKeys.length; pi++) {
        try {
          var val = localStorage.getItem(prefKeys[pi]);
          if (val !== null) prefsSnap[prefKeys[pi]] = val;
        } catch (_) {}
      }

      var snapshot = {
        _snapshotAt: new Date().toISOString(),
        _deviceId: getDeviceId(),
        projects: projectsSnap,
        stash: stashSnap,
        prefs: prefsSnap
      };

      var db = await _openSnapshotDB();
      await new Promise(function(resolve, reject) {
        var tx = db.transaction("sync_snapshots", "readwrite");
        tx.objectStore("sync_snapshots").put(snapshot, "latest");
        tx.oncomplete = function() { db.close(); resolve(); };
        tx.onerror = function() { db.close(); reject(tx.error); };
      });
      return snapshot;
    } catch (e) {
      if (e && e.isBlockedError) throw e; // propagate — snapshot not written, caller must handle
      console.warn("SyncEngine: writeSnapshot failed:", e);
      return null;
    }
  }

  // Drop the stored three-way snapshot. After a library reset it describes a
  // state that no longer exists, and analyseConflicts would read it as "the
  // user deleted all this locally" and raise spurious conflicts.
  async function _clearSnapshot() {
    try {
      var db = await _openSnapshotDB();
      await new Promise(function (resolve, reject) {
        var tx = db.transaction("sync_snapshots", "readwrite");
        tx.objectStore("sync_snapshots").delete("latest");
        tx.oncomplete = function () { db.close(); resolve(); };
        tx.onerror = function () { db.close(); reject(tx.error); };
      });
      return true;
    } catch (e) {
      console.warn("SyncEngine: could not clear snapshot:", e);
      return false;
    }
  }

  // ── Reset for re-sync ────────────────────────────────────────────────────
  //
  // Wipes this device's pattern library and every piece of sync bookkeeping
  // that would otherwise stop a peer's .csync from landing cleanly. Intended
  // for "this device's copies are wrong — rebuild them from the other device".
  //
  // Clearing the library alone is NOT enough, and each of these is a way the
  // rebuild silently imports nothing:
  //   • tombstones           — classifyProjects skips tombstoned ids forever
  //   • per-device cursor    — checkForUpdates treats the peer's existing file
  //                            as already seen and never re-offers it
  //   • global last-import   — same, for files with no device attribution
  //   • pending-plan cache   — a stale plan referencing deleted records
  //   • snapshot             — three-way analysis against a vanished baseline
  //
  // The thread stash is left intact (device inventory, not library content).
  // Destructive, so it requires an explicit confirmation token.
  var RESET_CONFIRM_TOKEN = "DELETE_LOCAL_LIBRARY";

  async function resetForResync(options) {
    var opts = options || {};
    if (opts.confirm !== RESET_CONFIRM_TOKEN) {
      throw new Error('SyncEngine.resetForResync() permanently deletes this '
        + 'device\'s patterns. Call it as resetForResync({ confirm: "'
        + RESET_CONFIRM_TOKEN + '" }).');
    }

    var removed = 0;
    if (typeof ProjectStorage !== "undefined" && ProjectStorage.clearAllProjects) {
      removed = await ProjectStorage.clearAllProjects({
        includeAutoSave: opts.includeAutoSave !== false
      });
    } else {
      throw new Error("ProjectStorage.clearAllProjects is unavailable — cannot reset safely.");
    }

    try { localStorage.removeItem(LS_TOMBSTONE_KEY); } catch (e) {}
    try { localStorage.removeItem(LS_LAST_IMPORT_PER_DEVICE); } catch (e) {}
    try { localStorage.removeItem(LS_LAST_IMPORT); } catch (e) {}

    _seenPendingKeys = Object.create(null);
    try { clearPendingPlan(); } catch (e) {}
    await _clearSnapshot();

    _logEvent({
      type: "library-reset",
      message: "Local library cleared for re-sync (" + removed + " pattern"
        + (removed === 1 ? "" : "s") + " removed)"
    });

    try {
      if (typeof window !== "undefined" && window.dispatchEvent) {
        window.dispatchEvent(new CustomEvent("cs:projectsChanged", {
          detail: { reason: "reset-for-resync", count: removed }
        }));
        window.dispatchEvent(new CustomEvent("cs:syncStatusChanged", {
          detail: { reason: "reset-for-resync" }
        }));
      }
    } catch (e) {}

    // Pull the peer's file straight away rather than waiting for the next tick.
    try { _runWatcherTick(); } catch (e) {}

    return { removed: removed };
  }

  // Register a beforeunload handler that writes a snapshot when the page closes.
  // Safe to call multiple times — only registers once.
  var _beforeUnloadRegistered = false;
  function registerBeforeUnloadSnapshot() {
    if (_beforeUnloadRegistered) return;
    _beforeUnloadRegistered = true;
    window.addEventListener("beforeunload", function() {
      // Best-effort only — browsers may truncate beforeunload async work.
      writeSnapshot().catch(function() {});
    });
  }

  // ── Conflict analysis (gate layer, runs BEFORE executeImport) ────────────
  //
  // Produces a gate-specific conflict/summary structure from the prepareImport
  // plan and an optional IDB snapshot.
  //
  // Returns:
  //   {
  //     conflicts:       Array of gate conflict objects (stitch/stash/meta/pref)
  //     stitchSummary:   { totalAdded, affectedProjects }
  //     stashSummary:    { updatedCount }
  //     metaSummary:     { updatedCount }
  //     prefsSummary:    { updatedCount, usedTimestampFallback }
  //     noSnapshot:      true if snapshot was null (first-run mode)
  //     hasChanges:      true when any category has at least one change
  //   }
  function analyseConflicts(plan, snapshot) {
    var conflicts = [];
    var stitchAdded = 0, stitchProjects = 0;
    var stashUpdated = 0;
    var metaUpdated = 0;
    var prefsUpdated = 0, usedTimestampFallback = false;
    var noSnapshot = !snapshot;
    var remoteDeviceName = (plan.summary && plan.summary.deviceName) || "";
    var remoteModeCreatedAt = (plan.summary && plan.summary.createdAt) || null;

    // 1. Stitch conflicts from merge-tracking projects
    //    local.done[i]=1 AND remote.done[i]=0 → conflict card (per project)
    //    local.done[i]=0 AND remote.done[i]=1 → silent additive (counted in stitchSummary)
    var mergeCandidates = (plan.mergeTracking || []).concat(plan.newRemote || []);
    for (var mi = 0; mi < mergeCandidates.length; mi++) {
      var entry = mergeCandidates[mi];
      var local = entry.local || null;
      var remoteData = entry.remote && entry.remote.data;
      if (!remoteData) continue;
      var localDone = (local && local.done) || null;
      var remoteDone = remoteData.done || null;
      if (!remoteDone) continue;
      var patLen = (remoteData.pattern && remoteData.pattern.length) || (localDone && localDone.length) || 0;
      var cellsAdded = 0, localHas1 = false;
      for (var ci = 0; ci < patLen; ci++) {
        var lv = localDone && localDone[ci] === 1 ? 1 : 0;
        var rv = remoteDone[ci] === 1 ? 1 : 0;
        if (lv === 0 && rv === 1) cellsAdded++;
        if (lv === 1 && rv === 0) localHas1 = true;
      }
      if (cellsAdded > 0) { stitchAdded += cellsAdded; stitchProjects++; }
      if (localHas1) {
        var localTotal = 0, remoteTotal = 0;
        if (localDone) for (var ldi = 0; ldi < localDone.length; ldi++) if (localDone[ldi] === 1) localTotal++;
        if (remoteDone) for (var rdi = 0; rdi < remoteDone.length; rdi++) if (remoteDone[rdi] === 1) remoteTotal++;
        var disagreeCount = 0;
        for (var di = 0; di < patLen; di++) {
          var l = localDone && localDone[di] === 1 ? 1 : 0;
          var r = remoteDone[di] === 1 ? 1 : 0;
          if (l === 1 && r === 0) disagreeCount++;
        }
        conflicts.push({
          type: "stitch",
          id: entry.id || (remoteData && remoteData.id),
          projectName: (local && local.name) || (remoteData && remoteData.name) || entry.id,
          disagreeCount: disagreeCount,
          localStitchCount: localTotal,
          remoteStitchCount: remoteTotal,
          totalCells: patLen,
          entry: entry
        });
      }
    }

    // 2. Chart-structural conflicts (existing conflict classification) — pass through
    for (var fi = 0; fi < (plan.conflicts || []).length; fi++) {
      var cEntry = plan.conflicts[fi];
      var cLocal = cEntry.local;
      var cRemote = cEntry.remote && cEntry.remote.data;
      if (!cLocal || !cRemote) continue;
      var cLocalDone = 0, cRemoteDone = 0;
      if (cLocal.done) for (var cd = 0; cd < cLocal.done.length; cd++) if (cLocal.done[cd] === 1) cLocalDone++;
      if (cRemote.done) for (var rd = 0; rd < cRemote.done.length; rd++) if (cRemote.done[rd] === 1) cRemoteDone++;
      conflicts.push({
        type: "chart",
        id: cEntry.id,
        projectName: (cLocal && cLocal.name) || (cRemote && cRemote.name) || cEntry.id,
        localStitchCount: cLocalDone,
        remoteStitchCount: cRemoteDone,
        localUpdatedAt: cLocal.updatedAt || null,
        remoteUpdatedAt: cRemote.updatedAt || null,
        localProject: cLocal,
        remoteProject: cRemote,
        entry: cEntry
      });
    }

    // 3. Stash conflicts (requires snapshot)
    if (plan.stashMerge && plan.syncObj && plan.syncObj.stash) {
      var localThreads = (plan.localStash && plan.localStash.threads) || {};
      var remoteThreads = (plan.syncObj.stash && plan.syncObj.stash.threads) || {};
      var snapStash = (snapshot && snapshot.stash) || {};
      var allThreadIds = Object.create(null);
      Object.keys(localThreads).forEach(function(id) { allThreadIds[id] = true; });
      Object.keys(remoteThreads).forEach(function(id) { allThreadIds[id] = true; });
      Object.keys(allThreadIds).forEach(function(id) {
        var L = (localThreads[id] && typeof localThreads[id].owned === "number") ? localThreads[id].owned : 0;
        var R = (remoteThreads[id] && typeof remoteThreads[id].owned === "number") ? remoteThreads[id].owned : 0;
        if (L === R) return;
        if (!noSnapshot) {
          var S = typeof snapStash[id] === "number" ? snapStash[id] : null;
          if (S !== null) {
            if (L !== S && R !== S && L !== R) {
              // Both devices changed it differently — conflict card (user chooses).
              // modals.js will override plan.stashMerge.threads[id].owned with the choice.
              conflicts.push({ type: "stash", id: "stash:" + id, threadId: id, localOwned: L, remoteOwned: R, snapshotOwned: S });
            } else if (R !== S && L === S) {
              // Only remote changed — apply remote's value (could be a reduction).
              // Use R directly instead of mergeStash's max(), which would ignore reductions.
              stashUpdated++;
              if (plan.stashMerge && plan.stashMerge.threads && plan.stashMerge.threads[id]) {
                plan.stashMerge.threads[id].owned = R;
              }
            } else if (L !== S && R === S) {
              // Only local changed — keep local's value (could be a reduction).
              // Use L directly instead of mergeStash's max(), which would ignore reductions.
              stashUpdated++;
              if (plan.stashMerge && plan.stashMerge.threads && plan.stashMerge.threads[id]) {
                plan.stashMerge.threads[id].owned = L;
              }
            }
          } else {
            // Thread not in snapshot — treat as non-conflicting (conservative merge)
            if (R > L) stashUpdated++;
          }
        } else {
          // No snapshot — all stash differences are non-conflicting (Math.max)
          if (R > L) stashUpdated++;
        }
      });
    }

    // 4. Metadata conflicts (project name/state — requires snapshot)
    var snapProjects = (snapshot && snapshot.projects) || {};
    var metaEntries = (plan.mergeTracking || []).concat(plan.newRemote || []).concat(plan.conflicts || []);
    var seenMeta = Object.create(null);
    for (var pi = 0; pi < metaEntries.length; pi++) {
      var pe = metaEntries[pi];
      var pLocal = pe.local;
      var pRemote = pe.remote && pe.remote.data;
      if (!pLocal || !pRemote) continue;
      var pid = pe.id;
      if (seenMeta[pid]) continue;
      seenMeta[pid] = true;
      var snapMeta = snapProjects[pid] || null;
      var metaFields = ["name", "state"];
      for (var mfi = 0; mfi < metaFields.length; mfi++) {
        var field = metaFields[mfi];
        var Lv = pLocal[field] || null;
        var Rv = pRemote[field] || null;
        if (Lv === Rv) continue;
        if (!noSnapshot && snapMeta) {
          var Sv = snapMeta[field] || null;
          if (Lv !== Sv && Rv !== Sv && Lv !== Rv) {
            conflicts.push({ type: "meta", id: "meta:" + pid + ":" + field, projectId: pid, field: field, localValue: Lv, remoteValue: Rv, projectName: pLocal.name || pRemote.name || pid });
          } else if (Rv !== Sv && Lv === Sv) {
            metaUpdated++;
          } else if (Lv !== Sv && Rv === Sv) {
            metaUpdated++;
          }
        } else {
          // No snapshot — apply remote value conservatively
          metaUpdated++;
        }
      }
    }

    // 5. Pref conflicts (requires snapshot)
    if (plan.syncObj && plan.syncObj.prefs) {
      var remotePrefs = plan.syncObj.prefs;
      var snapPrefs = (snapshot && snapshot.prefs) || {};
      var prefKeys = Object.keys(remotePrefs);
      for (var pkIdx = 0; pkIdx < prefKeys.length; pkIdx++) {
        var pkey = prefKeys[pkIdx];
        var Lp = null;
        try { Lp = localStorage.getItem(pkey); } catch (_) {}
        var Rp = remotePrefs[pkey] || null;
        if (Lp === Rp) continue;
        if (!noSnapshot) {
          var Sp = snapPrefs[pkey] || null;
          if (Sp !== null) {
            if (Lp !== Sp && Rp !== Sp && Lp !== Rp) {
              conflicts.push({ type: "pref", id: "pref:" + pkey, prefKey: pkey, localValue: Lp, remoteValue: Rp, snapshotValue: Sp, label: getPrefLabel(pkey) });
            } else if (Rp !== Sp && Lp === Sp) {
              prefsUpdated++;
            } else if (Lp !== Sp && Rp === Sp) {
              prefsUpdated++;
            }
          } else {
            // Key not in snapshot — timestamp wins
            usedTimestampFallback = true;
            prefsUpdated++;
          }
        } else {
          // No snapshot — timestamp wins
          usedTimestampFallback = true;
          prefsUpdated++;
        }
      }
    }

    var hasChanges = stitchAdded > 0 || stashUpdated > 0 || metaUpdated > 0 || prefsUpdated > 0 ||
      (plan.newRemote && plan.newRemote.length > 0) || conflicts.length > 0;

    return {
      conflicts: conflicts,
      stitchSummary: { totalAdded: stitchAdded, affectedProjects: stitchProjects },
      stashSummary: { updatedCount: stashUpdated },
      metaSummary: { updatedCount: metaUpdated },
      prefsSummary: { updatedCount: prefsUpdated, usedTimestampFallback: usedTimestampFallback },
      noSnapshot: noSnapshot,
      hasChanges: hasChanges
    };
  }

  // ── Import (full pipeline) ───────────────────────────────────────────────

  async function prepareImport(syncObj) {
    // If the envelope is encrypted, decrypt before any further work.
    // Throws a typed EncryptionError ("passphrase_required" or
    // "incorrect_passphrase") that callers — manual import buttons,
    // SyncReviewGate, the watcher's _processFolderUpdates — branch on
    // to either prompt for the passphrase or surface the failure.
    if (syncObj && syncObj._encrypted) {
      syncObj = await _decryptSyncObj(syncObj, _sessionPassphrase);
    }

    // Validate
    var check = validate(syncObj);
    if (!check.valid) throw new Error(check.error);

    // Load all local projects into a map
    var localMap = {};
    try {
      var metaList = await ProjectStorage.listProjects();
      // PERF (perf-5 #2): parallel fetch of all local projects.
      var fetched = await Promise.all(metaList.map(function(m){ return ProjectStorage.get(m.id); }));
      for (var i = 0; i < fetched.length; i++) { if (fetched[i]) localMap[fetched[i].id] = fetched[i]; }
    } catch (e) {
      console.error("SyncEngine.prepareImport: failed to read local projects:", e);
    }

    // Read local stash
    var localStash = {};
    try { localStash = await readManagerStore(); } catch (e) {}

    // Classify each remote project
    var classified = classifyProjects(syncObj.projects, localMap);

    // Build import plan
    var plan = {
      summary: check.summary,
      classified: classified,
      newRemote: classified.filter(function (c) { return c.classification === "new-remote"; }),
      identical: classified.filter(function (c) { return c.classification === "identical"; }),
      mergeTracking: classified.filter(function (c) { return c.classification === "merge-tracking"; }),
      conflicts: classified.filter(function (c) { return c.classification === "conflict"; }),
      // Subset of mergeTracking entries that arose from a fingerprint-based
      // match across differing ids — surfaced separately so the UI can
      // show "Possible duplicates" reassurance to users (per sync-8 wireframe A7).
      idRewrites: classified.filter(function (c) { return !!c.idRewrite; }),
      localOnly: [],  // projects only on this device (not in sync file)
      stashMerge: null,
      // VER-SYNC-009: remote tombstones to absorb into local deleted-ids list.
      remoteTombstones: (syncObj.deletedProjectIds && Array.isArray(syncObj.deletedProjectIds))
        ? syncObj.deletedProjectIds : [],
      syncObj: syncObj,
      localMap: localMap,
      localStash: localStash
    };

    // Find local-only projects — must account for fingerprint matches so
    // a locally-renamed-but-same-chart project isn't double-counted as both
    // "merged" and "local-only".
    var matchedLocalIds = Object.create(null);
    classified.forEach(function (c) {
      if (c.local && c.local.id) matchedLocalIds[c.local.id] = true;
      if (c.idRewrite && c.idRewrite.localId) matchedLocalIds[c.idRewrite.localId] = true;
    });
    Object.keys(localMap).forEach(function (id) {
      if (!matchedLocalIds[id]) {
        plan.localOnly.push({ id: id, local: localMap[id] });
      }
    });

    // Preview stash merge if stash data present
    if (syncObj.stash) {
      plan.stashMerge = mergeStash(localStash, syncObj.stash);
    }

    return plan;
  }

  async function executeImport(plan, conflictResolutions, gateResolutions) {
    // conflictResolutions: { [projectId]: "keep-local" | "keep-remote" | "keep-both" }
    // gateResolutions: optional { [gateConflictId]: "keep-local" | "keep-remote" }
    //   gateConflictId formats: "meta:<pid>:<field>", "pref:<key>",
    //                           "stitch:<pid>", "stash:<threadId>"
    conflictResolutions = conflictResolutions || {};
    gateResolutions = gateResolutions || {};

    // Build a per-project meta overrides map from gateResolutions.
    // meta gate conflict ids have the form "meta:<projectId>:<field>".
    // lastIndexOf(':') is intentional: project IDs can contain colons, so we
    // split on the LAST colon to correctly extract the trailing field name.
    var metaOverridesMap = Object.create(null); // "projectId:field" -> resolution
    Object.keys(gateResolutions).forEach(function(gid) {
      if (gid.indexOf('meta:') === 0) {
        var rest = gid.slice(5); // "<projectId>:<field>"
        var colonIdx = rest.lastIndexOf(':');
        if (colonIdx !== -1) {
          var pid = rest.slice(0, colonIdx);
          var field = rest.slice(colonIdx + 1);
          metaOverridesMap[pid + ':' + field] = gateResolutions[gid];
        }
      }
    });

    // VER-SYNC-010: flush any buffered in-flight React saves (e.g. the creator's
    // auto-save debounce) before we start reading/writing IDB records.  Without
    // this, a concurrent save could overwrite a just-merged record immediately
    // after we write it.
    if (window.__flushProjectToIDB) {
      try { await window.__flushProjectToIDB(); } catch (e) {}
    }

    // VER-SYNC-013 — ATOMICITY BOUNDARY NOTE:
    // Each project is saved as a separate IDB put() transaction; there is no
    // wrapping multi-record transaction.  This means an interrupted import
    // (browser crash, tab close mid-loop) will leave the database in a
    // partially-imported state.  This is safe to retry: identical projects are
    // fingerprint-matched (idempotent), merged projects re-derive from the
    // current IDB state (re-read inside the merge loop), and conflicting
    // projects are re-presented on next import.  Partial imports do NOT corrupt
    // data — they only mean some projects were not yet imported.

    // 1. Import new-remote projects.
    //    preserveUpdatedAt keeps the authoring device's edit time. Without it
    //    every imported project is stamped with the import moment, which both
    //    destroys the real "last edited" dates and reverses the library order
    //    on the receiving device (we save newest-first; listProjects sorts
    //    newest-first again).
    for (var i = 0; i < plan.newRemote.length; i++) {
      var entry = plan.newRemote[i];
      try {
        await ProjectStorage.save(entry.remote.data, { preserveUpdatedAt: true });
      } catch (saveErr) {
        if (saveErr && saveErr.name === "QuotaExceededError") {
          throw new Error("Not enough browser storage to import all projects — free up space or clear cached data and try again. (QuotaExceededError saving \"" + (entry.remote.data && entry.remote.data.name || entry.remote.id) + "\")");
        }
        throw saveErr;
      }
    }

    // 2. Merge tracking progress (re-read local from IDB to avoid stale data)
    //    Honour idRewrite when present: the remote.id and local.id differ but
    //    the chart fingerprints match, so we converge on a canonical id and
    //    delete the orphaned record so neither device keeps a duplicate.
    for (var j = 0; j < plan.mergeTracking.length; j++) {
      var mEntry = plan.mergeTracking[j];
      var localId = (mEntry.idRewrite && mEntry.idRewrite.localId)
        || (mEntry.local && mEntry.local.id)
        || mEntry.id;
      var freshLocal = await ProjectStorage.get(localId);
      // Honour keep-remote stitch gate resolution: zero out only the disputed cells
      // (local=1, remote=0) in freshLocal.done before the union merge so those cells
      // end up as 0 (remote's value). Additive cells (remote=1, local=0) are preserved.
      // The stitch conflict id in gateResolutions is the project id (= mEntry.id = remote.id).
      // For idRewrite entries localId differs from mEntry.id, so check both.
      var srRes = gateResolutions[localId] || gateResolutions[mEntry.id] || 'keep-local';
      if (srRes === 'keep-remote'
          && freshLocal && freshLocal.done
          && mEntry.remote && mEntry.remote.data && mEntry.remote.data.done) {
        var srRemDone = mEntry.remote.data.done;
        var srAdjDone = Array.prototype.slice.call(freshLocal.done);
        for (var srdi = 0; srdi < srAdjDone.length; srdi++) {
          if (srAdjDone[srdi] === 1 && !srRemDone[srdi]) srAdjDone[srdi] = 0;
        }
        freshLocal = Object.assign({}, freshLocal, { done: srAdjDone });
      }
      // Build per-field meta overrides for this project from gateResolutions.
      var projectMetaOverrides = null;
      var metaProjectId = localId || mEntry.id;
      var mFields = ["name", "state"];
      for (var mfi = 0; mfi < mFields.length; mfi++) {
        var mf = mFields[mfi];
        var mk = metaProjectId + ':' + mf;
        if (metaOverridesMap[mk]) {
          if (!projectMetaOverrides) projectMetaOverrides = {};
          projectMetaOverrides[mf] = metaOverridesMap[mk];
        }
      }
      var merged = mergeTrackingProgress(freshLocal || mEntry.local, mEntry.remote.data, projectMetaOverrides);

      if (mEntry.idRewrite) {
        var canon = mEntry.idRewrite.canonicalId;
        var oldLocalId = (freshLocal && freshLocal.id) || localId;
        merged.id = canon;
        // mergeTrackingProgress already resolved updatedAt to the later of
        // the two sides — preserve it rather than restamping with "now".
        await ProjectStorage.save(merged, { preserveUpdatedAt: true });
        // Delete the now-orphaned local record (only if its id differs from canonical).
        if (oldLocalId && oldLocalId !== canon && ProjectStorage.delete) {
          try {
            await ProjectStorage.delete(oldLocalId);
            // ProjectStorage.delete() writes a tombstone for the deleted ID. For idRewrite
            // deletions this is wrong: the deletion is a structural ID-convergence (not a
            // user deletion), so a tombstone would permanently block future imports from
            // any third device still using the old ID. Remove the tombstone immediately.
            try {
              var _tbs = getLocalTombstones();
              var _tidx = _tbs.indexOf(oldLocalId);
              if (_tidx !== -1) {
                _tbs.splice(_tidx, 1);
                localStorage.setItem(LS_TOMBSTONE_KEY, JSON.stringify(_tbs));
              }
            } catch (_) {}
          } catch (e) {
            console.warn("SyncEngine: could not delete orphaned project " + oldLocalId, e);
          }
        }
      } else {
        await ProjectStorage.save(merged, { preserveUpdatedAt: true });
      }
    }

    // 3. Resolve conflicts
    for (var k = 0; k < plan.conflicts.length; k++) {
      var cEntry = plan.conflicts[k];
      var resolution = conflictResolutions[cEntry.id] || "keep-local";
      if (resolution === "keep-remote") {
        await ProjectStorage.save(cEntry.remote.data, { preserveUpdatedAt: true });
      } else if (resolution === "keep-both") {
        // Keep local as-is; import remote as a new project via normal save logic
        var remoteCopy = _clone(cEntry.remote.data); // PERF (perf-6 #5)
        delete remoteCopy.id;
        delete remoteCopy.createdAt;
        remoteCopy.name = (remoteCopy.name || "Untitled") + " (synced)";
        await ProjectStorage.save(remoteCopy);
      }
      // "keep-local" → do nothing
    }

    // 4. Merge stash
    if (plan.stashMerge) {
      try {
        var db = await openManagerDB();
        await new Promise(function (resolve, reject) {
          var tx = db.transaction("manager_state", "readwrite");
          var store = tx.objectStore("manager_state");
          if (plan.stashMerge.threads) store.put(plan.stashMerge.threads, "threads");
          if (plan.stashMerge.patterns) store.put(plan.stashMerge.patterns, "patterns");
          if (plan.stashMerge.userProfile) store.put(plan.stashMerge.userProfile, "userProfile");
          tx.oncomplete = function () { db.close(); resolve(); };
          tx.onerror = function () { db.close(); reject(tx.error); };
        });
      } catch (e) {
        // VER-SYNC-019: surface QuotaExceededError with an actionable message
        // instead of silently swallowing it. Re-throw so the caller's catch
        // block shows the error; callers should check err.name to distinguish
        // this from a project-save failure.
        if (e && e.name === "QuotaExceededError") {
          throw new Error("Not enough browser storage to complete the sync — free up space or clear cached data and try again. (QuotaExceededError during stash write)");
        }
        // For other stash errors, re-throw with a clear message so the caller
        // knows the stash portion was not saved (rather than silently proceeding
        // with stashUpdated: true in the result when the write actually failed).
        throw new Error("Stash update failed: " + (e && e.message ? e.message : String(e)));
      }
    }

    // 5. Absorb remote tombstones: merge the remote's deleted-project list into
    //    our local tombstone store so that projects deleted on the remote device
    //    are also skipped on this device on the next import.
    if (plan.remoteTombstones && plan.remoteTombstones.length) {
      try {
        var existingTombstones = getLocalTombstones();
        var tombstoneSet = Object.create(null);
        for (var tsi = 0; tsi < existingTombstones.length; tsi++) tombstoneSet[existingTombstones[tsi]] = true;
        var changed = false;
        for (var rti = 0; rti < plan.remoteTombstones.length; rti++) {
          var rtId = plan.remoteTombstones[rti];
          if (!tombstoneSet[rtId]) { existingTombstones.push(rtId); changed = true; }
        }
        if (changed) {
          if (existingTombstones.length > 200) existingTombstones = existingTombstones.slice(existingTombstones.length - 200);
          localStorage.setItem(LS_TOMBSTONE_KEY, JSON.stringify(existingTombstones));
        }
      } catch (_) {}
    }

    // 5b. Apply remote prefs and custom palettes to localStorage.
    //     For each key in plan.syncObj.prefs, write the remote value unless
    //     the gate conflict resolution explicitly said "keep-local" for that key.
    //     A single cs:prefsChanged event is dispatched afterwards so existing
    //     listeners (apply-prefs.js, preferences-modal.js, etc.) refresh.
    if (plan.syncObj && plan.syncObj.prefs) {
      var remotePrefs = plan.syncObj.prefs;
      var prefApplied = false;
      var remotePrefKeys = Object.keys(remotePrefs);
      for (var rpi = 0; rpi < remotePrefKeys.length; rpi++) {
        var rpk = remotePrefKeys[rpi];
        // If gate provided keep-local for this pref conflict, honour it
        if (gateResolutions['pref:' + rpk] === 'keep-local') continue;
        try {
          localStorage.setItem(rpk, remotePrefs[rpk]);
          prefApplied = true;
        } catch (_) {}
      }
      if (prefApplied) {
        try { window.dispatchEvent(new CustomEvent('cs:prefsChanged')); } catch (_) {}
      }
    }

    // 6. Record import timestamp and mark synced projects
    var importTs = new Date().toISOString();
    try { localStorage.setItem(LS_LAST_IMPORT, importTs); } catch (e) {}
    // Mark all affected project IDs as synced
    var syncedIds = [];
    plan.newRemote.forEach(function (e) { if (e.remote && e.remote.data && e.remote.data.id) syncedIds.push(e.remote.data.id); });
    plan.mergeTracking.forEach(function (e) {
      // When an id rewrite occurred, the project was saved under canonicalId.
      // Use that instead of e.id (the remote ID) so markSynced records the right entry.
      var id = (e.idRewrite && e.idRewrite.canonicalId) ? e.idRewrite.canonicalId : e.id;
      if (id) syncedIds.push(id);
    });
    plan.conflicts.forEach(function (e) { if (e.id) syncedIds.push(e.id); });
    if (syncedIds.length > 0 && typeof ProjectStorage !== "undefined" && ProjectStorage.markSynced) {
      try { await ProjectStorage.markSynced(syncedIds, importTs); } catch (e) {}
    }

    // Record activity log entry + per-device "last imported" marker so the
    // Devices panel and Sync Activity modal can show what happened.
    try {
      var srcDeviceId = plan.syncObj && plan.syncObj._deviceId;
      var srcDeviceName = plan.syncObj && plan.syncObj._deviceName;
      _recordDeviceImport(plan.syncObj, plan._fileLastModified || null);
      _logEvent({
        type: "import-success",
        direction: "in",
        deviceId: srcDeviceId,
        deviceName: srcDeviceName,
        fileName: plan._fileName || null,
        projectCount: plan.newRemote.length + plan.mergeTracking.length,
        conflicts: plan.conflicts.length
      });
    } catch (e) {}

    // Clear the cached pending plan once it's been applied — otherwise a
    // subsequent "Review sync" click would re-show the same already-merged
    // plan. The watcher's dedup (_seenPendingKeys) prevents re-publication
    // unless a fresh file arrives.
    try { clearPendingPlan(); } catch (e) {}

    return {
      imported: plan.newRemote.length,
      merged: plan.mergeTracking.length,
      conflictsResolved: plan.conflicts.length,
      stashUpdated: !!plan.stashMerge
    };
  }

  // ── File System Access API helpers (for folder watching, session 4) ─────

  var _watchDirHandle = null;

  async function setWatchDirectory(dirHandle) {
    _watchDirHandle = dirHandle;
    // Persist the handle in IndexedDB for reuse across page loads
    try {
      var db = await openSyncMetaDB();
      await new Promise(function (resolve, reject) {
        var tx = db.transaction("sync_state", "readwrite");
        tx.objectStore("sync_state").put(dirHandle, "watchDirHandle");
        tx.oncomplete = function () { db.close(); resolve(); };
        tx.onerror = function () { db.close(); reject(tx.error); };
      });
    } catch (e) { console.warn("SyncEngine: could not persist watch dir handle:", e); }
    // Choosing a folder means "sync this device". Turn on auto-export unless
    // the user has previously opted out — otherwise the device can receive
    // but never send, which is silent and very hard to notice.
    try { _defaultAutoSyncOnConnect(); } catch (e) {}
    // Phase-3 sync-fix #1: kick off the polling watcher automatically so any
    // page that configures a sync folder starts receiving remote updates.
    // startWatching() also fires _runWatcherTick() once immediately, which
    // satisfies the "scan as soon as the user picks a folder" requirement
    // (UnifiedSyncImportModal relies on this). _runWatcherTick guards against
    // re-entry via _watcherInFlight, so a concurrent scheduled tick won't
    // double-scan — do NOT add a redundant checkForUpdates() call here.
    try { startWatching(); } catch (e) {}
  }

  async function getWatchDirectory() {
    if (_watchDirHandle) return _watchDirHandle;
    try {
      var db = await openSyncMetaDB();
      var handle = await new Promise(function (resolve, reject) {
        var tx = db.transaction("sync_state", "readonly");
        var req = tx.objectStore("sync_state").get("watchDirHandle");
        req.onsuccess = function () { resolve(req.result || null); };
        req.onerror = function () { console.warn('SyncEngine: read watchDirHandle failed:', req.error); resolve(null); };
        tx.oncomplete = function () { db.close(); };
      });
      _watchDirHandle = handle;
      return handle;
    } catch (e) { return null; }
  }

  function openSyncMetaDB() {
    return new Promise(function (resolve, reject) {
      var req = indexedDB.open("cross_stitch_sync_meta", 1);
      req.onupgradeneeded = function (e) {
        var db = e.target.result;
        if (!db.objectStoreNames.contains("sync_state")) {
          db.createObjectStore("sync_state");
        }
      };
      req.onsuccess = function () { resolve(req.result); };
      req.onerror = function () { reject(req.error); };
    });
  }

  // Check if File System Access API is available
  function hasFolderWatchSupport() {
    return typeof window.showDirectoryPicker === "function";
  }

  async function clearWatchDirectory() {
    try { stopWatching(); } catch (e) {}
    _watchDirHandle = null;
    try {
      var db = await openSyncMetaDB();
      await new Promise(function (resolve, reject) {
        var tx = db.transaction("sync_state", "readwrite");
        tx.objectStore("sync_state").delete("watchDirHandle");
        tx.oncomplete = function () { db.close(); resolve(); };
        tx.onerror = function () { db.close(); reject(tx.error); };
      });
    } catch (e) { console.warn("SyncEngine: could not clear watch dir handle:", e); }
    // Remove rather than set "0": disconnecting clears the preference so a
    // future reconnect opts in again, instead of inheriting a stale opt-out.
    try { localStorage.removeItem(LS_AUTO_SYNC); } catch (e) {}
  }

  // Write current state to the sync folder as a .csync file
  async function exportToFolder(dirHandleArg) {
    var dirHandle = dirHandleArg || _watchDirHandle;
    if (!dirHandle) throw new Error("No sync folder configured.");
    // Verify permission
    var perm = await dirHandle.queryPermission({ mode: "readwrite" });
    if (perm !== "granted") {
      perm = await dirHandle.requestPermission({ mode: "readwrite" });
      if (perm !== "granted") throw new Error("Write permission denied for sync folder.");
    }
    var syncObj = await exportSync();
    var compressed = compress(syncObj);
    // Use a fixed filename per device so each device has one file
    var deviceName = getDeviceName();
    var namePart = deviceName ? "-" + deviceName.replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 20) : "";
    var deviceId = getDeviceId();
    var idPart = deviceId.replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 30);
    var fileName = "cross-stitch-sync" + namePart + "-" + idPart + ".csync";
    var fileHandle = await dirHandle.getFileHandle(fileName, { create: true });
    var writable = await fileHandle.createWritable();
    await writable.write(compressed);
    await writable.close();
    _logEvent({
      type: "export-success",
      direction: "out",
      deviceId: syncObj._deviceId,
      deviceName: syncObj._deviceName,
      fileName: fileName,
      projectCount: (syncObj.projects && syncObj.projects.length) || 0
    });
    return { fileName: fileName, syncObj: syncObj };
  }

  // Scan the sync folder for .csync files and return metadata for each
  async function scanFolder(dirHandleArg) {
    var dirHandle = dirHandleArg || _watchDirHandle;
    if (!dirHandle) return [];
    // Verify permission
    var perm = await dirHandle.queryPermission({ mode: "read" });
    if (perm !== "granted") {
      perm = await dirHandle.requestPermission({ mode: "read" });
      if (perm !== "granted") return [];
    }
    var results = [];
    for await (var entry of dirHandle.values()) {
      if (entry.kind !== "file" || !entry.name.endsWith(".csync")) continue;
      try {
        var file = await entry.getFile();
        var arrayBuffer = await file.arrayBuffer();
        var syncObj = decompress(arrayBuffer);
        var valid = validate(syncObj);
        if (!valid.valid) continue;
        results.push({
          fileName: entry.name,
          fileHandle: entry,
          deviceId: syncObj._deviceId || null,
          deviceName: syncObj._deviceName || null,
          createdAt: syncObj._createdAt || null,
          projectCount: syncObj.projects ? syncObj.projects.length : 0,
          hasStash: !!syncObj.stash,
          syncObj: syncObj,
          size: file.size,
          lastModified: file.lastModified
        });
      } catch (e) {
        console.warn("SyncEngine: skipping unreadable file:", entry.name, e);
      }
    }
    return results;
  }

  // Phase B — guard against device-id collisions. The .csync filename
  // pattern is `cross-stitch-sync-<deviceName>-<deviceId>.csync`; if two
  // devices ever end up with the same deviceId (e.g. user copied the
  // browser profile, restored a backup that included LS_DEVICE_ID, or
  // shared a database between machines), they will silently overwrite
  // each other's exports. We can't fix the collision automatically — that
  // requires user consent because regenerating a deviceId disconnects
  // any existing imports — but we can detect it on every scan and surface
  // a one-time warning so the user knows what to do.
  var _collisionWarned = false;
  function _detectDeviceIdCollision(files) {
    if (_collisionWarned) return null;
    var myId = getDeviceId();
    var myName = getDeviceName();
    if (!myId || myId === "dev_unknown") return null;
    for (var i = 0; i < files.length; i++) {
      var f = files[i];
      if (!f.deviceId || f.deviceId !== myId) continue;
      // Filenames are `cross-stitch-sync-<name>-<id>.csync`; pull the embedded
      // name back out so we can show what the *other* device thinks it is.
      var otherName = f.deviceName || "another device";
      // If the embedded name matches ours we assume it's the same device's
      // own export — no collision.
      if (otherName === myName) continue;
      _collisionWarned = true;
      return { fileName: f.fileName, otherName: otherName, myName: myName, myId: myId };
    }
    return null;
  }

  // Check the sync folder for files from other devices that are newer than our last import
  async function checkForUpdates(dirHandleArg) {
    var files = await scanFolder(dirHandleArg);
    var collision = _detectDeviceIdCollision(files);
    if (collision) {
      try {
        if (typeof window !== "undefined" && window.dispatchEvent) {
          window.dispatchEvent(new CustomEvent("cs:syncDeviceIdCollision", { detail: collision }));
        }
        _reportSyncError("device-id-collision",
          new Error("Detected another device using the same sync id (" + collision.otherName
            + " vs " + collision.myName + "). Open Preferences > Sync to regenerate this device's id."));
      } catch (e) {}
    }
    var myDeviceId = getDeviceId();
    // Per-device dedup: each remote device gets its own "last imported
    // createdAt" cursor. Using a single global cs_sync_lastImportAt as the
    // filter caused silent skips when peers had drifting clocks — e.g.
    // Device A imports B's file (createdAt = T1) and bumps the global to
    // T1; Device C then writes a file whose createdAt is a few seconds
    // behind T1 because C's wall clock lags, and A skips it forever even
    // though A has never seen anything from C. With per-device tracking
    // each peer is compared only against the last file we imported FROM
    // THAT PEER, so cross-peer skew can no longer poison the filter.
    var perDevice = getLastImportPerDevice();
    var globalLastImport = null;
    try { globalLastImport = localStorage.getItem(LS_LAST_IMPORT); } catch (e) {}
    var globalLastImportMs = globalLastImport ? new Date(globalLastImport).getTime() : 0;
    var updates = [];
    for (var i = 0; i < files.length; i++) {
      var f = files[i];
      // Skip our own file. Guard: if either device ID is the sentinel "dev_unknown"
      // we cannot reliably match — treat as a different device and proceed with the
      // import so the file is not silently dropped.
      if (f.deviceId && f.deviceId === myDeviceId && myDeviceId !== "dev_unknown") continue;
      var fileTime = f.createdAt ? new Date(f.createdAt).getTime() : (f.lastModified || 0);
      var deviceRecord = (f.deviceId && perDevice[f.deviceId]) ? perDevice[f.deviceId] : null;
      if (deviceRecord) {
        // Seen this peer before — accept files newer than what we last
        // imported from THEM. Prefer the recorded fileCreatedAt (matches
        // f.createdAt exactly); fall back to fileLastModified or the
        // import wall-clock for older entries that pre-date the
        // fileCreatedAt field.
        var lastFromDeviceMs = 0;
        if (deviceRecord.fileCreatedAt) lastFromDeviceMs = new Date(deviceRecord.fileCreatedAt).getTime();
        else if (deviceRecord.fileLastModified) lastFromDeviceMs = Number(deviceRecord.fileLastModified) || 0;
        else if (deviceRecord.at) lastFromDeviceMs = new Date(deviceRecord.at).getTime();
        if (fileTime > lastFromDeviceMs) updates.push(f);
      } else {
        // First contact with this peer. We deliberately do NOT consult the
        // global lastImportMs here — that's the bug we're fixing. A brand
        // new device's first file should always be considered new, even if
        // its createdAt happens to predate our last import from a different
        // peer. The global is still used as a coarse safety net for files
        // with no deviceId attribution at all (legacy / corrupted exports).
        if (!f.deviceId) {
          if (fileTime > globalLastImportMs) updates.push(f);
        } else {
          updates.push(f);
        }
      }
    }
    return updates;
  }

  function isAutoSyncEnabled() {
    try { return localStorage.getItem(LS_AUTO_SYNC) === "1"; } catch (e) { return false; }
  }

  // Explicit "off" is now stored as "0" rather than by removing the key, so
  // we can tell "the user turned this off" apart from "never chosen". Only
  // the latter gets upgraded to on when a folder is connected — see
  // _defaultAutoSyncOnConnect.
  function setAutoSyncEnabled(enabled) {
    try {
      localStorage.setItem(LS_AUTO_SYNC, enabled ? "1" : "0");
    } catch (e) {}
  }

  // Has the user ever expressed a preference either way?
  function hasAutoSyncPreference() {
    try { return localStorage.getItem(LS_AUTO_SYNC) !== null; } catch (e) { return false; }
  }

  // Connecting a sync folder used to start the watcher (the read path) but
  // leave auto-export (the write path) switched off, because the toggle
  // lived behind a separate Preferences control that defaulted to off. The
  // result was a device that could receive but never send — one user's
  // second device had a folder connected for months with lastExportAt stuck
  // at the day it was set up, so nothing it did ever reached the peer.
  //
  // Picking a folder is an unambiguous "I want this to sync", so treat it as
  // opting in. A user who has explicitly turned auto-sync off is respected.
  function _defaultAutoSyncOnConnect() {
    if (hasAutoSyncPreference()) return;
    setAutoSyncEnabled(true);
    try {
      if (typeof window !== "undefined" && window.dispatchEvent) {
        window.dispatchEvent(new CustomEvent("cs:syncStatusChanged", {
          detail: { reason: "auto-sync-enabled-on-connect" }
        }));
      }
    } catch (e) {}
  }

  // Auto-export debounce (Phase-3 hardening, sync-fix #3):
  //   * First save after a quiet period fires quickly (FAST_DELAY) so a user
  //     who edits and immediately closes the tab doesn't lose the change.
  //   * Subsequent saves within COOLDOWN_MS coalesce into a single later
  //     write at the end of the cooldown — this preserves the original
  //     "don't write 50 times during a paint stroke" behaviour.
  var _autoExportTimer = null;
  var _lastExportFiredAt = 0;
  // Timestamp of the most recent permission-warning toast for auto-export failures.
  // Used to rate-limit repeated toasts on persistent failures.
  var _lastPermWarningAt = 0;
  // Cooldown between permission-warning toasts during a persistent failure run.
  var PERM_WARN_COOLDOWN_MS = 60000;
  var AUTO_EXPORT_DELAY = 30000; // legacy export — kept for compatibility
  var FAST_EXPORT_DELAY = 2000;
  var COOLDOWN_MS = 30000;

  // Internal helper used by both auto-export and the polling watcher to
  // surface failures consistently. Dispatches a `cs:syncError` event and
  // shows a Toast (if available) so permission revocations are visible
  // instead of buried in the console.
  function _reportSyncError(stage, err) {
    try { console.warn("SyncEngine[" + stage + "]:", err); } catch (e) {}
    var msg = (err && err.message) ? err.message : String(err);
    try {
      if (typeof window !== "undefined" && window.dispatchEvent) {
        window.dispatchEvent(new CustomEvent("cs:syncError", {
          detail: { stage: stage, message: msg }
        }));
      }
    } catch (e) {}
    // Activity log: record export/import/watcher failures so the modal can
    // show them. We intentionally don't log every transient watcher tick
    // failure here as a separate type — the stage label tells the story.
    _logEvent({
      type: (stage === "auto-export") ? "export-fail"
          : (stage === "auto-import") ? "import-fail"
          : "watcher-error",
      message: stage + ": " + msg
    });
    // Permission errors warrant a visible toast; transient errors don't
    // (we don't want to spam the user with one toast per failed poll).
    var isPerm = /permission/i.test(msg);
    if (isPerm && typeof window !== "undefined" && window.Toast && window.Toast.show) {
      try {
        window.Toast.show({
          message: "Sync paused — folder permission was revoked. Re-open the sync panel to reconnect.",
          type: "warning",
          duration: 8000
        });
      } catch (e) {}
    }
  }

  function triggerAutoExport() {
    if (!isAutoSyncEnabled()) return;
    Promise.resolve(_watchDirHandle || getWatchDirectory()).then(function (dirHandle) {
      if (!dirHandle) return;
      _watchDirHandle = dirHandle;
      // Coalesce: if a write is already scheduled, leave it alone so a
      // burst of saves all fold into the same write.
      if (_autoExportTimer) return;
      var sinceLast = Date.now() - _lastExportFiredAt;
      var delay;
      if (_lastExportFiredAt === 0 || sinceLast >= COOLDOWN_MS) {
        delay = FAST_EXPORT_DELAY;
      } else {
        delay = Math.max(FAST_EXPORT_DELAY, COOLDOWN_MS - sinceLast);
      }
      _autoExportTimer = setTimeout(function () {
        var watchDirHandle = _watchDirHandle;
        _autoExportTimer = null;
        // Note: _lastExportFiredAt is intentionally NOT bumped here. We
        // only count a fire as "happened" once exportToFolder actually
        // resolves successfully — otherwise a permission-denied or
        // transient I/O failure would silently inflate the cooldown
        // window, delaying the *next* legitimate auto-export attempt by
        // up to COOLDOWN_MS even though no bytes were written.
        if (!watchDirHandle) return;
        // Pre-check permission without user gesture — skip if not granted
        watchDirHandle.queryPermission({ mode: "readwrite" }).then(function (perm) {
          if (perm !== "granted") {
            // Only surface a permission warning toast once per PERM_WARN_COOLDOWN_MS
            // to avoid spamming when the user keeps making changes with no folder access.
            var now = Date.now();
            if (now - _lastPermWarningAt >= PERM_WARN_COOLDOWN_MS) {
              _lastPermWarningAt = now;
              _reportSyncError("auto-export", new Error("Write permission not granted (re-open sync panel to re-authorise)"));
            }
            return;
          }
          return exportToFolder().then(function () {
            _lastExportFiredAt = Date.now();
            try {
              if (typeof window !== "undefined" && window.dispatchEvent) {
                window.dispatchEvent(new CustomEvent("cs:syncStatusChanged", {
                  detail: { reason: "exported" }
                }));
              }
            } catch (e) {}
          });
        }).catch(function (e) {
          _reportSyncError("auto-export", e);
        });
      }, delay);
    }).catch(function (e) {
      _reportSyncError("auto-export", e);
    });
  }

  // ── Folder watcher (Phase-3, sync-fix #1) ────────────────────────────────
  // Periodically scans the watch folder for .csync files newer than our
  // LAST_IMPORT timestamp. Only ticks while the page is visible.
  // Auto-applies plans that contain ONLY new-remote entries (no conflicts,
  // no merge-tracking) and dispatches `cs:syncUpdatesAvailable` for the rest
  // so the existing banner UI can present them for manual review.
  var _watcherInterval = null;
  var _watcherInFlight = false;
  var _watcherVisHandler = null;
  // Latch: ensures the "permission revoked" prompt fires only once per
  // session per loss event. Reset by requestFolderPermission when the
  // user successfully re-grants access.
  var _permissionLossAnnounced = false;
  var WATCHER_INTERVAL_MS = 10000;
  // Phase D — lightweight diagnostics counters. Exposed via getDiagnostics()
  // so users (and us) can confirm the watcher is actually firing without
  // having to dig in DevTools. All counters are session-local; a refresh
  // resets them.
  var _diagnostics = {
    tickCount: 0,
    lastTickAt: null,
    tickFailures: 0,
    lastFailureAt: null,
    updatesSeen: 0,
    skipsHidden: 0,
    skipsNoHandle: 0,
    skipsNoPermission: 0,
    skipsLockHeld: 0,
    lastLockHeldAt: null
  };
  // Per-session dedup of "pending" updates that we've already surfaced via
  // cs:syncUpdatesAvailable. Without this, a file containing conflicts
  // would re-fire the event every poll tick (because LS_LAST_IMPORT is only
  // updated when executeImport runs, which it doesn't for conflicts).
  // Keyed by deviceId + "|" + lastModified — a new write from the other
  // device gets a new lastModified and re-triggers correctly.
  var _seenPendingKeys = Object.create(null);
  // Latest pending plan published by the watcher. Read by SyncReviewGate
  // (via window.SyncEngine.getPendingPlan) so the "Review sync" header
  // menu can show the same plan as /home's banner instead of an empty
  // state. See reports/sync-reference/00_DIAGNOSIS.md fixes #1 and #3.
  var _latestPendingPlan = null;

  function getPendingPlan() { return _latestPendingPlan; }
  function clearPendingPlan() {
    _latestPendingPlan = null;
    _persistPendingPlan(null).catch(function () {});
  }
  // Big1 unification: single canonical setter so manual file-picker imports
  // and watcher-driven imports both feed the same authoritative cache.
  // Before this, manual imports only populated header.js's tab-local
  // `_lastReceivedPlan`, so opening "Review sync" in another tab — or after
  // closing the gate — found an empty state even though a plan had just
  // been prepared. Now both paths converge here, and the IDB persistence
  // (with TTL) means the plan survives reload regardless of origin.
  function setPendingPlan(plan) {
    _latestPendingPlan = plan || null;
    if (_latestPendingPlan) {
      _persistPendingPlan(_latestPendingPlan).catch(function () {});
    } else {
      _persistPendingPlan(null).catch(function () {});
    }
    try {
      if (typeof window !== "undefined" && window.dispatchEvent) {
        window.dispatchEvent(new CustomEvent("cs:syncPlanPending", {
          detail: { plan: _latestPendingPlan, update: null }
        }));
      }
    } catch (e) {}
  }

  // Persist the latest pending plan into the same IDB store that holds the
  // watch-folder handle. Survives reloads and tab restarts so the user can
  // close the browser, reopen later, and "Review sync" still has the plan
  // queued by the watcher last session. Bounded by PENDING_PLAN_MAX_BYTES
  // so we never balloon IDB with a multi-megabyte plan; if a plan is too
  // large we drop persistence and rely on the watcher tick to re-prepare
  // it after reload (~10s). See reports/sync-reference fix #3.
  var PENDING_PLAN_KEY = "pendingPlan";
  var PENDING_PLAN_MAX_BYTES = 5 * 1024 * 1024; // 5 MB JSON
  // QW4: TTL for persisted pending plans. If the user dismissed the app and
  // never came back to review a queued conflict, we'd rather drop the stale
  // plan than resurrect a 6-month-old conflict from a project they may have
  // since deleted. The next watcher tick will re-prepare a current plan
  // from the still-present .csync files in the watch folder.
  var PENDING_PLAN_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

  async function _persistPendingPlan(plan) {
    try {
      var db = await openSyncMetaDB();
      await new Promise(function (resolve, reject) {
        var tx = db.transaction("sync_state", "readwrite");
        var store = tx.objectStore("sync_state");
        if (plan == null) {
          store.delete(PENDING_PLAN_KEY);
        } else {
          // Bounds check on serialised size; very large plans are
          // dropped from persistence (the in-memory cache still works
          // for the current session).
          var serialised;
          try { serialised = JSON.stringify(plan); } catch (e) { serialised = null; }
          if (!serialised || serialised.length > PENDING_PLAN_MAX_BYTES) {
            store.delete(PENDING_PLAN_KEY);
          } else {
            store.put({ at: new Date().toISOString(), plan: plan }, PENDING_PLAN_KEY);
          }
        }
        tx.oncomplete = function () { db.close(); resolve(); };
        tx.onerror = function () { db.close(); reject(tx.error); };
      });
    } catch (e) {
      // Best-effort persistence — never block the watcher on IDB errors.
      try { console.warn("SyncEngine: persist pending plan failed:", e); } catch (_) {}
    }
  }

  async function _hydratePendingPlan() {
    if (_latestPendingPlan) return _latestPendingPlan; // in-memory wins
    try {
      var db = await openSyncMetaDB();
      var stored = await new Promise(function (resolve, reject) {
        var tx = db.transaction("sync_state", "readonly");
        var req = tx.objectStore("sync_state").get(PENDING_PLAN_KEY);
        req.onsuccess = function () { resolve(req.result || null); };
        req.onerror = function () { resolve(null); };
        tx.oncomplete = function () { db.close(); };
      });
      if (stored && stored.plan && !_latestPendingPlan) {
        // QW4: TTL check. `at` was written by _persistPendingPlan as ISO
        // string; tolerate older records lacking it (treat as fresh) so
        // we don't lose plans during the rollout window.
        var ageMs = stored.at ? Math.max(0, Date.now() - new Date(stored.at).getTime()) : 0;
        if (ageMs > PENDING_PLAN_TTL_MS) {
          // Stale — drop the persisted copy and don't rehydrate. The
          // watcher will rebuild it from disk on the next tick if the
          // underlying .csync is still there.
          _persistPendingPlan(null).catch(function () {});
          // Audit follow-up: notify any tab caches that the durable plan
          // is gone so a stale UI doesn't keep referencing it after the
          // user finally returns to the app.
          try {
            if (typeof window !== "undefined" && window.dispatchEvent) {
              window.dispatchEvent(new CustomEvent("cs:syncPlanPending", { detail: { plan: null, reason: "ttl-expired" } }));
            }
          } catch (e) {}
        } else {
          _latestPendingPlan = stored.plan;
        }
      }
    } catch (e) { /* ignore */ }
    return _latestPendingPlan;
  }

  function _pendingKey(update) {
    var d = (update && update.deviceId) ? update.deviceId : "?";
    var m = (update && update.lastModified) ? update.lastModified : 0;
    return d + "|" + m;
  }

  function _entryData(entry) {
    return (entry && entry.remote && entry.remote.data) || null;
  }

  function _isPlanAutoApplicable(plan) {
    if (!plan) return false;
    // Structural conflicts always need a human: the two devices edited the
    // chart itself in incompatible ways and the merge engine cannot pick a
    // winner without losing someone's work.
    if (plan.conflicts && plan.conflicts.length > 0) return false;
    // Big2: integrity gate. Refuse to auto-apply entries that look malformed
    // (missing id, missing pattern, implausible dims) so we never silently
    // write garbage to IDB — those fall through to manual review instead.
    var applicable = 0;
    var i;
    if (plan.newRemote) {
      for (i = 0; i < plan.newRemote.length; i++) {
        if (!_isProjectShapeValid(_entryData(plan.newRemote[i]))) return false;
        applicable++;
      }
    }
    // merge-tracking is auto-applicable. mergeTrackingProgress unions the
    // done arrays and dedups sessions, so applying it is non-destructive by
    // construction — it produces exactly what the review gate's default
    // "merge" action produces. Gating it here was why updates to an
    // already-shared pattern never propagated: after the first sync every
    // shared project lands in merge-tracking, so the gate blocked every
    // subsequent change and the receiving device stayed frozen.
    //
    // Known limitation: a deliberate un-stitch on the peer is re-added by
    // the union. Distinguishing that from "this device simply stitched more"
    // needs three-way snapshot diffing (see analyseConflicts) and is tracked
    // separately; the union was already the gate's default outcome.
    if (plan.mergeTracking) {
      for (i = 0; i < plan.mergeTracking.length; i++) {
        if (!_isProjectShapeValid(_entryData(plan.mergeTracking[i]))) return false;
        applicable++;
      }
    }
    // remote tombstones / stash / prefs alone could be auto-applied too, but
    // they're surfaced via the manual flow today — keep parity.
    return applicable > 0;
  }

  // Big2: cheap structural sanity check used by the auto-apply gate.
  // We've already passed gzip Adler-32 (in pako) + JSON.parse, so we know
  // the bytes round-tripped and parsed as valid JSON. This catches the
  // higher-level case where a project entry is technically JSON but
  // missing fields the merge engine assumes (id, w/h, pattern array of
  // expected length). Rejecting auto-apply for malformed entries hands
  // the plan to manual review instead of corrupting local storage.
  function _isProjectShapeValid(p) {
    if (!p || typeof p !== "object") return false;
    if (typeof p.id !== "string" || !p.id) return false;
    // Dimensions must be read the same way computeFingerprint reads them.
    // The Creator writes them ONLY into settings.sW / settings.sH (see
    // creator/useProjectIO.js) with no top-level w/h, so a `typeof p.w`
    // check rejected every Creator-authored project — which meant the
    // auto-apply gate refused the entire first sync and pushed it to
    // manual review, where it was easy to never notice.
    var w = _projectWidth(p);
    var h = _projectHeight(p);
    if (typeof w !== "number" || typeof h !== "number") return false;
    if (!isFinite(w) || !isFinite(h)) return false;
    if (w <= 0 || h <= 0 || w > 10000 || h > 10000) return false;
    if (!Array.isArray(p.pattern)) return false;
    // Accept slight length drift (some legacy versions stored sparse arrays)
    // but reject obvious truncation: pattern shorter than half the expected
    // grid is almost certainly corrupt.
    var expected = w * h;
    if (p.pattern.length > 0 && p.pattern.length < expected / 2) return false;
    return true;
  }

  // Canonical dimension accessors. settings.sW/sH is the shape the Creator
  // persists; top-level w/h is what the Tracker and some importers add.
  // computeFingerprint has always preferred settings first — everything that
  // reasons about a project's size must agree with it.
  function _projectWidth(p) {
    if (!p) return undefined;
    if (p.settings && typeof p.settings.sW === "number") return p.settings.sW;
    return typeof p.w === "number" ? p.w : undefined;
  }

  function _projectHeight(p) {
    if (!p) return undefined;
    if (p.settings && typeof p.settings.sH === "number") return p.settings.sH;
    return typeof p.h === "number" ? p.h : undefined;
  }

  // True when a plan carries no project-level work at all. Used to suppress
  // empty "updates available" banners: now that imported projects keep their
  // original updatedAt, a peer re-exporting unchanged data classifies every
  // project as `identical`, which would otherwise fire a review prompt with
  // nothing in it on every watcher tick.
  function _planHasProjectWork(plan) {
    if (!plan) return false;
    return ((plan.newRemote && plan.newRemote.length) || 0)
         + ((plan.mergeTracking && plan.mergeTracking.length) || 0)
         + ((plan.conflicts && plan.conflicts.length) || 0) > 0;
  }

  // Does the stash merge actually change anything, or does it just restate
  // what we already hold? plan.stashMerge is non-null on essentially every
  // sync (mergeStash always returns an object), so testing it for existence
  // is useless — it would mark every unchanged re-sync as "has side effects"
  // and fire a review prompt on every watcher tick. Compare against the
  // normalised local stash instead: merging local with nothing yields the
  // same shape mergeStash produces, so any difference is a real remote
  // contribution.
  function _stashMergeChangesAnything(plan) {
    if (!plan || !plan.stashMerge) return false;
    try {
      var normalisedLocal = mergeStash(plan.localStash || {}, {});
      return JSON.stringify(normalisedLocal) !== JSON.stringify(plan.stashMerge);
    } catch (e) {
      return true; // be conservative — surface it rather than swallow it
    }
  }

  function _prefsChangeAnything(plan) {
    var prefs = plan && plan.syncObj && plan.syncObj.prefs;
    if (!prefs) return false;
    var keys = Object.keys(prefs);
    for (var i = 0; i < keys.length; i++) {
      var current = null;
      try { current = localStorage.getItem(keys[i]); } catch (e) {}
      if (current !== prefs[keys[i]]) return true;
    }
    return false;
  }

  function _tombstonesChangeAnything(plan) {
    var remote = plan && plan.remoteTombstones;
    if (!remote || !remote.length) return false;
    var known = Object.create(null);
    var local = getLocalTombstones();
    for (var i = 0; i < local.length; i++) known[local[i]] = true;
    for (var j = 0; j < remote.length; j++) {
      if (!known[remote[j]]) return true;
    }
    return false;
  }

  function _planHasSideEffects(plan) {
    if (!plan) return false;
    return _stashMergeChangesAnything(plan)
        || _tombstonesChangeAnything(plan)
        || _prefsChangeAnything(plan);
  }

  // Split a prepared plan into the part we can apply unattended and the part
  // that genuinely needs the user. Previously the auto-apply decision was
  // all-or-nothing across the whole file: a single malformed entry sent every
  // other project in the same .csync to manual review with it. Now the good
  // entries land immediately and only the questionable ones are queued.
  //
  // Returns { autoPlan, reviewPlan }, either of which may be null.
  // Side effects (stash, prefs, tombstones) ride with autoPlan when one
  // exists and are stripped from reviewPlan so they can't be applied twice.
  function _partitionPlan(plan) {
    if (!plan) return { autoPlan: null, reviewPlan: null };

    if (!_planHasProjectWork(plan)) {
      // Nothing to import. Keep parity for stash/prefs-only deliveries
      // (still surfaced for review); drop genuinely empty ones entirely.
      return { autoPlan: null, reviewPlan: _planHasSideEffects(plan) ? plan : null };
    }

    // Fast path — the common case is a delivery that is entirely safe.
    // Reusing the whole-plan predicate keeps one source of truth for
    // "can this be applied unattended" instead of restating the rule here.
    if (_isPlanAutoApplicable(plan)) return { autoPlan: plan, reviewPlan: null };

    var autoNew = [], reviewNew = [], autoMerge = [], reviewMerge = [];
    var i;
    for (i = 0; i < (plan.newRemote || []).length; i++) {
      var ne = plan.newRemote[i];
      (_isProjectShapeValid(_entryData(ne)) ? autoNew : reviewNew).push(ne);
    }
    for (i = 0; i < (plan.mergeTracking || []).length; i++) {
      var me = plan.mergeTracking[i];
      (_isProjectShapeValid(_entryData(me)) ? autoMerge : reviewMerge).push(me);
    }
    var conflicts = plan.conflicts || [];

    var hasAuto = (autoNew.length + autoMerge.length) > 0;
    var hasReview = (reviewNew.length + reviewMerge.length + conflicts.length) > 0;

    // Nothing safe to apply — hand the whole plan over untouched.
    if (!hasAuto) return { autoPlan: null, reviewPlan: plan };

    function keptRewrites(entries) {
      return (plan.idRewrites || []).filter(function (r) { return entries.indexOf(r) !== -1; });
    }

    var autoPlan = Object.assign({}, plan, {
      newRemote: autoNew,
      mergeTracking: autoMerge,
      conflicts: [],
      idRewrites: keptRewrites(autoMerge)
    });

    if (!hasReview) return { autoPlan: autoPlan, reviewPlan: null };

    // autoPlan already applied stash / prefs / tombstones — strip them from
    // the review half so executeImport can't double-apply them later.
    var reviewSyncObj = Object.assign({}, plan.syncObj);
    delete reviewSyncObj.prefs;
    var reviewPlan = Object.assign({}, plan, {
      newRemote: reviewNew,
      mergeTracking: reviewMerge,
      conflicts: conflicts,
      idRewrites: keptRewrites(reviewMerge),
      stashMerge: null,
      remoteTombstones: [],
      syncObj: reviewSyncObj
    });

    return { autoPlan: autoPlan, reviewPlan: reviewPlan };
  }

  async function _processFolderUpdates(updates) {
    if (!updates || !updates.length) return { autoApplied: [], pending: [] };
    var autoApplied = [];
    var pending = [];
    for (var i = 0; i < updates.length; i++) {
      var u = updates[i];
      try {
        var plan = await prepareImport(u.syncObj);
        // Decorate the plan so executeImport can attribute the activity-log
        // entry / per-device "last imported" record to a real file.
        plan._fileName = u.fileName || null;
        plan._fileLastModified = u.lastModified || null;
        // Split the delivery: everything safe applies now, anything needing
        // a decision is queued. A malformed entry no longer holds back the
        // healthy projects that arrived in the same file.
        var parts = _partitionPlan(plan);
        if (parts.autoPlan) {
          var result = await executeImport(parts.autoPlan);
          autoApplied.push({ update: u, plan: parts.autoPlan, result: result });
          // Tell the rest of the app (home dashboard, manager, tracker) to
          // refresh — this matches the events fired by the manual import path.
          try { window.dispatchEvent(new CustomEvent("cs:backupRestored")); } catch (e) {}
          if (result && result.stashUpdated) {
            try { window.dispatchEvent(new CustomEvent("cs:stashChanged")); } catch (e) {}
          }
        }
        if (parts.reviewPlan) {
          // executeImport clears the pending-plan cache on success, so the
          // review half must be queued after the auto half has run.
          pending.push({ update: u, plan: parts.reviewPlan });
        }
      } catch (e) {
        // EncryptionError("passphrase_required") is the expected steady
        // state when a peer ships encrypted files but this device hasn't
        // unlocked yet — don't blast the activity log with it on every
        // 10s tick. We still surface it as a pending entry so the UI can
        // prompt; we just skip the noisy _reportSyncError for that one
        // specific code.
        if (!(e && e.name === "EncryptionError" && e.code === "passphrase_required")) {
          _reportSyncError("auto-import", e);
        }
        pending.push({
          update: u,
          plan: null,
          error: (e && e.message) || String(e),
          errorCode: (e && e.code) || null
        });
      }
    }
    if (autoApplied.length) {
      var totalImported = 0;
      var deviceNames = Object.create(null);
      for (var j = 0; j < autoApplied.length; j++) {
        var pa = autoApplied[j].plan;
        // Count merges as well as brand-new imports — merge-tracking is now
        // auto-applied, and a silent update is exactly what the user was
        // missing before. Without this the toast stays at 0 and an update to
        // an existing pattern lands with no feedback at all.
        totalImported += (pa.newRemote ? pa.newRemote.length : 0)
                       + (pa.mergeTracking ? pa.mergeTracking.length : 0);
        var dn = autoApplied[j].update.deviceName;
        if (dn) deviceNames[dn] = true;
      }
      var dnKeys = Object.keys(deviceNames);
      var deviceLabel = (dnKeys.length === 1) ? dnKeys[0] : "";
      if (totalImported > 0 && typeof window !== "undefined" && window.Toast && window.Toast.show) {
        try {
          var msg = totalImported + " pattern" + (totalImported !== 1 ? "s" : "")
            + " synced" + (deviceLabel ? " from " + deviceLabel : "");
          window.Toast.show({
            message: msg,
            type: "success",
            duration: 6000,
            // Phase C: let users jump straight to the activity log so they
            // can see exactly what was auto-imported (since the gate never
            // opens for conflict-free syncs). The link dispatches a
            // window event instead of calling into home-screen directly so
            // any page can listen and route appropriately.
            actionLabel: "View activity",
            action: function () {
              try {
                window.dispatchEvent(new CustomEvent("cs:openSyncActivity", { detail: { source: "auto-apply-toast" } }));
              } catch (e) {}
            }
          });
        } catch (e) {}
      }
    }
    if (pending.length && typeof window !== "undefined" && window.dispatchEvent) {
      // Dedup: only dispatch updates we haven't already surfaced this session.
      var freshPending = [];
      for (var pk = 0; pk < pending.length; pk++) {
        var key = _pendingKey(pending[pk].update);
        if (!_seenPendingKeys[key]) {
          _seenPendingKeys[key] = true;
          freshPending.push(pending[pk]);
        }
      }
      if (freshPending.length) {
        // Cache the most recent prepared plan so the header "Review sync"
        // menu (and any other surface) can read it without re-running
        // prepareImport. Without this, the watcher's plan only reaches
        // /home's banner via cs:syncUpdatesAvailable; the SyncReviewGate
        // on /create, /stitch, /manager would silently show its empty
        // state. See reports/sync-reference/00_DIAGNOSIS.md fix #1.
        var latest = freshPending[freshPending.length - 1];
        _latestPendingPlan = (latest && latest.plan) || null;
        if (_latestPendingPlan) {
          _persistPendingPlan(_latestPendingPlan).catch(function () {});
        }
        try {
          window.dispatchEvent(new CustomEvent("cs:syncUpdatesAvailable", {
            detail: { updates: freshPending.map(function (p) { return p.update; }), pending: freshPending }
          }));
        } catch (e) {}
        // Sibling event for surfaces that want to know "a plan is ready
        // for review" without subscribing to /home's banner contract.
        // Listeners must NOT auto-open the gate — that would interrupt
        // the user mid-action; only the manual `sync-plan-ready` path
        // opens the modal.
        try {
          window.dispatchEvent(new CustomEvent("cs:syncPlanPending", {
            detail: { plan: _latestPendingPlan, update: (latest && latest.update) || null }
          }));
        } catch (e) {}
        // Also log each fresh-pending delivery so the activity log shows
        // "needs review" entries — otherwise conflicts would be invisible
        // until the user clicks Review & import.
        for (var fpi = 0; fpi < freshPending.length; fpi++) {
          var fp = freshPending[fpi];
          var fpu = fp.update || {};
          var fpp = fp.plan || {};
          _logEvent({
            type: "pending-review",
            direction: "in",
            deviceId: fpu.deviceId,
            deviceName: fpu.deviceName,
            fileName: fpu.fileName,
            projectCount: ((fpp.newRemote && fpp.newRemote.length) || 0)
              + ((fpp.mergeTracking && fpp.mergeTracking.length) || 0)
              + ((fpp.conflicts && fpp.conflicts.length) || 0),
            conflicts: (fpp.conflicts && fpp.conflicts.length) || 0,
            message: fp.error || null
          });
        }
      }
    }
    return { autoApplied: autoApplied, pending: pending };
  }

  async function _runWatcherTick() {
    if (_watcherInFlight) return;
    if (typeof document !== "undefined" && document.visibilityState !== "visible") {
      _diagnostics.skipsHidden++;
      return;
    }
    var handle = _watchDirHandle || (await getWatchDirectory().catch(function () { return null; }));
    if (!handle) {
      _diagnostics.skipsNoHandle++;
      return;
    }
    // Permission gate: requestPermission() requires a user gesture, but a
    // setInterval/visibilitychange tick is NOT a user gesture. If we just
    // call scanFolder() here, scanFolder's internal requestPermission will
    // throw a SecurityError on every tick. So check first and skip silently
    // when permission isn't already granted — the user will re-authorise
    // by re-opening the sync panel (which IS a user gesture).
    if (typeof handle.queryPermission === "function") {
      var permState = null;
      try {
        permState = await handle.queryPermission({ mode: "read" });
      } catch (e) {
        permState = "errored";
      }
      if (permState !== "granted") {
        _diagnostics.skipsNoPermission++;
        // Surface the revocation the FIRST time the watcher notices it,
        // so a user whose browser silently downgraded permission mid-
        // session sees a Reconnect prompt instead of a silently-dead
        // sync. _permissionLossAnnounced is reset whenever permission
        // is regranted (see requestFolderPermission). Without this the
        // tick would keep incrementing skipsNoPermission with zero UI
        // feedback — the exact failure mode that hid this from users
        // for an entire session of cross-device editing.
        if (!_permissionLossAnnounced) {
          _permissionLossAnnounced = true;
          try {
            if (typeof window !== "undefined" && window.dispatchEvent) {
              window.dispatchEvent(new CustomEvent("cs:syncPermissionNeeded", {
                detail: { handleName: handle.name || "Sync folder", state: permState }
              }));
            }
          } catch (e) {}
          _logEvent({
            type: "permission-needed",
            message: 'Browser permission was "' + permState + '" for folder "' + (handle.name || "?") + '" (watcher tick)'
          });
          if (typeof window !== "undefined" && window.Toast && window.Toast.show) {
            try {
              window.Toast.show({
                message: "Sync paused — folder permission was revoked. Re-open the sync panel to reconnect.",
                type: "warning",
                duration: 8000
              });
            } catch (e) {}
          }
        }
        return;
      }
    }
    _watcherInFlight = true;
    _diagnostics.tickCount++;
    _diagnostics.lastTickAt = new Date().toISOString();
    try {
      // Cross-tab coordination: when the user has multiple tabs open, every
      // tab's header.js starts a watcher. Without coordination, all tabs
      // would race to import the same .csync deliveries, double-firing the
      // "synced" toast and double-saving (idempotent but wasteful).
      // Web Locks API gives us a clean per-origin mutex; ifAvailable=true
      // means we skip silently when another tab already holds the lock.
      var doWork = async function () {
        var updates = await checkForUpdates(handle);
        if (updates && updates.length) {
          _diagnostics.updatesSeen += updates.length;
          await _processFolderUpdates(updates);
        }
      };
      if (typeof navigator !== "undefined" && navigator.locks && navigator.locks.request) {
        await navigator.locks.request("cs_sync_import", { ifAvailable: true }, async function (lock) {
          if (!lock) {
            _diagnostics.skipsLockHeld++;
            _diagnostics.lastLockHeldAt = new Date().toISOString();
            return;
          } // Another tab is processing — let it.
          await doWork();
        });
      } else {
        await doWork();
      }
    } catch (e) {
      _diagnostics.tickFailures++;
      _diagnostics.lastFailureAt = new Date().toISOString();
      _reportSyncError("watcher", e);
    } finally {
      _watcherInFlight = false;
    }
  }

  function startWatching(intervalMs) {
    stopWatching();
    // Lazy hydration: pull any persisted pending plan (fix #3) so the
    // header "Review sync" menu has a plan to show immediately after
    // reload, before the first watcher tick has a chance to repopulate.
    _hydratePendingPlan().catch(function () {});
    var interval = (typeof intervalMs === "number" && intervalMs > 0) ? intervalMs : WATCHER_INTERVAL_MS;
    _watcherInterval = setInterval(_runWatcherTick, interval);
    if (typeof document !== "undefined") {
      _watcherVisHandler = function () {
        if (document.visibilityState === "visible") {
          // Immediate catch-up tick when the user returns to the tab.
          _runWatcherTick();
        }
      };
      document.addEventListener("visibilitychange", _watcherVisHandler);
    }
    // Run one tick now (not awaited) so newly-arrived files are picked up
    // promptly rather than waiting a full interval.
    _runWatcherTick();
  }

  function stopWatching() {
    if (_watcherInterval) { clearInterval(_watcherInterval); _watcherInterval = null; }
    if (_watcherVisHandler && typeof document !== "undefined") {
      document.removeEventListener("visibilitychange", _watcherVisHandler);
      _watcherVisHandler = null;
    }
  }

  function isWatching() { return !!_watcherInterval; }

  // Phase D — public read-only view of session diagnostics. Returned object
  // is a shallow clone so callers can't mutate internal counters.
  function getDiagnostics() {
    return {
      tickCount: _diagnostics.tickCount,
      lastTickAt: _diagnostics.lastTickAt,
      tickFailures: _diagnostics.tickFailures,
      lastFailureAt: _diagnostics.lastFailureAt,
      updatesSeen: _diagnostics.updatesSeen,
      skipsHidden: _diagnostics.skipsHidden,
      skipsNoHandle: _diagnostics.skipsNoHandle,
      skipsNoPermission: _diagnostics.skipsNoPermission,
      skipsLockHeld: _diagnostics.skipsLockHeld,
      lastLockHeldAt: _diagnostics.lastLockHeldAt,
      watcherIntervalMs: WATCHER_INTERVAL_MS,
      watching: isWatching(),
      hasWatchDir: !!_watchDirHandle
    };
  }

  // Convenience bootstrap for any page that loads SyncEngine but doesn't own
  // the sync UI: looks up the persisted directory handle and, if present and
  // permission is already granted (i.e. we won't prompt), starts the watcher.
  // Safe to call multiple times — startWatching is idempotent.
  async function startAutoWatch() {
    try {
      var handle = await getWatchDirectory();
      if (!handle) return false;
      var perm = "granted";
      if (typeof handle.queryPermission === "function") {
        try { perm = await handle.queryPermission({ mode: "read" }); } catch (e) { perm = "denied"; }
      }
      if (perm !== "granted") {
        // Persistent handle is restored but the browser has dropped permission
        // (typical on Chrome session-isolated permissions, after site-data
        // cleanup, or after the user revokes access). We can't requestPermission
        // here — that needs a user gesture. Emit a status event so the UI can
        // surface a "Reconnect" call-to-action instead of silently going dark.
        try {
          if (typeof window !== "undefined" && window.dispatchEvent) {
            window.dispatchEvent(new CustomEvent("cs:syncPermissionNeeded", {
              detail: { handleName: handle.name || "Sync folder", state: perm }
            }));
          }
        } catch (e) {}
        _logEvent({
          type: "permission-needed",
          message: 'Browser permission was "' + perm + '" for folder "' + (handle.name || "?") + '"'
        });
        return false;
      }
      startWatching();
      return true;
    } catch (e) { return false; }
  }

  // Best-effort live permission check — used by getSyncStatus and the UI
  // "Reconnect" button. Returns "granted" | "prompt" | "denied" | null.
  async function getPermissionState() {
    try {
      var handle = _watchDirHandle || (await getWatchDirectory());
      if (!handle || typeof handle.queryPermission !== "function") return null;
      return await handle.queryPermission({ mode: "readwrite" });
    } catch (e) { return null; }
  }

  // Re-prompt the user for permission and, if granted, start the watcher.
  // MUST be called from a user gesture (click handler) so the browser will
  // allow requestPermission to surface its UI.
  async function requestFolderPermission() {
    var handle = _watchDirHandle || (await getWatchDirectory());
    if (!handle) throw new Error("No sync folder configured.");
    if (typeof handle.requestPermission !== "function") {
      // Older browsers without the permission API — assume already granted.
      try { startWatching(); } catch (e) {}
      return "granted";
    }
    var perm = await handle.requestPermission({ mode: "readwrite" });
    if (perm === "granted") {
      _permissionLossAnnounced = false;
      try { startWatching(); } catch (e) {}
      try {
        if (typeof window !== "undefined" && window.dispatchEvent) {
          window.dispatchEvent(new CustomEvent("cs:syncStatusChanged", {
            detail: { reason: "permission-granted" }
          }));
        }
      } catch (e) {}
    }
    return perm;
  }

  // ── Sync status helpers ──────────────────────────────────────────────────

  var _lastError = null; // { stage, message, at }
  if (typeof window !== "undefined" && window.addEventListener) {
    try {
      window.addEventListener("cs:syncError", function (e) {
        var d = e && e.detail;
        if (d) _lastError = { stage: d.stage, message: d.message, at: new Date().toISOString() };
      });
    } catch (e) {}
  }

  // sync-reference Phase 7: let UI dismiss a stale warning row after the
  // user has dealt with the underlying issue (e.g. re-granted permission).
  // Without this, _lastError lingers until the page reloads and a persistent
  // warning banner stays visible even though sync is healthy again.
  function clearLastError() {
    _lastError = null;
    try {
      if (typeof window !== "undefined" && window.dispatchEvent) {
        window.dispatchEvent(new CustomEvent("cs:syncStatusChanged", {
          detail: { reason: "error-cleared" }
        }));
      }
    } catch (e) {}
  }

  function getSyncStatus() {
    var lastExport = null, lastImport = null;
    try { lastExport = localStorage.getItem(LS_LAST_EXPORT); } catch (e) {}
    try { lastImport = localStorage.getItem(LS_LAST_IMPORT); } catch (e) {}
    return {
      deviceId: getDeviceId(),
      deviceName: getDeviceName(),
      lastExportAt: lastExport,
      lastImportAt: lastImport,
      hasFolderWatch: hasFolderWatchSupport(),
      hasWatchDir: !!_watchDirHandle,
      watchDirName: (_watchDirHandle && _watchDirHandle.name) || null,
      autoSync: isAutoSyncEnabled(),
      watching: isWatching(),
      lastError: _lastError
    };
  }

  // ════════════════════════════════════════════════════════════════════
  // Handshake (Tier-2) — pair another device by exchanging a tiny
  // metadata bundle.
  //
  // The handshake carries NO secrets. It exists purely to reduce the
  // friction of the second device picking the right folder and naming
  // itself sensibly. Encryption passphrases stay device-local.
  //
  // Token = JSON({v, deviceId, deviceName, appVersion, folderHint,
  //              checksum})  →  pako.deflate  →  Base64url
  //
  // Shortcode = first 20 bits of SHA-256(JSON-without-checksum) →
  //             decimal 0..1048575 → 6-digit decimal display.
  //
  // Per the proposal recommendations: no token expiry for MVP, manual
  // code entry only (QR deferred), symmetric pairing, auto-renamed
  // device-name collisions, pre-checked device-id collisions.
  // ════════════════════════════════════════════════════════════════════

  var LS_HANDSHAKE_TOKENS = "cs_handshake_tokens";
  var HANDSHAKE_VERSION = 1;
  var HANDSHAKE_TOKEN_CACHE_MAX = 5;

  function _b64urlEncode(bytes) {
    var binary = "";
    var CHUNK = 0x8000;
    for (var i = 0; i < bytes.length; i += CHUNK) {
      binary += String.fromCharCode.apply(null, bytes.subarray(i, i + CHUNK));
    }
    return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  }

  function _b64urlDecode(str) {
    var s = String(str || "").replace(/-/g, "+").replace(/_/g, "/");
    while (s.length % 4) s += "=";
    var binary = atob(s);
    var out = new Uint8Array(binary.length);
    for (var i = 0; i < binary.length; i++) out[i] = binary.charCodeAt(i);
    return out;
  }

  async function _sha256Hex(str) {
    var enc = new TextEncoder();
    var digest = await crypto.subtle.digest("SHA-256", enc.encode(str));
    var bytes = new Uint8Array(digest);
    var hex = "";
    for (var i = 0; i < bytes.length; i++) hex += ("0" + bytes[i].toString(16)).slice(-2);
    return hex;
  }

  // Derive a 6-digit decimal shortcode from the first 20 bits of the
  // checksum. 20 bits gives 0–1,048,575 — comfortably within 6 digits.
  function _shortcodeFromChecksum(hex) {
    var first5 = String(hex || "").slice(0, 5); // 5 hex chars = 20 bits
    var n = parseInt(first5, 16);
    if (!isFinite(n) || n < 0) n = 0;
    n = n % 1000000;
    var s = String(n);
    while (s.length < 6) s = "0" + s;
    return s;
  }

  function _readHandshakeCache() {
    try {
      var raw = localStorage.getItem(LS_HANDSHAKE_TOKENS);
      var arr = raw ? JSON.parse(raw) : [];
      return Array.isArray(arr) ? arr : [];
    } catch (e) { return []; }
  }

  function _writeHandshakeCache(arr) {
    try {
      var trimmed = arr.slice(-HANDSHAKE_TOKEN_CACHE_MAX);
      localStorage.setItem(LS_HANDSHAKE_TOKENS, JSON.stringify(trimmed));
    } catch (e) {}
  }

  // Public — generate a token + shortcode for this device.
  // folderHint is optional; the caller (UI) supplies it from the
  // currently-selected watch folder if available. The returned object
  // is what UIs render.
  async function generateHandshakeToken(opts) {
    opts = opts || {};
    var bundle = {
      v: HANDSHAKE_VERSION,
      deviceId: getDeviceId(),
      deviceName: opts.deviceName || getDeviceName() || "",
      appVersion: (typeof window !== "undefined" && (window.APP_VERSION || window.AppVersion)) || (opts.appVersion || ""),
      folderHint: opts.folderHint || null
    };
    var canonical = JSON.stringify(bundle);
    var checksum = await _sha256Hex(canonical);
    bundle.checksum = checksum;
    var json = JSON.stringify(bundle);
    var compressed = pako.deflate(json);
    var token = _b64urlEncode(compressed);
    var shortcode = _shortcodeFromChecksum(checksum);
    var entry = {
      shortcode: shortcode,
      token: token,
      checksum: checksum,
      createdAt: new Date().toISOString()
    };
    // Cache so a sibling tab on the same device can resolve the
    // shortcode → token without re-typing. We dedupe on shortcode.
    var cache = _readHandshakeCache().filter(function (e) { return e.shortcode !== shortcode; });
    cache.push(entry);
    _writeHandshakeCache(cache);
    return { token: token, shortcode: shortcode, checksum: checksum, bundle: bundle };
  }

  // Public — validate a token (or a shortcode that resolves to a
  // cached token). Returns {valid:true, bundle, warnings} on success
  // or {valid:false, error} on failure.
  async function validateHandshakeToken(input) {
    input = String(input == null ? "" : input).trim();
    if (!input) return { valid: false, error: "Enter a code or token." };

    // Numeric-shortcode resolution. Accept "482917", "482 917",
    // "482-917". Look up the local cache first; if not found, ask the
    // caller to paste the full token.
    var digits = input.replace(/\D+/g, "");
    var token = input;
    if (digits.length === 6 && digits === input.replace(/[\s-]/g, "")) {
      var cache = _readHandshakeCache();
      var hit = null;
      for (var i = cache.length - 1; i >= 0; i--) {
        if (cache[i].shortcode === digits) { hit = cache[i]; break; }
      }
      if (!hit) {
        return {
          valid: false,
          error: "No matching code on this device. Paste the full token from the other device instead.",
          needsToken: true,
          shortcode: digits
        };
      }
      token = hit.token;
    }

    var bundle;
    try {
      var bytes = _b64urlDecode(token);
      var json = pako.inflate(bytes, { to: "string" });
      bundle = JSON.parse(json);
    } catch (e) {
      return { valid: false, error: "That code or token doesn't look right. Double-check and try again." };
    }
    if (!bundle || bundle.v !== HANDSHAKE_VERSION) {
      return { valid: false, error: "Unsupported handshake version: " + (bundle && bundle.v) };
    }
    if (!bundle.deviceId || !bundle.checksum) {
      return { valid: false, error: "The token is missing required fields." };
    }
    var sumCopy = Object.assign({}, bundle);
    var providedChecksum = sumCopy.checksum;
    delete sumCopy.checksum;
    var canonical = JSON.stringify(sumCopy);
    var actualChecksum = await _sha256Hex(canonical);
    if (actualChecksum !== providedChecksum) {
      return { valid: false, error: "Checksum mismatch — the code may have been mistyped." };
    }

    // Pre-check warnings (non-fatal).
    var warnings = [];
    if (bundle.deviceId === getDeviceId()) {
      warnings.push({
        code: "self_pairing",
        message: "That code is from this device. Generate it on the other device instead."
      });
    }
    var lastImport = getLastImportPerDevice();
    if (lastImport && lastImport[bundle.deviceId]) {
      warnings.push({
        code: "already_paired",
        message: "You've already imported from this device. Pairing again is harmless but shouldn't be needed."
      });
    }
    if (bundle.folderHint && bundle.folderHint.lastSyncAt) {
      var ageMs = Date.now() - new Date(bundle.folderHint.lastSyncAt).getTime();
      if (isFinite(ageMs) && ageMs > 7 * 24 * 60 * 60 * 1000) {
        warnings.push({
          code: "stale_folder",
          message: "The other device hasn't synced in over a week — its folder hint may be out of date."
        });
      }
    }

    return { valid: true, bundle: bundle, warnings: warnings };
  }

  // Suggest a non-colliding device name for the joining device.
  // The remote bundle's deviceName is the *other* device's name; we
  // derive a sibling name to avoid users ending up with two "Katie's
  // iMac" entries in the device list.
  function suggestDeviceName(remoteName) {
    var base = String(remoteName || "").trim();
    if (!base) return getDeviceName() || "This device";
    var local = getDeviceName();
    if (local && local !== base) return local;
    // Avoid exact match: derive "X (other)" so the user can edit it.
    return base + " (other)";
  }

  function clearHandshakeCache() {
    try { localStorage.removeItem(LS_HANDSHAKE_TOKENS); } catch (e) {}
  }

  // ── Public API ───────────────────────────────────────────────────────────

  return {
    // Export
    exportSync: exportSync,
    downloadSync: downloadSync,
    compress: compress,
    decompress: decompress,

    // Import
    readSyncFile: readSyncFile,
    validate: validate,
    prepareImport: prepareImport,
    executeImport: executeImport,

    // Destructive: wipe this device's library + sync bookkeeping so it can be
    // rebuilt from a peer. Requires { confirm: "DELETE_LOCAL_LIBRARY" }.
    resetForResync: resetForResync,

    // Snapshot
    readSnapshot: readSnapshot,
    writeSnapshot: writeSnapshot,
    registerBeforeUnloadSnapshot: registerBeforeUnloadSnapshot,

    // Gate-layer conflict analysis
    analyseConflicts: analyseConflicts,
    getPrefLabel: getPrefLabel,

    // Merge (exposed for testing)
    computeFingerprint: computeFingerprint,
    classifyProjects: classifyProjects,
    buildFingerprintIndex: buildFingerprintIndex,
    pickCanonicalId: pickCanonicalId,
    mergeDoneArrays: mergeDoneArrays,
    mergeSessions: mergeSessions,
    mergeTrackingProgress: mergeTrackingProgress,
    mergeStash: mergeStash,
    mergeIndexedPairs: mergeIndexedPairs,
    mergeStitchLogs: mergeStitchLogs,

    // Device & status
    getDeviceId: getDeviceId,
    getDeviceName: getDeviceName,
    setDeviceName: setDeviceName,
    regenerateDeviceId: regenerateDeviceId,
    getSyncStatus: getSyncStatus,
    clearLastError: clearLastError,

    // Folder watching (session 4)
    hasFolderWatchSupport: hasFolderWatchSupport,
    setWatchDirectory: setWatchDirectory,
    getWatchDirectory: getWatchDirectory,
    clearWatchDirectory: clearWatchDirectory,
    exportToFolder: exportToFolder,
    scanFolder: scanFolder,
    checkForUpdates: checkForUpdates,
    isAutoSyncEnabled: isAutoSyncEnabled,
    setAutoSyncEnabled: setAutoSyncEnabled,
    hasAutoSyncPreference: hasAutoSyncPreference,
    triggerAutoExport: triggerAutoExport,

    // Folder watcher (Phase-3)
    startWatching: startWatching,
    stopWatching: stopWatching,
    isWatching: isWatching,
    getDiagnostics: getDiagnostics,
    startAutoWatch: startAutoWatch,
    getPermissionState: getPermissionState,
    requestFolderPermission: requestFolderPermission,

    // Activity log + per-device tracking (Concepts A + B)
    getEventLog: getEventLog,
    clearEventLog: clearEventLog,
    getLastImportPerDevice: getLastImportPerDevice,

    // Pending-plan cache (sync-reference fix #1)
    getPendingPlan: getPendingPlan,
    setPendingPlan: setPendingPlan,
    clearPendingPlan: clearPendingPlan,
    // Async hydrate from IDB (sync-reference fix #3) — returns the plan
    // (or null) once the persisted store has been read.
    hydratePendingPlan: _hydratePendingPlan,

    // Encryption (opt-in, AES-GCM with PBKDF2 key derivation). See the
    // commentary block above _encryptSyncObj for the threat model.
    isEncryptionAvailable: isEncryptionAvailable,
    isEncryptionEnabled: isEncryptionEnabled,
    setEncryptionEnabled: setEncryptionEnabled,
    setEncryptionPassphrase: setEncryptionPassphrase,
    clearEncryptionPassphrase: clearEncryptionPassphrase,
    getEncryptionStatus: getEncryptionStatus,
    decryptSyncObj: decryptSyncObj,

    // Handshake (Tier-2) — pair another device with a 6-digit code or
    // the full Base64url token. See the commentary above
    // generateHandshakeToken for the threat model.
    generateHandshakeToken: generateHandshakeToken,
    validateHandshakeToken: validateHandshakeToken,
    suggestDeviceName: suggestDeviceName,
    clearHandshakeCache: clearHandshakeCache,

    // Constants (for testing)
    SYNC_FORMAT: SYNC_FORMAT,
    SYNC_VERSION: SYNC_VERSION,

    // Test-only hooks for pure helpers. Exposed so unit tests can pin
    // down behaviour without re-implementing the heuristics. Not part
    // of the documented public API — call sites in app code should
    // continue to go through the higher-level entry points.
    _test: {
      isProjectShapeValid: _isProjectShapeValid,
      isPlanAutoApplicable: _isPlanAutoApplicable,
      partitionPlan: _partitionPlan,
      planHasProjectWork: _planHasProjectWork,
      planHasSideEffects: _planHasSideEffects,
      projectWidth: _projectWidth,
      projectHeight: _projectHeight,
      recordDeviceImport: _recordDeviceImport,
      encryptSyncObj: _encryptSyncObj,
      decryptSyncObj: _decryptSyncObj,
      EncryptionError: EncryptionError
    }
  };
})();

if (typeof window !== "undefined") window.SyncEngine = SyncEngine;
if (typeof module !== "undefined" && module.exports) module.exports = SyncEngine;
