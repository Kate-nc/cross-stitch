/* import-engine/pipeline/validate.js — Validate a normalised raw extraction.
 *
 * Goes beyond pipeline.js's defaultValidate: this module is shared between
 * the pipeline and the review UI to surface specific warnings to the user.
 *
 * Inputs (raw extraction):
 *   { width, height, cells: [{col,row,code,matchKind,matchConfidence}],
 *     legend: { rows: [{code, expectedCount?, ...}] }, palette? }
 *
 * Output: { warnings: Warning[], errors: Error[], coverage: number }
 *   where Warning = { code, message, severity ('low'|'medium'|'high') }
 */

(function () {
  'use strict';

  function validateExtraction(raw) {
    const warnings = [];
    const errors = [];
    if (!raw) {
      errors.push({ code: 'EMPTY', message: 'No extraction data.' });
      return { warnings, errors, coverage: 0 };
    }
    const cells = raw.cells || [];
    const legendRows = (raw.legend && raw.legend.rows) || [];

    // 1. Empty grid.
    if (!cells.length) {
      errors.push({ code: 'EMPTY_GRID', message: 'No stitches were detected.' });
    }

    // 2. Match-confidence coverage.
    const matched = cells.filter(c => c.matchConfidence > 0).length;
    const coverage = cells.length ? matched / cells.length : 0;
    if (coverage < 0.5) {
      warnings.push({ code: 'LOW_PALETTE_COVERAGE',
        message: `Only ${(coverage * 100).toFixed(0)}% of stitches matched a colour.`,
        severity: 'high' });
    } else if (coverage < 0.85) {
      warnings.push({ code: 'PALETTE_COVERAGE',
        message: `${((1 - coverage) * 100).toFixed(0)}% of stitches could not be matched.`,
        severity: 'medium' });
    }

    // 3. Per-thread count vs legend expected count.
    const counts = countsByCode(cells);
    for (const r of legendRows) {
      if (!r.code || r.expectedCount == null) continue;
      const actual = counts.get(r.code) || 0;
      const diff = Math.abs(actual - r.expectedCount);
      if (r.expectedCount > 0 && diff > Math.max(5, r.expectedCount * 0.1)) {
        warnings.push({
          code: 'COUNT_MISMATCH',
          message: `Thread ${r.code}: expected ${r.expectedCount} stitches, found ${actual}.`,
          severity: 'medium',
          context: { code: r.code, expected: r.expectedCount, actual },
        });
      }
    }

    // 4. Threads in legend but absent from chart.
    for (const r of legendRows) {
      if (!r.code) continue;
      if (!counts.has(r.code)) {
        warnings.push({
          code: 'LEGEND_UNUSED',
          message: `Thread ${r.code} is in the legend but has no stitches.`,
          severity: 'low',
        });
      }
    }

    // 5. Threads in chart but missing from legend.
    const legendCodes = new Set(legendRows.map(r => r.code).filter(Boolean));
    const chartCodes = new Set(Array.from(counts.keys()));
    for (const code of chartCodes) {
      if (!legendCodes.has(code) && legendCodes.size) {
        warnings.push({
          code: 'LEGEND_MISSING_CODE',
          message: `Thread ${code} is used in the chart but has no legend entry.`,
          severity: 'medium',
        });
      }
    }

    // 6. Fabric size sanity check.
    if (raw.width && raw.height) {
      if (raw.width > 1000 || raw.height > 1000) {
        warnings.push({ code: 'GRID_TOO_LARGE',
          message: `Grid is ${raw.width}×${raw.height} stitches; review pitch detection.`,
          severity: 'medium' });
      }
      if (raw.width < 5 || raw.height < 5) {
        warnings.push({ code: 'GRID_TOO_SMALL',
          message: `Grid is only ${raw.width}×${raw.height} stitches.`,
          severity: 'medium' });
      }
    }

    return { warnings, errors, coverage };
  }

  function countsByCode(cells) {
    const m = new Map();
    for (const c of cells) {
      if (!c.code) continue;
      m.set(c.code, (m.get(c.code) || 0) + 1);
    }
    return m;
  }

  const api = { validateExtraction, countsByCode };
  if (typeof window !== 'undefined') {
    window.ImportEngine = Object.assign(window.ImportEngine || {}, api);
  }
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  }
})();
