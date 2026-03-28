const fs = require('fs');
let code = fs.readFileSync('creator-app.js', 'utf8');

// The drawPattern definition search
const searchDrawPattern = `function drawPattern(ctx,offX,offY,dW,dH,cSz,gut){
  ctx.fillStyle="#fff";ctx.fillRect(0,0,gut+dW*cSz+2,gut+dH*cSz+2);
  ctx.fillStyle="#94a3b8";ctx.font=\`\${Math.max(7,Math.min(11,cSz*0.5))}px system-ui\`;ctx.textAlign="center";ctx.textBaseline="middle";
  for(let x=0;x<dW;x+=10)ctx.fillText(String(offX+x+1),gut+x*cSz+cSz/2,gut/2);ctx.textAlign="right";for(let y=0;y<dH;y+=10)ctx.fillText(String(offY+y+1),gut-3,gut+y*cSz+cSz/2);
  for(let y2=0;y2<dH;y2++)for(let x2=0;x2<dW;x2++){let idx=(offY+y2)*sW+(offX+x2);let m=pat[idx];if(!m)continue;let info=m.id==="__skip__"?null:(cmap?cmap[m.id]:null);let px=gut+x2*cSz,py=gut+y2*cSz;let isHi=!hiId||m.id===hiId;let dim=hiId&&!isHi&&m.id!=="__skip__";
    if(m.id==="__skip__"){drawCk(ctx,px,py,cSz);}
    else if(view==="color"||view==="both"){ctx.fillStyle=dim?\`rgba(\${m.rgb[0]},\${m.rgb[1]},\${m.rgb[2]},0.15)\`:\`rgb(\${m.rgb[0]},\${m.rgb[1]},\${m.rgb[2]})\`;ctx.fillRect(px,py,cSz,cSz);}
    else{ctx.fillStyle=dim?"#f5f5f5":"#fff";ctx.fillRect(px,py,cSz,cSz);}
    if(m.id!=="__skip__"&&(view==="symbol"||view==="both")&&info&&cSz>=6){let lum=luminance(m.rgb);ctx.fillStyle=dim?"rgba(0,0,0,0.08)":(view==="both"?(lum>128?"#000":"#fff"):"#333");ctx.font=\`bold \${Math.max(6,cSz*0.6)}px monospace\`;ctx.textAlign="center";ctx.textBaseline="middle";ctx.fillText(info.symbol,px+cSz/2,py+cSz/2);}
    if(cSz>=4){ctx.strokeStyle=dim?"rgba(0,0,0,0.03)":"rgba(0,0,0,0.08)";ctx.strokeRect(px,py,cSz,cSz);}
  }
  if(cSz>=3){ctx.strokeStyle="rgba(0,0,0,0.2)";ctx.lineWidth=cSz>=8?1.5:1;for(let gx=0;gx<=dW;gx+=10){ctx.beginPath();ctx.moveTo(gut+gx*cSz,gut);ctx.lineTo(gut+gx*cSz,gut+dH*cSz);ctx.stroke();}for(let gy=0;gy<=dH;gy+=10){ctx.beginPath();ctx.moveTo(gut,gut+gy*cSz);ctx.lineTo(gut+dW*cSz,gut+gy*cSz);ctx.stroke();}}
  if(showCtr){ctx.strokeStyle="rgba(200,60,60,0.3)";ctx.lineWidth=1.5;ctx.setLineDash([6,4]);let cx2=Math.floor(sW/2)-offX,cy2=Math.floor(sH/2)-offY;if(cx2>=0&&cx2<=dW){ctx.beginPath();ctx.moveTo(gut+cx2*cSz,gut);ctx.lineTo(gut+cx2*cSz,gut+dH*cSz);ctx.stroke();}if(cy2>=0&&cy2<=dH){ctx.beginPath();ctx.moveTo(gut,gut+cy2*cSz);ctx.lineTo(gut+dW*cSz,gut+cy2*cSz);ctx.stroke();}ctx.setLineDash([]);}
  if(bsLines.length>0){`;

const replaceDrawPattern = `function drawPattern(ctx,offX,offY,dW,dH,cSz,gut, viewportRect=null){
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
          if(x%10===0) ctx.fillText(String(offX+x+1),gut+x*cSz+cSz/2,gut/2);
      }
  }
  if (!viewportRect || viewportRect.left <= gut) {
      ctx.textAlign="right";
      for(let y=startY;y<endY;y+=1){
          if(y%10===0) ctx.fillText(String(offY+y+1),gut-3,gut+y*cSz+cSz/2);
      }
  }

  for(let y2=startY;y2<endY;y2++)for(let x2=startX;x2<endX;x2++){let idx=(offY+y2)*sW+(offX+x2);let m=pat[idx];if(!m)continue;let info=m.id==="__skip__"?null:(cmap?cmap[m.id]:null);let px=gut+x2*cSz,py=gut+y2*cSz;let isHi=!hiId||m.id===hiId;let dim=hiId&&!isHi&&m.id!=="__skip__";
    if(m.id==="__skip__"){drawCk(ctx,px,py,cSz);}
    else if(view==="color"||view==="both"){ctx.fillStyle=dim?\`rgba(\${m.rgb[0]},\${m.rgb[1]},\${m.rgb[2]},0.15)\`:\`rgb(\${m.rgb[0]},\${m.rgb[1]},\${m.rgb[2]})\`;ctx.fillRect(px,py,cSz,cSz);}
    else{ctx.fillStyle=dim?"#f5f5f5":"#fff";ctx.fillRect(px,py,cSz,cSz);}
    if(m.id!=="__skip__"&&(view==="symbol"||view==="both")&&info&&cSz>=6){let lum=luminance(m.rgb);ctx.fillStyle=dim?"rgba(0,0,0,0.08)":(view==="both"?(lum>128?"#000":"#fff"):"#333");ctx.font=\`bold \${Math.max(6,cSz*0.6)}px monospace\`;ctx.textAlign="center";ctx.textBaseline="middle";ctx.fillText(info.symbol,px+cSz/2,py+cSz/2);}
    if(cSz>=4){ctx.strokeStyle=dim?"rgba(0,0,0,0.03)":"rgba(0,0,0,0.08)";ctx.strokeRect(px,py,cSz,cSz);}
  }
  if(cSz>=3){ctx.strokeStyle="rgba(0,0,0,0.2)";ctx.lineWidth=cSz>=8?1.5:1;for(let gx=Math.floor(startX/10)*10;gx<=endX;gx+=10){ctx.beginPath();ctx.moveTo(gut+gx*cSz, Math.max(gut, viewportRect ? viewportRect.top : 0));ctx.lineTo(gut+gx*cSz, Math.min(gut+dH*cSz, viewportRect ? viewportRect.bottom : gut+dH*cSz));ctx.stroke();}for(let gy=Math.floor(startY/10)*10;gy<=endY;gy+=10){ctx.beginPath();ctx.moveTo(Math.max(gut, viewportRect ? viewportRect.left : 0), gut+gy*cSz);ctx.lineTo(Math.min(gut+dW*cSz, viewportRect ? viewportRect.right : gut+dW*cSz), gut+gy*cSz);ctx.stroke();}}
  if(showCtr){ctx.strokeStyle="rgba(200,60,60,0.3)";ctx.lineWidth=1.5;ctx.setLineDash([6,4]);let cx2=Math.floor(sW/2)-offX,cy2=Math.floor(sH/2)-offY;if(cx2>=startX&&cx2<=endX){ctx.beginPath();ctx.moveTo(gut+cx2*cSz, Math.max(gut, viewportRect ? viewportRect.top : 0));ctx.lineTo(gut+cx2*cSz, Math.min(gut+dH*cSz, viewportRect ? viewportRect.bottom : gut+dH*cSz));ctx.stroke();}if(cy2>=startY&&cy2<=endY){ctx.beginPath();ctx.moveTo(Math.max(gut, viewportRect ? viewportRect.left : 0), gut+cy2*cSz);ctx.lineTo(Math.min(gut+dW*cSz, viewportRect ? viewportRect.right : gut+dW*cSz), gut+cy2*cSz);ctx.stroke();}ctx.setLineDash([]);}
  if(bsLines.length>0){`;

code = code.replace(searchDrawPattern, replaceDrawPattern);

const searchRenderPattern = `const renderPattern=useCallback(()=>{if(!pat||!cmap||!pcRef.current||tab!=="pattern")return;pcRef.current.width=sW*cs+G+2;pcRef.current.height=sH*cs+G+2;drawPattern(pcRef.current.getContext("2d"),0,0,sW,sH,cs,G);},[pat,cmap,cs,sW,sH,view,hiId,showCtr,bsLines,bsStart,activeTool,tab,hoverCoords,selectedColorId]);`;
const replaceRenderPattern = `const renderPattern=useCallback(()=>{if(!pat||!cmap||!pcRef.current||tab!=="pattern")return;
  let canvas = pcRef.current;
  if (canvas.width !== sW*cs+G+2 || canvas.height !== sH*cs+G+2) {
    canvas.width=sW*cs+G+2;canvas.height=sH*cs+G+2;
  }
  let viewportRect = null;
  if (scrollRef.current) {
    viewportRect = {
      left: scrollRef.current.scrollLeft,
      top: scrollRef.current.scrollTop,
      width: scrollRef.current.clientWidth,
      height: scrollRef.current.clientHeight,
      right: scrollRef.current.scrollLeft + scrollRef.current.clientWidth,
      bottom: scrollRef.current.scrollTop + scrollRef.current.clientHeight
    };
  }
  drawPattern(canvas.getContext("2d"),0,0,sW,sH,cs,G, viewportRect);
},[pat,cmap,cs,sW,sH,view,hiId,showCtr,bsLines,bsStart,activeTool,tab,hoverCoords,selectedColorId]);`;

code = code.replace(searchRenderPattern, replaceRenderPattern);

const searchScroll = `<div ref={scrollRef} style={{overflow:"auto",maxHeight:550,border:"1px solid #e2e5ea",borderRadius:8,background:"#f0f2f5",cursor:activeTool?"crosshair":"default"}}><canvas ref={pcRef} style={{display:"block"}} onClick={handlePatClick} onMouseMove={handlePatMouseMove} onMouseLeave={handlePatMouseLeave}/></div>`;
const replaceScroll = `<div ref={scrollRef} onScroll={() => requestAnimationFrame(renderPattern)} style={{overflow:"auto",maxHeight:550,border:"1px solid #e2e5ea",borderRadius:8,background:"#f0f2f5",cursor:activeTool?"crosshair":"default"}}><canvas ref={pcRef} style={{display:"block"}} onClick={handlePatClick} onMouseMove={handlePatMouseMove} onMouseLeave={handlePatMouseLeave}/></div>`;

code = code.replace(searchScroll, replaceScroll);

fs.writeFileSync('creator-app.js', code, 'utf8');
console.log('Replaced creator-app.js');
