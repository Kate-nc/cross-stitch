'use strict';
// Audit B's background-removal fixtures. Run from the repository root.
const path=require('path');const H=require(path.join(process.cwd(),'scripts/conversion-accuracy/harness.js'));const W=H.W;
function img(w,h,f){const d=new Uint8ClampedArray(w*h*4);for(let y=0;y<h;y++)for(let x=0;x<w;x++){const c=f(x,y),i=(y*w+x)*4;d[i]=c[0];d[i+1]=c[1];d[i+2]=c[2];d[i+3]=c[3]==null?255:c[3];}return d;}
const kept=m=>m.reduce((a,b)=>a+b,0);
// 1. 7x7 pale border with a slightly darker stripe through the middle (a pale subject touching the edge)
for(const stripe of [225,215,205,195]){
 const d=img(7,7,(x,y)=>x===3?[stripe,stripe,stripe]:[240,240,240]);
 const border=W.detectUniformBorder({data:d,width:7,height:7});
 const m=W.prepareConversionPixels(new Uint8ClampedArray(d),7,7,{skipBg:true,bgCol:border?border.rgb:[240,240,240],bgTh:15});
 console.log(`stripe ${stripe} on 240: border detected ${!!border}, cells kept ${kept(m)}/49 (stripe ΔE76 ${H.dE00?'' :''}${W.dE(W.rgbToLab(stripe,stripe,stripe),W.rgbToLab(240,240,240)).toFixed(1)})`);}
// 2. Same picture, one pixel alpha 254
{const d=img(7,7,(x,y)=>x===3?[225,225,225]:[240,240,240]);d[3]=254;
 const m=W.prepareConversionPixels(new Uint8ClampedArray(d),7,7,{skipBg:true,bgCol:[240,240,240],bgTh:15});console.log('one corner pixel alpha 254: cells kept',kept(m),'/49');}
// 3. Opaque photo-like noise downscaled at awkward ratios: does the averaged alpha stay 255?
let bad=0,tot=0;for(const [sw,sh,dw,dh] of [[1999,1333,100,67],[2000,1500,137,103],[1234,987,500,400],[640,480,97,73],[333,777,41,96]]){
 const d=img(sw,sh,()=>[Math.random()*255|0,Math.random()*255|0,Math.random()*255|0]);const o=W.linearAreaDownscale(d,sw,sh,dw,dh);for(let i=3;i<o.length;i+=4){tot++;if(o[i]!==255)bad++;}}
console.log('opaque downscales: stitches with alpha < 255:',bad,'of',tot);
// 4. A real-world case: PNG with a soft (partly transparent) shadow or vignette touching the corner
{const d=img(50,50,(x,y)=>{const inS=(x-25)**2+(y-25)**2<100;return inS?[200,120,90]:[245,245,245,(x<2&&y<2)?250:255];});
 const m=W.prepareConversionPixels(new Uint8ClampedArray(d),50,50,{skipBg:true,bgCol:[245,245,245],bgTh:15});console.log('white background, 4 corner pixels alpha 250: kept',kept(m),'of 2500 (subject ~314)');}
