/* tests/canvasResize.test.js ─────────────────────────────────────────────
   Unit tests for creator/canvasResize.js.
   Follows the fs.readFileSync + eval() pattern used across this test suite.
   ─────────────────────────────────────────────────────────────────────────── */

const fs = require('fs');

// The source file uses window.applyCanvasResize = function(...).
// Provide a minimal window mock and eval the module.
const raw = fs.readFileSync('./creator/canvasResize.js', 'utf8');
const window = {};
eval(raw); // eslint-disable-line no-eval
const applyCanvasResize = window.applyCanvasResize;

// ── Helpers ─────────────────────────────────────────────────────────────────

/** Build a flat pattern array of width × height, each cell {id:"X"} */
function makePattern(w, h, idPrefix) {
  const p = [];
  for (let r = 0; r < h; r++) {
    for (let c = 0; c < w; c++) {
      p.push({ id: (idPrefix || 'c') + '_' + r + '_' + c, type: 'solid', rgb: [0,0,0] });
    }
  }
  return p;
}

/** Get cell by (col, row) from a pattern of given width */
function cell(pat, w, col, row) {
  return pat[row * w + col];
}

/** Make a Uint8Array done array filled with a constant value */
function makeDone(w, h, val) {
  const d = new Uint8Array(w * h);
  if (val) d.fill(val);
  return d;
}

/** Collect all non-empty ids from newPat */
function idsInNewPat(newPat) {
  return newPat
    .filter(c => c.id !== '__empty__' && c.id !== '__skip__')
    .map(c => c.id);
}

// ── Validation tests ─────────────────────────────────────────────────────────

describe('applyCanvasResize — validation', () => {
  const pat = makePattern(3, 3);

  test('returns null when spec is missing', () => {
    expect(applyCanvasResize(pat, [], null, new Map(), [], 3, 3, null)).toBeNull();
  });

  test('returns null when newW < 1', () => {
    expect(applyCanvasResize(pat, [], null, new Map(), [], 3, 3, { newW: 0, newH: 3, offsetX: 0, offsetY: 0 })).toBeNull();
  });

  test('returns null when newH < 1', () => {
    expect(applyCanvasResize(pat, [], null, new Map(), [], 3, 3, { newW: 3, newH: 0, offsetX: 0, offsetY: 0 })).toBeNull();
  });

  test('returns null when newW is non-integer', () => {
    expect(applyCanvasResize(pat, [], null, new Map(), [], 3, 3, { newW: 2.5, newH: 3, offsetX: 0, offsetY: 0 })).toBeNull();
  });

  test('returns null when newH is non-integer', () => {
    expect(applyCanvasResize(pat, [], null, new Map(), [], 3, 3, { newW: 3, newH: 2.5, offsetX: 0, offsetY: 0 })).toBeNull();
  });

  test('returns null when offsetX is non-integer', () => {
    expect(applyCanvasResize(pat, [], null, new Map(), [], 3, 3, { newW: 3, newH: 3, offsetX: 0.5, offsetY: 0 })).toBeNull();
  });

  test('returns null when offsetY is non-integer', () => {
    expect(applyCanvasResize(pat, [], null, new Map(), [], 3, 3, { newW: 3, newH: 3, offsetX: 0, offsetY: 1.5 })).toBeNull();
  });

  test('returns null when pat is not an array', () => {
    expect(applyCanvasResize(null, [], null, new Map(), [], 3, 3, { newW: 3, newH: 3, offsetX: 0, offsetY: 0 })).toBeNull();
  });
});

// ── Identity transform ────────────────────────────────────────────────────────

describe('applyCanvasResize — identity', () => {
  test('identity: same dimensions, zero offset, all cells preserved', () => {
    const pat = makePattern(4, 3);
    const result = applyCanvasResize(pat, [], null, new Map(), [], 4, 3, { newW: 4, newH: 3, offsetX: 0, offsetY: 0 });

    expect(result).not.toBeNull();
    expect(result.newPat.length).toBe(4 * 3);
    expect(result.deletedStitchCount).toBe(0);
    for (let r = 0; r < 3; r++) {
      for (let c = 0; c < 4; c++) {
        expect(cell(result.newPat, 4, c, r).id).toBe(cell(pat, 4, c, r).id);
      }
    }
  });
});

// ── Crop (shrink) tests ───────────────────────────────────────────────────────

describe('applyCanvasResize — crop', () => {
  test('crop top-left: remove first 2 cols and 3 rows', () => {
    // 5×5 source; crop to 3×2 removing left 2 cols and top 3 rows
    const pat = makePattern(5, 5);
    const result = applyCanvasResize(pat, [], null, new Map(), [], 5, 5, {
      newW: 3, newH: 2, offsetX: -2, offsetY: -3
    });

    expect(result).not.toBeNull();
    expect(result.newPat.length).toBe(3 * 2);

    // Old cell (col=2, row=3) → newCol=0, newRow=0
    expect(cell(result.newPat, 3, 0, 0).id).toBe(cell(pat, 5, 2, 3).id);
    // Old cell (col=4, row=4) → newCol=2, newRow=1
    expect(cell(result.newPat, 3, 2, 1).id).toBe(cell(pat, 5, 4, 4).id);
  });

  test('crop bottom-right: trim 2 cols from right and 2 rows from bottom', () => {
    const pat = makePattern(6, 4);
    const result = applyCanvasResize(pat, [], null, new Map(), [], 6, 4, {
      newW: 4, newH: 2, offsetX: 0, offsetY: 0
    });

    expect(result.newPat.length).toBe(4 * 2);
    expect(result.deletedStitchCount).toBe(6 * 4 - 4 * 2);
    // Top-left corner should match
    expect(cell(result.newPat, 4, 0, 0).id).toBe(cell(pat, 6, 0, 0).id);
    // Old cell (col=4, row=0) should be absent in new (it was at col=4 ≥ newW=4)
    expect(cell(result.newPat, 4, 3, 0).id).toBe(cell(pat, 6, 3, 0).id);
  });

  test('all cells cropped out produces all-empty result', () => {
    const pat = makePattern(3, 3);
    const result = applyCanvasResize(pat, [], null, new Map(), [], 3, 3, {
      newW: 3, newH: 3, offsetX: 100, offsetY: 100 // old content far outside new bounds
    });

    expect(result).not.toBeNull();
    expect(result.deletedStitchCount).toBe(9);
    result.newPat.forEach(c => expect(c.id).toBe('__empty__'));
  });

  test('1×1 minimum canvas', () => {
    const pat = makePattern(5, 5);
    const result = applyCanvasResize(pat, [], null, new Map(), [], 5, 5, {
      newW: 1, newH: 1, offsetX: 0, offsetY: 0
    });

    expect(result).not.toBeNull();
    expect(result.newPat.length).toBe(1);
    expect(result.newPat[0].id).toBe(cell(pat, 5, 0, 0).id);
  });
});

// ── Expand tests ──────────────────────────────────────────────────────────────

describe('applyCanvasResize — expand', () => {
  test('add 5 blank columns to the right', () => {
    const pat = makePattern(4, 3);
    const result = applyCanvasResize(pat, [], null, new Map(), [], 4, 3, {
      newW: 9, newH: 3, offsetX: 0, offsetY: 0
    });

    expect(result.newPat.length).toBe(9 * 3);
    expect(result.deletedStitchCount).toBe(0);

    // Old cells in their original positions
    for (let r = 0; r < 3; r++) {
      for (let c = 0; c < 4; c++) {
        expect(cell(result.newPat, 9, c, r).id).toBe(cell(pat, 4, c, r).id);
      }
    }
    // New cells on the right are __empty__
    for (let r = 0; r < 3; r++) {
      for (let c = 4; c < 9; c++) {
        expect(cell(result.newPat, 9, c, r).id).toBe('__empty__');
      }
    }
  });

  test('expand all sides by 5 with centred content', () => {
    const pat = makePattern(10, 10);
    const result = applyCanvasResize(pat, [], null, new Map(), [], 10, 10, {
      newW: 20, newH: 20, offsetX: 5, offsetY: 5
    });

    expect(result.newPat.length).toBe(400);
    // Old (0,0) should appear at new (5,5)
    expect(cell(result.newPat, 20, 5, 5).id).toBe(cell(pat, 10, 0, 0).id);
    // Old (9,9) should appear at new (14,14)
    expect(cell(result.newPat, 20, 14, 14).id).toBe(cell(pat, 10, 9, 9).id);
    // Top-left corner of new canvas should be __empty__
    expect(cell(result.newPat, 20, 0, 0).id).toBe('__empty__');
  });
});

// ── Backstitch tests ──────────────────────────────────────────────────────────

describe('applyCanvasResize — backstitches', () => {
  const noOp = { newW: 10, newH: 10, offsetX: 0, offsetY: 0 };

  function makePat(w, h) { return makePattern(w, h); }

  test('line fully inside new bounds is preserved', () => {
    const bsLines = [{ x1: 2, y1: 2, x2: 5, y2: 5 }];
    const result = applyCanvasResize(makePat(10, 10), bsLines, null, new Map(), [], 10, 10, noOp);
    expect(result.newBsLines.length).toBe(1);
    expect(result.newBsLines[0]).toMatchObject({ x1: 2, y1: 2, x2: 5, y2: 5 });
  });

  test('line remapped correctly by offset', () => {
    const bsLines = [{ x1: 1, y1: 1, x2: 3, y2: 3 }];
    const result = applyCanvasResize(makePat(5, 5), bsLines, null, new Map(), [], 5, 5, {
      newW: 10, newH: 10, offsetX: 3, offsetY: 2
    });
    expect(result.newBsLines.length).toBe(1);
    expect(result.newBsLines[0]).toMatchObject({ x1: 4, y1: 3, x2: 6, y2: 5 });
  });

  test('endpoint exactly on newW edge is kept (lattice inclusive)', () => {
    // newW=8, so x=8 is valid in the lattice
    const bsLines = [{ x1: 5, y1: 3, x2: 8, y2: 3 }];
    const result = applyCanvasResize(makePat(8, 8), bsLines, null, new Map(), [], 8, 8, noOp);
    expect(result.newBsLines.length).toBe(1);
  });

  test('endpoint exactly on newH edge is kept (lattice inclusive)', () => {
    const bsLines = [{ x1: 3, y1: 5, x2: 3, y2: 10 }];
    const result = applyCanvasResize(makePat(10, 10), bsLines, null, new Map(), [], 10, 10, noOp);
    expect(result.newBsLines.length).toBe(1);
  });

  test('one endpoint outside new bounds — whole line dropped', () => {
    // Crop to 5×5; the line's x2=7 exceeds newW=5
    const bsLines = [{ x1: 2, y1: 2, x2: 7, y2: 4 }];
    const result = applyCanvasResize(makePat(10, 10), bsLines, null, new Map(), [], 10, 10, {
      newW: 5, newH: 5, offsetX: 0, offsetY: 0
    });
    expect(result.newBsLines.length).toBe(0);
    expect(result.deletedBsCount).toBe(1);
  });

  test('both endpoints outside new bounds — line dropped', () => {
    const bsLines = [{ x1: 8, y1: 8, x2: 9, y2: 9 }];
    const result = applyCanvasResize(makePat(10, 10), bsLines, null, new Map(), [], 10, 10, {
      newW: 5, newH: 5, offsetX: 0, offsetY: 0
    });
    expect(result.newBsLines.length).toBe(0);
  });

  test('extra fields (colorId, color) are preserved on surviving lines', () => {
    const bsLines = [{ x1: 1, y1: 1, x2: 3, y2: 3, colorId: '310', color: [0, 0, 0] }];
    const result = applyCanvasResize(makePat(10, 10), bsLines, null, new Map(), [], 10, 10, noOp);
    expect(result.newBsLines[0].colorId).toBe('310');
    expect(result.newBsLines[0].color).toEqual([0, 0, 0]);
  });

  test('multiple lines — some kept, some dropped', () => {
    const bsLines = [
      { x1: 1, y1: 1, x2: 3, y2: 3 },  // survives crop to 5×5
      { x1: 6, y1: 6, x2: 8, y2: 8 },  // dropped (outside 5×5)
      { x1: 0, y1: 0, x2: 5, y2: 5 },  // survives (exactly on edges)
    ];
    const result = applyCanvasResize(makePat(10, 10), bsLines, null, new Map(), [], 10, 10, {
      newW: 5, newH: 5, offsetX: 0, offsetY: 0
    });
    expect(result.newBsLines.length).toBe(2);
    expect(result.deletedBsCount).toBe(1);
  });
});

// ── Progress (done) tests ─────────────────────────────────────────────────────

describe('applyCanvasResize — done array', () => {
  test('done = null stays null after resize', () => {
    const pat = makePattern(4, 4);
    const result = applyCanvasResize(pat, [], null, new Map(), [], 4, 4, {
      newW: 2, newH: 2, offsetX: 0, offsetY: 0
    });
    expect(result.newDone).toBeNull();
  });

  test('done array remap: surviving cells copy their done value', () => {
    const sW = 4, sH = 4;
    const pat = makePattern(sW, sH);
    const done = makeDone(sW, sH, 0);
    // Mark cell (col=1, row=1) as done
    done[1 * sW + 1] = 1;

    // Crop to 3×3, offset 0,0 (trim last col/row)
    const result = applyCanvasResize(pat, [], done, new Map(), [], sW, sH, {
      newW: 3, newH: 3, offsetX: 0, offsetY: 0
    });

    expect(result.newDone).not.toBeNull();
    expect(result.newDone.length).toBe(9);
    // Cell (1,1) in old maps to (1,1) in new
    expect(result.newDone[1 * 3 + 1]).toBe(1);
    // Cell (0,0) was not done
    expect(result.newDone[0]).toBe(0);
  });

  test('done array: expanded cells are 0', () => {
    const pat = makePattern(2, 2);
    const done = makeDone(2, 2, 1); // all done
    // Expand to 4×4 with offset (1,1)
    const result = applyCanvasResize(pat, [], done, new Map(), [], 2, 2, {
      newW: 4, newH: 4, offsetX: 1, offsetY: 1
    });

    expect(result.newDone.length).toBe(16);
    // Top-left corner (0,0) is an expanded cell
    expect(result.newDone[0]).toBe(0);
    // Old (0,0) at new (1,1)
    expect(result.newDone[1 * 4 + 1]).toBe(1);
  });

  test('progressAffected is true when stitched cells are cropped', () => {
    const pat = makePattern(4, 4);
    const done = makeDone(4, 4, 0);
    done[0 * 4 + 3] = 1; // far right column, will be cropped

    const result = applyCanvasResize(pat, [], done, new Map(), [], 4, 4, {
      newW: 3, newH: 4, offsetX: 0, offsetY: 0
    });

    expect(result.progressAffected).toBe(true);
    expect(result.deletedStitchCount).toBe(4); // 4 cells in col 3
  });

  test('progressAffected is false when no stitched cells are cropped', () => {
    const pat = makePattern(4, 4);
    const done = makeDone(4, 4, 0);
    done[1 * 4 + 1] = 1; // interior cell, will survive

    const result = applyCanvasResize(pat, [], done, new Map(), [], 4, 4, {
      newW: 3, newH: 4, offsetX: 0, offsetY: 0
    });

    expect(result.progressAffected).toBe(false);
  });
});

// ── Partial stitches tests ────────────────────────────────────────────────────

describe('applyCanvasResize — partial stitches', () => {
  test('partial stitch entries are remapped for surviving cells', () => {
    const sW = 5, sH = 5;
    const pat = makePattern(sW, sH);
    const ps = new Map();
    // Old cell (col=2, row=2) → oldIdx = 2*5+2 = 12
    ps.set(12, { TL: { id: '310', type: 'solid', rgb: [0,0,0] } });

    // Crop to 4×4, no offset (remove last col/row)
    const result = applyCanvasResize(pat, [], null, ps, [], sW, sH, {
      newW: 4, newH: 4, offsetX: 0, offsetY: 0
    });

    // New cell (col=2, row=2) → newIdx = 2*4+2 = 10
    expect(result.newPartialStitches.has(10)).toBe(true);
    expect(result.newPartialStitches.get(10)).toEqual({ TL: { id: '310', type: 'solid', rgb: [0,0,0] } });
  });

  test('partial stitch entries for cropped cells are discarded', () => {
    const sW = 4, sH = 4;
    const pat = makePattern(sW, sH);
    const ps = new Map();
    // Cell (col=3, row=3) — will be cropped when newW=3, newH=3
    ps.set(3 * 4 + 3, { TR: { id: '550', type: 'solid', rgb: [100,0,255] } });

    const result = applyCanvasResize(pat, [], null, ps, [], sW, sH, {
      newW: 3, newH: 3, offsetX: 0, offsetY: 0
    });

    expect(result.newPartialStitches.size).toBe(0);
  });

  test('partial stitch entries are remapped when content is shifted by offset', () => {
    const sW = 4, sH = 4;
    const pat = makePattern(sW, sH);
    const ps = new Map();
    // Old cell (col=0, row=0) → oldIdx=0
    ps.set(0, { BL: { id: '321', type: 'solid', rgb: [255,0,0] } });

    // Expand: offsetX=2, offsetY=2 — old (0,0) maps to new (2,2)
    const result = applyCanvasResize(pat, [], null, ps, [], sW, sH, {
      newW: 6, newH: 6, offsetX: 2, offsetY: 2
    });

    // New (col=2, row=2) → newIdx = 2*6+2 = 14
    expect(result.newPartialStitches.has(14)).toBe(true);
  });
});

// ── Park markers tests ────────────────────────────────────────────────────────

describe('applyCanvasResize — park markers', () => {
  test('markers within new bounds are remapped', () => {
    const pat = makePattern(10, 10);
    const markers = [{ x: 3, y: 4, colorId: '310' }];
    const result = applyCanvasResize(pat, [], null, new Map(), markers, 10, 10, {
      newW: 10, newH: 10, offsetX: 2, offsetY: 1
    });
    expect(result.newParkMarkers.length).toBe(1);
    expect(result.newParkMarkers[0]).toEqual({ x: 5, y: 5, colorId: '310' });
  });

  test('markers outside new bounds are dropped', () => {
    const pat = makePattern(10, 10);
    const markers = [
      { x: 8, y: 2, colorId: '321' }, // will be cropped by newW=6
      { x: 2, y: 8, colorId: '550' }, // will be cropped by newH=6
    ];
    const result = applyCanvasResize(pat, [], null, new Map(), markers, 10, 10, {
      newW: 6, newH: 6, offsetX: 0, offsetY: 0
    });
    expect(result.newParkMarkers.length).toBe(0);
  });

  test('markers exactly on boundary (x=newW-1) are kept', () => {
    const pat = makePattern(10, 10);
    const markers = [{ x: 5, y: 3, colorId: '310' }]; // newW=6 → col 5 is last valid
    const result = applyCanvasResize(pat, [], null, new Map(), markers, 10, 10, {
      newW: 6, newH: 10, offsetX: 0, offsetY: 0
    });
    expect(result.newParkMarkers.length).toBe(1);
  });

  test('empty markers array passes through', () => {
    const pat = makePattern(4, 4);
    const result = applyCanvasResize(pat, [], null, new Map(), [], 4, 4, {
      newW: 4, newH: 4, offsetX: 0, offsetY: 0
    });
    expect(result.newParkMarkers).toEqual([]);
  });
});

// ── Return metadata tests ─────────────────────────────────────────────────────

describe('applyCanvasResize — return metadata', () => {
  test('deletedStitchCount counts non-empty cropped cells', () => {
    const pat = makePattern(4, 4); // all 16 cells are real stitches
    const result = applyCanvasResize(pat, [], null, new Map(), [], 4, 4, {
      newW: 2, newH: 2, offsetX: 0, offsetY: 0
    });
    // 16 - 4 = 12 cells cropped
    expect(result.deletedStitchCount).toBe(12);
  });

  test('deletedStitchCount ignores __empty__ and __skip__ cells', () => {
    const pat = [
      { id: '__skip__' }, { id: '__empty__' }, { id: 'real_0_2' }, { id: 'real_0_3' },
    ];
    // 1×4 canvas, crop to 1×2 (remove last 2 cells)
    const result = applyCanvasResize(pat, [], null, new Map(), [], 4, 1, {
      newW: 2, newH: 1, offsetX: 0, offsetY: 0
    });
    // Only 'real_0_2' and 'real_0_3' are at index 2 and 3, which are col 2 and 3 in 1-row grid
    // cropped cells: col 2 and 3 → real_0_2 (col=2 >= newW=2, dropped), real_0_3 (col=3 >= newW=2, dropped)
    // But __skip__ and __empty__ don't count
    expect(result.deletedStitchCount).toBe(2);
  });

  test('deletedBsCount is accurate', () => {
    const pat = makePattern(10, 10);
    const bsLines = [
      { x1: 1, y1: 1, x2: 3, y2: 3 },  // kept
      { x1: 7, y1: 7, x2: 9, y2: 9 },  // dropped
      { x1: 8, y1: 1, x2: 9, y2: 2 },  // dropped
    ];
    const result = applyCanvasResize(pat, bsLines, null, new Map(), [], 10, 10, {
      newW: 5, newH: 5, offsetX: 0, offsetY: 0
    });
    expect(result.deletedBsCount).toBe(2);
    expect(result.newBsLines.length).toBe(1);
  });

  test('result always has the expected shape', () => {
    const pat = makePattern(3, 3);
    const result = applyCanvasResize(pat, [], null, new Map(), [], 3, 3, {
      newW: 3, newH: 3, offsetX: 0, offsetY: 0
    });
    expect(result).toHaveProperty('newPat');
    expect(result).toHaveProperty('newBsLines');
    expect(result).toHaveProperty('newDone');
    expect(result).toHaveProperty('newPartialStitches');
    expect(result).toHaveProperty('newParkMarkers');
    expect(result).toHaveProperty('deletedStitchCount');
    expect(result).toHaveProperty('deletedBsCount');
    expect(result).toHaveProperty('progressAffected');
  });
});
