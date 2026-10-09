/* creator/CompareOptions.js — pure helpers for the Compare options strip
 * (audit IMG-05): which neighbouring settings to show, how to cache their
 * previews, and the stats under each.
 *
 *   compareOptionsFor(dimension, s)   dimension 'size' (−25 %, current,
 *                                     +25 %) or 'threads' (−5, current, +5);
 *                                     s = { sW, sH, maxC, arLock, ar }. Sizes
 *                                     stay within 10–500 stitches, threads
 *                                     within 2–100. With the aspect lock the
 *                                     height comes from the width exactly as
 *                                     chgW works it out, so the size shown is
 *                                     the size applied.
 *   compareCacheKey(imgKey, settings, values)
 *                                     one string per picture, conversion
 *                                     settings and option.
 *   comparePreviewDims(w, h)          the reduced size a preview job runs at
 *                                     (never more than 100 × 100 cells).
 *   compareStats(pal, stitchedCells, confettiPct, full, dims)
 *                                     { stitches, threads, tier }: pal and
 *                                     stitchedCells at the preview size,
 *                                     full = { w, h } of the option, dims =
 *                                     { pw, ph } it ran at.
 *   compareHours(stitches, stitchSpeed) estimated hours (not cached, so a
 *                                     change of speed shows at once).
 *
 * Loaded as a plain <script> (concatenated into creator/bundle.js); also
 * require()-able for tests.
 */
(function (root) {
  var SIZE_STEPS = [-0.25, 0, 0.25];
  var THREAD_STEPS = [-5, 0, 5];
  var MIN_ST = 10, MAX_ST = 500, MIN_THREADS = 2, MAX_THREADS = 100;
  // Each preview job runs at no more than this many cells (100 × 100).
  var COMPARE_MAX_AREA = 10000;

  function clamp(n, lo, hi) { return Math.max(lo, Math.min(hi, Math.round(n))); }

  function compareOptionsFor(dimension, s) {
    var opts;
    if (dimension === 'threads') {
      opts = THREAD_STEPS.map(function (step) {
        var m = clamp((s.maxC || 0) + step, MIN_THREADS, MAX_THREADS);
        return {
          id: step < 0 ? 'minus' : step > 0 ? 'plus' : 'current',
          label: step === 0 ? 'Current' : (step < 0 ? '−' : '+') + Math.abs(step) + ' threads',
          current: step === 0,
          values: { maxC: m }
        };
      });
    } else {
      var locked = s.arLock && s.ar > 0;
      opts = SIZE_STEPS.map(function (step) {
        var f = 1 + step;
        var w = step === 0 ? s.sW : clamp(s.sW * f, MIN_ST, MAX_ST);
        // Locked: the height chgW(w) gives; unlocked: each side scaled.
        var hgt = step === 0 ? s.sH : locked ? clamp(w / s.ar, MIN_ST, MAX_ST) : clamp(s.sH * f, MIN_ST, MAX_ST);
        return {
          id: step < 0 ? 'minus' : step > 0 ? 'plus' : 'current',
          label: step === 0 ? 'Current' : (step < 0 ? '−' : '+') + Math.round(Math.abs(step) * 100) + '%',
          current: step === 0,
          values: { sW: w, sH: hgt }
        };
      });
    }
    // At a limit a neighbour can equal the current setting; it is shown but
    // can't be chosen.
    var cur = opts[1].values;
    opts.forEach(function (o) {
      o.same = !o.current && Object.keys(o.values).every(function (k) { return o.values[k] === cur[k]; });
    });
    return opts;
  }

  // Settings that change a preview, as a stable string. The stash palette is
  // reduced to its thread ids.
  function settingsSignature(settings) {
    if (!settings) return '';
    var keys = Object.keys(settings).sort();
    return keys.map(function (k) {
      var v = settings[k];
      if (k === 'allowedPalette') {
        v = Array.isArray(v) ? v.map(function (t) { return (t && (t.brand || 'dmc') + ':' + t.id) || ''; }).join(',') : '';
      } else if (typeof v === 'function') {
        return '';
      }
      return k + '=' + JSON.stringify(v);
    }).join('|');
  }

  function compareCacheKey(imgKey, settings, values) {
    var v = values || {};
    var parts = Object.keys(v).sort().map(function (k) { return k + '=' + v[k]; });
    return String(imgKey) + '#' + settingsSignature(settings) + '#' + parts.join('&');
  }

  function comparePreviewDims(w, h) {
    var pw = w, ph = h;
    if (pw * ph > COMPARE_MAX_AREA) {
      // Rounded down, so the job never goes over the cap.
      var sc = Math.sqrt(COMPARE_MAX_AREA / (pw * ph));
      pw = Math.floor(pw * sc); ph = Math.floor(ph * sc);
    }
    return { pw: Math.max(1, pw), ph: Math.max(1, ph) };
  }

  // pal: palette entries with counts at the preview size; stitchedCells:
  // stitched cells at the preview size; confettiPct from the pipeline.
  function compareStats(pal, stitchedCells, confettiPct, full, dims) {
    var scale = (full.w * full.h) / Math.max(1, dims.pw * dims.ph);
    var stitches = Math.round(stitchedCells * scale);
    var threads = (typeof root.creatorThreadCounts === 'function')
      ? root.creatorThreadCounts(pal).threads
      : (pal || []).filter(function (p) { return p && p.id !== '__skip__'; }).length;
    var tier = (typeof root.confettiTier === 'function' && confettiPct != null) ? root.confettiTier(confettiPct).label : null;
    return { stitches: stitches, threads: threads, tier: tier };
  }

  function compareHours(stitches, stitchSpeed) {
    return stitchSpeed > 0 ? stitches / stitchSpeed : null;
  }

  var api = {
    compareOptionsFor: compareOptionsFor, compareCacheKey: compareCacheKey,
    comparePreviewDims: comparePreviewDims, compareStats: compareStats, compareHours: compareHours,
    COMPARE_MAX_AREA: COMPARE_MAX_AREA
  };
  Object.keys(api).forEach(function (k) { root[k] = api[k]; });
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
