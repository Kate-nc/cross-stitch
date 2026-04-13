/* creator/RealisticCanvas.js — Realistic cross-stitch texture preview.
   Renders each stitch as a pair of crossed diagonal strands on a woven fabric background.
   Level 1: flat X strands. Level 2: shaded X with light simulation.
   Reads from CreatorContext. Loaded as part of creator/bundle.js.
   Depends on: context.js (CreatorContext) */

window.CreatorRealisticCanvas = function CreatorRealisticCanvas() {
  var ctx = React.useContext(window.CreatorContext);
  var h = React.createElement;

  var displayRef = React.useRef(null);
  var offscreenRef = React.useRef(null);

  // Version counter: Effect A increments this after rebuilding the offscreen canvas
  // so Effect B knows to re-draw the display canvas.
  var _offV = React.useState(0); var offscreenVersion = _offV[0], setOffscreenVersion = _offV[1];

  var pat = ctx.pat;
  var cmap = ctx.cmap;
  var pal = ctx.pal;
  var sW = ctx.sW;
  var sH = ctx.sH;
  var cs = ctx.cs;
  var previewShowGrid = ctx.previewShowGrid;
  var realisticLevel = ctx.realisticLevel;

  // ── Effect A: render the full offscreen realistic canvas ───────────────────
  // Re-runs when pattern data or rendering level changes.
  React.useEffect(function() {
    if (!pat || !sW || !sH) return;

    // Clamp CELL_SIZE so the offscreen canvas fits within browser limits (~8192px).
    var MAX_DIM = 8192;
    var CELL_SIZE = Math.max(4, Math.min(16, Math.floor(Math.min(MAX_DIM / sW, MAX_DIM / sH))));

    var canvasW = sW * CELL_SIZE;
    var canvasH = sH * CELL_SIZE;

    var offscreen = document.createElement("canvas");
    offscreen.width = canvasW;
    offscreen.height = canvasH;
    var oc = offscreen.getContext("2d");
    if (!oc) return; // canvas too large for the device

    // ── 1. Fabric base ──────────────────────────────────────────────────────
    var FR = 245, FG = 240, FB = 230; // warm cream Aida
    oc.fillStyle = "rgb(" + FR + "," + FG + "," + FB + ")";
    oc.fillRect(0, 0, canvasW, canvasH);

    // ── 2. Fabric weave texture ─────────────────────────────────────────────
    // Render a single cell-sized tile with subtle grid lines, then tile it.
    var weaveStep = Math.max(3, Math.round(CELL_SIZE / 4));
    var fabricTile = document.createElement("canvas");
    fabricTile.width = CELL_SIZE;
    fabricTile.height = CELL_SIZE;
    var ftc = fabricTile.getContext("2d");
    ftc.fillStyle = "rgb(" + FR + "," + FG + "," + FB + ")";
    ftc.fillRect(0, 0, CELL_SIZE, CELL_SIZE);
    ftc.strokeStyle = "rgba(" + Math.max(0, FR - 10) + "," + Math.max(0, FG - 10) + "," + Math.max(0, FB - 10) + ",0.07)";
    ftc.lineWidth = 1;
    for (var wxi = 0; wxi < CELL_SIZE; wxi += weaveStep) {
      ftc.beginPath(); ftc.moveTo(wxi + 0.5, 0); ftc.lineTo(wxi + 0.5, CELL_SIZE); ftc.stroke();
    }
    for (var wyi = 0; wyi < CELL_SIZE; wyi += weaveStep) {
      ftc.beginPath(); ftc.moveTo(0, wyi + 0.5); ftc.lineTo(CELL_SIZE, wyi + 0.5); ftc.stroke();
    }
    var weavePattern = oc.createPattern(fabricTile, "repeat");
    oc.fillStyle = weavePattern;
    oc.fillRect(0, 0, canvasW, canvasH);

    // ── 3. Stitch tile cache and full pattern render ─────────────────────────
    var padding = CELL_SIZE * 0.10;
    var sw = CELL_SIZE * 0.22; // strand width
    var lvl = realisticLevel;

    function adjustBrightness(r, g, b, factor) {
      return [
        Math.min(255, Math.round(r * factor)),
        Math.min(255, Math.round(g * factor)),
        Math.min(255, Math.round(b * factor))
      ];
    }

    // Draw a cross stitch X into a canvas context.
    // r1/g1/b1 = bottom-leg colour, r2/g2/b2 = top-leg colour.
    function drawCross(tc, r1, g1, b1, r2, g2, b2) {
      var x0 = padding, y0 = padding;
      var x1 = CELL_SIZE - padding, y1 = CELL_SIZE - padding;
      tc.lineCap = "round";

      if (lvl === 1) {
        // ── Level 1: flat X ──────────────────────────────────────────────────
        // Bottom leg: BL → TR
        tc.lineWidth = sw;
        tc.strokeStyle = "rgb(" + r1 + "," + g1 + "," + b1 + ")";
        tc.beginPath(); tc.moveTo(x0, y1); tc.lineTo(x1, y0); tc.stroke();
        // Top leg: TL → BR
        tc.lineWidth = sw;
        tc.strokeStyle = "rgb(" + r2 + "," + g2 + "," + b2 + ")";
        tc.beginPath(); tc.moveTo(x0, y0); tc.lineTo(x1, y1); tc.stroke();
      } else {
        // ── Level 2: shaded X with light simulation ──────────────────────────
        var darkC  = adjustBrightness(r1, g1, b1, 0.78);
        var lightC = adjustBrightness(r2, g2, b2, 1.15);

        // Bottom leg (darker — sits underneath): soft edge + core strand
        tc.lineWidth = sw * 1.3;
        tc.strokeStyle = "rgba(" + darkC[0] + "," + darkC[1] + "," + darkC[2] + ",0.30)";
        tc.beginPath(); tc.moveTo(x0, y1); tc.lineTo(x1, y0); tc.stroke();
        tc.lineWidth = sw;
        tc.strokeStyle = "rgb(" + darkC[0] + "," + darkC[1] + "," + darkC[2] + ")";
        tc.beginPath(); tc.moveTo(x0, y1); tc.lineTo(x1, y0); tc.stroke();

        // Top leg (brighter — faces the light): soft edge + core strand
        tc.lineWidth = sw * 1.3;
        tc.strokeStyle = "rgba(" + lightC[0] + "," + lightC[1] + "," + lightC[2] + ",0.30)";
        tc.beginPath(); tc.moveTo(x0, y0); tc.lineTo(x1, y1); tc.stroke();
        tc.lineWidth = sw;
        tc.strokeStyle = "rgb(" + lightC[0] + "," + lightC[1] + "," + lightC[2] + ")";
        tc.beginPath(); tc.moveTo(x0, y0); tc.lineTo(x1, y1); tc.stroke();

        // Specular highlight line along the top leg
        tc.lineWidth = sw * 0.30;
        tc.strokeStyle = "rgba(255,255,255,0.15)";
        tc.beginPath(); tc.moveTo(x0, y0); tc.lineTo(x1, y1); tc.stroke();

        // Shadow at the crossing point
        var cx = CELL_SIZE / 2, cy = CELL_SIZE / 2;
        tc.fillStyle = "rgba(0,0,0,0.08)";
        tc.beginPath(); tc.arc(cx, cy, sw * 0.5, 0, Math.PI * 2); tc.fill();
      }
    }

    // Per-colour tile cache: each unique colour gets one CELL_SIZE×CELL_SIZE canvas
    // pre-rendered with the X geometry. Blend cells get their own key.
    var tileCache = {};

    function getTile(rgb, rgb2) {
      var r1 = rgb[0], g1 = rgb[1], b1 = rgb[2];
      var r2 = rgb2 ? rgb2[0] : r1;
      var g2 = rgb2 ? rgb2[1] : g1;
      var b2 = rgb2 ? rgb2[2] : b1;
      var key = r1 + "," + g1 + "," + b1 + "|" + r2 + "," + g2 + "," + b2;
      if (tileCache[key]) return tileCache[key];
      var tileC = document.createElement("canvas");
      tileC.width = CELL_SIZE;
      tileC.height = CELL_SIZE;
      var tc = tileC.getContext("2d");
      drawCross(tc, r1, g1, b1, r2, g2, b2);
      tileCache[key] = tileC;
      return tileC;
    }

    // Render every stitched cell using its cached tile
    for (var i = 0; i < pat.length; i++) {
      var cell = pat[i];
      if (!cell || cell.id === "__skip__" || cell.id === "__empty__") continue;

      var cellCol = i % sW;
      var cellRow = Math.floor(i / sW);
      var cellX = cellCol * CELL_SIZE;
      var cellY = cellRow * CELL_SIZE;

      // Resolve RGB — cell.rgb is the primary source; cmap is the fallback.
      var rgb = cell.rgb;
      var rgb2 = null;

      if (cell.id && cell.id.indexOf("+") !== -1) {
        // Blend cell: use each thread's individual colour for bottom/top leg respectively.
        var blendParts = cell.id.split("+");
        var e1 = cmap && cmap[blendParts[0]];
        var e2 = cmap && cmap[blendParts[1]];
        if (e1) rgb = e1.rgb;
        if (e2) rgb2 = e2.rgb;
      }

      if (!rgb && cmap) {
        var lookup = cmap[cell.id];
        if (lookup) rgb = lookup.rgb;
      }

      if (!rgb) continue;

      oc.drawImage(getTile(rgb, rgb2), cellX, cellY);
    }

    offscreenRef.current = offscreen;
    setOffscreenVersion(function(v) { return v + 1; });
  }, [pat, cmap, sW, sH, realisticLevel]);

  // ── Effect B: scale the offscreen canvas to the display canvas ─────────────
  // Runs whenever the offscreen is rebuilt (offscreenVersion) or zoom changes.
  React.useEffect(function() {
    if (!offscreenRef.current || !displayRef.current || !sW || !sH) return;

    var canvas = displayRef.current;
    canvas.width  = sW * cs;
    canvas.height = sH * cs;

    var ctx2d = canvas.getContext("2d");
    // Use bilinear smoothing for the textured render — looks better than pixelated when downscaling
    ctx2d.imageSmoothingEnabled = true;
    ctx2d.imageSmoothingQuality = "high";

    ctx2d.drawImage(offscreenRef.current, 0, 0, sW * cs, sH * cs);

    // Grid overlay — drawn at display resolution so lines are always exactly 1px
    if (previewShowGrid && cs >= 2) {
      var darkMode = window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches;
      var minorColor = darkMode ? "rgba(255,255,255,0.10)" : "rgba(0,0,0,0.12)";
      var majorColor = darkMode ? "rgba(255,255,255,0.22)" : "rgba(0,0,0,0.25)";
      ctx2d.lineWidth = 1;

      for (var x = 0; x <= sW; x++) {
        var px = Math.round(x * cs) + 0.5;
        ctx2d.strokeStyle = (x % 10 === 0) ? majorColor : minorColor;
        ctx2d.beginPath(); ctx2d.moveTo(px, 0); ctx2d.lineTo(px, sH * cs); ctx2d.stroke();
      }
      for (var y = 0; y <= sH; y++) {
        var py = Math.round(y * cs) + 0.5;
        ctx2d.strokeStyle = (y % 10 === 0) ? majorColor : minorColor;
        ctx2d.beginPath(); ctx2d.moveTo(0, py); ctx2d.lineTo(sW * cs, py); ctx2d.stroke();
      }
    }
  }, [offscreenVersion, cs, sW, sH, previewShowGrid]);

  // Status bar: stitch dimensions, colour count, current level label
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
      className: "preview-canvas preview-canvas--realistic"
    }),
    h("div", {className: "preview-status-bar"},
      sW + " \xD7 " + sH + " stitches \xB7 " + colCount + " colour" + (colCount !== 1 ? "s" : "") +
      " \xB7 " + (realisticLevel === 2 ? "Shaded" : "Flat")
    )
  );
};
