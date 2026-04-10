/* creator/ToolStrip.js — The main tool strip bar above the pattern canvas.
   Reads from CreatorContext. Loaded as a plain <script> before the main Babel script.
   Depends on: CreatorContext (context.js) */

window.CreatorToolStrip = function CreatorToolStrip() {
  var ctx = React.useContext(window.CreatorContext);
  var h = React.createElement;

  // ResizeObserver: progressively collapse strip groups when narrow
  React.useEffect(function() {
    var el = ctx.stripRef.current;
    if (!el) return;
    var frame = null;
    var obs = new ResizeObserver(function() {
      if (frame) cancelAnimationFrame(frame);
      frame = requestAnimationFrame(function() {
        var w = el.clientWidth;
        ctx.setStripCollapsed({ view: w < 860, brush: w < 680, bs: w < 550 });
      });
    });
    obs.observe(el);
    return function() { obs.disconnect(); if (frame) cancelAnimationFrame(frame); };
  }, []);

  // Close overflow menu on outside click
  React.useEffect(function() {
    if (!ctx.overflowOpen) return;
    function close(e) {
      if (ctx.overflowRef.current && !ctx.overflowRef.current.contains(e.target))
        ctx.setOverflowOpen(false);
    }
    document.addEventListener("pointerdown", close);
    return function() { document.removeEventListener("pointerdown", close); };
  }, [ctx.overflowOpen]);

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

  // Stitch type group
  var stitchGrp = h("div", {className:"tb-grp"},
    h("button", {
      className:"tb-btn"+(ctx.stitchType==="cross"?" tb-btn--green":""),
      onClick:function(){ctx.selectStitchType("cross");}, title:"Cross stitch (1)"
    }, svgX, "Cross"),
    h("button", {
      className:"tb-btn"+(ctx.stitchType==="half-fwd"?" tb-btn--blue":""),
      onClick:function(){ctx.selectStitchType("half-fwd");}, title:"Half stitch / (2)"
    }, svgFwd, "Half /"),
    h("button", {
      className:"tb-btn"+(ctx.stitchType==="half-bck"?" tb-btn--blue":""),
      onClick:function(){ctx.selectStitchType("half-bck");}, title:"Half stitch \\ (3)"
    }, svgBck, "Half \\"),
    h("button", {
      className:"tb-btn"+(ctx.stitchType==="backstitch"?" tb-btn--on":""),
      onClick:function(){ctx.selectStitchType("backstitch");}, title:"Backstitch (4)"
    }, "Bs"),
    h("button", {
      className:"tb-btn"+(ctx.stitchType==="erase"?" tb-btn--red":""),
      onClick:function(){ctx.selectStitchType("erase");}, title:"Erase (5)"
    }, svgErase, "Erase")
  );

  // Brush group — shown when cross stitch
  var brushGrp = (ctx.stitchType === "cross") ? [
    h("div", {key:"sdiv-brush", className:"tb-sdiv"}),
    h("div", {
      key:"brush-grp",
      className:"tb-grp"+(sc.brush?" tb-hidden":""),
      style:{opacity: ctx.selectedColorId ? 1 : 0.6}
    },
      h("button", {
        className:"tb-btn"+(ctx.brushMode==="paint"?" tb-btn--on":""),
        onClick:function(){if(!ctx.selectedColorId){return;}ctx.setBrushAndActivate("paint");},
        title:ctx.selectedColorId?"Paint (P)":"Select a colour first",
        disabled:!ctx.selectedColorId
      }, "Paint"),
      h("button", {
        className:"tb-btn"+(ctx.brushMode==="fill"?" tb-btn--on":""),
        onClick:function(){if(!ctx.selectedColorId){return;}ctx.setBrushAndActivate("fill");},
        title:ctx.selectedColorId?"Fill (F)":"Select a colour first",
        disabled:!ctx.selectedColorId
      }, "Fill"),
      h("button", {
        className:"tb-btn"+(ctx.activeTool==="eyedropper"?" tb-btn--on":""),
        onClick:function(){ctx.setActiveTool("eyedropper"); ctx.setBsStart(null); ctx.setHalfStitchTool(null);},
        title:"Eyedropper (I)"
      }, "Pick Color")
    )
  ] : null;

  // Brush size group
  var showBrushSize = (
    (ctx.stitchType === "cross" && ctx.brushMode === "paint") ||
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
      h("span", {style:{fontSize:10,color:"#71717a",textTransform:"uppercase",fontWeight:600}}, "Size"),
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
      style:{display:"flex",alignItems:"center",gap:4,fontSize:11,cursor:"pointer",color:"#71717a",flexShrink:0}
    },
      h("input", {
        type:"checkbox", checked:ctx.bsContinuous,
        onChange:function(e){ctx.setBsContinuous(e.target.checked); ctx.setBsStart(null);}
      }),
      "Continuous"
    )
  ] : null;

  // Selection tools: Magic Wand + Lasso / Freehand / Magnetic
  var selectGrp = [
    h("div", {key:"sdiv-select", className:"tb-sdiv"}),
    h("div", {key:"select-grp", className:"tb-grp"},
      h("button", {
        key:"wand",
        className:"tb-btn"+(ctx.activeTool==="magicWand"?" tb-btn--on":""),
        onClick:function(){
          if (ctx.activeTool === "magicWand") { ctx.setActiveTool(null); }
          else {
            ctx.setActiveTool("magicWand");
            ctx.setHalfStitchTool(null);
            ctx.setBsStart(null);
            if (ctx.cancelLasso) ctx.cancelLasso();
          }
        },
        title:"Magic Wand — select by colour (W)"
      }, svgWand),
      h("button", {
        key:"freehand",
        className:"tb-btn"+(ctx.activeTool==="lasso" && ctx.lassoMode==="freehand"?" tb-btn--on":""),
        onClick:function(){
          var same = ctx.activeTool === "lasso" && ctx.lassoMode === "freehand";
          if (same) { ctx.cancelLasso(); ctx.setActiveTool(null); ctx.setLassoMode(null); }
          else {
            ctx.setActiveTool("lasso");
            ctx.setLassoMode("freehand");
            ctx.setHalfStitchTool(null);
            ctx.setBsStart(null);
          }
        },
        title:"Freehand selection"
      }, svgFreehand),
      h("button", {
        key:"polygon",
        className:"tb-btn"+(ctx.activeTool==="lasso" && ctx.lassoMode==="polygon"?" tb-btn--on":""),
        onClick:function(){
          var same = ctx.activeTool === "lasso" && ctx.lassoMode === "polygon";
          if (same) { ctx.cancelLasso(); ctx.setActiveTool(null); ctx.setLassoMode(null); }
          else {
            ctx.setActiveTool("lasso");
            ctx.setLassoMode("polygon");
            ctx.setHalfStitchTool(null);
            ctx.setBsStart(null);
          }
        },
        title:"Polygon lasso selection"
      }, svgPolygon),
      h("button", {
        key:"magnetic",
        className:"tb-btn"+(ctx.activeTool==="lasso" && ctx.lassoMode==="magnetic"?" tb-btn--on":""),
        onClick:function(){
          var same = ctx.activeTool === "lasso" && ctx.lassoMode === "magnetic";
          if (same) { ctx.cancelLasso(); ctx.setActiveTool(null); ctx.setLassoMode(null); }
          else {
            ctx.setActiveTool("lasso");
            ctx.setLassoMode("magnetic");
            ctx.setHalfStitchTool(null);
            ctx.setBsStart(null);
          }
        },
        title:"Magnetic lasso selection"
      }, svgMagnetic)
    ),
    (ctx.hasSelection || ctx.lassoInProgress) && h("button", {
      key:"select-clear",
      className:"tb-btn",
      onClick:function(){ if (ctx.cancelLasso) ctx.cancelLasso(); if (ctx.clearSelection) ctx.clearSelection(); },
      title:"Clear selection / cancel lasso (Esc)",
      style:{fontSize:9,padding:"2px 5px",color:"#71717a"}
    }, (ctx.selectionCount || 0).toLocaleString()+" sel")
  ];

  // View group
  var viewGrp = [
    h("div", {key:"sdiv-view", className:"tb-sdiv"}),
    h("div", {key:"view-grp", className:"tb-grp"+(sc.view?" tb-hidden":"")},
      [["color","Colour"],["symbol","Symbol"],["both","Both"]].map(function(kl) {
        return h("button", {
          key:kl[0],
          className:"tb-btn"+(ctx.view===kl[0]?" tb-btn--on":""),
          title:"Cycle view (V)",
          onClick:function(){ctx.setView(kl[0]);}
        }, kl[1]);
      })
    )
  ];

  // Colour chip
  var colChip = ((ctx.stitchType==="cross"||ctx.stitchType==="half-fwd"||ctx.stitchType==="half-bck") &&
    ctx.selectedColorId && ctx.cmap && ctx.cmap[ctx.selectedColorId]) ?
    h("span", {
      style:{fontSize:11,display:"flex",alignItems:"center",gap:3,padding:"2px 7px",borderRadius:6,
        background:(ctx.stitchType==="half-fwd"||ctx.stitchType==="half-bck")?"#e0f2fe":"#f4f4f5",
        flexShrink:0,
        border:(ctx.stitchType==="half-fwd"||ctx.stitchType==="half-bck")?"1px solid #7dd3fc":"none"
      }
    },
      h("span", {style:{width:10,height:10,borderRadius:2,
        background:"rgb("+ctx.cmap[ctx.selectedColorId].rgb+")",
        border:"1px solid #d4d4d8",display:"inline-block"}}),
      ctx.selectedColorId
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
        border:"2px solid "+(ctx.showOverlay?"#1D9E75":"#d4d4d8")}}),
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

  var viewItems = sc.view ? [
    h("div", {key:"ovf-sep-view", className:"tb-ovf-sep"}),
    h("span", {key:"ovf-lbl-view", className:"tb-ovf-lbl"}, "View"),
    [["color","Colour"],["symbol","Symbol"],["both","Both"]].map(function(kl) {
      return h("button", {
        key:kl[0],
        className:"tb-ovf-item"+(ctx.view===kl[0]?" tb-ovf-item--on":""),
        onClick:function(){ctx.setView(kl[0]); ctx.setOverflowOpen(false);}
      }, kl[1]+(ctx.view===kl[0]?" \u2713":""));
    })
  ] : null;

  var brushItems = (sc.brush && ctx.stitchType === "cross") ? [
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
    viewItems,
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

  return h("div", {className:"tb-strip"},
    h("div", {ref:ctx.stripRef, className:"tb-strip-inner"},
      stitchGrp,
      brushGrp,
      sizeGrp,
      bsCont,
      selectGrp,
      viewGrp,
      colChip,
      h("div", {className:"tb-flex"}),
      zoomGrp,
      undoRedo,
      h("div", {className:"tb-sdiv"}),
      overflowWrap
    )
  );
};
