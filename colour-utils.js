function findSolid(lab,p){if(!p||!p.length)return{type:"solid",id:"__empty__",name:"",rgb:[0,0,0],lab:[0,0,0],dist:Infinity};let b=null,bd=1e9;for(let i=0;i<p.length;i++){let d=dE2(lab,p[i].lab);if(d<bd){bd=d;b=p[i];if(d===0)break;/* PERF (perf-7 #1): exact-match early exit avoids scanning the rest of the palette when the input lab is already in p */}}return{type:"solid",id:b.id,name:b.name,rgb:b.rgb,lab:b.lab,dist:Math.sqrt(bd)};}
function findBest(lab, palette, allowBlends = true) {
  const solidMatch = findSolid(lab, palette);
  if (!allowBlends || !findBest._blends || findBest._blendPalette !== palette) return solidMatch;

  // Use CIEDE2000 (dE2000) for blend search and solid-vs-blend decision so that
  // perceptually similar blues/purples and warm reds are compared accurately.
  // findSolid still uses dE2 (Euclidean LAB) for speed — it's called per-pixel
  // during dithering; findBest's blend loop is palette²/2 iterations at most.
  const solidDist00 = dE2000(lab, solidMatch.lab);

  let bestBlendDist00 = 1e9;
  let bestBlendIdx = -1;
  const blends = findBest._blends;
  for (let i = 0; i < blends.length; i++) {
    const dist = dE2000(lab, blends[i].lab);
    if (dist < bestBlendDist00) { bestBlendDist00 = dist; bestBlendIdx = i; }
  }

  if (bestBlendIdx >= 0 && (bestBlendDist00 + 3 < solidDist00) && solidDist00 > 5) {
    const b = blends[bestBlendIdx];
    return {
      type: "blend",
      id: b.id,
      name: b.id,
      rgb: b.rgb,
      lab: b.lab,
      threads: b.threads,
      dist: bestBlendDist00
    };
  }

  return solidMatch;
}
// Pre-compute blend pairs once per palette — call before dithering.
findBest.precomputeBlends = function(palette) {
  findBest._blendPalette = palette;
  const blends = [];
  for (let i = 0; i < palette.length; i++) {
    for (let j = i + 1; j < palette.length; j++) {
      const a = palette[i], b = palette[j];
      const lab = [(a.lab[0]+b.lab[0])/2, (a.lab[1]+b.lab[1])/2, (a.lab[2]+b.lab[2])/2];
      // Canonicalise blend ID so [a,b] and [b,a] always produce the same string.
      const blendId = [String(a.id), String(b.id)].sort().join("+");
      blends.push({
        id: blendId,
        lab: lab,
        rgb: [Math.round((a.rgb[0]+b.rgb[0])/2), Math.round((a.rgb[1]+b.rgb[1])/2), Math.round((a.rgb[2]+b.rgb[2])/2)],
        threads: [a, b]
      });
    }
  }
  findBest._blends = blends;
};
function luminance(rgb){return rgb[0]*0.299+rgb[1]*0.587+rgb[2]*0.114;}

function quantize(data,w,h,n,allowedPalette,options){
  var pool=allowedPalette&&allowedPalette.length?allowedPalette:DMC;
  var maxN=Math.min(n,pool.length);
  let seed=(options&&options.seed!=null)?options.seed:1337;
  function random(){let t=seed+=0x6D2B79F5;t=Math.imul(t^t>>>15,t|1);t^=t+Math.imul(t^t>>>7,t|61);return((t^t>>>14)>>>0)/4294967296;}
  // PERF (perf-1 #1): pre-allocate px[] (was push in tight per-pixel loop)
  let len=w*h, px=new Array(len);
  for(let i=0;i<len;i++){let j=i*4;px[i]=rgbToLab(data[j],data[j+1],data[j+2]);}
  let cs=[px[Math.floor(random()*px.length)]];
  let ds=new Float32Array(px.length);
  for(let i=0;i<px.length;i++){ds[i]=1e9;}
  while(cs.length<Math.min(maxN,px.length)){
    let lastCenter=cs[cs.length-1];
    let sum=0;
    for(let i=0;i<px.length;i++){
      let distSq=dE2(px[i],lastCenter);
      if(distSq<ds[i])ds[i]=distSq;
      sum+=ds[i];
    }
    let r=random()*sum,acc=0;
    for(let i=0;i<px.length;i++){
      acc+=ds[i];
      if(acc>=r){cs.push([px[i][0],px[i][1],px[i][2]]);break;}
    }
  }
  // PERF (perf-1 #2): replaced per-iteration `cs.map(()=>[])` cluster arrays
  // and 3× reduce() with reusable Float64Array sums + Uint32Array counts.
  // Avoids ~N×iterations array allocations and per-pixel push() growth.
  let _sumL=new Float64Array(cs.length),_sumA=new Float64Array(cs.length),_sumB=new Float64Array(cs.length),_cnt=new Uint32Array(cs.length);
  for(let it=0;it<20;it++){
    _sumL.fill(0);_sumA.fill(0);_sumB.fill(0);_cnt.fill(0);
    for(let pi=0;pi<px.length;pi++){
      let md=1e9,mi=0;
      let pL=px[pi][0],pA=px[pi][1],pB=px[pi][2];
      for(let c=0;c<cs.length;c++){let d=dE2(px[pi],cs[c]);if(d<md){md=d;mi=c;}}
      _sumL[mi]+=pL;_sumA[mi]+=pA;_sumB[mi]+=pB;_cnt[mi]++;
    }
    let mv=false;
    for(let c2=0;c2<cs.length;c2++){
      if(!_cnt[c2])continue;
      let nv=[_sumL[c2]/_cnt[c2],_sumA[c2]/_cnt[c2],_sumB[c2]/_cnt[c2]];
      if(dE2(nv,cs[c2])>0.25)mv=true;
      cs[c2]=nv;
    }
    if(!mv)break;
  }
  let pl=[],used=new Set();
  for(let ci=0;ci<cs.length;ci++){
    let b=null,bd=1e9;
    for(let ti=0;ti<pool.length;ti++){
      if(used.has(pool[ti].id))continue;
      let d2=dE2(cs[ci],pool[ti].lab);if(d2<bd){bd=d2;b=pool[ti];}
    }
    if(b){used.add(b.id);pl.push(b);}
  }
  // Empty-palette fallback: if no DMC matches were found (e.g. allowedPalette
  // was empty or all pixels mapped to identical centres that exhausted the
  // pool), return a single-colour palette using the median pixel colour so
  // downstream pipeline stages don't abort.
  if(!pl.length){
    if(px.length){
      let mid=px[Math.floor(px.length/2)];
      let b=null,bd=1e9;
      for(let ti=0;ti<pool.length;ti++){
        let d2=dE2(mid,pool[ti].lab);if(d2<bd){bd=d2;b=pool[ti];}
      }
      if(b)pl.push(b);
    }
  }
  return pl;
}
function quantizeConstrained(data,w,h,n,allowedPalette,options){
  var pool=allowedPalette&&allowedPalette.length?allowedPalette:DMC;
  var maxN=Math.min(n,pool.length);
  let seed=(options&&options.seed!=null)?options.seed:1337;
  function random(){let t=seed+=0x6D2B79F5;t=Math.imul(t^t>>>15,t|1);t^=t+Math.imul(t^t>>>7,t|61);return((t^t>>>14)>>>0)/4294967296;}
  let len=w*h, px=new Array(len), pxOk=new Array(len);
  for(let i=0;i<len;i++){let j=i*4;px[i]=rgbToLab(data[j],data[j+1],data[j+2]);pxOk[i]=rgbToOklab(data[j],data[j+1],data[j+2]);}
  // Pre-compute OKLab for every pool entry once, computing on-the-fly for any
  // entry that lacks .oklab (e.g. stash entries loaded from IndexedDB that were
  // serialised before this field was added). Without this guard, pool[ti].oklab
  // being undefined causes dE2ok → NaN, the k-means++ while loop breaks after
  // the first centre, and every pixel collapses to a single grey average.
  let poolOk=new Array(pool.length);
  for(let ti=0;ti<pool.length;ti++)poolOk[ti]=pool[ti].oklab||rgbToOklab(pool[ti].rgb[0],pool[ti].rgb[1],pool[ti].rgb[2]);
  // k-means++ initialisation: pick directly from pool (DMC entries), not free pixel LABs.
  // This keeps every centroid on an achievable DMC colour throughout all iterations.
  // csOk tracks the OKLab triplet for each selected centre in parallel with cs[].
  let cs=[], csOk=[], usedInit=new Set();
  {
    let fp=px[Math.floor(random()*len)];
    let b=null,bd=1e9,bti=-1;
    for(let ti=0;ti<pool.length;ti++){let d=dE2(fp,pool[ti].lab);if(d<bd){bd=d;b=pool[ti];bti=ti;}}
    if(b){cs.push(b);csOk.push(poolOk[bti]);usedInit.add(b.id);}
  }
  // familyBonus < 1 discounts distance for pool entries from colour families
  // not yet in the selection, nudging initial centres to span the DMC colour
  // wheel rather than clustering in one family. 0.85 = 15% discount.
  let familyBonus=(options&&options.familyBonus!=null)?options.familyBonus:0.85;
  let familiesInCs=new Set(cs.filter(function(e){return e.fam>0;}).map(function(e){return e.fam;}));
  let ds=new Float32Array(len);
  for(let i=0;i<len;i++)ds[i]=1e9;
  while(cs.length<Math.min(maxN,pool.length)){
    // Use OKLab for k-means++ distance weighting: better hue uniformity than
    // CIE LAB, so the probabilistic sampling reflects perceptual spread more accurately.
    let lastOk=csOk[csOk.length-1];
    let sum=0;
    for(let i=0;i<len;i++){
      let d=dE2ok(pxOk[i],lastOk);
      if(d<ds[i])ds[i]=d;
      sum+=ds[i];
    }
    if(!sum)break;
    let r=random()*sum,acc=0,chosenPxOk=null;
    for(let i=0;i<len;i++){acc+=ds[i];if(acc>=r){chosenPxOk=pxOk[i];break;}}
    if(!chosenPxOk)chosenPxOk=pxOk[len-1];
    let b=null,bd=1e9,bti=-1;
    for(let ti=0;ti<pool.length;ti++){
      if(usedInit.has(pool[ti].id))continue;
      let d=dE2ok(chosenPxOk,poolOk[ti]);
      // Apply diversity discount for entries from families not yet selected.
      if(familyBonus<1&&pool[ti].fam>0&&!familiesInCs.has(pool[ti].fam))d*=familyBonus;
      if(d<bd){bd=d;b=pool[ti];bti=ti;}
    }
    if(!b)break;
    cs.push(b);csOk.push(poolOk[bti]);usedInit.add(b.id);
    if(b.fam>0)familiesInCs.add(b.fam);
  }
  // Constrained Lloyd's iterations: after each assignment, snap each centroid to
  // the nearest unused pool entry (greedy in cluster order) rather than a free
  // LAB point. This eliminates the double-error of unconstrained k-means → final snap.
  // Per-pixel assignment uses OKLab (better hue linearity); centroid-to-pool
  // snapping uses dE2000 (perceptually accurate for small palette decisions).
  let _sumL=new Float64Array(cs.length),_sumA=new Float64Array(cs.length),_sumB=new Float64Array(cs.length),_cnt=new Uint32Array(cs.length);
  for(let it=0;it<20;it++){
    _sumL.fill(0);_sumA.fill(0);_sumB.fill(0);_cnt.fill(0);
    for(let pi=0;pi<len;pi++){
      let md=1e9,mi=0;
      for(let c=0;c<cs.length;c++){let d=dE2ok(pxOk[pi],csOk[c]);if(d<md){md=d;mi=c;}}
      _sumL[mi]+=px[pi][0];_sumA[mi]+=px[pi][1];_sumB[mi]+=px[pi][2];_cnt[mi]++;
    }
    let mv=false;
    let usedIter=new Set();
    for(let c=0;c<cs.length;c++){
      // Empty cluster: anchor to current centre to keep it stable; it still
      // competes for pool entries so a previously-claimed entry can't cause
      // a duplicate in the output.
      let centroid=_cnt[c]>0?[_sumL[c]/_cnt[c],_sumA[c]/_cnt[c],_sumB[c]/_cnt[c]]:cs[c].lab;
      let b=null,bd=1e9,bti=-1;
      for(let ti=0;ti<pool.length;ti++){
        if(usedIter.has(pool[ti].id))continue;
        let d=dE2000(centroid,pool[ti].lab);if(d<bd){bd=d;b=pool[ti];bti=ti;}
      }
      if(!b)continue;
      if(b.id!==cs[c].id)mv=true;
      cs[c]=b;csOk[c]=poolOk[bti];usedIter.add(b.id);
    }
    if(!mv)break;
  }
  // Empty-palette fallback: mirrors quantize behaviour
  if(!cs.length){
    if(len){
      let mid=px[Math.floor(len/2)];
      let b=null,bd=1e9;
      for(let ti=0;ti<pool.length;ti++){let d=dE2(mid,pool[ti].lab);if(d<bd){bd=d;b=pool[ti];}}
      if(b)cs.push(b);
    }
  }
  return cs;
}
/**
 * Atkinson dithering with Stage 2 confetti-aware color selection.
 *
 * Uses the Atkinson kernel which propagates only 6/8 of the quantisation
 * error (the remaining 1/4 is discarded). This produces naturally clustered
 * colour regions rather than scattered confetti, which is preferable for
 * cross-stitch where each cell is a visible stitch.
 *
 * Kernel (each weight 1/8, sum = 6/8):
 *   . X 1 1
 *   1 1 1
 *     1
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
 * @param {number}            [opts.ditherStrength=1.0]  multiplier for Atkinson
 *                                           error weights. 0.5 = weak/subtle,
 *                                           1.0 = standard Atkinson, 1.5 = strong/aggressive.
 */
function doDither(data, w, h, pal, allowBlends = true, saliencyMap = null, { confettiDitherThreshold = 4.0, ditherStrength = 1.0 } = {}) {
  const N = w * h;

  // Pre-compute blend table once for the whole dithering pass
  // precomputeBlends is attached lazily on first use
  if (allowBlends && typeof findBest.precomputeBlends === 'function') findBest.precomputeBlends(pal);

  // PERF (deferred-4): default-on feature flag for the secondBest id-map
  // short-circuit. ON replaces the per-pixel O(palette) scan inside the
  // confetti penalty loop with an O(4) id-map lookup; output is bit-exact
  // equivalent. OFF restores the legacy palette scan byte-for-byte.
  // See reports/deferred-4-dodither-secondbest-shortcircuit-analysis.md.
  const _PF = (typeof window !== 'undefined' && window.PERF_FLAGS) || {};
  const _useIdMap = _PF.dodither_secondBest_idmap !== false;
  let _palIdMap = null;
  if (_useIdMap) {
    _palIdMap = new Map();
    for (let pi = 0; pi < pal.length; pi++) _palIdMap.set(pal[pi].id, pal[pi]);
  }

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
        // PERF (perf-1 #3): replaced per-pixel `new Set()` with a small 4-slot
        // string array — at most 4 neighbours, linear scan beats Set churn.
        let nb0=null,nb1=null,nb2=null,nb3=null;
        if (y > 0) {
          if (x > 0)     nb0 = r[idx - w - 1].id;
                         nb1 = r[idx - w].id;
          if (x < w - 1) nb2 = r[idx - w + 1].id;
        }
        if (x > 0)       nb3 = r[idx - 1].id;

        const bestId = best.id;
        const bestNeighbour = (bestId === nb0 || bestId === nb1 || bestId === nb2 || bestId === nb3);

        // If the best color is already represented in a neighbor, no confetti risk.
        if (!bestNeighbour) {
          // Find the closest palette color that shares a neighbor's ID.
          let secondBest = null;
          let secondBestDistSq = Infinity;

          if (_useIdMap) {
            // PERF (deferred-4): direct id-map lookup, O(unique neighbours) ≤ 4.
            // Inline dedupe — at most 4 IDs, faster than a Set.
            for (let nbi = 0; nbi < 4; nbi++) {
              const nid = nbi === 0 ? nb0 : nbi === 1 ? nb1 : nbi === 2 ? nb2 : nb3;
              if (!nid) continue;
              // skip duplicate of an earlier slot
              if (nbi > 0 && nid === nb0) continue;
              if (nbi > 1 && nid === nb1) continue;
              if (nbi > 2 && nid === nb2) continue;
              const entry = _palIdMap.get(nid);
              if (!entry) continue;
              const distSq = dE2(targetLab, entry.lab);
              if (distSq < secondBestDistSq) {
                secondBestDistSq = distSq;
                secondBest = entry;
              }
            }
          } else {
            // Legacy path: full palette scan.
            for (let pi = 0; pi < pal.length; pi++) {
              const entry = pal[pi];
              const eid = entry.id;
              if (eid !== nb0 && eid !== nb1 && eid !== nb2 && eid !== nb3) continue;
              const distSq = dE2(targetLab, entry.lab);
              if (distSq < secondBestDistSq) {
                secondBestDistSq = distSq;
                secondBest = entry;
              }
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

      // Atkinson error diffusion (scaled by ditherStrength).
      // 6 neighbours × 1/8 each = 6/8 total — the remaining 1/4 is
      // intentionally discarded, which clusters colours into coherent
      // zones and dramatically reduces isolated confetti stitches.
      const eR = (cr - chosen.rgb[0]) * ditherStrength;
      const eG = (cg - chosen.rgb[1]) * ditherStrength;
      const eB = (cb - chosen.rgb[2]) * ditherStrength;

      // Row 0: right +1, right +2
      if (x + 1 < w) {
        const ni = (idx + 1) * 3;
        d[ni]     += eR / 8;
        d[ni + 1] += eG / 8;
        d[ni + 2] += eB / 8;
      }
      if (x + 2 < w) {
        const ni2 = (idx + 2) * 3;
        d[ni2]     += eR / 8;
        d[ni2 + 1] += eG / 8;
        d[ni2 + 2] += eB / 8;
      }
      // Row 1: below-left, below, below-right
      if (y + 1 < h) {
        if (x > 0) {
          const ni3 = (idx + w - 1) * 3;
          d[ni3]     += eR / 8;
          d[ni3 + 1] += eG / 8;
          d[ni3 + 2] += eB / 8;
        }
        const ni4 = (idx + w) * 3;
        d[ni4]     += eR / 8;
        d[ni4 + 1] += eG / 8;
        d[ni4 + 2] += eB / 8;
        if (x + 1 < w) {
          const ni5 = (idx + w + 1) * 3;
          d[ni5]     += eR / 8;
          d[ni5 + 1] += eG / 8;
          d[ni5 + 2] += eB / 8;
        }
      }
      // Row 2: two rows below
      if (y + 2 < h) {
        const ni6 = (idx + w * 2) * 3;
        d[ni6]     += eR / 8;
        d[ni6 + 1] += eG / 8;
        d[ni6 + 2] += eB / 8;
      }
    }
  }
  return r;
}
/**
 * Ordered (Bayer) dithering — threshold-based, no error propagation.
 *
 * For each pixel, a threshold value from the Bayer matrix is added to the
 * pixel's RGB channels before palette lookup. Because the threshold pattern
 * is perfectly regular, colour transitions produce clean geometric patterns
 * rather than scattered confetti — ideal for geometric and pixel-art designs.
 *
 * Available matrix sizes:
 *   2 → 2×2 (4 levels,  spread 32) — bold, coarse pattern
 *   4 → 4×4 (16 levels, spread 48) — standard Bayer  [default]
 *   8 → 8×8 (64 levels, spread 64) — fine, smooth transitions
 *
 * @param {Uint8ClampedArray} data        RGBA source pixels
 * @param {number}            w
 * @param {number}            h
 * @param {Array}             pal         palette entries (each has .id, .rgb, .lab)
 * @param {boolean}           [allowBlends]
 * @param {2|4|8}             [bayerSize=4]  matrix size
 */
function doBayerDither(data, w, h, pal, allowBlends = true, bayerSize = 4) {
  // Standard Bayer threshold matrices (integer values 0..n²-1).
  const B2 = [[0,2],[3,1]];
  const B4 = [[ 0, 8, 2,10],[12, 4,14, 6],[ 3,11, 1, 9],[15, 7,13, 5]];
  const B8 = [
    [ 0,32, 8,40, 2,34,10,42],[48,16,56,24,50,18,58,26],
    [12,44, 4,36,14,46, 6,38],[60,28,52,20,62,30,54,22],
    [ 3,35,11,43, 1,33, 9,41],[51,19,59,27,49,17,57,25],
    [15,47, 7,39,13,45, 5,37],[63,31,55,23,61,29,53,21],
  ];

  let matrix, n, spread;
  if      (bayerSize === 2) { matrix = B2; n = 2; spread = 32; }
  else if (bayerSize === 8) { matrix = B8; n = 8; spread = 64; }
  else                      { matrix = B4; n = 4; spread = 48; } // default 4×4

  // Pre-compute blend table once (same as Atkinson path).
  if (allowBlends && typeof findBest.precomputeBlends === 'function') findBest.precomputeBlends(pal);

  const N = w * h;
  const r = new Array(N);

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const idx = y * w + x;
      const base = idx * 4;

      // Normalised threshold: t ∈ (-0.5, 0.5).
      // Adding 0.5 before dividing centres each quantisation level.
      const t = (matrix[y % n][x % n] + 0.5) / (n * n) - 0.5;

      // Apply threshold offset to RGB channels, then clamp.
      const adj_r = Math.max(0, Math.min(255, data[base]     + t * spread));
      const adj_g = Math.max(0, Math.min(255, data[base + 1] + t * spread));
      const adj_b = Math.max(0, Math.min(255, data[base + 2] + t * spread));

      r[idx] = findBest(rgbToLab(adj_r, adj_g, adj_b), pal, allowBlends);
    }
  }

  return r;
}

/**
 * Riemersma dithering: traverses pixels along a Hilbert space-filling curve
 * and propagates quantisation error to the next ~16 pixels with exponential
 * decay. Because the Hilbert curve visits spatially nearby pixels in close
 * sequence, errors stay local and the result contains fewer isolated stitches
 * (confetti) than raster-order diffusion algorithms like Atkinson.
 *
 * Reference: Riemersma, T. (1999). Dithering. CompuPhase.
 *   https://www.compuphase.com/riemer.htm
 *
 * @param {Uint8ClampedArray} data
 * @param {number}            w
 * @param {number}            h
 * @param {Array}             pal
 * @param {boolean}           [allowBlends=true]
 * @param {Float32Array|null} [saliencyMap]   accepted for API parity with doDither; unused
 * @param {object}            [opts]
 * @param {number}            [opts.queueLen=16]  error history length
 */
function doRiemersma(data, w, h, pal, allowBlends, saliencyMap, opts) {
  if (allowBlends === undefined) allowBlends = true;
  var QUEUE_LEN = (opts && opts.queueLen != null) ? opts.queueLen : 16;

  // Pre-compute blend table once per palette
  if (allowBlends && typeof findBest.precomputeBlends === 'function') findBest.precomputeBlends(pal);

  // Exponential decay weights: weight[0] = most recent, weight[QUEUE_LEN-1] = oldest
  // mult chosen so the oldest weight = 1/QUEUE_LEN of the newest.
  var mult = Math.pow(1 / QUEUE_LEN, 1 / (QUEUE_LEN - 1));
  var weights = new Float32Array(QUEUE_LEN);
  var wSum = 0;
  for (var wi = 0; wi < QUEUE_LEN; wi++) { weights[wi] = Math.pow(mult, wi); wSum += weights[wi]; }
  for (var wi2 = 0; wi2 < QUEUE_LEN; wi2++) weights[wi2] /= wSum;

  // Working float buffer (pixel values may need error correction beyond [0,255])
  var N = w * h;
  var buf = new Float32Array(N * 3);
  for (var i = 0; i < N; i++) {
    buf[i * 3]     = data[i * 4];
    buf[i * 3 + 1] = data[i * 4 + 1];
    buf[i * 3 + 2] = data[i * 4 + 2];
  }

  var result = new Array(N);

  // Circular error queue
  var qR = new Float32Array(QUEUE_LEN);
  var qG = new Float32Array(QUEUE_LEN);
  var qB = new Float32Array(QUEUE_LEN);
  var pos = 0;  // global step counter along the curve

  // Hilbert curve: convert 1D index d to (x,y) for a 2^order × 2^order grid.
  // Standard rotate-and-reflect algorithm (Thompson & Cunniff, 1994).
  function d2xy(order, d) {
    var x = 0, y = 0;
    for (var s = 1; s < (1 << order); s <<= 1) {
      var rx = (d & 2) ? 1 : 0;
      var ry = ((d & 1) ^ rx) ? 1 : 0;
      if (ry === 0) {
        if (rx === 1) { x = s - 1 - x; y = s - 1 - y; }
        var tmp = x; x = y; y = tmp;
      }
      x += s * rx; y += s * ry;
      d >>= 2;
    }
    return [x, y];
  }

  var order = Math.max(1, Math.ceil(Math.log2(Math.max(w, h, 1))));
  var side = 1 << order;
  var total = side * side;

  for (var d = 0; d < total; d++) {
    var xy = d2xy(order, d);
    var px = xy[0], py = xy[1];
    if (px >= w || py >= h) continue;  // outside image bounds

    var idx = py * w + px;

    // Accumulate weighted error from the queue
    var accR = 0, accG = 0, accB = 0;
    for (var qi = 0; qi < QUEUE_LEN; qi++) {
      var slot = (pos - 1 - qi + QUEUE_LEN * 2) % QUEUE_LEN;
      accR += qR[slot] * weights[qi];
      accG += qG[slot] * weights[qi];
      accB += qB[slot] * weights[qi];
    }

    var cr = Math.max(0, Math.min(255, buf[idx * 3]     + accR));
    var cg = Math.max(0, Math.min(255, buf[idx * 3 + 1] + accG));
    var cb = Math.max(0, Math.min(255, buf[idx * 3 + 2] + accB));

    var chosen = findBest(rgbToLab(cr, cg, cb), pal, allowBlends);
    result[idx] = chosen;

    // Saliency-aware error decay: high-saliency (edge) pixels absorb their own
    // quantisation error rather than propagating it to neighbours. This keeps
    // detail-region colour boundaries sharp while still dithering flat areas.
    var saliencyScale = (saliencyMap && idx < saliencyMap.length) ? (1.0 - saliencyMap[idx]) : 1.0;
    var slot2 = pos % QUEUE_LEN;
    qR[slot2] = (cr - chosen.rgb[0]) * saliencyScale;
    qG[slot2] = (cg - chosen.rgb[1]) * saliencyScale;
    qB[slot2] = (cb - chosen.rgb[2]) * saliencyScale;
    pos++;
  }

  return result;
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

function hueFromRgb(rgb){var r=rgb[0]/255,g=rgb[1]/255,b=rgb[2]/255;var max=Math.max(r,g,b),min=Math.min(r,g,b);if(max===min)return 0;var d=max-min,h;if(max===r)h=((g-b)/d+(g<b?6:0))/6;else if(max===g)h=((b-r)/d+2)/6;else h=((r-g)/d+4)/6;return h*360;}

// Hoisted out of analyseColourCoverage so the bucket array isn't reallocated each call.
var HUE_BUCKETS=[
  {name:"Red",min:330,max:360,min2:0,max2:30},
  {name:"Orange",min:30,max:60},
  {name:"Yellow",min:60,max:90},
  {name:"Green",min:90,max:170},
  {name:"Cyan",min:170,max:200},
  {name:"Blue",min:200,max:260},
  {name:"Purple",min:260,max:330}
];
function analyseColourCoverage(img,palette,sampleSize){
  sampleSize=sampleSize||5000;
  function rgbToHsl(r,g,b){r/=255;g/=255;b/=255;var max=Math.max(r,g,b),min=Math.min(r,g,b),h,s,l=(max+min)/2;if(max===min){h=0;s=0;}else{var d=max-min;s=l>0.5?d/(2-max-min):d/(max+min);if(max===r)h=((g-b)/d+(g<b?6:0))/6;else if(max===g)h=((b-r)/d+2)/6;else h=((r-g)/d+4)/6;h*=360;}return{h:h,s:s,l:l};}
  function inBucket(hue,bucket){if(bucket.min2!==undefined)return(hue>=bucket.min&&hue<bucket.max)||(hue>=bucket.min2&&hue<bucket.max2);return hue>=bucket.min&&hue<bucket.max;}
  var c=document.createElement("canvas");
  var scale=Math.sqrt(sampleSize/(img.width*img.height));if(scale>=1)scale=1;
  c.width=Math.max(1,Math.round(img.width*scale));c.height=Math.max(1,Math.round(img.height*scale));
  var cx=c.getContext("2d");cx.drawImage(img,0,0,c.width,c.height);
  var data=cx.getImageData(0,0,c.width,c.height).data;
  var imgBuckets={};HUE_BUCKETS.forEach(function(b){imgBuckets[b.name]=0;});var totalChromatic=0;
  for(var i=0;i<data.length;i+=4){var hsl=rgbToHsl(data[i],data[i+1],data[i+2]);if(hsl.s<0.12||hsl.l<0.08||hsl.l>0.92)continue;totalChromatic++;for(var bi=0;bi<HUE_BUCKETS.length;bi++){if(inBucket(hsl.h,HUE_BUCKETS[bi])){imgBuckets[HUE_BUCKETS[bi].name]++;break;}}}
  var stashBuckets={};HUE_BUCKETS.forEach(function(b){stashBuckets[b.name]=0;});
  palette.forEach(function(t){var hsl=rgbToHsl(t.rgb[0],t.rgb[1],t.rgb[2]);if(hsl.s<0.12)return;for(var bi=0;bi<HUE_BUCKETS.length;bi++){if(inBucket(hsl.h,HUE_BUCKETS[bi])){stashBuckets[HUE_BUCKETS[bi].name]++;break;}}});
  var gaps=[];
  if(totalChromatic>0){HUE_BUCKETS.forEach(function(b){var imgPct=imgBuckets[b.name]/totalChromatic;var stashCount=stashBuckets[b.name];if(imgPct>0.15&&stashCount===0)gaps.push({hue:b.name,severity:"high",imgPct:Math.round(imgPct*100)});else if(imgPct>0.08&&stashCount<=1)gaps.push({hue:b.name,severity:"medium",imgPct:Math.round(imgPct*100)});});}
  return{gaps:gaps,hasGaps:gaps.length>0};
}
function buildPalette(patArr){
  let usage={};
  let symbolMap={};
  for(let i=0;i<patArr.length;i++){
    let m=patArr[i];if(m.id==="__skip__"||m.id==="__empty__")continue;
    if(!usage[m.id]){usage[m.id]={id:m.id,type:m.type,name:m.name,rgb:m.rgb,lab:m.lab,threads:m.threads,count:0};}
    usage[m.id].count++;
    if(m.symbol&&!symbolMap[m.id])symbolMap[m.id]=m.symbol;
  }
  let entries=Object.values(usage).sort((a,b)=>b.count-a.count);
  entries.forEach((e,i)=>{
    e.symbol=symbolMap[e.id]||SYMS[i%SYMS.length];
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
  if(m.id==="__empty__")return{type:"solid",id:"__empty__",rgb:[255,255,255],lab:[100,0,0]};
  if(m.type==="blend"){
    let ids=splitBlendId(m.id),t0=findThreadInCatalog('dmc',ids[0]),t1=findThreadInCatalog('dmc',ids[1]);
    if(t0&&t1)return{type:"blend",id:m.id,name:m.id,rgb:[Math.round((t0.rgb[0]+t1.rgb[0])/2),Math.round((t0.rgb[1]+t1.rgb[1])/2),Math.round((t0.rgb[2]+t1.rgb[2])/2)],lab:[(t0.lab[0]+t1.lab[0])/2,(t0.lab[1]+t1.lab[1])/2,(t0.lab[2]+t1.lab[2])/2],threads:[t0,t1],dist:0};
  }
  let dmc=findThreadInCatalog('dmc',m.id);
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

/**
 * Edge-preserving bilateral filter tuned for cross-stitch pre-quantisation.
 * Merges intra-zone colour variation (fabric texture, lighting) while keeping
 * hard colour-zone boundaries sharp, reducing confetti before quantise runs.
 *
 * Wider sigmaR (50) vs the wand tool's version (30) is intentional: we want
 * aggressive within-region colour merging before palette selection.
 *
 * Mutates `data` in-place (same contract as applyGaussianBlur / applyMedianFilter).
 *
 * @param {Uint8ClampedArray} data   RGBA pixels
 * @param {number}            w
 * @param {number}            h
 * @param {object}            [opts]
 * @param {number}            [opts.sigmaS=8]   spatial Gaussian sigma (pixels)
 * @param {number}            [opts.sigmaR=50]  range Gaussian sigma (0–255 scale)
 * @param {number}            [opts.radius=5]   kernel half-width
 */
function applyBilateralFilter(data, w, h, opts) {
  const sigmaS = (opts && opts.sigmaS != null) ? opts.sigmaS : 8.0;
  const sigmaR = (opts && opts.sigmaR != null) ? opts.sigmaR : 50.0;
  const R      = (opts && opts.radius  != null) ? opts.radius  : 5;
  const sigS2  = 2 * sigmaS * sigmaS;
  const sigR2  = 2 * sigmaR * sigmaR;
  const kd     = 2 * R + 1;

  // Pre-compute spatial weight table (constant per kernel offset)
  const spatialW = new Float32Array(kd * kd);
  for (let ky = -R; ky <= R; ky++) {
    for (let kx = -R; kx <= R; kx++) {
      spatialW[(ky + R) * kd + (kx + R)] = Math.exp(-(kx * kx + ky * ky) / sigS2);
    }
  }

  // Range-weight LUT (indexed by quantised squared RGB distance)
  // Max squared RGB dist = 3 × 255² = 195075 → map to 1024 buckets
  const LUT_N  = 1024;
  const LUT_SC = 195075 / (LUT_N - 1);
  const rangeLUT = new Float32Array(LUT_N);
  for (let i = 0; i < LUT_N; i++) rangeLUT[i] = Math.exp(-(i * LUT_SC) / sigR2);

  const out = new Uint8ClampedArray(data.length);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const ci = (y * w + x) * 4;
      const cr = data[ci], cg = data[ci + 1], cb = data[ci + 2];
      let sr = 0, sg = 0, sb = 0, wSum = 0;
      for (let ky = -R; ky <= R; ky++) {
        const ny = Math.max(0, Math.min(h - 1, y + ky));
        for (let kx = -R; kx <= R; kx++) {
          const nx  = Math.max(0, Math.min(w - 1, x + kx));
          const ni  = (ny * w + nx) * 4;
          const dr  = data[ni] - cr, dg = data[ni + 1] - cg, db = data[ni + 2] - cb;
          const rid = Math.min(LUT_N - 1, (dr * dr + dg * dg + db * db) / LUT_SC) | 0;
          const wt  = spatialW[(ky + R) * kd + (kx + R)] * rangeLUT[rid];
          sr += data[ni] * wt;  sg += data[ni + 1] * wt;  sb += data[ni + 2] * wt;
          wSum += wt;
        }
      }
      out[ci]     = sr / wSum;
      out[ci + 1] = sg / wSum;
      out[ci + 2] = sb / wSum;
      out[ci + 3] = data[ci + 3];
    }
  }
  data.set(out);
  return data;
}

// ---------------------------------------------------------------------------
// Image processing primitives (Gaussian blur, Sobel, Canny).
// These are defined as function declarations in embroidery.js for embroidery
// pages.  The fallbacks below ensure they are available when colour-utils.js
// is loaded without embroidery.js (e.g. the creator app).
// Use globalThis for CANNY_* defaults so this file does not create hoisted
// script-scope bindings that can mask globals or conflict with later const
// declarations in embroidery.js.
// ---------------------------------------------------------------------------
if (typeof globalThis.CANNY_BLUR_SIGMA === 'undefined') {
  globalThis.CANNY_BLUR_SIGMA = 1.4;
}
if (typeof globalThis.CANNY_THRESHOLD_LOW === 'undefined') {
  globalThis.CANNY_THRESHOLD_LOW = 30;
}
if (typeof globalThis.CANNY_THRESHOLD_HIGH === 'undefined') {
  globalThis.CANNY_THRESHOLD_HIGH = 80;
}
if (typeof gaussianBlur === 'undefined') {
  var gaussianBlur = function(data, w, h, sigma) {
    const r = Math.ceil(3 * sigma) | 0;
    const klen = 2 * r + 1;
    const kernel = new Float32Array(klen);
    let sum = 0;
    for (let i = 0; i < klen; i++) {
      const d = i - r;
      kernel[i] = Math.exp(-d * d / (2 * sigma * sigma));
      sum += kernel[i];
    }
    for (let i = 0; i < klen; i++) kernel[i] /= sum;
    const tmp = new Float32Array(w * h);
    const out = new Float32Array(w * h);
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        let v = 0;
        for (let k = 0; k < klen; k++) {
          const nx = Math.max(0, Math.min(w - 1, x + k - r));
          v += data[y * w + nx] * kernel[k];
        }
        tmp[y * w + x] = v;
      }
    }
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        let v = 0;
        for (let k = 0; k < klen; k++) {
          const ny = Math.max(0, Math.min(h - 1, y + k - r));
          v += tmp[ny * w + x] * kernel[k];
        }
        out[y * w + x] = v;
      }
    }
    return out;
  };
}
if (typeof sobelMag === 'undefined') {
  var sobelMag = function(data, w, h) {
    const N = w * h, m = new Float32Array(N), lum = new Float32Array(N);
    for (let i = 0; i < N; i++) {
      const idx = i * 4;
      lum[i] = 0.2126 * data[idx] + 0.7152 * data[idx + 1] + 0.0722 * data[idx + 2];
    }
    for (let y = 1; y < h - 1; y++) {
      for (let x = 1; x < w - 1; x++) {
        const p = (dx, dy) => lum[(y + dy) * w + (x + dx)];
        const gx = -p(-1,-1) - 2*p(-1,0) - p(-1,1) + p(1,-1) + 2*p(1,0) + p(1,1);
        const gy = -p(-1,-1) - 2*p(0,-1) - p(1,-1) + p(-1,1) + 2*p(0,1) + p(1,1);
        m[y * w + x] = Math.sqrt(gx * gx + gy * gy);
      }
    }
    return m;
  };
}
if (typeof cannyEdges === 'undefined') {
  var cannyEdges = function(data, w, h) {
    const N = w * h;
    const gray = new Float32Array(N);
    for (let i = 0; i < N; i++) {
      const idx = i * 4;
      gray[i] = 0.2126 * data[idx] + 0.7152 * data[idx + 1] + 0.0722 * data[idx + 2];
    }
    const blurred = gaussianBlur(gray, w, h, CANNY_BLUR_SIGMA);
    const mag = new Float32Array(N);
    const angle = new Uint8Array(N);
    for (let y = 1; y < h - 1; y++) {
      for (let x = 1; x < w - 1; x++) {
        const p = (dx, dy) => blurred[(y + dy) * w + (x + dx)];
        const gx = -p(-1,-1) - 2*p(-1,0) - p(-1,1) + p(1,-1) + 2*p(1,0) + p(1,1);
        const gy = -p(-1,-1) - 2*p(0,-1) - p(1,-1) + p(-1,1) + 2*p(0,1) + p(1,1);
        mag[y * w + x] = Math.sqrt(gx * gx + gy * gy);
        const a = Math.abs(Math.atan2(gy, gx) * 180 / Math.PI);
        angle[y * w + x] = a < 22.5 || a >= 157.5 ? 0 : a < 67.5 ? 1 : a < 112.5 ? 2 : 3;
      }
    }
    const nms = new Float32Array(N);
    for (let y = 1; y < h - 1; y++) {
      for (let x = 1; x < w - 1; x++) {
        const mv = mag[y * w + x];
        if (!mv) continue;
        let p, q;
        switch (angle[y * w + x]) {
          case 0: p = mag[y * w + x - 1];         q = mag[y * w + x + 1];         break;
          case 1: p = mag[(y - 1) * w + x + 1];   q = mag[(y + 1) * w + x - 1];   break;
          case 2: p = mag[(y - 1) * w + x];        q = mag[(y + 1) * w + x];        break;
          default:p = mag[(y - 1) * w + x - 1];   q = mag[(y + 1) * w + x + 1];   break;
        }
        nms[y * w + x] = (mv >= p && mv >= q) ? mv : 0;
      }
    }
    const STRONG = 2, WEAK = 1;
    const edge = new Uint8Array(N);
    for (let i = 0; i < N; i++) {
      if      (nms[i] >= CANNY_THRESHOLD_HIGH) edge[i] = STRONG;
      else if (nms[i] >= CANNY_THRESHOLD_LOW)  edge[i] = WEAK;
    }
    const bfsQ = new Int32Array(N); let head = 0, tail = 0;
    for (let i = 0; i < N; i++) if (edge[i] === STRONG) bfsQ[tail++] = i;
    while (head < tail) {
      const pp = bfsQ[head++], px = pp % w, py = (pp / w) | 0;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        if (!dx && !dy) continue;
        const nx = px + dx, ny = py + dy;
        if (nx < 0 || nx >= w || ny < 0 || ny >= h) continue;
        const ni = ny * w + nx;
        if (edge[ni] === WEAK) { edge[ni] = STRONG; bfsQ[tail++] = ni; }
      }
    }
    const out = new Uint8Array(N);
    for (let i = 0; i < N; i++) out[i] = edge[i] === STRONG ? 1 : 0;
    return out;
  };
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

  // Write results back: only update pixels that were actually processed and have a claim
  for (let i = 0; i < N; i++) {
    const id = mapped[i].id;
    if (id === '__skip__' || id === '__empty__') continue;
    if (!cleaned[id]) continue; // color was below minPixelCount — leave as-is

    const winner = claim[i];
    if (winner !== null && winner !== id) {
      result[i] = colorEntry[winner];
    }
    // Unclaimed (claim[i] === null): pixel was eroded away from all processed masks.
    // Resolve by most-common neighbor color, same as removeOrphanStitches.
    if (winner === null) {
      const x = i % w, y = (i / w) | 0;
      const neighborCounts = {};
      const check = (ni) => {
        const nid = mapped[ni].id;
        if (nid !== '__skip__' && nid !== '__empty__' && cleaned[nid]) {
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
// Shared connected-components labelling (used by analyzeConfetti + removeOrphanStitches)
// ---------------------------------------------------------------------------

/**
 * Labels all 4-connected components in the pattern grid.
 * Cells with id '__skip__' or '__empty__' are labelled 0 and excluded.
 *
 * @param {Array}  mapped  Pattern array of palette entry objects
 * @param {number} w       Grid width
 * @param {number} h       Grid height
 * @returns {{ labels: Int32Array, components: Map<number, { id, size, cells: number[] }> }}
 */
function labelConnectedComponents(mapped, w, h) {
  const n = w * h;
  const labels = new Int32Array(n);
  const components = new Map();
  let nextLabel = 1;

  for (let i = 0; i < n; i++) {
    if (labels[i] !== 0) continue;
    const colorId = mapped[i].id;
    if (colorId === '__skip__' || colorId === '__empty__') continue;

    const label = nextLabel++;
    const cells = [];
    const stack = [i];
    labels[i] = label;

    while (stack.length > 0) {
      const ci = stack.pop();
      cells.push(ci);
      const cx = ci % w, cy = (ci / w) | 0;
      if (cx > 0     && labels[ci-1] === 0 && mapped[ci-1].id === colorId) { labels[ci-1] = label; stack.push(ci-1); }
      if (cx < w - 1 && labels[ci+1] === 0 && mapped[ci+1].id === colorId) { labels[ci+1] = label; stack.push(ci+1); }
      if (cy > 0     && labels[ci-w] === 0 && mapped[ci-w].id === colorId) { labels[ci-w] = label; stack.push(ci-w); }
      if (cy < h - 1 && labels[ci+w] === 0 && mapped[ci+w].id === colorId) { labels[ci+w] = label; stack.push(ci+w); }
    }

    components.set(label, { id: colorId, size: cells.length, cells });
  }

  return { labels, components };
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
function removeOrphanStitches(mapped, w, h, maxOrphanSize, edgeMap = null, saliencyMap = null, { saliencyMultiplier = 2.0, deTieBreakThreshold = 1.0 } = {}, precomputedLabels = null) {
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

  // ─── Fast path: use pre-labelled components to skip the BFS entirely ───────
  if (precomputedLabels) {
    for (const [, comp] of precomputedLabels.components) {
      if (comp.size > absoluteMaxSize) continue;
      const cells = comp.cells, compCount = cells.length, tid = comp.id;

      if (edgeMap) {
        let onEdge = false;
        for (let i = 0; i < compCount; i++) { if (edgeMap[cells[i]]) { onEdge = true; break; } }
        if (onEdge) continue;
      }

      let effectiveMaxSize = maxOrphanSize;
      if (saliencyMap) {
        let saliencySum = 0;
        for (let i = 0; i < compCount; i++) saliencySum += saliencyMap[cells[i]];
        effectiveMaxSize = maxOrphanSize * (1.0 + (1.0 - saliencySum / compCount) * saliencyMultiplier);
      }
      if (compCount > effectiveMaxSize) continue;

      const neighborFreq = {};
      for (let i = 0; i < compCount; i++) {
        const cidx = cells[i], cx = cidx % w, cy = (cidx / w) | 0;
        const checkN = (ni) => {
          const nid = mapped[ni].id;
          if (nid !== tid && nid !== '__skip__' && nid !== '__empty__') neighborFreq[nid] = (neighborFreq[nid] || 0) + 1;
        };
        if (cx > 0)           checkN(cidx - 1);
        if (cx < w - 1)       checkN(cidx + 1);
        if (cy > 0)           checkN(cidx - w);
        if (cy < h - 1)       checkN(cidx + w);
        if (cx > 0 && cy > 0)         checkN(cidx - w - 1);
        if (cx < w-1 && cy > 0)       checkN(cidx - w + 1);
        if (cx > 0 && cy < h-1)       checkN(cidx + w - 1);
        if (cx < w-1 && cy < h-1)     checkN(cidx + w + 1);
      }

      const orphanLab = mapped[cells[0]].lab;
      let minDE = Infinity;
      for (const nid in neighborFreq) { const entry = colorEntries[nid]; if (!entry) continue; const de = Math.sqrt(dE2(orphanLab, entry.lab)); if (de < minDE) minDE = de; }
      let bestId = null, bestCount = -1;
      for (const nid in neighborFreq) { const entry = colorEntries[nid]; if (!entry) continue; const de = Math.sqrt(dE2(orphanLab, entry.lab)); if (de - minDE <= deTieBreakThreshold) { if (neighborFreq[nid] > bestCount) { bestCount = neighborFreq[nid]; bestId = nid; } } }
      if (bestId) { const replacement = colorEntries[bestId]; for (let i = 0; i < compCount; i++) mapped[cells[i]] = replacement; }
    }
    return mapped;
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
function analyzeConfetti(mapped, w, h, precomputedLabels = null) {
  let totalStitchable = 0;
  let singles = 0;
  let smallClusters = 0;
  const colorConfetti = {};

  // ─── Fast path: use pre-labelled components ──────────────────────────────────
  if (precomputedLabels) {
    for (const [, comp] of precomputedLabels.components) {
      totalStitchable += comp.size;
      if (comp.size === 1) {
        singles++;
        colorConfetti[comp.id] = (colorConfetti[comp.id] || 0) + 1;
      } else if (comp.size <= 3) {
        smallClusters += comp.size;
        colorConfetti[comp.id] = (colorConfetti[comp.id] || 0) + comp.size;
      }
    }
    const total = singles + smallClusters;
    return { singles, smallClusters, total, pct: totalStitchable > 0 ? (total / totalStitchable * 100) : 0, colorConfetti };
  }

  const len = mapped.length;
  const vis = new Uint8Array(len);
  const q = new Uint32Array(len);

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

// module.exports is placed at the end of the file so that dE2000 and
// UNIQUE_THRESHOLD_DE (declared below) are in scope before being exported.
// DO NOT move this block above the dE2000 / UNIQUE_THRESHOLD_DE declarations.

// ─── CIEDE2000 colour difference ────────────────────────────────────────────
// Implements the full CIEDE2000 formula (Sharma, Wu & Dalal, 2005).
// Validated against the 34 test vectors published in that paper.
// Inputs: [L, a, b] arrays. Output: non-negative number.
//
// Cache key uses rounded values so we never miss due to float noise.
// PERF (perf-8 #4): use a Map and cap at 5000 entries to bound memory.
// When full, the oldest insertion is evicted (Map iteration order = insertion order).
const _de2000Cache = new Map();
const _DE2000_CACHE_MAX = 5000;

function dE2000(lab1, lab2) {
  const k = lab1[0].toFixed(2)+','+lab1[1].toFixed(2)+','+lab1[2].toFixed(2)+'-'+lab2[0].toFixed(2)+','+lab2[1].toFixed(2)+','+lab2[2].toFixed(2);
  const cached = _de2000Cache.get(k);
  if (cached !== undefined) return cached;

  const L1 = lab1[0], a1 = lab1[1], b1 = lab1[2];
  const L2 = lab2[0], a2 = lab2[1], b2 = lab2[2];

  // Step 1: compute C'ab and h'ab
  const C1ab = Math.sqrt(a1*a1 + b1*b1);
  const C2ab = Math.sqrt(a2*a2 + b2*b2);
  const Cab_avg = (C1ab + C2ab) / 2;
  const Cab_avg7 = Math.pow(Cab_avg, 7);
  const G = 0.5 * (1 - Math.sqrt(Cab_avg7 / (Cab_avg7 + 6103515625))); // 25^7 = 6103515625
  const a1p = a1 * (1 + G);
  const a2p = a2 * (1 + G);
  const C1p = Math.sqrt(a1p*a1p + b1*b1);
  const C2p = Math.sqrt(a2p*a2p + b2*b2);

  function hpAngle(ap, b) {
    if (ap === 0 && b === 0) return 0;
    let h = Math.atan2(b, ap) * 180 / Math.PI;
    if (h < 0) h += 360;
    return h;
  }
  const h1p = hpAngle(a1p, b1);
  const h2p = hpAngle(a2p, b2);

  // Step 2: compute ΔL', ΔC', Δh'
  const dLp = L2 - L1;
  const dCp = C2p - C1p;
  let dhp;
  if (C1p * C2p === 0) {
    dhp = 0;
  } else if (Math.abs(h2p - h1p) <= 180) {
    dhp = h2p - h1p;
  } else if (h2p - h1p > 180) {
    dhp = h2p - h1p - 360;
  } else {
    dhp = h2p - h1p + 360;
  }
  const dHp = 2 * Math.sqrt(C1p * C2p) * Math.sin(dhp * Math.PI / 360);

  // Step 3: arithmetic means
  const Lp_avg = (L1 + L2) / 2;
  const Cp_avg = (C1p + C2p) / 2;
  let Hp_avg;
  if (C1p * C2p === 0) {
    Hp_avg = h1p + h2p;
  } else if (Math.abs(h1p - h2p) <= 180) {
    Hp_avg = (h1p + h2p) / 2;
  } else if (h1p + h2p < 360) {
    Hp_avg = (h1p + h2p + 360) / 2;
  } else {
    Hp_avg = (h1p + h2p - 360) / 2;
  }

  // Weighting functions
  const T = 1
    - 0.17 * Math.cos((Hp_avg - 30) * Math.PI / 180)
    + 0.24 * Math.cos(2 * Hp_avg * Math.PI / 180)
    + 0.32 * Math.cos((3 * Hp_avg + 6) * Math.PI / 180)
    - 0.20 * Math.cos((4 * Hp_avg - 63) * Math.PI / 180);

  const Cp_avg7 = Math.pow(Cp_avg, 7);
  const Rc = 2 * Math.sqrt(Cp_avg7 / (Cp_avg7 + 6103515625));
  const Lp50sq = (Lp_avg - 50) * (Lp_avg - 50);
  const SL = 1 + 0.015 * Lp50sq / Math.sqrt(20 + Lp50sq);
  const SC = 1 + 0.045 * Cp_avg;
  const SH = 1 + 0.015 * Cp_avg * T;
  const dTheta = 30 * Math.exp(-((Hp_avg - 275) / 25) * ((Hp_avg - 275) / 25));
  const RT = -Math.sin(2 * dTheta * Math.PI / 180) * Rc;

  const kL = 1, kC = 1, kH = 1;
  const result = Math.sqrt(
    (dLp / (kL * SL)) * (dLp / (kL * SL)) +
    (dCp / (kC * SC)) * (dCp / (kC * SC)) +
    (dHp / (kH * SH)) * (dHp / (kH * SH)) +
    RT * (dCp / (kC * SC)) * (dHp / (kH * SH))
  );

  _de2000Cache.set(k, result);
  // PERF (perf-8 #10): batch-evict 10% of cap once full instead of one-at-a-time;
  // the previous single-entry eviction churned a delete + rebalance per insert at the cap.
  if (_de2000Cache.size > _DE2000_CACHE_MAX) {
    const evictCount = (_DE2000_CACHE_MAX / 10) | 0;
    const it = _de2000Cache.keys();
    for (let _e = 0; _e < evictCount; _e++) {
      const r = it.next();
      if (r.done) break;
      _de2000Cache.delete(r.value);
    }
  }
  return result;
}
// Assign to the global scope. globalThis works in browser, Web Worker, and Node.js.
// Fallback chain covers environments where globalThis may not exist (very old).
var _colourUtilsGlobal = typeof globalThis !== 'undefined' ? globalThis : typeof window !== 'undefined' ? window : self;
_colourUtilsGlobal.dE2000 = dE2000;

// Threads with best cross-brand ΔE2000 ≥ this value are flagged 'Unique'
// (no good equivalent in the other brand). Tunable without hunting through code.
const UNIQUE_THRESHOLD_DE = 5;
_colourUtilsGlobal.UNIQUE_THRESHOLD_DE = UNIQUE_THRESHOLD_DE;

if (typeof module !== 'undefined' && module.exports) { module.exports = { findSolid, findBest, luminance, quantize, quantizeConstrained, doDither, doBayerDither, doRiemersma, doMap, buildPalette, restoreStitch, applyMedianFilter, applyGaussianBlur, applyBilateralFilter, generateSaliencyMap, morphologicalClean, generateEdgeMap, labelConnectedComponents, removeOrphanStitches, analyzeConfetti, dE2000, UNIQUE_THRESHOLD_DE }; }
