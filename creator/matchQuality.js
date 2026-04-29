/* creator/matchQuality.js — Stash-Adapt match-quality utilities.
 *
 * Pure, dependency-free (in browser: relies only on rgbToLab from colour-utils
 * if needed for describeLabDiff, but accepts pre-computed Lab triples directly
 * which is what the engine always passes).
 *
 * Exposes window.MatchQuality with:
 *   TIERS                     ordered tier ids
 *   classifyMatch(deltaE, target?) → tier id
 *   tierLabel(tier)           UI string ("Exact", "Close", …)
 *   tierToken(tier)           CSS var name for the dot colour
 *   tierIsAcceptable(tier, threshold) — used by re-match logic
 *   describeLabDiff(srcLab, tgtLab) — short Lab-derived hint
 *
 * Loaded via build-creator-bundle.js BEFORE adaptationEngine.js.
 *
 * Tiers are canonical for the whole adaptation flow and replace the ad-hoc
 * good/fair/poor strings from the old SubstituteFromStashModal. See
 * reports/stash-adapt-9-interaction-spec.md §6 for thresholds.
 */

(function () {
  // Threshold boundaries (ΔE2000). A tier owns the half-open interval
  // [lower, upper). 'none' covers ≥20 OR target===null.
  var TIER_DEFS = [
    { id: 'exact', upper: 1,        label: 'Exact',    token: '--success' },
    { id: 'close', upper: 3,        label: 'Close',    token: '--success' },
    { id: 'good',  upper: 5,        label: 'Good',     token: '--success' },
    { id: 'fair',  upper: 10,       label: 'Fair',     token: '--warning' },
    { id: 'poor',  upper: 20,       label: 'Poor',     token: '--danger'  },
    { id: 'none',  upper: Infinity, label: 'No match', token: '--danger'  }
  ];
  var TIERS = TIER_DEFS.map(function (t) { return t.id; });

  function classifyMatch(deltaE, target) {
    if (target === null || target === undefined) return 'none';
    if (typeof deltaE !== 'number' || !isFinite(deltaE) || deltaE < 0) return 'none';
    for (var i = 0; i < TIER_DEFS.length; i++) {
      if (deltaE < TIER_DEFS[i].upper) return TIER_DEFS[i].id;
    }
    return 'none';
  }

  function _tierDef(tier) {
    for (var i = 0; i < TIER_DEFS.length; i++) if (TIER_DEFS[i].id === tier) return TIER_DEFS[i];
    return TIER_DEFS[TIER_DEFS.length - 1];
  }

  function tierLabel(tier) { return _tierDef(tier).label; }
  function tierToken(tier) { return _tierDef(tier).token; }

  // Returns true when the proposed target is within the user's threshold.
  // Threshold is expressed as an upper-bound ΔE (the slider value).
  function tierIsAcceptable(deltaE, threshold) {
    if (typeof deltaE !== 'number' || !isFinite(deltaE)) return false;
    return deltaE <= threshold;
  }

  // Short human description of perceptual differences, e.g. "darker, less
  // saturated". Conservative — returns "very close" when no axis crosses
  // a meaningful threshold. Used in chip tooltips.
  function describeLabDiff(srcLab, tgtLab) {
    if (!srcLab || !tgtLab || srcLab.length < 3 || tgtLab.length < 3) return '';
    var dL = tgtLab[0] - srcLab[0];
    var da = tgtLab[1] - srcLab[1];
    var db = tgtLab[2] - srcLab[2];
    var srcC = Math.sqrt(srcLab[1]*srcLab[1] + srcLab[2]*srcLab[2]);
    var tgtC = Math.sqrt(tgtLab[1]*tgtLab[1] + tgtLab[2]*tgtLab[2]);
    var dC = tgtC - srcC;

    var parts = [];

    // Lightness — strongest axis when present.
    if (Math.abs(dL) >= 5) parts.push(dL < 0 ? 'darker' : 'lighter');

    // Saturation (chroma).
    if (Math.abs(dC) >= 5) parts.push(dC < 0 ? 'less saturated' : 'more saturated');

    // Hue shift via a / b axes. Prefer the dominant axis when both move.
    if (parts.length < 2) {
      var hueParts = [];
      if (Math.abs(da) >= 5) hueParts.push({ mag: Math.abs(da), word: da > 0 ? 'redder' : 'greener' });
      if (Math.abs(db) >= 5) hueParts.push({ mag: Math.abs(db), word: db > 0 ? 'yellower' : 'bluer' });
      hueParts.sort(function (x, y) { return y.mag - x.mag; });
      for (var i = 0; i < hueParts.length && parts.length < 2; i++) parts.push(hueParts[i].word);
    }

    if (!parts.length) return 'very close match';
    return 'replacement is ' + parts.slice(0, 2).join(', ');
  }

  var api = {
    TIERS: TIERS,
    TIER_DEFS: TIER_DEFS.slice(),
    classifyMatch: classifyMatch,
    tierLabel: tierLabel,
    tierToken: tierToken,
    tierIsAcceptable: tierIsAcceptable,
    describeLabDiff: describeLabDiff
  };

  if (typeof window !== 'undefined') window.MatchQuality = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})();
