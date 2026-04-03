import re

with open("creator-app.js", "r") as f:
    content = f.read()

# Let's completely remove anything after `newImg.src=c.toDataURL();\n}` up until `function saveProject()`
# because `handleOpenInTracker` was supposed to be injected right BEFORE `function saveProject()`

idx_crop_end = content.find("newImg.src=c.toDataURL();\n}")
if idx_crop_end != -1:
    idx_crop_end += len("newImg.src=c.toDataURL();\n}")
else:
    print("Could not find crop end")
    sys.exit(1)

idx_save = content.find("function saveProject()")
if idx_save != -1:
    print("Found saveProject at", idx_save)
else:
    print("Could not find saveProject")
    sys.exit(1)

# Now, we insert `handleOpenInTracker` exactly between these two points
fn = """

function handleOpenInTracker(){
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

new_content = content[:idx_crop_end] + fn + content[idx_save:]

with open("creator-app.js", "w") as f:
    f.write(new_content)
