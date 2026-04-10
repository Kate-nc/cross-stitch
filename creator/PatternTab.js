/* creator/PatternTab.js — The pattern view tab (canvas area + palette chips).
   Reads from CreatorContext. Loaded as a plain <script> before the main Babel script.
   Depends on: PatternCanvas (PatternCanvas.js), Tooltip (components.js), CreatorContext (context.js) */

window.CreatorPatternTab = function CreatorPatternTab() {
  var ctx = React.useContext(window.CreatorContext);
  var h = React.createElement;

  var _dismissed = React.useState(false); var confettiBannerDismissed = _dismissed[0], setConfettiBannerDismissed = _dismissed[1];
  var prevConfettiKeyRef = React.useRef(null);
  React.useEffect(function() {
    var newKey = ctx.confettiData ? (ctx.confettiData.raw.singles + "|" + ctx.confettiData.clean.singles) : null;
    if (prevConfettiKeyRef.current !== newKey) {
      prevConfettiKeyRef.current = newKey;
      if (newKey) setConfettiBannerDismissed(false);
    }
  }, [ctx.confettiData]);

  if (!(ctx.pat && ctx.pal)) return null;
  if (ctx.tab !== "pattern") return null;

  // PaletteSwap confirm view takes over when active
  if (ctx.paletteSwap && ctx.paletteSwap.showConfirm) {
    return ctx.paletteSwap.confirmView || null;
  }

  // Build status text
  var statusText;
  if (ctx.stitchType === "cross") {
    statusText = "Cross stitch \u2014 " + (ctx.brushMode === "fill" ? "fill" : "paint") + " mode. Select a colour chip below.";
  } else if (ctx.stitchType === "half-fwd") {
    statusText = "Half stitch / \u2014 click cells to place.";
  } else if (ctx.stitchType === "half-bck") {
    statusText = "Half stitch \\ \u2014 click cells to place.";
  } else if (ctx.stitchType === "backstitch") {
    statusText = "Backstitch \u2014 click grid intersections. Right-click to cancel.";
  } else if (ctx.stitchType === "erase") {
    statusText = "Erase \u2014 click to remove stitches and backstitch lines.";
  } else {
    statusText = "Select a colour chip below, then choose a stitch type above.";
  }

  // Palette chips
  var chips = (ctx.displayPal || ctx.pal || []).map(function(p) {
    var isHsTool = ctx.halfStitchTool && ctx.halfStitchTool !== "erase";
    var ips = (ctx.activeTool === "paint" || ctx.activeTool === "fill" || isHsTool) && ctx.selectedColorId === p.id;
    var ihs = ctx.hiId === p.id;
    var isUnused = ctx.isScratchMode && p.count === 0;
    var chip = h("div", {
      key: p.id,
      role: "button",
      tabIndex: 0,
      "aria-pressed": ips || ihs,
      onClick: function() {
        if (ctx.activeTool === "paint" || ctx.activeTool === "fill" || isHsTool) {
          ctx.setSelectedColorId(ctx.selectedColorId === p.id ? null : p.id);
        } else {
          ctx.setHiId(ctx.hiId === p.id ? null : p.id);
        }
      },
      onKeyDown: function(e) {
        if (e.repeat) return;
        if (e.key === ' ' || e.key === 'Enter') {
          e.preventDefault();
          if (ctx.activeTool === "paint" || ctx.activeTool === "fill" || isHsTool) {
            ctx.setSelectedColorId(ctx.selectedColorId === p.id ? null : p.id);
          } else {
            ctx.setHiId(ctx.hiId === p.id ? null : p.id);
          }
        }
      },
      style: {
        display:"flex",alignItems:"center",gap:3,padding:"2px 7px",borderRadius:5,
        cursor:"pointer",fontSize:11,
        border: ips ? (isHsTool ? "2px solid #0284c7" : "2px solid #0d9488")
               : ihs ? "2px solid #ea580c" : "0.5px solid #e4e4e7",
        background: ips ? (isHsTool ? "#e0f2fe" : "#f0fdfa")
                   : ihs ? "#fff7ed" : "#fff",
        opacity: isUnused ? 0.6 : 1
      }
    },
      h("span", {style:{width:12,height:12,borderRadius:2,background:"rgb("+p.rgb+")",border:"1px solid #d4d4d8",display:"inline-block",flexShrink:0}}),
      h("span", {style:{fontFamily:"monospace",color:"#71717a"}}, p.symbol),
      h("span", {style:{fontWeight:500}}, p.id),
      isUnused && h("span", {
        onClick: function(e) { e.stopPropagation(); ctx.removeScratchColour(p.id); },
        style:{fontSize:9,color:"#a1a1aa",cursor:"pointer",marginLeft:2,lineHeight:1}
      }, "\xD7")
    );
    if (ctx.isScratchMode) {
      var tipText = ips ? "Currently selected \u2014 click canvas to paint"
                   : isUnused ? "Click to select \u00B7 no stitches yet"
                   : "Click to select this colour for painting";
      return h(Tooltip, {key:p.id, text:tipText, width:180}, chip);
    }
    return chip;
  });

  return h("div", null,
    ctx.cs < 6 && (ctx.view === "symbol" || ctx.view === "both") && h("div", {
      style:{fontSize:12,color:"#71717a",marginBottom:6,background:"#f4f4f5",padding:"6px 10px",borderRadius:8}
    }, "To see symbols, you may need to zoom in."),

    ctx.isScratchMode && (!ctx.displayPal || ctx.displayPal.length === 0) && h("div", {
      style:{fontSize:12,color:"#a1a1aa",padding:"8px 12px",background:"#f4f4f5",borderRadius:8,marginBottom:8,textAlign:"center"}
    }, "Add colours using the Colours panel on the left, then select Paint or Fill to begin."),

    !ctx.shortcutsHintDismissed && h("div", {
      style:{fontSize:12,color:"#6b7280",background:"#f9fafb",padding:"5px 10px",borderRadius:8,marginBottom:6,border:"0.5px solid #e4e4e7",display:"flex",justifyContent:"space-between",alignItems:"center",gap:8}
    },
      h("span", null, "\uD83D\uDCA1 Press ", h("kbd", null, "?"), " for keyboard shortcuts"),
      h("button", {
        onClick: function() {
          localStorage.setItem("shortcuts_hint_dismissed", "1");
          ctx.setShortcutsHintDismissed(true);
        },
        style:{background:"none",border:"none",cursor:"pointer",color:"#9ca3af",fontSize:15,lineHeight:1,padding:0}
      }, "\xD7")
    ),

    !confettiBannerDismissed && ctx.confettiData && ctx.orphans > 0 && (function() {
      var rawSingles = ctx.confettiData.raw.singles;
      var cleanSingles = ctx.confettiData.clean.singles;
      var removed = rawSingles - cleanSingles;
      var totalStitchable = ctx.pat ? ctx.pat.filter(function(m){return m.id!=="__skip__"&&m.id!=="__empty__";}).length : 1;
      var pctOfTotal = removed / Math.max(1, totalStitchable) * 100;
      if (pctOfTotal < 15) return null;
      return h("div", {
        style:{padding:"8px 12px",background:"#fef2f2",border:"1px solid #fecaca",borderRadius:8,fontSize:12,color:"#991b1b",marginBottom:8,display:"flex",justifyContent:"space-between",alignItems:"center"}
      },
        h("span", null, "\u26A0\uFE0F Cleanup removed ", removed.toLocaleString(), " stitches (", pctOfTotal.toFixed(1), "% of pattern). You may want to regenerate with a lower orphan removal level."),
        h("button", {
          onClick:function(){setConfettiBannerDismissed(true);},
          style:{background:"none",border:"none",color:"#991b1b",cursor:"pointer",fontSize:14,flexShrink:0,marginLeft:8}
        }, "\xD7")
      );
    })(),

    h("div", {
      ref:ctx.scrollRef,
      style:{overflow:"auto",maxHeight:550,border:"0.5px solid #e4e4e7",borderRadius:8,background:"#f4f4f5",cursor:(ctx.activeTool||ctx.halfStitchTool)?"crosshair":"default"}
    },
      h(window.PatternCanvas, null)
    ),

    h(window.MagicWandPanel, null),

    h("div", {className:"tb-status"}, statusText),

    h("div", {style:{display:"flex",gap:4,justifyContent:"flex-end",marginTop:4,marginBottom:4}},
      ctx.editHistory.length > 0 && h("button", {
        onClick: ctx.undoEdit,
        style:{fontSize:11,padding:"4px 10px",border:"1px solid #99f6e4",borderRadius:6,background:"#f0fdfa",color:"#0d9488",cursor:"pointer"}
      }, "\u21A9 Undo"),
      ctx.redoHistory.length > 0 && h("button", {
        onClick: ctx.redoEdit,
        style:{fontSize:11,padding:"4px 10px",border:"1px solid #99f6e4",borderRadius:6,background:"#f0fdfa",color:"#0d9488",cursor:"pointer"}
      }, "\u21AA Redo"),
      ctx.hiId && h("button", {
        onClick: function(){ctx.setHiId(null);},
        style:{fontSize:11,padding:"4px 10px",border:"1px solid #fecaca",borderRadius:6,background:"#fef2f2",color:"#dc2626",cursor:"pointer"}
      }, "Clear \u2715")
    ),

    ctx.isScratchMode && (ctx.activeTool === "paint" || ctx.activeTool === "fill") && !ctx.selectedColorId && ctx.displayPal && ctx.displayPal.length > 0 && h("div", {
      style:{marginBottom:6,padding:"5px 10px",background:"#fefce8",border:"1px solid #fde68a",borderRadius:8,fontSize:11,color:"#92400e",display:"flex",alignItems:"center",gap:6}
    },
      h("span", {style:{fontSize:13}}, "\uD83D\uDC47"),
      " Click a colour chip below to select it, then paint on the canvas"
    ),

    h("div", {style:{marginTop:8,borderRadius:8,background:"#fafafa",padding:"8px 12px",border:"0.5px solid #e4e4e7"}},
      h("div", {style:{display:"flex",flexWrap:"wrap",gap:3}}, chips)
    )
  );
};
