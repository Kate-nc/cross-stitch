/* creator/MaterialsHub.js — B4 Materials & Output hub.
   Replaces the three former top-level tabs (Materials/Prepare/Export)
   with a single page exposing four side-tabs:
     Threads  : CreatorLegendTab
     Stash    : CreatorPrepareTab
     Shopping : in-line aggregate (deficit list + Add-all-to-shopping CTA)
     Output   : CreatorExportTab
   Reads from CreatorContext via window.useApp / window.usePatternData.
   Active sub-tab persists via UserPrefs key 'creator.materialsTab'
   (managed by useCreatorState's setMaterialsTab wrapper). */

window.CreatorMaterialsHub = function CreatorMaterialsHub() {
  var app = window.useApp();
  var ctx = window.usePatternData();
  var h   = React.createElement;
  var useMemo = React.useMemo;
  var useState = React.useState;
  var useRef = React.useRef;

  // ── Hooks BEFORE any conditional returns ────────────────────────────────
  var _bulkBusy = useState(false);
  var bulkBusy = _bulkBusy[0], setBulkBusy = _bulkBusy[1];
  var tablistRef = useRef(null);

  // Aggregate deficits: which threads in this project are not fully owned.
  var deficits = useMemo(function () {
    if (!(ctx && ctx.pat && ctx.pal)) return [];
    var stash = (ctx.globalStash) || {};
    var fab = ctx.fabricCt || 14;
    var rows = [];
    for (var i = 0; i < ctx.pal.length; i++) {
      var p = ctx.pal[i];
      if (!p || p.id === '__skip__' || p.id === '__empty__') continue;
      var needed;
      if (typeof stitchesToSkeins === 'function') {
        var sk = stitchesToSkeins({ stitchCount: p.count, fabricCount: fab, strandsUsed: 2 });
        needed = sk
          ? (sk.colorA ? Math.max(sk.colorA.skeinsToBuy || 0, sk.colorB.skeinsToBuy || 0) : (sk.skeinsToBuy || 0))
          : (typeof skeinEst === 'function' ? skeinEst(p.count, fab) : Math.ceil(p.count / 800));
      } else {
        needed = (typeof skeinEst === 'function') ? skeinEst(p.count, fab) : Math.ceil(p.count / 800);
      }
      if (needed < 1) needed = 1;
      // Composite stash key: prefer DMC, but blends list both halves.
      var ids = (p.type === 'blend' && typeof p.id === 'string' && p.id.indexOf('+') !== -1)
        ? p.id.split('+') : [p.id];
      for (var j = 0; j < ids.length; j++) {
        var id = ids[j];
        var key = (typeof id === 'string' && id.indexOf(':') !== -1) ? id : ('dmc:' + id);
        var entry = stash[key] || stash[id] || {};
        var owned = entry.owned || 0;
        if (owned >= needed) continue;
        rows.push({
          key: key, id: id,
          name: (p.threads && p.threads[j] && p.threads[j].name) || p.name || String(id),
          rgb: (p.threads && p.threads[j] && p.threads[j].rgb) || p.rgb || [200,200,200],
          needed: needed, owned: owned, deficit: needed - owned,
        });
      }
    }
    rows.sort(function (a, b) { return b.deficit - a.deficit; });
    return rows;
  }, [ctx && ctx.pal, ctx && ctx.pat, ctx && ctx.globalStash, ctx && ctx.fabricCt]);

  // Top-level guard: only render on the Materials & Output page.
  if (app.tab !== 'materials') return null;
  if (!(ctx && ctx.pat && ctx.pal)) return null;

  var SUBTABS = [
    { id: 'threads',  label: 'Threads',  icon: window.Icons && Icons.thread     ? Icons.thread()     : null },
    { id: 'stash',    label: 'Stash status', icon: window.Icons && Icons.layers ? Icons.layers()     : null },
    { id: 'shopping', label: 'Shopping', icon: window.Icons && Icons.shoppingCart ? Icons.shoppingCart() : (window.Icons && Icons.cart ? Icons.cart() : null) },
    { id: 'output',   label: 'Output',   icon: window.Icons && Icons.download   ? Icons.download()   : null },
  ];
  var activeSub = app.materialsTab || 'threads';
  var activeIdx = 0;
  for (var si = 0; si < SUBTABS.length; si++) {
    if (SUBTABS[si].id === activeSub) { activeIdx = si; break; }
  }
  var activeLabel = SUBTABS[activeIdx] ? SUBTABS[activeIdx].label : 'Threads';

  function focusTabByIndex(idx) {
    if (!tablistRef.current) return;
    var btns = tablistRef.current.querySelectorAll('button[role="tab"]');
    if (btns && btns[idx]) { btns[idx].focus(); }
  }

  function onTablistKeyDown(e) {
    var key = e.key;
    if (key !== 'ArrowRight' && key !== 'ArrowLeft' && key !== 'Home' && key !== 'End') return;
    e.preventDefault();
    var n = SUBTABS.length;
    var nextIdx = activeIdx;
    if (key === 'ArrowRight') nextIdx = (activeIdx + 1) % n;
    else if (key === 'ArrowLeft') nextIdx = (activeIdx - 1 + n) % n;
    else if (key === 'Home') nextIdx = 0;
    else if (key === 'End') nextIdx = n - 1;
    app.setMaterialsTab(SUBTABS[nextIdx].id);
    setTimeout(function () { focusTabByIndex(nextIdx); }, 0);
  }

  function tabBtn(t, idx) {
    var on = activeSub === t.id;
    return h('button', {
      key: t.id,
      type: 'button',
      role: 'tab',
      'aria-selected': on,
      tabIndex: on ? 0 : -1,
      className: 'mh-subtab' + (on ? ' on' : ''),
      onClick: function () { app.setMaterialsTab(t.id); },
    },
      t.icon && h('span', { className: 'mh-subtab-icon', 'aria-hidden': 'true' }, t.icon),
      h('span', null, t.label)
    );
  }

  // Shared empty-state renderer for sub-tab panels (centred icon, headline,
  // optional helper paragraph, optional primary action). Uses SVG icons from
  // icons.js — never emoji.
  function emptyState(opts) {
    return h('div', { className: 'mh-empty', role: 'status' },
      opts.icon && h('div', { className: 'mh-empty-icon', 'aria-hidden': 'true' }, opts.icon),
      h('h4', { className: 'mh-empty-headline' }, opts.headline),
      opts.body && h('p', { className: 'mh-empty-body' }, opts.body),
      opts.action && h('button', {
        type: 'button', className: 'mh-empty-action',
        onClick: opts.action.onClick,
      }, opts.action.label)
    );
  }

  // Shopping sub-tab content — only mounted when active to avoid extra work.
  function shoppingPanel() {
    if (deficits.length === 0) {
      return emptyState({
        icon: window.Icons && Icons.shoppingCart ? Icons.shoppingCart() : (window.Icons && Icons.cart ? Icons.cart() : null),
        headline: 'Your stash already covers every thread.',
        body: 'When you\u2019re short of a colour, the deficit will appear here.'
      });
    }
    var totalDeficitSkeins = deficits.reduce(function (s, r) { return s + r.deficit; }, 0);
    return h('div', { className: 'mh-shopping' },
      h('div', { className: 'mh-shopping-caption', style: { fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.4, color: 'var(--text-tertiary)', marginBottom: 6 } }, 'Shopping for this pattern'),
      h('div', { className: 'mh-shopping-header', style: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 12 } },
        h('div', null,
          h('div', { style: { fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' } },
            deficits.length + ' thread' + (deficits.length === 1 ? '' : 's') + ' to buy'
          ),
          h('div', { style: { fontSize: 11, color: 'var(--text-tertiary)' } },
            totalDeficitSkeins + ' skein' + (totalDeficitSkeins === 1 ? '' : 's') + ' across this project'
          )
        ),
        h('button', {
          type: 'button',
          disabled: bulkBusy,
          className: 'mh-shopping-bulk',
          onClick: function () {
            if (!(window.StashBridge && typeof StashBridge.markManyToBuy === 'function')) return;
            setBulkBusy(true);
            var keys = deficits.map(function (r) { return r.key; });
            Promise.resolve(StashBridge.markManyToBuy(keys, true))
              .then(function () {
                if (window.Toast && typeof Toast.show === 'function') {
                  Toast.show({ message: 'Added ' + keys.length + ' thread' + (keys.length === 1 ? '' : 's') + ' to your shopping list.', type: 'success', duration: 3000 });
                }
              })
              .catch(function (e) { console.error('MaterialsHub bulk shopping failed:', e); })
              .then(function () { setBulkBusy(false); });
          },
          style: { padding: '8px 14px', fontSize: 12, fontWeight: 600, borderRadius: 8, border: 'none', background: 'var(--accent)', color: '#fff', cursor: bulkBusy ? 'wait' : 'pointer' },
        }, bulkBusy ? 'Adding…' : 'Add all to shopping list')
      ),
      h('div', { className: 'mh-shopping-list', role: 'list' },
        deficits.map(function (r) {
          return h('div', { key: r.key, role: 'listitem', className: 'mh-shopping-row',
            style: { display: 'grid', gridTemplateColumns: '24px 1fr auto auto', gap: 10, alignItems: 'center', padding: '8px 12px', borderBottom: '1px solid var(--border)' } },
            h('span', { className: 'mh-swatch', 'aria-hidden': 'true',
              style: { display: 'inline-block', width: 20, height: 20, borderRadius: 4, background: 'rgb(' + r.rgb.join(',') + ')', border: '1px solid var(--border)' } }),
            h('span', { className: 'mh-shopping-name', style: { fontSize: 12, color: 'var(--text-primary)' } },
              h('strong', null, r.id), ' \u00B7 ', r.name),
            h('span', { className: 'mh-shopping-need', style: { fontSize: 11, color: 'var(--text-tertiary)' } },
              'need ' + r.needed + ', own ' + r.owned),
            h('span', { className: 'mh-shopping-deficit', style: { fontSize: 12, fontWeight: 600, color: 'var(--accent)' } },
              '+' + r.deficit + ' skein' + (r.deficit === 1 ? '' : 's'))
          );
        })
      )
    );
  }

  return h('div', { className: 'materials-hub', role: 'tabpanel', 'aria-label': 'Materials and Output' },
    h('div', { className: 'mh-subtabs-wrap' },
      h('div', { className: 'mh-breadcrumb', 'aria-hidden': 'true' },
        h('span', { className: 'mh-breadcrumb-root' }, 'Materials & Output'),
        h('span', { className: 'mh-breadcrumb-sep' },
          window.Icons && window.Icons.chevronRight ? window.Icons.chevronRight() : null
        ),
        h('span', { className: 'mh-breadcrumb-current' }, activeLabel)
      ),
      h('span', { className: 'mh-subtabs-label', 'aria-hidden': 'true' },
        window.Icons && window.Icons.layers ? h('span', { className: 'mh-subtabs-label-icon' }, window.Icons.layers()) : null,
        h('span', null, 'View:')
      ),
      h('nav', {
        className: 'mh-subtabs',
        role: 'tablist',
        'aria-label': 'Materials sections',
        ref: tablistRef,
        onKeyDown: onTablistKeyDown,
      },
        SUBTABS.map(tabBtn)
      )
    ),
    h('div', { className: 'mh-body' },
      // Threads / Stash / Output children manage their own visibility via the
      // app.materialsTab guard added in B3, so they are mounted unconditionally
      // here. Shopping is local to this hub.
      h(window.CreatorLegendTab, null),
      h(window.CreatorPrepareTab, null),
      activeSub === 'shopping' && shoppingPanel(),
      h(window.CreatorExportTab, null)
    )
  );
};
