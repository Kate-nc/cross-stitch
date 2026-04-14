/* creator/SplitPane.js — Split-pane chart/preview view.
   Renders the pattern chart on the left and a preview on the right,
   divided by a draggable vertical divider. Syncs scroll/zoom when enabled.
   On narrow containers (<560px) shows a stacked layout with a collapsible
   preview panel instead.
   Depends on: CreatorContext, PatternCanvas, PreviewCanvas, RealisticCanvas,
               gridCoord (helpers.js global) */

window.CreatorSplitPane = function CreatorSplitPane() {
  var ctx = React.useContext(window.CreatorContext);
  var h = React.createElement;

  var containerRef   = React.useRef(null);
  var rightScrollRef = React.useRef(null);
  var draggingRef    = React.useRef(false);
  var syncingRef     = React.useRef(false);
  var rafSyncRef     = React.useRef(null);

  // Local ratio shadow — updated immediately during drag for smooth visual feedback
  var _ratio = React.useState(ctx.splitPaneRatio || 0.5);
  var ratio = _ratio[0], setRatio = _ratio[1];

  // Narrow mode: container < 560px → stacked layout
  var _narrow = React.useState(false);
  var narrow = _narrow[0], setNarrow = _narrow[1];

  // Mobile: preview collapsed
  var _prevOpen = React.useState(false);
  var setPreviewOpen = _prevOpen[1];
  var previewOpen = _prevOpen[0];

  // Right pane dropdown open
  var _rDrop = React.useState(false);
  var rightDropOpen = _rDrop[0], setRightDropOpen = _rDrop[1];
  var rDropRef = React.useRef(null);

  // ResizeObserver: detect narrow container
  React.useEffect(function() {
    var el = containerRef.current;
    if (!el) return;
    function check(w) { setNarrow(w < 560); }
    var obs = new ResizeObserver(function(entries) {
      check(entries[0].contentRect.width);
    });
    obs.observe(el);
    check(el.clientWidth);
    return function() { obs.disconnect(); };
  }, []);

  // Close right-pane dropdown on outside click
  React.useEffect(function() {
    if (!rightDropOpen) return;
    function close(e) {
      if (rDropRef.current && !rDropRef.current.contains(e.target)) setRightDropOpen(false);
    }
    document.addEventListener("pointerdown", close);
    return function() { document.removeEventListener("pointerdown", close); };
  }, [rightDropOpen]);

  // Divider drag — global pointermove/pointerup listeners
  React.useEffect(function() {
    function onMove(e) {
      if (!draggingRef.current) return;
      var el = containerRef.current;
      if (!el) return;
      var rect = el.getBoundingClientRect();
      var clientX = e.touches ? e.touches[0].clientX : e.clientX;
      var MIN_R = rect.width > 0 ? 280 / rect.width : 0.1;
      // Allow dragging close to edges — exit split mode if past 10% threshold
      var raw = (clientX - rect.left) / rect.width;
      var r = Math.max(Math.min(MIN_R, 0.1), Math.min(Math.max(1 - MIN_R, 0.9), raw));
      setRatio(r);
    }
    function onUp() {
      if (!draggingRef.current) return;
      draggingRef.current = false;
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
      // If dragged past edge threshold → exit split pane
      if (ratio < 0.1 || ratio > 0.9) {
        ctx.setSplitPaneEnabled(false);
        if (typeof UserPrefs !== "undefined") UserPrefs.set("splitPaneEnabled", false);
        return;
      }
      ctx.setSplitPaneRatio(ratio);
      if (typeof UserPrefs !== "undefined") UserPrefs.set("splitPaneRatio", ratio);
    }
    document.addEventListener("pointermove", onMove);
    document.addEventListener("pointerup", onUp);
    return function() {
      document.removeEventListener("pointermove", onMove);
      document.removeEventListener("pointerup", onUp);
    };
  }, [ratio]);

  // Scroll sync: left pane ↔ right pane (debounced to one rAF per direction)
  React.useEffect(function() {
    if (!ctx.splitPaneSyncEnabled) return;
    var left  = ctx.scrollRef.current;
    var right = rightScrollRef.current;
    if (!left || !right) return;

    function syncL2R() {
      if (syncingRef.current) return;
      if (rafSyncRef.current) return;
      rafSyncRef.current = requestAnimationFrame(function() {
        rafSyncRef.current = null;
        if (!ctx.scrollRef.current || !rightScrollRef.current) return;
        syncingRef.current = true;
        rightScrollRef.current.scrollLeft = ctx.scrollRef.current.scrollLeft;
        rightScrollRef.current.scrollTop  = ctx.scrollRef.current.scrollTop;
        syncingRef.current = false;
      });
    }
    function syncR2L() {
      if (syncingRef.current) return;
      if (rafSyncRef.current) return;
      rafSyncRef.current = requestAnimationFrame(function() {
        rafSyncRef.current = null;
        if (!ctx.scrollRef.current || !rightScrollRef.current) return;
        syncingRef.current = true;
        ctx.scrollRef.current.scrollLeft = rightScrollRef.current.scrollLeft;
        ctx.scrollRef.current.scrollTop  = rightScrollRef.current.scrollTop;
        syncingRef.current = false;
      });
    }

    left.addEventListener("scroll",  syncL2R, { passive: true });
    right.addEventListener("scroll", syncR2L, { passive: true });
    return function() {
      left.removeEventListener("scroll",  syncL2R);
      right.removeEventListener("scroll", syncR2L);
      if (rafSyncRef.current) { cancelAnimationFrame(rafSyncRef.current); rafSyncRef.current = null; }
    };
  }, [ctx.splitPaneSyncEnabled]);

  // Context-menu handler for the left pane (chart) scroll container
  function onLeftContextMenu(e) {
    if (ctx.activeTool === "backstitch" && ctx.bsStart) return;
    e.preventDefault();
    if (!ctx.pcRef.current || !ctx.pat) return;
    var gc = gridCoord(ctx.pcRef, e, ctx.cs, ctx.G, false);
    if (!gc || gc.gx < 0 || gc.gx >= ctx.sW || gc.gy < 0 || gc.gy >= ctx.sH) return;
    var idx = gc.gy * ctx.sW + gc.gx;
    var cell = ctx.pat[idx];
    var rcIsHsTool = ctx.partialStitchTool && ctx.partialStitchTool !== "erase";
    if ((ctx.activeTool === "paint" || ctx.activeTool === "fill" || rcIsHsTool) &&
        cell && cell.id !== "__skip__" && cell.id !== "__empty__" &&
        ctx.cmap && ctx.cmap[cell.id]) {
      ctx.setSelectedColorId(cell.id);
      return;
    }
    ctx.setContextMenu({ x: e.clientX, y: e.clientY, gx: gc.gx, gy: gc.gy, idx: idx, cell: cell });
  }

  // Which canvas to render in the right pane
  function rightPaneCanvas() {
    var mode = ctx.rightPaneMode || "level2";
    if (mode === "wysiwyg") {
      return h(window.CreatorPreviewCanvas, null);
    }
    var lvl = mode === "level1" ? 1 : mode === "level3" ? 3 : 2;
    return h(window.CreatorRealisticCanvas, { inputLevel: lvl });
  }

  var MODE_LABELS = {
    "wysiwyg": "WYSIWYG preview",
    "level1":  "Realistic \u2013 Flat",
    "level2":  "Realistic \u2013 Shaded",
    "level3":  "Realistic \u2013 Detailed",
  };
  var RIGHT_MODE_OPTIONS = ["wysiwyg", "level1", "level2", "level3"];

  // Cursor for the chart (left) pane
  var leftCursor = (function() {
    if (ctx.activeTool === "eyedropper") return "copy";
    if (ctx.activeTool === "magicWand" || ctx.activeTool === "lasso") return "crosshair";
    if (ctx.activeTool === "fill") return "cell";
    if (ctx.activeTool === "eraseBs") return "not-allowed";
    if (ctx.activeTool || ctx.partialStitchTool) return "crosshair";
    return "default";
  })();

  // Exit split pane
  function exitSplit() {
    ctx.setSplitPaneEnabled(false);
    if (typeof UserPrefs !== "undefined") UserPrefs.set("splitPaneEnabled", false);
  }

  // Toggle sync
  function toggleSync() {
    var next = !ctx.splitPaneSyncEnabled;
    ctx.setSplitPaneSyncEnabled(next);
    if (typeof UserPrefs !== "undefined") UserPrefs.set("splitPaneSyncEnabled", next);
  }

  // Sync icon SVG
  function renderSyncIcon(locked) {
    return h("svg", { width: 12, height: 12, viewBox: "0 0 14 14", fill: "none",
      stroke: locked ? "#0d9488" : "#94a3b8", strokeWidth: 1.6, strokeLinecap: "round", strokeLinejoin: "round" },
      locked
        ? [h("path",  { key: "shackle", d: "M4 6V4.5a3 3 0 016 0V6" }),
           h("rect",  { key: "body",    x: "2.5", y: "6", width: "9", height: "6.5", rx: "1.5" })]
        : [h("path",  { key: "shackle", d: "M4 6V4.5a3 3 0 014.5-2.7" }),
           h("rect",  { key: "body",    x: "2.5", y: "6", width: "9", height: "6.5", rx: "1.5" })]
    );
  }

  var hdrStyle = {
    display: "flex", alignItems: "center", gap: 4, padding: "3px 8px",
    background: "#f8fafc", borderBottom: "0.5px solid #e2e8f0",
    fontSize: 11, fontWeight: 600, color: "#475569", userSelect: "none", flexShrink: 0,
  };

  // ── Mobile / narrow stacked layout ─────────────────────────────────────────
  if (narrow) {
    return h("div", { ref: containerRef, style: { width: "100%" } },
      // Chart pane — full width
      h("div", {
        ref: ctx.scrollRef,
        style: { overflow: "auto", maxHeight: 400, border: "0.5px solid #e2e8f0", borderRadius: "8px 8px 0 0", background: "#f1f5f9", cursor: leftCursor },
        onContextMenu: onLeftContextMenu,
      }, h(window.PatternCanvas, null)),

      // Preview toggle handle
      h("div", {
        onClick: function() { setPreviewOpen(function(o) { return !o; }); },
        style: {
          display: "flex", alignItems: "center", justifyContent: "space-between",
          padding: "5px 10px", background: "#f1f5f9", border: "0.5px solid #e2e8f0",
          cursor: "pointer", fontSize: 11, color: "#475569", fontWeight: 500, userSelect: "none",
        },
      },
        h("span", null, previewOpen ? "\u25B2 Hide preview" : "\u25BC Show preview"),
        h("button", {
          onClick: function(e) { e.stopPropagation(); exitSplit(); },
          style: { background: "none", border: "none", cursor: "pointer", color: "#94a3b8", fontSize: 14, padding: "0 2px", lineHeight: 1 },
          title: "Exit split view",
        }, "\xD7")
      ),

      // Preview pane (collapsible)
      previewOpen && h("div", {
        ref: rightScrollRef,
        style: { overflow: "auto", maxHeight: 220, border: "0.5px solid #e2e8f0", borderRadius: "0 0 8px 8px", background: "#f1f5f9" },
      }, rightPaneCanvas())
    );
  }

  // ── Desktop split layout ────────────────────────────────────────────────────
  return h("div", {
    ref: containerRef,
    style: {
      display: "flex", width: "100%", height: 550,
      border: "0.5px solid #e2e8f0", borderRadius: 8, overflow: "hidden", position: "relative",
    },
  },

    // ── Left pane (chart) ───────────────────────────────────────────────────
    h("div", {
      style: {
        display: "flex", flexDirection: "column",
        width: Math.round(ratio * 10000) / 100 + "%",
        minWidth: 0, overflow: "hidden", flexShrink: 0,
      },
    },
      // Pane header
      h("div", { style: hdrStyle },
        h("span", { style: { fontVariantCaps: "small-caps", letterSpacing: 0.3 } }, "Chart"),
        h("span", { style: { flex: 1 } }),
        h("button", {
          onClick: exitSplit, title: "Exit split view",
          style: { background: "none", border: "none", cursor: "pointer", color: "#94a3b8", fontSize: 14, padding: "0 2px", lineHeight: 1 },
        }, "\xD7")
      ),
      // Chart scroll container — this IS ctx.scrollRef
      h("div", {
        ref: ctx.scrollRef,
        style: { flex: 1, overflow: "auto", background: "#f1f5f9", cursor: leftCursor },
        onContextMenu: onLeftContextMenu,
      }, h(window.PatternCanvas, null))
    ),

    // ── Divider ────────────────────────────────────────────────────────────
    h("div", {
      style: {
        width: 6, flexShrink: 0, cursor: "col-resize",
        background: "#e2e8f0", position: "relative",
        display: "flex", flexDirection: "column",
        alignItems: "center", justifyContent: "center", gap: 4,
        zIndex: 10, userSelect: "none",
      },
      onPointerDown: function(e) {
        draggingRef.current = true;
        document.body.style.cursor = "col-resize";
        document.body.style.userSelect = "none";
        e.preventDefault();
      },
    },
      // Sync lock button
      h("button", {
        onClick: toggleSync,
        title: ctx.splitPaneSyncEnabled ? "Scroll sync on \u2014 click to disable" : "Scroll sync off \u2014 click to enable",
        style: {
          background: ctx.splitPaneSyncEnabled ? "#e0fdf4" : "#fff",
          border: "1px solid " + (ctx.splitPaneSyncEnabled ? "#0d9488" : "#d1d5db"),
          borderRadius: 4, width: 20, height: 20, padding: 0, cursor: "pointer",
          display: "flex", alignItems: "center", justifyContent: "center",
          boxShadow: "0 1px 2px rgba(0,0,0,0.08)",
        },
      }, renderSyncIcon(ctx.splitPaneSyncEnabled)),

      // Drag handle dots
      h("div", { style: { display: "flex", flexDirection: "column", gap: 2, opacity: 0.4, marginTop: 4 } },
        h("span", { style: { width: 3, height: 3, borderRadius: "50%", background: "#64748b" } }),
        h("span", { style: { width: 3, height: 3, borderRadius: "50%", background: "#64748b" } }),
        h("span", { style: { width: 3, height: 3, borderRadius: "50%", background: "#64748b" } })
      )
    ),

    // ── Right pane (preview) ──────────────────────────────────────────────
    h("div", {
      style: { display: "flex", flexDirection: "column", flex: 1, minWidth: 0, overflow: "hidden" },
    },
      // Pane header with mode selector
      h("div", { style: hdrStyle },
        h("div", { ref: rDropRef, style: { position: "relative" } },
          h("button", {
            onClick: function() { setRightDropOpen(function(o) { return !o; }); },
            style: {
              background: "none", border: "none", cursor: "pointer",
              fontSize: 11, fontWeight: 600, color: "#475569",
              display: "flex", alignItems: "center", gap: 2, padding: 0,
            },
          },
            MODE_LABELS[ctx.rightPaneMode || "level2"] || "Preview",
            h("span", { style: { fontSize: 9, marginLeft: 2 } }, "\u25BE")
          ),
          rightDropOpen && h("div", {
            style: {
              position: "absolute", top: "100%", left: 0, marginTop: 2,
              background: "#fff", border: "0.5px solid #e2e8f0",
              borderRadius: 6, boxShadow: "0 4px 12px rgba(0,0,0,0.1)",
              zIndex: 200, minWidth: 180, padding: "4px 0",
            },
          },
            RIGHT_MODE_OPTIONS.map(function(m) {
              return h("button", {
                key: m,
                onClick: function() {
                  ctx.setRightPaneMode(m);
                  if (typeof UserPrefs !== "undefined") UserPrefs.set("rightPaneMode", m);
                  setRightDropOpen(false);
                },
                style: {
                  display: "block", width: "100%", textAlign: "left",
                  padding: "5px 12px", background: ctx.rightPaneMode === m ? "#f0fdfa" : "none",
                  border: "none", cursor: "pointer", fontSize: 11,
                  color: ctx.rightPaneMode === m ? "#0d9488" : "#475569",
                  fontWeight: ctx.rightPaneMode === m ? 600 : 400,
                },
              }, MODE_LABELS[m]);
            })
          )
        ),
        h("span", { style: { flex: 1 } }),
        h("button", {
          onClick: exitSplit, title: "Exit split view",
          style: { background: "none", border: "none", cursor: "pointer", color: "#94a3b8", fontSize: 14, padding: "0 2px", lineHeight: 1 },
        }, "\xD7")
      ),

      // Right pane scroll container
      h("div", {
        ref: rightScrollRef,
        style: { flex: 1, overflow: "auto", background: "#f1f5f9" },
      }, rightPaneCanvas())
    )
  );
};
