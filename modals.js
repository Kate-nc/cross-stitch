const SharedModals = {
  // [B6] Help is now the unified Help & Shortcuts drawer (help-drawer.js).
  // This shim opens the drawer on mount and immediately closes the modal
  // state so existing call sites (`{modal === 'help' && <SharedModals.Help/>}`)
  // route into the drawer with no further changes required.
  Help: ({ onClose, defaultTab }) => {
    const [showFallback, setShowFallback] = React.useState(false);
    React.useEffect(() => {
      if (window.HelpDrawer && typeof window.HelpDrawer.open === "function") {
        var t = defaultTab;
        var ctx = null, tab = "help";
        if (t === "shortcuts") tab = "shortcuts";
        else if (t === "creator") { ctx = "creator"; tab = "help"; }
        else if (t === "tracker") { ctx = "tracker"; tab = "help"; }
        else if (t === "manager") { ctx = "manager"; tab = "help"; }
        window.HelpDrawer.open({ tab: tab, context: ctx });
        if (typeof onClose === "function") onClose();
      } else {
        setShowFallback(true);
      }
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);
    if (!showFallback) return null;
    return React.createElement(window.Overlay, {
      onClose: onClose, variant: 'dialog', maxWidth: 460, labelledBy: 'help-fallback-title'
    },
        React.createElement(window.Overlay.CloseButton, { onClose: onClose }),
        React.createElement('div', { style: { padding: 24 } },
          React.createElement("h3", { id: 'help-fallback-title', style: { marginTop: 0, marginBottom: 12, fontSize: 20, color: "var(--text-primary)" } }, "Help"),
          React.createElement("p", { style: { margin: 0, color: "var(--text-secondary)", fontSize: 14, lineHeight: 1.6 } },
            "The help panel could not be opened. Please reload the page to restore full functionality."
          ),
          React.createElement("div", { style: { marginTop: 16, textAlign: "right" } },
            React.createElement("button", { className: "btn btn-primary", onClick: onClose }, "Close")
          )
        )
    );
  },

  About: ({ onClose }) => {
    return React.createElement(window.Overlay, {
      onClose: onClose,
      variant: 'dialog',
      maxWidth: 500,
      labelledBy: 'about-title'
    },
      React.createElement(window.Overlay.CloseButton, { onClose: onClose }),
      React.createElement('div', { style: { padding: 24 } },
        React.createElement('h3', { id: 'about-title', style: { marginTop: 0, marginBottom: 15, fontSize: 22, color: 'var(--text-primary)' } }, 'About'),
        React.createElement('div', { style: { display: "flex", flexDirection: "column", gap: 16 } },
          React.createElement('p', { style: { margin: 0, color: 'var(--text-secondary)', fontSize: 15, lineHeight: 1.5 } },
            "stitchx is a free, client-side web application designed to help you create and track cross-stitch patterns directly in your browser."
          ),
          React.createElement('p', { style: { margin: 0, color: 'var(--text-secondary)', fontSize: 14, lineHeight: 1.5 } },
            "Because this app runs entirely in your browser, ",
            React.createElement('strong', { style: { color: 'var(--text-primary)' } }, "no images or pattern data are ever uploaded to a server."),
            " Your projects remain private and local to your device."
          ),
          React.createElement('div', { style: { padding: "12px", background: 'var(--surface-secondary)', borderRadius: 8, border: "0.5px solid var(--border)" } },
            React.createElement('h4', { style: { margin: "0 0 8px 0", color: 'var(--text-primary)', fontSize: 14 } }, "Technologies Used:"),
            React.createElement('ul', { style: { margin: 0, paddingLeft: 20, color: 'var(--text-secondary)', fontSize: 13, lineHeight: 1.5 } },
              React.createElement('li', null, "React (UI Framework)"),
              React.createElement('li', null, "jsPDF (PDF Generation)"),
              React.createElement('li', null, "pako (URL Compression)")
            )
          ),
          React.createElement('p', { style: { margin: 0, color: 'var(--text-tertiary)', fontSize: 12, textAlign: "center", marginTop: 10 } },
            "Version " + (window.APP_VERSION || '1.0.0')
          )
        )
      )
    );
  },

  ThreadSelector: ({ onClose, currentSymbol, currentThreadId, onSelect, usedThreads, onSwap, pal }) => {
    const [search, setSearch] = React.useState("");
    const [swapCandidate, setSwapCandidate] = React.useState(null); // thread entry that was "In Use" and clicked

    // PERF (perf-4 #3): wrap usedThreads in a Set so .has() is O(1) instead of
    // .includes() being O(n) on each render of every list row.
    const usedThreadSet = React.useMemo(
      () => new Set(Array.isArray(usedThreads) ? usedThreads : []),
      [usedThreads]
    );

    // We expect DMC to be available globally
    const filteredThreads = React.useMemo(() => {
      if (!DMC) return [];
      const lowerSearch = search.toLowerCase();
      return DMC.filter(t =>
        t.id.toLowerCase().includes(lowerSearch) ||
        t.name.toLowerCase().includes(lowerSearch)
      );
    }, [search]);

    function renderSwapBanner() {
      if (!swapCandidate) return null;
      return React.createElement("div", { style: { margin: "0 0 12px 0", padding: "12px 14px", background: "#FAF5E1", border: "1px solid #E5C97D", borderRadius: 8 } },
        React.createElement("div", { style: { fontSize: 13, fontWeight: 600, color: "#6B461F", marginBottom: 8 } },
          `DMC ${swapCandidate.id} is already assigned to another symbol.`
        ),
        React.createElement("div", { style: { fontSize: 12, color: "var(--text-secondary)", marginBottom: 10 } },
          `Swap the two symbols' colour assignments? Both symbols will keep their shapes — only their thread colours will exchange.`
        ),
        React.createElement("div", { style: { display: "flex", gap: 8 } },
          React.createElement("button", {
            onClick: () => {
              if (onSwap && pal) {
                const conflictingPalEntry = pal.find(p => p.id === swapCandidate.id);
                if (conflictingPalEntry) onSwap(conflictingPalEntry);
              }
            },
            style: { padding: "7px 14px", fontSize: 13, background: "#A06F2D", color: "#fff", border: "none", borderRadius: 6, cursor: "pointer", fontWeight: 600 }
          }, "Swap Colours"),
          React.createElement("button", {
            onClick: () => setSwapCandidate(null),
            style: { padding: "7px 14px", fontSize: 13, background: "var(--surface)", color: "var(--text-secondary)", border: "1px solid var(--border)", borderRadius: 6, cursor: "pointer" }
          }, "Cancel")
        )
      );
    }

    function renderEmptyThreadList() {
      return React.createElement("div", { style: { padding: 20, textAlign: "center" } },
        React.createElement("div", { style: { color: "var(--text-secondary)", fontSize: 14, marginBottom: 12 } }, "No threads found."),
        search.trim() !== "" ? React.createElement("button", {
          onClick: () => {
            if (usedThreadSet.has(search.trim())) {
              alert(`Thread ${search.trim()} is already assigned to another symbol.`);
              return;
            }
            onSelect({
              id: search.trim(),
              name: "Unknown Thread",
              rgb: [200, 200, 200],
              lab: [80, 0, 0]
            });
          },
          style: { padding: "8px 16px", fontSize: 13, background: "var(--accent)", color: "var(--text-on-accent)", border: "none", borderRadius: 6, cursor: "pointer", fontWeight: 500 }
        }, `Use "${search.trim()}" anyway`) : null
      );
    }

    function renderThreadListItem(t) {
      const isCurrent = t.id === currentThreadId;
      const isUsed = usedThreadSet.has(t.id) && !isCurrent;
      const isSwapCandidate = swapCandidate && swapCandidate.id === t.id;
      // Audit batch 2 fix #5: this row is interactive but isn't a native
      // <button>, so Enter/Space don't fire onClick for free. Expose it as
      // role=button + tabIndex=0 and forward keyboard activation manually
      // so the swap-thread list is usable without a pointer.
      const activate = () => {
        if (isUsed) {
          setSwapCandidate(t);
          return;
        }
        onSelect(t);
      };
      return React.createElement("button", {
        key: t.id,
        type: "button",
        onClick: activate,
        style: {
          display: "flex", alignItems: "center", gap: 12, padding: "10px 12px", borderBottom: "1px solid var(--border-subtle)",
          background: isCurrent ? "var(--accent-light)" : isSwapCandidate ? "#FAF5E1" : (isUsed ? "var(--surface-secondary)" : "var(--surface)"),
          cursor: "pointer",
          opacity: 1,
          width: "100%",
          textAlign: "left",
          font: "inherit",
          color: "inherit",
          border: "none",
          borderRadius: 0
        }
      },
        React.createElement("div", { style: { width: 24, height: 24, borderRadius: 4, background: `rgb(${t.rgb[0]},${t.rgb[1]},${t.rgb[2]})`, border: "1px solid var(--line-2)", flexShrink: 0 } }),
        React.createElement("div", { style: { fontWeight: 600, fontSize: 14, minWidth: 60, color: "var(--text-primary)" } }, "DMC " + t.id),
        React.createElement("div", { style: { fontSize: 13, color: "var(--text-secondary)", flex: 1, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" } }, t.name),
        isCurrent && React.createElement("div", { style: { fontSize: 11, fontWeight: 600, color: "var(--accent)", background: "var(--accent-light)", padding: "2px 8px", borderRadius: 10 } }, "Current"),
        isUsed && !isSwapCandidate && React.createElement("div", { style: { fontSize: 11, fontWeight: 600, color: "#A06F2D", background: "#F2E2BE", padding: "2px 8px", borderRadius: 10 } }, "In Use — tap to swap"),
        isSwapCandidate && React.createElement("div", { style: { fontSize: 11, fontWeight: 600, color: "#6B461F", background: "#E5C97D", padding: "2px 8px", borderRadius: 10 } }, "Swap?")
      );
    }

    return React.createElement(window.Overlay, {
      onClose: onClose, variant: 'dialog',
      labelledBy: 'thread-selector-title',
      style: { maxWidth: 500, width: '100%', display: "flex", flexDirection: "column", maxHeight: "80vh" }
    },
        React.createElement(window.Overlay.CloseButton, { onClose: onClose }),
        React.createElement('div', { style: { padding: 24, display: 'flex', flexDirection: 'column', minHeight: 0, flex: 1 } },
        React.createElement("h3", { id: 'thread-selector-title', style: { marginTop: 0, marginBottom: 15, fontSize: 20, color: "#1B1814" } },
          "Choose a different colour for ",
          React.createElement("span", { style: { fontFamily: "monospace", background: "#EFE7D6", padding: "2px 6px", borderRadius: 4, border: "1px solid #E5DCCB" } }, currentSymbol)
        ),

        React.createElement("div", { style: { marginBottom: 15 } },
          React.createElement("input", {
            type: "text",
            placeholder: "Search by DMC code or name...",
            value: search,
            onChange: e => setSearch(e.target.value),
            style: { width: "100%", padding: "10px", borderRadius: 8, border: "1px solid #E5DCCB", fontSize: 14, boxSizing: "border-box" },
            autoFocus: true
          })
        ),

        renderSwapBanner(),

        React.createElement("div", { style: { flex: 1, overflowY: "auto", border: "1px solid #E5DCCB", borderRadius: 8 } },
          filteredThreads.length === 0 ? renderEmptyThreadList() : filteredThreads.map(renderThreadListItem)
        )
      )
    );
  },

  Shortcuts: ({ onClose, page }) => {
    // Auto-generated from window.Shortcuts.list() — single source of truth.
    // Falls back to a tiny static notice if the registry isn't loaded (e.g.
    // shortcuts.js script tag missing).
    const reg = (typeof window !== 'undefined') && window.Shortcuts;
    // Inline confirm state for the destructive "Reset preview preferences"
    // action. Replaces a previous browser confirm() + alert() pair (audit
    // batch 2 fix #1) so the user stays inside the Workshop modal styling
    // and the action is screen-reader-friendly.
    const [resetState, setResetState] = React.useState('idle'); // 'idle' | 'arming' | 'done'

    function kbList(keys) {
      // keys: array of pre-formatted strings (e.g. ['Ctrl+Z', '⌘Z']).
      const out = [];
      keys.forEach((k, i) => {
        if (i > 0) out.push(React.createElement('span', { key: 'sl'+i, style: { margin: '0 3px', color: '#A89E89', fontSize: 10 } }, '/'));
        out.push(React.createElement('kbd', { key: 'k'+i }, k));
      });
      return React.createElement('span', { style: { whiteSpace: 'nowrap' } }, ...out);
    }

    function shRow(keys, desc, key) {
      return React.createElement('div', { key: key, style: { display: 'flex', alignItems: 'baseline', gap: 12, padding: '4px 0', borderBottom: '0.5px solid #EFE7D6' } },
        React.createElement('div', { style: { minWidth: 130, flexShrink: 0 } }, kbList(keys)),
        React.createElement('div', { style: { fontSize: 13, color: '#5C5448' } }, desc)
      );
    }

    function section(title, rows, key) {
      if (!rows.length) return null;
      return React.createElement('div', { key: key, style: { marginBottom: 16 } },
        React.createElement('div', { style: { fontSize: 11, fontWeight: 700, textTransform: 'uppercase', color: '#A89E89', letterSpacing: '0.07em', marginBottom: 6, paddingBottom: 4, borderBottom: '1px solid #E5DCCB' } }, title),
        ...rows
      );
    }

    // Map registered scopes → human-readable section titles. Anything not in
    // the map gets binned into "Other".
    const SECTION_LABELS = {
      'global':                'General',
      'home':                  'Home Screen',
      'creator':               'Pattern Creator',
      'creator.design':        'Pattern Creator',
      'tracker':               'Stitch Tracker',
      'tracker.notedit':       'Stitch Tracker',
      'tracker.view.highlight':'Stitch Tracker — Highlight View',
      'manager':               'Stash Manager'
    };
    // Order in which sections render (others fall to the bottom).
    const SECTION_ORDER = [
      'General',
      'Pattern Creator',
      'Stitch Tracker',
      'Stitch Tracker — Highlight View',
      'Stash Manager',
      'Home Screen',
      'Other'
    ];

    let content;
    if (!reg || typeof reg.list !== 'function') {
      content = React.createElement('p', { style: { color: '#A89E89', fontSize: 13 } },
        'Shortcut registry not loaded — keyboard shortcuts may be unavailable on this page.');
    } else {
      // Show shortcuts whose scope is currently active. The page hint lets
      // the modal scope to a single page even when the registry has more
      // (it doesn't, in practice, but kept defensive).
      const activeScopes = new Set(reg.getActiveScopes ? reg.getActiveScopes() : []);
      const all = reg.list().filter(e => !e.hidden && activeScopes.has(e.scope));
      // Group by section label.
      const groups = {};
      all.forEach(e => {
        const label = SECTION_LABELS[e.scope] || 'Other';
        (groups[label] = groups[label] || []).push(e);
      });
      const sections = SECTION_ORDER.filter(name => groups[name] && groups[name].length).map(name => {
        const rows = groups[name].map((e, i) => {
          const keysArr = Array.isArray(e.keys) ? e.keys : [e.keys];
          const formatted = keysArr.map(k => reg.formatKey ? reg.formatKey(k) : k);
          return shRow(formatted, e.description || e.id, e.id);
        });
        return section(name, rows, name);
      });
      content = sections.length
        ? sections
        : React.createElement('p', { style: { color: '#A89E89', fontSize: 13 } },
            'No shortcuts available in the current view.');
    }

    return React.createElement(window.Overlay, {
      onClose: onClose, variant: 'dialog',
      labelledBy: 'shortcuts-title',
      style: { maxWidth: 460, width: '100%', maxHeight: '80vh', overflowY: 'auto' }
    },
        React.createElement(window.Overlay.CloseButton, { onClose: onClose }),
        React.createElement('div', { style: { padding: 24 } },
        React.createElement('h3', { id: 'shortcuts-title', style: { marginTop: 0, marginBottom: 16, fontSize: 20, color: '#1B1814' } }, 'Keyboard Shortcuts'),
        content,
        React.createElement('p', { style: { margin: '8px 0 0', fontSize: 12, color: '#A89E89', textAlign: 'center' } },
          'Press ', React.createElement('kbd', null, '?'), ' anytime to toggle this panel'
        ),
        React.createElement('div', { style: { marginTop: 16, paddingTop: 12, borderTop: '1px solid #EFE7D6', textAlign: 'center' } },
          resetState === 'idle' && React.createElement('button', {
            onClick: function() { setResetState('arming'); },
            style: { fontSize: 11, color: '#A89E89', background: 'none', border: '1px solid #E5DCCB', borderRadius: 4, padding: '4px 12px', cursor: 'pointer' }
          }, 'Reset preview preferences\u2026'),
          resetState === 'arming' && React.createElement('div', {
            role: 'alertdialog',
            'aria-labelledby': 'shortcuts-reset-msg',
            style: { display: 'flex', flexDirection: 'column', gap: 8, alignItems: 'center', padding: '8px 12px', background: 'var(--surface-secondary)', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)' }
          },
            React.createElement('p', {
              id: 'shortcuts-reset-msg',
              style: { margin: 0, fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.4 }
            }, 'Reset all preview preferences and per-pattern view states to defaults? This cannot be undone.'),
            React.createElement('div', { style: { display: 'flex', gap: 8 } },
              React.createElement('button', {
                onClick: function() {
                  if (typeof UserPrefs !== 'undefined') UserPrefs.reset();
                  setResetState('done');
                },
                style: { fontSize: 11, color: 'var(--surface)', background: 'var(--danger)', border: '1px solid var(--danger)', borderRadius: 4, padding: '4px 12px', cursor: 'pointer', fontWeight: 600 }
              }, 'Reset preferences'),
              React.createElement('button', {
                onClick: function() { setResetState('idle'); },
                style: { fontSize: 11, color: 'var(--text-secondary)', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 4, padding: '4px 12px', cursor: 'pointer' }
              }, 'Cancel')
            )
          ),
          resetState === 'done' && React.createElement('div', {
            role: 'status',
            style: { display: 'flex', flexDirection: 'column', gap: 8, alignItems: 'center', padding: '8px 12px', background: 'var(--success-soft)', border: '1px solid var(--success-soft)', borderRadius: 'var(--radius-sm)' }
          },
            React.createElement('p', {
              style: { margin: 0, fontSize: 12, color: 'var(--success)', fontWeight: 600 }
            }, 'Preferences reset. Reload the page to apply the defaults.'),
            React.createElement('button', {
              onClick: function() { try { location.reload(); } catch (_) { onClose(); } },
              style: { fontSize: 11, color: 'var(--surface)', background: 'var(--accent)', border: '1px solid var(--accent)', borderRadius: 4, padding: '4px 12px', cursor: 'pointer', fontWeight: 600 }
            }, 'Reload now')
          )
        )
        )
    );
  },

};

// ═══ Name Prompt Modal ═══
// Simple modal that asks the user to name their project before the first save.
function NamePromptModal({ defaultName, onConfirm, onCancel }) {
  const [name, setName] = React.useState(defaultName || '');
  const inputRef = React.useRef(null);
  React.useEffect(() => { if (inputRef.current) inputRef.current.select(); }, []);
  const handleSubmit = () => { const trimmed = name.trim(); onConfirm(trimmed || defaultName || 'cross-stitch-project'); };
  // skipWhenEditingTextField is disabled because the only focusable element
  // here is the name input — without this, ESC would be swallowed by the
  // input and the modal could never be dismissed by keyboard.
  return React.createElement(window.Overlay, {
    onClose: onCancel,
    variant: 'dialog',
    maxWidth: 400,
    labelledBy: 'name-prompt-title',
    escapeOptions: { skipWhenEditingTextField: false }
  },
    React.createElement(window.Overlay.CloseButton, { onClose: onCancel }),
    React.createElement('div', { style: { padding: 24 } },
      React.createElement('h3', { id: 'name-prompt-title', style: { marginTop: 0, marginBottom: 12, fontSize: 18, color: 'var(--text-primary)' } }, 'Name Your Project'),
      React.createElement('p', { style: { margin: '0 0 12px', fontSize: 13, color: 'var(--text-secondary)' } }, 'Give your project a name before saving.'),
      React.createElement('input', {
        ref: inputRef, type: 'text', maxLength: 60, value: name,
        'data-autofocus': true,
        onChange: e => setName(e.target.value),
        onKeyDown: e => { if (e.key === 'Enter') handleSubmit(); },
        placeholder: 'e.g. Rose Garden',
        style: { width: '100%', padding: '8px 10px', borderRadius: 6, border: '1px solid var(--border)', fontSize: 14, boxSizing: 'border-box' }
      }),
      React.createElement('div', { style: { display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 16 } },
        React.createElement('button', { onClick: onCancel, style: { padding: '8px 16px', fontSize: 13, borderRadius: 6, border: '1px solid var(--border)', background: 'var(--surface)', cursor: 'pointer' } }, 'Cancel'),
        React.createElement('button', { onClick: handleSubmit, style: { padding: '8px 16px', fontSize: 13, borderRadius: 6, border: 'none', background: 'var(--accent)', color: '#fff', cursor: 'pointer', fontWeight: 600 } }, 'Save')
      )
    )
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// SyncActivityModal — Concept A
// Shows a chronological log of recent sync events (exports, imports, errors,
// pending reviews, permission prompts). Data lives in localStorage as a
// rolling 50-entry ring buffer, written by SyncEngine._logEvent.
// Props:
//   onClose — dismiss the modal
// ─────────────────────────────────────────────────────────────────────────────
function SyncActivityModal({ onClose }) {
  var h = React.createElement;
  var SE = window.SyncEngine;

  function loadEvents() {
    return (SE && SE.getEventLog) ? SE.getEventLog() : [];
  }

  var _events = React.useState(loadEvents);
  var events = _events[0], setEvents = _events[1];
  var _filter = React.useState('all');
  var filter = _filter[0], setFilter = _filter[1];

  // Live-update when new events arrive while the modal is open.
  React.useEffect(function() {
    function refresh() { setEvents(loadEvents()); }
    window.addEventListener('cs:syncEventLogChanged', refresh);
    return function() { window.removeEventListener('cs:syncEventLogChanged', refresh); };
  }, []);

  function timeAgo(iso) {
    if (!iso) return '';
    var diffMs = Date.now() - new Date(iso).getTime();
    if (isNaN(diffMs)) return '';
    var s = Math.round(diffMs / 1000);
    if (s < 60) return 'just now';
    var m = Math.round(s / 60);
    if (m < 60) return m + ' min ago';
    var hr = Math.round(m / 60);
    if (hr < 24) return hr + ' hr ago';
    var d = Math.round(hr / 24);
    if (d < 7) return d + ' day' + (d !== 1 ? 's' : '') + ' ago';
    return new Date(iso).toLocaleDateString();
  }

  var filtered = events.filter(function(e) {
    if (filter === 'all') return true;
    if (filter === 'in') return e.direction === 'in';
    if (filter === 'out') return e.direction === 'out';
    if (filter === 'errors') return /-fail|-error|permission/i.test(e.type);
    return true;
  });

  function handleClear() {
    if (!SE || !SE.clearEventLog) return;
    window.ConfirmDialog.show({
      title: 'Clear activity log?',
      message: 'Clear the sync activity log? This won\u2019t affect your patterns.',
      confirmLabel: 'Clear log',
      danger: true
    }).then(function(ok) {
      if (!ok) return;
      SE.clearEventLog();
      setEvents([]);
    });
  }

  function eventIcon(type) {
    if (/permission/i.test(type)) return Icons.warning ? Icons.warning() : null;
    if (/-fail|-error/i.test(type)) return Icons.warning ? Icons.warning() : null;
    if (type === 'pending-review') return Icons.cloudAlert ? Icons.cloudAlert() : null;
    if (type === 'export-success') return Icons.cloudSync ? Icons.cloudSync() : null;
    if (type === 'import-success') return Icons.cloudCheck ? Icons.cloudCheck() : null;
    return Icons.cloudSync ? Icons.cloudSync() : null;
  }

  function eventTitle(e) {
    var dev = e.deviceName || (e.deviceId ? e.deviceId.slice(0, 12) : 'unknown device');
    var n = e.projectCount;
    switch (e.type) {
      case 'export-success':
        return 'Exported ' + (n != null ? (n + ' pattern' + (n !== 1 ? 's' : '')) : 'sync file') + ' to folder';
      case 'import-success':
        return 'Imported ' + (n || 0) + ' pattern' + ((n || 0) !== 1 ? 's' : '') + ' from ' + dev
          + (e.conflicts ? ' (' + e.conflicts + ' conflict' + (e.conflicts !== 1 ? 's' : '') + ' resolved)' : '');
      case 'pending-review':
        return (n || 0) + ' update' + ((n || 0) !== 1 ? 's' : '') + ' from ' + dev + ' need' + ((n || 0) === 1 ? 's' : '') + ' review';
      case 'export-fail':
        return 'Export failed';
      case 'import-fail':
        return 'Import failed';
      case 'permission-needed':
        return 'Folder permission required';
      case 'watcher-error':
        return 'Sync watcher error';
      default:
        return e.type;
    }
  }

  return h(window.Overlay, {
    onClose: onClose,
    variant: 'dialog',
    className: 'sync-activity-modal',
    labelledBy: 'sync-activity-title',
    dismissOnScrim: true
  },
    h(window.Overlay.CloseButton, { onClose: onClose }),
    h('h3', { id: 'sync-activity-title', className: 'sync-summary-title' },
      Icons.cloudSync ? Icons.cloudSync() : null, ' Sync Activity'
    ),
    h('div', { className: 'sync-activity-filters' },
      ['all', 'in', 'out', 'errors'].map(function(f) {
        var labels = { all: 'All', in: 'Imports', out: 'Exports', errors: 'Errors' };
        return h('button', {
          key: f,
          type: 'button',
          className: 'sync-activity-filter' + (filter === f ? ' is-active' : ''),
          'aria-pressed': String(filter === f),
          onClick: function() { setFilter(f); }
        }, labels[f]);
      })
    ),
    h('div', { className: 'sync-activity-list', role: 'list' },
      filtered.length === 0
        ? h('div', { className: 'sync-activity-empty' },
            events.length === 0
              ? 'No sync activity yet. Activity will appear here once you export or import a sync file.'
              : 'No events match this filter.'
          )
        : filtered.map(function(e) {
            var cls = 'sync-activity-item sync-activity-item--' + e.type;
            if (e.direction) cls += ' sync-activity-item--' + e.direction;
            return h('div', { key: e.id, className: cls, role: 'listitem' },
              h('div', { className: 'sync-activity-icon', 'aria-hidden': 'true' }, eventIcon(e.type)),
              h('div', { className: 'sync-activity-body' },
                h('div', { className: 'sync-activity-title-row' },
                  h('span', { className: 'sync-activity-title' }, eventTitle(e)),
                  h('span', { className: 'sync-activity-time' }, timeAgo(e.ts))
                ),
                e.fileName && h('div', { className: 'sync-activity-meta' }, e.fileName),
                e.message && h('div', { className: 'sync-activity-meta sync-activity-meta--error' }, e.message)
              )
            );
          })
    ),
    h('div', { className: 'sync-summary-actions' },
      h('button', {
        className: 'sync-btn sync-btn--secondary',
        onClick: handleClear,
        disabled: events.length === 0
      }, 'Clear log'),
      h('button', {
        className: 'sync-btn sync-btn--primary',
        onClick: onClose
      }, 'Close')
    ),
    // Phase D — diagnostics footer. Shows session counters from
    // SyncEngine.getDiagnostics so users can confirm the watcher is
    // actually firing without DevTools. Counters reset on reload by design.
    // QW3: wrapped in try/catch so a future getDiagnostics regression
    // (missing field, throw) can't blank the whole activity modal — the
    // log itself is the primary content and must always render.
    (function() {
      try {
        if (typeof window === 'undefined' || !window.SyncEngine || typeof window.SyncEngine.getDiagnostics !== 'function') return null;
        var d = window.SyncEngine.getDiagnostics() || {};
        return h('details', {
          key: 'diag',
          className: 'sync-diagnostics',
          style: { marginTop: 12, fontSize: 12, color: 'var(--text-secondary)' }
        },
          h('summary', { style: { cursor: 'pointer' } }, 'Diagnostics'),
          h('div', { style: { padding: '8px 0', display: 'grid', gridTemplateColumns: 'auto 1fr', gap: '4px 12px' } },
            h('span', null, 'Watcher:'),
            h('span', null, d.watching ? ('on (every ' + Math.round((d.watcherIntervalMs || 0) / 1000) + 's)') : 'off'),
            h('span', null, 'Ticks this session:'),
            h('span', null, String(d.tickCount || 0) + (d.lastTickAt ? ' (last ' + timeAgo(d.lastTickAt) + ')' : '')),
            h('span', null, 'Updates seen:'),
            h('span', null, String(d.updatesSeen || 0)),
            d.tickFailures > 0 && h('span', null, 'Failures:'),
            d.tickFailures > 0 && h('span', { style: { color: 'var(--danger)' } }, String(d.tickFailures) + (d.lastFailureAt ? ' (last ' + timeAgo(d.lastFailureAt) + ')' : '')),
            h('span', null, 'Skipped (hidden):'),
            h('span', null, String(d.skipsHidden || 0)),
            d.skipsNoPermission > 0 && h('span', null, 'Skipped (no perm):'),
            d.skipsNoPermission > 0 && h('span', { style: { color: 'var(--warning)' } }, String(d.skipsNoPermission)),
            d.skipsLockHeld > 0 && h('span', null, 'Skipped (other tab):'),
            d.skipsLockHeld > 0 && h('span', null, String(d.skipsLockHeld))
          )
        );
      } catch (e) {
        try { console.warn('SyncActivityModal: diagnostics render failed', e); } catch (_) {}
        return null;
      }
    })()
  );
}

if (typeof window !== 'undefined') { window.SyncActivityModal = SyncActivityModal; }

// ═══ Edit Project Details Modal ═══
// Lets users rename a project and edit its designer / description from the
// Home dashboard "…" menu or the Tracker overflow menu — anywhere the Creator
// sidebar "Project info" section isn't visible.
//
// Props:
//   projectId   — string ID of the project to edit (used to load+save via
//                 ProjectStorage). Pass null to run in "in-memory only" mode.
//   name        — initial name string
//   designer    — initial designer string (optional)
//   description — initial description string (optional)
//   onSave      — callback({ name, designer, description }) called after a
//                 successful save (or immediately in in-memory mode)
//   onClose     — callback to dismiss the modal without saving
function EditProjectDetailsModal({ projectId, name: initName, designer: initDesigner, description: initDesc, onSave, onClose }) {
  var h = React.createElement;
  var _n = React.useState(initName || '');
  var name = _n[0], setName = _n[1];
  var _d = React.useState(initDesigner || '');
  var designer = _d[0], setDesigner = _d[1];
  var _ds = React.useState(initDesc || '');
  var desc = _ds[0], setDesc = _ds[1];
  var _saving = React.useState(false);
  var saving = _saving[0], setSaving = _saving[1];
  var _err = React.useState(null);
  var err = _err[0], setErr = _err[1];

  var nameRef = React.useRef(null);
  React.useEffect(function() { if (nameRef.current) nameRef.current.select(); }, []);
  // ESC delegated to <Overlay>.

  function handleSave() {
    var trimmedName = (name || '').trim().slice(0, 60);
    if (!trimmedName) { setErr('Please enter a name.'); return; }
    var trimmedDesigner = (designer || '').trim().slice(0, 80);
    var trimmedDesc = (desc || '').trim().slice(0, 300);
    var updated = { name: trimmedName, designer: trimmedDesigner, description: trimmedDesc };

    if (!projectId || typeof ProjectStorage === 'undefined') {
      // In-memory mode: no IDB write needed (caller owns the state)
      onSave(updated);
      return;
    }

    setSaving(true);
    ProjectStorage.get(projectId).then(function(project) {
      if (!project) throw new Error('Project not found.');
      project.name = trimmedName;
      project.designer = trimmedDesigner;
      project.description = trimmedDesc;
      return ProjectStorage.save(project);
    }).then(function() {
      onSave(updated);
    }).catch(function(e) {
      setSaving(false);
      setErr('Could not save: ' + (e && e.message ? e.message : 'Unknown error'));
    });
  }

  var inputStyle = { width: '100%', padding: '8px 10px', borderRadius: 6, border: '1px solid var(--border, #E5DCCB)', fontSize: 14, boxSizing: 'border-box', background: 'var(--surface, #fff)', color: 'var(--text-primary, #1B1814)' };
  var labelStyle = { display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12, fontWeight: 600, color: 'var(--text-secondary, #5C5448)' };

  return h(window.Overlay, {
    onClose: onClose, variant: 'dialog', maxWidth: 420,
    labelledBy: 'edit-proj-title',
    escapeOptions: { skipWhenEditingTextField: false }
  },
      h(window.Overlay.CloseButton, { onClose: onClose }),
      h('div', { style: { padding: 24 } },
      h('h3', { id: 'edit-proj-title', style: { marginTop: 0, marginBottom: 16, fontSize: 18, color: 'var(--text-primary, #1B1814)', display: 'flex', alignItems: 'center', gap: 8 } },
        Icons.pencil(), ' Edit project details'
      ),
      h('div', { style: { display: 'flex', flexDirection: 'column', gap: 14 } },
        h('label', { style: labelStyle },
          'Pattern name',
          h('input', {
            ref: nameRef, type: 'text', maxLength: 60, value: name,
            onChange: function(e) { setName(e.target.value); setErr(null); },
            onKeyDown: function(e) { if (e.key === 'Enter') handleSave(); },
            placeholder: 'e.g. Rose Garden',
            style: inputStyle,
            disabled: saving
          })
        ),
        h('label', { style: labelStyle },
          'Designer (optional)',
          h('input', {
            type: 'text', maxLength: 80, value: designer,
            onChange: function(e) { setDesigner(e.target.value); },
            placeholder: 'Your name or studio',
            style: inputStyle,
            disabled: saving
          })
        ),
        h('label', { style: labelStyle },
          'Description (optional)',
          h('textarea', {
            maxLength: 300, value: desc,
            onChange: function(e) { setDesc(e.target.value); },
            placeholder: 'A short note about this pattern\u2026',
            rows: 3,
            style: Object.assign({}, inputStyle, { resize: 'vertical', fontFamily: 'inherit', lineHeight: 1.5 }),
            disabled: saving
          })
        )
      ),
      err && h('p', { style: { margin: '10px 0 0', fontSize: 12, color: '#A53D3D' } }, err),
      h('div', { style: { display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 18 } },
        h('button', { onClick: onClose, disabled: saving, style: { padding: '8px 16px', fontSize: 13, borderRadius: 6, border: '1px solid var(--border, #E5DCCB)', background: 'var(--surface, #fff)', cursor: 'pointer', color: 'var(--text-primary, #1B1814)' } }, 'Cancel'),
        h('button', { onClick: handleSave, disabled: saving, style: { padding: '8px 16px', fontSize: 13, borderRadius: 6, border: 'none', background: '#B85C38', color: '#fff', cursor: saving ? 'wait' : 'pointer', fontWeight: 600 } }, saving ? 'Saving\u2026' : 'Save')
      )
      )
  );
}

// ═══ ConfirmDialog — imperative styled confirmation modal ═══
// VER-FB-003 — Drop-in replacement for window.confirm() that uses the
// shared Overlay (variant=dialog) so confirmations match the rest of the
// app's visual language and respect focus trap, scrim dismiss, and ESC.
//
// Usage:
//   window.ConfirmDialog.show({ message, title?, confirmLabel?, cancelLabel?, danger? })
//     .then(function (ok) { if (!ok) return; ... });
//
// The Promise resolves to true when the user confirms and false on cancel,
// scrim click, or ESC. Always resolves — never rejects.
(function () {
  if (typeof window === 'undefined') return;
  function ConfirmDialogInner(props) {
    var h = React.createElement;
    var opts = props.opts || {};
    var uid = React.useId();
    var titleId = 'cs-confirm-title-' + uid;
    var confirmRef = React.useRef(null);
    React.useEffect(function () {
      // Focus the destructive/primary button on mount so Enter activates it.
      var t = setTimeout(function () { try { confirmRef.current && confirmRef.current.focus(); } catch (e) {} }, 0);
      return function () { clearTimeout(t); };
    }, []);
    return h(window.Overlay, {
      onClose: props.onCancel, variant: 'dialog', maxWidth: 440,
      labelledBy: titleId
    },
      h(window.Overlay.CloseButton, { onClose: props.onCancel }),
      h('div', { style: { padding: 24 } },
        h('h3', { id: titleId, style: { marginTop: 0, marginBottom: 12, fontSize: 18, color: 'var(--text-primary)' } }, opts.title || 'Are you sure?'),
        h('p', { style: { margin: 0, color: 'var(--text-secondary)', fontSize: 14, lineHeight: 1.5, whiteSpace: 'pre-wrap' } }, opts.message || ''),
        h('div', { style: { display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 20 } },
          h('button', {
            type: 'button',
            onClick: props.onCancel,
            style: { padding: '8px 16px', fontSize: 13, borderRadius: 6, border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text-primary)', cursor: 'pointer' }
          }, opts.cancelLabel || 'Cancel'),
          h('button', {
            ref: confirmRef,
            type: 'button',
            onClick: props.onConfirm,
            style: {
              padding: '8px 16px', fontSize: 13, borderRadius: 6, border: 'none',
              background: opts.danger ? 'var(--danger, #C0392B)' : 'var(--accent)',
              color: '#fff', cursor: 'pointer', fontWeight: 600
            }
          }, opts.confirmLabel || (opts.danger ? 'Delete' : 'Confirm'))
        )
      )
    );
  }
  window.ConfirmDialog = {
    show: function (opts) {
      return new Promise(function (resolve) {
        if (!window.React || !window.ReactDOM || !window.Overlay) {
          // Last-resort fallback when the React shell isn't loaded yet.
          resolve(window.confirm((opts && opts.message) || ''));
          return;
        }
        var host = document.createElement('div');
        document.body.appendChild(host);
        var root = ReactDOM.createRoot ? ReactDOM.createRoot(host) : null;
        var settled = false;
        function cleanup() {
          try { if (root) root.unmount(); else ReactDOM.unmountComponentAtNode(host); } catch (e) {}
          if (host.parentNode) host.parentNode.removeChild(host);
        }
        function done(v) { if (settled) return; settled = true; cleanup(); resolve(v); }
        var el = React.createElement(ConfirmDialogInner, {
          opts: opts || {},
          onConfirm: function () { done(true); },
          onCancel: function () { done(false); }
        });
        if (root) root.render(el); else ReactDOM.render(el, host);
      });
    }
  };
})();

// ═══ SyncPassphrasePrompt — passphrase entry for encrypted sync files ═══
// Mounted on demand when an import path encounters an EncryptionError of
// kind "passphrase_required" or "incorrect_passphrase". The prompt is
// imperative (Promise-based) so the existing import callbacks in
// header.js / home-screen.js can simply await it before retrying. On
// success the resolved value is the passphrase string; on cancel the
// promise resolves to null. Storing the passphrase against
// SyncEngine.setEncryptionPassphrase is the *caller's* responsibility —
// this dialog only collects input.
(function () {
  if (typeof window === 'undefined') return;
  function PromptInner(props) {
    var h = React.createElement;
    var opts = props.opts || {};
    var uid = React.useId();
    var titleId = 'cs-passphrase-title-' + uid;
    var inputRef = React.useRef(null);
    var pw = React.useState('');
    var err = React.useState(opts.error || '');
    React.useEffect(function () {
      var t = setTimeout(function () { try { inputRef.current && inputRef.current.focus(); } catch (e) {} }, 0);
      return function () { clearTimeout(t); };
    }, []);
    function submit() {
      var v = String(pw[0] || '');
      if (!v) { err[1]('Enter your passphrase.'); return; }
      props.onConfirm(v);
    }
    return h(window.Overlay, {
      onClose: props.onCancel, variant: 'dialog', maxWidth: 440,
      labelledBy: titleId
    },
      h(window.Overlay.CloseButton, { onClose: props.onCancel }),
      h('div', { style: { padding: 24 } },
        h('h3', { id: titleId, style: { marginTop: 0, marginBottom: 12, fontSize: 18, color: 'var(--text-primary)' } }, opts.title || 'Encrypted sync file'),
        h('p', { style: { margin: 0, color: 'var(--text-secondary)', fontSize: 14, lineHeight: 1.5 } },
          opts.message || 'This sync file is encrypted. Enter the passphrase used to create it.'),
        opts.deviceName ? h('p', {
          style: { margin: '8px 0 0', color: 'var(--text-secondary)', fontSize: 13 }
        }, 'From device: ', h('strong', null, opts.deviceName)) : null,
        h('div', { style: { marginTop: 16 } },
          h('input', {
            ref: inputRef,
            type: 'password',
            autoComplete: 'current-password',
            placeholder: 'Passphrase',
            value: pw[0],
            onChange: function (e) { pw[1](e.target.value); err[1](''); },
            onKeyDown: function (e) { if (e.key === 'Enter') submit(); },
            style: {
              width: '100%', padding: '10px 12px', fontSize: 14,
              borderRadius: 6, border: '1px solid var(--border)',
              background: 'var(--surface)', color: 'var(--text-primary)',
              boxSizing: 'border-box'
            }
          })
        ),
        err[0] ? h('p', { style: { margin: '8px 0 0', color: 'var(--danger, #C0392B)', fontSize: 13 } }, err[0]) : null,
        h('div', { style: { display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 20 } },
          h('button', {
            type: 'button',
            onClick: props.onCancel,
            style: { padding: '8px 16px', fontSize: 13, borderRadius: 6, border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text-primary)', cursor: 'pointer' }
          }, opts.cancelLabel || 'Cancel'),
          h('button', {
            type: 'button',
            onClick: submit,
            style: {
              padding: '8px 16px', fontSize: 13, borderRadius: 6, border: 'none',
              background: 'var(--accent)', color: '#fff', cursor: 'pointer', fontWeight: 600
            }
          }, opts.confirmLabel || 'Unlock')
        )
      )
    );
  }
  window.SyncPassphrasePrompt = {
    show: function (opts) {
      return new Promise(function (resolve) {
        if (!window.React || !window.ReactDOM || !window.Overlay) {
          var p = window.prompt((opts && opts.message) || 'Sync file passphrase:');
          resolve(p || null);
          return;
        }
        var host = document.createElement('div');
        document.body.appendChild(host);
        var root = ReactDOM.createRoot ? ReactDOM.createRoot(host) : null;
        var settled = false;
        function cleanup() {
          try { if (root) root.unmount(); else ReactDOM.unmountComponentAtNode(host); } catch (e) {}
          if (host.parentNode) host.parentNode.removeChild(host);
        }
        function done(v) { if (settled) return; settled = true; cleanup(); resolve(v); }
        var el = React.createElement(PromptInner, {
          opts: opts || {},
          onConfirm: function (v) { done(v); },
          onCancel: function () { done(null); }
        });
        if (root) root.render(el); else ReactDOM.render(el, host);
      });
    }
  };
})();

// ═══ Sync Review Gate (SCR-062) ═══
// Blocking modal shown when incoming sync data is detected.
// Merges all additive non-conflicting changes silently and presents
// genuine conflicts for binary resolution ("Keep mine" / "Use synced").
// No dismiss/cancel path on auto-trigger. Continue enabled once all
// conflicts resolved (or if none exist).
//
// Mounted via window.SyncReviewGate.open(plan, options).
(function() {
  if (typeof window === 'undefined') return;
  var h = React.createElement;

  // ── Sub-component: conflict card ────────────────────────────────────────
  function SrgConflictCard(props) {
    var conflict = props.conflict;
    var resolution = props.resolution;
    var onResolve = props.onResolve;
    var deviceName = props.deviceName || 'Synced device';

    function ValueBlock(label, value) {
      return h('div', { className: 'srg-value-block' },
        h('div', { className: 'srg-value-label' }, label),
        h('div', { className: 'srg-value-content' }, value)
      );
    }

    var subjectText, subjectSub, localLabel, remoteLabel, localContent, remoteContent;

    if (conflict.type === 'stitch') {
      subjectText = 'Project: ' + conflict.projectName;
      subjectSub = conflict.disagreeCount + (conflict.disagreeCount === 1 ? ' stitch' : ' stitches') + ' in disagreement';
      localLabel = 'This device';
      remoteLabel = 'Synced from ' + deviceName;
      localContent = conflict.localStitchCount + ' stitches done';
      remoteContent = conflict.remoteStitchCount + ' stitches done';
    } else if (conflict.type === 'chart') {
      subjectText = 'Project: ' + conflict.projectName;
      subjectSub = 'Pattern layout differs';
      localLabel = 'This device';
      remoteLabel = 'Synced from ' + deviceName;
      localContent = conflict.localStitchCount + ' stitches done' + (conflict.localUpdatedAt ? ' \u00b7 edited ' + new Date(conflict.localUpdatedAt).toLocaleDateString() : '');
      remoteContent = conflict.remoteStitchCount + ' stitches done' + (conflict.remoteUpdatedAt ? ' \u00b7 edited ' + new Date(conflict.remoteUpdatedAt).toLocaleDateString() : '');
    } else if (conflict.type === 'stash') {
      subjectText = 'Thread: DMC ' + conflict.threadId;
      subjectSub = 'Owned count differs';
      localLabel = 'This device';
      remoteLabel = 'Synced from ' + deviceName;
      localContent = 'Owned: ' + conflict.localOwned;
      remoteContent = 'Owned: ' + conflict.remoteOwned;
    } else if (conflict.type === 'meta') {
      subjectText = 'Project: ' + conflict.projectName;
      subjectSub = (conflict.field === 'name' ? 'Name' : conflict.field === 'state' ? 'Status' : conflict.field) + ' differs';
      localLabel = 'This device';
      remoteLabel = 'Synced from ' + deviceName;
      localContent = conflict.localValue || '(empty)';
      remoteContent = conflict.remoteValue || '(empty)';
    } else if (conflict.type === 'pref') {
      subjectText = 'Setting: ' + conflict.label;
      subjectSub = 'Updated on both devices';
      localLabel = 'This device';
      remoteLabel = 'Synced from ' + deviceName;
      localContent = conflict.localValue || '(not set)';
      remoteContent = conflict.remoteValue || '(not set)';
    } else {
      return null;
    }

    var isResolved = !!resolution;
    var keptLocal = resolution === 'keep-local';
    var keptRemote = resolution === 'keep-remote';

    return h('div', { className: 'srg-conflict-card' + (isResolved ? ' srg-conflict-card--resolved' : '') },
      h('div', { className: 'srg-conflict-subject' },
        h('span', { className: 'srg-conflict-subject-text' }, subjectText),
        h('span', { className: 'srg-conflict-subject-sub' }, subjectSub)
      ),
      h('div', { className: 'srg-conflict-sides' },
        ValueBlock(localLabel, localContent),
        h('div', { className: 'srg-conflict-vs' }, 'vs'),
        ValueBlock(remoteLabel, remoteContent)
      ),
      h('div', { className: 'srg-conflict-choices' },
        h('button', {
          type: 'button',
          className: 'srg-choice-btn' + (keptLocal ? ' srg-choice-btn--chosen' : ''),
          'aria-pressed': keptLocal ? 'true' : 'false',
          onClick: function() { onResolve('keep-local'); }
        }, keptLocal ? h(React.Fragment, null, Icons.check(), ' Keep mine') : 'Keep mine'),
        h('button', {
          type: 'button',
          className: 'srg-choice-btn' + (keptRemote ? ' srg-choice-btn--chosen' : ''),
          'aria-pressed': keptRemote ? 'true' : 'false',
          onClick: function() { onResolve('keep-remote'); }
        }, keptRemote ? h(React.Fragment, null, Icons.check(), ' Use synced') : 'Use synced')
      ),
      isResolved && h('div', { className: 'srg-resolution-badge' },
        Icons.check(), ' ', keptLocal ? 'Mine kept' : 'Synced used'
      )
    );
  }

  // ── Main SyncReviewGate component ────────────────────────────────────────
  function SyncReviewGateInner(props) {
    var initialPlan = props.plan;
    var autoTrigger = !!props.autoTrigger;
    var onDone = props.onDone;   // callback after Continue pressed + merge complete

    // Plan can be supplied by the caller OR discovered at mount time by
    // querying the SyncEngine pending-plan cache and (if necessary)
    // rescanning the watch folder. See reports/sync-reference fix #2.
    var _resolvedPlan = React.useState(initialPlan || null);
    var plan = _resolvedPlan[0], setPlan = _resolvedPlan[1];

    var _gateState = React.useState(null);
    var gateState = _gateState[0], setGateState = _gateState[1];
    var _resolutions = React.useState({});
    var resolutions = _resolutions[0], setResolutions = _resolutions[1];
    var _applying = React.useState(false);
    var applying = _applying[0], setApplying = _applying[1];
    var _error = React.useState(null);
    var error = _error[0], setError = _error[1];
    var autoDismissRef = React.useRef(null);

    React.useEffect(function() {
      var cancelled = false;

      // Resolve a plan: caller-supplied → engine pending-plan cache →
      // rescan the watch folder. Only the last step is async.
      function resolvePlan() {
        if (initialPlan) return Promise.resolve(initialPlan);
        if (typeof SyncEngine === 'undefined') return Promise.resolve(null);
        // Try the in-memory cache first; if empty, hydrate from IDB
        // (sync-reference fix #3) so a fresh page load can surface the
        // last pending plan before the watcher's next tick.
        var cached = (typeof SyncEngine.getPendingPlan === 'function')
          ? SyncEngine.getPendingPlan() : null;
        var cacheP = cached ? Promise.resolve(cached)
          : (typeof SyncEngine.hydratePendingPlan === 'function'
              ? SyncEngine.hydratePendingPlan().catch(function () { return null; })
              : Promise.resolve(null));
        return cacheP.then(function (cachedOrHydrated) {
          if (cachedOrHydrated) return cachedOrHydrated;
          // No cached plan — try a folder rescan if we have a watch dir.
          // This is the key behavioural change in fix #2: the gate is no
          // longer a passive read of in-memory state.
          if (typeof SyncEngine.getWatchDirectory !== 'function') return null;
          return SyncEngine.getWatchDirectory().then(function(handle) {
            if (!handle) return null;
            // Permission gate — checkForUpdates calls scanFolder which
            // requires read permission. queryPermission is non-prompting.
            if (typeof handle.queryPermission === 'function') {
              return handle.queryPermission({ mode: 'read' }).then(function(p) {
                if (p !== 'granted') return null;
                return SyncEngine.checkForUpdates(handle);
              });
            }
            return SyncEngine.checkForUpdates(handle);
          }).then(function(updates) {
            if (!updates || !updates.length) return null;
            // Take the most recent update; prepareImport into a plan.
            var latest = updates[updates.length - 1];
            // Encrypted-envelope retry loop. The folder watcher pushes
            // _processFolderUpdates failures into the pending queue with
            // errorCode set so we can intercept here, prompt for the
            // passphrase, and re-run prepareImport without re-reading
            // the file.
            function tryPrepare() {
              return SyncEngine.prepareImport(latest.syncObj).catch(function (err) {
                var code = err && err.code;
                if (code === 'passphrase_required' || code === 'incorrect_passphrase') {
                  if (!window.SyncPassphrasePrompt) throw err;
                  return window.SyncPassphrasePrompt.show({
                    title: 'Encrypted sync file',
                    message: code === 'incorrect_passphrase'
                      ? 'That passphrase didn\u2019t unlock the file. Try again.'
                      : 'A new sync file was found, but it is encrypted. Enter the passphrase to review it.',
                    deviceName: (latest.syncObj && latest.syncObj._deviceName) || ''
                  }).then(function (pw) {
                    if (!pw) throw err;
                    try { SyncEngine.setEncryptionPassphrase(pw); } catch (_) {}
                    return tryPrepare();
                  });
                }
                throw err;
              });
            }
            return tryPrepare().then(function(p) {
              if (p) {
                p._fileName = latest.fileName || null;
                p._fileLastModified = latest.lastModified || null;
              }
              return p;
            });
          });
        }).catch(function(e) {
          // Resolve failures are not fatal — fall through to the empty
          // state. Surface in console for debugging.
          try { console.warn('SyncReviewGate resolvePlan failed:', e); } catch (_) {}
          return null;
        });
      }

      resolvePlan().then(function(resolved) {
        if (cancelled) return;
        if (!resolved) {
          // Disambiguate the empty state by capturing what we know about
          // the watch folder. See reports/sync-reference fix #4.
          var ctx = { noPlan: true, hasWatchDir: false, folderName: null, permission: null };
          if (typeof SyncEngine !== 'undefined' && typeof SyncEngine.getWatchDirectory === 'function') {
            SyncEngine.getWatchDirectory().then(function(handle) {
              if (cancelled) return;
              if (!handle) { setGateState(ctx); return; }
              ctx.hasWatchDir = true;
              ctx.folderName = handle.name || null;
              if (typeof handle.queryPermission === 'function') {
                handle.queryPermission({ mode: 'read' }).then(function(p) {
                  if (cancelled) return;
                  ctx.permission = p || null;
                  setGateState(ctx);
                }).catch(function() { if (!cancelled) setGateState(ctx); });
              } else {
                setGateState(ctx);
              }
            }).catch(function() { if (!cancelled) setGateState(ctx); });
          } else {
            setGateState(ctx);
          }
          return;
        }
        if (resolved !== plan) setPlan(resolved);
        // Pre-analysis: flush state and read snapshot
        return Promise.resolve().then(function() {
          if (typeof SyncEngine !== 'undefined' && SyncEngine.readSnapshot) {
            return SyncEngine.readSnapshot();
          }
          return null;
        }).then(function(snapshot) {
          if (cancelled) return;
          var analysis = (typeof SyncEngine !== 'undefined' && SyncEngine.analyseConflicts)
            ? SyncEngine.analyseConflicts(resolved, snapshot)
            : { conflicts: [], stitchSummary: { totalAdded: 0, affectedProjects: 0 }, stashSummary: { updatedCount: 0 }, metaSummary: { updatedCount: 0 }, prefsSummary: { updatedCount: 0, usedTimestampFallback: false }, noSnapshot: true, hasChanges: !!(resolved.newRemote && resolved.newRemote.length) };
          setGateState(analysis);
          // Auto-dismiss for empty automatic triggers after 2 s
          if (autoTrigger && !analysis.hasChanges && analysis.conflicts.length === 0) {
            autoDismissRef.current = setTimeout(function() {
              if (!cancelled) onDone && onDone({ silent: true });
            }, 2000);
          }
        });
      }).catch(function(e) {
        if (!cancelled) setGateState({ error: (e && e.message) || 'Analysis failed.' });
      });

      return function() {
        cancelled = true;
        if (autoDismissRef.current) clearTimeout(autoDismissRef.current);
      };
    }, []);

    function setResolution(id, val) {
      setResolutions(function(prev) { var n = Object.assign({}, prev); n[id] = val; return n; });
    }

    // Bulk-resolve every conflict to the same side (Phase A). Lets the user
    // decide "keep all of mine" / "use all synced" without clicking each
    // card individually — a real time saver when a sync brings in many
    // small disagreements (e.g. several stitch-count drifts after offline
    // tracking on two devices). Only overwrites unresolved conflicts when
    // `onlyUnresolved` is true so a half-finished review doesn't clobber
    // intentional per-card choices.
    function bulkResolve(val, onlyUnresolved) {
      setResolutions(function(prev) {
        var next = Object.assign({}, prev);
        var list = (gateState && gateState.conflicts) || [];
        for (var i = 0; i < list.length; i++) {
          var c = list[i];
          if (onlyUnresolved && next[c.id]) continue;
          next[c.id] = val;
        }
        return next;
      });
    }

    function handleContinue() {
      if (applying) return;
      // Cancel any pending auto-dismiss
      if (autoDismissRef.current) { clearTimeout(autoDismissRef.current); autoDismissRef.current = null; }
      setApplying(true);
      setError(null);
      // Build conflictResolutions map for executeImport (chart-level conflicts)
      var conflictResMap = {};
      // Build gateResolutions map for executeImport (meta/pref/stitch/stash)
      var gateResMap = {};
      if (gateState && gateState.conflicts) {
        gateState.conflicts.forEach(function(c) {
          var res = resolutions[c.id] || 'keep-local';
          if (c.type === 'chart') {
            conflictResMap[c.id] = res;
          } else {
            // stitch/stash/meta/pref — pass through to executeImport via gateResMap
            gateResMap[c.id] = res;
          }
        });
      }
      // Also pass plan.conflicts (fingerprint-level) resolutions
      if (plan && plan.conflicts) {
        plan.conflicts.forEach(function(entry) {
          if (!conflictResMap[entry.id]) {
            conflictResMap[entry.id] = resolutions['chart:' + entry.id] || resolutions[entry.id] || 'keep-local';
          }
        });
      }

      // Pre-apply stitch conflict resolutions by adjusting the plan's done arrays
      // so that mergeDoneArrays produces the user-chosen result:
      //   keep-remote → use remote.done exactly (null out local.done so union = remote)
      //   keep-local  → use local.done exactly  (null out remote.done so union = local)
      // Object.assign creates a new object so the original entry refs are not mutated.
      // Only the `done` property (a direct scalar/array ref) is replaced with null —
      // no nested object is modified — so a shallow clone is sufficient here.
      if (gateState && gateState.conflicts && plan) {
        gateState.conflicts.forEach(function(c) {
          if (c.type !== 'stitch' || !c.entry) return;
          var res = resolutions[c.id] || 'keep-local';
          var entry = c.entry;
          if (res === 'keep-remote') {
            // Replace entry.local with a new object that has done: null so the
            // union merge falls back entirely to remote.done.
            entry.local = Object.assign({}, entry.local, { done: null });
          } else {
            // keep-local: null out remote's done array so the union returns local.done.
            if (entry.remote && entry.remote.data) {
              entry.remote = Object.assign({}, entry.remote, {
                data: Object.assign({}, entry.remote.data, { done: null })
              });
            }
          }
        });
      }

      // Pre-apply stash conflict resolutions by overriding the merged stash
      // thread owned count with the user's chosen side before IDB write.
      if (gateState && gateState.conflicts && plan && plan.stashMerge && plan.stashMerge.threads) {
        gateState.conflicts.forEach(function(c) {
          if (c.type !== 'stash') return;
          var res = resolutions[c.id] || 'keep-local';
          var thread = plan.stashMerge.threads[c.threadId];
          if (!thread) return;
          thread.owned = (res === 'keep-remote') ? c.remoteOwned : c.localOwned;
        });
      }

      // Execute import → write snapshot → dispatch events → onDone
      Promise.resolve().then(function() {
        if (typeof SyncEngine === 'undefined') return { imported: 0, merged: 0, conflictsResolved: 0, stashUpdated: false };
        return SyncEngine.executeImport(plan, conflictResMap, gateResMap);
      }).then(function(result) {
        // Write snapshot after merge
        var writeP = (typeof SyncEngine !== 'undefined' && SyncEngine.writeSnapshot)
          ? SyncEngine.writeSnapshot() : Promise.resolve();
        return writeP.then(function() { return result; });
      }).then(function(result) {
        // Dispatch events (VER-SYNC-GATE-028, VER-SYNC-GATE-029)
        try { window.dispatchEvent(new CustomEvent('cs:stashChanged')); } catch(_) {}
        try { window.dispatchEvent(new CustomEvent('cs:backupRestored')); } catch(_) {}
        onDone && onDone({ result: result });
      }).catch(function(e) {
        setApplying(false);
        setError(e && e.message ? e.message : 'Sync failed. Please try again.');
      });
    }

    // Loading state
    if (!gateState) {
      return h(window.Overlay, {
        onClose: props.onClose || null,
        variant: 'dialog',
        className: 'srg-modal',
        dismissOnScrim: false,
        labelledBy: 'srg-header',
        'aria-modal': 'true'
      },
        h(window.Overlay.CloseButton, { onClose: props.onClose }),
        h('div', { className: 'srg-body' },
          h('div', { className: 'srg-loading' },
            Icons.spinner && Icons.spinner(), ' Preparing sync review\u2026'
          )
        )
      );
    }

    // No-plan state (manual open with nothing pending). Disambiguated
    // into three sub-states by fix #4 so the user gets actionable copy
    // instead of a one-size-fits-all "import a file" prompt.
    if (gateState.noPlan) {
      var noPlanTitle, noPlanBody;
      if (!gateState.hasWatchDir) {
        noPlanTitle = 'No sync folder connected';
        noPlanBody = 'Connect a sync folder in Preferences \u2192 Sync, or import a .csync file from another device.';
      } else if (gateState.permission && gateState.permission !== 'granted') {
        noPlanTitle = 'Sync folder needs reconnecting';
        noPlanBody = 'The browser dropped permission for "' + (gateState.folderName || 'your sync folder')
          + '". Reopen the sync panel on the home screen to reconnect.';
      } else {
        noPlanTitle = 'You\u2019re up to date';
        noPlanBody = gateState.folderName
          ? 'No new changes in "' + gateState.folderName + '" since your last review.'
          : 'No new changes since your last review.';
      }
      return h(window.Overlay, {
        onClose: props.onClose || null,
        variant: 'dialog',
        className: 'srg-modal',
        dismissOnScrim: true,
        labelledBy: 'srg-header',
        'aria-modal': 'true'
      },
        h(window.Overlay.CloseButton, { onClose: props.onClose }),
        h('div', { className: 'srg-header' },
          Icons.cloudSync && Icons.cloudSync(),
          h('h3', { id: 'srg-header' }, noPlanTitle)
        ),
        h('div', { className: 'srg-body' },
          h('p', { className: 'srg-body-text' }, noPlanBody)
        ),
        h('div', { className: 'srg-footer' },
          h('button', {
            type: 'button',
            className: 'srg-btn srg-btn--primary',
            onClick: props.onClose
          }, 'Close')
        )
      );
    }

    // Error state
    if (gateState.error) {
      return h(window.Overlay, {
        onClose: props.onClose || null,
        variant: 'dialog',
        className: 'srg-modal',
        dismissOnScrim: true,
        labelledBy: 'srg-header',
        'aria-modal': 'true'
      },
        h(window.Overlay.CloseButton, { onClose: props.onClose }),
        h('div', { className: 'srg-header' },
          Icons.warning && Icons.warning(),
          h('h3', { id: 'srg-header' }, 'Sync review failed')
        ),
        h('div', { className: 'srg-body' },
          h('p', { style: { color: 'var(--danger, #C0392B)' } }, gateState.error)
        ),
        h('div', { className: 'srg-footer' },
          h('button', { type: 'button', className: 'srg-btn srg-btn--primary', onClick: props.onClose }, 'Close')
        )
      );
    }

    var deviceName = (plan && plan.summary && plan.summary.deviceName) || 'another device';
    var headerTitle = deviceName ? 'Changes from ' + deviceName : 'Sync Review';
    var createdAt = plan && plan.summary && plan.summary.createdAt;
    var conflicts = gateState.conflicts || [];
    var resolvedCount = conflicts.filter(function(c) { return !!resolutions[c.id]; }).length;
    var allResolved = resolvedCount === conflicts.length;
    var canContinue = allResolved && !applying;

    // "Up to date" empty state
    if (!gateState.hasChanges && conflicts.length === 0) {
      return h(window.Overlay, {
        onClose: null,
        variant: 'dialog',
        className: 'srg-modal',
        dismissOnScrim: false,
        labelledBy: 'srg-header',
        'aria-modal': 'true'
      },
        h('div', { className: 'srg-header' },
          Icons.cloudSync && Icons.cloudSync(),
          h('h3', { id: 'srg-header', className: 'srg-header-title' }, headerTitle)
        ),
        h('div', { className: 'srg-body' },
          h('div', { className: 'srg-empty-state' },
            h('div', { className: 'srg-empty-icon' }, Icons.check && Icons.check()),
            h('div', { className: 'srg-empty-heading' }, "You're up to date"),
            h('p', { className: 'srg-empty-body' }, 'Nothing has changed since your last sync.')
          )
        ),
        h('div', { className: 'srg-footer' },
          h('button', {
            type: 'button',
            className: 'srg-btn srg-btn--primary',
            autoFocus: true,
            onClick: function() {
              if (autoDismissRef.current) { clearTimeout(autoDismissRef.current); autoDismissRef.current = null; }
              onDone && onDone({ silent: true });
            }
          }, 'Continue')
        )
      );
    }

    return h(window.Overlay, {
      onClose: null,
      variant: 'dialog',
      className: 'srg-modal',
      dismissOnScrim: false,
      labelledBy: 'srg-header',
      'aria-modal': 'true'
    },
      // Header
      h('div', { className: 'srg-header' },
        Icons.cloudSync && Icons.cloudSync(),
        h('div', null,
          h('h3', { id: 'srg-header', className: 'srg-header-title' }, headerTitle),
          createdAt && createdAt !== 'unknown' && h('div', { className: 'srg-header-sub' },
            'Synced on ' + new Date(createdAt).toLocaleString()
          )
        )
      ),

      // Scrollable body
      h('div', { className: 'srg-body' },

        // No-snapshot notice
        gateState.noSnapshot && h('div', { className: 'srg-notice' },
          Icons.info && Icons.info(), ' No sync history found on this device \u2014 changes merged conservatively.'
        ),

        // ── Summary section ──────────────────────────────────────────────
        (gateState.stitchSummary.totalAdded > 0 || gateState.stashSummary.updatedCount > 0 || gateState.metaSummary.updatedCount > 0 || gateState.prefsSummary.updatedCount > 0 || (plan && plan.newRemote && plan.newRemote.length > 0)) && h('div', { className: 'srg-section' },
          h('div', { className: 'srg-section-heading' }, 'Applied automatically'),

          plan && plan.newRemote && plan.newRemote.length > 0 && h('div', { className: 'srg-summary-row' },
            h('span', { className: 'srg-summary-icon' }, Icons.folder && Icons.folder()),
            h('span', null, plan.newRemote.length + ' new project' + (plan.newRemote.length !== 1 ? 's' : '') + ' added')
          ),

          gateState.stitchSummary.totalAdded > 0 && h('div', { className: 'srg-summary-row' },
            h('span', { className: 'srg-summary-icon' }, Icons.needle && Icons.needle()),
            h('span', null,
              gateState.stitchSummary.totalAdded + ' stitch' + (gateState.stitchSummary.totalAdded !== 1 ? 'es' : '') +
              ' added across ' + gateState.stitchSummary.affectedProjects + ' project' + (gateState.stitchSummary.affectedProjects !== 1 ? 's' : '')
            )
          ),

          gateState.stashSummary.updatedCount > 0 && h('div', { className: 'srg-summary-row' },
            h('span', { className: 'srg-summary-icon' }, Icons.thread && Icons.thread()),
            h('span', null,
              gateState.stashSummary.updatedCount + ' thread count' + (gateState.stashSummary.updatedCount !== 1 ? 's' : '') + ' updated'
            )
          ),

          gateState.metaSummary.updatedCount > 0 && h('div', { className: 'srg-summary-row' },
            h('span', { className: 'srg-summary-icon' }, Icons.folder && Icons.folder()),
            h('span', null,
              gateState.metaSummary.updatedCount + ' project' + (gateState.metaSummary.updatedCount !== 1 ? 's' : '') + ' updated (name / status / completion)'
            )
          ),

          gateState.prefsSummary.updatedCount > 0 && h('div', { className: 'srg-summary-row' },
            h('span', { className: 'srg-summary-icon' }, Icons.gear && Icons.gear()),
            h('span', null,
              gateState.prefsSummary.updatedCount + ' preference' + (gateState.prefsSummary.updatedCount !== 1 ? 's' : '') + ' updated' +
              (gateState.prefsSummary.usedTimestampFallback ? ' (applied by date)' : '')
            )
          )
        ),

        // ── Conflicts section ────────────────────────────────────────────
        conflicts.length > 0 && h('div', { className: 'srg-section srg-conflicts-section' },
          h('div', { className: 'srg-section-divider' }),
          h('div', { className: 'srg-conflicts-header' },
            h('span', { className: 'srg-conflicts-heading' }, 'Resolve conflicts'),
            h('span', {
              className: 'srg-counter-chip' + (allResolved ? ' srg-counter-chip--complete' : ''),
              'aria-live': 'polite'
            }, resolvedCount + ' of ' + conflicts.length + ' resolved')
          ),
          // Phase A bulk-resolution row. Only shown when there are at least
          // two conflicts — for a single conflict the per-card buttons are
          // already a one-click action.
          conflicts.length > 1 && h('div', {
            className: 'srg-bulk-actions',
            style: { display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', marginBottom: 8, fontSize: 12 }
          },
            h('span', { style: { color: 'var(--text-secondary)' } }, 'Bulk resolve:'),
            h('button', {
              type: 'button',
              className: 'srg-btn srg-btn--ghost',
              disabled: applying,
              onClick: function() { if (!applying) bulkResolve('keep-local', false); }
            }, 'Keep all mine'),
            h('button', {
              type: 'button',
              className: 'srg-btn srg-btn--ghost',
              disabled: applying,
              onClick: function() { if (!applying) bulkResolve('keep-remote', false); }
            }, 'Use all synced'),
            resolvedCount < conflicts.length && resolvedCount > 0 && h('button', {
              type: 'button',
              className: 'srg-btn srg-btn--ghost',
              disabled: applying,
              title: 'Apply this side only to conflicts you haven\u2019t already resolved',
              onClick: function() { if (!applying) bulkResolve('keep-remote', true); }
            }, 'Use synced for remaining')
          ),
          conflicts.map(function(c) {
            return h(SrgConflictCard, {
              key: c.id,
              conflict: c,
              resolution: resolutions[c.id] || null,
              deviceName: deviceName,
              onResolve: function(val) { if (!applying) setResolution(c.id, val); }
            });
          })
        ),

        error && h('div', { className: 'srg-error-row' }, Icons.warning && Icons.warning(), ' ', error)
      ),

      // Footer
      h('div', { className: 'srg-footer' },
        h('button', {
          type: 'button',
          className: 'srg-btn srg-btn--primary' + (applying ? ' srg-btn--applying' : ''),
          'aria-disabled': canContinue ? 'false' : 'true',
          title: canContinue ? undefined : 'Resolve all conflicts above to continue',
          onClick: canContinue ? handleContinue : undefined
        },
          applying
            ? h(React.Fragment, null, Icons.spinner && Icons.spinner(), ' Applying\u2026')
            : 'Continue'
        )
      )
    );
  }

  // ── Public API: window.SyncReviewGate ────────────────────────────────────
  var _gateRoot = null;
  var _gateHost = null;

  window.SyncReviewGate = {
    // Open the gate. plan = prepareImport plan or null.
    // options: { autoTrigger: bool }
    open: function(plan, options) {
      var opts = options || {};
      var autoTrigger = !!opts.autoTrigger;

      // Find or create the mount node
      var mountNode = document.getElementById('sync-review-gate-root');
      if (!mountNode) {
        // Fallback: create a temporary host
        mountNode = document.createElement('div');
        mountNode.id = 'sync-review-gate-root';
        document.body.appendChild(mountNode);
      }

      // Unmount any existing instance first
      try {
        if (_gateRoot) { _gateRoot.unmount(); _gateRoot = null; }
        else if (_gateHost) { ReactDOM.unmountComponentAtNode(_gateHost); }
      } catch (_) {}
      _gateHost = mountNode;

      function dismiss(result) {
        try {
          if (_gateRoot) { _gateRoot.unmount(); _gateRoot = null; }
          else { ReactDOM.unmountComponentAtNode(mountNode); }
        } catch (_) {}
        // Show success toast when a real merge happened
        if (result && result.result) {
          var r = result.result;
          var parts = [];
          if (r.imported > 0) parts.push(r.imported + ' imported');
          if (r.merged > 0) parts.push(r.merged + ' merged');
          if (r.conflictsResolved > 0) parts.push(r.conflictsResolved + ' resolved');
          if (r.stashUpdated) parts.push('stash updated');
          var msg = 'Sync complete \u2014 ' + (parts.join(', ') || 'no changes') + '.';
          if (window.Toast) window.Toast.show({ message: msg, type: 'success', duration: 5000 });
        }
      }

      var el = React.createElement(SyncReviewGateInner, {
        plan: plan,
        autoTrigger: autoTrigger,
        onDone: dismiss,
        onClose: plan ? null : dismiss.bind(null, null)
      });

      if (ReactDOM.createRoot) {
        _gateRoot = ReactDOM.createRoot(mountNode);
        _gateRoot.render(el);
      } else {
        ReactDOM.render(el, mountNode);
      }
    }
  };
})();
