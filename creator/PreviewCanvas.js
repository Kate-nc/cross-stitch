/* creator/PreviewCanvas.js — WYSIWYG pixel-accurate preview mode.
   Reads from CreatorContext. Loaded as part of creator/bundle.js.
   Depends on: context.js (CreatorContext) */

window.CreatorPreviewCanvas = function CreatorPreviewCanvas() {
  var ctx = React.useContext(window.CreatorContext);
  var h = React.createElement;

  var displayRef = React.useRef(null);
  var offscreenRef = React.useRef(null);

  var pat = ctx.pat;
  var cmap = ctx.cmap;
  var pal = ctx.pal;
  var sW = ctx.sW;
  var sH = ctx.sH;
  var cs = ctx.cs;
  var previewShowGrid = ctx.previewShowGrid;
  var previewFabricBg = ctx.previewFabricBg;

  // Effect A — build the offscreen 1-px-per-stitch image cache.
  // Re-runs only when pattern data or fabric-bg toggle changes.
  React.useEffect(function() {
    if (!pat || !cmap || !sW || !sH) return;

    var offscreen = document.createElement("canvas");
    offscreen.width = sW;
    offscreen.height = sH;
    var octx = offscreen.getContext("2d");
    var imgData = octx.createImageData(sW, sH);
    var d = imgData.data;

    var FABRIC_R = 245, FABRIC_G = 240, FABRIC_B = 230;
    var WHITE_R  = 255, WHITE_G  = 255, WHITE_B  = 255;

    for (var i = 0; i < pat.length; i++) {
      var cell = pat[i];
      var px = i * 4;

      if (!cell || cell.id === "__skip__" || cell.id === "__empty__") {
        if (previewFabricBg) {
          d[px]     = FABRIC_R;
          d[px + 1] = FABRIC_G;
          d[px + 2] = FABRIC_B;
          d[px + 3] = 255;
        } else {
          d[px]     = WHITE_R;
          d[px + 1] = WHITE_G;
          d[px + 2] = WHITE_B;
          d[px + 3] = 255;
        }
        continue;
      }

      // Blend cells: id is "310+550" — use first colour as fallback
      var lookupId = cell.id;
      if (lookupId.indexOf("+") !== -1) {
        lookupId = lookupId.split("+")[0];
      }

      var entry = cmap[lookupId];
      if (entry && entry.rgb) {
        d[px]     = entry.rgb[0];
        d[px + 1] = entry.rgb[1];
        d[px + 2] = entry.rgb[2];
        d[px + 3] = 255;
      } else {
        // Unknown colour — render white
        d[px]     = WHITE_R;
        d[px + 1] = WHITE_G;
        d[px + 2] = WHITE_B;
        d[px + 3] = 255;
      }
    }

    octx.putImageData(imgData, 0, 0);
    offscreenRef.current = offscreen;
  }, [pat, cmap, sW, sH, previewFabricBg]);

  // Effect B — draw the offscreen image onto the display canvas at the current zoom level,
  // then overlay the grid if enabled. Runs when zoom (cs) or grid toggle changes.
  React.useEffect(function() {
    if (!offscreenRef.current || !displayRef.current || !sW || !sH) return;

    var canvas = displayRef.current;
    canvas.width  = sW * cs;
    canvas.height = sH * cs;

    var ctx2d = canvas.getContext("2d");
    ctx2d.imageSmoothingEnabled = false;

    // Draw the upscaled pixel image
    ctx2d.drawImage(offscreenRef.current, 0, 0, sW * cs, sH * cs);

    // Grid overlay — drawn at display resolution so lines are always exactly 1px
    if (previewShowGrid && cs >= 2) {
      var darkMode = window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches;
      var minorColor = darkMode ? "rgba(255,255,255,0.10)" : "rgba(0,0,0,0.12)";
      var majorColor = darkMode ? "rgba(255,255,255,0.22)" : "rgba(0,0,0,0.25)";

      ctx2d.lineWidth = 1;

      // Vertical lines
      for (var x = 0; x <= sW; x++) {
        var px = Math.round(x * cs) + 0.5;
        var isMajor = (x % 10 === 0);
        ctx2d.strokeStyle = isMajor ? majorColor : minorColor;
        ctx2d.beginPath();
        ctx2d.moveTo(px, 0);
        ctx2d.lineTo(px, sH * cs);
        ctx2d.stroke();
      }

      // Horizontal lines
      for (var y = 0; y <= sH; y++) {
        var py = Math.round(y * cs) + 0.5;
        var isMajorH = (y % 10 === 0);
        ctx2d.strokeStyle = isMajorH ? majorColor : minorColor;
        ctx2d.beginPath();
        ctx2d.moveTo(0, py);
        ctx2d.lineTo(sW * cs, py);
        ctx2d.stroke();
      }
    }
  }, [offscreenRef.current, cs, sW, sH, previewShowGrid]);

  // Count unique stitched colours for status bar
  var colCount = 0;
  if (pal) {
    for (var pi = 0; pi < pal.length; pi++) {
      var pe = pal[pi];
      if (pe && pe.id && pe.id !== "__skip__" && pe.id !== "__empty__" && pe.count > 0) {
        colCount++;
      }
    }
  }

  return h("div", {className: "preview-wrap"},
    h("canvas", {
      ref: displayRef,
      className: "preview-canvas"
    }),
    h("div", {className: "preview-status-bar"},
      sW + " \xD7 " + sH + " stitches \xB7 " + colCount + " colour" + (colCount !== 1 ? "s" : "")
    )
  );
};
