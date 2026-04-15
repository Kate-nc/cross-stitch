/* creator/ExportTab.js — Export tab with PNG preview canvas, PDF/save buttons.
   Reads from CreatorContext. Loaded as a plain <script> before the main Babel script.
   Depends on: Section (components.js), drawPatternOnCanvas (canvasRenderer.js),
               exportPDF, exportCoverSheet (exportPdf.js), A4W, A4H (constants.js),
               CreatorContext (context.js) */

window.CreatorExportTab = function CreatorExportTab() {
  var ctx = React.useContext(window.CreatorContext);
  var cv = window.useCanvas();
  var app = window.useApp();
  var h = React.createElement;

  var G = app.G;

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
    // Draw without overlay
    var exportState = Object.assign({}, ctx, {showOverlay: false, overlayOpacity: 0});
    drawPatternOnCanvas(app.expRef.current.getContext("2d"), oX2, oY2, dW2, dH2, expCs, G, exportState);
  }, [
    app.tab, ctx.pat, ctx.cmap, ctx.sW, ctx.sH, app.pageMode, app.exportPage, app.pxX,
    cv.view, cv.hiId, cv.showCtr, cv.bsLines, ctx.partialStitches
  ]);

  React.useEffect(function() { renderExport(); }, [renderExport]);

  if (!(ctx.pat && ctx.pal)) return null;
  if (app.tab !== "export") return null;

  return h("div", {style:{display:"flex",flexDirection:"column",gap:12}},
    app.copied && h("div", {style:{background:"#f0fdf4",border:"1px solid #bbf7d0",borderRadius:8,padding:"8px 14px",fontSize:12,color:"#16a34a",fontWeight:600}}, "Copied!"),

    h("button", {
      onClick: app.handleOpenInTracker,
      style:{padding:"12px 20px",fontSize:15,borderRadius:8,border:"none",background:"#0d9488",color:"#fff",cursor:"pointer",fontWeight:600,boxShadow:"none",display:"flex",alignItems:"center",justifyContent:"center",gap:8}
    }, Icons.thread(), " Open in Stitch Tracker \u2192"),

    h(Section, {title:"PDF Export"},
      h("p", {style:{fontSize:12,color:"#475569",margin:"8px 0 10px"}},
        "Multi-page PDF with legend and chart."
      ),
      h("div", {style:{display:"flex",gap:16,alignItems:"center",marginBottom:10}},
        h("label", {style:{fontSize:12,fontWeight:600,color:"#3f3f46",display:"flex",alignItems:"center",gap:6}},
          "Chart Mode:",
          h("select", {
            value:app.pdfDisplayMode, onChange:function(e){app.setPdfDisplayMode(e.target.value);},
            style:{padding:"4px 8px",borderRadius:6,border:"1px solid #cbd5e1",fontSize:12,background:"#fff"}
          },
            h("option", {value:"color_symbol"}, "Color + Symbols"),
            h("option", {value:"symbol"}, "Symbols Only"),
            h("option", {value:"color"}, "Color Blocks Only")
          )
        ),
        h("label", {style:{fontSize:12,fontWeight:600,color:"#3f3f46",display:"flex",alignItems:"center",gap:6}},
          "Cell Size:",
          h("select", {
            value:app.pdfCellSize, onChange:function(e){app.setPdfCellSize(Number(e.target.value));},
            style:{padding:"4px 8px",borderRadius:6,border:"1px solid #cbd5e1",fontSize:12,background:"#fff"}
          },
            h("option", {value:2.5}, "Small (2.5mm)"),
            h("option", {value:3}, "Medium (3mm)"),
            h("option", {value:4.5}, "Large (4.5mm)")
          )
        ),
        h("label", {style:{fontSize:12,fontWeight:600,color:"#3f3f46",display:"flex",alignItems:"center",gap:6,cursor:"pointer"}},
          h("input", {
            type:"checkbox", checked:app.pdfSinglePage,
            onChange:function(e){app.setPdfSinglePage(e.target.checked);}
          }),
          " Single Page"
        )
      ),
      h("div", {style:{display:"flex",gap:8,flexWrap:"wrap"}},
        h("button", {
          onClick:function(){
            exportPDF({displayMode:app.pdfDisplayMode, cellSize:app.pdfCellSize, singlePage:app.pdfSinglePage}, ctx);
          },
          style:{padding:"10px 20px",fontSize:14,borderRadius:8,border:"none",background:"#0d9488",color:"#fff",cursor:"pointer",fontWeight:600,boxShadow:"none"}
        }, "Download Pattern PDF"),
        h("button", {
          onClick:function(){ exportCoverSheet(ctx); },
          style:{padding:"10px 20px",fontSize:14,borderRadius:8,border:"1.5px solid #0d9488",background:"#fff",color:"#0d9488",cursor:"pointer",fontWeight:600}
        }, "Cover Sheet PDF")
      ),
      h("p", {style:{fontSize:11,color:"#94a3b8",marginTop:8}},
        "The cover sheet includes pattern summary, thread list with owned/to-buy status, and space for notes \u2014 perfect for tucking into your project bag."
      )
    ),

    h(Section, {title:"PNG Chart"},
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
            style:{fontSize:11,padding:"3px 8px",border:"0.5px solid #e2e8f0",borderRadius:6,background:"#fff",cursor:"pointer"}
          }, "\u25C4"),
          h("span", {style:{fontSize:12}}, "Page "+(app.exportPage+1)+"/"+app.totPg),
          h("button", {
            onClick:function(){app.setExportPage(function(p){return Math.min(app.totPg-1,p+1);});},
            disabled:app.exportPage>=app.totPg-1,
            style:{fontSize:11,padding:"3px 8px",border:"0.5px solid #e2e8f0",borderRadius:6,background:"#fff",cursor:"pointer"}
          }, "\u25BA")
        )
      ),
      h("div", {style:{overflow:"auto",maxHeight:400,border:"0.5px solid #e2e8f0",borderRadius:8,background:"#fff"}},
        h("canvas", {ref:app.expRef, style:{display:"block"}})
      )
    ),

    h(Section, {title:"Save / Load"},
      h("p", {style:{fontSize:12,color:"#475569",margin:"8px 0 10px"}},
        "Saves pattern for later editing or opening in Stitch Tracker."
      ),
      h("div", {style:{display:"flex",gap:8}},
        h("button", {
          onClick:app.saveProject,
          style:{padding:"8px 18px",fontSize:13,borderRadius:8,border:"none",background:"#0d9488",color:"#fff",cursor:"pointer",fontWeight:600}
        }, "Save (.json)"),
        h("button", {
          onClick:function(){app.loadRef.current.click();},
          style:{padding:"8px 18px",fontSize:13,borderRadius:8,border:"0.5px solid #e2e8f0",background:"#fff",cursor:"pointer",fontWeight:500}
        }, "Load")
      )
    )
  );
};
