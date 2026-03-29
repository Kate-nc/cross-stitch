with open("creator-app.js", "r") as f:
    content = f.read()

# 1. Add pdfSettings to state
state_block = """const[hasGenerated,setHasGenerated]=useState(false);"""
new_state_block = """const[hasGenerated,setHasGenerated]=useState(false);

const [pdfSettings, setPdfSettings] = useState({ chartStyle: 'symbols', cellSize: 3, paper: 'a4', orientation: 'portrait', gridInterval: 10, gridNumbers: true, centerMarks: true, legendLocation: 'separate', legendColumns: 2, coverPage: true, progressOverlay: false, separateBackstitch: false });"""
content = content.replace(state_block, new_state_block)

# 2. Update showCtr to be useState
show_ctr_block = """const[view,setView]=useState("color"),[zoom,setZoom]=useState(1),[hiId,setHiId]=useState(null),showCtr=true;"""
new_show_ctr_block = """const[view,setView]=useState("color"),[zoom,setZoom]=useState(1),[hiId,setHiId]=useState(null),[showCtr,setShowCtr]=useState(true);"""
content = content.replace(show_ctr_block, new_show_ctr_block)


# 3. Add processLoadedProject before loadProject and update loadProject
process_loaded_project_func = """function processLoadedProject(project){
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
}catch(err){console.error(err);setLoadError("Could not load: "+err.message);setTimeout(()=>setLoadError(null),4000);}};rd.readAsText(f);if(loadRef.current)loadRef.current.value="";}"""

load_project_block = """function loadProject(e){let f=e.target.files[0];if(!f)return;setLoadError(null);let rd=new FileReader();rd.onload=ev=>{try{
  let project=JSON.parse(ev.target.result);if(!project.pattern||!project.settings)throw new Error("Invalid");
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
}catch(err){console.error(err);setLoadError("Could not load: "+err.message);setTimeout(()=>setLoadError(null),4000);}};rd.readAsText(f);if(loadRef.current)loadRef.current.value="";}"""

content = content.replace(load_project_block, process_loaded_project_func)


with open("creator-app.js", "w") as f:
    f.write(content)
print("Updated creator-app.js state and loading")
