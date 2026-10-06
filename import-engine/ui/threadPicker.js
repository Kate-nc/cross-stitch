/* import-engine/ui/threadPicker.js — finding a thread for a colour in the
 * import review, as pure functions.
 *
 * The review's Palette tab lets the stitcher give any colour a thread: by
 * typing its number, by picking a colour already in the chart, by picking one
 * of the threads nearest the colour, or by browsing DMC's colour families.
 * Charts and patterns store DMC numbers, so an Anchor number is converted to
 * its DMC equivalent — the published conversion where there is one, else the
 * nearest DMC colour — and the stitcher is told which.
 *
 * The thread tables are the app's own globals (DMC from dmc-data.js; ANCHOR and
 * getOfficialMatch from anchor-data.js and thread-conversions.js, which load on
 * demand). Each function takes them as an optional last argument instead, so
 * it is tested directly (tests/import/threadPicker.test.js).
 */

(function () {
  'use strict';

  var root = typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : {});

  /* dmc-data.js declares its table with a top-level const, which is a global
   * but not a property of window. */
  function globalDmc() {
    if (root.DMC) return root.DMC;
    // eslint-disable-next-line no-undef
    return typeof DMC !== 'undefined' ? DMC : null;
  }

  function tables(cat) {
    cat = cat || {};
    return {
      dmc: ('dmc' in cat ? cat.dmc : globalDmc()) || [],
      anchor: ('anchor' in cat ? cat.anchor : root.ANCHOR) || null,
      match: ('match' in cat ? cat.match : root.getOfficialMatch) || null,
    };
  }

  /* DMC's colour families, in the order dmc-data.js numbers them. */
  var FAMILIES = [
    { id: 1, name: 'Reds' }, { id: 2, name: 'Pinks' }, { id: 3, name: 'Roses' },
    { id: 4, name: 'Mauves' }, { id: 5, name: 'Purples' }, { id: 6, name: 'Blues' },
    { id: 7, name: 'Pale blues' }, { id: 8, name: 'Teals' }, { id: 9, name: 'Sea greens' },
    { id: 10, name: 'Greens' }, { id: 11, name: 'Yellow greens' }, { id: 12, name: 'Olives' },
    { id: 13, name: 'Golds' }, { id: 14, name: 'Yellows and oranges' }, { id: 15, name: 'Coppers' },
    { id: 16, name: 'Peaches' }, { id: 17, name: 'Browns' }, { id: 18, name: 'Whites and beiges' },
    { id: 19, name: 'Greys' },
  ];

  function labOf(t) {
    if (t.lab) return t.lab;
    if (typeof root.rgbToLab === 'function') return root.rgbToLab(t.rgb[0], t.rgb[1], t.rgb[2]);
    return [0.3 * t.rgb[0] + 0.59 * t.rgb[1] + 0.11 * t.rgb[2], t.rgb[0] - t.rgb[1], t.rgb[1] - t.rgb[2]];
  }
  function labDist(a, b) {
    var d0 = a[0] - b[0], d1 = a[1] - b[1], d2 = a[2] - b[2];
    return Math.sqrt(d0 * d0 + d1 * d1 + d2 * d2);
  }

  /* A DMC thread by its number, ignoring case and leading spaces. */
  function findDmc(code, cat) {
    var c = String(code == null ? '' : code).trim().toLowerCase();
    if (!c) return null;
    var dmc = tables(cat).dmc;
    for (var i = 0; i < dmc.length; i++) if (String(dmc[i].id).toLowerCase() === c) return dmc[i];
    return null;
  }

  /* The `n` DMC threads nearest an RGB colour, nearest first, leaving out the
   * ids in `exclude`. */
  function nearestDmc(rgb, n, exclude, cat) {
    var dmc = tables(cat).dmc;
    var target = labOf({ rgb: rgb });
    var skip = {};
    (exclude || []).forEach(function (id) { skip[String(id).toLowerCase()] = true; });
    return dmc
      .filter(function (t) { return !skip[String(t.id).toLowerCase()]; })
      .map(function (t) { return { t: t, d: labDist(labOf(t), target) }; })
      .sort(function (a, b) { return a.d - b.d; })
      .slice(0, n)
      .map(function (x) { return x.t; });
  }

  /* The DMC family a colour belongs to: its nearest thread's. */
  function familyOf(rgb, cat) {
    var near = nearestDmc(rgb, 1, null, cat)[0];
    return (near && near.fam) || 1;
  }

  /* One family's threads, lightest first. */
  function familyThreads(fam, cat) {
    return tables(cat).dmc
      .filter(function (t) { return t.fam === fam; })
      .slice()
      .sort(function (a, b) { return labOf(b)[0] - labOf(a)[0]; });
  }

  /* An Anchor number as a DMC thread.
   * Returns null when the Anchor table has no such number, else
   *   { anchor, dmc, how } where how is the conversion's confidence
   *   ('official', 'reconciled', 'single-source') or 'nearest' colour. */
  function fromAnchor(code, cat) {
    var T = tables(cat);
    var c = String(code == null ? '' : code).trim();
    if (!c || !T.anchor) return null;
    var anchor = null;
    for (var i = 0; i < T.anchor.length; i++) if (String(T.anchor[i].id) === c) { anchor = T.anchor[i]; break; }
    if (!anchor) return null;
    var m = T.match ? T.match('anchor', anchor.id, 'dmc') : null;
    var dmc = m ? findDmc(m.id, cat) : null;
    if (dmc) return { anchor: anchor, dmc: dmc, how: m.confidence || 'official' };
    var near = nearestDmc(anchor.rgb, 1, null, cat)[0];
    return near ? { anchor: anchor, dmc: near, how: 'nearest' } : null;
  }

  var api = {
    FAMILIES: FAMILIES,
    dmcList: function () { return globalDmc() || []; },
    findDmc: findDmc,
    nearestDmc: nearestDmc,
    familyOf: familyOf,
    familyThreads: familyThreads,
    fromAnchor: fromAnchor,
  };

  if (typeof window !== 'undefined') {
    window.ImportEngine = Object.assign(window.ImportEngine || {}, { threadPicker: api });
  }
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})();
