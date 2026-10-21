/** @jest-environment jsdom */
// Characterisation of the partial-stitch payload written by every Creator save
// flow in creator/useProjectIO.js (download, Tracker hand-off, active autosave).
// All three build the same `[[cellIndex, { TL?, TR?, BL?, BR? }]]` array; these
// cases pin the exact keys, key order, value identity, brand handling, ref read
// order and failure timing so the shared builder cannot change any of them.
const React = require('react');
const { createRoot } = require('react-dom/client');
const { act } = require('react-dom/test-utils');
const { Blob } = require('buffer');
const { browserScripts } = require('./_helpers/browserScripts');

describe('partial-stitch payload across Creator save flows', () => {
  let scope, root, host, state, io, download, previousAct, log, rgbRose, rgbBlack;
  beforeAll(async () => { await new Promise(resolve => setTimeout(resolve, 0)); });
  beforeEach(async () => {
    previousAct = global.IS_REACT_ACT_ENVIRONMENT;
    global.IS_REACT_ACT_ENVIRONMENT = true;
    jest.useFakeTimers();
    jest.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
    log = [];
    rgbRose = [47, 83, 97]; rgbBlack = [0, 0, 0];
    const shared = browserScripts(['helpers.js'], { addEventListener() {} });
    scope = browserScripts(['creator/useProjectIO.js'], {
      cellBrandForSave: function (cell, projectBrand) {
        log.push('brandFn:' + cell.id + ':' + projectBrand);
        return shared.cellBrandForSave(cell, projectBrand);
      },
      threadBrandForSave: shared.threadBrandForSave,
      React, document, Blob, console, localStorage, sessionStorage,
      setTimeout, clearTimeout, setInterval, clearInterval,
      __pendingCreatorAction: 'scratch',
      addEventListener: jest.fn(window.addEventListener.bind(window)),
      removeEventListener: jest.fn(window.removeEventListener.bind(window)),
      URL: { createObjectURL: jest.fn(blob => { download = blob; return 'blob:test'; }), revokeObjectURL: jest.fn() },
      ProjectStorage: { save: jest.fn(p => Promise.resolve(p.id)), setActiveProject: jest.fn(), newId: () => 'project-test', get: jest.fn(() => Promise.resolve(null)) },
      saveProjectToDB: jest.fn(() => Promise.resolve())
    });
    state = baseState(new Map());
    host = document.createElement('div');
    document.body.appendChild(host);
    root = createRoot(host);
    function Harness() { io = scope.useProjectIO(state, {}, { onSwitchToTrack: scope.onSwitch }); return null; }
    scope.onSwitch = jest.fn();
    scope.render = async () => { await act(async () => root.render(React.createElement(Harness))); };
  });
  afterEach(() => {
    try { act(() => root.unmount()); } finally {
      scope.addEventListener.mock.calls.forEach(args => window.removeEventListener(...args));
      host.remove();
      localStorage.clear(); sessionStorage.clear();
      jest.clearAllTimers(); jest.useRealTimers(); jest.restoreAllMocks();
      if (previousAct === undefined) delete global.IS_REACT_ACT_ENVIRONMENT;
      else global.IS_REACT_ACT_ENVIRONMENT = previousAct;
    }
  });

  function baseState(partialStitches, extra) {
    const s = {
      pat: Array.from({ length: 4 }, () => ({ id: '__skip__' })), pal: [],
      projectName: 'Rose', projectIdRef: { current: 'project-test' },
      createdAtRef: { current: '2026-01-01T00:00:00Z' },
      trackerFieldsRef: { current: {} },
      partialStitches,
      scrollRef: { current: null },
      sW: 2, sH: 2, fabricCt: 14, bsLines: [], done: null,
      isActive: false, setNewDesignOpen: jest.fn(), addToast: jest.fn()
    };
    let brand = 'anchor';
    Object.defineProperty(s, 'threadBrand', { enumerable: true, get() { log.push('read:threadBrand'); return brand; }, set(v) { brand = v; } });
    return Object.assign(s, extra);
  }
  function fixture() {
    // Deliberately out of numeric order, with custom colours, sentinels, an
    // undefined rgb, falsy quadrants and keys that must not be copied.
    return new Map([
      [9, { BR: { id: 'custom:rose', brand: 'anchor', rgb: rgbRose, name: 'dropped' }, TL: { id: '403', brand: 'dmc', rgb: [1, 2, 3], lab: [1] },
        BL: { id: '__skip__' }, TR: { id: '310', rgb: rgbBlack }, extra: { id: '666' } }],
      [2, { TL: null, TR: { id: '__empty__', rgb: [8, 8, 8] }, BR: false, BL: 0 }],
      [4, {}],
      [0, { TL: { id: '310', rgb: rgbBlack, brand: 'anchor' } }]
    ]);
  }
  const expectedFixture = () => [
    [9, { TL: { id: '403', rgb: [1, 2, 3], brand: 'dmc' }, TR: { id: '310', rgb: rgbBlack, brand: 'dmc' },
      BL: { id: '__skip__', rgb: undefined, brand: 'dmc' }, BR: { id: 'custom:rose', rgb: rgbRose } }],
    [2, { TR: { id: '__empty__', rgb: [8, 8, 8], brand: 'dmc' } }],
    [4, {}],
    [0, { TL: { id: '310', rgb: rgbBlack } }]
  ];
  const READS = ['read:threadBrand', 'brandFn:403:anchor', 'read:threadBrand', 'brandFn:310:anchor',
    'read:threadBrand', 'brandFn:__skip__:anchor', 'read:threadBrand', 'brandFn:custom:rose:anchor',
    'read:threadBrand', 'brandFn:__empty__:anchor', 'read:threadBrand', 'brandFn:310:anchor'];
  // Only the partial-stitch reads: strip unrelated reads of state.threadBrand.
  const partialLog = () => {
    const out = [];
    log.forEach((e, i) => { if (/^brandFn:/.test(e)) { out.push(log[i - 1], e); } });
    return out;
  };
  const shape = ps => ps.map(([k, e]) => [k, Object.keys(e).map(q => [q, Object.keys(e[q])])]);
  const shapeFixture = [
    [9, [['TL', ['id', 'rgb', 'brand']], ['TR', ['id', 'rgb', 'brand']], ['BL', ['id', 'rgb', 'brand']], ['BR', ['id', 'rgb']]]],
    [2, [['TR', ['id', 'rgb', 'brand']]]], [4, []], [0, [['TL', ['id', 'rgb']]]]
  ];

  function checkPayload(ps) {
    expect(ps).toEqual(expectedFixture());
    expect(shape(ps)).toEqual(shapeFixture);
    // rgb arrays are carried by reference, never deep-cloned.
    expect(ps[0][1].BR.rgb).toBe(rgbRose);
    expect(ps[0][1].TR.rgb).toBe(rgbBlack);
    expect(partialLog()).toEqual(READS);
  }

  test('download keeps the payload, key order and per-quadrant reads', async () => {
    state = baseState(fixture());
    await scope.render();
    log.length = 0;
    io.doSaveProject('Rose');
    const record = JSON.parse(await download.text());
    expect(record.partialStitches).toEqual(JSON.parse(JSON.stringify(expectedFixture())));
    // JSON drops the undefined rgb on the skip cell; every other key survives in order.
    expect(Object.keys(record.partialStitches[0][1])).toEqual(['TL', 'TR', 'BL', 'BR']);
    expect(Object.keys(record.partialStitches[0][1].BL)).toEqual(['id', 'brand']);
    expect(partialLog()).toEqual(READS);
    expect(state.addToast).toHaveBeenCalledWith('Project saved as "Rose.json"', { type: 'success', duration: 2500 });
  });

  test('Tracker hand-off persists and passes the same payload', async () => {
    state = baseState(fixture());
    await scope.render();
    log.length = 0;
    await io.handleOpenInTracker();
    checkPayload(scope.ProjectStorage.save.mock.calls[0][0].partialStitches);
    expect(scope.onSwitch.mock.calls[0][0].project.partialStitches).toBe(scope.ProjectStorage.save.mock.calls[0][0].partialStitches);
  });

  test('active autosave builds the snapshot synchronously with the same payload', async () => {
    state = baseState(fixture(), { isActive: true });
    await scope.render();
    checkPayload(scope.ProjectStorage.save.mock.calls[0][0].partialStitches);
    expect(scope.ProjectStorage.setActiveProject).toHaveBeenCalledWith('project-test');
  });

  test('inactive autosave still refreshes the snapshot used by the backup flush', async () => {
    state = baseState(fixture(), { isActive: false });
    await scope.render();
    expect(scope.ProjectStorage.save).not.toHaveBeenCalled();
    await scope.__flushProjectToIDB();
    checkPayload(scope.ProjectStorage.save.mock.calls[0][0].partialStitches);
  });

  test('empty and absent-brand data keep their original shape', async () => {
    state = baseState(new Map());
    await scope.render();
    log.length = 0;
    io.doSaveProject('Rose');
    expect(JSON.parse(await download.text()).partialStitches).toEqual([]);
    expect(partialLog()).toEqual([]);
    // With the helper missing, no brand lookup is attempted.
    state = baseState(new Map([[1, { TL: { id: '310', rgb: [0, 0, 0] } }]]));
    scope.cellBrandForSave = undefined;
    await scope.render();
    log.length = 0;
    await io.handleOpenInTracker();
    expect(scope.ProjectStorage.save.mock.calls[0][0].partialStitches).toEqual([[1, { TL: { id: '310', rgb: [0, 0, 0] } }]]);
    expect(log.some(e => /^brandFn/.test(e))).toBe(false);
  });

  test('a later save sees live Map contents and live threadBrand, not cached output', async () => {
    state = baseState(new Map([[1, { TL: { id: '310', rgb: [0, 0, 0] } }]]));
    await scope.render();
    io.doSaveProject('Rose');
    const first = JSON.parse(await download.text()).partialStitches;
    state.partialStitches.get(1).TL.id = '311';
    state.partialStitches.set(3, { BR: { id: '312', rgb: [3, 3, 3], brand: 'dmc' } });
    state.threadBrand = 'dmc';
    io.doSaveProject('Rose');
    const second = JSON.parse(await download.text()).partialStitches;
    expect(first).toEqual([[1, { TL: { id: '310', rgb: [0, 0, 0], brand: 'dmc' } }]]);
    expect(second).toEqual([[1, { TL: { id: '311', rgb: [0, 0, 0] } }], [3, { BR: { id: '312', rgb: [3, 3, 3] } }]]);
  });

  test('a missing partialStitches Map fails at the same point of each flow', async () => {
    state = baseState(new Map());
    await scope.render();
    state.partialStitches = null; // read at call time, so mutate the rendered state
    state.projectIdRef.current = null;
    state.createdAtRef.current = null;
    expect(() => io.doSaveProject('Rose')).toThrow(/forEach/);
    // Identity is assigned before the failure; nothing is downloaded or toasted.
    expect(state.projectIdRef.current).toBe('project-test');
    expect(state.createdAtRef.current).toEqual(expect.any(String));
    expect(scope.URL.createObjectURL).not.toHaveBeenCalled();
    expect(state.addToast).not.toHaveBeenCalled();
    state.projectIdRef.current = null;
    await expect(io.handleOpenInTracker()).rejects.toThrow(/forEach/);
    expect(state.projectIdRef.current).toBe('project-test');
    expect(scope.ProjectStorage.save).not.toHaveBeenCalled();
    expect(scope.onSwitch).not.toHaveBeenCalled();
  });

  test('autosave with a missing Map throws before identity or the active pointer are set', async () => {
    jest.spyOn(console, 'error').mockImplementation(() => {});
    state = baseState(null, { isActive: true });
    state.projectIdRef.current = null;
    state.createdAtRef.current = null;
    await expect(scope.render()).rejects.toThrow(/forEach/);
    expect(state.projectIdRef.current).toBe(null);
    expect(state.createdAtRef.current).toBe(null);
    expect(scope.ProjectStorage.setActiveProject).not.toHaveBeenCalled();
    expect(scope.ProjectStorage.save).not.toHaveBeenCalled();
  });

  test('a refused primary save in autosave rejects the flush without a legacy write', async () => {
    state = baseState(fixture(), { isActive: true });
    await scope.render();
    scope.ProjectStorage.save.mockRejectedValueOnce(new Error('disk full'));
    await expect(scope.__flushProjectToIDB()).rejects.toThrow('disk full');
    expect(scope.saveProjectToDB).toHaveBeenCalledTimes(1); // only the render-time save
  });
});
