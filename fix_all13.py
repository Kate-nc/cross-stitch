import re

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

    content = re.sub(r'const skeinData=useMemo\(\(\)=>\{\s*if\(!pal\).*?\},\[pal,fabricCt\]\);', new_skeindata, content, flags=re.DOTALL)

    if "creator" in filename or "index.html" in filename:
        pdf_orig = """pdf.setFillColor(m.rgb[0],m.rgb[1],m.rgb[2]);pdf.rect(px3,py3,cellMM,cellMM,"F");pdf.setDrawColor(200);pdf.rect(px3,py3,cellMM,cellMM,"S");if(info){pdf.setFontSize(5);pdf.setTextColor(luminance(m.rgb)>128?0:255);pdf.text(info.symbol,px3+cellMM/2,py3+cellMM*0.7,{align:"center"});}"""
        pdf_repl = """let drawPdfStitch = (st, isSec) => {
        let stType = st.stitchType || "full";
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
        let stInfo = cmap[st.id];
        if(stInfo){
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
            pdf.text(stInfo.symbol,symX,symY,{align:"center"});
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

    with open(filename, 'w') as f:
        f.write(content)

apply_patch('creator-app.js')
apply_patch('index.html')
apply_patch('tracker-app.js')
apply_patch('stitch.html')
