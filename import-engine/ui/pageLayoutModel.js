/* import-engine/ui/pageLayoutModel.js — the page arrangement behind the
 * review dialog's Pages tab, as pure functions.
 *
 * A multi-page PDF chart is a set of page tiles. pdf-importer places them
 * itself — exactly, when the pages print their row and column numbers, and in
 * reading order when they do not — but the stitcher must be able to check that
 * and put it right. This models the arrangement as slots in a grid:
 *
 *   { across, order: [pageIndex | null, ...], tray: [pageIndex, ...],
 *     overlap: { cols, rows } }
 *
 * `order` is row-major; null is an empty slot (a page the PDF is missing).
 * `tray` holds pages left out of the chart: ones the importer could not place,
 * duplicate renderings it set aside, or ones the stitcher removed.
 *
 * placementFromSlots() turns slots into the absolute cell offsets
 * pdf-importer's buildFromLayout() takes. Columns and rows size themselves to
 * their widest and tallest page, so a short last column or row lines up, and
 * `overlap` removes the rows and columns some charts repeat at each page break.
 *
 * No React here, so it is tested directly (tests/import/pageLayoutModel.test.js).
 */

(function () {
  'use strict';

  function sizeOf(session, pageIndex) {
    for (var i = 0; i < session.pages.length; i++) {
      if (session.pages[i].pageIndex === pageIndex) return session.pages[i];
    }
    return null;
  }

  function median(xs) {
    if (!xs.length) return 0;
    var s = xs.slice().sort(function (a, b) { return a - b; });
    return s[Math.floor(s.length / 2)];
  }

  /* Pad to whole rows. */
  function padded(order, across) {
    var out = order.slice();
    while (out.length % across) out.push(null);
    return out;
  }

  /* Read a placement back into slots: pages sharing a column offset share a
   * slot column, and likewise rows. */
  function slotsFromPlacement(session, placement) {
    var at = (placement && placement.pages) || {};
    var placed = session.pages.filter(function (p) { return at[p.pageIndex]; });
    var cols = [], rows = [];
    placed.forEach(function (p) {
      var pos = at[p.pageIndex];
      if (cols.indexOf(pos.col) < 0) cols.push(pos.col);
      if (rows.indexOf(pos.row) < 0) rows.push(pos.row);
    });
    cols.sort(function (a, b) { return a - b; });
    rows.sort(function (a, b) { return a - b; });
    var across = Math.max(1, cols.length);
    var order = [];
    for (var i = 0; i < across * Math.max(1, rows.length); i++) order.push(null);
    var spill = [];
    placed.forEach(function (p) {
      var pos = at[p.pageIndex];
      var k = rows.indexOf(pos.row) * across + cols.indexOf(pos.col);
      if (order[k] === null) order[k] = p.pageIndex; else spill.push(p.pageIndex);
    });
    order = order.concat(spill);
    return {
      across: across,
      order: padded(order, across),
      tray: session.pages.filter(function (p) { return !at[p.pageIndex]; }).map(function (p) { return p.pageIndex; }),
      overlap: { cols: 0, rows: 0 },
    };
  }

  /* Slots to absolute offsets. Each slot column is as wide as its widest page
   * and each slot row as tall as its tallest; an empty column or row takes a
   * typical page's size, so a missing page leaves a page-sized gap. */
  function placementFromSlots(session, slots) {
    var across = Math.max(1, slots.across | 0);
    var order = slots.order || [];
    var down = Math.ceil(order.length / across);
    var ov = slots.overlap || { cols: 0, rows: 0 };
    var typW = median(session.pages.map(function (p) { return p.cols; }));
    var typH = median(session.pages.map(function (p) { return p.rows; }));
    var colW = [], rowH = [], c, r;
    for (c = 0; c < across; c++) colW[c] = 0;
    for (r = 0; r < down; r++) rowH[r] = 0;
    order.forEach(function (pi, k) {
      if (pi === null || pi === undefined) return;
      var p = sizeOf(session, pi);
      if (!p) return;
      c = k % across; r = Math.floor(k / across);
      if (p.cols > colW[c]) colW[c] = p.cols;
      if (p.rows > rowH[r]) rowH[r] = p.rows;
    });
    // Trailing empty rows add nothing; interior empty ones keep their space.
    var lastRow = -1;
    order.forEach(function (pi, k) { if (pi !== null && pi !== undefined) lastRow = Math.max(lastRow, Math.floor(k / across)); });
    var colOff = [], rowOff = [], acc = 0;
    for (c = 0; c < across; c++) { colOff[c] = acc; acc += (colW[c] || typW) - (ov.cols || 0); }
    acc = 0;
    for (r = 0; r <= lastRow; r++) { rowOff[r] = acc; acc += (rowH[r] || typH) - (ov.rows || 0); }
    var pages = {};
    order.forEach(function (pi, k) {
      if (pi === null || pi === undefined) return;
      pages[pi] = { col: Math.max(0, colOff[k % across]), row: Math.max(0, rowOff[Math.floor(k / across)]) };
    });
    return { pages: pages, manual: true };
  }

  /* Change how many pages go across, keeping reading order. Trailing empty
   * slots are dropped first, so widening and narrowing do not accumulate gaps. */
  function setAcross(slots, across) {
    across = Math.max(1, across | 0);
    var order = slots.order.slice();
    while (order.length && (order[order.length - 1] === null || order[order.length - 1] === undefined)) order.pop();
    return Object.assign({}, slots, { across: across, order: padded(order, across) });
  }

  /* Exchange two slots (either may be empty). */
  function swap(slots, i, j) {
    var order = slots.order.slice();
    while (order.length <= Math.max(i, j)) order.push(null);
    var t = order[i]; order[i] = order[j]; order[j] = t;
    return Object.assign({}, slots, { order: padded(order, slots.across) });
  }

  /* Take a page out of the chart, leaving its slot empty. */
  function toTray(slots, pageIndex) {
    var k = slots.order.indexOf(pageIndex);
    if (k < 0) return slots;
    var order = slots.order.slice();
    order[k] = null;
    return Object.assign({}, slots, { order: order, tray: slots.tray.concat([pageIndex]) });
  }

  /* Put a page from the tray into a slot; whatever was there goes to the tray. */
  function fromTray(slots, pageIndex, slot) {
    if (slots.tray.indexOf(pageIndex) < 0) return slots;
    var order = slots.order.slice();
    while (order.length <= slot) order.push(null);
    var tray = slots.tray.filter(function (p) { return p !== pageIndex; });
    if (order[slot] !== null && order[slot] !== undefined) tray.push(order[slot]);
    order[slot] = pageIndex;
    return Object.assign({}, slots, { order: padded(order, slots.across), tray: tray });
  }

  function setOverlap(slots, cols, rows) {
    return Object.assign({}, slots, { overlap: { cols: Math.max(0, cols | 0), rows: Math.max(0, rows | 0) } });
  }

  /* Should the review open on the page layout? Yes when the importer could not
   * read where the pages go — no rulers, so they were put in reading order — or
   * when it left a page out that was not a recognised duplicate. */
  function needsReview(session) {
    if (!session || !session.pages || session.pages.length < 2) return false;
    if (session.layoutSource !== 'axis-rulers' && session.layoutSource !== 'alternate-renderings') return true;
    return session.pages.some(function (p) { return p.reason === 'unplaced'; });
  }

  /* Does this placement put every page exactly where the PDF said? */
  function samePlacement(a, b) {
    var pa = (a && a.pages) || {}, pb = (b && b.pages) || {};
    var ka = Object.keys(pa), kb = Object.keys(pb);
    if (ka.length !== kb.length) return false;
    return ka.every(function (k) { return pb[k] && pb[k].col === pa[k].col && pb[k].row === pa[k].row; });
  }

  var api = {
    slotsFromPlacement: slotsFromPlacement,
    placementFromSlots: placementFromSlots,
    setAcross: setAcross,
    swap: swap,
    toTray: toTray,
    fromTray: fromTray,
    setOverlap: setOverlap,
    needsReview: needsReview,
    samePlacement: samePlacement,
  };

  if (typeof window !== 'undefined') {
    window.ImportEngine = Object.assign(window.ImportEngine || {}, { pageLayout: api });
  }
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})();
