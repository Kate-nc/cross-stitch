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

  function validateCells(raw) {
    const warnings = [];
    const errors = [];
    if (!raw) {
      errors.push({ code: 'EMPTY', message: 'No extraction data.' });
      return { warnings, errors, coverage: null };
    }
    const cells = raw.cells || [];
    const legendRows = (raw.legend && raw.legend.rows) || [];

    // 1. Empty grid.
    if (!cells.length && !(raw.bsLines || []).length) {
      errors.push({ code: 'EMPTY_GRID', message: 'No stitches were detected.' });
    }

    // 2. Match-confidence coverage.
    const matched = cells.filter(c => c.matchConfidence > 0).length;
    const coverage = cells.length ? matched / cells.length : null;
    if (coverage !== null && coverage < 0.5) {
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
      if (Number.isFinite(r.expectedCount) && r.expectedCount >= 0 && diff > 0) {
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
      if (!counts.has(r.code) && r.expectedCount == null) {
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
      if (!legendCodes.has(code)) {
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

  // Percentages describe a specific population, never overall source fidelity.
  function measure(status, detail, numerator, denominator) {
    return { status, detail, numerator: numerator == null ? null : numerator,
      denominator: denominator == null ? null : denominator,
      coverage: Number.isFinite(numerator) && Number.isFinite(denominator) &&
        denominator > 0 && numerator >= 0 && numerator <= denominator ? numerator / denominator : null };
  }

  // Shared with the review header: preserve the PDF importer's key evidence.
  function pdfKeyMatch(r) {
    if (!r || !r.matched || r.scanned || !r.keyEntries) return null;
    const m = r.matched;
    const ps = typeof m.partialSwatch === 'number' ? m.partialSwatch : (m.partial || 0);
    const pn = m.partialNearest || 0;
    const read = (m.symbol || 0) + (m.swatch || 0) + ps + (r.keyColoursDistinct ? (m.nearest || 0) + pn : 0);
    const total = (m.symbol || 0) + (m.swatch || 0) + (m.nearest || 0) + ps + pn + (m.catalogue || 0) + (m.unresolved || 0);
    return total > 0 && read >= 0 && read <= total ? { read, total } : null;
  }

  function validateExtraction(raw) {
    if (!raw) return validateCells(raw);
    const p = raw._legacyProject;
    const out = p ? { warnings: [], errors: [], coverage: null } : validateCells(raw);
    const r = (p && p.importReport) || {};
    const audit = raw._legacyResult && raw._legacyResult.fidelity;
    const pattern = p ? p.pattern : raw.cells;
    const cellList = Array.isArray(pattern) ? pattern : [];
    const w = p ? (p.settings && p.settings.sW) ?? p.w : raw.width;
    const h = p ? (p.settings && p.settings.sH) ?? p.h : raw.height;
    const validSize = Number.isInteger(w) && Number.isInteger(h) && w > 0 && h > 0;
    const occupied = cellList.filter(c => c && c.id !== '__skip__' && c.id !== '__empty__');
    const checks = {};
    checks.recognisedCells = measure('unknown', 'Source cell total is unknown; extracted cells do not prove completeness.');
    checks.legendMatches = measure('unknown', 'No source legend evidence is available.');
    checks.stitchTypes = measure('unknown', 'Stitch-type preservation has not been verified against the source.');
    checks.dimensions = measure(validSize ? 'unknown' : 'limited', validSize ? w + ' × ' + h + ' grid; source size unverified.' : 'Invalid grid dimensions.');
    checks.unsupportedContent = measure('unknown', 'The source has not been checked for all unsupported content.');
    checks.counts = measure('unknown', 'No comparable declared stitch counts.');
    if (p && (!Array.isArray(pattern) || !validSize || pattern.length !== w * h ||
        (p.w != null && p.w !== w) || (p.h != null && p.h !== h))) {
      checks.dimensions = measure('limited', 'Grid dimensions and stored cell count disagree.');
      out.errors.push({ code: 'DIMENSIONS', message: 'Grid dimensions and stored cell count disagree. Re-export the chart with the correct size.' });
    }
    if (!validSize && !p) out.errors.push({ code: 'DIMENSIONS', message: 'Invalid grid dimensions. Check the source size.' });
    if (!p && validSize && (raw.cells || []).some(c =>
        (c.col != null || c.row != null) && (!Number.isInteger(c.col) || !Number.isInteger(c.row) || c.col < 0 || c.row < 0 || c.col >= w || c.row >= h))) {
      checks.dimensions = measure('limited', 'Some cells lie outside the grid.');
      out.errors.push({ code: 'CELL_BOUNDS', message: 'Some cells lie outside the grid. Correct the size or page arrangement before importing.' });
    }
    if (!p) {
      const cells = raw.cells || [];
      const rows = (raw.legend && raw.legend.rows) || [];
      const codes = new Set(rows.map(x => x.code).filter(Boolean));
      const matches = cells.filter(c => c.code && codes.has(c.code) && c.matchConfidence > 0).length;
      checks.legendMatches = measure(codes.size && matches === cells.length && cells.length ? 'verified' : codes.size ? 'limited' : 'unknown',
        'Cells matched to entries in the extracted legend.', matches, codes.size ? cells.length : null);
      const unsupported = cells.filter(c => c && c.type && !['solid','full','half','quarter','threequarter','petite','bs'].includes(c.type));
      if (unsupported.length) {
        checks.stitchTypes = checks.unsupportedContent = measure('limited', unsupported.length + ' unsupported stitch objects.');
        out.warnings.push({ code: 'UNSUPPORTED_STITCH', severity: 'high', message: unsupported.length + ' unsupported stitch objects would lose their type. Re-export using supported stitches or keep them in the source program.' });
      }
      if (rows.some(x => Number.isFinite(x.expectedCount))) checks.counts = measure(out.warnings.some(x => x.code === 'COUNT_MISMATCH') ? 'limited' : 'verified', 'Compared declared per-thread counts with extracted cells.');
    }
    if (audit) {
      if (checks.dimensions.status !== 'limited') checks.dimensions = measure('verified', 'OXS dimensions and stored grid agree.');
      checks.recognisedCells = measure(audit.fullCells === audit.sourceFullCells ? 'verified' : 'limited',
        'Full-cross cells retained from OXS; other stitch types are checked separately.', audit.fullCells, audit.sourceFullCells);
      checks.counts = measure('not applicable', 'The OXS parser exposes no declared per-thread counts.');
      checks.stitchTypes = measure(audit.losses.length ? 'limited' : 'verified', audit.losses.length ? 'OXS reports changed or omitted objects; see notes.' : 'Supported OXS stitch objects retained.');
      checks.unsupportedContent = measure(audit.losses.length ? 'limited' : 'verified', audit.losses.length ? 'OXS reports unsupported, substituted or malformed content.' : 'No unsupported objects reported in recognised OXS sections.');
      checks.legendMatches = measure(audit.losses.some(x => /thread|palette|blend/.test(x)) ? 'limited' : 'verified', 'OXS palette references checked by the parser.');
    }
    if (raw._xsdAudit) {
      const a = raw._xsdAudit;
      if (checks.dimensions.status !== 'limited') checks.dimensions = measure('verified', 'XSD binary dimensions and stored grid agree.');
      checks.recognisedCells = measure(a.fullCells === a.sourceFullCells ? 'verified' : 'limited', 'Full-cross cells retained from XSD; fractional and joint objects counted separately.', a.fullCells, a.sourceFullCells);
      checks.legendMatches = measure(a.losses.some(x => /palette|thread|blend/.test(x.reason)) ? 'limited' : 'verified', 'XSD physical palette indices checked; no colour substitution.');
      checks.stitchTypes = measure(a.losses.length ? 'limited' : 'verified', a.importedObjects + ' of ' + a.sourceObjects + ' known decoded stitch objects retained; ' + a.unknownSmallCells + ' fractional cells have unknown contents and were omitted. See type-specific limitations.', a.importedObjects, a.unknownSmallCells ? null : a.sourceObjects);
      checks.counts = measure('not applicable', 'XSD supplies grid, small-buffer and joint record counts, not independent per-thread stitch totals. Record bounds were checked by the parser.');
      checks.unsupportedContent = measure('limited', 'Undocumented header data and display/strand settings are unverified; see XSD notes and affected-object counts.');
    }
    if (r.pat) {
      const a = r.pat;
      if (checks.dimensions.status !== 'limited') checks.dimensions = measure('verified', 'PCStitch 7 dimensions and stored grid agree.');
      checks.recognisedCells = measure(a.decodedCells === a.sourceCells ? 'verified' : 'limited', 'Column-major PCStitch grid runs checked against declared dimensions.', a.decodedCells, a.sourceCells);
      checks.legendMatches = measure('unknown', 'Thread identifiers and brands retained; blends and custom palette attributes are unverified. Compare with the source.');
      checks.stitchTypes = measure('limited', 'PCStitch 7 supported geometry retained; inspect notes for omitted objects.', a.retainedObjects, a.sourceObjects);
      checks.unsupportedContent = measure('limited', 'Header options, symbols, blends and unknown fields are not fully decoded. Review notes and the original.');
      checks.counts = measure('not applicable', 'No independently declared per-thread stitch totals in this layout.');
    }
    const key = pdfKeyMatch(r);
    if (key) checks.legendMatches = measure(key.read === key.total && !(r.placeholders || []).length ? 'verified' : 'limited', 'Stitches matched to the PDF colour key.', key.read, key.total);
    if (r.scanned) checks.legendMatches = measure('unknown', 'Read from a scan; compare symbols and colours with the printed key.');
    const sizeChecks = (r.checks || []).filter(c => c.what === 'size' || c.what === 'physical size');
    if (sizeChecks.length && checks.dimensions.status !== 'limited') checks.dimensions = measure(sizeChecks.every(c => c.ok) ? 'verified' : 'limited', 'Compared with the size stated in the PDF.');
    const countChecks = (r.checks || []).filter(c => c.what === 'per-thread counts' || c.what === 'colours');
    if (countChecks.length) checks.counts = measure(countChecks.every(c => c.ok) ? 'verified' : 'limited', 'Compared with counts stated in the PDF.');
    const partialThreads = [];
    if (p) {
      for (const entry of [].concat(p.partialStitches || [], p.halfStitches || [])) {
        if (Array.isArray(entry) && entry[1]) partialThreads.push(...Object.values(entry[1]));
      }
    }
    const missing = p && (occupied.concat(partialThreads, p.knots || []).some(c => !c || !c.id) ||
      (p.bsLines || []).some(l => !l.colorId) || (r.placeholders || []).length);
    if (missing) {
      checks.legendMatches.status = 'limited';
      out.warnings.push({ code: 'THREAD_REFERENCE', severity: 'high', message: 'Some stitch objects have no resolved thread reference. Assign placeholders in Palette; recover missing line references from the original or re-export them.' });
    }
    if (p) {
      const bad = occupied.concat(partialThreads).filter(c => c && c.type && !['solid','blend','half','quarter','threequarter','petite','bs'].includes(c.type));
      if (bad.length) {
        checks.stitchTypes = checks.unsupportedContent = measure('limited', bad.length + ' unsupported stored stitch objects.');
        out.warnings.push({ code: 'UNSUPPORTED_STITCH', severity: 'high', message: bad.length + ' stored stitch objects use unsupported types. Check the original and re-export using supported stitches.' });
      }
    }
    const notes = [].concat((raw.flags && raw.flags.warnings) || [], r.warnings || []);
    const verified = Object.values(checks).every(c => (c.status === 'verified' || c.status === 'not applicable')) && !out.errors.length && !out.warnings.length && !notes.length;
    out.verification = { status: out.errors.length ? 'invalid' : verified ? 'verified' : 'limited', checks };
    // Compatibility alias is only legend coverage, never overall confidence.
    out.coverage = checks.legendMatches.coverage;
    return out;
  }

  function countsByCode(cells) {
    const m = new Map();
    for (const c of cells) {
      if (!c.code) continue;
      m.set(c.code, (m.get(c.code) || 0) + 1);
    }
    return m;
  }

  const api = { validateExtraction, countsByCode, pdfKeyMatch };
  if (typeof window !== 'undefined') {
    window.ImportEngine = Object.assign(window.ImportEngine || {}, api);
  }
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  }
})();
