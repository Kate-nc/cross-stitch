/* tests/stitchTypeConvert.test.js ──────────────────────────────────────────
   "Stitch type" on a selection: creator/stitchTypeConvert.js (the rules) and
   useMagicWand.convertSelectionStitchType (one undo step through the real
   useEditHistory, palette kept for colours now only in half stitches).
   ─────────────────────────────────────────────────────────────────────────── */

const fs = require('fs');
const path = require('path');

const window = {};
const read = (f) => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');
eval(read('creator/stitchTypeConvert.js')); // eslint-disable-line no-eval
eval(read('creator/colourReplace.js')); // eslint-disable-line no-eval
eval(read('creator/useEditHistory.js')); // eslint-disable-line no-eval
eval(read('creator/useMagicWand.js')); // eslint-disable-line no-eval
global.SYMS = require('../dmc-data.js').SYMS;
const cu = read('colour-utils.js');
const helperSrc = ['freeChartSymbol', 'dedupeChartSymbols', 'nextChartSymbol']
  .map((name) => cu.match(new RegExp('function ' + name + '[\\s\\S]*?\\n\\}'))[0]).join('\n');
Object.assign(global, new Function('SYMS', helperSrc + '; return { dedupeChartSymbols, nextChartSymbol };')(global.SYMS));

const STC = window.StitchTypeConvert;
const BLACK = { id: '310', type: 'solid', rgb: [0, 0, 0], symbol: 'A' };
const RED = { id: '321', type: 'solid', rgb: [199, 43, 59], symbol: 'B' };
const q = (c) => ({ id: c.id, rgb: c.rgb });
const EMPTY = { id: '__empty__', rgb: [255, 255, 255] };
const SKIP = { id: '__skip__' };
const cmap = { '310': BLACK, '321': RED };
const clone = (arr) => arr.map(c => Object.assign({}, c));

describe('StitchTypeConvert.cellKind', () => {
  test('names full, half and other stitches', () => {
    expect(STC.cellKind(RED, null)).toBe('full');
    expect(STC.cellKind(EMPTY, null)).toBeNull();
    expect(STC.cellKind(SKIP, null)).toBeNull();
    expect(STC.cellKind(EMPTY, { BL: q(RED), TR: q(RED) })).toBe('half-fwd');
    expect(STC.cellKind(SKIP, { TL: q(RED), BR: q(RED) })).toBe('half-bck');
    expect(STC.cellKind(EMPTY, { TL: q(RED) })).toBe('other');                    // quarter
    expect(STC.cellKind(EMPTY, { TL: q(RED), TR: q(RED), BL: q(RED) })).toBe('other'); // three-quarter
    expect(STC.cellKind(EMPTY, { BL: q(RED), TR: q(BLACK) })).toBe('other');       // two colours
    expect(STC.cellKind(RED, { TL: q(BLACK) })).toBe('other');                      // full + quarter
  });
});

describe('StitchTypeConvert.selectionKind', () => {
  const pat = [RED, BLACK, EMPTY, EMPTY];
  const ps = new Map([[2, { BL: q(RED), TR: q(RED) }]]);
  test('one kind across the selection, ignoring cells with no stitch', () => {
    expect(STC.selectionKind(pat, ps, new Uint8Array([1, 1, 0, 1]))).toBe('full');
    expect(STC.selectionKind(pat, ps, new Uint8Array([0, 0, 1, 1]))).toBe('half-fwd');
  });
  test('mixed, or null when nothing is stitched', () => {
    expect(STC.selectionKind(pat, ps, new Uint8Array([1, 0, 1, 0]))).toBe('mixed');
    expect(STC.selectionKind(pat, ps, new Uint8Array([0, 0, 0, 1]))).toBeNull();
    expect(STC.selectionKind(pat, ps, null)).toBeNull();
  });
});

describe('StitchTypeConvert.convertSelection', () => {
  test('full stitches become half stitches of the same colour', () => {
    const pat = clone([RED, BLACK, RED]);
    const res = STC.convertSelection(pat, new Map(), new Uint8Array([1, 1, 0]), 'half-fwd', cmap);
    expect(res.pat.map(c => c.id)).toEqual(['__empty__', '__empty__', '321']);
    expect(res.partials.get(0)).toEqual({ BL: q(RED), TR: q(RED) });
    expect(res.partials.get(1)).toEqual({ BL: q(BLACK), TR: q(BLACK) });
    expect(res.partials.has(2)).toBe(false);
    expect(res.changes.map(c => c.idx)).toEqual([0, 1]);
    expect(res.changes[0].old).toEqual(RED);
    expect(res.psChanges).toEqual([{ idx: 0, old: null }, { idx: 1, old: null }]);
    expect(pat[0]).toEqual(RED); // input untouched
  });

  test('half stitches become full stitches using the palette entry', () => {
    const ps = new Map([[0, { TL: q(RED), BR: q(RED) }]]);
    const res = STC.convertSelection(clone([EMPTY]), ps, new Uint8Array([1]), 'full', cmap);
    expect(res.pat[0]).toEqual(RED);
    expect(res.partials.size).toBe(0);
    expect(res.psChanges).toEqual([{ idx: 0, old: { TL: q(RED), BR: q(RED) } }]);
  });

  test('a half stitch turns to the other direction', () => {
    const ps = new Map([[0, { BL: q(BLACK), TR: q(BLACK) }]]);
    const res = STC.convertSelection(clone([EMPTY]), ps, new Uint8Array([1]), 'half-bck', cmap);
    expect(res.changes).toEqual([]);
    expect(res.partials.get(0)).toEqual({ TL: q(BLACK), BR: q(BLACK) });
  });

  test('a half stitch on a background cell stays on the background', () => {
    const ps = new Map([[0, { BL: q(RED), TR: q(RED) }]]);
    const res = STC.convertSelection(clone([SKIP]), ps, new Uint8Array([1]), 'half-bck', cmap);
    expect(res.pat[0].id).toBe('__skip__');
    expect(res.partials.get(0)).toEqual({ TL: q(RED), BR: q(RED) });
  });

  test('cells already the target, and blank cells, are left alone', () => {
    const pat = clone([RED, EMPTY, SKIP]);
    const ps = new Map();
    const res = STC.convertSelection(pat, ps, new Uint8Array([1, 1, 1]), 'full', cmap);
    expect(res.pat).toBe(pat);
    expect(res.partials).toBe(ps);
    expect(res.changes).toEqual([]);
    expect(res.psChanges).toEqual([]);
  });

  test('quarter and three-quarter stitches take the colour covering most of the cell', () => {
    // Red three-quarter (TL, TR, BL) with a black quarter (BR).
    const ps = new Map([[0, { TL: q(RED), TR: q(RED), BL: q(RED), BR: q(BLACK) }]]);
    const full = STC.convertSelection(clone([EMPTY]), ps, new Uint8Array([1]), 'full', cmap);
    expect(full.pat[0].id).toBe('321');
    const half = STC.convertSelection(clone([EMPTY]), ps, new Uint8Array([1]), 'half-bck', cmap);
    expect(half.partials.get(0)).toEqual({ TL: q(RED), BR: q(RED) });
  });

  test('a full stitch with a quarter over it counts the full stitch under the corners', () => {
    // Red full stitch, black quarter in TL: red covers three corners.
    const ps = new Map([[0, { TL: q(BLACK) }]]);
    const res = STC.convertSelection(clone([RED]), ps, new Uint8Array([1]), 'full', cmap);
    expect(res.pat[0].id).toBe('321');
    expect(res.partials.size).toBe(0);
  });

  test('two half stitches of different colours: a half keeps the colour on its diagonal', () => {
    const ps = new Map([[0, { BL: q(RED), TR: q(RED), TL: q(BLACK), BR: q(BLACK) }]]);
    const fwd = STC.convertSelection(clone([EMPTY]), ps, new Uint8Array([1]), 'half-fwd', cmap);
    expect(fwd.partials.get(0)).toEqual({ BL: q(RED), TR: q(RED) });
    const bck = STC.convertSelection(clone([EMPTY]), ps, new Uint8Array([1]), 'half-bck', cmap);
    expect(bck.partials.get(0)).toEqual({ TL: q(BLACK), BR: q(BLACK) });
    // A full stitch takes the first corner's colour (TL).
    const full = STC.convertSelection(clone([EMPTY]), ps, new Uint8Array([1]), 'full', cmap);
    expect(full.pat[0].id).toBe('310');
  });

  test('a full stitch with a half over it keeps the full stitch\'s colour when made full', () => {
    const ps = new Map([[0, { BL: q(BLACK), TR: q(BLACK) }]]);
    const res = STC.convertSelection(clone([RED]), ps, new Uint8Array([1]), 'full', cmap);
    expect(res.pat[0].id).toBe('321');
  });

  test('a colour missing from the palette is made into a plain entry', () => {
    const ps = new Map([[0, { BL: { id: '999', rgb: [1, 2, 3] }, TR: { id: '999', rgb: [1, 2, 3] } }]]);
    const res = STC.convertSelection(clone([EMPTY]), ps, new Uint8Array([1]), 'full', {});
    expect(res.pat[0]).toEqual({ id: '999', type: 'solid', rgb: [1, 2, 3] });
  });

  test('an unknown target or no selection changes nothing', () => {
    const pat = clone([RED]);
    expect(STC.convertSelection(pat, new Map(), new Uint8Array([1]), 'quarter', cmap).changes).toEqual([]);
    expect(STC.convertSelection(pat, new Map(), null, 'full', cmap).pat).toBe(pat);
  });
});

describe('StitchTypeConvert.partColourIds', () => {
  test('collects colours used by part stitches, backstitch and knots', () => {
    const ps = new Map([[0, { BL: q(RED), TR: q(RED) }], [3, { TL: { id: 5, rgb: [1, 1, 1] } }]]);
    const ids = STC.partColourIds(ps, [{ colorId: '310' }, { color: [0, 0, 0] }], [{ x: 0, y: 0, id: '666' }]);
    expect([...ids].sort()).toEqual(['310', '321', '5', '666']);
    expect(STC.partColourIds(null, null, null).size).toBe(0);
  });
});

// ─── useMagicWand.convertSelectionStitchType ──────────────────────────────────

function runWand(state, mask) {
  let first = true;
  global.React = {
    useState: (init) => {
      if (first) { first = false; return [mask, (v) => { state.setSelectionMask(v); }]; }
      return [init, () => {}];
    },
    useMemo: (fn) => fn(),
    useEffect: () => {}
  };
  return window.useMagicWand(state);
}

function makeStore(init) {
  const s = Object.assign({ editHistory: [], redoHistory: [], EDIT_HISTORY_MAX: 50, toasts: [], scratchPalette: [] }, init);
  const setter = (k) => (v) => { s[k] = typeof v === 'function' ? v(s[k]) : v; };
  ['pat', 'pal', 'cmap', 'partialStitches', 'bsLines', 'knots', 'editHistory', 'redoHistory', 'selectionMask', 'scratchPalette']
    .forEach(k => { s['set' + k.charAt(0).toUpperCase() + k.slice(1)] = setter(k); });
  s.addToast = (msg, opts) => s.toasts.push({ msg: msg, type: opts && opts.type });
  s.buildPaletteWithScratch = (p) => {
    const map = {};
    p.forEach(c => { if (c && c.id !== '__empty__' && c.id !== '__skip__') map[c.id] = c; });
    s.scratchPalette.forEach(e => { if (!map[e.id]) map[e.id] = e; });
    return { pal: Object.values(map), cmap: map };
  };
  return s;
}

// 2×2:  [321 321]
//       [310 empty]
function fixture() {
  return makeStore({
    sW: 2, sH: 2,
    pat: clone([RED, RED, BLACK, EMPTY]),
    cmap: Object.assign({}, cmap), pal: [RED, BLACK],
    partialStitches: new Map(), bsLines: [], knots: []
  });
}

describe('convertSelectionStitchType', () => {
  test('converts the selection in one undo step and keeps the colour in the palette', () => {
    const s = fixture();
    const wand = runWand(s, new Uint8Array([1, 1, 0, 1]));
    expect(wand.selectionStitchKind).toBe('full');
    const res = wand.convertSelectionStitchType('half-fwd');

    expect(res.count).toBe(2);
    expect(s.pat.map(c => c.id)).toEqual(['__empty__', '__empty__', '310', '__empty__']);
    expect(s.partialStitches.get(0)).toEqual({ BL: q(RED), TR: q(RED) });
    expect(s.editHistory).toHaveLength(1);
    expect(s.editHistory[0].type).toBe('stitchType');
    // Red is only in half stitches now: it stays in the palette with its symbol.
    expect(s.cmap['321']).toMatchObject({ id: '321', symbol: 'B' });
    expect(s.toasts.pop()).toEqual({ msg: 'Changed 2 stitches to half stitches (/).', type: 'success' });

    // Undo puts the full stitches back; redo makes them half again.
    const hist = window.useEditHistory(s);
    hist.undoEdit();
    expect(s.pat.map(c => c.id)).toEqual(['321', '321', '310', '__empty__']);
    expect(s.partialStitches.size).toBe(0);
    window.useEditHistory(s).redoEdit();
    expect(s.pat.map(c => c.id)).toEqual(['__empty__', '__empty__', '310', '__empty__']);
    expect(s.partialStitches.get(1)).toEqual({ BL: q(RED), TR: q(RED) });
  });

  test('half stitches back to cross stitches', () => {
    const s = fixture();
    runWand(s, new Uint8Array([1, 1, 0, 0])).convertSelectionStitchType('half-bck');
    const wand = runWand(s, new Uint8Array([1, 1, 0, 0]));
    expect(wand.selectionStitchKind).toBe('half-bck');
    wand.convertSelectionStitchType('full');
    // Each cell takes the palette entry, as painting does.
    expect(s.pat.slice(0, 2).map(c => c.id)).toEqual(['321', '321']);
    expect(s.pat[0]).toMatchObject({ type: 'solid', rgb: RED.rgb, symbol: 'B' });
    expect(s.partialStitches.size).toBe(0);
    expect(s.toasts.pop().msg).toBe('Changed 2 stitches to cross stitches.');
  });

  test('stitched cells that change are reset to not done, and the reset is recorded', () => {
    const s = fixture();
    s.guardStitchedEdit = (changes) => changes.map(c => c.idx);
    runWand(s, new Uint8Array([1, 0, 0, 0])).convertSelectionStitchType('half-fwd');
    expect(s.editHistory[0].doneReset).toEqual([0]);
  });

  test('says so when there is nothing to change', () => {
    const s = fixture();
    expect(runWand(s, new Uint8Array([1, 1, 1, 0])).convertSelectionStitchType('full')).toBeNull();
    expect(s.toasts.pop()).toEqual({ msg: 'The selection is already cross stitches.', type: 'info' });
    expect(runWand(s, new Uint8Array([0, 0, 0, 1])).convertSelectionStitchType('full')).toBeNull();
    expect(s.toasts.pop()).toEqual({ msg: 'No stitches in the selection.', type: 'info' });
    expect(s.editHistory).toHaveLength(0);
  });

  test('preserves brand and blend metadata across half-stitch conversion', () => {
    const ANCHOR_RED = { id: '47', type: 'solid', brand: 'anchor', rgb: [199, 43, 59] };
    const BLEND = { id: '310+321', type: 'blend', rgb: [99, 21, 29], threads: [BLACK, RED], blendRatio: [2, 1] };
    const res = STC.convertSelection(clone([ANCHOR_RED, BLEND]), new Map(), new Uint8Array([1, 1]), 'half-fwd', {});
    expect(res.partials.get(0).BL).toEqual({ id: '47', rgb: ANCHOR_RED.rgb, brand: 'anchor' });
    expect(res.partials.get(1).BL).toEqual({ id: '310+321', rgb: BLEND.rgb, type: 'blend', threads: BLEND.threads, blendRatio: [2, 1] });
    // Converting back without cmap preserves brand and blend type/ratio.
    const back = STC.convertSelection(res.pat, res.partials, new Uint8Array([1, 1]), 'full', {});
    expect(back.pat[0]).toMatchObject({ id: '47', type: 'solid', brand: 'anchor' });
    expect(back.pat[1]).toMatchObject({ id: '310+321', type: 'blend', threads: BLEND.threads, blendRatio: [2, 1] });
  });

  test('partColourIds and setPaletteKeepingParts retain knots and specialty stitches', () => {
    const ids = STC.partColourIds(null, null, [{ x: 1, y: 1, id: '310' }], [{ type: 'petite', thread: { id: '321' } }]);
    expect([...ids].sort()).toEqual(['310', '321']);

    const s = fixture();
    s.specialtyStitches = [{ type: 'petite', thread: { id: '310' } }];
    // Delete the only full black stitch; black stays in cmap because specialtyStitches uses it.
    runWand(s, new Uint8Array([0, 0, 1, 0])).deleteSelection();
    expect(s.cmap['310']).toBeDefined();
  });

  test('half-stitched cells remain selectable by Magic Wand, Select all, Invert and Select all of colour', () => {
    const s = fixture();
    global.formatThread = (e) => e.id;
    global.rgbToLab = (r, g, b) => [r, g, b];
    runWand(s, new Uint8Array([1, 1, 0, 0])).convertSelectionStitchType('half-fwd');
    expect(s.pat[0].id).toBe('__empty__');

    // Magic Wand on cell (0,0) selects both half-stitched red cells.
    const wand = runWand(s, null);
    wand.applyWandSelect(0, 0, 'replace');
    expect(Array.from(s.selectionMask)).toEqual([1, 1, 0, 0]);

    // Select all includes half-stitched cells alongside full stitches.
    runWand(s, null).selectAll();
    expect(Array.from(s.selectionMask)).toEqual([1, 1, 1, 0]);

    // Invert includes half-stitched cells.
    runWand(s, new Uint8Array([0, 0, 1, 0])).invertSelection();
    expect(Array.from(s.selectionMask)).toEqual([1, 1, 0, 0]);

    // Select all of colour finds half-stitched red cells.
    runWand(s, null).selectAllOfColorId('321', 'replace');
    expect(Array.from(s.selectionMask)).toEqual([1, 1, 0, 0]);
  });

  test('undo/redo toast counts changed cells when only partialStitches change (half / to half \\)', () => {
    const s = fixture();
    runWand(s, new Uint8Array([1, 1, 0, 0])).convertSelectionStitchType('half-fwd');
    s.toasts.length = 0;
    runWand(s, new Uint8Array([1, 1, 0, 0])).convertSelectionStitchType('half-bck');
    expect(s.editHistory[1].changes).toEqual([]);
    expect(s.editHistory[1].psChanges).toHaveLength(2);

    window.useEditHistory(s).undoEdit();
    expect(s.toasts.pop().msg).toBe('Undo: reverted 2 cells');
    window.useEditHistory(s).redoEdit();
    expect(s.toasts.pop().msg).toBe('Redo: restored 2 cells');
  });

  test('passes psChanges to guardStitchedEdit for full-plus-quarter cells converted to full', () => {
    const s = fixture();
    s.partialStitches.set(0, { TL: q(BLACK) });
    const seen = [];
    s.guardStitchedEdit = (changes, np, psChanges) => { seen.push({ changes, psChanges }); return [0]; };
    runWand(s, new Uint8Array([1, 0, 0, 0])).convertSelectionStitchType('full');
    expect(seen).toHaveLength(1);
    expect(seen[0].psChanges).toHaveLength(1);
    expect(s.editHistory[0].doneReset).toEqual([0]);
  });

  test('creatorPartOnlyPaletteEntries restores palette entries for part-only threads on load', () => {
    const ioSrc = read('creator/useProjectIO.js');
    const fnMatch = ioSrc.match(/function creatorPartOnlyPaletteEntries[\s\S]*?\n\}\nwindow\.creatorPartOnlyPaletteEntries/);
    const restore = new Function('window', 'dedupeChartSymbols', 'restoreStitch',
      fnMatch[0] + ' = creatorPartOnlyPaletteEntries; return creatorPartOnlyPaletteEntries;')(
      window, global.dedupeChartSymbols, (m) => Object.assign({ name: 'Thread ' + m.id, rgb: m.rgb || [1, 2, 3] }, m)
    );
    const base = { pal: [BLACK], cmap: { '310': BLACK } };
    const ps = new Map([[0, { BL: q(RED), TR: q(RED) }]]);
    const extras = restore(base, ps, [{ colorId: '666', color: [200, 0, 0] }], [{ id: '700', rgb: [0, 128, 0] }], [{ thread: { id: '800', rgb: [0, 0, 200] } }], { '321': 'Z' }, 'dmc');
    expect(extras.map(e => e.id)).toEqual(['321', '666', '700', '800']);
    expect(extras[0].symbol).toBe('Z');
    expect(extras[0].count).toBe(0);
    // All assigned symbols are unique and don't collide with BLACK ('A').
    const syms = [BLACK.symbol].concat(extras.map(e => e.symbol));
    expect(new Set(syms).size).toBe(syms.length);
  });

  test('selectionStats counts half, 3/4 and 1/4 stitches at 0.25 per quadrant', () => {
    global.skeinEst = () => 1;
    const s = fixture();
    // Convert top row (two red cells) to half stitches -> 2 * 0.5 = 1.0 stitch equivalent.
    runWand(s, new Uint8Array([1, 1, 0, 0])).convertSelectionStitchType('half-fwd');
    // Put a black quarter over cell 2 (black full) -> 1.0 black, or a red quarter over cell 2 -> 0.75 black + 0.25 red.
    s.partialStitches.set(2, { TL: q(RED) });
    const stats = runWand(s, new Uint8Array([1, 1, 1, 0])).selectionStats;
    expect(stats.total).toBe(2);
    expect(stats.colors).toBe(2);
    expect(stats.rows).toEqual([
      expect.objectContaining({ id: '321', count: 1.25 }),
      expect.objectContaining({ id: '310', count: 0.75 })
    ]);
  });
});
