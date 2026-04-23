const SharedModals = {
  Help: ({ onClose }) => {
    window.useEscape(onClose);
    return React.createElement("div", { className: "modal-overlay", onClick: onClose },
      React.createElement("div", { className: "modal-content", onClick: e => e.stopPropagation(), style: { maxWidth: 600, maxHeight: "80vh", overflowY: "auto" } },
        React.createElement("button", { className: "modal-close", onClick: onClose, "aria-label": "Close" }, "×"),
        React.createElement("h3", { style: { marginTop: 0, marginBottom: 15, fontSize: 22, color: "#1e293b" } }, "Help & User Guide"),

        React.createElement("div", { style: { display: "flex", flexDirection: "column", gap: 20 } },
          React.createElement("div", null,
            React.createElement("h4", { style: { margin: "0 0 8px 0", color: "#1e293b", fontSize: 16 } }, "Pattern Creator"),
            React.createElement("p", { style: { margin: "0 0 8px 0", color: "#475569", fontSize: 14, lineHeight: 1.5 } }, "Convert any image into a cross-stitch pattern. Adjust dimensions, color palette size, and apply filters to get the perfect design."),
            React.createElement("ul", { style: { margin: 0, paddingLeft: 20, color: "#475569", fontSize: 13, lineHeight: 1.5 } },
              React.createElement("li", null, React.createElement("strong", null, "Palette Control:"), " Limit the maximum number of colors to keep the project manageable."),
              React.createElement("li", null, React.createElement("strong", null, "Min Stitches/Colour:"), " Remove colors that are only used for a few stitches (useful for cleaning up noise)."),
              React.createElement("li", null, React.createElement("strong", null, "Skip Background:"), " Select a color from your image to be treated as empty canvas. Click 'Pick' and then click on your image.")
            )
          ),

          React.createElement("div", null,
            React.createElement("h4", { style: { margin: "0 0 8px 0", color: "#1e293b", fontSize: 16 } }, "Pattern Editing"),
            React.createElement("p", { style: { margin: "0 0 8px 0", color: "#475569", fontSize: 14, lineHeight: 1.5 } }, "Once generated, you can manually edit the pattern:"),
            React.createElement("ul", { style: { margin: 0, paddingLeft: 20, color: "#475569", fontSize: 13, lineHeight: 1.5 } },
              React.createElement("li", null, React.createElement("strong", null, "Paint & Fill:"), " Select a color from the palette below the canvas, then use the Paint or Fill tools to modify individual stitches or areas."),
              React.createElement("li", null, React.createElement("strong", null, "Backstitch:"), " Draw lines between grid corners. Use the 'Erase Line' tool to remove them.")
            )
          ),

          React.createElement("div", null,
            React.createElement("h4", { style: { margin: "0 0 8px 0", color: "#1e293b", fontSize: 16 } }, "Stitch Tracker"),
            React.createElement("p", { style: { margin: "0 0 8px 0", color: "#475569", fontSize: 14, lineHeight: 1.5 } }, "Load a saved project to track your stitching progress interactively."),
            React.createElement("ul", { style: { margin: 0, paddingLeft: 20, color: "#475569", fontSize: 13, lineHeight: 1.5 } },
              React.createElement("li", null, React.createElement("strong", null, "Track Mode:"), " Click or drag across the pattern to mark stitches as complete. Use the timer to estimate your completion date."),
              React.createElement("li", null, React.createElement("strong", null, "Navigate Mode:"), " Place a guide crosshair on the canvas. If you select a color, you can click to place parking markers."),
              React.createElement("li", null, React.createElement("strong", null, "Colours Drawer:"), " Open the drawer at the bottom to see your progress per color. Click a color to highlight only those stitches on the canvas.")
            )
          ),

          React.createElement("div", null,
            React.createElement("h4", { style: { margin: "0 0 8px 0", color: "#1e293b", fontSize: 16 } }, "Saving & Exporting"),
            React.createElement("ul", { style: { margin: 0, paddingLeft: 20, color: "#475569", fontSize: 13, lineHeight: 1.5 } },
              React.createElement("li", null, React.createElement("strong", null, "Save Project (.json):"), " This is the recommended way to save. It keeps your generated pattern, edits, and tracking progress in one file. You can load this file in either the Creator or Tracker."),
              React.createElement("li", null, React.createElement("strong", null, "Export PDF:"), " Generates a printable multi-page chart with a thread legend."),
              React.createElement("li", null, React.createElement("strong", null, "Open in Stitch Tracker (Link):"), " Creates a sharable URL that opens the pattern directly in the Tracker without needing a file (only works for smaller patterns).")
            )
          )
        )
      )
    );
  },

  About: ({ onClose }) => {
    window.useEscape(onClose);
    return React.createElement("div", { className: "modal-overlay", onClick: onClose },
      React.createElement("div", { className: "modal-content", onClick: e => e.stopPropagation(), style: { maxWidth: 500 } },
        React.createElement("button", { className: "modal-close", onClick: onClose, "aria-label": "Close" }, "×"),
        React.createElement("h3", { style: { marginTop: 0, marginBottom: 15, fontSize: 22, color: "#1e293b" } }, "About"),
        React.createElement("div", { style: { display: "flex", flexDirection: "column", gap: 16 } },
          React.createElement("p", { style: { margin: 0, color: "#475569", fontSize: 15, lineHeight: 1.5 } },
            "Cross Stitch Pattern Generator is a free, client-side web application designed to help you create and track cross-stitch patterns directly in your browser."
          ),
          React.createElement("p", { style: { margin: 0, color: "#475569", fontSize: 14, lineHeight: 1.5 } },
            "Because this app runs entirely in your browser, ",
            React.createElement("strong", { style: { color: "#1e293b" } }, "no images or pattern data are ever uploaded to a server."),
            " Your projects remain private and local to your device."
          ),
          React.createElement("div", { style: { padding: "12px", background: "#f8f9fa", borderRadius: 8, border: "0.5px solid #e2e8f0" } },
            React.createElement("h4", { style: { margin: "0 0 8px 0", color: "#1e293b", fontSize: 14 } }, "Technologies Used:"),
            React.createElement("ul", { style: { margin: 0, paddingLeft: 20, color: "#475569", fontSize: 13, lineHeight: 1.5 } },
              React.createElement("li", null, "React (UI Framework)"),
              React.createElement("li", null, "jsPDF (PDF Generation)"),
              React.createElement("li", null, "pako (URL Compression)")
            )
          ),
          React.createElement("p", { style: { margin: 0, color: "#94a3b8", fontSize: 12, textAlign: "center", marginTop: 10 } },
            "Version 1.0.0"
          )
        )
      )
    );
  },

  ThreadSelector: ({ onClose, currentSymbol, currentThreadId, onSelect, usedThreads, onSwap, pal }) => {
    const [search, setSearch] = React.useState("");
    const [swapCandidate, setSwapCandidate] = React.useState(null); // thread entry that was "In Use" and clicked

    // We expect DMC to be available globally
    const filteredThreads = React.useMemo(() => {
      if (!DMC) return [];
      const lowerSearch = search.toLowerCase();
      return DMC.filter(t =>
        t.id.toLowerCase().includes(lowerSearch) ||
        t.name.toLowerCase().includes(lowerSearch)
      );
    }, [search]);

    return React.createElement("div", { className: "modal-overlay", onClick: onClose },
      React.createElement("div", { className: "modal-content", onClick: e => e.stopPropagation(), style: { maxWidth: 500, display: "flex", flexDirection: "column", maxHeight: "80vh" } },
        React.createElement("button", { className: "modal-close", onClick: onClose, "aria-label": "Close" }, "×"),
        React.createElement("h3", { style: { marginTop: 0, marginBottom: 15, fontSize: 20, color: "#1e293b" } },
          "Reassign Thread for ",
          React.createElement("span", { style: { fontFamily: "monospace", background: "#f1f5f9", padding: "2px 6px", borderRadius: 4, border: "1px solid #e2e8f0" } }, currentSymbol)
        ),

        React.createElement("div", { style: { marginBottom: 15 } },
          React.createElement("input", {
            type: "text",
            placeholder: "Search by DMC code or name...",
            value: search,
            onChange: e => setSearch(e.target.value),
            style: { width: "100%", padding: "10px", borderRadius: 8, border: "1px solid #e2e8f0", fontSize: 14, boxSizing: "border-box" },
            autoFocus: true
          })
        ),

        // Swap confirmation banner — shown when user clicks an "In Use" thread
        swapCandidate && React.createElement("div", { style: { margin: "0 0 12px 0", padding: "12px 14px", background: "#fffbeb", border: "1px solid #fde68a", borderRadius: 8 } },
          React.createElement("div", { style: { fontSize: 13, fontWeight: 600, color: "#92400e", marginBottom: 8 } },
            `DMC ${swapCandidate.id} is already assigned to another symbol.`
          ),
          React.createElement("div", { style: { fontSize: 12, color: "#475569", marginBottom: 10 } },
            `Swap the two symbols' colour assignments? Both symbols will keep their shapes — only their thread colours will exchange.`
          ),
          React.createElement("div", { style: { display: "flex", gap: 8 } },
            React.createElement("button", {
              onClick: () => {
                if (onSwap && pal) {
                  // Find the palette entry that holds swapCandidate.id (the conflicting symbol)
                  const conflictingPalEntry = pal.find(p => p.id === swapCandidate.id);
                  if (conflictingPalEntry) onSwap(conflictingPalEntry);
                }
              },
              style: { padding: "7px 14px", fontSize: 13, background: "#d97706", color: "#fff", border: "none", borderRadius: 6, cursor: "pointer", fontWeight: 600 }
            }, "Swap Colours"),
            React.createElement("button", {
              onClick: () => setSwapCandidate(null),
              style: { padding: "7px 14px", fontSize: 13, background: "#fff", color: "#475569", border: "1px solid #e2e8f0", borderRadius: 6, cursor: "pointer" }
            }, "Cancel")
          )
        ),

        React.createElement("div", { style: { flex: 1, overflowY: "auto", border: "1px solid #e2e8f0", borderRadius: 8 } },
          filteredThreads.length === 0 ? React.createElement("div", { style: { padding: 20, textAlign: "center" } },
            React.createElement("div", { style: { color: "#475569", fontSize: 14, marginBottom: 12 } }, "No threads found."),
            search.trim() !== "" ? React.createElement("button", {
              onClick: () => {
                if (usedThreads.includes(search.trim())) {
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
              style: { padding: "8px 16px", fontSize: 13, background: "#0d9488", color: "#fff", border: "none", borderRadius: 6, cursor: "pointer", fontWeight: 500 }
            }, `Use "${search.trim()}" anyway`) : null
          ) :
          filteredThreads.map(t => {
            const isCurrent = t.id === currentThreadId;
            const isUsed = usedThreads.includes(t.id) && !isCurrent;
            const isSwapCandidate = swapCandidate && swapCandidate.id === t.id;
            return React.createElement("div", {
              key: t.id,
              onClick: () => {
                if (isUsed) {
                  // Offer swap instead of blocking with an alert
                  setSwapCandidate(t);
                  return;
                }
                onSelect(t);
              },
              style: {
                display: "flex", alignItems: "center", gap: 12, padding: "10px 12px", borderBottom: "1px solid #f1f5f9",
                background: isCurrent ? "#f0fdfa" : isSwapCandidate ? "#fffbeb" : (isUsed ? "#f8f9fa" : "#fff"),
                cursor: isUsed ? "pointer" : "pointer",
                opacity: 1
              }
            },
              React.createElement("div", { style: { width: 24, height: 24, borderRadius: 4, background: `rgb(${t.rgb[0]},${t.rgb[1]},${t.rgb[2]})`, border: "1px solid #cbd5e1", flexShrink: 0 } }),
              React.createElement("div", { style: { fontWeight: 600, fontSize: 14, minWidth: 60, color: "#1e293b" } }, "DMC " + t.id),
              React.createElement("div", { style: { fontSize: 13, color: "#475569", flex: 1, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" } }, t.name),
              isCurrent && React.createElement("div", { style: { fontSize: 11, fontWeight: 600, color: "#0d9488", background: "#ccfbf1", padding: "2px 8px", borderRadius: 10 } }, "Current"),
              isUsed && !isSwapCandidate && React.createElement("div", { style: { fontSize: 11, fontWeight: 600, color: "#d97706", background: "#fef3c7", padding: "2px 8px", borderRadius: 10 } }, "In Use — tap to swap"),
              isSwapCandidate && React.createElement("div", { style: { fontSize: 11, fontWeight: 600, color: "#92400e", background: "#fde68a", padding: "2px 8px", borderRadius: 10 } }, "Swap?")
            );
          })
        )
      )
    );
  },

  Shortcuts: ({ onClose, page }) => {
    const isMac = typeof navigator !== 'undefined' && /Mac/.test(navigator.platform || navigator.userAgent || '');
    const mod = isMac ? '⌘' : 'Ctrl';

    function kbList(keys) {
      const out = [];
      keys.forEach((k, i) => {
        if (i > 0) out.push(React.createElement('span', { key: 'sl'+i, style: { margin: '0 3px', color: '#94a3b8', fontSize: 10 } }, '/'));
        out.push(React.createElement('kbd', { key: 'k'+i }, k));
      });
      return React.createElement('span', { style: { whiteSpace: 'nowrap' } }, ...out);
    }

    function shRow(keys, desc) {
      return React.createElement('div', { style: { display: 'flex', alignItems: 'baseline', gap: 12, padding: '4px 0', borderBottom: '0.5px solid #f1f5f9' } },
        React.createElement('div', { style: { minWidth: 130, flexShrink: 0 } }, kbList(keys)),
        React.createElement('div', { style: { fontSize: 13, color: '#475569' } }, desc)
      );
    }

    function section(title, rows) {
      return React.createElement('div', { style: { marginBottom: 16 } },
        React.createElement('div', { style: { fontSize: 11, fontWeight: 700, textTransform: 'uppercase', color: '#94a3b8', letterSpacing: '0.07em', marginBottom: 6, paddingBottom: 4, borderBottom: '1px solid #e2e8f0' } }, title),
        ...rows
      );
    }

    const general = section('General', [
      shRow([mod+'+Z'], 'Undo'),
      shRow([mod+'+Y', mod+'+⇧Z'], 'Redo'),
      shRow([mod+'+S'], 'Save project'),
      shRow(['Esc'], 'Deselect / dismiss'),
      shRow(['?'], 'Toggle this help'),
    ]);

    const pageSection = page === 'creator'
      ? section('Pattern Editor', [
          shRow(['1'], 'Cross stitch'),
          shRow(['2'], 'Half stitch /'),
          shRow(['3'], 'Half stitch \\'),
          shRow(['4'], 'Backstitch'),
          shRow(['5'], 'Erase'),
          shRow(['P'], 'Paint brush'),
          shRow(['F'], 'Fill bucket'),
          shRow(['V'], 'Cycle view mode'),
          shRow(['+', '−'], 'Zoom in / out'),
          shRow(['0'], 'Zoom to fit'),
        ])
      : section('Stitch Tracker', [
          shRow(['T'], 'Track mode'),
          shRow(['N'], 'Navigate mode'),
          shRow(['Shift+Click'], 'Mark range from last clicked cell'),
          shRow(['Space'], 'Start / stop timer (tap)'),
          shRow(['P'], 'Pause / resume session timer'),
          shRow(['V'], 'Cycle view mode'),
          shRow(['[', ']'], 'Previous / next colour'),
          shRow(['C'], 'Toggle counting aids (highlight mode)'),
          shRow(['D'], 'Toggle colour drawer'),
          shRow(['+', '−'], 'Zoom in / out'),
          shRow(['0'], 'Zoom to fit'),
          shRow(['Hold Space + drag'], 'Pan canvas'),
          shRow([mod+'+scroll'], 'Zoom canvas'),
        ]);

    return React.createElement('div', { className: 'modal-overlay', onClick: onClose },
      React.createElement('div', { className: 'modal-content', onClick: e => e.stopPropagation(), style: { maxWidth: 420, maxHeight: '80vh', overflowY: 'auto' } },
        React.createElement('button', { className: 'modal-close', onClick: onClose, 'aria-label': 'Close' }, '×'),
        React.createElement('h3', { style: { marginTop: 0, marginBottom: 16, fontSize: 20, color: '#1e293b' } }, 'Keyboard Shortcuts'),
        general,
        pageSection,
        React.createElement('p', { style: { margin: '8px 0 0', fontSize: 12, color: '#94a3b8', textAlign: 'center' } },
          'Press ', React.createElement('kbd', null, '?'), ' anytime to toggle this panel'
        ),
        React.createElement('div', { style: { marginTop: 16, paddingTop: 12, borderTop: '1px solid #f1f5f9', textAlign: 'center' } },
          React.createElement('button', {
            onClick: function() {
              if (confirm('Reset all preview preferences and per-pattern view states to defaults?\n\nThis cannot be undone.')) {
                if (typeof UserPrefs !== 'undefined') UserPrefs.reset();
                onClose();
                alert('Preferences reset. Reload the page to apply defaults.');
              }
            },
            style: { fontSize: 11, color: '#94a3b8', background: 'none', border: '1px solid #e2e8f0', borderRadius: 4, padding: '4px 12px', cursor: 'pointer' }
          }, 'Reset preview preferences…')
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
  // Use the global ESC stack so this modal closes on top of any other open
  // modal without conflicting with their handlers. skipWhenEditingTextField
  // is disabled because the only focusable element here is the name input.
  window.useEscape(onCancel, { skipWhenEditingTextField: false });
  return React.createElement('div', { className: 'modal-overlay', onClick: onCancel },
    React.createElement('div', { className: 'modal-content', onClick: e => e.stopPropagation(), style: { maxWidth: 400 } },
      React.createElement('button', { className: 'modal-close', onClick: onCancel }, '×'),
      React.createElement('h3', { style: { marginTop: 0, marginBottom: 12, fontSize: 18, color: '#1e293b' } }, 'Name Your Project'),
      React.createElement('p', { style: { margin: '0 0 12px', fontSize: 13, color: '#475569' } }, 'Give your project a name before saving.'),
      React.createElement('input', {
        ref: inputRef, type: 'text', maxLength: 60, value: name,
        onChange: e => setName(e.target.value),
        onKeyDown: e => { if (e.key === 'Enter') handleSubmit(); },
        placeholder: 'e.g. Rose Garden',
        style: { width: '100%', padding: '8px 10px', borderRadius: 6, border: '1px solid #e2e8f0', fontSize: 14, boxSizing: 'border-box' }
      }),
      React.createElement('div', { style: { display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 16 } },
        React.createElement('button', { onClick: onCancel, style: { padding: '8px 16px', fontSize: 13, borderRadius: 6, border: '1px solid #e2e8f0', background: '#fff', cursor: 'pointer' } }, 'Cancel'),
        React.createElement('button', { onClick: handleSubmit, style: { padding: '8px 16px', fontSize: 13, borderRadius: 6, border: 'none', background: '#0d9488', color: '#fff', cursor: 'pointer', fontWeight: 600 } }, 'Save')
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
  window.useEscape(function() { if (!applying) onCancel(); });

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

  return h('div', { className: 'modal-overlay', onClick: onCancel },
    h('div', { className: 'modal-content sync-summary-modal', onClick: function(e) { e.stopPropagation(); } },
      h('button', { className: 'modal-close', onClick: onCancel, 'aria-label': 'Close' }, '\u00d7'),
      h('h3', { className: 'sync-summary-title' },
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
