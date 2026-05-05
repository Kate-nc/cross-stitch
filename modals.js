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
            "Cross Stitch Pattern Generator is a free, client-side web application designed to help you create and track cross-stitch patterns directly in your browser."
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
            "Version 1.0.0"
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

// ═══ Sync Summary Modal ═══
// Shows a preview of what will be imported from a .csync file, with conflict
// resolution controls, before committing the sync.
// Props:
//   plan         — object returned by SyncEngine.prepareImport()
//   onApply      — callback(conflictResolutions) when user clicks Apply
//   onCancel     — callback to dismiss
function SyncSummaryModal({ plan, onApply, onCancel }) {
  var h = React.createElement;
  var _res = React.useState({});
  var resolutions = _res[0], setResolutions = _res[1];
  var _applying = React.useState(false);
  var applying = _applying[0], setApplying = _applying[1];

  // Block ESC during apply so the user can't dismiss mid-import.
  // (Routed through <Overlay> via escapeOptions below.)

  function setResolution(id, val) {
    setResolutions(function(prev) {
      var next = Object.assign({}, prev);
      next[id] = val;
      return next;
    });
  }

  var allConflictsResolved = plan.conflicts.every(function(c) {
    return !!resolutions[c.id];
  });

  var canApply = plan.conflicts.length === 0 || allConflictsResolved;
  var hasChanges = plan.newRemote.length > 0 || plan.mergeTracking.length > 0 || plan.conflicts.length > 0 || !!plan.stashMerge;

  function handleApply() {
    if (!canApply || applying) return;
    setApplying(true);
    onApply(resolutions);
  }

  // Summary stat row
  function statBadge(count, label, cls) {
    if (count === 0) return null;
    return h('span', { className: 'sync-stat-badge' + (cls ? ' ' + cls : '') }, count + ' ' + label);
  }

  return h(window.Overlay, {
    onClose: function() { if (!applying) onCancel(); },
    variant: 'dialog',
    className: 'sync-summary-modal',
    labelledBy: 'sync-summary-title',
    dismissOnScrim: !applying
  },
      h(window.Overlay.CloseButton, { onClose: onCancel }),
      h('h3', { id: 'sync-summary-title', className: 'sync-summary-title' },
        Icons.cloudSync(), ' Import Sync File'
      ),

      // Source info
      plan.summary && h('div', { className: 'sync-summary-source' },
        'From ',
        h('strong', null, plan.summary.deviceName || 'Unknown device'),
        plan.summary.createdAt && plan.summary.createdAt !== 'unknown' ? ' \u00b7 ' + new Date(plan.summary.createdAt).toLocaleString() : ''
      ),

      // Stats row
      h('div', { className: 'sync-stats-row' },
        statBadge(plan.newRemote.length, 'new', 'sync-stat-badge--new'),
        statBadge(plan.identical.length, 'identical', 'sync-stat-badge--identical'),
        statBadge(plan.mergeTracking.length, 'merge', 'sync-stat-badge--merge'),
        statBadge(plan.conflicts.length, 'conflict' + (plan.conflicts.length !== 1 ? 's' : ''), 'sync-stat-badge--conflict'),
        plan.stashMerge && h('span', { className: 'sync-stat-badge sync-stat-badge--merge' }, 'stash update')
      ),

      // New projects
      plan.newRemote.length > 0 && h('div', { className: 'sync-section' },
        h('div', { className: 'sync-section-header' }, 'New projects to add'),
        plan.newRemote.map(function(entry) {
          var p = entry.remote.data;
          return h('div', { key: p.id, className: 'sync-project-row' },
            h('span', { className: 'sync-project-name' }, p.name || 'Untitled'),
            h('span', { className: 'sync-project-meta' },
              (p.w || 0) + '\u00d7' + (p.h || 0)
            )
          );
        })
      ),

      // Merge tracking
      plan.mergeTracking.length > 0 && h('div', { className: 'sync-section' },
        h('div', { className: 'sync-section-header' }, 'Progress to merge'),
        plan.mergeTracking.map(function(entry) {
          var p = entry.remote.data;
          return h('div', { key: entry.id, className: 'sync-project-row' },
            h('span', { className: 'sync-project-name' }, p.name || entry.id),
            h('span', { className: 'sync-project-meta' }, 'tracking \u2192 merge')
          );
        })
      ),

      // Possible duplicates (idRewrites) — shown for reassurance when the
      // engine has matched a local project to a remote one by chart fingerprint
      // even though their ids differ. This was historically the silent
      // duplication bug; surfacing it lets the user confirm the merge is right.
      plan.idRewrites && plan.idRewrites.length > 0 && h('div', { className: 'sync-section' },
        h('div', { className: 'sync-section-header' },
          (Icons.cloudCheck ? Icons.cloudCheck() : null), ' Reconciled duplicates'
        ),
        h('div', { className: 'sync-section-help', style: { fontSize: 12, color: 'var(--text-secondary)', marginBottom: 8 } },
          'These charts already exist on this device under a different id. Their progress will be merged together so you don\u2019t end up with two copies.'
        ),
        plan.idRewrites.map(function(entry) {
          var p = (entry.remote && entry.remote.data) || {};
          return h('div', { key: entry.id, className: 'sync-project-row' },
            h('span', { className: 'sync-project-name' }, p.name || entry.id),
            h('span', { className: 'sync-project-meta' },
              (entry.local && entry.local.name && entry.local.name !== p.name)
                ? ('matches local "' + entry.local.name + '"')
                : 'matched by chart contents')
          );
        })
      ),

      // Conflicts
      plan.conflicts.length > 0 && h('div', { className: 'sync-section' },
        h('div', { className: 'sync-section-header sync-section-header--conflict' },
          Icons.cloudAlert(), ' Conflicts \u2014 choose how to resolve'
        ),
        plan.conflicts.map(function(entry) {
          return h(SyncConflictCard, {
            key: entry.id,
            entry: entry,
            resolution: resolutions[entry.id] || null,
            onResolve: function(val) { if (!applying) setResolution(entry.id, val); }
          });
        })
      ),

      // Local-only info (projects on this device not in the sync file)
      plan.localOnly && plan.localOnly.length > 0 && h('div', { className: 'sync-section' },
        h('div', { className: 'sync-section-header' }, 'Local only (not in sync file)'),
        plan.localOnly.map(function(entry) {
          var p = entry.local;
          return h('div', { key: entry.id, className: 'sync-project-row sync-project-row--muted' },
            h('span', { className: 'sync-project-name' }, p.name || entry.id),
            h('span', { className: 'sync-project-meta' }, 'kept as-is')
          );
        })
      ),

      // Stash merge preview
      plan.stashMerge && h('div', { className: 'sync-section' },
        h('div', { className: 'sync-section-header' }, 'Stash update'),
        h('div', { className: 'sync-stash-preview' },
          plan.stashMerge.threads && h('span', null, Object.keys(plan.stashMerge.threads).length + ' threads'),
          plan.stashMerge.threads && plan.stashMerge.patterns && ' \u00b7 ',
          plan.stashMerge.patterns && h('span', null, plan.stashMerge.patterns.length + ' patterns')
        )
      ),

      // Actions
      h('div', { className: 'sync-summary-actions' },
        h('button', {
          className: 'sync-btn sync-btn--secondary',
          onClick: onCancel,
          disabled: applying
        }, 'Cancel'),
        h('button', {
          className: 'sync-btn sync-btn--primary',
          onClick: handleApply,
          disabled: !canApply || !hasChanges || applying
        },
          applying ? 'Applying\u2026' : hasChanges ? 'Apply Sync' : 'Nothing to sync'
        )
      )
  );
}

// ═══ Sync Conflict Card ═══
// Shows a side-by-side comparison with resolution buttons.
// Props:
//   entry      — classified conflict entry { id, local, remote: { data }, classification }
//   resolution — current choice or null
//   onResolve  — callback(choice)
function SyncConflictCard({ entry, resolution, onResolve }) {
  var h = React.createElement;
  var local = entry.local;
  var remote = entry.remote.data;

  function countDone(proj) {
    if (!proj || !proj.done) return 0;
    var n = 0;
    for (var i = 0; i < proj.done.length; i++) {
      if (proj.done[i] === 1) n++;
    }
    return n;
  }

  function totalStitches(proj) {
    if (!proj || !proj.pattern) return 0;
    var n = 0;
    for (var i = 0; i < proj.pattern.length; i++) {
      var c = proj.pattern[i];
      if (c && c.id !== '__skip__' && c.id !== '__empty__') n++;
    }
    return n;
  }

  function paletteCount(proj) {
    if (!proj || !proj.pattern) return 0;
    var ids = {};
    for (var i = 0; i < proj.pattern.length; i++) {
      var c = proj.pattern[i];
      if (c && c.id && c.id !== '__skip__' && c.id !== '__empty__') ids[c.id] = true;
    }
    return Object.keys(ids).length;
  }

  var localDone = countDone(local);
  var remoteDone = countDone(remote);
  var localTotal = totalStitches(local);
  var remoteTotal = totalStitches(remote);
  var localPct = localTotal > 0 ? Math.round(localDone / localTotal * 100) : 0;
  var remotePct = remoteTotal > 0 ? Math.round(remoteDone / remoteTotal * 100) : 0;
  var localPalette = paletteCount(local);
  var remotePalette = paletteCount(remote);

  function side(label, proj, done, total, pct, palCount) {
    return h('div', { className: 'sync-conflict-side' },
      h('div', { className: 'sync-conflict-side-label' }, label),
      h('div', { className: 'sync-conflict-side-name' }, proj.name || 'Untitled'),
      h('div', { className: 'sync-conflict-side-meta' },
        (proj.w || 0) + '\u00d7' + (proj.h || 0) + ' \u00b7 ' + palCount + ' colour' + (palCount !== 1 ? 's' : '') + ' \u00b7 ' + pct + '% done'
      ),
      h('div', { className: 'sync-conflict-side-date' },
        'Edited: ' + (proj.updatedAt ? new Date(proj.updatedAt).toLocaleString() : 'unknown')
      )
    );
  }

  var choices = [
    { val: 'keep-local', label: 'Keep Local', desc: 'Discard remote changes' },
    { val: 'keep-remote', label: 'Keep Remote', desc: 'Overwrite local with remote' },
    { val: 'keep-both', label: 'Keep Both', desc: 'Import remote as a copy' }
  ];

  return h('div', { className: 'sync-conflict-card' + (resolution ? ' sync-conflict-card--resolved' : '') },
    h('div', { className: 'sync-conflict-name' }, local.name || remote.name || entry.id),
    h('div', { className: 'sync-conflict-sides' },
      side('This device', local, localDone, localTotal, localPct, localPalette),
      h('div', { className: 'sync-conflict-vs' }, 'vs'),
      side('Sync file', remote, remoteDone, remoteTotal, remotePct, remotePalette)
    ),
    h('div', { className: 'sync-conflict-choices' },
      choices.map(function(ch) {
        return h('button', {
          key: ch.val,
          className: 'sync-choice-btn' + (resolution === ch.val ? ' sync-choice-btn--active' : ''),
          onClick: function() { onResolve(ch.val); },
          title: ch.desc
        }, ch.label);
      })
    ),
    resolution && h('div', { className: 'sync-conflict-resolved-label' },
      Icons.check(), ' ' + choices.find(function(c) { return c.val === resolution; }).label
    )
  );
}

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
  var _confirmCounter = 0;
  function ConfirmDialogInner(props) {
    var h = React.createElement;
    var opts = props.opts || {};
    var titleId = React.useRef('cs-confirm-title-' + (++_confirmCounter)).current;
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
