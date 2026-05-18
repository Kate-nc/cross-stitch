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

      // ── Item 5: Morphological background normalisation ─────────────────
      // Estimate the illumination envelope via large-kernel morphological
      // close (fills all symbol-sized voids, leaving only the slowly-varying
      // paper/background gradient). If the gradient is significant (std > 12
      // grey levels), divide grey by it to flatten the illumination before
      // any threshold step. Improves Otsu on photos with vignetting,
      // single-sided lighting, or partial shadow. Gate is conservative so
      // clean digital screenshots (near-zero bg gradient) are untouched.
      {
        const kSize  = Math.max(41, ((opts.adaptiveBlockSize * 1.5) | 1));
        const kernel = cv.getStructuringElement(
          cv.MORPH_ELLIPSE, new cv.Size(kSize, kSize));
        const bg = s.track(new cv.Mat());
        cv.morphologyEx(gray, bg, cv.MORPH_CLOSE, kernel);
        kernel.delete();
        const bgMeanVec = s.track(new cv.Mat());
        const bgStdVec  = s.track(new cv.Mat());
        cv.meanStdDev(bg, bgMeanVec, bgStdVec);
        const bgStdVal = bgStdVec.doubleAt(0, 0);
        if (bgStdVal > 12) {
          // normalised_px = gray_px / bg_px × 192
          // 192 (¾ of 255) keeps the normalised background light without
          // saturating the brighter regions.
          const gray32   = s.track(new cv.Mat());
          const bg32     = s.track(new cv.Mat());
          gray.convertTo(gray32, cv.CV_32F);
          bg.convertTo(bg32, cv.CV_32F);
          const norm32   = s.track(new cv.Mat());
          cv.divide(gray32, bg32, norm32, 192.0, cv.CV_32F);
          const normGray = s.track(new cv.Mat());
          norm32.convertTo(normGray, cv.CV_8U);
          normGray.copyTo(gray); // update gray in-place for the steps below
        }
      }

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

        // ── Item 4: Per-strip adaptive binarisation ──────────────────────
        // Run CLAHE + adaptive threshold on 4 overlapping horizontal strips
        // and OR the results into bw. Rescues ink pixels that the single
        // global pass misses due to large-scale luminance variation (e.g.
        // vignetting, a shadow covering one quadrant of the photo).
        // Union strategy: ink at (x,y) if ANY strip detected it.
        // Only runs on the slow path — clean screenshots already Otsu-pathed.
        const dw = downscaled.w, dh = downscaled.h;
        const minStripH = opts.adaptiveBlockSize + 2;
        const N_STRIPS  = 4;
        for (let si = 0; si < N_STRIPS; si++) {
          const stride = dh / N_STRIPS;
          const y0s    = Math.max(0, Math.round(si * stride - stride * 0.5));
          const y1s    = Math.min(dh, Math.round((si + 1) * stride + stride * 0.5));
          if (y1s - y0s < minStripH) continue;
          const stripH    = y1s - y0s;
          const stripGray = s.track(gray.roi(new cv.Rect(0, y0s, dw, stripH)));
          const stripBlur = s.track(new cv.Mat());
          cv.GaussianBlur(stripGray, stripBlur, new cv.Size(3, 3), 0);
          const sClahe = new cv.CLAHE(opts.claheClip,
            new cv.Size(opts.claheTile, opts.claheTile));
          sClahe.apply(stripBlur, stripBlur);
          sClahe.delete();
          const stripAd = s.track(new cv.Mat());
          cv.adaptiveThreshold(stripBlur, stripAd, 255, cv.ADAPTIVE_THRESH_GAUSSIAN_C,
                               cv.THRESH_BINARY_INV, opts.adaptiveBlockSize, opts.adaptiveC);
          const bwRoi = bw.roi(new cv.Rect(0, y0s, dw, stripH));
          cv.bitwise_or(bwRoi, stripAd, bwRoi);
          bwRoi.delete();
        }
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

      if (!bestQuad) {
        // Fallback: largest-quad heuristic failed (text-heavy chart, broken
        // border, or no contour reached the area threshold). Try a Hough-
        // line + RANSAC-style approach — find the two strongest near-
        // horizontal and near-vertical lines that bound the content, and
        // intersect them. Much more robust on photographed pages where the
        // border isn't a clean closed contour.
        const hough = detectCornersViaHough(bw, w, h, opts);
        if (hough) return { corners: orderCorners(hough), method: 'hough' };
        return { corners: null };
      }
      const pts = [];
      for (let i = 0; i < 4; i++) {
        pts.push({ x: bestQuad.intAt(i, 0), y: bestQuad.intAt(i, 1) });
      }
      bestQuad.delete();
      return { corners: orderCorners(pts), method: 'contour' };
    });
  }

  // Hough-based fallback. Returns 4 unordered points or null.
  function detectCornersViaHough(bw, w, h, opts) {
    return MatScope.withScope(s => {
      const lines = s.track(new cv.Mat());
      // Tuning: threshold proportional to short edge; minLineLength ~10%
      // of short edge; maxGap allows for broken/dashed borders.
      const shortEdge = Math.min(w, h);
      const threshold = Math.max(40, (shortEdge * 0.08) | 0);
      const minLineLength = Math.max(40, (shortEdge * 0.15) | 0);
      const maxLineGap = Math.max(8, (shortEdge * 0.02) | 0);
      try {
        cv.HoughLinesP(bw, lines, 1, Math.PI / 180, threshold, minLineLength, maxLineGap);
      } catch (_) { return null; }
      if (!lines.rows) return null;

      // Bucket into near-horizontal (within ±20°) and near-vertical.
      const horiz = [], vert = [];
      for (let i = 0; i < lines.rows; i++) {
        const x1 = lines.data32S[i * 4 + 0];
        const y1 = lines.data32S[i * 4 + 1];
        const x2 = lines.data32S[i * 4 + 2];
        const y2 = lines.data32S[i * 4 + 3];
        const dx = x2 - x1, dy = y2 - y1;
        const ang = Math.atan2(dy, dx) * 180 / Math.PI; // (-180, 180]
        const absAng = Math.abs(((ang + 180) % 180) - 90); // dist from vertical
        if (absAng > 70) horiz.push({ x1, y1, x2, y2, len: Math.hypot(dx, dy) });
        else if (absAng < 20) vert.push({ x1, y1, x2, y2, len: Math.hypot(dx, dy) });
      }
      if (horiz.length < 2 || vert.length < 2) return null;

      // Pick the two horizontals furthest from image centre vertically
      // (one above, one below) and the two verticals furthest left/right.
      // Weighting by line length keeps short noisy lines from winning.
      const cy = h / 2, cx = w / 2;
      let top = null, bot = null, left = null, right = null;
      for (const l of horiz) {
        const my = (l.y1 + l.y2) / 2;
        if (my < cy && (!top || (cy - my) * l.len > (cy - (top.y1 + top.y2) / 2) * top.len)) top = l;
        if (my > cy && (!bot || (my - cy) * l.len > ((bot.y1 + bot.y2) / 2 - cy) * bot.len)) bot = l;
      }
      for (const l of vert) {
        const mx = (l.x1 + l.x2) / 2;
        if (mx < cx && (!left || (cx - mx) * l.len > (cx - (left.x1 + left.x2) / 2) * left.len)) left = l;
        if (mx > cx && (!right || (mx - cx) * l.len > ((right.x1 + right.x2) / 2 - cx) * right.len)) right = l;
      }
      if (!top || !bot || !left || !right) return null;

      const tl = lineIntersect(top, left);
      const tr = lineIntersect(top, right);
      const br = lineIntersect(bot, right);
      const bl = lineIntersect(bot, left);
      const all = [tl, tr, br, bl];
      if (all.some(p => !p)) return null;
      // Sanity: keep all points inside a generous bounding box.
      const margin = Math.max(w, h) * 0.05;
      for (const p of all) {
        if (p.x < -margin || p.y < -margin || p.x > w + margin || p.y > h + margin) return null;
      }
      // Min area threshold
      const area = Math.abs(polygonArea(all));
      if (area < opts.minCornerAreaFrac * w * h) return null;
      return all;
    });
  }

  function lineIntersect(a, b) {
    const x1 = a.x1, y1 = a.y1, x2 = a.x2, y2 = a.y2;
    const x3 = b.x1, y3 = b.y1, x4 = b.x2, y4 = b.y2;
    const den = (x1 - x2) * (y3 - y4) - (y1 - y2) * (x3 - x4);
    if (Math.abs(den) < 1e-6) return null;
    const t = ((x1 - x3) * (y3 - y4) - (y1 - y3) * (x3 - x4)) / den;
    return { x: x1 + t * (x2 - x1), y: y1 + t * (y2 - y1) };
  }
  function polygonArea(pts) {
    let a = 0;
    for (let i = 0; i < pts.length; i++) {
      const p = pts[i], q = pts[(i + 1) % pts.length];
      a += p.x * q.y - q.x * p.y;
    }
    return a / 2;
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
      const pre = preprocess(warpedRgba, W, H, opts);
      // Skew/rotation correction. Even after a perspective warp the
      // chart can still sit at a small rotation (printed grids aren't
      // always orthogonal to the page, and user-placed corners imply a
      // slight tilt). Estimate the dominant near-horizontal line angle
      // via HoughLinesP and rotate the binary so the grid lines are
      // axis-aligned. Doing it *here* (not in detectGrid) ensures the
      // rotation also applies to extractCells, keeping cell coordinates
      // consistent across the pipeline.
      try {
        const skewAngleDeg = estimateSkewAngle(pre.binary, pre.w, pre.h);
        if (Math.abs(skewAngleDeg) > 0.3 && Math.abs(skewAngleDeg) < 15) {
          pre.binary = rotateBinary(pre.binary, pre.w, pre.h, -skewAngleDeg);
          pre.skewAngleDeg = skewAngleDeg;
        } else {
          pre.skewAngleDeg = 0;
        }
      } catch (_) { pre.skewAngleDeg = 0; }
      return pre;
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

    // Phase 2 §4: barrel-distortion detection. Compare cell-pitch ratios
    // across left/middle/right thirds (and top/middle/bottom thirds). If
    // any pair's ratio exceeds 1.15 we flag the grid as distorted so the
    // strategy can attach a warning and the UI can prompt the user.
    result.distortion = detectBarrelDistortion(result);
    return result;
  }

  // Returns the dominant near-horizontal line angle in degrees, or 0 if
  // there aren't enough well-clustered lines to be confident. Uses
  // HoughLinesP on the binary and only returns a non-zero angle when:
  //   • ≥ 30 near-horizontal lines pass the length threshold
  //   • their inter-quartile spread is < 1° (lines well-clustered)
  //   • the median magnitude is > 0.7° (a real skew, not measurement noise)
  // Otherwise we return 0 — better no rotation than a wrong one.
  function estimateSkewAngle(binary, w, h) {
    return MatScope.withScope(s => {
      const bw = s.track(cv.matFromArray(h, w, cv.CV_8UC1, binary));
      const lines = s.track(new cv.Mat());
      const shortEdge = Math.min(w, h);
      const threshold = Math.max(60, (shortEdge * 0.1) | 0);
      const minLineLength = Math.max(60, (shortEdge * 0.25) | 0);
      const maxLineGap = Math.max(4, (shortEdge * 0.01) | 0);
      try {
        cv.HoughLinesP(bw, lines, 1, Math.PI / 180, threshold, minLineLength, maxLineGap);
      } catch (_) { return 0; }
      if (!lines.rows) return 0;
      const angles = [];
      for (let i = 0; i < lines.rows; i++) {
        const x1 = lines.data32S[i * 4 + 0];
        const y1 = lines.data32S[i * 4 + 1];
        const x2 = lines.data32S[i * 4 + 2];
        const y2 = lines.data32S[i * 4 + 3];
        const ang = Math.atan2(y2 - y1, x2 - x1) * 180 / Math.PI;
        let a = ang;
        while (a > 90) a -= 180;
        while (a <= -90) a += 180;
        if (Math.abs(a) <= 10) angles.push(a);
      }
      if (angles.length < 30) return 0;
      angles.sort((x, y) => x - y);
      const m = angles.length >> 1;
      const median = angles.length % 2 ? angles[m] : 0.5 * (angles[m - 1] + angles[m]);
      const q1 = angles[Math.floor(angles.length * 0.25)];
      const q3 = angles[Math.floor(angles.length * 0.75)];
      const iqr = q3 - q1;
      if (iqr > 1.0) return 0; // too noisy to trust
      if (Math.abs(median) < 0.7) return 0; // below measurement noise
      return median;
    });
  }

  function rotateBinary(binary, w, h, angleDeg) {
    return MatScope.withScope(s => {
      const bw = s.track(cv.matFromArray(h, w, cv.CV_8UC1, binary));
      const centre = new cv.Point(w / 2, h / 2);
      const M = s.track(cv.getRotationMatrix2D(centre, angleDeg, 1));
      const dst = s.track(new cv.Mat());
      cv.warpAffine(bw, dst, M, new cv.Size(w, h), cv.INTER_NEAREST, cv.BORDER_CONSTANT, new cv.Scalar(0));
      return new Uint8Array(dst.data);
    });
  }

  // ── 4b. barrel-distortion detection (Phase 2 §4) ───────────────────────
  // Returns { ratio, distorted, horizontal:[L,M,R], vertical:[T,M,B] } where
  // each *.[3] is the median peak gap (pitch) in that third. `ratio` is the
  // maximum pairwise ratio across both axes; `distorted` is true if it
  // exceeds 1.15. Safe to call with a low-confidence grid — returns a
  // zero-ratio shape if there aren't enough peaks per third.

  function detectBarrelDistortion(grid) {
    const horizontal = pitchesByThirds(grid.colPeaks);
    const vertical   = pitchesByThirds(grid.rowPeaks);
    const allPitches = [...horizontal, ...vertical].filter(v => v > 0);
    let ratio = 1;
    if (allPitches.length >= 2) {
      ratio = Math.max(...allPitches) / Math.max(1e-6, Math.min(...allPitches));
    }
    return {
      ratio,
      distorted: ratio > 1.15,
      horizontal,
      vertical,
    };
  }

  function pitchesByThirds(peaks) {
    if (!peaks || peaks.length < 6) return [0, 0, 0];
    const gaps = [];
    for (let i = 1; i < peaks.length; i++) {
      gaps.push({ pos: (peaks[i] + peaks[i - 1]) / 2, gap: peaks[i] - peaks[i - 1] });
    }
    const min = peaks[0], max = peaks[peaks.length - 1];
    const t1 = min + (max - min) / 3, t2 = min + 2 * (max - min) / 3;
    const buckets = [[], [], []];
    for (const g of gaps) {
      if      (g.pos <  t1) buckets[0].push(g.gap);
      else if (g.pos <  t2) buckets[1].push(g.gap);
      else                  buckets[2].push(g.gap);
    }
    return buckets.map(b => b.length ? median(b) : 0);
  }

  function median(arr) {
    const a = arr.slice().sort((x, y) => x - y);
    const m = a.length >> 1;
    return a.length % 2 ? a[m] : 0.5 * (a[m - 1] + a[m]);
  }

  // ── 4b. mesh rectification ─────────────────────────────────────────────
  // Warp the binary (and optionally RGBA) so that every detected grid
  // intersection maps to a perfectly regular lattice. Each output pixel
  // (ox, oy) is mapped back to source coordinates via bilinear interpolation
  // between the four surrounding detected peak positions. This handles barrel
  // distortion, pincushion, and mild book-binding curvature in a single pass.
  //
  // Only runs when rowPeaks AND colPeaks are available (detectGrid must have
  // produced them) AND there is measurable non-uniformity. Returns the
  // original binary/rgba unchanged if the prerequisite data is absent or the
  // grid is already sufficiently regular.
  //
  // Returns { binary, rgba (nullable), w, h, grid } where w/h and grid are
  // updated to reflect the new (regular) coordinate space so downstream
  // stages (extractCells, extractCellColors) do not need peak tracking.

  function meshRectify(binary, rgbaIn, w, h, grid, opts) {
    opts = Object.assign({}, DEFAULT_OPTS, opts || {});
    const { rowPeaks, colPeaks, rows, cols, cellPitch } = grid;

    // Bail out if we don't have the peak data needed for rectification.
    if (!rowPeaks || !colPeaks ||
        rowPeaks.length < rows + 1 || colPeaks.length < cols + 1 ||
        rows < 2 || cols < 2) {
      return { binary, rgba: rgbaIn, w, h, grid };
    }

    // Measure peak non-uniformity to decide whether rectification is worth
    // the extra pass. We compute the max deviation of any inter-peak gap from
    // the median (as a fraction of the median). Distortions > 7 % are
    // corrected; below that the improvement is invisible and the remap costs
    // CPU for no benefit (e.g. clean digital screenshots, or photos whose
    // perspective has already been corrected by the warp stage — these
    // routinely show 3–6 % residual variation from JPEG compression and
    // sub-pixel peak detection, not genuine geometric distortion).
    function gapUniformity(peaks) {
      const gaps = [];
      for (let i = 1; i < peaks.length; i++) gaps.push(peaks[i] - peaks[i - 1]);
      const med = median(gaps);
      if (med <= 0) return 0;
      let maxDev = 0;
      for (const g of gaps) maxDev = Math.max(maxDev, Math.abs(g - med) / med);
      return maxDev;
    }
    const rowUniform = gapUniformity(rowPeaks);
    const colUniform = gapUniformity(colPeaks);
    if (rowUniform < 0.07 && colUniform < 0.07) {
      return { binary, rgba: rgbaIn, w, h, grid };
    }

    // Target: a regular grid where every cell is cellPitch × cellPitch.
    // (Preserves scale and keeps the output image roughly the same size.)
    const targetPitch = cellPitch;
    const outW = Math.round(cols * targetPitch);
    const outH = Math.round(rows * targetPitch);
    if (outW < 4 || outH < 4) return { binary, rgba: rgbaIn, w, h, grid };

    // Build the inverse-map arrays: for each output pixel (ox, oy), what
    // source pixel (sx, sy) should we sample? We use the detected peak
    // positions as control points and bilinear interpolation within each
    // cell span.
    const mapXData = new Float32Array(outH * outW);
    const mapYData = new Float32Array(outH * outW);

    for (let oy = 0; oy < outH; oy++) {
      // Which row cell does this output pixel fall in?
      const rFrac = oy / targetPitch;
      const ri    = Math.min(rows - 1, Math.floor(rFrac));
      const tr    = rFrac - ri; // fractional offset within the row cell [0,1)
      const srcY  = rowPeaks[ri] + tr * (rowPeaks[ri + 1] - rowPeaks[ri]);

      for (let ox = 0; ox < outW; ox++) {
        const cFrac = ox / targetPitch;
        const ci    = Math.min(cols - 1, Math.floor(cFrac));
        const tc    = cFrac - ci;
        const srcX  = colPeaks[ci] + tc * (colPeaks[ci + 1] - colPeaks[ci]);
        mapXData[oy * outW + ox] = srcX;
        mapYData[oy * outW + ox] = srcY;
      }
    }

    // Build the updated grid descriptor for the regular output space.
    // Peak arrays are no longer needed (the image IS the regular grid now).
    const rectifiedGrid = Object.assign({}, grid, {
      cellPitch:  targetPitch,
      originRow:  0,
      originCol:  0,
      rowPeaks:   null,
      colPeaks:   null,
    });

    return MatScope.withScope(s => {
      const mapXMat = s.track(cv.matFromArray(outH, outW, cv.CV_32FC1, mapXData));
      const mapYMat = s.track(cv.matFromArray(outH, outW, cv.CV_32FC1, mapYData));

      // Rectify binary (if provided — may be null when called from
      // extractCellColors which only needs the RGBA warp).
      // INTER_NEAREST preserves the 0/255 binary nature of the image.
      // INTER_LINEAR would blend ink (255) with background (0) pixels,
      // producing intermediate gray values that make all cells' HOG features
      // more similar and corrupt the ink-density check in extractCells.
      let rectBinary = binary;
      if (binary) {
        const srcBin = s.track(cv.matFromArray(h, w, cv.CV_8UC1, binary));
        const dstBin = s.track(new cv.Mat());
        cv.remap(srcBin, dstBin, mapXMat, mapYMat, cv.INTER_NEAREST,
                 cv.BORDER_REPLICATE, new cv.Scalar(0));
        rectBinary = new Uint8Array(dstBin.data);
      }

      // Rectify RGBA if provided.
      let rectRgba = rgbaIn;
      if (rgbaIn && rgbaIn.length === w * h * 4) {
        const srcRgba = s.track(cv.matFromImageData({ data: rgbaIn, width: w, height: h }));
        const dstRgba = s.track(new cv.Mat());
        cv.remap(srcRgba, dstRgba, mapXMat, mapYMat, cv.INTER_LINEAR,
                 cv.BORDER_REPLICATE, new cv.Scalar(0, 0, 0, 255));
        rectRgba = new Uint8ClampedArray(dstRgba.data);
      }

      return { binary: rectBinary, rgba: rectRgba, w: outW, h: outH, grid: rectifiedGrid };
    });
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
    // Use actual detected grid-line positions when available. This absorbs
    // per-column / per-row pitch drift, barrel distortion, and paper-curvature
    // without a separate undistort pass. Falls back to the uniform-pitch
    // formula (origin + n × pitch) when the peak arrays are absent or too
    // short (e.g. from older grid-detection results).
    const rowPks0 = (grid.rowPeaks && grid.rowPeaks.length >= rows + 1)
      ? grid.rowPeaks : null;
    const colPks0 = (grid.colPeaks && grid.colPeaks.length >= cols + 1)
      ? grid.colPeaks : null;

    // When both peak arrays are available, attempt mesh rectification to
    // warp the binary to a perfectly regular grid. The rectified binary is
    // used only for HOG/dHash extraction (the RGBA colour path is unaffected).
    // meshRectify is a no-op when non-uniformity is below 3 %.
    let workBin = binary, workW = w, workH = h;
    let rowPks = rowPks0, colPks = colPks0;
    let workOriginRow = originRow, workOriginCol = originCol, workPitch = cellPitch;
    if (rowPks0 && colPks0) {
      const rect = meshRectify(binary, null, w, h, grid, opts);
      if (rect.w !== w || rect.h !== h) {
        // Non-trivial rectification: switch to the regular-grid view.
        workBin       = rect.binary;
        workW         = rect.w;
        workH         = rect.h;
        workOriginRow = rect.grid.originRow;
        workOriginCol = rect.grid.originCol;
        workPitch     = rect.grid.cellPitch;
        rowPks        = null; // regular grid — no peak tracking needed
        colPks        = null;
      }
    }

    return MatScope.withScope(s => {
      const bw = s.track(cv.matFromArray(workH, workW, cv.CV_8UC1, workBin));
      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
          // Cell boundary: prefer detected peak edges over uniform pitch.
          const cellTop    = rowPks ? rowPks[r]     : workOriginRow +  r      * workPitch;
          const cellBottom = rowPks ? rowPks[r + 1] : workOriginRow + (r + 1) * workPitch;
          const cellLeft   = colPks ? colPks[c]     : workOriginCol +  c      * workPitch;
          const cellRight  = colPks ? colPks[c + 1] : workOriginCol + (c + 1) * workPitch;
          const cellH = Math.max(1, cellBottom - cellTop);
          const cellW = Math.max(1, cellRight  - cellLeft);
          const padY  = Math.max(1, Math.round(cellH * padFrac));
          const padX  = Math.max(1, Math.round(cellW * padFrac));
          const x0    = Math.round(cellLeft + padX);
          const y0    = Math.round(cellTop  + padY);
          const roiW  = Math.max(1, Math.round(cellW - 2 * padX));
          const roiH  = Math.max(1, Math.round(cellH - 2 * padY));
          if (x0 < 0 || y0 < 0 || x0 + roiW > workW || y0 + roiH > workH) {
            cells.push(new Uint8Array(P * P));
            emptyMask[r * cols + c] = 1;
            continue;
          }
          const roi = bw.roi(new cv.Rect(x0, y0, roiW, roiH));
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
    // Apply the same mesh rectification that extractCells uses so that glyph
    // extraction and colour sampling operate in the same coordinate space.
    // meshRectify returns the inputs unchanged when the grid is already
    // uniform (< 7 % non-uniformity), so this is a no-op for most charts.
    const _rect = meshRectify(null, rgba, w, h, grid);
    if (_rect.rgba !== rgba) {
      rgba = _rect.rgba;
      w    = _rect.w;
      h    = _rect.h;
      grid = _rect.grid;
    }
    const { cellPitch, originRow, originCol, rows, cols } = grid;
    const out = new Uint8Array(rows * cols * 3);
    // Use actual detected grid-line positions when available — same policy
    // as extractCells — so colour sampling uses the corrected boundaries.
    const rowPks = (grid.rowPeaks && grid.rowPeaks.length >= rows + 1)
      ? grid.rowPeaks : null;
    const colPks = (grid.colPeaks && grid.colPeaks.length >= cols + 1)
      ? grid.colPeaks : null;
    // Tighter inward pad than the default so grid-line ink doesn't bleed
    // into the colour sample. We also use a per-channel median rather
    // than a mean — printed grid lines are thin but darker than every
    // colour swatch, so the mean is biased toward black on cells where
    // pad-clipping leaves any line pixels behind. Median is robust against
    // that one-sided contamination.
    // fallbackPad is used only when peak arrays are absent.
    const fallbackPad = Math.max(
      Math.floor(cellPitch * 0.18),
      Math.floor(cellPitch * DEFAULT_OPTS.cellInwardPadFrac),
    );
    // Per-pixel scratch buffers reused across cells. Avoids allocating a
    // fresh array for every cell (cells × ~200 px = millions of GC objects
    // on a typical chart otherwise).
    const rBuf = []; const gBuf = []; const bBuf = []; const yBuf = [];
    // Luminance histogram for modal-window median. 16 buckets × 16 Y per
    // bucket spans 0–255. The densest bucket is overwhelmingly the cell
    // background; the printed symbol (whatever its polarity) usually lives
    // 2+ buckets away in luminance, so a ±16 Y window around the mode
    // keeps only background pixels.
    const NUM_BUCKETS = 16;
    const BUCKET_WIDTH = 16; // 256 / 16
    const hist = new Int32Array(NUM_BUCKETS);

    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const cellTop    = rowPks ? rowPks[r]     : Math.round(originRow +  r      * cellPitch);
        const cellBottom = rowPks ? rowPks[r + 1] : Math.round(originRow + (r + 1) * cellPitch);
        const cellLeft   = colPks ? colPks[c]     : Math.round(originCol +  c      * cellPitch);
        const cellRight  = colPks ? colPks[c + 1] : Math.round(originCol + (c + 1) * cellPitch);
        // Per-cell padding: proportional to the local cell size so it
        // scales correctly for charts with non-uniform pitch.
        const localPitch = (rowPks || colPks)
          ? Math.round(0.5 * ((cellBottom - cellTop) + (cellRight - cellLeft)))
          : cellPitch;
        const pad = (rowPks || colPks)
          ? Math.max(Math.floor(localPitch * 0.18), Math.floor(localPitch * DEFAULT_OPTS.cellInwardPadFrac))
          : fallbackPad;
        const x0 = cellLeft   + pad;
        const y0 = cellTop    + pad;
        const x1 = cellRight  - pad;
        const y1 = cellBottom - pad;

        rBuf.length = 0; gBuf.length = 0; bBuf.length = 0; yBuf.length = 0;
        for (let py = Math.max(0, y0); py < Math.min(h, y1); py++) {
          for (let px = Math.max(0, x0); px < Math.min(w, x1); px++) {
            const base = (py * w + px) * 4;
            const r8 = rgba[base], g8 = rgba[base + 1], b8 = rgba[base + 2];
            rBuf.push(r8); gBuf.push(g8); bBuf.push(b8);
            // Rec. 601 luma (cheap, integer-friendly). Pure-perceptual L*
            // would need an sRGB→Lab per pixel — overkill for picking the
            // dominant brightness bucket.
            yBuf.push((r8 * 77 + g8 * 150 + b8 * 29) >> 8);
          }
        }

        const base = (r * cols + c) * 3;
        const n = rBuf.length;
        if (!n) continue;

        // ── Modal-window median ─────────────────────────────────────────
        // 1. Bucketise luminance, find the densest bucket = background mode.
        // 2. Keep pixels within ±1 bucket of the mode (±32 Y).
        // 3. If the kept subset is at least 20 % of the cell, median over
        //    that subset — this is the background colour, free of the
        //    printed symbol's ink. Otherwise fall back to a full-pixel
        //    median (degenerate cell, or symbol covers > 80 %).
        hist.fill(0);
        for (let i = 0; i < n; i++) {
          const b = yBuf[i] >> 4; // / BUCKET_WIDTH
          hist[b < 0 ? 0 : b >= NUM_BUCKETS ? NUM_BUCKETS - 1 : b]++;
        }
        let modeBucket = 0, modeCount = hist[0];
        for (let i = 1; i < NUM_BUCKETS; i++) {
          if (hist[i] > modeCount) { modeCount = hist[i]; modeBucket = i; }
        }
        const yMin = (modeBucket - 1) * BUCKET_WIDTH;
        const yMax = (modeBucket + 2) * BUCKET_WIDTH; // exclusive upper bound (covers mode bucket + 1)
        // Collect kept-pixel indices. Threshold of 20 % of cell pixels —
        // below that the mode bucket is probably noise rather than the
        // true background, so we keep the original full-cell median for
        // backwards compatibility.
        const keepThresh = Math.max(8, Math.floor(n * 0.20));
        let kept = 0;
        // Compact in place: move kept pixels to the front of the buffers.
        for (let i = 0; i < n; i++) {
          const y = yBuf[i];
          if (y >= yMin && y < yMax) {
            rBuf[kept] = rBuf[i]; gBuf[kept] = gBuf[i]; bBuf[kept] = bBuf[i];
            kept++;
          }
        }
        const useKept = kept >= keepThresh;
        const len = useKept ? kept : n;
        // Median each channel over the active range. Array.prototype.sort
        // honours the explicit length when we truncate via .length=.
        rBuf.length = len; gBuf.length = len; bBuf.length = len;
        rBuf.sort((a, b) => a - b);
        gBuf.sort((a, b) => a - b);
        bBuf.sort((a, b) => a - b);
        const mid = len >> 1;
        out[base]     = rBuf[mid];
        out[base + 1] = gBuf[mid];
        out[base + 2] = bBuf[mid];
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
    meshRectify,
    extractCells,
    featurise,
    extractCellColors,
    detectBarrelDistortion,
  };
  if (typeof self !== 'undefined') self.RasterChartCV = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})();
