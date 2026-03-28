const fs = require('fs');
let code = fs.readFileSync('tracker-app.js', 'utf8');

const searchDrawStitch = `function drawStitch(ctx,cSz){
  let gut=G,dW=sW,dH=sH;
  ctx.fillStyle="#fff";ctx.fillRect(0,0,gut+dW*cSz+2,gut+dH*cSz+2);
  ctx.fillStyle="#94a3b8";ctx.font=\`\${Math.max(7,Math.min(11,cSz*0.5))}px system-ui\`;ctx.textAlign="center";ctx.textBaseline="middle";
  for(let x=0;x<dW;x+=10)ctx.fillText(String(x+1),gut+x*cSz+cSz/2,gut/2);ctx.textAlign="right";for(let y=0;y<dH;y+=10)ctx.fillText(String(y+1),gut-3,gut+y*cSz+cSz/2);
  for(let y=0;y<dH;y++)for(let x=0;x<dW;x++){
    let idx=y*sW+x,m=pat[idx];if(!m)continue;
    let info=m.id==="__skip__"?null:(cmap?cmap[m.id]:null);
    let px=gut+x*cSz,py=gut+y*cSz;
    let isDn=done&&done[idx];
    let dimmed=stitchView==="highlight"&&focusColour&&m.id!==focusColour&&m.id!=="__skip__";
    if(m.id==="__skip__"){drawCk(ctx,px,py,cSz);if(cSz>=4){ctx.strokeStyle="rgba(0,0,0,0.06)";ctx.strokeRect(px,py,cSz,cSz);}continue;}
    if(stitchView==="symbol"){
      if(isDn){ctx.fillStyle="#d1fae5";ctx.fillRect(px,py,cSz,cSz);}
      else{ctx.fillStyle="#fff";ctx.fillRect(px,py,cSz,cSz);if(info&&cSz>=6){ctx.fillStyle="#1e293b";ctx.font=\`bold \${Math.max(7,cSz*0.65)}px monospace\`;ctx.textAlign="center";ctx.textBaseline="middle";ctx.fillText(info.symbol,px+cSz/2,py+cSz/2);}}
    }else if(stitchView==="colour"){
      ctx.fillStyle=\`rgb(\${m.rgb[0]},\${m.rgb[1]},\${m.rgb[2]})\`;ctx.fillRect(px,py,cSz,cSz);
      if(!isDn&&info&&cSz>=6){ctx.fillStyle=luminance(m.rgb)>140?"rgba(0,0,0,0.8)":"rgba(255,255,255,0.95)";ctx.font=\`bold \${Math.max(7,cSz*0.6)}px monospace\`;ctx.textAlign="center";ctx.textBaseline="middle";ctx.fillText(info.symbol,px+cSz/2,py+cSz/2);}
    }else{
      if(isDn){ctx.fillStyle=dimmed?"#f1f5f9":\`rgb(\${m.rgb[0]},\${m.rgb[1]},\${m.rgb[2]})\`;ctx.fillRect(px,py,cSz,cSz);}
      else if(dimmed){ctx.fillStyle="#f1f5f9";ctx.fillRect(px,py,cSz,cSz);if(info&&cSz>=8){ctx.fillStyle="rgba(0,0,0,0.06)";ctx.font=\`\${Math.max(6,cSz*0.45)}px monospace\`;ctx.textAlign="center";ctx.textBaseline="middle";ctx.fillText(info.symbol,px+cSz/2,py+cSz/2);}}
      else{ctx.fillStyle=\`rgb(\${m.rgb[0]},\${m.rgb[1]},\${m.rgb[2]})\`;ctx.fillRect(px,py,cSz,cSz);if(info&&cSz>=6){ctx.fillStyle=luminance(m.rgb)>140?"rgba(0,0,0,0.75)":"rgba(255,255,255,0.85)";ctx.font=\`bold \${Math.max(7,cSz*0.6)}px monospace\`;ctx.textAlign="center";ctx.textBaseline="middle";ctx.fillText(info.symbol,px+cSz/2,py+cSz/2);}}
    }
    if(cSz>=4){ctx.strokeStyle="rgba(0,0,0,0.08)";ctx.strokeRect(px,py,cSz,cSz);}
  }
  if(cSz>=3){ctx.strokeStyle="rgba(0,0,0,0.2)";ctx.lineWidth=cSz>=8?1.5:1;for(let gx=0;gx<=dW;gx+=10){ctx.beginPath();ctx.moveTo(gut+gx*cSz,gut);ctx.lineTo(gut+gx*cSz,gut+dH*cSz);ctx.stroke();}for(let gy=0;gy<=dH;gy+=10){ctx.beginPath();ctx.moveTo(gut,gut+gy*cSz);ctx.lineTo(gut+dW*cSz,gut+gy*cSz);ctx.stroke();}}
  if(showCtr){ctx.strokeStyle="rgba(200,60,60,0.4)";ctx.lineWidth=1.5;ctx.setLineDash([6,4]);let cx2=Math.floor(sW/2),cy2=Math.floor(sH/2);ctx.beginPath();ctx.moveTo(gut+cx2*cSz,gut);ctx.lineTo(gut+cx2*cSz,gut+dH*cSz);ctx.stroke();ctx.beginPath();ctx.moveTo(gut,gut+cy2*cSz);ctx.lineTo(gut+dW*cSz,gut+cy2*cSz);ctx.stroke();ctx.setLineDash([]);}`;

const replaceDrawStitch = `function drawStitch(ctx,cSz,viewportRect=null){
  let gut=G,dW=sW,dH=sH;
  let startX = 0, startY = 0, endX = dW, endY = dH;
  if (viewportRect) {
    startX = Math.max(0, Math.floor((viewportRect.left - gut) / cSz) - 1);
    startY = Math.max(0, Math.floor((viewportRect.top - gut) / cSz) - 1);
    endX = Math.min(dW, Math.ceil((viewportRect.right - gut) / cSz) + 1);
    endY = Math.min(dH, Math.ceil((viewportRect.bottom - gut) / cSz) + 1);
    ctx.clearRect(Math.max(0, viewportRect.left), Math.max(0, viewportRect.top), viewportRect.width, viewportRect.height);
    ctx.fillStyle="#fff";ctx.fillRect(Math.max(0, viewportRect.left), Math.max(0, viewportRect.top), viewportRect.width, viewportRect.height);
  } else {
    ctx.fillStyle="#fff";ctx.fillRect(0,0,gut+dW*cSz+2,gut+dH*cSz+2);
  }

  ctx.fillStyle="#94a3b8";ctx.font=\`\${Math.max(7,Math.min(11,cSz*0.5))}px system-ui\`;ctx.textAlign="center";ctx.textBaseline="middle";

  if (!viewportRect || viewportRect.top <= gut) {
      for(let x=startX;x<endX;x+=1){
          if(x%10===0) ctx.fillText(String(x+1),gut+x*cSz+cSz/2,gut/2);
      }
  }
  if (!viewportRect || viewportRect.left <= gut) {
      ctx.textAlign="right";
      for(let y=startY;y<endY;y+=1){
          if(y%10===0) ctx.fillText(String(y+1),gut-3,gut+y*cSz+cSz/2);
      }
  }

  for(let y=startY;y<endY;y++)for(let x=startX;x<endX;x++){
    let idx=y*sW+x,m=pat[idx];if(!m)continue;
    let info=m.id==="__skip__"?null:(cmap?cmap[m.id]:null);
    let px=gut+x*cSz,py=gut+y*cSz;
    let isDn=done&&done[idx];
    let dimmed=stitchView==="highlight"&&focusColour&&m.id!==focusColour&&m.id!=="__skip__";
    if(m.id==="__skip__"){drawCk(ctx,px,py,cSz);if(cSz>=4){ctx.strokeStyle="rgba(0,0,0,0.06)";ctx.strokeRect(px,py,cSz,cSz);}continue;}
    if(stitchView==="symbol"){
      if(isDn){ctx.fillStyle="#d1fae5";ctx.fillRect(px,py,cSz,cSz);}
      else{ctx.fillStyle="#fff";ctx.fillRect(px,py,cSz,cSz);if(info&&cSz>=6){ctx.fillStyle="#1e293b";ctx.font=\`bold \${Math.max(7,cSz*0.65)}px monospace\`;ctx.textAlign="center";ctx.textBaseline="middle";ctx.fillText(info.symbol,px+cSz/2,py+cSz/2);}}
    }else if(stitchView==="colour"){
      ctx.fillStyle=\`rgb(\${m.rgb[0]},\${m.rgb[1]},\${m.rgb[2]})\`;ctx.fillRect(px,py,cSz,cSz);
      if(!isDn&&info&&cSz>=6){ctx.fillStyle=luminance(m.rgb)>140?"rgba(0,0,0,0.8)":"rgba(255,255,255,0.95)";ctx.font=\`bold \${Math.max(7,cSz*0.6)}px monospace\`;ctx.textAlign="center";ctx.textBaseline="middle";ctx.fillText(info.symbol,px+cSz/2,py+cSz/2);}
    }else{
      if(isDn){ctx.fillStyle=dimmed?"#f1f5f9":\`rgb(\${m.rgb[0]},\${m.rgb[1]},\${m.rgb[2]})\`;ctx.fillRect(px,py,cSz,cSz);}
      else if(dimmed){ctx.fillStyle="#f1f5f9";ctx.fillRect(px,py,cSz,cSz);if(info&&cSz>=8){ctx.fillStyle="rgba(0,0,0,0.06)";ctx.font=\`\${Math.max(6,cSz*0.45)}px monospace\`;ctx.textAlign="center";ctx.textBaseline="middle";ctx.fillText(info.symbol,px+cSz/2,py+cSz/2);}}
      else{ctx.fillStyle=\`rgb(\${m.rgb[0]},\${m.rgb[1]},\${m.rgb[2]})\`;ctx.fillRect(px,py,cSz,cSz);if(info&&cSz>=6){ctx.fillStyle=luminance(m.rgb)>140?"rgba(0,0,0,0.75)":"rgba(255,255,255,0.85)";ctx.font=\`bold \${Math.max(7,cSz*0.6)}px monospace\`;ctx.textAlign="center";ctx.textBaseline="middle";ctx.fillText(info.symbol,px+cSz/2,py+cSz/2);}}
    }
    if(cSz>=4){ctx.strokeStyle="rgba(0,0,0,0.08)";ctx.strokeRect(px,py,cSz,cSz);}
  }
  if(cSz>=3){ctx.strokeStyle="rgba(0,0,0,0.2)";ctx.lineWidth=cSz>=8?1.5:1;for(let gx=Math.floor(startX/10)*10;gx<=endX;gx+=10){ctx.beginPath();ctx.moveTo(gut+gx*cSz, Math.max(gut, viewportRect ? viewportRect.top : 0));ctx.lineTo(gut+gx*cSz, Math.min(gut+dH*cSz, viewportRect ? viewportRect.bottom : gut+dH*cSz));ctx.stroke();}for(let gy=Math.floor(startY/10)*10;gy<=endY;gy+=10){ctx.beginPath();ctx.moveTo(Math.max(gut, viewportRect ? viewportRect.left : 0), gut+gy*cSz);ctx.lineTo(Math.min(gut+dW*cSz, viewportRect ? viewportRect.right : gut+dW*cSz), gut+gy*cSz);ctx.stroke();}}
  if(showCtr){ctx.strokeStyle="rgba(200,60,60,0.4)";ctx.lineWidth=1.5;ctx.setLineDash([6,4]);let cx2=Math.floor(sW/2),cy2=Math.floor(sH/2);
    if(cx2>=startX&&cx2<=endX){ctx.beginPath();ctx.moveTo(gut+cx2*cSz, Math.max(gut, viewportRect ? viewportRect.top : 0));ctx.lineTo(gut+cx2*cSz, Math.min(gut+dH*cSz, viewportRect ? viewportRect.bottom : gut+dH*cSz));ctx.stroke();}
    if(cy2>=startY&&cy2<=endY){ctx.beginPath();ctx.moveTo(Math.max(gut, viewportRect ? viewportRect.left : 0), gut+cy2*cSz);ctx.lineTo(Math.min(gut+dW*cSz, viewportRect ? viewportRect.right : gut+dW*cSz), gut+cy2*cSz);ctx.stroke();}
    ctx.setLineDash([]);}`;

code = code.replace(searchDrawStitch, replaceDrawStitch);

const searchRenderStitch = `const renderStitch=useCallback(()=>{if(!pat||!cmap||!stitchRef.current)return;stitchRef.current.width=sW*scs+G+2;stitchRef.current.height=sH*scs+G+2;drawStitch(stitchRef.current.getContext("2d"),scs);},[pat,cmap,scs,sW,sH,showCtr,bsLines,done,parkMarkers,hlRow,hlCol,stitchView,focusColour]);`;
const replaceRenderStitch = `const renderStitch=useCallback(()=>{if(!pat||!cmap||!stitchRef.current)return;
  let canvas = stitchRef.current;
  if (canvas.width !== sW*scs+G+2 || canvas.height !== sH*scs+G+2) {
    canvas.width=sW*scs+G+2;canvas.height=sH*scs+G+2;
  }
  let viewportRect = null;
  if (stitchScrollRef.current) {
    viewportRect = {
      left: stitchScrollRef.current.scrollLeft,
      top: stitchScrollRef.current.scrollTop,
      width: stitchScrollRef.current.clientWidth,
      height: stitchScrollRef.current.clientHeight,
      right: stitchScrollRef.current.scrollLeft + stitchScrollRef.current.clientWidth,
      bottom: stitchScrollRef.current.scrollTop + stitchScrollRef.current.clientHeight
    };
  }
  drawStitch(canvas.getContext("2d"),scs,viewportRect);
},[pat,cmap,scs,sW,sH,showCtr,bsLines,done,parkMarkers,hlRow,hlCol,stitchView,focusColour]);`;

code = code.replace(searchRenderStitch, replaceRenderStitch);

const searchStitchScroll = `<div ref={stitchScrollRef} style={{overflow:"auto",maxHeight:drawer?340:600,border:"1px solid #e2e5ea",borderRadius:"8px 8px 0 0",background:"#f0f2f5",cursor:isPanning?"grabbing":stitchMode==="track"?"crosshair":"default",transition:"max-height 0.3s"}} onMouseUp={handleMouseUp} onMouseLeave={handleStitchMouseLeave}><canvas ref={stitchRef} style={{display:"block"}} onMouseDown={handleStitchMouseDown} onMouseMove={handleStitchMouseMove} onContextMenu={e=>e.preventDefault()}/></div>`;
const replaceStitchScroll = `<div ref={stitchScrollRef} onScroll={() => requestAnimationFrame(renderStitch)} style={{overflow:"auto",maxHeight:drawer?340:600,border:"1px solid #e2e5ea",borderRadius:"8px 8px 0 0",background:"#f0f2f5",cursor:isPanning?"grabbing":stitchMode==="track"?"crosshair":"default",transition:"max-height 0.3s"}} onMouseUp={handleMouseUp} onMouseLeave={handleStitchMouseLeave}><canvas ref={stitchRef} style={{display:"block"}} onMouseDown={handleStitchMouseDown} onMouseMove={handleStitchMouseMove} onContextMenu={e=>e.preventDefault()}/></div>`;

code = code.replace(searchStitchScroll, replaceStitchScroll);

fs.writeFileSync('tracker-app.js', code, 'utf8');
console.log('Replaced tracker-app.js');
