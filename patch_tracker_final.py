import sys
import re

with open("tracker-app.js", "r") as f:
    content = f.read()

# Add handleEditInCreator function
fn = """function handleEditInCreator(){
  if(!pat||!pal)return;
  const sseArr = [...singleStitchEdits.entries()];
  let project={
    version:8,
    page:"tracker",
    settings:{sW,sH,fabricCt,skeinPrice,stitchSpeed},
    pattern:pat.map(m=>(m.id==="__skip__"||m.id==="__empty__")?{id:m.id}:{id:m.id,type:m.type,rgb:m.rgb}),
    bsLines,
    done:done?Array.from(done):null,
    parkMarkers,
    totalTime:totalTime+(sessionActive?Math.floor((Date.now()-sessionStart)/1000):0),
    sessions,
    hlRow,
    hlCol,
    threadOwned,
    originalPaletteState,
    singleStitchEdits: sseArr
  };
  try{
    localStorage.setItem('crossstitch_handoff', JSON.stringify(project));
    window.location.href = 'index.html?source=tracker';
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
          alert("Pattern too large for direct transfer. Please use Save Project (.json) instead and load it in the Creator.");
          return;
      }
      window.location.href = 'index.html#p=' + b64;
    }catch(e2){
      alert('Pattern is too large for direct transfer. Please save the file and open it in the Creator.');
    }
  }
}
"""

save_func_idx = content.find("function saveProject()")
content = content[:save_func_idx] + fn + "\n" + content[save_func_idx:]


ui = """<div style={{marginTop:20, display:"flex", gap:10, justifyContent:"center", padding:"20px", borderTop:"0.5px solid #e4e4e7"}}>
      <button onClick={saveProject} style={{padding:"10px 20px",fontSize:14,borderRadius:8,border:"none",background:"#0d9488",color:"#fff",cursor:"pointer",fontWeight:600}}>Save Project (.json)</button>
      <button onClick={()=>loadRef.current.click()} style={{padding:"10px 20px",fontSize:14,borderRadius:8,border:"0.5px solid #e4e4e7",background:"#fff",cursor:"pointer",fontWeight:500}}>Load Different Project</button>
    </div>"""

new_ui = """<div style={{marginTop:20, display:"flex", gap:10, justifyContent:"center", padding:"20px", borderTop:"0.5px solid #e4e4e7"}}>
      <button onClick={handleEditInCreator} style={{padding:"10px 20px",fontSize:14,borderRadius:8,border:"none",background:"#ea580c",color:"#fff",cursor:"pointer",fontWeight:600}}>← Edit in Creator</button>
      <button onClick={saveProject} style={{padding:"10px 20px",fontSize:14,borderRadius:8,border:"none",background:"#0d9488",color:"#fff",cursor:"pointer",fontWeight:600}}>Save Project (.json)</button>
      <button onClick={()=>loadRef.current.click()} style={{padding:"10px 20px",fontSize:14,borderRadius:8,border:"0.5px solid #e4e4e7",background:"#fff",cursor:"pointer",fontWeight:500}}>Load Different Project</button>
    </div>"""
content = content.replace(ui, new_ui)

useEffect_str = """useEffect(() => {
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
          for (let i = 0; i < binaryStr.length; i++) {
              binaryData[i] = binaryStr.charCodeAt(i);
          }
          const decompressed = pako.inflate(binaryData, { to: 'string' });
          const project = JSON.parse(decompressed);
          processLoadedProject(project);
          window.location.hash = '';
      } catch (err) {
          console.error("Failed to load from URL:", err);
          setLoadError("Failed to load pattern from link.");
      }
  }
}, []);"""

content = content.replace(useEffect_str, new_useEffect_str)

with open("tracker-app.js", "w") as f:
    f.write(content)
