/* creator/RealisticCanvas.js — Realistic cross-stitch texture preview.
   Renders each stitch as a pair of crossed diagonal strands on a woven fabric background.
   Level 1: flat X strands. Level 2: shaded X with light simulation. Level 3: procedural thread texture.
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
    // Level 3 requires larger tiles for fibre detail; levels 1–2 cap at 16px.
    var maxCellSz = (realisticLevel === 3) ? 32 : 16;
    var CELL_SIZE = Math.max(4, Math.min(maxCellSz, Math.floor(Math.min(MAX_DIM / sW, MAX_DIM / sH))));

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
    var padding = CELL_SIZE * 0.08;
    var sw = CELL_SIZE * 0.28; // strand width
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
    // variant (0–3): Level 3 only — selects one of 4 colour-variation seeds.
    function drawCross(tc, r1, g1, b1, r2, g2, b2, variant) {
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
      } else if (lvl === 2) {
        // ── Level 2: cylindrical gradient strands ────────────────────────────
        // Each strand is rendered as a transverse gradient: dark at the edges,
        // bright at the crest — simulating a rounded cylindrical thread.
        // The gradient vector is perpendicular to the strand direction so it
        // varies across the strand width (not along its length).
        var INV_SQ2 = 0.7071; // 1/√2
        var hs = sw / 2;      // half-strand width
        var cx = CELL_SIZE / 2, cy = CELL_SIZE / 2;

        // Build a 5-stop cylinder gradient centred on (cx, cy).
        // perpX/perpY: unit vector perpendicular to the strand direction.
        // factor: global brightness multiplier (top leg slightly above 1, bottom below 1).
        function makeGrad(perpX, perpY, r, g, b, factor) {
          var gx0 = cx - perpX * hs, gy0 = cy - perpY * hs;
          var gx1 = cx + perpX * hs, gy1 = cy + perpY * hs;
          var grad = tc.createLinearGradient(gx0, gy0, gx1, gy1);
          function stop(f) {
            return "rgb(" +
              Math.min(255, Math.max(0, Math.round(r * f))) + "," +
              Math.min(255, Math.max(0, Math.round(g * f))) + "," +
              Math.min(255, Math.max(0, Math.round(b * f))) + ")";
          }
          grad.addColorStop(0.00, stop(factor * 0.38)); // deep shadow at edge
          grad.addColorStop(0.28, stop(factor * 0.90)); // flank
          grad.addColorStop(0.50, stop(factor * 1.22)); // bright crest
          grad.addColorStop(0.72, stop(factor * 0.90)); // flank
          grad.addColorStop(1.00, stop(factor * 0.38)); // deep shadow at edge
          return grad;
        }

        // Bottom leg BL→TR: direction (1,-1)/√2; perpendicular (1,1)/√2.
        // factor 0.72 — sits underneath, faces away from the light.
        tc.lineWidth = sw;
        tc.strokeStyle = makeGrad(INV_SQ2, INV_SQ2, r1, g1, b1, 0.72);
        tc.beginPath(); tc.moveTo(x0, y1); tc.lineTo(x1, y0); tc.stroke();

        // Crossing shadow — cast by the top leg onto the bottom leg.
        // Drawn after the bottom leg but before the top leg so it sits between them.
        tc.fillStyle = "rgba(0,0,0,0.28)";
        tc.beginPath(); tc.arc(cx, cy, sw * 0.75, 0, Math.PI * 2); tc.fill();

        // Top leg TL→BR: direction (1,1)/√2; perpendicular (1,-1)/√2.
        // factor 1.15 — faces the light source (top-left).
        tc.lineWidth = sw;
        tc.strokeStyle = makeGrad(INV_SQ2, -INV_SQ2, r2, g2, b2, 1.15);
        tc.beginPath(); tc.moveTo(x0, y0); tc.lineTo(x1, y1); tc.stroke();
      } else {
        // ── Level 3: Procedural thread texture (Option A) ────────────────────
        // Each leg is drawn as SC individual strands that twist sinusoidally
        // around the leg centre line, producing a helical rope appearance.
        // All DMC threads render as cotton (default) since dmc-data.js carries
        // no material field.  Material infrastructure is present for future use.
        var SC = 2;              // strand count (2 for 14-count Aida, default)
        var SN = 20;             // sample points per strand path (smooth curve)
        var TF = 2.5;            // twist frequency — full twists per leg length
        var TA = sw * 0.3;       // twist amplitude — max perpendicular deviation
        var ISW = sw / SC * 1.2; // individual strand width (overlap factor 1.2)
        var IS_BLEND = !(r1 === r2 && g1 === g2 && b1 === b2);
        var lCX = CELL_SIZE / 2, lCY = CELL_SIZE / 2;

        // Deterministic per-strand colour variation, range −4 to +3.
        // `variant` (0–3) shifts the seed so tile variants differ visually.
        function hashVar(seed, si) {
          var h = ((seed * 1619) ^ (si * 31337)) | 0;
          h = (h ^ (h >>> 13)) * 1540483477 | 0;
          h = h ^ (h >>> 15);
          return (((h % 8) + 8) % 8) - 4;
        }

        // Build sample-point array for one strand twisted around the leg centre.
        function mkPts(lsx, lsy, lex, ley, angle, si) {
          var px = -Math.sin(angle), py = Math.cos(angle);
          var phase = si * (2 * Math.PI / SC);
          var pts = [];
          for (var n = 0; n <= SN; n++) {
            var t = n / SN;
            var off = Math.sin(t * TF * 2 * Math.PI + phase) * TA;
            pts.push(lsx + (lex - lsx) * t + px * off,
                     lsy + (ley - lsy) * t + py * off);
          }
          return pts;
        }

        // Draw one strand: soft halo pass (fibre fuzz) then solid core.
        function drawStrand3(pts, fR, fG, fBlu) {
          tc.beginPath(); tc.moveTo(pts[0], pts[1]);
          for (var k = 2; k < pts.length; k += 2) tc.lineTo(pts[k], pts[k + 1]);
          tc.lineWidth = ISW * 1.4;
          tc.strokeStyle = "rgba(" + fR + "," + fG + "," + fBlu + ",0.12)";
          tc.stroke();
          tc.beginPath(); tc.moveTo(pts[0], pts[1]);
          for (var k = 2; k < pts.length; k += 2) tc.lineTo(pts[k], pts[k + 1]);
          tc.lineWidth = ISW;
          tc.strokeStyle = "rgb(" + fR + "," + fG + "," + fBlu + ")";
          tc.stroke();
        }

        // Draw all strands for one leg.
        // colA = even strands (or solid), colB = odd strands (blend only).
        function drawLeg3(lsx, lsy, lex, ley, angle, aR, aG, aB, bR, bG, bB, bright) {
          for (var si = 0; si < SC; si++) {
            var sR, sG, sB;
            if (IS_BLEND) {
              if (si % 2 === 0) { sR = aR; sG = aG; sB = aB; }
              else              { sR = bR; sG = bG; sB = bB; }
            } else {
              var vv = hashVar(variant * 17 + si, si);
              sR = Math.min(255, Math.max(0, aR + vv));
              sG = Math.min(255, Math.max(0, aG + vv));
              sB = Math.min(255, Math.max(0, aB + vv));
            }
            var fR = Math.min(255, Math.max(0, Math.round(sR * bright)));
            var fG = Math.min(255, Math.max(0, Math.round(sG * bright)));
            var fBlu = Math.min(255, Math.max(0, Math.round(sB * bright)));
            drawStrand3(mkPts(lsx, lsy, lex, ley, angle, si), fR, fG, fBlu);
          }
        }

        tc.lineCap = "round"; tc.lineJoin = "round";

        // Bottom leg: BL→TR, angle = −π/4, brightness 0.78 (faces away from light).
        drawLeg3(x0, y1, x1, y0, -Math.PI / 4, r1, g1, b1, r2, g2, b2, 0.78);

        // Crossing fade: semi-transparent fabric disc partially occludes the bottom
        // leg at the crossing point, reinforcing top-over-bottom layering.
        tc.fillStyle = "rgba(" + FR + "," + FG + "," + FB + ",0.15)";
        tc.beginPath(); tc.arc(lCX, lCY, sw * 0.75, 0, Math.PI * 2); tc.fill();

        // Top leg: TL→BR, angle = π/4, brightness 1.15 (faces the light source).
        drawLeg3(x0, y0, x1, y1, Math.PI / 4, r2, g2, b2, r1, g1, b1, 1.15);

        // Cotton sheen highlight — thin semi-transparent white line along the
        // twisted path of the frontmost top-leg strand (12–15% opacity, matte).
        var hlPts = mkPts(x0, y0, x1, y1, Math.PI / 4, 0);
        tc.lineWidth = ISW * 0.3;
        tc.strokeStyle = "rgba(255,255,255,0.13)";
        tc.beginPath(); tc.moveTo(hlPts[0], hlPts[1]);
        for (var k = 2; k < hlPts.length; k += 2) tc.lineTo(hlPts[k], hlPts[k + 1]);
        tc.stroke();
      }
    }

    // Per-colour tile cache: each unique colour gets one CELL_SIZE×CELL_SIZE canvas
    // pre-rendered with the X geometry. Blend cells get their own key.
    var tileCache = {};

    // Level 3: material type is part of the cache key.  All DMC threads default
    // to cotton; variant (0–3) gives 4 colour-variation seeds for busy regions.
    function getTile(rgb, rgb2, variant) {
      var r1 = rgb[0], g1 = rgb[1], b1 = rgb[2];
      var r2 = rgb2 ? rgb2[0] : r1;
      var g2 = rgb2 ? rgb2[1] : g1;
      var b2 = rgb2 ? rgb2[2] : b1;
      var key = r1 + "," + g1 + "," + b1 + "|" + r2 + "," + g2 + "," + b2;
      if (lvl === 3) key += ":" + (variant | 0);
      if (tileCache[key]) return tileCache[key];
      var tileC = document.createElement("canvas");
      tileC.width = CELL_SIZE;
      tileC.height = CELL_SIZE;
      var tc = tileC.getContext("2d");
      drawCross(tc, r1, g1, b1, r2, g2, b2, variant | 0);
      tileCache[key] = tileC;
      return tileC;
    }

    // Level 3 tile variant strategy: colours appearing in ≥30 cells get up to
    // 4 tile variants (different colour-variation seeds) selected by cell position,
    // breaking up obvious repetition in large single-colour areas.
    var colourFreq = {};
    if (lvl === 3) {
      for (var ci = 0; ci < pat.length; ci++) {
        var cc = pat[ci];
        if (!cc || cc.id === "__skip__" || cc.id === "__empty__") continue;
        var cKey;
        if (cc.id && cc.id.indexOf("+") !== -1) {
          cKey = cc.id; // blend: use the combined DMC ID as key
        } else {
          var cRgb = cc.rgb;
          if (!cRgb && cmap) { var cLk = cmap[cc.id]; if (cLk) cRgb = cLk.rgb; }
          if (cRgb) cKey = cRgb[0] + "," + cRgb[1] + "," + cRgb[2];
        }
        if (cKey) colourFreq[cKey] = (colourFreq[cKey] || 0) + 1;
      }
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

      // Level 3: select tile variant (0–3) for colours present in ≥30 cells.
      var variant3 = 0;
      if (lvl === 3) {
        var vKey;
        if (cell.id && cell.id.indexOf("+") !== -1) {
          vKey = cell.id;
        } else {
          vKey = rgb[0] + "," + rgb[1] + "," + rgb[2];
        }
        if (vKey && colourFreq[vKey] >= 30) {
          variant3 = (cellCol + cellRow * 3) % 4;
        }
      }

      oc.drawImage(getTile(rgb, rgb2, variant3), cellX, cellY);
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
      " \xB7 " + (realisticLevel === 3 ? "Detailed" : realisticLevel === 2 ? "Shaded" : "Flat")
    )
  );
};
