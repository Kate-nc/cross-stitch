'use strict';
const path=require('path'),fs=require('fs');
const M=require('./measure.js');const {H,W}=M;const LIN=H.LIN;
const DMC=require('vm').runInContext('DMC',W);
const blendsG=[],blendsL=[];
for(let i=0;i<DMC.length;i++)for(let j=i+1;j<DMC.length;j++){const a=DMC[i],b=DMC[j];if(H.dE00(a.lab,b.lab)>20)continue;
 blendsG.push({lab:W.rgbToLab(...a.rgb.map((x,k)=>Math.round((x+b.rgb[k])/2)))});
 blendsL.push({lab:H.linToLab(...[0,1,2].map(k=>(LIN[a.rgb[k]]+LIN[b.rgb[k]])/2))});}
function nearest(lab,pool){let b=1e9;for(const e of pool){if(W._dE2000LightnessBound(lab[0],e.lab[0])>=b)continue;const d=W._dE2000Core(lab[0],lab[1],lab[2],e.lab[0],e.lab[1],e.lab[2]);if(d<b)b=d;}return b;}
(async()=>{
 const files=fs.readdirSync(M.IMG).filter(x=>/\.(png|jpe?g)$/i.test(x)).map(x=>path.join(M.IMG,x));
 let S=0,B=0,BL=0,K=0;const bad={};let badN=0,badL=0,badC=0,allL=0,allC=0;
 for(const x of files){const p=await H.prepare(x,100);const N=p.w*p.h;
  for(let i=0;i<N;i+=17){const lab=p.ref.lab[i];const s=nearest(lab,DMC);const bg=Math.min(s,nearest(lab,blendsG));
   // true colour of the best gamma-model blend is unknown here; report linear-model floor separately
   const bl=Math.min(s,nearest(lab,blendsL));S+=s;B+=bg;BL+=bl;K++;
   const C=Math.hypot(lab[1],lab[2]);allL+=lab[0];allC+=C;
   if(s>5){badN++;badL+=lab[0];badC+=C;const hue=(Math.atan2(lab[2],lab[1])*180/Math.PI+360)%360;
     const key=C<8?'near-neutral':hue<45?'red/pink':hue<75?'orange/skin/brown':hue<105?'yellow/olive':hue<180?'green':hue<270?'cyan/blue':'purple/magenta';
     const lk=lab[0]<30?'dark':lab[0]<65?'mid':'light';bad[key+' '+lk]=(bad[key+' '+lk]||0)+1;}}}
 console.log(`Sampled ${K} stitches. Nearest solid ${ (S/K).toFixed(2)}, with blends (app's gamma model) ${(B/K).toFixed(2)}, with blends (linear model) ${(BL/K).toFixed(2)}`);
 console.log(`Stitches >5 from any solid: ${(badN/K*100).toFixed(1)}%; their mean L ${(badL/badN).toFixed(1)} vs all ${(allL/K).toFixed(1)}; mean chroma ${(badC/badN).toFixed(1)} vs all ${(allC/K).toFixed(1)}`);
 Object.entries(bad).sort((a,b)=>b[1]-a[1]).slice(0,10).forEach(([k,v])=>console.log('  '+k.padEnd(28)+(v/badN*100).toFixed(1)+'%'));
})();
