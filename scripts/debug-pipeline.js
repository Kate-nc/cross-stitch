#!/usr/bin/env node
/**
 * scripts/debug-pipeline.js
 *
 * Instruments every pure-JS stage of the raster chart importer and dumps
 * intermediate outputs to scripts/debug-pipeline-out/ so you can inspect
 * what each stage sees and where the results first diverge from expectations.
 *
 * PIPELINE STAGES (in order):
 *   [OCV] 1. preprocess         – grayscale → Otsu or adaptive threshold → Uint8Array binary
 *   [OCV] 2. detectCorners      – largest quad contour / Hough fallback → 4 corner points
 *   [OCV] 3. warpAndPreprocess  – perspective-warp → binary; also corrects skew
 *   [JS]  4. detectGrid         – projection-profile peak-finding → {cellPitch, originRow, originCol, rows, cols}
 *   [OCV] 5. extractCells       – crop + resize each cell to 32×32 binary tile → Uint8Array[]
 *   [JS]  6. featurise          – HOG + dHash per 32×32 tile → {features[], dHashes[]}
 *   [JS]  7. extractCellColors  – modal-window-median RGB per cell → Uint8Array (rows×cols×3)
 *   [JS]  8. cluster            – DBSCAN or paletteSeededCluster → {assignments[]}
 *   [BRW] 9. ocrLegend          – Tesseract OCR → structured legend entries
 *
 * [OCV] = requires OpenCV.js WASM (browser/Worker only) – stubbed with synthetic data below.
 * [BRW] = browser-only (Tesseract Web Worker) – skipped here.
 * [JS]  = pure JavaScript – fully exercised.
 *
 * OUTPUT FILES (scripts/debug-pipeline-out/<fixture>/)
 *   stage4-grid.json          – detected grid parameters
 *   stage4-rowsum.csv         – projection profile row sums (for plotting)
 *   stage4-colsum.csv         – projection profile col sums (for plotting)
 *   stage6-hog-sample.json    – HOG vector for first cell of each cluster
 *   stage7-cell-colors.json   – per-cell RGB + expected colour
 *   stage7-cell-colors.ppm    – visual: one px per cell, scaled ×8 → view in any image viewer
 *   stage8-clusters.json      – cluster assignment per cell + summary
 *   DIVERGENCE.txt            – analysis: expected vs actual cluster counts and first bad cell
 */

'use strict';

const fs   = require('fs');
const path = require('path');

// ── Load pure-JS modules ─────────────────────────────────────────────────────

// Each module uses an IIFE that exports via `self.X = ...` (worker) or
// `module.exports = ...` (CommonJS). We load them with require().

// Stub the worker globals the IIFEs reference at init time.
global.self = global.self || {};
global.RasterChartProjection = null; // filled after require
global.RasterChartHOG        = null;
global.RasterChartDBSCAN     = null;
global.cv = {}; // cvPipeline.js references cv in function bodies only

const cvPipeline  = require('../creator/rasterChart/cvPipeline.js');
const projection  = require('../creator/rasterChart/projectionProfile.js');
const hog         = require('../creator/rasterChart/hog.js');
const dbscan      = require('../creator/rasterChart/dbscan.js');

// Patch worker globals so internal cross-module calls inside the IIFEs work.
global.RasterChartProjection = projection;
global.RasterChartHOG        = hog;
global.RasterChartDBSCAN     = dbscan;

const {
  extractCellColors,
  detectBarrelDistortion,
} = cvPipeline;
const { gridFromProfiles } = projection;
const { hog: computeHog } = hog;
const { cluster, mergeByHashHamming } = dbscan;

// ── Output helpers ────────────────────────────────────────────────────────────

const OUT_DIR = path.join(__dirname, 'debug-pipeline-out');

function ensureDir(d) {
  if (!fs.existsSync(d)) fs.mkdirSync(d, { recursive: true });
}

function save(dir, name, content) {
  ensureDir(dir);
  const p = path.join(dir, name);
  fs.writeFileSync(p, typeof content === 'string' ? content : JSON.stringify(content, null, 2));
  console.log('  wrote', path.relative(process.cwd(), p));
  return p;
}

/** Write a PPM P6 binary image (1 byte per channel, no alpha). */
function savePPM(dir, name, pixels, w, h) {
  ensureDir(dir);
  const p = path.join(dir, name);
  const header = Buffer.from(`P6\n${w} ${h}\n255\n`);
  const body   = Buffer.from(pixels); // pixels is RGB flat array, length = w*h*3
  fs.writeFileSync(p, Buffer.concat([header, body]));
  console.log('  wrote', path.relative(process.cwd(), p), `(${w}×${h} PPM)`);
}

// ── Synthetic image generators ────────────────────────────────────────────────
//
// We synthesise binary grids and colour RGBA buffers directly, bypassing
// the OpenCV stages (preprocess / detectCorners / warpAndPreprocess / extractCells).
// The synthetic images are designed to stress exactly the pure-JS stages.

const CELL_PITCH = 20;

/**
 * Draw a 1-px grid of horizontal and vertical lines into a binary (0/255) buffer.
 * Returns { binary: Uint8Array, w, h }
 */
function makeGridBinary(rows, cols, pitch) {
  const w = cols * pitch + 1;
  const h = rows * pitch + 1;
  const bin = new Uint8Array(w * h); // 0 = paper
  // Horizontal lines at y = r * pitch
  for (let r = 0; r <= rows; r++) {
    const y = r * pitch;
    for (let x = 0; x < w; x++) bin[y * w + x] = 255;
  }
  // Vertical lines at x = c * pitch
  for (let c = 0; c <= cols; c++) {
    const x = c * pitch;
    for (let y = 0; y < h; y++) bin[y * w + x] = 255;
  }
  return { binary: bin, w, h };
}

/**
 * Build a 32×32 grayscale binary patch for a named glyph.
 * Glyph is drawn as white ink on black background (convention used by extractCells).
 *   'cross' – diagonal cross
 *   'ring'  – hollow circle
 *   'dot'   – small filled circle
 *   'solid' – filled square (generic symbol for colour-only tests)
 */
function makeGlyphPatch(name) {
  const P = 32;
  const px = new Uint8Array(P * P);  // 0 = black, 255 = ink

  if (name === 'cross') {
    for (let i = 4; i < 28; i++) {
      px[i * P + i]          = 255; // top-left → bottom-right
      px[i * P + (P - 1 - i)] = 255; // top-right → bottom-left
      // thicken by 1 px
      if (i + 1 < P) {
        px[(i + 1) * P + i]          = 200;
        px[(i + 1) * P + (P - 1 - i)] = 200;
      }
    }
  } else if (name === 'ring') {
    const cx = 16, cy = 16, ro = 10, ri = 6;
    for (let y = 0; y < P; y++) for (let x = 0; x < P; x++) {
      const d = Math.hypot(x - cx, y - cy);
      if (d >= ri && d <= ro) px[y * P + x] = 255;
    }
  } else if (name === 'dot') {
    const cx = 16, cy = 16, r = 5;
    for (let y = 0; y < P; y++) for (let x = 0; x < P; x++) {
      if (Math.hypot(x - cx, y - cy) <= r) px[y * P + x] = 255;
    }
  } else { // 'solid' / unknown
    for (let y = 8; y < 24; y++) for (let x = 8; x < 24; x++) px[y * P + x] = 200;
  }

  return px;
}

/**
 * Build a flat RGBA image for extractCellColors.
 * Each cell is filled with a solid background colour, then a dark "glyph" patch
 * painted in the centre (matching the modal-window heuristic: ≥20 % background).
 *
 * @param {number} rows
 * @param {number} cols
 * @param {number} pitch
 * @param {Array<{r,g,b,glyph?}>} cellDefs  – one entry per cell in row-major order
 * @param {{r,g,b}} [tint]                  – optional constant Lab-space tint
 */
function makeRGBA(rows, cols, pitch, cellDefs, tint) {
  const w = cols * pitch, h = rows * pitch;
  const rgba = new Uint8ClampedArray(w * h * 4);

  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      const def   = cellDefs[row * cols + col] || { r: 255, g: 255, b: 255 };
      const bgR   = Math.min(255, def.r + (tint ? tint.r : 0));
      const bgG   = Math.min(255, def.g + (tint ? tint.g : 0));
      const bgB   = Math.min(255, def.b + (tint ? tint.b : 0));

      const x0 = col * pitch, y0 = row * pitch;
      for (let dy = 0; dy < pitch; dy++) {
        for (let dx = 0; dx < pitch; dx++) {
          const i = ((y0 + dy) * w + (x0 + dx)) * 4;
          rgba[i]     = bgR;
          rgba[i + 1] = bgG;
          rgba[i + 2] = bgB;
          rgba[i + 3] = 255;
        }
      }

      // Paint a small dark glyph in the inner ~30 % of the cell so
      // modal-window median sees a clear background majority.
      // Glyph width/height ≈ 40 % of pitch (stays inside the 20 % keepThresh).
      const gStart = Math.floor(pitch * 0.3);
      const gEnd   = Math.ceil(pitch * 0.7);
      const DARK   = 20; // dark ink colour
      for (let dy = gStart; dy < gEnd; dy++) {
        for (let dx = gStart; dx < gEnd; dx++) {
          const isGlyph = def.glyph !== 'none' &&
            (dy === gStart || dy === gEnd - 1 || dx === gStart || dx === gEnd - 1);
          if (!isGlyph) continue;
          const i = ((y0 + dy) * w + (x0 + dx)) * 4;
          rgba[i] = DARK; rgba[i + 1] = DARK; rgba[i + 2] = DARK;
        }
      }
    }
  }

  return { rgba, w, h };
}

// ── Fixture definitions ───────────────────────────────────────────────────────
//
// Three scenarios exercising different pipeline paths.

const FIXTURES = [
  {
    name:        'A_clean_bw',
    description: 'Clean B&W screenshot — 3 distinct glyph shapes, 1 colour',
    rows:        6, cols: 6, pitch: CELL_PITCH,
    // 3 groups of 12 cells, glyphs: cross / ring / dot
    cellGlyphs: [
      ...Array(12).fill('cross'),
      ...Array(12).fill('ring'),
      ...Array(12).fill('dot'),
    ],
    // All cells same white background
    cellColors: () => Array(36).fill({ r: 240, g: 240, b: 240 }),
    expectedClusters: 3,
  },
  {
    name:        'B_colour_same_glyph',
    description: 'Colour chart — 2 background colours, identical glyphs (should split by colour)',
    rows:        4, cols: 4, pitch: CELL_PITCH,
    cellGlyphs: Array(16).fill('solid'),
    // 8 red cells then 8 blue cells
    cellColors: () => [
      ...Array(8).fill({ r: 200, g: 60,  b: 60  }),
      ...Array(8).fill({ r: 60,  g: 60,  b: 200 }),
    ],
    expectedClusters: 2,
  },
  {
    name:        'C_cream_paper_tint',
    description: 'Printed chart on cream paper — tint shifts every cell toward yellow; background normalisation should recover 2 clusters',
    rows:        4, cols: 4, pitch: CELL_PITCH,
    cellGlyphs: Array(16).fill('solid'),
    cellColors: () => [
      ...Array(8).fill({ r: 200, g: 60,  b: 60  }),
      ...Array(8).fill({ r: 60,  g: 60,  b: 200 }),
    ],
    // Cream-paper tint: +15 R, +10 G, -8 B across every cell
    tint: { r: 15, g: 10, b: -8 },
    expectedClusters: 2,
  },
];

// ── Stage 4: detectGrid (projection profiles) ─────────────────────────────────

function runStage4(fixture, outDir) {
  console.log('\n  [Stage 4] detectGrid');
  const { rows, cols, pitch } = fixture;
  const { binary, w, h } = makeGridBinary(rows, cols, pitch);

  // Build row/col sums (same logic as cvPipeline.detectGrid)
  const rowSum = new Float32Array(h);
  const colSum = new Float32Array(w);
  for (let y = 0; y < h; y++) {
    let s = 0;
    for (let x = 0; x < w; x++) {
      const v = binary[y * w + x] ? 1 : 0;
      s += v;
      colSum[x] += v;
    }
    rowSum[y] = s;
  }

  const grid = gridFromProfiles(rowSum, colSum, { expectedCellSizeHint: 0 });
  const distortion = detectBarrelDistortion(grid);
  grid.distortion = distortion;

  save(outDir, 'stage4-grid.json', {
    input: { w, h, rows, cols, pitch },
    output: grid,
    checks: {
      pitchCorrect:      Math.abs(grid.cellPitch - pitch) <= 1,
      rowCountCorrect:   grid.rows === rows,
      colCountCorrect:   grid.cols === cols,
      notDistorted:      !distortion.distorted,
    },
  });

  save(outDir, 'stage4-rowsum.csv',
    Array.from(rowSum).map((v, i) => `${i},${v}`).join('\n'));
  save(outDir, 'stage4-colsum.csv',
    Array.from(colSum).map((v, i) => `${i},${v}`).join('\n'));

  return grid;
}

// ── Stage 6: featurise (HOG + dHash) ─────────────────────────────────────────
//
// In the real pipeline extractCells (OpenCV) provides 32×32 binary tiles.
// We synthesise them directly from the fixture's glyph list.

function runStage6(fixture, outDir) {
  console.log('\n  [Stage 6] featurise (HOG)');
  const { cellGlyphs } = fixture;

  const patches   = cellGlyphs.map(g => makeGlyphPatch(g));
  const features  = patches.map(p => computeHog(p));
  const dHashes   = patches.map(p => computeDHash(p));

  // Quick sanity: feature vector length
  const dim = features[0] ? features[0].length : 0;

  save(outDir, 'stage6-hog-sample.json', {
    featureDim: dim,
    cellCount:  features.length,
    // Show first cell of each unique glyph type
    samples: [...new Set(cellGlyphs)].map(name => {
      const idx = cellGlyphs.indexOf(name);
      return {
        glyph: name,
        cellIndex: idx,
        // First 8 values of the HOG vector
        hogPreview: Array.from(features[idx].slice(0, 8)).map(v => +v.toFixed(4)),
        dHash: dHashes[idx].toString(16),
      };
    }),
  });

  return { features, dHashes };
}

/** dHash (difference hash): 8×8 down-sample then compare adjacent pixels → 64-bit BigInt. */
function computeDHash(patch32) {
  const P = 32, S = 8;
  // Down-sample patch to 9×8 by averaging blocks
  const ds = new Uint8Array(9 * S);
  const bw = P / 9, bh = P / S; // approximate block sizes
  for (let y = 0; y < S; y++) {
    for (let x = 0; x < 9; x++) {
      let sum = 0, cnt = 0;
      const y0 = Math.round(y * bh), y1 = Math.round((y + 1) * bh);
      const x0 = Math.round(x * bw), x1 = Math.round((x + 1) * bw);
      for (let dy = y0; dy < Math.min(y1, P); dy++) {
        for (let dx = x0; dx < Math.min(x1, P); dx++) {
          sum += patch32[dy * P + dx]; cnt++;
        }
      }
      ds[y * 9 + x] = cnt ? sum / cnt : 0;
    }
  }
  // Adjacent differences (left-right) → 64 bits
  let hash = 0n;
  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      const bit = ds[y * 9 + x] < ds[y * 9 + x + 1] ? 1n : 0n;
      hash = (hash << 1n) | bit;
    }
  }
  return hash;
}

// ── Stage 7: extractCellColors ────────────────────────────────────────────────

function runStage7(fixture, outDir) {
  console.log('\n  [Stage 7] extractCellColors');
  const { rows, cols, pitch, cellColors } = fixture;
  const defs = cellColors();
  const { rgba, w, h } = makeRGBA(rows, cols, pitch, defs, fixture.tint);
  const grid = { cellPitch: pitch, originRow: 0, originCol: 0, rows, cols };

  const result = extractCellColors(rgba, w, h, grid);

  // Build a visual PPM: each cell = 1 pixel, scale ×8 for visibility
  const SCALE = 8;
  const pw = cols * SCALE, ph = rows * SCALE;
  const ppmPx = new Uint8Array(pw * ph * 3);
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const base = (r * cols + c) * 3;
      const R = result.cellColors[base], G = result.cellColors[base + 1], B = result.cellColors[base + 2];
      for (let dy = 0; dy < SCALE; dy++) {
        for (let dx = 0; dx < SCALE; dx++) {
          const pi = ((r * SCALE + dy) * pw + (c * SCALE + dx)) * 3;
          ppmPx[pi] = R; ppmPx[pi + 1] = G; ppmPx[pi + 2] = B;
        }
      }
    }
  }
  savePPM(outDir, 'stage7-cell-colors.ppm', ppmPx, pw, ph);

  // JSON with expected vs actual per cell
  const cellReport = [];
  for (let i = 0; i < rows * cols; i++) {
    const base = i * 3;
    const expected = defs[i];
    const tint = fixture.tint || { r: 0, g: 0, b: 0 };
    const expectedR = Math.min(255, expected.r + tint.r);
    const expectedG = Math.min(255, expected.g + tint.g);
    const expectedB = Math.min(255, expected.b + Math.max(-255, tint.b));
    const gotR = result.cellColors[base];
    const gotG = result.cellColors[base + 1];
    const gotB = result.cellColors[base + 2];
    const drift = Math.abs(gotR - expectedR) + Math.abs(gotG - expectedG) + Math.abs(gotB - expectedB);
    cellReport.push({
      cell: i,
      expected: [expectedR, expectedG, expectedB],
      got: [gotR, gotG, gotB],
      totalDrift: drift,
      ok: drift <= 20,
    });
  }

  const badCells = cellReport.filter(c => !c.ok);
  save(outDir, 'stage7-cell-colors.json', {
    rows, cols,
    badCellCount: badCells.length,
    firstBadCell: badCells[0] || null,
    cells: cellReport,
  });

  return { result, rgba };
}

// ── Stage 8: cluster (DBSCAN) ─────────────────────────────────────────────────

function runStage8(fixture, outDir, features, dHashes) {
  console.log('\n  [Stage 8] cluster (DBSCAN)');

  // Convert BigInt dHashes to strings for JSON serialisation
  const dHashStrings = dHashes.map(h => h.toString(16));
  const dHashBig     = dHashes.map(h => (typeof h === 'bigint' ? h : BigInt(h)));

  const raw = cluster(features, { minPts: 2 });
  const merged = mergeByHashHamming(raw.assignments, raw.medoids, dHashBig, 4);

  const clusterIds = new Set(merged.filter(a => a >= 0));
  const noiseCount = merged.filter(a => a < 0).length;

  // Expected: one cluster per unique glyph name
  const expectedClusterCount = fixture.expectedClusters;
  const gotClusterCount      = clusterIds.size;

  // Check each cell: it should map to the same cluster as the other cells
  // with the same glyph.
  const { cellGlyphs } = fixture;
  const glyphToExpectedCluster = {};
  const wrongCells = [];
  merged.forEach((cid, idx) => {
    const g = cellGlyphs[idx];
    if (cid < 0) {
      wrongCells.push({ cell: idx, glyph: g, cluster: 'noise' });
      return;
    }
    if (glyphToExpectedCluster[g] === undefined) {
      glyphToExpectedCluster[g] = cid;
    } else if (glyphToExpectedCluster[g] !== cid) {
      wrongCells.push({ cell: idx, glyph: g, expectedCluster: glyphToExpectedCluster[g], gotCluster: cid });
    }
  });

  // Cross-contamination: did two different glyph types land in the same cluster?
  const clusterGlyphs = {};
  merged.forEach((cid, idx) => {
    if (cid < 0) return;
    if (!clusterGlyphs[cid]) clusterGlyphs[cid] = new Set();
    clusterGlyphs[cid].add(cellGlyphs[idx]);
  });
  const mergedClusters = Object.entries(clusterGlyphs)
    .filter(([, s]) => s.size > 1)
    .map(([id, s]) => ({ clusterId: +id, glyphsMerged: [...s] }));

  const pass = gotClusterCount === expectedClusterCount
            && wrongCells.length === 0
            && mergedClusters.length === 0;

  save(outDir, 'stage8-clusters.json', {
    eps:            raw.eps,
    expectedClusters: expectedClusterCount,
    gotClusters:      gotClusterCount,
    noiseCount,
    pass,
    wrongCells:       wrongCells.slice(0, 20),
    mergedClusters,
    assignments:      Array.from(merged),
  });

  return { assignments: merged, pass, gotClusterCount, expectedClusterCount };
}

// ── Run all fixtures and write DIVERGENCE.txt ────────────────────────────────

async function main() {
  ensureDir(OUT_DIR);
  console.log('Output dir:', OUT_DIR);

  const divergenceLines = [
    'PIPELINE DIVERGENCE REPORT',
    '==========================',
    '',
    'Stages [OCV] (preprocess, detectCorners, warpAndPreprocess, extractCells) require',
    'OpenCV.js WASM and cannot run in Node.js — synthetic inputs are used instead.',
    'Stage [BRW] (ocrLegend via Tesseract) is browser-only and is skipped.',
    '',
  ];

  for (const fixture of FIXTURES) {
    console.log('\n═══════════════════════════════════════════════');
    console.log(`Fixture: ${fixture.name}`);
    console.log(fixture.description);
    const outDir = path.join(OUT_DIR, fixture.name);

    // Stage 4 — detectGrid
    const grid = runStage4(fixture, outDir);
    const stage4ok = Math.abs(grid.cellPitch - fixture.pitch) <= 1
                  && grid.rows === fixture.rows
                  && grid.cols === fixture.cols;
    console.log(`  Stage 4 ${stage4ok ? 'PASS' : 'FAIL'}: pitch=${grid.cellPitch} expected=${fixture.pitch}, rows=${grid.rows}/${fixture.rows}, cols=${grid.cols}/${fixture.cols}`);

    // Stage 6 — featurise
    const { features, dHashes } = runStage6(fixture, outDir);
    console.log(`  Stage 6 PASS: ${features.length} cells, dim=${features[0] ? features[0].length : 0}`);

    // Stage 7 — extractCellColors
    const { result: colorResult } = runStage7(fixture, outDir);
    const colorData = JSON.parse(
      fs.readFileSync(path.join(outDir, 'stage7-cell-colors.json'), 'utf8'));
    const stage7ok = colorData.badCellCount === 0;
    console.log(`  Stage 7 ${stage7ok ? 'PASS' : 'FAIL'}: ${colorData.badCellCount} cells with colour drift > 20`);

    // Stage 8 — cluster
    const { pass: stage8ok, gotClusterCount, expectedClusterCount } = runStage8(
      fixture, outDir, features, dHashes);
    console.log(`  Stage 8 ${stage8ok ? 'PASS' : 'FAIL'}: got ${gotClusterCount} clusters, expected ${expectedClusterCount}`);

    // Record divergence
    divergenceLines.push(`─── ${fixture.name} ───────────────────────────────────`);
    divergenceLines.push(fixture.description);
    divergenceLines.push(`  Stage 4 (detectGrid):        ${stage4ok ? 'PASS' : 'FAIL  <── earliest divergence?'}`);
    divergenceLines.push(`  Stage 6 (featurise):         PASS (pure HOG on synthetic patches)`);
    divergenceLines.push(`  Stage 7 (extractCellColors): ${stage7ok ? 'PASS' : `FAIL  <── ${colorData.badCellCount} cells wrong (see stage7-cell-colors.json)`}`);
    divergenceLines.push(`  Stage 8 (cluster):           ${stage8ok ? 'PASS' : `FAIL  <── got ${gotClusterCount} clusters, wanted ${expectedClusterCount}`}`);
    divergenceLines.push('');

    // Identify first failing stage
    const firstFail = !stage4ok ? 'Stage 4 (detectGrid)'
                    : !stage7ok ? 'Stage 7 (extractCellColors)'
                    : !stage8ok ? 'Stage 8 (cluster)'
                    : null;
    if (firstFail) {
      divergenceLines.push(`  >>> EARLIEST DIVERGENCE: ${firstFail}`);
      divergenceLines.push('');
    }
  }

  divergenceLines.push('');
  divergenceLines.push('NOTES ON STAGES NOT EXERCISED HERE');
  divergenceLines.push('───────────────────────────────────');
  divergenceLines.push('[OCV] Stage 1 preprocess: To debug, open the browser DevTools,');
  divergenceLines.push('  paste this into the console after importing a chart:');
  divergenceLines.push('    window._debugPreprocess = true;');
  divergenceLines.push('  Then in creator/rasterChart/cvPipeline.js add after line "return { binary, w, h, otsuFastPath }":');
  divergenceLines.push('    if (window._debugPreprocess) { window._lastBinary = out; window._lastBinaryW = downscaled.w; window._lastBinaryH = downscaled.h; }');
  divergenceLines.push('  Render it with: ctx.putImageData(new ImageData(new Uint8ClampedArray(window._lastBinary.flatMap(v=>[v,v,v,255])), window._lastBinaryW, window._lastBinaryH), 0, 0)');
  divergenceLines.push('');
  divergenceLines.push('[OCV] Stage 3 warpAndPreprocess: Incorrect corners → wrong warp → everything downstream fails.');
  divergenceLines.push('  Check `autoCorners` in rasterChartStrategy.js — they are stored in the CorrectionUI state.');
  divergenceLines.push('  Open the Grid tab in the importer UI; the corner pins should sit exactly at the chart border corners.');
  divergenceLines.push('');
  divergenceLines.push('[OCV] Stage 5 extractCells: Cell-pitch drift → sample windows slide onto grid lines → all cells snap to black DMC.');
  divergenceLines.push('  Diagnostic already exists: the Grid tab CellSamplePreview shows one swatch per cell.');
  divergenceLines.push('  Long grey/black bands = pitch drift; use the pitch ruler to correct.');
  divergenceLines.push('');
  divergenceLines.push('[BRW] Stage 9 ocrLegend: OCR failure is non-fatal; the pipeline falls back to the full DMC palette.');
  divergenceLines.push('  Check confidence.legend.meanWordConfidence in telemetry (IndexedDB importerTelemetry store).');

  save(OUT_DIR, 'DIVERGENCE.txt', divergenceLines.join('\n'));

  console.log('\n\nAll done. Outputs in', OUT_DIR);
}

main().catch(e => { console.error(e); process.exit(1); });
