// Two tabs, one project: marks from both are kept (tracking audit TRACK-03).
const fs = require('fs');
const path = require('path');
const TM = require('../tracking-merge.js');
const RES_SRC = fs.readFileSync(path.join(__dirname, '..', 'cross-tab-resolution.js'), 'utf8');
const TRACKER_SRC = fs.readFileSync(path.join(__dirname, '..', 'tracker-app.js'), 'utf8');

const pat = n => Array.from({ length: n }, (_, i) => ({ id: i % 2 ? '310' : '666', type: 'solid', rgb: [0, 0, 0] }));

describe('mergeDone', () => {
  test('a stitch marked in either tab stays marked', () => {
    const base = [0, 0, 0, 0], local = [1, 0, 0, 0], remote = [0, 0, 1, 0];
    expect(TM.mergeDone(base, local, remote)).toEqual([1, 0, 1, 0]);
  });
  test('a stitch unpicked in the other tab is not brought back by our older copy', () => {
    expect(TM.mergeDone([1, 1], [1, 1], [0, 1])).toEqual([0, 1]);
  });
  test('a stitch unpicked here is not brought back by the other tab', () => {
    expect(TM.mergeDone([1, 1], [0, 1], [1, 1])).toEqual([0, 1]);
  });
  test('both tabs marking the same cell gives one mark', () => {
    expect(TM.mergeDone([0], [1], [1])).toEqual([1]);
  });
});

describe('mergeHalfDone / mergeSet', () => {
  test('half stitch marks combine per side', () => {
    const out = TM.mergeHalfDone([], [[3, { fwd: true }]], [[3, { bck: true }], [5, { fwd: true }]]);
    expect(new Map(out).get(3)).toEqual({ fwd: true, bck: true });
    expect(new Map(out).get(5)).toEqual({ fwd: true });
  });
  test('a half stitch unpicked in the other tab goes', () => {
    expect(TM.mergeHalfDone([[3, { fwd: true }]], [[3, { fwd: true }]], [])).toEqual([]);
  });
  test('knots done: added in either, removed in either', () => {
    expect(TM.mergeSet(['a', 'b'], ['a', 'b', 'c'], ['a', 'd']).sort()).toEqual(['a', 'c', 'd']);
  });
});

describe('mergeSessions', () => {
  test('keeps ours, adds the ones the other tab recorded, drops ones it deleted', () => {
    const out = TM.mergeSessions([{ id: 1 }, { id: 2 }], [{ id: 1 }, { id: 2 }, { id: 3 }], [{ id: 1 }, { id: 4 }]);
    expect(out.map(s => s.id)).toEqual([1, 3, 4]);
  });
  test('a session both tabs hold appears once', () => {
    expect(TM.mergeSessions([], [{ id: 1 }], [{ id: 1 }]).length).toBe(1);
  });
});

describe('mergeSessions edits', () => {
  test('a session edited in the other tab takes the edit; one edited only here keeps ours', () => {
    const base = [{ id: 1, note: 'a' }, { id: 2, note: 'b' }];
    const local = [{ id: 1, note: 'a' }, { id: 2, note: 'mine' }];
    const remote = [{ id: 1, note: 'theirs' }, { id: 2, note: 'b' }];
    expect(TM.mergeSessions(base, local, remote)).toEqual([{ id: 1, note: 'theirs' }, { id: 2, note: 'mine' }]);
  });
});

describe('deletion tombstones merge as a set', () => {
  test('a deletion made in the other tab is added; an Undo there removes it again', () => {
    expect(TM.mergeSet([], [], ['s1'])).toEqual(['s1']);              // other tab deleted s1
    expect(TM.mergeSet(['s1'], ['s1'], [])).toEqual([]);              // it then took the deletion back
    expect(TM.mergeSet(['s1'], ['s1', 's2'], [])).toEqual(['s2']);    // our own new deletion survives their Undo
  });
});

describe('canMerge', () => {
  test('a session deleted in the other tab (a tombstone) is merged, not a reason to ask', () => {
    const r = { ...base(), deletedSessionIds: ['s1'] };
    expect(TM.canMerge(base(), { pattern: pat(4) }, r)).toBe(true);
  });
  const base = () => ({ pattern: pat(4), name: 'A', settings: { sW: 2, sH: 2 }, done: [0, 0, 0, 0] });
  test('marks only: yes', () => {
    const r = { ...base(), done: [1, 0, 0, 0], statsSessions: [{ id: 9 }] };
    expect(TM.canMerge(base(), { pattern: pat(4) }, r)).toBe(true);
  });
  test('renamed in the other tab: no (ask)', () => {
    expect(TM.canMerge(base(), { pattern: pat(4) }, { ...base(), name: 'B' })).toBe(false);
  });
  test('missing, empty string and empty list read the same', () => {
    const r = { ...base(), designer: '', bsLines: [], knots: [], parkMarkers: undefined };
    expect(TM.canMerge({ ...base(), designer: undefined, bsLines: undefined }, { pattern: pat(4) }, r)).toBe(true);
  });
  test('a setting spelled differently in the loaded base but equal to ours is not a change', () => {
    const b = { ...base(), settings: { sW: 2, sH: 2 } };
    const local = { pattern: pat(4), settings: { sW: 2, sH: 2, skeinPrice: 1 } };
    expect(TM.canMerge(b, local, { ...b, settings: { sW: 2, sH: 2, skeinPrice: 1 } })).toBe(true);
    expect(TM.canMerge(b, local, { ...b, settings: { sW: 3, sH: 2 } })).toBe(false);
  });
  test('any other persisted field changed in the other tab: no (it would be overwritten by our next save)', () => {
    ['statsSettings', 'threadOwned', 'originalPaletteState', 'stitchingStyle', 'workArea', 'blockW'].forEach(k => {
      expect(TM.canMerge({ ...base(), [k]: { a: 1 } }, { pattern: pat(4), [k]: { a: 1 } }, { ...base(), [k]: { a: 2 } })).toBe(false);
    });
  });
  test('view state and figures derived from stitching do not stop a merge', () => {
    const r = { ...base(), savedZoom: 3, savedScroll: { left: 5, top: 5 }, doneSnapshots: [1], stitchLog: [{ date: 'x', count: 2 }], totalTime: 99, lastTouchedAt: 'now', updatedAt: 'now' };
    expect(TM.canMerge(base(), { pattern: pat(4) }, r)).toBe(true);
  });
  test('same thread number but another brand, type or colour is a pattern change', () => {
    const r1 = base(); r1.pattern[0] = { ...r1.pattern[0], brand: 'anchor' };
    const r2 = base(); r2.pattern[0] = { ...r2.pattern[0], type: 'blend' };
    const r3 = base(); r3.pattern[0] = { ...r3.pattern[0], rgb: [9, 9, 9] };
    [r1, r2, r3].forEach(r => expect(TM.canMerge(base(), { pattern: pat(4) }, r)).toBe(false));
  });
  test('different pattern: no', () => {
    const r = base(); r.pattern[1] = { id: '999', type: 'solid', rgb: [1, 1, 1] };
    expect(TM.canMerge(base(), { pattern: pat(4) }, r)).toBe(false);
  });
  test('our pattern is a different size from the other tab\'s: no', () => {
    expect(TM.canMerge(base(), { pattern: pat(6) }, base())).toBe(false);
  });
  test('no marks array or wrong length: no', () => {
    expect(TM.canMerge(base(), { pattern: pat(4) }, { ...base(), done: null })).toBe(false);
    expect(TM.canMerge(base(), { pattern: pat(4) }, { ...base(), done: [0] })).toBe(false);
  });
  test('missing base: no', () => {
    expect(TM.canMerge(null, { pattern: pat(4) }, base())).toBe(false);
  });
});

describe('CrossTabResolution merger hook', () => {
  function load(show) {
    const win = {
      ConfirmDialog: { show },
      UserPrefs: { get: () => 'prompt' },
      CrossTabCoord: { onProjectChanged: () => () => {} },
      dispatchEvent: () => true, location: { reload: () => {} }, localStorage: { getItem: () => null }
    };
    new Function('window', 'localStorage', 'document', 'console', 'CustomEvent', RES_SRC)(win, win.localStorage, {}, console, class {});
    return win.CrossTabResolution;
  }
  test('a successful merge answers "merged" and asks nothing', async () => {
    const show = jest.fn();
    const api = load(show);
    api.registerMerger(async () => true);
    expect(await api.handle({ projectId: 'p' })).toBe('merged');
    expect(show).not.toHaveBeenCalled();
  });
  test('a merger that declines or throws falls back to the question', async () => {
    const show = jest.fn(() => Promise.resolve(false));
    const api = load(show);
    api.registerMerger(async () => false);
    expect(await api.handle({})).toBe('keep');
    api.registerMerger(async () => { throw new Error('x'); });
    expect(await api.handle({})).toBe('keep');
    expect(show).toHaveBeenCalledTimes(2);
  });
  test('unregistering restores the question', async () => {
    const show = jest.fn(() => Promise.resolve(false));
    const api = load(show);
    const off = api.registerMerger(async () => true);
    off();
    expect(await api.handle({})).toBe('keep');
    expect(show).toHaveBeenCalled();
  });
  test('two signals while a merge runs share one merge', async () => {
    const api = load(jest.fn());
    let calls = 0, release;
    api.registerMerger(() => { calls++; return new Promise(r => { release = r; }); });
    const a = api.handle({}), b = api.handle({});
    await Promise.resolve(); await Promise.resolve();
    release(true);
    expect(await Promise.all([a, b])).toEqual(['merged', 'merged']);
    expect(calls).toBe(1);
  });
  test('saveChecked conflict that merges reports reason "merged" and does not save', async () => {
    const save = jest.fn();
    const win = {
      ConfirmDialog: { show: jest.fn() }, UserPrefs: { get: () => 'prompt' },
      CrossTabCoord: { onProjectChanged: () => () => {} },
      ProjectStorage: { save, saveChecked: async () => ({ ok: false, reason: 'conflict', id: 'p' }) },
      dispatchEvent: () => true, location: { reload: () => {} }, localStorage: { getItem: () => null }
    };
    new Function('window', 'localStorage', 'document', 'console', 'CustomEvent', RES_SRC)(win, win.localStorage, {}, console, class {});
    win.CrossTabResolution.registerMerger(async () => true);
    const r = await win.CrossTabResolution.saveWithConflictResolution({ id: 'p' });
    expect(r).toEqual({ ok: false, id: 'p', reason: 'merged' });
    expect(save).not.toHaveBeenCalled();
  });
});

describe('tracker wiring', () => {
  test('the tracker registers a merger and treats "merged" as not-an-error everywhere a save result is read', () => {
    expect(TRACKER_SRC).toMatch(/registerMerger\(/);
    expect(TRACKER_SRC).toMatch(/if\(!isActive\|\|!window\.CrossTabResolution[\s\S]{0,200}\},\[isActive\]\);/);
    expect(TRACKER_SRC).toMatch(/noWriteReason\(saveResult\.reason\)/);
  });
  test('the base for a merge is recorded at load and after every successful save', () => {
    expect(TRACKER_SRC).toMatch(/mergeBaseRef\.current=project;/);
    expect(TRACKER_SRC).toMatch(/remember=function\(res\)/);
  });
});

describe('remapCandidates (pattern changed since the marks were saved)', () => {
  const marks = (w, h, at) => { const a = new Array(w * h).fill(0); at.forEach(([x, y]) => { a[y * w + x] = 1; }); return a; };
  test('a row added below: only the height-preserving reading fits a non-square pattern', () => {
    const c = TM.remapCandidates(marks(5, 6, [[0, 0], [4, 5]]), 5, 7, null);
    expect(c.length).toBe(1);
    expect(c[0]).toMatchObject({ oldW: 5, oldH: 6, kept: 2, lost: 0, kind: 'rows' });
    expect(c[0].done[5 * 5 + 4]).toBe(1);               // the bottom-right mark stays on its cell
  });
  test('rows removed: marks in the removed rows are lost, the rest kept', () => {
    const c = TM.remapCandidates(marks(5, 6, [[0, 0], [4, 5]]), 5, 4, null);
    expect(c.length).toBe(1);
    expect(c[0]).toMatchObject({ kept: 1, lost: 1 });
  });
  test('a column removed', () => {
    const c = TM.remapCandidates(marks(6, 4, [[0, 0], [5, 3]]), 5, 4, null);
    expect(c[0]).toMatchObject({ oldW: 6, oldH: 4, kept: 1, lost: 1, kind: 'columns' });
  });
  test('a square-ish pattern fits two readings and both are offered', () => {
    const c = TM.remapCandidates(new Array(30).fill(0), 5, 5, null);
    expect(c.map(x => x.kind)).toEqual(['rows', 'columns']);
  });
  test('no reading fits: nothing to offer', () => {
    expect(TM.remapCandidates(new Array(31).fill(0), 5, 7, null)).toEqual([]);
  });
  test('marks on cells that are now blank are not carried over', () => {
    const pat = Array.from({ length: 35 }, (_, i) => (i === 0 ? { id: '__skip__' } : { id: '310' }));
    const c = TM.remapCandidates(marks(5, 6, [[0, 0], [1, 0]]), 5, 7, pat);
    expect(c[0]).toMatchObject({ kept: 1, lost: 1 });
  });
  test('half-stitch marks follow their cells', () => {
    const out = TM.remapHalfDone([[6, { fwd: true }], [29, { bck: true }]], 5, 4, 4);   // old 5 wide; new 4x4
    expect(out).toEqual([[4 * 1 + 1, { fwd: true }]]);       // (1,1) stays; (4,5) falls outside
  });
});

describe('tracker: a mismatched load never zeroes silently', () => {
  test('the load path asks, holds every write, and the dialog offers keep / start again / leave', () => {
    expect(TRACKER_SRC).toMatch(/savesBlockedRef\.current=true;/);
    expect(TRACKER_SRC).toMatch(/if\(savesBlockedRef\.current\)return Promise\.resolve\(\{ok:false,reason:'held'\}\)/);
    expect(TRACKER_SRC).toMatch(/if \(savesBlockedRef\.current\) return;\s+\/\/ a question about the saved marks/);
    expect(TRACKER_SRC).toMatch(/!o\.id \|\| savesBlockedRef\.current/);
    expect(TRACKER_SRC).toMatch(/resolveReconcile\('again'\)/);
    expect(TRACKER_SRC).toMatch(/resolveReconcile\('home'\)/);
  });
  test('the earlier marks go to a snapshot before they are replaced', () => {
    expect(TRACKER_SRC).toMatch(/label:'Before pattern change'/);
  });
  test('Edit in Creator, the pending-session recovery, half-stitch gate and the shared overlay', () => {
    expect(TRACKER_SRC).toMatch(/function handleEditInCreator\(\)\{\s*if\(!pat\|\|!pal\)return;\s*if\(savesBlockedRef\.current\)return;/);
    expect(TRACKER_SRC).toMatch(/if\(!_reconcileHeld\)localStorage\.removeItem\(_pk\)/);
    expect(TRACKER_SRC).toMatch(/if\(_oldMarks>0\|\|_oldHalf>0\|\|_oldQuarter>0\)\{/);
    expect(TRACKER_SRC).toMatch(/dismissOnScrim=\{false\}/);
  });
  test('the recap waits for the reconciled figures', () => {
    expect(TRACKER_SRC).toMatch(/reconcileRef\.current\.recap=_recap/);
    expect(TRACKER_SRC).toMatch(/setResumeRecap\(\{\.\.\.rc\.recap,doneSt:kept\}\)/);
  });
  test('no-write save results are classified in one place', () => {
    expect(TRACKER_SRC).toMatch(/function noWriteReason\(r\)\{return r==='reloaded'\|\|r==='merged'\|\|r==='held';\}/);
    expect(TRACKER_SRC).not.toMatch(/reason\s*[!=]==\s*'reloaded'(?!\|\|r==='merged')/);
  });
});
