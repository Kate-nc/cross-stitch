/* creator/MaterialsHub.js — B4 Materials & Output hub.
   Replaces the three former top-level tabs (Materials/Prepare/Export)
   with a single page exposing three side-tabs:
     Threads  : CreatorLegendTab
     Stash    : CreatorPrepareTab
     Output   : CreatorExportTab
   Reads from CreatorContext via window.useApp / window.usePatternData.
   Active sub-tab persists via UserPrefs key 'creator.materialsTab'
   (managed by useCreatorState's setMaterialsTab wrapper). */

window.CreatorMaterialsHub = function CreatorMaterialsHub() {
  var app = window.useApp();
  var ctx = window.usePatternData();
  var h   = React.createElement;
  var useRef = React.useRef;

  // ── Hooks BEFORE any conditional returns ────────────────────────────────
  var tablistRef = useRef(null);

  // Top-level guard: only render on the Materials & Output page.
  if (app.tab !== 'materials') return null;
  if (!(ctx && ctx.pat && ctx.pal)) return null;

  var SUBTABS = [
    { id: 'threads',  label: 'Threads',  icon: window.Icons && Icons.thread     ? Icons.thread()     : null },
    { id: 'stash',    label: 'Stash status', icon: window.Icons && Icons.layers ? Icons.layers()     : null },
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
      // here.
      h(window.CreatorLegendTab, null),
      h(window.CreatorPrepareTab, null),
      h(window.CreatorExportTab, null)
    )
  );
};
