/* import-engine/strategies/pdfGlyphStrategy.js — Wrap legacy Pattern Keeper PDF importer.
 *
 * Bridges the existing PatternKeeperImporter (pdf-importer.js) into the new
 * strategy registry so the engine can pick it for glyph-style PDFs. The
 * legacy importer is the only path proven against Pattern Keeper PDFs and
 * is bit-stable — we don't reimplement it; we simply adopt it.
 *
 * The strategy returns a RawExtraction with `_legacyProject` set, so the
 * pipeline's defaultMaterialise will pass the project through untouched.
 */

(function () {
  'use strict';

  function looksLikePdf(probe) {
    if (!probe) return false;
    if (probe.format === 'pdf') return true;
    var name = (probe.name || '').toLowerCase();
    return name.endsWith('.pdf');
  }

  var pdfGlyphStrategy = {
    id: 'pdf-glyph',
    formats: ['pdf'],
    canHandle: function (probe) {
      if (!looksLikePdf(probe)) return 0;
      // Lower than DMC (0.95) and FlossCross (0.9) — only chosen when the
      // publisher detector hasn't found a richer publisher.
      return 0.7;
    },
    parse: function (probe, opts, ctx) {
      if (typeof window === 'undefined') {
        return Promise.reject(new Error('PDF import requires a browser environment.'));
      }
      // Lazy-load pdf.js + pdf-importer.js. Some entry pages (e.g. home.html)
      // don't expose `window.loadPdfStack`, so we fall back to a self-contained
      // loader that fetches the same scripts in the same order.
      function loadScript(src) {
        if (document.querySelector('script[data-import-engine="' + src + '"]')) {
          return Promise.resolve();
        }
        return new Promise(function (resolve, reject) {
          var s = document.createElement('script');
          s.src = src;
          s.dataset.importEngine = src;
          s.onload = function () { resolve(); };
          s.onerror = function () { reject(new Error('Failed to load ' + src)); };
          document.head.appendChild(s);
        });
      }
      var ready;
      if (typeof window.loadPdfStack === 'function') {
        ready = window.loadPdfStack();
      } else {
        ready = loadScript('https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js')
          .then(function () {
            if (typeof window.pdfjsLib !== 'undefined') {
              window.pdfjsLib.GlobalWorkerOptions.workerSrc = 'pdf.worker.min.js';
            }
            return loadScript('pdf-importer.js');
          });
      }
      return ready.then(function () {
        if (typeof window.PatternKeeperImporter !== 'function') {
          throw new Error('PatternKeeperImporter is not loaded.');
        }
        var importer = new window.PatternKeeperImporter();
        // Prefer the original File when present; fall back to bytes so the
        // strategy still works for synthetic probes.
        var input = (probe && probe.originalFile)
          ? probe.originalFile
          : (probe && typeof probe.fullBytes === 'function'
            ? probe.fullBytes().then(function (b) { return b.buffer || b; })
            : null);
        if (!input) {
          throw new Error('PDF import received no readable input.');
        }
        return Promise.resolve(input).then(function (resolved) {
          return importer.import(resolved);
        }).then(function (project) {
          // Legacy importer returns a fully-formed v8 project. Adapt to
          // the engine's RawExtraction contract via `_legacyProject`.
          return {
            width: project.w || (project.settings && project.settings.sW) || 0,
            height: project.h || (project.settings && project.settings.sH) || 0,
            cells: [],
            legend: { rows: [], codes: new Set(), byGlyph: new Map() },
            confidence: { format: 0.85, palette: [], grid: 0.85 },
            _legacyProject: project,
          };
        });
      });
    },
  };

  // Self-register when the engine is loaded.
  if (typeof window !== 'undefined' && window.ImportEngine && typeof window.ImportEngine.register === 'function') {
    try { window.ImportEngine.register(pdfGlyphStrategy); } catch (_) {}
  }

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = { pdfGlyphStrategy: pdfGlyphStrategy };
  }
})();
