/* creator/ShoppingListModal.js — Brief D (3c)
   Modal listing threads-you-have vs threads-you-need-to-buy for the current Creator pattern.
   Mirrors the manager ShoppingListModal copy/share format for consistency.
   Reads from CreatorContext (PatternData + App contexts) and StashBridge (for userProfile fallback).
   Loaded as a plain <script> (concatenated into creator/bundle.js). */

(function () {
  if (typeof window === 'undefined' || !window.React) return;

  function CreatorShoppingListModal(props) {
    var React = window.React;
    var h = React.createElement;
    var ctx = window.usePatternData();
    var useState = React.useState;
    var useMemo = React.useMemo;
    var useEffect = React.useEffect;
    var onClose = props.onClose;

    if (typeof window.useEscape === 'function') window.useEscape(onClose);

    var _profile = useState(null);
    var profile = _profile[0], setProfile = _profile[1];
    var _copied = useState(false);
    var copied = _copied[0], setCopied = _copied[1];

    // Read user profile (for strands/waste) from manager DB. Defaults if unavailable.
    useEffect(function () {
      var cancelled = false;
      function fallback() { if (!cancelled) setProfile({ fabric_count: ctx.fabricCt || 14, strands_used: 2, waste_factor: 0.20, thread_brand: 'DMC' }); }
      try {
        var req = indexedDB.open('stitch_manager_db');
        req.onsuccess = function () {
          var db = req.result;
          if (!db.objectStoreNames.contains('manager_state')) { fallback(); return; }
          var tx = db.transaction('manager_state', 'readonly');
          var store = tx.objectStore('manager_state');
          var g = store.get('userProfile');
          g.onsuccess = function () {
            if (cancelled) return;
            setProfile(g.result || { fabric_count: ctx.fabricCt || 14, strands_used: 2, waste_factor: 0.20, thread_brand: 'DMC' });
          };
          g.onerror = fallback;
        };
        req.onerror = fallback;
      } catch (_) { fallback(); }
      return function () { cancelled = true; };
    }, [ctx.fabricCt]);

    var stash = ctx.globalStash || {};
    var fabricCt = (profile && profile.fabric_count) || ctx.fabricCt || 14;
    var strandsUsed = (profile && profile.strands_used) || 2;
    var wasteFactor = (profile && profile.waste_factor) || 0.20;

    // Build per-component shopping rows. Blends contribute half-stitches to each
    // component, summed across all palette entries that include that component.
    var rows = useMemo(function () {
      if (!(ctx.pat && ctx.pal)) return [];
      var perId = {};   // id -> { stitches, isBlendOnly }
      ctx.pal.forEach(function (p) {
        if (!p || p.id === '__skip__' || p.id === '__empty__') return;
        var stitches = p.count || 0;
        var ids = (p.type === 'blend' && typeof p.id === 'string' && p.id.indexOf('+') !== -1)
          ? splitBlendId(p.id)
          : [p.id];
        ids.forEach(function (id) {
          if (!perId[id]) perId[id] = { stitches: 0, fromBlend: ids.length > 1 };
          // Blends use roughly half the thread of each component.
          perId[id].stitches += ids.length > 1 ? stitches / 2 : stitches;
        });
      });
      return Object.keys(perId).map(function (id) {
        var stitches = Math.round(perId[id].stitches);
        var needed = 1;
        if (typeof stitchesToSkeins === 'function') {
          var r = stitchesToSkeins({
            stitchCount: stitches, fabricCount: fabricCt,
            strandsUsed: strandsUsed, wasteFactor: wasteFactor
          });
          needed = Math.max(1, r.skeinsToBuy || 0);
        }
        // Brand resolution: try DMC first, then Anchor. The matching brand's
        // composite stash key is used to look up owned counts.
        var info = null, brand = 'dmc';
        info = findThreadInCatalog('dmc', id);
        if (!info && typeof ANCHOR !== 'undefined') {
          info = ANCHOR.find(function (d) { return d.id === id; });
          if (info) brand = 'anchor';
        }
        var entry = stash[brand + ':' + id] || {};
        var owned = entry.owned || 0;
        var status = owned >= needed ? 'owned' : owned > 0 ? 'partial' : 'needed';
        return {
          id: id,
          brand: brand,
          brandLabel: brand === 'anchor' ? 'Anchor' : 'DMC',
          name: info ? info.name : id,
          rgb: info ? info.rgb : [128, 128, 128],
          stitches: stitches,
          needed: needed,
          owned: owned,
          status: status,
          missing: Math.max(0, needed - owned)
        };
      }).sort(function (a, b) {
        var an = /^\d+$/.test(a.id) ? Number(a.id) : Infinity;
        var bn = /^\d+$/.test(b.id) ? Number(b.id) : Infinity;
        if (an !== bn) return an - bn;
        return String(a.id).localeCompare(String(b.id));
      });
    }, [ctx.pat, ctx.pal, stash, fabricCt, strandsUsed, wasteFactor]);

    var ownedRows = rows.filter(function (r) { return r.status === 'owned'; });
    var buyRows = rows.filter(function (r) { return r.status !== 'owned'; });
    var totalNeedSkeins = buyRows.reduce(function (acc, r) { return acc + r.missing; }, 0);

    function copyText() {
      var name = (ctx.projectName || 'Cross stitch pattern');
      var lines = ['Shopping List \u2014 ' + name, ''];
      if (buyRows.length > 0) {
        lines.push('Need to buy:');
        buyRows.forEach(function (r) {
          var own = r.owned > 0 ? ' (own ' + r.owned + ')' : '';
          lines.push('\u25cb ' + r.brandLabel + ' ' + r.id + ' ' + r.name + ' \u2014 need ' + r.needed + ' skein' + (r.needed !== 1 ? 's' : '') + own);
        });
        lines.push('');
      }
      if (ownedRows.length > 0) {
        lines.push('Already in stash:');
        ownedRows.forEach(function (r) {
          lines.push('\u2713 ' + r.brandLabel + ' ' + r.id + ' ' + r.name + ' \u2014 own ' + r.owned + ', need ' + r.needed);
        });
        lines.push('');
      }
      lines.push('Total: ' + ownedRows.length + ' of ' + rows.length + ' colours owned. Need ' + buyRows.length + ' colour' + (buyRows.length !== 1 ? 's' : '') + ' (~' + totalNeedSkeins + ' skein' + (totalNeedSkeins !== 1 ? 's' : '') + ').');
      var text = lines.join('\n');
      function done() { setCopied(true); setTimeout(function () { setCopied(false); }, 2000); }
      if (navigator.clipboard && navigator.clipboard.writeText) {
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

    var sectionLabel = function (text, color) {
      return h('div', { style: { fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.04, color: color, margin: '12px 0 6px' } }, text);
    };
    var rowEl = function (r, kind) {
      var bg = kind === 'owned' ? '#f0fdf4' : '#fef2f2';
      var border = kind === 'owned' ? '#bbf7d0' : '#fecaca';
      var note = kind === 'owned'
        ? 'own ' + r.owned + ', need ~' + r.needed
        : 'need ~' + r.needed + ' skein' + (r.needed !== 1 ? 's' : '') + (r.owned > 0 ? ' (own ' + r.owned + ')' : '');
      return h('div', {
        key: r.id,
        style: { display: 'flex', alignItems: 'center', gap: 10, padding: '7px 10px', background: bg, borderRadius: 6, border: '1px solid ' + border, marginBottom: 4 }
      },
        h('div', { style: { width: 16, height: 16, borderRadius: 3, background: 'rgb(' + r.rgb + ')', border: '1px solid #CFC4AC', flexShrink: 0 } }),
        h('div', { style: { width: 38, fontWeight: 700, fontSize: 12, flexShrink: 0 } }, r.id),
        h('div', { style: { flex: 1, fontSize: 12, color: '#5C5448', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' } }, r.name),
        h('div', { style: { fontSize: 11, color: kind === 'owned' ? '#15803d' : '#b91c1c', fontWeight: 500, flexShrink: 0 } }, note)
      );
    };

    return h('div', { className: 'modal-overlay', onClick: onClose, style: { zIndex: 1000 } },
      h('div', {
        className: 'modal-content',
        onClick: function (e) { e.stopPropagation(); },
        style: { maxWidth: 540, width: '100%', maxHeight: '90vh', display: 'flex', flexDirection: 'column', padding: 0 }
      },
        h('div', { style: { padding: '16px 20px', borderBottom: '1px solid #E5DCCB', display: 'flex', justifyContent: 'space-between', alignItems: 'center' } },
          h('h2', { style: { margin: 0, fontSize: 18 } }, 'What do I need to buy?'),
          h('button', {
            onClick: onClose,
            style: { background: 'none', border: 'none', fontSize: 24, cursor: 'pointer', color: '#A89E89' }
          }, '\u00D7')
        ),
        h('div', {
          style: {
            padding: '10px 20px', background: buyRows.length === 0 ? '#f0fdf4' : '#fffbeb',
            borderBottom: '1px solid #E5DCCB', fontSize: 12,
            color: buyRows.length === 0 ? '#15803d' : '#92400e', fontWeight: 600
          }
        },
          buyRows.length === 0
            ? '\u2713 You have all ' + rows.length + ' colours \u2014 ready to stitch!'
            : 'You have ' + ownedRows.length + ' of ' + rows.length + ' colours. Need to buy ' + buyRows.length + ' thread' + (buyRows.length !== 1 ? 's' : '') + ' (~' + totalNeedSkeins + ' skein' + (totalNeedSkeins !== 1 ? 's' : '') + ' total).'
        ),
        h('div', { style: { padding: '12px 20px', overflowY: 'auto', flex: 1 } },
          rows.length === 0
            ? h('div', { style: { padding: 30, textAlign: 'center', color: '#A89E89' } }, 'No threads in this pattern yet.')
            : h(React.Fragment, null,
                buyRows.length > 0 && sectionLabel('Need to buy (' + buyRows.length + ')', '#dc2626'),
                buyRows.map(function (r) { return rowEl(r, 'needed'); }),
                ownedRows.length > 0 && sectionLabel('Already in your stash (' + ownedRows.length + ')', '#16a34a'),
                ownedRows.map(function (r) { return rowEl(r, 'owned'); })
              )
        ),
        h('div', {
          style: { padding: '14px 20px', borderTop: '1px solid #E5DCCB', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#FBF8F3', gap: 8, flexWrap: 'wrap' }
        },
          h('span', { style: { fontSize: 12, color: '#16a34a', fontWeight: 600, opacity: copied ? 1 : 0, transition: 'opacity 0.2s' } }, 'Copied!'),
          h('div', { style: { display: 'flex', gap: 8, marginLeft: 'auto' } },
            h('a', {
              href: 'manager.html',
              style: { padding: '7px 14px', borderRadius: 8, border: '0.5px solid #E5DCCB', background: '#fff', cursor: 'pointer', fontWeight: 600, fontSize: 13, textDecoration: 'none', color: '#5C5448' }
            }, 'Open in Stash Manager'),
            rows.length > 0 && h('button', {
              onClick: copyText,
              style: { padding: '7px 14px', borderRadius: 8, border: 'none', background: '#B85C38', color: '#fff', cursor: 'pointer', fontWeight: 600, fontSize: 13 }
            }, 'Copy list')
          )
        )
      )
    );
  }

  window.CreatorShoppingListModal = CreatorShoppingListModal;
})();
