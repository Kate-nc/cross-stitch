/* creator/useCreatorState.js — All useState, useRef, useMemo, and derived
   helper functions for CreatorApp. Returned object becomes the base of
   CreatorContext.
   Depends on globals: React, usePaletteSwap, buildPalette, buildPaletteWithScratch,
   skeinEst, calcDifficulty, DMC, SYMS, FABRIC_COUNTS, A4W, A4H,
   DEFAULT_SKEIN_PRICE, runGenerationPipeline, STRENGTH_MAP. */

window.useCreatorState = function useCreatorState() {
  var useState    = React.useState;
  var useRef      = React.useRef;
  var useMemo     = React.useMemo;
  var useCallback = React.useCallback;
  var useEffect   = React.useEffect;

  // ─── Core image / pattern state ──────────────────────────────────────────────
  var _img    = useState(null);       var img    = _img[0],    setImg    = _img[1];
  var _upload = useState(false);      var isUploading = _upload[0], setIsUploading = _upload[1];
  var _drag   = useState(false);      var isDragging  = _drag[0],   setIsDragging  = _drag[1];
  var _sW     = useState(80);         var sW     = _sW[0],     setSW     = _sW[1];
  var _sH     = useState(80);         var sH     = _sH[0],     setSH     = _sH[1];
  var _arLock = useState(true);       var arLock = _arLock[0], setArLock = _arLock[1];
  var _ar     = useState(1);          var ar     = _ar[0],     setAr     = _ar[1];

  // Generation parameters
  var _maxC   = useState(30);         var maxC   = _maxC[0],   setMaxC   = _maxC[1];
  var _bri    = useState(0);          var bri    = _bri[0],    setBri    = _bri[1];
  var _con    = useState(0);          var con    = _con[0],    setCon    = _con[1];
  var _sat    = useState(0);          var sat    = _sat[0],    setSat    = _sat[1];
  var _dith   = useState(false);      var dith   = _dith[0],   setDith   = _dith[1];
  var _skipBg = useState(false);      var skipBg = _skipBg[0], setSkipBg = _skipBg[1];
  var _bgTh   = useState(15);         var bgTh   = _bgTh[0],   setBgTh   = _bgTh[1];
  var _bgCol  = useState([255,255,255]); var bgCol = _bgCol[0], setBgCol = _bgCol[1];
  var _pickBg = useState(false);      var pickBg = _pickBg[0], setPickBg = _pickBg[1];
  var _minSt  = useState(0);          var minSt  = _minSt[0],  setMinSt  = _minSt[1];
  var _smooth = useState(0);          var smooth = _smooth[0], setSmooth = _smooth[1];
  var _sType  = useState("median");   var smoothType = _sType[0], setSmoothType = _sType[1];
  var _orphans= useState(0);          var orphans = _orphans[0], setOrphans = _orphans[1];
  var _blends = useState(true);       var allowBlends = _blends[0], setAllowBlends = _blends[1];

  // Pattern data
  var _pat  = useState(null);         var pat  = _pat[0],  setPat  = _pat[1];
  var _pal  = useState(null);         var pal  = _pal[0],  setPal  = _pal[1];
  var _cmap = useState(null);         var cmap = _cmap[0], setCmap = _cmap[1];
  var _busy = useState(false);        var busy = _busy[0], setBusy = _busy[1];
  var _oW   = useState(0);            var origW = _oW[0],  setOrigW = _oW[1];
  var _oH   = useState(0);            var origH = _oH[0],  setOrigH = _oH[1];

  // Fabric / floss settings
  var _fabricCt    = useState(14);    var fabricCt = _fabricCt[0], setFabricCt = _fabricCt[1];
  var _skeinPrice  = useState(typeof DEFAULT_SKEIN_PRICE !== "undefined" ? DEFAULT_SKEIN_PRICE : 1.0);
  var skeinPrice = _skeinPrice[0], setSkeinPrice = _skeinPrice[1];
  var _stitchSpeed = useState(40);    var stitchSpeed = _stitchSpeed[0], setStitchSpeed = _stitchSpeed[1];

  // UI state
  var _tab        = useState("pattern"); var tab        = _tab[0],        setTab        = _tab[1];
  var _sidOpen    = useState(true);      var sidebarOpen = _sidOpen[0],   setSidebarOpen = _sidOpen[1];
  var _loadErr    = useState(null);      var loadError  = _loadErr[0],    setLoadError  = _loadErr[1];
  var _copied     = useState(null);      var copied     = _copied[0],     setCopied     = _copied[1];
  var _modal      = useState(null);      var modal      = _modal[0],      setModal      = _modal[1];
  var _view       = useState("color");   var view       = _view[0],       setView       = _view[1];
  var _zoom       = useState(1);         var zoom       = _zoom[0],       setZoom       = _zoom[1];
  var _hiId       = useState(null);      var hiId       = _hiId[0],       setHiId       = _hiId[1];
  var _showCtr    = useState(true);      var showCtr    = _showCtr[0],    setShowCtr    = _showCtr[1];
  var _showOvl    = useState(false);     var showOverlay = _showOvl[0],   setShowOverlay = _showOvl[1];
  var _ovlOp      = useState(0.3);       var overlayOpacity = _ovlOp[0], setOverlayOpacity = _ovlOp[1];

  // Section open states
  var _dimOpen  = useState(true);    var dimOpen  = _dimOpen[0],  setDimOpen  = _dimOpen[1];
  var _palOpen  = useState(true);    var palOpen  = _palOpen[0],  setPalOpen  = _palOpen[1];
  var _fabOpen  = useState(false);   var fabOpen  = _fabOpen[0],  setFabOpen  = _fabOpen[1];
  var _adjOpen  = useState(false);   var adjOpen  = _adjOpen[0],  setAdjOpen  = _adjOpen[1];
  var _bgOpen   = useState(false);   var bgOpen   = _bgOpen[0],   setBgOpen   = _bgOpen[1];
  var _palAdv   = useState(false);   var palAdvanced = _palAdv[0], setPalAdvanced = _palAdv[1];
  var _clOpen   = useState(false);   var cleanupOpen = _clOpen[0], setCleanupOpen = _clOpen[1];
  var _sc       = useState({enabled:true,strength:"balanced",protectDetails:true,smoothDithering:true});
  var stitchCleanup = _sc[0], setStitchCleanup = _sc[1];
  var _hasGen   = useState(false);   var hasGenerated = _hasGen[0], setHasGenerated = _hasGen[1];

  // Crop state
  var _isCrop  = useState(false);    var isCropping = _isCrop[0], setIsCropping = _isCrop[1];
  var _cropRect= useState(null);     var cropRect   = _cropRect[0], setCropRect = _cropRect[1];
  var cropStartRef = useRef(null);
  var cropRef      = useRef(null);

  // Tools / editing
  var _actTool  = useState(null);    var activeTool     = _actTool[0],  setActiveTool     = _actTool[1];
  var _bsLines  = useState([]);      var bsLines        = _bsLines[0],  setBsLines        = _bsLines[1];
  var _bsStart  = useState(null);    var bsStart        = _bsStart[0],  setBsStart        = _bsStart[1];
  var _bsCont   = useState(false);   var bsContinuous   = _bsCont[0],   setBsContinuous   = _bsCont[1];
  var _selColId = useState(null);    var selectedColorId = _selColId[0], setSelectedColorId = _selColId[1];
  var _hovCoord = useState(null);    var hoverCoords    = _hovCoord[0], setHoverCoords    = _hovCoord[1];
  var _editHist = useState([]);      var editHistory    = _editHist[0], setEditHistory    = _editHist[1];
  var _redoHist = useState([]);      var redoHistory    = _redoHist[0], setRedoHistory    = _redoHist[1];
  var EDIT_HISTORY_MAX = 50;
  var _scHint   = useState(function() { try { return !!localStorage.getItem("shortcuts_hint_dismissed"); } catch(_) { return false; } });
  var shortcutsHintDismissed = _scHint[0], setShortcutsHintDismissed = _scHint[1];
  var _brushM   = useState("paint"); var brushMode = _brushM[0], setBrushMode = _brushM[1];
  var _brushSz  = useState(1);       var brushSize = _brushSz[0], setBrushSize = _brushSz[1];
  var _ovfOpen  = useState(false);   var overflowOpen = _ovfOpen[0], setOverflowOpen = _ovfOpen[1];
  var _stripCol = useState({view:false,brush:false,bs:false});
  var stripCollapsed = _stripCol[0], setStripCollapsed = _stripCol[1];

  // Export state
  var _expPage = useState(0);        var exportPage = _expPage[0], setExportPage = _expPage[1];
  var _pgMode  = useState(false);    var pageMode   = _pgMode[0],  setPageMode   = _pgMode[1];
  var _pdfDM   = useState("color_symbol"); var pdfDisplayMode = _pdfDM[0], setPdfDisplayMode = _pdfDM[1];
  var _pdfCS   = useState(3);        var pdfCellSize = _pdfCS[0],  setPdfCellSize = _pdfCS[1];
  var _pdfSP   = useState(false);    var pdfSinglePage = _pdfSP[0], setPdfSinglePage = _pdfSP[1];

  // Tracking / progress
  var _done = useState(null);        var done = _done[0], setDone = _done[1];
  var _scrMode  = useState(false);   var isScratchMode = _scrMode[0], setIsScratchMode = _scrMode[1];
  var _scrPal   = useState([]);      var scratchPalette = _scrPal[0], setScratchPalette = _scrPal[1];
  var _dmcSch   = useState("");      var dmcSearch = _dmcSch[0], setDmcSearch = _dmcSch[1];
  var _colPick  = useState(true);    var colPickerOpen = _colPick[0], setColPickerOpen = _colPick[1];
  var _parkM    = useState([]);      var parkMarkers = _parkM[0], setParkMarkers = _parkM[1];
  var _hlRow    = useState(-1);      var hlRow = _hlRow[0], setHlRow = _hlRow[1];
  var _hlCol    = useState(-1);      var hlCol = _hlCol[0], setHlCol = _hlCol[1];
  var _totTime  = useState(0);       var totalTime = _totTime[0], setTotalTime = _totTime[1];
  var _sessions = useState([]);      var sessions = _sessions[0], setSessions = _sessions[1];
  var _hs       = useState(function() { return new Map(); });
  var halfStitches = _hs[0], setHalfStitches = _hs[1];
  var _hsTool   = useState(null);    var halfStitchTool = _hsTool[0], setHalfStitchTool = _hsTool[1];

  // Thread organiser
  var _thOwned  = useState({});      var threadOwned = _thOwned[0], setThreadOwned = _thOwned[1];
  var _glStash  = useState({});      var globalStash = _glStash[0], setGlobalStash = _glStash[1];
  var _kitResult= useState(null);    var kittingResult = _kitResult[0], setKittingResult = _kitResult[1];
  var _altOpen  = useState(null);    var altOpen = _altOpen[0], setAltOpen = _altOpen[1];

  // Preview
  var _prevUrl  = useState(null);    var previewUrl = _prevUrl[0], setPreviewUrl = _prevUrl[1];
  var _prevStats= useState(null);    var previewStats = _prevStats[0], setPreviewStats = _prevStats[1];
  var _confetti = useState(null);    var confettiData = _confetti[0], setConfettiData = _confetti[1];
  var _prevHeat = useState(null);    var previewHeatmap = _prevHeat[0], setPreviewHeatmap = _prevHeat[1];
  var _prevMapped = useState(null);  var previewMapped = _prevMapped[0], setPreviewMapped = _prevMapped[1];
  var _prevColors = useState(null);  var previewColors = _prevColors[0], setPreviewColors = _prevColors[1];
  var _prevDims   = useState(null);  var previewDims   = _prevDims[0],   setPreviewDims   = _prevDims[1];
  var _prevHigh   = useState(null);  var previewHighlight = _prevHigh[0], setPreviewHighlight = _prevHigh[1];
  var previewTimerRef = useRef(null);

  // Project identity
  var _projName  = useState("");     var projectName = _projName[0], setProjectName = _projName[1];
  var _namePrompt= useState(false);  var namePromptOpen = _namePrompt[0], setNamePromptOpen = _namePrompt[1];

  // Refs
  var pcRef      = useRef(null);
  var fRef       = useRef(null);
  var scrollRef  = useRef(null);
  var expRef     = useRef(null);
  var loadRef    = useRef(null);
  var prevSW     = useRef(sW);
  var prevSH     = useRef(sH);
  var projectIdRef = useRef(null);
  var userActedRef = useRef(false);
  var stripRef   = useRef(null);
  var overflowRef= useRef(null);
  var workerRef      = useRef(null); // null | Worker | 'unavailable'
  var applyResultRef = useRef(null); // updated each render, captures fresh state
  var genReqIdRef    = useRef(0);    // incremented per generation; stale results are discarded

  var G = 28;

  // ─── Derived values ──────────────────────────────────────────────────────────
  var totalStitchable = useMemo(function() {
    if (!pat) return 0;
    var c = 0;
    for (var i = 0; i < pat.length; i++) if (pat[i].id !== "__skip__" && pat[i].id !== "__empty__") c++;
    return c;
  }, [pat]);

  var cs = useMemo(function() { return Math.max(2, Math.round(20 * zoom)); }, [zoom]);

  var fitZ = useCallback(function() {
    setZoom(Math.min(3, Math.max(0.05, 750 / (sW * 20))));
  }, [sW]);

  var pxX = Math.ceil(sW / (typeof A4W !== "undefined" ? A4W : 62));
  var pxY = Math.ceil(sH / (typeof A4H !== "undefined" ? A4H : 91));
  var totPg = pxX * pxY;

  var skeinData = useMemo(function() {
    if (!pal) return [];
    var map = {};
    pal.forEach(function(p) {
      if (p.type === "solid") { map[p.id] = (map[p.id] || 0) + p.count; }
      else if (p.type === "blend" && p.threads) { p.threads.forEach(function(t) { map[t.id] = (map[t.id] || 0) + p.count; }); }
    });
    return Object.entries(map)
      .sort(function(a, b) { var na = parseInt(a[0]) || 0, nb = parseInt(b[0]) || 0; if (na && nb) return na - nb; return a[0].localeCompare(b[0]); })
      .map(function(e) {
        var id = e[0], ct = e[1];
        var t = DMC.find(function(d) { return d.id === id; });
        return { id: id, name: t ? t.name : "", rgb: t ? t.rgb : [128, 128, 128], stitches: ct, skeins: skeinEst(ct, fabricCt) };
      });
  }, [pal, fabricCt]);

  var totalSkeins = useMemo(function() { return skeinData.reduce(function(s, d) { return s + d.skeins; }, 0); }, [skeinData]);
  var blendCount  = useMemo(function() { return pal ? pal.filter(function(p) { return p.type === "blend"; }).length : 0; }, [pal]);
  var difficulty  = useMemo(function() { return pal ? calcDifficulty(pal.length, blendCount, totalStitchable) : null; }, [pal, blendCount, totalStitchable]);

  var doneCount = useMemo(function() {
    if (!done) return 0;
    var c = 0; for (var i = 0; i < done.length; i++) if (done[i]) c++; return c;
  }, [done]);

  var dmcFiltered = useMemo(function() {
    if (!dmcSearch.trim()) return DMC;
    var q = dmcSearch.toLowerCase();
    return DMC.filter(function(d) { return d.id.toLowerCase().includes(q) || d.name.toLowerCase().includes(q); });
  }, [dmcSearch]);

  var displayPal = useMemo(function() {
    if (!isScratchMode || !pal) return pal;
    var ids = new Set(pal.map(function(p) { return p.id; }));
    var extras = scratchPalette.filter(function(p) { return !ids.has(p.id); });
    return pal.concat(extras);
  }, [isScratchMode, pal, scratchPalette]);

  var progressPct = totalStitchable > 0 ? Math.round(doneCount / totalStitchable * 1000) / 10 : 0;

  var colourDoneCounts = useMemo(function() {
    if (!pat || !done) return {};
    var c = {};
    for (var i = 0; i < pat.length; i++) {
      if (pat[i].id === "__skip__" || pat[i].id === "__empty__") continue;
      var id = pat[i].id;
      if (!c[id]) c[id] = { total: 0, done: 0 };
      c[id].total++;
      if (done[i]) c[id].done++;
    }
    return c;
  }, [pat, done]);

  var stitchType = halfStitchTool === "fwd" ? "half-fwd"
    : halfStitchTool === "bck" ? "half-bck"
    : halfStitchTool === "erase" ? "erase"
    : activeTool === "backstitch" ? "backstitch"
    : (activeTool === "paint" || activeTool === "fill") ? "cross"
    : null;

  var ownedCount = useMemo(function() {
    return skeinData.filter(function(d) { return (threadOwned[d.id] || "") === "owned"; }).length;
  }, [skeinData, threadOwned]);

  var toBuyCount = useMemo(function() {
    return skeinData.filter(function(d) { return (threadOwned[d.id] || "") === "tobuy" || !(threadOwned[d.id]); }).length;
  }, [skeinData, threadOwned]);

  var toBuyList = useMemo(function() {
    return skeinData.filter(function(d) { return (threadOwned[d.id] || "") !== "owned"; });
  }, [skeinData, threadOwned]);

  // ─── Helper functions ────────────────────────────────────────────────────────

  function buildPaletteWithScratch(np) {
    var result = buildPalette(np);
    if (!isScratchMode || !scratchPalette.length) return result;
    var ids = new Set(result.pal.map(function(x) { return x.id; }));
    var extras = scratchPalette.filter(function(x) { return !ids.has(x.id); });
    var ec = {};
    extras.forEach(function(e) { ec[e.id] = e; });
    return { pal: result.pal.concat(extras), cmap: Object.assign({}, result.cmap, ec) };
  }

  function chgW(v) {
    var w = Math.max(10, Math.min(300, parseInt(v) || 10));
    setSW(w);
    if (arLock) setSH(Math.max(10, Math.round(w / ar)));
  }
  function chgH(v) {
    var h = Math.max(10, Math.min(300, parseInt(v) || 10));
    setSH(h);
    if (arLock) setSW(Math.max(10, Math.round(h * ar)));
  }
  function slRsz(v) { chgW(v); }

  function selectStitchType(t) {
    if (t === "cross")     { setActiveTool(brushMode); setHalfStitchTool(null); setBsStart(null); }
    else if (t === "half-fwd") { setHalfStitchTool("fwd"); setActiveTool(null); setBsStart(null); }
    else if (t === "half-bck") { setHalfStitchTool("bck"); setActiveTool(null); setBsStart(null); }
    else if (t === "backstitch") { setActiveTool("backstitch"); setHalfStitchTool(null); }
    else if (t === "erase")  { setActiveTool("eraseAll"); setHalfStitchTool(null); setBsStart(null); }
    else { setActiveTool(null); setHalfStitchTool(null); setBsStart(null); }
  }
  function setBrushAndActivate(mode) {
    setBrushMode(mode);
    if (activeTool === "paint" || activeTool === "fill") setActiveTool(mode);
  }
  function setTool(tool) {
    if (activeTool === tool) { setActiveTool(null); setBsStart(null); return; }
    setActiveTool(tool); setBsStart(null); setHalfStitchTool(null);
  }
  function setHsTool(t) {
    if (halfStitchTool === t) { setHalfStitchTool(null); return; }
    setHalfStitchTool(t); setActiveTool(null); setBsStart(null);
  }

  function copyText(txt, label) {
    navigator.clipboard.writeText(txt).then(function() {
      setCopied(label);
      setTimeout(function() { setCopied(null); }, 2000);
    }).catch(function() {});
  }

  function resetAll() {
    setPat(null); setPal(null); setCmap(null); setHiId(null);
    setBsLines([]); setBsStart(null); setActiveTool(null); setSelectedColorId(null);
    setEditHistory([]); setRedoHistory([]); setExportPage(0); setDone(null);
    setParkMarkers([]); setHlRow(-1); setHlCol(-1); setTotalTime(0); setSessions([]);
    setThreadOwned({}); setConfettiData(null); setHasGenerated(false);
    setDimOpen(true); setPalOpen(true); setFabOpen(false); setAdjOpen(false);
    setBgOpen(false); setCleanupOpen(false); setIsCropping(false); setCropRect(null);
    setHalfStitches(new Map()); setHalfStitchTool(null); setBrushMode("paint");
    setIsScratchMode(false); setScratchPalette([]); setDmcSearch("");
  }

  function initBlankGrid(w, h) {
    var blank = Array.from({ length: w * h }, function() { return { id: "__empty__", rgb: [255, 255, 255] }; });
    var result = buildPalette(blank);
    setPat(blank); setPal(result.pal); setCmap(result.cmap); setDone(new Uint8Array(w * h));
  }

  function startScratch() {
    resetAll();
    setIsScratchMode(true);
    setImg({ src: null, w: sW, h: sH });
    prevSW.current = sW; prevSH.current = sH;
    initBlankGrid(sW, sH);
  }

  function addScratchColour(d) {
    if (cmap && cmap[d.id]) return;
    var usedSyms = new Set(pal ? pal.map(function(p) { return p.symbol; }) : []);
    var sym = SYMS.find(function(s) { return !usedSyms.has(s); }) || SYMS[(pal ? pal.length : 0) % SYMS.length];
    var entry = { id: d.id, type: "solid", name: d.name, rgb: d.rgb, lab: d.lab, count: 0, symbol: sym };
    setScratchPalette(function(prev) { return prev.filter(function(p) { return p.id !== d.id; }).concat([entry]); });
    setPal(function(prev) { return prev ? prev.concat([entry]) : [entry]; });
    setCmap(function(prev) { return prev ? Object.assign({}, prev, { [d.id]: entry }) : { [d.id]: entry }; });
    setSelectedColorId(d.id);
    if (!activeTool && !halfStitchTool) setBrushAndActivate("paint");
  }

  function removeScratchColour(id) {
    setScratchPalette(function(prev) { return prev.filter(function(p) { return p.id !== id; }); });
    setPal(function(prev) { return prev ? prev.filter(function(p) { return p.id !== id; }) : prev; });
    setCmap(function(prev) { if (!prev) return prev; var n = Object.assign({}, prev); delete n[id]; return n; });
  }

  function toggleOwned(id) {
    setThreadOwned(function(prev) {
      var cur = prev[id] || "";
      var next = cur === "" ? "owned" : cur === "owned" ? "tobuy" : "";
      return Object.assign({}, prev, { [id]: next });
    });
  }

  // ─── Generate callback ───────────────────────────────────────────────────────

  // Updated on every render so the worker/fallback result handler always sees
  // fresh captured values for hasGenerated, sW, etc.
  applyResultRef.current = function(result) {
    // Discard results from a superseded generation or a mismatched grid size
    if (result.reqId !== genReqIdRef.current) { setBusy(false); return; }
    if (result.mapped && result.mapped.length !== sW * sH) { setBusy(false); return; }
    setConfettiData(result.confettiData);
    setPal(result.pal); setCmap(result.cmap); setPat(result.mapped);
    setDone(new Uint8Array(result.mapped.length));
    setParkMarkers([]); setTab("pattern"); setThreadOwned({});
    setEditHistory([]); setRedoHistory([]);
    if (!hasGenerated) {
      setDimOpen(false); setPalOpen(false); setFabOpen(false);
      setAdjOpen(false); setBgOpen(false); setCleanupOpen(false);
      setHasGenerated(true);
    }
    var z = Math.min(3, Math.max(0.05, 750 / (sW * 20)));
    setTimeout(function() { setZoom(z); }, 0);
    setBusy(false);
  };

  // Lazily create (and reuse) the Web Worker. Falls back to 'unavailable' if
  // Workers are blocked (e.g., file:// protocol).
  function getOrCreateWorker() {
    if (workerRef.current === 'unavailable') return null;
    if (!workerRef.current) {
      try {
        var w = new Worker('generate-worker.js');
        w.onmessage = function(e) {
          var msg = e.data;
          if (msg.type === 'error') {
            console.error('Worker generation error:', msg.message, msg.stack || '');
            w.terminate();
            workerRef.current = null;
            setBusy(false);
            return;
          }
          if (msg.type === 'result') {
            applyResultRef.current(msg);
          }
        };
        w.onerror = function(err) {
          console.error('Worker uncaught error:', err.message);
          w.terminate();
          workerRef.current = 'unavailable';
          setBusy(false);
        };
        workerRef.current = w;
      } catch (ex) {
        console.warn('Web Worker unavailable, falling back to main thread:', ex);
        workerRef.current = 'unavailable';
        return null;
      }
    }
    return workerRef.current;
  }

  var generate = useCallback(function() {
    if (!img) return;
    setBusy(true); setHiId(null); setExportPage(0);
    var reqId = ++genReqIdRef.current;

    var startGeneration = function() {
      // Extract pixel data here (requires canvas — must stay on main thread)
      var c = document.createElement("canvas");
      c.width = sW; c.height = sH;
      var cx = c.getContext("2d");
      cx.filter = "brightness(" + (100 + bri) + "%) contrast(" + (100 + con) + "%) saturate(" + (100 + sat) + "%)";
      cx.drawImage(img, 0, 0, sW, sH);
      cx.filter = "none";
      var imageData = cx.getImageData(0, 0, sW, sH);

      var worker = getOrCreateWorker();
      if (!worker) {
        // Fallback: run synchronously on main thread (e.g. file:// protocol)
        setTimeout(function() {
          if (reqId !== genReqIdRef.current) { setBusy(false); return; }
          try {
            var result = runGenerationPipeline(img, {
              sW: sW, sH: sH, maxC: maxC, bri: bri, con: con, sat: sat,
              dith: dith, skipBg: skipBg, bgCol: bgCol, bgTh: bgTh,
              minSt: minSt, smooth: smooth, smoothType: smoothType,
              stitchCleanup: stitchCleanup, allowBlends: allowBlends,
            });
            if (!result) { setBusy(false); return; }
            applyResultRef.current({ reqId: reqId, mapped: result.pat, pal: result.pal, cmap: result.cmap, confettiData: result.confettiData });
          } catch (err) { console.error(err); setBusy(false); }
        }, 50);
        return;
      }

      // Post to worker — transfer the pixel buffer (zero-copy)
      worker.postMessage({
        type: 'generate',
        reqId: reqId,
        pixels: imageData.data.buffer,
        width: sW,
        height: sH,
        settings: {
          maxC: maxC, dith: dith, allowBlends: allowBlends,
          skipBg: skipBg, bgCol: bgCol, bgTh: bgTh,
          minSt: minSt, smooth: smooth, smoothType: smoothType,
          stitchCleanup: stitchCleanup,
        },
      }, [imageData.data.buffer]);
    };

    if (typeof requestAnimationFrame === 'function') {
      requestAnimationFrame(startGeneration);
    } else {
      setTimeout(startGeneration, 0);
    }
  }, [img, sW, sH, maxC, bri, con, sat, dith, skipBg, bgCol, bgTh, minSt, smooth, smoothType, stitchCleanup, hasGenerated, allowBlends]);

  // Terminate the worker when the component unmounts to prevent memory leaks
  useEffect(function() {
    return function() {
      if (workerRef.current && workerRef.current !== 'unavailable') {
        workerRef.current.terminate();
        workerRef.current = null;
      }
    };
  }, []);

  // ─── Palette swap integration ────────────────────────────────────────────────
  var paletteSwap = usePaletteSwap({
    pat: pat,
    pal: pal || [],
    cmap: cmap,
    sW: sW,
    sH: sH,
    done: done,
    setPat: setPat,
    setPal: setPal,
    setCmap: setCmap,
    setDone: setDone,
    editHistory: editHistory,
    setEditHistory: setEditHistory,
    setRedoHistory: setRedoHistory,
    EDIT_HISTORY_MAX: EDIT_HISTORY_MAX,
    buildPaletteWithScratch: buildPaletteWithScratch,
  });

  // ─── Scratch resize effect ───────────────────────────────────────────────────
  useEffect(function() {
    if (!isScratchMode || !pat) return;
    if (sW === prevSW.current && sH === prevSH.current) return;
    var oldW = prevSW.current, oldH = prevSH.current;
    prevSW.current = sW; prevSH.current = sH;
    var newPat = Array.from({ length: sW * sH }, function(_, i) {
      var ox = i % sW, oy = Math.floor(i / sW);
      if (ox < oldW && oy < oldH) { var oi = oy * oldW + ox; if (pat[oi]) return pat[oi]; }
      return { id: "__empty__", rgb: [255, 255, 255] };
    });
    var result = buildPaletteWithScratch(newPat);
    setPat(newPat); setPal(result.pal); setCmap(result.cmap); setDone(new Uint8Array(sW * sH));
  }, [sW, sH, isScratchMode]);

  // ─── Return everything ───────────────────────────────────────────────────────
  return {
    img, setImg, isUploading, setIsUploading, isDragging, setIsDragging,
    sW, setSW, sH, setSH, arLock, setArLock, ar, setAr,
    maxC, setMaxC, bri, setBri, con, setCon, sat, setSat,
    dith, setDith, skipBg, setSkipBg, bgTh, setBgTh, bgCol, setBgCol,
    pickBg, setPickBg, minSt, setMinSt, smooth, setSmooth, smoothType, setSmoothType,
    orphans, setOrphans, allowBlends, setAllowBlends,
    pat, setPat, pal, setPal, cmap, setCmap, busy, setBusy,
    origW, setOrigW, origH, setOrigH,
    fabricCt, setFabricCt, skeinPrice, setSkeinPrice, stitchSpeed, setStitchSpeed,
    tab, setTab, sidebarOpen, setSidebarOpen, loadError, setLoadError,
    copied, setCopied, modal, setModal,
    view, setView, zoom, setZoom, hiId, setHiId, showCtr, setShowCtr,
    showOverlay, setShowOverlay, overlayOpacity, setOverlayOpacity,
    dimOpen, setDimOpen, palOpen, setPalOpen, fabOpen, setFabOpen,
    adjOpen, setAdjOpen, bgOpen, setBgOpen, palAdvanced, setPalAdvanced,
    cleanupOpen, setCleanupOpen, stitchCleanup, setStitchCleanup,
    hasGenerated, setHasGenerated, isCropping, setIsCropping,
    cropRect, setCropRect, cropStartRef, cropRef,
    activeTool, setActiveTool, bsLines, setBsLines, bsStart, setBsStart,
    bsContinuous, setBsContinuous, selectedColorId, setSelectedColorId,
    hoverCoords, setHoverCoords, editHistory, setEditHistory,
    redoHistory, setRedoHistory, EDIT_HISTORY_MAX,
    shortcutsHintDismissed, setShortcutsHintDismissed,
    brushMode, setBrushMode, brushSize, setBrushSize,
    overflowOpen, setOverflowOpen, stripCollapsed, setStripCollapsed,
    exportPage, setExportPage, pageMode, setPageMode,
    pdfDisplayMode, setPdfDisplayMode, pdfCellSize, setPdfCellSize,
    pdfSinglePage, setPdfSinglePage,
    done, setDone, isScratchMode, setIsScratchMode,
    scratchPalette, setScratchPalette, dmcSearch, setDmcSearch,
    colPickerOpen, setColPickerOpen, parkMarkers, setParkMarkers,
    hlRow, setHlRow, hlCol, setHlCol, totalTime, setTotalTime,
    sessions, setSessions, halfStitches, setHalfStitches,
    halfStitchTool, setHalfStitchTool, threadOwned, setThreadOwned,
    globalStash, setGlobalStash, kittingResult, setKittingResult,
    altOpen, setAltOpen, previewUrl, setPreviewUrl,
    previewStats, setPreviewStats, confettiData, setConfettiData,
    previewHeatmap, setPreviewHeatmap,
    previewMapped, setPreviewMapped, previewColors, setPreviewColors,
    previewDims, setPreviewDims, previewHighlight, setPreviewHighlight,
    previewTimerRef, projectName, setProjectName,
    namePromptOpen, setNamePromptOpen,
    pcRef, fRef, scrollRef, expRef, loadRef,
    prevSW, prevSH, projectIdRef, userActedRef, stripRef, overflowRef,
    G, EDIT_HISTORY_MAX,
    // Derived
    totalStitchable, cs, fitZ, pxX, pxY, totPg,
    skeinData, totalSkeins, blendCount, difficulty, doneCount, dmcFiltered,
    displayPal, progressPct, colourDoneCounts, stitchType,
    ownedCount, toBuyCount, toBuyList,
    // Functions
    buildPaletteWithScratch, chgW, chgH, slRsz, selectStitchType,
    setBrushAndActivate, setTool, setHsTool, fitZ, copyText,
    resetAll, initBlankGrid, startScratch, addScratchColour, removeScratchColour,
    toggleOwned, generate,
    // PaletteSwap
    paletteSwap,
  };
};
