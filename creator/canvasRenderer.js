/* creator/canvasRenderer.js — Pure drawPattern function.
   Extracted from CreatorApp so PatternCanvas and export canvas can share it.
   Uses globals: drawCk, drawHalfTriangle, drawHalfLine, drawHalfSymbol, luminance
   (defined in helpers.js / colour-utils.js). */

/**
 * Draw the cross-stitch pattern onto a 2D canvas context.
 *
 * @param {CanvasRenderingContext2D} ctx2d
 * @param {number} offX  - First visible column index
 * @param {number} offY  - First visible row index
 * @param {number} dW    - Number of visible columns
 * @param {number} dH    - Number of visible rows
 * @param {number} cSz   - Cell size in pixels
 * @param {number} gut   - Gutter size (space for axis labels)
 * @param {object} state - Snapshot of renderer state (from CreatorContext or similar)
 */
window.drawPatternOnCanvas = function drawPatternOnCanvas(ctx2d, offX, offY, dW, dH, cSz, gut, state) {
  var pat         = state.pat;
  var cmap        = state.cmap;
  var sW          = state.sW;
  var sH          = state.sH;
  var view        = state.view;
  var hiId        = state.hiId;
  var showCtr     = state.showCtr;
  var bsLines     = state.bsLines;
  var bsStart     = state.bsStart;
  var activeTool  = state.activeTool;
  var hoverCoords = state.hoverCoords;
  var selectedColorId = state.selectedColorId;
  var brushSize   = state.brushSize;
  var stitchType  = state.stitchType;
  var halfStitchTool = state.halfStitchTool;
  var img         = state.img;
  var halfStitches = state.halfStitches;
  var showOverlayImg = state.showOverlay && !!img && !!img.src;
  var op          = state.overlayOpacity !== undefined ? state.overlayOpacity : 0.3;

  ctx2d.fillStyle = "#fff";
  ctx2d.fillRect(0, 0, gut + dW * cSz + 2, gut + dH * cSz + 2);

  if (showOverlayImg && img) {
    ctx2d.globalAlpha = op;
    ctx2d.drawImage(img, gut, gut, dW * cSz, dH * cSz);
    ctx2d.globalAlpha = 1.0;
  }

  ctx2d.fillStyle = "#a1a1aa";
  ctx2d.font = Math.max(7, Math.min(11, cSz * 0.5)) + "px system-ui";
  ctx2d.textAlign = "center";
  ctx2d.textBaseline = "middle";
  for (var x = 0; x < dW; x += 10) {
    ctx2d.fillText(String(offX + x + 1), gut + x * cSz + cSz / 2, gut / 2);
  }
  ctx2d.textAlign = "right";
  for (var y = 0; y < dH; y += 10) {
    ctx2d.fillText(String(offY + y + 1), gut - 3, gut + y * cSz + cSz / 2);
  }

  for (var y2 = 0; y2 < dH; y2++) {
    for (var x2 = 0; x2 < dW; x2++) {
      var idx = (offY + y2) * sW + (offX + x2);
      var m = pat[idx];
      if (!m) continue;
      var info = m.id === "__skip__" ? null : (cmap ? cmap[m.id] : null);
      var px = gut + x2 * cSz;
      var py = gut + y2 * cSz;
      var isHi = !hiId || m.id === hiId;
      var dim = hiId && !isHi && m.id !== "__skip__" && m.id !== "__empty__";

      if (m.id === "__skip__" || m.id === "__empty__") {
        if (showOverlayImg) {
          ctx2d.globalAlpha = 0.2;
          drawCk(ctx2d, px, py, cSz);
          ctx2d.globalAlpha = 1.0;
        } else {
          drawCk(ctx2d, px, py, cSz);
        }
      } else if (view === "color" || view === "both") {
        var alpha = 1.0;
        if (dim) alpha = 0.15;
        else if (showOverlayImg) alpha = view === "both" ? 0.4 : 0.5;
        ctx2d.fillStyle = "rgba(" + m.rgb[0] + "," + m.rgb[1] + "," + m.rgb[2] + "," + alpha + ")";
        ctx2d.fillRect(px, py, cSz, cSz);
      } else {
        var alpha2 = showOverlayImg ? 0.3 : 1.0;
        ctx2d.fillStyle = dim ? ("rgba(245,245,245," + alpha2 + ")") : ("rgba(255,255,255," + alpha2 + ")");
        ctx2d.fillRect(px, py, cSz, cSz);
      }

      if (m.id !== "__skip__" && (view === "symbol" || view === "both") && info && cSz >= 6) {
        var lum = luminance(m.rgb);
        ctx2d.fillStyle = dim ? "rgba(0,0,0,0.08)" : (view === "both" ? (lum > 128 ? "#000" : "#fff") : "#333");
        ctx2d.font = "bold " + Math.max(6, cSz * 0.6) + "px monospace";
        ctx2d.textAlign = "center";
        ctx2d.textBaseline = "middle";
        ctx2d.fillText(info.symbol, px + cSz / 2, py + cSz / 2);
      }

      if (cSz >= 4) {
        var sAlpha = dim ? 0.03 : 0.08;
        if (showOverlayImg) sAlpha = dim ? 0.01 : 0.04;
        ctx2d.strokeStyle = "rgba(0,0,0," + sAlpha + ")";
        ctx2d.strokeRect(px, py, cSz, cSz);
      }

      var hsEntry = halfStitches.get(idx);
      if (hsEntry) {
        ["fwd", "bck"].forEach(function(dir) {
          var hs = hsEntry[dir];
          if (!hs) return;
          var alpha3 = dim ? 0.15 : 1.0;
          drawHalfTriangle(ctx2d, px, py, cSz, dir, hs.rgb, alpha3);
          if (cSz >= 5) drawHalfLine(ctx2d, px, py, cSz, dir, hs.rgb, alpha3, Math.max(1, cSz * 0.12));
          if (cSz >= 10 && (view === "symbol" || view === "both")) {
            var hsInfo = cmap ? cmap[hs.id] : null;
            var sym = hsInfo ? hsInfo.symbol : null;
            if (sym) drawHalfSymbol(ctx2d, px, py, cSz, dir, sym, view === "both" ? (luminance(hs.rgb) < 128 ? "#fff" : "#000") : "#333");
          }
        });
      }
    }
  }

  // Grid lines (every 10)
  if (cSz >= 3) {
    ctx2d.strokeStyle = "rgba(0,0,0,0.2)";
    ctx2d.lineWidth = cSz >= 8 ? 1.5 : 1;
    for (var gx = 0; gx <= dW; gx += 10) {
      ctx2d.beginPath(); ctx2d.moveTo(gut + gx * cSz, gut); ctx2d.lineTo(gut + gx * cSz, gut + dH * cSz); ctx2d.stroke();
    }
    for (var gy = 0; gy <= dH; gy += 10) {
      ctx2d.beginPath(); ctx2d.moveTo(gut, gut + gy * cSz); ctx2d.lineTo(gut + dW * cSz, gut + gy * cSz); ctx2d.stroke();
    }
  }

  // Centre crosshair
  if (showCtr) {
    ctx2d.strokeStyle = "rgba(200,60,60,0.3)";
    ctx2d.lineWidth = 1.5;
    ctx2d.setLineDash([6, 4]);
    var cx2 = Math.floor(sW / 2) - offX;
    var cy2 = Math.floor(sH / 2) - offY;
    if (cx2 >= 0 && cx2 <= dW) {
      ctx2d.beginPath(); ctx2d.moveTo(gut + cx2 * cSz, gut); ctx2d.lineTo(gut + cx2 * cSz, gut + dH * cSz); ctx2d.stroke();
    }
    if (cy2 >= 0 && cy2 <= dH) {
      ctx2d.beginPath(); ctx2d.moveTo(gut, gut + cy2 * cSz); ctx2d.lineTo(gut + dW * cSz, gut + cy2 * cSz); ctx2d.stroke();
    }
    ctx2d.setLineDash([]);
  }

  // Hover crosshair + brush highlight
  if (hoverCoords && hoverCoords.gx >= offX && hoverCoords.gy >= offY && hoverCoords.gx < offX + dW && hoverCoords.gy < offY + dH) {
    var hx = hoverCoords.gx - offX;
    var hy = hoverCoords.gy - offY;
    var isDrawingTool = activeTool === "paint" || activeTool === "fill" || stitchType === "erase" || (halfStitchTool && halfStitchTool !== "erase");
    var actualBrushSize = isDrawingTool ? Math.min(brushSize, Math.min(dW - hx, dH - hy)) : 1;
    if (actualBrushSize < 1) actualBrushSize = 1;
    ctx2d.fillStyle = "rgba(0,0,0,0.03)";
    ctx2d.fillRect(gut + hx * cSz, gut, cSz * actualBrushSize, dH * cSz);
    ctx2d.fillRect(gut, gut + hy * cSz, dW * cSz, cSz * actualBrushSize);
  }

  // Backstitch lines
  if (bsLines.length > 0) {
    ctx2d.lineCap = "round";
    var hxb = hoverCoords ? hoverCoords.gx - offX : null;
    var hyb = hoverCoords ? hoverCoords.gy - offY : null;
    bsLines.forEach(function(ln) {
      var lx1 = ln.x1 - offX, ly1 = ln.y1 - offY, lx2 = ln.x2 - offX, ly2 = ln.y2 - offY;
      var isHoveredErase = false;
      if (activeTool === "eraseBs" && hxb !== null && hyb !== null) {
        var A = hxb - lx1, B = hyb - ly1, C = lx2 - lx1, D = ly2 - ly1;
        var dot = A * C + B * D, lenSq = C * C + D * D, param = -1;
        if (lenSq !== 0) param = dot / lenSq;
        var xx, yy;
        if (param < 0) { xx = lx1; yy = ly1; }
        else if (param > 1) { xx = lx2; yy = ly2; }
        else { xx = lx1 + param * C; yy = ly1 + param * D; }
        var dx = hxb - xx, dy = hyb - yy;
        if (Math.sqrt(dx * dx + dy * dy) <= 0.4) isHoveredErase = true;
      }
      if (lx1 >= 0 && lx1 <= dW && ly1 >= 0 && ly1 <= dH && lx2 >= 0 && lx2 <= dW && ly2 >= 0 && ly2 <= dH) {
        ctx2d.strokeStyle = isHoveredErase ? "#ef4444" : "#333";
        ctx2d.lineWidth = Math.max(2, cSz * (isHoveredErase ? 0.25 : 0.15));
        ctx2d.beginPath(); ctx2d.moveTo(gut + lx1 * cSz, gut + ly1 * cSz); ctx2d.lineTo(gut + lx2 * cSz, gut + ly2 * cSz); ctx2d.stroke();
      }
    });
  }

  // Backstitch start point + preview line
  if (bsStart && activeTool === "backstitch") {
    var sx = bsStart.x - offX, sy = bsStart.y - offY;
    if (sx >= 0 && sx <= dW && sy >= 0 && sy <= dH) {
      ctx2d.fillStyle = "rgba(220,50,50,0.8)";
      ctx2d.beginPath(); ctx2d.arc(gut + sx * cSz, gut + sy * cSz, Math.max(3, cSz * 0.2), 0, Math.PI * 2); ctx2d.fill();
    }
    if (hoverCoords) {
      var hhx = hoverCoords.gx - offX, hhy = hoverCoords.gy - offY;
      ctx2d.strokeStyle = "rgba(50,50,50,0.5)"; ctx2d.lineWidth = Math.max(2, cSz * 0.15); ctx2d.setLineDash([4, 4]);
      ctx2d.beginPath(); ctx2d.moveTo(gut + sx * cSz, gut + sy * cSz); ctx2d.lineTo(gut + hhx * cSz, gut + hhy * cSz); ctx2d.stroke();
      ctx2d.setLineDash([]);
    }
  }

  // Hover paint/erase preview outline
  if (hoverCoords) {
    var isDrawingTool2 = activeTool === "paint" || activeTool === "fill" || stitchType === "erase" || (halfStitchTool && halfStitchTool !== "erase");
    var isValidDraw = (activeTool === "paint" || activeTool === "fill") && selectedColorId && cmap;
    if (isDrawingTool2) {
      var hx2 = hoverCoords.gx - offX, hy2 = hoverCoords.gy - offY;
      var bw = Math.min(brushSize, dW - hx2);
      var bh = Math.min(brushSize, dH - hy2);
      if (hx2 >= 0 && hx2 < dW && hy2 >= 0 && hy2 < dH && bw > 0 && bh > 0) {
        if (isValidDraw) {
          var rgb = cmap[selectedColorId].rgb;
          ctx2d.strokeStyle = "rgba(" + rgb[0] + "," + rgb[1] + "," + rgb[2] + ",0.8)";
          ctx2d.lineWidth = Math.max(2, cSz * 0.15);
          ctx2d.strokeRect(gut + hx2 * cSz + 1, gut + hy2 * cSz + 1, cSz * bw - 2, cSz * bh - 2);
          ctx2d.fillStyle = "rgba(" + rgb[0] + "," + rgb[1] + "," + rgb[2] + ",0.3)";
          ctx2d.fillRect(gut + hx2 * cSz + 1, gut + hy2 * cSz + 1, cSz * bw - 2, cSz * bh - 2);
          ctx2d.lineWidth = 1;
        } else if (stitchType === "erase") {
          ctx2d.strokeStyle = "rgba(239,68,68,0.8)";
          ctx2d.lineWidth = Math.max(2, cSz * 0.15);
          ctx2d.strokeRect(gut + hx2 * cSz + 1, gut + hy2 * cSz + 1, cSz * bw - 2, cSz * bh - 2);
          ctx2d.fillStyle = "rgba(239,68,68,0.2)";
          ctx2d.fillRect(gut + hx2 * cSz + 1, gut + hy2 * cSz + 1, cSz * bw - 2, cSz * bh - 2);
          ctx2d.lineWidth = 1;
        } else if (halfStitchTool && halfStitchTool !== "erase" && selectedColorId && cmap) {
          var rgb2 = cmap[selectedColorId].rgb;
          ctx2d.strokeStyle = "rgba(" + rgb2[0] + "," + rgb2[1] + "," + rgb2[2] + ",0.8)";
          ctx2d.lineWidth = Math.max(2, cSz * 0.15);
          ctx2d.strokeRect(gut + hx2 * cSz + 1, gut + hy2 * cSz + 1, cSz * bw - 2, cSz * bh - 2);
          ctx2d.fillStyle = "rgba(" + rgb2[0] + "," + rgb2[1] + "," + rgb2[2] + ",0.3)";
          ctx2d.fillRect(gut + hx2 * cSz + 1, gut + hy2 * cSz + 1, cSz * bw - 2, cSz * bh - 2);
          ctx2d.lineWidth = 1;
        }
      }
    }
  }

  // Outer border
  ctx2d.strokeStyle = "rgba(0,0,0,0.4)";
  ctx2d.lineWidth = 2;
  ctx2d.strokeRect(gut, gut, dW * cSz, dH * cSz);
  ctx2d.lineWidth = 1;
};

/**
 * Draw only the static base of the pattern — stitches, grid, committed
 * backstitches, outer border.  Does NOT use hoverCoords, so the result can
 * be cached as an ImageData and composited with drawPatternOverlayOnCanvas.
 * Signature identical to drawPatternOnCanvas.
 */
window.drawPatternBaseOnCanvas = function drawPatternBaseOnCanvas(ctx2d, offX, offY, dW, dH, cSz, gut, state) {
  var pat         = state.pat;
  var cmap        = state.cmap;
  var sW          = state.sW;
  var sH          = state.sH;
  var view        = state.view;
  var hiId        = state.hiId;
  var showCtr     = state.showCtr;
  var bsLines     = state.bsLines;
  var img         = state.img;
  var halfStitches = state.halfStitches;
  var showOverlayImg = state.showOverlay && !!img && !!img.src;
  var op          = state.overlayOpacity !== undefined ? state.overlayOpacity : 0.3;
  var showCleanupDiff = state.showCleanupDiff;
  var cleanupDiff = state.cleanupDiff;

  ctx2d.fillStyle = "#fff";
  ctx2d.fillRect(0, 0, gut + dW * cSz + 2, gut + dH * cSz + 2);

  if (showOverlayImg && img) {
    ctx2d.globalAlpha = op;
    ctx2d.drawImage(img, gut, gut, dW * cSz, dH * cSz);
    ctx2d.globalAlpha = 1.0;
  }

  ctx2d.fillStyle = "#a1a1aa";
  ctx2d.font = Math.max(7, Math.min(11, cSz * 0.5)) + "px system-ui";
  ctx2d.textAlign = "center";
  ctx2d.textBaseline = "middle";
  for (var x = 0; x < dW; x += 10) {
    ctx2d.fillText(String(offX + x + 1), gut + x * cSz + cSz / 2, gut / 2);
  }
  ctx2d.textAlign = "right";
  for (var y = 0; y < dH; y += 10) {
    ctx2d.fillText(String(offY + y + 1), gut - 3, gut + y * cSz + cSz / 2);
  }

  for (var y2 = 0; y2 < dH; y2++) {
    for (var x2 = 0; x2 < dW; x2++) {
      var idx = (offY + y2) * sW + (offX + x2);
      var m = pat[idx];
      if (!m) continue;
      var info = m.id === "__skip__" ? null : (cmap ? cmap[m.id] : null);
      var px = gut + x2 * cSz;
      var py = gut + y2 * cSz;
      var isHi = !hiId || m.id === hiId;
      var dim = hiId && !isHi && m.id !== "__skip__" && m.id !== "__empty__";

      if (m.id === "__skip__" || m.id === "__empty__") {
        if (showOverlayImg) {
          ctx2d.globalAlpha = 0.2;
          drawCk(ctx2d, px, py, cSz);
          ctx2d.globalAlpha = 1.0;
        } else {
          drawCk(ctx2d, px, py, cSz);
        }
      } else if (view === "color" || view === "both") {
        var alpha = 1.0;
        if (dim) alpha = 0.15;
        else if (showOverlayImg) alpha = view === "both" ? 0.4 : 0.5;
        ctx2d.fillStyle = "rgba(" + m.rgb[0] + "," + m.rgb[1] + "," + m.rgb[2] + "," + alpha + ")";
        ctx2d.fillRect(px, py, cSz, cSz);
      } else {
        var alpha2 = showOverlayImg ? 0.3 : 1.0;
        ctx2d.fillStyle = dim ? ("rgba(245,245,245," + alpha2 + ")") : ("rgba(255,255,255," + alpha2 + ")");
        ctx2d.fillRect(px, py, cSz, cSz);
      }

      if (m.id !== "__skip__" && (view === "symbol" || view === "both") && info && cSz >= 6) {
        var lum = luminance(m.rgb);
        ctx2d.fillStyle = dim ? "rgba(0,0,0,0.08)" : (view === "both" ? (lum > 128 ? "#000" : "#fff") : "#333");
        ctx2d.font = "bold " + Math.max(6, cSz * 0.6) + "px monospace";
        ctx2d.textAlign = "center";
        ctx2d.textBaseline = "middle";
        ctx2d.fillText(info.symbol, px + cSz / 2, py + cSz / 2);
      }

      if (cSz >= 4) {
        var sAlpha = dim ? 0.03 : 0.08;
        if (showOverlayImg) sAlpha = dim ? 0.01 : 0.04;
        ctx2d.strokeStyle = "rgba(0,0,0," + sAlpha + ")";
        ctx2d.strokeRect(px, py, cSz, cSz);
      }

      var hsEntry = halfStitches.get(idx);
      if (hsEntry) {
        ["fwd", "bck"].forEach(function(dir) {
          var hs = hsEntry[dir];
          if (!hs) return;
          var alpha3 = dim ? 0.15 : 1.0;
          drawHalfTriangle(ctx2d, px, py, cSz, dir, hs.rgb, alpha3);
          if (cSz >= 5) drawHalfLine(ctx2d, px, py, cSz, dir, hs.rgb, alpha3, Math.max(1, cSz * 0.12));
          if (cSz >= 10 && (view === "symbol" || view === "both")) {
            var hsInfo = cmap ? cmap[hs.id] : null;
            var sym = hsInfo ? hsInfo.symbol : null;
            if (sym) drawHalfSymbol(ctx2d, px, py, cSz, dir, sym, view === "both" ? (luminance(hs.rgb) < 128 ? "#fff" : "#000") : "#333");
          }
        });
      }
    }
  }

  // Cleanup diff overlay (magenta at 40%, below gridlines)
  if (showCleanupDiff && cleanupDiff && cleanupDiff.mask) {
    ctx2d.fillStyle = "rgba(255,0,255,0.4)";
    for (var doy = 0; doy < dH; doy++) {
      for (var dox = 0; dox < dW; dox++) {
        var doi = (offY + doy) * sW + (offX + dox);
        if (cleanupDiff.mask[doi] === 1) {
          var doPx = gut + dox * cSz;
          var doPy = gut + doy * cSz;
          // If a colour is highlighted, only show diff overlay for that colour
          var doCell = pat[doi];
          if (hiId && doCell && doCell.id !== hiId) continue;
          ctx2d.fillRect(doPx, doPy, cSz, cSz);
        }
      }
    }
  }

  // Grid lines (every 10)
  if (cSz >= 3) {
    ctx2d.strokeStyle = "rgba(0,0,0,0.2)";
    ctx2d.lineWidth = cSz >= 8 ? 1.5 : 1;
    for (var gx = 0; gx <= dW; gx += 10) {
      ctx2d.beginPath(); ctx2d.moveTo(gut + gx * cSz, gut); ctx2d.lineTo(gut + gx * cSz, gut + dH * cSz); ctx2d.stroke();
    }
    for (var gy = 0; gy <= dH; gy += 10) {
      ctx2d.beginPath(); ctx2d.moveTo(gut, gut + gy * cSz); ctx2d.lineTo(gut + dW * cSz, gut + gy * cSz); ctx2d.stroke();
    }
  }

  // Centre crosshair
  if (showCtr) {
    ctx2d.strokeStyle = "rgba(200,60,60,0.3)";
    ctx2d.lineWidth = 1.5;
    ctx2d.setLineDash([6, 4]);
    var cx2 = Math.floor(sW / 2) - offX;
    var cy2 = Math.floor(sH / 2) - offY;
    if (cx2 >= 0 && cx2 <= dW) {
      ctx2d.beginPath(); ctx2d.moveTo(gut + cx2 * cSz, gut); ctx2d.lineTo(gut + cx2 * cSz, gut + dH * cSz); ctx2d.stroke();
    }
    if (cy2 >= 0 && cy2 <= dH) {
      ctx2d.beginPath(); ctx2d.moveTo(gut, gut + cy2 * cSz); ctx2d.lineTo(gut + dW * cSz, gut + cy2 * cSz); ctx2d.stroke();
    }
    ctx2d.setLineDash([]);
  }

  // Committed backstitch lines (no hover-erase highlight — that is drawn in drawPatternOverlayOnCanvas)
  if (bsLines.length > 0) {
    ctx2d.lineCap = "round";
    bsLines.forEach(function(ln) {
      var lx1 = ln.x1 - offX, ly1 = ln.y1 - offY, lx2 = ln.x2 - offX, ly2 = ln.y2 - offY;
      if (lx1 >= 0 && lx1 <= dW && ly1 >= 0 && ly1 <= dH && lx2 >= 0 && lx2 <= dW && ly2 >= 0 && ly2 <= dH) {
        ctx2d.strokeStyle = "#333";
        ctx2d.lineWidth = Math.max(2, cSz * 0.15);
        ctx2d.beginPath(); ctx2d.moveTo(gut + lx1 * cSz, gut + ly1 * cSz); ctx2d.lineTo(gut + lx2 * cSz, gut + ly2 * cSz); ctx2d.stroke();
      }
    });
  }

  // ─── Selection mask overlay ─────────────────────────────────────────────────
  var selectionMask = state.selectionMask;
  var confettiPreview = state.confettiPreview; // Set|null from magic wand
  if (selectionMask) {
    ctx2d.save();
    // Semi-transparent blue tint over selected cells
    ctx2d.fillStyle = "rgba(59,130,246,0.25)";
    for (var sy = 0; sy < dH; sy++) {
      for (var sx2 = 0; sx2 < dW; sx2++) {
        var si = (offY + sy) * sW + (offX + sx2);
        if (selectionMask[si]) {
          ctx2d.fillRect(gut + sx2 * cSz, gut + sy * cSz, cSz, cSz);
        }
      }
    }
    // Dashed "marching ants" border around selection boundary
    ctx2d.strokeStyle = "rgba(37,99,235,0.9)";
    ctx2d.lineWidth = Math.max(1, cSz * 0.1);
    var antsDash = Math.max(2, cSz * 0.3), antsGap = Math.max(2, cSz * 0.2);
    ctx2d.setLineDash([antsDash, antsGap]);
    ctx2d.lineDashOffset = -(state.antsOffset || 0);
    for (var by = 0; by < dH; by++) {
      for (var bx = 0; bx < dW; bx++) {
        var bidx = (offY + by) * sW + (offX + bx);
        if (!selectionMask[bidx]) continue;
        var bpx = gut + bx * cSz, bpy = gut + by * cSz;
        // top edge
        if (by === 0 || !selectionMask[bidx - sW]) {
          ctx2d.beginPath(); ctx2d.moveTo(bpx, bpy); ctx2d.lineTo(bpx + cSz, bpy); ctx2d.stroke();
        }
        // bottom edge
        if (by === dH - 1 || !selectionMask[bidx + sW]) {
          ctx2d.beginPath(); ctx2d.moveTo(bpx, bpy + cSz); ctx2d.lineTo(bpx + cSz, bpy + cSz); ctx2d.stroke();
        }
        // left edge
        if (bx === 0 || !selectionMask[bidx - 1]) {
          ctx2d.beginPath(); ctx2d.moveTo(bpx, bpy); ctx2d.lineTo(bpx, bpy + cSz); ctx2d.stroke();
        }
        // right edge
        if (bx === dW - 1 || !selectionMask[bidx + 1]) {
          ctx2d.beginPath(); ctx2d.moveTo(bpx + cSz, bpy); ctx2d.lineTo(bpx + cSz, bpy + cSz); ctx2d.stroke();
        }
      }
    }
    ctx2d.setLineDash([]);
    ctx2d.restore();
  }

  // Confetti preview: highlight stitches flagged for removal
  if (confettiPreview && confettiPreview.size > 0) {
    ctx2d.save();
    ctx2d.fillStyle = "rgba(239,68,68,0.45)";
    confettiPreview.forEach(function(ci) {
      var cx2 = (ci % sW) - offX, cy2 = (Math.floor(ci / sW)) - offY;
      if (cx2 >= 0 && cx2 < dW && cy2 >= 0 && cy2 < dH) {
        ctx2d.fillRect(gut + cx2 * cSz, gut + cy2 * cSz, cSz, cSz);
      }
    });
    ctx2d.restore();
  }

  // Outer border
  ctx2d.strokeStyle = "rgba(0,0,0,0.4)";
  ctx2d.lineWidth = 2;
  ctx2d.strokeRect(gut, gut, dW * cSz, dH * cSz);
  ctx2d.lineWidth = 1;
};

/**
 * Draw only the hover-dependent overlay — crosshair highlight, brush preview,
 * hover-erase backstitch highlight, and backstitch start/preview line.
 * Call this after drawPatternBaseOnCanvas (or after restoring its ImageData cache).
 * Signature identical to drawPatternOnCanvas.
 */
window.drawPatternOverlayOnCanvas = function drawPatternOverlayOnCanvas(ctx2d, offX, offY, dW, dH, cSz, gut, state) {
  var hoverCoords = state.hoverCoords;
  var activeTool  = state.activeTool;
  var bsLines     = state.bsLines;
  var bsStart     = state.bsStart;
  var selectedColorId = state.selectedColorId;
  var brushSize   = state.brushSize;
  var stitchType  = state.stitchType;
  var halfStitchTool = state.halfStitchTool;
  var cmap        = state.cmap;

  // Hover crosshair + brush highlight
  if (hoverCoords && hoverCoords.gx >= offX && hoverCoords.gy >= offY && hoverCoords.gx < offX + dW && hoverCoords.gy < offY + dH) {
    var hx = hoverCoords.gx - offX;
    var hy = hoverCoords.gy - offY;
    var isDrawingTool = activeTool === "paint" || activeTool === "fill" || stitchType === "erase" || (halfStitchTool && halfStitchTool !== "erase");
    var actualBrushSize = isDrawingTool ? Math.min(brushSize, Math.min(dW - hx, dH - hy)) : 1;
    if (actualBrushSize < 1) actualBrushSize = 1;
    ctx2d.fillStyle = "rgba(0,0,0,0.03)";
    ctx2d.fillRect(gut + hx * cSz, gut, cSz * actualBrushSize, dH * cSz);
    ctx2d.fillRect(gut, gut + hy * cSz, dW * cSz, cSz * actualBrushSize);
  }

  // Hover-erase backstitch: redraw the hovered line in red on top of the base
  if (activeTool === "eraseBs" && hoverCoords && bsLines.length > 0) {
    var hxb = hoverCoords.gx - offX;
    var hyb = hoverCoords.gy - offY;
    ctx2d.lineCap = "round";
    bsLines.forEach(function(ln) {
      var lx1 = ln.x1 - offX, ly1 = ln.y1 - offY, lx2 = ln.x2 - offX, ly2 = ln.y2 - offY;
      if (lx1 < 0 || lx1 > dW || ly1 < 0 || ly1 > dH || lx2 < 0 || lx2 > dW || ly2 < 0 || ly2 > dH) return;
      var A = hxb - lx1, B = hyb - ly1, C = lx2 - lx1, D = ly2 - ly1;
      var dot = A * C + B * D, lenSq = C * C + D * D, param = -1;
      if (lenSq !== 0) param = dot / lenSq;
      var xx, yy;
      if (param < 0) { xx = lx1; yy = ly1; }
      else if (param > 1) { xx = lx2; yy = ly2; }
      else { xx = lx1 + param * C; yy = ly1 + param * D; }
      var dx = hxb - xx, dy = hyb - yy;
      if (Math.sqrt(dx * dx + dy * dy) <= 0.7) {
        ctx2d.strokeStyle = "#ef4444";
        ctx2d.lineWidth = Math.max(2, cSz * 0.25);
        ctx2d.beginPath(); ctx2d.moveTo(gut + lx1 * cSz, gut + ly1 * cSz); ctx2d.lineTo(gut + lx2 * cSz, gut + ly2 * cSz); ctx2d.stroke();
      }
    });
  }

  // Backstitch start point + preview line
  if (bsStart && activeTool === "backstitch") {
    var sx = bsStart.x - offX, sy = bsStart.y - offY;
    if (sx >= 0 && sx <= dW && sy >= 0 && sy <= dH) {
      ctx2d.fillStyle = "rgba(220,50,50,0.8)";
      ctx2d.beginPath(); ctx2d.arc(gut + sx * cSz, gut + sy * cSz, Math.max(3, cSz * 0.2), 0, Math.PI * 2); ctx2d.fill();
    }
    if (hoverCoords) {
      var hhx = hoverCoords.gx - offX, hhy = hoverCoords.gy - offY;
      ctx2d.strokeStyle = "rgba(50,50,50,0.5)"; ctx2d.lineWidth = Math.max(2, cSz * 0.15); ctx2d.setLineDash([4, 4]);
      ctx2d.beginPath(); ctx2d.moveTo(gut + sx * cSz, gut + sy * cSz); ctx2d.lineTo(gut + hhx * cSz, gut + hhy * cSz); ctx2d.stroke();
      ctx2d.setLineDash([]);
    }
  }

  // Hover paint/erase preview outline
  if (hoverCoords) {
    var isDrawingTool2 = activeTool === "paint" || activeTool === "fill" || stitchType === "erase" || (halfStitchTool && halfStitchTool !== "erase");
    var isValidDraw = (activeTool === "paint" || activeTool === "fill") && selectedColorId && cmap;
    if (isDrawingTool2) {
      var hx2 = hoverCoords.gx - offX, hy2 = hoverCoords.gy - offY;
      var bw = Math.min(brushSize, dW - hx2);
      var bh = Math.min(brushSize, dH - hy2);
      if (hx2 >= 0 && hx2 < dW && hy2 >= 0 && hy2 < dH && bw > 0 && bh > 0) {
        if (isValidDraw) {
          var rgb = cmap[selectedColorId].rgb;
          ctx2d.strokeStyle = "rgba(" + rgb[0] + "," + rgb[1] + "," + rgb[2] + ",0.8)";
          ctx2d.lineWidth = Math.max(2, cSz * 0.15);
          ctx2d.strokeRect(gut + hx2 * cSz + 1, gut + hy2 * cSz + 1, cSz * bw - 2, cSz * bh - 2);
          ctx2d.fillStyle = "rgba(" + rgb[0] + "," + rgb[1] + "," + rgb[2] + ",0.3)";
          ctx2d.fillRect(gut + hx2 * cSz + 1, gut + hy2 * cSz + 1, cSz * bw - 2, cSz * bh - 2);
          ctx2d.lineWidth = 1;
        } else if (stitchType === "erase") {
          ctx2d.strokeStyle = "rgba(239,68,68,0.8)";
          ctx2d.lineWidth = Math.max(2, cSz * 0.15);
          ctx2d.strokeRect(gut + hx2 * cSz + 1, gut + hy2 * cSz + 1, cSz * bw - 2, cSz * bh - 2);
          ctx2d.fillStyle = "rgba(239,68,68,0.2)";
          ctx2d.fillRect(gut + hx2 * cSz + 1, gut + hy2 * cSz + 1, cSz * bw - 2, cSz * bh - 2);
          ctx2d.lineWidth = 1;
        } else if (halfStitchTool && halfStitchTool !== "erase" && selectedColorId && cmap) {
          var rgb2 = cmap[selectedColorId].rgb;
          ctx2d.strokeStyle = "rgba(" + rgb2[0] + "," + rgb2[1] + "," + rgb2[2] + ",0.8)";
          ctx2d.lineWidth = Math.max(2, cSz * 0.15);
          ctx2d.strokeRect(gut + hx2 * cSz + 1, gut + hy2 * cSz + 1, cSz * bw - 2, cSz * bh - 2);
          ctx2d.fillStyle = "rgba(" + rgb2[0] + "," + rgb2[1] + "," + rgb2[2] + ",0.3)";
          ctx2d.fillRect(gut + hx2 * cSz + 1, gut + hy2 * cSz + 1, cSz * bw - 2, cSz * bh - 2);
          ctx2d.lineWidth = 1;
        }
      }
    }
  }

  // ─── Lasso in-progress overlay ───────────────────────────────────────────────
  var lassoMode   = state.lassoMode;
  var lassoPoints = state.lassoPoints;
  var lassoCursor = state.lassoCursor;
  var lassoPreviewMask = state.lassoPreviewMask;
  var lassoInProgress  = state.lassoInProgress;

  if (lassoMode && (lassoInProgress || (lassoPoints && lassoPoints.length > 0))) {
    ctx2d.save();

    if (lassoMode === "freehand" && lassoPreviewMask) {
      // Tint cells painted by freehand drag
      ctx2d.fillStyle = "rgba(16,185,129,0.35)";
      for (var fi = 0; fi < lassoPreviewMask.length; fi++) {
        if (!lassoPreviewMask[fi]) continue;
        var lfx = (fi % state.sW) - offX;
        var lfy = Math.floor(fi / state.sW) - offY;
        if (lfx < 0 || lfx >= dW || lfy < 0 || lfy >= dH) continue;
        ctx2d.fillRect(gut + lfx * cSz, gut + lfy * cSz, cSz, cSz);
      }
    }

    if ((lassoMode === "polygon" || lassoMode === "magnetic") && lassoPoints && lassoPoints.length > 0) {
      var pts = lassoPoints;
      var drawPath = function(pathPts, dashed, strokeStyle) {
        if (!pathPts || !pathPts.length) return;
        ctx2d.strokeStyle = strokeStyle;
        ctx2d.lineWidth = Math.max(1.5, cSz * 0.12);
        ctx2d.setLineDash(dashed ? [Math.max(3, cSz * 0.3), Math.max(3, cSz * 0.3)] : []);
        ctx2d.beginPath();
        ctx2d.moveTo(gut + (pathPts[0].x - offX) * cSz + cSz / 2, gut + (pathPts[0].y - offY) * cSz + cSz / 2);
        for (var pp = 1; pp < pathPts.length; pp++) {
          ctx2d.lineTo(gut + (pathPts[pp].x - offX) * cSz + cSz / 2, gut + (pathPts[pp].y - offY) * cSz + cSz / 2);
        }
        ctx2d.stroke();
        ctx2d.setLineDash([]);
      };
      var makeSeg = function(a, b) {
        if (!a || !b) return [];
        if (lassoMode === "magnetic" && state.lassoMagneticPath && state.pat && state.cmap) {
          return state.lassoMagneticPath(state.pat, state.cmap, state.sW, state.sH, a.x, a.y, b.x, b.y);
        }
        if (state.lassoLinePath) return state.lassoLinePath(a.x, a.y, b.x, b.y);
        return [a, b];
      };

      if (pts.length > 1) {
        var committedPath = [];
        for (var pi = 1; pi < pts.length; pi++) {
          var segPath = makeSeg(pts[pi - 1], pts[pi]);
          for (var sp = 0; sp < segPath.length; sp++) {
            if (committedPath.length && sp === 0) continue;
            committedPath.push(segPath[sp]);
          }
        }
        drawPath(committedPath, false, lassoMode === "magnetic" ? "rgba(245,158,11,0.9)" : "rgba(99,102,241,0.9)");
      }

      // Dashed line from last anchor to cursor
      if (lassoCursor) {
        var nearStart = false;
        if (pts.length >= 3) {
          var csdx = lassoCursor.x - pts[0].x, csdy = lassoCursor.y - pts[0].y;
          nearStart = Math.sqrt(csdx * csdx + csdy * csdy) <= 1.5;
        }
        var cursorColor = nearStart
          ? (lassoMode === "magnetic" ? "rgba(245,158,11,0.9)" : "rgba(99,102,241,0.9)")
          : "rgba(100,100,100,0.5)";
        var lastPt = pts[pts.length - 1];
        var previewTarget = nearStart ? pts[0] : lassoCursor;
        drawPath(makeSeg(lastPt, previewTarget), true, cursorColor);

        // Snap-to-close circle around start when near
        if (nearStart) {
          ctx2d.strokeStyle = lassoMode === "magnetic" ? "rgba(245,158,11,0.9)" : "rgba(99,102,241,0.9)";
          ctx2d.lineWidth = Math.max(1.5, cSz * 0.12);
          ctx2d.beginPath();
          ctx2d.arc(
            gut + (pts[0].x - offX) * cSz + cSz / 2,
            gut + (pts[0].y - offY) * cSz + cSz / 2,
            Math.max(5, cSz * 0.4), 0, Math.PI * 2
          );
          ctx2d.stroke();
        }
      }

      // Anchor dots
      var dotColor = lassoMode === "magnetic" ? "rgba(245,158,11,1)" : "rgba(99,102,241,1)";
      for (var ai = 0; ai < pts.length; ai++) {
        var ax = gut + (pts[ai].x - offX) * cSz + cSz / 2;
        var ay = gut + (pts[ai].y - offY) * cSz + cSz / 2;
        var r = ai === 0 ? Math.max(4, cSz * 0.3) : Math.max(2.5, cSz * 0.18);
        ctx2d.fillStyle = "white";
        ctx2d.beginPath(); ctx2d.arc(ax, ay, r + 1, 0, Math.PI * 2); ctx2d.fill();
        ctx2d.fillStyle = dotColor;
        ctx2d.beginPath(); ctx2d.arc(ax, ay, r, 0, Math.PI * 2); ctx2d.fill();
      }
    }

    ctx2d.restore();
  }
};
