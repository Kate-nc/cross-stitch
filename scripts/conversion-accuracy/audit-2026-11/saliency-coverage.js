'use strict';
const path=require('path'),fs=require('fs');const M=require('./measure.js');const {H,W}=M;
(async()=>{const files=fs.readdirSync(M.IMG);let S=0,F=0,E=0,n=0;
for(const f of files){const p=await H.prepare(path.join(M.IMG,f),100);const N=p.w*p.h;const d=new Uint8ClampedArray(p.linear.data);
 const s=W.generateSaliencyMap(d,p.w,p.h);let sum=0,flat=0;for(let i=0;i<N;i++){sum+=s[i];if(s[i]<0.25)flat++;}
 const e=W.generateEdgeMap(d,p.w,p.h,{edgeDilation:0});let ec=0;for(let i=0;i<N;i++)if(e[i])ec++;
 S+=sum/N;F+=flat/N;E+=ec/N;n++;console.log(f.padEnd(14),'mean saliency',(sum/N).toFixed(2),'flat(<0.25)',(flat/N*100).toFixed(0)+'%','edge map',(ec/N*100).toFixed(0)+'%');}
console.log('MEAN saliency',(S/n).toFixed(2),'flat',(F/n*100).toFixed(0)+'%','edge',(E/n*100).toFixed(0)+'%');})();
