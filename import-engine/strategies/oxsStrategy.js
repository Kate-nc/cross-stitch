/* import-engine/strategies/oxsStrategy.js — wraps the existing parseOXS().
 *
 * Strategy contract from import-5 §3. Returns RawExtraction with the legacy
 * project attached as _legacyProject so the materialiser preserves
 * pre-engine behaviour bit-for-bit.
 *
 * Requires: window.parseOXS, window.importResultToProject (from
 * import-formats.js) — and DOMParser (browser-only).
 */

(function () {
  'use strict';

  const ENGINE = (typeof window !== 'undefined' && window.ImportEngine) ||
                 (typeof require === 'function' ? require('../types.js') : {});

  function getParseOXS() {
    if (typeof window !== 'undefined' && window.parseOXS) return window.parseOXS;
    return null;
  }
  function getResultToProject() {
    if (typeof window !== 'undefined' && window.importResultToProject) return window.importResultToProject;
    return null;
  }

  const oxsStrategy = {
    id: 'oxs',
    formats: ['oxs'],

    async canHandle(probe) {
      if (!probe) return 0;
      if (probe.format === 'oxs') return 0.95;
      // Heuristic — even without a sniff result, look for "<chart" / "<oxs".
      const head = headStr(probe.bytes, 512).toLowerCase();
      if (/<chart\b|<oxs\b|<\?xml/.test(head)) return 0.6;
      return 0;
    },

    async parse(probe, opts, ctx) {
      const parseOXS = getParseOXS();
      if (!parseOXS) throw ENGINE.errors.UnsupportedError('parseOXS not loaded — include import-formats.js');
      const bytes = await probe.fullBytes();
      const xml = bytesToString(bytes);
      let result;
      try {
        result = parseOXS(xml);
      } catch (e) {
        throw ENGINE.errors.ParseError(e.message || String(e), { strategy: 'oxs' });
      }
      const baseName = (probe.fileName || '').replace(/\.[^.]+$/, '');
      const r2p = getResultToProject();
      const project = r2p ? r2p(result, 14, baseName) : null;

      return {
        grid: [],         // intentionally empty: legacy materialiser uses _legacyProject
        legend: [],
        meta: { publisher: 'oxs', title: baseName },
        flags: { warnings: [], uncertainCells: 0 },
        _legacyProject: project,
        _legacyResult: result,
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

  // Self-register in browser. In Node tests the test file imports + registers manually.
  if (typeof window !== 'undefined' && window.ImportEngine && typeof window.ImportEngine.register === 'function') {
    window.ImportEngine.register(oxsStrategy);
  }
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = { oxsStrategy };
  }
})();
