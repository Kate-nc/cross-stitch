/* creator/ToolStrip.js — The main tool strip bar above the pattern canvas.
   Reads from CreatorContext. Loaded as a plain <script> before the main Babel script.
   Depends on: CreatorContext (context.js) */

window.CreatorToolStrip = function CreatorToolStrip() {
  var ctx = React.useContext(window.CreatorContext);
  var h = React.createElement;

  // Local dropdown state
  var _sdo = React.useState(false); var stitchDropOpen = _sdo[0], setStitchDropOpen = _sdo[1];
  var _seldo = React.useState(false); var selectDropOpen = _seldo[0], setSelectDropOpen = _seldo[1];
  var _swe = React.useState(false); var swatchExpanded = _swe[0], setSwatchExpanded = _swe[1];
  var stitchDropRef = React.useRef(null);
  var selectDropRef = React.useRef(null);

  // ResizeObserver: progressively collapse strip groups when narrow
  React.useEffect(function() {
    var el = ctx.stripRef.current;
    if (!el) return;
    var frame = null;
    var obs = new ResizeObserver(function() {
      if (frame) cancelAnimationFrame(frame);
      frame = requestAnimationFrame(function() {
        var w = el.clientWidth;
        ctx.setStripCollapsed({ brush: w < 680, bs: w < 550 });
      });
    });
    obs.observe(el);
    return function() { obs.disconnect(); if (frame) cancelAnimationFrame(frame); };
  }, []);

  // Close all dropdowns on outside click
  React.useEffect(function() {
    if (!stitchDropOpen && !selectDropOpen && !ctx.overflowOpen) return;
    function close(e) {
      if (stitchDropRef.current && !stitchDropRef.current.contains(e.target)) setStitchDropOpen(false);
      if (selectDropRef.current && !selectDropRef.current.contains(e.target)) setSelectDropOpen(false);
      if (ctx.overflowRef.current && !ctx.overflowRef.current.contains(e.target)) ctx.setOverflowOpen(false);
    }
    document.addEventListener("pointerdown", close);
    return function() { document.removeEventListener("pointerdown", close); };
  }, [stitchDropOpen, selectDropOpen, ctx.overflowOpen]);

  if (!(ctx.pat && ctx.pal && ctx.tab === "pattern")) return null;

  var sc = ctx.stripCollapsed || {};
  var svgX = h("svg", {width:11,height:11,viewBox:"0 0 12 12"},
    h("line", {x1:"1",y1:"11",x2:"11",y2:"1",stroke:"currentColor",strokeWidth:"1.8"}),
    h("line", {x1:"1",y1:"1",x2:"11",y2:"11",stroke:"currentColor",strokeWidth:"1.8"}));
  var svgFwd = h("svg", {width:11,height:11,viewBox:"0 0 12 12"},
    h("line", {x1:"1",y1:"11",x2:"11",y2:"1",stroke:"currentColor",strokeWidth:"1.8"}));
  var svgBck = h("svg", {width:11,height:11,viewBox:"0 0 12 12"},
    h("line", {x1:"1",y1:"1",x2:"11",y2:"11",stroke:"currentColor",strokeWidth:"1.8"}));
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
      className:"tb-grp"+(sc.brush?" tb-hidden":""),
      style:{opacity: ctx.selectedColorId ? 1 : 0.6}
    },
      h("button", {
        className:"tb-btn"+(ctx.brushMode==="paint" && ctx.activeTool!=="eyedropper" && ctx.stitchType!=="erase"?" tb-btn--on":""),
        onClick:function(){if(!ctx.selectedColorId){return;}ctx.setBrushAndActivate("paint"); ctx.selectStitchType("cross");},
        title:ctx.selectedColorId?"Paint (P)":"Select a colour first",
        disabled:!ctx.selectedColorId
      }, "Paint"),
      h("button", {
        className:"tb-btn"+(ctx.brushMode==="fill" && ctx.activeTool!=="eyedropper" && ctx.stitchType!=="erase"?" tb-btn--on":""),
        onClick:function(){if(!ctx.selectedColorId){return;}ctx.setBrushAndActivate("fill"); ctx.selectStitchType("cross");},
        title:ctx.selectedColorId?"Fill (F)":"Select a colour first",
        disabled:!ctx.selectedColorId
      }, "Fill"),
      h("button", {
        className:"tb-btn"+(ctx.stitchType==="erase"?" tb-btn--red":""),
        onClick:function(){ctx.selectStitchType("erase");}, title:"Erase (5)"
      }, svgErase, "Erase"),
      h("button", {
        className:"tb-btn"+(ctx.activeTool==="eyedropper"?" tb-btn--on":""),
        onClick:function(){ctx.setActiveTool("eyedropper"); ctx.setBsStart(null); ctx.setHalfStitchTool(null);},
        title:"Eyedropper (I)"
      }, "Pick")
    )
  ];

  // Stitch type dropdown — shown only when paint or fill is the active brush mode
  var showStitchGrp = (ctx.brushMode==="paint" || ctx.brushMode==="fill") && ctx.activeTool!=="eyedropper" && ctx.stitchType!=="erase";
  var stitchMeta = {
    "cross":      {icon:svgX,    label:"Cross",    cls:"tb-btn--green"},
    "half-fwd":   {icon:svgFwd,  label:"Half /",   cls:"tb-btn--blue"},
    "half-bck":   {icon:svgBck,  label:"Half \\",  cls:"tb-btn--blue"},
    "backstitch": {icon:null,    label:"Bs",       cls:"tb-btn--on"}
  };
  var activeSM = stitchMeta[ctx.stitchType] || stitchMeta["cross"];
  var stitchDrop = showStitchGrp ? [
    h("div", {key:"sdiv-stitch", className:"tb-sdiv"}),
    h("div", {key:"stitch-drop", className:"tb-drop-wrap", ref:stitchDropRef},
      h("button", {
        className:"tb-btn tb-drop-btn " + activeSM.cls,
        onClick:function(){setStitchDropOpen(function(o){return !o;});},
        title:"Stitch type"
      }, activeSM.icon, activeSM.label, h("span", {className:"tb-drop-arrow"}, "\u25BE")),
      stitchDropOpen && h("div", {className:"tb-dropdown"},
        Object.keys(stitchMeta).map(function(k) {
          var m = stitchMeta[k];
          return h("button", {
            key:k,
            className:"tb-drop-item" + (ctx.stitchType===k?" tb-drop-item--on":""),
            onClick:function(){ctx.selectStitchType(k); setStitchDropOpen(false);}
          }, m.icon, m.label);
        })
      )
    )
  ] : null;

  // Colour swatch strip — second toolbar row, sorted by usage, with expand
  var palDataRaw = ctx.displayPal || ctx.pal || [];
  var palData = palDataRaw.slice().sort(function(a,b){ return (b.count||0)-(a.count||0); });
  var SWATCH_INIT = 20;
  var swatchesShown = swatchExpanded ? palData : palData.slice(0, SWATCH_INIT);
  var swatchRow = showStitchGrp && palData.length > 0 ? h("div", {className:"swatch-strip-row"},
    h("span", {style:{fontSize:10,color:"var(--text-tertiary)",fontWeight:600,textTransform:"uppercase",marginRight:4,flexShrink:0,letterSpacing:0.5}}, "Colour"),
    ctx.selectedColorId && ctx.cmap && ctx.cmap[ctx.selectedColorId] ? h("span", {
      style:{display:"inline-flex",alignItems:"center",gap:4,fontSize:11,padding:"1px 7px 1px 3px",borderRadius:10,background:"#f0fdfa",border:"1px solid #99f6e4",marginRight:6,flexShrink:0}
    },
      h("span", {style:{width:12,height:12,borderRadius:2,background:"rgb("+ctx.cmap[ctx.selectedColorId].rgb+")",border:"1px solid #cbd5e1",display:"inline-block"}}),
      h("span", {style:{fontWeight:600,color:"#0d9488"}}, ctx.selectedColorId)
    ) : h("span", {style:{fontSize:10,color:"#94a3b8",marginRight:6,flexShrink:0}}, "none selected"),
    swatchesShown.map(function(p) {
      var isSel = ctx.selectedColorId === p.id;
      return h("button", {
        key: p.id,
        onClick: function() { ctx.setSelectedColorId(ctx.selectedColorId === p.id ? null : p.id); },
        title: "DMC " + p.id + (p.name ? " \xB7 " + p.name : "") + (p.count ? " \xB7 " + p.count + " st" : ""),
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
    ((ctx.stitchType === "cross" || ctx.stitchType === "half-fwd" || ctx.stitchType === "half-bck") && ctx.brushMode === "paint") ||
    ctx.stitchType === "erase" ||
    (ctx.halfStitchTool && ctx.halfStitchTool !== "erase")
  ) && ctx.activeTool !== "eyedropper";
  var sizeGrp = showBrushSize ? [
    h("div", {key:"sdiv-sz", className:"tb-sdiv"}),
    h("div", {
      key:"size-grp",
      className:"tb-grp",
      style:{display:"flex",alignItems:"center",gap:4,opacity:(ctx.selectedColorId||ctx.stitchType==="erase")?1:0.6}
    },
      h("span", {style:{fontSize:10,color:"#475569",textTransform:"uppercase",fontWeight:600}}, "Size"),
      [1,2,3].map(function(sz) {
        return h("button", {
          key:sz,
          className:"tb-btn"+(ctx.brushSize===sz?" tb-btn--on":""),
          onClick:function(){ctx.setBrushSize(sz);},
          style:{padding:"2px 6px",minWidth:24}
        }, sz);
      })
    )
  ] : null;

  // Backstitch continuous
  var bsCont = (ctx.stitchType === "backstitch") ? [
    h("div", {key:"sdiv-bs", className:"tb-sdiv"}),
    h("label", {
      key:"bs-cont",
      style:{display:"flex",alignItems:"center",gap:4,fontSize:11,cursor:"pointer",color:"#475569",flexShrink:0}
    },
      h("input", {
        type:"checkbox", checked:ctx.bsContinuous,
        onChange:function(e){ctx.setBsContinuous(e.target.checked); ctx.setBsStart(null);}
      }),
      "Continuous"
    )
  ] : null;

  // Selection tools dropdown
  var isSelectActive = ctx.activeTool === "magicWand" || ctx.activeTool === "lasso";
  var selIcon = ctx.activeTool === "magicWand" ? svgWand :
                ctx.activeTool === "lasso" && ctx.lassoMode === "polygon" ? svgPolygon :
                ctx.activeTool === "lasso" && ctx.lassoMode === "magnetic" ? svgMagnetic :
                ctx.activeTool === "lasso" ? svgFreehand : svgWand;
  var selLabel = ctx.activeTool === "magicWand" ? "Wand" :
                 ctx.activeTool === "lasso" ? (ctx.lassoMode === "polygon" ? "Poly" : ctx.lassoMode === "magnetic" ? "Mag" : "Lasso") :
                 "Select";
  var selectDrop = [
    h("div", {key:"sdiv-select", className:"tb-sdiv"}),
    h("div", {key:"select-drop", className:"tb-drop-wrap", ref:selectDropRef},
      h("button", {
        className:"tb-btn tb-drop-btn" + (isSelectActive || selectDropOpen ? " tb-btn--on" : ""),
        onClick:function(){setSelectDropOpen(function(o){return !o;});},
        title:"Selection tools"
      }, selIcon, selLabel, h("span", {className:"tb-drop-arrow"}, "\u25BE")),
      selectDropOpen && h("div", {className:"tb-dropdown"},
        h("button", {
          className:"tb-drop-item"+(ctx.activeTool==="magicWand"?" tb-drop-item--on":""),
          onClick:function(){
            if (ctx.activeTool==="magicWand") { ctx.setActiveTool(null); }
            else { ctx.setActiveTool("magicWand"); ctx.setHalfStitchTool(null); ctx.setBsStart(null); if (ctx.cancelLasso) ctx.cancelLasso(); }
            setSelectDropOpen(false);
          }
        }, svgWand, "Magic Wand"),
        h("button", {
          className:"tb-drop-item"+(ctx.activeTool==="lasso"&&ctx.lassoMode==="freehand"?" tb-drop-item--on":""),
          onClick:function(){
            var same=ctx.activeTool==="lasso"&&ctx.lassoMode==="freehand";
            if (same){ctx.cancelLasso();ctx.setActiveTool(null);ctx.setLassoMode(null);}
            else{ctx.setActiveTool("lasso");ctx.setLassoMode("freehand");ctx.setHalfStitchTool(null);ctx.setBsStart(null);}
            setSelectDropOpen(false);
          }
        }, svgFreehand, "Freehand"),
        h("button", {
          className:"tb-drop-item"+(ctx.activeTool==="lasso"&&ctx.lassoMode==="polygon"?" tb-drop-item--on":""),
          onClick:function(){
            var same=ctx.activeTool==="lasso"&&ctx.lassoMode==="polygon";
            if (same){ctx.cancelLasso();ctx.setActiveTool(null);ctx.setLassoMode(null);}
            else{ctx.setActiveTool("lasso");ctx.setLassoMode("polygon");ctx.setHalfStitchTool(null);ctx.setBsStart(null);}
            setSelectDropOpen(false);
          }
        }, svgPolygon, "Polygon"),
        h("button", {
          className:"tb-drop-item"+(ctx.activeTool==="lasso"&&ctx.lassoMode==="magnetic"?" tb-drop-item--on":""),
          onClick:function(){
            var same=ctx.activeTool==="lasso"&&ctx.lassoMode==="magnetic";
            if (same){ctx.cancelLasso();ctx.setActiveTool(null);ctx.setLassoMode(null);}
            else{ctx.setActiveTool("lasso");ctx.setLassoMode("magnetic");ctx.setHalfStitchTool(null);ctx.setBsStart(null);}
            setSelectDropOpen(false);
          }
        }, svgMagnetic, "Magnetic"),
        (ctx.hasSelection || ctx.lassoInProgress) && h("div", {style:{borderTop:"1px solid var(--border)",marginTop:3,paddingTop:3}},
          h("button", {
            className:"tb-drop-item",
            onClick:function(){if(ctx.cancelLasso)ctx.cancelLasso();if(ctx.clearSelection)ctx.clearSelection();setSelectDropOpen(false);}
          }, "\u2715 Clear (", (ctx.selectionCount||0).toLocaleString(), ")")
        )
      )
    ),
    (ctx.hasSelection || ctx.lassoInProgress) && h("button", {
      key:"select-clear",
      className:"tb-btn",
      onClick:function(){if(ctx.cancelLasso)ctx.cancelLasso();if(ctx.clearSelection)ctx.clearSelection();},
      title:"Clear selection (Esc)",
      style:{fontSize:9,padding:"2px 5px",color:"#475569"}
    }, (ctx.selectionCount||0).toLocaleString()+" sel")
  ];

  // Colour chip
  var colChip = ((ctx.stitchType==="cross"||ctx.stitchType==="half-fwd"||ctx.stitchType==="half-bck") &&
    ctx.selectedColorId && ctx.cmap && ctx.cmap[ctx.selectedColorId]) ?
    h("span", {
      style:{fontSize:11,display:"flex",alignItems:"center",gap:3,padding:"2px 7px",borderRadius:6,
        background:(ctx.stitchType==="half-fwd"||ctx.stitchType==="half-bck")?"#e0f2fe":"#f1f5f9",
        flexShrink:0,
        border:(ctx.stitchType==="half-fwd"||ctx.stitchType==="half-bck")?"1px solid #7dd3fc":"none"
      }
    },
      h("span", {style:{width:10,height:10,borderRadius:2,
        background:"rgb("+ctx.cmap[ctx.selectedColorId].rgb+")",
        border:"1px solid #cbd5e1",display:"inline-block"}}),
      ctx.selectedColorId
    ) : null;

  // Active tool indicator badge
  var badgeLabel, badgeBg, badgeColor, badgeDot;
  if (ctx.activeTool === "eyedropper") {
    badgeLabel = "Eyedropper"; badgeBg = "#fef9c3"; badgeColor = "#854d0e"; badgeDot = "#eab308";
  } else if (ctx.activeTool === "magicWand") {
    badgeLabel = "Magic Wand"; badgeBg = "#f3e8ff"; badgeColor = "#6b21a8"; badgeDot = "#a855f7";
  } else if (ctx.activeTool === "lasso") {
    var lm = ctx.lassoMode === "polygon" ? "Polygon" : ctx.lassoMode === "magnetic" ? "Magnetic" : "Freehand";
    badgeLabel = "Lasso \xB7 " + lm; badgeBg = "#fff7ed"; badgeColor = "#9a3412"; badgeDot = "#f97316";
  } else if (ctx.stitchType === "erase" || ctx.activeTool === "eraseAll" || ctx.activeTool === "eraseBs") {
    badgeLabel = "Erase"; badgeBg = "#fef2f2"; badgeColor = "#991b1b"; badgeDot = "#ef4444";
  } else if (ctx.stitchType === "backstitch") {
    badgeLabel = "Backstitch"; badgeBg = "#f5f5f5"; badgeColor = "#404040"; badgeDot = "#737373";
  } else if (ctx.stitchType === "half-fwd") {
    badgeLabel = "Half /"; badgeBg = "#e0f2fe"; badgeColor = "#075985"; badgeDot = "#0284c7";
  } else if (ctx.stitchType === "half-bck") {
    badgeLabel = "Half \\"; badgeBg = "#e0f2fe"; badgeColor = "#075985"; badgeDot = "#0284c7";
  } else if (ctx.brushMode === "fill") {
    badgeLabel = "Fill"; badgeBg = "#f0fdf4"; badgeColor = "#166534"; badgeDot = "#22c55e";
  } else if (ctx.brushMode === "paint") {
    var szTxt = ctx.brushSize > 1 ? " " + ctx.brushSize + "\xD7" + ctx.brushSize : "";
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
      type:"range", min:0.05, max:3, step:0.05, value:ctx.zoom,
      onChange:function(e){ctx.setZoom(Number(e.target.value));},
      style:{width:55}
    }),
    h("span", {className:"tb-zoom-pct"}, Math.round(ctx.zoom*100)+"%"),
    h("button", {className:"tb-fit-btn", onClick:ctx.fitZ}, "Fit")
  );

  // Undo/Redo
  var undoRedo = (ctx.editHistory.length > 0 || ctx.redoHistory.length > 0) ? [
    h("div", {key:"sdiv-ur", className:"tb-sdiv"}),
    h("button", {
      key:"undo", className:"tb-btn",
      onClick:ctx.undoEdit, disabled:!ctx.editHistory.length,
      title:"Undo (Ctrl+Z)",
      style:{opacity:ctx.editHistory.length?1:0.3}
    }, "\u21A9"),
    h("button", {
      key:"redo", className:"tb-btn",
      onClick:ctx.redoEdit, disabled:!ctx.redoHistory.length,
      title:"Redo (Ctrl+Y)",
      style:{opacity:ctx.redoHistory.length?1:0.3}
    }, "\u21AA")
  ] : null;

  // Overflow menu items
  var overlayItems = (ctx.img && ctx.img.src) ? [
    h("button", {
      key:"overlay-btn",
      className:"tb-ovf-item"+(ctx.showOverlay?" tb-ovf-item--on":""),
      onClick:function(){ctx.setShowOverlay(function(v){return !v;});}
    },
      h("span", {style:{width:14,height:14,borderRadius:3,flexShrink:0,display:"inline-block",
        border:"2px solid "+(ctx.showOverlay?"#0d9488":"#cbd5e1")}}),
      " Overlay"+(ctx.showOverlay?" \u2713":"")
    ),
    ctx.showOverlay && h("div", {key:"overlay-slider", style:{padding:"4px 14px 6px"}},
      h("input", {
        type:"range",min:0.1,max:0.8,step:0.05,value:ctx.overlayOpacity,
        onChange:function(e){ctx.setOverlayOpacity(Number(e.target.value));},
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
        className:"tb-ovf-item"+(ctx.brushMode===kl[0]?" tb-ovf-item--on":""),
        onClick:function(){ctx.setBrushAndActivate(kl[0]); ctx.setOverflowOpen(false);}
      }, kl[1]+(ctx.brushMode===kl[0]?" \u2713":""));
    })
  ] : null;

  var overflowMenu = ctx.overflowOpen ? h("div", {className:"tb-overflow-menu"},
    h("span", {className:"tb-ovf-lbl"}, "Display"),
    overlayItems,
    brushItems
  ) : null;

  var overflowWrap = h("div", {className:"tb-overflow-wrap", ref:ctx.overflowRef},
    h("button", {
      className:"tb-overflow-btn",
      onClick:function(){ctx.setOverflowOpen(function(o){return !o;});},
      title:"More options"
    }, "\u00B7\u00B7\u00B7"),
    overflowMenu
  );

  return h(React.Fragment, null,
    h("div", {className:"toolbar-row"},
      h("div", {className:"pill-row"},
        h("div", {ref:ctx.stripRef, className:"pill"},
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
          overflowWrap
        )
      ),
      swatchRow
    )
  );
};
