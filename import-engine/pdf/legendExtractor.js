/* import-engine/pdf/legendExtractor.js — Extract legend rows from text bands.
 *
 * A legend row typically contains:
 *   <glyph><whitespace><dmc-code>[<whitespace><colour-name>][<strands>]
 *
 * Trilingual stitch-type detection (English / French / Spanish) per import-6.
 *
 * Output row: { glyph, code, label, strands, type, raw, confidence }
 */

(function () {
  'use strict';

  const CODE_RE = /\b(B5200|D\d{3}|E\d{3,4}|\d{2,5})\b/;
  const STRANDS_RE = /(\d+)\s*(?:strands?|brins?|hebras?|hilos?)/i;

  // Trilingual stitch-type vocabulary.
  const TYPE_PATTERNS = [
    { type: 'bs',             rx: /(back\s*stitch|backstitch|point\s*arri[èe]re|punto\s*atr[áa]s)/i },
    { type: 'threequarter',   rx: /(three[\s-]?quarter|3\s*\/\s*4|trois?\s*quarts?\s*de\s*point)/i },
    { type: 'quarter',        rx: /(quarter\s*stitch|quart\s*de\s*point|cuarto\s*de\s*punto|1\s*\/\s*4)/i },
    { type: 'half',           rx: /(half\s*stitch|demi[\s-]?point|medio\s*punto|1\s*\/\s*2)/i },
    { type: 'petite',         rx: /(petite|petit\s*point)/i },
    { type: 'french-knot',    rx: /(french\s*knot|nœud\s*de\s*broderie|nudo\s*franc[ée]s)/i },
    { type: 'full',           rx: /(cross\s*stitch|point\s*de\s*croix|punto\s*de\s*cruz)/i },
  ];

  // Classify a snippet of legend text into a stitch type.
  function classifyStitchType(text) {
    if (!text) return 'full';
    for (const { type, rx } of TYPE_PATTERNS) {
      if (rx.test(text)) return type;
    }
    return 'full';
  }

  // Extract a single legend row from a band (or raw text string).
  // Heuristic: row must contain a DMC code; everything before the code is the
  // glyph/symbol; everything after is the label/strands.
  function extractRow(input) {
    const text = typeof input === 'string'
      ? input
      : (input && (input.text || (input.items || []).map(i => i.str).join(' '))) || '';
    if (!text) return null;
    const m = text.match(CODE_RE);
    if (!m) return null;
    const code = m[0];
    const before = text.slice(0, m.index).trim();
    const after = text.slice(m.index + code.length).trim();

    // Glyph is the rightmost short token before the code (≤ 3 chars).
    let glyph = '';
    const beforeTokens = before.split(/\s+/).filter(Boolean);
    if (beforeTokens.length) {
      const last = beforeTokens[beforeTokens.length - 1];
      if (last.length <= 3) glyph = last;
    }

    // Strip strand counts from the label.
    let strands = null;
    const sm = after.match(STRANDS_RE);
    if (sm) strands = parseInt(sm[1], 10);

    // Label: everything in `after` up to a strand-count or stitch-type marker.
    let label = after.replace(STRANDS_RE, '').trim();
    // Remove obvious stitch-type tail ("/ cross stitch / point de croix").
    for (const { rx } of TYPE_PATTERNS) {
      label = label.replace(rx, '');
    }
    label = label.replace(/[\/\-–—|]+$/g, '').trim();

    const type = classifyStitchType(text);

    let confidence = 0.6;
    if (glyph) confidence += 0.15;
    if (label && label.length >= 2) confidence += 0.15;
    if (strands != null) confidence += 0.1;

    return {
      glyph,
      code,
      label,
      strands,
      type,
      raw: text,
      confidence: Math.min(1, confidence),
    };
  }

  // Extract all legend rows from a list of text bands.
  // Drops dupes by (glyph, code, type) and returns rows sorted by code.
  function extractRows(bands) {
    if (!Array.isArray(bands)) return [];
    const rows = [];
    const seen = new Set();
    for (const b of bands) {
      const r = extractRow(b);
      if (!r) continue;
      const key = `${r.glyph}|${r.code}|${r.type}`;
      if (seen.has(key)) continue;
      seen.add(key);
      rows.push(r);
    }
    return rows;
  }

  // Compose a legend object suitable for the assemble stage.
  // Returns { rows, codes: Set<string>, byGlyph: Map<glyph→row>, confidence }
  function buildLegend(bands) {
    const rows = extractRows(bands);
    const codes = new Set();
    const byGlyph = new Map();
    let conf = 0;
    for (const r of rows) {
      codes.add(r.code);
      if (r.glyph) byGlyph.set(r.glyph, r);
      conf += r.confidence;
    }
    const avg = rows.length ? (conf / rows.length) : 0;
    return { rows, codes, byGlyph, confidence: avg };
  }

  const api = { extractRow, extractRows, buildLegend, classifyStitchType, CODE_RE };
  if (typeof window !== 'undefined') {
    window.ImportEngine = Object.assign(window.ImportEngine || {}, api);
  }
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  }
})();
