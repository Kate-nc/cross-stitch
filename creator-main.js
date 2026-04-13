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
  const rafRef = useRef(null);       // FIX 2: rAF throttle handle
  const pendingPosRef = useRef(null); // FIX 2: latest pending position
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

  // FIX 2: compute clamped split% from a pointer event
  function computePos(e) {
    if (!containerRef.current) return null;
    var rect = containerRef.current.getBoundingClientRect();
    return Math.max(5, Math.min(95, ((e.clientX - rect.left) / rect.width) * 100));
  }
  // FIX 2: schedule a single setSplitPos call per animation frame
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
    var pos = computePos(e); // FIX 2: use helper
    if (pos !== null) scheduleUpdate(pos); // FIX 2: rAF throttle
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
          var pos=computePos(e); // FIX 1: snap divider to click position immediately
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
          if(rafRef.current){cancelAnimationFrame(rafRef.current);rafRef.current=null;} // FIX 2: flush pending position before clearing rAF
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
        }} // FIX 3
        onPointerLeave={function(){if(!dragging.current)setZoomPos(null);}}>
        <img src={originalSrc} draggable={false} onDragStart={function(e){e.preventDefault();}} style={{position:"absolute",top:0,left:0,width:"100%",height:"100%",objectFit:"fill"}} alt="Original"/>       {/* FIX 4 */}
        <div style={{position:"absolute",top:0,left:0,right:0,bottom:0,clipPath:`inset(0 0 0 ${splitPos}%)`}}>
          <img src={previewSrc} draggable={false} onDragStart={function(e){e.preventDefault();}} style={{position:"absolute",top:0,left:0,width:"100%",height:"100%",objectFit:"fill",imageRendering:"pixelated"}} alt="Preview"/>  {/* FIX 4 */}
        </div>
        {showDiff&&diffUrl&&<img src={diffUrl} style={{position:"absolute",top:0,left:0,width:"100%",height:"100%",objectFit:"fill",pointerEvents:"none",zIndex:4}} alt="" aria-hidden="true"/>}
        {showHeatmap&&heatmapSrc&&<img src={heatmapSrc} style={{position:"absolute",top:0,left:0,width:"100%",height:"100%",objectFit:"fill",imageRendering:"pixelated",pointerEvents:"none",zIndex:5}} alt="" aria-hidden="true"/>}
        {highlightSrc&&<img src={highlightSrc} style={{position:"absolute",top:0,left:0,width:"100%",height:"100%",objectFit:"fill",imageRendering:"pixelated",pointerEvents:"none",zIndex:6}} alt="" aria-hidden="true"/>}
        <div style={{position:"absolute",top:0,bottom:0,left:`${splitPos}%`,width:3,background:"#fff",boxShadow:"0 0 4px rgba(0,0,0,0.3)",transform:"translateX(-50%)",zIndex:2,pointerEvents:"none",willChange:"left"}}> {/* FIX 5 */}
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
  useKeyboardShortcutsHook(state, history, io);

  const ctx = {...state, ...history, ...canvas, ...io, isActive};

  return (
    <window.CreatorContext.Provider value={ctx}>
      <input ref={state.loadRef} type="file" accept=".json" onChange={io.loadProject} style={{display:"none"}}/>
      <Header page="creator" tab={state.tab} onPageChange={state.setTab}
        onOpen={()=>state.loadRef.current.click()}
        onSave={state.pat&&state.pal?io.saveProject:null}
        onTrack={state.pat&&state.pal?io.handleOpenInTracker:null}
        onExportPDF={state.pat?()=>exportPDF({displayMode:state.pdfDisplayMode,cellSize:state.pdfCellSize,singlePage:state.pdfSinglePage},ctx):null}
        onNewProject={()=>{if(!state.pat||confirm("Start a new project? Unsaved changes will be lost."))state.resetAll();}}
        setModal={state.setModal} />
      {state.pat&&state.pal&&<ContextBar
        name={state.projectName||(state.sW+'×'+state.sH+' pattern')}
        dimensions={{width:state.sW,height:state.sH}}
        palette={state.pal}
        pct={null}
        page="creator"
        onTrack={io.handleOpenInTracker}
        onSave={io.saveProject}
        onNameChange={n=>state.setProjectName(n)}
      />}
      {state.namePromptOpen&&<NamePromptModal
        defaultName={state.projectName||(state.sW+'×'+state.sH+' pattern')}
        onConfirm={name=>{state.setProjectName(name);state.setNamePromptOpen(false);io.doSaveProject(name);}}
        onCancel={()=>state.setNamePromptOpen(false)}
      />}
      <window.CreatorToolStrip/>
      <div className="cs-page-content" style={{padding:"20px 16px"}}>
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
          {state.tab!=="stitch"&&<div className="rpanel">
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
    </window.CreatorContext.Provider>
  );
}

function UnifiedApp(){
  const[mode,setMode]=React.useState(()=>{
    const p=new URLSearchParams(window.location.search);
    if(p.get('mode')==='track') return 'track';
    return 'home';
  });
  const[creatorResetKey,setCreatorResetKey]=React.useState(0);
  const[trackerMounted,setTrackerMounted]=React.useState(()=>{
    const p=new URLSearchParams(window.location.search);
    return p.get('mode')==='track';
  });
  const[trackerReady,setTrackerReady]=React.useState(typeof window.TrackerApp!=='undefined');
  const pendingTrackerProject=React.useRef(null);
  const[homeKey,setHomeKey]=React.useState(0);

  React.useEffect(()=>{
    if(trackerReady)return;
    if(mode==='track'&&typeof window.loadTrackerApp==='function') window.loadTrackerApp();
    const poll=setInterval(()=>{if(typeof window.TrackerApp!=='undefined'){setTrackerReady(true);clearInterval(poll);}},50);
    return()=>clearInterval(poll);
  },[trackerReady]);

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
  },[]);
  const goHome=React.useCallback(()=>{
    window.history.replaceState({},'',window.location.pathname);
    setHomeKey(k=>k+1);
    setMode('home');
  },[]);

  React.useEffect(()=>{
    window.__switchToTrack=switchToTrack;
    window.__switchToDesign=switchToDesign;
    window.__goHome=goHome;
    return()=>{delete window.__switchToTrack;delete window.__switchToDesign;delete window.__goHome;};
  },[switchToTrack,switchToDesign,goHome]);

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

  const T=typeof window.TrackerApp!=='undefined'?window.TrackerApp:null;
  return <>
    {mode==='home'&&<div>
      <Header page="home" tab="" onPageChange={()=>{}} setModal={setHomeModal} />
      <HomeScreen
        key={homeKey}
        onOpenCreatorWithImage={handleHomeOpenCreatorWithImage}
        onOpenCreatorBlank={handleHomeOpenCreatorBlank}
        onOpenFile={handleHomeOpenFile}
        onImportPattern={handleHomeImportPattern}
        onOpenProject={handleHomeOpenProject}
        onNavigateToStash={handleHomeNavigateToStash}
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
  </>;
}

ReactDOM.createRoot(document.getElementById("root")).render(<UnifiedApp/>);
