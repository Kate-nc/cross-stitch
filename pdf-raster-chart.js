/* pdf-raster-chart.js — read a cross-stitch chart from a picture of one.
 *
 * A scanned chart, or a PDF made by printing a chart to an image, has no vector
 * grid and no text to read: the whole page is one image. The PDF importer used
 * to give up on these with "No chart pages detected". This reads the picture
 * directly:
 *
 *   grid    Ruled lines show up as thin dark lines. A profile of how much thin
 *           dark line there is at each x (and each y) is periodic across the
 *           chart; its autocorrelation gives the cell pitch, and walking out
 *           from the strongest line, one pitch at a time, finds every line
 *           until they stop — which is the edge of the chart.
 *   cells   For each cell, the median colour of its interior (a symbol drawn on
 *           top is a minority of its pixels, so the median is the cell's own
 *           colour), how much of it is ink, and a small bitmap of that ink.
 *   stitch  The chart's ground is its most common cell colour. A cell clearly
 *           different from the ground is a coloured stitch; a ground-coloured
 *           cell with ink on it is a symbol stitch; anything else is empty.
 *
 * Coloured stitches are grouped by colour. Symbol stitches are grouped by the
 * shape of their glyph, so each distinct symbol becomes one group — the
 * stitcher then has a correct chart to assign threads to, rather than a grid
 * of anonymous marks.
 *
 * Pure functions over { width, height, data } RGBA pixel data (the shape of
 * ImageData), so it runs the same in a browser and in tests. Attaches to
 * window.PdfRasterChart; CommonJS-exported too.
 */

(function () {
  'use strict';

  function lum(d, i) { return 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2]; }

  /* How much thin dark line runs through each column ('v') or row ('h'),
   * within a window. A pixel scores by how much darker it is than the pixels
   * K to either side — a line is dark and narrow; a filled cell or a block of
   * colour is dark but wide, and scores little.
   *
   * With minRun, only runs of such pixels at least that long count. A ruled
   * line runs the length of the chart; a symbol's stroke stops inside its
   * cell. Without this, a chart where many cells hold a centred '|' shows a
   * second set of lines at half the pitch, and the pitch is read as half. */
  function lineProfile(img, axis, x0, x1, y0, y1, minRun) {
    // A ruled line between two dark cells is only a little darker than they
    // are, so the bar for counting a pixel as line is set low; runs, not single
    // pixels, are what separate lines from noise.
    var W = img.width, H = img.height, d = img.data, K = 3, MIN_T = 8;
    x0 = Math.max(0, x0 | 0); y0 = Math.max(0, y0 | 0);
    x1 = Math.min(W, x1 | 0); y1 = Math.min(H, y1 | 0);
    var need = minRun || 0;
    var along = axis === 'v' ? W : H;
    var prof = new Float64Array(along);
    // For each column (v) or row (h), walk along it, accumulating runs.
    var outerA = axis === 'v' ? Math.max(x0, K) : Math.max(y0, K);
    var outerB = axis === 'v' ? Math.min(x1, W - K) : Math.min(y1, H - K);
    var innerA = axis === 'v' ? y0 : x0, innerB = axis === 'v' ? y1 : x1;
    for (var o = outerA; o < outerB; o++) {
      var runSum = 0, runLen = 0;
      for (var q = innerA; q <= innerB; q++) {
        var t = 0;
        if (q < innerB) {
          var x = axis === 'v' ? o : q, y = axis === 'v' ? q : o;
          var c = 255 - lum(d, (y * W + x) * 4);
          var a2, b2;
          if (axis === 'v') { a2 = 255 - lum(d, (y * W + x - K) * 4); b2 = 255 - lum(d, (y * W + x + K) * 4); }
          else { a2 = 255 - lum(d, ((y - K) * W + x) * 4); b2 = 255 - lum(d, ((y + K) * W + x) * 4); }
          t = c - Math.max(a2, b2);
        }
        if (t > MIN_T) { runSum += t; runLen++; }
        else {
          if (runLen && runLen >= need) prof[o] += runSum;
          runSum = 0; runLen = 0;
        }
      }
    }
    return prof;
  }

  /* The repeat distance of the strongest periodic structure in a profile, in
   * whole pixels. Of the autocorrelation peaks, the SHORTEST that is nearly as
   * strong as the best is taken, since every multiple of the true pitch also
   * correlates well. */
  function period(prof, minP, maxP) {
    var n = prof.length, mean = 0, i, L;
    // Smooth first: a pitch that is not a whole number of pixels (4.83pt at
    // 2.8x is 13.5px) puts each line half a pixel further along, and an
    // unsmoothed profile then correlates far better at twice the pitch.
    var sm = new Float64Array(n);
    for (i = 0; i < n; i++) {
      sm[i] = ((prof[i - 2] || 0) + 2 * (prof[i - 1] || 0) + 3 * prof[i] + 2 * (prof[i + 1] || 0) + (prof[i + 2] || 0)) / 9;
    }
    // Clip at a high percentile, so no single line can outweigh the grid: a
    // thick rule under a title, the length of the page, otherwise drags the
    // pitch to its distance from the chart on a chart with few lines.
    var nz = [];
    for (i = 0; i < n; i++) if (sm[i] > 0) nz.push(sm[i]);
    if (nz.length) {
      nz.sort(function (a, b) { return a - b; });
      var cap = nz[Math.floor(nz.length * 0.8)];
      for (i = 0; i < n; i++) if (sm[i] > cap) sm[i] = cap;
    }
    for (i = 0; i < n; i++) mean += sm[i];
    mean /= n || 1;
    var p = new Float64Array(n), energy = 0;
    for (i = 0; i < n; i++) { p[i] = sm[i] - mean; energy += p[i] * p[i]; }
    if (!energy) return 0;
    maxP = Math.min(maxP, Math.floor(n / 3));
    var ac = new Float64Array(maxP + 2);
    for (L = minP; L <= maxP + 1; L++) {
      var s = 0;
      for (i = 0; i + L < n; i++) s += p[i] * p[i + L];
      ac[L] = s / energy;
    }
    var best = 0;
    for (L = minP + 1; L <= maxP; L++) if (ac[L] > best) best = ac[L];
    if (best <= 0.05) return 0;
    var pick = 0;
    for (L = minP + 1; L <= maxP; L++) {
      if (ac[L] >= ac[L - 1] && ac[L] >= ac[L + 1] && ac[L] >= best * 0.8) { pick = L; break; }
    }
    if (!pick) return 0;
    // A multiple of the true pitch can still win. If a half or a third of it
    // also repeats strongly, that is the real pitch.
    for (var k = 3; k >= 2; k--) {
      var lo = Math.floor(pick / k), hi = Math.ceil(pick / k);
      if (lo < minP) continue;
      var sub = Math.max(ac[lo] || 0, ac[hi] || 0);
      if (sub >= ac[pick] * 0.5) return pick / k;
    }
    return pick;
  }

  /* Find the ruled lines: from a starting peak, step one pitch at a time each
   * way, taking the local maximum near each expected position, and stop after
   * two expected lines in a row are missing — the chart's edge.
   *
   * The start matters. The strongest peak is not always a grid line — on
   * PAT2171_2 it is the rule under the title — so a walk is tried from each of
   * the strongest few peaks and the longest run of lines wins. */
  function walkLines(prof, T) {
    var n = prof.length, i;
    if (!(T > 2)) return [];
    // Light smoothing so a two-pixel line has one peak.
    var s = new Float64Array(n);
    for (i = 0; i < n; i++) s[i] = (prof[i - 1] || 0) * 0.25 + prof[i] * 0.5 + (prof[i + 1] || 0) * 0.25;
    var r = Math.max(1, Math.round(T * 0.25));
    var peakNear = function (pos) {
      var best = -1, bv = -1;
      for (var k = Math.round(pos) - r; k <= Math.round(pos) + r; k++) {
        if (k < 0 || k >= n) continue;
        if (s[k] > bv) { bv = s[k]; best = k; }
      }
      return best < 0 ? null : { pos: best, v: bv };
    };
    var walkFrom = function (start) {
      var lines = [{ pos: start, v: s[start] }];
      var walk = function (dir) {
        var last = start, misses = 0, strengths = [s[start]], skipped = [];
        for (;;) {
          var expect = last + dir * T;
          if (expect < 0 || expect >= n) break;
          var pk = peakNear(expect);
          var med = strengths.slice().sort(function (a, b) { return a - b; })[Math.floor(strengths.length / 2)];
          if (pk && pk.v >= med * 0.25 && pk.v > 0) {
            // A line faint enough to be missed — under a dense symbol, say —
            // is still a line once the walk finds the next one beyond it.
            // Without it, the even-spacing fit read the gap as one cell and
            // stretched the pitch.
            for (var k = 0; k < skipped.length; k++) lines.push({ pos: Math.round(skipped[k]), v: 0, filled: true });
            skipped = [];
            lines.push(pk); strengths.push(pk.v); last = pk.pos; misses = 0;
          } else {
            misses++;
            if (misses >= 2) break;
            skipped.push(expect);
            last = expect;
          }
        }
      };
      walk(1); walk(-1);
      lines.sort(function (a, b) { return a.pos - b.pos; });
      return lines;
    };

    // Candidate starts: the strongest local maxima, a pitch apart at least.
    var peaks = [];
    for (i = 1; i < n - 1; i++) if (s[i] > 0 && s[i] >= s[i - 1] && s[i] >= s[i + 1]) peaks.push(i);
    peaks.sort(function (a, b) { return s[b] - s[a]; });
    var starts = [];
    for (i = 0; i < peaks.length && starts.length < 8; i++) {
      var p = peaks[i], far = true;
      for (var j = 0; j < starts.length; j++) if (Math.abs(starts[j] - p) < T) { far = false; break; }
      if (far) starts.push(p);
    }
    var lines = [];
    for (i = 0; i < starts.length; i++) {
      var got = walkFrom(starts[i]);
      if (got.length > lines.length) lines = got;
    }

    // Drop a ragged end: an end line much weaker than the rest is text or a
    // label beside the chart, not a rule.
    var vals = lines.filter(function (l) { return !l.filled; }).map(function (l) { return l.v; }).sort(function (a, b) { return a - b; });
    var median = vals[Math.floor(vals.length / 2)] || 0;
    while (lines.length > 2 && lines[0].v < median * 0.35) lines.shift();
    while (lines.length > 2 && lines[lines.length - 1].v < median * 0.35) lines.pop();
    return lines.map(function (l) { return l.pos; });
  }

  /* Fit evenly spaced lines through the detected ones: index -> position. */
  function fitLines(pos) {
    var n = pos.length;
    if (n < 2) return null;
    var sx = 0, sy = 0, sxx = 0, sxy = 0, i;
    for (i = 0; i < n; i++) { sx += i; sy += pos[i]; sxx += i * i; sxy += i * pos[i]; }
    var den = n * sxx - sx * sx;
    var pitch = (n * sxy - sx * sy) / den;
    var origin = (sy - pitch * sx) / n;
    return { origin: origin, pitch: pitch, count: n - 1 };
  }

  /* Locate the chart grid in a picture. Two passes: the second measures each
   * axis only across the extent the first found on the other, so margins,
   * titles and the key do not dilute the profile. */
  function findGrid(img, opts) {
    opts = opts || {};
    var minP = opts.minPitch || 5, maxP = opts.maxPitch || 120;
    var W = img.width, H = img.height;
    var pv = lineProfile(img, 'v', 0, W, 0, H);
    var ph = lineProfile(img, 'h', 0, W, 0, H);
    var Tx = period(pv, minP, maxP), Ty = period(ph, minP, maxP);
    if (!Tx || !Ty) return null;
    // Re-measure counting only long runs — twice the smaller pitch guess, which
    // keeps a full ruled line and drops a symbol's stroke even if that guess
    // was half the true pitch. The smaller, because a title rule or a key box
    // can throw one axis's first guess well out.
    var minRun = Math.round(2 * Math.min(Tx, Ty));
    var pvR = lineProfile(img, 'v', 0, W, 0, H, minRun);
    var phR = lineProfile(img, 'h', 0, W, 0, H, minRun);
    var TxR = period(pvR, minP, maxP), TyR = period(phR, minP, maxP);
    if (TxR && TyR) { pv = pvR; ph = phR; Tx = TxR; Ty = TyR; }
    var xs = walkLines(pv, Tx), ys = walkLines(ph, Ty);
    if (xs.length < 3 || ys.length < 3) return null;

    var run = Math.round(1.5 * Math.max(Tx, Ty));
    var pv2 = lineProfile(img, 'v', 0, W, ys[0], ys[ys.length - 1], run);
    var ph2 = lineProfile(img, 'h', xs[0], xs[xs.length - 1], 0, H, run);
    var xs2 = walkLines(pv2, period(pv2, minP, maxP) || Tx);
    var ys2 = walkLines(ph2, period(ph2, minP, maxP) || Ty);
    if (xs2.length >= 3) xs = xs2;
    if (ys2.length >= 3) ys = ys2;

    var fx = fitLines(xs), fy = fitLines(ys);
    if (!fx || !fy || fx.pitch < minP || fy.pitch < minP) return null;
    return {
      originX: fx.origin, originY: fy.origin,
      pitchX: fx.pitch, pitchY: fy.pitch,
      columns: fx.count, rows: fy.count,
      lineX: xs, lineY: ys,
    };
  }

  function median(arr) {
    if (!arr.length) return 0;
    var a = arr.slice().sort(function (x, y) { return x - y; });
    return a[Math.floor(a.length / 2)];
  }

  var SIG_DEFAULT = 12;   // glyph descriptor is SIG x SIG soft ink samples

  /* Read one cell.
   *
   * Colour: the median of a ring just inside the cell's edges. The thread
   * colour fills the whole cell but the symbol sits in its middle, so sampling
   * the middle — as a first version did — let dark or light symbols drag the
   * colour off, splitting each thread into several shades.
   *
   * Glyph: SIG x SIG samples of soft ink around the ink's own centre. Ink is
   * distance from the cell's colour, so a white symbol on a dark cell counts
   * the same as a black one on a pale cell. opts.sig sets SIG. */
  function readCell(img, x0, y0, x1, y1, opts) {
    var SIG = (opts && opts.sig) || SIG_DEFAULT;
    var W = img.width, d = img.data;
    var w = x1 - x0, h = y1 - y0, x, y, i;
    var rs = [], gs = [], bs = [], edge = [];
    for (y = Math.round(y0 + h * 0.1); y < Math.round(y1 - h * 0.1); y++) {
      for (x = Math.round(x0 + w * 0.1); x < Math.round(x1 - w * 0.1); x++) {
        var e = Math.min((x - x0) / w, (x1 - x) / w, (y - y0) / h, (y1 - y) / h);
        if (e > 0.28) continue;
        i = (y * W + x) * 4; rs.push(d[i]); gs.push(d[i + 1]); bs.push(d[i + 2]);
        edge.push(lum(d, i));
      }
    }
    var rgb = [median(rs), median(gs), median(bs)];
    var base = 0.299 * rgb[0] + 0.587 * rgb[1] + 0.114 * rgb[2];
    // What the symbol is drawn on: the commonest shade in the ring, not its
    // median. A large symbol — a filled box — reaches into the ring, and a
    // heavy grid line can fill its outer edge; either is a minority there,
    // but enough to flip the median between paper and ink from one cell to
    // the next, which inverted how the symbol read.
    var glyphBase = base;
    if (edge.length) {
      var hist = new Array(17).fill(0);
      edge.forEach(function (v) { hist[Math.min(16, v >> 4)]++; });
      var top = 0;
      for (var hb = 1; hb < 17; hb++) if (hist[hb] > hist[top]) top = hb;
      var near = edge.filter(function (v) { return Math.abs((v >> 4) - top) <= 1; });
      glyphBase = median(near);
    }

    // How much of the cell is ink: pixels far from the cell's own colour.
    var gx0 = x0 + w * 0.12, gx1 = x1 - w * 0.12, gy0 = y0 + h * 0.12, gy1 = y1 - h * 0.12;
    var all = 0, nInk = 0;
    for (y = Math.round(gy0); y < Math.round(gy1); y++) {
      for (x = Math.round(gx0); x < Math.round(gx1); x++) {
        all++;
        if (Math.abs(lum(d, (y * W + x) * 4) - base) > 60) nInk++;
      }
    }

    // The glyph, as soft ink: how far each pixel is from the cell's colour,
    // on a sliding scale rather than ink-or-not. A scan draws one symbol a
    // fraction of a pixel differently in each cell, and a hard threshold turned
    // that into whole pixels gained or lost, which hid the small differences
    // between symbols — the white shape inside a black box, the 8 and the 5.
    // Sampled around the ink's own centre, between pixels, so it does not
    // matter where in the cell the glyph landed.
    var X0 = Math.round(x0), Y0 = Math.round(y0);
    var cw = Math.max(1, Math.round(x1) - X0), ch = Math.max(1, Math.round(y1) - Y0);
    var soft = new Float64Array(cw * ch);
    var m = Math.round(Math.min(cw, ch) * 0.1);
    var sx = 0, sy = 0, sw = 0;
    for (y = 0; y < ch; y++) {
      for (x = 0; x < cw; x++) {
        var px = X0 + x, py = Y0 + y;
        if (px < 0 || py < 0 || px >= W || py >= img.height) continue;
        var v = (Math.abs(lum(d, (py * W + px) * 4) - glyphBase) - 15) / 105;
        v = v < 0 ? 0 : v > 1 ? 1 : v;
        soft[y * cw + x] = v;
        if (x >= m && y >= m && x < cw - m && y < ch - m) { sx += v * x; sy += v * y; sw += v; }
      }
    }
    var sig = new Float64Array(SIG * SIG);
    if (sw > 0) {
      // The true cell size, not the whole pixels cropped: a 17.3-pixel pitch
      // crops to 17 or 18, and scaling by that varied every glyph by 6%.
      var cx = sx / sw, cy = sy / sw, step = Math.min(w, h) * 0.8 / SIG;
      var at = function (fx, fy) {
        if (fx < 0 || fy < 0 || fx > cw - 1 || fy > ch - 1) return 0;
        var ix = Math.floor(fx), iy = Math.floor(fy), tx = fx - ix, ty = fy - iy;
        var ix1 = Math.min(cw - 1, ix + 1), iy1 = Math.min(ch - 1, iy + 1);
        return soft[iy * cw + ix] * (1 - tx) * (1 - ty) + soft[iy * cw + ix1] * tx * (1 - ty) +
               soft[iy1 * cw + ix] * (1 - tx) * ty + soft[iy1 * cw + ix1] * tx * ty;
      };
      for (var by = 0; by < SIG; by++) {
        for (var bx = 0; bx < SIG; bx++) {
          var s = 0;
          for (var q = 0; q < 4; q++) {
            s += at(cx + (bx - SIG / 2 + ((q & 1) + 0.5) / 2) * step, cy + (by - SIG / 2 + ((q >> 1) + 0.5) / 2) * step);
          }
          sig[by * SIG + bx] = s / 4;
        }
      }
    }
    return { rgb: rgb, ink: all ? nInk / all : 0, sig: sig };
  }

  function dist(a, b) {
    var dr = a[0] - b[0], dg = a[1] - b[1], db = a[2] - b[2];
    return Math.sqrt(dr * dr + dg * dg + db * db);
  }

  // Mean absolute difference of two glyph descriptors, 0 (same) to 1.
  function glyphDist(a, b) {
    var t = 0;
    for (var i = 0; i < a.length; i++) t += Math.abs(a[i] - b[i]);
    return t / a.length;
  }

  /* Group items whose features lie close together. Each joins the nearest
   * group if within 'spread' of its running mean, else starts one; then
   * groups whose means ended up close together are merged, since early
   * members can pull two halves of one group apart; then every item is
   * reassigned to its nearest group a few times over, so one that joined
   * early, before its group's mean settled, ends up where it belongs.
   * opts.minSize and opts.farApart fold away groups of a few stray cells.
   * Returns { groups: [{mean, members}], of: Map(item -> group index) }. */
  function cluster(items, featureOf, distFn, spread, opts) {
    var groups = [];
    var add = function (g, f) {
      var n = g.members.length;
      for (var i = 0; i < g.mean.length; i++) g.mean[i] = (g.mean[i] * n + f[i]) / (n + 1);
    };
    items.forEach(function (it) {
      var f = featureOf(it), best = -1, bd = Infinity;
      for (var i = 0; i < groups.length; i++) {
        var dd = distFn(f, groups[i].mean);
        if (dd < bd) { bd = dd; best = i; }
      }
      if (best < 0 || bd > spread) { groups.push({ mean: Float64Array.from(f), members: [it] }); }
      else { add(groups[best], f); groups[best].members.push(it); }
    });
    // Merge groups that converged.
    var merged = true;
    while (merged) {
      merged = false;
      for (var a = 0; a < groups.length && !merged; a++) {
        for (var b = a + 1; b < groups.length; b++) {
          if (distFn(groups[a].mean, groups[b].mean) <= spread * 0.75) {
            var ga = groups[a], gb = groups[b], na = ga.members.length, nb = gb.members.length;
            for (var i = 0; i < ga.mean.length; i++) ga.mean[i] = (ga.mean[i] * na + gb.mean[i] * nb) / (na + nb);
            ga.members = ga.members.concat(gb.members);
            groups.splice(b, 1);
            merged = true;
            break;
          }
        }
      }
    }
    for (var round = 0; round < 3 && groups.length > 1; round++) {
      var next = groups.map(function () { return []; });
      items.forEach(function (it) {
        var f = featureOf(it), best = 0, bd = Infinity;
        for (var i = 0; i < groups.length; i++) {
          var dd = distFn(f, groups[i].mean);
          if (dd < bd) { bd = dd; best = i; }
        }
        next[best].push(it);
      });
      groups = groups.map(function (g, gi) {
        var m = next[gi];
        if (!m.length) return null;
        var mean = new Float64Array(g.mean.length);
        m.forEach(function (it) { var f = featureOf(it); for (var i = 0; i < mean.length; i++) mean[i] += f[i] / m.length; });
        return { mean: mean, members: m };
      }).filter(Boolean);
    }
    // A handful of cells that formed a group of their own are usually copies
    // of a common symbol drawn badly — touched by a heavy grid line, or
    // blurred — and each one is a thread the stitcher would have to assign.
    // They join the nearest real group, cell by cell, unless they are far from
    // every one: a symbol a design uses only once or twice is still its own.
    if (opts && opts.minSize > 1) {
      var big = groups.filter(function (g) { return g.members.length >= opts.minSize; });
      if (big.length) {
        var keep = big.slice();
        groups.forEach(function (g) {
          if (g.members.length >= opts.minSize) return;
          var near = Infinity;
          big.forEach(function (b) { var dd = distFn(g.mean, b.mean); if (dd < near) near = dd; });
          if (near > opts.farApart) { keep.push(g); return; }
          g.members.forEach(function (it) {
            var f = featureOf(it), bi = 0, bd = Infinity;
            big.forEach(function (b, i) { var dd = distFn(f, b.mean); if (dd < bd) { bd = dd; bi = i; } });
            big[bi].members.push(it);
          });
        });
        groups = keep;
      }
    }
    groups.sort(function (x, y) { return y.members.length - x.members.length; });
    var of = new Map();
    groups.forEach(function (g, gi) { g.members.forEach(function (it) { of.set(it, gi); }); });
    return { groups: groups, of: of };
  }

  /* Join colour groups that are one thread split by the scan.
   *
   * A scan does not reproduce a colour evenly: a small patch of a saturated
   * blue comes out ten or twenty units off the large patches, and became a
   * thread of its own (PAT2171_2 scanned gave 16 colour groups for 9 threads).
   * Distance alone cannot join them, because two real threads can be as close
   * (453 and D225 are). But on a chart with symbols, one thread carries one
   * symbol: groups whose colours are near and whose symbols match are one
   * thread, and groups whose colours are all but identical are one regardless.
   * Splitting by symbol is not attempted — backstitch drawn across pale cells
   * changes how their symbols read. */
  function mergeBySymbol(res, inkMin) {
    var groups = res.groups;
    if (groups.length < 2) return res;
    var glyphOf = groups.map(function (g) {
      var inked = g.members.filter(function (cl) { return cl.ink >= inkMin; });
      if (inked.length < 3) return null;
      var m = new Float64Array(inked[0].sig.length);
      inked.forEach(function (cl) { for (var i = 0; i < m.length; i++) m[i] += cl.sig[i] / inked.length; });
      return m;
    });
    var parent = groups.map(function (_, i) { return i; });
    var find = function (i) { while (parent[i] !== i) { parent[i] = parent[parent[i]]; i = parent[i]; } return i; };
    for (var a = 0; a < groups.length; a++) {
      for (var b = a + 1; b < groups.length; b++) {
        var cd = dist(groups[a].mean, groups[b].mean);
        var same = cd <= 10 ||
          (cd <= 35 && glyphOf[a] && glyphOf[b] && glyphDist(glyphOf[a], glyphOf[b]) <= 0.08);
        if (same) parent[find(a)] = find(b);
      }
    }
    var joined = new Map();
    groups.forEach(function (g, i) {
      var r = find(i), j = joined.get(r);
      if (!j) { joined.set(r, { mean: Float64Array.from(g.mean), members: g.members.slice() }); return; }
      var na = j.members.length, nb = g.members.length;
      for (var k = 0; k < j.mean.length; k++) j.mean[k] = (j.mean[k] * na + g.mean[k] * nb) / (na + nb);
      j.members = j.members.concat(g.members);
    });
    var out = Array.from(joined.values()).sort(function (x, y) { return y.members.length - x.members.length; });
    var of = new Map();
    out.forEach(function (g, gi) { g.members.forEach(function (it) { of.set(it, gi); }); });
    return { groups: out, of: of };
  }

  /* Read a chart from a picture of it.
   *
   * Returns null when no grid can be found, else
   *   { grid, ground, cells: [{col,row,kind,group}], colours: [{rgb,count}],
   *     symbols: [{count}] }
   * where kind is 'colour', 'symbol' or 'empty', and group indexes colours or
   * symbols accordingly. */
  function read(img, opts) {
    opts = opts || {};
    var grid = findGrid(img, opts);
    if (!grid) return null;

    var raw = [], c, r;
    for (r = 0; r < grid.rows; r++) {
      var y0 = grid.lineY[r] !== undefined ? grid.lineY[r] : grid.originY + r * grid.pitchY;
      var y1 = grid.lineY[r + 1] !== undefined ? grid.lineY[r + 1] : y0 + grid.pitchY;
      for (c = 0; c < grid.columns; c++) {
        var x0 = grid.lineX[c] !== undefined ? grid.lineX[c] : grid.originX + c * grid.pitchX;
        var x1 = grid.lineX[c + 1] !== undefined ? grid.lineX[c + 1] : x0 + grid.pitchX;
        var cell = readCell(img, x0, y0, x1, y1);
        cell.col = c; cell.row = r;
        raw.push(cell);
      }
    }

    /* The ground: what an unstitched cell looks like. Not simply the commonest
     * cell colour — in a dense design that is a thread, and every stitch in it
     * would be read as empty. Unstitched cells carry no symbol and look like
     * paper, so the ground is the commonest colour among symbol-free cells,
     * provided it is light and nearly grey. A design covered edge to edge has
     * no such colour, and then nothing is ground but white. */
    var bins = new Map();
    raw.forEach(function (cl) {
      if (cl.ink >= 0.05) return;
      var k = (cl.rgb[0] >> 4) + ',' + (cl.rgb[1] >> 4) + ',' + (cl.rgb[2] >> 4);
      var e = bins.get(k);
      if (e) { e.n++; e.sum[0] += cl.rgb[0]; e.sum[1] += cl.rgb[1]; e.sum[2] += cl.rgb[2]; }
      else bins.set(k, { n: 1, sum: cl.rgb.slice() });
    });
    var top = null;
    bins.forEach(function (e) { if (!top || e.n > top.n) top = e; });
    var ground = [255, 255, 255];
    if (top) {
      var cand = top.sum.map(function (v) { return v / top.n; });
      var light = 0.299 * cand[0] + 0.587 * cand[1] + 0.114 * cand[2];
      var grey = Math.max(cand[0], cand[1], cand[2]) - Math.min(cand[0], cand[1], cand[2]);
      if (light >= 190 && grey <= 35) ground = cand;
    }

    var colourGap = opts.colourGap || 30, inkMin = opts.inkMin || 0.08;
    var chroma = function (c) { return Math.max(c[0], c[1], c[2]) - Math.min(c[0], c[1], c[2]); };
    // A chart printed in black and white is a symbol chart throughout. A heavy
    // glyph — a filled square, a dense hatch — turns a cell's colour grey,
    // which must not be read as a grey thread; only a chart with real colour in
    // it is read by colour.
    var chromatic = 0;
    raw.forEach(function (cl) { if (dist(cl.rgb, ground) >= colourGap && chroma(cl.rgb) >= 20) chromatic++; });
    var mono = chromatic < raw.length * 0.03;

    var kinds = raw.map(function (cl) {
      var differs = dist(cl.rgb, ground) >= colourGap;
      if (mono) return (differs || cl.ink >= inkMin) ? 'symbol' : 'empty';
      if (differs) return 'colour';
      // On a colour chart a stitch is coloured; ink on bare ground is usually
      // a backstitch line crossing it. Only a substantial mark counts, and it
      // is a stitch in a thread close to the paper — white, or a pale cream —
      // so it is grouped by colour like the rest. Grouped by symbol, PAT2171_2's
      // white stitches came apart into twenty placeholder symbols.
      return cl.ink >= 0.25 ? 'colour' : 'empty';
    });

    var colourGroups = mergeBySymbol(cluster(raw.filter(function (cl, i) { return kinds[i] === 'colour'; }),
      function (cl) { return cl.rgb; }, dist, opts.colourSpread || 18, { minSize: 3, farApart: 40 }), inkMin);
    var symbolGroups = cluster(raw.filter(function (cl, i) { return kinds[i] === 'symbol'; }),
      function (cl) { return cl.sig; }, glyphDist, opts.glyphSpread || 0.10, { minSize: 5, farApart: 0.2 });

    var cells = raw.map(function (cl, i) {
      var k = kinds[i];
      return { col: cl.col, row: cl.row, kind: k,
               group: k === 'colour' ? colourGroups.of.get(cl) : k === 'symbol' ? symbolGroups.of.get(cl) : -1 };
    });

    return {
      grid: grid,
      ground: ground.map(Math.round),
      cells: cells,
      colours: colourGroups.groups.map(function (g) { return { rgb: Array.from(g.mean).map(Math.round), count: g.members.length }; }),
      symbols: symbolGroups.groups.map(function (g) { return { count: g.members.length }; }),
      // Each cell as read, for diagnosing a scan that groups badly.
      _raw: opts.keepRaw ? { raw: raw, kinds: kinds } : undefined,
    };
  }

  var api = {
    read: read,
    findGrid: findGrid,
    // exposed for tests
    _lineProfile: lineProfile,
    _period: period,
    _walkLines: walkLines,
    _readCell: readCell,
    _cluster: cluster,
    _glyphDist: glyphDist,
  };

  if (typeof window !== 'undefined') window.PdfRasterChart = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})();
