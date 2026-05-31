/* creator/PatternTab.js — The pattern view tab (canvas area + palette chips).
   Reads from CreatorContext and GenerationContext.
   Loaded as a plain <script> before the main Babel script.
   Depends on: PatternCanvas (PatternCanvas.js), Tooltip (components.js),
               CreatorContext, GenerationContext (context.js) */

window.CreatorPatternTab = function CreatorPatternTab() {
  var ctx = window.usePatternData();
  var cv = window.useCanvas();
  var app = window.useApp();
  var gen = window.useGeneration();
  // Hover coords live in their own context (action plan H5 = 2B.1).
  var hov = window.useHover() || {};
  var h = React.createElement;

  var _dismissed = React.useState(false); var confettiBannerDismissed = _dismissed[0], setConfettiBannerDismissed = _dismissed[1];
  var prevConfettiKeyRef = React.useRef(null);
  React.useEffect(function() {
    var newKey = app.confettiData ? (app.confettiData.raw.singles + "|" + app.confettiData.clean.singles) : null;
    if (prevConfettiKeyRef.current !== newKey) {
      prevConfettiKeyRef.current = newKey;
      if (newKey) setConfettiBannerDismissed(false);
    }
  }, [app.confettiData]);

  // Track Shift/Alt modifier keys when a selection tool is active.
  // Updates cv.selectionModifier so MagicWandPanel can show the effective mode.
  // Must be declared before any early returns (Rules of Hooks).
  React.useEffect(function() {
    if (cv.activeTool !== "magicWand" && cv.activeTool !== "lasso") {
      cv.setSelectionModifier(null);
      return;
    }
    function update(e) {
      if (e.shiftKey && e.altKey)  cv.setSelectionModifier("intersect");
      else if (e.shiftKey)         cv.setSelectionModifier("add");
      else if (e.altKey)           cv.setSelectionModifier("subtract");
      else                         cv.setSelectionModifier(null);
    }
    window.addEventListener("keydown", update);
    window.addEventListener("keyup",   update);
    return function() {
      window.removeEventListener("keydown", update);
      window.removeEventListener("keyup",   update);
      cv.setSelectionModifier(null);
    };
  }, [cv.activeTool]);

  if (!(ctx.pat && ctx.pal)) return null;
  if (app.tab !== "pattern") return null;

  // PaletteSwap confirm view takes over when active
  if (cv.paletteSwap && cv.paletteSwap.showConfirm) {
    return cv.paletteSwap.confirmView || null;
  }

  // Build status text
  var statusText;
  if (app.eyedropperEmpty) {
    statusText = "That cell is empty \u2014 no colour to sample.";
  } else if (cv.activeTool === "eyedropper") {
    statusText = "Eyedropper \u2014 click a cell to sample its colour.";
  } else if (cv.activeTool === "magicWand") {
    var wModLabel = cv.selectionModifier === "add" ? "[+] Add" : cv.selectionModifier === "subtract" ? "[\u2212] Subtract" : cv.selectionModifier === "intersect" ? "[\u2229] Intersect" : null;
    statusText = "Magic Wand \u2014 click to select by colour" + (wModLabel ? " \u2022 " + wModLabel : ". Shift=add, Alt=subtract.");
  } else if (cv.activeTool === "lasso") {
    var lModLabel = cv.selectionModifier === "add" ? "[+] Add" : cv.selectionModifier === "subtract" ? "[\u2212] Subtract" : cv.selectionModifier === "intersect" ? "[\u2229] Intersect" : null;
    statusText = "Lasso (" + (cv.lassoMode || "freehand") + ")" + (lModLabel ? " \u2022 " + lModLabel : "") + " \u2014 " +
      (cv.lassoMode === "freehand" ? "drag to paint selection." :
       cv.lassoMode === "polygon" ? "click to place anchor points. Click near start to close." :
       "click to place anchors; snaps to colour edges.");
  } else if (cv.stitchType === "cross") {
    if (!cv.selectedColorId) {
      statusText = "Cross stitch \u2014 select a colour in the panel, or right-click the canvas to pick one.";
    } else {
      statusText = "Cross stitch \u2014 " + (cv.brushMode === "fill" ? "fill" : "paint") + " mode. Right-click any cell to change colour.";
    }
  } else if (cv.stitchType === "half-fwd") {
    statusText = "Half stitch / \u2014 click cells to place.";
  } else if (cv.stitchType === "half-bck") {
    statusText = "Half stitch \\ \u2014 click cells to place.";
  } else if (cv.stitchType === "backstitch") {
    statusText = "Backstitch \u2014 click grid intersections. Right-click to cancel.";
  } else if (cv.stitchType === "erase") {
    statusText = "Erase \u2014 click to remove stitches. Use backstitch erase (Bs tool) for backstitch lines.";
  } else {
    statusText = "Select a colour in the panel on the right, then choose a stitch type above.";
  }

  return h("div", null,
    cv.cs < 6 && (cv.view === "symbol" || cv.view === "both") && h("div", {
      style:{fontSize:'var(--text-sm)',color:"var(--text-secondary)",marginBottom:6,background:"var(--surface-tertiary)",padding:"6px 10px",borderRadius:'var(--radius-md)'}
    }, "To see symbols, you may need to zoom in."),

    ctx.isScratchMode && (!ctx.displayPal || ctx.displayPal.length === 0) && h("div", {
      style:{fontSize:'var(--text-sm)',color:"var(--text-tertiary)",padding:"8px 12px",background:"var(--surface-tertiary)",borderRadius:'var(--radius-md)',marginBottom:'var(--s-2)',textAlign:"center"}
    }, "Add colours using the Colours panel on the right, then select Paint or Fill to begin."),

    !app.shortcutsHintDismissed && h("div", {
      style:{fontSize:'var(--text-sm)',color:"var(--text-tertiary)",background:"var(--surface-secondary)",padding:"5px 10px",borderRadius:'var(--radius-md)',marginBottom:6,border:"0.5px solid var(--border)",display:"flex",justifyContent:"space-between",alignItems:"center",gap:'var(--s-2)'}
    },
      h("span", null, Icons.lightbulb(), " Press ", h("kbd", null, "?"), " for keyboard shortcuts"),
      h("button", {
        onClick: function() {
          localStorage.setItem("shortcuts_hint_dismissed", "1");
          app.setShortcutsHintDismissed(true);
        },
        style:{background:"none",border:"none",cursor:"pointer",color:"var(--text-tertiary)",fontSize:15,lineHeight:1,padding:0}
      }, "\xD7")
    ),

    !confettiBannerDismissed && app.confettiData && gen.orphans > 0 && (function() {
      var rawSingles = app.confettiData.raw.singles;
      var cleanSingles = app.confettiData.clean.singles;
      var removed = rawSingles - cleanSingles;
      var totalStitchable = ctx.pat ? ctx.pat.filter(function(m){return m.id!=="__skip__"&&m.id!=="__empty__";}).length : 1;
      var pctOfTotal = removed / Math.max(1, totalStitchable) * 100;
      if (pctOfTotal < 15) return null;
      return h("div", {
        style:{padding:"8px 12px",background:"var(--danger-soft)",border:"1px solid var(--danger-soft)",borderRadius:'var(--radius-md)',fontSize:'var(--text-sm)',color:"var(--danger)",marginBottom:'var(--s-2)',display:"flex",justifyContent:"space-between",alignItems:"center"}
      },
        h("span", null, Icons.warning(), " Cleanup removed ", removed.toLocaleString(), " stitches (", pctOfTotal.toFixed(1), "% of pattern). You may want to regenerate with a lower confetti cleanup level."),
        h("button", {
          onClick:function(){setConfettiBannerDismissed(true);},
          style:{background:"none",border:"none",color:"var(--danger)",cursor:"pointer",fontSize:'var(--text-lg)',flexShrink:0,marginLeft:'var(--s-2)'}
        }, "\xD7")
      );
    })(),

    h(window.MagicWandPanel, null),

    app.confettiData && (function() {
      var cleanPct = app.confettiData.clean.pct;
      var score = Math.round(100 - cleanPct);
      var scoreColor = score >= 90 ? "var(--success)" : score >= 75 ? "#7CB518" : score >= 60 ? "#C9A825" : score >= 40 ? "#D97706" : "var(--danger)";
      var singles = app.confettiData.clean.singles;
      return h("div", {style:{padding:"6px 10px",background:"var(--surface-secondary)",border:"0.5px solid var(--border)",borderRadius:'var(--radius-md)',fontSize:'var(--text-xs)',marginBottom:'var(--s-2)',display:"flex",alignItems:"center",gap:'var(--s-3)',flexWrap:"wrap"}},
        h("div", {style:{display:"flex",flexDirection:"column",gap:1,minWidth:60}},
          h("div", {style:{fontSize:9,color:"var(--text-tertiary)",textTransform:"uppercase",letterSpacing:"0.04em"}}, "Stitch Score"),
          h("div", {style:{fontSize:'var(--text-md)',fontWeight:700,color:scoreColor,lineHeight:1.1}}, score, "/100")
        ),
        h("div", {style:{flex:1,minWidth:60}},
          h("div", {style:{height:5,background:"var(--surface-tertiary)",borderRadius:3,overflow:"hidden"}},
            h("div", {style:{width:score+"%",height:"100%",background:scoreColor,borderRadius:3}})
          ),
          h("div", {style:{fontSize:9,color:"var(--text-tertiary)",marginTop:2}}, singles.toLocaleString(), " isolated stitches remaining")
        ),
        h("span", {
          title:"Higher score = easier to stitch. Fewer isolated single stitches means fewer thread changes and less counting fatigue. Reduce Confetti Cleanup level or increase grid size to improve.",
          style:{cursor:"help",color:"var(--text-tertiary)",borderBottom:"1px dotted var(--text-tertiary)",fontSize:'var(--text-xs)',whiteSpace:"nowrap"}
        }, "What is this?")
      );
    })(),

    gen.disambig && (function() {
      var hasResult = gen.disambigData != null;
      var canRun = ctx.pat && ctx.pal && !app.busy;
      return h("div", {style:{padding:"8px 10px",background:"var(--surface-secondary)",border:"0.5px solid var(--border)",borderRadius:'var(--radius-md)',fontSize:'var(--text-xs)',marginBottom:'var(--s-2)',display:"flex",alignItems:"center",gap:'var(--s-2)',flexWrap:"wrap"}},
        h("span", {style:{flex:1,color:"var(--text-secondary)",fontWeight:500}}, "Separate similar neighbours"),
        hasResult && gen.disambigData.swaps > 0 && h("span", {style:{color:"var(--text-tertiary)"}},
          gen.disambigData.swaps.toLocaleString(), " cell", gen.disambigData.swaps !== 1 ? "s" : "", " corrected"
        ),
        hasResult && gen.disambigData.swaps === 0 && h("span", {style:{color:"var(--success)"}}, "No clashes found"),
        h("button", {
          disabled: !canRun,
          onClick: function() {
            if (!canRun) return;
            gen.disambiguateNow();
          },
          style:{padding:"4px 10px",fontSize:'var(--text-xs)',fontWeight:500,background:canRun?"var(--accent)":"var(--surface-tertiary)",color:canRun?"var(--on-accent)":"var(--text-tertiary)",border:"none",borderRadius:'var(--radius-sm)',cursor:canRun?"pointer":"not-allowed",flexShrink:0,transition:"background 0.15s"}
        }, hasResult ? "Re-apply" : "Apply now"),
        h("button", {
          onClick: function() { gen.setDisambig(false); },
          style:{background:"none",border:"none",cursor:"pointer",color:"var(--text-tertiary)",fontSize:15,lineHeight:1,padding:0,flexShrink:0}
        }, "\xD7")
      );
    })(),

    app.splitPaneEnabled
      ? h(window.CreatorSplitPane, null)
      : h("div", {
      ref:app.scrollRef,
      style:{overflow:"auto",maxHeight:550,border:"0.5px solid var(--border)",borderRadius:'var(--radius-md)',background:"var(--surface-tertiary)",cursor:(function(){
        var selTool = cv.activeTool === "magicWand" || cv.activeTool === "lasso";
        if (cv.activeTool === "hand") return "grab";
        if (cv.activeTool === "eyedropper") return "copy";
        if (selTool) return "crosshair";
        if (app.previewActive) return "default";
        if (cv.activeTool === "fill") return "cell";
        if (cv.activeTool === "eraseBs") return "not-allowed";
        if (cv.activeTool || ctx.partialStitchTool) return "crosshair";
        return "default";
      })()},
      onContextMenu: function(e) {
        // Right-click context menu (except when backstitch has a special right-click action)
        if (cv.activeTool === "backstitch" && cv.bsStart) return;
        e.preventDefault();
        var pcRef = app.pcRef;
        if (!pcRef.current || !ctx.pat) return;
        var gc = gridCoord(pcRef, e, cv.cs, app.G, false);
        if (!gc || gc.gx < 0 || gc.gx >= ctx.sW || gc.gy < 0 || gc.gy >= ctx.sH) return;
        var idx = gc.gy * ctx.sW + gc.gx;
        var cell = ctx.pat[idx];
        // In paint/fill mode, right-click directly picks the colour (eyedropper gesture)
        var rcIsHsTool = ctx.partialStitchTool && ctx.partialStitchTool !== "erase";
        if ((cv.activeTool === "paint" || cv.activeTool === "fill" || rcIsHsTool) &&
            cell && cell.id !== "__skip__" && cell.id !== "__empty__" &&
            ctx.cmap && ctx.cmap[cell.id]) {
          cv.setSelectedColorId(cell.id);
          return;
        }
        cv.setContextMenu({ x: e.clientX, y: e.clientY, gx: gc.gx, gy: gc.gy, idx: idx, cell: cell });
      }
    },
      app.previewActive
        ? (app.previewMode === "realistic" ? h(window.CreatorRealisticCanvas, null) : h(window.CreatorPreviewCanvas, null))
        : h(window.PatternCanvas, null)
    ),

    // Context menu overlay
    cv.contextMenu && h(window.CreatorContextMenu, null),

    // Enhanced status bar: tool hint + coordinates + colour-under-cursor
    (function() {
      var parts = [statusText];
      if (hov.hoverCoords && hov.hoverCoords.gx >= 0 && hov.hoverCoords.gx < ctx.sW && hov.hoverCoords.gy >= 0 && hov.hoverCoords.gy < ctx.sH) {
        parts.push("X: " + (hov.hoverCoords.gx + 1) + ", Y: " + (hov.hoverCoords.gy + 1));
        var hIdx = hov.hoverCoords.gy * ctx.sW + hov.hoverCoords.gx;
        var hCell = ctx.pat[hIdx];
        if (hCell && hCell.id !== "__skip__" && hCell.id !== "__empty__" && ctx.cmap && ctx.cmap[hCell.id]) {
          var info = ctx.cmap[hCell.id];
          parts.push("DMC " + info.id + (info.name ? " " + info.name : "") + " (" + (info.count || 0) + " st)");
        }
      }
      return h("div", {className:"tb-status", style:{display:"flex",gap:'var(--s-3)',alignItems:"center",flexWrap:"wrap",justifyContent:"space-between"}},
        h("span", null, parts[0]),
        parts.length > 1 && h("span", {style:{fontFamily:"monospace",fontSize:10,color:"var(--text-tertiary)",flexShrink:0}}, parts[1]),
        parts.length > 2 && h("span", {style:{display:"flex",alignItems:"center",gap:3,flexShrink:0}},
          ctx.cmap && ctx.pat && hov.hoverCoords && (function() {
            var hIdx2 = hov.hoverCoords.gy * ctx.sW + hov.hoverCoords.gx;
            var hCell2 = ctx.pat[hIdx2];
            if (hCell2 && hCell2.id !== "__skip__" && hCell2.id !== "__empty__" && ctx.cmap[hCell2.id]) {
              return h("span", {style:{width:8,height:8,borderRadius:2,display:"inline-block",border:"1px solid var(--border)",
                background:"rgb("+ctx.cmap[hCell2.id].rgb+")"}});
            }
            return null;
          })(),
          h("span", {style:{fontSize:10,color:"var(--text-secondary)"}}, parts[2])
        )
      );
    })(),

    h("div", {style:{display:"flex",gap:'var(--s-1)',justifyContent:"flex-end",marginTop:'var(--s-1)',marginBottom:'var(--s-1)'}},
      cv.hiId && h("button", {
        onClick: function(){cv.setHiId(null);},
        style:{fontSize:'var(--text-xs)',padding:"4px 10px",border:"1px solid var(--danger-soft)",borderRadius:'var(--radius-sm)',background:"var(--danger-soft)",color:"var(--danger)",cursor:"pointer"}
      }, "Clear \u2715")
    ),

  );
};
