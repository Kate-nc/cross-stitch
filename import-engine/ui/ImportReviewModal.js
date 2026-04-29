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
      var cell = Math.max(2, Math.min(8, Math.floor(480 / Math.max(w, h2 || 1))));
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

  // ── Main modal ─────────────────────────────────────────────────────────

  function ImportReviewModal(props) {
    var _t = React.useState('preview'); var tab = _t[0], setTab = _t[1];
    var _e = React.useState({}); var edits = _e[0], setEdits = _e[1];
    var _c = React.useState(true); var showConfidence = _c[0], setShowConfidence = _c[1];

    function applyEdit(field, value) {
      var next = Object.assign({}, edits);
      next[field] = value;
      setEdits(next);
    }
    var working = mergeEdits(props.project, edits);

    var coveragePct = Math.round((props.coverage || 0) * 100);
    var coverageIcon = props.coverage >= 0.95 ? I('confidenceHigh') : (props.coverage >= 0.8 ? I('info') : I('confidenceLow'));

    var tabs = [
      { id: 'preview',  label: 'Preview',  icon: I('magnifier') },
      { id: 'palette',  label: 'Palette',  icon: I('palette') },
      { id: 'metadata', label: 'Details',  icon: I('info') },
      { id: 'compare',  label: 'Compare',  icon: I('splitView') },
    ];

    return h('div', { className: 'import-review-modal-overlay', role: 'dialog', 'aria-modal': 'true' },
      h('div', { className: 'import-review-modal' },
        h('header', { className: 'import-review-header' },
          h('h2', null, 'Review imported pattern'),
          h('div', { className: 'import-review-coverage' }, coverageIcon, ' ', coveragePct + '% confidence'),
          h('button', { className: 'import-review-close', onClick: function () { props.onClose && props.onClose('cancel'); }, 'aria-label': 'Close' }, I('x'))
        ),
        h('nav', { className: 'import-review-tabs', role: 'tablist' },
          tabs.map(function (t) {
            return h('button', {
              key: t.id, role: 'tab', 'aria-selected': tab === t.id,
              className: 'import-review-tab ' + (tab === t.id ? 'active' : ''),
              onClick: function () { setTab(t.id); }
            }, t.icon, ' ', t.label);
          })
        ),
        h('section', { className: 'import-review-body' },
          tab === 'preview'  && h(ImportPreviewPane, { project: working, showConfidence: showConfidence }),
          tab === 'palette'  && h(ImportPaletteList, { project: working }),
          tab === 'metadata' && h(ImportMetadataForm, { project: working, onEdit: applyEdit }),
          tab === 'compare'  && h(ImportSideBySide, { project: working, originalFileUrl: props.originalFileUrl })
        ),
        h('aside', { className: 'import-review-warnings' },
          h(WarningList, { warnings: props.warnings })
        ),
        h('footer', { className: 'import-review-footer' },
          h('label', { className: 'import-review-toggle' },
            h('input', { type: 'checkbox', checked: showConfidence,
              onChange: function (e) { setShowConfidence(e.target.checked); } }),
            ' Highlight low-confidence cells'),
          h('div', { className: 'import-review-actions' },
            h('button', { className: 'btn-secondary', onClick: function () { props.onClose && props.onClose('cancel'); } }, 'Cancel'),
            (props.coverage < 0.95) && h('button', { className: 'btn-secondary',
              onClick: function () { props.onClose && props.onClose('wizard', { project: working, edits: edits }); }
            }, I('wandFix'), ' Open guided wizard'),
            h('button', { className: 'btn-primary', onClick: function () { props.onClose && props.onClose('confirm', { project: working, edits: edits }); } },
              I('check'), ' Use this pattern')
          )
        )
      )
    );
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
        cleanup();
        resolve(Object.assign({ action: action }, payload || {}));
      }
      var element = h(ImportReviewModal, Object.assign({}, opts, { onClose: onClose }));
      if (root) root.render(element); else ReactDOM.render(element, host);
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
