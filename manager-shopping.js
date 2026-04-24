/* manager-shopping.js — B4 Stash Manager "Shopping" tab.
   Aggregates required threads across the user's active projects, compares
   against the current stash, and lets the user bulk-add deficits to the
   shopping list via the existing StashBridge.markManyToBuy bridge.

   Loaded as a plain <script> tag in manager.html (after project-storage.js
   and stash-bridge.js so its dependencies are available).

   Also exposes a couple of pure helpers on window.ManagerShopping for tests
   to assert against without needing to drive React under jsdom. */

(function () {
  'use strict';

  // ── Pure helpers (testable) ───────────────────────────────────────────────

  // Project state classification mirrors ProjectStorage.getProjectStates().
  // 'active' / 'queued' counts as "active for shopping". 'paused' / 'complete'
  // / 'design' / 'wishlist' do not. An unset state defaults to active.
  function isActiveStateForShopping(state) {
    if (state == null || state === '') return true;
    return state === 'active' || state === 'queued';
  }

  // Composite-key helper: returns 'dmc:310' for a bare DMC id, or the input
  // unchanged if it already contains ':'.
  function compositeKey(brand, id) {
    if (typeof id === 'string' && id.indexOf(':') !== -1) return id;
    return (brand || 'dmc') + ':' + id;
  }

  // Skein estimator with a graceful fallback when threadCalc.js isn't loaded.
  function estimateSkeins(stitchCount, fabricCount) {
    if (typeof stitchesToSkeins === 'function') {
      var sk = stitchesToSkeins({ stitchCount: stitchCount, fabricCount: fabricCount, strandsUsed: 2 });
      if (sk && sk.colorA) return Math.max(sk.colorA.skeinsToBuy || 0, sk.colorB.skeinsToBuy || 0);
      if (sk) return sk.skeinsToBuy || 0;
    }
    if (typeof skeinEst === 'function') return skeinEst(stitchCount, fabricCount);
    return Math.ceil(stitchCount / 800);
  }

  // Pure aggregator. Inputs:
  //   projects: array of { id, threads:[{id,brand?,count?,name?,rgb?}], fabricCt? }
  //             — minimum needed for the test surface; the full payload form
  //             produced by ProjectStorage.get() is also accepted.
  //   stash:    { 'dmc:310': { owned:N, ... }, ... }
  // Output: array of rows sorted by deficit descending. Each row:
  //   { key, id, brand, name, rgb, totalNeeded, owned, deficit, projectIds }
  function aggregateDeficits(projects, stash) {
    var byKey = {};
    if (!Array.isArray(projects)) return [];
    var s = stash || {};
    for (var i = 0; i < projects.length; i++) {
      var proj = projects[i] || {};
      var pid = proj.id || ('proj_' + i);
      var fab = proj.fabricCt || (proj.settings && proj.settings.fabricCt) || 14;
      // Thread sources: prefer pal[]/pattern's palette field; fall back to
      // proj.threads if a test passes a flattened shape.
      var threadSrc = proj.pal || proj.palette || proj.threads || [];
      for (var j = 0; j < threadSrc.length; j++) {
        var t = threadSrc[j] || {};
        if (!t.id || t.id === '__skip__' || t.id === '__empty__') continue;
        var idsForBlend = (t.type === 'blend' && typeof t.id === 'string' && t.id.indexOf('+') !== -1)
          ? t.id.split('+') : [t.id];
        for (var k = 0; k < idsForBlend.length; k++) {
          var id = idsForBlend[k];
          var brand = t.brand || 'dmc';
          var key = compositeKey(brand, id);
          var stitches = t.count != null ? t.count : (t.stitches || 0);
          var needed = estimateSkeins(stitches, fab);
          if (needed < 1) needed = 1;
          if (!byKey[key]) {
            byKey[key] = {
              key: key, id: id, brand: brand,
              name: (t.threads && t.threads[k] && t.threads[k].name) || t.name || String(id),
              rgb: (t.threads && t.threads[k] && t.threads[k].rgb) || t.rgb || [200,200,200],
              totalNeeded: 0, owned: 0, deficit: 0, projectIds: [],
            };
          }
          byKey[key].totalNeeded += needed;
          if (byKey[key].projectIds.indexOf(pid) === -1) byKey[key].projectIds.push(pid);
        }
      }
    }
    var rows = [];
    for (var key2 in byKey) {
      if (!Object.prototype.hasOwnProperty.call(byKey, key2)) continue;
      var entry = s[key2] || s[key2.replace(/^[^:]+:/, '')] || {};
      byKey[key2].owned = entry.owned || 0;
      byKey[key2].deficit = Math.max(0, byKey[key2].totalNeeded - byKey[key2].owned);
      if (byKey[key2].deficit > 0) rows.push(byKey[key2]);
    }
    rows.sort(function (a, b) { return b.deficit - a.deficit; });
    return rows;
  }

  // ── React component ───────────────────────────────────────────────────────

  function ManagerShoppingComponent(props) {
    var React = window.React;
    if (!React) return null;
    var h = React.createElement;
    var useState = React.useState;
    var useEffect = React.useEffect;
    var useMemo = React.useMemo;

    var _projects = useState([]);
    var projects = _projects[0], setProjects = _projects[1];
    var _stash = useState({});
    var stash = _stash[0], setStash = _stash[1];
    var _loading = useState(true);
    var loading = _loading[0], setLoading = _loading[1];
    var _busy = useState(false);
    var busy = _busy[0], setBusy = _busy[1];

    useEffect(function () {
      var cancelled = false;
      function load() {
        if (typeof ProjectStorage === 'undefined' || typeof StashBridge === 'undefined') {
          setLoading(false); return;
        }
        var states = (typeof ProjectStorage.getProjectStates === 'function')
          ? ProjectStorage.getProjectStates() : {};
        ProjectStorage.listProjects().then(function (metas) {
          var actives = (metas || []).filter(function (m) {
            return isActiveStateForShopping(states[m.id]);
          });
          // Lazy-load full payloads (B5 PERF NOTE pattern).
          return Promise.all(actives.map(function (m) {
            return ProjectStorage.get(m.id).then(function (full) {
              if (!full) return null;
              return {
                id: m.id,
                pal: full.pal || full.palette || (full.pattern && full.pattern.palette) || [],
                fabricCt: (full.settings && full.settings.fabricCt) || full.fabricCt || 14,
                name: m.name || full.name,
              };
            }).catch(function () { return null; });
          }));
        }).then(function (full) {
          if (cancelled) return;
          setProjects((full || []).filter(Boolean));
          return StashBridge.getGlobalStash();
        }).then(function (s) {
          if (cancelled) return;
          setStash(s || {});
          setLoading(false);
        }).catch(function (e) {
          console.error('ManagerShopping load failed:', e);
          if (!cancelled) setLoading(false);
        });
      }
      load();
      function onChange() { load(); }
      window.addEventListener('cs:projectsChanged', onChange);
      window.addEventListener('cs:stashChanged', onChange);
      return function () {
        cancelled = true;
        window.removeEventListener('cs:projectsChanged', onChange);
        window.removeEventListener('cs:stashChanged', onChange);
      };
    }, []);

    var rows = useMemo(function () { return aggregateDeficits(projects, stash); }, [projects, stash]);
    var projectNamesById = useMemo(function () {
      var map = {};
      for (var i = 0; i < projects.length; i++) {
        var p = projects[i] || {};
        map[p.id] = p.name || p.id || 'Untitled project';
      }
      return map;
    }, [projects]);
    // fix-3.9 — which row(s) have their "Used in N projects" disclosure expanded.
    var _expanded = useState({});
    var expandedRows = _expanded[0], setExpandedRows = _expanded[1];
    function toggleRow(key) {
      setExpandedRows(function (prev) {
        var next = {}; for (var k in prev) next[k] = prev[k];
        next[key] = !prev[key]; return next;
      });
    }
    function openProject(pid) {
      if (typeof props.onOpenProject === 'function') { props.onOpenProject(pid); return; }
      if (typeof window.openProject === 'function') { window.openProject(pid); return; }
      // Last-resort fallback: navigate to the stitch page with the active id set.
      try {
        if (typeof ProjectStorage !== 'undefined' && typeof ProjectStorage.setActiveProject === 'function') {
          ProjectStorage.setActiveProject(pid);
        }
        window.location.href = 'stitch.html';
      } catch (_) {}
    }

    function handleBulkAdd() {
      if (!(window.StashBridge && typeof StashBridge.markManyToBuy === 'function')) return;
      var keys = rows.map(function (r) { return r.key; });
      if (keys.length === 0) return;
      setBusy(true);
      Promise.resolve(StashBridge.markManyToBuy(keys, true))
        .then(function () {
          if (window.Toast && typeof Toast.show === 'function') {
            Toast.show({ message: 'Added ' + keys.length + ' thread' + (keys.length === 1 ? '' : 's') + ' to your shopping list.', type: 'success', duration: 3000 });
          }
        })
        .catch(function (e) { console.error('ManagerShopping bulk add failed:', e); })
        .then(function () { setBusy(false); });
    }

    function handleRowToggle(row) {
      if (!(window.StashBridge && typeof StashBridge.markManyToBuy === 'function')) return;
      Promise.resolve(StashBridge.markManyToBuy([row.key], true)).catch(function () {});
    }

    if (loading) {
      return h('div', { className: 'mgr-shopping-loading', style: { padding: '24px 16px', fontSize: 13, color: 'var(--text-tertiary)' } }, 'Loading shopping list\u2026');
    }
    if (projects.length === 0) {
      return h('div', { className: 'mgr-shopping-empty', style: { padding: '32px 16px', textAlign: 'center', color: 'var(--text-secondary)' } },
        h('div', { style: { fontSize: 14, fontWeight: 500, marginBottom: 4 } }, 'No active projects yet.'),
        h('div', { style: { fontSize: 12, color: 'var(--text-tertiary)' } }, 'Add a project to see which threads you still need to buy.')
      );
    }
    if (rows.length === 0) {
      return h('div', { className: 'mgr-shopping-covered', style: { padding: '32px 16px', textAlign: 'center', color: 'var(--text-secondary)' } },
        h('div', { style: { fontSize: 14, fontWeight: 500, marginBottom: 4 } }, 'All your active projects have the threads they need.'),
        h('div', { style: { fontSize: 12, color: 'var(--text-tertiary)' } }, 'Nothing to add to the shopping list right now.')
      );
    }

    var totalDeficitSkeins = rows.reduce(function (s, r) { return s + r.deficit; }, 0);
    return h('div', { className: 'mgr-shopping' },
      h('div', { className: 'mgr-shopping-header', style: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, padding: '12px 16px', borderBottom: '1px solid var(--border)' } },
        h('div', null,
          // fix-3.4 — explicit scope caption so the user understands this view
          // aggregates *all active projects*, not just the current one.
          h('div', { className: 'mgr-shopping-caption', style: { fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.4, color: 'var(--text-tertiary)', marginBottom: 4 } }, 'Shopping across all active projects'),
          h('div', { style: { fontSize: 14, fontWeight: 600 } }, rows.length + ' thread' + (rows.length === 1 ? '' : 's') + ' to buy'),
          h('div', { style: { fontSize: 11, color: 'var(--text-tertiary)' } }, totalDeficitSkeins + ' skein' + (totalDeficitSkeins === 1 ? '' : 's') + ' across ' + projects.length + ' project' + (projects.length === 1 ? '' : 's'))
        ),
        h('button', {
          type: 'button',
          disabled: busy,
          onClick: handleBulkAdd,
          className: 'mgr-shopping-bulk',
          style: { padding: '8px 14px', fontSize: 12, fontWeight: 600, borderRadius: 8, border: 'none', background: 'var(--accent)', color: '#fff', cursor: busy ? 'wait' : 'pointer' },
        }, busy ? 'Adding\u2026' : 'Add all deficits')
      ),
      h('div', { className: 'mgr-shopping-list', role: 'list' },
        rows.map(function (r) {
          var isOpen = !!expandedRows[r.key];
          var projectCount = r.projectIds.length;
          return h('div', { key: r.key, role: 'listitem', className: 'mgr-shopping-row',
            style: { display: 'grid', gridTemplateColumns: '24px 1fr auto auto auto', gap: 10, alignItems: 'start', padding: '8px 16px', borderBottom: '1px solid var(--border)' } },
            h('span', { 'aria-hidden': 'true', style: { display: 'inline-block', width: 20, height: 20, borderRadius: 4, background: 'rgb(' + r.rgb.join(',') + ')', border: '1px solid var(--border)', marginTop: 2 } }),
            h('div', { style: { fontSize: 12, minWidth: 0 } },
              h('div', null,
                h('strong', null, r.id), ' \u00B7 ', r.name,
                h('span', { style: { fontSize: 10, color: 'var(--text-tertiary)', marginLeft: 6 } }, '(' + r.brand.toUpperCase() + ')')
              ),
              // fix-3.9 — per-row source list
              h('div', { className: 'mgr-shopping-sources', style: { marginTop: 2 } },
                h('button', {
                  type: 'button',
                  className: 'mgr-shopping-sources-toggle',
                  'aria-expanded': isOpen ? 'true' : 'false',
                  onClick: function () { toggleRow(r.key); },
                }, (isOpen ? '\u2212 ' : '+ ') + 'Used in ' + projectCount + ' project' + (projectCount === 1 ? '' : 's')),
                isOpen ? h('ul', { className: 'mgr-shopping-sources-list' },
                  r.projectIds.map(function (pid) {
                    var name = projectNamesById[pid] || pid;
                    return h('li', { key: pid },
                      h('button', {
                        type: 'button',
                        onClick: function () { openProject(pid); },
                        title: 'Open ' + name,
                      }, name)
                    );
                  })
                ) : null
              )
            ),
            h('span', { style: { fontSize: 11, color: 'var(--text-tertiary)' } }, 'across ' + projectCount + ' project' + (projectCount === 1 ? '' : 's')),
            h('span', { style: { fontSize: 11, color: 'var(--text-tertiary)' } }, 'need ' + r.totalNeeded + ', own ' + r.owned),
            h('button', {
              type: 'button',
              onClick: function () { handleRowToggle(r); },
              style: { fontSize: 11, fontWeight: 600, padding: '4px 10px', border: '1px solid var(--accent)', borderRadius: 6, background: 'transparent', color: 'var(--accent)', cursor: 'pointer' },
              'aria-label': 'Add ' + r.id + ' to shopping list',
            }, 'Add')
          );
        })
      )
    );
  }

  // Public surface
  window.ManagerShopping = ManagerShoppingComponent;
  window.ManagerShopping._aggregateDeficits = aggregateDeficits;
  window.ManagerShopping._isActiveStateForShopping = isActiveStateForShopping;
  window.ManagerShopping._compositeKey = compositeKey;
  window.ManagerShopping.EMPTY_NO_PROJECTS = 'No active projects yet.';
  window.ManagerShopping.EMPTY_ALL_COVERED = 'All your active projects have the threads they need.';
  window.ManagerShopping.SCOPE_CAPTION = 'Shopping across all active projects';
})();
