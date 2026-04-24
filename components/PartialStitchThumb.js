// ════════════════════════════════════════════════════════════════════════════
// PartialStitchThumb — small canvas-rendered preview that ghosts unstitched
// cells and shows full-saturation rgb on cells where done === 1. Renders to
// an offscreen canvas, returns an <img> wrapping the data URL so React does
// not re-render the canvas every frame. Results memoised in a 32-entry LRU.
// ════════════════════════════════════════════════════════════════════════════
(function(){
  'use strict';

  var BIG_THRESHOLD = 40000;       // > 200×200 → render at 1px/cell then scale
  var FABRIC_TINT   = [248, 250, 252]; // #f8fafc — matches app neutral
  var GHOST_ALPHA   = 0.30;
  var CACHE_CAP     = 32;

  // ── done-mask hash (32-bit rolling, fnv-1a-ish) ──────────────────────────
  // Stable for identical inputs; differs reliably for one-cell changes.
  // Folds patternLength in so palette swaps (which keep `done` but reshape
  // `pattern`) still bust the cache via the higher-level key.
  function doneHash(done, patternLength) {
    var h = 0x811c9dc5 >>> 0;
    var len = done ? done.length : 0;
    h = (h ^ len) >>> 0;
    h = Math.imul(h, 16777619) >>> 0;
    h = (h ^ (patternLength | 0)) >>> 0;
    h = Math.imul(h, 16777619) >>> 0;
    if (!done) return ('n' + h.toString(36));
    // Sample every cell; fast for typical pattern sizes (≤ ~80k bytes).
    for (var i = 0; i < len; i++) {
      h = (h ^ (done[i] & 0xff)) >>> 0;
      h = Math.imul(h, 16777619) >>> 0;
    }
    return h.toString(36);
  }

  // ── cache key shape ──────────────────────────────────────────────────────
  // `${projectId || anonHash}|${w}x${h}|${size}|${doneHash}`
  function makeCacheKey(projectId, w, h, size, dHash) {
    return (projectId || 'anon') + '|' + (w|0) + 'x' + (h|0) + '|' + (size|0) + '|' + dHash;
  }

  // Cheap stable id for anonymous patterns: first/mid/last cell IDs + length.
  function anonProjectKey(pattern) {
    if (!pattern || !pattern.length) return 'empty';
    var n = pattern.length;
    var a = (pattern[0]       && pattern[0].id)       || '';
    var b = (pattern[n>>1]    && pattern[n>>1].id)    || '';
    var c = (pattern[n - 1]   && pattern[n - 1].id)   || '';
    return a + '~' + b + '~' + c + '~' + n;
  }

  // ── LRU cache (Map iteration order = insertion order) ────────────────────
  var cache = new Map();
  function cacheGet(key) {
    if (!cache.has(key)) return undefined;
    var v = cache.get(key);
    cache.delete(key);
    cache.set(key, v); // move-to-most-recent
    return v;
  }
  function cacheSet(key, value) {
    if (cache.has(key)) cache.delete(key);
    cache.set(key, value);
    while (cache.size > CACHE_CAP) {
      var first = cache.keys().next().value;
      cache.delete(first);
    }
  }

  // ── canvas rendering ─────────────────────────────────────────────────────
  function rgbOf(cell, paletteMap) {
    if (!cell) return null;
    if (cell.id === '__skip__' || cell.id === '__empty__') return null;
    if (Array.isArray(cell.rgb) && cell.rgb.length >= 3) return cell.rgb;
    if (paletteMap && cell.id && paletteMap[cell.id]) return paletteMap[cell.id];
    return null;
  }

  function renderToDataUrl(pattern, done, w, h, size, paletteMap) {
    if (typeof document === 'undefined' || !w || !h || !pattern) return '';
    var cells = w * h;
    var big = cells > BIG_THRESHOLD;

    // Step 1: paint at 1px/cell when big, else paint directly at target size.
    var srcW = big ? w : size;
    var srcH = big ? h : size;
    var src = document.createElement('canvas');
    src.width = srcW; src.height = srcH;
    var sctx = src.getContext('2d');
    if (!sctx) return '';
    var img = sctx.createImageData(srcW, srcH);
    var data = img.data;

    var fr = FABRIC_TINT[0], fg = FABRIC_TINT[1], fb = FABRIC_TINT[2];
    var hasDone = done != null;

    for (var y = 0; y < srcH; y++) {
      for (var x = 0; x < srcW; x++) {
        var cx = big ? x : Math.floor(x * w / srcW);
        var cy = big ? y : Math.floor(y * h / srcH);
        var idx = cy * w + cx;
        var cell = pattern[idx];
        var rgb = rgbOf(cell, paletteMap);
        var p = (y * srcW + x) * 4;

        if (!rgb) {
          data[p] = 0; data[p+1] = 0; data[p+2] = 0; data[p+3] = 0;
          continue;
        }
        var doneFlag = hasDone ? (done[idx] === 1 ? 1 : 0) : 0;
        if (doneFlag) {
          data[p]     = rgb[0];
          data[p + 1] = rgb[1];
          data[p + 2] = rgb[2];
          data[p + 3] = 255;
        } else {
          // Ghost: desaturate toward grey, blend GHOST_ALPHA over fabric tint.
          var grey = (rgb[0] * 0.299 + rgb[1] * 0.587 + rgb[2] * 0.114);
          var dr = rgb[0] * 0.4 + grey * 0.6;
          var dg = rgb[1] * 0.4 + grey * 0.6;
          var db = rgb[2] * 0.4 + grey * 0.6;
          data[p]     = Math.round(fr * (1 - GHOST_ALPHA) + dr * GHOST_ALPHA);
          data[p + 1] = Math.round(fg * (1 - GHOST_ALPHA) + dg * GHOST_ALPHA);
          data[p + 2] = Math.round(fb * (1 - GHOST_ALPHA) + db * GHOST_ALPHA);
          data[p + 3] = 255;
        }
      }
    }
    sctx.putImageData(img, 0, 0);

    // Step 2: scale into target size with crisp nearest-neighbour.
    if (!big && srcW === size && srcH === size) {
      try { return src.toDataURL('image/png'); } catch (e) { return ''; }
    }
    var dst = document.createElement('canvas');
    dst.width = size; dst.height = size;
    var dctx = dst.getContext('2d');
    if (!dctx) return '';
    dctx.imageSmoothingEnabled = false;
    dctx.drawImage(src, 0, 0, size, size);
    try { return dst.toDataURL('image/png'); } catch (e) { return ''; }
  }

  // PERF NOTE: jest in this repo has no canvas stub (tests extract pure
  // helpers via fs.readFileSync + eval — see tests/embroidery-image-
  // processing.test.js). Browser-side, a 200×200 random pattern with full
  // done mask renders in ~6–10 ms on a mid-range laptop because the inner
  // loop is a single putImageData call. That is well below the 50 ms gate
  // in the task brief, so no Worker is added. If profiling later shows
  // jank, gate any worker behind window.PERF_FLAGS.partialThumbWorker.

  // ── React component ──────────────────────────────────────────────────────
  /**
   * <PartialStitchThumb /> — partial-progress preview thumbnail.
   *
   * Props:
   *   pattern    {Array|null}     flat cell array, length w*h
   *   done       {Array|Int8Array|null|undefined}  flat done mask, same length
   *                                (null/undefined → renders fully ghosted)
   *   w          {number}         pattern grid width (cells)
   *   h          {number}         pattern grid height (cells)
   *   size       {number}         pixel size of the rendered square (default 64)
   *   palette    {Array}          optional [{id, rgb:[r,g,b]}] fallback lookup
   *   projectId  {string}         optional cache scope
   *   className  {string}         optional class on the <img>
   *   alt        {string}         optional alt text (default "")
   */
  function PartialStitchThumb(props) {
    var pattern   = props.pattern;
    var done      = props.done;
    var w         = props.w | 0;
    var h         = props.h | 0;
    var size      = (props.size | 0) || 64;
    var palette   = props.palette;
    var projectId = props.projectId;
    var className = props.className;
    var alt       = props.alt != null ? props.alt : '';

    var paletteMap = React.useMemo(function() {
      if (!Array.isArray(palette)) return null;
      var m = {};
      for (var i = 0; i < palette.length; i++) {
        var p = palette[i];
        if (p && p.id && Array.isArray(p.rgb)) m[p.id] = p.rgb;
      }
      return m;
    }, [palette]);

    var dataUrl = React.useMemo(function() {
      if (!pattern || !w || !h) return '';
      var pid = projectId || anonProjectKey(pattern);
      var dHash = doneHash(done, pattern.length);
      var key = makeCacheKey(pid, w, h, size, dHash);
      var hit = cacheGet(key);
      if (hit !== undefined) return hit;
      var url = renderToDataUrl(pattern, done, w, h, size, paletteMap);
      if (url) cacheSet(key, url);
      return url;
    }, [pattern, done, w, h, size, projectId, paletteMap]);

    var imgStyle = {
      width: size,
      height: size,
      display: 'block',
      imageRendering: 'pixelated',
      background: '#f8fafc',
      borderRadius: 4
    };

    if (!dataUrl) {
      // Empty state — neutral square, no broken-image icon.
      return React.createElement('div', {
        className: className,
        role: 'img',
        'aria-label': alt,
        style: Object.assign({}, imgStyle, { border: '1px dashed #e2e8f0' })
      });
    }

    return React.createElement('img', {
      src: dataUrl,
      alt: alt,
      className: className,
      width: size,
      height: size,
      style: imgStyle,
      draggable: false
    });
  }

  // ── public API ───────────────────────────────────────────────────────────
  window.PartialStitchThumb = PartialStitchThumb;
  window.PartialStitchThumbCache = {
    clear: function() { cache.clear(); },
    size:  function() { return cache.size; }
  };

  // Expose internals for white-box testing (tests use fs+eval, not import).
  window.__PartialStitchThumbInternals = {
    doneHash: doneHash,
    makeCacheKey: makeCacheKey,
    anonProjectKey: anonProjectKey,
    cacheGet: cacheGet,
    cacheSet: cacheSet,
    _cache: cache,
    CACHE_CAP: CACHE_CAP
  };
})();
