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
    const { pending, onCommit, onCancel, dmcPalette, telemetryId, initialLabels } = props;
    const [tab, setTab] = useState('corners');
    const [corners, setCorners] = useState(pending.corners || null);
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
          tab === 'corners' && h(CornerEditor, { pending, corners, onChange: setCorners }),
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
  function CornerEditor({ pending, corners, onChange }) {
    const canvasRef = useRef(null);
    const [drag, setDrag] = useState(-1);
    const [focused, setFocused] = useState(0);
    const distortion = pending.distortion || null;

    const c = corners || pending.autoCorners || defaultCorners(pending);
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
      onChange(pending.autoCorners ? pending.autoCorners.slice() : defaultCorners(pending));
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
        h('button', { type: 'button', className: 'tb-btn', onClick: resetCorners }, 'Reset to auto-detected'),
        h('span', { style: { fontSize: 12, opacity: 0.75 } },
          'Focused corner: ' + (['top-left','top-right','bottom-right','bottom-left'][focused] || focused)),
      ),
      h('canvas', {
        ref: canvasRef, width: 800, height: 600, tabIndex: 0,
        style: { width: '100%', height: 'auto', cursor: drag >= 0 ? 'grabbing' : 'crosshair', border: '1px solid var(--border)' },
        onMouseDown: onPointerDown, onMouseMove: onPointerMove, onMouseUp: onPointerUp, onMouseLeave: onPointerUp,
      }),
    );
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
    return h('div', { className: 'rc-cluster-gallery' },
      h('p', null, `${medoids.length} unique symbols detected. Label each with its DMC code; merge any duplicates.`),
      h('div', { className: 'rc-cluster-grid' },
        medoids.map((src, cid) => {
          const lbl = labels[cid] || {};
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
            }}, 'Merge…'),
          );
        }),
        h('datalist', { id: 'rc-dmc-codes' },
          palette.slice(0, 500).map(p => h('option', { key: p.id, value: p.id }))),
      ),
    );
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
