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
    parse: function (file, ctx) {
      if (typeof window === 'undefined' || typeof window.PatternKeeperImporter !== 'function') {
        return Promise.reject(new Error('PatternKeeperImporter is not loaded.'));
      }
      // Make sure pdf.js is available (the loader is lazily injected).
      var ready = (typeof window.loadPdfStack === 'function')
        ? window.loadPdfStack()
        : Promise.resolve();
      return ready.then(function () {
        var importer = new window.PatternKeeperImporter();
        return importer.import(file).then(function (project) {
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
