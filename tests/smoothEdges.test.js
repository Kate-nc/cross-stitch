/* tests/smoothEdges.test.js ────────────────────────────────────────────────
   creator/smoothEdges.js: which cells Smooth edges changes and how, for
   trimming and filling, against bare fabric and against another colour.
   Charts are drawn as text: # red (selected), o black, . bare fabric.
   ─────────────────────────────────────────────────────────────────────────── */

const fs = require('fs');
const path = require('path');

const window = {};
eval(fs.readFileSync(path.join(__dirname, '..', 'creator', 'smoothEdges.js'), 'utf8')); // eslint-disable-line no-eval
const SE = window.SmoothEdges;

const RED = { id: '321', type: 'solid', rgb: [199, 43, 59] };
const BLACK = { id: '310', type: 'solid', rgb: [0, 0, 0] };
const r = { id: '321', rgb: RED.rgb }, k = { id: '310', rgb: BLACK.rgb };
const EMPTY = { id: '__empty__', rgb: [255, 255, 255] };

// rows of '#', 'o', '.', 's' (background __skip__). The mask is the '#' cells
// unless `sel` gives its own rows.
function chart(rows, sel) {
  const sW = rows[0].length, sH = rows.length, pat = [], mask = new Uint8Array(sW * sH);
  rows.join('').split('').forEach((ch, i) => {
    pat.push(ch === '#' ? Object.assign({}, RED) : ch === 'o' ? Object.assign({}, BLACK)
      : ch === 's' ? { id: '__skip__' } : Object.assign({}, EMPTY));
    mask[i] = (sel ? sel.join('')[i] : ch) === '#' ? 1 : 0;
  });
  return { pat, mask, sW, sH, partials: new Map() };
}
const plan = (c, opts) => SE.plan(c.pat, c.partials, c.mask, c.sW, c.sH, opts);
const byIdx = (p) => Object.fromEntries(p.cells.map(c => [c.idx, c.entry]));

describe('SmoothEdges.plan: trim', () => {
  // A 45 degree staircase on bare fabric.
  const stairs = ['#...', '##..', '###.', '####'];

  test('cuts the outside corner of each step, leaving it empty on bare fabric', () => {
    const p = plan(chart(stairs), { mode: 'trim', keepSquare: true });
    // Step corners (1,1) and (2,2) lose their top-right quarter. The tip
    // (0,0) and (3,3), at the chart's corner, have two corners open side by
    // side, so they are left alone.
    expect(p.cells.map(c => c.idx)).toEqual([5, 10]);
    expect(byIdx(p)[5]).toEqual({ TL: r, BL: r, BR: r });
    expect(p.cells[0].hatch).toBe('TR');
    expect(p.counts).toEqual({ threeQuarter: 2, half: 0, quarter: 0 });
  });

  test('against another colour the cut quarter takes that colour', () => {
    const c = chart(['oooo', '#ooo', '##oo', '###o']);
    const p = plan(c, { mode: 'trim', keepSquare: true });
    expect(p.cells.map(x => x.idx)).toEqual([9]);  // (1,2): its top-right is black on all sides
    expect(byIdx(p)[9]).toEqual({ TL: r, BL: r, BR: r, TR: k });
    expect(p.counts.quarter).toBe(1);
  });

  test('a quarter beside only one stitched cell is left empty', () => {
    // (1,1)'s top-right: top neighbour black, right and diagonal bare.
    const c = chart(['.o..', '##..', '###.', '####']);
    const e = byIdx(plan(c, { mode: 'trim', keepSquare: true }))[5];
    expect(e).toEqual({ TL: r, BL: r, BR: r });
  });

  test('keeps square corners unless asked not to', () => {
    const box = ['......', '.####.', '.####.', '.####.', '......'];
    expect(plan(chart(box), { mode: 'trim', keepSquare: true }).cells).toEqual([]);
    const p = plan(chart(box), { mode: 'trim', keepSquare: false });
    expect(p.cells.map(c => c.idx).sort((a, b) => a - b)).toEqual([7, 10, 19, 22]);
    expect(byIdx(p)[7]).toEqual({ TR: r, BL: r, BR: r });
  });

  test('a one-stitch-wide diagonal line becomes half stitches', () => {
    const p = plan(chart(['#...', '.#..', '..#.', '...#']), { mode: 'trim', keepSquare: true });
    // The middle stitches touch neighbours at their corners only: each has
    // its top-right and bottom-left open, so it keeps the \ diagonal.
    expect(byIdx(p)[5]).toEqual({ TL: r, BR: r });
    expect(p.counts.half).toBe(2);
  });

  test('cells already holding part stitches, or outside the selection, are left alone', () => {
    const c = chart(['#...', '##..', '###.', '####']);
    c.partials.set(5, { TL: r });
    expect(plan(c, { mode: 'trim', keepSquare: true }).cells.map(x => x.idx)).toEqual([10]);
    // Only the bottom two rows selected: (2,2) is now a corner of a 3-wide
    // run, so only the selection's own outline counts.
    const d = chart(['#...', '##..', '###.', '####'], ['....', '....', '###.', '####']);
    expect(plan(d, { mode: 'trim', keepSquare: true }).cells.map(x => x.idx)).toEqual([10]);
  });
});

describe('SmoothEdges.plan: fill', () => {
  test('puts a 3/4 stitch in each notch, in the shape colour', () => {
    const p = plan(chart(['#...', '##..', '###.', '####']), { mode: 'fill', keepSquare: true });
    // Notches: (1,0), (2,1), (3,2); each filled on its bottom-left side.
    expect(p.cells.map(c => c.idx)).toEqual([1, 6, 11]);
    expect(byIdx(p)[1]).toEqual({ TL: r, BL: r, BR: r });
    expect(p.cells[0].hatch).toBe('BL');
    expect(p.counts).toEqual({ threeQuarter: 3, half: 0, quarter: 0 });
  });

  test('a stitched notch keeps its own colour in the far quarter', () => {
    const p = plan(chart(['#ooo', '##oo', '###o', '####']), { mode: 'fill', keepSquare: true });
    expect(byIdx(p)[1]).toEqual({ TL: r, BL: r, BR: r, TR: k });
    expect(p.counts.quarter).toBe(3);
  });

  test('keeps the inside corner of an L square', () => {
    const L = ['##....', '##....', '######', '######'];
    expect(plan(chart(L), { mode: 'fill', keepSquare: true }).cells).toEqual([]);
    expect(plan(chart(L), { mode: 'fill', keepSquare: false }).cells.map(c => c.idx)).toEqual([8]);
  });
});

describe('SmoothEdges.apply', () => {
  test('clears the full stitch and writes the part stitches, in history shape', () => {
    const c = chart(['oooo', '#ooo', '##oo', '###o']);
    const p = plan(c, { mode: 'trim', keepSquare: true });
    const res = SE.apply(c.pat, c.partials, p.cells);
    expect(res.pat[9]).toEqual(EMPTY);
    expect(res.partials.get(9)).toEqual({ TL: r, BL: r, BR: r, TR: k });
    expect(res.changes).toEqual([{ idx: 9, old: RED }]);
    expect(res.psChanges).toEqual([{ idx: 9, old: null }]);
    expect(c.pat[9]).toEqual(RED);        // input untouched
    expect(c.partials.size).toBe(0);
  });

  test('a background cell stays background', () => {
    const c = chart(['#sss', '##ss', '###s', '####']);
    const p = plan(c, { mode: 'fill', keepSquare: true });
    const res = SE.apply(c.pat, c.partials, p.cells);
    expect(res.changes).toEqual([]);
    expect(res.pat[1].id).toBe('__skip__');
    expect(res.partials.get(1)).toEqual({ TL: r, BL: r, BR: r });
  });

  test('running it again changes nothing more', () => {
    for (const mode of ['trim', 'fill']) {
      const c = chart(['......', '..##..', '.####.', '######', '.####.', '..##..']);
      const p = plan(c, { mode, keepSquare: true });
      expect(p.cells.length).toBeGreaterThan(0);
      const res = SE.apply(c.pat, c.partials, p.cells);
      const again = SE.plan(res.pat, res.partials, c.mask, c.sW, c.sH, { mode, keepSquare: true });
      expect(again.cells).toEqual([]);
    }
  });

  test('nothing to apply returns the inputs', () => {
    const c = chart(['##', '##']);
    const res = SE.apply(c.pat, c.partials, []);
    expect(res.pat).toBe(c.pat);
    expect(res.changes).toEqual([]);
  });
});

// ─── useMagicWand.applySmoothEdges: one undo step through useEditHistory ─────

describe('applySmoothEdges', () => {
  const read = (f) => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');
  beforeAll(() => {
    eval(read('creator/colourReplace.js')); // eslint-disable-line no-eval
    eval(read('creator/useEditHistory.js')); // eslint-disable-line no-eval
    eval(read('creator/useMagicWand.js')); // eslint-disable-line no-eval
    global.SYMS = require('../dmc-data.js').SYMS;
    const cu = read('colour-utils.js');
    const helperSrc = ['freeChartSymbol', 'dedupeChartSymbols', 'nextChartSymbol']
      .map((name) => cu.match(new RegExp('function ' + name + '[\\s\\S]*?\\n\\}'))[0]).join('\n');
    Object.assign(global, new Function('SYMS', helperSrc + '; return { dedupeChartSymbols, nextChartSymbol };')(global.SYMS));
  });

  // The hook with a stub React: the first useState is the selection mask,
  // the rest start at their initial values (Smooth edges: trim, keep square).
  function runWand(state, mask) {
    let first = true;
    global.React = {
      useState: (init) => { if (first) { first = false; return [mask, () => {}]; } return [init, () => {}]; },
      useMemo: (fn) => fn(),
      useEffect: () => {}
    };
    return window.useMagicWand(state);
  }

  function store(c) {
    const s = { editHistory: [], redoHistory: [], EDIT_HISTORY_MAX: 50, toasts: [], scratchPalette: [],
      sW: c.sW, sH: c.sH, pat: c.pat, partialStitches: c.partials, bsLines: [], knots: [],
      cmap: { '321': RED, '310': BLACK }, pal: [RED, BLACK] };
    const setter = (key) => (v) => { s[key] = typeof v === 'function' ? v(s[key]) : v; };
    ['pat', 'pal', 'cmap', 'partialStitches', 'bsLines', 'knots', 'editHistory', 'redoHistory', 'scratchPalette']
      .forEach(key => { s['set' + key.charAt(0).toUpperCase() + key.slice(1)] = setter(key); });
    s.addToast = (msg, opts) => s.toasts.push({ msg, type: opts && opts.type });
    s.buildPaletteWithScratch = (p) => {
      const map = {};
      p.forEach(cell => { if (cell && cell.id !== '__empty__' && cell.id !== '__skip__') map[cell.id] = cell; });
      s.scratchPalette.forEach(e => { if (!map[e.id]) map[e.id] = e; });
      return { pal: Object.values(map), cmap: map };
    };
    return s;
  }

  test('smooths, records one undo step, and undo / redo restore it', () => {
    const c = chart(['oooo', '#ooo', '##oo', '###o']);
    const s = store(c);
    const res = runWand(s, c.mask).applySmoothEdges();
    expect(res.counts).toEqual({ threeQuarter: 1, half: 0, quarter: 1 });
    expect(s.pat[9]).toEqual(EMPTY);
    expect(s.partialStitches.get(9)).toEqual({ TL: r, BL: r, BR: r, TR: k });
    expect(s.editHistory.map(e => e.type)).toEqual(['smoothEdges']);
    expect(s.toasts.pop()).toEqual({ msg: 'Smoothed 1 stitch along the edge.', type: 'success' });

    window.useEditHistory(s).undoEdit();
    expect(s.pat[9].id).toBe('321');
    expect(s.partialStitches.size).toBe(0);
    window.useEditHistory(s).redoEdit();
    expect(s.partialStitches.get(9)).toEqual({ TL: r, BL: r, BR: r, TR: k });
  });

  test('says so when there is nothing to smooth', () => {
    const c = chart(['##', '##']);
    const s = store(c);
    expect(runWand(s, c.mask).applySmoothEdges()).toBeNull();
    expect(s.toasts.pop().type).toBe('info');
    expect(s.editHistory).toEqual([]);
  });

  test('1-wide diagonal surrounded by the same colour avoids a crossing opposite half stitch', () => {
    const c = chart(['#ooo', 'o#oo', 'oo#o', 'ooo#']);
    const p = plan(c, { mode: 'trim', keepSquare: true });
    // Middle cells (1,1)=5 and (2,2)=10 become clean \ half stitches without crossing / black half stitches.
    expect(byIdx(p)[5]).toEqual({ TL: r, BR: r });
    expect(p.counts).toEqual({ threeQuarter: 0, half: 2, quarter: 0 });
  });

  test('1-wide diagonal between two different colours keeps each side as a quarter stitch', () => {
    const BLUE = { id: '796', type: 'solid', rgb: [20, 40, 160] };
    const b = { id: '796', rgb: BLUE.rgb };
    const c = chart(['#ooo', '.#oo', '..#o', '...#']);
    // Paint bottom-left side blue.
    [4, 8, 9, 12, 13, 14].forEach(i => { c.pat[i] = Object.assign({}, BLUE); });
    const p = plan(c, { mode: 'trim', keepSquare: true });
    expect(byIdx(p)[5]).toEqual({ TL: r, BR: r, TR: k, BL: b });
    expect(p.counts).toEqual({ threeQuarter: 0, half: 2, quarter: 4 });
  });

  test('1-wide diagonal matching its own colour on one side still trims the exposed side as a 3/4 stitch', () => {
    // Only the diagonal is selected; bottom-left is unselected red, top-right is black.
    const c = chart(['#ooo', '##oo', '###o', '####'], ['#...', '.#..', '..#.', '...#']);
    const p = plan(c, { mode: 'trim', keepSquare: true });
    expect(byIdx(p)[5]).toEqual({ TL: r, BL: r, BR: r, TR: k });
    expect(p.counts).toEqual({ threeQuarter: 2, half: 0, quarter: 2 });
  });

  test('preserves brand metadata on smoothed quadrants', () => {
    const c = chart(['#...', '##..', '###.', '####']);
    c.pat.forEach(cell => { if (cell.id === '321') cell.brand = 'anchor'; });
    const p = plan(c, { mode: 'trim', keepSquare: true });
    expect(byIdx(p)[5].TL.brand).toBe('anchor');
  });

  test('undo/redo toast counts filled cells when smoothing onto bare fabric', () => {
    const c = chart(['#...', '##..', '###.', '####']);
    const s = store(c);
    // Override useState so smoothOptions starts in fill mode.
    let call = 0;
    global.React = {
      useState: (init) => {
        call++;
        if (call === 1) return [c.mask, () => {}];
        if (init && init.mode === 'trim') return [{ mode: 'fill', keepSquare: true }, () => {}];
        return [init, () => {}];
      },
      useMemo: (fn) => fn(),
      useEffect: () => {}
    };
    window.useMagicWand(s).applySmoothEdges();
    expect(s.editHistory[0].changes).toEqual([]);
    expect(s.editHistory[0].psChanges).toHaveLength(3);
    window.useEditHistory(s).undoEdit();
    expect(s.toasts.pop().msg).toBe('Undo: reverted 3 cells');
    window.useEditHistory(s).redoEdit();
    expect(s.toasts.pop().msg).toBe('Redo: restored 3 cells');
  });

  test('drawPartialStitchLegs draws half, 3/4 and 1/4 stitch legs for Stitched/Realistic previews', () => {
    const helperSrc = read('helpers.js');
    const analyseMatch = helperSrc.match(/function analysePartialStitches\([\s\S]*?\n\}/);
    const localWin = {};
    new Function('window', 'analysePartialStitches',
      analyseMatch[0] + '\n' + read('creator/StitchedPreview.js'))(localWin, null);
    const strokes = [];
    const ctx2d = {
      beginPath: () => {},
      moveTo: (x, y) => strokes.push(['M', x, y]),
      lineTo: (x, y) => strokes.push(['L', x, y]),
      stroke: () => strokes.push(['S'])
    };
    // 3/4 red + 1/4 black cell (as SmoothEdges produces against an outline)
    localWin.drawPartialStitchLegs(ctx2d, 16, { TL: r, BL: r, BR: r, TR: k }, EMPTY, 0.85, 0, 0);
    expect(strokes.filter(s => s[0] === 'S').length).toBeGreaterThanOrEqual(6);
    // Half stitch /
    strokes.length = 0;
    localWin.drawPartialStitchLegs(ctx2d, 16, { BL: r, TR: r }, EMPTY, 0.85, 0, 0);
    expect(strokes.filter(s => s[0] === 'S').length).toBeGreaterThanOrEqual(2);
  });
});
