const{useState,useRef,useCallback,useEffect,useMemo}=React;

function uint8ToBase64(bytes){
  var CHUNK=0x8000,out='';
  for(var i=0;i<bytes.length;i+=CHUNK)out+=String.fromCharCode.apply(null,bytes.subarray(i,i+CHUNK));
  return btoa(out);
}

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
      var SC;var fc=fabricCt||14;
      if(fc<=11){SC=3;}else if(fc<=17){SC=2;}else{SC=1;}
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
      function drawCross(tc,r1,g1,b1,r2,g2,b2,variant){
        var x0=padding,y0=padding,x1=CELL_SIZE-padding,y1=CELL_SIZE-padding;
        tc.lineCap="round";
        if(lvl===1){
          tc.lineWidth=sw;tc.strokeStyle="rgb("+r1+","+g1+","+b1+")";
          tc.beginPath();tc.moveTo(x0,y1);tc.lineTo(x1,y0);tc.stroke();
          tc.lineWidth=sw;tc.strokeStyle="rgb("+r2+","+g2+","+b2+")";
          tc.beginPath();tc.moveTo(x0,y0);tc.lineTo(x1,y1);tc.stroke();
        }else if(lvl===2){
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
        }else{
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
          var blendParts=cell.id.split("+");
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
    <div className="modal-overlay" onClick={function(e){if(e.target===e.currentTarget)onClose();}} style={{zIndex:1200}}>
      <div className="modal-box" style={{maxWidth:"min(90vw,900px)",maxHeight:"90vh",display:"flex",flexDirection:"column",padding:0,overflow:"hidden"}}>
        <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"12px 16px",borderBottom:"1px solid #e2e8f0",flexShrink:0}}>
          <div style={{display:"flex",alignItems:"center",gap:12}}>
            <span style={{fontWeight:700,fontSize:15}}>Realistic preview</span>
            <div style={{display:"flex",gap:4}}>
              {[1,2,3,4].map(function(l){
                return <button key={l} onClick={function(){onLevelChange(l);}} style={{padding:"3px 8px",borderRadius:5,border:"1px solid "+(level===l?"#0d9488":"#e2e8f0"),background:level===l?"#f0fdfa":"#fff",color:level===l?"#0d9488":"#475569",fontSize:11,fontWeight:600,cursor:"pointer"}}>{lvlLabels[l]}</button>;
              })}
            </div>
          </div>
          <button onClick={onClose} style={{background:"none",border:"none",fontSize:20,cursor:"pointer",color:"#64748b",lineHeight:1,padding:"0 4px"}}>&times;</button>
        </div>
        <div style={{flex:1,overflow:"auto",display:"flex",alignItems:"center",justifyContent:"center",background:"#f8fafc",padding:16}}>
          <canvas ref={displayRef} style={{display:"block",maxWidth:"100%",maxHeight:"calc(90vh - 100px)",imageRendering:"auto"}}/>
        </div>
        <div style={{padding:"8px 16px",borderTop:"1px solid #e2e8f0",flexShrink:0,fontSize:11,color:"#64748b"}}>
          {sW}\u00D7{sH} \u00B7 {fc2}-count\u00B7 {sc2} strand{sc2!==1?"s":""}
        </div>
      </div>
    </div>
  );
}

function TrackerApp({onSwitchToDesign=null, onGoHome=null, isActive=true, incomingProject=null}={}){
const[sW,setSW]=useState(80),[sH,setSH]=useState(80);
const[pat,setPat]=useState(null),[pal,setPal]=useState(null),[cmap,setCmap]=useState(null);
const incomingProjectRef=useRef(incomingProject);
const[fabricCt,setFabricCt]=useState(14);
const[skeinPrice,setSkeinPrice]=useState(DEFAULT_SKEIN_PRICE);
const[stitchSpeed,setStitchSpeed]=useState(40);

const[loadError,setLoadError]=useState(null),[copied,setCopied]=useState(null);
const[modal,setModal]=useState(null);
const[shortcutsHintDismissed,setShortcutsHintDismissed]=useState(()=>{try{return !!localStorage.getItem("shortcuts_hint_dismissed");}catch(_){return false;}});
const [pdfSettings, setPdfSettings] = useState({ chartStyle: 'symbols', cellSize: 3, paper: 'a4', orientation: 'portrait', gridInterval: 10, gridNumbers: true, centerMarks: true, legendLocation: 'separate', legendColumns: 2, coverPage: true, progressOverlay: false, separateBackstitch: false });
const showCtr=true;
const[bsLines,setBsLines]=useState([]);

const[done,setDone]=useState(null);
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

const[sessions,setSessions]=useState([]);
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
const IDLE_THRESHOLD_MS=10*60*1000;
// Persistent milestones, session onboarding, session note toast
const[achievedMilestones,setAchievedMilestones]=useState([]);
const[sessionOnboardingShown,setSessionOnboardingShown]=useState(()=>{try{return !!localStorage.getItem("cs_sessionOnboardingDone");}catch(_){return false;}});
const[sessionSavedToast,setSessionSavedToast]=useState(null);
const isUnloadingRef=useRef(false);

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

const[stitchMode,setStitchMode]=useState("track"),[stitchView,setStitchView]=useState("symbol"),[stitchZoom,setStitchZoom]=useState(1);
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
const[drawer,setDrawer]=useState(false),[focusColour,setFocusColour]=useState(null);
const[showNavHelp,setShowNavHelp]=useState(false);
const[highlightSkipDone,setHighlightSkipDone]=useState(true);
const[onlyStarted,setOnlyStarted]=useState(false);
const[trackerDimLevel,setTrackerDimLevel]=useState(()=>{try{return parseFloat(localStorage.getItem("cs_trDimLv")||"0.1");}catch(_){return 0.1;}});
const[highlightMode,setHighlightMode]=useState(()=>{try{return localStorage.getItem("cs_hlMode")||"isolate";}catch(_){return "isolate";}});
const[tintColor,setTintColor]=useState(()=>{try{return localStorage.getItem("cs_tintColor")||"#FFD700";}catch(_){return "#FFD700";}});
const[tintOpacity,setTintOpacity]=useState(()=>{try{return parseFloat(localStorage.getItem("cs_tintOp")||"0.4");}catch(_){return 0.4;}});
const[spotDimOpacity,setSpotDimOpacity]=useState(()=>{try{return parseFloat(localStorage.getItem("cs_spotDimOp")||"0.15");}catch(_){return 0.15;}});
const[antsOffset,setAntsOffset]=useState(0);
useEffect(()=>{try{localStorage.setItem("cs_hlMode",highlightMode);}catch(_){}},[highlightMode]);
useEffect(()=>{manuallyPausedRef.current=manuallyPaused;},[manuallyPaused]);
const[advanceToast,setAdvanceToast]=useState(null);
const[parkMarkers,setParkMarkers]=useState([]);
const[hlRow,setHlRow]=useState(-1),[hlCol,setHlCol]=useState(-1);
const dragStateRef=useRef({isDragging:false, dragVal:1});
const dragChangesRef=useRef([]);
const scrollRafRef=useRef(null);
const lastClickedRef=useRef(null); // { idx, row, col, val } for shift+click range
const[rangeModeActive,setRangeModeActive]=useState(false);
const[rangeAnchor,setRangeAnchor]=useState(null); // { idx, row, col, val } for touch range mode

const[selectedColorId,setSelectedColorId]=useState(null);

// ═══ Half-stitch state ═══
// Sparse map: cellIdx → { fwd?: {id,rgb,lab,name,type,symbol}, bck?: {id,rgb,lab,name,type,symbol} }
const[halfStitches,setHalfStitches]=useState(new Map());
// Sparse map: cellIdx → { fwd?: 0|1, bck?: 0|1 }
const[halfDone,setHalfDone]=useState(new Map());
useEffect(()=>{if(stitchMode!=="track"){setRangeModeActive(false);setRangeAnchor(null);}},[stitchMode]);
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
const[projectName,setProjectName]=useState("");
const[namePromptOpen,setNamePromptOpen]=useState(false);
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
const todayBarPct=effectiveCombinedTotal>0?Math.min((todayStitchesForBar/effectiveCombinedTotal)*100,Math.min(progressPct,100)):0;
const prevBarPct=Math.max(0,Math.min(progressPct,100)-todayBarPct);

const colourDoneCounts=countsVer>=0?colourDoneCountsRef.current:{};
const layerCounts=useMemo(()=>({full:totalStitchable,half:halfStitchCounts.total,backstitch:bsLines.length,quarter:0,petite:0,french_knot:0,long_stitch:0}),[totalStitchable,halfStitchCounts.total,bsLines.length]);
// Full recompute only on structural changes (pattern load, half-stitch structure edits)
useEffect(()=>{recomputeAllCounts(pat,done,halfStitches,halfDone);},[pat,halfStitches]);
useEffect(()=>{const pid=projectIdRef.current;if(!pid)return;try{localStorage.setItem('cs_layerVis_'+pid,JSON.stringify(layerVis));}catch(_){}},[layerVis]);
useEffect(()=>{try{localStorage.setItem('cs_bsThickness',String(bsThickness));}catch(_){}},[bsThickness]);
// ── Zoom-adaptive detail level ──
const[lockDetailLevel,setLockDetailLevel]=useState(()=>{try{return !!JSON.parse(localStorage.getItem('cs_lockDetail')||'false');}catch(_){return false;}});
useEffect(()=>{try{localStorage.setItem('cs_lockDetail',String(lockDetailLevel));}catch(_){}},[lockDetailLevel]);
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
  return Object.entries(map).sort((a,b)=>{let na=parseInt(a[0])||0,nb=parseInt(b[0])||0;if(na&&nb)return na-nb;return a[0].localeCompare(b[0]);}).map(([id,ct])=>{let t=DMC.find(d=>d.id===id);return{id,name:t?t.name:"",rgb:t?t.rgb:[128,128,128],stitches:ct,skeins:skeinEst(ct,fabricCt)};});
},[pal,fabricCt]);

useEffect(()=>{
  if(typeof StashBridge!=="undefined"){StashBridge.getGlobalStash().then(setGlobalStash).catch(()=>{});}
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
    autoIdleTimerRef.current=setTimeout(()=>{try{if(finaliseAutoSessionRef.current)finaliseAutoSessionRef.current();}catch(e){}},IDLE_THRESHOLD_MS);
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
            data:uint8ToBase64(pako.deflate(done))
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
  setTimeout(function(){if(typeof window.__flushProjectToIDB==='function')window.__flushProjectToIDB();},0);
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
    w.onerror=function(err){setAnalysisRunning(false);};
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
    analysisWorkerRef.current.postMessage({type:"analyse",pat:minPat,done:done?Array.from(done):null,sW,sH,requestId:reqId});
  },500);
  return()=>clearTimeout(analysisThrottleRef.current);
},[pat,done,sW,sH]);

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

function markColourDone(cid,md){if(!pat||!done)return;let changes=[];let nd=new Uint8Array(done);for(let i=0;i<pat.length;i++)if(pat[i].id===cid){if(nd[i]!==(md?1:0))changes.push({idx:i,oldVal:nd[i]});nd[i]=md?1:0;}if(changes.length>0){pushTrackHistory(changes);applyDoneCountsDelta(changes,pat,nd);}setDone(nd);}
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
  if(t>=60)lines.push("Time stitched: "+fmtTime(t)+" ("+sessions.length+" sessions)");
  else lines.push("Time stitched: Not tracked yet");
  if(stPerHr)lines.push("Speed: "+stPerHr+" stitches/hour");
  if(estRem)lines.push("Est. remaining: "+fmtTime(estRem));
  lines.push("Pattern: "+sW+"\u00D7"+sH+", "+totalColours+" colours, "+fabricCt+"ct");
  copyText(lines.join("\n"),"progress");
}

function pushTrackHistory(changes){
  if(!changes||!changes.length)return;
  // Track colours for auto-session
  if(pat){for(let i=0;i<changes.length;i++){const id=pat[changes[i].idx]&&pat[changes[i].idx].id;if(id&&id!=='__skip__'&&id!=='__empty__')pendingColoursRef.current.add(id);}}
  setTrackHistory(prev=>{let n=[...prev,changes];if(n.length>TRACK_HISTORY_MAX)n=n.slice(n.length-TRACK_HISTORY_MAX);return n;});
  setRedoStack([]);
}
function undoTrack(){
  if(!trackHistory.length||!done)return;
  let last=trackHistory[trackHistory.length-1];
  let nd=new Uint8Array(done);
  let redoEntry=last.map(c=>({idx:c.idx,oldVal:nd[c.idx]}));
  for(let c of last)nd[c.idx]=c.oldVal;
  applyDoneCountsDelta(redoEntry,pat,nd);
  setDone(nd);
  setTrackHistory(prev=>prev.slice(0,-1));
  setRedoStack(prev=>{let n=[...prev,redoEntry];if(n.length>TRACK_HISTORY_MAX)n=n.slice(n.length-TRACK_HISTORY_MAX);return n;});
}
function redoTrack(){
  if(!redoStack.length||!done)return;
  let last=redoStack[redoStack.length-1];
  let nd=new Uint8Array(done);
  let undoEntry=last.map(c=>({idx:c.idx,oldVal:nd[c.idx]}));
  for(let c of last)nd[c.idx]=c.oldVal;
  applyDoneCountsDelta(undoEntry,pat,nd);
  setDone(nd);
  setRedoStack(prev=>prev.slice(0,-1));
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
    pattern:pat.map(m=>(m.id==="__skip__"||m.id==="__empty__")?{id:m.id}:{id:m.id,type:m.type,rgb:m.rgb}),
    bsLines,
    done:done?Array.from(done):null,
    parkMarkers,
    totalTime:totalTime+liveAutoElapsed,
    sessions,
    hlRow,
    hlCol,
    threadOwned,
    originalPaletteState,
    singleStitchEdits: sseArr,
    halfStitches: hsArr,
    halfDone: hdArr,
    statsSessions,
    statsSettings,
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
        pdf.setFontSize(11);pdf.setTextColor(100);pdf.text("PROGRESS",mg,y);y+=7;pdf.setFontSize(10);pdf.setTextColor(40);pdf.text(`${localProgressPct}% complete — ${localDoneCount.toLocaleString()} of ${totalStitchable.toLocaleString()} stitches`,mg,y);y+=8;if(totalTime>0){pdf.text(`Time stitched: ${fmtTimeL(totalTime)} (${sessions.length} session${sessions.length!==1?"s":""})`,mg,y);y+=5.5;let actualSpeed=Math.round(localDoneCount/(totalTime/3600));pdf.text(`Actual speed: ${actualSpeed} stitches/hr`,mg,y);y+=5.5;}y+=4;
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
  pdf.text("Color",mg+15,ty);
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
    const project=lastSnapshotRef.current;
    if(project){
      saveProjectToDB(project).catch(()=>{});
      ProjectStorage.save(project).then(id=>ProjectStorage.setActiveProject(id)).catch(()=>{});
    }
    onSwitchToDesign();
    return;
  }
  let project={version:8,page:"tracker",name:projectName,settings:{sW,sH,maxC:pal.length,bri:0,con:0,sat:0,dith:false,skipBg:false,bgTh:15,bgCol:"#ffffff",minSt:0,arLock:true,ar:1,fabricCt,skeinPrice:1.2,stitchSpeed:40,smooth:0,smoothType:"median",orphans:0},pattern:pat.map(m=>m.id==="__skip__"?{id:"__skip__"}:{id:m.id,type:m.type,rgb:m.rgb}),bsLines,done:Array.from(done),parkMarkers,totalTime,sessions,hlRow,hlCol,threadOwned,imgData:null,statsSessions,statsSettings};
  try{
    localStorage.setItem("crossstitch_handoff_to_creator", JSON.stringify(project));
    window.location.href = "index.html?source=tracker";
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
  const currentPalState = JSON.parse(JSON.stringify(pal));
  const currentThreadOwnedState = JSON.parse(JSON.stringify(threadOwned));
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
  let s=project.settings||{};
  setSW(project.w||s.sW||project.settings?.w||80);
  setSH(project.h||s.sH||project.settings?.h||80);
  setBsLines(project.bsLines||project.bs||[]);
  if(s.fabricCt)setFabricCt(s.fabricCt);
  else if(project.fc)setFabricCt(project.fc);
  if(s.skeinPrice!=null)setSkeinPrice(s.skeinPrice);
  if(s.stitchSpeed)setStitchSpeed(s.stitchSpeed);

  let p = project.pattern || project.p;
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
    setOriginalPaletteState(JSON.parse(JSON.stringify(newPal)));
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
  setSessions(project.sessions||[]);
  // Legacy migration: if no sessions but totalTime exists, create a synthetic session
  var rawStatsSessions=project.statsSessions||[];
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
    var sorted=rawStatsSessions.slice().sort(function(a,b){return(a.startTime||a.date||'')<(b.startTime||b.date||'')?-1:1;});
    var running=0;
    sorted.forEach(function(s){running+=(s.netStitches||0);if(s.totalAtEnd==null)s.totalAtEnd=Math.min(Math.max(0,running),totalStitchCount);});
  }
  setStatsSessions(rawStatsSessions);
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
  projectIdRef.current = project.id || null;
  try{const saved=localStorage.getItem('cs_layerVis_'+(project.id||''));if(saved)setLayerVis(JSON.parse(saved));else setLayerVis(ALL_LAYERS_VISIBLE);}catch(_){setLayerVis(ALL_LAYERS_VISIBLE);}
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
        if(!project.pattern && !project.p)throw new Error("Invalid format");
        processLoadedProject(project);
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
        if(!project.createdAt) project.createdAt = importedAt;
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
  processLoadedProject(incomingProject.project);
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
    processLoadedProject(incomingProjectRef.current.project);
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
  if (!projectIdRef.current) projectIdRef.current = "proj_" + Date.now();
  if (!createdAtRef.current) createdAtRef.current = new Date().toISOString();
  const sseArr = [...singleStitchEdits.entries()];
  const hsArr = [...halfStitches.entries()].map(([idx, hs]) => [idx, {
    fwd: hs.fwd ? { id: hs.fwd.id, rgb: hs.fwd.rgb } : undefined,
    bck: hs.bck ? { id: hs.bck.id, rgb: hs.bck.rgb } : undefined
  }]);
  const hdArr = [...halfDone.entries()];
  return {
    version: 9, id: projectIdRef.current, page: "tracker", name: projectName,
    createdAt: createdAtRef.current, updatedAt: new Date().toISOString(),
    settings: { sW, sH, fabricCt, skeinPrice, stitchSpeed },
    pattern: pat.map(m => (m.id === "__skip__" || m.id === "__empty__") ? { id: m.id } : { id: m.id, type: m.type, rgb: m.rgb }),
    bsLines, done: done ? Array.from(done) : null, parkMarkers,
    totalTime: totalTime + liveAutoElapsed,
    sessions, hlRow, hlCol, threadOwned, originalPaletteState,
    singleStitchEdits: sseArr, halfStitches: hsArr, halfDone: hdArr,
    statsSessions, statsSettings, achievedMilestones, doneSnapshots,
    savedZoom: stitchZoom,
    savedScroll: stitchScrollRef.current ? { left: stitchScrollRef.current.scrollLeft, top: stitchScrollRef.current.scrollTop } : null
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
    if (typeof StashBridge !== "undefined" && skeinData.length > 0) {
      StashBridge.syncProjectToLibrary(
        projectIdRef.current,
        projectName || `${sW}×${sH} pattern`,
        skeinData,
        combinedDone >= combinedTotal && combinedTotal > 0 ? "completed" : "inprogress"
      ).catch(err => console.error("Library sync failed:", err));
    }
  }, 5000);
  return () => clearTimeout(saveTimer);
}, [pat, pal, done, bsLines, parkMarkers, totalTime, sessions, hlRow, hlCol, threadOwned,
    halfStitches, halfDone, singleStitchEdits, liveAutoElapsed,
    sW, sH, fabricCt, skeinPrice, stitchSpeed, originalPaletteState, statsSessions, statsSettings, projectName, stitchZoom, doneSnapshots, achievedMilestones]);

// Save the freshest snapshot before the page unloads (best-effort fire-and-forget).
// Uses only refs so the handler is never stale; drag in-progress mutations are applied
// from dragChangesRef before saving.
useEffect(() => {
  const handleBeforeUnload = () => {
    try {
    isUnloadingRef.current = true;
    // Build a fresh snapshot if dirty (deferred save may not have fired yet)
    let project = lastSnapshotRef.current;
    if (autoSaveDirtyRef.current || !project) {
      const fresh = buildSnapshotRef.current();
      if (fresh) { project = fresh; lastSnapshotRef.current = fresh; }
    }
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
        await saveProjectToDB(project).catch(() => {});
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
      pattern: pat.map(m => (m.id === "__skip__" || m.id === "__empty__") ? { id: m.id } : { id: m.id, type: m.type, rgb: m.rgb }),
      bsLines, done: done ? Array.from(done) : null, parkMarkers,
      totalTime: totalTime + liveAutoElapsed,
      sessions, hlRow, hlCol, threadOwned, originalPaletteState,
      singleStitchEdits: sseArr, halfStitches: hsArr, halfDone: hdArr,
      statsSessions, statsSettings, achievedMilestones, doneSnapshots,
      savedZoom: stitchZoom,
      savedScroll: stitchScrollRef.current ? { left: stitchScrollRef.current.scrollLeft, top: stitchScrollRef.current.scrollTop } : null
    };
    lastSnapshotRef.current = project;
    await ProjectStorage.save(project);
    await saveProjectToDB(project).catch(() => {});
  };
  return () => { delete window.__flushProjectToIDB; };
}, [projectName, sW, sH, fabricCt, skeinPrice, stitchSpeed, pat, pal, bsLines, done,
    halfStitches, halfDone, parkMarkers, totalTime, liveAutoElapsed, sessions, hlRow, hlCol,
    threadOwned, originalPaletteState, singleStitchEdits, statsSessions, statsSettings, achievedMilestones, stitchZoom, doneSnapshots]);

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
    for(let x=startX;x<endX;x++){
      let idx=y*sW+x,m=pat[idx];if(!m)continue;
      let info=(m.id==="__skip__"||m.id==="__empty__")?null:(cmap?cmap[m.id]:null);
      let px=gut+x*cSz,py=gut+y*cSz;
      let isDn=done&&done[idx];

      // ── Tier 1 fast path: flat color blocks, no symbols, no cell borders ──
      if(tier===1){
        if(m.id==="__skip__"||m.id==="__empty__"){ctx.fillStyle="#f0f4f8";ctx.fillRect(px,py,cSz,cSz);continue;}
        if(isDn){ctx.fillStyle=`rgb(${m.rgb[0]},${m.rgb[1]},${m.rgb[2]})`;ctx.fillRect(px,py,cSz,cSz);}
        else{const r2=Math.round(m.rgb[0]*0.45+255*0.55),g2=Math.round(m.rgb[1]*0.45+255*0.55),b2=Math.round(m.rgb[2]*0.45+255*0.55);ctx.fillStyle=`rgb(${r2},${g2},${b2})`;ctx.fillRect(px,py,cSz,cSz);}
        continue;
      }

      let dimmed=stitchView==="highlight"&&focusColour&&m.id!==focusColour&&m.id!=="__skip__"&&m.id!=="__empty__";
      const effectiveDimmed=dimmed&&highlightMode!=="outline"&&highlightMode!=="tint";
      const dimR=Math.round(255-(255-m.rgb[0])*trackerDimLevel),dimG=Math.round(255-(255-m.rgb[1])*trackerDimLevel),dimB=Math.round(255-(255-m.rgb[2])*trackerDimLevel);
      const dimFill=effectiveDimmed?`rgb(${dimR},${dimG},${dimB})`:'#f1f5f9';
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
        if(isDn){ctx.fillStyle="#d1fae5";ctx.fillRect(px,py,cSz,cSz);}
        else{ctx.fillStyle="#fff";ctx.fillRect(px,py,cSz,cSz);if(info&&symAlpha>0.01){ctx.save();ctx.globalAlpha=symAlpha;ctx.fillStyle="#1e293b";ctx.font=fSym;ctx.fillText(info.symbol,px+cSz/2,py+cSz/2);ctx.restore();}}
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
        else{ctx.fillStyle=`rgba(${m.rgb[0]},${m.rgb[1]},${m.rgb[2]},0.25)`;ctx.fillRect(px,py,cSz,cSz);if(info&&symAlpha>0.01){ctx.save();ctx.globalAlpha=symAlpha;ctx.fillStyle="#1e293b";ctx.font=fHlFocus;ctx.fillText(info.symbol,px+cSz/2,py+cSz/2);ctx.restore();}}
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
  if(parkMarkers.length>0){parkMarkers.forEach(pm=>{let cx2=gut+pm.x*cSz,cy2=gut+pm.y*cSz,r=Math.max(4,cSz*0.35);ctx.fillStyle=`rgb(${pm.rgb[0]},${pm.rgb[1]},${pm.rgb[2]})`;ctx.strokeStyle="#000";ctx.lineWidth=2;ctx.beginPath();ctx.arc(cx2,cy2,r,0,Math.PI*2);ctx.fill();ctx.stroke();});}
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
},[pat,cmap,scs,sW,sH,showCtr,bsLines,done,parkMarkers,hlRow,hlCol,stitchView,focusColour,halfStitches,halfDone,stitchZoom,highlightMode,tintColor,tintOpacity,spotDimOpacity,antsOffset,trackerDimLevel,layerVis,bsThickness,lockDetailLevel]);
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
      if(rank===0){ctx.strokeStyle=`rgba(13,148,136,${pulseAlpha})`;ctx.lineWidth=3;}
      else{ctx.strokeStyle="rgba(13,148,136,0.2)";ctx.lineWidth=2;}
      ctx.strokeRect(x+1,y+1,w-2,h-2);
    });
  };
  const loop=()=>{draw();recPulseRef.current=requestAnimationFrame(loop);};
  loop();
  return()=>cancelAnimationFrame(recPulseRef.current);
},[recommendations,recEnabled,analysisResult,scs,sW,sH]);


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
      if(isDn){ctx.fillStyle="#d1fae5";ctx.fillRect(px,py,cSz,cSz);}
      else{ctx.fillStyle="#fff";ctx.fillRect(px,py,cSz,cSz);if(info&&symAlpha>0.01){ctx.save();ctx.globalAlpha=symAlpha;ctx.fillStyle="#1e293b";ctx.font=`bold ${symPx}px monospace`;ctx.textAlign="center";ctx.textBaseline="middle";ctx.fillText(info.symbol,px+cSz/2,py+cSz/2);ctx.restore();}}
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
      if(isDn){ctx.fillStyle=dimmed?"#f1f5f9":`rgb(${m.rgb[0]},${m.rgb[1]},${m.rgb[2]})`;ctx.fillRect(px,py,cSz,cSz);}
      else if(dimmed){ctx.fillStyle="#f1f5f9";ctx.fillRect(px,py,cSz,cSz);if(symAlpha>0.01&&info&&cSz>=8){ctx.save();ctx.globalAlpha=symAlpha;ctx.fillStyle="rgba(0,0,0,0.06)";ctx.font=`${Math.max(6,Math.round(cSz*0.45))}px monospace`;ctx.textAlign="center";ctx.textBaseline="middle";ctx.fillText(info.symbol,px+cSz/2,py+cSz/2);ctx.restore();}}
      else{ctx.fillStyle=`rgba(${m.rgb[0]},${m.rgb[1]},${m.rgb[2]},0.25)`;ctx.fillRect(px,py,cSz,cSz);if(info&&symAlpha>0.01){ctx.save();ctx.globalAlpha=symAlpha;ctx.fillStyle="#1e293b";ctx.font=`bold ${symPx}px monospace`;ctx.textAlign="center";ctx.textBaseline="middle";ctx.fillText(info.symbol,px+cSz/2,py+cSz/2);ctx.restore();}}
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
  _toggleHalfDone(idx, dir);
  setHalfDisambig(null);
}

function handleStitchMouseDown(e){
  if(!stitchRef.current||!pat)return;
  if(e.button===1||isSpaceDownRef.current){e.preventDefault();startPan(e);return;}
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
      if(gx>=0&&gx<=sW&&gy>=0&&gy<=sH){let existing=parkMarkers.findIndex(m=>m.x===gx&&m.y===gy);if(existing>=0)setParkMarkers(prev=>prev.filter((_,i)=>i!==existing));else setParkMarkers(prev=>[...prev,{x:gx,y:gy,colorId:selectedColorId,rgb:cmap[selectedColorId].rgb}]);}
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
        setHalfDisambig({idx,x:e.clientX,y:e.clientY});
        e.preventDefault();
        return;
      }
      _toggleHalfDone(idx,hitDir);
    } else {
      // Single half: toggle it
      const dir=hs.fwd?"fwd":"bck";
      _toggleHalfDone(idx,dir);
    }
    e.preventDefault();
    return;
  }

  if(pat[idx].id==="__skip__"||pat[idx].id==="__empty__")return;

  // ═══ Range mode (2-click rectangle, desktop) ═══
  if(rangeModeActive&&stitchMode==="track"&&!e.shiftKey){
    if(!rangeAnchor){
      // First click: toggle this cell and set it as the anchor; do NOT start drag
      let nv=done[idx]?0:1;
      const oldVal=done[idx];
      done[idx]=nv;
      drawCellDirectly(idx,nv);
      pushTrackHistory([{idx,oldVal}]);
      applyDoneCountsDelta([{idx,oldVal}],pat,done);
      setDone(new Uint8Array(done));
      lastClickedRef.current={idx,row:gy,col:gx,val:nv};
      setRangeAnchor({idx,row:gy,col:gx,val:nv});
    }else{
      // Second click: fill rectangle from anchor to here
      const a=rangeAnchor;
      const minR=Math.min(a.row,gy),maxR=Math.max(a.row,gy);
      const minC=Math.min(a.col,gx),maxC=Math.max(a.col,gx);
      const targetVal=a.val;
      const changes=[];
      for(let r=minR;r<=maxR;r++){for(let c=minC;c<=maxC;c++){
        const ci=r*sW+c;const cell=pat[ci];
        if(cell.id==="__skip__"||cell.id==="__empty__")continue;
        if(done[ci]!==targetVal){changes.push({idx:ci,oldVal:done[ci]});done[ci]=targetVal;}
      }}
      if(changes.length){pushTrackHistory(changes);applyDoneCountsDelta(changes,pat,done);setDone(new Uint8Array(done));renderStitch();}
      lastClickedRef.current={idx,row:gy,col:gx,val:targetVal};
      setRangeAnchor(null);
    }
    e.preventDefault();
    return;
  }

  // ═══ Shift+Click range fill ═══
  if(e.shiftKey&&lastClickedRef.current&&stitchMode==="track"){
    const a=lastClickedRef.current;
    const bCol=gx,bRow=gy;
    const minR=Math.min(a.row,bRow),maxR=Math.max(a.row,bRow);
    const minC=Math.min(a.col,bCol),maxC=Math.max(a.col,bCol);
    const targetVal=a.val;
    const changes=[];
    for(let r=minR;r<=maxR;r++){
      for(let c=minC;c<=maxC;c++){
        const ci=r*sW+c;
        const cell=pat[ci];
        if(cell.id==="__skip__"||cell.id==="__empty__")continue;
        if(done[ci]!==targetVal){
          changes.push({idx:ci,oldVal:done[ci]});
          done[ci]=targetVal;
        }
      }
    }
    if(changes.length){
      pushTrackHistory(changes);
      applyDoneCountsDelta(changes,pat,done);
      setDone(new Uint8Array(done));
      renderStitch();
    }
    lastClickedRef.current={idx,row:gy,col:gx,val:targetVal};
    e.preventDefault();
    return;
  }

  let nv=done[idx]?0:1;
  lastClickedRef.current={idx,row:gy,col:gx,val:nv};
  dragStateRef.current = { isDragging: true, dragVal: nv };
  dragChangesRef.current=[{idx,oldVal:done[idx]}];
  done[idx] = nv; // Optimistic update
  drawCellDirectly(idx, nv);
  window.addEventListener("pointerup", handleMouseUp, { once: true });
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

  if(!dragStateRef.current.isDragging||stitchMode!=="track"||!done||!stitchRef.current||!pat)return;
  if(!gc)return;let{gx,gy}=gc;
  if(gx<0||gx>=sW||gy<0||gy>=sH)return;
  let idx=gy*sW+gx;if(pat[idx].id==="__skip__"||pat[idx].id==="__empty__")return;
  const dVal = dragStateRef.current.dragVal;
  if(done[idx]!==dVal){
    dragChangesRef.current.push({idx,oldVal:done[idx]});
    done[idx] = dVal; // Optimistic update
    drawCellDirectly(idx, dVal);
  }
}
function handleStitchMouseLeave(){
  handleMouseUp();
  setHoverInfo(null);
  updateHoverOverlay(null);
}
function handleMouseUp(){
  if(isPanning){setIsPanning(false);return;}
  if(dragStateRef.current.isDragging&&dragChangesRef.current.length>0){
    pushTrackHistory([...dragChangesRef.current]);
    applyDoneCountsDelta(dragChangesRef.current,pat,done);
    let nd = new Uint8Array(done);
    setDone(nd);
    dragChangesRef.current=[];
  }
  dragStateRef.current.isDragging = false;
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
    const t=e.touches[0];
    ts.startX=t.clientX; ts.startY=t.clientY;
    ts.mode="tap"; ts.tapIdx=-1;
    if(!isEditMode&&stitchMode==="track"&&done){
      const gc=gridCoord(stitchRef,{clientX:t.clientX,clientY:t.clientY},scs,G,false);
      if(gc&&gc.gx>=0&&gc.gx<sW&&gc.gy>=0&&gc.gy<sH){
        const idx=gc.gy*sW+gc.gx;
        if(pat[idx].id!=="__skip__"&&pat[idx].id!=="__empty__"){
          ts.tapIdx=idx; ts.tapVal=done[idx]?0:1;
        }
      }
    }
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
  const ts=touchStateRef.current;
  if(ts.mode==="tap"&&ts.tapIdx>=0&&done){
    const idx=ts.tapIdx;
    if(isEditMode){
      const t=e.changedTouches[0];
      const gc={gx:idx%sW,gy:Math.floor(idx/sW)};
      setCellEditPopover({idx,row:gc.gy+1,col:gc.gx+1,x:t.clientX,y:t.clientY});
    }else if(stitchMode==="track"){
      if(rangeModeActive){
        const gx=idx%sW,gy=Math.floor(idx/sW);
        if(!rangeAnchor){
          // First tap: toggle the anchor cell AND record it as the anchor
          const nv=ts.tapVal;
          const nd=new Uint8Array(done);
          nd[idx]=nv;
          pushTrackHistory([{idx,oldVal:done[idx]}]);
          applyDoneCountsDelta([{idx,oldVal:done[idx]}],pat,nd);
          setDone(nd);
          drawCellDirectly(idx,nv);
          setRangeAnchor({idx,row:gy,col:gx,val:nv});
        }else{
          // Second tap fills rectangle then clears anchor
          const a=rangeAnchor;
          const minR=Math.min(a.row,gy),maxR=Math.max(a.row,gy);
          const minC=Math.min(a.col,gx),maxC=Math.max(a.col,gx);
          const targetVal=a.val;
          const changes=[];
          for(let r=minR;r<=maxR;r++){
            for(let c=minC;c<=maxC;c++){
              const ci=r*sW+c;
              const cell=pat[ci];
              if(cell.id==="__skip__"||cell.id==="__empty__")continue;
              if(done[ci]!==targetVal){
                changes.push({idx:ci,oldVal:done[ci]});
                done[ci]=targetVal;
              }
            }
          }
          if(changes.length){
            pushTrackHistory(changes);
            applyDoneCountsDelta(changes,pat,done);
            setDone(new Uint8Array(done));
            renderStitch();
          }
          setRangeAnchor(null);
        }
      }else{
        const nv=ts.tapVal;
        const nd=new Uint8Array(done);
        nd[idx]=nv;
        pushTrackHistory([{idx,oldVal:done[idx]}]);
        applyDoneCountsDelta([{idx,oldVal:done[idx]}],pat,nd);
        setDone(nd);
        drawCellDirectly(idx,nv);
      }
    }
  }
  ts.mode="none"; ts.tapIdx=-1; ts.pinchDist=0;
}

function toggleOwned(id){setThreadOwned(prev=>{let cur=prev[id]||"";let next=cur===""?"owned":cur==="owned"?"tobuy":"";return{...prev,[id]:next};});}
const ownedCount=useMemo(()=>skeinData.filter(d=>(threadOwned[d.id]||"")==="owned").length,[skeinData,threadOwned]);
const toBuyList=useMemo(()=>skeinData.filter(d=>(threadOwned[d.id]||"")!=="owned"),[skeinData,threadOwned]);

useEffect(()=>{
  function handleKeyDown(e){
    if(["INPUT","SELECT","TEXTAREA","BUTTON","A"].includes(document.activeElement?.tagName)||document.activeElement?.isContentEditable)return;
    const mod=e.ctrlKey||e.metaKey;
    if(mod&&!e.shiftKey&&e.key==="z"){e.preventDefault();if(isEditMode&&undoSnapshot){applyUndo();}else if(!isEditMode){undoTrack();}return;}
    if((mod&&e.key==="y")||(mod&&e.shiftKey&&e.key==="z")){e.preventDefault();if(!isEditMode)redoTrack();return;}
    if(mod&&e.key==="s"){e.preventDefault();if(pat&&pal)saveProject();return;}
    if(mod)return;
    if(e.code==="Space"){e.preventDefault();if(!isSpaceDownRef.current){isSpaceDownRef.current=true;spaceDownTimeRef.current=Date.now();spacePannedRef.current=false;}return;}
    if(e.key==="Escape"){
      if(rangeModeActive){setRangeModeActive(false);setRangeAnchor(null);return;}
      if(halfDisambig){setHalfDisambig(null);return;}
      if(namePromptOpen){setNamePromptOpen(false);return;}
      if(modal){setModal(null);return;}
      if(showExitEditModal){setShowExitEditModal(false);return;}
      if(cellEditPopover){setCellEditPopover(null);return;}
      if(importDialog){setImportDialog(null);return;}
      if(tOverflowOpen){setTOverflowOpen(false);return;}
      if(focusColour&&stitchView==="highlight"){setFocusColour(null);return;}
      if(drawer){setDrawer(false);return;}
      return;
    }
    if(e.key==="?"){setModal(m=>m==="shortcuts"?null:"shortcuts");return;}
    if(!isEditMode){
      if(e.key==="t"||e.key==="T"){setStitchMode("track");return;}
      if(e.key==="n"||e.key==="N"){setStitchMode("navigate");return;}
      if(e.key==="v"||e.key==="V"){
        const nextView=stitchView==="symbol"?"colour":stitchView==="colour"?"highlight":"symbol";
        setStitchView(nextView);
        if(nextView==="highlight"&&!focusColour){const first=focusableColors.find(p=>{const dc=colourDoneCounts[p.id];return !dc||dc.done<dc.total;})||focusableColors[0];if(first)setFocusColour(first.id);}
        return;
      }
      // Layer toggle shortcuts
      if(e.key==="f"||e.key==="F"){setLayerVis(v=>({...v,full:!v.full}));return;}
      if(e.key==="h"||e.key==="H"){setLayerVis(v=>({...v,half:!v.half}));return;}
      if(e.key==="b"||e.key==="B"){setLayerVis(v=>({...v,backstitch:!v.backstitch}));return;}
      if(e.key==="k"||e.key==="K"){setLayerVis(v=>({...v,french_knot:!v.french_knot}));return;}
      if(e.key==="a"||e.key==="A"){if(Object.values(layerVis).every(Boolean)){const allOff=Object.fromEntries(STITCH_LAYERS.map(l=>[l.id,false]));setLayerVis(allOff);}else{setLayerVis(ALL_LAYERS_VISIBLE);}return;}
    }
    if(e.key==="d"||e.key==="D"){setDrawer(d=>!d);return;}
    if((e.key==="p"||e.key==="P")&&!isEditMode&&currentAutoSessionRef.current){
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
      return;
    }
    if(e.key==="="||e.key==="+"){setStitchZoom(z=>Math.min(4,+(z+0.1).toFixed(2)));return;}
    if(e.key==="-"){setStitchZoom(z=>Math.max(0.3,+(z-0.1).toFixed(2)));return;}
    if(e.key==="0"){fitSZ();return;}
    if(stitchView==="highlight"&&!isEditMode){
      if(focusColour){
        if(e.key==="1"){setHighlightMode("isolate");return;}
        if(e.key==="2"){setHighlightMode("outline");return;}
        if(e.key==="3"){setHighlightMode("tint");return;}
        if(e.key==="4"){setHighlightMode("spotlight");return;}
      }
      if(e.key==="ArrowRight"||e.key==="]"){
        e.preventDefault();
        setFocusColour(prev=>{if(!focusableColors.length)return prev;const idx=focusableColors.findIndex(p=>p.id===prev);return focusableColors[(idx+1)%focusableColors.length].id;});
      }else if(e.key==="ArrowLeft"||e.key==="["){
        e.preventDefault();
        setFocusColour(prev=>{if(!focusableColors.length)return prev;const idx=focusableColors.findIndex(p=>p.id===prev);return focusableColors[(idx<=0?focusableColors.length:idx)-1].id;});
      }
    }
  }
  function handleKeyUp(e){
    if(e.code==="Space"){isSpaceDownRef.current=false;spacePannedRef.current=false;}
  }
  if(!isActive)return;
  window.addEventListener("keydown",handleKeyDown);
  window.addEventListener("keyup",handleKeyUp);
  return()=>{window.removeEventListener("keydown",handleKeyDown);window.removeEventListener("keyup",handleKeyUp);};
},[stitchView,isEditMode,focusableColors,isActive,namePromptOpen,modal,showExitEditModal,cellEditPopover,importDialog,tOverflowOpen,drawer,halfDisambig,focusColour,pat,pal,undoSnapshot,countsVer,trackHistory,redoStack,highlightMode,manuallyPaused,rangeModeActive,layerVis]);

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

return(
<>
<input ref={loadRef} type="file" accept=".json,.oxs,.xml,.png,.jpg,.jpeg,.gif,.bmp,.webp,.pdf" onChange={loadProject} style={{display:"none"}}/>
<Header page="tracker" onOpen={()=>loadRef.current.click()} onSave={pat?saveProject:null} onExportPDF={pat?()=>setModal('pdf_export'):null} onNewProject={pat?()=>{if(confirm("Start fresh? Your current project is auto-saved.")){if(typeof ProjectStorage!=='undefined')ProjectStorage.clearActiveProject();else localStorage.removeItem("crossstitch_active_project");if(onGoHome){onGoHome();}else{window.location.href='index.html';}}}:null} setModal={setModal} projectName={pat&&pal?(projectName || (sW + '×' + sH + ' pattern')):undefined} projectPct={pat&&pal&&totalStitchable>0?Math.round(doneCount/totalStitchable*100):undefined} onNameChange={pat&&pal?(n=>setProjectName(n)):undefined} />
{namePromptOpen&&<NamePromptModal
  defaultName={projectName || (sW+'×'+sH+' pattern')}
  onConfirm={name=>{setProjectName(name);setNamePromptOpen(false);doSaveProject(name);}}
  onCancel={()=>setNamePromptOpen(false)}
/>}
{pat&&pal&&<>
{/* ═══ TRACKER PILL TOOLBAR ═══ */}
<div className="toolbar-row"><div className="pill-row" style={{display:'flex',alignItems:'center',justifyContent:'center'}}>
  <div ref={tStripRef} className="pill">
  <div className={"tb-grp"+(tStripCollapsed.stitch?" tb-hidden":"")}>
    <button className={"tb-btn"+(stitchMode==="track"?" tb-btn--green":"")} onClick={()=>{setStitchMode("track");}} title="Mark stitch (T)">
      <svg width="11" height="11" viewBox="0 0 12 12"><line x1="1" y1="11" x2="11" y2="1" stroke="currentColor" strokeWidth="1.8"/><line x1="1" y1="1" x2="11" y2="11" stroke="currentColor" strokeWidth="1.8"/></svg>Mark
    </button>
    <button className={"tb-btn"+(stitchMode==="navigate"?" tb-btn--on":"")} onClick={()=>{setStitchMode("navigate");}} title="Navigate (N)">Nav</button>
    {stitchMode==="track"&&<button className={"tb-btn"+(rangeModeActive?" tb-btn--blue":"")} onClick={()=>{setRangeModeActive(r=>!r);setRangeAnchor(null);}} title="Range select mode">⊞ Range</button>}
  </div>
  <div className="tb-sdiv"/>
  <div className={"tb-grp"+(tStripCollapsed.view?" tb-hidden":"")}>
    {[['symbol','Sym'],['colour','Col+Sym'],['highlight','HL']].map(([k,l])=><button key={k} className={"tb-btn"+(stitchView===k?" tb-btn--on":"")} title="Cycle view (V)" onClick={()=>{setStitchView(k);if(k!=="highlight"){setFocusColour(null);}else if(!focusColour){const first=pal.find(p=>{const dc=colourDoneCounts[p.id];return !dc||dc.done<dc.total;})||pal[0];if(first)setFocusColour(first.id);}}}>{l}</button>)}
  </div>
  {stitchView==="highlight"&&<>
    <button className="tb-btn" onClick={()=>{if(!focusableColors.length)return;const idx=focusableColors.findIndex(p=>p.id===focusColour);const prev=focusableColors[(idx<=0?focusableColors.length:idx)-1];setFocusColour(prev.id);}} title="Previous colour (])">◀</button>
    <button className="tb-btn" onClick={()=>{if(!focusableColors.length)return;const idx=focusableColors.findIndex(p=>p.id===focusColour);const next=focusableColors[(idx+1)%focusableColors.length];setFocusColour(next.id);}} title="Next colour ([)">▶</button>
  </>}
  <div className="tb-flex"/>
  <div className="tb-zoom-grp tb-desktop-only">
    <span className="tb-zoom-lbl">Zoom</span>
    <button onClick={()=>setStitchZoom(z=>Math.max(0.3,+(z-0.25).toFixed(2)))} title="Zoom out" style={{padding:"0 5px",fontSize:15,border:"0.5px solid #e2e8f0",borderRadius:4,background:"#f8f9fa",cursor:"pointer",lineHeight:"22px",fontWeight:600}}>−</button>
    <input type="range" min={0.1} max={3} step={0.05} value={stitchZoom} onChange={e=>setStitchZoom(Number(e.target.value))} style={{width:55}}/>
    <button onClick={()=>setStitchZoom(z=>Math.min(4,+(z+0.25).toFixed(2)))} title="Zoom in" style={{padding:"0 5px",fontSize:15,border:"0.5px solid #e2e8f0",borderRadius:4,background:"#f8f9fa",cursor:"pointer",lineHeight:"22px",fontWeight:600}}>+</button>
    <span className="tb-zoom-pct">{Math.round(stitchZoom*100)}%</span>
    <button className="tb-fit-btn" onClick={fitSZ}>Fit</button>
  </div>
  <div className="tb-overflow-wrap" ref={tOverflowRef}>
    <button className="tb-overflow-btn" onClick={()=>setTOverflowOpen(o=>!o)} title="More options">···</button>
    {tOverflowOpen&&<div className="tb-overflow-menu">
      {!isEditMode&&<>
        {tStripCollapsed.stitch&&<><span className="tb-ovf-lbl">Stitch</span>
          <button className={"tb-ovf-item"+(stitchMode==="track"?" tb-ovf-item--on":"")} onClick={()=>{setStitchMode("track");setTOverflowOpen(false);}}>Mark{stitchMode==="track"?" ✓":""}</button>
          <button className={"tb-ovf-item"+(stitchMode==="navigate"?" tb-ovf-item--on":"")} onClick={()=>{setStitchMode("navigate");setTOverflowOpen(false);}}>Navigate{stitchMode==="navigate"?" ✓":""}</button>
          <div className="tb-ovf-sep"/>
        </>}
        {tStripCollapsed.view&&<><span className="tb-ovf-lbl">View</span>
          {[['symbol','Symbol'],['colour','Col+Symbol'],['highlight','Highlight']].map(([k,l])=><button key={k} className={"tb-ovf-item"+(stitchView===k?" tb-ovf-item--on":"")} onClick={()=>{setStitchView(k);if(k!=="highlight"){setFocusColour(null);}else if(!focusColour){const first=pal.find(p=>{const dc=colourDoneCounts[p.id];return !dc||dc.done<dc.total;})||pal[0];if(first)setFocusColour(first.id);}setTOverflowOpen(false);}}>{l}{stitchView===k?" ✓":""}</button>)}
          <div className="tb-ovf-sep"/>
        </>}
        {stitchMode==="navigate"&&<><span className="tb-ovf-lbl">Parking</span>
          <div style={{padding:"4px 14px 6px"}}><select value={selectedColorId||""} onChange={e=>setSelectedColorId(e.target.value||null)} style={{fontSize:11,padding:"4px 8px",borderRadius:6,border:"0.5px solid #e2e8f0",width:"100%"}}>
            <option value="">No parking colour</option>{pal.map(p=><option key={p.id} value={p.id}>DMC {p.id} — {p.name.slice(0,20)}</option>)}
          </select></div>
          {parkMarkers.length>0&&<button className="tb-ovf-item" onClick={()=>{setParkMarkers([]);setTOverflowOpen(false);}}>Clear park markers</button>}
          <div className="tb-ovf-sep"/>
        </>}
        {stitchMode==="track"&&trackHistory.length>0&&<button className="tb-ovf-item" onClick={()=>{undoTrack();setTOverflowOpen(false);}}>↩ Undo ({trackHistory.length})</button>}
        {stitchMode==="track"&&redoStack.length>0&&<button className="tb-ovf-item" onClick={()=>{redoTrack();setTOverflowOpen(false);}}>↪ Redo ({redoStack.length})</button>}
        {done&&doneCount>0&&<button className="tb-ovf-item" style={{color:"#dc2626"}} onClick={()=>{if(confirm("Clear all progress?")){var nd=new Uint8Array(pat.length);setDone(nd);recomputeAllCounts(pat,nd,halfStitches,halfDone);setTrackHistory([]);setRedoStack([]);}setTOverflowOpen(false);}}>Reset progress</button>}
        {pat&&pal&&<button className="tb-ovf-item" onClick={()=>{copyProgressSummary();setTOverflowOpen(false);}}>{Icons.clipboard()} Copy Progress Summary</button>}}
        <div className="tb-ovf-sep"/>
      </>}
      {isEditMode&&<>
        {undoSnapshot&&<button className="tb-ovf-item" style={{color:"#d97706"}} onClick={()=>{applyUndo();setTOverflowOpen(false);}}>↩ Undo Edit</button>}
        <button className="tb-ovf-item" style={{color:"#dc2626"}} onClick={()=>{handleRevertToOriginal();setTOverflowOpen(false);}}>Revert to Original</button>
        <button className="tb-ovf-item" onClick={()=>{if(undoSnapshot!==null){setShowExitEditModal(true);}else{setIsEditMode(false);setUndoSnapshot(null);setSessionStartSnapshot(null);}setTOverflowOpen(false);}}>← Exit correction mode</button>
        <div className="tb-ovf-sep"/>
      </>}
      {!isEditMode&&<><button className="tb-ovf-item" style={{color:"#475569"}} onClick={()=>{
        setSessionStartSnapshot({pat:[...pat],pal:JSON.parse(JSON.stringify(pal)),threadOwned:JSON.parse(JSON.stringify(threadOwned)),singleStitchEdits:new Map(singleStitchEdits)});
        setStitchMode("navigate");setFocusColour(null);setHoverInfo(null);setIsEditMode(true);setDrawer(true);setTOverflowOpen(false);
      }} title="Correct individual stitch colours — for imported patterns">Correct pattern colours…</button><div className="tb-ovf-sep"/></>
      }
      <button className="tb-ovf-item" onClick={()=>{setShowNavHelp(h=>!h);setTOverflowOpen(false);}}>{showNavHelp?"Hide":"Show"} controls help</button>
      <div className="tb-ovf-sep"/>
      <span className="tb-ovf-lbl">Tools</span>
      <button className={"tb-ovf-item"+(trackerPreviewOpen?" tb-ovf-item--on":"")} onClick={()=>{setTrackerPreviewOpen(v=>!v);setTOverflowOpen(false);}}>{Icons.eye()} Realistic preview{trackerPreviewOpen?" ✓":""}</button>
      <button className={"tb-ovf-item"+(threadUsageMode?" tb-ovf-item--on":"")} onClick={()=>{setThreadUsageMode(m=>m?null:"cluster");setTOverflowOpen(false);}}>Thread usage{threadUsageMode?" ✓":""}</button>
      <button className={"tb-ovf-item"} onClick={()=>{setRpanelTab("more");setMobileDrawerOpen(true);setTOverflowOpen(false);}}>Layers{!Object.values(layerVis).every(Boolean)?" (filtered)":""}</button>
      <button className={"tb-ovf-item"+(statsView?" tb-ovf-item--on":"")} onClick={()=>{setStatsTab(projectIdRef.current||'all');setStatsView(v=>!v);setTOverflowOpen(false);}}>📊 Stats{statsView?" ✓":""}</button>
      {(liveAutoStitches>0||totalTime>0)&&<>
        <div className="tb-ovf-sep"/>
        <span className="tb-ovf-lbl">Time Tracked</span>
        <div style={{padding:"4px 14px 2px",fontSize:11,color:"#475569"}}>
          {liveAutoStitches>0?<><span style={{color:"#16a34a"}}>● </span>{fmtTime(liveAutoElapsed)} · {liveAutoStitches} stitches active</>:<>Total: {fmtTime(totalTime)}</>}
          {estCompletion&&<div style={{fontSize:10,color:"#94a3b8",marginTop:2}}>~{fmtTime(estCompletion)} remaining</div>}
        </div>
      </>}
    </div>}
  </div>
</div>
  {liveAutoStitches > 0 && (
    <button className={"session-chip" + (liveAutoIsPaused||manuallyPaused ? " session-chip--paused" : "") + (inactivityPausedRef.current&&!manuallyPaused ? " session-chip--idle" : "")}
      title={manuallyPaused ? "Tap to resume tracking" : inactivityPausedRef.current ? "Auto-paused (idle) — tap to resume" : "Tap to pause tracking"}
      onClick={() => {
        if(!currentAutoSessionRef.current) return;
        if(manuallyPaused){
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
      }}>
      <span className="dot"/>
      {manuallyPaused ? `⏸ Paused · ${liveAutoStitches} st` : inactivityPausedRef.current ? `⏸ Idle · ${liveAutoStitches} st` : liveAutoIsPaused ? '⏸ Paused' : `▶ ${fmtTime(liveAutoElapsed)} · ${liveAutoStitches} st`}
    </button>
  )}
</div></div>
{!isEditMode&&<div className="info-strip" aria-live="polite">
  <div className="info-strip-bar">
    {progressPct>=100&&<div className="info-strip-fill info-strip-fill--done" style={{width:"100%"}}/>}
    {progressPct<100&&prevBarPct>0&&<div className="info-strip-fill" style={{width:prevBarPct+"%"}}/>}
    {progressPct<100&&todayBarPct>0&&<div className="info-strip-fill info-strip-today" style={{width:todayBarPct+"%"}}/>}
  </div>
  <div className="info-strip-row">
    <span className="info-strip-pct">{progressPct>=100?<>Complete! {Icons.star()}</>:<>{progressPct.toFixed(1)}%</>}</span>
    {todayStitchesForBar>0&&<span className="info-strip-today-count">Today: {todayStitchesForBar}</span>}
    {liveAutoStitches>0&&<span className="info-strip-timer">{liveAutoIsPaused?"⏸":"⏱"} {fmtTime(liveAutoElapsed)}</span>}
  </div>
</div>}
{!sessionOnboardingShown&&liveAutoStitches>0&&statsSessions.length===0&&(
  <div className="session-onboarding-toast">
    <span>ℹ Sessions are tracked automatically as you stitch. View stats via the 📊 button in the Session panel.</span>
    <button onClick={()=>{setSessionOnboardingShown(true);try{localStorage.setItem("cs_sessionOnboardingDone","1");}catch(_){}}}>Got it</button>
  </div>
)}
{sessionSavedToast&&(
  <div className="session-toast">
    {!sessionSavedToast.showNoteInput?(
      <>
        <span>✓ Session saved — {sessionSavedToast.stitches} {sessionSavedToast.stitches===1?"stitch":"stitches"} in {formatStatsDuration(sessionSavedToast.durationMin*60)}</span>
        <button onClick={()=>setSessionSavedToast(prev=>({...prev,showNoteInput:true}))}>Add note</button>
        <button onClick={()=>setSessionSavedToast(null)} aria-label="Dismiss">✕</button>
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
<div className="cs-page-content" style={{maxWidth:1100,margin:"0 auto",padding:"20px 16px"}}>
  {loadError&&<div style={{background:"#fef2f2",border:"1px solid #fecaca",borderRadius:8,padding:"8px 14px",fontSize:12,color:"#dc2626",marginBottom:12}}>{loadError}</div>}
  {copied==="progress"&&<div style={{background:"#f0fdf4",border:"1px solid #bbf7d0",borderRadius:8,padding:"8px 14px",fontSize:12,color:"#16a34a",fontWeight:600,marginBottom:12}}>✓ Progress summary copied to clipboard!</div>}
  {importSuccess && (
    <div style={{
      background: "#f0fdf4", border: "1px solid #bbf7d0", borderRadius: 8,
      padding: "8px 14px", fontSize: 12, color: "#16a34a", fontWeight: 600, marginBottom: 12,
      display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12
    }}>
      <span>{'\u2713'} {importSuccess}</span>
      <button onClick={()=>setImportSuccess(null)} style={{
        padding: "3px 10px", borderRadius: 6, border: "1px solid #bbf7d0", background: "#fff",
        cursor: "pointer", fontSize: 11, fontWeight: 600, color: "#16a34a", flexShrink: 0
      }}>Dismiss</button>
    </div>
  )}

  {statsView&&pat&&<StatsContainer statsTab={statsTab} setStatsTab={setStatsTab} statsSessions={statsSessions} statsSettings={statsSettings} totalCompleted={doneCount} totalStitches={totalStitchable} onEditNote={editSessionNote} onUpdateSettings={setStatsSettings} onClose={()=>setStatsView(false)} projectName={projectName||(sW+'\u00D7'+sH+' pattern')} palette={pal} colourDoneCounts={colourDoneCounts} achievedMilestones={achievedMilestones} done={done} pat={pat} sW={sW} sH={sH} doneSnapshots={doneSnapshots} setDoneSnapshots={setDoneSnapshots} sections={sections} currentProjectId={projectIdRef.current} onOpenProject={(meta)=>{ProjectStorage.get(meta.id).then(project=>{if(project&&project.pattern&&project.settings){processLoadedProject(project);ProjectStorage.setActiveProject(project.id).catch(()=>{});setStatsView(false);}}).catch(()=>{});}}/>}

  {trackerPreviewOpen&&pat&&<TrackerPreviewModal pat={pat} cmap={cmap} sW={sW} sH={sH} fabricCt={fabricCt} level={trackerPreviewLevel} onLevelChange={setTrackerPreviewLevel} onClose={()=>setTrackerPreviewOpen(false)}/>}

  {!statsView&&!pat&&<div style={{maxWidth:500, margin:"40px auto", textAlign:"center"}}>
    <div className="card" style={{padding:"30px"}}>
      <h2 style={{fontSize:24, fontWeight:700, color:"#1e293b", marginBottom:8}}>{Icons.thread()} Stitch Tracker</h2>
      <p style={{fontSize:15, color:"#475569", marginBottom:24}}>Track your cross stitch progress</p>

      <div style={{display:"grid",gap:16}}>
        <button onClick={()=>loadRef.current.click()} style={{padding:"14px",fontSize:16,borderRadius:12,border:"0.5px solid #e2e8f0",background:"#f8f9fa",cursor:"pointer",fontWeight:600,color:"#1e293b",display:"flex",alignItems:"center",justifyContent:"center",gap:8}}>
          {Icons.folder()} Load Project
        </button>
      </div>

      <div style={{marginTop:24, textAlign:"left", background:"#f8f9fa", padding:"16px", borderRadius:12, border:"0.5px solid #e2e8f0"}}>
        <p style={{fontSize:13, fontWeight:600, color:"#475569", marginBottom:12, marginTop:0}}>Supported formats:</p>
        <div style={{display:"flex", flexDirection:"column", gap:10}}>
          <div style={{display:"flex", alignItems:"center", gap:10, fontSize:13, color:"#475569"}}>
            <span style={{padding:"3px 8px", background:"#eff6ff", color:"#1e293b", borderRadius:6, border:"1px solid #bfdbfe", fontWeight:600, fontSize:11, width:64, textAlign:"center", flexShrink:0}}>.json</span>
            Cross Stitch Pattern Generator project files
          </div>
          <div style={{display:"flex", alignItems:"center", gap:10, fontSize:13, color:"#475569"}}>
            <span style={{padding:"3px 8px", background:"#f5f3ff", color:"#0d9488", borderRadius:6, border:"1px solid #d8b4fe", fontWeight:600, fontSize:11, width:64, textAlign:"center", flexShrink:0}}>.oxs</span>
            KG-Chart / Pattern Keeper XML format
          </div>
          <div style={{display:"flex", alignItems:"center", gap:10, fontSize:13, color:"#475569"}}>
            <span style={{padding:"3px 8px", background:"#f0fdf4", color:"#16a34a", borderRadius:6, border:"1px solid #bbf7d0", fontWeight:600, fontSize:11, width:64, textAlign:"center", flexShrink:0}}>.png .jpg</span>
            Pixel art images (each pixel = one stitch)
          </div>
          <div style={{display:"flex", alignItems:"center", gap:10, fontSize:13, color:"#475569"}}>
            <span style={{padding:"3px 8px", background:"#fef2f2", color:"#dc2626", borderRadius:6, border:"1px solid #fecaca", fontWeight:600, fontSize:11, width:64, textAlign:"center", flexShrink:0}}>.pdf</span>
            Pattern Keeper compatible PDF charts
          </div>
        </div>
      </div>

      <div style={{marginTop:30, paddingTop:20, borderTop:"0.5px solid #e2e8f0"}}>
        <p style={{fontSize:14, color:"#475569", marginBottom:10}}>Need a pattern?</p>
        <a href="index.html" style={{color:"#0d9488", fontWeight:600, textDecoration:"none"}}>→ Pattern Creator</a>
      </div>
    </div>
  </div>}

  {!statsView&&pat&&pal&&<><div className="cs-main">
    <div className="canvas-area" style={{padding:"12px 16px"}}>
    {showNavHelp&&!isEditMode&&(()=>{const isTouch=hasTouchRef.current;return(
    <div style={{marginBottom:8,padding:"14px 16px",background:"#fff",border:"1px solid #a5b4fc",borderRadius:10,fontSize:12}}>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:10}}>
        <span style={{fontWeight:700,fontSize:13,color:"#1e293b"}}>Navigation &amp; Controls</span>
        <button onClick={()=>setShowNavHelp(false)} style={{fontSize:12,background:"none",border:"none",color:"#94a3b8",cursor:"pointer",padding:"0 4px",lineHeight:1}}>✕</button>
      </div>
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:"6px 24px"}}>
        {[
          ["Pan",isTouch?"Drag one finger across the canvas":"Hold Space + drag  ·  or middle-click drag"],
          ["Zoom in / out",isTouch?"Pinch two fingers apart / together":"Ctrl + scroll  ·  or use − / + buttons"],
          ["Zoom to fit","Tap the Fit button"],
          ["Mark a stitch",isTouch?"Tap a cell":"Click a cell"],
          ["Mark multiple",isTouch?"Tap, then drag across cells":"Click + drag across cells — all set to same state"],
          ["Undo last marks","↩ Undo button (top right)"],
          stitchView==="highlight"?["Cycle colours",isTouch?"Tap ◀ ▶ arrows in the toolbar":"[ or ] keys  ·  or ← → arrow keys"]:null,
          stitchView==="highlight"?["Clear focus","Tap the colour pill to show all colours"]:null,
          stitchMode==="navigate"?["Place crosshair","Click on any cell to drop a guide"]:null,
          stitchMode==="navigate"?["Park marker","Select a colour, then click to place a marker"]:null,
        ].filter(Boolean).map(([label,tip],i)=>(
          <div key={i} style={{display:"contents"}}>
            <div style={{color:"#475569",fontWeight:600,paddingTop:1}}>{label}</div>
            <div style={{color:"#1e293b"}}>{tip}</div>
          </div>
        ))}
      </div>
      {!isTouch&&<div style={{marginTop:10,paddingTop:8,borderTop:"0.5px solid #f1f5f9",color:"#94a3b8",fontSize:11}}>
        Tip: on a trackpad, two-finger scroll pans the canvas without any modifier key.
      </div>}
    </div>
    );})()}

    {scs < 6 && !isEditMode && (stitchView === "symbol" || stitchView === "colour") && <div style={{fontSize: 12, color: "#475569", marginBottom: 6, background: "#f1f5f9", padding: "6px 10px", borderRadius: 8}}>To see symbols, you may need to zoom in.</div>}

    {/* ── Single banner slot (highest priority wins) ── */}
    {(()=>{
      if(isEditMode) return <div style={{fontSize:12,color:"#d97706",background:"#fffbeb",padding:"6px 14px",borderRadius:8,marginBottom:6,border:"1px solid #fde68a", fontWeight: 600}}>EDITING — <span style={{fontWeight:400}}>Tap a <b>stitch on the grid</b> to edit that cell only · Tap a <b>colour in the list below</b> to reassign all stitches of that colour</span></div>;
      if(advanceToast) return <div style={{fontSize:12,color:"#16a34a",background:"#f0fdf4",padding:"6px 14px",borderRadius:8,marginBottom:6,border:"1px solid #bbf7d0",fontWeight:600}}>✓ Complete! Next: {advanceToast}</div>;
      if(stitchMode==="track") return <div style={{fontSize:12,color:"#0d9488",background:"#f0fdfa",padding:"6px 14px",borderRadius:8,marginBottom:6,border:"0.5px solid #99f6e4"}}>{rangeModeActive?(rangeAnchor?(hasTouchRef.current?"Anchor set — tap second corner to fill rectangle":"Anchor set — click second corner to fill the rectangle · Esc to cancel"):(hasTouchRef.current?"Range mode — tap first corner of the rectangle":"Range mode — click first corner, then click second corner to mark a rectangle · Esc to cancel")):(hasTouchRef.current?"Tap to mark cross stitches · Drag to pan · Pinch to zoom":"Click or drag to mark/unmark cross stitches · Space+drag to pan · Ctrl+scroll to zoom · Shift+click for rectangle fill · Ctrl+Z undo")}{!rangeModeActive&&trackHistory.length>0?` · ${trackHistory.length} undo step${trackHistory.length>1?"s":""} available`:""}</div>;
      if(stitchMode==="navigate") return <div style={{fontSize:12,color:"#1e293b",background:"#f1f5f9",padding:"6px 14px",borderRadius:8,marginBottom:6,border:"0.5px solid #e2e8f0"}}>{selectedColorId?"Click to park. Shift+click to move guide.":"Click to place guide crosshair"}{hasTouchRef.current?"":" · T for track mode"}</div>;
      if(!shortcutsHintDismissed&&pat) return <div style={{fontSize:12,color:"#6b7280",background:"#f9fafb",padding:"5px 14px",borderRadius:8,marginBottom:6,border:"0.5px solid #e2e8f0",display:"flex",justifyContent:"space-between",alignItems:"center",gap:8}}><span>{Icons.lightbulb()} Press <kbd>?</kbd> for keyboard shortcuts</span><button onClick={()=>{localStorage.setItem("shortcuts_hint_dismissed","1");setShortcutsHintDismissed(true);}} style={{background:"none",border:"none",cursor:"pointer",color:"#9ca3af",fontSize:15,lineHeight:1,padding:0}}>×</button></div>;
      return null;
    })()}

    <div ref={stitchScrollRef} onScroll={()=>{if(!scrollRafRef.current){scrollRafRef.current=requestAnimationFrame(()=>{renderStitch();scrollRafRef.current=null;})}}} style={{overflow:"auto",maxHeight:drawer?340:600,border:"0.5px solid #e2e8f0",borderRadius:"8px 8px 0 0",background:"#f1f5f9",cursor:isPanning?"grabbing":isSpaceDownRef.current?"grab":(!isEditMode&&stitchMode==="track"?"crosshair":"default"),transition:"max-height 0.3s",position:"relative"}} onMouseUp={handleMouseUp} onMouseLeave={handleStitchMouseLeave}>
      <div style={{ position: 'sticky', top: 0, zIndex: 3, display: 'flex', width: 'max-content', background: '#fff', borderBottom: '1px solid #e2e8f0' }}>
        <div style={{ width: G, height: G, flexShrink: 0, position: 'sticky', left: 0, background: '#fff', borderRight: '1px solid #e2e8f0', zIndex: 4 }}></div>
        {Array.from({length: sW}, (_, x) => {
          let step = scs < 6 ? 10 : scs < 14 ? 5 : 1;
          let show = ((x + 1) % step === 0 || x === 0);
          let is10 = (x + 1) % 10 === 0;
          let is5 = (x + 1) % 5 === 0;
          return (
            <div key={x} style={{ width: scs, flexShrink: 0, height: G, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: Math.max(9, Math.min(11, scs * 0.6)), fontWeight: is10 ? 'bold' : is5 ? 600 : 400, color: is10 ? '#333' : is5 ? '#666' : '#888', fontFamily: 'monospace' }}>
              {show ? (x + 1) : ''}
            </div>
          );
        })}
      </div>
      <div style={{ display: 'flex', width: 'max-content' }}>
        <div style={{ position: 'sticky', left: 0, zIndex: 3, width: G, background: '#fff', borderRight: '1px solid #e2e8f0', display: 'flex', flexDirection: 'column' }}>
          {Array.from({length: sH}, (_, y) => {
            let step = scs < 6 ? 10 : scs < 14 ? 5 : 1;
            let show = ((y + 1) % step === 0 || y === 0);
            let is10 = (y + 1) % 10 === 0;
            let is5 = (y + 1) % 5 === 0;
            return (
              <div key={y} style={{ height: scs, flexShrink: 0, width: G, display: 'flex', alignItems: 'center', justifyContent: 'flex-end', paddingRight: 4, fontSize: Math.max(9, Math.min(11, scs * 0.6)), fontWeight: is10 ? 'bold' : is5 ? 600 : 400, color: is10 ? '#333' : is5 ? '#666' : '#888', fontFamily: 'monospace' }}>
                {show ? (y + 1) : ''}
              </div>
            );
          })}
        </div>
        <div style={{ position: 'relative' }}>
          <canvas ref={stitchRef} role="application" tabIndex="0" aria-label="Cross stitch pattern grid" style={{display:"block",position:"relative",zIndex:2, marginTop: -G, marginLeft: -G, touchAction:"none"}} onMouseDown={handleStitchMouseDown} onMouseMove={handleStitchMouseMove} onContextMenu={e=>e.preventDefault()}/>

          {/* Thread usage overlay */}
          {threadUsageMode&&<canvas ref={threadUsageCanvasRef} style={{display:"block",position:"absolute",top:-G,left:-G,zIndex:3,pointerEvents:"none"}}/>}
          {/* Recommendation border overlay */}
          {recEnabled&&<canvas ref={recOverlayCanvasRef} style={{display:"block",position:"absolute",top:-G,left:-G,zIndex:4,pointerEvents:"none"}}/>}

          {rangeModeActive&&rangeAnchor&&<div style={{
            position:'absolute',
            left:rangeAnchor.col*scs,
            top:rangeAnchor.row*scs,
            width:scs,height:scs,
            border:'2px solid #3b82f6',
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

    <div style={{background:"#1e293b", color:"#fff", padding:"6px 10px", borderRadius:"0 0 8px 8px", fontSize:12, fontWeight:500, display:"flex", alignItems:"center", minHeight:30, marginBottom: 12}}>
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

    {doneCount===0&&totalStitchable>0&&stitchMode==="track"&&<div style={{fontSize:11,color:"#92400e",background:"#fffbeb",border:"1px solid #fde68a",borderRadius:6,padding:"6px 10px",marginBottom:8,textAlign:"center"}}>Tap any stitch on the canvas to mark it as done</div>}

    {/* Floating undo — mobile only (shown via CSS) */}
    {!isEditMode&&stitchMode==="track"&&trackHistory.length>0&&<button className="fab-undo" onClick={undoTrack} onContextMenu={e=>{e.preventDefault();if(redoStack.length)redoTrack();}} aria-label="Undo last stitch" title="Tap to undo · Long-press for redo">↩</button>}

    </div>{/* end canvas-area */}

    {/* ═══ RIGHT PANEL ═══ */}
    <div className={"rpanel"+(mobileDrawerOpen?" rpanel--drawer-open":"")}>
      <div className="rp-tabs">
        {[["colours","Colours"],["session","Session"],["more","More"]].map(([k,l])=>
          <button key={k} className={"rp-tab"+(rpanelTab===k?" rp-tab--on":"")} onClick={()=>{if(rpanelTab===k&&mobileDrawerOpen){setMobileDrawerOpen(false);}else{setRpanelTab(k);setMobileDrawerOpen(true);}}}>{l}</button>
        )}
      </div>
      <div className="rp-tab-content">
      {/* ── Suggestions ── */}
      {rpanelTab==="more"&&recEnabled&&recommendations&&recommendations.top.length>0&&<div className="rp-section">
        <div className="rp-heading" style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
          <span>Suggested <span className="badge">{recommendations.top.length}</span></span>
          <button onClick={()=>{setRecEnabled(false);try{localStorage.setItem("cs_recEnabled","0");}catch(_){}}} style={{background:"none",border:"none",color:"#94a3b8",cursor:"pointer",fontSize:12,padding:0}} title="Turn off suggestions">✕</button>
        </div>
        {recommendations.top.slice(0,recShowMore?3:1).map((rec,rank)=>{
          const RS=analysisResult.regionSize||10;const RC=analysisResult.regionCols||1;
          const rCol=rec.idx%RC,rRow=Math.floor(rec.idx/RC);
          const remSt=rec.reg.totalStitches-rec.reg.completedStitches;
          const pctDone=Math.round(rec.reg.completionPercentage*100);
          const label=`Row ${rRow*RS+1}–${(rRow+1)*RS}, Col ${rCol*RS+1}–${(rCol+1)*RS}`;
          return <div key={rec.idx} style={{padding:"7px 10px",marginBottom:4,borderRadius:8,border:"1px solid "+(rank===0?"#99f6e4":"#e2e8f0"),background:rank===0?"#f0fdfa":"#fafafa",cursor:"pointer"}} onClick={()=>{
            if(!stitchScrollRef.current)return;
            const RS2=analysisResult.regionSize||10;const RC2=analysisResult.regionCols||1;
            const rC2=rec.idx%RC2,rR2=Math.floor(rec.idx/RC2);
            const cx=(rC2+0.5)*RS2*scs+G,cy=(rR2+0.5)*RS2*scs+G;
            const el=stitchScrollRef.current;
            el.scrollLeft=cx-el.clientWidth/2;el.scrollTop=cy-el.clientHeight/2;
          }}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:2}}>
              <span style={{fontWeight:700,fontSize:12,color:rank===0?"#0d9488":"#475569"}}>{rank===0?"⭐":rank===1?"●":"○"} {label}</span>
              <button onClick={e=>{e.stopPropagation();setRecDismissed(prev=>{const n=new Set(prev);n.add(rec.idx);return n;});}} style={{background:"none",border:"none",color:"#94a3b8",cursor:"pointer",fontSize:11,padding:"0 2px"}} title="Dismiss">✕</button>
            </div>
            <div style={{fontSize:11,color:"#475569"}}>{pctDone}% complete · {remSt} stitches left</div>
            {rank===0&&rec.reg.dominantColour&&<div style={{fontSize:10,color:"#94a3b8",marginTop:2}}>Dominant: DMC {rec.reg.dominantColour}</div>}
          </div>;
        })}
        {recommendations.top.length>1&&<button onClick={()=>setRecShowMore(v=>!v)} style={{fontSize:10,color:"#0d9488",background:"none",border:"none",cursor:"pointer",padding:"2px 0",fontWeight:600}}>{recShowMore?"▲ Fewer":"→ More suggestions"}</button>}
        {recommendations.quickWins.length>0&&<div style={{marginTop:8,paddingTop:8,borderTop:"0.5px solid #e2e8f0"}}>
          <div style={{fontWeight:600,fontSize:11,color:"#475569",marginBottom:4}}>🎨 Quick wins</div>
          {recommendations.quickWins.map(c=>{
            const hasStash=globalStash&&globalStash[c.id];
            return <div key={c.id} style={{display:"flex",alignItems:"center",gap:6,marginBottom:3,cursor:"pointer",padding:"3px 4px",borderRadius:5,background:"#fff",border:"0.5px solid #e2e8f0"}} onClick={()=>{setStitchView("highlight");setFocusColour(c.id);}}>
              {analysisResult.perColour[c.id]&&pat&&(()=>{const rgb=pat.find(p=>p&&p.id===c.id);return rgb?<span style={{width:10,height:10,borderRadius:2,background:`rgb(${rgb.rgb[0]},${rgb.rgb[1]},${rgb.rgb[2]})`,flexShrink:0,border:"1px solid #cbd5e1"}}/>:null;})()}
              <span style={{fontWeight:700,fontSize:11,minWidth:32}}>DMC {c.id}</span>
              <span style={{fontSize:10,color:"#475569",flex:1,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{c.name||""}</span>
              <span style={{fontSize:10,color:"#16a34a",fontWeight:700}}>{c.remaining}↑</span>
            </div>;
          })}
        </div>}
      </div>}
      {/* Restore suggestions if hidden */}
      {rpanelTab==="more"&&!recEnabled&&<div className="rp-section">
        <button onClick={()=>{setRecEnabled(true);try{localStorage.setItem("cs_recEnabled","1");}catch(_){}}} style={{fontSize:11,padding:"4px 10px",borderRadius:6,border:"1px solid #e2e8f0",background:"#fff",color:"#94a3b8",cursor:"pointer",width:"100%"}}>Enable suggestions</button>
      </div>}
      {/* Thread usage section (when enabled) */}
      {rpanelTab==="more"&&threadUsageMode&&threadUsageSummary&&<div className="rp-section">
        <div className="rp-heading" style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
          <span>Thread usage</span>
          <div style={{display:"flex",gap:4}}>
            {[["cluster","Cluster"],["distance","Isolation"]].map(([m,l])=>(
              <button key={m} onClick={()=>setThreadUsageMode(m)} style={{fontSize:10,padding:"2px 7px",borderRadius:5,border:"1px solid "+(threadUsageMode===m?"#99f6e4":"#e2e8f0"),background:threadUsageMode===m?"#f0fdfa":"#fff",color:threadUsageMode===m?"#0d9488":"#64748b",cursor:"pointer",fontWeight:600}}>{l}</button>
            ))}
            <button onClick={()=>setThreadUsageMode(null)} style={{background:"none",border:"none",color:"#94a3b8",cursor:"pointer",fontSize:12,padding:"0 2px"}}>✕</button>
          </div>
        </div>
        <div style={{fontSize:11,marginBottom:6}}>
          {threadUsageMode==="cluster"?(
            <div className="thread-usage-legend">
              <div><span className="tul-swatch" style={{background:"rgba(220,40,40,0.4)"}}/><span>Single isolated (confetti)</span></div>
              <div><span className="tul-swatch" style={{background:"rgba(255,200,0,0.35)"}}/><span>Small cluster (2–4)</span></div>
              <div><span className="tul-swatch" style={{background:"rgba(100,150,255,0.25)"}}/><span>Medium cluster (5–19)</span></div>
              <div><span className="tul-swatch" style={{background:"transparent",border:"1px solid #e2e8f0"}}/><span>Large cluster (20+)</span></div>
            </div>
          ):(
            <div className="thread-usage-legend">
              <div><span className="tul-swatch" style={{background:"rgba(220,40,40,0.4)"}}/><span>Highly isolated (15+ stitches away)</span></div>
              <div><span className="tul-swatch" style={{background:"rgba(255,120,0,0.35)"}}/><span>Moderately isolated (5–15)</span></div>
              <div><span className="tul-swatch" style={{background:"rgba(255,200,0,0.25)"}}/><span>Mildly isolated (1.4–5)</span></div>
              <div><span className="tul-swatch" style={{background:"transparent",border:"1px solid #e2e8f0"}}/><span>Clustered (no overlay)</span></div>
            </div>
          )}
        </div>
        <div style={{padding:"8px 10px",borderRadius:8,background:"#f8fafc",border:"1px solid #e2e8f0",fontSize:11}}>
          <div style={{display:"flex",justifyContent:"space-between",marginBottom:3}}><span style={{color:"#475569"}}>Confetti (isolated):</span><span style={{fontWeight:700,color:"#dc2626"}}>{threadUsageSummary.isolated.toLocaleString()} ({threadUsageSummary.total>0?((threadUsageSummary.isolated/threadUsageSummary.total)*100).toFixed(1):0}%)</span></div>
          <div style={{display:"flex",justifyContent:"space-between",marginBottom:3}}><span style={{color:"#475569"}}>Small clusters (2–4):</span><span style={{fontWeight:600,color:"#b45309"}}>{threadUsageSummary.small.toLocaleString()}</span></div>
          <div style={{display:"flex",justifyContent:"space-between",marginBottom:3}}><span style={{color:"#475569"}}>Medium (5–19):</span><span style={{fontWeight:600,color:"#475569"}}>{threadUsageSummary.medium.toLocaleString()}</span></div>
          <div style={{display:"flex",justifyContent:"space-between",marginBottom:6}}><span style={{color:"#475569"}}>Large (20+):</span><span style={{fontWeight:600,color:"#16a34a"}}>{threadUsageSummary.large.toLocaleString()}</span></div>
          {threadUsageSummary.estChanges>0&&<div style={{display:"flex",justifyContent:"space-between",paddingTop:5,borderTop:"0.5px solid #e2e8f0",marginTop:2}}><span style={{color:"#475569"}}>Est. thread changes:</span><span style={{fontWeight:700}}>~{threadUsageSummary.estChanges.toLocaleString()}</span></div>}
          {threadUsageSummary.mostScattered&&threadUsageSummary.mostScattered.confettiCount>0&&<div style={{fontSize:10,color:"#94a3b8",marginTop:4}}>Most scattered: DMC {threadUsageSummary.mostScattered.id} — {threadUsageSummary.mostScattered.confettiCount} isolated</div>}
          {threadUsageSummary.mostClustered&&<div style={{fontSize:10,color:"#94a3b8",marginTop:2}}>Most clustered: DMC {threadUsageSummary.mostClustered.id} — cluster size {threadUsageSummary.mostClustered.largestClusterSize}</div>}
        </div>
      </div>}
      {rpanelTab==="session"&&<div className="rp-section">
        <div className="rp-heading">Session {liveAutoStitches>0&&<span className="badge">Live</span>}</div>
        <div className="sess-card">
          <div className="row"><span className="lbl">Time</span><span className="val">{fmtTime(liveAutoElapsed)}</span></div>
          <div className="row"><span className="lbl">Stitches</span><span className="val">{liveAutoStitches}</span></div>
          {liveAutoStitches>0&&liveAutoElapsed>0&&<div className="row"><span className="lbl">Speed</span><span className="val">{(liveAutoStitches/(liveAutoElapsed/60)).toFixed(1)} st/min</span></div>}
          <div className="row"><span className="lbl">Total time</span><span className="val">{fmtTime(totalTime+liveAutoElapsed)}</span></div>
        </div>
        <button style={{marginTop:8,width:'100%',padding:"6px 0",borderRadius:6,border:"1px solid #e2e8f0",background:"#f8fafc",color:"#475569",cursor:"pointer",fontSize:12,fontWeight:600}} onClick={()=>{if(!statsView){setStatsTab(projectIdRef.current||'all');}setStatsView(v=>!v);}}>📊 {statsView?"Hide":"View"} full stats</button>
      </div>}

      {/* View Mode */}
      {rpanelTab==="more"&&<div className="rp-section">
        <div className="rp-heading">View</div>
        <div className="rp-pill-toggle" style={{marginBottom:8}}>
          {[['symbol','Symbol'],['colour','Colour'],['highlight','Highlight']].map(([k,l])=>
            <button key={k} className={stitchView===k?"on":""} onClick={()=>{setStitchView(k);if(k!=="highlight"){setFocusColour(null);}else if(!focusColour){const first=pal.find(p=>{const dc=colourDoneCounts[p.id];return !dc||dc.done<dc.total;})||pal[0];if(first)setFocusColour(first.id);}}}>{l}</button>
          )}
        </div>
        <div style={{display:"flex",alignItems:"center",justifyContent:"flex-end",marginBottom:4}}>
          <label title="Disable zoom-adaptive rendering — always use Tier 3 (Detail) regardless of zoom level" style={{display:"flex",alignItems:"center",gap:4,fontSize:10,color:lockDetailLevel?"#0d9488":"#94a3b8",cursor:"pointer",userSelect:"none"}}>
            <input type="checkbox" checked={lockDetailLevel} onChange={e=>setLockDetailLevel(e.target.checked)} style={{cursor:"pointer",accentColor:"#0d9488"}}/>Lock detail
          </label>
        </div>
        {stitchView==="highlight"&&<div style={{fontSize:11,color:"#475569"}}>Focus one colour at a time. ◀ ▶ or <kbd style={{fontSize:10,padding:"0 3px",border:"1px solid #cbd5e1",borderRadius:3,background:"#f1f5f9"}}>[ ]</kbd> to cycle.</div>}
        {stitchView==="highlight"&&<div style={{display:"flex",alignItems:"center",gap:4,marginTop:6}}>
          <button onClick={()=>{if(!focusableColors.length)return;const idx=focusableColors.findIndex(p=>p.id===focusColour);const prev=focusableColors[(idx<=0?focusableColors.length:idx)-1];setFocusColour(prev.id);}} style={{fontSize:13,padding:"2px 5px",borderRadius:6,border:"0.5px solid #e2e8f0",background:"#f8f9fa",cursor:"pointer",lineHeight:1}}>◀</button>
          {focusColour&&cmap&&cmap[focusColour]&&(()=>{const p=cmap[focusColour];return(
            <span style={{fontSize:11,display:"flex",alignItems:"center",gap:3,flex:1}} onClick={()=>setFocusColour(null)} title="Click to clear">
              <span style={{width:10,height:10,borderRadius:2,background:`rgb(${p.rgb})`,border:"1px solid #cbd5e1",flexShrink:0}}/>
              <span style={{fontWeight:700}}>{focusColour}</span>
            </span>);})()}
          <button onClick={()=>{if(!focusableColors.length)return;const idx=focusableColors.findIndex(p=>p.id===focusColour);const next=focusableColors[(idx+1)%focusableColors.length];setFocusColour(next.id);}} style={{fontSize:13,padding:"2px 5px",borderRadius:6,border:"0.5px solid #e2e8f0",background:"#f8f9fa",cursor:"pointer",lineHeight:1}}>▶</button>
          <label style={{display:"flex",alignItems:"center",gap:3,fontSize:10,color:"#475569",cursor:"pointer",whiteSpace:"nowrap",userSelect:"none",marginLeft:4}}>
            <input type="checkbox" checked={highlightSkipDone} onChange={e=>setHighlightSkipDone(e.target.checked)} style={{cursor:"pointer"}}/>Skip done
          </label>
          <label style={{display:"flex",alignItems:"center",gap:3,fontSize:10,color:"#475569",cursor:"pointer",whiteSpace:"nowrap",userSelect:"none",marginLeft:4}}>
            <input type="checkbox" checked={onlyStarted} onChange={e=>setOnlyStarted(e.target.checked)} style={{cursor:"pointer"}}/>Started
          </label>
        </div>}
        {stitchView==="highlight"&&focusColour&&<div style={{marginTop:6}}>
          <div style={{display:"flex",gap:0,borderRadius:6,overflow:"hidden",border:"1px solid #e2e8f0",marginBottom:4}}>
            {[["isolate","Isolate"],["outline","Outline"],["tint","Tint"],["spotlight","Spot"]].map(([m,l])=>(
              <button key={m} onClick={()=>setHighlightMode(m)} style={{flex:1,padding:"3px 0",fontSize:10,fontWeight:highlightMode===m?700:500,border:"none",borderRight:"1px solid #e2e8f0",background:highlightMode===m?"#0d9488":"#f8fafc",color:highlightMode===m?"#fff":"#475569",cursor:"pointer"}}>{l}</button>
            ))}
          </div>
          {highlightMode==="isolate"&&<div style={{display:"flex",alignItems:"center",gap:4,fontSize:10,marginBottom:2}}>
            <span style={{color:"#475569",flexShrink:0}}>Visibility</span>
            <input type="range" min={0} max={60} value={Math.round(trackerDimLevel*100)} onChange={e=>{const v=parseInt(e.target.value)/100;setTrackerDimLevel(v);try{localStorage.setItem("cs_trDimLv",v);}catch(_){}}} style={{flex:1,accentColor:"#0d9488"}}/>
            <span style={{width:22,textAlign:"right",fontVariantNumeric:"tabular-nums"}}>{Math.round(trackerDimLevel*100)}%</span>
          </div>}
          {highlightMode==="tint"&&<div style={{display:"flex",alignItems:"center",gap:4,fontSize:10}}>
            <input type="color" value={tintColor} onChange={e=>{setTintColor(e.target.value);try{localStorage.setItem("cs_tintColor",e.target.value);}catch(_){}}} style={{width:22,height:18,padding:0,border:"1px solid #e2e8f0",borderRadius:3,cursor:"pointer"}}/>
            <input type="range" min={10} max={80} value={Math.round(tintOpacity*100)} onChange={e=>{const v=parseInt(e.target.value)/100;setTintOpacity(v);try{localStorage.setItem("cs_tintOp",v);}catch(_){}}} style={{flex:1,accentColor:"#0d9488"}}/>
            <span style={{width:28,textAlign:"right",fontVariantNumeric:"tabular-nums"}}>{Math.round(tintOpacity*100)}%</span>
          </div>}
          {highlightMode==="spotlight"&&<div style={{display:"flex",alignItems:"center",gap:4,fontSize:10}}>
            <span style={{color:"#475569",flexShrink:0}}>Dim</span>
            <input type="range" min={5} max={50} value={Math.round(spotDimOpacity*100)} onChange={e=>{const v=parseInt(e.target.value)/100;setSpotDimOpacity(v);try{localStorage.setItem("cs_spotDimOp",v);}catch(_){}}} style={{flex:1,accentColor:"#0d9488"}}/>
            <span style={{width:28,textAlign:"right",fontVariantNumeric:"tabular-nums"}}>{Math.round(spotDimOpacity*100)}%</span>
          </div>}
        </div>}
      </div>}

      {/* Colours List */}
      {rpanelTab==="colours"&&<div className="rp-section" style={{flex:1,overflow:"hidden",display:"flex",flexDirection:"column"}}>
        <div className="rp-heading">Colours <span className="badge">{pal.length}</span></div>
        <div className="col-list">
          {pal.map(p=>{let dc=colourDoneCounts[p.id]||{total:0,done:0,halfTotal:0,halfDone:0};
            let totalWithHalf=dc.total+dc.halfTotal*0.5;
            let doneWithHalf=dc.done+dc.halfDone*0.5;
            let pct=totalWithHalf>0?Math.round(doneWithHalf/totalWithHalf*100):0;
            let complete=doneWithHalf>=totalWithHalf&&totalWithHalf>0;
            let isFocused=focusColour===p.id;
            return <div key={p.id} className={"col-row"+(isFocused?" focus":"")} style={{opacity:complete&&!isFocused?0.5:1}} onClick={()=>{
              if(isEditMode){setEditModalColor(p);}
              else if(stitchView==="highlight"){setFocusColour(focusColour===p.id?null:p.id);}
              else{setStitchView("highlight");setFocusColour(p.id);}
            }}>
              <div className="sw" style={{background:`rgb(${p.rgb})`}}/>
              <span className="sym">{p.symbol}</span>
              <span className="cid" style={{color:isFocused?"#0d9488":complete?"#16a34a":"inherit"}}>{p.id}</span>
              <span className="nm">{p.type==="blend"?p.threads[0].name+"+"+p.threads[1].name:p.name}</span>
              {!isEditMode&&<><div className="prog"><div className="pf" style={{width:pct+"%"}}/></div>
              <span className="ct">{dc.done}/{dc.total}</span>
              <button onClick={e2=>{e2.stopPropagation();if(!complete){let unmarked=dc.total-dc.done;if(unmarked>50&&!confirm("Mark all "+unmarked+" stitches of DMC "+p.id+" as done?"))return;}markColourDone(p.id,!complete);}} style={{fontSize:9,padding:"1px 6px",borderRadius:4,border:"1px solid "+(complete?"#fecaca":"#bbf7d0"),background:complete?"#fef2f2":"#f0fdf4",color:complete?"#dc2626":"#16a34a",cursor:"pointer",whiteSpace:"nowrap",flexShrink:0}}>{complete?"Undo":"✓"}</button></>}
              {isEditMode&&<span style={{fontSize:10,color:"#d97706",fontWeight:600}}>✎</span>}
            </div>;
          })}
        </div>
      </div>}

      {/* Quick Actions */}
      {rpanelTab==="more"&&<div className="rp-section">
        <div className="rp-heading">Actions</div>
        <div style={{display:"flex",flexWrap:"wrap",gap:4}}>
          <button className="g-btn" style={{flex:1,justifyContent:"center",fontSize:10,padding:"5px 8px",display:"inline-flex",alignItems:"center",gap:5,border:"1px solid #e2e8f0",background:"#fff",borderRadius:8,cursor:"pointer",color:"#475569",fontWeight:600,fontFamily:"inherit"}} onClick={()=>{copyProgressSummary();}}>{Icons.clipboard()} Summary</button>
          <button className="g-btn" style={{flex:1,justifyContent:"center",fontSize:10,padding:"5px 8px",display:"inline-flex",alignItems:"center",gap:5,border:"1px solid #e2e8f0",background:"#fff",borderRadius:8,cursor:"pointer",color:"#475569",fontWeight:600,fontFamily:"inherit"}} onClick={handleEditInCreator}>{Icons.pencil()} Edit</button>
        </div>

        {/* Project Info (moved from below-canvas) */}
        <div style={{marginTop:12}}>
          <div className="rp-heading">Project Info</div>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:"6px 16px",fontSize:11}}>
            {[["Pattern size",sW+" × "+sH],["Stitchable",totalStitchable.toLocaleString()],["Colours",pal.length+""],["Skeins needed",totalSkeins+""]].map(function([l,v],i){return React.createElement("div",{key:i},React.createElement("div",{style:{color:"#94a3b8",fontWeight:600,marginBottom:1}},l),React.createElement("div",{style:{fontWeight:600,color:"#1e293b"}},v));})}
          </div>
        </div>

        {/* Layers */}
        <div style={{marginTop:12}}>
          <div className="rp-heading" style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
            <span>Layers</span>
            <div style={{display:"flex",gap:4}}>
              <button onClick={()=>{setSoloPreState(null);setLayerVis(ALL_LAYERS_VISIBLE);}} style={{fontSize:10,padding:"2px 7px",borderRadius:5,border:"1px solid #e2e8f0",background:"#f8fafc",cursor:"pointer",color:"#475569",fontWeight:600}}>All</button>
              <button onClick={()=>{setSoloPreState(null);setLayerVis(Object.fromEntries(STITCH_LAYERS.map(l=>[l.id,false])));}} style={{fontSize:10,padding:"2px 7px",borderRadius:5,border:"1px solid #e2e8f0",background:"#f8fafc",cursor:"pointer",color:"#475569",fontWeight:600}}>None</button>
            </div>
          </div>
          {STITCH_LAYERS.map(layer=>{
            const count=layerCounts[layer.id];
            const vis=layerVis[layer.id];
            return <div key={layer.id} style={{display:"flex",alignItems:"center",gap:6,padding:"3px 0",opacity:count>0?1:0.4}}>
              <button onClick={()=>{setSoloPreState(null);setLayerVis(v=>({...v,[layer.id]:!v[layer.id]}));}} style={{width:22,height:22,border:"none",borderRadius:4,background:vis?"#f0fdfa":"#f1f5f9",cursor:"pointer",padding:0,display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}>
                {vis?<svg width="12" height="9" viewBox="0 0 16 11" fill="none"><ellipse cx="8" cy="5.5" rx="7" ry="4.5" stroke="#0d9488" strokeWidth="1.5"/><circle cx="8" cy="5.5" r="2.5" fill="#0d9488"/></svg>:<svg width="12" height="9" viewBox="0 0 16 11" fill="none"><ellipse cx="8" cy="5.5" rx="7" ry="4.5" stroke="#94a3b8" strokeWidth="1.5"/><line x1="2" y1="1" x2="14" y2="10" stroke="#94a3b8" strokeWidth="1.5"/></svg>}
              </button>
              <span style={{flex:1,fontSize:11,color:vis?"#1e293b":"#94a3b8"}}>{layer.label}</span>
              <span style={{fontSize:10,color:"#94a3b8"}}>{count.toLocaleString()}</span>
              {layer.id==='backstitch'&&<select value={bsThickness} onChange={e=>setBsThickness(parseInt(e.target.value))} style={{fontSize:10,padding:"1px 3px",borderRadius:4,border:"1px solid #e2e8f0",maxWidth:42,cursor:"pointer"}}><option value={1}>1px</option><option value={2}>2px</option><option value={3}>3px</option></select>}
            </div>;
          })}
          <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginTop:4,paddingTop:4,borderTop:"0.5px solid #e2e8f0"}}>
            <span style={{fontSize:10,color:"#64748b"}}>Count</span>
            <button onClick={()=>setStatsCountMode(m=>m==='visible'?'all':'visible')} style={{fontSize:10,padding:"2px 8px",borderRadius:5,border:"1px solid #e2e8f0",background:statsCountMode==='all'?"#eff6ff":"#f8fafc",color:statsCountMode==='all'?"#1d4ed8":"#475569",cursor:"pointer",fontWeight:600}}>{statsCountMode==='visible'?'Visible layers only':'All layers'}</button>
          </div>
        </div>
      </div>}
      </div>{/* end rp-tab-content */}
    </div>{/* end rpanel */}
  </div>{/* end cs-main */}
  </>}

  {importDialog==="image"&&importImage&&<div className="modal-overlay" onClick={()=>{setImportDialog(null);setImportImage(null);}}>
    <div className="modal-content" style={{maxWidth:600}} onClick={e=>e.stopPropagation()}>
      <button className="modal-close" onClick={()=>{setImportDialog(null);setImportImage(null);}}>×</button>
      <h3 style={{marginTop:0,marginBottom:15}}>Import Image Pattern</h3>
      <div style={{display:"flex", flexDirection:"column", gap:12, marginBottom:16}}>
        <div style={{display:"flex", flexDirection:"column", gap:4}}>
          <label style={{fontSize:12, fontWeight:600, color:"#475569"}}>Project Name</label>
          <input type="text" maxLength={60} value={importName} onChange={e=>setImportName(e.target.value)}
            placeholder="e.g. Rose Garden" style={{padding:"6px 10px", borderRadius:6, border:"0.5px solid #e2e8f0", fontSize:13}}/>
        </div>
      </div>
      <div style={{display:"flex", gap:20, flexWrap:"wrap"}}>
        <div style={{width:140, display:"flex", flexDirection:"column", gap:8}}>
          <div style={{width:140, height:140, background:"#f8f9fa", border:"0.5px solid #e2e8f0", borderRadius:8, display:"flex", alignItems:"center", justifyContent:"center", overflow:"hidden"}}>
            <img src={importImage.src} style={{maxWidth:"100%", maxHeight:"100%", objectFit:"contain", imageRendering:"pixelated"}}/>
          </div>
          <div style={{fontSize:12, color:"#475569", textAlign:"center"}}>
            {importImage.width} × {importImage.height} px
          </div>
        </div>
        <div style={{flex:1, minWidth:250, display:"flex", flexDirection:"column", gap:16}}>
          <div style={{display:"grid", gridTemplateColumns:"1fr 1fr", gap:12}}>
            <div style={{display:"flex", flexDirection:"column", gap:4}}>
              <label style={{fontSize:12, fontWeight:600, color:"#475569"}}>Max Width (stitches)</label>
              <input type="number" min={10} max={300} value={importMaxW} onChange={e=>{
                let val = Number(e.target.value);
                setImportMaxW(val);
                if (importArLock) setImportMaxH(Math.max(10, Math.floor(val * (importImage.height / importImage.width))));
              }} style={{padding:"6px 10px", borderRadius:6, border:"0.5px solid #e2e8f0"}}/>
            </div>
            <div style={{display:"flex", flexDirection:"column", gap:4}}>
              <label style={{fontSize:12, fontWeight:600, color:"#475569"}}>Max Height (stitches)</label>
              <input type="number" min={10} max={300} value={importMaxH} onChange={e=>{
                let val = Number(e.target.value);
                setImportMaxH(val);
                if (importArLock) setImportMaxW(Math.max(10, Math.floor(val * (importImage.width / importImage.height))));
              }} style={{padding:"6px 10px", borderRadius:6, border:"0.5px solid #e2e8f0"}}/>
            </div>
          </div>
          <label style={{display:"flex", alignItems:"center", gap:8, fontSize:13, color:"#1e293b", cursor:"pointer"}}>
            <input type="checkbox" checked={importArLock} onChange={e=>setImportArLock(e.target.checked)}/> Lock aspect ratio
          </label>

          <div style={{display:"flex", flexDirection:"column", gap:4}}>
            <label style={{fontSize:12, fontWeight:600, color:"#475569"}}>Fabric Count</label>
            <select value={importFabricCt} onChange={e=>setImportFabricCt(Number(e.target.value))}
              style={{padding:"6px 10px", borderRadius:6, border:"0.5px solid #e2e8f0", fontSize:13, background:"#fff"}}>
              {FABRIC_COUNTS.map(fc=><option key={fc.ct} value={fc.ct}>{fc.label}</option>)}
            </select>
          </div>

          <SliderRow label="Max Colours" val={importMaxColours} setVal={setImportMaxColours} min={5} max={40} />

          <label style={{display:"flex", alignItems:"center", gap:8, fontSize:13, color:"#1e293b", cursor:"pointer"}}>
            <input type="checkbox" checked={importSkipBg} onChange={e=>setImportSkipBg(e.target.checked)}/> Skip near-white background
          </label>

          {importSkipBg && <SliderRow label="Background Tolerance" val={importBgThreshold} setVal={setImportBgThreshold} min={3} max={50} />}

        </div>
      </div>
      <div style={{display:"flex", justifyContent:"flex-end", gap:10, marginTop:24, paddingTop:16, borderTop:"0.5px solid #e2e8f0"}}>
        <button onClick={()=>{setImportDialog(null);setImportImage(null);}} style={{padding:"8px 16px", borderRadius:8, border:"0.5px solid #e2e8f0", background:"#fff", cursor:"pointer", fontWeight:600}}>Cancel</button>
        <button onClick={()=>{
          try {
            let result = parseImagePattern(importImage, {
              maxWidth: importMaxW, maxHeight: importMaxH,
              maxColours: importMaxColours, skipWhiteBg: importSkipBg, bgThreshold: importBgThreshold
            });
            const finalName = (importName || '').trim().slice(0, 60);
            let project = importResultToProject(result, importFabricCt, finalName);
            project.id = "proj_" + Date.now();
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
        }} style={{padding:"8px 16px", borderRadius:8, border:"none", background:"#0d9488", color:"#fff", cursor:"pointer", fontWeight:600}}>Import Pattern</button>
      </div>
    </div>
  </div>}

  {modal==="help"&&<SharedModals.Help onClose={()=>setModal(null)} />}
  {modal==="about"&&<SharedModals.About onClose={()=>setModal(null)} />}
  {modal==="pdf_export"&&<div className="modal-overlay" onClick={()=>setModal(null)}>
    <div className="modal-content" style={{maxWidth:400}} onClick={e=>e.stopPropagation()}>
      <button className="modal-close" onClick={()=>setModal(null)}>×</button>
      <h3 style={{marginTop:0,marginBottom:15}}>Export PDF</h3>
      <div style={{display:"flex",flexDirection:"column",gap:16}}>
        <label style={{fontSize:12,fontWeight:600,color:"#3f3f46",display:"flex",flexDirection:"column",gap:6}}>
          Chart Mode:
          <select value={pdfSettings.chartStyle||"color_symbol"} onChange={e=>setPdfSettings({...pdfSettings,chartStyle:e.target.value})} style={{padding:"6px 8px",borderRadius:6,border:"1px solid #cbd5e1",fontSize:13,background:"#fff"}}>
            <option value="color_symbol">Color + Symbols</option>
            <option value="symbol">Symbols Only</option>
            <option value="color">Color Blocks Only</option>
          </select>
        </label>
        <label style={{fontSize:12,fontWeight:600,color:"#3f3f46",display:"flex",flexDirection:"column",gap:6}}>
          Cell Size:
          <select value={pdfSettings.cellSize||3} onChange={e=>setPdfSettings({...pdfSettings,cellSize:Number(e.target.value)})} style={{padding:"6px 8px",borderRadius:6,border:"1px solid #cbd5e1",fontSize:13,background:"#fff"}}>
            <option value={2.5}>Small (2.5mm)</option>
            <option value={3}>Medium (3mm)</option>
            <option value={4.5}>Large (4.5mm)</option>
          </select>
        </label>
        <label style={{fontSize:12,fontWeight:600,color:"#3f3f46",display:"flex",alignItems:"center",gap:6,cursor:"pointer"}}>
          <input type="checkbox" checked={pdfSettings.singlePage||false} onChange={e=>setPdfSettings({...pdfSettings,singlePage:e.target.checked})}/> Single Page
        </label>
        <div style={{display:"flex",gap:10,marginTop:8}}>
          <button onClick={()=>{setModal(null);exportPDF({displayMode:pdfSettings.chartStyle||"color_symbol",cellSize:pdfSettings.cellSize||3,singlePage:pdfSettings.singlePage||false});}} style={{flex:1,padding:"10px",borderRadius:8,border:"none",background:"#0d9488",color:"#fff",fontWeight:600,cursor:"pointer"}}>Export PDF</button>
        </div>
      </div>
    </div>
  </div>}

  {modal==="shortcuts"&&<SharedModals.Shortcuts onClose={()=>setModal(null)} page="tracker" />}


  {modal==="deduct_prompt"&&<div className="modal-overlay" onClick={()=>{setModal(null);setStashDeducted(true);}}>
    <div className="modal-content" style={{maxWidth:460}} onClick={e=>e.stopPropagation()}>
      <button className="modal-close" onClick={()=>{setModal(null);setStashDeducted(true);}}>×</button>
      <h3 style={{marginTop:0,fontSize:20,color:"#1e293b"}}>Project Complete!</h3>
      <p style={{fontSize:14,color:"#475569",marginBottom:16}}>Deduct the thread used from your global stash?</p>
      <div style={{display:"flex",flexDirection:"column",gap:8}}>
        <button onClick={()=>{
          (async()=>{
            const stash=await StashBridge.getGlobalStash();
            for(const d of skeinData){
              const gs=stash[d.id]||{owned:0};
              const newOwned=Math.max(0,gs.owned-d.skeins);
              await StashBridge.updateThreadOwned(d.id,newOwned);
            }
            setGlobalStash(await StashBridge.getGlobalStash());
          })().then(()=>{setStashDeducted(true);setModal(null);}).catch(()=>{setStashDeducted(true);setModal(null);});
        }} style={{padding:"10px 20px",fontSize:14,borderRadius:8,border:"none",background:"#7c3aed",color:"#fff",cursor:"pointer",fontWeight:600}}>Deduct Full Skeins</button>
        <button onClick={()=>{
          (async()=>{
            const stash=await StashBridge.getGlobalStash();
            for(const d of skeinData){
              const gs=stash[d.id]||{owned:0};
              const deduct=Math.max(0,d.skeins-1);
              const newOwned=Math.max(0,gs.owned-deduct);
              await StashBridge.updateThreadOwned(d.id,newOwned);
            }
            setGlobalStash(await StashBridge.getGlobalStash());
          })().then(()=>{setStashDeducted(true);setModal(null);}).catch(()=>{setStashDeducted(true);setModal(null);});
        }} style={{padding:"10px 20px",fontSize:14,borderRadius:8,border:"1px solid #d8b4fe",background:"#faf5ff",color:"#7c3aed",cursor:"pointer",fontWeight:600}}>Deduct Partial (keep 1 per colour)</button>
        <button onClick={()=>{setStashDeducted(true);setModal(null);}} style={{padding:"10px 20px",fontSize:14,borderRadius:8,border:"0.5px solid #e2e8f0",background:"#fff",color:"#475569",cursor:"pointer",fontWeight:500}}>Skip</button>
      </div>
    </div>
  </div>}

  {cellEditPopover && isEditMode && (()=>{
    const cell = pat[cellEditPopover.idx];
    const currentEntry = cell && cell.id !== "__empty__" ? cmap[cell.id] : null;
    const isEmpty = !cell || cell.id === "__empty__";
    return (
      <div className="modal-overlay" onClick={()=>setCellEditPopover(null)}>
        <div className="modal-content" style={{maxWidth:440,display:"flex",flexDirection:"column",maxHeight:"80vh"}} onClick={e=>e.stopPropagation()}>
          <button className="modal-close" onClick={()=>setCellEditPopover(null)}>×</button>
          <h3 style={{marginTop:0,marginBottom:4,fontSize:18,color:"#1e293b"}}>Edit Stitch</h3>
          <div style={{fontSize:12,color:"#94a3b8",marginBottom:12}}>Row {cellEditPopover.row}, Col {cellEditPopover.col}</div>

          {isEmpty ? (
            <div style={{padding:"10px 12px",background:"#f1f5f9",borderRadius:8,marginBottom:12,fontSize:13,color:"#475569",fontStyle:"italic"}}>
              Empty — no stitch. Select a symbol below to assign one.
            </div>
          ) : currentEntry ? (
            <div style={{display:"flex",alignItems:"center",gap:10,padding:"8px 12px",background:"#f0fdfa",borderRadius:8,marginBottom:12,border:"1px solid #99f6e4"}}>
              <span style={{width:22,height:22,borderRadius:4,background:`rgb(${currentEntry.rgb[0]},${currentEntry.rgb[1]},${currentEntry.rgb[2]})`,border:"1px solid #cbd5e1",flexShrink:0}}/>
              <span style={{fontFamily:"monospace",fontWeight:700,fontSize:16}}>{currentEntry.symbol}</span>
              <span style={{fontWeight:600,fontSize:13}}>DMC {currentEntry.id}</span>
              <span style={{fontSize:12,color:"#475569",flex:1}}>{currentEntry.name}</span>
              <span style={{fontSize:11,color:"#0d9488",fontWeight:600}}>Current</span>
            </div>
          ) : null}

          <div style={{fontSize:12,fontWeight:600,color:"#475569",marginBottom:6}}>Assign symbol:</div>
          <div style={{flex:1,overflowY:"auto",border:"1px solid #e2e8f0",borderRadius:8,marginBottom:12}}>
            {pal.map(p=>{
              const isCurrent = !isEmpty && p.id === cell.id;
              return (
                <div key={p.id} onClick={()=>{ if(!isCurrent) handleSingleStitchEdit(cellEditPopover.idx,p.id); }}
                  style={{display:"flex",alignItems:"center",gap:10,padding:"9px 12px",borderBottom:"1px solid #f1f5f9",
                    background:isCurrent?"#f0fdfa":"#fff",cursor:isCurrent?"default":"pointer",
                    opacity:isCurrent?0.6:1}}>
                  <span style={{width:20,height:20,borderRadius:4,background:`rgb(${p.rgb[0]},${p.rgb[1]},${p.rgb[2]})`,border:"1px solid #cbd5e1",flexShrink:0}}/>
                  <span style={{fontFamily:"monospace",fontWeight:700,fontSize:14,width:18,textAlign:"center"}}>{p.symbol}</span>
                  <span style={{fontWeight:600,fontSize:13,minWidth:52}}>DMC {p.id}</span>
                  <span style={{fontSize:12,color:"#475569",flex:1,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{p.name}</span>
                  <span style={{fontSize:11,color:"#94a3b8"}}>{p.count} st</span>
                  {isCurrent&&<span style={{fontSize:11,fontWeight:600,color:"#0d9488",background:"#ccfbf1",padding:"2px 8px",borderRadius:10}}>Current</span>}
                </div>
              );
            })}
          </div>

          {!isEmpty && (
            <button onClick={()=>{
              if(confirm(`Remove stitch at Row ${cellEditPopover.row}, Col ${cellEditPopover.col}? It will be marked as empty.`)){
                handleStitchRemoval(cellEditPopover.idx);
              }
            }} style={{padding:"9px 16px",borderRadius:8,border:"1px solid #fecaca",background:"#fef2f2",color:"#dc2626",cursor:"pointer",fontWeight:600,fontSize:13,textAlign:"left"}}>
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
    <div style={{position:"fixed",top:0,left:0,right:0,bottom:0,background:"rgba(0,0,0,0.5)",display:"flex",alignItems:"center",justifyContent:"center",zIndex:10000}}>
      <div style={{background:"#fff",padding:24,borderRadius:12,width:350,maxWidth:"90%",boxShadow:"0 10px 25px -5px rgba(0,0,0,0.1), 0 8px 10px -6px rgba(0,0,0,0.1)"}}>
        <h3 style={{margin:"0 0 12px 0",fontSize:18,color:"#1e293b"}}>Apply changes?</h3>
        <p style={{fontSize:14,color:"#475569",margin:"0 0 24px 0",lineHeight:1.5}}>You have made changes to the symbol assignments. Do you want to apply them?</p>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",gap:8}}>
          <button onClick={()=>{
            // Cancel
            setShowExitEditModal(false);
          }} style={{padding:"8px 12px",fontSize:14,borderRadius:8,border:"0.5px solid #e2e8f0",background:"#fff",cursor:"pointer",fontWeight:500,color:"#475569"}}>Cancel</button>

          <div style={{display:"flex",gap:8}}>
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
            }} style={{padding:"8px 12px",fontSize:14,borderRadius:8,border:"none",background:"#fef2f2",color:"#dc2626",cursor:"pointer",fontWeight:500}}>Discard</button>

            <button onClick={()=>{
              // Apply — commit edits; clear undo snapshot (edits are now permanent)
              setUndoSnapshot(null);
              setSessionStartSnapshot(null);
              setIsEditMode(false);
              setShowExitEditModal(false);
            }} style={{padding:"8px 12px",fontSize:14,borderRadius:8,border:"none",background:"#0d9488",color:"#fff",cursor:"pointer",fontWeight:500}}>Apply</button>
          </div>
        </div>
      </div>
    </div>
  )}

  {/* Half stitch disambiguation popup */}
  {halfDisambig&&<div style={{position:"fixed",top:0,left:0,right:0,bottom:0,zIndex:10001}} onClick={()=>setHalfDisambig(null)}>
    <div className="hs-scale-in" style={{
      position:"fixed",left:halfDisambig.x-50,top:halfDisambig.y-60,
      background:"#fff",borderRadius:8,boxShadow:"0 4px 16px rgba(0,0,0,0.2)",padding:"6px 8px",
      display:"flex",flexDirection:"column",gap:4,border:"1px solid #e2e8f0",minWidth:100
    }} onClick={e=>e.stopPropagation()}>
      <button onClick={()=>_markHalfDoneFromDisambig(halfDisambig.idx,"fwd")} style={{
        display:"flex",alignItems:"center",gap:6,padding:"5px 10px",borderRadius:6,border:"none",
        background:"#f0f9ff",cursor:"pointer",fontSize:12,fontWeight:500,color:"#0c4a6e"
      }}>
        <svg width="14" height="14" viewBox="0 0 14 14"><polygon points="0,0 0,14 14,14" fill="#7dd3fc"/></svg>
        Mark /
      </button>
      <button onClick={()=>_markHalfDoneFromDisambig(halfDisambig.idx,"bck")} style={{
        display:"flex",alignItems:"center",gap:6,padding:"5px 10px",borderRadius:6,border:"none",
        background:"#f0f9ff",cursor:"pointer",fontSize:12,fontWeight:500,color:"#0c4a6e"
      }}>
        <svg width="14" height="14" viewBox="0 0 14 14"><polygon points="0,0 14,0 0,14" fill="#7dd3fc"/></svg>
        Mark \
      </button>
    </div>
  </div>}

{celebration&&<MilestoneCelebration milestone={celebration} onDismiss={()=>setCelebration(null)}/>}
</div>
</>);
}
window.TrackerApp=TrackerApp;
if(!window.__UNIFIED__)ReactDOM.createRoot(document.getElementById("root")).render(<TrackerApp/>);
