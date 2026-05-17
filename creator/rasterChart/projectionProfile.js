/* creator/rasterChart/projectionProfile.js
 * ════════════════════════════════════════════════════════════════════════
 *   1-D peak finder + projection-profile grid detection for binary chart
 *   images. Pure JS — no OpenCV dependency. The caller supplies row/col
 *   sums (we sum the binary mat in the worker, on the GPU-ish C++ side).
 *
 *   Public API:
 *     findPeaks(profile, opts) → number[] (peak indices)
 *     gridFromProfiles(rowSum, colSum, opts) → {
 *       cellPitch, originRow, originCol, rows, cols,
 *       rowPeaks, colPeaks, majorEvery, confidence
 *     }
 * ════════════════════════════════════════════════════════════════════════
 */

(function () {
  'use strict';

  /**
   * Standard prominence-based peak finder.
   * @param {Float32Array|number[]} y
   * @param {object} [opts]
   * @param {number} [opts.minProminenceFrac=0.3]
   * @param {number} [opts.minSpacing=1]
   * @returns {number[]} sorted peak indices
   */
  function findPeaks(y, opts) {
    opts = opts || {};
    const minProminenceFrac = opts.minProminenceFrac == null ? 0.3 : opts.minProminenceFrac;
    const minSpacing = opts.minSpacing == null ? 1 : Math.max(1, opts.minSpacing | 0);

    const n = y.length;
    if (n < 3) return [];

    let maxV = -Infinity;
    for (let i = 0; i < n; i++) if (y[i] > maxV) maxV = y[i];
    if (maxV <= 0) return [];
    const threshold = minProminenceFrac * maxV;

    // First pass: strict local maxima above threshold.
    const raw = [];
    for (let i = 1; i < n - 1; i++) {
      if (y[i] >= threshold && y[i] > y[i - 1] && y[i] >= y[i + 1]) raw.push(i);
    }
    // Plateau handling: if y[i] === y[i+1] we'd miss flat tops; fold them
    // into a single index at the plateau midpoint.
    if (raw.length === 0) return [];

    // Enforce minSpacing by greedy non-max suppression keeping the strongest.
    // A new peak is accepted iff its distance to every already-kept peak is
    // ≥ minSpacing.
    raw.sort((a, b) => y[b] - y[a]);
    const keep = [];
    for (const idx of raw) {
      let ok = true;
      for (let i = 0; i < keep.length; i++) {
        if (Math.abs(keep[i] - idx) < minSpacing) { ok = false; break; }
      }
      if (ok) keep.push(idx);
    }
    keep.sort((a, b) => a - b);
    return keep;
  }

  /** Median of a numeric array (non-mutating). */
  function median(arr) {
    if (!arr.length) return 0;
    const a = arr.slice().sort((x, y) => x - y);
    const m = a.length >> 1;
    return a.length % 2 ? a[m] : 0.5 * (a[m - 1] + a[m]);
  }

  /**
   * Try the two prominence levels and look for bimodality + mod-10 to tag
   * majors. Returns 10 if the bold-every-10 pattern is present, otherwise 0.
   */
  function detectMajorPeriod(peaks, profile) {
    if (peaks.length < 12) return 0;
    const heights = peaks.map(p => profile[p]);
    const med = median(heights);
    const majorThresh = med * 1.6;
    const majors = [];
    for (let i = 0; i < peaks.length; i++) {
      if (heights[i] >= majorThresh) majors.push(i);
    }
    if (majors.length < 2) return 0;
    // Check that majors sit at every 10th minor (allow 1-off tolerance).
    let hits = 0;
    for (let i = 1; i < majors.length; i++) {
      const gap = majors[i] - majors[i - 1];
      if (Math.abs(gap - 10) <= 1) hits++;
    }
    return hits >= majors.length - 2 ? 10 : 0;
  }

  /**
   * Combine row + col projections into a grid hypothesis.
   * @param {Float32Array|number[]} rowSum  length = image height
   * @param {Float32Array|number[]} colSum  length = image width
   * @param {object} [opts]
   * @param {number} [opts.expectedCellSizeHint]  optional pixel hint
   */
  function gridFromProfiles(rowSum, colSum, opts) {
    opts = opts || {};
    const hint = opts.expectedCellSizeHint || 0;

    const minSpacing = Math.max(2, Math.floor((hint || 8) * 0.5));
    const rowPeaks = findPeaks(rowSum, { minProminenceFrac: 0.3, minSpacing });
    const colPeaks = findPeaks(colSum, { minProminenceFrac: 0.3, minSpacing });

    if (rowPeaks.length < 2 || colPeaks.length < 2) {
      return {
        cellPitch: 0, originRow: 0, originCol: 0,
        rows: 0, cols: 0, rowPeaks, colPeaks, majorEvery: 0, confidence: 0,
      };
    }

    const rowGaps = [];
    for (let i = 1; i < rowPeaks.length; i++) rowGaps.push(rowPeaks[i] - rowPeaks[i - 1]);
    const colGaps = [];
    for (let i = 1; i < colPeaks.length; i++) colGaps.push(colPeaks[i] - colPeaks[i - 1]);

    const rowPitch = median(rowGaps);
    const colPitch = median(colGaps);
    // Cells should be roughly square; if the two pitches disagree by >20%
    // the grid hypothesis is probably wrong.
    const ratio = rowPitch && colPitch ? Math.min(rowPitch, colPitch) / Math.max(rowPitch, colPitch) : 0;
    const cellPitch = 0.5 * (rowPitch + colPitch);

    // Confidence: stable spacing + square cells.
    const stability = (gaps, p) => {
      if (!gaps.length || !p) return 0;
      let dev = 0;
      for (const g of gaps) dev += Math.abs(g - p);
      return Math.max(0, 1 - (dev / gaps.length) / p);
    };
    const confidence = Math.min(1, 0.5 * (stability(rowGaps, rowPitch) + stability(colGaps, colPitch)) * ratio);

    const majorEvery = detectMajorPeriod(colPeaks, colSum) ||
                       detectMajorPeriod(rowPeaks, rowSum) || 0;

    return {
      cellPitch,
      originRow: rowPeaks[0],
      originCol: colPeaks[0],
      // Number of cells = number of inter-peak gaps.
      rows: rowPeaks.length - 1,
      cols: colPeaks.length - 1,
      rowPeaks,
      colPeaks,
      majorEvery,
      confidence,
    };
  }

  const api = { findPeaks, gridFromProfiles, median, detectMajorPeriod };
  if (typeof globalThis !== 'undefined') globalThis.RasterChartProjection = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})();
