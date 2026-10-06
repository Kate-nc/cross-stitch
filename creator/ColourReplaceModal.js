/* ═══════════════════════════════════════════════════════════════════════════
   creator/ColourReplaceModal.js — Direct colour replacement modal.
   Opens when the user right-clicks a stitch → "Replace this colour",
   clicks the swap button on a palette chip, or uses the Replace tool.

   Flow: pick a thread (single click) → the preview and stitch count update →
   press Apply. Double-clicking a thread applies it straight away.

   Depends on: React (global), window.Overlay (components.js),
               window.Icons (icons.js), window.DMC (dmc-data.js),
               window.ColourReplace (creator/colourReplace.js)
   ═══════════════════════════════════════════════════════════════════════════ */

(function() {
  // Unstitched cells in the preview thumbnails. Canvas pixel data, not CSS.
  var FABRIC_RGB = [246, 242, 234];
  var THUMB_MAX_W = 190, THUMB_MAX_H = 130;

  function rgbCss(rgb) { return 'rgb(' + (rgb || [128, 128, 128]) + ')'; }

  // Small 1-pixel-per-stitch rendering of the pattern, optionally with the
  // pending replacement applied, so users can judge the change in context.
  function PatternThumb(props) {
    var h = React.createElement;
    var ref = React.useRef(null);
    var pat = props.pat, sW = props.sW, sH = props.sH;
    var srcId = props.srcId, dst = props.dst, mask = props.mask;
    var valid = !!(pat && sW > 0 && sH > 0 && pat.length >= sW * sH);

    React.useEffect(function() {
      var c = ref.current;
      if (!c || !valid) return;
      var ctx = null;
      try { ctx = c.getContext('2d'); } catch (e) { ctx = null; }
      if (!ctx || typeof ctx.createImageData !== 'function') return;
      var img = ctx.createImageData(sW, sH);
      var d = img.data;
      var dstRgb = dst && dst.rgb ? dst.rgb : null;
      for (var i = 0; i < sW * sH; i++) {
        var cell = pat[i];
        var rgb;
        if (!cell || cell.id === '__skip__' || cell.id === '__empty__' || !cell.rgb) rgb = FABRIC_RGB;
        else if (dstRgb && cell.id === srcId && (!mask || mask[i])) rgb = dstRgb;
        else rgb = cell.rgb;
        var o = i * 4;
        d[o] = rgb[0]; d[o + 1] = rgb[1]; d[o + 2] = rgb[2]; d[o + 3] = 255;
      }
      ctx.putImageData(img, 0, 0);
    }, [pat, sW, sH, srcId, dst, mask, valid]);

    if (!valid) return null;
    var scale = Math.min(THUMB_MAX_W / sW, THUMB_MAX_H / sH);
    return h('figure', { style: { margin: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, flex: 1, minWidth: 0 } },
      h('canvas', {
        ref: ref, width: sW, height: sH,
        role: 'img', 'aria-label': props.ariaLabel,
        style: {
          width: Math.max(1, Math.round(sW * scale)), height: Math.max(1, Math.round(sH * scale)),
          imageRendering: 'pixelated', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)',
          opacity: props.dimmed ? 0.45 : 1, transition: 'opacity var(--motion)'
        }
      }),
      h('figcaption', { style: { fontSize: 'var(--text-xs)', color: 'var(--text-tertiary)' } }, props.caption)
    );
  }

  window.ColourReplaceModal = function ColourReplaceModal(props) {
    var modal = props.modal;     // { srcId, srcName, srcRgb }
    var onClose = props.onClose;
    var onApply = props.onApply; // called with a DMC thread object {id, name, rgb, ...}
    var pat = props.pat, sW = props.sW, sH = props.sH;
    var selectionMask = props.selectionMask || null;

    var h = React.createElement;
    var _search = React.useState(''); var search = _search[0], setSearch = _search[1];
    var _picked = React.useState(null); var picked = _picked[0], setPicked = _picked[1];

    var srcId = modal ? modal.srcId : null;
    var srcRgb = modal && modal.srcRgb ? modal.srcRgb : [128, 128, 128];

    var filteredThreads = React.useMemo(function() {
      if (typeof DMC === 'undefined') return [];
      var q = search.trim().toLowerCase();
      if (!q) return DMC;
      return DMC.filter(function(t) {
        return t.id.toLowerCase().indexOf(q) !== -1 || t.name.toLowerCase().indexOf(q) !== -1;
      });
    }, [search]);

    var counts = React.useMemo(function() {
      if (!window.ColourReplace) return null;
      return window.ColourReplace.countMatches(pat, srcId, selectionMask);
    }, [pat, srcId, selectionMask]);
    var affected = counts ? (selectionMask ? counts.inSelection : counts.total) : null;

    function apply(t) {
      if (!t || t.id === srcId) return;
      onApply(t);
    }

    function handleKey(e) {
      if (e.key === 'Escape') { e.stopPropagation(); onClose(); }
    }

    function handleSearchKey(e) {
      if (e.key !== 'Enter') return;
      e.preventDefault();
      // First Enter picks the top result; a second Enter applies it.
      var top = null;
      for (var i = 0; i < filteredThreads.length; i++) {
        if (filteredThreads[i].id !== srcId) { top = filteredThreads[i]; break; }
      }
      if (!top) return;
      if (picked && picked.id === top.id) apply(picked);
      else setPicked(top);
    }

    var swatch = function(rgb, size) {
      return h('span', {
        'aria-hidden': 'true',
        style: {
          width: size, height: size, borderRadius: 4, flexShrink: 0, display: 'inline-block',
          background: rgbCss(rgb), border: '1px solid var(--border)'
        }
      });
    };

    var srcLabel = 'DMC ' + (srcId || '') +
      (modal && modal.srcName && modal.srcName !== srcId ? ' · ' + modal.srcName : '');
    var countText = affected == null ? null
      : affected.toLocaleString() + ' stitch' + (affected === 1 ? '' : 'es') + ' will change';

    var hasThumb = !!(pat && sW > 0 && sH > 0);

    return h(window.Overlay, {
      onClose: onClose,
      variant: 'dialog',
      labelledBy: 'colour-replace-title',
      onKeyDown: handleKey,
      // position:relative anchors Overlay.CloseButton (absolutely positioned)
      // to the dialog instead of the page corner.
      style: { position: 'relative', maxWidth: 460, width: '100%', display: 'flex', flexDirection: 'column', maxHeight: '85vh' }
    },
      h(window.Overlay.CloseButton, { onClose: onClose }),
      h('div', { style: { padding: 20, display: 'flex', flexDirection: 'column', minHeight: 0, flex: 1 } },
        h('div', { style: { display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12, paddingRight: 24 } },
          swatch(srcRgb, 20),
          h('h3', {
            id: 'colour-replace-title',
            style: { margin: 0, fontSize: 'var(--text-base)', fontWeight: 600, color: 'var(--text-primary)' }
          }, 'Replace ' + srcLabel + ' with…')
        ),

        // ── Preview ──
        hasThumb && h('div', {
          className: 'colour-replace-preview',
          style: { display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }
        },
          h(PatternThumb, { pat: pat, sW: sW, sH: sH, caption: 'Before', ariaLabel: 'Pattern before replacement' }),
          h('span', { 'aria-hidden': 'true', style: { color: 'var(--text-tertiary)', display: 'inline-flex', flexShrink: 0 } },
            window.Icons && window.Icons.chevronRight ? window.Icons.chevronRight() : null),
          h(PatternThumb, {
            pat: pat, sW: sW, sH: sH, srcId: srcId, dst: picked, mask: selectionMask,
            dimmed: !picked,
            caption: picked ? 'After' : 'Pick a thread to preview',
            ariaLabel: picked ? 'Pattern after replacing with DMC ' + picked.id : 'Pattern preview, no replacement chosen'
          })
        ),

        h('input', {
          type: 'text',
          placeholder: 'Search by DMC code or colour name…',
          'aria-label': 'Search threads',
          value: search,
          onChange: function(e) { setSearch(e.target.value); },
          onKeyDown: handleSearchKey,
          autoFocus: true,
          style: {
            width: '100%', padding: '8px 10px', borderRadius: 'var(--radius-sm)',
            border: '1px solid var(--border)', fontSize: 'var(--text-sm)',
            fontFamily: 'inherit', boxSizing: 'border-box', marginBottom: 10,
            background: 'var(--surface)', color: 'var(--text-primary)', outline: 'none'
          }
        }),
        h('div', { style: { flex: 1, minHeight: 120, overflowY: 'auto', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)' } },
          filteredThreads.length === 0
            ? h('div', { style: { padding: 20, textAlign: 'center', color: 'var(--text-tertiary)', fontSize: 'var(--text-sm)' } }, 'No colours found')
            : filteredThreads.map(function(t) {
                var isSrc = t.id === srcId;
                var isPicked = !!picked && picked.id === t.id;
                return h('button', {
                  key: t.id,
                  type: 'button',
                  onClick: function() { if (!isSrc) setPicked(t); },
                  onDoubleClick: function() { if (!isSrc) apply(t); },
                  disabled: isSrc,
                  'aria-pressed': isPicked ? 'true' : 'false',
                  'data-thread-id': t.id,
                  style: {
                    display: 'flex', alignItems: 'center', gap: 10, width: '100%',
                    padding: '7px 12px', border: 'none', borderBottom: '1px solid var(--surface-secondary)',
                    boxShadow: isPicked ? 'inset 3px 0 0 var(--accent)' : 'none',
                    background: isPicked ? 'var(--accent-light)' : (isSrc ? 'var(--surface-secondary)' : 'transparent'),
                    cursor: isSrc ? 'default' : 'pointer', textAlign: 'left', fontFamily: 'inherit'
                  },
                  onMouseEnter: function(e) { if (!isSrc && !isPicked) e.currentTarget.style.background = 'var(--surface-secondary)'; },
                  onMouseLeave: function(e) { if (!isSrc && !isPicked) e.currentTarget.style.background = 'transparent'; }
                },
                  swatch(t.rgb, 18),
                  h('span', { style: { fontFamily: 'monospace', fontSize: 'var(--text-xs)', color: 'var(--text-secondary)', flexShrink: 0, minWidth: 35 } }, t.id),
                  h('span', { style: { fontSize: 'var(--text-sm)', color: 'var(--text-primary)', flex: 1, textAlign: 'left' } }, t.name),
                  isSrc && h('span', { style: { fontSize: 'var(--text-xs)', color: 'var(--text-tertiary)', flexShrink: 0 } }, 'current'),
                  isPicked && h('span', { 'aria-hidden': 'true', style: { color: 'var(--accent)', display: 'inline-flex', flexShrink: 0 } },
                    window.Icons && window.Icons.check ? window.Icons.check() : null)
                );
              })
        ),

        // ── Summary + actions ──
        h('div', {
          className: 'colour-replace-summary',
          'aria-live': 'polite',
          style: { display: 'flex', alignItems: 'center', gap: 6, marginTop: 12, fontSize: 'var(--text-sm)', color: 'var(--text-secondary)', flexWrap: 'wrap' }
        },
          swatch(srcRgb, 16),
          h('span', { 'aria-hidden': 'true', style: { display: 'inline-flex', color: 'var(--text-tertiary)' } },
            window.Icons && window.Icons.chevronRight ? window.Icons.chevronRight() : null),
          picked ? swatch(picked.rgb, 16) : h('span', {
            'aria-hidden': 'true',
            style: { width: 16, height: 16, borderRadius: 4, flexShrink: 0, display: 'inline-block', border: '1px dashed var(--text-tertiary)' }
          }),
          h('span', null,
            picked ? h('strong', { style: { color: 'var(--text-primary)', fontWeight: 600 } }, 'DMC ' + picked.id + ' ' + picked.name) : 'Pick a thread',
            countText ? ' \u00B7 ' + countText : '')
        ),
        h('div', { style: { marginTop: 10, display: 'flex', justifyContent: 'flex-end', gap: 8 } },
          h('button', {
            type: 'button',
            onClick: onClose,
            style: {
              padding: '7px 16px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border)',
              background: 'var(--surface)', cursor: 'pointer', fontFamily: 'inherit',
              fontSize: 'var(--text-sm)', color: 'var(--text-primary)'
            }
          }, 'Cancel'),
          h('button', {
            type: 'button',
            className: 'colour-replace-apply',
            onClick: function() { apply(picked); },
            disabled: !picked || affected === 0,
            style: {
              padding: '7px 16px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--accent)',
              background: 'var(--accent)', color: 'var(--text-on-accent)', fontWeight: 600,
              cursor: (!picked || affected === 0) ? 'not-allowed' : 'pointer',
              opacity: (!picked || affected === 0) ? 0.5 : 1,
              fontFamily: 'inherit', fontSize: 'var(--text-sm)'
            }
          }, 'Apply')
        )
      )
    );
  };
})();
