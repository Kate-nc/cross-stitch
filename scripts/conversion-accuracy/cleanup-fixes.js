'use strict';
const path=require('path'),fs=require('fs');const H=require('./harness.js');const W=H.W;const IMG=path.join(__dirname,'img');
const base={maxC:20,dith:true,dithAlgo:'atkinson',dithStrength:0.5,dithBayerSize:4,allowBlends:true,skipBg:false,bgCol:[255,255,255],bgTh:15,minSt:6,smooth:0,smoothType:'median',stitchCleanup:{enabled:true,strength:'balanced',protectDetails:true,smoothDithering:true},orphans:2,disambig:false,disambigLevel:'standard',allowedPalette:null,seed:1337};
const v=(o)=>Object.assign({},base,o);const sc=(o)=>Object.assign({},base.stitchCleanup,o);
const origEdge=W.generateEdgeMap, origHi=W.SALIENCY_NORM_HI, origLo=W.SALIENCY_NORM_LO;
const RUNS=[
 ['DEFAULT',{},()=>{}],
 ['Protect details off (no edge map, no contrast guard)',{stitchCleanup:sc({protectDetails:false})},()=>{}],
 ['Edge map undilated',{},()=>{W.generateEdgeMap=(d,w,h)=>origEdge(d,w,h,{edgeDilation:0});}],
 ['No edge map, contrast guard 30 kept',{},()=>{W.generateEdgeMap=()=>null;}],
 ['No edge map, guard 30, confetti 1',{orphans:1},()=>{W.generateEdgeMap=()=>null;}],
 ['No edge map, guard 30, confetti 0 (strength balanced=4)',{orphans:0},()=>{W.generateEdgeMap=()=>null;}],
 ['Saliency divisor x3 (edge map kept)',{},()=>{W.SALIENCY_NORM_HI=origHi*3;W.SALIENCY_NORM_LO=origLo*3;}],
 ['Saliency x3 + no edge map, guard 30, confetti 1',{orphans:1},()=>{W.SALIENCY_NORM_HI=origHi*3;W.SALIENCY_NORM_LO=origLo*3;W.generateEdgeMap=()=>null;}],
 ['Saliency x3 + undilated edges',{},()=>{W.SALIENCY_NORM_HI=origHi*3;W.SALIENCY_NORM_LO=origLo*3;W.generateEdgeMap=(d,w,h)=>origEdge(d,w,h,{edgeDilation:0});}],
];
(async()=>{const files=fs.readdirSync(IMG).filter(f=>/\.(png|jpe?g)$/i.test(f)).map(f=>path.join(IMG,f));const P=[];for(const f of files)P.push(await H.prepare(f,+(process.env.LONG||100)));
console.log(['config','cellDE','viewDE','edgeDE','singles%','conf%','comps/100','chg%','symbols','threads'].join('\t'));
for(const [name,o,setup] of RUNS){W.generateEdgeMap=origEdge;W.SALIENCY_NORM_HI=origHi;W.SALIENCY_NORM_LO=origLo;setup();const s=v(o);const acc={};for(const p of P){const m=H.score(H.runWorker(p.gamma.data,p.w,p.h,s),p.ref,p.w,p.h);for(const k in m)acc[k]=(acc[k]||0)+m[k]/P.length;}
const f=(x,d=2)=>x.toFixed(d);console.log([name.padEnd(58),f(acc.cellDE),f(acc.viewDE),f(acc.edgeDE),f(acc.singles),f(acc.small),f(acc.comps),f(acc.changes),f(acc.symbols,1),f(acc.threads,1)].join('\t'));}})();
