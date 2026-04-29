/* creator/useProjectIO.js — Save, load, autosave, handleFile, handleOpenInTracker.
   Also manages the paste handler, stash sync, and initial-load effects.
   Expects state (from useCreatorState) and history (from useEditHistory),
   plus options = { onSwitchToTrack }. */

window.useProjectIO = function useProjectIO(state, history, options) {
  var onSwitchToTrack = options && options.onSwitchToTrack;
  var creatorSnapshotRef = React.useRef(null);
  // Tracks whether we have already performed an initial (no-debounce) save for the
  // current pattern. Reset whenever pat/projectId changes so a freshly generated
  // pattern is persisted to IndexedDB and the Stash Manager library immediately,
  // not after the 1 s debounce. This avoids the "I created a pattern but it's not
  // in my stash" bug when the user navigates away within the debounce window.
  var firstSaveDoneRef = React.useRef(null);
  // Proposal 2 auto-save controller. Lazily created on first effect run
  // because we need access to the state setters (saveStatus / savedAt /
  // saveError / namePromptOpen) that are part of the merged state object.
  var saveControllerRef = React.useRef(null);
  // Mirrors the latest values needed by the beforeunload stash-sync handler.
  // The handler effect deps only on isActive (we don't want to re-bind on every
  // keystroke), so reading from this ref guarantees the unload sync uses
  // current skeinData / projectName / fabricCt instead of the snapshot taken
  // at mount time. Updated synchronously on every render below.
  var stashSyncRef = React.useRef(null);
  stashSyncRef.current = {
    projectId: state.projectIdRef && state.projectIdRef.current,
    projectName: state.projectName,
    skeinData: state.skeinData,
    fabricCt: state.fabricCt,
    sW: state.sW,
    sH: state.sH
  };

  // ─── doSaveProject ───────────────────────────────────────────────────────────
  function doSaveProject(finalName) {
    var pat = state.pat, pal = state.pal, cmap = state.cmap;
    var sW = state.sW, sH = state.sH, maxC = state.maxC;
    var bri = state.bri, con = state.con, sat = state.sat;
    var dith = state.dith, skipBg = state.skipBg, bgTh = state.bgTh, bgCol = state.bgCol;
    var minSt = state.minSt, arLock = state.arLock, ar = state.ar;
    var fabricCt = state.fabricCt, skeinPrice = state.skeinPrice, stitchSpeed = state.stitchSpeed;
    var smooth = state.smooth, smoothType = state.smoothType, orphans = state.orphans;
    var isScratchMode = state.isScratchMode, allowBlends = state.allowBlends;
    var stitchCleanup = state.stitchCleanup;
    var stashConstrained = state.stashConstrained;
    var bsLines = state.bsLines, done = state.done;
    var parkMarkers = state.parkMarkers, totalTime = state.totalTime, sessions = state.sessions;
    var hlRow = state.hlRow, hlCol = state.hlCol, threadOwned = state.threadOwned;
    var img = state.img, partialStitches = state.partialStitches;
    var zoom = state.zoom, scrollRef = state.scrollRef;

    if (!pat || !pal) return;
    if (!state.projectIdRef.current) state.projectIdRef.current = ProjectStorage.newId();
    if (!state.createdAtRef.current) state.createdAtRef.current = new Date().toISOString();
    var psArr = [];
    partialStitches.forEach(function(v, k) {
      var e = {}; ["TL","TR","BL","BR"].forEach(function(q) { if (v[q]) e[q] = { id: v[q].id, rgb: v[q].rgb }; });
      psArr.push([k, e]);
    });
    var project = Object.assign({}, state.trackerFieldsRef.current, {
      version: 11, id: state.projectIdRef.current, page: "creator", name: finalName,
      designer: state.projectDesigner || "", description: state.projectDescription || "",
      createdAt: state.createdAtRef.current, updatedAt: new Date().toISOString(),
      settings: { sW: sW, sH: sH, maxC: maxC, bri: bri, con: con, sat: sat, dith: dith, skipBg: skipBg, bgTh: bgTh, bgCol: bgCol, minSt: minSt, arLock: arLock, ar: ar, fabricCt: fabricCt, skeinPrice: skeinPrice, stitchSpeed: stitchSpeed, smooth: smooth, smoothType: smoothType, orphans: orphans, isScratchMode: isScratchMode, allowBlends: allowBlends, stitchCleanup: stitchCleanup, stashConstrained: !!stashConstrained },
      // PERF (deferred-1): serializePattern strips redundant rgb for cells whose colour
      // can be reconstructed from the DMC catalogue at load time. See
      // reports/deferred-1-rgb-stripping-analysis.md. Toggleable via
      // window.PERF_FLAGS.stripRgbOnSave.
      pattern: (window.PatternIO ? window.PatternIO.serializePattern(pat) : pat.map(function(m) { return m.id === "__skip__" ? { id: "__skip__" } : { id: m.id, type: m.type, rgb: m.rgb }; })),
      bsLines: bsLines, done: done ? Array.from(done) : null,
      parkMarkers: parkMarkers, totalTime: totalTime, sessions: sessions,
      hlRow: hlRow, hlCol: hlCol, threadOwned: threadOwned,
      imgData: img ? img.src : null, partialStitches: psArr,
      savedZoom: zoom,
      savedScroll: scrollRef.current ? { left: scrollRef.current.scrollLeft, top: scrollRef.current.scrollTop } : null,
    });
    var blob = new Blob([JSON.stringify(project)], { type: "application/json" });
    var url = URL.createObjectURL(blob);
    var a = document.createElement("a");
    a.href = url;
    var safeName = (finalName || "cross-stitch-project").replace(/[^a-zA-Z0-9_\- ]/g, "").trim() || "cross-stitch-project";
    a.download = safeName + ".json";
    document.body.appendChild(a); a.click(); document.body.removeChild(a); URL.revokeObjectURL(url);
    if (state.addToast) state.addToast("Project saved as \"" + safeName + ".json\"", {type:"success", duration:2500});
  }

  // ─── saveProject ─────────────────────────────────────────────────────────────
  function saveProject() {
    if (!state.pat || !state.pal) return;
    if (!state.projectName) {
      if (state.setNameModalReason) state.setNameModalReason("download");
      state.setNamePromptOpen(true);
      return;
    }
    doSaveProject(state.projectName);
  }

  // ─── handleOpenInTracker ─────────────────────────────────────────────────────
  // Async because the standalone-navigation branch must wait for IndexedDB to
  // commit before changing window.location — otherwise the Tracker could load
  // before the new project row exists, leaving the active-project pointer
  // dangling.
  async function handleOpenInTracker() {
    var pat = state.pat, pal = state.pal;
    var sW = state.sW, sH = state.sH, maxC = state.maxC;
    var bri = state.bri, con = state.con, sat = state.sat;
    var dith = state.dith, skipBg = state.skipBg, bgTh = state.bgTh, bgCol = state.bgCol;
    var minSt = state.minSt, arLock = state.arLock, ar = state.ar;
    var fabricCt = state.fabricCt, skeinPrice = state.skeinPrice, stitchSpeed = state.stitchSpeed;
    var smooth = state.smooth, smoothType = state.smoothType, orphans = state.orphans;
    var allowBlends = state.allowBlends, stitchCleanup = state.stitchCleanup;
    var stashConstrained = state.stashConstrained;
    var bsLines = state.bsLines, done = state.done;
    var parkMarkers = state.parkMarkers, totalTime = state.totalTime, sessions = state.sessions;
    var hlRow = state.hlRow, hlCol = state.hlCol, threadOwned = state.threadOwned;
    var img = state.img, partialStitches = state.partialStitches;
    var projectIdRef = state.projectIdRef, projectName = state.projectName;

    if (!pat || !pal) return;
    if (!projectIdRef.current) projectIdRef.current = ProjectStorage.newId();
    var psArr = [];
    partialStitches.forEach(function(v, k) {
      var e = {}; ["TL","TR","BL","BR"].forEach(function(q) { if (v[q]) e[q] = { id: v[q].id, rgb: v[q].rgb }; });
      psArr.push([k, e]);
    });
    var project = Object.assign({}, state.trackerFieldsRef.current, {
      version: 11, id: projectIdRef.current, page: "creator", name: projectName,
      designer: state.projectDesigner || "", description: state.projectDescription || "",
      settings: { sW: sW, sH: sH, maxC: maxC, bri: bri, con: con, sat: sat, dith: dith, skipBg: skipBg, bgTh: bgTh, bgCol: bgCol, minSt: minSt, arLock: arLock, ar: ar, fabricCt: fabricCt, skeinPrice: skeinPrice, stitchSpeed: stitchSpeed, smooth: smooth, smoothType: smoothType, orphans: orphans, allowBlends: allowBlends, stitchCleanup: stitchCleanup, stashConstrained: !!stashConstrained },
      // PERF (deferred-1): see helpers.js / serializePattern.
      pattern: (window.PatternIO ? window.PatternIO.serializePattern(pat) : pat.map(function(m) { return m.id === "__skip__" ? { id: "__skip__" } : { id: m.id, type: m.type, rgb: m.rgb }; })),
      bsLines: bsLines, done: done ? Array.from(done) : null,
      parkMarkers: parkMarkers, totalTime: totalTime, sessions: sessions,
      hlRow: hlRow, hlCol: hlCol, threadOwned: threadOwned,
      imgData: img ? img.src : null, partialStitches: psArr,
    });
    if (onSwitchToTrack) {
      saveProjectToDB(project).catch(function() {});
      ProjectStorage.save(project).then(function(id) { ProjectStorage.setActiveProject(id); }).catch(function() {});
      // Belt-and-braces stash sync: the debounced auto-save may not have fired yet
      // (e.g. if the user generated and immediately clicked "Open in Tracker"). Without
      // this the pattern would not appear in the Stash Manager library until the
      // Tracker's own auto-save runs.
      if (typeof StashBridge !== "undefined" && state.skeinData && state.skeinData.length) {
        try {
          StashBridge.syncProjectToLibrary(
            projectIdRef.current,
            projectName || (state.sW + "\xD7" + state.sH + " pattern"),
            state.skeinData,
            "inprogress",
            state.fabricCt
          );
        } catch (_) {}
      }
      if (state.addToast) state.addToast("Opening in Stitch Tracker\u2026", {type:"info", duration:2000});
      onSwitchToTrack({ project: project, key: Date.now() });
      return;
    }
    ProjectStorage.setActiveProject(projectIdRef.current);
    // Always persist to IndexedDB before navigating away. The Tracker can
    // recover the project via the active-project pointer even when the inline
    // handoff payload (localStorage / URL hash) is unavailable — but only if
    // these writes have actually committed. AWAIT both before continuing,
    // otherwise window.location.href can fire mid-transaction.
    try { await ProjectStorage.save(project); } catch (_) {}
    try { await saveProjectToDB(project); } catch (_) {}
    // Preferred path: write the project to localStorage and let the Tracker pick
    // it up via `crossstitch_handoff`. This works for any pattern size that fits
    // in the localStorage quota (typically 5–10 MB), which is well above what
    // the URL-hash fallback could ever carry. The hash fallback is kept only for
    // browsers/sessions where localStorage write fails (private mode, full quota).
    var savedHandoff = false;
    try {
      localStorage.setItem("crossstitch_handoff", JSON.stringify(project));
      savedHandoff = true;
    } catch (e) {
      // localStorage write failed (quota or disabled). Try the URL-hash fallback.
      try {
        var str = JSON.stringify(project);
        var compressed = pako.deflate(str);
        var binaryStr = "";
        for (var i = 0; i < compressed.length; i++) binaryStr += String.fromCharCode(compressed[i]);
        var b64 = btoa(binaryStr).replace(/\+/g, "-").replace(/\//g, "_");
        if (b64.length <= 8000) {
          window.location.href = "stitch.html#p=" + b64;
          return;
        }
        // Pattern too large for the URL hash too. Fall back to a soft toast and
        // navigate without the inline payload — the Tracker will load whatever
        // copy is in IndexedDB (we already saved/auto-saved above) using the
        // active-project pointer. No more loud `alert()`.
        if (state.addToast) {
          state.addToast(
            "Pattern too large for inline transfer \u2014 opening from your saved copy.",
            { type: "info", duration: 3500 }
          );
        }
      } catch (_) {
        if (state.addToast) {
          state.addToast(
            "Couldn't prepare the inline transfer \u2014 opening from your saved copy.",
            { type: "warning", duration: 3500 }
          );
        }
      }
    }
    if (savedHandoff) {
      window.location.href = "stitch.html?source=creator";
    } else {
      // No inline payload available. The Tracker will load via the active project
      // pointer set above (and via the auto-saved IDB copy from this session).
      window.location.href = "stitch.html?source=creator";
    }
  }

  // ─── processLoadedProject ────────────────────────────────────────────────────
  function processLoadedProject(project) {
    var s = project.settings;
    state.setSW(s.sW); state.setSH(s.sH); state.setMaxC(s.maxC);
    state.setBri(s.bri || 0); state.setCon(s.con || 0); state.setSat(s.sat || 0);
    state.setDith(!!s.dith); state.setSkipBg(!!s.skipBg); state.setBgTh(s.bgTh || 15);
    state.setBgCol(s.bgCol || [255, 255, 255]); state.setMinSt(s.minSt || 0);
    state.setArLock(s.arLock !== false); state.setAr(s.ar || 1);
    state.setBsLines(project.bsLines || []);
    state.setSmooth(s.smooth || 0); state.setSmoothType(s.smoothType || "median");
    state.setOrphans(s.orphans || 0); state.setAllowBlends(s.allowBlends !== false);
    state.setStashConstrained(!!s.stashConstrained);
    if (s.stitchCleanup) {
      state.setStitchCleanup({
        enabled: !!s.stitchCleanup.enabled,
        strength: s.stitchCleanup.strength || "balanced",
        protectDetails: s.stitchCleanup.protectDetails !== false,
        smoothDithering: s.stitchCleanup.smoothDithering !== false,
      });
    }
    if (s.fabricCt) state.setFabricCt(s.fabricCt);
    if (s.skeinPrice != null) state.setSkeinPrice(s.skeinPrice);
    if (s.stitchSpeed) state.setStitchSpeed(s.stitchSpeed);

    var restored = project.pattern.map(restoreStitch);
    var result = buildPalette(restored);
    state.setPat(restored); state.setPal(result.pal); state.setCmap(result.cmap);
    state.setTab("pattern"); state.setActiveTool(null); state.setSelectedColorId(null);
    state.setEditHistory([]); state.setRedoHistory([]); state.setSidebarOpen(true);
    state.setThreadOwned(project.threadOwned || {});

    if (project.done && project.done.length === restored.length) {
      state.setDone(new Uint8Array(project.done));
    } else {
      state.setDone(new Uint8Array(restored.length));
    }
    state.setParkMarkers(project.parkMarkers || []);
    state.setTotalTime(project.totalTime || 0);
    state.setSessions(project.sessions || []);
    if (project.hlRow >= 0) state.setHlRow(project.hlRow);
    if (project.hlCol >= 0) state.setHlCol(project.hlCol);
    state.setIsScratchMode(!!s.isScratchMode);

    if (project.partialStitches && Array.isArray(project.partialStitches)) {
      var pm = new Map();
      project.partialStitches.forEach(function(entry) {
        var idx = entry[0], v = entry[1];
        var pe = {};
        ["TL","TR","BL","BR"].forEach(function(q) {
          if (v[q]) pe[q] = restoreStitch(Object.assign({}, v[q], { type: v[q].type || (typeof v[q].id === "string" && v[q].id.includes("+") ? "blend" : "solid") }));
        });
        pm.set(idx, pe);
      });
      state.setPartialStitches(pm);
    } else if (project.halfStitches && Array.isArray(project.halfStitches)) {
      // Migrate v9 half-stitch format to v10 quadrant format
      var pm2 = new Map();
      project.halfStitches.forEach(function(entry) {
        var idx = entry[0], v = entry[1];
        var migrated = migrateHalfStitch(v);
        var pe = {};
        ["TL","TR","BL","BR"].forEach(function(q) {
          if (migrated[q]) pe[q] = restoreStitch(Object.assign({}, migrated[q], { type: migrated[q].type || (typeof migrated[q].id === "string" && migrated[q].id.includes("+") ? "blend" : "solid") }));
        });
        pm2.set(idx, pe);
      });
      state.setPartialStitches(pm2);
    } else {
      state.setPartialStitches(new Map());
    }
    state.setPartialStitchTool(null);
    state.setProjectName(project.name || "");
    state.setProjectDesigner(project.designer || "");
    state.setProjectDescription(project.description || "");
    // Clear pending-metadata localStorage so a stale pre-gen name can't bleed back in
    try { localStorage.removeItem("cs_pend_meta"); } catch (_) {}
    state.projectIdRef.current = project.id || null;
    state.createdAtRef.current = project.createdAt || null;

    // Preserve Tracker-only fields so Creator auto-saves don't strip them from IDB
    state.trackerFieldsRef.current = {};
    var _tf = state.trackerFieldsRef.current;
    if (project.statsSessions)       _tf.statsSessions       = project.statsSessions;
    if (project.statsSettings)       _tf.statsSettings        = project.statsSettings;
    if (project.achievedMilestones)  _tf.achievedMilestones   = project.achievedMilestones;
    if (project.doneSnapshots)       _tf.doneSnapshots        = project.doneSnapshots;
    if (project.breadcrumbs)         _tf.breadcrumbs          = project.breadcrumbs;
    if (project.stitchingStyle)      _tf.stitchingStyle       = project.stitchingStyle;
    if (project.blockW)              _tf.blockW               = project.blockW;
    if (project.blockH)              _tf.blockH               = project.blockH;
    if (project.focusBlock)          _tf.focusBlock           = project.focusBlock;
    if (project.startCorner)         _tf.startCorner          = project.startCorner;
    if (project.colourSequence)      _tf.colourSequence       = project.colourSequence;
    if (project.originalPaletteState) _tf.originalPaletteState = project.originalPaletteState;
    if (project.singleStitchEdits && project.singleStitchEdits.length > 0)
      _tf.singleStitchEdits = project.singleStitchEdits;
    if (project.halfStitches && project.halfStitches.length > 0)
      _tf.halfStitches = project.halfStitches;
    if (project.halfDone && project.halfDone.length > 0)
      _tf.halfDone = project.halfDone;
    // Preserve v3 stats fields (stitchLog, finishStatus, etc.)
    if (project.finishStatus != null) _tf.finishStatus = project.finishStatus;
    if (project.startedAt)            _tf.startedAt = project.startedAt;
    if (project.lastTouchedAt)        _tf.lastTouchedAt = project.lastTouchedAt;
    if (project.completedAt)          _tf.completedAt = project.completedAt;
    if (project.stitchLog)            _tf.stitchLog = project.stitchLog;

    // Loaded projects have a pattern already — default to Edit mode
    state.setAppMode("edit");
    state.setSidebarTab("palette");

    var scrollRef = state.scrollRef;
    if (project.savedZoom != null) {
      setTimeout(function() {
        state.setZoom(project.savedZoom);
        if (project.savedScroll && scrollRef.current) {
          requestAnimationFrame(function() {
            scrollRef.current.scrollLeft = project.savedScroll.left;
            scrollRef.current.scrollTop = project.savedScroll.top;
          });
        }
      }, 100);
    } else {
      setTimeout(function() {
        var z = Math.min(3, Math.max(0.05, 750 / (s.sW * 20)));
        state.setZoom(z);
      }, 100);
    }

    // Restore per-pattern view state from UserPrefs
    var pview = typeof UserPrefs !== "undefined" ? UserPrefs.getPatternState(project.id) : null;
    if (pview) {
      if (pview.activeViewMode && pview.activeViewMode !== "chart") {
        state.setPreviewActive(true);
        state.setPreviewMode(pview.activeViewMode);
      }
      if (pview.splitPaneRightMode) {
        state.setRightPaneMode(pview.splitPaneRightMode);
      }
    }

    if (project.imgData && typeof project.imgData === "string" && project.imgData.startsWith("data:image/")) {
      var li = new Image();
      li.onload = function() {
        if (!state.userActedRef.current) {
          state.setImg(li); state.setOrigW(li.width); state.setOrigH(li.height);
        }
      };
      li.src = project.imgData;
    } else if (s.isScratchMode) {
      state.setImg({ src: null, w: s.sW, h: s.sH });
    }
  }

  // ─── loadProject (file input onChange) ───────────────────────────────────────
  function loadProject(e) {
    var f = e.target.files[0];
    if (!f) return;
    state.setLoadError(null);
    var rd = new FileReader();
    rd.onload = function(ev) {
      try {
        var project = JSON.parse(ev.target.result);
        if (!project.pattern || !Array.isArray(project.pattern)) throw new Error("Invalid pattern file: 'pattern' field missing or not an array");
        if (!project.settings) throw new Error("Invalid");
        processLoadedProject(project);
      } catch (err) {
        console.error(err);
        state.setLoadError("Could not load: " + err.message);
        setTimeout(function() { state.setLoadError(null); }, 4000);
      }
    };
    rd.readAsText(f);
    if (state.loadRef.current) state.loadRef.current.value = "";
  }

  // ─── handleFile ──────────────────────────────────────────────────────────────
  function handleFile(e) {
    var f = e.target ? e.target.files[0] : e;
    if (!f) return;
    if (e.target) e.target.value = "";
    // Uploading an image is inherently a create-mode action — it needs the
    // Image / Dimensions / Palette panels and the Generate button. If the
    // user arrived here in edit mode (e.g. via the header "Edit" tab which
    // routes to create.html?action=open, then they uploaded a new image)
    // they would otherwise be stranded with no way to generate. Force the
    // app into create mode so the correct sidebar tabs render.
    if (typeof state.setAppMode === "function") state.setAppMode("create");
    state.setIsUploading(true);
    var rd = new FileReader();
    rd.onload = function(ev) {
      var i = new Image();
      var proceed = function() {
        try {
          var targetW = i.width, targetH = i.height;
          if (!targetW || !targetH) { state.setIsUploading(false); return; }
          var MAX_AREA = 2000 * 2000;
          if (targetW * targetH > MAX_AREA || (f.size && f.size > 5 * 1024 * 1024)) {
            var scale = Math.sqrt(MAX_AREA / (targetW * targetH));
            if (scale < 1) { targetW = Math.round(targetW * scale); targetH = Math.round(targetH * scale); }
            var c = document.createElement("canvas"); c.width = targetW; c.height = targetH;
            var cx = c.getContext("2d");
            if (!cx) { state.setIsUploading(false); return; }
            cx.drawImage(i, 0, 0, targetW, targetH);
            var scaledImg = new Image();
            scaledImg.onerror = function() { state.setIsUploading(false); };
            scaledImg.onload = function() {
              try {
                state.userActedRef.current = true;
                state.setOrigW(targetW); state.setOrigH(targetH);
                var a = targetW / targetH; state.setAr(a);
                state.setSW(80); state.setSH(Math.round(80 / a));
                state.setImg(scaledImg); state.resetAll(); state.setIsUploading(false);
              } catch(err) { console.error("Image load error:", err); state.setIsUploading(false); }
            };
            scaledImg.src = c.toDataURL("image/jpeg", 0.85);
            return;
          }
          state.userActedRef.current = true;
          state.setOrigW(i.width); state.setOrigH(i.height);
          var a2 = i.width / i.height; state.setAr(a2);
          state.setSW(80); state.setSH(Math.round(80 / a2));
          state.setImg(i); state.resetAll(); state.setIsUploading(false);
        } catch(err) { console.error("Image processing error:", err); state.setIsUploading(false); }
      };
      if (typeof i.decode === "function") {
        i.src = ev.target.result;
        i.decode().then(proceed).catch(function() { i.onload = proceed; });
      } else {
        i.onload = proceed; i.src = ev.target.result;
      }
    };
    rd.onerror = function() { state.setIsUploading(false); };
    rd.readAsDataURL(f);
  }

  // ─── useEffects ──────────────────────────────────────────────────────────────

  // Initial load: pending actions, handoff, active project, or auto-saved session
  React.useEffect(function() {
    if (window.__pendingCreatorAction === "scratch") {
      delete window.__pendingCreatorAction;
      state.startScratch();
      return;
    }
    if (window.__pendingCreatorFile) {
      var file = window.__pendingCreatorFile;
      delete window.__pendingCreatorFile;
      handleFile(file);
      return;
    }
    if (window.__pendingCreatorJsonFile) {
      var jsonFile = window.__pendingCreatorJsonFile;
      delete window.__pendingCreatorJsonFile;
      var rd2 = new FileReader();
      rd2.onload = function(ev2) {
        try {
          var project2 = JSON.parse(ev2.target.result);
          if (!project2.pattern || !Array.isArray(project2.pattern)) throw new Error("Invalid pattern file: 'pattern' field missing or not an array");
          if (!project2.settings) throw new Error("Invalid");
          processLoadedProject(project2);
        } catch (err2) {
          console.error(err2);
          state.setLoadError("Could not load: " + err2.message);
          setTimeout(function() { state.setLoadError(null); }, 4000);
        }
      };
      rd2.readAsText(jsonFile);
      return;
    }
    var handoff = localStorage.getItem("crossstitch_handoff_to_creator");
    if (handoff) {
      try {
        var projectData = JSON.parse(handoff);
        localStorage.removeItem("crossstitch_handoff_to_creator");
        processLoadedProject(projectData);
        if (projectData.done && projectData.done.some(function(v) { return v === 1; })) {
          alert("This pattern has tracking progress. Editing the pattern here will reset your stitching progress. Continue with caution.");
        }
      } catch (e) { console.error("Failed to load handoff to creator:", e); }
      return;
    }
    if (typeof ProjectStorage !== "undefined") {
      var activeId = ProjectStorage.getActiveProjectId();
      if (activeId) {
        ProjectStorage.get(activeId).then(function(project3) {
          if (project3 && project3.pattern && project3.settings && !state.userActedRef.current) {
            processLoadedProject(project3);
          }
        });
        return;
      }
    }
    loadProjectFromDB().then(function(project4) {
      if (project4 && project4.pattern && project4.settings && !state.userActedRef.current) {
        processLoadedProject(project4);
      } else if (!state.userActedRef.current) {
        // No saved project — restore any pending metadata typed before generation
        try {
          var pend = localStorage.getItem("cs_pend_meta");
          if (pend) {
            var pm = JSON.parse(pend);
            if (pm.n) state.setProjectName(pm.n);
            if (pm.d) state.setProjectDesigner(pm.d);
            if (pm.ds) state.setProjectDescription(pm.ds);
          }
        } catch (_) {}
      }
    });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Persist name/designer/description to localStorage so they survive a refresh
  // even before the first pattern is generated (when the full autosave is gated on pat/pal).
  React.useEffect(function() {
    try {
      localStorage.setItem("cs_pend_meta", JSON.stringify({
        n: state.projectName || "",
        d: state.projectDesigner || "",
        ds: state.projectDescription || ""
      }));
    } catch (_) {}
  }, [state.projectName, state.projectDesigner, state.projectDescription]);

  // Stash sync on mount
  React.useEffect(function() {
    if (typeof StashBridge !== "undefined") {
      StashBridge.getGlobalStash().then(state.setGlobalStash).catch(function() {});
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // When Creator becomes active again (e.g. switching back from Tracker), refresh
  // trackerFieldsRef from IndexedDB so we never save stale sessions/stats.
  var wasActiveRef = React.useRef(state.isActive);
  React.useEffect(function() {
    var becameActive = state.isActive && !wasActiveRef.current;
    wasActiveRef.current = state.isActive;
    if (!becameActive) return;
    var pid = state.projectIdRef.current;
    if (!pid || typeof ProjectStorage === "undefined") return;
    ProjectStorage.get(pid).then(function(freshProject) {
      if (!freshProject) return;
      var tf = state.trackerFieldsRef.current || {};
      if (freshProject.statsSessions) tf.statsSessions = freshProject.statsSessions;
      if (freshProject.statsSettings) tf.statsSettings = freshProject.statsSettings;
      if (freshProject.achievedMilestones) tf.achievedMilestones = freshProject.achievedMilestones;
      if (freshProject.doneSnapshots) tf.doneSnapshots = freshProject.doneSnapshots;
      if (freshProject.breadcrumbs) tf.breadcrumbs = freshProject.breadcrumbs;
      if (freshProject.stitchingStyle) tf.stitchingStyle = freshProject.stitchingStyle;
      if (freshProject.blockW) tf.blockW = freshProject.blockW;
      if (freshProject.blockH) tf.blockH = freshProject.blockH;
      if (freshProject.focusBlock) tf.focusBlock = freshProject.focusBlock;
      if (freshProject.startCorner) tf.startCorner = freshProject.startCorner;
      if (freshProject.colourSequence) tf.colourSequence = freshProject.colourSequence;
      if (freshProject.originalPaletteState) tf.originalPaletteState = freshProject.originalPaletteState;
      if (freshProject.singleStitchEdits && freshProject.singleStitchEdits.length > 0)
        tf.singleStitchEdits = freshProject.singleStitchEdits;
      if (freshProject.halfStitches && freshProject.halfStitches.length > 0)
        tf.halfStitches = freshProject.halfStitches;
      if (freshProject.halfDone && freshProject.halfDone.length > 0)
        tf.halfDone = freshProject.halfDone;
      // Refresh v3 stats fields
      if (freshProject.finishStatus != null) tf.finishStatus = freshProject.finishStatus;
      if (freshProject.startedAt)            tf.startedAt = freshProject.startedAt;
      if (freshProject.lastTouchedAt)        tf.lastTouchedAt = freshProject.lastTouchedAt;
      if (freshProject.completedAt)          tf.completedAt = freshProject.completedAt;
      if (freshProject.stitchLog)            tf.stitchLog = freshProject.stitchLog;
      state.trackerFieldsRef.current = tf;
      // Also refresh the name if the Tracker changed it
      if (freshProject.name && freshProject.name !== state.projectName) {
        state.setProjectName(freshProject.name);
      }
      // Refresh done, totalTime, sessions, threadOwned from Tracker changes
      if (freshProject.done && freshProject.done.length > 0) {
        state.setDone(new Uint8Array(freshProject.done));
      }
      if (freshProject.totalTime != null) state.setTotalTime(freshProject.totalTime);
      if (freshProject.sessions) state.setSessions(freshProject.sessions);
      if (freshProject.threadOwned) state.setThreadOwned(freshProject.threadOwned);
      if (freshProject.parkMarkers) state.setParkMarkers(freshProject.parkMarkers);
      if (freshProject.hlRow >= 0) state.setHlRow(freshProject.hlRow);
      if (freshProject.hlCol >= 0) state.setHlCol(freshProject.hlCol);
    }).catch(function() {});
  }, [state.isActive]); // eslint-disable-line react-hooks/exhaustive-deps

  // Auto-save (debounced 1 s)
  // The snapshot is built synchronously so creatorSnapshotRef is always up-to-date
  // for the flush path, even if the debounced DB write hasn't fired yet.
  React.useEffect(function() {
    var pat = state.pat, pal = state.pal;
    if (!pat || !pal) return;
    var psArr = [];
    state.partialStitches.forEach(function(v, k) {
      var e = {}; ["TL","TR","BL","BR"].forEach(function(q) { if (v[q]) e[q] = { id: v[q].id, rgb: v[q].rgb }; });
      psArr.push([k, e]);
    });
    if (!state.projectIdRef.current) state.projectIdRef.current = ProjectStorage.newId();
    if (!state.createdAtRef.current) state.createdAtRef.current = new Date().toISOString();
    // Write the active-project pointer SYNCHRONOUSLY before kicking off the
    // IDB save. localStorage writes are synchronous, so even if the user
    // navigates to /home (or anywhere) the moment we begin saving, the
    // pointer is already in place and /home's getActiveProject() will find
    // the project as soon as the IDB transaction commits (browsers honour
    // pending IDB transactions across navigations even when the originating
    // page's JS callbacks no longer run, which is why we cannot rely on
    // ProjectStorage.save(...).then(setActiveProject) here). See
    // reports/active-project-race.md.
    if (state.isActive && typeof ProjectStorage !== "undefined") {
      try { ProjectStorage.setActiveProject(state.projectIdRef.current); } catch (_) {}
    }
    var project5 = Object.assign({}, state.trackerFieldsRef.current, {
      version: 11, id: state.projectIdRef.current, page: "creator", name: state.projectName,
      designer: state.projectDesigner || "", description: state.projectDescription || "",
      createdAt: state.createdAtRef.current, updatedAt: new Date().toISOString(),
      settings: { sW: state.sW, sH: state.sH, maxC: state.maxC, bri: state.bri, con: state.con, sat: state.sat, dith: state.dith, skipBg: state.skipBg, bgTh: state.bgTh, bgCol: state.bgCol, minSt: state.minSt, arLock: state.arLock, ar: state.ar, fabricCt: state.fabricCt, skeinPrice: state.skeinPrice, stitchSpeed: state.stitchSpeed, smooth: state.smooth, smoothType: state.smoothType, orphans: state.orphans, isScratchMode: state.isScratchMode, allowBlends: state.allowBlends, stitchCleanup: state.stitchCleanup },
      // PERF (deferred-1): see helpers.js / serializePattern.
      pattern: (window.PatternIO ? window.PatternIO.serializePattern(pat) : pat.map(function(m) { return m.id === "__skip__" ? { id: "__skip__" } : { id: m.id, type: m.type, rgb: m.rgb }; })),
      bsLines: state.bsLines, done: state.done ? Array.from(state.done) : null,
      parkMarkers: state.parkMarkers, totalTime: state.totalTime, sessions: state.sessions,
      hlRow: state.hlRow, hlCol: state.hlCol, threadOwned: state.threadOwned,
      imgData: state.img ? state.img.src : null, partialStitches: psArr,
      savedZoom: state.zoom,
      savedScroll: state.scrollRef.current ? { left: state.scrollRef.current.scrollLeft, top: state.scrollRef.current.scrollTop } : null,
    });
    // Update the snapshot ref synchronously — flush will always have the latest state
    creatorSnapshotRef.current = project5;
    // Skip IDB writes when Creator is not the active view — the Tracker's auto-save
    // owns persistence while it is active and has fresher tracker-specific fields.
    if (!state.isActive) return;
    // First save for this project — fire immediately (no debounce) so the pattern
    // appears in the Stash Manager library and IndexedDB the moment generation
    // finishes, even if the user navigates away within 1 s.
    var isFirstSave = firstSaveDoneRef.current !== state.projectIdRef.current;
    function persistAll() {
      // Run both writes in parallel and treat the cycle as failed if either
      // one rejects, so the visible save status reflects reality. The legacy
      // saveProjectToDB key is kept in lockstep with ProjectStorage so older
      // entry points (Tracker recovery, BackupRestore) still find a snapshot.
      var p1 = ProjectStorage.save(project5).then(function (id) {
        ProjectStorage.setActiveProject(id);
        return id;
      });
      var p2 = saveProjectToDB(project5);
      if (typeof StashBridge !== "undefined") {
        try {
          StashBridge.syncProjectToLibrary(
            state.projectIdRef.current,
            state.projectName || (state.sW + "\xD7" + state.sH + " pattern"),
            state.skeinData,
            "inprogress",
            state.fabricCt
          );
        } catch (_) {}
      }
      firstSaveDoneRef.current = state.projectIdRef.current;
      return Promise.all([p1, p2]).then(function (results) { return results[0]; });
    }
    // Lazily build the controller. The callbacks close over the latest
    // state setters because we re-resolve them via `state.*` on each call.
    if (!saveControllerRef.current && typeof window.SaveStatus !== "undefined") {
      saveControllerRef.current = window.SaveStatus.createSaveController({
        onStatus:  function (s)   { if (state.setSaveStatus) state.setSaveStatus(s); },
        onSavedAt: function (d)   { if (state.setSavedAt)    state.setSavedAt(d); },
        onError:   function (err) { if (state.setSaveError)  state.setSaveError(err); },
        onFirstSaveSuccess: function () {
          // Prompt for a name only if the user hasn't given one yet AND only
          // once per project. Non-blocking: the project is already saved
          // under its auto-generated name ("Untitled pattern") at this point.
          if (!state.projectName && state.setNamePromptOpen) {
            if (state.setNameModalReason) state.setNameModalReason("firstSave");
            state.setNamePromptOpen(true);
          }
        }
      }, { debounceMs: 1000, savedHoldMs: 2500 });
    }
    var ctrl = saveControllerRef.current;
    if (!ctrl) {
      // Fallback for tests/older browsers where SaveStatus failed to load:
      // run the save inline so behaviour matches the previous implementation.
      if (isFirstSave) { persistAll(); return; }
      var saveTimer = setTimeout(persistAll, 1000);
      return function() { clearTimeout(saveTimer); };
    }
    if (isFirstSave) {
      // Schedule, then immediately flush so the first save lands without the
      // debounce — same behaviour as before, but routed through the
      // controller so saveStatus transitions stay correct.
      ctrl.schedule(persistAll);
      ctrl.flush();
      return;
    }
    ctrl.schedule(persistAll);
    return function() { /* schedule() resets its own timer on next edit */ };
  }, [
    state.pat, state.pal, state.sW, state.sH, state.maxC,
    state.bri, state.con, state.sat, state.dith, state.skipBg, state.bgTh, state.bgCol,
    state.minSt, state.arLock, state.ar, state.fabricCt, state.skeinPrice, state.stitchSpeed,
    state.smooth, state.smoothType, state.orphans, state.bsLines, state.done,
    state.parkMarkers, state.totalTime, state.sessions, state.hlRow, state.hlCol,
    state.threadOwned, state.img, state.partialStitches, state.projectName, state.allowBlends,
    state.projectDesigner, state.projectDescription,
    state.isActive,
  ]);

  // Per-pattern view state periodic save
  React.useEffect(function() {
    if (!state.pat || !state.projectIdRef.current) return;
    function doSave() {
      if (!state.projectIdRef.current || typeof UserPrefs === "undefined") return;
      UserPrefs.savePatternState(state.projectIdRef.current, {
        zoomLevel: state.zoom,
        scrollLeft: state.scrollRef.current ? state.scrollRef.current.scrollLeft : 0,
        scrollTop: state.scrollRef.current ? state.scrollRef.current.scrollTop : 0,
        activeViewMode: state.previewActive ? state.previewMode : "chart",
        splitPaneRightMode: state.rightPaneMode,
      });
    }
    var timer = setInterval(doSave, 5000);
    return function() { clearInterval(timer); doSave(); };
  }, [state.pat, state.zoom, state.previewActive, state.previewMode, state.rightPaneMode]); // eslint-disable-line react-hooks/exhaustive-deps

  // Expose flush for BackupRestore to call before reading IndexedDB.
  // creatorSnapshotRef is updated synchronously on every state change (above), so
  // this flush always persists the latest snapshot even if the debounce hasn't fired.
  React.useEffect(function() {
    window.__flushProjectToIDB = function() {
      var p = creatorSnapshotRef.current;
      if (p) {
        return ProjectStorage.save(p).then(function() {
          return saveProjectToDB(p);
        }).catch(function() {});
      }
      return Promise.resolve();
    };
    return function() {
      // Replace with a snapshot-based fallback rather than deleting outright.
      // If a backup or sync flush is requested during the mode-switch gap before
      // the Tracker registers its own handler, this ensures IDB is still written.
      var last = creatorSnapshotRef.current;
      window.__flushProjectToIDB = function() {
        if (last) return ProjectStorage.save(last).then(function() { return saveProjectToDB(last); }).catch(function() {});
        return Promise.resolve();
      };
    };
  }, []);

  // Flush pending autosave on page unload so name/metadata edits made within the
  // 1 s debounce window aren't lost.
  React.useEffect(function() {
    function handleBeforeUnload() {
      var p = creatorSnapshotRef.current;
      if (!p || !state.isActive) return;
      // Defensive: re-write the active-project pointer in case it was
      // cleared during the session (e.g. by a quick "New project" hop or
      // a backup restore). localStorage is synchronous so this survives
      // unload even when the IDB save below is interrupted.
      try { if (p.id) ProjectStorage.setActiveProject(p.id); } catch (_) {}
      try { ProjectStorage.save(p); } catch (_) {}
      try { saveProjectToDB(p); } catch (_) {}
      // Belt-and-braces: also sync to the Stash Manager library so a generated
      // pattern is never lost from stash even if unload happens during the debounce.
      // Read from stashSyncRef (updated each render) so we use the latest
      // skeinData / projectName / fabricCt rather than the values captured
      // when this effect first ran.
      var s = stashSyncRef.current;
      if (s && typeof StashBridge !== "undefined" && s.skeinData && s.skeinData.length) {
        try {
          StashBridge.syncProjectToLibrary(
            s.projectId,
            s.projectName || (s.sW + "\xD7" + s.sH + " pattern"),
            s.skeinData,
            "inprogress",
            s.fabricCt
          );
        } catch (_) {}
      }
    }
    window.addEventListener("beforeunload", handleBeforeUnload);
    return function() { window.removeEventListener("beforeunload", handleBeforeUnload); };
  }, [state.isActive]);

  // Paste image handler
  React.useEffect(function() {
    if (!state.isActive) return;
    function handlePaste(e) {
      var activeElem = document.activeElement;
      if (activeElem && (activeElem.tagName === "INPUT" || activeElem.tagName === "TEXTAREA")) return;
      if (!e.clipboardData || !e.clipboardData.items) return;
      for (var i = 0; i < e.clipboardData.items.length; i++) {
        var item = e.clipboardData.items[i];
        if (item.type.indexOf("image") === 0) {
          var blob = item.getAsFile();
          if (blob) { e.preventDefault(); handleFile(blob); break; }
        }
      }
    }
    window.addEventListener("paste", handlePaste);
    return function() { window.removeEventListener("paste", handlePaste); };
  }, [state.isActive]); // eslint-disable-line react-hooks/exhaustive-deps

  return {
    doSaveProject: doSaveProject,
    saveProject: saveProject,
    handleOpenInTracker: handleOpenInTracker,
    processLoadedProject: processLoadedProject,
    loadProject: loadProject,
    handleFile: handleFile,
    // Re-runs the most recent auto-save attempt. Wired to the "Retry"
    // button shown by SaveStatusBadge when saveStatus === 'error'.
    retryAutoSave: function () {
      var ctrl = saveControllerRef.current;
      var snap = creatorSnapshotRef.current;
      if (!ctrl || !snap) return;
      ctrl.schedule(function () {
        var p1 = ProjectStorage.save(snap).then(function (id) {
          ProjectStorage.setActiveProject(id);
          return id;
        });
        var p2 = saveProjectToDB(snap);
        return Promise.all([p1, p2]).then(function (r) { return r[0]; });
      });
      ctrl.flush();
    },
  };
};
