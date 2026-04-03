import sys

with open("creator-app.js", "r") as f:
    content = f.read()

# 1. ADD handleOpenInTracker
fn = """function handleOpenInTracker(){
  if(!pat||!pal)return;
  let project={version:8,page:"creator",settings:{sW,sH,maxC,bri,con,sat,dith,skipBg,bgTh,bgCol,minSt,arLock,ar,fabricCt,skeinPrice,stitchSpeed,smooth,smoothType,orphans},pattern:pat.map(m=>m.id==="__skip__"?{id:"__skip__"}:{id:m.id,type:m.type,rgb:m.rgb}),bsLines,done:done?Array.from(done):null,parkMarkers,totalTime,sessions,hlRow,hlCol,threadOwned,imgData:img?img.src:null};
  try{
    localStorage.setItem('crossstitch_handoff', JSON.stringify(project));
    window.location.href = 'stitch.html?source=creator';
  }catch(e){
    try{
      let pl = pat.map(m=>{
          if (m.id==="__skip__") return ["__skip__", "k"];
          return [m.id, m.type==="blend"?"b":"s"];
      });
      let minimal = { v: 8, w: sW, h: sH, fc: fabricCt, bs: bsLines, p: pl };
      let str = JSON.stringify(minimal);
      let compressed = pako.deflate(str);
      let binaryStr = "";
      for (let i=0; i<compressed.length; i++) binaryStr += String.fromCharCode(compressed[i]);
      let b64 = btoa(binaryStr).replace(/\\+/g, '-').replace(/\\//g, '_');
      if (b64.length > 8000) {
          alert("Pattern too large for link sharing. Please use Save Project (.json) instead.");
          return;
      }
      window.location.href = 'stitch.html#p=' + b64;
    }catch(e2){
      alert('Pattern is too large for direct transfer. Please save the file and open it in the Tracker.');
    }
  }
}
"""
save_func_idx = content.find("function saveProject()")
content = content[:save_func_idx] + fn + "\n" + content[save_func_idx:]


# 2. UPDATE UI TO USE IT
ui1 = """{pat&&pal&&<button onClick={saveProject} style={{padding:"5px 12px",fontSize:12,borderRadius:8,border:"none",background:"#0d9488",color:"#fff",cursor:"pointer",fontWeight:500}}>Save</button>}</div>"""
new_ui1 = """{pat&&pal&&<button onClick={saveProject} style={{padding:"5px 12px",fontSize:12,borderRadius:8,border:"none",background:"#0d9488",color:"#fff",cursor:"pointer",fontWeight:500}}>Save</button>}{pat&&pal&&<button onClick={handleOpenInTracker} style={{padding:"5px 12px",fontSize:12,borderRadius:8,border:"none",background:"#ea580c",color:"#fff",cursor:"pointer",fontWeight:500}}>Start Tracking →</button>}</div>"""
content = content.replace(ui1, new_ui1)

ui2 = """<button onClick={()=>{
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
          }} style={{padding:"12px 20px",fontSize:15,borderRadius:8,border:"none",background:"#0d9488",color:"#fff",cursor:"pointer",fontWeight:600,boxShadow:"none", display:"flex", alignItems:"center", justifyContent:"center", gap:8}}>🧵 Open in Stitch Tracker →</button>"""

new_ui2 = """<button onClick={handleOpenInTracker} style={{padding:"12px 20px",fontSize:15,borderRadius:8,border:"none",background:"#0d9488",color:"#fff",cursor:"pointer",fontWeight:600,boxShadow:"none", display:"flex", alignItems:"center", justifyContent:"center", gap:8}}>🧵 Open in Stitch Tracker →</button>"""
content = content.replace(ui2, new_ui2)


# 3. ADD RECEIVER LOGIC
process_func = """function processLoadedProject(project){"""
new_process_func = """function processLoadedProject(project){
  if(project.v===8 || project.p){
    setSW(project.w||80);setSH(project.h||80);setBsLines(project.bs||[]);setFabricCt(project.fc||14);
    let p = project.p.map(m => {
        if(m[1] === 'k') return restoreStitch({id:"__skip__"});
        if(m[1] === 'b') return restoreStitch({type:"blend",id:m[0]});
        return restoreStitch({type:"solid",id:m[0]});
    });
    let{pal:newPal,cmap:newCmap}=buildPalette(p);
    setPat(p);setPal(newPal);setCmap(newCmap);setTab("pattern");setActiveTool(null);setSelectedColorId(null);setEditHistory([]);setSidebarOpen(true);
    setDone(new Uint8Array(p.length));
    setTimeout(()=>{let z=Math.min(3,Math.max(0.05,750/((project.w||80)*20)));setZoom(z);},100);
    return;
  }
"""
content = content.replace(process_func, new_process_func)

useEffect_str = """useEffect(() => {
    // Automatically load from IndexedDB on startup
    loadProjectFromDB().then(project => {
        if (project && project.pattern && project.settings) {
            processLoadedProject(project);
        }
    });
}, []);"""

new_useEffect_str = """useEffect(() => {
  const handoff = localStorage.getItem('crossstitch_handoff');
  if (handoff) {
    try {
      const projectData = JSON.parse(handoff);
      localStorage.removeItem('crossstitch_handoff');
      processLoadedProject(projectData);
      return;
    } catch (e) {
      console.error('Failed to load handoff data:', e);
    }
  }

  const hash = window.location.hash.slice(1);
  if (hash.startsWith('p=')) {
    try {
      const encoded = hash.slice(2);
      const base64 = encoded.replace(/-/g, '+').replace(/_/g, '/');
      const binaryStr = atob(base64);
      const binaryData = new Uint8Array(binaryStr.length);
      for (let i = 0; i < binaryStr.length; i++) binaryData[i] = binaryStr.charCodeAt(i);
      const decompressed = pako.inflate(binaryData, { to: 'string' });
      const project = JSON.parse(decompressed);
      processLoadedProject(project);
      window.location.hash = '';
      return;
    } catch (err) {
      console.error("Failed to load from URL:", err);
      setLoadError("Failed to load pattern from link.");
    }
  }

  loadProjectFromDB().then(project => {
    if (project && project.pattern && project.settings) {
      processLoadedProject(project);
    }
  });
}, []);"""
content = content.replace(useEffect_str, new_useEffect_str)

# 4. ADD WARNINGS
warn_cond = """if(done && done.some(v => v === 1) && !confirm("This pattern has tracking progress. Editing the pattern will reset your stitching progress. Continue?")) return;"""

func_paint = """if((activeTool==="paint"||activeTool==="fill")&&selectedColorId&&cmap){"""
content = content.replace(func_paint, func_paint + "\n    " + warn_cond)

func_erasebs = """if(activeTool==="eraseBs"){"""
content = content.replace(func_erasebs, func_erasebs + "\n    " + warn_cond)

func_backstitch = """if(activeTool==="backstitch"){if(gx<0||gx>sW||gy<0||gy>sH)return;"""
content = content.replace(func_backstitch, func_backstitch + " " + warn_cond)

func_autocrop = """const autoCrop = useCallback(() => {
  if (!pat || !img) return;"""
content = content.replace(func_autocrop, func_autocrop + "\n  " + warn_cond)

func_generate = """const generate=useCallback(()=>{
  if(!img)return;"""
content = content.replace(func_generate, func_generate + "\n  " + warn_cond)

with open("creator-app.js", "w") as f:
    f.write(content)
