/* import-engine/pdf/publishers.js — publisher fingerprint table.
 *
 * Returns the best-matching publisher record for a PDF, given the doc info
 * dictionary, XMP metadata, and a small text-content sample. Used by the
 * DMC strategy's canHandle() and for routing in classify().
 *
 * Each entry has:
 *   id         — short identifier
 *   match      — predicate fn ({ info, xmp, sample, fonts }) → boolean
 *   confidence — score returned when match() is true
 */

(function () {
  'use strict';

  const PUBLISHERS = [
    {
      id: 'dmc',
      match: function (probe) {
        // DMC patterns: the cover page consistently mentions "DMC" as
        // creator/producer or in the body text. The Books_and_Blossoms
        // publisher is "DMC Studio" in the metadata; the in-body title
        // block prints "DMC Studio".
        const meta = stringSearch(probe, ['DMC Creative', 'DMC Studio', 'DMC ', 'DMC, Inc']);
        if (meta) return true;
        const body = (probe.sample || '').toLowerCase();
        return body.indexOf('dmc') >= 0 && body.indexOf('color key') >= 0;
      },
      confidence: 0.95,
    },
    {
      id: 'flosscross',
      match: function (probe) {
        const m = stringSearch(probe, ['FlossCross', 'flosscross']);
        return !!m;
      },
      confidence: 0.9,
    },
    {
      id: 'patternkeeper',
      match: function (probe) {
        const m = stringSearch(probe, ['PatternKeeper', 'Pattern Keeper']);
        return !!m;
      },
      confidence: 0.9,
    },
    {
      id: 'kgchart',
      match: function (probe) {
        const m = stringSearch(probe, ['KG-Chart', 'KGChart']);
        return !!m;
      },
      confidence: 0.85,
    },
  ];

  function detectPublisher(probe) {
    probe = probe || {};
    for (const p of PUBLISHERS) {
      try {
        if (p.match(probe)) return { id: p.id, confidence: p.confidence };
      } catch (_) {}
    }
    return { id: 'unknown', confidence: 0 };
  }

  function stringSearch(probe, needles) {
    const haystack = collectStrings(probe).toLowerCase();
    for (const n of needles) {
      if (haystack.indexOf(String(n).toLowerCase()) >= 0) return true;
    }
    return false;
  }

  function collectStrings(probe) {
    const parts = [];
    const info = probe.info || {};
    for (const k in info) parts.push(String(info[k] || ''));
    const xmp = probe.xmp || {};
    for (const k in xmp) parts.push(String(xmp[k] || ''));
    if (probe.sample) parts.push(String(probe.sample));
    if (Array.isArray(probe.fonts)) parts.push(probe.fonts.join(' '));
    return parts.join(' \n ');
  }

  const api = { detectPublisher, _PUBLISHERS: PUBLISHERS };

  if (typeof window !== 'undefined') {
    window.ImportEngine = Object.assign(window.ImportEngine || {}, api);
  }
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  }
})();
