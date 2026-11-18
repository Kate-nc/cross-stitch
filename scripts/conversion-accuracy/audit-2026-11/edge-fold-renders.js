'use strict';
const path=require('path'),fs=require('fs');
const M=require('./measure.js');const {H,W,v}=M;
const {createCanvas}=require(path.join(process.cwd(),'node_modules/canvas'));
const OUT=process.argv[2];fs.mkdirSync(OUT,{recursive:true});
const off={dith:false,dithAlgo:'off'};
const orig=W.mergeEdgeBlendColours;let foldStats=null;
W.mergeEdgeBlendColours=function(mapped,w,h,o){const before=mapped.map(m=>m.id);const r=orig(mapped,w,h,o);let ch=0;for(let i=0;i<mapped.length;i++)if(mapped[i].id!==before[i])ch++;foldStats={changed:ch,n:mapped.length,folded:r};return r;};
const noFold=()=>{W.mergeEdgeBlendColours=function(){}};const withFold=()=>{W.mergeEdgeBlendColours=function(mapped,w,h,o){const before=mapped.map(m=>m.id);const r=orig(mapped,w,h,o);let ch=0;for(let i=0;i<mapped.length;i++)if(mapped[i].id!==before[i])ch++;foldStats={changed:ch,n:mapped.length,folded:r};return r;};};
const CFG=[['Current default',v({}),withFold],['Without edge-shade fold',v({}),noFold],['Shading off, no fold',v(off),noFold],['Plain match (no shading or cleanup)',v(Object.assign({},off,{stitchCleanup:{enabled:false},orphans:0})),withFold]];
function draw(ctx,rgb,w,h,ox,oy,cell){for(let y=0;y<h;y++)for(let x=0;x<w;x++){const c=rgb(y*w+x);ctx.fillStyle=`rgb(${c[0]},${c[1]},${c[2]})`;ctx.fillRect(ox+x*cell,oy+y*cell,cell,cell);}}
const lin=(m,i)=>{if(m.type==='blend'&&m.threads){return [0,1,2].map(k=>Math.round(((H.LIN[m.threads[0].rgb[k]]+H.LIN[m.threads[1].rgb[k]])/2)**(1/2.2)*255));}return m.rgb;};
(async()=>{
 const files=fs.readdirSync(M.IMG).filter(x=>/\.(png|jpe?g)$/i.test(x));
 let tot=0,totN=0,totF=0;
 for(const f of files){const p=await H.prepare(path.join(M.IMG,f),100);
  withFold();foldStats=null;H.runWorker(p.linear.data,p.w,p.h,v({}));tot+=foldStats.changed;totN+=foldStats.n;totF+=foldStats.folded;
  console.log(f.padEnd(14),'fold changed',(foldStats.changed/foldStats.n*100).toFixed(1)+'% of stitches; threads folded away entirely:',foldStats.folded);
  if(!['astronaut.png','kodim23.png','kodim05.png','coffee.png'].includes(f))continue;
  const cell=5,gap=10,cols=CFG.length+1;const c=createCanvas(cols*p.w*cell+(cols-1)*gap,p.h*cell);const x=c.getContext('2d');x.fillStyle='#fff';x.fillRect(0,0,c.width,c.height);
  draw(x,i=>[p.linear.data[i*4],p.linear.data[i*4+1],p.linear.data[i*4+2]],p.w,p.h,0,0,cell);
  CFG.forEach(([n,s,setup],k)=>{setup();const r=H.runWorker(p.linear.data,p.w,p.h,s);draw(x,i=>r.mapped[i].rgb,p.w,p.h,(k+1)*(p.w*cell+gap),0,cell);});
  fs.writeFileSync(path.join(OUT,f.replace(/\.\w+$/,'')+'.png'),c.toBuffer('image/png'));}
 console.log('MEAN fold changed',(tot/totN*100).toFixed(1)+'%','avg threads folded',(totF/files.length).toFixed(1));
})();
