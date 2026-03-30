# The scripts above do: 1) reset branch, 2) run fix_all13.py, 3) run fix_all11.py which RESETS BRANCH AGAIN AND FIXES ONLY ONE THING!
# Let me combine them properly!
import subprocess
subprocess.run(['git', 'checkout', 'HEAD', 'creator-app.js', 'index.html', 'tracker-app.js', 'stitch.html'])

def apply_patch(filename):
    with open(filename, 'r') as f:
        content = f.read()

    new_skeindata = """const skeinData=useMemo(()=>{
  if(!pal||!pat)return[];
  let map={};

  for(let i=0;i<pat.length;i++){
    let m=pat[i];
    if(m.id==="__skip__")continue;
    let weight = 1.0;
    if(m.stitchType){
      if(m.stitchType.startsWith("half_")) weight = 0.5;
      else if(m.stitchType.startsWith("quarter_")) weight = 0.25;
      else if(m.stitchType.startsWith("three_quarter_")) weight = 0.75;
    }

    if(m.type==="blend"&&m.threads){
      m.threads.forEach(t=>{map[t.id]=(map[t.id]||0)+weight;});
    } else {
      map[m.id]=(map[m.id]||0)+weight;
    }

    if(m.secondary){
      let sec = m.secondary;
      if(sec.type==="blend"&&sec.threads){
        sec.threads.forEach(t=>{map[t.id]=(map[t.id]||0)+0.25;});
      } else {
        map[sec.id]=(map[sec.id]||0)+0.25;
      }
    }
  }

  return Object.entries(map).sort((a,b)=>{let na=parseInt(a[0])||0,nb=parseInt(b[0])||0;if(na&&nb)return na-nb;return a[0].localeCompare(b[0]);}).map(([id,ct])=>{let t=DMC.find(d=>d.id===id);return{id,name:t?t.name:"",rgb:t?t.rgb:[128,128,128],stitches:Math.ceil(ct),skeins:skeinEst(ct,fabricCt)};});
},[pal,pat,fabricCt]);"""

    import re
    content = re.sub(r'const skeinData=useMemo\(\(\)=>\{\s*if\(!pal\).*?\},\[pal,fabricCt\]\);', new_skeindata, content, flags=re.DOTALL)

    helpers_code = """
function drawStitchShape(ctx, st, px, py, cSz, isDimmed, isDone, viewMode) {
  let stType = st.stitchType || "full";
  let fillCol = `rgb(${st.rgb[0]},${st.rgb[1]},${st.rgb[2]})`;
  let fillAlpha = isDimmed ? 0.15 : 1;
  let lineCol = fillCol;

  if (viewMode === "symbol") {
    fillCol = isDone ? "#d1fae5" : "#fff";
    lineCol = isDone ? "#059669" : "#333";
    fillAlpha = 1;
  } else if (viewMode === "color" || viewMode === "colour") {
    fillAlpha = isDimmed ? 0.15 : 1;
    if (isDone) fillAlpha = 0.5;
  } else if (viewMode === "both") {
    fillAlpha = isDimmed ? 0.15 : 1;
    if (isDone) fillAlpha = 0.5;
  } else if (viewMode === "highlight") {
    if (isDone) {
      fillCol = isDimmed ? "#f4f4f5" : `rgb(${st.rgb[0]},${st.rgb[1]},${st.rgb[2]})`;
      lineCol = "#059669";
      fillAlpha = 1;
    } else if (isDimmed) {
      fillCol = "#f4f4f5";
      lineCol = "rgba(0,0,0,0.1)";
      fillAlpha = 1;
    } else {
      fillAlpha = 0.25;
    }
  }

  if (stType === "full") {
    ctx.fillStyle = fillCol;
    ctx.globalAlpha = fillAlpha;
    ctx.fillRect(px, py, cSz, cSz);
    ctx.globalAlpha = 1.0;
    return;
  }

  if (viewMode === "symbol" && !isDone) {
    ctx.fillStyle = "#fff";
    ctx.globalAlpha = 1.0;
    ctx.fillRect(px, py, cSz, cSz);
  } else if (fillCol !== "#fff" || isDone) {
    ctx.fillStyle = fillCol;
    ctx.globalAlpha = fillAlpha * 0.35;
    if (isDone && viewMode === "symbol") ctx.globalAlpha = 1.0;
    ctx.fillRect(px, py, cSz, cSz);
  }

  ctx.globalAlpha = isDimmed && viewMode !== "highlight" ? 0.2 : 1.0;
  ctx.strokeStyle = lineCol;
  ctx.lineWidth = Math.max(1.5, cSz * 0.15);
  ctx.lineCap = "round";

  let cx = px + cSz / 2;
  let cy = py + cSz / 2;
  let rT = py, rB = py + cSz, rL = px, rR = px + cSz;

  let drawLine = (x1, y1, x2, y2) => {
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.stroke();
  };

  if (stType === "half_bl") drawLine(rL, rB, rR, rT);
  else if (stType === "half_br") drawLine(rR, rB, rL, rT);
  else if (stType === "quarter_tl") drawLine(rL, rT, cx, cy);
  else if (stType === "quarter_tr") drawLine(rR, rT, cx, cy);
  else if (stType === "quarter_bl") drawLine(rL, rB, cx, cy);
  else if (stType === "quarter_br") drawLine(rR, rB, cx, cy);
  else if (stType === "three_quarter_tl") { drawLine(rL, rT, cx, cy); drawLine(rL, rB, rR, rT); }
  else if (stType === "three_quarter_tr") { drawLine(rR, rT, cx, cy); drawLine(rR, rB, rL, rT); }
  else if (stType === "three_quarter_bl") { drawLine(rL, rB, cx, cy); drawLine(rR, rB, rL, rT); }
  else if (stType === "three_quarter_br") { drawLine(rR, rB, cx, cy); drawLine(rL, rB, rR, rT); }

  ctx.globalAlpha = 1.0;
}

function drawSymbol(ctx, st, info, px, py, cSz, isDimmed, isDone, viewMode) {
  if (!info || cSz < 6) return;
  let stType = st.stitchType || "full";

  if (viewMode === "color" || viewMode === "colour") {
    if (isDone) return;
  }

  let isQuarter = stType.startsWith("quarter_") || stType.startsWith("three_quarter_") || st.isSecondary;

  let symCol = "#333";
  let lum = luminance(st.rgb);

  if (viewMode === "symbol") {
    symCol = isDone ? "#059669" : "#333";
    if (isDimmed) symCol = "rgba(0,0,0,0.15)";
  } else if (viewMode === "color" || viewMode === "colour") {
    symCol = lum > 140 ? "rgba(0,0,0,0.8)" : "rgba(255,255,255,0.95)";
  } else if (viewMode === "both") {
    symCol = lum > 128 ? "#000" : "#fff";
    if (isDimmed) symCol = "rgba(0,0,0,0.3)";
  } else if (viewMode === "highlight") {
    symCol = isDimmed ? "rgba(0,0,0,0.06)" : "#18181b";
    if (isDone && !isDimmed) symCol = "#fff";
  }

  ctx.fillStyle = symCol;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";

  let symX = px + cSz / 2;
  let symY = py + cSz / 2;
  let fontSize = cSz * (viewMode === "highlight" ? 0.7 : 0.6);

  if (isQuarter) {
    if (cSz < 10 && !st.isSecondary && !stType.startsWith("three_quarter_")) return;

    let corner = "";
    if (st.isSecondary) {
      corner = st.stitchType.split("_")[1];
    } else if (stType.startsWith("quarter_")) {
      corner = stType.split("_")[1];
    }

    if (corner) {
      fontSize = cSz * 0.4;
      let off = cSz * 0.25;
      if (corner === "tl") { symX -= offX; symY -= offY; }
      else if (corner === "tr") { symX += offX; symY -= offY; }
      else if (corner === "bl") { symX -= offX; symY += offY; }
      else if (corner === "br") { symX += offX; symY += offY; }
    }
  }

  ctx.font = `bold ${Math.max(5, fontSize)}px monospace`;
  if (viewMode === "highlight" && isDimmed) ctx.font = `${Math.max(5, fontSize)}px monospace`;

  ctx.fillText(info.symbol, symX, symY);
}
"""

    if "creator" in filename or "index.html" in filename:
        pdf_orig = """pdf.setFillColor(m.rgb[0],m.rgb[1],m.rgb[2]);pdf.rect(px3,py3,cellMM,cellMM,"F");pdf.setDrawColor(200);pdf.rect(px3,py3,cellMM,cellMM,"S");if(info){pdf.setFontSize(5);pdf.setTextColor(luminance(m.rgb)>128?0:255);pdf.text(info.symbol,px3+cellMM/2,py3+cellMM*0.7,{align:"center"});}"""
        pdf_repl = """let drawPdfStitch = (st, isSec) => {
        let stType = st.stitchType || "full";
        let info = cmap[st.id];

        pdf.setFillColor(st.rgb[0],st.rgb[1],st.rgb[2]);

        if (stType === "full") {
            pdf.rect(px3,py3,cellMM,cellMM,"F");
        } else {
            pdf.setDrawColor(st.rgb[0],st.rgb[1],st.rgb[2]);
            pdf.setLineWidth(0.3);
            let cx = px3 + cellMM/2, cy = py3 + cellMM/2;
            let rL = px3, rR = px3 + cellMM, rT = py3, rB = py3 + cellMM;
            let drawLine = (x1, y1, x2, y2) => { pdf.line(x1, y1, x2, y2); };
            if (stType === "half_bl") drawLine(rL, rB, rR, rT);
            else if (stType === "half_br") drawLine(rR, rB, rL, rT);
            else if (stType === "quarter_tl") drawLine(rL, rT, cx, cy);
            else if (stType === "quarter_tr") drawLine(rR, rT, cx, cy);
            else if (stType === "quarter_bl") drawLine(rL, rB, cx, cy);
            else if (stType === "quarter_br") drawLine(rR, rB, cx, cy);
            else if (stType === "three_quarter_tl") { drawLine(rL, rT, cx, cy); drawLine(rL, rB, rR, rT); }
            else if (stType === "three_quarter_tr") { drawLine(rR, rT, cx, cy); drawLine(rR, rB, rL, rT); }
            else if (stType === "three_quarter_bl") { drawLine(rL, rB, cx, cy); drawLine(rR, rB, rL, rT); }
            else if (stType === "three_quarter_br") { drawLine(rR, rB, cx, cy); drawLine(rL, rB, rR, rT); }
        }

        pdf.setDrawColor(200);pdf.setLineWidth(0.1);pdf.rect(px3,py3,cellMM,cellMM,"S");

        if(info){
            let isQuarter = stType.startsWith("quarter_") || stType.startsWith("three_quarter_") || isSec;
            let fSz = isQuarter ? 3 : 5;
            pdf.setFontSize(fSz);
            pdf.setTextColor(luminance(st.rgb)>128?0:255);
            let symX = px3+cellMM/2, symY = py3+cellMM*0.7;

            if (isQuarter) {
                let corner = isSec ? st.stitchType.split("_")[1] : (stType.startsWith("quarter_") ? stType.split("_")[1] : "");
                let offX = cellMM*0.25, offY = cellMM*0.25;
                if (corner === "tl") { symX -= offX; symY -= offY; }
                else if (corner === "tr") { symX += offX; symY -= offY; }
                else if (corner === "bl") { symX -= offX; symY += offY; }
                else if (corner === "br") { symX += offX; symY += offY; }
            }
            pdf.text(info.symbol,symX,symY,{align:"center"});
        }
    };

    drawPdfStitch(m, false);
    if (m.secondary) { let sec = m.secondary; sec.isSecondary = true; drawPdfStitch(sec, true); }"""
        content = content.replace(pdf_orig, pdf_repl)

        orig_leg = 'let sk=skeinEst(p.count,fabricCt);pdf.text(p.symbol+" DMC "+p.id+" "+(p.type==="blend"?p.threads[0].name+"+"+p.threads[1].name:p.name)+" ("+p.count+" st, "+sk+" skein"+(sk>1?"s":"")+")",mg+10,ty);'
        new_leg = 'let sk=skeinEst(p.count,fabricCt);let isFrac = pat.some(m => m.id === p.id && m.stitchType && m.stitchType !== "full" || (m.secondary && m.secondary.id === p.id));pdf.text(p.symbol+" DMC "+p.id+" "+(p.type==="blend"?p.threads[0].name+"+"+p.threads[1].name:p.name)+" ("+p.count+" st, "+sk+" skein"+(sk>1?"s":"")+")" + (isFrac ? " (incl. fractional)" : ""),mg+10,ty);'
        content = content.replace(orig_leg, new_leg)

        content = content.replace('const[activeTool,setActiveTool]=useState(null),', 'const[activeTool,setActiveTool]=useState(null),const[activeStitchType,setActiveStitchType]=useState("full"),const[activeQuarterCorner,setActiveQuarterCorner]=useState("tl"),')
        content = content.replace('const[done,setDone]=useState(null);', 'const[done,setDone]=useState(null),const[fractional,setFractional]=useState(false);')

        orig_ui = '{(activeTool==="paint"||activeTool==="fill")&&selectedColorId&&cmap[selectedColorId]&&<span style={{fontSize:11,display:"flex",alignItems:"center",gap:4,padding:"3px 10px",borderRadius:8,background:"#f4f4f5"}}><span style={{width:12,height:12,borderRadius:3,background:`rgb(${cmap[selectedColorId].rgb})`,border:"1px solid #d4d4d8",display:"inline-block"}}/> {selectedColorId}</span>}'
        new_ui = orig_ui + """
            {(activeTool==="paint"||activeTool==="fill")&&fractional&&<div style={{display:"flex",gap:2,background:"#f4f4f5",borderRadius:8,padding:2}}>
              {[{id:"full",l:"Full"},{id:"half_bl",l:"½ /"},{id:"half_br",l:"½ \\\\"},{id:"quarter",l:"¼"},{id:"three_quarter",l:"¾"}].map(t=><button key={t.id} onClick={()=>setActiveStitchType(t.id)} style={tBtn(activeStitchType===t.id)}>{t.l}</button>)}
            </div>}
            {(activeTool==="paint"||activeTool==="fill")&&fractional&&(activeStitchType==="quarter"||activeStitchType==="three_quarter")&&<div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:2,background:"#f4f4f5",borderRadius:8,padding:2}}>
              {[{id:"tl",l:"◸"},{id:"tr",l:"◹"},{id:"bl",l:"◺"},{id:"br",l:"◿"}].map(c=><button key={c.id} onClick={()=>setActiveQuarterCorner(c.id)} style={{...tBtn(activeQuarterCorner===c.id),padding:"2px 6px",fontSize:10}}>{c.l}</button>)}
            </div>}"""
        content = content.replace(orig_ui, new_ui)

        orig_settings = '<Section title="Palette" isOpen={palOpen} onToggle={setPalOpen}>'
        new_settings = orig_settings + '<label style={{display:"flex",alignItems:"center",gap:6,fontSize:12,cursor:"pointer",marginBottom:8,marginTop:8}}><input type="checkbox" checked={fractional} onChange={e=>setFractional(e.target.checked)}/>Allow fractional stitches</label>'
        content = content.replace(orig_settings, new_settings)

        orig_handlePatClick = """if((activeTool==="paint"||activeTool==="fill")&&selectedColorId&&cmap){
    if(gx<0||gx>=sW||gy<0||gy>=sH)return;let idx=gy*sW+gx;if(pat[idx].id==="__skip__")return;
    let pe=cmap[selectedColorId];if(!pe)return;let np=pat.slice();
    if(activeTool==="fill"){let ch=[],vis=new Set(),q=[idx],tid=pat[idx].id;if(tid===pe.id)return;while(q.length){let id2=q.pop();if(vis.has(id2))continue;vis.add(id2);if(pat[id2].id!==tid)continue;ch.push({idx:id2,old:{...pat[id2]}});let x2=id2%sW,y2=Math.floor(id2/sW);if(x2>0)q.push(id2-1);if(x2<sW-1)q.push(id2+1);if(y2>0)q.push(id2-sW);if(y2<sH-1)q.push(id2+sW);}if(!ch.length)return;setEditHistory(prev=>[...prev,{type:"fill",changes:ch}]);ch.forEach(c2=>np[c2.idx]={...pe});}
    else{setEditHistory(prev=>[...prev,{type:"paint",changes:[{idx,old:{...pat[idx]}}]}]);np[idx]={...pe};}
    setPat(np);let{pal:np2,cmap:nc}=buildPalette(np);setPal(np2);setCmap(nc);return;
  }"""
        new_handlePatClick = """if((activeTool==="paint"||activeTool==="fill")&&selectedColorId&&cmap){
    if(gx<0||gx>=sW||gy<0||gy>=sH)return;let idx=gy*sW+gx;if(pat[idx].id==="__skip__")return;
    let pe=cmap[selectedColorId];if(!pe)return;let np=pat.slice();
    let stType = "full";
    let isFractional = false;
    if (typeof activeStitchType !== "undefined" && activeStitchType !== "full") {
      stType = activeStitchType;
      if (stType === "quarter") stType = "quarter_" + (typeof activeQuarterCorner !== "undefined" ? activeQuarterCorner : "tl");
      if (stType === "three_quarter") stType = "three_quarter_" + (typeof activeQuarterCorner !== "undefined" ? activeQuarterCorner : "tl");
      isFractional = true;
    }
    if(activeTool==="fill" && !isFractional){
       let ch=[],vis=new Set(),q=[idx],tid=pat[idx].id;if(tid===pe.id)return;while(q.length){let id2=q.pop();if(vis.has(id2))continue;vis.add(id2);if(pat[id2].id!==tid)continue;ch.push({idx:id2,old:{...pat[id2]}});let x2=id2%sW,y2=Math.floor(id2/sW);if(x2>0)q.push(id2-1);if(x2<sW-1)q.push(id2+1);if(y2>0)q.push(id2-sW);if(y2<sH-1)q.push(id2+sW);}if(!ch.length)return;setEditHistory(prev=>[...prev,{type:"fill",changes:ch}]);ch.forEach(c2=>np[c2.idx]={...pe, stitchType:"full"});
    }
    else {
       let target = {...pe, stitchType: stType};
       let oldCell = pat[idx];
       if (stType.startsWith("quarter_") && oldCell.id !== "__skip__") {
         if (oldCell.id === pe.id && oldCell.stitchType === stType) return;
         target = {...oldCell};
         if (!target.secondary) {
             target.secondary = {...pe, stitchType: stType};
         } else {
             target.secondary = {...pe, stitchType: stType};
         }
       }
       setEditHistory(prev=>[...prev,{type:"paint",changes:[{idx,old:{...pat[idx]}}]}]);
       np[idx]=target;
    }
    setPat(np);let{pal:np2,cmap:nc}=buildPalette(np);setPal(np2);setCmap(nc);return;
  }"""
        content = content.replace(orig_handlePatClick, new_handlePatClick)

        content = content.replace('orphans},pattern:', 'orphans,fractional},pattern:')
        content = content.replace('let s=project.settings;', 'let s=project.settings;setFractional(!!s.fractional);')
        content = content.replace('orphans, bsLines,', 'orphans, fractional, bsLines,')

        content = content.replace('function drawPattern(', helpers_code + '\nfunction drawPattern(')

        orig_creator_draw_inner = """if(m.id==="__skip__"){drawCk(ctx,px,py,cSz);}
    else if(view==="color"||view==="both"){ctx.fillStyle=dim?`rgba(${m.rgb[0]},${m.rgb[1]},${m.rgb[2]},0.15)`:`rgb(${m.rgb[0]},${m.rgb[1]},${m.rgb[2]})`;ctx.fillRect(px,py,cSz,cSz);}
    else{ctx.fillStyle=dim?"#f5f5f5":"#fff";ctx.fillRect(px,py,cSz,cSz);}
    if(m.id!=="__skip__"&&(view==="symbol"||view==="both")&&info&&cSz>=6){let lum=luminance(m.rgb);ctx.fillStyle=dim?"rgba(0,0,0,0.08)":(view==="both"?(lum>128?"#000":"#fff"):"#333");ctx.font=`bold ${Math.max(6,cSz*0.6)}px monospace`;ctx.textAlign="center";ctx.textBaseline="middle";ctx.fillText(info.symbol,px+cSz/2,py+cSz/2);}"""

        new_creator_draw_inner = """if(m.id==="__skip__"){
      drawCk(ctx,px,py,cSz);
    } else {
      drawStitchShape(ctx, m, px, py, cSz, dim, false, view);
      drawSymbol(ctx, m, info, px, py, cSz, dim, false, view);
      if(m.secondary){
          let sec = m.secondary;
          sec.isSecondary = true;
          let secInfo = cmap ? cmap[sec.id] : null;
          drawStitchShape(ctx, sec, px, py, cSz, dim, false, view);
          drawSymbol(ctx, sec, secInfo, px, py, cSz, dim, false, view);
      }
    }"""
        content = content.replace(orig_creator_draw_inner, new_creator_draw_inner)

    if "tracker" in filename or "stitch.html" in filename:
        content = content.replace('function drawStitch(', helpers_code + '\nfunction drawStitch(')

        orig_tracker_draw_inner = """if(m.id==="__skip__"){drawCk(ctx,px,py,cSz);if(cSz>=4){ctx.strokeStyle="rgba(0,0,0,0.06)";ctx.strokeRect(px,py,cSz,cSz);}continue;}
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
    }"""
        new_tracker_draw_inner = """if(m.id==="__skip__"){
      drawCk(ctx,px,py,cSz);
    } else {
      drawStitchShape(ctx, m, px, py, cSz, dimmed, isDn, stitchView);
      drawSymbol(ctx, m, info, px, py, cSz, dimmed, isDn, stitchView);
      if(m.secondary){
          let sec = m.secondary;
          sec.isSecondary = true;
          let secInfo = cmap ? cmap[sec.id] : null;
          drawStitchShape(ctx, sec, px, py, cSz, dimmed, isDn, stitchView);
          drawSymbol(ctx, sec, secInfo, px, py, cSz, dimmed, isDn, stitchView);
      }
    }"""
        content = content.replace(orig_tracker_draw_inner, new_tracker_draw_inner)

    with open(filename, 'w') as f:
        f.write(content)

apply_patch('creator-app.js')
apply_patch('index.html')
apply_patch('tracker-app.js')
apply_patch('stitch.html')
