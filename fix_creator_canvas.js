const fs = require('fs');

function fixDrawPattern(content) {
  const searchFor = `  for(let y2=startY;y2<endY;y2++)for(let x2=startX;x2<endX;x2++){let idx=(offY+y2)*sW+(offX+x2);let m=pat[idx];if(!m)continue;let info=m.id==="__skip__"?null:(cmap?cmap[m.id]:null);let px=gut+x2*cSz,py=gut+y2*cSz;let isHi=!hiId||m.id===hiId;let dim=hiId&&!isHi&&m.id!=="__skip__";
    if(m.id==="__skip__"){
      if(showOverlayImg){
        ctx.globalAlpha=0.2;drawCk(ctx,px,py,cSz);ctx.globalAlpha=1.0;
      }else{
        drawCk(ctx,px,py,cSz);
      }
    }
    else if(view==="color"||view==="both"){
      let alpha = 1.0;
      if (dim) alpha = 0.15;
      else if (showOverlayImg) {
        alpha = view === "both" ? 0.4 : 0.5;
      }
      ctx.fillStyle=\`rgba(\${m.rgb[0]},\${m.rgb[1]},\${m.rgb[2]},\${alpha})\`;ctx.fillRect(px,py,cSz,cSz);
    }
    else{
      let alpha = 1.0;
      if (showOverlayImg) alpha = 0.3;
      ctx.fillStyle=dim?"rgba(245,245,245,"+alpha+")":\`rgba(255,255,255,\${alpha})\`;ctx.fillRect(px,py,cSz,cSz);
    }
    if(m.id!=="__skip__"&&(view==="symbol"||view==="both")&&info&&cSz>=6){let lum=luminance(m.rgb);ctx.fillStyle=dim?"rgba(0,0,0,0.08)":(view==="both"?(lum>128?"#000":"#fff"):"#333");ctx.font=\`bold \${Math.max(6,cSz*0.6)}px monospace\`;ctx.textAlign="center";ctx.textBaseline="middle";ctx.fillText(info.symbol,px+cSz/2,py+cSz/2);}
    if(cSz>=4){
      let sAlpha = dim ? 0.03 : 0.08;
      if (showOverlayImg) sAlpha = dim ? 0.01 : 0.04;
      ctx.strokeStyle=\`rgba(0,0,0,\${sAlpha})\`;ctx.strokeRect(px,py,cSz,cSz);
    }
  }`;

  const replaceWith = `  for(let y2=startY;y2<endY;y2++)for(let x2=startX;x2<endX;x2++){let idx=(offY+y2)*sW+(offX+x2);let m=pat[idx];if(!m)continue;let px=gut+x2*cSz,py=gut+y2*cSz;let isHi=!hiId||m.id===hiId;let dim=hiId&&!isHi&&m.id!=="__skip__";
    if(m.id==="__skip__"){
      if(showOverlayImg){
        ctx.globalAlpha=0.2;drawCk(ctx,px,py,cSz);ctx.globalAlpha=1.0;
      }else{
        drawCk(ctx,px,py,cSz);
      }
    } else {
      const cx = px + cSz/2;
      const cy = py + cSz/2;

      const drawSubStitch = (stitchObj, isSecondary) => {
        let sType = stitchObj.stitchType || "full";
        let info = cmap ? cmap[stitchObj.id] : null;
        if (!info) return;

        let alpha = 1.0;
        if (dim) alpha = 0.15;
        else if (showOverlayImg) alpha = view === "both" ? 0.4 : (view === "symbol" ? 0.3 : 0.5);

        const fillBg = () => {
          if(sType === "full"){
            ctx.fillRect(px,py,cSz,cSz);
          } else {
            ctx.globalAlpha = 0.35 * alpha;
            if (sType.startsWith("half_")) {
              ctx.fillRect(px,py,cSz,cSz);
            } else if (sType.startsWith("quarter_") || sType.startsWith("three_quarter_")) {
              if(sType.endsWith("_tl")) ctx.fillRect(px, py, cSz/2, cSz/2);
              if(sType.endsWith("_tr")) ctx.fillRect(cx, py, cSz/2, cSz/2);
              if(sType.endsWith("_bl")) ctx.fillRect(px, cy, cSz/2, cSz/2);
              if(sType.endsWith("_br")) ctx.fillRect(cx, cy, cSz/2, cSz/2);
              if(sType.startsWith("three_quarter_")){
                if(sType.endsWith("_tl")) { ctx.fillRect(cx,py,cSz/2,cSz); ctx.fillRect(px,cy,cSz/2,cSz/2); }
                if(sType.endsWith("_tr")) { ctx.fillRect(px,py,cSz/2,cSz); ctx.fillRect(cx,cy,cSz/2,cSz/2); }
                if(sType.endsWith("_bl")) { ctx.fillRect(px,py,cSz,cSz/2); ctx.fillRect(cx,cy,cSz/2,cSz/2); }
                if(sType.endsWith("_br")) { ctx.fillRect(px,py,cSz,cSz/2); ctx.fillRect(px,cy,cSz/2,cSz/2); }
              }
            }
            ctx.globalAlpha = alpha;
          }
        };

        const drawLines = () => {
          if (sType === "full") return;
          ctx.lineWidth = Math.max(1, cSz * 0.15);
          ctx.lineCap = "round";
          ctx.beginPath();
          if(sType === "half_bl") { ctx.moveTo(px, py+cSz); ctx.lineTo(px+cSz, py); }
          else if(sType === "half_br") { ctx.moveTo(px+cSz, py+cSz); ctx.lineTo(px, py); }
          else if(sType === "quarter_tl") { ctx.moveTo(px, py); ctx.lineTo(cx, cy); }
          else if(sType === "quarter_tr") { ctx.moveTo(px+cSz, py); ctx.lineTo(cx, cy); }
          else if(sType === "quarter_bl") { ctx.moveTo(px, py+cSz); ctx.lineTo(cx, cy); }
          else if(sType === "quarter_br") { ctx.moveTo(px+cSz, py+cSz); ctx.lineTo(cx, cy); }
          else if(sType === "three_quarter_tl") { ctx.moveTo(px, py+cSz); ctx.lineTo(px+cSz, py); ctx.moveTo(px, py); ctx.lineTo(cx, cy); }
          else if(sType === "three_quarter_tr") { ctx.moveTo(px+cSz, py+cSz); ctx.lineTo(px, py); ctx.moveTo(px+cSz, py); ctx.lineTo(cx, cy); }
          else if(sType === "three_quarter_bl") { ctx.moveTo(px+cSz, py+cSz); ctx.lineTo(px, py); ctx.moveTo(px, py+cSz); ctx.lineTo(cx, cy); }
          else if(sType === "three_quarter_br") { ctx.moveTo(px, py+cSz); ctx.lineTo(px+cSz, py); ctx.moveTo(px+cSz, py+cSz); ctx.lineTo(cx, cy); }
          ctx.stroke();
        };

        const drawSymText = () => {
          let symX = cx;
          let symY = cy;
          let fs = Math.max(6, cSz * 0.6);
          let drawSym = cSz >= 6;

          if(sType !== "full"){
            if(sType.startsWith("quarter_") || isSecondary){
              drawSym = cSz >= 10;
              fs = Math.max(5, cSz * 0.4);
              if(sType.endsWith("_tl")) { symX = px + cSz*0.25; symY = py + cSz*0.25; }
              else if(sType.endsWith("_tr")) { symX = px + cSz*0.75; symY = py + cSz*0.25; }
              else if(sType.endsWith("_bl")) { symX = px + cSz*0.25; symY = py + cSz*0.75; }
              else if(sType.endsWith("_br")) { symX = px + cSz*0.75; symY = py + cSz*0.75; }
            } else if(sType.startsWith("three_quarter_")) {
              if(sType.endsWith("_tl")) { symX = px + cSz*0.65; symY = py + cSz*0.65; }
              else if(sType.endsWith("_tr")) { symX = px + cSz*0.35; symY = py + cSz*0.65; }
              else if(sType.endsWith("_bl")) { symX = px + cSz*0.65; symY = py + cSz*0.35; }
              else if(sType.endsWith("_br")) { symX = px + cSz*0.35; symY = py + cSz*0.35; }
            }
          }

          if(drawSym){
            ctx.font = \`bold \${fs}px monospace\`;
            ctx.textAlign="center";
            ctx.textBaseline="middle";
            ctx.fillText(info.symbol, symX, symY);
          }
        };

        if(view==="color"||view==="both"){
          ctx.fillStyle=\`rgba(\${stitchObj.rgb[0]},\${stitchObj.rgb[1]},\${stitchObj.rgb[2]},\${alpha})\`;
          fillBg();
          ctx.strokeStyle=\`rgba(\${stitchObj.rgb[0]},\${stitchObj.rgb[1]},\${stitchObj.rgb[2]},\${alpha})\`;
          drawLines();
        } else {
          ctx.fillStyle = dim ? \`rgba(245,245,245,\${alpha})\` : \`rgba(255,255,255,\${alpha})\`;
          fillBg();
          // Draw faint lines in symbol view for fractionals to distinguish shapes
          if(sType !== "full" && !dim) {
            ctx.strokeStyle = \`rgba(0,0,0,0.1)\`;
            drawLines();
          }
        }

        if((view==="symbol"||view==="both")){
          let lum=luminance(stitchObj.rgb);
          ctx.fillStyle=dim?"rgba(0,0,0,0.08)":(view==="both"?(lum>128?"#000":"#fff"):"#333");
          drawSymText();
        }
      };

      drawSubStitch(m, false);
      if(m.secondary) drawSubStitch(m.secondary, true);
    }

    if(cSz>=4){
      let sAlpha = dim ? 0.03 : 0.08;
      if (showOverlayImg) sAlpha = dim ? 0.01 : 0.04;
      ctx.strokeStyle=\`rgba(0,0,0,\${sAlpha})\`;
      ctx.strokeRect(px,py,cSz,cSz);
    }
  }`;

  return content.replace(searchFor, replaceWith);
}

let creator = fs.readFileSync('creator-app.js', 'utf8');
creator = fixDrawPattern(creator);
fs.writeFileSync('creator-app.js', creator);

let index = fs.readFileSync('index.html', 'utf8');
index = fixDrawPattern(index);
fs.writeFileSync('index.html', index);

console.log("Updated drawPattern properly");
