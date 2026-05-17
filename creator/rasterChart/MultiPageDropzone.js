/* creator/rasterChart/MultiPageDropzone.js
 * ════════════════════════════════════════════════════════════════════════
 *   Phase 2 — multi-page drop zone + drag-to-reorder UI.
 *
 *   Props:
 *     pages      {Array<{file, previewUrl, name}>}  current ordered page list
 *     onReorder  {function(newOrder: number[])}      called whenever page order changes
 *
 *   Exposes:  window.RasterChartMultiPageDropzone
 *
 *   Uses React.createElement only — no JSX, no Babel runtime dependency.
 *   Relies on window.React being present (same constraint as CorrectionUI).
 * ════════════════════════════════════════════════════════════════════════
 */

(function () {
  'use strict';
  if (typeof window === 'undefined' || !window.React) return;

  const { useState, useCallback, useRef } = window.React;
  const h = window.React.createElement;

  // Telemetry helper — fire-and-forget, never throws.
  function telEvent(importId, surface, details) {
    const T = window.RasterChartTelemetry;
    if (!T || !importId) return;
    try { T.recordCorrection(importId, surface, details || {}); } catch (_) {}
  }

  // ── Page auto-order detector ───────────────────────────────────────────
  // Calls ocrLegend on the bottom 10% footer strip of each page RGBA,
  // extracts any page-number pattern, and proposes a sorted order if
  // numbers form a contiguous sequence.

  const PAGE_NUM_RE = /(\d+)\s*of\s*\d+|[Pp]age\s*(\d+)\/\d+|(\d+)\/\d+|^(\d+)$/;

  function extractPageNum(text) {
    for (const line of text.split('\n')) {
      const m = PAGE_NUM_RE.exec(line.trim());
      if (m) {
        const num = parseInt(m[1] || m[2] || m[3] || m[4], 10);
        if (!isNaN(num)) return num;
      }
    }
    return null;
  }

  function isContiguous(nums) {
    const sorted = nums.slice().sort((a, b) => a - b);
    for (let i = 1; i < sorted.length; i++) {
      if (sorted[i] !== sorted[i - 1] + 1) return false;
    }
    return true;
  }

  async function detectPageOrder(pages) {
    // pages is [{file, previewUrl, name}]
    const worker = window._rasterChartWorkerFactory
      ? window._rasterChartWorkerFactory()
      : null;
    if (!worker) return null;

    // Simple RPC helper (same pattern as rasterChartStrategy).
    let msgId = 0;
    function rpc(msg, transfer) {
      return new Promise((resolve, reject) => {
        const id = ++msgId;
        function onMsg(ev) {
          if (ev.data && ev.data.id === id) {
            worker.removeEventListener('message', onMsg);
            if (ev.data.type === 'error') reject(new Error(ev.data.error));
            else resolve(ev.data.payload);
          }
        }
        worker.addEventListener('message', onMsg);
        worker.postMessage(Object.assign({ id }, msg), transfer || []);
      });
    }

    const nums = [];
    try {
      for (let i = 0; i < pages.length; i++) {
        const pg = pages[i];
        if (!pg.file) { nums.push(null); continue; }
        // Decode image to RGBA
        const bitmap = await createImageBitmap(pg.file);
        const offscreen = new OffscreenCanvas(bitmap.width, bitmap.height);
        const ctx = offscreen.getContext('2d');
        ctx.drawImage(bitmap, 0, 0);
        bitmap.close();
        const fullData = ctx.getImageData(0, 0, bitmap.width, bitmap.height).data;
        // Crop bottom 10%
        const cropH = Math.max(1, Math.floor(bitmap.height * 0.1));
        const cropY = bitmap.height - cropH;
        const strip = ctx.getImageData(0, cropY, bitmap.width, cropH).data;
        const rgba = new Uint8ClampedArray(strip);
        const result = await rpc({
          type: 'ocrLegend',
          rgba, w: bitmap.width, h: cropH, anchorFirst: false,
        }, [rgba.buffer]);
        nums.push(extractPageNum(result && result.text ? result.text : ''));
        void fullData; // referenced to avoid GC of offscreen while reading
      }
    } finally {
      try { worker.terminate(); } catch (_) {}
    }

    const allFound = nums.every(n => n != null);
    if (!allFound) return null;
    if (!isContiguous(nums)) return null;

    // Build reordered index array: position 0 should go where page num = min.
    const min = Math.min(...nums);
    const order = nums.map((n, i) => ({ n, i }))
      .sort((a, b) => (a.n - min) - (b.n - min))
      .map(o => o.i);
    return order;
  }

  // ── Component ─────────────────────────────────────────────────────────

  function MultiPageDropzone({ pages: initialPages, onReorder, importId }) {
    const [pages, setPages] = useState(initialPages || []);
    const [detecting, setDetecting] = useState(false);
    const [detectedOrder, setDetectedOrder] = useState(null);
    const [dragOver, setDragOver] = useState(false);
    const [dragIdx, setDragIdx] = useState(null);
    const [dropIdx, setDropIdx] = useState(null);
    // T4#18: assembly preview column count. 'auto' picks a near-square
    // layout (ceil(sqrt(n))). Otherwise an explicit fixed count.
    const [assemblyCols, setAssemblyCols] = useState('auto');
    const fileInputRef = useRef(null);

    // File drop handler — adds new pages from dropped image files.
    const onDrop = useCallback((ev) => {
      ev.preventDefault();
      setDragOver(false);
      const files = Array.from(ev.dataTransfer.files)
        .filter(f => f.type.startsWith('image/'));
      if (!files.length) return;
      const newPages = files.map(f => ({
        file: f,
        name: f.name,
        previewUrl: URL.createObjectURL(f),
      }));
      setPages(p => {
        const updated = [...p, ...newPages];
        onReorder && onReorder(updated.map((_, i) => i));
        return updated;
      });
    }, [onReorder]);

    // Thumbnail drag-to-reorder handlers.
    const onThumbDragStart = useCallback((i) => setDragIdx(i), []);
    const onThumbDragEnter = useCallback((i) => setDropIdx(i), []);
    const onThumbDragEnd   = useCallback(() => {
      if (dragIdx != null && dropIdx != null && dragIdx !== dropIdx) {
        setPages(p => {
          const next = p.slice();
          const [moved] = next.splice(dragIdx, 1);
          next.splice(dropIdx, 0, moved);
          const newOrder = next.map((_, i) => i);
          onReorder && onReorder(newOrder);
          telEvent(importId, 'multi-page-reorder', { from: dragIdx, to: dropIdx });
          return next;
        });
      }
      setDragIdx(null);
      setDropIdx(null);
    }, [dragIdx, dropIdx, onReorder, importId]);

    // File-input "Add pages" button.
    const onFileChange = useCallback((ev) => {
      const files = Array.from(ev.target.files || []).filter(f => f.type.startsWith('image/'));
      const newPages = files.map(f => ({ file: f, name: f.name, previewUrl: URL.createObjectURL(f) }));
      setPages(p => {
        const updated = [...p, ...newPages];
        onReorder && onReorder(updated.map((_, i) => i));
        return updated;
      });
      ev.target.value = '';
    }, [onReorder]);

    // Remove a page.
    const removePage = useCallback((i) => {
      setPages(p => {
        const next = p.filter((_, idx) => idx !== i);
        onReorder && onReorder(next.map((_, idx) => idx));
        return next;
      });
    }, [onReorder]);

    // Detect page order from page-number OCR.
    const handleDetect = useCallback(async () => {
      if (!pages.length) return;
      setDetecting(true);
      setDetectedOrder(null);
      try {
        const order = await detectPageOrder(pages);
        if (order) {
          setDetectedOrder(order);
        } else {
          setDetectedOrder(false); // false = detection ran but found no order
        }
      } catch (_) {
        setDetectedOrder(false);
      } finally {
        setDetecting(false);
      }
    }, [pages]);

    const acceptOrder = useCallback(() => {
      if (!Array.isArray(detectedOrder)) return;
      setPages(p => {
        const reordered = detectedOrder.map(i => p[i]);
        onReorder && onReorder(detectedOrder);
        telEvent(importId, 'multi-page-auto-detect-accepted', { order: detectedOrder });
        return reordered;
      });
      setDetectedOrder(null);
    }, [detectedOrder, onReorder, importId]);

    const rejectOrder = useCallback(() => {
      telEvent(importId, 'multi-page-auto-detect-rejected', {});
      setDetectedOrder(null);
    }, [importId]);

    return h('div', { className: 'rc-multipage' },
      h('p', null, 'Add page images, then drag thumbnails to set the correct order. If page numbers are printed on the chart, use "Detect order" to auto-sort.'),

      // Drop zone
      h('div', {
        className: 'rc-multipage-dropzone' + (dragOver ? ' rc-multipage-dropzone--over' : ''),
        onDragOver: (ev) => { ev.preventDefault(); setDragOver(true); },
        onDragLeave: () => setDragOver(false),
        onDrop,
        onClick: () => fileInputRef.current && fileInputRef.current.click(),
      },
        h('span', null, pages.length ? `${pages.length} page${pages.length !== 1 ? 's' : ''} — drop more here` : 'Drop image files here or click to add'),
        h('input', {
          ref: fileInputRef, type: 'file', multiple: true, accept: 'image/*',
          style: { display: 'none' },
          onChange: onFileChange,
        }),
      ),

      // Thumbnail strip
      pages.length > 0 && h('div', { className: 'rc-multipage-strip' },
        pages.map((pg, i) =>
          h('div', {
            key: i,
            className: 'rc-multipage-thumb' + (dropIdx === i ? ' rc-multipage-thumb--over' : ''),
            draggable: true,
            onDragStart: () => onThumbDragStart(i),
            onDragEnter: () => onThumbDragEnter(i),
            onDragEnd: onThumbDragEnd,
          },
            h('img', {
              src: pg.previewUrl, alt: pg.name || ('Page ' + (i + 1)),
              width: 80, height: 80,
              style: { objectFit: 'contain', imageRendering: 'auto' },
            }),
            h('span', { className: 'rc-multipage-thumb-label' }, i + 1),
            h('button', {
              type: 'button', className: 'tb-btn rc-multipage-remove',
              title: 'Remove page',
              onClick: (ev) => { ev.stopPropagation(); removePage(i); },
            }, window.Icons ? window.Icons.x() : 'x'),
          ),
        ),
      ),

      // Detect-order controls
      pages.length > 1 && h('div', { className: 'rc-multipage-actions' },
        h('button', {
          type: 'button', className: 'tb-btn',
          onClick: handleDetect, disabled: detecting,
        }, detecting ? 'Detecting…' : 'Detect order from page numbers'),

        detectedOrder === false && h('span', { className: 'rc-multipage-no-order' },
          'Could not determine page order — no consistent page numbers found.'),

        Array.isArray(detectedOrder) && h('div', { className: 'rc-multipage-order-proposal' },
          h('span', null, `Proposed order: ${detectedOrder.map(i => i + 1).join(' → ')}`),
          h('button', { type: 'button', className: 'tb-btn tb-btn--primary', onClick: acceptOrder }, 'Apply'),
          h('button', { type: 'button', className: 'tb-btn', onClick: rejectOrder }, 'Keep current'),
        ),
      ),

      // T4#18: assembly preview — shows how the pages will tile when
      // stitched together. Lets the user sanity-check page order against
      // the intended grid layout before running the import.
      pages.length > 1 && (function () {
        const n = pages.length;
        const cols = assemblyCols === 'auto'
          ? Math.max(1, Math.ceil(Math.sqrt(n)))
          : Math.max(1, Math.min(n, parseInt(assemblyCols, 10) || 1));
        const rows = Math.ceil(n / cols);
        const rowSummary = [];
        for (let r = 0; r < rows; r++) {
          const cells = [];
          for (let c = 0; c < cols; c++) {
            const idx = r * cols + c;
            if (idx < n) cells.push(String(idx + 1));
          }
          rowSummary.push(`Row ${r + 1}: ${cells.join(', ')}`);
        }
        return h('div', { className: 'rc-multipage-assembly' },
          h('div', { className: 'rc-multipage-assembly-header', style: { display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginTop: 12 } },
            h('strong', null, 'Assembly preview'),
            h('label', { style: { fontSize: 12, display: 'inline-flex', alignItems: 'center', gap: 6 } },
              'Columns:',
              h('select', {
                value: assemblyCols,
                onChange: (ev) => setAssemblyCols(ev.target.value),
              },
                h('option', { value: 'auto' }, 'Auto'),
                [1, 2, 3, 4, 5, 6].map(k => h('option', { key: k, value: String(k) }, String(k))),
              ),
            ),
            h('span', { style: { fontSize: 12, opacity: 0.75 } }, `${rows} row${rows !== 1 ? 's' : ''} × ${cols} col${cols !== 1 ? 's' : ''}`),
          ),
          h('div', {
            className: 'rc-multipage-assembly-grid',
            style: {
              display: 'grid',
              gridTemplateColumns: `repeat(${cols}, minmax(60px, 120px))`,
              gap: 4,
              marginTop: 8,
              padding: 6,
              border: '1px dashed var(--border, #cbd5e1)',
              borderRadius: 4,
              background: 'var(--surface-2, #f8fafc)',
            },
          },
            pages.map((pg, i) => h('div', {
              key: i,
              style: {
                position: 'relative',
                aspectRatio: '1 / 1',
                border: '1px solid var(--border, #cbd5e1)',
                background: '#fff',
                overflow: 'hidden',
              },
              title: pg.name || ('Page ' + (i + 1)),
            },
              h('img', {
                src: pg.previewUrl, alt: '',
                style: { width: '100%', height: '100%', objectFit: 'cover', display: 'block' },
              }),
              h('span', {
                style: {
                  position: 'absolute', top: 2, left: 2,
                  background: 'rgba(15, 23, 42, 0.78)', color: '#fff',
                  fontSize: 11, fontWeight: 600,
                  padding: '1px 5px', borderRadius: 3,
                },
              }, i + 1),
            )),
          ),
          h('ul', { style: { margin: '6px 0 0', paddingLeft: 18, fontSize: 12, opacity: 0.85 } },
            rowSummary.map((s, i) => h('li', { key: i }, s)),
          ),
        );
      })(),
    );
  }

  window.RasterChartMultiPageDropzone = MultiPageDropzone;
})();
