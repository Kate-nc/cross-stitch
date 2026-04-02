const{useState,useRef,useCallback,useEffect,useMemo}=React;

function App(){
const[sW,setSW]=useState(80),[sH,setSH]=useState(80);
const[pat,setPat]=useState(null),[pal,setPal]=useState(null),[cmap,setCmap]=useState(null);
const[fabricCt,setFabricCt]=useState(14);
const[skeinPrice,setSkeinPrice]=useState(DEFAULT_SKEIN_PRICE);
const[stitchSpeed,setStitchSpeed]=useState(40);

const[loadError,setLoadError]=useState(null),[copied,setCopied]=useState(null);
const[modal,setModal]=useState(null);
const [pdfSettings, setPdfSettings] = useState({ chartStyle: 'symbols', cellSize: 3, paper: 'a4', orientation: 'portrait', gridInterval: 10, gridNumbers: true, centerMarks: true, legendLocation: 'separate', legendColumns: 2, coverPage: true, progressOverlay: false, separateBackstitch: false });
const showCtr=true;
const[bsLines,setBsLines]=useState([]);

const[done,setDone]=useState(null);
const[trackHistory,setTrackHistory]=useState([]);
const TRACK_HISTORY_MAX=50;

const[sessionActive,setSessionActive]=useState(false),[sessionStart,setSessionStart]=useState(null);
const[sessionStitches,setSessionStitches]=useState(0),[totalTime,setTotalTime]=useState(0);
const[sessionElapsed,setSessionElapsed]=useState(0),[sessions,setSessions]=useState([]);

const[stitchMode,setStitchMode]=useState("track"),[stitchView,setStitchView]=useState("symbol"),[stitchZoom,setStitchZoom]=useState(1);
const[drawer,setDrawer]=useState(false),[focusColour,setFocusColour]=useState(null);
const[parkMarkers,setParkMarkers]=useState([]);
const[hlRow,setHlRow]=useState(-1),[hlCol,setHlCol]=useState(-1);
const[isDragging,setIsDragging]=useState(false),[dragVal,setDragVal]=useState(1);
const dragChangesRef=useRef([]);

const[symbolMap,setSymbolMap]=useState({});

const[selectedColorId,setSelectedColorId]=useState(null);

const[hoverInfo,setHoverInfo]=useState(null);

const[isPanning,setIsPanning]=useState(false);
const panStart=useRef({x:0,y:0,scrollX:0,scrollY:0});
const stitchScrollRef=useRef(null);

const[threadOwned,setThreadOwned]=useState({});

const [importDialog, setImportDialog] = useState(null);
const [importImage, setImportImage] = useState(null);
const [importSuccess, setImportSuccess] = useState(null);
const [importMaxW, setImportMaxW] = useState(80);
const [importMaxH, setImportMaxH] = useState(80);
const [importMaxColours, setImportMaxColours] = useState(30);
const [importSkipBg, setImportSkipBg] = useState(false);
const [importBgThreshold, setImportBgThreshold] = useState(15);
const [importArLock, setImportArLock] = useState(true);

const prevDoneCount=useRef(0);
const loadRef=useRef(null),timerRef=useRef(null),stitchRef=useRef(null);
const G=28;

useEffect(()=>{
  if(sessionActive){
    timerRef.current=setInterval(()=>setSessionElapsed(Math.floor((Date.now()-sessionStart)/1000)),1000);
    const onBlur=()=>{clearInterval(timerRef.current);};
    const onFocus=()=>{timerRef.current=setInterval(()=>setSessionElapsed(Math.floor((Date.now()-sessionStart)/1000)),1000);};
    window.addEventListener("blur",onBlur);window.addEventListener("focus",onFocus);
    return()=>{clearInterval(timerRef.current);window.removeEventListener("blur",onBlur);window.removeEventListener("focus",onFocus);};
  }else{clearInterval(timerRef.current);}
},[sessionActive,sessionStart]);

const doneCount=useMemo(()=>{
  if(!done||!pat)return 0;
  let c=0;
  for(let i=0;i<done.length;i++){
    let d=done[i];
    if(d===0)continue;
    let m=pat[i];
    if(m&&m.type==="fractional"&&m.components){
      if(d&FRACTIONAL_DONE.TL) c+=0.25;
      if(d&FRACTIONAL_DONE.TR) c+=0.25;
      if(d&FRACTIONAL_DONE.BL) c+=0.25;
      if(d&FRACTIONAL_DONE.BR) c+=0.25;
      if(d&FRACTIONAL_DONE.HALF_FWD) c+=0.5;
      if(d&FRACTIONAL_DONE.HALF_BACK) c+=0.5;
    }else if(d&FRACTIONAL_DONE.FULL){
      c+=1;
    }
  }
  return c;
},[done,pat]);
const totalStitchable=useMemo(()=>{
  if(!pat)return 0;
  let c=0;
  for(let i=0;i<pat.length;i++){
    let m=pat[i];
    if(m.id!=="__skip__"){
      if(m.type==="fractional"&&m.components){
         m.components.forEach(comp=>{ c+=(comp.type==="half"?0.5:0.25); });
      }else{ c++; }
    }
  }
  return c;
},[pat]);
const progressPct=totalStitchable>0?Math.round(doneCount/totalStitchable*1000)/10:0;
useEffect(()=>{if(sessionActive&&done){let diff=doneCount-prevDoneCount.current;if(diff>0)setSessionStitches(p=>p+diff);}prevDoneCount.current=doneCount;},[doneCount,sessionActive,done]);
const colourDoneCounts=useMemo(()=>{
  if(!pat||!done)return{};
  let c={};
  for(let i=0;i<pat.length;i++){
    let m=pat[i];
    if(m.id==="__skip__")continue;
    if(m.type==="fractional"&&m.components){
       m.components.forEach(comp=>{
          let id=comp.id;
          if(!c[id])c[id]={total:0,done:0};
          let vol = comp.type==="half"?0.5:0.25;
          c[id].total+=vol;
          let d=done[i];
          if(comp.type==="half"){
             if(comp.orientation==="forwardslash" && (d&FRACTIONAL_DONE.HALF_FWD)) c[id].done+=vol;
             else if(comp.orientation==="backslash" && (d&FRACTIONAL_DONE.HALF_BACK)) c[id].done+=vol;
          }else{
             let p=comp.path.start;
             if(p[0]===0&&p[1]===0 && (d&FRACTIONAL_DONE.TL)) c[id].done+=vol;
             else if(p[0]===2&&p[1]===0 && (d&FRACTIONAL_DONE.TR)) c[id].done+=vol;
             else if(p[0]===0&&p[1]===2 && (d&FRACTIONAL_DONE.BL)) c[id].done+=vol;
             else if(p[0]===2&&p[1]===2 && (d&FRACTIONAL_DONE.BR)) c[id].done+=vol;
          }
       });
    }else{
       let id=m.id;
       if(!c[id])c[id]={total:0,done:0};
       c[id].total++;
       if(done[i]&FRACTIONAL_DONE.FULL)c[id].done++;
    }
  }
  return c;
},[pat,done]);
const estCompletion=useMemo(()=>{let t=totalTime+(sessionActive?sessionElapsed:0);if(doneCount<1||t<60)return null;return Math.round((totalStitchable-doneCount)*(t/doneCount));},[totalTime,sessionElapsed,sessionActive,doneCount,totalStitchable]);
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

const totalSkeins=useMemo(()=>skeinData.reduce((s,d)=>s+d.skeins,0),[skeinData]);
const blendCount=useMemo(()=>pal?pal.filter(p=>p.type==="blend").length:0,[pal]);

function toggleSession(){if(sessionActive){let el=Math.floor((Date.now()-sessionStart)/1000);setTotalTime(p=>p+el);setSessions(p=>[...p,{stitches:sessionStitches,time:el,date:Date.now()}]);setSessionActive(false);setSessionStart(null);setSessionStitches(0);setSessionElapsed(0);}else{setSessionActive(true);setSessionStart(Date.now());setSessionStitches(0);setSessionElapsed(0);prevDoneCount.current=doneCount;}}
function markColourDone(cid,md){
  if(!pat||!done)return;
  let changes=[];
  let nd=new Uint8Array(done);
  for(let i=0;i<pat.length;i++){
     let m=pat[i];
     if(m.id==="__skip__")continue;
     let oldVal = nd[i];
     if(m.type==="fractional"&&m.components){
        let newVal = oldVal;
        m.components.forEach(comp=>{
           if(comp.id===cid){
              let mask = 0;
              if(comp.type==="half"){
                 mask = comp.orientation==="forwardslash" ? FRACTIONAL_DONE.HALF_FWD : FRACTIONAL_DONE.HALF_BACK;
              }else{
                 let p = comp.path.start;
                 if(p[0]===0&&p[1]===0) mask = FRACTIONAL_DONE.TL;
                 else if(p[0]===2&&p[1]===0) mask = FRACTIONAL_DONE.TR;
                 else if(p[0]===0&&p[1]===2) mask = FRACTIONAL_DONE.BL;
                 else if(p[0]===2&&p[1]===2) mask = FRACTIONAL_DONE.BR;
              }
              if(md) newVal |= mask; else newVal &= ~mask;
           }
        });
        if(newVal !== oldVal){ changes.push({idx:i,oldVal}); nd[i]=newVal; }
     }else if(m.id===cid){
        let newVal = md ? FRACTIONAL_DONE.FULL : 0;
        if(newVal !== oldVal){ changes.push({idx:i,oldVal}); nd[i]=newVal; }
     }
  }
  if(changes.length>0)pushTrackHistory(changes);
  setDone(nd);
}
function copyText(t,l){navigator.clipboard.writeText(t).then(()=>{setCopied(l);setTimeout(()=>setCopied(null),2000);}).catch(()=>{});}

function pushTrackHistory(changes){
  if(!changes||!changes.length)return;
  setTrackHistory(prev=>{let n=[...prev,changes];if(n.length>TRACK_HISTORY_MAX)n=n.slice(n.length-TRACK_HISTORY_MAX);return n;});
}
function undoTrack(){
  if(!trackHistory.length||!done)return;
  let last=trackHistory[trackHistory.length-1];
  let nd=new Uint8Array(done);
  for(let c of last)nd[c.idx]=c.oldVal;
  setDone(nd);
  setTrackHistory(prev=>prev.slice(0,-1));
}



function saveProject(){
  if(!pat||!pal)return;
  let project={
    version:7,
    page:"tracker",
    settings:{sW,sH,fabricCt,skeinPrice,stitchSpeed},
    pattern:pat.map(m=>{if(m.id==="__skip__")return{id:"__skip__"};if(m.type==="fractional")return{type:"fractional",components:m.components};return{id:m.id,type:m.type,rgb:m.rgb};}),
    bsLines,
    done:done?Array.from(done):null,
    parkMarkers,
    totalTime:totalTime+(sessionActive?Math.floor((Date.now()-sessionStart)/1000):0),
    sessions,
    hlRow,
    hlCol,
    threadOwned,
    symbolMap
  };
  let blob=new Blob([JSON.stringify(project)],{type:"application/json"});
  let url=URL.createObjectURL(blob);
  let a=document.createElement("a");
  a.href=url;
  a.download="cross-stitch-project.json";
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
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

  let loadedSymMap = project.symbolMap || {};
  let{pal:newPal,cmap:newCmap}=buildPalette(restored, loadedSymMap);
  setSymbolMap(loadedSymMap);
  setPat(restored);setPal(newPal);setCmap(newCmap);
  setSelectedColorId(null);setFocusColour(null);setTrackHistory([]);
  if(project.settings && project.settings.pdfSettings) setPdfSettings(project.settings.pdfSettings);
  setThreadOwned(project.threadOwned||{});
  if(project.done&&project.done.length===restored.length)setDone(new Uint8Array(project.done));
  else setDone(new Uint8Array(restored.length));

  setParkMarkers(project.parkMarkers||[]);
  setTotalTime(project.totalTime||0);
  setSessions(project.sessions||[]);
  if(project.hlRow>=0)setHlRow(project.hlRow);
  if(project.hlCol>=0)setHlCol(project.hlCol);

  setTimeout(()=>{
    let z=Math.min(3,Math.max(0.05,750/((project.w||s.sW||80)*20)));
    setStitchZoom(z);
  },100);
}

function loadProject(e){
  let f=e.target.files[0];if(!f)return;
  setLoadError(null);
  setImportSuccess(null);

  const format = detectImportFormat(f);

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
        let project = importResultToProject(result);
        processLoadedProject(project);
        setImportSuccess(`Imported ${result.width}x${result.height} pattern with ${result.paletteSize} colours and ${result.stitchCount} stitches.`);
      }catch(err){
        console.error(err);
        setLoadError("Could not load OXS: "+err.message);
        setTimeout(()=>setLoadError(null),4000);
      }
    };
    rd.readAsText(f);
  } else if (format === "image") {
    let rd=new FileReader();
    rd.onload=ev=>{
      let img = new Image();
      img.onload = () => {
        setImportImage(img);
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
    setLoadError("Parsing PDF chart... This may take a moment.");
    const importer = new PatternKeeperImporter();
    importer.import(f).then(project => {
      processLoadedProject(project);
      setLoadError(null);
      setImportSuccess(`Imported PDF chart successfully.`);
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

useEffect(() => {
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
        } catch (err) {
            console.error("Failed to load from URL:", err);
            setLoadError("Failed to load pattern from link.");
        }
    }
}, []);

function drawStitch(ctx,cSz,viewportRect=null){
  let gut=G,dW=sW,dH=sH;
  let startX=0, startY=0, endX=dW, endY=dH;
  if(viewportRect){
    startX = Math.max(0, Math.floor((viewportRect.left - gut) / cSz) - 1);
    startY = Math.max(0, Math.floor((viewportRect.top - gut) / cSz) - 1);
    endX = Math.min(dW, Math.ceil((viewportRect.right - gut) / cSz) + 1);
    endY = Math.min(dH, Math.ceil((viewportRect.bottom - gut) / cSz) + 1);
    ctx.clearRect(Math.max(0, viewportRect.left), Math.max(0, viewportRect.top), viewportRect.width, viewportRect.height);
    ctx.fillStyle="#fff";ctx.fillRect(Math.max(0, viewportRect.left), Math.max(0, viewportRect.top), viewportRect.width, viewportRect.height);
  } else {
    ctx.fillStyle="#fff";ctx.fillRect(0,0,gut+dW*cSz+2,gut+dH*cSz+2);
  }

  ctx.fillStyle="#a1a1aa";ctx.font=`${Math.max(7,Math.min(11,cSz*0.5))}px system-ui`;ctx.textAlign="center";ctx.textBaseline="middle";
  if (!viewportRect || viewportRect.top <= gut) {
      for(let x=startX;x<endX;x+=1){
          if(x%10===0) ctx.fillText(String(x+1),gut+x*cSz+cSz/2,gut/2);
      }
  }
  if (!viewportRect || viewportRect.left <= gut) {
      ctx.textAlign="right";
      for(let y=startY;y<endY;y+=1){
          if(y%10===0) ctx.fillText(String(y+1),gut-3,gut+y*cSz+cSz/2);
      }
  }

  for(let y=startY;y<endY;y++)for(let x=startX;x<endX;x++){
    let idx=y*sW+x,m=pat[idx];if(!m)continue;
    let px=gut+x*cSz,py=gut+y*cSz;
    let dVal=done?done[idx]:0;

    if(m.id==="__skip__"){drawCk(ctx,px,py,cSz);if(cSz>=4){ctx.strokeStyle="rgba(0,0,0,0.06)";ctx.strokeRect(px,py,cSz,cSz);}continue;}

    if(m.type==="fractional"&&m.components){
        drawCk(ctx,px,py,cSz);
        let sorted = m.components.slice().sort((a,b)=>(a.priority||0)-(b.priority||0));
        sorted.forEach(comp=>{
           let ci=cmap?cmap[comp.id]:null;
           if(!ci)return;
           let isDimmed=stitchView==="highlight"&&focusColour&&comp.id!==focusColour;

           let isCompDone = false;
           if(comp.type==="half"){
              isCompDone = comp.orientation==="forwardslash" ? (dVal&FRACTIONAL_DONE.HALF_FWD) : (dVal&FRACTIONAL_DONE.HALF_BACK);
           }else{
              let p = comp.path.start;
              if(p[0]===0&&p[1]===0) isCompDone = (dVal&FRACTIONAL_DONE.TL);
              else if(p[0]===2&&p[1]===0) isCompDone = (dVal&FRACTIONAL_DONE.TR);
              else if(p[0]===0&&p[1]===2) isCompDone = (dVal&FRACTIONAL_DONE.BL);
              else if(p[0]===2&&p[1]===2) isCompDone = (dVal&FRACTIONAL_DONE.BR);
           }

           ctx.save();
           ctx.beginPath();
           if(comp.type==="half"){
             if(comp.orientation==="backslash"){
               ctx.moveTo(px,py);ctx.lineTo(px+cSz,py+cSz);ctx.lineTo(px,py+cSz);ctx.closePath();
             } else {
               ctx.moveTo(px,py+cSz);ctx.lineTo(px+cSz,py);ctx.lineTo(px+cSz,py+cSz);ctx.closePath();
             }
           } else if(comp.type==="quarter"){
             ctx.moveTo(px+cSz/2,py+cSz/2);
             let p=comp.path.start;
             if(p[0]===0&&p[1]===0){ ctx.lineTo(px,py); ctx.lineTo(px,py+cSz/2); ctx.lineTo(px+cSz/2,py); }
             else if(p[0]===2&&p[1]===0){ ctx.lineTo(px+cSz,py); ctx.lineTo(px+cSz,py+cSz/2); ctx.lineTo(px+cSz/2,py); }
             else if(p[0]===0&&p[1]===2){ ctx.lineTo(px,py+cSz); ctx.lineTo(px,py+cSz/2); ctx.lineTo(px+cSz/2,py+cSz); }
             else if(p[0]===2&&p[1]===2){ ctx.lineTo(px+cSz,py+cSz); ctx.lineTo(px+cSz,py+cSz/2); ctx.lineTo(px+cSz/2,py+cSz); }
           }
           ctx.clip();

           if(comp.type==="half"){
             let fillOp = isCompDone ? 0.40 : 0.06;
             let lineOp = isCompDone ? 1.0 : 0.25;
             let strokeWidth = isCompDone ? 2.5 : 1.5;
             if(isDimmed){ fillOp=0.04; lineOp=0.10; }

             ctx.fillStyle=`rgba(${ci.rgb[0]},${ci.rgb[1]},${ci.rgb[2]},${fillOp})`;
             ctx.fillRect(px,py,cSz,cSz);

             if(cSz>=6){
                 ctx.beginPath();
                 if(comp.orientation==="backslash"){ ctx.moveTo(px,py);ctx.lineTo(px+cSz,py+cSz); }
                 else { ctx.moveTo(px,py+cSz);ctx.lineTo(px+cSz,py); }
                 if(isDimmed) {
                    ctx.strokeStyle=`rgba(113,113,122,${lineOp})`;
                 } else {
                    ctx.strokeStyle=`rgba(${ci.rgb[0]},${ci.rgb[1]},${ci.rgb[2]},${lineOp})`;
                 }
                 ctx.lineWidth=Math.max(1, cSz*(strokeWidth/20));
                 ctx.lineCap="round";ctx.stroke();
             }
           }else{
             if(stitchView==="symbol"){
               if(isCompDone){ctx.fillStyle="#d1fae5";ctx.fillRect(px,py,cSz,cSz);}
               else{ctx.fillStyle="#fff";ctx.fillRect(px,py,cSz,cSz);}
             }else if(stitchView==="colour"){
               ctx.fillStyle=`rgb(${ci.rgb[0]},${ci.rgb[1]},${ci.rgb[2]})`;ctx.fillRect(px,py,cSz,cSz);
             }else{
               if(isCompDone){ctx.fillStyle=isDimmed?"#f4f4f5":`rgb(${ci.rgb[0]},${ci.rgb[1]},${ci.rgb[2]})`;ctx.fillRect(px,py,cSz,cSz);}
               else if(isDimmed){ctx.fillStyle="#f4f4f5";ctx.fillRect(px,py,cSz,cSz);}
               else{ctx.fillStyle=`rgba(${ci.rgb[0]},${ci.rgb[1]},${ci.rgb[2]},0.25)`;ctx.fillRect(px,py,cSz,cSz);}
             }
           }

           let showSym = false;
           if(comp.type==="half"){
               if(!isCompDone && !isDimmed) showSym = true;
           } else {
               if(stitchView==="symbol" && !isCompDone) showSym=true;
               else if(stitchView==="colour" && !isCompDone) showSym=true;
               else if(stitchView==="highlight" && !isCompDone && !isDimmed) showSym=true;
               else if(stitchView==="highlight" && isDimmed) showSym=true;
           }

           if(showSym && cSz>=10){
             let lum=luminance(ci.rgb);
             if(comp.type==="half") {
                 ctx.fillStyle=`rgba(${ci.rgb[0]},${ci.rgb[1]},${ci.rgb[2]},0.3)`;
             } else {
                 if(stitchView==="symbol"||isDimmed) ctx.fillStyle="#18181b";
                 else ctx.fillStyle=lum>140?"rgba(0,0,0,0.8)":"rgba(255,255,255,0.95)";
                 if(isDimmed) { ctx.fillStyle="rgba(0,0,0,0.15)"; }
             }
             ctx.font=`bold ${Math.max(6,cSz*0.4)}px monospace`;ctx.textAlign="center";ctx.textBaseline="middle";
             let sx=px+cSz/2,sy=py+cSz/2;
             if(comp.type==="quarter"){
                let p=comp.path.start;
                if(p[0]===0&&p[1]===0){ sx=px+cSz*0.25; sy=py+cSz*0.25; }
                else if(p[0]===2&&p[1]===0){ sx=px+cSz*0.75; sy=py+cSz*0.25; }
                else if(p[0]===0&&p[1]===2){ sx=px+cSz*0.25; sy=py+cSz*0.75; }
                else if(p[0]===2&&p[1]===2){ sx=px+cSz*0.75; sy=py+cSz*0.75; }
             } else if(comp.type==="half") {
                if(comp.orientation==="backslash"){ sx=px+cSz*0.35; sy=py+cSz*0.65; }
                else { sx=px+cSz*0.65; sy=py+cSz*0.65; }
             }
             ctx.fillText(ci.symbol,sx,sy);
           }
           ctx.restore();
        });
        if(cSz>=4){ctx.strokeStyle="rgba(0,0,0,0.08)";ctx.strokeRect(px,py,cSz,cSz);}
        continue;
    }

    let info=cmap?cmap[m.id]:null;
    let isDn=dVal&FRACTIONAL_DONE.FULL;
    let dimmed=stitchView==="highlight"&&focusColour&&m.id!==focusColour&&m.id!=="__skip__";
    if(stitchView==="symbol"){
      if(isDn){ctx.fillStyle="#d1fae5";ctx.fillRect(px,py,cSz,cSz);}
      else{ctx.fillStyle="#fff";ctx.fillRect(px,py,cSz,cSz);if(info&&cSz>=6){ctx.fillStyle="#18181b";ctx.font=`bold ${Math.max(7,cSz*0.65)}px monospace`;ctx.textAlign="center";ctx.textBaseline="middle";ctx.fillText(info.symbol,px+cSz/2,py+cSz/2);}}
    }else if(stitchView==="colour"){
      ctx.fillStyle=`rgb(${m.rgb[0]},${m.rgb[1]},${m.rgb[2]})`;ctx.fillRect(px,py,cSz,cSz);
      if(!isDn&&info&&cSz>=6){ctx.fillStyle=luminance(m.rgb)>140?"rgba(0,0,0,0.8)":"rgba(255,255,255,0.95)";ctx.font=`bold ${Math.max(7,cSz*0.6)}px monospace`;ctx.textAlign="center";ctx.textBaseline="middle";ctx.fillText(info.symbol,px+cSz/2,py+cSz/2);}
    }else{
      if(isDn){ctx.fillStyle=dimmed?"#f4f4f5":`rgb(${m.rgb[0]},${m.rgb[1]},${m.rgb[2]})`;ctx.fillRect(px,py,cSz,cSz);}
      else if(dimmed){ctx.fillStyle="#f4f4f5";ctx.fillRect(px,py,cSz,cSz);if(info&&cSz>=8){ctx.fillStyle="rgba(0,0,0,0.06)";ctx.font=`${Math.max(6,cSz*0.45)}px monospace`;ctx.textAlign="center";ctx.textBaseline="middle";ctx.fillText(info.symbol,px+cSz/2,py+cSz/2);}}
      else{ctx.fillStyle=`rgba(${m.rgb[0]},${m.rgb[1]},${m.rgb[2]},0.25)`;ctx.fillRect(px,py,cSz,cSz);if(info&&cSz>=6){ctx.fillStyle="#18181b";ctx.font=`bold ${Math.max(7,cSz*0.7)}px monospace`;ctx.textAlign="center";ctx.textBaseline="middle";ctx.fillText(info.symbol,px+cSz/2,py+cSz/2);}}
    }
    if(cSz>=4){ctx.strokeStyle=dimmed?"rgba(0,0,0,0.03)":"rgba(0,0,0,0.08)";ctx.strokeRect(px,py,cSz,cSz);}
  }
  if(cSz>=3){ctx.strokeStyle="rgba(0,0,0,0.2)";ctx.lineWidth=cSz>=8?1.5:1;for(let gx=0;gx<=dW;gx+=10){ctx.beginPath();ctx.moveTo(gut+gx*cSz,gut);ctx.lineTo(gut+gx*cSz,gut+dH*cSz);ctx.stroke();}for(let gy=0;gy<=dH;gy+=10){ctx.beginPath();ctx.moveTo(gut,gut+gy*cSz);ctx.lineTo(gut+dW*cSz,gut+gy*cSz);ctx.stroke();}}
  if(showCtr){ctx.strokeStyle="rgba(200,60,60,0.3)";ctx.lineWidth=1.5;ctx.setLineDash([6,4]);ctx.beginPath();ctx.moveTo(gut+Math.floor(sW/2)*cSz,gut);ctx.lineTo(gut+Math.floor(sW/2)*cSz,gut+dH*cSz);ctx.stroke();ctx.beginPath();ctx.moveTo(gut,gut+Math.floor(sH/2)*cSz);ctx.lineTo(gut+sW*cSz,gut+Math.floor(sH/2)*cSz);ctx.stroke();ctx.setLineDash([]);}
  if(hlRow>=0&&hlCol>=0){ctx.strokeStyle="rgba(59,130,246,0.6)";ctx.lineWidth=2;ctx.setLineDash([]);if(hlRow<dH){ctx.beginPath();ctx.moveTo(gut,gut+hlRow*cSz+cSz/2);ctx.lineTo(gut+dW*cSz,gut+hlRow*cSz+cSz/2);ctx.stroke();}if(hlCol<dW){ctx.beginPath();ctx.moveTo(gut+hlCol*cSz+cSz/2,gut);ctx.lineTo(gut+hlCol*cSz+cSz/2,gut+dH*cSz);ctx.stroke();}}
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
},[pat,cmap,scs,sW,sH,showCtr,bsLines,done,parkMarkers,hlRow,hlCol,stitchView,focusColour]);
useEffect(()=>renderStitch(),[renderStitch]);

function handleStitchMouseDown(e){
  if(!stitchRef.current||!pat)return;
  if(e.button===1){e.preventDefault();startPan(e);return;}
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
  let cell=pat[idx];
  if(!cell || cell.id==="__skip__")return;

  // Calculate clicked mask
  let clickMask = FRACTIONAL_DONE.FULL;
  if(cell.type==="fractional"&&cell.components){
     let rect=stitchRef.current.getBoundingClientRect();
     let mx=(e.clientX-rect.left)-G;
     let my=(e.clientY-rect.top)-G;
     let cx=mx-gx*scs;
     let cy=my-gy*scs;
     let qx = cx < scs*0.5 ? 0 : 2;
     let qy = cy < scs*0.5 ? 0 : 2;

     // Use diagonal line checks for more precise targeting of half stitches
     let clickedComp = null;
     let clickDist = 999;

     cell.components.forEach(comp => {
         if(comp.type==="half"){
             let cxMid = cx - scs*0.5;
             let cyMid = cy - scs*0.5;
             if(comp.orientation==="forwardslash"){
                 // Triangle boundaries: bottom-right half vs top-left half
                 // Equation: x + y = scs. Bottom-right means x+y > scs
                 let isBR = (cx + cy) > scs;
                 if (isBR) {
                     clickedComp = comp;
                 }
             }else if(comp.orientation==="backslash"){
                 // Equation: y = x. Bottom-left means y > x.
                 let isBL = cy > cx;
                 if (isBL) {
                     clickedComp = comp;
                 }
             }
         } else if(comp.type==="quarter"){
             if(comp.path.start[0]===qx && comp.path.start[1]===qy) { clickedComp=comp; }
         }
     });

     // Fallback to simpler bounds check if the precise diagonal logic failed
     if (!clickedComp) {
         for(let i=cell.components.length-1; i>=0; i--){
            let comp = cell.components[i];
            if(comp.type==="quarter"){
               if(comp.path.start[0]===qx && comp.path.start[1]===qy) { clickedComp=comp; break; }
            }else if(comp.type==="half"){
               if(comp.orientation==="forwardslash" && ((qx===0&&qy===2) || (qx===2&&qy===0))) { clickedComp=comp; break; }
               if(comp.orientation==="backslash" && ((qx===0&&qy===0) || (qx===2&&qy===2))) { clickedComp=comp; break; }
            }
         }
     }
     if(clickedComp){
        if(clickedComp.type==="quarter"){
           let p = clickedComp.path.start;
           if(p[0]===0&&p[1]===0) clickMask = FRACTIONAL_DONE.TL;
           else if(p[0]===2&&p[1]===0) clickMask = FRACTIONAL_DONE.TR;
           else if(p[0]===0&&p[1]===2) clickMask = FRACTIONAL_DONE.BL;
           else if(p[0]===2&&p[1]===2) clickMask = FRACTIONAL_DONE.BR;
        }else{
           clickMask = clickedComp.orientation==="forwardslash" ? FRACTIONAL_DONE.HALF_FWD : FRACTIONAL_DONE.HALF_BACK;
        }
     }else{
        return; // Clicked an empty part of the cell
     }
  }

  let oldVal = done[idx];
  let isDone = (oldVal & clickMask);
  let newVal = isDone ? (oldVal & ~clickMask) : (oldVal | clickMask);

  setDragVal({mask: clickMask, turnOn: !isDone});
  setIsDragging(true);
  dragChangesRef.current=[{idx,oldVal}];
  let nd=new Uint8Array(done);nd[idx]=newVal;setDone(nd);
  e.preventDefault();
}

function handleStitchMouseMove(e){
  if(isPanning){
    doPan(e);
    if(hoverInfo) setHoverInfo(null);
    return;
  }
  let gc=gridCoord(stitchRef,e,scs,G);

  if(isDragging) {
    if(hoverInfo) setHoverInfo(null);
  } else if(stitchMode==="track" && pat && gc && gc.gx>=0 && gc.gx<sW && gc.gy>=0 && gc.gy<sH){
    let idx=gc.gy*sW+gc.gx;
    let cell=pat[idx];
    if(cell && cell.id!=="__skip__"){
      let name="";
      let cellId=cell.id;
      if(cell.type==="blend"){
        name=cell.threads[0].name+"+"+cell.threads[1].name;
      }else if(cell.type==="fractional"){
        cellId = "Multiple"; name="Fractional Stitches";
      }else{
        let t=DMC.find(d=>d.id===cell.id);
        if(t) name=t.name;
      }
      setHoverInfo({row:gc.gy+1, col:gc.gx+1, id:cellId, name:name, x:e.clientX, y:e.clientY});
    } else {
      setHoverInfo(null);
    }
  } else if (!isDragging && hoverInfo) {
    setHoverInfo(null);
  }

  if(!isDragging||stitchMode!=="track"||!done||!stitchRef.current||!pat)return;
  if(!gc)return;let{gx,gy}=gc;
  if(gx<0||gx>=sW||gy<0||gy>=sH)return;
  let idx=gy*sW+gx;
  let cell = pat[idx];
  if(cell.id==="__skip__")return;

  let clickMask = dragVal.mask;
  if(cell.type==="fractional"&&cell.components){
     // Only allow dragging over similar components if possible, otherwise we might corrupt.
     // For safety on drag over fractions, just use the first component we hit in that region.
     let rect=stitchRef.current.getBoundingClientRect();
     let mx=(e.clientX-rect.left)-G;
     let my=(e.clientY-rect.top)-G;
     let cx=mx-gx*scs;
     let cy=my-gy*scs;
     let qx = cx < scs*0.5 ? 0 : 2;
     let qy = cy < scs*0.5 ? 0 : 2;

     let clickedComp = null;
     cell.components.forEach(comp => {
         if(comp.type==="half"){
             if(comp.orientation==="forwardslash"){
                 let isBR = (cx + cy) > scs;
                 if (isBR) clickedComp = comp;
             }else if(comp.orientation==="backslash"){
                 let isBL = cy > cx;
                 if (isBL) clickedComp = comp;
             }
         } else if(comp.type==="quarter"){
             if(comp.path.start[0]===qx && comp.path.start[1]===qy) clickedComp=comp;
         }
     });

     if (!clickedComp) {
         for(let i=cell.components.length-1; i>=0; i--){
            let comp = cell.components[i];
            if(comp.type==="quarter"){
               if(comp.path.start[0]===qx && comp.path.start[1]===qy) { clickedComp=comp; break; }
            }else if(comp.type==="half"){
               if(comp.orientation==="forwardslash" && ((qx===0&&qy===2) || (qx===2&&qy===0))) { clickedComp=comp; break; }
               if(comp.orientation==="backslash" && ((qx===0&&qy===0) || (qx===2&&qy===2))) { clickedComp=comp; break; }
            }
         }
     }
     if(clickedComp){
        if(clickedComp.type==="quarter"){
           let p = clickedComp.path.start;
           if(p[0]===0&&p[1]===0) clickMask = FRACTIONAL_DONE.TL;
           else if(p[0]===2&&p[1]===0) clickMask = FRACTIONAL_DONE.TR;
           else if(p[0]===0&&p[1]===2) clickMask = FRACTIONAL_DONE.BL;
           else if(p[0]===2&&p[1]===2) clickMask = FRACTIONAL_DONE.BR;
        }else{
           clickMask = clickedComp.orientation==="forwardslash" ? FRACTIONAL_DONE.HALF_FWD : FRACTIONAL_DONE.HALF_BACK;
        }
     }else{
        return;
     }
  } else {
     clickMask = FRACTIONAL_DONE.FULL;
  }

  let oldVal=done[idx];
  let newVal=dragVal.turnOn ? (oldVal | clickMask) : (oldVal & ~clickMask);

  if(oldVal!==newVal){
    dragChangesRef.current.push({idx,oldVal});
    let nd=new Uint8Array(done);nd[idx]=newVal;setDone(nd);
  }
}
function handleStitchMouseLeave(){
  handleMouseUp();
  setHoverInfo(null);
}
function handleMouseUp(){
  if(isPanning){setIsPanning(false);return;}
  if(isDragging&&dragChangesRef.current.length>0){
    pushTrackHistory([...dragChangesRef.current]);
    dragChangesRef.current=[];
  }
  setIsDragging(false);
}

function startPan(e){
  if(!stitchScrollRef.current)return;
  setIsPanning(true);
  panStart.current={x:e.clientX,y:e.clientY,scrollX:stitchScrollRef.current.scrollLeft,scrollY:stitchScrollRef.current.scrollTop};
}
function doPan(e){
  if(!stitchScrollRef.current)return;
  let dx=e.clientX-panStart.current.x,dy=e.clientY-panStart.current.y;
  stitchScrollRef.current.scrollLeft=panStart.current.scrollX-dx;
  stitchScrollRef.current.scrollTop=panStart.current.scrollY-dy;
}

function toggleOwned(id){setThreadOwned(prev=>{let cur=prev[id]||"";let next=cur===""?"owned":cur==="owned"?"tobuy":"";return{...prev,[id]:next};});}
const ownedCount=useMemo(()=>skeinData.filter(d=>(threadOwned[d.id]||"")==="owned").length,[skeinData,threadOwned]);
const toBuyList=useMemo(()=>skeinData.filter(d=>(threadOwned[d.id]||"")!=="owned"),[skeinData,threadOwned]);

return(
<>
<Header page="tracker" onExportPDF={pat ? () => setModal("pdf_export") : null} setModal={setModal} />
<div style={{maxWidth:1100,margin:"0 auto",padding:"20px 16px"}}>
  {loadError&&<div style={{background:"#fef2f2",border:"1px solid #fecaca",borderRadius:8,padding:"8px 14px",fontSize:12,color:"#dc2626",marginBottom:12}}>{loadError}</div>}
  {importSuccess && (
    <div style={{
      background: "#f0fdf4", border: "1px solid #bbf7d0", borderRadius: 8,
      padding: "8px 14px", fontSize: 12, color: "#16a34a", fontWeight: 600, marginBottom: 12
    }}>
      ✓ {importSuccess}
    </div>
  )}
  <input ref={loadRef} type="file" accept=".json,.oxs,.xml,.png,.jpg,.jpeg,.gif,.bmp,.webp,.pdf" onChange={loadProject} style={{display:"none"}}/>

  {!pat&&<div style={{maxWidth:500, margin:"40px auto", textAlign:"center"}}>
    <div className="card" style={{padding:"30px"}}>
      <h2 style={{fontSize:24, fontWeight:700, color:"#18181b", marginBottom:8}}>🧵 Stitch Tracker</h2>
      <p style={{fontSize:15, color:"#71717a", marginBottom:24}}>Track your cross stitch progress</p>

      <div style={{display:"grid",gap:16}}>
        <button onClick={()=>loadRef.current.click()} style={{padding:"14px",fontSize:16,borderRadius:12,border:"0.5px solid #e4e4e7",background:"#fafafa",cursor:"pointer",fontWeight:600,color:"#18181b",display:"flex",alignItems:"center",justifyContent:"center",gap:8}}>
          📂 Load Project
        </button>
      </div>

      <div style={{marginTop:24, textAlign:"left", background:"#fafafa", padding:"16px", borderRadius:12, border:"0.5px solid #e4e4e7"}}>
        <p style={{fontSize:13, fontWeight:600, color:"#71717a", marginBottom:12, marginTop:0}}>Supported formats:</p>
        <div style={{display:"flex", flexDirection:"column", gap:10}}>
          <div style={{display:"flex", alignItems:"center", gap:10, fontSize:13, color:"#71717a"}}>
            <span style={{padding:"3px 8px", background:"#eff6ff", color:"#18181b", borderRadius:6, border:"1px solid #bfdbfe", fontWeight:600, fontSize:11, width:64, textAlign:"center", flexShrink:0}}>.json</span>
            Cross Stitch Pattern Generator project files
          </div>
          <div style={{display:"flex", alignItems:"center", gap:10, fontSize:13, color:"#71717a"}}>
            <span style={{padding:"3px 8px", background:"#f5f3ff", color:"#0d9488", borderRadius:6, border:"1px solid #d8b4fe", fontWeight:600, fontSize:11, width:64, textAlign:"center", flexShrink:0}}>.oxs</span>
            KG-Chart / Pattern Keeper XML format
          </div>
          <div style={{display:"flex", alignItems:"center", gap:10, fontSize:13, color:"#71717a"}}>
            <span style={{padding:"3px 8px", background:"#f0fdf4", color:"#16a34a", borderRadius:6, border:"1px solid #bbf7d0", fontWeight:600, fontSize:11, width:64, textAlign:"center", flexShrink:0}}>.png .jpg</span>
            Pixel art images (each pixel = one stitch)
          </div>
          <div style={{display:"flex", alignItems:"center", gap:10, fontSize:13, color:"#71717a"}}>
            <span style={{padding:"3px 8px", background:"#fef2f2", color:"#dc2626", borderRadius:6, border:"1px solid #fecaca", fontWeight:600, fontSize:11, width:64, textAlign:"center", flexShrink:0}}>.pdf</span>
            Pattern Keeper compatible PDF charts
          </div>
        </div>
      </div>

      <div style={{marginTop:30, paddingTop:20, borderTop:"0.5px solid #e4e4e7"}}>
        <p style={{fontSize:14, color:"#71717a", marginBottom:10}}>Need a pattern?</p>
        <a href="index.html" style={{color:"#0d9488", fontWeight:600, textDecoration:"none"}}>→ Pattern Creator</a>
      </div>
    </div>
  </div>}

  {pat&&pal&&<div>
    <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:8,padding:"8px 14px",background:"#fff",border:"0.5px solid #e4e4e7",borderRadius:10,flexWrap:"wrap"}}>
      <button onClick={toggleSession} style={{padding:"5px 16px",fontSize:13,borderRadius:8,border:"none",background:sessionActive?"#dc2626":"#16a34a",color:"#fff",cursor:"pointer",fontWeight:700,minWidth:100}}>{sessionActive?"⏹ Stop":"▶ Start"}</button>
      <div style={{flex:1,minWidth:100}}><div style={{display:"flex",justifyContent:"space-between",fontSize:12,marginBottom:3}}><span style={{fontWeight:700,color:progressPct>=100?"#16a34a":"#0d9488"}}>{progressPct}%{progressPct>=100?" 🎉":""}</span><span style={{color:"#71717a"}}>{doneCount.toLocaleString()}/{totalStitchable.toLocaleString()}</span></div><div style={{height:6,background:"#e4e4e7",borderRadius:3,overflow:"hidden"}}><div style={{height:"100%",width:Math.min(progressPct,100)+"%",background:progressPct>=100?"#16a34a":"#0d9488",borderRadius:3,transition:"width 0.3s"}}/></div></div>
      {(sessionActive||totalTime>0)&&<div style={{fontSize:11,color:"#71717a",textAlign:"right",minWidth:90}}>{sessionActive?<><span style={{color:"#dc2626"}}>● </span>{fmtTime(sessionElapsed)} · {sessionStitches} st</>:<>Total: {fmtTime(totalTime)}</>}{estCompletion&&<div style={{fontSize:10,color:"#a1a1aa"}}>~{fmtTime(estCompletion)} left</div>}</div>}
    </div>

    <div style={{display:"flex",gap:6,marginBottom:6,alignItems:"center",flexWrap:"wrap", padding: "6px 10px", background: "#fff", border: "0.5px solid #e4e4e7", borderRadius: 10}}>
      <div style={{ display: "flex", gap: 2, background: "#f4f4f5", borderRadius: 8, padding: 2 }}><button onClick={()=>setStitchMode("track")} style={{ padding: "5px 12px", fontSize: 12, fontWeight: stitchMode==="track" ? 500 : 400, background: stitchMode==="track" ? "#0d9488" : "transparent", borderRadius: 6, color: stitchMode==="track" ? "#fff" : "#71717a", border: "none", cursor: "pointer", boxShadow: stitchMode==="track" ? "0 1px 2px rgba(0,0,0,0.04)" : "none" }}>Track</button><button onClick={()=>setStitchMode("navigate")} style={{ padding: "5px 12px", fontSize: 12, fontWeight: stitchMode==="navigate" ? 500 : 400, background: stitchMode==="navigate" ? "#18181b" : "transparent", borderRadius: 6, color: stitchMode==="navigate" ? "#fff" : "#71717a", border: "none", cursor: "pointer", boxShadow: stitchMode==="navigate" ? "0 1px 2px rgba(0,0,0,0.04)" : "none" }}>Navigate</button></div>
      <div style={{width:1,height:20,background:"#e4e4e7"}}/>
      <div style={{ display: "flex", gap: 2, background: "#f4f4f5", borderRadius: 8, padding: 2 }}>{[["symbol","Sym"],["colour","Col+Sym"],["highlight","Highlight"]].map(([k,l])=><button key={k} onClick={()=>{setStitchView(k);if(k!=="highlight")setFocusColour(null);}} style={{ padding: "5px 12px", fontSize: 12, fontWeight: stitchView===k ? 500 : 400, background: stitchView===k ? "#fff" : "transparent", borderRadius: 6, color: stitchView===k ? "#18181b" : "#71717a", border: "none", cursor: "pointer", boxShadow: stitchView===k ? "0 1px 2px rgba(0,0,0,0.04)" : "none" }}>{l}</button>)}</div>
      <div style={{width:1,height:20,background:"#e4e4e7"}}/>
      <span style={{fontSize:11,color:"#a1a1aa"}}>Zoom</span><input type="range" min={0.1} max={3} step={0.05} value={stitchZoom} onChange={e=>setStitchZoom(Number(e.target.value))} style={{width:60}}/><span style={{fontSize:11,minWidth:28}}>{Math.round(stitchZoom*100)}%</span><button onClick={fitSZ} style={{fontSize:11,padding:"3px 8px",border:"0.5px solid #e4e4e7",borderRadius:6,background:"#fafafa",cursor:"pointer"}}>Fit</button>
      {stitchMode==="navigate"&&<><div style={{width:1,height:20,background:"#e4e4e7"}}/><span style={{fontSize:11,color:"#71717a"}}>📌</span><select value={selectedColorId||""} onChange={e=>setSelectedColorId(e.target.value||null)} style={{fontSize:11,padding:"3px 6px",borderRadius:6,border:"0.5px solid #e4e4e7"}}><option value="">No parking</option>{pal.map(p=><option key={p.id} value={p.id}>DMC {p.id}</option>)}</select>{parkMarkers.length>0&&<button onClick={()=>setParkMarkers([])} style={{fontSize:11,padding:"3px 8px",border:"1px solid #fde68a",borderRadius:6,background:"#fffbeb",color:"#d97706",cursor:"pointer"}}>Clear</button>}</>}
      <div style={{marginLeft:"auto",display:"flex",gap:4,alignItems:"center"}}>
        {stitchMode==="track"&&trackHistory.length>0&&<button onClick={undoTrack} style={{fontSize:11,padding:"4px 10px",border:"0.5px solid #99f6e4",borderRadius:6,background:"#f0fdfa",color:"#0d9488",cursor:"pointer"}}>↩ Undo ({trackHistory.length})</button>}
        {done&&doneCount>0&&<button onClick={()=>{if(confirm("Clear all progress?")){setDone(new Uint8Array(pat.length));setTrackHistory([]);}}} style={{fontSize:11,padding:"4px 10px",border:"1px solid #fecaca",borderRadius:6,background:"#fef2f2",color:"#dc2626",cursor:"pointer"}}>Reset</button>}
        <div style={{width:1,height:18,background:"#e4e4e7"}}/>
        <button onClick={()=>setModal("stitch_guide")} style={{width:28,height:28,borderRadius:"50%",border:"0.5px solid #e4e4e7",background:"#fff",color:"#71717a",display:"flex",alignItems:"center",justifyContent:"center",cursor:"pointer",fontSize:13,fontWeight:600}} title="Stitch guide">?</button>
      </div>
    </div>
    {scs < 6 && (stitchView === "symbol" || stitchView === "colour") && <div style={{fontSize: 12, color: "#71717a", marginBottom: 6, background: "#f4f4f5", padding: "6px 10px", borderRadius: 8}}>To see symbols, you may need to zoom in.</div>}

    {stitchMode==="track"&&<div style={{fontSize:12,color:"#0d9488",background:"#f0fdfa",padding:"6px 14px",borderRadius:8,marginBottom:6,border:"0.5px solid #99f6e4"}}>Click or drag to mark/unmark stitches · Middle-click drag to pan{trackHistory.length>0?` · ${trackHistory.length} undo step${trackHistory.length>1?"s":""} available`:""}</div>}
    {stitchMode==="navigate"&&<div style={{fontSize:12,color:"#18181b",background:"#f4f4f5",padding:"6px 14px",borderRadius:8,marginBottom:6,border:"0.5px solid #e4e4e7"}}>{selectedColorId?"Click to park. Shift+click to move guide.":"Click to place guide crosshair"}</div>}
    {stitchView==="highlight"&&!focusColour&&<div style={{fontSize:12,color:"#d97706",background:"#fffbeb",padding:"6px 14px",borderRadius:8,marginBottom:6,border:"1px solid #fde68a"}}>Open Colours drawer and tap a colour to highlight</div>}

    <div ref={stitchScrollRef} onScroll={() => requestAnimationFrame(renderStitch)} style={{overflow:"auto",maxHeight:drawer?340:600,border:"0.5px solid #e4e4e7",borderRadius:"8px 8px 0 0",background:"#f4f4f5",cursor:isPanning?"grabbing":stitchMode==="track"?"crosshair":"default",transition:"max-height 0.3s"}} onMouseUp={handleMouseUp} onMouseLeave={handleStitchMouseLeave}><canvas ref={stitchRef} style={{display:"block"}} onMouseDown={handleStitchMouseDown} onMouseMove={handleStitchMouseMove} onContextMenu={e=>e.preventDefault()}/></div>

    {hoverInfo && stitchMode==="track" && (
      <div style={{
        position:"fixed", left:hoverInfo.x+15, top:hoverInfo.y+15,
        background:"#18181b", color:"#fff", padding:"6px 10px", borderRadius:6,
        fontSize:12, fontWeight:500, pointerEvents:"none", zIndex:1000,
        boxShadow:"0 4px 6px -1px rgba(0,0,0,0.1), 0 2px 4px -1px rgba(0,0,0,0.06)"
      }}>
        Row {hoverInfo.row}, Col {hoverInfo.col} &mdash; DMC {hoverInfo.id} {hoverInfo.name}
      </div>
    )}

    <button onClick={()=>setDrawer(!drawer)} style={{width:"100%",padding:"8px",borderRadius:"0 0 8px 8px",border:"0.5px solid #e4e4e7",borderTop:"none",background:drawer?"#fafafa":"#fff",cursor:"pointer",fontSize:12,fontWeight:600,color:"#0d9488",display:"flex",alignItems:"center",justifyContent:"center",gap:6,marginBottom:12}}><span style={{transform:drawer?"rotate(180deg)":"rotate(0deg)",transition:"transform 0.2s",display:"inline-block"}}>▲</span>Colours ({pal.length}) — {Object.values(colourDoneCounts).filter(c=>c.done>=c.total).length} complete</button>

    {drawer&&<div style={{border:"0.5px solid #e4e4e7",borderRadius:"10px",background:"#fff",maxHeight:280,overflow:"auto",padding:8,marginBottom:12}}>
      <div style={{display:"flex",flexDirection:"column",gap:2}}>{pal.map(p=>{let dc=colourDoneCounts[p.id]||{total:0,done:0},pct=dc.total>0?Math.round(dc.done/dc.total*100):0,complete=dc.done>=dc.total,isFocused=focusColour===p.id;
        let sk=skeinEst(p.count,fabricCt);
        return<div key={p.id} style={{display:"flex",alignItems:"center",gap:8,padding:"5px 8px",borderRadius:6,background:isFocused?"#f0fdfa":complete?"#f0fdf4":"#fff",border:isFocused?"2px solid #0d9488":"1px solid transparent",cursor:"pointer",opacity:complete&&!isFocused?0.6:1}} onClick={()=>{if(stitchView==="highlight")setFocusColour(focusColour===p.id?null:p.id);}}>
          <span style={{width:18,height:18,borderRadius:4,background:`rgb(${p.rgb})`,border:"1px solid #d4d4d8",flexShrink:0}}/>
          <span style={{fontFamily:"monospace",fontSize:13,color:"#18181b",width:16,textAlign:"center",fontWeight:700}}>{p.symbol}</span>
          <span style={{fontWeight:600,fontSize:12,minWidth:40,color:complete?"#16a34a":"#18181b"}}>{p.id}</span>
          <span style={{fontSize:11,color:"#a1a1aa",flex:1,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{p.type==="blend"?p.threads[0].name+"+"+p.threads[1].name:p.name}</span>
          <span style={{fontSize:10,color:"#a1a1aa",flexShrink:0}}>{sk}sk</span>
          <div style={{width:60,height:5,background:"#e4e4e7",borderRadius:3,overflow:"hidden",flexShrink:0}}><div style={{height:"100%",width:pct+"%",background:complete?"#16a34a":"#0d9488",borderRadius:3}}/></div>
          <span style={{fontSize:11,color:complete?"#16a34a":"#71717a",fontWeight:complete?600:400,minWidth:50,textAlign:"right"}}>{dc.done}/{dc.total}</span>
          <button onClick={e2=>{e2.stopPropagation();markColourDone(p.id,!complete);}} style={{fontSize:10,padding:"2px 8px",borderRadius:5,border:"1px solid "+(complete?"#fecaca":"#bbf7d0"),background:complete?"#fef2f2":"#f0fdf4",color:complete?"#dc2626":"#16a34a",cursor:"pointer",whiteSpace:"nowrap",flexShrink:0}}>{complete?"Undo":"All ✓"}</button>
        </div>;})}</div>
    </div>}

    <div style={{display:"flex",flexDirection:"column",gap:12}}>
      <Section title="Thread Organiser">
        <div style={{marginTop:8,display:"flex",gap:12,marginBottom:10}}>
          <div style={{padding:"6px 14px",background:"#f0fdf4",borderRadius:8,border:"1px solid #bbf7d0",fontSize:12}}><span style={{fontWeight:700,color:"#16a34a"}}>{ownedCount}</span> <span style={{color:"#71717a"}}>owned</span></div>
          <div style={{padding:"6px 14px",background:"#fff7ed",borderRadius:8,border:"1px solid #fed7aa",fontSize:12}}><span style={{fontWeight:700,color:"#ea580c"}}>{toBuyList.length}</span> <span style={{color:"#71717a"}}>to buy</span></div>
          <div style={{marginLeft:"auto",display:"flex",gap:4}}>
            <button onClick={()=>{let n={};skeinData.forEach(d=>{n[d.id]="owned";});setThreadOwned(n);}} style={{fontSize:11,padding:"4px 10px",border:"1px solid #bbf7d0",borderRadius:6,background:"#f0fdf4",color:"#16a34a",cursor:"pointer"}}>Own all</button>
            <button onClick={()=>setThreadOwned({})} style={{fontSize:11,padding:"4px 10px",border:"0.5px solid #e4e4e7",borderRadius:6,background:"#fff",color:"#71717a",cursor:"pointer"}}>Clear</button>
          </div>
        </div>
        <div style={{display:"flex",flexDirection:"column",gap:2,maxHeight:320,overflow:"auto"}}>
          {skeinData.map(d=>{
            let st=threadOwned[d.id]||"";
            let isOwned=st==="owned";
            return<div key={d.id} style={{display:"flex",alignItems:"center",gap:8,padding:"4px 8px",borderRadius:6,background:isOwned?"#f0fdf4":"#fff",border:"1px solid "+(isOwned?"#bbf7d0":"#f4f4f5")}}>
              <span style={{width:16,height:16,borderRadius:3,background:`rgb(${d.rgb[0]},${d.rgb[1]},${d.rgb[2]})`,border:"1px solid #d4d4d8",flexShrink:0}}/>
              <span style={{fontWeight:700,fontSize:13,minWidth:44}}>DMC {d.id}</span>
              <span style={{fontSize:11,color:"#71717a",flex:1,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{d.name}</span>
              <span style={{fontSize:11,color:"#a1a1aa",flexShrink:0}}>{d.skeins}sk</span>
              <button onClick={()=>toggleOwned(d.id)} style={{fontSize:11,padding:"3px 10px",borderRadius:5,border:"1px solid "+(isOwned?"#bbf7d0":"#fed7aa"),background:isOwned?"#f0fdf4":"#fff7ed",color:isOwned?"#16a34a":"#ea580c",cursor:"pointer",fontWeight:600,minWidth:55,textAlign:"center"}}>{isOwned?"Owned":"To buy"}</button>
            </div>;})}
        </div>
        <div style={{display:"flex",gap:6,marginTop:10}}>
          <button onClick={()=>{let txt=toBuyList.map(d=>`DMC ${d.id} ${d.name} × ${d.skeins}`).join("\n");copyText(txt,"shopping");}} style={{padding:"8px 18px",fontSize:13,borderRadius:8,border:"none",background:"#0d9488",color:"#fff",cursor:"pointer",fontWeight:600}}>Copy To-Buy List</button>
          <button onClick={()=>{let txt=skeinData.map(d=>`DMC ${d.id} ${d.name} × ${d.skeins}`).join("\n");copyText(txt,"full");}} style={{padding:"8px 18px",fontSize:13,borderRadius:8,border:"0.5px solid #e4e4e7",background:"#fff",cursor:"pointer",fontWeight:500}}>Copy Full List</button>
        </div>
        {copied&&<div style={{marginTop:6,fontSize:12,color:"#16a34a",fontWeight:600}}>Copied!</div>}
      </Section>

      <Section title="Project Info">
        <div style={{marginTop:8,display:"grid",gridTemplateColumns:"1fr 1fr",gap:"8px 20px"}}>
          {[["Pattern size",`${sW} × ${sH} stitches`],["Total cells",(sW*sH).toLocaleString()],["Stitchable",totalStitchable.toLocaleString()],["Skipped",(sW*sH-totalStitchable).toLocaleString()],["Colours",`${pal.length} (${blendCount} blend${blendCount!==1?"s":""})`],["Skeins needed",`${totalSkeins} (at ${fabricCt}ct)`]].map(([l,v],i)=><div key={i}><div style={{fontSize:11,color:"#a1a1aa",textTransform:"uppercase",fontWeight:600,marginBottom:2}}>{l}</div><div style={{fontSize:14,fontWeight:600,color:"#18181b"}}>{v}</div></div>)}
        </div>
        <div style={{marginTop:12,paddingTop:12,borderTop:"0.5px solid #e4e4e7",display:"grid",gridTemplateColumns:"1fr 1fr",gap:"8px 20px"}}>
           <div><div style={{fontSize:11,color:"#a1a1aa",textTransform:"uppercase",fontWeight:600,marginBottom:2}}>Full stitches</div><div style={{fontSize:14,fontWeight:600,color:"#18181b"}}>{pal?pal.reduce((s,p)=>s+Math.max(0, p.count-(p.halfCount*0.5)),0).toLocaleString():0}</div></div>
           <div><div style={{fontSize:11,color:"#a1a1aa",textTransform:"uppercase",fontWeight:600,marginBottom:2}}>Half stitches</div><div style={{fontSize:14,fontWeight:600,color:"#18181b"}}>{pal?pal.reduce((s,p)=>s+p.halfCount,0).toLocaleString():0}</div></div>
           <div style={{gridColumn:"1 / -1"}}><div style={{fontSize:11,color:"#0d9488",textTransform:"uppercase",fontWeight:600,marginBottom:2}}>Combined Progress</div><div style={{fontSize:14,fontWeight:600,color:"#0d9488"}}>{progressPct}%</div></div>
        </div>
      </Section>
    </div>

    <div style={{marginTop:20, display:"flex", gap:10, justifyContent:"center", padding:"20px", borderTop:"0.5px solid #e4e4e7"}}>
      <button onClick={saveProject} style={{padding:"10px 20px",fontSize:14,borderRadius:8,border:"none",background:"#0d9488",color:"#fff",cursor:"pointer",fontWeight:600}}>Save Project (.json)</button>
      <button onClick={()=>loadRef.current.click()} style={{padding:"10px 20px",fontSize:14,borderRadius:8,border:"0.5px solid #e4e4e7",background:"#fff",cursor:"pointer",fontWeight:500}}>Load Different Project</button>
    </div>
  </div>}

  {importDialog==="image"&&importImage&&<div className="modal-overlay" onClick={()=>{setImportDialog(null);setImportImage(null);}}>
    <div className="modal-content" style={{maxWidth:600}} onClick={e=>e.stopPropagation()}>
      <button className="modal-close" onClick={()=>{setImportDialog(null);setImportImage(null);}}>×</button>
      <h3 style={{marginTop:0,marginBottom:15}}>Import Image Pattern</h3>
      <div style={{display:"flex", gap:20, flexWrap:"wrap"}}>
        <div style={{width:140, display:"flex", flexDirection:"column", gap:8}}>
          <div style={{width:140, height:140, background:"#fafafa", border:"0.5px solid #e4e4e7", borderRadius:8, display:"flex", alignItems:"center", justifyContent:"center", overflow:"hidden"}}>
            <img src={importImage.src} style={{maxWidth:"100%", maxHeight:"100%", objectFit:"contain", imageRendering:"pixelated"}}/>
          </div>
          <div style={{fontSize:12, color:"#71717a", textAlign:"center"}}>
            {importImage.width} × {importImage.height} px
          </div>
        </div>
        <div style={{flex:1, minWidth:250, display:"flex", flexDirection:"column", gap:16}}>
          <div style={{display:"grid", gridTemplateColumns:"1fr 1fr", gap:12}}>
            <div style={{display:"flex", flexDirection:"column", gap:4}}>
              <label style={{fontSize:12, fontWeight:600, color:"#71717a"}}>Max Width (stitches)</label>
              <input type="number" min={10} max={300} value={importMaxW} onChange={e=>{
                let val = Number(e.target.value);
                setImportMaxW(val);
                if (importArLock) setImportMaxH(Math.max(10, Math.floor(val * (importImage.height / importImage.width))));
              }} style={{padding:"6px 10px", borderRadius:6, border:"0.5px solid #e4e4e7"}}/>
            </div>
            <div style={{display:"flex", flexDirection:"column", gap:4}}>
              <label style={{fontSize:12, fontWeight:600, color:"#71717a"}}>Max Height (stitches)</label>
              <input type="number" min={10} max={300} value={importMaxH} onChange={e=>{
                let val = Number(e.target.value);
                setImportMaxH(val);
                if (importArLock) setImportMaxW(Math.max(10, Math.floor(val * (importImage.width / importImage.height))));
              }} style={{padding:"6px 10px", borderRadius:6, border:"0.5px solid #e4e4e7"}}/>
            </div>
          </div>
          <label style={{display:"flex", alignItems:"center", gap:8, fontSize:13, color:"#18181b", cursor:"pointer"}}>
            <input type="checkbox" checked={importArLock} onChange={e=>setImportArLock(e.target.checked)}/> Lock aspect ratio
          </label>

          <SliderRow label="Max Colours" val={importMaxColours} setVal={setImportMaxColours} min={5} max={40} />

          <label style={{display:"flex", alignItems:"center", gap:8, fontSize:13, color:"#18181b", cursor:"pointer"}}>
            <input type="checkbox" checked={importSkipBg} onChange={e=>setImportSkipBg(e.target.checked)}/> Skip near-white background
          </label>

          {importSkipBg && <SliderRow label="Background Tolerance" val={importBgThreshold} setVal={setImportBgThreshold} min={3} max={50} />}

        </div>
      </div>
      <div style={{display:"flex", justifyContent:"flex-end", gap:10, marginTop:24, paddingTop:16, borderTop:"0.5px solid #e4e4e7"}}>
        <button onClick={()=>{setImportDialog(null);setImportImage(null);}} style={{padding:"8px 16px", borderRadius:8, border:"0.5px solid #e4e4e7", background:"#fff", cursor:"pointer", fontWeight:600}}>Cancel</button>
        <button onClick={()=>{
          try {
            let result = parseImagePattern(importImage, {
              maxWidth: importMaxW, maxHeight: importMaxH,
              maxColours: importMaxColours, skipWhiteBg: importSkipBg, bgThreshold: importBgThreshold
            });
            let project = importResultToProject(result);
            processLoadedProject(project);
            setImportSuccess(`Imported image as ${result.width}x${result.height} pattern with ${result.paletteSize} colours and ${result.stitchCount} stitches.`);
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
  {modal==="stitch_guide"&&<SharedModals.StitchGuide onClose={()=>setModal(null)} />}
  {modal==="pdf_export"&&<SharedModals.PdfExport onClose={()=>setModal(null)} initialSettings={pdfSettings} sW={sW} sH={sH} hasTrackingData={doneCount > 0} hasBackstitch={bsLines.length > 0} pal={pal} onExport={(s)=>{setPdfSettings(s);setModal(null);generatePDF({pat, pal, cmap, sW, sH, done, totalStitchable, fabricCt, skeinData, blendCount, totalSkeins, difficulty:null, stitchSpeed, totalTime, sessions, threadOwned, bsLines, imgData:null}, s);}} />}
</div>
</>);
}
