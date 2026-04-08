const SharedModals = {
  Help: ({ onClose }) => {
    return React.createElement("div", { className: "modal-overlay", onClick: onClose },
      React.createElement("div", { className: "modal-content", onClick: e => e.stopPropagation(), style: { maxWidth: 600, maxHeight: "80vh", overflowY: "auto" } },
        React.createElement("button", { className: "modal-close", onClick: onClose }, "×"),
        React.createElement("h3", { style: { marginTop: 0, marginBottom: 15, fontSize: 22, color: "#18181b" } }, "Help & User Guide"),

        React.createElement("div", { style: { display: "flex", flexDirection: "column", gap: 20 } },
          React.createElement("div", null,
            React.createElement("h4", { style: { margin: "0 0 8px 0", color: "#18181b", fontSize: 16 } }, "Pattern Creator"),
            React.createElement("p", { style: { margin: "0 0 8px 0", color: "#71717a", fontSize: 14, lineHeight: 1.5 } }, "Convert any image into a cross-stitch pattern. Adjust dimensions, color palette size, and apply filters to get the perfect design."),
            React.createElement("ul", { style: { margin: 0, paddingLeft: 20, color: "#71717a", fontSize: 13, lineHeight: 1.5 } },
              React.createElement("li", null, React.createElement("strong", null, "Palette Control:"), " Limit the maximum number of colors to keep the project manageable."),
              React.createElement("li", null, React.createElement("strong", null, "Min Stitches/Colour:"), " Remove colors that are only used for a few stitches (useful for cleaning up noise)."),
              React.createElement("li", null, React.createElement("strong", null, "Skip Background:"), " Select a color from your image to be treated as empty canvas. Click 'Pick' and then click on your image.")
            )
          ),

          React.createElement("div", null,
            React.createElement("h4", { style: { margin: "0 0 8px 0", color: "#18181b", fontSize: 16 } }, "Pattern Editing"),
            React.createElement("p", { style: { margin: "0 0 8px 0", color: "#71717a", fontSize: 14, lineHeight: 1.5 } }, "Once generated, you can manually edit the pattern:"),
            React.createElement("ul", { style: { margin: 0, paddingLeft: 20, color: "#71717a", fontSize: 13, lineHeight: 1.5 } },
              React.createElement("li", null, React.createElement("strong", null, "Paint & Fill:"), " Select a color from the palette below the canvas, then use the Paint or Fill tools to modify individual stitches or areas."),
              React.createElement("li", null, React.createElement("strong", null, "Backstitch:"), " Draw lines between grid corners. Use the 'Erase Line' tool to remove them.")
            )
          ),

          React.createElement("div", null,
            React.createElement("h4", { style: { margin: "0 0 8px 0", color: "#18181b", fontSize: 16 } }, "Stitch Tracker"),
            React.createElement("p", { style: { margin: "0 0 8px 0", color: "#71717a", fontSize: 14, lineHeight: 1.5 } }, "Load a saved project to track your stitching progress interactively."),
            React.createElement("ul", { style: { margin: 0, paddingLeft: 20, color: "#71717a", fontSize: 13, lineHeight: 1.5 } },
              React.createElement("li", null, React.createElement("strong", null, "Track Mode:"), " Click or drag across the pattern to mark stitches as complete. Use the timer to estimate your completion date."),
              React.createElement("li", null, React.createElement("strong", null, "Navigate Mode:"), " Place a guide crosshair on the canvas. If you select a color, you can click to place parking markers."),
              React.createElement("li", null, React.createElement("strong", null, "Colours Drawer:"), " Open the drawer at the bottom to see your progress per color. Click a color to highlight only those stitches on the canvas.")
            )
          ),

          React.createElement("div", null,
            React.createElement("h4", { style: { margin: "0 0 8px 0", color: "#18181b", fontSize: 16 } }, "Saving & Exporting"),
            React.createElement("ul", { style: { margin: 0, paddingLeft: 20, color: "#71717a", fontSize: 13, lineHeight: 1.5 } },
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
    return React.createElement("div", { className: "modal-overlay", onClick: onClose },
      React.createElement("div", { className: "modal-content", onClick: e => e.stopPropagation(), style: { maxWidth: 500 } },
        React.createElement("button", { className: "modal-close", onClick: onClose }, "×"),
        React.createElement("h3", { style: { marginTop: 0, marginBottom: 15, fontSize: 22, color: "#18181b" } }, "About"),
        React.createElement("div", { style: { display: "flex", flexDirection: "column", gap: 16 } },
          React.createElement("p", { style: { margin: 0, color: "#71717a", fontSize: 15, lineHeight: 1.5 } },
            "Cross Stitch Pattern Generator is a free, client-side web application designed to help you create and track cross-stitch patterns directly in your browser."
          ),
          React.createElement("p", { style: { margin: 0, color: "#71717a", fontSize: 14, lineHeight: 1.5 } },
            "Because this app runs entirely in your browser, ",
            React.createElement("strong", { style: { color: "#18181b" } }, "no images or pattern data are ever uploaded to a server."),
            " Your projects remain private and local to your device."
          ),
          React.createElement("div", { style: { padding: "12px", background: "#fafafa", borderRadius: 8, border: "0.5px solid #e4e4e7" } },
            React.createElement("h4", { style: { margin: "0 0 8px 0", color: "#18181b", fontSize: 14 } }, "Technologies Used:"),
            React.createElement("ul", { style: { margin: 0, paddingLeft: 20, color: "#71717a", fontSize: 13, lineHeight: 1.5 } },
              React.createElement("li", null, "React (UI Framework)"),
              React.createElement("li", null, "jsPDF (PDF Generation)"),
              React.createElement("li", null, "pako (URL Compression)")
            )
          ),
          React.createElement("p", { style: { margin: 0, color: "#a1a1aa", fontSize: 12, textAlign: "center", marginTop: 10 } },
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
        React.createElement("button", { className: "modal-close", onClick: onClose }, "×"),
        React.createElement("h3", { style: { marginTop: 0, marginBottom: 15, fontSize: 20, color: "#18181b" } },
          "Reassign Thread for ",
          React.createElement("span", { style: { fontFamily: "monospace", background: "#f4f4f5", padding: "2px 6px", borderRadius: 4, border: "1px solid #e4e4e7" } }, currentSymbol)
        ),

        React.createElement("div", { style: { marginBottom: 15 } },
          React.createElement("input", {
            type: "text",
            placeholder: "Search by DMC code or name...",
            value: search,
            onChange: e => setSearch(e.target.value),
            style: { width: "100%", padding: "10px", borderRadius: 8, border: "1px solid #e4e4e7", fontSize: 14, boxSizing: "border-box" },
            autoFocus: true
          })
        ),

        // Swap confirmation banner — shown when user clicks an "In Use" thread
        swapCandidate && React.createElement("div", { style: { margin: "0 0 12px 0", padding: "12px 14px", background: "#fffbeb", border: "1px solid #fde68a", borderRadius: 8 } },
          React.createElement("div", { style: { fontSize: 13, fontWeight: 600, color: "#92400e", marginBottom: 8 } },
            `DMC ${swapCandidate.id} is already assigned to another symbol.`
          ),
          React.createElement("div", { style: { fontSize: 12, color: "#71717a", marginBottom: 10 } },
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
              style: { padding: "7px 14px", fontSize: 13, background: "#fff", color: "#71717a", border: "1px solid #e4e4e7", borderRadius: 6, cursor: "pointer" }
            }, "Cancel")
          )
        ),

        React.createElement("div", { style: { flex: 1, overflowY: "auto", border: "1px solid #e4e4e7", borderRadius: 8 } },
          filteredThreads.length === 0 ? React.createElement("div", { style: { padding: 20, textAlign: "center" } },
            React.createElement("div", { style: { color: "#71717a", fontSize: 14, marginBottom: 12 } }, "No threads found."),
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
                display: "flex", alignItems: "center", gap: 12, padding: "10px 12px", borderBottom: "1px solid #f4f4f5",
                background: isCurrent ? "#f0fdfa" : isSwapCandidate ? "#fffbeb" : (isUsed ? "#fafafa" : "#fff"),
                cursor: isUsed ? "pointer" : "pointer",
                opacity: 1
              }
            },
              React.createElement("div", { style: { width: 24, height: 24, borderRadius: 4, background: `rgb(${t.rgb[0]},${t.rgb[1]},${t.rgb[2]})`, border: "1px solid #d4d4d8", flexShrink: 0 } }),
              React.createElement("div", { style: { fontWeight: 600, fontSize: 14, minWidth: 60, color: "#18181b" } }, "DMC " + t.id),
              React.createElement("div", { style: { fontSize: 13, color: "#71717a", flex: 1, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" } }, t.name),
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
        if (i > 0) out.push(React.createElement('span', { key: 'sl'+i, style: { margin: '0 3px', color: '#a1a1aa', fontSize: 10 } }, '/'));
        out.push(React.createElement('kbd', { key: 'k'+i }, k));
      });
      return React.createElement('span', { style: { whiteSpace: 'nowrap' } }, ...out);
    }

    function shRow(keys, desc) {
      return React.createElement('div', { style: { display: 'flex', alignItems: 'baseline', gap: 12, padding: '4px 0', borderBottom: '0.5px solid #f4f4f5' } },
        React.createElement('div', { style: { minWidth: 130, flexShrink: 0 } }, kbList(keys)),
        React.createElement('div', { style: { fontSize: 13, color: '#71717a' } }, desc)
      );
    }

    function section(title, rows) {
      return React.createElement('div', { style: { marginBottom: 16 } },
        React.createElement('div', { style: { fontSize: 11, fontWeight: 700, textTransform: 'uppercase', color: '#a1a1aa', letterSpacing: '0.07em', marginBottom: 6, paddingBottom: 4, borderBottom: '1px solid #e4e4e7' } }, title),
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
          shRow(['I'], 'Eyedropper — pick colour from canvas'),
          shRow(['V'], 'Cycle view (Colour / Symbol / Both)'),
          shRow(['S'], 'Cycle palette sort (Count → Hue → DMC # → Name → Remaining → Done %)'),
          shRow([',', '.'], 'Step back / forward through recent colours'),
          shRow(['+', '−'], 'Zoom in / out'),
          shRow(['0'], 'Zoom to fit'),
        ])
      : section('Stitch Tracker', [
          shRow(['T'], 'Track mode'),
          shRow(['N'], 'Navigate mode'),
          shRow(['Space'], 'Start / stop timer (tap)'),
          shRow(['V'], 'Cycle view mode'),
          shRow(['[', ']'], 'Previous / next colour'),
          shRow(['D'], 'Toggle colour drawer'),
          shRow(['+', '−'], 'Zoom in / out'),
          shRow(['0'], 'Zoom to fit'),
          shRow(['Hold Space + drag'], 'Pan canvas'),
          shRow([mod+'+scroll'], 'Zoom canvas'),
        ]);

    return React.createElement('div', { className: 'modal-overlay', onClick: onClose },
      React.createElement('div', { className: 'modal-content', onClick: e => e.stopPropagation(), style: { maxWidth: 420, maxHeight: '80vh', overflowY: 'auto' } },
        React.createElement('button', { className: 'modal-close', onClick: onClose }, '×'),
        React.createElement('h3', { style: { marginTop: 0, marginBottom: 16, fontSize: 20, color: '#18181b' } }, 'Keyboard Shortcuts'),
        general,
        pageSection,
        React.createElement('p', { style: { margin: '8px 0 0', fontSize: 12, color: '#a1a1aa', textAlign: 'center' } },
          'Press ', React.createElement('kbd', null, '?'), ' anytime to toggle this panel'
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
  return React.createElement('div', { className: 'modal-overlay', onClick: onCancel },
    React.createElement('div', { className: 'modal-content', onClick: e => e.stopPropagation(), style: { maxWidth: 400 } },
      React.createElement('button', { className: 'modal-close', onClick: onCancel }, '×'),
      React.createElement('h3', { style: { marginTop: 0, marginBottom: 12, fontSize: 18, color: '#18181b' } }, 'Name Your Project'),
      React.createElement('p', { style: { margin: '0 0 12px', fontSize: 13, color: '#71717a' } }, 'Give your project a name before saving.'),
      React.createElement('input', {
        ref: inputRef, type: 'text', maxLength: 60, value: name,
        onChange: e => setName(e.target.value),
        onKeyDown: e => { if (e.key === 'Enter') handleSubmit(); if (e.key === 'Escape') onCancel(); },
        placeholder: 'e.g. Rose Garden',
        style: { width: '100%', padding: '8px 10px', borderRadius: 6, border: '1px solid #e4e4e7', fontSize: 14, boxSizing: 'border-box' }
      }),
      React.createElement('div', { style: { display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 16 } },
        React.createElement('button', { onClick: onCancel, style: { padding: '8px 16px', fontSize: 13, borderRadius: 6, border: '1px solid #e4e4e7', background: '#fff', cursor: 'pointer' } }, 'Cancel'),
        React.createElement('button', { onClick: handleSubmit, style: { padding: '8px 16px', fontSize: 13, borderRadius: 6, border: 'none', background: '#0d9488', color: '#fff', cursor: 'pointer', fontWeight: 600 } }, 'Save')
      )
    )
  );
}
