/* creator/PrepareTab.js — Prepare tab: shopping list + fabric calculator.
   Reads from CreatorContext. Loaded as a plain <script> before the main Babel script.
   Depends on: stitchesToSkeins (threadCalc.js), FABRIC_COUNTS (constants.js),
               StashBridge (stash-bridge.js), CreatorContext (context.js) */

window.CreatorPrepareTab = function CreatorPrepareTab() {
  var ctx = window.usePatternData();
  var app = window.useApp();
  var h = React.createElement;

  var useState = React.useState;
  var useEffect = React.useEffect;
  var useMemo = React.useMemo;

  var _units = useState('in'); var units = _units[0]; var setUnits = _units[1];
  var _margin = useState(3); var margin = _margin[0]; var setMargin = _margin[1];
  var _overTwo = useState(false); var overTwo = _overTwo[0]; var setOverTwo = _overTwo[1];
  var _fabOpen = useState(false); var fabOpen = _fabOpen[0]; var setFabOpen = _fabOpen[1];
  var _sort = useState('number'); var sort = _sort[0]; var setSort = _sort[1];
  var _copied = useState(false); var copied = _copied[0]; var setCopied = _copied[1];
  var _addedAll = useState(false); var addedAll = _addedAll[0]; var setAddedAll = _addedAll[1];

  var stash = ctx.globalStash || {};
  var fabricCt = ctx.fabricCt || 14;

  // Determine effective stitch count per thread (accounting for over-two)
  var effectiveFabric = overTwo ? fabricCt / 2 : fabricCt;

  // Build shopping list rows — always call useMemo unconditionally
  var rows = useMemo(function() {
    if (!(ctx.pat && ctx.pal)) return [];
    return ctx.pal.map(function(p) {
      var key = 'dmc:' + p.id;
      var stashEntry = stash[key] || {};
      var owned = stashEntry.owned || 0;

      var skResult = (typeof stitchesToSkeins === 'function')
        ? stitchesToSkeins({ stitchCount: p.count, fabricCount: effectiveFabric, strandsUsed: 2 })
        : null;

      var needed;
      if (skResult) {
        if (skResult.colorA) {
          // Blend
          needed = Math.max(skResult.colorA.skeinsToBuy, skResult.colorB.skeinsToBuy);
        } else {
          needed = skResult.skeinsToBuy || 0;
        }
      } else {
        needed = Math.ceil(p.count / 800) || 1;
      }

      var status;
      if (owned >= needed) {
        status = 'owned';
      } else if (owned > 0) {
        status = 'partial';
      } else {
        status = 'needed';
      }

      var name = p.type === 'blend' && p.threads
        ? p.threads[0].name + ' + ' + p.threads[1].name
        : (p.name || p.id);

      return { p: p, key: key, owned: owned, needed: needed, status: status, name: name };
    });
  }, [ctx.pat, ctx.pal, stash, effectiveFabric]);

  // Sort
  var sortedRows = useMemo(function() {
    var copy = rows.slice();
    if (sort === 'number') {
      copy.sort(function(a, b) { return (a.p.id < b.p.id ? -1 : a.p.id > b.p.id ? 1 : 0); });
    } else if (sort === 'stitches') {
      copy.sort(function(a, b) { return b.p.count - a.p.count; });
    } else if (sort === 'skeins') {
      copy.sort(function(a, b) { return b.needed - a.needed; });
    } else if (sort === 'status') {
      var order = { needed: 0, partial: 1, owned: 2 };
      copy.sort(function(a, b) { return order[a.status] - order[b.status]; });
    }
    return copy;
  }, [rows, sort]);

  // Summary
  var totalColours = rows.length;
  var ownedColours = rows.filter(function(r) { return r.status === 'owned'; }).length;
  var partialColours = rows.filter(function(r) { return r.status === 'partial'; }).length;
  var needSkeins = rows.reduce(function(acc, r) {
    return acc + Math.max(0, r.needed - r.owned);
  }, 0);

  // Early returns AFTER all hooks
  if (!(ctx.pat && ctx.pal)) return null;
  if (app.tab !== 'prepare') return null;

  // Fabric calculator
  var fabCounts = typeof FABRIC_COUNTS !== 'undefined' ? FABRIC_COUNTS : [
    {ct:11,label:'11 count'},{ct:14,label:'14 count'},{ct:16,label:'16 count'},{ct:18,label:'18 count'}
  ];

  var sW = ctx.sW || 0;
  var sH = ctx.sH || 0;

  function calcFab(ct, div) {
    var ef = div ? ct / div : ct;
    var wIn = sW / ef + margin * 2;
    var hIn = sH / ef + margin * 2;
    if (units === 'cm') return { w: (wIn * 2.54).toFixed(1) + ' cm', h: (hIn * 2.54).toFixed(1) + ' cm' };
    return { w: wIn.toFixed(1) + '"', h: hIn.toFixed(1) + '"' };
  }

  // Copy as text
  function handleCopy() {
    var lines = ['Shopping List'];
    lines.push(sW + '×' + sH + ' stitches @ ' + fabricCt + ' count' + (overTwo ? ' over two' : ''));
    lines.push('');
    sortedRows.forEach(function(r) {
      var own = r.owned > 0 ? ' (own ' + r.owned + ')' : '';
      var mark = r.status === 'owned' ? '\u2713' : r.status === 'partial' ? '~' : '\u25cb';
      lines.push(mark + ' DMC ' + r.p.id + ' — ' + r.name + ' — ' + r.needed + ' skein' + (r.needed !== 1 ? 's' : '') + own);
    });
    lines.push('');
    lines.push('Total: ' + ownedColours + '/' + totalColours + ' colours owned');
    if (typeof navigator !== 'undefined' && navigator.clipboard) {
      navigator.clipboard.writeText(lines.join('\n')).then(function() {
        setCopied(true);
        setTimeout(function() { setCopied(false); }, 2000);
      }).catch(function() {});
    }
  }

  // Share
  function handleShare() {
    if (typeof navigator === 'undefined' || !navigator.share) return;
    var lines = ['Shopping List \u2014 ' + sW + '\u00d7' + sH + ' @ ' + fabricCt + ' count', ''];
    sortedRows.forEach(function(r) {
      if (r.status !== 'owned') {
        var own = r.owned > 0 ? ' (own ' + r.owned + ')' : '';
        lines.push('DMC ' + r.p.id + ' ' + r.name + ' \u2014 need ' + Math.max(0, r.needed - r.owned) + ' skein' + (Math.max(0, r.needed - r.owned) !== 1 ? 's' : '') + own);
      }
    });
    navigator.share({ title: 'Cross Stitch Shopping List', text: lines.join('\n') }).catch(function() {});
  }

  // Add all to stash
  function handleAddAll() {
    if (typeof StashBridge === 'undefined') return;
    var promises = rows.filter(function(r) { return r.status !== 'owned'; }).map(function(r) {
      var newOwned = r.needed;
      return StashBridge.updateThreadOwned(r.p.id, newOwned);
    });
    Promise.all(promises).then(function() {
      setAddedAll(true);
      setTimeout(function() { setAddedAll(false); }, 2500);
      // Refresh stash
      if (typeof StashBridge !== 'undefined') {
        StashBridge.getGlobalStash().then(function(s) { ctx.setGlobalStash(s); }).catch(function() {});
      }
    }).catch(function() {});
  }

  // Status badge
  function statusBadge(status) {
    var map = {
      owned: { label: 'In stash \u2713', bg: '#f0fdf4', color: '#16a34a' },
      partial: { label: 'Partial', bg: '#fff7ed', color: '#ea580c' },
      needed: { label: 'Need to buy', bg: '#fef2f2', color: '#dc2626' }
    };
    var s = map[status] || map.needed;
    return h('span', {
      style: { padding: '2px 8px', borderRadius: 10, fontSize: 10, fontWeight: 600,
               background: s.bg, color: s.color }
    }, s.label);
  }

  var canShare = typeof navigator !== 'undefined' && !!navigator.share;

  return h('div', {style: {maxWidth: 900}},
    // Summary banner
    h('div', {style: {
      display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap',
      padding: '10px 14px', background: '#f0fdf4', borderRadius: 8,
      border: '0.5px solid #bbf7d0', marginBottom: 16, fontSize: 12
    }},
      h('span', {style: {fontWeight: 600, color: '#15803d'}},
        ownedColours === totalColours
          ? '\u2713 All ' + totalColours + ' colours in stash!'
          : 'You own ' + ownedColours + ' of ' + totalColours + ' colours.'
      ),
      partialColours > 0 && h('span', {style: {color: '#ea580c'}},
        partialColours + ' partial.'
      ),
      (ownedColours < totalColours) && h('span', {style: {color: '#dc2626'}},
        'Still need: ' + (totalColours - ownedColours - partialColours) + ' colours, ~' + needSkeins + ' skeins.'
      ),
      h('div', {style: {marginLeft: 'auto', display: 'flex', gap: 8}},
        h('button', {
          onClick: handleCopy,
          style: { fontSize: 11, padding: '4px 12px', borderRadius: 6, cursor: 'pointer',
                   border: '0.5px solid #e2e8f0', background: copied ? '#0d9488' : '#fff',
                   color: copied ? '#fff' : '#475569', fontWeight: 500 }
        }, copied ? '\u2713 Copied' : 'Copy list'),
        canShare && h('button', {
          onClick: handleShare,
          style: { fontSize: 11, padding: '4px 12px', borderRadius: 6, cursor: 'pointer',
                   border: '0.5px solid #e2e8f0', background: '#fff', color: '#475569', fontWeight: 500 }
        }, 'Share'),
        h('a', {
          href: 'manager.html', target: '_blank',
          style: { fontSize: 11, padding: '4px 12px', borderRadius: 6, cursor: 'pointer',
                   border: '0.5px solid #e2e8f0', background: '#fff', color: '#475569',
                   fontWeight: 500, textDecoration: 'none', display: 'inline-block' }
        }, 'View thread stash \u2192')
      )
    ),

    // Controls row
    h('div', {style: {display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12, flexWrap: 'wrap'}},
      h('label', {style: {fontSize: 12, color: '#475569', display: 'flex', alignItems: 'center', gap: 4}},
        h('input', {
          type: 'checkbox', checked: overTwo,
          onChange: function(e) { setOverTwo(e.target.checked); }
        }),
        'Over two'
      ),
      h('span', {style: {fontSize: 12, color: '#94a3b8'}},'|'),
      h('span', {style: {fontSize: 12, color: '#475569'}}, 'Sort:'),
      h('select', {
        value: sort,
        onChange: function(e) { setSort(e.target.value); },
        style: { fontSize: 11, padding: '3px 8px', borderRadius: 6, border: '0.5px solid #e2e8f0', background: '#fff' }
      },
        h('option', {value: 'number'}, 'Thread number'),
        h('option', {value: 'stitches'}, 'Stitch count'),
        h('option', {value: 'skeins'}, 'Skeins needed'),
        h('option', {value: 'status'}, 'Status')
      ),
      (ownedColours < totalColours) && h('button', {
        onClick: handleAddAll,
        style: { fontSize: 11, padding: '4px 12px', borderRadius: 6, cursor: 'pointer',
                 border: '0.5px solid #e2e8f0', background: addedAll ? '#0d9488' : '#fff',
                 color: addedAll ? '#fff' : '#475569', fontWeight: 500, marginLeft: 'auto' }
      }, addedAll ? '\u2713 Added to stash' : 'Mark all as owned')
    ),

    // Thread table
    h('div', {style: {overflow: 'auto', maxHeight: 480, marginBottom: 20}},
      h('table', {style: {width: '100%', borderCollapse: 'collapse', fontSize: 12}},
        h('thead', null,
          h('tr', {style: {background: '#f8f9fa'}},
            h('th', {style: {padding: '7px 10px', textAlign: 'left', borderBottom: '2px solid #e2e8f0', color: '#475569', fontWeight: 600, fontSize: 11, textTransform: 'uppercase'}}, ''),
            h('th', {style: {padding: '7px 10px', textAlign: 'left', borderBottom: '2px solid #e2e8f0', color: '#475569', fontWeight: 600, fontSize: 11, textTransform: 'uppercase'}}, 'DMC'),
            h('th', {style: {padding: '7px 10px', textAlign: 'left', borderBottom: '2px solid #e2e8f0', color: '#475569', fontWeight: 600, fontSize: 11, textTransform: 'uppercase'}}, 'Name'),
            h('th', {style: {padding: '7px 10px', textAlign: 'right', borderBottom: '2px solid #e2e8f0', color: '#475569', fontWeight: 600, fontSize: 11, textTransform: 'uppercase'}}, 'Stitches'),
            h('th', {style: {padding: '7px 10px', textAlign: 'right', borderBottom: '2px solid #e2e8f0', color: '#475569', fontWeight: 600, fontSize: 11, textTransform: 'uppercase'}}, 'Skeins'),
            h('th', {style: {padding: '7px 10px', textAlign: 'right', borderBottom: '2px solid #e2e8f0', color: '#475569', fontWeight: 600, fontSize: 11, textTransform: 'uppercase'}}, 'In stash'),
            h('th', {style: {padding: '7px 10px', textAlign: 'left', borderBottom: '2px solid #e2e8f0', color: '#475569', fontWeight: 600, fontSize: 11, textTransform: 'uppercase'}}, 'Status')
          )
        ),
        h('tbody', null,
          sortedRows.map(function(r, i) {
            return h('tr', {
              key: r.p.id,
              style: {
                borderBottom: '0.5px solid #f1f5f9',
                background: r.status === 'owned' ? '#f0fdf4' : i % 2 === 0 ? 'transparent' : '#fafafa'
              }
            },
              h('td', {style: {padding: '6px 10px'}},
                h('div', {style: {width: 20, height: 20, borderRadius: 4, background: 'rgb(' + r.p.rgb + ')',
                                  border: '0.5px solid #e2e8f0', display: 'inline-block'}})
              ),
              h('td', {style: {padding: '6px 10px', fontWeight: 600}}, r.p.id),
              h('td', {style: {padding: '6px 10px', color: '#475569'}}, r.name),
              h('td', {style: {padding: '6px 10px', textAlign: 'right'}}, r.p.count.toLocaleString()),
              h('td', {style: {padding: '6px 10px', textAlign: 'right', fontWeight: 600}}, r.needed),
              h('td', {style: {padding: '6px 10px', textAlign: 'right', color: r.owned > 0 ? '#15803d' : '#94a3b8'}},
                r.owned > 0 ? r.owned : '\u2014'
              ),
              h('td', {style: {padding: '6px 10px'}}, statusBadge(r.status))
            );
          })
        )
      )
    ),

    // Fabric calculator (collapsible)
    h('div', {style: {border: '0.5px solid #e2e8f0', borderRadius: 8, overflow: 'hidden'}},
      h('button', {
        onClick: function() { setFabOpen(function(o) { return !o; }); },
        style: {
          width: '100%', textAlign: 'left', padding: '10px 14px', fontSize: 12,
          fontWeight: 600, color: '#475569', background: '#f8f9fa', border: 'none',
          cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6
        }
      },
        h('span', {style: {fontSize: 9, opacity: 0.6}}, fabOpen ? '\u25be' : '\u25b8'),
        'Fabric Calculator'
      ),
      fabOpen && h('div', {style: {padding: '14px'}},
        // Controls
        h('div', {style: {display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14, flexWrap: 'wrap'}},
          h('span', {style: {fontSize: 12, color: '#475569'}}, 'Margin:'),
          h('input', {
            type: 'number', min: 0, max: 10, step: 0.5, value: margin,
            onChange: function(e) { setMargin(Number(e.target.value) || 0); },
            style: { width: 60, padding: '3px 8px', fontSize: 12, borderRadius: 6, border: '0.5px solid #e2e8f0' }
          }),
          h('span', {style: {fontSize: 12, color: '#94a3b8'}}, 'inches each side'),
          h('span', {style: {fontSize: 12, color: '#94a3b8'}}, '|'),
          h('span', {style: {fontSize: 12, color: '#475569'}}, 'Units:'),
          ['in', 'cm'].map(function(u) {
            return h('button', {
              key: u,
              onClick: function() { setUnits(u); },
              style: {
                fontSize: 11, padding: '3px 10px', borderRadius: 6, cursor: 'pointer',
                border: '0.5px solid ' + (units === u ? '#0d9488' : '#e2e8f0'),
                background: units === u ? '#f0fdfa' : '#fff',
                color: units === u ? '#0d9488' : '#475569', fontWeight: units === u ? 600 : 400
              }
            }, u === 'in' ? 'Inches' : 'Centimetres');
          }),
          h('label', {style: {fontSize: 12, color: '#475569', display: 'flex', alignItems: 'center', gap: 4}},
            h('input', {
              type: 'checkbox', checked: overTwo,
              onChange: function(e) { setOverTwo(e.target.checked); }
            }),
            'Over two'
          )
        ),
        // Table
        h('div', {style: {overflow: 'auto'}},
          h('table', {style: {width: '100%', borderCollapse: 'collapse', fontSize: 12}},
            h('thead', null,
              h('tr', {style: {background: '#f8f9fa'}},
                h('th', {style: {padding: '7px 10px', textAlign: 'left', borderBottom: '2px solid #e2e8f0', color: '#475569', fontWeight: 600, fontSize: 11, textTransform: 'uppercase'}}, 'Count'),
                h('th', {style: {padding: '7px 10px', textAlign: 'right', borderBottom: '2px solid #e2e8f0', color: '#475569', fontWeight: 600, fontSize: 11, textTransform: 'uppercase'}}, 'Width'),
                h('th', {style: {padding: '7px 10px', textAlign: 'right', borderBottom: '2px solid #e2e8f0', color: '#475569', fontWeight: 600, fontSize: 11, textTransform: 'uppercase'}}, 'Height'),
                h('th', {style: {padding: '7px 10px', textAlign: 'left', borderBottom: '2px solid #e2e8f0', color: '#475569', fontWeight: 600, fontSize: 11, textTransform: 'uppercase'}}, '')
              )
            ),
            h('tbody', null,
              fabCounts.map(function(f) {
                var dims = calcFab(f.ct, overTwo ? 2 : null);
                var isCurrent = f.ct === fabricCt;
                return h('tr', {
                  key: f.ct,
                  style: {
                    borderBottom: '0.5px solid #f1f5f9',
                    background: isCurrent ? '#f0fdf4' : 'transparent'
                  }
                },
                  h('td', {style: {padding: '6px 10px', fontWeight: isCurrent ? 700 : 400}},
                    f.label + (overTwo ? ' (over 2)' : '')
                  ),
                  h('td', {style: {padding: '6px 10px', textAlign: 'right', fontWeight: 600}}, dims.w),
                  h('td', {style: {padding: '6px 10px', textAlign: 'right', fontWeight: 600}}, dims.h),
                  h('td', {style: {padding: '6px 10px'}},
                    isCurrent && h('span', {style: {fontSize: 10, color: '#0d9488', fontWeight: 600}}, '← current')
                  )
                );
              })
            )
          )
        ),
        h('p', {style: {fontSize: 11, color: '#94a3b8', marginTop: 10}},
          'Pattern: ' + sW + '×' + sH + ' stitches. Margin: ' + margin + '" each side.'
          + (overTwo ? ' Stitching over two threads.' : '')
        )
      )
    )
  );
};
