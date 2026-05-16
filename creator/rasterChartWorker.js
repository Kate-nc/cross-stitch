/* creator/rasterChartWorker.js
 * ════════════════════════════════════════════════════════════════════════
 *   Dedicated Web Worker hosting the raster-chart CV pipeline.
 *
 *   Loads OpenCV.js + Tesseract.js + helper modules via importScripts and
 *   replies to RPC messages from the main thread. Owns the entire CV stack
 *   so the heavy work is off the React render loop.
 *
 *   Protocol:
 *     in  → { type: 'init' }
 *     in  → { type: 'preprocess',     id, rgba, w, h, opts }
 *     in  → { type: 'detectCorners',  id, binary, w, h, opts }
 *     in  → { type: 'warp',           id, rgba, w, h, corners, opts }
 *     in  → { type: 'detectGrid',     id, binary, w, h, opts }
 *     in  → { type: 'extractCells',   id, binary, w, h, grid, opts }
 *     in  → { type: 'featurise',      id, cells }
 *     in  → { type: 'cluster',        id, features, dHashes, opts }
 *     in  → { type: 'ocrLegend',      id, rgba, w, h, opts }
 *     in  → { type: 'terminate' }
 *     out → { type: 'progress', id, stage, label, fraction }
 *     out → { type: 'result',   id, payload }
 *     out → { type: 'error',    id, error: { name, message } }
 *
 *   Tesseract.js spawns its own internal worker — we do NOT nest it inside
 *   this one. We simply call Tesseract.recognize() and await the result.
 *
 *   Lifecycle: the main thread should `terminate()` this worker between
 *   large jobs to defragment the Emscripten heap, then respawn.
 * ════════════════════════════════════════════════════════════════════════
 */

/* eslint-env worker */
/* global importScripts, cv, Tesseract, MatScope, RasterChartCV,
          RasterChartHOG, RasterChartDBSCAN, RasterChartOCRRepair */

(function () {
  'use strict';
  if (typeof importScripts !== 'function') return;

  // Pinned versions per the project spec.
  const OPENCV_URL    = self.OPENCV_URL    || './assets/opencv.js'; // self-hosted, with CDN fallback below
  const OPENCV_CDN    = 'https://docs.opencv.org/4.10.0/opencv.js';
  const TESSERACT_URL = 'https://cdn.jsdelivr.net/npm/tesseract.js@7/dist/tesseract.min.js';
  const IMAGEHASH_URL = 'https://unpkg.com/imagehash-web/dist/imagehash-web.min.js';
  const DBSCAN_URL    = 'https://cdn.jsdelivr.net/npm/density-clustering';

  let cvReady = null;

  function loadHelpers() {
    importScripts(
      './rasterChart/matScope.js',
      './rasterChart/projectionProfile.js',
      './rasterChart/hog.js',
      './rasterChart/ocrRepair.js',
      './rasterChart/dbscan.js',
      './rasterChart/cvPipeline.js',
    );
  }

  function loadOpenCV() {
    if (cvReady) return cvReady;
    cvReady = new Promise((resolve, reject) => {
      try { importScripts(OPENCV_URL); }
      catch (_) { try { importScripts(OPENCV_CDN); } catch (e) { reject(e); return; } }
      // OpenCV.js sets cv.onRuntimeInitialized when WASM is ready.
      if (typeof cv === 'undefined') return reject(new Error('cv global missing after importScripts'));
      if (cv.Mat) return resolve();
      cv['onRuntimeInitialized'] = () => resolve();
    });
    return cvReady;
  }

  function loadAuxLibs() {
    try { importScripts(DBSCAN_URL); } catch (_) {}
    try { importScripts(IMAGEHASH_URL); } catch (_) {}
  }

  function loadTesseract() {
    try { importScripts(TESSERACT_URL); } catch (e) { return Promise.reject(e); }
    return Promise.resolve();
  }

  // ── message routing ────────────────────────────────────────────────────

  function send(type, id, payload) { self.postMessage(Object.assign({ type, id }, payload)); }
  function progress(id, stage, label, fraction) {
    self.postMessage({ type: 'progress', id, stage, label, fraction: fraction || 0 });
  }
  function errOut(id, e) {
    self.postMessage({ type: 'error', id, error: {
      name: e && e.name || 'Error',
      message: e && e.message || String(e),
    }});
  }

  loadHelpers();
  loadAuxLibs();

  self.addEventListener('message', async function (ev) {
    const msg = ev.data || {};
    const id = msg.id;
    try {
      switch (msg.type) {
        case 'init':
          await loadOpenCV();
          send('result', id, { payload: { ready: true } });
          return;

        case 'preprocess':
          await loadOpenCV();
          progress(id, 'preprocess', 'Adaptive threshold');
          send('result', id, { payload: RasterChartCV.preprocess(msg.rgba, msg.w, msg.h, msg.opts) });
          return;

        case 'detectCorners':
          await loadOpenCV();
          progress(id, 'corners', 'Largest 4-vertex contour');
          send('result', id, { payload: RasterChartCV.detectCorners(msg.binary, msg.w, msg.h, msg.opts) });
          return;

        case 'warp':
          await loadOpenCV();
          progress(id, 'warp', 'Perspective transform');
          send('result', id, { payload: RasterChartCV.warpAndPreprocess(msg.rgba, msg.w, msg.h, msg.corners, msg.opts) });
          return;

        case 'detectGrid':
          await loadOpenCV();
          progress(id, 'grid', 'Projection profile peaks');
          send('result', id, { payload: RasterChartCV.detectGrid(msg.binary, msg.w, msg.h, msg.opts) });
          return;

        case 'extractCells':
          await loadOpenCV();
          progress(id, 'cells', 'Cropping ' + (msg.grid.rows * msg.grid.cols) + ' cells');
          send('result', id, { payload: RasterChartCV.extractCells(msg.binary, msg.w, msg.h, msg.grid, msg.opts) });
          return;

        case 'featurise':
          progress(id, 'cluster', 'HOG + dHash');
          send('result', id, { payload: RasterChartCV.featurise(msg.cells) });
          return;

        case 'cluster':
          progress(id, 'cluster', 'DBSCAN');
          {
            const dHashesBig = (msg.dHashes || []).map(x => typeof x === 'bigint' ? x : BigInt(x));
            const out = RasterChartDBSCAN.cluster(msg.features, msg.opts || {});
            const merged = RasterChartDBSCAN.mergeByHashHamming(out.assignments, out.medoids, dHashesBig, 4);
            send('result', id, { payload: { assignments: merged, eps: out.eps, medoids: out.medoids } });
          }
          return;

        case 'ocrLegend':
          await loadTesseract();
          progress(id, 'legend-ocr', 'Tesseract');
          {
            const result = await runOCR(msg.rgba, msg.w, msg.h,
              { anchorFirst: msg.anchorFirst !== false });
            send('result', id, { payload: result });
          }
          return;

        case 'extractCellColors':
          await loadOpenCV();
          progress(id, 'cells', 'Colour sampling');
          send('result', id, { payload: RasterChartCV.extractCellColors(msg.rgba, msg.w, msg.h, msg.grid) });
          return;

        case 'colourCluster':
          progress(id, 'cluster', 'Lab DBSCAN');
          {
            // Convert per-cell RGB → Lab, then cluster with z-score + Lab weight.
            const { cellColors, cols, rows } = msg;
            const n = cols * rows;
            const labFeatures = [];
            for (let i = 0; i < n; i++) {
              const r = cellColors[i * 3], g = cellColors[i * 3 + 1], b = cellColors[i * 3 + 2];
              labFeatures.push(Float32Array.from(d50RgbToLab(r, g, b)));
            }
            const opts = Object.assign({ minPts: 2, normalise: true, labStartIdx: 0, labDims: 3, labWeight: 0.6 },
              msg.opts || {});
            const dummyHashes = labFeatures.map(() => 0n);
            const out = RasterChartDBSCAN.cluster(labFeatures, opts);
            send('result', id, { payload: {
              assignments: Array.from(out.assignments),
              medoids: out.medoids,
              eps: out.eps,
              labFeatures: labFeatures.map(f => Array.from(f)),
            }});
          }
          return;

        case 'terminate':
          self.close();
          return;
      }
    } catch (e) { errOut(id, e); }
  });

  async function runOCR(rgba, w, h, opts) {
    opts = opts || {};
    if (typeof Tesseract === 'undefined') throw new Error('Tesseract.js not loaded');
    const worker = await Tesseract.createWorker('eng', 1, {
      corePath:   'https://cdn.jsdelivr.net/npm/tesseract.js-core@5',
      workerPath: 'https://cdn.jsdelivr.net/npm/tesseract.js@7/dist/worker.min.js',
      langPath:   'https://tessdata.projectnaptha.com/4.0.0_best_int',
    }, {
      load_system_dawg: '0', load_freq_dawg: '0',
      load_number_dawg: '0', load_punc_dawg: '0',
    });
    await worker.setParameters({
      tessedit_pageseg_mode: Tesseract.PSM.SINGLE_BLOCK,
      tessedit_char_whitelist:
        'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789 -./',
      preserve_interword_spaces: '1',
    });
    // ImageData-like payload
    const img = { data: rgba, width: w, height: h };
    const { data } = await worker.recognize(img);
    await worker.terminate();

    const words = (data.words || []).map(wd => ({
      text: wd.text, confidence: wd.confidence,
      bbox: wd.bbox ? { x0: wd.bbox.x0, y0: wd.bbox.y0, x1: wd.bbox.x1, y1: wd.bbox.y1 } : null,
    }));
    const meanConfidence = words.length
      ? words.reduce((s, wd) => s + wd.confidence, 0) / words.length
      : 0;

    // ── Anchor-first filtering ──────────────────────────────────────────
    // The anchor is the leftmost element of each legend row: a glyph
    // symbol (Phase 1 B&W) or a colour swatch (Phase 2 colour charts).
    // We detect it by looking for leading words that contain no digits and
    // are too short to be a DMC code name (single chars, punctuation, or
    // symbol OCR artifacts). Reading direction is assumed LTR; RTL /
    // top-anchor support is a Phase 2 stretch goal surfaced by telemetry.
    let text;
    if (opts.anchorFirst) {
      text = buildAnchorFirstText(data.lines || []);
    } else {
      text = data.text || '';
    }

    return { text, words, meanConfidence };
  }

  /**
   * For each OCR line, skip leading "anchor" tokens (symbol glyphs / colour
   * swatch artefacts) and return the remaining code + name text.
   *
   * An anchor token is defined as:
   *   - no digit characters, AND
   *   - fewer than 2 alphabetic characters
   * This matches glyph noise (e.g. "▪", "⬛", "O" for a single-glyph symbol)
   * while preserving real codes like "310", "BLANC", "DMC 550".
   */
  function buildAnchorFirstText(lines) {
    const result = [];
    for (const line of lines) {
      if (!line.words || line.words.length === 0) continue;
      const sorted = line.words.slice().sort((a, b) => (a.bbox ? a.bbox.x0 : 0) - (b.bbox ? b.bbox.x0 : 0));
      let start = sorted.length; // default: skip whole line if nothing useful found
      for (let i = 0; i < sorted.length; i++) {
        const t = sorted[i].text.trim();
        if (/\d/.test(t) || /[A-Za-z]{2,}/.test(t)) { start = i; break; }
      }
      const textPart = sorted.slice(start).map(wd => wd.text).join(' ').trim();
      if (textPart) result.push(textPart);
    }
    return result.join('\n');
  }

  // ── D50 RGB → CIE Lab (inline, no DOM dependencies) ───────────────────
  // Matches the illuminant used by colour-utils.js on the main thread so
  // cluster centroids and DMC-lookup coordinates live in the same space.
  function d50RgbToLab(r, g, b) {
    function toLinear(v) {
      v /= 255;
      return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
    }
    const rl = toLinear(r), gl = toLinear(g), bl = toLinear(b);
    // Bradford-adapted sRGB→XYZ matrix for D50 (IEC 61966-2-1 / ICC v4)
    const x = rl * 0.4360747 + gl * 0.3850649 + bl * 0.1430804;
    const y = rl * 0.2225045 + gl * 0.7168786 + bl * 0.0606169;
    const z = rl * 0.0139322 + gl * 0.0971045 + bl * 0.7141733;
    // D50 white point: [0.96422, 1.00000, 0.82521]
    function f(t) { const δ = 6 / 29; return t > δ * δ * δ ? Math.cbrt(t) : t / (3 * δ * δ) + 4 / 29; }
    const fx = f(x / 0.96422), fy = f(y), fz = f(z / 0.82521);
    return [116 * fy - 16, 500 * (fx - fy), 200 * (fy - fz)];
  }
