// mergeEdgeBlendColours (colour-utils.js) — folds anti-aliasing shades of a
// flat graphic into the colours they blend between (audit IMG-01: logo.png
// came out as 12 threads with the default settings; it should be 8 or fewer).
global.window = global.window || global;
const { mergeEdgeBlendColours } = require('../colour-utils.js');

const RED = { id: '349', type: 'solid', rgb: [210, 16, 52], lab: [45, 70, 40] };
const NAVY = { id: '820', type: 'solid', rgb: [14, 54, 92], lab: [22, 5, -30] };
const BLEND = { id: '3328', type: 'solid', rgb: [112, 35, 72], lab: [33.5, 37.5, 5] };   // halfway RED–NAVY
const PINK = { id: '3713', type: 'solid', rgb: [255, 200, 200], lab: [72, 35, 20] };     // halfway RED–white
const SKIP = { type: 'skip', id: '__skip__', rgb: [255, 255, 255], lab: [100, 0, 0] };

function grid(w, h, fn) { const a = []; for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) a.push(fn(x, y)); return a; }
const ids = (m) => Array.from(new Set(m.map((c) => c.id))).sort();

describe('mergeEdgeBlendColours', () => {
  test('a one-stitch seam between two main colours folds into them', () => {
    const m = grid(40, 40, (x) => (x < 19 ? RED : x === 19 ? BLEND : NAVY));
    expect(mergeEdgeBlendColours(m, 40, 40)).toBe(1);
    expect(ids(m)).toEqual(['349', '820']);
  });

  test('an anti-aliased rim against the skipped background becomes background or the main colour', () => {
    const m = grid(60, 60, (x) => (x < 29 ? RED : x === 29 ? PINK : SKIP));
    expect(mergeEdgeBlendColours(m, 60, 60, { bgLab: [100, 0, 0] })).toBe(1);
    expect(ids(m)).toEqual(['349', '__skip__']);
  });

  test('without a background to blend with, the rim is kept', () => {
    const m = grid(60, 60, (x) => (x < 29 ? RED : x === 29 ? PINK : NAVY));
    expect(mergeEdgeBlendColours(m, 60, 60)).toBe(0);
    expect(ids(m)).toContain('3713');
  });

  test('a wide band of the in-between shade (photo-like shading) is kept', () => {
    const m = grid(40, 40, (x) => (x < 18 ? RED : x < 21 ? BLEND : NAVY));
    // 3 columns wide: only its two outer columns touch another colour.
    expect(mergeEdgeBlendColours(m, 40, 40)).toBe(0);
    expect(ids(m)).toContain('3328');
  });

  test('a minor colour that is not a blend of the main colours is kept', () => {
    const GOLD = { id: '742', type: 'solid', rgb: [255, 190, 70], lab: [80, 15, 65] };
    const m = grid(40, 40, (x) => (x < 19 ? RED : x === 19 ? GOLD : NAVY));
    expect(mergeEdgeBlendColours(m, 40, 40)).toBe(0);
  });

  test('a colour above 5% of the stitches is never folded', () => {
    const m = grid(20, 20, (x) => (x < 9 ? RED : x === 9 ? BLEND : NAVY));  // BLEND is 5% exactly
    expect(mergeEdgeBlendColours(m, 20, 20)).toBe(0);
  });

  test('empty input is a no-op', () => {
    expect(mergeEdgeBlendColours([], 0, 0)).toBe(0);
    expect(mergeEdgeBlendColours(grid(4, 4, () => SKIP), 4, 4)).toBe(0);
  });
});
