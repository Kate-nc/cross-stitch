// Palette that starts from the pattern; symbols you can change (P1-4, audit DRAW-05).
const { loadSource } = require('./_helpers/loadSource');
const { DMC, SYMS } = require('../dmc-data.js');
const PT = require('../creator/paletteTools.js');

const pal = [
  { id: '310', name: 'Black', symbol: '●', count: 1204, rgb: [0, 0, 0] },
  { id: '321', name: 'Christmas Red', symbol: '◆', count: 30, rgb: [199, 43, 59] },
  { id: 'blanc', name: 'White', symbol: '■', count: 0, rgb: [252, 251, 248] },
];

describe('reassignSymbol', () => {
  test('gives the colour the new symbol and reports the old one', () => {
    const r = PT.reassignSymbol(pal, '310', '★');
    expect(r.ok).toBe(true);
    expect(r.from).toBe('●');
    expect(r.pal.find((p) => p.id === '310').symbol).toBe('★');
    // The input is not mutated.
    expect(pal[0].symbol).toBe('●');
  });

  test('refuses a symbol another colour uses', () => {
    expect(PT.reassignSymbol(pal, '310', '◆')).toEqual({ ok: false, reason: 'duplicate' });
  });

  test('refuses an unknown colour or the same symbol', () => {
    expect(PT.reassignSymbol(pal, '999', '★').ok).toBe(false);
    expect(PT.reassignSymbol(pal, '310', '●').reason).toBe('same');
  });

  test('unusedSymbols leaves out every symbol in the palette', () => {
    const free = PT.unusedSymbols(pal, SYMS);
    expect(free).not.toContain('●');
    expect(free).not.toContain('◆');
    expect(free).not.toContain('■');
    expect(free.length).toBe(SYMS.length - 3);
  });

  test('stampSymbol changes only that colour\'s cells', () => {
    const pat = [{ id: '310' }, { id: '321' }, { id: '310' }];
    const out = PT.stampSymbol(pat, '310', '★');
    expect(out.map((c) => c.symbol)).toEqual(['★', undefined, '★']);
    expect(out[1]).toBe(pat[1]);
  });
});

describe('buildPalette keeps chosen symbols', () => {
  const src = loadSource('colour-utils.js');
  const fn = src.match(/function buildPalette\(patArr\)\{[\s\S]*?\n\}/)[0];
  // eslint-disable-next-line no-new-func
  const buildPalette = new Function('SYMS', fn + '; return buildPalette;')(SYMS);
  const cell = (id, symbol) => (symbol ? { id, type: 'solid', symbol } : { id, type: 'solid' });

  test('without carried symbols, symbols follow stitch count as before', () => {
    const pat = [cell('a'), cell('a'), cell('a'), cell('b'), cell('b'), cell('c')];
    expect(buildPalette(pat).pal.map((p) => p.symbol)).toEqual([SYMS[0], SYMS[1], SYMS[2]]);
  });

  test('a carried symbol wins, and no other colour gets it', () => {
    // 'c' carries SYMS[0], which 'a' would take by rank.
    const pat = [cell('a'), cell('a'), cell('a'), cell('b'), cell('b'), cell('c', SYMS[0])];
    const syms = buildPalette(pat).pal.map((p) => p.symbol);
    expect(syms[2]).toBe(SYMS[0]);
    expect(new Set(syms).size).toBe(3);
  });

  test('changing one colour to an unused symbol leaves the others alone', () => {
    const pat = [cell('a', SYMS[10]), cell('a', SYMS[10]), cell('b'), cell('c')];
    expect(buildPalette(pat).pal.map((p) => p.symbol)).toEqual([SYMS[10], SYMS[1], SYMS[2]]);
  });
});

describe('undo and redo', () => {
  // eslint-disable-next-line no-new-func
  const win = {};
  new Function('window', loadSource('creator/useEditHistory.js'))(win);

  function makeState(editHistory, redoHistory) {
    const calls = [];
    const st = {
      editHistory, redoHistory, EDIT_HISTORY_MAX: 50, pat: [], partialStitches: new Map(), bsLines: [],
      applySymbol: (id, sym, record) => { calls.push([id, sym, record]); return true; },
      setEditHistory: (f) => { st.editHistory = typeof f === 'function' ? f(st.editHistory) : f; },
      setRedoHistory: (f) => { st.redoHistory = typeof f === 'function' ? f(st.redoHistory) : f; },
    };
    return { st, calls };
  }

  test('undo puts the old symbol back without recording a new edit', () => {
    const entry = { type: 'symbol', id: '310', from: '●', to: '★', changes: [] };
    const { st, calls } = makeState([entry], []);
    win.useEditHistory(st).undoEdit();
    expect(calls).toEqual([['310', '●', false]]);
    expect(st.editHistory).toEqual([]);
    expect(st.redoHistory).toEqual([entry]);
  });

  test('redo applies the new symbol again', () => {
    const entry = { type: 'symbol', id: '310', from: '●', to: '★', changes: [] };
    const { st, calls } = makeState([], [entry]);
    win.useEditHistory(st).redoEdit();
    expect(calls).toEqual([['310', '★', false]]);
    expect(st.editHistory).toEqual([entry]);
    expect(st.redoHistory).toEqual([]);
  });

  test('changeSymbol records a symbol entry with from and to', () => {
    const state = loadSource('creator/useCreatorState.js');
    expect(state).toMatch(/\{ type: "symbol", changes: \[\], id: id, from: r\.from, to: sym \}/);
  });
});

describe('saved symbols', () => {
  const src = loadSource('creator/useProjectIO.js');
  const fn = src.match(/function creatorSavedSymbols[\s\S]*?\n\}/)[0];
  // eslint-disable-next-line no-new-func
  const creatorSavedSymbols = new Function(fn + '; return creatorSavedSymbols;')();

  test('only symbols the palette still shows are saved', () => {
    expect(creatorSavedSymbols({ 310: '★', 321: '♥' }, pal)).toBeUndefined();
    const changed = PT.reassignSymbol(pal, '310', '★').pal;
    expect(creatorSavedSymbols({ 310: '★', 999: '♥' }, changed)).toEqual({ 310: '★' });
  });

  test('untouched projects save no symbols field', () => {
    expect(creatorSavedSymbols({}, pal)).toBeUndefined();
  });

  test('the Creator and the Tracker restore saved symbols onto cells', () => {
    expect(src).toMatch(/savedSyms\[c\.id\] \? Object\.assign\(\{\}, c, \{ symbol: savedSyms\[c\.id\] \}\)/);
    const tracker = loadSource('tracker-app.js');
    expect(tracker).toMatch(/symbols:symbolsRef\.current\|\|undefined/);
    expect(tracker).toMatch(/symbols: symbolsRef\.current \|\| undefined/);
  });
});

describe('colour families', () => {
  const lab = (id) => DMC.find((d) => d.id === id).lab;
  test.each([
    ['310', 'neutrals'], ['blanc', 'neutrals'], ['415', 'neutrals'],
    ['321', 'reds'], ['3326', 'pinks'], ['740', 'oranges'], ['444', 'yellows'],
    ['699', 'greens'], ['797', 'blues'], ['550', 'purples'], ['898', 'browns'],
  ])('DMC %s is %s', (id, family) => {
    expect(PT.colourFamily(lab(id))).toBe(family);
  });

  test('every DMC thread lands in a listed family', () => {
    const ids = new Set(PT.FAMILIES.map((f) => f.id));
    for (const d of DMC) expect(ids.has(PT.colourFamily(d.lab))).toBe(true);
  });
});

describe('suggestions and swatches', () => {
  test('nearestThreads returns the closest threads first and skips ones in the pattern', () => {
    const red = DMC.find((d) => d.id === '321');
    const near = PT.nearestThreads(red.lab, DMC, 5, { 321: true });
    expect(near).toHaveLength(5);
    expect(near.map((d) => d.id)).not.toContain('321');
    expect(PT.colourFamily(near[0].lab)).toBe('reds');
  });

  test('symbol ink contrasts with the thread', () => {
    expect(PT.swatchInk([0, 0, 0])).toBe('white');
    expect(PT.swatchInk([252, 251, 248])).toBe('black');
  });

  test('the long-press label reads "DMC 310 · Black · 1,204 stitches"', () => {
    expect(PT.swatchLabel(pal[0])).toBe('DMC 310 · Black · 1,204 stitches');
    expect(PT.swatchLabel({ id: '550', name: 'Violet VDk', count: 1 })).toBe('DMC 550 · Violet VDk · 1 stitch');
  });
});
