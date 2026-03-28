const fs = require('fs');

const code = fs.readFileSync('colour-utils.js', 'utf8');

const search = `function quantize(data,w,h,n){let px=[];for(let i=0;i<w*h;i++){let j=i*4;px.push(rgbToLab(data[j],data[j+1],data[j+2]));}let cs=[px[Math.floor(Math.random()*px.length)]];while(cs.length<Math.min(n,px.length)){let ds=px.map(q=>{let md=1e9;for(let i=0;i<cs.length;i++)md=Math.min(md,dE(q,cs[i]));return md*md;});let sum=ds.reduce((a,b)=>a+b,0),r=Math.random()*sum,acc=0;for(let i=0;i<px.length;i++){acc+=ds[i];if(acc>=r){cs.push([px[i][0],px[i][1],px[i][2]]);break;}}}for(let it=0;it<20;it++){let cl=cs.map(()=>[]);for(let pi=0;pi<px.length;pi++){let md=1e9,mi=0;for(let c=0;c<cs.length;c++){let d=dE(px[pi],cs[c]);if(d<md){md=d;mi=c;}}cl[mi].push(px[pi]);}let mv=false;for(let c2=0;c2<cs.length;c2++){if(!cl[c2].length)continue;let nv=[cl[c2].reduce((s,q)=>s+q[0],0)/cl[c2].length,cl[c2].reduce((s,q)=>s+q[1],0)/cl[c2].length,cl[c2].reduce((s,q)=>s+q[2],0)/cl[c2].length];if(dE(nv,cs[c2])>0.5)mv=true;cs[c2]=nv;}if(!mv)break;}let pl=[],used=new Set();for(let ci=0;ci<cs.length;ci++){let b=null,bd=1e9;for(let ti=0;ti<DMC.length;ti++){if(used.has(DMC[ti].id))continue;let d2=dE(cs[ci],DMC[ti].lab);if(d2<bd){bd=d2;b=DMC[ti];}}if(b){used.add(b.id);pl.push(b);}}return pl;}`;

const replace = `function quantize(data,w,h,n){
  let seed=1337;
  function random(){let t=seed+=0x6D2B79F5;t=Math.imul(t^t>>>15,t|1);t^=t+Math.imul(t^t>>>7,t|61);return((t^t>>>14)>>>0)/4294967296;}
  let px=[], len=w*h;
  for(let i=0;i<len;i++){let j=i*4;px.push(rgbToLab(data[j],data[j+1],data[j+2]));}
  let cs=[px[Math.floor(random()*px.length)]];
  let ds=new Float32Array(px.length);
  for(let i=0;i<px.length;i++){ds[i]=1e9;}
  while(cs.length<Math.min(n,px.length)){
    let lastCenter = cs[cs.length-1];
    let sum=0;
    for(let i=0;i<px.length;i++){
      let dist = dE(px[i], lastCenter);
      let distSq = dist * dist;
      if (distSq < ds[i]) ds[i] = distSq;
      sum += ds[i];
    }
    let r=random()*sum,acc=0;
    for(let i=0;i<px.length;i++){
      acc+=ds[i];
      if(acc>=r){cs.push([px[i][0],px[i][1],px[i][2]]);break;}
    }
  }
  for(let it=0;it<20;it++){
    let cl=cs.map(()=>[]);
    for(let pi=0;pi<px.length;pi++){
      let md=1e9,mi=0;
      for(let c=0;c<cs.length;c++){let d=dE(px[pi],cs[c]);if(d<md){md=d;mi=c;}}
      cl[mi].push(px[pi]);
    }
    let mv=false;
    for(let c2=0;c2<cs.length;c2++){
      if(!cl[c2].length)continue;
      let nv=[cl[c2].reduce((s,q)=>s+q[0],0)/cl[c2].length,cl[c2].reduce((s,q)=>s+q[1],0)/cl[c2].length,cl[c2].reduce((s,q)=>s+q[2],0)/cl[c2].length];
      if(dE(nv,cs[c2])>0.5)mv=true;
      cs[c2]=nv;
    }
    if(!mv)break;
  }
  let pl=[],used=new Set();
  for(let ci=0;ci<cs.length;ci++){
    let b=null,bd=1e9;
    for(let ti=0;ti<DMC.length;ti++){
      if(used.has(DMC[ti].id))continue;
      let d2=dE(cs[ci],DMC[ti].lab);if(d2<bd){bd=d2;b=DMC[ti];}
    }
    if(b){used.add(b.id);pl.push(b);}
  }
  return pl;
}`;

const newCode = code.replace(search, replace);
if (newCode !== code) {
  fs.writeFileSync('colour-utils.js', newCode, 'utf8');
  console.log('Replaced successfully');
} else {
  console.log('Search string not found');
}
