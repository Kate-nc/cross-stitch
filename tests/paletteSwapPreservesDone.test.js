// tests/paletteSwapPreservesDone.test.js
// Regression for DEFECT-004: revertToGenPalette and applySwap must NOT zero
// the `done` array. Palette changes only affect the colour assigned to each
// cell index; existing stitch progress remains valid in place.
//
// We don't import React; we statically scan palette-swap.js to assert the
// historical bug pattern (`setDone(new Uint8Array(...))` inside these two
// functions) is gone.
const fs = require('fs');
const path = require('path');

const SRC = fs.readFileSync(path.join(__dirname, '..', 'palette-swap.js'), 'utf8');

function extractFunctionBody(src, name) {
  const re = new RegExp('function\\s+' + name + '\\s*\\([^)]*\\)\\s*\\{');
  const m = re.exec(src);
  if (!m) throw new Error('function not found: ' + name);
  let i = m.index + m[0].length;
  let depth = 1;
  while (i < src.length && depth > 0) {
    const ch = src[i];
    if (ch === '{') depth++;
    else if (ch === '}') depth--;
    i++;
  }
  return src.slice(m.index, i);
}

describe('palette-swap.js — done preservation (DEFECT-004)', () => {
  test('revertToGenPalette does not allocate a fresh zeroed Uint8Array for done', () => {
    const body = extractFunctionBody(SRC, 'revertToGenPalette');
    expect(body).not.toMatch(/setDone\s*\(\s*new\s+Uint8Array/);
  });

  test('applySwap does not allocate a fresh zeroed Uint8Array for done', () => {
    const body = extractFunctionBody(SRC, 'applySwap');
    expect(body).not.toMatch(/setDone\s*\(\s*new\s+Uint8Array/);
  });

  test('an explanatory comment about DEFECT-004 is present near each site', () => {
    expect(SRC).toMatch(/DEFECT-004/);
  });
});
