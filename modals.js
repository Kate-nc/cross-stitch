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

  ThreadSelector: ({ onClose, currentSymbol, currentThreadId, onSelect, usedThreads }) => {
    const [search, setSearch] = React.useState("");

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
                  lab: [80, 0, 0] // Approx mid-grey lab
                });
              },
              style: { padding: "8px 16px", fontSize: 13, background: "#0d9488", color: "#fff", border: "none", borderRadius: 6, cursor: "pointer", fontWeight: 500 }
            }, `Use "${search.trim()}" anyway`) : null
          ) :
          filteredThreads.map(t => {
            const isCurrent = t.id === currentThreadId;
            const isUsed = usedThreads.includes(t.id) && !isCurrent;
            return React.createElement("div", {
              key: t.id,
              onClick: () => {
                if (isUsed) {
                  alert(`DMC ${t.id} is already assigned to another symbol. Each colour can only be assigned to one symbol.`);
                  return;
                }
                onSelect(t);
              },
              style: {
                display: "flex", alignItems: "center", gap: 12, padding: "10px 12px", borderBottom: "1px solid #f4f4f5",
                background: isCurrent ? "#f0fdfa" : (isUsed ? "#fafafa" : "#fff"),
                cursor: isUsed ? "not-allowed" : "pointer",
                opacity: isUsed ? 0.5 : 1
              }
            },
              React.createElement("div", { style: { width: 24, height: 24, borderRadius: 4, background: `rgb(${t.rgb[0]},${t.rgb[1]},${t.rgb[2]})`, border: "1px solid #d4d4d8", flexShrink: 0 } }),
              React.createElement("div", { style: { fontWeight: 600, fontSize: 14, minWidth: 60, color: "#18181b" } }, "DMC " + t.id),
              React.createElement("div", { style: { fontSize: 13, color: "#71717a", flex: 1, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" } }, t.name),
              isCurrent && React.createElement("div", { style: { fontSize: 11, fontWeight: 600, color: "#0d9488", background: "#ccfbf1", padding: "2px 8px", borderRadius: 10 } }, "Current"),
              isUsed && React.createElement("div", { style: { fontSize: 11, fontWeight: 600, color: "#dc2626", background: "#fee2e2", padding: "2px 8px", borderRadius: 10 } }, "In Use")
            );
          })
        )
      )
    );
  },

  Calculator: ({ onClose, initialPatterns = [] }) => {
    // This is a minimal stub to prevent white screens if the Calculator is invoked.
    return React.createElement("div", { className: "modal-overlay", onClick: onClose },
      React.createElement("div", { className: "modal-content", onClick: e => e.stopPropagation(), style: { maxWidth: 500, padding: 20 } },
        React.createElement("div", { style: { display: "flex", justifyContent: "space-between", marginBottom: 20 } },
            React.createElement("h2", { style: { margin: 0, fontSize: 18 } }, "Thread Calculator"),
            React.createElement("button", { onClick: onClose, style: { background: "none", border: "none", fontSize: 24, cursor: "pointer", color: "#a1a1aa" } }, "×")
        ),
        React.createElement("div", null, "Skein calculation logic has been integrated into the thread views and shopping lists. To calculate threads needed for individual colors or projects, please edit your User Profile default settings in the Stash Manager or view the pattern's thread requirements."),
        React.createElement("div", { style: { marginTop: 20, textAlign: "right" } },
            React.createElement("button", { onClick: onClose, style: { padding: "8px 16px", borderRadius: 8, border: "0.5px solid #e4e4e7", background: "#fff", cursor: "pointer", fontWeight: 600 } }, "Close")
        )
      )
    );
  }
};