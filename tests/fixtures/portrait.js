// A synthetic portrait (eyes, eyebrows, nose, mouth and a skin gradient)
// for browser tests that need a face, not an external photograph.
// Formerly in scripts/bug-hunt-usm.js.
'use strict';
const { createCanvas } = require('canvas');
function makePortrait(W, H) {
  const c = createCanvas(W, H);
  const ctx = c.getContext('2d');

  // Background
  ctx.fillStyle = '#e8d5b7';
  ctx.fillRect(0, 0, W, H);

  // Face oval (skin)
  const grad = ctx.createRadialGradient(W/2, H/2, W*0.1, W/2, H/2, W*0.45);
  grad.addColorStop(0, '#f4c89a');
  grad.addColorStop(1, '#c8905a');
  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.ellipse(W/2, H/2, W*0.35, H*0.45, 0, 0, Math.PI*2);
  ctx.fill();

  // Eyes — small dark ellipses with detail inside
  function eye(cx, cy) {
    ctx.fillStyle = '#fff';
    ctx.beginPath();
    ctx.ellipse(cx, cy, W*0.06, H*0.04, 0, 0, Math.PI*2);
    ctx.fill();
    ctx.fillStyle = '#3a200a';
    ctx.beginPath();
    ctx.ellipse(cx, cy, W*0.035, H*0.025, 0, 0, Math.PI*2);
    ctx.fill();
    // Specular highlight
    ctx.fillStyle = '#fff';
    ctx.beginPath();
    ctx.ellipse(cx + W*0.01, cy - H*0.008, W*0.008, H*0.006, 0, 0, Math.PI*2);
    ctx.fill();
  }
  eye(W*0.38, H*0.42);
  eye(W*0.62, H*0.42);

  // Eyebrows — thin dark arcs
  ctx.strokeStyle = '#4a2a10';
  ctx.lineWidth = Math.max(1, W * 0.012);
  ctx.beginPath();
  ctx.arc(W*0.38, H*0.37, W*0.07, Math.PI*1.15, Math.PI*1.85);
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(W*0.62, H*0.37, W*0.07, Math.PI*1.15, Math.PI*1.85);
  ctx.stroke();

  // Nose — simple line shape
  ctx.strokeStyle = '#c8905a';
  ctx.lineWidth = Math.max(1, W * 0.008);
  ctx.beginPath();
  ctx.moveTo(W*0.5, H*0.44);
  ctx.lineTo(W*0.48, H*0.55);
  ctx.lineTo(W*0.44, H*0.56);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(W*0.5, H*0.44);
  ctx.lineTo(W*0.52, H*0.55);
  ctx.lineTo(W*0.56, H*0.56);
  ctx.stroke();

  // Mouth
  ctx.strokeStyle = '#b06040';
  ctx.lineWidth = Math.max(1, W * 0.012);
  ctx.beginPath();
  ctx.arc(W*0.5, H*0.63, W*0.1, 0, Math.PI);
  ctx.stroke();

  // Hair
  ctx.fillStyle = '#3a200a';
  ctx.beginPath();
  ctx.ellipse(W/2, H*0.22, W*0.3, H*0.15, 0, 0, Math.PI*2);
  ctx.fill();

  return c;
}

module.exports = { makePortrait };
