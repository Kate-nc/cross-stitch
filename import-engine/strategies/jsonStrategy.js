/* import-engine/strategies/jsonStrategy.js — direct project-JSON import.
 *
 * Mirrors the JSON branch in tracker-app.js loadProject(): parses, validates
 * the v8 shape's "pattern" field, fills in id/createdAt if missing, and hands
 * the project to the materialiser via _legacyProject.
 */

(function () {
  'use strict';

  const ENGINE = (typeof window !== 'undefined' && window.ImportEngine) ||
                 (typeof require === 'function' ? require('../types.js') : {});

  function newId() {
    if (typeof window !== 'undefined' && window.ProjectStorage && window.ProjectStorage.newId) {
      return window.ProjectStorage.newId();
    }
    return 'proj_' + Date.now();
  }

  const jsonStrategy = {
    id: 'json',
    formats: ['json'],

    async canHandle(probe) {
      if (!probe) return 0;
      if (probe.format === 'json') return 0.95;
      const head = headStr(probe.bytes, 64).trimStart();
      if (head.startsWith('{') || head.startsWith('[')) return 0.5;
      return 0;
    },

    async parse(probe, opts, ctx) {
      const bytes = await probe.fullBytes();
      const text = bytesToString(bytes);
      let project;
      try { project = JSON.parse(text); }
      catch (e) {
        throw ENGINE.errors.ParseError('Invalid JSON: ' + e.message, { strategy: 'json' });
      }
      const patternField = project.pattern || project.p;
      if (!patternField || !Array.isArray(patternField)) {
        throw ENGINE.errors.ParseError("Invalid pattern file: 'pattern' field missing or not an array", { strategy: 'json' });
      }
      if (!project.id) project.id = newId();
      if (!project.createdAt) project.createdAt = new Date().toISOString();
      // Normalise old "p" field to "pattern" so downstream code sees v8 shape.
      if (!project.pattern && project.p) project.pattern = project.p;

      return {
        grid: [],
        legend: [],
        meta: {
          publisher: 'json',
          title: project.name || (probe.fileName || '').replace(/\.[^.]+$/, ''),
        },
        flags: { warnings: [], uncertainCells: 0 },
        _legacyProject: project,
      };
    },
  };

  function headStr(bytes, n) {
    if (!bytes) return '';
    const end = Math.min(bytes.length, n);
    let s = '';
    for (let i = 0; i < end; i++) s += String.fromCharCode(bytes[i]);
    return s;
  }
  function bytesToString(bytes) {
    if (typeof TextDecoder !== 'undefined') return new TextDecoder('utf-8').decode(bytes);
    let s = '';
    for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
    return s;
  }

  if (typeof window !== 'undefined' && window.ImportEngine && typeof window.ImportEngine.register === 'function') {
    window.ImportEngine.register(jsonStrategy);
  }
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = { jsonStrategy };
  }
})();
