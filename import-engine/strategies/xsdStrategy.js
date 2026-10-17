/* XSD version-gated binary import. Extension recognition is only routing. */
(function () {
  'use strict';
  const E = typeof window !== 'undefined' ? window.ImportEngine : require('../types.js');
  const F = typeof window !== 'undefined' ? window.ImportEngine : require('../formats/xsd.js');
  const xsdStrategy = {
    id: 'xsd', formats: ['xsd'],
    async canHandle(probe) { return probe && probe.format === 'xsd' ? 1 : 0; },
    async parse(probe) {
      if (typeof window !== 'undefined' && typeof window.loadAnchorData === 'function') {
        try { await window.loadAnchorData(); } catch (_) { /* Unresolved Anchor identities are counted by the parser. */ }
      }
      const opts = { name: (probe.fileName || '').replace(/\.[^.]+$/, ''),
        dmc: typeof DMC !== 'undefined' ? DMC : [], anchor: typeof ANCHOR !== 'undefined' ? ANCHOR : [],
        rgbToLab: typeof rgbToLab === 'function' ? rgbToLab : null };
      if (probe.originalFile && probe.originalFile.size > F.XSD_LIMITS.bytes) throw E.errors.ParseError('XSD exceeds the 16 MiB input limit', { strategy: 'xsd' });
      return F.parseXSD(await probe.fullBytes(), opts);
    },
  };
  if (typeof window !== 'undefined' && E.register) E.register(xsdStrategy);
  if (typeof module !== 'undefined' && module.exports) module.exports = { xsdStrategy };
})();
