import sys
import re

with open("creator-app.js", "r") as f:
    content = f.read()

# Add logic to read originalPaletteState, singleStitchEdits if returning from Tracker

process_func = """function processLoadedProject(project){"""
new_process_func = """function processLoadedProject(project){
  if(project.v===8 || project.p){
    // Load from pako compressed format
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

with open("creator-app.js", "w") as f:
    f.write(content)
