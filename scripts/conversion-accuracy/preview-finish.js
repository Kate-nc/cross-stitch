// Run from the repository root. Compare HEAD with the working tree using the
// existing ten-photo accuracy harness and actual Convert preset settings.
// Set BASELINE_REF to the pre-change commit when re-running after a commit.
'use strict';
const fs = require('fs'), path = require('path'), cp = require('child_process');
const H = require('./harness');
const baselineRef = process.env.BASELINE_REF || 'HEAD';
const base = { maxC:24,dith:true,dithAlgo:'atkinson',dithStrength:0.5,allowBlends:true,skipBg:false,bgCol:[255,255,255],bgTh:15,minSt:0,smooth:0,stitchCleanup:{enabled:true,strength:'balanced',protectDetails:true,smoothDithering:true},orphans:2,disambig:false,seed:1337 };
(async()=>{
 const files=fs.readdirSync(path.join(__dirname,'img')).filter(f=>/\.(png|jpe?g)$/.test(f));
 if (files.length !== 10) throw new Error('Expected the ten photo fixtures; run fetch-images.sh first.');
 const photos=[];for(const file of files)photos.push(await H.prepare(path.join(__dirname,'img',file),100));
 const versions={};
 for(const version of ['before','after']){
   const worker=H.runtime(file=>version==='before'&&['colour-utils.js','generate-worker.js'].includes(file)?cp.execFileSync('git',['show',baselineRef+':'+file],{encoding:'utf8',maxBuffer:5000000}):fs.readFileSync(file,'utf8'));
   versions[version]=[];
   for(const p of photos)for(const shading of [true,false]){
     const result=H.runWorker(new Uint8ClampedArray(p.linear.data),p.w,p.h,{...base,dith:shading,dithAlgo:shading?'atkinson':'off'},worker);
     versions[version].push({file:p.file,shading,ids:result.mapped.map(m=>m.id).join('|'),metrics:H.score(result,p.ref,p.w,p.h)});
   }
 }
 const rows=versions.after.map((r,i)=>({file:r.file,shading:r.shading,identical:r.ids===versions.before[i].ids,before:versions.before[i].metrics,after:r.metrics}));
 fs.mkdirSync('reports/convert-preview-finish',{recursive:true});
 fs.writeFileSync('reports/convert-preview-finish/photo-measurements.json',JSON.stringify(rows,null,2)+'\n');
 console.log(`${rows.length} photo conversions, ${rows.filter(r=>r.identical).length} identical charts`);
})();
