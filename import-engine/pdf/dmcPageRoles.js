/* import-engine/pdf/dmcPageRoles.js — DMC PDF page classifier.
 *
 * Inputs: per-page "cheap stats" (text sample + operator count summary).
 * Output: { role, confidence } per page, plus an inferred layout variant.
 *
 * Roles per import-6 §2:
 *   cover, chart-vector-colour, chart-vector-bs, chart-combined,
 *   legend, instructions, materials, blank
 */

(function () {
  'use strict';

  // pageStats shape:
  //   {
  //     pageNum, textSample, fonts: string[],
  //     opCounts: { setFillRGBColor, fill, stroke, lineTo, constructPath,
  //                 paintImageXObject, showText, ... }
  //     hasLargeImage: boolean   // true if any image XObject is ≥ 60% of page
  //   }
  function classifyPage(stats) {
    if (!stats) return { role: 'blank', confidence: 1.0 };
    const op = stats.opCounts || {};
    const totalOps = sumValues(op);
    if (totalOps < 50) return { role: 'blank', confidence: 1.0 };

    const text = (stats.textSample || '').toLowerCase();
    const hasImage = !!stats.hasLargeImage;
    const fillCount = (op.setFillRGBColor || 0);
    const fillOps = (op.fill || 0) + (op.eoFill || 0);
    const strokeOps = (op.stroke || 0);
    const lineTo = (op.lineTo || 0) + countConstructPathLines(op);

    // Chart pages: lots of tiny fills.
    if (fillCount >= 5 && fillOps >= 1000) {
      // Many distinct fill colours = colour chart; few = backstitch overlay.
      const role = (fillCount >= 50) ? 'chart-vector-colour' : 'chart-vector-bs';
      return { role, confidence: 0.9 };
    }
    // Combined chart+legend (Layout B): lots of cells AND legend tokens.
    if (fillOps >= 500 && hasLegendTokens(text)) {
      return { role: 'chart-combined', confidence: 0.8 };
    }
    // Legend: strong legend keyword AND many code tokens.
    if (hasLegendTokens(text) && countCodeTokens(text) >= 5) {
      return { role: 'legend', confidence: 0.85 };
    }
    // Materials: fabric SKU / tool kit mentions.
    if (/\btool\s*kit\b|\bfournitures\b|\bpearl\s*cotton\b|\bmoulin(é|e)\b|\bembroidery\s*thread\b|\b1[1-9]\s*ct\b|\baida\b|\bevenweave\b|\blinen\b|\b(é|e)tamine\b/i.test(stats.textSample || '')) {
      return { role: 'materials', confidence: 0.75 };
    }
    // Cover: large image OR page 1 with title + very low ops.
    if (hasImage && fillOps < 100) {
      return { role: 'cover', confidence: 0.9 };
    }
    if (stats.pageNum === 1 && totalOps < 200 && text.length > 0) {
      return { role: 'cover', confidence: 0.6 };
    }
    // Instructions: text-heavy page mentioning starting / wash / frame.
    if (/\bwash\b|\bstart(ing)?\b|\bframe\b|\bbackstitch\b|\binstruction/i.test(stats.textSample || '')) {
      return { role: 'instructions', confidence: 0.7 };
    }
    // Fallback.
    return { role: 'instructions', confidence: 0.4 };
  }

  // Distinguish chart-vector-colour from chart-vector-bs across a pair of
  // chart pages: BS pages typically have fewer distinct fill colours and
  // more strokes than fills.
  function refineChartPair(pageA, pageB) {
    if (!pageA || !pageB) return [pageA, pageB];
    const fa = pageA.opCounts || {}, fb = pageB.opCounts || {};
    const aFill = fa.setFillRGBColor || 0, bFill = fb.setFillRGBColor || 0;
    const aStroke = fa.stroke || 0,        bStroke = fb.stroke || 0;
    // BS = more strokes than fills, and fewer distinct fill colours.
    if (aStroke > aFill * 5 && bFill > aFill) {
      return [{ ...pageA, role: 'chart-vector-bs', confidence: 0.85 },
              { ...pageB, role: 'chart-vector-colour', confidence: 0.9 }];
    }
    if (bStroke > bFill * 5 && aFill > bFill) {
      return [{ ...pageA, role: 'chart-vector-colour', confidence: 0.9 },
              { ...pageB, role: 'chart-vector-bs', confidence: 0.85 }];
    }
    return [pageA, pageB];
  }

  // Layout A vs Layout B from the set of classified pages.
  // A: separate colour + BS chart pages, separate legend page.
  // B: chart-combined pages with inline legend.
  function inferLayoutVariant(classified) {
    const hasBS = classified.some(p => p.role === 'chart-vector-bs');
    const hasCombined = classified.some(p => p.role === 'chart-combined');
    const hasSeparateLegend = classified.some(p => p.role === 'legend');
    const hasColourChart = classified.some(p => p.role === 'chart-vector-colour');
    if (hasBS || hasSeparateLegend) return 'layout-A';
    if (hasCombined) return 'layout-B';
    // A colour chart without any separate BS / legend page is combined.
    if (hasColourChart) return 'layout-B';
    return 'layout-A';
  }

  function classifyAllPages(pages) {
    const classified = pages.map(function (s) {
      const c = classifyPage(s);
      return Object.assign({}, s, c);
    });
    // Refine chart pairs.
    const charts = classified.filter(p => p.role === 'chart-vector-colour' || p.role === 'chart-vector-bs');
    if (charts.length === 2) {
      const refined = refineChartPair(charts[0], charts[1]);
      // Splice refined back.
      for (let i = 0; i < classified.length; i++) {
        if (classified[i] === charts[0]) classified[i] = refined[0];
        if (classified[i] === charts[1]) classified[i] = refined[1];
      }
    }
    const layout = inferLayoutVariant(classified);
    return { pages: classified, layout };
  }

  // ── helpers

  function sumValues(o) {
    let s = 0;
    for (const k in o) s += o[k] || 0;
    return s;
  }

  function hasLegendTokens(text) {
    if (!text) return false;
    // Strong, legend-specific keywords. "stitches" / "skeins" alone produce
    // too many false positives on materials/instructions pages.
    return /(color\s*key|colour\s*key|colour\s*chart|symbol(e)?|l(é|e)gende|leyenda|nuancier|d['ʼ]?(é|e)chevettes?)/i.test(text);
  }

  function countCodeTokens(text) {
    if (!text) return 0;
    const matches = text.match(/\b(B5200|D\d{3}|E\d{3,4}|\d{2,5})\b/g);
    return matches ? matches.length : 0;
  }

  function countConstructPathLines() {
    // We don't have detailed sub-counts inside constructPath, so this is
    // a placeholder that the operator walker can refine in production.
    return 0;
  }

  const api = { classifyPage, classifyAllPages, refineChartPair, inferLayoutVariant };

  if (typeof window !== 'undefined') {
    window.ImportEngine = Object.assign(window.ImportEngine || {}, api);
  }
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  }
})();
