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

<<<<<<< HEAD
    StitchGuide: ({ onClose }) => {
    const [tab, setTab] = React.useState("basics");

    return React.createElement("div", { className: "modal-overlay", onClick: onClose },
      React.createElement("div", { className: "modal-content", onClick: e => e.stopPropagation(), style: { maxWidth: 650, padding: 0 } },
        React.createElement("div", { style: { padding: "16px 20px", borderBottom: "1px solid #e4e4e7", display: "flex", justifyContent: "space-between", alignItems: "center" } },
          React.createElement("h3", { style: { margin: 0, fontSize: 18, color: "#18181b" } }, "Fractional Stitch Guide"),
          React.createElement("button", { className: "modal-close", onClick: onClose, style: { position: "static" } }, "×")
        ),

        React.createElement("div", { style: { display: "flex", borderBottom: "1px solid #e4e4e7", background: "#fafafa" } },
          [
            { id: "basics", label: "Basics" },
            { id: "half", label: "Half Stitches" },
            { id: "quarter", label: "Quarter Stitches" },
            { id: "tracker", label: "Tracker Tips" }
          ].map(t =>
            React.createElement("button", {
              key: t.id,
              onClick: () => setTab(t.id),
              style: {
                padding: "10px 16px",
                border: "none",
                background: "none",
                borderBottom: tab === t.id ? "2px solid #0d9488" : "2px solid transparent",
                color: tab === t.id ? "#0d9488" : "#71717a",
                fontWeight: tab === t.id ? 600 : 500,
                cursor: "pointer",
                fontSize: 13
              }
            }, t.label)
          )
        ),

        React.createElement("div", { style: { padding: 20, minHeight: 300 } },
          tab === "basics" && React.createElement("div", null,
            React.createElement("p", { style: { color: "#3f3f46", fontSize: 14, lineHeight: 1.6, marginTop: 0 } },
              "Fractional stitches allow for smoother curves and finer details in your pattern. Our editor supports Half Stitches and Quarter Stitches."
            ),
            React.createElement("div", { style: { display: "flex", gap: 20, marginTop: 20 } },
              React.createElement("div", { style: { flex: 1, padding: 15, background: "#f4f4f5", borderRadius: 8, textAlign: "center" } },
                React.createElement("div", { style: { fontSize: 24, marginBottom: 10 } }, "1.0"),
                React.createElement("strong", { style: { display: "block", fontSize: 14 } }, "Full Cross"),
                React.createElement("p", { style: { fontSize: 12, color: "#71717a" } }, "Fills the entire square.")
              ),
              React.createElement("div", { style: { flex: 1, padding: 15, background: "#f4f4f5", borderRadius: 8, textAlign: "center" } },
                React.createElement("div", { style: { fontSize: 24, marginBottom: 10 } }, "0.5"),
                React.createElement("strong", { style: { display: "block", fontSize: 14 } }, "Half Stitch"),
                React.createElement("p", { style: { fontSize: 12, color: "#71717a" } }, "A single diagonal thread.")
              ),
              React.createElement("div", { style: { flex: 1, padding: 15, background: "#f4f4f5", borderRadius: 8, textAlign: "center" } },
                React.createElement("div", { style: { fontSize: 24, marginBottom: 10 } }, "0.25"),
                React.createElement("strong", { style: { display: "block", fontSize: 14 } }, "Quarter Stitch"),
                React.createElement("p", { style: { fontSize: 12, color: "#71717a" } }, "Corner to exact center.")
              )
            )
          ),

          tab === "half" && React.createElement("div", null,
            React.createElement("h4", { style: { marginTop: 0, color: "#18181b" } }, "Placing Half Stitches"),
            React.createElement("ul", { style: { color: "#3f3f46", fontSize: 14, lineHeight: 1.6, paddingLeft: 20 } },
              React.createElement("li", null, "Select the forward (/) or back (\\) half stitch tool."),
              React.createElement("li", null, "Click anywhere inside a grid cell to place it."),
              React.createElement("li", null, "In the chart, it appears as a tinted triangle with a solid diagonal line.")
            ),
            React.createElement("div", { style: { marginTop: 15, padding: 15, border: "1px dashed #d4d4d8", borderRadius: 8, background: "#fafafa" } },
              React.createElement("strong", { style: { fontSize: 13 } }, "Did you know?"),
              React.createElement("p", { style: { fontSize: 13, color: "#71717a", margin: "5px 0 0" } }, "You can place a full cross stitch and a half stitch of different colors in the same cell. The symbols will automatically shrink to fit!")
            )
          ),

          tab === "quarter" && React.createElement("div", null,
            React.createElement("h4", { style: { marginTop: 0, color: "#18181b" } }, "Placing Quarter Stitches"),
            React.createElement("ul", { style: { color: "#3f3f46", fontSize: 14, lineHeight: 1.6, paddingLeft: 20 } },
              React.createElement("li", null, "Select the Quarter Stitch tool."),
              React.createElement("li", null, "Hover over a cell: A crosshair guide will appear, splitting the cell into 4 quadrants."),
              React.createElement("li", null, "Click the specific quadrant (Top-Left, Top-Right, Bottom-Left, or Bottom-Right) where you want the stitch to anchor.")
            ),
            React.createElement("div", { style: { marginTop: 15, padding: 15, border: "1px solid #bbf7d0", borderRadius: 8, background: "#f0fdf4" } },
              React.createElement("strong", { style: { fontSize: 13, color: "#16a34a" } }, "Smart Merging"),
              React.createElement("p", { style: { fontSize: 13, color: "#15803d", margin: "5px 0 0" } }, "If you place 4 identical quarter stitches in the same cell, the app will automatically merge them into a single Full Cross stitch.")
            )
          ),

          tab === "tracker" && React.createElement("div", null,
            React.createElement("h4", { style: { marginTop: 0, color: "#18181b" } }, "Tracking Fractional Stitches"),
            React.createElement("ul", { style: { color: "#3f3f46", fontSize: 14, lineHeight: 1.6, paddingLeft: 20 } },
              React.createElement("li", null, "When marking a cell as done in the Tracker, click specifically on the half or quarter stitch you want to mark."),
              React.createElement("li", null, "Clicking the diagonal line marks just that half. Clicking the other half marks the rest."),
              React.createElement("li", null, "The progress percentages automatically calculate 0.5 for half stitches and 0.25 for quarters!")
            )
          )
        ),

        React.createElement("div", { style: { padding: "16px 20px", borderTop: "1px solid #e4e4e7", textAlign: "right", background: "#fafafa", borderRadius: "0 0 8px 8px" } },
          React.createElement("button", { onClick: onClose, style: { padding: "8px 16px", borderRadius: 8, border: "none", background: "#0d9488", color: "#fff", cursor: "pointer", fontWeight: 600 } }, "Got it")
        )
      )
    );
  },

=======
>>>>>>> origin/main
    StitchGuide: ({ onClose }) => {
    const [tab, setTab] = React.useState("basics");

    return React.createElement("div", { className: "modal-overlay", onClick: onClose },
      React.createElement("div", { className: "modal-content", onClick: e => e.stopPropagation(), style: { maxWidth: 650, padding: 0 } },
        React.createElement("div", { style: { padding: "16px 20px", borderBottom: "1px solid #e4e4e7", display: "flex", justifyContent: "space-between", alignItems: "center" } },
          React.createElement("h3", { style: { margin: 0, fontSize: 18, color: "#18181b" } }, "Fractional Stitch Guide"),
          React.createElement("button", { className: "modal-close", onClick: onClose, style: { position: "static" } }, "×")
        ),

        React.createElement("div", { style: { display: "flex", borderBottom: "1px solid #e4e4e7", background: "#fafafa" } },
          [
            { id: "basics", label: "Basics" },
            { id: "half", label: "Half Stitches" },
            { id: "quarter", label: "Quarter Stitches" },
            { id: "tracker", label: "Tracker Tips" }
          ].map(t =>
            React.createElement("button", {
              key: t.id,
              onClick: () => setTab(t.id),
              style: {
                padding: "10px 16px",
                border: "none",
                background: "none",
                borderBottom: tab === t.id ? "2px solid #0d9488" : "2px solid transparent",
                color: tab === t.id ? "#0d9488" : "#71717a",
                fontWeight: tab === t.id ? 600 : 500,
                cursor: "pointer",
                fontSize: 13
              }
            }, t.label)
          )
        ),

        React.createElement("div", { style: { padding: 20, minHeight: 300 } },
          tab === "basics" && React.createElement("div", null,
            React.createElement("p", { style: { color: "#3f3f46", fontSize: 14, lineHeight: 1.6, marginTop: 0 } },
              "Fractional stitches allow for smoother curves and finer details in your pattern. Our editor supports Half Stitches and Quarter Stitches."
            ),
            React.createElement("div", { style: { display: "flex", gap: 20, marginTop: 20 } },
              React.createElement("div", { style: { flex: 1, padding: 15, background: "#f4f4f5", borderRadius: 8, textAlign: "center" } },
                React.createElement("div", { style: { fontSize: 24, marginBottom: 10 } }, "1.0"),
                React.createElement("strong", { style: { display: "block", fontSize: 14 } }, "Full Cross"),
                React.createElement("p", { style: { fontSize: 12, color: "#71717a" } }, "Fills the entire square.")
              ),
              React.createElement("div", { style: { flex: 1, padding: 15, background: "#f4f4f5", borderRadius: 8, textAlign: "center" } },
                React.createElement("div", { style: { fontSize: 24, marginBottom: 10 } }, "0.5"),
                React.createElement("strong", { style: { display: "block", fontSize: 14 } }, "Half Stitch"),
                React.createElement("p", { style: { fontSize: 12, color: "#71717a" } }, "A single diagonal thread.")
              ),
              React.createElement("div", { style: { flex: 1, padding: 15, background: "#f4f4f5", borderRadius: 8, textAlign: "center" } },
                React.createElement("div", { style: { fontSize: 24, marginBottom: 10 } }, "0.25"),
                React.createElement("strong", { style: { display: "block", fontSize: 14 } }, "Quarter Stitch"),
                React.createElement("p", { style: { fontSize: 12, color: "#71717a" } }, "Corner to exact center.")
              )
            )
          ),

          tab === "half" && React.createElement("div", null,
            React.createElement("h4", { style: { marginTop: 0, color: "#18181b" } }, "Placing Half Stitches"),
            React.createElement("ul", { style: { color: "#3f3f46", fontSize: 14, lineHeight: 1.6, paddingLeft: 20 } },
              React.createElement("li", null, "Select the forward (/) or back (\\) half stitch tool."),
              React.createElement("li", null, "Click anywhere inside a grid cell to place it."),
              React.createElement("li", null, "In the chart, it appears as a tinted triangle with a solid diagonal line.")
            ),
            React.createElement("div", { style: { marginTop: 15, padding: 15, border: "1px dashed #d4d4d8", borderRadius: 8, background: "#fafafa" } },
              React.createElement("strong", { style: { fontSize: 13 } }, "Did you know?"),
              React.createElement("p", { style: { fontSize: 13, color: "#71717a", margin: "5px 0 0" } }, "You can place a full cross stitch and a half stitch of different colors in the same cell. The symbols will automatically shrink to fit!")
            )
          ),

          tab === "quarter" && React.createElement("div", null,
            React.createElement("h4", { style: { marginTop: 0, color: "#18181b" } }, "Placing Quarter Stitches"),
            React.createElement("ul", { style: { color: "#3f3f46", fontSize: 14, lineHeight: 1.6, paddingLeft: 20 } },
              React.createElement("li", null, "Select the Quarter Stitch tool."),
              React.createElement("li", null, "Hover over a cell: A crosshair guide will appear, splitting the cell into 4 quadrants."),
              React.createElement("li", null, "Click the specific quadrant (Top-Left, Top-Right, Bottom-Left, or Bottom-Right) where you want the stitch to anchor.")
            ),
            React.createElement("div", { style: { marginTop: 15, padding: 15, border: "1px solid #bbf7d0", borderRadius: 8, background: "#f0fdf4" } },
              React.createElement("strong", { style: { fontSize: 13, color: "#16a34a" } }, "Smart Merging"),
              React.createElement("p", { style: { fontSize: 13, color: "#15803d", margin: "5px 0 0" } }, "If you place 4 identical quarter stitches in the same cell, the app will automatically merge them into a single Full Cross stitch.")
            )
          ),

          tab === "tracker" && React.createElement("div", null,
            React.createElement("h4", { style: { marginTop: 0, color: "#18181b" } }, "Tracking Fractional Stitches"),
            React.createElement("ul", { style: { color: "#3f3f46", fontSize: 14, lineHeight: 1.6, paddingLeft: 20 } },
              React.createElement("li", null, "When marking a cell as done in the Tracker, click specifically on the half or quarter stitch you want to mark."),
              React.createElement("li", null, "Clicking the diagonal line marks just that half. Clicking the other half marks the rest."),
              React.createElement("li", null, "The progress percentages automatically calculate 0.5 for half stitches and 0.25 for quarters!")
            )
          )
        ),

        React.createElement("div", { style: { padding: "16px 20px", borderTop: "1px solid #e4e4e7", textAlign: "right", background: "#fafafa", borderRadius: "0 0 8px 8px" } },
          React.createElement("button", { onClick: onClose, style: { padding: "8px 16px", borderRadius: 8, border: "none", background: "#0d9488", color: "#fff", cursor: "pointer", fontWeight: 600 } }, "Got it")
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
<<<<<<< HEAD
  }
};
=======
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
>>>>>>> origin/main
