// sync-engine.js
// File-based sync engine for cross-device synchronisation.
// Exports and imports compressed .csync files that can be transferred via
// any cloud drive (OneDrive, Google Drive, Dropbox) or manual file sharing.

const SyncEngine = (() => {
  const SYNC_FORMAT = "cross-stitch-sync";
  const SYNC_VERSION = 1;

  // localStorage keys for sync state
  const LS_LAST_EXPORT = "cs_sync_lastExportAt";
  const LS_LAST_IMPORT = "cs_sync_lastImportAt";
  const LS_DEVICE_ID   = "cs_sync_deviceId";
  const LS_DEVICE_NAME = "cs_sync_deviceName";

  // localStorage keys to include in sync (same safe set as backup-restore)
  const SYNC_LS_KEYS = [
    (typeof LOCAL_STORAGE_KEYS !== 'undefined') ? LOCAL_STORAGE_KEYS.activeProject : "crossstitch_active_project",
    "crossstitch_custom_palettes"
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

  // ── Fingerprinting ───────────────────────────────────────────────────────
  // Uses pako's crc32 (already loaded) for a fast structural fingerprint of a
  // project's pattern data. This detects whether the chart grid itself changed
  // (colours re-arranged, cells edited) vs. only tracking progress changing.

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
      const raw = w + "x" + h + ":" + parts.join(",");

      // pako.deflate internally uses CRC32 but we can also compute it directly
      // via the undocumented pako.crc32 — fall back to a simple hash if missing
      if (typeof pako !== "undefined" && typeof pako.deflate === "function") {
        // Use deflated length + crc as fingerprint (fast, collision-resistant enough)
        var bytes;
        if (typeof TextEncoder !== "undefined") {
          bytes = new TextEncoder().encode(raw);
        } else {
          bytes = [];
          for (var ci = 0; ci < raw.length; ci++) bytes.push(raw.charCodeAt(ci) & 0xff);
          bytes = new Uint8Array(bytes);
        }
        var deflated = pako.deflate(bytes);
        // Use first 8 bytes of deflated output as fingerprint (includes checksum)
        var hex = "";
        for (var di = 0; di < Math.min(8, deflated.length); di++) {
          hex += ("0" + deflated[di].toString(16)).slice(-2);
        }
        return "fp_" + w + "x" + h + "_" + hex + "_" + deflated.length;
      }
      // Fallback: simple string hash
      return "fp_" + w + "x" + h + "_" + simpleHash(raw);
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
    var includeStash = opts.includeStash !== false;
    var includePrefs = opts.includePrefs === true;

    // Flush any in-flight React state before reading
    if (window.__flushProjectToIDB) {
      try { await window.__flushProjectToIDB(); } catch (e) {}
    }

    // Read all projects
    var allProjects = [];
    try {
      var metaList = await ProjectStorage.listProjects();
      for (var i = 0; i < metaList.length; i++) {
        var full = await ProjectStorage.get(metaList[i].id);
        if (full) allProjects.push(full);
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

    // Include preferences (optional)
    if (includePrefs) {
      syncObj.prefs = {};
      SYNC_LS_KEYS.forEach(function (key) {
        try {
          var val = localStorage.getItem(key);
          if (val !== null) syncObj.prefs[key] = val;
        } catch (e) {}
      });
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

  // ── Classification (used by merge engine in session 2) ───────────────────

  function classifyProjects(remoteProjects, localProjectsMap) {
    var results = [];
    for (var i = 0; i < remoteProjects.length; i++) {
      var remote = remoteProjects[i];
      var local = localProjectsMap[remote.id] || null;
      var entry = {
        id: remote.id,
        remote: remote,
        local: local,
        classification: "new-remote"
      };

      if (!local) {
        entry.classification = "new-remote";
      } else {
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
    merged.halfDone = local.halfDone ? JSON.parse(JSON.stringify(local.halfDone)) : {};
    merged.threadOwned = local.threadOwned ? JSON.parse(JSON.stringify(local.threadOwned)) : {};
    merged.parkMarkers = local.parkMarkers ? JSON.parse(JSON.stringify(local.parkMarkers)) : [];
    merged.achievedMilestones = local.achievedMilestones ? JSON.parse(JSON.stringify(local.achievedMilestones)) : [];

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

    // Take max total time
    merged.totalTime = Math.max(local.totalTime || 0, remote.totalTime || 0);

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
      for (var i = 0; i < metaList.length; i++) {
        var full = await ProjectStorage.get(metaList[i].id);
        if (full) localMap[full.id] = full;
      }
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
      localOnly: [],  // projects only on this device (not in sync file)
      stashMerge: null,
      syncObj: syncObj,
      localMap: localMap,
      localStash: localStash
    };

    // Find local-only projects
    var remoteIds = {};
    syncObj.projects.forEach(function (p) { remoteIds[p.id] = true; });
    Object.keys(localMap).forEach(function (id) {
      if (!remoteIds[id]) {
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

    // 1. Import new-remote projects
    for (var i = 0; i < plan.newRemote.length; i++) {
      var entry = plan.newRemote[i];
      await ProjectStorage.save(entry.remote.data);
    }

    // 2. Merge tracking progress (re-read local from IDB to avoid stale data)
    for (var j = 0; j < plan.mergeTracking.length; j++) {
      var mEntry = plan.mergeTracking[j];
      var freshLocal = await ProjectStorage.get(mEntry.id || mEntry.local.id);
      var merged = mergeTrackingProgress(freshLocal || mEntry.local, mEntry.remote.data);
      await ProjectStorage.save(merged);
    }

    // 3. Resolve conflicts
    for (var k = 0; k < plan.conflicts.length; k++) {
      var cEntry = plan.conflicts[k];
      var resolution = conflictResolutions[cEntry.id] || "keep-local";
      if (resolution === "keep-remote") {
        await ProjectStorage.save(cEntry.remote.data);
      } else if (resolution === "keep-both") {
        // Keep local as-is; import remote as a new project via normal save logic
        var remoteCopy = JSON.parse(JSON.stringify(cEntry.remote.data));
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

    // 5. Record import timestamp and mark synced projects
    var importTs = new Date().toISOString();
    try { localStorage.setItem(LS_LAST_IMPORT, importTs); } catch (e) {}
    // Mark all affected project IDs as synced
    var syncedIds = [];
    plan.newRemote.forEach(function (e) { if (e.remote && e.remote.data && e.remote.data.id) syncedIds.push(e.remote.data.id); });
    plan.mergeTracking.forEach(function (e) { if (e.id) syncedIds.push(e.id); });
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
      // Skip our own file
      if (f.deviceId === myDeviceId) continue;
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
