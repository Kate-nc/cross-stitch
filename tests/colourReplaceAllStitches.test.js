/* tests/colourReplaceAllStitches.test.js ──────────────────────────────────
   Colour replacement covers half/quarter stitches and backstitch lines, and
   one undo/redo restores all of them (via the real useEditHistory).
   ─────────────────────────────────────────────────────────────────────────── */

const fs = require('fs');
const path = require('path');

const window = {};
eval(fs.readFileSync(path.join(__dirname, '..', 'creator', 'colourReplace.js'), 'utf8')); // eslint-disable-line no-eval
eval(fs.readFileSync(path.join(__dirname, '..', 'creator', 'useEditHistory.js'), 'utf8')); // eslint-disable-line no-eval
const CR = window.ColourReplace;

const BLACK = { id: '310', rgb: [0, 0, 0] };
const RED = { id: '321', rgb: [199, 43, 59] };
const BROWN = { id: '3371', name: 'Black Brown', rgb: [30, 17, 8] };

// 3×2 grid. Partial stitches at cells 1 and 4; backstitch along edges.
function partials() {
  return new Map([
    [1, { TL: { id: '310', rgb: [0, 0, 0] }, BR: { id: '321', rgb: [199, 43, 59] } }],
    [4, { BL: { id: '321', rgb: [199, 43, 59] } }]
  ]);
}
function lines() {
  return [
    { x1: 0, y1: 0, x2: 1, y2: 0, colorId: '310', color: '#000000' }, // top edge of cell 0
    { x1: 2, y1: 1, x2: 3, y2: 1, colorId: '310' },                    // between cells 2 and 5
    { x1: 0, y1: 2, x2: 1, y2: 2, colorId: '321', color: '#c72b3b' },  // bottom edge of cell 3
    { x1: 1, y1: 0, x2: 1, y2: 1 }                                     // no colour (Creator-drawn)
  ];
}

describe('partial stitches', () => {
  test('counts cells with any quadrant in the source colour', () => {
    expect(CR.countPartials(partials(), '310', null)).toEqual({ total: 1, inSelection: null });
    expect(CR.countPartials(partials(), '321', null).total).toBe(2);
    expect(CR.countPartials(partials(), '321', new Uint8Array([0, 0, 0, 0, 1, 0]))).toEqual({ total: 2, inSelection: 1 });
    expect(CR.countPartials(null, '321', null).total).toBe(0);
  });

  test('replaces only matching quadrants and records the old entry', () => {
    const src = partials();
    const res = CR.replacePartials(src, '321', BROWN, null);
    expect(res.psChanges.map(c => c.idx)).toEqual([1, 4]);
    expect(res.map.get(1).TL.id).toBe('310');
    expect(res.map.get(1).BR).toEqual({ id: '3371', rgb: [30, 17, 8] });
    expect(res.map.get(4).BL.id).toBe('3371');
    expect(res.psChanges[0].old.BR.id).toBe('321');
    // Input untouched.
    expect(src.get(1).BR.id).toBe('321');
    expect(res.map).not.toBe(src);
  });

  test('respects the selection and returns the same map when nothing changes', () => {
    const src = partials();
    const res = CR.replacePartials(src, '321', BROWN, new Uint8Array([0, 0, 0, 0, 1, 0]));
    expect(res.psChanges.map(c => c.idx)).toEqual([4]);
    expect(res.map.get(1).BR.id).toBe('321');
    expect(CR.replacePartials(src, '999', BROWN, null).map).toBe(src);
  });
});

describe('backstitch lines', () => {
  test('counts lines by colorId; uncoloured lines never match', () => {
    expect(CR.countBackstitch(lines(), '310', null, 3, 2)).toEqual({ total: 2, inSelection: null });
    expect(CR.countBackstitch(lines(), [undefined], null, 3, 2).total).toBe(0);
  });

  test('a line is in the selection when a cell touching its midpoint is selected', () => {
    // Line 2 (x 2-3, y 1) borders cells 2 (row 0) and 5 (row 1).
    expect(CR.countBackstitch(lines(), '310', new Uint8Array([0, 0, 0, 0, 0, 1]), 3, 2).inSelection).toBe(1);
    expect(CR.countBackstitch(lines(), '310', new Uint8Array([0, 0, 1, 0, 0, 0]), 3, 2).inSelection).toBe(1);
    expect(CR.countBackstitch(lines(), '310', new Uint8Array([0, 0, 0, 1, 1, 0]), 3, 2).inSelection).toBe(0);
  });

  test('replaces colorId, updates the hex colour when present, keeps other fields', () => {
    const src = lines();
    const res = CR.replaceBackstitch(src, '310', BROWN, null, 3, 2);
    expect(res.count).toBe(2);
    expect(res.lines[0]).toEqual({ x1: 0, y1: 0, x2: 1, y2: 0, colorId: '3371', color: '#1e1108' });
    expect(res.lines[1]).toEqual({ x1: 2, y1: 1, x2: 3, y2: 1, colorId: '3371' });
    expect(res.lines[2]).toBe(src[2]);
    expect(src[0].colorId).toBe('310');
    expect(CR.replaceBackstitch(src, '999', BROWN, null, 3, 2).lines).toBe(src);
  });
});

describe('describeCounts', () => {
  test.each([
    [{ full: 1 }, '1 stitch'],
    [{ full: 1800 }, '1,800 stitches'],
    [{ full: 3, partial: 1 }, '3 stitches and 1 part stitch'],
    [{ full: 2, partial: 2, backstitch: 1 }, '2 stitches, 2 part stitches and 1 backstitch line'],
    [{ backstitch: 4 }, '4 backstitch lines'],
    [{}, '0 stitches']
  ])('%p → %p', (c, text) => { expect(CR.describeCounts(c)).toBe(text); });
});

describe('undo / redo restore all stitch kinds', () => {
  function makeState() {
    const s = {
      pat: [BLACK, RED, BLACK, RED, BLACK, RED].map(c => Object.assign({}, c)),
      partialStitches: partials(), bsLines: lines(),
      editHistory: [], redoHistory: [], EDIT_HISTORY_MAX: 50,
      buildPaletteWithScratch: () => ({ pal: [], cmap: {} }),
      setPal() {}, setCmap() {}, setSelectionMask() {}, addToast() {}
    };
    const setter = key => v => { s[key] = typeof v === 'function' ? v(s[key]) : v; };
    ['pat', 'partialStitches', 'bsLines', 'editHistory', 'redoHistory'].forEach(k => {
      s['set' + k[0].toUpperCase() + k.slice(1)] = setter(k);
    });
    return s;
  }

  test('a replacement recorded like applyGlobalColourReplacement undoes and redoes cleanly', () => {
    const s = makeState();
    const before = { pat: JSON.stringify(s.pat), ps: JSON.stringify([...s.partialStitches]), bs: JSON.stringify(s.bsLines) };

    // Mirror applyGlobalColourReplacement's bookkeeping.
    const r = CR.replaceInPattern(s.pat, '310', BROWN, null);
    const p = CR.replacePartials(s.partialStitches, '310', BROWN, null);
    const b = CR.replaceBackstitch(s.bsLines, '310', BROWN, null, 3, 2);
    s.editHistory = [{ type: 'colourReplace', changes: r.changes, psChanges: p.psChanges, bsLines: s.bsLines.slice() }];
    s.pat = r.pat; s.partialStitches = p.map; s.bsLines = b.lines;
    const after = { pat: JSON.stringify(s.pat), ps: JSON.stringify([...s.partialStitches]), bs: JSON.stringify(s.bsLines) };
    expect(after.ps).not.toBe(before.ps);
    expect(after.bs).not.toBe(before.bs);

    window.useEditHistory(s).undoEdit();
    expect(JSON.stringify(s.pat)).toBe(before.pat);
    expect(JSON.stringify([...s.partialStitches])).toBe(before.ps);
    expect(JSON.stringify(s.bsLines)).toBe(before.bs);

    window.useEditHistory(s).redoEdit();
    expect(JSON.stringify(s.pat)).toBe(after.pat);
    expect(JSON.stringify([...s.partialStitches])).toBe(after.ps);
    expect(JSON.stringify(s.bsLines)).toBe(after.bs);
  });
});

describe('wiring', () => {
  const read = rel => fs.readFileSync(path.join(__dirname, '..', rel), 'utf8');
  test('applyGlobalColourReplacement records psChanges and bsLines', () => {
    const src = read('creator/useMagicWand.js');
    expect(src).toMatch(/CR\.remapPartials\(state\.partialStitches, mapping, mask\)/);
    expect(src).toMatch(/CR\.remapBackstitch\(state\.bsLines, mapping, mask, state\.sW, state\.sH\)/);
    expect(src).toMatch(/if \(psRes\.psChanges\.length\) entry\.psChanges = psRes\.psChanges;/);
    expect(src).toMatch(/if \(bsRes\.count\) entry\.bsLines = state\.bsLines\.slice\(\);/);
  });
  test('useMagicWand receives partial stitches; modal receives both', () => {
    expect(read('creator/useCreatorState.js')).toMatch(/partialStitches: partialStitches, setPartialStitches: setPartialStitches,\n    editHistory/);
    expect(read('creator-main.js')).toMatch(/partialStitches:state\.partialStitches, bsLines:state\.bsLines,/);
  });
});

describe('swapping two colours', () => {
  const A = { id: '310', rgb: [0, 0, 0] };
  const B = { id: '321', rgb: [199, 43, 59] };

  test('swapMapping exchanges the two ids; same colour gives an empty mapping', () => {
    const m = CR.swapMapping(A, B);
    expect(m['310']).toBe(B);
    expect(m['321']).toBe(A);
    expect(CR.swapMapping(A, A)).toEqual({});
    expect(CR.swapMapping(A, null)).toEqual({});
  });

  test('full stitches, part stitches and backstitch all swap in one pass', () => {
    const pat = [A, B, A, B, A, B].map(c => Object.assign({}, c));
    const m = CR.swapMapping(A, B);
    const r = CR.remapPattern(pat, m, null);
    expect(r.pat.map(c => c.id)).toEqual(['321', '310', '321', '310', '321', '310']);
    expect(r.changes).toHaveLength(6);

    const p = CR.remapPartials(partials(), m, null);
    expect(p.map.get(1).TL.id).toBe('321');
    expect(p.map.get(1).BR.id).toBe('310');
    expect(p.map.get(4).BL.id).toBe('310');

    const b = CR.remapBackstitch(lines(), m, null, 3, 2);
    expect(b.lines.map(l => l.colorId)).toEqual(['321', '321', '310', undefined]);
    expect(b.lines[2].color).toBe('#000000');
  });

  test('swapping twice restores the original', () => {
    const pat = [A, B, A].map(c => Object.assign({}, c));
    const m = CR.swapMapping(A, B);
    const once = CR.remapPattern(pat, m, null).pat;
    const twice = CR.remapPattern(once, m, null).pat;
    expect(twice.map(c => c.id)).toEqual(['310', '321', '310']);
  });

  test('respects the selection mask', () => {
    const pat = [A, B, A, B].map(c => Object.assign({}, c));
    const r = CR.remapPattern(pat, CR.swapMapping(A, B), new Uint8Array([1, 1, 0, 0]));
    expect(r.pat.map(c => c.id)).toEqual(['321', '310', '310', '321']);
  });

  test('applyGlobalColourReplacement supports opts.swap', () => {
    const src = fs.readFileSync(path.join(__dirname, '..', 'creator', 'useMagicWand.js'), 'utf8');
    expect(src).toMatch(/if \(opts && opts\.swap\) \{[\s\S]*?mapping = CR\.swapMapping\(srcEntry, dstEntry\);/);
  });
});
