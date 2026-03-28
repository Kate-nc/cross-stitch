function findSolid(lab,p){let b=null,bd=1e9;for(let i=0;i<p.length;i++){let d=dE(lab,p[i].lab);if(d<bd){bd=d;b=p[i];}}return{type:"solid",id:b.id,name:b.name,rgb:b.rgb,lab:b.lab,dist:bd};}
function findBest(lab, palette) {
  const solidMatch = findSolid(lab, palette);
  let bestBlend = null;
  let bestBlendDist = 1e9;

  for (let i = 0; i < palette.length; i++) {
    for (let j = i + 1; j < palette.length; j++) {
      const threadA = palette[i];
      const threadB = palette[j];
      const blendLab = [
        (threadA.lab[0] + threadB.lab[0]) / 2,
        (threadA.lab[1] + threadB.lab[1]) / 2,
        (threadA.lab[2] + threadB.lab[2]) / 2
      ];
      const dist = dE(lab, blendLab);

      if (dist < bestBlendDist) {
        bestBlendDist = dist;
        bestBlend = {
          threads: [threadA, threadB],
          lab: blendLab
        };
      }
    }
  }

  if (bestBlend && (bestBlendDist + 3 < solidMatch.dist) && solidMatch.dist > 5) {
    const threadA = bestBlend.threads[0];
    const threadB = bestBlend.threads[1];
    const blendId = threadA.id + "+" + threadB.id;
    const blendRgb = [
      Math.round((threadA.rgb[0] + threadB.rgb[0]) / 2),
      Math.round((threadA.rgb[1] + threadB.rgb[1]) / 2),
      Math.round((threadA.rgb[2] + threadB.rgb[2]) / 2)
    ];

    return {
      type: "blend",
      id: blendId,
      name: blendId,
      rgb: blendRgb,
      lab: bestBlend.lab,
      threads: bestBlend.threads,
      dist: bestBlendDist
    };
  }

  return solidMatch;
}
function luminance(rgb){return rgb[0]*0.299+rgb[1]*0.587+rgb[2]*0.114;}

function quantize(data,w,h,n){let px=[];for(let i=0;i<w*h;i++){let j=i*4;px.push(rgbToLab(data[j],data[j+1],data[j+2]));}let cs=[px[Math.floor(Math.random()*px.length)]];while(cs.length<Math.min(n,px.length)){let ds=px.map(q=>{let md=1e9;for(let i=0;i<cs.length;i++)md=Math.min(md,dE(q,cs[i]));return md*md;});let sum=ds.reduce((a,b)=>a+b,0),r=Math.random()*sum,acc=0;for(let i=0;i<px.length;i++){acc+=ds[i];if(acc>=r){cs.push([px[i][0],px[i][1],px[i][2]]);break;}}}for(let it=0;it<20;it++){let cl=cs.map(()=>[]);for(let pi=0;pi<px.length;pi++){let md=1e9,mi=0;for(let c=0;c<cs.length;c++){let d=dE(px[pi],cs[c]);if(d<md){md=d;mi=c;}}cl[mi].push(px[pi]);}let mv=false;for(let c2=0;c2<cs.length;c2++){if(!cl[c2].length)continue;let nv=[cl[c2].reduce((s,q)=>s+q[0],0)/cl[c2].length,cl[c2].reduce((s,q)=>s+q[1],0)/cl[c2].length,cl[c2].reduce((s,q)=>s+q[2],0)/cl[c2].length];if(dE(nv,cs[c2])>0.5)mv=true;cs[c2]=nv;}if(!mv)break;}let pl=[],used=new Set();for(let ci=0;ci<cs.length;ci++){let b=null,bd=1e9;for(let ti=0;ti<DMC.length;ti++){if(used.has(DMC[ti].id))continue;let d2=dE(cs[ci],DMC[ti].lab);if(d2<bd){bd=d2;b=DMC[ti];}}if(b){used.add(b.id);pl.push(b);}}return pl;}
function doDither(data,w,h,pal){let d=new Float32Array(w*h*3);for(let i=0;i<w*h;i++){d[i*3]=data[i*4];d[i*3+1]=data[i*4+1];d[i*3+2]=data[i*4+2];}let r=new Array(w*h);for(let y=0;y<h;y++)for(let x=0;x<w;x++){let idx=y*w+x,cr=Math.max(0,Math.min(255,d[idx*3])),cg=Math.max(0,Math.min(255,d[idx*3+1])),cb=Math.max(0,Math.min(255,d[idx*3+2]));let m=findBest(rgbToLab(cr,cg,cb),pal);r[idx]=m;let eR=cr-m.rgb[0],eG=cg-m.rgb[1],eB=cb-m.rgb[2];if(x+1<w){let ni=(y*w+x+1)*3;d[ni]+=eR*7/16;d[ni+1]+=eG*7/16;d[ni+2]+=eB*7/16;}if(y+1<h){if(x>0){let ni2=((y+1)*w+x-1)*3;d[ni2]+=eR*3/16;d[ni2+1]+=eG*3/16;d[ni2+2]+=eB*3/16;}let ni3=((y+1)*w+x)*3;d[ni3]+=eR*5/16;d[ni3+1]+=eG*5/16;d[ni3+2]+=eB*5/16;if(x+1<w){let ni4=((y+1)*w+x+1)*3;d[ni4]+=eR*1/16;d[ni4+1]+=eG*1/16;d[ni4+2]+=eB*1/16;}}}return r;}
function doMap(data,w,h,pal){let r=new Array(w*h);for(let i=0;i<w*h;i++)r[i]=findBest(rgbToLab(data[i*4],data[i*4+1],data[i*4+2]),pal);return r;}

function buildPalette(patArr){
  let usage={};
  for(let i=0;i<patArr.length;i++){
    let m=patArr[i];if(m.id==="__skip__")continue;
    if(!usage[m.id])usage[m.id]={id:m.id,type:m.type,name:m.name,rgb:m.rgb,lab:m.lab,threads:m.threads,count:0};
    usage[m.id].count++;
  }
  let entries=Object.values(usage).sort((a,b)=>b.count-a.count);
  entries.forEach((e,i)=>{e.symbol=SYMS[i%SYMS.length];});
  let cm={};entries.forEach(e=>{cm[e.id]=e;});
  return{pal:entries,cmap:cm};
}

function restoreStitch(m){
  if(m.id==="__skip__")return{type:"skip",id:"__skip__",rgb:[255,255,255],lab:[100,0,0]};
  if(m.type==="blend"){
    let ids=m.id.split("+"),t0=DMC.find(d=>d.id===ids[0]),t1=DMC.find(d=>d.id===ids[1]);
    if(t0&&t1)return{type:"blend",id:m.id,name:m.id,rgb:[Math.round((t0.rgb[0]+t1.rgb[0])/2),Math.round((t0.rgb[1]+t1.rgb[1])/2),Math.round((t0.rgb[2]+t1.rgb[2])/2)],lab:[(t0.lab[0]+t1.lab[0])/2,(t0.lab[1]+t1.lab[1])/2,(t0.lab[2]+t1.lab[2])/2],threads:[t0,t1],dist:0};
  }
  let dmc=DMC.find(d=>d.id===m.id);
  if(dmc)return{type:"solid",id:dmc.id,name:dmc.name,rgb:dmc.rgb,lab:dmc.lab,dist:0};
  return{type:"solid",id:m.id,name:m.id,rgb:m.rgb||[128,128,128],lab:rgbToLab(...(m.rgb||[128,128,128])),dist:0};
}

function applyMedianFilter(data, w, h, radius) {
  if (radius <= 0) return data;
  const len = data.length;
  const buf = new Uint8ClampedArray(len);

  const size = (2 * radius + 1) * (2 * radius + 1);
  const rArr = new Int32Array(size);
  const gArr = new Int32Array(size);
  const bArr = new Int32Array(size);

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let idx = 0;
      for (let dy = -radius; dy <= radius; dy++) {
        let ny = y + dy;
        if (ny < 0) ny = 0; else if (ny >= h) ny = h - 1;
        let rowOff = ny * w;
        for (let dx = -radius; dx <= radius; dx++) {
          let nx = x + dx;
          if (nx < 0) nx = 0; else if (nx >= w) nx = w - 1;
          let pIdx = (rowOff + nx) << 2;
          rArr[idx] = data[pIdx];
          gArr[idx] = data[pIdx + 1];
          bArr[idx] = data[pIdx + 2];
          idx++;
        }
      }
      rArr.sort();
      gArr.sort();
      bArr.sort();

      let mid = size >> 1;
      let outIdx = (y * w + x) << 2;
      buf[outIdx] = rArr[mid];
      buf[outIdx + 1] = gArr[mid];
      buf[outIdx + 2] = bArr[mid];
      buf[outIdx + 3] = data[outIdx + 3];
    }
  }
  for (let i = 0; i < len; i++) {
    data[i] = buf[i];
  }
  return data;
}

function removeOrphanStitches(mapped, w, h, maxOrphanSize) {
  if (maxOrphanSize <= 0) return mapped;
  let len = mapped.length;
  let vis = new Uint8Array(len);

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let idx = y * w + x;
      if (vis[idx] || mapped[idx].id === "__skip__") continue;

      let tid = mapped[idx].id;
      let comp = [];
      let q = [idx];
      vis[idx] = 1;

      // 8-way connectivity for cluster detection
      while (q.length > 0) {
        let curr = q.pop();
        comp.push(curr);

        let cx = curr % w;
        let cy = Math.floor(curr / w);

        let neighbors = [];
        for (let dy = -1; dy <= 1; dy++) {
          for (let dx = -1; dx <= 1; dx++) {
            if (dx === 0 && dy === 0) continue;
            let nx = cx + dx, ny = cy + dy;
            if (nx >= 0 && nx < w && ny >= 0 && ny < h) {
              neighbors.push([nx, ny]);
            }
          }
        }

        for (let i = 0; i < neighbors.length; i++) {
          let nx = neighbors[i][0];
          let ny = neighbors[i][1];
          let nidx = ny * w + nx;
          if (!vis[nidx] && mapped[nidx].id === tid) {
            vis[nidx] = 1;
            q.push(nidx);
          }
        }
      }

      if (comp.length <= maxOrphanSize) {
        let counts = {};
        for (let i = 0; i < comp.length; i++) {
          let cidx = comp[i];
          let cx = cidx % w;
          let cy = Math.floor(cidx / w);
          for (let dy = -1; dy <= 1; dy++) {
            for (let dx = -1; dx <= 1; dx++) {
              if (dx === 0 && dy === 0) continue;
              let nx = cx + dx, ny = cy + dy;
              if (nx >= 0 && nx < w && ny >= 0 && ny < h) {
                let nidx = ny * w + nx;
                let nid = mapped[nidx].id;
                if (nid !== tid && nid !== "__skip__") {
                  counts[nid] = (counts[nid] || 0) + 1;
                }
              }
            }
          }
        }

        let bestId = null;
        let bestCount = -1;
        for (let nid in counts) {
          if (counts[nid] > bestCount) {
            bestCount = counts[nid];
            bestId = nid;
          }
        }

        if (bestId) {
          let replacement = null;
          for (let j = 0; j < len; j++) {
            if (mapped[j].id === bestId) {
              replacement = mapped[j];
              break;
            }
          }
          if (replacement) {
            for (let i = 0; i < comp.length; i++) {
              mapped[comp[i]] = {...replacement};
            }
          }
        }
      }
    }
  }
  return mapped;
}

if (typeof module !== 'undefined' && module.exports) { module.exports = { findSolid, findBest, luminance, quantize, doDither, doMap, buildPalette, restoreStitch, applyMedianFilter, removeOrphanStitches }; }
