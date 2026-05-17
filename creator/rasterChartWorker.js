/* creator/rasterChartWorker.js
 * ════════════════════════════════════════════════════════════════════════
 *   Dedicated Web Worker hosting the raster-chart CV pipeline.
 *
 *   Loads OpenCV.js + Tesseract.js + helper modules via importScripts and
 *   replies to RPC messages from the main thread. Owns the entire CV stack
 *   so the heavy work is off the React render loop.
 *
 *   Protocol:
 *     in  → { type: 'init' }
 *     in  → { type: 'preprocess',     id, rgba, w, h, opts }
 *     in  → { type: 'detectCorners',  id, binary, w, h, opts }
 *     in  → { type: 'warp',           id, rgba, w, h, corners, opts }
 *     in  → { type: 'detectGrid',     id, binary, w, h, opts }
 *     in  → { type: 'extractCells',   id, binary, w, h, grid, opts }
 *     in  → { type: 'featurise',      id, cells }
 *     in  → { type: 'cluster',        id, features, dHashes, opts }
 *     in  → { type: 'ocrLegend',      id, rgba, w, h, opts }
 *     in  → { type: 'terminate' }
 *     out → { type: 'progress', id, stage, label, fraction }
 *     out → { type: 'result',   id, payload }
 *     out → { type: 'error',    id, error: { name, message } }
 *
 *   Tesseract.js spawns its own internal worker — we do NOT nest it inside
 *   this one. We simply call Tesseract.recognize() and await the result.
 *
 *   Lifecycle: the main thread should `terminate()` this worker between
 *   large jobs to defragment the Emscripten heap, then respawn.
 * ════════════════════════════════════════════════════════════════════════
 */

/* eslint-env worker */
/* global importScripts, cv, Tesseract, MatScope, RasterChartCV,
          RasterChartHOG, RasterChartDBSCAN, RasterChartOCRRepair */

(function () {
  'use strict';
  if (typeof importScripts !== 'function') return;

  // Pinned versions per the project spec.
  const OPENCV_URL    = self.OPENCV_URL    || './assets/opencv.js'; // self-hosted, with CDN fallback below
  const OPENCV_CDN    = 'https://docs.opencv.org/4.10.0/opencv.js';
  const TESSERACT_URL = 'https://cdn.jsdelivr.net/npm/tesseract.js@7/dist/tesseract.min.js';
  const IMAGEHASH_URL = 'https://unpkg.com/imagehash-web/dist/imagehash-web.min.js';
  const DBSCAN_URL    = 'https://cdn.jsdelivr.net/npm/density-clustering';

  let cvReady = null;

  function loadHelpers() {
    importScripts(
      './rasterChart/matScope.js',
      './rasterChart/projectionProfile.js',
      './rasterChart/hog.js',
      './rasterChart/ocrRepair.js',
      './rasterChart/dbscan.js',
      './rasterChart/cvPipeline.js',
    );
  }

  function loadOpenCV() {
    if (cvReady) return cvReady;
    cvReady = new Promise((resolve, reject) => {
      try { importScripts(OPENCV_URL); }
      catch (_) { try { importScripts(OPENCV_CDN); } catch (e) { reject(e); return; } }
      // OpenCV.js sets cv.onRuntimeInitialized when WASM is ready.
      if (typeof cv === 'undefined') return reject(new Error('cv global missing after importScripts'));
      if (cv.Mat) return resolve();
      cv['onRuntimeInitialized'] = () => resolve();
    });
    return cvReady;
  }

  function loadAuxLibs() {
    try { importScripts(DBSCAN_URL); } catch (_) {}
    try { importScripts(IMAGEHASH_URL); } catch (_) {}
  }

  function loadTesseract() {
    try { importScripts(TESSERACT_URL); } catch (e) { return Promise.reject(e); }
    return Promise.resolve();
  }

  // ── message routing ────────────────────────────────────────────────────

  function send(type, id, payload) { self.postMessage(Object.assign({ type, id }, payload)); }
  function progress(id, stage, label, fraction) {
    self.postMessage({ type: 'progress', id, stage, label, fraction: fraction || 0 });
  }
  function errOut(id, e) {
    self.postMessage({ type: 'error', id, error: {
      name: e && e.name || 'Error',
      message: e && e.message || String(e),
    }});
  }

  loadHelpers();
  loadAuxLibs();

  self.addEventListener('message', async function (ev) {
    const msg = ev.data || {};
    const id = msg.id;
    try {
      switch (msg.type) {
        case 'init':
          await loadOpenCV();
          send('result', id, { payload: { ready: true } });
          return;

        case 'preprocess':
          await loadOpenCV();
          progress(id, 'preprocess', 'Adaptive threshold');
          send('result', id, { payload: RasterChartCV.preprocess(msg.rgba, msg.w, msg.h, msg.opts) });
          return;

        case 'detectCorners':
          await loadOpenCV();
          progress(id, 'corners', 'Largest 4-vertex contour');
          send('result', id, { payload: RasterChartCV.detectCorners(msg.binary, msg.w, msg.h, msg.opts) });
          return;

        case 'warp':
          await loadOpenCV();
          progress(id, 'warp', 'Perspective transform');
          send('result', id, { payload: RasterChartCV.warpAndPreprocess(msg.rgba, msg.w, msg.h, msg.corners, msg.opts) });
          return;

        case 'detectGrid':
          await loadOpenCV();
          progress(id, 'grid', 'Projection profile peaks');
          send('result', id, { payload: RasterChartCV.detectGrid(msg.binary, msg.w, msg.h, msg.opts) });
          return;

        case 'extractCells':
          await loadOpenCV();
          progress(id, 'cells', 'Cropping ' + (msg.grid.rows * msg.grid.cols) + ' cells');
          send('result', id, { payload: RasterChartCV.extractCells(msg.binary, msg.w, msg.h, msg.grid, msg.opts) });
          return;

        case 'featurise':
          progress(id, 'cluster', 'HOG + dHash');
          send('result', id, { payload: RasterChartCV.featurise(msg.cells) });
          return;

        case 'cluster':
          progress(id, 'cluster', 'DBSCAN');
          {
            const dHashesBig = (msg.dHashes || []).map(x => typeof x === 'bigint' ? x : BigInt(x));
            const out = RasterChartDBSCAN.cluster(msg.features, msg.opts || {});
            const merged = RasterChartDBSCAN.mergeByHashHamming(out.assignments, out.medoids, dHashesBig, 4);
            send('result', id, { payload: { assignments: merged, eps: out.eps, medoids: out.medoids } });
          }
          return;

        case 'ocrLegend':
          await loadTesseract();
          progress(id, 'legend-ocr', 'Tesseract');
          {
            const result = await runOCR(msg.rgba, msg.w, msg.h,
              { anchorFirst: msg.anchorFirst !== false });
            send('result', id, { payload: result });
          }
          return;

        case 'extractCellColors':
          await loadOpenCV();
          progress(id, 'cells', 'Colour sampling');
          send('result', id, { payload: RasterChartCV.extractCellColors(msg.rgba, msg.w, msg.h, msg.grid) });
          return;

        case 'colourCluster':
          progress(id, 'cluster', 'Lab DBSCAN');
          {
            // Convert per-cell RGB → Lab, then cluster with z-score + Lab weight.
            // If symbol features (HOG + dHash) are supplied, concatenate them
            // with Lab so DBSCAN clusters on shape AND colour simultaneously.
            // This is the right thing to do for printed colour charts where
            // each colour has a unique symbol — two colours sharing a glyph
            // get separated by Lab, and one colour with anti-aliased glyph
            // variants gets joined by Lab.
            const { cellColors, cols, rows } = msg;
            const n = cols * rows;
            const labFeatures = [];
            for (let i = 0; i < n; i++) {
              const r = cellColors[i * 3], g = cellColors[i * 3 + 1], b = cellColors[i * 3 + 2];
              labFeatures.push(Float32Array.from(d50RgbToLab(r, g, b)));
            }
            const symbolFeatures = msg.features || null;
            let combined, labStartIdx;
            if (symbolFeatures && symbolFeatures.length === n) {
              combined = new Array(n);
              const hogLen = symbolFeatures[0] ? symbolFeatures[0].length : 0;
              labStartIdx = hogLen;
              for (let i = 0; i < n; i++) {
                const v = new Float32Array(hogLen + 3);
                if (symbolFeatures[i]) v.set(symbolFeatures[i], 0);
                v[hogLen]     = labFeatures[i][0];
                v[hogLen + 1] = labFeatures[i][1];
                v[hogLen + 2] = labFeatures[i][2];
                combined[i] = v;
              }
            } else {
              combined = labFeatures;
              labStartIdx = 0;
            }
            const opts = Object.assign({ minPts: 2, normalise: true, labDims: 3, labWeight: 0.6 },
              msg.opts || {});
            opts.labStartIdx = labStartIdx;
            const out = RasterChartDBSCAN.cluster(combined, opts);
            // Post-merge clusters with near-identical glyphs (Hamming<=4 on dHash).
            // Only runs when symbol dHashes are supplied. Mirrors the B&W
            // path's mergeByHashHamming step.
            let assignments = out.assignments;
            if (msg.dHashes && msg.dHashes.length === n && out.medoids) {
              const dHashesBig = msg.dHashes.map(x => typeof x === 'bigint' ? x : BigInt(x));
              assignments = RasterChartDBSCAN.mergeByHashHamming(
                out.assignments, out.medoids, dHashesBig, 4,
              );
            }
            send('result', id, { payload: {
              assignments: Array.from(assignments),
              medoids: out.medoids,
              eps: out.eps,
              labFeatures: labFeatures.map(f => Array.from(f)),
            }});
          }
          return;

        case 'paletteSeededCluster':
          progress(id, 'cluster', 'Palette seeding');
          {
            // Palette-seeded clustering — the inverse of generic DBSCAN.
            // Instead of growing density-clusters in feature space we snap
            // each cell to the nearest DMC code (CIEDE2000 in Lab), then
            // group cells that share the same code. This trades clustering
            // recall for label correctness: every cluster is guaranteed
            // to map to a real palette code (printed colour charts have a
            // small, fixed palette so this matches reality better than
            // DBSCAN, which tends to over-merge near-blacks and split
            // anti-aliased pastels).
            //
            // Optional second pass (shape sub-splitting): when the chart
            // legend reuses the same printed colour for multiple symbols
            // (e.g. a back-stitch line and a full-stitch sharing colour
            // 310), the HOG features will form distinct sub-clusters
            // within a palette group. We detect this by running a small
            // DBSCAN on HOG features per group and splitting if more than
            // one dense sub-cluster is found.
            const { cellColors, cols, rows, palette } = msg;
            const n = cols * rows;
            const minPts = (msg.opts && msg.opts.minPts) || 2;
            const shapeSplit = !(msg.opts && msg.opts.shapeSubSplit === false);
            const subSplitMin = (msg.opts && msg.opts.subSplitMin) || 8;
            const normaliseBg = !(msg.opts && msg.opts.normaliseBackground === false);

            // 1a. Per-cell Lab (sRGB → D50 Lab). The palette-snap step is
            //     deferred until after optional background normalisation.
            const labFeatures = new Array(n);
            for (let i = 0; i < n; i++) {
              const r = cellColors[i * 3], g = cellColors[i * 3 + 1], b = cellColors[i * 3 + 2];
              labFeatures[i] = d50RgbToLab(r, g, b);
            }

            // 1b. Background-tint normalisation. Charts printed on cream
            //     paper or photographed under non-D50 lighting tilt every
            //     cell's Lab by a consistent a*,b* offset. We estimate
            //     that offset from the brightest near-neutral cells (top
            //     10 % by L* with low chroma) and subtract it before the
            //     palette snap. Only applied when the drift is large
            //     enough to matter (|a̅| or |b̅| ≥ 1.0 in Lab units), so
            //     clean screenshots are unaffected.
            let bgOffset = [0, 0, 0];
            if (normaliseBg && n >= 50) {
              const order = new Array(n);
              for (let i = 0; i < n; i++) order[i] = i;
              order.sort((x, y) => labFeatures[y][0] - labFeatures[x][0]);
              const topN = Math.max(10, Math.floor(n * 0.10));
              let sa = 0, sb = 0, k = 0;
              for (let j = 0; j < topN; j++) {
                const lab = labFeatures[order[j]];
                if (Math.abs(lab[1]) + Math.abs(lab[2]) > 12) continue;
                sa += lab[1]; sb += lab[2]; k++;
              }
              if (k >= 5) {
                const aMean = sa / k, bMean = sb / k;
                if (Math.abs(aMean) >= 1.0 || Math.abs(bMean) >= 1.0) {
                  bgOffset = [0, aMean, bMean];
                  for (let i = 0; i < n; i++) {
                    labFeatures[i][1] -= aMean;
                    labFeatures[i][2] -= bMean;
                  }
                }
              }
            }

            // 1c. Nearest-palette match by ΔE2000 on the (possibly
            //     normalised) per-cell Lab values.
            const cellPaletteIdx = new Int32Array(n);
            const cellPaletteDist = new Float32Array(n);
            for (let i = 0; i < n; i++) {
              const lab = labFeatures[i];
              let bestIdx = -1, bestD = Infinity;
              for (let p = 0; p < palette.length; p++) {
                const pl = palette[p].lab;
                if (!pl) continue;
                const d = dE2000(lab, pl);
                if (d < bestD) { bestD = d; bestIdx = p; }
              }
              cellPaletteIdx[i] = bestIdx;
              cellPaletteDist[i] = bestD;
            }

            // 2. Group cells by palette index; drop groups under minPts.
            const buckets = new Map(); // paletteIdx → [cellIdx, …]
            for (let i = 0; i < n; i++) {
              const p = cellPaletteIdx[i];
              if (p < 0) continue;
              if (!buckets.has(p)) buckets.set(p, []);
              buckets.get(p).push(i);
            }
            const assignments = new Int32Array(n).fill(-1);
            const medoids = [];
            const clusterCodes = []; // parallel to medoids: palette idx per cluster
            let clusterIdx = 0;
            const symbolFeatures = msg.features || null;
            const hasShapeFeatures = symbolFeatures && symbolFeatures.length === n && shapeSplit;

            function medoidOf(indices) {
              let cx = 0, cy = 0, cz = 0;
              for (const i of indices) {
                cx += labFeatures[i][0]; cy += labFeatures[i][1]; cz += labFeatures[i][2];
              }
              cx /= indices.length; cy /= indices.length; cz /= indices.length;
              let best = indices[0], bestD = Infinity;
              for (const i of indices) {
                const dl = labFeatures[i][0] - cx;
                const da = labFeatures[i][1] - cy;
                const db = labFeatures[i][2] - cz;
                const d = dl * dl + da * da + db * db;
                if (d < bestD) { bestD = d; best = i; }
              }
              return best;
            }

            for (const [pIdx, indices] of buckets) {
              if (indices.length < minPts) continue;

              // 3. Shape sub-splitting (task A): within this palette group,
              //    look at HOG features. If they form > 1 dense sub-cluster,
              //    split. Only worth doing when the group is big enough that
              //    a sub-cluster could itself meet minPts.
              let subGroups;
              if (hasShapeFeatures && indices.length >= subSplitMin) {
                const subFeatures = indices.map(i => symbolFeatures[i]);
                try {
                  const subOut = RasterChartDBSCAN.cluster(subFeatures, {
                    minPts: Math.max(2, Math.floor(indices.length * 0.1)),
                    normalise: true,
                  });
                  const subBuckets = new Map();
                  for (let j = 0; j < subOut.assignments.length; j++) {
                    const c = subOut.assignments[j];
                    if (c < 0) continue;
                    if (!subBuckets.has(c)) subBuckets.set(c, []);
                    subBuckets.get(c).push(indices[j]);
                  }
                  if (subBuckets.size > 1) {
                    subGroups = Array.from(subBuckets.values());
                    // Re-attach sub-noise cells to the largest sub-group.
                    const noise = [];
                    for (let j = 0; j < subOut.assignments.length; j++) {
                      if (subOut.assignments[j] < 0) noise.push(indices[j]);
                    }
                    if (noise.length) {
                      subGroups.sort((a, b) => b.length - a.length);
                      subGroups[0].push.apply(subGroups[0], noise);
                    }
                  }
                } catch (_) { /* fall through to single group */ }
              }
              if (!subGroups) subGroups = [indices];

              for (const grp of subGroups) {
                if (grp.length < minPts) continue;
                for (const i of grp) assignments[i] = clusterIdx;
                medoids.push(medoidOf(grp));
                clusterCodes.push(pIdx);
                clusterIdx++;
              }
            }

            send('result', id, { payload: {
              assignments: Array.from(assignments),
              medoids,
              clusterCodes,
              eps: 0,
              labFeatures: labFeatures.map(f => Array.from(f)),
              bgOffset,
            }});
          }
          return;

        case 'terminate':
          self.close();
          return;
      }
    } catch (e) { errOut(id, e); }
  });

  async function runOCR(rgba, w, h, opts) {
    opts = opts || {};
    if (typeof Tesseract === 'undefined') throw new Error('Tesseract.js not loaded');
    const worker = await Tesseract.createWorker('eng', 1, {
      corePath:   'https://cdn.jsdelivr.net/npm/tesseract.js-core@5',
      workerPath: 'https://cdn.jsdelivr.net/npm/tesseract.js@7/dist/worker.min.js',
      langPath:   'https://tessdata.projectnaptha.com/4.0.0_best_int',
    }, {
      load_system_dawg: '0', load_freq_dawg: '0',
      load_number_dawg: '0', load_punc_dawg: '0',
    });
    await worker.setParameters({
      tessedit_pageseg_mode: Tesseract.PSM.SINGLE_BLOCK,
      tessedit_char_whitelist:
        'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789 -./',
      preserve_interword_spaces: '1',
    });
    // ImageData-like payload
    const img = { data: rgba, width: w, height: h };
    const { data } = await worker.recognize(img);
    await worker.terminate();

    const words = (data.words || []).map(wd => ({
      text: wd.text, confidence: wd.confidence,
      bbox: wd.bbox ? { x0: wd.bbox.x0, y0: wd.bbox.y0, x1: wd.bbox.x1, y1: wd.bbox.y1 } : null,
    }));
    const meanConfidence = words.length
      ? words.reduce((s, wd) => s + wd.confidence, 0) / words.length
      : 0;

    // ── Anchor-first filtering ──────────────────────────────────────────
    // The anchor is the leftmost element of each legend row: a glyph
    // symbol (Phase 1 B&W) or a colour swatch (Phase 2 colour charts).
    // We detect it by looking for leading words that contain no digits and
    // are too short to be a DMC code name (single chars, punctuation, or
    // symbol OCR artifacts). Reading direction is assumed LTR; RTL /
    // top-anchor support is a Phase 2 stretch goal surfaced by telemetry.
    let text;
    if (opts.anchorFirst) {
      text = buildAnchorFirstText(data.lines || []);
    } else {
      text = data.text || '';
    }

    return { text, words, meanConfidence };
  }

  /**
   * For each OCR line, skip leading "anchor" tokens (symbol glyphs / colour
   * swatch artefacts) and return the remaining code + name text.
   *
   * An anchor token is defined as:
   *   - no digit characters, AND
   *   - fewer than 2 alphabetic characters
   * This matches glyph noise (e.g. "▪", "⬛", "O" for a single-glyph symbol)
   * while preserving real codes like "310", "BLANC", "DMC 550".
   */
  function buildAnchorFirstText(lines) {
    const result = [];
    for (const line of lines) {
      if (!line.words || line.words.length === 0) continue;
      const sorted = line.words.slice().sort((a, b) => (a.bbox ? a.bbox.x0 : 0) - (b.bbox ? b.bbox.x0 : 0));
      let start = sorted.length; // default: skip whole line if nothing useful found
      for (let i = 0; i < sorted.length; i++) {
        const t = sorted[i].text.trim();
        if (/\d/.test(t) || /[A-Za-z]{2,}/.test(t)) { start = i; break; }
      }
      const textPart = sorted.slice(start).map(wd => wd.text).join(' ').trim();
      if (textPart) result.push(textPart);
    }
    return result.join('\n');
  }

  // ── D50 RGB → CIE Lab (inline, no DOM dependencies) ───────────────────
  // Matches the illuminant used by colour-utils.js on the main thread so
  // cluster centroids and DMC-lookup coordinates live in the same space.
  function d50RgbToLab(r, g, b) {
    function toLinear(v) {
      v /= 255;
      return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
    }
    const rl = toLinear(r), gl = toLinear(g), bl = toLinear(b);
    // Bradford-adapted sRGB→XYZ matrix for D50 (IEC 61966-2-1 / ICC v4)
    const x = rl * 0.4360747 + gl * 0.3850649 + bl * 0.1430804;
    const y = rl * 0.2225045 + gl * 0.7168786 + bl * 0.0606169;
    const z = rl * 0.0139322 + gl * 0.0971045 + bl * 0.7141733;
    // D50 white point: [0.96422, 1.00000, 0.82521]
    function f(t) { const δ = 6 / 29; return t > δ * δ * δ ? Math.cbrt(t) : t / (3 * δ * δ) + 4 / 29; }
    const fx = f(x / 0.96422), fy = f(y), fz = f(z / 0.82521);
    return [116 * fy - 16, 500 * (fx - fy), 200 * (fy - fz)];
  }

  // ── CIEDE2000 (lab, lab) → ΔE ─────────────────────────────────────────
  // Worker-local port of the colour-utils.js implementation so we don't have
  // to load the whole main-thread file inside the worker. Returns the
  // perceptual distance between two Lab triples. Used by palette-seeded
  // clustering where each cell is snapped to its nearest DMC code.
  function dE2000(lab1, lab2) {
    const L1 = lab1[0], a1 = lab1[1], b1 = lab1[2];
    const L2 = lab2[0], a2 = lab2[1], b2 = lab2[2];
    const C1 = Math.hypot(a1, b1), C2 = Math.hypot(a2, b2);
    const Cbar = (C1 + C2) / 2;
    const G = 0.5 * (1 - Math.sqrt(Math.pow(Cbar, 7) / (Math.pow(Cbar, 7) + Math.pow(25, 7))));
    const a1p = (1 + G) * a1, a2p = (1 + G) * a2;
    const C1p = Math.hypot(a1p, b1), C2p = Math.hypot(a2p, b2);
    const h1p = Math.atan2(b1, a1p) * 180 / Math.PI + (Math.atan2(b1, a1p) < 0 ? 360 : 0);
    const h2p = Math.atan2(b2, a2p) * 180 / Math.PI + (Math.atan2(b2, a2p) < 0 ? 360 : 0);
    const dLp = L2 - L1, dCp = C2p - C1p;
    let dhp = h2p - h1p;
    if (C1p * C2p === 0) dhp = 0;
    else if (dhp > 180) dhp -= 360;
    else if (dhp < -180) dhp += 360;
    const dHp = 2 * Math.sqrt(C1p * C2p) * Math.sin(dhp * Math.PI / 360);
    const Lbarp = (L1 + L2) / 2, Cbarp = (C1p + C2p) / 2;
    let hbarp = h1p + h2p;
    if (C1p * C2p !== 0) {
      if (Math.abs(h1p - h2p) > 180) hbarp = (h1p + h2p + 360) / 2;
      else hbarp = (h1p + h2p) / 2;
    } else hbarp = h1p + h2p;
    const T = 1
      - 0.17 * Math.cos((hbarp -  30) * Math.PI / 180)
      + 0.24 * Math.cos((2 * hbarp)    * Math.PI / 180)
      + 0.32 * Math.cos((3 * hbarp + 6) * Math.PI / 180)
      - 0.20 * Math.cos((4 * hbarp - 63) * Math.PI / 180);
    const dTheta = 30 * Math.exp(-Math.pow((hbarp - 275) / 25, 2));
    const Rc = 2 * Math.sqrt(Math.pow(Cbarp, 7) / (Math.pow(Cbarp, 7) + Math.pow(25, 7)));
    const Sl = 1 + (0.015 * Math.pow(Lbarp - 50, 2)) / Math.sqrt(20 + Math.pow(Lbarp - 50, 2));
    const Sc = 1 + 0.045 * Cbarp;
    const Sh = 1 + 0.015 * Cbarp * T;
    const Rt = -Math.sin(2 * dTheta * Math.PI / 180) * Rc;
    return Math.sqrt(
      Math.pow(dLp / Sl, 2)
      + Math.pow(dCp / Sc, 2)
      + Math.pow(dHp / Sh, 2)
      + Rt * (dCp / Sc) * (dHp / Sh),
    );
  }

})();

