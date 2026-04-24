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

  // Preview dropdown local state — must be declared before early return (Rules of Hooks)
  var previewWrapRef = React.useRef(null);
  var _pm = React.useState(false); var previewMenuOpen = _pm[0], setPreviewMenuOpen = _pm[1];
  React.useEffect(function() {
    if (!previewMenuOpen) return;
    function close(e) {
      if (previewWrapRef.current && !previewWrapRef.current.contains(e.target)) setPreviewMenuOpen(false);
    }
    document.addEventListener("pointerdown", close);
    return function() { document.removeEventListener("pointerdown", close); };
  }, [previewMenuOpen]);

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
          // Generate / Regenerate — first so always visible on narrow screens
          h("button", {
            className:"tb-btn tb-btn--green",
            onClick:function(){ gen.generate(); },
            disabled:gen.busy,
            "aria-label":gen.hasGenerated?"Regenerate pattern":"Generate pattern",
            title:gen.hasGenerated?"Regenerate pattern":"Generate pattern"
          }, gen.hasGenerated ? "\u21BB Regenerate" : "\u21BB Generate"),
          h("div", {className:"tb-sdiv"}),
          // Overlay toggle
          gen.img && h("button", {
            className:"tb-btn"+(cv.showOverlay?" tb-btn--on":""),
            onClick:function(){ cv.setShowOverlay(!cv.showOverlay); },
            title:"Toggle source image overlay", "aria-label":"Toggle source image overlay"
          }, "\uD83D\uDDBC\uFE0F Overlay"),
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

  // Stitch type dropdown — shown only when paint or fill is the active brush mode
  var showStitchGrp = (cv.brushMode==="paint" || cv.brushMode==="fill") && cv.activeTool!=="eyedropper" && cv.stitchType!=="erase";

  // Show the colour pill for paint/fill modes AND when the eyedropper is active
  var showSwatchRow = (showStitchGrp || cv.activeTool==="eyedropper") && palData.length > 0;
  var stitchMeta = {
    "cross":         {icon:svgX,         label:"Cross",       cls:"tb-btn--green"},
    "quarter":       {icon:svgQtr,       label:"\u00BC Stitch",  cls:"tb-btn--blue"},
    "half-fwd":      {icon:svgFwd,       label:"Half /",       cls:"tb-btn--blue"},
    "half-bck":      {icon:svgBck,       label:"Half \\",      cls:"tb-btn--blue"},
    "three-quarter": {icon:svgThreeQtr,  label:"\u00BE Stitch",  cls:"tb-btn--blue"},
    "backstitch":    {icon:null,         label:"Bs",           cls:"tb-btn--on"}
  };
  var activeSM = stitchMeta[cv.stitchType] || stitchMeta["cross"];
  var stitchDrop = showStitchGrp ? [
    h("div", {key:"sdiv-stitch", className:"tb-sdiv"}),
    h("div", {key:"stitch-drop", className:"tb-drop-wrap" + (openDrop==="stitch"?" tb-drop-wrap--open":"")},
      h("button", {
        className:"tb-btn tb-drop-btn " + activeSM.cls,
        title:"Stitch type",
        "aria-label":"Stitch type menu",
        "aria-haspopup":"menu",
        "aria-expanded":openDrop==="stitch",
        onClick:function(){setOpenDrop(openDrop==="stitch"?null:"stitch");}
      }, activeSM.icon, activeSM.label, h("span", {className:"tb-drop-arrow"}, "\u25BE")),
      h("div", {className:"tb-dropdown", role:"menu"},
        Object.keys(stitchMeta).map(function(k) {
          var m = stitchMeta[k];
          return h("button", {
            key:k,
            className:"tb-drop-item" + (cv.stitchType===k?" tb-drop-item--on":""),
            onClick:function(){cv.selectStitchType(k);setOpenDrop(null);}
          }, m.icon, m.label);
        })
      )
    )
  ] : null;

  // Colour swatch strip — second toolbar row, sorted by usage, with expand
  var SWATCH_INIT = 20;
  var swatchesShown = swatchExpanded ? palData : palData.slice(0, SWATCH_INIT);
  var swatchRow = showSwatchRow ? h("div", {className:"swatch-strip-row"},
    h("span", {style:{fontSize:10,color:"var(--text-tertiary)",fontWeight:600,textTransform:"uppercase",marginRight:4,flexShrink:0,letterSpacing:0.5}}, "Colour"),
    cv.selectedColorId && ctx.cmap && ctx.cmap[cv.selectedColorId] ? h("span", {
      style:{display:"inline-flex",alignItems:"center",gap:4,fontSize:11,padding:"1px 7px 1px 3px",borderRadius:10,background:"#f0fdfa",border:"1px solid #99f6e4",marginRight:6,flexShrink:0}
    },
      h("span", {style:{width:12,height:12,borderRadius:2,background:"rgb("+ctx.cmap[cv.selectedColorId].rgb+")",border:"1px solid #cbd5e1",display:"inline-block"}}),
      h("span", {style:{fontWeight:600,color:"#0d9488"}}, cv.selectedColorId)
    ) : h("span", {style:{fontSize:10,color:"#94a3b8",marginRight:6,flexShrink:0}}, "none selected"),
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
          border: isSel ? "2px solid #0d9488" : "1.5px solid rgba(0,0,0,0.15)",
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
        flexShrink:0, marginLeft:4, fontSize:11, padding:"0 8px",
        height:20, borderRadius:10, border:"1px solid var(--border)",
        background:"var(--surface)", cursor:"pointer",
        color:"var(--text-secondary)", fontWeight:500, lineHeight:1, fontFamily:"inherit"
      }
    }, swatchExpanded ? "\u25B4" : "+"+( palData.length - SWATCH_INIT)+  " \u25BE")
  ) : null;

  // Brush size group
  var showBrushSize = (
    ((cv.stitchType === "cross" || cv.stitchType === "half-fwd" || cv.stitchType === "half-bck") && cv.brushMode === "paint") ||
    cv.stitchType === "erase"
  ) && cv.activeTool !== "eyedropper";
  var sizeGrp = showBrushSize ? [
    h("div", {key:"sdiv-sz", className:"tb-sdiv"}),
    h("div", {
      key:"size-grp",
      className:"tb-grp",
      style:{display:"flex",alignItems:"center",gap:4,opacity:(cv.selectedColorId||cv.stitchType==="erase")?1:0.6}
    },
      h("span", {style:{fontSize:10,color:"#475569",textTransform:"uppercase",fontWeight:600}}, "Size"),
      [1,2,3].map(function(sz) {
        return h("button", {
          key:sz,
          className:"tb-btn"+(cv.brushSize===sz?" tb-btn--on":""),
          onClick:function(){cv.setBrushSize(sz);},
          style:{padding:"2px 6px",minWidth:24}
        }, sz);
      })
    )
  ] : null;

  // Backstitch continuous
  var bsCont = (cv.stitchType === "backstitch") ? [
    h("div", {key:"sdiv-bs", className:"tb-sdiv"}),
    h("label", {
      key:"bs-cont",
      style:{display:"flex",alignItems:"center",gap:4,fontSize:11,cursor:"pointer",color:"#475569",flexShrink:0}
    },
      h("input", {
        type:"checkbox", checked:cv.bsContinuous,
        onChange:function(e){cv.setBsContinuous(e.target.checked); cv.setBsStart(null);}
      }),
      "Continuous"
    )
  ] : null;

  // Selection tools dropdown
  var isSelectActive = cv.activeTool === "magicWand" || cv.activeTool === "lasso";
  var selIcon = cv.activeTool === "magicWand" ? svgWand :
                cv.activeTool === "lasso" && cv.lassoMode === "polygon" ? svgPolygon :
                cv.activeTool === "lasso" && cv.lassoMode === "magnetic" ? svgMagnetic :
                cv.activeTool === "lasso" ? svgFreehand : svgWand;
  var selLabel = cv.activeTool === "magicWand" ? "Wand" :
                 cv.activeTool === "lasso" ? (cv.lassoMode === "polygon" ? "Poly" : cv.lassoMode === "magnetic" ? "Mag" : "Lasso") :
                 "Select";
  var selectDrop = [
    h("div", {key:"sdiv-select", className:"tb-sdiv"}),
    h("div", {key:"select-drop", className:"tb-drop-wrap" + (openDrop==="select"?" tb-drop-wrap--open":"")},
      h("button", {
        className:"tb-btn tb-drop-btn" + (isSelectActive ? " tb-btn--on" : ""),
        title:"Selection tools",
        "aria-label":"Selection tools menu",
        "aria-haspopup":"menu",
        "aria-expanded":openDrop==="select",
        onClick:function(){setOpenDrop(openDrop==="select"?null:"select");}
      }, selIcon, selLabel, h("span", {className:"tb-drop-arrow"}, "\u25BE")),
      h("div", {className:"tb-dropdown", role:"menu", onClick:function(e){if(e.target.closest&&e.target.closest('.tb-drop-item'))setOpenDrop(null);}},
        h("button", {
          className:"tb-drop-item"+(cv.activeTool==="magicWand"?" tb-drop-item--on":""),
          onClick:function(){
            if (cv.activeTool==="magicWand") cv.setActiveTool(null);
            else { cv.setActiveTool("magicWand"); ctx.setPartialStitchTool(null); cv.setBsStart(null); if (cv.cancelLasso) cv.cancelLasso(); }
          }
        }, svgWand, "Magic Wand"),
        h("button", {
          className:"tb-drop-item"+(cv.activeTool==="lasso"&&cv.lassoMode==="freehand"?" tb-drop-item--on":""),
          onClick:function(){
            var same=cv.activeTool==="lasso"&&cv.lassoMode==="freehand";
            if (same){cv.cancelLasso();cv.setActiveTool(null);cv.setLassoMode(null);}
            else{cv.setActiveTool("lasso");cv.setLassoMode("freehand");ctx.setPartialStitchTool(null);cv.setBsStart(null);}
          }
        }, svgFreehand, "Freehand"),
        h("button", {
          className:"tb-drop-item"+(cv.activeTool==="lasso"&&cv.lassoMode==="polygon"?" tb-drop-item--on":""),
          onClick:function(){
            var same=cv.activeTool==="lasso"&&cv.lassoMode==="polygon";
            if (same){cv.cancelLasso();cv.setActiveTool(null);cv.setLassoMode(null);}
            else{cv.setActiveTool("lasso");cv.setLassoMode("polygon");ctx.setPartialStitchTool(null);cv.setBsStart(null);}
          }
        }, svgPolygon, "Polygon"),
        h("button", {
          className:"tb-drop-item"+(cv.activeTool==="lasso"&&cv.lassoMode==="magnetic"?" tb-drop-item--on":""),
          onClick:function(){
            var same=cv.activeTool==="lasso"&&cv.lassoMode==="magnetic";
            if (same){cv.cancelLasso();cv.setActiveTool(null);cv.setLassoMode(null);}
            else{cv.setActiveTool("lasso");cv.setLassoMode("magnetic");ctx.setPartialStitchTool(null);cv.setBsStart(null);}
          }
        }, svgMagnetic, "Magnetic"),
        (cv.hasSelection || cv.lassoInProgress) && h("div", {style:{borderTop:"1px solid var(--border)",marginTop:3,paddingTop:3}},
          h("button", {
            className:"tb-drop-item",
            onClick:function(){if(cv.cancelLasso)cv.cancelLasso();if(cv.clearSelection)cv.clearSelection();}
          }, "\u2715 Clear (", (cv.selectionCount||0).toLocaleString(), ")")
        )
      )
    ),
    (cv.hasSelection || cv.lassoInProgress) && h("button", {
      key:"select-clear",
      className:"tb-btn",
      onClick:function(){if(cv.cancelLasso)cv.cancelLasso();if(cv.clearSelection)cv.clearSelection();},
      title:"Clear selection (Esc)",
      "aria-label":"Clear selection",
      style:{fontSize:9,padding:"2px 5px",color:"#475569"}
    }, (cv.selectionCount||0).toLocaleString()+" sel")
  ];

  // Colour chip
  var colChip = ((cv.stitchType==="cross"||cv.stitchType==="half-fwd"||cv.stitchType==="half-bck") &&
    cv.selectedColorId && ctx.cmap && ctx.cmap[cv.selectedColorId]) ?
    h("span", {
      style:{fontSize:11,display:"flex",alignItems:"center",gap:3,padding:"2px 7px",borderRadius:6,
        background:(cv.stitchType==="half-fwd"||cv.stitchType==="half-bck")?"#e0f2fe":"#f1f5f9",
        flexShrink:0,
        border:(cv.stitchType==="half-fwd"||cv.stitchType==="half-bck")?"1px solid #7dd3fc":"none"
      }
    },
      h("span", {style:{width:10,height:10,borderRadius:2,
        background:"rgb("+ctx.cmap[cv.selectedColorId].rgb+")",
        border:"1px solid #cbd5e1",display:"inline-block"}}),
      cv.selectedColorId
    ) : null;

  // Active tool indicator badge
  var badgeLabel, badgeBg, badgeColor, badgeDot;
  if (cv.activeTool === "eyedropper") {
    badgeLabel = "Eyedropper"; badgeBg = "#fef9c3"; badgeColor = "#854d0e"; badgeDot = "#eab308";
  } else if (cv.activeTool === "magicWand") {
    badgeLabel = "Magic Wand"; badgeBg = "#f3e8ff"; badgeColor = "#6b21a8"; badgeDot = "#a855f7";
  } else if (cv.activeTool === "lasso") {
    var lm = cv.lassoMode === "polygon" ? "Polygon" : cv.lassoMode === "magnetic" ? "Magnetic" : "Freehand";
    badgeLabel = "Lasso \xB7 " + lm; badgeBg = "#fff7ed"; badgeColor = "#9a3412"; badgeDot = "#f97316";
  } else if (cv.stitchType === "erase" || cv.activeTool === "eraseAll" || cv.activeTool === "eraseBs") {
    badgeLabel = "Erase"; badgeBg = "#fef2f2"; badgeColor = "#991b1b"; badgeDot = "#ef4444";
  } else if (cv.stitchType === "backstitch") {
    badgeLabel = "Backstitch"; badgeBg = "#f5f5f5"; badgeColor = "#404040"; badgeDot = "#737373";
  } else if (cv.stitchType === "half-fwd") {
    badgeLabel = "Half /"; badgeBg = "#e0f2fe"; badgeColor = "#075985"; badgeDot = "#0284c7";
  } else if (cv.stitchType === "half-bck") {
    badgeLabel = "Half \\"; badgeBg = "#e0f2fe"; badgeColor = "#075985"; badgeDot = "#0284c7";
  } else if (cv.brushMode === "fill") {
    badgeLabel = "Fill"; badgeBg = "#f0fdf4"; badgeColor = "#166534"; badgeDot = "#22c55e";
  } else if (cv.brushMode === "paint") {
    var szTxt = cv.brushSize > 1 ? " " + cv.brushSize + "\xD7" + cv.brushSize : "";
    badgeLabel = "Paint" + szTxt; badgeBg = "#f0fdf4"; badgeColor = "#166534"; badgeDot = "#22c55e";
  } else {
    badgeLabel = null;
  }
  var toolBadge = badgeLabel ? h("span", {
    style:{fontSize:10,fontWeight:600,display:"inline-flex",alignItems:"center",gap:4,
      padding:"2px 8px 2px 6px",borderRadius:10,background:badgeBg,color:badgeColor,
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
        border:"2px solid "+(cv.showOverlay?"#0d9488":"#cbd5e1")}}),
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

  // Preview dropdown — mode selector + options
  function chkBox(active) {
    return h("span", {style:{width:14,height:14,borderRadius:3,flexShrink:0,display:"inline-block",
      border:"2px solid "+(active?"var(--accent)":"#cbd5e1"),
      background:active?"var(--accent)":"transparent"}});
  }
  function radioBtn(active) {
    return h("span", {style:{width:14,height:14,borderRadius:"50%",flexShrink:0,display:"inline-block",
      border:"2px solid "+(active?"var(--accent)":"#cbd5e1"),
      background:active?"var(--accent)":"transparent"}});
  }
  var isPixel     = app.previewActive && app.previewMode === "pixel";
  var isRealistic = app.previewActive && app.previewMode === "realistic";
  var previewLabel = isPixel ? "Pixel \u25BE" : isRealistic ? "Realistic \u25BE" : "Preview \u25BE";
  var previewDropWrap = h("div", {className:"tb-overflow-wrap", ref:previewWrapRef},
    h("button", {
      className:"tb-btn"+(app.previewActive?" tb-btn--on":""),
      onClick:function(){setPreviewMenuOpen(function(o){return !o;});},
      title:"Preview mode",
      "aria-label":"Preview mode menu"
    }, previewLabel),
    previewMenuOpen && h("div", {className:"tb-overflow-menu", style:{minWidth:195,right:0}},
      h("span", {className:"tb-ovf-lbl"}, "View"),
      h("button", {
        className:"tb-ovf-item"+(!app.previewActive?" tb-ovf-item--on":""),
        onClick:function(){app.setPreviewActive(false); setPreviewMenuOpen(false);}
      }, radioBtn(!app.previewActive), " Chart"),
      h("button", {
        className:"tb-ovf-item"+(isPixel?" tb-ovf-item--on":""),
        onClick:function(){app.setPreviewActive(true); app.setPreviewMode("pixel"); setPreviewMenuOpen(false);}
      }, radioBtn(isPixel), " Pixel preview"),
      h("button", {
        className:"tb-ovf-item"+(isRealistic?" tb-ovf-item--on":""),
        onClick:function(){app.setPreviewActive(true); app.setPreviewMode("realistic"); setPreviewMenuOpen(false);}
      }, radioBtn(isRealistic), " Realistic"),
      h("div", {className:"tb-ovf-sep"}),
      h("span", {className:"tb-ovf-lbl"}, "Options"),
      h("button", {
        className:"tb-ovf-item"+(app.previewShowGrid?" tb-ovf-item--on":""),
        onClick:function(){app.setPreviewShowGrid(function(v){return !v;}); setPreviewMenuOpen(false);},
        disabled:!app.previewActive,
        style:{opacity:app.previewActive?1:0.4}
      }, chkBox(app.previewShowGrid), " Grid overlay"),
      h("button", {
        className:"tb-ovf-item"+(app.previewFabricBg?" tb-ovf-item--on":""),
        onClick:function(){app.setPreviewFabricBg(function(v){return !v;}); setPreviewMenuOpen(false);},
        disabled:!isPixel,
        style:{opacity:isPixel?1:0.4}
      }, chkBox(app.previewFabricBg), " Fabric background"),
      h("div", {className:"tb-ovf-sep"}),
      h("span", {className:"tb-ovf-lbl"}, "Realistic level"),
      h("button", {
        className:"tb-ovf-item"+(app.realisticLevel===1?" tb-ovf-item--on":""),
        onClick:function(){app.setRealisticLevel(1); setPreviewMenuOpen(false);},
        disabled:!isRealistic,
        style:{opacity:isRealistic?1:0.4}
      }, radioBtn(app.realisticLevel===1), " Flat (Level 1)"),
      h("button", {
        className:"tb-ovf-item"+(app.realisticLevel===2?" tb-ovf-item--on":""),
        onClick:function(){app.setRealisticLevel(2); setPreviewMenuOpen(false);},
        disabled:!isRealistic,
        style:{opacity:isRealistic?1:0.4}
      }, radioBtn(app.realisticLevel===2), " Shaded (Level 2)"),
      h("button", {
        className:"tb-ovf-item"+(app.realisticLevel===3?" tb-ovf-item--on":""),
        onClick:function(){app.setRealisticLevel(3); setPreviewMenuOpen(false);},
        disabled:!isRealistic,
        style:{opacity:isRealistic?1:0.4}
      }, radioBtn(app.realisticLevel===3), " Detailed (Level 3)"),
      h("button", {
        className:"tb-ovf-item"+(app.realisticLevel===4?" tb-ovf-item--on":""),
        onClick:function(){app.setRealisticLevel(4); setPreviewMenuOpen(false);},
        disabled:!isRealistic,
        style:{opacity:isRealistic?1:0.4}
      }, radioBtn(app.realisticLevel===4), " Detailed \u2014 Blend (3a)"),
      h("div", {className:"tb-ovf-sep"}),
      h("span", {className:"tb-ovf-lbl"}, "Thread coverage"),
      // Coverage slider + auto/manual indicator
      (function() {
        var sFc = ctx.fabricCt || 14;
        var sSC = sFc <= 11 ? 3 : sFc <= 17 ? 2 : 1;
        var sAutoCov = Math.min(1, Math.max(0, Math.min(1, Math.max(0, (sFc - 8) / 24)) * (sSC / 2)));
        var isManual = app.coverageOverride !== null && app.coverageOverride !== undefined;
        var dispCov = isManual ? app.coverageOverride : sAutoCov;
        var dispPct = Math.round(dispCov * 100);
        return h("div", {style:{padding:"4px 14px 6px"}},
          h("div", {style:{display:"flex",alignItems:"center",gap:6,marginBottom:4}},
            h("input", {
              type:"range", min:0, max:100, step:1,
              value: dispPct,
              disabled: !isRealistic,
              onChange: function(e) {
                app.setCoverageOverride(parseInt(e.target.value) / 100);
              },
              style:{flex:1, accentColor:"var(--accent)", opacity:isRealistic?1:0.4}
            }),
            h("span", {style:{width:32,textAlign:"right",fontSize:11,fontVariantNumeric:"tabular-nums",flexShrink:0}}, dispPct + "%")
          ),
          h("div", {style:{display:"flex",alignItems:"center",gap:6}},
            h("span", {style:{fontSize:10,color:isManual?"#ea580c":"var(--text-tertiary)",fontWeight:isManual?600:400}},
              isManual ? "Manual" : "Auto (" + sFc + "-count, " + sSC + " strand" + (sSC!==1?"s":"") + ")"
            ),
            isManual && h("button", {
              onClick: function(e) { e.stopPropagation(); app.setCoverageOverride(null); },
              title: "Reset to auto",
              style:{marginLeft:"auto",fontSize:10,padding:"2px 6px",border:"1px solid #fed7aa",borderRadius:4,
                     background:"#fff7ed",color:"#c2410c",cursor:"pointer", lineHeight:1.2}
            }, "\u21BA Auto"),
            !isManual && h("span", {style:{marginLeft:"auto",fontSize:10,color:"#94a3b8"}},
              Math.round(sAutoCov * 100) + "%"
            )
          ),
          // Quick presets
          h("div", {style:{display:"flex",gap:3,marginTop:5}},
            [["Sparse",0.25],["Standard",0.50],["Dense",0.80],["Full",0.95]].map(function(preset) {
              var active = isManual && Math.abs(app.coverageOverride - preset[1]) < 0.03;
              return h("button", {
                key: preset[0],
                disabled: !isRealistic,
                onClick: function(e) { e.stopPropagation(); app.setCoverageOverride(preset[1]); },
                style:{flex:1,fontSize:9,padding:"3px 0",border:"1px solid "+(active?"var(--accent)":"#cbd5e1"),
                       borderRadius:4,background:active?"var(--accent)":"transparent",
                       color:active?"#fff":"var(--text-secondary)",cursor:isRealistic?"pointer":"default",
                       opacity:isRealistic?1:0.4}
              }, preset[0]);
            })
          )
        );
      })()
    )
  );

  var overflowWrap = h("div", {className:"tb-overflow-wrap", ref:app.overflowRef},
    h("button", {
      className:"tb-overflow-btn",
      onClick:function(){app.setOverflowOpen(function(o){return !o;});},
      title:"More options",
      "aria-label":"More options menu"
    }, "\u00B7\u00B7\u00B7"),
    overflowMenu
  );

  // Split view toggle button
  var svgSplit = h("svg", {width:14,height:12,viewBox:"0 0 14 12",fill:"none"},
    h("rect",{x:"0.7",y:"0.7",width:"5.3",height:"10.6",rx:"1",stroke:"currentColor",strokeWidth:"1.3"}),
    h("rect",{x:"8",y:"0.7",width:"5.3",height:"10.6",rx:"1",stroke:"currentColor",strokeWidth:"1.3"})
  );
  var splitBtn = h("button", {
    className: "tb-btn" + (app.splitPaneEnabled ? " tb-btn--on" : ""),
    title: app.splitPaneEnabled ? "Exit split view (\\)" : "Split view: chart + preview (\\)",
    "aria-label": app.splitPaneEnabled ? "Exit split view" : "Enter split view",
    disabled: !(ctx.pat && ctx.pal),
    onClick: function() {
      var next = !app.splitPaneEnabled;
      app.setSplitPaneEnabled(next);
      if (typeof UserPrefs !== "undefined") UserPrefs.set("splitPaneEnabled", next);
    },
    style: { opacity: (ctx.pat && ctx.pal) ? 1 : 0.4 }
  }, svgSplit, !sc.bs ? " Split" : null);

  return h(React.Fragment, null,
    h("div", {className:"toolbar-row", role:"toolbar", "aria-label":"Edit mode tools"},
      h("div", {className:"pill-row"},
        h("div", {ref:app.stripRef, className:"pill"},
          brushGrp,
          stitchDrop,
          sizeGrp,
          bsCont,
          selectDrop,
          colChip,
          toolBadge,
          zoomGrp,
          undoRedo,
          h("div", {className:"tb-sdiv"}),
          previewDropWrap,
          h("div", {className:"tb-sdiv"}),
          splitBtn,
          h("div", {className:"tb-sdiv"}),
          overflowWrap
        )
      ),
      swatchRow
    )
  );
};
