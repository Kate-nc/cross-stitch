'use strict';
// Run from the repository root: node scripts/conversion-accuracy/audit-2026-11/measure.js
// Run from repo root: node <this> 
const path=require('path'),fs=require('fs');
const REPO=process.cwd();
const H=require(path.join(REPO,'scripts/conversion-accuracy/harness.js'));const W=H.W;
const IMG=path.join(REPO,'scripts/conversion-accuracy/img');
const cur={maxC:24,dith:true,dithAlgo:'atkinson',dithStrength:0.5,dithBayerSize:4,allowBlends:true,maxBlends:12,skipBg:false,bgCol:[255,255,255],bgTh:15,minSt:0,smooth:0,smoothType:'median',stitchCleanup:{enabled:true,protectDetails:true},orphans:2,disambig:false,disambigLevel:'standard',allowedPalette:null,seed:1337};
const v=o=>Object.assign({},cur,o);
const f=(x,d=2)=>x.toFixed(d);
function row(name,acc){console.log([name.padEnd(46),f(acc.cellDE),f(acc.viewDE),f(acc.edgeDE),f(acc.singles),f(acc.small),f(acc.comps),f(acc.symbols,1),f(acc.threads,1)].join('\t'));}
function run(P,name,s,inp='linear',scoreFn){const acc={};for(const p of P){const res=H.runWorker((typeof inp==='function'?inp(p):p[inp].data),p.w,p.h,s);const m=(scoreFn||H.score)(res,p.ref,p.w,p.h);for(const k in m)acc[k]=(acc[k]||0)+m[k]/P.length;}row(name,acc);return acc;}
module.exports={H,W,cur,v,run,row,IMG,f};
if(require.main===module)(async()=>{
 const files=fs.readdirSync(IMG).filter(x=>/\.(png|jpe?g)$/i.test(x)).map(x=>path.join(IMG,x));
 const LONG=+process.env.LONG||100;
 const P=[];for(const x of files)P.push(await H.prepare(x,LONG));
 console.log(['config','cellDE','viewDE','edgeDE','singles%','conf%','comps/100','symbols','threads'].join('\t'));
 run(P,'Current Photo default (Balanced)',cur);
 run(P,'More detail (confetti 0)',v({orphans:0}));
 run(P,'Tidier (confetti 1, no edge protect)',v({orphans:1,stitchCleanup:{enabled:true,protectDetails:false}}));
 run(P,'Easiest (no shading, confetti 2, no protect)',v({dith:false,dithAlgo:'off',stitchCleanup:{enabled:true,protectDetails:false}}));
 run(P,'Blends off',v({allowBlends:false}));
 run(P,'Raw: no shading/cleanup',v({dith:false,dithAlgo:'off',stitchCleanup:{enabled:false},orphans:0}));
 for(const s of [1,2,3,4,5]) run(P,'Seed '+s,v({seed:s}));
})();
