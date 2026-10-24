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
  if(pct<2)return{color:"#4F7D3F",label:"Excellent"};
  if(pct<5)return{color:"#5E8B2D",label:"Good"};
  if(pct<8)return{color:"#A06F2D",label:"Moderate"};
  if(pct<15)return{color:"#A04E11",label:"Challenging"};
  return{color:"#A53D3D",label:"High confetti"};
}

function ComparisonSlider({originalSrc, previewSrc, heatmapSrc, highlightSrc, tidiedSrc, changedSrc, width, height, previewPw, previewPh, leftLabel, rightLabel, fabricColour, previewLoading = false}) {
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
  // magnifier toggle — stays active without holding Alt
  const [zoomLocked, setZoomLocked] = useState(false);
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
    return function() { if (rafRef.current) cancelAnimationFrame(rafRef.current); };
  }, []);

  function handlePointerMove(e) {
    if ((altHeld.current || zoomLocked) && containerRef.current) {
      var rect = containerRef.current.getBoundingClientRect();
      if (rect.width > 0) setZoomPos({cx: e.clientX - rect.left, cy: e.clientY - rect.top, W: rect.width, H: rect.height});
    } else if (zoomPos) { setZoomPos(null); }
    if (!dragging.current) return;
    var pos = computePos(e);
    if (pos !== null) scheduleUpdate(pos);
  }

  var LENS = 140, ZOOM = 2.5;
  // Skipped cells are transparent in the preview picture. Behind the preview they
  // must read as the fabric the finished pattern leaves there, not as the original.
  var fabricBg = fabricColour || "var(--surface)";
  // Shape the box from the picture on screen, not the size just typed in: for a
  // moment after a size change the two differ, and the picture would stretch.
  var shownW = previewPw || width, shownH = previewPh || height;

  return (
    <div>
      <div ref={containerRef} data-testid="cmp-box"
        style={{position:"relative",width:"100%",aspectRatio:`${shownW}/${shownH}`,overflow:"hidden",cursor:altDown?"zoom-in":(zoomLocked?"crosshair":"ew-resize"),borderRadius:"var(--radius-md)",border:"1px solid var(--line)",userSelect:"none",touchAction:"none"}}
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
        <div data-testid="cmp-preview-layer" style={{position:"absolute",top:0,left:0,right:0,bottom:0,clipPath:`inset(0 0 0 ${splitPos}%)`,background:fabricBg}}>
          <img src={previewSrc} draggable={false} onDragStart={function(e){e.preventDefault();}} style={{position:"absolute",top:0,left:0,width:"100%",height:"100%",objectFit:"fill",imageRendering:"pixelated"}} alt="Preview"/>
        </div>
        {!previewLoading&&changedSrc&&<img data-testid="cvp-changed" src={changedSrc} className="cvp-overlay" style={{clipPath:`inset(0 0 0 ${splitPos}%)`}} alt="" aria-hidden="true"/>}
        {!previewLoading&&showHeatmap&&heatmapSrc&&<img data-testid="cmp-heatmap" src={heatmapSrc} style={{clipPath:`inset(0 0 0 ${splitPos}%)`,position:"absolute",top:0,left:0,width:"100%",height:"100%",objectFit:"fill",imageRendering:"pixelated",pointerEvents:"none",zIndex:5}} alt="" aria-hidden="true"/>}
        {!previewLoading&&tidiedSrc&&<img data-testid="cmp-tidied" src={tidiedSrc} style={{clipPath:`inset(0 0 0 ${splitPos}%)`,position:"absolute",top:0,left:0,width:"100%",height:"100%",objectFit:"fill",imageRendering:"pixelated",pointerEvents:"none",zIndex:5}} alt="" aria-hidden="true"/>}
        {!previewLoading&&highlightSrc&&<img data-testid="cmp-highlight" src={highlightSrc} style={{clipPath:`inset(0 0 0 ${splitPos}%)`,position:"absolute",top:0,left:0,width:"100%",height:"100%",objectFit:"fill",imageRendering:"pixelated",pointerEvents:"none",zIndex:6}} alt="" aria-hidden="true"/>}
        <div
          role="slider"
          tabIndex={0}
          aria-label="Compare original vs preview — split position"
          aria-valuemin={5}
          aria-valuemax={95}
          aria-valuenow={Math.round(splitPos)}
          onFocus={function(){ setSweeping(false); }}
          onKeyDown={function(e){
            var step = e.shiftKey ? 10 : 2;
            if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') {
              e.preventDefault();
              var nextL = Math.max(5, splitPosRef.current - step);
              splitPosRef.current = nextL; setSplitPos(nextL);
            } else if (e.key === 'ArrowRight' || e.key === 'ArrowUp') {
              e.preventDefault();
              var nextR = Math.min(95, splitPosRef.current + step);
              splitPosRef.current = nextR; setSplitPos(nextR);
            } else if (e.key === 'Home') {
              e.preventDefault(); splitPosRef.current = 5; setSplitPos(5);
            } else if (e.key === 'End') {
              e.preventDefault(); splitPosRef.current = 95; setSplitPos(95);
            }
          }}
          style={{position:"absolute",top:0,bottom:0,left:`${splitPos}%`,width:3,background:"#fff",boxShadow:"0 0 4px rgba(0,0,0,0.3)",transform:"translateX(-50%)",zIndex:2,willChange:"left",cursor:"ew-resize"}}>
          <div style={{position:"absolute",top:"50%",left:"50%",transform:"translate(-50%,-50%)",width:28,height:28,borderRadius:"50%",background:"var(--surface)",boxShadow:"0 1px 4px rgba(0,0,0,0.2)",display:"flex",alignItems:"center",justifyContent:"center",color:"var(--text-secondary)"}} aria-hidden="true"><span style={{display:"inline-flex",width:16,height:16}}>{Icons.arrowsHorizontal()}</span></div>
        </div>
        <span style={{position:"absolute",top:8,left:8,fontSize:10,fontWeight:600,color:"#fff",background:"rgba(0,0,0,0.5)",padding:"2px 8px",borderRadius:4,zIndex:3,pointerEvents:"none"}}>{leftLabel||"Original"}</span>
        <span style={{position:"absolute",top:8,right:8,fontSize:10,fontWeight:600,color:"#fff",background:"rgba(0,0,0,0.5)",padding:"2px 8px",borderRadius:4,zIndex:3,pointerEvents:"none"}}>{rightLabel||"Preview"}</span>
        {previewPw&&previewPh&&<span style={{position:"absolute",bottom:8,right:8,fontSize:9,fontWeight:500,color:"#fff",background:"rgba(0,0,0,0.45)",padding:"2px 6px",borderRadius:4,zIndex:3,pointerEvents:"none"}}>{previewPw}×{previewPh} px</span>}
        {zoomPos&&(function(){
          var cx=zoomPos.cx,cy=zoomPos.cy,W=zoomPos.W,H=zoomPos.H;
          var bgSzW=W*ZOOM,bgSzH=H*ZOOM;
          var bgX=-(cx*ZOOM-LENS/2),bgY=-(cy*ZOOM-LENS/2);
          var lensL=Math.max(0,Math.min(W-LENS,cx-LENS/2));
          var lensT=Math.max(0,Math.min(H-LENS,cy-LENS/2));
          var splitInLensPct=Math.max(0,Math.min(100,(LENS/2+(splitPos/100*W-cx)*ZOOM)/LENS*100));
          return (
            <div style={{position:"absolute",left:lensL,top:lensT,width:LENS,height:LENS,borderRadius:"50%",overflow:"hidden",border:"2px solid #fff",boxShadow:"0 2px 12px rgba(0,0,0,0.4)",zIndex:10,pointerEvents:"none"}}>
              <div style={{position:"absolute",top:0,left:0,right:0,bottom:0,backgroundImage:`url('${originalSrc}')`,backgroundSize:`${bgSzW}px ${bgSzH}px`,backgroundPosition:`${bgX}px ${bgY}px`,backgroundRepeat:"no-repeat"}}/>
              <div style={{position:"absolute",top:0,left:0,right:0,bottom:0,clipPath:`inset(0 0 0 ${splitInLensPct}%)`,backgroundColor:fabricBg,backgroundImage:`url('${previewSrc}')`,backgroundSize:`${bgSzW}px ${bgSzH}px`,backgroundPosition:`${bgX}px ${bgY}px`,backgroundRepeat:"no-repeat",imageRendering:"pixelated"}}/>
            </div>
          );
        })()}
      </div>
      <div className="cvp-tools" style={{marginTop:8}}>
        <button type="button" className={"cs-seltools__btn"+(sweeping?" cs-seltools__btn--on":"")} aria-pressed={sweeping?"true":"false"}
          onClick={function(){setSweeping(function(s){if(!s){sweepDirRef.current=1;splitPosRef.current=splitPos;}return !s;});}}>
          {sweeping?<>{Icons.pause()}<span>Pause</span></>:<>{Icons.play()}<span>Auto-sweep</span></>}
        </button>
        <button type="button" className={"cs-seltools__btn"+(zoomLocked?" cs-seltools__btn--on":"")} aria-pressed={zoomLocked?"true":"false"}
          onClick={function(){setZoomLocked(function(z){return !z;});}}
          title={zoomLocked?"Turn off magnifier":"Turn on magnifier (or hold Alt)"}>
          {Icons.magnify()}<span>Magnifier</span>
        </button>
        {heatmapSrc&&<button type="button" className={"cs-seltools__btn"+(showHeatmap?" cs-seltools__btn--on":"")} aria-pressed={showHeatmap?"true":"false"}
          onClick={function(){setShowHeatmap(function(h){return !h;});}}>
          {Icons.fire()}<span>Show confetti</span>
        </button>}
        {/* Touch screens have no Alt key, and the Magnifier button sits right here. */}
        {!zoomLocked&&!(window.Platform&&window.Platform.isCoarsePointer&&window.Platform.isCoarsePointer())&&<span style={{fontSize:"var(--text-xs)",color:"var(--text-secondary)"}}>Hold Alt to zoom</span>}
      </div>
    </div>
  );
}
window.ComparisonSlider = ComparisonSlider;

// ── Convert preview (the card in the middle of Convert) ────────────────────
// Three ways to look at the chart the current settings make:
//   Stitched       crosses of thread on the chosen fabric (StitchedPreview.js),
//                  the closest to the finished piece; the default.
//   Flat           every stitch as a square of its thread colour, whole.
//   Before / after the picture and the chart on either side of a slider.
// Above it, a line says what the last change did (usePreview.js
// describePreviewChange). Once a chart exists, Convert still shows this live
// preview, and says when it differs from the chart until Regenerate.
const PREVIEW_VIEWS = [
  { id: 'stitched', label: 'Stitched', title: 'How the finished piece will look: crosses of thread on your fabric' },
  { id: 'flat', label: 'Flat', title: 'Every stitch as a square of its thread colour' },
  { id: 'compare', label: 'Before / after', title: 'Your picture and the chart either side of a slider' }
];
function loadPreviewView() {
  try {
    const v = window.UserPrefs && window.UserPrefs.get('creator.convertPreviewView');
    if (PREVIEW_VIEWS.some(function(x){ return x.id === v; })) return v;
  } catch (_) {}
  return 'stitched';
}
function describeChangeText(change) {
  if (!change) return null;
  const names = change.settings.length > 3 ? change.settings.slice(0, 3).join(', ') + ' and more' : change.settings.join(', ');
  const parts = [];
  if (change.changedStitches != null) {
    if (change.changedStitches === 0) parts.push('no stitches changed');
    else parts.push((change.estimated ? 'about ' : '') + change.changedStitches.toLocaleString('en-GB') + ' stitch' + (change.changedStitches === 1 ? '' : 'es') + ' changed' +
      (change.total ? ' (' + (change.changedStitches / change.total * 100).toFixed(change.changedStitches / change.total < 0.01 ? 1 : 0) + '%)' : ''));
  }
  change.stats.forEach(function(st) { parts.push(st.label + ' ' + st.from + ' to ' + st.to); });
  return { names: names, detail: parts.length ? parts.join(', ') : 'no visible change to the chart' };
}
function ConvertPreview({state, onRetry}) {
  const [view, setViewRaw] = useState(loadPreviewView);
  const [closeUp, setCloseUp] = useState(false);
  const [showConfetti, setShowConfetti] = useState(false);
  const [showChanged, setShowChanged] = useState(false);
  // The stitched view is drawn at the size it is shown, in device pixels, so
  // the browser never shrinks a big canvas (which shimmers into moire).
  const bodyRef = useRef(null);
  const [bodyW, setBodyW] = useState(0);
  useEffect(function() {
    const el = bodyRef.current;
    if (!el) return;
    const measure = function() { setBodyW(el.clientWidth || 0); };
    measure();
    if (typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return function() { ro.disconnect(); };
  }, []);
  function setView(v) {
    setViewRaw(v);
    try { if (window.UserPrefs) window.UserPrefs.set('creator.convertPreviewView', v); } catch (_) {}
  }
  const dims = state.previewDims;
  const pw = dims ? dims.pw : state.sW, ph = dims ? dims.ph : state.sH;
  // The preview's cells, kept through an update so the stitched view never blanks.
  const stitchData = useMemo(function() {
    if (!state.previewMapped || !dims) return null;
    return { pat: state.previewMapped, cmap: null, pal: null, sW: dims.pw, sH: dims.ph, fabricCt: state.fabricCt };
  }, [state.previewMapped, dims, state.fabricCt]);
  const lastStitchData = useRef(null);
  if (stitchData) lastStitchData.current = stitchData;
  const shownStitchData = stitchData || lastStitchData.current;
  const fabricBg = state.fabricColour || 'var(--surface)';
  const ct = state.fabricCt || 14;
  const chartState = window.convertChartState ? window.convertChartState(state.pat, state.lastGenSnapshot, state.conversionSettings, state.img) : null;
  const changeText = !state.previewLoading ? describeChangeText(state.previewChange) : null;
  const loadingSpinner = state.previewLoading && <span role="status" aria-label="Updating preview" title="Updating preview" className="preview-spinner cvp-spinner">{Icons.spinner()}</span>;

  // Overlays share the chart's box: confetti, the stitches tidying changed,
  // and the colour picked in the breakdown below.
  const overlay = (src, testId) => src ? <img data-testid={testId} src={src} className="cvp-overlay" alt="" aria-hidden="true"/> : null;
  const overlays = !state.previewLoading && <>
    {showConfetti && overlay(state.previewHeatmap, 'cvp-heatmap')}
    {state.showTidied && overlay(state.previewTidied, 'cvp-tidied')}
    {showChanged && overlay(state.previewChanged, 'cvp-changed')}
    {overlay(state.previewHighlight, 'cvp-highlight')}
  </>;

  let body;
  if (view === 'compare') {
    body = <ComparisonSlider originalSrc={state.img.src} previewSrc={state.previewUrl} heatmapSrc={state.previewHeatmap} highlightSrc={state.previewHighlight} changedSrc={showChanged ? state.previewChanged : null} tidiedSrc={state.showTidied ? state.previewTidied : null} width={state.sW} height={state.sH} previewPw={dims&&dims.pw} previewPh={dims&&dims.ph} fabricColour={state.fabricColour} previewLoading={state.previewLoading}/>;
  } else if (view === 'flat') {
    body = <div className="cvp-box" data-testid="cvp-flat" style={{aspectRatio:pw+'/'+ph,background:fabricBg}}>
      <img src={state.previewUrl} alt="Preview" className="cvp-flat"/>
      {overlays}
    </div>;
  } else {
    body = <div className={'cvp-stitched' + (closeUp ? ' cvp-stitched--close' : '')} data-testid="cvp-stitched">
      {shownStitchData && window.CreatorStitchedPreview
        ? <div className="cvp-stitched__inner">
            <window.CreatorStitchedPreview cells={shownStitchData.pat} width={shownStitchData.sW} height={shownStitchData.sH}
              fabricColour={state.fabricColour} fabricCt={ct} displayWidth={Math.max(0, bodyW - 2)} closeUp={closeUp}/>
            {overlays}
          </div>
        : <div className="cvp-wait">Updating preview…</div>}
    </div>;
  }

  return (
    <div className="card cvp" data-preview-view={view}>
      {state.conversionSettings&&state.conversionSettings.stashConstrained&&state.conversionSettings.stashCount===0&&(
        <div role="status" className="cvp-note cvp-note--warn">
          <span className="cvp-note__icon" aria-hidden="true">{Icons.warning()}</span>
          No threads marked as owned, so the preview uses every thread. Add threads in the Stash Manager to see a stash-only preview.
        </div>
      )}
      <div className="cvp-head">
        <div className="cvp-head__title">
          <h2 className="cvp-title">Preview{loadingSpinner}</h2>
          {dims && <span className="cvp-size" data-preview-size="">{dims.pw} × {dims.ph} stitches · {window.finishedSizeText(dims.pw, dims.ph, ct)} on {window.fabricShortLabel(ct)}{dims.pw !== state.sW ? ' (shown smaller)' : ''}</span>}
        </div>
        <div className="lp-segmented cvp-views" role="radiogroup" aria-label="Preview view">
          {PREVIEW_VIEWS.map(function(v, i) {
            const on = view === v.id;
            return <button key={v.id} type="button" role="radio" aria-checked={on ? 'true' : 'false'} tabIndex={on ? 0 : -1}
              className={'lp-seg' + (on ? ' lp-seg--on' : '')} title={v.title} data-preview-view={v.id}
              onClick={function(){ setView(v.id); }}
              onKeyDown={function(e){
                const step = (e.key === 'ArrowRight' || e.key === 'ArrowDown') ? 1 : (e.key === 'ArrowLeft' || e.key === 'ArrowUp') ? -1 : 0;
                if (!step) return;
                e.preventDefault();
                const next = PREVIEW_VIEWS[(i + step + PREVIEW_VIEWS.length) % PREVIEW_VIEWS.length];
                setView(next.id);
                const sib = e.currentTarget.parentNode && e.currentTarget.parentNode.querySelector('[data-preview-view="' + next.id + '"]');
                if (sib) sib.focus();
              }}>{v.label}</button>;
          })}
        </div>
      </div>
      {(chartState === 'changed' || chartState === 'unknown') && <div role="status" className="cvp-note cvp-note--stale">
        <span className="cvp-note__icon" aria-hidden="true">{Icons.info()}</span>
        <span>{chartState === 'changed'
          ? 'This preview shows your new settings. Your chart changes when you Regenerate.'
          : 'This preview shows these settings; your chart may differ. It changes only when you Regenerate.'}</span>
      </div>}
      {changeText && <p className="cvp-change" data-preview-change="" aria-live="polite"><strong>{changeText.names}:</strong> {changeText.detail}.</p>}
      <div className="cvp-body" ref={bodyRef}>{body}</div>
      {<div className="cvp-tools">
        {view === 'stitched' && <button type="button" className="cs-seltools__btn" aria-pressed={closeUp ? 'true' : 'false'} onClick={function(){ setCloseUp(function(c){ return !c; }); }}>
          {closeUp ? Icons.magnifyMinus() : Icons.magnifyPlus()}<span>{closeUp ? 'Fit' : 'Close up'}</span></button>}
        {view !== 'compare' && state.previewHeatmap && <button type="button" className={'cs-seltools__btn' + (showConfetti ? ' cs-seltools__btn--on' : '')} aria-pressed={showConfetti ? 'true' : 'false'}
          onClick={function(){ setShowConfetti(function(c){ return !c; }); }}>{Icons.fire()}<span>Show confetti</span></button>}
        {state.previewChanged && <button type="button" className="cs-seltools__btn" aria-pressed={showChanged} disabled={state.previewLoading}
          onClick={()=>setShowChanged(c=>!c)}>{Icons.eye()}<span>Show what changed</span></button>}
        <button type="button" className="cs-seltools__btn" disabled={state.previewLoading || !state.previewSnapshot} onClick={state.pinPreview}>Pin this preview</button>
        {state.previewTidied && <button type="button" className={'cs-seltools__btn' + (state.showTidied ? ' cs-seltools__btn--on' : '')} aria-pressed={state.showTidied ? 'true' : 'false'}
          onClick={function(){ state.setShowTidied(!state.showTidied); }}>{Icons.eye()}<span>Show tidied stitches</span></button>}
      </div>}
      {view === 'stitched' && <p className="cvp-caption">Simulated stitches: 2 strands on {window.fabricShortLabel(ct)} fabric in your fabric colour. Screens show thread colours only roughly.</p>}
    </div>
  );
}
window.ConvertPreview = ConvertPreview;



function PatternEstimates({state}) {
  const [selected, setSelected] = useState(null);
  useEffect(()=>{setSelected(null);},[state.previewMapped]);
  const ps = state.previewStats;
  const money = c => window.AppPrefs?.formatCurrency ? window.AppPrefs.formatCurrency(c) : '\u00A3'+c.toFixed(2);
  const rows = [['Stitches',ps.stitchable.toLocaleString('en-GB')],['Skipped',ps.skipped.toLocaleString('en-GB')],['Chart symbols',ps.uniqueColors],['Threads',ps.threadsUsed],['Skeins',ps.estSkeins],['Time',fmtTimeL(Math.round(ps.stitchable/state.stitchSpeed*3600))],['Cost',money(ps.estSkeins*state.skeinPrice)]];
  function highlight(id) {
    if(selected===id){setSelected(null);state.setPreviewHighlight(null);return;}
    if(!state.previewMapped||!state.previewDims)return;
    const {pw,ph}=state.previewDims, c=document.createElement('canvas');c.width=pw;c.height=ph;
    const cx=c.getContext('2d'), data=cx.createImageData(pw,ph);
    state.previewMapped.forEach((m,i)=>{const k=i*4;if(m.id===id){data.data[k]=255;data.data[k+1]=255;data.data[k+2]=255;data.data[k+3]=180;}else if(m.id!=='__skip__'&&m.id!=='__empty__'){data.data[k+3]=150;}});
    cx.putImageData(data,0,0);state.setPreviewHighlight(c.toDataURL());setSelected(id);
  }
  return <section className="card cv-estimates" aria-label="Pattern estimates">
    <div className="cs-toolsec cv-sec"><h2 className="cs-toolsec__title">Pattern estimates</h2>
      <dl className="cv-stats">{rows.map(([label,value])=><React.Fragment key={label}><dt>{label}</dt><dd>{value}</dd></React.Fragment>)}</dl>
      <p className="cs-toolsec__hint">{ps.estimated?'Counts estimated from a smaller preview. ':''}Time and cost are estimates using your stitching speed and skein price.</p>
    </div>
    <div className="cs-toolsec cv-sec"><h3 className="cs-toolsec__title">Confetti stitches</h3>
      <p>{ps.confettiFinalSingles.toLocaleString('en-GB')} ({(ps.stitchable ? ps.confettiFinalSingles / ps.stitchable * 100 : 0).toFixed(1)}% of stitches)</p>
      <p className="cs-toolsec__hint">Confetti stitches are {window.CONFETTI_HELP.definition}.</p>
    </div>
    <div className="cs-toolsec cv-sec"><h3 className="cs-toolsec__title">Threads in this preview</h3>
      <p className="cs-toolsec__hint">Tap a thread to highlight its stitches. Tap again to clear.</p>
      <div className="cv-thread-list">{(state.previewColors||[]).map(pcol=>{
        const entry=state.previewMapped.find(m=>m.id===pcol.id);
        const label=formatThread(Object.assign({},entry,{brand:state.convertBrand||'dmc'}));
        const sf=state.previewDims?(state.sW*state.sH)/(state.previewDims.pw*state.previewDims.ph):1;
        return <button type="button" key={pcol.id} className="cv-thread" aria-pressed={selected===pcol.id} onClick={()=>highlight(pcol.id)}>
          <span className="cv-thread__swatch" style={{background:'rgb('+pcol.rgb.join(',')+')'}}/>
          <span className="cv-thread__name">{label}</span><span>{Math.round(pcol.count*sf).toLocaleString('en-GB')}</span>
        </button>;
      })}</div>
    </div>
    {state.exactPixelArt&&ps.exactMappings&&<details className="cs-toolsec"><summary>Source colours mapped to threads ({ps.exactMappings.length})</summary>
      <table><thead><tr><th>Source RGB</th><th>Thread</th><th>Pixels</th></tr></thead><tbody>{ps.exactMappings.map(row=><tr key={row.source.join(',')}><td>{row.source.join(', ')}</td><td>{formatThread({...row.thread,brand:state.convertBrand})}</td><td>{row.count}</td></tr>)}</tbody></table>
    </details>}
  </section>;
}
function PinnedComparison({state, compact}) {
  const [choice,setChoice]=useState('current');
  const pin=state.pinnedPreview, current=state.previewSnapshot;
  const change=current&&window.describePreviewChange(pin,current);
  const stats=current&&['confettiPct','threads','skeins'].map(key=>({label:key==='confettiPct'?'confetti':key,from:key==='confettiPct'?pin.summary[key].toFixed(1)+'%':pin.summary[key],to:key==='confettiPct'?current.summary[key].toFixed(1)+'%':current.summary[key]}));
  const changed=change ? change.changedStitches : 0;
  return <section className="card cv-pin" aria-label="Pinned comparison">
    <h2 className="cvp-title">Pinned preview: {pin.label}</h2>
    <div className="cvp-tools"><div role="group" className="lp-segmented cv-pin__switch" aria-label="Compare pinned and current">
      {['pinned','current'].map(v=><button type="button" className={'lp-seg'+(choice===v?' lp-seg--on':'')} aria-pressed={choice===v} key={v} onClick={()=>setChoice(v)}>{v==='pinned'?'Pinned':'Current'}</button>)}
    </div><button type="button" className="cs-seltools__btn" onClick={state.applyPinnedSettings}>Apply pinned settings</button>
    <button type="button" className="cs-seltools__btn" onClick={()=>state.setPinnedPreview(null)}>Unpin</button></div>
    <p className="cvp-change" aria-live="polite">{state.previewLoading?'Updating current preview…':(changed==null?'Size changed; cells cannot be compared directly':(change&&change.estimated?'About ':'')+changed.toLocaleString('en-GB')+' stitches changed')+(stats?', '+stats.map(s=>s.label+' '+s.from+' to '+s.to).join(', '):'')}.</p>
    <div className="cv-pin__pictures" data-choice={choice}>{[['pinned',pin],['current',current]].filter(([id])=>!compact||choice===id).map(([id,snap])=>snap&&<figure key={id} data-version={id}><figcaption>{id==='pinned'?'Pinned: '+pin.label:'Current: '+snap.label}</figcaption>
      <window.CreatorStitchedPreview cells={snap.mapped} width={snap.w} height={snap.h} fabricCt={snap.restore.fabricCt} fabricColour={snap.restore.fabricColour} displayWidth={Math.min(360,snap.w*8)}/>
    </figure>)}</div>
  </section>;
}

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
  // Cleanup mode hook (optional — gracefully absent if bundle not rebuilt yet).
  const cleanupMode = (typeof window.useCleanupMode === 'function') ? window.useCleanupMode(state, history) : null;
  // Denoise mode hook (optional — gracefully absent if bundle not rebuilt yet).
  const denoiseMode = (typeof window.useDenoiseMode === 'function') ? window.useDenoiseMode(state, history) : null;
  // useProjectIO's auto-save, beforeunload flush, and active-project effect all
  // gate on state.isActive. useCreatorState does NOT set isActive (it's a prop
  // of CreatorApp tied to the design/track mode toggle in UnifiedApp), so we
  // have to merge it in here exactly like the keyboard-shortcuts hook below.
  // Without this merge state.isActive is undefined, the auto-save guard
  // `if (!state.isActive) return;` always trips, and edits made in the Creator
  // never reach IndexedDB or the Stash Manager — pattern saves only happen via
  // the explicit handleOpenInTracker handoff (which bypasses the guard).
  const io = useProjectIOHook(Object.assign({}, state, {isActive: isActive}), history, {onSwitchToTrack});

  // ── First-visit tour, by way in (audit COMMON-06) ──
  // Picked once the Creator knows what it opened: a scratch grid (after the
  // New design sheet), a picture to convert, or a chart with no picture (an
  // import). null = not decided yet; '' = no tour.
  // A pattern already there (an imported chart or a saved project) wins over
  // its picture: a saved project's picture is restored after the pattern
  // (useProjectIO's Image.onload), and its tour is about the chart, not
  // about generating.
  const tourWayIn=state.isScratchMode?'scratch':state.pat?'import':(state.img&&state.img.src)?'convert':null;
  const[tourPage,setTourPage]=React.useState(null);
  React.useEffect(()=>{
    if(tourPage!==null||!state.bootSettled||state.newDesignOpen||!tourWayIn)return;
    const page='creator-'+tourWayIn;
    setTourPage(window.WelcomeWizard&&window.WelcomeWizard.shouldShow(page)?page:'');
  },[tourPage,state.bootSettled,state.newDesignOpen,tourWayIn]);
  // Help > Getting started and Preferences replay the tour for the current way in.
  React.useEffect(()=>{
    function onShow(e){if(e&&e.detail&&e.detail.page==='creator')setTourPage('creator-'+(tourWayIn||'convert'));}
    window.addEventListener('cs:showWelcome',onShow);
    return()=>window.removeEventListener('cs:showWelcome',onShow);
  },[tourWayIn]);
  const preview = usePreviewHook(state);
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

  // Register NavigationAPI handoff for Creator → Tracker so the top-bar Track
  // tab and command palette can trigger the full save+handoff path rather than
  // a raw href. Uses the existing _ioRef (declared below with the stable wrappers)
  // which is always updated before effects run.
  React.useEffect(()=>{
    if(!state.pat||!state.pal){delete window.__navigateToTracker;return;}
    window.__navigateToTracker=function(){if(_nameNudgeRef.current)_nameNudgeRef.current('track');};
    return()=>{delete window.__navigateToTracker;};
  },[!!state.pat,!!state.pal]); // eslint-disable-line react-hooks/exhaustive-deps

  // Bridge global "?" → open Help Centre while in Creator design mode.
  React.useEffect(()=>{
    const h=()=>{ state.setModal('help'); };
    window.addEventListener('cs:openHelpDesign',h);
    return()=>window.removeEventListener('cs:openHelpDesign',h);
  },[state.setModal]);

  // Command Palette → Shortcuts modal (Creator design mode).
  React.useEffect(()=>{
    const h=()=>{ state.setModal('shortcuts'); };
    window.addEventListener('cs:openShortcuts',h);
    return()=>window.removeEventListener('cs:openShortcuts',h);
  },[state.setModal]);

  // Command Palette → Preferences modal bridge (UX-12 Phase 6 PR #11).
  React.useEffect(()=>{
    const h=()=>{ if(typeof window.PreferencesModal!=='undefined') state.setPreferencesOpen(true); };
    window.addEventListener('cs:openPreferences',h);
    return()=>window.removeEventListener('cs:openPreferences',h);
  },[state.setPreferencesOpen]);

  // Command Palette → Rename current project bridge (UX-12 Phase 6 PR #11).
  React.useEffect(()=>{
    const h=()=>{ state.setNameModalReason('rename'); state.setNamePromptOpen(true); };
    window.addEventListener('cs:openRename',h);
    return()=>window.removeEventListener('cs:openRename',h);
  },[state.setNamePromptOpen]);

  // Register Creator-specific palette actions.
  React.useEffect(()=>{
    if (!window.CommandPalette) return;
    window.CommandPalette.registerPage('creator', [
      {
        id: 'cre_save_project', label: 'Save Project', section: 'action',
        keywords: ['save', 'project'],
        action: () => { if (_ioRef.current) _ioRef.current.saveProject(); }
      }
    ]);
    return () => { if (window.CommandPalette) window.CommandPalette.registerPage('creator', []); };
  },[state.setModal]);

  // Brief D — load global stash from manager DB on mount, and refresh whenever
  // the tab becomes visible again (covers the "edit in another tab" case).
  React.useEffect(() => {
    if (typeof window.StashBridge === 'undefined' || !window.StashBridge.getGlobalStash) return;
    let cancelled = false;
    const fetchStash = () => {
      window.StashBridge.getGlobalStash()
        .then(s => { if (!cancelled) state.setGlobalStash(s || {}); })
        .catch(e => console.warn('getGlobalStash failed:', e));
    };
    fetchStash();
    const onVis = () => { if (document.visibilityState === 'visible') fetchStash(); };
    document.addEventListener('visibilitychange', onVis);
    return () => { cancelled = true; document.removeEventListener('visibilitychange', onVis); };
  }, [state.setGlobalStash]);

  // ── Stable ref-forwarding wrappers — prevent context rememo on every render ──
  // Handler identity is stabilised via a ref; the ref is updated synchronously on
  // each render so the latest function is always called despite the empty dep list.
  // Refs are initialised with null; the current assignment below runs before any
  // useMemo so the refs are always populated when context values are built.
  const _cvHRef  = React.useRef(null);  _cvHRef.current  = canvas;
  const _ioRef   = React.useRef(null);  _ioRef.current   = io;
  const _nameNudgeRef = React.useRef(function(){});
  // Compact phone chrome (audit COMMON-03): under 900px one top bar and a
  // bottom tool rail replace the header, action bar and tool strip.
  // body.creator-compact keys the CSS (styles.css, "Compact phone chrome").
  const _compact = window.useCreatorCompact ? window.useCreatorCompact() : false;
  // The Creator's first tab (audit COMMON-10): Convert when there is a
  // picture to convert, Canvas for a design drawn from scratch (its size and
  // fabric), and neither for a chart imported without a picture.
  const _sourceTab = state.isScratchMode ? 'canvas' : ((state.img && state.img.src) ? 'convert' : null);
  // Convert shows the live preview of the current settings, also once a chart
  // exists: the chart itself is Edit's. Without a chart the preview is all
  // there is to show.
  const showConvertView = !!(state.img && !state.isScratchMode && (!state.pat || (state.appMode === 'create' && state.tab === 'pattern')));
  // How the chart relates to the settings in Convert (null, unknown, changed, same).
  const convertChartState = useMemo(function() {
    return window.convertChartState ? window.convertChartState(state.pat, state.lastGenSnapshot, state.conversionSettings, state.img) : null;
  }, [state.pat, state.lastGenSnapshot, state.conversionSettings, state.img]);
  const handleOpenCanvas = React.useCallback(function() {
    state.setAppMode("create");
    state.setTab("pattern");
  }, [state.setAppMode, state.setTab]);
  React.useEffect(()=>{
    const on = !!(_compact && isActive);
    document.body.classList.toggle('creator-compact', on);
    return ()=>{ document.body.classList.remove('creator-compact'); };
  },[_compact,isActive]);
  const [pendingNamedAction, setPendingNamedAction] = React.useState(null);
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
  const stableShapePreview = React.useCallback(function(){return _cvHRef.current.shapePreview?_cvHRef.current.shapePreview():null;},[]);
  const stableApplyCrop              = React.useCallback(function()  {_cvHRef.current.applyCrop();},               []);
  const stableSrcClick               = React.useCallback(function(e){_cvHRef.current.srcClick(e);},               []);

  const stableSaveProject         = React.useCallback(function()  {_ioRef.current.saveProject();},         []);
  const stableDoSaveProject       = React.useCallback(function(n) {_ioRef.current.doSaveProject(n);},      []);
  const stableHandleFile          = React.useCallback(function(e) {_ioRef.current.handleFile(e);},         []);
  const stableLoadProject         = React.useCallback(function(e) {_ioRef.current.loadProject(e);},        []);
  const stableHandleOpenInTracker = React.useCallback(function()  {_nameNudgeRef.current('track');}, []);

  const stableUndoEdit = React.useCallback(function(){_histRef.current.undoEdit();}, []);
  // Latest edit history, read by toast actions that outlive the render they
  // were created in (e.g. the colour-replace "Undo" button).
  const _editHistoryRef = React.useRef(null); _editHistoryRef.current = state.editHistory;
  const stableRedoEdit = React.useCallback(function(){_histRef.current.redoEdit();}, []);
  // The "Undo" on the stitched-cells-reset toast: only while that edit is
  // still the newest, so a late click never reverts something done after it.
  state.undoGuardRef.current = function(idxs){
    var hist=_editHistoryRef.current||[];
    if(hist.length&&hist[hist.length-1].doneReset===idxs) stableUndoEdit();
    else if(!hist.some(function(e){return e.doneReset===idxs;})) state.addToast("That edit has already been undone.",{type:"info",duration:2500});
    else state.addToast("Can't undo from here \u2014 the pattern has changed since. Use Undo in the toolbar.",{type:"info",duration:3500});
  };

  // Request to switch from Edit → Convert tab.  Fires the confirmation
  // modal when manual edits exist; otherwise switches immediately.
  // Resize or crop the chart by a resize spec (creator/canvasResize.js):
  // stitches, progress, backstitches, knots, beads and part stitches move
  // with their cells, and the change is one undo step. Used by Resize canvas
  // and by Edit > Tools > Crop to the stitches. Returns false when the spec
  // is not valid.
  function applyResizeSpec(spec){
    // French knots and their Tracker done marks move with the cells.
    var tf=state.trackerFieldsRef&&state.trackerFieldsRef.current;
    function knotsDoneNow(){return tf&&Array.isArray(tf.knotsDone)?tf.knotsDone.slice():[];}
    var resizedKnots=window.Knots?window.Knots.offset(state.knots,spec.offsetX||0,spec.offsetY||0,spec.newW,spec.newH):(state.knots||[]);
    function bsDoneNow(){return tf&&Array.isArray(tf.bsDone)?tf.bsDone.slice():[];}
    function partialDoneNow(){return tf&&Array.isArray(tf.partialDone)?tf.partialDone:[];}
    // Backstitch marks move with their lines; quarter marks move with their cells and are dropped if the cell is cropped away.
    var resizedBsDone=window.Backstitch?window.Backstitch.offsetDone(bsDoneNow(),spec.offsetX||0,spec.offsetY||0):bsDoneNow();
    function beadsNow(){return window.Beads.normalise(tf&&tf.beads);}
    function beadsDoneNow(){return tf&&Array.isArray(tf.beadsDone)?tf.beadsDone.slice():[];}
    var resizedBeads=window.Knots?window.Knots.offset(beadsNow(),spec.offsetX||0,spec.offsetY||0,spec.newW,spec.newH):beadsNow();
    var resizedKnotsDone=window.Knots?window.Knots.offsetDone(knotsDoneNow(),spec.offsetX||0,spec.offsetY||0):knotsDoneNow();
    var result=window.applyCanvasResize(
      state.pat,state.bsLines,state.done,state.partialStitches,
      state.parkMarkers,state.sW,state.sH,spec
    );
    if(!result)return false;
    var tracking=window.remapCanvasTracking(tf&&tf.halfStitches,tf&&tf.halfDone,partialDoneNow(),result.newPartialStitches,state.sW,state.sH,spec,state.threadBrand);
    var resizedPartialDone=tracking.partialDone;
    var prevSnap={
      sW:state.sW, sH:state.sH,
      pat:state.pat.slice(), bsLines:state.bsLines.slice(),
      done:state.done?Array.from(state.done):null,
      ps:[...state.partialStitches.entries()],
      parkMarkers:state.parkMarkers.slice(),
      specialtyStitches:state.specialtyStitches,
      knots:(state.knots||[]).slice(),
      knotsDone:knotsDoneNow(),
      bsDone:bsDoneNow(),
      partialDone:partialDoneNow(),
      beads:beadsNow(), beadsDone:beadsDoneNow(),
      halfStitches:tf&&tf.halfStitches||[],
      halfDone:tf&&tf.halfDone||[]
    };
    var nextSnap={
      sW:spec.newW, sH:spec.newH,
      pat:result.newPat, bsLines:result.newBsLines,
      done:result.newDone?Array.from(result.newDone):null,
      ps:[...result.newPartialStitches.entries()],
      parkMarkers:result.newParkMarkers,
      specialtyStitches:ProgressUnits.specialty.offset(state.specialtyStitches,spec.offsetX||0,spec.offsetY||0,spec.newW,spec.newH),
      knots:resizedKnots,
      knotsDone:resizedKnotsDone,
      bsDone:resizedBsDone,
      partialDone:resizedPartialDone,
      beads:resizedBeads, beadsDone:window.Beads.live(resizedBeads,beadsDoneNow()),
      halfStitches:tracking.halfStitches,
      halfDone:tracking.halfDone
    };
    var builtPal=state.buildPaletteWithScratch(result.newPat);
    state.setSW(spec.newW); state.setSH(spec.newH);
    state.setPat(result.newPat); state.setBsLines(result.newBsLines);
    state.setDone(result.newDone);
    state.setPartialStitches(result.newPartialStitches);
    state.setParkMarkers(result.newParkMarkers);
    state.setSpecialtyStitches(nextSnap.specialtyStitches);
    if(state.setKnots)state.setKnots(resizedKnots);
    if(tf){
      tf.knotsDone=resizedKnotsDone;
      tf.beadsDone=window.Beads.live(resizedBeads,beadsDoneNow());
      tf.halfStitches=tracking.halfStitches;
      tf.halfDone=tracking.halfDone;
      if(resizedBsDone.length)tf.bsDone=resizedBsDone;else delete tf.bsDone;
      if(resizedPartialDone.length)tf.partialDone=resizedPartialDone;else delete tf.partialDone;
      if(resizedBeads.length)tf.beads=resizedBeads;else delete tf.beads;
    }
    state.setPal(builtPal.pal); state.setCmap(builtPal.cmap);
    state.setRedoHistory([]);
    state.setEditHistory(function(prev){
      var n=prev.concat([{type:"canvasResize",prev:prevSnap,next:nextSnap}]);
      if(n.length>state.EDIT_HISTORY_MAX)n=n.slice(n.length-state.EDIT_HISTORY_MAX);
      return n;
    });
    return true;
  }
  // Crop to the stitches: the smallest rectangle holding everything on the
  // chart, through the same resize, so it can be undone and keeps progress.
  const cropToStitchesRef = useRef(null);
  cropToStitchesRef.current = function(){
    if(!state.pat)return;
    var tf=state.trackerFieldsRef&&state.trackerFieldsRef.current;
    var spec=window.cropToStitchesSpec(state.pat,state.sW,state.sH,{
      partialStitches:state.partialStitches, bsLines:state.bsLines, specialty:state.specialtyStitches,
      knots:state.knots, beads:window.Beads?window.Beads.normalise(tf&&tf.beads):[], parkMarkers:state.parkMarkers
    });
    if(!spec){ if(state.addToast)state.addToast("Nothing to crop: the stitches already reach every edge.",{type:"info",duration:2500}); return; }
    if(applyResizeSpec(spec)&&state.addToast)state.addToast("Cropped to the stitches: now "+spec.newW+"\u00D7"+spec.newH+". Undo puts the edges back.",{type:"success",duration:3500});
  };
  const stableCropToStitches = useCallback(function(){ cropToStitchesRef.current(); }, []);

  const handleRequestBackToConvert = React.useCallback(function() {
    if (state.editHistory && state.editHistory.length > 0) {
      state.setConfirmBackToConvert(true);
    } else {
      state.setAppMode("create");
      state.setTab("pattern");
    }
  }, [state.editHistory, state.setConfirmBackToConvert, state.setAppMode, state.setTab]);

  // ── GenerationContext value (image-to-pattern generation params & callbacks) ──
  const genCtx = useMemo(function() { return {
    img: state.img, setImg: state.setImg,
    isUploading: state.isUploading, setIsUploading: state.setIsUploading,
    isDragging: state.isDragging, setIsDragging: state.setIsDragging,
    maxC: state.maxC, setMaxC: state.setMaxC,
    exactPixelArt: state.exactPixelArt, setExactPixelArt: state.setExactPixelArt,
    pictureType: state.pictureType, pictureInfo: state.pictureInfo, applyPicturePreset: state.applyPicturePreset,
    stitchStyle: state.stitchStyle, stitchStyleBasis: state.stitchStyleBasis, applyStitchStyle: state.applyStitchStyle,
    bri: state.bri, setBri: state.setBri,
    con: state.con, setCon: state.setCon,
    sat: state.sat, setSat: state.setSat,
    dith: state.dith, dithMode: state.dithMode, dithStrength: state.dithStrength, setDith: state.setDith, setDithMode: state.setDithMode,
    skipBg: state.skipBg, setSkipBg: state.setSkipBg,
    bgTh: state.bgTh, setBgTh: state.setBgTh,
    bgCol: state.bgCol, setBgCol: state.setBgCol,
    pickBg: state.pickBg, setPickBg: state.setPickBg,
    minSt: state.minSt, setMinSt: state.setMinSt,
    smooth: state.smooth, setSmooth: state.setSmooth,
    smoothType: state.smoothType, setSmoothType: state.setSmoothType,
    preSharpen: state.preSharpen, setPreSharpen: state.setPreSharpen,
    preSharpenAmount: state.preSharpenAmount, setPreSharpenAmount: state.setPreSharpenAmount,
    orphans: state.orphans, setOrphans: state.setOrphans,
    disambig: state.disambig, setDisambig: state.setDisambig,
    disambigLevel: state.disambigLevel, setDisambigLevel: state.setDisambigLevel,
    disambigData: state.disambigData, setDisambigData: state.setDisambigData,
    disambiguateNow: state.disambiguateNow,
    allowBlends: state.allowBlends, setAllowBlends: state.setAllowBlends,
    maxBlends: state.maxBlends, setMaxBlends: state.setMaxBlends,
    busy: state.busy, setBusy: state.setBusy,
    progressMessage: state.progressMessage, setProgressMessage: state.setProgressMessage,
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
    convertBrand: state.convertBrand, setConvertBrand: state.setConvertBrand,
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
  }; }, [
    state.img, state.isUploading, state.isDragging,
    state.exactPixelArt, state.maxC, state.pictureType, state.pictureInfo, state.applyPicturePreset, state.stitchStyle, state.stitchStyleBasis, state.applyStitchStyle, state.bri, state.con, state.sat, state.dith, state.dithMode, state.dithStrength,
    state.skipBg, state.bgTh, state.bgCol, state.pickBg,
    state.minSt, state.smooth, state.smoothType, state.preSharpen, state.preSharpenAmount,
    state.orphans, state.disambig, state.disambigLevel, state.disambigData, state.disambiguateNow, state.allowBlends, state.maxBlends, state.busy, state.progressMessage,
    state.origW, state.origH, state.hasGenerated,
    state.stitchCleanup, state.isCropping, state.cropRect,
    state.generate, state.randomise, state.generateGallery,
    state.promoteVariation, state.applyVariationSeed,
    state.variationSeed, state.variationSubset, state.variationHistory,
    state.gallerySlots, state.galleryOpen,
    state.stashConstrained, state.convertBrand, state.coverageGaps,
    state.cleanupDiff, state.showCleanupDiff,
    state.stashThreadCount, state.effectiveMaxC, state.stashPalette,
    state.blendsAutoDisabled, state.effectiveAllowBlends,
  ]);

  // ── AppContext value (UI housekeeping: tabs, modals, panels, toasts, refs, export, preview) ──
  const appCtx = useMemo(function() { return {
    appMode: state.appMode, setAppMode: state.setAppMode,
    confirmBackToConvert: state.confirmBackToConvert, setConfirmBackToConvert: state.setConfirmBackToConvert,
    requestBackToConvert: handleRequestBackToConvert,
    sidebarTab: state.sidebarTab, setSidebarTab: state.setSidebarTab,
    lastGenSnapshot: state.lastGenSnapshot, convertChartState: convertChartState,
    tab: state.tab, setTab: state.setTab,
    materialsTab: state.materialsTab, setMaterialsTab: state.setMaterialsTab,
    modal: state.modal, setModal: state.setModal,
    sidebarOpen: state.sidebarOpen, setSidebarOpen: state.setSidebarOpen,
    loadError: state.loadError, setLoadError: state.setLoadError,
    copied: state.copied, setCopied: state.setCopied, copyText: state.copyText,
    convertTab: state.convertTab, setConvertTab: state.setConvertTab,
    showTidied: state.showTidied, setShowTidied: state.setShowTidied,
    previewChange: state.previewChange, previewTidied: state.previewTidied,
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
    pcRef: state.pcRef, scrollRef: state.scrollRef, chartFitH: state.chartFitH, expRef: state.expRef, loadRef: state.loadRef,
    stripRef: state.stripRef, overflowRef: state.overflowRef,
    overflowOpen: state.overflowOpen, setOverflowOpen: state.setOverflowOpen,
    morePanelOpen: state.morePanelOpen, setMorePanelOpen: state.setMorePanelOpen,
    panelOpen: state.panelOpen, setPanelOpen: state.setPanelOpen,
    stripCollapsed: state.stripCollapsed, setStripCollapsed: state.setStripCollapsed,
    shortcutsHintDismissed: state.shortcutsHintDismissed, setShortcutsHintDismissed: state.setShortcutsHintDismissed,
    namePromptOpen: state.namePromptOpen, setNamePromptOpen: state.setNamePromptOpen,
    projectName: state.projectName, setProjectName: state.setProjectName, renameProject: state.renameProject,
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
    fabricColour: state.fabricColour, setFabricColour: state.setFabricColour,
    canvasTexture: state.canvasTexture,
    previewUrl: state.previewUrl, setPreviewUrl: state.setPreviewUrl,
    previewStats: state.previewStats, setPreviewStats: state.setPreviewStats,
    previewLoading: state.previewLoading,
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
    openResizeCanvas: () => state.setResizeCanvasOpen(true),
    cropToStitches: stableCropToStitches,
    isScratchMode: state.isScratchMode,
    sourceTab: _sourceTab, openCanvas: handleOpenCanvas,
    setTracePicture: io.setTracePicture, removeTracePicture: io.removeTracePicture,
    isActive: isActive,
  }; }, [
    _sourceTab, handleOpenCanvas,
    state.appMode, state.confirmBackToConvert, handleRequestBackToConvert, state.sidebarTab,
    state.lastGenSnapshot, convertChartState,
    state.tab, state.materialsTab, state.modal, state.sidebarOpen, state.loadError,
    state.copied, state.convertTab, state.showTidied, state.previewChange, state.previewTidied,
    state.splitPaneEnabled, state.splitPaneRatio,
    state.splitPaneSyncEnabled, state.rightPaneMode,
    state.exportPage, state.pageMode,
    state.pdfDisplayMode, state.pdfCellSize, state.pdfSinglePage,
    state.toasts, state.chartFitH, state.overflowOpen, state.morePanelOpen, state.panelOpen, state.stripCollapsed,
    state.shortcutsHintDismissed, state.namePromptOpen, state.projectName,
    state.projectDesigner, state.projectDescription,
    state.eyedropperEmpty, state.pxX, state.pxY, state.totPg,
    state.previewActive, state.previewShowGrid, state.previewFabricBg,
    state.previewMode, state.realisticLevel, state.coverageOverride,
    state.fabricColour,
    state.canvasTexture,
    state.previewUrl, state.previewStats, state.previewLoading, state.confettiData,
    state.previewHeatmap, state.previewMapped, state.previewColors,
    state.previewDims, state.previewHighlight,
    state.isScratchMode,
    isActive,
  ]);

  // ── CanvasContext value (tools, view, zoom, highlight, selection, edit history, interactions) ──
  const cvCtx = useMemo(function() { return {
    activeTool: state.activeTool, setActiveTool: state.setActiveTool, activeToolRef: state.activeToolRef,
    drawMode: state.drawMode, setDrawMode: state.setDrawMode, drawModeRef: state.drawModeRef,
    penNavigation: state.penNavigation, setPenNavigation: state.setPenNavigation,
    magnifierOn: state.magnifierOn, setMagnifierOn: state.setMagnifierOn,
    precisionCursor: state.precisionCursor, setPrecisionCursor: state.setPrecisionCursor, maxZoom: state.maxZoom,
    brushMode: state.brushMode, setBrushMode: state.setBrushMode, brushModeRef: state.brushModeRef,
    brushSize: state.brushSize, setBrushSize: state.setBrushSize,
    selectedColorId: state.selectedColorId, setSelectedColorId: state.setSelectedColorId,
    view: state.view, setView: state.setView,
    zoom: state.zoom, setZoom: state.setZoom,
    hiId: state.hiId, setHiId: state.setHiId,
    showCtr: state.showCtr, setShowCtr: state.setShowCtr,
    showOverlay: state.showOverlay, setShowOverlay: state.setShowOverlay,
    showStitched: state.showStitched, setShowStitched: state.setShowStitched,
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
    contextMenu: state.contextMenu, setContextMenu: state.setContextMenu,
    selectionModifier: state.selectionModifier, setSelectionModifier: state.setSelectionModifier,
    bsLines: state.bsLines, setBsLines: state.setBsLines,
    specialtyStitches:state.specialtyStitches, setSpecialtyStitches:state.setSpecialtyStitches, specialtySelected:state.specialtySelected,setSpecialtySelected:state.setSpecialtySelected,
    knots: state.knots, setKnots: state.setKnots,
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
    // Shapes and mirror drawing (audit DRAW-04)
    shapePreview: stableShapePreview,
    mirror: state.mirror, setMirror: state.setMirror,
    shapeFilled: state.shapeFilled, setShapeFilled: state.setShapeFilled,
    lineSnap: state.lineSnap, setLineSnap: state.setLineSnap,
    textSheet: state.textSheet, setTextSheet: state.setTextSheet,
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
    outlineColor: state.outlineColor, setOutlineColor: state.setOutlineColor,
    applyWandSelect: state.applyWandSelect, clearSelection: state.clearSelection,
    invertSelection: state.invertSelection, selectAll: state.selectAll,
    selectAllOfColorId: state.selectAllOfColorId,
    previewConfettiCleanup: state.previewConfettiCleanup,
    applyConfettiCleanup: state.applyConfettiCleanup,
    previewColorReduction: state.previewColorReduction,
    applyColorReduction: state.applyColorReduction,
    applyGlobalColourReplacement: state.applyGlobalColourReplacement,
    deleteSelection: state.deleteSelection,
    colourReplaceModal: state.colourReplaceModal, setColourReplaceModal: state.setColourReplaceModal,
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
    // Cleanup mode state (from useCreatorState)
    cleanupTargetColorId: state.cleanupTargetColorId, setCleanupTargetColorId: state.setCleanupTargetColorId,
    cleanupTolerance: state.cleanupTolerance, setCleanupTolerance: state.setCleanupTolerance,
    cleanupSelTool: state.cleanupSelTool, setCleanupSelTool: state.setCleanupSelTool,
    cleanupBrushSize: state.cleanupBrushSize, setCleanupBrushSize: state.setCleanupBrushSize,
    cleanupPendingMask: state.cleanupPendingMask, setCleanupPendingMask: state.setCleanupPendingMask,
    cleanupAutoRunning: state.cleanupAutoRunning,
    cleanupAutoError: state.cleanupAutoError,
    // Cleanup mode actions (from useCleanupMode hook)
    enterCleanup: cleanupMode ? cleanupMode.enterCleanup : null,
    exitCleanup: cleanupMode ? cleanupMode.exitCleanup : null,
    cancelCleanup: cleanupMode ? cleanupMode.cancelCleanup : null,
    applyCleanup: cleanupMode ? cleanupMode.applyCleanup : null,
    runAutoDetect: cleanupMode ? cleanupMode.runAutoDetect : null,
    handleCleanupPointerDown: cleanupMode ? cleanupMode.handleCleanupPointerDown : null,
    handleCleanupPointerMove: cleanupMode ? cleanupMode.handleCleanupPointerMove : null,
    handleCleanupPointerUp: cleanupMode ? cleanupMode.handleCleanupPointerUp : null,
    // Denoise mode state (from useCreatorState)
    denoisePendingMask: state.denoisePendingMask,
    denoiseAutoRunning: state.denoiseAutoRunning,
    denoiseAutoError: state.denoiseAutoError,
    denoiseSelTool: state.denoiseSelTool, setDenoiseSelTool: state.setDenoiseSelTool,
    denoiseBrushSize: state.denoiseBrushSize, setDenoiseBrushSize: state.setDenoiseBrushSize,
    denoiseThreshold: state.denoiseThreshold, setDenoiseThreshold: state.setDenoiseThreshold,
    denoiseOps: state.denoiseOps, setDenoiseOps: state.setDenoiseOps,
    denoisePreviewReport: state.denoisePreviewReport,
    denoiseDitherWarning: state.denoiseDitherWarning,
    // Denoise mode actions (from useDenoiseMode hook)
    enterDenoise: denoiseMode ? denoiseMode.enterDenoise : null,
    exitDenoise: denoiseMode ? denoiseMode.exitDenoise : null,
    cancelDenoise: denoiseMode ? denoiseMode.cancelDenoise : null,
    applyDenoise: denoiseMode ? denoiseMode.applyDenoise : null,
    runDenoiseAutoDetect: denoiseMode ? denoiseMode.runDenoiseAutoDetect : null,
    dismissDitherWarning: denoiseMode ? denoiseMode.dismissDitherWarning : null,
    handleDenoisePointerDown: denoiseMode ? denoiseMode.handleDenoisePointerDown : null,
    handleDenoisePointerMove: denoiseMode ? denoiseMode.handleDenoisePointerMove : null,
    handleDenoisePointerUp: denoiseMode ? denoiseMode.handleDenoisePointerUp : null,
    // Copy, paste, flip and rotate (useSelectionClipboard)
    clip: state.clip,
  }; }, [
    state.clip, state.mirror, state.shapeFilled, state.lineSnap, state.textSheet,
    state.activeTool, state.drawMode, state.penNavigation, state.magnifierOn, state.precisionCursor, state.maxZoom, state.brushMode, state.brushSize,
    state.selectedColorId, state.view, state.zoom,
    state.hiId, state.showCtr, state.showOverlay, state.showStitched, state.overlayOpacity,
    state.highlightMode, state.bgDimOpacity, state.hiAdvanced,
    state.bgDimDesaturation, state.dimFraction, state.dimHiId,
    state.tintColor, state.tintOpacity, state.spotDimOpacity,
    state.antsOffset, state.contextMenu,
    state.selectionModifier, state.bsLines, state.specialtySelected, state.specialtyStitches, state.knots, state.partialStitches, state.bsStart, state.bsContinuous,
    state.editHistory, state.redoHistory, state.stitchType, state.cs,
    state.paletteSwap,
    state.pat, state.cmap, state.sW, state.sH,
    state.selectionMask, state.wandTolerance, state.wandContiguous,
    state.wandOpMode, state.wandPanel,
    state.confettiThreshold, state.confettiPreview,
    state.reduceTarget, state.reducePreview,
    state.outlineColor, state.selectionCount, state.hasSelection,
    state.selectionStats,
    state.lassoMode, state.lassoPoints, state.lassoActive, state.lassoCursor,
    state.lassoPreviewMask, state.lassoOpMode, state.lassoPointCount, state.lassoInProgress,
    state.colourReplaceModal,
    state.cleanupTargetColorId, state.cleanupTolerance, state.cleanupSelTool,
    state.cleanupBrushSize, state.cleanupPendingMask, state.cleanupAutoRunning,
    state.cleanupAutoError, cleanupMode,
    state.denoisePendingMask, state.denoiseAutoRunning, state.denoiseAutoError,
    state.denoiseSelTool, state.denoiseBrushSize, state.denoiseThreshold,
    state.denoiseOps, state.denoisePreviewReport, state.denoiseDitherWarning, denoiseMode,
  ]);

  // ── HoverContext value (pointer hover coords only) ──
  // Action plan headline H5 (=2B.1). hoverCoords ticks at ~60 fps during a
  // mouse-move; if it lived inside cvCtx every consumer of CanvasContext
  // (Sidebar, ToolStrip, MagicWandPanel, ContextMenu, LegendTab, Pattern-
  // Tab, PreviewCanvas, etc.) would re-render every frame and the
  // Sidebar's `displayPal.map(...)` would dominate the main thread. With
  // its own context the hover stream only invalidates PatternCanvas's
  // overlay effect and PatternTab's coordinate readout — the consumers
  // that actually look at the value.
  const hovCtx = useMemo(function() { return {
    hoverCoords: state.hoverCoords,
    setHoverCoords: state.setHoverCoords,
  }; }, [state.hoverCoords]);

  // ── PatternDataContext value (core pattern data, dimensions, derived values) ──
  const pdCtx = useMemo(function() { return {
    pat: state.pat, setPat: state.setPat,
    pal: state.pal, setPal: state.setPal,
    cmap: state.cmap, setCmap: state.setCmap,
    threadBrand: state.threadBrand, setThreadBrand: state.setThreadBrand,
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
    specialtyStitches:state.specialtyStitches, setSpecialtyStitches:state.setSpecialtyStitches, specialtySelected:state.specialtySelected,setSpecialtySelected:state.setSpecialtySelected,
    knots: state.knots, setKnots: state.setKnots,
    partialStitchTool: state.partialStitchTool, setPartialStitchTool: state.setPartialStitchTool,
    partialStitchToolRef: state.partialStitchToolRef,
    threadOwned: state.threadOwned, setThreadOwned: state.setThreadOwned,
    globalStash: state.globalStash, setGlobalStash: state.setGlobalStash,
    kittingResult: state.kittingResult, setKittingResult: state.setKittingResult,
    altOpen: state.altOpen, setAltOpen: state.setAltOpen,
    creatorStashFilter: state.creatorStashFilter, setCreatorStashFilter: state.setCreatorStashFilter,
    adaptModalOpen: state.adaptModalOpen, setAdaptModalOpen: state.setAdaptModalOpen,
    adaptModalMode: state.adaptModalMode, setAdaptModalMode: state.setAdaptModalMode,
    adaptMaxDeltaE: state.adaptMaxDeltaE, setAdaptMaxDeltaE: state.setAdaptMaxDeltaE,
    buildPaletteWithScratch: state.buildPaletteWithScratch,
    resetAll: state.resetAll,
    initBlankGrid: state.initBlankGrid,
    startScratch: state.startScratch,
    addScratchColour: state.addScratchColour,
    removeScratchColour: state.removeScratchColour,
    removeUnusedColours: state.removeUnusedColours,
    changeSymbol: state.changeSymbol, symbolOverrides: state.symbolOverrides,
    toggleOwned: state.toggleOwned,
    displayPal: state.displayPal,
    totalStitchable: state.totalStitchable,
    skeinData: state.skeinData, materialThreadRows: state.materialThreadRows, totalSkeins: state.totalSkeins,
    blendCount: state.blendCount, threadCounts: state.threadCounts, difficulty: state.difficulty,
    doneCount: state.doneCount, dmcFiltered: state.dmcFiltered,
    colourDoneCounts: state.colourDoneCounts,
    progressPct: state.progressPct,
    ownedCount: state.ownedCount, toBuyCount: state.toBuyCount, toBuyList: state.toBuyList,
  }; }, [
    state.pat, state.pal, state.cmap, state.threadBrand,
    state.sW, state.sH, state.arLock, state.ar,
    state.fabricCt, state.skeinPrice, state.stitchSpeed,
    state.done, state.isScratchMode, state.scratchPalette,
    state.dmcSearch, state.colPickerOpen, state.symbolOverrides,
    state.parkMarkers, state.hlRow, state.hlCol,
    state.totalTime, state.sessions,
    state.partialStitches, state.partialStitchTool, state.specialtySelected, state.specialtyStitches, state.knots,
    state.threadOwned, state.globalStash,
    state.kittingResult, state.altOpen,
    state.adaptModalOpen, state.adaptModalMode, state.adaptMaxDeltaE,
    state.creatorStashFilter,
    state.displayPal, state.totalStitchable,
    state.skeinData, state.materialThreadRows, state.totalSkeins,
    state.blendCount, state.threadCounts, state.difficulty,
    state.doneCount, state.dmcFiltered,
    state.colourDoneCounts, state.progressPct,
    state.ownedCount, state.toBuyCount, state.toBuyList,
  ]);

  // Full merged state for exportPDF (which reads a mix of pattern + derived values)
  // File > Export PDF… and Print PDF use the Export tab's saved settings
  // (export-pdf.js), so they make the same PDF the Export tab would.
  const exportPdfWithSavedSettings = () => {
    if (!window.ExportPdf) return;
    window.ExportPdf.run(Object.assign({}, exportData, {
      projectName: state.projectName,
      projectDesigner: state.projectDesigner,
      projectDescription: state.projectDescription,
    }));
  };
  // Audit COMMON-05: projects are named after their source, so nothing asks
  // for a name while creating. The first time an auto-named project is
  // exported or opened in the Tracker, offer a rename once (Skip or Save),
  // then carry on with what the user asked for. The action is run from an
  // effect after the prompt closes, so it sees the new name.
  const runNamedAction = (key) => {
    if (key === 'pdf') exportPdfWithSavedSettings();
    else if (key === 'track') { if (_ioRef.current && _ioRef.current.handleOpenInTracker) _ioRef.current.handleOpenInTracker(); }
    else if (key === 'exports') { state.setTab("materials"); if (state.setMaterialsTab) state.setMaterialsTab("output"); }
  };
  _nameNudgeRef.current = (key) => {
    const auto = state.nameAutoGeneratedRef && state.nameAutoGeneratedRef.current;
    const shown = state.namePromptShownRef && state.namePromptShownRef.current;
    // Ask only while the name is still a default (blank, "Untitled design",
    // "IMG_2041"); a name the user typed, or a file name worth keeping, is not
    // second-guessed. Once per project: the flag is set when the prompt opens.
    if (needsNamePrompt(state.projectName, auto, shown) && state.pat && state.pal) {
      setPendingNamedAction(key);
      state.setNameModalReason('export');
      state.setNamePromptOpen(true);
      return;
    }
    runNamedAction(key);
  };
  React.useEffect(() => {
    if (!pendingNamedAction || state.namePromptOpen) return;
    const key = pendingNamedAction;
    setPendingNamedAction(null);
    runNamedAction(key);
  }, [pendingNamedAction, state.namePromptOpen]); // eslint-disable-line react-hooks/exhaustive-deps
  const printPdfWithNameNudge = () => _nameNudgeRef.current('pdf');
  // Audit IMPORT-05: files from other design programs (.pat, .xsp …)
  // and other non-images are turned away with a plain-English toast instead
  // of being handed to the image converter (import-engine/ui/importErrors.js).
  const rejectUnsupportedFile = (f) => {
    const IE = window.ImportEngine;
    if (!f || !IE || typeof IE.classifyFileForCreate !== 'function') return false;
    if (IE.classifyFileForCreate(f) !== 'unsupported') return false;
    const err = new Error('Unsupported file type: ' + (f.name || ''));
    err.name = 'ImportUnsupportedError';
    if (typeof IE.showImportError === 'function') IE.showImportError(err, f.name);
    return true;
  };
  const exportData = useMemo(function() { return {
    pat: state.pat, pal: state.pal, cmap: state.cmap, threadBrand: state.threadBrand,
    sW: state.sW, sH: state.sH, fabricCt: state.fabricCt,
    skeinPrice: state.skeinPrice, stitchSpeed: state.stitchSpeed,
    done: state.done, bsLines: state.bsLines,
    partialStitches: state.partialStitches, specialtyStitches:state.specialtyStitches, knots: state.knots,
    threadOwned: state.threadOwned,
    totalStitchable: state.totalStitchable, skeinData: state.skeinData, materialThreadRows: state.materialThreadRows,
    totalSkeins: state.totalSkeins, blendCount: state.blendCount,
    difficulty: state.difficulty, doneCount: state.doneCount,
    totalTime: state.totalTime, sessions: state.sessions,
  }; }, [
    state.pat, state.pal, state.cmap, state.threadBrand, state.sW, state.sH,
    state.fabricCt, state.skeinPrice, state.stitchSpeed,
    state.done, state.bsLines, state.partialStitches, state.specialtyStitches, state.knots,
    state.threadOwned, state.totalStitchable, state.skeinData, state.materialThreadRows,
    state.totalSkeins, state.blendCount, state.difficulty,
    state.doneCount, state.totalTime, state.sessions,
  ]);

  // ── Coachmark tips (Creator) ────────────────────────────────────────
  // One-off tips, only for a pattern made in this visit — never just for
  // opening an existing project, which used to raise them every time:
  //   toolsTab_unlocked    right after generating: points at the Tools tab;
  //                        clicking the tab completes it.
  //   firstStitch_creator  after generating, or on a blank scratch grid;
  //                        done on the first edit.
  // coaching.js holds both back while the welcome walkthrough is open, and
  // remembers them however they are dismissed. Neither blocks the canvas.
  const _freshPattern = state.patternCreatedThisVisit;
  const _noEditsYet = !state.editHistory || state.editHistory.length === 0;
  const _coach = (typeof window.useCoachingSequence === 'function')
    ? window.useCoachingSequence('creator', {
        toolsTab_unlocked: state.patternGeneratedThisVisit && !!state.pat && !!state.pal,
        firstStitch_creator: _freshPattern && !!state.pat && state.appMode === 'edit' && _noEditsYet
      })
    : { active: null, complete: ()=>{}, skip: ()=>{}, skipAll: ()=>{} };
  const _coachBlocked = !isActive || !!state.namePromptOpen || !!state.busy;
  // A short delay lets the post-generate layout settle before a tip appears.
  const [_coachReady, _setCoachReady] = React.useState(false);
  React.useEffect(()=>{
    _setCoachReady(false);
    if (_coachBlocked || !_coach.active) return;
    const t = setTimeout(()=>_setCoachReady(true), 600);
    return ()=>clearTimeout(t);
  }, [_coachBlocked, _coach.active]);
  React.useEffect(()=>{
    if (_coach.active === 'firstStitch_creator' && !_noEditsYet) _coach.complete('firstStitch_creator');
  }, [_noEditsYet, _coach.active]);
  // Opening the Tools tab counts as having seen the tip.
  React.useEffect(()=>{
    if (_coach.active === 'toolsTab_unlocked' && state.sidebarTab === 'tools') _coach.complete('toolsTab_unlocked');
  }, [state.sidebarTab, _coach.active]);
  // Touch users start with no tool armed, so the coach mark tells them to pick Paint first.
  const _coarsePointer = (()=>{ try { return !!(window.matchMedia && window.matchMedia('(pointer: coarse)').matches); } catch (_) { return false; } })();
  const _showFirstStitchCoach = _coachReady && !_coachBlocked && _coach.active === 'firstStitch_creator';
  const _showToolsUnlockedCoach = _coachReady && !_coachBlocked && _coach.active === 'toolsTab_unlocked';

  return (
    <window.GenerationContext.Provider value={genCtx}>
    <window.AppContext.Provider value={appCtx}>
    <window.CanvasContext.Provider value={cvCtx}>
    <window.PatternDataContext.Provider value={pdCtx}>
    <window.HoverContext.Provider value={hovCtx}>
      {/* Platform.fileAccept drops the filter on iOS, where .oxs resolves to
          no UTI and would grey out every file in the Files picker. */}
      <input ref={state.loadRef} type="file" accept={window.Platform ? window.Platform.fileAccept(".json,.pat,.oxs,.xsd,.xml,.png,.jpg,.jpeg,.gif,.bmp,.webp,.pdf") : ".json,.pat,.oxs,.xsd,.xml,.png,.jpg,.jpeg,.gif,.bmp,.webp,.pdf"} onChange={(e)=>{
        var f = e.target.files && e.target.files[0];
        if (!f) return;
        var n = (f.name || '').toLowerCase();
        if (rejectUnsupportedFile(f)) { e.target.value = ''; return; }
        var isPattern = /\.(pat|oxs|xml|pdf|xsd)$/i.test(n);
        if (isPattern && window.ImportEngine && typeof window.ImportEngine.importAndReview === 'function') {
          e.target.value = '';
          window.ImportEngine.importAndReview(f, { navigateTo: 'create.html?from=home' }).catch(function(err){ console.error('[creator] Import failed:', err); });
          return;
        }
        io.loadProject(e);
      }} style={{display:"none"}}/>
      <Header page={state.appMode==='edit'?'editor':'creator'} tab={state.tab} onPageChange={state.setTab}
        onOpen={()=>state.loadRef.current.click()}
        onSave={state.pat&&state.pal?io.saveProject:null}
        onTrack={state.pat&&state.pal?stableHandleOpenInTracker:null}
        onExportPDF={state.pat?printPdfWithNameNudge:null}
        onNewProject={()=>{if(!state.pat||confirm("Start a new project? Unsaved changes will be lost."))state.resetAll();}}
        onOpenProject={typeof window.ProjectStorage!=='undefined'?()=>{window.location.href='home.html';}:undefined}
        onPreferences={typeof window.PreferencesModal!=='undefined'?()=>state.setPreferencesOpen(true):undefined}
        setModal={state.setModal}
        projectName={state.pat&&state.pal?(state.projectName||(state.sW+'×'+state.sH+' pattern')):undefined}
        onNameChange={state.pat&&state.pal?n=>state.renameProject(n):undefined}
        showAutosaved={!!(state.pat&&state.pal)}
        saveStatus={state.saveStatus}
        savedAt={state.savedAt}
        saveError={state.saveError}
        onRetrySave={io.retryAutoSave} />
      {state.preferencesOpen&&typeof window.PreferencesModal!=='undefined'&&React.createElement(window.PreferencesModal,{onClose:()=>state.setPreferencesOpen(false)})}
      {state.adaptModalOpen&&typeof window.AdaptModal!=='undefined'&&React.createElement(window.AdaptModal,{
        mode:state.adaptModalMode,
        onClose:()=>state.setAdaptModalOpen(false)
      })}
      {state.colourReplaceModal&&typeof window.ColourReplaceModal!=='undefined'&&React.createElement(window.ColourReplaceModal,{
        modal:state.colourReplaceModal,
        onClose:()=>state.setColourReplaceModal(null),
        pat:state.pat, sW:state.sW, sH:state.sH, pal:state.pal, threadBrand:state.threadBrand,
        partialStitches:state.partialStitches, bsLines:state.bsLines, fabricColour:state.fabricColour,
        selectionMask:state.hasSelection?state.selectionMask:null,
        onApply:function(dstThread,opts){
          var src=state.colourReplaceModal;
          var alsoIds=(opts&&opts.alsoIds)||[];
          var swap=!!(opts&&opts.swap);
          var res=state.applyGlobalColourReplacement(src.srcId,dstThread.id,{scope:opts&&opts.scope==='selection'?'selection':'all',alsoIds:swap?[]:alsoIds,swap:swap});
          state.setColourReplaceModal(null);
          if(!res||!state.addToast)return;
          var srcLbl=formatThread((state.cmap&&state.cmap[src.srcId])||(res.src)||{id:src.srcId}),dstLbl=formatThread(res.dst);
          state.addToast((swap?"Swapped "+srcLbl+" and "+dstLbl:"Replaced "+srcLbl+(alsoIds.length?" and "+alsoIds.length+" similar shade"+(alsoIds.length===1?"":"s"):"")+" with "+dstLbl)+" ("+(window.ColourReplace&&res.counts?window.ColourReplace.describeCounts(res.counts):res.count.toLocaleString()+" stitches")+(opts&&opts.scope==='selection'?" in selection":"")+")",{
            type:"success", duration:6000,
            action:{label:"Undo", onClick:function(){
              // Only undo while this replacement is still the newest edit, so
              // a late click never reverts something the user did afterwards.
              var hist=_editHistoryRef.current||[];
              if(hist.length&&hist[hist.length-1]===res.entry) stableUndoEdit();
              else if(hist.indexOf(res.entry)===-1) state.addToast("That replacement has already been undone.",{type:"info",duration:2500});
              else state.addToast("Can't undo the replacement from here \u2014 the pattern has changed since. Use Undo in the toolbar.",{type:"info",duration:3500});
            }}
          });
        }
      })}
      {state.resizeCanvasOpen&&typeof window.ResizeCanvasModal!=='undefined'&&React.createElement(window.ResizeCanvasModal,{
        sW:state.sW, sH:state.sH,
        done:state.done,
        onClose:()=>state.setResizeCanvasOpen(false),
        onApply:function(spec){
          if(applyResizeSpec(spec)){
            state.setResizeCanvasOpen(false);
            if(state.addToast)state.addToast("Canvas resized to "+spec.newW+"\u00D7"+spec.newH,{type:"success",duration:2500});
          }
        }
      })}
      {state.colourReplaceModal&&typeof window.ColourReplaceModal==='undefined'&&(function(){
        // DEFECT-003: the modal was requested but the component global is
        // missing (script load order broken or modal file removed). Without
        // this branch the user clicks Replace, nothing renders, and there is
        // no console signal. Log once, dismiss the request, surface a toast.
        if(!window.__colourReplaceModalMissingLogged){
          window.__colourReplaceModalMissingLogged=true;
          console.error('[creator-main] window.ColourReplaceModal is undefined; check that creator/ColourReplaceModal.js (bundled into creator/bundle.js) loaded before creator-main.js');
        }
        if(window.Toast)window.Toast.show({message:'Colour replace dialog failed to load.',type:'error'});
        // Defer the state clear so we don't setState during render.
        Promise.resolve().then(function(){state.setColourReplaceModal(null);});
        return null;
      })()}
      {state.namePromptOpen&&<NamePromptModal
        defaultName={state.projectName||(state.sW+'×'+state.sH+' pattern')}
        {...(state.nameModalReason==='export'?(pendingNamedAction==='track'?{
          title:'Name this pattern',
          message:'Give this pattern a name before you start stitching? It will appear in the Stitch Tracker and in your library.',
          confirmLabel:'Save and open',
          cancelLabel:'Skip'
        }:{
          title:'Name this pattern',
          message:'Give this pattern a name? It will appear on the PDF and in your library.',
          cancelLabel:'Skip'
        }):state.nameModalReason==='rename'?{
          title:'Rename this pattern',
          message:'The name appears on the PDF and in your library.'
        }:{})}
        onConfirm={name=>{
          var reason=state.nameModalReason;
          state.renameProject(name);
          state.setNamePromptOpen(false);
          state.setNameModalReason&&state.setNameModalReason(null);
          // Three flows share this modal:
          //  - "export"   → offered once before the first export or Tracker
          //                 hand-off of an auto-named project; the pending
          //                 action runs from an effect once the modal closes.
          //  - "rename"   → command palette / phone header "Rename".
          //  - "download" → the legacy "Save (.json)" path, which downloads.
          if(reason==='export'||reason==='rename'){
            if(state.addToast)state.addToast('Renamed to "'+name+'"',{type:'success',duration:2500});
          }else{
            io.doSaveProject(name);
          }
        }}
        onCancel={()=>{
          var reason=state.nameModalReason;
          state.setNamePromptOpen(false);
          state.setNameModalReason&&state.setNameModalReason(null);
          // Skip keeps the automatic name; a pending export still runs.
          if(reason==='export'||reason==='rename')return;
          // Legacy download path: tell the user why nothing happened —
          // without this the modal just disappears with no feedback when
          // they cancel a Download attempt.
          if(state.addToast)state.addToast("Download cancelled \u2014 give your pattern a name to download a .json file.",{type:"info",duration:3500});
        }}
      />}
      {_compact&&window.CreatorCompactTopBar&&<window.CreatorCompactTopBar
        pat={!!(state.pat&&state.pal)}
        appMode={state.appMode}
        tab={state.tab}
        hasImage={!!(state.img&&state.img.src)&&!state.isScratchMode}
        sourceTab={_sourceTab}
        onOpenCanvas={handleOpenCanvas}
        generatingPattern={!!state.busy}
        onGenerate={state.generate}
        projectName={state.pat&&state.pal?(state.projectName||(state.sW+'×'+state.sH+' pattern')):''}
        saveStatus={state.saveStatus}
        savedAt={state.savedAt}
        onTabChange={function(t){state.setTab(t);}}
        onRequestBackToConvert={handleRequestBackToConvert}
        onPrintPdf={printPdfWithNameNudge}
        onTrackPattern={stableHandleOpenInTracker}
        onSaveJson={io.saveProject}
        onMoreExports={()=>_nameNudgeRef.current('exports')}
        onPreferences={typeof window.PreferencesModal!=='undefined'?()=>state.setPreferencesOpen(true):undefined}
        onReview={()=>state.setMaterialsTab("review")}
        sW={state.sW} sH={state.sH}
        fabricCt={state.fabricCt}
        colourCount={state.pal?state.pal.length:0} threadCounts={state.threadCounts}
        skeinEstimate={state.totalSkeins}
        totalStitchable={state.totalStitchable}
        difficulty={state.difficulty}
        confetti={state.confettiStats}
        stitchSpeed={state.stitchSpeed}
        doneCount={state.doneCount}
      />}
      {!_compact&&window.CreatorActionBar&&<window.CreatorActionBar
        ready={!!(state.pat&&state.pal)}
        sW={state.sW} sH={state.sH}
        fabricCt={state.fabricCt}
        colourCount={state.pal?state.pal.length:0} threadCounts={state.threadCounts}
        skeinEstimate={state.totalSkeins}
        totalStitchable={state.totalStitchable}
        difficulty={state.difficulty}
        confetti={state.confettiStats}
        stitchSpeed={state.stitchSpeed}
        doneCount={state.doneCount}
        appMode={state.appMode}
        tab={state.tab}
        pat={!!(state.pat&&state.pal)}
        onTabChange={function(t){state.setTab(t);}}
        onRequestBackToConvert={handleRequestBackToConvert}
        onPrintPdf={printPdfWithNameNudge}
        onTrackPattern={stableHandleOpenInTracker}
        onSaveJson={io.saveProject}
        onMoreExports={()=>_nameNudgeRef.current('exports')}
        hasImage={!!(state.img&&state.img.src)&&!state.isScratchMode}
        sourceTab={_sourceTab}
        onOpenCanvas={handleOpenCanvas}
        generatingPattern={!!state.busy}
        onGenerate={state.generate}
      />}
      <window.CreatorToolStrip/>
      <div className="cs-page-content">
        {state.loadError&&<div style={{background:"#FCEFEF",border:"1px solid #ECC8C8",borderRadius:8,padding:"8px 14px",fontSize:12,color:"#A53D3D",marginBottom:12}}>{state.loadError}</div>}
        {/* New design (audit DRAW-02): size, fabric and an optional tracing
            picture, before the blank grid is made. */}
        {state.newDesignOpen&&window.CreatorNewDesignSheet&&<window.CreatorNewDesignSheet
          fabricCt={state.fabricCt}
          fabricColour={state.fabricColour}
          onCancel={function(){ window.location.href='home.html?tab=create'; }}
          onStart={function(o){
            state.setNewDesignOpen(false);
            state.startScratch(o.w, o.h, { fabricCt: o.fabricCt, fabricColour: o.fabricColour });
            if (o.trace && o.trace.file) io.setTracePicture(o.trace.file, o.trace.opacity);
          }}
        />}
        {/* Nothing open yet: a /home handoff is in flight (image being
            decoded, scratch project being built, JSON being loaded) or the
            saved project is still loading. Once the boot has settled with
            nothing to show, send the user to Home > Create, which has the
            three ways to start (audit COMMON-04); the old welcome card with
            its overlapping upload tiles is gone. */}
        {!state.img&&!state.pat&&<div
            style={{maxWidth:700,margin:"80px auto",textAlign:"center",padding:"40px",display:"flex",flexDirection:"column",alignItems:"center",gap:14,color:"var(--text-secondary)"}}
            aria-live="polite">
          <div className="creator-boot-spinner" aria-hidden="true"/>
          <div style={{fontSize:14,fontWeight:600}}>Preparing your pattern…</div>
          {isActive&&state.bootSettled&&!state.isUploading&&!window.__pendingCreatorFile&&!window.__pendingCreatorHandoffId&&!window.__pendingCreatorAction&&!window.__pendingCreatorJsonFile&&!window.__pendingCreatorDraftId&&!window.__pendingProjectBrandLoad&&!state.newDesignOpen&&<CreatorNoProjectRedirect/>}
        </div>}
        <input ref={state.fRef} type="file" accept={window.Platform ? window.Platform.fileAccept("image/*,.pat,.oxs,.xsd,.xml,.json,.pdf") : "image/*,.pat,.oxs,.xsd,.xml,.json,.pdf"} onChange={(e)=>{
          var f = e.target.files && e.target.files[0];
          if (!f) return;
          var n = (f.name || '').toLowerCase();
          if (rejectUnsupportedFile(f)) { e.target.value = ''; return; }
          var isImage = !/\.(pat|xsd)$/i.test(n) && (f.type || '').indexOf('image/') === 0;
          var isPattern = !isImage && /\.(pat|oxs|xml|json|pdf|xsd)$/i.test(n);
          if (isPattern && window.ImportEngine && typeof window.ImportEngine.importAndReview === 'function') {
            e.target.value = '';
            window.ImportEngine.importAndReview(f, { navigateTo: 'create.html?from=home' }).catch(function(err){ console.error('[creator] Import failed:', err); });
            return;
          }
          io.handleFile(e);
        }} style={{display:"none"}}/>
        {(state.img||state.pat)&&<div className="cs-main">
          <div className="canvas-area">
            {state.pat&&state.pal&&!showConvertView&&<div className={"cs-page-fade cs-page-fade--"+state.tab}>
              <window.CreatorPatternTab/>
              <window.CreatorProjectTab/>
              {/* Action plan §3.2: MaterialsHub lives in creator/extras-bundle.js
                  which is loaded with `defer`. Guard against the brief window
                  before the deferred script finishes parsing. */}
              {typeof window.CreatorMaterialsHub!=="undefined"&&<window.CreatorMaterialsHub/>}
            </div>}
            {showConvertView&&<div className="cvp-layout" style={{display:"flex",gap:20,padding:"12px 16px 16px 0",flex:1,minHeight:0}}>
              {/* Left: source image with crop / change controls */}
              <div className="cvp-source">
                <div id="bg-pick-target" className={"card cvp-source__card"+(state.pickBg?" card--pickBg":"")} style={{overflow:"hidden"}}>
                  <h2 className="cvp-title cvp-title--card">Your picture</h2>
                  {state.pickBg&&<div style={{padding:"8px 12px",fontSize:"var(--text-sm)",color:"var(--text-primary)",fontWeight:600,background:"var(--warning-soft)",borderTop:"1px solid var(--line)",borderBottom:"1px solid var(--line)",display:"flex",alignItems:"center",gap:8}}>
                    <span style={{flex:1}}>Click anywhere on the image to set the background colour.</span>
                    <button onClick={()=>state.setPickBg(false)} title="Cancel pick (Esc)" style={{fontSize:"var(--text-xs)",padding:"2px 7px",border:"1px solid var(--line)",borderRadius:6,background:"var(--surface)",color:"var(--text-primary)",cursor:"pointer",fontWeight:600}}>Cancel</button>
                  </div>}
                  <img src={state.img.src} alt="Original" style={{width:"100%",display:"block",cursor:state.pickBg?"crosshair":"default"}} onClick={canvas.srcClick}/>
                  <div className="cvp-source__controls">
                    <span style={{fontSize:"var(--text-xs)",color:"var(--text-secondary)"}}>{state.origW}×{state.origH}px</span>
                    <div style={{display:"flex",gap:6}}>
                      <button onClick={()=>{state.setIsCropping(true);state.setCropRect(null);}} style={{fontSize:"var(--text-xs)",padding:"2px 7px",cursor:"pointer",border:"0.5px solid var(--line)",borderRadius:6,background:"var(--surface)"}}>Crop</button>
                      <button onClick={()=>state.fRef.current.click()} style={{fontSize:"var(--text-xs)",padding:"2px 7px",cursor:"pointer",border:"0.5px solid var(--line)",borderRadius:6,background:"var(--surface)"}}>Change</button>
                    </div>
                  </div>
                </div>
              </div>
              {/* Right: preview comparison or placeholder */}
              <div className="cvp-main">
                {!state.previewUrl&&<div className="card" style={{padding:"24px 16px",textAlign:"center",color:"var(--text-secondary)",fontSize:12}}>
                  {state.previewError ? <><div role="alert">{state.previewError}</div><button type="button" onClick={preview.generatePreview}>Retry preview</button></> : state.previewLoading ? <span role="status" aria-label="Updating preview">Updating preview…</span> : "Choose an image and adjust the settings to see a preview here."}
                </div>}
                {state.previewUrl&&<ConvertPreview state={state} onRetry={preview.generatePreview}/>}
                {state.pinnedPreview&&<PinnedComparison state={state} compact={_compact}/>}
                {/* Compare options (audit IMG-05): neighbouring sizes or thread
                    counts, side by side; choosing one applies it. */}
                {state.previewUrl&&window.CreatorCompareStrip&&<window.CreatorCompareStrip
                  img={state.img} settings={state.conversionSettings}
                  sW={state.sW} sH={state.sH} maxC={state.maxC} arLock={state.arLock} ar={state.ar}
                  stitchSpeed={state.stitchSpeed} compact={_compact}
                  paletteFor={state.convertPaletteFor}
                  onApply={function(v){
                    if(v.convertBrand){state.setConvertBrand(v.convertBrand);return;}
                    if(v.maxC!=null){state.setMaxC(v.maxC);return;}
                    state.chgW(v.sW);
                    if(!state.arLock)state.chgH(v.sH);
                  }}/>}
                {state.previewUrl&&!state.previewLoading&&state.previewStats&&<PatternEstimates state={state}/>}

              </div>
            </div>}
          </div>
          {state.tab==="pattern"&&<>
            {state.panelOpen&&<div className="rpanel-backdrop" onClick={()=>state.setPanelOpen(false)}/>}
            <div className={"rpanel"+(state.appMode==="edit"?" rpanel--edit":"")+(state.panelOpen?" rpanel--open":"")}>
            <window.CreatorSidebar/>
            </div>
          </>}
        </div>}
        {state.modal==="help"&&<SharedModals.Help defaultTab="creator" onClose={()=>state.setModal(null)} />}
        {state.modal==="about"&&<SharedModals.About onClose={()=>state.setModal(null)} />}
        {state.modal==="shortcuts"&&<SharedModals.Help defaultTab="shortcuts" onClose={()=>state.setModal(null)} />}
        {/* ── Edit → Convert warning modal ── */}
        {state.confirmBackToConvert&&<div role="dialog" aria-modal="true" aria-label="Switch to Convert?" style={{position:"fixed",inset:0,zIndex:1900,background:"rgba(0,0,0,0.5)",display:"flex",alignItems:"center",justifyContent:"center",padding:16}}>
          <div style={{background:"var(--surface)",borderRadius:"var(--radius-md)",padding:24,maxWidth:400,width:"100%",boxShadow:"0 8px 32px rgba(0,0,0,0.18)"}}>
            <div style={{fontSize:"var(--text-md,14px)",fontWeight:700,color:"var(--text-primary)",marginBottom:8}}>Switch to Convert?</div>
            <div style={{fontSize:"var(--text-sm,13px)",color:"var(--text-secondary)",marginBottom:20,lineHeight:1.5}}>
              {"Your "+(state.editHistory?state.editHistory.length:0)+" manual "+(state.editHistory&&state.editHistory.length===1?"edit is":"edits are")+" already saved to this project. Going to Convert clears the undo history, and running Generate again will replace the current pattern."}
            </div>
            <div style={{display:"flex",gap:8,justifyContent:"flex-end"}}>
              <button onClick={()=>state.setConfirmBackToConvert(false)} style={{padding:"7px 14px",fontSize:13,fontWeight:500,border:"1px solid var(--line)",borderRadius:"var(--radius-sm)",background:"var(--surface)",color:"var(--text-secondary)",cursor:"pointer",fontFamily:"inherit"}}>Stay in Edit</button>
              <button onClick={()=>{state.setConfirmBackToConvert(false);state.setAppMode("create");state.setTab("pattern");}} style={{padding:"7px 14px",fontSize:13,fontWeight:600,border:"none",borderRadius:"var(--radius-sm)",background:"var(--accent)",color:"var(--surface)",cursor:"pointer",fontFamily:"inherit"}}>Go to Convert</button>
            </div>
          </div>
        </div>}
        {/* ── Full-screen crop modal ── */}
        {typeof window.CropModal!=="undefined"&&<window.CropModal/>}
      </div>
      {/* Generating: the stage, a progress bar and Cancel (audit IMG-07). */}
      {state.busy&&window.CreatorGenerateProgress&&<window.CreatorGenerateProgress stage={state.progressStage} onCancel={state.cancelGenerate} cancellable={state.generateCancellable}/>}
      <window.CreatorToastContainer/>
      {/* The tour for the way in (audit COMMON-06): converting a picture,
          drawing on a blank grid, or an imported chart. */}
      {tourPage&&isActive&&window.WelcomeWizard&&<window.WelcomeWizard key={tourPage} page={tourPage} onClose={()=>setTourPage('')}/>}
      {_showFirstStitchCoach && window.Coachmark && React.createElement(window.Coachmark, {
        id: 'firstStitch_creator',
        title: 'Paint your first stitch',
        body: _coarsePointer
          ? (state.isScratchMode && !(state.pal && state.pal.length)
            ? 'Add a colour in the Palette tab, tap Paint in the toolbar, then tap a square on the grid. Until you pick a tool, one finger scrolls the chart.'
            : 'Tap Paint in the toolbar, choose a colour, then tap a square on the chart. Until you pick a tool, one finger scrolls the chart.')
          : state.isScratchMode && !(state.pal && state.pal.length)
          ? 'Add a colour in the Palette tab on the right, then click a square on the grid to paint it.'
          : 'Choose a colour in the Palette tab on the right, then click a square on the chart to paint it.',
        placement: 'inside-bottom',
        target: '.canvas-area',
        showHighlight: false,
        helpTopic: 'painting',
        onComplete: ()=>_coach.complete('firstStitch_creator'),
        onSkip: ()=>_coach.skip('firstStitch_creator'),
        onSkipAll: ()=>_coach.skipAll()
      })}
      {_showToolsUnlockedCoach && window.Coachmark && React.createElement(window.Coachmark, {
        id: 'toolsTab_unlocked',
        target: '.creator-sidebar-tab[data-tab-id="tools"]',
        title: 'Tools and View are now unlocked',
        body: 'Open the highlighted Tools tab to paint, fill, select, add part stitches and draw backstitch. Image, Dimensions and Palette stay one click away.',
        placement: 'left',
        showHighlight: true,
        completeOnTargetClick: true,
        helpTopic: 'painting',
        onComplete: ()=>_coach.complete('toolsTab_unlocked'),
        onSkip: ()=>_coach.skip('toolsTab_unlocked'),
        onSkipAll: ()=>_coach.skipAll()
      })}
    </window.HoverContext.Provider>
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
    // The legacy in-Creator home screen has been retired (Tier 2 of the
    // homepage-predominance audit). The Creator now always opens straight
    // into design mode — the redirect guard in index.html bounces users
    // without an active project to /home before this code runs.
    return 'design';
  });
  const[creatorResetKey,setCreatorResetKey]=React.useState(0);
  const[trackerMounted,setTrackerMounted]=React.useState(()=>{
    const p=new URLSearchParams(window.location.search);
    return p.get('mode')==='track'||p.get('mode')==='stats';
  });
  const[trackerReady,setTrackerReady]=React.useState(typeof window.TrackerApp!=='undefined');
  const[statsPageReady,setStatsPageReady]=React.useState(typeof window.StatsPage==='function');
  const pendingTrackerProject=React.useRef(null);

  React.useEffect(()=>{
    if(trackerReady)return;
    // loadTrackerApp is defined by an inline script in create.html / index.html and fetches the tracker bundle on demand; the typeof guard covers a page that does not define it.
    if((mode==='track'||mode==='stats')&&typeof window.loadTrackerApp==='function') window.loadTrackerApp();
    const poll=setInterval(()=>{if(typeof window.TrackerApp!=='undefined'){setTrackerReady(true);clearInterval(poll);}},50);
    return()=>clearInterval(poll);
  },[trackerReady, mode]);

  // Poll for StatsPage readiness whenever we enter stats mode.
  // Without this, the first click shows GlobalStatsDashboard (old view) because
  // stats-page.js is fetched on demand (loadStatsPage), so it may not have loaded yet when mode is first set to 'stats'.
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
    else{window.location.href='home.html';}
  },[]);
  // Nothing reads this callback; the bare hook call keeps the hook order unchanged.
  React.useCallback(()=>switchToStats({tab:'showcase'}),[]);
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
    // Tier 2 of the homepage-predominance audit — the legacy in-Creator home
    // screen is retired. Always navigate to the canonical /home landing.
    window.location.href='home.html';
  },[]);

  // index.html hosts the Creator, the Tracker and Stats in one page, so __csPageKind ('creator') stops being
  // the current tool once Track is open. The help drawer reads this to open Shortcuts on the right section.
  React.useEffect(()=>{
    window.__csActiveTool=mode==='track'?'tracker':mode==='stats'?'stats':'creator';
    return()=>{delete window.__csActiveTool;};
  },[mode]);

  React.useEffect(()=>{
    window.__switchToTrack=switchToTrack;
    window.__switchToDesign=switchToDesign;
    window.__switchToCreate=switchToCreate;
    window.__switchToEdit=switchToEdit;
    window.__switchToStats=switchToStats;
    window.__goHome=goHome;
    return()=>{delete window.__switchToTrack;delete window.__switchToDesign;delete window.__switchToCreate;delete window.__switchToEdit;delete window.__switchToStats;delete window.__goHome;};
  },[switchToTrack,switchToDesign,switchToCreate,switchToEdit,switchToStats,goHome]);

  // Legacy in-Creator Home handlers (that screen is retired, see the mode initialiser).
  // Nothing reads their results; the bare hook calls keep the hook order and deps unchanged.
  React.useCallback((file)=>{
    window.__pendingCreatorFile=file;
    if(typeof ProjectStorage!=='undefined') ProjectStorage.clearActiveProject();
    setCreatorResetKey(k=>k+1);
    window.history.replaceState({},'',window.location.pathname);
    setMode('design');
  },[]);

  React.useCallback(()=>{
    window.__pendingCreatorAction='scratch';
    if(typeof ProjectStorage!=='undefined') ProjectStorage.clearActiveProject();
    setCreatorResetKey(k=>k+1);
    window.history.replaceState({},'',window.location.pathname);
    setMode('design');
    // Scratch mode → Edit, not Create
    setTimeout(()=>{if(window.__setCreatorAppMode) window.__setCreatorAppMode('edit');},0);
  },[]);

  React.useCallback((file)=>{
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

  React.useCallback((file)=>{
    window.__pendingTrackerImportFile=file;
    if(typeof window.loadTrackerApp==='function') window.loadTrackerApp();
    setTrackerMounted(true);
    window.history.replaceState({},'','?mode=track');
    setMode('track');
  },[]);

  React.useCallback((projectMeta, targetMode)=>{
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

  React.useCallback(()=>{
    window.location.href='manager.html';
  },[]);

  const[statsModal,setStatsModal]=React.useState(null);
  // Global "?" shortcut → open Help Centre. Routes to home or design depending
  // on which mode the user is currently viewing.
  React.useEffect(()=>{
    const h=()=>{
      if(mode==='stats'){setStatsModal('help');}
      else if(mode==='track'&&typeof T==='function'){/* Tracker has its own listener */}
      else{
        // In design mode, dispatch via state.setModal if available.
        try{ window.dispatchEvent(new CustomEvent('cs:openHelpDesign')); }catch(_){}
      }
    };
    window.addEventListener('cs:openHelp',h);
    return()=>window.removeEventListener('cs:openHelp',h);
  },[mode]);
  React.useEffect(()=>{
    const h=()=>{
      if(mode==='stats'){setStatsModal('shortcuts');}
      // design/track have their own cs:openShortcuts listeners
    };
    window.addEventListener('cs:openShortcuts',h);
    return()=>window.removeEventListener('cs:openShortcuts',h);
  },[mode]);
  const T=typeof window.TrackerApp!=='undefined'?window.TrackerApp:null;
  return <>
    {/* Tier 2 of the homepage-predominance audit retired the legacy
        in-Creator HomeScreen mount. The Creator now opens straight into
        design mode; users navigate to /home via the topbar logo. */}
    <div key={creatorResetKey} className="cs-design-root" style={{display:mode==='design'?'':'none'}}>
      <CreatorErrorBoundary><CreatorApp onSwitchToTrack={switchToTrack} isActive={mode==='design'}/></CreatorErrorBoundary>
    </div>
    <div style={{display:mode==='track'?'':'none'}}>
      {trackerMounted&&!trackerReady&&(
        <div style={{display:'flex',alignItems:'center',justifyContent:'center',height:'100vh',flexDirection:'column',gap:12,color:'#5C5448',fontSize:14}}>
          <div style={{width:28,height:28,border:'2.5px solid #E5DCCB',borderTopColor:'#B85C38',borderRadius:'50%',animation:'spin 0.8s linear infinite'}}/>
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
      <Header page="stats" tab="" onPageChange={()=>{}} setModal={setStatsModal} />
      {statsPageReady
        ?<window.StatsPage onClose={closeStats} onNavigateToProject={(id)=>{switchToTrack({id})}} onNavigateToStash={()=>{window.location.href='manager.html';}} />
        :<div style={{display:'flex',alignItems:'center',justifyContent:'center',height:'60vh'}}><span style={{opacity:0.5}}>Loading stats…</span></div>}
      {statsModal==='help'&&<SharedModals.Help defaultTab="creator" onClose={()=>setStatsModal(null)} />}
      {statsModal==='shortcuts'&&<SharedModals.Help defaultTab="shortcuts" onClose={()=>setStatsModal(null)} />}
    </div>}
    {window.HelpHintBanner&&<window.HelpHintBanner/>}
  </>;
}

// With nothing to open, the Creator has nothing to show: Home's Create tab
// is the one place to start a pattern (audit COMMON-04).
function CreatorNoProjectRedirect(){
  React.useEffect(function(){
    window.location.replace('home.html?tab=create');
  },[]);
  return null;
}

// ── Pre-mount: process ?action= deep links from /home synchronously ─────
// MUST run BEFORE ReactDOM.createRoot so window.__pendingCreatorFile (and
// friends) are set BEFORE CreatorApp's child-level useEffect in
// useProjectIO consumes them. If this ran inside a parent useEffect, the
// child effect would fire FIRST (React effects: child → parent), miss the
// pending mark, and the user would be stranded on the Welcome card with
// their image silently dropped.
(function processPendingAction(){
  try {
    var p = new URLSearchParams(window.location.search);
    var act = p.get('action');
    // Recovery path: a SW-triggered reload may have stripped action= from the
    // URL (via history.replaceState below) while an image handoff was in
    // progress. If sessionStorage still holds the data URL AND there is no
    // active project to resume, treat this as an interrupted home-image-pending
    // navigation and reconstruct the pending file.
    var hasPendingImage = false;
    if (!act) {
      try {
        if ((sessionStorage.getItem('cs_pending_image_dataurl') || sessionStorage.getItem('cs_pending_image_handoff')) &&
            !localStorage.getItem('crossstitch_active_project')) {
          hasPendingImage = true;
        }
      } catch (_) {}
    }
    if (!act && !hasPendingImage) return;
    window.history.replaceState({}, '', window.location.pathname);
    if (act === 'new-blank') {
      // Clear stale active project so the welcome card doesn't briefly flash.
      if (typeof ProjectStorage !== 'undefined') {
        try { ProjectStorage.clearActiveProject(); } catch (_) {}
      }
      window.__pendingCreatorAction = 'scratch';
      // Match UnifiedApp's legacy Home blank handler: scratch defaults to Edit, not Create.
      setTimeout(function(){ if (window.__setCreatorAppMode) window.__setCreatorAppMode('edit'); }, 0);
    } else if (act === 'home-image-pending' || hasPendingImage) {
      // Do NOT call clearActiveProject() here: if a SW reload triggers
      // location.reload() after history.replaceState has already stripped the
      // URL, the redirect guard would find no action= AND no active project and
      // bounce the user back to /home. Clearing it was doubly wrong for
      // home-image-pending anyway (the upload creates a fresh project later).
      //
      // Set the handoff guard immediately — before reading sessionStorage —
      // so the sw-register.js controllerchange handler suppresses any reload
      // regardless of whether the data URL is still present (e.g. TTL expired).
      window.__creatorImageHandoffActive = true;
      // The picture is in IndexedDB (audit COMMON-07). useProjectIO reads it
      // (the read is asynchronous, so it can't happen here) and deletes it.
      var handoffId = p.get('handoff');
      try { if (!handoffId) handoffId = sessionStorage.getItem('cs_pending_image_handoff'); } catch (_) {}
      if (handoffId && /^handoff:/.test(handoffId)) window.__pendingCreatorHandoffId = handoffId;
      var pendingDataUrl = sessionStorage.getItem('cs_pending_image_dataurl');
      var pendingName    = sessionStorage.getItem('cs_pending_image_name') || 'image.jpg';
      var pendingType    = sessionStorage.getItem('cs_pending_image_type') || 'image/jpeg';
      // INT-6: enforce a TTL on the handoff. If the dataURL was stashed
      // more than PENDING_IMAGE_TTL_MS ago (user abandoned the nav and
      // returned to /create through a different path), drop it so we don't
      // silently re-consume a stale image.
      var PENDING_IMAGE_TTL_MS = 30 * 60 * 1000; // 30 minutes
      try {
        var _tsRaw = sessionStorage.getItem('cs_pending_image_ts');
        var _ts = _tsRaw ? parseInt(_tsRaw, 10) : 0;
        if (pendingDataUrl && _ts && (Date.now() - _ts) > PENDING_IMAGE_TTL_MS) {
          sessionStorage.removeItem('cs_pending_image_dataurl');
          sessionStorage.removeItem('cs_pending_image_name');
          sessionStorage.removeItem('cs_pending_image_type');
          sessionStorage.removeItem('cs_pending_image_ts');
          pendingDataUrl = null;
        }
      } catch (_) {}
      // Intentionally NOT removing sessionStorage items yet. They serve as a
      // reload-safety backup: if a SW controllerchange fires between now and
      // when useProjectIO.js picks up window.__pendingCreatorFile, a reload can
      // re-enter this branch, reconstruct the file, and proceed normally.
      // useProjectIO.js clears them after handleFile() is called.
      if (pendingDataUrl) {
        var b64 = pendingDataUrl.split(',')[1];
        var byteStr = atob(b64);
        var ab = new ArrayBuffer(byteStr.length);
        var ia = new Uint8Array(ab);
        for (var bi = 0; bi < byteStr.length; bi++) ia[bi] = byteStr.charCodeAt(bi);
        var blob = new Blob([ab], { type: pendingType });
        window.__pendingCreatorFile = new File([blob], pendingName, { type: pendingType });
      }
    } else if (act === 'draft') {
      // Home > Projects > Continue on a Convert draft (audit COMMON-07).
      var draftId = p.get('draft');
      if (draftId && /^draft:/.test(draftId)) window.__pendingCreatorDraftId = draftId;
    } else if (act === 'new-from-image') {
      // Legacy fallback: a navigation hit create.html?action=new-from-image.
      // No in-app code routes here any more (Header "Create", /home greeting
      // "+ New project", and manager.html "Add new" all go to /home Create
      // tab now). Bounce them there too rather than dumping them on the
      // welcome card with no image picked.
      window.location.replace('home.html?tab=create');
      return;
    } else if (act === 'open') {
      if (typeof ProjectStorage !== 'undefined') {
        try { ProjectStorage.clearActiveProject(); } catch (_) {}
      }
      setTimeout(function(){ if (window.__setCreatorAppMode) window.__setCreatorAppMode('edit'); }, 0);
    }
  } catch (_) { /* never block render */ }
})();

ReactDOM.createRoot(document.getElementById("root")).render(<UnifiedApp/>);
if (typeof SyncEngine !== 'undefined') SyncEngine.registerBeforeUnloadSnapshot();
