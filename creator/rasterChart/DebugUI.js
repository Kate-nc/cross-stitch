/* creator/rasterChart/DebugUI.js
 * ════════════════════════════════════════════════════════════════════════
 *   Raster cross-stitch chart importer — Phase 1 telemetry debug panel.
 *
 *   Mounts on a global keyboard shortcut (Ctrl+Shift+I when focus is NOT
 *   in an input/textarea/contenteditable, since DevTools also binds that
 *   chord). Shows per-import summaries and aggregate stats from
 *   window.RasterChartTelemetry.list().
 *
 *   No JSX — uses React.createElement so the bundle stays Babel-free.
 *
 *   Surfaces:
 *     • Settings toggle: opt out of telemetry (defaults ON, per spec).
 *     • Aggregate stats: n, median pipeline ms, median silhouette,
 *       acceptance %, abandonment %, correction-surface frequency,
 *       source-type mix.
 *     • Per-import table (most recent 50).
 *     • Export JSON / Clear buttons.
 *
 *   The whole module is a no-op without React on the page.
 * ════════════════════════════════════════════════════════════════════════
 */

(function () {
  'use strict';

  if (typeof window === 'undefined') return;

  const SHORTCUT_HELP = 'Ctrl+Shift+I (chart importer telemetry)';

  function mountIfNeeded() {
    if (!window.React || !window.ReactDOM) return null;
    let root = document.getElementById('rasterChart-debug-root');
    if (!root) {
      root = document.createElement('div');
      root.id = 'rasterChart-debug-root';
      document.body.appendChild(root);
    }
    return root;
  }

  function isEditableTarget(target) {
    if (!target) return false;
    const tag = (target.tagName || '').toLowerCase();
    if (tag === 'input' || tag === 'textarea' || tag === 'select') return true;
    return !!target.isContentEditable;
  }

  function open() {
    const root = mountIfNeeded();
    if (!root) return false;
    const React = window.React;
    const ReactDOM = window.ReactDOM;
    const T = window.RasterChartTelemetry;
    if (!T) return false;

    function Panel() {
      const [records, setRecords] = React.useState([]);
      const [enabled, setEnabledState] = React.useState(T.isEnabled());
      const [loading, setLoading] = React.useState(true);

      React.useEffect(() => {
        let live = true;
        T.list().then(r => {
          if (!live) return;
          setRecords(r); setLoading(false);
        });
        return () => { live = false; };
      }, []);

      const agg = T.aggregate(records);

      function refresh() {
        setLoading(true);
        T.list().then(r => { setRecords(r); setLoading(false); });
      }

      function toggle() {
        const next = !enabled;
        T.setEnabled(next);
        setEnabledState(next);
      }

      function exportJson() {
        T.exportJSON().then(json => {
          const blob = new Blob([json], { type: 'application/json' });
          const url = URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = url;
          a.download = 'raster-chart-telemetry-' + Date.now() + '.json';
          document.body.appendChild(a); a.click();
          setTimeout(() => { URL.revokeObjectURL(url); a.remove(); }, 0);
        });
      }

      function clearAll() {
        if (!window.confirm('Clear all raster chart importer telemetry?')) return;
        T.clear().then(() => refresh());
      }

      function close() {
        ReactDOM.unmountComponentAtNode(root);
      }

      return React.createElement('div', {
        role: 'dialog',
        'aria-label': 'Raster chart importer telemetry',
        style: {
          position: 'fixed', inset: '5vh 5vw',
          background: 'var(--surface, #fff)',
          color: 'var(--text-primary, #222)',
          border: '1px solid var(--line, #ccc)',
          borderRadius: 'var(--radius-sm, 6px)',
          boxShadow: 'var(--shadow-sm, 0 4px 24px rgba(0,0,0,.2))',
          zIndex: 99999,
          padding: '1.25rem',
          overflow: 'auto',
          fontFamily: 'system-ui, sans-serif',
        },
      }, [
        React.createElement('div', {
          key: 'hdr',
          style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' },
        }, [
          React.createElement('h2', { key: 'h', style: { margin: 0 } }, 'Chart importer telemetry'),
          React.createElement('button', { key: 'x', onClick: close, type: 'button' }, 'Close'),
        ]),

        React.createElement('label', {
          key: 'tg',
          style: { display: 'block', marginBottom: '0.75rem' },
        }, [
          React.createElement('input', {
            key: 'cb', type: 'checkbox', checked: enabled, onChange: toggle,
            style: { marginRight: '0.5rem' },
          }),
          'Capture telemetry for chart imports (local only \u2014 nothing leaves this device).',
        ]),

        loading
          ? React.createElement('p', { key: 'l' }, 'Loading\u2026')
          : React.createElement('div', { key: 'body' }, [
              React.createElement('section', { key: 'agg' }, [
                React.createElement('h3', { key: 'h3' }, 'Aggregate (' + agg.n + ' imports)'),
                React.createElement('dl', {
                  key: 'dl',
                  style: { display: 'grid', gridTemplateColumns: 'auto 1fr', gap: '0.25rem 1rem' },
                }, [
                  React.createElement('dt', { key: 'd1' }, 'Median pipeline ms'),
                  React.createElement('dd', { key: 'v1' }, String(agg.medianTotalMs)),
                  React.createElement('dt', { key: 'd2' }, 'Median silhouette'),
                  React.createElement('dd', { key: 'v2' }, agg.medianSilhouette.toFixed(3)),
                  React.createElement('dt', { key: 'd3' }, 'Acceptance rate'),
                  React.createElement('dd', { key: 'v3' }, (agg.acceptanceRate * 100).toFixed(1) + ' %'),
                  React.createElement('dt', { key: 'd4' }, 'Abandonment rate'),
                  React.createElement('dd', { key: 'v4' }, (agg.abandonmentRate * 100).toFixed(1) + ' %'),
                  React.createElement('dt', { key: 'd5' }, 'Correction surface frequency'),
                  React.createElement('dd', { key: 'v5' },
                    JSON.stringify(agg.correctionFrequency)),
                  React.createElement('dt', { key: 'd6' }, 'Source mix'),
                  React.createElement('dd', { key: 'v6' },
                    JSON.stringify(agg.sourceMix)),
                ]),
              ]),

              React.createElement('section', { key: 'rows', style: { marginTop: '1rem' } }, [
                React.createElement('h3', { key: 'h3' }, 'Recent imports'),
                React.createElement('table', {
                  key: 'tbl',
                  style: { width: '100%', fontSize: '0.85rem', borderCollapse: 'collapse' },
                }, [
                  React.createElement('thead', { key: 'th' },
                    React.createElement('tr', null, [
                      React.createElement('th', { key: 't1', style: thStyle }, 'when'),
                      React.createElement('th', { key: 't2', style: thStyle }, 'fingerprint'),
                      React.createElement('th', { key: 't3', style: thStyle }, 'image'),
                      React.createElement('th', { key: 't4', style: thStyle }, 'chart'),
                      React.createElement('th', { key: 't5', style: thStyle }, 'silh.'),
                      React.createElement('th', { key: 't6', style: thStyle }, 'corrections'),
                      React.createElement('th', { key: 't7', style: thStyle }, 'state'),
                    ])
                  ),
                  React.createElement('tbody', { key: 'tb' },
                    records.slice().reverse().slice(0, 50).map(r =>
                      React.createElement('tr', { key: r.id }, [
                        React.createElement('td', { key: 'a', style: tdStyle }, (r.createdAt || '').slice(11, 19)),
                        React.createElement('td', { key: 'b', style: tdStyle }, (r.fingerprint || '').slice(0, 8)),
                        React.createElement('td', { key: 'c', style: tdStyle },
                          (r.input && r.input.imageW) ? r.input.imageW + '\u00d7' + r.input.imageH : '\u2014'),
                        React.createElement('td', { key: 'd', style: tdStyle },
                          (r.input && r.input.chartCols) ? r.input.chartCols + '\u00d7' + r.input.chartRows : '\u2014'),
                        React.createElement('td', { key: 'e', style: tdStyle },
                          r.confidence && r.confidence.cluster
                            ? r.confidence.cluster.meanSilhouette.toFixed(2) : '\u2014'),
                        React.createElement('td', { key: 'f', style: tdStyle },
                          String((r.corrections || []).length)),
                        React.createElement('td', { key: 'g', style: tdStyle },
                          (r.acceptance && r.acceptance.state) || 'pending'),
                      ])
                    )
                  ),
                ]),
              ]),

              React.createElement('div', {
                key: 'btns',
                style: { marginTop: '1rem', display: 'flex', gap: '0.5rem' },
              }, [
                React.createElement('button', { key: 'r', onClick: refresh, type: 'button' }, 'Refresh'),
                React.createElement('button', { key: 'e', onClick: exportJson, type: 'button' }, 'Export JSON'),
                React.createElement('button', { key: 'c', onClick: clearAll, type: 'button' }, 'Clear all'),
              ]),
            ]),
      ]);
    }

    const thStyle = { textAlign: 'left', borderBottom: '1px solid var(--line, #ccc)', padding: '0.25rem 0.5rem' };
    const tdStyle = { padding: '0.2rem 0.5rem', borderBottom: '1px solid var(--line, #eee)' };

    ReactDOM.render(React.createElement(Panel), root);
    return true;
  }

  function onKey(ev) {
    // Ctrl+Shift+I, but skip when the user is editing text so DevTools'
    // own chord and form typing aren't disturbed.
    if (!(ev.ctrlKey && ev.shiftKey && (ev.key === 'I' || ev.key === 'i'))) return;
    if (isEditableTarget(ev.target)) return;
    ev.preventDefault();
    ev.stopPropagation();
    open();
  }

  function install() {
    if (window.__rasterChartDebugInstalled) return;
    window.__rasterChartDebugInstalled = true;
    window.addEventListener('keydown', onKey, true);
  }

  if (typeof document !== 'undefined') {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', install);
    } else {
      install();
    }
  }

  window.RasterChartDebugUI = { open, install, SHORTCUT_HELP };
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = { open, install, SHORTCUT_HELP };
  }
})();
