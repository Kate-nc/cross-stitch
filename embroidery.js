const { useState, useRef, useEffect, useCallback, useMemo } = React;

const CW = 400, CH = 400;
const NODE_R = 6, NODE_HIT = 12, EDGE_HIT = 8;
const ACCENT = '#0d9488';
const ACCENT_DARK = '#0f766e';
const ACCENT_LIGHT = '#f0fdfa';
const ACCENT_BORDER = '#99f6e4';

const STITCHES = [
  { id:"satin",name:"Satin",desc:"Smooth parallel fill",color:"#0d9488"},
  { id:"longshort",name:"Long & Short",desc:"Blended shading fill",color:"#0f766e"},
  { id:"frenchknot",name:"French Knots",desc:"Textured dots",color:"#ec4899"},
  { id:"chainstitch",name:"Chain",desc:"Looped fill/outline",color:"#14b8a6"},
  { id:"seedstitch",name:"Seed",desc:"Random short stitches",color:"#f59e0b"},
  { id:"stemstitch",name:"Stem",desc:"Outline stitch",color:"#64748b"},
];

const EMB_COLORS=[
  {c:"310",n:"Black",h:"#000000"},{c:"blanc",n:"White",h:"#FFFFFF"},
  {c:"321",n:"Red",h:"#CC3333"},{c:"666",n:"Bright Red",h:"#E30000"},
  {c:"498",n:"Dark Red",h:"#880022"},{c:"815",n:"Garnet",h:"#771133"},
  {c:"349",n:"Coral",h:"#CC4444"},{c:"725",n:"Topaz",h:"#FFCC44"},
  {c:"973",n:"Canary",h:"#FFE500"},{c:"444",n:"Dk Lemon",h:"#FFD700"},
  {c:"307",n:"Lemon",h:"#FFEE33"},{c:"742",n:"Lt Tangerine",h:"#FFBB44"},
  {c:"740",n:"Tangerine",h:"#FF8800"},{c:"608",n:"Bright Orange",h:"#FF6622"},
  {c:"946",n:"Burnt Orange",h:"#DD5500"},{c:"700",n:"Bright Green",h:"#22AA22"},
  {c:"699",n:"Xmas Green",h:"#006622"},{c:"702",n:"Kelly Green",h:"#44BB33"},
  {c:"704",n:"Chartreuse",h:"#88CC22"},{c:"906",n:"Parrot Green",h:"#55BB00"},
  {c:"3346",n:"Hunter Green",h:"#447733"},{c:"895",n:"Dark Green",h:"#335522"},
  {c:"3813",n:"Sage",h:"#99BB99"},{c:"503",n:"Blue Green",h:"#7BAA9E"},
  {c:"797",n:"Royal Blue",h:"#2244BB"},{c:"796",n:"Dk Royal",h:"#112288"},
  {c:"799",n:"Med Delft",h:"#5577CC"},{c:"809",n:"Delft Blue",h:"#7799DD"},
  {c:"3755",n:"Baby Blue",h:"#99BBEE"},{c:"820",n:"V Dk Blue",h:"#0F1580"},
  {c:"550",n:"V Dk Violet",h:"#551177"},{c:"552",n:"Med Violet",h:"#8833AA"},
  {c:"554",n:"Lt Violet",h:"#BB77CC"},{c:"718",n:"Plum",h:"#CC2288"},
  {c:"961",n:"Dusty Rose",h:"#CC6688"},{c:"3716",n:"Pink Lt",h:"#EEAABB"},
  {c:"818",n:"Baby Pink",h:"#FFCCDD"},{c:"842",n:"Beige",h:"#CCBB99"},
  {c:"841",n:"Beige Brown",h:"#AA9977"},{c:"838",n:"Dk Beige Brn",h:"#665533"},
  {c:"801",n:"Coffee Brown",h:"#553311"},{c:"433",n:"Med Brown",h:"#774422"},
  {c:"435",n:"V Lt Brown",h:"#996633"},{c:"437",n:"Lt Tan",h:"#BB8844"},
  {c:"738",n:"V Lt Tan",h:"#DDBB88"},{c:"948",n:"Peach",h:"#FEDDCC"},
  {c:"754",n:"Lt Peach",h:"#EEBBAA"},{c:"414",n:"Steel Grey",h:"#888888"},
  {c:"318",n:"Lt Steel",h:"#AAAAAA"},{c:"415",n:"Pearl Grey",h:"#CCCCCC"},
  {c:"535",n:"Ash Grey",h:"#666666"},{c:"3799",n:"Pewter",h:"#444444"},
];

const hex2rgb=h=>[parseInt(h.slice(1,3),16),parseInt(h.slice(3,5),16),parseInt(h.slice(5,7),16)];
const EMB_COLORS_LAB=EMB_COLORS.map(c=>{const[cr,cg,cb]=hex2rgb(c.h);return{...c,lab:rgb2lab(cr,cg,cb)};});
function closestDMC(r,g,b){const[L,a,bv]=rgb2lab(r,g,b);let best=EMB_COLORS_LAB[0],bd=1e9;for(const c of EMB_COLORS_LAB){const d=(L-c.lab[0])**2+(a-c.lab[1])**2+(bv-c.lab[2])**2;if(d<bd){bd=d;best=c;}}return{c:best.c,n:best.n,h:best.h};}
function suggestStitch(a){if(a<500)return"frenchknot";if(a<2500)return"satin";if(a<8000)return"longshort";return"chainstitch";}
function ptIn(pts,px,py){let ins=false;for(let i=0,j=pts.length-1;i<pts.length;j=i++){const[xi,yi]=pts[i],[xj,yj]=pts[j];if((yi>py)!==(yj>py)&&px<(xj-xi)*(py-yi)/(yj-yi)+xi)ins=!ins;}return ins;}
function pArea(pts){let a=0;for(let i=0,j=pts.length-1;i<pts.length;j=i++)a+=(pts[j][0]+pts[i][0])*(pts[j][1]-pts[i][1]);return Math.abs(a/2);}
function pBounds(pts){let x0=1e9,y0=1e9,x1=-1e9,y1=-1e9;for(const[x,y]of pts){x0=Math.min(x0,x);y0=Math.min(y0,y);x1=Math.max(x1,x);y1=Math.max(y1,y);}return{x:x0,y:y0,w:x1-x0,h:y1-y0};}
function distToSeg(px,py,ax,ay,bx,by){const dx=bx-ax,dy=by-ay,l2=dx*dx+dy*dy;if(l2===0)return Math.sqrt((px-ax)**2+(py-ay)**2);let t=((px-ax)*dx+(py-ay)*dy)/l2;t=Math.max(0,Math.min(1,t));return Math.sqrt((px-(ax+t*dx))**2+(py-(ay+t*dy))**2);}

function catmull(pts,segs=4){if(pts.length<4)return pts;const out=[],n=pts.length;for(let i=0;i<n;i++){const p0=pts[(i-1+n)%n],p1=pts[i],p2=pts[(i+1)%n],p3=pts[(i+2)%n];for(let t=0;t<segs;t++){const f=t/segs,f2=f*f,f3=f2*f;out.push([.5*(2*p1[0]+(-p0[0]+p2[0])*f+(2*p0[0]-5*p1[0]+4*p2[0]-p3[0])*f2+(-p0[0]+3*p1[0]-3*p2[0]+p3[0])*f3),.5*(2*p1[1]+(-p0[1]+p2[1])*f+(2*p0[1]-5*p1[1]+4*p2[1]-p3[1])*f2+(-p0[1]+3*p1[1]-3*p2[1]+p3[1])*f3)]);}}out.push(out[0].slice());return out;}
function simplify(pts,tol){if(pts.length<3)return pts;const o=[pts[0]];for(let i=1;i<pts.length;i++){const[lx,ly]=o[o.length-1];if((pts[i][0]-lx)**2+(pts[i][1]-ly)**2>tol*tol)o.push(pts[i]);}return o;}

// Rebuild smooth curve from control nodes
function buildCurve(nodes){if(nodes.length<3)return nodes.slice();return catmull(nodes,6);}

function kMeans(data,w,h,k,iters=15){const N=w*h,valid=[];for(let i=0;i<N;i++)if(data[i*4+3]>30)valid.push(i);if(!valid.length)return{labels:new Int32Array(N).fill(-1),centroids:[]};const centroids=[];let first=valid[Math.floor(Math.random()*valid.length)];centroids.push([data[first*4],data[first*4+1],data[first*4+2]]);for(let c=1;c<k;c++){const step=Math.max(1,Math.floor(valid.length/2000));let tD=0;const ds=[];for(let s=0;s<valid.length;s+=step){const idx=valid[s]*4;let mD=1e9;for(const ct of centroids){const d=(data[idx]-ct[0])**2+(data[idx+1]-ct[1])**2+(data[idx+2]-ct[2])**2;if(d<mD)mD=d;}ds.push({i:valid[s],d:mD});tD+=mD;}let r=Math.random()*tD,pick=ds[0].i;for(const{i:ii,d}of ds){r-=d;if(r<=0){pick=ii;break;}}centroids.push([data[pick*4],data[pick*4+1],data[pick*4+2]]);}const labels=new Int32Array(N).fill(-1);for(let iter=0;iter<iters;iter++){for(let i=0;i<N;i++){const idx=i*4;if(data[idx+3]<=30){labels[i]=-1;continue;}let best=0,bd=1e9;for(let c=0;c<k;c++){const d=(data[idx]-centroids[c][0])**2+(data[idx+1]-centroids[c][1])**2+(data[idx+2]-centroids[c][2])**2;if(d<bd){bd=d;best=c;}}labels[i]=best;}const sums=Array.from({length:k},()=>[0,0,0,0]);for(let i=0;i<N;i++){if(labels[i]<0)continue;const idx=i*4,l=labels[i];sums[l][0]+=data[idx];sums[l][1]+=data[idx+1];sums[l][2]+=data[idx+2];sums[l][3]++;}let conv=true;for(let c=0;c<k;c++){if(!sums[c][3])continue;const nr=sums[c][0]/sums[c][3],ng=sums[c][1]/sums[c][3],nb=sums[c][2]/sums[c][3];if(Math.abs(nr-centroids[c][0])>.5)conv=false;centroids[c]=[nr,ng,nb];}if(conv)break;}return{labels,centroids};}
function extractBoundary(mask,w,h){const b=[];for(let y=0;y<h;y++)for(let x=0;x<w;x++){if(!mask[y*w+x])continue;if(x===0||!mask[y*w+x-1]||x===w-1||!mask[y*w+x+1]||y===0||!mask[(y-1)*w+x]||y===h-1||!mask[(y+1)*w+x])b.push([x,y]);}return b;}
function traceContour(mask,w,h){const out=[];let sx=-1,sy=-1;outer:for(let y=0;y<h;y++)for(let x=0;x<w;x++)if(mask[y*w+x]){sx=x;sy=y;break outer;}if(sx<0)return out;const dirs=[[-1,0],[-1,-1],[0,-1],[1,-1],[1,0],[1,1],[0,1],[-1,1]];let cx=sx,cy=sy,cd=0;const mk=new Uint8Array(w*h);do{out.push([cx,cy]);mk[cy*w+cx]=1;let found=false;const start=(cd+5)%8;for(let s=0;s<8;s++){const d=(start+s)%8,[dx,dy]=dirs[d],nx=cx+dx,ny=cy+dy;if(nx>=0&&nx<w&&ny>=0&&ny<h&&mask[ny*w+nx]){cx=nx;cy=ny;cd=d;found=true;break;}}if(!found)break;}while(cx!==sx||cy!==sy);if(out.length>2)out.push(out[0].slice());return out;}
function orderBoundary(pts){return pts;}
function downsample(pts,n){if(pts.length<=n)return pts;const al=[0];for(let i=1;i<pts.length;i++)al.push(al[i-1]+Math.sqrt((pts[i][0]-pts[i-1][0])**2+(pts[i][1]-pts[i-1][1])**2));const tot=al[al.length-1];if(tot<1)return pts.slice(0,n);const step=tot/n;const out=[pts[0]];let nd=step;for(let i=1;i<pts.length&&out.length<n;i++)while(al[i]>=nd&&out.length<n){const sl=al[i]-al[i-1],t=sl>0?(nd-al[i-1])/sl:0;out.push([pts[i-1][0]+t*(pts[i][0]-pts[i-1][0]),pts[i-1][1]+t*(pts[i][1]-pts[i-1][1])]);nd+=step;}return out;}

// Convert smooth points back to ~N control nodes
function pointsToNodes(pts, targetN) {
  const n = Math.max(4, Math.min(targetN, pts.length));
  return downsample(pts, n).map(p => [Math.round(p[0]*10)/10, Math.round(p[1]*10)/10]);
}

// ============================================================
// SLIC Superpixel Segmentation
// ============================================================

function rgb2lab(r,g,b){let R=r/255,G=g/255,B=b/255;R=R>.04045?((R+.055)/1.055)**2.4:R/12.92;G=G>.04045?((G+.055)/1.055)**2.4:G/12.92;B=B>.04045?((B+.055)/1.055)**2.4:B/12.92;let X=(R*.4124+G*.3576+B*.1805)/.95047,Y=R*.2126+G*.7152+B*.0722,Z=(R*.0193+G*.1192+B*.9505)/1.08883;const f=t=>t>.008856?Math.cbrt(t):7.787*t+16/116;return[116*f(Y)-16,500*(f(X)-f(Y)),200*(f(Y)-f(Z))];}
function lab2rgb(L,a,b){const fy=(L+16)/116,fx=a/500+fy,fz=fy-b/200;const f=t=>t>.20690?t*t*t:(t-16/116)/7.787;let X=f(fx)*.95047,Y=f(fy),Z=f(fz)*1.08883;let R=X*3.2406+Y*-1.5372+Z*-.4986,G=X*-.9689+Y*1.8758+Z*.0415,Bv=X*.0557+Y*-.2040+Z*1.0570;const gm=c=>Math.max(0,Math.min(255,Math.round((c>.0031308?1.055*c**(1/2.4)-.055:12.92*c)*255)));return[gm(R),gm(G),gm(Bv)];}

function slicSegment(data,w,h,k,compactness,iters){
  const N=w*h,labL=new Float32Array(N),labA=new Float32Array(N),labBv=new Float32Array(N);
  for(let i=0;i<N;i++){const idx=i*4;if(data[idx+3]<=30){labL[i]=-1;continue;}const[lv,av,bv]=rgb2lab(data[idx],data[idx+1],data[idx+2]);labL[i]=lv;labA[i]=av;labBv[i]=bv;}
  // Grid init — nudge centres to lowest gradient in 3×3 neighbourhood
  const S=Math.sqrt(N/k),rows=Math.ceil(h/S),cols=Math.ceil(w/S),centres=[];
  for(let gy=0;gy<rows&&centres.length<k;gy++)for(let gx=0;gx<cols&&centres.length<k;gx++){
    let cx=Math.min(w-1,Math.round((gx+.5)*S)),cy=Math.min(h-1,Math.round((gy+.5)*S)),bestG=1e9;
    for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++){const nx=cx+dx,ny=cy+dy;if(nx<1||nx>=w-1||ny<1||ny>=h-1)continue;const pi=ny*w+nx;if(labL[pi]<0)continue;const g=(labL[pi+1]-labL[pi-1])**2+(labL[(ny+1)*w+nx]-labL[(ny-1)*w+nx])**2;if(g<bestG){bestG=g;cx=nx;cy=ny;}}
    const ci=cy*w+cx;if(labL[ci]<0)continue;centres.push([labL[ci],labA[ci],labBv[ci],cx,cy]);
  }
  const nC=centres.length,labels=new Int32Array(N).fill(-1),dist=new Float32Array(N),m=compactness,S2=S*S;
  // SLIC assignment / update iterations
  for(let iter=0;iter<iters;iter++){
    dist.fill(1e9);
    for(let ci=0;ci<nC;ci++){
      const[cL,cA,cB,cx,cy]=centres[ci],r=Math.ceil(2*S)|0;
      const x0=Math.max(0,cx-r|0),x1=Math.min(w-1,cx+r|0),y0=Math.max(0,cy-r|0),y1=Math.min(h-1,cy+r|0);
      for(let y=y0;y<=y1;y++)for(let x=x0;x<=x1;x++){const pi=y*w+x;if(labL[pi]<0)continue;const D=(labL[pi]-cL)**2+(labA[pi]-cA)**2+(labBv[pi]-cB)**2+((x-cx)**2+(y-cy)**2)/S2*m*m;if(D<dist[pi]){dist[pi]=D;labels[pi]=ci;}}
    }
    const sL=new Float64Array(nC),sA=new Float64Array(nC),sB=new Float64Array(nC),sX=new Float64Array(nC),sY=new Float64Array(nC),cnt=new Int32Array(nC);
    for(let i=0;i<N;i++){const c=labels[i];if(c<0)continue;sL[c]+=labL[i];sA[c]+=labA[i];sB[c]+=labBv[i];sX[c]+=i%w;sY[c]+=(i/w)|0;cnt[c]++;}
    for(let ci=0;ci<nC;ci++){if(!cnt[ci])continue;centres[ci]=[sL[ci]/cnt[ci],sA[ci]/cnt[ci],sB[ci]/cnt[ci],sX[ci]/cnt[ci],sY[ci]/cnt[ci]];}
  }
  // Enforce connectivity: BFS from each centre, then spread labels to orphans
  const connected=new Uint8Array(N),reachQ=[];
  for(let ci=0;ci<nC;ci++){const cx=Math.round(centres[ci][3]),cy=Math.round(centres[ci][4]),seed=cy*w+cx;if(seed<0||seed>=N||labels[seed]!==ci)continue;connected[seed]=1;reachQ.push(seed);}
  for(let head=0;head<reachQ.length;head++){const p=reachQ[head],px=p%w,py=(p/w)|0;for(const[dx,dy]of[[1,0],[-1,0],[0,1],[0,-1]]){const nx=px+dx,ny=py+dy;if(nx<0||nx>=w||ny<0||ny>=h)continue;const ni=ny*w+nx;if(!connected[ni]&&labels[ni]===labels[p]){connected[ni]=1;reachQ.push(ni);}}}
  const spreadQ=[];
  for(let i=0;i<N;i++){if(labels[i]>=0&&!connected[i])labels[i]=-2;else if(connected[i])spreadQ.push(i);}
  for(let head=0;head<spreadQ.length;head++){const p=spreadQ[head],px=p%w,py=(p/w)|0;for(const[dx,dy]of[[1,0],[-1,0],[0,1],[0,-1]]){const nx=px+dx,ny=py+dy;if(nx<0||nx>=w||ny<0||ny>=h)continue;const ni=ny*w+nx;if(labels[ni]===-2&&labL[ni]>=0){labels[ni]=labels[p];spreadQ.push(ni);}}}
  return{labels,labL,labA,labBv,nC};
}

function mergeSuperpixels(labels,labL,labA,labBv,pw,ph,nSP,targetK,origData,oCW,oCH,scaledData,edgeW=0.3){
  const PN=pw*ph,spL=new Float64Array(nSP),spA=new Float64Array(nSP),spBv=new Float64Array(nSP),spCnt=new Int32Array(nSP);
  // Compute LAB-based Sobel edge magnitudes for border penalty
  const eMag=scaledData?sobelMag(scaledData,pw,ph):null;
  for(let i=0;i<PN;i++){const l=labels[i];if(l<0||l>=nSP)continue;spL[l]+=labL[i];spA[l]+=labA[i];spBv[l]+=labBv[i];spCnt[l]++;}
  for(let s=0;s<nSP;s++)if(spCnt[s]){spL[s]/=spCnt[s];spA[s]/=spCnt[s];spBv[s]/=spCnt[s];}
  // Union-find
  const parent=new Int32Array(nSP);for(let s=0;s<nSP;s++)parent[s]=s;
  const find=x=>{while(parent[x]!==x){parent[x]=parent[parent[x]];x=parent[x];}return x;};
  const clL=Array.from(spL),clA=Array.from(spA),clBv=Array.from(spBv),clCnt=Array.from(spCnt);
  // Build adjacency with Sobel edge stats — store per-pair edge data persistently
  const adjRaw=new Map();
  for(let y=0;y<ph;y++)for(let x=0;x<pw;x++){const i=y*pw+x,li=labels[i];if(li<0)continue;const addEdge=(oi)=>{const lo=labels[oi];if(lo>=0&&lo!==li){const a=Math.min(li,lo),b=Math.max(li,lo),key=a*nSP+b;if(!adjRaw.has(key))adjRaw.set(key,{a,b,eSum:0,eCnt:0});if(eMag){const e=adjRaw.get(key);e.eSum+=eMag[i]+eMag[oi];e.eCnt+=2;}}};if(x<pw-1)addEdge(i+1);if(y<ph-1)addEdge(i+pw);}
  // Persistent edge penalty map keyed by (min,max) of root pair
  const edgeKey=(a,b)=>Math.min(a,b)*nSP+Math.max(a,b);
  const edgePenalty=new Map();
  for(const[,e]of adjRaw){if(!spCnt[e.a]||!spCnt[e.b])continue;const ep=e.eCnt>0?(e.eSum/e.eCnt)*edgeW:0;edgePenalty.set(edgeKey(e.a,e.b),ep*ep);}
  // Build initial adjacency list
  const mergeCost=(a,b)=>{const cd=(clL[a]-clL[b])**2+(clA[a]-clA[b])**2+(clBv[a]-clBv[b])**2;const ep=edgePenalty.get(edgeKey(a,b))||0;return cd+ep;};
  let adjList=[];
  for(const[,e]of adjRaw){if(!spCnt[e.a]||!spCnt[e.b])continue;adjList.push({d:mergeCost(e.a,e.b),a:e.a,b:e.b});}
  adjList.sort((x,y)=>x.d-y.d);
  let nClusters=0;for(let s=0;s<nSP;s++)if(spCnt[s])nClusters++;
  // Agglomerative merge until targetK clusters remain
  // Adaptive stopping: halt early when cheapest merge exceeds perceptual significance
  const MERGE_COST_THRESH=200; // ~deltaE≈14 — clearly distinct colours
  while(nClusters>targetK&&adjList.length){
    let fi=-1;for(let i=0;i<adjList.length;i++){if(find(adjList[i].a)!==find(adjList[i].b)){fi=i;break;}}
    if(fi<0)break;
    if(adjList[fi].d>MERGE_COST_THRESH)break; // adaptive: stop merging distinct regions
    const{a,b}=adjList[fi],ra=find(a),rb=find(b),tc=clCnt[ra]+clCnt[rb];
    clL[ra]=(clL[ra]*clCnt[ra]+clL[rb]*clCnt[rb])/tc;clA[ra]=(clA[ra]*clCnt[ra]+clA[rb]*clCnt[rb])/tc;clBv[ra]=(clBv[ra]*clCnt[ra]+clBv[rb]*clCnt[rb])/tc;
    clCnt[ra]=tc;parent[rb]=ra;nClusters--;
    // Collect neighbours, propagate edge penalty from rb's edges to ra's edges
    const newN=new Set();
    for(let i=0;i<adjList.length;i++){const e=adjList[i],fa=find(e.a),fb=find(e.b);if(fa===ra||fb===ra){if(fa!==fb){const nc=fa===ra?fb:fa;newN.add(nc);
      // Merge edge penalties: take max of (ra,nc) and (rb,nc)
      const kNew=edgeKey(ra,nc),kOld=edgePenalty.get(edgeKey(rb,nc));if(kOld!==undefined){const existing=edgePenalty.get(kNew)||0;edgePenalty.set(kNew,Math.max(existing,kOld));}}e.d=Infinity;}}
    for(const nc of newN){if(!clCnt[nc])continue;adjList.push({d:mergeCost(ra,nc),a:ra,b:nc});}
    if(adjList.filter(e=>e.d===Infinity).length>adjList.length>>1)adjList=adjList.filter(e=>e.d<Infinity);
    adjList.sort((x,y)=>x.d-y.d);
  }
  // Remap to contiguous IDs, sample avg RGB from original image
  const invSc=oCW/pw,clusterMap=new Map();let nextCId=0;
  const mergedLabels=new Int32Array(PN).fill(-1);
  for(let i=0;i<PN;i++){const l=labels[i];if(l<0)continue;const r=find(l);if(!clusterMap.has(r))clusterMap.set(r,{id:nextCId++,sr:0,sg:0,sb:0,cnt:0,lab:[clL[r],clA[r],clBv[r]]});const cl=clusterMap.get(r);mergedLabels[i]=cl.id;const ox=Math.min(oCW-1,Math.round((i%pw)*invSc)),oy=Math.min(oCH-1,Math.round(((i/pw)|0)*invSc)),oidx=(oy*oCW+ox)*4;if(origData[oidx+3]>30){cl.sr+=origData[oidx];cl.sg+=origData[oidx+1];cl.sb+=origData[oidx+2];cl.cnt++;}}
  const avgColors=new Array(nextCId);
  for(const cl of clusterMap.values())avgColors[cl.id]=cl.cnt?[Math.round(cl.sr/cl.cnt),Math.round(cl.sg/cl.cnt),Math.round(cl.sb/cl.cnt)]:lab2rgb(...cl.lab);
  return{mergedLabels,nMerged:nextCId,avgColors};
}

// ============================================================
// Magic Wand Tool
// ============================================================

function sobelMag(data,w,h){
  const N=w*h,m=new Float32Array(N),lum=new Float32Array(N);
  for(let i=0;i<N;i++){const idx=i*4;lum[i]=0.2126*data[idx]+0.7152*data[idx+1]+0.0722*data[idx+2];}
  // 3×3 Sobel
  for(let y=1;y<h-1;y++)for(let x=1;x<w-1;x++){
    const p=(dx,dy)=>lum[(y+dy)*w+(x+dx)];
    const gx=-p(-1,-1)-2*p(-1,0)-p(-1,1)+p(1,-1)+2*p(1,0)+p(1,1);
    const gy=-p(-1,-1)-2*p(0,-1)-p(1,-1)+p(-1,1)+2*p(0,1)+p(1,1);
    m[y*w+x]=Math.sqrt(gx*gx+gy*gy);
  }
  // 5×5 extended Sobel — catches softer/wider edges, take max with 3×3
  for(let y=2;y<h-2;y++)for(let x=2;x<w-2;x++){
    const p=(dx,dy)=>lum[(y+dy)*w+(x+dx)];
    const gx5=-p(-2,-2)-2*p(-1,-2)+2*p(1,-2)+p(2,-2)
             -4*p(-2,-1)-8*p(-1,-1)+8*p(1,-1)+4*p(2,-1)
             -6*p(-2,0)-12*p(-1,0)+12*p(1,0)+6*p(2,0)
             -4*p(-2,1)-8*p(-1,1)+8*p(1,1)+4*p(2,1)
             -p(-2,2)-2*p(-1,2)+2*p(1,2)+p(2,2);
    const gy5=-p(-2,-2)-4*p(-1,-2)-6*p(0,-2)-4*p(1,-2)-p(2,-2)
             -2*p(-2,-1)-8*p(-1,-1)-12*p(0,-1)-8*p(1,-1)-2*p(2,-1)
             +2*p(-2,1)+8*p(-1,1)+12*p(0,1)+8*p(1,1)+2*p(2,1)
             +p(-2,2)+4*p(-1,2)+6*p(0,2)+4*p(1,2)+p(2,2);
    const mag5=Math.sqrt(gx5*gx5+gy5*gy5)/4; // normalize to 3×3 scale
    if(mag5>m[y*w+x])m[y*w+x]=mag5;
  }
  return m;
}

// LAB-based Sobel edge magnitude — detects edges in perceptual colour space
function sobelMagLAB(labL,labA,labB,w,h){
  const m=new Float32Array(w*h);
  for(let y=1;y<h-1;y++)for(let x=1;x<w-1;x++){
    const g=(arr)=>{
      const tl=arr[(y-1)*w+(x-1)],tc=arr[(y-1)*w+x],tr=arr[(y-1)*w+(x+1)];
      const ml=arr[y*w+(x-1)],mr=arr[y*w+(x+1)];
      const bl=arr[(y+1)*w+(x-1)],bc=arr[(y+1)*w+x],br=arr[(y+1)*w+(x+1)];
      const gx=-tl-2*ml-bl+tr+2*mr+br, gy=-tl-2*tc-tr+bl+2*bc+br;
      return gx*gx+gy*gy;
    };
    m[y*w+x]=Math.sqrt(g(labL)+g(labA)+g(labB));
  }
  return m;
}

function magicWandFill(imageData,seedX,seedY,tolerance,useEdgeSnap,edgeFactor,occupiedMask){
  const{data,width:w,height:h}=imageData,N=w*h;
  // LAB threshold: tolerance 0-100 maps to deltaE 0-80 (perceptual range)
  const thresh=tolerance*0.8,maxDrift=thresh*1.5;
  // Pre-compute LAB for all pixels
  const pL=new Float32Array(N),pA=new Float32Array(N),pB=new Float32Array(N);
  for(let i=0;i<N;i++){const idx=i*4;if(data[idx+3]<=30){pL[i]=-1;continue;}const[l,a,b]=rgb2lab(data[idx],data[idx+1],data[idx+2]);pL[i]=l;pA[i]=a;pB[i]=b;}
  // Seed colour: average LAB in 3×3 neighbourhood
  let sL=0,sA=0,sB=0,sc=0;
  for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++){
    const nx=seedX+dx,ny=seedY+dy;if(nx<0||nx>=w||ny<0||ny>=h)continue;
    const ni=ny*w+nx;if(pL[ni]<0)continue;sL+=pL[ni];sA+=pA[ni];sB+=pB[ni];sc++;
  }
  if(!sc)return new Uint8Array(N);sL/=sc;sA/=sc;sB/=sc;
  // Edge map for snap
  const edgeMag=useEdgeSnap?sobelMagLAB(pL,pA,pB,w,h):null;
  const mask=new Uint8Array(N),visited=new Uint8Array(N),queue=new Int32Array(N);
  let head=0,tail=0;const seed=seedY*w+seedX;
  if(seed<0||seed>=N||pL[seed]<0||occupiedMask[seed])return mask;
  visited[seed]=1;queue[tail++]=seed;
  // Running average in LAB
  let sumL=sL,sumA2=sA,sumB2=sB,cnt=1;
  while(head<tail){
    const p=queue[head++],px=p%w,py=(p/w)|0;mask[p]=1;
    for(const[ddx,ddy]of[[1,0],[-1,0],[0,1],[0,-1]]){
      const nx=px+ddx,ny=py+ddy;if(nx<0||nx>=w||ny<0||ny>=h)continue;
      const ni=ny*w+nx;if(visited[ni]||occupiedMask[ni]||pL[ni]<0)continue;visited[ni]=1;
      // DeltaE from seed
      const dSeed=Math.sqrt((pL[ni]-sL)**2+(pA[ni]-sA)**2+(pB[ni]-sB)**2);
      // DeltaE from running average with drift cap
      const aL=sumL/cnt,aA2=sumA2/cnt,aB2=sumB2/cnt;
      const avgDrift=Math.sqrt((aL-sL)**2+(aA2-sA)**2+(aB2-sB)**2);
      const dAvg=avgDrift<maxDrift?Math.sqrt((pL[ni]-aL)**2+(pA[ni]-aA2)**2+(pB[ni]-aB2)**2):Infinity;
      let et=thresh;
      if(useEdgeSnap&&edgeMag){const eStr=Math.min(1,edgeMag[ni]/200);et=thresh/(1+eStr*edgeFactor);}
      if(Math.min(dSeed,dAvg)<et){sumL+=pL[ni];sumA2+=pA[ni];sumB2+=pB[ni];cnt++;queue[tail++]=ni;}
    }
  }
  // Hole exclusion: flood-fill exterior from image border, then remove interior holes from mask
  const ext=new Uint8Array(N),eq=new Int32Array(N);let eh=0,et2=0;
  for(let x=0;x<w;x++){if(!mask[x]&&!ext[x]){ext[x]=1;eq[et2++]=x;}if(!mask[(h-1)*w+x]&&!ext[(h-1)*w+x]){ext[(h-1)*w+x]=1;eq[et2++]=(h-1)*w+x;}}
  for(let y=0;y<h;y++){if(!mask[y*w]&&!ext[y*w]){ext[y*w]=1;eq[et2++]=y*w;}if(!mask[y*w+w-1]&&!ext[y*w+w-1]){ext[y*w+w-1]=1;eq[et2++]=y*w+w-1;}}
  while(eh<et2){const p=eq[eh++],px=p%w,py=(p/w)|0;for(const[ddx,ddy]of[[1,0],[-1,0],[0,1],[0,-1]]){const nx2=px+ddx,ny2=py+ddy;if(nx2<0||nx2>=w||ny2<0||ny2>=h)continue;const ni2=ny2*w+nx2;if(!ext[ni2]&&!mask[ni2]){ext[ni2]=1;eq[et2++]=ni2;}}}
  for(let i=0;i<N;i++)if(!mask[i]&&!ext[i])mask[i]=1;
  return mask;}

function autoSegment(imageData,numColors,compactness=10){
  const data=imageData.data;
  // compactness: 1=high edge sensitivity, 20=low edge sensitivity
  // Derive stable SLIC compactness — values below 8 cause degenerate non-spatial clustering
  const slicM=Math.max(8,compactness+5);
  // Derive edge penalty weight for merge (high sens → strong edge preservation, low sens → free merge)
  const edgeW=(21-compactness)/40; // range 0.025 (low sens) to 0.5 (high sens)
  // Downscale to max 300px for processing (higher res = better detail)
  const PROC_MAX=300,scale=Math.min(1,PROC_MAX/Math.max(CW,CH));
  const pw=Math.max(2,Math.round(CW*scale)),ph=Math.max(2,Math.round(CH*scale));
  const tmpC=document.createElement('canvas');tmpC.width=CW;tmpC.height=CH;tmpC.getContext('2d').putImageData(imageData,0,0);
  const scC=document.createElement('canvas');scC.width=pw;scC.height=ph;scC.getContext('2d').drawImage(tmpC,0,0,CW,CH,0,0,pw,ph);
  const scaledD=scC.getContext('2d').getImageData(0,0,pw,ph);
  // Bilateral filter: edge-preserving smooth — reduces noise while keeping colour boundaries sharp
  const sd=scaledD.data,smoothed=new Uint8ClampedArray(sd.length);
  const bSigS=2,bSigC=25,bR=2,bSigS2=2*bSigS*bSigS,bSigC2=2*bSigC*bSigC;
  for(let y=0;y<ph;y++)for(let x=0;x<pw;x++){
    let sr=0,sg=0,sb=0,sa=0,wSum=0;const ci=(y*pw+x)*4;
    for(let ky=-bR;ky<=bR;ky++)for(let kx=-bR;kx<=bR;kx++){
      const ny=Math.max(0,Math.min(ph-1,y+ky)),nx=Math.max(0,Math.min(pw-1,x+kx)),ni=(ny*pw+nx)*4;
      const cD=(sd[ci]-sd[ni])**2+(sd[ci+1]-sd[ni+1])**2+(sd[ci+2]-sd[ni+2])**2;
      const wt=Math.exp(-(kx*kx+ky*ky)/bSigS2-cD/bSigC2);
      sr+=sd[ni]*wt;sg+=sd[ni+1]*wt;sb+=sd[ni+2]*wt;sa+=sd[ni+3]*wt;wSum+=wt;
    }const oi=(y*pw+x)*4;smoothed[oi]=sr/wSum;smoothed[oi+1]=sg/wSum;smoothed[oi+2]=sb/wSum;smoothed[oi+3]=sa/wSum;}
  // SLIC superpixel segmentation + agglomerative merge (on smoothed data)
  // More superpixels at higher sensitivity for finer initial clustering
  const nSP=Math.max(numColors,Math.min(Math.floor(numColors*25*(1+edgeW)),Math.floor(pw*ph/4)));
  const{labels:spLabels,labL,labA,labBv,nC}=slicSegment(smoothed,pw,ph,nSP,slicM,10);
  const{mergedLabels,avgColors}=mergeSuperpixels(spLabels,labL,labA,labBv,pw,ph,nC,numColors,data,CW,CH,smoothed,edgeW);
  // Connected components on merged label map
  const PN=pw*ph,visited=new Uint8Array(PN),minSize=Math.max(6,Math.floor(PN/400)),components=[];
  for(let i=0;i<PN;i++){
    if(visited[i]||mergedLabels[i]<0)continue;
    const col=mergedLabels[i],stack=[i];visited[i]=1;const pix=[];
    while(stack.length){const p=stack.pop();pix.push(p);const px=p%pw,py=(p/pw)|0;for(const[dx,dy]of[[1,0],[-1,0],[0,1],[0,-1]]){const nx=px+dx,ny=py+dy;if(nx>=0&&nx<pw&&ny>=0&&ny<ph){const ni=ny*pw+nx;if(!visited[ni]&&mergedLabels[ni]===col){visited[ni]=1;stack.push(ni);}}}}
    if(pix.length>=minSize)components.push({pixels:pix,col:avgColors[col]||[180,180,180],size:pix.length});
  }
  components.sort((a,b)=>b.size-a.size);
  // Skip background: largest component only if it covers >50% of image
  const bgT=PN*0.5,invSc=CW/pw,regions=[];
  for(const comp of components){
    if(comp.size>bgT&&!regions.length)continue;
    const mask=new Uint8Array(PN);for(const p of comp.pixels)mask[p]=1;
    // Morphological opening: erode then dilate to remove thin noise spurs
    const eroded=new Uint8Array(PN);
    for(let y=1;y<ph-1;y++)for(let x=1;x<pw-1;x++){if(mask[y*pw+x]&&mask[(y-1)*pw+x]&&mask[(y+1)*pw+x]&&mask[y*pw+x-1]&&mask[y*pw+x+1])eroded[y*pw+x]=1;}
    const opened=new Uint8Array(PN);
    for(let y=0;y<ph;y++)for(let x=0;x<pw;x++){if(eroded[y*pw+x]){opened[y*pw+x]=1;continue;}let hit=false;for(let dy=-1;dy<=1&&!hit;dy++)for(let dx=-1;dx<=1&&!hit;dx++){const ny=y+dy,nx=x+dx;if(ny>=0&&ny<ph&&nx>=0&&nx<pw&&eroded[ny*pw+nx])hit=true;}if(hit)opened[y*pw+x]=1;}
    // Fall back to original mask if opening erased too much (small regions)
    const useMask=opened.reduce((s,v)=>s+v,0)>=comp.pixels.length*0.3?opened:mask;
    const bMask=new Uint8Array(PN);for(let y=0;y<ph;y++)for(let x=0;x<pw;x++){if(!useMask[y*pw+x])continue;if(x===0||!useMask[y*pw+x-1]||x===pw-1||!useMask[y*pw+x+1]||y===0||!useMask[(y-1)*pw+x]||y===ph-1||!useMask[(y+1)*pw+x])bMask[y*pw+x]=1;}
    // Multi-contour: trace all boundary components, use the largest (outer contour)
    const tmpB=new Uint8Array(bMask);let bestContour=[];
    for(let scan=0;scan<PN;scan++){if(!tmpB[scan])continue;
      const c=traceContour(tmpB,pw,ph);for(const[cx,cy]of c)tmpB[cy*pw+cx]=0;
      if(c.length>bestContour.length)bestContour=c;if(!tmpB.some(v=>v))break;}
    const contour=bestContour;if(contour.length<6)continue;
    const tp=Math.min(80,Math.max(16,Math.floor(Math.sqrt(comp.size)/3)));
    const ds=downsample(contour,tp);if(ds.length<4)continue;
    let sm=catmull(ds,3);sm=simplify(sm,1.5);if(sm.length<4)continue;
    const sc=sm.map(([x,y])=>[x*invSc,y*invSc]);
    const dmc=closestDMC(...comp.col),area=pArea(sc),bounds=pBounds(sc);
    if(bounds.w<8||bounds.h<8)continue;
    const nodes=pointsToNodes(sc,Math.min(20,Math.max(6,Math.floor(Math.sqrt(comp.size*invSc*invSc)/8))));
    const curve=buildCurve(nodes);
    regions.push({id:0,label:"",nodes,points:curve,bounds:pBounds(curve),avgColor:comp.col,dmc,stitch:suggestStitch(area),direction:0,area:pArea(curve)});
  }
  return regions.slice(0,20).map((r,i)=>({...r,id:i+1,label:`Region ${i+1}`}));
}

function drawSampleFlower(ctx){ctx.fillStyle="#D4E8CB";ctx.fillRect(0,0,CW,CH);ctx.strokeStyle="#2D7A24";ctx.lineWidth=10;ctx.lineCap="round";ctx.beginPath();ctx.moveTo(200,190);ctx.bezierCurveTo(198,250,195,310,200,380);ctx.stroke();ctx.fillStyle="#3B8F30";ctx.beginPath();ctx.moveTo(194,265);ctx.bezierCurveTo(155,245,115,255,110,272);ctx.bezierCurveTo(115,290,155,282,192,275);ctx.closePath();ctx.fill();ctx.fillStyle="#4BA23E";ctx.beginPath();ctx.moveTo(206,305);ctx.bezierCurveTo(245,285,285,295,290,310);ctx.bezierCurveTo(285,325,245,318,208,312);ctx.closePath();ctx.fill();const petals=[{cx:200,cy:95,rx:44,ry:65,rot:-.2,col:"#D93B5B"},{cx:248,cy:125,rx:42,ry:60,rot:.55,col:"#E8506A"},{cx:152,cy:125,rx:42,ry:60,rot:-.55,col:"#C72E4E"},{cx:232,cy:168,rx:40,ry:56,rot:.95,col:"#F06888"},{cx:168,cy:168,rx:40,ry:56,rot:-.95,col:"#B52545"}];for(const p of petals){ctx.save();ctx.translate(p.cx,p.cy);ctx.rotate(p.rot);ctx.fillStyle=p.col;ctx.beginPath();ctx.ellipse(0,0,p.rx,p.ry,0,0,Math.PI*2);ctx.fill();ctx.restore();}ctx.fillStyle="#F5C622";ctx.beginPath();ctx.arc(200,150,28,0,Math.PI*2);ctx.fill();ctx.fillStyle="#D4A010";for(let i=0;i<14;i++){const a=(i/14)*Math.PI*2,r=8+(i%3)*5;ctx.beginPath();ctx.arc(200+Math.cos(a)*r,150+Math.sin(a)*r,2.5,0,Math.PI*2);ctx.fill();}}
function drawSampleButterfly(ctx){ctx.fillStyle="#EDE4D8";ctx.fillRect(0,0,CW,CH);ctx.fillStyle="#1E1208";ctx.beginPath();ctx.ellipse(200,205,9,58,0,0,Math.PI*2);ctx.fill();ctx.beginPath();ctx.arc(200,144,11,0,Math.PI*2);ctx.fill();ctx.strokeStyle="#1E1208";ctx.lineWidth=2.5;ctx.beginPath();ctx.moveTo(195,138);ctx.bezierCurveTo(178,108,168,96,162,90);ctx.stroke();ctx.beginPath();ctx.moveTo(205,138);ctx.bezierCurveTo(222,108,232,96,238,90);ctx.stroke();ctx.fillStyle="#1E1208";ctx.beginPath();ctx.arc(162,90,4,0,Math.PI*2);ctx.fill();ctx.beginPath();ctx.arc(238,90,4,0,Math.PI*2);ctx.fill();const uW=f=>{ctx.save();ctx.translate(200,178);if(f)ctx.scale(-1,1);ctx.fillStyle="#E06820";ctx.beginPath();ctx.moveTo(2,0);ctx.bezierCurveTo(42,-82,125,-92,150,-32);ctx.bezierCurveTo(155,-10,135,22,85,32);ctx.bezierCurveTo(42,38,12,16,2,0);ctx.closePath();ctx.fill();ctx.fillStyle="#F5A830";ctx.beginPath();ctx.moveTo(22,-10);ctx.bezierCurveTo(52,-58,95,-65,112,-28);ctx.bezierCurveTo(100,-4,62,12,28,6);ctx.closePath();ctx.fill();ctx.restore();};uW(false);uW(true);const lW=f=>{ctx.save();ctx.translate(200,205);if(f)ctx.scale(-1,1);ctx.fillStyle="#CC5515";ctx.beginPath();ctx.moveTo(2,6);ctx.bezierCurveTo(32,12,105,28,120,58);ctx.bezierCurveTo(115,85,72,90,42,74);ctx.bezierCurveTo(18,58,6,32,2,16);ctx.closePath();ctx.fill();ctx.fillStyle="#F0942C";ctx.beginPath();ctx.moveTo(22,22);ctx.bezierCurveTo(52,28,82,42,88,56);ctx.bezierCurveTo(78,66,48,62,28,48);ctx.closePath();ctx.fill();ctx.restore();};lW(false);lW(true);}

function renderStitch(ctx,pts,b,type,dir){ctx.save();ctx.beginPath();ctx.moveTo(pts[0][0],pts[0][1]);for(let i=1;i<pts.length;i++)ctx.lineTo(pts[i][0],pts[i][1]);ctx.closePath();ctx.clip();const cx=b.x+b.w/2,cy=b.y+b.h/2,rad=(dir||0)*Math.PI/180,cos=Math.cos(rad),sin=Math.sin(rad),dg=Math.sqrt(b.w**2+b.h**2)+20;if(type==="satin"){for(let i=-dg;i<dg;i+=3){ctx.strokeStyle=i%2===0?"rgba(255,255,255,0.2)":"rgba(0,0,0,0.12)";ctx.lineWidth=1;ctx.beginPath();ctx.moveTo(cx+i*cos-dg*sin,cy+i*sin+dg*cos);ctx.lineTo(cx+i*cos+dg*sin,cy+i*sin-dg*cos);ctx.stroke();}}else if(type==="longshort"){for(let i=-dg;i<dg;i+=5){ctx.strokeStyle=i%2===0?"rgba(255,255,255,0.18)":"rgba(0,0,0,0.1)";ctx.lineWidth=1;const len=dg*(.35+Math.abs((i*13)%7)/14);ctx.beginPath();ctx.moveTo(cx+i*cos-len*sin,cy+i*sin+len*cos);ctx.lineTo(cx+i*cos+len*sin,cy+i*sin-len*cos);ctx.stroke();}}else if(type==="frenchknot"){for(let px=b.x;px<b.x+b.w;px+=5)for(let py=b.y;py<b.y+b.h;py+=5){if(!ptIn(pts,px,py))continue;ctx.fillStyle="rgba(0,0,0,0.15)";ctx.beginPath();ctx.arc(px+Math.sin(px*7+py*11)*2,py+Math.cos(px*11+py*7)*2,1.8,0,Math.PI*2);ctx.fill();}}else if(type==="chainstitch"){ctx.lineWidth=.8;for(let i=-dg;i<dg;i+=12)for(let j=-dg;j<dg;j+=7){const px=cx+i*cos+j*sin,py=cy+i*sin-j*cos;if(!ptIn(pts,px,py))continue;ctx.strokeStyle="rgba(0,0,0,0.15)";ctx.beginPath();ctx.ellipse(px,py,2,3.5,rad,0,Math.PI*2);ctx.stroke();}}else if(type==="seedstitch"){ctx.lineWidth=1.2;for(let px=b.x;px<b.x+b.w;px+=6)for(let py=b.y;py<b.y+b.h;py+=6){if(!ptIn(pts,px,py))continue;const a=Math.sin(px*11+py*7)*Math.PI,l=1.5+Math.abs(Math.cos(px*3+py*9))*2;ctx.strokeStyle="rgba(0,0,0,0.15)";ctx.beginPath();ctx.moveTo(px-Math.cos(a)*l,py-Math.sin(a)*l);ctx.lineTo(px+Math.cos(a)*l,py+Math.sin(a)*l);ctx.stroke();}}else if(type==="stemstitch"){ctx.lineWidth=1.8;ctx.setLineDash([5,3]);ctx.strokeStyle="rgba(0,0,0,0.2)";for(let i=-dg;i<dg;i+=8){ctx.beginPath();ctx.moveTo(cx+i*cos-dg*sin,cy+i*sin+dg*cos);ctx.lineTo(cx+i*cos+dg*sin,cy+i*sin-dg*cos);ctx.stroke();}ctx.setLineDash([]);}ctx.restore();}
function renderArrow(ctx,b,dir){const len=Math.min(b.w,b.h)*.2;if(len<5)return;const cx=b.x+b.w/2,cy=b.y+b.h/2,rad=(dir||0)*Math.PI/180,cos=Math.cos(rad),sin=Math.sin(rad);ctx.save();ctx.strokeStyle="#fff";ctx.fillStyle="#fff";ctx.lineWidth=2.5;ctx.shadowColor="rgba(0,0,0,0.6)";ctx.shadowBlur=4;ctx.beginPath();ctx.moveTo(cx-cos*len,cy-sin*len);ctx.lineTo(cx+cos*len,cy+sin*len);ctx.stroke();const a=6;ctx.beginPath();ctx.moveTo(cx+cos*len,cy+sin*len);ctx.lineTo(cx+cos*len-cos*a-sin*a*.5,cy+sin*len-sin*a+cos*a*.5);ctx.lineTo(cx+cos*len-cos*a+sin*a*.5,cy+sin*len-sin*a-cos*a*.5);ctx.closePath();ctx.fill();ctx.restore();}

function getRecommendations(region, allRegions){const recs=[];const{stitch,area,bounds,direction}=region;const aspect=bounds.w>0&&bounds.h>0?Math.max(bounds.w,bounds.h)/Math.min(bounds.w,bounds.h):1;const isNarrow=aspect>4,isTiny=area<300,isSmall=area<800,isMedium=area>=800&&area<3000,isLarge=area>=3000,isVLarge=area>=6000;
  if(stitch==="satin"&&isLarge)recs.push({type:"warning",icon:"⚠️",msg:"Region may be too large for satin — threads can sag.",suggest:"Try Long & Short for better coverage.",fix:{stitch:"longshort"}});
  if(stitch==="frenchknot"&&isLarge)recs.push({type:"tip",icon:"💡",msg:"Large area for French knots — very time-consuming.",suggest:"Seed stitch gives similar texture with less effort.",fix:{stitch:"seedstitch"}});
  if(stitch==="longshort"&&isSmall)recs.push({type:"tip",icon:"💡",msg:"Small enough for clean satin stitch — smoother finish.",suggest:"Switch to Satin.",fix:{stitch:"satin"}});
  if(stitch==="stemstitch"&&isVLarge)recs.push({type:"warning",icon:"⚠️",msg:"Stem stitch is for outlines, not large fills.",suggest:"Use Chain stitch for a looped fill.",fix:{stitch:"chainstitch"}});
  if(isNarrow&&(stitch==="longshort"||stitch==="chainstitch"||stitch==="seedstitch"))recs.push({type:"tip",icon:"💡",msg:"Narrow shape — fill stitches may not read well.",suggest:"Stem stitch along the length works naturally.",fix:{stitch:"stemstitch",direction:bounds.w>bounds.h?0:90}});
  if(isTiny&&(stitch==="longshort"||stitch==="chainstitch"||stitch==="seedstitch"))recs.push({type:"tip",icon:"💡",msg:"Very small region — a few French knots may be enough.",suggest:"Switch to French Knots.",fix:{stitch:"frenchknot"}});
  if(stitch==="satin"&&isNarrow){const id=bounds.w>bounds.h?90:0;if(Math.abs(direction-id)>20&&Math.abs(direction-id-360)>20)recs.push({type:"tip",icon:"💡",msg:"Satin stitches look best across the narrow width.",suggest:`Try ${id}° for perpendicular stitches.`,fix:{direction:id}});}
  if(stitch==="satin"&&!isNarrow&&isMedium&&direction===0&&bounds.w!==bounds.h)recs.push({type:"tip",icon:"🧭",msg:"Default direction may not suit this shape. Try adjusting for a natural flow.",suggest:"Rotate to follow the shape.",fix:null});
  for(const other of allRegions){if(other.id===region.id)continue;const gap=15;const near=!(other.bounds.x>bounds.x+bounds.w+gap||other.bounds.x+other.bounds.w<bounds.x-gap||other.bounds.y>bounds.y+bounds.h+gap||other.bounds.y+other.bounds.h<bounds.y-gap);if(!near)continue;const cd=(region.avgColor[0]-other.avgColor[0])**2+(region.avgColor[1]-other.avgColor[1])**2+(region.avgColor[2]-other.avgColor[2])**2;if(cd<3000&&cd>200){recs.push({type:"tip",icon:"🎨",msg:`Similar colour to "${other.label}" nearby.`,suggest:"Long & Short can blend them at the boundary.",fix:{stitch:"longshort"}});break;}}
  return recs;}

// ============================================================
function EmbroideryApp(){
  const[modal,setModal]=useState(null);
  const[phase,setPhase]=useState("upload");
  const[editMode,setEditMode]=useState("select"); // select | draw | editNodes
  const[regions,setRegions]=useState([]);
  const[selId,setSelId]=useState(null);
  const[view,setView]=useState("overlay");
  const[imgSrc,setImgSrc]=useState(null);
  const[numColors,setNumColors]=useState(8);
  const[loading,setLoading]=useState(false);
  const[curPts,setCurPts]=useState([]);
  const[nextId,setNextId]=useState(1);
  const[dismissed,setDismissed]=useState(new Set());
  const[dragNode,setDragNode]=useState(null); // { regionId, nodeIdx }
  const[compactness,setCompactness]=useState(10);
  const[wandTolerance,setWandTolerance]=useState(35);
  const[wandEdgeSnap,setWandEdgeSnap]=useState(true);

  const mainC=useRef(null),imgC=useRef(null),fileRef=useRef(null);
  const imgRef=useRef(null),imgDataRef=useRef(null),isDraw=useRef(false);

  const rebuildRegionCurve = useCallback((r) => {
    const curve = buildCurve(r.nodes);
    return { ...r, points: curve, bounds: pBounds(curve), area: pArea(curve) };
  }, []);

  const handleFile=useCallback(e=>{const f=e.target.files?.[0];if(!f)return;const reader=new FileReader();reader.onload=ev=>{setImgSrc(ev.target.result);const img=new Image();img.onload=()=>{imgRef.current=img;const ic=imgC.current;ic.width=CW;ic.height=CH;const ctx=ic.getContext("2d");ctx.clearRect(0,0,CW,CH);const s=Math.min(CW/img.width,CH/img.height);ctx.drawImage(img,(CW-img.width*s)/2,(CH-img.height*s)/2,img.width*s,img.height*s);imgDataRef.current=ctx.getImageData(0,0,CW,CH);setPhase("segment");};img.src=ev.target.result;};reader.readAsDataURL(f);},[]);
  const loadSample=useCallback(type=>{const c=document.createElement("canvas");c.width=CW;c.height=CH;const ctx=c.getContext("2d");if(type==="flower")drawSampleFlower(ctx);else drawSampleButterfly(ctx);const url=c.toDataURL();setImgSrc(url);const img=new Image();img.onload=()=>{imgRef.current=img;const ic=imgC.current;ic.width=CW;ic.height=CH;ic.getContext("2d").drawImage(img,0,0);imgDataRef.current=ic.getContext("2d").getImageData(0,0,CW,CH);setPhase("segment");};img.src=url;},[]);
  const runAuto=useCallback(()=>{if(!imgDataRef.current)return;setLoading(true);setTimeout(()=>{const r=autoSegment(imgDataRef.current,numColors,compactness);setRegions(r);setNextId(r.length+1);setLoading(false);setPhase("edit");setEditMode("select");setDismissed(new Set());},80);},[numColors,compactness]);
  const startDraw=useCallback(()=>{setPhase("edit");setRegions([]);setNextId(1);setEditMode("draw");setDismissed(new Set());},[]);

  const makeRegion=useCallback(rawPts=>{if(rawPts.length<5)return null;let sm=simplify(rawPts,4);if(sm.length>=4)sm=catmull(sm,4);sm=simplify(sm,2);if(sm.length<4)return null;const bounds=pBounds(sm),area=pArea(sm);let r=180,g=180,b=180,cnt=0;if(imgDataRef.current){const d=imgDataRef.current.data;for(let py=Math.max(0,bounds.y|0);py<Math.min(CH,bounds.y+bounds.h);py+=2)for(let px=Math.max(0,bounds.x|0);px<Math.min(CW,bounds.x+bounds.w);px+=2)if(ptIn(sm,px,py)){const i=(py*CW+px)*4;r+=d[i];g+=d[i+1];b+=d[i+2];cnt++;}if(cnt>0){r=Math.round(r/cnt);g=Math.round(g/cnt);b=Math.round(b/cnt);}}
    const nodes=pointsToNodes(sm,Math.min(16,Math.max(6,Math.floor(Math.sqrt(area)/6))));const curve=buildCurve(nodes);
    return{nodes,points:curve,bounds:pBounds(curve),avgColor:[r,g,b],dmc:closestDMC(r,g,b),stitch:suggestStitch(area),direction:0,area:pArea(curve)};},[]);

  const finishDraw=useCallback(()=>{const result=makeRegion(curPts);isDraw.current=false;setCurPts([]);if(!result)return;
    setRegions(p=>[...p,{id:nextId,label:`Region ${nextId}`,...result}]);setNextId(n=>n+1);},[curPts,nextId,makeRegion]);

  const runWand=useCallback((mx,my)=>{if(!imgDataRef.current)return;const sx=Math.max(0,Math.min(CW-1,Math.round(mx))),sy=Math.max(0,Math.min(CH-1,Math.round(my)));const occ=new Uint8Array(CW*CH);for(const r of regions){const b=r.bounds;for(let py=Math.max(0,b.y|0);py<Math.min(CH,(b.y+b.h+1)|0);py++)for(let px=Math.max(0,b.x|0);px<Math.min(CW,(b.x+b.w+1)|0);px++)if(ptIn(r.points,px,py))occ[py*CW+px]=1;}const mask=magicWandFill(imgDataRef.current,sx,sy,wandTolerance,wandEdgeSnap,3.0,occ);const bMask=new Uint8Array(CW*CH);for(let y=0;y<CH;y++)for(let x=0;x<CW;x++){if(!mask[y*CW+x])continue;if(x===0||!mask[y*CW+x-1]||x===CW-1||!mask[y*CW+x+1]||y===0||!mask[(y-1)*CW+x]||y===CH-1||!mask[(y+1)*CW+x])bMask[y*CW+x]=1;}const contour=traceContour(bMask,CW,CH);if(contour.length<10)return;const tp=Math.min(80,Math.max(16,Math.floor(Math.sqrt(contour.length)/3)));const ds=downsample(contour,tp);if(ds.length<4)return;let sm=catmull(ds,3);sm=simplify(sm,2);if(sm.length<4)return;let ar=0,ag=0,ab=0,ac=0;const d=imgDataRef.current.data;for(let i=0;i<CW*CH;i++){if(!mask[i])continue;ar+=d[i*4];ag+=d[i*4+1];ab+=d[i*4+2];ac++;}const avgC=ac>0?[Math.round(ar/ac),Math.round(ag/ac),Math.round(ab/ac)]:[180,180,180];const area=pArea(sm),bounds=pBounds(sm);if(bounds.w<8||bounds.h<8)return;const nodes=pointsToNodes(sm,Math.min(20,Math.max(6,Math.floor(Math.sqrt(area)/6))));const curve=buildCurve(nodes);const nid=nextId;setRegions(p=>[...p,{id:nid,label:`Region ${nid}`,nodes,points:curve,bounds:pBounds(curve),avgColor:avgC,dmc:closestDMC(...avgC),stitch:suggestStitch(area),direction:0,area:pArea(curve)}]);setNextId(n=>n+1);setSelId(nid);setEditMode("select");},[regions,wandTolerance,wandEdgeSnap,nextId]);

  // Canvas render
  useEffect(()=>{
    if(!mainC.current)return;const canvas=mainC.current;canvas.width=CW;canvas.height=CH;const ctx=canvas.getContext("2d");
    ctx.fillStyle="#f5f0eb";ctx.fillRect(0,0,CW,CH);
    if(imgRef.current&&(view==="original"||view==="overlay")){const img=imgRef.current,s=Math.min(CW/img.width,CH/img.height);ctx.globalAlpha=view==="overlay"?.35:1;ctx.drawImage(img,(CW-img.width*s)/2,(CH-img.height*s)/2,img.width*s,img.height*s);ctx.globalAlpha=1;}
    if(view!=="original"){
      for(const r of regions){ctx.save();ctx.beginPath();ctx.moveTo(r.points[0][0],r.points[0][1]);for(let i=1;i<r.points.length;i++)ctx.lineTo(r.points[i][0],r.points[i][1]);ctx.closePath();ctx.fillStyle=r.dmc.h+(view==="overlay"?"88":"cc");ctx.fill();ctx.restore();renderStitch(ctx,r.points,r.bounds,r.stitch,r.direction);}
      for(const r of regions){const isSel=selId===r.id;ctx.save();ctx.beginPath();ctx.moveTo(r.points[0][0],r.points[0][1]);for(let i=1;i<r.points.length;i++)ctx.lineTo(r.points[i][0],r.points[i][1]);ctx.closePath();ctx.strokeStyle=isSel?ACCENT:"rgba(255,255,255,0.7)";ctx.lineWidth=isSel?3:1.5;if(isSel){ctx.shadowColor=ACCENT;ctx.shadowBlur=6;}ctx.stroke();ctx.restore();
        if(r.bounds.w>18&&r.bounds.h>18)renderArrow(ctx,r.bounds,r.direction);
        // Rec badge
        if(editMode==="select"){const recs=getRecommendations(r,regions).filter(rc=>!dismissed.has(`${r.id}-${rc.msg.slice(0,20)}`));if(recs.length>0){const hw=recs.some(rc=>rc.type==="warning");ctx.save();ctx.beginPath();ctx.arc(r.bounds.x+r.bounds.w-4,r.bounds.y+6,5,0,Math.PI*2);ctx.fillStyle=hw?"#f59e0b":"#60a5fa";ctx.fill();ctx.strokeStyle="#fff";ctx.lineWidth=1.5;ctx.stroke();ctx.fillStyle="#fff";ctx.font="bold 8px system-ui";ctx.textAlign="center";ctx.textBaseline="middle";ctx.fillText(recs.length.toString(),r.bounds.x+r.bounds.w-4,r.bounds.y+6.5);ctx.restore();}}}
      // Draw nodes for selected region in editNodes mode
      if(editMode==="editNodes"&&selId){
        const sr=regions.find(r=>r.id===selId);
        if(sr&&sr.nodes){
          const nodes=sr.nodes;
          // Draw edges between nodes
          ctx.save();ctx.strokeStyle=ACCENT+'66';ctx.lineWidth=1;ctx.setLineDash([3,3]);
          ctx.beginPath();ctx.moveTo(nodes[0][0],nodes[0][1]);
          for(let i=1;i<nodes.length;i++)ctx.lineTo(nodes[i][0],nodes[i][1]);
          ctx.closePath();ctx.stroke();ctx.setLineDash([]);ctx.restore();
          // Midpoints (add-node handles)
          for(let i=0;i<nodes.length;i++){
            const j=(i+1)%nodes.length;
            const mx=(nodes[i][0]+nodes[j][0])/2, my=(nodes[i][1]+nodes[j][1])/2;
            ctx.save();ctx.beginPath();ctx.arc(mx,my,4,0,Math.PI*2);
            ctx.fillStyle=ACCENT+'44';ctx.fill();ctx.strokeStyle=ACCENT;ctx.lineWidth=1;ctx.stroke();ctx.restore();
            // Plus sign
            ctx.save();ctx.strokeStyle=ACCENT;ctx.lineWidth=1.2;
            ctx.beginPath();ctx.moveTo(mx-2,my);ctx.lineTo(mx+2,my);ctx.stroke();
            ctx.beginPath();ctx.moveTo(mx,my-2);ctx.lineTo(mx,my+2);ctx.stroke();ctx.restore();
          }
          // Nodes
          for(let i=0;i<nodes.length;i++){
            const[nx,ny]=nodes[i];
            const isActive=dragNode&&dragNode.regionId===selId&&dragNode.nodeIdx===i;
            ctx.save();ctx.beginPath();ctx.arc(nx,ny,NODE_R,0,Math.PI*2);
            ctx.fillStyle=isActive?ACCENT:"#fff";ctx.fill();
            ctx.strokeStyle=ACCENT;ctx.lineWidth=2;ctx.stroke();ctx.restore();
          }
        }
      }
    }
    // Freehand drawing preview
    if(isDraw.current&&curPts.length>1){ctx.save();ctx.beginPath();ctx.moveTo(curPts[0][0],curPts[0][1]);for(let i=1;i<curPts.length;i++)ctx.lineTo(curPts[i][0],curPts[i][1]);ctx.strokeStyle="#14b8a6";ctx.lineWidth=2.5;ctx.lineCap="round";ctx.lineJoin="round";ctx.stroke();ctx.setLineDash([4,4]);ctx.strokeStyle="#14b8a688";ctx.beginPath();ctx.moveTo(curPts[curPts.length-1][0],curPts[curPts.length-1][1]);ctx.lineTo(curPts[0][0],curPts[0][1]);ctx.stroke();ctx.setLineDash([]);ctx.beginPath();ctx.arc(curPts[0][0],curPts[0][1],6,0,Math.PI*2);ctx.fillStyle="#14b8a6";ctx.fill();ctx.strokeStyle="#fff";ctx.lineWidth=2;ctx.stroke();ctx.restore();}
  },[regions,selId,view,curPts,editMode,dismissed,dragNode]);

  const getPos=e=>{const rect=mainC.current.getBoundingClientRect();const t=e.touches?e.touches[0]:e;return[(t.clientX-rect.left)*(CW/rect.width),(t.clientY-rect.top)*(CH/rect.height)];};

  const onDown=useCallback(e=>{
    const[mx,my]=getPos(e);

    // Node editing mode
    if(editMode==="editNodes"&&selId){
      e.preventDefault();
      const sr=regions.find(r=>r.id===selId);
      if(!sr||!sr.nodes)return;
      // Check if clicking a node
      for(let i=0;i<sr.nodes.length;i++){
        if((mx-sr.nodes[i][0])**2+(my-sr.nodes[i][1])**2<NODE_HIT**2){
          setDragNode({regionId:selId,nodeIdx:i});return;
        }
      }
      // Check if clicking a midpoint (to add a node)
      for(let i=0;i<sr.nodes.length;i++){
        const j=(i+1)%sr.nodes.length;
        const midX=(sr.nodes[i][0]+sr.nodes[j][0])/2, midY=(sr.nodes[i][1]+sr.nodes[j][1])/2;
        if((mx-midX)**2+(my-midY)**2<NODE_HIT**2){
          // Insert new node after i
          const newNodes=[...sr.nodes];
          newNodes.splice(i+1,0,[midX,midY]);
          const updated=rebuildRegionCurve({...sr,nodes:newNodes});
          setRegions(p=>p.map(r=>r.id===selId?updated:r));
          setDragNode({regionId:selId,nodeIdx:i+1});
          return;
        }
      }
      // Click on edge between nodes
      for(let i=0;i<sr.nodes.length;i++){
        const j=(i+1)%sr.nodes.length;
        const d=distToSeg(mx,my,sr.nodes[i][0],sr.nodes[i][1],sr.nodes[j][0],sr.nodes[j][1]);
        if(d<EDGE_HIT){
          const newNodes=[...sr.nodes];
          newNodes.splice(i+1,0,[mx,my]);
          const updated=rebuildRegionCurve({...sr,nodes:newNodes});
          setRegions(p=>p.map(r=>r.id===selId?updated:r));
          setDragNode({regionId:selId,nodeIdx:i+1});
          return;
        }
      }
      // Clicked elsewhere — deselect
      setSelId(null);setEditMode("select");
      return;
    }

    // Wand mode
    if(editMode==="wand"){e.preventDefault();runWand(mx,my);return;}

    // Draw mode
    if(editMode==="draw"){e.preventDefault();isDraw.current=true;setCurPts([getPos(e)]);return;}

    // Select mode — click to select region
    for(let i=regions.length-1;i>=0;i--)if(ptIn(regions[i].points,mx,my)){setSelId(regions[i].id);return;}
    setSelId(null);
  },[editMode,selId,regions,rebuildRegionCurve,runWand]);

  const onMove=useCallback(e=>{
    if(dragNode){
      e.preventDefault();
      const[mx,my]=getPos(e);
      setRegions(prev=>prev.map(r=>{
        if(r.id!==dragNode.regionId)return r;
        const newNodes=r.nodes.map((n,i)=>i===dragNode.nodeIdx?[mx,my]:n);
        return rebuildRegionCurve({...r,nodes:newNodes});
      }));
      return;
    }
    if(isDraw.current){e.preventDefault();const pos=getPos(e);setCurPts(p=>{const l=p[p.length-1];if(!l||(pos[0]-l[0])**2+(pos[1]-l[1])**2>4)return[...p,pos];return p;});}
  },[dragNode,rebuildRegionCurve]);

  const onUp=useCallback(e=>{
    if(dragNode){e?.preventDefault();setDragNode(null);return;}
    if(isDraw.current){e?.preventDefault();finishDraw();}
  },[dragNode,finishDraw]);

  const deleteNode=useCallback((regionId,nodeIdx)=>{
    setRegions(prev=>prev.map(r=>{
      if(r.id!==regionId||r.nodes.length<=3)return r;
      const newNodes=r.nodes.filter((_,i)=>i!==nodeIdx);
      return rebuildRegionCurve({...r,nodes:newNodes});
    }));
  },[rebuildRegionCurve]);

  const updateR=useCallback((id,u)=>{setRegions(p=>p.map(r=>r.id===id?{...r,...u}:r));setDismissed(prev=>{const next=new Set(prev);for(const k of next)if(k.startsWith(`${id}-`))next.delete(k);return next;});},[]);
  const deleteR=useCallback(id=>{setRegions(p=>p.filter(r=>r.id!==id));if(selId===id){setSelId(null);setEditMode("select");}},[selId]);

  const sel=regions.find(r=>r.id===selId);
  const selRecs=useMemo(()=>sel?getRecommendations(sel,regions).filter(rc=>!dismissed.has(`${sel.id}-${rc.msg.slice(0,20)}`)):[],[sel,regions,dismissed]);
  const totalRecs=useMemo(()=>{let t=0;for(const r of regions)t+=getRecommendations(r,regions).length;return t;},[regions]);

  // ============ UPLOAD ============
  if(phase==="upload")return(
    <div className="emb-page">
      <Header page="embroidery" tab={null} onPageChange={()=>{}} setModal={setModal} />
      {modal==='help'&&typeof HelpModal!=='undefined'&&<HelpModal onClose={()=>setModal(null)}/>}
      {modal==='shortcuts'&&typeof ShortcutsModal!=='undefined'&&<ShortcutsModal onClose={()=>setModal(null)}/>}
      <div className="emb-container">
        <h2 className="emb-title">Embroidery Pattern Planner</h2>
        <p className="emb-subtitle">Turn images into hand embroidery patterns with stitch annotations</p>
        <div className="upload-area" onClick={()=>fileRef.current?.click()}>
          <div style={{fontSize:36}}>🧵</div>
          <p className="emb-upload-text">Upload your own image</p>
          <input ref={fileRef} type="file" accept="image/*" onChange={handleFile} style={{display:"none"}}/>
          <button className="emb-btn emb-btn--primary" onClick={e=>{e.stopPropagation();fileRef.current?.click();}}>Upload Image</button>
        </div>
        <p className="emb-divider-text">— or try a sample —</p>
        <div className="emb-sample-row">
          {[["flower","🌸","Flower","Petals, stem & leaves"],["butterfly","🦋","Butterfly","Wings & body"]].map(([k,em,t,d])=>(
            <div key={k} className="emb-sample-card" onClick={()=>loadSample(k)}>
              <div style={{fontSize:32,marginBottom:4}}>{em}</div>
              <div className="emb-sample-name">{t}</div>
              <div className="emb-sample-desc">{d}</div>
            </div>))}
        </div>
      </div>
      <canvas ref={imgC} style={{display:"none"}}/><canvas ref={mainC} style={{display:"none"}}/>
    </div>);

  // ============ SEGMENT ============
  if(phase==="segment")return(
    <div className="emb-page">
      <Header page="embroidery" tab={null} onPageChange={()=>{}} setModal={setModal} />
      {modal==='help'&&typeof HelpModal!=='undefined'&&<HelpModal onClose={()=>setModal(null)}/>}
      {modal==='shortcuts'&&typeof ShortcutsModal!=='undefined'&&<ShortcutsModal onClose={()=>setModal(null)}/>}
      <div className="emb-container">
        <div className="emb-nav-row">
          <button className="emb-back-btn" onClick={()=>{setPhase("upload");setImgSrc(null);imgRef.current=null;}}>←</button>
          <h2 className="emb-heading">Segmentation</h2>
        </div>
        <div className="card" style={{marginBottom:14}}>
          {imgSrc&&<img src={imgSrc} alt="" className="emb-preview-img"/>}
        </div>
        <div className="emb-method-row">
          <div className="emb-method-card emb-method-card--auto">
            <div style={{textAlign:"center",marginBottom:8}}>
              <span style={{fontSize:26}}>🤖</span>
              <h3 className="emb-method-title">Auto Detect</h3>
              <p className="emb-method-desc">SLIC superpixel segmentation</p>
            </div>
            <div style={{marginBottom:10}}>
              <label className="emb-label">Colour regions: {numColors}</label>
              <input type="range" min={4} max={16} value={numColors} onChange={e=>setNumColors(+e.target.value)} style={{width:"100%"}}/>
              <div className="emb-range-labels"><span>Fewer</span><span>More</span></div>
            </div>
            <div style={{marginBottom:10}}>
              <label className="emb-label">Edge sensitivity: {compactness<=5?'High':compactness<=14?'Medium':'Low'}</label>
              <input type="range" min={1} max={20} value={21-compactness} onChange={e=>setCompactness(21-(+e.target.value))} style={{width:"100%"}}/>
              <div className="emb-range-labels"><span>Low</span><span>High</span></div>
            </div>
            <button className="emb-btn emb-btn--primary emb-btn--full" onClick={runAuto} disabled={loading} style={{opacity:loading?.6:1,cursor:loading?"wait":"pointer"}}>
              {loading?"Detecting…":"Auto Segment"}
            </button>
          </div>
          <div className="emb-method-card emb-method-card--draw">
            <div style={{textAlign:"center"}}>
              <span style={{fontSize:26}}>✏️</span>
              <h3 className="emb-method-title">Draw by Hand</h3>
              <p className="emb-method-desc">Freehand trace regions</p>
            </div>
            <button className="emb-btn emb-btn--secondary emb-btn--full" onClick={startDraw} style={{marginTop:12}}>Start Drawing</button>
          </div>
        </div>
      </div>
      <canvas ref={imgC} style={{display:"none"}}/><canvas ref={mainC} style={{display:"none"}}/>
    </div>);

  // ============ EDIT ============
  const isNodeEdit = editMode==="editNodes"&&selId;
  return(
    <div className="emb-page">
      <Header page="embroidery" tab={null} onPageChange={()=>{}} setModal={setModal} />
      {modal==='help'&&typeof HelpModal!=='undefined'&&<HelpModal onClose={()=>setModal(null)}/>}
      {modal==='shortcuts'&&typeof ShortcutsModal!=='undefined'&&<ShortcutsModal onClose={()=>setModal(null)}/>}
      <div className="emb-container">
        <div className="emb-nav-row" style={{justifyContent:"space-between"}}>
          <div style={{display:"flex",alignItems:"center",gap:6}}>
            <button className="emb-back-btn" onClick={()=>{setPhase("segment");setRegions([]);setSelId(null);setCurPts([]);isDraw.current=false;setEditMode("select");setDragNode(null);}}>←</button>
            <h2 className="emb-heading">Edit Pattern</h2>
          </div>
          {totalRecs>0&&editMode==="select"&&<div className="emb-suggestion-badge">{totalRecs} suggestion{totalRecs>1?"s":""}</div>}
        </div>

        {/* Toolbar */}
        <div className="tb-grp" style={{width:"100%",marginBottom:6}}>
          <button className={'tb-btn'+(editMode==="select"?' tb-btn--on':'')} onClick={()=>{setEditMode("select");setDragNode(null);}}>
            👆 Select</button>
          {sel&&<button className={'tb-btn'+(isNodeEdit?' tb-btn--on':'')} onClick={()=>{setEditMode("editNodes");setDragNode(null);}}>
            ◇ Edit Shape</button>}
          <button className={'tb-btn'+(editMode==="draw"?' tb-btn--on':'')} onClick={()=>{setEditMode("draw");setSelId(null);setDragNode(null);}}>
            ✏️ Add</button>
          <button className={'tb-btn'+(editMode==="wand"?' tb-btn--on':'')} onClick={()=>{setEditMode("wand");setSelId(null);setDragNode(null);}}>
            🪄 Wand</button>
        </div>

        {/* Context hints */}
        {editMode==="draw"&&<div className="emb-hint emb-hint--teal">Drag on the canvas to draw a new region.</div>}
        {editMode==="wand"&&<div className="emb-hint emb-hint--teal" style={{marginBottom:6}}>
          Click anywhere on the image to fill a colour region.
          <div style={{marginTop:6}}>
            <label className="emb-label">Tolerance: {wandTolerance}</label>
            <input type="range" min={0} max={100} value={wandTolerance} onChange={e=>setWandTolerance(+e.target.value)} style={{width:"100%"}}/>
            <div className="emb-range-labels"><span>Exact</span><span>Loose</span></div>
          </div>
          <label style={{display:"flex",alignItems:"center",gap:6,marginTop:6,cursor:"pointer",fontSize:12}}>
            <input type="checkbox" checked={wandEdgeSnap} onChange={e=>setWandEdgeSnap(e.target.checked)}/>
            Edge snap
          </label>
        </div>}
        {isNodeEdit&&<div className="emb-hint emb-hint--amber">
          <strong>Drag nodes</strong> to reshape. Click a <strong>+</strong> midpoint or any edge to add a node. Double-click a node to remove it (min 3).
        </div>}

        {/* View toggle */}
        <div className="tb-grp" style={{width:"100%",marginBottom:6}}>
          {["overlay","stitch","original"].map(v=>(
            <button key={v} className={'tb-btn'+(view===v?' tb-btn--on':'')} onClick={()=>setView(v)} style={{flex:1,textTransform:"capitalize"}}>{v}</button>))}
        </div>

        {/* Canvas */}
        <div className="card" style={{marginBottom:8,touchAction:"none"}}>
          <canvas ref={mainC} width={CW} height={CH}
            onMouseDown={onDown} onMouseMove={onMove} onMouseUp={onUp} onMouseLeave={onUp}
            onTouchStart={onDown} onTouchMove={onMove} onTouchEnd={onUp}
            onDoubleClick={e=>{
              if(!isNodeEdit||!sel)return;
              const[mx,my]=getPos(e);
              for(let i=0;i<sel.nodes.length;i++){
                if((mx-sel.nodes[i][0])**2+(my-sel.nodes[i][1])**2<NODE_HIT**2){
                  deleteNode(sel.id,i);return;}}}}
            style={{width:"100%",display:"block",cursor:(editMode==="draw"||editMode==="wand")?"crosshair":isNodeEdit?"default":"pointer"}}/>          
        </div>

        {/* Region editor */}
        {sel&&editMode!=="draw"?(
          <div className="card" style={{padding:12,marginBottom:8}}>
            <div className="emb-region-header">
              <div style={{display:"flex",alignItems:"center",gap:8}}>
                <span className="emb-color-swatch" style={{background:sel.dmc.h}}/>
                <div>
                  <input value={sel.label} onChange={e=>updateR(sel.id,{label:e.target.value})} className="emb-region-name-input"/>
                  <div className="emb-region-dmc">DMC {sel.dmc.c} — {sel.dmc.n}</div>
                </div>
              </div>
              <button className="emb-delete-btn" onClick={()=>deleteR(sel.id)}>✕</button>
            </div>

            {isNodeEdit&&<div className="emb-hint emb-hint--amber" style={{marginBottom:8}}>{sel.nodes.length} control nodes</div>}

            {!isNodeEdit&&<>
            <div style={{marginBottom:8}}>
              <label className="emb-label">Stitch Type</label>
              <div style={{display:"flex",flexWrap:"wrap",gap:3}}>
                {STITCHES.map(st=>(
                  <button key={st.id} onClick={()=>updateR(sel.id,{stitch:st.id})}
                    className={'emb-stitch-btn'+(sel.stitch===st.id?' emb-stitch-btn--active':'')}
                    style={sel.stitch===st.id?{background:st.color,borderColor:st.color,color:"#fff"}:undefined}>{st.name}</button>))}
              </div>
              <p className="emb-stitch-desc">{STITCHES.find(s=>s.id===sel.stitch)?.desc}</p>
            </div>

            {selRecs.length>0&&<div style={{marginBottom:8}}>
              {selRecs.map((rec,i)=>{const isW=rec.type==="warning";return(
                <div key={i} className={'emb-rec'+(isW?' emb-rec--warn':' emb-rec--tip')} style={{marginBottom:i<selRecs.length-1?4:0}}>
                  <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",gap:6}}>
                    <div style={{flex:1}}>
                      <div className="emb-rec-msg"><span style={{marginRight:4}}>{rec.icon}</span>{rec.msg}</div>
                      <div className="emb-rec-suggest">{rec.suggest}</div>
                    </div>
                    <button className="emb-rec-dismiss" onClick={()=>setDismissed(p=>new Set(p).add(`${sel.id}-${rec.msg.slice(0,20)}`))}>×</button>
                  </div>
                  {rec.fix&&<button className={'emb-btn emb-btn--sm'+(isW?' emb-btn--amber':' emb-btn--primary')} onClick={()=>updateR(sel.id,rec.fix)} style={{marginTop:6}}>
                    Apply{rec.fix.stitch?` → ${STITCHES.find(s=>s.id===rec.fix.stitch)?.name||""}`:""}{rec.fix.direction!==undefined?` → ${rec.fix.direction}°`:""}
                  </button>}
                </div>);})}</div>}

            <div style={{marginBottom:8}}>
              <label className="emb-label">Direction: {sel.direction}°</label>
              <input type="range" min={0} max={359} value={sel.direction} onChange={e=>updateR(sel.id,{direction:+e.target.value})} style={{width:"100%"}}/>
              <div className="emb-range-labels"><span>0° →</span><span>90° ↓</span><span>180° ←</span><span>270° ↑</span></div>
            </div>

            <div>
              <label className="emb-label">DMC Thread</label>
              <div className="emb-dmc-grid">
                {EMB_COLORS.filter(c=>{const[cr,cg,cb]=hex2rgb(c.h);return(sel.avgColor[0]-cr)**2+(sel.avgColor[1]-cg)**2+(sel.avgColor[2]-cb)**2<28000;}).slice(0,14).map(c=>(
                  <button key={c.c} onClick={()=>updateR(sel.id,{dmc:c})} title={`DMC ${c.c} — ${c.n}`}
                    className={'emb-dmc-swatch'+(sel.dmc.c===c.c?' emb-dmc-swatch--active':'')} style={{background:c.h}}/>))}
              </div>
            </div>
            </>}
          </div>
        ):editMode==="select"&&<p className="emb-hint-text">Tap a region to edit</p>}

        {/* Legend */}
        {regions.length>0&&(
          <div className="card" style={{padding:10}}>
            <h3 className="emb-legend-title">Legend — {regions.length} region{regions.length>1?"s":""}</h3>
            <div className="emb-legend-grid">
              {regions.map(r=>{const recs=getRecommendations(r,regions).filter(rc=>!dismissed.has(`${r.id}-${rc.msg.slice(0,20)}`));const hw=recs.some(rc=>rc.type==="warning");
                return(<div key={r.id} className={'emb-legend-item'+(selId===r.id?' emb-legend-item--active':'')} onClick={()=>{if(editMode!=="draw"){setSelId(r.id);if(editMode==="editNodes"&&r.id!==selId)setEditMode("select");}}}>
                  <span className="emb-legend-dot" style={{background:r.dmc.h}}/>
                  <div style={{minWidth:0,flex:1}}>
                    <div className="emb-legend-name">{r.label}</div>
                    <div className="emb-legend-meta">{r.dmc.c} · {STITCHES.find(s=>s.id===r.stitch)?.name} · {r.direction}°</div>
                  </div>
                  {recs.length>0&&<span className={'emb-legend-badge'+(hw?' emb-legend-badge--warn':'')}/>}
                </div>);})}
            </div>
          </div>)}
        <canvas ref={imgC} style={{display:"none"}}/>
      </div>
    </div>);
}

// Mount
const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(<EmbroideryApp />);
