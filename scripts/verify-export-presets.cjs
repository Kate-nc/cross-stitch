#!/usr/bin/env node
// Actual worker outputs, shared-plan checks and raster previews; no CDN required.
const fs=require('fs'), path=require('path'), assert=require('assert');
const execFile=require('util').promisify(require('child_process').execFile);
const {PDFDocument}=require('pdf-lib');
const {loadWorker,fixture}=require('../tests/pdfWorkerHarness');
const layout=require('../creator/pdfChartLayout');
const output=path.resolve(process.argv[2]||'reports/export-presets');fs.mkdirSync(output,{recursive:true});
const scenarios=[
 ['wide-letter',137,3,{pageSize:'letter',stitchesPerPage:'custom',customCols:50,customRows:30,overlap:true}],
 ['tall-a4',3,173,{pageSize:'a4',stitchesPerPage:'large',overlap:false}],
 ['multipage-a4',121,97,{pageSize:'a4',overlap:true}],
 ['chart-only',73,41,{pageSize:'letter',includeCover:false,includeInfo:false,includeIndex:false,includeLegend:false,miniLegend:false,chartModes:['bw']}],
 ['branded-letter',17,13,{pageSize:'letter',marginsMm:30,branding:{designerName:'Needle & Thread Studio',designerCopyright:'© 2026 Needle & Thread Studio. Personal use only.',designerContact:'hello@example.test | needle.example.test'}}],
];
(async()=>{
 const results=[];
 for(const [name,w,h,patch] of scenarios){
  const project=fixture(12,{name,w,h});project.pattern=Array.from({length:w*h},(_,i)=>project.palette[(i%w+Math.floor(i/w))%12]);
  const opts={marginsMm:12,chartModes:['bw','colour'],includeCover:true,includeInfo:true,includeIndex:true,miniLegend:true,...patch};
  const plan=layout.planExport(project,opts), progress=[];
  const bytes=await loadWorker({postMessage:m=>progress.push(m)}).buildPdf(project,opts,1);
  const pdf=await PDFDocument.load(bytes); assert.equal(pdf.getPageCount(),plan.totalPages);
  assert.equal(progress.at(-1).total,plan.totalPages);
  const file=path.join(output,name+'.pdf');fs.writeFileSync(file,bytes);
  const chartPage=(opts.includeCover?1:0)+(opts.includeInfo?1:0)+plan.legendPages+1;
  await execFile('pdftoppm',['-f',String(chartPage),'-l',String(chartPage),'-scale-to','1100','-singlefile','-png',file,path.join(output,name+'-chart')]);
  if(opts.branding)await execFile('pdftoppm',['-f','1','-l','1','-scale-to','1100','-singlefile','-png',file,path.join(output,name+'-cover')]);
  results.push({name,dimensions:[w,h],options:opts,pages:pdf.getPageCount(),chartPages:plan.chartPages,legendPages:plan.legendPages,geometry:plan.geom});
 }
 fs.writeFileSync(path.join(output,'validation.json'),JSON.stringify(results,null,2)+'\n');console.log(JSON.stringify(results.map(({name,pages})=>({name,pages})),null,2));
})().catch(err=>{console.error(err);process.exitCode=1;});
