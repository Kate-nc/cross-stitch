with open("creator-app.js", "r") as f:
    content = f.read()

autosave_code = """
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
"""

target = """function loadProject(e){let f=e.target.files[0];if(!f)return;setLoadError(null);let rd=new FileReader();rd.onload=ev=>{try{
  let project=JSON.parse(ev.target.result);if(!project.pattern||!project.settings)throw new Error("Invalid");
  processLoadedProject(project);
}catch(err){console.error(err);setLoadError("Could not load: "+err.message);setTimeout(()=>setLoadError(null),4000);}};rd.readAsText(f);if(loadRef.current)loadRef.current.value="";}"""

new_content = content.replace(target, target + "\n" + autosave_code)

with open("creator-app.js", "w") as f:
    f.write(new_content)
