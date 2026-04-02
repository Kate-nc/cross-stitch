import sys

with open("creator-app.js", "r") as f:
    content = f.read()

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
          alert("Pattern too large for direct transfer. Please use Save Project (.json) instead and load it in the tracker.");
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


ui1 = """{pat&&pal&&<button onClick={saveProject} style={{padding:"5px 12px",fontSize:12,borderRadius:8,border:"none",background:"#0d9488",color:"#fff",cursor:"pointer",fontWeight:500}}>Save</button>}"""
new_ui1 = ui1 + """{pat&&pal&&<button onClick={handleOpenInTracker} style={{padding:"5px 12px",fontSize:12,borderRadius:8,border:"none",background:"#ea580c",color:"#fff",cursor:"pointer",fontWeight:500}}>Start Tracking →</button>}"""
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
                  let b64 = btoa(binaryStr).replace(/\\+/g, '-').replace(/\\//g, '_');
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

with open("creator-app.js", "w") as f:
    f.write(content)
