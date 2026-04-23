/* creator/BulkAddModal.js — Bulk-add threads to the stash
   Two tabs: "Paste list" and "From a kit".
   Unrecognised thread IDs are shown in red with a × button to remove.

   Depends on globals:
     React (CDN), DMC, ANCHOR (optional), STARTER_KITS (starter-kits.js),
     StashBridge (stash-bridge.js), threadKey (helpers.js) */

window.BulkAddModal = (function () {
  const { useState, useMemo, useCallback } = React;

  // ─── Helpers ────────────────────────────────────────────────────────────────

  /**
   * Parse a free-text list of thread IDs.
   * Accepts comma, space, newline, semicolon delimiters.
   * Strips 'DMC', 'Anch', 'Anchor' prefixes (case-insensitive).
   * Returns array of { raw: string, normalised: string } entries.
   */
  function parseBulkThreadList(text, brand) {
    brand = brand || 'dmc';
    return text
      .split(/[\s,;\n]+/)
      .map(function (token) { return token.trim(); })
      .filter(function (token) { return token.length > 0; })
      .map(function (token) {
        // Strip brand prefix
        var clean = token
          .replace(/^anchor\s*/i, '')
          .replace(/^anch\.?\s*/i, '')
          .replace(/^dmc\.?\s*/i, '')
          .replace(/^#/, '');
        return { raw: token, normalised: clean };
      })
      .filter(function (r) { return r.normalised.length > 0; });
  }

  window.parseBulkThreadList = parseBulkThreadList;

  function resolveIds(entries, brand) {
    var arr = brand === 'anchor'
      ? (typeof ANCHOR !== 'undefined' ? ANCHOR : [])
      : (typeof DMC !== 'undefined' ? DMC : []);
    var byId = {};
    arr.forEach(function (t) { byId[t.id] = t; });

    return entries.map(function (e) {
      var thread = byId[e.normalised] || byId[e.normalised.toUpperCase()] || null;
      return { raw: e.raw, normalised: e.normalised, thread: thread, valid: !!thread };
    });
  }

  // ─── Sub-components ─────────────────────────────────────────────────────────

  function ThreadChip({ item, brand, onRemove }) {
    if (!item.valid) {
      return React.createElement('span', {
        style: { display: 'inline-flex', alignItems: 'center', gap: 3, fontSize: 12, padding: '2px 7px', borderRadius: 12, background: '#fee2e2', color: '#b91c1c', border: '1px solid #fca5a5', margin: '2px 3px' }
      },
        React.createElement('span', null, brand === 'anchor' ? 'A' : 'DMC', '\u00a0', item.normalised, '\u00a0\u2014 not found'),
        React.createElement('button', {
          onClick: function () { onRemove(item.raw); },
          style: { background: 'none', border: 'none', color: '#b91c1c', cursor: 'pointer', padding: 0, lineHeight: 1, fontSize: 13, fontWeight: 700, marginLeft: 2 }
        }, '×')
      );
    }
    var swatch = React.createElement('span', {
      style: { width: 12, height: 12, borderRadius: 2, background: 'rgb(' + item.thread.rgb + ')', border: '1px solid rgba(0,0,0,0.12)', flexShrink: 0 }
    });
    return React.createElement('span', {
      style: { display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 12, padding: '2px 7px', borderRadius: 12, background: '#f0fdf4', color: '#166534', border: '1px solid #86efac', margin: '2px 3px' }
    },
      swatch,
      brand === 'anchor' ? 'A' : 'DMC', '\u00a0', item.normalised,
      React.createElement('button', {
        onClick: function () { onRemove(item.raw); },
        style: { background: 'none', border: 'none', color: '#6b7280', cursor: 'pointer', padding: 0, lineHeight: 1, fontSize: 13, fontWeight: 700, marginLeft: 2 }
      }, '×')
    );
  }

  // ─── Main modal ─────────────────────────────────────────────────────────────

  function BulkAddModal({ onClose }) {
    if (typeof window !== 'undefined' && window.useEscape) window.useEscape(onClose);
    var [activeTab, setActiveTab] = useState('paste');  // 'paste' | 'kit'
    var [brand, setBrand] = useState('dmc');
    var [pasteText, setPasteText] = useState('');
    var [removedRaws, setRemovedRaws] = useState([]);   // raw tokens removed by user
    var [kitBrand, setKitBrand] = useState('dmc');
    var [selectedKit, setSelectedKit] = useState('essentials');
    var [kitRemovedIds, setKitRemovedIds] = useState({}); // { normalised: true }
    var [saving, setSaving] = useState(false);
    var [done, setDone] = useState(false);

    // ── Paste tab logic ──────────────────────────────────────────────────────
    var pasteResolved = useMemo(function () {
      var raw = parseBulkThreadList(pasteText, brand);
      var resolved = resolveIds(raw, brand);
      // Remove duplicates by normalised id
      var seen = {};
      return resolved.filter(function (r) {
        if (seen[r.normalised]) return false;
        seen[r.normalised] = true;
        return true;
      }).filter(function (r) { return removedRaws.indexOf(r.raw) === -1; });
    }, [pasteText, brand, removedRaws]);

    function removePasteEntry(rawToken) {
      setRemovedRaws(function (prev) { return prev.concat(rawToken); });
    }

    // ── Kit tab logic ────────────────────────────────────────────────────────
    var kits = typeof STARTER_KITS !== 'undefined' ? (STARTER_KITS[kitBrand] || {}) : {};
    var kitKeys = Object.keys(kits);

    var kitResolved = useMemo(function () {
      var kit = kits[selectedKit];
      if (!kit) return [];
      var arr = kitBrand === 'anchor'
        ? (typeof ANCHOR !== 'undefined' ? ANCHOR : [])
        : (typeof DMC !== 'undefined' ? DMC : []);
      var byId = {};
      arr.forEach(function (t) { byId[t.id] = t; });
      return kit.ids
        .filter(function (id) { return !kitRemovedIds[id]; })
        .map(function (id) {
          var thread = byId[id] || null;
          return { raw: id, normalised: id, thread: thread, valid: !!thread };
        });
    }, [kitBrand, selectedKit, kitRemovedIds]);

    function removeKitEntry(id) {
      setKitRemovedIds(function (prev) { return Object.assign({}, prev, { [id]: true }); });
    }

    // ── Save action ──────────────────────────────────────────────────────────
    async function handleAdd() {
      var items = activeTab === 'paste' ? pasteResolved : kitResolved;
      var validItems = items.filter(function (i) { return i.valid; });
      if (validItems.length === 0) return;
      if (!window.StashBridge) { alert('StashBridge is not available. Make sure stash-bridge.js is loaded.'); return; }

      setSaving(true);
      try {
        var stash = await StashBridge.getGlobalStash();
        var activeBrand = activeTab === 'paste' ? brand : kitBrand;
        for (var i = 0; i < validItems.length; i++) {
          var item = validItems[i];
          var key = typeof threadKey === 'function'
            ? threadKey(activeBrand, item.normalised)
            : (activeBrand + ':' + item.normalised);
          var existing = stash[key] || { owned: 0, tobuy: 0 };
          // Only set to 1 if not already tracked — don't overwrite existing counts
          if (!existing.owned && !existing.tobuy) {
            await StashBridge.updateThreadOwned(key, 1);
          }
        }
        setDone(true);
      } catch (e) {
        console.error('BulkAddModal: save failed', e);
        alert('Failed to save: ' + e.message);
      } finally {
        setSaving(false);
      }
    }

    var activeItems = activeTab === 'paste' ? pasteResolved : kitResolved;
    var validCount = activeItems.filter(function (i) { return i.valid; }).length;
    var invalidCount = activeItems.filter(function (i) { return !i.valid; }).length;

    if (done) {
      return React.createElement('div', { className: 'modal-overlay', onClick: function (e) { if (e.target === e.currentTarget) onClose(); } },
        React.createElement('div', { className: 'modal-box', style: { maxWidth: 440, width: '90vw', padding: '32px 24px', textAlign: 'center' } },
          React.createElement('div', { style: { fontSize: 36, marginBottom: 12 } }, '✓'),
          React.createElement('div', { style: { fontSize: 16, fontWeight: 700, marginBottom: 8 } }, validCount + ' thread' + (validCount === 1 ? '' : 's') + ' added to your stash'),
          React.createElement('button', { className: 'g-btn primary', onClick: onClose }, 'Done')
        )
      );
    }

    return React.createElement('div', { className: 'modal-overlay', onClick: function (e) { if (e.target === e.currentTarget) onClose(); } },
      React.createElement('div', { className: 'modal-box', style: { maxWidth: 560, width: '96vw', maxHeight: '80vh', display: 'flex', flexDirection: 'column' } },
        // Header
        React.createElement('div', { className: 'modal-header' },
          React.createElement('div', { className: 'modal-title' }, 'Bulk Add to Stash'),
          React.createElement('button', { className: 'modal-close', onClick: onClose }, '×')
        ),
        // Tabs
        React.createElement('div', { style: { display: 'flex', borderBottom: '1px solid #e2e8f0', padding: '0 20px' } },
          ['paste', 'kit'].map(function (tab) {
            return React.createElement('button', {
              key: tab,
              onClick: function () { setActiveTab(tab); },
              style: {
                padding: '10px 16px', fontSize: 13, fontWeight: 600, border: 'none', background: 'none', cursor: 'pointer',
                borderBottom: activeTab === tab ? '2px solid #6366f1' : '2px solid transparent',
                color: activeTab === tab ? '#6366f1' : '#64748b'
              }
            }, tab === 'paste' ? 'Paste list' : 'From a kit');
          })
        ),
        // Tab content
        React.createElement('div', { style: { flex: 1, overflowY: 'auto', padding: 20 } },
          activeTab === 'paste' && React.createElement(React.Fragment, null,
            // Brand selector
            React.createElement('div', { style: { display: 'flex', gap: 8, marginBottom: 12, alignItems: 'center' } },
              React.createElement('span', { style: { fontSize: 12, fontWeight: 600, color: '#475569' } }, 'Brand:'),
              ['dmc', 'anchor'].map(function (b) {
                return React.createElement('button', {
                  key: b,
                  className: 'mgr-chip' + (brand === b ? ' on' : ''),
                  onClick: function () { setBrand(b); setPasteText(''); setRemovedRaws([]); }
                }, b === 'anchor' ? 'Anchor' : 'DMC');
              })
            ),
            React.createElement('textarea', {
              placeholder: 'Paste ' + (brand === 'anchor' ? 'Anchor' : 'DMC') + ' thread IDs here, separated by commas, spaces, or new lines.\nExample: 310, 321, blanc, 3865',
              value: pasteText,
              onChange: function (e) { setPasteText(e.target.value); setRemovedRaws([]); },
              rows: 5,
              style: { width: '100%', fontSize: 13, padding: '8px 10px', border: '1px solid #e2e8f0', borderRadius: 6, resize: 'vertical', boxSizing: 'border-box', fontFamily: 'monospace' }
            }),
            pasteResolved.length > 0 && React.createElement('div', { style: { marginTop: 12 } },
              React.createElement('div', { style: { fontSize: 11, color: '#64748b', marginBottom: 6 } },
                validCount + ' valid' + (invalidCount > 0 ? ', ' + invalidCount + ' unrecognised (click × to remove)' : '')
              ),
              pasteResolved.map(function (item) {
                return React.createElement(ThreadChip, { key: item.raw, item: item, brand: brand, onRemove: removePasteEntry });
              })
            )
          ),
          activeTab === 'kit' && React.createElement(React.Fragment, null,
            React.createElement('div', { style: { display: 'flex', gap: 8, marginBottom: 12, alignItems: 'center' } },
              React.createElement('span', { style: { fontSize: 12, fontWeight: 600, color: '#475569' } }, 'Brand:'),
              ['dmc', 'anchor'].map(function (b) {
                return React.createElement('button', {
                  key: b,
                  className: 'mgr-chip' + (kitBrand === b ? ' on' : ''),
                  onClick: function () { setKitBrand(b); setSelectedKit(Object.keys(typeof STARTER_KITS !== 'undefined' ? (STARTER_KITS[b] || {}) : {})[0] || 'essentials'); setKitRemovedIds({}); }
                }, b === 'anchor' ? 'Anchor' : 'DMC');
              })
            ),
            kitKeys.length > 0 && React.createElement('div', { style: { display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 14 } },
              kitKeys.map(function (key) {
                var kit = kits[key];
                return React.createElement('button', {
                  key: key,
                  className: 'mgr-chip' + (selectedKit === key ? ' on' : ''),
                  onClick: function () { setSelectedKit(key); setKitRemovedIds({}); }
                }, kit.label);
              })
            ),
            kitResolved.length > 0 && React.createElement(React.Fragment, null,
              React.createElement('div', { style: { fontSize: 11, color: '#64748b', marginBottom: 6 } },
                validCount + ' threads in this kit' + (invalidCount > 0 ? ', ' + invalidCount + ' unrecognised' : '')
              ),
              React.createElement('div', { style: { lineHeight: 2 } },
                kitResolved.map(function (item) {
                  return React.createElement(ThreadChip, { key: item.raw, item: item, brand: kitBrand, onRemove: removeKitEntry });
                })
              )
            ),
            kitKeys.length === 0 && React.createElement('div', { style: { fontSize: 13, color: '#94a3b8', padding: '24px 0' } }, 'No starter kits available for this brand.')
          )
        ),
        // Footer
        React.createElement('div', { style: { padding: '12px 20px', borderTop: '1px solid #e2e8f0', display: 'flex', gap: 10, justifyContent: 'flex-end', alignItems: 'center' } },
          invalidCount > 0 && React.createElement('span', { style: { fontSize: 12, color: '#f59e0b', marginRight: 'auto' } },
            invalidCount + ' unrecognised thread' + (invalidCount === 1 ? '' : 's') + ' will be skipped'
          ),
          React.createElement('button', { className: 'g-btn', onClick: onClose }, 'Cancel'),
          React.createElement('button', {
            className: 'g-btn primary',
            onClick: handleAdd,
            disabled: saving || validCount === 0
          }, saving ? 'Saving…' : 'Add ' + validCount + ' thread' + (validCount === 1 ? '' : 's'))
        )
      )
    );
  }

  window.BulkAddModal = BulkAddModal;
  return BulkAddModal;
})();
