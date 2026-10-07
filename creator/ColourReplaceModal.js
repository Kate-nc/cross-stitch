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
    var srcIds = props.srcIds || [], dst = props.dst, mask = props.mask;
    // swapRgb: when swapping, cells in the destination colour take this colour.
    var swapRgb = props.swapRgb || null;
    var srcKey = srcIds.join('|');
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
      var srcSet = new Set(srcIds);
      for (var i = 0; i < sW * sH; i++) {
        var cell = pat[i];
        var rgb;
        if (!cell || cell.id === '__skip__' || cell.id === '__empty__' || !cell.rgb) rgb = FABRIC_RGB;
        else if (dstRgb && srcSet.has(cell.id) && (!mask || mask[i])) rgb = dstRgb;
        else if (swapRgb && dst && cell.id === dst.id && (!mask || mask[i])) rgb = swapRgb;
        else rgb = cell.rgb;
        var o = i * 4;
        d[o] = rgb[0]; d[o + 1] = rgb[1]; d[o + 2] = rgb[2]; d[o + 3] = 255;
      }
      ctx.putImageData(img, 0, 0);
    }, [pat, sW, sH, srcKey, dst, mask, valid, swapRgb && swapRgb.join(',')]); // eslint-disable-line react-hooks/exhaustive-deps

    if (!valid) return null;
    var scale = Math.min(THUMB_MAX_W / sW, THUMB_MAX_H / sH);
    return h('figure', { style: { margin: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, flex: 1, minWidth: 0 } },
      h('canvas', {
        ref: ref, width: sW, height: sH,
        role: 'img', 'aria-label': props.ariaLabel,
        style: {
          // height:auto keeps the aspect ratio (from the width/height
          // attributes) when maxWidth shrinks a wide pattern on narrow screens.
          width: Math.max(1, Math.round(sW * scale)), maxWidth: '100%', height: 'auto',
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
    var onApply = props.onApply; // called with (thread {id, name, rgb, ...}, { scope: 'selection' | 'all' })
    var pat = props.pat, sW = props.sW, sH = props.sH;
    var pal = props.pal || null;  // current palette entries ({ id, name, rgb, count, ... })
    var partialStitches = props.partialStitches || null;  // Map idx -> { TL, TR, BL, BR }
    var bsLines = props.bsLines || null;
    // Pass the selection mask only when something is selected.
    var selectionMask = props.selectionMask || null;

    var h = React.createElement;
    var _search = React.useState(''); var search = _search[0], setSearch = _search[1];
    var _picked = React.useState(null); var picked = _picked[0], setPicked = _picked[1];
    // Keyboard-active option ('section:id'). Selection follows it, so arrowing
    // through the list updates the preview. Cleared when the search changes.
    var _active = React.useState(null); var activeKey = _active[0], setActiveKey = _active[1];
    var listRef = React.useRef(null);

    var srcId = modal ? modal.srcId : null;
    var srcRgb = modal && modal.srcRgb ? modal.srcRgb : [128, 128, 128];

    var CR = window.ColourReplace;
    var dmcList = typeof DMC !== 'undefined' ? DMC : [];

    // Colours already in the pattern (excluding the source). Picking one
    // merges the two colours, so they're listed first and flagged.
    var palEntries = React.useMemo(function() {
      if (!pal) return [];
      return pal.filter(function(p) {
        return p && p.rgb && p.id !== srcId && p.id !== '__skip__' && p.id !== '__empty__';
      });
    }, [pal, srcId]);
    var palIds = React.useMemo(function() {
      return new Set(palEntries.map(function(p) { return p.id; }));
    }, [palEntries]);

    // Thread list sections. With an empty search: In your palette, Closest
    // matches, All threads. With a search: one flat list of matches.
    var sections = React.useMemo(function() {
      var q = search.trim().toLowerCase();
      var rank = function(list, opts) { return CR && CR.rankBySimilarity ? CR.rankBySimilarity(srcRgb, list, opts) : list.map(function(t) { return { thread: t, dE: null }; }); };
      if (q) {
        var match = function(t) { return t.id.toLowerCase().indexOf(q) !== -1 || (t.name || '').toLowerCase().indexOf(q) !== -1; };
        // Palette-only entries (e.g. blends) aren't in DMC, so search them too.
        var extra = palEntries.filter(function(p) { return match(p) && !dmcList.some(function(d) { return d.id === p.id; }); });
        var items = extra.concat(dmcList.filter(match)).map(function(t) { return { thread: t, dE: null }; });
        return [{ key: 'results', title: null, items: items }];
      }
      var out = [];
      if (palEntries.length) out.push({ key: 'palette', title: 'In your palette', items: rank(palEntries) });
      var exclude = new Set(palIds); if (srcId) exclude.add(srcId);
      var closest = rank(dmcList, { limit: 8, excludeIds: exclude });
      if (closest.length) out.push({ key: 'closest', title: 'Closest matches', items: closest });
      out.push({ key: 'all', title: 'All DMC threads', items: dmcList.map(function(t) { return { thread: t, dE: null }; }) });
      return out;
    }, [search, palEntries, palIds, srcId, srcRgb && srcRgb.join(','), dmcList]); // eslint-disable-line react-hooks/exhaustive-deps

    // Flat list of selectable options in display order (the source colour is
    // skipped). A thread can appear in two sections (Closest + All), so options
    // are keyed by section as well as id.
    var options = React.useMemo(function() {
      var out = [];
      sections.forEach(function(sec) {
        sec.items.forEach(function(item) {
          if (item.thread.id !== srcId) out.push({ key: sec.key + ':' + item.thread.id, thread: item.thread });
        });
      });
      return out;
    }, [sections, srcId]);
    var anyThreads = sections.some(function(sec) { return sec.items.length > 0; });
    var optionDomId = function(key) { return 'crm-opt-' + key.replace(/[^A-Za-z0-9_-]/g, '_'); };

    function activate(opt) {
      setActiveKey(opt.key);
      setPicked(opt.thread);
    }

    // Keep the active option scrolled into view.
    React.useEffect(function() {
      if (!activeKey || !listRef.current) return;
      var el = listRef.current.querySelector('#' + optionDomId(activeKey));
      if (el && typeof el.scrollIntoView === 'function') el.scrollIntoView({ block: 'nearest' });
    }, [activeKey]);

    // "Also replace similar shades": palette colours within dE <= fuzzyTol of
    // the source are replaced too (replaces the old Magic Wand fuzzy panel).
    var _fuzzy = React.useState(false); var fuzzy = _fuzzy[0], setFuzzy = _fuzzy[1];
    var _fuzzyTol = React.useState(5); var fuzzyTol = _fuzzyTol[0], setFuzzyTol = _fuzzyTol[1];
    var pickedId = picked ? picked.id : null;
    // Picking a colour already in the palette: merge into it (default) or
    // swap the two colours. Swapping uses exact colours only.
    var _mode = React.useState('merge'); var mode = _mode[0], setMode = _mode[1];
    var canSwap = !!pickedId && palIds.has(pickedId);
    var swapping = canSwap && mode === 'swap';
    var srcIds = React.useMemo(function() {
      if (swapping) return [srcId];
      var ids = fuzzy && CR && CR.similarIds
        ? CR.similarIds({ id: srcId, rgb: srcRgb }, palEntries, fuzzyTol)
        : [srcId];
      // The destination is never also a source (those stitches stay put).
      return ids.filter(function(id) { return id && id !== pickedId; });
    }, [swapping, fuzzy, fuzzyTol, srcId, srcRgb && srcRgb.join(','), palEntries, pickedId]); // eslint-disable-line react-hooks/exhaustive-deps
    var extraIds = srcIds.filter(function(id) { return id !== srcId; });
    // Colours whose stitches change: a swap changes both.
    var countIds = React.useMemo(function() {
      return swapping ? [srcId, pickedId] : srcIds;
    }, [swapping, srcId, pickedId, srcIds]);

    // Full stitches + half/quarter stitches + backstitch lines in the source
    // colour(s). total / inSelection are the sums used for scope and Apply.
    var counts = React.useMemo(function() {
      var R = window.ColourReplace;
      if (!R) return null;
      var full = R.countMatches(pat, countIds, selectionMask);
      var part = R.countPartials ? R.countPartials(partialStitches, countIds, selectionMask) : { total: 0, inSelection: selectionMask ? 0 : null };
      var bs = R.countBackstitch ? R.countBackstitch(bsLines, countIds, selectionMask, sW, sH) : { total: 0, inSelection: selectionMask ? 0 : null };
      return {
        total: full.total + part.total + bs.total,
        inSelection: selectionMask ? full.inSelection + part.inSelection + bs.inSelection : null,
        all: { full: full.total, partial: part.total, backstitch: bs.total },
        sel: selectionMask ? { full: full.inSelection, partial: part.inSelection, backstitch: bs.inSelection } : null
      };
    }, [pat, countIds, selectionMask, partialStitches, bsLines, sW, sH]);
    var describe = function(c) {
      var R = window.ColourReplace;
      return R && R.describeCounts ? R.describeCounts(c) : String((c.full || 0) + (c.partial || 0) + (c.backstitch || 0)) + ' stitches';
    };

    // Scope: with an active selection, default to "selection" (the previous
    // behaviour) unless none of the selected stitches use this colour, in
    // which case the whole pattern is the only useful choice.
    var hasSel = !!selectionMask;
    var _scope = React.useState(function() {
      return hasSel && counts && counts.inSelection > 0 ? 'selection' : 'all';
    });
    var scope = hasSel ? _scope[0] : 'all', setScope = _scope[1];
    var previewMask = scope === 'selection' ? selectionMask : null;
    var affected = counts ? (scope === 'selection' ? counts.inSelection : counts.total) : null;

    function apply(t) {
      if (!t || t.id === srcId || affected === 0) return;
      var opts = { scope: scope, alsoIds: extraIds };
      if (swapping && t.id === pickedId) opts.swap = true;
      onApply(t, opts);
    }

    function handleKey(e) {
      if (e.key === 'Escape') { e.stopPropagation(); onClose(); }
    }

    function handleSearchKey(e) {
      var idx = -1;
      for (var i = 0; i < options.length; i++) { if (options[i].key === activeKey) { idx = i; break; } }
      var last = options.length - 1;
      var step = null;
      switch (e.key) {
        case 'ArrowDown': step = idx < 0 ? 0 : Math.min(last, idx + 1); break;
        case 'ArrowUp':   step = idx < 0 ? 0 : Math.max(0, idx - 1); break;
        case 'PageDown':  step = idx < 0 ? 0 : Math.min(last, idx + 8); break;
        case 'PageUp':    step = idx < 0 ? 0 : Math.max(0, idx - 8); break;
        case 'Enter':
          e.preventDefault();
          // Enter applies the active option; with nothing active yet it
          // picks the top result (a second Enter then applies it).
          if (idx >= 0 && picked) apply(picked);
          else if (options.length) activate(options[0]);
          return;
        default: return;
      }
      e.preventDefault();
      if (options.length) activate(options[step]);
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
      : (affected === 0 ? 'nothing to change'
        : describe(scope === 'selection' ? counts.sel : counts.all) + ' will change');

    // ── Scope line: what the replacement will touch ──
    var scopeRow = null;
    if (counts && hasSel) {
      var seg = function(value, label) {
        var on = scope === value;
        return h('button', {
          key: value, type: 'button', role: 'radio', 'aria-checked': on ? 'true' : 'false',
          className: 'lp-seg' + (on ? ' lp-seg--on' : ''),
          'data-scope': value,
          tabIndex: on ? 0 : -1,
          onClick: function() { setScope(value); },
          onKeyDown: function(e) {
            if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].indexOf(e.key) === -1) return;
            e.preventDefault();
            var next = value === 'selection' ? 'all' : 'selection';
            setScope(next);
            var sib = e.currentTarget.parentNode && e.currentTarget.parentNode.querySelector('[data-scope="' + next + '"]');
            if (sib) sib.focus();
          },
          style: { padding: '4px 10px', whiteSpace: 'nowrap' }
        }, label);
      };
      scopeRow = h('div', { className: 'colour-replace-scope', style: { marginBottom: 12 } },
        h('div', { style: { display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' } },
          h('span', { id: 'colour-replace-scope-label', style: { fontSize: 'var(--text-sm)', color: 'var(--text-secondary)' } }, 'Replace in'),
          h('div', { className: 'lp-segmented', role: 'radiogroup', 'aria-labelledby': 'colour-replace-scope-label' },
            seg('selection', 'Selection (' + counts.inSelection.toLocaleString() + ')'),
            seg('all', 'Whole pattern (' + counts.total.toLocaleString() + ')')
          )
        ),
        counts.inSelection === 0 && h('div', {
          style: { marginTop: 6, display: 'flex', alignItems: 'center', gap: 6, fontSize: 'var(--text-xs)', color: 'var(--text-tertiary)' }
        },
          h('span', { 'aria-hidden': 'true', style: { display: 'inline-flex' } }, window.Icons && window.Icons.info ? window.Icons.info() : null),
          'None of your selected stitches use this colour.')
      );
    } else if (counts) {
      scopeRow = h('div', {
        className: 'colour-replace-scope',
        style: { marginBottom: 12, fontSize: 'var(--text-sm)', color: 'var(--text-secondary)' }
      }, (swapping ? 'Swaps these two colours across the whole pattern (' : 'Replaces this colour across the whole pattern (') + describe(counts.all) + ').');
    }

    // ── Similar shades row ──
    var palById = {};
    palEntries.forEach(function(p) { palById[p.id] = p; });
    var fuzzyRow = palEntries.length ? h('div', { className: 'colour-replace-fuzzy', style: { marginBottom: 12, fontSize: 'var(--text-sm)', color: 'var(--text-secondary)' } },
      h('div', { style: { display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' } },
        h('label', { style: { display: 'inline-flex', alignItems: 'center', gap: 6, cursor: 'pointer' } },
          h('input', {
            type: 'checkbox', checked: fuzzy && !swapping, 'data-fuzzy-toggle': true,
            disabled: swapping,
            title: swapping ? 'Not available when swapping two colours' : null,
            onChange: function(e) { setFuzzy(e.target.checked); }
          }),
          'Also replace similar shades'),
        fuzzy && !swapping && h('input', {
          type: 'range', min: 1, max: 20, step: 1, value: fuzzyTol,
          'aria-label': 'How similar (colour difference)',
          'aria-valuetext': 'Colour difference up to ' + fuzzyTol,
          'data-fuzzy-tol': true,
          onChange: function(e) { setFuzzyTol(Number(e.target.value)); },
          style: { width: 90 }
        }),
        fuzzy && !swapping && h('span', { style: { fontSize: 'var(--text-xs)', color: 'var(--text-tertiary)' } }, '\u0394E \u2264 ' + fuzzyTol)
      ),
      fuzzy && !swapping && h('div', {
        className: 'colour-replace-fuzzy-list',
        style: { marginTop: 6, display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', fontSize: 'var(--text-xs)', color: 'var(--text-tertiary)' }
      },
        extraIds.length
          ? ['Also replacing:'].concat(extraIds.map(function(id) {
              var p = palById[id] || { id: id };
              return h('span', { key: id, 'data-extra-id': id, style: { display: 'inline-flex', alignItems: 'center', gap: 4, color: 'var(--text-secondary)' } },
                swatch(p.rgb, 12), id + (p.name && p.name !== id ? ' ' + p.name : ''));
            }))
          : 'No other colours in your palette are that close. Drag the slider right to include more.')
    ) : null;

    function threadRow(item, sectionKey) {
      var t = item.thread;
      var isSrc = t.id === srcId;
      var isPicked = !!picked && picked.id === t.id;
      var inPal = palIds.has(t.id);
      var simLabel = CR && CR.similarityLabel && item.dE != null ? CR.similarityLabel(item.dE) : null;
      var tag = function(text, title) {
        return h('span', {
          title: title || null,
          style: { fontSize: 'var(--text-xs)', color: 'var(--text-tertiary)', flexShrink: 0, whiteSpace: 'nowrap' }
        }, text);
      };
      var key = sectionKey + ':' + t.id;
      var isActive = activeKey === key;
      // role=option rows inside a listbox; focus stays in the search box
      // (combobox pattern) and aria-activedescendant points here.
      return h('div', {
        key: key,
        id: optionDomId(key),
        role: 'option',
        'aria-selected': isPicked ? 'true' : 'false',
        'aria-disabled': isSrc ? 'true' : null,
        onClick: function() { if (!isSrc) activate({ key: key, thread: t }); },
        onDoubleClick: function() { if (!isSrc) apply(t); },
        'data-thread-id': t.id,
        'data-active': isActive ? 'true' : null,
        style: {
          outline: isActive ? '2px solid var(--accent)' : 'none', outlineOffset: -2,
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
        h('span', { style: { fontSize: 'var(--text-sm)', color: 'var(--text-primary)', flex: 1, textAlign: 'left', minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' } }, t.name || t.id),
        isSrc && tag('current'),
        !isSrc && simLabel && tag(simLabel, '\u0394E ' + item.dE.toFixed(1)),
        !isSrc && inPal && sectionKey !== 'palette' && tag('in palette'),
        isPicked && h('span', { 'aria-hidden': 'true', style: { color: 'var(--accent)', display: 'inline-flex', flexShrink: 0 } },
          window.Icons && window.Icons.check ? window.Icons.check() : null)
      );
    }

    // Picking a colour that's already in the palette: merge into it, or swap.
    var modeSeg = function(value, label) {
      var on = mode === value;
      return h('button', {
        key: value, type: 'button', role: 'radio', 'aria-checked': on ? 'true' : 'false',
        className: 'lp-seg' + (on ? ' lp-seg--on' : ''),
        'data-mode': value,
        tabIndex: on ? 0 : -1,
        onClick: function() { setMode(value); },
        onKeyDown: function(e) {
          if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].indexOf(e.key) === -1) return;
          e.preventDefault();
          var next = value === 'merge' ? 'swap' : 'merge';
          setMode(next);
          var sib = e.currentTarget.parentNode && e.currentTarget.parentNode.querySelector('[data-mode="' + next + '"]');
          if (sib) sib.focus();
        },
        style: { padding: '3px 10px', whiteSpace: 'nowrap' }
      }, label);
    };
    var mergeNote = canSwap ? h('div', {
      className: 'colour-replace-merge',
      style: { marginTop: 8, fontSize: 'var(--text-xs)', color: 'var(--text-secondary)' }
    },
      h('div', { style: { display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' } },
        h('span', { 'aria-hidden': 'true', style: { display: 'inline-flex', color: 'var(--text-tertiary)' } }, window.Icons && window.Icons.info ? window.Icons.info() : null),
        h('span', { id: 'colour-replace-mode-label' }, 'DMC ' + pickedId + ' is already in your palette.'),
        h('div', { className: 'lp-segmented', role: 'radiogroup', 'aria-labelledby': 'colour-replace-mode-label' },
          modeSeg('merge', 'Merge into it'),
          modeSeg('swap', 'Swap the two colours'))
      ),
      h('div', { className: 'colour-replace-mode-help', style: { marginTop: 4, color: 'var(--text-tertiary)' } },
        swapping
          ? 'Every DMC ' + srcId + ' stitch becomes DMC ' + pickedId + ', and every DMC ' + pickedId + ' stitch becomes DMC ' + srcId + '.'
          : 'These stitches will merge into it, leaving one colour where there were two.')
    ) : null;

    var hasThumb = !!(pat && sW > 0 && sH > 0);

    return h(window.Overlay, {
      onClose: onClose,
      variant: 'dialog',
      labelledBy: 'colour-replace-title',
      onKeyDown: handleKey,
      // Opt out of the legacy html.pref-dark button override in styles.css:
      // every control here is themed with tokens, and the override would
      // hide the picked row, the active scope segment and the Apply button.
      panelProps: { 'data-pref-modal': true },
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

        scopeRow,
        fuzzyRow,

        // ── Preview ──
        hasThumb && h('div', {
          className: 'colour-replace-preview',
          style: { display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }
        },
          h(PatternThumb, { pat: pat, sW: sW, sH: sH, caption: 'Before', ariaLabel: 'Pattern before replacement' }),
          h('span', { 'aria-hidden': 'true', style: { color: 'var(--text-tertiary)', display: 'inline-flex', flexShrink: 0 } },
            window.Icons && window.Icons.chevronRight ? window.Icons.chevronRight() : null),
          h(PatternThumb, {
            pat: pat, sW: sW, sH: sH, srcIds: srcIds, dst: picked, mask: previewMask,
            swapRgb: swapping ? srcRgb : null,
            dimmed: !picked,
            caption: picked ? 'After' : 'Pick a thread to preview',
            ariaLabel: picked ? 'Pattern after replacing with DMC ' + picked.id : 'Pattern preview, no replacement chosen'
          })
        ),

        h('input', {
          type: 'text',
          role: 'combobox',
          'aria-expanded': 'true',
          'aria-controls': 'colour-replace-listbox',
          'aria-autocomplete': 'list',
          'aria-activedescendant': activeKey ? optionDomId(activeKey) : null,
          placeholder: 'Search by DMC code or colour name…',
          'aria-label': 'Search threads',
          value: search,
          onChange: function(e) { setSearch(e.target.value); setActiveKey(null); },
          onKeyDown: handleSearchKey,
          autoFocus: true,
          // Overlay focuses [data-autofocus] on open (otherwise the close
          // button), so typing and arrow keys work straight away.
          'data-autofocus': true,
          style: {
            width: '100%', padding: '8px 10px', borderRadius: 'var(--radius-sm)',
            border: '1px solid var(--border)', fontSize: 'var(--text-sm)',
            fontFamily: 'inherit', boxSizing: 'border-box', marginBottom: 10,
            background: 'var(--surface)', color: 'var(--text-primary)', outline: 'none'
          }
        }),
        h('div', {
          className: 'colour-replace-list',
          id: 'colour-replace-listbox',
          role: 'listbox',
          'aria-label': 'Threads',
          ref: listRef,
          style: { flex: 1, minHeight: 120, overflowY: 'auto', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)' }
        },
          !anyThreads
            ? h('div', { style: { padding: 20, textAlign: 'center', color: 'var(--text-tertiary)', fontSize: 'var(--text-sm)' } }, 'No colours found')
            : sections.map(function(sec) {
                if (!sec.items.length) return null;
                return h('div', { key: sec.key, role: 'group', 'aria-label': sec.title || 'Search results', 'data-section': sec.key },
                  sec.title && h('div', {
                    role: 'presentation',
                    style: {
                      position: 'sticky', top: 0, zIndex: 1, padding: '6px 12px', background: 'var(--surface-secondary)',
                      fontSize: 'var(--text-xs)', fontWeight: 600, color: 'var(--text-tertiary)',
                      textTransform: 'uppercase', letterSpacing: '0.04em', borderBottom: '1px solid var(--border)'
                    }
                  }, sec.title),
                  sec.items.map(function(item) { return threadRow(item, sec.key); })
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
            swapping
              ? (window.Icons && window.Icons.colourSwap ? window.Icons.colourSwap() : null)
              : (window.Icons && window.Icons.chevronRight ? window.Icons.chevronRight() : null)),
          picked ? swatch(picked.rgb, 16) : h('span', {
            'aria-hidden': 'true',
            style: { width: 16, height: 16, borderRadius: 4, flexShrink: 0, display: 'inline-block', border: '1px dashed var(--text-tertiary)' }
          }),
          h('span', null,
            picked ? h('strong', { style: { color: 'var(--text-primary)', fontWeight: 600 } }, 'DMC ' + picked.id + ' ' + picked.name) : 'Pick a thread',
            countText ? ' \u00B7 ' + countText : '')
        ),
        mergeNote,
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
          }, swapping ? 'Swap' : 'Apply')
        )
      )
    );
  };
})();
