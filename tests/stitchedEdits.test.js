/* tests/stitchedEdits.test.js ─────────────────────────────────────────────
   UX-006: editing a stitched pattern must not leave inconsistent progress.
   An edit that changes the colour or type of a cell marked done sets it back
   to not done, in the same undo step; the Edit tab says so up front.
   ─────────────────────────────────────────────────────────────────────────── */

const fs = require('fs');
const path = require('path');

const read = (f) => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');
const window = {};
eval(read('creator/stitchedEdits.js')); // eslint-disable-line no-eval
eval(read('creator/colourReplace.js')); // eslint-disable-line no-eval
eval(read('creator/useEditHistory.js')); // eslint-disable-line no-eval
eval(read('creator/useMagicWand.js')); // eslint-disable-line no-eval
window.Knots = require('../knots.js');
global.window = window;
global.SYMS = require('../dmc-data.js').SYMS;
const cu = read('colour-utils.js');
const helperSrc = ['freeChartSymbol', 'dedupeChartSymbols', 'nextChartSymbol']
  .map((name) => cu.match(new RegExp('function ' + name + '[\\s\\S]*?\\n\\}'))[0]).join('\n');
Object.assign(global, new Function('SYMS', helperSrc + '; return { dedupeChartSymbols, nextChartSymbol };')(global.SYMS));
const SE = window.StitchedEdits;

const BLACK = { id: '310', type: 'solid', rgb: [0, 0, 0] };
const RED = { id: '321', type: 'solid', rgb: [199, 43, 59] };
const BLEND = { id: '310+321', type: 'blend', rgb: [100, 20, 30] };
const EMPTY = { id: '__empty__', rgb: [255, 255, 255] };
const SKIP = { id: '__skip__' };

describe('StitchedEdits.cellChanged', () => {
  test('a different colour or stitch type is a change', () => {
    expect(SE.cellChanged(BLACK, RED)).toBe(true);
    expect(SE.cellChanged(BLACK, BLEND)).toBe(true);
    expect(SE.cellChanged(BLACK, EMPTY)).toBe(true);
    expect(SE.cellChanged(EMPTY, BLACK)).toBe(true);
    expect(SE.cellChanged(BLACK, Object.assign({}, BLACK, { type: 'blend' }))).toBe(true);
  });
  test('the same thread is not, whatever else on the cell differs', () => {
    expect(SE.cellChanged(BLACK, Object.assign({}, BLACK, { symbol: 'X' }))).toBe(false);
    expect(SE.cellChanged({ id: '310' }, BLACK)).toBe(false);   // missing type means solid
  });
  test('background to empty (both blank) is not a stitch change', () => {
    expect(SE.cellChanged(SKIP, EMPTY)).toBe(false);
  });
});

describe('StitchedEdits.stitchedResets', () => {
  const done = new Uint8Array([1, 1, 0, 1]);
  const newPat = [RED, BLACK, RED, EMPTY];
  const changes = [
    { idx: 0, old: BLACK },   // done, now red       -> reset
    { idx: 1, old: BLACK },   // done, still black   -> kept
    { idx: 2, old: BLACK },   // not done            -> nothing to reset
    { idx: 3, old: BLACK }    // done, now erased    -> reset
  ];
  test('lists only done cells whose colour or type changed', () => {
    expect(SE.stitchedResets(done, changes, newPat)).toEqual([0, 3]);
  });
  test('ignores repeated indexes and out-of-range ones', () => {
    expect(SE.stitchedResets(done, [changes[0], changes[0], { idx: 99, old: BLACK }], newPat)).toEqual([0]);
  });
  test('returns nothing without progress, changes or a pattern', () => {
    expect(SE.stitchedResets(null, changes, newPat)).toEqual([]);
    expect(SE.stitchedResets(done, [], newPat)).toEqual([]);
    expect(SE.stitchedResets(done, changes, null)).toEqual([]);
  });
  test('clearDone and restoreDone return copies and leave the input alone', () => {
    const cleared = SE.clearDone(done, [0, 3]);
    expect(Array.from(cleared)).toEqual([0, 1, 0, 0]);
    expect(Array.from(done)).toEqual([1, 1, 0, 1]);
    expect(Array.from(SE.restoreDone(cleared, [0, 3]))).toEqual([1, 1, 0, 1]);
  });
  test('the toast text counts the cells', () => {
    expect(SE.resetMessage(1)).toBe('1 stitched cell reset to not done.');
    expect(SE.resetMessage(1234)).toBe((1234).toLocaleString() + ' stitched cells reset to not done.');
  });
});

// ── guardStitchedEdit, lifted out of useCreatorState and run on stubs ─────────
function loadGuard(initialDone) {
  const src = read('creator/useCreatorState.js');
  const start = src.indexOf('  var doneRef = useRef(done);');
  const end = src.indexOf('  // What the rest of the Creator sees');
  const body = src.slice(start, end);
  const calls = { setDone: [], toasts: [], undone: [] };
  const fn = new Function('window', 'useRef', 'useCallback', 'done', 'setDone', 'addToast',
    body + '\nreturn { guardStitchedEdit: guardStitchedEdit, undoGuardRef: undoGuardRef };');
  const api = fn(window, (v) => ({ current: v }), (f) => f, initialDone,
    (d) => calls.setDone.push(d), (msg, opts) => calls.toasts.push({ msg, opts }));
  api.undoGuardRef.current = (idxs) => calls.undone.push(idxs);
  return Object.assign(api, { calls });
}

describe('guardStitchedEdit (useCreatorState)', () => {
  test('resets the cells, toasts with an Undo button and returns the cells', () => {
    const g = loadGuard(new Uint8Array([1, 1, 0]));
    const res = g.guardStitchedEdit([{ idx: 0, old: BLACK }, { idx: 1, old: BLACK }], [RED, BLACK, RED]);
    expect(res).toEqual([0]);
    expect(Array.from(g.calls.setDone[0])).toEqual([0, 1, 0]);
    expect(g.calls.toasts).toHaveLength(1);
    expect(g.calls.toasts[0].msg).toBe('1 stitched cell reset to not done.');
    expect(g.calls.toasts[0].opts.action.label).toBe('Undo');
    g.calls.toasts[0].opts.action.onClick();
    expect(g.calls.undone).toEqual([[0]]);   // asks CreatorApp to undo, naming the cells
  });
  test('does nothing, and says nothing, when no stitched cell changed', () => {
    const g = loadGuard(new Uint8Array([0, 1, 0]));
    expect(g.guardStitchedEdit([{ idx: 0, old: BLACK }, { idx: 1, old: BLACK }], [RED, BLACK, RED])).toBeUndefined();
    expect(g.calls.setDone).toHaveLength(0);
    expect(g.calls.toasts).toHaveLength(0);
  });
  test('does nothing for a project with no done array', () => {
    const g = loadGuard(null);
    expect(g.guardStitchedEdit([{ idx: 0, old: BLACK }], [RED])).toBeUndefined();
    expect(g.calls.toasts).toHaveLength(0);
  });
  test('two edits before the next render both count', () => {
    const g = loadGuard(new Uint8Array([1, 1]));
    g.guardStitchedEdit([{ idx: 0, old: BLACK }], [RED, BLACK]);
    g.guardStitchedEdit([{ idx: 1, old: BLACK }], [RED, RED]);
    expect(Array.from(g.calls.setDone[1])).toEqual([0, 0]);
  });
});

// ── The edit paths, run for real against a plain-object store ────────────────
function runWand(state, mask) {
  let first = true;
  global.React = {
    useState: (init) => (first ? ((first = false), [mask, () => {}]) : [init, () => {}]),
    useMemo: () => null,
    useEffect: () => {}
  };
  return window.useMagicWand(state);
}

function makeStore(init) {
  const s = Object.assign({ editHistory: [], redoHistory: [], EDIT_HISTORY_MAX: 50, toasts: [] }, init);
  const setter = (k) => (v) => { s[k] = typeof v === 'function' ? v(s[k]) : v; };
  ['pat', 'pal', 'cmap', 'partialStitches', 'bsLines', 'knots', 'editHistory', 'redoHistory', 'selectionMask', 'done']
    .forEach((k) => { s['set' + k.charAt(0).toUpperCase() + k.slice(1)] = setter(k); });
  s.addToast = (msg, opts) => s.toasts.push({ msg, opts });
  s.buildPaletteWithScratch = (p) => {
    const cmap = {};
    p.forEach((c) => { if (c && c.id !== '__empty__' && c.id !== '__skip__') cmap[c.id] = c; });
    return { pal: Object.values(cmap), cmap };
  };
  // The real guard, bound to this store.
  const g = loadGuard(s.done);
  g.calls.setDone.push = (d) => { s.done = d; return 0; };
  s.guardStitchedEdit = (changes, np) => {
    const live = loadGuard(s.done);
    live.calls.setDone.push = (d) => { s.done = d; return 0; };
    live.calls.toasts.push = (t) => { s.toasts.push(t); return 0; };
    return live.guardStitchedEdit(changes, np);
  };
  return s;
}

// 4×1:  [310 310 321 310]   Tracker marked the first, second and third done.
function fixture() {
  return makeStore({
    sW: 4, sH: 1,
    pat: [BLACK, BLACK, RED, BLACK].map((c) => Object.assign({}, c)),
    cmap: { '310': BLACK, '321': RED },
    partialStitches: new Map(), bsLines: [], knots: [],
    done: new Uint8Array([1, 1, 1, 0])
  });
}
const counts = (s) => {
  const c = {};
  s.pat.forEach((cell, i) => {
    if (cell.id[0] === '_') return;
    c[cell.id] = c[cell.id] || { total: 0, done: 0 };
    c[cell.id].total++;
    if (s.done[i]) c[cell.id].done++;
  });
  return c;
};

describe('replacing a colour in a stitched pattern', () => {
  test('stitched cells that change colour go back to not done; the counts stay true', () => {
    const s = fixture();
    runWand(s, null).applyGlobalColourReplacement('310', '321', { scope: 'all' });
    expect(s.pat.map((c) => c.id)).toEqual(['321', '321', '321', '321']);
    expect(Array.from(s.done)).toEqual([0, 0, 1, 0]);          // only the red cell that stayed red is still done
    expect(counts(s)).toEqual({ '321': { total: 4, done: 1 } });
    expect(s.toasts.some((t) => t.msg === '2 stitched cells reset to not done.')).toBe(true);
  });

  test('the reset is part of the same undo step, and redo applies it again', () => {
    const s = fixture();
    runWand(s, null).applyGlobalColourReplacement('310', '321', { scope: 'all' });
    expect(s.editHistory).toHaveLength(1);
    expect(s.editHistory[0].doneReset).toEqual([0, 1]);

    const history = window.useEditHistory(s);
    history.undoEdit();                                          // one Undo...
    expect(s.pat.map((c) => c.id)).toEqual(['310', '310', '321', '310']);
    expect(Array.from(s.done)).toEqual([1, 1, 1, 0]);            // ...gives the stitching back
    expect(s.editHistory).toHaveLength(0);
    expect(s.redoHistory[0].doneReset).toEqual([0, 1]);

    history.redoEdit();
    expect(s.pat.map((c) => c.id)).toEqual(['321', '321', '321', '321']);
    expect(Array.from(s.done)).toEqual([0, 0, 1, 0]);
    expect(s.editHistory[0].doneReset).toEqual([0, 1]);
  });

  test('a replacement that touches no stitched cell resets nothing and adds no key', () => {
    const s = fixture();
    s.done = new Uint8Array([0, 0, 1, 0]);
    runWand(s, null).applyGlobalColourReplacement('310', '321', { scope: 'all' });
    expect(Array.from(s.done)).toEqual([0, 0, 1, 0]);
    expect(s.editHistory[0].doneReset).toBeUndefined();
    expect(s.toasts.some((t) => /reset to not done/.test(t.msg))).toBe(false);
  });

  test('swapping two colours resets every stitched cell of both', () => {
    const s = fixture();
    runWand(s, null).applyGlobalColourReplacement('310', '321', { scope: 'all', swap: true });
    expect(s.pat.map((c) => c.id)).toEqual(['321', '321', '310', '321']);
    expect(Array.from(s.done)).toEqual([0, 0, 0, 0]);
  });
});

describe('erasing stitched cells (deleteSelection)', () => {
  test('erased stitched cells are reset, others in the selection that were not done are untouched', () => {
    const s = fixture();
    const res = runWand(s, new Uint8Array([1, 0, 1, 1])).deleteSelection();
    expect(res.entry.doneReset).toEqual([0, 2]);
    expect(Array.from(s.done)).toEqual([0, 1, 0, 0]);
    const history = window.useEditHistory(s);
    history.undoEdit();
    expect(Array.from(s.done)).toEqual([1, 1, 1, 0]);
  });
});

describe('every edit path that writes the pattern asks the guard first', () => {
  const sites = [
    ['creator/useCanvasInteraction.js', /guardStitchedEdit\(ch, np2\)/],             // fill
    ['creator/useCanvasInteraction.js', /guardStitchedEdit\(changes, dragPatRef\.current\)/],   // paint, erase, shapes
    ['creator/useMagicWand.js', /guardStitchedEdit\(changes, np\)/],                  // confetti, reduction, replace, delete
    ['creator/useCleanupMode.js', /guardStitchedEdit\(changes, np\)/],
    ['creator/useDenoiseMode.js', /guardStitchedEdit\(changes, workingPat\)/],
    ['creator/useMoveSelection.js', /guardStitchedEdit\(patResult\.changes, patResult\.newPat\)/],
    ['creator/useSelectionClipboard.js', /guardStitchedEdit\(d\.changes, r\.pat\)/]   // paste, flip, rotate, text
  ];
  test.each(sites)('%s %s', (file, re) => {
    expect(read(file)).toMatch(re);
  });
  test('each of those stores the result on its history entry as doneReset', () => {
    ['creator/useCanvasInteraction.js', 'creator/useMagicWand.js', 'creator/useCleanupMode.js',
      'creator/useDenoiseMode.js', 'creator/useMoveSelection.js', 'creator/useSelectionClipboard.js']
      .forEach((f) => expect(read(f)).toMatch(/doneReset/));
  });
  // useMagicWand, useMoveSelection and useSelectionClipboard are called inside
  // useCreatorState with hand-built state objects, not the full state, so each
  // must be handed the guard or the reset is silently skipped.
  test.each([
    ['useMagicWand', /var wand = useMagicWand\(\{[\s\S]*?\n  \}\);/],
    ['_moveStateProxy', /var _moveStateProxy = \{[\s\S]*?\n  \};/],
    ['useSelectionClipboard', /window\.useSelectionClipboard\(\{[\s\S]*?\n  \}\);/]
  ])('%s is given guardStitchedEdit', (name, re) => {
    const block = read('creator/useCreatorState.js').match(re);
    expect(block).not.toBeNull();
    expect(block[0]).toMatch(/guardStitchedEdit: guardStitchedEdit/);
  });
  test('the full state returned by useCreatorState exposes the guard to the other hooks', () => {
    expect(read('creator/useCreatorState.js')).toMatch(/done, setDone, guardStitchedEdit, undoGuardRef,/);
  });
  test('the new module is bundled before the hooks that use it', () => {
    const b = read('build-creator-bundle.js');
    expect(b.indexOf("'stitchedEdits.js'")).toBeGreaterThan(-1);
    expect(b.indexOf("'stitchedEdits.js'")).toBeLessThan(b.indexOf("'useMagicWand.js'"));
    expect(read('creator/bundle.js')).toMatch(/window\.StitchedEdits = /);
  });
});

describe('the toast Undo only reverts that edit', () => {
  const main = read('creator-main.js');
  test('CreatorApp undoes only while the newest edit still carries those cells', () => {
    expect(main).toMatch(/state\.undoGuardRef\.current = function\(idxs\)\{/);
    expect(main).toMatch(/hist\[hist\.length-1\]\.doneReset===idxs\) stableUndoEdit\(\)/);
    expect(main).toMatch(/That edit has already been undone\./);
  });
});

describe('what the user is told', () => {
  const tab = read('creator/PatternTab.js');
  const state = read('creator/useCreatorState.js');
  test('the Regenerate warning names the real menu path', () => {
    expect(state).toMatch(/exporting a backup \(File > Export Backup\) before continuing/);
    expect(state).not.toMatch(/Project \\u203a Backup/);
  });
  test('Edit shows the stitched banner when the project has progress', () => {
    expect(tab).toMatch(/ctx\.progressPct > 0 && h\("div", \{\s*className:"stitched-banner"/);
    expect(tab).toMatch(/% stitched\. Changing stitched cells resets them to not done\./);
  });
  test('the banner offers a Show stitched overlay toggle', () => {
    expect(tab).toMatch(/"aria-pressed": !!cv\.showStitched/);
    expect(tab).toMatch(/Icons\.eye\(\), " Show stitched"\)/);   // one label; aria-pressed carries the state
    expect(read('creator-main.js')).toMatch(/showStitched: state\.showStitched, setShowStitched: state\.setShowStitched/);
    expect(read('creator/PatternCanvas.js')).toMatch(/cv\.showStitched/);
  });
  test('the canvas tints done cells only when the overlay is on and done matches the grid', () => {
    const r = read('creator/canvasRenderer.js');
    expect(r).toMatch(/state\.showStitched && state\.done && state\.done\.length === sW \* sH/);
    expect(r).toMatch(/stitchedDone\[sti\] !== 1/);
  });
  test('no emoji or arrow glyphs were added to the new copy', () => {
    const added = [tab, SE.resetMessage(3)].join('\n');
    expect(added).not.toMatch(/[✓✗⚠ℹ→←▸✕]/);
  });
});
