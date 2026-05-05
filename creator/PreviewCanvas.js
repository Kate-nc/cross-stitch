/* creator/PreviewCanvas.js — WYSIWYG pixel-accurate preview mode.
   Reads from CreatorContext. Loaded as part of creator/bundle.js.
   Depends on: context.js (CreatorContext) */

window.CreatorPreviewCanvas = function CreatorPreviewCanvas() {
  var ctx = window.usePatternData();
  var cv = window.useCanvas();
  var app = window.useApp();
  var h = React.createElement;

  var displayRef = React.useRef(null);
  var offscreenRef = React.useRef(null);

  // Version counter: Effect A increments this after updating offscreenRef so Effect B re-runs.
  var _offV = React.useState(0); var offscreenVersion = _offV[0], setOffscreenVersion = _offV[1];

  var pat = ctx.pat;
  var cmap = ctx.cmap;
  var pal = ctx.pal;
  var sW = ctx.sW;
  var sH = ctx.sH;
  var cs = cv.cs;
  var previewShowGrid = app.previewShowGrid;
  var fabricColour = app.fabricColour;

  // Effect A — build the offscreen 1-px-per-stitch image cache.
  // Re-runs only when pattern data or fabric colour changes.
  React.useEffect(function() {
    if (!pat || !sW || !sH) return;

    var offscreen = document.createElement("canvas");
    offscreen.width = sW;
    offscreen.height = sH;
    var octx = offscreen.getContext("2d");
    if (!octx) {
      offscreenRef.current = null;
      setOffscreenVersion(function(v) { return v + 1; });
      return;
    }
    var imgData = octx.createImageData(sW, sH);
    var d = imgData.data;

    // Resolve the fabric background colour from the user preference (#RRGGBB).
    // Falls back to white if the value is absent or malformed.
    var _fabMatch = /^#([0-9a-fA-F]{2})([0-9a-fA-F]{2})([0-9a-fA-F]{2})$/.exec(fabricColour || "");
    var FABRIC_R = _fabMatch ? parseInt(_fabMatch[1], 16) : 255;
    var FABRIC_G = _fabMatch ? parseInt(_fabMatch[2], 16) : 255;
    var FABRIC_B = _fabMatch ? parseInt(_fabMatch[3], 16) : 255;

    for (var i = 0; i < pat.length; i++) {
      var cell = pat[i];
      var px = i * 4;

      if (!cell || cell.id === "__skip__" || cell.id === "__empty__") {
        d[px]     = FABRIC_R;
        d[px + 1] = FABRIC_G;
        d[px + 2] = FABRIC_B;
        d[px + 3] = 255;
        continue;
      }

      // Each pat cell has rgb embedded directly — use it as primary source.
      // Fall back to cmap lookup for edge cases where rgb may be absent.
      var rgb = cell.rgb;
      if (!rgb && cmap) {
        var lookupId = cell.id;
        if (isBlendId(lookupId)) lookupId = splitBlendId(lookupId)[0];
        var entry = cmap[lookupId];
        if (entry) rgb = entry.rgb;
      }

      if (rgb) {
        d[px]     = rgb[0];
        d[px + 1] = rgb[1];
        d[px + 2] = rgb[2];
        d[px + 3] = 255;
      } else {
        d[px]     = 255;
        d[px + 1] = 255;
        d[px + 2] = 255;
        d[px + 3] = 255;
      }
    }

    octx.putImageData(imgData, 0, 0);
    offscreenRef.current = offscreen;
    // Increment version so Effect B knows to re-draw
    setOffscreenVersion(function(v) { return v + 1; });
  }, [pat, cmap, sW, sH, fabricColour]);

  // Effect B — draw the offscreen image onto the display canvas at the current zoom level,
  // then overlay the grid if enabled.
  // offscreenVersion is the reactive signal that Effect A has finished.
  React.useEffect(function() {
    if (!offscreenRef.current || !displayRef.current || !sW || !sH) return;

    var canvas = displayRef.current;
    canvas.width  = sW * cs;
    canvas.height = sH * cs;

    var ctx2d = canvas.getContext("2d");
    if (!ctx2d) return;
    ctx2d.imageSmoothingEnabled = false;

    // Draw the upscaled pixel image (nearest-neighbour via pixelated CSS + disabled smoothing)
    ctx2d.drawImage(offscreenRef.current, 0, 0, sW * cs, sH * cs);

    // Grid overlay — drawn at display resolution so lines are always exactly 1px
    if (previewShowGrid && cs >= 2) {
      var darkMode = window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches;
      var minorColor = darkMode ? "rgba(255,255,255,0.10)" : "rgba(0,0,0,0.12)";
      var majorColor = darkMode ? "rgba(255,255,255,0.22)" : "rgba(0,0,0,0.25)";

      ctx2d.lineWidth = 1;

      // Batch minor lines into one path, major into another
      ctx2d.strokeStyle = minorColor;
      ctx2d.beginPath();
      for (var x = 0; x <= sW; x++) {
        if (x % 10 === 0) continue;
        var px = Math.round(x * cs) + 0.5;
        ctx2d.moveTo(px, 0); ctx2d.lineTo(px, sH * cs);
      }
      for (var y = 0; y <= sH; y++) {
        if (y % 10 === 0) continue;
        var py = Math.round(y * cs) + 0.5;
        ctx2d.moveTo(0, py); ctx2d.lineTo(sW * cs, py);
      }
      ctx2d.stroke();

      ctx2d.strokeStyle = majorColor;
      ctx2d.beginPath();
      for (var x2 = 0; x2 <= sW; x2 += 10) {
        var px2 = Math.round(x2 * cs) + 0.5;
        ctx2d.moveTo(px2, 0); ctx2d.lineTo(px2, sH * cs);
      }
      for (var y2 = 0; y2 <= sH; y2 += 10) {
        var py2 = Math.round(y2 * cs) + 0.5;
        ctx2d.moveTo(0, py2); ctx2d.lineTo(sW * cs, py2);
      }
      ctx2d.stroke();
    }
  }, [offscreenVersion, cs, sW, sH, previewShowGrid]);

  // Count unique stitched colours for status bar
  var colCount = 0;
  if (pal) {
    for (var pi = 0; pi < pal.length; pi++) {
      var pe = pal[pi];
      if (pe && pe.id && pe.id !== "__skip__" && pe.id !== "__empty__" && pe.count > 0) colCount++;
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
