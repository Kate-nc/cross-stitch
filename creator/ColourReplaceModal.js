/* ═══════════════════════════════════════════════════════════════════════════
   creator/ColourReplaceModal.js — Direct colour replacement modal.
   Opens when the user right-clicks a stitch → "Replace this colour",
   clicks the swap button on a palette chip, or uses the Replace tool.
   Depends on: React (global), window.Overlay (components.js),
               window.Icons (icons.js), window.DMC (dmc-data.js)
   ═══════════════════════════════════════════════════════════════════════════ */

window.ColourReplaceModal = function ColourReplaceModal(props) {
  var modal = props.modal;     // { srcId, srcName, srcRgb }
  var onClose = props.onClose;
  var onApply = props.onApply; // called with a DMC thread object {id, name, rgb, ...}

  var h = React.createElement;
  var _search = React.useState(''); var search = _search[0], setSearch = _search[1];

  var filteredThreads = React.useMemo(function() {
    if (typeof DMC === 'undefined') return [];
    var q = search.trim().toLowerCase();
    if (!q) return DMC;
    return DMC.filter(function(t) {
      return t.id.toLowerCase().indexOf(q) !== -1 || t.name.toLowerCase().indexOf(q) !== -1;
    });
  }, [search]);

  var srcRgb = modal && modal.srcRgb ? modal.srcRgb : [128, 128, 128];

  function handleKey(e) {
    if (e.key === 'Escape') { e.stopPropagation(); onClose(); }
  }

  return h(window.Overlay, {
    onClose: onClose,
    variant: 'dialog',
    labelledBy: 'colour-replace-title',
    onKeyDown: handleKey,
    style: { maxWidth: 460, width: '100%', display: 'flex', flexDirection: 'column', maxHeight: '80vh' }
  },
    h(window.Overlay.CloseButton, { onClose: onClose }),
    h('div', { style: { padding: 20, display: 'flex', flexDirection: 'column', minHeight: 0, flex: 1 } },
      h('div', { style: { display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 } },
        h('span', {
          style: {
            width: 20, height: 20, borderRadius: 4, flexShrink: 0, display: 'inline-block',
            background: 'rgb(' + srcRgb + ')', border: '1px solid var(--border)'
          }
        }),
        h('h3', {
          id: 'colour-replace-title',
          style: { margin: 0, fontSize: 'var(--text-base)', fontWeight: 600, color: 'var(--text-primary)' }
        },
          'Replace DMC ' + (modal ? modal.srcId : '') +
          (modal && modal.srcName && modal.srcName !== modal.srcId ? ' \u00B7 ' + modal.srcName : '') +
          ' with\u2026'
        )
      ),
      h('input', {
        type: 'text',
        placeholder: 'Search by DMC code or colour name\u2026',
        value: search,
        onChange: function(e) { setSearch(e.target.value); },
        autoFocus: true,
        style: {
          width: '100%', padding: '8px 10px', borderRadius: 'var(--radius-sm)',
          border: '1px solid var(--border)', fontSize: 'var(--text-sm)',
          fontFamily: 'inherit', boxSizing: 'border-box', marginBottom: 10,
          background: 'var(--surface)', color: 'var(--text-primary)', outline: 'none'
        }
      }),
      h('div', { style: { flex: 1, overflowY: 'auto', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)' } },
        filteredThreads.length === 0
          ? h('div', { style: { padding: 20, textAlign: 'center', color: 'var(--text-tertiary)', fontSize: 'var(--text-sm)' } }, 'No colours found')
          : filteredThreads.map(function(t) {
              var isSrc = modal && t.id === modal.srcId;
              return h('button', {
                key: t.id,
                onClick: function() { if (!isSrc) onApply(t); },
                disabled: isSrc,
                style: {
                  display: 'flex', alignItems: 'center', gap: 10, width: '100%',
                  padding: '7px 12px', border: 'none', borderBottom: '1px solid var(--surface-secondary)',
                  background: isSrc ? 'var(--surface-secondary)' : 'transparent',
                  cursor: isSrc ? 'default' : 'pointer', textAlign: 'left', fontFamily: 'inherit'
                },
                onMouseEnter: function(e) { if (!isSrc) e.currentTarget.style.background = 'var(--surface-secondary)'; },
                onMouseLeave: function(e) { if (!isSrc) e.currentTarget.style.background = 'transparent'; }
              },
                h('span', {
                  style: {
                    width: 18, height: 18, borderRadius: 3, flexShrink: 0, display: 'inline-block',
                    background: 'rgb(' + t.rgb + ')', border: '1px solid var(--border)'
                  }
                }),
                h('span', { style: { fontFamily: 'monospace', fontSize: 'var(--text-xs)', color: 'var(--text-secondary)', flexShrink: 0, minWidth: 35 } }, t.id),
                h('span', { style: { fontSize: 'var(--text-sm)', color: 'var(--text-primary)', flex: 1, textAlign: 'left' } }, t.name),
                isSrc && h('span', { style: { fontSize: 'var(--text-xs)', color: 'var(--text-tertiary)', flexShrink: 0 } }, 'current')
              );
            })
      ),
      h('div', { style: { marginTop: 12, display: 'flex', justifyContent: 'flex-end' } },
        h('button', {
          onClick: onClose,
          style: {
            padding: '7px 16px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border)',
            background: 'var(--surface)', cursor: 'pointer', fontFamily: 'inherit',
            fontSize: 'var(--text-sm)', color: 'var(--text-primary)'
          }
        }, 'Cancel')
      )
    )
  );
};
