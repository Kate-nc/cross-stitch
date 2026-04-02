const{useState,useRef,useCallback,useEffect,useMemo}=React;

function App(){
const[img,setImg]=useState(null),[sW,setSW]=useState(80),[sH,setSH]=useState(80),[arLock,setArLock]=useState(true),[ar,setAr]=useState(1);
const[maxC,setMaxC]=useState(30),[bri,setBri]=useState(0),[con,setCon]=useState(0),[sat,setSat]=useState(0),[dith,setDith]=useState(false);
const[skipBg,setSkipBg]=useState(false),[bgTh,setBgTh]=useState(15),[bgCol,setBgCol]=useState([255,255,255]),[pickBg,setPickBg]=useState(false),[minSt,setMinSt]=useState(0);
const[smooth,setSmooth]=useState(0),[smoothType,setSmoothType]=useState("median"),[orphans,setOrphans]=useState(0);
const[pat,setPat]=useState(null),[pal,setPal]=useState(null),[cmap,setCmap]=useState(null),[busy,setBusy]=useState(false);
const[origW,setOrigW]=useState(0),[origH,setOrigH]=useState(0);
const[fabricCt,setFabricCt]=useState(14);
const[skeinPrice,setSkeinPrice]=useState(DEFAULT_SKEIN_PRICE);
const[stitchSpeed,setStitchSpeed]=useState(40); // stitches per hour

const[tab,setTab]=useState("pattern"),[sidebarOpen,setSidebarOpen]=useState(true),[loadError,setLoadError]=useState(null),[copied,setCopied]=useState(null);
const[modal,setModal]=useState(null);
const[view,setView]=useState("color"),[zoom,setZoom]=useState(1),[hiId,setHiId]=useState(null),[showCtr,setShowCtr]=useState(true);
const[showOverlay,setShowOverlay]=useState(false),[overlayOpacity,setOverlayOpacity]=useState(0.3);

const[dimOpen,setDimOpen]=useState(true),[palOpen,setPalOpen]=useState(true),[fabOpen,setFabOpen]=useState(false),[adjOpen,setAdjOpen]=useState(false),[bgOpen,setBgOpen]=useState(false);
const[hasGenerated,setHasGenerated]=useState(false);
const[isCropping,setIsCropping]=useState(false),[cropRect,setCropRect]=useState(null);
const cropStartRef=useRef(null);
const cropRef=useRef(null);

const [pdfSettings, setPdfSettings] = useState({ chartStyle: 'symbols', cellSize: 3, paper: 'a4', orientation: 'portrait', gridInterval: 10, gridNumbers: true, centerMarks: true, legendLocation: 'separate', legendColumns: 2, coverPage: true, progressOverlay: false, separateBackstitch: false });

const[activeTool,setActiveTool]=useState(null),[bsLines,setBsLines]=useState([]),[bsStart,setBsStart]=useState(null);
const[bsContinuous,setBsContinuous]=useState(false);
const[selectedColorId,setSelectedColorId]=useState(null);
const[hoverCoords,setHoverCoords]=useState(null);
const[editHistory,setEditHistory]=useState([]);

const[exportPage,setExportPage]=useState(0),[pageMode,setPageMode]=useState(false);

const[done,setDone]=useState(null);
const[parkMarkers,setParkMarkers]=useState([]);
const[hlRow,setHlRow]=useState(-1),[hlCol,setHlCol]=useState(-1);
const[totalTime,setTotalTime]=useState(0);
const[sessions,setSessions]=useState([]);

// Thread organiser: {skeinId: "owned"|"tobuy"|""}
const[threadOwned,setThreadOwned]=useState({});

const[previewUrl,setPreviewUrl]=useState(null);
const[previewStats,setPreviewStats]=useState(null);
const previewTimerRef=useRef(null);

const pcRef=useRef(null),fRef=useRef(null),scrollRef=useRef(null),expRef=useRef(null),loadRef=useRef(null);
const G=28;

const totalStitchable=useMemo(()=>{if(!pat)return 0;let c=0;for(let i=0;i<pat.length;i++)if(pat[i].id!=="__skip__")c++;return c;},[pat]);
const cs=useMemo(()=>Math.max(2,Math.round(20*zoom)),[zoom]);
const fitZ=useCallback(()=>setZoom(Math.min(3,Math.max(0.05,750/(sW*20)))),[sW]);
const pxX=Math.ceil(sW/A4W),pxY=Math.ceil(sH/A4H),totPg=pxX*pxY;

// Derived: all individual skein IDs and their stitch counts
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
const difficulty=useMemo(()=>pal?calcDifficulty(pal.length,blendCount,totalStitchable):null,[pal,blendCount,totalStitchable]);



const doneCount=useMemo(()=>{if(!done)return 0;let c=0;for(let i=0;i<done.length;i++)if(done[i])c++;return c;},[done]);
const progressPct=totalStitchable>0?Math.round(doneCount/totalStitchable*1000)/10:0;
const colourDoneCounts=useMemo(()=>{if(!pat||!done)return{};let c={};for(let i=0;i<pat.length;i++){if(pat[i].id==="__skip__")continue;let id=pat[i].id;if(!c[id])c[id]={total:0,done:0};c[id].total++;if(done[i])c[id].done++;}return c;},[pat,done]);

const generatePreview=useCallback(()=>{
  if(!img)return;
  let pw=Math.min(100,sW),ph=Math.round(pw/(sW/sH));if(ph<1)ph=1;
  let c=document.createElement("canvas");c.width=pw;c.height=ph;let cx=c.getContext("2d");
  cx.filter=`brightness(${100+bri}%) contrast(${100+con}%) saturate(${100+sat}%)`;
  cx.drawImage(img,0,0,pw,ph);cx.filter="none";
  let raw=cx.getImageData(0,0,pw,ph).data;
  if(smooth>0){if(smoothType==="gaussian")applyGaussianBlur(raw,pw,ph,smooth);else applyMedianFilter(raw,pw,ph,smooth);}
  let p=quantize(raw,pw,ph,maxC);if(!p.length)return;
  let mapped=dith?doDither(raw,pw,ph,p):doMap(raw,pw,ph,p);
  if(skipBg){let bl=rgbToLab(bgCol[0],bgCol[1],bgCol[2]);for(let i=0;i<mapped.length;i++){if(dE(rgbToLab(raw[i*4],raw[i*4+1],raw[i*4+2]),bl)<bgTh)mapped[i]={type:"skip",id:"__skip__",rgb:[255,255,255]};}}
  if(orphans>0)mapped=removeOrphanStitches(mapped,pw,ph,orphans);

  // Calculate preview statistics
  let stitchable=0;
  let skipped=0;
  let colorCounts={};
  for(let i=0;i<mapped.length;i++){
    let m=mapped[i];
    if(m.id==="__skip__"){
      skipped++;
    }else{
      stitchable++;
      colorCounts[m.id]=(colorCounts[m.id]||0)+1;
    }
  }
  let uniqueColors=Object.keys(colorCounts).length;

  // Estimate skeins (scale preview stitches up to actual size for estimation)
  let scaleFactor=(sW*sH)/(pw*ph);
  let estSkeins=0;
  Object.values(colorCounts).forEach(ct=>{
    estSkeins+=skeinEst(Math.round(ct*scaleFactor),fabricCt);
  });

  setPreviewStats({
    stitchable: Math.round(stitchable*scaleFactor),
    skipped: Math.round(skipped*scaleFactor),
    uniqueColors,
    estSkeins
  });

  let pc=document.createElement("canvas");let pcs=Math.max(3,Math.floor(260/pw));
  pc.width=pw*pcs;pc.height=ph*pcs;let pcx=pc.getContext("2d");
  for(let y=0;y<ph;y++)for(let x=0;x<pw;x++){let m=mapped[y*pw+x];if(m.id==="__skip__"){pcx.fillStyle="#f0f0f0";}else{pcx.fillStyle=`rgb(${m.rgb[0]},${m.rgb[1]},${m.rgb[2]})`;}pcx.fillRect(x*pcs,y*pcs,pcs,pcs);}
  setPreviewUrl(pc.toDataURL());
},[img,sW,sH,maxC,bri,con,sat,dith,skipBg,bgCol,bgTh,smooth,smoothType,orphans,fabricCt]);

useEffect(()=>{
  if(!img)return;
  if(previewTimerRef.current)clearTimeout(previewTimerRef.current);
  previewTimerRef.current=setTimeout(()=>{generatePreview();},400);
  return()=>{if(previewTimerRef.current)clearTimeout(previewTimerRef.current);};
},[generatePreview]);

function setTool(tool){if(activeTool===tool){setActiveTool(null);setBsStart(null);return;}setActiveTool(tool);setBsStart(null);}
function copyText(t,l){navigator.clipboard.writeText(t).then(()=>{setCopied(l);setTimeout(()=>setCopied(null),2000);}).catch(()=>{});}

function resetAll(){
  setPat(null);setPal(null);setCmap(null);setHiId(null);setBsLines([]);setBsStart(null);
  setActiveTool(null);setSelectedColorId(null);setEditHistory([]);setExportPage(0);
  setDone(null);setParkMarkers([]);setHlRow(-1);setHlCol(-1);
  setTotalTime(0);setSessions([]);setThreadOwned({});
  setHasGenerated(false);
  setDimOpen(true);setPalOpen(true);setFabOpen(false);setAdjOpen(false);setBgOpen(false);
  setIsCropping(false);setCropRect(null);
}

function handleFile(e){let f=e.target.files[0];if(!f)return;const MAX_FILE_SIZE = 5 * 1024 * 1024; if(f.size>MAX_FILE_SIZE){alert("File is too large. Please select an image under 5MB.");return;}let rd=new FileReader();rd.onload=ev=>{let i=new Image();i.onload=()=>{setOrigW(i.width);setOrigH(i.height);let a=i.width/i.height;setAr(a);setSW(80);setSH(Math.round(80/a));setImg(i);resetAll();};i.src=ev.target.result;};rd.readAsDataURL(f);}

function chgW(v){let w=Math.max(10,Math.min(300,parseInt(v)||10));setSW(w);if(arLock)setSH(Math.max(10,Math.round(w/ar)));}
function chgH(v){let h=Math.max(10,Math.min(300,parseInt(v)||10));setSH(h);if(arLock)setSW(Math.max(10,Math.round(h*ar)));}
function slRsz(v){chgW(v);}

function srcClick(e){if(!pickBg||!img)return;let r=e.target.getBoundingClientRect(),c=document.createElement("canvas");c.width=img.width;c.height=img.height;let cx=c.getContext("2d");cx.drawImage(img,0,0);let p=cx.getImageData(Math.floor((e.clientX-r.left)*img.width/r.width),Math.floor((e.clientY-r.top)*img.height/r.height),1,1).data;setBgCol([p[0],p[1],p[2]]);setPickBg(false);}

function handleCropMouseDown(e){
  if(!isCropping||!cropRef.current)return;
  e.preventDefault();
  let r=cropRef.current.getBoundingClientRect();
  cropStartRef.current={x:e.clientX-r.left,y:e.clientY-r.top};
  setCropRect({x:cropStartRef.current.x,y:cropStartRef.current.y,w:0,h:0});
}
function handleCropMouseMove(e){
  if(!isCropping||!cropStartRef.current||!cropRef.current)return;
  let r=cropRef.current.getBoundingClientRect();
  let cx=e.clientX-r.left,cy=e.clientY-r.top;
  cx=Math.max(0,Math.min(r.width,cx));cy=Math.max(0,Math.min(r.height,cy));
  let x=Math.min(cropStartRef.current.x,cx),y=Math.min(cropStartRef.current.y,cy);
  let w=Math.abs(cx-cropStartRef.current.x),h=Math.abs(cy-cropStartRef.current.y);
  setCropRect({x,y,w,h});
}
function handleCropMouseUp(e){
  if(!isCropping||!cropStartRef.current)return;
  cropStartRef.current=null;
}
function applyCrop(){
  if(!cropRect||cropRect.w<10||cropRect.h<10||!cropRef.current||!img) {
    setIsCropping(false);
    return;
  }
  let r=cropRef.current.getBoundingClientRect();
  let scaleX=img.width/r.width,scaleY=img.height/r.height;
  let cropX=Math.floor(cropRect.x*scaleX),cropY=Math.floor(cropRect.y*scaleY);
  let cropW=Math.floor(cropRect.w*scaleX),cropH=Math.floor(cropRect.h*scaleY);

  let c=document.createElement("canvas");
  c.width=cropW;c.height=cropH;
  let cx=c.getContext("2d");
  cx.drawImage(img,cropX,cropY,cropW,cropH,0,0,cropW,cropH);

  let newImg=new Image();
  newImg.onload=()=>{
    setImg(newImg);
    setOrigW(newImg.width);
    setOrigH(newImg.height);
    let newAr=newImg.width/newImg.height;
    setAr(newAr);
    if(arLock){
      setSH(Math.max(10,Math.round(sW/newAr)));
    }
    setIsCropping(false);
    setCropRect(null);
    setPat(null);
    setPal(null);
    setCmap(null);
  };
  newImg.src=c.toDataURL();
}

function saveProject(){if(!pat||!pal)return;let project={version:7,page:"creator",settings:{sW,sH,maxC,bri,con,sat,dith,skipBg,bgTh,bgCol,minSt,arLock,ar,fabricCt,skeinPrice,stitchSpeed,smooth,smoothType,orphans},pattern:pat.map(m=>m.id==="__skip__"?{id:"__skip__"}:{id:m.id,type:m.type,rgb:m.rgb}),bsLines,done:done?Array.from(done):null,parkMarkers,totalTime,sessions,hlRow,hlCol,threadOwned,imgData:img?img.src:null};let blob=new Blob([JSON.stringify(project)],{type:"application/json"});let url=URL.createObjectURL(blob);let a=document.createElement("a");a.href=url;a.download="cross-stitch-project.json";document.body.appendChild(a);a.click();document.body.removeChild(a);URL.revokeObjectURL(url);}

function processLoadedProject(project){
  let s=project.settings;setSW(s.sW);setSH(s.sH);setMaxC(s.maxC);setBri(s.bri||0);setCon(s.con||0);setSat(s.sat||0);setDith(!!s.dith);setSkipBg(!!s.skipBg);setBgTh(s.bgTh||15);setBgCol(s.bgCol||[255,255,255]);setMinSt(s.minSt||0);setArLock(s.arLock!==false);setAr(s.ar||1);setBsLines(project.bsLines||[]);
  setSmooth(s.smooth||0);setSmoothType(s.smoothType||"median");setOrphans(s.orphans||0);
  if(s.fabricCt)setFabricCt(s.fabricCt);
  if(s.skeinPrice!=null)setSkeinPrice(s.skeinPrice);
  if(s.stitchSpeed)setStitchSpeed(s.stitchSpeed);
  let restored=project.pattern.map(restoreStitch);
  let{pal:newPal,cmap:newCmap}=buildPalette(restored);
  setPat(restored);setPal(newPal);setCmap(newCmap);setTab("pattern");setActiveTool(null);setSelectedColorId(null);setEditHistory([]);setSidebarOpen(true);
  setThreadOwned(project.threadOwned||{});
  if(project.done&&project.done.length===restored.length)setDone(new Uint8Array(project.done));else setDone(new Uint8Array(restored.length));
  setParkMarkers(project.parkMarkers||[]);setTotalTime(project.totalTime||0);setSessions(project.sessions||[]);
  if(project.hlRow>=0)setHlRow(project.hlRow);if(project.hlCol>=0)setHlCol(project.hlCol);
  if(project.imgData&&typeof project.imgData==='string'&&project.imgData.startsWith('data:image/')){let li=new Image();li.onload=()=>{setImg(li);setOrigW(li.width);setOrigH(li.height);};li.src=project.imgData;}
  setTimeout(()=>{let z=Math.min(3,Math.max(0.05,750/(s.sW*20)));setZoom(z);},100);
}

function loadProject(e){let f=e.target.files[0];if(!f)return;setLoadError(null);let rd=new FileReader();rd.onload=ev=>{try{
  let project=JSON.parse(ev.target.result);if(!project.pattern||!project.settings)throw new Error("Invalid");
  processLoadedProject(project);
}catch(err){console.error(err);setLoadError("Could not load: "+err.message);setTimeout(()=>setLoadError(null),4000);}};rd.readAsText(f);if(loadRef.current)loadRef.current.value="";}

useEffect(() => {
    // Automatically load from IndexedDB on startup
    loadProjectFromDB().then(project => {
        if (project && project.pattern && project.settings) {
            processLoadedProject(project);
        }
    });
}, []);

// Auto-save effect
useEffect(() => {
    if (!pat || !pal) return;
    const saveTimer = setTimeout(() => {
        let project={version:7,page:"creator",settings:{sW,sH,maxC,bri,con,sat,dith,skipBg,bgTh,bgCol,minSt,arLock,ar,fabricCt,skeinPrice,stitchSpeed,smooth,smoothType,orphans},pattern:pat.map(m=>m.id==="__skip__"?{id:"__skip__"}:{id:m.id,type:m.type,rgb:m.rgb}),bsLines,done:done?Array.from(done):null,parkMarkers,totalTime,sessions,hlRow,hlCol,threadOwned,imgData:img?img.src:null};
        saveProjectToDB(project).catch(err => console.error("Auto-save failed:", err));
    }, 1000); // 1-second debounce

    return () => clearTimeout(saveTimer);
}, [pat, pal, sW, sH, maxC, bri, con, sat, dith, skipBg, bgTh, bgCol, minSt, arLock, ar, fabricCt, skeinPrice, stitchSpeed, smooth, smoothType, orphans, bsLines, done, parkMarkers, totalTime, sessions, hlRow, hlCol, threadOwned, img]);



const autoCrop = useCallback(() => {
  if (!pat || !img) return;
  let minX = sW, minY = sH, maxX = -1, maxY = -1;
  let hasStitches = false;
  for (let y = 0; y < sH; y++) {
    for (let x = 0; x < sW; x++) {
      let idx = y * sW + x;
      if (pat[idx].id !== "__skip__") {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
        hasStitches = true;
      }
    }
  }
  if (!hasStitches || (minX === 0 && minY === 0 && maxX === sW - 1 && maxY === sH - 1)) return;

  // Calculate coordinates in the original image
  let pxStart = Math.floor(minX * (img.width / sW));
  let pyStart = Math.floor(minY * (img.height / sH));
  let pxEnd = Math.ceil((maxX + 1) * (img.width / sW));
  let pyEnd = Math.ceil((maxY + 1) * (img.height / sH));
  let cropW = pxEnd - pxStart;
  let cropH = pyEnd - pyStart;

  if (cropW <= 0 || cropH <= 0) return;

  let c = document.createElement("canvas");
  c.width = cropW;
  c.height = cropH;
  let ctx = c.getContext("2d");
  ctx.drawImage(img, pxStart, pyStart, cropW, cropH, 0, 0, cropW, cropH);

  let newImg = new Image();
  newImg.onload = () => {
    setImg(newImg);
    setOrigW(newImg.width);
    setOrigH(newImg.height);
    let newAr = newImg.width / newImg.height;
    setAr(newAr);
    let newSW = maxX - minX + 1;
    let newSH = maxY - minY + 1;
    setSW(newSW);
    setSH(newSH);
    // Resetting pat to trigger the preview logic and allow user to hit generate
    setPat(null);
    setPal(null);
    setCmap(null);
  };
  newImg.src = c.toDataURL();
}, [pat, img, sW, sH]);

const generate=useCallback(()=>{
  if(!img)return;setBusy(true);setHiId(null);setExportPage(0);
  setTimeout(()=>{try{
    let c=document.createElement("canvas");c.width=sW;c.height=sH;let cx=c.getContext("2d");
    cx.filter=`brightness(${100+bri}%) contrast(${100+con}%) saturate(${100+sat}%)`;
    cx.drawImage(img,0,0,sW,sH);cx.filter="none";let raw=cx.getImageData(0,0,sW,sH).data;
    if(smooth>0){if(smoothType==="gaussian")applyGaussianBlur(raw,sW,sH,smooth);else applyMedianFilter(raw,sW,sH,smooth);}
    let p=quantize(raw,sW,sH,maxC);if(!p.length){setBusy(false);return;}
    let mapped=dith?doDither(raw,sW,sH,p):doMap(raw,sW,sH,p);
    if(skipBg){let bl=rgbToLab(bgCol[0],bgCol[1],bgCol[2]);for(let i=0;i<mapped.length;i++){if(dE(rgbToLab(raw[i*4],raw[i*4+1],raw[i*4+2]),bl)<bgTh)mapped[i]={type:"skip",id:"__skip__",rgb:[255,255,255],lab:[100,0,0]};}}
    if(minSt>0){for(let pass=0;pass<3;pass++){let{pal:ep}=buildPalette(mapped);let rare=ep.filter(e=>e.count<minSt),keep=ep.filter(e=>e.count>=minSt);if(!rare.length||!keep.length)break;let rm2={};rare.forEach(r=>{let b=null,bd=1e9;keep.forEach(k=>{let d=dE(r.lab,k.lab);if(d<bd){bd=d;b=k.id;}});if(b)rm2[r.id]=b;});let changed=false;let keepMap={};keep.forEach(k=>{keepMap[k.id]=k;});for(let i=0;i<mapped.length;i++){if(mapped[i].id!=="__skip__"&&rm2[mapped[i].id]){mapped[i]={...keepMap[rm2[mapped[i].id]]};changed=true;}}if(!changed)break;}}
    for(let safe=0;safe<5;safe++){let ids=new Set();for(let i=0;i<mapped.length;i++){let m=mapped[i];if(m.id==="__skip__")continue;if(m.type==="blend"&&m.threads)m.threads.forEach(t=>ids.add(t.id));else ids.add(m.id);}if(ids.size<=maxC)break;let tu={};for(let i=0;i<mapped.length;i++){let m=mapped[i];if(m.id==="__skip__")continue;if(m.type==="blend"&&m.threads)m.threads.forEach(t=>{tu[t.id]=(tu[t.id]||0)+1;});else tu[m.id]=(tu[m.id]||0)+1;}let sorted=Object.entries(tu).sort((a,b)=>b[1]-a[1]);let ks=new Set(sorted.slice(0,maxC).map(e=>e[0]));let kp=p.filter(t=>ks.has(t.id));if(!kp.length)break;for(let i=0;i<mapped.length;i++){let m=mapped[i];if(m.id==="__skip__")continue;let nr=m.type==="blend"&&m.threads?m.threads.some(t=>!ks.has(t.id)):!ks.has(m.id);if(nr)mapped[i]=findSolid(m.lab||rgbToLab(raw[i*4],raw[i*4+1],raw[i*4+2]),kp);}}
    if(orphans>0)mapped=removeOrphanStitches(mapped,sW,sH,orphans);
    let{pal:newPal,cmap:newCmap}=buildPalette(mapped);
    setPal(newPal);setCmap(newCmap);setPat(mapped);setDone(new Uint8Array(mapped.length));setParkMarkers([]);setTab("pattern");setThreadOwned({});
    if(!hasGenerated){
      setDimOpen(false);setPalOpen(false);setFabOpen(false);setAdjOpen(false);setBgOpen(false);
      setHasGenerated(true);
    }
    let z=Math.min(3,Math.max(0.05,750/(sW*20)));setTimeout(()=>{setZoom(z);},0);
  }catch(err){console.error(err);}setBusy(false);},50);
},[img,sW,sH,maxC,bri,con,sat,dith,skipBg,bgCol,bgTh,minSt,smooth,smoothType,orphans,hasGenerated]);

// ═══ Canvas drawing ═══
function drawPattern(ctx,offX,offY,dW,dH,cSz,gut, viewportRect=null, showOverlayImg=false, op=0.3){
  let startX = 0, startY = 0, endX = dW, endY = dH;
  if (viewportRect) {
    startX = Math.max(0, Math.floor((viewportRect.left - gut) / cSz) - 1);
    startY = Math.max(0, Math.floor((viewportRect.top - gut) / cSz) - 1);
    endX = Math.min(dW, Math.ceil((viewportRect.right - gut) / cSz) + 1);
    endY = Math.min(dH, Math.ceil((viewportRect.bottom - gut) / cSz) + 1);

    ctx.clearRect(Math.max(0, viewportRect.left), Math.max(0, viewportRect.top), viewportRect.width, viewportRect.height);
    ctx.fillStyle="#fff";ctx.fillRect(Math.max(0, viewportRect.left), Math.max(0, viewportRect.top), viewportRect.width, viewportRect.height);
  } else {
    ctx.fillStyle="#fff";ctx.fillRect(0,0,gut+dW*cSz+2,gut+dH*cSz+2);
  }

  if (showOverlayImg && img) {
    ctx.globalAlpha = op;
    ctx.drawImage(img, gut, gut, dW * cSz, dH * cSz);
    ctx.globalAlpha = 1.0;
  }
  ctx.fillStyle="#a1a1aa";ctx.font=`${Math.max(7,Math.min(11,cSz*0.5))}px system-ui`;ctx.textAlign="center";ctx.textBaseline="middle";

  if (!viewportRect || viewportRect.top <= gut) {
      for(let x=startX;x<endX;x+=1){
          if(x%10===0) ctx.fillText(String(offX+x+1),gut+x*cSz+cSz/2,gut/2);
      }
  }
  if (!viewportRect || viewportRect.left <= gut) {
      ctx.textAlign="right";
      for(let y=startY;y<endY;y+=1){
          if(y%10===0) ctx.fillText(String(offY+y+1),gut-3,gut+y*cSz+cSz/2);
      }
  }

  for(let y2=startY;y2<endY;y2++)for(let x2=startX;x2<endX;x2++){let idx=(offY+y2)*sW+(offX+x2);let m=pat[idx];if(!m)continue;let info=m.id==="__skip__"?null:(cmap?cmap[m.id]:null);let px=gut+x2*cSz,py=gut+y2*cSz;let isHi=!hiId||m.id===hiId;let dim=hiId&&!isHi&&m.id!=="__skip__";
    if(m.id==="__skip__"){
      if(showOverlayImg){
        ctx.globalAlpha=0.2;drawCk(ctx,px,py,cSz);ctx.globalAlpha=1.0;
      }else{
        drawCk(ctx,px,py,cSz);
      }
    }
    else if(view==="color"||view==="both"){
      let alpha = 1.0;
      if (dim) alpha = 0.15;
      else if (showOverlayImg) {
        alpha = view === "both" ? 0.4 : 0.5;
      }
      ctx.fillStyle=`rgba(${m.rgb[0]},${m.rgb[1]},${m.rgb[2]},${alpha})`;ctx.fillRect(px,py,cSz,cSz);
    }
    else{
      let alpha = 1.0;
      if (showOverlayImg) alpha = 0.3;
      ctx.fillStyle=dim?"rgba(245,245,245,"+alpha+")":`rgba(255,255,255,${alpha})`;ctx.fillRect(px,py,cSz,cSz);
    }
    if(m.id!=="__skip__"&&(view==="symbol"||view==="both")&&info&&cSz>=6){let lum=luminance(m.rgb);ctx.fillStyle=dim?"rgba(0,0,0,0.08)":(view==="both"?(lum>128?"#000":"#fff"):"#333");ctx.font=`bold ${Math.max(6,cSz*0.6)}px monospace`;ctx.textAlign="center";ctx.textBaseline="middle";ctx.fillText(info.symbol,px+cSz/2,py+cSz/2);}
    if(cSz>=4){
      let sAlpha = dim ? 0.03 : 0.08;
      if (showOverlayImg) sAlpha = dim ? 0.01 : 0.04;
      ctx.strokeStyle=`rgba(0,0,0,${sAlpha})`;ctx.strokeRect(px,py,cSz,cSz);
    }
  }
  if(cSz>=3){ctx.strokeStyle="rgba(0,0,0,0.2)";ctx.lineWidth=cSz>=8?1.5:1;for(let gx=Math.floor(startX/10)*10;gx<=endX;gx+=10){ctx.beginPath();ctx.moveTo(gut+gx*cSz, Math.max(gut, viewportRect ? viewportRect.top : 0));ctx.lineTo(gut+gx*cSz, Math.min(gut+dH*cSz, viewportRect ? viewportRect.bottom : gut+dH*cSz));ctx.stroke();}for(let gy=Math.floor(startY/10)*10;gy<=endY;gy+=10){ctx.beginPath();ctx.moveTo(Math.max(gut, viewportRect ? viewportRect.left : 0), gut+gy*cSz);ctx.lineTo(Math.min(gut+dW*cSz, viewportRect ? viewportRect.right : gut+dW*cSz), gut+gy*cSz);ctx.stroke();}}
  if(showCtr){ctx.strokeStyle="rgba(200,60,60,0.3)";ctx.lineWidth=1.5;ctx.setLineDash([6,4]);let cx2=Math.floor(sW/2)-offX,cy2=Math.floor(sH/2)-offY;if(cx2>=startX&&cx2<=endX){ctx.beginPath();ctx.moveTo(gut+cx2*cSz, Math.max(gut, viewportRect ? viewportRect.top : 0));ctx.lineTo(gut+cx2*cSz, Math.min(gut+dH*cSz, viewportRect ? viewportRect.bottom : gut+dH*cSz));ctx.stroke();}if(cy2>=startY&&cy2<=endY){ctx.beginPath();ctx.moveTo(Math.max(gut, viewportRect ? viewportRect.left : 0), gut+cy2*cSz);ctx.lineTo(Math.min(gut+dW*cSz, viewportRect ? viewportRect.right : gut+dW*cSz), gut+cy2*cSz);ctx.stroke();}ctx.setLineDash([]);}
  if(bsLines.length>0){
    ctx.lineCap="round";
    let hx = hoverCoords ? hoverCoords.gx - offX : null;
    let hy = hoverCoords ? hoverCoords.gy - offY : null;
    bsLines.forEach(ln=>{
      let lx1=ln.x1-offX,ly1=ln.y1-offY,lx2=ln.x2-offX,ly2=ln.y2-offY;
      let isHoveredErase = false;
      if (activeTool === "eraseBs" && hx !== null && hy !== null) {
        let A=hx-lx1,B=hy-ly1,C=lx2-lx1,D=ly2-ly1;
        let dot=A*C+B*D,lenSq=C*C+D*D;
        let param=-1;
        if(lenSq!==0)param=dot/lenSq;
        let xx,yy;
        if(param<0){xx=lx1;yy=ly1;}
        else if(param>1){xx=lx2;yy=ly2;}
        else{xx=lx1+param*C;yy=ly1+param*D;}
        let dx=hx-xx,dy=hy-yy;
        if (Math.sqrt(dx*dx+dy*dy) <= 0.4) isHoveredErase = true;
      }
      if(lx1>=0&&lx1<=dW&&ly1>=0&&ly1<=dH&&lx2>=0&&lx2<=dW&&ly2>=0&&ly2<=dH){
        ctx.strokeStyle=isHoveredErase?"#ef4444":"#333";
        ctx.lineWidth=Math.max(2,cSz*(isHoveredErase?0.25:0.15));
        ctx.beginPath();ctx.moveTo(gut+lx1*cSz,gut+ly1*cSz);ctx.lineTo(gut+lx2*cSz,gut+ly2*cSz);ctx.stroke();
      }
    });
  }
  if(bsStart&&activeTool==="backstitch"){
    let sx=bsStart.x-offX,sy=bsStart.y-offY;
    if(sx>=0&&sx<=dW&&sy>=0&&sy<=dH){
      ctx.fillStyle="rgba(220,50,50,0.8)";ctx.beginPath();ctx.arc(gut+sx*cSz,gut+sy*cSz,Math.max(3,cSz*0.2),0,Math.PI*2);ctx.fill();
    }
    if(hoverCoords){
      let hx=hoverCoords.gx-offX,hy=hoverCoords.gy-offY;
      ctx.strokeStyle="rgba(50,50,50,0.5)";ctx.lineWidth=Math.max(2,cSz*0.15);ctx.setLineDash([4,4]);
      ctx.beginPath();ctx.moveTo(gut+sx*cSz,gut+sy*cSz);ctx.lineTo(gut+hx*cSz,gut+hy*cSz);ctx.stroke();ctx.setLineDash([]);
    }
  }

  if (hoverCoords && (activeTool === "paint" || activeTool === "fill") && selectedColorId && cmap) {
    let hx = hoverCoords.gx - offX, hy = hoverCoords.gy - offY;
    if (hx >= 0 && hx < dW && hy >= 0 && hy < dH) {
      ctx.strokeStyle = `rgba(${cmap[selectedColorId].rgb[0]},${cmap[selectedColorId].rgb[1]},${cmap[selectedColorId].rgb[2]},0.8)`;
      ctx.lineWidth = Math.max(2, cSz * 0.15);
      ctx.strokeRect(gut + hx * cSz + 1, gut + hy * cSz + 1, cSz - 2, cSz - 2);
      ctx.fillStyle = `rgba(${cmap[selectedColorId].rgb[0]},${cmap[selectedColorId].rgb[1]},${cmap[selectedColorId].rgb[2]},0.3)`;
      ctx.fillRect(gut + hx * cSz + 1, gut + hy * cSz + 1, cSz - 2, cSz - 2);
      ctx.lineWidth = 1;
    }
  }

  ctx.strokeStyle="rgba(0,0,0,0.4)";ctx.lineWidth=2;ctx.strokeRect(gut,gut,dW*cSz,dH*cSz);ctx.lineWidth=1;
}

const renderPattern=useCallback(()=>{if(!pat||!cmap||!pcRef.current||tab!=="pattern")return;
  let canvas = pcRef.current;
  if (canvas.width !== sW*cs+G+2 || canvas.height !== sH*cs+G+2) {
    canvas.width=sW*cs+G+2;canvas.height=sH*cs+G+2;
  }
  let viewportRect = null;
  if (scrollRef.current) {
    viewportRect = {
      left: scrollRef.current.scrollLeft,
      top: scrollRef.current.scrollTop,
      width: scrollRef.current.clientWidth,
      height: scrollRef.current.clientHeight,
      right: scrollRef.current.scrollLeft + scrollRef.current.clientWidth,
      bottom: scrollRef.current.scrollTop + scrollRef.current.clientHeight
    };
  }
  drawPattern(canvas.getContext("2d"),0,0,sW,sH,cs,G, viewportRect, showOverlay && !!img, overlayOpacity);
},[pat,cmap,cs,sW,sH,view,hiId,showCtr,bsLines,bsStart,activeTool,tab,hoverCoords,selectedColorId,showOverlay,overlayOpacity,img]);
useEffect(()=>renderPattern(),[renderPattern]);

const renderExport=useCallback(()=>{if(tab!=="export"||!expRef.current||!pat||!cmap)return;let epC=exportPage%pxX,epR=Math.floor(exportPage/pxX),eX0=epC*A4W,eY0=epR*A4H,eW=Math.min(A4W,sW-eX0),eH=Math.min(A4H,sH-eY0),dW2=pageMode?eW:sW,dH2=pageMode?eH:sH,oX2=pageMode?eX0:0,oY2=pageMode?eY0:0,expCs=Math.max(8,Math.min(20,Math.floor(750/Math.max(dW2,dH2))));expRef.current.width=dW2*expCs+G+2;expRef.current.height=dH2*expCs+G+2;drawPattern(expRef.current.getContext("2d"),oX2,oY2,dW2,dH2,expCs,G);},[tab,pat,cmap,sW,sH,pageMode,exportPage,pxX,view,hiId,showCtr,bsLines]);
useEffect(()=>renderExport(),[renderExport]);


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
    if (!m || m.id === "__skip__") {
      d[idx] = 255; d[idx+1] = 255; d[idx+2] = 255; d[idx+3] = 255;
    } else {
      d[idx] = m.rgb[0]; d[idx+1] = m.rgb[1]; d[idx+2] = m.rgb[2]; d[idx+3] = 255;
    }
  }
  ctx.putImageData(imgData, 0, 0);
  return c.toDataURL("image/jpeg", 0.85);
}

function exportPDF(){if(!pat||!pal||!cmap)return;const{jsPDF}=window.jspdf;const pdf=new jsPDF("portrait","mm","a4");const mg=12,cW2=186;

  // --- Cover Sheet Generation ---
  (function(){


  const mg=15;
  let y=mg;
  // Title
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


  // Pattern info
  pdf.setFontSize(11);pdf.setTextColor(100);pdf.text("PATTERN SUMMARY",mg,y);y+=7;
  pdf.setFontSize(10);pdf.setTextColor(40);
  let div2=fabricCt===28?14:fabricCt;let wIn2=sW/div2,hIn2=sH/div2;
  let infoLines=[
    ["Pattern size",`${sW} × ${sH} stitches`],
    ["Stitchable stitches",totalStitchable.toLocaleString()],
    ["Colours",`${pal.length} (${blendCount} blend${blendCount!==1?"s":""})`],
    ["Skeins needed",`${totalSkeins}`],
    ["Fabric",`${fabricCt} count`],
    ["Finished size",`${wIn2.toFixed(1)}″ × ${hIn2.toFixed(1)}″ (${(wIn2*2.54).toFixed(1)} × ${(hIn2*2.54).toFixed(1)} cm)`],
    ["With 1″ margin",`${(wIn2+2).toFixed(0)}″ × ${(hIn2+2).toFixed(0)}″`],
    ["Est. time",fmtTimeL(Math.round(totalStitchable/stitchSpeed*3600))+` (at ${stitchSpeed} st/hr)`],
    ["Difficulty",difficulty?difficulty.label:"—"],
    ["Est. thread cost",`£${(totalSkeins*skeinPrice).toFixed(2)} (at £${skeinPrice.toFixed(2)}/skein)`],
  ];
  infoLines.forEach(([l,v])=>{pdf.setTextColor(120);pdf.text(l+":",mg,y);pdf.setTextColor(40);pdf.text(v,mg+50,y);y+=5.5;});
  y+=6;

  // Progress if any
  if(done&&totalStitchable>0){
    let localDoneCount=0;for(let i=0;i<done.length;i++)if(done[i])localDoneCount++;
    if(localDoneCount>0){
      let localProgressPct=Math.round(localDoneCount/totalStitchable*1000)/10;
      pdf.setFontSize(11);pdf.setTextColor(100);pdf.text("PROGRESS",mg,y);y+=7;pdf.setFontSize(10);pdf.setTextColor(40);pdf.text(`${localProgressPct}% complete — ${localDoneCount.toLocaleString()} of ${totalStitchable.toLocaleString()} stitches`,mg,y);y+=8;if(totalTime>0){pdf.text(`Time stitched: ${fmtTimeL(totalTime)} (${sessions.length} session${sessions.length!==1?"s":""})`,mg,y);y+=5.5;let actualSpeed=Math.round(localDoneCount/(totalTime/3600));pdf.text(`Actual speed: ${actualSpeed} stitches/hr`,mg,y);y+=5.5;}y+=4;
    }
  }

  // Thread list
  pdf.setFontSize(11);pdf.setTextColor(100);pdf.text("THREAD LIST",mg,y);y+=7;
  pdf.setFontSize(8);pdf.setTextColor(80);pdf.text("DMC",mg,y);pdf.text("Name",mg+20,y);pdf.text("Skeins",mg+100,y);pdf.text("Status",mg+120,y);y+=2;
  pdf.setDrawColor(200);pdf.line(mg,y,180,y);y+=4;
  pdf.setFontSize(9);
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

  // Notes section
  if(y<240){pdf.setFontSize(11);pdf.setTextColor(100);pdf.text("NOTES",mg,y);y+=4;pdf.setDrawColor(220);for(let nl=0;nl<8;nl++){y+=7;pdf.line(mg,y,180,y);}}


  })();
  // --- End Cover Sheet ---
  pdf.addPage();
  pdf.setTextColor(0);let ty=mg+10;pdf.setFontSize(14);pdf.text("Thread Legend",mg,ty);ty+=8;pdf.setFontSize(8);pal.forEach(p=>{if(ty>285){pdf.addPage();ty=mg+8;}pdf.setFillColor(p.rgb[0],p.rgb[1],p.rgb[2]);pdf.circle(mg+4,ty-1.5,2,"F");pdf.setTextColor(0);let sk=skeinEst(p.count,fabricCt);pdf.text(p.symbol+" DMC "+p.id+" "+(p.type==="blend"?p.threads[0].name+"+"+p.threads[1].name:p.name)+" ("+p.count+" st, "+sk+" skein"+(sk>1?"s":"")+")",mg+10,ty);ty+=5;});
  const cellMM=3,gridCols=Math.floor(cW2/cellMM),gridRows=Math.floor(275/cellMM),pagesX=Math.ceil(sW/gridCols),pagesY=Math.ceil(sH/gridRows);

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

        for(let gy=0;gy<dH;gy++){
          for(let gx=0;gx<dW;gx++){
            let m=pat[(y0+gy)*sW+(x0+gx)];
            if(!m||m.id==="__skip__") continue;
            let info=cmap[m.id],px3=mg+gx*cellMM,py3=mg+8+gy*cellMM;
            let isOverlap=gx>=mainW||gy>=mainH;
            if(isOverlap){pdf.setGState(new pdf.GState({opacity:0.4}));}
            if(!isBackstitchOnly) {
              pdf.setFillColor(m.rgb[0],m.rgb[1],m.rgb[2]);
              pdf.rect(px3,py3,cellMM,cellMM,"F");
            }
            pdf.setDrawColor(isBackstitchOnly ? 220 : 200);
            pdf.rect(px3,py3,cellMM,cellMM,"S");
            if(!isBackstitchOnly && info){
              pdf.setFontSize(5);
              pdf.setTextColor(luminance(m.rgb)>128?0:255);
              pdf.text(info.symbol,px3+cellMM/2,py3+cellMM*0.7,{align:"center"});
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
      }
    }
  }

  drawChartPages(false);
  if (bsLines && bsLines.length > 0) {
    drawChartPages(true);
  }

  pdf.save("cross-stitch-pattern.pdf");
}

function exportCoverSheet(){
  if(!pat||!pal||!cmap)return;
  const{jsPDF}=window.jspdf;const pdf=new jsPDF("portrait","mm","a4");const mg=15;
  let y=mg;
  // Title
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


  // Pattern info
  pdf.setFontSize(11);pdf.setTextColor(100);pdf.text("PATTERN SUMMARY",mg,y);y+=7;
  pdf.setFontSize(10);pdf.setTextColor(40);
  let div2=fabricCt===28?14:fabricCt;let wIn2=sW/div2,hIn2=sH/div2;
  let infoLines=[
    ["Pattern size",`${sW} × ${sH} stitches`],
    ["Stitchable stitches",totalStitchable.toLocaleString()],
    ["Colours",`${pal.length} (${blendCount} blend${blendCount!==1?"s":""})`],
    ["Skeins needed",`${totalSkeins}`],
    ["Fabric",`${fabricCt} count`],
    ["Finished size",`${wIn2.toFixed(1)}″ × ${hIn2.toFixed(1)}″ (${(wIn2*2.54).toFixed(1)} × ${(hIn2*2.54).toFixed(1)} cm)`],
    ["With 1″ margin",`${(wIn2+2).toFixed(0)}″ × ${(hIn2+2).toFixed(0)}″`],
    ["Est. time",fmtTimeL(Math.round(totalStitchable/stitchSpeed*3600))+` (at ${stitchSpeed} st/hr)`],
    ["Difficulty",difficulty?difficulty.label:"—"],
    ["Est. thread cost",`£${(totalSkeins*skeinPrice).toFixed(2)} (at £${skeinPrice.toFixed(2)}/skein)`],
  ];
  infoLines.forEach(([l,v])=>{pdf.setTextColor(120);pdf.text(l+":",mg,y);pdf.setTextColor(40);pdf.text(v,mg+50,y);y+=5.5;});
  y+=6;

  // Progress if any
  if(done&&totalStitchable>0){
    let localDoneCount=0;for(let i=0;i<done.length;i++)if(done[i])localDoneCount++;
    if(localDoneCount>0){
      let localProgressPct=Math.round(localDoneCount/totalStitchable*1000)/10;
      pdf.setFontSize(11);pdf.setTextColor(100);pdf.text("PROGRESS",mg,y);y+=7;pdf.setFontSize(10);pdf.setTextColor(40);pdf.text(`${localProgressPct}% complete — ${localDoneCount.toLocaleString()} of ${totalStitchable.toLocaleString()} stitches`,mg,y);y+=8;if(totalTime>0){pdf.text(`Time stitched: ${fmtTimeL(totalTime)} (${sessions.length} session${sessions.length!==1?"s":""})`,mg,y);y+=5.5;let actualSpeed=Math.round(localDoneCount/(totalTime/3600));pdf.text(`Actual speed: ${actualSpeed} stitches/hr`,mg,y);y+=5.5;}y+=4;
    }
  }

  // Thread list
  pdf.setFontSize(11);pdf.setTextColor(100);pdf.text("THREAD LIST",mg,y);y+=7;
  pdf.setFontSize(8);pdf.setTextColor(80);pdf.text("DMC",mg,y);pdf.text("Name",mg+20,y);pdf.text("Skeins",mg+100,y);pdf.text("Status",mg+120,y);y+=2;
  pdf.setDrawColor(200);pdf.line(mg,y,180,y);y+=4;
  pdf.setFontSize(9);
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

  // Notes section
  if(y<240){pdf.setFontSize(11);pdf.setTextColor(100);pdf.text("NOTES",mg,y);y+=4;pdf.setDrawColor(220);for(let nl=0;nl<8;nl++){y+=7;pdf.line(mg,y,180,y);}}

  pdf.save("cross-stitch-cover-sheet.pdf");
}

function handlePatClick(e){
  if(!pcRef.current||!pat)return;
  let gc=gridCoord(pcRef,e,cs,G,activeTool==="backstitch");
  if(!gc)return;let{gx,gy}=gc;
  if((activeTool==="paint"||activeTool==="fill")&&selectedColorId&&cmap){
    if(gx<0||gx>=sW||gy<0||gy>=sH)return;let idx=gy*sW+gx;if(pat[idx].id==="__skip__")return;
    let pe=cmap[selectedColorId];if(!pe)return;let np=pat.slice();
    if(activeTool==="fill"){let ch=[],vis=new Set(),q=[idx],tid=pat[idx].id;if(tid===pe.id)return;while(q.length){let id2=q.pop();if(vis.has(id2))continue;vis.add(id2);if(pat[id2].id!==tid)continue;ch.push({idx:id2,old:{...pat[id2]}});let x2=id2%sW,y2=Math.floor(id2/sW);if(x2>0)q.push(id2-1);if(x2<sW-1)q.push(id2+1);if(y2>0)q.push(id2-sW);if(y2<sH-1)q.push(id2+sW);}if(!ch.length)return;setEditHistory(prev=>[...prev,{type:"fill",changes:ch}]);ch.forEach(c2=>np[c2.idx]={...pe});}
    else{setEditHistory(prev=>[...prev,{type:"paint",changes:[{idx,old:{...pat[idx]}}]}]);np[idx]={...pe};}
    setPat(np);let{pal:np2,cmap:nc}=buildPalette(np);setPal(np2);setCmap(nc);return;
  }
  if(activeTool==="backstitch"){if(gx<0||gx>sW||gy<0||gy>sH)return;let pt={x:gx,y:gy};if(!bsStart)setBsStart(pt);else{setBsLines(prev=>[...prev,{x1:bsStart.x,y1:bsStart.y,x2:pt.x,y2:pt.y}]);setBsStart(bsContinuous?pt:null);}}
  if(activeTool==="eraseBs"){
    if(bsLines.length===0)return;
    let closestIdx=-1,minD=Infinity;
    bsLines.forEach((ln,i)=>{
      let A=gx-ln.x1,B=gy-ln.y1,C=ln.x2-ln.x1,D=ln.y2-ln.y1;
      let dot=A*C+B*D,lenSq=C*C+D*D;
      let param=-1;
      if(lenSq!==0)param=dot/lenSq;
      let xx,yy;
      if(param<0){xx=ln.x1;yy=ln.y1;}
      else if(param>1){xx=ln.x2;yy=ln.y2;}
      else{xx=ln.x1+param*C;yy=ln.y1+param*D;}
      let dx=gx-xx,dy=gy-yy;
      let d = Math.sqrt(dx*dx+dy*dy);
      if(d<minD){minD=d;closestIdx=i;}
    });
    if(minD<=0.4&&closestIdx>=0){
      let nBs=[...bsLines];nBs.splice(closestIdx,1);setBsLines(nBs);
    }
  }
}

function handlePatMouseMove(e){
  if(!pcRef.current||!pat||!activeTool)return;
  let gc=gridCoord(pcRef,e,cs,G,activeTool==="backstitch"||activeTool==="eraseBs");
  if(!gc)return;
  if(!hoverCoords||hoverCoords.gx!==gc.gx||hoverCoords.gy!==gc.gy)setHoverCoords(gc);
}

function handlePatMouseLeave(){setHoverCoords(null);}

useEffect(()=>{
  function handleKeyDown(e){
    if(e.key==="Escape" && activeTool==="backstitch" && bsStart){
      setBsStart(null);
    }
  }
  window.addEventListener("keydown",handleKeyDown);
  return ()=>window.removeEventListener("keydown",handleKeyDown);
},[activeTool,bsStart]);

// Thread organiser helpers
function toggleOwned(id){setThreadOwned(prev=>{let cur=prev[id]||"";let next=cur===""?"owned":cur==="owned"?"tobuy":"";return{...prev,[id]:next};});}
const ownedCount=useMemo(()=>skeinData.filter(d=>(threadOwned[d.id]||"")==="owned").length,[skeinData,threadOwned]);
const toBuyCount=useMemo(()=>skeinData.filter(d=>(threadOwned[d.id]||"")==="tobuy"||!(threadOwned[d.id])).length,[skeinData,threadOwned]);
const toBuyList=useMemo(()=>skeinData.filter(d=>(threadOwned[d.id]||"")!=="owned"),[skeinData,threadOwned]);

return(
<>
<Header page="creator" onNewProject={()=>{if(!pat||confirm("Start a new project? Unsaved progress will be lost.")){resetAll();setImg(null);}}} onExportPDF={pat ? exportPDF : null} setModal={setModal} />
<div style={{maxWidth:1100,margin:"0 auto",padding:"20px 16px"}}>
  <div style={{marginBottom:12,display:"flex",justifyContent:"flex-end",alignItems:"center",flexWrap:"wrap",gap:8}}>
    <div style={{display:"flex",gap:6}}><input ref={loadRef} type="file" accept=".json" onChange={loadProject} style={{display:"none"}}/><button onClick={()=>loadRef.current.click()} style={{padding:"5px 12px",fontSize:12,borderRadius:8,border:"0.5px solid #e4e4e7",background:"#fafafa",cursor:"pointer",color:"#71717a",fontWeight:500}}>Open</button>{pat&&pal&&<button onClick={saveProject} style={{padding:"5px 12px",fontSize:12,borderRadius:8,border:"none",background:"#0d9488",color:"#fff",cursor:"pointer",fontWeight:500}}>Save</button>}</div>
  </div>
  {loadError&&<div style={{background:"#fef2f2",border:"1px solid #fecaca",borderRadius:8,padding:"8px 14px",fontSize:12,color:"#dc2626",marginBottom:12}}>{loadError}</div>}

  {!img&&<div style={{maxWidth:700, margin:"40px auto", textAlign:"center"}}>
    <h1 style={{fontSize:28, fontWeight:700, color:"#18181b", marginBottom:8}}>Welcome to Cross Stitch Pattern Generator</h1>
    <p style={{fontSize:15, color:"#71717a", marginBottom:32}}>Turn any photo into a detailed pattern, or continue working on an existing project.</p>

    <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit, minmax(300px, 1fr))",gap:24}}>
      <div onClick={()=>fRef.current.click()} className="upload-area">
        <svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect><circle cx="8.5" cy="8.5" r="1.5"></circle><polyline points="21 15 16 10 5 21"></polyline></svg>
        <div>
          <div style={{fontWeight:600,fontSize:18,color:"#18181b",marginBottom:4}}>Create New Pattern</div>
          <div style={{color:"#71717a",fontSize:14}}>Upload an image (JPG, PNG)</div>
        </div>
      </div>
      <div onClick={()=>loadRef.current.click()} className="upload-area">
        <svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path></svg>
        <div>
          <div style={{fontWeight:600,fontSize:18,color:"#18181b",marginBottom:4}}>Load Existing Project</div>
          <div style={{color:"#71717a",fontSize:14}}>Open a saved JSON file</div>
        </div>
      </div>
    </div>
  </div>}
  <input ref={fRef} type="file" accept="image/*" onChange={handleFile} style={{display:"none"}}/>

  {img&&<div style={{display:"flex",gap:20,flexWrap:"wrap"}}>
    {tab!=="stitch"&&<div style={{flex:sidebarOpen?"0 0 280px":"0 0 auto",display:"flex",flexDirection:"column",gap:sidebarOpen?10:0,overflow:"hidden"}}>
      {pat&&<button onClick={()=>setSidebarOpen(!sidebarOpen)} style={{padding:"5px 10px",fontSize:12,fontWeight:500,background:"#f4f4f5",border:"0.5px solid #e4e4e7",borderRadius:8,cursor:"pointer",color:"#71717a",alignSelf:sidebarOpen?"flex-end":"flex-start",whiteSpace:"nowrap"}}>{sidebarOpen?"◀ Hide":"▶ Settings"}</button>}
      {sidebarOpen&&<>
      {pat&&<div className="card">
        <div style={{position:"relative"}} ref={cropRef} onMouseDown={handleCropMouseDown} onMouseMove={handleCropMouseMove} onMouseUp={handleCropMouseUp} onMouseLeave={handleCropMouseUp}>
          <img src={img.src} alt="" style={{width:"100%",display:"block",cursor:isCropping?"crosshair":(pickBg?"crosshair":"default"),opacity:isCropping?0.7:1}} onClick={srcClick}/>
          {isCropping&&cropRect&&<div style={{position:"absolute",left:cropRect.x,top:cropRect.y,width:cropRect.w,height:cropRect.h,border:"2px dashed #0d9488",background:"rgba(13, 148, 136, 0.2)",boxSizing:"border-box",pointerEvents:"none"}}/>}
        </div>
        {isCropping ? <div style={{padding:"6px 12px",display:"flex",justifyContent:"space-between",alignItems:"center",borderTop:"0.5px solid #f4f4f5"}}>
          <span style={{fontSize:11,color:"#a1a1aa"}}>Draw a rectangle</span>
          <div style={{display:"flex",gap:6}}>
            <button onClick={()=>{setIsCropping(false);setCropRect(null);}} style={{fontSize:11,padding:"3px 8px",cursor:"pointer",border:"0.5px solid #e4e4e7",borderRadius:6,background:"#fafafa"}}>Cancel</button>
            <button onClick={applyCrop} style={{fontSize:11,padding:"3px 8px",cursor:"pointer",border:"none",borderRadius:6,background:"#0d9488",color:"#fff"}}>Apply</button>
          </div>
        </div> : <div style={{padding:"6px 12px",display:"flex",justifyContent:"space-between",alignItems:"center",borderTop:"0.5px solid #f4f4f5"}}>
          <span style={{fontSize:11,color:"#a1a1aa"}}>{origW}×{origH}px</span>
          <div style={{display:"flex",gap:6}}>
            <button onClick={()=>{setIsCropping(true);setCropRect(null);}} style={{fontSize:11,padding:"3px 8px",cursor:"pointer",border:"0.5px solid #e4e4e7",borderRadius:6,background:"#fafafa"}}>Crop</button>
            <button onClick={()=>fRef.current.click()} style={{fontSize:11,padding:"3px 8px",cursor:"pointer",border:"0.5px solid #e4e4e7",borderRadius:6,background:"#fafafa"}}>Change</button>
          </div>
        </div>}
        {pickBg&&<div style={{padding:"6px 12px",fontSize:11,color:"#ea580c",fontWeight:600,background:"#fff7ed"}}>Click to pick BG</div>}
      </div>}

      <Section title="Dimensions" isOpen={dimOpen} onToggle={setDimOpen} badge={<span style={{fontSize:11,fontWeight:500,color:"#71717a",background:"#f4f4f5",padding:"1px 8px",borderRadius:10}}>{sW}×{sH}</span>}>
        <label style={{display:"flex",alignItems:"center",gap:6,fontSize:12,cursor:"pointer",marginBottom:8,marginTop:8}}><input type="checkbox" checked={arLock} onChange={e=>setArLock(e.target.checked)}/>Lock aspect ratio</label>
        {arLock?<SliderRow label="Size" value={sW} min={10} max={300} onChange={slRsz} suffix=" st"/>
        :<div style={{display:"flex",gap:10}}>
          <div style={{flex:1}}><label style={{fontSize:11,color:"#a1a1aa",display:"block",marginBottom:2}}>Width</label><input type="number" value={sW} onChange={e=>chgW(e.target.value)} style={{width:"100%",padding:"5px 8px",border:"0.5px solid #e4e4e7",borderRadius:6,fontSize:13}}/></div>
          <div style={{flex:1}}><label style={{fontSize:11,color:"#a1a1aa",display:"block",marginBottom:2}}>Height</label><input type="number" value={sH} onChange={e=>chgH(e.target.value)} style={{width:"100%",padding:"5px 8px",border:"0.5px solid #e4e4e7",borderRadius:6,fontSize:13}}/></div>
        </div>}
      </Section>

      <Section title="Palette" isOpen={palOpen} onToggle={setPalOpen}><div style={{marginTop:8}}><SliderRow label="Max skeins" value={maxC} min={10} max={40} onChange={setMaxC}/></div><div style={{marginTop:8}}><SliderRow label="Min stitches/colour" value={minSt} min={0} max={50} onChange={setMinSt} format={v=>v===0?"Off":v}/></div><div style={{marginTop:8}}><SliderRow label="Remove Orphans" value={orphans} min={0} max={3} onChange={setOrphans} format={v=>v===0?"Off":v}/></div><div style={{display:"flex",gap:6,marginTop:6}}><div style={{ display: "flex", gap: 2, background: "#f4f4f5", borderRadius: 8, padding: 2, flex: 1 }}><button onClick={()=>setDith(false)} style={{ padding: "5px 12px", fontSize: 12, fontWeight: !dith ? 500 : 400, background: !dith ? "#fff" : "transparent", borderRadius: 6, color: !dith ? "#18181b" : "#71717a", border: "none", cursor: "pointer", boxShadow: !dith ? "0 1px 2px rgba(0,0,0,0.04)" : "none", flex: 1 }}>Direct</button><button onClick={()=>setDith(true)} style={{ padding: "5px 12px", fontSize: 12, fontWeight: dith ? 500 : 400, background: dith ? "#fff" : "transparent", borderRadius: 6, color: dith ? "#18181b" : "#71717a", border: "none", cursor: "pointer", boxShadow: dith ? "0 1px 2px rgba(0,0,0,0.04)" : "none", flex: 1 }}>Dithered</button></div></div></Section>

      <Section title="Fabric & Floss" isOpen={fabOpen} onToggle={setFabOpen} badge={<span style={{fontSize:11,fontWeight:500,color:"#71717a",background:"#f4f4f5",padding:"1px 8px",borderRadius:10}}>{fabricCt}ct</span>}>
        <div style={{marginTop:8}}>
          <div style={{fontSize:12,color:"#71717a",marginBottom:4}}>Fabric count</div>
          <select value={fabricCt} onChange={e=>setFabricCt(Number(e.target.value))} style={{width:"100%",padding:"6px 10px",borderRadius:8,border:"0.5px solid #e4e4e7",fontSize:13,background:"#fff"}}>
            {FABRIC_COUNTS.map(f=><option key={f.ct} value={f.ct}>{f.label}</option>)}
          </select>
          <div style={{fontSize:11,color:"#a1a1aa",marginTop:6}}>Used for skein estimation. Assumes 2 strands, 8m per skein.</div>
        </div>
      </Section>

      <Section title="Adjustments" isOpen={adjOpen} onToggle={setAdjOpen} badge={(bri||con||sat||smooth)?<span style={{width:6,height:6,borderRadius:"50%",background:"#0d9488",display:"inline-block"}}/>:null}><div style={{marginTop:8}}><div style={{display:"flex",gap:6,marginBottom:6}}><div style={{ display: "flex", gap: 2, background: "#f4f4f5", borderRadius: 8, padding: 2, flex: 1 }}><button onClick={()=>setSmoothType("median")} style={{ padding: "5px 12px", fontSize: 12, fontWeight: smoothType==="median" ? 500 : 400, background: smoothType==="median" ? "#fff" : "transparent", borderRadius: 6, color: smoothType==="median" ? "#18181b" : "#71717a", border: "none", cursor: "pointer", boxShadow: smoothType==="median" ? "0 1px 2px rgba(0,0,0,0.04)" : "none", flex: 1 }}>Median</button><button onClick={()=>setSmoothType("gaussian")} style={{ padding: "5px 12px", fontSize: 12, fontWeight: smoothType==="gaussian" ? 500 : 400, background: smoothType==="gaussian" ? "#fff" : "transparent", borderRadius: 6, color: smoothType==="gaussian" ? "#18181b" : "#71717a", border: "none", cursor: "pointer", boxShadow: smoothType==="gaussian" ? "0 1px 2px rgba(0,0,0,0.04)" : "none", flex: 1 }}>Gaussian</button></div></div><SliderRow label="Smooth (Noise Reduction)" value={smooth} min={0} max={4} step={0.1} onChange={setSmooth} format={v=>v===0?"Off":v.toFixed(1)}/><SliderRow label="Brightness" value={bri} min={-50} max={50} onChange={setBri} format={v=>(v>0?"+":"")+v+"%"}/><SliderRow label="Contrast" value={con} min={-50} max={50} onChange={setCon} format={v=>(v>0?"+":"")+v+"%"}/><SliderRow label="Saturation" value={sat} min={-50} max={50} onChange={setSat} format={v=>(v>0?"+":"")+v+"%"}/></div></Section>
      <Section title="Background" isOpen={bgOpen} onToggle={setBgOpen} badge={skipBg?<span style={{width:6,height:6,borderRadius:"50%",background:"#16a34a",display:"inline-block"}}/>:null}>
        <label style={{display:"flex",alignItems:"center",gap:6,fontSize:12,cursor:"pointer",marginTop:8}}><input type="checkbox" checked={skipBg} onChange={e=>setSkipBg(e.target.checked)}/>Skip background</label>
        {skipBg&&<div style={{marginTop:10}}>
          <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:10}}><div onClick={()=>setPickBg(true)} style={{width:24,height:24,borderRadius:6,background:`rgb(${bgCol})`,border:"2px solid #e4e4e7",cursor:"pointer"}}/><button onClick={()=>setPickBg(true)} style={{fontSize:11,padding:"3px 8px",border:"0.5px solid #e4e4e7",borderRadius:6,background:"#fafafa",cursor:"pointer"}}>Pick</button></div>
          <SliderRow label="Tolerance" value={bgTh} min={3} max={50} onChange={setBgTh}/>
          {pat && <div style={{marginTop:10, padding:"8px", background:"#f4f4f5", borderRadius:8, fontSize:11, color:"#71717a"}}>
             <div style={{marginBottom:6}}>Want to shrink the pattern to fit only the stitches?</div>
             <button onClick={autoCrop} style={{width:"100%", padding:"6px", fontSize:12, fontWeight:500, background:"#fff", border:"1px solid #d4d4d8", borderRadius:6, cursor:"pointer", color:"#18181b"}}>Auto-Crop to Stitches</button>
          </div>}
        </div>}
      </Section>
      <button onClick={generate} disabled={busy} style={{padding:"12px 20px",fontSize:15,fontWeight:600,background:busy?"#a1a1aa":"#0d9488",color:"#fff",border:"none",borderRadius:10,cursor:busy?"wait":"pointer",boxShadow:busy?"none":"none"}}>{busy?"Generating...":(pat?"Regenerate":"Generate Pattern")}</button>
      </>}
    </div>}

    <div style={{flex:1,minWidth:0}}>
      {pat&&pal&&<div>
        <div style={{display:"flex",gap:0,marginBottom:12,borderBottom:"2px solid #f4f4f5"}}>{[["pattern","Pattern"],["project","Project"],["legend","Threads"],["export","Export"]].map(it=><button className="tab-button" key={it[0]} onClick={()=>setTab(it[0])} style={tabSt(tab===it[0])}>{it[1]}</button>)}</div>

        {/* ═══ PATTERN TAB ═══ */}
        {tab==="pattern"&&<div>
          <div style={{display:"flex",gap:6,marginBottom:6,flexWrap:"wrap",alignItems:"center"}}>
            <div style={{ display: "flex", gap: 2, background: "#f4f4f5", borderRadius: 8, padding: 2, flex: 1 }}>{[["color","Colour"],["symbol","Symbol"],["both","Both"]].map(it=><button key={it[0]} onClick={()=>setView(it[0])} style={{ padding: "5px 12px", fontSize: 12, fontWeight: view===it[0] ? 500 : 400, background: view===it[0] ? "#fff" : "transparent", borderRadius: 6, color: view===it[0] ? "#18181b" : "#71717a", border: "none", cursor: "pointer", boxShadow: view===it[0] ? "0 1px 2px rgba(0,0,0,0.04)" : "none", flex: 1 }}>{it[1]}</button>)}</div>
            <div style={{width:1,height:18,background:"#e4e4e7",margin:"0 2px"}}/>
            <span style={{fontSize:11,color:"#a1a1aa"}}>Zoom</span><input type="range" min={0.05} max={3} step={0.05} value={zoom} onChange={e=>setZoom(Number(e.target.value))} style={{width:60}}/><span style={{fontSize:11,minWidth:28}}>{Math.round(zoom*100)}%</span><button onClick={fitZ} style={{fontSize:11,padding:"3px 8px",border:"0.5px solid #e4e4e7",borderRadius:6,background:"#fafafa",cursor:"pointer"}}>Fit</button>
            {img&&<><div style={{width:1,height:18,background:"#e4e4e7",margin:"0 2px"}}/><button onClick={()=>setShowOverlay(!showOverlay)} style={tBtn(showOverlay)}>Overlay</button>{showOverlay&&<input type="range" min={0.1} max={0.8} step={0.05} value={overlayOpacity} onChange={e=>setOverlayOpacity(Number(e.target.value))} style={{width:50}}/>}</>}
          </div>
          {cs < 6 && (view === "symbol" || view === "both") && <div style={{fontSize: 12, color: "#71717a", marginBottom: 6, background: "#f4f4f5", padding: "6px 10px", borderRadius: 8}}>To see symbols, you may need to zoom in.</div>}
          <div style={{display:"flex",gap:5,marginBottom:8,flexWrap:"wrap",alignItems:"center", padding: "6px 10px", background: "#fff", border: "0.5px solid #e4e4e7", borderRadius: 10}}>
            <span style={{fontSize:10,fontWeight:600,color:"#a1a1aa",textTransform:"uppercase"}}>Tools</span>
            <button onClick={()=>setTool("backstitch")} style={tBtn(activeTool==="backstitch")}>Backstitch</button>
            {activeTool==="backstitch"&&<label style={{display:"flex",alignItems:"center",gap:4,fontSize:11,cursor:"pointer"}}><input type="checkbox" checked={bsContinuous} onChange={e=>{setBsContinuous(e.target.checked);setBsStart(null);}}/>Continuous</label>}
            <button onClick={()=>setTool("eraseBs")} style={tBtn(activeTool==="eraseBs")}>Erase line</button>
            <button onClick={()=>setTool("paint")} style={tBtn(activeTool==="paint")}>Paint</button>
            <button onClick={()=>setTool("fill")} style={tBtn(activeTool==="fill")}>Fill</button>
            {(activeTool==="paint"||activeTool==="fill")&&selectedColorId&&cmap[selectedColorId]&&<span style={{fontSize:11,display:"flex",alignItems:"center",gap:4,padding:"3px 10px",borderRadius:8,background:"#f4f4f5"}}><span style={{width:12,height:12,borderRadius:3,background:`rgb(${cmap[selectedColorId].rgb})`,border:"1px solid #d4d4d8",display:"inline-block"}}/> {selectedColorId}</span>}
            <div style={{marginLeft:"auto",display:"flex",gap:4}}>
              {editHistory.length>0&&<button onClick={()=>{let last=editHistory[editHistory.length-1],np=pat.slice();last.changes.forEach(c2=>np[c2.idx]={...c2.old});setPat(np);setEditHistory(prev=>prev.slice(0,-1));let{pal:np2,cmap:nc}=buildPalette(np);setPal(np2);setCmap(nc);}} style={{fontSize:11,padding:"4px 10px",border:"1px solid #99f6e4",borderRadius:6,background:"#f0fdfa",color:"#0d9488",cursor:"pointer"}}>↩ Undo</button>}
              {hiId&&<button onClick={()=>setHiId(null)} style={{fontSize:11,padding:"4px 10px",border:"1px solid #fecaca",borderRadius:6,background:"#fef2f2",color:"#dc2626",cursor:"pointer"}}>Clear ✕</button>}
            </div>
          </div>
          <div ref={scrollRef} onScroll={() => requestAnimationFrame(renderPattern)} style={{overflow:"auto",maxHeight:550,border:"0.5px solid #e4e4e7",borderRadius:8,background:"#f4f4f5",cursor:activeTool?"crosshair":"default"}}><canvas ref={pcRef} style={{display:"block"}} onClick={handlePatClick} onMouseMove={handlePatMouseMove} onMouseLeave={handlePatMouseLeave} onContextMenu={e=>{if(activeTool==="backstitch"&&bsStart){e.preventDefault();setBsStart(null);}}}/></div>
          <div style={{marginTop:8,borderRadius:8,background:"#fafafa",padding:"8px 12px",border:"0.5px solid #e4e4e7"}}><div style={{display:"flex",flexWrap:"wrap",gap:3}}>{pal.map(p=>{let ips=(activeTool==="paint"||activeTool==="fill")&&selectedColorId===p.id,ihs=hiId===p.id;return<div key={p.id} onClick={()=>{if(activeTool==="paint"||activeTool==="fill")setSelectedColorId(selectedColorId===p.id?null:p.id);else setHiId(hiId===p.id?null:p.id);}} style={{display:"flex",alignItems:"center",gap:3,padding:"2px 7px",borderRadius:5,cursor:"pointer",fontSize:11,border:ips?"2px solid #0d9488":ihs?"2px solid #ea580c":"0.5px solid #e4e4e7",background:ips?"#f0fdfa":ihs?"#fff7ed":"#fff"}}><span style={{width:12,height:12,borderRadius:2,background:`rgb(${p.rgb})`,border:"1px solid #d4d4d8",display:"inline-block",flexShrink:0}}/><span style={{fontFamily:"monospace",color:"#71717a"}}>{p.symbol}</span><span style={{fontWeight:500}}>{p.id}</span></div>;})}</div></div>
        </div>}

        {/* ═══ PROJECT TAB ═══ */}
        {tab==="project"&&<div style={{display:"flex",flexDirection:"column",gap:12}}>
          {/* Pattern Summary + Difficulty */}
          <Section title="Pattern Summary">
            <div style={{marginTop:8,display:"grid",gridTemplateColumns:"1fr 1fr",gap:"8px 20px"}}>
              {[["Pattern size",`${sW} × ${sH} stitches`],["Total cells",(sW*sH).toLocaleString()],["Stitchable",totalStitchable.toLocaleString()],["Skipped",(sW*sH-totalStitchable).toLocaleString()],["Colours",`${pal.length} (${blendCount} blend${blendCount!==1?"s":""})`],["Skeins needed",`${totalSkeins} (at ${fabricCt}ct)`]].map(([l,v],i)=><div key={i}><div style={{fontSize:11,color:"#a1a1aa",textTransform:"uppercase",fontWeight:600,marginBottom:2}}>{l}</div><div style={{fontSize:14,fontWeight:600,color:"#18181b"}}>{v}</div></div>)}
            </div>
            {difficulty&&<div style={{marginTop:12,padding:"8px 12px",background:"#fafafa",borderRadius:8,border:"0.5px solid #e4e4e7",display:"flex",alignItems:"center",gap:10}}>
              <div style={{fontSize:11,color:"#a1a1aa",textTransform:"uppercase",fontWeight:600}}>Difficulty</div>
              <div style={{display:"flex",gap:2}}>{[1,2,3,4].map(s=><span key={s} style={{fontSize:16,color:s<=difficulty.stars?difficulty.color:"#e4e4e7"}}>★</span>)}</div>
              <span style={{fontSize:13,fontWeight:700,color:difficulty.color}}>{difficulty.label}</span>
              <span style={{fontSize:11,color:"#a1a1aa",marginLeft:"auto"}}>{pal.length} colours · {blendCount>0?blendCount+" blends · ":""}{totalStitchable.toLocaleString()} stitches</span>
            </div>}
            {done&&doneCount>0&&<div style={{marginTop:8,padding:"8px 12px",background:"#f0fdf4",borderRadius:8,border:"1px solid #bbf7d0"}}>
              <div style={{fontSize:12,fontWeight:600,color:"#16a34a"}}>Progress: {progressPct}% — {doneCount.toLocaleString()} of {totalStitchable.toLocaleString()} stitches</div>
            </div>}
          </Section>

          {/* Time Estimate */}
          <Section title="Time Estimate">
            <div style={{marginTop:8}}>
              <SliderRow label="Stitching speed" value={stitchSpeed} min={10} max={120} step={5} onChange={setStitchSpeed} format={v=>v+" stitches/hr"}/>
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:"8px 20px",marginTop:10}}>
                <div><div style={{fontSize:11,color:"#a1a1aa",textTransform:"uppercase",fontWeight:600,marginBottom:2}}>Total estimate</div><div style={{fontSize:16,fontWeight:700,color:"#18181b"}}>{fmtTimeL(Math.round(totalStitchable/stitchSpeed*3600))}</div></div>
                <div><div style={{fontSize:11,color:"#a1a1aa",textTransform:"uppercase",fontWeight:600,marginBottom:2}}>Remaining</div><div style={{fontSize:16,fontWeight:700,color:doneCount>=totalStitchable?"#16a34a":"#0d9488"}}>{doneCount>=totalStitchable?"Done!":fmtTimeL(Math.round((totalStitchable-doneCount)/stitchSpeed*3600))}</div></div>
              </div>
              {totalTime>0&&doneCount>0&&<div style={{marginTop:8,padding:"8px 12px",background:"#fafafa",borderRadius:8,border:"0.5px solid #e4e4e7",fontSize:12,color:"#71717a"}}>
                Based on your actual sessions: {Math.round(doneCount/(totalTime/3600))} stitches/hr average
              </div>}
            </div>
          </Section>

          {/* Finished Size */}
          <Section title="Finished Size">
            <div style={{marginTop:8,overflow:"auto"}}><table style={{width:"100%",borderCollapse:"collapse",fontSize:12}}><thead><tr style={{background:"#fafafa"}}>{["Fabric","Width","Height","With margin"].map((h,i)=><th key={i} style={{padding:"7px 10px",textAlign:"left",borderBottom:"2px solid #e4e4e7",color:"#71717a",fontWeight:600,fontSize:11,textTransform:"uppercase"}}>{h}</th>)}</tr></thead><tbody>
              {[{ct:14,label:"14 count Aida"},{ct:16,label:"16 count Aida"},{ct:18,label:"18 count Aida"},{ct:20,label:"20 count Aida"},{ct:22,label:"22 count Aida"},{ct:25,label:"25 count Evenweave"},{ct:28,label:"28 count Evenweave (over 2)"}].map(f=>{
                let div=f.ct===28?14:f.ct;
                let wIn=sW/div,hIn=sH/div,wCm=(wIn*2.54),hCm=(hIn*2.54);
                let isCurrent=f.ct===fabricCt||(f.ct===28&&fabricCt===28);
                return<tr key={f.ct} style={{borderBottom:"0.5px solid #f4f4f5",background:isCurrent?"#f0fdfa":"transparent"}}><td style={{padding:"6px 10px",fontWeight:isCurrent?700:400}}>{f.label}{isCurrent?" ✓":""}</td><td style={{padding:"6px 10px"}}>{wIn.toFixed(1)}″ / {wCm.toFixed(1)} cm</td><td style={{padding:"6px 10px"}}>{hIn.toFixed(1)}″ / {hCm.toFixed(1)} cm</td><td style={{padding:"6px 10px",fontSize:11,color:"#a1a1aa"}}>{(wIn+2).toFixed(0)}″ × {(hIn+2).toFixed(0)}″</td></tr>;})}
            </tbody></table></div>
          </Section>

          {/* Cost Estimate */}
          <Section title="Cost Estimate" defaultOpen={false}>
            <div style={{marginTop:8}}>
              <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:10}}>
                <span style={{fontSize:12,color:"#71717a"}}>Price per skein (£)</span>
                <input type="number" value={skeinPrice} min={0} step={0.05} onChange={e=>setSkeinPrice(Math.max(0,parseFloat(e.target.value)||0))} style={{width:70,padding:"5px 8px",border:"0.5px solid #e4e4e7",borderRadius:6,fontSize:13,textAlign:"right"}}/>
              </div>
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:"8px 20px"}}>
                <div><div style={{fontSize:11,color:"#a1a1aa",textTransform:"uppercase",fontWeight:600,marginBottom:2}}>Thread cost</div><div style={{fontSize:16,fontWeight:700,color:"#18181b"}}>£{(totalSkeins*skeinPrice).toFixed(2)}</div><div style={{fontSize:11,color:"#a1a1aa"}}>{totalSkeins} skeins × £{skeinPrice.toFixed(2)}</div></div>
                {toBuyCount<skeinData.length&&<div><div style={{fontSize:11,color:"#a1a1aa",textTransform:"uppercase",fontWeight:600,marginBottom:2}}>Still to buy</div><div style={{fontSize:16,fontWeight:700,color:"#ea580c"}}>£{(toBuyList.reduce((s,d)=>s+d.skeins,0)*skeinPrice).toFixed(2)}</div><div style={{fontSize:11,color:"#a1a1aa"}}>{toBuyList.reduce((s,d)=>s+d.skeins,0)} skeins</div></div>}
              </div>
              <div style={{fontSize:11,color:"#a1a1aa",marginTop:8}}>Doesn't include fabric, needles, hoop, or frame. DMC skeins typically £0.85–£1.10 in UK shops.</div>
            </div>
          </Section>

          {/* Thread Organiser / Shopping List */}
          <Section title="Thread Organiser">
            <div style={{marginTop:8,display:"flex",gap:12,marginBottom:10}}>
              <div style={{padding:"6px 14px",background:"#f0fdf4",borderRadius:8,border:"1px solid #bbf7d0",fontSize:12}}><span style={{fontWeight:700,color:"#16a34a"}}>{ownedCount}</span> <span style={{color:"#71717a"}}>owned</span></div>
              <div style={{padding:"6px 14px",background:"#fff7ed",borderRadius:8,border:"1px solid #fed7aa",fontSize:12}}><span style={{fontWeight:700,color:"#ea580c"}}>{toBuyList.length}</span> <span style={{color:"#71717a"}}>to buy</span></div>
              <div style={{marginLeft:"auto",display:"flex",gap:4}}>
                <button onClick={()=>setModal("calculator_batch")} style={{fontSize:11,padding:"4px 10px",border:"1px solid #99f6e4",borderRadius:6,background:"#f0fdfa",color:"#0d9488",cursor:"pointer"}}>Calculate thread needed</button>
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
        </div>}

        {/* ═══ LEGEND TAB ═══ */}
        {tab==="legend"&&<div>
          <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:10,flexWrap:"wrap"}}>
            <span style={{fontSize:12,color:"#71717a"}}>Fabric:</span>
            <select value={fabricCt} onChange={e=>setFabricCt(Number(e.target.value))} style={{padding:"4px 10px",borderRadius:6,border:"0.5px solid #e4e4e7",fontSize:12,background:"#fff"}}>
              {FABRIC_COUNTS.map(f=><option key={f.ct} value={f.ct}>{f.label}</option>)}
            </select>
            <span style={{fontSize:11,color:"#a1a1aa"}}>Total skeins: {totalSkeins}</span>
          </div>
          <div style={{overflow:"auto",maxHeight:540}}><table style={{width:"100%",borderCollapse:"collapse",fontSize:12}}><thead><tr style={{background:"#fafafa"}}>{["Sym","","DMC","Name","Type","Stitches","Skeins",done?"Done":""].filter(Boolean).map((h,i)=><th key={i} style={{padding:"8px 10px",textAlign:i>=5?"right":"left",borderBottom:"2px solid #e4e4e7",color:"#71717a",fontWeight:600,fontSize:11,textTransform:"uppercase"}}>{h}</th>)}</tr></thead><tbody>{pal.map((p,i)=>{let dc=colourDoneCounts[p.id]||{total:0,done:0};let sk=skeinEst(p.count,fabricCt);return<tr key={i} onClick={()=>{setHiId(hiId===p.id?null:p.id);setTab("pattern");}} style={{borderBottom:"0.5px solid #f4f4f5",cursor:"pointer",background:hiId===p.id?"#fff7ed":"transparent"}}><td style={{padding:"6px 10px",fontFamily:"monospace",fontSize:16}}>{p.symbol}</td><td style={{padding:"6px 10px"}}><div style={{width:24,height:24,borderRadius:5,background:`rgb(${p.rgb})`,border:"0.5px solid #e4e4e7",display:"inline-block"}}/></td><td style={{padding:"6px 10px",fontWeight:600}}>{p.id}</td><td style={{padding:"6px 10px",fontSize:11,color:"#71717a"}}>{p.type==="blend"?p.threads[0].name+" + "+p.threads[1].name:p.name}</td><td style={{padding:"6px 10px"}}><span style={{padding:"2px 8px",borderRadius:10,fontSize:10,fontWeight:600,background:p.type==="blend"?"#fff7ed":"#f0fdf4",color:p.type==="blend"?"#ea580c":"#16a34a"}}>{p.type==="blend"?"Blend":"Solid"}</span></td><td style={{padding:"6px 10px",textAlign:"right"}}>{p.count.toLocaleString()}</td><td style={{padding:"6px 10px",textAlign:"right",fontWeight:600}}>{sk}</td>{done&&<td style={{padding:"6px 10px",textAlign:"right"}}><span style={{color:dc.done>=dc.total?"#16a34a":"#71717a"}}>{dc.done}/{dc.total}</span></td>}</tr>;})}</tbody></table></div>
        </div>}

        {/* ═══ EXPORT TAB ═══ */}
        {tab==="export"&&<div style={{display:"flex",flexDirection:"column",gap:12}}>
          {copied&&<div style={{background:"#f0fdf4",border:"1px solid #bbf7d0",borderRadius:8,padding:"8px 14px",fontSize:12,color:"#16a34a",fontWeight:600}}>Copied!</div>}

          <button onClick={()=>{
              let pl = pat.map(m=>{
                  if (m.id==="__skip__") return ["__skip__", "k"];
                  return [m.id, m.type==="blend"?"b":"s"];
              });
              let minimal = { v: 8, w: sW, h: sH, fc: fabricCt, bs: bsLines, p: pl };
              try {
                  let str = JSON.stringify(minimal);
                  let compressed = pako.deflate(str);
                  let binaryStr = "";
                  for (let i=0; i<compressed.length; i++) binaryStr += String.fromCharCode(compressed[i]);
                  let b64 = btoa(binaryStr).replace(/\+/g, '-').replace(/\//g, '_');
                  if (b64.length > 8000) {
                      alert("Pattern too large for link sharing. Please use Save Project (.json) instead.");
                      return;
                  }
                  window.open("stitch.html#p=" + b64, "_blank");
                  setCopied("Opened in Stitch Tracker");
                  setTimeout(()=>setCopied(null), 3000);
              } catch(e) { console.error("Compression failed", e); }
          }} style={{padding:"12px 20px",fontSize:15,borderRadius:8,border:"none",background:"#0d9488",color:"#fff",cursor:"pointer",fontWeight:600,boxShadow:"none", display:"flex", alignItems:"center", justifyContent:"center", gap:8}}>🧵 Open in Stitch Tracker →</button>

          <Section title="PDF Export"><p style={{fontSize:12,color:"#71717a",margin:"8px 0 10px"}}>Multi-page PDF with legend and chart.</p><div style={{display:"flex",gap:8,flexWrap:"wrap"}}><button onClick={exportPDF} style={{padding:"10px 20px",fontSize:14,borderRadius:8,border:"none",background:"#0d9488",color:"#fff",cursor:"pointer",fontWeight:600,boxShadow:"none"}}>Download Pattern PDF</button><button onClick={exportCoverSheet} style={{padding:"10px 20px",fontSize:14,borderRadius:8,border:"1.5px solid #0d9488",background:"#fff",color:"#0d9488",cursor:"pointer",fontWeight:600}}>Cover Sheet PDF</button></div><p style={{fontSize:11,color:"#a1a1aa",marginTop:8}}>The cover sheet includes pattern summary, thread list with owned/to-buy status, and space for notes — perfect for tucking into your project bag.</p></Section>
          <Section title="PNG Chart"><div style={{display:"flex",gap:8,alignItems:"center",marginTop:8,marginBottom:8}}><label style={{display:"flex",alignItems:"center",gap:4,fontSize:12,cursor:"pointer"}}><input type="checkbox" checked={pageMode} onChange={e=>{setPageMode(e.target.checked);setExportPage(0);}}/>A4 pages</label>{pageMode&&<><button onClick={()=>setExportPage(Math.max(0,exportPage-1))} disabled={exportPage===0} style={{fontSize:11,padding:"3px 8px",border:"0.5px solid #e4e4e7",borderRadius:6,background:"#fff",cursor:"pointer"}}>◀</button><span style={{fontSize:12}}>Page {exportPage+1}/{totPg}</span><button onClick={()=>setExportPage(Math.min(totPg-1,exportPage+1))} disabled={exportPage>=totPg-1} style={{fontSize:11,padding:"3px 8px",border:"0.5px solid #e4e4e7",borderRadius:6,background:"#fff",cursor:"pointer"}}>▶</button></>}</div><div style={{overflow:"auto",maxHeight:400,border:"0.5px solid #e4e4e7",borderRadius:8,background:"#fff"}}><canvas ref={expRef} style={{display:"block"}}/></div></Section>
          <Section title="Save / Load"><p style={{fontSize:12,color:"#71717a",margin:"8px 0 10px"}}>Saves pattern for later editing or opening in Stitch Tracker.</p><div style={{display:"flex",gap:8}}><button onClick={saveProject} style={{padding:"8px 18px",fontSize:13,borderRadius:8,border:"none",background:"#0d9488",color:"#fff",cursor:"pointer",fontWeight:600}}>Save (.json)</button><button onClick={()=>loadRef.current.click()} style={{padding:"8px 18px",fontSize:13,borderRadius:8,border:"0.5px solid #e4e4e7",background:"#fff",cursor:"pointer",fontWeight:500}}>Load</button></div></Section>
        </div>}
      </div>}
      {!pat&&img&&<div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit, minmax(300px, 1fr))",gap:20}}>
        <div className="card">
          <div style={{padding:"8px 14px 4px",fontSize:12,fontWeight:600,color:"#71717a"}}>Original Image</div>
          <div style={{position:"relative"}} ref={cropRef} onMouseDown={handleCropMouseDown} onMouseMove={handleCropMouseMove} onMouseUp={handleCropMouseUp} onMouseLeave={handleCropMouseUp}>
            <img src={img.src} alt="Original" style={{width:"100%",display:"block",cursor:isCropping?"crosshair":(pickBg?"crosshair":"default"),opacity:isCropping?0.7:1}} onClick={srcClick}/>
            {isCropping&&cropRect&&<div style={{position:"absolute",left:cropRect.x,top:cropRect.y,width:cropRect.w,height:cropRect.h,border:"2px dashed #0d9488",background:"rgba(13, 148, 136, 0.2)",boxSizing:"border-box",pointerEvents:"none"}}/>}
          </div>
          {isCropping ? <div style={{padding:"6px 12px",display:"flex",justifyContent:"space-between",alignItems:"center",borderTop:"0.5px solid #f4f4f5"}}>
            <span style={{fontSize:11,color:"#a1a1aa"}}>Draw a rectangle</span>
            <div style={{display:"flex",gap:6}}>
              <button onClick={()=>{setIsCropping(false);setCropRect(null);}} style={{fontSize:11,padding:"3px 8px",cursor:"pointer",border:"0.5px solid #e4e4e7",borderRadius:6,background:"#fafafa"}}>Cancel</button>
              <button onClick={applyCrop} style={{fontSize:11,padding:"3px 8px",cursor:"pointer",border:"none",borderRadius:6,background:"#0d9488",color:"#fff"}}>Apply</button>
            </div>
          </div> : <div style={{padding:"6px 12px",display:"flex",justifyContent:"space-between",alignItems:"center",borderTop:"0.5px solid #f4f4f5"}}>
            <span style={{fontSize:11,color:"#a1a1aa"}}>{origW}×{origH}px</span>
            <div style={{display:"flex",gap:6}}>
              <button onClick={()=>{setIsCropping(true);setCropRect(null);}} style={{fontSize:11,padding:"3px 8px",cursor:"pointer",border:"0.5px solid #e4e4e7",borderRadius:6,background:"#fafafa"}}>Crop</button>
              <button onClick={()=>fRef.current.click()} style={{fontSize:11,padding:"3px 8px",cursor:"pointer",border:"0.5px solid #e4e4e7",borderRadius:6,background:"#fafafa"}}>Change</button>
            </div>
          </div>}
          {pickBg&&<div style={{padding:"6px 12px",fontSize:11,color:"#ea580c",fontWeight:600,background:"#fff7ed"}}>Click to pick BG</div>}
        </div>

        {previewUrl&&<div className="card" style={{display:"flex",flexDirection:"column"}}>
          <div style={{padding:"8px 14px 4px",fontSize:12,fontWeight:600,color:"#71717a"}}>Preview</div>
          <div style={{padding:"0 14px 10px",flex:1,display:"flex",alignItems:"center",justifyContent:"center"}}>
            <img src={previewUrl} alt="Preview" style={{maxWidth:"100%",maxHeight:"600px",borderRadius:6,border:"0.5px solid #e4e4e7",imageRendering:"pixelated"}}/>
          </div>
          {previewStats&&<div style={{padding:"10px 14px",borderTop:"0.5px solid #f4f4f5",background:"#fafafa",borderBottomLeftRadius:8,borderBottomRightRadius:8}}>
            <div style={{fontSize:11,fontWeight:600,color:"#71717a",textTransform:"uppercase",marginBottom:8}}>Preview Estimates</div>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:"6px 12px"}}>
              <div><div style={{fontSize:10,color:"#a1a1aa"}}>Stitchable</div><div style={{fontSize:13,fontWeight:600,color:"#18181b"}}>{previewStats.stitchable.toLocaleString()}</div></div>
              {skipBg&&<div><div style={{fontSize:10,color:"#a1a1aa"}}>Skipped</div><div style={{fontSize:13,fontWeight:600,color:"#18181b"}}>{previewStats.skipped.toLocaleString()}</div></div>}
              <div><div style={{fontSize:10,color:"#a1a1aa"}}>Colours</div><div style={{fontSize:13,fontWeight:600,color:"#18181b"}}>{previewStats.uniqueColors}</div></div>
              <div><div style={{fontSize:10,color:"#a1a1aa"}}>Skeins ({fabricCt}ct)</div><div style={{fontSize:13,fontWeight:600,color:"#18181b"}}>{previewStats.estSkeins}</div></div>
              <div><div style={{fontSize:10,color:"#a1a1aa"}}>Time</div><div style={{fontSize:13,fontWeight:600,color:"#18181b"}}>{fmtTimeL(Math.round(previewStats.stitchable/stitchSpeed*3600))}</div></div>
              <div><div style={{fontSize:10,color:"#a1a1aa"}}>Thread Cost</div><div style={{fontSize:13,fontWeight:600,color:"#18181b"}}>£{(previewStats.estSkeins*skeinPrice).toFixed(2)}</div></div>
            </div>
          </div>}
        </div>}
      </div>}
    </div>
  </div>}
  {modal==="help"&&<SharedModals.Help onClose={()=>setModal(null)} />}
  {modal==="about"&&<SharedModals.About onClose={()=>setModal(null)} />}
  {modal==="calculator"&&<SharedModals.Calculator onClose={()=>setModal(null)} />}
  {modal==="calculator_batch"&&<SharedModals.Calculator onClose={()=>setModal(null)} initialPatterns={pal} />}
  {modal==="pdf_export"&&<SharedModals.PdfExport onClose={()=>setModal(null)} initialSettings={pdfSettings} sW={sW} sH={sH} hasTrackingData={doneCount > 0} hasBackstitch={bsLines.length > 0} pal={pal} onExport={(s)=>{setPdfSettings(s);setModal(null);generatePDF({pat, pal, cmap, sW, sH, done, totalStitchable, fabricCt, skeinData, blendCount, totalSkeins, difficulty, stitchSpeed, totalTime, sessions, threadOwned, bsLines, imgData:img?img.src:null}, s);}} />}
</div>
</>);
}
