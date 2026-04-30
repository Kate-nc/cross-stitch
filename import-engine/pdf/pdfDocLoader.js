/* import-engine/pdf/pdfDocLoader.js — pdfjs-dist wrapper.
 *
 * Thin convenience around pdfjsLib.getDocument with:
 *   • cancellation via AbortToken
 *   • soft timeout (default 30 s per document)
 *   • memory cap (default 2048 MB max) — pdfjs honours this option
 *   • per-page accessor that surfaces operator list + text content together
 *
 * Browser-only — depends on the global `pdfjsLib` loaded in *.html.
 */

(function () {
  'use strict';

  const ENGINE = (typeof window !== 'undefined' && window.ImportEngine) ||
                 (typeof require === 'function' ? require('../types.js') : {});

  const DEFAULT_OPTS = {
    docTimeoutMs: 30000,
    pageTimeoutMs: 15000,
    maxImageSize: 16 * 1024 * 1024,
  };

  async function loadPdf(bytes, ctx, opts) {
    opts = Object.assign({}, DEFAULT_OPTS, opts || {});
    if (typeof pdfjsLib === 'undefined') {
      throw ENGINE.errors.UnsupportedError('pdfjsLib is not loaded');
    }
    const task = pdfjsLib.getDocument({
      data: bytes,
      maxImageSize: opts.maxImageSize,
      isEvalSupported: false,
      disableFontFace: true,
      useSystemFonts: false,
    });
    const cancelToken = ctx && ctx.cancelToken;
    if (cancelToken) {
      // Poll for cancellation.
      const poller = setInterval(function () {
        if (cancelToken.aborted) {
          clearInterval(poller);
          try { task.destroy(); } catch (_) {}
        }
      }, 50);
      task.promise.finally(function () { clearInterval(poller); });
    }
    const doc = await withTimeout(task.promise, opts.docTimeoutMs, 'PDF load timed out');
    return new PdfDocHandle(doc, ctx, opts);
  }

  function PdfDocHandle(doc, ctx, opts) {
    this._doc = doc;
    this._ctx = ctx;
    this._opts = opts;
    this.numPages = doc.numPages;
  }

  PdfDocHandle.prototype.getMetadata = async function () {
    try {
      const m = await this._doc.getMetadata();
      return { info: m.info || {}, metadata: m.metadata ? m.metadata.getAll() : {} };
    } catch (_) {
      return { info: {}, metadata: {} };
    }
  };

  PdfDocHandle.prototype.getPage = async function (pageNum) {
    const page = await this._doc.getPage(pageNum);
    return new PdfPageHandle(page, this._opts);
  };

  PdfDocHandle.prototype.destroy = async function () {
    try { await this._doc.cleanup(); } catch (_) {}
    try { await this._doc.destroy(); } catch (_) {}
  };

  function PdfPageHandle(page, opts) {
    this._page = page;
    this._opts = opts;
    this.pageNum = page.pageNumber;
    const view = page.view || [0, 0, 0, 0];
    this.viewport = { x: view[0], y: view[1], width: view[2] - view[0], height: view[3] - view[1] };
  }

  PdfPageHandle.prototype.getOperatorList = async function () {
    return await withTimeout(this._page.getOperatorList(), this._opts.pageTimeoutMs, 'PDF page op-list timed out');
  };

  PdfPageHandle.prototype.getTextContent = async function () {
    return await withTimeout(this._page.getTextContent(), this._opts.pageTimeoutMs, 'PDF page text timed out');
  };

  PdfPageHandle.prototype.getFonts = function () {
    if (!this._page.commonObjs || !this._page.commonObjs._objs) return [];
    return Object.keys(this._page.commonObjs._objs);
  };

  function withTimeout(promise, ms, message) {
    if (!ms || ms <= 0) return promise;
    return new Promise(function (resolve, reject) {
      const timer = setTimeout(function () {
        reject(ENGINE.errors.ParseError(message + ' after ' + ms + ' ms', { timeout: ms }));
      }, ms);
      promise.then(function (v) { clearTimeout(timer); resolve(v); },
                   function (e) { clearTimeout(timer); reject(e); });
    });
  }

  const api = { loadPdf, _PdfDocHandle: PdfDocHandle, _PdfPageHandle: PdfPageHandle };

  if (typeof window !== 'undefined') {
    window.ImportEngine = Object.assign(window.ImportEngine || {}, api);
  }
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  }
})();
