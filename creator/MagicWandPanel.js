/* creator/MagicWandPanel.js — Floating panel for Magic Wand selection operations.
   Renders when the magic wand tool is active and/or a selection exists.
   Reads from CreatorContext. */

window.MagicWandPanel = function MagicWandPanel() {
  var ctx = React.useContext(window.CreatorContext);
  var h = React.createElement;

  if (!(ctx.pat && ctx.pal && ctx.tab === "pattern")) return null;
  if (ctx.activeTool !== "magicWand" && ctx.activeTool !== "lasso" && !ctx.hasSelection) return null;

  var isSelTool = ctx.activeTool === "magicWand" || ctx.activeTool === "lasso";
  var hasSelection = ctx.hasSelection;
  var panel = ctx.wandPanel;

  // The "effective" op mode: modifier key pressed right now beats the persistent setting
  var effectiveMode = ctx.selectionModifier || ctx.wandOpMode;

  // ─── Helpers ─────────────────────────────────────────────────────────────────
  function btn(label, onClick, opts) {
    opts = opts || {};
    return h("button", {
      className: "tb-btn" + (opts.active ? " tb-btn--on" : "") + (opts.danger ? " tb-btn--red" : "") + (opts.green ? " tb-btn--green" : ""),
      onClick: onClick,
      disabled: opts.disabled,
      title: opts.title || "",
      style: Object.assign({ fontSize: 11, padding: "3px 8px" }, opts.style || {})
    }, label);
  }

  function swatch(rgb) {
    return h("span", {
      style: { display: "inline-block", width: 12, height: 12, borderRadius: 2,
        background: "rgb(" + (rgb || [128,128,128]) + ")", border: "1px solid #d4d4d8",
        verticalAlign: "middle", marginRight: 3 }
    });
  }

  // ─── Op mode SVG icons (match ToolStrip icon style) ─────────────────────────
  // Each icon: dashed rect = selection box; second shape = mode indicator
  var svgSelReplace = h("svg", {width:12,height:12,viewBox:"0 0 12 12",fill:"none"},
    h("rect", {x:"1.5",y:"2",width:"9",height:"8",rx:"0.5",stroke:"currentColor",strokeWidth:"1.2",strokeDasharray:"2.5 1.5"})
  );
  var svgSelAdd = h("svg", {width:12,height:12,viewBox:"0 0 12 12",fill:"none"},
    h("rect", {x:"1",y:"1.5",width:"6",height:"6",rx:"0.5",stroke:"currentColor",strokeWidth:"1.1",strokeDasharray:"2 1.5"}),
    h("rect", {x:"5",y:"5",width:"6",height:"6",rx:"0.5",stroke:"currentColor",strokeWidth:"1.1"}),
    h("line", {x1:"6.8",y1:"8",x2:"9.2",y2:"8",stroke:"currentColor",strokeWidth:"1.2",strokeLinecap:"round"}),
    h("line", {x1:"8",y1:"6.8",x2:"8",y2:"9.2",stroke:"currentColor",strokeWidth:"1.2",strokeLinecap:"round"})
  );
  var svgSelSubtract = h("svg", {width:12,height:12,viewBox:"0 0 12 12",fill:"none"},
    h("rect", {x:"1",y:"1.5",width:"6",height:"6",rx:"0.5",stroke:"currentColor",strokeWidth:"1.1",strokeDasharray:"2 1.5"}),
    h("rect", {x:"5",y:"5",width:"6",height:"6",rx:"0.5",stroke:"currentColor",strokeWidth:"1.1"}),
    h("line", {x1:"6.8",y1:"8",x2:"9.2",y2:"8",stroke:"currentColor",strokeWidth:"1.4",strokeLinecap:"round"})
  );
  var svgSelIntersect = h("svg", {width:12,height:12,viewBox:"0 0 12 12",fill:"none"},
    h("rect", {x:"1",y:"1.5",width:"6.5",height:"6.5",rx:"0.5",stroke:"currentColor",strokeWidth:"1.1",strokeDasharray:"2 1.5"}),
    h("rect", {x:"4.5",y:"4",width:"6.5",height:"6.5",rx:"0.5",stroke:"currentColor",strokeWidth:"1.1",strokeDasharray:"2 1.5"}),
    h("rect", {x:"4.5",y:"4",width:"3",height:"4",rx:"0.3",fill:"currentColor",opacity:"0.35"})
  );

  // ─── Op mode buttons (shared across wand + lasso) ───────────────────────────
  function opBtn(icon, label, mode, title) {
    var isPersistent = ctx.wandOpMode === mode;
    var isModifier   = ctx.selectionModifier === mode;
    var className = "tb-btn" +
      (isPersistent ? " tb-btn--on" : "") +
      (isModifier   ? " tb-btn--mod-active" : "");
    return h("button", {
      className: className,
      onClick: function() { ctx.setSelectionOpMode(mode); },
      title: title,
      style: { position: "relative" }
    }, icon, label,
      isModifier && h("span", {
        style: { position: "absolute", top: -4, right: -4, background: "#f59e0b",
          color: "#fff", borderRadius: 99, fontSize: 8, width: 12, height: 12,
          display: "flex", alignItems: "center", justifyContent: "center", lineHeight: 1,
          boxShadow: "0 0 0 1px #fff", pointerEvents: "none" }
      }, "\u2022")
    );
  }

  // ─── First toolbar row: tool options ─────────────────────────────────────────
  var toolLabel = ctx.activeTool === "lasso" ? "Lasso" : "Wand";
  var optionsRow = isSelTool ? h("div", { className: "tb-strip--sel" },
    h("div", { className: "tb-strip-inner" },
      h("span", { style: { fontWeight: 600, fontSize: 11, color: "var(--text-secondary)", flexShrink: 0 } }, toolLabel),
      h("div", { className: "tb-sdiv" }),
      // Tolerance slider (wand only)
      ctx.activeTool === "magicWand" && h("label", { style: { display: "flex", alignItems: "center", gap: 4, fontSize: 11, color: "var(--text-secondary)", flexShrink: 0 } },
        "Tolerance",
        h("input", {
          type: "range", min: 0, max: 100, step: 1, value: ctx.wandTolerance,
          onChange: function(e) { ctx.setWandTolerance(Number(e.target.value)); },
          style: { width: 80 }
        }),
        h("span", { style: { minWidth: 22, textAlign: "right", fontVariantNumeric: "tabular-nums", fontSize: 11 } }, ctx.wandTolerance),
        h("span", { style: { fontSize: 9, color: "var(--text-tertiary)", marginLeft: 1 } },
          ctx.wandTolerance === 0 ? "(exact)" : ctx.wandTolerance <= 5 ? "(similar)" : ctx.wandTolerance <= 15 ? "(broad)" : "(very broad)")
      ),
      ctx.activeTool === "magicWand" && h("div", { className: "tb-sdiv" }),
      // Contiguous / Global toggle (wand only)
      ctx.activeTool === "magicWand" && h("div", { className: "tb-grp" },
        btn("Contiguous", function() { ctx.setWandContiguous(true); }, { active: ctx.wandContiguous, title: "Only select cells connected to the clicked cell" }),
        btn("Global",     function() { ctx.setWandContiguous(false); }, { active: !ctx.wandContiguous, title: "Select all matching cells across the whole pattern" })
      ),
      h("div", { className: "tb-sdiv" }),
      // Op mode buttons
      h("div", { className: "tb-grp" },
        opBtn(svgSelReplace,  "New",       "replace",   "New selection \u2014 replaces any existing"),
        opBtn(svgSelAdd,      "Add",        "add",        "Add to selection (hold Shift)"),
        opBtn(svgSelSubtract, "Subtract",  "subtract",   "Subtract from selection (hold Alt)"),
        opBtn(svgSelIntersect,"Intersect", "intersect",  "Keep only the overlap (hold Shift+Alt)")
      ),
      h("span", { style: { fontSize: 9, color: "var(--text-tertiary)", marginLeft: 2, flexShrink: 0 } }, "Shift / Alt / Shift+Alt")
    )
  ) : null;

  // ─── Second toolbar row: selection status + operations ───────────────────────
  var selRow = hasSelection ? h("div", { className: "tb-strip--sel" },
    h("div", { className: "tb-strip-inner" },
      h("span", { style: { fontWeight: 600, fontSize: 11, color: "var(--text-secondary)", flexShrink: 0 } },
        ctx.selectionCount.toLocaleString() + "\u00a0stitch" + (ctx.selectionCount !== 1 ? "es" : "") + " selected"
      ),
      h("div", { className: "tb-sdiv" }),
      h("div", { className: "tb-grp" },
        btn("Deselect", ctx.clearSelection,   { title: "Deselect all (Esc)" }),
        btn("Invert",   ctx.invertSelection,  { title: "Invert selection (Ctrl+\u21E7+I)" }),
        btn("All",      ctx.selectAll,        { title: "Select all stitches (Ctrl+A)" })
      ),
      h("div", { className: "tb-sdiv" }),
      h("div", { className: "tb-grp" },
        btn("Confetti\u2026",       function() { ctx.setWandPanel(panel === "confetti" ? null : "confetti"); }, { active: panel === "confetti" }),
        btn("Reduce Colours\u2026", function() { ctx.setWandPanel(panel === "reduce"   ? null : "reduce");    }, { active: panel === "reduce" }),
        btn("Replace Colour\u2026", function() { ctx.setWandPanel(panel === "replace"  ? null : "replace");   }, { active: panel === "replace" }),
        btn("Stitch Info\u2026",    function() { ctx.setWandPanel(panel === "info"     ? null : "info");      }, { active: panel === "info" }),
        btn("Outline\u2026",        function() { ctx.setWandPanel(panel === "outline"  ? null : "outline");   }, { active: panel === "outline" })
      )
    )
  ) : null;

  // ─── Confetti panel ──────────────────────────────────────────────────────────
  var confettiPanel = (panel === "confetti" && hasSelection) ? h("div", {
    style: { padding: "10px 14px", background: "#fff7ed", borderBottom: "1px solid #fde68a",
      display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", fontSize: 11 }
  },
    h("strong", { style: { color: "#7c2d12" } }, "Confetti Cleanup in Selection"),
    h("label", { style: { display: "flex", alignItems: "center", gap: 4 } },
      "Min cluster size:",
      h("input", {
        type: "range", min: 1, max: 10, step: 1, value: ctx.confettiThreshold,
        onChange: function(e) { ctx.setConfettiThreshold(Number(e.target.value)); ctx.setConfettiPreview(null); },
        style: { width: 70 }
      }),
      h("span", { style: { minWidth: 14 } }, ctx.confettiThreshold)
    ),
    ctx.confettiPreview
      ? h("span", { style: { color: "#b45309" } }, ctx.confettiPreview.size + " stitches flagged")
      : null,
    btn("Preview", ctx.previewConfettiCleanup, { style: { fontSize: 10 } }),
    btn("Apply", ctx.applyConfettiCleanup, {
      green: true, disabled: !ctx.confettiPreview || !ctx.confettiPreview.size,
      style: { fontSize: 10 }
    }),
    btn("\u00D7", function() { ctx.setWandPanel(null); ctx.setConfettiPreview(null); }, { style: { fontSize: 10 } })
  ) : null;

  // ─── Reduce colours panel ────────────────────────────────────────────────────
  var selColors = ctx.selectionStats ? ctx.selectionStats.colors : 0;
  var reducePanel = (panel === "reduce" && hasSelection) ? h("div", {
    style: { padding: "10px 14px", background: "#f0fdf4", borderBottom: "1px solid #bbf7d0",
      fontSize: 11 }
  },
    h("div", { style: { display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", marginBottom: 6 } },
      h("strong", { style: { color: "#14532d" } }, "Simplify Colours in Selection"),
      h("span", { style: { color: "#166534" } }, selColors + " colours in selection"),
      h("label", { style: { display: "flex", alignItems: "center", gap: 4 } },
        "Target:",
        h("input", {
          type: "number", min: 1, max: selColors, value: ctx.reduceTarget,
          onChange: function(e) { ctx.setReduceTarget(Math.max(1, parseInt(e.target.value) || 1)); ctx.setReducePreview(null); },
          style: { width: 50, padding: "1px 4px" }
        })
      ),
      btn("Preview merges", ctx.previewColorReduction, { style: { fontSize: 10 } }),
      btn("Apply", ctx.applyColorReduction, {
        green: true, disabled: !ctx.reducePreview || !ctx.reducePreview.length,
        style: { fontSize: 10 }
      }),
      btn("\u00D7", function() { ctx.setWandPanel(null); ctx.setReducePreview(null); }, { style: { fontSize: 10 } })
    ),
    ctx.reducePreview && ctx.reducePreview.length ? h("div", {
      style: { maxHeight: 120, overflowY: "auto", borderTop: "1px solid #bbf7d0", paddingTop: 6 }
    },
      ctx.reducePreview.map(function(m, i) {
        var fromE = ctx.cmap && ctx.cmap[m.from];
        var toE   = ctx.cmap && ctx.cmap[m.to];
        return h("div", { key: i, style: { display: "flex", alignItems: "center", gap: 5, marginBottom: 2 } },
          swatch(fromE ? fromE.rgb : null), h("span", null, m.from + " " + m.fromName),
          h("span", { style: { color: "#6b7280" } }, "\u2192"),
          swatch(toE ? toE.rgb : null), h("span", null, m.to + " " + m.toName),
          h("span", { style: { color: "#6b7280" } }, "(" + m.count + " stitches)")
        );
      })
    ) : null
  ) : null;

  // ─── Replace colour panel ────────────────────────────────────────────────────
  var replacePanel = (panel === "replace" && hasSelection) ? (function() {
    var srcEntry = ctx.cmap && ctx.replaceSource ? ctx.cmap[ctx.replaceSource] : null;
    var dstEntry = ctx.cmap && ctx.replaceDest   ? ctx.cmap[ctx.replaceDest]   : null;
    var affectedCount = ctx.selectionReplaceColorCount;

    // Color picker options from current palette
    var palOpts = ctx.pal ? ctx.pal.map(function(p) {
      return h("option", { key: p.id, value: p.id }, p.id + " " + p.name);
    }) : [];

    return h("div", {
      style: { padding: "10px 14px", background: "#fdf4ff", borderBottom: "1px solid #e9d5ff",
        display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", fontSize: 11 }
    },
      h("strong", { style: { color: "#4a044e" } }, "Replace Colour in Selection"),
      h("label", { style: { display: "flex", alignItems: "center", gap: 3 } },
        "Source:", srcEntry ? swatch(srcEntry.rgb) : null,
        h("select", {
          value: ctx.replaceSource || "",
          onChange: function(e) { ctx.setReplaceSource(e.target.value || null); },
          style: { fontSize: 11 }
        }, [h("option", { key: "", value: "" }, "— pick —")].concat(palOpts))
      ),
      h("span", { style: { color: "#6b7280" } }, "\u2192"),
      h("label", { style: { display: "flex", alignItems: "center", gap: 3 } },
        "Target:", dstEntry ? swatch(dstEntry.rgb) : null,
        h("select", {
          value: ctx.replaceDest || "",
          onChange: function(e) { ctx.setReplaceDest(e.target.value || null); },
          style: { fontSize: 11 }
        }, [h("option", { key: "", value: "" }, "— pick —")].concat(palOpts))
      ),
      h("label", { style: { display: "flex", alignItems: "center", gap: 3 } },
        h("input", {
          type: "checkbox", checked: ctx.replaceFuzzy,
          onChange: function(e) { ctx.setReplaceFuzzy(e.target.checked); }
        }), "Fuzzy",
        ctx.replaceFuzzy ? [
          h("input", { key: "tol", type: "range", min: 0, max: 20, step: 1, value: ctx.replaceFuzzyTol,
            onChange: function(e) { ctx.setReplaceFuzzyTol(Number(e.target.value)); },
            style: { width: 50 } }),
          h("span", { key: "v" }, "\u0394E\u2264" + ctx.replaceFuzzyTol)
        ] : null
      ),
      affectedCount > 0 ? h("span", { style: { color: "#7e22ce" } }, affectedCount + " stitches affected") : null,
      btn("Apply", ctx.applyColorReplacement, {
        green: true, disabled: !ctx.replaceSource || !ctx.replaceDest || !affectedCount,
        style: { fontSize: 10 }
      }),
      btn("\u00D7", function() { ctx.setWandPanel(null); }, { style: { fontSize: 10 } })
    );
  })() : null;

  // ─── Stitch info panel ───────────────────────────────────────────────────────
  var infoPanel = (panel === "info") ? (function() {
    var stats = ctx.selectionStats;
    if (!stats) return null;
    var exportCSV = function() {
      var lines = ["DMC,Name,Stitches,Skeins"];
      stats.rows.forEach(function(r) {
        lines.push([r.id, '"' + r.name + '"', r.count, r.skeins.toFixed(2)].join(","));
      });
      lines.push(["TOTAL","",stats.total, stats.totalSkeins.toFixed(2)].join(","));
      var blob = new Blob([lines.join("\n")], { type: "text/csv" });
      var a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = "selection-info.csv";
      a.click();
    };
    return h("div", {
      style: { padding: "10px 14px", background: "#f0f9ff", borderBottom: "1px solid #bae6fd", fontSize: 11 }
    },
      h("div", { style: { display: "flex", alignItems: "center", gap: 8, marginBottom: 6 } },
        h("strong", { style: { color: "#0c4a6e" } }, hasSelection ? "Selection Info" : "Pattern Info"),
        h("span", { style: { color: "#0369a1" } },
          stats.total.toLocaleString() + " stitches, " + stats.colors + " colours, ~" + stats.totalSkeins.toFixed(1) + " skeins"),
        btn("Export CSV", exportCSV, { style: { fontSize: 10 } }),
        btn("\u00D7", function() { ctx.setWandPanel(null); }, { style: { fontSize: 10 } })
      ),
      h("div", { style: { maxHeight: 140, overflowY: "auto" } },
        h("table", { style: { borderCollapse: "collapse", width: "100%" } },
          h("thead", null, h("tr", null,
            h("th", { style: headStyle }, "Colour"),
            h("th", { style: headStyle }, "DMC"),
            h("th", { style: headStyle }, "Name"),
            h("th", { style: { ...headStyle, textAlign: "right" } }, "Stitches"),
            h("th", { style: { ...headStyle, textAlign: "right" } }, "Skeins")
          )),
          h("tbody", null,
            stats.rows.map(function(r, i) {
              return h("tr", { key: r.id, style: { background: i % 2 ? "#f8fafc" : "#fff" } },
                h("td", { style: cellStyle }, swatch(r.rgb)),
                h("td", { style: cellStyle }, r.id),
                h("td", { style: cellStyle }, r.name),
                h("td", { style: { ...cellStyle, textAlign: "right" } }, r.count.toLocaleString()),
                h("td", { style: { ...cellStyle, textAlign: "right" } }, r.skeins.toFixed(2))
              );
            }),
            h("tr", { style: { fontWeight: 700, borderTop: "1px solid #bae6fd" } },
              h("td", { style: cellStyle, colSpan: 3 }, "Total"),
              h("td", { style: { ...cellStyle, textAlign: "right" } }, stats.total.toLocaleString()),
              h("td", { style: { ...cellStyle, textAlign: "right" } }, stats.totalSkeins.toFixed(2))
            )
          )
        )
      )
    );
  })() : null;

  var headStyle = { textAlign: "left", padding: "2px 6px", borderBottom: "1px solid #bae6fd",
    fontWeight: 600, color: "#0369a1", fontSize: 10, whiteSpace: "nowrap" };
  var cellStyle = { padding: "2px 6px", fontSize: 11 };

  // ─── Outline panel ───────────────────────────────────────────────────────────
  var outlinePanel = (panel === "outline" && hasSelection) ? h("div", {
    style: { padding: "10px 14px", background: "#f8fafc", borderBottom: "1px solid #e2e8f0",
      display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", fontSize: 11 }
  },
    h("strong", { style: { color: "#1e293b" } }, "Generate Backstitch Outline"),
    h("label", { style: { display: "flex", alignItems: "center", gap: 4 } },
      "Outline thread (DMC):",
      h("input", {
        type: "text", value: ctx.outlineColor,
        onChange: function(e) { ctx.setOutlineColor(e.target.value.trim()); },
        style: { width: 60, padding: "1px 4px", fontSize: 11 }
      })
    ),
    (function() {
      var dmcEntry = (typeof DMC !== "undefined") ? DMC.find(function(d) { return d.id === ctx.outlineColor; }) : null;
      return dmcEntry ? h("span", { style: { display: "flex", alignItems: "center", gap: 3 } },
        swatch(dmcEntry.rgb), h("span", { style: { color: "#334155" } }, dmcEntry.name)
      ) : h("span", { style: { color: "#ef4444" } }, "Unknown DMC");
    })(),
    btn("Generate", ctx.applyOutlineGeneration, {
      green: true,
      disabled: !(typeof DMC !== "undefined" && DMC.find(function(d) { return d.id === ctx.outlineColor; })),
      style: { fontSize: 10 }
    }),
    btn("\u00D7", function() { ctx.setWandPanel(null); }, { style: { fontSize: 10 } })
  ) : null;

  return h("div", null,
    optionsRow,
    selRow,
    confettiPanel,
    reducePanel,
    replacePanel,
    infoPanel,
    outlinePanel
  );
};
