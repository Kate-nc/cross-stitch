/* creator/useProjectIO.js — Save, load, autosave, handleFile, handleOpenInTracker.
   Also manages the paste handler, stash sync, and initial-load effects.
   Expects state (from useCreatorState) and history (from useEditHistory),
   plus options = { onSwitchToTrack }. */

window.useProjectIO = function useProjectIO(state, history, options) {
  var onSwitchToTrack = options && options.onSwitchToTrack;
  var creatorSnapshotRef = React.useRef(null);

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
    if (!state.projectIdRef.current) state.projectIdRef.current = "proj_" + Date.now();
    if (!state.createdAtRef.current) state.createdAtRef.current = new Date().toISOString();
    var psArr = [];
    partialStitches.forEach(function(v, k) {
      var e = {}; ["TL","TR","BL","BR"].forEach(function(q) { if (v[q]) e[q] = { id: v[q].id, rgb: v[q].rgb }; });
      psArr.push([k, e]);
    });
    var project = {
      version: 10, id: state.projectIdRef.current, page: "creator", name: finalName,
      createdAt: state.createdAtRef.current, updatedAt: new Date().toISOString(),
      settings: { sW: sW, sH: sH, maxC: maxC, bri: bri, con: con, sat: sat, dith: dith, skipBg: skipBg, bgTh: bgTh, bgCol: bgCol, minSt: minSt, arLock: arLock, ar: ar, fabricCt: fabricCt, skeinPrice: skeinPrice, stitchSpeed: stitchSpeed, smooth: smooth, smoothType: smoothType, orphans: orphans, isScratchMode: isScratchMode, allowBlends: allowBlends, stitchCleanup: stitchCleanup, stashConstrained: !!stashConstrained },
      pattern: pat.map(function(m) { return m.id === "__skip__" ? { id: "__skip__" } : { id: m.id, type: m.type, rgb: m.rgb }; }),
      bsLines: bsLines, done: done ? Array.from(done) : null,
      parkMarkers: parkMarkers, totalTime: totalTime, sessions: sessions,
      hlRow: hlRow, hlCol: hlCol, threadOwned: threadOwned,
      imgData: img ? img.src : null, partialStitches: psArr,
      savedZoom: zoom,
      savedScroll: scrollRef.current ? { left: scrollRef.current.scrollLeft, top: scrollRef.current.scrollTop } : null,
    };
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
    if (!state.projectName) { state.setNamePromptOpen(true); return; }
    doSaveProject(state.projectName);
  }

  // ─── handleOpenInTracker ─────────────────────────────────────────────────────
  function handleOpenInTracker() {
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
    if (!projectIdRef.current) projectIdRef.current = "proj_" + Date.now();
    var psArr = [];
    partialStitches.forEach(function(v, k) {
      var e = {}; ["TL","TR","BL","BR"].forEach(function(q) { if (v[q]) e[q] = { id: v[q].id, rgb: v[q].rgb }; });
      psArr.push([k, e]);
    });
    var project = {
      version: 10, id: projectIdRef.current, page: "creator", name: projectName,
      settings: { sW: sW, sH: sH, maxC: maxC, bri: bri, con: con, sat: sat, dith: dith, skipBg: skipBg, bgTh: bgTh, bgCol: bgCol, minSt: minSt, arLock: arLock, ar: ar, fabricCt: fabricCt, skeinPrice: skeinPrice, stitchSpeed: stitchSpeed, smooth: smooth, smoothType: smoothType, orphans: orphans, allowBlends: allowBlends, stitchCleanup: stitchCleanup, stashConstrained: !!stashConstrained },
      pattern: pat.map(function(m) { return m.id === "__skip__" ? { id: "__skip__" } : { id: m.id, type: m.type, rgb: m.rgb }; }),
      bsLines: bsLines, done: done ? Array.from(done) : null,
      parkMarkers: parkMarkers, totalTime: totalTime, sessions: sessions,
      hlRow: hlRow, hlCol: hlCol, threadOwned: threadOwned,
      imgData: img ? img.src : null, partialStitches: psArr,
    };
    if (onSwitchToTrack) {
      saveProjectToDB(project).catch(function() {});
      ProjectStorage.save(project).then(function(id) { ProjectStorage.setActiveProject(id); }).catch(function() {});
      onSwitchToTrack({ project: project, key: Date.now() });
      return;
    }
    ProjectStorage.setActiveProject(projectIdRef.current);
    try {
      localStorage.setItem("crossstitch_handoff", JSON.stringify(project));
      window.location.href = "stitch.html?source=creator";
    } catch (e) {
      try {
        var str = JSON.stringify(project);
        var compressed = pako.deflate(str);
        var binaryStr = "";
        for (var i = 0; i < compressed.length; i++) binaryStr += String.fromCharCode(compressed[i]);
        var b64 = btoa(binaryStr).replace(/\+/g, "-").replace(/\//g, "_");
        if (b64.length > 8000) { alert("Pattern too large for link sharing. Please use Save Project (.json) instead."); return; }
        window.location.href = "stitch.html#p=" + b64;
      } catch (e2) {
        alert("Pattern is too large for direct transfer. Please save the file and open it in the Tracker.");
      }
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
    state.projectIdRef.current = project.id || null;
    state.createdAtRef.current = project.createdAt || null;

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
        if (!project.pattern || !project.settings) throw new Error("Invalid");
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
    state.setIsUploading(true);
    var rd = new FileReader();
    rd.onload = function(ev) {
      var i = new Image();
      var proceed = function() {
        var targetW = i.width, targetH = i.height;
        var MAX_AREA = 2000 * 2000;
        if (targetW * targetH > MAX_AREA || (f.size && f.size > 5 * 1024 * 1024)) {
          var scale = Math.sqrt(MAX_AREA / (targetW * targetH));
          if (scale < 1) { targetW = Math.round(targetW * scale); targetH = Math.round(targetH * scale); }
          var c = document.createElement("canvas"); c.width = targetW; c.height = targetH;
          var cx = c.getContext("2d"); cx.drawImage(i, 0, 0, targetW, targetH);
          var scaledImg = new Image();
          scaledImg.onload = function() {
            state.userActedRef.current = true;
            state.setOrigW(targetW); state.setOrigH(targetH);
            var a = targetW / targetH; state.setAr(a);
            state.setSW(80); state.setSH(Math.round(80 / a));
            state.setImg(scaledImg); state.resetAll(); state.setIsUploading(false);
          };
          scaledImg.src = c.toDataURL("image/jpeg", 0.85);
          return;
        }
        state.userActedRef.current = true;
        state.setOrigW(i.width); state.setOrigH(i.height);
        var a2 = i.width / i.height; state.setAr(a2);
        state.setSW(80); state.setSH(Math.round(80 / a2));
        state.setImg(i); state.resetAll(); state.setIsUploading(false);
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
          if (!project2.pattern || !project2.settings) throw new Error("Invalid");
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
      }
    });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Stash sync on mount
  React.useEffect(function() {
    if (typeof StashBridge !== "undefined") {
      StashBridge.getGlobalStash().then(state.setGlobalStash).catch(function() {});
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

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
    if (!state.projectIdRef.current) state.projectIdRef.current = "proj_" + Date.now();
    if (!state.createdAtRef.current) state.createdAtRef.current = new Date().toISOString();
    var project5 = {
      version: 10, id: state.projectIdRef.current, page: "creator", name: state.projectName,
      createdAt: state.createdAtRef.current, updatedAt: new Date().toISOString(),
      settings: { sW: state.sW, sH: state.sH, maxC: state.maxC, bri: state.bri, con: state.con, sat: state.sat, dith: state.dith, skipBg: state.skipBg, bgTh: state.bgTh, bgCol: state.bgCol, minSt: state.minSt, arLock: state.arLock, ar: state.ar, fabricCt: state.fabricCt, skeinPrice: state.skeinPrice, stitchSpeed: state.stitchSpeed, smooth: state.smooth, smoothType: state.smoothType, orphans: state.orphans, isScratchMode: state.isScratchMode, allowBlends: state.allowBlends, stitchCleanup: state.stitchCleanup },
      pattern: pat.map(function(m) { return m.id === "__skip__" ? { id: "__skip__" } : { id: m.id, type: m.type, rgb: m.rgb }; }),
      bsLines: state.bsLines, done: state.done ? Array.from(state.done) : null,
      parkMarkers: state.parkMarkers, totalTime: state.totalTime, sessions: state.sessions,
      hlRow: state.hlRow, hlCol: state.hlCol, threadOwned: state.threadOwned,
      imgData: state.img ? state.img.src : null, partialStitches: psArr,
      savedZoom: state.zoom,
      savedScroll: state.scrollRef.current ? { left: state.scrollRef.current.scrollLeft, top: state.scrollRef.current.scrollTop } : null,
    };
    // Update the snapshot ref synchronously — flush will always have the latest state
    creatorSnapshotRef.current = project5;
    var saveTimer = setTimeout(function() {
      saveProjectToDB(project5).catch(function(err) { console.error("Auto-save failed:", err); });
      ProjectStorage.save(project5)
        .then(function(id) { ProjectStorage.setActiveProject(id); })
        .catch(function(err) { console.error("ProjectStorage auto-save failed:", err); });
      if (typeof StashBridge !== "undefined") {
        StashBridge.syncProjectToLibrary(
          state.projectIdRef.current,
          state.projectName || (state.sW + "\xD7" + state.sH + " pattern"),
          state.skeinData,
          "inprogress"
        );
      }
    }, 1000);
    return function() { clearTimeout(saveTimer); };
  }, [
    state.pat, state.pal, state.sW, state.sH, state.maxC,
    state.bri, state.con, state.sat, state.dith, state.skipBg, state.bgTh, state.bgCol,
    state.minSt, state.arLock, state.ar, state.fabricCt, state.skeinPrice, state.stitchSpeed,
    state.smooth, state.smoothType, state.orphans, state.bsLines, state.done,
    state.parkMarkers, state.totalTime, state.sessions, state.hlRow, state.hlCol,
    state.threadOwned, state.img, state.partialStitches, state.projectName, state.allowBlends,
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
    return function() { delete window.__flushProjectToIDB; };
  }, []);

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
  };
};
