'use strict';
const path=require('path'),fs=require('fs');const {createCanvas}=require('canvas');const H=require('./harness.js');const W=H.W;const IMG=path.join(__dirname,'img');
const base={maxC:20,dith:true,dithAlgo:'atkinson',dithStrength:0.5,dithBayerSize:4,allowBlends:true,skipBg:false,bgCol:[255,255,255],bgTh:15,minSt:6,smooth:0,smoothType:'median',stitchCleanup:{enabled:true,strength:'balanced',protectDetails:true,smoothDithering:true},orphans:2,disambig:false,disambigLevel:'standard',allowedPalette:null,seed:1337};
const v=(o)=>Object.assign({},base,o);
const origEdge=W.generateEdgeMap;
const RUNS=[
 ['Current default','gamma',v({}),()=>{}],
 ['Option A: accurate (linear, undilated edges, 24 thr, minSt 0)','linear',v({maxC:24,minSt:0}),()=>{W.generateEdgeMap=(d,w,h)=>origEdge(d,w,h,{edgeDilation:0});}],
 ['Option B: tidy (linear, guard-only protect, confetti 1, 24 thr, minSt 0)','linear',v({maxC:24,minSt:0,orphans:1}),()=>{W.generateEdgeMap=()=>null;}],
];
function draw(ctx,rgb,w,h,ox,cell){for(let y=0;y<h;y++)for(let x=0;x<w;x++){const c=rgb(y*w+x);ctx.fillStyle=`rgb(${c[0]},${c[1]},${c[2]})`;ctx.fillRect(ox+x*cell,y*cell,cell,cell);}}
(async()=>{const files=fs.readdirSync(IMG).filter(f=>/\.(png|jpe?g)$/i.test(f)).map(f=>path.join(IMG,f));const P=[];for(const f of files)P.push(await H.prepare(f,100));
const results={};console.log(['config','cellDE','viewDE','edgeDE','singles%','conf%','comps/100','chg%','symbols','threads'].join('\t'));
for(const [name,input,s,setup] of RUNS){W.generateEdgeMap=origEdge;setup();const acc={};for(const p of P){const res=H.runWorker(p[input].data,p.w,p.h,s);(results[p.file]=results[p.file]||[]).push(res);const m=H.score(res,p.ref,p.w,p.h);for(const k in m)acc[k]=(acc[k]||0)+m[k]/P.length;}
const f=(x,d=2)=>x.toFixed(d);console.log([name.padEnd(70),f(acc.cellDE),f(acc.viewDE),f(acc.edgeDE),f(acc.singles),f(acc.small),f(acc.comps),f(acc.changes),f(acc.symbols,1),f(acc.threads,1)].join('\t'));}
fs.mkdirSync(path.join(__dirname,'render'),{recursive:true});const cell=4,gap=8;for(const p of P){const cols=1+RUNS.length;const c=createCanvas(cols*p.w*cell+(cols-1)*gap,p.h*cell),x=c.getContext('2d');x.fillStyle='#fff';x.fillRect(0,0,c.width,c.height);
draw(x,i=>[p.linear.data[i*4],p.linear.data[i*4+1],p.linear.data[i*4+2]],p.w,p.h,0,cell);
results[p.file].forEach((r,k)=>draw(x,i=>r.mapped[i].rgb,p.w,p.h,(k+1)*(p.w*cell+gap),cell));
fs.writeFileSync(path.join(__dirname,'render',p.file.replace(/\.\w+$/,'')+'.png'),c.toBuffer('image/png'));}})();
