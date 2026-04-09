/* creator/PatternCanvas.js — The interactive pattern canvas component.
   Reads from CreatorContext. Loaded as a plain <script> before the main Babel script.
   Depends on: drawPatternOnCanvas (canvasRenderer.js), CreatorContext (context.js) */

window.PatternCanvas = function PatternCanvas() {
  var ctx = React.useContext(window.CreatorContext);
  var h = React.createElement;
  var G = ctx.G;

  var renderPattern = React.useCallback(function() {
    if (!ctx.pat || !ctx.cmap || !ctx.pcRef.current || ctx.tab !== "pattern") return;
    ctx.pcRef.current.width  = ctx.sW * ctx.cs + G + 2;
    ctx.pcRef.current.height = ctx.sH * ctx.cs + G + 2;
    drawPatternOnCanvas(ctx.pcRef.current.getContext("2d"), 0, 0, ctx.sW, ctx.sH, ctx.cs, G, ctx);
  }, [
    ctx.pat, ctx.cmap, ctx.cs, ctx.sW, ctx.sH, ctx.view, ctx.hiId, ctx.showCtr,
    ctx.bsLines, ctx.bsStart, ctx.activeTool, ctx.tab, ctx.hoverCoords,
    ctx.selectedColorId, ctx.bsContinuous, ctx.showOverlay, ctx.overlayOpacity,
    ctx.img, ctx.halfStitches, ctx.brushSize, ctx.stitchType, ctx.halfStitchTool
  ]);

  React.useEffect(function() { renderPattern(); }, [renderPattern]);

  return h("canvas", {
    ref: ctx.pcRef,
    style: { display: "block" },
    onMouseDown:  ctx.handlePatMouseDown,
    onMouseUp:    ctx.handlePatMouseUp,
    onMouseMove:  ctx.handlePatMouseMove,
    onMouseLeave: ctx.handlePatMouseLeave,
    onContextMenu: function(e) {
      if (ctx.activeTool === "backstitch" && ctx.bsStart) {
        e.preventDefault();
        ctx.setBsStart(null);
      }
    }
  });
};
