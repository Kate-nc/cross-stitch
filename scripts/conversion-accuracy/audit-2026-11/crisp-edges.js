'use strict';
// Prototype: "dominant colour" shrink. Per stitch, split its source pixels into two groups (2-means in linear RGB);
// if the groups are clearly different (dE00 > 12) and the larger covers >= 60%, the stitch takes the larger group's
// light-average; otherwise the plain light-average. Edge stitches pick a side instead of an in-between colour.
const path=require('path'),fs=require('fs');const M=require('./measure.js');const {H,W,v,run}=M;
const {createCanvas,loadImage}=require(path.join(process.cwd(),'node_modules/canvas'));
const LIN=H.LIN;const toS=l=>{l=Math.max(0,Math.min(1,l));return Math.round((l<=0.0031308?l*12.92:1.055*l**(1/2.4)-0.055)*255);};
function dominant(src,sw,sh,tw,th,minShare=0.6,minDE=12){
 const out=new Uint8ClampedArray(tw*th*4);const sx=sw/tw,sy=sh/th;let picked=0;
 for(let ty=0;ty<th;ty++)for(let tx=0;tx<tw;tx++){
  const x0=Math.floor(tx*sx),x1=Math.max(x0+1,Math.floor((tx+1)*sx)),y0=Math.floor(ty*sy),y1=Math.max(y0+1,Math.floor((ty+1)*sy));
  const px=[];let mr=0,mg=0,mb=0;
  for(let y=y0;y<y1;y++)for(let x=x0;x<x1;x++){const i=(y*sw+x)*4;const p=[LIN[src[i]],LIN[src[i+1]],LIN[src[i+2]]];px.push(p);mr+=p[0];mg+=p[1];mb+=p[2];}
  const n=px.length;mr/=n;mg/=n;mb/=n;let res=[mr,mg,mb];
  if(n>=4){let far=0,fd=-1;for(let k=0;k<n;k++){const d=(px[k][0]-mr)**2+(px[k][1]-mg)**2+(px[k][2]-mb)**2;if(d>fd){fd=d;far=k;}}
   let A=px[far].slice(),B=[2*mr-A[0],2*mg-A[1],2*mb-A[2]];let ga,gb,na,nb;
   for(let it=0;it<6;it++){ga=[0,0,0];gb=[0,0,0];na=0;nb=0;for(const p of px){const da=(p[0]-A[0])**2+(p[1]-A[1])**2+(p[2]-A[2])**2,db=(p[0]-B[0])**2+(p[1]-B[1])**2+(p[2]-B[2])**2;if(da<db){na++;ga[0]+=p[0];ga[1]+=p[1];ga[2]+=p[2];}else{nb++;gb[0]+=p[0];gb[1]+=p[1];gb[2]+=p[2];}}
    if(!na||!nb)break;A=ga.map(x=>x/na);B=gb.map(x=>x/nb);}
   if(na&&nb){const big=na>=nb?A:B,share=Math.max(na,nb)/n;const d=H.dE00(H.linToLab(...A),H.linToLab(...B));if(share>=minShare&&d>minDE){res=big;picked++;}}}
  const o=(ty*tw+tx)*4;out[o]=toS(res[0]);out[o+1]=toS(res[1]);out[o+2]=toS(res[2]);out[o+3]=255;}
 return {data:out,picked:picked/(tw*th)};
}
(async()=>{const files=fs.readdirSync(M.IMG);const P=[],D=new Map();let pk=0;
 for(const f of files){const p=await H.prepare(path.join(M.IMG,f),100);const img=await loadImage(path.join(M.IMG,f));const c=createCanvas(img.width,img.height);const cx=c.getContext('2d');cx.drawImage(img,0,0);
  const d=dominant(cx.getImageData(0,0,img.width,img.height).data,img.width,img.height,p.w,p.h);D.set(f,d.data);pk+=d.picked;P.push(p);}
 console.log('stitches that took a side:',(pk/P.length*100).toFixed(1)+'%');
 console.log(['config','cellDE','viewDE','edgeDE','singles%','conf%','comps/100','symbols','threads'].join('\t'));
 const off={dith:false,dithAlgo:'off'};const orig=W.mergeEdgeBlendColours;
 W.mergeEdgeBlendColours=function(){};
 run(P,'No fold (average shrink)',v({}));
 run(P,'No fold (dominant shrink)',v({}),p=>D.get(p.file));
 run(P,'No fold, shading off (average)',v(off));
 run(P,'No fold, shading off (dominant)',v(off),p=>D.get(p.file));
 // render
 const OUT=process.argv[2];const cell=5,gap=10;
 for(const p of P){if(!['astronaut.png','kodim05.png','kodim23.png'].includes(p.file))continue;
  const rs=[H.runWorker(p.linear.data,p.w,p.h,v(off)),H.runWorker(D.get(p.file),p.w,p.h,v(off))];
  const c=createCanvas(3*p.w*cell+2*gap,p.h*cell),x=c.getContext('2d');x.fillStyle='#fff';x.fillRect(0,0,c.width,c.height);
  const draw=(get,ox)=>{for(let y=0;y<p.h;y++)for(let xx=0;xx<p.w;xx++){const q=get(y*p.w+xx);x.fillStyle=`rgb(${q[0]},${q[1]},${q[2]})`;x.fillRect(ox+xx*cell,y*cell,cell,cell);}};
  draw(i=>[p.linear.data[i*4],p.linear.data[i*4+1],p.linear.data[i*4+2]],0);rs.forEach((r,k)=>draw(i=>r.mapped[i].rgb,(k+1)*(p.w*cell+gap)));
  fs.writeFileSync(path.join(OUT,'dominant-'+p.file.replace(/\.\w+$/,'')+'.png'),c.toBuffer('image/png'));}
 W.mergeEdgeBlendColours=orig;})();
