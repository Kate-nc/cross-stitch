const{useState,useRef,useCallback,useEffect,useMemo}=React;

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
const[trackHistory,setTrackHistory]=useState([]);
const[redoStack,setRedoStack]=useState([]);
const TRACK_HISTORY_MAX=50;

const[totalTime,setTotalTime]=useState(0);
const[sessions,setSessions]=useState([]);

const[statsSessions,setStatsSessions]=useState([]);
const[statsSettings,setStatsSettings]=useState({dailyGoal:null,targetDate:null,dayEndHour:0,stitchingSpeedOverride:null});
const[statsView,setStatsView]=useState(false);
const[celebration,setCelebration]=useState(null);
const celebratedRef=useRef(new Set());
const currentAutoSessionRef=useRef(null);
const pendingColoursRef=useRef(new Set());
const pendingMilestonesRef=useRef([]);
const lastStitchActivityRef=useRef(null);
const autoIdleTimerRef=useRef(null);
const prevAutoCountRef=useRef({done:0,halfDone:0});
const autoStatsRef=useRef({doneCount:0,totalStitchable:0});
const finaliseAutoSessionRef=useRef(null);
const IDLE_THRESHOLD_MS=10*60*1000;

// Variables for auto-session visibility auto-pause
const [liveAutoElapsed, setLiveAutoElapsed] = useState(0);
const [liveAutoStitches, setLiveAutoStitches] = useState(0);
const [liveAutoIsPaused, setLiveAutoIsPaused] = useState(false);
const autoSessionDisplayTimerRef = useRef(null);
const documentHiddenRef = useRef(false);
const lastPauseTimeRef = useRef(null);

const[stitchMode,setStitchMode]=useState("track"),[stitchView,setStitchView]=useState("symbol"),[stitchZoom,setStitchZoom]=useState(1);
useEffect(()=>{stitchZoomRef.current=stitchZoom;},[stitchZoom]);
useEffect(()=>{if(stitchMode!=="track"||halfStitchTool){setRangeModeActive(false);setRangeAnchor(null);}},[stitchMode,halfStitchTool]);
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
const[halfStitchTool,setHalfStitchTool]=useState(null); // null, "fwd", "bck", "erase"
const[halfStitchTooltipDismissed,setHalfStitchTooltipDismissed]=useState(false);
const[halfOnboardingDone,setHalfOnboardingDone]=useState(false);
const[halfOnboardingStep,setHalfOnboardingStep]=useState(0);
const[showHalfOnboarding,setShowHalfOnboarding]=useState(false);
const[halfDisambig,setHalfDisambig]=useState(null); // {x, y, idx} for popup
const halfEverPlaced=useRef(false);
const[halfToast,setHalfToast]=useState(null);

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

const prevDoneCount=useRef(0);
const modeToggleRef=useRef(0);
const loadRef=useRef(null),timerRef=useRef(null),stitchRef=useRef(null);
const projectIdRef=useRef(null);    // current project's storage ID
const createdAtRef=useRef(null);    // stable createdAt ISO string for the active project
const lastSnapshotRef=useRef(null); // freshest serialised project for beforeunload
const[projectName,setProjectName]=useState("");
const[namePromptOpen,setNamePromptOpen]=useState(false);
const G=28;
const[tOverflowOpen,setTOverflowOpen]=useState(false);
const[tStripCollapsed,setTStripCollapsed]=useState({view:false,stitch:false});
const[halfMenuOpen,setHalfMenuOpen]=useState(false);
const tStripRef=useRef(null);
const tOverflowRef=useRef(null);
const halfMenuRef=useRef(null);

const doneCount=useMemo(()=>{if(!done)return 0;let c=0;for(let i=0;i<done.length;i++)if(done[i])c++;return c;},[done]);
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
const progressPct=combinedTotal>0?Math.round(combinedDone/combinedTotal*1000)/10:0;

const colourDoneCounts=useMemo(()=>{
  if(!pat||!done)return{};
  let c={};
  for(let i=0;i<pat.length;i++){const id=pat[i].id;if(id==="__skip__"||id==="__empty__")continue;if(!c[id])c[id]={total:0,done:0,halfTotal:0,halfDone:0};c[id].total++;if(done[i])c[id].done++;}
  // Count half stitches per colour
  halfStitches.forEach((hs,idx)=>{
    if(hs.fwd){const id=hs.fwd.id;if(!c[id])c[id]={total:0,done:0,halfTotal:0,halfDone:0};c[id].halfTotal++;const hd=halfDone.get(idx);if(hd&&hd.fwd)c[id].halfDone++;}
    if(hs.bck){const id=hs.bck.id;if(!c[id])c[id]={total:0,done:0,halfTotal:0,halfDone:0};c[id].halfTotal++;const hd=halfDone.get(idx);if(hd&&hd.bck)c[id].halfDone++;}
  });
  return c;
},[pat,done,halfStitches,halfDone]);

const focusableColors=useMemo(()=>{
  if(!pal)return[];
  let list=pal;
  if(onlyStarted){const started=pal.filter(p=>{const dc=colourDoneCounts[p.id];return dc&&dc.done>0;});if(started.length>0)list=started;}
  if(!highlightSkipDone)return list;
  const incomplete=list.filter(p=>{const dc=colourDoneCounts[p.id];return !dc||dc.done<dc.total;});
  return incomplete.length>0?incomplete:list;
},[pal,colourDoneCounts,highlightSkipDone,onlyStarted]);

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
},[colourDoneCounts,focusColour,stitchView,highlightSkipDone,pal]);

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
  }catch(e){console.warn('Stats: getStitchingDateLocal error',e);const d=new Date();return d.getFullYear()+'-'+('0'+(d.getMonth()+1)).slice(-2)+'-'+('0'+d.getDate()).slice(-2);}
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
    currentAutoSessionRef.current.stitchesCompleted+=completed;
    currentAutoSessionRef.current.stitchesUndone+=undone;
    setLiveAutoStitches(currentAutoSessionRef.current.stitchesCompleted);
    // Merge any pending colour IDs into the session
    if(pendingColoursRef.current.size>0){
      pendingColoursRef.current.forEach(c=>currentAutoSessionRef.current.coloursWorked.add(c));
      pendingColoursRef.current.clear();
    }
    clearTimeout(autoIdleTimerRef.current);
    autoIdleTimerRef.current=setTimeout(()=>{try{if(finaliseAutoSessionRef.current)finaliseAutoSessionRef.current();}catch(e){console.warn('Stats: idle finalise error',e);}},IDLE_THRESHOLD_MS);
  }catch(e){console.warn('Stats: recordAutoActivity error',e);}
}
function finaliseAutoSession(){
  try{
    const session=currentAutoSessionRef.current;
    if(!session||session.stitchesCompleted+session.stitchesUndone===0){
      currentAutoSessionRef.current=null;
      return;
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
    setTotalTime(prev => prev + Math.floor(activeDurationMs / 1000));
    currentAutoSessionRef.current=null;
    clearTimeout(autoIdleTimerRef.current);
    setLiveAutoElapsed(0);
    setLiveAutoStitches(0);
    return finalised;
  }catch(e){console.warn('Stats: finaliseAutoSession error',e);currentAutoSessionRef.current=null;return null;}
}
finaliseAutoSessionRef.current=finaliseAutoSession;

useEffect(() => {
  function handleVisibilityChange() {
    const isHidden = document.hidden;
    documentHiddenRef.current = isHidden;
    setLiveAutoIsPaused(isHidden);

    if (isHidden) {
      lastPauseTimeRef.current = Date.now();
    } else {
      if (lastPauseTimeRef.current && currentAutoSessionRef.current) {
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
    if (documentHiddenRef.current) return;
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
    // Skip initial load or project load (sentinel value -1)
    if(prevDone<0||prevHalf<0){
      prevAutoCountRef.current={done:curDone,halfDone:curHalf};
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
          }
        }catch(me){console.warn('Stats: milestone check error',me);}
      }
    }
    prevAutoCountRef.current={done:curDone,halfDone:curHalf};
  }catch(e){console.warn('Stats: auto-detect effect error',e);}
},[doneCount,halfStitchCounts.done]);
// Edit session note
function editSessionNote(sessionId,noteText){
  try{setStatsSessions(prev=>(prev||[]).map(s=>s.id===sessionId?Object.assign({},s,{note:noteText}):s));}catch(e){console.warn('Stats: editSessionNote error',e);}
}
function markColourDone(cid,md){if(!pat||!done)return;let changes=[];let nd=new Uint8Array(done);for(let i=0;i<pat.length;i++)if(pat[i].id===cid){if(nd[i]!==(md?1:0))changes.push({idx:i,oldVal:nd[i]});nd[i]=md?1:0;}if(changes.length>0)pushTrackHistory(changes);setDone(nd);}
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
  if (previousDone) { const nd=new Uint8Array(done); nd[cellIdx]=0; setDone(nd); }
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
    if (previousDone) { const nd=new Uint8Array(done); nd[cellIdx]=1; setDone(nd); }
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
  setHalfStitchTool(null);
  setSelectedColorId(null);setFocusColour(null);setTrackHistory([]);setRedoStack([]);
  if(project.settings && project.settings.pdfSettings) setPdfSettings(project.settings.pdfSettings);
  setThreadOwned(project.threadOwned||{});
  if(project.done&&project.done.length===restored.length)setDone(new Uint8Array(project.done));
  else setDone(new Uint8Array(restored.length));

  setParkMarkers(project.parkMarkers||[]);
  setTotalTime(project.totalTime||0);
  setSessions(project.sessions||[]);
  setStatsSessions(project.statsSessions||[]);
  setStatsSettings(project.statsSettings||{dailyGoal:null,targetDate:null,dayEndHour:0,stitchingSpeedOverride:null});
  setStatsView(false);
  setCelebration(null);
  celebratedRef.current=new Set();
  pendingMilestonesRef.current=[];
  currentAutoSessionRef.current=null;
  clearTimeout(autoIdleTimerRef.current);
  // Reset auto-session count refs so loading doesn't trigger a spurious session
  // (will be set accurately after next render via the doneCount/halfDone effects)
  prevAutoCountRef.current={done:-1,halfDone:-1};
  if(project.hlRow>=0)setHlRow(project.hlRow);
  if(project.hlCol>=0)setHlCol(project.hlCol);
  setProjectName(project.name||"");
  projectIdRef.current = project.id || null;
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
// Builds a fresh snapshot on every relevant state change (synchronous, no delay).
// The actual DB write is debounced 5 seconds to avoid hammering storage.
// lastSnapshotRef is always up-to-date, so beforeunload can use it safely.
useEffect(() => {
  if (!pat || !pal) return;
  if (!projectIdRef.current) projectIdRef.current = "proj_" + Date.now();
  if (!createdAtRef.current) createdAtRef.current = new Date().toISOString();
  const sseArr = [...singleStitchEdits.entries()];
  const hsArr = [...halfStitches.entries()].map(([idx, hs]) => [idx, {
    fwd: hs.fwd ? { id: hs.fwd.id, rgb: hs.fwd.rgb } : undefined,
    bck: hs.bck ? { id: hs.bck.id, rgb: hs.bck.rgb } : undefined
  }]);
  const hdArr = [...halfDone.entries()];
  const project = {
    version: 9, id: projectIdRef.current, page: "tracker", name: projectName,
    createdAt: createdAtRef.current, updatedAt: new Date().toISOString(),
    settings: { sW, sH, fabricCt, skeinPrice, stitchSpeed },
    pattern: pat.map(m => (m.id === "__skip__" || m.id === "__empty__") ? { id: m.id } : { id: m.id, type: m.type, rgb: m.rgb }),
    bsLines, done: done ? Array.from(done) : null, parkMarkers,
    totalTime: totalTime + liveAutoElapsed,
    sessions, hlRow, hlCol, threadOwned, originalPaletteState,
    singleStitchEdits: sseArr, halfStitches: hsArr, halfDone: hdArr,
    statsSessions, statsSettings,
    savedZoom: stitchZoom,
    savedScroll: stitchScrollRef.current ? { left: stitchScrollRef.current.scrollLeft, top: stitchScrollRef.current.scrollTop } : null
  };
  lastSnapshotRef.current = project;
  const saveTimer = setTimeout(() => {
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
    sW, sH, fabricCt, skeinPrice, stitchSpeed, originalPaletteState, statsSessions, statsSettings, projectName, stitchZoom]);

// Save the freshest snapshot before the page unloads (best-effort fire-and-forget).
// Uses only refs so the handler is never stale; drag in-progress mutations are applied
// from dragChangesRef before saving.
useEffect(() => {
  const handleBeforeUnload = () => {
    try {
    const project = lastSnapshotRef.current;
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
    } catch(e) { console.warn('beforeunload save error', e); }
  };
  window.addEventListener("beforeunload", handleBeforeUnload);
  return () => window.removeEventListener("beforeunload", handleBeforeUnload);
}, []); // empty: handler reads only from refs (always fresh)

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
      statsSessions, statsSettings,
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
    threadOwned, originalPaletteState, singleStitchEdits, statsSessions, statsSettings, stitchZoom]);

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

  // Clear full canvas — single fillRect is GPU-accelerated regardless of size,
  // and avoids stale-cell jerk when scroll reveals previously undrawn areas.
  ctx.fillStyle="#fff";
  ctx.fillRect(0,0,gut+dW*cSz+2,gut+dH*cSz+2);

  // Compute cell draw range: viewport + overdraw buffer so cells just off-screen
  // are pre-rendered before scrolling reveals them.
  const OVERDRAW=400;
  let startX=0,startY=0,endX=dW,endY=dH;
  if(viewportRect){
    startX=Math.max(0,Math.floor((viewportRect.left-gut-OVERDRAW)/cSz));
    startY=Math.max(0,Math.floor((viewportRect.top-gut-OVERDRAW)/cSz));
    endX=Math.min(dW,Math.ceil((viewportRect.right-gut+OVERDRAW)/cSz));
    endY=Math.min(dH,Math.ceil((viewportRect.bottom-gut+OVERDRAW)/cSz));
  }

  // Hoist font strings — same for all cells at a given zoom level
  const fSym=`bold ${Math.max(7,cSz*0.65)}px monospace`;
  const fCol=`bold ${Math.max(7,cSz*0.6)}px monospace`;
  const fHlDim=`${Math.max(6,cSz*0.45)}px monospace`;
  const fHlFocus=`bold ${Math.max(7,cSz*0.7)}px monospace`;
  ctx.textAlign="center";ctx.textBaseline="middle";

  // Zoom thresholds for half-stitch rendering detail
  const zoomPct = stitchZoom * 100;
  const hsLowZoom = zoomPct < 40;
  const hsMedZoom = zoomPct >= 40 && zoomPct <= 80;
  const hsHighZoom = zoomPct > 80;

  for(let y=startY;y<endY;y++){
    for(let x=startX;x<endX;x++){
      let idx=y*sW+x,m=pat[idx];if(!m)continue;
      let info=(m.id==="__skip__"||m.id==="__empty__")?null:(cmap?cmap[m.id]:null);
      let px=gut+x*cSz,py=gut+y*cSz;
      let isDn=done&&done[idx];
      let dimmed=stitchView==="highlight"&&focusColour&&m.id!==focusColour&&m.id!=="__skip__"&&m.id!=="__empty__";
      const effectiveDimmed=dimmed&&highlightMode!=="outline"&&highlightMode!=="tint";
      // Dim level: 0=white, 1=full colour; used by isolate/spotlight backgrounds
      const dimR=Math.round(255-(255-m.rgb[0])*trackerDimLevel),dimG=Math.round(255-(255-m.rgb[1])*trackerDimLevel),dimB=Math.round(255-(255-m.rgb[2])*trackerDimLevel);
      const dimFill=effectiveDimmed?`rgb(${dimR},${dimG},${dimB})`:'#f1f5f9';
      if(m.id==="__skip__"||m.id==="__empty__"){drawCk(ctx,px,py,cSz);if(cSz>=4){ctx.strokeStyle=m.id==="__empty__"?"rgba(220,50,50,0.25)":"rgba(0,0,0,0.06)";ctx.strokeRect(px,py,cSz,cSz);}
        // Half stitches on skip/empty cells
        let hs=halfStitches.get(idx);
        if(hs){
          let hd=halfDone.get(idx)||{};
          _drawHalfStitchCell(ctx,px,py,cSz,hs,hd,cmap,stitchView,focusColour,false,hsLowZoom,hsMedZoom,hsHighZoom);
        }
        continue;
      }
      if(stitchView==="symbol"){
        if(isDn){ctx.fillStyle="#d1fae5";ctx.fillRect(px,py,cSz,cSz);}
        else{ctx.fillStyle="#fff";ctx.fillRect(px,py,cSz,cSz);if(info&&cSz>=6){ctx.fillStyle="#1e293b";ctx.font=fSym;ctx.fillText(info.symbol,px+cSz/2,py+cSz/2);}}
      }else if(stitchView==="colour"){
        ctx.fillStyle=`rgb(${m.rgb[0]},${m.rgb[1]},${m.rgb[2]})`;ctx.fillRect(px,py,cSz,cSz);
        if(!isDn&&info&&cSz>=6){ctx.fillStyle=luminance(m.rgb)>140?"rgba(0,0,0,0.8)":"rgba(255,255,255,0.95)";ctx.font=fCol;ctx.fillText(info.symbol,px+cSz/2,py+cSz/2);}
      }else if(highlightMode==="outline"||highlightMode==="tint"){
        ctx.fillStyle=`rgb(${m.rgb[0]},${m.rgb[1]},${m.rgb[2]})`;ctx.fillRect(px,py,cSz,cSz);
        if(!isDn&&info&&cSz>=6){ctx.fillStyle=luminance(m.rgb)>140?"rgba(0,0,0,0.8)":"rgba(255,255,255,0.95)";ctx.font=fCol;ctx.fillText(info.symbol,px+cSz/2,py+cSz/2);}
        if(highlightMode==="tint"&&focusColour&&m.id===focusColour){const tr=parseInt(tintColor.slice(1,3),16),tg=parseInt(tintColor.slice(3,5),16),tb=parseInt(tintColor.slice(5,7),16);ctx.fillStyle=`rgba(${tr},${tg},${tb},${tintOpacity})`;ctx.fillRect(px,py,cSz,cSz);}
      }else if(highlightMode==="spotlight"){
        if(dimmed){ctx.fillStyle="#e8ecf0";ctx.fillRect(px,py,cSz,cSz);}
        else{ctx.fillStyle=`rgb(${m.rgb[0]},${m.rgb[1]},${m.rgb[2]})`;ctx.fillRect(px,py,cSz,cSz);if(!isDn&&info&&cSz>=6){ctx.fillStyle=luminance(m.rgb)>140?"rgba(0,0,0,0.8)":"rgba(255,255,255,0.95)";ctx.font=fCol;ctx.fillText(info.symbol,px+cSz/2,py+cSz/2);}if(cSz>=4){const lum2=luminance(m.rgb);ctx.strokeStyle=lum2>140?"rgba(26,26,46,0.85)":"rgba(255,255,255,0.85)";ctx.lineWidth=1.5;ctx.strokeRect(px+0.75,py+0.75,cSz-1.5,cSz-1.5);ctx.lineWidth=1;}}
      }else{
        if(isDn){ctx.fillStyle=effectiveDimmed?dimFill:`rgb(${m.rgb[0]},${m.rgb[1]},${m.rgb[2]})`;ctx.fillRect(px,py,cSz,cSz);}
        else if(dimmed){ctx.fillStyle=dimFill;ctx.fillRect(px,py,cSz,cSz);if(trackerDimLevel<0.25&&info&&cSz>=8){ctx.fillStyle=`rgba(0,0,0,${Math.max(0.04,0.12-trackerDimLevel*0.4)})`;ctx.font=fHlDim;ctx.fillText(info.symbol,px+cSz/2,py+cSz/2);}else if(trackerDimLevel>=0.25&&info&&cSz>=8){ctx.fillStyle=luminance(m.rgb)>140?'rgba(0,0,0,0.5)':'rgba(255,255,255,0.6)';ctx.font=fHlDim;ctx.fillText(info.symbol,px+cSz/2,py+cSz/2);}}
        else{ctx.fillStyle=`rgba(${m.rgb[0]},${m.rgb[1]},${m.rgb[2]},0.25)`;ctx.fillRect(px,py,cSz,cSz);if(info&&cSz>=6){ctx.fillStyle="#1e293b";ctx.font=fHlFocus;ctx.fillText(info.symbol,px+cSz/2,py+cSz/2);}}
      }
      // Render half stitches on top of full-stitch cells
      let hs=halfStitches.get(idx);
      if(hs){
        let hd=halfDone.get(idx)||{};
        _drawHalfStitchCell(ctx,px,py,cSz,hs,hd,cmap,stitchView,focusColour,effectiveDimmed,hsLowZoom,hsMedZoom,hsHighZoom);
      }
      if(cSz>=4){ctx.strokeStyle=effectiveDimmed?"rgba(0,0,0,0.03)":"rgba(0,0,0,0.08)";ctx.strokeRect(px,py,cSz,cSz);}
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

  // Grid lines — only within visible range
  if(cSz>=3){
    for(let gx=startX;gx<=endX;gx++){
      if(gx%10===0){ctx.strokeStyle="#444";ctx.lineWidth=2;}
      else if(gx%5===0){ctx.strokeStyle="#aaa";ctx.lineWidth=1;}
      else continue;
      ctx.beginPath();ctx.moveTo(gut+gx*cSz,gut+startY*cSz);ctx.lineTo(gut+gx*cSz,gut+endY*cSz);ctx.stroke();
    }
    for(let gy=startY;gy<=endY;gy++){
      if(gy%10===0){ctx.strokeStyle="#444";ctx.lineWidth=2;}
      else if(gy%5===0){ctx.strokeStyle="#aaa";ctx.lineWidth=1;}
      else continue;
      ctx.beginPath();ctx.moveTo(gut+startX*cSz,gut+gy*cSz);ctx.lineTo(gut+endX*cSz,gut+gy*cSz);ctx.stroke();
    }
    ctx.lineWidth=1;
  }

  // Centre marks, crosshair, backstitch, park markers, border — always draw (cheap)
  if(showCtr){ctx.strokeStyle="rgba(200,60,60,0.3)";ctx.lineWidth=1.5;ctx.setLineDash([6,4]);ctx.beginPath();ctx.moveTo(gut+Math.floor(sW/2)*cSz,gut+startY*cSz);ctx.lineTo(gut+Math.floor(sW/2)*cSz,gut+endY*cSz);ctx.stroke();ctx.beginPath();ctx.moveTo(gut+startX*cSz,gut+Math.floor(sH/2)*cSz);ctx.lineTo(gut+endX*cSz,gut+Math.floor(sH/2)*cSz);ctx.stroke();ctx.setLineDash([]);}
  if(hlRow>=0&&hlCol>=0){ctx.strokeStyle="rgba(59,130,246,0.6)";ctx.lineWidth=2;ctx.setLineDash([]);if(hlRow>=startY&&hlRow<endY){ctx.beginPath();ctx.moveTo(gut+startX*cSz,gut+hlRow*cSz+cSz/2);ctx.lineTo(gut+endX*cSz,gut+hlRow*cSz+cSz/2);ctx.stroke();}if(hlCol>=startX&&hlCol<endX){ctx.beginPath();ctx.moveTo(gut+hlCol*cSz+cSz/2,gut+startY*cSz);ctx.lineTo(gut+hlCol*cSz+cSz/2,gut+endY*cSz);ctx.stroke();}}
  if(bsLines.length>0){ctx.strokeStyle="#333";ctx.lineWidth=Math.max(2,cSz*0.15);ctx.lineCap="round";bsLines.forEach(ln=>{ctx.beginPath();ctx.moveTo(gut+ln.x1*cSz,gut+ln.y1*cSz);ctx.lineTo(gut+ln.x2*cSz,gut+ln.y2*cSz);ctx.stroke();});}
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
},[pat,cmap,scs,sW,sH,showCtr,bsLines,done,parkMarkers,hlRow,hlCol,stitchView,focusColour,halfStitches,halfDone,stitchZoom,highlightMode,tintColor,tintOpacity,spotDimOpacity,antsOffset,trackerDimLevel]);
useEffect(()=>renderStitch(),[renderStitch]);

// Marching ants animation interval for "outline" highlight mode
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
  const dimmed=stitchView==="highlight"&&focusColour&&m.id!==focusColour&&m.id!=="__skip__"&&m.id!=="__empty__";
  const effectiveDimmed2=dimmed&&highlightMode!=="outline"&&highlightMode!=="tint";

  ctx.clearRect(px, py, cSz, cSz);

  if(m.id==="__skip__"||m.id==="__empty__"){
    drawCk(ctx,px,py,cSz);
    if(cSz>=4){
      ctx.strokeStyle=m.id==="__empty__"?"rgba(220,50,50,0.25)":"rgba(0,0,0,0.06)";
      ctx.strokeRect(px,py,cSz,cSz);
    }
    // Half stitches on skip/empty cells in direct draw
    let hs=halfStitches.get(idx);
    if(hs){
      let hd=halfDone.get(idx)||{};
      let zp=stitchZoom*100;
      _drawHalfStitchCell(ctx,px,py,cSz,hs,hd,cmap,stitchView,focusColour,false,zp<40,zp>=40&&zp<=80,zp>80);
    }
    return;
  }

  if(stitchView==="symbol"){
    if(isDn){ctx.fillStyle="#d1fae5";ctx.fillRect(px,py,cSz,cSz);}
    else{ctx.fillStyle="#fff";ctx.fillRect(px,py,cSz,cSz);if(info&&cSz>=6){ctx.fillStyle="#1e293b";ctx.font=`bold ${Math.max(7,cSz*0.65)}px monospace`;ctx.textAlign="center";ctx.textBaseline="middle";ctx.fillText(info.symbol,px+cSz/2,py+cSz/2);}}
  }else if(stitchView==="colour"){
    ctx.fillStyle=`rgb(${m.rgb[0]},${m.rgb[1]},${m.rgb[2]})`;ctx.fillRect(px,py,cSz,cSz);
    if(!isDn&&info&&cSz>=6){ctx.fillStyle=luminance(m.rgb)>140?"rgba(0,0,0,0.8)":"rgba(255,255,255,0.95)";ctx.font=`bold ${Math.max(7,cSz*0.6)}px monospace`;ctx.textAlign="center";ctx.textBaseline="middle";ctx.fillText(info.symbol,px+cSz/2,py+cSz/2);}
  }else if(highlightMode==="outline"||highlightMode==="tint"){
    ctx.fillStyle=`rgb(${m.rgb[0]},${m.rgb[1]},${m.rgb[2]})`;ctx.fillRect(px,py,cSz,cSz);
    if(!isDn&&info&&cSz>=6){ctx.fillStyle=luminance(m.rgb)>140?"rgba(0,0,0,0.8)":"rgba(255,255,255,0.95)";ctx.font=`bold ${Math.max(7,cSz*0.6)}px monospace`;ctx.textAlign="center";ctx.textBaseline="middle";ctx.fillText(info.symbol,px+cSz/2,py+cSz/2);}
    if(highlightMode==="tint"&&focusColour&&m.id===focusColour){const tr=parseInt(tintColor.slice(1,3),16),tg=parseInt(tintColor.slice(3,5),16),tb=parseInt(tintColor.slice(5,7),16);ctx.fillStyle=`rgba(${tr},${tg},${tb},${tintOpacity})`;ctx.fillRect(px,py,cSz,cSz);}
  }else if(highlightMode==="spotlight"){
    if(dimmed){ctx.fillStyle="#e8ecf0";ctx.fillRect(px,py,cSz,cSz);}
    else{ctx.fillStyle=`rgb(${m.rgb[0]},${m.rgb[1]},${m.rgb[2]})`;ctx.fillRect(px,py,cSz,cSz);if(!isDn&&info&&cSz>=6){ctx.fillStyle=luminance(m.rgb)>140?"rgba(0,0,0,0.8)":"rgba(255,255,255,0.95)";ctx.font=`bold ${Math.max(7,cSz*0.6)}px monospace`;ctx.textAlign="center";ctx.textBaseline="middle";ctx.fillText(info.symbol,px+cSz/2,py+cSz/2);}if(cSz>=4){const lum2=luminance(m.rgb);ctx.strokeStyle=lum2>140?"rgba(26,26,46,0.85)":"rgba(255,255,255,0.85)";ctx.lineWidth=1.5;ctx.strokeRect(px+0.75,py+0.75,cSz-1.5,cSz-1.5);ctx.lineWidth=1;}}
  }else{
    if(isDn){ctx.fillStyle=dimmed?"#f1f5f9":`rgb(${m.rgb[0]},${m.rgb[1]},${m.rgb[2]})`;ctx.fillRect(px,py,cSz,cSz);}
    else if(dimmed){ctx.fillStyle="#f1f5f9";ctx.fillRect(px,py,cSz,cSz);if(info&&cSz>=8){ctx.fillStyle="rgba(0,0,0,0.06)";ctx.font=`${Math.max(6,cSz*0.45)}px monospace`;ctx.textAlign="center";ctx.textBaseline="middle";ctx.fillText(info.symbol,px+cSz/2,py+cSz/2);}}
    else{ctx.fillStyle=`rgba(${m.rgb[0]},${m.rgb[1]},${m.rgb[2]},0.25)`;ctx.fillRect(px,py,cSz,cSz);if(info&&cSz>=6){ctx.fillStyle="#1e293b";ctx.font=`bold ${Math.max(7,cSz*0.7)}px monospace`;ctx.textAlign="center";ctx.textBaseline="middle";ctx.fillText(info.symbol,px+cSz/2,py+cSz/2);}}
  }
  // Half stitches on full-stitch cells in direct draw
  let hs=halfStitches.get(idx);
  if(hs){
    let hd=halfDone.get(idx)||{};
    let zp=stitchZoom*100;
    _drawHalfStitchCell(ctx,px,py,cSz,hs,hd,cmap,stitchView,focusColour,effectiveDimmed2,zp<40,zp>=40&&zp<=80,zp>80);
  }
  if(cSz>=4){ctx.strokeStyle=effectiveDimmed2?"rgba(0,0,0,0.03)":"rgba(0,0,0,0.08)";ctx.strokeRect(px,py,cSz,cSz);}
}

// ═══ Half-stitch placement & marking helpers ═══
function _placeHalfStitch(idx, dir, colorEntry) {
  const m = pat[idx];
  // Block placing on full cross if full cross exists and is not skip/empty
  if (m && m.id !== "__skip__" && m.id !== "__empty__") {
    // Check if it already has a full stitch and half tool is being used to place on it
    // This is allowed — half stitches overlay full stitches
  }

  const newHs = new Map(halfStitches);
  const existing = newHs.get(idx) || {};

  // If same direction already exists with same colour, remove it (toggle)
  if (existing[dir] && existing[dir].id === colorEntry.id) {
    const entry = { ...existing };
    delete entry[dir];
    if (!entry.fwd && !entry.bck) newHs.delete(idx);
    else newHs.set(idx, entry);
    setHalfStitches(newHs);
    renderStitch();
    return;
  }

  // Check if placing two same-colour halves (would equal a full cross)
  const otherDir = dir === "fwd" ? "bck" : "fwd";
  if (existing[otherDir] && existing[otherDir].id === colorEntry.id) {
    setHalfToast({ idx, msg: "This equals a full cross stitch. Convert?", colorId: colorEntry.id, dir });
    // Still place it, but show toast
  }

  existing[dir] = { id: colorEntry.id, rgb: colorEntry.rgb, lab: colorEntry.lab, name: colorEntry.name, type: colorEntry.type || "solid" };
  newHs.set(idx, { ...existing });
  setHalfStitches(newHs);

  // Mark that user has placed a half stitch
  if (!halfEverPlaced.current) {
    halfEverPlaced.current = true;
  }

  renderStitch();
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

  // ═══ Half Stitch Tool handling ═══
  if(halfStitchTool&&halfStitchTool!=="erase"&&stitchMode==="track"){
    // Placing a half stitch — need a selected colour
    if(!selectedColorId||!cmap||!cmap[selectedColorId]){
      // If no color selected, use the colour of the cell beneath
      const m=pat[idx];
      if(m&&m.id!=="__skip__"&&m.id!=="__empty__"&&cmap&&cmap[m.id]){
        // Place half stitch using the cell's own colour
        _placeHalfStitch(idx,halfStitchTool,m);
      }
    } else {
      // Use the selected colour — but block placing on skip/empty cells
      const m2=pat[idx];
      if(m2&&(m2.id==="__skip__"||m2.id==="__empty__")){
        e.preventDefault();return;
      }
      const pe=cmap[selectedColorId];
      _placeHalfStitch(idx,halfStitchTool,pe);
    }
    e.preventDefault();
    return;
  }
  if(halfStitchTool==="erase"&&stitchMode==="track"){
    // Erasing: remove the half stitch in this cell for active direction
    const hs=halfStitches.get(idx);
    if(hs){
      const newHs=new Map(halfStitches);
      const entry={...hs};
      // Try to determine which direction to erase based on click position
      const rect=stitchRef.current.getBoundingClientRect();
      const localX=e.clientX-rect.left-G-gx*scs;
      const localY=e.clientY-rect.top-G-gy*scs;
      const hitDir=hitTestHalfStitch(localX,localY,scs,6);
      if(hitDir==="ambiguous"){
        // Erase both if ambiguous
        newHs.delete(idx);
        const newHd=new Map(halfDone);
        newHd.delete(idx);
        setHalfDone(newHd);
      } else {
        delete entry[hitDir];
        if(!entry.fwd&&!entry.bck) newHs.delete(idx);
        else newHs.set(idx,entry);
        const newHd=new Map(halfDone);
        const hd=newHd.get(idx)||{};
        delete hd[hitDir];
        if(!hd.fwd&&!hd.bck) newHd.delete(idx);
        else newHd.set(idx,hd);
        setHalfDone(newHd);
      }
      setHalfStitches(newHs);
      renderStitch();
    }
    e.preventDefault();
    return;
  }

  // ═══ Tracker: Marking half stitches as done (no tool, track mode) ═══
  // If cell has half stitches and NO full stitch (or full is done), handle half marking
  const cellHasHalf=halfStitches.has(idx);
  const m2=pat[idx];
  const isFullCell=m2&&m2.id!=="__skip__"&&m2.id!=="__empty__";

  if(cellHasHalf&&(!isFullCell||(done&&done[idx]))&&!halfStitchTool){
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

  // ═══ Shift+Click range fill ═══
  if(e.shiftKey&&lastClickedRef.current&&!halfStitchTool&&stitchMode==="track"){
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
      let name="";
      if(cell.type==="blend"){
        name=cell.threads[0].name+"+"+cell.threads[1].name;
      }else{
        let t=DMC.find(d=>d.id===cell.id);
        if(t) name=t.name;
      }
      setHoverInfo({row:gc.gy+1, col:gc.gx+1, id:cell.id, name:name, x:e.clientX, y:e.clientY});
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
      if(rangeModeActive&&!halfStitchTool){
        const gx=idx%sW,gy=Math.floor(idx/sW);
        if(!rangeAnchor){
          // First tap sets anchor
          const nv=ts.tapVal;
          setRangeAnchor({idx,row:gy,col:gx,val:nv});
        }else{
          // Second tap fills rectangle
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
            setDone(new Uint8Array(done));
            renderStitch();
          }
        }
      }else{
        const nv=ts.tapVal;
        const nd=new Uint8Array(done);
        nd[idx]=nv;
        pushTrackHistory([{idx,oldVal:done[idx]}]);
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
      if(halfMenuOpen){setHalfMenuOpen(false);return;}
      if(halfStitchTool){setHalfStitchTool(null);return;}
      if(halfToast){setHalfToast(null);return;}
      if(tOverflowOpen){setTOverflowOpen(false);return;}
      if(focusColour&&stitchView==="highlight"){setFocusColour(null);return;}
      if(drawer){setDrawer(false);return;}
      return;
    }
    if(e.key==="?"){setModal(m=>m==="shortcuts"?null:"shortcuts");return;}
    if(!isEditMode){
      if(e.key==="t"||e.key==="T"){setStitchMode("track");setHalfStitchTool(null);return;}
      if(e.key==="n"||e.key==="N"){setStitchMode("navigate");setHalfStitchTool(null);return;}
      if(e.key==="v"||e.key==="V"){
        const nextView=stitchView==="symbol"?"colour":stitchView==="colour"?"highlight":"symbol";
        setStitchView(nextView);
        if(nextView==="highlight"&&!focusColour){const first=focusableColors.find(p=>{const dc=colourDoneCounts[p.id];return !dc||dc.done<dc.total;})||focusableColors[0];if(first)setFocusColour(first.id);}
        return;
      }
    }
    if(e.key==="d"||e.key==="D"){setDrawer(d=>!d);return;}
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
},[stitchView,isEditMode,focusableColors,isActive,namePromptOpen,modal,showExitEditModal,cellEditPopover,importDialog,halfMenuOpen,tOverflowOpen,drawer,halfDisambig,halfStitchTool,halfToast,focusColour,pat,pal,undoSnapshot,colourDoneCounts,trackHistory,redoStack,highlightMode]);

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
// Half-stitch menu close on outside click
useEffect(()=>{
  if(!halfMenuOpen)return;
  function close(e){if(halfMenuRef.current&&!halfMenuRef.current.contains(e.target))setHalfMenuOpen(false);}
  document.addEventListener('mousedown',close);
  return()=>document.removeEventListener('mousedown',close);
},[halfMenuOpen]);
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
<Header page="tracker" onOpen={()=>loadRef.current.click()} onSave={pat?saveProject:null} onExportPDF={pat?()=>setModal('pdf_export'):null} onNewProject={pat?()=>{if(confirm("Start fresh? Your current project is auto-saved.")){if(typeof ProjectStorage!=='undefined')ProjectStorage.clearActiveProject();else localStorage.removeItem("crossstitch_active_project");if(onGoHome){onGoHome();}else{window.location.href='index.html';}}}:null} setModal={setModal} />
{pat&&pal&&<ContextBar
  name={projectName || (sW + '×' + sH + ' pattern')}
  dimensions={pat ? {width:sW, height:sH} : null}
  palette={pal}
  pct={totalStitchable>0 ? Math.round(doneCount/totalStitchable*100) : 0}
  page="tracker"
  onEdit={handleEditInCreator}
  onSave={saveProject}
  onHome={()=>{if(onGoHome){onGoHome();}else if(typeof window.__goHome!=='undefined'){window.__goHome();}else if(typeof window.__switchToDesign!=='undefined'){window.__switchToDesign();}else{window.location.href='index.html';}}}
  onNameChange={n=>setProjectName(n)}
/>}
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
    <button className={"tb-btn"+(stitchMode==="track"&&!halfStitchTool?" tb-btn--green":"")} onClick={()=>{setStitchMode("track");setHalfStitchTool(null);}} title="Cross stitch (T)">
      <svg width="11" height="11" viewBox="0 0 12 12"><line x1="1" y1="11" x2="11" y2="1" stroke="currentColor" strokeWidth="1.8"/><line x1="1" y1="1" x2="11" y2="11" stroke="currentColor" strokeWidth="1.8"/></svg>Cross
    </button>
    <div ref={halfMenuRef} style={{position:"relative",display:"inline-flex"}}>
      <button className={"tb-btn"+((halfStitchTool==="fwd"||halfStitchTool==="bck"||halfStitchTool==="erase")?" tb-btn--blue":"")} onClick={()=>setHalfMenuOpen(o=>!o)} title="Half stitch tools">
        <svg width="11" height="11" viewBox="0 0 12 12"><line x1="1" y1="11" x2="11" y2="1" stroke="currentColor" strokeWidth="1.8"/></svg>Half{halfStitchTool&&halfStitchTool!=="erase"?(halfStitchTool==="fwd"?" /":"\\"):" ▾"}
      </button>
      {halfMenuOpen&&<div className="tb-page-dropdown" style={{top:"calc(100% + 4px)",left:0,minWidth:130,zIndex:202}}>
        <button className={"tb-page-dropdown-item"+(halfStitchTool==="fwd"?" tb-page-dropdown-item--on":"")} onClick={()=>{if(halfStitchTool==="fwd"){setHalfStitchTool(null);setStitchMode("track");}else{setHalfStitchTool("fwd");setStitchMode("track");if(!halfOnboardingDone&&!showHalfOnboarding){setShowHalfOnboarding(true);setHalfOnboardingStep(0);}}setHalfMenuOpen(false);}}>
          <svg width="10" height="10" viewBox="0 0 12 12" style={{marginRight:4,verticalAlign:"middle"}}><line x1="1" y1="11" x2="11" y2="1" stroke="currentColor" strokeWidth="1.8"/></svg>Half /
        </button>
        <button className={"tb-page-dropdown-item"+(halfStitchTool==="bck"?" tb-page-dropdown-item--on":"")} onClick={()=>{if(halfStitchTool==="bck"){setHalfStitchTool(null);setStitchMode("track");}else{setHalfStitchTool("bck");setStitchMode("track");if(!halfOnboardingDone&&!showHalfOnboarding){setShowHalfOnboarding(true);setHalfOnboardingStep(0);}}setHalfMenuOpen(false);}}>
          <svg width="10" height="10" viewBox="0 0 12 12" style={{marginRight:4,verticalAlign:"middle"}}><line x1="1" y1="1" x2="11" y2="11" stroke="currentColor" strokeWidth="1.8"/></svg>Half \
        </button>
        <button className={"tb-page-dropdown-item"+(halfStitchTool==="erase"?" tb-page-dropdown-item--on":"")} onClick={()=>{if(halfStitchTool==="erase"){setHalfStitchTool(null);setStitchMode("track");}else{setHalfStitchTool("erase");setStitchMode("track");}setHalfMenuOpen(false);}}>
          <svg width="10" height="10" viewBox="0 0 12 12" style={{marginRight:4,verticalAlign:"middle"}}><line x1="2" y1="2" x2="10" y2="10" stroke="currentColor" strokeWidth="1.5"/><line x1="10" y1="2" x2="2" y2="10" stroke="currentColor" strokeWidth="1.5"/></svg>Erase half
        </button>
      </div>}
    </div>
    <button className={"tb-btn"+(stitchMode==="navigate"?" tb-btn--on":"")} onClick={()=>{setStitchMode("navigate");setHalfStitchTool(null);}} title="Navigate (N)">Nav</button>
    {stitchMode==="track"&&!halfStitchTool&&<button className={"tb-btn"+(rangeModeActive?" tb-btn--blue":"")} onClick={()=>{setRangeModeActive(r=>!r);setRangeAnchor(null);}} title="Range select mode">⊞ Range</button>}
  </div>
  {(halfStitchTool==="fwd"||halfStitchTool==="bck")&&selectedColorId&&cmap&&cmap[selectedColorId]&&
    <span style={{fontSize:11,display:"flex",alignItems:"center",gap:3,padding:"2px 7px",borderRadius:6,background:"#e0f2fe",flexShrink:0,border:"1px solid #7dd3fc"}}>
      <span style={{width:10,height:10,borderRadius:2,background:`rgb(${cmap[selectedColorId].rgb})`,border:"1px solid #cbd5e1",display:"inline-block"}}/>{selectedColorId}
    </span>}
  <div className="tb-sdiv"/>
  <div className={"tb-grp"+(tStripCollapsed.view?" tb-hidden":"")}>
    {[['symbol','Sym'],['colour','Col+Sym'],['highlight','HL']].map(([k,l])=><button key={k} className={"tb-btn"+(stitchView===k?" tb-btn--on":"")} title="Cycle view (V)" onClick={()=>{setStitchView(k);if(k!=="highlight"){setFocusColour(null);}else if(!focusColour){const first=pal.find(p=>{const dc=colourDoneCounts[p.id];return !dc||dc.done<dc.total;})||pal[0];if(first)setFocusColour(first.id);}}}>{l}</button>)}
  </div>
  {stitchView==="highlight"&&<>
    <button className="tb-btn" onClick={()=>{if(!focusableColors.length)return;const idx=focusableColors.findIndex(p=>p.id===focusColour);const prev=focusableColors[(idx<=0?focusableColors.length:idx)-1];setFocusColour(prev.id);}} title="Previous colour (])">◀</button>
    <button className="tb-btn" onClick={()=>{if(!focusableColors.length)return;const idx=focusableColors.findIndex(p=>p.id===focusColour);const next=focusableColors[(idx+1)%focusableColors.length];setFocusColour(next.id);}} title="Next colour ([)">▶</button>
  </>}
  <div className="tb-flex"/>
  <div className="tb-zoom-grp">
    <span className="tb-zoom-lbl">Zoom</span>
    <button onClick={()=>setStitchZoom(z=>Math.max(0.3,+(z-0.25).toFixed(2)))} title="Zoom out" style={{padding:"0 5px",fontSize:15,border:"0.5px solid #e2e8f0",borderRadius:4,background:"#f8f9fa",cursor:"pointer",lineHeight:"22px",fontWeight:600}}>−</button>
    <input type="range" min={0.1} max={3} step={0.05} value={stitchZoom} onChange={e=>setStitchZoom(Number(e.target.value))} style={{width:55}}/>
    <button onClick={()=>setStitchZoom(z=>Math.min(4,+(z+0.25).toFixed(2)))} title="Zoom in" style={{padding:"0 5px",fontSize:15,border:"0.5px solid #e2e8f0",borderRadius:4,background:"#f8f9fa",cursor:"pointer",lineHeight:"22px",fontWeight:600}}>+</button>
    <span className="tb-zoom-pct">{Math.round(stitchZoom*100)}%</span>
    <button className="tb-fit-btn" onClick={fitSZ}>Fit</button>
  </div>
  <div className="tb-sdiv"/>
  {liveAutoStitches > 0 && (
    <div className="tb-btn" style={{flexShrink:0, background: liveAutoIsPaused ? '#fef3c7' : '#f0fdf4', border: '1px solid ' + (liveAutoIsPaused ? '#fde68a' : '#bbf7d0'), color: liveAutoIsPaused ? '#b45309' : '#16a34a', cursor: 'default'}} title="Session is automatically tracked">
      {liveAutoIsPaused ? <>{Icons.pause()} Paused</> : <>{Icons.dot()} {fmtTime(liveAutoElapsed)} · {liveAutoStitches} st</>}
    </div>
  )}
  <div className="tb-sdiv"/>
  <button className={"tb-btn"+(statsView?" tb-btn--on":"")} onClick={()=>{finaliseAutoSession();setStatsView(v=>!v);}} title="Stats dashboard" style={{flexShrink:0}}>{Icons.barChart()}</button>
  {stitchMode==="track"&&!isEditMode&&(trackHistory.length>0||redoStack.length>0)&&<>
    <div className="tb-sdiv"/>
    <button className="tb-btn" onClick={undoTrack} disabled={!trackHistory.length} title="Undo (Ctrl+Z)" style={{opacity:trackHistory.length?1:0.3}}>↩</button>
    <button className="tb-btn" onClick={redoTrack} disabled={!redoStack.length} title="Redo (Ctrl+Y)" style={{opacity:redoStack.length?1:0.3}}>↪</button>
  </>}
  <div className="tb-sdiv"/>
  <div className="tb-overflow-wrap" ref={tOverflowRef}>
    <button className="tb-overflow-btn" onClick={()=>setTOverflowOpen(o=>!o)} title="More options">···</button>
    {tOverflowOpen&&<div className="tb-overflow-menu">
      {!isEditMode&&<>
        {tStripCollapsed.stitch&&<><span className="tb-ovf-lbl">Stitch</span>
          <button className={"tb-ovf-item"+(stitchMode==="track"&&!halfStitchTool?" tb-ovf-item--on":"")} onClick={()=>{setStitchMode("track");setHalfStitchTool(null);setTOverflowOpen(false);}}>Cross{stitchMode==="track"&&!halfStitchTool?" ✓":""}</button>
          <button className={"tb-ovf-item"+(halfStitchTool==="fwd"?" tb-ovf-item--on":"")} onClick={()=>{setHalfStitchTool("fwd");setStitchMode("track");setTOverflowOpen(false);}}>Half /{halfStitchTool==="fwd"?" ✓":""}</button>
          <button className={"tb-ovf-item"+(halfStitchTool==="bck"?" tb-ovf-item--on":"")} onClick={()=>{setHalfStitchTool("bck");setStitchMode("track");setTOverflowOpen(false);}}>Half \{halfStitchTool==="bck"?" ✓":""}</button>
          <button className={"tb-ovf-item"+(stitchMode==="navigate"?" tb-ovf-item--on":"")} onClick={()=>{setStitchMode("navigate");setHalfStitchTool(null);setTOverflowOpen(false);}}>Navigate{stitchMode==="navigate"?" ✓":""}</button>
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
        {done&&doneCount>0&&<button className="tb-ovf-item" style={{color:"#dc2626"}} onClick={()=>{if(confirm("Clear all progress?")){setDone(new Uint8Array(pat.length));setTrackHistory([]);setRedoStack([]);}setTOverflowOpen(false);}}>Reset progress</button>}
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
    <div className={"session-chip" + (liveAutoIsPaused ? " session-chip--paused" : "")} title="Session is automatically tracked">
      <span className="dot"/>
      {liveAutoIsPaused ? 'Paused' : `${fmtTime(liveAutoElapsed)} · ${liveAutoStitches} stitches`}
    </div>
  )}
</div></div>
{!isEditMode&&<div className="tb-progress"><div className="tb-progress-inner">
  <span className="tb-progress-txt">{doneCount.toLocaleString()} / {totalStitchable.toLocaleString()}{halfStitchCounts.total>0?` + ${halfStitchCounts.done}/${halfStitchCounts.total}△`:""} ({progressPct.toFixed(1)}%){progressPct>=100?<> {Icons.star()}</>:null}</span>
  <div className="tb-progress-bar"><div className={progressPct>=100?"tb-progress-fill tb-progress-fill--done":"tb-progress-fill"} style={{width:Math.min(progressPct,100)+"%"}}/></div>
  <span className="tb-progress-rem">{progressPct>=100?"Complete!":Math.ceil(combinedTotal-combinedDone).toLocaleString()+" remaining"}</span>
</div></div>}
{!isEditMode&&<MiniStatsBar statsSessions={statsSessions} totalCompleted={doneCount} totalStitches={totalStitchable} statsSettings={statsSettings} onOpenStats={()=>{finaliseAutoSession();setStatsView(true);}} currentAutoSession={currentAutoSessionRef.current}/>}
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

  {statsView&&pat&&<StatsDashboard statsSessions={statsSessions} statsSettings={statsSettings} totalCompleted={doneCount} totalStitches={totalStitchable} onEditNote={editSessionNote} onUpdateSettings={setStatsSettings} onClose={()=>setStatsView(false)} projectName={projectName||(sW+'\u00D7'+sH+' pattern')} palette={pal} colourDoneCounts={colourDoneCounts}/>}

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

    {isEditMode && <div style={{fontSize:12,color:"#d97706",background:"#fffbeb",padding:"6px 14px",borderRadius:8,marginBottom:6,border:"1px solid #fde68a", fontWeight: 600}}>EDITING — <span style={{fontWeight:400}}>Tap a <b>stitch on the grid</b> to edit that cell only · Tap a <b>colour in the list below</b> to reassign all stitches of that colour</span></div>}
    {!shortcutsHintDismissed&&pat&&!isEditMode&&<div style={{fontSize:12,color:"#6b7280",background:"#f9fafb",padding:"5px 14px",borderRadius:8,marginBottom:6,border:"0.5px solid #e2e8f0",display:"flex",justifyContent:"space-between",alignItems:"center",gap:8}}><span>{Icons.lightbulb()} Press <kbd>?</kbd> for keyboard shortcuts</span><button onClick={()=>{localStorage.setItem("shortcuts_hint_dismissed","1");setShortcutsHintDismissed(true);}} style={{background:"none",border:"none",cursor:"pointer",color:"#9ca3af",fontSize:15,lineHeight:1,padding:0}}>×</button></div>}
    {!isEditMode && stitchMode==="track"&&!halfStitchTool&&<div style={{fontSize:12,color:"#0d9488",background:"#f0fdfa",padding:"6px 14px",borderRadius:8,marginBottom:6,border:"0.5px solid #99f6e4"}}>{hasTouchRef.current?"Tap to mark cross stitches · Drag to pan · Pinch to zoom":"Click or drag to mark/unmark cross stitches · Space+drag to pan · Ctrl+scroll to zoom · Ctrl+Z undo"}{trackHistory.length>0?` · ${trackHistory.length} undo step${trackHistory.length>1?"s":""} available`:""}</div>}
    {!isEditMode && halfStitchTool&&halfStitchTool!=="erase"&&<div style={{fontSize:12,color:"#0284c7",background:"#e0f2fe",padding:"6px 14px",borderRadius:8,marginBottom:6,border:"0.5px solid #7dd3fc"}}>
      <strong>Half stitch {halfStitchTool==="fwd"?"/":"\\"}</strong> — {hasTouchRef.current?"Tap":"Click"} a cell to place{selectedColorId&&cmap&&cmap[selectedColorId]?` using DMC ${selectedColorId}`:" using cell colour"}. {hasTouchRef.current?"Tap":"Click"} again to remove. Counts as 0.5 stitch.
    </div>}
    {!isEditMode && halfStitchTool==="erase"&&<div style={{fontSize:12,color:"#dc2626",background:"#fef2f2",padding:"6px 14px",borderRadius:8,marginBottom:6,border:"0.5px solid #fecaca"}}><strong>Erase mode</strong> — {hasTouchRef.current?"Tap":"Click"} a cell to remove all half stitches from it.</div>}
    {!isEditMode && stitchMode==="navigate"&&<div style={{fontSize:12,color:"#1e293b",background:"#f1f5f9",padding:"6px 14px",borderRadius:8,marginBottom:6,border:"0.5px solid #e2e8f0"}}>{selectedColorId?"Click to park. Shift+click to move guide.":"Click to place guide crosshair"}{hasTouchRef.current?"":" · T for track mode"}</div>}
    {advanceToast&&<div style={{fontSize:12,color:"#16a34a",background:"#f0fdf4",padding:"6px 14px",borderRadius:8,marginBottom:6,border:"1px solid #bbf7d0",fontWeight:600}}>✓ Complete! Next: {advanceToast}</div>}

    {/* Half stitch onboarding walkthrough */}
    {showHalfOnboarding&&!halfOnboardingDone&&<div className="hs-scale-in" style={{fontSize:12,background:"#e0f2fe",padding:"10px 14px",borderRadius:8,marginBottom:6,border:"1px solid #7dd3fc"}}>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:6}}>
        <span style={{fontWeight:700,color:"#0284c7"}}>Half Stitch Tool — Step {halfOnboardingStep+1} of 3</span>
        <button onClick={()=>{setShowHalfOnboarding(false);setHalfOnboardingDone(true);}} style={{background:"none",border:"none",color:"#0284c7",cursor:"pointer",fontSize:11,fontWeight:600}}>Got it</button>
      </div>
      <div style={{color:"#0c4a6e"}}>
        {halfOnboardingStep===0&&"Select a half stitch direction — / or \\"}
        {halfOnboardingStep===1&&"Tap a cell to place. The coloured triangle shows which half is covered."}
        {halfOnboardingStep===2&&"Tap again to remove. You can place both directions in one cell."}
      </div>
      {halfOnboardingStep<2&&<button onClick={()=>setHalfOnboardingStep(s=>s+1)} style={{marginTop:6,fontSize:11,padding:"3px 12px",borderRadius:6,border:"1px solid #7dd3fc",background:"#f0f9ff",color:"#0284c7",cursor:"pointer",fontWeight:600}}>Next →</button>}
      {halfOnboardingStep===2&&<button onClick={()=>{setShowHalfOnboarding(false);setHalfOnboardingDone(true);}} style={{marginTop:6,fontSize:11,padding:"3px 12px",borderRadius:6,border:"1px solid #7dd3fc",background:"#0284c7",color:"#fff",cursor:"pointer",fontWeight:600}}>Got it</button>}
    </div>}

    {/* Half stitch same-colour toast */}
    {halfToast&&<div className="hs-scale-in" style={{fontSize:12,color:"#d97706",background:"#fffbeb",padding:"6px 14px",borderRadius:8,marginBottom:6,border:"1px solid #fde68a",display:"flex",alignItems:"center",gap:8}}>
      <span>{halfToast.msg}</span>
      <button onClick={()=>{
        // Convert two halves to a full cross
        const newHs=new Map(halfStitches);
        newHs.delete(halfToast.idx);
        setHalfStitches(newHs);
        setHalfDone(prev=>{
          const newHd=new Map(prev);
          newHd.delete(halfToast.idx);
          return newHd;
        });
        // The cell already has the full stitch colour from pat[]
        setHalfToast(null);
        renderStitch();
      }} style={{fontSize:11,padding:"2px 10px",borderRadius:6,border:"1px solid #fde68a",background:"#fff",color:"#d97706",cursor:"pointer",fontWeight:600}}>Convert</button>
      <button onClick={()=>setHalfToast(null)} style={{fontSize:11,padding:"2px 10px",borderRadius:6,border:"1px solid #e2e8f0",background:"#fff",color:"#475569",cursor:"pointer"}}>Keep</button>
    </div>}

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
          <canvas ref={stitchRef} style={{display:"block",position:"relative",zIndex:2, marginTop: -G, marginLeft: -G, touchAction:"none"}} onMouseDown={handleStitchMouseDown} onMouseMove={handleStitchMouseMove} onContextMenu={e=>e.preventDefault()}/>

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
    </div>{/* end canvas-area */}

    {/* ═══ RIGHT PANEL ═══ */}
    <div className="rpanel">
      {/* Session Stats */}
      <div className="rp-section">
        <div className="rp-heading">Session {liveAutoStitches>0&&<span className="badge">Live</span>}</div>
        <div className="sess-card">
          <div className="row"><span className="lbl">Time</span><span className="val">{fmtTime(liveAutoElapsed)}</span></div>
          <div className="row"><span className="lbl">Stitches</span><span className="val">{liveAutoStitches}</span></div>
          {liveAutoStitches>0&&liveAutoElapsed>0&&<div className="row"><span className="lbl">Speed</span><span className="val">{(liveAutoStitches/(liveAutoElapsed/60)).toFixed(1)} st/min</span></div>}
          <div className="row"><span className="lbl">Total time</span><span className="val">{fmtTime(totalTime+liveAutoElapsed)}</span></div>
        </div>
      </div>

      {/* View Mode */}
      <div className="rp-section">
        <div className="rp-heading">View</div>
        <div className="rp-pill-toggle" style={{marginBottom:8}}>
          {[['symbol','Symbol'],['colour','Colour'],['highlight','Highlight']].map(([k,l])=>
            <button key={k} className={stitchView===k?"on":""} onClick={()=>{setStitchView(k);if(k!=="highlight"){setFocusColour(null);}else if(!focusColour){const first=pal.find(p=>{const dc=colourDoneCounts[p.id];return !dc||dc.done<dc.total;})||pal[0];if(first)setFocusColour(first.id);}}}>{l}</button>
          )}
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
      </div>

      {/* Colours List */}
      <div className="rp-section" style={{flex:1,overflow:"hidden",display:"flex",flexDirection:"column"}}>
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
              else if(halfStitchTool&&halfStitchTool!=="erase"){setSelectedColorId(selectedColorId===p.id?null:p.id);}
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
      </div>

      {/* Quick Actions */}
      <div className="rp-section">
        <div className="rp-heading">Actions</div>
        <div style={{display:"flex",flexWrap:"wrap",gap:4}}>
          <button className="g-btn" style={{flex:1,justifyContent:"center",fontSize:10,padding:"5px 8px",display:"inline-flex",alignItems:"center",gap:5,border:"1px solid #e2e8f0",background:"#fff",borderRadius:8,cursor:"pointer",color:"#475569",fontWeight:600,fontFamily:"inherit"}} onClick={()=>{copyProgressSummary();}}>{Icons.clipboard()} Summary</button>
          <button className="g-btn" style={{flex:1,justifyContent:"center",fontSize:10,padding:"5px 8px",display:"inline-flex",alignItems:"center",gap:5,border:"1px solid #e2e8f0",background:"#fff",borderRadius:8,cursor:"pointer",color:"#475569",fontWeight:600,fontFamily:"inherit"}} onClick={handleEditInCreator}>{Icons.pencil()} Edit</button>
        </div>
      </div>
    </div>{/* end rpanel */}
  </div>{/* end cs-main */}

  <div style={{maxWidth:1100, margin:"0 auto", padding:"12px 16px"}}>
    <div style={{display:"flex",flexDirection:"column",gap:12}}>
      <Section title="Thread Organiser">
        <div style={{marginTop:8,display:"flex",gap:12,marginBottom:10}}>
          <div style={{padding:"6px 14px",background:"#f0fdf4",borderRadius:8,border:"1px solid #bbf7d0",fontSize:12}}><span style={{fontWeight:700,color:"#16a34a"}}>{ownedCount}</span> <span style={{color:"#475569"}}>owned</span></div>
          <div style={{padding:"6px 14px",background:"#fff7ed",borderRadius:8,border:"1px solid #fed7aa",fontSize:12}}><span style={{fontWeight:700,color:"#ea580c"}}>{toBuyList.length}</span> <span style={{color:"#475569"}}>to buy</span></div>
          <div style={{marginLeft:"auto",display:"flex",gap:4}}>
            <button onClick={()=>setModal("calculator_batch")} style={{fontSize:11,padding:"4px 10px",border:"0.5px solid #99f6e4",borderRadius:6,background:"#f0fdfa",color:"#0d9488",cursor:"pointer"}}>Calculate thread needed</button>
            <button onClick={()=>{if(!confirm("Mark all "+skeinData.length+" threads as owned?"))return;let n={};skeinData.forEach(d=>{n[d.id]="owned";});setThreadOwned(n);}} style={{fontSize:11,padding:"4px 10px",border:"1px solid #bbf7d0",borderRadius:6,background:"#f0fdf4",color:"#16a34a",cursor:"pointer"}}>Own all</button>
            <button onClick={()=>{if(!confirm("Clear all thread ownership status?"))return;setThreadOwned({});}} style={{fontSize:11,padding:"4px 10px",border:"0.5px solid #e2e8f0",borderRadius:6,background:"#fff",color:"#475569",cursor:"pointer"}}>Clear</button>
          </div>
        </div>
        <div style={{display:"flex",flexDirection:"column",gap:2,maxHeight:320,overflow:"auto"}}>
          {skeinData.map(d=>{
            let st=threadOwned[d.id]||"";
            let isOwned=st==="owned";
            let gs=globalStash[d.id]||{owned:0};
            let hasStash=gs.owned>0;
            return<React.Fragment key={d.id}><div style={{display:"flex",alignItems:"center",gap:8,padding:"4px 8px",borderRadius:6,background:isOwned?"#f0fdf4":"#fff",border:"1px solid "+(isOwned?"#bbf7d0":"#f1f5f9")}}>
              <span style={{width:16,height:16,borderRadius:3,background:`rgb(${d.rgb[0]},${d.rgb[1]},${d.rgb[2]})`,border:"1px solid #cbd5e1",flexShrink:0}}/>
              <span style={{fontWeight:700,fontSize:13,minWidth:44}}>DMC {d.id}</span>
              <span style={{fontSize:11,color:"#475569",flex:1,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{d.name}</span>
              <span style={{fontSize:11,color:"#94a3b8",flexShrink:0}}>{d.skeins}sk</span>
              <span className={"stash-badge"+(hasStash?" stash-badge--in":" stash-badge--out")} title={hasStash?`${gs.owned} in global stash`:"Not in global stash"}>{hasStash?`●${gs.owned}`:"○0"}</span>
              <button onClick={()=>toggleOwned(d.id)} style={{fontSize:11,padding:"3px 10px",borderRadius:5,border:"1px solid "+(isOwned?"#bbf7d0":"#fed7aa"),background:isOwned?"#f0fdf4":"#fff7ed",color:isOwned?"#16a34a":"#ea580c",cursor:"pointer",fontWeight:600,minWidth:55,textAlign:"center"}}>{isOwned?"Owned":"To buy"}</button>
              {typeof StashBridge!=="undefined"&&<button onClick={(e)=>{e.stopPropagation();setAltOpen(altOpen===d.id?null:d.id);}} style={{fontSize:10,padding:"2px 6px",borderRadius:4,border:"1px solid #e0e7ff",background:altOpen===d.id?"#e0e7ff":"#fff",color:"#4338ca",cursor:"pointer",fontWeight:600}} title="Show similar threads from stash">≈</button>}
            </div>
            {altOpen===d.id&&(()=>{const alts=StashBridge.suggestAlternatives(d.id,5,globalStash);return alts.length>0?<div style={{padding:"6px 12px 8px 36px",display:"flex",gap:6,flexWrap:"wrap",fontSize:11,alignItems:"center"}}><span style={{color:"#475569",fontWeight:600}}>Similar in stash:</span>{alts.map(a=><span key={a.id} style={{display:"inline-flex",alignItems:"center",gap:4,padding:"2px 8px",borderRadius:10,background:"#f0f0ff",border:"1px solid #e0e7ff"}}><span style={{width:10,height:10,borderRadius:2,background:`rgb(${a.rgb[0]},${a.rgb[1]},${a.rgb[2]})`,border:"1px solid #cbd5e1"}}/><span style={{fontWeight:600}}>DMC {a.id}</span><span style={{color:"#475569"}}>{a.name}</span><span style={{color:"#94a3b8"}}>ΔE {a.deltaE}</span><span style={{color:"#4338ca"}}>{a.owned}sk</span></span>)}</div>:<div style={{padding:"6px 12px 8px 36px",fontSize:11,color:"#94a3b8"}}>No similar threads found in your stash.</div>;})()}
            </React.Fragment>;})}
        </div>
        <div style={{display:"flex",gap:6,marginTop:10,flexWrap:"wrap"}}>
          <button onClick={()=>{let txt=toBuyList.map(d=>`DMC ${d.id} ${d.name} × ${d.skeins}`).join("\n");copyText(txt,"shopping");}} style={{padding:"8px 18px",fontSize:13,borderRadius:8,border:"none",background:"#0d9488",color:"#fff",cursor:"pointer",fontWeight:600}}>Copy To-Buy List</button>
          <button onClick={()=>{let txt=skeinData.map(d=>`DMC ${d.id} ${d.name} × ${d.skeins}`).join("\n");copyText(txt,"full");}} style={{padding:"8px 18px",fontSize:13,borderRadius:8,border:"0.5px solid #e2e8f0",background:"#fff",cursor:"pointer",fontWeight:500}}>Copy Full List</button>
          <button onClick={()=>{
            if(typeof StashBridge==="undefined")return;
            StashBridge.getGlobalStash().then(stash=>{
              setGlobalStash(stash);
              const shopping=[];
              for(const d of skeinData){
                const gs=stash[d.id]||{owned:0};
                const deficit=d.skeins-gs.owned;
                if(deficit>0) shopping.push({id:d.id,name:d.name,rgb:d.rgb,needed:d.skeins,owned:gs.owned,toBuy:deficit});
              }
              setKittingResult(shopping);
            }).catch(()=>{});
          }} style={{padding:"8px 18px",fontSize:13,borderRadius:8,border:"1px solid #d8b4fe",background:"#faf5ff",color:"#7c3aed",cursor:"pointer",fontWeight:600}}>Kit This Project</button>
        </div>
        {kittingResult&&<div style={{marginTop:10,padding:12,borderRadius:8,border:"1px solid #e9d5ff",background:"#faf5ff"}}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:8}}>
            <span style={{fontSize:13,fontWeight:700,color:"#7c3aed"}}>{kittingResult.length===0?"Fully kitted! You own everything needed.":"Shopping list from stash diff"}</span>
            <button onClick={()=>setKittingResult(null)} style={{background:"none",border:"none",color:"#94a3b8",cursor:"pointer",fontSize:16}}>×</button>
          </div>
          {kittingResult.length>0&&<>
            <div style={{display:"flex",flexDirection:"column",gap:2,maxHeight:200,overflow:"auto"}}>
              {kittingResult.map(d=><div key={d.id} style={{display:"flex",alignItems:"center",gap:8,padding:"4px 8px",borderRadius:6,background:"#fff",border:"1px solid #f1f5f9"}}>
                <span style={{width:14,height:14,borderRadius:3,background:`rgb(${d.rgb[0]},${d.rgb[1]},${d.rgb[2]})`,border:"1px solid #cbd5e1",flexShrink:0}}/>
                <span style={{fontWeight:600,fontSize:12}}>DMC {d.id}</span>
                <span style={{fontSize:11,color:"#475569",flex:1}}>{d.name}</span>
                <span style={{fontSize:11,color:"#94a3b8"}}>need {d.needed}, own {d.owned}</span>
                <span style={{fontSize:11,fontWeight:700,color:"#7c3aed"}}>buy {d.toBuy}</span>
              </div>)}
            </div>
            <div style={{display:"flex",gap:6,marginTop:8}}>
              <button onClick={()=>{let txt=kittingResult.map(d=>`DMC ${d.id} ${d.name} × ${d.toBuy} skeins`).join("\n");copyText(txt,"kit");}} style={{padding:"6px 14px",fontSize:12,borderRadius:6,border:"none",background:"#7c3aed",color:"#fff",cursor:"pointer",fontWeight:600}}>Copy List</button>
              <button onClick={()=>{
                Promise.all(kittingResult.map(d=>StashBridge.updateThreadToBuy(d.id,true))).then(()=>{
                  StashBridge.getGlobalStash().then(setGlobalStash).catch(()=>{});
                  alert("Marked "+kittingResult.length+" threads as to-buy in your global stash.");
                }).catch(()=>{});
              }} style={{padding:"6px 14px",fontSize:12,borderRadius:6,border:"1px solid #d8b4fe",background:"#fff",color:"#7c3aed",cursor:"pointer",fontWeight:600}}>Mark All To-Buy in Stash</button>
            </div>
          </>}
        </div>}
        {copied&&<div style={{marginTop:6,fontSize:12,color:"#16a34a",fontWeight:600}}>Copied!</div>}
      </Section>

      <Section title="Project Info">
        <div style={{marginTop:8,display:"grid",gridTemplateColumns:"1fr 1fr",gap:"8px 20px"}}>
          {[["Pattern size",`${sW} × ${sH} stitches`],["Total cells",(sW*sH).toLocaleString()],["Stitchable",totalStitchable.toLocaleString()],["Skipped",(sW*sH-totalStitchable).toLocaleString()],["Colours",`${pal.length} (${blendCount} blend${blendCount!==1?"s":""})`],["Skeins needed",`${totalSkeins} (at ${fabricCt}ct)`]].map(([l,v],i)=><div key={i}><div style={{fontSize:11,color:"#94a3b8",textTransform:"uppercase",fontWeight:600,marginBottom:2}}>{l}</div><div style={{fontSize:14,fontWeight:600,color:"#1e293b"}}>{v}</div></div>)}
        </div>
      </Section>
    </div>

    <div style={{marginTop:20, display:"flex", gap:10, justifyContent:"center", padding:"20px", borderTop:"0.5px solid #e2e8f0"}}>
      <button onClick={saveProject} style={{padding:"10px 20px",fontSize:14,borderRadius:8,border:"none",background:"#0d9488",color:"#fff",cursor:"pointer",fontWeight:600}}>Save Project (.json)</button>
      <button onClick={()=>loadRef.current.click()} style={{padding:"10px 20px",fontSize:14,borderRadius:8,border:"0.5px solid #e2e8f0",background:"#fff",cursor:"pointer",fontWeight:500}}>Load Different Project</button>
    </div>
  </div>
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
