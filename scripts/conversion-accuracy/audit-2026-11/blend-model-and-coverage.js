'use strict';
const path=require('path'),fs=require('fs');const REPO=process.cwd();
const M=require('./measure.js');const {H,W}=M;
const LIN=H.LIN, dE=H.dE00;
const DMC=require('vm').runInContext('DMC',W);
// 1. Blend model: gamma-mean (app) vs linear-light mean, for every pair the app may blend (dE00<=20)
let n=0,sum=0,max=0,over2=0,over3=0,dL=0,maxPair='';
for(let i=0;i<DMC.length;i++)for(let j=i+1;j<DMC.length;j++){const a=DMC[i],b=DMC[j];
 if(dE(a.lab,b.lab)>W.BLEND_MAX_PARTNER_DE)continue;
 const g=W.rgbToLab(...a.rgb.map((x,k)=>Math.round((x+b.rgb[k])/2)));
 const l=H.linToLab(...[0,1,2].map(k=>(LIN[a.rgb[k]]+LIN[b.rgb[k]])/2));
 const d=dE(g,l);n++;sum+=d;dL+=l[0]-g[0];if(d>2)over2++;if(d>3)over3++;if(d>max){max=d;maxPair=a.id+'+'+b.id;}}
console.log(`Blend pairs ${n}: mean dE00 gamma-vs-linear ${(sum/n).toFixed(2)}, >2: ${(over2/n*100).toFixed(1)}%, >3: ${(over3/n*100).toFixed(1)}%, max ${max.toFixed(2)} (${maxPair}), linear is lighter by ${(dL/n).toFixed(2)} L* on average`);
// 2. Catalogue coverage: nearest catalogue thread for each photo stitch, current vs community (pre-calibration) colours
const csv=fs.readFileSync(path.join(REPO,'reports/dmc-colour-calibration.csv'),'utf8').trim().split('\n');
const hdr=csv[0].split(',');const ci=hdr.indexOf('community_hex'),ii=hdr.indexOf('id');
const comm=[];for(const line of csv.slice(1)){const c=line.split(',');const hx=c[ci];if(!/^#?[0-9a-f]{6}$/i.test(hx||''))continue;const h=hx.replace('#','');const rgb=[0,2,4].map(k=>parseInt(h.substr(k,2),16));comm.push({id:c[ii],lab:W.rgbToLab(...rgb)});}
console.log('community entries',comm.length,'current',DMC.length);
function nearest(lab,pool){let b=1e9;for(const e of pool){const d=W._dE2000Core(lab[0],lab[1],lab[2],e.lab[0],e.lab[1],e.lab[2]);if(d<b)b=d;}return b;}
(async()=>{
 const files=fs.readdirSync(M.IMG).filter(x=>/\.(png|jpe?g)$/i.test(x)).map(x=>path.join(M.IMG,x));
 console.log('photo\tcur mean\tcur >5%\tcur >10%\tcomm mean\tcomm >5%\tmeanL ref\tlighter-than-all-but-white%');
 const tot={c:0,c5:0,m:0,m5:0,N:0};
 for(const x of files){const p=await H.prepare(x,100);const N=p.w*p.h;let c=0,c5=0,c10=0,m=0,m5=0,L=0;
  // sample every 2nd stitch for speed
  let k=0;for(let i=0;i<N;i+=2){k++;const lab=p.ref.lab[i];L+=lab[0];const a=nearest(lab,DMC),b=nearest(lab,comm);c+=a;m+=b;if(a>5)c5++;if(a>10)c10++;if(b>5)m5++;}
  console.log([p.file,(c/k).toFixed(2),(c5/k*100).toFixed(1),(c10/k*100).toFixed(1),(m/k).toFixed(2),(m5/k*100).toFixed(1),(L/k).toFixed(1)].join('\t'));
  tot.c+=c/k;tot.c5+=c5/k;tot.m+=m/k;tot.m5+=m5/k;tot.N++;}
 console.log(['MEAN',(tot.c/tot.N).toFixed(2),(tot.c5/tot.N*100).toFixed(1),'',(tot.m/tot.N).toFixed(2),(tot.m5/tot.N*100).toFixed(1)].join('\t'));
 // Lightness range of catalogue
 const Ls=DMC.map(d=>d.lab[0]).sort((a,b)=>a-b);const Lc=comm.map(d=>d.lab[0]).sort((a,b)=>a-b);
 const q=(a,p)=>a[Math.floor(p*(a.length-1))].toFixed(1);
 console.log('Catalogue L* quartiles current',q(Ls,.1),q(Ls,.5),q(Ls,.9),' community',q(Lc,.1),q(Lc,.5),q(Lc,.9));
 const chroma=a=>Math.hypot(a[1],a[2]);const Cs=DMC.map(d=>chroma(d.lab)).sort((a,b)=>a-b);
 console.log('Catalogue chroma p50/p90/max',q(Cs,.5),q(Cs,.9),Cs[Cs.length-1].toFixed(1));
})();
