// Measures Sharpen details as it was before it moved to the stitches
// (applyUnsharpMask, removed since): run it at commit 405fe04 to reproduce.
'use strict';
const path=require('path'),fs=require('fs');const REPO=process.cwd();
const M=require('./measure.js');const {H,W,v,run}=M;
const {createCanvas,loadImage}=require(path.join(process.cwd(),'node_modules/canvas'));
(async()=>{
 const files=fs.readdirSync(M.IMG).filter(x=>/\.(png|jpe?g)$/i.test(x)).map(x=>path.join(M.IMG,x));
 const P=[];for(const x of files)P.push(await H.prepare(x,100));
 console.log(['config','cellDE','viewDE','edgeDE','singles%','conf%','comps/100','symbols','threads'].join('\t'));
 const off={dith:false,dithAlgo:'off'};
 run(P,'Shading on, Cleanup off',v({stitchCleanup:{enabled:false},orphans:0}));
 run(P,'Shading off, Cleanup on, confetti 0',v(Object.assign({},off,{orphans:0})));
 run(P,'Shading off, Cleanup on, confetti 2 (protect)',v(off));
 run(P,'Shading off, Cleanup off',v(Object.assign({},off,{stitchCleanup:{enabled:false},orphans:0})));
 // Edge-blend fold disabled, everything else default
 const orig=W.mergeEdgeBlendColours; W.mergeEdgeBlendColours=function(){};
 run(P,'Default minus edge-shade fold',v({}));
 run(P,'Shading off, no edge fold, confetti 2',v(off));
 W.mergeEdgeBlendColours=orig;
 // Pre-sharpen: unsharp at 8x grid then linear downscale (mirrors gridPixels)
 async function sharpened(p,amount){
   const img=await loadImage(path.join(M.IMG,p.file));
   const ww=Math.min(img.width,p.w*8),hh=Math.min(img.height,p.h*8);
   const c=createCanvas(ww,hh),cx=c.getContext('2d');cx.imageSmoothingEnabled=true;cx.imageSmoothingQuality='high';cx.drawImage(img,0,0,ww,hh);
   const id=cx.getImageData(0,0,ww,hh);W.applyUnsharpMask(id.data,ww,hh,{amount});
   return W.linearAreaDownscale(id.data,ww,hh,p.w,p.h);
 }
 for(const a of [0.5,1.0]){const S=new Map();for(const p of P)S.set(p.file,await sharpened(p,a));
   run(P,'Sharpen details '+a+' (default style)',v({}),p=>S.get(p.file));
   run(P,'Sharpen details '+a+' (raw)',v(Object.assign({},off,{stitchCleanup:{enabled:false},orphans:0})),p=>S.get(p.file));}
})();
