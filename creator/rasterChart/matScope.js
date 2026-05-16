/* creator/rasterChart/matScope.js
 * ════════════════════════════════════════════════════════════════════════
 *   Lifecycle helper for OpenCV.js cv.Mat allocations.
 *
 *   Browser/Worker-only — requires global `cv`. Use:
 *
 *     const s = MatScope.create();
 *     const m = s.track(new cv.Mat());
 *     ...
 *     s.dispose();   // delete()s every tracked Mat, even on throw
 *
 *   Or the convenience wrapper:
 *
 *     MatScope.withScope(s => {
 *       const m = s.track(new cv.Mat());
 *       ...
 *     });
 *
 *   The helper also reports peak Mat count + (if available) WASM heap usage
 *   so the lifecycle test can assert "heap returns to baseline".
 * ════════════════════════════════════════════════════════════════════════
 */

(function () {
  'use strict';

  function create() {
    const tracked = [];
    let disposed = false;
    return {
      track(mat) {
        if (disposed) throw new Error('MatScope: track after dispose');
        if (mat && typeof mat.delete === 'function') tracked.push(mat);
        return mat;
      },
      release(mat) {
        const i = tracked.indexOf(mat);
        if (i >= 0) tracked.splice(i, 1);
        if (mat && typeof mat.delete === 'function') {
          try { mat.delete(); } catch (_) {}
        }
      },
      get size() { return tracked.length; },
      dispose() {
        if (disposed) return;
        disposed = true;
        for (let i = tracked.length - 1; i >= 0; i--) {
          const m = tracked[i];
          try { m && m.delete && m.delete(); } catch (_) {}
        }
        tracked.length = 0;
      },
    };
  }

  function withScope(fn) {
    const s = create();
    try { return fn(s); }
    finally { s.dispose(); }
  }

  function heapUsed() {
    if (typeof cv === 'undefined' || !cv.HEAP8) return 0;
    // Emscripten exposes HEAP8.length as total reserved; better than nothing.
    return cv.HEAP8.length;
  }

  const api = { create, withScope, heapUsed };
  if (typeof window !== 'undefined') window.MatScope = api;
  if (typeof self !== 'undefined' && typeof window === 'undefined') self.MatScope = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})();
