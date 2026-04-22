/* creator/symbolFontSpec.js — Glyph spec for the embedded chart symbol font.
 *
 * Produces a deterministic list of 96 visually-distinct symbol glyphs assigned
 * to Private Use Area code points U+E000..U+E05F. The same spec is consumed by:
 *   • build-symbol-font.js   — converts the spec into assets/fonts/CrossStitchSymbols.ttf
 *   • pdf-export-worker.js   — picks a glyph for each palette entry
 *   • creator/pdfExport.js   — passes the codepoint map to the worker
 *
 * Each glyph is described by a list of drawing primitives executed in a 1000×1000
 * em square (with origin at the bottom-left). The unit interval [100..900] is the
 * "safe area"; glyphs that touch the bounds will collide with adjacent cells when
 * rendered at 8pt on a chart, so primitives stay clear of those edges.
 *
 * Primitives (intentionally tiny; the renderer is in build-symbol-font.js):
 *   { kind: "rect",   x, y, w, h, fill, stroke, sw }
 *   { kind: "circle", cx, cy, r,    fill, stroke, sw }
 *   { kind: "tri",    pts: [[x,y],...], fill, stroke, sw }
 *   { kind: "line",   x1, y1, x2, y2, sw }
 *   { kind: "ring",   cx, cy, r, sw }       // outline circle (no fill)
 *
 * No drawing primitive uses curves: opentype.js builds them out of straight
 * segments and (for circles/rings) cubic Bézier arcs handled inside the
 * generator. Keeping the spec declarative means it can be unit-tested without
 * a font runtime.
 *
 * Glyph families (16 each, 6 families = 96):
 *   00..0F  Filled solid shapes (square, triangle, diamond, …)
 *   10..1F  Outline shapes (matching family 1 but stroked)
 *   20..2F  Dotted / pip patterns
 *   30..3F  Cross / plus / x marks
 *   40..4F  Bars and chevrons (directional)
 *   50..5F  Compound / quartered shapes
 *
 * The character at U+E000 is assigned to the most-used palette entry in a
 * pattern, U+E001 to the second-most, and so on. This is deterministic and
 * means Pattern Keeper can build a thread→symbol map by scanning the legend.
 */
(function (root) {
  "use strict";

  var EM = 1000;
  var SAFE_LO = 120;          // glyphs stay within [120..880] of the em square
  var SAFE_HI = 880;
  var CTR = EM / 2;           // 500
  var SW_THIN = 60;           // stroke widths in em units (~6% em)
  var SW_MED  = 90;
  var SW_FAT  = 130;

  // ─── helpers (build-time only) ───────────────────────────────────────────
  function rect(x, y, w, h, opt) {
    return Object.assign({ kind: "rect", x: x, y: y, w: w, h: h, fill: true }, opt || {});
  }
  function ring(cx, cy, r, sw) {
    return { kind: "ring", cx: cx, cy: cy, r: r, sw: sw || SW_MED };
  }
  function disc(cx, cy, r) {
    return { kind: "circle", cx: cx, cy: cy, r: r, fill: true };
  }
  function tri(p1, p2, p3, opt) {
    return Object.assign({ kind: "tri", pts: [p1, p2, p3], fill: true }, opt || {});
  }
  function line(x1, y1, x2, y2, sw) {
    return { kind: "line", x1: x1, y1: y1, x2: x2, y2: y2, sw: sw || SW_MED };
  }

  var glyphs = [];

  // ── Family 0: filled solid shapes (16) ──────────────────────────────────
  // 00 ■ filled square
  glyphs.push({ name: "sq.fill", prims: [ rect(SAFE_LO, SAFE_LO, SAFE_HI - SAFE_LO, SAFE_HI - SAFE_LO) ] });
  // 01 ▲ up-triangle
  glyphs.push({ name: "tri.up",  prims: [ tri([CTR, SAFE_HI], [SAFE_LO, SAFE_LO], [SAFE_HI, SAFE_LO]) ] });
  // 02 ▼ down-triangle
  glyphs.push({ name: "tri.dn",  prims: [ tri([SAFE_LO, SAFE_HI], [SAFE_HI, SAFE_HI], [CTR, SAFE_LO]) ] });
  // 03 ◀ left-triangle
  glyphs.push({ name: "tri.lt",  prims: [ tri([SAFE_HI, SAFE_LO], [SAFE_HI, SAFE_HI], [SAFE_LO, CTR]) ] });
  // 04 ▶ right-triangle
  glyphs.push({ name: "tri.rt",  prims: [ tri([SAFE_LO, SAFE_LO], [SAFE_LO, SAFE_HI], [SAFE_HI, CTR]) ] });
  // 05 ◆ filled diamond
  glyphs.push({ name: "diamond.fill", prims: [
    tri([CTR, SAFE_HI], [SAFE_LO, CTR], [CTR, SAFE_LO]),
    tri([CTR, SAFE_HI], [CTR, SAFE_LO], [SAFE_HI, CTR]),
  ] });
  // 06 ● filled circle
  glyphs.push({ name: "circ.fill", prims: [ disc(CTR, CTR, 360) ] });
  // 07 ⬣ filled hexagon (approx via rectangles + tri caps)
  glyphs.push({ name: "hex.fill", prims: [
    rect(SAFE_LO + 80, CTR - 250, SAFE_HI - SAFE_LO - 160, 500),
    tri([CTR, SAFE_HI], [SAFE_LO + 80, CTR + 250], [SAFE_HI - 80, CTR + 250]),
    tri([CTR, SAFE_LO], [SAFE_LO + 80, CTR - 250], [SAFE_HI - 80, CTR - 250]),
  ] });
  // 08 ◼ small inset square
  glyphs.push({ name: "sq.inset", prims: [ rect(SAFE_LO + 60, SAFE_LO + 60, SAFE_HI - SAFE_LO - 120, SAFE_HI - SAFE_LO - 120) ] });
  // 09 ▰ tall bar
  glyphs.push({ name: "bar.v", prims: [ rect(CTR - 130, SAFE_LO, 260, SAFE_HI - SAFE_LO) ] });
  // 0A ▬ wide bar
  glyphs.push({ name: "bar.h", prims: [ rect(SAFE_LO, CTR - 130, SAFE_HI - SAFE_LO, 260) ] });
  // 0B ★ five-point star (approx via 5 triangles around a centre disc)
  glyphs.push({ name: "star5", prims: [
    disc(CTR, CTR, 130),
    tri([CTR, SAFE_HI], [CTR - 110, CTR + 80], [CTR + 110, CTR + 80]),
    tri([SAFE_HI, CTR + 100], [CTR + 90, CTR + 30], [CTR + 110, CTR - 70]),
    tri([SAFE_LO, CTR + 100], [CTR - 110, CTR - 70], [CTR - 90, CTR + 30]),
    tri([SAFE_LO + 100, SAFE_LO], [CTR - 90, CTR - 50], [CTR - 30, CTR - 130]),
    tri([SAFE_HI - 100, SAFE_LO], [CTR + 30, CTR - 130], [CTR + 90, CTR - 50]),
  ] });
  // 0C heart-ish (two discs + tri)
  glyphs.push({ name: "heart", prims: [
    disc(CTR - 150, CTR + 100, 200),
    disc(CTR + 150, CTR + 100, 200),
    tri([SAFE_LO + 50, CTR + 50], [SAFE_HI - 50, CTR + 50], [CTR, SAFE_LO]),
  ] });
  // 0D filled parallelogram (skewed bar)
  glyphs.push({ name: "para.fill", prims: [
    tri([SAFE_LO, SAFE_LO], [SAFE_LO + 250, SAFE_HI], [SAFE_HI, SAFE_HI]),
    tri([SAFE_LO, SAFE_LO], [SAFE_HI, SAFE_HI], [SAFE_HI - 250, SAFE_LO]),
  ] });
  // 0E trapezoid
  glyphs.push({ name: "trap", prims: [
    tri([SAFE_LO, SAFE_LO], [SAFE_LO + 200, SAFE_HI], [SAFE_HI - 200, SAFE_HI]),
    tri([SAFE_LO, SAFE_LO], [SAFE_HI - 200, SAFE_HI], [SAFE_HI, SAFE_LO]),
  ] });
  // 0F kite
  glyphs.push({ name: "kite", prims: [
    tri([CTR, SAFE_HI], [SAFE_LO, CTR + 80], [SAFE_HI, CTR + 80]),
    tri([SAFE_LO, CTR + 80], [CTR, SAFE_LO], [SAFE_HI, CTR + 80]),
  ] });

  // ── Family 1: outline shapes (16) ───────────────────────────────────────
  // 10 □ outline square
  glyphs.push({ name: "sq.line", prims: [
    rect(SAFE_LO, SAFE_HI - SW_MED, SAFE_HI - SAFE_LO, SW_MED),
    rect(SAFE_LO, SAFE_LO, SAFE_HI - SAFE_LO, SW_MED),
    rect(SAFE_LO, SAFE_LO, SW_MED, SAFE_HI - SAFE_LO),
    rect(SAFE_HI - SW_MED, SAFE_LO, SW_MED, SAFE_HI - SAFE_LO),
  ] });
  // 11 ○ ring
  glyphs.push({ name: "circ.ring", prims: [ ring(CTR, CTR, 340, SW_MED) ] });
  // 12 △ outline up triangle (approx via 3 strokes)
  glyphs.push({ name: "tri.up.line", prims: [
    line(CTR, SAFE_HI, SAFE_LO, SAFE_LO, SW_MED),
    line(CTR, SAFE_HI, SAFE_HI, SAFE_LO, SW_MED),
    line(SAFE_LO, SAFE_LO, SAFE_HI, SAFE_LO, SW_MED),
  ] });
  // 13 ▽ outline down triangle
  glyphs.push({ name: "tri.dn.line", prims: [
    line(SAFE_LO, SAFE_HI, SAFE_HI, SAFE_HI, SW_MED),
    line(SAFE_LO, SAFE_HI, CTR, SAFE_LO, SW_MED),
    line(SAFE_HI, SAFE_HI, CTR, SAFE_LO, SW_MED),
  ] });
  // 14 ◇ outline diamond
  glyphs.push({ name: "diamond.line", prims: [
    line(CTR, SAFE_HI, SAFE_LO, CTR, SW_MED),
    line(CTR, SAFE_HI, SAFE_HI, CTR, SW_MED),
    line(SAFE_LO, CTR, CTR, SAFE_LO, SW_MED),
    line(SAFE_HI, CTR, CTR, SAFE_LO, SW_MED),
  ] });
  // 15 ⬡ outline hexagon (six strokes)
  glyphs.push({ name: "hex.line", prims: [
    line(SAFE_LO + 80, CTR - 250, SAFE_HI - 80, CTR - 250, SW_MED),
    line(SAFE_LO + 80, CTR + 250, SAFE_HI - 80, CTR + 250, SW_MED),
    line(SAFE_LO + 80, CTR - 250, SAFE_LO + 80, CTR + 250, SW_MED),
    line(SAFE_HI - 80, CTR - 250, SAFE_HI - 80, CTR + 250, SW_MED),
    line(CTR, SAFE_HI, SAFE_LO + 80, CTR + 250, SW_MED),
    line(CTR, SAFE_HI, SAFE_HI - 80, CTR + 250, SW_MED),
    line(CTR, SAFE_LO, SAFE_LO + 80, CTR - 250, SW_MED),
    line(CTR, SAFE_LO, SAFE_HI - 80, CTR - 250, SW_MED),
  ] });
  // 16 outline parallelogram
  glyphs.push({ name: "para.line", prims: [
    line(SAFE_LO, SAFE_LO, SAFE_HI - 250, SAFE_LO, SW_MED),
    line(SAFE_HI - 250, SAFE_LO, SAFE_HI, SAFE_HI, SW_MED),
    line(SAFE_HI, SAFE_HI, SAFE_LO + 250, SAFE_HI, SW_MED),
    line(SAFE_LO + 250, SAFE_HI, SAFE_LO, SAFE_LO, SW_MED),
  ] });
  // 17 outline trapezoid
  glyphs.push({ name: "trap.line", prims: [
    line(SAFE_LO, SAFE_LO, SAFE_HI, SAFE_LO, SW_MED),
    line(SAFE_HI, SAFE_LO, SAFE_HI - 200, SAFE_HI, SW_MED),
    line(SAFE_HI - 200, SAFE_HI, SAFE_LO + 200, SAFE_HI, SW_MED),
    line(SAFE_LO + 200, SAFE_HI, SAFE_LO, SAFE_LO, SW_MED),
  ] });
  // 18 thin square
  glyphs.push({ name: "sq.line.thin", prims: [
    rect(SAFE_LO, SAFE_HI - SW_THIN, SAFE_HI - SAFE_LO, SW_THIN),
    rect(SAFE_LO, SAFE_LO, SAFE_HI - SAFE_LO, SW_THIN),
    rect(SAFE_LO, SAFE_LO, SW_THIN, SAFE_HI - SAFE_LO),
    rect(SAFE_HI - SW_THIN, SAFE_LO, SW_THIN, SAFE_HI - SAFE_LO),
  ] });
  // 19 thin ring
  glyphs.push({ name: "circ.ring.thin", prims: [ ring(CTR, CTR, 340, SW_THIN) ] });
  // 1A nested squares
  glyphs.push({ name: "sq.nested", prims: [
    rect(SAFE_LO, SAFE_HI - SW_THIN, SAFE_HI - SAFE_LO, SW_THIN),
    rect(SAFE_LO, SAFE_LO, SAFE_HI - SAFE_LO, SW_THIN),
    rect(SAFE_LO, SAFE_LO, SW_THIN, SAFE_HI - SAFE_LO),
    rect(SAFE_HI - SW_THIN, SAFE_LO, SW_THIN, SAFE_HI - SAFE_LO),
    rect(CTR - 110, CTR - 110, 220, 220),
  ] });
  // 1B nested rings
  glyphs.push({ name: "circ.nested", prims: [ ring(CTR, CTR, 340, SW_THIN), disc(CTR, CTR, 110) ] });
  // 1C double-ring
  glyphs.push({ name: "circ.dring", prims: [ ring(CTR, CTR, 340, SW_THIN), ring(CTR, CTR, 220, SW_THIN) ] });
  // 1D ring + cross dot
  glyphs.push({ name: "circ.ring.dot", prims: [ ring(CTR, CTR, 320, SW_MED), disc(CTR, CTR, 60) ] });
  // 1E square + dot
  glyphs.push({ name: "sq.line.dot", prims: [
    rect(SAFE_LO, SAFE_HI - SW_MED, SAFE_HI - SAFE_LO, SW_MED),
    rect(SAFE_LO, SAFE_LO, SAFE_HI - SAFE_LO, SW_MED),
    rect(SAFE_LO, SAFE_LO, SW_MED, SAFE_HI - SAFE_LO),
    rect(SAFE_HI - SW_MED, SAFE_LO, SW_MED, SAFE_HI - SAFE_LO),
    disc(CTR, CTR, 80),
  ] });
  // 1F outline diamond + dot
  glyphs.push({ name: "diamond.line.dot", prims: [
    line(CTR, SAFE_HI, SAFE_LO, CTR, SW_MED),
    line(CTR, SAFE_HI, SAFE_HI, CTR, SW_MED),
    line(SAFE_LO, CTR, CTR, SAFE_LO, SW_MED),
    line(SAFE_HI, CTR, CTR, SAFE_LO, SW_MED),
    disc(CTR, CTR, 70),
  ] });

  // ── Family 2: dotted / pip patterns (16) ────────────────────────────────
  function pip(cx, cy) { return disc(cx, cy, 90); }
  // 20 single centre dot
  glyphs.push({ name: "pip.1c", prims: [ pip(CTR, CTR) ] });
  // 21 two horizontal dots
  glyphs.push({ name: "pip.2h", prims: [ pip(CTR - 180, CTR), pip(CTR + 180, CTR) ] });
  // 22 two vertical dots
  glyphs.push({ name: "pip.2v", prims: [ pip(CTR, CTR + 180), pip(CTR, CTR - 180) ] });
  // 23 two diagonal dots /
  glyphs.push({ name: "pip.2d1", prims: [ pip(CTR - 180, CTR - 180), pip(CTR + 180, CTR + 180) ] });
  // 24 two diagonal dots \
  glyphs.push({ name: "pip.2d2", prims: [ pip(CTR - 180, CTR + 180), pip(CTR + 180, CTR - 180) ] });
  // 25 three horizontal dots
  glyphs.push({ name: "pip.3h", prims: [ pip(CTR - 240, CTR), pip(CTR, CTR), pip(CTR + 240, CTR) ] });
  // 26 three vertical dots
  glyphs.push({ name: "pip.3v", prims: [ pip(CTR, CTR + 240), pip(CTR, CTR), pip(CTR, CTR - 240) ] });
  // 27 four corner dots
  glyphs.push({ name: "pip.4c", prims: [
    pip(CTR - 220, CTR + 220), pip(CTR + 220, CTR + 220),
    pip(CTR - 220, CTR - 220), pip(CTR + 220, CTR - 220),
  ] });
  // 28 four edge dots (+)
  glyphs.push({ name: "pip.4e", prims: [
    pip(CTR, CTR + 240), pip(CTR + 240, CTR), pip(CTR, CTR - 240), pip(CTR - 240, CTR),
  ] });
  // 29 five dots (4 corners + centre)
  glyphs.push({ name: "pip.5", prims: [
    pip(CTR - 220, CTR + 220), pip(CTR + 220, CTR + 220),
    pip(CTR - 220, CTR - 220), pip(CTR + 220, CTR - 220),
    pip(CTR, CTR),
  ] });
  // 2A six dots (3×2)
  glyphs.push({ name: "pip.6", prims: [
    pip(CTR - 220, CTR + 200), pip(CTR, CTR + 200), pip(CTR + 220, CTR + 200),
    pip(CTR - 220, CTR - 200), pip(CTR, CTR - 200), pip(CTR + 220, CTR - 200),
  ] });
  // 2B nine dots (3×3)
  glyphs.push({ name: "pip.9", prims: [
    pip(CTR - 220, CTR + 220), pip(CTR, CTR + 220), pip(CTR + 220, CTR + 220),
    pip(CTR - 220, CTR),       pip(CTR, CTR),       pip(CTR + 220, CTR),
    pip(CTR - 220, CTR - 220), pip(CTR, CTR - 220), pip(CTR + 220, CTR - 220),
  ] });
  // 2C dot + ring
  glyphs.push({ name: "pip.ring", prims: [ pip(CTR, CTR), ring(CTR, CTR, 280, SW_THIN) ] });
  // 2D vertical pip pair w/ ring
  glyphs.push({ name: "pip.2v.ring", prims: [
    ring(CTR, CTR, 320, SW_THIN), pip(CTR, CTR + 150), pip(CTR, CTR - 150),
  ] });
  // 2E cluster of small + large dot
  glyphs.push({ name: "pip.mixed", prims: [
    disc(CTR, CTR, 150),
    pip(CTR - 250, CTR + 250), pip(CTR + 250, CTR + 250),
    pip(CTR - 250, CTR - 250), pip(CTR + 250, CTR - 250),
  ] });
  // 2F dotted ring (8 small dots arranged in circle)
  glyphs.push({ name: "pip.ring8", prims: [
    pip(CTR + 280, CTR), pip(CTR, CTR + 280), pip(CTR - 280, CTR), pip(CTR, CTR - 280),
    pip(CTR + 200, CTR + 200), pip(CTR - 200, CTR + 200),
    pip(CTR + 200, CTR - 200), pip(CTR - 200, CTR - 200),
  ] });

  // ── Family 3: cross / plus / x marks (16) ───────────────────────────────
  // 30 + plus
  glyphs.push({ name: "plus", prims: [
    rect(CTR - SW_MED / 2, SAFE_LO + 60, SW_MED, SAFE_HI - SAFE_LO - 120),
    rect(SAFE_LO + 60, CTR - SW_MED / 2, SAFE_HI - SAFE_LO - 120, SW_MED),
  ] });
  // 31 fat plus
  glyphs.push({ name: "plus.fat", prims: [
    rect(CTR - SW_FAT / 2, SAFE_LO + 60, SW_FAT, SAFE_HI - SAFE_LO - 120),
    rect(SAFE_LO + 60, CTR - SW_FAT / 2, SAFE_HI - SAFE_LO - 120, SW_FAT),
  ] });
  // 32 x cross
  glyphs.push({ name: "x", prims: [
    line(SAFE_LO + 80, SAFE_LO + 80, SAFE_HI - 80, SAFE_HI - 80, SW_MED),
    line(SAFE_LO + 80, SAFE_HI - 80, SAFE_HI - 80, SAFE_LO + 80, SW_MED),
  ] });
  // 33 fat x
  glyphs.push({ name: "x.fat", prims: [
    line(SAFE_LO + 80, SAFE_LO + 80, SAFE_HI - 80, SAFE_HI - 80, SW_FAT),
    line(SAFE_LO + 80, SAFE_HI - 80, SAFE_HI - 80, SAFE_LO + 80, SW_FAT),
  ] });
  // 34 plus + box
  glyphs.push({ name: "plus.box", prims: [
    rect(SAFE_LO, SAFE_HI - SW_THIN, SAFE_HI - SAFE_LO, SW_THIN),
    rect(SAFE_LO, SAFE_LO, SAFE_HI - SAFE_LO, SW_THIN),
    rect(SAFE_LO, SAFE_LO, SW_THIN, SAFE_HI - SAFE_LO),
    rect(SAFE_HI - SW_THIN, SAFE_LO, SW_THIN, SAFE_HI - SAFE_LO),
    rect(CTR - SW_MED / 2, SAFE_LO + 80, SW_MED, SAFE_HI - SAFE_LO - 160),
    rect(SAFE_LO + 80, CTR - SW_MED / 2, SAFE_HI - SAFE_LO - 160, SW_MED),
  ] });
  // 35 x + box
  glyphs.push({ name: "x.box", prims: [
    rect(SAFE_LO, SAFE_HI - SW_THIN, SAFE_HI - SAFE_LO, SW_THIN),
    rect(SAFE_LO, SAFE_LO, SAFE_HI - SAFE_LO, SW_THIN),
    rect(SAFE_LO, SAFE_LO, SW_THIN, SAFE_HI - SAFE_LO),
    rect(SAFE_HI - SW_THIN, SAFE_LO, SW_THIN, SAFE_HI - SAFE_LO),
    line(SAFE_LO + 80, SAFE_LO + 80, SAFE_HI - 80, SAFE_HI - 80, SW_MED),
    line(SAFE_LO + 80, SAFE_HI - 80, SAFE_HI - 80, SAFE_LO + 80, SW_MED),
  ] });
  // 36 plus + circle
  glyphs.push({ name: "plus.circle", prims: [
    ring(CTR, CTR, 340, SW_THIN),
    rect(CTR - SW_MED / 2, CTR - 220, SW_MED, 440),
    rect(CTR - 220, CTR - SW_MED / 2, 440, SW_MED),
  ] });
  // 37 x + circle
  glyphs.push({ name: "x.circle", prims: [
    ring(CTR, CTR, 340, SW_THIN),
    line(CTR - 200, CTR - 200, CTR + 200, CTR + 200, SW_MED),
    line(CTR - 200, CTR + 200, CTR + 200, CTR - 200, SW_MED),
  ] });
  // 38 asterisk (6 lines)
  glyphs.push({ name: "ast", prims: [
    line(SAFE_LO + 60, CTR, SAFE_HI - 60, CTR, SW_MED),
    line(CTR, SAFE_LO + 60, CTR, SAFE_HI - 60, SW_MED),
    line(SAFE_LO + 100, SAFE_LO + 100, SAFE_HI - 100, SAFE_HI - 100, SW_MED),
    line(SAFE_LO + 100, SAFE_HI - 100, SAFE_HI - 100, SAFE_LO + 100, SW_MED),
  ] });
  // 39 thin asterisk
  glyphs.push({ name: "ast.thin", prims: [
    line(SAFE_LO + 60, CTR, SAFE_HI - 60, CTR, SW_THIN),
    line(CTR, SAFE_LO + 60, CTR, SAFE_HI - 60, SW_THIN),
    line(SAFE_LO + 100, SAFE_LO + 100, SAFE_HI - 100, SAFE_HI - 100, SW_THIN),
    line(SAFE_LO + 100, SAFE_HI - 100, SAFE_HI - 100, SAFE_LO + 100, SW_THIN),
  ] });
  // 3A plus.thin
  glyphs.push({ name: "plus.thin", prims: [
    rect(CTR - SW_THIN / 2, SAFE_LO + 60, SW_THIN, SAFE_HI - SAFE_LO - 120),
    rect(SAFE_LO + 60, CTR - SW_THIN / 2, SAFE_HI - SAFE_LO - 120, SW_THIN),
  ] });
  // 3B x.thin
  glyphs.push({ name: "x.thin", prims: [
    line(SAFE_LO + 80, SAFE_LO + 80, SAFE_HI - 80, SAFE_HI - 80, SW_THIN),
    line(SAFE_LO + 80, SAFE_HI - 80, SAFE_HI - 80, SAFE_LO + 80, SW_THIN),
  ] });
  // 3C T mark (top bar + stem)
  glyphs.push({ name: "T", prims: [
    rect(SAFE_LO + 60, SAFE_HI - SW_FAT, SAFE_HI - SAFE_LO - 120, SW_FAT),
    rect(CTR - SW_FAT / 2, SAFE_LO + 80, SW_FAT, SAFE_HI - SAFE_LO - 200),
  ] });
  // 3D inverted T
  glyphs.push({ name: "T.inv", prims: [
    rect(SAFE_LO + 60, SAFE_LO, SAFE_HI - SAFE_LO - 120, SW_FAT),
    rect(CTR - SW_FAT / 2, SAFE_LO + SW_FAT, SW_FAT, SAFE_HI - SAFE_LO - 160),
  ] });
  // 3E H bar
  glyphs.push({ name: "H", prims: [
    rect(SAFE_LO + 80, SAFE_LO + 60, SW_FAT, SAFE_HI - SAFE_LO - 120),
    rect(SAFE_HI - 80 - SW_FAT, SAFE_LO + 60, SW_FAT, SAFE_HI - SAFE_LO - 120),
    rect(SAFE_LO + 80, CTR - SW_MED / 2, SAFE_HI - SAFE_LO - 160, SW_MED),
  ] });
  // 3F I bar (vertical with caps)
  glyphs.push({ name: "I", prims: [
    rect(SAFE_LO + 80, SAFE_HI - SW_FAT, SAFE_HI - SAFE_LO - 160, SW_FAT),
    rect(SAFE_LO + 80, SAFE_LO, SAFE_HI - SAFE_LO - 160, SW_FAT),
    rect(CTR - SW_FAT / 2, SAFE_LO + SW_FAT, SW_FAT, SAFE_HI - SAFE_LO - 2 * SW_FAT),
  ] });

  // ── Family 4: bars and chevrons (16) ────────────────────────────────────
  // 40 horizontal stripe top
  glyphs.push({ name: "stripe.top", prims: [ rect(SAFE_LO, SAFE_HI - 200, SAFE_HI - SAFE_LO, 200) ] });
  // 41 horizontal stripe bottom
  glyphs.push({ name: "stripe.bot", prims: [ rect(SAFE_LO, SAFE_LO, SAFE_HI - SAFE_LO, 200) ] });
  // 42 vertical stripe left
  glyphs.push({ name: "stripe.lt", prims: [ rect(SAFE_LO, SAFE_LO, 200, SAFE_HI - SAFE_LO) ] });
  // 43 vertical stripe right
  glyphs.push({ name: "stripe.rt", prims: [ rect(SAFE_HI - 200, SAFE_LO, 200, SAFE_HI - SAFE_LO) ] });
  // 44 diagonal slash /
  glyphs.push({ name: "slash", prims: [ line(SAFE_LO, SAFE_LO, SAFE_HI, SAFE_HI, SW_FAT) ] });
  // 45 backslash \
  glyphs.push({ name: "bslash", prims: [ line(SAFE_LO, SAFE_HI, SAFE_HI, SAFE_LO, SW_FAT) ] });
  // 46 chevron up
  glyphs.push({ name: "chev.up", prims: [
    line(SAFE_LO, CTR - 100, CTR, CTR + 200, SW_FAT),
    line(SAFE_HI, CTR - 100, CTR, CTR + 200, SW_FAT),
  ] });
  // 47 chevron down
  glyphs.push({ name: "chev.dn", prims: [
    line(SAFE_LO, CTR + 100, CTR, CTR - 200, SW_FAT),
    line(SAFE_HI, CTR + 100, CTR, CTR - 200, SW_FAT),
  ] });
  // 48 chevron left
  glyphs.push({ name: "chev.lt", prims: [
    line(CTR + 100, SAFE_HI, CTR - 200, CTR, SW_FAT),
    line(CTR + 100, SAFE_LO, CTR - 200, CTR, SW_FAT),
  ] });
  // 49 chevron right
  glyphs.push({ name: "chev.rt", prims: [
    line(CTR - 100, SAFE_HI, CTR + 200, CTR, SW_FAT),
    line(CTR - 100, SAFE_LO, CTR + 200, CTR, SW_FAT),
  ] });
  // 4A two horizontal stripes
  glyphs.push({ name: "stripe.2h", prims: [
    rect(SAFE_LO, SAFE_HI - 150, SAFE_HI - SAFE_LO, 150),
    rect(SAFE_LO, SAFE_LO, SAFE_HI - SAFE_LO, 150),
  ] });
  // 4B two vertical stripes
  glyphs.push({ name: "stripe.2v", prims: [
    rect(SAFE_LO, SAFE_LO, 150, SAFE_HI - SAFE_LO),
    rect(SAFE_HI - 150, SAFE_LO, 150, SAFE_HI - SAFE_LO),
  ] });
  // 4C three horizontal bars (equal)
  glyphs.push({ name: "stripe.3h", prims: [
    rect(SAFE_LO, SAFE_HI - 120, SAFE_HI - SAFE_LO, 120),
    rect(SAFE_LO, CTR - 60, SAFE_HI - SAFE_LO, 120),
    rect(SAFE_LO, SAFE_LO, SAFE_HI - SAFE_LO, 120),
  ] });
  // 4D three vertical bars
  glyphs.push({ name: "stripe.3v", prims: [
    rect(SAFE_LO, SAFE_LO, 120, SAFE_HI - SAFE_LO),
    rect(CTR - 60, SAFE_LO, 120, SAFE_HI - SAFE_LO),
    rect(SAFE_HI - 120, SAFE_LO, 120, SAFE_HI - SAFE_LO),
  ] });
  // 4E zig-zag
  glyphs.push({ name: "zig", prims: [
    line(SAFE_LO, CTR + 200, CTR, CTR - 200, SW_MED),
    line(CTR, CTR - 200, SAFE_HI, CTR + 200, SW_MED),
  ] });
  // 4F double slash
  glyphs.push({ name: "slash.2", prims: [
    line(SAFE_LO, SAFE_LO + 200, SAFE_HI - 200, SAFE_HI, SW_MED),
    line(SAFE_LO + 200, SAFE_LO, SAFE_HI, SAFE_HI - 200, SW_MED),
  ] });

  // ── Family 5: compound / quartered shapes (16) ──────────────────────────
  // 50 quartered square (TL+BR filled)
  glyphs.push({ name: "quart.tlbr", prims: [
    rect(SAFE_LO, CTR, (SAFE_HI - SAFE_LO) / 2, (SAFE_HI - SAFE_LO) / 2),
    rect(CTR, SAFE_LO, (SAFE_HI - SAFE_LO) / 2, (SAFE_HI - SAFE_LO) / 2),
  ] });
  // 51 TR+BL
  glyphs.push({ name: "quart.trbl", prims: [
    rect(CTR, CTR, (SAFE_HI - SAFE_LO) / 2, (SAFE_HI - SAFE_LO) / 2),
    rect(SAFE_LO, SAFE_LO, (SAFE_HI - SAFE_LO) / 2, (SAFE_HI - SAFE_LO) / 2),
  ] });
  // 52 top half filled
  glyphs.push({ name: "half.t", prims: [ rect(SAFE_LO, CTR, SAFE_HI - SAFE_LO, (SAFE_HI - SAFE_LO) / 2) ] });
  // 53 bottom half
  glyphs.push({ name: "half.b", prims: [ rect(SAFE_LO, SAFE_LO, SAFE_HI - SAFE_LO, (SAFE_HI - SAFE_LO) / 2) ] });
  // 54 left half
  glyphs.push({ name: "half.l", prims: [ rect(SAFE_LO, SAFE_LO, (SAFE_HI - SAFE_LO) / 2, SAFE_HI - SAFE_LO) ] });
  // 55 right half
  glyphs.push({ name: "half.r", prims: [ rect(CTR, SAFE_LO, (SAFE_HI - SAFE_LO) / 2, SAFE_HI - SAFE_LO) ] });
  // 56 TL triangle (half square diagonally)
  glyphs.push({ name: "halfdiag.tl", prims: [ tri([SAFE_LO, SAFE_LO], [SAFE_LO, SAFE_HI], [SAFE_HI, SAFE_HI]) ] });
  // 57 TR triangle
  glyphs.push({ name: "halfdiag.tr", prims: [ tri([SAFE_LO, SAFE_HI], [SAFE_HI, SAFE_HI], [SAFE_HI, SAFE_LO]) ] });
  // 58 BL triangle
  glyphs.push({ name: "halfdiag.bl", prims: [ tri([SAFE_LO, SAFE_LO], [SAFE_LO, SAFE_HI], [SAFE_HI, SAFE_LO]) ] });
  // 59 BR triangle
  glyphs.push({ name: "halfdiag.br", prims: [ tri([SAFE_LO, SAFE_LO], [SAFE_HI, SAFE_HI], [SAFE_HI, SAFE_LO]) ] });
  // 5A square + inner ring
  glyphs.push({ name: "sq.ring", prims: [
    rect(SAFE_LO, SAFE_HI - SW_THIN, SAFE_HI - SAFE_LO, SW_THIN),
    rect(SAFE_LO, SAFE_LO, SAFE_HI - SAFE_LO, SW_THIN),
    rect(SAFE_LO, SAFE_LO, SW_THIN, SAFE_HI - SAFE_LO),
    rect(SAFE_HI - SW_THIN, SAFE_LO, SW_THIN, SAFE_HI - SAFE_LO),
    ring(CTR, CTR, 200, SW_THIN),
  ] });
  // 5B circle + inner cross
  glyphs.push({ name: "circ.cross", prims: [
    disc(CTR, CTR, 320),
    rect(CTR - 50, CTR - 200, 100, 400, { fill: true }),
  ] });
  // 5C diamond + dot
  glyphs.push({ name: "diamond.dot", prims: [
    tri([CTR, SAFE_HI], [SAFE_LO, CTR], [CTR, SAFE_LO]),
    tri([CTR, SAFE_HI], [CTR, SAFE_LO], [SAFE_HI, CTR]),
    disc(CTR, CTR, 80),
  ] });
  // 5D triangle + dot
  glyphs.push({ name: "tri.up.dot", prims: [
    tri([CTR, SAFE_HI], [SAFE_LO, SAFE_LO], [SAFE_HI, SAFE_LO]),
    disc(CTR, SAFE_LO + 200, 80),
  ] });
  // 5E split square (top filled, bottom outline)
  glyphs.push({ name: "split.tb", prims: [
    rect(SAFE_LO, CTR, SAFE_HI - SAFE_LO, (SAFE_HI - SAFE_LO) / 2),
    rect(SAFE_LO, SAFE_LO, SAFE_HI - SAFE_LO, SW_THIN),
    rect(SAFE_LO, SAFE_LO, SW_THIN, (SAFE_HI - SAFE_LO) / 2),
    rect(SAFE_HI - SW_THIN, SAFE_LO, SW_THIN, (SAFE_HI - SAFE_LO) / 2),
  ] });
  // 5F split square (left filled, right outline)
  glyphs.push({ name: "split.lr", prims: [
    rect(SAFE_LO, SAFE_LO, (SAFE_HI - SAFE_LO) / 2, SAFE_HI - SAFE_LO),
    rect(CTR, SAFE_HI - SW_THIN, (SAFE_HI - SAFE_LO) / 2, SW_THIN),
    rect(CTR, SAFE_LO, (SAFE_HI - SAFE_LO) / 2, SW_THIN),
    rect(SAFE_HI - SW_THIN, SAFE_LO, SW_THIN, SAFE_HI - SAFE_LO),
  ] });

  // Validation: 96 glyphs, every glyph has at least one primitive
  if (glyphs.length !== 96) {
    throw new Error("symbolFontSpec: expected 96 glyphs, got " + glyphs.length);
  }

  var BASE_CODEPOINT = 0xE000; // PUA start
  var spec = {
    em: EM,
    ascent: 800,
    descent: 200,
    fontFamily: "CrossStitchSymbols",
    baseCodepoint: BASE_CODEPOINT,
    glyphs: glyphs.map(function (g, i) {
      return { codepoint: BASE_CODEPOINT + i, name: g.name, prims: g.prims };
    }),
  };

  // Convenience: just the codepoints in assignment order.
  spec.codepoints = spec.glyphs.map(function (g) { return g.codepoint; });

  // ─── exports ──────────────────────────────────────────────────────────────
  if (typeof module !== "undefined" && module.exports) {
    module.exports = spec;            // for build-symbol-font.js + Jest
  }
  if (root && typeof root === "object") {
    root.SYMBOL_FONT_SPEC = spec;     // for browser / worker
  }
})(typeof self !== "undefined" ? self : (typeof window !== "undefined" ? window : globalThis));
