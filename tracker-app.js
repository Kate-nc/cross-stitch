const{useState,useRef,useCallback,useEffect,useMemo}=React;
// Central shortcut registry hooks (loaded by shortcuts.js before tracker-app.js).
// Fall back to no-op stubs in case the script failed to load — tracker still
// renders, just without keyboard shortcuts.
const useShortcuts = (typeof window!=='undefined' && window.useShortcuts) || (function(){});
const useScope     = (typeof window!=='undefined' && window.useScope)     || (function(){});
// deepClone: prefer structuredClone (faster) with JSON fallback for older browsers.
const deepClone=typeof structuredClone==='function'?structuredClone:(x)=>JSON.parse(JSON.stringify(x));

// Hoisted module-scope constants (avoid per-render allocation).
const START_CORNERS=[["TL","Top-left"],["TR","Top-right"],["C","Centre"],["BL","Bottom-left"],["BR","Bottom-right"]];
const DEFAULT_PDF_SETTINGS={chartStyle:'symbols',cellSize:3,paper:'a4',orientation:'portrait',gridInterval:10,gridNumbers:true,centerMarks:true,legendLocation:'separate',legendColumns:2,coverPage:true,progressOverlay:false,separateBackstitch:false};
const PDF_MODAL_LABEL_STYLE={fontSize:'var(--text-sm)',fontWeight:600,color:"var(--text-secondary)",display:"flex",flexDirection:"column",gap:6};
const PDF_MODAL_SELECT_STYLE={padding:"6px 8px",borderRadius:'var(--radius-sm)',border:"1px solid var(--border)",fontSize:'var(--text-md)',background:"var(--surface)"};
const PDF_MODAL_CHECKBOX_LABEL_STYLE={fontSize:'var(--text-sm)',fontWeight:600,color:"var(--text-secondary)",display:"flex",alignItems:"center",gap:6,cursor:"pointer"};
const PDF_MODAL_EXPORT_BTN_STYLE={flex:1,padding:"10px",borderRadius:'var(--radius-md)',border:"none",background:"var(--accent)",color:"var(--surface)",fontWeight:600,cursor:"pointer"};

// Standalone realistic preview modal for the tracker.
// Adapted from creator/RealisticCanvas.js — no CreatorContext required.
function TrackerPreviewModal({pat,cmap,sW,sH,fabricCt,level,onLevelChange,onClose}){
  var displayRef=React.useRef(null);
  var offscreenRef=React.useRef(null);
  var realisticRafRef=React.useRef(null);
  var _offV=React.useState(0);var offscreenVersion=_offV[0],setOffscreenVersion=_offV[1];

  // Effect A: render the full offscreen realistic canvas (identical logic to RealisticCanvas.js)
  React.useEffect(function(){
    if(!pat||!sW||!sH)return;
    if(realisticRafRef.current)cancelAnimationFrame(realisticRafRef.current);
    realisticRafRef.current=requestAnimationFrame(function(){
      realisticRafRef.current=null;
      var MAX_DIM=8192;
      var maxCellSz=(level>=3)?32:16;
      var rawCellSz=Math.floor(Math.min(MAX_DIM/sW,MAX_DIM/sH));
      if(rawCellSz<1)return;
      var CELL_SIZE=Math.max(4,Math.min(maxCellSz,rawCellSz));
      var canvasW=sW*CELL_SIZE,canvasH=sH*CELL_SIZE;
      var offscreen=document.createElement("canvas");
      offscreen.width=canvasW;offscreen.height=canvasH;
      var oc=offscreen.getContext("2d");
      if(!oc)return;
      var FR=245,FG=240,FB=230;
      oc.fillStyle="rgb("+FR+","+FG+","+FB+")";
      oc.fillRect(0,0,canvasW,canvasH);
      var weaveStep=Math.max(3,Math.round(CELL_SIZE/4));
      var fabricTile=document.createElement("canvas");
      fabricTile.width=CELL_SIZE;fabricTile.height=CELL_SIZE;
      var ftc=fabricTile.getContext("2d");
      if(ftc){
        ftc.fillStyle="rgb("+FR+","+FG+","+FB+")";
        ftc.fillRect(0,0,CELL_SIZE,CELL_SIZE);
        ftc.strokeStyle="rgba("+(Math.max(0,FR-10))+","+(Math.max(0,FG-10))+","+(Math.max(0,FB-10))+",0.07)";
        ftc.lineWidth=1;
        for(var wxi=0;wxi<CELL_SIZE;wxi+=weaveStep){ftc.beginPath();ftc.moveTo(wxi+0.5,0);ftc.lineTo(wxi+0.5,CELL_SIZE);ftc.stroke();}
        for(var wyi=0;wyi<CELL_SIZE;wyi+=weaveStep){ftc.beginPath();ftc.moveTo(0,wyi+0.5);ftc.lineTo(CELL_SIZE,wyi+0.5);ftc.stroke();}
        var weavePattern=oc.createPattern(fabricTile,"repeat");
        oc.fillStyle=weavePattern||("rgb("+FR+","+FG+","+FB+")");
        oc.fillRect(0,0,canvasW,canvasH);
      }
      var fc=fabricCt||14;
      var SC=fc<=11?3:(fc<=17?2:1);
      function _lerp(a,b,t){return a+(b-a)*t;}
      function _clamp01(v){return v<0?0:v>1?1:v;}
      var autoCoverage=_clamp01(_clamp01((fc-8)/24)*(SC/2));
      var coverage=_clamp01(Math.round(autoCoverage/0.05)*0.05);
      var sw=Math.max(CELL_SIZE*0.12,CELL_SIZE*_lerp(0.14,0.32,coverage));
      var padding=Math.max(1,CELL_SIZE*_lerp(0.14,0.03,coverage));
      var haloWidthMult=_lerp(1.1,1.5,coverage);
      var haloOpacity=_lerp(0.06,0.18,coverage);
      var twistAmpMult=_lerp(1.0,0.7,coverage);
      var lvl=level;
      function drawCross_L1(tc,r1,g1,b1,r2,g2,b2,x0,y0,x1,y1){
        tc.lineWidth=sw;tc.strokeStyle="rgb("+r1+","+g1+","+b1+")";
        tc.beginPath();tc.moveTo(x0,y1);tc.lineTo(x1,y0);tc.stroke();
        tc.lineWidth=sw;tc.strokeStyle="rgb("+r2+","+g2+","+b2+")";
        tc.beginPath();tc.moveTo(x0,y0);tc.lineTo(x1,y1);tc.stroke();
      }
      function drawCross_L2(tc,r1,g1,b1,r2,g2,b2,x0,y0,x1,y1){
        var INV_SQ2=0.7071;var hs=sw/2;var cx=CELL_SIZE/2,cy=CELL_SIZE/2;
        function makeGrad(perpX,perpY,r,g,b,factor){
          var gx0=cx-perpX*hs,gy0=cy-perpY*hs,gx1=cx+perpX*hs,gy1=cy+perpY*hs;
          var grad=tc.createLinearGradient(gx0,gy0,gx1,gy1);
          function stop(f){return "rgb("+Math.min(255,Math.max(0,Math.round(r*f)))+","+Math.min(255,Math.max(0,Math.round(g*f)))+","+Math.min(255,Math.max(0,Math.round(b*f)))+")"}
          grad.addColorStop(0.00,stop(factor*0.38));grad.addColorStop(0.28,stop(factor*0.90));
          grad.addColorStop(0.50,stop(factor*1.22));grad.addColorStop(0.72,stop(factor*0.90));
          grad.addColorStop(1.00,stop(factor*0.38));return grad;
        }
        tc.lineWidth=sw;tc.strokeStyle=makeGrad(INV_SQ2,INV_SQ2,r1,g1,b1,0.72);
        tc.beginPath();tc.moveTo(x0,y1);tc.lineTo(x1,y0);tc.stroke();
        tc.fillStyle="rgba(0,0,0,0.28)";tc.beginPath();tc.arc(cx,cy,sw*0.75,0,Math.PI*2);tc.fill();
        tc.lineWidth=sw;tc.strokeStyle=makeGrad(INV_SQ2,-INV_SQ2,r2,g2,b2,1.15);
        tc.beginPath();tc.moveTo(x0,y0);tc.lineTo(x1,y1);tc.stroke();
      }
      function drawCross_L34(tc,r1,g1,b1,r2,g2,b2,variant,x0,y0,x1,y1){
        var SN=20,TF=2.5,TA=sw*0.3*twistAmpMult,ISW=sw/SC*1.2;
        var IS_BLEND=!(r1===r2&&g1===g2&&b1===b2);
        var lCX=CELL_SIZE/2,lCY=CELL_SIZE/2;
        function hashVar(seed,si){var hv=((seed*1619)^(si*31337))|0;hv=(hv^(hv>>>13))*1540483477|0;hv=hv^(hv>>>15);return(((hv%8)+8)%8)-4;}
        function mkPts(lsx,lsy,lex,ley,angle,si){var px=-Math.sin(angle),py=Math.cos(angle);var phase=si*(2*Math.PI/SC);var pts=[];for(var n=0;n<=SN;n++){var t=n/SN;var off=Math.sin(t*TF*2*Math.PI+phase)*TA;pts.push(lsx+(lex-lsx)*t+px*off,lsy+(ley-lsy)*t+py*off);}return pts;}
        function drawStrand3(pts,fR,fGc,fBlu){
          tc.beginPath();tc.moveTo(pts[0],pts[1]);for(var k=2;k<pts.length;k+=2)tc.lineTo(pts[k],pts[k+1]);
          tc.lineWidth=ISW*haloWidthMult;tc.strokeStyle="rgba("+fR+","+fGc+","+fBlu+","+haloOpacity+")";tc.stroke();
          tc.beginPath();tc.moveTo(pts[0],pts[1]);for(var k=2;k<pts.length;k+=2)tc.lineTo(pts[k],pts[k+1]);
          tc.lineWidth=ISW;tc.strokeStyle="rgb("+fR+","+fGc+","+fBlu+")";tc.stroke();
        }
        function drawLeg3(lsx,lsy,lex,ley,angle,aR,aG,aB,bR,bG,bB,bright){
          for(var si=0;si<SC;si++){
            var sR,sGv,sB;
            if(IS_BLEND){if(si%2===0){sR=aR;sGv=aG;sB=aB;}else{sR=bR;sGv=bG;sB=bB;}}
            else{var vv=hashVar(variant*17+si,si);sR=Math.min(255,Math.max(0,aR+vv));sGv=Math.min(255,Math.max(0,aG+vv));sB=Math.min(255,Math.max(0,aB+vv));}
            var dfR=Math.min(255,Math.max(0,Math.round(sR*bright)));
            var dfG=Math.min(255,Math.max(0,Math.round(sGv*bright)));
            var dfBlu=Math.min(255,Math.max(0,Math.round(sB*bright)));
            drawStrand3(mkPts(lsx,lsy,lex,ley,angle,si),dfR,dfG,dfBlu);
          }
        }
        function drawLeg3a(lsx,lsy,lex,ley,angle,aR,aG,aB,bR,bG,bB,bright){
          if(!IS_BLEND||SC<2){drawLeg3(lsx,lsy,lex,ley,angle,aR,aG,aB,bR,bG,bB,bright);return;}
          var pts0=mkPts(lsx,lsy,lex,ley,angle,0);var pts1=mkPts(lsx,lsy,lex,ley,angle,1);
          function applyBright(r,g,b){return "rgb("+Math.min(255,Math.max(0,Math.round(r*bright)))+","+Math.min(255,Math.max(0,Math.round(g*bright)))+","+Math.min(255,Math.max(0,Math.round(b*bright)))+")"}
          var cssA=applyBright(aR,aG,aB),cssB=applyBright(bR,bG,bB);
          var crossIdx=[0];
          for(var ck=1;ck<=Math.ceil(2*TF);ck++){var ci=Math.round(ck/(2*TF)*SN);if(ci>0&&ci<SN)crossIdx.push(ci);}
          crossIdx.push(SN);
          function drawSeg(pts,n0,n1,css){if(n1<=n0)return;tc.beginPath();tc.moveTo(pts[n0*2],pts[n0*2+1]);for(var k=n0+1;k<=n1;k++)tc.lineTo(pts[k*2],pts[k*2+1]);tc.lineWidth=ISW;tc.strokeStyle=css;tc.stroke();}
          for(var seg=0;seg<crossIdx.length-1;seg++){
            var n0=crossIdx[seg],n1=crossIdx[seg+1];
            var midT=(n0+n1)/2/SN;var s0Front=Math.sin(midT*TF*2*Math.PI)>=0;
            if(s0Front){drawSeg(pts1,n0,n1,cssB);drawSeg(pts0,n0,n1,cssA);}
            else{drawSeg(pts0,n0,n1,cssA);drawSeg(pts1,n0,n1,cssB);}
          }
        }
        tc.lineCap="round";tc.lineJoin="round";
        var drawLegFn=(lvl===4)?drawLeg3a:drawLeg3;
        drawLegFn(x0,y1,x1,y0,-Math.PI/4,r1,g1,b1,r2,g2,b2,0.78);
        tc.fillStyle="rgba("+FR+","+FG+","+FB+",0.15)";tc.beginPath();tc.arc(lCX,lCY,sw*0.75,0,Math.PI*2);tc.fill();
        drawLegFn(x0,y0,x1,y1,Math.PI/4,r1,g1,b1,r2,g2,b2,1.15);
        var hlPts=mkPts(x0,y0,x1,y1,Math.PI/4,0);
        tc.lineWidth=ISW*0.3;tc.strokeStyle="rgba(255,255,255,0.13)";
        tc.beginPath();tc.moveTo(hlPts[0],hlPts[1]);for(var k=2;k<hlPts.length;k+=2)tc.lineTo(hlPts[k],hlPts[k+1]);tc.stroke();
      }
      function drawCross(tc,r1,g1,b1,r2,g2,b2,variant){
        var x0=padding,y0=padding,x1=CELL_SIZE-padding,y1=CELL_SIZE-padding;
        tc.lineCap="round";
        if(lvl===1)return drawCross_L1(tc,r1,g1,b1,r2,g2,b2,x0,y0,x1,y1);
        if(lvl===2)return drawCross_L2(tc,r1,g1,b1,r2,g2,b2,x0,y0,x1,y1);
        return drawCross_L34(tc,r1,g1,b1,r2,g2,b2,variant,x0,y0,x1,y1);
      }
      var tileCache={};
      function getTile(rgb,rgb2,variant){
        var r1=rgb[0],g1=rgb[1],b1=rgb[2];
        var r2=rgb2?rgb2[0]:r1,g2=rgb2?rgb2[1]:g1,b2=rgb2?rgb2[2]:b1;
        var key=r1+","+g1+","+b1+"|"+r2+","+g2+","+b2+"|cov:"+coverage;
        if(lvl===3||lvl===4)key+=":"+(variant|0);
        if(tileCache[key])return tileCache[key];
        var tileC=document.createElement("canvas");tileC.width=CELL_SIZE;tileC.height=CELL_SIZE;
        var tc=tileC.getContext("2d");
        drawCross(tc,r1,g1,b1,r2,g2,b2,variant|0);
        tileCache[key]=tileC;return tileC;
      }
      var colourFreq={};
      if(lvl===3||lvl===4){
        for(var ci=0;ci<pat.length;ci++){
          var cc=pat[ci];
          if(!cc||cc.id==="__skip__"||cc.id==="__empty__")continue;
          var cKey;
          if(cc.id&&cc.id.indexOf("+")!==-1){cKey=cc.id;}
          else{var cRgb=cc.rgb;if(!cRgb&&cmap){var cLk=cmap[cc.id];if(cLk)cRgb=cLk.rgb;}if(cRgb)cKey=cRgb[0]+","+cRgb[1]+","+cRgb[2];}
          if(cKey)colourFreq[cKey]=(colourFreq[cKey]||0)+1;
        }
      }
      for(var i=0;i<pat.length;i++){
        var cell=pat[i];
        if(!cell||cell.id==="__skip__"||cell.id==="__empty__")continue;
        var cellCol=i%sW,cellRow=Math.floor(i/sW);
        var cellX=cellCol*CELL_SIZE,cellY=cellRow*CELL_SIZE;
        var rgb=cell.rgb,rgb2=null;
        if(cell.id&&cell.id.indexOf("+")!==-1){
          var blendParts=splitBlendId(cell.id);
          var e1=cmap&&cmap[blendParts[0]];var e2=cmap&&cmap[blendParts[1]];
          if(e1)rgb=e1.rgb;if(e2)rgb2=e2.rgb;
        }
        if(!rgb&&cmap){var lookup=cmap[cell.id];if(lookup)rgb=lookup.rgb;}
        if(!rgb)continue;
        var variant3=0;
        if(lvl===3){
          var vKey;
          if(cell.id&&cell.id.indexOf("+")!==-1){vKey=cell.id;}
          else{vKey=rgb[0]+","+rgb[1]+","+rgb[2];}
          if(vKey&&colourFreq[vKey]>=30)variant3=(cellCol+cellRow*3)%4;
        }
        oc.drawImage(getTile(rgb,rgb2,variant3),cellX,cellY);
      }
      offscreenRef.current=offscreen;
      setOffscreenVersion(function(v){return v+1;});
    });
    return function(){if(realisticRafRef.current){cancelAnimationFrame(realisticRafRef.current);realisticRafRef.current=null;}};
  },[pat,cmap,sW,sH,level,fabricCt]);

  // Effect B: scale the offscreen canvas to the display canvas
  React.useEffect(function(){
    if(!offscreenRef.current||!displayRef.current||!sW||!sH)return;
    var off=offscreenRef.current;
    var displayCs=Math.max(2,Math.min(16,Math.floor(700/sW),Math.floor(500/sH)));
    var canvas=displayRef.current;
    canvas.width=sW*displayCs;canvas.height=sH*displayCs;
    var ctx2d=canvas.getContext("2d");
    ctx2d.imageSmoothingEnabled=true;ctx2d.imageSmoothingQuality="high";
    ctx2d.drawImage(off,0,0,sW*displayCs,sH*displayCs);
  },[offscreenVersion,sW,sH]);

  var lvlLabels=["","Flat","Shaded","Detailed","Detailed+blend"];
  var fc2=fabricCt||14;var sc2=fc2<=11?3:fc2<=17?2:1;
  return (
    <div className="modal-overlay" role="dialog" aria-modal="true" aria-label="Realistic preview" onClick={function(e){if(e.target===e.currentTarget)onClose();}} style={{zIndex:1200}}>
      <div className="modal-box" style={{maxWidth:"min(90vw,900px)",maxHeight:"90vh",display:"flex",flexDirection:"column",padding:0,overflow:"hidden"}}>
        <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"12px 16px",borderBottom:"1px solid var(--border)",flexShrink:0}}>
          <div style={{display:"flex",alignItems:"center",gap:'var(--s-3)'}}>
            <span style={{fontWeight:700,fontSize:15}}>Realistic preview</span>
            <div style={{display:"flex",gap:'var(--s-1)'}}>
              {[1,2,3,4].map(function(l){
                return <button key={l} onClick={function(){onLevelChange(l);}} style={{padding:"3px 8px",borderRadius:5,border:"1px solid "+(level===l?"var(--accent)":"var(--border)"),background:level===l?"var(--accent-light)":"var(--surface)",color:level===l?"var(--accent)":"var(--text-secondary)",fontSize:'var(--text-xs)',fontWeight:600,cursor:"pointer"}}>{lvlLabels[l]}</button>;
              })}
            </div>
          </div>
          <button onClick={onClose} aria-label="Close" style={{background:"none",border:"none",fontSize:20,cursor:"pointer",color:"var(--text-tertiary)",lineHeight:1,padding:"0 4px"}}>{Icons.x?Icons.x():"×"}</button>
        </div>
        <div style={{flex:1,overflow:"auto",display:"flex",alignItems:"center",justifyContent:"center",background:"var(--surface-secondary)",padding:'var(--s-4)'}}>
          <canvas ref={displayRef} style={{display:"block",maxWidth:"100%",maxHeight:"calc(90vh - 100px)",imageRendering:"auto"}}/>
        </div>
        <div style={{padding:"8px 16px",borderTop:"1px solid var(--border)",flexShrink:0,fontSize:'var(--text-xs)',color:"var(--text-tertiary)"}}>
          {sW}\u00D7{sH} \u00B7 {fc2}-count\u00B7 {sc2} strand{sc2!==1?"s":""}
        </div>
      </div>
    </div>
  );
}

// ── Stitching Style picker body ──
// StitchingStyleStepBody renders the 3-screen flow without any modal chrome.
// It is reused by:
//   - StitchingStyleOnboarding (legacy modal launcher used by the toolbar
//     "change style" affordance), which wraps this body in modal-overlay.
//   - The first-visit WelcomeWizard, which renders this as a customComponent
//     step so the welcome + style picker present as a single wizard rather
//     than two stacked modals.
// Props: { onComplete({style,blockW,blockH,startCorner}), onBack?, onSkip?, startCorner }
function StitchingStyleStepBody({onComplete,onBack,onSkip,startCorner:initCorner}){
  const[screen,setScreen]=useState(1);
  const[style,setStyle]=useState(null);
  const[bw,setBw]=useState(10),[bh,setBh]=useState(10);
  const[customW,setCustomW]=useState(10),[customH,setCustomH]=useState(10);
  const[showCustom,setShowCustom]=useState(false);
  const[corner,setCorner]=useState(initCorner||"TL");
  const commit=(s,w,h,c)=>{try{localStorage.setItem("cs_styleOnboardingDone","1");}catch(_){}onComplete({style:s,blockW:w,blockH:h,startCorner:c});};
  // Screen 1 — pick general working style.
  if(screen===1)return(
    <div>
      <h3 style={{marginTop:0,fontSize:17}}>How do you usually work through a pattern?</h3>
      <div style={{display:"flex",flexDirection:"column",gap:10,marginTop:'var(--s-4)'}}>
        <button className="modal-choice-btn" onClick={()=>{setStyle("block");setScreen(2);}}>One section at a time</button>
        <button className="modal-choice-btn" onClick={()=>{setStyle("crosscountry");setScreen(3);}}>One colour at a time</button>
        <button className="modal-choice-btn" onClick={()=>{setStyle("freestyle");setScreen(3);}}>I don't have a fixed method</button>
      </div>
      {/* Skip-for-now removed: Phase 4 requires an active selection so users
          don't accidentally bypass the picker and lose the helpful defaults. */}
    </div>
  );
  // Screen 2 — block-shape picker (only for "block" style).
  if(screen===2)return(
    <div>
      <h3 style={{marginTop:0,fontSize:17}}>What shape are your sections?</h3>
      <div style={{display:"flex",flexDirection:"column",gap:10,marginTop:'var(--s-4)'}}>
        <button className="modal-choice-btn" onClick={()=>{setStyle("block");setBw(10);setBh(10);setScreen(3);}}>10×10 blocks</button>
        <button className="modal-choice-btn" onClick={()=>{setStyle("royal");setBw(10);setBh(20);setScreen(3);}}>Tall towers (10 wide × 20 tall)</button>
        <button className="modal-choice-btn" onClick={()=>{setStyle("block");setBw(20);setBh(20);setScreen(3);}}>Larger blocks (20×20)</button>
        <button className="modal-choice-btn" onClick={()=>setShowCustom(v=>!v)}>Other size…</button>
        {showCustom&&<div style={{display:"flex",gap:'var(--s-2)',alignItems:"center",padding:"8px 12px",background:"var(--surface-secondary)",borderRadius:'var(--radius-md)',border:"1px solid var(--border)"}}>
          <label style={{fontSize:'var(--text-sm)',fontWeight:600}}>W:</label>
          <input type="number" inputMode="numeric" value={customW} onChange={e=>setCustomW(Math.max(5,Math.min(100,parseInt(e.target.value)||10)))} style={{width:52,padding:"4px",borderRadius:4,border:"1px solid var(--border)",fontSize:'var(--text-md)'}} min={5} max={100}/>
          <label style={{fontSize:'var(--text-sm)',fontWeight:600}}>H:</label>
          <input type="number" inputMode="numeric" value={customH} onChange={e=>setCustomH(Math.max(5,Math.min(100,parseInt(e.target.value)||10)))} style={{width:52,padding:"4px",borderRadius:4,border:"1px solid var(--border)",fontSize:'var(--text-md)'}} min={5} max={100}/>
          <button onClick={()=>{setStyle("block");setBw(customW);setBh(customH);setScreen(3);}} style={{padding:"4px 10px",borderRadius:4,border:"none",background:"var(--accent)",color:"var(--surface)",cursor:"pointer",fontSize:'var(--text-sm)',fontWeight:600}}>OK</button>
        </div>}
        {showCustom&&(customW%10!==0||customH%10!==0)&&<div style={{fontSize:'var(--text-xs)',color:"var(--warning)",background:"var(--warning-soft)",padding:"4px 10px",borderRadius:'var(--radius-sm)'}}>Custom sizes may not align with the 10-stitch grid lines.</div>}
      </div>
      <button style={{marginTop:'var(--s-4)',background:"none",border:"none",color:"var(--text-tertiary)",cursor:"pointer",fontSize:'var(--text-sm)',display:'inline-flex',alignItems:'center',gap:4}} onClick={()=>setScreen(1)}><span aria-hidden="true" style={{display:'inline-flex'}}>{Icons.chevronLeft?Icons.chevronLeft():null}</span> Back</button>
    </div>
  );
  // Screen 3 — start-corner picker; commits on selection.
  const CORNERS=START_CORNERS;
  return(
    <div>
      <h3 style={{marginTop:0,fontSize:17}}>Where do you usually start?</h3>
      <div style={{display:"flex",flexDirection:"column",gap:10,marginTop:'var(--s-4)'}}>
        {CORNERS.map(([k,l])=><button key={k} className={"modal-choice-btn"+(corner===k?" modal-choice-btn--on":"")} onClick={()=>commit(style||"block",bw,bh,k)}>{l}</button>)}
      </div>
      <button style={{marginTop:'var(--s-4)',background:"none",border:"none",color:"var(--text-tertiary)",cursor:"pointer",fontSize:'var(--text-sm)',display:'inline-flex',alignItems:'center',gap:4}} onClick={()=>setScreen(style==="block"||style==="royal"?2:1)}><span aria-hidden="true" style={{display:'inline-flex'}}>{Icons.chevronLeft?Icons.chevronLeft():null}</span> Back</button>
    </div>
  );
}

// ── Stitching Style Onboarding Modal ──
// Used by the toolbar "Stitching style: …" affordance to re-open the picker
// after the first visit. The first-visit picker is now embedded as a step in
// the WelcomeWizard (see UnifiedApp / TrackerApp welcome mount).
function StitchingStyleOnboarding({onDone,startCorner:initCorner}){
  return(
    <div className="modal-overlay" role="dialog" aria-modal="true" aria-label="Stitching style">
      <div className="modal-content" style={{maxWidth:380}} onClick={e=>e.stopPropagation()}>
        <StitchingStyleStepBody onComplete={onDone} startCorner={initCorner} />
      </div>
    </div>
  );
}

// ── Session Config Modal ──
function SessionConfigModal({onStart,onClose,liveAutoElapsed,liveAutoStitches}){
  const[timeChoice,setTimeChoice]=useState(null);
  const[goalStitches,setGoalStitches]=useState("");
  return(
    <div className="modal-overlay modal-overlay--sheet" role="dialog" aria-modal="true" aria-labelledby="session-config-title" onClick={onClose}>
      <div className="modal-content modal-content--sheet" style={{maxWidth:360}} onClick={e=>e.stopPropagation()}>
        <div className="sheet-handle" aria-hidden="true"/>
        <button className="modal-close" onClick={onClose} aria-label="Close" title="Close">{Icons.x?Icons.x():"\u00D7"}</button>
        <h3 id="session-config-title" style={{marginTop:0,fontSize:17}}>Start Session</h3>
        <div style={{marginBottom:'var(--s-4)'}}>
          <div style={{fontWeight:600,fontSize:'var(--text-sm)',color:"var(--text-secondary)",marginBottom:'var(--s-2)'}}>Time available</div>
          <div style={{display:"flex",gap:'var(--s-2)',flexWrap:"wrap"}}>
            {[[900,"15 min"],[1800,"30 min"],[3600,"1 hr"],[7200,"2 hr"],[null,"Open-ended"]].map(([v,l])=>(
              <button key={String(v)} onClick={()=>setTimeChoice(v)} style={{padding:"6px 12px",borderRadius:'var(--radius-md)',border:"1px solid "+(timeChoice===v?"var(--accent)":"var(--border)"),background:timeChoice===v?"var(--accent-light)":"var(--surface)",color:timeChoice===v?"var(--accent)":"var(--text-secondary)",cursor:"pointer",fontWeight:600,fontSize:'var(--text-sm)'}}>{l}</button>
            ))}
          </div>
        </div>
        <div style={{marginBottom:'var(--s-4)'}}>
          <div style={{fontWeight:600,fontSize:'var(--text-sm)',color:"var(--text-secondary)",marginBottom:'var(--s-2)'}}>Stitch goal (optional)</div>
          <input type="number" inputMode="numeric" enterKeyHint="done" value={goalStitches} onChange={e=>setGoalStitches(e.target.value)} placeholder="e.g. 200" min={1} style={{padding:"6px 10px",borderRadius:'var(--radius-md)',border:"1px solid var(--border)",fontSize:'var(--text-md)',width:"100%",boxSizing:"border-box"}}/>
        </div>
        <button onClick={()=>onStart({timeAvail:timeChoice,stitchGoal:goalStitches?parseInt(goalStitches)||null:null})} style={{width:"100%",padding:"10px",borderRadius:'var(--radius-md)',border:"none",background:"var(--accent)",color:"var(--surface)",fontWeight:600,cursor:"pointer",fontSize:'var(--text-lg)'}}>Start</button>
      </div>
    </div>
  );
}

// ── Session Summary Modal ──
function SessionSummaryModal({data,prevAvgSpeed,onViewBreadcrumbs,hasBreadcrumbs,onClose}){
  if(!data)return null;
  const{durationSeconds,stitchesCompleted,blocksCompleted,coloursCompleted,progressPctBefore,progressPctAfter}=data;
  const mins=Math.floor(durationSeconds/60),secs=durationSeconds%60;
  const speed=durationSeconds>0?Math.round(stitchesCompleted/(durationSeconds/3600)):0;
  const pctDiff=prevAvgSpeed>0?Math.round(((speed-prevAvgSpeed)/prevAvgSpeed)*100):null;
  const progressGain=progressPctBefore!=null&&progressPctAfter!=null?progressPctAfter-progressPctBefore:null;
  return(
    <div className="modal-overlay" role="dialog" aria-modal="true" aria-labelledby="session-complete-title" onClick={onClose}>
      <div className="modal-content" style={{maxWidth:360}} onClick={e=>e.stopPropagation()}>
        <button className="modal-close" onClick={onClose} aria-label="Close">{Icons.x?Icons.x():"×"}</button>
        <h3 id="session-complete-title" style={{marginTop:0,fontSize:18,color:"var(--text-primary)"}}>Session complete</h3>
        <div style={{display:"flex",flexDirection:"column",gap:'var(--s-2)',marginBottom:'var(--s-4)'}}>
          <div style={{display:"flex",justifyContent:"space-between",fontSize:'var(--text-lg)'}}><span style={{color:"var(--text-secondary)"}}>Time</span><span style={{fontWeight:700}}>{mins}m {secs}s</span></div>
          <div style={{display:"flex",justifyContent:"space-between",fontSize:'var(--text-lg)'}}><span style={{color:"var(--text-secondary)"}}>Stitches</span><span style={{fontWeight:700}}>{stitchesCompleted}</span></div>
          <div style={{display:"flex",justifyContent:"space-between",fontSize:'var(--text-lg)'}}><span style={{color:"var(--text-secondary)"}}>Speed</span><span style={{fontWeight:700}}>{speed} st/hr{pctDiff!=null?<span style={{fontSize:'var(--text-xs)',fontWeight:400,color:pctDiff>=0?"var(--success)":"var(--danger)",marginLeft:6}}>{pctDiff>=0?"+":""}{pctDiff}% vs avg</span>:null}</span></div>
          {progressPctBefore!=null&&progressPctAfter!=null&&<div style={{display:"flex",justifyContent:"space-between",fontSize:'var(--text-lg)'}}><span style={{color:"var(--text-secondary)"}}>Progress</span><span style={{fontWeight:700}}>{progressPctBefore}%<span style={{color:"var(--text-tertiary)",fontWeight:400,margin:"0 4px"}}>to</span>{progressPctAfter}%{progressGain!=null&&progressGain>0&&<span style={{fontSize:'var(--text-xs)',fontWeight:400,color:"var(--success)",marginLeft:6}}>+{progressGain}%</span>}</span></div>}
          {blocksCompleted>0&&<div style={{display:"flex",justifyContent:"space-between",fontSize:'var(--text-lg)'}}><span style={{color:"var(--text-secondary)"}}>Blocks</span><span style={{fontWeight:700}}>{blocksCompleted}</span></div>}
          {coloursCompleted&&coloursCompleted.length>0&&<div style={{display:"flex",justifyContent:"space-between",fontSize:'var(--text-lg)'}}><span style={{color:"var(--text-secondary)"}}>Colours finished</span><span style={{fontWeight:700}}>{coloursCompleted.length}</span></div>}
        </div>
        <div style={{display:"flex",gap:'var(--s-2)'}}>
          {hasBreadcrumbs&&<button onClick={onViewBreadcrumbs} style={{flex:1,padding:"8px",borderRadius:'var(--radius-md)',border:"1px solid var(--border)",background:"var(--surface)",cursor:"pointer",fontSize:'var(--text-md)',fontWeight:600,color:"var(--text-secondary)"}}>View breadcrumb trail</button>}
          <button onClick={onClose} style={{flex:1,padding:"8px",borderRadius:'var(--radius-md)',border:"none",background:"var(--accent)",color:"var(--surface)",cursor:"pointer",fontSize:'var(--text-md)',fontWeight:600}}>Close</button>
        </div>
      </div>
    </div>
  );
}

function TrackerProjectPicker({list,currentId,onPick,onClose}){
  const sorted=[...(list||[])].sort((a,b)=>{
    const ad=a.updatedAt?new Date(a.updatedAt).getTime():0;
    const bd=b.updatedAt?new Date(b.updatedAt).getTime():0;
    return bd-ad;
  });
  return(
    <div onClick={onClose} style={{position:"fixed",inset:0,background:"rgba(15,23,42,0.55)",zIndex:1000,display:"flex",alignItems:"center",justifyContent:"center",padding:20}}>
      <div onClick={e=>e.stopPropagation()} style={{background:"var(--surface)",borderRadius:'var(--radius-xl)',padding:20,maxWidth:560,width:"100%",maxHeight:"80vh",display:"flex",flexDirection:"column",boxShadow:"0 20px 60px rgba(0,0,0,0.3)"}}>
        <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:'var(--s-3)'}}>
          <h3 style={{margin:0,fontSize:17,color:"var(--text-primary)"}}>Switch project</h3>
          <button onClick={onClose} aria-label="Close" style={{background:"none",border:"none",cursor:"pointer",color:"var(--text-tertiary)",padding:"0 4px",display:"inline-flex",alignItems:"center"}}>{Icons.x?Icons.x():"\u00D7"}</button>
        </div>
        <p style={{margin:"0 0 12px",fontSize:'var(--text-sm)',color:"var(--text-tertiary)"}}>Pick another saved project to track. Your current progress is auto-saved.</p>
        <div style={{flex:1,overflowY:"auto",display:"flex",flexDirection:"column",gap:'var(--s-2)',paddingRight:4}}>
          {sorted.length===0&&<div style={{padding:"24px 0",textAlign:"center",fontSize:'var(--text-md)',color:"var(--text-tertiary)"}}>No saved projects yet.</div>}
          {sorted.map(p=>{
            const isActive=p.id===currentId;
            const total=p.totalStitches||0;
            const done=p.completedStitches||0;
            const pct=total>0?Math.round(done/total*100):0;
            return(
              <button key={p.id} onClick={()=>!isActive&&onPick(p)} disabled={isActive} style={{
                display:"flex",alignItems:"center",gap:'var(--s-3)',padding:"10px 12px",borderRadius:'var(--radius-md)',
                border:isActive?"2px solid var(--accent)":"1px solid var(--border)",
                background:isActive?"var(--accent-light)":"var(--surface)",
                cursor:isActive?"default":"pointer",textAlign:"left",fontFamily:"inherit",
                opacity:isActive?0.85:1
              }}>
                <div style={{flex:1,minWidth:0}}>
                  <div style={{fontSize:'var(--text-md)',fontWeight:600,color:"var(--text-primary)",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>
                    {p.name||"Untitled"}
                    {isActive&&<span style={{marginLeft:'var(--s-2)',fontSize:10,fontWeight:700,color:"var(--accent)",background:"var(--accent-light)",padding:"1px 6px",borderRadius:'var(--radius-md)',verticalAlign:"middle"}}>ACTIVE</span>}
                  </div>
                  <div style={{display:"flex",alignItems:"center",gap:'var(--s-2)',marginTop:'var(--s-1)'}}>
                    <div style={{flex:1,height:5,background:"var(--border)",borderRadius:3,overflow:"hidden"}}>
                      <div style={{width:pct+"%",height:"100%",background:pct===100?"var(--success)":"var(--accent)"}}/>
                    </div>
                    <span style={{fontSize:'var(--text-xs)',color:"var(--text-tertiary)",fontVariantNumeric:"tabular-nums",minWidth:36,textAlign:"right"}}>{pct}%</span>
                  </div>
                  <div style={{fontSize:10,color:"var(--text-tertiary)",marginTop:3}}>
                    {p.dimensions?(p.dimensions.width+"\u00D7"+p.dimensions.height+" \u00B7 "):""}
                    {done.toLocaleString()+" / "+total.toLocaleString()+" stitches"}
                    {p.updatedAt?(" \u00B7 updated "+new Date(p.updatedAt).toLocaleDateString()):""}
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// Phase 4 (UX-12) — Tracker tablet/desktop project rail + side panel.
// Reads recent projects from ProjectStorage.listProjects() and renders a
// fast switcher on the left, plus a stacked palette + Today stats card on
// the right. Both surfaces are CSS-gated to >=600px viewports; phone
// keeps its existing chrome (action bar + dock + mode pill).
// ═══════════════════════════════════════════════════════════════
function TrackerProjectRail({activeId,pal,cmap,colourDoneCounts,focusColour,setFocusColour,stitchView,setStitchView,todayStitchesForBar,liveAutoElapsed,liveAutoStitches,onPickProject,skeinData,globalStash,onToggleOwned}){
  const[recent,setRecent]=React.useState([]);
  const[collapsed,setCollapsed]=React.useState(function(){
    try{return !!(window.UserPrefs&&window.UserPrefs.get("trackerProjectRailCollapsed"));}catch(_){return false;}
  });
  React.useEffect(function(){
    try{window.UserPrefs&&window.UserPrefs.set("trackerProjectRailCollapsed",!!collapsed);}catch(_){}
    try{document.body.classList.toggle("tracker-rail-collapsed",!!collapsed);}catch(_){}
    return function(){try{document.body.classList.remove("tracker-rail-collapsed");}catch(_){}};
  },[collapsed]);
  React.useEffect(function(){
    let cancelled=false;
    function load(){
      if(!window.ProjectStorage||!window.ProjectStorage.listProjects)return;
      window.ProjectStorage.listProjects().then(function(list){
        if(cancelled)return;
        setRecent((list||[]).slice(0,8));
      }).catch(function(){});
    }
    load();
    var onChange=function(){load();};
    window.addEventListener('cs:projectsChanged',onChange);
    return function(){cancelled=true;window.removeEventListener('cs:projectsChanged',onChange);};
  },[activeId]);
  function openProject(id){
    if(!id||id===activeId)return;
    // Switch in-place via the same path the project-picker modal uses.
    // Falls back to reload only if the host App didn't supply a handler.
    if(typeof onPickProject==='function'){onPickProject(id);return;}
    try{window.ProjectStorage.setActiveProject(id);}catch(_){}
    try{window.location.reload();}catch(_){}
  }
  var sec=liveAutoElapsed||0;
  var hh=Math.floor(sec/3600),mm=Math.floor((sec%3600)/60);
  var timer=(hh>0?hh+"h ":"")+mm+"m";
  return React.createElement('aside',{className:'tracker-project-rail'+(collapsed?' tracker-project-rail--collapsed':''),role:'complementary','aria-label':'Recent projects'},
    React.createElement('div',{className:'tpr-header'},
      collapsed?null:React.createElement('h3',{className:'tpr-h'},'Projects'),
      React.createElement('button',{
        type:'button',className:'tpr-collapse-btn',
        onClick:function(){setCollapsed(function(c){return !c;});},
        'aria-label':collapsed?'Expand projects rail':'Collapse projects rail',
        'aria-expanded':!collapsed,
        title:collapsed?'Expand projects rail':'Collapse projects rail'
      },(collapsed?(window.Icons&&window.Icons.chevronRight?window.Icons.chevronRight():null):(window.Icons&&window.Icons.chevronLeft?window.Icons.chevronLeft():null)))
    ),
    React.createElement('div',{className:'tpr-list'},
      (recent.length===0
        ? React.createElement('div',{className:'tpr-empty'},'No saved projects yet')
        : recent.map(function(p){
            var isActiveProj=p.id===activeId;
            var pct=0;
            if(p.totalStitchable&&p.doneCount!=null)pct=Math.round(p.doneCount/p.totalStitchable*100);
            else if(p.progressPct!=null)pct=Math.round(p.progressPct);
            var thumb=p.thumbDataUrl;
            var initial=(p.name||'?').trim().charAt(0).toUpperCase()||'?';
            var firstColour=p.firstPaletteRgb||null;
            return React.createElement('button',{
              key:p.id,type:'button',className:'tpr-row'+(isActiveProj?' tpr-row--on':''),
              onClick:function(){openProject(p.id);},'aria-current':isActiveProj?'true':'false',
              title:p.name||'Untitled project'
            },
              React.createElement('span',{className:'tpr-thumb',style:thumb?{backgroundImage:'url('+thumb+')'}:(firstColour?{background:'rgb('+firstColour+')'}:{background:'var(--surface-tertiary)'})},
                thumb?null:React.createElement('span',{className:'tpr-initial'},initial)
              ),
              React.createElement('span',{className:'tpr-text'},
                React.createElement('span',{className:'tpr-name'},p.name||'Untitled'),
                React.createElement('span',{className:'tpr-pct'},pct+'% done')
              )
            );
          })
      )
    ),
    React.createElement('button',{
      className:'tpr-more',type:'button',
      style:collapsed?{display:'none'}:undefined,
      onClick:function(){
        try{
          var btn=document.querySelector('.tracker-hamburger');
          if(btn)btn.click();
        }catch(_){}
      }
    },'More projects…'),
    React.createElement('div',{className:'tracker-side-panel',role:'complementary','aria-label':'Today and palette',style:collapsed?{display:'none'}:undefined},
      React.createElement('section',{className:'tsp-card'},
        React.createElement('h3',{className:'tsp-h'},'Today'),
        React.createElement('div',{className:'tsp-stat'},React.createElement('span',null,'Stitches'),React.createElement('strong',null,(todayStitchesForBar||0).toLocaleString())),
        React.createElement('div',{className:'tsp-stat'},React.createElement('span',null,'Session'),React.createElement('strong',null,timer)),
        React.createElement('div',{className:'tsp-stat'},React.createElement('span',null,'Active'),React.createElement('strong',null,(liveAutoStitches||0).toLocaleString()+' st'))
      ),
      React.createElement('section',{className:'tsp-card'},
        // Threads-needed view (replaces the duplicate palette legend).
        // Decomposes blends into individual DMC IDs via skeinData and
        // splits "Owned" vs "Need to buy" using the global stash. The
        // ownership toggle writes through StashBridge so /manager and
        // the shopping list stay in sync.
        (function(){
          const rows=(skeinData||[]).map(function(d){
            const gs=(globalStash&&(globalStash['dmc:'+d.id]||globalStash[d.id]))||null;
            const owned=gs&&typeof gs.owned==='number'?gs.owned:0;
            // "Have" if user owns at least the estimated skein count.
            const have=owned>=d.skeins&&d.skeins>0;
            // Find a palette entry whose stitches use this thread, so
            // clicking a row sets a sensible focus colour. Prefer a
            // solid match; fall back to any blend that contains it.
            let focusId=null;
            if(pal){
              const solid=pal.find(function(pp){return pp.type==='solid'&&pp.id===d.id;});
              if(solid)focusId=solid.id;
              else{
                const blend=pal.find(function(pp){return pp.type==='blend'&&pp.threads&&pp.threads.some(function(t){return t.id===d.id;});});
                if(blend)focusId=blend.id;
              }
            }
            return{d,owned,have,focusId};
          });
          const ownedRows=rows.filter(function(r){return r.have;});
          const needRows=rows.filter(function(r){return !r.have;});
          // Sort each group by skeins-needed descending so the biggest
          // shopping items surface first; tie-break by DMC ID asc.
          function _sortBySkeins(a,b){
            if(b.d.skeins!==a.d.skeins)return b.d.skeins-a.d.skeins;
            const an=parseInt(a.d.id,10),bn=parseInt(b.d.id,10);
            if(isFinite(an)&&isFinite(bn))return an-bn;
            return String(a.d.id).localeCompare(String(b.d.id));
          }
          ownedRows.sort(_sortBySkeins);
          needRows.sort(_sortBySkeins);
          function renderRow(r){
            const d=r.d;
            const isOn=focusColour&&r.focusId===focusColour;
            return React.createElement('div',{key:d.id,className:'tsp-row tsp-row--thread'+(isOn?' tsp-row--on':'')},
              React.createElement('button',{
                type:'button',className:'tsp-thread-main',
                onClick:function(){if(!r.focusId)return;if(stitchView!=='highlight')setStitchView('highlight');setFocusColour(r.focusId);},
                title:'DMC '+d.id+(d.name?(' — '+d.name):'')+' · '+d.skeins+' skein'+(d.skeins===1?'':'s')+' needed'
              },
                React.createElement('span',{className:'tsp-sw',style:{background:'rgb('+(d.rgb||[128,128,128]).join(',')+')'}}),
                React.createElement('span',{className:'tsp-id'},d.id),
                React.createElement('span',{className:'tsp-name'},d.name||''),
                React.createElement('span',{className:'tsp-rem',title:'Skeins needed'},d.skeins+'\u00D7'),
                r.have
                  ? React.createElement('span',{className:'tsp-own-pip tsp-own-pip--have',title:'You have '+r.owned+' skein'+(r.owned===1?'':'s')+' of DMC '+d.id+' in your stash','aria-label':'In stash'},window.Icons.check())
                  : React.createElement('span',{className:'tsp-own-pip tsp-own-pip--need',title:'You have '+r.owned+' skein'+(r.owned===1?'':'s')+' \u2014 need '+(d.skeins-r.owned)+' more','aria-label':'Need to buy'},(d.skeins-r.owned)+'\u00D7')
              ),
              typeof onToggleOwned==='function' && React.createElement('button',{
                type:'button',className:'tsp-stash-btn',
                onClick:function(e){e.stopPropagation();onToggleOwned(d.id,r.have?Math.max(0,r.owned-d.skeins):d.skeins);},
                title:r.have?('Remove '+d.skeins+' skein'+(d.skeins===1?'':'s')+' of DMC '+d.id+' from your stash'):('Mark '+d.skeins+' skein'+(d.skeins===1?'':'s')+' of DMC '+d.id+' as owned'),
                'aria-label':r.have?'Remove from stash':'Add to stash'
              },r.have?window.Icons.minus():window.Icons.plus())
            );
          }
          return React.createElement(React.Fragment,null,
            React.createElement('h3',{className:'tsp-h'},'Threads needed \u00B7 '+rows.length),
            (needRows.length>0)&&React.createElement('div',{className:'tsp-group'},
              React.createElement('div',{className:'tsp-group-h'},'To buy \u00B7 '+needRows.length),
              React.createElement('div',{className:'tsp-pal'},needRows.map(renderRow))
            ),
            (ownedRows.length>0)&&React.createElement('div',{className:'tsp-group'},
              React.createElement('div',{className:'tsp-group-h'},'In stash \u00B7 '+ownedRows.length),
              React.createElement('div',{className:'tsp-pal'},ownedRows.map(renderRow))
            ),
            rows.length===0&&React.createElement('div',{className:'tsp-empty'},'No threads in this pattern')
          );
        })()
      )
    )
  );
}

function TrackerApp({onSwitchToDesign=null, onGoHome=null, isActive=true, incomingProject=null}={}){
const[sW,setSW]=useState(80);
const[sH,setSH]=useState(80);
const[pat,setPat]=useState(null);
const[pal,setPal]=useState(null);
const[cmap,setCmap]=useState(null);
const incomingProjectRef=useRef(incomingProject);
const[fabricCt,setFabricCt]=useState(14);
const[skeinPrice,setSkeinPrice]=useState(DEFAULT_SKEIN_PRICE);
const[stitchSpeed,setStitchSpeed]=useState(40);

const[loadError,setLoadError]=useState(null);
const[copied,setCopied]=useState(null);
const[modal,setModal]=useState(null);
// ── Mobile: bottom action bar + colour quick-switcher state ──
// `quickColourOpen` toggles a dedicated bottom drawer that lets the user pick
// the focus colour with one tap. It's only used on touch / narrow viewports.
const[quickColourOpen,setQuickColourOpen]=useState(false);
// ── Phase 4 (UX-12) — floating tool dock vertical position (phone) ──
// User-draggable along the right edge. Persisted between sessions.
const[dockY,setDockY]=useState(()=>{
  try{const v=parseInt(localStorage.getItem("tracker_dock_y")||"",10);return Number.isFinite(v)?v:40;}catch(_){return 40;}
});
useEffect(()=>{try{localStorage.setItem("tracker_dock_y",String(dockY));}catch(_){}},[dockY]);
// ── Phase 4 (UX-12) — wake-lock chip ──
// Holds the WakeLockSentinel returned by navigator.wakeLock.request when active.
// Re-acquired on next session if the user previously toggled it on (UserPrefs).
const wakeLockRef=useRef(null);
const[wakeLockActive,setWakeLockActive]=useState(false);
const releaseWakeLock=useCallback(async()=>{
  if(wakeLockRef.current){try{await wakeLockRef.current.release();}catch(_){}wakeLockRef.current=null;}
  setWakeLockActive(false);
},[]);
const acquireWakeLock=useCallback(async()=>{
  try{
    if(typeof navigator==='undefined'||!navigator.wakeLock||!navigator.wakeLock.request)return false;
    const sentinel=await navigator.wakeLock.request('screen');
    wakeLockRef.current=sentinel;
    setWakeLockActive(true);
    sentinel.addEventListener&&sentinel.addEventListener('release',()=>{setWakeLockActive(false);wakeLockRef.current=null;});
    return true;
  }catch(_){setWakeLockActive(false);return false;}
},[]);
const toggleWakeLock=useCallback(async()=>{
  if(wakeLockActive){
    await releaseWakeLock();
    try{if(window.UserPrefs)window.UserPrefs.set('trackerWakeLock',false);}catch(_){}
  }else{
    const ok=await acquireWakeLock();
    try{if(window.UserPrefs)window.UserPrefs.set('trackerWakeLock',!!ok);}catch(_){}
    if(!ok){try{if(window.Toast&&window.Toast.show)window.Toast.show({message:"Screen wake-lock not available on this browser.",type:"warn"});}catch(_){}}
  }
},[wakeLockActive,acquireWakeLock,releaseWakeLock]);
useEffect(()=>{
  let cancelled=false;
  try{
    const want=window.UserPrefs&&window.UserPrefs.get('trackerWakeLock');
    if(want){acquireWakeLock().then(ok=>{if(cancelled&&ok)releaseWakeLock();});}
  }catch(_){}
  function onVis(){
    if(document.visibilityState==='visible'){
      try{const want=window.UserPrefs&&window.UserPrefs.get('trackerWakeLock');if(want&&!wakeLockRef.current)acquireWakeLock();}catch(_){}
    }
  }
  document.addEventListener('visibilitychange',onVis);
  return()=>{cancelled=true;document.removeEventListener('visibilitychange',onVis);releaseWakeLock();};
},[acquireWakeLock,releaseWakeLock]);
// Tag the document body with `tracker-mobile` while the Tracker is mounted on a
// touch / narrow viewport. CSS scopes the new bottom action bar and quick-
// switcher drawer to this class so desktop layout is untouched.
useEffect(()=>{
  if(typeof window==='undefined'||!window.matchMedia)return;
  const mql=window.matchMedia('(pointer: coarse), (max-width: 899px)');
  const apply=()=>{document.body.classList.toggle('tracker-mobile',mql.matches);};
  apply();
  // Modern + legacy listener API
  if(mql.addEventListener)mql.addEventListener('change',apply);
  else if(mql.addListener)mql.addListener(apply);
  return()=>{
    document.body.classList.remove('tracker-mobile');
    document.body.classList.remove('tracker-immersive');
    if(mql.removeEventListener)mql.removeEventListener('change',apply);
    else if(mql.removeListener)mql.removeListener(apply);
  };
},[]);
// ── Mobile immersive mode ──
// While actively scrolling the pattern, slide the topbar + toolbar off-screen
// so the canvas can use almost the full viewport. On any upward scroll the
// chrome reappears immediately. Only active on touch / narrow viewports.
// Re-evaluates when the media query changes (e.g. on resize or screen rotation).
useEffect(()=>{
  if(typeof window==='undefined'||!window.matchMedia)return;
  const mql=window.matchMedia('(pointer: coarse), (max-width: 899px)');
  // Canvas scroll container is created later — poll briefly until it exists.
  let lastY=0,raf=0;
  function handleScroll(target){
    const y=target.scrollTop;
    if(raf)return;
    raf=requestAnimationFrame(()=>{
      raf=0;
      const goingDown=y>lastY;
      if(goingDown&&y>50){document.body.classList.add('tracker-immersive');}
      else if(!goingDown){document.body.classList.remove('tracker-immersive');}
      lastY=y;
    });
  }
  let attached=null;
  function attach(){
    const el=document.querySelector('.canvas-area');
    if(!el)return false;
    const fn=(e)=>handleScroll(e.target);
    el.addEventListener('scroll',fn,{passive:true});
    attached={el,fn};
    return true;
  }
  function detach(){
    if(attached){attached.el.removeEventListener('scroll',attached.fn);attached=null;}
    if(raf){cancelAnimationFrame(raf);raf=0;}
    document.body.classList.remove('tracker-immersive');
  }
  let tries=[];
  function enable(){
    if(attached)return;
    lastY=0;
    if(!attach()){
      tries=[100,300,800,1500].map(d=>setTimeout(()=>{if(!attached&&mql.matches)attach();},d));
    }
  }
  function onMqlChange(){
    if(mql.matches){enable();}else{tries.forEach(clearTimeout);tries=[];detach();}
  }
  if(mql.addEventListener)mql.addEventListener('change',onMqlChange);
  else if(mql.addListener)mql.addListener(onMqlChange);
  // Initialise for the current state.
  if(mql.matches)enable();
  return()=>{
    if(mql.removeEventListener)mql.removeEventListener('change',onMqlChange);
    else if(mql.removeListener)mql.removeListener(onMqlChange);
    tries.forEach(clearTimeout);
    detach();
  };
},[]);
// Generic Tracker welcome — fires once on first visit, before the existing
// StitchingStyleOnboarding (which is domain-specific).
const[welcomeOpen,setWelcomeOpen]=useState(()=>{try{return !!(window.WelcomeWizard&&window.WelcomeWizard.shouldShow('tracker'));}catch(_){return false;}});
// Global "?" shortcut → open Help Centre.
useEffect(()=>{const h=()=>setModal("help");window.addEventListener("cs:openHelp",h);return()=>window.removeEventListener("cs:openHelp",h);},[]);
// Command Palette → Shortcuts modal.
useEffect(()=>{const h=()=>setModal("shortcuts");window.addEventListener("cs:openShortcuts",h);return()=>window.removeEventListener("cs:openShortcuts",h);},[]);
// "Show welcome tour again" from HelpCentre → re-open the wizard.
useEffect(()=>{const h=(e)=>{if(!e||!e.detail||e.detail.page==='tracker')setWelcomeOpen(true);};window.addEventListener("cs:showWelcome",h);return()=>window.removeEventListener("cs:showWelcome",h);},[]);
// Register Tracker-specific Command Palette actions (M9).
useEffect(()=>{
  if(!window.CommandPalette||!window.CommandPalette.registerPage)return;
  window.CommandPalette.registerPage('tracker',[
    { id:'trk_save_project', label:'Save Project', section:'action', keywords:['save','project'],
      action:()=>{ try{ if(typeof saveProject==='function') saveProject(); }catch(_){} } },
    { id:'trk_export_pdf', label:'Export Pattern Keeper PDF', section:'action', keywords:['pdf','export','print','pattern','keeper'],
      action:()=>setModal('pdf_export') },
    { id:'trk_show_welcome', label:'Show Welcome Tour', section:'action', keywords:['welcome','tour','onboarding','intro'],
      action:()=>setWelcomeOpen(true) }
  ]);
  return()=>{ if(window.CommandPalette) window.CommandPalette.registerPage('tracker',[]); };
},[]);
const[projectPickerOpen,setProjectPickerOpen]=useState(false);
const[projectPickerList,setProjectPickerList]=useState([]);
const[preferencesOpen,setPreferencesOpen]=useState(false);
const[shortcutsHintDismissed,setShortcutsHintDismissed]=useState(()=>{try{return !!localStorage.getItem("shortcuts_hint_dismissed");}catch(_){return false;}});
const [pdfSettings, setPdfSettings] = useState(DEFAULT_PDF_SETTINGS);
const showCtr=true;
const[bsLines,setBsLines]=useState([]);

const[done,setDone]=useState(null);
// ── BUGFIX: live ref to latest `done` so toggle/bulk callbacks always
//    read the freshest array even when invoked before React commits a
//    prior setDone. Prevents the "marking a new stitch unmarks all
//    previous in-session stitches" regression caused by stale closures
//    in fast-tap sequences (incremental counters survive because they
//    use refs; the visible `done` array did not).
const doneRef=useRef(null);
doneRef.current=done;
const[doneSnapshots,setDoneSnapshots]=useState([]);
const lastSnapshotDateRef=useRef(null);
const[trackHistory,setTrackHistory]=useState([]);
const[redoStack,setRedoStack]=useState([]);
const TRACK_HISTORY_MAX=50;

// ── Incremental stitch counters ──
const doneCountRef=useRef(0);
const colourDoneCountsRef=useRef({});
const[countsVer,setCountsVer]=useState(0);
function recomputeAllCounts(patArr,doneArr,hs,hd){
  let dc=0,cdc={};
  if(patArr){
    for(let i=0;i<patArr.length;i++){const id=patArr[i].id;if(id==="__skip__"||id==="__empty__")continue;if(!cdc[id])cdc[id]={total:0,done:0,halfTotal:0,halfDone:0};cdc[id].total++;if(doneArr&&doneArr[i]){dc++;cdc[id].done++;}}
    if(hs)hs.forEach(function(hsv,idx){
      if(hsv.fwd){var id=hsv.fwd.id;if(!cdc[id])cdc[id]={total:0,done:0,halfTotal:0,halfDone:0};cdc[id].halfTotal++;var hdv=hd&&hd.get(idx);if(hdv&&hdv.fwd)cdc[id].halfDone++;}
      if(hsv.bck){var id=hsv.bck.id;if(!cdc[id])cdc[id]={total:0,done:0,halfTotal:0,halfDone:0};cdc[id].halfTotal++;var hdv=hd&&hd.get(idx);if(hdv&&hdv.bck)cdc[id].halfDone++;}
    });
  }
  doneCountRef.current=dc;colourDoneCountsRef.current=cdc;setCountsVer(function(v){return v+1;});
}
function applyDoneCountsDelta(changes,patArr,newDoneArr){
  if(!changes||!changes.length||!patArr)return;
  var dc=doneCountRef.current,cdc=colourDoneCountsRef.current;
  // Shallow-copy only affected colour entries
  var touched={};
  for(var i=0;i<changes.length;i++){
    var idx=changes[i].idx,oldV=changes[i].oldVal,newV=newDoneArr[idx];
    if(oldV===newV)continue;
    var id=patArr[idx].id;if(id==="__skip__"||id==="__empty__")continue;
    if(!touched[id]){touched[id]=true;cdc[id]=cdc[id]?{total:cdc[id].total,done:cdc[id].done,halfTotal:cdc[id].halfTotal,halfDone:cdc[id].halfDone}:{total:0,done:0,halfTotal:0,halfDone:0};}
    if(oldV&&!newV){dc--;cdc[id].done--;}
    else if(!oldV&&newV){dc++;cdc[id].done++;}
  }
  doneCountRef.current=dc;colourDoneCountsRef.current=cdc;setCountsVer(function(v){return v+1;});
}

const[statsSessions,setStatsSessions]=useState([]);
const totalTime=useMemo(()=>{if(!statsSessions||statsSessions.length===0)return 0;return statsSessions.reduce(function(sum,s){return sum+getSessionSeconds(s);},0);},[statsSessions]);
const[statsSettings,setStatsSettings]=useState({dailyGoal:null,weeklyGoal:null,monthlyGoal:null,targetDate:null,dayEndHour:0,stitchingSpeedOverride:null,inactivityPauseSec:90,useActiveDays:true});
const[statsView,setStatsView]=useState(false);
const[statsTab,setStatsTab]=useState('all');
const[trackerPreviewOpen,setTrackerPreviewOpen]=useState(false);
const[trackerPreviewLevel,setTrackerPreviewLevel]=useState(2);
const[celebration,setCelebration]=useState(null);
const celebratedRef=useRef(new Set());
const goalCelebrationRef=useRef({daily:false,weekly:false,monthly:false});
const currentAutoSessionRef=useRef(null);
const pendingColoursRef=useRef(new Set());
const pendingMilestonesRef=useRef([]);
const lastStitchActivityRef=useRef(null);
const autoIdleTimerRef=useRef(null);
const prevAutoCountRef=useRef({done:0,halfDone:0});
const justLoadedRef=useRef(false);
const justLoadedSettlePassRef=useRef(0);
const autoStatsRef=useRef({doneCount:0,totalStitchable:0});
const finaliseAutoSessionRef=useRef(null);
// Idle threshold is now driven by the trackerIdleMinutes preference. Read
// fresh on each timer arm so a settings change applies on the next stroke
// without restarting the session. 0 disables the auto-pause entirely.
function getIdleThresholdMs(){
  try{
    var m=window.UserPrefs&&window.UserPrefs.get("trackerIdleMinutes");
    if(m===0)return Infinity; // never auto-pause
    if(typeof m==="number"&&m>0)return m*60*1000;
  }catch(_){}
  return 10*60*1000;
}
// Persistent milestones, session onboarding, session note toast
const[achievedMilestones,setAchievedMilestones]=useState([]);
const[sessionOnboardingShown,setSessionOnboardingShown]=useState(()=>{try{return !!localStorage.getItem("cs_sessionOnboardingDone");}catch(_){return false;}});
const[sessionSavedToast,setSessionSavedToast]=useState(null);
const isUnloadingRef=useRef(false);
// Highlight mode intro hint (Option 4)
const[hlIntroSeen,setHlIntroSeen]=useState(()=>{try{return !!localStorage.getItem("cs_hlIntroSeen");}catch(_){return false;}});
const[hlIntroBannerVisible,setHlIntroBannerVisible]=useState(false);
const hlIntroTimerRef=useRef(null);

// Variables for auto-session visibility auto-pause
const [liveAutoElapsed, setLiveAutoElapsed] = useState(0);
const [liveAutoStitches, setLiveAutoStitches] = useState(0);
const [liveAutoIsPaused, setLiveAutoIsPaused] = useState(false);
const autoSessionDisplayTimerRef = useRef(null);
const documentHiddenRef = useRef(false);
const lastPauseTimeRef = useRef(null);

// Manual pause/resume
const [manuallyPaused, setManuallyPaused] = useState(false);
const manualPauseTimeRef = useRef(null);
const manuallyPausedRef = useRef(false);

// Inactivity auto-pause
const inactivityTimerRef = useRef(null);
const inactivityPausedRef = useRef(false);
const inactivityPauseTimeRef = useRef(null);

const[stitchMode,setStitchMode]=useState("track");
const[stitchView,setStitchView]=useState(()=>{try{var v=window.UserPrefs&&window.UserPrefs.get("trackerDefaultView");return (v==="symbol"||v==="colour"||v==="highlight")?v:"symbol";}catch(_){return "symbol";}});
// R11: Row-by-row navigation mode — session-local, not persisted.
const[rowModeActive,setRowModeActive]=useState(false);
const[currentRow,setCurrentRow]=useState(0);
// Persist sticky "default view" so the choice survives reloads (mirrors
// the highlight-mode behaviour) — the prefs UI reads/writes the same key.
useEffect(()=>{try{if(window.UserPrefs)window.UserPrefs.set("trackerDefaultView",stitchView);}catch(_){}},[stitchView]);
const[stitchZoom,setStitchZoom]=useState(1);
useEffect(()=>{stitchZoomRef.current=stitchZoom;},[stitchZoom]);
const[isEditMode,setIsEditMode]=useState(false);
const[originalPaletteState,setOriginalPaletteState]=useState(null);
// V2: single-level undo snapshot (replaces editHistory array)
const[undoSnapshot,setUndoSnapshot]=useState(null);
// V2: sparse diff of single-stitch edits/removals: Map<cellIdx, {originalId, currentId|null}>
const[singleStitchEdits,setSingleStitchEdits]=useState(new Map());
// V2: cell edit popover state
const[cellEditPopover,setCellEditPopover]=useState(null);
// V2: snapshot taken on entering Edit Mode, used by Discard
const[sessionStartSnapshot,setSessionStartSnapshot]=useState(null);
const[editModalColor,setEditModalColor]=useState(null);
const[showExitEditModal,setShowExitEditModal]=useState(false);
const[drawer,setDrawer]=useState(false);
const[focusColour,setFocusColour]=useState(null);
const[showNavHelp,setShowNavHelp]=useState(false);
const[highlightSkipDone,setHighlightSkipDone]=useState(()=>{try{var v=window.UserPrefs&&window.UserPrefs.get("trackerHighlightSkipDone");return v!==false;}catch(_){return true;}});
const[onlyStarted,setOnlyStarted]=useState(()=>{try{return !!(window.UserPrefs&&window.UserPrefs.get("trackerOnlyStarted"));}catch(_){return false;}});
useEffect(()=>{try{if(window.UserPrefs)window.UserPrefs.set("trackerHighlightSkipDone",highlightSkipDone);}catch(_){}},[highlightSkipDone]);
useEffect(()=>{try{if(window.UserPrefs)window.UserPrefs.set("trackerOnlyStarted",onlyStarted);}catch(_){}},[onlyStarted]);
const[trackerDimLevel,setTrackerDimLevel]=useState(()=>{
  try{var pv=window.UserPrefs&&window.UserPrefs.get("trackerDimLevel");if(typeof pv==="number"&&pv>=0&&pv<=1)return pv;}catch(_){}
  try{return parseFloat(localStorage.getItem("cs_trDimLv")||"0.1");}catch(_){return 0.1;}
});
useEffect(()=>{try{localStorage.setItem("cs_trDimLv",String(trackerDimLevel));}catch(_){}try{if(window.UserPrefs)window.UserPrefs.set("trackerDimLevel",trackerDimLevel);}catch(_){}},[trackerDimLevel]);
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
useEffect(()=>{manuallyPausedRef.current=manuallyPaused;},[manuallyPaused]);
const[advanceToast,setAdvanceToast]=useState(null);
const[parkMarkers,setParkMarkers]=useState([]);
// Multi-colour parking — Option C: per-colour visibility map.
// Keys are DMC IDs (or blend IDs). Missing key = visible (default true).
// Persisted per project alongside layerVis (cs_parkLayers_<projectId>).
const[parkLayers,setParkLayers]=useState({});
// Convenience: a marker is visible iff parkLayers[colourId] !== false.
function isParkLayerVisible(cid){return parkLayers[cid]!==false;}
// ── Stitching Style & Spatial Focus Area ──
const[stitchingStyle,setStitchingStyle]=useState(()=>{try{var ls=localStorage.getItem("cs_stitchStyle");if(ls)return ls;var p=window.UserPrefs&&window.UserPrefs.get("trackerStitchingStyle");return p||"block";}catch(_){return"block";}});
const[blockW,setBlockW]=useState(()=>{try{var ls=localStorage.getItem("cs_blockW");if(ls)return Math.max(5,Math.min(100,parseInt(ls)));var bs=(window.UserPrefs&&window.UserPrefs.get("trackerBlockShape"))||"10x10";var w=parseInt(String(bs).split("x")[0],10);return isFinite(w)?Math.max(5,Math.min(100,w)):10;}catch(_){return 10;}});
const[blockH,setBlockH]=useState(()=>{try{var ls=localStorage.getItem("cs_blockH");if(ls)return Math.max(5,Math.min(100,parseInt(ls)));var bs=(window.UserPrefs&&window.UserPrefs.get("trackerBlockShape"))||"10x10";var hh=parseInt(String(bs).split("x")[1],10);return isFinite(hh)?Math.max(5,Math.min(100,hh)):10;}catch(_){return 10;}});
const[focusBlock,setFocusBlock]=useState(null); // {bx,by} | null
const[focusEnabled,setFocusEnabled]=useState(()=>{try{return localStorage.getItem("cs_focusEnabled")==="1";}catch(_){return false;}});
const[colourSequence,setColourSequence]=useState(()=>{try{return localStorage.getItem("cs_colourSeq")||"fewest";}catch(_){return"fewest";}});
const[startCorner,setStartCorner]=useState(()=>{try{var ls=localStorage.getItem("cs_startCorner");if(ls)return ls;var p=window.UserPrefs&&window.UserPrefs.get("trackerStartCorner");return p||"TL";}catch(_){return"TL";}});
// Gate the style picker on the generic Welcome wizard so they appear
// sequentially: Welcome first, style picker after dismissal. If the user has
// already seen the Welcome wizard (or never needed it on this build), the
// style picker shows immediately as before.
const[styleOnboardingOpen,setStyleOnboardingOpen]=useState(()=>{try{
  if(localStorage.getItem("cs_styleOnboardingDone")||localStorage.getItem("cs_stitchStyle"))return false;
  if(window.WelcomeWizard&&window.WelcomeWizard.shouldShow("tracker"))return false; // wait for welcome
  return true;
}catch(_){return false;}});
const[breadcrumbs,setBreadcrumbs]=useState([]);
const[breadcrumbVisible,setBreadcrumbVisible]=useState(()=>{try{return localStorage.getItem("cs_bcVisible")!=="0";}catch(_){return true;}});
useEffect(()=>{try{localStorage.setItem("cs_stitchStyle",stitchingStyle);}catch(_){}},[stitchingStyle]);
useEffect(()=>{try{localStorage.setItem("cs_blockW",String(blockW));}catch(_){}},[blockW]);
useEffect(()=>{try{localStorage.setItem("cs_blockH",String(blockH));}catch(_){}},[blockH]);
useEffect(()=>{try{localStorage.setItem("cs_focusEnabled",focusEnabled?"1":"0");}catch(_){}},[focusEnabled]);
useEffect(()=>{try{localStorage.setItem("cs_colourSeq",colourSequence);}catch(_){}},[colourSequence]);
useEffect(()=>{try{localStorage.setItem("cs_startCorner",startCorner);}catch(_){}},[startCorner]);
useEffect(()=>{try{localStorage.setItem("cs_bcVisible",breadcrumbVisible?"1":"0");}catch(_){}},[breadcrumbVisible]);
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
const[blockAdvanceToast,setBlockAdvanceToast]=useState(null);
const prevFocusBlockDoneRef=useRef(false);
const blockAdvanceTimerRef=useRef(null);
// ── Explicit session mode ──
const[explicitSession,setExplicitSession]=useState(null);
const[sessionConfigOpen,setSessionConfigOpen]=useState(false);
const[sessionTimeChoice,setSessionTimeChoice]=useState(null);
const[sessionGoalInput,setSessionGoalInput]=useState("");
const[sessionSummaryData,setSessionSummaryData]=useState(null);
// A3 (UX Phase 5) — Resume recap modal shown once per project load when the
// project already has stitching sessions. Cleared via Continue/Stats/Switch/Close.
const[resumeRecap,setResumeRecap]=useState(null);
const resumeRecapShownRef=useRef(new Set());
const focusOverlayCanvasRef=useRef(null);
const breadcrumbCanvasRef=useRef(null);
const[hlRow,setHlRow]=useState(-1);
const[hlCol,setHlCol]=useState(-1);
const dragStateRef=useRef({isDragging:false, dragVal:1});
const dragChangesRef=useRef([]);
const scrollRafRef=useRef(null);
const lastClickedRef=useRef(null); // { idx, row, col, val } for shift+click range
// C3: range-select state lives inside useDragMark (long-press anchor + shift+click).

const[selectedColorId,setSelectedColorId]=useState(null);

// ═══ Half-stitch state ═══
// Sparse map: cellIdx → { fwd?: {id,rgb,lab,name,type,symbol}, bck?: {id,rgb,lab,name,type,symbol} }
const[halfStitches,setHalfStitches]=useState(new Map());
// Sparse map: cellIdx → { fwd?: 0|1, bck?: 0|1 }
const[halfDone,setHalfDone]=useState(new Map());
const[halfDisambig,setHalfDisambig]=useState(null); // {x, y, idx} for popup

const[hoverInfo,setHoverInfo]=useState(null);
const hoverRefs = useRef({ row: null, col: null });
const hoverCellRef = useRef(null);
const [hoverInfoCell, setHoverInfoCell] = useState(null);

const[isPanning,setIsPanning]=useState(false);
const panStart=useRef({x:0,y:0,scrollX:0,scrollY:0});
const stitchScrollRef=useRef(null);
const isSpaceDownRef=useRef(false);
const spaceDownTimeRef=useRef(0);
const spacePannedRef=useRef(false);
const touchStateRef=useRef({mode:"none",startX:0,startY:0,pinchDist:0,tapIdx:-1,tapVal:0,pinchAnchorCanvas:null,pinchAnchorScreen:null});
const stitchZoomRef=useRef(1);
const hasTouchRef=useRef(typeof window!=="undefined"&&"ontouchstart" in window);
// Stable handler refs — point to latest function each render; listeners attach once
const touchStartHandlerRef=useRef(null);
const touchMoveHandlerRef=useRef(null);
const touchEndHandlerRef=useRef(null);
const wheelHandlerRef=useRef(null);
// rAF token for throttling zoom state updates to one per animation frame
const zoomRafRef=useRef(null);

const[threadOwned,setThreadOwned]=useState({});
const[globalStash,setGlobalStash]=useState({});
const[kittingResult,setKittingResult]=useState(null);
const[stashDeducted,setStashDeducted]=useState(false);
const[altOpen,setAltOpen]=useState(null);

// ═══ Spatial Analysis Engine ═══
const[analysisResult,setAnalysisResult]=useState(null);
const[analysisRunning,setAnalysisRunning]=useState(false);
const analysisWorkerRef=useRef(null);
const analysisRequestIdRef=useRef(0);
const analysisThrottleRef=useRef(null);
// Thread usage visualisation: null | "distance" | "cluster"
const[threadUsageMode,setThreadUsageMode]=useState(null);
const threadUsageCanvasRef=useRef(null);
const threadUsageRafRef=useRef(null);
// Next-stitch recommendations
const[recDismissed,setRecDismissed]=useState(()=>new Set());
const[recShowMore,setRecShowMore]=useState(false);
const[recEnabled,setRecEnabled]=useState(()=>{try{return localStorage.getItem("cs_recEnabled")!=="0";}catch(_){return true;}});
const[rpanelTab,setRpanelTab]=useState("colours");
const[mobileDrawerOpen,setMobileDrawerOpen]=useState(false);

// ─── Tracker left sidebar (toolbar-rework phase 1) ─────────────────────
// Replaces the scattered Highlight / View / Session controls in the
// toolbar pill and right-panel "More" tab with a tabbed left sidebar.
// State persists via window.UserPrefs (key: trackerLeftSidebarMode,
// values: "hidden" | "rail" | "open"). Default hidden on touch
// viewports, open elsewhere. The hamburger cycles hidden→rail→open.
// `leftSidebarOpen` (Boolean) is kept as a derived alias for the
// existing render code that already reads it.
const[leftSidebarMode,setLeftSidebarMode]=useState(()=>{
  try{
    // Use localStorage directly so we can distinguish "key never set" from
    // "key set to the default value".  UserPrefs.get() always returns the
    // DEFAULTS fallback and can't detect a true first run.
    var raw=localStorage.getItem("cs_pref_trackerLeftSidebarMode");
    if(raw!==null){
      try{
        var stored=JSON.parse(raw);
        if(stored==="hidden"||stored==="rail"||stored==="open")return stored;
      }catch(_){}
    }
    // Migrate the legacy boolean preference (a corrupt new key falls through here).
    var legacyRaw=localStorage.getItem("cs_pref_trackerLeftSidebarOpen");
    if(legacyRaw!==null){
      try{
        var legacy=JSON.parse(legacyRaw);
        if(legacy===true)return "open";
        if(legacy===false)return "hidden";
      }catch(_){}
    }
    // First run — default by viewport type.
    if(window.TouchConstants&&window.TouchConstants.isCompactTouch())return "hidden";
    return "open";
  }catch(_){return "hidden";}
});
const leftSidebarOpen = leftSidebarMode === "open" || leftSidebarMode === "rail";
const setLeftSidebarOpen = useCallback((next)=>{
  setLeftSidebarMode(prev=>{
    var want = typeof next==="function" ? next(prev==="open"||prev==="rail") : !!next;
    if(want) return prev==="hidden" ? "open" : prev;
    return "hidden";
  });
},[]);
const cycleLeftSidebar = useCallback(()=>{
  setLeftSidebarMode(prev=>prev==="hidden"?"rail":prev==="rail"?"open":"hidden");
},[]);
const[leftSidebarTab,setLeftSidebarTab]=useState(()=>{
  try{var p=window.UserPrefs&&window.UserPrefs.get("trackerLeftSidebarTab");return p||"highlight";}catch(_){return"highlight";}
});
useEffect(()=>{try{window.UserPrefs&&window.UserPrefs.set("trackerLeftSidebarMode",leftSidebarMode);}catch(_){}},[leftSidebarMode]);
useEffect(()=>{try{window.UserPrefs&&window.UserPrefs.set("trackerLeftSidebarTab",leftSidebarTab);}catch(_){}},[leftSidebarTab]);

// Phase 4: palette-legend sort key persisted via UserPrefs (global default)
// AND per-project (cs_legendSort_<pid>) overlay. Per-project takes
// precedence when present — set in processLoadedProject. Writes go to
// both so the next new project picks up the user's last preference.
const[legendSort,setLegendSort]=useState(()=>{
  try{var p=window.UserPrefs&&window.UserPrefs.get("trackerLegendSort");return p||"id";}catch(_){return"id";}
});
useEffect(()=>{
  try{window.UserPrefs&&window.UserPrefs.set("trackerLegendSort",legendSort);}catch(_){}
  try{const pid=projectIdRef.current;if(pid)localStorage.setItem('cs_legendSort_'+pid,legendSort);}catch(_){}
},[legendSort]);

// Issue #6 — desktop palette legend collapsible. Persists via UserPrefs
// (global default) AND per-project (cs_legendCollapsed_<pid>) overlay.
const[legendCollapsed,setLegendCollapsed]=useState(()=>{
  try{var p=window.UserPrefs&&window.UserPrefs.get("trackerLegendCollapsed");return !!p;}catch(_){return false;}
});
useEffect(()=>{
  try{window.UserPrefs&&window.UserPrefs.set("trackerLegendCollapsed",!!legendCollapsed);}catch(_){}
  try{const pid=projectIdRef.current;if(pid)localStorage.setItem('cs_legendCollapsed_'+pid,legendCollapsed?'1':'0');}catch(_){}
},[legendCollapsed]);

// Phase 5: ESC closes the mobile lpanel drawer. Desktop ignores it
// (the panel is sticky / persistent and ESC could clobber other modal
// dismiss semantics).
useEffect(()=>{
  if(!leftSidebarOpen)return;
  const onKey=e=>{
    if(e.key!=="Escape")return;
    if(typeof window==='undefined'||!window.matchMedia)return;
    if(!window.matchMedia("(max-width: 899px)").matches)return;
    setLeftSidebarOpen(false);
  };
  window.addEventListener("keydown",onKey);
  return()=>window.removeEventListener("keydown",onKey);
},[leftSidebarOpen]);

// Touch-1 H-2: Focus mode. Strips chrome to canvas + a floating
// mini-bar (.cs-focus-bar). Toggled with the F key (when no input is
// focused) or via the toolbar button. body.cs-focus is what styles.css
// hooks into to hide chrome surfaces.
const[focusMode,setFocusMode]=useState(false);
const focusBarRef=useRef(null);
const[focusBarFaded,setFocusBarFaded]=useState(false);
const focusFadeTimerRef=useRef(null);
const resetFocusFade=useCallback(()=>{
  setFocusBarFaded(false);
  if(focusFadeTimerRef.current)clearTimeout(focusFadeTimerRef.current);
  const ms=(window.TouchConstants&&window.TouchConstants.FOCUS_MINIBAR_FADE_MS)||4000;
  focusFadeTimerRef.current=setTimeout(()=>setFocusBarFaded(true),ms);
},[]);
useEffect(()=>{
  if(typeof document==="undefined")return;
  if(focusMode){
    document.body.classList.add("cs-focus");
    resetFocusFade();
  }else{
    document.body.classList.remove("cs-focus");
    setFocusBarFaded(false);
    if(focusFadeTimerRef.current)clearTimeout(focusFadeTimerRef.current);
  }
  return()=>{document.body.classList.remove("cs-focus");if(focusFadeTimerRef.current)clearTimeout(focusFadeTimerRef.current);};
},[focusMode,resetFocusFade]);
useEffect(()=>{
  const onKey=e=>{
    // Ignore when typing in inputs / contenteditable.
    const t=e.target;
    if(t&&(t.tagName==="INPUT"||t.tagName==="TEXTAREA"||t.tagName==="SELECT"||t.isContentEditable))return;
    if(e.metaKey||e.ctrlKey||e.altKey)return;
    if(e.key==="f"||e.key==="F"){
      e.preventDefault();
      setFocusMode(v=>!v);
    }else if(e.key==="Escape"&&focusMode){
      e.preventDefault();
      setFocusMode(false);
    }
  };
  window.addEventListener("keydown",onKey);
  return()=>window.removeEventListener("keydown",onKey);
},[focusMode]);

const [importDialog, setImportDialog] = useState(null);
const [importImage, setImportImage] = useState(null);
const [importSuccess, setImportSuccess] = useState(null);
const [importMaxW, setImportMaxW] = useState(80);
const [importMaxH, setImportMaxH] = useState(80);
const [importMaxColours, setImportMaxColours] = useState(30);
const [importSkipBg, setImportSkipBg] = useState(false);
const [importBgThreshold, setImportBgThreshold] = useState(15);
const [importArLock, setImportArLock] = useState(true);
const [importName, setImportName] = useState("");
const [importFabricCt, setImportFabricCt] = useState(14);

const loadRef=useRef(null),timerRef=useRef(null),stitchRef=useRef(null);
const projectIdRef=useRef(null);    // current project's storage ID
const createdAtRef=useRef(null);    // stable createdAt ISO string for the active project
const lastSnapshotRef=useRef(null); // freshest serialised project for beforeunload
const v3FieldsRef=useRef({});       // preserve v3 stats fields across save round-trips
const[projectName,setProjectName]=useState("");
const[projectDesigner,setProjectDesigner]=useState("");
const[projectDescription,setProjectDescription]=useState("");
const[namePromptOpen,setNamePromptOpen]=useState(false);
const[editDetailsOpen,setEditDetailsOpen]=useState(false);
// Command Palette → Preferences modal bridge (UX-12 Phase 6 PR #11).
useEffect(()=>{const h=()=>{if(typeof window.PreferencesModal!=='undefined')setPreferencesOpen(true);};window.addEventListener('cs:openPreferences',h);return()=>window.removeEventListener('cs:openPreferences',h);},[]);
// Command Palette → Rename current project bridge (UX-12 Phase 6 PR #11).
useEffect(()=>{const h=()=>setEditDetailsOpen(true);window.addEventListener('cs:openRename',h);return()=>window.removeEventListener('cs:openRename',h);},[]);
const G=28;
const[tOverflowOpen,setTOverflowOpen]=useState(false);
const[tStripCollapsed,setTStripCollapsed]=useState({view:false,stitch:false});
const STITCH_LAYERS=[{id:'full',label:'Full Cross',key:'F'},{id:'half',label:'Half Stitch',key:'H'},{id:'backstitch',label:'Backstitch',key:'B'},{id:'quarter',label:'Quarter',key:null},{id:'petite',label:'Petite',key:null},{id:'french_knot',label:'French Knot',key:'K'},{id:'long_stitch',label:'Long Stitch',key:null}];
const ALL_LAYERS_VISIBLE={full:true,half:true,backstitch:true,quarter:true,petite:true,french_knot:true,long_stitch:true};
const[layerVis,setLayerVis]=useState(ALL_LAYERS_VISIBLE);
const[soloPreState,setSoloPreState]=useState(null);
const[bsThickness,setBsThickness]=useState(()=>{try{return parseInt(localStorage.getItem('cs_bsThickness')||'2');}catch(_){return 2;}});
const[statsCountMode,setStatsCountMode]=useState('visible');
const tStripRef=useRef(null);
const tOverflowRef=useRef(null);
const soloTimerRef=useRef(null);

const doneCount=countsVer>=0?doneCountRef.current:0;
const totalStitchable=useMemo(()=>{if(!pat)return 0;let c=0;for(let i=0;i<pat.length;i++){const id=pat[i].id;if(id!=="__skip__"&&id!=="__empty__")c++;}return c;},[pat]);

// Half-stitch counts
const halfStitchCounts=useMemo(()=>{
  let total=0,dn=0;
  halfStitches.forEach((hs,idx)=>{
    if(hs.fwd)total++;
    if(hs.bck)total++;
  });
  halfDone.forEach((hd)=>{
    if(hd.fwd)dn++;
    if(hd.bck)dn++;
  });
  return{total,done:dn};
},[halfStitches,halfDone]);

// Combined progress: full stitches + half stitches weighted at 0.5
const combinedTotal=totalStitchable+halfStitchCounts.total*0.5;
const combinedDone=doneCount+halfStitchCounts.done*0.5;
// Effective progress respects visible-layer filter
const effectiveCombinedTotal=statsCountMode==='visible'?(layerVis.full?totalStitchable:0)+(layerVis.half?halfStitchCounts.total*0.5:0):combinedTotal;
const effectiveCombinedDone=statsCountMode==='visible'?(layerVis.full?doneCount:0)+(layerVis.half?halfStitchCounts.done*0.5:0):combinedDone;
const progressPct=effectiveCombinedTotal>0?Math.round(effectiveCombinedDone/effectiveCombinedTotal*1000)/10:0;
// Today's stitches for progress bar accent segment
const todayStitchesForBar=useMemo(()=>{if(!statsSessions)return 0;const deh=(statsSettings&&statsSettings.dayEndHour)||0;return getStatsTodayStitches(statsSessions,deh)+liveAutoStitches;},[statsSessions,liveAutoStitches,statsSettings]);
// Multi-colour parking — per-colour count for the legend "park" pip.
const parkCountsByColour=useMemo(()=>{
  const out={};
  if(!parkMarkers||!parkMarkers.length)return out;
  for(let i=0;i<parkMarkers.length;i++){
    const id=parkMarkers[i].colorId;
    if(id)out[id]=(out[id]||0)+1;
  }
  return out;
},[parkMarkers]);
const totalParkedColours=useMemo(()=>Object.keys(parkCountsByColour).length,[parkCountsByColour]);
const allParkLayersHidden=useMemo(()=>{
  if(totalParkedColours===0)return false;
  for(const id in parkCountsByColour){if(parkLayers[id]!==false)return false;}
  return true;
},[parkCountsByColour,parkLayers,totalParkedColours]);
function toggleParkLayer(cid){setParkLayers(prev=>{const next=Object.assign({},prev);next[cid]=!(next[cid]!==false);if(next[cid])delete next[cid];return next;});}
function setAllParkLayersVisible(visible){
  setParkLayers(prev=>{
    if(visible)return{};
    const next=Object.assign({},prev);
    for(const id in parkCountsByColour)next[id]=false;
    return next;
  });
}
const weekStitchesForChip=useMemo(()=>{if(!statsSessions)return 0;const deh=(statsSettings&&statsSettings.dayEndHour)||0;return getStatsThisWeekStitches(statsSessions,deh)+liveAutoStitches;},[statsSessions,liveAutoStitches,statsSettings]);
const todayBarPct=effectiveCombinedTotal>0?Math.min((todayStitchesForBar/effectiveCombinedTotal)*100,Math.min(progressPct,100)):0;
const prevBarPct=Math.max(0,Math.min(progressPct,100)-todayBarPct);
// Plan B Phase 1: Progress info chip + AppInfoPopover state.
const [progressInfoOpen,setProgressInfoOpen]=useState(false);
const progressChipRef=useRef(null);

const colourDoneCounts=countsVer>=0?colourDoneCountsRef.current:{};
const layerCounts=useMemo(()=>({full:totalStitchable,half:halfStitchCounts.total,backstitch:bsLines.length,quarter:0,petite:0,french_knot:0,long_stitch:0}),[totalStitchable,halfStitchCounts.total,bsLines.length]);
// Full recompute only on structural changes (pattern load, half-stitch structure edits)
useEffect(()=>{recomputeAllCounts(pat,done,halfStitches,halfDone);},[pat,halfStitches]);
useEffect(()=>{const pid=projectIdRef.current;if(!pid)return;try{localStorage.setItem('cs_layerVis_'+pid,JSON.stringify(layerVis));}catch(_){}},[layerVis]);
useEffect(()=>{const pid=projectIdRef.current;if(!pid)return;try{localStorage.setItem('cs_parkLayers_'+pid,JSON.stringify(parkLayers));}catch(_){}},[parkLayers]);
useEffect(()=>{try{localStorage.setItem('cs_bsThickness',String(bsThickness));}catch(_){}},[bsThickness]);
// ── Zoom-adaptive detail level ──
const[lockDetailLevel,setLockDetailLevel]=useState(()=>{try{return !!JSON.parse(localStorage.getItem('cs_lockDetail')||'false');}catch(e){console.warn('cs_lockDetail corrupted, resetting:',e);try{localStorage.removeItem('cs_lockDetail');}catch(_){}return false;}});
useEffect(()=>{try{localStorage.setItem('cs_lockDetail',String(lockDetailLevel));}catch(_){}},[lockDetailLevel]);
// Tier 1 (zoomed-out) fade strength for un-stitched cells. 0 = off (full colour),
// 0.15 = subtle, 0.55 = strong (legacy behaviour). Default 0 keeps the colour
// view at full saturation when zoomed out.
const[lowZoomFade,setLowZoomFade]=useState(()=>{try{const v=parseFloat(localStorage.getItem('cs_lowZoomFade')||'0');return Number.isFinite(v)?Math.max(0,Math.min(0.9,v)):0;}catch(_){return 0;}});
useEffect(()=>{try{localStorage.setItem('cs_lowZoomFade',String(lowZoomFade));}catch(_){}},[lowZoomFade]);
// tierRef: current render tier (1–4) with hysteresis; default zoom=1→scs=20→Tier 3
const tierRef=useRef(3);
const tierFadeRef=useRef({symbolOpacity:1.0,bsHsOpacity:1.0,animRafId:null});
const renderStitchRef=useRef(null);

const focusableColors=useMemo(()=>{
  if(!pal)return[];
  let list=pal;
  if(onlyStarted){const started=pal.filter(p=>{const dc=colourDoneCounts[p.id];return dc&&dc.done>0;});if(started.length>0)list=started;}
  if(!highlightSkipDone)return list;
  const incomplete=list.filter(p=>{const dc=colourDoneCounts[p.id];return !dc||dc.done<dc.total;});
  return incomplete.length>0?incomplete:list;
},[pal,countsVer,highlightSkipDone,onlyStarted]);

const sections=useMemo(()=>{
  if(!statsView||!pat||!done)return[];
  const secCols=(statsSettings&&statsSettings.sectionCols)||50;
  const secRows=(statsSettings&&statsSettings.sectionRows)||50;
  const numX=Math.ceil(sW/secCols);const numY=Math.ceil(sH/secRows);
  const result=[];
  for(let sy=0;sy<numY;sy++){for(let sx=0;sx<numX;sx++){
    const x0=sx*secCols,y0=sy*secRows;
    const x1=Math.min(x0+secCols,sW),y1=Math.min(y0+secRows,sH);
    let total=0,completed=0;
    for(let y=y0;y<y1;y++){for(let x=x0;x<x1;x++){const idx=y*sW+x;const m=pat[idx];if(m&&m.id!=='__skip__'&&m.id!=='__empty__'){total++;if(done[idx])completed++;}}}
    result.push({label:String(sy*numX+sx+1),sx,sy,x0,y0,x1,y1,total,completed,pct:total>0?Math.round(completed/total*100):100,isDone:total>0&&completed>=total});
  }}
  return result;
},[statsView,pat,done,sW,sH,statsSettings.sectionCols,statsSettings.sectionRows]);

const prevFocusIdRef=useRef(null);
const prevFocusDoneRef=useRef(null);
useEffect(()=>{
  if(!focusColour||stitchView!=="highlight"||!highlightSkipDone||!colourDoneCounts||!pal)return;
  const dc=colourDoneCounts[focusColour];
  const isNowComplete=dc&&dc.total>0&&dc.done>=dc.total;
  if(prevFocusIdRef.current!==focusColour){
    prevFocusIdRef.current=focusColour;
    prevFocusDoneRef.current=isNowComplete;
    return;
  }
  if(prevFocusDoneRef.current===false&&isNowComplete){
    const nextColor=pal.find(p=>{
      if(p.id===focusColour)return false;
      const dc2=colourDoneCounts[p.id];
      return !dc2||dc2.done<dc2.total;
    });
    if(nextColor){
      setFocusColour(nextColor.id);
      const label=nextColor.type==="blend"?(nextColor.threads[0].name+"+"+nextColor.threads[1].name):nextColor.name;
      setAdvanceToast(`DMC ${nextColor.id} — ${label}`);
      setTimeout(()=>setAdvanceToast(null),2500);
      return;
    }
  }
  prevFocusDoneRef.current=isNowComplete;
},[countsVer,focusColour,stitchView,highlightSkipDone,pal]);

const estCompletion=useMemo(()=>{let t=totalTime+liveAutoElapsed;if(doneCount<1||t<60)return null;return Math.round((totalStitchable-doneCount)*(t/doneCount));},[totalTime,liveAutoElapsed,doneCount,totalStitchable]);
const scs=useMemo(()=>Math.max(2,Math.round(20*stitchZoom)),[stitchZoom]);
const fitSZ=useCallback(()=>setStitchZoom(Math.min(3,Math.max(0.05,750/(sW*20)))),[sW]);

const skeinData=useMemo(()=>{
  if(!pal)return[];
  let map={};
  pal.forEach(p=>{
    if(p.type==="solid"){map[p.id]=(map[p.id]||0)+p.count;}
    else if(p.type==="blend"&&p.threads){p.threads.forEach(t=>{map[t.id]=(map[t.id]||0)+p.count;});}
  });
  return Object.entries(map).sort((a,b)=>{let na=parseInt(a[0])||0,nb=parseInt(b[0])||0;if(na&&nb)return na-nb;return a[0].localeCompare(b[0]);}).map(([id,ct])=>{let t=findThreadInCatalog('dmc',id);return{id,name:t?t.name:"",rgb:t?t.rgb:[128,128,128],stitches:ct,skeins:skeinEst(ct,fabricCt)};});
},[pal,fabricCt]);

useEffect(()=>{
  function loadStash(){if(typeof StashBridge!=="undefined"){StashBridge.getGlobalStash().then(setGlobalStash).catch(e=>console.warn('getGlobalStash failed:',e));}}
  loadStash();
  window.addEventListener('cs:stashChanged',loadStash);
  return ()=>{window.removeEventListener('cs:stashChanged',loadStash);};
},[]);

// Detect project completion and offer stash deduction
useEffect(()=>{
  if(progressPct>=100 && !stashDeducted && combinedTotal>0 && typeof StashBridge!=="undefined"){
    setModal("deduct_prompt");
  }
},[progressPct]);

const totalSkeins=useMemo(()=>skeinData.reduce((s,d)=>s+d.skeins,0),[skeinData]);
const blendCount=useMemo(()=>pal?pal.filter(p=>p.type==="blend").length:0,[pal]);
const difficulty=useMemo(()=>pal?calcDifficulty(pal.length,blendCount,totalStitchable):null,[pal,blendCount,totalStitchable]);


// ═══ Auto-session recording ═══
function getStitchingDateLocal(now){
  try{
    const d=new Date(now);
    const deh=(statsSettings&&statsSettings.dayEndHour)||0;
    if(deh>0&&d.getHours()<deh)d.setDate(d.getDate()-1);
    const y=d.getFullYear(),m=('0'+(d.getMonth()+1)).slice(-2),day=('0'+d.getDate()).slice(-2);
    return y+'-'+m+'-'+day;
  }catch(e){const d=new Date();return d.getFullYear()+'-'+('0'+(d.getMonth()+1)).slice(-2)+'-'+('0'+d.getDate()).slice(-2);}
}
function recordAutoActivity(completed,undone){
  try{
    const now=new Date();
    lastStitchActivityRef.current=now;
    if(!currentAutoSessionRef.current){
      currentAutoSessionRef.current={
        id:'sess_'+Date.now(),
        date:getStitchingDateLocal(now),
        startTime:now.toISOString(),
        stitchesCompleted:0,
        stitchesUndone:0,
        coloursWorked:new Set(),
        totalPausedMs:0
      };
      setLiveAutoStitches(0);
      setLiveAutoElapsed(0);
      setLiveAutoIsPaused(document.hidden);
    }
    // Auto-resume manual pause on stitch activity
    if(manuallyPausedRef.current&&manualPauseTimeRef.current){
      currentAutoSessionRef.current.totalPausedMs=(currentAutoSessionRef.current.totalPausedMs||0)+(Date.now()-manualPauseTimeRef.current);
      manualPauseTimeRef.current=null;
      setManuallyPaused(false);
    }
    // Auto-resume inactivity pause on stitch activity
    if(inactivityPausedRef.current&&inactivityPauseTimeRef.current){
      currentAutoSessionRef.current.totalPausedMs=(currentAutoSessionRef.current.totalPausedMs||0)+(Date.now()-inactivityPauseTimeRef.current);
      inactivityPausedRef.current=false;
      inactivityPauseTimeRef.current=null;
      setLiveAutoIsPaused(document.hidden);
    }
    currentAutoSessionRef.current.stitchesCompleted+=completed;
    currentAutoSessionRef.current.stitchesUndone+=undone;
    setLiveAutoStitches(currentAutoSessionRef.current.stitchesCompleted);
    // Merge any pending colour IDs into the session
    if(pendingColoursRef.current.size>0){
      pendingColoursRef.current.forEach(c=>currentAutoSessionRef.current.coloursWorked.add(c));
      pendingColoursRef.current.clear();
    }
    clearTimeout(autoIdleTimerRef.current);
    var idleMs=getIdleThresholdMs();
    if(isFinite(idleMs)){
      autoIdleTimerRef.current=setTimeout(()=>{try{if(finaliseAutoSessionRef.current)finaliseAutoSessionRef.current();}catch(e){}},idleMs);
    }
    // Reset inactivity pause timer (only if not manually paused)
    clearTimeout(inactivityTimerRef.current);
    const inactThresh=(statsSettings.inactivityPauseSec||0)*1000;
    if(inactThresh>0&&!manuallyPausedRef.current){
      inactivityTimerRef.current=setTimeout(()=>{
        if(currentAutoSessionRef.current&&!manuallyPausedRef.current){
          inactivityPausedRef.current=true;
          inactivityPauseTimeRef.current=Date.now();
          setLiveAutoIsPaused(true);
        }
      },inactThresh);
    }
  }catch(e){}
}
function finaliseAutoSession(){
  try{
    const session=currentAutoSessionRef.current;
    if(!session||session.stitchesCompleted+session.stitchesUndone===0){
      currentAutoSessionRef.current=null;
      return;
    }
    // Close out any open pause before computing duration
    const nowMs=Date.now();
    if(manuallyPausedRef.current&&manualPauseTimeRef.current){
      session.totalPausedMs=(session.totalPausedMs||0)+(nowMs-manualPauseTimeRef.current);
      manualPauseTimeRef.current=null;
    }
    if(inactivityPausedRef.current&&inactivityPauseTimeRef.current){
      session.totalPausedMs=(session.totalPausedMs||0)+(nowMs-inactivityPauseTimeRef.current);
      inactivityPausedRef.current=false;
      inactivityPauseTimeRef.current=null;
    }
    const endTime=lastStitchActivityRef.current||new Date();
    const startTime=new Date(session.startTime);
    let activeDurationMs=endTime-startTime-(session.totalPausedMs||0);
    if(activeDurationMs<0) activeDurationMs=0;
    const ref=autoStatsRef.current||{doneCount:0,totalStitchable:0};
    const tc=ref.doneCount||0,ts=ref.totalStitchable||0;
    const finalised={
      id:session.id,
      date:session.date,
      startTime:session.startTime,
      endTime:endTime.toISOString(),
      durationSeconds:Math.max(1,Math.round(activeDurationMs/1000)),
      durationMinutes:Math.max(1,Math.round(activeDurationMs/60000)),
      stitchesCompleted:session.stitchesCompleted,
      stitchesUndone:session.stitchesUndone,
      netStitches:session.stitchesCompleted-session.stitchesUndone,
      totalAtEnd:tc,
      percentAtEnd:ts>0?Math.round((tc/ts)*1000)/10:0,
      note:'',
      coloursWorked:session.coloursWorked?[...session.coloursWorked]:[],
    };
    if(pendingMilestonesRef.current.length>0){
      finalised.milestones=pendingMilestonesRef.current.slice();
      pendingMilestonesRef.current=[];
    }
    setStatsSessions(prev=>[...(prev||[]),finalised]);
    // Update lastTouchedAt and finishStatus in v3FieldsRef.
    // stitchLog is now derived from statsSessions in buildSnapshot() — no direct mutation needed.
    if(projectIdRef.current){
      const _now=new Date();
      const _prev=v3FieldsRef.current||{};
      const _newV3=Object.assign({},_prev,{lastTouchedAt:_now.toISOString()});
      if(_prev.finishStatus==='planned'&&finalised.netStitches>0){_newV3.finishStatus='active';}
      v3FieldsRef.current=_newV3;
      autoSaveDirtyRef.current=true;
      if(typeof invalidateStatsCache==='function')invalidateStatsCache();
    }
    currentAutoSessionRef.current=null;
    clearTimeout(autoIdleTimerRef.current);
    clearTimeout(inactivityTimerRef.current);
    setManuallyPaused(false);
    setLiveAutoIsPaused(false);
    setLiveAutoElapsed(0);
    setLiveAutoStitches(0);
    // Show note prompt toast (not during page unload)
    if(!isUnloadingRef.current&&finalised.netStitches>0){
      setSessionSavedToast({sessionId:finalised.id,stitches:finalised.netStitches,durationMin:finalised.durationMinutes,showNoteInput:false,noteText:''});
    }
    return finalised;
  }catch(e){currentAutoSessionRef.current=null;return null;}
}
finaliseAutoSessionRef.current=finaliseAutoSession;

useEffect(() => {
  function handleVisibilityChange() {
    const isHidden = document.hidden;
    documentHiddenRef.current = isHidden;
    if(!manuallyPausedRef.current&&!inactivityPausedRef.current) setLiveAutoIsPaused(isHidden);

    if (isHidden) {
      if(!manuallyPausedRef.current) lastPauseTimeRef.current = Date.now();
    } else {
      if (lastPauseTimeRef.current && currentAutoSessionRef.current && !manuallyPausedRef.current) {
        const pausedMs = Date.now() - lastPauseTimeRef.current;
        currentAutoSessionRef.current.totalPausedMs = (currentAutoSessionRef.current.totalPausedMs || 0) + pausedMs;
      }
      lastPauseTimeRef.current = null;
    }
  }
  document.addEventListener('visibilitychange', handleVisibilityChange);
  return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
}, []);

useEffect(() => {
  autoSessionDisplayTimerRef.current = setInterval(() => {
    if (!currentAutoSessionRef.current) return;
    if (documentHiddenRef.current || manuallyPausedRef.current || inactivityPausedRef.current) return;
    const now = Date.now();
    const start = new Date(currentAutoSessionRef.current.startTime).getTime();
    const paused = currentAutoSessionRef.current.totalPausedMs || 0;
    const elapsedMs = Math.max(0, now - start - paused);
    setLiveAutoElapsed(Math.floor(elapsedMs / 1000));
  }, 1000);
  return () => clearInterval(autoSessionDisplayTimerRef.current);
}, []);
// Keep autoStatsRef fresh
useEffect(()=>{autoStatsRef.current={doneCount,totalStitchable};},[doneCount,totalStitchable]);
// Auto-detect stitch activity from doneCount & halfDone changes
useEffect(()=>{
  try{
    if(!pat||!done)return;
    const curDone=doneCount;
    const curHalf=(halfStitchCounts&&halfStitchCounts.done)||0;
    const prev=prevAutoCountRef.current||{done:0,halfDone:0};
    const prevDone=prev.done;
    const prevHalf=prev.halfDone;
    // Skip initial load or project load — justLoadedRef stays true until
    // both doneCount and halfStitchCounts.done have settled post-load.
    if(justLoadedRef.current||prevDone<0||prevHalf<0){
      prevAutoCountRef.current={done:curDone,halfDone:curHalf};
      if(justLoadedRef.current){
        justLoadedSettlePassRef.current=(justLoadedSettlePassRef.current||0)+1;
        if(justLoadedSettlePassRef.current>=2&&prevDone>=0&&prevHalf>=0)justLoadedRef.current=false;
      }
      return;
    }
    const doneDiff=curDone-prevDone;
    const halfDiff=curHalf-prevHalf;
    if(doneDiff!==0||halfDiff!==0){
      const completed=Math.max(0,doneDiff)+Math.max(0,halfDiff);
      const undone=Math.max(0,-doneDiff)+Math.max(0,-halfDiff);
      if(completed>0||undone>0)recordAutoActivity(completed,undone);
      // Milestone detection
      if(completed>0&&totalStitchable>0){
        const prevTotal=prevDone+prevHalf;
        const newTotal=curDone+curHalf;
        try{
          const hits=checkMilestones(prevTotal,newTotal,totalStitchable);
          if(hits&&hits.length>0){
            const best=hits[hits.length-1];
            const key=best.pct!=null?('pct_'+best.pct):best.label;
            if(!celebratedRef.current.has(key)){
              celebratedRef.current.add(key);
              setCelebration(best);
            }
            for(let h=0;h<hits.length;h++){pendingMilestonesRef.current.push(hits[h]);}
            // Record persistently (deduplicated by pct/label key)
            const now=new Date().toISOString();
            const sessionId=currentAutoSessionRef.current?currentAutoSessionRef.current.id:null;
            const newMs=hits.map(h=>({pct:h.pct,label:h.label,achievedAt:now,sessionId}));
            setAchievedMilestones(prev=>{
              const existing=new Set(prev.map(m=>m.pct!=null?('pct_'+m.pct):m.label));
              const unique=newMs.filter(m=>{const k=m.pct!=null?('pct_'+m.pct):m.label;return !existing.has(k);});
              return unique.length>0?[...prev,...unique]:prev;
            });
          }
        }catch(me){}
      }
    }
    // Auto-snapshot: on new stitching day, save a snapshot of the current done-state
    if(done){
      try{
        const today=getStitchingDateLocal(new Date());
        if(!lastSnapshotDateRef.current){
          lastSnapshotDateRef.current=today;
        } else if(lastSnapshotDateRef.current!==today){
          const snapshot={
            id:'snap_'+Date.now(),
            date:lastSnapshotDateRef.current,
            label:'auto',
            doneCount:curDone,
            data:(function(b){var C=0x8000,o='';for(var i=0;i<b.length;i+=C)o+=String.fromCharCode.apply(null,b.subarray(i,i+C));return btoa(o);})(pako.deflate(done))
          };
          setDoneSnapshots(prev=>{
            const updated=[...prev,snapshot];
            const labelled=updated.filter(s=>s.label!=='auto');
            const autos=updated.filter(s=>s.label==='auto').slice(-60);
            return[...labelled,...autos];
          });
          lastSnapshotDateRef.current=today;
        }
      }catch(e){}
    }
    prevAutoCountRef.current={done:curDone,halfDone:curHalf};
  }catch(e){}
},[doneCount,halfStitchCounts.done]);
// Session onboarding toast: auto-dismiss after 8s (only for very first session ever)
useEffect(()=>{
  if(!sessionOnboardingShown&&liveAutoStitches>0&&statsSessions.length===0){
    const timer=setTimeout(()=>{setSessionOnboardingShown(true);try{localStorage.setItem("cs_sessionOnboardingDone","1");}catch(_){}},8000);
    return()=>clearTimeout(timer);
  }
},[sessionOnboardingShown,liveAutoStitches,statsSessions.length]);
// Session saved toast: auto-dismiss after 10s (unless note input is open)
useEffect(()=>{
  if(!sessionSavedToast||sessionSavedToast.showNoteInput)return;
  const timer=setTimeout(()=>setSessionSavedToast(null),10000);
  return()=>clearTimeout(timer);
},[sessionSavedToast]);
// Goal-completion detection — fire a celebration when any goal is first reached in this session
useEffect(()=>{
  try{
    const deh=(statsSettings&&statsSettings.dayEndHour)||0;
    const dailyGoal=statsSettings&&statsSettings.dailyGoal;
    const weeklyGoal=statsSettings&&statsSettings.weeklyGoal;
    const monthlyGoal=statsSettings&&statsSettings.monthlyGoal;
    if(!dailyGoal&&!weeklyGoal&&!monthlyGoal)return;
    const liveExtra=liveAutoStitches;
    const prev=goalCelebrationRef.current;
    if(dailyGoal>0){
      const cur=todayStitchesForBar;
      if(!prev.daily&&cur>=dailyGoal){goalCelebrationRef.current={...prev,daily:true};setCelebration({label:'Daily goal reached! '+cur.toLocaleString()+' / '+dailyGoal.toLocaleString()+' stitches',pct:null});}
      else if(prev.daily&&cur<dailyGoal)goalCelebrationRef.current={...prev,daily:false};
    }
    if(weeklyGoal>0){
      const cur=getStatsThisWeekStitches(statsSessions||[],deh)+liveExtra;
      if(!prev.weekly&&cur>=weeklyGoal){goalCelebrationRef.current={...prev,weekly:true};setCelebration({label:'Weekly goal reached! '+cur.toLocaleString()+' / '+weeklyGoal.toLocaleString()+' stitches',pct:null});}
      else if(prev.weekly&&cur<weeklyGoal)goalCelebrationRef.current={...prev,weekly:false};
    }
    if(monthlyGoal>0){
      const cur=getStatsThisMonthStitches(statsSessions||[],deh)+liveExtra;
      if(!prev.monthly&&cur>=monthlyGoal){goalCelebrationRef.current={...prev,monthly:true};setCelebration({label:'Monthly goal reached! '+cur.toLocaleString()+' / '+monthlyGoal.toLocaleString()+' stitches',pct:null});}
      else if(prev.monthly&&cur<monthlyGoal)goalCelebrationRef.current={...prev,monthly:false};
    }
  }catch(e){}
},[todayStitchesForBar,liveAutoStitches,statsSessions,statsSettings]);
// Edit session note
function editSessionNote(sessionId,noteText){
  try{setStatsSessions(prev=>(prev||[]).map(s=>s.id===sessionId?Object.assign({},s,{note:noteText}):s));}catch(e){}
  // Flush immediately so a tab close before the next auto-save doesn't lose the edit
  setTimeout(function(){
    if(typeof window.__flushProjectToIDB==='function'){
      var flushPromise=window.__flushProjectToIDB();
      if(flushPromise&&typeof flushPromise.catch==='function')flushPromise.catch(function(){});
    }
  },0);
}

// ═══ Analysis worker lifecycle ═══
useEffect(()=>{
  try{
    const w=new Worker("analysis-worker.js");
    analysisWorkerRef.current=w;
    w.onmessage=function(e){
      const msg=e.data;
      if(msg.type==="result"&&msg.requestId===analysisRequestIdRef.current){
        setAnalysisResult(msg.result);
        setAnalysisRunning(false);
      }
    };
    w.onerror=function(err){
      // PERF (perf-8 #12): terminate the worker on error so a wedged worker doesn't
      // leak; null the ref so the analyse useEffect skips until next mount.
      setAnalysisRunning(false);
      try{if(analysisWorkerRef.current){analysisWorkerRef.current.terminate();analysisWorkerRef.current=null;}}catch(_){}
    };
  }catch(e){}
  return()=>{clearTimeout(analysisThrottleRef.current);if(analysisWorkerRef.current){analysisWorkerRef.current.terminate();analysisWorkerRef.current=null;}};
},[]);

// Re-run analysis whenever pattern or progress changes (debounced 500ms)
useEffect(()=>{
  if(!pat||!sW||!sH||!analysisWorkerRef.current)return;
  clearTimeout(analysisThrottleRef.current);
  analysisThrottleRef.current=setTimeout(()=>{
    const reqId=++analysisRequestIdRef.current;
    setAnalysisRunning(true);
    // Send minimal-size pat objects — only need the id field
    const minPat=new Array(pat.length);
    for(let i=0;i<pat.length;i++)minPat[i]={id:pat[i].id};
    analysisWorkerRef.current.postMessage({type:"analyse",pat:minPat,done:done?Array.from(done):null,sW,sH,requestId:reqId,blockSize:blockW});
  },500);
  return()=>clearTimeout(analysisThrottleRef.current);
},[pat,done,sW,sH,blockW]);

// Derived recommendations from analysis result
const recommendations=useMemo(()=>{
  if(!analysisResult||!pat)return null;
  const pr=analysisResult.perRegion;
  if(!pr)return null;
  const scored=[];
  for(let i=0;i<pr.length;i++){
    const reg=pr[i];
    if(!reg||reg.totalStitches===0||reg.completionPercentage>=1)continue;
    if(!recDismissed.has(i))scored.push({idx:i,reg,score:reg.impactScore||0});
  }
  scored.sort((a,b)=>b.score-a.score);
  const pc=analysisResult.perColour;
  const quickWins=pc?Object.values(pc).filter(c=>c.totalStitches>0&&c.completedStitches<c.totalStitches).map(c=>({...c,remaining:c.totalStitches-c.completedStitches})).sort((a,b)=>a.remaining-b.remaining).slice(0,3):[];
  return{top:scored.slice(0,3),quickWins};
},[analysisResult,pat,recDismissed]);

// ── Focus block helper functions ──
function _isFocusBlockComplete(bx,by){
  if(!pat||!done)return false;
  const x0=bx*blockW,y0=by*blockH,x1=Math.min(x0+blockW,sW),y1=Math.min(y0+blockH,sH);
  for(let y=y0;y<y1;y++){for(let x=x0;x<x1;x++){
    const idx=y*sW+x;const m=pat[idx];
    if(!m||m.id==="__skip__"||m.id==="__empty__")continue;
    if(done[idx])continue;
    if(parkMarkers.some(pm=>pm.x===x&&pm.y===y))continue;
    return false;
  }}return true;
}
function _getBlockStitchCount(bx,by){
  if(!pat)return 0;
  const x0=bx*blockW,y0=by*blockH,x1=Math.min(x0+blockW,sW),y1=Math.min(y0+blockH,sH);
  let c=0;for(let y=y0;y<y1;y++)for(let x=x0;x<x1;x++){const m=pat[y*sW+x];if(m&&m.id!=="__skip__"&&m.id!=="__empty__")c++;}return c;
}
function _getStartBlock(){
  if(!sW||!sH)return{bx:0,by:0};
  const bCols=Math.ceil(sW/blockW),bRows=Math.ceil(sH/blockH);
  if(startCorner==="TR")return{bx:bCols-1,by:0};
  if(startCorner==="BL")return{bx:0,by:bRows-1};
  if(startCorner==="BR")return{bx:bCols-1,by:bRows-1};
  if(startCorner==="C")return{bx:Math.floor(bCols/2),by:Math.floor(bRows/2)};
  return{bx:0,by:0};
}
function _getRoyalRowsNext(bx,by){
  if(!sW||!sH)return null;
  const bCols=Math.ceil(sW/blockW),bRows=Math.ceil(sH/blockH);
  if(bx+1<bCols)return{bx:bx+1,by};
  if(by+1<bRows)return{bx:0,by:by+1};
  return null;
}
// Move the spotlight focus block by one block in (dx,dy). No-op when spotlight
// is disabled or stitching style is cross-country (which has no concept of
// spatial blocks). If no focus block is set yet, falls back to the start block.
function _stepFocusBlock(dx,dy){
  if(!focusEnabled||stitchingStyle==="crosscountry"||!sW||!sH)return;
  const bCols=Math.ceil(sW/blockW),bRows=Math.ceil(sH/blockH);
  const cur=focusBlock||_getStartBlock();
  const bx=Math.max(0,Math.min(bCols-1,cur.bx+dx));
  const by=Math.max(0,Math.min(bRows-1,cur.by+dy));
  if(bx===cur.bx&&by===cur.by&&focusBlock)return;
  setFocusBlock({bx,by});
}

// ── Block auto-advance effect ──
useEffect(()=>{
  if(!focusBlock||!focusEnabled||!pat||!done||stitchingStyle==="crosscountry")return;
  const complete=_isFocusBlockComplete(focusBlock.bx,focusBlock.by);
  if(!prevFocusBlockDoneRef.current&&complete){
    if(blockAdvanceTimerRef.current)clearTimeout(blockAdvanceTimerRef.current);
    blockAdvanceTimerRef.current=setTimeout(()=>{
      const stitches=_getBlockStitchCount(focusBlock.bx,focusBlock.by);
      const curSessIdx=statsSessions?statsSessions.length:0;
      const seqN=breadcrumbs.filter(b=>b.sessionIdx===curSessIdx).length+1;
      // PERF (perf-8 #9): cap breadcrumb history to last 500 entries to prevent unbounded growth
      // over long projects with many focus blocks.
      setBreadcrumbs(prev=>{const next=[...prev,{sessionIdx:curSessIdx,bx:focusBlock.bx,by:focusBlock.by,seqN,completedAt:Date.now()}];return next.length>500?next.slice(-500):next;});
      let next=null;
      if(stitchingStyle==="royal"){
        next=_getRoyalRowsNext(focusBlock.bx,focusBlock.by);
      }else if(recommendations&&recommendations.top.length>0&&analysisResult){
        const RS=analysisResult.regionSize||blockW;const RC=analysisResult.regionCols||1;
        const top=recommendations.top.find(r=>{const rC=r.idx%RC,rR=Math.floor(r.idx/RC);return!(rC===focusBlock.bx&&rR===focusBlock.by);});
        if(top){const rC=top.idx%RC,rR=Math.floor(top.idx/RC);next={bx:rC,by:rR};}
      }
      prevFocusBlockDoneRef.current=true;
      setBlockAdvanceToast({bx:focusBlock.bx,by:focusBlock.by,label:`Block ${focusBlock.by+1},${focusBlock.bx+1}`,stitches,next});
      setTimeout(()=>{
        setBlockAdvanceToast(null);
        if(next)setFocusBlock(next);
      },1500);
    },500);
  }else if(!complete){
    prevFocusBlockDoneRef.current=false;
    if(blockAdvanceTimerRef.current){clearTimeout(blockAdvanceTimerRef.current);blockAdvanceTimerRef.current=null;}
  }
  return()=>{if(blockAdvanceTimerRef.current)clearTimeout(blockAdvanceTimerRef.current);};
},[countsVer,focusBlock,focusEnabled,pat,done,parkMarkers,stitchingStyle,blockW,blockH,sW,sH,recommendations,analysisResult,statsSessions,breadcrumbs]);

// Thread usage summary stats derived from analysis
const threadUsageSummary=useMemo(()=>{
  if(!analysisResult||!analysisResult.perStitch)return null;
  const ps=analysisResult.perStitch;
  let isolated=0,small=0,medium=0,large=0;
  for(let i=0;i<ps.clusterSize.length;i++){
    if(!pat||!pat[i])continue;
    const id=pat[i].id;
    if(id==="__skip__"||id==="__empty__")continue;
    const sz=ps.clusterSize[i];
    if(sz===1)isolated++;
    else if(sz<=4)small++;
    else if(sz<=19)medium++;
    else large++;
  }
  const total=isolated+small+medium+large;
  const pc=analysisResult.perColour;
  let mostScattered=null,mostClustered=null;
  if(pc){
    const cols=Object.values(pc).filter(c=>c.totalStitches>0);
    if(cols.length){
      mostScattered=cols.reduce((best,c)=>c.confettiCount>best.confettiCount?c:best,cols[0]);
      mostClustered=cols.reduce((best,c)=>c.largestClusterSize>best.largestClusterSize?c:best,cols[0]);
    }
  }
  // Estimated thread changes ≈ isolated + small cluster count (each cluster needs thread up+rethread)
  const estChanges=isolated+(analysisResult.perColour?Object.values(analysisResult.perColour).reduce((s,c)=>s+c.clusterCount,0):0);
  return{isolated,small,medium,large,total,estChanges,mostScattered,mostClustered};
},[analysisResult,pat]);

function markColourDone(cid,md){const cur=doneRef.current;if(!pat||!cur)return;let changes=[];let nd=new Uint8Array(cur);for(let i=0;i<pat.length;i++)if(pat[i].id===cid){if(nd[i]!==(md?1:0))changes.push({idx:i,oldVal:nd[i]});nd[i]=md?1:0;}if(changes.length>0){pushTrackHistory(changes);applyDoneCountsDelta(changes,pat,nd);}doneRef.current=nd;setDone(nd);}
function copyText(t,l){navigator.clipboard.writeText(t).then(()=>{setCopied(l);setTimeout(()=>setCopied(null),2000);}).catch(()=>{});}
function copyProgressSummary(){
  let t=totalTime+liveAutoElapsed;
  let coloursComplete=Object.values(colourDoneCounts).filter(c=>c.done>=c.total&&c.total>0).length;
  let totalColours=pal?pal.length:0;
  let stPerHr=t>=60&&doneCount>0?Math.round(doneCount/(t/3600)):null;
  let estRem=t>=60&&doneCount>0?Math.round((totalStitchable-doneCount)*(t/doneCount)):null;
  let lines=["\u{1F9F5} Cross Stitch Progress Update"];
  lines.push("Project: "+(projectName||sW+"\u00D7"+sH+" pattern"));
  lines.push("Progress: "+doneCount+"/"+totalStitchable+" stitches ("+progressPct.toFixed(1)+"%)");
  if(halfStitchCounts.total>0)lines.push("Half stitches: "+halfStitchCounts.done+"/"+halfStitchCounts.total);
  lines.push("Colours: "+coloursComplete+"/"+totalColours+" colours complete");
  if(t>=60)lines.push("Time stitched: "+fmtTime(t)+" ("+(statsSessions?statsSessions.length:0)+" sessions)");
  else lines.push("Time stitched: Not tracked yet");
  if(stPerHr)lines.push("Speed: "+stPerHr+" stitches/hour");
  if(estRem)lines.push("Est. remaining: "+fmtTime(estRem));
  lines.push("Pattern: "+sW+"\u00D7"+sH+", "+totalColours+" colours, "+fabricCt+"ct");
  copyText(lines.join("\n"),"progress");
}

// History entry shapes:
//   • Legacy: bare array of {idx,oldVal} — single-cell or per-pixel drag.
//   • B2 BULK_TOGGLE: {type:"BULK_TOGGLE", source:"drag"|"range", changes:[...]}
//     One undo step covering the whole drag-mark or range-select gesture.
// _historyChanges normalises both shapes for the undo/redo pipeline.
function _historyChanges(entry){
  return (entry && entry.type === "BULK_TOGGLE") ? entry.changes : entry;
}
function pushTrackHistory(changes){
  if(!changes||!changes.length)return;
  // Track colours for auto-session
  if(pat){for(let i=0;i<changes.length;i++){const id=pat[changes[i].idx]&&pat[changes[i].idx].id;if(id&&id!=='__skip__'&&id!=='__empty__')pendingColoursRef.current.add(id);}}
  setTrackHistory(prev=>{let n=[...prev,changes];if(n.length>TRACK_HISTORY_MAX)n=n.slice(n.length-TRACK_HISTORY_MAX);return n;});
  setRedoStack([]);
}
// B2: push a single tagged BULK_TOGGLE entry from useDragMark commits.
function pushBulkToggleHistory(changes, source){
  if(!changes||!changes.length)return;
  if(pat){for(let i=0;i<changes.length;i++){const id=pat[changes[i].idx]&&pat[changes[i].idx].id;if(id&&id!=='__skip__'&&id!=='__empty__')pendingColoursRef.current.add(id);}}
  const entry={type:"BULK_TOGGLE",source:source||"drag",changes:changes};
  setTrackHistory(prev=>{let n=[...prev,entry];if(n.length>TRACK_HISTORY_MAX)n=n.slice(n.length-TRACK_HISTORY_MAX);return n;});
  setRedoStack([]);
}
function undoTrack(){
  if(!trackHistory.length||!done)return;
  let lastEntry=trackHistory[trackHistory.length-1];
  let last=_historyChanges(lastEntry);
  let nd=new Uint8Array(done);
  let redoChanges=last.map(c=>({idx:c.idx,oldVal:nd[c.idx]}));
  for(let c of last)nd[c.idx]=c.oldVal;
  applyDoneCountsDelta(redoChanges,pat,nd);
  setDone(nd);
  setTrackHistory(prev=>prev.slice(0,-1));
  let redoEntry=(lastEntry&&lastEntry.type==="BULK_TOGGLE")
    ?{type:"BULK_TOGGLE",source:lastEntry.source,changes:redoChanges}
    :redoChanges;
  setRedoStack(prev=>{let n=[...prev,redoEntry];if(n.length>TRACK_HISTORY_MAX)n=n.slice(n.length-TRACK_HISTORY_MAX);return n;});
}
function redoTrack(){
  if(!redoStack.length||!done)return;
  let lastEntry=redoStack[redoStack.length-1];
  let last=_historyChanges(lastEntry);
  let nd=new Uint8Array(done);
  let undoChanges=last.map(c=>({idx:c.idx,oldVal:nd[c.idx]}));
  for(let c of last)nd[c.idx]=c.oldVal;
  applyDoneCountsDelta(undoChanges,pat,nd);
  setDone(nd);
  setRedoStack(prev=>prev.slice(0,-1));
  let undoEntry=(lastEntry&&lastEntry.type==="BULK_TOGGLE")
    ?{type:"BULK_TOGGLE",source:lastEntry.source,changes:undoChanges}
    :undoChanges;
  setTrackHistory(prev=>{let n=[...prev,undoEntry];if(n.length>TRACK_HISTORY_MAX)n=n.slice(n.length-TRACK_HISTORY_MAX);return n;});
}

// --- V2 Edit functions ---

// Change a single cell's symbol. Updates the sparse diff and pat, preserves symbols in pal.
function handleSingleStitchEdit(cellIdx, newId) {
  if (!pat || !pal || !cmap) return;
  const cell = pat[cellIdx];
  if (cell.id === newId) return; // no-op: tapped the symbol the cell already has
  const newEntry = cmap[newId];
  if (!newEntry) return;

  const existingEditEntry = singleStitchEdits.get(cellIdx) || null;
  setUndoSnapshot({ type:"single_stitch_edit", cellIdx, previousCell:{...cell}, previousEditEntry:existingEditEntry });

  // Update sparse diff — originalId is always the first-ever pre-edit value
  const originalId = existingEditEntry ? existingEditEntry.originalId : cell.id;
  const newEdits = new Map(singleStitchEdits);
  if (newId === originalId) {
    newEdits.delete(cellIdx); // back to original — no diff needed
  } else {
    newEdits.set(cellIdx, { originalId, currentId: newId });
  }
  setSingleStitchEdits(newEdits);

  const newPat = [...pat];
  newPat[cellIdx] = { ...cell, id:newId, name:newEntry.name, rgb:newEntry.rgb, lab:newEntry.lab };
  const newPal = rebuildPaletteCounts(newPat, pal);
  const newCmap = {}; newPal.forEach(p => { newCmap[p.id] = p; });
  setPat(newPat); setPal(newPal); setCmap(newCmap);
  setCellEditPopover(null);
}

// Remove a single stitch (marks cell as __empty__). Clears done state for that cell.
function handleStitchRemoval(cellIdx) {
  if (!pat || !done) return;
  const cell = pat[cellIdx];
  if (cell.id === "__skip__" || cell.id === "__empty__") return;
  const existingEditEntry = singleStitchEdits.get(cellIdx) || null;
  const previousDone = done[cellIdx];

  setUndoSnapshot({ type:"removal", cellIdx, previousCell:{...cell}, previousEditEntry:existingEditEntry, previousDone });

  const originalId = existingEditEntry ? existingEditEntry.originalId : cell.id;
  const newEdits = new Map(singleStitchEdits);
  newEdits.set(cellIdx, { originalId, currentId: null });
  setSingleStitchEdits(newEdits);

  const newPat = [...pat];
  newPat[cellIdx] = { id:"__empty__", type:"skip", rgb:[255,255,255], lab:[100,0,0] };
  if (previousDone) { const nd=new Uint8Array(done); nd[cellIdx]=0; applyDoneCountsDelta([{idx:cellIdx,oldVal:1}],pat,nd); setDone(nd); }
  const newPal = rebuildPaletteCounts(newPat, pal);
  const newCmap = {}; newPal.forEach(p => { newCmap[p.id] = p; });
  setPat(newPat); setPal(newPal); setCmap(newCmap);
  setCellEditPopover(null);
}

// Swap the thread assignments of two palette entries. Each symbol keeps its visual character;
// only the underlying thread (id/rgb/name) swaps. O(n) cell scan required since cell.id = threadCode.
function handleSymbolSwap(palEntryA, palEntryB) {
  if (!pat || !pal) return;
  if (palEntryA.id === palEntryB.id) return; // no-op
  setUndoSnapshot({ type:"swap", entryA:{...palEntryA}, entryB:{...palEntryB} });
  _applySwap(palEntryA, palEntryB);
}

// Internal swap — does not touch undoSnapshot. Used by both handleSymbolSwap and applyUndo.
function _applySwap(palEntryA, palEntryB) {
  const newPat = pat.map(cell => {
    if (cell.id === palEntryA.id) return { ...cell, id:palEntryB.id, name:palEntryB.name, rgb:palEntryB.rgb, lab:palEntryB.lab };
    if (cell.id === palEntryB.id) return { ...cell, id:palEntryA.id, name:palEntryA.name, rgb:palEntryA.rgb, lab:palEntryA.lab };
    return cell;
  });
  const newPal = pal.map(p => {
    if (p.id === palEntryA.id) return { ...p, id:palEntryB.id, name:palEntryB.name, rgb:palEntryB.rgb, lab:palEntryB.lab };
    if (p.id === palEntryB.id) return { ...p, id:palEntryA.id, name:palEntryA.name, rgb:palEntryA.rgb, lab:palEntryA.lab };
    return p;
  });
  const newCmap = {}; newPal.forEach(p => { newCmap[p.id] = p; });
  // Transfer thread ownership
  const newOwned = { ...threadOwned };
  const ownA = threadOwned[palEntryA.id], ownB = threadOwned[palEntryB.id];
  delete newOwned[palEntryA.id]; delete newOwned[palEntryB.id];
  if (ownA !== undefined) newOwned[palEntryB.id] = ownA;
  if (ownB !== undefined) newOwned[palEntryA.id] = ownB;
  setPat(newPat); setPal(newPal); setCmap(newCmap); setThreadOwned(newOwned);
}

// Single-level undo for edit operations (bulk reassign, single-stitch edit, removal, swap).
function applyUndo() {
  if (!undoSnapshot) return;
  const snap = undoSnapshot;
  setUndoSnapshot(null);

  if (snap.type === "bulk_reassignment") {
    const { pal:prevPal, threadOwned:prevOwned, oldId, newId } = snap;
    const oldEntry = prevPal.find(p => p.id === oldId);
    const newPat = pat.map(cell => {
      if (cell.id !== newId) return cell;
      return { ...cell, id:oldId, name:oldEntry?.name||cell.name, rgb:oldEntry?.rgb||cell.rgb, lab:oldEntry?.lab||cell.lab };
    });
    const newCmap = {}; prevPal.forEach(p => { newCmap[p.id] = p; });
    setPat(newPat); setPal(prevPal); setCmap(newCmap); setThreadOwned(prevOwned);
  }
  else if (snap.type === "single_stitch_edit") {
    const { cellIdx, previousCell, previousEditEntry } = snap;
    const newPat = [...pat];
    newPat[cellIdx] = previousCell;
    const newEdits = new Map(singleStitchEdits);
    if (previousEditEntry === null) newEdits.delete(cellIdx);
    else newEdits.set(cellIdx, previousEditEntry);
    setSingleStitchEdits(newEdits);
    const newPal = rebuildPaletteCounts(newPat, pal);
    const newCmap = {}; newPal.forEach(p => { newCmap[p.id] = p; });
    setPat(newPat); setPal(newPal); setCmap(newCmap);
  }
  else if (snap.type === "removal") {
    const { cellIdx, previousCell, previousEditEntry, previousDone } = snap;
    const newPat = [...pat];
    newPat[cellIdx] = previousCell;
    const newEdits = new Map(singleStitchEdits);
    if (previousEditEntry === null) newEdits.delete(cellIdx);
    else newEdits.set(cellIdx, previousEditEntry);
    setSingleStitchEdits(newEdits);
    if (previousDone) { const nd=new Uint8Array(done); nd[cellIdx]=1; applyDoneCountsDelta([{idx:cellIdx,oldVal:0}],pat,nd); setDone(nd); }
    const newPal = rebuildPaletteCounts(newPat, pal);
    const newCmap = {}; newPal.forEach(p => { newCmap[p.id] = p; });
    setPat(newPat); setPal(newPal); setCmap(newCmap);
  }
  else if (snap.type === "swap") {
    // A swap is self-inverse: apply the same swap using the current (post-swap) entries
    const curA = pal.find(p => p.id === snap.entryA.id);
    const curB = pal.find(p => p.id === snap.entryB.id);
    if (curA && curB) _applySwap(curA, curB);
  }
}

function handleRevertToOriginal(){
  if(!confirm("Revert all symbol assignments to the original PDF import? Your tracking progress will be kept, but all colour corrections will be lost."))return;
  const previousPal=originalPaletteState;
  const previousMap={};
  previousPal.forEach(p=>{previousMap[p.symbol]=p;});
  const newPat=pat.map(cell=>{
    if(cell.id==="__skip__")return cell;
    const currentEntry=cmap[cell.id];
    const originalThread=currentEntry?previousMap[currentEntry.symbol]:null;
    if(originalThread){return{...cell,id:originalThread.id,name:originalThread.name,rgb:originalThread.rgb,lab:originalThread.lab};}
    return cell;
  });
  const newCmap={};
  previousPal.forEach(p=>{newCmap[p.id]=p;});
  const newThreadOwned={...threadOwned};
  Object.keys(newThreadOwned).forEach(threadId=>{if(!previousPal.find(p=>p.id===threadId))delete newThreadOwned[threadId];});
  let revertedPat=newPat;
  if(singleStitchEdits.size>0){
    revertedPat=[...newPat];
    singleStitchEdits.forEach((entry,cellIdx)=>{
      const originalCell=revertedPat[cellIdx];
      const origEntry=previousPal.find(p=>p.id===entry.originalId);
      if(origEntry){revertedPat[cellIdx]={...originalCell,id:origEntry.id,name:origEntry.name,rgb:origEntry.rgb,lab:origEntry.lab};}
      else{revertedPat[cellIdx]={...originalCell,id:entry.originalId};}
    });
  }
  setPat(revertedPat);setPal(previousPal);setCmap(newCmap);setThreadOwned(newThreadOwned);setSingleStitchEdits(new Map());setUndoSnapshot(null);
}

function doSaveProject(finalName){
  if(!pat||!pal)return;
  // Serialise singleStitchEdits Map as array of [cellIdx, {originalId, currentId}] pairs
  const sseArr = [...singleStitchEdits.entries()];
  // Serialise half stitch data as arrays of [cellIdx, {fwd?, bck?}] pairs
  const hsArr = [...halfStitches.entries()].map(([idx, hs]) => [idx, {
    fwd: hs.fwd ? { id: hs.fwd.id, rgb: hs.fwd.rgb } : undefined,
    bck: hs.bck ? { id: hs.bck.id, rgb: hs.bck.rgb } : undefined
  }]);
  const hdArr = [...halfDone.entries()];
  let project={
    version:9,
    id:projectIdRef.current||undefined,
    page:"tracker",
    name:finalName,
    createdAt:createdAtRef.current||new Date().toISOString(),
    updatedAt:new Date().toISOString(),
    settings:{sW,sH,fabricCt,skeinPrice,stitchSpeed},
    // PERF (deferred-1): rgb-stripping serializer; see helpers.js / serializePattern.
    pattern:(window.PatternIO?window.PatternIO.serializePattern(pat):pat.map(m=>(m.id==="__skip__"||m.id==="__empty__")?{id:m.id}:{id:m.id,type:m.type,rgb:m.rgb})),
    bsLines,
    done:done?Array.from(done):null,
    parkMarkers,
    hlRow,
    hlCol,
    threadOwned,
    originalPaletteState,
    singleStitchEdits: sseArr,
    halfStitches: hsArr,
    halfDone: hdArr,
    statsSessions,
    statsSettings,
    achievedMilestones,
    doneSnapshots,
    breadcrumbs,
    stitchingStyle, blockW, blockH, focusBlock, startCorner, colourSequence,
    savedZoom: stitchZoom,
    savedScroll: stitchScrollRef.current ? { left: stitchScrollRef.current.scrollLeft, top: stitchScrollRef.current.scrollTop } : null
  };
  let blob=new Blob([JSON.stringify(project)],{type:"application/json"});
  let url=URL.createObjectURL(blob);
  let a=document.createElement("a");
  a.href=url;
  const safeName=(finalName||'cross-stitch-project').replace(/[^a-zA-Z0-9_\- ]/g,'').trim()||'cross-stitch-project';
  a.download=safeName+".json";
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function generatePatternThumbnail(pat, sW, sH) {
  let c = document.createElement("canvas");
  c.width = sW;
  c.height = sH;
  let ctx = c.getContext("2d");
  let imgData = ctx.createImageData(sW, sH);
  let d = imgData.data;
  for (let i = 0; i < pat.length; i++) {
    let m = pat[i];
    let idx = i * 4;
    if (!m || m.id === "__skip__" || m.id === "__empty__") {
      d[idx] = 255; d[idx+1] = 255; d[idx+2] = 255; d[idx+3] = 255;
    } else {
      d[idx] = m.rgb[0]; d[idx+1] = m.rgb[1]; d[idx+2] = m.rgb[2]; d[idx+3] = 255;
    }
  }
  ctx.putImageData(imgData, 0, 0);
  return c.toDataURL("image/jpeg", 0.85);
}

async function exportPDF(options={}){
  const displayMode=options.displayMode||"color_symbol";
  const cellMM=options.cellSize||3;
  const isSinglePage=options.singlePage===true;
  if(!pat||!pal||!cmap)return;
  if(!window.jspdf)await window.loadScript('https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js');
  const{jsPDF}=window.jspdf;const mg=12,cW2=186;
  const gridColsA4=Math.floor(cW2/cellMM),gridRowsA4=Math.floor(275/cellMM);

  let pdf;
  if (isSinglePage) {
    let singleW = mg * 2 + sW * cellMM;
    let singleH = mg * 2 + 10 + sH * cellMM; // +10 for header
    let minW = 210, minH = 297;
    pdf = new jsPDF("portrait", "mm", [Math.max(minW, singleW), Math.max(minH, singleH)]);
  } else {
    pdf = new jsPDF("portrait","mm","a4");
  }

  // --- Cover Sheet Generation ---
  (function(){
    const mg=15;
    let y=mg;
    pdf.setFontSize(26);pdf.setTextColor(30,30,30);pdf.text("Cross Stitch Project",mg,y+10);y+=18;
    pdf.setDrawColor(91,123,179);pdf.setLineWidth(0.8);pdf.line(mg,y,195,y);y+=10;

    let thumbData = generatePatternThumbnail(pat, sW, sH);
    let thumbW = 60;
    let thumbH = (sH / sW) * thumbW;
    if (thumbH > 80) {
      thumbH = 80;
      thumbW = (sW / sH) * thumbH;
    }
    let thumbX = (210 - thumbW) / 2;
    pdf.addImage(thumbData, 'JPEG', thumbX, y, thumbW, thumbH);
    y += thumbH + 10;

    pdf.setFontSize(11);pdf.setTextColor(100);pdf.text("PATTERN SUMMARY",mg,y);y+=7;
    pdf.setFontSize(10);pdf.setTextColor(40);
    let div2=fabricCt===28?14:fabricCt;let wIn2=sW/div2,hIn2=sH/div2;

    // totalSkeins
    let totalSkeins = 0;
    pal.forEach(p => { totalSkeins += skeinEst(p.count, fabricCt); });

    let blendCount=pal.filter(p=>p.type==="blend").length;

    let infoLines=[
      ["Pattern size",`${sW} × ${sH} stitches`],
      ["Stitchable stitches",totalStitchable.toLocaleString()],
      ["Colours",`${pal.length} (${blendCount} blend${blendCount!==1?"s":""})`],
      ["Skeins needed",`${totalSkeins}`],
      ["Fabric",`${fabricCt} count`],
      ["Finished size",`${wIn2.toFixed(1)}″ × ${hIn2.toFixed(1)}″ (${(wIn2*2.54).toFixed(1)} × ${(hIn2*2.54).toFixed(1)} cm)`],
      ["With 1″ margin",`${(wIn2+2).toFixed(0)}″ × ${(hIn2+2).toFixed(0)}″`],
      ["Est. time",fmtTimeL(Math.round(totalStitchable/stitchSpeed*3600))+` (at ${stitchSpeed} st/hr)`],
      ["Est. thread cost",`£${(totalSkeins*skeinPrice).toFixed(2)} (at £${skeinPrice.toFixed(2)}/skein)`],
    ];
    infoLines.forEach(([l,v])=>{pdf.setTextColor(120);pdf.text(l+":",mg,y);pdf.setTextColor(40);pdf.text(v,mg+50,y);y+=5.5;});
    y+=6;

    if(done&&totalStitchable>0){
      let localDoneCount=0;for(let i=0;i<done.length;i++)if(done[i])localDoneCount++;
      if(localDoneCount>0){
        let localProgressPct=Math.round(localDoneCount/totalStitchable*1000)/10;
        pdf.setFontSize(11);pdf.setTextColor(100);pdf.text("PROGRESS",mg,y);y+=7;pdf.setFontSize(10);pdf.setTextColor(40);pdf.text(`${localProgressPct}% complete — ${localDoneCount.toLocaleString()} of ${totalStitchable.toLocaleString()} stitches`,mg,y);y+=8;if(totalTime>0){pdf.text(`Time stitched: ${fmtTimeL(totalTime)} (${(statsSessions?statsSessions.length:0)} session${(statsSessions?statsSessions.length:0)!==1?"s":""})`,mg,y);y+=5.5;let actualSpeed=Math.round(localDoneCount/(totalTime/3600));pdf.text(`Actual speed: ${actualSpeed} stitches/hr`,mg,y);y+=5.5;}y+=4;
      }
    }

    pdf.setFontSize(11);pdf.setTextColor(100);pdf.text("THREAD LIST",mg,y);y+=7;
    pdf.setFontSize(8);pdf.setTextColor(80);pdf.text("DMC",mg,y);pdf.text("Name",mg+20,y);pdf.text("Skeins",mg+100,y);pdf.text("Status",mg+120,y);y+=2;
    pdf.setDrawColor(200);pdf.line(mg,y,180,y);y+=4;
    pdf.setFontSize(9);

    // skeinData
    let skeinData = pal.map(p => ({
        id: p.id,
        name: p.type === 'blend' ? `${p.threads[0].name} + ${p.threads[1].name}` : p.name,
        skeins: skeinEst(p.count, fabricCt),
        rgb: p.rgb
    }));

    skeinData.forEach(d=>{
      if(y>275){pdf.addPage();y=mg+8;}
      pdf.setFillColor(d.rgb[0],d.rgb[1],d.rgb[2]);pdf.circle(mg+3,y-1.2,1.8,"F");
      pdf.setTextColor(40);pdf.text(d.id,mg+8,y);pdf.text(d.name,mg+20,y);pdf.text(String(d.skeins),mg+104,y);
      let st=threadOwned[d.id]||"";
      if(st==="owned"){pdf.setTextColor(22,163,74);pdf.text("Owned",mg+120,y);}
      else{pdf.setTextColor(234,88,12);pdf.text("To buy",mg+120,y);}
      pdf.setTextColor(40);
      y+=5;
    });
    y+=6;

    if(y<240){pdf.setFontSize(11);pdf.setTextColor(100);pdf.text("NOTES",mg,y);y+=4;pdf.setDrawColor(220);for(let nl=0;nl<8;nl++){y+=7;pdf.line(mg,y,180,y);}}
  })();

  pdf.addPage();
  let ty=mg+10;
  pdf.setTextColor(0);pdf.setFontSize(14);pdf.text("Thread Legend",mg,ty);ty+=10;
  pdf.setFontSize(9);pdf.setTextColor(80);
  pdf.text("Symbol",mg,ty);
  pdf.text("Colour",mg+15,ty);
  pdf.text("DMC",mg+30,ty);
  pdf.text("Name",mg+45,ty);
  pdf.text("Stitches",mg+110,ty,{align:"right"});
  pdf.text("Length",mg+135,ty,{align:"right"});
  pdf.text("Skeins",mg+155,ty,{align:"right"});
  ty+=2;
  pdf.setDrawColor(200);pdf.setLineWidth(0.3);pdf.line(mg,ty,mg+155,ty);
  ty+=6;
  pdf.setFontSize(8);
  pal.forEach(p=>{
    if(ty>285){pdf.addPage();ty=mg+8;}
    pdf.setFillColor(p.rgb[0],p.rgb[1],p.rgb[2]);
    pdf.setDrawColor(150);
    pdf.rect(mg+15, ty-3, 6, 4, "DF");
    pdf.setTextColor(40);
    pdf.setDrawColor(40);
    pdf.setFillColor(40);
    if(typeof drawPDFSymbol==='function'){
      drawPDFSymbol(pdf,p.symbol,mg+5,ty-1,3.5);
    }else{
      pdf.text(p.symbol,mg+3,ty);
    }

    let isBlend = p.type === "blend";
    let nameStr = isBlend ? p.threads[0].name+" + "+p.threads[1].name : p.name;
    let usg;
    if (typeof stitchesToSkeins === 'function') {
        usg = stitchesToSkeins({ stitchCount: p.count, fabricCount: fabricCt, strandsUsed: 2, isBlended: isBlend });
    }

    pdf.text(p.id,mg+30,ty);
    pdf.text(nameStr,mg+45,ty);
    pdf.text(String(p.count),mg+110,ty,{align:"right"});
    if (usg) {
      pdf.text(String(usg.totalThreadM) + "m",mg+135,ty,{align:"right"});
      let skDisplay = isBlend ? Math.max(usg.colorA.skeinsToBuy, usg.colorB.skeinsToBuy) : usg.skeinsToBuy;
      pdf.text(String(skDisplay),mg+155,ty,{align:"right"});
    } else {
      let sk=skeinEst(p.count,fabricCt);
      pdf.text("-",mg+135,ty,{align:"right"});
      pdf.text(String(sk),mg+155,ty,{align:"right"});
    }
    ty+=6;
  });

  if (typeof bsLines !== 'undefined' && bsLines && bsLines.length > 0) {
      let bsUsed = {};
      bsLines.forEach(l => {
          let c = l.color || "#000000";
          if (!bsUsed[c]) bsUsed[c] = {count: 0, dmc: "Unknown"};
          bsUsed[c].count++;
      });
      // Simple DMC resolution for hex values
      Object.keys(bsUsed).forEach(hex => {
          let m = hex.match(/^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i);
          if (m && typeof rgbToLab === 'function' && typeof DMC_RAW !== 'undefined') {
              let lr = parseInt(m[1], 16), lg = parseInt(m[2], 16), lb = parseInt(m[3], 16);
              let lab = rgbToLab(lr, lg, lb);
              let best = DMC_RAW[0], bDist = Infinity;
              for(let i=0; i<DMC_RAW.length; i++) {
                 let dr = DMC_RAW[i][2], dg = DMC_RAW[i][3], db = DMC_RAW[i][4];
                 let dLab = rgbToLab(dr, dg, db);
                 let dist = dE(lab, dLab);
                 if (dist < bDist) { bDist = dist; best = DMC_RAW[i]; }
              }
              bsUsed[hex].dmc = best[0];
              bsUsed[hex].name = best[1];
          }
      });

      ty += 8;
      if(ty>280){pdf.addPage();ty=mg+8;}
      pdf.setTextColor(0);pdf.setFontSize(14);pdf.text("Backstitch Lines",mg,ty);ty+=10;
      pdf.setFontSize(9);pdf.setTextColor(80);
      pdf.text("Line",mg,ty);
      pdf.text("DMC",mg+30,ty);
      pdf.text("Name",mg+45,ty);
      pdf.text("Segments",mg+110,ty,{align:"right"});
      ty+=2;
      pdf.setDrawColor(200);pdf.setLineWidth(0.3);pdf.line(mg,ty,mg+155,ty);
      ty+=6;
      pdf.setFontSize(8);
      Object.keys(bsUsed).forEach(hex => {
          if(ty>285){pdf.addPage();ty=mg+8;}
          pdf.setDrawColor(hex);
          pdf.setLineWidth(0.8);
          pdf.line(mg+2, ty-1, mg+15, ty-1);
          pdf.setTextColor(40);
          pdf.text(String(bsUsed[hex].dmc),mg+30,ty);
          pdf.text(String(bsUsed[hex].name || "Black"),mg+45,ty);
          pdf.text(String(bsUsed[hex].count),mg+110,ty,{align:"right"});
          ty+=6;
      });
  }

  const gridCols=isSinglePage?sW:gridColsA4;
  const gridRows=isSinglePage?sH:gridRowsA4;
  const pagesX=Math.ceil(sW/gridCols),pagesY=Math.ceil(sH/gridRows);

  function clipLine(x1, y1, x2, y2, xmin, ymin, xmax, ymax) {
    let INSIDE = 0, LEFT = 1, RIGHT = 2, BOTTOM = 4, TOP = 8;
    function computeOutCode(x, y) {
      let code = INSIDE;
      if (x < xmin) code |= LEFT;
      else if (x > xmax) code |= RIGHT;
      if (y < ymin) code |= TOP;
      else if (y > ymax) code |= BOTTOM;
      return code;
    }
    let outcode0 = computeOutCode(x1, y1), outcode1 = computeOutCode(x2, y2), accept = false;
    while (true) {
      if (!(outcode0 | outcode1)) { accept = true; break; }
      else if (outcode0 & outcode1) { break; }
      else {
        let x, y, outcodeOut = outcode0 ? outcode0 : outcode1;
        if (outcodeOut & TOP) { x = x1 + (x2 - x1) * (ymin - y1) / (y2 - y1); y = ymin; }
        else if (outcodeOut & BOTTOM) { x = x1 + (x2 - x1) * (ymax - y1) / (y2 - y1); y = ymax; }
        else if (outcodeOut & RIGHT) { y = y1 + (y2 - y1) * (xmax - x1) / (x2 - x1); x = xmax; }
        else if (outcodeOut & LEFT) { y = y1 + (y2 - y1) * (xmin - x1) / (x2 - x1); x = xmin; }
        if (outcodeOut === outcode0) { x1 = x; y1 = y; outcode0 = computeOutCode(x1, y1); }
        else { x2 = x; y2 = y; outcode1 = computeOutCode(x2, y2); }
      }
    }
    return accept ? [x1, y1, x2, y2] : null;
  }

  function drawChartPages(isBackstitchOnly) {
    for(let py2=0;py2<pagesY;py2++){
      for(let px2=0;px2<pagesX;px2++){
        pdf.addPage();
        let x0=px2*gridCols,y0=py2*gridRows;
        let mainW=Math.min(gridCols,sW-x0),mainH=Math.min(gridRows,sH-y0);
        let overlapRight=(x0+mainW<sW)?2:0,overlapBottom=(y0+mainH<sH)?2:0;
        let dW=mainW+overlapRight,dH=mainH+overlapBottom;
        pdf.setFontSize(8);pdf.setTextColor(100);
        let headerText = (isBackstitchOnly ? "Backstitch Chart - " : "") + `Page ${py2*pagesX+px2+1}/${pagesX*pagesY}`;
        pdf.text(headerText, mg, mg+4);

        // Draw Minimap (top right)
        if (pagesX > 1 || pagesY > 1) {
            let mmW = 3; // minimap cell width
            let mmMapW = pagesX * mmW;
            let mmX = mg + dW*cellMM - mmMapW;
            let mmY = mg+2;

            for(let my=0; my<pagesY; my++){
                for(let mx=0; mx<pagesX; mx++){
                    if (mx === px2 && my === py2) {
                        pdf.setFillColor(100);
                        pdf.rect(mmX + mx*mmW, mmY + my*mmW, mmW, mmW, "F");
                    } else {
                        pdf.setDrawColor(200);
                        pdf.rect(mmX + mx*mmW, mmY + my*mmW, mmW, mmW, "S");
                    }
                }
            }
        }

        for(let gy=0;gy<dH;gy++){
          for(let gx=0;gx<dW;gx++){
            let cellIdx = (y0+gy)*sW+(x0+gx);
            let m=pat[cellIdx];
            let px3=mg+gx*cellMM,py3=mg+8+gy*cellMM;
            let isOverlap=gx>=mainW||gy>=mainH;
            if(isOverlap){
               pdf.setGState(new pdf.GState({opacity:0.4}));
               pdf.setFillColor(200, 200, 200); // light grey backdrop for overlaps
               pdf.rect(px3,py3,cellMM,cellMM,"F");
            }

            // Draw empty grid square background and border
            if(!m||m.id==="__skip__"||m.id==="__empty__"){
               pdf.setDrawColor(220);
               pdf.rect(px3,py3,cellMM,cellMM,"S");
               if(isOverlap){pdf.setGState(new pdf.GState({opacity:1.0}));}
               continue;
            }

            let info=cmap[m.id];
            let isDone = done && done[cellIdx];

            if(!isBackstitchOnly) {
              if(displayMode==="color_symbol"||displayMode==="color"){
                pdf.setFillColor(m.rgb[0],m.rgb[1],m.rgb[2]);
                pdf.rect(px3,py3,cellMM,cellMM,"F");
              } else if(displayMode==="symbol"){
                pdf.setFillColor(255,255,255);
                pdf.rect(px3,py3,cellMM,cellMM,"F");
              }
              if (isDone) {
                  // Fade out completed stitches by overlaying white
                  pdf.setGState(new pdf.GState({opacity:0.6}));
                  pdf.setFillColor(255,255,255);
                  pdf.rect(px3,py3,cellMM,cellMM,"F");
                  pdf.setGState(new pdf.GState({opacity:1.0}));
              }
            }
            pdf.setDrawColor(isBackstitchOnly ? 220 : (displayMode==="symbol"?150:200));
            pdf.rect(px3,py3,cellMM,cellMM,"S");
            if(!isBackstitchOnly && info){
              if(displayMode==="color_symbol"||displayMode==="symbol"){
                let isLight = displayMode==="color_symbol"&&luminance(m.rgb)<=128;
                let cV = isLight ? 255 : 0;
                if(isDone) cV = 200;
                pdf.setTextColor(cV);
                pdf.setDrawColor(cV);
                pdf.setFillColor(cV);
                if(typeof drawPDFSymbol==='function'){
                  drawPDFSymbol(pdf, info.symbol, px3+cellMM/2, py3+cellMM/2, cellMM);
                } else {
                  pdf.setFontSize(5);
                  pdf.text(info.symbol,px3+cellMM/2,py3+cellMM*0.7,{align:"center"});
                }
              }
            }
            if(isOverlap){pdf.setGState(new pdf.GState({opacity:1.0}));}
          }
        }

        pdf.setDrawColor(80);pdf.setLineWidth(0.2);
        for(let gx2=0;gx2<=dW;gx2++) {
          if (gx2 % 10 === 0) {
            pdf.line(mg+gx2*cellMM,mg+8,mg+gx2*cellMM,mg+8+dH*cellMM);
            if(gx2 < dW || x0+gx2 === sW) {
              pdf.setFontSize(6);pdf.setTextColor(150);
              pdf.text(String(x0+gx2+1), mg+gx2*cellMM, mg+7, {align:"center"});
            }
          }
        }
        if (dW % 10 !== 0) {
          pdf.line(mg+dW*cellMM,mg+8,mg+dW*cellMM,mg+8+dH*cellMM);
        }
        for(let gy2=0;gy2<=dH;gy2++) {
          if (gy2 % 10 === 0) {
            pdf.line(mg,mg+8+gy2*cellMM,mg+dW*cellMM,mg+8+gy2*cellMM);
            if(gy2 < dH || y0+gy2 === sH) {
              pdf.setFontSize(6);pdf.setTextColor(150);
              pdf.text(String(y0+gy2+1), mg-1, mg+8+gy2*cellMM+1, {align:"right"});
            }
          }
        }
        if (dH % 10 !== 0) {
          pdf.line(mg,mg+8+dH*cellMM,mg+dW*cellMM,mg+8+dH*cellMM);
        }

        if (overlapRight > 0) {
          pdf.setLineWidth(0.3);
          pdf.setDrawColor(120, 120, 120);
          pdf.setLineDash([2, 2]);
          pdf.line(mg+mainW*cellMM,mg+8,mg+mainW*cellMM,mg+8+dH*cellMM);
          pdf.setLineDash([]);
        }
        if (overlapBottom > 0) {
          pdf.setLineWidth(0.3);
          pdf.setDrawColor(120, 120, 120);
          pdf.setLineDash([2, 2]);
          pdf.line(mg,mg+8+mainH*cellMM,mg+dW*cellMM,mg+8+mainH*cellMM);
          pdf.setLineDash([]);
        }

        if (bsLines && bsLines.length > 0) {
          pdf.setLineWidth(0.6);
          pdf.setDrawColor(0,0,0);
          bsLines.forEach(ln => {
            let clipped = clipLine(ln.x1, ln.y1, ln.x2, ln.y2, x0, y0, x0+dW, y0+dH);
            if (clipped) {
              pdf.line(mg+(clipped[0]-x0)*cellMM, mg+8+(clipped[1]-y0)*cellMM,
                       mg+(clipped[2]-x0)*cellMM, mg+8+(clipped[3]-y0)*cellMM);
            }
          });
        }

        pdf.setDrawColor(0);pdf.setLineWidth(0.4);
        pdf.rect(mg,mg+8,dW*cellMM,dH*cellMM,"S");

        // Draw center marks if this page contains the center lines
        pdf.setFillColor(0);
        let centerX = Math.floor(sW/2);
        let centerY = Math.floor(sH/2);

        // Top/Bottom Center Marks
        if (centerX >= x0 && centerX < x0+dW) {
            let cx = mg + (centerX - x0) * cellMM + (cellMM/2);
            // Top margin mark (if top row of pages)
            if (py2 === 0) {
                pdf.triangle(cx, mg+8-3, cx-2, mg+8-6, cx+2, mg+8-6, "F");
            }
            // Bottom margin mark (if bottom row of pages)
            if (py2 === pagesY-1 && mainH === dH) { // only if no bottom overlap
                let bY = mg+8 + dH*cellMM;
                pdf.triangle(cx, bY+3, cx-2, bY+6, cx+2, bY+6, "F");
            }
        }

        // Left/Right Center Marks
        if (centerY >= y0 && centerY < y0+dH) {
            let cy = mg+8 + (centerY - y0) * cellMM + (cellMM/2);
            // Left margin mark (if left column of pages)
            if (px2 === 0) {
                pdf.triangle(mg-3, cy, mg-6, cy-2, mg-6, cy+2, "F");
            }
            // Right margin mark (if right column of pages)
            if (px2 === pagesX-1 && mainW === dW) { // only if no right overlap
                let rX = mg + dW*cellMM;
                pdf.triangle(rX+3, cy, rX+6, cy-2, rX+6, cy+2, "F");
            }
        }
      }
    }
  }

  drawChartPages(false);
  if (bsLines && bsLines.length > 0) {
    drawChartPages(true);
  }

  pdf.save("cross-stitch-progress.pdf");
}

function saveProject(){
  if(!pat||!pal)return;
  if(!projectName){
    setNamePromptOpen(true);
    return;
  }
  doSaveProject(projectName);
}

function handleEditInCreator(){
  if(!pat||!pal)return;
  if(onSwitchToDesign){
    // Build a fresh snapshot so name/session changes that haven't auto-saved yet are included
    const project=buildSnapshot();
    if(project){
      lastSnapshotRef.current=project;
      saveProjectToDB(project).catch(e => { console.error('Save failed:', e); try { window.Toast && window.Toast.show && window.Toast.show({message: 'Could not save progress \u2014 your changes may not persist. Try downloading a backup.', type: 'error'}); } catch(_){} });
      ProjectStorage.save(project).then(id=>ProjectStorage.setActiveProject(id)).catch(e => { console.error('Save failed:', e); try { window.Toast && window.Toast.show && window.Toast.show({message: 'Could not save progress \u2014 your changes may not persist. Try downloading a backup.', type: 'error'}); } catch(_){} });
      // Push ALL tracker-specific fields to Creator so its auto-save doesn't overwrite them
      try{
        if(typeof window.__updateCreatorTrackerFields==='function'){
          var _v3h=v3FieldsRef.current||{};
          window.__updateCreatorTrackerFields({
            statsSessions:project.statsSessions, statsSettings:project.statsSettings,
            achievedMilestones:project.achievedMilestones, doneSnapshots:project.doneSnapshots,
            breadcrumbs:project.breadcrumbs, stitchingStyle:project.stitchingStyle,
            blockW:project.blockW, blockH:project.blockH, focusBlock:project.focusBlock,
            startCorner:project.startCorner, colourSequence:project.colourSequence,
            originalPaletteState:project.originalPaletteState,
            singleStitchEdits:project.singleStitchEdits,
            halfStitches:project.halfStitches, halfDone:project.halfDone,
            finishStatus:_v3h.finishStatus, startedAt:_v3h.startedAt,
            lastTouchedAt:_v3h.lastTouchedAt, completedAt:_v3h.completedAt,
            stitchLog:_v3h.stitchLog
          });
        }
      }catch(e){}
    }
    // Sync the current project name to the Creator so it doesn't overwrite with stale name
    if(typeof window.__setCreatorProjectName==='function') window.__setCreatorProjectName(projectName||'');
    onSwitchToDesign();
    return;
  }
  const sseArrH=[...singleStitchEdits.entries()];
  const hsArrH=[...halfStitches.entries()].map(([idx,hs])=>[idx,{fwd:hs.fwd?{id:hs.fwd.id,rgb:hs.fwd.rgb}:undefined,bck:hs.bck?{id:hs.bck.id,rgb:hs.bck.rgb}:undefined}]);
  const hdArrH=[...halfDone.entries()];
  let project={version:9,id:projectIdRef.current||undefined,page:"tracker",name:projectName,createdAt:createdAtRef.current||new Date().toISOString(),updatedAt:new Date().toISOString(),settings:{sW,sH,maxC:pal.length,bri:0,con:0,sat:0,dith:false,skipBg:false,bgTh:15,bgCol:"var(--surface)",minSt:0,arLock:true,ar:1,fabricCt,skeinPrice,stitchSpeed,smooth:0,smoothType:"median",orphans:0},pattern:pat.map(m=>(m.id==="__skip__"||m.id==="__empty__")?{id:m.id}:{id:m.id,type:m.type,rgb:m.rgb}),bsLines,done:done?Array.from(done):null,parkMarkers,hlRow,hlCol,threadOwned,imgData:null,originalPaletteState,singleStitchEdits:sseArrH,halfStitches:hsArrH,halfDone:hdArrH,statsSessions,statsSettings,achievedMilestones,doneSnapshots,breadcrumbs,stitchingStyle,blockW,blockH,focusBlock,startCorner,colourSequence};
  try{
    localStorage.setItem("crossstitch_handoff_to_creator", JSON.stringify(project));
    window.location.href = "create.html?source=tracker";
  }catch(e){
    try{
      let str = JSON.stringify(project);
      let compressed = pako.deflate(str);
      let binaryStr = "";
      for (let i=0; i<compressed.length; i++) binaryStr += String.fromCharCode(compressed[i]);
      let b64 = btoa(binaryStr).replace(/\+/g, "-").replace(/\//g, "_");
      if (b64.length > 8000) {
          alert("Pattern too large for direct transfer. Please use Save Project (.json) instead and load it in the Creator.");
          return;
      }
      window.location.href = "index.html#p=" + b64;
    }catch(e2){
      alert("Pattern is too large for direct transfer. Please save the file and open it in the Creator.");
    }
  }
}


function handleSymbolReassignment(oldColorId, newThread) {
  if (!pat || !pal || !cmap) return;

  // 1. Snapshot for undo — V2 single-level undoSnapshot
  const currentPalState = deepClone(pal); // PERF (perf-6 #5): deepClone > JSON round-trip
  const currentThreadOwnedState = deepClone(threadOwned); // PERF (perf-6 #5)
  setUndoSnapshot({ type:"bulk_reassignment", pal: currentPalState, threadOwned: currentThreadOwnedState, oldId: oldColorId, newId: newThread.id });

  // 2. Map grid values
  const newPat = pat.map(cell => {
    if (cell.id === oldColorId) {
      return {
        ...cell,
        id: newThread.id,
        name: newThread.name,
        rgb: newThread.rgb,
        lab: newThread.lab || cell.lab
      };
    }
    return cell;
  });

  // 3. Update palette
  const oldPalEntry = pal.find(p => p.id === oldColorId);
  const newPal = pal.map(p => {
    if (p.id === oldColorId) {
      return {
        ...p,
        id: newThread.id,
        name: newThread.name,
        rgb: newThread.rgb,
        lab: newThread.lab || p.lab,
        // keep symbol and count
      };
    }
    return p;
  });

  // 4. Update cmap
  const newCmap = {};
  newPal.forEach(p => { newCmap[p.id] = p; });

  // 5. Update thread owned status map to move the status if any
  if (threadOwned[oldColorId]) {
    setThreadOwned(prev => {
      const next = { ...prev };
      next[newThread.id] = prev[oldColorId];
      delete next[oldColorId];
      return next;
    });
  }

  setPat(newPat);
  setPal(newPal);
  setCmap(newCmap);
}

function processLoadedProject(project){
  if(!project){console.error("processLoadedProject called with null/undefined");return;}
  let s=project.settings||{};
  setSW(project.w||s.sW||project.settings?.w||80);
  setSH(project.h||s.sH||project.settings?.h||80);
  setBsLines(project.bsLines||project.bs||[]);
  if(s.fabricCt)setFabricCt(s.fabricCt);
  else if(project.fc)setFabricCt(project.fc);
  if(s.skeinPrice!=null)setSkeinPrice(s.skeinPrice);
  if(s.stitchSpeed)setStitchSpeed(s.stitchSpeed);

  let p = project.pattern || project.p;
  if(!p){console.error("processLoadedProject: missing pattern data");return;}
  let restored;

  setIsEditMode(false);
  setUndoSnapshot(null);
  setSingleStitchEdits(new Map());
  setCellEditPopover(null);
  setSessionStartSnapshot(null);
  setEditModalColor(null);

  if (project.v === 8 || project.p) {
    // Compressed URL format
     restored = p.map(m => {
        if(m[1] === 'k') return restoreStitch({id:"__skip__"});
        if(m[1] === 'b') return restoreStitch({type:"blend",id:m[0]});
        return restoreStitch({type:"solid",id:m[0]});
     });
  } else {
    // Normal JSON format
    restored=p.map(restoreStitch);
  }

  let{pal:newPal,cmap:newCmap}=buildPalette(restored);
  setPat(restored);setPal(newPal);setCmap(newCmap);
  if (project.originalPaletteState) {
    setOriginalPaletteState(project.originalPaletteState);
  } else {
    setOriginalPaletteState(deepClone(newPal)); // PERF (perf-6 #5)
  }
  // V2: restore sparse diff of single-stitch edits
  if (project.singleStitchEdits && project.singleStitchEdits.length > 0) {
    setSingleStitchEdits(new Map(project.singleStitchEdits));
  }
  // V9: restore half stitch data
  if (project.halfStitches && project.halfStitches.length > 0) {
    const hsMap = new Map();
    project.halfStitches.forEach(([idx, hs]) => {
      const entry = {};
      if (hs.fwd) {
        const restored = restoreStitch({ id: hs.fwd.id, type: hs.fwd.id.includes('+') ? 'blend' : 'solid', rgb: hs.fwd.rgb });
        entry.fwd = { id: restored.id, rgb: restored.rgb, lab: restored.lab, name: restored.name, type: restored.type };
      }
      if (hs.bck) {
        const restored = restoreStitch({ id: hs.bck.id, type: hs.bck.id.includes('+') ? 'blend' : 'solid', rgb: hs.bck.rgb });
        entry.bck = { id: restored.id, rgb: restored.rgb, lab: restored.lab, name: restored.name, type: restored.type };
      }
      hsMap.set(idx, entry);
    });
    setHalfStitches(hsMap);
  } else {
    setHalfStitches(new Map());
  }
  if (project.halfDone && project.halfDone.length > 0) {
    setHalfDone(new Map(project.halfDone));
  } else {
    setHalfDone(new Map());
  }
  setSelectedColorId(null);setFocusColour(null);setTrackHistory([]);setRedoStack([]);
  if(project.settings && project.settings.pdfSettings) setPdfSettings(project.settings.pdfSettings);
  setThreadOwned(project.threadOwned||{});
  if(project.done&&project.done.length===restored.length)setDone(new Uint8Array(project.done));
  else setDone(new Uint8Array(restored.length));

  setParkMarkers(project.parkMarkers||[]);
  setBreadcrumbs(project.breadcrumbs||[]);
  // Preserve v3 stats fields through auto-save round-trips
  v3FieldsRef.current={finishStatus:project.finishStatus,startedAt:project.startedAt,lastTouchedAt:project.lastTouchedAt,completedAt:project.completedAt,stitchLog:project.stitchLog};
  if(project.stitchingStyle)setStitchingStyle(project.stitchingStyle);
  if(project.blockW)setBlockW(Math.max(5,Math.min(100,project.blockW)));
  if(project.blockH)setBlockH(Math.max(5,Math.min(100,project.blockH)));
  if(project.focusBlock)setFocusBlock(project.focusBlock);else setFocusBlock(null);
  if(project.startCorner)setStartCorner(project.startCorner);
  if(project.colourSequence)setColourSequence(project.colourSequence);
  // Legacy migration: if no statsSessions but totalTime exists, create a synthetic session
  var rawStatsSessions=(project.statsSessions||[]).filter(function(s){
    if(!s)return false;
    if(s.startTime==null&&s.date==null)return true;
    if(s.startTime!=null){
      var t=new Date(s.startTime).getTime();
      if(Number.isNaN(t))return false;
    }
    return true;
  });
  if(rawStatsSessions.length===0&&project.totalTime>0){
    var legacyDone=project.done?Array.from(project.done).filter(function(v){return v===1;}).length:0;
    var normaliseSessionTime=(function(value){
      if(value==null||value==="")return null;
      var dt;
      if(typeof value==="number"&&Number.isFinite(value))dt=new Date(value);
      else if(typeof value==="string"){
        var trimmed=value.trim();
        if(!trimmed)return null;
        if(/^\d+$/.test(trimmed))dt=new Date(Number(trimmed));
        else dt=new Date(trimmed);
      }else if(value instanceof Date)dt=value;
      if(!dt||Number.isNaN(dt.getTime()))return null;
      return dt.toISOString();
    });
    var legacyCreatedAtIso=normaliseSessionTime(project.createdAt);
    var legacyUpdatedAtIso=normaliseSessionTime(project.updatedAt);
    // Use createdAt for the legacy session date so historical stitches are never
    // attributed to today.  Fall back to a date 24h in the past if createdAt is
    // missing or resolves to today's local date.
    var legacyDate=(function(){
      var src=legacyCreatedAtIso||legacyUpdatedAtIso;
      if(src){
        var d=src.slice(0,10);
        // Guard: if that date is today (local), push it back 24h
        var today=getStitchingDate(new Date(),0);
        if(d===today){var yest=new Date();yest.setDate(yest.getDate()-1);d=yest.getFullYear()+'-'+('0'+(yest.getMonth()+1)).slice(-2)+'-'+('0'+yest.getDate()).slice(-2);}
        return d;
      }
      var yest=new Date();yest.setDate(yest.getDate()-1);return yest.getFullYear()+'-'+('0'+(yest.getMonth()+1)).slice(-2)+'-'+('0'+yest.getDate()).slice(-2);
    })();
    var legacyStart=legacyCreatedAtIso||legacyUpdatedAtIso||(function(){var d=new Date();d.setDate(d.getDate()-1);return d.toISOString();}());
    rawStatsSessions=[{
      id:'sess_legacy',
      date:legacyDate,
      startTime:legacyStart,
      endTime:legacyUpdatedAtIso||legacyStart,
      durationSeconds:project.totalTime,
      durationMinutes:Math.round(project.totalTime/60),
      stitchesCompleted:legacyDone,
      stitchesUndone:0,
      netStitches:legacyDone,
      totalAtEnd:legacyDone,
      percentAtEnd:0,
      note:'Migrated from legacy total time',
      coloursWorked:[],
    }];
  }
  // Patch legacy sessions that only have durationMinutes
  rawStatsSessions.forEach(function(s){if(s.durationSeconds==null&&s.durationMinutes!=null){s.durationSeconds=s.durationMinutes*60;}});
  // Backfill totalAtEnd for pre-v9 sessions that were saved without it.
  // Reconstruct as a running cumulative sum of netStitches sorted chronologically.
  if(rawStatsSessions.some(function(s){return s.totalAtEnd==null;})){
    var totalStitchCount=(project.pattern||[]).filter(function(c){return c&&c.id!=='__skip__'&&c.id!=='__empty__';}).length;
    var sorted=rawStatsSessions.slice().sort(function(a,b){
      var aKey=a.startTime||a.date||'';
      var bKey=b.startTime||b.date||'';
      var aTime=new Date(aKey).getTime();
      var bTime=new Date(bKey).getTime();
      if(!Number.isNaN(aTime)&&!Number.isNaN(bTime)){
        if(aTime<bTime)return-1;
        if(aTime>bTime)return 1;
        return 0;
      }
      if(aKey<bKey)return-1;
      if(aKey>bKey)return 1;
      return 0;
    });
    var running=0;
    sorted.forEach(function(s){running+=(s.netStitches||0);if(s.totalAtEnd==null)s.totalAtEnd=Math.min(Math.max(0,running),totalStitchCount);});
  }
  setStatsSessions(rawStatsSessions);
  // A3: fire the resume recap modal once per project load when there is at
  // least one prior session. Skipped on a fresh project (sessions empty) and
  // on the same project re-loading inside one mounted Tracker instance.
  try{
    var _pid=project.id||'__unsaved__';
    if(rawStatsSessions.length>0&&!resumeRecapShownRef.current.has(_pid)){
      resumeRecapShownRef.current.add(_pid);
      var _summary=(typeof lastSessionSummary==='function')?lastSessionSummary({statsSessions:rawStatsSessions}):null;
      if(_summary){
        var _last=rawStatsSessions[rawStatsSessions.length-1];
        var _totalSt=(project.pattern||[]).filter(function(c){return c&&c.id!=='__skip__'&&c.id!=='__empty__';}).length;
        var _doneSt=project.done?Array.from(project.done).filter(function(v){return v===1;}).length:0;
        setResumeRecap({
          projectName:project.name||'Untitled',
          summary:_summary,
          lastDate:_last&&(_last.date||_last.startTime)||null,
          totalSt:_totalSt,
          doneSt:_doneSt
        });
      }
    }
  }catch(_e){}
  setStatsSettings(Object.assign({dailyGoal:null,weeklyGoal:null,monthlyGoal:null,targetDate:null,dayEndHour:0,stitchingSpeedOverride:null,inactivityPauseSec:90,useActiveDays:true,sectionCols:50,sectionRows:50},project.statsSettings||{}));
  setStatsView(false);
  setCelebration(null);
  celebratedRef.current=new Set();
  goalCelebrationRef.current={daily:false,weekly:false,monthly:false};
  pendingMilestonesRef.current=[];
  currentAutoSessionRef.current=null;
  clearTimeout(autoIdleTimerRef.current);
  // Restore persisted milestones and seed celebratedRef so celebrations don't re-fire
  var persistedMilestones=project.achievedMilestones||[];
  setAchievedMilestones(persistedMilestones);
  persistedMilestones.forEach(function(m){var key=m.pct!=null?('pct_'+m.pct):m.label;celebratedRef.current.add(key);});
  // Restore done-state snapshots and reset the day-tracking ref
  setDoneSnapshots(project.doneSnapshots||[]);
  lastSnapshotDateRef.current=null;
  // Reset auto-session count refs so loading doesn't trigger a spurious session
  // justLoadedRef stays true until the stitch-delta effect has run at least once,
  // protecting against the sentinel being consumed by a halfStitchCounts change
  // before doneCount has been recomputed.
  justLoadedRef.current=true;
  justLoadedSettlePassRef.current=0;
  prevAutoCountRef.current={done:-1,halfDone:-1};
  if(project.hlRow>=0)setHlRow(project.hlRow);
  if(project.hlCol>=0)setHlCol(project.hlCol);
  setProjectName(project.name||"");
  setProjectDesigner(project.designer||"");
  setProjectDescription(project.description||"");
  projectIdRef.current = project.id || null;
  try{const saved=localStorage.getItem('cs_layerVis_'+(project.id||''));if(saved)setLayerVis(JSON.parse(saved));else setLayerVis(ALL_LAYERS_VISIBLE);}catch(_){setLayerVis(ALL_LAYERS_VISIBLE);}
  try{const saved=localStorage.getItem('cs_parkLayers_'+(project.id||''));setParkLayers(saved?JSON.parse(saved):{});}catch(_){setParkLayers({});}
  // Per-project legend overlay (sort + collapsed). When absent, the
  // current global UserPrefs default is left in place.
  try{const ls=localStorage.getItem('cs_legendSort_'+(project.id||''));if(ls)setLegendSort(ls);}catch(_){}
  try{const lc=localStorage.getItem('cs_legendCollapsed_'+(project.id||''));if(lc!==null)setLegendCollapsed(lc==='1');}catch(_){}
  const normalisedCreatedAt=(()=>{
    const value=project.createdAt;
    if(value==null||value==="")return null;
    if(typeof value==="number"&&Number.isFinite(value)){
      const dt=new Date(value);
      return Number.isNaN(dt.getTime())?null:dt.toISOString();
    }
    if(typeof value==="string"){
      const trimmed=value.trim();
      if(!trimmed)return null;
      const dt=new Date(trimmed);
      return Number.isNaN(dt.getTime())?null:dt.toISOString();
    }
    return null;
  })();
  createdAtRef.current=normalisedCreatedAt;

  if(project.savedZoom!=null){
    setTimeout(()=>{
      setStitchZoom(project.savedZoom);
      if(project.savedScroll&&stitchScrollRef.current){
        requestAnimationFrame(()=>{
          if(!stitchScrollRef.current)return;
          stitchScrollRef.current.scrollLeft=project.savedScroll.left;
          stitchScrollRef.current.scrollTop=project.savedScroll.top;
        });
      }
    },100);
  }else{
    setTimeout(()=>{
      let z=Math.min(3,Math.max(0.05,750/((project.w||s.sW||80)*20)));
      setStitchZoom(z);
    },100);
  }
}

function loadProject(e){
  let f=e.target.files[0];if(!f)return;
  setLoadError(null);
  setImportSuccess(null);

  const format = detectImportFormat(f);
  const baseName = f.name ? f.name.replace(/\.[^.]+$/, '') : '';

  if (format === "json") {
    let rd=new FileReader();
    rd.onload=ev=>{
      try{
        let project=JSON.parse(ev.target.result);
        const patternField = project.pattern || project.p;
        if(!patternField) throw new Error("Invalid pattern file: 'pattern' field missing or not an array");
        if(!Array.isArray(patternField)) throw new Error("Invalid pattern file: 'pattern' field missing or not an array");
        if(!project.id) project.id = ProjectStorage.newId();
        if(!project.createdAt) project.createdAt = new Date().toISOString();
        processLoadedProject(project);
        ProjectStorage.save(project).then(id => ProjectStorage.setActiveProject(id)).catch(err => console.error("JSON import save failed:", err));
      }catch(err){
        console.error(err);
        setLoadError("Could not load: "+err.message);
        setTimeout(()=>setLoadError(null),4000);
      }
    };
    rd.readAsText(f);
  } else if (format === "oxs") {
    let rd=new FileReader();
    rd.onload=ev=>{
      try{
        let result = parseOXS(ev.target.result);
        let project = importResultToProject(result, 14, baseName);
        const importedAt = Date.now();
        project.id = "proj_" + importedAt;
        if(!project.createdAt) project.createdAt = new Date(importedAt).toISOString();
        processLoadedProject(project);
        ProjectStorage.save(project).then(id => ProjectStorage.setActiveProject(id)).catch(err => console.error("Import save failed:", err));
        setImportSuccess(`Imported "${baseName || 'pattern'}" \u2014 ${result.width}\u00d7${result.height}, ${result.paletteSize} colours, ${result.stitchCount} stitches`);
      }catch(err){
        console.error(err);
        setLoadError("Could not load OXS: "+err.message);
        setTimeout(()=>setLoadError(null),4000);
      }
    };
    rd.readAsText(f);
  } else if (format === "image") {
    const MAX_FILE_SIZE = 5 * 1024 * 1024;
    if (f.size > MAX_FILE_SIZE) {
      setLoadError("File is too large. Please select an image under 5MB.");
      setTimeout(() => setLoadError(null), 4000);
      return;
    }
    let rd=new FileReader();
    rd.onload=ev=>{
      let img = new Image();
      img.onload = () => {
        setImportImage(img);
        setImportName(baseName);
        setImportFabricCt(14);
        setImportDialog("image");
      };
      img.onerror = () => {
        setLoadError("Could not load image.");
        setTimeout(()=>setLoadError(null),4000);
      };
      img.src = ev.target.result;
    };
    rd.readAsDataURL(f);
  } else if (format === "pdf") {
    setLoadError("Loading PDF library\u2026");
    const pdfReady = typeof window.loadPdfStack === 'function' ? window.loadPdfStack() : Promise.resolve();
    pdfReady.then(() => {
      setLoadError("Parsing PDF chart\u2026 This may take a moment.");
      const importer = new PatternKeeperImporter();
      return importer.import(f);
    }).then(project => {
      if (!project.name) project.name = baseName;
      processLoadedProject(project);
      ProjectStorage.save(project).then(id => ProjectStorage.setActiveProject(id)).catch(err => console.error("Import save failed:", err));
      setLoadError(null);
      const s = project.settings || {};
      const palCount = project.pattern ? new Set(project.pattern.filter(m => m && m.id !== '__skip__' && m.id !== '__empty__').map(m => m.id)).size : 0;
      const stitchCount = project.pattern ? project.pattern.filter(m => m && m.id !== '__skip__' && m.id !== '__empty__').length : 0;
      setImportSuccess(`Imported "${baseName || 'PDF chart'}" \u2014 ${s.sW||'?'}\u00d7${s.sH||'?'}, ${palCount} colours, ${stitchCount} stitches`);
    }).catch(err => {
      console.error(err);
      setLoadError("Could not load PDF: " + err.message);
      setTimeout(()=>setLoadError(null),4000);
    });
  } else {
    setLoadError("Unsupported file format. Please load .json, .oxs, .xml, .pdf, or image files.");
    setTimeout(()=>setLoadError(null),4000);
  }

  if(loadRef.current)loadRef.current.value="";
}

// When incomingProject prop changes (keepAlive: Creator passed a new project), reload.
useEffect(()=>{
  if(!incomingProject||incomingProject===incomingProjectRef.current)return;
  incomingProjectRef.current=incomingProject;
  if(incomingProject.project){
    processLoadedProject(incomingProject.project);
  }else if(incomingProject.id){
    // Called with {id} only (e.g. stats "Navigate to project") — load from storage.
    ProjectStorage.get(incomingProject.id).then(p=>{if(p)processLoadedProject(p);}).catch(err=>console.error("Failed to load project by id:",err));
  }
},[incomingProject]);

useEffect(() => {
  // Handle pending import file from HomeScreen
  if (window.__pendingTrackerImportFile) {
    const file = window.__pendingTrackerImportFile;
    delete window.__pendingTrackerImportFile;
    // Simulate a file input event for the existing loadProject handler
    const fakeEvt = { target: { files: [file] } };
    loadProject(fakeEvt);
    return;
  }
  // If a project was passed directly on first mount, use it (no DB read needed).
  if(incomingProjectRef.current){
    const ip=incomingProjectRef.current;
    if(ip.project){processLoadedProject(ip.project);}
    else if(ip.id){ProjectStorage.get(ip.id).then(p=>{if(p)processLoadedProject(p);}).catch(err=>console.error("Failed to load project by id:",err));}
    return;
  }
  const handoff = localStorage.getItem('crossstitch_handoff');
  if (handoff) {
    try {
      const projectData = JSON.parse(handoff);
      localStorage.removeItem('crossstitch_handoff');
      // Persist the incoming project so it survives beyond this one-shot key
      if (projectData.id) {
        ProjectStorage.save(projectData).then(id => ProjectStorage.setActiveProject(id)).catch(err => console.error("ProjectStorage save failed:", err));
      }
      processLoadedProject(projectData);
      return;
    } catch (e) {
      console.error("Failed to load handoff:", e);
    }
  }
    // Check URL hash for shared project
    const hash = window.location.hash.slice(1);
    if (hash.startsWith('p=')) {
        try {
            const encoded = hash.slice(2);
            // Replace base64url characters
            const base64 = encoded.replace(/-/g, '+').replace(/_/g, '/');
            const binaryStr = atob(base64);
            const binaryData = new Uint8Array(binaryStr.length);
            for (let i = 0; i < binaryStr.length; i++) {
                binaryData[i] = binaryStr.charCodeAt(i);
            }
            const decompressed = pako.inflate(binaryData, { to: 'string' });
            const project = JSON.parse(decompressed);
            processLoadedProject(project);
            window.location.hash = ''; // Clear hash after loading
            return;
        } catch (err) {
            console.error("Failed to load from URL:", err);
            setLoadError("Failed to load pattern from link.");
        }
    }
  // No handoff and no URL — restore last active project from ProjectStorage
  ProjectStorage.getActiveProject().then(project => {
    if (project && project.pattern && project.settings) {
      processLoadedProject(project);
    }
  }).catch(err => console.error("Failed to load active project:", err));
}, []);

// ═══ Tracker auto-save ═══
// Marks the project as dirty on every relevant state change but defers the
// expensive snapshot serialisation until the 5-second debounce timer fires.
// lastSnapshotRef is rebuilt lazily by buildSnapshot() for beforeunload.
const autoSaveDirtyRef = useRef(false);
const buildSnapshotRef = useRef(null);
const buildSnapshot = () => {
  if (!pat || !pal) return null;
  if (!projectIdRef.current) projectIdRef.current = ProjectStorage.newId();
  if (!createdAtRef.current) createdAtRef.current = new Date().toISOString();
  const sseArr = [...singleStitchEdits.entries()];
  const hsArr = [...halfStitches.entries()].map(([idx, hs]) => [idx, {
    fwd: hs.fwd ? { id: hs.fwd.id, rgb: hs.fwd.rgb } : undefined,
    bck: hs.bck ? { id: hs.bck.id, rgb: hs.bck.rgb } : undefined
  }]);
  const hdArr = [...halfDone.entries()];
  // Derive stitchLog from statsSessions (single source of truth).
  // Groups netStitches by date so stitchLog always matches what statsSessions says.
  const _logMap = {};
  (statsSessions || []).forEach(s => {
    if (!s || !s.date) return;
    _logMap[s.date] = (_logMap[s.date] || 0) + (s.netStitches || 0);
  });
  const _derivedLog = Object.entries(_logMap)
    .filter(([, c]) => c !== 0)
    .map(([date, count]) => ({ date, count }))
    .sort((a, b) => a.date < b.date ? -1 : 1);
  if (v3FieldsRef.current) v3FieldsRef.current.stitchLog = _derivedLog;
  return {
    version: 9, id: projectIdRef.current, page: "tracker", name: projectName,
    designer: projectDesigner, description: projectDescription,
    createdAt: createdAtRef.current, updatedAt: new Date().toISOString(),
    settings: { sW, sH, fabricCt, skeinPrice, stitchSpeed },
    // PERF (deferred-1): rgb-stripping serializer; see helpers.js / serializePattern.
    pattern: (window.PatternIO ? window.PatternIO.serializePattern(pat) : pat.map(m => (m.id === "__skip__" || m.id === "__empty__") ? { id: m.id } : { id: m.id, type: m.type, rgb: m.rgb })),
    bsLines, done: done ? Array.from(done) : null, parkMarkers,
    hlRow, hlCol, threadOwned, originalPaletteState,
    singleStitchEdits: sseArr, halfStitches: hsArr, halfDone: hdArr,
    statsSessions, statsSettings, achievedMilestones, doneSnapshots,
    savedZoom: stitchZoom,
    savedScroll: stitchScrollRef.current ? { left: stitchScrollRef.current.scrollLeft, top: stitchScrollRef.current.scrollTop } : null,
    breadcrumbs, stitchingStyle, blockW, blockH, focusBlock, startCorner, colourSequence,
    ...v3FieldsRef.current
  };
};
buildSnapshotRef.current = buildSnapshot;
useEffect(() => {
  if (!pat || !pal) return;
  autoSaveDirtyRef.current = true;
  const saveTimer = setTimeout(() => {
    if (!autoSaveDirtyRef.current) return;
    autoSaveDirtyRef.current = false;
    const project = buildSnapshot();
    if (!project) return;
    lastSnapshotRef.current = project;
    ProjectStorage.save(project).then(id => ProjectStorage.setActiveProject(id)).catch(err => console.error("Tracker auto-save failed:", err));
    saveProjectToDB(project).catch(err => console.error("Tracker DB auto-save failed:", err));
    // Keep the Creator's tracker-field preservation container in sync so that if
    // the user switches to Creator mode, the next Creator auto-save won't overwrite
    // sessions, stats settings, milestones, etc. with stale data.
    try{
      if(typeof window.__updateCreatorTrackerFields==='function'){
        var _v3=v3FieldsRef.current||{};
        window.__updateCreatorTrackerFields({
          statsSessions:project.statsSessions, statsSettings:project.statsSettings,
          achievedMilestones:project.achievedMilestones, doneSnapshots:project.doneSnapshots,
          breadcrumbs:project.breadcrumbs, stitchingStyle:project.stitchingStyle,
          blockW:project.blockW, blockH:project.blockH, focusBlock:project.focusBlock,
          startCorner:project.startCorner, colourSequence:project.colourSequence,
          originalPaletteState:project.originalPaletteState,
          singleStitchEdits:project.singleStitchEdits,
          halfStitches:project.halfStitches, halfDone:project.halfDone,
          finishStatus:_v3.finishStatus, startedAt:_v3.startedAt,
          lastTouchedAt:_v3.lastTouchedAt, completedAt:_v3.completedAt,
          stitchLog:_v3.stitchLog
        });
      }
      if(typeof window.__setCreatorProjectName==='function') window.__setCreatorProjectName(projectName||'');
    }catch(e){}
    if (typeof StashBridge !== "undefined" && skeinData.length > 0) {
      StashBridge.syncProjectToLibrary(
        projectIdRef.current,
        projectName || `${sW}×${sH} pattern`,
        skeinData,
        combinedDone >= combinedTotal && combinedTotal > 0 ? "completed" : "inprogress",
        fabricCt
      ).catch(err => console.error("Library sync failed:", err));
    }
  }, 5000);
  return () => clearTimeout(saveTimer);
}, [pat, pal, done, bsLines, parkMarkers, totalTime, hlRow, hlCol, threadOwned,
    halfStitches, halfDone, singleStitchEdits,
    sW, sH, fabricCt, skeinPrice, stitchSpeed, originalPaletteState, statsSessions, statsSettings, projectName, stitchZoom, doneSnapshots, achievedMilestones]);

// Save the freshest snapshot before the page unloads (best-effort fire-and-forget).
// Uses only refs so the handler is never stale; drag in-progress mutations are applied
// from dragChangesRef before saving.
useEffect(() => {
  const handleBeforeUnload = () => {
    try {
    isUnloadingRef.current = true;
    // Always build a fresh snapshot so we never use stale data
    let project = null;
    const fresh = buildSnapshotRef.current();
    if (fresh) { project = fresh; lastSnapshotRef.current = fresh; }
    if (!project) project = lastSnapshotRef.current;
    if (!project) return;
    let projectToSave = project;
    // If a drag is in progress, apply the pending in-place mutations to a fresh done copy
    if (dragStateRef.current.isDragging && dragChangesRef.current.length > 0) {
      const dVal = dragStateRef.current.dragVal;
      const freshDone = project.done ? project.done.slice() : null;
      if (freshDone) {
        for (const {idx} of dragChangesRef.current) freshDone[idx] = dVal;
      }
      projectToSave = { ...project, done: freshDone, updatedAt: new Date().toISOString() };
      dragChangesRef.current = [];
      dragStateRef.current.isDragging = false;
    }
    // Finalise any active auto-session and merge into the snapshot
    const finalisedSession = finaliseAutoSessionRef.current ? finaliseAutoSessionRef.current() : null;
    if (finalisedSession) {
      const existingSessions = Array.isArray(projectToSave.statsSessions) ? projectToSave.statsSessions : [];
      const hasSession = existingSessions.some(s => s && s.id === finalisedSession.id);
      if (!hasSession) {
        projectToSave = {
          ...projectToSave,
          statsSessions: [...existingSessions, finalisedSession],
          updatedAt: new Date().toISOString()
        };
      }
    }
    lastSnapshotRef.current = projectToSave;
    ProjectStorage.save(projectToSave)
      .then(id => ProjectStorage.setActiveProject(id))
      .catch(err => console.error("Tracker unload auto-save failed:", err));
    saveProjectToDB(projectToSave)
      .catch(err => console.error("Tracker DB unload auto-save failed:", err));
    } catch(e) {}
  };
  window.addEventListener("beforeunload", handleBeforeUnload);
  return () => window.removeEventListener("beforeunload", handleBeforeUnload);
}, []); // empty: handler reads only from refs (always fresh)

// Expose __openTrackerStats so the header Stats link can open per-project stats
// directly from the track page without navigating away.
useEffect(() => {
  window.__openTrackerStats = function() {
    setStatsTab(projectIdRef.current || 'all');
    setStatsView(true);
  };
  return () => { delete window.__openTrackerStats; };
}, []);

// Expose flush for BackupRestore to call before reading IndexedDB.
// Re-registered whenever relevant state changes so the function always builds
// a fresh snapshot rather than relying on a potentially stale ref.
useEffect(() => {
  window.__flushProjectToIDB = async function() {
    if (!pat || !pal) {
      const project = lastSnapshotRef.current;
      if (project) {
        await ProjectStorage.save(project);
        await saveProjectToDB(project).catch(e => { console.error('Save failed:', e); try { window.Toast && window.Toast.show && window.Toast.show({message: 'Could not save progress \u2014 your changes may not persist. Try downloading a backup.', type: 'error'}); } catch(_){} });
      }
      return;
    }
    const sseArr = [...singleStitchEdits.entries()];
    const hsArr = [...halfStitches.entries()].map(([idx, hs]) => [idx, {
      fwd: hs.fwd ? { id: hs.fwd.id, rgb: hs.fwd.rgb } : undefined,
      bck: hs.bck ? { id: hs.bck.id, rgb: hs.bck.rgb } : undefined
    }]);
    const hdArr = [...halfDone.entries()];
    const project = {
      ...(lastSnapshotRef.current || {}),
      version: 9, id: projectIdRef.current, page: "tracker", name: projectName,
      createdAt: createdAtRef.current,
      updatedAt: new Date().toISOString(),
      settings: { sW, sH, fabricCt, skeinPrice, stitchSpeed },
      // PERF (deferred-1): rgb-stripping serializer; see helpers.js / serializePattern.
      pattern: (window.PatternIO ? window.PatternIO.serializePattern(pat) : pat.map(m => (m.id === "__skip__" || m.id === "__empty__") ? { id: m.id } : { id: m.id, type: m.type, rgb: m.rgb })),
      bsLines, done: done ? Array.from(done) : null, parkMarkers,
      hlRow, hlCol, threadOwned, originalPaletteState,
      singleStitchEdits: sseArr, halfStitches: hsArr, halfDone: hdArr,
      statsSessions, statsSettings, achievedMilestones, doneSnapshots,
      savedZoom: stitchZoom,
      savedScroll: stitchScrollRef.current ? { left: stitchScrollRef.current.scrollLeft, top: stitchScrollRef.current.scrollTop } : null,
      breadcrumbs, stitchingStyle, blockW, blockH, focusBlock, startCorner, colourSequence
    };
    lastSnapshotRef.current = project;
    await ProjectStorage.save(project);
    await saveProjectToDB(project).catch(e => { console.error('Save failed:', e); try { window.Toast && window.Toast.show && window.Toast.show({message: 'Could not save progress \u2014 your changes may not persist. Try downloading a backup.', type: 'error'}); } catch(_){} });
  };
  return () => {
    // Replace with a snapshot-based fallback rather than deleting outright.
    // If a backup or sync flush is requested during the mode-switch gap before
    // the Creator registers its own handler, this ensures IDB is still written.
    var last = lastSnapshotRef.current;
    window.__flushProjectToIDB = async function() {
      if (last) {
        await ProjectStorage.save(last);
        await saveProjectToDB(last).catch(e => { console.error('Save failed:', e); try { window.Toast && window.Toast.show && window.Toast.show({message: 'Could not save progress \u2014 your changes may not persist. Try downloading a backup.', type: 'error'}); } catch(_){} });
      }
    };
  };
}, [projectName, sW, sH, fabricCt, skeinPrice, stitchSpeed, pat, pal, bsLines, done,
    halfStitches, halfDone, parkMarkers, totalTime, liveAutoElapsed, hlRow, hlCol,
    threadOwned, originalPaletteState, singleStitchEdits, statsSessions, statsSettings, achievedMilestones, stitchZoom, doneSnapshots,
    breadcrumbs, stitchingStyle, blockW, blockH, focusBlock, startCorner, colourSequence]);

// ── Zoom-adaptive tier helpers ──
// Compute rendering tier (1–4) from cell size with hysteresis.
// Thresholds — appear/disappear: T1↔T2 5px/3px, T2↔T3 13px/10px, T3↔T4 26px/22px
function computeDetailTier(cSz,cur){
  let t=cur;
  for(let i=0;i<4;i++){let n=t;if(t===1){if(cSz>=5)n=2;}else if(t===2){if(cSz<3)n=1;else if(cSz>=13)n=3;}else if(t===3){if(cSz<10)n=2;else if(cSz>=26)n=4;}else{if(cSz<22)n=3;}if(n===t)break;t=n;}
  return t;
}
// Symbol font size: Tier 3 (12–24px) scales 7→14px linearly; Tier 4 continues growing
function tierSymFontSz(cSz){
  if(cSz<=12)return 7;
  if(cSz<=24)return Math.round(7+(cSz-12)*7/12);
  return Math.round(14+(cSz-24)*0.5);
}

// ═══ Half-stitch cell rendering ═══
// Renders half-stitch triangle fills, diagonal lines, and symbols for one cell.
// Called from inside drawStitch and drawCellDirectly.
function _drawHalfStitchCell(ctx, px, py, cSz, hs, hd, cmap, view, focusColour, dimmed, lowZoom, medZoom, highZoom) {
  const dirs = ["fwd", "bck"];
  for (let di = 0; di < dirs.length; di++) {
    const dir = dirs[di];
    const stitch = hs[dir];
    if (!stitch) continue;
    const info = cmap ? cmap[stitch.id] : null;
    const isDn = hd[dir] ? true : false;
    const rgb = stitch.rgb;
    const isFiltered = view === "highlight" && focusColour;
    const matchesFilter = isFiltered && stitch.id === focusColour;
    const nonMatch = isFiltered && !matchesFilter;

    // Determine opacities based on view mode and done state
    let triAlpha, lineAlpha, lineWidth, showSymbol, symAlpha, symColor;

    if (view === "highlight" && isFiltered) {
      // Colour filter active
      if (matchesFilter) {
        triAlpha = 0.20;
        lineAlpha = 1.0;
        lineWidth = 2.5;
        showSymbol = true;
        symAlpha = 1.0;
        symColor = luminance(rgb) > 140 ? "rgba(0,0,0,0.9)" : "rgba(255,255,255,0.95)";
      } else {
        triAlpha = 0.04;
        lineAlpha = 0.10;
        lineWidth = 1;
        showSymbol = false;
        symAlpha = 0;
        symColor = "rgba(161,161,170,0.1)";
      }
    } else if (view === "highlight" && !isFiltered) {
      // Highlight mode, no filter — treat as tracker unmarked
      triAlpha = isDn ? 0.40 : 0.06;
      lineAlpha = isDn ? 1.0 : 0.28;
      lineWidth = isDn ? 2.5 : 1.5;
      showSymbol = !isDn;
      symAlpha = isDn ? 0 : 0.3;
      symColor = `rgba(${rgb[0]},${rgb[1]},${rgb[2]},0.3)`;
    } else if (view === "colour" || view === "symbol") {
      // Pattern chart view (designing/reading) — also used as tracker symbol/colour views
      triAlpha = isDn ? 0.40 : 0.12;
      lineAlpha = isDn ? 1.0 : 1.0;
      lineWidth = isDn ? 2.5 : 2;
      showSymbol = !isDn && view === "symbol";
      symAlpha = 1.0;
      symColor = `rgb(${rgb[0]},${rgb[1]},${rgb[2]})`;
    } else {
      // Default fallback
      triAlpha = 0.12;
      lineAlpha = 1.0;
      lineWidth = 2;
      showSymbol = true;
      symAlpha = 1.0;
      symColor = `rgb(${rgb[0]},${rgb[1]},${rgb[2]})`;
    }

    // Apply greying for non-matching in highlight
    const drawRgb = nonMatch ? [161,161,170] : rgb;

    // Zoom-level thresholds
    if (lowZoom) {
      // Triangle fill only
      drawHalfTriangle(ctx, px, py, cSz, dir, drawRgb, triAlpha);
    } else if (medZoom) {
      // Triangle fill + diagonal line
      drawHalfTriangle(ctx, px, py, cSz, dir, drawRgb, triAlpha);
      drawHalfLine(ctx, px, py, cSz, dir, drawRgb, lineAlpha, lineWidth);
    } else {
      // Full detail: triangle + line + symbol
      drawHalfTriangle(ctx, px, py, cSz, dir, drawRgb, triAlpha);
      drawHalfLine(ctx, px, py, cSz, dir, drawRgb, lineAlpha, lineWidth);
      if (showSymbol && info && cSz >= 8) {
        const fs = Math.max(7, cSz * 0.45);
        drawHalfSymbol(ctx, px, py, cSz, dir, info.symbol, symColor, fs, "500");
      }
    }
  }
}

function drawStitch(ctx,cSz,viewportRect){
  let gut=G,dW=sW,dH=sH;

  // Determine effective tier and animated feature opacities
  const tier=lockDetailLevel?3:tierRef.current;
  const symAlpha=lockDetailLevel?1.0:tierFadeRef.current.symbolOpacity;
  const bsHsAlpha=lockDetailLevel?1.0:tierFadeRef.current.bsHsOpacity;

  ctx.fillStyle="#fff";
  ctx.fillRect(0,0,gut+dW*cSz+2,gut+dH*cSz+2);

  // Viewport culling: 20-cell overdraw buffer for smooth panning
  const OVERDRAW=Math.max(40,20*cSz);
  let startX=0,startY=0,endX=dW,endY=dH;
  if(viewportRect){
    startX=Math.max(0,Math.floor((viewportRect.left-gut-OVERDRAW)/cSz));
    startY=Math.max(0,Math.floor((viewportRect.top-gut-OVERDRAW)/cSz));
    endX=Math.min(dW,Math.ceil((viewportRect.right-gut+OVERDRAW)/cSz));
    endY=Math.min(dH,Math.ceil((viewportRect.bottom-gut+OVERDRAW)/cSz));
  }

  // Tier-aware font sizes
  const symPx=tierSymFontSz(cSz);
  const fSym=`bold ${symPx}px monospace`;
  const fCol=`bold ${Math.max(7,Math.round(symPx*0.92))}px monospace`;
  const fHlDim=`${Math.max(6,Math.round(cSz*0.45))}px monospace`;
  const fHlFocus=`bold ${symPx}px monospace`;
  ctx.textAlign="center";ctx.textBaseline="middle";

  // Half-stitch detail flags — driven by tier rather than raw zoom percentage
  const hsLowZoom=tier===2;   // Tier 2: triangle fill only
  const hsMedZoom=tier===3;   // Tier 3: triangle + diagonal line
  const hsHighZoom=tier>=4;   // Tier 4: full detail (tri + line + symbol)

  for(let y=startY;y<endY;y++){
    // R11 row mode: draw a subtle highlight under the current row before rendering cells.
    if(rowModeActive&&y===currentRow){ctx.fillStyle='rgba(37,99,235,0.07)';ctx.fillRect(gut+startX*cSz,gut+y*cSz,(endX-startX)*cSz,cSz);}
    for(let x=startX;x<endX;x++){
      let idx=y*sW+x,m=pat[idx];if(!m)continue;
      let info=(m.id==="__skip__"||m.id==="__empty__")?null:(cmap?cmap[m.id]:null);
      let px=gut+x*cSz,py=gut+y*cSz;
      let isDn=done&&done[idx];

      // ── Tier 1 fast path: flat color blocks, no symbols, no cell borders ──
      if(tier===1){
        if(m.id==="__skip__"||m.id==="__empty__"){ctx.fillStyle="#f0f4f8";ctx.fillRect(px,py,cSz,cSz);continue;}
        if(isDn||lowZoomFade<=0){ctx.fillStyle=`rgb(${m.rgb[0]},${m.rgb[1]},${m.rgb[2]})`;ctx.fillRect(px,py,cSz,cSz);}
        else{const f=lowZoomFade,inv=1-f,r2=Math.round(m.rgb[0]*inv+255*f),g2=Math.round(m.rgb[1]*inv+255*f),b2=Math.round(m.rgb[2]*inv+255*f);ctx.fillStyle=`rgb(${r2},${g2},${b2})`;ctx.fillRect(px,py,cSz,cSz);}
        continue;
      }

      let dimmed=stitchView==="highlight"&&focusColour&&m.id!==focusColour&&m.id!=="__skip__"&&m.id!=="__empty__";
      const effectiveDimmed=dimmed&&highlightMode!=="outline"&&highlightMode!=="tint";
      const dimR=Math.round(255-(255-m.rgb[0])*trackerDimLevel),dimG=Math.round(255-(255-m.rgb[1])*trackerDimLevel),dimB=Math.round(255-(255-m.rgb[2])*trackerDimLevel);
      const dimFill=effectiveDimmed?`rgb(${dimR},${dimG},${dimB})`:'#EFE7D6';
      if(m.id==="__skip__"||m.id==="__empty__"){drawCk(ctx,px,py,cSz);if(cSz>=4){ctx.strokeStyle=m.id==="__empty__"?"rgba(220,50,50,0.25)":"rgba(0,0,0,0.06)";ctx.strokeRect(px,py,cSz,cSz);}
        let hs=halfStitches.get(idx);
        if(hs&&layerVis.half&&bsHsAlpha>0.01){
          let hd=halfDone.get(idx)||{};
          ctx.save();ctx.globalAlpha=bsHsAlpha;
          _drawHalfStitchCell(ctx,px,py,cSz,hs,hd,cmap,stitchView,focusColour,false,hsLowZoom,hsMedZoom,hsHighZoom);
          ctx.restore();
        }
        continue;
      }
      if(layerVis.full){
      if(stitchView==="symbol"){
        if(isDn){ctx.fillStyle="#D5E5C8";ctx.fillRect(px,py,cSz,cSz);}
        else{ctx.fillStyle="#fff";ctx.fillRect(px,py,cSz,cSz);if(info&&symAlpha>0.01){ctx.save();ctx.globalAlpha=symAlpha;ctx.fillStyle="#1B1814";ctx.font=fSym;ctx.fillText(info.symbol,px+cSz/2,py+cSz/2);ctx.restore();}}
      }else if(stitchView==="colour"){
        ctx.fillStyle=`rgb(${m.rgb[0]},${m.rgb[1]},${m.rgb[2]})`;ctx.fillRect(px,py,cSz,cSz);
        if(!isDn&&info&&symAlpha>0.01){ctx.save();ctx.globalAlpha=symAlpha;ctx.fillStyle=luminance(m.rgb)>140?"rgba(0,0,0,0.8)":"rgba(255,255,255,0.95)";ctx.font=fCol;ctx.fillText(info.symbol,px+cSz/2,py+cSz/2);ctx.restore();}
      }else if(highlightMode==="outline"||highlightMode==="tint"){
        ctx.fillStyle=`rgb(${m.rgb[0]},${m.rgb[1]},${m.rgb[2]})`;ctx.fillRect(px,py,cSz,cSz);
        if(!isDn&&info&&symAlpha>0.01){ctx.save();ctx.globalAlpha=symAlpha;ctx.fillStyle=luminance(m.rgb)>140?"rgba(0,0,0,0.8)":"rgba(255,255,255,0.95)";ctx.font=fCol;ctx.fillText(info.symbol,px+cSz/2,py+cSz/2);ctx.restore();}
        if(highlightMode==="tint"&&focusColour&&m.id===focusColour){const tr=parseInt(tintColor.slice(1,3),16),tg=parseInt(tintColor.slice(3,5),16),tb=parseInt(tintColor.slice(5,7),16);ctx.fillStyle=`rgba(${tr},${tg},${tb},${tintOpacity})`;ctx.fillRect(px,py,cSz,cSz);}
      }else if(highlightMode==="spotlight"){
        if(dimmed){ctx.fillStyle="#e8ecf0";ctx.fillRect(px,py,cSz,cSz);}
        else{ctx.fillStyle=`rgb(${m.rgb[0]},${m.rgb[1]},${m.rgb[2]})`;ctx.fillRect(px,py,cSz,cSz);if(!isDn&&info&&symAlpha>0.01){ctx.save();ctx.globalAlpha=symAlpha;ctx.fillStyle=luminance(m.rgb)>140?"rgba(0,0,0,0.8)":"rgba(255,255,255,0.95)";ctx.font=fCol;ctx.fillText(info.symbol,px+cSz/2,py+cSz/2);ctx.restore();}if(cSz>=4){const lum2=luminance(m.rgb);ctx.strokeStyle=lum2>140?"rgba(26,26,46,0.85)":"rgba(255,255,255,0.85)";ctx.lineWidth=1.5;ctx.strokeRect(px+0.75,py+0.75,cSz-1.5,cSz-1.5);ctx.lineWidth=1;}}
      }else{
        if(isDn){ctx.fillStyle=effectiveDimmed?dimFill:`rgb(${m.rgb[0]},${m.rgb[1]},${m.rgb[2]})`;ctx.fillRect(px,py,cSz,cSz);}
        else if(dimmed){ctx.fillStyle=dimFill;ctx.fillRect(px,py,cSz,cSz);if(symAlpha>0.01&&trackerDimLevel<0.25&&info&&cSz>=8){ctx.save();ctx.globalAlpha=symAlpha;ctx.fillStyle=`rgba(0,0,0,${Math.max(0.04,0.12-trackerDimLevel*0.4)})`;ctx.font=fHlDim;ctx.fillText(info.symbol,px+cSz/2,py+cSz/2);ctx.restore();}else if(symAlpha>0.01&&trackerDimLevel>=0.25&&info&&cSz>=8){ctx.save();ctx.globalAlpha=symAlpha;ctx.fillStyle=luminance(m.rgb)>140?'rgba(0,0,0,0.5)':'rgba(255,255,255,0.6)';ctx.font=fHlDim;ctx.fillText(info.symbol,px+cSz/2,py+cSz/2);ctx.restore();}}
        else{ctx.fillStyle=`rgba(${m.rgb[0]},${m.rgb[1]},${m.rgb[2]},0.25)`;ctx.fillRect(px,py,cSz,cSz);if(info&&symAlpha>0.01){ctx.save();ctx.globalAlpha=symAlpha;ctx.fillStyle="#1B1814";ctx.font=fHlFocus;ctx.fillText(info.symbol,px+cSz/2,py+cSz/2);ctx.restore();}}
      }
      // Tier 4: thread ID secondary label below the symbol (cell > 40px)
      if(tier>=4&&cSz>40&&info&&symAlpha>0.01&&m.id!=="__skip__"&&m.id!=="__empty__"){
        ctx.save();ctx.globalAlpha=symAlpha*0.7;ctx.fillStyle="rgba(100,116,139,1)";
        ctx.font=`${Math.max(6,Math.round(cSz*0.2))}px monospace`;ctx.textAlign="center";ctx.textBaseline="middle";
        ctx.fillText(m.id,px+cSz/2,py+cSz*0.8);ctx.restore();
      }
      } // end layerVis.full
      // Tier 4: stitch direction indicators on undone full-stitch cells (cell > 40px)
      if(tier>=4&&cSz>40&&m.id!=="__skip__"&&m.id!=="__empty__"&&!isDn&&layerVis.full){
        ctx.save();ctx.globalAlpha=0.1;ctx.strokeStyle="#333";ctx.lineWidth=0.8;
        const pd4=Math.max(2,cSz*0.12);
        ctx.beginPath();ctx.moveTo(px+pd4,py+cSz-pd4);ctx.lineTo(px+cSz-pd4,py+pd4);ctx.stroke();
        ctx.beginPath();ctx.moveTo(px+pd4,py+pd4);ctx.lineTo(px+cSz-pd4,py+cSz-pd4);ctx.stroke();
        ctx.restore();
      }
      // Render half stitches on top of full-stitch cells (faded at T1 boundary)
      let hs=halfStitches.get(idx);
      if(hs&&layerVis.half&&bsHsAlpha>0.01){
        let hd=halfDone.get(idx)||{};
        ctx.save();ctx.globalAlpha=bsHsAlpha;
        _drawHalfStitchCell(ctx,px,py,cSz,hs,hd,cmap,stitchView,focusColour,layerVis.full?effectiveDimmed:false,hsLowZoom,hsMedZoom,hsHighZoom);
        ctx.restore();
      }
      if(cSz>=4){ctx.strokeStyle=(effectiveDimmed&&layerVis.full)?"rgba(0,0,0,0.03)":"rgba(0,0,0,0.08)";ctx.strokeRect(px,py,cSz,cSz);}
    }
    // R11: dim rows outside the current row — one pass per row covers all tiers.
    if(rowModeActive&&y!==currentRow){ctx.fillStyle='rgba(255,255,255,0.55)';ctx.fillRect(gut+startX*cSz,gut+y*cSz,(endX-startX)*cSz,cSz);}
  }

  // Marching ants for "outline" highlight mode
  if(stitchView==="highlight"&&focusColour&&highlightMode==="outline"&&pat){
    ctx.save();
    let lumSum=0,lumCnt=0;
    for(let ay=startY;ay<endY;ay++){for(let ax=startX;ax<endX;ax++){const am=pat[ay*sW+ax];if(am&&am.id===focusColour){lumSum+=luminance(am.rgb);lumCnt++;}}}
    const avgLum=lumCnt>0?lumSum/lumCnt:128;
    const antColor=avgLum>140?"#1A1A2E":"#FFFFFF";
    const antBg=avgLum>140?"rgba(255,255,255,0.5)":"rgba(0,0,0,0.4)";
    const antsDash=Math.max(2,cSz*0.3),antsGap=Math.max(2,cSz*0.2);
    ctx.lineWidth=2;ctx.setLineDash([antsDash,antsGap]);
    const drawAntsPath=(offv)=>{ctx.lineDashOffset=offv;ctx.beginPath();
      for(let ay=startY;ay<endY;ay++){for(let ax=startX;ax<endX;ax++){const am=pat[ay*sW+ax];if(!am||am.id!==focusColour)continue;
        const apx=gut+ax*cSz,apy=gut+ay*cSz;
        if(ay===0||!pat[(ay-1)*sW+ax]||pat[(ay-1)*sW+ax].id!==focusColour){ctx.moveTo(apx,apy);ctx.lineTo(apx+cSz,apy);}
        if(ay===sH-1||!pat[(ay+1)*sW+ax]||pat[(ay+1)*sW+ax].id!==focusColour){ctx.moveTo(apx,apy+cSz);ctx.lineTo(apx+cSz,apy+cSz);}
        if(ax===0||!pat[ay*sW+ax-1]||pat[ay*sW+ax-1].id!==focusColour){ctx.moveTo(apx,apy);ctx.lineTo(apx,apy+cSz);}
        if(ax===sW-1||!pat[ay*sW+ax+1]||pat[ay*sW+ax+1].id!==focusColour){ctx.moveTo(apx+cSz,apy);ctx.lineTo(apx+cSz,apy+cSz);}
      }}ctx.stroke();};
    ctx.strokeStyle=antBg;drawAntsPath(-antsOffset);
    ctx.strokeStyle=antColor;drawAntsPath(-antsOffset+Math.floor(antsDash));
    ctx.setLineDash([]);ctx.restore();
  }

  // Grid lines — tier-adaptive
  if(tier===1){
    // Tier 1: only 10-block lines, subtle spatial reference
    ctx.lineWidth=1;
    for(let gx=startX;gx<=endX;gx++){if(gx%10!==0)continue;ctx.strokeStyle="rgba(204,204,204,0.4)";ctx.beginPath();ctx.moveTo(gut+gx*cSz,gut+startY*cSz);ctx.lineTo(gut+gx*cSz,gut+endY*cSz);ctx.stroke();}
    for(let gy=startY;gy<=endY;gy++){if(gy%10!==0)continue;ctx.strokeStyle="rgba(204,204,204,0.4)";ctx.beginPath();ctx.moveTo(gut+startX*cSz,gut+gy*cSz);ctx.lineTo(gut+endX*cSz,gut+gy*cSz);ctx.stroke();}
  }else{
    const gridOp=tier===2?0.30:tier===3?0.50:0.60;
    const grid10Op=tier===2?0.60:tier===3?0.90:1.0;
    const grid10Lw=tier>=4?2:1;
    for(let gx=startX;gx<=endX;gx++){
      const is10=gx%10===0,is5=gx%5===0;if(!is5&&!is10)continue;
      ctx.lineWidth=is10?grid10Lw:1;ctx.strokeStyle=is10?`rgba(68,68,68,${grid10Op})`:`rgba(170,170,170,${gridOp})`;
      ctx.beginPath();ctx.moveTo(gut+gx*cSz,gut+startY*cSz);ctx.lineTo(gut+gx*cSz,gut+endY*cSz);ctx.stroke();
    }
    for(let gy=startY;gy<=endY;gy++){
      const is10=gy%10===0,is5=gy%5===0;if(!is5&&!is10)continue;
      ctx.lineWidth=is10?grid10Lw:1;ctx.strokeStyle=is10?`rgba(68,68,68,${grid10Op})`:`rgba(170,170,170,${gridOp})`;
      ctx.beginPath();ctx.moveTo(gut+startX*cSz,gut+gy*cSz);ctx.lineTo(gut+endX*cSz,gut+gy*cSz);ctx.stroke();
    }
    ctx.lineWidth=1;
  }

  // Centre marks, crosshair, backstitch, park markers, border — always draw (cheap)
  if(showCtr){ctx.strokeStyle="rgba(200,60,60,0.3)";ctx.lineWidth=1.5;ctx.setLineDash([6,4]);ctx.beginPath();ctx.moveTo(gut+Math.floor(sW/2)*cSz,gut+startY*cSz);ctx.lineTo(gut+Math.floor(sW/2)*cSz,gut+endY*cSz);ctx.stroke();ctx.beginPath();ctx.moveTo(gut+startX*cSz,gut+Math.floor(sH/2)*cSz);ctx.lineTo(gut+endX*cSz,gut+Math.floor(sH/2)*cSz);ctx.stroke();ctx.setLineDash([]);}
  if(hlRow>=0&&hlCol>=0){ctx.strokeStyle="rgba(59,130,246,0.6)";ctx.lineWidth=2;ctx.setLineDash([]);if(hlRow>=startY&&hlRow<endY){ctx.beginPath();ctx.moveTo(gut+startX*cSz,gut+hlRow*cSz+cSz/2);ctx.lineTo(gut+endX*cSz,gut+hlRow*cSz+cSz/2);ctx.stroke();}if(hlCol>=startX&&hlCol<endX){ctx.beginPath();ctx.moveTo(gut+hlCol*cSz+cSz/2,gut+startY*cSz);ctx.lineTo(gut+hlCol*cSz+cSz/2,gut+endY*cSz);ctx.stroke();}}
  // Backstitch: hidden at Tier 1, forced 1px at Tier 2, user thickness at Tier 3+
  if(bsLines.length>0&&layerVis.backstitch&&bsHsAlpha>0.01){
    ctx.save();ctx.globalAlpha=bsHsAlpha;
    ctx.lineWidth=tier===2?1:bsThickness;ctx.lineCap="round";
    bsLines.forEach(ln=>{ctx.strokeStyle=ln.color||"#333";ctx.beginPath();ctx.moveTo(gut+ln.x1*cSz,gut+ln.y1*cSz);ctx.lineTo(gut+ln.x2*cSz,gut+ln.y2*cSz);ctx.stroke();});
    ctx.restore();
  }
  if(parkMarkers.length>0){parkMarkers.forEach(pm=>{
    // Multi-colour parking — Option C: skip markers whose colour layer
    // is hidden via the legend toggle.
    if(parkLayers[pm.colorId]===false)return;
    const corner=pm.corner||"BL";
    const px2=gut+pm.x*cSz,py2=gut+pm.y*cSz;
    const ts=Math.max(3,Math.min(cSz*0.4,10));
    let pts;
    if(corner==="TL")pts=[[px2,py2],[px2+ts,py2],[px2,py2+ts]];
    else if(corner==="TR")pts=[[px2+cSz,py2],[px2+cSz-ts,py2],[px2+cSz,py2+ts]];
    else if(corner==="BR")pts=[[px2+cSz,py2+cSz],[px2+cSz-ts,py2+cSz],[px2+cSz,py2+cSz-ts]];
    else pts=[[px2,py2+cSz],[px2+ts,py2+cSz],[px2,py2+cSz-ts]];
    ctx.fillStyle=`rgb(${pm.rgb[0]},${pm.rgb[1]},${pm.rgb[2]})`;
    ctx.strokeStyle="rgba(0,0,0,0.7)";ctx.lineWidth=1;
    ctx.beginPath();ctx.moveTo(pts[0][0],pts[0][1]);ctx.lineTo(pts[1][0],pts[1][1]);ctx.lineTo(pts[2][0],pts[2][1]);ctx.closePath();
    ctx.fill();ctx.stroke();
  });}
  ctx.strokeStyle="rgba(0,0,0,0.4)";ctx.lineWidth=2;ctx.strokeRect(gut,gut,dW*cSz,dH*cSz);ctx.lineWidth=1;
}

const renderStitch=useCallback(()=>{if(!pat||!cmap||!stitchRef.current)return;
  let canvas = stitchRef.current;
  if (canvas.width !== sW*scs+G+2 || canvas.height !== sH*scs+G+2) {
    canvas.width=sW*scs+G+2;canvas.height=sH*scs+G+2;
  }
  let viewportRect = null;
  if (stitchScrollRef.current) {
    viewportRect = {
      left: stitchScrollRef.current.scrollLeft,
      top: stitchScrollRef.current.scrollTop,
      width: stitchScrollRef.current.clientWidth,
      height: stitchScrollRef.current.clientHeight,
      right: stitchScrollRef.current.scrollLeft + stitchScrollRef.current.clientWidth,
      bottom: stitchScrollRef.current.scrollTop + stitchScrollRef.current.clientHeight
    };
  }
  drawStitch(canvas.getContext("2d"),scs,viewportRect);
},[pat,cmap,scs,sW,sH,showCtr,bsLines,done,parkMarkers,parkLayers,hlRow,hlCol,stitchView,focusColour,halfStitches,halfDone,stitchZoom,highlightMode,tintColor,tintOpacity,spotDimOpacity,antsOffset,trackerDimLevel,layerVis,bsThickness,lockDetailLevel,lowZoomFade]);
useEffect(()=>renderStitch(),[renderStitch]);
// Keep renderStitchRef current so animation callbacks always call the latest closure
useEffect(()=>{renderStitchRef.current=renderStitch;},[renderStitch]);
// Tier-change handler: compute new tier, animate feature opacities across boundaries
useEffect(()=>{
  const eff=lockDetailLevel?3:computeDetailTier(scs,tierRef.current);
  tierRef.current=eff;
  const tSym=eff>=3?1.0:0.0,tBsHs=eff>=2?1.0:0.0;
  const startSym=tierFadeRef.current.symbolOpacity,startBsHs=tierFadeRef.current.bsHsOpacity;
  if(tierFadeRef.current.animRafId){cancelAnimationFrame(tierFadeRef.current.animRafId);tierFadeRef.current.animRafId=null;}
  if(Math.abs(startSym-tSym)>=0.01||Math.abs(startBsHs-tBsHs)>=0.01){
    const durSym=tSym>startSym?200:150,durBsHs=tBsHs>startBsHs?200:150;
    const startMs=performance.now();
    const animate=()=>{
      const el=performance.now()-startMs;
      const tS=Math.min(1,el/durSym),tB=Math.min(1,el/durBsHs);
      tierFadeRef.current.symbolOpacity=startSym+(tSym-startSym)*tS;
      tierFadeRef.current.bsHsOpacity=startBsHs+(tBsHs-startBsHs)*tB;
      if(renderStitchRef.current)renderStitchRef.current();
      if(tS<1||tB<1){tierFadeRef.current.animRafId=requestAnimationFrame(animate);}
      else{tierFadeRef.current.animRafId=null;}
    };
    tierFadeRef.current.animRafId=requestAnimationFrame(animate);
  }
  return()=>{if(tierFadeRef.current.animRafId){cancelAnimationFrame(tierFadeRef.current.animRafId);tierFadeRef.current.animRafId=null;}};
},[scs,lockDetailLevel]);

// ═══ Thread usage overlay rendering ═══
useEffect(()=>{
  const canvas=threadUsageCanvasRef.current;
  if(!canvas)return;
  if(!analysisResult||!threadUsageMode||!pat){
    if(canvas.width>0){const ctx=canvas.getContext("2d");ctx.clearRect(0,0,canvas.width,canvas.height);}
    return;
  }
  const ps=analysisResult.perStitch;
  const W=analysisResult.sW,H=analysisResult.sH;
  if(!ps||W!==sW||H!==sH)return;
  const needW=W*scs+G+2,needH=H*scs+G+2;
  if(canvas.width!==needW||canvas.height!==needH){canvas.width=needW;canvas.height=needH;}
  cancelAnimationFrame(threadUsageRafRef.current);
  threadUsageRafRef.current=requestAnimationFrame(()=>{
    const ctx=canvas.getContext("2d");
    ctx.clearRect(0,0,canvas.width,canvas.height);
    for(let i=0;i<pat.length;i++){
      const cell=pat[i];
      if(!cell||cell.id==="__skip__"||cell.id==="__empty__")continue;
      const x=i%W,y=Math.floor(i/W);
      const px=G+x*scs,py=G+y*scs;
      let r=0,g=0,b=0,a=0;
      if(threadUsageMode==="distance"){
        const dist=ps.nearestDist[i];
        if(dist<=1.415)continue;
        else if(dist<=5){const t=(dist-1.415)/3.585;r=255;g=200;b=0;a=t*0.3;}
        else if(dist<=15){const t=(dist-5)/10;r=255;g=120;b=0;a=t*0.4;}
        else{r=220;g=40;b=40;a=0.4;}
      }else{
        const sz=ps.clusterSize[i];
        if(sz>=20)continue;
        else if(sz>=5){r=100;g=150;b=255;a=0.15;}
        else if(sz>=2){r=255;g=200;b=0;a=0.25;}
        else{r=220;g=40;b=40;a=0.40;}
      }
      if(a>0){ctx.fillStyle=`rgba(${r},${g},${b},${a})`;ctx.fillRect(px,py,scs,scs);}
    }
  });
  return()=>cancelAnimationFrame(threadUsageRafRef.current);
},[analysisResult,threadUsageMode,scs,pat,sW,sH]);

// ═══ Recommendation pulsing border animation ═══
const recPulseRef=useRef(null);
const recPulsePhaseRef=useRef(0);
const recOverlayCanvasRef=useRef(null);
useEffect(()=>{
  const canvas=recOverlayCanvasRef.current;
  if(!canvas)return;
  const draw=()=>{
    if(!recommendations||!recommendations.top||!recommendations.top.length||!recEnabled||!analysisResult){
      const ctx=canvas.getContext("2d");
      if(canvas.width>0)ctx.clearRect(0,0,canvas.width,canvas.height);
      return;
    }
    const W=analysisResult.sW,H=analysisResult.sH;
    const RS=analysisResult.regionSize||10;
    const needW=W*scs+G+2,needH=H*scs+G+2;
    if(canvas.width!==needW||canvas.height!==needH){canvas.width=needW;canvas.height=needH;}
    const ctx=canvas.getContext("2d");
    ctx.clearRect(0,0,canvas.width,canvas.height);
    const RC=analysisResult.regionCols||1;
    // phase cycles 0→1→0 at 2s period
    recPulsePhaseRef.current=(recPulsePhaseRef.current+0.016)%(Math.PI*2);
    const pulseAlpha=0.3+0.4*((Math.sin(recPulsePhaseRef.current)+1)/2);
    recommendations.top.forEach((rec,rank)=>{
      const rCol=rec.idx%RC,rRow=Math.floor(rec.idx/RC);
      const x=G+rCol*RS*scs,y=G+rRow*RS*scs;
      const w=Math.min(RS,W-rCol*RS)*scs,h=Math.min(RS,H-rRow*RS)*scs;
      if(rank===0){ctx.strokeStyle=`rgba(184, 92, 56,${pulseAlpha})`;ctx.lineWidth=3;}
      else{ctx.strokeStyle="rgba(184, 92, 56,0.2)";ctx.lineWidth=2;}
      ctx.strokeRect(x+1,y+1,w-2,h-2);
    });
  };
  const loop=()=>{draw();recPulseRef.current=requestAnimationFrame(loop);};
  loop();
  return()=>cancelAnimationFrame(recPulseRef.current);
},[recommendations,recEnabled,analysisResult,scs,sW,sH]);

// ═══ Focus area three-zone dimming overlay ═══
useEffect(()=>{
  const canvas=focusOverlayCanvasRef.current;
  if(!canvas)return;
  if(!focusBlock||!focusEnabled||stitchingStyle==="crosscountry"){
    const ctx=canvas.getContext("2d");if(canvas.width>0)ctx.clearRect(0,0,canvas.width,canvas.height);
    return;
  }
  const needW=sW*scs+G+2,needH=sH*scs+G+2;
  if(canvas.width!==needW||canvas.height!==needH){canvas.width=needW;canvas.height=needH;}
  const ctx=canvas.getContext("2d");
  ctx.clearRect(0,0,canvas.width,canvas.height);
  // Full-canvas dim (94% opacity → pattern shows at 6% brightness)
  ctx.fillStyle="rgba(241,245,249,0.94)";ctx.fillRect(0,0,canvas.width,canvas.height);
  const bCols=Math.ceil(sW/blockW),bRows=Math.ceil(sH/blockH);
  const{bx,by}=focusBlock;
  // Cut out neighbour blocks (raise to ~40% brightness)
  ctx.save();ctx.globalCompositeOperation="destination-out";
  for(let dy=-1;dy<=1;dy++){for(let dx=-1;dx<=1;dx++){
    if(dx===0&&dy===0)continue;
    const nbx=bx+dx,nby=by+dy;
    if(nbx<0||nbx>=bCols||nby<0||nby>=bRows)continue;
    let op=0.54; // default: raises from 6% to ~40%
    if(stitchingStyle==="royal"){const ROYAL_OP={"0,1":0.88,"1,0":0.81};op=ROYAL_OP[dx+","+dy]??0.31;}
    ctx.globalAlpha=op;ctx.fillStyle="black";
    const nx=G+nbx*blockW*scs,ny=G+nby*blockH*scs;
    const nw=Math.min(blockW,sW-nbx*blockW)*scs,nh=Math.min(blockH,sH-nby*blockH)*scs;
    ctx.fillRect(nx,ny,nw,nh);
  }}
  // Fully clear focus block (100% brightness)
  ctx.globalAlpha=1;
  const fx=G+bx*blockW*scs,fy=G+by*blockH*scs;
  const fw=Math.min(blockW,sW-bx*blockW)*scs,fh=Math.min(blockH,sH-by*blockH)*scs;
  ctx.fillRect(fx,fy,fw,fh);
  ctx.restore();
  // Focus block border
  ctx.strokeStyle="rgba(184, 92, 56,0.9)";ctx.lineWidth=2;ctx.strokeRect(fx+1,fy+1,fw-2,fh-2);
  // Neighbour dashed borders
  for(let dy=-1;dy<=1;dy++){for(let dx=-1;dx<=1;dx++){
    if(dx===0&&dy===0)continue;
    const nbx=bx+dx,nby=by+dy;
    if(nbx<0||nbx>=bCols||nby<0||nby>=bRows)continue;
    const nx=G+nbx*blockW*scs,ny=G+nby*blockH*scs;
    const nw=Math.min(blockW,sW-nbx*blockW)*scs,nh=Math.min(blockH,sH-nby*blockH)*scs;
    ctx.strokeStyle="rgba(184, 92, 56,0.25)";ctx.lineWidth=1;
    ctx.setLineDash([3,3]);ctx.strokeRect(nx+0.5,ny+0.5,nw-1,nh-1);ctx.setLineDash([]);
  }}
},[focusBlock,focusEnabled,stitchingStyle,scs,sW,sH,blockW,blockH]);

// ═══ Breadcrumb trail overlay ═══
useEffect(()=>{
  const canvas=breadcrumbCanvasRef.current;
  if(!canvas)return;
  if(!breadcrumbVisible||!breadcrumbs||breadcrumbs.length===0){
    const ctx=canvas.getContext("2d");if(canvas.width>0)ctx.clearRect(0,0,canvas.width,canvas.height);
    return;
  }
  const needW=sW*scs+G+2,needH=sH*scs+G+2;
  if(canvas.width!==needW||canvas.height!==needH){canvas.width=needW;canvas.height=needH;}
  const ctx=canvas.getContext("2d");
  ctx.clearRect(0,0,canvas.width,canvas.height);
  const TINTS=["59,130,246","20,184,166","139,92,246","234,88,12","22,163,74","225,29,72"];
  const curSessIdx=statsSessions?statsSessions.length:0;
  breadcrumbs.forEach(b=>{
    const fx=G+b.bx*blockW*scs,fy=G+b.by*blockH*scs;
    const fw=Math.min(blockW,sW-b.bx*blockW)*scs,fh=Math.min(blockH,sH-b.by*blockH)*scs;
    const tint=TINTS[b.sessionIdx%TINTS.length];
    const isCur=b.sessionIdx===curSessIdx;
    ctx.fillStyle=`rgba(${tint},${isCur?0.08:0.03})`;ctx.fillRect(fx,fy,fw,fh);
    ctx.strokeStyle=`rgba(${tint},${isCur?0.30:0.15})`;ctx.lineWidth=1;ctx.strokeRect(fx+0.5,fy+0.5,fw-1,fh-1);
    if(isCur&&scs>=8&&fw>=8&&fh>=8){
      ctx.fillStyle=`rgba(${tint},0.4)`;
      const fnt=Math.max(8,Math.min(12,Math.floor(Math.min(fw,fh)*0.5)));
      ctx.font=`${fnt}px sans-serif`;ctx.textAlign="center";ctx.textBaseline="middle";
      ctx.fillText(String(b.seqN),fx+fw/2,fy+fh/2);
    }
  });
},[breadcrumbs,breadcrumbVisible,scs,sW,sH,blockW,blockH,statsSessions]);

// ═══ Counting aids overlay ═══
useEffect(()=>{
  cancelAnimationFrame(countingAidsRafRef.current);
  const canvas=countingAidsCanvasRef.current;
  if(!canvas)return ()=>{cancelAnimationFrame(countingAidsRafRef.current);};
  if(stitchView!=="highlight"||!focusColour||!countingAidsEnabled||!pat||!done){
    if(canvas.width>0){const ctx=canvas.getContext("2d");ctx.clearRect(0,0,canvas.width,canvas.height);}
    return ()=>{cancelAnimationFrame(countingAidsRafRef.current);};
  }
  const needW=sW*scs+G+2,needH=sH*scs+G+2;
  if(canvas.width!==needW||canvas.height!==needH){canvas.width=needW;canvas.height=needH;}
  const tier=lockDetailLevel?3:tierRef.current;
  if(tier<2){const ctx=canvas.getContext("2d");ctx.clearRect(0,0,canvas.width,canvas.height);return ()=>{cancelAnimationFrame(countingAidsRafRef.current);};}
  countingAidsRafRef.current=requestAnimationFrame(()=>{
    const ctx=canvas.getContext("2d");
    ctx.clearRect(0,0,canvas.width,canvas.height);
    const bCols=Math.ceil(sW/blockW),bRows=Math.ceil(sH/blockH);
    // Viewport culling
    const scroll=stitchScrollRef.current;
    let visC0=0,visC1=bCols,visR0=0,visR1=bRows;
    if(scroll){
      const sl=scroll.scrollLeft,st=scroll.scrollTop,cw=scroll.clientWidth,ch=scroll.clientHeight;
      visC0=Math.max(0,Math.floor((sl-G)/scs/blockW));
      visC1=Math.min(bCols,Math.ceil((sl+cw)/scs/blockW)+1);
      visR0=Math.max(0,Math.floor((st-G)/scs/blockH));
      visR1=Math.min(bRows,Math.ceil((st+ch)/scs/blockH)+1);
    }
    // Ninja icon: 4-pointed star (shuriken)
    function drawNinjaIcon(cx,cy,r){
      const ir=r*0.35;
      ctx.beginPath();
      for(let i=0;i<4;i++){
        const outerAngle=(i*Math.PI/2)-Math.PI/2;
        const innerAngle=outerAngle+Math.PI/4;
        ctx.lineTo(cx+Math.cos(outerAngle)*r,cy+Math.sin(outerAngle)*r);
        ctx.lineTo(cx+Math.cos(innerAngle)*ir,cy+Math.sin(innerAngle)*ir);
      }
      ctx.closePath();
      ctx.fillStyle="rgba(234,88,12,0.85)";ctx.fill();
      ctx.strokeStyle="rgba(234,88,12,1)";ctx.lineWidth=0.5;ctx.stroke();
    }
    const ps=analysisResult&&analysisResult.perStitch;
    // Per-block counts + ninja detection
    for(let by=visR0;by<visR1;by++){for(let bx=visC0;bx<visC1;bx++){
      const x0=bx*blockW,y0=by*blockH;
      const x1=Math.min(x0+blockW,sW),y1=Math.min(y0+blockH,sH);
      let total=0,remaining=0;
      for(let row=y0;row<y1;row++){for(let col=x0;col<x1;col++){
        const idx=row*sW+col;
        const m=pat[idx];
        if(!m||m.id==="__skip__"||m.id==="__empty__")continue;
        if(m.id!==focusColour)continue;
        total++;
        if(!done[idx])remaining++;
      }}
      if(total===0)continue;
      const isActive=focusBlock&&focusBlock.bx===bx&&focusBlock.by===by;
      const px=G+x0*scs+2,py=G+y0*scs+2;
      if(remaining===0){
        // Draw a small checkmark using canvas strokes (matches Icons.check
        // glyph) instead of rendering the "✓" character — keeps the canvas
        // overlay font-independent and consistent with the SVG icon library.
        ctx.strokeStyle="#B85C38";
        ctx.lineWidth=1.4;
        ctx.lineCap="round";
        ctx.lineJoin="round";
        ctx.beginPath();
        ctx.moveTo(px+1,py+5);
        ctx.lineTo(px+3.4,py+7.4);
        ctx.lineTo(px+8,py+2);
        ctx.stroke();
      }else if(isActive){
        const label=String(remaining);
        ctx.font="bold 10px sans-serif";
        ctx.textAlign="left";ctx.textBaseline="top";
        const tw=ctx.measureText(label).width;
        ctx.fillStyle="rgba(184, 92, 56,0.15)";
        ctx.beginPath();
        if(ctx.roundRect)ctx.roundRect(px-2,py-1,tw+6,13,3);else ctx.rect(px-2,py-1,tw+6,13);
        ctx.fill();
        ctx.fillStyle="#B85C38";ctx.fillText(label,px,py);
      }else{
        ctx.fillStyle="rgba(0,0,0,0.3)";ctx.font="8px sans-serif";
        ctx.textAlign="left";ctx.textBaseline="top";
        ctx.fillText(String(remaining),px,py);
      }
    }}
    // Run-length badges
    if(countRunMin>0){
      for(let by=visR0;by<visR1;by++){for(let bx=visC0;bx<visC1;bx++){
        const x0=bx*blockW,y0=by*blockH;
        const x1=Math.min(x0+blockW,sW),y1=Math.min(y0+blockH,sH);
        // Horizontal runs
        if(countRunDir==="h"||countRunDir==="both"){
          for(let row=y0;row<y1;row++){
            let runStart=-1,runLen=0;
            for(let col=x0;col<=x1;col++){
              const inBounds=col<x1;
              const match=inBounds&&pat[row*sW+col]&&pat[row*sW+col].id===focusColour&&!done[row*sW+col];
              if(match){if(runStart<0){runStart=col;runLen=1;}else runLen++;}
              else if(runStart>=0){
                if(runLen>=countRunMin){
                  const midCol=runStart+Math.floor(runLen/2);
                  const bpx=G+midCol*scs+scs-2,bpy=G+row*scs+2;
                  const label=String(runLen);
                  ctx.font="bold 8px monospace";
                  const tw=Math.max(ctx.measureText(label).width+6,14);
                  ctx.fillStyle="#B85C38";
                  ctx.beginPath();
                  if(ctx.roundRect)ctx.roundRect(bpx-tw,bpy,tw,11,5);else ctx.rect(bpx-tw,bpy,tw,11);
                  ctx.fill();
                  ctx.fillStyle="#fff";ctx.textAlign="center";ctx.textBaseline="top";
                  ctx.fillText(label,bpx-tw/2,bpy+1.5);
                }
                runStart=-1;runLen=0;
              }
            }
          }
        }
        // Vertical runs
        if(countRunDir==="v"||countRunDir==="both"){
          for(let col=x0;col<x1;col++){
            let runStart=-1,runLen=0;
            for(let row=y0;row<=y1;row++){
              const inBounds=row<y1;
              const match=inBounds&&pat[row*sW+col]&&pat[row*sW+col].id===focusColour&&!done[row*sW+col];
              if(match){if(runStart<0){runStart=row;runLen=1;}else runLen++;}
              else if(runStart>=0){
                if(runLen>=countRunMin){
                  const midRow=runStart+Math.floor(runLen/2);
                  const bpx=G+col*scs+2,bpy=G+midRow*scs+scs-13;
                  const label=String(runLen);
                  ctx.font="bold 8px monospace";
                  const tw=Math.max(ctx.measureText(label).width+6,14);
                  ctx.fillStyle="#7c3aed";
                  ctx.beginPath();
                  if(ctx.roundRect)ctx.roundRect(bpx,bpy,tw,11,5);else ctx.rect(bpx,bpy,tw,11);
                  ctx.fill();
                  ctx.fillStyle="#fff";ctx.textAlign="center";ctx.textBaseline="top";
                  ctx.fillText(label,bpx+tw/2,bpy+1.5);
                }
                runStart=-1;runLen=0;
              }
            }
          }
        }
      }}
    }
    // Ninja stitch detection
    if(countNinjaEnabled){
      const r=Math.max(4,scs*0.3);
      for(let by=visR0;by<visR1;by++){for(let bx=visC0;bx<visC1;bx++){
        const x0=bx*blockW,y0=by*blockH;
        const x1=Math.min(x0+blockW,sW),y1=Math.min(y0+blockH,sH);
        for(let row=y0;row<y1;row++){for(let col=x0;col<x1;col++){
          const idx=row*sW+col;
          const m=pat[idx];
          if(!m||m.id!==focusColour||done[idx])continue;
          let isolated=false;
          if(ps&&ps.clusterSize){
            isolated=ps.clusterSize[idx]===1;
          }else{
            const upIdx=row>0?(row-1)*sW+col:-1;
            const dnIdx=row<sH-1?(row+1)*sW+col:-1;
            const ltIdx=col>0?row*sW+col-1:-1;
            const rtIdx=col<sW-1?row*sW+col+1:-1;
            isolated=![upIdx,dnIdx,ltIdx,rtIdx].some(ni=>ni>=0&&pat[ni]&&pat[ni].id===focusColour&&!done[ni]);
          }
          if(isolated){
            drawNinjaIcon(G+col*scs+scs/2,G+row*scs+scs/2,r);
          }
        }}
      }}
    }
  });
  return ()=>{cancelAnimationFrame(countingAidsRafRef.current);};
},[pat,done,sW,sH,scs,focusColour,stitchView,countingAidsEnabled,countRunMin,countRunDir,countNinjaEnabled,blockW,blockH,focusBlock,countsVer,analysisResult,lockDetailLevel]);


const hlAntsIntervalRef=useRef(null);
useEffect(()=>{
  const needAnts=stitchView==="highlight"&&!!focusColour&&highlightMode==="outline";
  if(!needAnts){if(hlAntsIntervalRef.current){clearInterval(hlAntsIntervalRef.current);hlAntsIntervalRef.current=null;}return;}
  if(hlAntsIntervalRef.current)return;
  hlAntsIntervalRef.current=setInterval(()=>setAntsOffset(p=>(p+1)%20),100);
  return()=>{if(hlAntsIntervalRef.current){clearInterval(hlAntsIntervalRef.current);hlAntsIntervalRef.current=null;}};
},[stitchView,focusColour,highlightMode]);

const updateHoverOverlay = (gc) => {
  if (gc && gc.gx >= 0 && gc.gx < sW && gc.gy >= 0 && gc.gy < sH) {
    if (hoverRefs.current.row) {
      hoverRefs.current.row.style.display = 'block';
      hoverRefs.current.row.style.top = (gc.gy * scs) + 'px';
      hoverRefs.current.row.style.left = (-G) + 'px';
      hoverRefs.current.row.style.width = (sW * scs + G) + 'px';
      hoverRefs.current.row.style.height = scs + 'px';
    }
    if (hoverRefs.current.col) {
      hoverRefs.current.col.style.display = 'block';
      hoverRefs.current.col.style.top = (-G) + 'px';
      hoverRefs.current.col.style.left = (gc.gx * scs) + 'px';
      hoverRefs.current.col.style.width = scs + 'px';
      hoverRefs.current.col.style.height = (sH * scs + G) + 'px';
    }
    if (!hoverCellRef.current || hoverCellRef.current.row !== gc.gy || hoverCellRef.current.col !== gc.gx) {
      hoverCellRef.current = { row: gc.gy, col: gc.gx };
      setHoverInfoCell({ row: gc.gy, col: gc.gx }); // For bottom bar
    }
  } else {
    if (hoverRefs.current.row) hoverRefs.current.row.style.display = 'none';
    if (hoverRefs.current.col) hoverRefs.current.col.style.display = 'none';
    if (hoverCellRef.current) {
      hoverCellRef.current = null;
      setHoverInfoCell(null);
    }
  }
};

const rafIdRef = useRef(null);

function drawCellDirectly(idx, nv) {
  if (!stitchRef.current || !pat || !cmap) return;
  const ctx = stitchRef.current.getContext('2d');
  const gx = idx % sW;
  const gy = Math.floor(idx / sW);
  const px = G + gx * scs;
  const py = G + gy * scs;
  const m = pat[idx];
  const info = m.id==="__skip__"||m.id==="__empty__"?null:(cmap?cmap[m.id]:null);
  const isDn = nv;
  const cSz = scs;
  // Tier-aware rendering
  const tier=lockDetailLevel?3:tierRef.current;
  const symAlpha=lockDetailLevel?1.0:tierFadeRef.current.symbolOpacity;
  const bsHsAlpha=lockDetailLevel?1.0:tierFadeRef.current.bsHsOpacity;
  const symPx=tierSymFontSz(cSz);
  const dimmed=stitchView==="highlight"&&focusColour&&m.id!==focusColour&&m.id!=="__skip__"&&m.id!=="__empty__";
  const effectiveDimmed2=dimmed&&highlightMode!=="outline"&&highlightMode!=="tint";

  ctx.clearRect(px, py, cSz, cSz);

  // Tier 1 fast path: flat color fill only
  if(tier===1){
    if(m.id==="__skip__"||m.id==="__empty__"){ctx.fillStyle="#f0f4f8";ctx.fillRect(px,py,cSz,cSz);return;}
    if(layerVis.full){
      if(isDn){ctx.fillStyle=`rgb(${m.rgb[0]},${m.rgb[1]},${m.rgb[2]})`;ctx.fillRect(px,py,cSz,cSz);}
      else{const r2=Math.round(m.rgb[0]*0.45+255*0.55),g2=Math.round(m.rgb[1]*0.45+255*0.55),b2=Math.round(m.rgb[2]*0.45+255*0.55);ctx.fillStyle=`rgb(${r2},${g2},${b2})`;ctx.fillRect(px,py,cSz,cSz);}
    }
    return;
  }

  if(m.id==="__skip__"||m.id==="__empty__"){
    drawCk(ctx,px,py,cSz);
    if(cSz>=4){
      ctx.strokeStyle=m.id==="__empty__"?"rgba(220,50,50,0.25)":"rgba(0,0,0,0.06)";
      ctx.strokeRect(px,py,cSz,cSz);
    }
    let hs=halfStitches.get(idx);
    if(hs&&layerVis.half&&bsHsAlpha>0.01){
      let hd=halfDone.get(idx)||{};
      ctx.save();ctx.globalAlpha=bsHsAlpha;
      _drawHalfStitchCell(ctx,px,py,cSz,hs,hd,cmap,stitchView,focusColour,false,tier===2,tier===3,tier>=4);
      ctx.restore();
    }
    return;
  }

  if(layerVis.full){
    if(stitchView==="symbol"){
      if(isDn){ctx.fillStyle="#D5E5C8";ctx.fillRect(px,py,cSz,cSz);}
      else{ctx.fillStyle="#fff";ctx.fillRect(px,py,cSz,cSz);if(info&&symAlpha>0.01){ctx.save();ctx.globalAlpha=symAlpha;ctx.fillStyle="#1B1814";ctx.font=`bold ${symPx}px monospace`;ctx.textAlign="center";ctx.textBaseline="middle";ctx.fillText(info.symbol,px+cSz/2,py+cSz/2);ctx.restore();}}
    }else if(stitchView==="colour"){
      ctx.fillStyle=`rgb(${m.rgb[0]},${m.rgb[1]},${m.rgb[2]})`;ctx.fillRect(px,py,cSz,cSz);
      if(!isDn&&info&&symAlpha>0.01){ctx.save();ctx.globalAlpha=symAlpha;ctx.fillStyle=luminance(m.rgb)>140?"rgba(0,0,0,0.8)":"rgba(255,255,255,0.95)";ctx.font=`bold ${Math.max(7,Math.round(symPx*0.92))}px monospace`;ctx.textAlign="center";ctx.textBaseline="middle";ctx.fillText(info.symbol,px+cSz/2,py+cSz/2);ctx.restore();}
    }else if(highlightMode==="outline"||highlightMode==="tint"){
      ctx.fillStyle=`rgb(${m.rgb[0]},${m.rgb[1]},${m.rgb[2]})`;ctx.fillRect(px,py,cSz,cSz);
      if(!isDn&&info&&symAlpha>0.01){ctx.save();ctx.globalAlpha=symAlpha;ctx.fillStyle=luminance(m.rgb)>140?"rgba(0,0,0,0.8)":"rgba(255,255,255,0.95)";ctx.font=`bold ${Math.max(7,Math.round(symPx*0.92))}px monospace`;ctx.textAlign="center";ctx.textBaseline="middle";ctx.fillText(info.symbol,px+cSz/2,py+cSz/2);ctx.restore();}
      if(highlightMode==="tint"&&focusColour&&m.id===focusColour){const tr=parseInt(tintColor.slice(1,3),16),tg=parseInt(tintColor.slice(3,5),16),tb=parseInt(tintColor.slice(5,7),16);ctx.fillStyle=`rgba(${tr},${tg},${tb},${tintOpacity})`;ctx.fillRect(px,py,cSz,cSz);}
    }else if(highlightMode==="spotlight"){
      if(dimmed){ctx.fillStyle="#e8ecf0";ctx.fillRect(px,py,cSz,cSz);}
      else{ctx.fillStyle=`rgb(${m.rgb[0]},${m.rgb[1]},${m.rgb[2]})`;ctx.fillRect(px,py,cSz,cSz);if(!isDn&&info&&symAlpha>0.01){ctx.save();ctx.globalAlpha=symAlpha;ctx.fillStyle=luminance(m.rgb)>140?"rgba(0,0,0,0.8)":"rgba(255,255,255,0.95)";ctx.font=`bold ${Math.max(7,Math.round(symPx*0.92))}px monospace`;ctx.textAlign="center";ctx.textBaseline="middle";ctx.fillText(info.symbol,px+cSz/2,py+cSz/2);ctx.restore();}if(cSz>=4){const lum2=luminance(m.rgb);ctx.strokeStyle=lum2>140?"rgba(26,26,46,0.85)":"rgba(255,255,255,0.85)";ctx.lineWidth=1.5;ctx.strokeRect(px+0.75,py+0.75,cSz-1.5,cSz-1.5);ctx.lineWidth=1;}}
    }else{
      if(isDn){ctx.fillStyle=dimmed?"#EFE7D6":`rgb(${m.rgb[0]},${m.rgb[1]},${m.rgb[2]})`;ctx.fillRect(px,py,cSz,cSz);}
      else if(dimmed){ctx.fillStyle="#EFE7D6";ctx.fillRect(px,py,cSz,cSz);if(symAlpha>0.01&&info&&cSz>=8){ctx.save();ctx.globalAlpha=symAlpha;ctx.fillStyle="rgba(0,0,0,0.06)";ctx.font=`${Math.max(6,Math.round(cSz*0.45))}px monospace`;ctx.textAlign="center";ctx.textBaseline="middle";ctx.fillText(info.symbol,px+cSz/2,py+cSz/2);ctx.restore();}}
      else{ctx.fillStyle=`rgba(${m.rgb[0]},${m.rgb[1]},${m.rgb[2]},0.25)`;ctx.fillRect(px,py,cSz,cSz);if(info&&symAlpha>0.01){ctx.save();ctx.globalAlpha=symAlpha;ctx.fillStyle="#1B1814";ctx.font=`bold ${symPx}px monospace`;ctx.textAlign="center";ctx.textBaseline="middle";ctx.fillText(info.symbol,px+cSz/2,py+cSz/2);ctx.restore();}}
    }
  }
  // Tier 4 thread ID label
  if(tier>=4&&cSz>40&&info&&symAlpha>0.01&&layerVis.full){
    ctx.save();ctx.globalAlpha=symAlpha*0.7;ctx.fillStyle="rgba(100,116,139,1)";
    ctx.font=`${Math.max(6,Math.round(cSz*0.2))}px monospace`;ctx.textAlign="center";ctx.textBaseline="middle";
    ctx.fillText(m.id,px+cSz/2,py+cSz*0.8);ctx.restore();
  }
  // Half stitches
  let hs=halfStitches.get(idx);
  if(hs&&layerVis.half&&bsHsAlpha>0.01){
    let hd=halfDone.get(idx)||{};
    ctx.save();ctx.globalAlpha=bsHsAlpha;
    _drawHalfStitchCell(ctx,px,py,cSz,hs,hd,cmap,stitchView,focusColour,effectiveDimmed2,tier===2,tier===3,tier>=4);
    ctx.restore();
  }
  if(cSz>=4){ctx.strokeStyle=(effectiveDimmed2&&layerVis.full)?"rgba(0,0,0,0.03)":"rgba(0,0,0,0.08)";ctx.strokeRect(px,py,cSz,cSz);}
}

// ═══ Half-stitch marking helpers ═══
function hitTestHalfStitch(localX, localY, cellSize, margin) {
  // Determine which diagonal slash orientation (fwd=/ or bck=\) the click is closest to.
  const normX = localX / cellSize;
  const normY = localY / cellSize;
  // "/" lies on y = 1 - x, "\" lies on y = x.
  // If the click is within the margin of both diagonals, treat it as ambiguous.
  const fwdDist = Math.abs(normY - (1 - normX));
  const bckDist = Math.abs(normY - normX);
  const threshold = margin / cellSize;
  if (fwdDist < threshold && bckDist < threshold) return "ambiguous";
  return fwdDist < bckDist ? "fwd" : "bck";
}

function _toggleHalfDone(idx, dir) {
  const newHd = new Map(halfDone);
  const hd = { ...(newHd.get(idx) || {}) };
  hd[dir] = hd[dir] ? 0 : 1;
  if (!hd.fwd && !hd.bck) newHd.delete(idx);
  else newHd.set(idx, hd);
  // Track colour for auto-session
  const hs=halfStitches.get(idx);
  if(hs&&hs[dir]&&hs[dir].id)pendingColoursRef.current.add(hs[dir].id);
  setHalfDone(newHd);
  renderStitch();
}

function _markHalfDoneFromDisambig(idx, dir) {
  if (isColourLocked() && !halfStitchMatchesFocus(idx, dir)) {
    setHalfDisambig(null);
    return;
  }
  _toggleHalfDone(idx, dir);
  setHalfDisambig(null);
}

// ── Highlight colour lock helpers ──
function isColourLocked() {
  return stitchView === "highlight" && !!focusColour && stitchMode === "track";
}
function fullStitchMatchesFocus(idx) {
  return pat[idx] && pat[idx].id === focusColour;
}
function halfStitchMatchesFocus(idx, dir) {
  const hs = halfStitches.get(idx);
  return hs && hs[dir] && hs[dir].id === focusColour;
}

function handleStitchMouseDown(e){
  if(!stitchRef.current||!pat)return;
  if(e.button===1||isSpaceDownRef.current){e.preventDefault();startPan(e);return;}
  // Alt+click: relocate the spotlight focus block to the clicked cell's block.
  // Works in both Mark and Navigate modes; bypasses edit-mode cell editor too.
  // No-op when spotlight is off or the stitching style has no spatial blocks.
  if(e.altKey&&e.button===0&&focusEnabled&&stitchingStyle!=="crosscountry"&&sW&&sH){
    const gcA=gridCoord(stitchRef,e,scs,G,false);
    if(gcA&&gcA.gx>=0&&gcA.gx<sW&&gcA.gy>=0&&gcA.gy<sH){
      e.preventDefault();
      const bCols=Math.ceil(sW/blockW),bRows=Math.ceil(sH/blockH);
      const bx=Math.max(0,Math.min(bCols-1,Math.floor(gcA.gx/blockW)));
      const by=Math.max(0,Math.min(bRows-1,Math.floor(gcA.gy/blockH)));
      setFocusBlock({bx,by});
      return;
    }
  }
  // Edit Mode: left-click on grid opens cell edit popover instead of any navigate/track action
  if(isEditMode){
    if(e.button!==0)return;
    const gc2=gridCoord(stitchRef,e,scs,G,false);
    if(gc2&&gc2.gx>=0&&gc2.gx<sW&&gc2.gy>=0&&gc2.gy<sH){
      const idx=gc2.gy*sW+gc2.gx;
      const cell=pat[idx];
      if(cell.id==="__skip__")return; // __skip__ cells are not editable
      setCellEditPopover({idx,row:gc2.gy+1,col:gc2.gx+1,x:e.clientX,y:e.clientY});
    }
    return;
  }
  let gc=gridCoord(stitchRef,e,scs,G,stitchMode==="navigate"&&selectedColorId);
  if(!gc)return;let{gx,gy}=gc;
  if(stitchMode==="navigate"){
    if(e.shiftKey||!selectedColorId||!cmap||!cmap[selectedColorId]){
      let gc2=gridCoord(stitchRef,e,scs,G,false);if(gc2&&gc2.gx>=0&&gc2.gx<sW&&gc2.gy>=0&&gc2.gy<sH){setHlRow(gc2.gy);setHlCol(gc2.gx);}
    }else{
      if(gx>=0&&gx<sW&&gy>=0&&gy<sH){let existing=parkMarkers.findIndex(m=>m.x===gx&&m.y===gy&&m.colorId===selectedColorId);if(existing>=0)setParkMarkers(prev=>prev.filter((_,i)=>i!==existing));else setParkMarkers(prev=>{
        // Multi-colour parking — Option A: auto-rotate corners.
        // Pick the next free corner at this cell in [BL, BR, TR, TL]
        // order so up to 4 colours can be parked on the same cell
        // without visually overwriting each other. If all four are
        // taken, replace the OLDEST marker at this cell (FIFO).
        const ORDER=["BL","BR","TR","TL"];
        const atCell=prev.filter(m=>m.x===gx&&m.y===gy);
        const used=new Set(atCell.map(m=>m.corner||"BL"));
        let corner=ORDER.find(c=>!used.has(c));
        let next=prev;
        if(!corner){
          // All four corners occupied — evict the oldest at this cell.
          const oldestIdx=prev.findIndex(m=>m===atCell[0]);
          if(oldestIdx>=0)next=prev.filter((_,i)=>i!==oldestIdx);
          corner=atCell[0].corner||"BL";
        }
        return[...next,{x:gx,y:gy,colorId:selectedColorId,rgb:cmap[selectedColorId].rgb,corner}];
      });}
    }
    return;
  }
  if(gx<0||gx>=sW||gy<0||gy>=sH||!done)return;
  let idx=gy*sW+gx;

  // ═══ Tracker: Marking half stitches as done (track mode) ═══
  // If cell has half stitches and NO full stitch (or full is done), handle half marking
  const cellHasHalf=halfStitches.has(idx);
  const m2=pat[idx];
  const isFullCell=m2&&m2.id!=="__skip__"&&m2.id!=="__empty__";

  if(cellHasHalf&&(!isFullCell||(done&&done[idx]))){
    const hs=halfStitches.get(idx);
    const hasBoth=hs.fwd&&hs.bck;
    if(hasBoth){
      // Two halves: hit-test which triangle was tapped
      const rect=stitchRef.current.getBoundingClientRect();
      const localX=e.clientX-rect.left-G-gx*scs;
      const localY=e.clientY-rect.top-G-gy*scs;
      const hitDir=hitTestHalfStitch(localX,localY,scs,8);
      if(hitDir==="ambiguous"){
        // Show disambiguation popup
        if (isColourLocked()) {
          const fwdMatch = halfStitchMatchesFocus(idx, "fwd");
          const bckMatch = halfStitchMatchesFocus(idx, "bck");
          if (!fwdMatch && !bckMatch) { e.preventDefault(); return; }
          if (fwdMatch && !bckMatch) { _toggleHalfDone(idx, "fwd"); e.preventDefault(); return; }
          if (!fwdMatch && bckMatch) { _toggleHalfDone(idx, "bck"); e.preventDefault(); return; }
          // Both match — fall through to normal disambiguation popup
        }
        setHalfDisambig({idx,x:e.clientX,y:e.clientY});
        e.preventDefault();
        return;
      }
      if (isColourLocked() && !halfStitchMatchesFocus(idx, hitDir)) { e.preventDefault(); return; }
      _toggleHalfDone(idx,hitDir);
    } else {
      // Single half: toggle it
      const dir=hs.fwd?"fwd":"bck";
      if (isColourLocked() && !halfStitchMatchesFocus(idx, dir)) { e.preventDefault(); return; }
      _toggleHalfDone(idx,dir);
    }
    e.preventDefault();
    return;
  }

  if(pat[idx].id==="__skip__"||pat[idx].id==="__empty__")return;

  // C3: cell tap / drag-mark / shift+click range / long-press range are all
  // owned by useDragMark (see _dragMarkOnToggle / _dragMarkOnCommitDrag /
  // _dragMarkOnCommitRange below). The mousedown handler keeps only the
  // pan, edit-mode popover, navigate-mode, and half-stitch branches above.
  e.preventDefault();
}
function handleStitchMouseMove(e){
  if(isPanning){
    doPan(e);
    if(hoverInfo) setHoverInfo(null);
    updateHoverOverlay(null);
    return;
  }
  let gc=gridCoord(stitchRef,e,scs,G);

  updateHoverOverlay(gc);

  if(dragStateRef.current.isDragging) {
    if(hoverInfo) setHoverInfo(null);
  } else if(stitchMode==="track" && pat && gc && gc.gx>=0 && gc.gx<sW && gc.gy>=0 && gc.gy<sH){
    let idx=gc.gy*sW+gc.gx;
    let cell=pat[idx];
    if(cell && cell.id!=="__skip__" && cell.id!=="__empty__"){
      // Only update state if the hovered cell actually changed
      if(!hoverInfo || hoverInfo.row!==gc.gy+1 || hoverInfo.col!==gc.gx+1){
        let name="";
        if(cell.type==="blend"){
          name=cell.threads[0].name+"+"+cell.threads[1].name;
        }else{
          let ci=cmap&&cmap[cell.id]; name=ci?ci.name:"";
        }
        setHoverInfo({row:gc.gy+1, col:gc.gx+1, id:cell.id, name:name, x:e.clientX, y:e.clientY});
      }
    } else {
      setHoverInfo(null);
    }
  } else if (!dragStateRef.current.isDragging && hoverInfo) {
    setHoverInfo(null);
  }

  // C3: drag mutation now flows through useDragMark; mousemove only owns
  // pan + hover updates above.
}
function handleStitchMouseLeave(){
  handleMouseUp();
  setHoverInfo(null);
  updateHoverOverlay(null);
}
function handleMouseUp(){
  if(isPanning){setIsPanning(false);return;}
  // C3: drag commit owned by useDragMark via _dragMarkOnCommitDrag.
}

function startPan(e){
  if(!stitchScrollRef.current)return;
  setIsPanning(true);
  if(isSpaceDownRef.current)spacePannedRef.current=true;
  panStart.current={x:e.clientX,y:e.clientY,scrollX:stitchScrollRef.current.scrollLeft,scrollY:stitchScrollRef.current.scrollTop};
}
function doPan(e){
  if(!stitchScrollRef.current)return;
  let dx=e.clientX-panStart.current.x,dy=e.clientY-panStart.current.y;
  stitchScrollRef.current.scrollLeft=panStart.current.scrollX-dx;
  stitchScrollRef.current.scrollTop=panStart.current.scrollY-dy;
}

// Throttle React zoom state to one update per animation frame.
// stitchZoomRef.current is updated immediately so scroll maths stays accurate.
function scheduleZoomUpdate(newZoom){
  stitchZoomRef.current=newZoom;
  if(!zoomRafRef.current){
    zoomRafRef.current=requestAnimationFrame(()=>{
      setStitchZoom(stitchZoomRef.current);
      zoomRafRef.current=null;
    });
  }
}

function handleStitchWheel(e){
  if(!e.ctrlKey)return;
  e.preventDefault();
  const container=stitchScrollRef.current;
  if(!container)return;
  const rect=container.getBoundingClientRect();
  const mouseX=e.clientX-rect.left;
  const mouseY=e.clientY-rect.top;
  const canvasX=container.scrollLeft+mouseX;
  const canvasY=container.scrollTop+mouseY;
  const delta=-e.deltaY*0.005;
  const oldZoom=stitchZoomRef.current;
  const newZoom=Math.max(0.3,Math.min(4,oldZoom+delta));
  const scale=newZoom/oldZoom;
  scheduleZoomUpdate(newZoom);
  requestAnimationFrame(()=>{
    if(!container)return;
    container.scrollLeft=canvasX*scale-mouseX;
    container.scrollTop=canvasY*scale-mouseY;
  });
}

function handleTouchStart(e){
  if(!pat)return;
  e.preventDefault();
  const ts=touchStateRef.current;
  if(e.touches.length===1){
    // C3: single-finger TAP / DRAG-MARK / LONG-PRESS RANGE are owned by
    // useDragMark via pointer events. We only record startX/startY/mode
    // here so the > 8px PAN fallback in handleTouchMove can take over.
    const t=e.touches[0];
    ts.startX=t.clientX; ts.startY=t.clientY;
    ts.mode="tap"; ts.tapIdx=-1;
  }else if(e.touches.length===2){
    ts.mode="pinch"; ts.tapIdx=-1;
    const dx=e.touches[1].clientX-e.touches[0].clientX;
    const dy=e.touches[1].clientY-e.touches[0].clientY;
    ts.pinchDist=Math.hypot(dx,dy);
    const container=stitchScrollRef.current;
    if(container){
      const rect=container.getBoundingClientRect();
      const midX=(e.touches[0].clientX+e.touches[1].clientX)/2-rect.left;
      const midY=(e.touches[0].clientY+e.touches[1].clientY)/2-rect.top;
      ts.pinchAnchorCanvas={x:container.scrollLeft+midX,y:container.scrollTop+midY};
      ts.pinchAnchorScreen={x:midX,y:midY};
    }
    // End any active stitch drag
    if(dragStateRef.current.isDragging&&dragChangesRef.current.length>0){
      pushTrackHistory([...dragChangesRef.current]);
      applyDoneCountsDelta(dragChangesRef.current,pat,done);
      setDone(new Uint8Array(done)); dragChangesRef.current=[];
    }
    dragStateRef.current.isDragging=false;
  }
}

const PAN_THRESHOLD=8;
function handleTouchMove(e){
  if(!pat)return;
  e.preventDefault();
  const ts=touchStateRef.current;
  if(e.touches.length===1&&ts.mode!=="pinch"){
    const t=e.touches[0];
    const dx=t.clientX-ts.startX, dy=t.clientY-ts.startY;
    if(ts.mode==="tap"&&(Math.abs(dx)>PAN_THRESHOLD||Math.abs(dy)>PAN_THRESHOLD)){
      ts.mode="pan"; ts.tapIdx=-1;
      if(stitchScrollRef.current){
        panStart.current={x:ts.startX,y:ts.startY,scrollX:stitchScrollRef.current.scrollLeft,scrollY:stitchScrollRef.current.scrollTop};
      }
    }
    if(ts.mode==="pan"&&stitchScrollRef.current){
      stitchScrollRef.current.scrollLeft=panStart.current.scrollX-dx;
      stitchScrollRef.current.scrollTop=panStart.current.scrollY-dy;
    }
  }else if(e.touches.length===2&&ts.mode==="pinch"){
    const dx=e.touches[1].clientX-e.touches[0].clientX;
    const dy=e.touches[1].clientY-e.touches[0].clientY;
    const newDist=Math.hypot(dx,dy);
    if(ts.pinchDist>0){
      const scale=newDist/ts.pinchDist;
      const oldZoom=stitchZoomRef.current;
      const newZoom=Math.max(0.3,Math.min(4,oldZoom*scale));
      const container=stitchScrollRef.current;
      if(container&&ts.pinchAnchorCanvas){
        const zRatio=newZoom/oldZoom;
        requestAnimationFrame(()=>{
          container.scrollLeft=ts.pinchAnchorCanvas.x*zRatio-ts.pinchAnchorScreen.x;
          container.scrollTop=ts.pinchAnchorCanvas.y*zRatio-ts.pinchAnchorScreen.y;
        });
      }
      scheduleZoomUpdate(newZoom);
    }
    ts.pinchDist=newDist;
  }
}

function handleTouchEnd(e){
  if(!pat)return;
  // C3: tap toggle / range fill are owned by useDragMark. Touch handler
  // only resets pinch + pan tracking state so the next gesture starts
  // cleanly.
  const ts=touchStateRef.current;
  ts.mode="none"; ts.tapIdx=-1; ts.pinchDist=0;
}

function toggleOwned(id){setThreadOwned(prev=>{let cur=prev[id]||"";let next=cur===""?"owned":cur==="owned"?"tobuy":"";return{...prev,[id]:next};});}
const ownedCount=useMemo(()=>skeinData.filter(d=>(threadOwned[d.id]||"")==="owned").length,[skeinData,threadOwned]);
const toBuyList=useMemo(()=>skeinData.filter(d=>(threadOwned[d.id]||"")!=="owned"),[skeinData,threadOwned]);

// ─── Keyboard shortcuts (migrated to central registry) ──────────────
// Scope hierarchy:
//   tracker                    — active whenever the tracker is mounted
//   tracker.notedit            — !isEditMode
//   tracker.view.highlight     — stitchView === 'highlight'
//
// The registry handles dispatch, the canonical input-element guard
// (text inputs / contenteditable only — NOT BUTTON or A), and conflict
// detection. Keyup for Space-pan stays in a sibling effect because
// the registry is keydown-only.
//
// Behaviour changes vs. pre-migration (see reports/shortcuts-4-redesign-spec.md):
//   • Single-key shortcuts no longer die when focus is on a button/link.
//   • '?' now opens the Shortcuts modal (was: Help) for cross-page consistency.
//   • Backstitch layer toggle moved 'B' → 'L' (B reserved for global Bulk Add).
//   • All-layers toggle moved bare 'A' → 'Shift+A' (avoids browser select-all clash).
//   • Counting aids 'C' works in any tracker view (was: highlight + focused only).
//   • Highlight modes 1–4 auto-pick the first focusable colour if none is set.
//   • Ctrl/Cmd+Z, +S etc. now fire even from inside text inputs.
useScope("tracker", !!isActive);
useScope("tracker.notedit", !!isActive && !isEditMode);
useScope("tracker.view.highlight", !!isActive && stitchView === "highlight");

// Keyup handler for Space-pan release stays imperative (registry is keydown-only).
useEffect(()=>{
  if(!isActive)return;
  function handleKeyUp(e){
    if(e.code==="Space"){isSpaceDownRef.current=false;spacePannedRef.current=false;}
  }
  window.addEventListener("keyup",handleKeyUp);
  return()=>window.removeEventListener("keyup",handleKeyUp);
},[isActive]);

// Helper: cycle to the next/previous focusable colour, auto-picking the
// first when none is currently set (so [/] always do something useful).
function cycleFocusColour(direction){
  setFocusColour(prev=>{
    if(!focusableColors.length)return prev;
    if(!prev){
      const first=focusableColors.find(p=>{const dc=colourDoneCounts[p.id];return !dc||dc.done<dc.total;})||focusableColors[0];
      return first?first.id:prev;
    }
    const idx=focusableColors.findIndex(p=>p.id===prev);
    if(idx<0)return focusableColors[0].id;
    if(direction>0)return focusableColors[(idx+1)%focusableColors.length].id;
    return focusableColors[(idx<=0?focusableColors.length:idx)-1].id;
  });
}
// Helper: ensure a focus colour is set (used when user presses 1-4 in
// highlight view without first picking one). Same first-focusable logic
// as the V key transition.
function ensureFocusColour(){
  if(focusColour)return;
  const first=focusableColors.find(p=>{const dc=colourDoneCounts[p.id];return !dc||dc.done<dc.total;})||focusableColors[0];
  if(first)setFocusColour(first.id);
}

// Jump to the next remaining stitch of the focus colour, honouring the
// user's stitching preferences (startCorner from the wizard / preferences
// modal). Scan order:
//   TL (or default) — top→bottom, left→right
//   TR              — top→bottom, right→left
//   BL              — bottom→top, left→right
//   BR              — bottom→top, right→left
//   C               — nearest unmarked cell to the centre of the chart
// Wraps around from the current crosshair position so repeated presses
// step through every remaining stitch of the focus colour.
function jumpToNextStitch(){
  if(!pat||!sW||!sH)return;
  let target=focusColour;
  if(!target){
    const first=focusableColors.find(p=>{const dc=colourDoneCounts[p.id];return !dc||dc.done<dc.total;})||focusableColors[0];
    if(!first)return;
    target=first.id;
    setFocusColour(first.id);
  }
  const cur=doneRef.current;
  function _matches(cell){
    if(!cell||cell.id==="__skip__"||cell.id==="__empty__")return false;
    if(cell.id===target)return true;
    if(cell.type==="blend"){
      if(typeof cell.id==="string"&&cell.id.split("+").indexOf(target)>=0)return true;
      if(Array.isArray(cell.threads)&&cell.threads.some(function(t){return t&&t.id===target;}))return true;
    }
    return false;
  }
  function _isOpen(idx){return !cur||!cur[idx];}
  let foundX=-1,foundY=-1;
  if(startCorner==="C"){
    // Nearest unmarked stitch of focus colour to the chart centre.
    const cxC=Math.floor(sW/2),cyC=Math.floor(sH/2);
    let best=Infinity;
    for(let y=0;y<sH;y++){
      for(let x=0;x<sW;x++){
        const idx=y*sW+x;
        if(!_matches(pat[idx])||!_isOpen(idx))continue;
        const dx=x-cxC,dy=y-cyC;const d=dx*dx+dy*dy;
        if(d<best){best=d;foundX=x;foundY=y;}
      }
    }
  }else{
    const xRev=startCorner==="TR"||startCorner==="BR";
    const yRev=startCorner==="BL"||startCorner==="BR";
    const stepX=xRev?-1:1,stepY=yRev?-1:1;
    const startX=xRev?sW-1:0,endX=xRev?-1:sW;
    const startY=yRev?sH-1:0,endY=yRev?-1:sH;
    const fromX=hlCol>=0&&hlCol<sW?hlCol:startX;
    const fromY=hlRow>=0&&hlRow<sH?hlRow:startY;
    function scan(sx,sy,ex,ey,skipFirst){
      let first=skipFirst;
      for(let y=sy;y!==ey;y+=stepY){
        const rowStart=(y===sy)?sx:startX;
        for(let x=rowStart;x!==endX;x+=stepX){
          if(first){first=false;continue;}
          const idx=y*sW+x;
          if(_matches(pat[idx])&&_isOpen(idx)){foundX=x;foundY=y;return true;}
        }
      }
      return false;
    }
    // First pass: from current cursor (skip current cell) to end corner.
    if(!scan(fromX,fromY,endX,endY,true)){
      // Wrap-around: from start corner up to (and including) cursor.
      foundX=-1;foundY=-1;
      for(let y=startY;y!==fromY+stepY;y+=stepY){
        const rowEnd=(y===fromY)?fromX+stepX:endX;
        for(let x=startX;x!==rowEnd;x+=stepX){
          const idx=y*sW+x;
          if(_matches(pat[idx])&&_isOpen(idx)){foundX=x;foundY=y;break;}
        }
        if(foundX>=0)break;
      }
    }
  }
  if(foundX<0||foundY<0){
    try{if(window.Toast&&window.Toast.show)window.Toast.show({message:"No remaining stitches for DMC "+target,type:"info"});}catch(_){}
    return;
  }
  setHlRow(foundY);setHlCol(foundX);
  if(stitchScrollRef.current){
    const el=stitchScrollRef.current;
    const px=G+foundX*scs+scs/2,py=G+foundY*scs+scs/2;
    try{el.scrollTo({left:Math.max(0,px-el.clientWidth/2),top:Math.max(0,py-el.clientHeight/2),behavior:'smooth'});}
    catch(_){el.scrollLeft=Math.max(0,px-el.clientWidth/2);el.scrollTop=Math.max(0,py-el.clientHeight/2);}
  }
}

useShortcuts(!isActive ? [] : [
  // Esc cascade — preserves original priority order. Listed hidden because
  // Esc semantics are implicit and documented in every modal.
  { id: "tracker.esc", keys: "esc", scope: "tracker", hidden: true,
    description: "Cancel / dismiss",
    run: () => {
      if(halfDisambig){setHalfDisambig(null);return;}
      if(namePromptOpen){setNamePromptOpen(false);return;}
      if(modal){setModal(null);return;}
      if(showExitEditModal){setShowExitEditModal(false);return;}
      if(cellEditPopover){setCellEditPopover(null);return;}
      if(importDialog){setImportDialog(null);return;}
      if(tOverflowOpen){setTOverflowOpen(false);return;}
      if(focusColour&&stitchView==="highlight"){setFocusColour(null);return;}
      if(drawer){setDrawer(false);return;}
    } },

  // History / save (modified — fire from inputs by default).
  { id: "tracker.undo", keys: "mod+z", scope: "tracker",
    description: "Undo",
    run: () => { if(isEditMode&&undoSnapshot){applyUndo();}else if(!isEditMode){undoTrack();} } },
  { id: "tracker.redo", keys: ["mod+y", "mod+shift+z"], scope: "tracker.notedit",
    description: "Redo",
    run: () => { redoTrack(); } },
  { id: "tracker.save", keys: "mod+s", scope: "tracker",
    description: "Save project",
    run: () => { if(pat&&pal)saveProject(); } },

  // Hold-Space to pan (preventDefault so page doesn't scroll).
  { id: "tracker.space", keys: "space", scope: "tracker",
    description: "Hold to pan canvas",
    run: () => { if(!isSpaceDownRef.current){isSpaceDownRef.current=true;spaceDownTimeRef.current=Date.now();spacePannedRef.current=false;} } },

  // Shortcuts panel.
  { id: "tracker.shortcuts", keys: "?", scope: "tracker",
    description: "Toggle shortcuts panel",
    run: () => setModal("shortcuts") },

  // Stitch mode tabs.
  { id: "tracker.mode.track", keys: "t", scope: "tracker.notedit",
    description: "Track mode",
    run: () => setStitchMode("track") },
  { id: "tracker.mode.navigate", keys: "n", scope: "tracker.notedit",
    description: "Navigate mode",
    run: () => setStitchMode("navigate") },
  { id: "tracker.mode.rowmode", keys: "r", scope: "tracker.notedit",
    description: "Toggle row mode",
    run: () => { setRowModeActive(v=>!v); setCurrentRow(0); } },

  // View cycle.
  { id: "tracker.view.cycle", keys: "v", scope: "tracker.notedit",
    description: "Cycle view: symbol → colour → highlight",
    run: () => {
      const nextView=stitchView==="symbol"?"colour":stitchView==="colour"?"highlight":"symbol";
      setStitchView(nextView);
      if(nextView==="highlight"&&!focusColour){
        const first=focusableColors.find(p=>{const dc=colourDoneCounts[p.id];return !dc||dc.done<dc.total;})||focusableColors[0];
        if(first)setFocusColour(first.id);
      }
    } },

  // Layer toggles. Backstitch moved B→L; all-layers moved A→Shift+A.
  { id: "tracker.layer.full",   keys: "f", scope: "tracker.notedit",
    description: "Toggle full-stitch layer",
    run: () => setLayerVis(v=>({...v,full:!v.full})) },
  { id: "tracker.layer.half",   keys: "h", scope: "tracker.notedit",
    description: "Toggle half-stitch layer",
    run: () => setLayerVis(v=>({...v,half:!v.half})) },
  { id: "tracker.layer.knot",   keys: "k", scope: "tracker.notedit",
    description: "Toggle French-knot layer",
    run: () => setLayerVis(v=>({...v,french_knot:!v.french_knot})) },
  { id: "tracker.layer.bs",     keys: "l", scope: "tracker.notedit",
    description: "Toggle backstitch layer",
    run: () => setLayerVis(v=>({...v,backstitch:!v.backstitch})) },
  { id: "tracker.layer.all",    keys: "shift+a", scope: "tracker.notedit",
    description: "Toggle all layers on/off",
    run: () => {
      if(Object.values(layerVis).every(Boolean)){
        const allOff=Object.fromEntries(STITCH_LAYERS.map(l=>[l.id,false]));
        setLayerVis(allOff);
      }else{setLayerVis(ALL_LAYERS_VISIBLE);}
    } },

  // Drawer / pause / counting aids / zoom.
  { id: "tracker.drawer", keys: "d", scope: "tracker",
    description: "Toggle colour drawer",
    run: () => setDrawer(d=>!d) },
  { id: "tracker.pause", keys: "p", scope: "tracker.notedit",
    description: "Pause / resume session timer",
    when: () => !!currentAutoSessionRef.current,
    run: () => {
      if(manuallyPausedRef.current){
        const pausedMs=Date.now()-manualPauseTimeRef.current;
        currentAutoSessionRef.current.totalPausedMs=(currentAutoSessionRef.current.totalPausedMs||0)+pausedMs;
        manualPauseTimeRef.current=null;
        setManuallyPaused(false);
        setLiveAutoIsPaused(document.hidden||inactivityPausedRef.current);
      }else{
        clearTimeout(inactivityTimerRef.current);
        manualPauseTimeRef.current=Date.now();
        setManuallyPaused(true);
        setLiveAutoIsPaused(true);
      }
    } },
  { id: "tracker.counting", keys: "c", scope: "tracker",
    description: "Toggle counting aids",
    run: () => setCountingAidsEnabled(v=>!v) },
  { id: "tracker.focus.toggle", keys: "f", scope: "tracker",
    description: "Toggle spotlight focus area",
    run: () => {
      if(stitchingStyle==="crosscountry")return;
      setFocusEnabled(v=>{
        const next=!v;
        if(next&&!focusBlock)setFocusBlock(_getStartBlock());
        return next;
      });
    } },
  { id: "tracker.focus.left", keys: "alt+arrowleft", scope: "tracker",
    description: "Move spotlight one block left",
    run: () => _stepFocusBlock(-1,0) },
  { id: "tracker.focus.right", keys: "alt+arrowright", scope: "tracker",
    description: "Move spotlight one block right",
    run: () => _stepFocusBlock(+1,0) },
  { id: "tracker.focus.up", keys: "alt+arrowup", scope: "tracker",
    description: "Move spotlight one block up",
    run: () => _stepFocusBlock(0,-1) },
  { id: "tracker.focus.down", keys: "alt+arrowdown", scope: "tracker",
    description: "Move spotlight one block down",
    run: () => _stepFocusBlock(0,+1) },
  { id: "tracker.zoom.in", keys: ["=", "+"], scope: "tracker",
    description: "Zoom in",
    run: () => setStitchZoom(z=>Math.min(4,+(z+0.1).toFixed(2))) },
  { id: "tracker.zoom.out", keys: "-", scope: "tracker",
    description: "Zoom out",
    run: () => setStitchZoom(z=>Math.max(0.3,+(z-0.1).toFixed(2))) },
  { id: "tracker.zoom.fit", keys: "0", scope: "tracker",
    description: "Zoom to fit",
    run: () => fitSZ() },

  // Highlight-view-only: focus-colour cycling and highlight modes.
  { id: "tracker.hl.next", keys: ["]", "arrowright"], scope: "tracker.view.highlight",
    description: "Next focus colour",
    run: () => cycleFocusColour(+1) },
  { id: "tracker.hl.prev", keys: ["[", "arrowleft"], scope: "tracker.view.highlight",
    description: "Previous focus colour",
    run: () => cycleFocusColour(-1) },
  { id: "tracker.hl.isolate", keys: "1", scope: "tracker.view.highlight",
    description: "Highlight: isolate",
    run: () => { ensureFocusColour(); setHighlightMode("isolate"); } },
  { id: "tracker.hl.outline", keys: "2", scope: "tracker.view.highlight",
    description: "Highlight: outline",
    run: () => { ensureFocusColour(); setHighlightMode("outline"); } },
  { id: "tracker.hl.tint", keys: "3", scope: "tracker.view.highlight",
    description: "Highlight: tint",
    run: () => { ensureFocusColour(); setHighlightMode("tint"); } },
  { id: "tracker.hl.spotlight", keys: "4", scope: "tracker.view.highlight",
    description: "Highlight: spotlight",
    run: () => { ensureFocusColour(); setHighlightMode("spotlight"); } },
  // Jump-to-next: hops the crosshair to the next remaining stitch of the
  // focus colour using the wizard / preferences-modal startCorner setting
  // (TL/TR/BL/BR/C). Available outside highlight view too \u2014 it sets the
  // focus colour from the first incomplete one when none is selected.
  { id: "tracker.jumpNext", keys: "j", scope: "tracker.notedit",
    description: "Jump to next remaining stitch of focus colour",
    run: () => jumpToNextStitch() },
],[stitchView,isEditMode,focusableColors,isActive,namePromptOpen,modal,showExitEditModal,cellEditPopover,importDialog,tOverflowOpen,drawer,halfDisambig,focusColour,pat,pal,undoSnapshot,countsVer,trackHistory,redoStack,highlightMode,manuallyPaused,layerVis,colourDoneCounts,focusEnabled,focusBlock,stitchingStyle,blockW,blockH,sW,sH,startCorner]);

// Update stable handler refs every render (cheap assignment, no DOM work)
wheelHandlerRef.current=handleStitchWheel;
touchStartHandlerRef.current=handleTouchStart;
touchMoveHandlerRef.current=handleTouchMove;
touchEndHandlerRef.current=handleTouchEnd;

// Attach wheel listener when pattern loads (stitchScrollRef is null before then)
useEffect(()=>{
  const el=stitchScrollRef.current;
  if(!el)return;
  const handler=e=>wheelHandlerRef.current(e);
  el.addEventListener("wheel",handler,{passive:false});
  return()=>el.removeEventListener("wheel",handler);
},[!!pat]);

// Attach touch listeners once when pattern loads — wrapper delegates to latest handler
useEffect(()=>{
  const canvas=stitchRef.current;
  if(!canvas||!pat)return;
  const ts=e=>touchStartHandlerRef.current(e);
  const tm=e=>touchMoveHandlerRef.current(e);
  const te=e=>touchEndHandlerRef.current(e);
  canvas.addEventListener("touchstart",ts,{passive:false});
  canvas.addEventListener("touchmove",tm,{passive:false});
  canvas.addEventListener("touchend",te,{passive:false});
  return()=>{
    canvas.removeEventListener("touchstart",ts);
    canvas.removeEventListener("touchmove",tm);
    canvas.removeEventListener("touchend",te);
  };
},[!!pat]);

// Overflow close on outside click
useEffect(()=>{
  if(!tOverflowOpen)return;
  function close(e){if(tOverflowRef.current&&!tOverflowRef.current.contains(e.target))setTOverflowOpen(false);}
  document.addEventListener('mousedown',close);
  return()=>document.removeEventListener('mousedown',close);
},[tOverflowOpen]);
// ResizeObserver — collapse stitch/view groups when toolbar is narrow
useEffect(()=>{
  if(!tStripRef.current)return;
  const ro=new ResizeObserver(entries=>{
    const w=entries[0].contentRect.width;
    requestAnimationFrame(()=>setTStripCollapsed({view:w<860,stitch:w<600}));
  });
  ro.observe(tStripRef.current);
  return()=>ro.disconnect();
},[]);

// ═══ B2: Drag-Mark + Long-Press Range Select ═══════════════════════════
// useDragMark owns tap / drag / long-press routing for TOUCH input on the
// canvas. Mouse input continues to flow through handleStitchMouseDown so
// the existing pinch / pan / shift+click / range-mode pathways are intact.
const _dragMarkCellAtPoint=useCallback(function(cx,cy){
  if(!stitchRef.current||!pat)return -1;
  const gc=gridCoord(stitchRef,{clientX:cx,clientY:cy},scs,G,false);
  if(!gc)return -1;
  if(gc.gx<0||gc.gx>=sW||gc.gy<0||gc.gy>=sH)return -1;
  return gc.gy*sW+gc.gx;
},[pat,sW,sH,scs]);

const _pulseCells=useCallback(function(idxList){
  // Briefly add a pulse class on overlay cells. The overlay re-renders from
  // dragState; we mirror the just-committed indices into a transient ref.
  if(!idxList||!idxList.length)return;
  const pulse=new Set(idxList);
  setDragMarkPulse(pulse);
  setTimeout(function(){setDragMarkPulse(null);},250);
},[]);

const[dragMarkPulse,setDragMarkPulse]=useState(null);

const _commitBulk=useCallback(function(set,intent,source){
  // BUGFIX: read live `done` via doneRef so back-to-back commits before
  // React commits a prior setDone don't rewind earlier in-session marks.
  const cur=doneRef.current;
  if(!pat||!cur||!set||!set.size)return;
  const want=intent==='mark'?1:0;
  const changes=[];
  const nd=new Uint8Array(cur);
  set.forEach(function(idx){
    if(idx<0||idx>=pat.length)return;
    const cell=pat[idx];
    if(!cell||cell.id==='__skip__'||cell.id==='__empty__')return;
    // C3: colour-lock filter — match the legacy handlers' fullStitchMatchesFocus check.
    if(typeof isColourLocked==='function'&&isColourLocked()
       &&!fullStitchMatchesFocus(idx))return;
    if(nd[idx]!==want){
      changes.push({idx:idx,oldVal:nd[idx]});
      nd[idx]=want;
    }
  });
  if(!changes.length)return;
  pushBulkToggleHistory(changes,source);
  applyDoneCountsDelta(changes,pat,nd);
  doneRef.current=nd;
  setDone(nd);
  if(typeof renderStitch==='function')renderStitch();
  _pulseCells(changes.map(function(c){return c.idx;}));
  // BUGFIX (#2): explicitly start/extend the auto-session for drag-mark commits.
  // The diff-based useEffect at line ~1419 sometimes misses bulk commits when
  // setCountsVer + setDone batch into the same render but prevAutoCountRef has
  // already been updated by an interleaving render. Calling recordAutoActivity
  // here guarantees the session timer starts the moment a drag finishes, no
  // matter how many cells were marked. We also pre-update prevAutoCountRef to
  // the new value so the diff-based useEffect won't double-count.
  let _bulkCompleted=0,_bulkUndone=0;
  for(let _i=0;_i<changes.length;_i++){if(changes[_i].oldVal===0)_bulkCompleted++;else _bulkUndone++;}
  if(_bulkCompleted>0||_bulkUndone>0){
    recordAutoActivity(_bulkCompleted,_bulkUndone);
    prevAutoCountRef.current={done:doneCountRef.current,halfDone:(halfStitchCounts&&halfStitchCounts.done)||(prevAutoCountRef.current&&prevAutoCountRef.current.halfDone)||0};
  }
},[pat,focusColour,_pulseCells,recordAutoActivity,halfStitchCounts]);

const _dragMarkOnToggle=useCallback(function(idx){
  // C3: single-cell tap from useDragMark (touch + mouse). Uses the
  // standard pushTrackHistory machinery for a single-cell undo step.
  // BUGFIX: read live `done` via doneRef so two taps inside one render
  // frame each see the most-recent array, not a stale closure copy.
  const cur=doneRef.current;
  if(!pat||!cur)return;
  if(idx<0||idx>=pat.length)return;
  const cell=pat[idx];
  if(!cell||cell.id==='__skip__'||cell.id==='__empty__')return;
  // C3: colour-lock filter — match the legacy handlers' fullStitchMatchesFocus check.
  if(typeof isColourLocked==='function'&&isColourLocked()
     &&!fullStitchMatchesFocus(idx))return;
  const oldVal=cur[idx];
  const nv=oldVal?0:1;
  const nd=new Uint8Array(cur);
  nd[idx]=nv;
  pushTrackHistory([{idx:idx,oldVal:oldVal}]);
  applyDoneCountsDelta([{idx:idx,oldVal:oldVal}],pat,nd);
  doneRef.current=nd;
  setDone(nd);
  if(typeof renderStitch==='function')renderStitch();
  // BUGFIX (#2): mirror _commitBulk — explicitly record the single-tap so the
  // session timer starts immediately rather than depending on the doneCount
  // diff useEffect.
  if(oldVal!==nv){
    if(nv)recordAutoActivity(1,0);else recordAutoActivity(0,1);
    prevAutoCountRef.current={done:doneCountRef.current,halfDone:(halfStitchCounts&&halfStitchCounts.done)||(prevAutoCountRef.current&&prevAutoCountRef.current.halfDone)||0};
  }
},[pat,focusColour,isColourLocked,fullStitchMatchesFocus,pushTrackHistory,applyDoneCountsDelta,renderStitch,recordAutoActivity,halfStitchCounts]);

const _dragMarkOnCommitDrag=useCallback(function(set,intent){
  _commitBulk(set,intent,'drag');
},[_commitBulk]);

const _dragMarkOnCommitRange=useCallback(function(set,intent){
  _commitBulk(set,intent,'range');
},[_commitBulk]);

// Hook itself — gated by edit mode + non-track stitchMode (returns idle).
// C3: useDragMark is the unified pointer pipeline (touch + mouse). The
// `trackerDragMark` user preference (default true) lets users opt out at
// runtime. The legacy `window.B2_DRAG_MARK_ENABLED` global remains
// supported only as a QA/automation override — set it to false to force
// the hook off (e.g. for regression repro). Source assertions in
// tests/dragMark.test.js + tests/c3LegacyHandlersRemoved.test.js verify
// the wiring.
const _dragMarkPref=(typeof window!=='undefined'&&window.UserPrefs&&typeof window.UserPrefs.get==='function')?window.UserPrefs.get('trackerDragMark'):true;
const _dragMarkOverrideOff=(typeof window!=='undefined'&&window.B2_DRAG_MARK_ENABLED===false);
const _dragMarkFlag=!_dragMarkOverrideOff&&_dragMarkPref!==false;
const _dragMarkActive=_dragMarkFlag&&!isEditMode&&stitchMode==="track"&&!!pat&&!!done;
const _dragMark=(typeof window!=='undefined'&&window.useDragMark)
  ?window.useDragMark({
    w:sW,h:sH,pattern:pat,done:done,
    cellAtPoint:_dragMarkCellAtPoint,
    onToggleCell:_dragMarkOnToggle,
    onCommitDrag:_dragMarkOnCommitDrag,
    onCommitRange:_dragMarkOnCommitRange,
    isEditMode:!_dragMarkActive,
  })
  :{handlers:{},dragState:{mode:'idle',path:new Set(),anchor:null,intent:null}};
const dragMarkHandlers=_dragMark.handlers;
const dragMarkState=_dragMark.dragState;

// C3: useDragMark now owns both touch AND mouse pointer events. The
// previous touch-only gate is no longer needed because legacy mouse
// cell-marking has been removed from handleStitchMouseDown / Move / Up.

// ── C8 Phase 1 — first-stitch coachmark (Tracker) ─────────────────────
// Trigger condition: Tracker has a pattern AND the StitchingStyleOnboarding
// has finished AND no stitches are marked yet. Success: doneCount > 0.
const _trCoach = (typeof window.useCoachingSequence === 'function')
  ? window.useCoachingSequence('tracker')
  : { active: null, complete: ()=>{}, skip: ()=>{} };
const [_trCoachReady, _setTrCoachReady] = React.useState(false);
React.useEffect(()=>{
  _setTrCoachReady(false);
  if (!pat || styleOnboardingOpen || welcomeOpen) return;
  if (_trCoach.active !== 'firstStitch_tracker') return;
  if (doneCount > 0) return;
  const t = setTimeout(()=>_setTrCoachReady(true), 600);
  return ()=>clearTimeout(t);
}, [!!pat, styleOnboardingOpen, welcomeOpen, _trCoach.active, doneCount]);
React.useEffect(()=>{
  if (_trCoach.active !== 'firstStitch_tracker') return;
  if (doneCount > 0) _trCoach.complete('firstStitch_tracker');
}, [doneCount, _trCoach.active]);
const _showTrFirstStitchCoach = _trCoachReady
  && _trCoach.active === 'firstStitch_tracker'
  && !!pat
  && !styleOnboardingOpen
  && !welcomeOpen
  && doneCount === 0;

return(
<>
<input ref={loadRef} type="file" accept=".json,.oxs,.xml,.png,.jpg,.jpeg,.gif,.bmp,.webp,.pdf" onChange={loadProject} style={{display:"none"}}/>
<Header page="tracker" onOpen={()=>loadRef.current.click()} onSave={pat?saveProject:null} onExportPDF={pat?()=>setModal('pdf_export'):null} onNewProject={pat?()=>{if(confirm("Start fresh? Your current project is auto-saved.")){if(typeof ProjectStorage!=='undefined')ProjectStorage.clearActiveProject();else localStorage.removeItem("crossstitch_active_project");if(onGoHome){onGoHome();}else{window.location.href='home.html';}}}:null} onOpenProject={typeof ProjectStorage!=='undefined'?()=>{ProjectStorage.listProjects().then(list=>{setProjectPickerList(list||[]);setProjectPickerOpen(true);}).catch(()=>{setProjectPickerList([]);setProjectPickerOpen(true);});}:undefined} onPreferences={typeof window.PreferencesModal!=='undefined'?()=>setPreferencesOpen(true):undefined} setModal={setModal} projectName={pat&&pal?(projectName || (sW + '×' + sH + ' pattern')):undefined} projectPct={pat&&pal&&totalStitchable>0?Math.round(doneCount/totalStitchable*100):undefined} onNameChange={pat&&pal?(n=>setProjectName(n)):undefined} showAutosaved={!!(pat&&pal)} />
{projectPickerOpen&&<TrackerProjectPicker
  list={projectPickerList}
  currentId={projectIdRef.current}
  onClose={()=>setProjectPickerOpen(false)}
  onPick={(meta)=>{
    // Close the modal immediately so the loading state doesn't appear stuck.
    setProjectPickerOpen(false);
    ProjectStorage.get(meta.id).then(p=>{
      if(p&&p.pattern&&p.settings){
        processLoadedProject(p);
        // Note: setActiveProject is synchronous (writes localStorage); do NOT chain .catch().
        try { ProjectStorage.setActiveProject(p.id); } catch(_) {}
      } else {
        alert("That project is empty or could not be loaded.");
      }
    }).catch(err=>{
      alert("Failed to load project: "+(err && err.message ? err.message : err));
    });
  }}
/>}
{preferencesOpen&&typeof window.PreferencesModal!=='undefined'&&React.createElement(window.PreferencesModal,{onClose:()=>setPreferencesOpen(false)})}
{namePromptOpen&&<NamePromptModal
  defaultName={projectName || (sW+'×'+sH+' pattern')}
  onConfirm={name=>{setProjectName(name);setNamePromptOpen(false);doSaveProject(name);}}
  onCancel={()=>setNamePromptOpen(false)}
/>}
{editDetailsOpen&&typeof EditProjectDetailsModal!=='undefined'&&<EditProjectDetailsModal
  projectId={projectIdRef.current}
  name={projectName || (sW+'×'+sH+' pattern')}
  designer={projectDesigner}
  description={projectDescription}
  onSave={({name,designer,description})=>{
    setProjectName(name);
    setProjectDesigner(designer);
    setProjectDescription(description);
    setEditDetailsOpen(false);
  }}
  onClose={()=>setEditDetailsOpen(false)}
/>}
{pat&&pal&&<>
{/* A2 (UX Phase 5) — bold edit-mode strip. Sits directly above the toolbar so
    users cannot miss that "Mark"/grid actions now overwrite stitches rather
    than record progress. aria-live="polite" announces entry once. */}
{isEditMode&&<div className="edit-mode-strip" role="status" aria-live="polite">
  <span className="edit-mode-strip__label">
    {Icons.warning&&Icons.warning()}
    <strong>Edit mode</strong>
    <span className="edit-mode-strip__hint">— grid taps modify the pattern, not your progress</span>
  </span>
  <button
    type="button"
    className="edit-mode-strip__exit"
    onClick={()=>{
      if(undoSnapshot!==null){setShowExitEditModal(true);}
      else{setIsEditMode(false);setUndoSnapshot(null);setSessionStartSnapshot(null);}
    }}
  >Exit edit mode</button>
</div>}
{/* ═══ TRACKER PILL TOOLBAR ═══ */}
<div className={"toolbar-row"+(isEditMode?" toolbar-row--edit":"")}><div className="pill-row" style={{display:'flex',alignItems:'center',justifyContent:'center'}}>
  <button
    type="button"
    className="tracker-hamburger"
    onClick={cycleLeftSidebar}
    aria-label={leftSidebarMode==="hidden"?"Show sidebar rail":leftSidebarMode==="rail"?"Expand sidebar":"Hide sidebar"}
    aria-expanded={leftSidebarOpen}
    title="Sidebar — tap to cycle hidden / rail / open"
  >{Icons.menu()}</button>
  {/* Phase 4 (UX-12) — wake-lock chip. Tap to toggle screen-stays-on. */}
  <button
    type="button"
    className={"tracker-wake-chip"+(wakeLockActive?" tracker-wake-chip--on":"")}
    onClick={toggleWakeLock}
    aria-pressed={wakeLockActive}
    aria-label={wakeLockActive?"Screen wake-lock on, tap to release":"Screen wake-lock off, tap to keep screen awake"}
    title={wakeLockActive?"Screen will stay awake — tap to release":"Tap to keep the screen awake while stitching"}
  ><span className="twc-dot" aria-hidden="true">{Icons.dot()}</span><span className="twc-label">{wakeLockActive?"Awake":"Sleep"}</span></button>
  {/* Touch-1 H-2: Focus mode toggle. */}
  <button
    type="button"
    className={"tracker-wake-chip"+(focusMode?" tracker-wake-chip--on":"")}
    onClick={()=>setFocusMode(v=>!v)}
    aria-pressed={focusMode}
    aria-label={focusMode?"Exit focus mode (F)":"Enter focus mode (F)"}
    title={focusMode?"Exit focus mode (F)":"Hide chrome — focus on the chart (F)"}
  >{(focusMode?(Icons.focusExit&&Icons.focusExit()):(Icons.focus&&Icons.focus()))}<span className="twc-label">Focus</span></button>
  <div ref={tStripRef} className={"pill"+(isEditMode?" pill--edit":"")}>
  <div className={"tb-grp"+(tStripCollapsed.stitch?" tb-hidden":"")}>
    <button className={"tb-btn"+(stitchMode==="track"?(isEditMode?" tb-btn--red":" tb-btn--green"):"")} onClick={()=>{setStitchMode("track");}} title={isEditMode?"Modify stitches (T)":"Mark stitch (T)"}>
      <svg width="11" height="11" viewBox="0 0 12 12"><line x1="1" y1="11" x2="11" y2="1" stroke="currentColor" strokeWidth="1.8"/><line x1="1" y1="1" x2="11" y2="11" stroke="currentColor" strokeWidth="1.8"/></svg>{isEditMode?"Modify":"Mark"}
    </button>
    <button className={"tb-btn"+(stitchMode==="navigate"?" tb-btn--on":"")} onClick={()=>{setStitchMode("navigate");}} title="Navigate (N)">Nav</button>
    {/* R11: Row mode toggle */}
    {!isEditMode&&<button className={"tb-btn"+(rowModeActive?" tb-btn--on":"")} onClick={()=>{setRowModeActive(v=>!v);setCurrentRow(0);}} aria-label="Toggle row mode" aria-pressed={rowModeActive} title="Row mode — work row by row (R)">{Icons.rowMode()}</button>}
    {/* R11: Row mode prev/next controls */}
    {!isEditMode&&rowModeActive&&<>
      <button className="tb-btn" disabled={currentRow<=0} onClick={()=>setCurrentRow(r=>Math.max(0,r-1))} title="Previous row">Prev</button>
      <span className="tb-zoom-lbl" style={{minWidth:56,textAlign:'center',fontVariantNumeric:'tabular-nums'}}>Row {currentRow+1}/{sH||1}</span>
      <button className="tb-btn" disabled={currentRow>=(sH||1)-1} onClick={()=>setCurrentRow(r=>Math.min((sH||1)-1,r+1))} title="Next row">Next</button>
    </>}
    {/* C3: range-mode toolbar button removed; long-press + shift+click own range via useDragMark. */}
  </div>
  <div className="tb-sdiv"/>
  {/* Phase 2/5: View mode pill, highlight cycle, counting aids and Focus
      area button removed — now live in the left sidebar's View / Highlight
      / Tools tabs. The Sidebar opens via the hamburger button to the left. */}
  <div className="tb-flex"/>
  <div className="tb-zoom-grp tb-desktop-only">
    <span className="tb-zoom-lbl">Zoom</span>
    <button onClick={()=>setStitchZoom(z=>Math.max(0.3,+(z-0.25).toFixed(2)))} title="Zoom out" style={{padding:"0 5px",fontSize:15,border:"0.5px solid var(--border)",borderRadius:4,background:"var(--surface-secondary)",cursor:"pointer",lineHeight:"22px",fontWeight:600}}>−</button>
    <input type="range" min={0.1} max={3} step={0.05} value={stitchZoom} onChange={e=>setStitchZoom(Number(e.target.value))} style={{width:55}}/>
    <button onClick={()=>setStitchZoom(z=>Math.min(4,+(z+0.25).toFixed(2)))} title="Zoom in" style={{padding:"0 5px",fontSize:15,border:"0.5px solid var(--border)",borderRadius:4,background:"var(--surface-secondary)",cursor:"pointer",lineHeight:"22px",fontWeight:600}}>+</button>
    <span className="tb-zoom-pct">{Math.round(stitchZoom*100)}%</span>
    <button className="tb-fit-btn" onClick={fitSZ}>Fit</button>
  </div>
  <div className="tb-overflow-wrap" ref={tOverflowRef}>
    <button className="tb-overflow-btn" onClick={()=>setTOverflowOpen(o=>!o)} title="More options">···</button>
    {tOverflowOpen&&<div className="tb-overflow-menu">
      {!isEditMode&&pat&&pal&&<><button className="tb-ovf-item" onClick={()=>{setTOverflowOpen(false);setEditDetailsOpen(true);}}>{Icons.pencil()} Edit project details…</button><div className="tb-ovf-sep"/></>}
      {!isEditMode&&<>
        {tStripCollapsed.stitch&&<><span className="tb-ovf-lbl">Stitch</span>
          <button className={"tb-ovf-item"+(stitchMode==="track"?" tb-ovf-item--on":"")} onClick={()=>{setStitchMode("track");setTOverflowOpen(false);}} style={{display:'inline-flex',alignItems:'center',gap:6}}>Mark{stitchMode==="track"&&Icons.check?<span aria-hidden="true" style={{display:'inline-flex'}}>{Icons.check()}</span>:null}</button>
          <button className={"tb-ovf-item"+(stitchMode==="navigate"?" tb-ovf-item--on":"")} onClick={()=>{setStitchMode("navigate");setTOverflowOpen(false);}} style={{display:'inline-flex',alignItems:'center',gap:6}}>Navigate{stitchMode==="navigate"&&Icons.check?<span aria-hidden="true" style={{display:'inline-flex'}}>{Icons.check()}</span>:null}</button>
          {/* R11: Row mode in overflow menu */}
          <button className={"tb-ovf-item"+(rowModeActive?" tb-ovf-item--on":"")} onClick={()=>{setRowModeActive(v=>!v);setCurrentRow(0);setTOverflowOpen(false);}} style={{display:'inline-flex',alignItems:'center',gap:6}}>{Icons.rowMode()} Row mode{rowModeActive&&Icons.check?<span aria-hidden="true" style={{display:'inline-flex'}}>{Icons.check()}</span>:null}</button>
          <div className="tb-ovf-sep"/>
        </>}
        {tStripCollapsed.view&&<><span className="tb-ovf-lbl">View</span>
          {[['symbol','Symbol'],['colour','Col+Symbol'],['highlight','Highlight']].map(([k,l])=><button key={k} className={"tb-ovf-item"+(stitchView===k?" tb-ovf-item--on":"")} onClick={()=>{setStitchView(k);if(k!=="highlight"){setFocusColour(null);}else if(!focusColour){const first=pal.find(p=>{const dc=colourDoneCounts[p.id];return !dc||dc.done<dc.total;})||pal[0];if(first)setFocusColour(first.id);}setTOverflowOpen(false);}} style={{display:'inline-flex',alignItems:'center',gap:6}}>{l}{stitchView===k&&Icons.check?<span aria-hidden="true" style={{display:'inline-flex'}}>{Icons.check()}</span>:null}</button>)}
          <div className="tb-ovf-sep"/>
        </>}
        {stitchMode==="navigate"&&<><span className="tb-ovf-lbl">Parking</span>
          <div style={{padding:"4px 14px 6px"}}><select value={selectedColorId||""} onChange={e=>setSelectedColorId(e.target.value||null)} style={{fontSize:'var(--text-xs)',padding:"4px 8px",borderRadius:'var(--radius-sm)',border:"0.5px solid var(--border)",width:"100%"}}>
            <option value="">No parking colour</option>{pal.map(p=><option key={p.id} value={p.id}>DMC {p.id} — {p.name.slice(0,20)}</option>)}
          </select></div>
          {parkMarkers.length>0&&<button className="tb-ovf-item" onClick={()=>{setParkMarkers([]);setParkLayers({});setTOverflowOpen(false);}}>Clear park markers</button>}
          {totalParkedColours>0&&<button className="tb-ovf-item" onClick={()=>{setAllParkLayersVisible(allParkLayersHidden);setTOverflowOpen(false);}}>{allParkLayersHidden?"Show":"Hide"} all parked colours</button>}
          <div className="tb-ovf-sep"/>
        </>}
        {stitchMode==="track"&&trackHistory.length>0&&<button className="tb-ovf-item" onClick={()=>{undoTrack();setTOverflowOpen(false);}} style={{display:'inline-flex',alignItems:'center',gap:6}}><span aria-hidden="true" style={{display:'inline-flex'}}>{Icons.undo?Icons.undo():null}</span>Undo ({trackHistory.length})</button>}
        {stitchMode==="track"&&redoStack.length>0&&<button className="tb-ovf-item" onClick={()=>{redoTrack();setTOverflowOpen(false);}}>↪ Redo ({redoStack.length})</button>}
        {done&&doneCount>0&&<button className="tb-ovf-item" style={{color:"var(--danger)"}} onClick={()=>{if(confirm("Clear all progress?")){var nd=new Uint8Array(pat.length);setDone(nd);recomputeAllCounts(pat,nd,halfStitches,halfDone);setTrackHistory([]);setRedoStack([]);}setTOverflowOpen(false);}}>Reset progress</button>}
        {pat&&pal&&<button className="tb-ovf-item" onClick={()=>{copyProgressSummary();setTOverflowOpen(false);}}>{Icons.clipboard()} Copy Progress Summary</button>}}
        <div className="tb-ovf-sep"/>
      </>}
      {isEditMode&&<>
        {undoSnapshot&&<button className="tb-ovf-item" style={{color:"var(--warning)"}} onClick={()=>{applyUndo();setTOverflowOpen(false);}}>{Icons.undo?Icons.undo():null} Undo Edit</button>}
        <button className="tb-ovf-item" style={{color:"var(--danger)"}} onClick={()=>{handleRevertToOriginal();setTOverflowOpen(false);}}>Revert to Original</button>
        <button className="tb-ovf-item" onClick={()=>{if(undoSnapshot!==null){setShowExitEditModal(true);}else{setIsEditMode(false);setUndoSnapshot(null);setSessionStartSnapshot(null);}setTOverflowOpen(false);}}><span aria-hidden="true" style={{display:'inline-flex',verticalAlign:'-3px',marginRight:4}}>{Icons.chevronLeft?Icons.chevronLeft():null}</span>Exit correction mode</button>
        <div className="tb-ovf-sep"/>
      </>}
      {!isEditMode&&<><button className="tb-ovf-item" style={{color:"var(--text-secondary)"}} onClick={()=>{
        setSessionStartSnapshot({pat:[...pat],pal:deepClone(pal),threadOwned:deepClone(threadOwned),singleStitchEdits:new Map(singleStitchEdits)}); // PERF (perf-6 #5)
        setStitchMode("navigate");setFocusColour(null);setHoverInfo(null);setIsEditMode(true);setDrawer(true);setTOverflowOpen(false);
      }} title="Correct individual stitch colours — for imported patterns">Correct pattern colours…</button><div className="tb-ovf-sep"/></>
      }
      <button className="tb-ovf-item" onClick={()=>{setShowNavHelp(h=>!h);setTOverflowOpen(false);}}>{showNavHelp?"Hide":"Show"} controls help</button>
      <div className="tb-ovf-sep"/>
      <span className="tb-ovf-lbl">Tools</span>
      <button className={"tb-ovf-item"+(trackerPreviewOpen?" tb-ovf-item--on":"")} onClick={()=>{setTrackerPreviewOpen(v=>!v);setTOverflowOpen(false);}}>{Icons.eye()} Realistic preview{trackerPreviewOpen?" ":""}{trackerPreviewOpen?Icons.check():null}</button>
      <button className={"tb-ovf-item"+(threadUsageMode?" tb-ovf-item--on":"")} onClick={()=>{setThreadUsageMode(m=>m?null:"cluster");setTOverflowOpen(false);}}>Thread usage{threadUsageMode?" ":""}{threadUsageMode?Icons.check():null}</button>
      <button className={"tb-ovf-item"+(countingAidsEnabled?" tb-ovf-item--on":"")} onClick={()=>{setCountingAidsEnabled(v=>!v);setTOverflowOpen(false);}}>{Icons.barChart()} Counting aids{countingAidsEnabled?" ":""}{countingAidsEnabled?Icons.check():null}</button>
      <button className={"tb-ovf-item"} onClick={()=>{setLeftSidebarTab("view");setLeftSidebarOpen(true);setTOverflowOpen(false);}}>Layers{!Object.values(layerVis).every(Boolean)?" (filtered)":""}</button>
      <button className={"tb-ovf-item"+(statsView?" tb-ovf-item--on":"")} onClick={()=>{setStatsTab(projectIdRef.current||'all');setStatsView(v=>!v);setTOverflowOpen(false);}}>{Icons.barChart()} Stats{statsView?" ":""}{statsView?Icons.check():null}</button>
      <div className="tb-ovf-sep"/>
      <span className="tb-ovf-lbl">Focus Area</span>
      <button className={"tb-ovf-item"+(focusEnabled?" tb-ovf-item--on":"")} onClick={()=>{const next=!focusEnabled;setFocusEnabled(next);if(next&&!focusBlock)setFocusBlock(_getStartBlock());setTOverflowOpen(false);}}>{Icons.eye()} Spotlight{focusEnabled?" ":""}{focusEnabled?Icons.check():null}</button>
      {focusEnabled&&!focusBlock&&<button className="tb-ovf-item" onClick={()=>{setFocusBlock(_getStartBlock());setTOverflowOpen(false);}}>Set focus to start block</button>}
      {focusEnabled&&focusBlock&&<button className="tb-ovf-item" onClick={()=>{setFocusBlock(null);setTOverflowOpen(false);}}>Clear focus block</button>}
      <button className={"tb-ovf-item"+(breadcrumbVisible?" tb-ovf-item--on":"")} onClick={()=>{setBreadcrumbVisible(v=>!v);setTOverflowOpen(false);}}>Breadcrumbs{breadcrumbVisible?" ":""}{breadcrumbVisible?Icons.check():null}</button>
      <button className="tb-ovf-item" onClick={()=>{setStyleOnboardingOpen(true);setTOverflowOpen(false);}}>Stitching style: {({block:"Block",royal:"Royal Rows",crosscountry:"Cross Country",freestyle:"Freestyle"})[stitchingStyle]||stitchingStyle}</button>
      {stitchingStyle!=="crosscountry"&&stitchingStyle!=="freestyle"&&<div style={{padding:"4px 14px 6px",fontSize:'var(--text-xs)',color:"var(--text-secondary)"}}>Block size: {blockW}×{blockH}
        <div style={{display:"flex",gap:'var(--s-1)',marginTop:'var(--s-1)',flexWrap:"wrap"}}>
          {[[10,10,"10×10"],[20,20,"20×20"]].map(([w,h,l])=><button key={l} onClick={()=>{setBlockW(w);setBlockH(h);}} style={{padding:"2px 7px",borderRadius:5,border:"1px solid "+(blockW===w&&blockH===h?"var(--accent)":"var(--border)"),background:blockW===w&&blockH===h?"var(--accent-light)":"var(--surface)",fontSize:10,cursor:"pointer"}}>{l}</button>)}
          <input type="number" inputMode="numeric" title="Custom width" placeholder="W" value={blockW} onChange={e=>setBlockW(Math.max(5,Math.min(100,parseInt(e.target.value)||10)))} style={{width:36,padding:"2px 4px",borderRadius:4,border:"1px solid var(--border)",fontSize:10}} min={5} max={100}/>
          <span style={{fontSize:10,lineHeight:"22px"}}>×</span>
          <input type="number" inputMode="numeric" title="Custom height" placeholder="H" value={blockH} onChange={e=>setBlockH(Math.max(5,Math.min(100,parseInt(e.target.value)||10)))} style={{width:36,padding:"2px 4px",borderRadius:4,border:"1px solid var(--border)",fontSize:10}} min={5} max={100}/>
        </div>
        {(blockW%10!==0||blockH%10!==0)&&<div style={{fontSize:10,color:"var(--accent-ink)",marginTop:3}}>May not align with 10-stitch grid lines.</div>}
      </div>}
      {(liveAutoStitches>0||totalTime>0)&&<>
        <div className="tb-ovf-sep"/>
        <span className="tb-ovf-lbl">Time Tracked</span>
        <div style={{padding:"4px 14px 2px",fontSize:'var(--text-xs)',color:"var(--text-secondary)"}}>
          {liveAutoStitches>0?<><span style={{color:"var(--success)"}}>● </span>{fmtTime(liveAutoElapsed)} · {liveAutoStitches} stitches active</>:<>Total: {fmtTime(totalTime)}</>}
          {estCompletion&&<div style={{fontSize:10,color:"var(--text-tertiary)",marginTop:2}}>~{fmtTime(estCompletion)} remaining</div>}
        </div>
      </>}
    </div>}
  </div>
</div>
  {liveAutoStitches > 0 && (
    <button className={"session-chip" + (liveAutoIsPaused||manuallyPaused ? " session-chip--paused" : "") + (inactivityPausedRef.current&&!manuallyPaused ? " session-chip--idle" : "")}
      title="Open session controls"
      onClick={() => {
        // Phase 3/5: chip is now glanceable only; click opens the
        // Session tab in the left sidebar where pause / resume / end
        // session live alongside the goal + thread-usage controls.
        setLeftSidebarTab("session");
        setLeftSidebarOpen(true);
      }}>
      <span className="dot"/>
      <span className="session-chip-icon" aria-hidden="true">{(manuallyPaused||inactivityPausedRef.current||liveAutoIsPaused)?(Icons.pause?Icons.pause():null):(Icons.play?Icons.play():null)}</span>
      {manuallyPaused ? `Paused · ${liveAutoStitches} st` : inactivityPausedRef.current ? `Idle · ${liveAutoStitches} st` : liveAutoIsPaused ? 'Paused' : `${fmtTime(liveAutoElapsed)} · ${liveAutoStitches} st`}
    </button>
  )}
</div></div>
{!isEditMode&&<div className="info-strip-wrap">
<div className="info-strip" aria-live="polite" role="button" tabIndex={0} title="Open session controls" onClick={()=>{
  // Phase 3/5: tapping the live progress strip opens the left
  // sidebar Session tab so all start/stop/configure actions live in
  // one place. The strip itself remains glanceable.
  setLeftSidebarTab("session");
  setLeftSidebarOpen(true);
}} onKeyDown={e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();setLeftSidebarTab("session");setLeftSidebarOpen(true);}}}>
  <div className="info-strip-bar">
    {progressPct>=100&&<div className="info-strip-fill info-strip-fill--done" style={{width:"100%"}}/>}
    {progressPct<100&&prevBarPct>0&&<div className="info-strip-fill" style={{width:prevBarPct+"%"}}/>}
    {progressPct<100&&todayBarPct>0&&<div className="info-strip-fill info-strip-today" style={{width:todayBarPct+"%"}}/>}
  </div>
  <div className="info-strip-row">
    <span className="info-strip-pct">{progressPct>=100?<>Complete! {Icons.star()}</>:<>{progressPct.toFixed(1)}%</>}</span>
    {liveAutoStitches>0&&<span className="info-strip-timer"><span className="info-strip-timer-icon" aria-hidden="true">{liveAutoIsPaused?(Icons.pause?Icons.pause():null):(Icons.clock?Icons.clock():null)}</span> {fmtTime(liveAutoElapsed)}</span>}
    {/* Plan B Phase 1: inline "Today: X" text removed — see Progress
        info chip beside the strip. todayStitchesForBar is now in the
        popover, the bar's accent segment still visualises today. */}
    {/* Phase 3/5: explicit-session start/stop button removed; lives in
        the left sidebar Session tab. Tap the strip itself to open it. */}
  </div>
</div>
<div className="app-info-chip-wrap info-strip-chip-wrap">
  <button
    ref={progressChipRef}
    type="button"
    className="app-info-chip info-strip-chip"
    aria-haspopup="dialog"
    aria-expanded={progressInfoOpen}
    title="Progress details"
    onClick={()=>setProgressInfoOpen(o=>!o)}
  >
    <span className="app-info-chip__label">Progress info</span>
    <span className="app-info-chip__chevron" aria-hidden="true">{Icons.chevronDown?Icons.chevronDown():null}</span>
  </button>
  {progressInfoOpen && window.AppInfoPopover && (() => {
    const totalSec = (typeof totalTime === 'number' ? totalTime : 0);
    const speedPerHour = totalSec > 0 && doneCount > 0 ? Math.round(doneCount / (totalSec/3600)) : 0;
    const remainingStitches = Math.max(0, effectiveCombinedTotal - effectiveCombinedDone);
    const fmtL = window.fmtTimeL || (s => Math.round(s/3600)+'h');
    const progressRows = [
      ['Done', `${Math.round(effectiveCombinedDone).toLocaleString()} / ${Math.round(effectiveCombinedTotal).toLocaleString()} (${progressPct.toFixed(1)}%)`],
      ['Today', todayStitchesForBar.toLocaleString()],
      ['This week', weekStitchesForChip.toLocaleString()]
    ];
    const timeRows = [['Time spent', fmtL(totalSec)]];
    if (speedPerHour > 0) {
      timeRows.push(['Average pace', `${speedPerHour.toLocaleString()} st/hr`]);
      if (remainingStitches > 0) {
        timeRows.push(['Remaining', fmtL(Math.round(remainingStitches/speedPerHour*3600))]);
      }
    }
    return React.createElement(window.AppInfoPopover, {
      open: true,
      onClose: () => setProgressInfoOpen(false),
      triggerRef: progressChipRef,
      ariaLabel: 'Progress details'
    },
      React.createElement(window.AppInfoSection, { title: 'Pattern progress' },
        React.createElement(window.AppInfoGrid, { rows: progressRows })),
      React.createElement(window.AppInfoDivider),
      React.createElement(window.AppInfoSection, { title: 'Time' },
        React.createElement(window.AppInfoGrid, { rows: timeRows }))
    );
  })()}
</div>
</div>}
{hlIntroBannerVisible&&!isEditMode&&<div style={{display:"flex",alignItems:"center",justifyContent:"space-between",background:"var(--surface-secondary)",border:"1px solid var(--accent-light)",borderRadius:'var(--radius-sm)',padding:"6px 10px",fontSize:'var(--text-xs)',color:"var(--accent)",marginBottom:'var(--s-1)',gap:'var(--s-2)'}}>
  <span>Highlight mode — press <kbd style={{fontSize:10,padding:"0 3px",border:"1px solid var(--accent-light)",borderRadius:3,background:"var(--surface)"}}>1</kbd>–<kbd style={{fontSize:10,padding:"0 3px",border:"1px solid var(--accent-light)",borderRadius:3,background:"var(--surface)"}}>4</kbd> to change style, <kbd style={{fontSize:10,padding:"0 3px",border:"1px solid var(--accent-light)",borderRadius:3,background:"var(--surface)"}}>C</kbd> for counting aids, <kbd style={{fontSize:10,padding:"0 3px",border:"1px solid var(--accent-light)",borderRadius:3,background:"var(--surface)"}}>[</kbd> <kbd style={{fontSize:10,padding:"0 3px",border:"1px solid var(--accent-light)",borderRadius:3,background:"var(--surface)"}}>]</kbd> to cycle colours</span>
  <button onClick={()=>{setHlIntroBannerVisible(false);clearTimeout(hlIntroTimerRef.current);}} aria-label="Dismiss" style={{background:"none",border:"none",cursor:"pointer",color:"var(--accent-light)",flexShrink:0,padding:0,lineHeight:1,display:'inline-flex'}}>{Icons.x?Icons.x():"\u00D7"}</button>
</div>}
{!sessionOnboardingShown&&liveAutoStitches>0&&statsSessions.length===0&&(
  <div className="session-onboarding-toast">
    <span style={{display:'inline-flex',alignItems:'center',gap:6}}>{Icons.info?Icons.info():null} Sessions are tracked automatically as you stitch. View stats via the {Icons.barChart?<span aria-hidden="true" style={{display:'inline-flex',verticalAlign:'-3px'}}>{Icons.barChart()}</span>:null} button in the Session panel.</span>
    <button onClick={()=>{setSessionOnboardingShown(true);try{localStorage.setItem("cs_sessionOnboardingDone","1");}catch(_){}}}>Got it</button>
  </div>
)}
{focusEnabled&&focusBlock&&stitchingStyle!=="crosscountry"&&(
  <div style={{display:"flex",alignItems:"center",gap:6,padding:"3px 10px 3px 8px",background:"var(--accent-light)",border:"1px solid var(--accent-border)",borderRadius:20,fontSize:'var(--text-xs)',fontWeight:600,color:"var(--accent)",cursor:"pointer",userSelect:"none",width:"fit-content",marginBottom:'var(--s-1)'}} onClick={()=>setStyleOnboardingOpen(true)} title="Tap to change stitching style">
    {({block:"Block",royal:"Royal Rows",freestyle:"Freestyle"})[stitchingStyle]||stitchingStyle} · {focusBlock.by+1},{focusBlock.bx+1}
  </div>
)}
{sessionSavedToast&&(
  <div className="session-toast">
    {!sessionSavedToast.showNoteInput?(
      <>
        <span style={{display:'inline-flex',alignItems:'center',gap:6}}>{Icons.check?Icons.check():null} Session saved — {sessionSavedToast.stitches} {sessionSavedToast.stitches===1?"stitch":"stitches"} in {formatStatsDuration(sessionSavedToast.durationMin*60)}</span>
        <button onClick={()=>setSessionSavedToast(prev=>({...prev,showNoteInput:true}))}>Add note</button>
        <button onClick={()=>setSessionSavedToast(null)} aria-label="Dismiss" style={{display:'inline-flex',alignItems:'center'}}>{Icons.x?Icons.x():"\u00D7"}</button>
      </>
    ):(
      <>
        <input autoFocus maxLength={200} placeholder="What did you work on?" value={sessionSavedToast.noteText}
          onChange={e=>setSessionSavedToast(prev=>({...prev,noteText:e.target.value}))}
          onKeyDown={e=>{if(e.key==="Enter"){editSessionNote(sessionSavedToast.sessionId,sessionSavedToast.noteText);setSessionSavedToast(null);}if(e.key==="Escape")setSessionSavedToast(null);}}/>
        <button onClick={()=>{editSessionNote(sessionSavedToast.sessionId,sessionSavedToast.noteText);setSessionSavedToast(null);}}>Save</button>
      </>
    )}
  </div>
)}
</>}
<div className="cs-page-content" style={{maxWidth:(!statsView&&pat&&pal)?'none':1100,margin:(!statsView&&pat&&pal)?0:"0 auto",padding:(!statsView&&pat&&pal)?0:"20px 16px"}}>
  {loadError&&<div style={{background:"var(--danger-soft)",border:"1px solid var(--danger-soft)",borderRadius:'var(--radius-md)',padding:"8px 14px",fontSize:'var(--text-sm)',color:"var(--danger)",marginBottom:'var(--s-3)'}}>{loadError}</div>}
  {copied==="progress"&&<div style={{background:"var(--success-soft)",border:"1px solid var(--success-soft)",borderRadius:'var(--radius-md)',padding:"8px 14px",fontSize:'var(--text-sm)',color:"var(--success)",fontWeight:600,marginBottom:'var(--s-3)',display:'inline-flex',alignItems:'center',gap:6}}>{Icons.check?Icons.check():null} Progress summary copied to clipboard!</div>}
  {importSuccess && (
    <div style={{
      background: "var(--success-soft)", border: "1px solid var(--success-soft)", borderRadius:'var(--radius-md)',
      padding: "8px 14px", fontSize:'var(--text-sm)', color: "var(--success)", fontWeight: 600, marginBottom:'var(--s-3)',
      display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12
    }}>
      <span style={{display:'inline-flex',alignItems:'center',gap:6}}>{Icons.check?Icons.check():null} {importSuccess}</span>
      <button onClick={()=>setImportSuccess(null)} style={{
        padding: "3px 10px", borderRadius:'var(--radius-sm)', border: "1px solid var(--success-soft)", background: "var(--surface)",
        cursor: "pointer", fontSize:'var(--text-xs)', fontWeight: 600, color: "var(--success)", flexShrink: 0
      }}>Dismiss</button>
    </div>
  )}

  {statsView&&pat&&<StatsContainer statsTab={statsTab} setStatsTab={setStatsTab} statsSessions={statsSessions} statsSettings={statsSettings} totalCompleted={doneCount} totalStitches={totalStitchable} halfStitchCounts={halfStitchCounts} onEditNote={editSessionNote} onUpdateSettings={setStatsSettings} onClose={()=>setStatsView(false)} projectName={projectName||(sW+'\u00D7'+sH+' pattern')} palette={pal} colourDoneCounts={colourDoneCounts} achievedMilestones={achievedMilestones} done={done} pat={pat} sW={sW} sH={sH} doneSnapshots={doneSnapshots} setDoneSnapshots={setDoneSnapshots} sections={sections} currentProjectId={projectIdRef.current} onOpenProject={(meta)=>{ProjectStorage.get(meta.id).then(project=>{if(project&&project.pattern&&project.settings){processLoadedProject(project);try{ProjectStorage.setActiveProject(project.id);}catch(_){};setStatsView(false);}}).catch(()=>{});}}/>}

  {trackerPreviewOpen&&pat&&<TrackerPreviewModal pat={pat} cmap={cmap} sW={sW} sH={sH} fabricCt={fabricCt} level={trackerPreviewLevel} onLevelChange={setTrackerPreviewLevel} onClose={()=>setTrackerPreviewOpen(false)}/>}

  {!statsView&&!pat&&<div style={{maxWidth:500, margin:"40px auto", textAlign:"center"}}>
    <div className="card" style={{padding:"30px"}}>
      <h2 style={{fontSize:24, fontWeight:700, color:"var(--text-primary)", marginBottom:'var(--s-2)'}}>{Icons.thread()} Stitch Tracker</h2>
      <p style={{fontSize:15, color:"var(--text-secondary)", marginBottom:24}}>Track your cross stitch progress</p>

      <div style={{display:"grid",gap:'var(--s-4)'}}>
        <button onClick={()=>loadRef.current.click()} style={{padding:"14px",fontSize:'var(--text-xl)',borderRadius:'var(--radius-xl)',border:"0.5px solid var(--border)",background:"var(--surface-secondary)",cursor:"pointer",fontWeight:600,color:"var(--text-primary)",display:"flex",alignItems:"center",justifyContent:"center",gap:'var(--s-2)'}}>
          {Icons.folder()} Load Project
        </button>
      </div>

      <div style={{marginTop:24, textAlign:"left", background:"var(--surface-secondary)", padding:"16px", borderRadius:'var(--radius-xl)', border:"0.5px solid var(--border)"}}>
        <p style={{fontSize:'var(--text-md)', fontWeight:600, color:"var(--text-secondary)", marginBottom:'var(--s-3)', marginTop:0}}>Supported formats:</p>
        <div style={{display:"flex", flexDirection:"column", gap:10}}>
          <div style={{display:"flex", alignItems:"center", gap:10, fontSize:'var(--text-md)', color:"var(--text-secondary)"}}>
            <span style={{padding:"3px 8px", background:"var(--surface-secondary)", color:"var(--text-primary)", borderRadius:'var(--radius-sm)', border:"1px solid var(--accent-light)", fontWeight:600, fontSize:'var(--text-xs)', width:64, textAlign:"center", flexShrink:0}}>.json</span>
            Cross Stitch Pattern Generator project files
          </div>
          <div style={{display:"flex", alignItems:"center", gap:10, fontSize:'var(--text-md)', color:"var(--text-secondary)"}}>
            <span style={{padding:"3px 8px", background:"var(--surface-secondary)", color:"var(--accent)", borderRadius:'var(--radius-sm)', border:"1px solid var(--accent-light)", fontWeight:600, fontSize:'var(--text-xs)', width:64, textAlign:"center", flexShrink:0}}>.oxs</span>
            KG-Chart / Pattern Keeper XML format
          </div>
          <div style={{display:"flex", alignItems:"center", gap:10, fontSize:'var(--text-md)', color:"var(--text-secondary)"}}>
            <span style={{padding:"3px 8px", background:"var(--success-soft)", color:"var(--success)", borderRadius:'var(--radius-sm)', border:"1px solid var(--success-soft)", fontWeight:600, fontSize:'var(--text-xs)', width:64, textAlign:"center", flexShrink:0}}>.png .jpg</span>
            Pixel art images (each pixel = one stitch)
          </div>
          <div style={{display:"flex", alignItems:"center", gap:10, fontSize:'var(--text-md)', color:"var(--text-secondary)"}}>
            <span style={{padding:"3px 8px", background:"var(--danger-soft)", color:"var(--danger)", borderRadius:'var(--radius-sm)', border:"1px solid var(--danger-soft)", fontWeight:600, fontSize:'var(--text-xs)', width:64, textAlign:"center", flexShrink:0}}>.pdf</span>
            Pattern Keeper compatible PDF charts
          </div>
        </div>
      </div>

      <div style={{marginTop:30, paddingTop:20, borderTop:"0.5px solid var(--border)"}}>
        <p style={{fontSize:'var(--text-lg)', color:"var(--text-secondary)", marginBottom:10}}>Need a pattern?</p>
        <a href="home.html?tab=create" style={{color:"var(--accent)", fontWeight:600, textDecoration:"none", display:'inline-flex', alignItems:'center', gap:4}}><span aria-hidden="true" style={{display:'inline-flex'}}>{Icons.chevronRight?Icons.chevronRight():null}</span>Pattern Creator</a>
      </div>
    </div>
  </div>}

  {!statsView&&pat&&pal&&<><div className="cs-main">
    {/* Phase 5: backdrop scrim — only visible on mobile while the
        drawer is open. Tap to close. CSS controls visibility (hidden
        on >=900px) so desktop layout is untouched. */}
    {leftSidebarMode==="open"&&<div className="lpanel-backdrop" onClick={()=>setLeftSidebarOpen(false)} aria-hidden="true"/>}
    {/* Touch-1 H-1: rail mode. A 56 px-wide vertical strip with the
        active highlight swatch + an expand chevron. Single-tap on the
        chevron opens the full sidebar; tap on the swatch opens it
        scrolled to the highlight tab. */}
    {leftSidebarMode==="rail"&&<aside className="lpanel lpanel--rail" role="complementary" aria-label="Tracker sidebar (rail)">
      <div className="lpanel-rail-content">
        {(()=>{
          const selEntry=selectedColorId&&pal?pal.find(p=>p.id===selectedColorId):null;
          if(!selEntry||!selEntry.rgb)return null;
          return <button
            type="button"
            className="lpanel-rail-swatch"
            style={{background:"rgb("+selEntry.rgb.join(",")+")"}}
            onClick={()=>{setLeftSidebarTab("highlight");setLeftSidebarMode("open");}}
            aria-label={"Highlighted colour: "+(selEntry.name||selEntry.id)}
            title={selEntry.name||selEntry.id}
          />;
        })()}
        <button
          type="button"
          className="lpanel-rail-btn"
          onClick={()=>setLeftSidebarMode("open")}
          aria-label="Expand sidebar"
          title="Expand sidebar"
        >{Icons.chevronRight&&Icons.chevronRight()}</button>
        <button
          type="button"
          className="lpanel-rail-btn"
          onClick={()=>setLeftSidebarMode("hidden")}
          aria-label="Hide sidebar"
          title="Hide sidebar"
        >{Icons.x&&Icons.x()}</button>
      </div>
    </aside>}
    {/* ═══ LEFT SIDEBAR (toolbar-rework phase 1) ═══
        Mirrors Highlight / View / Session controls so the toolbar pill
        and the rpanel "More" tab can be trimmed in later phases. The
        old controls remain wired during phase 1 to avoid disrupting
        in-flight sessions during the migration. */}
    {leftSidebarMode==="open"&&<div className={"lpanel lpanel--open"} role="complementary" aria-label="Tracker sidebar">
      {(()=>{
        const leftSidebarTabs=[["highlight","Highlight"],["view","View"],["session","Session"],["tools","Tools"],["notes","Notes"],["legend","Legend"]];
        const handleLeftSidebarTabKeyDown=(e,currentKey)=>{
          let nextKey=null;
          const currentIndex=leftSidebarTabs.findIndex(([k])=>k===currentKey);
          if(e.key==="ArrowLeft"){
            e.preventDefault();
            nextKey=leftSidebarTabs[(currentIndex<=0?leftSidebarTabs.length:currentIndex)-1][0];
          }else if(e.key==="ArrowRight"){
            e.preventDefault();
            nextKey=leftSidebarTabs[(currentIndex+1)%leftSidebarTabs.length][0];
          }else if(e.key==="Home"){
            e.preventDefault();
            nextKey=leftSidebarTabs[0][0];
          }else if(e.key==="End"){
            e.preventDefault();
            nextKey=leftSidebarTabs[leftSidebarTabs.length-1][0];
          }
          if(!nextKey||nextKey===currentKey)return;
          setLeftSidebarTab(nextKey);
          const tablist=e.currentTarget.closest('[role="tablist"]');
          if(!tablist)return;
          const nextTab=tablist.querySelector('[role="tab"][data-lp-tab="'+(typeof CSS!=="undefined"&&CSS.escape?CSS.escape(nextKey):nextKey)+'"]');
          if(nextTab&&typeof nextTab.focus==="function")nextTab.focus();
        };
        return <div className="lp-tabs" role="tablist" aria-label="Tracker sidebar sections">
          {leftSidebarTabs.map(([k,l])=>
            <button
              key={k}
              type="button"
              role="tab"
              data-lp-tab={k}
              aria-selected={leftSidebarTab===k}
              tabIndex={leftSidebarTab===k?0:-1}
              className={"lp-tab"+(leftSidebarTab===k?" lp-tab--on":"")+(k==="legend"?" lp-tab--mobile-only":"")}
              onClick={()=>setLeftSidebarTab(k)}
              onKeyDown={(e)=>handleLeftSidebarTabKeyDown(e,k)}
            >{l}</button>
          )}
          <button type="button" className="lp-close" onClick={()=>setLeftSidebarOpen(false)} aria-label="Close sidebar" title="Close sidebar">{Icons.x?Icons.x():"\u00D7"}</button>
        </div>;
      })()}
      <div className="lp-tab-content">

      {/* ── Tab: Highlight ── */}
      {leftSidebarTab==="highlight"&&<div className="lp-section">
        <div className="lp-heading">Colour focus</div>
        <div style={{display:"flex",alignItems:"center",gap:6,marginBottom:10}}>
          <button className="lp-btn" onClick={()=>{if(!focusableColors.length)return;const idx=focusableColors.findIndex(p=>p.id===focusColour);const prev=focusableColors[(idx<=0?focusableColors.length:idx)-1];if(stitchView!=="highlight")setStitchView("highlight");setFocusColour(prev.id);}} title="Previous colour ([)" aria-label="Previous colour">{Icons.chevronLeft?Icons.chevronLeft():"<"}</button>
          <div style={{flex:1,minWidth:0,display:"flex",alignItems:"center",gap:6}}>
            {focusColour&&cmap&&cmap[focusColour]?(()=>{const cp=cmap[focusColour];return(
              <>
                <span style={{width:14,height:14,borderRadius:3,background:`rgb(${cp.rgb})`,border:"1px solid var(--border)",flexShrink:0}}/>
                <span style={{fontSize:'var(--text-sm)',fontWeight:700}}>DMC {focusColour}</span>
                <span style={{fontSize:'var(--text-xs)',color:"var(--text-tertiary)",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{cp.name||""}</span>
              </>
            );})():<span style={{fontSize:'var(--text-xs)',color:"var(--text-tertiary)"}}>No focus</span>}
          </div>
          <button className="lp-btn" onClick={()=>{if(!focusableColors.length)return;const idx=focusableColors.findIndex(p=>p.id===focusColour);const next=focusableColors[(idx+1)%focusableColors.length];if(stitchView!=="highlight")setStitchView("highlight");setFocusColour(next.id);}} title="Next colour (])" aria-label="Next colour">{Icons.chevronRight?Icons.chevronRight():">"}</button>
          {focusColour&&<button className="lp-btn lp-btn--ghost" onClick={()=>setFocusColour(null)} title="Clear focus" aria-label="Clear focus">{Icons.x?Icons.x():"\u00D7"}</button>}
        </div>

        <div className="lp-heading">Mode</div>
        <div className="lp-segmented" style={{marginBottom:10}}>
          {[["isolate","Isolate"],["outline","Outline"],["tint","Tint"],["spotlight","Spotlight"]].map(([m,l])=>
            <button key={m} className={"lp-seg"+(highlightMode===m?" lp-seg--on":"")} onClick={()=>{ensureFocusColour();setHighlightMode(m);}}>{l}</button>
          )}
        </div>

        {highlightMode==="isolate"&&<div style={{display:"flex",alignItems:"center",gap:'var(--s-2)',marginBottom:'var(--s-2)',fontSize:'var(--text-xs)'}}>
          <span style={{color:"var(--text-secondary)",flexShrink:0,minWidth:60}}>Visibility</span>
          <input type="range" min={0} max={60} value={Math.round(trackerDimLevel*100)} onChange={e=>{const v=parseInt(e.target.value)/100;setTrackerDimLevel(v);try{localStorage.setItem("cs_trDimLv",v);}catch(_){}}} style={{flex:1,accentColor:"var(--accent)"}}/>
          <span style={{width:34,textAlign:"right",fontVariantNumeric:"tabular-nums"}}>{Math.round(trackerDimLevel*100)}%</span>
        </div>}
        {highlightMode==="tint"&&<div style={{display:"flex",alignItems:"center",gap:'var(--s-2)',marginBottom:'var(--s-2)',fontSize:'var(--text-xs)'}}>
          <input type="color" value={tintColor} onChange={e=>{setTintColor(e.target.value);try{localStorage.setItem("cs_tintColor",e.target.value);}catch(_){}}} style={{width:28,height:22,padding:0,border:"1px solid var(--border)",borderRadius:4,cursor:"pointer"}} aria-label="Tint colour"/>
          <input type="range" min={10} max={80} value={Math.round(tintOpacity*100)} onChange={e=>{const v=parseInt(e.target.value)/100;setTintOpacity(v);try{localStorage.setItem("cs_tintOp",v);}catch(_){}}} style={{flex:1,accentColor:"var(--accent)"}} aria-label="Tint opacity"/>
          <span style={{width:34,textAlign:"right",fontVariantNumeric:"tabular-nums"}}>{Math.round(tintOpacity*100)}%</span>
        </div>}
        {highlightMode==="spotlight"&&<div style={{display:"flex",alignItems:"center",gap:'var(--s-2)',marginBottom:'var(--s-2)',fontSize:'var(--text-xs)'}}>
          <span style={{color:"var(--text-secondary)",flexShrink:0,minWidth:60}}>Dim</span>
          <input type="range" min={5} max={50} value={Math.round(spotDimOpacity*100)} onChange={e=>{const v=parseInt(e.target.value)/100;setSpotDimOpacity(v);try{localStorage.setItem("cs_spotDimOp",v);}catch(_){}}} style={{flex:1,accentColor:"var(--accent)"}}/>
          <span style={{width:34,textAlign:"right",fontVariantNumeric:"tabular-nums"}}>{Math.round(spotDimOpacity*100)}%</span>
        </div>}

        <div className="lp-heading" style={{marginTop:10}}>Counting aids</div>
        <label style={{display:"flex",alignItems:"center",gap:6,marginBottom:'var(--s-2)',fontSize:'var(--text-xs)',cursor:"pointer"}}>
          <input type="checkbox" checked={countingAidsEnabled} onChange={e=>setCountingAidsEnabled(e.target.checked)} style={{cursor:"pointer",accentColor:"var(--accent)"}}/>
          <span>Show counting aids</span>
        </label>
        {countingAidsEnabled&&<>
          <div style={{display:"flex",alignItems:"center",gap:'var(--s-2)',marginBottom:6,fontSize:'var(--text-xs)'}}>
            <span style={{color:"var(--text-secondary)",flexShrink:0,minWidth:60}}>Runs</span>
            <div className="lp-segmented" style={{flex:1}}>
              {[[0,"Off"],[1,"All"],[3,"3+"],[5,"5+"],[10,"10+"]].map(([v,l])=>
                <button key={v} className={"lp-seg"+(countRunMin===v?" lp-seg--on":"")} onClick={()=>setCountRunMin(v)}>{l}</button>
              )}
            </div>
          </div>
          {countRunMin>0&&<div style={{display:"flex",alignItems:"center",gap:'var(--s-2)',marginBottom:6,fontSize:'var(--text-xs)'}}>
            <span style={{color:"var(--text-secondary)",flexShrink:0,minWidth:60}}>Direction</span>
            <div className="lp-segmented" style={{flex:1}}>
              {[["h","Horizontal"],["v","Vertical"],["both","Both"]].map(([v,l])=>
                <button key={v} className={"lp-seg"+(countRunDir===v?" lp-seg--on":"")} onClick={()=>setCountRunDir(v)}>{l}</button>
              )}
            </div>
          </div>}
          <label style={{display:"flex",alignItems:"center",gap:6,fontSize:'var(--text-xs)',cursor:"pointer"}}>
            <input type="checkbox" checked={countNinjaEnabled} onChange={e=>setCountNinjaEnabled(e.target.checked)} style={{cursor:"pointer",accentColor:"var(--accent-hover)"}}/>
            <span>Highlight ninja stitches</span>
          </label>
        </>}

        <div className="lp-heading" style={{marginTop:10}}>Skip</div>
        <label style={{display:"flex",alignItems:"center",gap:6,marginBottom:'var(--s-1)',fontSize:'var(--text-xs)',cursor:"pointer"}}>
          <input type="checkbox" checked={highlightSkipDone} onChange={e=>setHighlightSkipDone(e.target.checked)} style={{cursor:"pointer",accentColor:"var(--accent)"}}/>
          <span>Skip completed colours when cycling</span>
        </label>
        <label style={{display:"flex",alignItems:"center",gap:6,fontSize:'var(--text-xs)',cursor:"pointer"}}>
          <input type="checkbox" checked={onlyStarted} onChange={e=>setOnlyStarted(e.target.checked)} style={{cursor:"pointer",accentColor:"var(--accent)"}}/>
          <span>Only colours already started</span>
        </label>
      </div>}

      {/* ── Tab: View ── */}
      {leftSidebarTab==="view"&&<div className="lp-section">
        <div className="lp-heading">Mode</div>
        <div className="lp-segmented" style={{marginBottom:10}}>
          {[['symbol','Symbol'],['colour','Colour'],['highlight','Highlight']].map(([k,l])=>
            <button key={k} className={"lp-seg"+(stitchView===k?" lp-seg--on":"")} onClick={()=>{setStitchView(k);if(k!=="highlight"){setFocusColour(null);}else if(!focusColour){const first=pal.find(p=>{const dc=colourDoneCounts[p.id];return !dc||dc.done<dc.total;})||pal[0];if(first)setFocusColour(first.id);}}}>{l}</button>
          )}
        </div>

        <div className="lp-heading">Zoom</div>
        <div style={{display:"flex",alignItems:"center",gap:6,marginBottom:10}}>
          <button className="lp-btn" onClick={()=>setStitchZoom(z=>Math.max(0.1,+(z-0.25).toFixed(2)))} aria-label="Zoom out">−</button>
          <input type="range" min={0.1} max={3} step={0.05} value={stitchZoom} onChange={e=>setStitchZoom(Number(e.target.value))} style={{flex:1,accentColor:"var(--accent)"}} aria-label="Zoom level"/>
          <button className="lp-btn" onClick={()=>setStitchZoom(z=>Math.min(4,+(z+0.25).toFixed(2)))} aria-label="Zoom in">+</button>
          <span style={{minWidth:40,textAlign:"right",fontSize:'var(--text-xs)',fontVariantNumeric:"tabular-nums"}}>{Math.round(stitchZoom*100)}%</span>
          <button className="lp-btn lp-btn--ghost" onClick={fitSZ}>Fit</button>
        </div>

        <div className="lp-heading">Rendering</div>
        <label style={{display:"flex",alignItems:"center",gap:6,marginBottom:6,fontSize:'var(--text-xs)',cursor:"pointer"}}>
          <input type="checkbox" checked={lockDetailLevel} onChange={e=>setLockDetailLevel(e.target.checked)} style={{cursor:"pointer",accentColor:"var(--accent)"}}/>
          <span>Lock detail tier</span>
        </label>
        <div style={{display:"flex",alignItems:"center",gap:'var(--s-2)',marginBottom:10,fontSize:'var(--text-xs)'}}>
          <span style={{color:"var(--text-secondary)",flexShrink:0,minWidth:80}}>Zoomed-out fade</span>
          <select value={String(lowZoomFade)} disabled={lockDetailLevel} onChange={e=>setLowZoomFade(parseFloat(e.target.value))} style={{flex:1,padding:"3px 6px",borderRadius:4,border:"1px solid var(--border)",background:lockDetailLevel?"var(--surface-tertiary)":"var(--surface)"}}>
            <option value="0">Off</option>
            <option value="0.15">Subtle</option>
            <option value="0.55">Strong</option>
          </select>
        </div>

        <div className="lp-heading">Layers</div>
        {STITCH_LAYERS.map(layer=>{
          const count=layerCounts[layer.id];
          const vis=layerVis[layer.id];
          return <label key={layer.id} style={{display:"flex",alignItems:"center",gap:6,padding:"3px 0",fontSize:'var(--text-xs)',cursor:"pointer",opacity:count>0?1:0.4}}>
            <input type="checkbox" checked={vis} onChange={()=>{setSoloPreState(null);setLayerVis(v=>({...v,[layer.id]:!v[layer.id]}));}} style={{cursor:"pointer",accentColor:"var(--accent)"}}/>
            <span style={{flex:1}}>{layer.label}</span>
            <span style={{fontSize:10,color:"var(--text-tertiary)"}}>{count.toLocaleString()}</span>
          </label>;
        })}
      </div>}

      {/* ── Tab: Session ── */}
      {leftSidebarTab==="session"&&<div className="lp-section">
        <div className="lp-heading">Session {liveAutoStitches>0&&<span className="badge">Live</span>}</div>
        {explicitSession?(()=>{
          const elapsed=Math.floor((Date.now()-explicitSession.startTime)/1000);
          const stitchesDone=liveAutoStitches;
          const timeRemaining=explicitSession.timeAvail?Math.max(0,explicitSession.timeAvail-elapsed):null;
          const goalReached=(explicitSession.stitchGoal&&stitchesDone>=explicitSession.stitchGoal)||(explicitSession.timeAvail&&elapsed>=explicitSession.timeAvail);
          return(<>
            <div className="sess-card" style={{borderColor:"var(--accent-border)",background:"var(--accent-light)"}}>
              <div className="row"><span className="lbl">{timeRemaining!==null?"Remaining":"Elapsed"}</span><span className="val" style={{fontWeight:700,color:"var(--accent)"}}>{fmtTime(timeRemaining!==null?timeRemaining:elapsed)}</span></div>
              <div className="row"><span className="lbl">Stitches</span><span className="val">{stitchesDone}{explicitSession.stitchGoal?` / ${explicitSession.stitchGoal}`:""}</span></div>
              {stitchesDone>0&&elapsed>0&&<div className="row"><span className="lbl">Speed</span><span className="val">{(stitchesDone/(elapsed/3600)).toFixed(0)} st/hr</span></div>}
            </div>
            {goalReached&&<div style={{fontSize:'var(--text-sm)',color:"var(--success)",background:"var(--success-soft)",padding:"6px 10px",borderRadius:'var(--radius-sm)',marginTop:6,textAlign:"center",fontWeight:600}}>Goal reached!</div>}
            <button className="lp-btn lp-btn--danger" style={{marginTop:'var(--s-2)',width:"100%"}} onClick={()=>{
              const dur=liveAutoElapsed>0?liveAutoElapsed:Math.floor((Date.now()-explicitSession.startTime)/1000);
              const bks=breadcrumbs.filter(b=>b.sessionIdx===(statsSessions?statsSessions.length:0)).length;
              const _sess=currentAutoSessionRef.current;
              const _undone=_sess&&typeof _sess.stitchesUndone==='number'?_sess.stitchesUndone:0;
              const netSessionDelta=liveAutoStitches-_undone;
              setSessionSummaryData({durationSeconds:dur,stitchesCompleted:liveAutoStitches,blocksCompleted:bks,coloursCompleted:[],progressPctBefore:totalStitchable>0?Math.round((doneCount-netSessionDelta)/totalStitchable*100):null,progressPctAfter:totalStitchable>0?Math.round(doneCount/totalStitchable*100):null});
              setExplicitSession(null);
            }}>End session</button>
          </>);
        })():<>
          <div className="sess-card">
            <div className="row"><span className="lbl">Time</span><span className="val">{fmtTime(liveAutoElapsed)}</span></div>
            <div className="row"><span className="lbl">Stitches</span><span className="val">{liveAutoStitches}</span></div>
            {liveAutoStitches>0&&liveAutoElapsed>0&&<div className="row"><span className="lbl">Speed</span><span className="val">{(liveAutoStitches/(liveAutoElapsed/60)).toFixed(1)} st/min</span></div>}
            <div className="row"><span className="lbl">Total time</span><span className="val">{fmtTime(totalTime+liveAutoElapsed)}</span></div>
          </div>
          <button className="lp-btn lp-btn--primary" style={{marginTop:'var(--s-2)',width:"100%"}} onClick={()=>setSessionConfigOpen(true)}>Start session</button>
        </>}
        <button className="lp-btn lp-btn--ghost" style={{marginTop:'var(--s-2)',width:'100%'}} onClick={()=>{if(!statsView){setStatsTab(projectIdRef.current||'all');}setStatsView(v=>!v);}}>{statsView?"Hide":"View"} full stats</button>
      </div>}

      {/* ── Tab: Tools (phase 4) ──
          Houses the heavy "look at the canvas differently" controls:
          realistic preview, thread-usage analysis, focus-area / spotlight
          and the optional suggestions feed. These were previously
          scattered across the toolbar overflow and the rpanel "More"
          tab. */}
      {leftSidebarTab==="tools"&&<div className="lp-section">
        <div className="lp-heading">Realistic preview</div>
        <button className={"lp-btn"+(trackerPreviewOpen?" lp-btn--primary":"")} style={{width:"100%",marginBottom:10}} onClick={()=>setTrackerPreviewOpen(v=>!v)}>
          {Icons.eye?Icons.eye():null}{" "}{trackerPreviewOpen?"Close preview":"Open realistic preview"}
        </button>

        <div className="lp-heading" style={{marginTop:6,display:"flex",justifyContent:"space-between",alignItems:"center"}}>
          <span>Thread usage</span>
          {threadUsageMode&&<button className="lp-btn lp-btn--ghost" style={{padding:"2px 8px",minHeight:0,fontSize:10}} onClick={()=>setThreadUsageMode(null)} title="Hide thread usage overlay">{Icons.x?Icons.x():"\u00D7"}</button>}
        </div>
        <div className="lp-segmented" style={{marginBottom:'var(--s-2)',width:"100%"}}>
          {[["cluster","Cluster"],["distance","Isolation"]].map(([m,l])=>
            <button key={m} className={"lp-seg"+(threadUsageMode===m?" lp-seg--on":"")} onClick={()=>setThreadUsageMode(m)}>{l}</button>
          )}
        </div>
        {threadUsageSummary&&<div style={{padding:"8px 10px",borderRadius:'var(--radius-md)',background:"var(--surface-secondary)",border:"1px solid var(--border)",fontSize:'var(--text-xs)',marginBottom:10}}>
          <div style={{display:"flex",justifyContent:"space-between",marginBottom:3}}><span style={{color:"var(--text-secondary)"}}>Confetti</span><span style={{fontWeight:700,color:"var(--danger)"}}>{threadUsageSummary.isolated.toLocaleString()} ({threadUsageSummary.total>0?((threadUsageSummary.isolated/threadUsageSummary.total)*100).toFixed(1):0}%)</span></div>
          <div style={{display:"flex",justifyContent:"space-between",marginBottom:3}}><span style={{color:"var(--text-secondary)"}}>Small (2–4)</span><span style={{fontWeight:600,color:"var(--accent-ink)"}}>{threadUsageSummary.small.toLocaleString()}</span></div>
          <div style={{display:"flex",justifyContent:"space-between",marginBottom:3}}><span style={{color:"var(--text-secondary)"}}>Medium (5–19)</span><span style={{fontWeight:600,color:"var(--text-secondary)"}}>{threadUsageSummary.medium.toLocaleString()}</span></div>
          <div style={{display:"flex",justifyContent:"space-between",marginBottom:6}}><span style={{color:"var(--text-secondary)"}}>Large (20+)</span><span style={{fontWeight:600,color:"var(--success)"}}>{threadUsageSummary.large.toLocaleString()}</span></div>
          {threadUsageSummary.estChanges>0&&<div style={{display:"flex",justifyContent:"space-between",paddingTop:5,borderTop:"0.5px solid var(--border)"}}><span style={{color:"var(--text-secondary)"}}>Est. thread changes</span><span style={{fontWeight:700}}>~{threadUsageSummary.estChanges.toLocaleString()}</span></div>}
        </div>}

        <div className="lp-heading" style={{marginTop:6}}>Focus area</div>
        <label style={{display:"flex",alignItems:"center",gap:6,marginBottom:6,fontSize:'var(--text-xs)',cursor:"pointer"}}>
          <input type="checkbox" checked={focusEnabled} onChange={e=>{const next=e.target.checked;setFocusEnabled(next);if(next&&!focusBlock)setFocusBlock(_getStartBlock());}} style={{cursor:"pointer",accentColor:"var(--accent)"}}/>
          <span>Spotlight focus block</span>
        </label>
        {stitchingStyle!=="crosscountry"&&stitchingStyle!=="freestyle"&&<>
          <div style={{fontSize:'var(--text-xs)',color:"var(--text-secondary)",marginBottom:'var(--s-1)'}}>Block size: {blockW}×{blockH}</div>
          <div style={{display:"flex",gap:'var(--s-1)',marginBottom:'var(--s-2)',flexWrap:"wrap"}}>
            {[[10,10,"10×10"],[20,20,"20×20"]].map(([w,h,l])=>
              <button key={l} className={"lp-btn"+(blockW===w&&blockH===h?" lp-btn--primary":"")} style={{padding:"3px 8px",minHeight:0,fontSize:10}} onClick={()=>{setBlockW(w);setBlockH(h);}}>{l}</button>
            )}
            <input type="number" inputMode="numeric" aria-label="Custom block width" placeholder="W" value={blockW} onChange={e=>setBlockW(Math.max(5,Math.min(100,parseInt(e.target.value)||10)))} style={{width:42,padding:"3px 5px",borderRadius:4,border:"1px solid var(--border)",fontSize:'var(--text-xs)'}} min={5} max={100}/>
            <span style={{fontSize:'var(--text-xs)',lineHeight:"24px",color:"var(--text-tertiary)"}}>×</span>
            <input type="number" inputMode="numeric" aria-label="Custom block height" placeholder="H" value={blockH} onChange={e=>setBlockH(Math.max(5,Math.min(100,parseInt(e.target.value)||10)))} style={{width:42,padding:"3px 5px",borderRadius:4,border:"1px solid var(--border)",fontSize:'var(--text-xs)'}} min={5} max={100}/>
          </div>
        </>}
        <div style={{display:"flex",alignItems:"center",gap:'var(--s-2)',marginBottom:6,fontSize:'var(--text-xs)'}}>
          <span style={{color:"var(--text-secondary)",flexShrink:0,minWidth:60}}>Style</span>
          <button className="lp-btn lp-btn--ghost" style={{flex:1,justifyContent:"flex-start"}} onClick={()=>setStyleOnboardingOpen(true)} title="Change stitching style">
            {({block:"Block",royal:"Royal Rows",crosscountry:"Cross Country",freestyle:"Freestyle"})[stitchingStyle]||stitchingStyle}
          </button>
        </div>
        <label style={{display:"flex",alignItems:"center",gap:6,marginBottom:10,fontSize:'var(--text-xs)',cursor:"pointer"}}>
          <input type="checkbox" checked={breadcrumbVisible} onChange={e=>setBreadcrumbVisible(e.target.checked)} style={{cursor:"pointer",accentColor:"var(--accent)"}}/>
          <span>Show breadcrumbs</span>
        </label>

        <div className="lp-heading" style={{marginTop:6}}>Suggestions</div>
        <label style={{display:"flex",alignItems:"center",gap:6,fontSize:'var(--text-xs)',cursor:"pointer"}}>
          <input type="checkbox" checked={recEnabled} onChange={e=>{const v=e.target.checked;setRecEnabled(v);try{localStorage.setItem("cs_recEnabled",v?"1":"0");}catch(_){}}} style={{cursor:"pointer",accentColor:"var(--accent)"}}/>
          <span>Surface next-block suggestions</span>
        </label>
        {recEnabled&&recommendations&&recommendations.top.length>0&&<div style={{marginTop:'var(--s-2)',fontSize:'var(--text-xs)',color:"var(--text-tertiary)"}}>
          {recommendations.top.length} block{recommendations.top.length===1?"":"s"} suggested · top: row {Math.floor(recommendations.top[0].idx/(analysisResult.regionCols||1))*(analysisResult.regionSize||10)+1}, col {(recommendations.top[0].idx%(analysisResult.regionCols||1))*(analysisResult.regionSize||10)+1}
        </div>}
      </div>}

      {/* ── Tab: Notes (phase 4) ──
          Project metadata + at-a-glance time totals. Designer and
          description are inline-editable; saves debounce through the
          existing project-storage path. */}
      {leftSidebarTab==="notes"&&<div className="lp-section">
        <div className="lp-heading">Designer</div>
        <input type="text" value={projectDesigner} onChange={e=>setProjectDesigner(e.target.value)} placeholder="e.g. Satsuma Street" maxLength={120} style={{width:"100%",padding:"6px 8px",borderRadius:'var(--radius-sm)',border:"1px solid var(--border)",fontSize:'var(--text-sm)',fontFamily:"inherit",marginBottom:10}}/>

        <div className="lp-heading">Description</div>
        <textarea value={projectDescription} onChange={e=>setProjectDescription(e.target.value)} placeholder="Notes about this project…" maxLength={2000} rows={4} style={{width:"100%",padding:"6px 8px",borderRadius:'var(--radius-sm)',border:"1px solid var(--border)",fontSize:'var(--text-sm)',fontFamily:"inherit",marginBottom:10,resize:"vertical"}}/>

        <div className="lp-heading">Project info</div>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:"8px 16px",fontSize:'var(--text-xs)',marginBottom:10}}>
          <div>
            <div style={{color:"var(--text-tertiary)",fontWeight:600,marginBottom:1}}>Started</div>
            <div style={{fontWeight:600,color:"var(--text-primary)"}}>{createdAtRef.current?new Date(createdAtRef.current).toLocaleDateString():"—"}</div>
          </div>
          <div>
            <div style={{color:"var(--text-tertiary)",fontWeight:600,marginBottom:1}}>Pattern size</div>
            <div style={{fontWeight:600,color:"var(--text-primary)"}}>{sW} × {sH}</div>
          </div>
          <div>
            <div style={{color:"var(--text-tertiary)",fontWeight:600,marginBottom:1}}>Stitchable</div>
            <div style={{fontWeight:600,color:"var(--text-primary)"}}>{totalStitchable.toLocaleString()}</div>
          </div>
          <div>
            <div style={{color:"var(--text-tertiary)",fontWeight:600,marginBottom:1}}>Colours</div>
            <div style={{fontWeight:600,color:"var(--text-primary)"}}>{pal.length}</div>
          </div>
        </div>

        <div className="lp-heading">Time</div>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:"8px 16px",fontSize:'var(--text-xs)',marginBottom:10}}>
          <div>
            <div style={{color:"var(--text-tertiary)",fontWeight:600,marginBottom:1}}>Total logged</div>
            <div style={{fontWeight:600,color:"var(--text-primary)"}}>{fmtTime(totalTime+liveAutoElapsed)}</div>
          </div>
          <div>
            <div style={{color:"var(--text-tertiary)",fontWeight:600,marginBottom:1}}>Est. remaining</div>
            <div style={{fontWeight:600,color:"var(--text-primary)"}}>{estCompletion?fmtTime(estCompletion):"—"}</div>
          </div>
        </div>

        <div style={{display:"flex",gap:6,marginTop:6}}>
          <button className="lp-btn" style={{flex:1}} onClick={()=>copyProgressSummary()}>{Icons.clipboard?Icons.clipboard():null}{" "}Copy summary</button>
          <button className="lp-btn" style={{flex:1}} onClick={handleEditInCreator}>{Icons.pencil?Icons.pencil():null}{" "}Edit in Creator</button>
        </div>
      </div>}

      {/* ── Tab: Legend (phase 5, mobile only) ──
          On <=899px the rpanel is hidden (CSS) and the palette legend
          folds into the left drawer as its own tab. The tab button is
          also CSS-hidden on desktop, so the tab is unreachable in the
          desktop layout where the rpanel is already showing the same
          list. */}
      {leftSidebarTab==="legend"&&<div className="lp-section lp-section--mobile-only" style={{display:"flex",flexDirection:"column",flex:1,minHeight:0}}>
        <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:'var(--s-2)'}}>
          <span className="lp-heading" style={{margin:0}}>Palette legend <span className="badge">{pal.length}</span></span>
          <label style={{display:"inline-flex",alignItems:"center",gap:'var(--s-1)',fontSize:'var(--text-xs)',color:"var(--text-tertiary)"}}>
            <span>Sort</span>
            <select value={legendSort} onChange={e=>setLegendSort(e.target.value)} style={{fontSize:'var(--text-xs)',padding:"2px 4px",borderRadius:4,border:"1px solid var(--border)",background:"var(--surface)",cursor:"pointer",fontFamily:"inherit"}} aria-label="Sort palette legend">
              <option value="id">DMC ID</option>
              <option value="done">% done</option>
              <option value="count">Stitch count</option>
            </select>
          </label>
        </div>
        <div className="col-list" style={{maxHeight:"none",flex:1,overflowY:"auto"}}>
          {(()=>{
            const rows=pal.map(p=>{
              const dc=colourDoneCounts[p.id]||{total:0,done:0,halfTotal:0,halfDone:0};
              const totalWithHalf=dc.total+dc.halfTotal*0.5;
              const doneWithHalf=dc.done+dc.halfDone*0.5;
              const pct=totalWithHalf>0?Math.round(doneWithHalf/totalWithHalf*100):0;
              return {p,dc,pct,total:dc.total,complete:doneWithHalf>=totalWithHalf&&totalWithHalf>0};
            });
            if(legendSort==="done"){rows.sort((a,b)=>b.pct-a.pct);}
            else if(legendSort==="count"){rows.sort((a,b)=>b.total-a.total);}
            else{rows.sort((a,b)=>{const ai=String(a.p.id),bi=String(b.p.id);const an=parseInt(ai,10),bn=parseInt(bi,10);if(isFinite(an)&&isFinite(bn)&&String(an)===ai&&String(bn)===bi)return an-bn;return ai.localeCompare(bi);});}
            return rows.map(({p,dc,pct,complete})=>{
              const isFocused=focusColour===p.id;
              return <div key={p.id} className={"col-row"+(isFocused?" focus":"")} style={{opacity:complete&&!isFocused?0.55:1}} onClick={()=>{
                if(isEditMode){setEditModalColor(p);return;}
                setStitchView("highlight");
                setFocusColour(p.id);
                setLeftSidebarTab("highlight");
              }} title={"Focus DMC "+p.id+" and open Highlight tab"}>
                <div className="sw" style={{background:`rgb(${p.rgb})`}}/>
                <span className="sym">{p.symbol}</span>
                <span className="cid" style={{color:isFocused?"var(--accent)":complete?"var(--success)":"inherit"}}>{p.id}</span>
                <span className="nm">{p.type==="blend"?p.threads[0].name+"+"+p.threads[1].name:p.name}</span>
                {!isEditMode&&<>
                  <div className="prog"><div className="pf" style={{width:pct+"%"}}/></div>
                  <span className="ct">{dc.done}/{dc.total}</span>
                  {/* Multi-colour parking — per-colour visibility toggle.
                      Pip is hidden when this colour has no parked markers. */}
                  {parkCountsByColour[p.id]>0&&<button onClick={e2=>{e2.stopPropagation();toggleParkLayer(p.id);}} title={(isParkLayerVisible(p.id)?"Hide":"Show")+" "+parkCountsByColour[p.id]+" parked marker"+(parkCountsByColour[p.id]===1?"":"s")+" for this colour"} aria-label={(isParkLayerVisible(p.id)?"Hide":"Show")+" parked markers for DMC "+p.id} aria-pressed={isParkLayerVisible(p.id)} style={{display:"inline-flex",alignItems:"center",gap:3,fontSize:9,padding:"1px 5px",borderRadius:4,border:"1px solid var(--border)",background:isParkLayerVisible(p.id)?`rgb(${p.rgb[0]},${p.rgb[1]},${p.rgb[2]})`:"var(--surface)",color:isParkLayerVisible(p.id)?(luminance(p.rgb)>140?"#000":"#fff"):"var(--text-tertiary)",cursor:"pointer",whiteSpace:"nowrap",flexShrink:0,fontWeight:600,opacity:isParkLayerVisible(p.id)?1:0.55}}>P{parkCountsByColour[p.id]>1?("\u00D7"+parkCountsByColour[p.id]):""}</button>}
                  <button onClick={e2=>{e2.stopPropagation();if(!complete){const unmarked=dc.total-dc.done;if(unmarked>50&&!confirm("Mark all "+unmarked+" stitches of DMC "+p.id+" as done?"))return;}markColourDone(p.id,!complete);}} style={{fontSize:9,padding:"1px 6px",borderRadius:4,border:"1px solid "+(complete?"var(--danger-soft)":"var(--success-soft)"),background:complete?"var(--danger-soft)":"var(--success-soft)",color:complete?"var(--danger)":"var(--success)",cursor:"pointer",whiteSpace:"nowrap",flexShrink:0}} title={complete?"Mark colour as not done":"Mark colour as done"} aria-label={complete?"Mark colour as not done":"Mark colour as done"}>{complete?"Undo":(Icons.check?Icons.check():"\u2713")}</button>
                </>}
              </div>;
            });
          })()}
        </div>
      </div>}

      </div>{/* end lp-tab-content */}
    </div>}

    <div className="canvas-area" style={{padding:"12px 16px"}}>
    {showNavHelp&&!isEditMode&&(()=>{const isTouch=hasTouchRef.current;return(
    <div style={{marginBottom:'var(--s-2)',padding:"14px 16px",background:"var(--surface)",border:"1px solid var(--accent-light)",borderRadius:'var(--radius-lg)',fontSize:'var(--text-sm)'}}>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:10}}>
        <span style={{fontWeight:700,fontSize:'var(--text-md)',color:"var(--text-primary)"}}>Navigation &amp; Controls</span>
        <button onClick={()=>setShowNavHelp(false)} aria-label="Dismiss" style={{background:"none",border:"none",color:"var(--text-tertiary)",cursor:"pointer",padding:"0 4px",lineHeight:1,display:'inline-flex'}}>{Icons.x?Icons.x():"\u00D7"}</button>
      </div>
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:"6px 24px"}}>
        {[
          ["Pan",isTouch?"Drag one finger across the canvas":"Hold Space + drag  ·  or middle-click drag"],
          ["Zoom in / out",isTouch?"Pinch two fingers apart / together":"Ctrl + scroll  ·  or use − / + buttons"],
          ["Zoom to fit","Tap the Fit button"],
          ["Mark a stitch",isTouch?"Tap a cell":"Click a cell"],
          ["Mark multiple",isTouch?"Tap, then drag across cells":"Click + drag across cells — all set to same state"],
          ["Undo last marks","Undo button (top right)"],
          stitchView==="highlight"?["Cycle colours",isTouch?"Open the Highlight tab in the sidebar":"[ or ] keys"]:null,
          stitchView==="highlight"?["Clear focus","Tap the colour pill to show all colours"]:null,
          stitchMode==="navigate"?["Place crosshair","Click on any cell to drop a guide"]:null,
          stitchMode==="navigate"?["Park marker","Select a colour, then click to place a marker"]:null,
        ].filter(Boolean).map(([label,tip],i)=>(
          <div key={i} style={{display:"contents"}}>
            <div style={{color:"var(--text-secondary)",fontWeight:600,paddingTop:1}}>{label}</div>
            <div style={{color:"var(--text-primary)"}}>{tip}</div>
          </div>
        ))}
      </div>
      {!isTouch&&<div style={{marginTop:10,paddingTop:8,borderTop:"0.5px solid var(--surface-tertiary)",color:"var(--text-tertiary)",fontSize:'var(--text-xs)'}}>
        Tip: on a trackpad, two-finger scroll pans the canvas without any modifier key.
      </div>}
    </div>
    );})()}

    {scs < 6 && !isEditMode && (stitchView === "symbol" || stitchView === "colour") && <div style={{fontSize:'var(--text-sm)', color: "var(--text-secondary)", marginBottom: 6, background: "var(--surface-tertiary)", padding: "6px 10px", borderRadius:'var(--radius-md)'}}>To see symbols, you may need to zoom in.</div>}

    {/* ── Single banner slot (highest priority wins) ── */}
    {(()=>{
      if(isEditMode) return <div style={{fontSize:'var(--text-sm)',color:"var(--warning)",background:"var(--warning-soft)",padding:"6px 14px",borderRadius:'var(--radius-md)',marginBottom:6,border:"1px solid var(--warning)", fontWeight: 600}}>EDITING — <span style={{fontWeight:400}}>Tap a <b>stitch on the grid</b> to edit that cell only · Tap a <b>colour in the list below</b> to reassign all stitches of that colour</span></div>;
      if(advanceToast) return <div style={{fontSize:'var(--text-sm)',color:"var(--success)",background:"var(--success-soft)",padding:"6px 14px",borderRadius:'var(--radius-md)',marginBottom:6,border:"1px solid var(--success-soft)",fontWeight:600,display:'inline-flex',alignItems:'center',gap:6}}>{Icons.check?Icons.check():null} Complete! Next: {advanceToast}</div>;
      if(blockAdvanceToast) return <div style={{fontSize:'var(--text-sm)',color:"var(--accent)",background:"var(--accent-light)",padding:"6px 14px",borderRadius:'var(--radius-md)',marginBottom:6,border:"1px solid var(--accent-border)",fontWeight:600,display:"flex",justifyContent:"space-between",alignItems:"center"}}>
        <span style={{display:'inline-flex',alignItems:'center',gap:6}}>{Icons.check?Icons.check():null} {blockAdvanceToast.label} complete — {blockAdvanceToast.stitches} stitches</span>
        <div style={{display:"flex",gap:'var(--s-2)'}}>
          {blockAdvanceToast.next&&<button onClick={()=>{setFocusBlock(blockAdvanceToast.next);setBlockAdvanceToast(null);}} style={{fontSize:'var(--text-xs)',padding:"2px 8px",borderRadius:4,border:"1px solid var(--accent-border)",background:"var(--surface)",cursor:"pointer",fontWeight:600,color:"var(--accent)"}}>Next block</button>}
          <button onClick={()=>{setBlockAdvanceToast(null);setFocusBlock(null);}} style={{fontSize:'var(--text-xs)',padding:"2px 8px",borderRadius:4,border:"none",background:"none",cursor:"pointer",color:"var(--text-tertiary)"}}>Stay</button>
        </div>
      </div>;
      if(stitchMode==="track") return <div style={{fontSize:'var(--text-sm)',color:"var(--accent)",background:"var(--accent-light)",padding:"6px 14px",borderRadius:'var(--radius-md)',marginBottom:6,border:"0.5px solid var(--accent-border)"}}>{hasTouchRef.current?"Tap or drag to mark · Long-press a cell, then tap the opposite corner to fill a rectangle · Pinch to zoom":"Click or drag to mark/unmark cross stitches · Shift+click or long-press for rectangle fill · Space+drag to pan · Ctrl+scroll to zoom · Ctrl+Z undo"}{trackHistory.length>0?` · ${trackHistory.length} undo step${trackHistory.length>1?"s":""} available`:""}</div>;
      if(stitchMode==="navigate") return <div style={{fontSize:'var(--text-sm)',color:"var(--text-primary)",background:"var(--surface-tertiary)",padding:"6px 14px",borderRadius:'var(--radius-md)',marginBottom:6,border:"0.5px solid var(--border)"}}>{selectedColorId?"Click to park. Shift+click to move guide.":"Click to place guide crosshair"}{hasTouchRef.current?"":" · T for track mode"}</div>;
      if(!shortcutsHintDismissed&&pat) return <div style={{fontSize:'var(--text-sm)',color:"var(--text-tertiary)",background:"var(--surface-secondary)",padding:"5px 14px",borderRadius:'var(--radius-md)',marginBottom:6,border:"0.5px solid var(--border)",display:"flex",justifyContent:"space-between",alignItems:"center",gap:'var(--s-2)'}}><span>{Icons.lightbulb()} Press <kbd>?</kbd> for keyboard shortcuts</span><button onClick={()=>{localStorage.setItem("shortcuts_hint_dismissed","1");setShortcutsHintDismissed(true);}} aria-label="Dismiss" style={{background:"none",border:"none",cursor:"pointer",color:"var(--text-tertiary)",lineHeight:1,padding:0,display:"inline-flex",alignItems:"center"}}>{Icons.x?Icons.x():"\u00D7"}</button></div>;
      return null;
    })()}

    <div ref={stitchScrollRef} onScroll={()=>{if(!scrollRafRef.current){scrollRafRef.current=requestAnimationFrame(()=>{renderStitch();scrollRafRef.current=null;})}}} style={{overflow:"auto",maxHeight:drawer?340:600,border:"0.5px solid var(--border)",borderRadius:"8px 8px 0 0",background:"var(--surface-tertiary)",cursor:isPanning?"grabbing":isSpaceDownRef.current?"grab":(!isEditMode&&stitchMode==="track"?"crosshair":"default"),transition:"max-height 0.3s",position:"relative"}} onMouseUp={handleMouseUp} onMouseLeave={handleStitchMouseLeave}>
      <div style={{ position: 'sticky', top: 0, zIndex: 3, display: 'flex', width: 'max-content', background: 'var(--surface)', borderBottom: '1px solid var(--border)' }}>
        <div style={{ width: G, height: G, flexShrink: 0, position: 'sticky', left: 0, background: 'var(--surface)', borderRight: '1px solid var(--border)', zIndex: 4 }}></div>
        {Array.from({length: sW}, (_, x) => {
          let step = scs < 6 ? 10 : scs < 14 ? 5 : 1;
          let show = ((x + 1) % step === 0 || x === 0);
          let is10 = (x + 1) % 10 === 0;
          let is5 = (x + 1) % 5 === 0;
          return (
            <div key={x} style={{ width: scs, flexShrink: 0, height: G, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: Math.max(9, Math.min(11, scs * 0.6)), fontWeight: is10 ? 'bold' : is5 ? 600 : 400, color: is10 ? 'var(--text-primary)' : is5 ? 'var(--text-secondary)' : 'var(--text-muted)', fontFamily: 'monospace' }}>
              {show ? (x + 1) : ''}
            </div>
          );
        })}
      </div>
      <div style={{ display: 'flex', width: 'max-content' }}>
        <div style={{ position: 'sticky', left: 0, zIndex: 3, width: G, background: 'var(--surface)', borderRight: '1px solid var(--border)', display: 'flex', flexDirection: 'column' }}>
          {Array.from({length: sH}, (_, y) => {
            let step = scs < 6 ? 10 : scs < 14 ? 5 : 1;
            let show = ((y + 1) % step === 0 || y === 0);
            let is10 = (y + 1) % 10 === 0;
            let is5 = (y + 1) % 5 === 0;
            return (
              <div key={y} style={{ height: scs, flexShrink: 0, width: G, display: 'flex', alignItems: 'center', justifyContent: 'flex-end', paddingRight: 4, fontSize: Math.max(9, Math.min(11, scs * 0.6)), fontWeight: is10 ? 'bold' : is5 ? 600 : 400, color: is10 ? 'var(--text-primary)' : is5 ? 'var(--text-secondary)' : 'var(--text-muted)', fontFamily: 'monospace' }}>
                {show ? (y + 1) : ''}
              </div>
            );
          })}
        </div>
        <div style={{ position: 'relative' }}>
          <canvas ref={stitchRef} role="application" tabIndex="0" aria-label="Cross stitch pattern grid" style={{display:"block",position:"relative",zIndex:2, marginTop: -G, marginLeft: -G, touchAction:"none"}} onMouseDown={handleStitchMouseDown} onMouseMove={handleStitchMouseMove} onContextMenu={e=>e.preventDefault()} {...dragMarkHandlers}/>

          {/* B2 — drag-mark / range-select visual overlay (touch) */}
          {_dragMarkActive&&dragMarkState&&(dragMarkState.path.size>0||dragMarkState.anchor!=null||dragMarkPulse)&&(
            <div className={"drag-mark-overlay drag-mark-overlay--"+(dragMarkState.intent||'mark')}
                 style={{position:"absolute",top:-G,left:-G,zIndex:6,pointerEvents:"none",
                         width:sW*scs+G,height:sH*scs+G}}>
              {[...dragMarkState.path].map(function(idx){
                var x=(idx%sW)*scs+G, y=Math.floor(idx/sW)*scs+G;
                return <div key={"p"+idx} className="drag-mark-cell"
                            style={{left:x,top:y,width:scs,height:scs}}/>;
              })}
              {dragMarkState.anchor!=null&&(function(){
                var idx=dragMarkState.anchor;
                var x=(idx%sW)*scs+G, y=Math.floor(idx/sW)*scs+G;
                return <div key={"a"+idx} className="drag-mark-anchor"
                            style={{left:x,top:y,width:scs,height:scs}}/>;
              })()}
              {dragMarkPulse&&[...dragMarkPulse].map(function(idx){
                var x=(idx%sW)*scs+G, y=Math.floor(idx/sW)*scs+G;
                return <div key={"x"+idx} className="drag-mark-pulse cell-pulse"
                            style={{left:x,top:y,width:scs,height:scs}}/>;
              })}
            </div>
          )}

          {/* Thread usage overlay */}
          {threadUsageMode&&<canvas ref={threadUsageCanvasRef} style={{display:"block",position:"absolute",top:-G,left:-G,zIndex:3,pointerEvents:"none"}}/>}
          {/* Recommendation border overlay */}
          {recEnabled&&<canvas ref={recOverlayCanvasRef} style={{display:"block",position:"absolute",top:-G,left:-G,zIndex:4,pointerEvents:"none"}}/>}
          {/* Breadcrumb trail overlay (below focus overlay) */}
          {breadcrumbVisible&&<canvas ref={breadcrumbCanvasRef} style={{display:"block",position:"absolute",top:-G,left:-G,zIndex:5,pointerEvents:"none"}}/>}
          {/* Focus area spotlight overlay */}
          {focusEnabled&&focusBlock&&<canvas ref={focusOverlayCanvasRef} style={{display:"block",position:"absolute",top:-G,left:-G,zIndex:6,pointerEvents:"none"}}/>}
          {/* Counting aids overlay (block counts, run lengths, ninja stitches) */}
          {countingAidsEnabled&&stitchView==="highlight"&&focusColour&&<canvas ref={countingAidsCanvasRef} style={{display:"block",position:"absolute",top:-G,left:-G,zIndex:7,pointerEvents:"none"}}/>}

          {/* C3: range anchor overlay driven by useDragMark long-press anchor. */}
          {dragMarkState&&dragMarkState.mode==='range'&&dragMarkState.anchor!=null&&sW>0&&<div style={{
            position:'absolute',
            left:(dragMarkState.anchor%sW)*scs,
            top:Math.floor(dragMarkState.anchor/sW)*scs,
            width:scs,height:scs,
            border:'2px solid var(--accent)',
            borderRadius:2,
            pointerEvents:'none',
            zIndex:5,
            boxSizing:'border-box',
            animation:'range-anchor-pulse 1s ease-in-out infinite alternate'
          }}/>}

          <>
            <div ref={el => hoverRefs.current.row = el} style={{
              display: 'none', position: 'absolute', pointerEvents: 'none', background: 'rgba(100, 149, 237, 0.08)', zIndex: 3,
              willChange: 'transform'
            }} />
            <div ref={el => hoverRefs.current.col = el} style={{
              display: 'none', position: 'absolute', pointerEvents: 'none', background: 'rgba(100, 149, 237, 0.08)', zIndex: 3,
              willChange: 'transform'
            }} />
          </>
        </div>
      </div>
    </div>

    <div style={{background:"var(--text-primary)", color:"var(--surface)", padding:"6px 10px", borderRadius:"0 0 8px 8px", fontSize:'var(--text-sm)', fontWeight:500, display:"flex", alignItems:"center", minHeight:30, marginBottom:'var(--s-3)'}}>
      {hoverInfoCell ? (
        <>
          Row: {hoverInfoCell.row + 1} &nbsp;&nbsp; Col: {hoverInfoCell.col + 1}
          {hoverInfo && hoverInfo.row === hoverInfoCell.row + 1 && hoverInfo.col === hoverInfoCell.col + 1 && (
             <>&nbsp;&nbsp;&mdash;&nbsp;&nbsp; DMC {hoverInfo.id} {hoverInfo.name}</>
          )}
        </>
      ) : (
        <>&mdash;</>
      )}
    </div>

    {doneCount===0&&totalStitchable>0&&stitchMode==="track"&&<div style={{fontSize:'var(--text-xs)',color:"var(--accent-ink)",background:"var(--accent-soft)",border:"1px solid var(--accent-border)",borderRadius:'var(--radius-sm)',padding:"6px 10px",marginBottom:'var(--s-2)',textAlign:"center"}}>Tap any stitch on the canvas to mark it as done</div>}

    {/* Floating undo — mobile only (shown via CSS) */}
    {!isEditMode&&stitchMode==="track"&&trackHistory.length>0&&<button className="fab-undo" onClick={undoTrack} onContextMenu={e=>{e.preventDefault();if(redoStack.length)redoTrack();}} aria-label="Undo last stitch" title="Tap to undo · Long-press for redo">{Icons.undo?Icons.undo():null}</button>}

    </div>{/* end canvas-area */}

    {/* ═══ RIGHT PANEL — PALETTE LEGEND (phase 4) ═══
        Replaces the old Colours / Session / More tabs. Session lives in
        the lpanel Session tab; the Layers / Project Info / Quick
        Actions content from the old "More" tab has been folded into
        the lpanel Notes and View tabs. The right panel is now a
        single sortable legend; tapping a row sets the focus colour
        AND opens the Highlight tab on the left. */}
    <div className={"rpanel"+(mobileDrawerOpen?" rpanel--drawer-open":"")+(legendCollapsed?" rpanel--collapsed":"")}>
      <div className="rp-tabs" style={{paddingLeft:10,paddingRight:6,gap:6,alignItems:"center"}}>
        <button
          type="button"
          onClick={()=>setLegendCollapsed(c=>!c)}
          className="rpanel-collapse-btn"
          aria-expanded={!legendCollapsed}
          aria-label={legendCollapsed?"Expand palette legend":"Collapse palette legend"}
          title={legendCollapsed?"Expand palette legend":"Collapse palette legend"}
        >
          {window.Icons && (legendCollapsed?window.Icons.chevronLeft():window.Icons.chevronRight())}
        </button>
        <span style={{flex:1,fontSize:'var(--text-xs)',fontWeight:700,letterSpacing:"0.05em",textTransform:"uppercase",color:"var(--text-tertiary)"}}>Palette legend <span className="badge">{pal.length}</span></span>
        {!legendCollapsed && <label style={{display:"inline-flex",alignItems:"center",gap:'var(--s-1)',fontSize:10,color:"var(--text-tertiary)"}}>
          <span>Sort</span>
          <select value={legendSort} onChange={e=>setLegendSort(e.target.value)} style={{fontSize:10,padding:"2px 4px",borderRadius:4,border:"1px solid var(--border)",background:"var(--surface)",cursor:"pointer",fontFamily:"inherit"}} aria-label="Sort palette legend">
            <option value="id">DMC ID</option>
            <option value="done">% done</option>
            <option value="count">Stitch count</option>
          </select>
        </label>}
      </div>
      {!legendCollapsed && <div className="rp-tab-content">
      {/* Palette legend (sortable). Single list — focus + highlight in one tap. */}
      <div className="rp-section" style={{flex:1,minHeight:0,display:"flex",flexDirection:"column",overflow:"hidden"}}>
        <div className="col-list" style={{maxHeight:"none",flex:1,minHeight:0,overflowY:"auto"}}>
          {(()=>{
            const rows=pal.map(p=>{
              const dc=colourDoneCounts[p.id]||{total:0,done:0,halfTotal:0,halfDone:0};
              const totalWithHalf=dc.total+dc.halfTotal*0.5;
              const doneWithHalf=dc.done+dc.halfDone*0.5;
              const pct=totalWithHalf>0?Math.round(doneWithHalf/totalWithHalf*100):0;
              return {p,dc,pct,total:dc.total,doneWithHalf,totalWithHalf,complete:doneWithHalf>=totalWithHalf&&totalWithHalf>0};
            });
            if(legendSort==="done"){rows.sort((a,b)=>b.pct-a.pct);}
            else if(legendSort==="count"){rows.sort((a,b)=>b.total-a.total);}
            else{rows.sort((a,b)=>{const ai=String(a.p.id),bi=String(b.p.id);const an=parseInt(ai,10),bn=parseInt(bi,10);if(isFinite(an)&&isFinite(bn)&&String(an)===ai&&String(bn)===bi)return an-bn;return ai.localeCompare(bi);});}
            return rows.map(({p,dc,pct,complete})=>{
              const isFocused=focusColour===p.id;
              return <div key={p.id} className={"col-row"+(isFocused?" focus":"")} style={{opacity:complete&&!isFocused?0.55:1}} onClick={()=>{
                if(isEditMode){setEditModalColor(p);return;}
                // Single tap: set focus AND open the Highlight tab in the
                // left sidebar. This is the primary "show me this colour"
                // affordance now that the toolbar pill is trimmed.
                setStitchView("highlight");
                setFocusColour(p.id);
                setLeftSidebarTab("highlight");
                setLeftSidebarOpen(true);
              }} title={"Focus DMC "+p.id+" and open Highlight tab"}>
                <div className="sw" style={{background:`rgb(${p.rgb})`}}/>
                <span className="sym">{p.symbol}</span>
                <span className="cid" style={{color:isFocused?"var(--accent)":complete?"var(--success)":"inherit"}}>{p.id}</span>
                <span className="nm">{p.type==="blend"?p.threads[0].name+"+"+p.threads[1].name:p.name}</span>
                {!isEditMode&&<>
                  <div className="prog"><div className="pf" style={{width:pct+"%"}}/></div>
                  <span className="ct">{dc.done}/{dc.total}</span>
                  {/* Multi-colour parking — per-colour visibility toggle. */}
                  {parkCountsByColour[p.id]>0&&<button onClick={e2=>{e2.stopPropagation();toggleParkLayer(p.id);}} title={(isParkLayerVisible(p.id)?"Hide":"Show")+" "+parkCountsByColour[p.id]+" parked marker"+(parkCountsByColour[p.id]===1?"":"s")+" for this colour"} aria-label={(isParkLayerVisible(p.id)?"Hide":"Show")+" parked markers for DMC "+p.id} aria-pressed={isParkLayerVisible(p.id)} style={{display:"inline-flex",alignItems:"center",gap:3,fontSize:9,padding:"1px 5px",borderRadius:4,border:"1px solid var(--border)",background:isParkLayerVisible(p.id)?`rgb(${p.rgb[0]},${p.rgb[1]},${p.rgb[2]})`:"var(--surface)",color:isParkLayerVisible(p.id)?(luminance(p.rgb)>140?"#000":"#fff"):"var(--text-tertiary)",cursor:"pointer",whiteSpace:"nowrap",flexShrink:0,fontWeight:600,opacity:isParkLayerVisible(p.id)?1:0.55}}>P{parkCountsByColour[p.id]>1?("\u00D7"+parkCountsByColour[p.id]):""}</button>}
                  <button onClick={e2=>{e2.stopPropagation();if(!complete){const unmarked=dc.total-dc.done;if(unmarked>50&&!confirm("Mark all "+unmarked+" stitches of DMC "+p.id+" as done?"))return;}markColourDone(p.id,!complete);}} style={{fontSize:9,padding:"1px 6px",borderRadius:4,border:"1px solid "+(complete?"var(--danger-soft)":"var(--success-soft)"),background:complete?"var(--danger-soft)":"var(--success-soft)",color:complete?"var(--danger)":"var(--success)",cursor:"pointer",whiteSpace:"nowrap",flexShrink:0}} title={complete?"Mark colour as not done":"Mark colour as done"} aria-label={complete?"Mark colour as not done":"Mark colour as done"}>{complete?"Undo":(Icons.check?Icons.check():"\u2713")}</button>
                </>}
                {isEditMode&&Icons.pencil&&<span style={{fontSize:10,color:"var(--warning)",fontWeight:600}} aria-label="Edit colour">{Icons.pencil()}</span>}
              </div>;
            });
          })()}
        </div>
      </div>
      </div>}{/* end rp-tab-content (collapsed when legendCollapsed) */}
    </div>{/* end rpanel */}
  </div>{/* end cs-main */}
  {/* Phase 4 (UX-12) — tablet/desktop project rail (left) and side panel (right).
      Hidden via CSS on phone. Reads from ProjectStorage and existing palette state. */}
  {!statsView&&pat&&pal&&<TrackerProjectRail
    activeId={projectIdRef.current}
    pal={pal}
    cmap={cmap}
    colourDoneCounts={colourDoneCounts}
    focusColour={focusColour}
    setFocusColour={setFocusColour}
    stitchView={stitchView}
    setStitchView={setStitchView}
    todayStitchesForBar={todayStitchesForBar}
    liveAutoElapsed={liveAutoElapsed}
    liveAutoStitches={liveAutoStitches}
    skeinData={skeinData}
    globalStash={globalStash}
    onToggleOwned={(id,newOwned)=>{
      // Persist ownership change to the global stash and refresh the
      // local mirror so the rail re-renders with the updated counts.
      // Same code path used by the project-completion deduct prompt.
      (async()=>{
        try{
          if(typeof StashBridge!=='undefined'&&StashBridge.updateThreadOwned){
            await StashBridge.updateThreadOwned(id,newOwned);
            const fresh=await StashBridge.getGlobalStash();
            setGlobalStash(fresh);
          }
        }catch(err){console.warn('updateThreadOwned failed:',err);}
      })();
    }}
    onPickProject={(id)=>{
      if(!id||id===projectIdRef.current)return;
      ProjectStorage.get(id).then(p=>{
        if(p&&p.pattern&&p.settings){
          processLoadedProject(p);
          try{ProjectStorage.setActiveProject(p.id);}catch(_){}
          try{window.dispatchEvent(new Event('cs:projectsChanged'));}catch(_){}
        }
      }).catch(err=>console.error('Rail project switch failed:',err));
    }}
  />}
  {/* ═══════════════════════════════════════════════════════════════
      Phase 4 (UX-12) — Workshop tracker chrome
      Floating tool dock (phone), bottom mode pill (phone), top
      sticky current-colour chip (phone). Wake-lock chip lives in
      the existing toolbar. Tablet/desktop project rail + side panel
      are scoped via CSS media queries.
      All position:fixed; layout untouched on >=1024px where existing
      toolbar already exposes every action.
      ═══════════════════════════════════════════════════════════════ */}
  {!statsView&&pat&&pal&&(()=>{
    const focusInfo=focusColour&&cmap?cmap[focusColour]:null;
    const focusDC=focusColour&&colourDoneCounts?colourDoneCounts[focusColour]:null;
    const focusRem=focusDC?Math.max(0,(focusDC.total||0)-(focusDC.done||0)):0;
    const focusTotal=focusDC?(focusDC.total||0):0;
    // Compute current "mode" for the bottom mode pill from existing state.
    // Stitch = track + non-highlight, Find = highlight view, Edit = isEditMode.
    const currentMode=isEditMode?"edit":(stitchView==="highlight"?"find":"stitch");
    function setMode(next){
      if(next===currentMode)return;
      if(next==="stitch"){
        if(isEditMode){if(undoSnapshot!==null){setShowExitEditModal(true);return;}setIsEditMode(false);}
        setStitchMode("track");setStitchView("symbol");setFocusColour(null);
      }else if(next==="find"){
        if(isEditMode){if(undoSnapshot!==null){setShowExitEditModal(true);return;}setIsEditMode(false);}
        setStitchView("highlight");
        if(!focusColour){const first=pal.find(p=>{const dc=colourDoneCounts[p.id];return !dc||dc.done<dc.total;})||pal[0];if(first)setFocusColour(first.id);}
      }else if(next==="edit"){
        setSessionStartSnapshot({pat:[...pat],pal:deepClone(pal),threadOwned:deepClone(threadOwned),singleStitchEdits:new Map(singleStitchEdits)});
        setStitchMode("navigate");setFocusColour(null);setHoverInfo(null);setIsEditMode(true);
      }
    }
    function findNext(){
      // Cycle to the next incomplete colour.
      if(!pal||!pal.length)return;
      const order=pal.filter(p=>{const dc=colourDoneCounts[p.id];return !dc||dc.done<dc.total;});
      if(!order.length)return;
      if(!focusColour){setFocusColour(order[0].id);return;}
      const idx=order.findIndex(p=>p.id===focusColour);
      const next=order[(idx+1)%order.length];
      if(next)setFocusColour(next.id);
    }
    return <>
      {/* ── Top sticky current-colour chip (phone) ──
          Pinned at the top of the viewport so the active colour and
          remaining count are always visible while scrolling the canvas. */}
      <div className="tracker-colour-chip" role="status" aria-live="polite">
        <button
          type="button"
          className="tcc-btn"
          onClick={()=>{if(stitchView!=="highlight")setStitchView("highlight");setQuickColourOpen(o=>!o);}}
          aria-label="Choose focus colour"
        >
          {focusInfo?<>
            <span className="tcc-sw" style={{background:`rgb(${focusInfo.rgb})`}}/>
            <span className="tcc-id">DMC {focusInfo.id}</span>
            <span className="tcc-name">{focusInfo.name||""}</span>
            {focusTotal>0&&<span className="tcc-rem">{focusRem.toLocaleString()} / {focusTotal.toLocaleString()} left</span>}
          </>:<>
            <span className="tcc-sw tcc-sw--empty" aria-hidden="true"/>
            <span className="tcc-name">Tap to pick a colour</span>
          </>}
        </button>
      </div>
      {/* ── Floating tool dock (phone right edge, draggable Y) ── */}
      <div className="tracker-tool-dock" role="toolbar" aria-label="Tracker tools" style={{top:dockY+"%"}}
        onPointerDown={(e)=>{
          if(!e.currentTarget.classList.contains("tracker-tool-dock--drag"))return;
        }}>
        <button className="ttd-btn ttd-handle" aria-label="Drag dock"
          onPointerDown={(e)=>{
            const dock=e.currentTarget.parentNode;
            const startClientY=e.clientY;
            const startTop=dock.getBoundingClientRect().top;
            const vh=window.innerHeight||1;
            // Suppress the .tracker-tool-dock 0.2s top transition during
            // active drag — otherwise pointermove updates lag visibly.
            dock.setAttribute('data-dragging','1');
            function onMove(ev){
              const delta=ev.clientY-startClientY;
              const newTop=Math.min(vh-200,Math.max(60,startTop+delta));
              setDockY(Math.round(newTop/vh*100));
            }
            function onUp(){
              dock.removeAttribute('data-dragging');
              window.removeEventListener('pointermove',onMove);
              window.removeEventListener('pointerup',onUp);
            }
            window.addEventListener('pointermove',onMove);
            window.addEventListener('pointerup',onUp);
            e.preventDefault();
          }}
          title="Drag to reposition dock"
        >{Icons.menu()}</button>
        <button className="ttd-btn" onClick={()=>setStitchZoom(z=>Math.min(4,+(z+0.25).toFixed(2)))} aria-label="Zoom in" title="Zoom in">{Icons.magnifyPlus()}</button>
        <button className="ttd-btn" onClick={()=>setStitchZoom(z=>Math.max(0.1,+(z-0.25).toFixed(2)))} aria-label="Zoom out" title="Zoom out">{Icons.magnifyMinus()}</button>
        <button className="ttd-btn" onClick={undoTrack} disabled={!trackHistory.length} aria-label="Undo" title="Undo">{Icons.undo()}</button>
        <button className="ttd-btn" onClick={redoTrack} disabled={!redoStack.length} aria-label="Redo" title="Redo">{Icons.replay()}</button>
        <button className="ttd-btn" onClick={findNext} aria-label="Find next colour" title="Cycle focus colour">{Icons.magnify()}</button>
        <button className={"ttd-btn"+(stitchView==="highlight"?" ttd-btn--on":"")} onClick={()=>{setStitchView(v=>v==="highlight"?"symbol":"highlight");}} aria-label="Toggle highlight" title="Highlight mode (half-stitch placement)">{Icons.halfStitch()}</button>
        <button className={"ttd-btn"+(stitchMode==="navigate"?" ttd-btn--on":"")} onClick={()=>{setStitchMode(m=>m==="navigate"?"track":"navigate");}} aria-label="Toggle parking" title="Navigate / parking mode — tap to place parking markers on the canvas showing where your needle is parked between sessions. Parked colour markers are always visible while you work.">{Icons.parkFlag()}</button>
        {/* R11: Row mode toggle on mobile dock */}
        <button className={"ttd-btn"+(rowModeActive?" ttd-btn--on":"")} onClick={()=>{setRowModeActive(v=>!v);setCurrentRow(0);}} aria-label="Toggle row mode" title="Row mode — work one row at a time">{Icons.rowMode()}</button>
        <button className="ttd-btn" onClick={()=>{if(stitchView!=="highlight")setStitchView("highlight");setQuickColourOpen(o=>!o);}} aria-label="Pick colour" title="Pick a colour">{Icons.palette()}</button>
      </div>
      {/* ── Bottom mode-pill (phone, above safe area) ── */}
      <div className="tracker-mode-pill" role="tablist" aria-label="Tracker mode" aria-live="polite">
        {[["stitch","Stitch"],["find","Find"],["edit","Edit"]].map(([k,l])=>
          <button key={k} type="button" role="tab"
            aria-selected={currentMode===k}
            className={"tmp-seg"+(currentMode===k?" tmp-seg--on":"")}
            onClick={()=>setMode(k)}
          >{l}</button>
        )}
      </div>
    </>;
  })()}

  {!isEditMode&&!statsView&&stitchMode==="track"&&(()=>{
    const focusInfo=focusColour&&cmap?cmap[focusColour]:null;
    const undoDisabled=!trackHistory.length;
    return <>
      <div className="tracker-action-bar" role="toolbar" aria-label="Stitch tracker actions">
        <button
          className={"colour-indicator"+(focusInfo?"":" colour-indicator--empty")}
          onClick={()=>{
            // If no focus colour yet, ensure highlight view is on so a pick is meaningful.
            if(stitchView!=="highlight")setStitchView("highlight");
            setQuickColourOpen(o=>!o);
          }}
          aria-label="Choose focus colour"
          aria-expanded={quickColourOpen}
        >
          {focusInfo?<>
            <span className="ci-sw" style={{background:`rgb(${focusInfo.rgb})`}}/>
            <span className="ci-text">
              <span className="ci-id">DMC {focusInfo.id}</span>
              <span className="ci-name">{focusInfo.name||""}</span>
            </span>
            <span className="ci-chev">{quickColourOpen?window.Icons.chevronDown():window.Icons.chevronUp()}</span>
          </>:<>
            <span style={{display:"inline-flex",alignItems:"center",gap:'var(--s-2)'}}>
              {window.Icons.palette()} Pick a colour
              <span className="ci-chev">{quickColourOpen?window.Icons.chevronDown():window.Icons.chevronUp()}</span>
            </span>
          </>}
        </button>
        <button
          className="action-btn action-btn--undo"
          onClick={undoTrack}
          onContextMenu={e=>{e.preventDefault();if(redoStack.length)redoTrack();}}
          disabled={undoDisabled}
          aria-label="Undo last stitch"
          title={undoDisabled?"Nothing to undo":"Tap to undo · Long-press for redo"}
        >{window.Icons.undo()}</button>
        <button
          className="action-btn action-btn--mark"
          onClick={()=>{
            // Mark/unmark the cell currently under the navigation crosshair if
            // it's available. Otherwise, just centre the canvas hint.
            if(done&&hlRow!=null&&hlCol!=null&&hlRow>=0&&hlRow<sH&&hlCol>=0&&hlCol<sW){
              const idx=hlRow*sW+hlCol;
              const cell=pat[idx];
              if(cell&&cell.id!=="__skip__"&&cell.id!=="__empty__"){
                if(isColourLocked&&isColourLocked()&&!fullStitchMatchesFocus(idx))return;
                const nv=done[idx]?0:1;
                const nd=new Uint8Array(done);
                nd[idx]=nv;
                pushTrackHistory([{idx,oldVal:done[idx]}]);
                applyDoneCountsDelta([{idx,oldVal:done[idx]}],pat,nd);
                setDone(nd);
                drawCellDirectly(idx,nv);
                return;
              }
            }
            // No crosshair target → toast hint to use canvas tap.
            try{if(window.Toast&&window.Toast.show)window.Toast.show({message:"Tap a stitch on the canvas, or use Navigate mode to place a crosshair.",type:"info"});}catch(_){}
          }}
          aria-label="Mark stitch at crosshair"
          title="Mark/unmark the stitch under the crosshair (Navigate mode)"
        >{window.Icons.check()}</button>
      </div>
      {/* Colour quick-switcher backdrop + drawer */}
      {quickColourOpen&&<div className="colour-quick-backdrop" onClick={()=>setQuickColourOpen(false)} aria-hidden="true"/>}
      <div className={"colour-quick-drawer"+(quickColourOpen?" colour-quick-drawer--open":"")} role="dialog" aria-label="Choose focus colour" aria-hidden={!quickColourOpen}>
        <div className="cqd-handle" onClick={()=>setQuickColourOpen(false)}>
          <div className="rpanel-handle-bar"/>
        </div>
        <div className="cqd-grid">
          {(()=>{
            // Sort: incomplete first by stitches remaining (desc), completed last.
            const sorted=[...pal].map(p=>{
              const dc=colourDoneCounts[p.id]||{total:0,done:0,halfTotal:0,halfDone:0};
              const totalWithHalf=dc.total+dc.halfTotal*0.5;
              const doneWithHalf=dc.done+dc.halfDone*0.5;
              const remaining=Math.max(0,totalWithHalf-doneWithHalf);
              const pct=totalWithHalf>0?Math.round(doneWithHalf/totalWithHalf*100):0;
              const complete=remaining<=0&&totalWithHalf>0;
              return{p,remaining,pct,complete};
            });
            sorted.sort((a,b)=>{
              if(a.complete!==b.complete)return a.complete?1:-1;
              return b.remaining-a.remaining;
            });
            return sorted.map(({p,pct,complete})=>{
              const isFocused=focusColour===p.id;
              return <button
                key={p.id}
                className={"cqd-tile"+(isFocused?" cqd-tile--on":"")+(complete?" cqd-tile--done":"")}
                onClick={()=>{
                  if(stitchView!=="highlight")setStitchView("highlight");
                  setFocusColour(p.id);
                  setQuickColourOpen(false);
                }}
                aria-label={"DMC "+p.id+(p.name?(" "+p.name):"")+", "+pct+" percent complete"}
                aria-pressed={isFocused}
              >
                <span className="cqd-sw" style={{background:`rgb(${p.rgb})`}}/>
                <span className="cqd-id">{p.id}</span>
                <span className="cqd-pct">{pct}%</span>
              </button>;
            });
          })()}
        </div>
      </div>
    </>;
  })()}
  </>}

  {importDialog==="image"&&importImage&&(()=>{
    // C7: when the experimental import wizard is enabled, mount the new
    // 5-step ImportWizard component instead of the legacy single-step
    // parameter modal. The flag defaults off so existing users see no
    // change. The wizard's commit() returns the same shape the legacy
    // path expects so the generation call below stays identical.
    let _useWizard=false;
    try{ _useWizard=!!(window.UserPrefs&&window.UserPrefs.get&&window.UserPrefs.get('experimental.importWizard')); }catch(_){_useWizard=false;}
    if(_useWizard&&window.ImportWizard){
      return React.createElement(window.ImportWizard,{
        image:importImage,
        baseName:importName||"",
        onClose:()=>{ setImportDialog(null); setImportImage(null); },
        onGenerate:(settings)=>{
          try{
            let result=parseImagePattern(importImage,{
              maxWidth:settings.maxWidth, maxHeight:settings.maxHeight,
              maxColours:settings.maxColours,
              skipWhiteBg:settings.skipWhiteBg, bgThreshold:settings.bgThreshold
            });
            const finalName=(settings.name||'').trim().slice(0,60);
            let project=importResultToProject(result,settings.fabricCt||14,finalName);
            project.id=ProjectStorage.newId();
            project.createdAt=project.createdAt||new Date().toISOString();
            processLoadedProject(project);
            ProjectStorage.save(project).then(id=>ProjectStorage.setActiveProject(id)).catch(err=>console.error("Import save failed:",err));
            setImportSuccess(`Imported "${finalName||'image'}" \u2014 ${result.width}\u00d7${result.height}, ${result.paletteSize} colours, ${result.stitchCount} stitches`);
          }catch(err){
            console.error(err);
            setLoadError("Image import failed: "+err.message);
            setTimeout(()=>setLoadError(null),4000);
          }
          setImportDialog(null);
          setImportImage(null);
        }
      });
    }
    return <div className="modal-overlay" role="dialog" aria-modal="true" aria-labelledby="import-pattern-title" onClick={()=>{setImportDialog(null);setImportImage(null);}}>
    <div className="modal-content" style={{maxWidth:600}} onClick={e=>e.stopPropagation()}>
      <button className="modal-close" onClick={()=>{setImportDialog(null);setImportImage(null);}} aria-label="Close">{Icons.x?Icons.x():"×"}</button>
      <h3 id="import-pattern-title" style={{marginTop:0,marginBottom:15}}>Import Image Pattern</h3>
      <div style={{display:"flex", flexDirection:"column", gap:'var(--s-3)', marginBottom:'var(--s-4)'}}>
        <div style={{display:"flex", flexDirection:"column", gap:'var(--s-1)'}}>
          <label style={{fontSize:'var(--text-sm)', fontWeight:600, color:"var(--text-secondary)"}}>Project Name</label>
          <input type="text" maxLength={60} value={importName} onChange={e=>setImportName(e.target.value)}
            placeholder="e.g. Rose Garden" style={{padding:"6px 10px", borderRadius:'var(--radius-sm)', border:"0.5px solid var(--border)", fontSize:'var(--text-md)'}}/>
        </div>
      </div>
      <div style={{display:"flex", gap:20, flexWrap:"wrap"}}>
        <div style={{width:140, display:"flex", flexDirection:"column", gap:'var(--s-2)'}}>
          <div style={{width:140, height:140, background:"var(--surface-secondary)", border:"0.5px solid var(--border)", borderRadius:'var(--radius-md)', display:"flex", alignItems:"center", justifyContent:"center", overflow:"hidden"}}>
            <img src={importImage.src} style={{maxWidth:"100%", maxHeight:"100%", objectFit:"contain", imageRendering:"pixelated"}}/>
          </div>
          <div style={{fontSize:'var(--text-sm)', color:"var(--text-secondary)", textAlign:"center"}}>
            {importImage.width} × {importImage.height} px
          </div>
        </div>
        <div style={{flex:1, minWidth:250, display:"flex", flexDirection:"column", gap:'var(--s-4)'}}>
          <div style={{display:"grid", gridTemplateColumns:"1fr 1fr", gap:'var(--s-3)'}}>
            <div style={{display:"flex", flexDirection:"column", gap:'var(--s-1)'}}>
              <label style={{fontSize:'var(--text-sm)', fontWeight:600, color:"var(--text-secondary)"}}>Max Width (stitches)</label>
              <input type="number" inputMode="numeric" min={10} max={300} value={importMaxW} onChange={e=>{
                let val = Number(e.target.value);
                setImportMaxW(val);
                if (importArLock) setImportMaxH(Math.max(10, Math.floor(val * (importImage.height / importImage.width))));
              }} style={{padding:"6px 10px", borderRadius:'var(--radius-sm)', border:"0.5px solid var(--border)"}}/>
            </div>
            <div style={{display:"flex", flexDirection:"column", gap:'var(--s-1)'}}>
              <label style={{fontSize:'var(--text-sm)', fontWeight:600, color:"var(--text-secondary)"}}>Max Height (stitches)</label>
              <input type="number" inputMode="numeric" min={10} max={300} value={importMaxH} onChange={e=>{
                let val = Number(e.target.value);
                setImportMaxH(val);
                if (importArLock) setImportMaxW(Math.max(10, Math.floor(val * (importImage.width / importImage.height))));
              }} style={{padding:"6px 10px", borderRadius:'var(--radius-sm)', border:"0.5px solid var(--border)"}}/>
            </div>
          </div>
          <label style={{display:"flex", alignItems:"center", gap:'var(--s-2)', fontSize:'var(--text-md)', color:"var(--text-primary)", cursor:"pointer"}}>
            <input type="checkbox" checked={importArLock} onChange={e=>setImportArLock(e.target.checked)}/> Lock aspect ratio
          </label>

          <div style={{display:"flex", flexDirection:"column", gap:'var(--s-1)'}}>
            <label style={{fontSize:'var(--text-sm)', fontWeight:600, color:"var(--text-secondary)"}}>Fabric Count</label>
            <select value={importFabricCt} onChange={e=>setImportFabricCt(Number(e.target.value))}
              style={{padding:"6px 10px", borderRadius:'var(--radius-sm)', border:"0.5px solid var(--border)", fontSize:'var(--text-md)', background:"var(--surface)"}}>
              {FABRIC_COUNTS.map(fc=><option key={fc.ct} value={fc.ct}>{fc.label}</option>)}
            </select>
          </div>

          <SliderRow label="Max Colours" val={importMaxColours} setVal={setImportMaxColours} min={5} max={40} />

          <label style={{display:"flex", alignItems:"center", gap:'var(--s-2)', fontSize:'var(--text-md)', color:"var(--text-primary)", cursor:"pointer"}}>
            <input type="checkbox" checked={importSkipBg} onChange={e=>setImportSkipBg(e.target.checked)}/> Skip near-white background
          </label>

          {importSkipBg && <SliderRow label="Background Tolerance" val={importBgThreshold} setVal={setImportBgThreshold} min={3} max={50} />}

        </div>
      </div>
      <div style={{display:"flex", justifyContent:"flex-end", gap:10, marginTop:24, paddingTop:16, borderTop:"0.5px solid var(--border)"}}>
        <button onClick={()=>{setImportDialog(null);setImportImage(null);}} style={{padding:"8px 16px", borderRadius:'var(--radius-md)', border:"0.5px solid var(--border)", background:"var(--surface)", cursor:"pointer", fontWeight:600}}>Cancel</button>
        <button onClick={()=>{
          try {
            let result = parseImagePattern(importImage, {
              maxWidth: importMaxW, maxHeight: importMaxH,
              maxColours: importMaxColours, skipWhiteBg: importSkipBg, bgThreshold: importBgThreshold
            });
            const finalName = (importName || '').trim().slice(0, 60);
            let project = importResultToProject(result, importFabricCt, finalName);
            project.id = ProjectStorage.newId();
            project.createdAt = project.createdAt || new Date().toISOString();
            processLoadedProject(project);
            ProjectStorage.save(project).then(id => ProjectStorage.setActiveProject(id)).catch(err => console.error("Import save failed:", err));
            setImportSuccess(`Imported "${finalName || 'image'}" \u2014 ${result.width}\u00d7${result.height}, ${result.paletteSize} colours, ${result.stitchCount} stitches`);
            setImportDialog(null);
            setImportImage(null);
          } catch(err) {
            console.error(err);
            setLoadError("Image import failed: " + err.message);
            setImportDialog(null);
            setImportImage(null);
            setTimeout(()=>setLoadError(null), 4000);
          }
        }} style={{padding:"8px 16px", borderRadius:'var(--radius-md)', border:"none", background:"var(--accent)", color:"var(--surface)", cursor:"pointer", fontWeight:600}}>Import Pattern</button>
      </div>
    </div>
  </div>;
  })()}

  {modal==="help"&&<SharedModals.Help defaultTab="tracker" onClose={()=>setModal(null)} />}
  {welcomeOpen&&window.WelcomeWizard&&React.createElement(window.WelcomeWizard,{
    page:"tracker",
    // Phase 5: the Stitching-Style picker is now an extra wizard step rather
    // than a separate modal stacked after the welcome. Both tutorial flags
    // get marked done together when the user finishes the wizard.
    extraSteps:[{
      customComponent:StitchingStyleStepBody,
      onCommit:result=>{
        if(!result)return;
        setStitchingStyle(result.style);
        setBlockW(result.blockW);setBlockH(result.blockH);
        setStartCorner(result.startCorner);
        if(!focusBlock){setFocusBlock(_getStartBlock());}
        if(result.style!=="crosscountry")setFocusEnabled(true);
      }
    }],
    onClose:()=>{
      setWelcomeOpen(false);
      // Skip-tour exits the wizard without committing a style choice; if the
      // user has never picked a style, fall back to the standalone modal so
      // the helpful defaults still get applied.
      try{ if(!localStorage.getItem("cs_styleOnboardingDone")&&!localStorage.getItem("cs_stitchStyle")) setStyleOnboardingOpen(true); }catch(_){}
    }
  })}
  {styleOnboardingOpen&&<StitchingStyleOnboarding startCorner={startCorner} onDone={result=>{
    setStyleOnboardingOpen(false);
    if(result){
      setStitchingStyle(result.style);
      setBlockW(result.blockW);setBlockH(result.blockH);
      setStartCorner(result.startCorner);
      if(!focusBlock){setFocusBlock(_getStartBlock());}
      if(result.style!=="crosscountry")setFocusEnabled(true);
    }
  }}/>}
  {window.HelpHintBanner&&React.createElement(window.HelpHintBanner)}
  {_showTrFirstStitchCoach && window.Coachmark && React.createElement(window.Coachmark, {
    id: 'firstStitch_tracker',
    title: 'Mark your first stitch',
    body: 'Tap a cell to mark it complete. Tap again to undo.',
    placement: 'centre',
    showHighlight: false,
    onComplete: ()=>_trCoach.complete('firstStitch_tracker'),
    onSkip: ()=>_trCoach.skip('firstStitch_tracker')
  })}
  {sessionConfigOpen&&<SessionConfigModal liveAutoElapsed={liveAutoElapsed} liveAutoStitches={liveAutoStitches} onClose={()=>setSessionConfigOpen(false)} onStart={cfg=>{
    setExplicitSession({startTime:Date.now(),timeAvail:cfg.timeAvail,stitchGoal:cfg.stitchGoal,startStitches:doneCount,blocks:[]});
    setSessionConfigOpen(false);
  }}/>}
  {sessionSummaryData&&(()=>{
    const activeSessionIdx=statsSessions?statsSessions.length:0;
    const sessionBreadcrumbs=(breadcrumbs||[]).filter(b=>b&&b.sessionIdx===activeSessionIdx);
    const firstSessionBreadcrumb=sessionBreadcrumbs.length>0?sessionBreadcrumbs[0]:null;
    return <SessionSummaryModal data={sessionSummaryData} prevAvgSpeed={statsSessions&&statsSessions.length>1?Math.round(statsSessions.slice(0,-1).reduce((s,sess)=>s+(sess.stitchesCompleted||0),0)/Math.max(1,statsSessions.slice(0,-1).reduce((s,sess)=>s+(sess.durationSeconds||0),0))*3600):0} hasBreadcrumbs={sessionBreadcrumbs.length>0} onViewBreadcrumbs={()=>{setBreadcrumbVisible(true);setSessionSummaryData(null);if(firstSessionBreadcrumb&&stitchScrollRef.current){const b=firstSessionBreadcrumb;const cx=G+b.bx*blockW*scs+blockW*scs/2;const cy=G+b.by*blockH*scs+blockH*scs/2;const el=stitchScrollRef.current;el.scrollLeft=Math.max(0,cx-el.clientWidth/2);el.scrollTop=Math.max(0,cy-el.clientHeight/2);}}} onClose={()=>setSessionSummaryData(null)}/>;
  })()}
  {resumeRecap&&(()=>{
    // A3: Resume recap modal — fires once per project load when prior sessions exist.
    const r=resumeRecap;
    const sm=r.summary||{};
    const dismiss=()=>setResumeRecap(null);
    let lastStr='';
    if(r.lastDate){
      try{
        const d=new Date(r.lastDate);
        if(!Number.isNaN(d.getTime())){
          const days=Math.floor((Date.now()-d.getTime())/86400000);
          if(days<=0)lastStr='Last stitched today';
          else if(days===1)lastStr='Last stitched yesterday';
          else if(days<7)lastStr='Last stitched '+days+' days ago';
          else lastStr='Last stitched '+d.toLocaleDateString();
        }
      }catch(_){}
    }
    const pct=r.totalSt>0?Math.round(r.doneSt/r.totalSt*100):0;
    const minutes=Math.max(0,Math.round((sm.ms||0)/60000));
    let speedNote=null;
    if(sm.perHour!=null&&sm.perHourAvg!=null){
      const diff=sm.perHour-sm.perHourAvg;
      if(diff>=5)speedNote=(sm.perHour-sm.perHourAvg)+' / hr faster than your average';
      else if(diff<=-5)speedNote=Math.abs(diff)+' / hr slower than your average';
    }
    return <div className="modal-overlay resume-recap-overlay" role="dialog" aria-modal="true" aria-labelledby="resume-recap-title" onClick={dismiss}>
      <div className="modal-content resume-recap-modal" onClick={e=>e.stopPropagation()}>
        <div className="resume-recap-header">
          <div>
            <h3 id="resume-recap-title" className="resume-recap-title">Welcome back to {r.projectName}</h3>
            {lastStr&&<div className="resume-recap-sub">{lastStr}</div>}
          </div>
          <button className="resume-recap-close" onClick={dismiss} aria-label="Close">{Icons.x()}</button>
        </div>
        <div className="resume-recap-body">
          <div className="resume-recap-progress">
            <div className="resume-recap-progress-row">
              <span className="resume-recap-progress-label">Overall progress</span>
              <span className="resume-recap-progress-pct">{pct}%</span>
            </div>
            <div className="resume-recap-bar"><div className="resume-recap-bar-fill" style={{width:pct+'%'}}/></div>
            <div className="resume-recap-progress-meta">{r.doneSt.toLocaleString()} / {r.totalSt.toLocaleString()} stitches</div>
          </div>
          <div className="resume-recap-section-label">Your last session</div>
          <div className="resume-recap-grid">
            <div className="resume-recap-card">
              <div className="resume-recap-card-num">{(sm.count||0).toLocaleString()}</div>
              <div className="resume-recap-card-lbl">stitches</div>
            </div>
            <div className="resume-recap-card">
              <div className="resume-recap-card-num">{minutes} m</div>
              <div className="resume-recap-card-lbl">stitch time</div>
            </div>
            <div className="resume-recap-card">
              <div className="resume-recap-card-num">{sm.perHour!=null?sm.perHour:'—'}</div>
              <div className="resume-recap-card-lbl">stitches / hr</div>
            </div>
          </div>
          {speedNote&&<div className="resume-recap-note">{speedNote}</div>}
        </div>
        <div className="resume-recap-footer">
          <button className="resume-recap-btn" onClick={()=>{dismiss();if(typeof onGoHome==='function')onGoHome();else window.location.href='home.html';}}>Switch project</button>
          <button className="resume-recap-btn" onClick={()=>{dismiss();setStatsView(true);}}>Stats</button>
          <button className="resume-recap-btn resume-recap-btn--primary" onClick={dismiss} autoFocus>Continue stitching</button>
        </div>
      </div>
    </div>;
  })()}
  {modal==="about"&&<SharedModals.About onClose={()=>setModal(null)} />}
  {modal==="pdf_export"&&<div className="modal-overlay" role="dialog" aria-modal="true" aria-labelledby="pdf-export-title" onClick={()=>setModal(null)}>
    <div className="modal-content" style={{maxWidth:400}} onClick={e=>e.stopPropagation()}>
      <button className="modal-close" onClick={()=>setModal(null)} aria-label="Close">{Icons.x?Icons.x():"×"}</button>
      <h3 id="pdf-export-title" style={{marginTop:0,marginBottom:15}}>Export PDF</h3>
      <div style={{display:"flex",flexDirection:"column",gap:'var(--s-4)'}}>
        <label style={PDF_MODAL_LABEL_STYLE}>
          Chart Mode:
          <select value={pdfSettings.chartStyle||"color_symbol"} onChange={e=>setPdfSettings({...pdfSettings,chartStyle:e.target.value})} style={PDF_MODAL_SELECT_STYLE}>
            <option value="color_symbol">Colour + Symbols</option>
            <option value="symbol">Symbols Only</option>
            <option value="color">Colour Blocks Only</option>
          </select>
        </label>
        <label style={PDF_MODAL_LABEL_STYLE}>
          Cell Size:
          <select value={pdfSettings.cellSize||3} onChange={e=>setPdfSettings({...pdfSettings,cellSize:Number(e.target.value)})} style={PDF_MODAL_SELECT_STYLE}>
            <option value={2.5}>Small (2.5mm)</option>
            <option value={3}>Medium (3mm)</option>
            <option value={4.5}>Large (4.5mm)</option>
          </select>
        </label>
        <label style={PDF_MODAL_CHECKBOX_LABEL_STYLE}>
          <input type="checkbox" checked={pdfSettings.singlePage||false} onChange={e=>setPdfSettings({...pdfSettings,singlePage:e.target.checked})}/> Single Page
        </label>
        <div style={{display:"flex",gap:10,marginTop:'var(--s-2)'}}>
          <button onClick={()=>{setModal(null);exportPDF({displayMode:pdfSettings.chartStyle||"color_symbol",cellSize:pdfSettings.cellSize||3,singlePage:pdfSettings.singlePage||false});}} style={PDF_MODAL_EXPORT_BTN_STYLE}>Export PDF</button>
        </div>
      </div>
    </div>
  </div>}

  {modal==="shortcuts"&&<SharedModals.Help defaultTab="shortcuts" onClose={()=>setModal(null)} />}


  {modal==="deduct_prompt"&&<div className="modal-overlay" role="dialog" aria-modal="true" aria-labelledby="deduct-prompt-title" onClick={()=>{setModal(null);setStashDeducted(true);}}>
    <div className="modal-content" style={{maxWidth:460}} onClick={e=>e.stopPropagation()}>
      <button className="modal-close" onClick={()=>{setModal(null);setStashDeducted(true);}} aria-label="Close">{Icons.x?Icons.x():"×"}</button>
      <h3 id="deduct-prompt-title" style={{marginTop:0,fontSize:20,color:"var(--text-primary)"}}>Project Complete!</h3>
      <p style={{fontSize:'var(--text-lg)',color:"var(--text-secondary)",marginBottom:'var(--s-4)'}}>Deduct the thread used from your global stash?</p>
      <div style={{display:"flex",flexDirection:"column",gap:'var(--s-2)'}}>
        <button onClick={()=>{
          (async()=>{
            const stash=await StashBridge.getGlobalStash();
            for(const d of skeinData){
              // Stash is keyed by composite keys ("dmc:310"); d.id is a bare id ("310").
              const gs=stash['dmc:'+d.id]||stash[d.id]||{owned:0};
              const newOwned=Math.max(0,gs.owned-d.skeins);
              await StashBridge.updateThreadOwned(d.id,newOwned);
            }
            setGlobalStash(await StashBridge.getGlobalStash());
            if(typeof ProjectStorage!=='undefined'&&ProjectStorage.markProjectFinished&&projectIdRef.current){
              await ProjectStorage.markProjectFinished(projectIdRef.current);
              v3FieldsRef.current=Object.assign(v3FieldsRef.current||{},{finishStatus:'completed',completedAt:new Date().toISOString()});
            }
          })().then(()=>{setStashDeducted(true);setModal(null);}).catch(()=>{setStashDeducted(true);setModal(null);});
        }} style={{padding:"10px 20px",fontSize:'var(--text-lg)',borderRadius:'var(--radius-md)',border:"none",background:"var(--accent)",color:"var(--surface)",cursor:"pointer",fontWeight:600}}>Deduct Full Skeins</button>
        <button onClick={()=>{
          (async()=>{
            const stash=await StashBridge.getGlobalStash();
            for(const d of skeinData){
              // Stash is keyed by composite keys ("dmc:310"); d.id is a bare id ("310").
              const gs=stash['dmc:'+d.id]||stash[d.id]||{owned:0};
              const deduct=Math.max(0,d.skeins-1);
              const newOwned=Math.max(0,gs.owned-deduct);
              await StashBridge.updateThreadOwned(d.id,newOwned);
            }
            setGlobalStash(await StashBridge.getGlobalStash());
            if(typeof ProjectStorage!=='undefined'&&ProjectStorage.markProjectFinished&&projectIdRef.current){
              await ProjectStorage.markProjectFinished(projectIdRef.current);
              v3FieldsRef.current=Object.assign(v3FieldsRef.current||{},{finishStatus:'completed',completedAt:new Date().toISOString()});
            }
          })().then(()=>{setStashDeducted(true);setModal(null);}).catch(()=>{setStashDeducted(true);setModal(null);});
        }} style={{padding:"10px 20px",fontSize:'var(--text-lg)',borderRadius:'var(--radius-md)',border:"1px solid var(--accent-light)",background:"var(--surface-secondary)",color:"var(--accent)",cursor:"pointer",fontWeight:600}}>Deduct Partial (keep 1 per colour)</button>
        <button onClick={()=>{
          (async()=>{
            if(typeof ProjectStorage!=='undefined'&&ProjectStorage.markProjectFinished&&projectIdRef.current){
              await ProjectStorage.markProjectFinished(projectIdRef.current);
              v3FieldsRef.current=Object.assign(v3FieldsRef.current||{},{finishStatus:'completed',completedAt:new Date().toISOString()});
            }
          })().then(()=>{setStashDeducted(true);setModal(null);}).catch(()=>{setStashDeducted(true);setModal(null);});
        }} style={{padding:"10px 20px",fontSize:'var(--text-lg)',borderRadius:'var(--radius-md)',border:"0.5px solid var(--border)",background:"var(--surface)",color:"var(--text-secondary)",cursor:"pointer",fontWeight:500}}>Skip</button>
      </div>
      <div style={{marginTop:'var(--s-3)',paddingTop:10,borderTop:"1px solid var(--border)",display:"flex",justifyContent:"center"}}>
        <button onClick={()=>{window.location.search='?mode=stats&tab=showcase';}} style={{fontSize:'var(--text-sm)',color:"var(--accent)",background:"none",border:"none",cursor:"pointer",fontWeight:600,display:'inline-flex',alignItems:'center',gap:4}}>See your updated stats <span aria-hidden="true" style={{display:'inline-flex'}}>{Icons.chevronRight?Icons.chevronRight():null}</span></button>
      </div>
    </div>
  </div>}

  {cellEditPopover && isEditMode && (()=>{
    const cell = pat[cellEditPopover.idx];
    const currentEntry = cell && cell.id !== "__empty__" ? cmap[cell.id] : null;
    const isEmpty = !cell || cell.id === "__empty__";
    return (
      <div className="modal-overlay" role="dialog" aria-modal="true" aria-labelledby="cell-edit-title" onClick={()=>setCellEditPopover(null)}>
        <div className="modal-content" style={{maxWidth:440,display:"flex",flexDirection:"column",maxHeight:"80vh"}} onClick={e=>e.stopPropagation()}>
          <button className="modal-close" onClick={()=>setCellEditPopover(null)} aria-label="Close">{Icons.x?Icons.x():"×"}</button>
          <h3 id="cell-edit-title" style={{marginTop:0,marginBottom:'var(--s-1)',fontSize:18,color:"var(--text-primary)"}}>Edit Stitch</h3>
          <div style={{fontSize:'var(--text-sm)',color:"var(--text-tertiary)",marginBottom:'var(--s-3)'}}>Row {cellEditPopover.row}, Col {cellEditPopover.col}</div>

          {isEmpty ? (
            <div style={{padding:"10px 12px",background:"var(--surface-tertiary)",borderRadius:'var(--radius-md)',marginBottom:'var(--s-3)',fontSize:'var(--text-md)',color:"var(--text-secondary)",fontStyle:"italic"}}>
              Empty — no stitch. Select a symbol below to assign one.
            </div>
          ) : currentEntry ? (
            <div style={{display:"flex",alignItems:"center",gap:10,padding:"8px 12px",background:"var(--accent-light)",borderRadius:'var(--radius-md)',marginBottom:'var(--s-3)',border:"1px solid var(--accent-border)"}}>
              <span style={{width:22,height:22,borderRadius:4,background:`rgb(${currentEntry.rgb[0]},${currentEntry.rgb[1]},${currentEntry.rgb[2]})`,border:"1px solid var(--border)",flexShrink:0}}/>
              <span style={{fontFamily:"monospace",fontWeight:700,fontSize:'var(--text-xl)'}}>{currentEntry.symbol}</span>
              <span style={{fontWeight:600,fontSize:'var(--text-md)'}}>DMC {currentEntry.id}</span>
              <span style={{fontSize:'var(--text-sm)',color:"var(--text-secondary)",flex:1}}>{currentEntry.name}</span>
              <span style={{fontSize:'var(--text-xs)',color:"var(--accent)",fontWeight:600}}>Current</span>
            </div>
          ) : null}

          <div style={{fontSize:'var(--text-sm)',fontWeight:600,color:"var(--text-secondary)",marginBottom:6}}>Assign symbol:</div>
          <div style={{flex:1,overflowY:"auto",border:"1px solid var(--border)",borderRadius:'var(--radius-md)',marginBottom:'var(--s-3)'}}>
            {pal.map(p=>{
              const isCurrent = !isEmpty && p.id === cell.id;
              return (
                <div key={p.id} onClick={()=>{ if(!isCurrent) handleSingleStitchEdit(cellEditPopover.idx,p.id); }}
                  style={{display:"flex",alignItems:"center",gap:10,padding:"9px 12px",borderBottom:"1px solid var(--surface-tertiary)",
                    background:isCurrent?"var(--accent-light)":"var(--surface)",cursor:isCurrent?"default":"pointer",
                    opacity:isCurrent?0.6:1}}>
                  <span style={{width:20,height:20,borderRadius:4,background:`rgb(${p.rgb[0]},${p.rgb[1]},${p.rgb[2]})`,border:"1px solid var(--border)",flexShrink:0}}/>
                  <span style={{fontFamily:"monospace",fontWeight:700,fontSize:'var(--text-lg)',width:18,textAlign:"center"}}>{p.symbol}</span>
                  <span style={{fontWeight:600,fontSize:'var(--text-md)',minWidth:52}}>DMC {p.id}</span>
                  <span style={{fontSize:'var(--text-sm)',color:"var(--text-secondary)",flex:1,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{p.name}</span>
                  <span style={{fontSize:'var(--text-xs)',color:"var(--text-tertiary)"}}>{p.count} st</span>
                  {isCurrent&&<span style={{fontSize:'var(--text-xs)',fontWeight:600,color:"var(--accent)",background:"var(--accent-light)",padding:"2px 8px",borderRadius:'var(--radius-lg)'}}>Current</span>}
                </div>
              );
            })}
          </div>

          {!isEmpty && (
            <button onClick={()=>{
              if(confirm(`Remove stitch at Row ${cellEditPopover.row}, Col ${cellEditPopover.col}? It will be marked as empty.`)){
                handleStitchRemoval(cellEditPopover.idx);
              }
            }} style={{padding:"9px 16px",borderRadius:'var(--radius-md)',border:"1px solid var(--danger-soft)",background:"var(--danger-soft)",color:"var(--danger)",cursor:"pointer",fontWeight:600,fontSize:'var(--text-md)',textAlign:"left"}}>
              Remove Stitch
            </button>
          )}
        </div>
      </div>
    );
  })()}

  {editModalColor && <SharedModals.ThreadSelector
    onClose={() => setEditModalColor(null)}
    currentSymbol={editModalColor.symbol}
    currentThreadId={editModalColor.id}
    usedThreads={pal.map(p => p.id)}
    onSelect={(newThread) => {
      handleSymbolReassignment(editModalColor.id, newThread);
      setEditModalColor(null);
    }}
    onSwap={(conflictingThread) => {
      // conflictingThread = the palette entry currently holding the desired thread
      handleSymbolSwap(editModalColor, conflictingThread);
      setEditModalColor(null);
    }}
    pal={pal}
  />}

  {showExitEditModal && (
    <div role="dialog" aria-modal="true" aria-labelledby="exit-edit-title" style={{position:"fixed",top:0,left:0,right:0,bottom:0,background:"rgba(0,0,0,0.5)",display:"flex",alignItems:"center",justifyContent:"center",zIndex:10000}}>
      <div style={{background:"var(--surface)",padding:24,borderRadius:'var(--radius-xl)',width:350,maxWidth:"90%",boxShadow:"0 10px 25px -5px rgba(0,0,0,0.1), 0 8px 10px -6px rgba(0,0,0,0.1)"}}>
        <h3 id="exit-edit-title" style={{margin:"0 0 12px 0",fontSize:18,color:"var(--text-primary)"}}>Apply changes?</h3>
        <p style={{fontSize:'var(--text-lg)',color:"var(--text-secondary)",margin:"0 0 24px 0",lineHeight:1.5}}>You have made changes to the symbol assignments. Do you want to apply them?</p>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",gap:'var(--s-2)'}}>
          <button onClick={()=>{
            // Cancel
            setShowExitEditModal(false);
          }} style={{padding:"8px 12px",fontSize:'var(--text-lg)',borderRadius:'var(--radius-md)',border:"0.5px solid var(--border)",background:"var(--surface)",cursor:"pointer",fontWeight:500,color:"var(--text-secondary)"}}>Cancel</button>

          <div style={{display:"flex",gap:'var(--s-2)'}}>
            <button onClick={()=>{
              // Discard — restore the full state from when Edit Mode was entered
              if (sessionStartSnapshot) {
                const { pat:startPat, pal:startPal, threadOwned:startOwned, singleStitchEdits:startEdits } = sessionStartSnapshot;
                const newCmap = {}; startPal.forEach(p => { newCmap[p.id] = p; });
                setPat([...startPat]);
                setPal(startPal);
                setCmap(newCmap);
                setThreadOwned(startOwned);
                setSingleStitchEdits(startEdits);
              }
              setUndoSnapshot(null);
              setSessionStartSnapshot(null);
              setIsEditMode(false);
              setShowExitEditModal(false);
            }} style={{padding:"8px 12px",fontSize:'var(--text-lg)',borderRadius:'var(--radius-md)',border:"none",background:"var(--danger-soft)",color:"var(--danger)",cursor:"pointer",fontWeight:500}}>Discard</button>

            <button onClick={()=>{
              // Apply — commit edits; clear undo snapshot (edits are now permanent)
              setUndoSnapshot(null);
              setSessionStartSnapshot(null);
              setIsEditMode(false);
              setShowExitEditModal(false);
            }} style={{padding:"8px 12px",fontSize:'var(--text-lg)',borderRadius:'var(--radius-md)',border:"none",background:"var(--accent)",color:"var(--surface)",cursor:"pointer",fontWeight:500}}>Apply</button>
          </div>
        </div>
      </div>
    </div>
  )}

  {/* Half stitch disambiguation popup */}
  {halfDisambig&&<div style={{position:"fixed",top:0,left:0,right:0,bottom:0,zIndex:10001}} onClick={()=>setHalfDisambig(null)}>
    <div className="hs-scale-in" style={{
      position:"fixed",left:halfDisambig.x-50,top:halfDisambig.y-60,
      background:"var(--surface)",borderRadius:'var(--radius-md)',boxShadow:"0 4px 16px rgba(0,0,0,0.2)",padding:"6px 8px",
      display:"flex",flexDirection:"column",gap:'var(--s-1)',border:"1px solid var(--border)",minWidth:100
    }} onClick={e=>e.stopPropagation()}>
      <button onClick={()=>_markHalfDoneFromDisambig(halfDisambig.idx,"fwd")} style={{
        display:"flex",alignItems:"center",gap:6,padding:"5px 10px",borderRadius:'var(--radius-sm)',border:"none",
        background:"var(--surface-secondary)",cursor:"pointer",fontSize:'var(--text-sm)',fontWeight:500,color:"var(--accent)"
      }}>
        <svg width="14" height="14" viewBox="0 0 14 14"><polygon points="0,0 0,14 14,14" fill="var(--accent-light)"/></svg>
        Mark /
      </button>
      <button onClick={()=>_markHalfDoneFromDisambig(halfDisambig.idx,"bck")} style={{
        display:"flex",alignItems:"center",gap:6,padding:"5px 10px",borderRadius:'var(--radius-sm)',border:"none",
        background:"var(--surface-secondary)",cursor:"pointer",fontSize:'var(--text-sm)',fontWeight:500,color:"var(--accent)"
      }}>
        <svg width="14" height="14" viewBox="0 0 14 14"><polygon points="0,0 14,0 0,14" fill="var(--accent-light)"/></svg>
        Mark \
      </button>
    </div>
  </div>}

{celebration&&<MilestoneCelebration milestone={celebration} onDismiss={()=>setCelebration(null)}/>}
{/* Touch-1 H-2: Focus mini-bar. Renders only when focus mode is on.
    The Exit button never fades — it's the user's only way out. */}
{focusMode&&<div
  ref={focusBarRef}
  className={"cs-focus-bar"+(focusBarFaded?" cs-focus-bar--faded":"")}
  onPointerMove={resetFocusFade}
  onPointerDown={resetFocusFade}
  role="toolbar"
  aria-label="Focus mode toolbar"
>
  {(()=>{
    const selEntry=selectedColorId&&pal?pal.find(p=>p.id===selectedColorId):null;
    if(!selEntry||!selEntry.rgb)return null;
    return <span className="cs-focus-swatch" style={{background:"rgb("+selEntry.rgb.join(",")+")"}} title={selEntry.name||selEntry.id}/>;
  })()}
  <button type="button" onClick={()=>{if(typeof undoTrack==='function')undoTrack();}} aria-label="Undo" title="Undo">{Icons.undo&&Icons.undo()}</button>
  <button type="button" onClick={()=>setStitchZoom(z=>Math.max(0.3,+(z-0.25).toFixed(2)))} aria-label="Zoom out" title="Zoom out">{Icons.minus&&Icons.minus()}</button>
  <button type="button" onClick={()=>setStitchZoom(1)} aria-label="Reset zoom" title="Reset zoom">{Math.round((stitchZoom||1)*100)}%</button>
  <button type="button" onClick={()=>setStitchZoom(z=>Math.min(4,+(z+0.25).toFixed(2)))} aria-label="Zoom in" title="Zoom in">{Icons.plus&&Icons.plus()}</button>
  <button type="button" className="cs-focus-exit" onClick={()=>setFocusMode(false)} aria-label="Exit focus mode" title="Exit focus mode (Esc)">
    {Icons.x&&Icons.x()}<span style={{marginLeft:6}}>Exit focus</span><kbd style={{marginLeft:8,padding:"1px 6px",fontSize:11,fontWeight:600,background:"var(--surface-alt,var(--surface))",border:"1px solid var(--line)",borderRadius:4,fontFamily:"inherit",color:"var(--text-secondary)"}}>Esc</kbd>
  </button>
</div>}
</div>
</>);
}
window.TrackerApp=TrackerApp;
if(!window.__UNIFIED__)ReactDOM.createRoot(document.getElementById("root")).render(<TrackerApp/>);
