#!/usr/bin/env node
/* build-symbol-font.js — Generate the embedded chart symbol font.
 *
 * Run:
 *   npm install opentype.js   (one-off; opentype.js is a devDependency)
 *   node build-symbol-font.js
 *
 * Outputs:
 *   assets/fonts/CrossStitchSymbols.ttf       — the TTF (committed to repo)
 *   assets/fonts/CrossStitchSymbols.base64.js — same bytes as base64; exposes
 *                                               window.CROSS_STITCH_SYMBOL_FONT_B64
 *
 * The base64 file is what the PDF export Web Worker imports via importScripts(),
 * because workers can't access localStorage and we want the font available
 * synchronously without a fetch (works on file:// too).
 *
 * Important: the font is built without subsetting markers — Pattern Keeper
 * relies on the cmap being intact, so we ship every glyph in every PDF.
 */

const fs = require("fs");
const path = require("path");

let opentype;
try {
  opentype = require("opentype.js");
} catch (e) {
  console.error("\nopentype.js is required.  Install with: npm install --save-dev opentype.js\n");
  process.exit(1);
}

const spec = require("./creator/symbolFontSpec.js");

const EM = spec.em;
const ASCENT = spec.ascent;
const DESCENT = spec.descent;

// ─── primitive → opentype.js Path ────────────────────────────────────────
// All glyphs are drawn in a coordinate system where (0, 0) is the bottom-left
// of the em square and y grows upward — exactly the spec format. opentype.js
// uses the same convention for outlines (y is positive going up in font units).

function pathRect(p, x, y, w, h) {
  // Counter-clockwise winding for filled outline (TTF non-zero / even-odd both fine).
  p.moveTo(x, y);
  p.lineTo(x + w, y);
  p.lineTo(x + w, y + h);
  p.lineTo(x, y + h);
  p.closePath();
}

function pathTri(p, pts) {
  p.moveTo(pts[0][0], pts[0][1]);
  p.lineTo(pts[1][0], pts[1][1]);
  p.lineTo(pts[2][0], pts[2][1]);
  p.closePath();
}

function pathLine(p, x1, y1, x2, y2, sw) {
  // Thicken a line into a rectangle with rounded ends (octagonal end caps).
  const dx = x2 - x1;
  const dy = y2 - y1;
  const len = Math.sqrt(dx * dx + dy * dy);
  if (len < 1) return;
  const nx = -dy / len;   // unit normal
  const ny = dx / len;
  const ox = nx * sw / 2; // half-width offset perpendicular to the line
  const oy = ny * sw / 2;
  p.moveTo(x1 + ox, y1 + oy);
  p.lineTo(x2 + ox, y2 + oy);
  p.lineTo(x2 - ox, y2 - oy);
  p.lineTo(x1 - ox, y1 - oy);
  p.closePath();
}

// Approximate a circle with four cubic Bézier curves (industry standard).
const KAPPA = 0.5522847498;

function pathCircle(p, cx, cy, r) {
  const k = r * KAPPA;
  p.moveTo(cx - r, cy);
  p.bezierCurveTo(cx - r, cy + k, cx - k, cy + r, cx, cy + r);
  p.bezierCurveTo(cx + k, cy + r, cx + r, cy + k, cx + r, cy);
  p.bezierCurveTo(cx + r, cy - k, cx + k, cy - r, cx, cy - r);
  p.bezierCurveTo(cx - k, cy - r, cx - r, cy - k, cx - r, cy);
  p.closePath();
}

function pathRing(p, cx, cy, r, sw) {
  // Outer circle CW, inner circle CCW so the ring fills as expected.
  const ro = r;
  const ri = Math.max(1, r - sw);
  // outer (clockwise)
  const ko = ro * KAPPA;
  p.moveTo(cx - ro, cy);
  p.bezierCurveTo(cx - ro, cy + ko, cx - ko, cy + ro, cx, cy + ro);
  p.bezierCurveTo(cx + ko, cy + ro, cx + ro, cy + ko, cx + ro, cy);
  p.bezierCurveTo(cx + ro, cy - ko, cx + ko, cy - ro, cx, cy - ro);
  p.bezierCurveTo(cx - ko, cy - ro, cx - ro, cy - ko, cx - ro, cy);
  p.closePath();
  // inner (counter-clockwise = reverse direction)
  const ki = ri * KAPPA;
  p.moveTo(cx - ri, cy);
  p.bezierCurveTo(cx - ri, cy - ki, cx - ki, cy - ri, cx, cy - ri);
  p.bezierCurveTo(cx + ki, cy - ri, cx + ri, cy - ki, cx + ri, cy);
  p.bezierCurveTo(cx + ri, cy + ki, cx + ki, cy + ri, cx, cy + ri);
  p.bezierCurveTo(cx - ki, cy + ri, cx - ri, cy + ki, cx - ri, cy);
  p.closePath();
}

function buildPath(prims) {
  const p = new opentype.Path();
  for (const prim of prims) {
    switch (prim.kind) {
      case "rect":   pathRect(p, prim.x, prim.y, prim.w, prim.h); break;
      case "tri":    pathTri(p, prim.pts); break;
      case "line":   pathLine(p, prim.x1, prim.y1, prim.x2, prim.y2, prim.sw); break;
      case "circle": pathCircle(p, prim.cx, prim.cy, prim.r); break;
      case "ring":   pathRing(p, prim.cx, prim.cy, prim.r, prim.sw); break;
      default: throw new Error("Unknown primitive kind: " + prim.kind);
    }
  }
  return p;
}

// ─── build glyph list ────────────────────────────────────────────────────
const glyphs = [];

// glyph 0: .notdef — required by every TTF. Empty box.
{
  const p = new opentype.Path();
  pathRect(p, 50, 50, EM - 100, EM - 100);
  glyphs.push(new opentype.Glyph({
    name: ".notdef",
    unicode: 0,
    advanceWidth: EM,
    path: p,
  }));
}

// glyph 1: space — selectable but invisible.
{
  glyphs.push(new opentype.Glyph({
    name: "space",
    unicode: 0x20,
    advanceWidth: EM,
    path: new opentype.Path(),
  }));
}

for (const g of spec.glyphs) {
  glyphs.push(new opentype.Glyph({
    name: g.name,
    unicode: g.codepoint,
    advanceWidth: EM,
    path: buildPath(g.prims),
  }));
}

const font = new opentype.Font({
  familyName: spec.fontFamily,
  styleName: "Regular",
  unitsPerEm: EM,
  ascender: ASCENT,
  descender: -DESCENT,        // opentype.js uses negative descender
  glyphs: glyphs,
});

// ─── write outputs ───────────────────────────────────────────────────────
const outDir = path.join("assets", "fonts");
fs.mkdirSync(outDir, { recursive: true });

const ttfPath = path.join(outDir, "CrossStitchSymbols.ttf");
const arrayBuffer = font.toArrayBuffer();
const ttfBuf = Buffer.from(arrayBuffer);
fs.writeFileSync(ttfPath, ttfBuf);

// Sanity-check the magic number at offset 0 (TTF: 00 01 00 00).
if (!(ttfBuf[0] === 0x00 && ttfBuf[1] === 0x01 && ttfBuf[2] === 0x00 && ttfBuf[3] === 0x00) &&
    !(ttfBuf[0] === 0x4F && ttfBuf[1] === 0x54 && ttfBuf[2] === 0x54 && ttfBuf[3] === 0x4F)) {
  console.warn("WARNING: TTF magic number unexpected (" +
    ttfBuf.slice(0, 4).toString("hex") + ")");
}

const b64 = ttfBuf.toString("base64");
const b64Path = path.join(outDir, "CrossStitchSymbols.base64.js");
const b64Js =
  "/* assets/fonts/CrossStitchSymbols.base64.js — AUTO-GENERATED by build-symbol-font.js.\n" +
  "   Loaded as a regular <script> on the main thread and via importScripts() inside\n" +
  "   pdf-export-worker.js. Exposes the font bytes synchronously so the worker can\n" +
  "   embed the font without a network fetch (works on file:// too). */\n" +
  "(function (root) {\n" +
  '  root.CROSS_STITCH_SYMBOL_FONT_B64 = "' + b64 + '";\n' +
  "})(typeof self !== \"undefined\" ? self : (typeof window !== \"undefined\" ? window : globalThis));\n";
fs.writeFileSync(b64Path, b64Js);

console.log("Wrote " + ttfPath + " (" + ttfBuf.length + " bytes, " + glyphs.length + " glyphs)");
console.log("Wrote " + b64Path + " (" + b64.length + " base64 chars)");
