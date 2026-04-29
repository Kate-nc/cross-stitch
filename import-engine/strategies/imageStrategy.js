/* import-engine/strategies/imageStrategy.js — wraps parseImagePattern().
 *
 * Image parsing requires a real <canvas> + an HTMLImageElement, so the
 * strategy decodes the bytes into a Blob → object URL → Image, then calls
 * the existing parseImagePattern. Outside the browser this strategy is
 * effectively inert (canHandle returns 0 if no document is available).
 */

(function () {
  'use strict';

  const ENGINE = (typeof window !== 'undefined' && window.ImportEngine) ||
                 (typeof require === 'function' ? require('../types.js') : {});

  function getParseImage() {
    if (typeof window !== 'undefined' && window.parseImagePattern) return window.parseImagePattern;
    return null;
  }
  function getResultToProject() {
    if (typeof window !== 'undefined' && window.importResultToProject) return window.importResultToProject;
    return null;
  }

  const imageStrategy = {
    id: 'image',
    formats: ['image'],

    async canHandle(probe) {
      if (!probe) return 0;
      if (typeof document === 'undefined') return 0;
      if (probe.format === 'image') return 0.85;
      return 0;
    },

    async parse(probe, opts, ctx) {
      const parseImagePattern = getParseImage();
      if (!parseImagePattern) {
        throw ENGINE.errors.UnsupportedError('parseImagePattern not loaded — include import-formats.js');
      }
      const bytes = await probe.fullBytes();
      const blob = new Blob([bytes], { type: probe.mimeType || 'application/octet-stream' });
      const url = URL.createObjectURL(blob);

      try {
        const img = await loadImage(url);
        const result = parseImagePattern(img, opts && opts.image || {});
        const baseName = (probe.fileName || '').replace(/\.[^.]+$/, '');
        const r2p = getResultToProject();
        const project = r2p ? r2p(result, 14, baseName) : null;

        return {
          grid: [],
          legend: [],
          meta: { publisher: 'image', title: baseName },
          flags: { warnings: [], uncertainCells: 0 },
          _legacyProject: project,
          _legacyResult: result,
        };
      } finally {
        URL.revokeObjectURL(url);
      }
    },
  };

  function loadImage(url) {
    return new Promise(function (resolve, reject) {
      const img = new Image();
      img.onload = function () { resolve(img); };
      img.onerror = function () { reject(ENGINE.errors.ParseError('Could not decode image', { strategy: 'image' })); };
      img.src = url;
    });
  }

  if (typeof window !== 'undefined' && window.ImportEngine && typeof window.ImportEngine.register === 'function') {
    window.ImportEngine.register(imageStrategy);
  }
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = { imageStrategy };
  }
})();
