/* useCanvasOverlays.js — Phase B step C: Canvas-overlay display settings hook.
   ═══════════════════════════════════════════════════════════════════════════════
   Extracted from TrackerApp. Holds all rendering-preference state and refs for
   the stitch canvas: view mode, zoom, highlight mode, tint/dim levels, fabric
   colour, texture, counting-aid settings, and per-overlay canvas refs.

   Loaded as a plain <script> before tracker-app.js.
   Exposes window.useCanvasOverlays.

   API
   ───
     const { stitchView, setStitchView, stitchZoom, setStitchZoom, stitchZoomRef,
             highlightMode, setHighlightMode, tintColor, setTintColor,
             ... (see return) } = window.useCanvasOverlays({ sW });     */
(function () {
  'use strict';

  var R = (typeof window !== 'undefined' && window.React) || null;

  /* ── Canvas backing-store ceiling ───────────────────────────────────────
     The chart and every overlay size their backing store to the *whole*
     pattern at the current zoom (sW*scs+G+2 x sH*scs+G+2 — see the
     canvas.width assignments in tracker-app.js). Browsers cap how large a
     single canvas may be, and mobile caps are far lower than desktop ones:
     iOS Safari refuses anything over 16,777,216 px^2 (~4096x4096) and many
     mobile GPUs cannot texture a surface wider than 4096 px. Neither throws
     — the canvas just renders blank while the tab thrashes memory, which is
     what "the chart froze and went white" looks like on a phone.

     So we derive a per-device cell-size ceiling and expose it as a zoom
     ceiling. Clamping the *zoom* rather than `scs` alone keeps `scs`, the
     zoom read-out and the pinch/wheel scroll maths agreeing with each other
     (they all derive from stitchZoom); `scs` is clamped too as a backstop in
     case some future path writes the zoom without going through the setter.

     The limit is probed rather than hardcoded so desktop keeps its current
     maximum zoom — the probe costs three 1-px-tall canvases (<64 KB total),
     which is why we measure the side limit and infer the area budget from it
     rather than allocating a square. */
  var GRID_GUTTER  = 28;   // must match `const G` in tracker-app.js
  var SCS_MIN      = 2;    // matches the existing Math.max(2, ...) floor
  var SCS_PER_ZOOM = 20;   // scs = round(20 * stitchZoom)
  var ZOOM_MAX     = 4;    // matches the existing wheel/pinch/button ceiling

  /* ── Concurrency ────────────────────────────────────────────────────────
     The budget below is a *device* budget: it is what the browser will hold
     across every canvas on the page, not what one canvas may take. The
     tracker mounts the chart plus up to five overlays (thread usage,
     recommendations, breadcrumbs, focus block, counting aids) on identical
     geometry, so charging the whole budget to each one over-commits by up to
     6x. A highlight session with counting aids and a focus block on is four
     canvases, which is the number we budget for; the two rarer overlays are
     covered by the headroom between four and six.

     Raise this if more full-geometry canvases are added; lower it only if
     they are genuinely consolidated. tests/chartCanvasBudget.test.js asserts
     the count against the mounted refs so the two cannot drift apart. */
  var CONCURRENT_CHART_CANVASES = 4;

  /* Pixels of pre-rendered margin around the viewport on a tiled chart. Also
     the figure the budget check below uses to decide whether a tile is
     affordable, so tracker-app.js reads it from here rather than keeping its
     own copy. */
  var TILE_OVERSCAN = 300;

  var _limits = null;
  function canvasLimits() {
    if (_limits) return _limits;
    var side = 4096;
    try {
      // 1-px-tall probes: allocating 16384x1 costs 64 KB, not 1 GB.
      var candidates = [16384, 8192, 4096];
      for (var i = 0; i < candidates.length; i++) {
        var c = document.createElement('canvas');
        c.width = candidates[i]; c.height = 1;
        var cx = c.getContext('2d');
        if (!cx) continue;
        cx.fillStyle = '#fff';
        cx.fillRect(candidates[i] - 1, 0, 1, 1);
        // A canvas over the limit is silently resized or refuses to paint.
        if (c.width === candidates[i] && cx.getImageData(candidates[i] - 1, 0, 1, 1).data[3] === 255) {
          side = candidates[i];
          break;
        }
      }
    } catch (_) { /* probe blocked (private mode / no canvas) — keep 4096 */ }

    /* Area budget. A side limit does not imply the device can afford a
       square of that side (16384^2 would be 1 GB), so budget by memory:
       iOS reports no navigator.deviceMemory, hence the iOS arm.

       That arm used to key on `(pointer: coarse)` alone, which has a hole:
       iPadOS 13.4+ reports the primary pointer as `fine` whenever a Magic
       Keyboard, trackpad or Bluetooth mouse is attached. Such an iPad fell
       through to the *desktop* budget and was handed a ~500 MB canvas — an
       immediate freeze. Platform.isIOS() keys on the platform (and
       disambiguates an iPad reporting a desktop UA via maxTouchPoints), so it
       stays correct however the pointer is reported. The media query remains
       as the fallback because useCanvasOverlays.js is a plain <script> and
       must not depend on helpers.js having loaded first. */
    var mem = (typeof navigator !== 'undefined' && navigator.deviceMemory) || 0;
    var touchLike = false;
    try {
      touchLike = !!(window.Platform && window.Platform.isIOS && window.Platform.isIOS())
               || !!(window.matchMedia && window.matchMedia('(pointer: coarse)').matches);
    } catch (_) {}
    var area;
    if (mem && mem <= 1)        area = 16777216;    // 16.7 Mpx  — low-end phone
    else if (mem && mem <= 4)   area = 33554432;    // 33.5 Mpx  — mid-range phone
    else if (!mem && touchLike) area = 16777216;    // 16.7 Mpx  — iOS (no deviceMemory)
    else                        area = 134217728;   // 134 Mpx   — desktop
    _limits = { side: side, area: Math.min(area, side * side) };
    return _limits;
  }

  /* The share of the device budget one canvas may take (see
     CONCURRENT_CHART_CANVASES). */
  function perCanvasBudget() {
    return Math.floor(canvasLimits().area / CONCURRENT_CHART_CANVASES);
  }

  /* Largest tile the chart will ever allocate on this screen. A tiled canvas
     is `min(whole chart, viewport + 2 x overscan)`, so as the cell size grows
     the tile saturates at a constant that depends only on the screen — which
     is the entire point of tiling. Window dimensions stand in for the
     scroller, which is never larger and is not measurable from here.
     Returns null when there is no window to measure. */
  function maxTileArea() {
    if (typeof window === 'undefined' || !window.innerWidth || !window.innerHeight) return null;
    var w = window.innerWidth + TILE_OVERSCAN * 2;
    var h = window.innerHeight + TILE_OVERSCAN * 2;
    var lim = canvasLimits();
    if (w > lim.side || h > lim.side) return null;
    return w * h;
  }

  /* Largest `scs` for which the chart's backing store stays inside the device
     limits. Returns 0 when the pattern cannot fit at the minimum usable cell
     size, and the uncapped maximum when dimensions are not known yet.

     Two regimes:

     **Tiled** (the normal case). The chart canvas covers the visible slice
     plus overscan, so its area saturates at `maxTileArea()` no matter how far
     the user zooms in. If that constant is affordable then *every* cell size
     is affordable and there is no ceiling to impose — which is what restores
     symbols on large patterns: the old pattern-proportional clamp held a
     400x500 chart at scs 9, below the 13 px Tier 3 threshold, so symbols
     could never render at any zoom.

     **Untiled** (no window to measure, or a screen so large the tile itself
     will not fit). Falls back to the original pattern-proportional clamp, now
     against the per-canvas share of the budget rather than all of it. */
  function maxCellSize(sW, sH) {
    var ceiling = SCS_PER_ZOOM * ZOOM_MAX;
    if (!sW || !sH) return ceiling;
    var lim = canvasLimits();
    var pad = GRID_GUTTER + 2;
    var budget = perCanvasBudget();

    var tile = maxTileArea();
    if (tile !== null && tile <= budget) {
      // The tile never exceeds the whole chart, so a chart smaller than the
      // tile is its own bound and needs no clamp either.
      return ceiling;
    }

    var scs = Math.min(
      Math.floor((lim.side - pad) / sW),
      Math.floor((lim.side - pad) / sH),
      Math.floor(Math.sqrt(budget / (sW * sH)))
    );
    // sqrt() ignores the gutter, so step down until the exact area fits.
    while (scs > 0 && (sW * scs + pad) * (sH * scs + pad) > budget) scs--;
    return Math.max(0, Math.min(ceiling, scs));
  }

  /* Exposed for tests and for the canvas-budget regression guard. The tiled
     renderer in tracker-app.js reads the overscan and the per-canvas budget
     from here so the geometry it allocates and the budget that authorised it
     cannot drift apart. */
  window.canvasSizeLimits = canvasLimits;
  window.maxChartCellSize = maxCellSize;
  window.chartTileOverscan = TILE_OVERSCAN;
  window.chartPerCanvasBudget = perCanvasBudget;
  window.__resetCanvasLimits = function () { _limits = null; };

  window.useCanvasOverlays = function useCanvasOverlays({ sW, sH }) {
    var useState    = R.useState;
    var useRef      = R.useRef;
    var useEffect   = R.useEffect;
    var useMemo     = R.useMemo;
    var useCallback = R.useCallback;

    // Highlight mode intro hint (Option 4)
    const[hlIntroSeen,setHlIntroSeen]=useState(()=>{try{return !!localStorage.getItem("cs_hlIntroSeen");}catch(_){return false;}});
    const[hlIntroBannerVisible,setHlIntroBannerVisible]=useState(false);
    const hlIntroTimerRef=useRef(null);

    const[stitchView,setStitchView]=useState(()=>{try{var v=window.UserPrefs&&window.UserPrefs.get("trackerDefaultView");return (v==="symbol"||v==="colour"||v==="highlight")?v:"symbol";}catch(_){return "symbol";}});
    // Persist sticky "default view" so the choice survives reloads (mirrors
    // the highlight-mode behaviour) — the prefs UI reads/writes the same key.
    useEffect(()=>{try{if(window.UserPrefs)window.UserPrefs.set("trackerDefaultView",stitchView);}catch(_){}},[stitchView]);
    // stitchZoomRef declared before the mirror-effect so the closure captures it
    const stitchZoomRef=useRef(1);
    const[stitchZoom,_setStitchZoom]=useState(1);
    useEffect(()=>{stitchZoomRef.current=stitchZoom;},[stitchZoom]);

    // Highest zoom whose chart canvas still fits this device (see maxCellSize).
    // Kept in a ref as well so the setter wrapper below stays referentially
    // stable — it is passed straight into onClick handlers and effect deps.
    const maxZoom=useMemo(()=>Math.max(0.05,Math.min(ZOOM_MAX,maxCellSize(sW,sH)/SCS_PER_ZOOM)),[sW,sH]);
    const maxZoomRef=useRef(maxZoom);
    useEffect(()=>{maxZoomRef.current=maxZoom;},[maxZoom]);
    // Every caller (buttons, shortcuts, pinch, wheel, saved-zoom restore) goes
    // through this, so the clamp cannot be bypassed. Supports both direct
    // values and functional updaters, matching the useState contract.
    const setStitchZoom=useCallback((v)=>{
      _setStitchZoom((prev)=>{
        const next=(typeof v==="function")?v(prev):v;
        if(typeof next!=="number"||!isFinite(next))return prev;
        return Math.min(next,maxZoomRef.current);
      });
    },[]);
    // If the pattern changes to one with a lower ceiling, pull the current
    // zoom down to it rather than leaving an out-of-range value in state.
    useEffect(()=>{_setStitchZoom((z)=>Math.min(z,maxZoom));},[maxZoom]);

    const[highlightSkipDone,setHighlightSkipDone]=useState(()=>{try{var v=window.UserPrefs&&window.UserPrefs.get("trackerHighlightSkipDone");return v!==false;}catch(_){return true;}});
    const[onlyStarted,setOnlyStarted]=useState(()=>{try{return !!(window.UserPrefs&&window.UserPrefs.get("trackerOnlyStarted"));}catch(_){return false;}});
    useEffect(()=>{try{if(window.UserPrefs)window.UserPrefs.set("trackerHighlightSkipDone",highlightSkipDone);}catch(_){}},[highlightSkipDone]);
    useEffect(()=>{try{if(window.UserPrefs)window.UserPrefs.set("trackerOnlyStarted",onlyStarted);}catch(_){}},[onlyStarted]);
    const[trackerDimLevel,setTrackerDimLevel]=useState(()=>{
      try{var pv=window.UserPrefs&&window.UserPrefs.get("trackerDimLevel");if(typeof pv==="number"&&pv>=0&&pv<=1)return pv;}catch(_){}
      try{return parseFloat(localStorage.getItem("cs_trDimLv")||"0.1");}catch(_){return 0.1;}
    });
    useEffect(()=>{try{localStorage.setItem("cs_trDimLv",String(trackerDimLevel));}catch(_){}try{if(window.UserPrefs)window.UserPrefs.set("trackerDimLevel",trackerDimLevel);}catch(_){}},[trackerDimLevel]);
    // color-2 (B3): tracker canvas background fabric colour. Validated as #RRGGBB.
    const[trackerFabricColour,setTrackerFabricColour]=useState(()=>{
      try{var pv=window.UserPrefs&&window.UserPrefs.get("trackerFabricColour");if(typeof pv==="string"&&/^#[0-9a-fA-F]{6}$/.test(pv))return pv;}catch(_){}
      return "#FFFFFF";
    });
    // color-11: thread sheen texture toggle for tracker canvas
    const[trackerCanvasTexture,setTrackerCanvasTexture]=useState(()=>{
      try{return !!(window.UserPrefs&&window.UserPrefs.get("trackerCanvasTexture"));}catch(_){return false;}
    });
    useEffect(()=>{
      function _onTCT(e){if(e&&e.detail&&e.detail.key==="trackerCanvasTexture")setTrackerCanvasTexture(!!e.detail.value);}
      document.addEventListener("cs:prefsChanged",_onTCT);
      return()=>document.removeEventListener("cs:prefsChanged",_onTCT);
    },[]);
    // color-3 (C2): swatch detail popover state — opened when user clicks the
    // small palette swatch in the colours sidebar.
    const[paletteDetail,setPaletteDetail]=useState(null);
    useEffect(()=>{try{if(window.UserPrefs&&/^#[0-9a-fA-F]{6}$/.test(trackerFabricColour))window.UserPrefs.set("trackerFabricColour",trackerFabricColour);}catch(_){}},[trackerFabricColour]);
    const[highlightMode,setHighlightMode]=useState(()=>{
      // Prefer UserPrefs (synced with the prefs modal); fall back to the legacy
      // cs_hlMode key for users created before the pref existed; finally default.
      try{
        var pv=window.UserPrefs&&window.UserPrefs.get("trackerDefaultHighlightMode");
        if(pv==="isolate"||pv==="outline"||pv==="tint"||pv==="spotlight")return pv;
      }catch(_){}
      try{return localStorage.getItem("cs_hlMode")||"isolate";}catch(_){return "isolate";}
    });
    const[tintColor,setTintColor]=useState(()=>{
      try{var pv=window.UserPrefs&&window.UserPrefs.get("trackerTintColour");if(typeof pv==="string"&&/^#[0-9a-f]{6}$/i.test(pv))return pv;}catch(_){}
      try{return localStorage.getItem("cs_tintColor")||"#FFD700";}catch(_){return "#FFD700";}
    });
    const[tintOpacity,setTintOpacity]=useState(()=>{
      try{var pv=window.UserPrefs&&window.UserPrefs.get("trackerTintOpacity");if(typeof pv==="number"&&pv>=0&&pv<=1)return pv;}catch(_){}
      try{return parseFloat(localStorage.getItem("cs_tintOp")||"0.4");}catch(_){return 0.4;}
    });
    const[spotDimOpacity,setSpotDimOpacity]=useState(()=>{
      try{var pv=window.UserPrefs&&window.UserPrefs.get("trackerSpotDimOpacity");if(typeof pv==="number"&&pv>=0&&pv<=1)return pv;}catch(_){}
      try{return parseFloat(localStorage.getItem("cs_spotDimOp")||"0.15");}catch(_){return 0.15;}
    });
    useEffect(()=>{try{localStorage.setItem("cs_tintColor",tintColor);}catch(_){}try{if(window.UserPrefs)window.UserPrefs.set("trackerTintColour",tintColor);}catch(_){}},[tintColor]);
    useEffect(()=>{try{localStorage.setItem("cs_tintOp",String(tintOpacity));}catch(_){}try{if(window.UserPrefs)window.UserPrefs.set("trackerTintOpacity",tintOpacity);}catch(_){}},[tintOpacity]);
    useEffect(()=>{try{localStorage.setItem("cs_spotDimOp",String(spotDimOpacity));}catch(_){}try{if(window.UserPrefs)window.UserPrefs.set("trackerSpotDimOpacity",spotDimOpacity);}catch(_){}},[spotDimOpacity]);
    const[antsOffset,setAntsOffset]=useState(0);
    useEffect(()=>{
      try{localStorage.setItem("cs_hlMode",highlightMode);}catch(_){}
      try{if(window.UserPrefs)window.UserPrefs.set("trackerDefaultHighlightMode",highlightMode);}catch(_){}
    },[highlightMode]);
    // Show one-time intro hint on first entry to Highlight mode (Option 4)
    useEffect(()=>{
      if(stitchView==="highlight"&&!hlIntroSeen){
        setHlIntroBannerVisible(true);
        setHlIntroSeen(true);
        try{localStorage.setItem("cs_hlIntroSeen","1");}catch(_){}
        clearTimeout(hlIntroTimerRef.current);
        hlIntroTimerRef.current=setTimeout(()=>setHlIntroBannerVisible(false),8000);
      }
      if(stitchView!=="highlight")clearTimeout(hlIntroTimerRef.current);
      return()=>clearTimeout(hlIntroTimerRef.current);
    },[stitchView]);

    // ── Counting aids ──
    const[countingAidsEnabled,setCountingAidsEnabled]=useState(()=>{try{return localStorage.getItem("cs_countAids")!=="0";}catch(_){return true;}});
    const[countRunMin,setCountRunMin]=useState(()=>{try{return parseInt(localStorage.getItem("cs_countRunMin")||"3");}catch(_){return 3;}});
    const[countRunDir,setCountRunDir]=useState(()=>{try{return localStorage.getItem("cs_countRunDir")||"h";}catch(_){return"h";}});
    const[countNinjaEnabled,setCountNinjaEnabled]=useState(()=>{try{return localStorage.getItem("cs_countNinja")!=="0";}catch(_){return true;}});
    const countingAidsCanvasRef=useRef(null);
    const countingAidsRafRef=useRef(null);
    useEffect(()=>{try{localStorage.setItem("cs_countAids",countingAidsEnabled?"1":"0");}catch(_){}},[countingAidsEnabled]);
    useEffect(()=>{try{localStorage.setItem("cs_countRunMin",String(countRunMin));}catch(_){}},[countRunMin]);
    useEffect(()=>{try{localStorage.setItem("cs_countRunDir",countRunDir);}catch(_){}},[countRunDir]);
    useEffect(()=>{try{localStorage.setItem("cs_countNinja",countNinjaEnabled?"1":"0");}catch(_){}},[countNinjaEnabled]);

    // ── Canvas overlay refs ──
    const focusOverlayCanvasRef=useRef(null);
    const breadcrumbCanvasRef=useRef(null);
    const threadUsageCanvasRef=useRef(null);
    const[hlRow,setHlRow]=useState(-1);
    const[hlCol,setHlCol]=useState(-1);
    const[selectedColorId,setSelectedColorId]=useState(null);

    // ── Derived rendering values ──
    // The Math.min() is a backstop: setStitchZoom already clamps, so it is a
    // no-op in normal operation, but it guarantees the canvas can never be
    // asked for a size the device will refuse.
    const scs=useMemo(()=>Math.min(Math.max(SCS_MIN,Math.round(SCS_PER_ZOOM*stitchZoom)),maxCellSize(sW,sH)),[stitchZoom,sW,sH]);
    const fitSZ=useCallback(()=>setStitchZoom(Math.min(3,Math.max(0.05,750/(sW*20)))),[sW,setStitchZoom]);

    return {
      stitchView, setStitchView,
      stitchZoom, setStitchZoom, stitchZoomRef,
      highlightSkipDone, setHighlightSkipDone,
      onlyStarted, setOnlyStarted,
      trackerDimLevel, setTrackerDimLevel,
      trackerFabricColour, setTrackerFabricColour,
      trackerCanvasTexture, setTrackerCanvasTexture,
      paletteDetail, setPaletteDetail,
      highlightMode, setHighlightMode,
      tintColor, setTintColor,
      tintOpacity, setTintOpacity,
      spotDimOpacity, setSpotDimOpacity,
      antsOffset, setAntsOffset,
      hlIntroSeen, setHlIntroSeen,
      hlIntroBannerVisible, setHlIntroBannerVisible, hlIntroTimerRef,
      countingAidsEnabled, setCountingAidsEnabled,
      countRunMin, setCountRunMin,
      countRunDir, setCountRunDir,
      countNinjaEnabled, setCountNinjaEnabled,
      countingAidsCanvasRef, countingAidsRafRef,
      focusOverlayCanvasRef, breadcrumbCanvasRef, threadUsageCanvasRef,
      hlRow, setHlRow, hlCol, setHlCol,
      selectedColorId, setSelectedColorId,
      scs, fitSZ, maxZoom,
    };
  };
})();
