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
    statusText = "\u26A0 That cell is empty \u2014 no colour to sample.";
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
      style:{fontSize:12,color:"#475569",marginBottom:6,background:"#f1f5f9",padding:"6px 10px",borderRadius:8}
    }, "To see symbols, you may need to zoom in."),

    ctx.isScratchMode && (!ctx.displayPal || ctx.displayPal.length === 0) && h("div", {
      style:{fontSize:12,color:"#94a3b8",padding:"8px 12px",background:"#f1f5f9",borderRadius:8,marginBottom:8,textAlign:"center"}
    }, "Add colours using the Colours panel on the right, then select Paint or Fill to begin."),

    !app.shortcutsHintDismissed && h("div", {
      style:{fontSize:12,color:"#6b7280",background:"#f9fafb",padding:"5px 10px",borderRadius:8,marginBottom:6,border:"0.5px solid #e2e8f0",display:"flex",justifyContent:"space-between",alignItems:"center",gap:8}
    },
      h("span", null, Icons.lightbulb(), " Press ", h("kbd", null, "?"), " for keyboard shortcuts"),
      h("button", {
        onClick: function() {
          localStorage.setItem("shortcuts_hint_dismissed", "1");
          app.setShortcutsHintDismissed(true);
        },
        style:{background:"none",border:"none",cursor:"pointer",color:"#9ca3af",fontSize:15,lineHeight:1,padding:0}
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
        style:{padding:"8px 12px",background:"#fef2f2",border:"1px solid #fecaca",borderRadius:8,fontSize:12,color:"#991b1b",marginBottom:8,display:"flex",justifyContent:"space-between",alignItems:"center"}
      },
        h("span", null, Icons.warning(), " Cleanup removed ", removed.toLocaleString(), " stitches (", pctOfTotal.toFixed(1), "% of pattern). You may want to regenerate with a lower orphan removal level."),
        h("button", {
          onClick:function(){setConfettiBannerDismissed(true);},
          style:{background:"none",border:"none",color:"#991b1b",cursor:"pointer",fontSize:14,flexShrink:0,marginLeft:8}
        }, "\xD7")
      );
    })(),

    h(window.MagicWandPanel, null),
    h(window.DiagnosticsPanel, null),

    app.splitPaneEnabled
      ? h(window.CreatorSplitPane, null)
      : h("div", {
      ref:app.scrollRef,
      style:{overflow:"auto",maxHeight:550,border:"0.5px solid #e2e8f0",borderRadius:8,background:"#f1f5f9",cursor:(function(){
        var selTool = cv.activeTool === "magicWand" || cv.activeTool === "lasso";
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
      if (cv.hoverCoords && cv.hoverCoords.gx >= 0 && cv.hoverCoords.gx < ctx.sW && cv.hoverCoords.gy >= 0 && cv.hoverCoords.gy < ctx.sH) {
        parts.push("X: " + (cv.hoverCoords.gx + 1) + ", Y: " + (cv.hoverCoords.gy + 1));
        var hIdx = cv.hoverCoords.gy * ctx.sW + cv.hoverCoords.gx;
        var hCell = ctx.pat[hIdx];
        if (hCell && hCell.id !== "__skip__" && hCell.id !== "__empty__" && ctx.cmap && ctx.cmap[hCell.id]) {
          var info = ctx.cmap[hCell.id];
          parts.push("DMC " + info.id + (info.name ? " " + info.name : "") + " (" + (info.count || 0) + " st)");
        }
      }
      return h("div", {className:"tb-status", style:{display:"flex",gap:12,alignItems:"center",flexWrap:"wrap",justifyContent:"space-between"}},
        h("span", null, parts[0]),
        parts.length > 1 && h("span", {style:{fontFamily:"monospace",fontSize:10,color:"#94a3b8",flexShrink:0}}, parts[1]),
        parts.length > 2 && h("span", {style:{display:"flex",alignItems:"center",gap:3,flexShrink:0}},
          ctx.cmap && ctx.pat && cv.hoverCoords && (function() {
            var hIdx2 = cv.hoverCoords.gy * ctx.sW + cv.hoverCoords.gx;
            var hCell2 = ctx.pat[hIdx2];
            if (hCell2 && hCell2.id !== "__skip__" && hCell2.id !== "__empty__" && ctx.cmap[hCell2.id]) {
              return h("span", {style:{width:8,height:8,borderRadius:2,display:"inline-block",border:"1px solid #cbd5e1",
                background:"rgb("+ctx.cmap[hCell2.id].rgb+")"}});
            }
            return null;
          })(),
          h("span", {style:{fontSize:10,color:"#475569"}}, parts[2])
        )
      );
    })(),

    h("div", {style:{display:"flex",gap:4,justifyContent:"flex-end",marginTop:4,marginBottom:4}},
      cv.editHistory.length > 0 && h("button", {
        onClick: cv.undoEdit,
        style:{fontSize:11,padding:"4px 10px",border:"1px solid #99f6e4",borderRadius:6,background:"#f0fdfa",color:"#0d9488",cursor:"pointer"}
      }, "\u21A9 Undo"),
      cv.redoHistory.length > 0 && h("button", {
        onClick: cv.redoEdit,
        style:{fontSize:11,padding:"4px 10px",border:"1px solid #99f6e4",borderRadius:6,background:"#f0fdfa",color:"#0d9488",cursor:"pointer"}
      }, "\u21AA Redo"),
      cv.hiId && h("button", {
        onClick: function(){cv.setHiId(null);},
        style:{fontSize:11,padding:"4px 10px",border:"1px solid #fecaca",borderRadius:6,background:"#fef2f2",color:"#dc2626",cursor:"pointer"}
      }, "Clear \u2715")
    ),

    cv.hiId && h("div", {style:{background:"#fff7ed",border:"0.5px solid #fed7aa",borderRadius:8,padding:"8px 10px",marginBottom:6,fontSize:11,color:"#92400e"}},
      // ── Mode toggle segmented control ──
      h("div", {style:{display:"flex",gap:0,marginBottom:6,borderRadius:6,overflow:"hidden",border:"1px solid #fdba74"}},
        ["isolate","outline","tint","spotlight"].map(function(m) {
          var labels = {isolate:"Isolate",outline:"Outline",tint:"Tint",spotlight:"Spotlight"};
          var active = cv.highlightMode === m;
          return h("button", {
            key: m,
            onClick: function() { cv.setHighlightMode(m); },
            style:{
              flex:1, padding:"4px 0", fontSize:10, fontWeight: active ? 700 : 500, cursor:"pointer",
              border:"none", borderRight:"1px solid #fdba74",
              background: active ? "#ea580c" : "#fff7ed",
              color: active ? "#fff" : "#92400e"
            }
          }, labels[m]);
        })
      ),

      // ── Isolate settings ──
      cv.highlightMode === "isolate" && h("div", null,
        h("div", {style:{display:"flex",alignItems:"center",gap:6,marginBottom:4}},
          h("label", {style:{flexShrink:0,fontWeight:600,color:"#78350f"}}, "Background dimming"),
          h("input", {
            type:"range", min:5, max:60, step:1,
            value: Math.round(cv.bgDimOpacity * 100),
            onChange: function(e) {
              var op = parseInt(e.target.value) / 100;
              cv.setBgDimOpacity(op);
              if (!cv.hiAdvanced) cv.setBgDimDesaturation(Math.min(1, (100 - parseInt(e.target.value)) / 100));
            },
            style:{flex:1,accentColor:"#ea580c"}
          }),
          h("span", {style:{width:30,textAlign:"right",fontVariantNumeric:"tabular-nums"}}, Math.round(cv.bgDimOpacity * 100) + "%")
        ),
        cv.hiAdvanced && h("div", {style:{display:"flex",alignItems:"center",gap:6,marginBottom:4}},
          h("label", {style:{flexShrink:0,fontWeight:600,color:"#78350f"}}, "Desaturation"),
          h("input", {
            type:"range", min:0, max:100, step:1,
            value: Math.round(cv.bgDimDesaturation * 100),
            onChange: function(e) { cv.setBgDimDesaturation(parseInt(e.target.value) / 100); },
            style:{flex:1,accentColor:"#ea580c"}
          }),
          h("span", {style:{width:30,textAlign:"right",fontVariantNumeric:"tabular-nums"}}, Math.round(cv.bgDimDesaturation * 100) + "%")
        ),
        h("div", {style:{display:"flex",justifyContent:"flex-end"}},
          h("label", {style:{display:"flex",alignItems:"center",gap:4,cursor:"pointer",userSelect:"none"}},
            h("input", {type:"checkbox", checked:cv.hiAdvanced, onChange:function(e){cv.setHiAdvanced(e.target.checked);}, style:{accentColor:"#ea580c"}}),
            h("span", {style:{fontSize:10,color:"#92400e"}}, "Advanced (decouple sliders)")
          )
        )
      ),

      // ── Outline settings ──
      cv.highlightMode === "outline" && h("div", {style:{fontSize:10,color:"#78350f",fontStyle:"italic"}},
        "Animated marching ants highlight the boundary of the selected colour."
      ),

      // ── Tint settings ──
      cv.highlightMode === "tint" && h("div", null,
        h("div", {style:{display:"flex",alignItems:"center",gap:6,marginBottom:4}},
          h("label", {style:{flexShrink:0,fontWeight:600,color:"#78350f"}}, "Tint colour"),
          h("input", {
            type:"color",
            value: cv.tintColor,
            onChange: function(e) { cv.setTintColor(e.target.value); },
            style:{width:28,height:22,padding:0,border:"1px solid #fdba74",borderRadius:4,cursor:"pointer"}
          }),
          h("label", {style:{flexShrink:0,fontWeight:600,color:"#78350f",marginLeft:8}}, "Opacity"),
          h("input", {
            type:"range", min:10, max:80, step:1,
            value: Math.round(cv.tintOpacity * 100),
            onChange: function(e) { cv.setTintOpacity(parseInt(e.target.value) / 100); },
            style:{flex:1,accentColor:"#ea580c"}
          }),
          h("span", {style:{width:30,textAlign:"right",fontVariantNumeric:"tabular-nums"}}, Math.round(cv.tintOpacity * 100) + "%")
        )
      ),

      // ── Spotlight settings ──
      cv.highlightMode === "spotlight" && h("div", null,
        h("div", {style:{display:"flex",alignItems:"center",gap:6,marginBottom:4}},
          h("label", {style:{flexShrink:0,fontWeight:600,color:"#78350f"}}, "Dim strength"),
          h("input", {
            type:"range", min:5, max:50, step:1,
            value: Math.round(cv.spotDimOpacity * 100),
            onChange: function(e) { cv.setSpotDimOpacity(parseInt(e.target.value) / 100); },
            style:{flex:1,accentColor:"#ea580c"}
          }),
          h("span", {style:{width:30,textAlign:"right",fontVariantNumeric:"tabular-nums"}}, Math.round(cv.spotDimOpacity * 100) + "%")
        )
      )
    ),

  );
};
