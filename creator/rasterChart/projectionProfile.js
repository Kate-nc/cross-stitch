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
   * Autocorrelation-based pitch estimate. Computes the 1D autocorrelation
   * of the zero-mean profile and returns the lag of the first prominent
   * non-trivial peak in [minLag, maxLag]. More robust than peak-counting
   * for photographed charts where text, watermarks, and partial-cell rows
   * confuse the projection-profile peak picker.
   *
   * @param {Float32Array|number[]} profile
   * @param {object} [opts]
   * @param {number} [opts.minLag=3]
   * @param {number} [opts.maxLag] defaults to profile.length / 4
   * @param {number} [opts.minPeakStrength=0.2]  fraction of zero-lag autocorr
   * @returns {number} pitch in pixels, or 0 if no confident peak found
   */
  function autocorrPitch(profile, opts) {
    opts = opts || {};
    const n = profile.length;
    if (n < 8) return 0;
    const minLag = Math.max(2, opts.minLag || 3);
    const maxLag = Math.min(n - 2, opts.maxLag || Math.floor(n / 4));
    if (maxLag <= minLag) return 0;
    const minPeakStrength = opts.minPeakStrength == null ? 0.2 : opts.minPeakStrength;

    // Zero-mean the profile so DC doesn't dominate.
    let mean = 0;
    for (let i = 0; i < n; i++) mean += profile[i];
    mean /= n;
    const z = new Float64Array(n);
    for (let i = 0; i < n; i++) z[i] = profile[i] - mean;

    // Compute autocorr[lag=0..maxLag]. O(n*maxLag) — fine for n≤2000, maxLag≤500.
    const ac = new Float64Array(maxLag + 1);
    for (let lag = 0; lag <= maxLag; lag++) {
      let s = 0;
      for (let i = 0; i + lag < n; i++) s += z[i] * z[i + lag];
      ac[lag] = s;
    }
    const ac0 = ac[0];
    if (ac0 <= 0) return 0;
    const thresh = ac0 * minPeakStrength;

    // Walk lag forward, skip the initial monotonic descent from lag=0, then
    // return the first local maximum that exceeds threshold.
    let descending = true;
    for (let lag = 1; lag < maxLag; lag++) {
      if (descending) {
        if (ac[lag] >= ac[lag - 1]) descending = false; else continue;
      }
      if (lag < minLag) continue;
      if (ac[lag] >= thresh && ac[lag] >= ac[lag - 1] && ac[lag] >= ac[lag + 1]) {
        // Parabolic refine around the integer peak for sub-pixel pitch.
        const y0 = ac[lag - 1], y1 = ac[lag], y2 = ac[lag + 1];
        const denom = (y0 - 2 * y1 + y2);
        const delta = denom !== 0 ? 0.5 * (y0 - y2) / denom : 0;
        return lag + (isFinite(delta) ? delta : 0);
      }
    }
    return 0;
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

    let rowPitch = median(rowGaps);
    let colPitch = median(colGaps);

    // Autocorrelation cross-check. Useful when the peak picker is fooled
    // by interspersed text/watermark peaks that bias the median gap.
    // We only let autocorr *override* the peak-based pitch when the peak-
    // based pitches strongly disagree (cells far from square) AND the
    // autocorr pitches strongly agree — otherwise we keep peak-based to
    // avoid breaking grids the peak picker handled fine.
    const rowAc = autocorrPitch(rowSum, { minLag: minSpacing });
    const colAc = autocorrPitch(colSum, { minLag: minSpacing });
    let pitchSource = 'peaks';
    if (rowAc && colAc) {
      const acRatio = Math.min(rowAc, colAc) / Math.max(rowAc, colAc);
      const peakRatio = rowPitch && colPitch ? Math.min(rowPitch, colPitch) / Math.max(rowPitch, colPitch) : 0;
      if (acRatio > 0.95 && peakRatio < 0.7) {
        rowPitch = rowAc; colPitch = colAc;
        pitchSource = 'autocorr';
      }
      // Note: peaks-and-autocorr blending was removed because shifting
      // pitch by even 5% can offset every column peak by a cell and
      // produce empty cells across the grid. Pure peaks is safer; we
      // only switch wholesale when the peak picker is clearly wrong.
    }
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
      pitchSource,
      autocorrPitch: { row: rowAc, col: colAc },
    };
  }

  const api = { findPeaks, gridFromProfiles, median, detectMajorPeriod, autocorrPitch };
  if (typeof globalThis !== 'undefined') globalThis.RasterChartProjection = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})();
