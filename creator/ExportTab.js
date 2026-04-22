/* creator/ExportTab.js — Export tab: presets, PDF, PNG, OXS, and Save/Load.
   Reads from PatternDataContext, CanvasContext, and AppContext.
   Depends on: Section (components.js), Icons (icons.js),
               drawPatternOnCanvas (canvasRenderer.js),
               exportPDF, exportCoverSheet (exportPdf.js),
               exportOXS (exportOxs.js),
               exportPNG, PNG_PRESETS (exportPng.js),
               A4W, A4H (constants.js),
               CreatorContext (context.js) */

window.CreatorExportTab = function CreatorExportTab() {
  var ctx = window.usePatternData();
  var cv  = window.useCanvas();
  var app = window.useApp();
  var h   = React.createElement;

  // Local state for PNG options
  var _pngPreset    = React.useState("etsy");
  var pngPreset     = _pngPreset[0], setPngPreset = _pngPreset[1];
  var _pngBg        = React.useState("white");
  var pngBgMode     = _pngBg[0],    setPngBgMode = _pngBg[1];
  var _pngMode      = React.useState("preview");
  var pngMode       = _pngMode[0],  setPngMode   = _pngMode[1];
  var _pngCustom    = React.useState(2000);
  var pngCustomSize = _pngCustom[0], setPngCustomSize = _pngCustom[1];

  var G = app.G;

  // Build the merged export-data object consumed by all export functions.
  function makeExportData() {
    return Object.assign({}, ctx, {
      bsLines:     cv.bsLines || [],
      projectName: app.projectName || ""
    });
  }

  // renderExport callback — must be declared before any early returns (Rules of Hooks)
  var renderExport = React.useCallback(function() {
    if (app.tab !== "export" || !app.expRef.current || !ctx.pat || !ctx.cmap) return;
    var epC = app.exportPage % app.pxX;
    var epR = Math.floor(app.exportPage / app.pxX);
    var eX0 = epC * A4W, eY0 = epR * A4H;
    var eW = Math.min(A4W, ctx.sW - eX0), eH = Math.min(A4H, ctx.sH - eY0);
    var dW2 = app.pageMode ? eW : ctx.sW;
    var dH2 = app.pageMode ? eH : ctx.sH;
    var oX2 = app.pageMode ? eX0 : 0;
    var oY2 = app.pageMode ? eY0 : 0;
    var expCs = Math.max(8, Math.min(20, Math.floor(750 / Math.max(dW2, dH2))));
    app.expRef.current.width  = dW2 * expCs + G + 2;
    app.expRef.current.height = dH2 * expCs + G + 2;
    // Draw without overlay — merge CanvasContext (view, hiId, bsLines, activeTool, etc.) so
    // drawPatternOnCanvas receives all required fields; final object overrides suppress the overlay.
    var exportState = Object.assign({}, ctx, cv, {showOverlay: false, overlayOpacity: 0});
    drawPatternOnCanvas(app.expRef.current.getContext("2d"), oX2, oY2, dW2, dH2, expCs, G, exportState);
  }, [
    app.tab, ctx.pat, ctx.cmap, ctx.sW, ctx.sH, app.pageMode, app.exportPage, app.pxX,
    cv.view, cv.hiId, cv.showCtr, cv.bsLines, ctx.partialStitches
  ]);

  React.useEffect(function() { renderExport(); }, [renderExport]);

  if (!(ctx.pat && ctx.pal)) return null;
  if (app.tab !== "export") return null;

  var patternReady = !!(ctx.pat && ctx.pal && ctx.cmap);

  // ─── Export preset definitions ───────────────────────────────────────────────
  var PRESETS = [
    {
      key: "pk",
      label: "Pattern Keeper",
      icon: "\uD83D\uDCCB",
      description: "Colour + B&W chart pages, medium cells, 2-row overlap",
      action: function() {
        app.setPdfDisplayMode("color_symbol");
        app.setPdfCellSize(3);
        app.setPdfSinglePage(false);
        exportPDF({displayMode:"color_symbol", cellSize:3, singlePage:false}, makeExportData());
      }
    },
    {
      key: "print",
      label: "Home printing",
      icon: "\uD83D\uDDA8\uFE0F",
      description: "Large print, colour + symbols, no overlap",
      action: function() {
        app.setPdfDisplayMode("color_symbol");
        app.setPdfCellSize(4.5);
        app.setPdfSinglePage(false);
        exportPDF({displayMode:"color_symbol", cellSize:4.5, singlePage:false}, makeExportData());
      }
    },
    {
      key: "etsy",
      label: "Etsy preview",
      icon: "\uD83D\uDECD\uFE0F",
      description: "Preview image at 2000\xd72000 PNG for listings",
      action: function() {
        exportPNG({preset:"etsy", bgMode:"white", mode:"preview"}, makeExportData());
      }
    },
    {
      key: "social",
      label: "Social media",
      icon: "\uD83D\uDCF8",
      description: "Preview image at 1080\xd71080 for Instagram / Facebook",
      action: function() {
        exportPNG({preset:"instagram", bgMode:"white", mode:"preview"}, makeExportData());
      }
    },
    {
      key: "oxs",
      label: "Other software",
      icon: "\uD83D\uDDC2\uFE0F",
      description: "OXS file for WinStitch / MacStitch",
      action: function() { exportOXS(makeExportData()); }
    }
  ];

  // ─── Shared styles ────────────────────────────────────────────────────────────
  var sBtn    = {padding:"10px 20px",fontSize:14,borderRadius:8,border:"none",background:"#0d9488",color:"#fff",cursor:"pointer",fontWeight:600};
  var sOutBtn = Object.assign({},sBtn,{background:"#fff",color:"#0d9488",border:"1.5px solid #0d9488"});
  var sSmBtn  = {padding:"3px 8px",fontSize:11,borderRadius:6,border:"0.5px solid #e2e8f0",background:"#fff",cursor:"pointer"};
  var sLabel  = {fontSize:12,fontWeight:600,color:"#3f3f46",display:"flex",alignItems:"center",gap:6};
  var sSel    = {padding:"4px 8px",borderRadius:6,border:"1px solid #cbd5e1",fontSize:12,background:"#fff"};

  return h("div", {style:{display:"flex",flexDirection:"column",gap:12}},

    // ─── Copied feedback ─────────────────────────────────────────────────────
    app.copied && h("div", {style:{background:"#f0fdf4",border:"1px solid #bbf7d0",borderRadius:8,padding:"8px 14px",fontSize:12,color:"#16a34a",fontWeight:600}}, "Copied!"),

    // ─── Open in Tracker ─────────────────────────────────────────────────────
    h("button", {
      onClick:app.handleOpenInTracker,
      style:Object.assign({},sBtn,{padding:"12px 20px",fontSize:15,display:"flex",alignItems:"center",justifyContent:"center",gap:8})
    }, Icons.thread(), " Open in Stitch Tracker \u2192"),

    // ─── Quick Export Presets ─────────────────────────────────────────────────
    h(Section, {title:"Quick Export"},
      h("p", {style:{fontSize:12,color:"#475569",margin:"4px 0 10px"}},
        "One-tap export for common use cases."
      ),
      h("div", {style:{display:"flex",flexWrap:"wrap",gap:8}},
        PRESETS.map(function(preset) {
          return h("button", {
            key:preset.key,
            onClick:patternReady ? preset.action : undefined,
            disabled:!patternReady,
            title:preset.description,
            style:{
              display:"flex",flexDirection:"column",alignItems:"center",gap:4,
              padding:"10px 14px",borderRadius:10,
              border:"1.5px solid #e2e8f0",
              background:patternReady?"#f8fafc":"#f1f5f9",
              cursor:patternReady?"pointer":"not-allowed",
              fontSize:11,fontWeight:600,
              color:patternReady?"#1e293b":"#94a3b8",
              minWidth:80
            }
          },
            h("span",{style:{fontSize:22}}, preset.icon),
            h("span",null, preset.label)
          );
        })
      )
    ),

    // ─── PDF Export ───────────────────────────────────────────────────────────
    h(Section, {title:"PDF Export"},
      h("p", {style:{fontSize:12,color:"#475569",margin:"8px 0 10px"}},
        "Multi-page PDF with legend, cover sheet, and chart pages."
      ),
      h("div", {style:{display:"flex",gap:16,alignItems:"center",flexWrap:"wrap",marginBottom:10}},
        h("label", {style:sLabel},
          "Chart mode:",
          h("select", {
            value:app.pdfDisplayMode, onChange:function(e){app.setPdfDisplayMode(e.target.value);},
            style:sSel
          },
            h("option", {value:"color_symbol"}, "Colour + Symbols"),
            h("option", {value:"symbol"}, "Symbols only (B&W)"),
            h("option", {value:"color"}, "Colour blocks only")
          )
        ),
        h("label", {style:sLabel},
          "Cell size:",
          h("select", {
            value:app.pdfCellSize, onChange:function(e){app.setPdfCellSize(Number(e.target.value));},
            style:sSel
          },
            h("option", {value:2.5}, "Small (2.5 mm)"),
            h("option", {value:3}, "Medium (3 mm)"),
            h("option", {value:4.5}, "Large (4.5 mm)")
          )
        ),
        h("label", {style:Object.assign({},sLabel,{cursor:"pointer"})},
          h("input", {
            type:"checkbox", checked:app.pdfSinglePage,
            onChange:function(e){app.setPdfSinglePage(e.target.checked);}
          }),
          " Single page"
        )
      ),
      h("div", {style:{display:"flex",gap:8,flexWrap:"wrap"}},
        h("button", {
          onClick:function(){
            exportPDF({displayMode:app.pdfDisplayMode, cellSize:app.pdfCellSize, singlePage:app.pdfSinglePage}, makeExportData());
          },
          style:sBtn
        }, "Download Pattern PDF"),
        h("button", {
          onClick:function(){ exportCoverSheet(makeExportData()); },
          style:sOutBtn
        }, "Cover Sheet PDF")
      ),
      h("p", {style:{fontSize:11,color:"#94a3b8",marginTop:8}},
        "The cover sheet includes pattern summary, thread list with owned/to-buy status, and space for notes \u2014 perfect for tucking into your project bag."
      )
    ),

    // ─── PNG Image Export ─────────────────────────────────────────────────────
    h(Section, {title:"PNG Image Export"},
      h("p", {style:{fontSize:12,color:"#475569",margin:"8px 0 10px"}},
        "Export the pattern as a raster PNG image. Ideal for social media, Etsy listings, or blog posts."
      ),
      h("div", {style:{display:"flex",gap:16,alignItems:"center",flexWrap:"wrap",marginBottom:10}},
        h("label", {style:sLabel},
          "Resolution:",
          h("select", {
            value:pngPreset, onChange:function(e){setPngPreset(e.target.value);},
            style:sSel
          },
            (window.PNG_PRESETS||[]).map(function(p){
              return h("option",{key:p.key,value:p.key}, p.label);
            })
          )
        ),
        pngPreset==="custom" && h("label", {style:sLabel},
          "Size (px):",
          h("input", {
            type:"number", value:pngCustomSize, min:100, max:8000, step:100,
            onChange:function(e){setPngCustomSize(Number(e.target.value)||2000);},
            style:Object.assign({},sSel,{width:80})
          })
        ),
        h("label", {style:sLabel},
          "Background:",
          h("select", {
            value:pngBgMode, onChange:function(e){setPngBgMode(e.target.value);},
            style:sSel
          },
            h("option",{value:"white"}, "White"),
            h("option",{value:"transparent"}, "Transparent")
          )
        ),
        h("label", {style:sLabel},
          "Style:",
          h("select", {
            value:pngMode, onChange:function(e){setPngMode(e.target.value);},
            style:sSel
          },
            h("option",{value:"preview"}, "Colour preview"),
            h("option",{value:"chart"}, "Colour + grid lines")
          )
        )
      ),
      h("button", {
        onClick:function(){
          exportPNG({preset:pngPreset, customSize:pngCustomSize, bgMode:pngBgMode, mode:pngMode}, makeExportData());
        },
        style:sBtn
      }, "Download PNG")
    ),

    // ─── OXS Export ───────────────────────────────────────────────────────────
    h(Section, {title:"OXS Export"},
      h("p", {style:{fontSize:12,color:"#475569",margin:"8px 0 10px"}},
        "Export as OXS (Open Cross Stitch XML). Compatible with WinStitch, MacStitch, and other software that supports this open format."
      ),
      h("button", {
        onClick:function(){ exportOXS(makeExportData()); },
        style:sOutBtn
      }, "Download .oxs"),
      h("p", {style:{fontSize:11,color:"#94a3b8",marginTop:8}},
        "Blend stitches are exported using their primary thread colour (OXS does not natively support blended threads). Re-import to verify round-trip fidelity."
      )
    ),

    // ─── Chart Preview canvas ────────────────────────────────────────────────
    h(Section, {title:"Chart Preview"},
      h("div", {style:{display:"flex",gap:8,alignItems:"center",marginTop:8,marginBottom:8}},
        h("label", {style:{display:"flex",alignItems:"center",gap:4,fontSize:12,cursor:"pointer"}},
          h("input", {
            type:"checkbox", checked:app.pageMode,
            onChange:function(e){app.setPageMode(e.target.checked); app.setExportPage(0);}
          }),
          "A4 pages"
        ),
        app.pageMode && h(React.Fragment, null,
          h("button", {
            onClick:function(){app.setExportPage(function(p){return Math.max(0,p-1);});},
            disabled:app.exportPage===0,
            style:sSmBtn
          }, "\u25C4"),
          h("span", {style:{fontSize:12}}, "Page "+(app.exportPage+1)+"/"+app.totPg),
          h("button", {
            onClick:function(){app.setExportPage(function(p){return Math.min(app.totPg-1,p+1);});},
            disabled:app.exportPage>=app.totPg-1,
            style:sSmBtn
          }, "\u25BA")
        )
      ),
      h("div", {style:{overflow:"auto",maxHeight:400,border:"0.5px solid #e2e8f0",borderRadius:8,background:"#fff"}},
        h("canvas", {ref:app.expRef, style:{display:"block"}})
      )
    ),

    // ─── Save / Load ─────────────────────────────────────────────────────────
    h(Section, {title:"Save / Load"},
      h("p", {style:{fontSize:12,color:"#475569",margin:"8px 0 10px"}},
        "Saves pattern for later editing or opening in Stitch Tracker."
      ),
      h("div", {style:{display:"flex",gap:8}},
        h("button", {
          onClick:app.saveProject,
          style:sBtn
        }, "Save (.json)"),
        h("button", {
          onClick:function(){app.loadRef.current.click();},
          style:{padding:"8px 18px",fontSize:13,borderRadius:8,border:"0.5px solid #e2e8f0",background:"#fff",cursor:"pointer",fontWeight:500}
        }, "Load")
      )
    )
  );
};
