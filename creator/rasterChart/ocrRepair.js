/* creator/rasterChart/ocrRepair.js
 * ════════════════════════════════════════════════════════════════════════
 *   Post-OCR classification + confusion-aware repair for legend codes.
 *
 *   Pure JS. Exported as window.RasterChartOCRRepair in the browser and as
 *   a CommonJS module for Jest. The DMC code set is injected at call time
 *   so this module remains independent of any global palette data.
 *
 *   Public API:
 *     classifyToken(token) → 'code' | 'name' | 'unknown'
 *     repairCode(token, dmcCodeSet) → { code, repaired, candidates } | null
 *     parseLegendLine(line, dmcCodeSet) → { code, name, source } | null
 * ════════════════════════════════════════════════════════════════════════
 */

(function () {
  'use strict';

  const CODE_PATTERNS = [
    /^(BLANC|B5200|ECRU)$/i,
    /^E\d{3,4}$/i,            // DMC Light Effects
    /^S\d{3}$/i,              // DMC Satin
    /^\d{1,5}$/,              // Generic numeric
    /^(DMC|Anchor|Madeira|Mad\.?|Sulky)\s*[A-Z]?\d{1,5}$/i,
  ];

  // Bidirectional confusion map. The keys are the OCR-recognised glyphs
  // that may be mistakes for the values, and vice versa. We expand it into
  // an undirected adjacency set at module load.
  const CONFUSION_RAW = [
    ['0', 'O', 'D'],
    ['1', 'l', 'I', '7'],
    ['5', 'S', '6'],
    ['8', 'B', '3'],
    ['6', 'G', '5'],
    ['2', 'Z'],
    ['9', 'g', 'q'],
  ];

  const CONFUSION = (function build() {
    const map = new Map();
    for (const group of CONFUSION_RAW) {
      for (const ch of group) {
        const set = map.get(ch) || new Set();
        for (const other of group) if (other !== ch) set.add(other);
        map.set(ch, set);
      }
    }
    return map;
  })();

  /** @returns {'code'|'name'|'unknown'} */
  function classifyToken(token) {
    if (!token || typeof token !== 'string') return 'unknown';
    const t = token.trim();
    if (!t) return 'unknown';
    for (const re of CODE_PATTERNS) if (re.test(t)) return 'code';
    // Name heuristic: contains a letter and is short-ish
    if (/[A-Za-z]/.test(t) && t.length <= 40) return 'name';
    return 'unknown';
  }

  /**
   * Try one-character substitutions until the result lands in dmcCodeSet.
   * @param {string} token
   * @param {Set<string>} dmcCodeSet  e.g. new Set(['310','550','B5200','BLANC'])
   * @returns {{code:string, repaired:boolean, candidates:string[]}|null}
   */
  function repairCode(token, dmcCodeSet) {
    if (!token) return null;
    const raw = token.trim();
    if (dmcCodeSet && dmcCodeSet.has(raw)) {
      return { code: raw, repaired: false, candidates: [raw] };
    }
    if (!dmcCodeSet || dmcCodeSet.size === 0) return null;

    // Strip brand prefix for matching but remember the original for return.
    const stripped = raw.replace(/^(DMC|Anchor|Madeira|Mad\.?|Sulky)\s*/i, '');
    if (stripped !== raw && dmcCodeSet.has(stripped)) {
      return { code: stripped, repaired: false, candidates: [stripped] };
    }

    const candidates = [];
    // 1-substitution search.
    for (let i = 0; i < stripped.length; i++) {
      const ch = stripped[i];
      const alts = CONFUSION.get(ch);
      if (!alts) continue;
      for (const alt of alts) {
        const cand = stripped.slice(0, i) + alt + stripped.slice(i + 1);
        if (dmcCodeSet.has(cand)) candidates.push(cand);
      }
    }
    if (candidates.length === 0) return null;
    // First match wins (per spec), but expose the full list for the UI.
    return { code: candidates[0], repaired: true, candidates };
  }

  /**
   * Best-effort split of one legend line into code + name. Lines come in
   * shapes like:
   *     "310  Black"
   *     "550   Violet Very Dark"
   *     "DMC 310  black"
   * @returns {{code:string, name:string, source:'exact'|'repaired'|'unknown'}|null}
   */
  function parseLegendLine(line, dmcCodeSet) {
    if (!line || typeof line !== 'string') return null;
    const tokens = line.trim().split(/\s+/);
    if (tokens.length === 0) return null;

    // Try first token, then first two tokens (for "DMC 310" style).
    const candidates = [];
    candidates.push({ code: tokens[0], rest: tokens.slice(1).join(' ') });
    if (tokens.length >= 2) {
      candidates.push({ code: tokens[0] + ' ' + tokens[1], rest: tokens.slice(2).join(' ') });
    }

    for (const c of candidates) {
      const kind = classifyToken(c.code);
      if (kind === 'code') {
        if (dmcCodeSet && dmcCodeSet.has(c.code.replace(/^(DMC|Anchor|Madeira|Mad\.?|Sulky)\s*/i, ''))) {
          return { code: c.code, name: c.rest, source: 'exact' };
        }
        const repaired = repairCode(c.code, dmcCodeSet);
        if (repaired) return { code: repaired.code, name: c.rest, source: 'repaired' };
        return { code: c.code, name: c.rest, source: 'unknown' };
      }
      // Token didn't match any CODE_PATTERN as-is, but if it contains digits
      // it may be an OCR mistake of a real code (e.g. "31O" → "310"). Try
      // confusion-aware repair as a last resort.
      if (/\d/.test(c.code)) {
        const repaired = repairCode(c.code, dmcCodeSet);
        if (repaired) return { code: repaired.code, name: c.rest, source: 'repaired' };
      }
    }
    return null;
  }

  const api = { classifyToken, repairCode, parseLegendLine, CODE_PATTERNS, CONFUSION };
  if (typeof window !== 'undefined') window.RasterChartOCRRepair = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})();
