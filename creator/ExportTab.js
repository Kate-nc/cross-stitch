/* creator/ExportTab.js — Export tab with PNG preview canvas, PDF/save buttons.
   Reads from CreatorContext. Loaded as a plain <script> before the main Babel script.
   Depends on: Section (components.js), drawPatternOnCanvas (canvasRenderer.js),
               exportPDF, exportCoverSheet (exportPdf.js), A4W, A4H (constants.js),
               CreatorContext (context.js) */

window.CreatorExportTab = function CreatorExportTab() {
  var ctx = React.useContext(window.CreatorContext);
  var h = React.createElement;

  var G = ctx.G;

  // renderExport callback — must be declared before any early returns (Rules of Hooks)
  var renderExport = React.useCallback(function() {
    if (ctx.tab !== "export" || !ctx.expRef.current || !ctx.pat || !ctx.cmap) return;
    var epC = ctx.exportPage % ctx.pxX;
    var epR = Math.floor(ctx.exportPage / ctx.pxX);
    var eX0 = epC * A4W, eY0 = epR * A4H;
    var eW = Math.min(A4W, ctx.sW - eX0), eH = Math.min(A4H, ctx.sH - eY0);
    var dW2 = ctx.pageMode ? eW : ctx.sW;
    var dH2 = ctx.pageMode ? eH : ctx.sH;
    var oX2 = ctx.pageMode ? eX0 : 0;
    var oY2 = ctx.pageMode ? eY0 : 0;
    var expCs = Math.max(8, Math.min(20, Math.floor(750 / Math.max(dW2, dH2))));
    ctx.expRef.current.width  = dW2 * expCs + G + 2;
    ctx.expRef.current.height = dH2 * expCs + G + 2;
    // Draw without overlay
    var exportState = Object.assign({}, ctx, {showOverlay: false, overlayOpacity: 0});
    drawPatternOnCanvas(ctx.expRef.current.getContext("2d"), oX2, oY2, dW2, dH2, expCs, G, exportState);
  }, [
    ctx.tab, ctx.pat, ctx.cmap, ctx.sW, ctx.sH, ctx.pageMode, ctx.exportPage, ctx.pxX,
    ctx.view, ctx.hiId, ctx.showCtr, ctx.bsLines, ctx.partialStitches
  ]);

  React.useEffect(function() { renderExport(); }, [renderExport]);

  if (!(ctx.pat && ctx.pal)) return null;
  if (ctx.tab !== "export") return null;

  return h("div", {style:{display:"flex",flexDirection:"column",gap:12}},
    ctx.copied && h("div", {style:{background:"#f0fdf4",border:"1px solid #bbf7d0",borderRadius:8,padding:"8px 14px",fontSize:12,color:"#16a34a",fontWeight:600}}, "Copied!"),

    h("button", {
      onClick: ctx.handleOpenInTracker,
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
            value:ctx.pdfDisplayMode, onChange:function(e){ctx.setPdfDisplayMode(e.target.value);},
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
            value:ctx.pdfCellSize, onChange:function(e){ctx.setPdfCellSize(Number(e.target.value));},
            style:{padding:"4px 8px",borderRadius:6,border:"1px solid #cbd5e1",fontSize:12,background:"#fff"}
          },
            h("option", {value:2.5}, "Small (2.5mm)"),
            h("option", {value:3}, "Medium (3mm)"),
            h("option", {value:4.5}, "Large (4.5mm)")
          )
        ),
        h("label", {style:{fontSize:12,fontWeight:600,color:"#3f3f46",display:"flex",alignItems:"center",gap:6,cursor:"pointer"}},
          h("input", {
            type:"checkbox", checked:ctx.pdfSinglePage,
            onChange:function(e){ctx.setPdfSinglePage(e.target.checked);}
          }),
          " Single Page"
        )
      ),
      h("div", {style:{display:"flex",gap:8,flexWrap:"wrap"}},
        h("button", {
          onClick:function(){
            exportPDF({displayMode:ctx.pdfDisplayMode, cellSize:ctx.pdfCellSize, singlePage:ctx.pdfSinglePage}, ctx);
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
            type:"checkbox", checked:ctx.pageMode,
            onChange:function(e){ctx.setPageMode(e.target.checked); ctx.setExportPage(0);}
          }),
          "A4 pages"
        ),
        ctx.pageMode && h(React.Fragment, null,
          h("button", {
            onClick:function(){ctx.setExportPage(function(p){return Math.max(0,p-1);});},
            disabled:ctx.exportPage===0,
            style:{fontSize:11,padding:"3px 8px",border:"0.5px solid #e2e8f0",borderRadius:6,background:"#fff",cursor:"pointer"}
          }, "\u25C4"),
          h("span", {style:{fontSize:12}}, "Page "+(ctx.exportPage+1)+"/"+ctx.totPg),
          h("button", {
            onClick:function(){ctx.setExportPage(function(p){return Math.min(ctx.totPg-1,p+1);});},
            disabled:ctx.exportPage>=ctx.totPg-1,
            style:{fontSize:11,padding:"3px 8px",border:"0.5px solid #e2e8f0",borderRadius:6,background:"#fff",cursor:"pointer"}
          }, "\u25BA")
        )
      ),
      h("div", {style:{overflow:"auto",maxHeight:400,border:"0.5px solid #e2e8f0",borderRadius:8,background:"#fff"}},
        h("canvas", {ref:ctx.expRef, style:{display:"block"}})
      )
    ),

    h(Section, {title:"Save / Load"},
      h("p", {style:{fontSize:12,color:"#475569",margin:"8px 0 10px"}},
        "Saves pattern for later editing or opening in Stitch Tracker."
      ),
      h("div", {style:{display:"flex",gap:8}},
        h("button", {
          onClick:ctx.saveProject,
          style:{padding:"8px 18px",fontSize:13,borderRadius:8,border:"none",background:"#0d9488",color:"#fff",cursor:"pointer",fontWeight:600}
        }, "Save (.json)"),
        h("button", {
          onClick:function(){ctx.loadRef.current.click();},
          style:{padding:"8px 18px",fontSize:13,borderRadius:8,border:"0.5px solid #e2e8f0",background:"#fff",cursor:"pointer",fontWeight:500}
        }, "Load")
      )
    )
  );
};
