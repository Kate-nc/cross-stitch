// patch_brief3.js — Canvas Zoom & Pan for embroidery.js
const fs = require('fs');
const path = 'c:/Users/katie/Documents/Code/cross-stitch/embroidery.js';
let code = fs.readFileSync(path, 'utf8');
const R = '\r\n'; // CRLF

let ok = 0, fail = 0;
function rep(oldStr, newStr, name) {
  if (!code.includes(oldStr)) { console.error('MISSING:', name); fail++; return false; }
  code = code.replace(oldStr, newStr);
  console.log('OK:', name); ok++; return true;
}

// ─── 1. Zoom/pan constants (after lasso constants) ─────────────────────────
rep(
  'const LASSO_CLOSE_RADIUS      = 12;   // px to start anchor — triggers close indicator',
  'const LASSO_CLOSE_RADIUS      = 12;   // px to start anchor — triggers close indicator' + R
+ R
+ '// --- Zoom & Pan ---' + R
+ 'const ZOOM_MIN         = 0.25;  // minimum zoom level' + R
+ 'const ZOOM_MAX         = 10.0;  // maximum zoom level' + R
+ 'const ZOOM_STEP_BUTTON = 0.25;  // per toolbar button click' + R
+ 'const ZOOM_STEP_SCROLL = 0.1;   // per scroll tick',
  'zoom constants'
);

// ─── 2. Zoom/pan state + refs (after lasso state) ──────────────────────────
rep(
  '  const lassoLastMsRef=useRef(0);                     // timestamp for mousemove debounce' + R
+ R
+ '  const mainC=useRef(null),imgC=useRef(null),fileRef=useRef(null);',
  '  const lassoLastMsRef=useRef(0);                     // timestamp for mousemove debounce' + R
+ '  // Zoom & pan state' + R
+ '  const[zoom,setZoom]=useState(1);' + R
+ '  const[pan,setPan]=useState({x:0,y:0});' + R
+ '  // Refs for use inside callbacks (always current, no stale-closure issue)' + R
+ '  const zoomRef=useRef(1);         // mirrors zoom state' + R
+ '  const panRef=useRef({x:0,y:0}); // mirrors pan state' + R
+ '  const isPanningRef=useRef(false); // true while spacebar held' + R
+ '  const panStateRef=useRef({active:false,startX:0,startY:0,startPanX:0,startPanY:0});' + R
+ '  const touchRef=useRef({count:0,lastDist:0,lastMidX:0,lastMidY:0});' + R
+ R
+ '  const mainC=useRef(null),imgC=useRef(null),fileRef=useRef(null);',
  'zoom state + refs'
);

// ─── 3. clampPanFn helper + ref sync (before rebuildRegionCurve) ───────────
rep(
  '  const rebuildRegionCurve = useCallback((r) => {',
  '  // Keep refs in sync with state on every render (avoids stale closure in callbacks)' + R
+ '  zoomRef.current=zoom;panRef.current=pan;' + R
+ R
+ '  const clampPanFn=(px,py,z)=>({' + R
+ '    x:Math.max(CW*0.5-CW*z, Math.min(CW*0.5, px)),' + R
+ '    y:Math.max(CH*0.5-CH*z, Math.min(CH*0.5, py)),' + R
+ '  });' + R
+ R
+ '  const rebuildRegionCurve = useCallback((r) => {',
  'clampPanFn + ref sync'
);

// ─── 4. doFit callback (after finishLasso/resetLasso block) ─────────────
rep(
  '  },[lassoAnchors,lassoSegments,nextId]);' + R
+ R
+ '  // Canvas render',
  '  },[lassoAnchors,lassoSegments,nextId]);' + R
+ R
+ '  // Fit: reset zoom=1, pan=centre (content fills buffer at zoom=1)' + R
+ '  const doFit=useCallback(()=>{' + R
+ '    const np={x:0,y:0};' + R
+ '    setZoom(1);setPan(np);zoomRef.current=1;panRef.current=np;' + R
+ '  },[]);' + R
+ R
+ '  // Canvas render',
  'doFit callback'
);

// ─── 5. Replace entire canvas render useEffect ─────────────────────────────
const oldRender =
  '  // Canvas render' + R
+ '  useEffect(()=>{' + R
+ '    if(!mainC.current)return;const canvas=mainC.current;canvas.width=CW;canvas.height=CH;const ctx=canvas.getContext("2d");' + R
+ '    ctx.fillStyle="#f5f0eb";ctx.fillRect(0,0,CW,CH);';

if (!code.includes(oldRender)) { console.error('MISSING: render start'); fail++; }
else {
  const renderDepEnd = '},[regions,selId,view,curPts,editMode,dismissed,dragNode,lassoAnchors,lassoSegments,lassoPreview,lassoNearClose]);';
  const endIdx = code.indexOf(renderDepEnd);
  if (endIdx === -1) { console.error('MISSING: render deps end'); fail++; }
  else {
    const startIdx = code.indexOf(oldRender);
    const endFullIdx = endIdx + renderDepEnd.length;
    const newRender =
      '  // Canvas render' + R
+ '  useEffect(()=>{' + R
+ '    if(!mainC.current)return;' + R
+ '    const canvas=mainC.current;canvas.width=CW;canvas.height=CH;' + R
+ '    const ctx=canvas.getContext("2d");' + R
+ '    const z=zoom,p=pan;' + R
+ '    // Background (no transform — fills entire buffer)' + R
+ '    ctx.fillStyle="#f5f0eb";ctx.fillRect(0,0,CW,CH);' + R
+ '    // === Content layer: zoom/pan transform ===' + R
+ '    ctx.save();ctx.translate(p.x,p.y);ctx.scale(z,z);' + R
+ '    try{' + R
+ '      if(imgRef.current&&(view==="original"||view==="overlay")){const img=imgRef.current,s=Math.min(CW/img.width,CH/img.height);ctx.globalAlpha=view==="overlay"?.35:1;ctx.drawImage(img,(CW-img.width*s)/2,(CH-img.height*s)/2,img.width*s,img.height*s);ctx.globalAlpha=1;}' + R
+ '      if(view!=="original"){' + R
+ '        for(const r of regions){ctx.save();ctx.beginPath();ctx.moveTo(r.points[0][0],r.points[0][1]);for(let i=1;i<r.points.length;i++)ctx.lineTo(r.points[i][0],r.points[i][1]);ctx.closePath();ctx.fillStyle=r.dmc.h+(view==="overlay"?"88":"cc");ctx.fill();ctx.restore();renderStitch(ctx,r.points,r.bounds,r.stitch,r.direction);}' + R
+ '        for(const r of regions){const isSel=selId===r.id;ctx.save();ctx.beginPath();ctx.moveTo(r.points[0][0],r.points[0][1]);for(let i=1;i<r.points.length;i++)ctx.lineTo(r.points[i][0],r.points[i][1]);ctx.closePath();ctx.strokeStyle=isSel?ACCENT:"rgba(255,255,255,0.7)";ctx.lineWidth=(isSel?3:1.5)/z;if(isSel){ctx.shadowColor=ACCENT;ctx.shadowBlur=6/z;}ctx.stroke();ctx.restore();' + R
+ '          if(r.bounds.w>18&&r.bounds.h>18)renderArrow(ctx,r.bounds,r.direction);}' + R
+ '      }' + R
+ '    }finally{ctx.restore();}' + R
+ '    // === Overlay layer: buffer-space, zoom-invariant sizes ===' + R
+ '    const cb=(cx,cy)=>[cx*z+p.x,cy*z+p.y];' + R
+ '    // Rec badges' + R
+ '    if(view!=="original"&&editMode==="select"){for(const r of regions){const recs=getRecommendations(r,regions).filter(rc=>!dismissed.has(`${r.id}-${rc.msg.slice(0,20)}`));if(recs.length>0){const hw=recs.some(rc=>rc.type==="warning");const[bx,by]=cb(r.bounds.x+r.bounds.w-4,r.bounds.y+6);ctx.save();ctx.beginPath();ctx.arc(bx,by,5,0,Math.PI*2);ctx.fillStyle=hw?"#f59e0b":"#60a5fa";ctx.fill();ctx.strokeStyle="#fff";ctx.lineWidth=1.5;ctx.stroke();ctx.fillStyle="#fff";ctx.font="bold 8px system-ui";ctx.textAlign="center";ctx.textBaseline="middle";ctx.fillText(recs.length.toString(),bx,by+0.5);ctx.restore();}}}' + R
+ '    // Node editing overlays' + R
+ '    if(editMode==="editNodes"&&selId){' + R
+ '      const sr=regions.find(r=>r.id===selId);' + R
+ '      if(sr&&sr.nodes){' + R
+ '        const nodes=sr.nodes;' + R
+ '        ctx.save();ctx.strokeStyle=ACCENT+"66";ctx.lineWidth=1;ctx.setLineDash([3,3]);' + R
+ '        const[n0x,n0y]=cb(nodes[0][0],nodes[0][1]);ctx.beginPath();ctx.moveTo(n0x,n0y);' + R
+ '        for(let i=1;i<nodes.length;i++){const[nbx,nby]=cb(nodes[i][0],nodes[i][1]);ctx.lineTo(nbx,nby);}' + R
+ '        ctx.closePath();ctx.stroke();ctx.setLineDash([]);ctx.restore();' + R
+ '        for(let i=0;i<nodes.length;i++){' + R
+ '          const j=(i+1)%nodes.length;' + R
+ '          const midCX=(nodes[i][0]+nodes[j][0])/2,midCY=(nodes[i][1]+nodes[j][1])/2;' + R
+ '          const[mbx,mby]=cb(midCX,midCY);' + R
+ '          ctx.save();ctx.beginPath();ctx.arc(mbx,mby,4,0,Math.PI*2);ctx.fillStyle=ACCENT+"44";ctx.fill();ctx.strokeStyle=ACCENT;ctx.lineWidth=1;ctx.stroke();ctx.restore();' + R
+ '          ctx.save();ctx.strokeStyle=ACCENT;ctx.lineWidth=1.2;ctx.beginPath();ctx.moveTo(mbx-2,mby);ctx.lineTo(mbx+2,mby);ctx.stroke();ctx.beginPath();ctx.moveTo(mbx,mby-2);ctx.lineTo(mbx,mby+2);ctx.stroke();ctx.restore();' + R
+ '        }' + R
+ '        for(let i=0;i<nodes.length;i++){' + R
+ '          const[nnx,nny]=cb(nodes[i][0],nodes[i][1]);' + R
+ '          const isActive=dragNode&&dragNode.regionId===selId&&dragNode.nodeIdx===i;' + R
+ '          ctx.save();ctx.beginPath();ctx.arc(nnx,nny,NODE_R,0,Math.PI*2);ctx.fillStyle=isActive?ACCENT:"#fff";ctx.fill();ctx.strokeStyle=ACCENT;ctx.lineWidth=2;ctx.stroke();ctx.restore();' + R
+ '        }' + R
+ '      }' + R
+ '    }' + R
+ '    // Freehand drawing preview (buffer-space)' + R
+ '    if(isDraw.current&&curPts.length>1){' + R
+ '      ctx.save();ctx.lineCap="round";ctx.lineJoin="round";' + R
+ '      const[bx0,by0]=cb(curPts[0][0],curPts[0][1]);ctx.beginPath();ctx.moveTo(bx0,by0);' + R
+ '      for(let i=1;i<curPts.length;i++){const[bxi,byi]=cb(curPts[i][0],curPts[i][1]);ctx.lineTo(bxi,byi);}' + R
+ '      ctx.strokeStyle="#14b8a6";ctx.lineWidth=2.5;ctx.stroke();' + R
+ '      const[bxL,byL]=cb(curPts[curPts.length-1][0],curPts[curPts.length-1][1]);' + R
+ '      ctx.setLineDash([4,4]);ctx.strokeStyle="#14b8a688";ctx.beginPath();ctx.moveTo(bxL,byL);ctx.lineTo(bx0,by0);ctx.stroke();ctx.setLineDash([]);' + R
+ '      ctx.beginPath();ctx.arc(bx0,by0,6,0,Math.PI*2);ctx.fillStyle="#14b8a6";ctx.fill();ctx.strokeStyle="#fff";ctx.lineWidth=2;ctx.stroke();' + R
+ '      ctx.restore();' + R
+ '    }' + R
+ '    // Magnetic lasso overlay (buffer-space)' + R
+ '    if(editMode==="lasso"&&lassoAnchors.length>0){' + R
+ '      const conBuf=[cb(lassoAnchors[0][0],lassoAnchors[0][1])];' + R
+ '      for(const seg of lassoSegments)for(const pt of seg)conBuf.push(cb(pt[0],pt[1]));' + R
+ '      if(conBuf.length>1){ctx.save();ctx.lineCap="round";ctx.lineJoin="round";ctx.strokeStyle="#000";ctx.lineWidth=4;ctx.beginPath();ctx.moveTo(conBuf[0][0],conBuf[0][1]);for(let i=1;i<conBuf.length;i++)ctx.lineTo(conBuf[i][0],conBuf[i][1]);ctx.stroke();ctx.strokeStyle="#00ffff";ctx.lineWidth=2;ctx.stroke();ctx.restore();}' + R
+ '      if(lassoPreview.length>1){ctx.save();ctx.lineCap="round";ctx.lineJoin="round";ctx.setLineDash([6,4]);const[lp0x,lp0y]=cb(lassoPreview[0][0],lassoPreview[0][1]);ctx.strokeStyle="#000";ctx.lineWidth=3;ctx.beginPath();ctx.moveTo(lp0x,lp0y);for(let i=1;i<lassoPreview.length;i++){const[lpx,lpy]=cb(lassoPreview[i][0],lassoPreview[i][1]);ctx.lineTo(lpx,lpy);}ctx.stroke();ctx.strokeStyle="#00ffff";ctx.lineWidth=1.5;ctx.stroke();ctx.setLineDash([]);ctx.restore();}' + R
+ '      for(let i=0;i<lassoAnchors.length;i++){' + R
+ '        const[abx,aby]=cb(lassoAnchors[i][0],lassoAnchors[i][1]),isFirst=i===0;' + R
+ '        ctx.save();' + R
+ '        if(isFirst){ctx.beginPath();ctx.arc(abx,aby,lassoNearClose?12:9,0,Math.PI*2);ctx.strokeStyle=lassoNearClose?"#22ff44":"#00ffff";ctx.lineWidth=2;ctx.stroke();}' + R
+ '        ctx.beginPath();ctx.arc(abx,aby,6,0,Math.PI*2);ctx.fillStyle=isFirst&&lassoNearClose?"#22ff44":"#00ffff";ctx.fill();ctx.strokeStyle="#000";ctx.lineWidth=1.5;ctx.stroke();ctx.restore();' + R
+ '      }' + R
+ '    }' + R
+ '  },[regions,selId,view,curPts,editMode,dismissed,dragNode,lassoAnchors,lassoSegments,lassoPreview,lassoNearClose,zoom,pan]);';
    code = code.slice(0, startIdx) + newRender + code.slice(endFullIdx);
    console.log('OK: canvas render useEffect'); ok++;
  }
}

// ─── 6. Extend keyboard useEffect to add spacebar pan ────────────────────
rep(
  '  // Keyboard: Ctrl/Cmd+Z in lasso mode removes last anchor',
  '  // Spacebar pan: set/clear isPanningRef, update cursor' + R
+ '  useEffect(()=>{' + R
+ '    if(phase!=="edit")return;' + R
+ '    const kd=e=>{' + R
+ '      if(e.code==="Space"&&!e.target.closest("input,textarea,select")){e.preventDefault();if(!isPanningRef.current){isPanningRef.current=true;if(mainC.current)mainC.current.style.cursor="grab";}}' + R
+ '    };' + R
+ '    const ku=e=>{' + R
+ '      if(e.code==="Space"){isPanningRef.current=false;if(mainC.current)mainC.current.style.cursor="";}' + R
+ '    };' + R
+ '    document.addEventListener("keydown",kd);document.addEventListener("keyup",ku);' + R
+ '    return()=>{document.removeEventListener("keydown",kd);document.removeEventListener("keyup",ku);};' + R
+ '  },[phase]);' + R
+ R
+ '  // Scroll wheel zoom (non-passive, attached imperatively to avoid passive-listener warning)' + R
+ '  useEffect(()=>{' + R
+ '    const el=mainC.current;if(!el||phase!=="edit")return;' + R
+ '    const wh=e=>{' + R
+ '      e.preventDefault();' + R
+ '      const dz=ZOOM_STEP_SCROLL*-Math.sign(e.deltaY);' + R
+ '      const newZ=Math.max(ZOOM_MIN,Math.min(ZOOM_MAX,zoomRef.current+dz));' + R
+ '      const rect=el.getBoundingClientRect();' + R
+ '      const bufX=(e.clientX-rect.left)*(CW/rect.width);' + R
+ '      const bufY=(e.clientY-rect.top)*(CH/rect.height);' + R
+ '      const np={x:bufX-(bufX-panRef.current.x)*(newZ/zoomRef.current),y:bufY-(bufY-panRef.current.y)*(newZ/zoomRef.current)};' + R
+ '      const cz=zoomRef.current;// use current before update to avoid stale' + R
+ '      const cpx=CW*0.5-CW*newZ,cpy=CH*0.5-CH*newZ;' + R
+ '      const clampedNp={x:Math.max(cpx,Math.min(CW*0.5,np.x)),y:Math.max(cpy,Math.min(CH*0.5,np.y))};' + R
+ '      setZoom(newZ);setPan(clampedNp);zoomRef.current=newZ;panRef.current=clampedNp;' + R
+ '    };' + R
+ '    el.addEventListener("wheel",wh,{passive:false});' + R
+ '    return()=>el.removeEventListener("wheel",wh);' + R
+ '  },[phase]);' + R
+ R
+ '  // Keyboard: Ctrl/Cmd+Z in lasso mode removes last anchor',
  'spacebar pan + wheel useEffects'
);

// ─── 7. Update getPos to invert zoom/pan ─────────────────────────────────
rep(
  '    const getPos=e=>{const rect=mainC.current.getBoundingClientRect();const t=e.touches?e.touches[0]:e;return[(t.clientX-rect.left)*(CW/rect.width),(t.clientY-rect.top)*(CH/rect.height)];};',
  '    const getPos=e=>{' + R
+ '      const rect=mainC.current.getBoundingClientRect();' + R
+ '      const t=e.touches?e.touches[0]:e;' + R
+ '      const bufX=(t.clientX-rect.left)*(CW/rect.width);' + R
+ '      const bufY=(t.clientY-rect.top)*(CH/rect.height);' + R
+ '      return[(bufX-panRef.current.x)/zoomRef.current,(bufY-panRef.current.y)/zoomRef.current];' + R
+ '    };',
  'getPos zoom-aware'
);

// ─── 8a. onDown: add middle-mouse/spacebar pan + 2-finger touch before tools
rep(
  '    // Node editing mode' + R
+ '    if(editMode==="editNodes"&&selId){',
  '    // Middle mouse OR spacebar: start pan' + R
+ '    if(e.button===1||(e.button===0&&isPanningRef.current)){' + R
+ '      e.preventDefault();' + R
+ '      panStateRef.current={active:true,startX:e.clientX,startY:e.clientY,startPanX:panRef.current.x,startPanY:panRef.current.y};' + R
+ '      if(mainC.current)mainC.current.style.cursor="grabbing";' + R
+ '      return;' + R
+ '    }' + R
+ '    // Two-finger touch: start pinch/pan tracking' + R
+ '    if(e.touches&&e.touches.length===2){' + R
+ '      e.preventDefault();' + R
+ '      const dx=e.touches[0].clientX-e.touches[1].clientX,dy=e.touches[0].clientY-e.touches[1].clientY;' + R
+ '      const midX=(e.touches[0].clientX+e.touches[1].clientX)/2,midY=(e.touches[0].clientY+e.touches[1].clientY)/2;' + R
+ '      touchRef.current={count:2,lastDist:Math.sqrt(dx*dx+dy*dy),lastMidX:midX,lastMidY:midY};' + R
+ '      return;' + R
+ '    }' + R
+ '    // Node editing mode' + R
+ '    if(editMode==="editNodes"&&selId){',
  'onDown pan/touch init'
);

// ─── 8b. onDown: use zoom-adjusted hit thresholds for node editing
rep(
  '      for(let i=0;i<sr.nodes.length;i++){' + R
+ '        if((mx-sr.nodes[i][0])**2+(my-sr.nodes[i][1])**2<NODE_HIT**2){' + R
+ '          setDragNode({regionId:selId,nodeIdx:i});return;',
  '      const zHit=NODE_HIT/zoomRef.current;' + R
+ '      for(let i=0;i<sr.nodes.length;i++){' + R
+ '        if((mx-sr.nodes[i][0])**2+(my-sr.nodes[i][1])**2<zHit**2){' + R
+ '          setDragNode({regionId:selId,nodeIdx:i});return;',
  'onDown node hit zoom-adjust'
);

rep(
  '        if((mx-midX)**2+(my-midY)**2<NODE_HIT**2){',
  '        if((mx-midX)**2+(my-midY)**2<zHit**2){',
  'onDown midpoint hit zoom-adjust'
);

rep(
  '        const d=distToSeg(mx,my,sr.nodes[i][0],sr.nodes[i][1],sr.nodes[j][0],sr.nodes[j][1]);' + R
+ '        if(d<EDGE_HIT){',
  '        const d=distToSeg(mx,my,sr.nodes[i][0],sr.nodes[i][1],sr.nodes[j][0],sr.nodes[j][1]);' + R
+ '        if(d<EDGE_HIT/zoomRef.current){',
  'onDown edge hit zoom-adjust'
);

// ─── 9. onMove: prepend pan drag + two-finger touch handling ─────────────
rep(
  '  const onMove=useCallback(e=>{' + R
+ '    // Lasso live path preview',
  '  const onMove=useCallback(e=>{' + R
+ '    // Active pan drag (spacebar/middle-mouse)' + R
+ '    if(panStateRef.current.active){' + R
+ '      e.preventDefault();' + R
+ '      const rect=mainC.current.getBoundingClientRect();' + R
+ '      const sc=CW/rect.width;' + R
+ '      const dx=(e.clientX-panStateRef.current.startX)*sc;' + R
+ '      const dy=(e.clientY-panStateRef.current.startY)*sc;' + R
+ '      const rawX=panStateRef.current.startPanX+dx;' + R
+ '      const rawY=panStateRef.current.startPanY+dy;' + R
+ '      const cz=zoomRef.current;' + R
+ '      const np={x:Math.max(CW*0.5-CW*cz,Math.min(CW*0.5,rawX)),y:Math.max(CH*0.5-CH*cz,Math.min(CH*0.5,rawY))};' + R
+ '      setPan(np);panRef.current=np;' + R
+ '      return;' + R
+ '    }' + R
+ '    // Two-finger pinch/pan' + R
+ '    if(e.touches&&e.touches.length===2&&touchRef.current.count===2){' + R
+ '      e.preventDefault();' + R
+ '      const tr=touchRef.current;' + R
+ '      const dx=e.touches[0].clientX-e.touches[1].clientX,dy=e.touches[0].clientY-e.touches[1].clientY;' + R
+ '      const newDist=Math.sqrt(dx*dx+dy*dy);' + R
+ '      const newMidX=(e.touches[0].clientX+e.touches[1].clientX)/2;' + R
+ '      const newMidY=(e.touches[0].clientY+e.touches[1].clientY)/2;' + R
+ '      const rect=mainC.current.getBoundingClientRect();' + R
+ '      const sc=CW/rect.width;' + R
+ '      if(tr.lastDist>0){' + R
+ '        const newZ=Math.max(ZOOM_MIN,Math.min(ZOOM_MAX,zoomRef.current*(newDist/tr.lastDist)));' + R
+ '        const midBufX=(newMidX-rect.left)*sc;' + R
+ '        const midBufY=(newMidY-rect.top)*sc;' + R
+ '        const np0={x:midBufX-(midBufX-panRef.current.x)*(newZ/zoomRef.current),y:midBufY-(midBufY-panRef.current.y)*(newZ/zoomRef.current)};' + R
+ '        const panDx=(newMidX-tr.lastMidX)*sc,panDy=(newMidY-tr.lastMidY)*sc;' + R
+ '        const np={x:Math.max(CW*0.5-CW*newZ,Math.min(CW*0.5,np0.x+panDx)),y:Math.max(CH*0.5-CH*newZ,Math.min(CH*0.5,np0.y+panDy))};' + R
+ '        setZoom(newZ);setPan(np);zoomRef.current=newZ;panRef.current=np;' + R
+ '      }' + R
+ '      touchRef.current={count:2,lastDist:newDist,lastMidX:newMidX,lastMidY:newMidY};' + R
+ '      return;' + R
+ '    }' + R
+ '    // Lasso live path preview',
  'onMove pan/touch'
);

// ─── 10. onUp: end pan drag ──────────────────────────────────────────────
rep(
  '  const onUp=useCallback(e=>{' + R
+ '    if(dragNode){e?.preventDefault();setDragNode(null);return;}' + R
+ '    if(isDraw.current){e?.preventDefault();finishDraw();}' + R
+ '  },[dragNode,finishDraw]);',
  '  const onUp=useCallback(e=>{' + R
+ '    if(panStateRef.current.active){e?.preventDefault();panStateRef.current.active=false;if(mainC.current)mainC.current.style.cursor=isPanningRef.current?"grab":"";return;}' + R
+ '    if(e&&e.touches&&e.touches.length<2)touchRef.current={count:0,lastDist:0,lastMidX:0,lastMidY:0};' + R
+ '    if(dragNode){e?.preventDefault();setDragNode(null);return;}' + R
+ '    if(isDraw.current){e?.preventDefault();finishDraw();}' + R
+ '  },[dragNode,finishDraw]);',
  'onUp pan end'
);

// ─── 11a. JSX: reset zoom/pan on back button ─────────────────────────────
rep(
  'isDraw.current=false;setEditMode("select");setDragNode(null);resetLasso();}}>←</button>',
  'isDraw.current=false;setEditMode("select");setDragNode(null);resetLasso();setZoom(1);setPan({x:0,y:0});zoomRef.current=1;panRef.current={x:0,y:0};}}>←</button>',
  'back btn reset zoom'
);

// ─── 11b. JSX: add zoom toolbar row after main toolbar ──────────────────
rep(
  '        {/* Context hints */}',
  '        {/* Zoom toolbar */}' + R
+ '        <div className="tb-grp" style={{width:"100%",marginBottom:6,gap:2}}>' + R
+ '          <button className="tb-btn" onClick={()=>{const nz=Math.max(ZOOM_MIN,zoom-ZOOM_STEP_BUTTON);const np={x:CW*(1-nz)/2,y:CH*(1-nz)/2};setZoom(nz);setPan(np);zoomRef.current=nz;panRef.current=np;}} style={{width:28,flexShrink:0}}>−</button>' + R
+ '          <span style={{fontSize:11,minWidth:38,textAlign:"center",color:"#64748b",padding:"0 2px"}}>{Math.round(zoom*100)}%</span>' + R
+ '          <button className="tb-btn" onClick={()=>{const nz=Math.min(ZOOM_MAX,zoom+ZOOM_STEP_BUTTON);const np={x:CW*(1-nz)/2,y:CH*(1-nz)/2};setZoom(nz);setPan(np);zoomRef.current=nz;panRef.current=np;}} style={{width:28,flexShrink:0}}>+</button>' + R
+ '          <button className="tb-btn" onClick={doFit} style={{marginLeft:4}}>Fit</button>' + R
+ '        </div>' + R
+ '        {/* Context hints */}',
  'zoom toolbar JSX'
);

// ─── 11c. JSX: canvas onMouseDown suppress middle-click context menu ─────
rep(
  '            onMouseDown={onDown} onMouseMove={onMove} onMouseUp={onUp} onMouseLeave={onUp}',
  '            onMouseDown={onDown} onMouseMove={onMove} onMouseUp={onUp} onMouseLeave={onUp}' + R
+ '            onContextMenu={e=>{if(e.button===1)e.preventDefault();}}',
  'canvas suppress middle click context menu'
);

// ─── 12. onDown deps: add zoom for hit test awareness ───────────────────
rep(
  '  },[editMode,selId,regions,rebuildRegionCurve,runWand,lassoAnchors,lassoSegments,lassoNearClose,finishLasso]);',
  '  },[editMode,selId,regions,rebuildRegionCurve,runWand,lassoAnchors,lassoSegments,lassoNearClose,finishLasso,zoom]);',
  'onDown deps add zoom'
);

// ─── Final section: double-click getPos returns array, fix for zoom ──────
// The dblClick handler uses getPos(e) and destructures as [mx,my] — this still works

console.log('\n=== RESULTS:', ok, 'OK,', fail, 'FAILED ===\n');
if (fail > 0) { console.error('Aborting — not writing file due to failures.'); process.exit(1); }
fs.writeFileSync(path, code, 'utf8');
console.log('File written, size:', code.length);
