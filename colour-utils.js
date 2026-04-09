function findSolid(lab,p){let b=null,bd=1e9;for(let i=0;i<p.length;i++){let d=dE2(lab,p[i].lab);if(d<bd){bd=d;b=p[i];}}return{type:"solid",id:b.id,name:b.name,rgb:b.rgb,lab:b.lab,dist:Math.sqrt(bd)};}
function findBest(lab, palette, allowBlends = true) {
  const solidMatch = findSolid(lab, palette);
  if (!allowBlends) return solidMatch;

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
      const dist = dE2(lab, blendLab);

      if (dist < bestBlendDist) {
        bestBlendDist = dist;
        bestBlend = {
          threads: [threadA, threadB],
          lab: blendLab
        };
      }
    }
  }

  if (bestBlend && (Math.sqrt(bestBlendDist) + 3 < solidMatch.dist) && solidMatch.dist > 5) {
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
      dist: Math.sqrt(bestBlendDist)
    };
  }

  return solidMatch;
}
function luminance(rgb){return rgb[0]*0.299+rgb[1]*0.587+rgb[2]*0.114;}

function quantize(data,w,h,n){
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
      let distSq = dE2(px[i], lastCenter);
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
      for(let c=0;c<cs.length;c++){let d=dE2(px[pi],cs[c]);if(d<md){md=d;mi=c;}}
      cl[mi].push(px[pi]);
    }
    let mv=false;
    for(let c2=0;c2<cs.length;c2++){
      if(!cl[c2].length)continue;
      let nv=[cl[c2].reduce((s,q)=>s+q[0],0)/cl[c2].length,cl[c2].reduce((s,q)=>s+q[1],0)/cl[c2].length,cl[c2].reduce((s,q)=>s+q[2],0)/cl[c2].length];
      if(dE2(nv,cs[c2])>0.25)mv=true;
      cs[c2]=nv;
    }
    if(!mv)break;
  }
  let pl=[],used=new Set();
  for(let ci=0;ci<cs.length;ci++){
    let b=null,bd=1e9;
    for(let ti=0;ti<DMC.length;ti++){
      if(used.has(DMC[ti].id))continue;
      let d2=dE2(cs[ci],DMC[ti].lab);if(d2<bd){bd=d2;b=DMC[ti];}
    }
    if(b){used.add(b.id);pl.push(b);}
  }
  return pl;
}
/**
 * Floyd-Steinberg dithering with Stage 2 confetti-aware color selection.
 *
 * When selecting the closest palette color for a pixel, if none of the four
 * already-processed neighbors share that color, the algorithm checks whether
 * a "second-best" color that *does* match a neighbor is within a perceptual
 * penalty threshold. If so, it uses the second-best color to avoid creating
 * an isolated stitch. The threshold is scaled by `(1 - saliency)` so that
 * high-detail areas are unaffected.
 *
 * @param {Uint8ClampedArray} data           RGBA source pixels
 * @param {number}            w
 * @param {number}            h
 * @param {Array}             pal            palette entries (each has .id, .rgb, .lab)
 * @param {boolean}           [allowBlends]  passed through to findBest
 * @param {Float32Array}      [saliencyMap]  per-pixel saliency scores 0–1; if omitted,
 *                                           treated as all-zero (maximum smoothing)
 * @param {object}            [opts]
 * @param {number}            [opts.confettiDitherThreshold=4.0]  base Delta-E² penalty
 *                                           the algorithm accepts to avoid an isolate
 */
function doDither(data, w, h, pal, allowBlends = true, saliencyMap = null, { confettiDitherThreshold = 4.0 } = {}) {
  const N = w * h;

  // Working buffer in float so error diffusion doesn't clip
  const d = new Float32Array(N * 3);
  for (let i = 0; i < N; i++) {
    d[i * 3]     = data[i * 4];
    d[i * 3 + 1] = data[i * 4 + 1];
    d[i * 3 + 2] = data[i * 4 + 2];
  }

  const r = new Array(N);

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const idx = y * w + x;

      const cr = Math.max(0, Math.min(255, d[idx * 3]));
      const cg = Math.max(0, Math.min(255, d[idx * 3 + 1]));
      const cb = Math.max(0, Math.min(255, d[idx * 3 + 2]));
      const targetLab = rgbToLab(cr, cg, cb);

      // --- Stage 2: confetti-aware color selection ---
      // Find best color via the normal path first.
      const best = findBest(targetLab, pal, allowBlends);

      // Compute the effective threshold, scaled by (1 - saliency).
      const saliency = saliencyMap ? saliencyMap[idx] : 0;
      const effectiveThreshold = confettiDitherThreshold * (1.0 - saliency);
      // dE2 returns squared Lab distance (ΔE²). The brief specifies the penalty
      // check as:  dE2(target, secondBest) - dE2(target, best) < threshold
      // so we compare the difference of squared distances against the raw threshold.
      // (Squaring both sides of a ΔE comparison would over-tighten the bound.)

      let chosen = best;

      if (effectiveThreshold > 0) {
        // Collect the up to 4 already-processed neighbors:
        //   top-left (y-1, x-1), top (y-1, x), top-right (y-1, x+1), left (y, x-1)
        const neighborIds = new Set();
        if (y > 0) {
          if (x > 0)     neighborIds.add(r[idx - w - 1].id);
                         neighborIds.add(r[idx - w].id);
          if (x < w - 1) neighborIds.add(r[idx - w + 1].id);
        }
        if (x > 0)       neighborIds.add(r[idx - 1].id);

        // If the best color is already represented in a neighbor, no confetti risk.
        if (!neighborIds.has(best.id)) {
          // Find the closest palette color that shares a neighbor's ID.
          let secondBest = null;
          let secondBestDistSq = Infinity;

          for (let pi = 0; pi < pal.length; pi++) {
            const entry = pal[pi];
            if (!neighborIds.has(entry.id)) continue;
            const distSq = dE2(targetLab, entry.lab);
            if (distSq < secondBestDistSq) {
              secondBestDistSq = distSq;
              secondBest = entry;
            }
          }

          if (secondBest !== null) {
            const bestDistSq = dE2(targetLab, best.lab);
            const penalty = secondBestDistSq - bestDistSq;
            if (penalty < effectiveThreshold) {
              chosen = secondBest;
            }
          }
        }
      }

      r[idx] = chosen;

      // Floyd-Steinberg error diffusion
      const eR = cr - chosen.rgb[0];
      const eG = cg - chosen.rgb[1];
      const eB = cb - chosen.rgb[2];

      if (x + 1 < w) {
        const ni = (idx + 1) * 3;
        d[ni]     += eR * 7 / 16;
        d[ni + 1] += eG * 7 / 16;
        d[ni + 2] += eB * 7 / 16;
      }
      if (y + 1 < h) {
        if (x > 0) {
          const ni2 = (idx + w - 1) * 3;
          d[ni2]     += eR * 3 / 16;
          d[ni2 + 1] += eG * 3 / 16;
          d[ni2 + 2] += eB * 3 / 16;
        }
        const ni3 = (idx + w) * 3;
        d[ni3]     += eR * 5 / 16;
        d[ni3 + 1] += eG * 5 / 16;
        d[ni3 + 2] += eB * 5 / 16;
        if (x + 1 < w) {
          const ni4 = (idx + w + 1) * 3;
          d[ni4]     += eR * 1 / 16;
          d[ni4 + 1] += eG * 1 / 16;
          d[ni4 + 2] += eB * 1 / 16;
        }
      }
    }
  }
  return r;
}
function doMap(data, w, h, pal, allowBlends = true) {
  let r = new Array(w * h);
  let cache = new Map();
  for (let i = 0; i < w * h; i++) {
    let r_val = data[i * 4];
    let g_val = data[i * 4 + 1];
    let b_val = data[i * 4 + 2];
    let key = (r_val << 16) | (g_val << 8) | b_val;
    let cached = cache.get(key);
    if (cached !== undefined) {
      r[i] = cached;
    } else {
      let mapped = findBest(rgbToLab(r_val, g_val, b_val), pal, allowBlends);
      cache.set(key, mapped);
      r[i] = mapped;
    }
  }
  return r;
}

function buildPalette(patArr){
  let usage={};
  for(let i=0;i<patArr.length;i++){
    let m=patArr[i];if(m.id==="__skip__"||m.id==="__empty__")continue;
    if(!usage[m.id])usage[m.id]={id:m.id,type:m.type,name:m.name,rgb:m.rgb,lab:m.lab,threads:m.threads,count:0};
    usage[m.id].count++;
  }
  let entries=Object.values(usage).sort((a,b)=>b.count-a.count);
  entries.forEach((e,i)=>{
    // Try to find an existing symbol in the pattern array
    const cell = patArr.find(c => c.id === e.id && c.symbol);
    e.symbol = cell ? cell.symbol : SYMS[i%SYMS.length];
  });
  let cm={};entries.forEach(e=>{cm[e.id]=e;});
  return{pal:entries,cmap:cm};
}

// Recalculates stitch counts from the grid while preserving existing symbol assignments.
// Use this instead of buildPalette() when symbols must stay stable (e.g. after single-stitch edits).
function rebuildPaletteCounts(patArr, existingPal) {
  const counts = {};
  for (let i = 0; i < patArr.length; i++) {
    const id = patArr[i].id;
    if (id === "__skip__" || id === "__empty__") continue;
    counts[id] = (counts[id] || 0) + 1;
  }
  return existingPal.map(p => ({ ...p, count: counts[p.id] || 0 }));
}

function restoreStitch(m){
  if(m.id==="__skip__")return{type:"skip",id:"__skip__",rgb:[255,255,255],lab:[100,0,0]};
  if(m.type==="blend"){
    let ids=m.id.split("+"),t0=DMC.find(d=>d.id===ids[0]),t1=DMC.find(d=>d.id===ids[1]);
    if(t0&&t1)return{type:"blend",id:m.id,name:m.id,rgb:[Math.round((t0.rgb[0]+t1.rgb[0])/2),Math.round((t0.rgb[1]+t1.rgb[1])/2),Math.round((t0.rgb[2]+t1.rgb[2])/2)],lab:[(t0.lab[0]+t1.lab[0])/2,(t0.lab[1]+t1.lab[1])/2,(t0.lab[2]+t1.lab[2])/2],threads:[t0,t1],dist:0};
  }
  let dmc=DMC.find(d=>d.id===m.id);
  if(dmc)return{type:"solid",id:dmc.id,name:dmc.name,rgb:dmc.rgb,lab:dmc.lab,dist:0,symbol:m.symbol};
  return{type:"solid",id:m.id,name:m.id,rgb:m.rgb||[128,128,128],lab:rgbToLab(...(m.rgb||[128,128,128])),dist:0,symbol:m.symbol};
}

function applyMedianFilterCore(data, w, h, radius, buf) {
  if (radius <= 0) {
    for (let i = 0; i < data.length; i++) buf[i] = data[i];
    return;
  }
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
}

function applyMedianFilter(data, w, h, radius) {
  if (radius <= 0) return data;
  const len = data.length;

  if (Number.isInteger(radius)) {
    const buf = new Uint8ClampedArray(len);
    applyMedianFilterCore(data, w, h, radius, buf);
    for (let i = 0; i < len; i++) data[i] = buf[i];
    return data;
  }

  const r1 = Math.floor(radius);
  const r2 = Math.ceil(radius);
  const frac = radius - r1;

  const buf1 = new Uint8ClampedArray(len);
  applyMedianFilterCore(data, w, h, r1, buf1);

  const buf2 = new Uint8ClampedArray(len);
  applyMedianFilterCore(data, w, h, r2, buf2);

  for (let i = 0; i < len; i++) {
    data[i] = buf1[i] + (buf2[i] - buf1[i]) * frac;
  }
  return data;
}

function applyGaussianBlur(data, w, h, sigma) {
  if (sigma <= 0) return data;

  const len = data.length;
  const buf = new Float32Array(len);
  for (let i = 0; i < len; i++) buf[i] = data[i];

  const radius = Math.ceil(sigma * 3);
  const kernel = new Float32Array(2 * radius + 1);
  let sum = 0;
  for (let i = -radius; i <= radius; i++) {
    kernel[i + radius] = Math.exp(-(i * i) / (2 * sigma * sigma));
    sum += kernel[i + radius];
  }
  for (let i = 0; i < kernel.length; i++) kernel[i] /= sum;

  const temp = new Float32Array(len);

  // Horizontal pass
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let r = 0, g = 0, b = 0;
      for (let k = -radius; k <= radius; k++) {
        let nx = x + k;
        if (nx < 0) nx = 0; else if (nx >= w) nx = w - 1;
        const idx = (y * w + nx) << 2;
        const weight = kernel[k + radius];
        r += buf[idx] * weight;
        g += buf[idx + 1] * weight;
        b += buf[idx + 2] * weight;
      }
      const outIdx = (y * w + x) << 2;
      temp[outIdx] = r;
      temp[outIdx + 1] = g;
      temp[outIdx + 2] = b;
      temp[outIdx + 3] = buf[outIdx + 3];
    }
  }

  // Vertical pass
  for (let x = 0; x < w; x++) {
    for (let y = 0; y < h; y++) {
      let r = 0, g = 0, b = 0;
      for (let k = -radius; k <= radius; k++) {
        let ny = y + k;
        if (ny < 0) ny = 0; else if (ny >= h) ny = h - 1;
        const idx = (ny * w + x) << 2;
        const weight = kernel[k + radius];
        r += temp[idx] * weight;
        g += temp[idx + 1] * weight;
        b += temp[idx + 2] * weight;
      }
      const outIdx = (y * w + x) << 2;
      data[outIdx] = r;
      data[outIdx + 1] = g;
      data[outIdx + 2] = b;
      data[outIdx + 3] = temp[outIdx + 3];
    }
  }

  return data;
}

// ---------------------------------------------------------------------------
// Stage 1: Saliency Map Generation
// ---------------------------------------------------------------------------

/**
 * In-place Gaussian blur for a single-channel Float32Array (separable 1-D passes).
 * @param {Float32Array} data - flat array of length w*h, modified in place
 * @param {number} w
 * @param {number} h
 * @param {number} sigma - standard deviation in pixels
 */
function _gaussianBlur1(data, w, h, sigma) {
  const radius = Math.ceil(sigma * 3);
  const kLen = 2 * radius + 1;
  const kernel = new Float32Array(kLen);
  let kSum = 0;
  for (let i = 0; i < kLen; i++) {
    const x = i - radius;
    kernel[i] = Math.exp(-(x * x) / (2 * sigma * sigma));
    kSum += kernel[i];
  }
  for (let i = 0; i < kLen; i++) kernel[i] /= kSum;

  const N = w * h;
  const temp = new Float32Array(N);

  // Horizontal pass
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let val = 0;
      for (let k = -radius; k <= radius; k++) {
        let nx = x + k;
        if (nx < 0) nx = 0; else if (nx >= w) nx = w - 1;
        val += data[y * w + nx] * kernel[k + radius];
      }
      temp[y * w + x] = val;
    }
  }

  // Vertical pass (write back into data)
  for (let x = 0; x < w; x++) {
    for (let y = 0; y < h; y++) {
      let val = 0;
      for (let k = -radius; k <= radius; k++) {
        let ny = y + k;
        if (ny < 0) ny = 0; else if (ny >= h) ny = h - 1;
        val += temp[ny * w + x] * kernel[k + radius];
      }
      data[y * w + x] = val;
    }
  }
}

/**
 * Generates a per-pixel "detail importance" saliency map normalized to 0.0–1.0.
 *
 * Uses the Sobel gradient magnitude (via the global `sobelMag` from embroidery.js)
 * to detect high-frequency edge regions, then normalizes and optionally blurs the
 * result so that nearby pixels share similar importance scores.
 *
 * @param {Uint8ClampedArray} data  RGBA pixel data, length = w*h*4
 * @param {number}            w     image width in pixels
 * @param {number}            h     image height in pixels
 * @param {object}            [opts]
 * @param {number}            [opts.sigma=3.0]  Gaussian blur sigma in pixels (0 = no blur)
 * @returns {Float32Array}          per-pixel saliency scores, length = w*h, values in [0, 1]
 */
function generateSaliencyMap(data, w, h, { sigma = 3.0 } = {}) {
  const N = w * h;

  // Step 1: Compute Sobel gradient magnitude.
  // sobelMag is a global function defined in embroidery.js.
  const mag = sobelMag(data, w, h); // Float32Array, length N

  // Step 2: Normalize to 0.0–1.0.
  let minVal = Infinity, maxVal = -Infinity;
  for (let i = 0; i < N; i++) {
    if (mag[i] < minVal) minVal = mag[i];
    if (mag[i] > maxVal) maxVal = mag[i];
  }
  const saliency = new Float32Array(N);
  const range = maxVal - minVal;
  if (range > 0) {
    for (let i = 0; i < N; i++) {
      saliency[i] = (mag[i] - minVal) / range;
    }
  }
  // If range === 0 (flat image), saliency stays all-zero — correct behavior.

  // Step 3: Optional Gaussian blur to smooth importance zone boundaries.
  if (sigma > 0) {
    _gaussianBlur1(saliency, w, h, sigma);
    // Re-normalize after blurring (blur can compress the range near boundaries).
    let bMin = Infinity, bMax = -Infinity;
    for (let i = 0; i < N; i++) {
      if (saliency[i] < bMin) bMin = saliency[i];
      if (saliency[i] > bMax) bMax = saliency[i];
    }
    const bRange = bMax - bMin;
    if (bRange > 0) {
      for (let i = 0; i < N; i++) {
        saliency[i] = (saliency[i] - bMin) / bRange;
      }
    }
  }

  return saliency;
}

// ---------------------------------------------------------------------------
// Stage 3: Multi-Stage Morphological Cleaning
// ---------------------------------------------------------------------------

/**
 * Apply binary erosion to a Uint8Array mask in-place using a 3×3 cross structuring element.
 * A pixel survives only if all 4-connected neighbors (N, S, E, W) in the mask are also 1.
 */
function _erode3Cross(mask, w, h, out) {
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      if (!mask[i]) { out[i] = 0; continue; }
      const up    = y > 0     ? mask[(y - 1) * w + x] : 0;
      const down  = y < h - 1 ? mask[(y + 1) * w + x] : 0;
      const left  = x > 0     ? mask[y * w + (x - 1)] : 0;
      const right = x < w - 1 ? mask[y * w + (x + 1)] : 0;
      out[i] = (up && down && left && right) ? 1 : 0;
    }
  }
}

/**
 * Apply binary dilation to a Uint8Array mask in-place using a 3×3 cross structuring element.
 * A pixel is set if it, or any 4-connected neighbor, is 1 in the source mask.
 */
function _dilate3Cross(mask, w, h, out) {
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      if (mask[i]) { out[i] = 1; continue; }
      const up    = y > 0     ? mask[(y - 1) * w + x] : 0;
      const down  = y < h - 1 ? mask[(y + 1) * w + x] : 0;
      const left  = x > 0     ? mask[y * w + (x - 1)] : 0;
      const right = x < w - 1 ? mask[y * w + (x + 1)] : 0;
      out[i] = (up || down || left || right) ? 1 : 0;
    }
  }
}

/**
 * Morphological opening: erode then dilate.
 * Returns a new Uint8Array (does not mutate the input).
 */
function _morphOpen(mask, w, h) {
  const tmp = new Uint8Array(mask.length);
  const out = new Uint8Array(mask.length);
  _erode3Cross(mask, w, h, tmp);
  _dilate3Cross(tmp, w, h, out);
  return out;
}

/**
 * Morphological closing: dilate then erode.
 * Returns a new Uint8Array (does not mutate the input).
 */
function _morphClose(mask, w, h) {
  const tmp = new Uint8Array(mask.length);
  const out = new Uint8Array(mask.length);
  _dilate3Cross(mask, w, h, tmp);
  _erode3Cross(tmp, w, h, out);
  return out;
}

/**
 * Stage 3: Morphological cleaning of a quantized pattern.
 *
 * For each unique color ID (processed most-common-first so large background
 * regions get priority), builds a binary mask, applies morphological opening
 * then closing, and writes the result back. Pixels claimed by multiple masks
 * or none are resolved by neighbor-count confidence; ties broken by dE2.
 *
 * @param {Array}   mapped   Array of palette entry objects from doDither/doMap
 * @param {number}  w
 * @param {number}  h
 * @param {Uint8ClampedArray|null} sourceData  Original RGBA pixels (used for dE2 tie-breaking)
 * @param {object}  [opts]
 * @param {number}  [opts.minPixelCount=20]  Skip colors with fewer pixels than this
 * @returns {Array}  The mutated mapped array
 */
function morphologicalClean(mapped, w, h, sourceData = null, { minPixelCount = 20 } = {}) {
  const N = w * h;

  // Count pixels per color and build an index of color entries
  const counts = {};
  const colorEntry = {};
  for (let i = 0; i < N; i++) {
    const id = mapped[i].id;
    if (id === '__skip__' || id === '__empty__') continue;
    counts[id] = (counts[id] || 0) + 1;
    if (!colorEntry[id]) colorEntry[id] = mapped[i];
  }

  // Sort colors: most common first for conflict resolution priority
  const colorIds = Object.keys(counts).filter(id => counts[id] >= minPixelCount);
  colorIds.sort((a, b) => counts[b] - counts[a]);

  if (colorIds.length === 0) return mapped;

  // For each qualifying color: apply opening then closing
  // cleaned[colorId] = processed Uint8Array mask
  const cleaned = {};
  const buf1 = new Uint8Array(N);

  for (const id of colorIds) {
    // Build binary mask
    for (let i = 0; i < N; i++) buf1[i] = mapped[i].id === id ? 1 : 0;
    // Opening (remove tiny protrusions), then closing (fill small holes)
    const opened = _morphOpen(buf1, w, h);
    cleaned[id] = _morphClose(opened, w, h);
  }

  // Resolve conflicts / unclaimed pixels:
  // For every pixel, find which cleaned masks claim it.
  // Build a flat result array starting from the original mapping.
  const result = new Array(N);
  for (let i = 0; i < N; i++) result[i] = mapped[i];

  // claim[i] = colorId string, or null if unclaimed
  // We process most-common first, so the first claimer wins unless confidence resolves it.
  const claim = new Array(N).fill(null);

  for (const id of colorIds) {
    const mask = cleaned[id];
    for (let i = 0; i < N; i++) {
      if (!mask[i]) continue;
      if (claim[i] === null) {
        claim[i] = id;
      } else {
        // Conflict: compare neighbor counts for each claimer vs. current pixel
        const incumbent = claim[i];
        const score = (testId) => {
          const x = i % w, y = (i / w) | 0;
          let n = 0;
          if (x > 0)     n += mapped[i - 1].id === testId ? 1 : 0;
          if (x < w - 1) n += mapped[i + 1].id === testId ? 1 : 0;
          if (y > 0)     n += mapped[i - w].id === testId ? 1 : 0;
          if (y < h - 1) n += mapped[i + w].id === testId ? 1 : 0;
          return n;
        };
        const sNew = score(id);
        const sOld = score(incumbent);
        if (sNew > sOld) {
          claim[i] = id;
        } else if (sNew === sOld && sourceData) {
          // Tie-break with perceptual distance to original pixel
          const si = i * 4;
          const origLab = rgbToLab(sourceData[si], sourceData[si + 1], sourceData[si + 2]);
          const dNew = dE2(origLab, colorEntry[id].lab);
          const dOld = dE2(origLab, colorEntry[incumbent].lab);
          if (dNew < dOld) claim[i] = id;
        }
      }
    }
  }

  // Write results back: only update pixels that were processed and have a claim
  for (let i = 0; i < N; i++) {
    const id = mapped[i].id;
    if (id === '__skip__' || id === '__empty__') continue;
    if (!colorEntry[id]) continue; // color was below minPixelCount — leave as-is

    const winner = claim[i];
    if (winner !== null && winner !== id) {
      result[i] = colorEntry[winner];
    }
    // Unclaimed (claim[i] === null): pixel was eroded away from all masks.
    // Resolve by most-common neighbor color, same as removeOrphanStitches.
    if (winner === null) {
      const x = i % w, y = (i / w) | 0;
      const neighborCounts = {};
      const check = (ni) => {
        const nid = mapped[ni].id;
        if (nid !== '__skip__' && nid !== '__empty__') {
          neighborCounts[nid] = (neighborCounts[nid] || 0) + 1;
        }
      };
      if (x > 0)     check(i - 1);
      if (x < w - 1) check(i + 1);
      if (y > 0)     check(i - w);
      if (y < h - 1) check(i + w);
      let bestNid = null, bestN = -1;
      for (const nid in neighborCounts) {
        if (neighborCounts[nid] > bestN) { bestN = neighborCounts[nid]; bestNid = nid; }
      }
      if (bestNid && colorEntry[bestNid]) {
        result[i] = colorEntry[bestNid];
      }
    }
  }

  // Copy result back into mapped (maintain reference for callers)
  for (let i = 0; i < N; i++) mapped[i] = result[i];
  return mapped;
}

// ---------------------------------------------------------------------------
// Stage 4: Edge Map Generation
// ---------------------------------------------------------------------------

/**
 * One pass of binary dilation with a 3×3 square structuring element.
 * Returns a new Uint8Array; does not mutate the input.
 */
function _dilate3Square(mask, w, h) {
  const N = w * h;
  const out = new Uint8Array(N);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      if (mask[i]) { out[i] = 1; continue; }
      let set = 0;
      for (let dy = -1; dy <= 1 && !set; dy++) {
        const ny = y + dy;
        if (ny < 0 || ny >= h) continue;
        for (let dx = -1; dx <= 1 && !set; dx++) {
          if (!dy && !dx) continue;
          const nx = x + dx;
          if (nx >= 0 && nx < w && mask[ny * w + nx]) set = 1;
        }
      }
      out[i] = set;
    }
  }
  return out;
}

/**
 * Stage 4: Generate a boolean edge mask from the source image.
 *
 * Calls the global `cannyEdges` function from embroidery.js, then optionally
 * dilates the result so stitches immediately adjacent to an edge are also
 * protected from orphan removal in Stage 5.
 *
 * @param {Uint8ClampedArray} data           RGBA source pixels
 * @param {number}            w
 * @param {number}            h
 * @param {object}            [opts]
 * @param {number}            [opts.edgeDilation=1]  Dilation radius in pixels (0 = no buffer)
 * @returns {Uint8Array}  Boolean edge mask of length w*h (1 = edge pixel)
 */
function generateEdgeMap(data, w, h, { edgeDilation = 1 } = {}) {
  // cannyEdges is a global defined in embroidery.js
  let edges = cannyEdges(data, w, h); // Uint8Array, 0/1

  for (let pass = 0; pass < edgeDilation; pass++) {
    edges = _dilate3Square(edges, w, h);
  }

  return edges;
}

// ---------------------------------------------------------------------------
// Stage 5: Edge-Protected Perceptual Orphan Removal
// ---------------------------------------------------------------------------

/**
 * Remove small isolated color clusters ("orphan stitches") from a quantized pattern.
 *
 * Enhancements over the original frequency-based pass:
 *  - Edge protection: clusters overlapping the edge map are skipped entirely.
 *  - Saliency-scaled threshold: orphans in low-saliency (background) regions are
 *    eligible for removal even if they are somewhat larger.
 *  - Perceptual replacement: the replacement color minimizes dE2 to the orphan
 *    color (not merely the most-frequent border neighbor). Frequency is only used
 *    as a tie-break when two candidates are within deTieBreakThreshold ΔE.
 *
 * Backward-compatible: callers that pass only the original four arguments get the
 * same old behavior (edgeMap=null, saliencyMap=null → no edge protection, no
 * saliency scaling, and perceptual selection still improves replacement quality).
 *
 * @param {Array}        mapped
 * @param {number}       w
 * @param {number}       h
 * @param {number}       maxOrphanSize         Base pixel threshold for orphan eligibility
 * @param {Uint8Array}   [edgeMap]             From generateEdgeMap(); null = no protection
 * @param {Float32Array} [saliencyMap]         From generateSaliencyMap(); null = no scaling
 * @param {object}       [opts]
 * @param {number}       [opts.saliencyMultiplier=2.0]    Scales effectiveMaxSize in flat areas
 * @param {number}       [opts.deTieBreakThreshold=1.0]   ΔE within which frequency wins
 */
function removeOrphanStitches(mapped, w, h, maxOrphanSize, edgeMap = null, saliencyMap = null, { saliencyMultiplier = 2.0, deTieBreakThreshold = 1.0 } = {}) {
  if (maxOrphanSize <= 0) return mapped;

  const len = mapped.length;

  // Maximum BFS exploration bound: effectiveMaxSize is maximised when saliency=0
  const absoluteMaxSize = Math.ceil(maxOrphanSize * (1.0 + saliencyMultiplier));

  // Pre-build a color-entry lookup to avoid O(n) scans per orphan
  const colorEntries = {};
  for (let i = 0; i < len; i++) {
    const id = mapped[i].id;
    if (!colorEntries[id]) colorEntries[id] = mapped[i];
  }

  const vis  = new Uint8Array(len);
  // Queue sized for full image to be safe (components exceeding absoluteMaxSize are drained)
  const q    = new Uint32Array(len);
  const comp = new Uint32Array(absoluteMaxSize + 2);

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const idx = y * w + x;
      if (vis[idx]) continue;
      const m = mapped[idx];
      if (m.id === '__skip__' || m.id === '__empty__') { vis[idx] = 1; continue; }

      const tid = m.id;
      let qHead = 0, qTail = 0, compCount = 0;

      q[qTail++] = idx;
      vis[idx] = 1;

      while (qHead < qTail) {
        const curr = q[qHead++];

        if (compCount <= absoluteMaxSize) comp[compCount++] = curr;

        // If already beyond the absolute limit stop expanding (drain handled below)
        if (compCount > absoluteMaxSize) break;

        const cx = curr % w, cy = (curr / w) | 0;
        if (cx > 0)     { const n = curr - 1; if (!vis[n] && mapped[n].id === tid) { vis[n] = 1; q[qTail++] = n; } }
        if (cx < w - 1) { const n = curr + 1; if (!vis[n] && mapped[n].id === tid) { vis[n] = 1; q[qTail++] = n; } }
        if (cy > 0)     { const n = curr - w; if (!vis[n] && mapped[n].id === tid) { vis[n] = 1; q[qTail++] = n; } }
        if (cy < h - 1) { const n = curr + w; if (!vis[n] && mapped[n].id === tid) { vis[n] = 1; q[qTail++] = n; } }
      }

      // Drain remainder so all component pixels are marked visited
      while (qHead < qTail) {
        const curr = q[qHead++];
        const cx = curr % w, cy = (curr / w) | 0;
        if (cx > 0)     { const n = curr - 1; if (!vis[n] && mapped[n].id === tid) { vis[n] = 1; q[qTail++] = n; } }
        if (cx < w - 1) { const n = curr + 1; if (!vis[n] && mapped[n].id === tid) { vis[n] = 1; q[qTail++] = n; } }
        if (cy > 0)     { const n = curr - w; if (!vis[n] && mapped[n].id === tid) { vis[n] = 1; q[qTail++] = n; } }
        if (cy < h - 1) { const n = curr + w; if (!vis[n] && mapped[n].id === tid) { vis[n] = 1; q[qTail++] = n; } }
      }

      // Component exceeds the absolute maximum — cannot be an orphan
      if (compCount > absoluteMaxSize) continue;

      // --- Stage 5, step 2: Edge protection ---
      if (edgeMap) {
        let onEdge = false;
        for (let i = 0; i < compCount; i++) {
          if (edgeMap[comp[i]]) { onEdge = true; break; }
        }
        if (onEdge) continue;
      }

      // --- Stage 5, step 3: Saliency-scaled effective max size ---
      let effectiveMaxSize = maxOrphanSize;
      if (saliencyMap) {
        let saliencySum = 0;
        for (let i = 0; i < compCount; i++) saliencySum += saliencyMap[comp[i]];
        const meanSaliency = saliencySum / compCount;
        effectiveMaxSize = maxOrphanSize * (1.0 + (1.0 - meanSaliency) * saliencyMultiplier);
      }

      if (compCount > effectiveMaxSize) continue;

      // --- Stage 5, step 4: Perceptual replacement color selection ---
      // Collect 8-neighbor border colors with their frequency
      const neighborFreq = {};
      for (let i = 0; i < compCount; i++) {
        const cidx = comp[i];
        const cx = cidx % w, cy = (cidx / w) | 0;
        const checkN = (ni) => {
          const nid = mapped[ni].id;
          if (nid !== tid && nid !== '__skip__' && nid !== '__empty__') {
            neighborFreq[nid] = (neighborFreq[nid] || 0) + 1;
          }
        };
        if (cx > 0)             checkN(cidx - 1);
        if (cx < w - 1)         checkN(cidx + 1);
        if (cy > 0)             checkN(cidx - w);
        if (cy < h - 1)         checkN(cidx + w);
        if (cx > 0 && cy > 0)         checkN(cidx - w - 1);
        if (cx < w-1 && cy > 0)       checkN(cidx - w + 1);
        if (cx > 0 && cy < h-1)       checkN(cidx + w - 1);
        if (cx < w-1 && cy < h-1)     checkN(cidx + w + 1);
      }

      // Find the minimum ΔE distance to the orphan's Lab color
      const orphanLab = m.lab;
      let minDE = Infinity;
      for (const nid in neighborFreq) {
        const entry = colorEntries[nid];
        if (!entry) continue;
        const de = Math.sqrt(dE2(orphanLab, entry.lab));
        if (de < minDE) minDE = de;
      }

      // Among candidates within deTieBreakThreshold of minDE, prefer by frequency
      let bestId = null, bestCount = -1;
      for (const nid in neighborFreq) {
        const entry = colorEntries[nid];
        if (!entry) continue;
        const de = Math.sqrt(dE2(orphanLab, entry.lab));
        if (de - minDE <= deTieBreakThreshold) {
          if (neighborFreq[nid] > bestCount) {
            bestCount = neighborFreq[nid];
            bestId = nid;
          }
        }
      }

      if (bestId) {
        const replacement = colorEntries[bestId];
        for (let i = 0; i < compCount; i++) mapped[comp[i]] = replacement;
      }
    }
  }
  return mapped;
}

// Analyses a mapped pattern and returns confetti stitch statistics without mutating the array.
// "Confetti" = isolated stitches with no same-colour neighbours (component size 1) or tiny
// clusters of 2-3 stitches. These are tedious to stitch because they require a separate thread pass.
//
// Returns: { singles, smallClusters, total, pct, colorConfetti }
//   singles       — stitches in components of exactly 1 cell
//   smallClusters — stitches in components of 2-3 cells
//   total         — singles + smallClusters
//   pct           — total / totalStitchable * 100
//   colorConfetti — { [colorId]: count } mapping of confetti stitches per colour
function analyzeConfetti(mapped, w, h) {
  const len = mapped.length;
  const vis = new Uint8Array(len);
  const q = new Uint32Array(len);

  let totalStitchable = 0;
  let singles = 0;
  let smallClusters = 0;
  const colorConfetti = {};

  for (let startIdx = 0; startIdx < len; startIdx++) {
    if (vis[startIdx]) continue;
    vis[startIdx] = 1;
    const m = mapped[startIdx];
    if (m.id === "__skip__" || m.id === "__empty__") continue;

    const tid = m.id;
    let head = 0, tail = 0;
    q[tail++] = startIdx;

    while (head < tail) {
      const curr = q[head++];
      totalStitchable++;
      const cx = curr % w;
      const cy = (curr / w) | 0;
      if (cx > 0)   { const n = curr-1; if (!vis[n] && mapped[n].id === tid) { vis[n]=1; q[tail++]=n; } }
      if (cx < w-1) { const n = curr+1; if (!vis[n] && mapped[n].id === tid) { vis[n]=1; q[tail++]=n; } }
      if (cy > 0)   { const n = curr-w; if (!vis[n] && mapped[n].id === tid) { vis[n]=1; q[tail++]=n; } }
      if (cy < h-1) { const n = curr+w; if (!vis[n] && mapped[n].id === tid) { vis[n]=1; q[tail++]=n; } }
    }

    const compSize = tail; // tail == cells added == component size
    if (compSize === 1) {
      singles++;
      colorConfetti[tid] = (colorConfetti[tid] || 0) + 1;
    } else if (compSize <= 3) {
      smallClusters += compSize;
      colorConfetti[tid] = (colorConfetti[tid] || 0) + compSize;
    }
  }

  const total = singles + smallClusters;
  const pct = totalStitchable > 0 ? (total / totalStitchable * 100) : 0;
  return { singles, smallClusters, total, pct, colorConfetti };
}

if (typeof module !== 'undefined' && module.exports) { module.exports = { findSolid, findBest, luminance, quantize, doDither, doMap, buildPalette, restoreStitch, applyMedianFilter, applyGaussianBlur, generateSaliencyMap, morphologicalClean, generateEdgeMap, removeOrphanStitches, analyzeConfetti }; }
