import re

with open("creator-app.js", "r") as f:
    content = f.read()

# 1. Add bsContinuous state
target_state = "const[activeTool,setActiveTool]=useState(null),[bsLines,setBsLines]=useState([]),[bsStart,setBsStart]=useState(null);"
new_state = "const[activeTool,setActiveTool]=useState(null),[bsLines,setBsLines]=useState([]),[bsStart,setBsStart]=useState(null);\nconst[bsContinuous,setBsContinuous]=useState(false);"
content = content.replace(target_state, new_state)

# 2. Add bsContinuous checkbox to UI
target_ui = '<button onClick={()=>setTool("backstitch")} style={tBtn(activeTool==="backstitch")}>Backstitch</button>'
new_ui = '<button onClick={()=>setTool("backstitch")} style={tBtn(activeTool==="backstitch")}>Backstitch</button>\n            {activeTool==="backstitch"&&<label style={{display:"flex",alignItems:"center",gap:4,fontSize:11,cursor:"pointer"}}><input type="checkbox" checked={bsContinuous} onChange={e=>{setBsContinuous(e.target.checked);setBsStart(null);}}/>Continuous</label>}'
content = content.replace(target_ui, new_ui)

# 3. Update setBsStart in handlePatClick
target_bs_start = "if(activeTool===\"backstitch\"){if(gx<0||gx>sW||gy<0||gy>sH)return;let pt={x:gx,y:gy};if(!bsStart)setBsStart(pt);else{setBsLines(prev=>[...prev,{x1:bsStart.x,y1:bsStart.y,x2:pt.x,y2:pt.y}]);setBsStart(null);}}"
new_bs_start = "if(activeTool===\"backstitch\"){if(gx<0||gx>sW||gy<0||gy>sH)return;let pt={x:gx,y:gy};if(!bsStart)setBsStart(pt);else{setBsLines(prev=>[...prev,{x1:bsStart.x,y1:bsStart.y,x2:pt.x,y2:pt.y}]);setBsStart(bsContinuous?pt:null);}}"
content = content.replace(target_bs_start, new_bs_start)

# 4. Add keydown useEffect for Escape key
target_keydown = "function handlePatMouseLeave(){setHoverCoords(null);}"
new_keydown = """function handlePatMouseLeave(){setHoverCoords(null);}

useEffect(()=>{
  function handleKeyDown(e){
    if(e.key==="Escape" && activeTool==="backstitch" && bsStart){
      setBsStart(null);
    }
  }
  window.addEventListener("keydown",handleKeyDown);
  return ()=>window.removeEventListener("keydown",handleKeyDown);
},[activeTool,bsStart]);"""
content = content.replace(target_keydown, new_keydown)

# 5. Add onContextMenu handler to canvas
target_canvas = '<canvas ref={pcRef} style={{display:"block"}} onClick={handlePatClick} onMouseMove={handlePatMouseMove} onMouseLeave={handlePatMouseLeave}/>'
new_canvas = '<canvas ref={pcRef} style={{display:"block"}} onClick={handlePatClick} onMouseMove={handlePatMouseMove} onMouseLeave={handlePatMouseLeave} onContextMenu={e=>{if(activeTool==="backstitch"&&bsStart){e.preventDefault();setBsStart(null);}}}/>'
content = content.replace(target_canvas, new_canvas)

# 6. Add exportPDF and exportCoverSheet before handlePatClick
export_funcs = """function exportPDF(){if(!pat||!pal||!cmap)return;const{jsPDF}=window.jspdf;const pdf=new jsPDF("portrait","mm","a4");const mg=12,cW2=186;pdf.setFontSize(22);pdf.text("Cross Stitch Pattern",mg,mg+10);pdf.setFontSize(12);pdf.setTextColor(100);pdf.text(`${sW}x${sH} · ${pal.length} colours · ${skeinData.length} skeins · ${fabricCt}ct`,mg,mg+18);if(done&&totalStitchable>0){let dc=0;for(let i=0;i<done.length;i++)if(done[i])dc++;if(dc>0){let pct=Math.round(dc/totalStitchable*1000)/10;pdf.text(`Progress: ${pct}%`,mg,mg+25);}}pdf.setTextColor(0);let ty=mg+35;pdf.setFontSize(14);pdf.text("Thread Legend",mg,ty);ty+=8;pdf.setFontSize(8);pal.forEach(p=>{if(ty>285){pdf.addPage();ty=mg+8;}pdf.setFillColor(p.rgb[0],p.rgb[1],p.rgb[2]);pdf.circle(mg+4,ty-1.5,2,"F");pdf.setTextColor(0);let sk=skeinEst(p.count,fabricCt);pdf.text(p.symbol+" DMC "+p.id+" "+(p.type==="blend"?p.threads[0].name+"+"+p.threads[1].name:p.name)+" ("+p.count+" st, "+sk+" skein"+(sk>1?"s":"")+")",mg+10,ty);ty+=5;});const cellMM=3,gridCols=Math.floor(cW2/cellMM),gridRows=Math.floor(275/cellMM),pagesX=Math.ceil(sW/gridCols),pagesY=Math.ceil(sH/gridRows);for(let py2=0;py2<pagesY;py2++)for(let px2=0;px2<pagesX;px2++){pdf.addPage();let x0=px2*gridCols,y0=py2*gridRows,dW=Math.min(gridCols,sW-x0),dH=Math.min(gridRows,sH-y0);pdf.setFontSize(8);pdf.setTextColor(100);pdf.text(`Page ${py2*pagesX+px2+1}/${pagesX*pagesY}`,mg,mg+4);for(let gy=0;gy<dH;gy++)for(let gx=0;gx<dW;gx++){let m=pat[(y0+gy)*sW+(x0+gx)];if(!m||m.id==="__skip__")continue;let info=cmap[m.id],px3=mg+gx*cellMM,py3=mg+8+gy*cellMM;pdf.setFillColor(m.rgb[0],m.rgb[1],m.rgb[2]);pdf.rect(px3,py3,cellMM,cellMM,"F");pdf.setDrawColor(200);pdf.rect(px3,py3,cellMM,cellMM,"S");if(info){pdf.setFontSize(5);pdf.setTextColor(luminance(m.rgb)>128?0:255);pdf.text(info.symbol,px3+cellMM/2,py3+cellMM*0.7,{align:"center"});}}pdf.setDrawColor(80);pdf.setLineWidth(0.2);for(let gx2=0;gx2<=dW;gx2+=10)pdf.line(mg+gx2*cellMM,mg+8,mg+gx2*cellMM,mg+8+dH*cellMM);for(let gy2=0;gy2<=dH;gy2+=10)pdf.line(mg,mg+8+gy2*cellMM,mg+dW*cellMM,mg+8+gy2*cellMM);pdf.setDrawColor(0);pdf.setLineWidth(0.4);pdf.rect(mg,mg+8,dW*cellMM,dH*cellMM,"S");}pdf.save("cross-stitch-pattern.pdf");}

function exportCoverSheet(){
  if(!pat||!pal||!cmap)return;
  const{jsPDF}=window.jspdf;const pdf=new jsPDF("portrait","mm","a4");const mg=15;
  let y=mg;
  // Title
  pdf.setFontSize(26);pdf.setTextColor(30,30,30);pdf.text("Cross Stitch Project",mg,y+10);y+=18;
  pdf.setDrawColor(91,123,179);pdf.setLineWidth(0.8);pdf.line(mg,y,195,y);y+=10;

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
"""

target_funcs_insertion = "function handlePatClick(e){"
content = content.replace(target_funcs_insertion, export_funcs + "\n" + target_funcs_insertion)

# 7. Update export UI buttons
target_export_ui = '<Section title="PDF Export"><p style={{fontSize:12,color:"#71717a",margin:"8px 0 10px"}}>Export multi-page chart, cover sheet, and legend.</p><div style={{display:"flex",gap:8,flexWrap:"wrap"}}><button onClick={()=>setModal("pdf_export")} style={{padding:"10px 20px",fontSize:14,borderRadius:8,border:"none",background:"linear-gradient(135deg,#0d9488,#0f766e)",color:"#fff",cursor:"pointer",fontWeight:600,boxShadow:"none"}}>Export PDF</button></div></Section>'
new_export_ui = '<Section title="PDF Export"><p style={{fontSize:12,color:"#71717a",margin:"8px 0 10px"}}>Multi-page PDF with legend and chart.</p><div style={{display:"flex",gap:8,flexWrap:"wrap"}}><button onClick={exportPDF} style={{padding:"10px 20px",fontSize:14,borderRadius:8,border:"none",background:"linear-gradient(135deg,#0d9488,#0f766e)",color:"#fff",cursor:"pointer",fontWeight:600,boxShadow:"none"}}>Download Pattern PDF</button><button onClick={exportCoverSheet} style={{padding:"10px 20px",fontSize:14,borderRadius:8,border:"1.5px solid #0d9488",background:"#fff",color:"#0d9488",cursor:"pointer",fontWeight:600}}>Cover Sheet PDF</button></div><p style={{fontSize:11,color:"#a1a1aa",marginTop:8}}>The cover sheet includes pattern summary, thread list with owned/to-buy status, and space for notes — perfect for tucking into your project bag.</p></Section>'
content = content.replace(target_export_ui, new_export_ui)

# 8. Add onExportPDF back to <Header ... /> since index.html App had it
target_header = '<Header page="creator" onNewProject={()=>{if(!pat||confirm("Start a new project? Unsaved progress will be lost.")){resetAll();setImg(null);}}} onExportPDF={pat ? () => setModal("pdf_export") : null} setModal={setModal} />'
new_header = '<Header page="creator" onNewProject={()=>{if(!pat||confirm("Start a new project? Unsaved progress will be lost.")){resetAll();setImg(null);}}} onExportPDF={pat ? exportPDF : null} setModal={setModal} />'
content = content.replace(target_header, new_header)


with open("creator-app.js", "w") as f:
    f.write(content)
