const fs = require('fs');

function fixPreview(content) {
  const searchFor = `  // Calculate preview statistics
  let stitchable=0;
  let skipped=0;
  let colorCounts={};
  for(let i=0;i<mapped.length;i++){
    let m=mapped[i];
    if(m.id==="__skip__"){
      skipped++;
    }else{
      stitchable++;
      colorCounts[m.id]=(colorCounts[m.id]||0)+1;
    }
  }

  setPreviewUrl(c.toDataURL());
  setTotalStitchable(stitchable);
  setPaletteSize(Object.keys(colorCounts).length);

  // Actually render to canvas
  cx.fillStyle="#fff";cx.fillRect(0,0,pw,ph);
  let idt=cx.createImageData(pw,ph),d2=idt.data;
  for(let i=0;i<mapped.length;i++){
    let m=mapped[i];if(m.id!=="__skip__"){d2[i*4]=m.rgb[0];d2[i*4+1]=m.rgb[1];d2[i*4+2]=m.rgb[2];d2[i*4+3]=255;}else{d2[i*4]=255;d2[i*4+1]=255;d2[i*4+2]=255;d2[i*4+3]=255;}
  }
  cx.putImageData(idt,0,0);
  setPreviewUrl(c.toDataURL());`;

  const replaceWith = `  // Calculate preview statistics
  let stitchable=0;
  let skipped=0;
  let colorCounts={};
  for(let i=0;i<mapped.length;i++){
    let m=mapped[i];
    if(m.id==="__skip__"){
      skipped++;
    }else{
      stitchable++;
      colorCounts[m.id]=(colorCounts[m.id]||0)+1;
    }
  }

  setTotalStitchable(stitchable);
  setPaletteSize(Object.keys(colorCounts).length);

  // Actually render to canvas
  cx.fillStyle="#fff";cx.fillRect(0,0,pw,ph);
  for(let y=0;y<ph;y++){
    for(let x=0;x<pw;x++){
      let i=y*pw+x,m=mapped[i];
      if(m.id!=="__skip__"){
        let sType = m.stitchType || "full";
        cx.fillStyle=\`rgb(\${m.rgb[0]},\${m.rgb[1]},\${m.rgb[2]})\`;

        if (sType === "full") {
           cx.fillRect(x,y,1,1);
        } else {
           cx.globalAlpha = 0.35;
           cx.fillRect(x,y,1,1);
           cx.globalAlpha = 1.0;

           if (sType.startsWith("quarter_") || sType.startsWith("three_quarter_")) {
              if(sType.endsWith("_tl")) cx.fillRect(x, y, 0.5, 0.5);
              if(sType.endsWith("_tr")) cx.fillRect(x+0.5, y, 0.5, 0.5);
              if(sType.endsWith("_bl")) cx.fillRect(x, y+0.5, 0.5, 0.5);
              if(sType.endsWith("_br")) cx.fillRect(x+0.5, y+0.5, 0.5, 0.5);
           }

           if(sType.startsWith("three_quarter_")){
              if(sType.endsWith("_tl")) { cx.fillRect(x+0.5,y,0.5,1); cx.fillRect(x,y+0.5,0.5,0.5); }
              if(sType.endsWith("_tr")) { cx.fillRect(x,y,0.5,1); cx.fillRect(x+0.5,y+0.5,0.5,0.5); }
              if(sType.endsWith("_bl")) { cx.fillRect(x,y,1,0.5); cx.fillRect(x+0.5,y+0.5,0.5,0.5); }
              if(sType.endsWith("_br")) { cx.fillRect(x,y,1,0.5); cx.fillRect(x,y+0.5,0.5,0.5); }
           }

           ctx.lineWidth = 0.5;
           ctx.strokeStyle = \`rgb(\${m.rgb[0]},\${m.rgb[1]},\${m.rgb[2]})\`;
           ctx.beginPath();
           if(sType === "half_bl") { ctx.moveTo(x, y+1); ctx.lineTo(x+1, y); }
           else if(sType === "half_br") { ctx.moveTo(x+1, y+1); ctx.lineTo(x, y); }
           else if(sType === "quarter_tl") { ctx.moveTo(x, y); ctx.lineTo(x+0.5, y+0.5); }
           else if(sType === "quarter_tr") { ctx.moveTo(x+1, y); ctx.lineTo(x+0.5, y+0.5); }
           else if(sType === "quarter_bl") { ctx.moveTo(x, y+1); ctx.lineTo(x+0.5, y+0.5); }
           else if(sType === "quarter_br") { ctx.moveTo(x+1, y+1); ctx.lineTo(x+0.5, y+0.5); }
           else if(sType === "three_quarter_tl") { ctx.moveTo(x, y+1); ctx.lineTo(x+1, y); ctx.moveTo(x, y); ctx.lineTo(x+0.5, y+0.5); }
           else if(sType === "three_quarter_tr") { ctx.moveTo(x+1, y+1); ctx.lineTo(x, y); ctx.moveTo(x+1, y); ctx.lineTo(x+0.5, y+0.5); }
           else if(sType === "three_quarter_bl") { ctx.moveTo(x+1, y+1); ctx.lineTo(x, y); ctx.moveTo(x, y+1); ctx.lineTo(x+0.5, y+0.5); }
           else if(sType === "three_quarter_br") { ctx.moveTo(x, y+1); ctx.lineTo(x+1, y); ctx.moveTo(x+1, y+1); ctx.lineTo(x+0.5, y+0.5); }
           ctx.stroke();
        }

        if (m.secondary) {
            cx.fillStyle=\`rgb(\${m.secondary.rgb[0]},\${m.secondary.rgb[1]},\${m.secondary.rgb[2]})\`;
            let secType = m.secondary.stitchType;
            if(secType.endsWith("_tl")) cx.fillRect(x, y, 0.5, 0.5);
            if(secType.endsWith("_tr")) cx.fillRect(x+0.5, y, 0.5, 0.5);
            if(secType.endsWith("_bl")) cx.fillRect(x, y+0.5, 0.5, 0.5);
            if(secType.endsWith("_br")) cx.fillRect(x+0.5, y+0.5, 0.5, 0.5);
        }
      }
    }
  }
  setPreviewUrl(c.toDataURL());`;

  return content.replace(searchFor, replaceWith);
}

let creator = fs.readFileSync('creator-app.js', 'utf8');
creator = fixPreview(creator);
fs.writeFileSync('creator-app.js', creator);

let index = fs.readFileSync('index.html', 'utf8');
index = fixPreview(index);
fs.writeFileSync('index.html', index);

console.log("Updated generatePreview properly");
