/* import-engine/strategies/rasterChartStrategy.js
 * ════════════════════════════════════════════════════════════════════════
 *   Raster-image cross-stitch CHART importer.
 *
 *   Opt-in via opts.image.mode === 'chart' OR a high-confidence chart
 *   probe. Spawns ../../creator/rasterChartWorker.js and walks the import
 *   through 6 stages, emitting progress events the existing engine surface
 *   already understands ('extract' stage).
 *
 *   Output: same RawExtraction shape as PDF importers consume by
 *   pipeline/materialise.js — { width, height, cells:[{col,row,code,color,
 *   type,matchConfidence}], legend, palette, flags }.
 *
 *   For Phase 1, when a labelled mapping isn't yet attached (the user
 *   hasn't finished the correction UI), we return a partial extraction
 *   with cluster ids in `code` and `matchConfidence` set to the cluster
 *   confidence. The correction UI later overwrites `cells[i].code` with
 *   real DMC ids before materialise is called.
 * ════════════════════════════════════════════════════════════════════════
 */

(function () {
  'use strict';

  const ENGINE = (typeof window !== 'undefined' && window.ImportEngine) ||
                 (typeof require === 'function' ? require('../types.js') : {});

  const WORKER_URL = 'creator/rasterChartWorker.js';

  function isChartMode(opts) {
    return !!(opts && opts.image && opts.image.mode === 'chart');
  }

  const rasterChartStrategy = {
    id: 'image-chart',
    formats: ['image'],

    async canHandle(probe, opts) {
      if (!probe || probe.format !== 'image') return 0;
      if (typeof document === 'undefined') return 0;
      // Default to 0 so the existing photo→pattern strategy still wins.
      // The user flips into chart mode explicitly via the wizard.
      if (isChartMode(opts)) return 0.95;
      return 0;
    },

    /**
     * @param probe FileProbe
     * @param opts  { image:{ mode:'chart', tunings?, manualCorners?, labelledClusters? } }
     * @param ctx   ImportContext
     */
    async parse(probe, opts, ctx) {
      const bytes = await probe.fullBytes();
      const blob = new Blob([bytes], { type: probe.mimeType || 'image/png' });
      const url = URL.createObjectURL(blob);
      let imageBitmap;
      try {
        imageBitmap = await createImageBitmap(blob);
      } catch (_) {
        // Fallback for browsers without createImageBitmap
        imageBitmap = await loadImage(url);
      } finally {
        URL.revokeObjectURL(url);
      }

      const w = imageBitmap.width, h = imageBitmap.height;
      const rgba = imageBitmapToRGBA(imageBitmap, w, h);

      // ─── Phase 1 telemetry: one record per import, opt-out via the
      //     importer.telemetryEnabled user pref. All local, no network.
      const T = (typeof window !== 'undefined' && window.RasterChartTelemetry) || null;
      const timings = {};
      const t0 = nowMs();
      function timed(label, p) {
        const start = nowMs();
        return Promise.resolve(p).then(v => { timings[label] = nowMs() - start; return v; },
                                       e => { timings[label] = nowMs() - start; throw e; });
      }

      // Spawn a dedicated worker for this job. Caller can pre-warm via
      // ImportEngine.rasterChart.prewarm() if desired.
      const worker = new Worker(WORKER_URL);
      try {
        await rpc(worker, { type: 'init' });
        if (ctx) safeReport(ctx, { stage: 'extract', label: 'preprocess' });
        const pre = await timed('preprocess', rpc(worker, {
          type: 'preprocess', rgba, w, h, opts: (opts.image && opts.image.tunings) || {},
        }, [rgba.buffer]));

        let workingBinary = pre.binary, workingW = pre.w, workingH = pre.h;
        // Re-decode rgba at the (possibly downsized) working dimensions for warp re-use.
        const workingRgba = imageBitmapToRGBA(imageBitmap, workingW, workingH);

        // Track the detected/manual corners so the correction UI can show
        // them in the 4-corner editor (and so the user can nudge them).
        // The dimensions in which `autoCorners` are expressed must be
        // captured at the moment we assign them, because `warp` below
        // RESIZES the working image and reassigns workingW/workingH.
        // Without this, autoCornersNorm divides by the post-warp size
        // and produces corners far outside [0,1] — they then render
        // off-canvas in the CorrectionUI 4-corner editor.
        let autoCorners = null;
        let autoCornersSrcW = workingW, autoCornersSrcH = workingH;

        // Manual corners can arrive either as absolute working-image
        // pixels (legacy `manualCorners`) or as normalised [0,1] fractions
        // (`manualCornersNorm`). The CorrectionUI's recompute path uses
        // the normalised form because workingW/H may differ between runs.
        let manualCornersForWarp = null;
        if (opts.image && opts.image.manualCornersNorm) {
          manualCornersForWarp = opts.image.manualCornersNorm.map(function (p) {
            return { x: Math.round(p.x * workingW), y: Math.round(p.y * workingH) };
          });
        } else if (opts.image && opts.image.manualCorners) {
          manualCornersForWarp = opts.image.manualCorners.slice();
        }

        if (manualCornersForWarp) {
          autoCorners = manualCornersForWarp.slice();
          autoCornersSrcW = workingW; autoCornersSrcH = workingH;
          const warped = await rpc(worker, {
            type: 'warp', rgba: workingRgba, w: workingW, h: workingH,
            corners: manualCornersForWarp, opts: (opts.image.tunings) || {},
          }, [workingRgba.buffer]);
          workingBinary = warped.binary; workingW = warped.w; workingH = warped.h;
        } else {
          if (ctx) safeReport(ctx, { stage: 'extract', label: 'corners' });
          const corners = await rpc(worker, {
            type: 'detectCorners', binary: workingBinary, w: workingW, h: workingH, opts: {},
          });
          if (corners && corners.corners) {
            autoCorners = corners.corners.slice();
            autoCornersSrcW = workingW; autoCornersSrcH = workingH;
            const warped = await rpc(worker, {
              type: 'warp', rgba: workingRgba, w: workingW, h: workingH,
              corners: corners.corners, opts: (opts.image.tunings) || {},
            }, [workingRgba.buffer]);
            workingBinary = warped.binary; workingW = warped.w; workingH = warped.h;
          }
        }

        if (ctx) safeReport(ctx, { stage: 'extract', label: 'grid' });
        const grid = await timed('grid', rpc(worker, {
          type: 'detectGrid', binary: workingBinary, w: workingW, h: workingH, opts: {},
        }));

        if (!grid || !grid.cellPitch) {
          throw ENGINE.errors.ParseError('Could not detect chart grid — please use the manual grid adjuster.', {
            partial: { grid, w: workingW, h: workingH },
          });
        }

        if (ctx) safeReport(ctx, { stage: 'extract', label: 'cells' });
        const cellRes = await timed('cells', rpc(worker, {
          type: 'extractCells', binary: workingBinary, w: workingW, h: workingH, grid, opts: {},
        }));

        // ── Phase 2: colour mode ─────────────────────────────────────────
        // When opts.image.colourMode is set, extract per-cell RGB and
        // cluster on a combined shape+colour feature vector (HOG + dHash +
        // Lab) so two colours sharing a glyph are split by colour, and
        // anti-aliased glyph variants of one colour are joined by colour.
        // The B&W glyph-only path remains for Phase 1 / mono charts.
        //
        // Order matters: featurise must run before parseColourMode so the
        // symbol features can be forwarded into the colour clustering.
        if (ctx) safeReport(ctx, { stage: 'extract', label: 'featurise' });
        const feat = await rpc(worker, { type: 'featurise', cells: cellRes.cells });

        // ── Legend OCR (anchor-first, Phase 1 backport) ─────────────────
        // Runs before colour clustering so legend codes can restrict the
        // DMC palette (task E) — a chart whose legend lists only 12
        // colours should never snap a cell to a 13th. Re-decode a fresh
        // RGBA from imageBitmap at working dimensions; the earlier
        // workingRgba buffer was transferred to the warp call and is now
        // detached. The worker is still alive so we can call OCR before
        // the finally-block terminates it.
        let ocrResult = null;
        {
          const ocrRgba = imageBitmapToRGBA(imageBitmap, workingW, workingH);
          try {
            if (ctx) safeReport(ctx, { stage: 'extract', label: 'legend-ocr' });
            ocrResult = await timed('legend-ocr', rpc(worker, {
              type: 'ocrLegend', rgba: ocrRgba, w: workingW, h: workingH,
              anchorFirst: true,
            }, [ocrRgba.buffer]));
          } catch (_) { /* legend OCR failure is non-fatal */ }
        }

        // Parse OCR lines → structured legend entries using the OCR repair
        // module (available as a main-thread global from create.html).
        const legend = buildLegend(ocrResult);
        // Telemetry legend metrics
        const legMeta = buildLegendMeta(legend, ocrResult);

        let colourResult = null;
        let clu;
        // For B&W mode, filteredAssign holds assignments indexed over non-empty
        // cells only, and filteredFeat holds the matching feature subset. We
        // scatter filteredAssign back to the full rows×cols index space after
        // clustering so the output loop can access clu.assignments[r*cols+c].
        // Keeping the filtered versions lets telemetry / warnings compute
        // accurate noise counts without counting empty cells (which also carry
        // −1 after the scatter) as unassigned glyph cells.
        let filteredAssign = null;
        let filteredFeat   = null;
        if (opts.image && opts.image.colourMode) {
          colourResult = await parseColourMode(
            worker, imageBitmap, workingW, workingH, grid, cellRes, feat, timings, ctx,
            legend,
          );
          clu = colourResult.clu;
        } else {
          if (ctx) safeReport(ctx, { stage: 'extract', label: 'cluster' });
          // Exclude empty cells from DBSCAN. Their all-zero feature vectors form a
          // dominant cluster (large hist[0] spike in estimateEps) that corrupts the
          // valley search — either collapsing all glyph symbols into one cluster or
          // forcing every glyph cell to noise (−1 assignment) → one-colour output.
          const neIdx = [];
          for (let ni = 0; ni < cellRes.emptyMask.length; ni++) {
            if (!cellRes.emptyMask[ni]) neIdx.push(ni);
          }
          const neFeatures = neIdx.map(i => feat.features[i]);
          const neDHashes  = neIdx.map(i => feat.dHashes[i]);
          filteredFeat = { features: neFeatures, dHashes: neDHashes };
          clu = await timed('cluster', rpc(worker, {
            type: 'cluster', features: neFeatures,
            dHashes: neDHashes.map(b => b.toString()),
            // normalise: true ensures the density scalar appended by featurise()
            // is z-score-scaled to the same magnitude as the HOG dimensions before
            // DBSCAN distance computation. Without it the density term (~0.05–0.20)
            // is ~20× smaller than typical HOG values and contributes negligibly,
            // causing circularly-symmetric glyphs that differ only in fill fraction
            // (e.g. hollow ring vs small filled dot) to collapse into one cluster.
            // The colourCluster path already passes normalise: true for the same reason.
            opts: { minPts: 2, normalise: true },
          }));
          // Scatter non-empty-cell assignments back to the full rows×cols index
          // space so clu.assignments[r*cols+c] works in the output loop below.
          // Empty-cell slots keep −1 and are already skipped via emptyMask.
          filteredAssign = clu.assignments.slice();
          const fullAssign = new Array(cellRes.emptyMask.length).fill(-1);
          for (let ni = 0; ni < neIdx.length; ni++) fullAssign[neIdx[ni]] = filteredAssign[ni];
          clu = { ...clu, assignments: fullAssign };
        }

        // ── Legend OCR + parsing already ran above (moved so it can
        // restrict the colour-mode palette) ─────────────────────────────

        // Compute final telemetry payload before returning. Skipping the
        // write when the user has opted out happens inside
        // RasterChartTelemetry.recordImport.
        let telemetryId = null;
        if (T) {
          try {
            const fp = await T.fingerprint(w, h, cellRes.cols, cellRes.rows);
            // Use the filtered (non-empty only) arrays for B&W mode so that
            // empty cells (which also carry −1 in the full assignments after
            // the scatter) are not counted as noise or inflate totalCells.
            const _statsAssign = filteredAssign || clu.assignments;
            const _statsFeat   = filteredFeat   || feat;
            const noiseCount = _statsAssign.filter(a => a < 0).length;
            const clusterCount = new Set(_statsAssign.filter(a => a >= 0)).size;
            const totalCells = _statsAssign.length || 1;
            const silhouette = computeSilhouetteProxy(
              filteredAssign
                ? { assignments: filteredAssign, medoids: clu.medoids, labFeatures: clu.labFeatures }
                : clu,
              _statsFeat,
            );
            const meanSilhouette = silhouette.score;
            const silhouetteMode = silhouette.mode;
            const sourceType = pre.otsuFastPath ? 'screenshot' : 'photo';
          timings.match = 0;            // Phase 1 has no match step (label step lives in UI).
            timings['legend-ocr'] = timings['legend-ocr'] || 0;
            const seedRec = T.newRecord({
              timings,
              confidence: {
                grid: { peakProminenceRatio: (grid && grid.confidence) || 0 },
                cluster: {
                  meanSilhouette,              // proxy: medoid-based silhouette score
                  silhouetteMode,              // 'lab' (colour mode) | 'shape' (B&W / fallback)
                  noiseCount,
                  clusterCount,
                  paletteRestricted: !!(colourResult && colourResult.paletteRestricted),
                  paletteSize:        (colourResult && colourResult.paletteSize) || null,
                  bgOffset:           (colourResult && colourResult.bgOffset) || null,
                  swatchOverrideCount:(colourResult && colourResult.swatchOverrideCount) || 0,
                },
                legend: {
                  meanWordConfidence: legMeta.meanWordConfidence,
                  regexValidatedCount: legMeta.regexValidatedCount,
                  confusionRepairedCount: legMeta.confusionRepairedCount,
                },
                match:   { matchedCount: 0, unmatchedCount: noiseCount },
              },
              input: {
                imageW: w, imageH: h,
                chartCols: cellRes.cols, chartRows: cellRes.rows,
                paletteSize: clusterCount,
                sourceType,
              },
              fingerprint: fp,
            });
            telemetryId = seedRec.id;
            await T.recordImport(seedRec);
          } catch (_) { /* swallow — telemetry must never break imports */ }
        }

        // correction UI overrides this once the user labels each cluster.
        // In colour mode, pre-fill labels from auto-matched DMC centroids.
        const colourLabels = colourResult ? colourResult.clusterLabels : null;
        const labels = (opts.image && opts.image.labelledClusters) || {};
        const cells = [];
        // Parallel placeholder copy with every cell coded as "C<clusterId>".
        // RasterChartCorrectionUI.applyCorrections() rewrites these codes
        // when the user commits cluster labels in the Symbols / Legend tabs,
        // then we re-materialise the corrected RawExtraction into a project.
        // The top-level `cells` (with auto-matched DMC codes) is what the
        // "skip review" path uses if a caller opts out of the correction UI.
        const placeholderCells = [];
        for (let r = 0; r < cellRes.rows; r++) {
          for (let c = 0; c < cellRes.cols; c++) {
            const idx = r * cellRes.cols + c;
            if (cellRes.emptyMask[idx]) continue;
            const cid = clu.assignments[idx];
            // Priority: explicit label override > colour-mode auto-match > fallback
            const lbl = labels[cid]
              || (colourLabels && colourLabels[cid])
              || { code: 'C' + (cid >= 0 ? cid : 'noise'), rgb: [0, 0, 0] };
            const conf = cid >= 0 ? (colourLabels ? 0.85 : 0.9) : 0.2;
            cells.push({
              col: c,
              row: r,
              code: lbl.code,
              color: lbl.rgb,
              type: 'solid',
              matchConfidence: conf,
            });
            placeholderCells.push({
              col: c,
              row: r,
              code: 'C' + (cid >= 0 ? cid : 'noise'),
              color: lbl.rgb,
              type: 'solid',
              matchConfidence: conf,
            });
          }
        }

        // Build initial label state for the correction UI from colour-mode
        // auto-matches. The user can override any of these in the gallery.
        const initialLabels = {};
        if (colourLabels) {
          for (const k of Object.keys(colourLabels)) initialLabels[k] = colourLabels[k];
        }
        for (const k of Object.keys(labels)) initialLabels[k] = labels[k];

        // Render a JPEG data URL of the original image so the corner editor
        // canvas + cluster gallery have a backdrop image. JPEG keeps the
        // payload small (typical 30-100 KB even for phone photos).
        let previewImageDataUrl = null;
        try { previewImageDataUrl = imageBitmapToDataUrl(imageBitmap, 800, 600); } catch (_) {}

        // Build per-cluster swatch data URLs from auto-matched RGB values.
        // In B&W mode (no colourLabels), the swatch is black so the gallery
        // still shows a card per cluster (the user labels by code).
        const medoidImages = [];
        try {
          const allClusters = new Set();
          for (const a of clu.assignments) if (a >= 0) allClusters.add(a);
          const sorted = Array.from(allClusters).sort((a, b) => a - b);
          for (const cid of sorted) {
            const rgb = (initialLabels[cid] && initialLabels[cid].rgb) || [40, 40, 40];
            medoidImages[cid] = rgbSwatchDataUrl(rgb, 48);
          }
        } catch (_) {}

        // Legend rows for the LegendMappingPanel — initial matchedCluster
        // is null until the user maps it (a future enhancement could auto-
        // match by comparing the OCR'd DMC code to colourLabels per cluster).
        const legendRows = legend.map(l => ({
          raw: l.name || l.code || '',
          code: l.code || '',
          matchedCluster: null,
          confidence: l.confidence || 0,
          source: l.source || '',
        }));


        // Record the wall-clock total for sanity-checking aggregate timings.
        if (T && telemetryId) {
          try { void (nowMs() - t0); } catch (_) {}
        }

        return {
          width: cellRes.cols,
          height: cellRes.rows,
          // RawExtraction shape per types.js + materialise.js
          grid: cells.map(c => ({
            x: c.col, y: c.row,
            source: { kind: 'dmc', id: c.code },
            confidence: c.matchConfidence,
          })),
          cells,
          legend,
          palette: [],
          meta: { publisher: 'image-chart', title: (probe.fileName || '').replace(/\.[^.]+$/, '') },
          flags: {
            warnings: [
              ...(function () {
                    // Use the filtered assignments for B&W mode (empty cells
                    // also carry −1 after scatter and must not be counted as noise).
                    const _wa = filteredAssign || clu.assignments;
                    const noise = _wa.filter(a => a < 0).length;
                    if (!noise) return [];
                    const total = _wa.length || 1;
                    const pct = Math.round((noise / total) * 100);
                    return [{
                      code: 'CLUSTER_NOISE',
                      message: noise + ' of ' + total + ' cells (' + pct + '%) couldn\u2019t be grouped confidently. Review the Symbols tab \u2014 you may need to split or merge clusters, or relabel low-confidence cells.',
                      severity: 'warning',
                      detail: { noiseCount: noise, totalCells: total, percent: pct },
                    }];
                  }()),
              ...(grid && grid.distortion && grid.distortion.distorted
                ? [{
                    code: 'CHART_DISTORTED',
                    message: 'This chart appears to be distorted. For best results, please use the four-corner tool to mark the chart edges, or retake the photo with the book pressed flat.',
                    severity: 'warning',
                    detail: { ratio: grid.distortion.ratio, horizontal: grid.distortion.horizontal, vertical: grid.distortion.vertical },
                  }]
                : []),
            ],
            uncertainCells: (filteredAssign || clu.assignments).filter(a => a < 0).length,
            distorted: !!(grid && grid.distortion && grid.distortion.distorted),
            distortionRatio: (grid && grid.distortion && grid.distortion.ratio) || 1,
          },
          // Phase 2: colour cell samples (null in B&W / Phase 1 mode)
          cellColors: colourResult ? colourResult.cellColors : null,
          colourCols: colourResult ? colourResult.cols : null,
          colourRows: colourResult ? colourResult.rows : null,
          multiPageMetadata: null,
          // Telemetry id so the correction UI can append events and mark
          // acceptance / abandonment.
          telemetryId,
          // Payload for RasterChartCorrectionUI. wireApp.js mounts the UI
          // when this block is present on the raw extraction and the user
          // can edit corners/grid/cluster labels before materialise runs.
          _correction: {
            // The placeholder-coded extraction is what applyCorrections()
            // mutates; the corrected version is then re-materialised.
            extraction: {
              width: cellRes.cols,
              height: cellRes.rows,
              cells: placeholderCells,
              legend,
              palette: [],
              meta: { publisher: 'image-chart', title: (probe.fileName || '').replace(/\.[^.]+$/, '') },
              flags: {
                warnings: [],
                uncertainCells: (filteredAssign || clu.assignments).filter(a => a < 0).length,
              },
            },
            grid: Object.assign({}, grid, { rows: cellRes.rows, cols: cellRes.cols }),
            autoCorners,
            // Normalised [0,1] form: the CorrectionUI works in preview-
            // canvas pixels stretched to 800×600. We divide by the
            // dimensions in which `autoCorners` were captured (before
            // warp resized the working image), NOT by the post-warp
            // workingW/H, otherwise the corners land far outside [0,1].
            autoCornersNorm: autoCorners ? autoCorners.map(function (p) {
              return {
                x: Math.max(0, Math.min(1, p.x / autoCornersSrcW)),
                y: Math.max(0, Math.min(1, p.y / autoCornersSrcH)),
              };
            }) : null,
            distortion: (grid && grid.distortion) || null,
            previewImageDataUrl,
            workingW, workingH,
            initialLabels,
            medoidImages,
            // Per-cluster representative RGB so the UI can render "top-N
            // DMC candidate" chips next to each cluster card. Falls back
            // to the auto-matched label colour in B&W mode where colour
            // clustering didn't run.
            clusterColors: (function () {
              var cc = [];
              try {
                var seen = new Set();
                for (var i = 0; i < clu.assignments.length; i++) {
                  var a = clu.assignments[i];
                  if (a < 0 || seen.has(a)) continue;
                  seen.add(a);
                  var rgb = (initialLabels[a] && initialLabels[a].rgb) || null;
                  if (rgb) cc[a] = rgb.slice ? rgb.slice() : [rgb[0], rgb[1], rgb[2]];
                }
              } catch (_) {}
              return cc;
            }()),
            legendRows,
            // Per-cell cluster id (row-major, length rows*cols, -1 = noise).
            // Used by CorrectionUI's Symbols-tab "show on chart" overlay
            // and the Grid-tab live preview so we can highlight where a
            // given cluster lives without re-running the worker.
            cellClusterIds: Array.from(clu.assignments || []),
            cellEmptyMask: Array.from(cellRes.emptyMask || []),
            // Multi-page payload is empty in single-image imports; the
            // multi-page dropzone surface still mounts but with no thumbs.
            pages: [],
            cellDistances: [],
            cellTopCandidates: [],
            // Original debug payload kept for compatibility with code that
            // already reaches into it (telemetry export, debug overlay).
            clusters: clu,
            features: feat,
            ocrRaw: ocrResult,
            colourResult: colourResult || null,
          },
        };
      } finally {
        try { worker.terminate(); } catch (_) {}
        if (imageBitmap && imageBitmap.close) imageBitmap.close();
      }
    },
  };

  function safeReport(ctx, m) { try { ctx.reportProgress && ctx.reportProgress(m); } catch (_) {} }

  function nowMs() {
    try {
      if (typeof performance !== 'undefined' && performance.now) return performance.now();
    } catch (_) {}
    return Date.now();
  }

  // ── Legend parsing helpers ─────────────────────────────────────────────

  /**
   * Build a structured legend from a raw ocrResult (returned by the worker).
   * Returns an array of { code, name, confidence, source, swatchRgb? } entries.
   * Requires window.RasterChartOCRRepair and window.DMC on the main thread.
   *
   * Swatch RGB attachment: when the worker's word records carry a
   * `swatchRgb` (sampled from the colour swatch to the left of each code
   * during OCR), we walk the words to find the first one whose text
   * parses to the same code as the legend line and copy its swatch RGB
   * onto the entry. Used downstream by parseColourMode to override the
   * catalogue Lab with a ground-truth per-code Lab anchor.
   */
  function buildLegend(ocrResult) {
    if (!ocrResult || !ocrResult.text) return [];
    const OCR = (typeof window !== 'undefined' && window.RasterChartOCRRepair) || null;
    if (!OCR) return [];
    const dmcSet = (typeof window !== 'undefined' && window.DMC)
      ? new Set(window.DMC.map(d => d.id))
      : null;
    // Pre-index word swatches by parsed-code so we can attach RGB to each
    // legend entry in O(1). When two words parse to the same code, the
    // first-seen wins (top-to-bottom in image coordinates).
    const swatchByCode = new Map();
    if (Array.isArray(ocrResult.words)) {
      for (const wd of ocrResult.words) {
        if (!wd || !wd.swatchRgb || !wd.text) continue;
        const parsed = OCR.parseLegendLine(wd.text, dmcSet);
        if (!parsed || !parsed.code) continue;
        const key = parsed.code
          .replace(/^(DMC|Anchor|Madeira|Mad\.?|Sulky)\s*/i, '')
          .replace(/^#/, '');
        if (!swatchByCode.has(key)) swatchByCode.set(key, wd.swatchRgb);
      }
    }
    return ocrResult.text.split('\n')
      .map(line => {
        const parsed = OCR.parseLegendLine(line.trim(), dmcSet);
        if (!parsed) return null;
        const bareCode = parsed.code
          .replace(/^(DMC|Anchor|Madeira|Mad\.?|Sulky)\s*/i, '')
          .replace(/^#/, '');
        const entry = {
          code:       parsed.code,
          name:       parsed.name || '',
          confidence: parsed.source === 'exact' ? 0.95 : parsed.source === 'repaired' ? 0.7 : 0.5,
          source:     parsed.source,
        };
        const swatch = swatchByCode.get(bareCode);
        if (swatch) entry.swatchRgb = swatch;
        return entry;
      })
      .filter(Boolean);
  }

  /**
   * Compute the telemetry confidence fields for the legend stage.
   */
  function buildLegendMeta(legend, ocrResult) {
    const meanWordConfidence = (ocrResult && ocrResult.meanConfidence) || 0;
    let regexValidatedCount = 0, confusionRepairedCount = 0;
    for (const e of legend) {
      if (e.source === 'exact')    regexValidatedCount++;
      if (e.source === 'repaired') confusionRepairedCount++;
    }
    return { meanWordConfidence, regexValidatedCount, confusionRepairedCount };
  }

  // ── Silhouette proxy (Phase 2 §5) ──────────────────────────────────────
  // A true silhouette score needs O(N²) intra-cluster distances. As a
  // cheap proxy we use medoid-based silhouette: for each assigned point i,
  //   a_i = euclidean(feature_i, medoid_of_own_cluster)
  //   b_i = min over other clusters c' of euclidean(feature_i, medoid_c')
  //   s_i = (b_i - a_i) / max(a_i, b_i)
  // Mean s_i across all non-noise points. Returns 0 when clusters < 2 or
  // no assigned points (no signal). Range [-1, 1]; higher is better.
  //
  // Feature-set selection (post palette-seeded migration):
  //   • Colour-mode (paletteSeededCluster) returns `clu.labFeatures` — a
  //     per-cell Lab vector. The cluster identity is driven by Lab, so we
  //     prefer Lab features when present so the score actually reflects
  //     what was clustered.
  //   • B&W / fallback DBSCAN paths leave `clu.labFeatures` undefined; we
  //     fall back to HOG `feat.features` so the existing telemetry path
  //     keeps producing the same numbers it did before.
  // Returns { score, mode: 'lab' | 'shape' | 'none' }.
  function computeSilhouetteProxy(clu, feat) {
    if (!clu || !clu.assignments || !clu.medoids) {
      return { score: 0, mode: 'none' };
    }
    let features, mode;
    if (Array.isArray(clu.labFeatures) && clu.labFeatures.length) {
      features = clu.labFeatures;
      mode = 'lab';
    } else if (feat && feat.features && feat.features.length) {
      features = feat.features;
      mode = 'shape';
    } else {
      return { score: 0, mode: 'none' };
    }
    const assigns = clu.assignments;
    const medoids = clu.medoids;
    // Collect cluster ids with valid medoids.
    const clusterIds = [];
    for (let c = 0; c < medoids.length; c++) {
      if (medoids[c] != null && features[medoids[c]]) clusterIds.push(c);
    }
    if (clusterIds.length < 2) return { score: 0, mode };
    // Cache medoid feature vectors.
    const medoidVecs = clusterIds.map(c => features[medoids[c]]);
    function dist(a, b) {
      let s = 0; const n = a.length;
      for (let i = 0; i < n; i++) { const d = a[i] - b[i]; s += d * d; }
      return Math.sqrt(s);
    }
    let sum = 0, count = 0;
    for (let i = 0; i < assigns.length; i++) {
      const own = assigns[i];
      if (own < 0) continue;
      const vec = features[i];
      if (!vec) continue;
      const ownIdx = clusterIds.indexOf(own);
      if (ownIdx < 0) continue;
      const a = dist(vec, medoidVecs[ownIdx]);
      let b = Infinity;
      for (let k = 0; k < clusterIds.length; k++) {
        if (k === ownIdx) continue;
        const d = dist(vec, medoidVecs[k]);
        if (d < b) b = d;
      }
      if (!isFinite(b)) continue;
      const denom = Math.max(a, b);
      if (denom === 0) continue;
      sum += (b - a) / denom;
      count++;
    }
    return { score: count > 0 ? sum / count : 0, mode };
  }

  // ── Colour-mode path (Phase 2) ─────────────────────────────────────────
  // Invoked when opts.image.colourMode === true. Extracts per-cell average
  // RGB, converts to Lab inside the worker, and runs DBSCAN with z-score
  // normalisation + 0.6 Lab-column weight. The cluster centroids are then
  // matched against the DMC palette using the main-thread colour-utils.js
  // findBest function (Lab nearest-neighbour, D50).
  //
  // Returns the same RawExtraction shape as the B&W path so materialise.js
  // is unchanged; the correction UI still shows for user review, but the
  // label suggestions are pre-filled with DMC matches.

  async function parseColourMode(worker, imageBitmap, workingW, workingH, grid, cellRes, feat, timings, ctx, legend) {
    if (ctx) safeReport(ctx, { stage: 'extract', label: 'colour-sample' });
    const colourRgba = imageBitmapToRGBA(imageBitmap, workingW, workingH);
    const colRes = await rpc(worker, {
      type: 'extractCellColors', rgba: colourRgba, w: workingW, h: workingH, grid,
    }, [colourRgba.buffer]);

    if (ctx) safeReport(ctx, { stage: 'extract', label: 'colour-cluster' });
    const t0 = nowMs();
    // Palette-seeded clustering is the colour-mode default. Every cell is
    // snapped to the nearest DMC code (CIEDE2000 in Lab); cells that share
    // a code form a cluster. Within each palette cluster a second pass
    // looks at HOG features and splits if more than one dense glyph sub-
    // cluster is present (covers the case where the chart legend reuses a
    // colour for multiple symbols, e.g. back-stitch + full-stitch in 310).
    //
    // Palette restriction (task E): when the legend OCR returned ≥ 3
    // confidently-parsed DMC codes, we restrict the palette to just those
    // codes. A printed chart can't possibly use a code that isn't in its
    // own legend, so this lets us avoid snapping borderline cells to a
    // nearby-but-absent code (e.g. mistaking a chart's 311 swatch for the
    // unlisted 312). Falls back to the full DMC catalogue when the legend
    // is missing, ambiguous, or unusually short.
    //
    // The old generic-DBSCAN path (cluster on [HOG + dHash + Lab]) is
    // kept as a fallback for when the palette is unavailable.
    const features = (feat && feat.features) || null;
    const dHashes = (feat && feat.dHashes) ? feat.dHashes.map(b => b.toString()) : null;
    const dmc = (typeof window !== 'undefined' && window.DMC) || [];
    const fullPalette = dmc
      .filter(p => p && p.lab)
      .map(p => ({ id: p.id, lab: p.lab, rgb: p.rgb }));
    // Build the restricted palette from legend codes if usable.
    let palette = fullPalette;
    let paletteRestricted = false;
    if (legend && Array.isArray(legend)) {
      const exactCodes = new Set(
        legend.filter(l => l.source === 'exact' && l.code).map(l => l.code),
      );
      const repairedCodes = new Set(
        legend.filter(l => l.source === 'repaired' && l.code).map(l => l.code),
      );
      // Require ≥ 3 exact matches before restricting. Below that the
      // legend OCR is too unreliable; we'd rather over-match into the full
      // catalogue than drop real codes on the floor.
      if (exactCodes.size >= 3) {
        const allowed = new Set([...exactCodes, ...repairedCodes]);
        const restricted = fullPalette.filter(p => allowed.has(p.id));
        if (restricted.length >= 3) {
          palette = restricted;
          paletteRestricted = true;
        }
      }
    }

    // ── Legend-swatch Lab override ──────────────────────────────────────
    // For every palette code whose legend entry carried a swatchRgb (mean
    // RGB of the printed colour swatch next to the code), recompute its
    // Lab from the swatch instead of using the catalogue Lab. The printed
    // swatch is a ground-truth measurement of how the printer rendered
    // *this code on this chart*, so it tracks ink-shift and lighting
    // automatically. Falls back to catalogue Lab silently when swatch is
    // missing or window.rgbToLab is unavailable.
    let swatchOverrideCount = 0;
    if (legend && Array.isArray(legend) && palette.length) {
      const toLab = (typeof window !== 'undefined' && typeof window.rgbToLab === 'function')
        ? window.rgbToLab : null;
      if (toLab) {
        const swatchByCode = new Map();
        for (const l of legend) {
          if (l && l.swatchRgb && l.code) {
            const bare = l.code
              .replace(/^(DMC|Anchor|Madeira|Mad\.?|Sulky)\s*/i, '')
              .replace(/^#/, '');
            if (!swatchByCode.has(bare)) swatchByCode.set(bare, l.swatchRgb);
          }
        }
        if (swatchByCode.size) {
          palette = palette.map(p => {
            const sw = swatchByCode.get(p.id);
            if (!sw) return p;
            try {
              const lab = toLab(sw[0], sw[1], sw[2]);
              swatchOverrideCount++;
              return { id: p.id, rgb: p.rgb, lab };
            } catch (_) { return p; }
          });
        }
      }
    }
    let clu;
    let usedPaletteSeed = false;
    if (palette.length) {
      clu = await rpc(worker, {
        type: 'paletteSeededCluster',
        cellColors: colRes.cellColors, cols: colRes.cols, rows: colRes.rows,
        palette, features, dHashes,
        opts: { minPts: 2, shapeSubSplit: true, subSplitMin: 8 },
      }, [colRes.cellColors.buffer]);
      usedPaletteSeed = true;
    } else {
      clu = await rpc(worker, {
        type: 'colourCluster',
        cellColors: colRes.cellColors, cols: colRes.cols, rows: colRes.rows,
        features, dHashes,
        opts: { minPts: 2, normalise: true, labDims: 3, labWeight: 0.6 },
      }, [colRes.cellColors.buffer]);
    }
    timings.cluster = nowMs() - t0;

    // Cluster→DMC labels.
    // In palette-seeded mode the worker already tells us which palette
    // index seeded each cluster, so labels are exact and free. In the
    // fallback DBSCAN mode we walk the cluster medoids and look them up
    // by ΔE2000 (used to use findBest with the wrong argument order, which
    // silently threw — see commit history).
    const clusterLabels = {};
    if (usedPaletteSeed && clu.clusterCodes) {
      for (let cid = 0; cid < clu.clusterCodes.length; cid++) {
        const p = palette[clu.clusterCodes[cid]];
        if (p) clusterLabels[cid] = { code: p.id, rgb: p.rgb || [0, 0, 0] };
      }
    } else {
      const dE2000 = (typeof window !== 'undefined' && typeof window.dE2000 === 'function')
        ? window.dE2000 : null;
      if (dmc.length && clu.labFeatures) {
        const medoidsByCluster = new Map();
        for (let i = 0; i < clu.assignments.length; i++) {
          const c = clu.assignments[i];
          if (c < 0 || medoidsByCluster.has(c)) continue;
          if (clu.medoids[c] == null) continue;
          medoidsByCluster.set(c, clu.labFeatures[clu.medoids[c]]);
        }
        for (const [cid, lab] of medoidsByCluster) {
          try {
            let best = null;
            let bestD = Infinity;
            for (let i = 0; i < dmc.length; i++) {
              const p = dmc[i];
              if (!p.lab) continue;
              const d = dE2000 ? dE2000(lab, p.lab) : (
                (lab[0] - p.lab[0]) ** 2 +
                (lab[1] - p.lab[1]) ** 2 +
                (lab[2] - p.lab[2]) ** 2
              );
              if (d < bestD) { bestD = d; best = p; }
            }
            if (best) clusterLabels[cid] = { code: best.id, rgb: best.rgb || [0, 0, 0] };
          } catch (_) {}
        }
      }
    }

    return {
      clu, clusterLabels,
      cellColors: colRes.cellColors, cols: colRes.cols, rows: colRes.rows,
      paletteRestricted, paletteSize: palette.length,
      bgOffset: (clu && clu.bgOffset) || null,
      swatchOverrideCount,
    };
  }

  function imageBitmapToRGBA(bm, w, h) {
    const oc = new OffscreenCanvas(w, h);
    const cx = oc.getContext('2d');
    cx.drawImage(bm, 0, 0, w, h);
    return new Uint8ClampedArray(cx.getImageData(0, 0, w, h).data);
  }

  // Render an ImageBitmap to a JPEG data URL for the correction UI's
  // corner / cluster / review canvases. Uses an OffscreenCanvas when
  // available (Chromium / Firefox 105+) and falls back to a regular
  // canvas. Returns null on any failure rather than throwing.
  function imageBitmapToDataUrl(bm, maxW, maxH) {
    if (!bm) return null;
    const ratio = Math.min(maxW / bm.width, maxH / bm.height, 1);
    const w = Math.max(1, Math.round(bm.width * ratio));
    const h = Math.max(1, Math.round(bm.height * ratio));
    try {
      if (typeof OffscreenCanvas !== 'undefined' && OffscreenCanvas.prototype.convertToBlob) {
        // OffscreenCanvas.toDataURL isn't universally supported; use a
        // regular canvas for the encode step instead.
      }
    } catch (_) {}
    try {
      if (typeof document !== 'undefined') {
        const cv = document.createElement('canvas');
        cv.width = w; cv.height = h;
        cv.getContext('2d').drawImage(bm, 0, 0, w, h);
        return cv.toDataURL('image/jpeg', 0.78);
      }
    } catch (_) {}
    return null;
  }

  // Small solid-colour swatch as a data URL — used by the cluster gallery
  // when colourMode has auto-matched each cluster to a DMC RGB triple.
  function rgbSwatchDataUrl(rgb, size) {
    if (typeof document === 'undefined') return null;
    try {
      const cv = document.createElement('canvas');
      cv.width = size; cv.height = size;
      const cx = cv.getContext('2d');
      const r = Math.max(0, Math.min(255, rgb[0] | 0));
      const g = Math.max(0, Math.min(255, rgb[1] | 0));
      const b = Math.max(0, Math.min(255, rgb[2] | 0));
      cx.fillStyle = 'rgb(' + r + ',' + g + ',' + b + ')';
      cx.fillRect(0, 0, size, size);
      return cv.toDataURL('image/png');
    } catch (_) { return null; }
  }

  function loadImage(url) {
    return new Promise((res, rej) => {
      const im = new Image();
      im.onload = () => res(im);
      im.onerror = () => rej(new Error('Could not decode image'));
      im.src = url;
    });
  }

  function rpc(worker, msg, transfer) {
    return new Promise((resolve, reject) => {
      const id = Math.random().toString(36).slice(2);
      function onMsg(ev) {
        const d = ev.data || {};
        if (d.id !== id && d.type !== 'progress') return;
        if (d.type === 'progress') return; // ignore in rpc; caller sees via ctx
        worker.removeEventListener('message', onMsg);
        if (d.type === 'error') reject(Object.assign(new Error(d.error.message), { name: d.error.name }));
        else resolve(d.payload);
      }
      worker.addEventListener('message', onMsg);
      worker.postMessage(Object.assign({ id }, msg), transfer || []);
    });
  }

  if (typeof window !== 'undefined' && window.ImportEngine && typeof window.ImportEngine.register === 'function') {
    window.ImportEngine.register(rasterChartStrategy);
  }
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = { rasterChartStrategy };
  }
})();
