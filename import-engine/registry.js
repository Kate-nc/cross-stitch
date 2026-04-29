/* import-engine/registry.js — strategy registration + selection.
 *
 * Strategies attach themselves at load time:
 *   window.ImportEngine.register({ id, formats, canHandle, parse });
 *
 * Selection uses the highest canHandle() score; ties broken by registration
 * order (first wins). The pipeline never mentions a strategy by id — strategy
 * selection is what fixes the "every format hardcoded" problem documented in
 * reports/import-1-existing-system.md.
 */

(function () {
  'use strict';

  const strategies = [];

  function register(strategy) {
    if (!strategy || typeof strategy !== 'object') {
      throw new Error('register: strategy must be an object');
    }
    if (typeof strategy.id !== 'string' || !strategy.id) {
      throw new Error('register: strategy.id required');
    }
    if (typeof strategy.canHandle !== 'function') {
      throw new Error('register: strategy.canHandle required');
    }
    if (typeof strategy.parse !== 'function') {
      throw new Error('register: strategy.parse required');
    }
    // Replace existing registration with the same id (hot-swappable for tests).
    const existing = strategies.findIndex(s => s.id === strategy.id);
    if (existing >= 0) strategies[existing] = strategy;
    else strategies.push(strategy);
    return strategy;
  }

  function unregister(id) {
    const i = strategies.findIndex(s => s.id === id);
    if (i >= 0) strategies.splice(i, 1);
  }

  function listStrategies() {
    return strategies.slice();
  }

  // Return all strategies that score > 0 for this probe, sorted by score desc.
  async function rank(probe) {
    const scored = [];
    for (let i = 0; i < strategies.length; i++) {
      const s = strategies[i];
      if (s.formats && probe && probe.format && s.formats.indexOf(probe.format) === -1) continue;
      let score;
      try { score = await s.canHandle(probe); }
      catch (e) { score = 0; }
      if (typeof score === 'number' && score > 0) {
        scored.push({ strategy: s, score: score, order: i });
      }
    }
    scored.sort((a, b) => (b.score - a.score) || (a.order - b.order));
    return scored;
  }

  async function pick(probe) {
    const ranked = await rank(probe);
    return ranked.length ? ranked[0].strategy : null;
  }

  const api = { register, unregister, listStrategies, rank, pick };

  if (typeof window !== 'undefined') {
    window.ImportEngine = Object.assign(window.ImportEngine || {}, api);
  }
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  }
})();
