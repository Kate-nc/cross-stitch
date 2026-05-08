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
    if (!project || !project.pattern) return "empty";
    try {
      // Build a compact string of pattern cell IDs — this captures the chart
      // structure without tracking state (done array, sessions, etc.)
      const parts = [];
      const pat = project.pattern;
      for (let i = 0; i < pat.length; i++) {
        const c = pat[i];
        parts.push(c && c.id ? c.id : "_");
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
      deviceName: syncObj._deviceName || null,
      projectCount: (syncObj.projects && syncObj.projects.length) || 0
    };
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

    // Sum total time from both sides: each device tracks its own elapsed stitching
    // time independently, so the correct merged value is the sum, not the max.
    // Using Math.max would cap the merged total at whichever device's clock ran
    // longer, silently discarding the other device's recorded work time.
    merged.totalTime = (local.totalTime || 0) + (remote.totalTime || 0);

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

    // Merge project-level metadata (name, state).
    // Default strategy: the side with the newer updatedAt timestamp wins.
    // metaOverrides can pin a field to 'keep-local' or 'keep-remote' to
    // respect explicit user choices made in the SyncReviewGate conflict UI.
    var localTs = local.updatedAt ? new Date(local.updatedAt).getTime() : 0;
    var remoteTs = remote.updatedAt ? new Date(remote.updatedAt).getTime() : 0;
    var metaFieldsList = ["name", "state"];
    for (var mfi = 0; mfi < metaFieldsList.length; mfi++) {
      var mf = metaFieldsList[mfi];
      if (remote[mf] !== undefined && remote[mf] !== local[mf]) {
        var ovr = metaOverrides && metaOverrides[mf];
        if (ovr === 'keep-remote') {
          merged[mf] = remote[mf];
        } else if (ovr === 'keep-local') {
          // keep local (already in merged via Object.assign)
        } else if (remoteTs > localTs) {
          // Default: newer updatedAt wins
          merged[mf] = remote[mf];
        }
        // else local wins (already in merged)
      }
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

  // Open the main CrossStitchDB (uses helpers.js getDB which already bumped to v4)
  function _openSnapshotDB() {
    return new Promise(function(resolve, reject) {
      var req = indexedDB.open("CrossStitchDB", 4);
      req.onupgradeneeded = function(e) {
        var db = e.target.result;
        var ov = e.oldVersion;
        if (ov < 1) { if (!db.objectStoreNames.contains("projects")) db.createObjectStore("projects"); }
        if (ov < 2) { if (!db.objectStoreNames.contains("project_meta")) db.createObjectStore("project_meta"); }
        if (ov < 3) { if (!db.objectStoreNames.contains("stats_summaries")) db.createObjectStore("stats_summaries"); }
        if (ov < 4) { if (!db.objectStoreNames.contains("sync_snapshots")) db.createObjectStore("sync_snapshots"); }
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
              // Both devices changed it differently — conflict
              conflicts.push({ type: "stash", id: "stash:" + id, threadId: id, localOwned: L, remoteOwned: R, snapshotOwned: S });
            } else if (R !== S && L === S) {
              stashUpdated++; // apply remote silently
            } else if (L !== S && R === S) {
              stashUpdated++; // keep local silently
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

    // 1. Import new-remote projects
    for (var i = 0; i < plan.newRemote.length; i++) {
      var entry = plan.newRemote[i];
      try {
        await ProjectStorage.save(entry.remote.data);
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
        await ProjectStorage.save(merged);
        // Delete the now-orphaned local record (only if its id differs from canonical).
        if (oldLocalId && oldLocalId !== canon && ProjectStorage.delete) {
          try { await ProjectStorage.delete(oldLocalId); } catch (e) {
            console.warn("SyncEngine: could not delete orphaned project " + oldLocalId, e);
          }
        }
      } else {
        await ProjectStorage.save(merged);
      }
    }

    // 3. Resolve conflicts
    for (var k = 0; k < plan.conflicts.length; k++) {
      var cEntry = plan.conflicts[k];
      var resolution = conflictResolutions[cEntry.id] || "keep-local";
      if (resolution === "keep-remote") {
        await ProjectStorage.save(cEntry.remote.data);
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
    // Phase-3 sync-fix #1: kick off the polling watcher automatically so any
    // page that configures a sync folder starts receiving remote updates.
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
    try { localStorage.removeItem("cs_sync_folderAutoSync"); } catch (e) {}
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
            + " vs " + collision.myName + "). Open Preferences \u2192 Sync to regenerate this device's id."));
      } catch (e) {}
    }
    var myDeviceId = getDeviceId();
    var lastImport = null;
    try { lastImport = localStorage.getItem(LS_LAST_IMPORT); } catch (e) {}
    var lastImportMs = lastImport ? new Date(lastImport).getTime() : 0;
    var updates = [];
    for (var i = 0; i < files.length; i++) {
      var f = files[i];
      // Skip our own file. Guard: if either device ID is the sentinel "dev_unknown"
      // we cannot reliably match — treat as a different device and proceed with the
      // import so the file is not silently dropped.
      if (f.deviceId && f.deviceId === myDeviceId && myDeviceId !== "dev_unknown") continue;
      // Check if this file is newer than our last import
      var fileTime = f.createdAt ? new Date(f.createdAt).getTime() : (f.lastModified || 0);
      if (fileTime > lastImportMs) {
        updates.push(f);
      }
    }
    return updates;
  }

  function isAutoSyncEnabled() {
    try { return localStorage.getItem("cs_sync_folderAutoSync") === "1"; } catch (e) { return false; }
  }

  function setAutoSyncEnabled(enabled) {
    try {
      if (enabled) localStorage.setItem("cs_sync_folderAutoSync", "1");
      else localStorage.removeItem("cs_sync_folderAutoSync");
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
        _lastExportFiredAt = Date.now();
        if (!watchDirHandle) return;
        // Pre-check permission without user gesture — skip if not granted
        watchDirHandle.queryPermission({ mode: "readwrite" }).then(function (perm) {
          if (perm !== "granted") {
            _reportSyncError("auto-export", new Error("Write permission not granted (re-open sync panel to re-authorise)"));
            return;
          }
          return exportToFolder().then(function () {
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
    skipsLockHeld: 0
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
        var ageMs = stored.at ? (Date.now() - new Date(stored.at).getTime()) : 0;
        if (ageMs > PENDING_PLAN_TTL_MS) {
          // Stale — drop the persisted copy and don't rehydrate. The
          // watcher will rebuild it from disk on the next tick if the
          // underlying .csync is still there.
          _persistPendingPlan(null).catch(function () {});
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

  function _isPlanAutoApplicable(plan) {
    if (!plan) return false;
    if (plan.conflicts && plan.conflicts.length > 0) return false;
    if (plan.mergeTracking && plan.mergeTracking.length > 0) return false;
    if (plan.newRemote && plan.newRemote.length > 0) return true;
    // remote tombstones alone could be auto-applied too, but they're
    // surfaced via the manual flow today — keep parity.
    return false;
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
        if (_isPlanAutoApplicable(plan)) {
          var result = await executeImport(plan);
          autoApplied.push({ update: u, plan: plan, result: result });
          // Tell the rest of the app (home dashboard, manager, tracker) to
          // refresh — this matches the events fired by the manual import path.
          try { window.dispatchEvent(new CustomEvent("cs:backupRestored")); } catch (e) {}
          if (result && result.stashUpdated) {
            try { window.dispatchEvent(new CustomEvent("cs:stashChanged")); } catch (e) {}
          }
        } else {
          pending.push({ update: u, plan: plan });
        }
      } catch (e) {
        _reportSyncError("auto-import", e);
        pending.push({ update: u, plan: null, error: (e && e.message) || String(e) });
      }
    }
    if (autoApplied.length) {
      var totalImported = 0;
      var deviceNames = Object.create(null);
      for (var j = 0; j < autoApplied.length; j++) {
        var pa = autoApplied[j].plan;
        totalImported += (pa.newRemote ? pa.newRemote.length : 0);
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
      try {
        var perm = await handle.queryPermission({ mode: "read" });
        if (perm !== "granted") {
          _diagnostics.skipsNoPermission++;
          return;
        }
      } catch (e) {
        _diagnostics.skipsNoPermission++;
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
          if (!lock) { _diagnostics.skipsLockHeld++; return; } // Another tab is processing — let it.
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
      autoSync: isAutoSyncEnabled(),
      watching: isWatching(),
      lastError: _lastError
    };
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
    clearPendingPlan: clearPendingPlan,
    // Async hydrate from IDB (sync-reference fix #3) — returns the plan
    // (or null) once the persisted store has been read.
    hydratePendingPlan: _hydratePendingPlan,

    // Constants (for testing)
    SYNC_FORMAT: SYNC_FORMAT,
    SYNC_VERSION: SYNC_VERSION
  };
})();

if (typeof window !== "undefined") window.SyncEngine = SyncEngine;
if (typeof module !== "undefined" && module.exports) module.exports = SyncEngine;
