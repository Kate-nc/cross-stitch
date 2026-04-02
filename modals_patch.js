const fs = require('fs');
let content = fs.readFileSync('modals.js', 'utf8');

const stitchGuideModal = `  StitchGuide: ({ onClose }) => {
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
              React.createElement("li", null, "Select the forward (/) or back (\\\\) half stitch tool."),
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
`;

content = content.replace("About: ({ onClose }) => {", stitchGuideModal + "\n  About: ({ onClose }) => {");

fs.writeFileSync('modals.js', content);
