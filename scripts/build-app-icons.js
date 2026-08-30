#!/usr/bin/env node
// Rasterises the app icon to PNG.
//
// Why this exists: assets/icons/app-icon.svg is the only icon the manifest
// ships, and iOS ignores SVG entirely for `apple-touch-icon`. Without a PNG an
// installed Home Screen web app gets a screenshot of the page as its icon,
// which makes the install look broken — and installing is the only way to stop
// iPadOS evicting the pattern library after a week of inactivity, so the
// install has to look trustworthy.
//
// The geometry is redrawn here rather than rasterised from the SVG so the
// script has no SVG-rendering dependency (node-canvas ships without librsvg on
// several platforms). Keep it in step with assets/icons/app-icon.svg — the
// coordinates below are that file's, on its 512-unit viewBox.
//
//   node scripts/build-app-icons.js

const fs = require('fs');
const path = require('path');
const { createCanvas } = require('canvas');

const OUT_DIR = path.join(__dirname, '..', 'assets', 'icons');
const VIEWBOX = 512;
const BACKGROUND = '#FBF8F3';
const STROKE = '#B85C38';

// From app-icon.svg: <g transform="translate(51 51)" stroke-width="32">
const OFFSET = 51;
const STROKE_WIDTH = 32;
const LINES = [
  // Cross-stitch X glyph
  [64, 64, 346, 346],
  [346, 64, 64, 346],
  // Corner anchor stitches forming a frame
  [64, 64, 96, 64],
  [64, 64, 64, 96],
  [346, 64, 314, 64],
  [346, 64, 346, 96],
  [64, 346, 96, 346],
  [64, 346, 64, 314],
  [346, 346, 314, 346],
  [346, 346, 346, 314],
];

function render(size) {
  const canvas = createCanvas(size, size);
  const ctx = canvas.getContext('2d');
  const k = size / VIEWBOX;

  ctx.fillStyle = BACKGROUND;
  ctx.fillRect(0, 0, size, size);

  ctx.strokeStyle = STROKE;
  ctx.lineWidth = STROKE_WIDTH * k;
  ctx.lineCap = 'round';
  for (const [x1, y1, x2, y2] of LINES) {
    ctx.beginPath();
    ctx.moveTo((x1 + OFFSET) * k, (y1 + OFFSET) * k);
    ctx.lineTo((x2 + OFFSET) * k, (y2 + OFFSET) * k);
    ctx.stroke();
  }
  return canvas.toBuffer('image/png');
}

// 180 is the apple-touch-icon size iOS actually asks for; 192 and 512 are the
// sizes the web app manifest spec recommends for Android/Chrome installs.
const SIZES = [180, 192, 512];

function main() {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  for (const size of SIZES) {
    const file = path.join(OUT_DIR, `app-icon-${size}.png`);
    fs.writeFileSync(file, render(size));
    console.log(`wrote ${path.relative(path.join(__dirname, '..'), file)} (${size}x${size})`);
  }
}

if (require.main === module) main();
module.exports = { render, SIZES };
