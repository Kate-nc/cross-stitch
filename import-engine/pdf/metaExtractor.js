/* import-engine/pdf/metaExtractor.js — Extract pattern metadata from PDF text.
 *
 * Pulls: title, designer, fabricCount, fabricColour, finishedSize {w,h,unit}.
 *
 * Heuristics:
 *   - Title: first prominent text on the cover page (largest font / earliest band).
 *   - Designer: text matching "by <name>" or "designed by …" or "© <name>".
 *   - Fabric: "14 ct Aida", "5,5 pts/cm", "Aida 14".
 *   - Finished size: "Design size: 14 x 13 cm" / "5.51 x 5.11 in" / "80 x 80 stitches".
 */

(function () {
  'use strict';

  function extractMeta(bands, opts) {
    opts = opts || {};
    const text = bandsToText(bands);
    return {
      title: opts.title || extractTitle(bands, text),
      designer: extractDesigner(text),
      fabricCount: extractFabricCount(text),
      fabricColour: extractFabricColour(text),
      finishedSize: extractFinishedSize(text),
      stitchSize: extractStitchSize(text),
    };
  }

  function bandsToText(bands) {
    if (!Array.isArray(bands)) return typeof bands === 'string' ? bands : '';
    return bands.map(b => (b && b.text) || '').join('\n');
  }

  // The title is often the largest/first text on the cover.
  function extractTitle(bands, text) {
    if (!Array.isArray(bands) || !bands.length) {
      // Fallback: first non-trivial line.
      const first = text.split(/\n/).map(s => s.trim()).filter(s => s.length >= 3 && !/©|www\.|page|getting started|tool kit/i.test(s));
      return first[0] || null;
    }
    // Pick the band with largest fontSize, otherwise the first one.
    let best = null;
    for (const b of bands) {
      if (!b || !b.text) continue;
      const t = b.text.trim();
      if (t.length < 3) continue;
      if (/©|www\.|page|getting started|tool kit/i.test(t)) continue;
      if (!best || (b.fontSize || 0) > (best.fontSize || 0)) best = b;
    }
    return best ? best.text.trim() : null;
  }

  function extractDesigner(text) {
    const m = text.match(/(?:designed\s+by|by|©)\s+([A-Z][A-Za-z\u00C0-\u017F.\-' ]{2,40})/);
    if (m) return m[1].trim();
    return null;
  }

  function extractFabricCount(text) {
    // "14 ct Aida" / "Aida 14" / "5,5 pts/cm" / "14-count"
    let m = text.match(/(\d{1,2})[\s-]*(?:ct|count|pts?\/?in)\b/i);
    if (m) return parseInt(m[1], 10);
    m = text.match(/aida\s+(\d{1,2})\b/i);
    if (m) return parseInt(m[1], 10);
    // Metric: 5,5 pts/cm → ~14 ct
    m = text.match(/(\d+[.,]?\d*)\s*pts?\/cm/i);
    if (m) {
      const ptsPerCm = parseFloat(m[1].replace(',', '.'));
      if (isFinite(ptsPerCm)) return Math.round(ptsPerCm * 2.54);
    }
    return null;
  }

  function extractFabricColour(text) {
    // "white aida" / "Aida ecru" / "col.4015" etc.
    const m = text.match(/aida\s+([a-z]+)|([a-z]+)\s+aida/i);
    if (m) return (m[1] || m[2] || '').toLowerCase();
    return null;
  }

  function extractFinishedSize(text) {
    // "14 x 13 cm" / "5.51 x 5.11 in"
    const cm = text.match(/(\d+[.,]?\d*)\s*[x×]\s*(\d+[.,]?\d*)\s*cm/i);
    if (cm) return { w: parseFloat(cm[1].replace(',', '.')), h: parseFloat(cm[2].replace(',', '.')), unit: 'cm' };
    const inch = text.match(/(\d+[.,]?\d*)\s*[x×]\s*(\d+[.,]?\d*)\s*in\b/i);
    if (inch) return { w: parseFloat(inch[1].replace(',', '.')), h: parseFloat(inch[2].replace(',', '.')), unit: 'in' };
    return null;
  }

  function extractStitchSize(text) {
    const m = text.match(/(\d+)\s*[x×]\s*(\d+)\s*(?:stitches|points|puntos)/i);
    if (m) return { w: parseInt(m[1], 10), h: parseInt(m[2], 10) };
    return null;
  }

  const api = { extractMeta, extractTitle, extractDesigner, extractFabricCount,
                extractFabricColour, extractFinishedSize, extractStitchSize };
  if (typeof window !== 'undefined') {
    window.ImportEngine = Object.assign(window.ImportEngine || {}, api);
  }
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  }
})();
