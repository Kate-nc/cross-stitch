/* import-engine/pipeline.js — orchestrates the 7 import stages.
 *
 *   sniff → classify → extract → assemble → palette → validate → materialise
 *
 * Each stage is overridable via the optional `stages` argument so tests can
 * swap a single stage without rebuilding the whole pipeline.
 *
 * Public surface:
 *   window.ImportEngine.runPipeline(probe, opts, ctx[, stages]) → ImportResult
 */

(function () {
  'use strict';

  const ENGINE = (typeof window !== 'undefined' && window.ImportEngine) ||
                 (typeof require === 'function' ? require('./types.js') : {});
  const REG    = (typeof window !== 'undefined' && window.ImportEngine) ||
                 (typeof require === 'function' ? require('./registry.js') : {});

  // ── default stages ─────────────────────────────────────────────────────

  // Stage 0 — sniff. If a sniffer is registered we use it; otherwise we
  // fall back to extension/MIME inference so the pipeline still runs in
  // tests that don't load the sniffer module.
  async function defaultSniff(probe, opts, ctx) {
    if (typeof window !== 'undefined' && window.ImportEngine && window.ImportEngine.sniffMagic) {
      return window.ImportEngine.sniffMagic(probe);
    }
    const name = (probe.fileName || '').toLowerCase();
    if (name.endsWith('.pdf')) return { format: 'pdf', confidence: 0.7 };
    if (name.endsWith('.oxs') || name.endsWith('.xml')) return { format: 'oxs', confidence: 0.7 };
    if (name.endsWith('.json')) return { format: 'json', confidence: 0.7 };
    if (/\.(png|jpe?g|gif|bmp|webp)$/i.test(name)) return { format: 'image', confidence: 0.7 };
    const mime = (probe.mimeType || '').toLowerCase();
    if (mime === 'application/pdf') return { format: 'pdf', confidence: 0.6 };
    if (mime === 'application/json') return { format: 'json', confidence: 0.6 };
    if (mime.indexOf('xml') >= 0) return { format: 'oxs', confidence: 0.6 };
    if (mime.indexOf('image/') === 0) return { format: 'image', confidence: 0.6 };
    return { format: 'unknown', confidence: 0 };
  }

  async function defaultClassify(probe, opts, ctx) {
    const reg = (typeof window !== 'undefined' && window.ImportEngine && window.ImportEngine.pick) || REG.pick;
    if (typeof reg !== 'function') {
      throw ENGINE.errors.UnsupportedError('Strategy registry not available');
    }
    const strategy = await reg(probe);
    if (!strategy) {
      throw ENGINE.errors.UnsupportedError(
        'No strategy can handle this file (' + probe.format + ')',
        { format: probe.format, fileName: probe.fileName }
      );
    }
    return strategy;
  }

  async function defaultExtract(strategy, probe, opts, ctx) {
    const raw = await strategy.parse(probe, opts, ctx);
    if (!raw || typeof raw !== 'object') {
      throw ENGINE.errors.ParseError('Strategy returned no extraction', { strategy: strategy.id });
    }
    return raw;
  }

  // Stage 3 — assemble. Multi-page stitch happens here when the strategy
  // returned multiple page-extractions; for simple strategies this is a
  // pass-through.
  function defaultAssemble(raw, probe, opts, ctx) {
    if (raw && raw.pages && Array.isArray(raw.pages)) {
      const ASM = (typeof window !== 'undefined' && window.ImportEngine && window.ImportEngine.assembleMultiPage);
      if (ASM) return ASM(raw, ctx);
    }
    return raw;
  }

  // Stage 4 — palette resolution. The strategy may have done this work
  // already (RawCell.source.kind === 'dmc'); for cells still in 'rgb' or
  // 'glyph' form we'd resolve here. v1 strategies all resolve in-strategy,
  // so this stage is a pass-through.
  function defaultPalette(raw, probe, opts, ctx) {
    return raw;
  }

  function defaultValidate(raw, probe, opts, ctx) {
    const VAL = (typeof window !== 'undefined' && window.ImportEngine && window.ImportEngine.validateExtraction);
    if (VAL) return VAL(raw, ctx);
    // Cheap built-in: dimensions sane, no zero-cell extraction.
    const warnings = [];
    const hasLegacy = raw && raw._legacyProject;
    if (!hasLegacy && (!raw.grid || raw.grid.length === 0)) {
      warnings.push({ code: 'EMPTY_GRID', message: 'No cells extracted from the file', severity: 'error' });
    }
    return { warnings, perPaletteEntry: (raw.legend || []).map(l => l.confidence || 0.5) };
  }

  function defaultMaterialise(raw, validation, probe, opts, ctx) {
    const MAT = (typeof window !== 'undefined' && window.ImportEngine && window.ImportEngine.materialise);
    if (MAT) return MAT(raw, validation, probe, opts, ctx);

    // Fast-path: legacy strategies attach a fully-built v8 project under
    // _legacyProject. Honour it verbatim so we get strict parity with the
    // pre-engine import paths.
    if (raw && raw._legacyProject) {
      const proj = raw._legacyProject;
      const total = (proj.w || 0) * (proj.h || 0);
      const perCell = new Array(total).fill(1);
      return { project: proj, perCellConfidence: perCell };
    }

    // Fallback: a minimal v8 project shape so tests can still run.
    const cells = raw.grid || [];
    const w = Math.max(0, ...cells.map(c => c.x + 1));
    const h = Math.max(0, ...cells.map(c => c.y + 1));
    const pattern = new Array(w * h).fill(null).map(() => ({ id: '__skip__' }));
    let perCellConf = new Array(w * h).fill(1);
    for (const c of cells) {
      if (c.x < 0 || c.y < 0 || c.x >= w || c.y >= h) continue;
      const idx = c.y * w + c.x;
      if (c.source && c.source.kind === 'dmc') {
        pattern[idx] = { id: c.source.id, type: 'solid', rgb: [0, 0, 0] };
      }
      perCellConf[idx] = typeof c.confidence === 'number' ? c.confidence : 1;
    }
    return {
      project: {
        v: 8,
        w, h,
        name: (probe.fileName || '').replace(/\.[^.]+$/, ''),
        settings: { sW: w, sH: h, fabricCt: raw.meta && raw.meta.fabricCount || 14 },
        pattern,
        bsLines: (raw.layers && raw.layers.backstitch) || [],
        done: null,
        parkMarkers: [],
        totalTime: 0,
        sessions: [],
        threadOwned: {},
      },
      perCellConfidence: perCellConf,
    };
  }

  // ── pipeline ───────────────────────────────────────────────────────────

  async function runPipeline(probe, opts, ctx, stages) {
    opts = opts || {};
    ctx  = ctx  || {
      cancelToken: ENGINE.makeAbortToken(),
      reportProgress: function () {},
      log: function () {},
    };
    stages = Object.assign({
      sniff:       defaultSniff,
      classify:    defaultClassify,
      extract:     defaultExtract,
      assemble:    defaultAssemble,
      palette:     defaultPalette,
      validate:    defaultValidate,
      materialise: defaultMaterialise,
    }, stages || {});

    const warnings = [];

    function abortGuard(stage) { ENGINE.checkAborted(ctx, stage); }
    function progress(stage, label, page, total) {
      try { ctx.reportProgress({ stage, label, page, total }); } catch (_) {}
    }

    try {
      // ── Stage 0 — sniff
      abortGuard('sniff'); progress('sniff');
      const sniffResult = await stages.sniff(probe, opts, ctx);
      probe.format = sniffResult.format;
      probe.formatConfidence = sniffResult.confidence;

      // ── Stage 1 — classify (strategy selection)
      abortGuard('classify'); progress('classify');
      const strategy = await stages.classify(probe, opts, ctx);

      // ── Stage 2 — extract (strategy-specific)
      abortGuard('extract'); progress('extract');
      const raw = await stages.extract(strategy, probe, opts, ctx);
      if (raw && raw.flags && Array.isArray(raw.flags.warnings)) {
        for (const w of raw.flags.warnings) {
          warnings.push({ code: 'EXTRACT_WARNING', message: w, severity: 'warning' });
        }
      }

      // ── Stage 3 — assemble
      abortGuard('assemble'); progress('assemble');
      const assembled = await stages.assemble(raw, probe, opts, ctx);

      // ── Stage 4 — palette
      abortGuard('palette'); progress('palette');
      const resolved = await stages.palette(assembled, probe, opts, ctx);

      // ── Stage 5 — validate
      abortGuard('validate'); progress('validate');
      const validation = await stages.validate(resolved, probe, opts, ctx);
      if (validation && Array.isArray(validation.warnings)) {
        for (const w of validation.warnings) warnings.push(w);
      }

      // ── Stage 6 — materialise
      abortGuard('materialise'); progress('materialise');
      const built = await stages.materialise(resolved, validation, probe, opts, ctx);

      const perCell = built.perCellConfidence || [];
      const perPalette = (validation && validation.perPaletteEntry) || [];
      const overall = computeOverall(perCell, perPalette, probe.formatConfidence);

      const errs = warnings.filter(w => w.severity === 'error');
      return {
        ok: errs.length === 0,
        project: built.project,
        publisher: (resolved.meta && resolved.meta.publisher) || (raw.meta && raw.meta.publisher),
        confidence: { overall, perCell, perPaletteEntry: perPalette },
        warnings,
        reviewHints: built.reviewHints || [],
      };
    } catch (err) {
      if (err && err.name === 'ImportAbortedError') {
        return { ok: false, error: err, warnings };
      }
      if (err && (err.name === 'ImportUnsupportedError' || err.name === 'ImportParseError' || err.name === 'ImportValidateError')) {
        return { ok: false, error: err, warnings };
      }
      // Unknown error — wrap as ParseError so callers don't have to special-case.
      const wrapped = ENGINE.errors.ParseError(err && err.message || String(err), { cause: err && err.stack });
      return { ok: false, error: wrapped, warnings };
    }
  }

  function computeOverall(perCell, perPalette, formatConf) {
    function mean(arr) {
      if (!arr || !arr.length) return 1;
      let s = 0, n = 0;
      for (let i = 0; i < arr.length; i++) {
        const v = arr[i];
        if (typeof v === 'number' && !isNaN(v)) { s += v; n++; }
      }
      return n ? s / n : 1;
    }
    const cellMean = mean(perCell);
    const palMean  = mean(perPalette);
    const fmtConf  = typeof formatConf === 'number' ? formatConf : 1;
    return cellMean * 0.5 + palMean * 0.3 + fmtConf * 0.2;
  }

  const api = { runPipeline, _internal: { defaultSniff, defaultClassify, defaultExtract, defaultAssemble, defaultPalette, defaultValidate, defaultMaterialise, computeOverall } };

  if (typeof window !== 'undefined') {
    window.ImportEngine = Object.assign(window.ImportEngine || {}, api);
  }
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  }
})();
