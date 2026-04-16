/* creator/DiagnosticsPanel.js — Pattern analysis / diagnostics panel.
   Shows confetti, heat map, and symbol readability diagnostics.
   Reads from AppContext (open state) and CanvasContext (enabled, settings, results).
   Depends on: context.js */

window.DiagnosticsPanel = function DiagnosticsPanel() {
  var app = window.useApp();
  var cv  = window.useCanvas();
  var h   = React.createElement;

  if (!app.diagnosticsOpen) return null;

  var enabled  = cv.diagnosticsEnabled  || { confetti: false, heatmap: false, readability: false };
  var settings = cv.diagnosticsSettings || { confetti: { threshold: 3 }, heatmap: { metric: "colorcount", blockSize: 10 }, readability: {} };
  var results  = cv.diagnosticsResults  || { confetti: null, heatmap: null, readability: null };

  // ── Helper: toggle a single diagnostic on/off ──────────────────────────────
  function toggle(key) {
    var next = Object.assign({}, enabled, { [key]: !enabled[key] });
    cv.setDiagnosticsEnabled(next);
  }

  // ── Helper: update a settings field ───────────────────────────────────────
  function setSetting(diag, field, value) {
    var prev = settings[diag] || {};
    cv.setDiagnosticsSettings(Object.assign({}, settings, { [diag]: Object.assign({}, prev, { [field]: value }) }));
  }

  // ── Toggle switch component ────────────────────────────────────────────────
  function ToggleSwitch(props) {
    return h("div", {
      role: "switch",
      "aria-checked": !!props.checked,
      tabIndex: 0,
      onClick: props.onChange,
      onKeyDown: function(e) { if (e.key === " " || e.key === "Enter") { e.preventDefault(); props.onChange(); } },
      style: { position: "relative", display: "inline-block", width: 28, height: 16, flexShrink: 0, cursor: "pointer" }
    },
      h("span", { style: { display: "block", position: "absolute", inset: 0, borderRadius: 8,
        background: props.checked ? "#0d9488" : "#cbd5e1", transition: "background 0.15s" } }),
      h("span", { style: { display: "block", position: "absolute", width: 12, height: 12, top: 2,
        left: props.checked ? 14 : 2, borderRadius: "50%", background: "#fff",
        transition: "left 0.15s", boxShadow: "0 1px 3px rgba(0,0,0,0.2)" } })
    );
  }

  // ── Issue badge ────────────────────────────────────────────────────────────
  function Badge(props) {
    if (props.count === 0) {
      return h("span", { title: "No issues found",
        style: { fontSize: 10, color: "#16a34a", fontWeight: 600 } }, "\u2713");
    }
    return h("span", { style: { fontSize: 10, fontWeight: 700, padding: "1px 6px", borderRadius: 8,
      background: props.danger ? "#fef2f2" : "#fefce8",
      color: props.danger ? "#dc2626" : "#92400e",
      border: "1px solid " + (props.danger ? "#fecaca" : "#fef08a") } },
      props.count.toLocaleString()
    );
  }

  // ── Tiny colour swatch ─────────────────────────────────────────────────────
  function Swatch(rgb) {
    return h("span", { style: { display: "inline-block", width: 10, height: 10, borderRadius: 2,
      background: "rgb(" + rgb + ")", border: "0.5px solid rgba(0,0,0,0.15)",
      flexShrink: 0, verticalAlign: "middle", marginRight: 3 } });
  }

  // ── Score badge ────────────────────────────────────────────────────────────
  function ScoreBadge(score, thresholds) {
    // thresholds: [{max, color, label}]
    var tier = { color: "#16a34a", label: "Excellent" };
    for (var i = 0; i < thresholds.length; i++) {
      if (score <= thresholds[i].max) { tier = thresholds[i]; break; }
    }
    if (!thresholds.some(function(t) { return score <= t.max; })) {
      tier = thresholds[thresholds.length - 1];
    }
    return h("span", { style: { fontSize: 10, fontWeight: 700, padding: "1px 6px", borderRadius: 6,
      background: tier.color + "1a", color: tier.color, border: "1px solid " + tier.color + "33" } },
      tier.label + " (" + score.toFixed(1) + "%)");
  }

  // ─── Confetti section content ──────────────────────────────────────────────
  var confettiContent = (enabled.confetti && results.confetti) ? (function() {
    var d = results.confetti;
    var scoreThresholds = [
      { max: 5,   color: "#16a34a", label: "Clean"       },
      { max: 15,  color: "#d97706", label: "Moderate"    },
      { max: 100, color: "#dc2626", label: "High confetti" }
    ];
    return h("div", { style: { marginTop: 8, paddingTop: 8, borderTop: "0.5px solid #e2e8f0" } },
      // Threshold slider
      h("div", { style: { display: "flex", alignItems: "center", gap: 6, marginBottom: 6 } },
        h("span", { style: { fontSize: 11, color: "#64748b", flexShrink: 0 } }, "Threshold"),
        h("input", { type: "range", min: 1, max: 10, step: 1,
          value: settings.confetti.threshold || 3,
          onChange: function(e) { setSetting("confetti", "threshold", parseInt(e.target.value)); },
          style: { flex: 1, accentColor: "#0d9488" }
        }),
        h("span", { style: { fontSize: 11, fontVariantNumeric: "tabular-nums", width: 14, textAlign: "right", flexShrink: 0 } },
          settings.confetti.threshold || 3)
      ),
      // Stats
      h("div", { style: { display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 6 } },
        h("div", null,
          h("div", { style: { fontSize: 10, color: "#94a3b8" } }, "Flagged stitches"),
          h("div", { style: { fontSize: 13, fontWeight: 700, color: "#1e293b" } }, d.count.toLocaleString())
        ),
        h("div", null,
          h("div", { style: { fontSize: 10, color: "#94a3b8" } }, "Confetti score"),
          ScoreBadge(d.score, scoreThresholds)
        )
      ),
      // Severity legend
      h("div", { style: { display: "flex", gap: 6, marginBottom: 6, flexWrap: "wrap" } },
        h("span", { style: { display: "flex", alignItems: "center", gap: 3, fontSize: 10, color: "#64748b" } },
          h("span", { style: { display: "inline-block", width: 10, height: 10, background: "rgba(255,23,68,0.6)", borderRadius: 1 } }), "Single"),
        h("span", { style: { display: "flex", alignItems: "center", gap: 3, fontSize: 10, color: "#64748b" } },
          h("span", { style: { display: "inline-block", width: 10, height: 10, background: "rgba(255,87,34,0.5)", borderRadius: 1 } }), "Pair"),
        h("span", { style: { display: "flex", alignItems: "center", gap: 3, fontSize: 10, color: "#64748b" } },
          h("span", { style: { display: "inline-block", width: 10, height: 10, background: "rgba(255,193,7,0.4)", borderRadius: 1 } }), "Cluster")
      ),
      // Top offending colours
      d.byColor.length > 0 && h("div", null,
        h("div", { style: { fontSize: 10, fontWeight: 600, color: "#94a3b8", textTransform: "uppercase", marginBottom: 4 } },
          "Top confetti colours"),
        d.byColor.map(function(c) {
          return h("div", { key: c.id, style: { display: "flex", alignItems: "center", gap: 4, marginBottom: 2 } },
            Swatch(c.rgb), h("span", { style: { fontSize: 10, fontWeight: 600, color: "#475569", minWidth: 28 } }, c.id),
            h("span", { style: { fontSize: 10, color: "#94a3b8", flex: 1 } }, ""),
            h("span", { style: { fontSize: 10, fontWeight: 600, color: "#1e293b" } }, c.count.toLocaleString(), " st")
          );
        })
      )
    );
  })() : null;

  // ─── Heatmap section content ───────────────────────────────────────────────
  var heatmapContent = (enabled.heatmap && results.heatmap) ? (function() {
    var d = results.heatmap;
    var isFragmentation = (settings.heatmap.metric || "colorcount") === "fragmentation";

    // Distribution — count blocks in each band
    var bands = isFragmentation
      ? [[5,"#e8f5e9"],[15,"#81c784"],[25,"#fff176"],[40,"#ffb74d"],[60,"#ff8a65"],["∞","#ef5350"]]
      : [[2,"#e8f5e9"],[5,"#81c784"],[8,"#fff176"],[12,"#ffb74d"],[16,"#ff8a65"],["∞","#ef5350"]];
    var bandCounts = bands.map(function() { return 0; });
    (d.blocks || []).forEach(function(block) {
      var v = block.value;
      for (var bi = 0; bi < bands.length; bi++) {
        var max = bands[bi][0];
        if (max === "\u221E" || v <= max) { bandCounts[bi]++; break; }
      }
    });
    var maxBandCount = Math.max.apply(null, bandCounts) || 1;

    return h("div", { style: { marginTop: 8, paddingTop: 8, borderTop: "0.5px solid #e2e8f0" } },
      // Metric toggle
      h("div", { style: { display: "flex", gap: 4, marginBottom: 6 } },
        ["colorcount", "fragmentation"].map(function(m) {
          var labels = { colorcount: "Colour count", fragmentation: "Fragmentation" };
          var active = (settings.heatmap.metric || "colorcount") === m;
          return h("button", { key: m, onClick: function() { setSetting("heatmap", "metric", m); },
            style: { flex: 1, fontSize: 10, padding: "4px 0", borderRadius: 4, cursor: "pointer",
              border: "1px solid " + (active ? "#0d9488" : "#e2e8f0"),
              background: active ? "#0d9488" : "#f8fafc", color: active ? "#fff" : "#475569",
              fontWeight: active ? 700 : 400 }
          }, labels[m]);
        })
      ),
      // Block size
      h("div", { style: { display: "flex", alignItems: "center", gap: 6, marginBottom: 6 } },
        h("span", { style: { fontSize: 11, color: "#64748b", flexShrink: 0 } }, "Block size"),
        [5, 10, 20].map(function(sz) {
          var active = (settings.heatmap.blockSize || 10) === sz;
          return h("button", { key: sz, onClick: function() { setSetting("heatmap", "blockSize", sz); },
            style: { flex: 1, fontSize: 10, padding: "3px 0", borderRadius: 4, cursor: "pointer",
              border: "1px solid " + (active ? "#0d9488" : "#e2e8f0"),
              background: active ? "#0d9488" : "#f8fafc", color: active ? "#fff" : "#475569",
              fontWeight: active ? 700 : 400 }
          }, sz + "\xD7" + sz);
        })
      ),
      // Stats
      d.worstBlock && h("div", { style: { display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 8 } },
        h("div", null,
          h("div", { style: { fontSize: 10, color: "#94a3b8" } }, "Avg " + (isFragmentation ? "clusters" : "colours") + " / block"),
          h("div", { style: { fontSize: 13, fontWeight: 700, color: "#1e293b" } }, d.avgValue.toFixed(1))
        ),
        h("div", null,
          h("div", { style: { fontSize: 10, color: "#94a3b8" } }, "Peak block"),
          h("div", { style: { fontSize: 12, fontWeight: 700, color: "#dc2626" } },
            d.worstBlock.value, " @ (", d.worstBlock.x + 1, ",", d.worstBlock.y + 1, ")")
        )
      ),
      // Distribution histogram
      h("div", { style: { marginBottom: 4 } },
        h("div", { style: { fontSize: 10, fontWeight: 600, color: "#94a3b8", textTransform: "uppercase", marginBottom: 4 } },
          "Distribution"),
        h("div", { style: { display: "flex", gap: 2, alignItems: "flex-end", height: 30 } },
          bands.map(function(band, bi) {
            var pct = Math.round(bandCounts[bi] / maxBandCount * 100);
            return h("div", { key: bi, title: (bi < bands.length-1 ? "\u2264" : ">") + bands[Math.max(0,bi-1)][0] + ": " + bandCounts[bi] + " blocks",
              style: { flex: 1, height: Math.max(2, pct * 0.28) + "px", background: band[1],
                border: "0.5px solid rgba(0,0,0,0.1)", borderRadius: 2, cursor: "default" } });
          })
        ),
        h("div", { style: { display: "flex", gap: 2, marginTop: 2 } },
          bands.map(function(band, bi) {
            return h("div", { key: bi, style: { flex: 1, textAlign: "center", fontSize: 9, color: "#94a3b8" } },
              band[0] === "\u221E" ? "17+" : band[0]);
          })
        )
      )
    );
  })() : null;

  // ─── Readability section content ───────────────────────────────────────────
  var readabilityContent = (enabled.readability && results.readability) ? (function() {
    var d = results.readability;
    var scoreThresholds = [
      { max: 100, color: "#16a34a", label: "No issues" },
      { max: 99,  color: "#d97706", label: "Minor"     },
      { max: 95,  color: "#dc2626", label: "Poor"      }
    ];
    // Reverse: score 100 is "No issues", low score is "Poor"
    var tier;
    if (d.score >= 99) tier = { color: "#16a34a", label: "No issues" };
    else if (d.score >= 95) tier = { color: "#d97706", label: "Some issues" };
    else tier = { color: "#dc2626", label: "Poor readability" };

    return h("div", { style: { marginTop: 8, paddingTop: 8, borderTop: "0.5px solid #e2e8f0" } },
      h("div", { style: { display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 6 } },
        h("div", null,
          h("div", { style: { fontSize: 10, color: "#94a3b8" } }, "Fail (< 3:1)"),
          h("div", { style: { fontSize: 13, fontWeight: 700, color: d.failCount > 0 ? "#dc2626" : "#16a34a" } },
            d.failCount.toLocaleString())
        ),
        h("div", null,
          h("div", { style: { fontSize: 10, color: "#94a3b8" } }, "Warn (< 4.5:1)"),
          h("div", { style: { fontSize: 13, fontWeight: 700, color: d.warnCount > 0 ? "#d97706" : "#16a34a" } },
            d.warnCount.toLocaleString())
        ),
        h("div", null,
          h("div", { style: { fontSize: 10, color: "#94a3b8" } }, "Readability score"),
          h("span", { style: { fontSize: 11, fontWeight: 700, padding: "1px 6px", borderRadius: 6,
            background: tier.color + "1a", color: tier.color, border: "1px solid " + tier.color + "33" } },
            tier.label + " (" + d.score.toFixed(1) + "%)")
        )
      ),
      // Legend
      h("div", { style: { display: "flex", gap: 8, marginBottom: 6 } },
        h("span", { style: { display: "flex", alignItems: "center", gap: 3, fontSize: 10, color: "#64748b" } },
          h("span", { style: { fontSize: 11, color: "#D32F2F", fontWeight: 700 } }, "\u26A0"), " Fail"),
        h("span", { style: { display: "flex", alignItems: "center", gap: 3, fontSize: 10, color: "#64748b" } },
          h("span", { style: { fontSize: 11, color: "#F9A825", fontWeight: 700 } }, "\u26A0"), " Warning")
      ),
      // Top problem colours
      d.byColor.length > 0 && h("div", null,
        h("div", { style: { fontSize: 10, fontWeight: 600, color: "#94a3b8", textTransform: "uppercase", marginBottom: 4 } },
          "Problem colours"),
        d.byColor.slice(0, 5).map(function(c) {
          return h("div", { key: c.id, style: { display: "flex", alignItems: "center", gap: 4, marginBottom: 3 } },
            Swatch(c.rgb),
            h("span", { style: { fontSize: 10, fontWeight: 600, color: "#475569", minWidth: 28, flexShrink: 0 } }, c.id),
            c.failCount > 0 && h("span", { style: { fontSize: 10, color: "#dc2626", flexShrink: 0 } }, c.failCount + " \u2717"),
            c.warnCount > 0 && h("span", { style: { fontSize: 10, color: "#d97706", flexShrink: 0 } }, c.warnCount + " \u26A0")
          );
        })
      )
    );
  })() : null;

  // ── Counts for badges ──────────────────────────────────────────────────────
  var confettiCount = (enabled.confetti && results.confetti) ? results.confetti.count : -1;
  var heatmapPeak   = (enabled.heatmap  && results.heatmap)  ? (results.heatmap.maxValue || 0) : -1;
  var readBadCount  = (enabled.readability && results.readability)
    ? results.readability.failCount + results.readability.warnCount : -1;

  // ── Multiple-active notice ────────────────────────────────────────────────
  var activeCount = (enabled.confetti ? 1 : 0) + (enabled.heatmap ? 1 : 0) + (enabled.readability ? 1 : 0);

  // ─── Row renderer ─────────────────────────────────────────────────────────
  function DiagRow(props) {
    var on = props.on;
    var count = props.count; // -1 = not yet computed
    return h("div", { style: { marginBottom: on ? 6 : 2 } },
      h("div", { style: { display: "flex", alignItems: "center", gap: 6, padding: "4px 0" } },
        h(ToggleSwitch, { checked: on, onChange: function() { toggle(props.id); } }),
        h("span", { style: { flex: 1, fontSize: 12, fontWeight: on ? 600 : 400,
          color: on ? "#1e293b" : "#64748b", userSelect: "none", cursor: "pointer" },
          onClick: function() { toggle(props.id); }
        }, props.icon + " " + props.label),
        on && count >= 0 && h(Badge, { count: count, danger: props.id === "readability" && count > 0 })
      ),
      on && props.children
    );
  }

  return h("div", {
    style: {
      position: "relative", background: "#fff", border: "1px solid #e2e8f0",
      borderRadius: 10, padding: "10px 12px", marginBottom: 8,
      boxShadow: "0 2px 8px rgba(0,0,0,0.08)", maxWidth: "100%"
    }
  },
    // Header
    h("div", { style: { display: "flex", alignItems: "center", gap: 6, marginBottom: 8 } },
      h("span", { style: { fontSize: 13, fontWeight: 700, color: "#1e293b", flex: 1 } }, "\uD83D\uDD0D Diagnostics"),
      activeCount > 0 && h("button", {
        onClick: function() {
          cv.setDiagnosticsEnabled({ confetti: false, heatmap: false, readability: false });
        },
        style: { fontSize: 10, padding: "2px 7px", borderRadius: 4, border: "1px solid #e2e8f0",
          background: "#f8fafc", color: "#64748b", cursor: "pointer" }
      }, "Clear all"),
      h("button", {
        onClick: function() { app.setDiagnosticsOpen(false); },
        style: { fontSize: 13, background: "none", border: "none", cursor: "pointer",
          color: "#94a3b8", lineHeight: 1, padding: "0 2px" }
      }, "\xD7")
    ),

    // Multiple diagnostics notice
    activeCount > 1 && h("div", { style: { fontSize: 10, color: "#94a3b8", fontStyle: "italic",
      background: "#f8fafc", borderRadius: 4, padding: "3px 7px", marginBottom: 8 } },
      "Multiple diagnostics active \u2014 consider reviewing one at a time for clarity."),

    h(DiagRow, { id: "confetti", label: "Confetti Warning", icon: "\u26A0\uFE0F", on: enabled.confetti, count: confettiCount },
      confettiContent),

    h("div", { style: { borderTop: "0.5px solid #f1f5f9", marginBottom: 4 } }),

    h(DiagRow, { id: "heatmap", label: "Stitch Density Map", icon: "\uD83C\uDF21\uFE0F", on: enabled.heatmap, count: heatmapPeak },
      heatmapContent),

    h("div", { style: { borderTop: "0.5px solid #f1f5f9", marginBottom: 4 } }),

    h(DiagRow, { id: "readability", label: "Symbol Readability", icon: "\uD83D\uDC41\uFE0F", on: enabled.readability, count: readBadCount },
      readabilityContent)
  );
};
