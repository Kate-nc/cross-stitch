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
    { id: 'grid',       label: 'Grid lines' },
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
    // Synthesise a rectified ("warped") preview image so the Symbols and
    // Grid-lines tabs can overlay highlights / grid lines on a chart that
    // actually looks square. `pending.previewImage` is the ORIGINAL photo
    // (possibly letterboxed), so drawing the grid directly on it would
    // never line up with the chart cells. We use the same CPU homography
    // the corner editor already uses for its WarpedPreviewPane.
    const [warpedPreview, setWarpedPreview] = useState(null);
    useEffect(() => {
      if (!pending.previewImage) { setWarpedPreview(null); return; }
      const cornersForWarp = normToCanvas(pending.autoCornersNorm) || defaultCornersCanvas();
      try {
        const off = document.createElement('canvas');
        off.width = CANVAS_W; off.height = CANVAS_H;
        drawWarpedPreview(off, pending.previewImage, cornersForWarp);
        const img = new Image();
        img.onload = () => setWarpedPreview(img);
        img.src = off.toDataURL('image/jpeg', 0.85);
      } catch (e) {
        // Tainted canvas or homography failure — fall back to the raw preview.
        setWarpedPreview(pending.previewImage);
      }
    }, [pending]);
    // Seed labels from caller-supplied initialLabels so colour-mode
    // auto-matches survive even if the user clicks Finish without
    // touching the Symbols tab. The map is shaped { clusterId → {code, rgb, name} }.
    const [labels, setLabels] = useState(initialLabels ? Object.assign({}, initialLabels) : {});
    const [splits, setSplits] = useState({}); // clusterId → split-into-N
    const [merges, setMerges] = useState({}); // clusterId → mergedIntoId
    const [reviewIdx, setReviewIdx] = useState(null);

    // Auto-seed empty cluster labels with the top-1 DMC match derived
    // from the cluster's average colour. Runs once per pending mount so
    // the Symbols tab is "review and accept" rather than "type from
    // scratch". Only fills clusters that don't already have a label —
    // worker-side findBest matches and user-typed codes are preserved.
    useEffect(() => {
      const cc = pending.clusterColors || [];
      const palette = dmcPalette || (typeof window !== 'undefined' && window.DMC) || [];
      if (!cc.length || !palette.length) return;
      setLabels(prev => {
        const next = Object.assign({}, prev);
        let changed = false;
        for (let cid = 0; cid < cc.length; cid++) {
          const rgb = cc[cid];
          if (!rgb || (prev[cid] && prev[cid].code)) continue;
          const top = topNDmcMatches(rgb, palette, 1);
          if (top.length) {
            next[cid] = { code: top[0].id, rgb: top[0].rgb };
            changed = true;
          }
        }
        return changed ? next : prev;
      });
    }, [pending]);

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
          h('div', { className: 'rc-tabs' }, TABS.map(t => {
            const showBadge = t.id === 'corners' && pending.distortion && pending.distortion.distorted;
            return h('button', {
              key: t.id, type: 'button',
              className: 'tb-btn' + (tab === t.id ? ' tb-btn--on' : ''),
              onClick: () => setTab(t.id),
              title: showBadge ? 'This chart looks distorted — adjust the corners.' : undefined,
            },
              h('span', null, t.label),
              showBadge && h('span', {
                'aria-label': 'distortion detected',
                style: {
                  display: 'inline-block', marginLeft: 6, minWidth: 8, height: 8,
                  borderRadius: '50%', background: 'var(--accent, #d97706)',
                  verticalAlign: 'middle',
                },
              }),
            );
          })),
        ),
        // Distortion banner visible from any tab so the user always knows
        // why the import looks wrong and how to fix it.
        pending.distortion && pending.distortion.distorted && tab !== 'corners' && h('div', {
          className: 'rc-correction-global-banner',
          role: 'alert',
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
          tab === 'grid'    && h(GridEditor,   { pending, grid, onChange: setGrid, warpedPreview }),
          tab === 'clusters'&& h(ClusterGallery, {
            pending, labels, palette, onLabelChange, warpedPreview,
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
          h('button', { type: 'button', className: 'tb-btn tb-btn--green', onClick: handleCommit },
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
    if (!norm || !Array.isArray(norm) || norm.length !== 4) return null;
    // Defensive: clamp to a 10% margin inside the canvas so handles
    // detected slightly outside the image (sub-pixel rounding, old
    // pre-fix data) are still draggable. Anything wildly out of range
    // (>2× the canvas) is rejected so we fall back to the default
    // inset quad instead of showing handles a screenful away.
    for (const p of norm) {
      if (!p || typeof p.x !== 'number' || typeof p.y !== 'number') return null;
      if (!isFinite(p.x) || !isFinite(p.y)) return null;
      if (p.x < -1 || p.x > 2 || p.y < -1 || p.y > 2) return null;
    }
    return norm.map(p => ({
      x: Math.max(0, Math.min(CANVAS_W, p.x * CANVAS_W)),
      y: Math.max(0, Math.min(CANVAS_H, p.y * CANVAS_H)),
    }));
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
      // T4#16: corners live in CANVAS_W×CANVAS_H logical space, but the
      // element may be rendered at a different CSS size. Normalise the
      // pointer position through rect.width/height so hit-testing works
      // at any zoom level or DPR.
      const sx = CANVAS_W / rect.width, sy = CANVAS_H / rect.height;
      const px = (ev.clientX - rect.left) * sx, py = (ev.clientY - rect.top) * sy;
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
      const sx = CANVAS_W / rect.width, sy = CANVAS_H / rect.height;
      const px = (ev.clientX - rect.left) * sx, py = (ev.clientY - rect.top) * sy;
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
      },
        h('strong', null, 'This chart appears to be distorted.'),
        h('p', { style: { margin: '4px 0 0' } },
          'For best results, please use the four-corner tool below to mark the chart edges, or retake the photo with the book pressed flat. ' +
          'Detected pitch ratio: ' + (distortion.ratio ? distortion.ratio.toFixed(2) : '?') + ' (anything above 1.15 looks curved).'),
      ),
      h('p', { className: 'rc-help' }, 'Drag the four corners to match the chart\'s outer border. Click a handle and use the arrow keys (Shift = 10px) for precise nudges.'),
      h('div', { className: 'rc-corner-toolbar' },
        h('button', { type: 'button', className: 'tb-btn', onClick: resetCorners, disabled: recomputing }, 'Reset to auto-detected'),
        onRecompute && h('button', {
          type: 'button', className: 'tb-btn tb-btn--green',
          onClick: onRecompute, disabled: recomputing,
          title: 'Re-run perspective warp, grid detection, and clustering using these corners',
        }, recomputing ? 'Recomputing\u2026 (this may take a minute)' : 'Recompute extraction'),
        h('span', { className: 'rc-corner-status' },
          'Focused corner: ' + (['top-left','top-right','bottom-right','bottom-left'][focused] || focused)),
      ),
      h('div', { className: 'rc-corner-stage' },
        h('canvas', {
          ref: canvasRef, width: CANVAS_W, height: CANVAS_H, tabIndex: 0,
          style: { cursor: drag >= 0 ? 'grabbing' : 'crosshair', opacity: recomputing ? 0.6 : 1 },
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
    // Inset by ~6% so the four handles are clearly grabbable instead of
    // pinned to the canvas border (which fights the page chrome and
    // looks like the chart fills the entire image).
    const mx = CANVAS_W * 0.06, my = CANVAS_H * 0.06;
    return [
      { x: mx,            y: my },
      { x: CANVAS_W - mx, y: my },
      { x: CANVAS_W - mx, y: CANVAS_H - my },
      { x: mx,            y: CANVAS_H - my },
    ];
  }

  function defaultCorners(pending) {
    const w = pending.workingW || 800, ht = pending.workingH || 600;
    return [{ x: 0, y: 0 }, { x: w - 1, y: 0 }, { x: w - 1, y: ht - 1 }, { x: 0, y: ht - 1 }];
  }
  // T4#16: render at device-pixel-ratio for crisp handles on high-DPI
  // (Retina, 4K) displays. The canvas backing store is CANVAS_W*dpr ×
  // CANVAS_H*dpr; we set its CSS dimensions to CANVAS_W × CANVAS_H (and
  // the React style: { maxWidth: '100%', height: 'auto' } keeps the
  // element responsive) and pre-scale the context so callers can keep
  // drawing in logical CANVAS_W×CANVAS_H coordinates.
  function drawCornerPreview(canvas, image, corners, focused) {
    const dpr = Math.max(1, Math.min(3, window.devicePixelRatio || 1));
    const wantW = CANVAS_W * dpr, wantH = CANVAS_H * dpr;
    if (canvas.width !== wantW || canvas.height !== wantH) {
      canvas.width = wantW; canvas.height = wantH;
      // Lock the display size: aspect-ratio + max-width keeps the canvas
      // responsive (shrinks with the parent flex column) while the
      // backing bitmap stays at dpr resolution for crisp rendering.
      canvas.style.aspectRatio = CANVAS_W + ' / ' + CANVAS_H;
      canvas.style.maxWidth = CANVAS_W + 'px';
      canvas.style.height = 'auto';
    }
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, CANVAS_W, CANVAS_H);
    if (image && image.width) ctx.drawImage(image, 0, 0, CANVAS_W, CANVAS_H);
    ctx.strokeStyle = '#0d9488'; ctx.lineWidth = 2;
    ctx.beginPath();
    corners.forEach((p, i) => i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y));
    ctx.closePath(); ctx.stroke();
    // T4#17: per-handle TL/TR/BR/BL labels so the user can tell which
    // corner is which (especially after dragging two corners across).
    const LABELS = ['TL', 'TR', 'BR', 'BL'];
    for (let i = 0; i < corners.length; i++) {
      const p = corners[i];
      ctx.fillStyle = i === focused ? '#ea580c' : '#0d9488';
      ctx.beginPath(); ctx.arc(p.x, p.y, i === focused ? 10 : 8, 0, Math.PI * 2); ctx.fill();
      // Label offset: push outward from the canvas centre so the badge
      // doesn't overlap the chart.
      const cx = CANVAS_W / 2, cy = CANVAS_H / 2;
      const ox = p.x < cx ? -22 : 14;
      const oy = p.y < cy ? -10 : 22;
      ctx.font = 'bold 12px system-ui, sans-serif';
      const text = LABELS[i] || String(i);
      const tw = ctx.measureText(text).width;
      ctx.fillStyle = 'rgba(15, 23, 42, 0.78)';
      ctx.fillRect(p.x + ox - 4, p.y + oy - 12, tw + 8, 16);
      ctx.fillStyle = '#fff';
      ctx.fillText(text, p.x + ox, p.y + oy);
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
  function GridEditor({ pending, grid, onChange, warpedPreview }) {
    const g = grid || pending.grid || { cellPitch: 20, originRow: 0, originCol: 0, rows: 50, cols: 50 };
    // Show the warped preview with the current grid overlaid so the user
    // can see exactly which lines need nudging. Pitch nudges live in
    // grid-cells (one whole row/column), origin nudges in canvas px so
    // a "1" actually moves the grid visibly.
    function setField(key, value) { onChange(Object.assign({}, g, { [key]: value })); }
    function nudge(key, delta) { setField(key, (g[key] || 0) + delta); }
    function resetGrid() { onChange(Object.assign({}, pending.grid || {})); }
    const detectedRows = (pending.grid && pending.grid.rows) || g.rows || 0;
    const detectedCols = (pending.grid && pending.grid.cols) || g.cols || 0;
    const confidence = (g.confidence != null ? g.confidence : (pending.grid && pending.grid.confidence)) || 0;

    // ── Pitch ruler ─────────────────────────────────────────────────────
    // Click 2 grid intersections on the overlay that are `spanCells` cells
    // apart along the dominant axis (or both). The system derives cell
    // pitch sub-pixel-accurately from the span — this is the manual
    // equivalent of the automatic major-grid pitch refinement, and works
    // on charts where the auto-detected pitch drifts across the image.
    // The first click sets the origin (snap one corner to a known
    // intersection); the second click sets the pitch.
    const [rulerSpan, setRulerSpan] = useState(10);
    const [ruler, setRuler] = useState(null); // null | { firstPt: { x, y } | null }
    const [rulerNotice, setRulerNotice] = useState(null);
    const workingW = pending.workingW || CANVAS_W;
    const workingH = pending.workingH || CANVAS_H;

    function startRuler() {
      setRuler({ firstPt: null });
      setRulerNotice('Click the first grid intersection.');
    }
    function cancelRuler() {
      setRuler(null);
      setRulerNotice(null);
    }
    function handleOverlayClick(canvasX, canvasY) {
      if (!ruler) return;
      // Map canvas px → working-image px. The overlay canvas is rendered
      // at CANVAS_W × CANVAS_H but the grid lives in working-image coords.
      const wx = canvasX * (workingW / CANVAS_W);
      const wy = canvasY * (workingH / CANVAS_H);
      if (!ruler.firstPt) {
        setRuler({ firstPt: { x: wx, y: wy } });
        setRulerNotice('Click the second intersection (' + rulerSpan + ' cells away).');
        return;
      }
      const dx = Math.abs(wx - ruler.firstPt.x);
      const dy = Math.abs(wy - ruler.firstPt.y);
      const span = Math.max(dx, dy);
      const newPitch = span / Math.max(1, rulerSpan);
      if (newPitch < 4 || newPitch > 200) {
        setRulerNotice('That span gave an unrealistic cell size (' + newPitch.toFixed(1) + ' px). Try again.');
        setRuler({ firstPt: null });
        return;
      }
      // Snap origin to the first click so the grid aligns with the
      // anchor point. The user can re-nudge it afterwards if needed.
      const originCol = ruler.firstPt.x - Math.round(ruler.firstPt.x / newPitch) * newPitch;
      const originRow = ruler.firstPt.y - Math.round(ruler.firstPt.y / newPitch) * newPitch;
      onChange(Object.assign({}, g, {
        cellPitch: newPitch,
        originCol: ((originCol % newPitch) + newPitch) % newPitch,
        originRow: ((originRow % newPitch) + newPitch) % newPitch,
        pitchSource: 'user-ruler',
      }));
      setRuler(null);
      setRulerNotice('Cell size set to ' + newPitch.toFixed(2) + ' px from your ' + rulerSpan + '-cell measurement.');
    }
    const rulerStep = ruler ? (ruler.firstPt ? 2 : 1) : 0;

    return h('div', { className: 'rc-grid-editor' },
      h('p', { className: 'rc-help' },
        'Each cell of the grid corresponds to one stitch. The detected grid is shown over the chart below — if the lines drift away from the squares as you scan across, nudge the cell size up or down. If everything is shifted by half a cell, nudge the origin.'),
      h(GridOverlayPreview, {
        pending, grid: g, warpedPreview,
        onCanvasClick: ruler ? handleOverlayClick : null,
        rulerPoint: ruler && ruler.firstPt,
        rulerActive: !!ruler,
      }),
      h(CellSamplePreview, { pending, grid: g, warpedPreview }),
      h('div', { className: 'rc-grid-summary' },
        h('span', null, 'Detected: '),
        h('strong', null, detectedRows + ' rows \u00d7 ' + detectedCols + ' columns'),
        h('span', null, ' \u00b7 cell size '),
        h('strong', null, (g.cellPitch || 0).toFixed(1) + ' px'),
        h('span', null, ' \u00b7 confidence '),
        h('strong', null, (confidence * 100).toFixed(0) + '%'),
      ),
      h('div', { className: 'rc-grid-ruler' },
        h('div', { className: 'rc-grid-ruler-head' },
          h('span', { className: 'rc-grid-row-label' }, 'Pitch ruler'),
          h('label', { className: 'rc-grid-ruler-span' },
            h('span', null, 'Cells between clicks:'),
            h('input', {
              type: 'number', min: 2, max: 50, step: 1, value: rulerSpan,
              onChange: (e) => setRulerSpan(Math.max(2, Math.min(50, parseInt(e.target.value, 10) || 10))),
              disabled: !!ruler,
              style: { width: 60, marginLeft: 8 },
            }),
          ),
          ruler
            ? h('button', { type: 'button', className: 'tb-btn', onClick: cancelRuler }, 'Cancel ruler')
            : h('button', { type: 'button', className: 'tb-btn tb-btn--on', onClick: startRuler }, 'Measure pitch'),
        ),
        h('p', { className: 'rc-help rc-grid-row-help' },
          'Find two grid intersections that you know are exactly ' + rulerSpan + ' cells apart (along a row, a column, or diagonally — whichever is easiest to see). Click "Measure pitch", then click each intersection in turn. The cell size is derived from the span and the grid origin snaps to your first click.'),
        rulerNotice && h('p', {
          className: 'rc-grid-ruler-notice',
          role: 'status',
          style: { color: 'var(--accent, #d97706)' },
        }, rulerStep ? '(Step ' + rulerStep + ' of 2) ' + rulerNotice : rulerNotice),
      ),
      h('div', { className: 'rc-grid-controls' },
        h(GridControlRow, {
          label: 'Cell size',
          value: (g.cellPitch || 0).toFixed(1) + ' px',
          help: 'How wide each grid cell is. Increase if the grid looks too tight; decrease if it looks too loose.',
          onMinus: () => nudge('cellPitch', -1),
          onPlus:  () => nudge('cellPitch', +1),
          onMinusBig: () => nudge('cellPitch', -5),
          onPlusBig:  () => nudge('cellPitch', +5),
        }),
        h(GridControlRow, {
          label: 'Row offset',
          value: (g.originRow || 0).toFixed(0) + ' px',
          help: 'Shift the entire grid up or down so the top edge lines up with the first row of stitches.',
          onMinus: () => nudge('originRow', -1),
          onPlus:  () => nudge('originRow', +1),
          onMinusBig: () => nudge('originRow', -5),
          onPlusBig:  () => nudge('originRow', +5),
        }),
        h(GridControlRow, {
          label: 'Column offset',
          value: (g.originCol || 0).toFixed(0) + ' px',
          help: 'Shift the entire grid left or right so the leftmost line meets the first column of stitches.',
          onMinus: () => nudge('originCol', -1),
          onPlus:  () => nudge('originCol', +1),
          onMinusBig: () => nudge('originCol', -5),
          onPlusBig:  () => nudge('originCol', +5),
        }),
      ),
      h('div', { className: 'rc-grid-actions' },
        h('button', { type: 'button', className: 'tb-btn', onClick: resetGrid },
          'Reset to auto-detected grid'),
      ),
    );
  }

  function GridControlRow({ label, value, help, onMinus, onPlus, onMinusBig, onPlusBig }) {
    return h('div', { className: 'rc-grid-row' },
      h('div', { className: 'rc-grid-row-head' },
        h('span', { className: 'rc-grid-row-label' }, label),
        h('span', { className: 'rc-grid-row-value' }, value),
      ),
      h('div', { className: 'rc-grid-row-buttons' },
        h('button', { type: 'button', className: 'tb-btn', onClick: onMinusBig, title: label + ' \u2212 5' }, '\u2212\u2212'),
        h('button', { type: 'button', className: 'tb-btn', onClick: onMinus,    title: label + ' \u2212 1' }, '\u2212'),
        h('button', { type: 'button', className: 'tb-btn', onClick: onPlus,     title: label + ' + 1' }, '+'),
        h('button', { type: 'button', className: 'tb-btn', onClick: onPlusBig,  title: label + ' + 5' }, '++'),
      ),
      h('p', { className: 'rc-help rc-grid-row-help' }, help),
    );
  }

  // Draws the warped preview with the current grid superimposed. Grid
  // values are in pending-working-image pixels; we scale them to the
  // canvas size for display so the editor stays responsive even on phone
  // photos that were warped to a 1024+ px working image.
  function GridOverlayPreview({ pending, grid, warpedPreview, onCanvasClick, rulerPoint, rulerActive }) {
    const ref = useRef(null);
    const img = warpedPreview || pending.previewImage;
    useEffect(() => {
      const cv = ref.current;
      if (!cv || !img) return;
      const dpr = (typeof window !== 'undefined' && window.devicePixelRatio) || 1;
      const W = CANVAS_W, H = CANVAS_H;
      cv.width = W * dpr; cv.height = H * dpr;
      cv.style.width = W + 'px'; cv.style.height = H + 'px';
      const ctx = cv.getContext('2d');
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, W, H);
      ctx.drawImage(img, 0, 0, W, H);
      // Scale grid pixels (working-image space) → preview canvas (CANVAS_W×CANVAS_H).
      const workingW = pending.workingW || W;
      const workingH = pending.workingH || H;
      const sx = W / workingW, sy = H / workingH;
      const pitchX = (grid.cellPitch || 20) * sx;
      const pitchY = (grid.cellPitch || 20) * sy;
      const ox = (grid.originCol || 0) * sx;
      const oy = (grid.originRow || 0) * sy;
      ctx.save();
      ctx.strokeStyle = 'rgba(184, 92, 56, 0.85)';
      ctx.lineWidth = 1;
      for (let x = ox; x <= W; x += pitchX) {
        ctx.beginPath(); ctx.moveTo(x + 0.5, 0); ctx.lineTo(x + 0.5, H); ctx.stroke();
      }
      for (let y = oy; y <= H; y += pitchY) {
        ctx.beginPath(); ctx.moveTo(0, y + 0.5); ctx.lineTo(W, y + 0.5); ctx.stroke();
      }
      // Heavier marks every 10 cells for orientation.
      ctx.strokeStyle = 'rgba(92, 42, 20, 0.95)';
      ctx.lineWidth = 1.5;
      for (let i = 0, x = ox; x <= W; i++, x += pitchX) {
        if (i % 10 !== 0) continue;
        ctx.beginPath(); ctx.moveTo(x + 0.5, 0); ctx.lineTo(x + 0.5, H); ctx.stroke();
      }
      for (let i = 0, y = oy; y <= H; i++, y += pitchY) {
        if (i % 10 !== 0) continue;
        ctx.beginPath(); ctx.moveTo(0, y + 0.5); ctx.lineTo(W, y + 0.5); ctx.stroke();
      }
      // Pitch-ruler first-click marker (working-image px → canvas px).
      if (rulerPoint) {
        const cx = rulerPoint.x * sx, cy = rulerPoint.y * sy;
        ctx.strokeStyle = 'rgba(217, 119, 6, 1)';
        ctx.fillStyle   = 'rgba(217, 119, 6, 0.35)';
        ctx.lineWidth = 2;
        ctx.beginPath(); ctx.arc(cx, cy, 8, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(cx - 14, cy); ctx.lineTo(cx + 14, cy); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(cx, cy - 14); ctx.lineTo(cx, cy + 14); ctx.stroke();
      }
      ctx.restore();
    }, [img, pending.workingW, pending.workingH, grid.cellPitch, grid.originRow, grid.originCol, rulerPoint && rulerPoint.x, rulerPoint && rulerPoint.y]);

    // Forward clicks (canvas-px) up to GridEditor for the pitch-ruler tool.
    function handleClick(ev) {
      if (!onCanvasClick) return;
      const cv = ref.current;
      if (!cv) return;
      const rect = cv.getBoundingClientRect();
      const x = (ev.clientX - rect.left) * (CANVAS_W / rect.width);
      const y = (ev.clientY - rect.top)  * (CANVAS_H / rect.height);
      onCanvasClick(x, y);
    }
    return h('div', { className: 'rc-grid-overlay-pane' },
      h('canvas', {
        ref, className: 'rc-grid-overlay-canvas',
        onClick: handleClick,
        style: rulerActive ? { cursor: 'crosshair' } : undefined,
      }),
    );
  }

  // ── Cell sample preview ───────────────────────────────────────────────
  // Renders one tiny swatch per grid cell, sampled from the warped preview
  // at the current grid alignment. This is the user's "did the grid land
  // in the right place?" sanity check — if the swatch grid looks mostly
  // black/grey, the grid is misaligned and the colour-snap step will
  // produce garbage. Re-samples reactively whenever the user nudges the
  // grid, so they can confirm the fix before committing.
  //
  // Sampling intentionally mirrors cvPipeline.extractCellColors at lower
  // fidelity: 18 % inward pad, modal-window median. We work off the
  // already-loaded warped-preview image (canvas-space pixels) rather than
  // round-tripping to the worker because this needs to update on every
  // ±1 px nudge.
  function CellSamplePreview({ pending, grid, warpedPreview }) {
    const ref = useRef(null);
    const img = warpedPreview || pending.previewImage;
    useEffect(() => {
      const cv = ref.current;
      if (!cv || !img || !grid || !grid.cellPitch) return;
      const rows = Math.max(1, grid.rows || (pending.grid && pending.grid.rows) || 50);
      const cols = Math.max(1, grid.cols || (pending.grid && pending.grid.cols) || 50);
      // Cap the displayed swatch grid at 360 px wide / 240 px tall so it
      // stays compact even on 200×200 charts.
      const maxW = 360, maxH = 240;
      const swatch = Math.max(2, Math.min(8, Math.floor(Math.min(maxW / cols, maxH / rows))));
      const W = cols * swatch, H = rows * swatch;
      const dpr = (typeof window !== 'undefined' && window.devicePixelRatio) || 1;
      cv.width = W * dpr; cv.height = H * dpr;
      cv.style.width = W + 'px'; cv.style.height = H + 'px';
      const ctx = cv.getContext('2d');
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

      // Render the warped preview to a sampling canvas at working-image
      // resolution so cell pixel coords line up with the grid.
      const workingW = pending.workingW || CANVAS_W;
      const workingH = pending.workingH || CANVAS_H;
      const off = document.createElement('canvas');
      off.width = workingW; off.height = workingH;
      const offCtx = off.getContext('2d');
      offCtx.drawImage(img, 0, 0, workingW, workingH);
      let pixels;
      try {
        pixels = offCtx.getImageData(0, 0, workingW, workingH).data;
      } catch (_) {
        // Tainted canvas — draw a hatched warning and bail.
        ctx.fillStyle = '#ccc'; ctx.fillRect(0, 0, W, H);
        return;
      }

      const pad = Math.max(2, Math.floor(grid.cellPitch * 0.18));
      const pitch = grid.cellPitch;
      const ox = grid.originCol || 0;
      const oy = grid.originRow || 0;
      const yBuf = []; const rBuf = []; const gBuf = []; const bBuf = [];
      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
          const x0 = Math.round(ox + c * pitch) + pad;
          const y0 = Math.round(oy + r * pitch) + pad;
          const x1 = Math.round(ox + (c + 1) * pitch) - pad;
          const y1 = Math.round(oy + (r + 1) * pitch) - pad;
          yBuf.length = 0; rBuf.length = 0; gBuf.length = 0; bBuf.length = 0;
          for (let py = Math.max(0, y0); py < Math.min(workingH, y1); py++) {
            for (let px = Math.max(0, x0); px < Math.min(workingW, x1); px++) {
              const base = (py * workingW + px) * 4;
              const r8 = pixels[base], g8 = pixels[base + 1], b8 = pixels[base + 2];
              rBuf.push(r8); gBuf.push(g8); bBuf.push(b8);
              yBuf.push((r8 * 77 + g8 * 150 + b8 * 29) >> 8);
            }
          }
          let rOut = 0, gOut = 0, bOut = 0;
          if (rBuf.length) {
            // Same modal-window median as the worker: bin Y, find mode,
            // keep pixels within ±1 bucket, median those. Falls back to
            // straight median when the kept subset is too small.
            const hist = new Int32Array(16);
            for (let i = 0; i < yBuf.length; i++) {
              const b = yBuf[i] >> 4;
              hist[b < 0 ? 0 : b > 15 ? 15 : b]++;
            }
            let mode = 0, mc = hist[0];
            for (let i = 1; i < 16; i++) if (hist[i] > mc) { mc = hist[i]; mode = i; }
            const yMin = (mode - 1) * 16, yMax = (mode + 2) * 16;
            let kept = 0;
            for (let i = 0; i < yBuf.length; i++) {
              if (yBuf[i] >= yMin && yBuf[i] < yMax) {
                rBuf[kept] = rBuf[i]; gBuf[kept] = gBuf[i]; bBuf[kept] = bBuf[i];
                kept++;
              }
            }
            const len = kept >= Math.max(8, yBuf.length * 0.20) ? kept : yBuf.length;
            rBuf.length = len; gBuf.length = len; bBuf.length = len;
            rBuf.sort((a, b) => a - b);
            gBuf.sort((a, b) => a - b);
            bBuf.sort((a, b) => a - b);
            const mid = len >> 1;
            rOut = rBuf[mid]; gOut = gBuf[mid]; bOut = bBuf[mid];
          }
          ctx.fillStyle = 'rgb(' + rOut + ',' + gOut + ',' + bOut + ')';
          ctx.fillRect(c * swatch, r * swatch, swatch, swatch);
        }
      }
    }, [img, pending.workingW, pending.workingH, grid.cellPitch, grid.originRow, grid.originCol, grid.rows, grid.cols]);

    return h('div', { className: 'rc-cell-sample-preview' },
      h('p', { className: 'rc-help', style: { marginTop: 12, marginBottom: 4 } },
        'Each tiny square below is the colour the importer would sample from that cell with the current grid. If the swatches look mostly dark grey or black, the grid is sitting on the symbols / grid-lines instead of the colour swatches — nudge it or use the pitch ruler.'),
      h('canvas', {
        ref, className: 'rc-cell-sample-canvas',
        style: { display: 'block', border: '1px solid var(--line, #ccc)', imageRendering: 'pixelated' },
      }),
    );
  }

  // ── Surface 3: cluster gallery ─────────────────────────────────────────
  function ClusterGallery({ pending, labels, palette, onLabelChange, onSplit, onMerge, warpedPreview }) {
    const medoids = pending.medoidImages || [];
    const clusterColors = pending.clusterColors || [];
    const overlayImage = warpedPreview || pending.previewImage;
    // Track which cluster the user is currently inspecting on the chart
    // overlay. Hovering a card sets `previewCid`; clicking the eye icon
    // pins it so they can still type/click DMC chips without losing the
    // highlight. `pinnedCid` wins over hover.
    const [hoverCid, setHoverCid] = useState(null);
    const [pinnedCid, setPinnedCid] = useState(null);
    const activeCid = pinnedCid != null ? pinnedCid : hoverCid;
    const clusterIds = pending.cellClusterIds || [];
    const grows = (pending.grid && pending.grid.rows) || 0;
    const gcols = (pending.grid && pending.grid.cols) || 0;
    const showOverlay = activeCid != null && overlayImage && grows > 0 && gcols > 0 && clusterIds.length === grows * gcols;
    return h('div', { className: 'rc-cluster-gallery' },
      h('p', { className: 'rc-help' }, `${medoids.length} unique symbols detected. Hover a card to see where it appears on the chart; click the highlight button to keep it visible while you type a DMC code or merge duplicates.`),
      showOverlay && h(ClusterOverlayPreview, {
        previewImage: overlayImage,
        rows: grows, cols: gcols,
        clusterIds, activeCid,
        clusterColor: clusterColors[activeCid] || (labels[activeCid] && labels[activeCid].rgb) || null,
      }),
      h('div', { className: 'rc-cluster-grid' },
        medoids.map((src, cid) => {
          const lbl = labels[cid] || {};
          const swatchRgb = clusterColors[cid] || lbl.rgb || null;
          const top3 = swatchRgb ? topNDmcMatches(swatchRgb, palette, 3) : [];
          const currentCode = (lbl.code || '').trim();
          const pinned = pinnedCid === cid;
          const cellCount = countCellsForCluster(clusterIds, cid);
          return h('div', {
            key: cid,
            className: 'rc-cluster-card' + (activeCid === cid ? ' rc-cluster-card--active' : ''),
            onMouseEnter: () => setHoverCid(cid),
            onMouseLeave: () => setHoverCid(c => c === cid ? null : c),
          },
            h('div', { className: 'rc-cluster-card-head' },
              h('img', { src, alt: 'Cluster ' + cid, className: 'rc-cluster-medoid' }),
              h('div', { className: 'rc-cluster-card-meta' },
                h('div', { className: 'rc-cluster-card-title' }, '#' + cid),
                h('div', { className: 'rc-cluster-card-count' }, cellCount + ' cells'),
              ),
              h('button', {
                type: 'button',
                className: 'tb-btn rc-cluster-eye' + (pinned ? ' tb-btn--on' : ''),
                onClick: () => setPinnedCid(p => p === cid ? null : cid),
                title: pinned ? 'Stop highlighting this symbol' : 'Highlight this symbol on the chart',
                'aria-pressed': pinned,
              }, window.Icons && window.Icons.eye ? window.Icons.eye() : 'Show'),
            ),
            h('label', { className: 'rc-cluster-field' },
              h('span', null, 'DMC code'),
              h('input', {
                type: 'text', placeholder: 'e.g. 310', value: lbl.code || '',
                onChange: (e) => onLabelChange(cid, { code: e.target.value }),
                list: 'rc-dmc-codes',
              }),
            ),
            h('label', { className: 'rc-cluster-field rc-cluster-field--colour' },
              h('span', null, 'Colour'),
              h('input', {
                type: 'color', value: rgbToHex(lbl.rgb || swatchRgb) || '#000000',
                onChange: (e) => onLabelChange(cid, { rgb: hexToRgb(e.target.value) }),
              }),
            ),
            top3.length > 0 && h('div', { className: 'rc-cluster-suggestions' },
              h('span', { className: 'rc-cluster-suggestions-label' }, 'Suggested:'),
              top3.map(m => {
                const active = currentCode === m.id;
                return h('button', {
                  key: m.id,
                  type: 'button',
                  className: 'rc-dmc-chip' + (active ? ' rc-dmc-chip--active' : ''),
                  title: `${m.id} · ${m.name || ''} · ΔE ${m.dE.toFixed(1)}`,
                  onClick: () => onLabelChange(cid, { code: m.id, rgb: m.rgb }),
                },
                  h('span', { className: 'rc-dmc-chip-swatch', style: { background: 'rgb(' + m.rgb.join(',') + ')' } }),
                  h('span', null, m.id),
                );
              }),
            ),
            h('div', { className: 'rc-cluster-actions' },
              h('button', { type: 'button', className: 'tb-btn rc-cluster-action', onClick: () => onSplit(cid, 2) },
                'Split in two'),
              h('button', { type: 'button', className: 'tb-btn rc-cluster-action', onClick: () => {
                const target = prompt('Merge cluster #' + cid + ' into which cluster number?');
                if (target != null && !isNaN(+target)) onMerge(cid, +target);
              }}, 'Merge into\u2026'),
            ),
          );
        }),
        h('datalist', { id: 'rc-dmc-codes' },
          palette.slice(0, 500).map(p => h('option', { key: p.id, value: p.id }))),
      ),
    );
  }

  // Tally the number of grid cells assigned to a given cluster id.
  function countCellsForCluster(ids, cid) {
    if (!ids || !ids.length) return 0;
    let n = 0;
    for (let i = 0; i < ids.length; i++) if (ids[i] === cid) n++;
    return n;
  }

  // Renders the warped-preview image with all cells of `activeCid`
  // highlighted in the cluster's colour. Drawn at modest size (CANVAS_W
  // wide, height matched to image aspect) so the overlay stays glanceable
  // while the user works through the cluster cards.
  function ClusterOverlayPreview({ previewImage, rows, cols, clusterIds, activeCid, clusterColor }) {
    const ref = useRef(null);
    useEffect(() => {
      const cv = ref.current;
      if (!cv || !previewImage) return;
      const dpr = (typeof window !== 'undefined' && window.devicePixelRatio) || 1;
      const W = CANVAS_W, H = CANVAS_H;
      cv.width = W * dpr; cv.height = H * dpr;
      cv.style.width = W + 'px'; cv.style.height = H + 'px';
      const ctx = cv.getContext('2d');
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, W, H);
      ctx.drawImage(previewImage, 0, 0, W, H);
      // Dim non-active cells so the highlighted ones pop.
      ctx.save();
      ctx.fillStyle = 'rgba(20, 18, 15, 0.55)';
      ctx.fillRect(0, 0, W, H);
      ctx.restore();
      const cellW = W / cols, cellH = H / rows;
      const rgb = clusterColor || [184, 92, 56];
      // Cut out the highlighted cells (clear the dim) and draw their tint.
      for (let i = 0; i < clusterIds.length; i++) {
        if (clusterIds[i] !== activeCid) continue;
        const r = (i / cols) | 0, c = i % cols;
        const x = c * cellW, y = r * cellH;
        ctx.clearRect(x, y, cellW, cellH);
        ctx.drawImage(previewImage,
          (x / W) * previewImage.width, (y / H) * previewImage.height,
          (cellW / W) * previewImage.width, (cellH / H) * previewImage.height,
          x, y, cellW, cellH);
        ctx.save();
        ctx.fillStyle = 'rgba(' + rgb[0] + ',' + rgb[1] + ',' + rgb[2] + ',0.35)';
        ctx.fillRect(x, y, cellW, cellH);
        ctx.strokeStyle = 'rgba(' + rgb[0] + ',' + rgb[1] + ',' + rgb[2] + ',0.95)';
        ctx.lineWidth = 1;
        ctx.strokeRect(x + 0.5, y + 0.5, cellW - 1, cellH - 1);
        ctx.restore();
      }
    }, [previewImage, rows, cols, clusterIds, activeCid, clusterColor]);
    return h('div', { className: 'rc-cluster-overlay-pane' },
      h('canvas', { ref, className: 'rc-cluster-overlay-canvas' }),
      h('p', { className: 'rc-help rc-help--center' },
        'Highlighted cells belong to cluster #' + activeCid + '.'),
    );
  }

  // Top-N DMC palette matches by CIEDE2000 (Lab if available, sRGB fallback).
  // The palette entries are expected to be {id, name, rgb, lab}; we tolerate
  // missing .lab by computing it on the fly via window.rgbToLab.
  // CIEDE2000 is perceptually-uniform: a ΔE = 2 between two pastels reflects
  // the same perceived difference as ΔE = 2 between two saturated blues, which
  // plain Euclidean Lab (ΔE76) gets wrong. For ranking palette candidates next
  // to a user-selectable chip strip the perceptual ordering matters more than
  // the ~3× cost compared to Euclidean.
  function topNDmcMatches(rgb, palette, n) {
    if (!palette || !palette.length) return [];
    const toLab = (typeof window !== 'undefined' && typeof window.rgbToLab === 'function')
      ? window.rgbToLab : null;
    const dE2000 = (typeof window !== 'undefined' && typeof window.dE2000 === 'function')
      ? window.dE2000 : null;
    const queryLab = toLab ? toLab(rgb[0], rgb[1], rgb[2]) : null;
    const scored = [];
    for (const p of palette) {
      let d;
      if (queryLab && dE2000) {
        const pl = p.lab || (toLab ? toLab(p.rgb[0], p.rgb[1], p.rgb[2]) : null);
        if (!pl) continue;
        d = dE2000(queryLab, pl);
      } else if (queryLab) {
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
      h('p', { className: 'rc-help' }, `${flagged.length} cells flagged as low-confidence (top 5%). Click each to verify or reassign.`),
      flagged.length === 0 && h('p', { className: 'rc-help rc-help--center' }, 'No low-confidence cells in this chart.'),
      h('div', { className: 'rc-review-list' },
        flagged.map(i => h('button', {
          key: i, type: 'button',
          className: 'tb-btn rc-review-chip' + (reviewIdx === i ? ' tb-btn--on' : ''),
          onClick: () => setReviewIdx(i),
        }, `#${i}`))),
      reviewIdx != null && h(CellInspector, { pending, idx: reviewIdx, labels }),
    );
  }
  function CellInspector({ pending, idx, labels }) {
    const candidates = (pending.cellTopCandidates && pending.cellTopCandidates[idx]) || [];
    return h('div', { className: 'rc-cell-inspector' },
      h('h4', { className: 'rc-cell-inspector-title' }, `Cell #${idx} — top candidates`),
      candidates.length === 0
        ? h('p', { className: 'rc-help' }, 'No candidate data captured for this cell.')
        : h('ul', { className: 'rc-cell-inspector-list' }, candidates.map((c, i) =>
            h('li', { key: i, className: 'rc-cell-inspector-row' },
              h('span', { className: 'rc-cell-inspector-cluster' }, `Cluster ${c.cluster}`),
              h('span', { className: 'rc-cell-inspector-code' }, (labels[c.cluster] || {}).code || '—'),
              h('span', { className: 'rc-cell-inspector-dist' }, `Δ ${c.distance.toFixed(3)}`),
            ))),
    );
  }

  // ── Surface 5: legend mapping ─────────────────────────────────────────
  function LegendMappingPanel({ pending, labels, onLabelChange }) {
    const rows = pending.legendRows || [];
    return h('div', { className: 'rc-legend' },
      h('p', { className: 'rc-help' }, 'OCR-detected legend rows. Codes that match a cluster are linked automatically; unmatched rows can be typed into the Symbols tab instead.'),
      rows.length === 0
        ? h('p', { className: 'rc-help rc-help--center' }, 'No legend rows detected. Type DMC codes directly in the Symbols tab.')
        : h('table', { className: 'rc-legend-table' },
            h('thead', null, h('tr', null,
              h('th', null, 'OCR text'),
              h('th', null, 'Parsed code'),
              h('th', null, 'Matched cluster'))),
            h('tbody', null, rows.map((r, i) =>
              h('tr', { key: i },
                h('td', { className: 'rc-legend-raw' }, r.raw || ''),
                h('td', { className: 'rc-legend-code' }, r.code || '—'),
                h('td', { className: 'rc-legend-match' }, r.matchedCluster != null
                  ? '#' + r.matchedCluster
                  : h('em', { className: 'rc-legend-unmatched' }, 'unmatched')),
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
    return h('div', { className: 'rc-multipage' },
      h('p', { className: 'rc-help rc-help--center' }, 'Multi-page support coming soon. Load this page as part of a multi-page sequence using the Import wizard.'),
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

  // Export shape: wireApp.js looks for `window.RasterChartCorrectionUI
  // .RasterChartCorrectionUI` (namespace style). Some debug/test code
  // historically used `window.RasterChartCorrectionUI` directly as the
  // component. Satisfy both by assigning the function and adding a
  // self-reference + the applyCorrections helper as properties.
  window.RasterChartCorrectionUI = RasterChartCorrectionUI;
  window.RasterChartCorrectionUI.RasterChartCorrectionUI = RasterChartCorrectionUI;
  window.RasterChartCorrectionUI.applyCorrections = applyCorrections;
})();
