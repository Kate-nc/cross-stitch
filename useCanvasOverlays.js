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

  window.useCanvasOverlays = function useCanvasOverlays({ sW }) {
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
    const[stitchZoom,setStitchZoom]=useState(1);
    useEffect(()=>{stitchZoomRef.current=stitchZoom;},[stitchZoom]);

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
    const scs=useMemo(()=>Math.max(2,Math.round(20*stitchZoom)),[stitchZoom]);
    const fitSZ=useCallback(()=>setStitchZoom(Math.min(3,Math.max(0.05,750/(sW*20)))),[sW]);

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
      scs, fitSZ,
    };
  };
})();
