/* creator/StitchedPreview.js — Convert's "Stitched" preview: the chart the
   current settings make, drawn as cross stitches on the chosen fabric.

   Each stitch is two legs of thread corner to corner. They are drawn as wide
   as two strands lie on that fabric, so the share of fabric showing between
   stitches is about right (more on 11-count, very little on 18-count), and a
   leg's average colour is its thread's colour: the shading only rounds the
   strands, it does not darken them. A blend is one strand of each thread in
   every leg, side by side. Fabric holes show at the corners.

   The canvas is drawn at the size it is shown, in device pixels, so the
   browser never shrinks a large canvas (which shimmers). "Close up" draws
   16 screen pixels per stitch in a scrolling box. Both canvases keep within
   the device's canvas budget (stitchedSizes); a close-up of a large chart
   on a phone is drawn smaller and shown stretched.

   window.CreatorStitchedPreview(props):
     cells        the preview's cells ({ id, rgb, threads? }), row by row
     width,height stitches across and down
     fabricColour '#RRGGBB'
     fabricCt     the fabric count (over-two counts use their effective count)
     displayWidth CSS pixels available across
     closeUp      true for 16 CSS pixels per stitch
   window.stitchCoverage(ct): share of a stitch's square two strands cover.
   window.drawStitchTile(ctx, size, fabric, legA, legB, coverage): one stitch.

   Loaded as a plain <script> (concatenated into creator/bundle.js). */

(function () {
  // Two strands lie thinner on coarse fabric: about 83% of the square is
  // covered on 11-count, over 90% on 16-count and nearly all on 18-count.
  function stitchCoverage(ct) {
    var over = (typeof stitchOverFor === "function" && stitchOverFor(ct)) || 1;
    var eff = (Number(ct) || 14) / over;
    return Math.max(0.5, Math.min(1, 0.55 + (eff - 11) * 0.06));
  }
  window.stitchCoverage = stitchCoverage;

  function hexRgb(hex) {
    var m = /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex || "");
    return m ? [parseInt(m[1], 16), parseInt(m[2], 16), parseInt(m[3], 16)] : [255, 255, 255];
  }
  function shade(rgb, f) {
    return "rgb(" + Math.min(255, Math.round(rgb[0] * f)) + "," + Math.min(255, Math.round(rgb[1] * f)) + "," + Math.min(255, Math.round(rgb[2] * f)) + ")";
  }

  // One leg from (x0,y0) to (x1,y1), w wide: a slightly darker edge, the
  // thread's own colour, and a light crest. strands: one colour, or two side
  // by side for a blend.
  function drawLeg(c, x0, y0, x1, y1, w, strands, under) {
    var dx = x1 - x0, dy = y1 - y0, len = Math.sqrt(dx * dx + dy * dy) || 1;
    var px = -dy / len, py = dx / len;          // across the leg
    var n = strands.length, sw = w / n;
    var dim = under ? 0.94 : 1;                  // the under leg is a touch shaded
    for (var k = 0; k < n; k++) {
      var off = (k - (n - 1) / 2) * sw;
      var ax = x0 + px * off, ay = y0 + py * off, bx = x1 + px * off, by = y1 + py * off;
      var rgb = strands[k];
      c.lineCap = "butt";
      c.lineWidth = sw;
      c.strokeStyle = shade(rgb, 0.8 * dim);
      c.beginPath(); c.moveTo(ax, ay); c.lineTo(bx, by); c.stroke();
      c.lineWidth = sw * 0.72;
      c.strokeStyle = shade(rgb, 1.04 * dim);
      c.beginPath(); c.moveTo(ax, ay); c.lineTo(bx, by); c.stroke();
      if (sw >= 4) {
        c.lineWidth = sw * 0.22;
        c.strokeStyle = shade(rgb, 1.14 * dim);
        c.beginPath(); c.moveTo(ax - px * sw * 0.12, ay - py * sw * 0.12); c.lineTo(bx - px * sw * 0.12, by - py * sw * 0.12); c.stroke();
      }
    }
  }

  // One stitch in a size x size square: fabric, its holes, then the under
  // leg (bottom left to top right) and the top leg. legA/legB are arrays of
  // strand colours; null for an unstitched square.
  function drawStitchTile(c, size, fabric, legA, legB, coverage) {
    c.fillStyle = shade(fabric, 1);
    c.fillRect(0, 0, size, size);
    var hole = Math.max(0.6, size * 0.09);
    c.fillStyle = shade(fabric, 0.78);
    [[0, 0], [size, 0], [0, size], [size, size]].forEach(function (p) {
      c.beginPath(); c.arc(p[0], p[1], hole, 0, Math.PI * 2); c.fill();
    });
    if (!legA) return;
    var w = size * (0.25 + 0.30 * coverage);
    var inset = size * 0.04;
    drawLeg(c, inset, size - inset, size - inset, inset, w, legA, true);
    drawLeg(c, inset, inset, size - inset, size - inset, w, legB || legA, false);
  }
  window.drawStitchTile = drawStitchTile;

  function strandsFor(cell) {
    if (!cell || !cell.id || cell.id === "__skip__" || cell.id === "__empty__" || !cell.rgb) return null;
    if (cell.type === "blend" && cell.threads && cell.threads[0] && cell.threads[1] && cell.threads[0].rgb && cell.threads[1].rgb) {
      return [cell.threads[0].rgb, cell.threads[1].rgb];
    }
    return [cell.rgb];
  }

  var MAX_OFFSCREEN = 4096;   // the drawn chart's longest side, in pixels

  // Pixels per stitch for the two canvases (the drawn chart and the one on
  // the page), within the device's canvas budget (useCanvasOverlays.js
  // canvasSizeLimits: 16.7 million pixels on iOS). The two exist at once, so
  // each may take half of the area; each side stays within the side limit.
  // The page canvas may come out smaller than asked; it is then shown
  // stretched to the asked size rather than made bigger than the budget.
  function stitchedSizes(W, H, wantDevCell, limits) {
    limits = limits || { side: 4096, area: 16777216 };
    var cells = Math.max(1, W * H), long = Math.max(1, W, H);
    var areaEach = limits.area / 2;
    var maxCell = Math.min(limits.side / long, Math.sqrt(areaEach / cells));
    var devCell = Math.max(0.25, Math.min(wantDevCell, maxCell));
    // Stitches are drawn at least 4 pixels wide where the budget allows, so
    // a small one still has its fabric gaps when it is shrunk onto the page.
    var tile = Math.floor(Math.min(32, MAX_OFFSCREEN / long, maxCell, Math.max(4, Math.round(devCell))));
    return { devCell: devCell, tile: Math.max(1, tile) };
  }
  window.stitchedPreviewSizes = stitchedSizes;

  window.CreatorStitchedPreview = function CreatorStitchedPreview(props) {
    var h = React.createElement;
    var canvasRef = React.useRef(null);
    var cells = props.cells, W = props.width, H = props.height;
    var dpr = (typeof window !== "undefined" && window.devicePixelRatio) || 1;
    // CSS pixels per stitch on screen.
    var cssCell = props.closeUp ? 16 : (props.displayWidth > 0 ? props.displayWidth / W : 8);
    var sizes = stitchedSizes(W, H, cssCell * dpr, window.canvasSizeLimits ? window.canvasSizeLimits() : null);
    var devCell = sizes.devCell, tile = sizes.tile;
    var dispW = Math.max(1, Math.round(W * devCell)), dispH = Math.max(1, Math.round(H * devCell));
    var coverage = stitchCoverage(props.fabricCt);
    var fabric = props.fabricColour || "#FFFFFF";

    React.useEffect(function () {
      var canvas = canvasRef.current;
      if (!canvas || !cells || !W || !H || cells.length !== W * H) return;
      var fab = hexRgb(fabric);
      var off = document.createElement("canvas");
      off.width = W * tile; off.height = H * tile;
      var oc = off.getContext("2d");
      // No drawing context (the browser refused the canvas): leave the
      // last picture rather than fail.
      if (!oc) { off.width = off.height = 0; return; }
      var tiles = {};
      function tileFor(cell) {
        var key = cell && cell.id && cell.rgb && cell.id !== "__skip__" && cell.id !== "__empty__" ? cell.id + "|" + cell.rgb.join(",") : "__fabric__";
        if (tiles[key]) return tiles[key];
        var t = document.createElement("canvas"); t.width = tile; t.height = tile;
        var strands = key === "__fabric__" ? null : strandsFor(cell);
        var tc = t.getContext("2d");
        if (tc) drawStitchTile(tc, tile, fab, strands, strands, coverage);
        tiles[key] = t;
        return t;
      }
      for (var i = 0; i < cells.length; i++) {
        oc.drawImage(tileFor(cells[i]), (i % W) * tile, Math.floor(i / W) * tile);
      }
      canvas.width = dispW; canvas.height = dispH;
      var dc = canvas.getContext("2d");
      if (dc) {
        dc.imageSmoothingEnabled = true;
        if ("imageSmoothingQuality" in dc) dc.imageSmoothingQuality = "high";
        dc.drawImage(off, 0, 0, dispW, dispH);
      }
      // Free the drawn chart's memory now rather than at collection.
      off.width = off.height = 0;
    }, [cells, W, H, tile, dispW, dispH, coverage, fabric]);

    return h("canvas", {
      ref: canvasRef, className: "cvp-stitched__canvas", role: "img",
      "aria-label": "The pattern as cross stitches on " + (typeof fabricShortLabel === "function" ? fabricShortLabel(props.fabricCt || 14) : "") + " fabric",
      style: { width: Math.round(W * cssCell) + "px", height: Math.round(H * cssCell) + "px" }
    });
  };
})();
