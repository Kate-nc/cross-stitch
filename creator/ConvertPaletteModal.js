/* creator/ConvertPaletteModal.js — Phase 1 cross-brand palette conversion
   Allows converting the current pattern's DMC palette to Anchor equivalents
   (or vice-versa) using the CONVERSIONS table from thread-conversions.js.

   Depends on globals:
     React (CDN), DMC, ANCHOR, CONVERSIONS, getOfficialMatch (thread-conversions.js),
     dE2000 (colour-utils.js), getThreadByKey, classifyMatch (helpers.js),
     PatternDataContext / usePatternData (context.js) */

window.ConvertPaletteModal = (function () {
  const { useState, useMemo } = React;

  // ─── Core proposal engine ──────────────────────────────────────────────────

  /**
   * For each unique source thread ID in `palette` (bare DMC IDs), produce a
   * conversion proposal to `targetBrand` using:
   *   1. Official mapping from CONVERSIONS table (if available)
   *   2. Nearest-colour fallback via CIEDE2000 ΔE search
   *
   * Returns an array of proposal objects:
   * {
   *   sourceId:    string (bare DMC id, e.g. "310"),
   *   sourceName:  string,
   *   sourceRgb:   [R,G,B],
   *   target: {
   *     id:         string (bare target brand id),
   *     name:       string,
   *     rgb:        [R,G,B],
   *     brand:      'dmc' | 'anchor',
   *     compositeKey: string,
   *     confidence: 'official' | 'reconciled' | 'single-source' | 'nearest',
   *     deltaE:     number,
   *   } | null,
   *   isUnique:    bool (true if no target-brand equivalent exists and ΔE ≥ UNIQUE_THRESHOLD_DE)
   * }
   */
  function proposeConversion(palette, sourceBrand, targetBrand) {
    var srcArr = sourceBrand === 'anchor'
      ? (typeof ANCHOR !== 'undefined' ? ANCHOR : [])
      : (typeof DMC !== 'undefined' ? DMC : []);
    var tgtArr = targetBrand === 'anchor'
      ? (typeof ANCHOR !== 'undefined' ? ANCHOR : [])
      : (typeof DMC !== 'undefined' ? DMC : []);

    var tgtMap = {};
    tgtArr.forEach(function (t) { tgtMap[t.id] = t; });

    var uniqueThresh = typeof UNIQUE_THRESHOLD_DE !== 'undefined' ? UNIQUE_THRESHOLD_DE : 5;
    var distFn = typeof dE2000 === 'function' ? dE2000 : null;

    var proposals = [];

    // Deduplicate source IDs
    var seenIds = {};
    var sourceIds = [];
    palette.forEach(function (cell) {
      if (!cell || !cell.id || cell.id === '__skip__' || cell.id === '__empty__') return;
      // Strip blend IDs (e.g. "310+550") — take first component
      var id = cell.id.indexOf('+') >= 0 ? cell.id.split('+')[0] : cell.id;
      if (!seenIds[id]) { seenIds[id] = true; sourceIds.push(id); }
    });

    sourceIds.forEach(function (srcId) {
      var srcThread = srcArr.find(function (d) { return d.id === srcId; });
      if (!srcThread) return; // unknown ID — skip

      var proposal = {
        sourceId: srcId,
        sourceName: srcThread.name,
        sourceRgb: srcThread.rgb,
        target: null,
        isUnique: false,
      };

      // 1. Try official mapping
      var officialMatch = typeof getOfficialMatch === 'function'
        ? getOfficialMatch(sourceBrand, srcId, targetBrand)
        : null;

      if (officialMatch && tgtMap[officialMatch.id]) {
        var tgt = tgtMap[officialMatch.id];
        var labSrc = srcThread.lab || (typeof rgbToLab === 'function' ? rgbToLab(srcThread.rgb[0], srcThread.rgb[1], srcThread.rgb[2]) : null);
        var labTgt = tgt.lab || (typeof rgbToLab === 'function' ? rgbToLab(tgt.rgb[0], tgt.rgb[1], tgt.rgb[2]) : null);
        var de = distFn && labSrc && labTgt ? distFn(labSrc, labTgt) : 0;
        proposal.target = {
          id: officialMatch.id,
          name: tgt.name,
          rgb: tgt.rgb,
          brand: targetBrand,
          compositeKey: targetBrand + ':' + officialMatch.id,
          confidence: officialMatch.confidence,
          deltaE: Math.round(de * 10) / 10,
        };
        proposals.push(proposal);
        return;
      }

      // 2. Nearest-colour fallback
      if (!distFn || tgtArr.length === 0) {
        proposal.isUnique = true;
        proposals.push(proposal);
        return;
      }

      var labSrc = srcThread.lab || (typeof rgbToLab === 'function' ? rgbToLab(srcThread.rgb[0], srcThread.rgb[1], srcThread.rgb[2]) : null);
      if (!labSrc) { proposal.isUnique = true; proposals.push(proposal); return; }

      var bestDe = Infinity, bestTgt = null;
      tgtArr.forEach(function (t) {
        var labT = t.lab || (typeof rgbToLab === 'function' ? rgbToLab(t.rgb[0], t.rgb[1], t.rgb[2]) : null);
        if (!labT) return;
        var de = distFn(labSrc, labT);
        if (de < bestDe) { bestDe = de; bestTgt = t; }
      });

      if (bestTgt && bestDe < uniqueThresh * 4) {
        proposal.target = {
          id: bestTgt.id,
          name: bestTgt.name,
          rgb: bestTgt.rgb,
          brand: targetBrand,
          compositeKey: targetBrand + ':' + bestTgt.id,
          confidence: 'nearest',
          deltaE: Math.round(bestDe * 10) / 10,
        };
        proposal.isUnique = bestDe >= uniqueThresh;
      } else {
        proposal.isUnique = true;
      }

      proposals.push(proposal);
    });

    return proposals;
  }

  window.proposeConversion = proposeConversion;

  // ─── React UI Component ─────────────────────────────────────────────────────

  function ConfidenceBadge({ confidence }) {
    var colours = {
      official: { bg: '#dcfce7', text: '#166534', label: 'Official' },
      reconciled: { bg: '#fef9c3', text: '#854d0e', label: 'Reconciled' },
      'single-source': { bg: '#fef3c7', text: '#92400e', label: 'Single source' },
      nearest: { bg: '#f1f5f9', text: '#475569', label: 'Nearest colour' },
    };
    var c = colours[confidence] || colours.nearest;
    return React.createElement('span', {
      style: { fontSize: 10, fontWeight: 700, background: c.bg, color: c.text, borderRadius: 4, padding: '1px 5px', whiteSpace: 'nowrap' }
    }, c.label);
  }

  function ConvertPaletteModal({ onClose, onApply }) {
    if (typeof window !== 'undefined' && window.useEscape) window.useEscape(onClose);
    var pd = typeof usePatternData === 'function' ? usePatternData() : null;
    var pattern = pd ? pd.pattern : [];
    var [targetBrand, setTargetBrand] = useState('anchor');
    var [userOverrides, setUserOverrides] = useState({}); // sourceId → target id (bare brand id)
    var [searchQuery, setSearchQuery] = useState('');

    var proposals = useMemo(function () {
      if (!pattern || pattern.length === 0) return [];
      return proposeConversion(pattern, 'dmc', targetBrand);
    }, [pattern, targetBrand]);

    var tgtArr = targetBrand === 'anchor'
      ? (typeof ANCHOR !== 'undefined' ? ANCHOR : [])
      : (typeof DMC !== 'undefined' ? DMC : []);

    var uniqueCount = proposals.filter(function (p) { return p.isUnique && !userOverrides[p.sourceId]; }).length;

    function handleOverrideChange(sourceId, newTargetId) {
      setUserOverrides(function (prev) {
        if (!newTargetId) {
          var next = Object.assign({}, prev);
          delete next[sourceId];
          return next;
        }
        return Object.assign({}, prev, { [sourceId]: newTargetId });
      });
    }

    function handleApply() {
      // Build remap: { [sourceBareId]: { id: targetBareId, brand: targetBrand, rgb, name } }
      var remap = {};
      proposals.forEach(function (p) {
        var overrideId = userOverrides[p.sourceId];
        var effectiveTarget = overrideId
          ? tgtArr.find(function (t) { return t.id === overrideId; })
          : (p.target && tgtArr.find(function (t) { return t.id === p.target.id; }));
        if (effectiveTarget) {
          remap[p.sourceId] = {
            id: effectiveTarget.id,
            brand: targetBrand,
            compositeKey: targetBrand + ':' + effectiveTarget.id,
            name: effectiveTarget.name,
            rgb: effectiveTarget.rgb,
          };
        }
      });
      if (typeof onApply === 'function') onApply(remap);
    }

    var filtered = searchQuery
      ? proposals.filter(function (p) {
          var q = searchQuery.toLowerCase();
          return p.sourceId.includes(q) || p.sourceName.toLowerCase().includes(q)
            || (p.target && (p.target.id.includes(q) || p.target.name.toLowerCase().includes(q)));
        })
      : proposals;

    return React.createElement('div', { className: 'modal-overlay', onClick: function (e) { if (e.target === e.currentTarget) onClose(); } },
      React.createElement('div', { className: 'modal-box', style: { maxWidth: 640, width: '96vw', maxHeight: '80vh', display: 'flex', flexDirection: 'column' } },
        React.createElement('div', { className: 'modal-header' },
          React.createElement('div', { className: 'modal-title' }, 'Change Thread Brand'),
          React.createElement('button', { className: 'modal-close', onClick: onClose }, '×')
        ),
        React.createElement('div', { style: { padding: '12px 20px', borderBottom: '1px solid #e2e8f0', display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' } },
          React.createElement('span', { style: { fontSize: 13, color: '#475569', fontWeight: 600 } }, 'Convert to:'),
          ['anchor', 'dmc'].map(function (brand) {
            return React.createElement('button', {
              key: brand,
              className: 'mgr-chip' + (targetBrand === brand ? ' on' : ''),
              onClick: function () { setTargetBrand(brand); setUserOverrides({}); }
            }, brand === 'anchor' ? 'Anchor' : 'DMC');
          }),
          React.createElement('input', {
            type: 'text',
            placeholder: 'Search…',
            value: searchQuery,
            onChange: function (e) { setSearchQuery(e.target.value); },
            style: { marginLeft: 'auto', padding: '4px 8px', fontSize: 12, border: '1px solid #e2e8f0', borderRadius: 6, width: 140 }
          })
        ),
        uniqueCount > 0 && React.createElement('div', {
          style: { padding: '8px 20px', background: '#fef3c7', borderBottom: '1px solid #fde68a', fontSize: 12, color: '#92400e' }
        }, uniqueCount + ' thread' + (uniqueCount === 1 ? '' : 's') + ' ha' + (uniqueCount === 1 ? 's' : 've') + ' no close equivalent in ' + (targetBrand === 'anchor' ? 'Anchor' : 'DMC') + '. Review and choose substitutes manually.'),
        React.createElement('div', { style: { flex: 1, overflowY: 'auto', padding: '8px 12px' } },
          filtered.length === 0
            ? React.createElement('div', { style: { textAlign: 'center', padding: '32px 16px', color: '#94a3b8', fontSize: 13 } }, 'No threads in the current pattern.')
            : filtered.map(function (p) {
                var overrideId = userOverrides[p.sourceId];
                var effectiveTgt = overrideId
                  ? tgtArr.find(function (t) { return t.id === overrideId; })
                  : p.target && tgtArr.find(function (t) { return t.id === p.target.id; });
                var de = (overrideId && effectiveTgt && p.target) ? null : (p.target ? p.target.deltaE : null);
                var noMatch = !effectiveTgt;

                return React.createElement('div', {
                  key: p.sourceId,
                  style: { display: 'flex', alignItems: 'center', gap: 10, padding: '8px 8px', borderRadius: 6, marginBottom: 4, background: noMatch ? '#fff7ed' : '#f8fafc', border: '1px solid ' + (noMatch ? '#fed7aa' : '#e2e8f0') }
                },
                  // Source swatch + label
                  React.createElement('span', { style: { width: 18, height: 18, borderRadius: 3, background: 'rgb(' + p.sourceRgb + ')', border: '1px solid #cbd5e1', flexShrink: 0 } }),
                  React.createElement('span', { style: { fontSize: 12, fontWeight: 600, width: 80, flexShrink: 0 } }, 'DMC ', p.sourceId),
                  React.createElement('span', { style: { fontSize: 11, color: '#64748b', flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' } }, p.sourceName),
                  React.createElement('span', { style: { color: '#94a3b8', fontSize: 13 } }, '→'),
                  // Target swatch + label (or dropdown)
                  effectiveTgt
                    ? React.createElement(React.Fragment, null,
                        React.createElement('span', { style: { width: 18, height: 18, borderRadius: 3, background: 'rgb(' + effectiveTgt.rgb + ')', border: '1px solid #cbd5e1', flexShrink: 0 } }),
                        React.createElement('span', { style: { fontSize: 12, fontWeight: 600, width: 80, flexShrink: 0, color: targetBrand === 'anchor' ? '#0369a1' : '#333' } },
                          (targetBrand === 'anchor' ? 'Anch ' : 'DMC '), effectiveTgt.id
                        )
                      )
                    : React.createElement('span', { style: { fontSize: 11, color: '#f59e0b', fontWeight: 600 } }, 'No match'),
                  // Confidence badge (only for official proposals, not overrides)
                  !overrideId && p.target && React.createElement(ConfidenceBadge, { confidence: p.target.confidence }),
                  // ΔE
                  de != null && React.createElement('span', { style: { fontSize: 10, color: '#94a3b8', flexShrink: 0 } }, 'ΔE ' + de),
                  // Override select
                  React.createElement('select', {
                    style: { fontSize: 11, padding: '2px 4px', borderRadius: 4, border: '1px solid #e2e8f0', background: '#fff', maxWidth: 90 },
                    value: overrideId || (effectiveTgt ? effectiveTgt.id : ''),
                    onChange: function (e) { handleOverrideChange(p.sourceId, e.target.value || null); }
                  },
                    !effectiveTgt && React.createElement('option', { value: '' }, '— choose —'),
                    tgtArr.slice(0, 500).map(function (t) {
                      return React.createElement('option', { key: t.id, value: t.id }, (targetBrand === 'anchor' ? 'A ' : 'DMC ') + t.id + ' ' + t.name.slice(0, 18));
                    })
                  )
                );
              })
        ),
        React.createElement('div', { style: { padding: '12px 20px', borderTop: '1px solid #e2e8f0', display: 'flex', gap: 10, justifyContent: 'flex-end' } },
          React.createElement('button', { className: 'g-btn', onClick: onClose }, 'Cancel'),
          React.createElement('button', { className: 'g-btn primary', onClick: handleApply, disabled: proposals.length === 0 },
            'Apply Conversion (' + proposals.length + ' threads)'
          )
        )
      )
    );
  }

  window.ConvertPaletteModal = ConvertPaletteModal;
  return ConvertPaletteModal;
})();
