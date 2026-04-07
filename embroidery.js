const { useState, useRef, useEffect, useCallback, useMemo } = React;

const CW = 400, CH = 400;
const NODE_R = 6, NODE_HIT = 12, EDGE_HIT = 8;
const ACCENT = '#0d9488';
const ACCENT_DARK = '#0f766e';
const ACCENT_LIGHT = '#f0fdfa';
const ACCENT_BORDER = '#99f6e4';

// ============================================================
// Pipeline constants
// ============================================================
// Bilateral filter (pre-processing, edge-preserving smooth)
const BILATERAL_KERNEL_RADIUS = 5;    // half-width of 11×11 window
const BILATERAL_SIGMA_SPATIAL = 10.0; // spatial Gaussian σ (pixels)
const BILATERAL_SIGMA_RANGE   = 30.0; // range Gaussian σ (0–255 colour scale)
// Canny edge detection
const CANNY_BLUR_SIGMA        = 1.4;  // pre-Canny Gaussian σ
const CANNY_THRESHOLD_LOW     = 30;   // hysteresis low threshold (0–255)
const CANNY_THRESHOLD_HIGH    = 80;   // hysteresis high threshold (0–255)
// SLIC cross-edge distance penalty multiplier
const EDGE_PENALTY_MULTIPLIER = 10.0;
// Morphological kernel size (must be odd)
const MORPH_KERNEL_SIZE       = 3;

// Module-level edge caches: set by autoSegment, reused by magicWandFill
// _wandEdgeCache: {mag, canny, smoothed, w, h} — full canvas resolution
let _wandEdgeCache = null;
// Lasso cost map — rebuilt lazily from _wandEdgeCache or raw image
// {data: Uint8Array, w, h, src} where src is the _wandEdgeCache or ImageData object used to build it
let _lassoCostCache = null;

// --- Wand HSL metric ---
const WAND_WEIGHT_HUE         = 1.8;  // dominant: prevents hue-boundary bleeding
const WAND_WEIGHT_SATURATION  = 1.0;  // moderate
const WAND_WEIGHT_LIGHTNESS   = 0.4;  // low: spans shadow/highlight within a region
const LOW_SAT_THRESHOLD       = 0.12; // below this saturation, hue is unreliable (greys)
const WAND_DYNAMIC_TOLERANCE_ENABLED = true;
const VARIANCE_LOW_THRESHOLD  = 5.0;  // flat region → tighten tolerance × 0.7
const VARIANCE_HIGH_THRESHOLD = 20.0; // textured/gradient region → loosen × 1.3

// --- Magnetic Lasso ---
const LASSO_EDGE_COST         = 1;    // cost for traversing an edge pixel
const LASSO_FLAT_COST         = 100;  // cost for traversing a non-edge pixel
const LASSO_SEARCH_RADIUS     = 80;   // Dijkstra corridor (px in cost-map space)
const LASSO_DEBOUNCE_MS       = 30;   // min ms between path recalculations on mousemove
const LASSO_MIN_ANCHOR_DISTANCE = 8;  // ignore clicks within this many px of last anchor
const LASSO_CLOSE_RADIUS      = 12;   // px to start anchor — triggers close indicator

// --- Zoom & Pan ---
const ZOOM_MIN         = 0.25;  // minimum zoom level
const ZOOM_MAX         = 10.0;  // maximum zoom level
const ZOOM_STEP_BUTTON = 0.25;  // per toolbar button click
const ZOOM_STEP_SCROLL = 0.1;   // per scroll tick

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

// Remove spike points from a contour: points whose consecutive direction vectors
// reverse sharply (dot product of unit vectors below minCos, i.e. >~120° turn).
function smoothContourAngles(pts,minCos=-0.5){
  if(pts.length<4)return pts;
  let res=pts.slice();
  for(let pass=0;pass<3;pass++){
    const next=[res[0]];
    for(let i=1;i<res.length-1;i++){
      const[ax,ay]=res[i-1],[bx,by]=res[i],[cx,cy]=res[i+1];
      const ux=bx-ax,uy=by-ay,vx=cx-bx,vy=cy-by;
      const lu=Math.sqrt(ux*ux+uy*uy),lv=Math.sqrt(vx*vx+vy*vy);
      if(lu>0&&lv>0&&(ux*vx+uy*vy)/(lu*lv)<minCos)continue; // skip spike
      next.push(res[i]);
    }
    next.push(res[res.length-1]);
    if(next.length===res.length)break;
    res=next;
  }
  return res.length>=4?res:pts;
}

// Convert smooth points back to ~N control nodes
function pointsToNodes(pts, targetN) {
  const n = Math.max(4, Math.min(targetN, pts.length));
  return downsample(pts, n).map(p => [Math.round(p[0]*10)/10, Math.round(p[1]*10)/10]);
}

// ============================================================
// Pre-processing helpers
// ============================================================

/**
 * Separable Gaussian blur on a Float32 greyscale plane.
 * Returns a new Float32Array of the same length.
 */
function gaussianBlur(data, w, h, sigma) {
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

  // Horizontal pass
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
  // Vertical pass
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
}

/**
 * Bilateral filter on RGBA image data (Uint8ClampedArray or Uint8Array).
 * Preserves high-contrast edges while suppressing texture/noise.
 * Uses a range-weight lookup table for performance.
 * Returns a new Uint8ClampedArray at the same resolution.
 */
function bilateralFilter(data, w, h) {
  const R    = BILATERAL_KERNEL_RADIUS;
  const sigS2 = 2 * BILATERAL_SIGMA_SPATIAL * BILATERAL_SIGMA_SPATIAL;
  const sigR2 = 2 * BILATERAL_SIGMA_RANGE   * BILATERAL_SIGMA_RANGE;

  // Precompute spatial weights (constant per kernel offset)
  const kd = 2 * R + 1;
  const spatialW = new Float32Array(kd * kd);
  for (let ky = -R; ky <= R; ky++) {
    for (let kx = -R; kx <= R; kx++) {
      spatialW[(ky + R) * kd + (kx + R)] = Math.exp(-(kx * kx + ky * ky) / sigS2);
    }
  }

  // Range-weight lookup table (indexed by quantised squared colour distance)
  // Max squared RGB dist = 3 × 255² ≈ 195 075; map to 1024 buckets
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
          const nx = Math.max(0, Math.min(w - 1, x + kx));
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
  return out;
}

/**
 * Canny edge detection on RGBA image data (any typed array with 4-channel layout).
 * Returns a binary Uint8Array (1 = edge, 0 = non-edge) at the same w×h resolution.
 */
function cannyEdges(data, w, h) {
  const N = w * h;

  // Grayscale
  const gray = new Float32Array(N);
  for (let i = 0; i < N; i++) {
    const idx = i * 4;
    gray[i] = 0.2126 * data[idx] + 0.7152 * data[idx + 1] + 0.0722 * data[idx + 2];
  }

  // Gaussian blur (separable, σ = CANNY_BLUR_SIGMA)
  const blurred = gaussianBlur(gray, w, h, CANNY_BLUR_SIGMA);

  // Sobel gradient magnitude + quantised direction
  const mag   = new Float32Array(N);
  const angle = new Uint8Array(N); // 0=horiz, 1=diag45, 2=vert, 3=diag135
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

  // Non-maximum suppression
  const nms = new Float32Array(N);
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const m = mag[y * w + x];
      if (!m) continue;
      let p, q;
      switch (angle[y * w + x]) {
        case 0: p = mag[y * w + x - 1];         q = mag[y * w + x + 1];         break;
        case 1: p = mag[(y - 1) * w + x + 1];   q = mag[(y + 1) * w + x - 1];   break;
        case 2: p = mag[(y - 1) * w + x];        q = mag[(y + 1) * w + x];        break;
        default:p = mag[(y - 1) * w + x - 1];   q = mag[(y + 1) * w + x + 1];   break;
      }
      nms[y * w + x] = (m >= p && m >= q) ? m : 0;
    }
  }

  // Hysteresis thresholding: strong edges (≥HIGH), weak edges (≥LOW)
  const STRONG = 2, WEAK = 1;
  const edge = new Uint8Array(N);
  for (let i = 0; i < N; i++) {
    if      (nms[i] >= CANNY_THRESHOLD_HIGH) edge[i] = STRONG;
    else if (nms[i] >= CANNY_THRESHOLD_LOW)  edge[i] = WEAK;
  }
  // BFS: promote weak pixels connected to strong ones (8-connectivity)
  const bfsQ = new Int32Array(N); let head = 0, tail = 0;
  for (let i = 0; i < N; i++) if (edge[i] === STRONG) bfsQ[tail++] = i;
  while (head < tail) {
    const p = bfsQ[head++], px = p % w, py = (p / w) | 0;
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
}

/**
 * Morphological erosion: a pixel survives only if every pixel in the
 * kSize×kSize structuring element neighbourhood is also set.
 */
function morphErode(mask, w, h, kSize) {
  const r = (kSize - 1) >> 1;
  const out = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (!mask[y * w + x]) continue;
      let all = 1;
      for (let dy = -r; dy <= r && all; dy++) {
        const ny = y + dy;
        if (ny < 0 || ny >= h) { all = 0; break; }
        for (let dx = -r; dx <= r && all; dx++) {
          const nx = x + dx;
          if (nx < 0 || nx >= w || !mask[ny * w + nx]) all = 0;
        }
      }
      out[y * w + x] = all;
    }
  }
  return out;
}

/**
 * Morphological dilation: a pixel is set if any pixel in the
 * kSize×kSize structuring element neighbourhood is set.
 */
function morphDilate(mask, w, h, kSize) {
  const r = (kSize - 1) >> 1;
  const out = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let any = 0;
      for (let dy = -r; dy <= r && !any; dy++) {
        const ny = y + dy;
        if (ny < 0 || ny >= h) continue;
        for (let dx = -r; dx <= r && !any; dx++) {
          const nx = x + dx;
          if (nx >= 0 && nx < w && mask[ny * w + nx]) any = 1;
        }
      }
      out[y * w + x] = any;
    }
  }
  return out;
}

/**
 * Returns true if 4 interior samples along the line from (x0,y0)→(x1,y1)
 * land on a pixel marked in edgeMask. Used by SLIC to detect cluster-boundary
 * crossings without a full per-pixel Bresenham walk.
 */
function lineHitsEdge(x0, y0, x1, y1, edgeMask, w) {
  const dx = x1 - x0, dy = y1 - y0;
  for (let t = 1; t <= 3; t++) {
    const f  = t / 4;
    const mx = Math.round(x0 + dx * f);
    const my = Math.round(y0 + dy * f);
    if (edgeMask[my * w + mx]) return true;
  }
  return false;
}

// ============================================================
// SLIC Superpixel Segmentation
// ============================================================

function rgb2lab(r,g,b){let R=r/255,G=g/255,B=b/255;R=R>.04045?((R+.055)/1.055)**2.4:R/12.92;G=G>.04045?((G+.055)/1.055)**2.4:G/12.92;B=B>.04045?((B+.055)/1.055)**2.4:B/12.92;let X=(R*.4124+G*.3576+B*.1805)/.95047,Y=R*.2126+G*.7152+B*.0722,Z=(R*.0193+G*.1192+B*.9505)/1.08883;const f=t=>t>.008856?Math.cbrt(t):7.787*t+16/116;return[116*f(Y)-16,500*(f(X)-f(Y)),200*(f(Y)-f(Z))];}
function lab2rgb(L,a,b){const fy=(L+16)/116,fx=a/500+fy,fz=fy-b/200;const f=t=>t>.20690?t*t*t:(t-16/116)/7.787;let X=f(fx)*.95047,Y=f(fy),Z=f(fz)*1.08883;let R=X*3.2406+Y*-1.5372+Z*-.4986,G=X*-.9689+Y*1.8758+Z*.0415,Bv=X*.0557+Y*-.2040+Z*1.0570;const gm=c=>Math.max(0,Math.min(255,Math.round((c>.0031308?1.055*c**(1/2.4)-.055:12.92*c)*255)));return[gm(R),gm(G),gm(Bv)];}

function slicSegment(data,w,h,k,compactness,iters,edgeMask=null){
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
      const icx=Math.round(cx),icy=Math.round(cy);
      for(let y=y0;y<=y1;y++)for(let x=x0;x<=x1;x++){
        const pi=y*w+x;if(labL[pi]<0)continue;
        let D=(labL[pi]-cL)**2+(labA[pi]-cA)**2+(labBv[pi]-cB)**2+((x-cx)**2+(y-cy)**2)/S2*m*m;
        // If the straight-line path to the cluster centre crosses a detected edge,
        // inflate the distance so the cluster refuses to absorb this pixel
        if(edgeMask&&lineHitsEdge(icx,icy,x,y,edgeMask,w))D*=EDGE_PENALTY_MULTIPLIER;
        if(D<dist[pi]){dist[pi]=D;labels[pi]=ci;}
      }
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
  // LAB-based perceptual Sobel — detects colour boundaries luminance Sobel misses (e.g. red vs green)
  const eMag=sobelMagLAB(labL,labA,labBv,pw,ph);
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
  // Use linear (not squared) penalty so MERGE_COST_THRESH stays meaningful relative to LAB distance
  for(const[,e]of adjRaw){if(!spCnt[e.a]||!spCnt[e.b])continue;const ep=e.eCnt>0?(e.eSum/e.eCnt)*edgeW:0;edgePenalty.set(edgeKey(e.a,e.b),ep);}
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
  // Post-merge LAB refinement: boundary pixels adopt the adjacent cluster whose LAB mean
  // best matches their own colour — mirrors the magic wand’s flood-fill snap logic
  const refined=new Int32Array(PN);
  for(let i=0;i<PN;i++) refined[i]=labels[i]>=0?find(labels[i]):-1;
  for(let pass=0;pass<2;pass++){
    let changed=false;const next=refined.slice();
    for(let i=0;i<PN;i++){const rl=refined[i];if(rl<0)continue;
      const vL=labL[i],vA=labA[i],vB=labBv[i];
      const dCur=(clL[rl]-vL)**2+(clA[rl]-vA)**2+(clBv[rl]-vB)**2;
      const px=i%pw,py=(i/pw)|0;
      for(const[dx,dy]of[[1,0],[-1,0],[0,1],[0,-1]]){
        const nx2=px+dx,ny2=py+dy;if(nx2<0||nx2>=pw||ny2<0||ny2>=ph)continue;
        const ni2=ny2*pw+nx2,rn=refined[ni2];if(rn<0||rn===rl)continue;
        const d=(clL[rn]-vL)**2+(clA[rn]-vA)**2+(clBv[rn]-vB)**2;
        if(d<dCur*0.75){next[i]=rn;changed=true;break;}
      }}
    refined.set(next);if(!changed)break;
  }
  // Remap to contiguous IDs, sample avg RGB from original image
  const invSc=oCW/pw,clusterMap=new Map();let nextCId=0;
  const mergedLabels=new Int32Array(PN).fill(-1);
  for(let i=0;i<PN;i++){const r=refined[i];if(r<0)continue;if(!clusterMap.has(r))clusterMap.set(r,{id:nextCId++,sr:0,sg:0,sb:0,cnt:0,lab:[clL[r],clA[r],clBv[r]]});const cl=clusterMap.get(r);mergedLabels[i]=cl.id;const ox=Math.min(oCW-1,Math.round((i%pw)*invSc)),oy=Math.min(oCH-1,Math.round(((i/pw)|0)*invSc)),oidx=(oy*oCW+ox)*4;if(origData[oidx+3]>30){cl.sr+=origData[oidx];cl.sg+=origData[oidx+1];cl.sb+=origData[oidx+2];cl.cnt++;}}
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

function magicWandFill(imageData,seedX,seedY,tolerance,useEdgeSnap,edgeFactor,occupiedMask,edgeMask=null,smoothedData=null){
  const{data:rawData,width:w,height:h}=imageData,N=w*h;
  // Use bilateral-filtered data for colour comparisons if supplied (avoids shadow/highlight bleeding)
  const cmpData=smoothedData||rawData;
  // Pre-compute HSL for every pixel using the (smoothed) source data
  const pH=new Float32Array(N),pS=new Float32Array(N),pLv=new Float32Array(N);
  for(let i=0;i<N;i++){const idx=i*4;if(rawData[idx+3]<=30){pH[i]=-1;continue;}const[hv,sv,lv]=rgb2hsl(cmpData[idx],cmpData[idx+1],cmpData[idx+2]);pH[i]=hv;pS[i]=sv;pLv[i]=lv;}
  // Seed colour: average HSL over 3x3 neighbourhood
  let sH=0,sS=0,sLs=0,sc=0;
  for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++){
    const nx=seedX+dx,ny=seedY+dy;if(nx<0||nx>=w||ny<0||ny>=h)continue;
    const ni=ny*w+nx;if(pH[ni]<0)continue;sH+=pH[ni];sS+=pS[ni];sLs+=pLv[ni];sc++;
  }
  if(!sc)return new Uint8Array(N);sH/=sc;sS/=sc;sLs/=sc;
  // Low-saturation guard: grey pixels - ignore hue, compare by lightness only
  let wH=WAND_WEIGHT_HUE,wS=WAND_WEIGHT_SATURATION,wL2=WAND_WEIGHT_LIGHTNESS;
  if(sS<LOW_SAT_THRESHOLD){wH=0;wL2=1.5;}
  // Dynamic tolerance: measure HSL variance in 5x5 seed neighbourhood
  let effTol=tolerance;
  if(WAND_DYNAMIC_TOLERANCE_ENABLED){
    const dists=[];
    for(let dy=-2;dy<=2;dy++)for(let dx=-2;dx<=2;dx++){
      const nx=seedX+dx,ny=seedY+dy;if(nx<0||nx>=w||ny<0||ny>=h)continue;
      const ni=ny*w+nx;if(pH[ni]<0)continue;
      dists.push(hslWeightedDist(pH[ni],pS[ni],pLv[ni],sH,sS,sLs,wH,wS,wL2));
    }
    if(dists.length>1){
      const mean=dists.reduce((a,v)=>a+v,0)/dists.length;
      const stddev=Math.sqrt(dists.reduce((a,v)=>a+(v-mean)**2,0)/dists.length);
      if(stddev<VARIANCE_LOW_THRESHOLD)effTol*=0.7;
      else if(stddev>VARIANCE_HIGH_THRESHOLD)effTol*=1.3;
    }
  }
  // Soft edge map for snap - reuse autoSegment cached Sobel when dimensions match
  const edgeMag=useEdgeSnap?(_wandEdgeCache&&_wandEdgeCache.w===w&&_wandEdgeCache.h===h?_wandEdgeCache.mag:null):null;
  const mask=new Uint8Array(N),visited=new Uint8Array(N),queue=new Int32Array(N);
  let head=0,tail=0;const seed=seedY*w+seedX;
  if(seed<0||seed>=N||pH[seed]<0||occupiedMask[seed])return mask;
  visited[seed]=1;queue[tail++]=seed;
  while(head<tail){
    const p=queue[head++],px=p%w,py=(p/w)|0;mask[p]=1;
    for(const[ddx,ddy]of[[1,0],[-1,0],[0,1],[0,-1]]){
      const nx=px+ddx,ny=py+ddy;if(nx<0||nx>=w||ny<0||ny>=h)continue;
      const ni=ny*w+nx;if(visited[ni]||occupiedMask[ni]||pH[ni]<0)continue;
      // Hard Canny boundary: treat edge pixels as impassable walls
      if(edgeMask&&edgeMask[ni]){visited[ni]=1;continue;}
      visited[ni]=1;
      // Weighted HSL distance from seed
      const d=hslWeightedDist(pH[ni],pS[ni],pLv[ni],sH,sS,sLs,wH,wS,wL2);
      // Soft edge snap: tighten effective tolerance at detected edges
      let et=effTol;
      if(useEdgeSnap&&edgeMag){const eStr=Math.min(1,edgeMag[ni]/200);et=effTol/(1+eStr*edgeFactor);}
      if(d<et)queue[tail++]=ni;
    }
  }
  // Hole exclusion: flood-fill exterior from image border, then fill interior holes into mask
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
  // Process at full canvas resolution — 300px downscale lost too much boundary detail
  const PROC_MAX=400,scale=Math.min(1,PROC_MAX/Math.max(CW,CH));
  const pw=Math.max(2,Math.round(CW*scale)),ph=Math.max(2,Math.round(CH*scale));
  const tmpC=document.createElement('canvas');tmpC.width=CW;tmpC.height=CH;tmpC.getContext('2d').putImageData(imageData,0,0);
  const scC=document.createElement('canvas');scC.width=pw;scC.height=ph;scC.getContext('2d').drawImage(tmpC,0,0,CW,CH,0,0,pw,ph);
  const scaledD=scC.getContext('2d').getImageData(0,0,pw,ph);
  // [1] Bilateral filter: edge-preserving smooth using module-level constants
  const smoothed=bilateralFilter(scaledD.data,pw,ph);
  // [2] Canny edge mask — binary hard boundaries at downscaled resolution
  const edgeMask=cannyEdges(smoothed,pw,ph);
  // Sobel magnitude map retained for adaptive superpixel count + boundary snap
  const sMag=sobelMag(smoothed,pw,ph);
  // Edge complexity: (mean + std) of Sobel magnitudes, normalised to a 0.5–2× scale factor
  const complexity=(()=>{const eN=pw*ph;let eS=0,eS2=0;for(let i=0;i<eN;i++){const v=sMag[i];eS+=v;eS2+=v*v;}const eMn=eS/eN,eStd=Math.sqrt(Math.max(0,eS2/eN-eMn*eMn));return Math.min(2,Math.max(0.5,(eMn+eStd)/(eMn+1)));})();
  // Cache full-resolution bilateral+Canny+Sobel for magic wand reuse (once per image load)
  try{const D=imageData.data,N=CW*CH,fL=new Float32Array(N),fA=new Float32Array(N),fB=new Float32Array(N);for(let i=0;i<N;i++){const idx=i*4;if(D[idx+3]<=30)continue;const[l,a,b]=rgb2lab(D[idx],D[idx+1],D[idx+2]);fL[i]=l;fA[i]=a;fB[i]=b;}const fullSmoothed=bilateralFilter(D,CW,CH);_wandEdgeCache={mag:sobelMagLAB(fL,fA,fB,CW,CH),canny:cannyEdges(fullSmoothed,CW,CH),smoothed:fullSmoothed,w:CW,h:CH};_lassoCostCache=null;}catch(e){_wandEdgeCache=null;}
  // [3] SLIC superpixel segmentation + agglomerative merge (on bilaterally filtered data, Canny-aware clusters)
  // More superpixels at higher sensitivity and more complex images
  const nSP=Math.max(numColors,Math.min(Math.floor(numColors*25*(1+edgeW)*complexity),Math.floor(pw*ph/4)));
  const{labels:spLabels,labL,labA,labBv,nC}=slicSegment(smoothed,pw,ph,nSP,slicM,10,edgeMask);
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
  const invSc=CW/pw;
  // DMC-colour merging: union-find adjacent components that resolve to the same DMC thread code
  // This eliminates colour-identical fragments that would be stitched the same anyway
  {const cLbl=new Int32Array(PN).fill(-1);for(let ci=0;ci<components.length;ci++)for(const p of components[ci].pixels)cLbl[p]=ci;
   const cD=components.map(c=>closestDMC(...c.col).c);
   const cP=components.map((_,i)=>i);
   const cF=x=>{while(cP[x]!==x){cP[x]=cP[cP[x]];x=cP[x];}return x;};
   for(let i=0;i<PN;i++){const ci=cLbl[i];if(ci<0)continue;const x=i%pw,y=(i/pw)|0;for(const[dx,dy]of[[1,0],[0,1]]){const nx=x+dx,ny=y+dy;if(nx>=pw||ny>=ph)continue;const cj=cLbl[ny*pw+nx];if(cj<0||cj===ci)continue;const ri=cF(ci),rj=cF(cj);if(ri!==rj&&cD[ri]===cD[rj])cP[rj]=ri;}}
   const mMap=new Map();for(let ci=0;ci<components.length;ci++){const r=cF(ci);if(!mMap.has(r))mMap.set(r,{pixels:[],col:components[r].col,size:0});const mc=mMap.get(r);for(const p of components[ci].pixels)mc.pixels.push(p);mc.size+=components[ci].size;}
   for(const[,mc]of mMap){let sr=0,sg=0,sb=0,cnt=0;for(const p of mc.pixels){const ox=Math.min(CW-1,Math.round((p%pw)*invSc)),oy=Math.min(CH-1,Math.round(((p/pw)|0)*invSc)),oi=(oy*CW+ox)*4;if(data[oi+3]>30){sr+=data[oi];sg+=data[oi+1];sb+=data[oi+2];cnt++;}}if(cnt>0)mc.col=[Math.round(sr/cnt),Math.round(sg/cnt),Math.round(sb/cnt)];}
   components.length=0;for(const[,mc]of mMap)if(mc.size>=minSize)components.push(mc);components.sort((a,b)=>b.size-a.size);}
  // Skip background: largest component only if it covers >50% of image
  const bgT=PN*0.5,regions=[];
  for(const comp of components){
    if(comp.size>bgT&&!regions.length)continue;
    const mask=new Uint8Array(PN);for(const p of comp.pixels)mask[p]=1;
    // [4] Morphological clean-up before boundary extraction
    // Step 1 — Closing (dilate→erode): fills holes and smooths concave gaps in the interior
    const closed=morphErode(morphDilate(mask,pw,ph,MORPH_KERNEL_SIZE),pw,ph,MORPH_KERNEL_SIZE);
    // Step 2 — Opening (erode→dilate): removes thin protrusions and single-pixel spurs
    const opened=morphDilate(morphErode(closed,pw,ph,MORPH_KERNEL_SIZE),pw,ph,MORPH_KERNEL_SIZE);
    // Fall back to original mask if opening erased too much (small regions)
    const useMask=opened.reduce((s,v)=>s+v,0)>=comp.pixels.length*0.3?opened:mask;
    const bMask=new Uint8Array(PN);for(let y=0;y<ph;y++)for(let x=0;x<pw;x++){if(!useMask[y*pw+x])continue;if(x===0||!useMask[y*pw+x-1]||x===pw-1||!useMask[y*pw+x+1]||y===0||!useMask[(y-1)*pw+x]||y===ph-1||!useMask[(y+1)*pw+x])bMask[y*pw+x]=1;}
    // Multi-contour: trace all boundary components, use the largest (outer contour)
    // Scan advances past zeroed pixels so each contour component is found once — O(PN) total
    const tmpB=new Uint8Array(bMask);let bestContour=[];
    for(let scan=0;scan<PN;scan++){if(!tmpB[scan])continue;
      const c=traceContour(tmpB,pw,ph);for(const[cx,cy]of c)tmpB[cy*pw+cx]=0;
      if(c.length>bestContour.length)bestContour=c;}
    if(bestContour.length<6)continue;
    // Boundary edge-snapping: nudge each contour point toward the nearest high-gradient pixel
    const snapped=bestContour.map(([cx,cy])=>{let bm=sMag[cy*pw+cx],bx=cx,by=cy;for(let dy=-2;dy<=2;dy++)for(let dx=-2;dx<=2;dx++){const nx=cx+dx,ny=cy+dy;if(nx<0||nx>=pw||ny<0||ny>=ph)continue;if(sMag[ny*pw+nx]>bm){bm=sMag[ny*pw+nx];bx=nx;by=ny;}}return[bx,by];});
    const contour=snapped.length>=6?snapped:bestContour;
    const tp=Math.min(80,Math.max(16,Math.floor(Math.sqrt(comp.size)/3)));
    const ds=downsample(contour,tp);if(ds.length<4)continue;
    let sm=catmull(ds,3);sm=simplify(sm,1.5);sm=smoothContourAngles(sm);if(sm.length<4)continue;
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
// HSL colour helpers
// ============================================================

/**
 * Convert RGB (0-255) to HSL. Returns [h (degrees 0-360), s (0-1), l (0-1)].
 */
function rgb2hsl(r,g,b){
  r/=255;g/=255;b/=255;
  const max=Math.max(r,g,b),min=Math.min(r,g,b),l=(max+min)/2;
  if(max===min)return[0,0,l];
  const d=max-min,s=l>0.5?d/(2-max-min):d/(max+min);
  let h;
  if(max===r)h=((g-b)/d+(g<b?6:0))/6;
  else if(max===g)h=((b-r)/d+2)/6;
  else h=((r-g)/d+4)/6;
  return[h*360,s,l];
}

/**
 * Weighted HSL distance with circular hue wrap-around.
 * H in degrees [0-360], S and L in [0-1].
 */
function hslWeightedDist(h1,s1,l1,h2,s2,l2,wH,wS,wL){
  const dh=Math.min(Math.abs(h1-h2),360-Math.abs(h1-h2));
  return Math.sqrt((wH*dh)**2+(wS*(s1-s2))**2+(wL*(l1-l2))**2);
}

// ============================================================
// Lasso helpers
// ============================================================

/**
 * Bresenham line — returns pixel-by-pixel [x, y] array from (ax,ay) to (bx,by).
 */
function bresenhamLine(ax,ay,bx,by){
  const pts=[];
  let dx=Math.abs(bx-ax),dy=Math.abs(by-ay),sx=ax<bx?1:-1,sy=ay<by?1:-1,err=dx-dy,x=ax,y=ay;
  for(;;){pts.push([x,y]);if(x===bx&&y===by)break;const e2=2*err;if(e2>-dy){err-=dy;x+=sx;}if(e2<dx){err+=dx;y+=sy;}}
  return pts;
}

/**
 * Polygon scanline fill — returns a binary Uint8Array mask at w×h.
 * pts is an array of [x, y] vertices defining a closed polygon.
 */
function fillPolygon(pts,w,h){
  const mask=new Uint8Array(w*h);
  if(pts.length<3)return mask;
  const ys=pts.map(p=>p[1]);
  const yMin=Math.max(0,Math.floor(Math.min(...ys))),yMax=Math.min(h-1,Math.ceil(Math.max(...ys)));
  const n=pts.length;
  for(let y=yMin;y<=yMax;y++){
    const xs=[];
    for(let i=0,j=n-1;i<n;j=i++){
      const[xi,yi]=pts[i],[xj,yj]=pts[j];
      if((yi<=y&&yj>y)||(yj<=y&&yi>y))xs.push(xi+(y-yi)/(yj-yi)*(xj-xi));
    }
    xs.sort((a,b)=>a-b);
    for(let k=0;k+1<xs.length;k+=2){
      const x0=Math.max(0,Math.ceil(xs[k])),x1=Math.min(w-1,Math.floor(xs[k+1]));
      for(let x=x0;x<=x1;x++)mask[y*w+x]=1;
    }
  }
  return mask;
}

/**
 * Returns the lazily-built cost map as a Uint8Array at CW×CH.
 * Edge pixels get LASSO_EDGE_COST (1), flat pixels get LASSO_FLAT_COST (100).
 * Uses the cached Canny mask from autoSegment when available; falls back to
 * an inverted-normalised Sobel if the Canny cache is absent.
 */
function getLassoCostData(imageData){
  if(_wandEdgeCache&&_wandEdgeCache.canny&&_wandEdgeCache.w===CW&&_wandEdgeCache.h===CH){
    if(_lassoCostCache&&_lassoCostCache.src===_wandEdgeCache)return _lassoCostCache.data;
    const c=_wandEdgeCache.canny,d=new Uint8Array(CW*CH);
    for(let i=0;i<d.length;i++)d[i]=c[i]?LASSO_EDGE_COST:LASSO_FLAT_COST;
    _lassoCostCache={data:d,src:_wandEdgeCache};
    return d;
  }
  if(!imageData)return null;
  if(_lassoCostCache&&_lassoCostCache.src===imageData)return _lassoCostCache.data;
  const sm=sobelMag(imageData.data,CW,CH);
  let mx=0;for(let i=0;i<sm.length;i++)if(sm[i]>mx)mx=sm[i];
  const d=new Uint8Array(CW*CH);
  for(let i=0;i<d.length;i++)d[i]=Math.max(1,Math.round(LASSO_FLAT_COST*(1-(mx>0?sm[i]/mx:0)*0.99)));
  _lassoCostCache={data:d,src:imageData};
  return d;
}

/**
 * Dijkstra shortest-path on a cost map, constrained to a rectangular search
 * corridor LASSO_SEARCH_RADIUS px wide around the segment (ax,ay)→(bx,by).
 * Falls back to a straight Bresenham line when:
 *   - costData is null
 *   - the straight-line distance is < 1 px
 *   - the cheapest path cost exceeds LASSO_FLAT_COST × dist × 1.5 (featureless area)
 * Returns an array of [x, y] pixels (inclusive of both endpoints).
 */
function lassoPathfind(costData,w,h,ax,ay,bx,by){
  const dx0=bx-ax,dy0=by-ay,straightDist=Math.sqrt(dx0*dx0+dy0*dy0);
  if(straightDist<1||!costData)return bresenhamLine(ax,ay,bx,by);
  const maxCost=LASSO_FLAT_COST*straightDist*1.5;
  const R=LASSO_SEARCH_RADIUS;
  const cx0=Math.max(0,Math.min(ax,bx)-R),cx1=Math.min(w-1,Math.max(ax,bx)+R);
  const cy0=Math.max(0,Math.min(ay,by)-R),cy1=Math.min(h-1,Math.max(ay,by)+R);
  const N=w*h,distArr=new Float32Array(N).fill(Infinity),prevArr=new Int32Array(N).fill(-1);
  const start=ay*w+ax,goal=by*w+bx;
  distArr[start]=0;
  // Inline min-heap
  const hp=[{c:0,i:start}];
  const hpUp=k=>{while(k>0){const p=(k-1)>>1;if(hp[p].c<=hp[k].c)break;[hp[p],hp[k]]=[hp[k],hp[p]];k=p;}};
  const hpDown=k=>{const n=hp.length;for(;;){let s=k,l=2*k+1,r=2*k+2;if(l<n&&hp[l].c<hp[s].c)s=l;if(r<n&&hp[r].c<hp[s].c)s=r;if(s===k)break;[hp[s],hp[k]]=[hp[k],hp[s]];k=s;}};
  const hpPush=(c,i)=>{hp.push({c,i});hpUp(hp.length-1);};
  const hpPop=()=>{const top=hp[0],last=hp.pop();if(hp.length){hp[0]=last;hpDown(0);}return top;};
  const dirs=[[-1,0,1],[1,0,1],[0,-1,1],[0,1,1],[-1,-1,1.414],[-1,1,1.414],[1,-1,1.414],[1,1,1.414]];
  while(hp.length){
    const{c:d,i:p}=hpPop();
    if(d>distArr[p])continue;
    if(p===goal)break;
    const px=p%w,py=(p/w)|0;
    for(const[ddx,ddy,step]of dirs){
      const nx=px+ddx,ny=py+ddy;
      if(nx<cx0||nx>cx1||ny<cy0||ny>cy1)continue;
      const ni=ny*w+nx,nd=d+costData[ni]*step;
      if(nd<distArr[ni]){distArr[ni]=nd;prevArr[ni]=p;hpPush(nd,ni);}
    }
  }
  if(distArr[goal]>maxCost||distArr[goal]===Infinity)return bresenhamLine(ax,ay,bx,by);
  const path=[];let cur=goal;
  while(cur!==-1&&cur!==start){path.push([cur%w,(cur/w)|0]);cur=prevArr[cur];}
  path.push([ax,ay]);path.reverse();
  return path;
}

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
  // Lasso tool state
  const[lassoAnchors,setLassoAnchors]=useState([]);   // [[x,y],...] committed anchor points
  const[lassoSegments,setLassoSegments]=useState([]); // Dijkstra paths between anchors (excl. start pt)
  const[lassoPreview,setLassoPreview]=useState([]);   // live path from last anchor to cursor
  const[lassoNearClose,setLassoNearClose]=useState(false);
  const lassoLastMsRef=useRef(0);                     // timestamp for mousemove debounce
  // Zoom & pan state
  const[zoom,setZoom]=useState(1);
  const[pan,setPan]=useState({x:0,y:0});
  // Refs for use inside callbacks (always current, no stale-closure issue)
  const zoomRef=useRef(1);         // mirrors zoom state
  const panRef=useRef({x:0,y:0}); // mirrors pan state
  const isPanningRef=useRef(false); // true while spacebar held
  const panStateRef=useRef({active:false,startX:0,startY:0,startPanX:0,startPanY:0});
  const touchRef=useRef({count:0,lastDist:0,lastMidX:0,lastMidY:0});

  const mainC=useRef(null),imgC=useRef(null),fileRef=useRef(null);
  const imgRef=useRef(null),imgDataRef=useRef(null),isDraw=useRef(false);

  // Keep refs in sync with state on every render (avoids stale closure in callbacks)
  zoomRef.current=zoom;panRef.current=pan;

  const clampPanFn=(px,py,z)=>({
    x:Math.max(CW*0.5-CW*z, Math.min(CW*0.5, px)),
    y:Math.max(CH*0.5-CH*z, Math.min(CH*0.5, py)),
  });

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

  const runWand=useCallback((mx,my)=>{
    if(!imgDataRef.current)return;
    const sx=Math.max(0,Math.min(CW-1,Math.round(mx))),sy=Math.max(0,Math.min(CH-1,Math.round(my)));
    // Build occupied mask from existing regions
    const occ=new Uint8Array(CW*CH);
    for(const r of regions){const b=r.bounds;for(let py=Math.max(0,b.y|0);py<Math.min(CH,(b.y+b.h+1)|0);py++)for(let px=Math.max(0,b.x|0);px<Math.min(CW,(b.x+b.w+1)|0);px++)if(ptIn(r.points,px,py))occ[py*CW+px]=1;}
    // Use cached Canny edge mask (set by autoSegment) as hard boundaries for the wand
    const wandCanny=(_wandEdgeCache&&_wandEdgeCache.canny&&_wandEdgeCache.w===CW&&_wandEdgeCache.h===CH)?_wandEdgeCache.canny:null;
    const wandSmoothed=(_wandEdgeCache&&_wandEdgeCache.smoothed&&_wandEdgeCache.w===CW&&_wandEdgeCache.h===CH)?_wandEdgeCache.smoothed:null;
    const rawMask=magicWandFill(imgDataRef.current,sx,sy,wandTolerance,wandEdgeSnap,3.0,occ,wandCanny,wandSmoothed);
    // [4] Morphological clean-up on wand fill mask (closing then opening)
    const closed=morphErode(morphDilate(rawMask,CW,CH,MORPH_KERNEL_SIZE),CW,CH,MORPH_KERNEL_SIZE);
    const opened=morphDilate(morphErode(closed,CW,CH,MORPH_KERNEL_SIZE),CW,CH,MORPH_KERNEL_SIZE);
    // Fall back to raw mask if morphology erased too much (very small fill regions)
    const rawCount=rawMask.reduce((s,v)=>s+v,0);
    const mask=opened.reduce((s,v)=>s+v,0)>=rawCount*0.3?opened:rawMask;
    // Derive boundary mask then trace contour
    const bMask=new Uint8Array(CW*CH);
    for(let y=0;y<CH;y++)for(let x=0;x<CW;x++){if(!mask[y*CW+x])continue;if(x===0||!mask[y*CW+x-1]||x===CW-1||!mask[y*CW+x+1]||y===0||!mask[(y-1)*CW+x]||y===CH-1||!mask[(y+1)*CW+x])bMask[y*CW+x]=1;}
    const contour=traceContour(bMask,CW,CH);if(contour.length<10)return;
    const tp=Math.min(80,Math.max(16,Math.floor(Math.sqrt(contour.length)/3)));const ds=downsample(contour,tp);if(ds.length<4)return;
    let sm=catmull(ds,3);sm=simplify(sm,2);sm=smoothContourAngles(sm);if(sm.length<4)return;
    let ar=0,ag=0,ab=0,ac=0;const d=imgDataRef.current.data;
    for(let i=0;i<CW*CH;i++){if(!mask[i])continue;ar+=d[i*4];ag+=d[i*4+1];ab+=d[i*4+2];ac++;}
    const avgC=ac>0?[Math.round(ar/ac),Math.round(ag/ac),Math.round(ab/ac)]:[180,180,180];
    const area=pArea(sm),bounds=pBounds(sm);if(bounds.w<8||bounds.h<8)return;
    const nodes=pointsToNodes(sm,Math.min(20,Math.max(6,Math.floor(Math.sqrt(area)/6))));
    const curve=buildCurve(nodes);const nid=nextId;
    setRegions(p=>[...p,{id:nid,label:`Region ${nid}`,nodes,points:curve,bounds:pBounds(curve),avgColor:avgC,dmc:closestDMC(...avgC),stitch:suggestStitch(area),direction:0,area:pArea(curve)}]);
    setNextId(n=>n+1);setSelId(nid);setEditMode("select");
  },[regions,wandTolerance,wandEdgeSnap,nextId]);
  const resetLasso=()=>{setLassoAnchors([]);setLassoSegments([]);setLassoPreview([]);setLassoNearClose(false);};

  const finishLasso=useCallback(()=>{
    if(lassoAnchors.length<3)return;
    const poly=[lassoAnchors[0]];
    for(const seg of lassoSegments)for(const pt of seg)poly.push(pt);
    poly.push(lassoAnchors[0]);
    const rawMask=fillPolygon(poly,CW,CH);
    const rawCount=rawMask.reduce((s,v)=>s+v,0);
    if(rawCount<20){resetLasso();return;}
    const closed=morphErode(morphDilate(rawMask,CW,CH,MORPH_KERNEL_SIZE),CW,CH,MORPH_KERNEL_SIZE);
    const opened=morphDilate(morphErode(closed,CW,CH,MORPH_KERNEL_SIZE),CW,CH,MORPH_KERNEL_SIZE);
    const mask=opened.reduce((s,v)=>s+v,0)>=rawCount*0.3?opened:rawMask;
    const bMask=new Uint8Array(CW*CH);
    for(let y=0;y<CH;y++)for(let x=0;x<CW;x++){if(!mask[y*CW+x])continue;if(x===0||!mask[y*CW+x-1]||x===CW-1||!mask[y*CW+x+1]||y===0||!mask[(y-1)*CW+x]||y===CH-1||!mask[(y+1)*CW+x])bMask[y*CW+x]=1;}
    const contour=traceContour(bMask,CW,CH);if(contour.length<10){resetLasso();return;}
    const tp=Math.min(80,Math.max(16,Math.floor(Math.sqrt(contour.length)/3)));const ds=downsample(contour,tp);if(ds.length<4){resetLasso();return;}
    let sm=catmull(ds,3);sm=simplify(sm,2);sm=smoothContourAngles(sm);if(sm.length<4){resetLasso();return;}
    let ar=0,ag=0,ab=0,ac=0;const d=imgDataRef.current?imgDataRef.current.data:new Uint8Array(0);
    for(let i=0;i<CW*CH;i++){if(!mask[i])continue;ar+=d[i*4];ag+=d[i*4+1];ab+=d[i*4+2];ac++;}
    const avgC=ac>0?[Math.round(ar/ac),Math.round(ag/ac),Math.round(ab/ac)]:[180,180,180];
    const area=pArea(sm),bounds=pBounds(sm);if(bounds.w<8||bounds.h<8){resetLasso();return;}
    const nodes=pointsToNodes(sm,Math.min(20,Math.max(6,Math.floor(Math.sqrt(area)/6))));
    const curve=buildCurve(nodes);const nid=nextId;
    setRegions(p=>[...p,{id:nid,label:"Region "+nid,nodes,points:curve,bounds:pBounds(curve),avgColor:avgC,dmc:closestDMC(...avgC),stitch:suggestStitch(area),direction:0,area:pArea(curve)}]);
    setNextId(n=>n+1);setSelId(nid);setEditMode("select");
    resetLasso();
  },[lassoAnchors,lassoSegments,nextId]);

  // Fit: reset zoom=1, pan=centre (content fills buffer at zoom=1)
  const doFit=useCallback(()=>{
    const np={x:0,y:0};
    setZoom(1);setPan(np);zoomRef.current=1;panRef.current=np;
  },[]);

  // Canvas render
  useEffect(()=>{
    if(!mainC.current)return;
    const canvas=mainC.current;canvas.width=CW;canvas.height=CH;
    const ctx=canvas.getContext("2d");
    const z=zoom,p=pan;
    // Background (no transform — fills entire buffer)
    ctx.fillStyle="#f5f0eb";ctx.fillRect(0,0,CW,CH);
    // === Content layer: zoom/pan transform ===
    ctx.save();ctx.translate(p.x,p.y);ctx.scale(z,z);
    try{
      if(imgRef.current&&(view==="original"||view==="overlay")){const img=imgRef.current,s=Math.min(CW/img.width,CH/img.height);ctx.globalAlpha=view==="overlay"?.35:1;ctx.drawImage(img,(CW-img.width*s)/2,(CH-img.height*s)/2,img.width*s,img.height*s);ctx.globalAlpha=1;}
      if(view!=="original"){
        for(const r of regions){ctx.save();ctx.beginPath();ctx.moveTo(r.points[0][0],r.points[0][1]);for(let i=1;i<r.points.length;i++)ctx.lineTo(r.points[i][0],r.points[i][1]);ctx.closePath();ctx.fillStyle=r.dmc.h+(view==="overlay"?"88":"cc");ctx.fill();ctx.restore();renderStitch(ctx,r.points,r.bounds,r.stitch,r.direction);}
        for(const r of regions){const isSel=selId===r.id;ctx.save();ctx.beginPath();ctx.moveTo(r.points[0][0],r.points[0][1]);for(let i=1;i<r.points.length;i++)ctx.lineTo(r.points[i][0],r.points[i][1]);ctx.closePath();ctx.strokeStyle=isSel?ACCENT:"rgba(255,255,255,0.7)";ctx.lineWidth=(isSel?3:1.5)/z;if(isSel){ctx.shadowColor=ACCENT;ctx.shadowBlur=6/z;}ctx.stroke();ctx.restore();
          if(r.bounds.w>18&&r.bounds.h>18)renderArrow(ctx,r.bounds,r.direction);}
      }
    }finally{ctx.restore();}
    // === Overlay layer: buffer-space, zoom-invariant sizes ===
    const cb=(cx,cy)=>[cx*z+p.x,cy*z+p.y];
    // Rec badges
    if(view!=="original"&&editMode==="select"){for(const r of regions){const recs=getRecommendations(r,regions).filter(rc=>!dismissed.has(`${r.id}-${rc.msg.slice(0,20)}`));if(recs.length>0){const hw=recs.some(rc=>rc.type==="warning");const[bx,by]=cb(r.bounds.x+r.bounds.w-4,r.bounds.y+6);ctx.save();ctx.beginPath();ctx.arc(bx,by,5,0,Math.PI*2);ctx.fillStyle=hw?"#f59e0b":"#60a5fa";ctx.fill();ctx.strokeStyle="#fff";ctx.lineWidth=1.5;ctx.stroke();ctx.fillStyle="#fff";ctx.font="bold 8px system-ui";ctx.textAlign="center";ctx.textBaseline="middle";ctx.fillText(recs.length.toString(),bx,by+0.5);ctx.restore();}}}
    // Node editing overlays
    if(editMode==="editNodes"&&selId){
      const sr=regions.find(r=>r.id===selId);
      if(sr&&sr.nodes){
        const nodes=sr.nodes;
        ctx.save();ctx.strokeStyle=ACCENT+"66";ctx.lineWidth=1;ctx.setLineDash([3,3]);
        const[n0x,n0y]=cb(nodes[0][0],nodes[0][1]);ctx.beginPath();ctx.moveTo(n0x,n0y);
        for(let i=1;i<nodes.length;i++){const[nbx,nby]=cb(nodes[i][0],nodes[i][1]);ctx.lineTo(nbx,nby);}
        ctx.closePath();ctx.stroke();ctx.setLineDash([]);ctx.restore();
        for(let i=0;i<nodes.length;i++){
          const j=(i+1)%nodes.length;
          const midCX=(nodes[i][0]+nodes[j][0])/2,midCY=(nodes[i][1]+nodes[j][1])/2;
          const[mbx,mby]=cb(midCX,midCY);
          ctx.save();ctx.beginPath();ctx.arc(mbx,mby,4,0,Math.PI*2);ctx.fillStyle=ACCENT+"44";ctx.fill();ctx.strokeStyle=ACCENT;ctx.lineWidth=1;ctx.stroke();ctx.restore();
          ctx.save();ctx.strokeStyle=ACCENT;ctx.lineWidth=1.2;ctx.beginPath();ctx.moveTo(mbx-2,mby);ctx.lineTo(mbx+2,mby);ctx.stroke();ctx.beginPath();ctx.moveTo(mbx,mby-2);ctx.lineTo(mbx,mby+2);ctx.stroke();ctx.restore();
        }
        for(let i=0;i<nodes.length;i++){
          const[nnx,nny]=cb(nodes[i][0],nodes[i][1]);
          const isActive=dragNode&&dragNode.regionId===selId&&dragNode.nodeIdx===i;
          ctx.save();ctx.beginPath();ctx.arc(nnx,nny,NODE_R,0,Math.PI*2);ctx.fillStyle=isActive?ACCENT:"#fff";ctx.fill();ctx.strokeStyle=ACCENT;ctx.lineWidth=2;ctx.stroke();ctx.restore();
        }
      }
    }
    // Freehand drawing preview (buffer-space)
    if(isDraw.current&&curPts.length>1){
      ctx.save();ctx.lineCap="round";ctx.lineJoin="round";
      const[bx0,by0]=cb(curPts[0][0],curPts[0][1]);ctx.beginPath();ctx.moveTo(bx0,by0);
      for(let i=1;i<curPts.length;i++){const[bxi,byi]=cb(curPts[i][0],curPts[i][1]);ctx.lineTo(bxi,byi);}
      ctx.strokeStyle="#14b8a6";ctx.lineWidth=2.5;ctx.stroke();
      const[bxL,byL]=cb(curPts[curPts.length-1][0],curPts[curPts.length-1][1]);
      ctx.setLineDash([4,4]);ctx.strokeStyle="#14b8a688";ctx.beginPath();ctx.moveTo(bxL,byL);ctx.lineTo(bx0,by0);ctx.stroke();ctx.setLineDash([]);
      ctx.beginPath();ctx.arc(bx0,by0,6,0,Math.PI*2);ctx.fillStyle="#14b8a6";ctx.fill();ctx.strokeStyle="#fff";ctx.lineWidth=2;ctx.stroke();
      ctx.restore();
    }
    // Magnetic lasso overlay (buffer-space)
    if(editMode==="lasso"&&lassoAnchors.length>0){
      const conBuf=[cb(lassoAnchors[0][0],lassoAnchors[0][1])];
      for(const seg of lassoSegments)for(const pt of seg)conBuf.push(cb(pt[0],pt[1]));
      if(conBuf.length>1){ctx.save();ctx.lineCap="round";ctx.lineJoin="round";ctx.strokeStyle="#000";ctx.lineWidth=4;ctx.beginPath();ctx.moveTo(conBuf[0][0],conBuf[0][1]);for(let i=1;i<conBuf.length;i++)ctx.lineTo(conBuf[i][0],conBuf[i][1]);ctx.stroke();ctx.strokeStyle="#00ffff";ctx.lineWidth=2;ctx.stroke();ctx.restore();}
      if(lassoPreview.length>1){ctx.save();ctx.lineCap="round";ctx.lineJoin="round";ctx.setLineDash([6,4]);const[lp0x,lp0y]=cb(lassoPreview[0][0],lassoPreview[0][1]);ctx.strokeStyle="#000";ctx.lineWidth=3;ctx.beginPath();ctx.moveTo(lp0x,lp0y);for(let i=1;i<lassoPreview.length;i++){const[lpx,lpy]=cb(lassoPreview[i][0],lassoPreview[i][1]);ctx.lineTo(lpx,lpy);}ctx.stroke();ctx.strokeStyle="#00ffff";ctx.lineWidth=1.5;ctx.stroke();ctx.setLineDash([]);ctx.restore();}
      for(let i=0;i<lassoAnchors.length;i++){
        const[abx,aby]=cb(lassoAnchors[i][0],lassoAnchors[i][1]),isFirst=i===0;
        ctx.save();
        if(isFirst){ctx.beginPath();ctx.arc(abx,aby,lassoNearClose?12:9,0,Math.PI*2);ctx.strokeStyle=lassoNearClose?"#22ff44":"#00ffff";ctx.lineWidth=2;ctx.stroke();}
        ctx.beginPath();ctx.arc(abx,aby,6,0,Math.PI*2);ctx.fillStyle=isFirst&&lassoNearClose?"#22ff44":"#00ffff";ctx.fill();ctx.strokeStyle="#000";ctx.lineWidth=1.5;ctx.stroke();ctx.restore();
      }
    }
  },[regions,selId,view,curPts,editMode,dismissed,dragNode,lassoAnchors,lassoSegments,lassoPreview,lassoNearClose,zoom,pan]);

  // Spacebar pan: set/clear isPanningRef, update cursor
  useEffect(()=>{
    if(phase!=="edit")return;
    const kd=e=>{
      if(e.code==="Space"&&!e.target.closest("input,textarea,select")){e.preventDefault();if(!isPanningRef.current){isPanningRef.current=true;if(mainC.current)mainC.current.style.cursor="grab";}}
    };
    const ku=e=>{
      if(e.code==="Space"){isPanningRef.current=false;if(mainC.current)mainC.current.style.cursor="";}
    };
    document.addEventListener("keydown",kd);document.addEventListener("keyup",ku);
    return()=>{document.removeEventListener("keydown",kd);document.removeEventListener("keyup",ku);};
  },[phase]);

  // Scroll wheel zoom (non-passive, attached imperatively to avoid passive-listener warning)
  useEffect(()=>{
    const el=mainC.current;if(!el||phase!=="edit")return;
    const wh=e=>{
      e.preventDefault();
      const dz=ZOOM_STEP_SCROLL*-Math.sign(e.deltaY);
      const newZ=Math.max(ZOOM_MIN,Math.min(ZOOM_MAX,zoomRef.current+dz));
      const rect=el.getBoundingClientRect();
      const bufX=(e.clientX-rect.left)*(CW/rect.width);
      const bufY=(e.clientY-rect.top)*(CH/rect.height);
      const np={x:bufX-(bufX-panRef.current.x)*(newZ/zoomRef.current),y:bufY-(bufY-panRef.current.y)*(newZ/zoomRef.current)};
      const cz=zoomRef.current;// use current before update to avoid stale
      const cpx=CW*0.5-CW*newZ,cpy=CH*0.5-CH*newZ;
      const clampedNp={x:Math.max(cpx,Math.min(CW*0.5,np.x)),y:Math.max(cpy,Math.min(CH*0.5,np.y))};
      setZoom(newZ);setPan(clampedNp);zoomRef.current=newZ;panRef.current=clampedNp;
    };
    el.addEventListener("wheel",wh,{passive:false});
    return()=>el.removeEventListener("wheel",wh);
  },[phase]);

  // Keyboard: Ctrl/Cmd+Z in lasso mode removes last anchor
  useEffect(()=>{
    if(editMode!=="lasso")return;
    const handler=e=>{
      if((e.ctrlKey||e.metaKey)&&e.key==='z'&&!e.shiftKey){
        e.preventDefault();
        if(lassoAnchors.length<=1){resetLasso();return;}
        setLassoAnchors(p=>p.slice(0,-1));
        setLassoSegments(p=>p.slice(0,-1));
        setLassoNearClose(false);
      }
    };
    document.addEventListener('keydown',handler);
    return()=>document.removeEventListener('keydown',handler);
  },[editMode,lassoAnchors.length]);

    const getPos=e=>{
      const rect=mainC.current.getBoundingClientRect();
      const t=e.touches?e.touches[0]:e;
      const bufX=(t.clientX-rect.left)*(CW/rect.width);
      const bufY=(t.clientY-rect.top)*(CH/rect.height);
      return[(bufX-panRef.current.x)/zoomRef.current,(bufY-panRef.current.y)/zoomRef.current];
    };

  const onDown=useCallback(e=>{
    const[mx,my]=getPos(e);

    // Middle mouse OR spacebar: start pan
    if(e.button===1||(e.button===0&&isPanningRef.current)){
      e.preventDefault();
      panStateRef.current={active:true,startX:e.clientX,startY:e.clientY,startPanX:panRef.current.x,startPanY:panRef.current.y};
      if(mainC.current)mainC.current.style.cursor="grabbing";
      return;
    }
    // Two-finger touch: start pinch/pan tracking
    if(e.touches&&e.touches.length===2){
      e.preventDefault();
      const dx=e.touches[0].clientX-e.touches[1].clientX,dy=e.touches[0].clientY-e.touches[1].clientY;
      const midX=(e.touches[0].clientX+e.touches[1].clientX)/2,midY=(e.touches[0].clientY+e.touches[1].clientY)/2;
      touchRef.current={count:2,lastDist:Math.sqrt(dx*dx+dy*dy),lastMidX:midX,lastMidY:midY};
      return;
    }
    // Node editing mode
    if(editMode==="editNodes"&&selId){
      e.preventDefault();
      const sr=regions.find(r=>r.id===selId);
      if(!sr||!sr.nodes)return;
      // Check if clicking a node
      const zHit=NODE_HIT/zoomRef.current;
      for(let i=0;i<sr.nodes.length;i++){
        if((mx-sr.nodes[i][0])**2+(my-sr.nodes[i][1])**2<zHit**2){
          setDragNode({regionId:selId,nodeIdx:i});return;
        }
      }
      // Check if clicking a midpoint (to add a node)
      for(let i=0;i<sr.nodes.length;i++){
        const j=(i+1)%sr.nodes.length;
        const midX=(sr.nodes[i][0]+sr.nodes[j][0])/2, midY=(sr.nodes[i][1]+sr.nodes[j][1])/2;
        if((mx-midX)**2+(my-midY)**2<zHit**2){
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
        if(d<EDGE_HIT/zoomRef.current){
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

    // Lasso mode
    if(editMode==="lasso"){
      e.preventDefault();
      if(lassoAnchors.length===0){setLassoAnchors([[mx,my]]);return;}
      if(lassoNearClose&&lassoAnchors.length>=3){finishLasso();return;}
      const last=lassoAnchors[lassoAnchors.length-1];
      const dd=Math.sqrt((mx-last[0])**2+(my-last[1])**2);
      if(dd<LASSO_MIN_ANCHOR_DISTANCE)return;
      const ax2=Math.round(last[0]),ay2=Math.round(last[1]);
      const bx2=Math.round(mx),by2=Math.round(my);
      const costD=getLassoCostData(imgDataRef.current);
      const seg=lassoPathfind(costD,CW,CH,ax2,ay2,bx2,by2);
      setLassoSegments(p=>[...p,seg.slice(1)]); // exclude start point (= previous anchor)
      setLassoAnchors(p=>[...p,[mx,my]]);
      setLassoPreview([]);
      return;
    }
    // Wand mode
    if(editMode==="wand"){e.preventDefault();runWand(mx,my);return;}

    // Draw mode
    if(editMode==="draw"){e.preventDefault();isDraw.current=true;setCurPts([getPos(e)]);return;}

    // Select mode — click to select region
    for(let i=regions.length-1;i>=0;i--)if(ptIn(regions[i].points,mx,my)){setSelId(regions[i].id);return;}
    setSelId(null);
  },[editMode,selId,regions,rebuildRegionCurve,runWand,lassoAnchors,lassoSegments,lassoNearClose,finishLasso,zoom]);

  const onMove=useCallback(e=>{
    // Active pan drag (spacebar/middle-mouse)
    if(panStateRef.current.active){
      e.preventDefault();
      const rect=mainC.current.getBoundingClientRect();
      const sc=CW/rect.width;
      const dx=(e.clientX-panStateRef.current.startX)*sc;
      const dy=(e.clientY-panStateRef.current.startY)*sc;
      const rawX=panStateRef.current.startPanX+dx;
      const rawY=panStateRef.current.startPanY+dy;
      const cz=zoomRef.current;
      const np={x:Math.max(CW*0.5-CW*cz,Math.min(CW*0.5,rawX)),y:Math.max(CH*0.5-CH*cz,Math.min(CH*0.5,rawY))};
      setPan(np);panRef.current=np;
      return;
    }
    // Two-finger pinch/pan
    if(e.touches&&e.touches.length===2&&touchRef.current.count===2){
      e.preventDefault();
      const tr=touchRef.current;
      const dx=e.touches[0].clientX-e.touches[1].clientX,dy=e.touches[0].clientY-e.touches[1].clientY;
      const newDist=Math.sqrt(dx*dx+dy*dy);
      const newMidX=(e.touches[0].clientX+e.touches[1].clientX)/2;
      const newMidY=(e.touches[0].clientY+e.touches[1].clientY)/2;
      const rect=mainC.current.getBoundingClientRect();
      const sc=CW/rect.width;
      if(tr.lastDist>0){
        const newZ=Math.max(ZOOM_MIN,Math.min(ZOOM_MAX,zoomRef.current*(newDist/tr.lastDist)));
        const midBufX=(newMidX-rect.left)*sc;
        const midBufY=(newMidY-rect.top)*sc;
        const np0={x:midBufX-(midBufX-panRef.current.x)*(newZ/zoomRef.current),y:midBufY-(midBufY-panRef.current.y)*(newZ/zoomRef.current)};
        const panDx=(newMidX-tr.lastMidX)*sc,panDy=(newMidY-tr.lastMidY)*sc;
        const np={x:Math.max(CW*0.5-CW*newZ,Math.min(CW*0.5,np0.x+panDx)),y:Math.max(CH*0.5-CH*newZ,Math.min(CH*0.5,np0.y+panDy))};
        setZoom(newZ);setPan(np);zoomRef.current=newZ;panRef.current=np;
      }
      touchRef.current={count:2,lastDist:newDist,lastMidX:newMidX,lastMidY:newMidY};
      return;
    }
    // Lasso live path preview
    if(editMode==="lasso"&&lassoAnchors.length>0){
      e.preventDefault();
      const now=Date.now();
      if(now-lassoLastMsRef.current<LASSO_DEBOUNCE_MS)return;
      lassoLastMsRef.current=now;
      const[mx,my]=getPos(e);
      const first=lassoAnchors[0];
      const nearClose=lassoAnchors.length>=3&&Math.sqrt((mx-first[0])**2+(my-first[1])**2)<=LASSO_CLOSE_RADIUS;
      setLassoNearClose(nearClose);
      const last=lassoAnchors[lassoAnchors.length-1];
      const ax2=Math.round(last[0]),ay2=Math.round(last[1]);
      const bx2=Math.round(mx),by2=Math.round(my);
      const costD=getLassoCostData(imgDataRef.current);
      const path=lassoPathfind(costD,CW,CH,ax2,ay2,bx2,by2);
      setLassoPreview(path);
      return;
    }
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
  },[dragNode,rebuildRegionCurve,editMode,lassoAnchors]);

  const onUp=useCallback(e=>{
    if(panStateRef.current.active){e?.preventDefault();panStateRef.current.active=false;if(mainC.current)mainC.current.style.cursor=isPanningRef.current?"grab":"";return;}
    if(e&&e.touches&&e.touches.length<2)touchRef.current={count:0,lastDist:0,lastMidX:0,lastMidY:0};
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
        <div style={{display:"flex",alignItems:"center",gap:8}}>
          <h2 className="emb-title" style={{margin:0}}>Embroidery Pattern Planner</h2>
          <span style={{display:"inline-block",backgroundColor:"#fbbf24",color:"#000",padding:"4px 8px",borderRadius:"4px",fontSize:"0.75em",fontWeight:"bold"}}>BETA</span>
        </div>
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
            <button className="emb-back-btn" onClick={()=>{setPhase("segment");setRegions([]);setSelId(null);setCurPts([]);isDraw.current=false;setEditMode("select");setDragNode(null);resetLasso();setZoom(1);setPan({x:0,y:0});zoomRef.current=1;panRef.current={x:0,y:0};}}>←</button>
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
          <button className={'tb-btn'+(editMode==="lasso"?' tb-btn--on':'')} onClick={()=>{setEditMode("lasso");setSelId(null);setDragNode(null);resetLasso();}}>
            🧲 Lasso</button>
        </div>

        {/* Zoom toolbar */}
        <div className="tb-grp" style={{width:"100%",marginBottom:6,gap:2}}>
          <button className="tb-btn" onClick={()=>{const nz=Math.max(ZOOM_MIN,zoom-ZOOM_STEP_BUTTON);const np={x:CW*(1-nz)/2,y:CH*(1-nz)/2};setZoom(nz);setPan(np);zoomRef.current=nz;panRef.current=np;}} style={{width:28,flexShrink:0}}>−</button>
          <span style={{fontSize:11,minWidth:38,textAlign:"center",color:"#64748b",padding:"0 2px"}}>{Math.round(zoom*100)}%</span>
          <button className="tb-btn" onClick={()=>{const nz=Math.min(ZOOM_MAX,zoom+ZOOM_STEP_BUTTON);const np={x:CW*(1-nz)/2,y:CH*(1-nz)/2};setZoom(nz);setPan(np);zoomRef.current=nz;panRef.current=np;}} style={{width:28,flexShrink:0}}>+</button>
          <button className="tb-btn" onClick={doFit} style={{marginLeft:4}}>Fit</button>
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
        {editMode==="lasso"&&<div className="emb-hint emb-hint--teal" style={{marginBottom:6}}><strong>Click</strong> to place anchors — path snaps to edges. Move near first anchor to close and fill the region. <strong>Ctrl+Z</strong> to undo.</div>}
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
            onContextMenu={e=>{if(e.button===1)e.preventDefault();}}
            onTouchStart={onDown} onTouchMove={onMove} onTouchEnd={onUp}
            onDoubleClick={e=>{
              if(editMode==="lasso"&&lassoAnchors.length>=3){finishLasso();return;}
              if(!isNodeEdit||!sel)return;
              const[mx,my]=getPos(e);
              for(let i=0;i<sel.nodes.length;i++){
                if((mx-sel.nodes[i][0])**2+(my-sel.nodes[i][1])**2<NODE_HIT**2){
                  deleteNode(sel.id,i);return;}}}}
            style={{width:"100%",display:"block",cursor:(editMode==="draw"||editMode==="wand"||editMode==="lasso")?"crosshair":isNodeEdit?"default":"pointer"}}/>          
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
