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

  function mergeTrackingProgress(local, remote) {
    // Merge a project where the chart structure is identical but tracking differs.
    // Take the LOCAL project as base, deep-clone mutable sub-objects to avoid
    // mutating the original local data.
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

  async function executeImport(plan, conflictResolutions) {
    // conflictResolutions: { [projectId]: "keep-local" | "keep-remote" | "keep-both" }
    conflictResolutions = conflictResolutions || {};

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
      await ProjectStorage.save(entry.remote.data);
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
      var merged = mergeTrackingProgress(freshLocal || mEntry.local, mEntry.remote.data);

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
        console.warn("SyncEngine: stash merge failed:", e);
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

  // Check the sync folder for files from other devices that are newer than our last import
  async function checkForUpdates(dirHandleArg) {
    var files = await scanFolder(dirHandleArg);
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

  // Debounced auto-export: writes to the sync folder after a save, at most once per 30s
  var _autoExportTimer = null;
  var AUTO_EXPORT_DELAY = 30000; // 30 seconds

  function triggerAutoExport() {
    if (!isAutoSyncEnabled()) return;
    Promise.resolve(_watchDirHandle || getWatchDirectory()).then(function (dirHandle) {
      if (!dirHandle) return;
      _watchDirHandle = dirHandle;
      if (_autoExportTimer) clearTimeout(_autoExportTimer);
      _autoExportTimer = setTimeout(function () {
        var watchDirHandle = _watchDirHandle;
        _autoExportTimer = null;
        if (!watchDirHandle) return;
        // Pre-check permission without user gesture — skip if not granted
        watchDirHandle.queryPermission({ mode: "readwrite" }).then(function (perm) {
          if (perm !== "granted") {
            console.warn("SyncEngine: auto-export skipped — permission not granted (re-open sync panel to re-authorise)");
            return;
          }
          return exportToFolder();
        }).catch(function (e) {
          console.warn("SyncEngine: auto-export failed:", e);
        });
      }, AUTO_EXPORT_DELAY);
    }).catch(function (e) {
      console.warn("SyncEngine: auto-export failed:", e);
    });
  }

  // ── Sync status helpers ──────────────────────────────────────────────────

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
      autoSync: isAutoSyncEnabled()
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
    getSyncStatus: getSyncStatus,

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

    // Constants (for testing)
    SYNC_FORMAT: SYNC_FORMAT,
    SYNC_VERSION: SYNC_VERSION
  };
})();

if (typeof window !== "undefined") window.SyncEngine = SyncEngine;
if (typeof module !== "undefined" && module.exports) module.exports = SyncEngine;
