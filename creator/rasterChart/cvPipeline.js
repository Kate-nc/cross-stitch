/* creator/rasterChart/cvPipeline.js
 * ════════════════════════════════════════════════════════════════════════
 *   OpenCV.js-backed stages of the raster chart importer pipeline.
 *
 *   This file expects to run inside a Web Worker that has already loaded
 *   OpenCV.js (global `cv`) and the matScope / projectionProfile / hog /
 *   dbscan / ocrRepair helpers via importScripts.
 *
 *   Each exported function follows the same contract:
 *     - It accepts plain-data arguments (no Mat references cross stage
 *       boundaries; we re-decode from RGBA buffers when needed).
 *     - It allocates its own MatScope and disposes it before returning.
 *     - It returns plain-data results that can be postMessage'd back.
 *
 *   Stages implemented here:
 *     preprocess(rgba, w, h, opts) → { binary: Uint8Array, w, h, otsuFastPath }
 *     detectCorners(binary, w, h, opts) → { corners: [{x,y}×4] | null }
 *     warpAndPreprocess(rgba, w, h, corners) → { binary, w, h }
 *     detectGrid(binary, w, h, opts) → { cellPitch, originRow, originCol, rows, cols, ... }
 *     extractCells(binary, w, h, grid) → { cells: Uint8Array[], emptyMask }
 *     featurise(cells) → { features: Float32Array[], dHashes: BigInt[], scalars: object[] }
 *
 *   Tuning constants (blockSize, C, inkDensityThreshold, etc.) are read
 *   from `opts` so the debug menu can override them without editing code.
 *
 *   PHASE 1 LIMITATIONS (intentional — see docs/raster-chart-importer-phase2.md):
 *     - Auto-corner detection uses the standard largest-quad heuristic; if
 *       it returns null the caller is responsible for invoking the manual
 *       4-corner UI before re-entering at warpAndPreprocess().
 *     - Major/minor grid disambiguation is informational only; we don't
 *       use it to constrain extraction.
 * ════════════════════════════════════════════════════════════════════════
 */

/* global cv, MatScope, RasterChartProjection, RasterChartHOG */

(function () {
  'use strict';

  const DEFAULT_OPTS = Object.freeze({
    maxLongSide: 2000,
    adaptiveBlockSize: 41,
    adaptiveC: 10,
    claheClip: 2.0,
    claheTile: 8,
    inkDensityThreshold: 0.05,
    cellInwardPadFrac: 0.12,
    cellCanonicalSize: 32,
    minCornerAreaFrac: 0.2,
    approxEpsilonFrac: 0.02,
  });

  // ── helpers ────────────────────────────────────────────────────────────

  function clampToMaxSide(rgba, w, h, maxSide) {
    const longSide = Math.max(w, h);
    if (longSide <= maxSide) return { rgba, w, h };
    const scale = maxSide / longSide;
    const nw = Math.round(w * scale), nh = Math.round(h * scale);

    return MatScope.withScope(s => {
      const src = s.track(cv.matFromImageData({ data: rgba, width: w, height: h }));
      const dst = s.track(new cv.Mat());
      cv.resize(src, dst, new cv.Size(nw, nh), 0, 0, cv.INTER_AREA);
      // Copy out before scope disposes the Mat.
      const out = new Uint8ClampedArray(dst.data);
      return { rgba: out, w: nw, h: nh };
    });
  }

  // ── 1. preprocess ──────────────────────────────────────────────────────

  function preprocess(rgba, w, h, opts) {
    opts = Object.assign({}, DEFAULT_OPTS, opts || {});
    const downscaled = clampToMaxSide(rgba, w, h, opts.maxLongSide);

    return MatScope.withScope(s => {
      const src = s.track(cv.matFromImageData({
        data: downscaled.rgba, width: downscaled.w, height: downscaled.h,
      }));
      const gray = s.track(new cv.Mat());
      cv.cvtColor(src, gray, cv.COLOR_RGBA2GRAY);

      // Otsu fast-path probe: a clean screenshot has a strongly bimodal
      // histogram and Otsu will give an excellent threshold by itself.
      // We detect this by checking whether Otsu's split point is "decisive"
      // (the in-between bins are nearly empty).
      const otsu = s.track(new cv.Mat());
      const otsuThresh = cv.threshold(gray, otsu, 0, 255, cv.THRESH_BINARY_INV | cv.THRESH_OTSU);
      const otsuFastPath = isOtsuDecisive(gray, otsuThresh);

      let bw;
      if (otsuFastPath) {
        bw = otsu; // already inverted binary
      } else {
        const blurred = s.track(new cv.Mat());
        cv.GaussianBlur(gray, blurred, new cv.Size(3, 3), 0);
        const clahe = new cv.CLAHE(opts.claheClip, new cv.Size(opts.claheTile, opts.claheTile));
        clahe.apply(blurred, blurred);
        clahe.delete();
        const ad = s.track(new cv.Mat());
        cv.adaptiveThreshold(blurred, ad, 255, cv.ADAPTIVE_THRESH_GAUSSIAN_C,
                             cv.THRESH_BINARY_INV, opts.adaptiveBlockSize, opts.adaptiveC);
        bw = ad;
      }

      const out = new Uint8Array(bw.data); // copy out as plain bytes
      return { binary: out, w: downscaled.w, h: downscaled.h, otsuFastPath };
    });
  }

  function isOtsuDecisive(gray, thresh) {
    // Sample histogram and check how much mass sits within ±15 of thresh.
    const hist = new Uint32Array(256);
    const data = gray.data;
    const stride = Math.max(1, Math.floor(data.length / 10000));
    for (let i = 0; i < data.length; i += stride) hist[data[i]]++;
    let total = 0, midBand = 0;
    for (let i = 0; i < 256; i++) {
      total += hist[i];
      if (Math.abs(i - thresh) <= 15) midBand += hist[i];
    }
    return total > 0 && (midBand / total) < 0.08;
  }

  // ── 2. corner detection (perspective correction) ───────────────────────

  function detectCorners(binary, w, h, opts) {
    opts = Object.assign({}, DEFAULT_OPTS, opts || {});
    const imgArea = w * h;
    return MatScope.withScope(s => {
      const bw = s.track(cv.matFromArray(h, w, cv.CV_8UC1, binary));
      const contours = s.track(new cv.MatVector());
      const hierarchy = s.track(new cv.Mat());
      cv.findContours(bw, contours, hierarchy, cv.RETR_EXTERNAL, cv.CHAIN_APPROX_SIMPLE);

      let bestQuad = null, bestArea = 0;
      for (let i = 0; i < contours.size(); i++) {
        const c = contours.get(i);
        const peri = cv.arcLength(c, true);
        const approx = new cv.Mat();
        cv.approxPolyDP(c, approx, opts.approxEpsilonFrac * peri, true);
        if (approx.rows === 4) {
          const area = Math.abs(cv.contourArea(approx));
          if (area >= opts.minCornerAreaFrac * imgArea && area > bestArea) {
            bestArea = area;
            if (bestQuad) bestQuad.delete();
            bestQuad = approx;
            continue;
          }
        }
        approx.delete();
      }

      if (!bestQuad) return { corners: null };
      const pts = [];
      for (let i = 0; i < 4; i++) {
        pts.push({ x: bestQuad.intAt(i, 0), y: bestQuad.intAt(i, 1) });
      }
      bestQuad.delete();
      return { corners: orderCorners(pts) };
    });
  }

  function orderCorners(pts) {
    // TL = min(x+y), BR = max(x+y), TR = min(x-y reversed)... standard recipe.
    let tl = pts[0], br = pts[0], tr = pts[0], bl = pts[0];
    let sMin = Infinity, sMax = -Infinity, dMin = Infinity, dMax = -Infinity;
    for (const p of pts) {
      const s = p.x + p.y, d = p.y - p.x;
      if (s < sMin) { sMin = s; tl = p; }
      if (s > sMax) { sMax = s; br = p; }
      if (d < dMin) { dMin = d; tr = p; }
      if (d > dMax) { dMax = d; bl = p; }
    }
    return [tl, tr, br, bl];
  }

  // ── 3. warp + preprocess (re-entry after manual or auto corners) ───────

  function warpAndPreprocess(rgba, w, h, corners, opts) {
    opts = Object.assign({}, DEFAULT_OPTS, opts || {});
    return MatScope.withScope(s => {
      const src = s.track(cv.matFromImageData({ data: rgba, width: w, height: h }));
      const [tl, tr, br, bl] = corners;
      const widthTop = Math.hypot(tr.x - tl.x, tr.y - tl.y);
      const widthBot = Math.hypot(br.x - bl.x, br.y - bl.y);
      const heightL  = Math.hypot(bl.x - tl.x, bl.y - tl.y);
      const heightR  = Math.hypot(br.x - tr.x, br.y - tr.y);
      const W = Math.max(widthTop, widthBot) | 0;
      const H = Math.max(heightL, heightR) | 0;

      const srcPts = cv.matFromArray(4, 1, cv.CV_32FC2,
        [tl.x, tl.y, tr.x, tr.y, br.x, br.y, bl.x, bl.y]);
      const dstPts = cv.matFromArray(4, 1, cv.CV_32FC2,
        [0, 0, W - 1, 0, W - 1, H - 1, 0, H - 1]);
      const M = s.track(cv.getPerspectiveTransform(srcPts, dstPts));
      srcPts.delete(); dstPts.delete();
      const warped = s.track(new cv.Mat());
      cv.warpPerspective(src, warped, M, new cv.Size(W, H));
      const warpedRgba = new Uint8ClampedArray(warped.data);
      return preprocess(warpedRgba, W, H, opts);
    });
  }

  // ── 4. grid detection ──────────────────────────────────────────────────

  function detectGrid(binary, w, h, opts) {
    opts = Object.assign({}, DEFAULT_OPTS, opts || {});
    // Row/col sums of binary inverse (ink = 255)
    const rowSum = new Float32Array(h);
    const colSum = new Float32Array(w);
    for (let y = 0; y < h; y++) {
      let s = 0;
      const base = y * w;
      for (let x = 0; x < w; x++) {
        const v = binary[base + x] ? 1 : 0;
        s += v;
        colSum[x] += v;
      }
      rowSum[y] = s;
    }
    const result = RasterChartProjection.gridFromProfiles(rowSum, colSum, {
      expectedCellSizeHint: opts.expectedCellSizeHint || 0,
    });
    // PHASE 1 NOTE: Hough + morphological fallbacks are stubbed; we surface
    // the low-confidence flag so the UI can prompt the user to nudge.
    return result;
  }

  // ── 5. cell extraction ─────────────────────────────────────────────────

  function extractCells(binary, w, h, grid, opts) {
    opts = Object.assign({}, DEFAULT_OPTS, opts || {});
    const { cellPitch, originRow, originCol, rows, cols } = grid;
    if (!cellPitch || rows <= 0 || cols <= 0) {
      return { cells: [], emptyMask: [], rows: 0, cols: 0 };
    }
    const P = opts.cellCanonicalSize;
    const padFrac = opts.cellInwardPadFrac;
    const cells = [];
    const emptyMask = new Uint8Array(rows * cols);

    return MatScope.withScope(s => {
      const bw = s.track(cv.matFromArray(h, w, cv.CV_8UC1, binary));
      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
          const x0 = Math.round(originCol + c * cellPitch + padFrac * cellPitch);
          const y0 = Math.round(originRow + r * cellPitch + padFrac * cellPitch);
          const sz = Math.max(1, Math.round(cellPitch * (1 - 2 * padFrac)));
          if (x0 < 0 || y0 < 0 || x0 + sz > w || y0 + sz > h) {
            cells.push(new Uint8Array(P * P));
            emptyMask[r * cols + c] = 1;
            continue;
          }
          const roi = bw.roi(new cv.Rect(x0, y0, sz, sz));
          // Ink density check.
          let ink = 0;
          for (let i = 0; i < roi.data.length; i++) if (roi.data[i]) ink++;
          const density = ink / roi.data.length;
          if (density < opts.inkDensityThreshold) {
            emptyMask[r * cols + c] = 1;
            cells.push(new Uint8Array(P * P));
            roi.delete();
            continue;
          }
          const resized = new cv.Mat();
          cv.resize(roi, resized, new cv.Size(P, P), 0, 0, cv.INTER_AREA);
          cells.push(new Uint8Array(resized.data));
          roi.delete();
          resized.delete();
        }
      }
      return { cells, emptyMask, rows, cols };
    });
  }

  // ── 6. featurisation ───────────────────────────────────────────────────

  function featurise(cellPixels) {
    const features = [];
    const dHashes = [];
    const scalars = [];
    for (const px of cellPixels) {
      const f = RasterChartHOG.hog(px);
      const h = RasterChartHOG.dHash(px);
      let ink = 0;
      for (let i = 0; i < px.length; i++) if (px[i]) ink++;
      const density = ink / px.length;
      // Combined feature vector: HOG + scalar features.
      // Scalar features are scaled to roughly match HOG magnitudes.
      const combined = new Float32Array(f.length + 4);
      combined.set(f);
      combined[f.length    ] = density;
      combined[f.length + 1] = 0; // stroke width — Phase 2
      combined[f.length + 2] = 0; // Euler number — Phase 2
      combined[f.length + 3] = 1; // bbox aspect ratio — Phase 2
      features.push(combined);
      dHashes.push(h);
      scalars.push({ density });
    }
    return { features, dHashes, scalars };
  }

  // ── 6. colour cell sampling (Phase 2) ─────────────────────────────────
  // Works on the RGBA colour image (NOT the binary). Returns the average
  // RGB colour for every grid cell as a flat Uint8Array of length
  // rows × cols × 3 (R, G, B; no alpha). Use alongside extractCells for
  // colour-chart imports that need both glyph shape AND colour information.

  function extractCellColors(rgba, w, h, grid) {
    const { cellPitch, originRow, originCol, rows, cols } = grid;
    const out = new Uint8Array(rows * cols * 3);
    const pad = Math.floor(cellPitch * DEFAULT_OPTS.cellInwardPadFrac);

    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const x0 = Math.round(originCol + c * cellPitch) + pad;
        const y0 = Math.round(originRow + r * cellPitch) + pad;
        const x1 = Math.round(originCol + (c + 1) * cellPitch) - pad;
        const y1 = Math.round(originRow + (r + 1) * cellPitch) - pad;

        let sumR = 0, sumG = 0, sumB = 0, count = 0;
        for (let py = Math.max(0, y0); py < Math.min(h, y1); py++) {
          for (let px = Math.max(0, x0); px < Math.min(w, x1); px++) {
            const base = (py * w + px) * 4;
            sumR += rgba[base];
            sumG += rgba[base + 1];
            sumB += rgba[base + 2];
            count++;
          }
        }

        const base = (r * cols + c) * 3;
        if (count > 0) {
          out[base]     = Math.round(sumR / count);
          out[base + 1] = Math.round(sumG / count);
          out[base + 2] = Math.round(sumB / count);
        }
      }
    }
    return { cellColors: out, rows, cols };
  }

  const api = {
    DEFAULT_OPTS,
    preprocess,
    detectCorners,
    warpAndPreprocess,
    detectGrid,
    extractCells,
    featurise,
    extractCellColors,
  };
  if (typeof self !== 'undefined') self.RasterChartCV = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})();
