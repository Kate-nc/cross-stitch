/* creator-main.js — Main application JSX (CreatorApp + UnifiedApp).
   Loaded via compile-and-cache (see window.loadCreatorMain in index.html).
   Depends on globals set up by all <script> tags that precede it:
   React, ReactDOM, confettiTier, useCreatorState, useEditHistory,
   useCanvasInteraction, useProjectIO, usePreview, useKeyboardShortcuts,
   exportPDF, fmtTimeL, Header, ContextBar, NamePromptModal, SharedModals,
   HomeScreen, ProjectStorage, window.CreatorContext.* */

const{useState,useRef,useCallback,useEffect,useMemo}=React;

class CreatorErrorBoundary extends React.Component {
  constructor(props) { super(props); this.state = { error: null }; }
  static getDerivedStateFromError(error) { return { error }; }
  componentDidCatch(error, info) { console.error('CreatorApp error:', error, info); }
  render() {
    if (this.state.error) return React.createElement('pre', {style:{color:'red',padding:20,fontSize:13,whiteSpace:'pre-wrap'}},
      'CreatorApp Error: ' + this.state.error.message + '\n\n' + (this.state.error.stack || ''));
    return this.props.children;
  }
}

function confettiTier(pct){
  if(pct<2)return{color:"#16a34a",label:"Excellent"};
  if(pct<5)return{color:"#65a30d",label:"Good"};
  if(pct<8)return{color:"#d97706",label:"Moderate"};
  if(pct<15)return{color:"#ea580c",label:"Challenging"};
  return{color:"#dc2626",label:"High confetti"};
}

function ComparisonSlider({originalSrc, previewSrc, heatmapSrc, highlightSrc, width, height, previewPw, previewPh, leftLabel, rightLabel}) {
  const [splitPos, setSplitPos] = useState(50);
  const splitPosRef = useRef(50);
  const containerRef = useRef(null);
  const dragging = useRef(false);
  const rafRef = useRef(null);
  const pendingPosRef = useRef(null);
  // auto-sweep
  const [sweeping, setSweeping] = useState(false);
  const sweepAnimRef = useRef(null);
  const sweepDirRef = useRef(1);
  // zoom lens
  const [zoomPos, setZoomPos] = useState(null);
  const altHeld = useRef(false);
  const [altDown, setAltDown] = useState(false);
  // diff overlay
  const [showDiff, setShowDiff] = useState(false);
  const [diffUrl, setDiffUrl] = useState(null);
  const prevPreviewRef = useRef(null);
  // heatmap overlay
  const [showHeatmap, setShowHeatmap] = useState(false);

  function computePos(e) {
    if (!containerRef.current) return null;
    var rect = containerRef.current.getBoundingClientRect();
    return Math.max(5, Math.min(95, ((e.clientX - rect.left) / rect.width) * 100));
  }
  function scheduleUpdate(pos) {
    pendingPosRef.current = pos;
    splitPosRef.current = pos;
    if (!rafRef.current) {
      rafRef.current = requestAnimationFrame(function() {
        rafRef.current = null;
        setSplitPos(pendingPosRef.current);
      });
    }
  }

  useEffect(function() {
    if (!sweeping) { if (sweepAnimRef.current) cancelAnimationFrame(sweepAnimRef.current); return; }
    var last = null;
    function tick(ts) {
      if (last == null) last = ts;
      var dt = ts - last; last = ts;
      splitPosRef.current += sweepDirRef.current * 80 * dt / 1000;
      if (splitPosRef.current >= 90) { splitPosRef.current = 90; sweepDirRef.current = -1; }
      else if (splitPosRef.current <= 10) { splitPosRef.current = 10; sweepDirRef.current = 1; }
      setSplitPos(splitPosRef.current);
      sweepAnimRef.current = requestAnimationFrame(tick);
    }
    sweepAnimRef.current = requestAnimationFrame(tick);
    return function() { if (sweepAnimRef.current) cancelAnimationFrame(sweepAnimRef.current); };
  }, [sweeping]);

  useEffect(function() {
    function onKeyDown(e) { if (e.key === 'Alt') { altHeld.current = true; setAltDown(true); } }
    function onKeyUp(e) { if (e.key === 'Alt') { altHeld.current = false; setAltDown(false); setZoomPos(null); } }
    window.addEventListener('keydown', onKeyDown, true);
    window.addEventListener('keyup', onKeyUp, true);
    return function() { window.removeEventListener('keydown', onKeyDown, true); window.removeEventListener('keyup', onKeyUp, true); };
  }, []);

  useEffect(function() {
    if (!previewSrc) { prevPreviewRef.current = null; setDiffUrl(null); return; }
    if (!prevPreviewRef.current || prevPreviewRef.current === previewSrc) { prevPreviewRef.current = previewSrc; return; }
    var prevSrc = prevPreviewRef.current;
    prevPreviewRef.current = previewSrc;
    var cancelled = false;
    var imgA = new Image(), imgB = new Image();
    var loaded = 0;
    function onLoad() {
      if (cancelled) return;
      if (++loaded < 2) return;
      var w = imgB.naturalWidth, h = imgB.naturalHeight;
      if (!w || !h) return;
      var ca = document.createElement('canvas'); ca.width = w; ca.height = h;
      var cxa = ca.getContext('2d'); cxa.drawImage(imgA, 0, 0, w, h);
      var da = cxa.getImageData(0, 0, w, h).data;
      var cb = document.createElement('canvas'); cb.width = w; cb.height = h;
      var cxb = cb.getContext('2d'); cxb.drawImage(imgB, 0, 0, w, h);
      var db = cxb.getImageData(0, 0, w, h).data;
      var out = cxb.createImageData(w, h); var od = out.data;
      for (var i = 0; i < da.length; i += 4) {
        if (Math.abs(da[i]-db[i]) + Math.abs(da[i+1]-db[i+1]) + Math.abs(da[i+2]-db[i+2]) > 12) {
          od[i] = 255; od[i+1] = 80; od[i+2] = 0; od[i+3] = 200;
        }
      }
      cxb.putImageData(out, 0, 0);
      setDiffUrl(cb.toDataURL());
    }
    imgA.onload = onLoad; imgB.onload = onLoad;
    imgA.src = prevSrc; imgB.src = previewSrc;
    return function() { cancelled = true; };
  }, [previewSrc]);

  useEffect(function() {
    if (!diffUrl) return;
    setShowDiff(true);
    var t = setTimeout(function() { setShowDiff(false); }, 1500);
    return function() { clearTimeout(t); };
  }, [diffUrl]);

  function handlePointerMove(e) {
    if (altHeld.current && containerRef.current) {
      var rect = containerRef.current.getBoundingClientRect();
      if (rect.width > 0) setZoomPos({cx: e.clientX - rect.left, cy: e.clientY - rect.top, W: rect.width, H: rect.height});
    } else if (zoomPos) { setZoomPos(null); }
    if (!dragging.current) return;
    var pos = computePos(e);
    if (pos !== null) scheduleUpdate(pos);
  }

  var LENS = 140, ZOOM = 2.5;

  return (
    <div>
      <div ref={containerRef}
        style={{position:"relative",width:"100%",aspectRatio:`${width}/${height}`,overflow:"hidden",cursor:altDown?"zoom-in":"ew-resize",borderRadius:8,border:"0.5px solid #e2e8f0",userSelect:"none",touchAction:"none"}}
        onPointerDown={function(e){
          if(altHeld.current)return;
          dragging.current=true; setSweeping(false);
          e.currentTarget.setPointerCapture(e.pointerId);
          var pos=computePos(e);
          if(pos!==null){splitPosRef.current=pos;setSplitPos(pos);}
        }}
        onPointerMove={handlePointerMove}
        onPointerUp={function(e){
          dragging.current=false;
          if(pendingPosRef.current!==null&&pendingPosRef.current!==undefined){
            splitPosRef.current=pendingPosRef.current;
            setSplitPos(pendingPosRef.current);
            pendingPosRef.current=null;
          }
          if(rafRef.current){cancelAnimationFrame(rafRef.current);rafRef.current=null;}
          if(e.currentTarget.hasPointerCapture(e.pointerId))e.currentTarget.releasePointerCapture(e.pointerId);
        }}
        onPointerCancel={function(){
          dragging.current=false;
          if(pendingPosRef.current!==null&&pendingPosRef.current!==undefined){
            splitPosRef.current=pendingPosRef.current;
            setSplitPos(pendingPosRef.current);
            pendingPosRef.current=null;
          }
          if(rafRef.current){cancelAnimationFrame(rafRef.current);rafRef.current=null;}
        }}
        onPointerLeave={function(){if(!dragging.current)setZoomPos(null);}}>
        <img src={originalSrc} draggable={false} onDragStart={function(e){e.preventDefault();}} style={{position:"absolute",top:0,left:0,width:"100%",height:"100%",objectFit:"fill"}} alt="Original"/>
        <div style={{position:"absolute",top:0,left:0,right:0,bottom:0,clipPath:`inset(0 0 0 ${splitPos}%)`}}>
          <img src={previewSrc} draggable={false} onDragStart={function(e){e.preventDefault();}} style={{position:"absolute",top:0,left:0,width:"100%",height:"100%",objectFit:"fill",imageRendering:"pixelated"}} alt="Preview"/>
        </div>
        {showDiff&&diffUrl&&<img src={diffUrl} style={{position:"absolute",top:0,left:0,width:"100%",height:"100%",objectFit:"fill",pointerEvents:"none",zIndex:4}} alt="" aria-hidden="true"/>}
        {showHeatmap&&heatmapSrc&&<img src={heatmapSrc} style={{position:"absolute",top:0,left:0,width:"100%",height:"100%",objectFit:"fill",imageRendering:"pixelated",pointerEvents:"none",zIndex:5}} alt="" aria-hidden="true"/>}
        {highlightSrc&&<img src={highlightSrc} style={{position:"absolute",top:0,left:0,width:"100%",height:"100%",objectFit:"fill",imageRendering:"pixelated",pointerEvents:"none",zIndex:6}} alt="" aria-hidden="true"/>}
        <div style={{position:"absolute",top:0,bottom:0,left:`${splitPos}%`,width:3,background:"#fff",boxShadow:"0 0 4px rgba(0,0,0,0.3)",transform:"translateX(-50%)",zIndex:2,pointerEvents:"none",willChange:"left"}}>
          <div style={{position:"absolute",top:"50%",left:"50%",transform:"translate(-50%,-50%)",width:28,height:28,borderRadius:"50%",background:"#fff",boxShadow:"0 1px 4px rgba(0,0,0,0.2)",display:"flex",alignItems:"center",justifyContent:"center",fontSize:12,color:"#475569"}}>⟺</div>
        </div>
        <span style={{position:"absolute",top:8,left:8,fontSize:10,fontWeight:600,color:"#fff",background:"rgba(0,0,0,0.5)",padding:"2px 8px",borderRadius:4,zIndex:3,pointerEvents:"none"}}>{leftLabel||"Original"}</span>
        <span style={{position:"absolute",top:8,right:8,fontSize:10,fontWeight:600,color:"#fff",background:"rgba(0,0,0,0.5)",padding:"2px 8px",borderRadius:4,zIndex:3,pointerEvents:"none"}}>{rightLabel||"Preview"}</span>
        {previewPw&&previewPh&&<span style={{position:"absolute",bottom:8,right:8,fontSize:9,fontWeight:500,color:"#fff",background:"rgba(0,0,0,0.45)",padding:"2px 6px",borderRadius:4,zIndex:3,pointerEvents:"none"}}>{previewPw}×{previewPh} px</span>}
        {zoomPos&&(function(){
          var cx=zoomPos.cx,cy=zoomPos.cy,W=zoomPos.W,H=zoomPos.H;
          var bgSzW=W*ZOOM,bgSzH=H*ZOOM;
          var bgX=-(cx*ZOOM-LENS/2),bgY=-(cy*ZOOM-LENS/2);
          var lensL=Math.max(0,Math.min(W-LENS,cx-LENS/2));
          var lensT=Math.max(0,Math.min(H-LENS,cy-LENS/2));
          var splitInLensPct=Math.max(0,Math.min(100,((splitPos/100*W)-lensL)/LENS*100));
          return (
            <div style={{position:"absolute",left:lensL,top:lensT,width:LENS,height:LENS,borderRadius:"50%",overflow:"hidden",border:"2px solid #fff",boxShadow:"0 2px 12px rgba(0,0,0,0.4)",zIndex:10,pointerEvents:"none"}}>
              <div style={{position:"absolute",top:0,left:0,right:0,bottom:0,backgroundImage:`url('${originalSrc}')`,backgroundSize:`${bgSzW}px ${bgSzH}px`,backgroundPosition:`${bgX}px ${bgY}px`,backgroundRepeat:"no-repeat"}}/>
              <div style={{position:"absolute",top:0,left:0,right:0,bottom:0,clipPath:`inset(0 0 0 ${splitInLensPct}%)`,backgroundImage:`url('${previewSrc}')`,backgroundSize:`${bgSzW}px ${bgSzH}px`,backgroundPosition:`${bgX}px ${bgY}px`,backgroundRepeat:"no-repeat",imageRendering:"pixelated"}}/>
            </div>
          );
        })()}
      </div>
      <div style={{display:"flex",alignItems:"center",gap:8,marginTop:6,flexWrap:"wrap"}}>
        <button type="button" onClick={function(){setSweeping(function(s){if(!s){sweepDirRef.current=1;splitPosRef.current=splitPos;}return !s;});}}
          style={{fontSize:11,padding:"3px 10px",cursor:"pointer",border:"0.5px solid #e2e8f0",borderRadius:6,background:sweeping?"#0d9488":"#f8f9fa",color:sweeping?"#fff":"#475569",fontWeight:500}}>
          {sweeping?<>{Icons.pause()} Pause</>:<>{Icons.play()} Auto-sweep</>}
        </button>
        {diffUrl&&<button type="button" onClick={function(){setShowDiff(function(d){return !d;});}}
          style={{fontSize:11,padding:"3px 10px",cursor:"pointer",border:"0.5px solid "+(showDiff?"#ea580c":"#e2e8f0"),borderRadius:6,background:showDiff?"#fff7ed":"#f8f9fa",color:showDiff?"#ea580c":"#475569",fontWeight:500}}>
          {showDiff?"Hide changes":"Show changes"}
        </button>}
        {heatmapSrc&&<button type="button" onClick={function(){setShowHeatmap(function(h){return !h;});}}
          style={{fontSize:11,padding:"3px 10px",cursor:"pointer",border:"0.5px solid "+(showHeatmap?"#dc2626":"#e2e8f0"),borderRadius:6,background:showHeatmap?"#fef2f2":"#f8f9fa",color:showHeatmap?"#dc2626":"#475569",fontWeight:500}}>
          {showHeatmap?"Hide heatmap":<>{Icons.fire()} Heatmap</>}
        </button>}
        <span style={{fontSize:10,color:"#94a3b8"}}>Hold Alt to zoom</span>
      </div>
    </div>
  );
}
window.ComparisonSlider = ComparisonSlider;



function CreatorApp({onSwitchToTrack=null, isActive=true}={}) {
  const useCreatorStateHook = window.useCreatorState;
  const useEditHistoryHook = window.useEditHistory;
  const useCanvasInteractionHook = window.useCanvasInteraction;
  const useProjectIOHook = window.useProjectIO;
  const usePreviewHook = window.usePreview;
  const useKeyboardShortcutsHook = window.useKeyboardShortcuts;

  if (!useCreatorStateHook || !useEditHistoryHook || !useCanvasInteractionHook || !useProjectIOHook || !usePreviewHook || !useKeyboardShortcutsHook) {
    throw new Error("Creator dependencies failed to load. Refresh the page to fetch the latest creator bundle.");
  }

  const state = useCreatorStateHook();
  const history = useEditHistoryHook(state);
  const canvas = useCanvasInteractionHook(state, history);
  const io = useProjectIOHook(state, history, {onSwitchToTrack});
  usePreviewHook(state);
  useKeyboardShortcutsHook(Object.assign({}, state, {isActive: isActive}), history, io);

  // Expose setAppMode so UnifiedApp can switch modes
  React.useEffect(()=>{
    window.__setCreatorAppMode=state.setAppMode;
    window.__setCreatorProjectName=state.setProjectName;
    // Allow the Tracker to push fresh tracker-specific fields into the Creator's
    // preservation container so the next Creator auto-save doesn't overwrite them
    // with stale data.
    window.__updateCreatorTrackerFields=function(fields){
      if(!fields||typeof fields!=='object')return;
      var tf=state.trackerFieldsRef.current||{};
      Object.assign(tf,fields);
      state.trackerFieldsRef.current=tf;
    };
    return()=>{delete window.__setCreatorAppMode;delete window.__setCreatorProjectName;delete window.__updateCreatorTrackerFields;};
  },[state.setAppMode,state.setProjectName]);

  // ── Stable ref-forwarding wrappers — prevent context rememo on every render ──
  // Handler identity is stabilised via a ref; the ref is updated synchronously on
  // each render so the latest function is always called despite the empty dep list.
  // Refs are initialised with null; the current assignment below runs before any
  // useMemo so the refs are always populated when context values are built.
  const _cvHRef  = React.useRef(null);  _cvHRef.current  = canvas;
  const _ioRef   = React.useRef(null);  _ioRef.current   = io;
  const _histRef = React.useRef(null);  _histRef.current = history;

  const stableHandlePatPointerDown   = React.useCallback(function(e){_cvHRef.current.handlePatPointerDown(e);},   []);
  const stableHandlePatPointerMove   = React.useCallback(function(e){_cvHRef.current.handlePatPointerMove(e);},   []);
  const stableHandlePatPointerUp     = React.useCallback(function(e){_cvHRef.current.handlePatPointerUp(e);},     []);
  const stableHandlePatPointerLeave  = React.useCallback(function(e){_cvHRef.current.handlePatPointerLeave(e);},  []);
  const stableHandlePatPointerCancel = React.useCallback(function(e){_cvHRef.current.handlePatPointerCancel(e);}, []);
  const stableHandleCropPointerDown  = React.useCallback(function(e){_cvHRef.current.handleCropPointerDown(e);},  []);
  const stableHandleCropPointerMove  = React.useCallback(function(e){_cvHRef.current.handleCropPointerMove(e);},  []);
  const stableHandleCropPointerUp    = React.useCallback(function(e){_cvHRef.current.handleCropPointerUp(e);},    []);
  const stableHandleCropPointerCancel= React.useCallback(function(e){_cvHRef.current.handleCropPointerCancel(e);},[]);
  const stableApplyCrop              = React.useCallback(function()  {_cvHRef.current.applyCrop();},               []);
  const stableSrcClick               = React.useCallback(function(e){_cvHRef.current.srcClick(e);},               []);
  const stableAutoCrop               = React.useCallback(function()  {_cvHRef.current.autoCrop();},               []);

  const stableSaveProject         = React.useCallback(function()  {_ioRef.current.saveProject();},         []);
  const stableDoSaveProject       = React.useCallback(function(n) {_ioRef.current.doSaveProject(n);},      []);
  const stableHandleFile          = React.useCallback(function(e) {_ioRef.current.handleFile(e);},         []);
  const stableLoadProject         = React.useCallback(function(e) {_ioRef.current.loadProject(e);},        []);
  const stableHandleOpenInTracker = React.useCallback(function()  {_ioRef.current.handleOpenInTracker();}, []);

  const stableUndoEdit = React.useCallback(function(){_histRef.current.undoEdit();}, []);
  const stableRedoEdit = React.useCallback(function(){_histRef.current.redoEdit();}, []);

  // ── GenerationContext value (image-to-pattern generation params & callbacks) ──
  const genCtx = useMemo(function() { return {
    img: state.img, setImg: state.setImg,
    isUploading: state.isUploading, setIsUploading: state.setIsUploading,
    isDragging: state.isDragging, setIsDragging: state.setIsDragging,
    maxC: state.maxC, setMaxC: state.setMaxC,
    bri: state.bri, setBri: state.setBri,
    con: state.con, setCon: state.setCon,
    sat: state.sat, setSat: state.setSat,
    dith: state.dith, setDith: state.setDith,
    skipBg: state.skipBg, setSkipBg: state.setSkipBg,
    bgTh: state.bgTh, setBgTh: state.setBgTh,
    bgCol: state.bgCol, setBgCol: state.setBgCol,
    pickBg: state.pickBg, setPickBg: state.setPickBg,
    minSt: state.minSt, setMinSt: state.setMinSt,
    smooth: state.smooth, setSmooth: state.setSmooth,
    smoothType: state.smoothType, setSmoothType: state.setSmoothType,
    orphans: state.orphans, setOrphans: state.setOrphans,
    allowBlends: state.allowBlends, setAllowBlends: state.setAllowBlends,
    busy: state.busy, setBusy: state.setBusy,
    origW: state.origW, setOrigW: state.setOrigW,
    origH: state.origH, setOrigH: state.setOrigH,
    hasGenerated: state.hasGenerated, setHasGenerated: state.setHasGenerated,
    stitchCleanup: state.stitchCleanup, setStitchCleanup: state.setStitchCleanup,
    isCropping: state.isCropping, setIsCropping: state.setIsCropping,
    cropRect: state.cropRect, setCropRect: state.setCropRect,
    cropStartRef: state.cropStartRef, cropRef: state.cropRef,
    generate: state.generate,
    randomise: state.randomise,
    generateGallery: state.generateGallery,
    promoteVariation: state.promoteVariation,
    applyVariationSeed: state.applyVariationSeed,
    variationSeed: state.variationSeed, setVariationSeed: state.setVariationSeed,
    variationSubset: state.variationSubset, setVariationSubset: state.setVariationSubset,
    variationHistory: state.variationHistory, setVariationHistory: state.setVariationHistory,
    gallerySlots: state.gallerySlots,
    galleryOpen: state.galleryOpen, setGalleryOpen: state.setGalleryOpen,
    stashConstrained: state.stashConstrained, setStashConstrained: state.setStashConstrained,
    coverageGaps: state.coverageGaps, setCoverageGaps: state.setCoverageGaps,
    cleanupDiff: state.cleanupDiff, setCleanupDiff: state.setCleanupDiff,
    showCleanupDiff: state.showCleanupDiff, setShowCleanupDiff: state.setShowCleanupDiff,
    fRef: state.fRef, prevSW: state.prevSW, prevSH: state.prevSH,
    stashThreadCount: state.stashThreadCount,
    effectiveMaxC: state.effectiveMaxC,
    stashPalette: state.stashPalette,
    blendsAutoDisabled: state.blendsAutoDisabled,
    effectiveAllowBlends: state.effectiveAllowBlends,
    handleCropPointerDown: stableHandleCropPointerDown,
    handleCropPointerMove: stableHandleCropPointerMove,
    handleCropPointerUp: stableHandleCropPointerUp,
    handleCropPointerCancel: stableHandleCropPointerCancel,
    applyCrop: stableApplyCrop,
    srcClick: stableSrcClick,
    autoCrop: stableAutoCrop,
  }; }, [
    state.img, state.isUploading, state.isDragging,
    state.maxC, state.bri, state.con, state.sat, state.dith,
    state.skipBg, state.bgTh, state.bgCol, state.pickBg,
    state.minSt, state.smooth, state.smoothType,
    state.orphans, state.allowBlends, state.busy,
    state.origW, state.origH, state.hasGenerated,
    state.stitchCleanup, state.isCropping, state.cropRect,
    state.generate, state.randomise, state.generateGallery,
    state.promoteVariation, state.applyVariationSeed,
    state.variationSeed, state.variationSubset, state.variationHistory,
    state.gallerySlots, state.galleryOpen,
    state.stashConstrained, state.coverageGaps,
    state.cleanupDiff, state.showCleanupDiff,
    state.stashThreadCount, state.effectiveMaxC, state.stashPalette,
    state.blendsAutoDisabled, state.effectiveAllowBlends,
  ]);

  // ── AppContext value (UI housekeeping: tabs, modals, panels, toasts, refs, export, preview) ──
  const appCtx = useMemo(function() { return {
    appMode: state.appMode, setAppMode: state.setAppMode,
    sidebarTab: state.sidebarTab, setSidebarTab: state.setSidebarTab,
    tab: state.tab, setTab: state.setTab,
    modal: state.modal, setModal: state.setModal,
    sidebarOpen: state.sidebarOpen, setSidebarOpen: state.setSidebarOpen,
    loadError: state.loadError, setLoadError: state.setLoadError,
    copied: state.copied, setCopied: state.setCopied, copyText: state.copyText,
    dimOpen: state.dimOpen, setDimOpen: state.setDimOpen,
    palOpen: state.palOpen, setPalOpen: state.setPalOpen,
    fabOpen: state.fabOpen, setFabOpen: state.setFabOpen,
    adjOpen: state.adjOpen, setAdjOpen: state.setAdjOpen,
    bgOpen: state.bgOpen, setBgOpen: state.setBgOpen,
    palAdvanced: state.palAdvanced, setPalAdvanced: state.setPalAdvanced,
    cleanupOpen: state.cleanupOpen, setCleanupOpen: state.setCleanupOpen,
    splitPaneEnabled: state.splitPaneEnabled, setSplitPaneEnabled: state.setSplitPaneEnabled,
    splitPaneRatio: state.splitPaneRatio, setSplitPaneRatio: state.setSplitPaneRatio,
    splitPaneSyncEnabled: state.splitPaneSyncEnabled, setSplitPaneSyncEnabled: state.setSplitPaneSyncEnabled,
    rightPaneMode: state.rightPaneMode, setRightPaneMode: state.setRightPaneMode,
    exportPage: state.exportPage, setExportPage: state.setExportPage,
    pageMode: state.pageMode, setPageMode: state.setPageMode,
    pdfDisplayMode: state.pdfDisplayMode, setPdfDisplayMode: state.setPdfDisplayMode,
    pdfCellSize: state.pdfCellSize, setPdfCellSize: state.setPdfCellSize,
    pdfSinglePage: state.pdfSinglePage, setPdfSinglePage: state.setPdfSinglePage,
    toasts: state.toasts, addToast: state.addToast, dismissToast: state.dismissToast,
    pcRef: state.pcRef, scrollRef: state.scrollRef, expRef: state.expRef, loadRef: state.loadRef,
    stripRef: state.stripRef, overflowRef: state.overflowRef,
    overflowOpen: state.overflowOpen, setOverflowOpen: state.setOverflowOpen,
    panelOpen: state.panelOpen, setPanelOpen: state.setPanelOpen,
    stripCollapsed: state.stripCollapsed, setStripCollapsed: state.setStripCollapsed,
    shortcutsHintDismissed: state.shortcutsHintDismissed, setShortcutsHintDismissed: state.setShortcutsHintDismissed,
    namePromptOpen: state.namePromptOpen, setNamePromptOpen: state.setNamePromptOpen,
    projectName: state.projectName, setProjectName: state.setProjectName,
    projectDesigner: state.projectDesigner, setProjectDesigner: state.setProjectDesigner,
    projectDescription: state.projectDescription, setProjectDescription: state.setProjectDescription,
    eyedropperEmpty: state.eyedropperEmpty, setEyedropperEmpty: state.setEyedropperEmpty,
    projectIdRef: state.projectIdRef, createdAtRef: state.createdAtRef, userActedRef: state.userActedRef,
    G: state.G,
    pxX: state.pxX, pxY: state.pxY, totPg: state.totPg,
    previewActive: state.previewActive, setPreviewActive: state.setPreviewActive,
    previewShowGrid: state.previewShowGrid, setPreviewShowGrid: state.setPreviewShowGrid,
    previewFabricBg: state.previewFabricBg, setPreviewFabricBg: state.setPreviewFabricBg,
    previewMode: state.previewMode, setPreviewMode: state.setPreviewMode,
    realisticLevel: state.realisticLevel, setRealisticLevel: state.setRealisticLevel,
    coverageOverride: state.coverageOverride, setCoverageOverride: state.setCoverageOverride,
    previewUrl: state.previewUrl, setPreviewUrl: state.setPreviewUrl,
    previewStats: state.previewStats, setPreviewStats: state.setPreviewStats,
    confettiData: state.confettiData, setConfettiData: state.setConfettiData,
    previewHeatmap: state.previewHeatmap, setPreviewHeatmap: state.setPreviewHeatmap,
    previewMapped: state.previewMapped, setPreviewMapped: state.setPreviewMapped,
    previewColors: state.previewColors, setPreviewColors: state.setPreviewColors,
    previewDims: state.previewDims, setPreviewDims: state.setPreviewDims,
    previewHighlight: state.previewHighlight, setPreviewHighlight: state.setPreviewHighlight,
    previewTimerRef: state.previewTimerRef,
    saveProject: stableSaveProject, doSaveProject: stableDoSaveProject,
    handleFile: stableHandleFile, loadProject: stableLoadProject,
    handleOpenInTracker: stableHandleOpenInTracker,
    isActive: isActive,
  }; }, [
    state.appMode, state.sidebarTab,
    state.tab, state.modal, state.sidebarOpen, state.loadError,
    state.copied, state.dimOpen, state.palOpen, state.fabOpen,
    state.adjOpen, state.bgOpen, state.palAdvanced, state.cleanupOpen,
    state.splitPaneEnabled, state.splitPaneRatio,
    state.splitPaneSyncEnabled, state.rightPaneMode,
    state.exportPage, state.pageMode,
    state.pdfDisplayMode, state.pdfCellSize, state.pdfSinglePage,
    state.toasts, state.overflowOpen, state.panelOpen, state.stripCollapsed,
    state.shortcutsHintDismissed, state.namePromptOpen, state.projectName,
    state.projectDesigner, state.projectDescription,
    state.eyedropperEmpty, state.pxX, state.pxY, state.totPg,
    state.previewActive, state.previewShowGrid, state.previewFabricBg,
    state.previewMode, state.realisticLevel, state.coverageOverride,
    state.previewUrl, state.previewStats, state.confettiData,
    state.previewHeatmap, state.previewMapped, state.previewColors,
    state.previewDims, state.previewHighlight,
    isActive,
  ]);

  // ── CanvasContext value (tools, view, zoom, highlight, selection, edit history, interactions) ──
  const cvCtx = useMemo(function() { return {
    activeTool: state.activeTool, setActiveTool: state.setActiveTool, activeToolRef: state.activeToolRef,
    brushMode: state.brushMode, setBrushMode: state.setBrushMode, brushModeRef: state.brushModeRef,
    brushSize: state.brushSize, setBrushSize: state.setBrushSize,
    selectedColorId: state.selectedColorId, setSelectedColorId: state.setSelectedColorId,
    view: state.view, setView: state.setView,
    zoom: state.zoom, setZoom: state.setZoom,
    hiId: state.hiId, setHiId: state.setHiId,
    showCtr: state.showCtr, setShowCtr: state.setShowCtr,
    showOverlay: state.showOverlay, setShowOverlay: state.setShowOverlay,
    overlayOpacity: state.overlayOpacity, setOverlayOpacity: state.setOverlayOpacity,
    highlightMode: state.highlightMode, setHighlightMode: state.setHighlightMode,
    bgDimOpacity: state.bgDimOpacity, setBgDimOpacity: state.setBgDimOpacity,
    hiAdvanced: state.hiAdvanced, setHiAdvanced: state.setHiAdvanced,
    bgDimDesaturation: state.bgDimDesaturation, setBgDimDesaturation: state.setBgDimDesaturation,
    dimFraction: state.dimFraction, dimHiId: state.dimHiId,
    tintColor: state.tintColor, setTintColor: state.setTintColor,
    tintOpacity: state.tintOpacity, setTintOpacity: state.setTintOpacity,
    spotDimOpacity: state.spotDimOpacity, setSpotDimOpacity: state.setSpotDimOpacity,
    antsOffset: state.antsOffset, setAntsOffset: state.setAntsOffset,
    hoverCoords: state.hoverCoords, setHoverCoords: state.setHoverCoords,
    contextMenu: state.contextMenu, setContextMenu: state.setContextMenu,
    selectionModifier: state.selectionModifier, setSelectionModifier: state.setSelectionModifier,
    bsLines: state.bsLines, setBsLines: state.setBsLines,
    bsStart: state.bsStart, setBsStart: state.setBsStart,
    bsContinuous: state.bsContinuous, setBsContinuous: state.setBsContinuous,
    editHistory: state.editHistory, setEditHistory: state.setEditHistory,
    redoHistory: state.redoHistory, setRedoHistory: state.setRedoHistory,
    EDIT_HISTORY_MAX: state.EDIT_HISTORY_MAX,
    selectStitchType: state.selectStitchType,
    setBrushAndActivate: state.setBrushAndActivate,
    setTool: state.setTool, setHsTool: state.setHsTool, setPsTool: state.setPsTool,
    stitchType: state.stitchType, fitZ: state.fitZ,
    cs: state.cs,
    undoEdit: stableUndoEdit, redoEdit: stableRedoEdit,
    handlePatPointerDown: stableHandlePatPointerDown,
    handlePatPointerUp: stableHandlePatPointerUp,
    handlePatPointerMove: stableHandlePatPointerMove,
    handlePatPointerLeave: stableHandlePatPointerLeave,
    handlePatPointerCancel: stableHandlePatPointerCancel,
    isDraggingRef: canvas.isDraggingRef,
    paletteSwap: state.paletteSwap,
    selectionMask: state.selectionMask, setSelectionMask: state.setSelectionMask,
    wandTolerance: state.wandTolerance, setWandTolerance: state.setWandTolerance,
    wandContiguous: state.wandContiguous, setWandContiguous: state.setWandContiguous,
    wandOpMode: state.wandOpMode, setWandOpMode: state.setWandOpMode,
    setSelectionOpMode: state.setSelectionOpMode,
    wandPanel: state.wandPanel, setWandPanel: state.setWandPanel,
    confettiThreshold: state.confettiThreshold, setConfettiThreshold: state.setConfettiThreshold,
    confettiPreview: state.confettiPreview, setConfettiPreview: state.setConfettiPreview,
    reduceTarget: state.reduceTarget, setReduceTarget: state.setReduceTarget,
    reducePreview: state.reducePreview, setReducePreview: state.setReducePreview,
    replaceSource: state.replaceSource, setReplaceSource: state.setReplaceSource,
    replaceDest: state.replaceDest, setReplaceDest: state.setReplaceDest,
    replaceFuzzy: state.replaceFuzzy, setReplaceFuzzy: state.setReplaceFuzzy,
    replaceFuzzyTol: state.replaceFuzzyTol, setReplaceFuzzyTol: state.setReplaceFuzzyTol,
    outlineColor: state.outlineColor, setOutlineColor: state.setOutlineColor,
    applyWandSelect: state.applyWandSelect, clearSelection: state.clearSelection,
    invertSelection: state.invertSelection, selectAll: state.selectAll,
    selectAllOfColorId: state.selectAllOfColorId,
    previewConfettiCleanup: state.previewConfettiCleanup,
    applyConfettiCleanup: state.applyConfettiCleanup,
    previewColorReduction: state.previewColorReduction,
    applyColorReduction: state.applyColorReduction,
    selectionReplaceColorCount: state.selectionReplaceColorCount,
    applyColorReplacement: state.applyColorReplacement,
    selectionStats: state.selectionStats,
    applyOutlineGeneration: state.applyOutlineGeneration,
    selectionCount: state.selectionCount, hasSelection: state.hasSelection,
    lassoMode: state.lassoMode, setLassoMode: state.setLassoMode,
    lassoPoints: state.lassoPoints, setLassoPoints: state.setLassoPoints,
    lassoActive: state.lassoActive, setLassoActive: state.setLassoActive,
    lassoCursor: state.lassoCursor, setLassoCursor: state.setLassoCursor,
    lassoPreviewMask: state.lassoPreviewMask, setLassoPreviewMask: state.setLassoPreviewMask,
    lassoOpMode: state.lassoOpMode, setLassoOpMode: state.setLassoOpMode,
    lassoPointCount: state.lassoPointCount, lassoInProgress: state.lassoInProgress,
    startLasso: state.startLasso, extendLasso: state.extendLasso,
    finalizeLasso: state.finalizeLasso, cancelLasso: state.cancelLasso,
    isNearStart: state.isNearStart,
    lassoLinePath: state.lassoLinePath,
    lassoMagneticPath: state.lassoMagneticPath,
    lassoBoundaryPath: state.lassoBoundaryPath,
  }; }, [
    state.activeTool, state.brushMode, state.brushSize,
    state.selectedColorId, state.view, state.zoom,
    state.hiId, state.showCtr, state.showOverlay, state.overlayOpacity,
    state.highlightMode, state.bgDimOpacity, state.hiAdvanced,
    state.bgDimDesaturation, state.dimFraction, state.dimHiId,
    state.tintColor, state.tintOpacity, state.spotDimOpacity,
    state.antsOffset, state.hoverCoords, state.contextMenu,
    state.selectionModifier, state.bsLines, state.bsStart, state.bsContinuous,
    state.editHistory, state.redoHistory, state.stitchType, state.cs,
    state.paletteSwap,
    state.pat, state.cmap, state.sW, state.sH,
    state.selectionMask, state.wandTolerance, state.wandContiguous,
    state.wandOpMode, state.wandPanel,
    state.confettiThreshold, state.confettiPreview,
    state.reduceTarget, state.reducePreview,
    state.replaceSource, state.replaceDest, state.replaceFuzzy, state.replaceFuzzyTol,
    state.outlineColor, state.selectionCount, state.hasSelection,
    state.selectionStats, state.selectionReplaceColorCount,
    state.lassoMode, state.lassoPoints, state.lassoActive, state.lassoCursor,
    state.lassoPreviewMask, state.lassoOpMode, state.lassoPointCount, state.lassoInProgress,
  ]);

  // ── PatternDataContext value (core pattern data, dimensions, derived values) ──
  const pdCtx = useMemo(function() { return {
    pat: state.pat, setPat: state.setPat,
    pal: state.pal, setPal: state.setPal,
    cmap: state.cmap, setCmap: state.setCmap,
    sW: state.sW, setSW: state.setSW, sH: state.sH, setSH: state.setSH,
    arLock: state.arLock, setArLock: state.setArLock,
    ar: state.ar, setAr: state.setAr,
    chgW: state.chgW, chgH: state.chgH, slRsz: state.slRsz,
    fabricCt: state.fabricCt, setFabricCt: state.setFabricCt,
    skeinPrice: state.skeinPrice, setSkeinPrice: state.setSkeinPrice,
    stitchSpeed: state.stitchSpeed, setStitchSpeed: state.setStitchSpeed,
    done: state.done, setDone: state.setDone,
    isScratchMode: state.isScratchMode, setIsScratchMode: state.setIsScratchMode,
    scratchPalette: state.scratchPalette, setScratchPalette: state.setScratchPalette,
    dmcSearch: state.dmcSearch, setDmcSearch: state.setDmcSearch,
    colPickerOpen: state.colPickerOpen, setColPickerOpen: state.setColPickerOpen,
    parkMarkers: state.parkMarkers, setParkMarkers: state.setParkMarkers,
    hlRow: state.hlRow, setHlRow: state.setHlRow,
    hlCol: state.hlCol, setHlCol: state.setHlCol,
    totalTime: state.totalTime, setTotalTime: state.setTotalTime,
    sessions: state.sessions, setSessions: state.setSessions,
    partialStitches: state.partialStitches, setPartialStitches: state.setPartialStitches,
    partialStitchTool: state.partialStitchTool, setPartialStitchTool: state.setPartialStitchTool,
    partialStitchToolRef: state.partialStitchToolRef,
    threadOwned: state.threadOwned, setThreadOwned: state.setThreadOwned,
    globalStash: state.globalStash, setGlobalStash: state.setGlobalStash,
    kittingResult: state.kittingResult, setKittingResult: state.setKittingResult,
    altOpen: state.altOpen, setAltOpen: state.setAltOpen,
    substituteModalOpen: state.substituteModalOpen, setSubstituteModalOpen: state.setSubstituteModalOpen,
    substituteProposal: state.substituteProposal, setSubstituteProposal: state.setSubstituteProposal,
    substituteModalKey: state.substituteModalKey, setSubstituteModalKey: state.setSubstituteModalKey,
    substituteMaxDeltaE: state.substituteMaxDeltaE, setSubstituteMaxDeltaE: state.setSubstituteMaxDeltaE,
    buildPaletteWithScratch: state.buildPaletteWithScratch,
    resetAll: state.resetAll,
    initBlankGrid: state.initBlankGrid,
    startScratch: state.startScratch,
    addScratchColour: state.addScratchColour,
    removeScratchColour: state.removeScratchColour,
    toggleOwned: state.toggleOwned,
    displayPal: state.displayPal,
    totalStitchable: state.totalStitchable,
    skeinData: state.skeinData, totalSkeins: state.totalSkeins,
    blendCount: state.blendCount, difficulty: state.difficulty,
    doneCount: state.doneCount, dmcFiltered: state.dmcFiltered,
    colourDoneCounts: state.colourDoneCounts,
    progressPct: state.progressPct,
    ownedCount: state.ownedCount, toBuyCount: state.toBuyCount, toBuyList: state.toBuyList,
  }; }, [
    state.pat, state.pal, state.cmap,
    state.sW, state.sH, state.arLock, state.ar,
    state.fabricCt, state.skeinPrice, state.stitchSpeed,
    state.done, state.isScratchMode, state.scratchPalette,
    state.dmcSearch, state.colPickerOpen,
    state.parkMarkers, state.hlRow, state.hlCol,
    state.totalTime, state.sessions,
    state.partialStitches, state.partialStitchTool,
    state.threadOwned, state.globalStash,
    state.kittingResult, state.altOpen,
    state.substituteModalOpen, state.substituteProposal,
    state.substituteModalKey, state.substituteMaxDeltaE,
    state.displayPal, state.totalStitchable,
    state.skeinData, state.totalSkeins,
    state.blendCount, state.difficulty,
    state.doneCount, state.dmcFiltered,
    state.colourDoneCounts, state.progressPct,
    state.ownedCount, state.toBuyCount, state.toBuyList,
  ]);

  // Full merged state for exportPDF (which reads a mix of pattern + derived values)
  const exportData = useMemo(function() { return {
    pat: state.pat, pal: state.pal, cmap: state.cmap,
    sW: state.sW, sH: state.sH, fabricCt: state.fabricCt,
    skeinPrice: state.skeinPrice, stitchSpeed: state.stitchSpeed,
    done: state.done, bsLines: state.bsLines,
    partialStitches: state.partialStitches,
    threadOwned: state.threadOwned,
    totalStitchable: state.totalStitchable, skeinData: state.skeinData,
    totalSkeins: state.totalSkeins, blendCount: state.blendCount,
    difficulty: state.difficulty, doneCount: state.doneCount,
    totalTime: state.totalTime, sessions: state.sessions,
  }; }, [
    state.pat, state.pal, state.cmap, state.sW, state.sH,
    state.fabricCt, state.skeinPrice, state.stitchSpeed,
    state.done, state.bsLines, state.partialStitches,
    state.threadOwned, state.totalStitchable, state.skeinData,
    state.totalSkeins, state.blendCount, state.difficulty,
    state.doneCount, state.totalTime, state.sessions,
  ]);

  return (
    <window.GenerationContext.Provider value={genCtx}>
    <window.AppContext.Provider value={appCtx}>
    <window.CanvasContext.Provider value={cvCtx}>
    <window.PatternDataContext.Provider value={pdCtx}>
      <input ref={state.loadRef} type="file" accept=".json,.oxs,.xml,.png,.jpg,.jpeg,.gif,.bmp,.webp,.pdf" onChange={io.loadProject} style={{display:"none"}}/>
      <Header page={state.appMode==='edit'?'editor':'creator'} tab={state.tab} onPageChange={state.setTab}
        onOpen={()=>state.loadRef.current.click()}
        onSave={state.pat&&state.pal?io.saveProject:null}
        onTrack={state.pat&&state.pal?io.handleOpenInTracker:null}
        onExportPDF={state.pat?()=>exportPDF({displayMode:state.pdfDisplayMode,cellSize:state.pdfCellSize,singlePage:state.pdfSinglePage},exportData):null}
        onNewProject={()=>{if(!state.pat||confirm("Start a new project? Unsaved changes will be lost."))state.resetAll();}}
        onPreferences={typeof window.PreferencesModal!=='undefined'?()=>state.setPreferencesOpen(true):undefined}
        setModal={state.setModal}
        projectName={state.pat&&state.pal?(state.projectName||(state.sW+'×'+state.sH+' pattern')):undefined}
        onNameChange={state.pat&&state.pal?n=>state.setProjectName(n):undefined}
        showAutosaved={!!(state.pat&&state.pal)} />
      {state.preferencesOpen&&typeof window.PreferencesModal!=='undefined'&&React.createElement(window.PreferencesModal,{onClose:()=>state.setPreferencesOpen(false)})}
      {state.namePromptOpen&&<NamePromptModal
        defaultName={state.projectName||(state.sW+'×'+state.sH+' pattern')}
        onConfirm={name=>{state.setProjectName(name);state.setNamePromptOpen(false);io.doSaveProject(name);}}
        onCancel={()=>{
          state.setNamePromptOpen(false);
          // Tell the user why nothing happened — without this the modal just
          // disappears with no feedback when they cancel a Download attempt.
          if(state.addToast)state.addToast("Download cancelled \u2014 give your pattern a name to download a .json file.",{type:"info",duration:3500});
        }}
      />}
      <window.CreatorToolStrip/>
      <div className="cs-page-content">
        {state.loadError&&<div style={{background:"#fef2f2",border:"1px solid #fecaca",borderRadius:8,padding:"8px 14px",fontSize:12,color:"#dc2626",marginBottom:12}}>{state.loadError}</div>}
        {!state.img&&!state.pat&&<div
            style={{maxWidth:700,margin:"40px auto",textAlign:"center",padding:"40px",border:state.isDragging?"2px dashed #0d9488":"2px dashed transparent",borderRadius:"16px",background:state.isDragging?"#f0fdfa":"transparent",transition:"all 0.2s"}}
            onDragOver={(e)=>{e.preventDefault();state.setIsDragging(true);}}
            onDragEnter={(e)=>{e.preventDefault();state.setIsDragging(true);}}
            onDragLeave={(e)=>{e.preventDefault();state.setIsDragging(false);}}
            onDrop={(e)=>{e.preventDefault();state.setIsDragging(false);if(e.dataTransfer.files&&e.dataTransfer.files.length>0){io.handleFile(e.dataTransfer.files[0]);e.dataTransfer.clearData();}}}
          >
          <h1 style={{fontSize:28,fontWeight:700,color:"#1e293b",marginBottom:8}}>Welcome to Cross Stitch Pattern Generator</h1>
          <p style={{fontSize:15,color:"#475569",marginBottom:32}}>Turn any photo into a detailed pattern, drop an image anywhere here, or continue working on an existing project.</p>
          <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit, minmax(260px, 1fr))",gap:24}}>
            <div onClick={()=>state.fRef.current.click()} className="upload-area" style={{position:"relative"}}>
              {state.isUploading&&<div style={{position:"absolute",top:0,left:0,right:0,bottom:0,background:"rgba(255,255,255,0.8)",display:"flex",alignItems:"center",justifyContent:"center",borderRadius:12,zIndex:10,fontWeight:600,color:"#0d9488"}}>Processing...</div>}
              <svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect><circle cx="8.5" cy="8.5" r="1.5"></circle><polyline points="21 15 16 10 5 21"></polyline></svg>
              <div><div style={{fontWeight:600,fontSize:18,color:"#1e293b",marginBottom:4}}>Create New Pattern</div><div style={{color:"#475569",fontSize:14}}>Upload an image (JPG, PNG)</div></div>
            </div>
            <div onClick={()=>state.loadRef.current.click()} className="upload-area">
              <svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path></svg>
              <div><div style={{fontWeight:600,fontSize:18,color:"#1e293b",marginBottom:4}}>Load Existing Project</div><div style={{color:"#475569",fontSize:14}}>Open a saved JSON file</div></div>
            </div>
            <div onClick={state.startScratch} className="upload-area">
              <svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/></svg>
              <div><div style={{fontWeight:600,fontSize:18,color:"#1e293b",marginBottom:4}}>Design from Scratch</div><div style={{color:"#475569",fontSize:14}}>Start with a blank grid and paint by hand</div></div>
            </div>
          </div>
        </div>}
        <input ref={state.fRef} type="file" accept="image/*" onChange={io.handleFile} style={{display:"none"}}/>
        {(state.img||state.pat)&&<div className="cs-main">
          <div className="canvas-area">
            {state.pat&&state.pal&&<div>
              <window.CreatorPatternTab/>
              <window.CreatorProjectTab/>
              <window.CreatorLegendTab/>
              <window.CreatorPrepareTab/>
              <window.CreatorExportTab/>
            </div>}
            {!state.pat&&state.img&&<div style={{display:"flex",flexDirection:"column",gap:16,padding:"20px 16px"}}>
              {!state.previewUrl&&<div className="card" style={{overflow:"hidden"}}>
                <div style={{padding:"8px 14px 4px",fontSize:12,fontWeight:600,color:"#475569"}}>Original Image</div>
                <img src={state.img.src} style={{width:"100%",display:"block"}} alt="Original"/>
              </div>}
              {state.previewUrl&&<div className="card">
                <div style={{padding:"8px 14px 4px",fontSize:12,fontWeight:600,color:"#475569",display:"flex",alignItems:"center",justifyContent:"space-between"}}>
                  <span>Preview</span>
                  {state.previewDims&&<span style={{fontSize:10,fontWeight:500,color:"#94a3b8"}}>{state.previewDims.pw}×{state.previewDims.ph} px{state.previewDims.pw===state.sW?" — full res":" — "+Math.round(state.previewDims.pw/state.sW*100)+"%"}</span>}
                              {state.stitchCleanup&&state.stitchCleanup.enabled&&state.previewUrl&&<div style={{padding:"4px 14px 4px",display:"flex",alignItems:"center",gap:6}}>
                                <button
                                  onClick={()=>state.setShowCleanupDiff(d=>!d)}
                                  style={{fontSize:11,padding:"3px 8px",borderRadius:6,cursor:"pointer",
                                    border:state.showCleanupDiff?"1px solid #0d9488":"0.5px solid #e2e8f0",
                                    background:state.showCleanupDiff?"#f0fdfa":"#fff",
                                    color:state.showCleanupDiff?"#0d9488":"#475569",
                                    fontWeight:state.showCleanupDiff?600:400,
                                    display:"flex",alignItems:"center",gap:4,lineHeight:1.4}}
                                >{Icons.eye()} {state.showCleanupDiff?"Hide changes":"Show changes"}</button>
                              </div>}
                </div>
                <div style={{padding:"0 14px 10px"}}>
                  <ComparisonSlider originalSrc={state.img.src} previewSrc={state.previewUrl} heatmapSrc={state.previewHeatmap} highlightSrc={state.previewHighlight} width={state.sW} height={state.sH} previewPw={state.previewDims&&state.previewDims.pw} previewPh={state.previewDims&&state.previewDims.ph}/>
                </div>
              </div>}
              {state.previewUrl&&state.previewStats&&<div className="card" style={{padding:"12px 14px"}}>
                <div style={{fontSize:11,fontWeight:600,color:"#475569",textTransform:"uppercase",marginBottom:8}}>Preview Estimates</div>
                <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:"6px 12px"}}>
                  <div><div style={{fontSize:10,color:"#94a3b8"}}>Stitchable</div><div style={{fontSize:13,fontWeight:600,color:"#1e293b"}}>{state.previewStats.stitchable.toLocaleString()}</div></div>
                  {state.skipBg&&<div><div style={{fontSize:10,color:"#94a3b8"}}>Skipped</div><div style={{fontSize:13,fontWeight:600,color:"#1e293b"}}>{state.previewStats.skipped.toLocaleString()}</div></div>}
                  <div><div style={{fontSize:10,color:"#94a3b8"}}>Colours</div><div style={{fontSize:13,fontWeight:600,color:"#1e293b"}}>{state.previewStats.uniqueColors}</div></div>
                  {state.previewStats.stashUsage&&<div><div style={{fontSize:10,color:"#94a3b8"}}>Stash usage</div><div style={{fontSize:13,fontWeight:600,color:"#0d9488"}}>{state.previewStats.stashUsage.used} of {state.previewStats.stashUsage.available}</div></div>}
                  <div><div style={{fontSize:10,color:"#94a3b8"}}>Skeins ({state.fabricCt}ct)</div><div style={{fontSize:13,fontWeight:600,color:"#1e293b"}}>{state.previewStats.estSkeins}</div></div>
                  <div><div style={{fontSize:10,color:"#94a3b8"}}>Time</div><div style={{fontSize:13,fontWeight:600,color:"#1e293b"}}>{fmtTimeL(Math.round(state.previewStats.stitchable/state.stitchSpeed*3600))}</div></div>
                  <div><div style={{fontSize:10,color:"#94a3b8"}}>Thread Cost</div><div style={{fontSize:13,fontWeight:600,color:"#1e293b"}}>£{(state.previewStats.estSkeins*state.skeinPrice).toFixed(2)}</div></div>
                </div>
                {state.previewStats.confettiPct!=null&&(()=>{
                  const t=confettiTier(state.previewStats.confettiPct);
                  const tips={"Excellent":"Great stitch flow","Good":"Low confetti — pleasant to stitch","Moderate":"Some isolated stitches — try the Remove Orphans slider","Challenging":"High confetti — reduce colours or use Remove Orphans","High confetti":"Very tedious — strongly consider removing orphans"};
                  return(
                    <div style={{marginTop:10,paddingTop:10,borderTop:"0.5px solid #e2e8f0"}}>
                      <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",gap:8,marginBottom:4}}>
                        <span style={{fontSize:10,color:"#94a3b8",textTransform:"uppercase",fontWeight:600}}>Confetti stitches</span>
                        <span style={{fontSize:11,fontWeight:700,color:t.color,padding:"1px 7px",borderRadius:10,background:t.color+"18"}}>{t.label}</span>
                      </div>
                      <div style={{display:"flex",alignItems:"center",gap:6}}>
                        <div style={{flex:1,height:5,background:"#e2e8f0",borderRadius:3,overflow:"hidden"}}>
                          <div style={{height:"100%",width:Math.min(100,state.previewStats.confettiPct*4)+"%",background:t.color,borderRadius:3}}/>
                        </div>
                        <span style={{fontSize:12,fontWeight:700,color:t.color,flexShrink:0}}>{state.previewStats.confettiSingles.toLocaleString()} ({state.previewStats.confettiPct.toFixed(1)}%)</span>
                      </div>
                      <div style={{fontSize:10,color:"#94a3b8",marginTop:4}}>{tips[t.label]||""}{state.previewStats.confettiCleanSingles!=null&&state.previewStats.confettiCleanSingles<state.previewStats.confettiSingles?` · ${state.previewStats.confettiCleanSingles.toLocaleString()} after cleanup`:""}</div>
                    </div>
                  );
                })()}
                {state.previewColors&&state.previewColors.length>0&&<div style={{marginTop:12,paddingTop:12,borderTop:"0.5px solid #e2e8f0"}}>
                  <div style={{fontSize:10,fontWeight:600,color:"#94a3b8",textTransform:"uppercase",marginBottom:6}}>Colour Breakdown <span style={{fontWeight:400,textTransform:"none"}}>(hover to highlight)</span></div>
                  <div style={{maxHeight:200,overflowY:"auto",display:"flex",flexDirection:"column",gap:1}}>
                    {state.previewColors.map(function(pcol){
                      var sf=state.previewDims?(state.sW*state.sH)/(state.previewDims.pw*state.previewDims.ph):1;
                      var n=(typeof DMC!=='undefined'&&Array.isArray(DMC))?DMC.find(function(d){return d.id===pcol.id;}):null;
                      return(
                        <div key={pcol.id}
                          style={{display:"flex",alignItems:"center",gap:6,padding:"3px 4px",borderRadius:4,cursor:"default"}}
                          onMouseEnter={function(){
                            if(!state.previewMapped||!state.previewDims)return;
                            var pw=state.previewDims.pw,ph=state.previewDims.ph;
                            var hc=document.createElement('canvas');hc.width=pw;hc.height=ph;
                            var hcx=hc.getContext('2d');
                            var hi=hcx.createImageData(pw,ph);var hd=hi.data;
                            var tid=pcol.id;
                            for(var k=0;k<state.previewMapped.length;k++){var kidx=k*4;var km=state.previewMapped[k];
                              if(km.id===tid){hd[kidx]=255;hd[kidx+1]=255;hd[kidx+2]=255;hd[kidx+3]=180;}
                              else if(km.id!=='__skip__'&&km.id!=='__empty__'){hd[kidx]=0;hd[kidx+1]=0;hd[kidx+2]=0;hd[kidx+3]=130;}
                            }
                            hcx.putImageData(hi,0,0);state.setPreviewHighlight(hc.toDataURL());
                          }}
                          onMouseLeave={function(){state.setPreviewHighlight(null);}}>
                          <div style={{width:12,height:12,borderRadius:2,flexShrink:0,background:'rgb('+pcol.rgb[0]+','+pcol.rgb[1]+','+pcol.rgb[2]+')',border:"0.5px solid rgba(0,0,0,0.12)"}}/>
                          <span style={{fontSize:10,fontWeight:600,color:"#475569",flexShrink:0,minWidth:28}}>{pcol.id}</span>
                          <span style={{fontSize:10,color:"#94a3b8",flex:1,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{n?n.name:''}</span>
                          <span style={{fontSize:10,fontWeight:600,color:"#1e293b",flexShrink:0}}>{Math.round(pcol.count*sf).toLocaleString()}</span>
                        </div>
                      );
                    })}
                  </div>
                </div>}
              </div>}
            </div>}
          </div>
          {state.tab==="pattern"&&<>
            {state.panelOpen&&<div className="rpanel-backdrop" onClick={()=>state.setPanelOpen(false)}/>}
            <div className={"rpanel"+(state.panelOpen?" rpanel--open":"")}>
            <window.CreatorSidebar/>
            {!state.pat&&state.img&&<div className="card" style={{overflow:"hidden"}}>
              <div style={{padding:"7px 12px 4px",fontSize:11,fontWeight:600,color:"#475569"}}>Original Image</div>
              <div style={{position:"relative"}} ref={state.cropRef} onMouseDown={canvas.handleCropMouseDown} onMouseMove={canvas.handleCropMouseMove} onMouseUp={canvas.handleCropMouseUp} onMouseLeave={canvas.handleCropMouseUp}>
                <img src={state.img.src} alt="Original" style={{width:"100%",display:"block",cursor:state.isCropping?"crosshair":(state.pickBg?"crosshair":"default"),opacity:state.isCropping?0.7:1}} onClick={canvas.srcClick}/>
                {state.isCropping&&state.cropRect&&<div style={{position:"absolute",left:state.cropRect.x,top:state.cropRect.y,width:state.cropRect.w,height:state.cropRect.h,border:"2px dashed #0d9488",background:"rgba(13,148,136,0.2)",boxSizing:"border-box",pointerEvents:"none"}}/>}
              </div>
              {state.isCropping?<div style={{padding:"5px 10px",display:"flex",justifyContent:"space-between",alignItems:"center",borderTop:"0.5px solid #f1f5f9"}}>
                <span style={{fontSize:10,color:"#94a3b8"}}>Draw a rectangle</span>
                <div style={{display:"flex",gap:6}}>
                  <button onClick={()=>{state.setIsCropping(false);state.setCropRect(null);}} style={{fontSize:10,padding:"2px 7px",cursor:"pointer",border:"0.5px solid #e2e8f0",borderRadius:6,background:"#f8f9fa"}}>Cancel</button>
                  <button onClick={canvas.applyCrop} style={{fontSize:10,padding:"2px 7px",cursor:"pointer",border:"none",borderRadius:6,background:"#0d9488",color:"#fff"}}>Apply</button>
                </div>
              </div>:<div style={{padding:"5px 10px",display:"flex",justifyContent:"space-between",alignItems:"center",borderTop:"0.5px solid #f1f5f9"}}>
                <span style={{fontSize:10,color:"#94a3b8"}}>{state.origW}×{state.origH}px</span>
                <div style={{display:"flex",gap:6}}>
                  <button onClick={()=>{state.setIsCropping(true);state.setCropRect(null);}} style={{fontSize:10,padding:"2px 7px",cursor:"pointer",border:"0.5px solid #e2e8f0",borderRadius:6,background:"#f8f9fa"}}>Crop</button>
                  <button onClick={()=>state.fRef.current.click()} style={{fontSize:10,padding:"2px 7px",cursor:"pointer",border:"0.5px solid #e2e8f0",borderRadius:6,background:"#f8f9fa"}}>Change</button>
                </div>
              </div>}
              {state.pickBg&&<div style={{padding:"5px 10px",fontSize:10,color:"#ea580c",fontWeight:600,background:"#fff7ed"}}>Click to pick BG</div>}
            </div>}
          </div>}
          </>}
        </div>}
        {state.modal==="help"&&<SharedModals.Help onClose={()=>state.setModal(null)} />}
        {state.modal==="about"&&<SharedModals.About onClose={()=>state.setModal(null)} />}
        {state.modal==="shortcuts"&&<SharedModals.Shortcuts onClose={()=>state.setModal(null)} page="creator" />}
      </div>
      {state.busy&&<div style={{
        position:"fixed",top:0,left:0,right:0,bottom:0,
        background:"rgba(255,255,255,0.8)",zIndex:1000,
        display:"flex",alignItems:"center",justifyContent:"center",
        flexDirection:"column",gap:12
      }}>
        <div style={{
          width:32,height:32,border:"3px solid #e2e8f0",
          borderTopColor:"#0d9488",borderRadius:"50%",
          animation:"spin 0.8s linear infinite"
        }}/>
        <div style={{fontSize:14,color:"#475569",fontWeight:500}}>Generating pattern\u2026</div>
      </div>}
      <window.CreatorToastContainer/>
    </window.PatternDataContext.Provider>
    </window.CanvasContext.Provider>
    </window.AppContext.Provider>
    </window.GenerationContext.Provider>
  );
}

function UnifiedApp(){
  const[mode,setMode]=React.useState(()=>{
    const p=new URLSearchParams(window.location.search);
    if(p.get('mode')==='track') return 'track';
    if(p.get('mode')==='stats') return 'stats';
    if(p.get('mode')==='showcase'){window.history.replaceState({},'','?mode=stats&tab=showcase');return 'stats';}
    return 'home';
  });
  const[creatorResetKey,setCreatorResetKey]=React.useState(0);
  const[trackerMounted,setTrackerMounted]=React.useState(()=>{
    const p=new URLSearchParams(window.location.search);
    return p.get('mode')==='track'||p.get('mode')==='stats';
  });
  const[trackerReady,setTrackerReady]=React.useState(typeof window.TrackerApp!=='undefined');
  const[statsPageReady,setStatsPageReady]=React.useState(typeof window.StatsPage==='function');
  const pendingTrackerProject=React.useRef(null);
  const[homeKey,setHomeKey]=React.useState(0);

  React.useEffect(()=>{
    if(trackerReady)return;
    if((mode==='track'||mode==='stats')&&typeof window.loadTrackerApp==='function') window.loadTrackerApp();
    const poll=setInterval(()=>{if(typeof window.TrackerApp!=='undefined'){setTrackerReady(true);clearInterval(poll);}},50);
    return()=>clearInterval(poll);
  },[trackerReady, mode]);

  // Poll for StatsPage readiness whenever we enter stats mode.
  // Without this, the first click shows GlobalStatsDashboard (old view) because
  // Babel compiles stats-page.js asynchronously after mode is already set to 'stats'.
  React.useEffect(()=>{
    if(mode!=='stats'||statsPageReady)return;
    if(typeof window.loadStatsPage==='function') window.loadStatsPage();
    const poll=setInterval(()=>{if(typeof window.StatsPage==='function'){setStatsPageReady(true);clearInterval(poll);}},50);
    return()=>clearInterval(poll);
  },[mode,statsPageReady]);

  const switchToTrack=React.useCallback((incomingProject)=>{
    if(incomingProject) pendingTrackerProject.current=incomingProject;
    if(typeof window.loadTrackerApp==='function') window.loadTrackerApp();
    setTrackerMounted(true);
    window.history.replaceState({},'','?mode=track');
    setMode('track');
  },[]);
  const switchToDesign=React.useCallback(()=>{
    window.history.replaceState({},'',window.location.pathname);
    setMode('design');
    // When coming from tracker, default to edit mode
    if(window.__setCreatorAppMode) window.__setCreatorAppMode('edit');
  },[]);
  const switchToCreate=React.useCallback(()=>{
    window.history.replaceState({},'',window.location.pathname);
    setMode('design');
    if(window.__setCreatorAppMode) window.__setCreatorAppMode('create');
  },[]);
  const switchToEdit=React.useCallback(()=>{
    window.history.replaceState({},'',window.location.pathname);
    setMode('design');
    if(window.__setCreatorAppMode) window.__setCreatorAppMode('edit');
  },[]);
  const prevModeRef=React.useRef(null);
  const modeRef=React.useRef(mode);
  modeRef.current=mode;
  const closeStats=React.useCallback(()=>{
    const prev=prevModeRef.current;
    if(prev==='track'){window.history.replaceState({},'','?mode=track');setMode('track');}
    else if(prev==='design'){window.history.replaceState({},'',window.location.pathname);setMode('design');}
    else{window.history.replaceState({},'',window.location.pathname);setHomeKey(k=>k+1);setMode('home');}
  },[]);
  const switchToShowcase=React.useCallback(()=>switchToStats({tab:'showcase'}),[]);
  const switchToStats=React.useCallback((params)=>{
    if(modeRef.current==='stats'&&!params){closeStats();return;}
    // When switching from track mode, open per-project stats inline inside the tracker
    // rather than navigating to the global all-projects dashboard.
    if(modeRef.current==='track'&&!params&&typeof window.__openTrackerStats==='function'){
      window.__openTrackerStats();
      return;
    }
    prevModeRef.current=modeRef.current;
    if(typeof window.loadTrackerApp==='function') window.loadTrackerApp();
    if(typeof window.loadStatsPage==='function') window.loadStatsPage();
    setTrackerMounted(true);
    const qs=params?'?mode=stats&'+new URLSearchParams(params).toString():'?mode=stats';
    window.history.replaceState({},'',qs);
    setMode('stats');
  },[closeStats]);
  const goHome=React.useCallback(()=>{
    window.history.replaceState({},'',window.location.pathname);
    setHomeKey(k=>k+1);
    setMode('home');
  },[]);

  React.useEffect(()=>{
    window.__switchToTrack=switchToTrack;
    window.__switchToDesign=switchToDesign;
    window.__switchToCreate=switchToCreate;
    window.__switchToEdit=switchToEdit;
    window.__switchToStats=switchToStats;
    window.__goHome=goHome;
    return()=>{delete window.__switchToTrack;delete window.__switchToDesign;delete window.__switchToCreate;delete window.__switchToEdit;delete window.__switchToStats;delete window.__goHome;};
  },[switchToTrack,switchToDesign,switchToCreate,switchToEdit,switchToStats,goHome]);

  const handleHomeOpenCreatorWithImage=React.useCallback((file)=>{
    window.__pendingCreatorFile=file;
    if(typeof ProjectStorage!=='undefined') ProjectStorage.clearActiveProject();
    setCreatorResetKey(k=>k+1);
    window.history.replaceState({},'',window.location.pathname);
    setMode('design');
  },[]);

  const handleHomeOpenCreatorBlank=React.useCallback(()=>{
    window.__pendingCreatorAction='scratch';
    if(typeof ProjectStorage!=='undefined') ProjectStorage.clearActiveProject();
    setCreatorResetKey(k=>k+1);
    window.history.replaceState({},'',window.location.pathname);
    setMode('design');
    // Scratch mode → Edit, not Create
    setTimeout(()=>{if(window.__setCreatorAppMode) window.__setCreatorAppMode('edit');},0);
  },[]);

  const handleHomeOpenFile=React.useCallback((file)=>{
    const ext=file.name.split('.').pop().toLowerCase();
    if(ext==='json'){
      window.__pendingCreatorJsonFile=file;
      setCreatorResetKey(k=>k+1);
      window.history.replaceState({},'',window.location.pathname);
      setMode('design');
    } else if(ext==='oxs'||ext==='pdf'){
      window.__pendingTrackerImportFile=file;
      if(typeof window.loadTrackerApp==='function') window.loadTrackerApp();
      setTrackerMounted(true);
      window.history.replaceState({},'','?mode=track');
      setMode('track');
    } else if(ext==='png'||ext==='jpg'||ext==='jpeg'){
      window.__pendingCreatorFile=file;
      if(typeof ProjectStorage!=='undefined') ProjectStorage.clearActiveProject();
      setCreatorResetKey(k=>k+1);
      window.history.replaceState({},'',window.location.pathname);
      setMode('design');
    }
  },[]);

  const handleHomeImportPattern=React.useCallback((file)=>{
    window.__pendingTrackerImportFile=file;
    if(typeof window.loadTrackerApp==='function') window.loadTrackerApp();
    setTrackerMounted(true);
    window.history.replaceState({},'','?mode=track');
    setMode('track');
  },[]);

  const handleHomeOpenProject=React.useCallback((projectMeta, targetMode)=>{
    if(!projectMeta||!projectMeta.id) return;
    ProjectStorage.setActiveProject(projectMeta.id);
    if(targetMode==='tracker'){
      ProjectStorage.get(projectMeta.id).then(fullProject=>{
        if(fullProject){
          switchToTrack({project:fullProject, key:Date.now()});
        }
      });
    } else {
      setCreatorResetKey(k=>k+1);
      window.history.replaceState({},'',window.location.pathname);
      setMode('design');
    }
  },[switchToTrack]);

  const handleHomeNavigateToStash=React.useCallback(()=>{
    window.location.href='manager.html';
  },[]);

  const[homeModal,setHomeModal]=React.useState(null);
  const[homePrefsOpen,setHomePrefsOpen]=React.useState(false);

  const T=typeof window.TrackerApp!=='undefined'?window.TrackerApp:null;
  return <>
    {mode==='home'&&<div>
      <Header page="home" tab="" onPageChange={()=>{}} setModal={setHomeModal}
        onPreferences={typeof window.PreferencesModal!=='undefined'?()=>setHomePrefsOpen(true):undefined} />
      {homePrefsOpen&&typeof window.PreferencesModal!=='undefined'&&React.createElement(window.PreferencesModal,{onClose:()=>setHomePrefsOpen(false)})}
      <HomeScreen
        key={homeKey}
        onOpenCreatorWithImage={handleHomeOpenCreatorWithImage}
        onOpenCreatorBlank={handleHomeOpenCreatorBlank}
        onOpenFile={handleHomeOpenFile}
        onImportPattern={handleHomeImportPattern}
        onOpenProject={handleHomeOpenProject}
        onNavigateToStash={handleHomeNavigateToStash}
        onOpenGlobalStats={switchToStats}
        onOpenShowcase={switchToShowcase}
      />
      {homeModal==='help'&&<SharedModals.Help onClose={()=>setHomeModal(null)} />}
    </div>}
    <div key={creatorResetKey} style={{display:mode==='design'?'':'none'}}>
      <CreatorErrorBoundary><CreatorApp onSwitchToTrack={switchToTrack} isActive={mode==='design'}/></CreatorErrorBoundary>
    </div>
    <div style={{display:mode==='track'?'':'none'}}>
      {trackerMounted&&!trackerReady&&(
        <div style={{display:'flex',alignItems:'center',justifyContent:'center',height:'100vh',flexDirection:'column',gap:12,color:'#475569',fontSize:14}}>
          <div style={{width:28,height:28,border:'2.5px solid #e2e8f0',borderTopColor:'#0d9488',borderRadius:'50%',animation:'spin 0.8s linear infinite'}}/>
          Loading Stitch Tracker…
        </div>
      )}
      {trackerMounted&&trackerReady&&T&&<T
        onSwitchToDesign={switchToDesign}
        onGoHome={goHome}
        isActive={mode==='track'}
        incomingProject={pendingTrackerProject.current}
      />}
    </div>
    {mode==='stats'&&<div style={{position:'fixed',inset:0,background:'var(--surface)',zIndex:100,overflowY:'auto'}}>
      <Header page="stats" tab="" onPageChange={()=>{}} setModal={()=>{}} />
      {statsPageReady
        ?<window.StatsPage onClose={closeStats} onNavigateToProject={(id)=>{switchToTrack({id})}} onNavigateToStash={()=>{window.location.href='manager.html';}} />
        :<div style={{display:'flex',alignItems:'center',justifyContent:'center',height:'60vh'}}><span style={{opacity:0.5}}>Loading stats…</span></div>}
    </div>}
  </>;
}

ReactDOM.createRoot(document.getElementById("root")).render(<UnifiedApp/>);
