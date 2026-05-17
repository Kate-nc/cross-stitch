/* creator/rasterChart/CorrectionUI.js
 * ════════════════════════════════════════════════════════════════════════
 *   Human-in-the-loop correction UI for the raster chart importer.
 *
 *   Surfaces (in priority order, per spec):
 *     1. 4-corner drag tool for perspective correction
 *     2. Grid-alignment handles for one-pixel nudging of pitch + origin
 *     3. Cluster gallery (medoids, labels, swatch, split/merge, confidence)
 *     4. "Needs review" overlay on the chart highlighting top-5% distance
 *        cells; clicking shows the 3 nearest medoid candidates
 *     5. Manual legend mapping panel for unmatched OCR rows
 *
 *   This file is loaded as a plain <script> after React + ImportEngine.
 *   It exposes window.RasterChartCorrectionUI as a React component that
 *   takes a `pendingImport` payload + `onCommit(rawExtraction)` callback.
 *
 *   The component is intentionally framework-light: it uses React.createElement
 *   directly (no JSX) so it doesn't depend on the Babel runtime being live
 *   at the point of load.
 * ════════════════════════════════════════════════════════════════════════
 */

(function () {
  'use strict';
  if (typeof window === 'undefined' || !window.React) return;

  const { useState, useMemo, useCallback, useRef, useEffect } = window.React;
  const h = window.React.createElement;

  const TABS = [
    { id: 'corners',    label: 'Corners' },
    { id: 'grid',       label: 'Grid' },
    { id: 'clusters',   label: 'Symbols' },
    { id: 'review',     label: 'Needs review' },
    { id: 'legend',     label: 'Legend' },
    { id: 'multipage',  label: 'Pages' },
  ];

  function RasterChartCorrectionUI(props) {
    const { pending, onCommit, onCancel, dmcPalette, telemetryId, initialLabels, onRecomputeCorners } = props;
    const [tab, setTab] = useState('corners');
    // Corner state lives in *canvas pixel* coordinates (CANVAS_W × CANVAS_H).
    // We seed from autoCornersNorm → canvas px so the overlay always lines
    // up with the preview image regardless of the working-image dims.
    const initialCanvasCorners = useMemo(() => normToCanvas(pending.autoCornersNorm) || workingToCanvas(pending.autoCorners, pending), [pending]);
    const [corners, setCorners] = useState(initialCanvasCorners);
    const [recomputing, setRecomputing] = useState(false);
    const [grid, setGrid] = useState(pending.grid || null);
    // Seed labels from caller-supplied initialLabels so colour-mode
    // auto-matches survive even if the user clicks Finish without
    // touching the Symbols tab. The map is shaped { clusterId → {code, rgb, name} }.
    const [labels, setLabels] = useState(initialLabels ? Object.assign({}, initialLabels) : {});
    const [splits, setSplits] = useState({}); // clusterId → split-into-N
    const [merges, setMerges] = useState({}); // clusterId → mergedIntoId
    const [reviewIdx, setReviewIdx] = useState(null);

    // ─── Phase 1 telemetry: record each manual correction surface ─────
    // Skipped when telemetryId is absent (caller opted out, or the
    // pending payload is synthetic). Telemetry writes are fire-and-forget.
    const T = (typeof window !== 'undefined' && window.RasterChartTelemetry) || null;
    function logCorrection(surface, details) {
      if (!T || !telemetryId) return;
      try { T.recordCorrection(telemetryId, surface, details || {}); } catch (_) {}
    }
    const initialCorners = useRef(pending.corners || null);
    const initialGrid = useRef(pending.grid || null);
    useEffect(() => {
      if (corners && corners !== initialCorners.current) {
        logCorrection('manual-4-corner', { corners });
      }
    }, [corners]);
    useEffect(() => {
      if (grid && grid !== initialGrid.current) {
        logCorrection('manual-grid-nudge', {
          cellPitch: grid.cellPitch, originRow: grid.originRow, originCol: grid.originCol,
        });
      }
    }, [grid]);

    const palette = useMemo(() => dmcPalette || (typeof window !== 'undefined' && window.DMC) || [], [dmcPalette]);

    const onLabelChange = useCallback((cid, patch) => {
      setLabels(prev => {
        const before = prev[cid];
        const next = Object.assign({}, prev, { [cid]: Object.assign({}, prev[cid], patch) });
        if (T && telemetryId) {
          try {
            T.recordCorrection(telemetryId, 'cluster-relabel', {
              clusterId: cid, before: before || null, after: next[cid],
            });
          } catch (_) {}
        }
        return next;
      });
    }, [telemetryId]);

    const handleCommit = useCallback(() => {
      // Apply user-edited labels + merges onto the raw cluster output and
      // emit a finalised RawExtraction-compatible payload.
      const out = applyCorrections(pending, { corners, grid, labels, merges, splits });
      if (T && telemetryId) {
        try { T.markAcceptance(telemetryId, 'accepted'); } catch (_) {}
      }
      onCommit && onCommit(out);
    }, [pending, corners, grid, labels, merges, splits, onCommit, telemetryId]);

    const handleCancel = useCallback(() => {
      if (T && telemetryId) {
        try { T.markAcceptance(telemetryId, 'abandoned'); } catch (_) {}
      }
      onCancel && onCancel();
    }, [onCancel, telemetryId]);

    return h('div', { className: 'rc-correction-modal modal-overlay' },
      h('div', { className: 'modal-content rc-correction-content', style: { maxWidth: 1100, width: '95vw' } },
        h('header', { className: 'rc-correction-header' },
          h('h2', null, 'Review chart import'),
          h('div', { className: 'rc-tabs' }, TABS.map(t =>
            h('button', {
              key: t.id, type: 'button',
              className: 'tb-btn' + (tab === t.id ? ' tb-btn--on' : ''),
              onClick: () => setTab(t.id),
            }, t.label + (t.id === 'corners' && pending.distortion && pending.distortion.distorted ? ' \u2022' : ''))
          )),
        ),
        // Distortion banner visible from any tab so the user always knows
        // why the import looks wrong and how to fix it.
        pending.distortion && pending.distortion.distorted && tab !== 'corners' && h('div', {
          className: 'rc-correction-global-banner',
          role: 'alert',
          style: {
            margin: '0 0 10px', padding: '8px 12px', borderRadius: 6,
            border: '1px solid var(--accent, #d97706)',
            background: 'var(--surface-warning, #fef3c7)',
            color: 'var(--text-primary, #1f2937)',
            display: 'flex', alignItems: 'center', gap: 12,
          },
        },
          h('span', null, 'This chart looks distorted (pitch ratio ' + ((pending.distortion.ratio || 1).toFixed(2)) + '). Use the Corners tab to mark the chart edges.'),
          h('button', { type: 'button', className: 'tb-btn', onClick: () => setTab('corners') }, 'Open Corners tab'),
        ),
        h('div', { className: 'rc-correction-body' },
          tab === 'corners' && h(CornerEditor, {
            pending, corners, onChange: setCorners,
            recomputing,
            onRecompute: onRecomputeCorners ? () => {
              if (recomputing) return;
              setRecomputing(true);
              const norm = canvasToNorm(corners);
              return Promise.resolve(onRecomputeCorners(norm))
                .catch(err => {
                  console.error('[CorrectionUI] recompute failed:', err);
                  if (window.Toast && window.Toast.show) {
                    window.Toast.show({ message: 'Recompute failed: ' + (err && err.message || err), type: 'error', duration: 8000 });
                  }
                })
                .then(() => setRecomputing(false));
            } : null,
          }),
          tab === 'grid'    && h(GridEditor,   { pending, grid, onChange: setGrid }),
          tab === 'clusters'&& h(ClusterGallery, {
            pending, labels, palette, onLabelChange,
            onSplit: (cid, n) => {
              setSplits(s => Object.assign({}, s, { [cid]: n }));
              logCorrection('cluster-split', { clusterId: cid, into: n });
            },
            onMerge: (a, b) => {
              setMerges(m => Object.assign({}, m, { [a]: b }));
              logCorrection('cluster-merge', { from: a, into: b });
            },
          }),
          tab === 'review'  && h(NeedsReviewOverlay, {
            pending, grid, reviewIdx, setReviewIdx, labels,
            onCellFix: (cellIdx, fromCid, toCid) =>
              logCorrection('flagged-cell-corrected', { cellIdx, from: fromCid, to: toCid }),
          }),
          tab === 'legend'    && h(LegendMappingPanel, {
            pending, labels, onLabelChange,
            onManualMap: (legendSymbolIdx, clusterId) =>
              logCorrection('legend-manual-map', { legendSymbolIdx, clusterId }),
          }),
          tab === 'multipage' && h(MultiPageTab, {
            pending,
            onReorder: (newOrder) => logCorrection('multi-page-reorder', { newOrder }),
          }),
        ),
        h('footer', { className: 'rc-correction-footer' },
          h('button', { type: 'button', className: 'tb-btn', onClick: handleCancel }, 'Cancel'),
          h('button', { type: 'button', className: 'tb-btn tb-btn--primary', onClick: handleCommit },
            'Finish import'),
        ),
      ),
    );
  }

  // ── Surface 1: 4-corner drag tool ──────────────────────────────────────
  // Canvas dimensions for the corner overlay. The preview JPEG is
  // pre-rendered at this size by the strategy (see imageBitmapToDataUrl),
  // so working in canvas pixels keeps everything in one coordinate
  // system. We convert to normalised [0,1] when sending corners back to
  // the worker for a recompute.
  const CANVAS_W = 800, CANVAS_H = 600;
  function normToCanvas(norm) {
    if (!norm) return null;
    return norm.map(p => ({ x: p.x * CANVAS_W, y: p.y * CANVAS_H }));
  }
  function workingToCanvas(corners, pending) {
    if (!corners) return null;
    const w = pending.workingW || CANVAS_W;
    const ht = pending.workingH || CANVAS_H;
    return corners.map(p => ({ x: p.x / w * CANVAS_W, y: p.y / ht * CANVAS_H }));
  }
  function canvasToNorm(corners) {
    if (!corners) return null;
    return corners.map(p => ({ x: p.x / CANVAS_W, y: p.y / CANVAS_H }));
  }

  function CornerEditor({ pending, corners, onChange, recomputing, onRecompute }) {
    const canvasRef = useRef(null);
    const [drag, setDrag] = useState(-1);
    const [focused, setFocused] = useState(0);
    const distortion = pending.distortion || null;

    const c = corners || normToCanvas(pending.autoCornersNorm) || defaultCornersCanvas();
    useEffect(() => {
      const cv = canvasRef.current;
      if (!cv || !pending.previewImage) return;
      drawCornerPreview(cv, pending.previewImage, c, focused);
    }, [pending.previewImage, c, focused]);

    // Keyboard nudge: 1px per Arrow, 10px with Shift. Wraps focus with Tab.
    useEffect(() => {
      function onKey(ev) {
        if (ev.target && /input|textarea|select/i.test(ev.target.tagName || '')) return;
        const step = ev.shiftKey ? 10 : 1;
        let dx = 0, dy = 0;
        if (ev.key === 'ArrowLeft') dx = -step;
        else if (ev.key === 'ArrowRight') dx = step;
        else if (ev.key === 'ArrowUp') dy = -step;
        else if (ev.key === 'ArrowDown') dy = step;
        else if (ev.key === 'Tab') { ev.preventDefault(); setFocused((focused + (ev.shiftKey ? 3 : 1)) % 4); return; }
        else return;
        ev.preventDefault();
        const next = c.slice();
        next[focused] = { x: next[focused].x + dx, y: next[focused].y + dy };
        onChange(next);
      }
      document.addEventListener('keydown', onKey);
      return () => document.removeEventListener('keydown', onKey);
    }, [c, focused, onChange]);

    function onPointerDown(ev) {
      const rect = canvasRef.current.getBoundingClientRect();
      const px = ev.clientX - rect.left, py = ev.clientY - rect.top;
      let best = -1, bd = 20;
      for (let i = 0; i < 4; i++) {
        const d = Math.hypot(px - c[i].x, py - c[i].y);
        if (d < bd) { bd = d; best = i; }
      }
      setDrag(best);
      if (best >= 0) setFocused(best);
    }
    function onPointerMove(ev) {
      if (drag < 0) return;
      const rect = canvasRef.current.getBoundingClientRect();
      const px = ev.clientX - rect.left, py = ev.clientY - rect.top;
      const next = c.slice();
      next[drag] = { x: px, y: py };
      onChange(next);
    }
    function onPointerUp() { setDrag(-1); }
    function resetCorners() {
      onChange(normToCanvas(pending.autoCornersNorm) || defaultCornersCanvas());
    }

    return h('div', { className: 'rc-corner-editor' },
      distortion && distortion.distorted && h('div', {
        className: 'rc-distortion-warning',
        role: 'alert',
        style: {
          padding: '10px 14px',
          marginBottom: 12,
          borderRadius: 6,
          border: '1px solid var(--accent, #d97706)',
          background: 'var(--surface-warning, #fef3c7)',
          color: 'var(--text-primary, #1f2937)',
        },
      },
        h('strong', null, 'This chart appears to be distorted.'),
        h('p', { style: { margin: '4px 0 0' } },
          'For best results, please use the four-corner tool below to mark the chart edges, or retake the photo with the book pressed flat. ' +
          'Detected pitch ratio: ' + (distortion.ratio ? distortion.ratio.toFixed(2) : '?') + ' (anything above 1.15 looks curved).'),
      ),
      h('p', null, 'Drag the four corners to match the chart\'s outer border. Click a handle and use the arrow keys (Shift = 10px) for precise nudges.'),
      h('div', { style: { display: 'flex', gap: 8, marginBottom: 8, alignItems: 'center', flexWrap: 'wrap' } },
        h('button', { type: 'button', className: 'tb-btn', onClick: resetCorners, disabled: recomputing }, 'Reset to auto-detected'),
        onRecompute && h('button', {
          type: 'button', className: 'tb-btn tb-btn--primary',
          onClick: onRecompute, disabled: recomputing,
          title: 'Re-run perspective warp, grid detection, and clustering using these corners',
        }, recomputing ? 'Recomputing\u2026 (this may take a minute)' : 'Recompute extraction'),
        h('span', { style: { fontSize: 12, opacity: 0.75 } },
          'Focused corner: ' + (['top-left','top-right','bottom-right','bottom-left'][focused] || focused)),
      ),
      h('div', { style: { display: 'flex', gap: 12, flexWrap: 'wrap' } },
        h('canvas', {
          ref: canvasRef, width: CANVAS_W, height: CANVAS_H, tabIndex: 0,
          style: { flex: '1 1 480px', maxWidth: '100%', height: 'auto', cursor: drag >= 0 ? 'grabbing' : 'crosshair', border: '1px solid var(--border)', opacity: recomputing ? 0.6 : 1 },
          onMouseDown: recomputing ? null : onPointerDown,
          onMouseMove: recomputing ? null : onPointerMove,
          onMouseUp: onPointerUp, onMouseLeave: onPointerUp,
        }),
        h(WarpedPreviewPane, { previewImage: pending.previewImage, corners: c }),
      ),
    );
  }

  // Tiny live preview of what the chart will look like after the warp.
  // Cheap CPU homography on a downsampled canvas. Updates whenever the
  // user drags or nudges a corner so they can see when the perspective
  // actually looks square.
  function WarpedPreviewPane({ previewImage, corners }) {
    const ref = useRef(null);
    useEffect(() => {
      const cv = ref.current;
      if (!cv || !previewImage || !corners || corners.length !== 4) return;
      drawWarpedPreview(cv, previewImage, corners);
    }, [previewImage, corners]);
    return h('div', { style: { flex: '0 0 240px', minWidth: 200 } },
      h('div', { style: { fontSize: 12, fontWeight: 600, marginBottom: 4, opacity: 0.8 } }, 'Warped preview'),
      h('canvas', {
        ref: ref, width: 240, height: 180,
        style: { width: '100%', height: 'auto', border: '1px solid var(--border)', background: '#0f172a' },
      }),
      h('p', { style: { fontSize: 11, opacity: 0.7, marginTop: 4 } },
        'Live preview of how the corners will warp the chart. Click \u201cRecompute extraction\u201d when this looks square.'),
    );
  }

  function defaultCornersCanvas() {
    return [
      { x: 0,        y: 0 },
      { x: CANVAS_W, y: 0 },
      { x: CANVAS_W, y: CANVAS_H },
      { x: 0,        y: CANVAS_H },
    ];
  }

  function defaultCorners(pending) {
    const w = pending.workingW || 800, ht = pending.workingH || 600;
    return [{ x: 0, y: 0 }, { x: w - 1, y: 0 }, { x: w - 1, y: ht - 1 }, { x: 0, y: ht - 1 }];
  }
  function drawCornerPreview(canvas, image, corners, focused) {
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    if (image && image.width) ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
    ctx.strokeStyle = '#0d9488'; ctx.lineWidth = 2;
    ctx.beginPath();
    corners.forEach((p, i) => i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y));
    ctx.closePath(); ctx.stroke();
    for (let i = 0; i < corners.length; i++) {
      const p = corners[i];
      ctx.fillStyle = i === focused ? '#ea580c' : '#0d9488';
      ctx.beginPath(); ctx.arc(p.x, p.y, i === focused ? 10 : 8, 0, Math.PI * 2); ctx.fill();
    }
  }

  // ── Warped-preview helper ─────────────────────────────────────────────
  //
  // Solves the 3x3 homography H mapping the unit rectangle [0,0]→[1,0]→
  // [1,1]→[0,1] to the four user-placed corners (in the *source* preview
  // image coords scaled by CANVAS_W/H). Then for each output pixel we
  // compute the source (x,y) via H · (u, v, 1) and sample nearest-neighbour.
  // Renders at 240×180 so the per-frame cost is ~43k samples — well under
  // 16 ms even on mobile.
  function drawWarpedPreview(canvas, image, cornersCanvas) {
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    // Source coordinates: corners are in CANVAS_W×CANVAS_H space. Convert
    // to the natural source-image space (image.width × image.height) so
    // sampling uses the freshest available pixels.
    const sx = image.width / CANVAS_W, sy = image.height / CANVAS_H;
    const src = cornersCanvas.map(p => ({ x: p.x * sx, y: p.y * sy }));
    // Cache the source ImageData on the image object so we only do the
    // off-screen draw + getImageData once — every mousemove during a
    // corner drag would otherwise re-allocate a canvas the size of the
    // full source image, which is expensive on phone photos.
    let srcData = image.__rcCachedImageData;
    if (!srcData) {
      try {
        const off = document.createElement('canvas');
        off.width = image.width; off.height = image.height;
        off.getContext('2d').drawImage(image, 0, 0);
        srcData = off.getContext('2d').getImageData(0, 0, image.width, image.height);
        image.__rcCachedImageData = srcData;
      } catch (_) { return; /* CORS-tainted; skip */ }
    }
    const sw = image.width, sh = image.height;
    const out = ctx.createImageData(canvas.width, canvas.height);
    const H = solveHomographyUnitToQuad(src);
    if (!H) return;
    const ow = canvas.width, oh = canvas.height;
    for (let y = 0; y < oh; y++) {
      const v = y / oh;
      for (let x = 0; x < ow; x++) {
        const u = x / ow;
        const w = H[6] * u + H[7] * v + H[8];
        if (w === 0) continue;
        const px = (H[0] * u + H[1] * v + H[2]) / w;
        const py = (H[3] * u + H[4] * v + H[5]) / w;
        const ix = px | 0, iy = py | 0;
        if (ix < 0 || iy < 0 || ix >= sw || iy >= sh) continue;
        const si = (iy * sw + ix) * 4;
        const di = (y * ow + x) * 4;
        out.data[di]     = srcData.data[si];
        out.data[di + 1] = srcData.data[si + 1];
        out.data[di + 2] = srcData.data[si + 2];
        out.data[di + 3] = 255;
      }
    }
    ctx.putImageData(out, 0, 0);
  }

  // Solve H so that:  unit-rect corners (0,0),(1,0),(1,1),(0,1) map to
  // the four supplied source-image corners. Standard 8-DoF perspective
  // solve via Gauss elimination on the 8×8 system. Returns a 9-element
  // row-major array [h00..h22] with h22 = 1, or null if singular.
  function solveHomographyUnitToQuad(q) {
    // Unit-square source points u,v ∈ {0,1}
    const U = [[0,0],[1,0],[1,1],[0,1]];
    const A = [], b = [];
    for (let i = 0; i < 4; i++) {
      const [u, v] = U[i];
      const X = q[i].x, Y = q[i].y;
      A.push([u, v, 1, 0, 0, 0, -u * X, -v * X]); b.push(X);
      A.push([0, 0, 0, u, v, 1, -u * Y, -v * Y]); b.push(Y);
    }
    const x = gaussSolve(A, b);
    if (!x) return null;
    return [x[0], x[1], x[2], x[3], x[4], x[5], x[6], x[7], 1];
  }

  function gaussSolve(A, b) {
    const n = b.length;
    const M = A.map((row, i) => row.concat([b[i]]));
    for (let col = 0; col < n; col++) {
      // Partial pivot
      let piv = col;
      for (let r = col + 1; r < n; r++) if (Math.abs(M[r][col]) > Math.abs(M[piv][col])) piv = r;
      if (Math.abs(M[piv][col]) < 1e-10) return null;
      if (piv !== col) { const t = M[piv]; M[piv] = M[col]; M[col] = t; }
      for (let r = col + 1; r < n; r++) {
        const f = M[r][col] / M[col][col];
        for (let c = col; c <= n; c++) M[r][c] -= f * M[col][c];
      }
    }
    const x = new Array(n);
    for (let r = n - 1; r >= 0; r--) {
      let s = M[r][n];
      for (let c = r + 1; c < n; c++) s -= M[r][c] * x[c];
      x[r] = s / M[r][r];
    }
    return x;
  }

  // ── Surface 2: grid handles ────────────────────────────────────────────
  function GridEditor({ pending, grid, onChange }) {
    const g = grid || pending.grid || { cellPitch: 20, originRow: 0, originCol: 0, rows: 50, cols: 50 };
    function nudge(key, delta) { onChange(Object.assign({}, g, { [key]: g[key] + delta })); }
    return h('div', { className: 'rc-grid-editor' },
      h('p', null, 'Nudge the grid until cells align with the chart squares.'),
      h('div', { className: 'rc-grid-controls' },
        ['cellPitch', 'originRow', 'originCol'].map(k =>
          h('div', { key: k, className: 'rc-grid-row' },
            h('label', null, k + ': ' + (g[k] || 0).toFixed(1)),
            h('button', { type: 'button', className: 'tb-btn', onClick: () => nudge(k, -1) }, '−1'),
            h('button', { type: 'button', className: 'tb-btn', onClick: () => nudge(k, +1) }, '+1'),
          )),
        h('div', null, `Detected: ${g.rows} rows × ${g.cols} columns, confidence ${(g.confidence || 0).toFixed(2)}`),
      ),
    );
  }

  // ── Surface 3: cluster gallery ─────────────────────────────────────────
  function ClusterGallery({ pending, labels, palette, onLabelChange, onSplit, onMerge }) {
    const medoids = pending.medoidImages || [];
    const clusterColors = pending.clusterColors || [];
    return h('div', { className: 'rc-cluster-gallery' },
      h('p', null, `${medoids.length} unique symbols detected. Label each with its DMC code; merge any duplicates. Suggested DMC matches appear below each cluster — click a chip to apply.`),
      h('div', { className: 'rc-cluster-grid' },
        medoids.map((src, cid) => {
          const lbl = labels[cid] || {};
          const swatchRgb = clusterColors[cid] || lbl.rgb || null;
          const top3 = swatchRgb ? topNDmcMatches(swatchRgb, palette, 3) : [];
          const currentCode = (lbl.code || '').trim();
          return h('div', { key: cid, className: 'rc-cluster-card' },
            h('img', { src, alt: 'Cluster ' + cid, width: 48, height: 48, style: { imageRendering: 'pixelated' } }),
            h('input', {
              type: 'text', placeholder: 'DMC code', value: lbl.code || '',
              onChange: (e) => onLabelChange(cid, { code: e.target.value }),
              list: 'rc-dmc-codes',
            }),
            h('input', {
              type: 'color', value: rgbToHex(lbl.rgb) || '#000000',
              onChange: (e) => onLabelChange(cid, { rgb: hexToRgb(e.target.value) }),
            }),
            h('button', { type: 'button', className: 'tb-btn', onClick: () => onSplit(cid, 2) }, 'Split'),
            h('button', { type: 'button', className: 'tb-btn', onClick: () => {
              const target = prompt('Merge into cluster #?');
              if (target != null && !isNaN(+target)) onMerge(cid, +target);
            }}, 'Merge\u2026'),
            top3.length > 0 && h('div', {
              className: 'rc-cluster-suggestions',
              style: { display: 'flex', gap: 4, marginTop: 4, flexWrap: 'wrap', flexBasis: '100%' },
            },
              top3.map(m => {
                const active = currentCode === m.id;
                return h('button', {
                  key: m.id,
                  type: 'button',
                  title: `${m.id} \u00b7 ${m.name || ''} \u00b7 \u0394E ${m.dE.toFixed(1)}`,
                  onClick: () => onLabelChange(cid, { code: m.id, rgb: m.rgb }),
                  style: {
                    display: 'inline-flex', alignItems: 'center', gap: 4,
                    padding: '2px 6px',
                    border: active ? '2px solid var(--accent, #d97706)' : '1px solid var(--border, #d1d5db)',
                    borderRadius: 4,
                    background: 'var(--surface, #fff)',
                    fontSize: 11, cursor: 'pointer',
                  },
                },
                  h('span', { style: {
                    display: 'inline-block', width: 12, height: 12,
                    background: 'rgb(' + m.rgb.join(',') + ')',
                    border: '1px solid #0003',
                  }}),
                  h('span', null, m.id),
                );
              }),
            ),
          );
        }),
        h('datalist', { id: 'rc-dmc-codes' },
          palette.slice(0, 500).map(p => h('option', { key: p.id, value: p.id }))),
      ),
    );
  }

  // Top-N DMC palette matches by \u0394E (Lab if available, sRGB fallback).
  // The palette entries are expected to be {id, name, rgb, lab}; we tolerate
  // missing .lab by computing it on the fly via window.rgbToLab.
  function topNDmcMatches(rgb, palette, n) {
    if (!palette || !palette.length) return [];
    const toLab = (typeof window !== 'undefined' && typeof window.rgbToLab === 'function')
      ? window.rgbToLab : null;
    const queryLab = toLab ? toLab(rgb[0], rgb[1], rgb[2]) : null;
    const scored = [];
    for (const p of palette) {
      let d;
      if (queryLab) {
        const pl = p.lab || (toLab ? toLab(p.rgb[0], p.rgb[1], p.rgb[2]) : null);
        if (!pl) continue;
        const dl = queryLab[0] - pl[0], da = queryLab[1] - pl[1], db = queryLab[2] - pl[2];
        d = Math.sqrt(dl * dl + da * da + db * db);
      } else {
        const dr = rgb[0] - p.rgb[0], dg = rgb[1] - p.rgb[1], db = rgb[2] - p.rgb[2];
        d = Math.sqrt(dr * dr + dg * dg + db * db);
      }
      scored.push({ id: p.id, name: p.name, rgb: p.rgb, dE: d });
    }
    scored.sort((a, b) => a.dE - b.dE);
    return scored.slice(0, n);
  }

  // ── Surface 4: needs-review overlay ───────────────────────────────────
  function NeedsReviewOverlay({ pending, grid, reviewIdx, setReviewIdx, labels }) {
    const flagged = useMemo(() => {
      const d = pending.cellDistances || [];
      if (!d.length) return [];
      const sorted = d.map((v, i) => ({ v, i })).sort((a, b) => b.v - a.v);
      const cut = Math.max(1, Math.floor(sorted.length * 0.05));
      return sorted.slice(0, cut).map(o => o.i);
    }, [pending.cellDistances]);

    return h('div', { className: 'rc-review' },
      h('p', null, `${flagged.length} cells flagged as low-confidence (top 5%). Click each to verify or reassign.`),
      h('div', { className: 'rc-review-list' },
        flagged.map(i => h('button', {
          key: i, type: 'button', className: 'tb-btn' + (reviewIdx === i ? ' tb-btn--on' : ''),
          onClick: () => setReviewIdx(i),
        }, `Cell #${i}`))),
      reviewIdx != null && h(CellInspector, { pending, idx: reviewIdx, labels }),
    );
  }
  function CellInspector({ pending, idx, labels }) {
    const candidates = (pending.cellTopCandidates && pending.cellTopCandidates[idx]) || [];
    return h('div', { className: 'rc-cell-inspector' },
      h('h4', null, `Cell #${idx} — top candidates`),
      h('ul', null, candidates.map((c, i) =>
        h('li', { key: i }, `Cluster ${c.cluster} (label ${(labels[c.cluster] || {}).code || '?'}) — distance ${c.distance.toFixed(3)}`))),
    );
  }

  // ── Surface 5: legend mapping ─────────────────────────────────────────
  function LegendMappingPanel({ pending, labels, onLabelChange }) {
    const rows = pending.legendRows || [];
    return h('div', { className: 'rc-legend' },
      h('p', null, 'Drag an OCR-detected legend entry onto a cluster, or type the code directly into the Symbols tab.'),
      h('table', { className: 'rc-legend-table' },
        h('thead', null, h('tr', null, h('th', null, 'OCR text'), h('th', null, 'Parsed code'), h('th', null, 'Matched cluster'))),
        h('tbody', null, rows.map((r, i) =>
          h('tr', { key: i },
            h('td', null, r.raw || ''),
            h('td', null, r.code || '—'),
            h('td', null, r.matchedCluster != null
              ? `#${r.matchedCluster}`
              : h('em', null, 'unmatched')),
          ))),
      ),
    );
  }

  // ── Surface 6: multi-page ─────────────────────────────────────────────
  // Uses the standalone MultiPageDropzone component when available;
  // falls back to a plain message.
  function MultiPageTab({ pending, onReorder }) {
    if (typeof window !== 'undefined' && window.RasterChartMultiPageDropzone) {
      return h(window.RasterChartMultiPageDropzone, {
        pages: pending.pages || [],
        onReorder,
      });
    }
    return h('div', { className: 'rc-multipage-placeholder' },
      h('p', null, 'Multi-page support coming soon. Load this page as part of a multi-page sequence using the Import wizard.'),
    );
  }

  // ── Apply corrections ──────────────────────────────────────────────────
  function applyCorrections(pending, edits) {
    const out = JSON.parse(JSON.stringify(pending.extraction || {}));
    const remap = {};
    for (const [from, to] of Object.entries(edits.merges || {})) remap[+from] = +to;
    const resolve = (cid) => { while (remap[cid] != null) cid = remap[cid]; return cid; };

    if (out.cells) {
      const surviving = [];
      for (const c of out.cells) {
        // The strategy stored cluster id encoded in the placeholder code "C<n>".
        const m = /^C(\d+)$/.exec(c.code);
        if (!m) { surviving.push(c); continue; }
        const cid = resolve(parseInt(m[1], 10));
        const lbl = edits.labels[cid];
        if (lbl && lbl.code) {
          c.code = lbl.code;
          c.color = lbl.rgb || c.color;
          surviving.push(c);
        }
        // Drop unlabelled placeholder cells rather than emit invalid "C<n>"
        // codes downstream (materialise would treat them as DMC ids that
        // don't exist, polluting the palette). The Symbols tab is the
        // user's chance to label them; anything they skip becomes empty.
      }
      out.cells = surviving;
    }
    out._corrections = edits;
    return out;
  }

  function rgbToHex(rgb) {
    if (!Array.isArray(rgb)) return '';
    const [r, g, b] = rgb;
    return '#' + [r, g, b].map(v => Math.max(0, Math.min(255, v | 0)).toString(16).padStart(2, '0')).join('');
  }
  function hexToRgb(hex) {
    const m = /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex || '');
    return m ? [parseInt(m[1], 16), parseInt(m[2], 16), parseInt(m[3], 16)] : [0, 0, 0];
  }

  window.RasterChartCorrectionUI = RasterChartCorrectionUI;
  window.RasterChartCorrectionUI.applyCorrections = applyCorrections;
})();
