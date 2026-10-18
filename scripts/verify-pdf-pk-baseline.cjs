#!/usr/bin/env node
// Compare production PK PDFs against a known repository revision with a frozen clock.
const vm=require('vm'), fs=require('fs'), execFile=require('util').promisify(require('child_process').execFile), assert=require('assert');
const baseline=process.argv[2]||'986fd1d224d14872150a1b66b2cb3da0cbf7d3d9';
const {fixture}=require('../tests/pdfWorkerHarness');
async function worker(old){
 const oldSources={};
 if(old) for(const f of ["pdf-export-worker.js","creator/pdfChartLayout.js"]) oldSources[f]=(await execFile("git",["show",baseline+":"+f],{encoding:"utf8"})).stdout;
 const ctx={atob,TextEncoder,TextDecoder,setTimeout,console,postMessage(){}};ctx.self=ctx;vm.createContext(ctx);
 vm.runInContext('var RD=Date; Date=class extends RD {constructor(...a){super(...(a.length?a:[1767225600000]));} static now(){return 1767225600000;}}',ctx);
 function read(f){return old && ['pdf-export-worker.js','creator/pdfChartLayout.js'].includes(f)?oldSources[f]:fs.readFileSync(f,'utf8');}
 ctx.importScripts=(...files)=>files.forEach(f=>{if(f.startsWith('https:'))f='node_modules/pdf-lib/dist/pdf-lib.min.js';vm.runInContext(read(f),ctx,{filename:f});});
 vm.runInContext(read('pdf-export-worker.js'),ctx);return ctx;
}
(async()=>{
 const before=await worker(true),after=await worker(false);
 for(const n of [1,100,112])for(const pageSize of ['a4','letter']) {
  const p=fixture(n),opts={pageSize,marginsMm:12,stitchesPerPage:'medium',chartModes:['bw','colour'],overlap:true,includeCover:true,includeInfo:true,includeIndex:true,miniLegend:true,theme:'pk',branding:{designerName:'Needle Studio',designerContact:'hello@example.test',designerCopyright:'© 2026 Studio'}};
  const a=Buffer.from(await before.buildPdf(p,opts,1)),b=Buffer.from(await after.buildPdf(p,opts,1));
  assert(a.equals(b),'PK byte regression: '+n+' threads, '+pageSize);console.log('Byte-identical: '+n+' threads, '+pageSize+', '+b.length+' bytes');
 }
})().catch(e=>{console.error(e);process.exitCode=1;});
