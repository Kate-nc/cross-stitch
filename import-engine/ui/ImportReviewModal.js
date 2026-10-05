/* import-engine/ui/ImportReviewModal.js — Review pane for import results.
 *
 * Loaded as a plain <script> (no Babel/JSX) so it can be reused from any HTML
 * entry point. Mounts a modal at window.ImportEngine.openReview(opts) and
 * resolves with { action: 'confirm'|'cancel'|'wizard', project?, edits? }.
 *
 * opts = {
 *   project,            // v8 project (already materialised)
 *   raw,                // original raw extraction (for confidence overlay)
 *   warnings,           // from validateExtraction
 *   coverage,           // 0..1
 *   reviewMode,         // 'fast'|'standard'|'wizard'
 *   originalFileUrl?,   // ObjectURL for side-by-side view
 * }
 */

(function () {
  'use strict';
  if (typeof window === 'undefined' || !window.React) return;

  var h = React.createElement;
  var Icons = window.Icons || {};

  function I(name) { return typeof Icons[name] === 'function' ? Icons[name]() : null; }

  // ── Sub-components ─────────────────────────────────────────────────────

  function ImportProgress(props) {
    var pct = Math.round((props.progress || 0) * 100);
    return h('div', { className: 'import-progress', role: 'progressbar', 'aria-valuenow': pct },
      h('div', { className: 'import-progress-bar', style: { width: pct + '%' } }),
      h('div', { className: 'import-progress-label' }, (props.stage || 'Working') + '… ' + pct + '%')
    );
  }

  function ImportPreviewPane(props) {
    var project = props.project || {};
    var w = project.w || 0, h2 = project.h || 0;
    var pattern = project.pattern || [];
    var perCellConfidence = (project._import && project._import.perCellConfidence) || null;
    var canvas = React.useRef(null);

    React.useEffect(function () {
      var c = canvas.current;
      if (!c) return;
      var cell = Math.max(props.maxPx ? 1 : 2, Math.min(8, Math.floor((props.maxPx || 480) / Math.max(w, h2 || 1))));
      c.width = w * cell;
      c.height = h2 * cell;
      var ctx = c.getContext('2d');
      ctx.fillStyle = '#fff';
      ctx.fillRect(0, 0, c.width, c.height);
      for (var i = 0; i < pattern.length; i++) {
        var m = pattern[i];
        if (!m || m.id === '__skip__' || m.id === '__empty__') continue;
        var x = (i % w) * cell;
        var y = Math.floor(i / w) * cell;
        var rgb = m.rgb || [0, 0, 0];
        ctx.fillStyle = 'rgb(' + rgb[0] + ',' + rgb[1] + ',' + rgb[2] + ')';
        ctx.fillRect(x, y, cell, cell);
        if (props.showConfidence && perCellConfidence) {
          var conf = perCellConfidence[i] || 0;
          if (conf < 0.8) {
            ctx.fillStyle = 'rgba(255, 80, 80, ' + (0.8 - conf) + ')';
            ctx.fillRect(x, y, cell, cell);
          }
        }
      }
    }, [project, props.showConfidence]);

    return h('div', { className: 'import-preview-pane' },
      h('canvas', { ref: canvas, className: 'import-preview-canvas' }),
      h('div', { className: 'import-preview-meta' },
        w + ' × ' + h2 + ' stitches'
      )
    );
  }

  function ImportPaletteList(props) {
    var counts = {};
    var rgbs = {};
    (props.project.pattern || []).forEach(function (m) {
      if (!m || m.id === '__skip__' || m.id === '__empty__') return;
      counts[m.id] = (counts[m.id] || 0) + 1;
      rgbs[m.id] = m.rgb;
    });
    var ids = Object.keys(counts).sort(function (a, b) { return counts[b] - counts[a]; });
    return h('div', { className: 'import-palette-list' },
      h('div', { className: 'import-palette-header' }, ids.length + ' colours'),
      ids.slice(0, 100).map(function (id) {
        var rgb = rgbs[id] || [0, 0, 0];
        return h('div', { key: id, className: 'import-palette-row' },
          h('span', { className: 'import-palette-swatch',
            style: { background: 'rgb(' + rgb[0] + ',' + rgb[1] + ',' + rgb[2] + ')' } }),
          h('span', { className: 'import-palette-id' }, id),
          h('span', { className: 'import-palette-count' }, counts[id])
        );
      })
    );
  }

  function ImportMetadataForm(props) {
    var p = props.project || {};
    return h('div', { className: 'import-metadata-form' },
      h('label', null, 'Pattern name',
        h('input', { type: 'text', value: p.name || '',
          onChange: function (e) { props.onEdit('name', e.target.value); } })),
      h('label', null, 'Fabric count',
        h('input', { type: 'number', min: 6, max: 40, value: (p.settings && p.settings.fabricCt) || 14,
          onChange: function (e) { props.onEdit('fabricCt', parseInt(e.target.value, 10) || 14); } })),
      h('div', { className: 'import-metadata-readout' },
        h('div', null, 'Width: ', h('strong', null, p.w)),
        h('div', null, 'Height: ', h('strong', null, p.h)),
        h('div', null, 'Stitches: ', h('strong', null, (p.pattern || []).filter(function (m) { return m && m.id !== '__skip__'; }).length))
      )
    );
  }

  function ImportSideBySide(props) {
    return h('div', { className: 'import-side-by-side' },
      h('div', { className: 'import-side-pane' },
        h('div', { className: 'import-side-label' }, 'Original'),
        props.originalFileUrl
          ? h('iframe', { src: props.originalFileUrl, title: 'Original file', className: 'import-side-frame' })
          : h('div', { className: 'import-side-empty' }, 'Original not available')
      ),
      h('div', { className: 'import-side-pane' },
        h('div', { className: 'import-side-label' }, 'Imported'),
        h(ImportPreviewPane, { project: props.project, showConfidence: true })
      )
    );
  }

  function WarningList(props) {
    if (!props.warnings || !props.warnings.length) {
      return h('div', { className: 'import-warnings empty' },
        I('check'), ' No warnings.');
    }
    return h('ul', { className: 'import-warnings' },
      props.warnings.map(function (w, i) {
        var icon = w.severity === 'high' ? I('warning') : I('info');
        return h('li', { key: i, className: 'import-warning ' + (w.severity || '') }, icon, ' ', w.message);
      })
    );
  }

  // ── Pages: check and correct where each page of a PDF chart goes ──────

  // A small picture of one page's stitches, so pages can be told apart and
  // their edges compared.
  function PageThumb(props) {
    var page = props.page;
    var canvas = React.useRef(null);
    React.useEffect(function () {
      var c = canvas.current;
      if (!c || !page) return;
      var scale = Math.max(1, Math.floor(props.size / Math.max(page.cols, page.rows, 1)));
      c.width = page.cols * scale;
      c.height = page.rows * scale;
      var ctx = c.getContext('2d');
      ctx.clearRect(0, 0, c.width, c.height);
      for (var i = 0; i < page.cells.length; i++) {
        var cell = page.cells[i];
        if (cell.isEmpty || !cell.thread) continue;
        var rgb = cell.thread.rgb || [0, 0, 0];
        ctx.fillStyle = 'rgb(' + rgb[0] + ',' + rgb[1] + ',' + rgb[2] + ')';
        ctx.fillRect(cell.col * scale, cell.row * scale, scale, scale);
      }
    }, [page, props.size]);
    return h('canvas', { ref: canvas, className: 'page-layout-thumb', 'aria-hidden': 'true' });
  }

  var TRAY_REASON = {
    unplaced: 'Could not be placed',
    duplicate: 'Same design in another style',
  };

  function PageLayoutPanel(props) {
    var M = window.ImportEngine && window.ImportEngine.pageLayout;
    var session = props.session;
    var _s = React.useState(function () { return M.slotsFromPlacement(session, props.placement); });
    var slots = _s[0], setSlots = _s[1];
    var _sel = React.useState(null); var sel = _sel[0], setSel = _sel[1];   // { from: 'slot'|'tray', slot?, page }
    var _drag = React.useState(null); var drag = _drag[0], setDrag = _drag[1];

    var byIndex = {};
    session.pages.forEach(function (p) { byIndex[p.pageIndex] = p; });
    var leftOut = {};
    session.pages.forEach(function (p) { if (p.reason) leftOut[p.pageIndex] = p.reason; });
    var fromRulers = session.layoutSource === 'axis-rulers';
    var edited = !!(props.placement && props.placement.manual);

    function commit(next) {
      setSlots(next);
      setSel(null);
      props.onPlacement(M.placementFromSlots(session, next));
    }
    function reset() {
      setSel(null);
      setSlots(M.slotsFromPlacement(session, session.placement));
      props.onPlacement(session.placement);
    }

    // Tap one page, then another page or an empty slot, to swap or move it.
    // Dragging does the same where a pointer is available.
    function chooseSlot(k) {
      var here = slots.order[k];
      if (!sel) {
        if (here !== null && here !== undefined) setSel({ from: 'slot', slot: k, page: here });
        return;
      }
      if (sel.from === 'slot') {
        if (sel.slot === k) { setSel(null); return; }
        commit(M.swap(slots, sel.slot, k));
      } else {
        commit(M.fromTray(slots, sel.page, k));
      }
    }
    function chooseTray(pi) {
      if (sel && sel.from === 'tray' && sel.page === pi) { setSel(null); return; }
      setSel({ from: 'tray', page: pi });
    }
    function dropOn(k) {
      if (!drag) return;
      if (drag.from === 'slot') { if (drag.slot !== k) commit(M.swap(slots, drag.slot, k)); }
      else commit(M.fromTray(slots, drag.page, k));
      setDrag(null);
    }

    // While a page is being moved, one empty row past the last, so it can go
    // down a row; otherwise the spare row is only clutter.
    var shown = slots.order.slice();
    if (sel || drag) for (var e = 0; e < slots.across; e++) shown.push(null);

    var across = slots.across;
    var maxAcross = Math.max(1, session.pages.length);
    var overlap = (slots.overlap && slots.overlap.cols) || 0;

    return h('div', { className: 'page-layout' },
      h('p', { className: 'page-layout-intro' + (fromRulers && !edited ? '' : ' attention') },
        fromRulers
          ? (edited
              ? 'You have changed the layout read from the PDF.'
              : 'Each page was placed using the row and column numbers printed on it. Check the pages line up, and move any that do not.')
          : 'These pages have no row and column numbers, so they were laid out in page order. Set how many pages go across, then move any that are in the wrong place.'),
      h('div', { className: 'page-layout-controls' },
        h('div', { className: 'page-layout-stepper' },
          h('span', { id: 'page-layout-across' }, 'Pages across'),
          h('button', { type: 'button', className: 'g-btn icon-only', 'aria-label': 'Fewer pages across',
            disabled: across <= 1, onClick: function () { commit(M.setAcross(slots, across - 1)); } }, I('minus')),
          h('output', { 'aria-labelledby': 'page-layout-across', className: 'page-layout-value' }, String(across)),
          h('button', { type: 'button', className: 'g-btn icon-only', 'aria-label': 'More pages across',
            disabled: across >= maxAcross, onClick: function () { commit(M.setAcross(slots, across + 1)); } }, I('plus'))
        ),
        h('div', { className: 'page-layout-stepper' },
          h('span', { id: 'page-layout-overlap' }, 'Rows repeated at page edges'),
          h('button', { type: 'button', className: 'g-btn icon-only', 'aria-label': 'Fewer repeated rows',
            disabled: overlap <= 0, onClick: function () { commit(M.setOverlap(slots, overlap - 1, overlap - 1)); } }, I('minus')),
          h('output', { 'aria-labelledby': 'page-layout-overlap', className: 'page-layout-value' }, String(overlap)),
          h('button', { type: 'button', className: 'g-btn icon-only', 'aria-label': 'More repeated rows',
            disabled: overlap >= 10, onClick: function () { commit(M.setOverlap(slots, overlap + 1, overlap + 1)); } }, I('plus'))
        ),
        fromRulers && edited && h('button', { type: 'button', className: 'g-btn', onClick: reset },
          I('undo'), h('span', null, 'Use the PDF’s layout'))
      ),
      h('p', { className: 'page-layout-hint' },
        sel ? 'Now choose where page ' + sel.page + ' should go.' : 'Select a page, then the place it should go. You can also drag pages.'),
      h('div', { className: 'page-layout-grid', role: 'list',
                 style: { gridTemplateColumns: 'repeat(' + across + ', minmax(0, 1fr))' } },
        shown.map(function (pi, k) {
          var page = (pi === null || pi === undefined) ? null : byIndex[pi];
          var row = Math.floor(k / across) + 1, col = (k % across) + 1;
          var selected = sel && sel.from === 'slot' && sel.slot === k;
          return h('div', { key: 'slot' + k, role: 'listitem', className: 'page-layout-slot',
              onDragOver: function (ev) { ev.preventDefault(); },
              onDrop: function (ev) { ev.preventDefault(); dropOn(k); } },
            h('button', {
              type: 'button',
              className: 'page-layout-tile' + (page ? '' : ' empty') + (selected ? ' selected' : ''),
              'aria-pressed': selected ? 'true' : 'false',
              'aria-label': page
                ? 'Page ' + pi + ', ' + page.cols + ' by ' + page.rows + ' stitches, row ' + row + ' column ' + col
                : 'Empty place, row ' + row + ' column ' + col,
              draggable: !!page,
              onDragStart: function () { if (page) setDrag({ from: 'slot', slot: k, page: pi }); },
              onClick: function () { chooseSlot(k); }
            },
              page ? h(PageThumb, { page: page, size: 96 }) : h('span', { className: 'page-layout-empty' }, 'Empty'),
              page && h('span', { className: 'page-layout-label' }, 'Page ' + pi),
              page && h('span', { className: 'page-layout-size' }, page.cols + ' × ' + page.rows)
            )
          );
        })
      ),
      sel && sel.from === 'slot' && h('div', { className: 'page-layout-selected-actions' },
        h('button', { type: 'button', className: 'g-btn', onClick: function () { commit(M.toTray(slots, sel.page)); } },
          I('archive'), h('span', null, 'Leave page ' + sel.page + ' out'))
      ),
      slots.tray.length > 0 && h('section', { className: 'page-layout-tray', 'aria-label': 'Pages not in the chart' },
        h('h3', null, 'Not in the chart'),
        h('div', { className: 'page-layout-tray-list' },
          slots.tray.map(function (pi) {
            var page = byIndex[pi];
            var selected = sel && sel.from === 'tray' && sel.page === pi;
            return h('button', {
              key: 'tray' + pi, type: 'button',
              className: 'page-layout-tile tray' + (selected ? ' selected' : ''),
              'aria-pressed': selected ? 'true' : 'false',
              draggable: true,
              onDragStart: function () { setDrag({ from: 'tray', page: pi }); },
              onClick: function () { chooseTray(pi); }
            },
              page && h(PageThumb, { page: page, size: 64 }),
              h('span', { className: 'page-layout-label' }, 'Page ' + pi),
              h('span', { className: 'page-layout-size' }, TRAY_REASON[leftOut[pi]] || 'Left out')
            );
          })
        )
      ),
      h('div', { className: 'page-layout-result' },
        h('h3', null, 'Assembled chart'),
        h(ImportPreviewPane, { project: props.project, showConfidence: false, maxPx: 320 })
      )
    );
  }

  // ── Main modal ─────────────────────────────────────────────────────────

  function ImportReviewModal(props) {
    // A PDF chart of several pages arrives with its per-page readings, so the
    // pages can be rearranged here before anything is saved.
    var session = props.layoutSession && props.layoutSession.pages && props.layoutSession.pages.length > 1
      ? props.layoutSession : null;
    var LM = window.ImportEngine && window.ImportEngine.pageLayout;
    var _t = React.useState((session && LM && LM.needsReview(session)) ? 'pages' : 'preview'); var tab = _t[0], setTab = _t[1];
    var _p = React.useState(session ? session.placement : null); var placement = _p[0], setPlacement = _p[1];
    var _e = React.useState({}); var edits = _e[0], setEdits = _e[1];
    var _c = React.useState(true); var showConfidence = _c[0], setShowConfidence = _c[1];

    // Escape closes the modal — matches every other dialog in the app.
    React.useEffect(function () {
      if (typeof document === 'undefined') return;
      function onKey(e) {
        if (e.key === 'Escape' && props.onClose) { props.onClose('cancel'); }
      }
      document.addEventListener('keydown', onKey);
      return function () { document.removeEventListener('keydown', onKey); };
    }, []);

    function applyEdit(field, value) {
      var next = Object.assign({}, edits);
      next[field] = value;
      setEdits(next);
    }
    // Rebuild only when the arrangement differs from the one imported.
    var arranged = props.project;
    if (session && placement && placement.manual && !(LM && LM.samePlacement(placement, session.placement))) {
      arranged = memoBuild(session, placement);
    }
    var working = mergeEdits(arranged, edits);
    // The importer's own findings — a page left out, a size that differs from
    // what the PDF states — belong beside the engine's.
    var reportWarnings = ((working && working.importReport && working.importReport.warnings) || [])
      .map(function (m) { return { message: m, severity: 'medium' }; });
    var allWarnings = (props.warnings || []).concat(reportWarnings);

    var coveragePct = Math.round((props.coverage || 0) * 100);
    var coverageIcon = props.coverage >= 0.95 ? I('confidenceHigh') : (props.coverage >= 0.8 ? I('info') : I('confidenceLow'));

    var tabs = [].concat(session ? [{ id: 'pages', label: 'Pages', icon: I('layers') }] : [], [
      { id: 'preview',  label: 'Preview',  icon: I('magnifier') },
      { id: 'palette',  label: 'Palette',  icon: I('palette') },
      { id: 'metadata', label: 'Details',  icon: I('info') },
      { id: 'compare',  label: 'Compare',  icon: I('splitView') },
    ]);

    return h('div', { className: 'import-review-modal-overlay', role: 'dialog', 'aria-modal': 'true' },
      h('div', { className: 'import-review-modal' },
        h('header', { className: 'import-review-header' },
          h('h2', null, 'Review imported pattern'),
          h('div', { className: 'import-review-coverage' }, coverageIcon, h('span', null, coveragePct + '% confidence')),
          h('button', { className: 'import-review-close', onClick: function () { props.onClose && props.onClose('cancel'); }, 'aria-label': 'Close' }, I('x'))
        ),
        h('nav', { className: 'import-review-tabs', role: 'tablist' },
          tabs.map(function (t) {
            return h('button', {
              key: t.id, role: 'tab', 'aria-selected': tab === t.id,
              className: 'import-review-tab ' + (tab === t.id ? 'active' : ''),
              onClick: function () { setTab(t.id); }
            }, t.icon, h('span', null, t.label));
          })
        ),
        h('section', { className: 'import-review-body' },
          tab === 'pages'    && session && h(PageLayoutPanel, { session: session, placement: placement, project: working,
                                                onPlacement: setPlacement }),
          tab === 'preview'  && h(ImportPreviewPane, { project: working, showConfidence: showConfidence }),
          tab === 'palette'  && h(ImportPaletteList, { project: working }),
          tab === 'metadata' && h(ImportMetadataForm, { project: working, onEdit: applyEdit }),
          tab === 'compare'  && h(ImportSideBySide, { project: working, originalFileUrl: props.originalFileUrl })
        ),
        h('aside', { className: 'import-review-warnings' },
          h(WarningList, { warnings: allWarnings })
        ),
        h('footer', { className: 'import-review-footer' },
          h('label', { className: 'import-review-toggle' },
            h('input', { type: 'checkbox', checked: showConfidence,
              onChange: function (e) { setShowConfidence(e.target.checked); } }),
            ' Highlight low-confidence cells'),
          h('div', { className: 'import-review-actions' },
            h('button', { type: 'button', className: 'g-btn',
              onClick: function () { props.onClose && props.onClose('cancel'); } }, 'Cancel'),
            (props.coverage < 0.95) && h('button', { type: 'button', className: 'g-btn',
              onClick: function () { props.onClose && props.onClose('wizard', { project: working, edits: edits }); }
            }, I('wandFix'), h('span', null, 'Open guided wizard')),
            h('button', { type: 'button', className: 'g-btn primary',
              onClick: function () { props.onClose && props.onClose('confirm', { project: working, edits: edits }); } },
              I('check'), h('span', null, 'Use this pattern'))
          )
        )
      )
    );
  }

  // Rebuilding a large chart takes a moment, and React re-renders often; keep
  // the last build per session and arrangement.
  var lastBuild = { session: null, key: null, project: null };
  function memoBuild(session, placement) {
    var key = JSON.stringify(placement.pages);
    if (lastBuild.session === session && lastBuild.key === key) return lastBuild.project;
    var project = session.build(placement);
    lastBuild = { session: session, key: key, project: project };
    return project;
  }

  function mergeEdits(project, edits) {
    if (!project) return project;
    if (!edits || !Object.keys(edits).length) return project;
    var next = Object.assign({}, project);
    if ('name' in edits) next.name = edits.name;
    if ('fabricCt' in edits) next.settings = Object.assign({}, next.settings, { fabricCt: edits.fabricCt });
    return next;
  }

  // ── Imperative API ────────────────────────────────────────────────────

  function openReview(opts) {
    try {
      sessionStorage.setItem('__import_trace_openReview', JSON.stringify({ at: Date.now(), patternLen: opts && opts.project && opts.project.pattern && opts.project.pattern.length }));
    } catch (_) {}
    return new Promise(function (resolve) {
      var host = document.createElement('div');
      host.className = 'import-review-host';
      document.body.appendChild(host);
      var root = ReactDOM.createRoot ? ReactDOM.createRoot(host) : null;
      function cleanup() {
        if (root) root.unmount();
        else ReactDOM.unmountComponentAtNode(host);
        if (host.parentNode) host.parentNode.removeChild(host);
      }
      function onClose(action, payload) {
        try {
          sessionStorage.setItem('__import_trace_modalClose', JSON.stringify({ at: Date.now(), action: action }));
        } catch (_) {}
        cleanup();
        resolve(Object.assign({ action: action }, payload || {}));
      }
      var element = h(ImportReviewModal, Object.assign({}, opts, { onClose: onClose }));
      try {
        if (root) root.render(element); else ReactDOM.render(element, host);
      } catch (renderErr) {
        console.error('[import] review modal FAILED to render:', renderErr);
        if (window.Toast && window.Toast.show) {
          window.Toast.show({ message: 'Review modal failed to open: ' + (renderErr && renderErr.message), type: 'error', duration: 10000 });
        }
        cleanup();
        resolve({ action: 'cancel', error: renderErr });
      }
    });
  }

  var api = {
    openReview: openReview,
    ImportReviewModal: ImportReviewModal,
    ImportPreviewPane: ImportPreviewPane,
    ImportPaletteList: ImportPaletteList,
    ImportMetadataForm: ImportMetadataForm,
    ImportSideBySide: ImportSideBySide,
    ImportProgress: ImportProgress,
    WarningList: WarningList,
    mergeEdits: mergeEdits,
  };
  window.ImportEngine = Object.assign(window.ImportEngine || {}, api);
})();
