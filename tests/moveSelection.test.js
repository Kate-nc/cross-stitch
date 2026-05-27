// ---------------------------------------------------------------------------
// moveSelection.test.js — unit tests for pure functions in
// creator/useMoveSelection.js (extracted via fs.readFileSync + eval).
// ---------------------------------------------------------------------------
'use strict';

const fs = require('fs');
const path = require('path');

// ---------------------------------------------------------------------------
// Extract the pure functions from useMoveSelection.js without running the
// React hook (which requires a DOM / window globals).
// We stub out the minimal window shape needed for module-level code and then
// capture each exported assignment.
// ---------------------------------------------------------------------------
const src = fs.readFileSync(
  path.join(__dirname, '..', 'creator', 'useMoveSelection.js'),
  'utf8'
);

// Stub the window / React globals referenced at the module level.
const window = {};
const React = { useRef: () => ({ current: null }), useState: (v) => [v, () => {}], useEffect: () => {} };

eval(src); // eslint-disable-line no-eval

const {
  getSelectionBBox,
  computeMovedPattern,
  computeMovedPartialStitches,
  computeMovedBsLines,
  computeMovedMask,
  computeFloatPattern,
  computeFloatPartialStitches,
} = window;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function makeCell(id, rgb) { return { id: id || '310', type: 'solid', rgb: rgb || [0, 0, 0] }; }
function emptyCell() { return { id: '__empty__', type: 'solid', rgb: [255, 255, 255] }; }
function skipCell() { return { id: '__skip__', type: 'solid', rgb: [255, 255, 255] }; }

/**
 * Build a flat pattern array of empty cells for a given sW x sH grid, with
 * a populated cell placed at (cx, cy) using the given cell descriptor.
 */
function makePattern(sW, sH, cells) {
  const pat = Array.from({ length: sW * sH }, emptyCell);
  for (const { x, y, cell } of cells) pat[y * sW + x] = cell;
  return pat;
}

/**
 * Build a Uint8Array selection mask for a given sW x sH grid, with the given
 * list of {x, y} positions marked as selected.
 */
function makeMask(sW, sH, selected) {
  const mask = new Uint8Array(sW * sH);
  for (const { x, y } of selected) mask[y * sW + x] = 1;
  return mask;
}

// ---------------------------------------------------------------------------
// getSelectionBBox
// ---------------------------------------------------------------------------
describe('getSelectionBBox', () => {
  it('returns correct bounding box for a non-contiguous selection', () => {
    const sW = 5, sH = 5;
    // Select (1,1), (3,4), (4,2)
    const mask = makeMask(sW, sH, [{ x: 1, y: 1 }, { x: 3, y: 4 }, { x: 4, y: 2 }]);
    const bbox = getSelectionBBox(mask, sW, sH);
    expect(bbox).toEqual({ minX: 1, minY: 1, maxX: 4, maxY: 4 });
  });

  it('returns null for an empty selection mask', () => {
    const mask = new Uint8Array(9);
    expect(getSelectionBBox(mask, 3, 3)).toBeNull();
  });

  it('handles a single-cell selection', () => {
    const sW = 4, sH = 4;
    const mask = makeMask(sW, sH, [{ x: 2, y: 3 }]);
    expect(getSelectionBBox(mask, sW, sH)).toEqual({ minX: 2, minY: 3, maxX: 2, maxY: 3 });
  });
});

// ---------------------------------------------------------------------------
// computeMovedPattern
// ---------------------------------------------------------------------------
describe('computeMovedPattern', () => {
  it('basic right+1 move: source cleared, destination has stitch', () => {
    const sW = 4, sH = 4;
    const cell = makeCell('310', [0, 0, 0]);
    const pat = makePattern(sW, sH, [{ x: 1, y: 1, cell }]);
    const mask = makeMask(sW, sH, [{ x: 1, y: 1 }]);

    const { newPat, changes } = computeMovedPattern(pat, mask, 1, 0, sW, sH);

    // Source should be cleared (empty).
    expect(newPat[1 * sW + 1].id).toBe('__empty__');
    // Destination (2,1) should have the stitch.
    expect(newPat[1 * sW + 2].id).toBe('310');
    // Changes array should contain the affected cells.
    const changedIdxs = changes.map((c) => c.idx);
    expect(changedIdxs).toContain(1 * sW + 1); // source
    expect(changedIdxs).toContain(1 * sW + 2); // destination
  });

  it('OOB clip: source cleared, out-of-bounds destination not written', () => {
    const sW = 3, sH = 3;
    const cell = makeCell('321', [255, 0, 0]);
    const pat = makePattern(sW, sH, [{ x: 2, y: 1, cell }]);
    const mask = makeMask(sW, sH, [{ x: 2, y: 1 }]);

    // Moving right by 1 takes x=2 to x=3 which is OOB.
    const { newPat } = computeMovedPattern(pat, mask, 1, 0, sW, sH);

    // Source must be cleared.
    expect(newPat[1 * sW + 2].id).toBe('__empty__');
    // Nothing should appear at x=3 (OOB — unchanged; length must still be 9).
    expect(newPat.length).toBe(sW * sH);
  });

  it('overwrite: destination cell old value recorded in changes', () => {
    const sW = 3, sH = 3;
    const srcCell = makeCell('310', [0, 0, 0]);
    const dstCell = makeCell('666', [180, 0, 0]);
    const pat = makePattern(sW, sH, [
      { x: 0, y: 0, cell: srcCell },
      { x: 1, y: 0, cell: dstCell },
    ]);
    const mask = makeMask(sW, sH, [{ x: 0, y: 0 }]);

    const { newPat, changes } = computeMovedPattern(pat, mask, 1, 0, sW, sH);

    // Destination should now have the moved stitch.
    expect(newPat[0 * sW + 1].id).toBe('310');
    // The change entry for the destination must record the OLD value (666).
    const dstChange = changes.find((c) => c.idx === 0 * sW + 1);
    expect(dstChange).toBeTruthy();
    expect(dstChange.old.id).toBe('666');
  });

  it('zero delta: changes array is empty (no-op)', () => {
    const sW = 3, sH = 3;
    const cell = makeCell('310');
    const pat = makePattern(sW, sH, [{ x: 1, y: 1, cell }]);
    const mask = makeMask(sW, sH, [{ x: 1, y: 1 }]);

    const { changes } = computeMovedPattern(pat, mask, 0, 0, sW, sH);
    expect(changes.length).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// computeMovedMask
// ---------------------------------------------------------------------------
describe('computeMovedMask', () => {
  it('shifts the mask by (dx, dy), dropping OOB bits', () => {
    const sW = 4, sH = 4;
    // Select (0,0) and (3,0).
    const mask = makeMask(sW, sH, [{ x: 0, y: 0 }, { x: 3, y: 0 }]);
    const newMask = computeMovedMask(mask, 1, 1, sW, sH);

    // (0,0)+dx=1,dy=1 → (1,1): should be set.
    expect(newMask[1 * sW + 1]).toBe(1);
    // (3,0)+dx=1 → (4,0): OOB, must NOT be set.
    expect(newMask.every((b, i) => {
      const x = i % sW, y = Math.floor(i / sW);
      return (x === 1 && y === 1) ? b === 1 : b === 0;
    })).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// computeMovedBsLines
// ---------------------------------------------------------------------------
describe('computeMovedBsLines', () => {
  const sW = 10, sH = 10;
  // Bbox covers x=[2..5], y=[2..5]
  const bbox = { minX: 2, minY: 2, maxX: 5, maxY: 5 };

  it('line fully inside bbox is moved by (dx, dy)', () => {
    const lines = [{ x1: 2, y1: 2, x2: 5, y2: 5, colorId: '310' }];
    const { newBsLines, didChange } = computeMovedBsLines(lines, bbox, 1, 2, sW, sH);

    expect(didChange).toBe(true);
    expect(newBsLines[0]).toMatchObject({ x1: 3, y1: 4, x2: 6, y2: 7 });
  });

  it('line with one endpoint outside bbox is NOT moved', () => {
    // x2=7 is outside maxX+1=6 (right edge of last selected cell), so this
    // endpoint is genuinely outside the selection and the line should NOT move.
    const lines = [{ x1: 2, y1: 2, x2: 7, y2: 5, colorId: '310' }];
    const { newBsLines, didChange } = computeMovedBsLines(lines, bbox, 1, 1, sW, sH);

    expect(didChange).toBe(false);
    expect(newBsLines[0]).toMatchObject({ x1: 2, y1: 2, x2: 7, y2: 5 });
  });
});

// ---------------------------------------------------------------------------
// computeMovedPartialStitches
// ---------------------------------------------------------------------------
describe('computeMovedPartialStitches', () => {
  it('partial stitches move to new indices; OOB entries are discarded', () => {
    const sW = 4, sH = 4;
    const mask = makeMask(sW, sH, [{ x: 0, y: 0 }, { x: 3, y: 3 }]);
    const ps = new Map();
    ps.set(0 * sW + 0, { type: 'half' });    // (0,0) — will move to (1,1) in-bounds
    ps.set(3 * sW + 3, { type: 'quarter' }); // (3,3) — moving right+1 goes OOB

    const { newPs } = computeMovedPartialStitches(ps, mask, 1, 1, sW, sH);

    // (0,0) should have moved to (1,1).
    expect(newPs.get(1 * sW + 1)).toEqual({ type: 'half' });
    // (3,3) OOB — should not appear in result.
    expect(newPs.has(3 * sW + 3)).toBe(false);
    // Old source key (0,0) should be gone.
    expect(newPs.has(0 * sW + 0)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// computeFloatPattern — source cells must remain; destination gets a copy
// ---------------------------------------------------------------------------
describe('computeFloatPattern', () => {
  it('source cell remains AND destination gets a copy', () => {
    const sW = 4, sH = 4;
    const cell = makeCell('310', [0, 0, 0]);
    const pat = makePattern(sW, sH, [{ x: 1, y: 1, cell }]);
    const mask = makeMask(sW, sH, [{ x: 1, y: 1 }]);

    const newPat = computeFloatPattern(pat, mask, 1, 0, sW, sH);

    // Source (1,1) MUST still be there.
    expect(newPat[1 * sW + 1].id).toBe('310');
    // Destination (2,1) MUST have the copy.
    expect(newPat[1 * sW + 2].id).toBe('310');
  });

  it('zero delta returns an unchanged copy', () => {
    const sW = 3, sH = 3;
    const cell = makeCell('666');
    const pat = makePattern(sW, sH, [{ x: 1, y: 1, cell }]);
    const mask = makeMask(sW, sH, [{ x: 1, y: 1 }]);
    const newPat = computeFloatPattern(pat, mask, 0, 0, sW, sH);
    expect(newPat[1 * sW + 1].id).toBe('666');
    expect(newPat).not.toBe(pat); // should return a copy, not the same reference
  });

  it('OOB destination is silently dropped; source still present', () => {
    const sW = 3, sH = 3;
    const cell = makeCell('321', [255, 0, 0]);
    const pat = makePattern(sW, sH, [{ x: 2, y: 1, cell }]);
    const mask = makeMask(sW, sH, [{ x: 2, y: 1 }]);

    // Moving right by 1: x=2+1=3, out of bounds.
    const newPat = computeFloatPattern(pat, mask, 1, 0, sW, sH);

    // Source at (2,1) must remain.
    expect(newPat[1 * sW + 2].id).toBe('321');
    // Nothing extra should be written (length unchanged, no surprises).
    expect(newPat.length).toBe(sW * sH);
  });
});

// ---------------------------------------------------------------------------
// computeFloatPartialStitches — source entries must remain
// ---------------------------------------------------------------------------
describe('computeFloatPartialStitches', () => {
  it('source partial stitch remains AND destination gets a copy', () => {
    const sW = 4, sH = 4;
    const mask = makeMask(sW, sH, [{ x: 0, y: 0 }]);
    const ps = new Map();
    ps.set(0, { type: 'half' }); // (0,0)

    const newPs = computeFloatPartialStitches(ps, mask, 1, 1, sW, sH);

    // Source (0,0) must still be there.
    expect(newPs.has(0)).toBe(true);
    // Destination (1,1) must have a copy.
    expect(newPs.get(1 * sW + 1)).toEqual({ type: 'half' });
  });

  it('returns the same map reference when nothing is selected', () => {
    const sW = 3, sH = 3;
    const mask = new Uint8Array(9); // all zeros
    const ps = new Map([[0, { type: 'quarter' }]]);
    const result = computeFloatPartialStitches(ps, mask, 1, 0, sW, sH);
    expect(result).toBe(ps); // no-op returns same reference
  });
});
