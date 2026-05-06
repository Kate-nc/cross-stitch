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
            "StitchX is a free, client-side web application designed to help you create and track cross-stitch patterns directly in your browser."
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
  var _skipStash = React.useState(false);
  var skipStash = _skipStash[0], setSkipStash = _skipStash[1];

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
    onApply(resolutions, { skipStash: skipStash });
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
        ),
        // VER-SYNC-004: let the user opt out of merging stash data from the
        // remote. Useful when the remote device has stale or unwanted thread
        // counts that would silently inflate local owned quantities.
        h('label', { className: 'sync-skip-stash-label', style: { display: 'flex', alignItems: 'center', gap: 6, marginTop: 8, fontSize: 13, color: 'var(--text-secondary)', cursor: 'pointer' } },
          h('input', {
            type: 'checkbox',
            checked: skipStash,
            disabled: applying,
            onChange: function(e) { setSkipStash(e.target.checked); }
          }),
          'Skip stash update'
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
    var plan = props.plan;
    var autoTrigger = !!props.autoTrigger;
    var onDone = props.onDone;   // callback after Continue pressed + merge complete

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
      // No plan = "nothing new to review" state (manual open with no pending plan)
      if (!plan) { setGateState({ noPlan: true }); return; }
      var cancelled = false;
      // Pre-analysis: flush state and read snapshot
      Promise.resolve().then(function() {
        if (typeof SyncEngine !== 'undefined' && SyncEngine.readSnapshot) {
          return SyncEngine.readSnapshot();
        }
        return null;
      }).then(function(snapshot) {
        if (cancelled) return;
        var analysis = (typeof SyncEngine !== 'undefined' && SyncEngine.analyseConflicts)
          ? SyncEngine.analyseConflicts(plan, snapshot)
          : { conflicts: [], stitchSummary: { totalAdded: 0, affectedProjects: 0 }, stashSummary: { updatedCount: 0 }, metaSummary: { updatedCount: 0 }, prefsSummary: { updatedCount: 0, usedTimestampFallback: false }, noSnapshot: true, hasChanges: !!(plan.newRemote && plan.newRemote.length) };
        setGateState(analysis);
        // Auto-dismiss for empty automatic triggers after 2 s
        if (autoTrigger && !analysis.hasChanges && analysis.conflicts.length === 0) {
          autoDismissRef.current = setTimeout(function() {
            if (!cancelled) onDone && onDone({ silent: true });
          }, 2000);
        }
      }).catch(function(e) {
        if (!cancelled) setGateState({ error: e.message || 'Analysis failed.' });
      });
      return function() {
        cancelled = true;
        if (autoDismissRef.current) clearTimeout(autoDismissRef.current);
      };
    }, []);

    function setResolution(id, val) {
      setResolutions(function(prev) { var n = Object.assign({}, prev); n[id] = val; return n; });
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
        onClose: null,
        variant: 'dialog',
        className: 'srg-modal',
        dismissOnScrim: false,
        labelledBy: 'srg-header',
        'aria-modal': 'true'
      },
        h('div', { className: 'srg-body' },
          h('div', { className: 'srg-loading' },
            Icons.spinner && Icons.spinner(), ' Preparing sync review\u2026'
          )
        )
      );
    }

    // No-plan state (manual open with nothing pending)
    if (gateState.noPlan) {
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
          h('h3', { id: 'srg-header' }, 'Nothing new to review')
        ),
        h('div', { className: 'srg-body' },
          h('p', { className: 'srg-body-text' }, 'Import a .csync file to review changes from another device.')
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
