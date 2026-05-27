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

  // "More" panel state (secondary tools flyout / mobile bottom sheet)
  var morePanelOpen = !!app.morePanelOpen;
  var setMorePanelOpen = app.setMorePanelOpen;
  var morePanelRef = React.useRef(null);
  var moreBtnRef = React.useRef(null);
  var swatchRowRef = React.useRef(null);
  React.useEffect(function() {
    if (!morePanelOpen) return;
    function closeMp(e) {
      if (morePanelRef.current && morePanelRef.current.contains(e.target)) return;
      if (moreBtnRef.current && moreBtnRef.current.contains(e.target)) return;
      setMorePanelOpen(false);
    }
    document.addEventListener('pointerdown', closeMp);
    return function() {
      document.removeEventListener('pointerdown', closeMp);
    };
  }, [morePanelOpen]);

  // Close More panel when active tool changes via keyboard shortcut
  React.useEffect(function() { setMorePanelOpen(false); }, [cv.activeTool]);

  // (The Preview chart-mode dropdown that used to live here has moved into
  // the Sidebar Preview tab — see creator/Sidebar.js previewPanel.)

  if (!(ctx.pat && ctx.pal && app.tab === "pattern")) return null;

  // ─── Cleanup Mode control row ─────────────────────────────────────────────
  // Computed here — before the create-mode early return — so it renders in
  // both create mode and edit mode. A compact target chip replaces the old
  // inline full-palette swatch array so the row fits on narrow toolbars.
  var cleanupRow = null;
  if (cv.activeTool === "cleanup") {
    var palForCleanup = (ctx.displayPal || ctx.pal || []).filter(function(p){ return p.id !== '__skip__' && p.id !== '__empty__'; });
    var pendingCt = 0;
    if (cv.cleanupPendingMask) { for (var pci = 0; pci < cv.cleanupPendingMask.length; pci++) { if (cv.cleanupPendingMask[pci]) pendingCt++; } }
    var hasPending = pendingCt > 0;
    var subTools = [
      { id: "click", label: "Click" },
      { id: "brush", label: "Brush" },
      { id: "auto",  label: "Auto" }
    ];
    // Compact target chip — shows the current target colour; opens a swatch
    // popover on click. Reuses the openDrop / outside-click-close mechanism.
    var clTgtEntry = ctx.cmap && cv.cleanupTargetColorId ? ctx.cmap[cv.cleanupTargetColorId] : null;
    var cleanupTgtChip = h("div", {
      className: "tb-drop-wrap" + (openDrop === 'cleanup-target' ? " tb-drop-wrap--open" : ""),
      style: { position: "relative", display: "inline-flex", flexShrink: 0 }
    },
      h("button", {
        className: "tb-btn" + (openDrop === 'cleanup-target' ? " tb-btn--on" : ""),
        onClick: function(e) {
          e.stopPropagation();
          setOpenDrop(function(v) { return v === 'cleanup-target' ? null : 'cleanup-target'; });
        },
        title: "Target: DMC " + (cv.cleanupTargetColorId || "") + (clTgtEntry && clTgtEntry.name ? " " + clTgtEntry.name : "") + " — click to change",
        "aria-label": "Change cleanup target colour",
        "aria-expanded": openDrop === 'cleanup-target' ? "true" : "false",
        "aria-haspopup": "listbox",
        style: { display:"inline-flex", alignItems:"center", gap:5, padding:"2px 8px 2px 5px" }
      },
        clTgtEntry && h("span", {
          "aria-hidden": "true",
          style: { width:12, height:12, borderRadius:2, flexShrink:0, display:"inline-block",
                   background:"rgb("+clTgtEntry.rgb+")", border:"1.5px solid rgba(0,0,0,0.2)" }
        }),
        h("span", {style:{fontSize:11}},
          cv.cleanupTargetColorId ? "DMC " + cv.cleanupTargetColorId : "None"
        ),
        h("span", {"aria-hidden":"true", style:{display:"inline-flex",opacity:0.6,marginLeft:1}}, window.Icons && window.Icons.chevronDown ? window.Icons.chevronDown() : null)
      ),
      openDrop === 'cleanup-target' && h("div", {
        role: "listbox",
        "aria-label": "Select cleanup target colour",
        style: {
          position:"absolute", top:"calc(100% + 2px)", left:0, zIndex:200,
          background:"var(--surface)", border:"1px solid var(--line)", borderRadius:"var(--radius-sm)",
          boxShadow:"var(--shadow-sm)", padding:6, display:"flex", flexWrap:"wrap", gap:3,
          minWidth:100, maxWidth:210
        }
      },
        palForCleanup.map(function(p) {
          var isTgt = cv.cleanupTargetColorId === p.id;
          return h("button", {
            key: p.id,
            role: "option",
            "aria-selected": isTgt,
            onClick: function(e) { e.stopPropagation(); cv.setCleanupTargetColorId(p.id); setOpenDrop(null); },
            title: "DMC " + p.id + (p.name ? " \xB7 " + p.name : ""),
            "aria-label": "Set cleanup target to DMC " + p.id + (p.name ? " " + p.name : ""),
            style:{
              width:18, height:18, flexShrink:0, borderRadius:3, cursor:"pointer", padding:0,
              background:"rgb("+p.rgb+")",
              border: isTgt ? "2px solid var(--accent)" : "1.5px solid rgba(0,0,0,0.15)",
              boxShadow: isTgt ? "0 0 0 2px #fff inset" : "none",
              outline: "none"
            }
          });
        })
      )
    );
    cleanupRow = h("div", {
      className: "swatch-strip-row",
      role: "group",
      "aria-label": "Cleanup mode controls",
      style: { gap: "var(--s-2)", paddingTop: "var(--s-1)", alignItems: "center" }
    },
      // ── Target colour chip ────────────────────────────────────────────────
      h("span", {
        style:{fontSize:10,color:"var(--text-tertiary)",fontWeight:600,textTransform:"uppercase",flexShrink:0,letterSpacing:0.5}
      }, "Target"),
      cleanupTgtChip,
      // ── Tolerance slider ──────────────────────────────────────────────────
      h("span", {
        style:{fontSize:10,color:"var(--text-tertiary)",fontWeight:600,textTransform:"uppercase",flexShrink:0,letterSpacing:0.5,marginLeft:4}
      }, "Tol"),
      h("input", {
        type:"range", min:0, max:100, step:1, value: cv.cleanupTolerance,
        onChange: function(e){ cv.setCleanupTolerance(Number(e.target.value)); },
        style:{width:60},
        title:"Colour tolerance: " + cv.cleanupTolerance + " (\u0394E \u2248" + Math.round(cv.cleanupTolerance / 100 * 30) + ")",
        "aria-label": "Colour tolerance"
      }),
      h("span", {style:{fontSize:10,color:"var(--text-tertiary)",minWidth:20,textAlign:"right"}}, cv.cleanupTolerance),
      // ── Sub-tool radios ───────────────────────────────────────────────────
      h("span", {
        style:{fontSize:10,color:"var(--text-tertiary)",fontWeight:600,textTransform:"uppercase",flexShrink:0,letterSpacing:0.5,marginLeft:4}
      }, "Mode"),
      subTools.map(function(st) {
        var isActive = cv.cleanupSelTool === st.id;
        return h("button", {
          key: st.id,
          className: "tb-btn" + (isActive ? " tb-btn--on" : ""),
          onClick: function(){ cv.setCleanupSelTool(st.id); },
          title: st.label + " selection",
          "aria-label": st.label + " selection mode",
          "aria-pressed": isActive,
          style:{padding:"1px 8px",fontSize:11}
        }, st.label);
      }),
      // ── Brush size (only when Brush sub-tool is active) ───────────────────
      cv.cleanupSelTool === "brush" && h(React.Fragment, null,
        h("span", {
          style:{fontSize:10,color:"var(--text-tertiary)",fontWeight:600,textTransform:"uppercase",flexShrink:0,letterSpacing:0.5,marginLeft:4}
        }, "Size"),
        h("button", {
          className:"tb-btn", style:{padding:"1px 7px",fontSize:12},
          onClick:function(){ cv.setCleanupBrushSize(Math.max(1, (cv.cleanupBrushSize||1)-1)); },
          "aria-label":"Decrease brush size",
          disabled:(cv.cleanupBrushSize||1) <= 1
        }, window.Icons && window.Icons.minus ? window.Icons.minus() : null),
        h("span", {style:{fontSize:11,minWidth:16,textAlign:"center",color:"var(--text-secondary)"}}, cv.cleanupBrushSize||1),
        h("button", {
          className:"tb-btn", style:{padding:"1px 7px",fontSize:12},
          onClick:function(){ cv.setCleanupBrushSize(Math.min(10, (cv.cleanupBrushSize||1)+1)); },
          "aria-label":"Increase brush size",
          disabled:(cv.cleanupBrushSize||1) >= 10
        }, "+")
      ),
      // ── Re-run button (Auto sub-tool only — first run triggers automatically) ──
      cv.cleanupSelTool === "auto" && h("button", {
        className:"tb-btn",
        onClick: function(){ if (cv.runAutoDetect) cv.runAutoDetect(); },
        disabled: cv.cleanupAutoRunning || !cv.cleanupTargetColorId,
        title: cv.cleanupAutoRunning ? "Detecting\u2026" : "Re-run auto-detect",
        "aria-label": "Re-run auto-detect",
        style:{marginLeft:4}
      }, cv.cleanupAutoRunning ? "Detecting\u2026" : "Re-run"),
      // ── Auto-error notice ─────────────────────────────────────────────────
      cv.cleanupAutoError && h("span", {
        role:"alert",
        style:{fontSize:10,color:"var(--danger)",marginLeft:4,flexShrink:1,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",maxWidth:160}
      }, cv.cleanupAutoError),
      // ── Apply / Cancel ────────────────────────────────────────────────────
      h("button", {
        className:"tb-btn tb-btn--primary",
        onClick: function(){ if (cv.applyCleanup) cv.applyCleanup(); },
        disabled: !hasPending,
        title: hasPending ? "Apply cleanup (" + pendingCt.toLocaleString("en-GB") + " cells)" : "No cells selected",
        "aria-label": "Apply cleanup",
        "aria-disabled": !hasPending,
        style:{
          marginLeft:8, opacity: hasPending ? 1 : 0.4,
          background: hasPending ? "var(--accent)" : undefined,
          color: hasPending ? "#fff" : undefined,
          border: hasPending ? "none" : undefined
        }
      }, "Apply"),
      h("button", {
        className:"tb-btn",
        onClick: function(){
          if (cv.cancelCleanup) cv.cancelCleanup();
          if (cv.exitCleanup) cv.exitCleanup();
        },
        title:"Cancel cleanup mode",
        "aria-label":"Cancel cleanup mode",
        style:{marginLeft:4}
      }, "Cancel")
    );
  }

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
          // Cleanup mode toggle — available in create mode to clean up
          // lineart that was averaged into stitch colours during import.
          ctx.pat && h("button", {
            className:"tb-btn"+(cv.activeTool==="cleanup"?" tb-btn--on":""),
            onClick:function(){
              if (cv.activeTool==="cleanup") { if (cv.exitCleanup) cv.exitCleanup(); }
              else { if (cv.enterCleanup) cv.enterCleanup(); }
            },
            title:"Cleanup Mode — remove lineart pixels averaged into stitch colours",
            "aria-label":"Cleanup mode",
            "aria-pressed": cv.activeTool==="cleanup" ? "true" : "false"
          }, window.Icons && window.Icons.cleanup ? window.Icons.cleanup() : null, " Cleanup"),
          // Zoom
          createZoomGrp
        )
      ),
      cleanupRow
    );
  }

  // ─── Edit Mode: full editing toolbar (current behaviour) ──────────────────────

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

  // Brush group — primary tools only; secondary tools (Hand/Pick/Wand/Lasso/Replace/Cleanup) live in More panel
  var brushGrp = [
    h("div", {key:"brush-grp", className:"tb-grp"},
      h("button", {
        className:"tb-btn"+(cv.brushMode==="paint" && cv.activeTool!=="eyedropper" && cv.stitchType!=="erase"?" tb-btn--on":""),
        onClick:function(){
          if (!cv.selectedColorId && palData.length > 0) cv.setSelectedColorId(palData[0].id);
          cv.setBrushAndActivate("paint");
        },
        title:"Paint (P)", "aria-label":"Paint tool"
      }, "Paint"),
      h("button", {
        className:"tb-btn"+(cv.brushMode==="fill" && cv.activeTool!=="eyedropper" && cv.stitchType!=="erase"?" tb-btn--on":""),
        onClick:function(){
          if (!cv.selectedColorId && palData.length > 0) cv.setSelectedColorId(palData[0].id);
          cv.setBrushAndActivate("fill");
        },
        title:"Fill (F)", "aria-label":"Fill tool"
      }, "Fill"),
      h("button", {
        className:"tb-btn"+(cv.stitchType==="erase"?" tb-btn--red":""),
        onClick:function(){cv.selectStitchType("erase");}, title:"Erase (5)", "aria-label":"Erase tool"
      }, svgErase, "Erase")
    )
  ];

  // Stitch type, brush size and backstitch-continuous toggle previously
  // lived here; they have moved to the Sidebar Tools tab. The toolbar
  // keeps Paint/Fill/Erase/Pick + Wand/Lasso primary buttons only.
  // (Stitch type cycles with the T shortcut from the keyboard; sub-modes
  // for the lasso are picked once in the Tools tab and remembered.)

  // Colour swatch strip — second toolbar row, sorted by usage, all swatches scrollable
  var showSwatchRow = ((cv.brushMode==="paint" || cv.brushMode==="fill") && cv.activeTool!=="eyedropper" && cv.stitchType!=="erase" || cv.activeTool==="eyedropper") && palData.length > 0;
  var swatchRow = showSwatchRow ? h("div", {className:"swatch-strip-row"},
    h("span", {style:{fontSize:10,color:"var(--text-tertiary)",fontWeight:600,textTransform:"uppercase",marginRight:'var(--s-1)',flexShrink:0,letterSpacing:0.5}}, "Colour"),
    cv.selectedColorId && ctx.cmap && ctx.cmap[cv.selectedColorId] ? h("span", {
      style:{display:"inline-flex",alignItems:"center",gap:'var(--s-1)',fontSize:'var(--text-xs)',padding:"1px 7px 1px 3px",borderRadius:'var(--radius-lg)',background:"var(--accent-light)",border:"1px solid var(--accent-border)",marginRight:6,flexShrink:0,maxWidth:"40vw",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"},
      title: ctx.cmap[cv.selectedColorId].name || cv.selectedColorId
    },
      h("span", {style:{width:12,height:12,borderRadius:2,background:"rgb("+ctx.cmap[cv.selectedColorId].rgb+")",border:"1px solid var(--border)",display:"inline-block",flexShrink:0}}),
      h("span", {style:{fontWeight:600,color:"var(--accent)",flexShrink:0}}, cv.selectedColorId),
      ctx.cmap[cv.selectedColorId].name ? h("span", {style:{color:"var(--accent-hover)",fontWeight:400,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}, "\u00B7 " + ctx.cmap[cv.selectedColorId].name) : null
    ) : h("span", {style:{fontSize:10,color:"var(--text-tertiary)",marginRight:6,flexShrink:0}}, "none selected"),
    palData.length > 5 && h("button", {
      className:"tb-swatch-scroll-btn",
      onClick:function(){ swatchRowRef.current && swatchRowRef.current.scrollBy({left:-120,behavior:"smooth"}); },
      "aria-label":"Scroll swatches left", title:"Scroll left"
    }, window.Icons && window.Icons.chevronLeft ? window.Icons.chevronLeft() : null),
    h("div", {ref:swatchRowRef, className:"swatch-scroll-inner"},
      palData.map(function(p) {
        var isSel = cv.selectedColorId === p.id;
        return h("button", {
          key: p.id,
          onClick: function() { cv.setSelectedColorId(cv.selectedColorId === p.id ? null : p.id); },
          title: "DMC " + p.id + (p.name ? " \xB7 " + p.name : "") + (p.count ? " \xB7 " + p.count + " st" : ""),
          "aria-label": "Select DMC " + p.id + (p.name ? " " + p.name : ""),
          "aria-pressed": isSel,
          style:{
            width:40, height:40, flexShrink:0,
            borderRadius:6, cursor:"pointer", padding:0,
            background:"rgb("+p.rgb+")",
            border: isSel ? "2.5px solid var(--accent)" : "1.5px solid rgba(0,0,0,0.15)",
            boxShadow: isSel ? "0 0 0 2px #fff inset" : "none",
            outline:"none"
          }
        });
      })
    ),
    palData.length > 5 && h("button", {
      className:"tb-swatch-scroll-btn",
      onClick:function(){ swatchRowRef.current && swatchRowRef.current.scrollBy({left:120,behavior:"smooth"}); },
      "aria-label":"Scroll swatches right", title:"Scroll right"
    }, window.Icons && window.Icons.chevronRight ? window.Icons.chevronRight() : null)
  ) : null;

  // Clear selection — shown in pill when a selection is active (Wand/Lasso are in More panel)
  var clearSelBtn = (cv.hasSelection || cv.lassoInProgress) ? [
    h("div", {key:"sdiv-clrsel", className:"tb-sdiv"}),
    h("button", {
      key:"clr-sel",
      className:"tb-btn",
      onClick:function(){ if(cv.cancelLasso) cv.cancelLasso(); if(cv.clearSelection) cv.clearSelection(); },
      title:"Clear selection (Esc)", "aria-label":"Clear selection",
      style:{fontSize:10,padding:"2px 6px",color:"var(--text-secondary)"}
    }, (cv.selectionCount||0).toLocaleString()+" sel ", window.Icons.x())
  ] : null;

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
  } else if (cv.activeTool === "colourReplace") {
    badgeLabel = "Replace"; badgeBg = "#ede9fe"; badgeColor = "#7c3aed"; badgeDot = "#7c3aed";
  } else if (cv.activeTool === "cleanup") {
    var pendingCount = 0;
    if (cv.cleanupPendingMask) { for (var ci2 = 0; ci2 < cv.cleanupPendingMask.length; ci2++) { if (cv.cleanupPendingMask[ci2]) pendingCount++; } }
    badgeLabel = "Cleanup" + (pendingCount > 0 ? " \xb7 " + pendingCount.toLocaleString() + " sel" : "");
    badgeBg = "#fff7ed"; badgeColor = "#c2410c"; badgeDot = "#ea580c";
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

  // "More" panel — secondary tools + settings flyout (dropdown on desktop, bottom sheet on touch)
  var morePanelHasActiveTool = cv.activeTool === "eyedropper" || cv.activeTool === "hand" ||
    cv.activeTool === "magicWand" || cv.activeTool === "lasso" ||
    cv.activeTool === "colourReplace" || cv.activeTool === "cleanup";

  var stitchTypeOptions = [
    { id:"cross", label:"Cross" },
    { id:"quarter", label:"\u00BC St" },
    { id:"half-fwd", label:"Half /" },
    { id:"half-bck", label:"Half \\" },
    { id:"three-quarter", label:"\u00BE St" },
    { id:"backstitch", label:"Backstitch" }
  ];

  var morePanelContent = morePanelOpen ? h("div", {
    ref:morePanelRef,
    className:"tb-more-panel",
    role:"dialog",
    "aria-label":"More tools"
  },
    // ── Canvas management ──
    h("div", {className:"tb-more-panel__section"},
      h("span", {className:"tb-ovf-lbl"}, "Canvas"),
      h("button", {
        className:"tb-btn",
        onClick:function(){ if(app&&app.openResizeCanvas)app.openResizeCanvas(); setMorePanelOpen(false); },
        title:"Resize canvas \u2014 crop or expand the pattern bounds",
        "aria-label":"Resize canvas",
        style:{width:"100%",justifyContent:"flex-start"}
      }, window.Icons&&window.Icons.canvasResize?window.Icons.canvasResize():null, " Resize canvas\u2026"),
      (gen.img && gen.img.src) && h("button", {
        className:"tb-btn",
        onClick:function(){ if(app&&app.requestBackToConvert)app.requestBackToConvert(); setMorePanelOpen(false); },
        title:"Return to image settings and re-generate the pattern",
        "aria-label":"Re-generate from image",
        style:{width:"100%",justifyContent:"flex-start"}
      }, window.Icons&&window.Icons.sliders?window.Icons.sliders():null, " Re-generate from image\u2026")
    ),
    // ── Tools ──
    h("div", {className:"tb-more-panel__section"},
      h("span", {className:"tb-ovf-lbl"}, "Tools"),
      h("div", {className:"tb-grp", style:{flexWrap:"wrap",gap:2}},
        h("button", {
          className:"tb-btn"+(cv.activeTool==="hand"?" tb-btn--on":""),
          onClick:function(){
            if (cv.activeTool==="hand") cv.setActiveTool(null);
            else { cv.setActiveTool("hand"); cv.setBsStart(null); ctx.setPartialStitchTool(null); if (cv.cancelLasso) cv.cancelLasso(); }
            setMorePanelOpen(false);
          },
          title:"Hand — pan / drag to scroll (H)", "aria-label":"Hand pan tool",
          "aria-pressed": cv.activeTool==="hand"?"true":"false"
        }, window.Icons.hand(), " Hand"),
        h("button", {
          className:"tb-btn"+(cv.activeTool==="eyedropper"?" tb-btn--on":""),
          onClick:function(){
            cv.setActiveTool("eyedropper"); cv.setBsStart(null); ctx.setPartialStitchTool(null);
            setMorePanelOpen(false);
          },
          title:"Eyedropper (I)", "aria-label":"Eyedropper tool"
        }, "Pick"),
        h("button", {
          className:"tb-btn"+(cv.activeTool==="magicWand"?" tb-btn--on":""),
          onClick:function(){
            if (cv.activeTool==="magicWand") cv.setActiveTool(null);
            else { cv.setActiveTool("magicWand"); ctx.setPartialStitchTool(null); cv.setBsStart(null); if (cv.cancelLasso) cv.cancelLasso(); }
            setMorePanelOpen(false);
          },
          title:"Magic Wand (W)", "aria-label":"Magic wand",
          "aria-pressed": cv.activeTool==="magicWand"?"true":"false"
        }, svgWand, " Wand"),
        h("button", {
          className:"tb-btn"+(cv.activeTool==="lasso"?" tb-btn--on":""),
          onClick:function(){
            if (cv.activeTool==="lasso") { if (cv.cancelLasso) cv.cancelLasso(); cv.setActiveTool(null); }
            else { cv.setActiveTool("lasso"); cv.setLassoMode(cv.lassoMode||"freehand"); ctx.setPartialStitchTool(null); cv.setBsStart(null); }
            setMorePanelOpen(false);
          },
          title:"Lasso \u2014 mode in Tools tab", "aria-label":"Lasso",
          "aria-pressed": cv.activeTool==="lasso"?"true":"false"
        }, cv.lassoMode==="polygon"?svgPolygon:cv.lassoMode==="magnetic"?svgMagnetic:svgFreehand, " Lasso"),
        h("button", {
          className:"tb-btn"+(cv.activeTool==="colourReplace"?" tb-btn--on":""),
          onClick:function(){
            if (cv.activeTool==="colourReplace") cv.setActiveTool(null);
            else { cv.setActiveTool("colourReplace"); cv.setBsStart(null); ctx.setPartialStitchTool(null); if (cv.cancelLasso) cv.cancelLasso(); }
            setMorePanelOpen(false);
          },
          title:"Replace colour \u2014 click a stitch to replace all instances", "aria-label":"Replace colour tool",
          "aria-pressed": cv.activeTool==="colourReplace"?"true":"false"
        }, window.Icons.colourSwap(), " Replace")
      )
    ),
    // ── Cleanup ──
    h("div", {className:"tb-more-panel__section tb-more-panel__section--cleanup"},
      h("button", {
        className:"tb-btn"+(cv.activeTool==="cleanup"?" tb-btn--on":""),
        onClick:function(){
          if (cv.activeTool==="cleanup") { if (cv.exitCleanup) cv.exitCleanup(); }
          else { cv.setBsStart(null); ctx.setPartialStitchTool(null); if (cv.cancelLasso) cv.cancelLasso(); if (cv.enterCleanup) cv.enterCleanup(); }
          setMorePanelOpen(false);
        },
        title:"Cleanup Mode \u2014 remove stray lineart pixels", "aria-label":"Cleanup mode",
        "aria-pressed": cv.activeTool==="cleanup"?"true":"false",
        style:{width:"100%",justifyContent:"flex-start"}
      }, window.Icons&&window.Icons.cleanup?window.Icons.cleanup():null, " Cleanup mode")
    ),
    // ── Stitch type ──
    h("div", {className:"tb-more-panel__section"},
      h("span", {className:"tb-ovf-lbl"}, "Stitch type"),
      h("div", {className:"tb-grp", style:{flexWrap:"wrap",gap:2}},
        stitchTypeOptions.map(function(st) {
          var isOn = cv.stitchType === st.id;
          return h("button", {
            key:st.id,
            className:"tb-btn"+(isOn?" tb-btn--on":""),
            onClick:function(){ cv.selectStitchType(st.id); },
            title:st.label, "aria-label":st.label+" stitch", "aria-pressed":isOn
          }, st.label);
        })
      )
    ),
    // ── Brush size ──
    h("div", {className:"tb-more-panel__section"},
      h("span", {className:"tb-ovf-lbl"}, "Brush size"),
      h("div", {className:"tb-grp"},
        [1,2,3].map(function(sz) {
          var isOn = (cv.brushSize||1) === sz;
          return h("button", {
            key:sz,
            className:"tb-btn"+(isOn?" tb-btn--on":""),
            onClick:function(){ cv.setBrushSize(sz); },
            title:sz+"\xD7"+sz, "aria-label":sz+" by "+sz+" brush"
          }, sz);
        })
      )
    ),
    // ── Overlay (conditional) ──
    (gen.img && gen.img.src) && h("div", {className:"tb-more-panel__section"},
      h("span", {className:"tb-ovf-lbl"}, "Display"),
      h("label", {style:{display:"flex",alignItems:"center",gap:6,padding:"2px 0",cursor:"pointer",fontSize:12}},
        h("input", {
          type:"checkbox", checked:!!cv.showOverlay,
          onChange:function(e){ cv.setShowOverlay(e.target.checked); }
        }), " Overlay"
      ),
      cv.showOverlay && h("input", {
        type:"range", min:0.1, max:0.8, step:0.05, value:cv.overlayOpacity,
        onChange:function(e){ cv.setOverlayOpacity(Number(e.target.value)); },
        style:{width:"100%",marginTop:4}, "aria-label":"Overlay opacity"
      })
    )
  ) : null;

  var morePanelWrap = h("div", {className:"tb-overflow-wrap" + (morePanelOpen ? " tb-overflow-wrap--open" : "")},
    h("button", {
      ref:moreBtnRef,
      className:"tb-btn"+(morePanelOpen||morePanelHasActiveTool?" tb-btn--on":""),
      onClick:function(){ setMorePanelOpen(function(o){ return !o; }); },
      title:"More tools", "aria-label":"More tools",
      "aria-expanded":morePanelOpen?"true":"false", "aria-haspopup":"dialog"
    }, "More ", window.Icons&&window.Icons.chevronDown?window.Icons.chevronDown():null),
    morePanelContent
  );

  // cleanupRow is computed before the create-mode early return above,
  // so it is available here for both modes without duplication.

  return h(React.Fragment, null,
    h("div", {className:"toolbar-row", role:"toolbar", "aria-label":"Edit mode tools"},
      h("div", {className:"pill-row"},
        h("div", {ref:app.stripRef, className:"pill"},
          brushGrp,
          clearSelBtn,
          toolBadge,
          h("div", {className:"tb-sdiv"}),
          zoomGrp,
          undoRedo,
          h("div", {className:"tb-sdiv"}),
          morePanelWrap
        )
      ),
      swatchRow,
      cleanupRow
    )
  );
};
