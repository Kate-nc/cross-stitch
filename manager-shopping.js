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
              // PERF (perf-4 #7): O(1) project-id dedupe via Set; emit array only at the end.
              _projectIdSet: new Set(),
            };
          }
          byKey[key].totalNeeded += needed;
          if (!byKey[key]._projectIdSet.has(pid)) {
            byKey[key]._projectIdSet.add(pid);
            byKey[key].projectIds.push(pid);
          }
        }
      }
    }
    var rows = [];
    for (var key2 in byKey) {
      if (!Object.prototype.hasOwnProperty.call(byKey, key2)) continue;
      var entry = s[key2] || s[key2.replace(/^[^:]+:/, '')] || {};
      byKey[key2].owned = entry.owned || 0;
      byKey[key2].deficit = Math.max(0, byKey[key2].totalNeeded - byKey[key2].owned);
      delete byKey[key2]._projectIdSet;
      if (byKey[key2].deficit > 0) rows.push(byKey[key2]);
    }
    rows.sort(function (a, b) { return b.deficit - a.deficit; });
    return rows;
  }

  // Pure helper: groups shopping-list rows for the My-list view.
  // mode: 'flat' | 'brand' | 'project'. Returns [{ label, key, rows }].
  // For 'project', a row may appear in multiple groups (one per source project).
  function groupRows(rows, mode, projectNamesById) {
    if (!Array.isArray(rows) || rows.length === 0) return [];
    var groups = [];
    if (mode === 'brand') {
      var byBrand = {};
      rows.forEach(function (r) {
        var b = (r.brand || 'dmc').toUpperCase();
        if (!byBrand[b]) byBrand[b] = { label: b, key: 'brand:' + b, rows: [] };
        byBrand[b].rows.push(r);
      });
      // Stable order: DMC first (most users), Anchor next, then alphabetical.
      var order = Object.keys(byBrand).sort(function (a, b) {
        if (a === b) return 0;
        if (a === 'DMC') return -1;
        if (b === 'DMC') return 1;
        if (a === 'ANCHOR') return -1;
        if (b === 'ANCHOR') return 1;
        return a.localeCompare(b);
      });
      groups = order.map(function (k) { return byBrand[k]; });
    } else if (mode === 'project') {
      var byPid = {};
      var unsourced = { label: 'Added directly to list', key: 'project:__none__', rows: [] };
      rows.forEach(function (r) {
        var pids = Array.isArray(r.projectIds) && r.projectIds.length > 0 ? r.projectIds : null;
        if (!pids) { unsourced.rows.push(r); return; }
        pids.forEach(function (pid) {
          if (!byPid[pid]) byPid[pid] = { label: (projectNamesById && projectNamesById[pid]) || pid, key: 'project:' + pid, rows: [] };
          byPid[pid].rows.push(r);
        });
      });
      var pidOrder = Object.keys(byPid).sort(function (a, b) {
        return byPid[a].label.localeCompare(byPid[b].label);
      });
      groups = pidOrder.map(function (k) { return byPid[k]; });
      if (unsourced.rows.length > 0) groups.push(unsourced);
    } else {
      groups = [{ label: '', key: 'flat', rows: rows.slice() }];
    }
    return groups;
  }

  // Pure helper: format a number as GBP. Tested under Node without window.Intl.
  function formatGBP(n) {
    var v = Number(n) || 0;
    try {
      return new Intl.NumberFormat('en-GB', { style: 'currency', currency: 'GBP', maximumFractionDigits: 2 }).format(v);
    } catch (_) {
      return '£' + v.toFixed(2);
    }
  }

  // Pure helper: build the plain-text shopping list (Copy / Print body).
  // listRows: [{ id, brand, name, tobuyQty, owned }], headline string.
  function buildPlainText(listRows, headline) {
    var lines = [headline || 'Cross-stitch shopping list', ''];
    if (!Array.isArray(listRows) || listRows.length === 0) {
      lines.push('(empty)');
      return lines.join('\n');
    }
    listRows.forEach(function (r) {
      var brand = (r.brand || 'dmc').toUpperCase();
      var qty = r.tobuyQty > 0 ? r.tobuyQty : 1;
      var own = r.owned > 0 ? ' (own ' + r.owned + ')' : '';
      lines.push('- ' + brand + ' ' + r.id + ' ' + (r.name || '') + ' — ' + qty + ' skein' + (qty === 1 ? '' : 's') + own);
    });
    var totalSkeins = listRows.reduce(function (s, r) { return s + (r.tobuyQty > 0 ? r.tobuyQty : 1); }, 0);
    lines.push('');
    lines.push('Total: ' + listRows.length + ' thread' + (listRows.length === 1 ? '' : 's') + ', ' + totalSkeins + ' skein' + (totalSkeins === 1 ? '' : 's') + '.');
    return lines.join('\n');
  }

  // Pure helper: build a CSV body. Header: Brand,Id,Name,Quantity,Owned.
  function buildCSV(listRows) {
    function esc(v) {
      var s = String(v == null ? '' : v);
      if (/[",\n]/.test(s)) return '"' + s.replace(/"/g, '""') + '"';
      return s;
    }
    var lines = ['Brand,Id,Name,Quantity,Owned'];
    (listRows || []).forEach(function (r) {
      var qty = r.tobuyQty > 0 ? r.tobuyQty : 1;
      lines.push([esc((r.brand || 'dmc').toUpperCase()), esc(r.id), esc(r.name || ''), esc(qty), esc(r.owned || 0)].join(','));
    });
    return lines.join('\n');
  }

  // ── React component ───────────────────────────────────────────────────────

  function ManagerShoppingComponent(props) {
    var React = window.React;
    if (!React) return null;
    var h = React.createElement;
    var useState = React.useState;
    var useEffect = React.useEffect;
    var useMemo = React.useMemo;
    var useCallback = React.useCallback;
    var Icons = window.Icons || {};

    // Sub-view: 'mylist' (default) or 'suggest' (deficits across active projects).
    var _subView = useState('mylist');
    var subView = _subView[0], setSubView = _subView[1];

    var _projects = useState([]);
    var projects = _projects[0], setProjects = _projects[1];
    var _stash = useState({});
    var stash = _stash[0], setStash = _stash[1];
    var _loading = useState(true);
    var loading = _loading[0], setLoading = _loading[1];
    var _busy = useState(false);
    var busy = _busy[0], setBusy = _busy[1];
    // My-list grouping: 'flat' | 'brand' | 'project'.
    var _groupBy = useState('flat');
    var groupBy = _groupBy[0], setGroupBy = _groupBy[1];
    // Confirmation dialog state for destructive bulk actions.
    var _confirm = useState(null);
    var confirmAction = _confirm[0], setConfirm = _confirm[1];

    var loadAll = useCallback(function () {
      var cancelled = { value: false };
      if (typeof ProjectStorage === 'undefined' || typeof StashBridge === 'undefined') {
        setLoading(false); return cancelled;
      }
      var states = (typeof ProjectStorage.getProjectStates === 'function')
        ? ProjectStorage.getProjectStates() : {};
      var activeProjectIdSet = new Set();
      ProjectStorage.listProjects().then(function (metas) {
        var actives = (metas || []).filter(function (m) {
          return isActiveStateForShopping(states[m.id]);
        });
        actives.forEach(function (m) { activeProjectIdSet.add(m.id); });
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
        if (cancelled.value) return null;
        var projectShapes = (full || []).filter(Boolean);
        // Also fold in manager-only library patterns (wishlist, manually added,
        // or entries whose linked project is no longer active for shopping).
        // Without this, adding a pattern via the Manager's Add Pattern modal
        // would never affect the shopping deficits.
        return StashBridge.getManagerPatterns().then(function (mgrPatterns) {
          (mgrPatterns || []).forEach(function (mp) {
            if (!mp || !Array.isArray(mp.threads) || mp.threads.length === 0) return;
            // Skip "completed" — they don't need any more shopping.
            if (mp.status === 'completed') return;
            // Skip when the linked project is already in the active set
            // (avoids double-counting via both sources).
            if (mp.linkedProjectId && activeProjectIdSet.has(mp.linkedProjectId)) return;
            var palShape = mp.threads.map(function (t) {
              var stitches = t.unit === 'stitches' ? (Number(t.qty) || 0) : 0;
              return {
                id: t.id,
                brand: (t.brand || 'DMC').toLowerCase(),
                count: stitches,
                name: t.name,
              };
            });
            projectShapes.push({
              id: 'mgr:' + (mp.id || mp.title || Math.random()),
              pal: palShape,
              fabricCt: mp.fabricCt || 14,
              name: mp.title || 'Manager pattern',
            });
          });
          return projectShapes;
        }).catch(function () { return projectShapes; });
      }).then(function (projectShapes) {
        if (cancelled.value || projectShapes == null) return;
        setProjects(projectShapes);
        return StashBridge.getGlobalStash();
      }).then(function (s) {
        if (cancelled.value) return;
        setStash(s || {});
        setLoading(false);
      }).catch(function (e) {
        console.error('ManagerShopping load failed:', e);
        if (!cancelled.value) setLoading(false);
      });
      return cancelled;
    }, []);

    useEffect(function () {
      var cancelled = loadAll();
      function onChange() { loadAll(); }
      window.addEventListener('cs:projectsChanged', onChange);
      window.addEventListener('cs:stashChanged', onChange);
      window.addEventListener('cs:patternsChanged', onChange);
      return function () {
        if (cancelled) cancelled.value = true;
        window.removeEventListener('cs:projectsChanged', onChange);
        window.removeEventListener('cs:stashChanged', onChange);
        window.removeEventListener('cs:patternsChanged', onChange);
      };
    }, [loadAll]);

    var deficits = useMemo(function () { return aggregateDeficits(projects, stash); }, [projects, stash]);
    var projectNamesById = useMemo(function () {
      var map = {};
      for (var i = 0; i < projects.length; i++) {
        var p = projects[i] || {};
        map[p.id] = p.name || p.id || 'Untitled project';
      }
      return map;
    }, [projects]);

    // My-list rows: every stash entry where tobuy=true. Built from the live
    // stash via the pure helper on StashBridge so it stays in sync with what
    // setToBuyQty / markManyToBuy wrote.
    var listRows = useMemo(function () {
      if (!(window.StashBridge && typeof StashBridge._buildShoppingListRows === 'function')) return [];
      // Decorate each row with the projectIds from the current deficits map so
      // the "from project" group + per-row source disclosure stay accurate.
      var deficitByKey = {};
      deficits.forEach(function (r) { deficitByKey[r.key] = r; });
      var rows = StashBridge._buildShoppingListRows(stash);
      rows.forEach(function (r) {
        var d = deficitByKey[r.key];
        r.projectIds = d ? d.projectIds : [];
        r.deficit = d ? d.deficit : 0;
      });
      return rows;
    }, [stash, deficits]);

    var groupedListRows = useMemo(function () {
      return groupRows(listRows, groupBy, projectNamesById);
    }, [listRows, groupBy, projectNamesById]);

    // Per-row source-list disclosure (used in both views).
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
      try {
        if (typeof ProjectStorage !== 'undefined' && typeof ProjectStorage.setActiveProject === 'function') {
          ProjectStorage.setActiveProject(pid);
        }
        window.location.href = 'stitch.html';
      } catch (_) {}
    }

    function toast(msg, type) {
      if (window.Toast && typeof Toast.show === 'function') {
        Toast.show({ message: msg, type: type || 'success', duration: 3000 });
      }
    }

    // ── Suggest view actions ───────────────────────────────────────────────
    function handleBulkAddDeficits() {
      if (!(window.StashBridge && typeof StashBridge.markManyToBuy === 'function')) return;
      if (deficits.length === 0) return;
      var keys = deficits.map(function (r) { return r.key; });
      var qtyMap = {};
      deficits.forEach(function (r) { qtyMap[r.key] = r.deficit; });
      setBusy(true);
      Promise.resolve(StashBridge.markManyToBuy(keys, true, qtyMap))
        .then(function (changed) {
          var n = (typeof changed === 'number' ? changed : keys.length);
          toast('Added ' + n + ' thread' + (n === 1 ? '' : 's') + ' to your shopping list.');
        })
        .catch(function (e) { console.error('ManagerShopping bulk add failed:', e); })
        .then(function () { setBusy(false); });
    }

    function handleAddOneDeficit(row) {
      if (!(window.StashBridge && typeof StashBridge.markManyToBuy === 'function')) return;
      var qtyMap = {};
      qtyMap[row.key] = row.deficit;
      Promise.resolve(StashBridge.markManyToBuy([row.key], true, qtyMap)).catch(function () {});
    }

    // ── My-list actions ────────────────────────────────────────────────────
    function bumpQty(row, delta) {
      if (!(window.StashBridge && typeof StashBridge.setToBuyQty === 'function')) return;
      var current = row.tobuyQty > 0 ? row.tobuyQty : 1;
      var next = Math.max(0, current + delta);
      Promise.resolve(StashBridge.setToBuyQty(row.key, next)).catch(function () {});
    }

    function removeRow(row) {
      if (!(window.StashBridge && typeof StashBridge.setToBuyQty === 'function')) return;
      Promise.resolve(StashBridge.setToBuyQty(row.key, 0))
        .then(function () { toast('Removed ' + (row.brand || 'dmc').toUpperCase() + ' ' + row.id + ' from your shopping list.', 'info'); })
        .catch(function () {});
    }

    function bought(row) {
      if (!(window.StashBridge && typeof StashBridge.markBought === 'function')) return;
      var qty = row.tobuyQty > 0 ? row.tobuyQty : 1;
      Promise.resolve(StashBridge.markBought(row.key, qty))
        .then(function (res) {
          if (!res) return;
          toast('Added ' + res.addedSkeins + ' skein' + (res.addedSkeins === 1 ? '' : 's') + ' of ' + (row.brand || 'dmc').toUpperCase() + ' ' + row.id + ' to your stash.');
        })
        .catch(function () {});
    }

    function markAllBought() {
      if (!window.StashBridge) return;
      if (listRows.length === 0) return;
      setBusy(true);
      // Prefer the bulk path (single tx, single dispatch) when available, fall
      // back to per-row markBought for older bridge builds.
      var qtyMap = {};
      listRows.forEach(function (r) { qtyMap[r.key] = r.tobuyQty > 0 ? r.tobuyQty : 1; });
      var p;
      if (typeof StashBridge.markBoughtMany === 'function') {
        p = Promise.resolve(StashBridge.markBoughtMany(qtyMap)).then(function (results) {
          return (results || []).length;
        });
      } else if (typeof StashBridge.markBought === 'function') {
        var rowsCopy = listRows.slice();
        p = Promise.all(rowsCopy.map(function (r) {
          return StashBridge.markBought(r.key, qtyMap[r.key]).catch(function () { return null; });
        })).then(function (results) { return results.filter(Boolean).length; });
      } else {
        setBusy(false);
        return;
      }
      p.then(function (n) {
        toast('Added ' + n + ' thread' + (n === 1 ? '' : 's') + ' to your stash.');
      }).catch(function () {}).then(function () { setBusy(false); });
    }

    function clearList() {
      if (!(window.StashBridge && typeof StashBridge.clearShoppingList === 'function')) return;
      setBusy(true);
      Promise.resolve(StashBridge.clearShoppingList())
        .then(function (n) { toast('Cleared ' + (n || 0) + ' row' + (n === 1 ? '' : 's') + ' from your shopping list.', 'info'); })
        .then(function () { setBusy(false); });
    }

    // ── Export actions ─────────────────────────────────────────────────────
    function copyText() {
      var text = buildPlainText(listRows, 'Cross-stitch shopping list');
      function done() { toast('Shopping list copied to clipboard.'); }
      if (typeof navigator !== 'undefined' && navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(text).then(done).catch(function () {});
        return;
      }
      try {
        var ta = document.createElement('textarea');
        ta.value = text; ta.style.position = 'fixed'; ta.style.opacity = '0';
        document.body.appendChild(ta); ta.select(); document.execCommand('copy');
        document.body.removeChild(ta); done();
      } catch (_) {}
    }

    function downloadCSV() {
      var csv = buildCSV(listRows);
      try {
        var blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
        var url = URL.createObjectURL(blob);
        var a = document.createElement('a');
        a.href = url; a.download = 'cross-stitch-shopping-list.csv';
        document.body.appendChild(a); a.click();
        document.body.removeChild(a);
        setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
      } catch (e) { console.error('CSV download failed:', e); }
    }

    function printList() {
      try {
        var w = window.open('', '_blank', 'noopener,noreferrer,width=600,height=800');
        if (!w) { toast('Pop-up blocked. Allow pop-ups to print the list.', 'error'); return; }
        var totalSkeins = listRows.reduce(function (s, r) { return s + (r.tobuyQty > 0 ? r.tobuyQty : 1); }, 0);
        var rowsHtml = listRows.map(function (r) {
          var brand = (r.brand || 'dmc').toUpperCase();
          var qty = r.tobuyQty > 0 ? r.tobuyQty : 1;
          var own = r.owned > 0 ? ' (own ' + r.owned + ')' : '';
          var rgb = Array.isArray(r.rgb) ? r.rgb.join(',') : '128,128,128';
          var safeName = String(r.name || '').replace(/[<>&]/g, function (c) { return ({ '<': '&lt;', '>': '&gt;', '&': '&amp;' })[c]; });
          return '<tr><td><span style="display:inline-block;width:14px;height:14px;background:rgb(' + rgb + ');border:1px solid #888;vertical-align:middle"></span></td>' +
            '<td>' + brand + '</td><td>' + r.id + '</td><td>' + safeName + '</td><td style="text-align:right">' + qty + '</td><td>' + own + '</td></tr>';
        }).join('');
        w.document.write('<!doctype html><html><head><meta charset="utf-8"><title>Shopping list</title>' +
          '<style>body{font:13px/1.4 system-ui,sans-serif;padding:24px;color:#222}h1{font-size:18px;margin:0 0 4px}p{margin:0 0 16px;color:#555}table{width:100%;border-collapse:collapse}td,th{padding:6px 8px;border-bottom:1px solid #ddd;text-align:left}th{font-size:11px;text-transform:uppercase;color:#777}tfoot td{border:none;padding-top:12px;font-weight:600}</style>' +
          '</head><body><h1>Cross-stitch shopping list</h1>' +
          '<p>' + listRows.length + ' thread' + (listRows.length === 1 ? '' : 's') + ', ' + totalSkeins + ' skein' + (totalSkeins === 1 ? '' : 's') + '. Generated ' + new Date().toLocaleDateString('en-GB') + '.</p>' +
          '<table><thead><tr><th></th><th>Brand</th><th>Id</th><th>Name</th><th style="text-align:right">Qty</th><th>Notes</th></tr></thead>' +
          '<tbody>' + rowsHtml + '</tbody></table>' +
          '<script>window.onload=function(){window.print();}</' + 'script></body></html>');
        w.document.close();
      } catch (e) { console.error('Print failed:', e); }
    }

    // ── Render helpers ─────────────────────────────────────────────────────
    function renderSubTabs() {
      var tabs = [
        { id: 'mylist', label: 'My list', count: listRows.length },
        { id: 'suggest', label: 'Suggest from projects', count: deficits.length },
      ];
      return h('div', { className: 'mgr-shopping-subtabs', role: 'tablist' },
        tabs.map(function (t) {
          var active = subView === t.id;
          return h('button', {
            key: t.id, type: 'button', role: 'tab',
            'aria-selected': active ? 'true' : 'false',
            className: 'mgr-shopping-subtab' + (active ? ' on' : ''),
            onClick: function () { setSubView(t.id); },
          }, t.label, t.count > 0 ? h('span', { className: 'mgr-shopping-subtab-count' }, t.count) : null);
        })
      );
    }

    function rowLineEl(r, isOpen, projectCount) {
      // Shared "swatch · brand id · name · sources" block used by both views.
      return h('div', { className: 'mgr-shopping-rowtext' },
        h('div', { className: 'mgr-shopping-rowtitle' },
          h('strong', null, r.id), ' · ', h('span', { className: 'mgr-shopping-rowname' }, r.name),
          h('span', { className: 'mgr-shopping-brandchip' }, (r.brand || 'dmc').toUpperCase())
        ),
        projectCount > 0 ? h('div', { className: 'mgr-shopping-sources' },
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
        ) : null
      );
    }

    function renderMyList() {
      if (listRows.length === 0) {
        return h('div', { className: 'mgr-shopping-empty', style: { padding: '32px 16px', textAlign: 'center', color: 'var(--text-secondary)' } },
          Icons.shoppingCart ? h('div', { className: 'mgr-shopping-empty-icon', 'aria-hidden': 'true' }, Icons.shoppingCart()) : null,
          h('div', { style: { fontSize: 14, fontWeight: 500, marginBottom: 4 } }, 'Your shopping list is empty.'),
          h('div', { style: { fontSize: 12, color: 'var(--text-tertiary)' } }, 'Use “Suggest from projects” above, or set the To Buy flag on a thread in your stash.'),
          deficits.length > 0
            ? h('button', {
                type: 'button',
                className: 'mgr-shopping-empty-cta',
                onClick: function () { setSubView('suggest'); },
              }, 'See ' + deficits.length + ' suggested thread' + (deficits.length === 1 ? '' : 's'))
            : null
        );
      }

      var totalSkeins = listRows.reduce(function (s, r) { return s + (r.tobuyQty > 0 ? r.tobuyQty : 1); }, 0);
      var price = (typeof DEFAULT_SKEIN_PRICE !== 'undefined' ? DEFAULT_SKEIN_PRICE : 0.95);
      var totalCost = totalSkeins * price;

      return h('div', { className: 'mgr-shopping-mylist' },
        h('div', { className: 'mgr-shopping-header' },
          h('div', null,
            h('div', { className: 'mgr-shopping-headline' },
              listRows.length + ' thread' + (listRows.length === 1 ? '' : 's') + ' · ' + totalSkeins + ' skein' + (totalSkeins === 1 ? '' : 's')
            ),
            h('div', { className: 'mgr-shopping-subline' }, 'Estimated total ' + formatGBP(totalCost) + ' at ' + formatGBP(price) + ' / skein')
          ),
          h('div', { className: 'mgr-shopping-actions' },
            h('button', { type: 'button', className: 'mgr-shopping-act', onClick: copyText, 'aria-label': 'Copy shopping list to clipboard' },
              Icons.copy ? Icons.copy() : null, h('span', null, 'Copy')),
            h('button', { type: 'button', className: 'mgr-shopping-act', onClick: printList, 'aria-label': 'Print shopping list' },
              Icons.printer ? Icons.printer() : null, h('span', null, 'Print')),
            h('button', { type: 'button', className: 'mgr-shopping-act', onClick: downloadCSV, 'aria-label': 'Download shopping list as CSV' },
              h('span', null, 'CSV')),
            h('button', {
              type: 'button', className: 'mgr-shopping-act mgr-shopping-act-primary',
              disabled: busy, onClick: function () { setConfirm({ kind: 'bought' }); },
              'aria-label': 'Mark every row as bought',
            }, Icons.check ? Icons.check() : null, h('span', null, 'Mark all bought')),
            h('button', {
              type: 'button', className: 'mgr-shopping-act mgr-shopping-act-danger',
              disabled: busy, onClick: function () { setConfirm({ kind: 'clear' }); },
              'aria-label': 'Clear shopping list',
            }, Icons.trash ? Icons.trash() : null, h('span', null, 'Clear list'))
          )
        ),
        h('div', { className: 'mgr-shopping-grouptoggle', role: 'radiogroup', 'aria-label': 'Group by' },
          h('span', { className: 'mgr-shopping-groupleader' }, 'Group:'),
          ['flat', 'brand', 'project'].map(function (m) {
            return h('button', {
              key: m, type: 'button', role: 'radio',
              'aria-checked': groupBy === m ? 'true' : 'false',
              className: 'mgr-shopping-groupbtn' + (groupBy === m ? ' on' : ''),
              onClick: function () { setGroupBy(m); },
            }, m === 'flat' ? 'Flat' : m === 'brand' ? 'Brand' : 'Project');
          })
        ),
        h('div', { className: 'mgr-shopping-list', role: 'list' },
          groupedListRows.map(function (g) {
            return h(React.Fragment, { key: g.key },
              g.label ? h('div', { className: 'mgr-shopping-grouphead' }, g.label, h('span', { className: 'mgr-shopping-groupcount' }, g.rows.length)) : null,
              g.rows.map(function (r) {
                var isOpen = !!expandedRows[r.key];
                var projectCount = (r.projectIds || []).length;
                var qty = r.tobuyQty > 0 ? r.tobuyQty : 1;
                return h('div', { key: g.key + '|' + r.key, role: 'listitem', className: 'mgr-shopping-row mgr-shopping-row-mylist' },
                  h('span', { className: 'mgr-shopping-swatch', 'aria-hidden': 'true', style: { background: 'rgb(' + r.rgb.join(',') + ')' } }),
                  rowLineEl(r, isOpen, projectCount),
                  h('div', { className: 'mgr-shopping-qty', role: 'group', 'aria-label': 'Quantity for ' + r.id },
                    h('button', { type: 'button', onClick: function () { bumpQty(r, -1); }, 'aria-label': 'Decrease quantity' }, '−'),
                    h('span', { className: 'mgr-shopping-qty-num' }, qty),
                    h('button', { type: 'button', onClick: function () { bumpQty(r, +1); }, 'aria-label': 'Increase quantity' }, '+')
                  ),
                  h('div', { className: 'mgr-shopping-rowactions' },
                    h('button', {
                      type: 'button', className: 'mgr-shopping-rowbtn mgr-shopping-rowbtn-primary',
                      onClick: function () { bought(r); }, 'aria-label': 'Mark ' + r.id + ' as bought',
                    }, Icons.check ? Icons.check() : null, h('span', null, 'Bought')),
                    h('button', {
                      type: 'button', className: 'mgr-shopping-rowbtn',
                      onClick: function () { removeRow(r); }, 'aria-label': 'Remove ' + r.id + ' from list',
                    }, Icons.x ? Icons.x() : null, h('span', null, 'Remove'))
                  )
                );
              })
            );
          })
        ),
        confirmAction ? h('div', { className: 'mgr-shopping-confirm-backdrop', onClick: function () { setConfirm(null); } },
          h('div', { className: 'mgr-shopping-confirm', role: 'alertdialog', 'aria-modal': 'true', onClick: function (e) { e.stopPropagation(); } },
            h('h3', null, confirmAction.kind === 'clear' ? 'Clear shopping list?' : 'Mark every row as bought?'),
            h('p', null,
              confirmAction.kind === 'clear'
                ? ('This will remove all ' + listRows.length + ' row' + (listRows.length === 1 ? '' : 's') + ' from your shopping list. Your stash counts are not affected.')
                : ('This adds ' + totalSkeins + ' skein' + (totalSkeins === 1 ? '' : 's') + ' to your stash and clears the list.')
            ),
            h('div', { className: 'mgr-shopping-confirm-actions' },
              h('button', { type: 'button', onClick: function () { setConfirm(null); } }, 'Cancel'),
              h('button', {
                type: 'button',
                className: confirmAction.kind === 'clear' ? 'mgr-shopping-confirm-danger' : 'mgr-shopping-confirm-primary',
                onClick: function () {
                  var kind = confirmAction.kind; setConfirm(null);
                  if (kind === 'clear') clearList(); else markAllBought();
                },
              }, confirmAction.kind === 'clear' ? 'Clear list' : 'Mark all bought')
            )
          )
        ) : null
      );
    }

    function renderSuggest() {
      if (projects.length === 0) {
        return h('div', { className: 'mgr-shopping-empty', style: { padding: '32px 16px', textAlign: 'center', color: 'var(--text-secondary)' } },
          h('div', { style: { fontSize: 14, fontWeight: 500, marginBottom: 4 } }, 'No active projects yet.'),
          h('div', { style: { fontSize: 12, color: 'var(--text-tertiary)' } }, 'Active and queued projects contribute to suggestions. Paused, complete, design, and wishlist projects do not.')
        );
      }
      if (deficits.length === 0) {
        return h('div', { className: 'mgr-shopping-covered', style: { padding: '32px 16px', textAlign: 'center', color: 'var(--text-secondary)' } },
          h('div', { style: { fontSize: 14, fontWeight: 500, marginBottom: 4 } }, 'All your active projects have the threads they need.'),
          h('div', { style: { fontSize: 12, color: 'var(--text-tertiary)' } }, 'Nothing to add to the shopping list right now.')
        );
      }
      var totalDeficitSkeins = deficits.reduce(function (s, r) { return s + r.deficit; }, 0);
      // Track which suggested rows are already on the My-list so the Add button shows "Added".
      var onListByKey = {};
      listRows.forEach(function (r) { onListByKey[r.key] = true; });

      return h('div', { className: 'mgr-shopping-suggest' },
        h('div', { className: 'mgr-shopping-header' },
          h('div', null,
            h('div', { className: 'mgr-shopping-caption' }, 'Shopping across all active projects'),
            h('div', { className: 'mgr-shopping-headline' }, deficits.length + ' thread' + (deficits.length === 1 ? '' : 's') + ' below stock'),
            h('div', { className: 'mgr-shopping-subline' }, totalDeficitSkeins + ' skein' + (totalDeficitSkeins === 1 ? '' : 's') + ' across ' + projects.length + ' project' + (projects.length === 1 ? '' : 's'))
          ),
          h('button', {
            type: 'button',
            disabled: busy,
            onClick: handleBulkAddDeficits,
            className: 'mgr-shopping-bulk',
          }, busy ? 'Adding…' : 'Add all deficits to my list')
        ),
        h('div', { className: 'mgr-shopping-list', role: 'list' },
          deficits.map(function (r) {
            var isOpen = !!expandedRows[r.key];
            var projectCount = r.projectIds.length;
            var alreadyOn = !!onListByKey[r.key];
            return h('div', { key: r.key, role: 'listitem', className: 'mgr-shopping-row mgr-shopping-row-suggest' },
              h('span', { className: 'mgr-shopping-swatch', 'aria-hidden': 'true', style: { background: 'rgb(' + r.rgb.join(',') + ')' } }),
              rowLineEl(r, isOpen, projectCount),
              h('span', { className: 'mgr-shopping-need' }, 'need ' + r.totalNeeded + ', own ' + r.owned),
              h('span', { className: 'mgr-shopping-deficit' }, '+' + r.deficit + ' skein' + (r.deficit === 1 ? '' : 's')),
              h('button', {
                type: 'button',
                onClick: function () { handleAddOneDeficit(r); },
                disabled: alreadyOn,
                className: 'mgr-shopping-rowbtn' + (alreadyOn ? ' mgr-shopping-rowbtn-on' : ''),
                'aria-label': alreadyOn ? r.id + ' is on your list' : 'Add ' + r.id + ' to shopping list',
              }, alreadyOn ? (Icons.check ? Icons.check() : null) : null, h('span', null, alreadyOn ? 'On list' : 'Add'))
            );
          })
        )
      );
    }

    if (loading) {
      return h('div', { className: 'mgr-shopping-loading', style: { padding: '24px 16px', fontSize: 13, color: 'var(--text-tertiary)' } }, 'Loading shopping list…');
    }

    return h('div', { className: 'mgr-shopping' },
      renderSubTabs(),
      subView === 'mylist' ? renderMyList() : renderSuggest()
    );
  }

  // Public surface
  window.ManagerShopping = ManagerShoppingComponent;
  window.ManagerShopping._aggregateDeficits = aggregateDeficits;
  window.ManagerShopping._isActiveStateForShopping = isActiveStateForShopping;
  window.ManagerShopping._compositeKey = compositeKey;
  window.ManagerShopping._groupRows = groupRows;
  window.ManagerShopping._formatGBP = formatGBP;
  window.ManagerShopping._buildPlainText = buildPlainText;
  window.ManagerShopping._buildCSV = buildCSV;
  window.ManagerShopping.EMPTY_NO_PROJECTS = 'No active projects yet.';
  window.ManagerShopping.EMPTY_ALL_COVERED = 'All your active projects have the threads they need.';
  window.ManagerShopping.SCOPE_CAPTION = 'Shopping across all active projects';
})();
