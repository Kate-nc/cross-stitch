/* creator/AdaptModal.js — Stash-Adapt unified modal.
 *
 * Replaces the legacy SubstituteFromStashModal + ConvertPaletteModal pair with
 * a single non-destructive duplication flow per Phase 4 spec
 * (reports/stash-adapt-9-interaction-spec.md).
 *
 * UX summary:
 *   • Hybrid Approach A + B: substitution table on the left, sticky preview
 *     thumbnail on the right, draggable divider in between (default 0.66).
 *   • Mode toggle in the header: "Match my stash" / "Convert to brand".
 *   • Per-row picker dropdown lets the user override the auto pick or skip.
 *   • Threshold slider (1–25 ΔE2000, default 10) + "Re-run auto" button.
 *   • Save creates a *new* project (`AdaptationEngine.applyProposal`) and
 *     leaves the source untouched. Cancel discards.
 *
 * Depends on globals (browser):
 *   React, AdaptationEngine, MatchQuality, DMC, ANCHOR (optional),
 *   threadKey, parseThreadKey, getThreadByKey, ProjectStorage, AppContext,
 *   PatternDataContext (via window.usePatternData), Toast, Icons.
 */

(function () {
  if (typeof React === 'undefined') return;
  var h = React.createElement;
  var useState = React.useState, useEffect = React.useEffect, useRef = React.useRef, useMemo = React.useMemo;

  var DEFAULT_RATIO = 0.66;
  var MIN_LEFT_PX = 400;
  var MIN_RIGHT_PX = 240;
  var NARROW_BREAKPOINT = 720;
  var THRESHOLD_DEFAULT = 10;
  var RATIO_PREF_KEY = 'creator.adaptModalSplitRatio';

  // ─── Helpers ────────────────────────────────────────────────────────────
  function _stitchesByKey(pattern) {
    var out = Object.create(null);
    if (!Array.isArray(pattern)) return out;
    for (var i = 0; i < pattern.length; i++) {
      var c = pattern[i];
      if (!c || c.id === '__skip__' || c.id === '__empty__') continue;
      if (c.type === 'blend' && c.threads) {
        for (var t = 0; t < c.threads.length; t++) {
          var k = (c.threads[t].brand || 'dmc') + ':' + c.threads[t].id;
          out[k] = (out[k] || 0) + 1;
        }
      } else {
        var key = (c.brand || 'dmc') + ':' + c.id;
        out[key] = (out[key] || 0) + 1;
      }
    }
    return out;
  }

  function _renderThumb(canvas, pattern, sW, sH, remap) {
    if (!canvas || !Array.isArray(pattern)) return;
    canvas.width = sW; canvas.height = sH;
    var cx = canvas.getContext('2d');
    if (!cx) return;
    var img = cx.createImageData(sW, sH);
    var d = img.data;
    for (var i = 0; i < pattern.length; i++) {
      var cell = pattern[i];
      var idx = i * 4;
      if (!cell || cell.id === '__skip__' || cell.id === '__empty__') {
        d[idx] = 255; d[idx+1] = 255; d[idx+2] = 255; d[idx+3] = 255;
      } else if (cell.type === 'blend' && cell.threads) {
        var t0 = remap[(cell.threads[0].brand || 'dmc')+':'+cell.threads[0].id] || cell.threads[0];
        var t1 = remap[(cell.threads[1].brand || 'dmc')+':'+cell.threads[1].id] || cell.threads[1];
        d[idx]   = Math.round(((t0.rgb||[0,0,0])[0] + (t1.rgb||[0,0,0])[0]) / 2);
        d[idx+1] = Math.round(((t0.rgb||[0,0,0])[1] + (t1.rgb||[0,0,0])[1]) / 2);
        d[idx+2] = Math.round(((t0.rgb||[0,0,0])[2] + (t1.rgb||[0,0,0])[2]) / 2);
        d[idx+3] = 255;
      } else {
        var rep = remap[(cell.brand || 'dmc')+':'+cell.id] || cell;
        var rgb = rep.rgb || [128,128,128];
        d[idx] = rgb[0]; d[idx+1] = rgb[1]; d[idx+2] = rgb[2]; d[idx+3] = 255;
      }
    }
    cx.putImageData(img, 0, 0);
  }

  // ─── Match-quality chip ────────────────────────────────────────────────
  function MatchChip(props) {
    var t = props.target;
    if (!t) return h('span', { className: 'cs-adapt-chip cs-adapt-chip--none', style: chipBase('--danger') },
      h('span', { style: dotStyle('--danger') }), 'No match');
    var token = (window.MatchQuality && window.MatchQuality.tierToken(t.tier)) || '--text-secondary';
    var label = (window.MatchQuality && window.MatchQuality.tierLabel(t.tier)) || t.tier;
    var diff = (window.MatchQuality && props.sourceLab && t.lab)
      ? window.MatchQuality.describeLabDiff(props.sourceLab, t.lab) : '';
    var title = label + ' (\u0394E ' + (t.deltaE != null ? t.deltaE : '?') + ')' + (diff ? ' \u2014 ' + diff : '');
    return h('span', { className: 'cs-adapt-chip', style: chipBase(token), title: title },
      h('span', { style: dotStyle(token) }),
      label,
      h('span', { style: { opacity: 0.7, marginLeft: 4, fontVariantNumeric: 'tabular-nums' } },
        '\u0394E ' + (t.deltaE != null ? t.deltaE : '?'))
    );
  }
  function chipBase(token) {
    return {
      display: 'inline-flex', alignItems: 'center', gap: 4,
      padding: '2px 8px', borderRadius: 'var(--radius-pill, 999px)',
      fontSize: 'var(--text-xs)', lineHeight: 1.2, fontWeight: 500,
      background: 'color-mix(in srgb, var(' + token + ') 12%, transparent)',
      color: 'var(' + token + ')',
      border: '1px solid color-mix(in srgb, var(' + token + ') 28%, transparent)',
      whiteSpace: 'nowrap'
    };
  }
  function dotStyle(token) {
    return { width: 8, height: 8, borderRadius: '50%', background: 'var(' + token + ')', display: 'inline-block' };
  }

  // ─── Swatch ─────────────────────────────────────────────────────────────
  function Swatch(props) {
    var rgb = props.rgb || [200,200,200];
    var size = props.size || 22;
    return h('span', {
      title: props.title || undefined,
      style: {
        display: 'inline-block', width: size, height: size,
        background: 'rgb(' + rgb.join(',') + ')',
        borderRadius: 4,
        border: '1px solid var(--line, rgba(0,0,0,0.12))',
        verticalAlign: 'middle', flexShrink: 0
      }
    });
  }

  // ─── Picker dropdown (small inline thread chooser) ─────────────────────
  function PickerPopover(props) {
    var sub = props.sub;
    var brand = props.brand;
    var stash = props.stash || {};
    var _q = useState(''); var query = _q[0], setQ = _q[1];
    var _tab = useState('all'); var tab = _tab[0], setTab = _tab[1];

    var rows = useMemo(function () {
      var arr = brand === 'anchor'
        ? (typeof ANCHOR !== 'undefined' ? ANCHOR : [])
        : (typeof DMC !== 'undefined' ? DMC : []);
      var q = query.trim().toLowerCase();
      var out = [];
      for (var i = 0; i < arr.length; i++) {
        var t = arr[i];
        var key = brand + ':' + t.id;
        var owned = !!(stash[key] && stash[key].owned > 0);
        if (tab === 'inStash' && !owned) continue;
        if (q && t.id.toLowerCase().indexOf(q) === -1 && (t.name||'').toLowerCase().indexOf(q) === -1) continue;
        out.push({ key: key, brand: brand, id: t.id, name: t.name, rgb: t.rgb, owned: owned });
        if (out.length >= 60) break;
      }
      return out;
    }, [query, tab, brand, stash]);

    return h('div', {
      style: {
        position: 'absolute', zIndex: 50, top: '100%', left: 0, marginTop: 4,
        width: 320, maxHeight: 360, overflow: 'hidden',
        background: 'var(--surface)', border: '1px solid var(--border)',
        borderRadius: 'var(--radius-md, 8px)',
        boxShadow: '0 8px 24px rgba(0,0,0,0.18)',
        display: 'flex', flexDirection: 'column'
      },
      onClick: function (e) { e.stopPropagation(); }
    },
      h('div', { style: { padding: 8, borderBottom: '1px solid var(--line)' } },
        h('div', { style: { display: 'flex', gap: 4, marginBottom: 6 } },
          ['inStash', 'all'].map(function (t) {
            return h('button', {
              key: t,
              onClick: function () { setTab(t); },
              style: tabBtnStyle(tab === t)
            }, t === 'inStash' ? 'In stash' : 'All ' + brand.toUpperCase());
          })
        ),
        h('input', {
          type: 'text', value: query, onChange: function (e) { setQ(e.target.value); },
          placeholder: 'Search id or name…',
          autoFocus: true,
          style: {
            width: '100%', padding: '6px 8px', fontSize: 13,
            border: '1px solid var(--border)', borderRadius: 4,
            background: 'var(--surface-elevated, var(--surface))',
            color: 'var(--text-primary)'
          }
        })
      ),
      h('div', { style: { overflowY: 'auto', flex: 1 } },
        rows.length === 0 ? h('div', { style: { padding: 16, fontSize: 12, color: 'var(--text-secondary)', textAlign: 'center' } }, 'No matches')
        : rows.map(function (r) {
          return h('button', {
            key: r.key,
            onClick: function () { props.onPick(r); },
            style: {
              display: 'flex', alignItems: 'center', gap: 8,
              width: '100%', padding: '6px 10px', textAlign: 'left',
              background: 'transparent', border: 'none', cursor: 'pointer',
              fontSize: 13, color: 'var(--text-primary)'
            },
            onMouseEnter: function (e) { e.currentTarget.style.background = 'var(--surface-elevated, color-mix(in srgb, var(--text-primary) 4%, transparent))'; },
            onMouseLeave: function (e) { e.currentTarget.style.background = 'transparent'; }
          },
            h(Swatch, { rgb: r.rgb, size: 18 }),
            h('span', { style: { fontWeight: 500 } }, r.id),
            h('span', { style: { color: 'var(--text-secondary)', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' } }, r.name),
            r.owned && h('span', { style: { fontSize: 10, color: 'var(--success)' } }, 'In stash')
          );
        }),
        h('button', {
          onClick: function () { props.onPick(null); },
          style: {
            display: 'block', width: '100%', padding: '8px 10px',
            textAlign: 'left', background: 'transparent', border: 'none',
            borderTop: '1px solid var(--line)', cursor: 'pointer',
            fontSize: 12, color: 'var(--text-secondary)', fontStyle: 'italic'
          }
        }, 'Skip — leave original')
      )
    );
  }

  function tabBtnStyle(active) {
    return {
      flex: 1, padding: '4px 8px', fontSize: 12,
      background: active ? 'var(--accent)' : 'transparent',
      color: active ? 'var(--surface)' : 'var(--text-secondary)',
      border: '1px solid ' + (active ? 'var(--accent)' : 'var(--border)'),
      borderRadius: 4, cursor: 'pointer'
    };
  }

  // ─── Substitution row ──────────────────────────────────────────────────
  function SubstitutionRow(props) {
    var sub = props.sub;
    var _open = useState(false); var pickerOpen = _open[0], setPickerOpen = _open[1];

    useEffect(function () {
      if (!pickerOpen) return;
      function close(e) { setPickerOpen(false); }
      document.addEventListener('pointerdown', close);
      return function () { document.removeEventListener('pointerdown', close); };
    }, [pickerOpen]);

    var t = sub.target;
    return h('tr', { style: { borderBottom: '1px solid var(--line)' } },
      h('td', { style: cellStyle },
        h('div', { style: { display: 'flex', alignItems: 'center', gap: 8 } },
          h(Swatch, { rgb: sub.sourceRgb }),
          h('div', { style: { minWidth: 0 } },
            h('div', { style: { fontWeight: 500, fontSize: 13 } }, sub.sourceId),
            h('div', { style: { fontSize: 11, color: 'var(--text-secondary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 160 } }, sub.sourceName)
          )
        )
      ),
      h('td', { style: Object.assign({}, cellStyle, { width: 28, textAlign: 'center', color: 'var(--text-tertiary)' }) }, '\u2192'),
      h('td', { style: Object.assign({}, cellStyle, { position: 'relative' }) },
        t ? h('div', { style: { display: 'flex', alignItems: 'center', gap: 8 } },
          h(Swatch, { rgb: t.rgb }),
          h('div', { style: { minWidth: 0, flex: 1 } },
            h('div', { style: { fontWeight: 500, fontSize: 13 } }, t.id, ' ',
              h('span', { style: { fontWeight: 400, color: 'var(--text-secondary)', fontSize: 11 } }, '(' + t.brand + ')')),
            h('div', { style: { fontSize: 11, color: 'var(--text-secondary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 160 } }, t.name)
          )
        ) : h('span', { style: { fontSize: 12, color: 'var(--text-secondary)', fontStyle: 'italic' } },
          sub.skipReason === 'all-above-threshold' ? 'No match within threshold'
          : sub.skipReason === 'no-stash-match' ? 'Nothing in stash'
          : 'No equivalent'),
        pickerOpen && h(PickerPopover, {
          sub: sub, brand: props.brand, stash: props.stash,
          onPick: function (pick) { setPickerOpen(false); props.onPick(pick); }
        })
      ),
      h('td', { style: cellStyle }, h(MatchChip, { target: t, sourceLab: sub.sourceLab })),
      h('td', { style: Object.assign({}, cellStyle, { textAlign: 'right' }) },
        h('button', {
          onClick: function (e) { e.stopPropagation(); setPickerOpen(function (v) { return !v; }); },
          style: {
            padding: '4px 10px', fontSize: 12,
            background: 'transparent', color: 'var(--accent)',
            border: '1px solid var(--accent)', borderRadius: 'var(--radius-sm, 4px)',
            cursor: 'pointer'
          }
        }, t ? 'Change\u2026' : 'Pick\u2026')
      )
    );
  }
  var cellStyle = { padding: '8px 10px', verticalAlign: 'middle' };

  // ─── Main modal ────────────────────────────────────────────────────────
  function AdaptModal(props) {
    var onClose = props.onClose;
    var initialMode = props.mode || 'stash';
    var ctx = window.usePatternData ? window.usePatternData() : null;
    var app = window.useApp ? window.useApp() : null;
    if (!ctx) return null;

    var pat = ctx.pat, sW = ctx.sW, sH = ctx.sH, pal = ctx.pal;
    var stash = ctx.globalStash || {};

    var _mode = useState(initialMode); var mode = _mode[0], setMode = _mode[1];
    var _brandTgt = useState('anchor'); var brandTarget = _brandTgt[0], setBrandTarget = _brandTgt[1];
    var srcBrand = (pal && pal[0] && pal[0].brand) || 'dmc';

    // Threshold (debounced persistence)
    var _thr = useState(function () {
      try { var v = parseFloat(localStorage.getItem('cs_adaptMaxDE')); return isFinite(v) ? v : THRESHOLD_DEFAULT; } catch (_) { return THRESHOLD_DEFAULT; }
    });
    var threshold = _thr[0], setThresholdRaw = _thr[1];
    var thrTimerRef = useRef(null);
    function setThreshold(v) {
      setThresholdRaw(v);
      if (thrTimerRef.current) clearTimeout(thrTimerRef.current);
      thrTimerRef.current = setTimeout(function () {
        try { localStorage.setItem('cs_adaptMaxDE', String(v)); } catch (_) {}
      }, 500);
    }

    // Build the source palette for the engine.
    var srcPalette = useMemo(function () {
      var counts = _stitchesByKey(pat || []);
      return (pal || []).filter(function (p) { return p && p.id !== '__skip__' && p.id !== '__empty__'; }).map(function (p) {
        var key = (p.brand || 'dmc') + ':' + p.id;
        return { id: p.id, brand: p.brand || 'dmc', name: p.name, rgb: p.rgb, stitches: counts[key] || 0 };
      });
    }, [pat, pal]);

    // Compute proposal (re-runs whenever inputs change).
    var _prop = useState(null); var proposal = _prop[0], setProposal = _prop[1];
    useEffect(function () {
      if (!window.AdaptationEngine) return;
      try {
        var p = mode === 'brand'
          ? window.AdaptationEngine.proposeBrand(srcPalette, srcBrand, brandTarget, { maxDeltaE: threshold, stash: stash })
          : window.AdaptationEngine.proposeStash(srcPalette, stash, { maxDeltaE: threshold, fabricCt: ctx.fabricCt || 14 });
        setProposal(p);
      } catch (err) {
        // eslint-disable-next-line no-console
        console.error('AdaptModal proposal failed:', err);
      }
    }, [mode, brandTarget, srcBrand, srcPalette, stash, threshold, ctx.fabricCt]);

    // Manual overrides keyed by source key. Applied on top of the auto proposal.
    var _ov = useState({}); var overrides = _ov[0], setOverrides = _ov[1];

    var effectiveProposal = useMemo(function () {
      if (!proposal) return null;
      var subs = proposal.substitutions.map(function (sub) {
        var k = sub.sourceBrand + ':' + sub.sourceId;
        var ov = overrides[k];
        if (ov === undefined) return sub;
        // ov === null  → user skipped
        // ov === pick  → user manual override
        var copy = Object.assign({}, sub);
        if (ov === null) {
          copy.target = null; copy.state = 'no-match'; copy.skipReason = 'user-skipped';
        } else {
          copy.target = Object.assign({}, ov, {
            deltaE: ov.deltaE != null ? ov.deltaE : 0,
            tier: ov.tier || 'exact',
            confidence: 'manual', source: 'manual', inStash: !!ov.owned
          });
          copy.state = 'accepted'; copy.skipReason = null;
        }
        return copy;
      });
      return Object.assign({}, proposal, { substitutions: subs });
    }, [proposal, overrides]);

    function handlePick(sub, pick) {
      var k = sub.sourceBrand + ':' + sub.sourceId;
      setOverrides(function (prev) {
        var next = Object.assign({}, prev);
        if (pick === null) next[k] = null;
        else next[k] = pick;
        return next;
      });
    }

    function handleResetOverrides() { setOverrides({}); }

    // ── Resizable split ────────────────────────────────────────────────
    var containerRef = useRef(null);
    var dragRef = useRef(false);
    var _ratio = useState(function () {
      try {
        var saved = window.UserPrefs && window.UserPrefs.get && window.UserPrefs.get(RATIO_PREF_KEY);
        var n = parseFloat(saved);
        return isFinite(n) ? n : DEFAULT_RATIO;
      } catch (_) { return DEFAULT_RATIO; }
    });
    var ratio = _ratio[0], setRatio = _ratio[1];
    var _narrow = useState(false); var narrow = _narrow[0], setNarrow = _narrow[1];

    useEffect(function () {
      var el = containerRef.current; if (!el || typeof ResizeObserver === 'undefined') return;
      var obs = new ResizeObserver(function (entries) { setNarrow(entries[0].contentRect.width < NARROW_BREAKPOINT); });
      obs.observe(el);
      setNarrow(el.clientWidth < NARROW_BREAKPOINT);
      return function () { obs.disconnect(); };
    }, []);

    useEffect(function () {
      function onMove(e) {
        if (!dragRef.current) return;
        var el = containerRef.current; if (!el) return;
        var rect = el.getBoundingClientRect();
        var x = (e.touches ? e.touches[0].clientX : e.clientX) - rect.left;
        var minLeftR = MIN_LEFT_PX / rect.width;
        var maxLeftR = (rect.width - MIN_RIGHT_PX) / rect.width;
        var r = Math.max(minLeftR, Math.min(maxLeftR, x / rect.width));
        setRatio(r);
      }
      function onUp() {
        if (!dragRef.current) return;
        dragRef.current = false;
        document.body.style.cursor = '';
        document.body.style.userSelect = '';
        try { if (window.UserPrefs && window.UserPrefs.setDebounced) window.UserPrefs.setDebounced(RATIO_PREF_KEY, ratio); } catch (_) {}
      }
      document.addEventListener('pointermove', onMove);
      document.addEventListener('pointerup', onUp);
      return function () {
        document.removeEventListener('pointermove', onMove);
        document.removeEventListener('pointerup', onUp);
      };
    }, [ratio]);

    // ── Preview thumbnail ──────────────────────────────────────────────
    var origCanvasRef = useRef(null);
    var newCanvasRef  = useRef(null);
    useEffect(function () {
      _renderThumb(origCanvasRef.current, pat, sW, sH, {});
    }, [pat, sW, sH]);
    useEffect(function () {
      if (!effectiveProposal) return;
      var remap = {};
      effectiveProposal.substitutions.forEach(function (s) {
        if (s.target) {
          var k = s.sourceBrand + ':' + s.sourceId;
          remap[k] = s.target;
          remap[s.sourceId] = s.target;
        }
      });
      _renderThumb(newCanvasRef.current, pat, sW, sH, remap);
    }, [effectiveProposal, pat, sW, sH]);

    // ── Save (apply proposal → new project) ────────────────────────────
    function handleSave() {
      if (!effectiveProposal || !window.AdaptationEngine) return;
      // Build the source project shape that applyProposal expects.
      var source = {
        id: ctx.projectId || 'proj_current',
        v: 11,
        name: ctx.projectName || 'Untitled',
        createdAt: ctx.createdAt || new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        w: sW, h: sH,
        settings: { sW: sW, sH: sH, fabricCt: ctx.fabricCt || 14 },
        pattern: pat,
        bsLines: ctx.bsLines || [],
        parkMarkers: ctx.parkMarkers || []
      };
      var adapted;
      try {
        adapted = window.AdaptationEngine.applyProposal(source, effectiveProposal);
      } catch (err) {
        console.error('applyProposal failed', err);
        if (window.Toast) window.Toast.show({ message: 'Adapt failed: ' + (err && err.message), type: 'error' });
        return;
      }
      // Disambiguate the auto-suffixed name against existing projects.
      var saveAndOpen = function (finalName) {
        adapted.name = finalName;
        if (window.ProjectStorage && window.ProjectStorage.save) {
          window.ProjectStorage.save(adapted).then(function () {
            if (window.ProjectStorage.setActive) window.ProjectStorage.setActive(adapted.id);
            if (window.Toast) window.Toast.show({
              message: 'Adapted pattern saved: ' + finalName,
              type: 'success', duration: 4000
            });
            onClose();
            // Reload page to load the new active project in the Creator.
            setTimeout(function () { window.location.reload(); }, 200);
          }).catch(function (err) {
            console.error('save adapted failed', err);
            if (window.Toast) window.Toast.show({ message: 'Save failed: ' + (err && err.message), type: 'error' });
          });
        }
      };
      // Disambiguate the name against the meta store.
      if (window.ProjectStorage && window.ProjectStorage.listProjects) {
        window.ProjectStorage.listProjects().then(function (existing) {
          var taken = {};
          (existing || []).forEach(function (m) { taken[m.name] = true; });
          var base = adapted.name;
          var name = base;
          var n = 2;
          while (taken[name]) { name = base + ' ' + n; n++; }
          saveAndOpen(name);
        }).catch(function () { saveAndOpen(adapted.name); });
      } else {
        saveAndOpen(adapted.name);
      }
    }

    // ── Render ─────────────────────────────────────────────────────────
    var subs = effectiveProposal ? effectiveProposal.substitutions : [];
    var nMatch    = subs.filter(function (s) { return s.state === 'accepted'; }).length;
    var nSkipped  = subs.filter(function (s) { return s.state !== 'accepted'; }).length;
    var leftPct = narrow ? 100 : Math.round(ratio * 100);
    var rightPct = narrow ? 100 : 100 - leftPct;

    return h('div', {
      role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': 'cs-adapt-title',
      onClick: function (e) { if (e.target === e.currentTarget) onClose(); },
      style: {
        position: 'fixed', inset: 0, zIndex: 1100,
        background: 'rgba(0,0,0,0.4)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: 16
      }
    },
      h('div', {
        style: {
          background: 'var(--surface)', borderRadius: 'var(--radius-lg, 12px)',
          width: 'min(1200px, 100%)', maxHeight: '92vh',
          display: 'flex', flexDirection: 'column',
          boxShadow: '0 20px 60px rgba(0,0,0,0.35)',
          border: '1px solid var(--border)',
          overflow: 'hidden'
        }
      },
        // Header
        h('header', { style: {
          padding: '14px 18px', borderBottom: '1px solid var(--line)',
          display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap'
        } },
          h('h2', { id: 'cs-adapt-title', style: { margin: 0, fontSize: 'var(--text-lg)', fontWeight: 600, color: 'var(--text-primary)' } },
            'Adapt pattern'),
          h('div', { style: { display: 'flex', gap: 4 } },
            ['stash', 'brand'].map(function (m) {
              return h('button', {
                key: m,
                onClick: function () { setMode(m); setOverrides({}); },
                style: tabBtnStyle(mode === m)
              }, m === 'stash' ? 'Match my stash' : 'Convert to brand');
            })
          ),
          mode === 'brand' && h('label', { style: { display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, color: 'var(--text-secondary)' } },
            'Target:',
            h('select', {
              value: brandTarget,
              onChange: function (e) { setBrandTarget(e.target.value); setOverrides({}); },
              style: { padding: '4px 8px', fontSize: 13, background: 'var(--surface)', color: 'var(--text-primary)', border: '1px solid var(--border)', borderRadius: 4 }
            },
              h('option', { value: 'dmc' }, 'DMC'),
              h('option', { value: 'anchor' }, 'Anchor')
            )
          ),
          h('div', { style: { flex: 1 } }),
          h('button', {
            onClick: onClose,
            'aria-label': 'Close',
            style: { background: 'transparent', border: 'none', cursor: 'pointer', padding: 6, color: 'var(--text-secondary)', fontSize: 18 }
          }, '\u00D7')
        ),
        // Body — split pane
        h('div', {
          ref: containerRef,
          style: { flex: 1, display: 'flex', minHeight: 0, position: 'relative', flexDirection: narrow ? 'column' : 'row' }
        },
          // Left: substitution table
          h('div', { style: {
            width: narrow ? '100%' : leftPct + '%',
            display: 'flex', flexDirection: 'column', minWidth: 0, minHeight: 0
          } },
            // Threshold + controls bar
            h('div', { style: {
              padding: '10px 16px', borderBottom: '1px solid var(--line)',
              display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap', fontSize: 13
            } },
              h('label', { style: { display: 'flex', alignItems: 'center', gap: 8, color: 'var(--text-secondary)' } },
                'Match strictness:',
                h('input', {
                  type: 'range', min: 1, max: 25, step: 0.5, value: threshold,
                  onChange: function (e) { setThreshold(parseFloat(e.target.value)); },
                  style: { width: 140 }
                }),
                h('span', { style: { fontVariantNumeric: 'tabular-nums', fontWeight: 500, color: 'var(--text-primary)' } },
                  '\u0394E ' + threshold)
              ),
              Object.keys(overrides).length > 0 && h('button', {
                onClick: handleResetOverrides,
                style: {
                  fontSize: 12, padding: '4px 10px',
                  background: 'transparent', color: 'var(--accent)',
                  border: '1px solid var(--accent)', borderRadius: 4, cursor: 'pointer'
                }
              }, 'Reset edits (' + Object.keys(overrides).length + ')')
            ),
            // Table
            h('div', { style: { flex: 1, overflowY: 'auto', minHeight: 0 } },
              subs.length === 0
                ? h('div', { style: { padding: 24, color: 'var(--text-secondary)', fontSize: 13 } }, 'Computing\u2026')
                : h('table', { style: { width: '100%', borderCollapse: 'collapse', fontSize: 13 } },
                  h('thead', { style: { position: 'sticky', top: 0, background: 'var(--surface)', zIndex: 1 } },
                    h('tr', { style: { borderBottom: '1px solid var(--border)' } },
                      h('th', { style: thStyle }, 'Source'),
                      h('th', { style: thStyle }, ''),
                      h('th', { style: thStyle }, 'Replacement'),
                      h('th', { style: thStyle }, 'Match'),
                      h('th', { style: thStyle }, '')
                    )
                  ),
                  h('tbody', null, subs.map(function (sub) {
                    return h(SubstitutionRow, {
                      key: sub.sourceBrand + ':' + sub.sourceId,
                      sub: sub,
                      brand: mode === 'brand' ? brandTarget : 'dmc',
                      stash: stash,
                      onPick: function (pick) { handlePick(sub, pick); }
                    });
                  }))
                )
            )
          ),
          // Divider
          !narrow && h('div', {
            role: 'separator', 'aria-orientation': 'vertical',
            tabIndex: 0,
            onPointerDown: function (e) {
              dragRef.current = true;
              document.body.style.cursor = 'col-resize';
              document.body.style.userSelect = 'none';
              e.preventDefault();
            },
            onDoubleClick: function () { setRatio(DEFAULT_RATIO); try { window.UserPrefs && window.UserPrefs.set && window.UserPrefs.set(RATIO_PREF_KEY, DEFAULT_RATIO); } catch (_) {} },
            onKeyDown: function (e) {
              if (e.key === 'ArrowLeft')  setRatio(function (r) { return Math.max(0.2, r - 0.02); });
              if (e.key === 'ArrowRight') setRatio(function (r) { return Math.min(0.8, r + 0.02); });
            },
            style: {
              width: 6, cursor: 'col-resize', background: 'var(--line)',
              flexShrink: 0
            }
          }),
          // Right: preview panel
          h('div', { style: {
            width: narrow ? '100%' : rightPct + '%',
            background: 'var(--surface-elevated, color-mix(in srgb, var(--surface) 96%, var(--text-primary) 4%))',
            padding: 16, overflowY: 'auto', minHeight: 0,
            display: 'flex', flexDirection: 'column', gap: 12, alignItems: 'center'
          } },
            h('div', { style: { fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: 0.5, alignSelf: 'flex-start' } }, 'Original'),
            h('canvas', {
              ref: origCanvasRef,
              style: {
                width: '100%', maxWidth: 320,
                imageRendering: 'pixelated', background: '#fff',
                border: '1px solid var(--border)', borderRadius: 4
              }
            }),
            h('div', { style: { fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: 0.5, alignSelf: 'flex-start', marginTop: 8 } }, 'After adapt'),
            h('canvas', {
              ref: newCanvasRef,
              style: {
                width: '100%', maxWidth: 320,
                imageRendering: 'pixelated', background: '#fff',
                border: '1px solid var(--border)', borderRadius: 4
              }
            })
          )
        ),
        // Footer
        h('footer', { style: {
          padding: '12px 18px', borderTop: '1px solid var(--line)',
          display: 'flex', alignItems: 'center', gap: 12
        } },
          h('div', { style: { fontSize: 12, color: 'var(--text-secondary)' } },
            nMatch + ' matched, ' + nSkipped + ' unmatched',
            ' \u2014 saves as a new project, original kept'
          ),
          h('div', { style: { flex: 1 } }),
          h('button', {
            onClick: onClose,
            style: {
              padding: '8px 16px', fontSize: 13,
              background: 'transparent', color: 'var(--text-primary)',
              border: '1px solid var(--border)', borderRadius: 'var(--radius-sm, 4px)',
              cursor: 'pointer'
            }
          }, 'Cancel'),
          h('button', {
            onClick: handleSave,
            disabled: !effectiveProposal || nMatch === 0,
            style: {
              padding: '8px 16px', fontSize: 13, fontWeight: 500,
              background: 'var(--accent)', color: 'var(--surface)',
              border: '1px solid var(--accent)', borderRadius: 'var(--radius-sm, 4px)',
              cursor: nMatch === 0 ? 'not-allowed' : 'pointer',
              opacity: nMatch === 0 ? 0.5 : 1
            }
          }, 'Save adapted copy')
        )
      )
    );
  }
  var thStyle = { padding: '8px 10px', textAlign: 'left', fontWeight: 600, fontSize: 12, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: 0.5 };

  window.AdaptModal = AdaptModal;
})();
