/* tests/deleteSelection.test.js ─────────────────────────────────────────────
   "Delete" on a selection clears full stitches, part stitches and backstitch
   lines inside it in one undo step, and the real useEditHistory restores
   (and re-applies) all three.
   ─────────────────────────────────────────────────────────────────────────── */

const fs = require('fs');
const path = require('path');

const window = {};
const read = (f) => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');
eval(read('creator/colourReplace.js')); // eslint-disable-line no-eval
eval(read('creator/useEditHistory.js')); // eslint-disable-line no-eval
eval(read('creator/useMagicWand.js')); // eslint-disable-line no-eval

const BLACK = { id: '310', type: 'solid', rgb: [0, 0, 0] };
const RED = { id: '321', type: 'solid', rgb: [199, 43, 59] };

// Run the hook with a stub React whose first useState (the selection mask)
// starts at `mask`.
function runWand(state, mask) {
  let first = true;
  global.React = {
    useState: (init) => {
      if (first) { first = false; return [mask, () => {}]; }
      return [init, () => {}];
    },
    useMemo: () => null, // selection stats aren't needed here
    useEffect: () => {}
  };
  return window.useMagicWand(state);
}

// Plain-object store that applies setter calls (value or updater function).
function makeStore(init) {
  const s = Object.assign({ editHistory: [], redoHistory: [], EDIT_HISTORY_MAX: 50, toasts: [] }, init);
  const setter = (k) => (v) => { s[k] = typeof v === 'function' ? v(s[k]) : v; };
  ['pat', 'pal', 'cmap', 'partialStitches', 'bsLines', 'editHistory', 'redoHistory', 'selectionMask']
    .forEach(k => { s['set' + k.charAt(0).toUpperCase() + k.slice(1)] = setter(k); });
  s.addToast = (msg, opts) => s.toasts.push({ msg: msg, type: opts && opts.type });
  s.buildPaletteWithScratch = (p) => {
    const cmap = {};
    p.forEach(c => { if (c && c.id !== '__empty__' && c.id !== '__skip__') cmap[c.id] = c; });
    return { pal: Object.values(cmap), cmap: cmap };
  };
  return s;
}

// 3×2 grid:  [310 321 skip]
//            [310 310 321 ]
function fixture() {
  return makeStore({
    sW: 3, sH: 2,
    pat: [BLACK, RED, { id: '__skip__' }, BLACK, BLACK, RED].map(c => Object.assign({}, c)),
    cmap: { '310': BLACK, '321': RED },
    partialStitches: new Map([
      [1, { TL: { id: '310', rgb: [0, 0, 0] } }],
      [5, { BR: { id: '321', rgb: [199, 43, 59] } }]
    ]),
    bsLines: [
      { x1: 0, y1: 1, x2: 1, y2: 1, colorId: '310' }, // between cells 0 and 3
      { x1: 1, y1: 0, x2: 1, y2: 1, colorId: '310' }, // between cells 0 and 1
      { x1: 0, y1: 0, x2: 1, y2: 1, colorId: '310' }  // diagonal in cell 0
    ]
  });
}

describe('deleteSelection', () => {
  test('clears full stitches, part stitches and enclosed backstitch in the selection', () => {
    const s = fixture();
    // Select cells 0, 2 (background) and 3.
    const wand = runWand(s, new Uint8Array([1, 0, 1, 1, 0, 0]));
    const res = wand.deleteSelection();

    expect(s.pat.map(c => c.id)).toEqual(['__empty__', '321', '__skip__', '__empty__', '310', '321']);
    expect([...s.partialStitches.keys()]).toEqual([1, 5]); // neither part stitch is selected
    // Edge between 0 and 3 (both selected) and the diagonal in 0 go;
    // the edge between 0 and 1 stays because cell 1 isn't selected.
    expect(s.bsLines).toEqual([{ x1: 1, y1: 0, x2: 1, y2: 1, colorId: '310' }]);
    expect(res.counts).toEqual({ full: 2, partial: 0, backstitch: 2 });
    expect(s.editHistory).toHaveLength(1);
    expect(s.editHistory[0].type).toBe('deleteSelection');
    expect(s.toasts.pop()).toEqual({ msg: 'Deleted 2 stitches and 2 backstitch lines.', type: 'success' });
  });

  test('removes part stitches in selected cells and leaves the input untouched', () => {
    const s = fixture();
    const origPs = s.partialStitches, origPat = s.pat;
    runWand(s, new Uint8Array([0, 1, 0, 0, 0, 0])).deleteSelection();
    expect(s.pat[1].id).toBe('__empty__');
    expect([...s.partialStitches.keys()]).toEqual([5]);
    expect(origPs.has(1)).toBe(true);
    expect(origPat[1].id).toBe('321');
  });

  test('palette drops colours no longer used', () => {
    const s = fixture();
    runWand(s, new Uint8Array([0, 1, 0, 0, 0, 1])).deleteSelection();
    expect(Object.keys(s.cmap)).toEqual(['310']);
  });

  test('one undo restores everything, redo deletes it again', () => {
    const s = fixture();
    const before = { pat: s.pat.map(c => c.id), ps: [...s.partialStitches.keys()], bs: s.bsLines.slice() };
    runWand(s, new Uint8Array([1, 1, 0, 1, 0, 0])).deleteSelection();
    const after = { pat: s.pat.map(c => c.id), ps: [...s.partialStitches.keys()], bs: s.bsLines.slice() };
    expect(after.ps).toEqual([5]);

    const history = window.useEditHistory(s);
    history.undoEdit();
    expect(s.pat.map(c => c.id)).toEqual(before.pat);
    expect([...s.partialStitches.keys()].sort()).toEqual(before.ps);
    expect(s.bsLines).toEqual(before.bs);
    expect(s.editHistory).toHaveLength(0);

    history.redoEdit();
    expect(s.pat.map(c => c.id)).toEqual(after.pat);
    expect([...s.partialStitches.keys()]).toEqual(after.ps);
    expect(s.bsLines).toEqual(after.bs);
  });

  test('does nothing (and says so) when the selection holds no stitches', () => {
    const s = fixture();
    const pat = s.pat;
    const res = runWand(s, new Uint8Array([0, 0, 1, 0, 0, 0])).deleteSelection();
    expect(res).toBeNull();
    expect(s.pat).toBe(pat);
    expect(s.editHistory).toHaveLength(0);
    expect(s.toasts.pop().type).toBe('info');
  });

  // A pasted or turned selection (useSelectionClipboard) is deleted as a
  // whole instead: a lifted one is removed, a paste discarded.
  test('is blocked while a moved selection is still floating', () => {
    // A floating move is rebuilt from its start snapshot on commit, which would
    // silently overwrite a delete made mid-move.
    expect(read('creator/useCreatorState.js')).toMatch(
      /deleteSelection: function\(\) \{\s*if \(clip\.floatActive\) return clip\.deleteFloat\(\);\s*if \(move\.floatActive\) \{[\s\S]*?return null;\s*\}\s*return wand\.deleteSelection\(\);/);
    expect(read('creator/useKeyboardShortcuts.js')).toMatch(/creator\.deleteSel[\s\S]*?!state\.floatActive/);
  });

  test('no selection is a no-op', () => {
    const s = fixture();
    expect(runWand(s, null).deleteSelection()).toBeNull();
    expect(s.editHistory).toHaveLength(0);
  });
});
