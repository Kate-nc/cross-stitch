/* creator/PrepareTab.js — Prepare tab: shopping list + fabric calculator.
   Reads from CreatorContext. Loaded as a plain <script> before the main Babel script.
   Depends on: buildThreadShoppingRows (useCreatorState.js), stitchesToSkeins (threadCalc.js), FABRIC_COUNTS (constants.js),
               StashBridge (stash-bridge.js), CreatorContext (context.js) */

window.CreatorPrepareTab = function CreatorPrepareTab() {
  var ctx = window.usePatternData();
  var app = window.useApp();
  var h = React.createElement;

  var useState = React.useState;
  var useMemo = React.useMemo;

  var _units = useState('in'); var units = _units[0]; var setUnits = _units[1];
  var _margin = useState(3); var margin = _margin[0]; var setMargin = _margin[1];
  var _fabOpen = useState(false); var fabOpen = _fabOpen[0]; var setFabOpen = _fabOpen[1];
  var _sort = useState('number'); var sort = _sort[0]; var setSort = _sort[1];
  var _copied = useState(false); var copied = _copied[0]; var setCopied = _copied[1];
  var _addedAll = useState(false); var addedAll = _addedAll[0]; var setAddedAll = _addedAll[1];
  var threadIdCollator = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' });

  var stash = ctx.globalStash || {};
  var fabricCt = ctx.fabricCt || 14;

  // Shopping rows: one per thread, blends folded into their component threads.
  var rows = useMemo(function() {
    if (!(ctx.pat && ctx.pal)) return [];
    return window.buildThreadShoppingRows(ctx.pal, { fabricCt: fabricCt, stash: stash });
  }, [ctx.pat, ctx.pal, stash, fabricCt]);

  // Sort
  function compareThreadIds(aId, bId) {
    var aStr = String(aId == null ? '' : aId);
    var bStr = String(bId == null ? '' : bId);
    var aIsNumeric = /^\d+$/.test(aStr);
    var bIsNumeric = /^\d+$/.test(bStr);
    if (aIsNumeric && bIsNumeric) {
      var aNum = parseInt(aStr, 10);
      var bNum = parseInt(bStr, 10);
      if (aNum !== bNum) return aNum - bNum;
    } else if (aIsNumeric !== bIsNumeric) {
      return aIsNumeric ? -1 : 1;
    }
    return threadIdCollator.compare(aStr, bStr);
  }

  var sortedRows = useMemo(function() {
    var copy = rows.slice();
    if (sort === 'number') {
      copy.sort(function(a, b) { return compareThreadIds(a.p.id, b.p.id); });
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
  // B3/B4: rendered as a sub-tab inside MaterialsHub.
  if (app.tab !== 'materials' || app.materialsTab !== 'stash') return null;

  // Fabric calculator
  var fabCounts = typeof FABRIC_COUNTS !== 'undefined' ? FABRIC_COUNTS : [
    {ct:11,label:'11 count'},{ct:14,label:'14 count'},{ct:16,label:'16 count'},{ct:18,label:'18 count'}
  ];

  var sW = ctx.sW || 0;
  var sH = ctx.sH || 0;

  // Each fabric at its own stitch-over (FABRIC_COUNTS marks the over-2 ones).
  function calcFab(ct) {
    var d = calcDesignSizeIn(sW, sH, ct, stitchOverFor(ct));
    var wIn = d.widthIn + margin * 2;
    var hIn = d.heightIn + margin * 2;
    if (units === 'cm') return { w: (wIn * 2.54).toFixed(1) + ' cm', h: (hIn * 2.54).toFixed(1) + ' cm' };
    return { w: wIn.toFixed(1) + '"', h: hIn.toFixed(1) + '"' };
  }

  // Copy as text
  function handleCopy() {
    var lines = ['Shopping List'];
    lines.push(sW + '\u00d7' + sH + ' stitches @ ' + fabricShortLabel(fabricCt));
    lines.push('');
    sortedRows.forEach(function(r) {
      var own = r.owned > 0 ? ' (own ' + r.owned + ')' : '';
      var mark = r.status === 'owned' ? '\u2713' : r.status === 'partial' ? '~' : '\u25cb';
      lines.push(mark + ' DMC ' + r.p.id + ' \u2014 ' + r.name + ' \u2014 ' + r.needed + ' skein' + (r.needed !== 1 ? 's' : '') + own);
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
      owned: { label: 'You own this', bg: 'var(--success-soft)', color: 'var(--success)' },
      partial: { label: 'Low stock', bg: '#F8EFD8', color: 'var(--accent-hover)' },
      needed: { label: 'Need to buy', bg: 'var(--danger-soft)', color: 'var(--danger)' }
    };
    var s = map[status] || map.needed;
    return h('span', {
      style: { padding: '2px 8px', borderRadius:'var(--radius-lg)', fontSize: 10, fontWeight: 600,
               background: s.bg, color: s.color }
    }, s.label);
  }

  var canShare = typeof navigator !== 'undefined' && !!navigator.share;

  return h('div', {style: {maxWidth: 900}},
    // Summary banner
    h('div', {style: {
      display: 'flex', alignItems: 'center', gap:'var(--s-3)', flexWrap: 'wrap',
      padding: '10px 14px', background: 'var(--success-soft)', borderRadius:'var(--radius-md)',
      border: '0.5px solid var(--success-soft)', marginBottom:'var(--s-4)', fontSize:'var(--text-sm)'
    }},
      h('span', {style: {fontWeight: 600, color: 'var(--success)', display:'inline-flex', alignItems:'center', gap:4}},
        ownedColours === totalColours
          ? [window.Icons && window.Icons.check ? h('span', {key:'i', 'aria-hidden':'true', style:{display:'inline-flex'}}, window.Icons.check()) : null, 'All ' + totalColours + ' colours in stash!']
          : 'You own ' + ownedColours + ' of ' + totalColours + ' colours.'
      ),
      partialColours > 0 && h('span', {style: {color: 'var(--accent-hover)'}},
        partialColours + ' partial.'
      ),
      (ownedColours < totalColours) && h('span', {style: {color: 'var(--danger)'}},
        'Still need: ' + (totalColours - ownedColours - partialColours) + ' colours, ~' + needSkeins + ' skeins.'
      ),
      h('div', {style: {marginLeft: 'auto', display: 'flex', gap:'var(--s-2)'}},
        h('button', {
          onClick: handleCopy,
          style: { fontSize:'var(--text-xs)', padding: '4px 12px', borderRadius:'var(--radius-sm)', cursor: 'pointer',
                   border: '0.5px solid var(--border)', background: copied ? 'var(--accent)' : 'var(--surface)',
                   color: copied ? 'var(--surface)' : 'var(--text-secondary)', fontWeight: 500,
                   display:'inline-flex', alignItems:'center', gap:4 }
        }, copied ? [window.Icons && window.Icons.check ? h('span', {key:'i', 'aria-hidden':'true', style:{display:'inline-flex'}}, window.Icons.check()) : null, 'Copied'] : 'Copy list'),
        canShare && h('button', {
          onClick: handleShare,
          style: { fontSize:'var(--text-xs)', padding: '4px 12px', borderRadius:'var(--radius-sm)', cursor: 'pointer',
                   border: '0.5px solid var(--border)', background: 'var(--surface)', color: 'var(--text-secondary)', fontWeight: 500 }
        }, 'Share'),
        h('a', {
          href: 'manager.html', target: '_blank',
          style: { fontSize:'var(--text-xs)', padding: '4px 12px', borderRadius:'var(--radius-sm)', cursor: 'pointer',
                   border: '0.5px solid var(--border)', background: 'var(--surface)', color: 'var(--text-secondary)',
                   fontWeight: 500, textDecoration: 'none', display: 'inline-flex', alignItems:'center', gap:4 }
        }, ['View thread stash', window.Icons && window.Icons.chevronRight ? h('span', {key:'a', 'aria-hidden':'true', style:{display:'inline-flex'}}, window.Icons.chevronRight()) : null])
      )
    ),

    // Controls row
    h('div', {style: {display: 'flex', alignItems: 'center', gap: 10, marginBottom:'var(--s-3)', flexWrap: 'wrap'}},
      h('span', {style: {fontSize:'var(--text-sm)', color: 'var(--text-secondary)'}}, 'Sort:'),
      h('select', {
        value: sort,
        onChange: function(e) { setSort(e.target.value); },
        style: { fontSize:'var(--text-xs)', padding: '3px 8px', borderRadius:'var(--radius-sm)', border: '0.5px solid var(--border)', background: 'var(--surface)' }
      },
        h('option', {value: 'number'}, 'Thread number'),
        h('option', {value: 'stitches'}, 'Stitch count'),
        h('option', {value: 'skeins'}, 'Skeins needed'),
        h('option', {value: 'status'}, 'Status')
      ),
      (ownedColours < totalColours) && h('button', {
        onClick: handleAddAll,
        style: { fontSize:'var(--text-xs)', padding: '4px 12px', borderRadius:'var(--radius-sm)', cursor: 'pointer',
                 border: '0.5px solid var(--border)', background: addedAll ? 'var(--accent)' : 'var(--surface)',
                 color: addedAll ? 'var(--surface)' : 'var(--text-secondary)', fontWeight: 500, marginLeft: 'auto',
                 display:'inline-flex', alignItems:'center', gap:4 }
      }, addedAll ? [window.Icons && window.Icons.check ? h('span', {key:'i', 'aria-hidden':'true', style:{display:'inline-flex'}}, window.Icons.check()) : null, 'Added to stash'] : 'Mark all as owned')
    ),

    // Thread table
    h('div', {style: {overflow: 'auto', maxHeight: 480, marginBottom: 20}},
      h('table', {style: {width: '100%', borderCollapse: 'collapse', fontSize:'var(--text-sm)'}},
        h('thead', null,
          h('tr', {style: {background: 'var(--surface-secondary)'}},
            h('th', {style: {padding: '7px 10px', textAlign: 'left', borderBottom: '2px solid var(--border)', color: 'var(--text-secondary)', fontWeight: 600, fontSize:'var(--text-xs)', textTransform: 'uppercase'}}, ''),
            h('th', {style: {padding: '7px 10px', textAlign: 'left', borderBottom: '2px solid var(--border)', color: 'var(--text-secondary)', fontWeight: 600, fontSize:'var(--text-xs)', textTransform: 'uppercase'}}, 'DMC'),
            h('th', {style: {padding: '7px 10px', textAlign: 'left', borderBottom: '2px solid var(--border)', color: 'var(--text-secondary)', fontWeight: 600, fontSize:'var(--text-xs)', textTransform: 'uppercase'}}, 'Name'),
            h('th', {style: {padding: '7px 10px', textAlign: 'right', borderBottom: '2px solid var(--border)', color: 'var(--text-secondary)', fontWeight: 600, fontSize:'var(--text-xs)', textTransform: 'uppercase'}}, 'Stitches'),
            h('th', {style: {padding: '7px 10px', textAlign: 'right', borderBottom: '2px solid var(--border)', color: 'var(--text-secondary)', fontWeight: 600, fontSize:'var(--text-xs)', textTransform: 'uppercase'}}, 'Skeins'),
            h('th', {style: {padding: '7px 10px', textAlign: 'right', borderBottom: '2px solid var(--border)', color: 'var(--text-secondary)', fontWeight: 600, fontSize:'var(--text-xs)', textTransform: 'uppercase'}}, 'In stash'),
            h('th', {style: {padding: '7px 10px', textAlign: 'left', borderBottom: '2px solid var(--border)', color: 'var(--text-secondary)', fontWeight: 600, fontSize:'var(--text-xs)', textTransform: 'uppercase'}}, 'Status')
          )
        ),
        h('tbody', null,
          sortedRows.map(function(r, i) {
            return h('tr', {
              key: r.p.id,
              style: {
                borderBottom: '0.5px solid var(--surface-tertiary)',
                background: r.status === 'owned' ? 'var(--success-soft)' : i % 2 === 0 ? 'transparent' : 'var(--surface-secondary)'
              }
            },
              h('td', {style: {padding: '6px 10px'}},
                h('div', {style: {width: 20, height: 20, borderRadius: 4, background: 'rgb(' + r.p.rgb + ')',
                                  border: '0.5px solid var(--border)', display: 'inline-block'}})
              ),
              h('td', {style: {padding: '6px 10px', fontWeight: 600}}, r.p.id),
              h('td', {style: {padding: '6px 10px', color: 'var(--text-secondary)'}}, r.name),
              h('td', {style: {padding: '6px 10px', textAlign: 'right'}}, r.p.count.toLocaleString()),
              h('td', {style: {padding: '6px 10px', textAlign: 'right', fontWeight: 600}}, r.needed),
              h('td', {style: {padding: '6px 10px', textAlign: 'right', color: r.owned > 0 ? 'var(--success)' : 'var(--text-tertiary)'}},
                r.owned > 0 ? r.owned : '\u2014'
              ),
              h('td', {style: {padding: '6px 10px'}}, statusBadge(r.status))
            );
          })
        )
      )
    ),

    // Fabric calculator (collapsible)
    h('div', {style: {border: '0.5px solid var(--border)', borderRadius:'var(--radius-md)', overflow: 'hidden'}},
      h('button', {
        onClick: function() { setFabOpen(function(o) { return !o; }); },
        style: {
          width: '100%', textAlign: 'left', padding: '10px 14px', fontSize:'var(--text-sm)',
          fontWeight: 600, color: 'var(--text-secondary)', background: 'var(--surface-secondary)', border: 'none',
          cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6
        }
      },
        h('span', {"aria-hidden":"true", style: {display:"inline-flex", opacity: 0.6}}, window.Icons && (fabOpen ? window.Icons.chevronDown : window.Icons.chevronRight) ? (fabOpen ? window.Icons.chevronDown : window.Icons.chevronRight)() : null),
        'Fabric Calculator'
      ),
      fabOpen && h('div', {style: {padding: '14px'}},
        // Controls
        h('div', {style: {display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14, flexWrap: 'wrap'}},
          h('span', {style: {fontSize:'var(--text-sm)', color: 'var(--text-secondary)'}}, 'Margin:'),
          h('input', {
            type: 'number', min: 0, max: 10, step: 0.25, value: margin,
            onChange: function(e) { setMargin(Number(e.target.value) || 0); },
            style: { width: 60, padding: '3px 8px', fontSize:'var(--text-sm)', borderRadius:'var(--radius-sm)', border: '0.5px solid var(--border)' }
          }),
          h('span', {style: {fontSize:'var(--text-sm)', color: 'var(--text-tertiary)'}}, 'inches each side'),
          h('span', {style: {fontSize:'var(--text-sm)', color: 'var(--text-tertiary)'}}, '|'),
          h('span', {style: {fontSize:'var(--text-sm)', color: 'var(--text-secondary)'}}, 'Units:'),
          ['in', 'cm'].map(function(u) {
            return h('button', {
              key: u,
              onClick: function() { setUnits(u); },
              style: {
                fontSize:'var(--text-xs)', padding: '3px 10px', borderRadius:'var(--radius-sm)', cursor: 'pointer',
                border: '0.5px solid ' + (units === u ? 'var(--accent)' : 'var(--border)'),
                background: units === u ? 'var(--accent-light)' : 'var(--surface)',
                color: units === u ? 'var(--accent)' : 'var(--text-secondary)', fontWeight: units === u ? 600 : 400
              }
            }, u === 'in' ? 'Inches' : 'Centimetres');
          })
        ),
        // Table
        h('div', {style: {overflow: 'auto'}},
          h('table', {style: {width: '100%', borderCollapse: 'collapse', fontSize:'var(--text-sm)'}},
            h('thead', null,
              h('tr', {style: {background: 'var(--surface-secondary)'}},
                h('th', {style: {padding: '7px 10px', textAlign: 'left', borderBottom: '2px solid var(--border)', color: 'var(--text-secondary)', fontWeight: 600, fontSize:'var(--text-xs)', textTransform: 'uppercase'}}, 'Count'),
                h('th', {style: {padding: '7px 10px', textAlign: 'right', borderBottom: '2px solid var(--border)', color: 'var(--text-secondary)', fontWeight: 600, fontSize:'var(--text-xs)', textTransform: 'uppercase'}}, 'Width'),
                h('th', {style: {padding: '7px 10px', textAlign: 'right', borderBottom: '2px solid var(--border)', color: 'var(--text-secondary)', fontWeight: 600, fontSize:'var(--text-xs)', textTransform: 'uppercase'}}, 'Height'),
                h('th', {style: {padding: '7px 10px', textAlign: 'left', borderBottom: '2px solid var(--border)', color: 'var(--text-secondary)', fontWeight: 600, fontSize:'var(--text-xs)', textTransform: 'uppercase'}}, '')
              )
            ),
            h('tbody', null,
              fabCounts.map(function(f) {
                var dims = calcFab(f.ct);
                var isCurrent = f.ct === fabricCt;
                return h('tr', {
                  key: f.ct,
                  style: {
                    borderBottom: '0.5px solid var(--surface-tertiary)',
                    background: isCurrent ? 'var(--success-soft)' : 'transparent'
                  }
                },
                  h('td', {style: {padding: '6px 10px', fontWeight: isCurrent ? 700 : 400}},
                    f.label
                  ),
                  h('td', {style: {padding: '6px 10px', textAlign: 'right', fontWeight: 600}}, dims.w),
                  h('td', {style: {padding: '6px 10px', textAlign: 'right', fontWeight: 600}}, dims.h),
                  h('td', {style: {padding: '6px 10px'}},
                    isCurrent && h('span', {style: {fontSize: 10, color: 'var(--accent)', fontWeight: 600, display:'inline-flex', alignItems:'center', gap:3}},
                      window.Icons && window.Icons.chevronLeft ? h('span', {'aria-hidden':'true', style:{display:'inline-flex'}}, window.Icons.chevronLeft()) : null,
                      'current'
                    )
                  )
                );
              })
            )
          )
        ),
        h('p', {style: {fontSize:'var(--text-xs)', color: 'var(--text-tertiary)', marginTop: 10}},
          'Pattern: ' + sW + '\u00d7' + sH + ' stitches. Margin: ' + margin + '" each side.'
        )
      )
    )
  );
};
