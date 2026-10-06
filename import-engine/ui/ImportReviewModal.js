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

  /* The DMC table. dmc-data.js declares it with a top-level const, a global
   * that is not a property of window, so window.DMC is always undefined. */
  function dmcAll() {
    var TP = window.ImportEngine && window.ImportEngine.threadPicker;
    if (TP) return TP.dmcList();
    // eslint-disable-next-line no-undef
    return typeof DMC !== 'undefined' ? DMC : [];
  }

  /* A DMC thread by its number, from the thread table the PDF importer loads. */
  function dmcThread(code) {
    code = String(code || '').trim();
    if (!code) return null;
    if (typeof window.getDmcByIdCI === 'function') return window.getDmcByIdCI(code) || null;
    var all = dmcAll();
    for (var i = 0; i < all.length; i++) {
      if (String(all[i].id).toLowerCase() === code.toLowerCase()) return all[i];
    }
    return null;
  }

  /* A symbol as the scan shows it — a few dozen pixels cut from the page — so
   * "Symbol 12" can be found in the printed key. */
  function GlyphSample(props) {
    var ref = React.useRef(null);
    var s = props.sample;
    React.useEffect(function () {
      var canvas = ref.current;
      if (!canvas || !s || typeof ImageData === 'undefined') return;
      try { canvas.getContext('2d').putImageData(new ImageData(s.data, s.w, s.h), 0, 0); } catch (_) {}
    }, [s]);
    return h('canvas', { ref: ref, width: s.w, height: s.h, className: 'import-glyph-sample',
      role: 'img', 'aria-label': props.label });
  }

  function picker() { return (window.ImportEngine && window.ImportEngine.threadPicker) || null; }
  function rgbCss(rgb) { return 'rgb(' + rgb[0] + ',' + rgb[1] + ',' + rgb[2] + ')'; }

  /* Anchor's table and its DMC conversions load on demand; ask for them once,
   * and say when they arrive. */
  function useAnchorTables(wanted) {
    var _r = React.useState(!!window.ANCHOR); var ready = _r[0], setReady = _r[1];
    React.useEffect(function () {
      if (!wanted || ready) return;
      var load = typeof window.loadThreadData === 'function' ? window.loadThreadData() : null;
      if (!load) return;
      var live = true;
      load.then(function () { if (live) setReady(!!window.ANCHOR); }, function () {});
      return function () { live = false; };
    }, [wanted, ready]);
    return ready;
  }

  /* Choose the thread for one palette entry by typing its number — DMC's, or
   * Anchor's, which becomes its DMC equivalent since patterns hold DMC. */
  function ThreadChooser(props) {
    var _v = React.useState(''); var value = _v[0], setValue = _v[1];
    var _e = React.useState(null); var error = _e[0], setError = _e[1];
    var _b = React.useState('dmc'); var brand = _b[0], setBrand = _b[1];
    var anchorReady = useAnchorTables(brand === 'anchor');
    var TP = picker();
    var conv = brand === 'anchor' && anchorReady && TP ? TP.fromAnchor(value) : null;
    var match = brand === 'anchor' ? (conv && conv.dmc) : dmcThread(value);
    function submit(ev) {
      if (ev) ev.preventDefault();
      var v = value.trim();
      if (!v) return;
      if (!match) {
        setError(brand === 'anchor'
          ? (anchorReady ? 'No Anchor thread numbered ' + v + '.' : 'Anchor’s colours are still loading.')
          : 'No DMC thread numbered ' + v + '.');
        return;
      }
      if (props.onChoose(match.id) === false) {
        setError('That would undo another choice: two colours cannot each become the other.');
      } else {
        setValue(''); setError(null);
      }
    }
    return h('form', { className: 'import-thread-chooser', onSubmit: submit },
      h('select', { className: 'import-thread-brand', value: brand, 'aria-label': 'Thread brand',
        onChange: function (e) { setBrand(e.target.value); setError(null); } },
        h('option', { value: 'dmc' }, 'DMC'),
        h('option', { value: 'anchor' }, 'Anchor')),
      h('input', {
        type: 'text', inputMode: 'text', autoComplete: 'off',
        list: brand === 'anchor' ? 'import-anchor-codes' : 'import-dmc-codes',
        className: 'import-thread-input', placeholder: brand === 'anchor' ? 'Anchor no.' : 'DMC no.', value: value,
        autoFocus: !!props.autoFocus,
        'aria-label': (brand === 'anchor' ? 'Anchor' : 'DMC') + ' thread for ' + props.label,
        'aria-invalid': error ? 'true' : 'false',
        onChange: function (e) { setValue(e.target.value); setError(null); }
      }),
      brand === 'anchor' && anchorReady && h('datalist', { id: 'import-anchor-codes' },
        (window.ANCHOR || []).map(function (d) { return h('option', { key: d.id, value: d.id }, d.name); })),
      match && h('span', { className: 'import-thread-match' },
        h('span', { className: 'import-palette-swatch', style: { background: rgbCss(match.rgb) } }),
        conv
          ? 'DMC ' + match.id + ' ' + match.name + (conv.how === 'nearest' ? ' (nearest colour)' : ' (Anchor’s equivalent)')
          : match.name),
      h('button', { type: 'submit', className: 'g-btn', disabled: !value.trim() }, 'Use'),
      props.onBrowse && h('button', { type: 'button', className: 'g-btn icon-only',
        'aria-label': 'Choose a colour for ' + props.label, 'aria-expanded': props.browsing ? 'true' : 'false',
        onClick: props.onBrowse }, I('palette')),
      props.onCancel && h('button', { type: 'button', className: 'g-btn icon-only', 'aria-label': 'Cancel',
        onClick: props.onCancel }, I('x')),
      error && h('span', { className: 'import-thread-error', role: 'alert' }, error)
    );
  }

  function SwatchButton(props) {
    var t = props.thread;
    var prefix = props.prefix == null ? 'DMC ' : props.prefix;
    var label = prefix + t.id + (t.name && t.name !== t.id ? ' ' + t.name : '');
    return h('button', { type: 'button', className: 'import-swatch-btn', title: label, 'aria-label': label,
        onClick: function () { props.onChoose(t.id); } },
      h('span', { className: 'import-swatch-chip', style: { background: rgbCss(t.rgb) } }),
      h('span', { className: 'import-swatch-code' }, t.id));
  }

  /* Choose a thread by eye: a colour already in the chart (the usual answer
   * when the scan split one thread in two), one of the threads nearest this
   * colour (when the importer landed on a neighbouring shade), or any DMC
   * thread, family by family. A placeholder's colour is invented, so it has
   * no nearest threads to offer. */
  function ColourPicker(props) {
    var TP = picker();
    var _f = React.useState(function () { return (!props.placeholder && TP) ? TP.familyOf(props.rgb) : 1; });
    var fam = _f[0], setFam = _f[1];
    if (!TP) return null;
    var near = props.placeholder ? [] : TP.nearestDmc(props.rgb, 12, [props.id]);
    var section = function (title, threads, prefix) {
      if (!threads.length) return null;
      return h('section', { className: 'import-picker-section' },
        h('h4', null, title),
        h('div', { className: 'import-picker-swatches' }, threads.map(function (t) {
          return h(SwatchButton, { key: t.id, thread: t, prefix: prefix, onChoose: props.onChoose });
        })));
    };
    return h('div', { className: 'import-colour-picker', role: 'region', 'aria-label': 'Choose a colour for ' + props.label },
      section('In this chart', props.chartColours, ''),
      section('Close to this colour', near),
      h('section', { className: 'import-picker-section' },
        h('h4', null, 'All DMC colours'),
        h('div', { className: 'import-picker-families', role: 'group', 'aria-label': 'Colour family' },
          TP.FAMILIES.map(function (f) {
            return h('button', { key: f.id, type: 'button', className: 'import-family-btn' + (f.id === fam ? ' active' : ''),
              'aria-pressed': f.id === fam ? 'true' : 'false', onClick: function () { setFam(f.id); } }, f.name);
          })),
        h('div', { className: 'import-picker-swatches' }, TP.familyThreads(fam).map(function (t) {
          return h(SwatchButton, { key: t.id, thread: t, onChoose: props.onChoose });
        }))),
      h('div', { className: 'import-picker-actions' },
        h('button', { type: 'button', className: 'g-btn', onClick: props.onClose }, 'Close'))
    );
  }

  /* The colours of the imported pattern, with a way to set the thread of any
   * of them. Placeholders — symbols the key does not list, or symbols read
   * from a scan — come first, each waiting for a thread. Choosing a thread
   * another colour already uses merges the two. */
  function ImportPaletteList(props) {
    var _o = React.useState(null); var open = _o[0], setOpen = _o[1];
    var counts = {};
    var rows = {};
    (props.project.pattern || []).forEach(function (m) {
      if (!m || m.id === '__skip__' || m.id === '__empty__') return;
      counts[m.id] = (counts[m.id] || 0) + 1;
      if (!rows[m.id]) rows[m.id] = m;
    });
    (props.project.partialStitches || []).forEach(function (entry) {
      Object.keys(entry[1] || {}).forEach(function (corner) {
        var m = entry[1][corner];
        if (!m || !m.id || m.id === '__skip__' || m.id === '__empty__') return;
        counts[m.id] = (counts[m.id] || 0) + 1;
        if (!rows[m.id]) rows[m.id] = m;
      });
    });
    var report = props.project.importReport || {};
    var pending = {};
    (report.placeholders || []).forEach(function (p) { if (counts[p.id]) pending[p.id] = p; });
    var pendingIds = Object.keys(pending);
    var ids = Object.keys(counts).sort(function (a, b) {
      var pa = pending[a] ? 0 : 1, pb = pending[b] ? 0 : 1;
      return pa - pb || counts[b] - counts[a];
    });
    var assigned = Object.keys(props.assignments || {});
    var canChoose = !!props.onAssign && (typeof window.getDmcByIdCI === 'function' || dmcAll().length > 0);
    var _p = React.useState(null); var picking = _p[0], setPicking = _p[1];
    // The chart's own threads, for "same as" — never a placeholder, whose
    // colour is invented.
    var chartColours = ids.filter(function (id) { return !pending[id]; })
      .map(function (id) { return { id: id, name: rows[id].name, rgb: rows[id].rgb || [0, 0, 0] }; });
    function choose(id, to) {
      var ok = props.onAssign(id, to);
      if (ok !== false) { setOpen(null); setPicking(null); }
      return ok;
    }

    return h('div', { className: 'import-palette-list' },
      h('div', { className: 'import-palette-header' }, ids.length + ' colours'),
      pendingIds.length > 0 && h('p', { className: 'import-palette-pending' }, I('warning'),
        h('span', null, pendingIds.length === 1
          ? '1 symbol has no thread yet. Find it in the printed key, then enter its number or choose its colour.'
          : pendingIds.length + ' symbols have no thread yet. Find each in the printed key, then enter its number or choose its colour. Two symbols given the same thread become one colour.')),
      canChoose && h('datalist', { id: 'import-dmc-codes' },
        dmcAll().map(function (d) { return h('option', { key: d.id, value: d.id }, d.name); })),
      ids.slice(0, 200).map(function (id) {
        var m = rows[id];
        var rgb = m.rgb || [0, 0, 0];
        var label = pending[id] ? (m.symbol ? 'Symbol ' + m.symbol : (pending[id].name || id)) : (id + (m.name && m.name !== id ? ' ' + m.name : ''));
        var choosing = canChoose && (pending[id] || open === id);
        return h('div', { key: id, className: 'import-palette-row' + (pending[id] ? ' pending' : '') },
          props.samples && props.samples[id]
            ? h(GlyphSample, { sample: props.samples[id], label: 'How ' + label + ' looks in the scan' })
            : h('span', { className: 'import-palette-swatch',
                style: { background: 'rgb(' + rgb[0] + ',' + rgb[1] + ',' + rgb[2] + ')' } }),
          h('span', { className: 'import-palette-name' },
            h('span', { className: 'import-palette-id' }, pending[id] ? (m.symbol ? 'Symbol ' + m.symbol : id) : id),
            pending[id] ? h('span', { className: 'import-palette-note' },
                pending[id].reason === 'scanned' ? 'Read from the scan' : 'Not in the key')
              : (m.name && m.name !== id && h('span', { className: 'import-palette-note' }, m.name))),
          h('span', { className: 'import-palette-count' }, counts[id]),
          choosing
            ? h(ThreadChooser, { label: label, autoFocus: open === id,
                onChoose: function (to) { return choose(id, to); },
                browsing: picking === id,
                onBrowse: function () { setPicking(picking === id ? null : id); },
                onCancel: pending[id] ? null : function () { setOpen(null); setPicking(null); } })
            : (canChoose && h('button', { type: 'button', className: 'g-btn icon-only',
                'aria-label': 'Change the thread for ' + id, onClick: function () { setOpen(id); } }, I('pencil'))),
          picking === id && h(ColourPicker, { id: id, label: label, rgb: rgb, placeholder: !!pending[id],
            chartColours: chartColours.filter(function (c) { return c.id !== id; }),
            onChoose: function (to) { return choose(id, to); },
            onClose: function () { setPicking(null); } })
        );
      }),
      assigned.length > 0 && h('section', { className: 'import-palette-assigned', 'aria-label': 'Threads you chose' },
        h('h3', null, 'Threads you chose'),
        assigned.map(function (from) {
          return h('div', { key: from, className: 'import-palette-assigned-row' },
            props.samples && props.samples[from] && h(GlyphSample, { sample: props.samples[from], label: 'How ' + ((props.labels && props.labels[from]) || from) + ' looks in the scan' }),
            h('span', null, (props.labels && props.labels[from]) || from),
            h('span', { className: 'import-palette-arrow', 'aria-hidden': 'true' }, I('chevronRight')),
            h('span', { className: 'import-palette-id' }, props.assignments[from]),
            h('button', { type: 'button', className: 'g-btn', onClick: function () { props.onUnassign(from); } },
              I('undo'), h('span', null, 'Undo'))
          );
        })
      )
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
    var guessed = session.layoutSource === 'guessed';
    var edited = !!(props.placement && props.placement.manual) &&
      !M.samePlacement(props.placement, session.placement);

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
    var ovCols = (slots.overlap && slots.overlap.cols) || 0;
    var ovRows = (slots.overlap && slots.overlap.rows) || 0;

    var intro = fromRulers
      ? 'Each page was placed using the row and column numbers printed on it. Check the pages line up, and move any that do not.'
      : guessed
        ? 'These pages have no row and column numbers, so their arrangement was worked out from their sizes and edges. Check the pages line up, and move any that do not.'
        : 'These pages have no row and column numbers, so they were laid out in page order. Set how many pages go across, then move any that are in the wrong place.';
    if (edited) intro = fromRulers ? 'You have changed the layout read from the PDF.' : 'You have changed the layout.';
    var resetLabel = fromRulers ? 'Use the PDF’s layout' : (guessed ? 'Use the suggested layout' : 'Back to page order');

    function stepper(id, label, value, min, max, fewer, more, onChange) {
      return h('div', { className: 'page-layout-stepper' },
        h('span', { id: id }, label),
        h('button', { type: 'button', className: 'g-btn icon-only', 'aria-label': fewer,
          disabled: value <= min, onClick: function () { onChange(value - 1); } }, I('minus')),
        h('output', { 'aria-labelledby': id, className: 'page-layout-value' }, String(value)),
        h('button', { type: 'button', className: 'g-btn icon-only', 'aria-label': more,
          disabled: value >= max, onClick: function () { onChange(value + 1); } }, I('plus'))
      );
    }

    return h('div', { className: 'page-layout' },
      h('p', { className: 'page-layout-intro' + (fromRulers && !edited ? '' : ' attention') }, intro),
      h('div', { className: 'page-layout-controls' },
        stepper('page-layout-across', 'Pages across', across, 1, maxAcross, 'Fewer pages across', 'More pages across',
          function (v) { commit(M.setAcross(slots, v)); }),
        stepper('page-layout-overlap-cols', 'Columns repeated at page edges', ovCols, 0, 10,
          'Fewer repeated columns', 'More repeated columns',
          function (v) { commit(M.setOverlap(slots, v, ovRows)); }),
        stepper('page-layout-overlap-rows', 'Rows repeated at page edges', ovRows, 0, 10,
          'Fewer repeated rows', 'More repeated rows',
          function (v) { commit(M.setOverlap(slots, ovCols, v)); }),
        edited && h('button', { type: 'button', className: 'g-btn', onClick: reset },
          I('undo'), h('span', null, resetLabel))
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
              onDragStart: function (ev) {
                if (!page) return;
                ev.dataTransfer.setData('text/plain', String(pi));
                ev.dataTransfer.effectAllowed = 'move';
                setDrag({ from: 'slot', slot: k, page: pi });
              },
              onDragEnd: function () { setDrag(null); },
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
              onDragStart: function (ev) {
                ev.dataTransfer.setData('text/plain', String(pi));
                ev.dataTransfer.effectAllowed = 'move';
                setDrag({ from: 'tray', page: pi });
              },
              onDragEnd: function () { setDrag(null); },
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
    var LM = window.ImportEngine && window.ImportEngine.pageLayout;
    var session = LM && props.layoutSession && props.layoutSession.pages && props.layoutSession.pages.length > 1
      ? props.layoutSession : null;
    var hasPlaceholders = !!(props.project && props.project.importReport &&
      props.project.importReport.placeholders && props.project.importReport.placeholders.length);
    var _t = React.useState((session && LM && LM.needsReview(session)) ? 'pages' : (hasPlaceholders ? 'palette' : 'preview'));
    var tab = _t[0], setTab = _t[1];
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
    function assignThread(from, to) {
      if (from === to) return true;
      var threads = Object.assign({}, edits.threads || {});
      var seen = {};
      for (var id = to; threads[id]; id = threads[id]) {
        if (id === from || seen[id]) return false;
        seen[id] = true;
      }
      threads[from] = to;
      applyEdit('threads', threads);
      return true;
    }
    function unassignThread(from) {
      var threads = Object.assign({}, edits.threads || {});
      delete threads[from];
      applyEdit('threads', threads);
    }
    // What each colour was called as imported, for the list of choices made.
    var threadLabels = {};
    ((props.project && props.project.importReport && props.project.importReport.placeholders) || [])
      .forEach(function (p) { threadLabels[p.id] = p.symbol ? 'Symbol ' + p.symbol : p.name; });
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

    var summary = importSummary(working, props.coverage);
    var coverageIcon = summary.level === 'high' ? I('confidenceHigh') : (summary.level === 'medium' ? I('info') : I('confidenceLow'));

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
          h('div', { className: 'import-review-coverage', title: summary.detail || null }, coverageIcon, h('span', null, summary.label)),
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
          tab === 'palette'  && h(ImportPaletteList, { project: working, assignments: edits.threads || {},
                                                samples: (props.layoutSession && props.layoutSession.glyphSamples) || null,
                                                labels: threadLabels, onAssign: assignThread, onUnassign: unassignThread }),
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
    if (edits.threads && Object.keys(edits.threads).length) next = assignThreads(next, edits.threads);
    return next;
  }

  /* The figure in the review's header: how far to trust the import.
   *
   * A PDF chart says what it is — its colour key — so the honest figure is how
   * many stitches were matched to that key, by symbol or by swatch, rather than
   * by the nearest colour. The engine's own confidence is 100% for every PDF,
   * since the importer hands over a finished pattern, which said nothing.
   * A scan, and a chart with no key, have nothing to match to and say so. Other
   * formats keep the engine's figure. */
  function importSummary(project, coverage) {
    var r = project && project.importReport;
    var m = r && r.matched;
    var left = (r && r.placeholders && r.placeholders.length) || 0;
    var needs = left ? ' ' + left + (left === 1 ? ' symbol needs' : ' symbols need') + ' a thread.' : '';
    if (m) {
      if (r.scanned) {
        return { level: 'low', label: 'Read from a scan',
          detail: 'Colours and symbols were read from a picture of the chart, so check them against the printed key.' + needs };
      }
      if (!r.keyEntries) {
        return { level: 'low', label: 'No colour key found',
          detail: 'Thread colours were estimated from the chart.' + needs };
      }
      // Nearest key colour counts as a match when the key's colours are too
      // far apart to mistake (PAT1968_2's seven), not when two are close.
      var read = (m.symbol || 0) + (m.swatch || 0) + (r.keyColoursDistinct ? (m.nearest || 0) : 0);
      var total = (m.symbol || 0) + (m.swatch || 0) + (m.nearest || 0) + (m.catalogue || 0) + (m.unresolved || 0);
      if (total) {
        var share = read / total;
        var pct = Math.floor(share * 100);
        return { level: left ? 'low' : share >= 0.98 ? 'high' : share >= 0.85 ? 'medium' : 'low',
          label: pct + '% matched to the key',
          detail: read + ' of ' + total + ' stitches were matched to the PDF’s colour key' +
            (read < total ? '; the rest were matched by colour similarity or not at all.' : '.') + needs };
      }
    }
    var c = coverage || 0;
    return { level: c >= 0.95 ? 'high' : c >= 0.8 ? 'medium' : 'low', label: Math.round(c * 100) + '% confidence' };
  }

  /* Give colours the threads the stitcher chose: `threads` maps a colour's id
   * to a DMC number. Choices chain — a placeholder set to 310, and 310 then
   * changed to 3371, ends as 3371. */
  function assignThreads(project, threads) {
    var memo = {};
    function target(id) {
      if (id in memo) return memo[id];
      var to = id, seen = {};
      while (threads[to] && threads[to] !== to) {
        if (seen[to]) { memo[id] = null; return null; }
        seen[to] = true;
        to = threads[to];
      }
      var t = to === id ? null : dmcThread(to);
      memo[id] = t;
      return t;
    }
    function remap(m) {
      if (!m || m.id === '__skip__' || m.id === '__empty__') return m;
      var t = target(m.id);
      if (!t) return m;
      return Object.assign({}, m, { id: t.id, name: t.name, rgb: t.rgb.slice(), lab: t.lab ? t.lab.slice() : m.lab });
    }
    var next = Object.assign({}, project, { pattern: (project.pattern || []).map(remap) });
    if (project.partialStitches) {
      next.partialStitches = project.partialStitches.map(function (e) {
        var q = {};
        Object.keys(e[1] || {}).forEach(function (k) {
          var t = target(e[1][k].id);
          q[k] = t ? { id: t.id, rgb: t.rgb.slice(), name: t.name } : e[1][k];
        });
        return [e[0], q];
      });
    }
    var report = project.importReport;
    if (report && report.placeholders && report.placeholders.length) {
      var left = report.placeholders.filter(function (p) { return !target(p.id); });
      // The importer's own notes about placeholders give way to a count of
      // those still to do.
      var warnings = (report.warnings || []).filter(function (w) { return !/placeholder/i.test(w); });
      if (left.length) {
        warnings.push(left.length === 1 ? '1 symbol still has no thread and keeps its placeholder colour.'
          : left.length + ' symbols still have no thread and keep their placeholder colours.');
      }
      next.importReport = Object.assign({}, report, { placeholders: left, warnings: warnings });
    }
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
    importSummary: importSummary,
  };
  window.ImportEngine = Object.assign(window.ImportEngine || {}, api);
})();
