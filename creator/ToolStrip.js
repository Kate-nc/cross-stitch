/* creator/ToolStrip.js — The main tool strip bar above the pattern canvas.
   Reads from CreatorContext and GenerationContext.
   Loaded as a plain <script> before the main Babel script.
   Depends on: CreatorContext, GenerationContext (context.js) */

window.CreatorToolStrip = function CreatorToolStrip() {
  var ctx = window.usePatternData();
  var cv = window.useCanvas();
  var app = window.useApp();
  var gen = window.useGeneration();
  var h = React.createElement;

  // Local state
  var _swe = React.useState(false); var swatchExpanded = _swe[0], setSwatchExpanded = _swe[1];
  // Click-to-toggle state for hover dropdowns (touch-friendly).
  var _od = React.useState(null); var openDrop = _od[0], setOpenDrop = _od[1];
  React.useEffect(function() {
    if (!openDrop) return;
    function close(e) {
      if (!e.target || !e.target.closest || !e.target.closest('.tb-drop-wrap--open')) setOpenDrop(null);
    }
    document.addEventListener('pointerdown', close);
    return function(){ document.removeEventListener('pointerdown', close); };
  }, [openDrop]);

  // ResizeObserver: progressively collapse strip groups when narrow
  React.useEffect(function() {
    var el = app.stripRef.current;
    if (!el) return;
    var frame = null;
    var obs = new ResizeObserver(function() {
      if (frame) cancelAnimationFrame(frame);
      frame = requestAnimationFrame(function() {
        var w = el.clientWidth;
        app.setStripCollapsed({ brush: w < 680, bs: w < 550 });
      });
    });
    obs.observe(el);
    return function() { obs.disconnect(); if (frame) cancelAnimationFrame(frame); };
  }, []);

  // Close overflow menu on outside click
  React.useEffect(function() {
    if (!app.overflowOpen) return;
    function close(e) {
      if (app.overflowRef.current && !app.overflowRef.current.contains(e.target)) app.setOverflowOpen(false);
    }
    document.addEventListener("pointerdown", close);
    return function() { document.removeEventListener("pointerdown", close); };
  }, [app.overflowOpen]);

  // (The Preview chart-mode dropdown that used to live here has moved into
  // the Sidebar Preview tab — see creator/Sidebar.js previewPanel.)

  if (!(ctx.pat && ctx.pal && app.tab === "pattern")) return null;

  // ─── Create Mode: minimal toolbar ────────────────────────────────────────────
  if (app.appMode === "create") {
    var createZoomGrp = [
      h("div", {key:"sdiv-cz", className:"tb-sdiv"}),
      h("div", {key:"zoom-grp", className:"tb-grp"},
        h("input", {
          type:"range", min:0.05, max:3, step:0.05, value:cv.zoom,
          onChange:function(e){ cv.setZoom(parseFloat(e.target.value)); },
          style:{width:80}, title:"Zoom"
        }),
        h("span", {style:{fontSize:10,color:"var(--text-tertiary)",minWidth:28,textAlign:"center"}}, Math.round(cv.zoom*100)+"%"),
        h("button", {className:"tb-btn", onClick:function(){ cv.setZoom(cv.fitZ||1); }, title:"Fit (Home)", "aria-label":"Fit pattern to view"}, "Fit")
      )
    ];
    return h("div", {className:"toolbar-row", role:"toolbar", "aria-label":"Create mode tools"},
      h("div", {className:"pill-row"},
        h("div", {ref:app.stripRef, className:"pill"},
          // Overlay toggle — quick-access duplicate of the canonical
          // "Source overlay" control in the sidebar's Image tab. The
          // sidebar version owns opacity; this one just toggles on/off.
          gen.img && h("button", {
            className:"tb-btn"+(cv.showOverlay?" tb-btn--on":""),
            onClick:function(){ cv.setShowOverlay(!cv.showOverlay); },
            title:"Toggle source image overlay", "aria-label":"Toggle source image overlay"
          }, Icons.image(), " Overlay"),
          // Zoom
          createZoomGrp
        )
      )
    );
  }

  // ─── Edit Mode: full editing toolbar (current behaviour) ──────────────────────

  var sc = app.stripCollapsed || {};

  // Palette data sorted by usage — needed early for auto-select
  var palData = (ctx.displayPal || ctx.pal || []).slice().sort(function(a,b){return (b.count||0)-(a.count||0);});
  var svgX = h("svg", {width:11,height:11,viewBox:"0 0 12 12"},
    h("line", {x1:"1",y1:"11",x2:"11",y2:"1",stroke:"currentColor",strokeWidth:"1.8"}),
    h("line", {x1:"1",y1:"1",x2:"11",y2:"11",stroke:"currentColor",strokeWidth:"1.8"}));
  var svgFwd = h("svg", {width:11,height:11,viewBox:"0 0 12 12"},
    h("line", {x1:"1",y1:"11",x2:"11",y2:"1",stroke:"currentColor",strokeWidth:"1.8"}));
  var svgBck = h("svg", {width:11,height:11,viewBox:"0 0 12 12"},
    h("line", {x1:"1",y1:"1",x2:"11",y2:"11",stroke:"currentColor",strokeWidth:"1.8"}));
  var svgQtr = h("svg", {width:11,height:11,viewBox:"0 0 12 12"},
    h("polygon", {points:"1,11 11,1 1,1",fill:"currentColor",fillOpacity:"0.75",stroke:"none"}));
  var svgThreeQtr = h("svg", {width:11,height:11,viewBox:"0 0 12 12"},
    h("line", {x1:"1",y1:"11",x2:"11",y2:"1",stroke:"currentColor",strokeWidth:"1.8"}),
    h("line", {x1:"1",y1:"1",x2:"6",y2:"6",stroke:"currentColor",strokeWidth:"1.8"}));
  var svgErase = h("svg", {width:11,height:11,viewBox:"0 0 12 12"},
    h("line", {x1:"2",y1:"2",x2:"10",y2:"10",stroke:"currentColor",strokeWidth:"1.5"}),
    h("line", {x1:"10",y1:"2",x2:"2",y2:"10",stroke:"currentColor",strokeWidth:"1.5"}));
  var svgWand = h("svg", {width:12,height:12,viewBox:"0 0 12 12",fill:"none"},
    h("line", {x1:"2.2",y1:"9.8",x2:"8.7",y2:"3.3",stroke:"currentColor",strokeWidth:"1.6",strokeLinecap:"round"}),
    h("line", {x1:"8.8",y1:"1.1",x2:"8.8",y2:"3.1",stroke:"currentColor",strokeWidth:"1.1",strokeLinecap:"round"}),
    h("line", {x1:"7.8",y1:"2.1",x2:"9.8",y2:"2.1",stroke:"currentColor",strokeWidth:"1.1",strokeLinecap:"round"}),
    h("line", {x1:"7.4",y1:"0.9",x2:"10.2",y2:"3.7",stroke:"currentColor",strokeWidth:"0.9",strokeLinecap:"round"}),
    h("line", {x1:"10.2",y1:"0.9",x2:"7.4",y2:"3.7",stroke:"currentColor",strokeWidth:"0.9",strokeLinecap:"round"})
  );
  var svgFreehand = h("svg", {width:12,height:12,viewBox:"0 0 12 12",fill:"none"},
    h("path", {d:"M2 8.3C2 5.6 4.1 3.5 6.2 3.5C8.2 3.5 9.5 4.7 9.5 6.1C9.5 7.6 8.4 8.8 6.9 8.8C5.9 8.8 5.3 8.2 5.3 7.5C5.3 6.8 5.9 6.2 6.7 6.2",stroke:"currentColor",strokeWidth:"1.3",strokeLinecap:"round",strokeLinejoin:"round"}),
    h("circle", {cx:"6.7",cy:"6.2",r:"0.9",fill:"currentColor"})
  );
  var svgPolygon = h("svg", {width:12,height:12,viewBox:"0 0 12 12",fill:"none"},
    h("path", {d:"M2 8.5L3.5 2.5H8.6L10 7.7L5.4 10.1Z",stroke:"currentColor",strokeWidth:"1.2",strokeLinejoin:"round"}),
    h("circle", {cx:"3.5",cy:"2.5",r:"0.8",fill:"currentColor"}),
    h("circle", {cx:"8.6",cy:"2.5",r:"0.8",fill:"currentColor"}),
    h("circle", {cx:"10",cy:"7.7",r:"0.8",fill:"currentColor"}),
    h("circle", {cx:"5.4",cy:"10.1",r:"0.8",fill:"currentColor"}),
    h("circle", {cx:"2",cy:"8.5",r:"0.8",fill:"currentColor"})
  );
  var svgMagnetic = h("svg", {width:12,height:12,viewBox:"0 0 12 12",fill:"none"},
    h("path", {d:"M3 2.2V6.1C3 7.9 4.4 9.4 6 9.4C7.6 9.4 9 7.9 9 6.1V2.2",stroke:"currentColor",strokeWidth:"1.4",strokeLinecap:"round"}),
    h("line", {x1:"3",y1:"2.2",x2:"3",y2:"4.1",stroke:"currentColor",strokeWidth:"2.1",strokeLinecap:"round"}),
    h("line", {x1:"9",y1:"2.2",x2:"9",y2:"4.1",stroke:"currentColor",strokeWidth:"2.1",strokeLinecap:"round"}),
    h("line", {x1:"2.3",y1:"1.5",x2:"3.7",y2:"1.5",stroke:"currentColor",strokeWidth:"1.1",strokeLinecap:"round"}),
    h("line", {x1:"8.3",y1:"1.5",x2:"9.7",y2:"1.5",stroke:"currentColor",strokeWidth:"1.1",strokeLinecap:"round"})
  );

  // Brush group — always shown (first choice)
  var brushGrp = [
    h("div", {
      key:"brush-grp",
      className:"tb-grp"+(sc.brush?" tb-hidden":"")
    },
      h("button", {
        className:"tb-btn"+(cv.brushMode==="paint" && cv.activeTool!=="eyedropper" && cv.stitchType!=="erase"?" tb-btn--on":""),
        onClick:function(){
          if (!cv.selectedColorId && palData.length > 0) cv.setSelectedColorId(palData[0].id);
          cv.setBrushAndActivate("paint");
        },
        title:"Paint (P)",
        "aria-label":"Paint tool"
      }, "Paint"),
      h("button", {
        className:"tb-btn"+(cv.brushMode==="fill" && cv.activeTool!=="eyedropper" && cv.stitchType!=="erase"?" tb-btn--on":""),
        onClick:function(){
          if (!cv.selectedColorId && palData.length > 0) cv.setSelectedColorId(palData[0].id);
          cv.setBrushAndActivate("fill");
        },
        title:"Fill (F)",
        "aria-label":"Fill tool"
      }, "Fill"),
      h("button", {
        className:"tb-btn"+(cv.stitchType==="erase"?" tb-btn--red":""),
        onClick:function(){cv.selectStitchType("erase");}, title:"Erase (5)", "aria-label":"Erase tool"
      }, svgErase, "Erase"),
      h("button", {
        className:"tb-btn"+(cv.activeTool==="eyedropper"?" tb-btn--on":""),
        onClick:function(){cv.setActiveTool("eyedropper"); cv.setBsStart(null); ctx.setPartialStitchTool(null);},
        title:"Eyedropper (I)",
        "aria-label":"Eyedropper tool"
      }, "Pick")
    )
  ];

  // Stitch type, brush size and backstitch-continuous toggle previously
  // lived here; they have moved to the Sidebar Tools tab. The toolbar
  // keeps Paint/Fill/Erase/Pick + Wand/Lasso primary buttons only.
  // (Stitch type cycles with the T shortcut from the keyboard; sub-modes
  // for the lasso are picked once in the Tools tab and remembered.)

  // Colour swatch strip — second toolbar row, sorted by usage, with expand
  var SWATCH_INIT = 20;
  var swatchesShown = swatchExpanded ? palData : palData.slice(0, SWATCH_INIT);
  var showSwatchRow = ((cv.brushMode==="paint" || cv.brushMode==="fill") && cv.activeTool!=="eyedropper" && cv.stitchType!=="erase" || cv.activeTool==="eyedropper") && palData.length > 0;
  var swatchRow = showSwatchRow ? h("div", {className:"swatch-strip-row"},
    h("span", {style:{fontSize:10,color:"var(--text-tertiary)",fontWeight:600,textTransform:"uppercase",marginRight:'var(--s-1)',flexShrink:0,letterSpacing:0.5}}, "Colour"),
    cv.selectedColorId && ctx.cmap && ctx.cmap[cv.selectedColorId] ? h("span", {
      style:{display:"inline-flex",alignItems:"center",gap:'var(--s-1)',fontSize:'var(--text-xs)',padding:"1px 7px 1px 3px",borderRadius:'var(--radius-lg)',background:"var(--accent-light)",border:"1px solid var(--accent-border)",marginRight:6,flexShrink:0,maxWidth:"60vw",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"},
      title: ctx.cmap[cv.selectedColorId].name || cv.selectedColorId
    },
      h("span", {style:{width:12,height:12,borderRadius:2,background:"rgb("+ctx.cmap[cv.selectedColorId].rgb+")",border:"1px solid var(--border)",display:"inline-block",flexShrink:0}}),
      h("span", {style:{fontWeight:600,color:"var(--accent)",flexShrink:0}}, cv.selectedColorId),
      ctx.cmap[cv.selectedColorId].name ? h("span", {style:{color:"var(--accent-hover)",fontWeight:400,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}, "\u00B7 " + ctx.cmap[cv.selectedColorId].name) : null
    ) : h("span", {style:{fontSize:10,color:"var(--text-tertiary)",marginRight:6,flexShrink:0}}, "none selected"),
    swatchesShown.map(function(p) {
      var isSel = cv.selectedColorId === p.id;
      return h("button", {
        key: p.id,
        onClick: function() { cv.setSelectedColorId(cv.selectedColorId === p.id ? null : p.id); },
        title: "DMC " + p.id + (p.name ? " \xB7 " + p.name : "") + (p.count ? " \xB7 " + p.count + " st" : ""),
        "aria-label": "Select DMC " + p.id + (p.name ? " " + p.name : ""),
        "aria-pressed": isSel,
        style:{
          width:20, height:20, flexShrink:0,
          borderRadius:4, cursor:"pointer", padding:0,
          background:"rgb("+p.rgb+")",
          border: isSel ? "2px solid var(--accent)" : "1.5px solid rgba(0,0,0,0.15)",
          boxShadow: isSel ? "0 0 0 2px #fff inset" : "none",
          outline:"none"
        }
      });
    }),
    palData.length > SWATCH_INIT && h("button", {
      key:"swatch-expand",
      onClick:function(){setSwatchExpanded(function(e){return !e;});},
      title:swatchExpanded?"Collapse":"Show all "+palData.length+" colours",
      style:{
        flexShrink:0, marginLeft:'var(--s-1)', fontSize:'var(--text-xs)', padding:"0 8px",
        height:20, borderRadius:'var(--radius-lg)', border:"1px solid var(--border)",
        background:"var(--surface)", cursor:"pointer",
        color:"var(--text-secondary)", fontWeight:500, lineHeight:1, fontFamily:"inherit"
      }
    }, swatchExpanded ? "\u25B4" : "+"+( palData.length - SWATCH_INIT)+  " \u25BE")
  ) : null;

  // Selection: simple Wand + Lasso primary buttons. Sub-modes
  // (Freehand / Polygon / Magnetic) and the Clear-selection control now
  // live in the Sidebar Tools tab.
  var selectGrp = [
    h("div", {key:"sdiv-select", className:"tb-sdiv"}),
    h("div", {key:"select-grp", className:"tb-grp"},
      h("button", {
        className:"tb-btn"+(cv.activeTool==="magicWand"?" tb-btn--on":""),
        onClick:function(){
          if (cv.activeTool==="magicWand") cv.setActiveTool(null);
          else { cv.setActiveTool("magicWand"); ctx.setPartialStitchTool(null); cv.setBsStart(null); if (cv.cancelLasso) cv.cancelLasso(); }
        },
        title:"Magic Wand (W)",
        "aria-label":"Magic wand",
        "aria-pressed": cv.activeTool==="magicWand" ? "true" : "false"
      }, svgWand, " Wand"),
      h("button", {
        className:"tb-btn"+(cv.activeTool==="lasso"?" tb-btn--on":""),
        onClick:function(){
          if (cv.activeTool==="lasso") { if (cv.cancelLasso) cv.cancelLasso(); cv.setActiveTool(null); }
          else {
            cv.setActiveTool("lasso");
            cv.setLassoMode(cv.lassoMode || "freehand");
            ctx.setPartialStitchTool(null); cv.setBsStart(null);
          }
        },
        title:"Lasso \u2014 mode in Tools tab",
        "aria-label":"Lasso",
        "aria-pressed": cv.activeTool==="lasso" ? "true" : "false"
      },
        cv.lassoMode === "polygon" ? svgPolygon :
        cv.lassoMode === "magnetic" ? svgMagnetic : svgFreehand,
        " Lasso"
      ),
      (cv.hasSelection || cv.lassoInProgress) && h("button", {
        className:"tb-btn",
        onClick:function(){ if(cv.cancelLasso) cv.cancelLasso(); if(cv.clearSelection) cv.clearSelection(); },
        title:"Clear selection (Esc)",
        "aria-label":"Clear selection",
        style:{fontSize:10,padding:"2px 6px",color:"var(--text-secondary)"}
      }, (cv.selectionCount||0).toLocaleString()+" sel ", window.Icons.x())
    )
  ];

  // Active tool indicator badge — tooltip surfaces the selected colour
  // since the toolbar no longer carries a colour chip.
  var badgeLabel, badgeBg, badgeColor, badgeDot;
  if (cv.activeTool === "eyedropper") {
    badgeLabel = "Eyedropper"; badgeBg = "#fef9c3"; badgeColor = "#854d0e"; badgeDot = "#B59230";
  } else if (cv.activeTool === "magicWand") {
    badgeLabel = "Magic Wand"; badgeBg = "var(--surface-secondary)"; badgeColor = "var(--accent)"; badgeDot = "var(--accent)";
  } else if (cv.activeTool === "lasso") {
    var lm = cv.lassoMode === "polygon" ? "Polygon" : cv.lassoMode === "magnetic" ? "Magnetic" : "Freehand";
    badgeLabel = "Lasso \xB7 " + lm; badgeBg = "#F8EFD8"; badgeColor = "var(--accent-hover)"; badgeDot = "#f97316";
  } else if (cv.stitchType === "erase" || cv.activeTool === "eraseAll" || cv.activeTool === "eraseBs") {
    badgeLabel = "Erase"; badgeBg = "var(--danger-soft)"; badgeColor = "var(--danger)"; badgeDot = "#B85555";
  } else if (cv.stitchType === "backstitch") {
    badgeLabel = "Backstitch"; badgeBg = "var(--surface-secondary)"; badgeColor = "#404040"; badgeDot = "#737373";
  } else if (cv.stitchType === "half-fwd") {
    badgeLabel = "Half /"; badgeBg = "#e0f2fe"; badgeColor = "var(--accent)"; badgeDot = "var(--accent)";
  } else if (cv.stitchType === "half-bck") {
    badgeLabel = "Half \\"; badgeBg = "#e0f2fe"; badgeColor = "var(--accent)"; badgeDot = "var(--accent)";
  } else if (cv.brushMode === "fill") {
    badgeLabel = "Fill"; badgeBg = "var(--success-soft)"; badgeColor = "var(--success)"; badgeDot = "#5C8E4A";
  } else if (cv.brushMode === "paint") {
    var szTxt = cv.brushSize > 1 ? " " + cv.brushSize + "\xD7" + cv.brushSize : "";
    badgeLabel = "Paint" + szTxt; badgeBg = "var(--success-soft)"; badgeColor = "var(--success)"; badgeDot = "#5C8E4A";
  } else {
    badgeLabel = null;
  }
  var badgeColourTip = (cv.selectedColorId && ctx.cmap && ctx.cmap[cv.selectedColorId])
    ? (" \u2014 DMC " + cv.selectedColorId + (ctx.cmap[cv.selectedColorId].name ? " " + ctx.cmap[cv.selectedColorId].name : ""))
    : "";
  var toolBadge = badgeLabel ? h("span", {
    title: badgeLabel + badgeColourTip,
    style:{fontSize:10,fontWeight:600,display:"inline-flex",alignItems:"center",gap:'var(--s-1)',
      padding:"2px 8px 2px 6px",borderRadius:'var(--radius-lg)',background:badgeBg,color:badgeColor,
      flexShrink:0,letterSpacing:0.2,lineHeight:1.4,border:"1px solid " + badgeDot + "33"}
  },
    h("span", {style:{width:6,height:6,borderRadius:"50%",background:badgeDot,display:"inline-block",
      boxShadow:"0 0 4px " + badgeDot + "66"}}),
    badgeLabel
  ) : null;

  // Zoom group
  var zoomGrp = h("div", {className:"tb-zoom-grp"},
    h("span", {className:"tb-zoom-lbl"}, "Zoom"),
    h("input", {
      type:"range", min:0.05, max:3, step:0.05, value:cv.zoom,
      onChange:function(e){cv.setZoom(Number(e.target.value));},
      style:{width:55}
    }),
    h("span", {className:"tb-zoom-pct"}, Math.round(cv.zoom*100)+"%"),
    h("button", {className:"tb-fit-btn", onClick:cv.fitZ}, "Fit")
  );

  // Undo/Redo
  var undoRedo = [
    h("div", {key:"sdiv-ur", className:"tb-sdiv"}),
    h("button", {
      key:"undo", className:"tb-btn",
      onClick:cv.undoEdit, disabled:!cv.editHistory.length,
      title:"Undo (Ctrl+Z)",
      "aria-label":"Undo",
      style:{opacity:cv.editHistory.length?1:0.3}
    }, "\u21A9"),
    h("button", {
      key:"redo", className:"tb-btn",
      onClick:cv.redoEdit, disabled:!cv.redoHistory.length,
      title:"Redo (Ctrl+Y)",
      "aria-label":"Redo",
      style:{opacity:cv.redoHistory.length?1:0.3}
    }, "\u21AA")
  ];

  // Overflow menu items
  var overlayItems = (gen.img && gen.img.src) ? [
    h("button", {
      key:"overlay-btn",
      className:"tb-ovf-item"+(cv.showOverlay?" tb-ovf-item--on":""),
      onClick:function(){cv.setShowOverlay(function(v){return !v;});}
    },
      h("span", {style:{width:14,height:14,borderRadius:3,flexShrink:0,display:"inline-block",
        border:"2px solid "+(cv.showOverlay?"var(--accent)":"var(--border)")}}),
      " Overlay"+(cv.showOverlay?" \u2713":"")
    ),
    cv.showOverlay && h("div", {key:"overlay-slider", style:{padding:"4px 14px 6px"}},
      h("input", {
        type:"range",min:0.1,max:0.8,step:0.05,value:cv.overlayOpacity,
        onChange:function(e){cv.setOverlayOpacity(Number(e.target.value));},
        style:{width:"100%"}
      })
    )
  ] : null;

  var brushItems = sc.brush ? [
    h("div", {key:"ovf-sep-brush", className:"tb-ovf-sep"}),
    h("span", {key:"ovf-lbl-brush", className:"tb-ovf-lbl"}, "Brush"),
    [["paint","Paint"],["fill","Fill"]].map(function(kl) {
      return h("button", {
        key:kl[0],
        className:"tb-ovf-item"+(cv.brushMode===kl[0]?" tb-ovf-item--on":""),
        onClick:function(){cv.setBrushAndActivate(kl[0]); app.setOverflowOpen(false);}
      }, kl[1]+(cv.brushMode===kl[0]?" \u2713":""));
    })
  ] : null;

  var overflowMenu = app.overflowOpen ? h("div", {className:"tb-overflow-menu"},
    h("span", {className:"tb-ovf-lbl"}, "Display"),
    overlayItems,
    brushItems
  ) : null;

  // (The Preview chart-mode dropdown formerly built here has been removed.
  //  All preview controls — Chart/Pixel/Realistic, quality level, coverage,
  //  grid overlay, fabric background — now live in the Sidebar Preview tab.)

  // Source-image overlay toggle — replaces the old Preview dropdown in the top
  // toolbar. The Preview chart-mode/coverage controls now live in the Sidebar
  // Preview tab (less duplication, more room here for editing tools). The
  // overlay is the one display affordance that's most useful while editing.
  var overlayBtn = (gen.img && gen.img.src) ? h("button", {
    className:"tb-btn"+(cv.showOverlay?" tb-btn--on":""),
    onClick:function(){ cv.setShowOverlay(function(v){return !v;}); },
    title:"Toggle source image overlay (O)",
    "aria-label":"Toggle source image overlay",
    "aria-pressed": cv.showOverlay ? "true" : "false"
  }, "Overlay") : null;
  var overlayOpacityCtl = (gen.img && gen.img.src && cv.showOverlay) ? h("input", {
    type:"range", min:0.1, max:0.8, step:0.05, value:cv.overlayOpacity,
    onChange:function(e){ cv.setOverlayOpacity(Number(e.target.value)); },
    title:"Overlay opacity",
    "aria-label":"Overlay opacity",
    style:{width:60}
  }) : null;

  var overflowWrap = h("div", {className:"tb-overflow-wrap", ref:app.overflowRef},
    h("button", {
      className:"tb-overflow-btn",
      onClick:function(){app.setOverflowOpen(function(o){return !o;});},
      title:"More options",
      "aria-label":"More options menu"
    }, "\u00B7\u00B7\u00B7"),
    overflowMenu
  );

  return h(React.Fragment, null,
    h("div", {className:"toolbar-row", role:"toolbar", "aria-label":"Edit mode tools"},
      h("div", {className:"pill-row"},
        h("div", {ref:app.stripRef, className:"pill"},
          brushGrp,
          selectGrp,
          toolBadge,
          zoomGrp,
          undoRedo,
          overlayBtn && h("div", {className:"tb-sdiv"}),
          overlayBtn,
          overlayOpacityCtl,
          h("div", {className:"tb-sdiv"}),
          overflowWrap
        )
      ),
      swatchRow
    )
  );
};
