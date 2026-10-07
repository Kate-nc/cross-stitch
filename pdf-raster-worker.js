/* pdf-raster-worker.js — reads scanned chart pages off the main thread.
 *
 * pdf-importer.js renders each scanned page (pdf.js needs the page for that)
 * and posts its pixels here; reading the cells and grouping them, which takes
 * seconds a page, happens here so the page stays responsive. The cells read
 * stay in the worker until the grouping asks for them.
 *
 * Messages in:  { id, type: 'ping' }
 *               { id, type: 'read', width, height, data }  -> { index, grid } | null
 *               { id, type: 'group', indices, opts }        -> groupPages() result
 * Messages out: { id, ok: true, result } | { id, ok: false, error }
 */

/* global importScripts, PdfRasterChart */
importScripts('pdf-raster-chart.js');

var reads = [];

self.onmessage = function (e) {
  var m = e.data || {};
  try {
    var result = null;
    if (m.type === 'ping') {
      result = true;
    } else if (m.type === 'read') {
      var r = PdfRasterChart.readCells({ width: m.width, height: m.height, data: m.data });
      if (r) { reads.push(r); result = { index: reads.length - 1, grid: r.grid }; }
    } else if (m.type === 'group') {
      result = PdfRasterChart.groupPages(m.indices.map(function (i) { return reads[i]; }), m.opts);
      reads = [];
    } else {
      throw new Error('Unknown message: ' + m.type);
    }
    self.postMessage({ id: m.id, ok: true, result: result });
  } catch (err) {
    self.postMessage({ id: m.id, ok: false, error: String((err && err.message) || err) });
  }
};
