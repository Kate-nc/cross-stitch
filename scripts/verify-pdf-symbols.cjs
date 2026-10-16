#!/usr/bin/env node
// Reproduce actual colour/B&W PDFs and a 300-dpi chart contact sheet.
// Requires devDependencies and Poppler's pdftoppm; no browser/CDN access.
const fs = require('fs');
const path = require('path');
const execFile = require('util').promisify(require('child_process').execFile);
const {createCanvas, loadImage} = require('canvas');
const {loadWorker, fixture} = require('../tests/pdfWorkerHarness');
const layout = require('../creator/pdfChartLayout');
const output = path.resolve(process.argv[2] || 'work/pdf-symbols');
fs.mkdirSync(output, {recursive:true});
const options = {chartModes:['colour','bw'],miniLegend:true,includeCover:true,includeInfo:true,includeIndex:true};
(async () => {
  const crops=[];
  for(const n of [100,112]) for(const size of (n===100 ? ['medium'] : ['small','medium','large'])) {
    const project=fixture(n);
    const last=project.palette[n-1];
    project.palette[n-1]={...last,id:'310+550',type:'blend',threads:[{id:'310'},{id:'550'}]};
    project.pattern[n-1]=project.palette[n-1];
    const file=path.join(output, `${n}-${size}.pdf`);
    fs.writeFileSync(file, await loadWorker().buildPdf(project,{...options,stitchesPerPage:size},1));
    console.log(file);
    if(n!==112) continue;
    const prefix=path.join(output,`112-${size}`);
    const rendered = await execFile('pdftoppm',['-f','7','-l','8','-r','300','-png',file,prefix]);
    if (rendered.stderr) fs.writeFileSync(prefix+'-renderer.log',rendered.stderr);
    const geom=layout.computePageGeometry({stitchesPerPage:size});
    const px=mm=>mm*300/25.4;
    for(const page of [7,8]) {
      const img=await loadImage(prefix+'-'+page+'.png');
      const x=px(12),y=px(12+geom.chartHeaderMm-5);
      const width=Math.ceil(px(6+10*geom.cellMm+2)),height=Math.ceil(px(12*geom.cellMm+7));
      const canvas=createCanvas(width,height),ctx=canvas.getContext('2d');
      ctx.drawImage(img,x,y,width,height,0,0,width,height);
      crops.push({canvas,label:`${size}: ${geom.cellMm.toFixed(2)} mm cells, ${page===7?'colour':'black and white'}`});
    }
  }
  const cellW=Math.max(...crops.map(c=>c.canvas.width))+30;
  const cellH=Math.max(...crops.map(c=>c.canvas.height))+50;
  const sheet=createCanvas(cellW*2,cellH*3),ctx=sheet.getContext('2d');
  ctx.fillStyle='white';ctx.fillRect(0,0,sheet.width,sheet.height);
  crops.forEach((crop,i)=>{const x=(i%2)*cellW,y=Math.floor(i/2)*cellH;ctx.fillStyle='black';ctx.font='17px sans-serif';ctx.fillText(crop.label,x+10,y+24);ctx.drawImage(crop.canvas,x+10,y+40);});
  fs.writeFileSync(path.join(output,'print-contact-sheet.png'),sheet.toBuffer());
})().catch(err=>{console.error(err);process.exitCode=1;});
