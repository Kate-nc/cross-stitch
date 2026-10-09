/* creator/CompareOptions.js — pure helpers for the Compare options strip
 * (audit IMG-05): which neighbouring settings to show, how to cache their
 * previews, and the stats under each.
 *
 *   compareOptionsFor(dimension, s)   dimension 'size' (−25 %, current,
 *                                     +25 %) or 'threads' (−5, current, +5);
 *                                     s = { sW, sH, maxC }. Sizes stay within
 *                                     10–500 stitches, threads within 2–100.
 *   compareCacheKey(imgKey, settings, values)
 *                                     one string per picture, conversion
 *                                     settings and option.
 *   comparePreviewDims(w, h)          the reduced size a preview job runs at.
 *   compareStats(pal, mappedLen, opt, dims, stitchSpeed)
 *                                     { stitches, threads, hours, tier }.
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
      opts = SIZE_STEPS.map(function (step) {
        var f = 1 + step;
        return {
          id: step < 0 ? 'minus' : step > 0 ? 'plus' : 'current',
          label: step === 0 ? 'Current' : (step < 0 ? '−' : '+') + Math.round(Math.abs(step) * 100) + '%',
          current: step === 0,
          values: { sW: clamp(s.sW * f, MIN_ST, MAX_ST), sH: clamp(s.sH * f, MIN_ST, MAX_ST) }
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
      var sc = Math.sqrt(COMPARE_MAX_AREA / (pw * ph));
      pw = Math.round(pw * sc); ph = Math.round(ph * sc);
    }
    return { pw: Math.max(1, pw), ph: Math.max(1, ph) };
  }

  // pal: palette entries with counts at the preview size; stitchedCells:
  // stitched cells at the preview size; confettiPct from the pipeline.
  function compareStats(pal, stitchedCells, confettiPct, full, dims, stitchSpeed) {
    var scale = (full.w * full.h) / Math.max(1, dims.pw * dims.ph);
    var stitches = Math.round(stitchedCells * scale);
    var threads = (typeof root.creatorThreadCounts === 'function')
      ? root.creatorThreadCounts(pal).threads
      : (pal || []).filter(function (p) { return p && p.id !== '__skip__'; }).length;
    var hours = stitchSpeed > 0 ? stitches / stitchSpeed : null;
    var tier = (typeof root.confettiTier === 'function' && confettiPct != null) ? root.confettiTier(confettiPct).label : null;
    return { stitches: stitches, threads: threads, hours: hours, tier: tier };
  }

  var api = {
    compareOptionsFor: compareOptionsFor, compareCacheKey: compareCacheKey,
    comparePreviewDims: comparePreviewDims, compareStats: compareStats,
    COMPARE_MAX_AREA: COMPARE_MAX_AREA
  };
  Object.keys(api).forEach(function (k) { root[k] = api[k]; });
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
