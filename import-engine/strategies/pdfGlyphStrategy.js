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
        // Match BOTH our marker and any pre-existing <script src=...> the
        // page might have injected (e.g. via loadPdfStack). Top-level class
        // declarations in pdf-importer.js can't be redeclared without a
        // SyntaxError, so duplicate injection must be avoided.
        if (document.querySelector('script[src="' + src + '"]') ||
            document.querySelector('script[data-import-engine="' + src + '"]')) {
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
        // pdf-importer.js declares `class PatternKeeperImporter` at the
        // top level of a classic script. ES2015+ top-level classes create
        // lexical bindings in the global scope but are NOT exposed as
        // properties of `window`. We resolve via the bare name through
        // an indirect eval (which runs in the global lexical environment)
        // so we pick up the lexical binding.
        var Ctor;
        try {
          Ctor = (0, eval)('typeof PatternKeeperImporter === "function" ? PatternKeeperImporter : null');
        } catch (_) { Ctor = null; }
        if (typeof Ctor !== 'function') {
          throw new Error('PatternKeeperImporter is not loaded.');
        }
        var importer = new Ctor();
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
