/* creator/exportPng.js — PNG image export for the pattern.
   Exports the pattern as a raster PNG image.

   Two modes:
     "preview" — flat colour blocks (no grid, no symbols). Suitable for
                 social media / listing previews.  Uses the same pixel-art
                 colour data as generatePatternThumbnail but at user-selected
                 resolution.
     "chart"   — colour blocks with grid lines overlaid (grid is drawn when
                 cellPx >= 4).  Useful for sharing a compact chart view.

   Resolution presets:
     instagram  1080 × 1080  (square-cropped, centred)
     etsy       2000 × 2000  (square-cropped, centred)
     print      4000 × 4000  (square-cropped, centred)
     custom     user-specified; not square-forced

   Background options:  "white" | "transparent"
   Transparent background is only meaningful in PNG (the output is always PNG).

   Exposed globals:
     window.PNG_PRESETS   — array of preset descriptors for use in the UI
     window.exportPNG     — main export entry point */

window.PNG_PRESETS = [
  { label: "Instagram (1080\xd71080)", key: "instagram", size: 1080, square: true },
  { label: "Etsy listing (2000\xd72000)", key: "etsy", size: 2000, square: true },
  { label: "Print quality (4000\xd74000)", key: "print", size: 4000, square: true },
  { label: "Custom size", key: "custom", size: null, square: false }
];

/**
 * Export the current pattern as a PNG image and trigger a browser download.
 *
 * @param {object} options
 *   preset      {string}  One of the PNG_PRESETS keys (default "etsy")
 *   customSize  {number}  Pixel dimension used when preset === "custom"
 *   bgMode      {string}  "white" | "transparent" (default "white")
 *   mode        {string}  "preview" | "chart" (default "preview")
 * @param {object} data
 *   pat, cmap, sW, sH, partialStitches, projectName
 */
window.exportPNG = function exportPNG(options, data) {
  options = options || {};
  var preset     = options.preset     || "etsy";
  var customSize = options.customSize || 2000;
  var bgMode     = options.bgMode     || "white";
  var mode       = options.mode       || "preview";

  var pat             = data.pat;
  var sW              = data.sW;
  var sH              = data.sH;
  var partialStitches = data.partialStitches || new Map();
  var name            = data.projectName || data.name || "pattern";

  if (!pat || !sW || !sH) return;

  var presetObj = (window.PNG_PRESETS || []).find(function(p) { return p.key === preset; }) ||
                  { size: 2000, square: true };
  var targetSize = presetObj.size || customSize;
  var isSquare   = presetObj.square;

  // Derive cell pixel size from the target resolution.
  var maxDim  = Math.max(sW, sH);
  var cellPx  = Math.max(1, Math.floor(targetSize / maxDim));

  // Hard cap: never produce an image larger than 8000 × 8000 pixels.
  var rawW = sW * cellPx, rawH = sH * cellPx;
  if (rawW > 8000 || rawH > 8000) {
    var capScale = Math.min(8000 / rawW, 8000 / rawH);
    cellPx = Math.max(1, Math.floor(cellPx * capScale));
    rawW   = sW * cellPx;
    rawH   = sH * cellPx;
  }

  var canvasW = isSquare ? targetSize : rawW;
  var canvasH = isSquare ? targetSize : rawH;
  var offsetX = isSquare ? Math.floor((canvasW - rawW) / 2) : 0;
  var offsetY = isSquare ? Math.floor((canvasH - rawH) / 2) : 0;

  var canvas = document.createElement("canvas");
  canvas.width  = canvasW;
  canvas.height = canvasH;
  var ctx = canvas.getContext("2d");

  // Background fill.
  if (bgMode === "transparent") {
    ctx.clearRect(0, 0, canvasW, canvasH);
  } else {
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, canvasW, canvasH);
  }

  var pqKeys = ["TL", "TR", "BL", "BR"];

  // Draw each stitch cell.
  for (var row = 0; row < sH; row++) {
    for (var col = 0; col < sW; col++) {
      var cellIdx = row * sW + col;
      var px = offsetX + col * cellPx;
      var py = offsetY + row * cellPx;

      var ps = partialStitches && partialStitches.get(cellIdx);
      if (ps) {
        // Partial stitch: blend the occupied quadrant colours.
        var r = 0, g = 0, b = 0, cnt = 0;
        for (var qi = 0; qi < pqKeys.length; qi++) {
          var qe = ps[pqKeys[qi]];
          if (qe) { r += qe.rgb[0]; g += qe.rgb[1]; b += qe.rgb[2]; cnt++; }
        }
        if (cnt > 0) {
          ctx.fillStyle = "rgb(" + Math.round(r / cnt) + "," +
                                   Math.round(g / cnt) + "," +
                                   Math.round(b / cnt) + ")";
          ctx.fillRect(px, py, cellPx, cellPx);
        }
        continue;
      }

      var cell = pat[cellIdx];
      if (!cell || cell.id === "__skip__" || cell.id === "__empty__") continue;

      ctx.fillStyle = "rgb(" + cell.rgb[0] + "," + cell.rgb[1] + "," + cell.rgb[2] + ")";
      ctx.fillRect(px, py, cellPx, cellPx);
    }
  }

  // Chart-mode grid lines (drawn only when cells are large enough to be visible).
  if (mode === "chart" && cellPx >= 4) {
    ctx.save();
    for (var gx = 0; gx <= sW; gx++) {
      var isMajorX = gx % 10 === 0;
      var lx = offsetX + gx * cellPx + 0.5;
      ctx.globalAlpha = isMajorX ? 0.7 : 0.35;
      ctx.strokeStyle = "#808080";
      ctx.lineWidth   = isMajorX ? 1.5 : 0.5;
      ctx.beginPath();
      ctx.moveTo(lx, offsetY);
      ctx.lineTo(lx, offsetY + sH * cellPx);
      ctx.stroke();
    }
    for (var gy = 0; gy <= sH; gy++) {
      var isMajorY = gy % 10 === 0;
      var ly = offsetY + gy * cellPx + 0.5;
      ctx.globalAlpha = isMajorY ? 0.7 : 0.35;
      ctx.lineWidth   = isMajorY ? 1.5 : 0.5;
      ctx.beginPath();
      ctx.moveTo(offsetX, ly);
      ctx.lineTo(offsetX + sW * cellPx, ly);
      ctx.stroke();
    }
    ctx.restore();
  }

  var safeName = (name || "pattern").replace(/[^a-z0-9_\- ]/gi, "_");
  canvas.toBlob(function(blob) {
    if (!blob) return;
    var url = URL.createObjectURL(blob);
    var a = document.createElement("a");
    a.href = url;
    a.download = safeName + ".png";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(function() { URL.revokeObjectURL(url); }, 1000);
  }, "image/png");
};
