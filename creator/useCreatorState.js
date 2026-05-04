/* creator/useCreatorState.js — All useState, useRef, useMemo, and derived
   helper functions for CreatorApp. Returned object becomes the base of
   CreatorContext.
   Depends on globals: React, usePaletteSwap, buildPalette, buildPaletteWithScratch,
   skeinEst, calcDifficulty, DMC, SYMS, FABRIC_COUNTS, A4W, A4H,
   DEFAULT_SKEIN_PRICE, runGenerationPipeline, STRENGTH_MAP. */

// Composite stash keys are 'dmc:310' / 'anchor:403'. Pre-migration data may use
// bare ids ('310'). Returns { brand, id } so callers can look the thread up in
// the right catalogue. Bare ids are assumed to be DMC (legacy default).
// Returns null only when `key` isn't a string at all.
function _splitStashKey(key) {
  if (typeof key !== 'string') return null;
  var idx = key.indexOf(':');
  if (idx < 0) return { brand: 'dmc', id: key };
  var brand = key.slice(0, idx).toLowerCase();
  return { brand: brand, id: key.slice(idx + 1) };
}

// Backwards-compatible helper kept for callers that only care about DMC.
// Returns the bare DMC id or null when the key belongs to another brand.
// Self-contained so the static regression test in tests/compositeKeyRegression
// can extract and eval it in isolation.
function _extractDmcId(key) {
  if (typeof key !== 'string') return null;
  var idx = key.indexOf(':');
  if (idx < 0) return key;
  if (key.slice(0, idx).toLowerCase() !== 'dmc') return null;
  return key.slice(idx + 1);
}

// ── Canonical conversion-settings helpers ──────────────────────────────────
//
// The image-to-pattern conversion engine (runCleanupPipeline /
// runGenerationPipeline / the Web Worker / the variation-gallery generator)
// accepts a fixed shape of options. Historically each call site re-derived
// that shape inline, which let bugs like S1 (broken stash-palette builder in
// the preview) and C3/C5 (missing dithStrength / minSt forwarding) slip past
// review. The helpers below are the SINGLE source of truth.
//
// Adding a new conversion setting requires:
//   1. Add the underlying state variable (useState) inside useCreatorState.
//   2. Add its key to CONVERSION_STATE_KEYS below.
//   3. Read it inside the conversionSettings useMemo and add it to the deps.
// The coverage tests in tests/previewReactivity.test.js statically check
// that this manifest exists.

// Manifest of state-variable keys that contribute to the conversion output.
// Used by the preview-coverage tests.
var CONVERSION_STATE_KEYS = [
  'sW', 'sH', 'bri', 'con', 'sat', 'smooth', 'smoothType',
  'maxC', 'dithMode', 'allowBlends', 'minSt',
  'skipBg', 'bgCol', 'bgTh', 'stitchCleanup', 'orphans',
  'stashConstrained', 'globalStash',
  'variationSeed', 'variationSubset',
  'fabricCt',
];

// Build the allowedPalette + count from a globalStash (composite-keyed) or a
// pre-built variation subset. ONE place that does the brand-aware key dance —
// every other call site funnels through this. Constrained to DMC threads only
// because the conversion pipeline (quantize/buildPalette/doMap/doDither) keys
// colours by bare `id` alone, and many Anchor ids overlap DMC ids (e.g. both
// have '310'), which would silently merge distinct colours and corrupt output.
// Non-DMC threads require namespaced ids throughout the pipeline + save format
// before they can be safely included here. Returns
// { palette: Array|null, count: number, threads: Array }.
function _buildAllowedPaletteFromStash(globalStash, subset) {
  if (subset && subset.length) {
    return { palette: subset, count: subset.length, threads: subset };
  }
  if (!globalStash) return { palette: null, count: 0, threads: [] };
  var palette = [];
  var seen = Object.create(null);
  Object.keys(globalStash).forEach(function(key) {
    if ((globalStash[key].owned || 0) <= 0) return;
    var parts = _splitStashKey(key);
    if (!parts || parts.brand !== 'dmc') return; // DMC-only: pipeline uses bare ids
    if (seen[parts.id]) return;
    var entry = (typeof findThreadInCatalog === 'function')
      ? findThreadInCatalog('dmc', parts.id)
      : null;
    if (!entry) return;
    seen[parts.id] = true;
    palette.push(Object.assign({}, entry, { brand: 'dmc' }));
  });
  return {
    palette: palette.length ? palette : null,
    count: palette.length,
    threads: palette,
  };
}

if (typeof window !== 'undefined') {
  window._buildAllowedPaletteFromStash = _buildAllowedPaletteFromStash;
  window.CONVERSION_STATE_KEYS = CONVERSION_STATE_KEYS;
}

// Plain helper (not a hook) — safe to call inside useState lazy initializers.
// Reads a UserPrefs key with try/catch fallback so missing/broken UserPrefs
// (e.g. SSR or test environments) never throws during render.
function loadUserPref(key, fallback) {
  try {
    if (typeof UserPrefs === "undefined") return fallback;
    return UserPrefs.get(key);
  } catch (_) { return fallback; }
}

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

  // Generation parameters (initial values come from Preferences › Pattern Creator)
  var _maxC   = useState(function () { var v = loadUserPref("creatorDefaultPaletteSize", 30); return (typeof v === "number" && v > 0) ? v : 30; });
  var maxC   = _maxC[0],   setMaxC   = _maxC[1];
  var _bri    = useState(0);          var bri    = _bri[0],    setBri    = _bri[1];
  var _con    = useState(0);          var con    = _con[0],    setCon    = _con[1];
  var _sat    = useState(0);          var sat    = _sat[0],    setSat    = _sat[1];
  var _dith   = useState(function () { var v = loadUserPref("creatorDefaultDithering", "off"); var valid = ["weak","balanced","strong"]; return (valid.indexOf(v) !== -1) ? v : (v && v !== "off" ? "balanced" : "off"); });
  var dithMode = _dith[0]; var setDithMode = _dith[1];
  // Derived boolean kept for all legacy consumers (generate call, Sidebar badge, etc.)
  var dith = dithMode !== "off";
  // Numeric strength multiplier: weak=0.5, balanced=1.0, strong=1.5
  var DITH_STRENGTH_MAP = {weak:0.5, balanced:1.0, strong:1.5};
  var dithStrength = DITH_STRENGTH_MAP[dithMode] || 1.0;
  // Back-compat setter: accepts boolean (legacy callers) or "off"/"weak"/"balanced"/"strong"
  var setDith = function(v) {
    if (typeof v === "boolean") { setDithMode(v ? "balanced" : "off"); return; }
    setDithMode(v);
  };
  var _skipBg = useState(false);      var skipBg = _skipBg[0], setSkipBg = _skipBg[1];
  var _bgTh   = useState(15);         var bgTh   = _bgTh[0],   setBgTh   = _bgTh[1];
  var _bgCol  = useState([255,255,255]); var bgCol = _bgCol[0], setBgCol = _bgCol[1];
  var _pickBg = useState(false);      var pickBg = _pickBg[0], setPickBg = _pickBg[1];
  var _minSt  = useState(function () { var v = loadUserPref("creatorMinStitchesPerColour", 0); return (typeof v === "number" && v >= 0) ? v : 0; });
  var minSt  = _minSt[0],  setMinSt  = _minSt[1];
  var _smooth = useState(0);          var smooth = _smooth[0], setSmooth = _smooth[1];
  var _sType  = useState("median");   var smoothType = _sType[0], setSmoothType = _sType[1];
  var _orphans= useState(function () { var v = loadUserPref("creatorOrphanRemovalStrength", 0); return (typeof v === "number" && v >= 0) ? v : 0; });
  var orphans = _orphans[0], setOrphans = _orphans[1];
  var _blends = useState(function () { var v = loadUserPref("creatorAllowBlends", true); return v !== false; });
  var allowBlends = _blends[0], setAllowBlends = _blends[1];

  // Pattern data
  var _pat  = useState(null);         var pat  = _pat[0],  setPat  = _pat[1];
  var _pal  = useState(null);         var pal  = _pal[0],  setPal  = _pal[1];
  var _cmap = useState(null);         var cmap = _cmap[0], setCmap = _cmap[1];
  var _busy = useState(false);        var busy = _busy[0], setBusy = _busy[1];
  var _oW   = useState(0);            var origW = _oW[0],  setOrigW = _oW[1];
  var _oH   = useState(0);            var origH = _oH[0],  setOrigH = _oH[1];

  // Fabric / floss settings
  var _fabricCt    = useState(function () { var v = loadUserPref("creatorDefaultFabricCount", 14); return (typeof v === "number" && v > 0) ? v : 14; });
  var fabricCt = _fabricCt[0], setFabricCt = _fabricCt[1];
  var _skeinPrice  = useState(function () {
    var v = loadUserPref("skeinPriceDefault", undefined);
    if (typeof v === "number" && isFinite(v) && v >= 0) return v;
    return typeof DEFAULT_SKEIN_PRICE !== "undefined" ? DEFAULT_SKEIN_PRICE : 1.0;
  });
  var skeinPrice = _skeinPrice[0], setSkeinPrice = _skeinPrice[1];
  var _stitchSpeed = useState(40);    var stitchSpeed = _stitchSpeed[0], setStitchSpeed = _stitchSpeed[1];

  // Polish 13 step 4a — snapshot of source values at the time of last
  // successful generation. Used by the Dimensions / Palette tabs to show
  // a "Re-generate (values changed)" CTA when the user nudges sW/sH/
  // fabricCt/maxC after generating, so they don't have to remember to go
  // hunting in the More tab. null until the first generation completes.
  var _lastGenSnap = useState(null);
  var lastGenSnapshot = _lastGenSnap[0], setLastGenSnapshot = _lastGenSnap[1];

  // Snapshot of pat/pal/cmap at the time the last successful generation
  // completed. Used by usePaletteSwap to offer a "Revert to generated palette"
  // button. Session-only — clears on reload or resetAll().
  var _genPatSnap = useState(null);
  var genPatSnapshot = _genPatSnap[0], setGenPatSnapshot = _genPatSnap[1];

  // App mode: 'create' | 'edit' (track is handled by TrackerApp separately)
  var _appMode = useState("create"); var appMode = _appMode[0], setAppMode = _appMode[1];

  // Sidebar tab within current mode (mode-specific).
  // Create mode tabs: "image" | "dimensions" | "palette" | "preview" | "project".
  // Legacy "settings" (pre-2026-04 toolbar rework) is remapped to "image".
  var _sidebarTab = useState(function () {
    var v = loadUserPref("creator.sidebarTab", null);
    if (v === "settings") return "image";
    return v || "image";
  });
  var sidebarTab = _sidebarTab[0], _setSidebarTabRaw = _sidebarTab[1];
  function setSidebarTab(v) {
    if (v === "settings") v = "image"; // back-compat for any caller still passing the old id
    _setSidebarTabRaw(v);
    try { if (typeof UserPrefs !== "undefined") UserPrefs.set("creator.sidebarTab", v); } catch (_) {}
  }

  // UI state
  // B3: top-level Creator pages collapsed to 3 — 'pattern' | 'project' | 'materials'.
  // setTab is wrapped below to migrate legacy values ('prepare'/'legend'/'export').
  var _tab        = useState(function () {
    var v = loadUserPref("creator.lastPage", null);
    if (v === "prepare" || v === "legend" || v === "export") return "materials";
    if (v === "pattern" || v === "project" || v === "materials") return v;
    return "pattern";
  });
  var tab        = _tab[0],        setTabRaw     = _tab[1];
  // B4: which sub-tab inside MaterialsHub is active.
  // 'threads' | 'stash' | 'output'
  var _materialsTab = useState(function () {
    var v = loadUserPref("creator.materialsTab", null);
    if (v === "threads" || v === "stash" || v === "output") return v;
    // Honour legacy lastPage as a one-off seed so a user whose last visit
    // was the old Export tab lands on Output in the new hub.
    var lp = loadUserPref("creator.lastPage", null);
    if (lp === "export") return "output";
    if (lp === "prepare") return "stash";
    if (lp === "legend") return "threads";
    return "threads";
  });
  var materialsTab = _materialsTab[0];
  var setMaterialsTabRaw = _materialsTab[1];
  function setMaterialsTab(v) {
    if (v !== "threads" && v !== "stash" && v !== "output") return;
    setMaterialsTabRaw(v);
    try { if (typeof UserPrefs !== "undefined") UserPrefs.set("creator.materialsTab", v); } catch (_) {}
  }
  // setTab wrapper: rewrite legacy page IDs to (materials, sub-tab).
  function setTab(value) {
    var next = value;
    if (value === "prepare") { next = "materials"; setMaterialsTab("stash"); }
    else if (value === "legend") { next = "materials"; setMaterialsTab("threads"); }
    else if (value === "export") { next = "materials"; setMaterialsTab("output"); }
    else if (value !== "pattern" && value !== "project" && value !== "materials") {
      next = "pattern";
    }
    setTabRaw(next);
    try { if (typeof UserPrefs !== "undefined") UserPrefs.set("creator.lastPage", next); } catch (_) {}
  }
  var _sidOpen    = useState(true);      var sidebarOpen = _sidOpen[0],   setSidebarOpen = _sidOpen[1];
  var _loadErr    = useState(null);      var loadError  = _loadErr[0],    setLoadError  = _loadErr[1];
  var _copied     = useState(null);      var copied     = _copied[0],     setCopied     = _copied[1];
  var _modal      = useState(null);      var modal      = _modal[0],      setModal      = _modal[1];
  var _view       = useState(function () { var v = loadUserPref("creatorDefaultViewMode", "colour"); return v === "colour" ? "color" : (v || "color"); });
  var view       = _view[0],       setView       = _view[1];
  var _zoom       = useState(1);         var zoom       = _zoom[0],       setZoom       = _zoom[1];
  var _hiId       = useState(null);      var hiId       = _hiId[0],       setHiId       = _hiId[1];
  var _showCtr    = useState(true);      var showCtr    = _showCtr[0],    setShowCtr    = _showCtr[1];
  var _showOvl    = useState(false);     var showOverlay = _showOvl[0],   setShowOverlay = _showOvl[1];
  var _ovlOp      = useState(function () { var v = loadUserPref("creatorReferenceOpacity", 30); return (typeof v === "number" && v >= 0 && v <= 100) ? v / 100 : 0.3; });
  var overlayOpacity = _ovlOp[0], setOverlayOpacity = _ovlOp[1];
  var _prevActive = useState(false);     var previewActive = _prevActive[0], setPreviewActive = _prevActive[1];
  var _prevGrid   = useState(false);     var previewShowGrid = _prevGrid[0], setPreviewShowGrid = _prevGrid[1];
  var _prevFabric = useState(false);     var previewFabricBg = _prevFabric[0], setPreviewFabricBg = _prevFabric[1];
  var _prevMode   = useState("pixel");   var previewMode = _prevMode[0], setPreviewMode = _prevMode[1];
  var _rlvl       = useState(2);         var realisticLevel = _rlvl[0], setRealisticLevel = _rlvl[1];
  // color-2 (B3): canvas background fabric colour (e.g. white aida, natural
  // linen, black aida). Persisted via UserPrefs as #RRGGBB. Used by
  // canvasRenderer.js for the canvas background fill so users can preview
  // their pattern against realistic fabric instead of a plain white sheet.
  var _fabCol = useState(function () { var v = loadUserPref("creatorFabricColour", "#FFFFFF"); return (typeof v === "string" && /^#[0-9a-fA-F]{6}$/.test(v)) ? v : "#FFFFFF"; });
  var fabricColour = _fabCol[0];
  var _setFabricColourRaw = _fabCol[1];
  function setFabricColour(v) {
    if (typeof v !== "string" || !/^#[0-9a-fA-F]{6}$/.test(v)) return;
    _setFabricColourRaw(v);
    try { if (typeof UserPrefs !== "undefined") UserPrefs.set("creatorFabricColour", v); } catch (_) {}
  }
  // color-11: thread-sheen texture toggle. Read from UserPrefs; updated via
  // a cs:prefsChanged listener so the canvas re-renders when the prefs modal
  // toggles the option without a full page reload.
  var _canvasTex = useState(function () { try { return window.UserPrefs ? !!window.UserPrefs.get("creatorCanvasTexture") : false; } catch (_) { return false; } });
  var canvasTexture = _canvasTex[0], setCanvasTexture = _canvasTex[1];
  useEffect(function () {
    function _onPrefsChanged(e) {
      if (e && e.detail && e.detail.key === "creatorCanvasTexture") {
        setCanvasTexture(!!e.detail.value);
      }
    }
    document.addEventListener("cs:prefsChanged", _onPrefsChanged);
    return function () { document.removeEventListener("cs:prefsChanged", _onPrefsChanged); };
  }, []);
  // null = auto (derived from fabricCt + strand count); float 0–1 = manual override
  var _covOvr     = useState(null);      var coverageOverride = _covOvr[0], setCoverageOverride = _covOvr[1];

  // Split-pane state — loaded from UserPrefs on init
  var _spEn = useState(function() { return loadUserPref("splitPaneEnabled", false); });
  var splitPaneEnabled = _spEn[0], setSplitPaneEnabled = _spEn[1];
  var _spRatio = useState(function() { return loadUserPref("splitPaneRatio", 0.5); });
  var splitPaneRatio = _spRatio[0], setSplitPaneRatio = _spRatio[1];
  var _spSync = useState(function() { return loadUserPref("splitPaneSyncEnabled", true); });
  var splitPaneSyncEnabled = _spSync[0], setSplitPaneSyncEnabled = _spSync[1];
  var _rpMode = useState(function() { return loadUserPref("rightPaneMode", "level2"); });
  var rightPaneMode = _rpMode[0], setRightPaneMode = _rpMode[1];

  // Section open states
  var _dimOpen  = useState(true);    var dimOpen  = _dimOpen[0],  setDimOpen  = _dimOpen[1];
  var _palOpen  = useState(true);    var palOpen  = _palOpen[0],  setPalOpen  = _palOpen[1];
  var _fabOpen  = useState(false);   var fabOpen  = _fabOpen[0],  setFabOpen  = _fabOpen[1];
  var _adjOpen  = useState(false);   var adjOpen  = _adjOpen[0],  setAdjOpen  = _adjOpen[1];
  var _bgOpen   = useState(false);   var bgOpen   = _bgOpen[0],   setBgOpen   = _bgOpen[1];
  var _palAdv   = useState(false);   var palAdvanced = _palAdv[0], setPalAdvanced = _palAdv[1];
  var _clOpen   = useState(false);   var cleanupOpen = _clOpen[0], setCleanupOpen = _clOpen[1];
  var _sc       = useState(function () {
    return {
      enabled:        loadUserPref("creatorStitchCleanup", true) !== false,
      strength:       "balanced",
      protectDetails: loadUserPref("creatorProtectDetails", true) !== false,
      smoothDithering:loadUserPref("creatorSmoothDithering", true) !== false
    };
  });
  var stitchCleanup = _sc[0], setStitchCleanup = _sc[1];
  var _hasGen   = useState(false);   var hasGenerated = _hasGen[0], setHasGenerated = _hasGen[1];

  // Crop state
  var _isCrop  = useState(false);    var isCropping = _isCrop[0], setIsCropping = _isCrop[1];
  var _cropRect= useState(null);     var cropRect   = _cropRect[0], setCropRect = _cropRect[1];
  var cropStartRef = useRef(null);
  var cropRef      = useRef(null);

  // Tools / editing
  var _actTool  = useState(null);    var activeTool     = _actTool[0];
  var activeToolRef = useRef(null);
  var previousToolRef = useRef(null);
  function setActiveTool(v) {
    // Track previous tool for eyedropper auto-return
    var prev = activeToolRef.current;
    if (v === "eyedropper" && prev && prev !== "eyedropper") {
      previousToolRef.current = prev;
    } else if (v !== "eyedropper") {
      // Switching away from pick manually — clear stale ref
      previousToolRef.current = null;
    }
    activeToolRef.current = v; _actTool[1](v);
  }
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
  var _brushM   = useState("paint"); var brushMode = _brushM[0];
  var brushModeRef = useRef("paint");
  function setBrushMode(v) { brushModeRef.current = v; _brushM[1](v); }
  var _brushSz  = useState(1);       var brushSize = _brushSz[0], setBrushSize = _brushSz[1];
  var _ovfOpen  = useState(false);   var overflowOpen = _ovfOpen[0], setOverflowOpen = _ovfOpen[1];
  var _panOpen  = useState(false);   var panelOpen = _panOpen[0], setPanelOpen = _panOpen[1];
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
  var _ps       = useState(function() { return new Map(); });
  var partialStitches = _ps[0], setPartialStitches = _ps[1];
  var _psTool   = useState(null);    var partialStitchTool = _psTool[0];
  var partialStitchToolRef = useRef(null);
  function setPartialStitchTool(v) { partialStitchToolRef.current = v; _psTool[1](v); }

  // Thread organiser
  var _thOwned  = useState({});      var threadOwned = _thOwned[0], setThreadOwned = _thOwned[1];
  var _glStash  = useState({});      var globalStash = _glStash[0], setGlobalStash = _glStash[1];
  var _kitResult= useState(null);    var kittingResult = _kitResult[0], setKittingResult = _kitResult[1];
  var _altOpen  = useState(null);    var altOpen = _altOpen[0], setAltOpen = _altOpen[1];

  // Substitute from stash
  var _stashOnly = useState(function() {
    try {
      var ls = localStorage.getItem("cs_stashConstrained");
      if (ls === "true") return true;
      if (ls === "false") return false;
    } catch(_) {}
    return loadUserPref("creatorStashOnlyDefault", false) === true;
  });
  var stashConstrained = _stashOnly[0];
  function setStashConstrained(v) { _stashOnly[1](v); try { localStorage.setItem("cs_stashConstrained", v ? "true" : "false"); } catch(_) {} }
  // Stash-Adapt: modal open/mode state. Replaces the legacy SubstituteFromStash
  // and ConvertPalette modals with a single non-destructive duplication flow.
  var _adOpen = useState(false);         var adaptModalOpen = _adOpen[0], setAdaptModalOpen = _adOpen[1];
  var _adMode = useState('stash');       var adaptModalMode = _adMode[0], setAdaptModalMode = _adMode[1];
  var _adMaxDE = useState(function() { try { var v = localStorage.getItem("cs_adaptMaxDE"); return v != null ? parseFloat(v) : 10; } catch(_) { return 10; } });
  var adaptMaxDeltaE = _adMaxDE[0];
  function setAdaptMaxDeltaE(v) { _adMaxDE[1](v); try { localStorage.setItem("cs_adaptMaxDE", String(v)); } catch(_) {} }
  // Brief D — runtime "limit palette/picker to my stash" filter (independent of the
  // generation-time stashConstrained switch). Persisted under cs_creator_stash_filter.
  var _csFilt = useState(function() { try { return localStorage.getItem("cs_creator_stash_filter") === "true"; } catch(_) { return false; } });
  var creatorStashFilter = _csFilt[0];
  function setCreatorStashFilter(v) { _csFilt[1](v); try { localStorage.setItem("cs_creator_stash_filter", v ? "true" : "false"); } catch(_) {} }

  // Preview
  var _prevUrl  = useState(null);    var previewUrl = _prevUrl[0], setPreviewUrl = _prevUrl[1];
  var _prevStats= useState(null);    var previewStats = _prevStats[0], setPreviewStats = _prevStats[1];
  var _confetti = useState(null);    var confettiData = _confetti[0], setConfettiData = _confetti[1];
  var _prevHeat = useState(null);    var previewHeatmap = _prevHeat[0], setPreviewHeatmap = _prevHeat[1];
  var _prevMapped = useState(null);  var previewMapped = _prevMapped[0], setPreviewMapped = _prevMapped[1];
  var _prevColors = useState(null);  var previewColors = _prevColors[0], setPreviewColors = _prevColors[1];
  var _prevDims   = useState(null);  var previewDims   = _prevDims[0],   setPreviewDims   = _prevDims[1];
  var _prevHigh   = useState(null);  var previewHighlight = _prevHigh[0], setPreviewHighlight = _prevHigh[1];
  var _prevLoad   = useState(false); var previewLoading = _prevLoad[0], setPreviewLoading = _prevLoad[1];
  var previewTimerRef = useRef(null);
  var wandClearRef   = useRef(null);   // set after wand hook is called
  var lassoCancelRef = useRef(null);   // set after lasso hook is called

  // Cleanup diff state
  var _cleanupDiff      = useState(null);  var cleanupDiff      = _cleanupDiff[0],      setCleanupDiff      = _cleanupDiff[1];
  var _showCleanupDiff  = useState(false); var showCleanupDiff  = _showCleanupDiff[0],  setShowCleanupDiff  = _showCleanupDiff[1];

  // Coverage gaps (QW4)
  var _coverageGaps = useState(null); var coverageGaps = _coverageGaps[0], setCoverageGaps = _coverageGaps[1];

  // Variation / randomise (stash mode)
  var _vSeed    = useState(null);   var variationSeed    = _vSeed[0],    setVariationSeed    = _vSeed[1];
  var _vSubset  = useState(null);   var variationSubset  = _vSubset[0],  setVariationSubset  = _vSubset[1];
  var _vHistory = useState([]);     var variationHistory = _vHistory[0], setVariationHistory = _vHistory[1];
  var _galSlots = useState([]);     var gallerySlots     = _galSlots[0], setGallerySlots     = _galSlots[1];
  var _galOpen  = useState(false);  var galleryOpen      = _galOpen[0],  setGalleryOpen      = _galOpen[1];

  // Project identity
  var _projName  = useState("");     var projectName = _projName[0], setProjectName = _projName[1];
  var _namePrompt= useState(false);  var namePromptOpen = _namePrompt[0], setNamePromptOpen = _namePrompt[1];
  // Proposal 2: auto-save state surfaced in the header badge so the user can
  // see "Saving…", "Saved 5 s ago", or "Save failed — Retry" instead of the
  // static "All changes saved" string. Driven by SaveStatus.createSaveController
  // inside useProjectIO.js.
  var _saveSt    = useState("idle"); var saveStatus = _saveSt[0],   setSaveStatus = _saveSt[1];
  var _savedAt   = useState(null);   var savedAt    = _savedAt[0],  setSavedAt    = _savedAt[1];
  var _saveErr   = useState(null);   var saveError  = _saveErr[0],  setSaveError  = _saveErr[1];
  // Distinguishes the auto-prompted first-save name modal from the legacy
  // "download .json" name modal so the two flows can render the same
  // NamePromptModal component without leaking each other's behaviour.
  // Values: null (closed) | "download" (legacy explicit save) | "firstSave"
  // (Proposal 2 prompt opened automatically after the first auto-save).
  var _nameReason= useState(null);   var nameModalReason = _nameReason[0], setNameModalReason = _nameReason[1];
  var _prefsOpen = useState(false); var preferencesOpen = _prefsOpen[0], setPreferencesOpen = _prefsOpen[1];
  // Optional metadata users can fill in before/after generating
  var _projDesigner = useState(""); var projectDesigner = _projDesigner[0], setProjectDesigner = _projDesigner[1];
  var _projDesc     = useState(""); var projectDescription = _projDesc[0], setProjectDescription = _projDesc[1];

  // Eyedropper feedback
  var _edEmpty = useState(false);    var eyedropperEmpty = _edEmpty[0], setEyedropperEmpty = _edEmpty[1];

  // Context menu
  var _ctxMenu = useState(null);     var contextMenu = _ctxMenu[0], setContextMenu = _ctxMenu[1];
  // Colour replace modal — null when closed, {srcId, srcName, srcRgb} when open
  var _crModal = useState(null);     var colourReplaceModal = _crModal[0], setColourReplaceModal = _crModal[1];

  // Selection modifier key (null | "add" | "subtract" | "intersect") — tracked via keydown/keyup
  var _selMod = useState(null);      var selectionModifier = _selMod[0], setSelectionModifier = _selMod[1];

  // ── Highlight mode system ──────────────────────────────────────────────────
  // highlightMode: "isolate" | "outline" | "tint" | "spotlight"
  // Per-mode settings persist independently.
  var _hlModeSt = useState(function() { try { return localStorage.getItem("cs_hlMode") || "isolate"; } catch(_) { return "isolate"; } });
  var highlightMode = _hlModeSt[0];
  function setHighlightMode(m) {
    _hlModeSt[1](m);
    try { localStorage.setItem("cs_hlMode", m); } catch(_) {}
  }

  // Isolate mode settings (Part A from Spec 1)
  var _bgDimOp  = useState(function() { try { var v = localStorage.getItem("cs_bgDimOp"); return v != null ? parseFloat(v) : 0.20; } catch(_) { return 0.20; } });
  var bgDimOpacity = _bgDimOp[0];
  function setBgDimOpacity(v) { _bgDimOp[1](v); try { localStorage.setItem("cs_bgDimOp", v); } catch(_) {} }
  var _hiAdv    = useState(false);  var hiAdvanced        = _hiAdv[0],    setHiAdvanced        = _hiAdv[1];
  var _bgDimDs  = useState(function() { try { var v = localStorage.getItem("cs_bgDimDs"); return v != null ? parseFloat(v) : 0.80; } catch(_) { return 0.80; } });
  var bgDimDesaturation = _bgDimDs[0];
  function setBgDimDesaturation(v) { _bgDimDs[1](v); try { localStorage.setItem("cs_bgDimDs", v); } catch(_) {} }

  // Tint mode settings
  var _tintColor = useState(function() { try { return localStorage.getItem("cs_tintColor") || "#FFD700"; } catch(_) { return "#FFD700"; } });
  var tintColor = _tintColor[0];
  function setTintColor(c) { _tintColor[1](c); try { localStorage.setItem("cs_tintColor", c); } catch(_) {} }
  var _tintOpacity = useState(function() { try { var v = localStorage.getItem("cs_tintOp"); return v != null ? parseFloat(v) : 0.40; } catch(_) { return 0.40; } });
  var tintOpacity = _tintOpacity[0];
  function setTintOpacity(v) { _tintOpacity[1](v); try { localStorage.setItem("cs_tintOp", v); } catch(_) {} }

  // Spotlight mode settings — default dimming is 15% (stronger than isolate)
  var _spotDimOp = useState(function() { try { var v = localStorage.getItem("cs_spotDimOp"); return v != null ? parseFloat(v) : 0.15; } catch(_) { return 0.15; } });
  var spotDimOpacity = _spotDimOp[0];
  function setSpotDimOpacity(v) { _spotDimOp[1](v); try { localStorage.setItem("cs_spotDimOp", v); } catch(_) {} }

  // Animation state (shared across modes that need dimming)
  var _dimFrac  = useState(0);      var dimFraction       = _dimFrac[0],  setDimFraction       = _dimFrac[1];
  var _dimHiId  = useState(null);   var dimHiId           = _dimHiId[0],  setDimHiId           = _dimHiId[1];
  var dimAnimRef  = useRef(null);
  var dimFracRef  = useRef(0);
  // Marching ants offset (outline mode)
  var _antsOff  = useState(0);      var antsOffset        = _antsOff[0],  setAntsOffset        = _antsOff[1];

  // Toast notifications
  var _toasts = useState([]);        var toasts = _toasts[0], setToasts = _toasts[1];
  var toastIdRef = useRef(0);
  var addToast = useCallback(function(message, opts) {
    opts = opts || {};
    var id = ++toastIdRef.current;
    var toast = { id: id, message: message, type: opts.type || "info", duration: opts.duration || 2500 };
    setToasts(function(prev) { return prev.concat([toast]); });
    setTimeout(function() {
      setToasts(function(prev) { return prev.filter(function(t) { return t.id !== id; }); });
    }, toast.duration);
    return id;
  }, []);
  var dismissToast = useCallback(function(id) {
    setToasts(function(prev) { return prev.filter(function(t) { return t.id !== id; }); });
  }, []);

  // Refs
  var pcRef      = useRef(null);
  var fRef       = useRef(null);
  var scrollRef  = useRef(null);
  var expRef     = useRef(null);
  var loadRef    = useRef(null);
  var prevSW     = useRef(sW);
  var prevSH     = useRef(sH);
  var projectIdRef = useRef(null);
  // fix-3.8 — when the active project changes, reset MaterialsHub sub-tab to
  // the default ('threads') so a freshly opened pattern lands on a sensible
  // starting point instead of inheriting Shopping/Output from a prior project.
  // Implemented by tracking the previous id in a ref and watching for
  // mismatches every render.
  var prevMaterialsProjectIdRef = useRef(null);
  var createdAtRef = useRef(null);
  var trackerFieldsRef = useRef({});
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
        var t = findThreadInCatalog('dmc', id);
        return { id: id, name: t ? t.name : "", rgb: t ? t.rgb : [128, 128, 128], stitches: ct, skeins: skeinEst(ct, fabricCt) };
      });
  }, [pal, fabricCt]);

  var totalSkeins = useMemo(function() { return skeinData.reduce(function(s, d) { return s + d.skeins; }, 0); }, [skeinData]);
  var blendCount  = useMemo(function() { return pal ? pal.filter(function(p) { return p.type === "blend"; }).length : 0; }, [pal]);

  // Scan the pattern once to derive confetti and change-rate scores for the difficulty model.
  // O(w×h) but cached; only reruns when pat/sW/sH/totalStitchable changes.
  var difficultyMetrics = useMemo(function() {
    if (!pat || !sW || !sH || totalStitchable < 1) return {};
    var isolated = 0, changePairs = 0, totalPairs = 0;
    for (var y = 0; y < sH; y++) {
      for (var x = 0; x < sW; x++) {
        var i = y * sW + x;
        var cell = pat[i];
        if (!cell || cell.id === '__skip__' || cell.id === '__empty__') continue;
        var id = cell.id;
        var iso = true;
        var nx, nid;
        if (x > 0)     { nid = pat[y*sW+(x-1)]; if (nid && nid.id !== '__skip__' && nid.id !== '__empty__' && nid.id === id) iso = false; }
        if (iso && x+1 < sW)  { nid = pat[y*sW+(x+1)]; if (nid && nid.id !== '__skip__' && nid.id !== '__empty__' && nid.id === id) iso = false; }
        if (iso && y > 0)     { nid = pat[(y-1)*sW+x]; if (nid && nid.id !== '__skip__' && nid.id !== '__empty__' && nid.id === id) iso = false; }
        if (iso && y+1 < sH)  { nid = pat[(y+1)*sW+x]; if (nid && nid.id !== '__skip__' && nid.id !== '__empty__' && nid.id === id) iso = false; }
        if (iso) isolated++;
        if (x+1 < sW) { nx = pat[y*sW+(x+1)]; if (nx && nx.id !== '__skip__' && nx.id !== '__empty__') { totalPairs++; if (nx.id !== id) changePairs++; } }
        if (y+1 < sH) { nx = pat[(y+1)*sW+x]; if (nx && nx.id !== '__skip__' && nx.id !== '__empty__') { totalPairs++; if (nx.id !== id) changePairs++; } }
      }
    }
    return {
      confettiScore: isolated / totalStitchable,
      changeScore: totalPairs > 0 ? changePairs / totalPairs : 0,
    };
  }, [pat, sW, sH, totalStitchable]);

  var difficulty  = useMemo(function() {
    if (!pal) return null;
    return calcDifficulty(pal.length, blendCount, totalStitchable, {
      fabricCt: fabricCt,
      bsCount: bsLines.length,
      confettiScore: difficultyMetrics.confettiScore,
      changeScore: difficultyMetrics.changeScore,
    });
  }, [pal, blendCount, totalStitchable, fabricCt, bsLines, difficultyMetrics]);

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
    if (!pal) return pal;
    if (!scratchPalette.length) return pal;
    var ids = new Set(pal.map(function(p) { return p.id; }));
    var extras = scratchPalette.filter(function(p) { return !ids.has(p.id); });
    return pal.concat(extras);
  }, [pal, scratchPalette]);

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

  var stitchType = partialStitchTool ? partialStitchTool
    : activeTool === "backstitch" ? "backstitch"
    : activeTool === "eraseAll" ? "erase"
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
    if (!scratchPalette.length) return result;
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
    if (t === "cross") {
      setActiveTool(brushModeRef.current); setPartialStitchTool(null); setBsStart(null);
    } else if (t === "quarter" || t === "half-fwd" || t === "half-bck" || t === "three-quarter") {
      setPartialStitchTool(t); setActiveTool(null); setBsStart(null);
    } else if (t === "backstitch") {
      setActiveTool("backstitch"); setPartialStitchTool(null);
    } else if (t === "erase") {
      setActiveTool("eraseAll"); setPartialStitchTool(null); setBsStart(null);
    } else {
      setActiveTool(null); setPartialStitchTool(null); setBsStart(null);
    }
  }
  function setBrushAndActivate(mode) {
    setBrushMode(mode);
    setActiveTool(mode);
    setPartialStitchTool(null);
    setBsStart(null);
  }
  function setTool(tool) {
    if (activeToolRef.current === tool) { setActiveTool(null); setBsStart(null); return; }
    setActiveTool(tool); setBsStart(null); setPartialStitchTool(null);
  }
  function setHsTool(t) {
    if (partialStitchToolRef.current === t) { setPartialStitchTool(null); return; }
    setPartialStitchTool(t); setActiveTool(null); setBsStart(null);
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
    setLastGenSnapshot(null); setGenPatSnapshot(null);
    setThreadOwned({}); setConfettiData(null); setHasGenerated(false);
    setDimOpen(true); setPalOpen(true); setFabOpen(false); setAdjOpen(false);
    setBgOpen(false); setCleanupOpen(false); setIsCropping(false); setCropRect(null);
    setPartialStitches(new Map()); setPartialStitchTool(null); setBrushMode("paint");
    setIsScratchMode(false); setScratchPalette([]); setDmcSearch("");
    setPreviewUrl(null); setPreviewStats(null); setPreviewHeatmap(null);
    setPreviewMapped(null); setPreviewColors(null); setPreviewDims(null); setPreviewHighlight(null);
    if (wandClearRef.current) wandClearRef.current();
    if (lassoCancelRef.current) lassoCancelRef.current();
  }

  // Initialize paint tool/colour only on first pattern load (when no colour is selected yet)
  useEffect(function() {
    if (!pat || !pal || pal.length === 0) return;
    if (selectedColorId != null) return;
    setBrushAndActivate("paint");
    selectStitchType("cross");
    setSelectedColorId(pal[0].id);
  }, [pat, pal]);

  // fix-3.8 — reset MaterialsHub sub-tab to default ('threads') whenever the
  // active project id changes (new project, project loaded from library).
  // Skip persistence so the cross-project default in UserPrefs isn't trampled.
  useEffect(function () {
    var pid = projectIdRef.current || null;
    if (prevMaterialsProjectIdRef.current === null) {
      prevMaterialsProjectIdRef.current = pid;
      return;
    }
    if (pid !== prevMaterialsProjectIdRef.current) {
      prevMaterialsProjectIdRef.current = pid;
      setMaterialsTabRaw('threads');
    }
  });

  // ── Dimming animation: 150ms fade-in/out when hiId or highlightMode changes ──
  var usesDimming = highlightMode === "isolate" || highlightMode === "spotlight";
  useEffect(function() {
    if (dimAnimRef.current) cancelAnimationFrame(dimAnimRef.current);
    var shouldDim = hiId && usesDimming;
    if (shouldDim) {
      setDimHiId(hiId);
      // Already at full dim (switching between colours) — skip animation
      if (dimFracRef.current >= 0.99) { dimFracRef.current = 1; setDimFraction(1); return; }
      var from = dimFracRef.current;
      var st = null;
      function animIn(ts) {
        if (!st) st = ts;
        var t = Math.min((ts - st) / 150, 1);
        var v = from + (1 - from) * t;
        dimFracRef.current = v; setDimFraction(v);
        if (t < 1) dimAnimRef.current = requestAnimationFrame(animIn);
        else dimAnimRef.current = null;
      }
      dimAnimRef.current = requestAnimationFrame(animIn);
    } else {
      var from2 = dimFracRef.current;
      if (from2 < 0.01) { dimFracRef.current = 0; setDimFraction(0); setDimHiId(hiId || null); return; }
      var st2 = null;
      function animOut(ts) {
        if (!st2) st2 = ts;
        var t2 = Math.min((ts - st2) / 150, 1);
        var v2 = from2 * (1 - t2);
        dimFracRef.current = v2; setDimFraction(v2);
        if (t2 < 1) dimAnimRef.current = requestAnimationFrame(animOut);
        else { dimAnimRef.current = null; setDimHiId(hiId || null); }
      }
      dimAnimRef.current = requestAnimationFrame(animOut);
    }
    return function() { if (dimAnimRef.current) { cancelAnimationFrame(dimAnimRef.current); dimAnimRef.current = null; } };
  }, [hiId, usesDimming]);

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
    // Scratch mode bypasses Create → go straight to Edit
    setAppMode("edit");
    setSidebarTab("palette");
  }

  function addScratchColour(d) {
    if (cmap && cmap[d.id]) return;
    var usedSyms = new Set(pal ? pal.map(function(p) { return p.symbol; }) : []);
    var sym = SYMS.find(function(s) { return !usedSyms.has(s); }) || SYMS[(pal ? pal.length : 0) % SYMS.length];
    var entry;
    if (d.type === "blend" && d.threads && d.threads.length === 2) {
      entry = { id: d.id, type: "blend", name: d.id, rgb: d.rgb, lab: d.lab, threads: d.threads, count: 0, symbol: sym };
    } else {
      entry = { id: d.id, type: "solid", name: d.name, rgb: d.rgb, lab: d.lab, count: 0, symbol: sym };
    }
    setScratchPalette(function(prev) { return prev.filter(function(p) { return p.id !== d.id; }).concat([entry]); });
    setPal(function(prev) { return prev ? prev.concat([entry]) : [entry]; });
    setCmap(function(prev) { return prev ? Object.assign({}, prev, { [d.id]: entry }) : { [d.id]: entry }; });
    setSelectedColorId(d.id);
    setEditHistory(function(prev) {
      var n = prev.concat([{ type: "add_colour", changes: [], addedEntry: entry }]);
      if (n.length > EDIT_HISTORY_MAX) n = n.slice(n.length - EDIT_HISTORY_MAX);
      return n;
    });
    setRedoHistory([]);
    if (!activeTool && !partialStitchTool) setBrushAndActivate("paint");
  }

  function removeScratchColour(id) {
    setScratchPalette(function(prev) { return prev.filter(function(p) { return p.id !== id; }); });
    setPal(function(prev) { return prev ? prev.filter(function(p) { return p.id !== id; }) : prev; });
    setCmap(function(prev) { if (!prev) return prev; var n = Object.assign({}, prev); delete n[id]; return n; });
  }

  function removeUnusedColours() {
    if (!pal) return;
    var unused = pal.filter(function(p) { return p.count === 0; });
    if (!unused.length) return;
    var unusedIds = new Set(unused.map(function(p) { return p.id; }));
    var removedFromScratch = scratchPalette.filter(function(p) { return unusedIds.has(p.id); });
    setEditHistory(function(prev) {
      var n = prev.concat([{ type: "remove_unused_colours", removedFromPal: unused.slice(), removedFromScratch: removedFromScratch.slice() }]);
      if (n.length > EDIT_HISTORY_MAX) n = n.slice(n.length - EDIT_HISTORY_MAX);
      return n;
    });
    setRedoHistory([]);
    setPal(function(prev) { return prev ? prev.filter(function(p) { return !unusedIds.has(p.id); }) : prev; });
    setScratchPalette(function(prev) { return prev.filter(function(p) { return !unusedIds.has(p.id); }); });
    setCmap(function(prev) { if (!prev) return prev; var n = Object.assign({}, prev); unusedIds.forEach(function(id) { delete n[id]; }); return n; });
    addToast("Removed " + unused.length + " unused colour" + (unused.length !== 1 ? "s" : "") + " from palette", { type: "info", duration: 2000 });
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
    // Polish 13 step 4a — snapshot the source values that produced this
    // pattern so the Dimensions / Palette tabs can detect drift and
    // surface a "Re-generate (values changed)" CTA. Stored fields must
    // match the comparator in Sidebar.js (genStaleReason).
    setLastGenSnapshot({
      sW: sW, sH: sH, fabricCt: fabricCt, maxC: maxC,
      bri: bri, con: con, sat: sat, dith: dith, dithMode: dithMode,
      allowBlends: allowBlends, skipBg: skipBg
    });
    setGenPatSnapshot({ pat: result.mapped.slice(), pal: result.pal.slice(), cmap: Object.assign({}, result.cmap) });
    // Compute cleanup diff mask from preCleanupIds
    setShowCleanupDiff(false);
    if (result.preCleanupIds && result.preCleanupIds.length === result.mapped.length) {
      var mask = new Uint8Array(result.mapped.length);
      var count = 0;
      var byColour = {};
      for (var di = 0; di < result.mapped.length; di++) {
        var preId = result.preCleanupIds[di];
        var postId = result.mapped[di].id;
        if (preId !== postId && preId !== "__skip__") {
          mask[di] = 1;
          count++;
          byColour[postId] = (byColour[postId] || 0) + 1;
        }
      }
      setCleanupDiff(count > 0 ? { mask: mask, count: count, byColour: byColour } : null);
    } else {
      setCleanupDiff(null);
    }
    if (!hasGenerated) {
      setDimOpen(false); setPalOpen(false); setFabOpen(false);
      setAdjOpen(false); setBgOpen(false); setCleanupOpen(false);
      setHasGenerated(true);
      // Auto-switch to Edit mode on the *first* successful generation. Saving
      // already happens automatically (see useProjectIO.js auto-save effect),
      // and the previous "Edit Pattern →" button caused confusion because
      // users assumed they had to click it before the pattern was persisted.
      // Regenerations stay in the current mode so power users tweaking image
      // settings aren't bounced back and forth.
      setAppMode("edit");
      setSidebarTab("palette");
    }
    var z = Math.min(3, Math.max(0.05, 750 / (sW * 20)));
    setTimeout(function() { setZoom(z); }, 0);
    setBusy(false);
    // Toast on successful generation. Mentions the phase flip so users
    // notice the sidebar tabs and canvas tools have changed; the action
    // bar's "< Setup" button is the way back. (Polish B.)
    var colCount = result.pal ? result.pal.length : 0;
    addToast("Pattern generated and saved \u2014 now editing (" + sW + "\u00D7" + sH + ", " + colCount + " colours). Use the Setup button to revisit image, dimensions, or palette.", {type:"success", duration:5000});
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

  var generate = useCallback(function(overrides) {
    if (!img) return;
    setBusy(true); setHiId(null); setExportPage(0);
    var reqId = ++genReqIdRef.current;

    var _seed   = (overrides && overrides.seed   != null)      ? overrides.seed   : variationSeed;
    var _subset = (overrides && overrides.subset !== undefined) ? overrides.subset : variationSubset;

    // Build allowed palette from stash when stash-constrained mode is on.
    // Funnels through the central _buildAllowedPaletteFromStash so the
    // generate path and the preview/conversionSettings path stay consistent
    // and brand-aware (DMC + Anchor + future brands).
    var allowedPalette = null;
    var effMaxC = maxC;
    var effAllowBlends = allowBlends;
    if (stashConstrained && globalStash) {
      if (_subset !== null) {
        allowedPalette = _subset;
      } else {
        var stashInfo = _buildAllowedPaletteFromStash(globalStash, null);
        allowedPalette = stashInfo.palette;
      }
      if (!allowedPalette || allowedPalette.length === 0) {
        addToast("Your stash is empty — add threads to use stash-only mode.", {type: "warning", duration: 3000});
        setBusy(false);
        return;
      }
      if (allowedPalette.length < 3) {
        addToast("Only " + allowedPalette.length + " thread(s) in stash — results may be limited.", {type: "warning", duration: 3000});
      }
      effMaxC = Math.min(maxC, allowedPalette.length);
      if (allowedPalette.length < 6) effAllowBlends = false;
    }

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
              sW: sW, sH: sH, maxC: effMaxC, bri: bri, con: con, sat: sat,
              dith: dith, skipBg: skipBg, bgCol: bgCol, bgTh: bgTh,
              minSt: minSt, smooth: smooth, smoothType: smoothType,
              stitchCleanup: stitchCleanup, orphans: orphans, allowBlends: effAllowBlends,
              allowedPalette: allowedPalette, seed: _seed,
            });
            if (!result) { setBusy(false); return; }
            applyResultRef.current({ reqId: reqId, mapped: result.pat, pal: result.pal, cmap: result.cmap, confettiData: result.confettiData, preCleanupIds: result.preCleanupIds });
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
          maxC: effMaxC, dith: dith, dithStrength: dithStrength, allowBlends: effAllowBlends,
          skipBg: skipBg, bgCol: bgCol, bgTh: bgTh,
          minSt: minSt, smooth: smooth, smoothType: smoothType,
          stitchCleanup: stitchCleanup, orphans: orphans,
          allowedPalette: allowedPalette, seed: _seed,
        },
      }, [imageData.data.buffer]);
    };

    if (typeof requestAnimationFrame === 'function') {
      requestAnimationFrame(startGeneration);
    } else {
      setTimeout(startGeneration, 0);
    }
  }, [img, sW, sH, maxC, bri, con, sat, dithMode, skipBg, bgCol, bgTh, minSt, smooth, smoothType, stitchCleanup, orphans, hasGenerated, allowBlends, stashConstrained, globalStash, variationSeed, variationSubset]);

  // ─── Variation helpers: seeded Fisher-Yates shuffle → roulette subset ───────
  function _buildRoulette(pool, n, seed) {
    var s = seed >>> 0;
    function _rng() { s += 0x6D2B79F5; var t = s; t = Math.imul(t ^ t>>>15, t|1); t ^= t + Math.imul(t ^ t>>>7, t|61); return ((t ^ t>>>14) >>> 0) / 4294967296; }
    var arr = pool.slice();
    for (var i = arr.length - 1; i > 0; i--) { var j = Math.floor(_rng() * (i + 1)); var tmp = arr[i]; arr[i] = arr[j]; arr[j] = tmp; }
    return arr.slice(0, n);
  }

  var randomise = useCallback(function() {
    if (!stashConstrained || !img) return;
    var newSeed = ((Math.random() * 0xFFFFFFFE) + 1) >>> 0;
    // Brand-aware via the central helper (DMC + Anchor + future brands).
    var pool = _buildAllowedPaletteFromStash(globalStash, null).threads;
    if (!pool.length) return;
    var effN = Math.min(maxC, pool.length);
    // Always sub-sample so the selected colour set changes even when stash <= maxC.
    // Use ~75% of pool (minimum 2) so each click genuinely picks different threads.
    var rouletteN = pool.length > effN ? effN : Math.max(2, Math.round(pool.length * 0.75));
    var newSubset = (pool.length >= 3) ? _buildRoulette(pool, rouletteN, newSeed) : null;
    // Save effective seed so history entries can always be restored
    var effectivePrevSeed = variationSeed != null ? variationSeed : 1337;
    if (previewUrl) {
      setVariationHistory(function(h) { return [{seed: effectivePrevSeed, subset: variationSubset, previewUrl: previewUrl, timestamp: Date.now()}].concat(h).slice(0, 8); });
    }
    // Prevent the first-generate panel-collapse when Randomise is used before Generate
    if (!hasGenerated) setHasGenerated(true);
    setVariationSeed(newSeed);
    setVariationSubset(newSubset);
    generate({seed: newSeed, subset: newSubset});
  }, [stashConstrained, img, globalStash, maxC, previewUrl, variationSeed, variationSubset, hasGenerated, generate]);

  var applyVariationSeed = useCallback(function(seed, subset) {
    var s = (seed != null ? seed : 1337) >>> 0;
    var effectivePrevSeed = variationSeed != null ? variationSeed : 1337;
    if (previewUrl) {
      setVariationHistory(function(h) { return [{seed: effectivePrevSeed, subset: variationSubset, previewUrl: previewUrl, timestamp: Date.now()}].concat(h).slice(0, 8); });
    }
    setVariationSeed(s);
    setVariationSubset(subset !== undefined ? subset : null);
    generate({seed: s, subset: subset !== undefined ? subset : null});
  }, [variationSeed, variationSubset, previewUrl, generate]);

  var promoteVariation = useCallback(function(slot) {
    if (previewUrl) {
      setVariationHistory(function(h) { return [{seed: variationSeed, subset: variationSubset, previewUrl: previewUrl, timestamp: Date.now()}].concat(h).slice(0, 8); });
    }
    setVariationSeed(slot.seed);
    setVariationSubset(slot.subset || null);
    generate({seed: slot.seed, subset: slot.subset || null});
  }, [variationSeed, variationSubset, previewUrl, generate]);

  var generateGallery = useCallback(function() {
    if (!img || !stashConstrained) return;
    var newSeeds = [0, 1, 2, 3].map(function() { return ((Math.random() * 0xFFFFFFFE) + 1) >>> 0; });
    // Brand-aware via the central helper.
    var pool = _buildAllowedPaletteFromStash(globalStash, null).threads;
    if (!pool.length) return;
    setGallerySlots(newSeeds.map(function(s) { return {seed: s, loading: true, url: null, threadCount: 0, subset: null}; }));
    var effN = Math.min(maxC, pool.length);
    var rouletteN = pool.length > effN ? effN : Math.max(2, Math.round(pool.length * 0.75));
    var useRoulette = pool.length >= 3;
    function genSlot(slotIdx) {
      if (slotIdx >= newSeeds.length) return;
      var slotSeed = newSeeds[slotIdx];
      setTimeout(function() {
        var slotSubset = useRoulette ? _buildRoulette(pool, rouletteN, slotSeed) : pool;
        var MAX_GAL = 2500;
        var gw = sW, gh = sH;
        if (gw * gh > MAX_GAL) { var sc = Math.sqrt(MAX_GAL / (gw * gh)); gw = Math.max(4, Math.round(gw * sc)); gh = Math.max(4, Math.round(gh * sc)); }
        var cv = document.createElement("canvas"); cv.width = gw; cv.height = gh;
        var gcx = cv.getContext("2d");
        gcx.filter = "brightness(" + (100 + bri) + "%) contrast(" + (100 + con) + "%) saturate(" + (100 + sat) + "%)";
        gcx.drawImage(img, 0, 0, gw, gh); gcx.filter = "none";
        var rawPx = gcx.getImageData(0, 0, gw, gh).data;
        if (smooth > 0) { if (smoothType === "gaussian") applyGaussianBlur(rawPx, gw, gh, smooth); else applyMedianFilter(rawPx, gw, gh, smooth); }
        var res = runCleanupPipeline(rawPx, gw, gh, {
          maxC: effN, dith: dith, dithStrength: dithStrength, allowBlends: allowBlends && slotSubset.length >= 6,
          skipBg: skipBg, bgCol: bgCol, bgTh: bgTh, stitchCleanup: stitchCleanup, orphans: orphans,
          allowedPalette: slotSubset, seed: slotSeed,
        });
        var slotUrl = null, usedCt = 0;
        if (res) {
          var oc = document.createElement("canvas"); oc.width = gw; oc.height = gh;
          var ocx = oc.getContext("2d"); var od = ocx.createImageData(gw, gh); var oarr = od.data;
          var usedSet = new Set();
          for (var k = 0; k < res.mapped.length; k++) {
            var mm = res.mapped[k]; var ix = k * 4;
            if (mm.id === "__skip__") { oarr[ix]=240; oarr[ix+1]=240; oarr[ix+2]=240; oarr[ix+3]=255; }
            else { oarr[ix]=mm.rgb[0]; oarr[ix+1]=mm.rgb[1]; oarr[ix+2]=mm.rgb[2]; oarr[ix+3]=255; usedSet.add(mm.id); }
          }
          ocx.putImageData(od, 0, 0);
          slotUrl = oc.toDataURL();
          usedCt = usedSet.size;
        }
        setGallerySlots(function(prev) {
          var next = prev.slice();
          next[slotIdx] = {seed: slotSeed, loading: false, url: slotUrl, threadCount: usedCt, subset: slotSubset};
          return next;
        });
        genSlot(slotIdx + 1);
      }, 0);
    }
    genSlot(0);
  }, [img, sW, sH, maxC, bri, con, sat, dithMode, skipBg, bgCol, bgTh, smooth, smoothType, stitchCleanup, orphans, allowBlends, stashConstrained, globalStash]);

  // Terminate the worker when the component unmounts to prevent memory leaks
  useEffect(function() {
    return function() {
      if (workerRef.current && workerRef.current !== 'unavailable') {
        workerRef.current.terminate();
        workerRef.current = null;
      }
    };
  }, []);

  // QW4: Colour coverage gap analysis — runs when image or stash palette changes
  useEffect(function() {
    if (!stashConstrained || !img || !img.src) { setCoverageGaps(null); return; }
    // Brand-aware via the central helper.
    var stashPal = _buildAllowedPaletteFromStash(globalStash, null).threads;
    if (!stashPal.length) { setCoverageGaps(null); return; }
    var timer = setTimeout(function() {
      if (typeof analyseColourCoverage === 'function') {
        setCoverageGaps(analyseColourCoverage(img, stashPal));
      }
    }, 300);
    return function() { clearTimeout(timer); };
  }, [stashConstrained, img, globalStash]);

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
    genPatSnapshot: genPatSnapshot,
  });

  // ─── Magic Wand integration ──────────────────────────────────────────────────
  var wand = useMagicWand({
    pat: pat, cmap: cmap, sW: sW, sH: sH, fabricCt: fabricCt,
    bsLines: bsLines, setBsLines: setBsLines,
    editHistory: editHistory, setEditHistory: setEditHistory,
    setRedoHistory: setRedoHistory, EDIT_HISTORY_MAX: EDIT_HISTORY_MAX,
    setPat: setPat, setPal: setPal, setCmap: setCmap,
    addToast: addToast,
    buildPaletteWithScratch: buildPaletteWithScratch,
  });
  // Keep wandClearRef updated each render so resetAll() can call it
  wandClearRef.current = wand.clearSelection;

  var lasso = useLassoSelect({
    pat: pat, cmap: cmap, sW: sW, sH: sH,
    selectionMask: wand.selectionMask, setSelectionMask: wand.setSelectionMask,
  });
  lassoCancelRef.current = lasso.cancelLasso;

  // Syncs op mode across both selection tools
  function setSelectionOpMode(mode) {
    wand.setWandOpMode(mode);
    lasso.setLassoOpMode(mode);
  }

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
    dith, dithMode, dithStrength, setDith, setDithMode, skipBg, setSkipBg, bgTh, setBgTh, bgCol, setBgCol,
    pickBg, setPickBg, minSt, setMinSt, smooth, setSmooth, smoothType, setSmoothType,
    orphans, setOrphans, allowBlends, setAllowBlends,
    pat, setPat, pal, setPal, cmap, setCmap, busy, setBusy,
    origW, setOrigW, origH, setOrigH,
    fabricCt, setFabricCt, skeinPrice, setSkeinPrice, stitchSpeed, setStitchSpeed,
    appMode, setAppMode, sidebarTab, setSidebarTab,
    lastGenSnapshot, setLastGenSnapshot,
    tab, setTab, materialsTab, setMaterialsTab, sidebarOpen, setSidebarOpen, loadError, setLoadError,
    copied, setCopied, modal, setModal,
    view, setView, zoom, setZoom, hiId, setHiId, showCtr, setShowCtr,
    showOverlay, setShowOverlay, overlayOpacity, setOverlayOpacity,
    previewActive, setPreviewActive, previewShowGrid, setPreviewShowGrid, previewFabricBg, setPreviewFabricBg,
    previewMode, setPreviewMode, realisticLevel, setRealisticLevel, coverageOverride, setCoverageOverride,
    fabricColour, setFabricColour, canvasTexture,
    splitPaneEnabled, setSplitPaneEnabled, splitPaneRatio, setSplitPaneRatio,
    splitPaneSyncEnabled, setSplitPaneSyncEnabled, rightPaneMode, setRightPaneMode,
    bgDimOpacity, setBgDimOpacity, hiAdvanced, setHiAdvanced,
    bgDimDesaturation, setBgDimDesaturation, dimFraction, dimHiId,
    highlightMode, setHighlightMode,
    tintColor, setTintColor, tintOpacity, setTintOpacity,
    spotDimOpacity, setSpotDimOpacity, antsOffset, setAntsOffset,
    dimOpen, setDimOpen, palOpen, setPalOpen, fabOpen, setFabOpen,
    adjOpen, setAdjOpen, bgOpen, setBgOpen, palAdvanced, setPalAdvanced,
    cleanupOpen, setCleanupOpen, stitchCleanup, setStitchCleanup,
    hasGenerated, setHasGenerated, isCropping, setIsCropping,
    cropRect, setCropRect, cropStartRef, cropRef,
    activeTool, setActiveTool, activeToolRef, previousToolRef,
    bsLines, setBsLines, bsStart, setBsStart,
    bsContinuous, setBsContinuous, selectedColorId, setSelectedColorId,
    hoverCoords, setHoverCoords, editHistory, setEditHistory,
    redoHistory, setRedoHistory, EDIT_HISTORY_MAX,
    shortcutsHintDismissed, setShortcutsHintDismissed,
    brushMode, setBrushMode, brushModeRef, brushSize, setBrushSize,
    overflowOpen, setOverflowOpen, panelOpen, setPanelOpen, stripCollapsed, setStripCollapsed,
    exportPage, setExportPage, pageMode, setPageMode,
    pdfDisplayMode, setPdfDisplayMode, pdfCellSize, setPdfCellSize,
    pdfSinglePage, setPdfSinglePage,
    done, setDone, isScratchMode, setIsScratchMode,
    scratchPalette, setScratchPalette, dmcSearch, setDmcSearch,
    colPickerOpen, setColPickerOpen, parkMarkers, setParkMarkers,
    hlRow, setHlRow, hlCol, setHlCol, totalTime, setTotalTime,
    sessions, setSessions, partialStitches, setPartialStitches,
    partialStitchTool, setPartialStitchTool, partialStitchToolRef, threadOwned, setThreadOwned,
    globalStash, setGlobalStash, kittingResult, setKittingResult,
    altOpen, setAltOpen,
    adaptModalOpen, setAdaptModalOpen,
    adaptModalMode, setAdaptModalMode,
    adaptMaxDeltaE, setAdaptMaxDeltaE,
    stashConstrained, setStashConstrained,
    creatorStashFilter, setCreatorStashFilter,
    coverageGaps, setCoverageGaps,
    variationSeed, setVariationSeed,
    variationSubset, setVariationSubset,
    variationHistory, setVariationHistory,
    gallerySlots, galleryOpen, setGalleryOpen,
    previewUrl, setPreviewUrl,
    previewStats, setPreviewStats, confettiData, setConfettiData,
    previewHeatmap, setPreviewHeatmap,
    previewMapped, setPreviewMapped, previewColors, setPreviewColors,
    previewDims, setPreviewDims, previewHighlight, setPreviewHighlight,
    previewLoading, setPreviewLoading,
    previewTimerRef, projectName, setProjectName,
    projectDesigner, setProjectDesigner,
    projectDescription, setProjectDescription,
    namePromptOpen, setNamePromptOpen,
    saveStatus, setSaveStatus,
    savedAt, setSavedAt,
    saveError, setSaveError,
    nameModalReason, setNameModalReason,
    preferencesOpen, setPreferencesOpen,
    cleanupDiff, setCleanupDiff, showCleanupDiff, setShowCleanupDiff,
    pcRef, fRef, scrollRef, expRef, loadRef,
    prevSW, prevSH, projectIdRef, createdAtRef, trackerFieldsRef, userActedRef, stripRef, overflowRef,
    G, EDIT_HISTORY_MAX,
    // Derived
    totalStitchable, cs, fitZ, pxX, pxY, totPg,
    skeinData, totalSkeins, blendCount, difficulty, doneCount, dmcFiltered,
    displayPal, progressPct, colourDoneCounts, stitchType,
    ownedCount, toBuyCount, toBuyList,

    // Stash-constrained derived values (QW1, QW3, QW8)
    stashThreadCount: useMemo(function() {
      if (!stashConstrained || !globalStash) return null;
      return _buildAllowedPaletteFromStash(globalStash, null).count;
    }, [stashConstrained, globalStash]),

    effectiveMaxC: useMemo(function() {
      if (!stashConstrained) return maxC;
      var count = _buildAllowedPaletteFromStash(globalStash, null).count;
      return count === 0 ? maxC : Math.min(maxC, count);
    }, [stashConstrained, globalStash, maxC]),

    stashPalette: useMemo(function() {
      if (!stashConstrained || !globalStash) return null;
      var threads = _buildAllowedPaletteFromStash(globalStash, null).threads;
      var entries = threads.map(function(t, i) {
        var key = (t.brand || 'dmc') + ':' + t.id;
        return {
          id: t.id, name: t.name, rgb: t.rgb,
          owned: (globalStash[key] && globalStash[key].owned) || 0,
        };
      });
      entries.sort(function(a, b) {
        var hA = (typeof hueFromRgb !== 'undefined') ? hueFromRgb(a.rgb) : 0;
        var hB = (typeof hueFromRgb !== 'undefined') ? hueFromRgb(b.rgb) : 0;
        return hA - hB;
      });
      return entries;
    }, [stashConstrained, globalStash]),

    blendsAutoDisabled: useMemo(function() {
      if (!stashConstrained) return false;
      return _buildAllowedPaletteFromStash(globalStash, null).count < 6;
    }, [stashConstrained, globalStash]),

    effectiveAllowBlends: useMemo(function() {
      if (!stashConstrained) return allowBlends;
      var count = _buildAllowedPaletteFromStash(globalStash, null).count;
      if (count < 6) return false;
      return allowBlends;
    }, [stashConstrained, globalStash, allowBlends]),

    // ─── Canonical conversion settings bundle ────────────────────────────────
    // ALL conversion settings flow through this useMemo. Any code path that
    // generates pixels (preview, full Generate, gallery, worker) MUST consume
    // this object instead of pulling individual state fields. See
    // CONVERSION_STATE_KEYS at the top of this file for the full manifest.
    conversionSettings: useMemo(function() {
      var stashInfo = stashConstrained
        ? _buildAllowedPaletteFromStash(globalStash, variationSubset)
        : { palette: null, count: 0, threads: [] };
      var effMaxC = stashConstrained && stashInfo.count > 0
        ? Math.min(maxC, stashInfo.count)
        : maxC;
      var effAllowBlends = stashConstrained && stashInfo.count < 6
        ? false
        : allowBlends;
      return Object.freeze({
        // Geometry
        sW: sW, sH: sH,
        // Image adjustments
        bri: bri, con: con, sat: sat,
        smooth: smooth, smoothType: smoothType,
        // Quantisation
        maxC: effMaxC,
        dith: dith, dithMode: dithMode, dithStrength: dithStrength,
        allowBlends: effAllowBlends,
        allowedPalette: stashInfo.palette,
        // Background
        skipBg: skipBg, bgCol: bgCol, bgTh: bgTh,
        // Cleanup
        minSt: minSt, stitchCleanup: stitchCleanup, orphans: orphans,
        // Variation
        seed: variationSeed, subset: variationSubset,
        // Fabric (for stats, not pixels)
        fabricCt: fabricCt,
        // UI / diagnostic flags
        stashConstrained: stashConstrained,
        stashCount: stashInfo.count,
      });
    }, [
      sW, sH, bri, con, sat, smooth, smoothType,
      maxC, dith, dithMode, dithStrength, allowBlends,
      skipBg, bgCol, bgTh, minSt, stitchCleanup, orphans,
      stashConstrained, globalStash, variationSeed, variationSubset, fabricCt,
    ]),
    // Functions
    buildPaletteWithScratch, chgW, chgH, slRsz, selectStitchType,
    setBrushAndActivate, setTool, setHsTool, setPsTool: setHsTool, fitZ, copyText,
    resetAll, initBlankGrid, startScratch, addScratchColour, removeScratchColour, removeUnusedColours,
    toggleOwned, generate, randomise, generateGallery, promoteVariation, applyVariationSeed,
    // Eyedropper feedback
    eyedropperEmpty, setEyedropperEmpty,
    // Context menu
    contextMenu, setContextMenu,
    // Toast notifications
    toasts, addToast, dismissToast,
    // Selection modifier key state (null | "add" | "subtract" | "intersect")
    selectionModifier, setSelectionModifier,
    // PaletteSwap
    paletteSwap,
    genPatSnapshot, setGenPatSnapshot,
    // Magic Wand
    selectionMask: wand.selectionMask, setSelectionMask: wand.setSelectionMask,
    wandTolerance: wand.wandTolerance, setWandTolerance: wand.setWandTolerance,
    wandContiguous: wand.wandContiguous, setWandContiguous: wand.setWandContiguous,
    wandOpMode: wand.wandOpMode, setWandOpMode: wand.setWandOpMode,
    setSelectionOpMode: setSelectionOpMode,
    wandPanel: wand.wandPanel, setWandPanel: wand.setWandPanel,
    confettiThreshold: wand.confettiThreshold, setConfettiThreshold: wand.setConfettiThreshold,
    confettiPreview: wand.confettiPreview, setConfettiPreview: wand.setConfettiPreview,
    reduceTarget: wand.reduceTarget, setReduceTarget: wand.setReduceTarget,
    reducePreview: wand.reducePreview, setReducePreview: wand.setReducePreview,
    replaceSource: wand.replaceSource, setReplaceSource: wand.setReplaceSource,
    replaceDest: wand.replaceDest, setReplaceDest: wand.setReplaceDest,
    replaceFuzzy: wand.replaceFuzzy, setReplaceFuzzy: wand.setReplaceFuzzy,
    replaceFuzzyTol: wand.replaceFuzzyTol, setReplaceFuzzyTol: wand.setReplaceFuzzyTol,
    outlineColor: wand.outlineColor, setOutlineColor: wand.setOutlineColor,
    applyWandSelect: wand.applyWandSelect, clearSelection: wand.clearSelection,
    invertSelection: wand.invertSelection, selectAll: wand.selectAll,
    selectAllOfColorId: wand.selectAllOfColorId,
    previewConfettiCleanup: wand.previewConfettiCleanup,
    applyConfettiCleanup: wand.applyConfettiCleanup,
    previewColorReduction: wand.previewColorReduction,
    applyColorReduction: wand.applyColorReduction,
    selectionReplaceColorCount: wand.selectionReplaceColorCount,
    applyColorReplacement: wand.applyColorReplacement,
    applyGlobalColorReplacement: wand.applyGlobalColorReplacement,
    colourReplaceModal, setColourReplaceModal,
    selectionStats: wand.selectionStats,
    applyOutlineGeneration: wand.applyOutlineGeneration,
    selectionCount: wand.selectionCount, hasSelection: wand.hasSelection,
    // Lasso Select
    lassoMode: lasso.lassoMode, setLassoMode: lasso.setLassoMode,
    lassoPoints: lasso.lassoPoints, setLassoPoints: lasso.setLassoPoints,
    lassoActive: lasso.lassoActive, setLassoActive: lasso.setLassoActive,
    lassoCursor: lasso.lassoCursor, setLassoCursor: lasso.setLassoCursor,
    lassoPreviewMask: lasso.lassoPreviewMask, setLassoPreviewMask: lasso.setLassoPreviewMask,
    lassoOpMode: lasso.lassoOpMode, setLassoOpMode: lasso.setLassoOpMode,
    lassoPointCount: lasso.lassoPointCount, lassoInProgress: lasso.lassoInProgress,
    startLasso: lasso.startLasso, extendLasso: lasso.extendLasso,
    finalizeLasso: lasso.finalizeLasso, cancelLasso: lasso.cancelLasso,
    isNearStart: lasso.isNearStart,
    lassoLinePath: lasso.bresenham,
    lassoMagneticPath: lasso.magneticPath,
    lassoBoundaryPath: lasso.buildBoundaryPath,
  };
};
