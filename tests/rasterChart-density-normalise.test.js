/**
 * tests/rasterChart-density-normalise.test.js
 *
 * Regression test for the B&W cluster eps-estimation bug:
 *
 *   On a clean digital chart every cell of a given glyph type is rendered
 *   identically, so all intra-cluster L2 distances are exactly 0.  All
 *   zero-distances land in bin[0] of the all-pairs histogram.  The original
 *   `estimateEps` peak-finding loop started at i=1 and could never nominate
 *   bin[0] as the first peak.  It instead found the next-smallest inter-cluster
 *   distance (ring vs dot, ~2.1) as the "first peak" and set eps to the valley
 *   AFTER that peak — far above the ring-dot distance — causing ring and dot
 *   cells to be treated as neighbours and merged into one cluster.
 *
 *   Primary fix (dbscan.js): check hist[0] as a first-peak candidate before
 *   entering the regular i=1..bins-2 loop.
 *
 *   Secondary fix (rasterChartStrategy.js): pass normalise:true to the B&W
 *   cluster call so that the fill-density scalar appended by featurise() is
 *   z-score-scaled to the same magnitude as the HOG dimensions, matching what
 *   the colour path already does.
 *
 *   This file is intentionally self-contained: it exercises only the pure-JS
 *   modules (hog.js, dbscan.js) that can run in Jest without OpenCV or a browser.
 */

'use strict';

// ── Module loading ────────────────────────────────────────────────────────────

global.self = global.self || {};
global.cv   = {};
global.RasterChartProjection = { gridFromProfiles: () => ({}) };
global.RasterChartHOG   = null;
global.RasterChartDBSCAN = null;

const hogMod  = require('../creator/rasterChart/hog.js');
global.RasterChartHOG = hogMod;
const dbscanMod = require('../creator/rasterChart/dbscan.js');
global.RasterChartDBSCAN = dbscanMod;

const { hog: computeHog, dHash: computeDHash } = hogMod;
const { estimateEps, cluster, mergeByHashHamming } = dbscanMod;

// ── Synthetic glyph factory ───────────────────────────────────────────────────

const P = 32; // canonical patch size

/** Hollow circle: inner radius ri, outer radius ro, centred at patch centre. */
function makeRing(ri = 6, ro = 10) {
  const px = new Uint8Array(P * P);
  const cx = 16, cy = 16;
  for (let y = 0; y < P; y++) for (let x = 0; x < P; x++) {
    const d = Math.hypot(x - cx, y - cy);
    if (d >= ri && d <= ro) px[y * P + x] = 255;
  }
  return px;
}

/** Small filled disc: radius r, centred at patch centre. */
function makeDot(r = 5) {
  const px = new Uint8Array(P * P);
  const cx = 16, cy = 16;
  for (let y = 0; y < P; y++) for (let x = 0; x < P; x++) {
    if (Math.hypot(x - cx, y - cy) <= r) px[y * P + x] = 255;
  }
  return px;
}

/** Diagonal cross. */
function makeCross() {
  const px = new Uint8Array(P * P);
  for (let i = 4; i < 28; i++) {
    px[i * P + i]           = 255;
    px[i * P + (P - 1 - i)] = 255;
    if (i + 1 < P) {
      px[(i + 1) * P + i]           = 200;
      px[(i + 1) * P + (P - 1 - i)] = 200;
    }
  }
  return px;
}

// ── featurise helper (mirrors cvPipeline.featurise without OpenCV) ────────────

function featurise(patches) {
  return patches.map(px => {
    const f = computeHog(px);
    let ink = 0;
    for (let i = 0; i < px.length; i++) if (px[i]) ink++;
    const density = ink / px.length;
    const combined = new Float32Array(f.length + 4);
    combined.set(f);
    combined[f.length]     = density;
    combined[f.length + 1] = 0; // stroke width stub
    combined[f.length + 2] = 0; // Euler number stub
    combined[f.length + 3] = 1; // bbox aspect ratio stub
    return combined;
  });
}

function l2(a, b) {
  let s = 0; for (let i = 0; i < a.length; i++) { const d = a[i] - b[i]; s += d * d; }
  return Math.sqrt(s);
}

function clusterGlyphs(patches, opts) {
  const features = featurise(patches);
  const dHashes  = patches.map(px => computeDHash(px));
  const raw    = cluster(features, opts);
  const dHashB = dHashes.map(h => (typeof h === 'bigint' ? h : BigInt(h)));
  return mergeByHashHamming(raw.assignments, raw.medoids, dHashB, 4);
}

// ── Tests ─────────────────────────────────────────────────────────────────────

const REPS = 12; // cells per glyph type (realistic batch size)

let ringPatch, dotPatch, crossPatch;
let ringFeature, dotFeature, crossFeature;

beforeAll(() => {
  ringPatch  = makeRing();
  dotPatch   = makeDot();
  crossPatch = makeCross();
  ringFeature  = featurise([ringPatch])[0];
  dotFeature   = featurise([dotPatch])[0];
  crossFeature = featurise([crossPatch])[0];
});

describe('HOG similarity: ring and dot are similar, cross is distinct', () => {
  test('ring fill fraction (density) is higher than dot fill fraction by > 5pp', () => {
    function density(px) { let k = 0; for (let i = 0; i < px.length; i++) if (px[i]) k++; return k / px.length; }
    expect(Math.abs(density(ringPatch) - density(dotPatch))).toBeGreaterThan(0.05);
  });

  test('ring-dot HOG distance is smaller than ring-cross and dot-cross', () => {
    const dRingDot   = l2(ringFeature, dotFeature);
    const dRingCross = l2(ringFeature, crossFeature);
    const dDotCross  = l2(dotFeature,  crossFeature);
    // Confirms the vulnerability: circularly-symmetric glyphs that differ
    // only in fill have similar gradient patterns.
    expect(dRingDot).toBeLessThan(dRingCross);
    expect(dRingDot).toBeLessThan(dDotCross);
  });
});

describe('estimateEps: bin[0] first-peak fix', () => {
  test('all-zero intra-cluster distances: eps is below the ring-dot distance', () => {
    // Build features for 12 cross + 12 ring + 12 dot, all identical within type.
    const features = featurise([
      ...Array(REPS).fill(crossPatch),
      ...Array(REPS).fill(ringPatch),
      ...Array(REPS).fill(dotPatch),
    ]);
    // The 198 intra-cluster distances are exactly 0; ring-dot is ~2.1.
    // After the fix, estimateEps must return a value BELOW the ring-dot
    // distance so they are not treated as neighbours.
    const eps = estimateEps(features);
    const dRingDot = l2(ringFeature, dotFeature);
    expect(eps).toBeLessThan(dRingDot);
  });

  test('eps stays below the smallest inter-cluster distance', () => {
    const features = featurise([
      ...Array(REPS).fill(crossPatch),
      ...Array(REPS).fill(ringPatch),
      ...Array(REPS).fill(dotPatch),
    ]);
    const minInterCluster = Math.min(
      l2(ringFeature, dotFeature),
      l2(ringFeature, crossFeature),
      l2(dotFeature,  crossFeature),
    );
    const eps = estimateEps(features);
    expect(eps).toBeLessThan(minInterCluster);
  });
});

describe('B&W cluster: 3 distinct glyph types produce 3 clusters', () => {
  test('ring and dot are assigned to different clusters', () => {
    const patches = [
      ...Array(REPS).fill(crossPatch),
      ...Array(REPS).fill(ringPatch),
      ...Array(REPS).fill(dotPatch),
    ];
    const assignments = clusterGlyphs(patches, { minPts: 2 });
    expect(assignments[REPS]).not.toBe(assignments[REPS * 2]);
  });

  test('cross is assigned to a different cluster from ring and dot', () => {
    const patches = [
      ...Array(REPS).fill(crossPatch),
      ...Array(REPS).fill(ringPatch),
      ...Array(REPS).fill(dotPatch),
    ];
    const assignments = clusterGlyphs(patches, { minPts: 2 });
    expect(assignments[0]).not.toBe(assignments[REPS]);
    expect(assignments[0]).not.toBe(assignments[REPS * 2]);
  });

  test('exactly 3 distinct cluster ids are produced', () => {
    const patches = [
      ...Array(REPS).fill(crossPatch),
      ...Array(REPS).fill(ringPatch),
      ...Array(REPS).fill(dotPatch),
    ];
    const assignments = clusterGlyphs(patches, { minPts: 2 });
    expect(new Set([assignments[0], assignments[REPS], assignments[REPS * 2]]).size).toBe(3);
  });

  test('all cells of each glyph type land in the same cluster (no noise)', () => {
    const patches = [
      ...Array(REPS).fill(crossPatch),
      ...Array(REPS).fill(ringPatch),
      ...Array(REPS).fill(dotPatch),
    ];
    const assignments = clusterGlyphs(patches, { minPts: 2 });
    expect(new Set(assignments.slice(0, REPS)).size).toBe(1);
    expect(new Set(assignments.slice(REPS, REPS * 2)).size).toBe(1);
    expect(new Set(assignments.slice(REPS * 2)).size).toBe(1);
  });

  test('normalise:true (secondary improvement) also produces 3 distinct clusters', () => {
    const patches = [
      ...Array(REPS).fill(crossPatch),
      ...Array(REPS).fill(ringPatch),
      ...Array(REPS).fill(dotPatch),
    ];
    const assignments = clusterGlyphs(patches, { minPts: 2, normalise: true });
    expect(new Set([assignments[0], assignments[REPS], assignments[REPS * 2]]).size).toBe(3);
  });
});
