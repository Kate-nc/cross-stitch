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

  // ─── Op mode buttons (shared across wand + lasso) ───────────────────────────
  // btn variant that shows both persistent-active and modifier-active states
  function opBtn(label, mode, title) {
    var isPersistent = ctx.wandOpMode === mode;
    var isModifier   = ctx.selectionModifier === mode;
    var className = "tb-btn" +
      (isPersistent ? " tb-btn--on" : "") +
      (isModifier   ? " tb-btn--mod-active" : "");
    return h("button", {
      className: className,
      onClick: function() { ctx.setSelectionOpMode(mode); },
      title: title,
      style: { fontSize: 11, padding: "3px 8px", position: "relative" }
    }, label,
      isModifier && h("span", {
        style: { position: "absolute", top: -4, right: -4, background: "#f59e0b",
          color: "#fff", borderRadius: 99, fontSize: 8, width: 12, height: 12,
          display: "flex", alignItems: "center", justifyContent: "center", lineHeight: 1,
          boxShadow: "0 0 0 1px #fff", pointerEvents: "none" }
      }, "\u2022")
    );
  }

  // ─── Wand options bar ────────────────────────────────────────────────────────
  var toolLabel = ctx.activeTool === "lasso" ? "\uD83E\uDD1F Lasso" : "\u2728 Wand";
  var wandOptionsBar = isSelTool ? h("div", {
    style: { display: "flex", alignItems: "center", gap: 8, padding: "5px 10px",
      background: "#f0f9ff", borderBottom: "1px solid #bae6fd", flexWrap: "wrap", fontSize: 11 }
  },
    h("span", { style: { fontWeight: 600, color: "#0369a1" } }, toolLabel),
    h("div", { className: "tb-sdiv" }),
    // Tolerance (wand only)
    ctx.activeTool === "magicWand" && h("label", { style: { display: "flex", alignItems: "center", gap: 4, color: "#52525b" } },
      "Tolerance:",
      h("input", {
        type: "range", min: 0, max: 100, step: 1, value: ctx.wandTolerance,
        onChange: function(e) { ctx.setWandTolerance(Number(e.target.value)); },
        style: { width: 80 }
      }),
      h("span", { style: { minWidth: 24, textAlign: "right" } }, ctx.wandTolerance),
      h("span", { style: { fontSize: 9, color: "#94a3b8", marginLeft: 2 } },
        ctx.wandTolerance === 0 ? "(exact)" : ctx.wandTolerance <= 5 ? "(similar)" : ctx.wandTolerance <= 15 ? "(broad)" : "(very broad)")
    ),
    ctx.activeTool === "magicWand" && h("div", { className: "tb-sdiv" }),
    // Contiguous toggle (wand only)
    ctx.activeTool === "magicWand" && h("div", { className: "tb-grp" },
      btn("Contiguous", function() { ctx.setWandContiguous(true); }, { active: ctx.wandContiguous }),
      btn("Global", function() { ctx.setWandContiguous(false); }, { active: !ctx.wandContiguous })
    ),
    h("div", { className: "tb-sdiv" }),
    // Op mode — shared across wand and lasso.
    // Buttons: persistent mode shows tb-btn--on; modifier-held shows tb-btn--mod-active
    h("div", { className: "tb-grp" },
      opBtn("New",       "replace",   "New selection — replaces any existing (default)"),
      opBtn("+",         "add",        "Add to selection (or hold Shift)"),
      opBtn("\u2212",    "subtract",   "Subtract from selection (or hold Alt)"),
      opBtn("\u2229",    "intersect",  "Intersect with selection (or hold Shift+Alt)")
    ),
    // Keyboard hint
    h("span", { style: { fontSize: 9, color: "#94a3b8", marginLeft: 4 } }, "Shift / Alt / Shift+Alt")
  ) : null;

  // ─── Selection status bar ────────────────────────────────────────────────────
  var selBar = hasSelection ? h("div", {
    style: { display: "flex", alignItems: "center", gap: 8, padding: "4px 10px",
      background: "#fefce8", borderBottom: "1px solid #fde68a", flexWrap: "wrap", fontSize: 11 }
  },
    h("span", { style: { fontWeight: 600, color: "#92400e" } },
      "Selected: " + ctx.selectionCount.toLocaleString() + " stitch" + (ctx.selectionCount !== 1 ? "es" : "")
    ),
    h("div", { className: "tb-sdiv" }),
    btn("Deselect (Esc)", ctx.clearSelection, { style: { fontSize: 10 } }),
    btn("Invert (Ctrl+\u21E7+I)", ctx.invertSelection, { style: { fontSize: 10 } }),
    btn("Select All (Ctrl+A)", ctx.selectAll, { style: { fontSize: 10 } }),
    h("div", { className: "tb-sdiv" }),
    // Operations
    btn("Confetti\u2026", function() { ctx.setWandPanel(panel === "confetti" ? null : "confetti"); }, { active: panel === "confetti", style: { fontSize: 10 } }),
    btn("Reduce Colours\u2026", function() { ctx.setWandPanel(panel === "reduce" ? null : "reduce"); }, { active: panel === "reduce", style: { fontSize: 10 } }),
    btn("Replace Colour\u2026", function() { ctx.setWandPanel(panel === "replace" ? null : "replace"); }, { active: panel === "replace", style: { fontSize: 10 } }),
    btn("Stitch Info\u2026", function() { ctx.setWandPanel(panel === "info" ? null : "info"); }, { active: panel === "info", style: { fontSize: 10 } }),
    btn("Generate Outline\u2026", function() { ctx.setWandPanel(panel === "outline" ? null : "outline"); }, { active: panel === "outline", style: { fontSize: 10 } })
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

  return h("div", { style: { borderBottom: "1px solid #e4e4e7" } },
    wandOptionsBar,
    selBar,
    confettiPanel,
    reducePanel,
    replacePanel,
    infoPanel,
    outlinePanel
  );
};
