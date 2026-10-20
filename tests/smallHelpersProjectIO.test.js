/** @jest-environment jsdom */
const React = require('react');
const { createRoot } = require('react-dom/client');
const { act } = require('react-dom/test-utils');
const { Blob } = require('buffer');
const { browserScripts } = require('./_helpers/browserScripts');

describe('partial-stitch serialisation through Creator save boundaries', () => {
  let scope, root, host, state, io, download, previousAct;
  const expected = [
    [7, { TL: { id: '403', rgb: [1, 2, 3] }, TR: { id: '310', rgb: [0, 0, 0], brand: 'dmc' },
      BL: { id: '__skip__', rgb: [9, 9, 9], brand: 'dmc' }, BR: { id: 'custom:rose', rgb: [47, 83, 97] } }],
    [2, { TR: { id: '__empty__', rgb: [8, 8, 8], brand: 'dmc' } }],
    [4, {}]
  ];
  beforeAll(async () => {
    // tests/setup loads helpers.js, whose native load callback schedules a Safari
    // check. Let jsdom finish loading before this suite starts owning timers.
    await new Promise(resolve => setTimeout(resolve, 0));
  });
  beforeEach(async () => {
    previousAct = global.IS_REACT_ACT_ENVIRONMENT;
    global.IS_REACT_ACT_ENVIRONMENT = true;
    jest.useFakeTimers();
    jest.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
    const save = jest.fn(p => Promise.resolve(p.id));
    const shared = browserScripts(['helpers.js'], { addEventListener() {} });
    scope = browserScripts(['creator/useProjectIO.js'], {
      cellBrandForSave: shared.cellBrandForSave, threadBrandForSave: shared.threadBrandForSave,
      React, document, Blob, console, localStorage, sessionStorage,
      setTimeout, clearTimeout, setInterval, clearInterval,
      __pendingCreatorAction: 'scratch',
      addEventListener: jest.fn(window.addEventListener.bind(window)),
      removeEventListener: jest.fn(window.removeEventListener.bind(window)),
      URL: { createObjectURL: jest.fn(blob => { download = blob; return 'blob:test'; }), revokeObjectURL: jest.fn() },
      ProjectStorage: { save, setActiveProject: jest.fn(), newId: () => 'project-test' },
      saveProjectToDB: jest.fn(() => Promise.resolve())
    });
    state = {
      pat: Array.from({ length: 9 }, () => ({ id: '__skip__' })), pal: [], threadBrand: 'anchor',
      projectName: 'Rose', projectIdRef: { current: 'project-test' },
      createdAtRef: { current: '2026-01-01T00:00:00Z' },
      trackerFieldsRef: { current: { statsSessions: [{ id: 'session-kept' }] } },
      partialStitches: new Map([
        [7, { BR: { id: 'custom:rose', brand: 'anchor', rgb: [47, 83, 97], name: 'not saved' },
          BL: { id: '__skip__', rgb: [9, 9, 9] }, TR: { id: '310', rgb: [0, 0, 0] },
          TL: { id: '403', brand: 'anchor', rgb: [1, 2, 3], lab: [1, 2, 3] }, ignored: { id: '666' } }],
        [2, { TL: null, TR: { id: '__empty__', rgb: [8, 8, 8] }, BR: false }],
        [4, {}]
      ]),
      scrollRef: { current: { scrollLeft: 12, scrollTop: 34 } },
      sW: 3, sH: 3, fabricCt: 14, bsLines: [], done: new Uint8Array([1, 0, 0, 0, 0, 0, 0, 0, 0]),
      isActive: false, setNewDesignOpen: jest.fn(), addToast: jest.fn()
    };
    host = document.createElement('div');
    document.body.appendChild(host);
    root = createRoot(host);
    function Harness() { io = scope.useProjectIO(state, {}, { onSwitchToTrack: scope.onSwitch }); return null; }
    scope.onSwitch = jest.fn();
    scope.render = async () => { await act(async () => root.render(React.createElement(Harness))); };
    await scope.render();
  });
  afterEach(() => {
    try {
      act(() => root.unmount());
      jest.runAllTicks();
      expect(jest.getTimerCount()).toBe(0);
      expect(scope.removeEventListener).toHaveBeenCalledTimes(scope.addEventListener.mock.calls.length);
      scope.addEventListener.mock.calls.forEach(args => expect(scope.removeEventListener).toHaveBeenCalledWith(...args));
    } finally {
      // A failed lifecycle assertion must still leave the next case isolated.
      scope.addEventListener.mock.calls.forEach(args => window.removeEventListener(...args));
      host.remove();
      localStorage.clear(); sessionStorage.clear();
      jest.clearAllTimers(); jest.useRealTimers(); jest.restoreAllMocks();
      if (previousAct === undefined) delete global.IS_REACT_ACT_ENVIRONMENT;
      else global.IS_REACT_ACT_ENVIRONMENT = previousAct;
    }
  });
  function assertRecord(record) {
    expect(record.partialStitches).toEqual(expected);
    expect(Object.keys(record.partialStitches[0][1])).toEqual(['TL', 'TR', 'BL', 'BR']);
    expect(record.version).toBe(11);
    expect(record.settings.threadBrand).toBe('anchor');
    expect(record.statsSessions).toEqual([{ id: 'session-kept' }]);
  }
  test('JSON download keeps insertion order, quadrants, RGB, sentinels and relative brands', async () => {
    const before = JSON.stringify(Array.from(state.partialStitches));
    io.saveProject();
    assertRecord(JSON.parse(await download.text()));
    expect(scope.URL.revokeObjectURL).toHaveBeenCalledWith('blob:test');
    expect(JSON.stringify(Array.from(state.partialStitches))).toBe(before);
  });
  test('Tracker handoff waits for primary persistence and preserves the same partial payload', async () => {
    let finish;
    scope.ProjectStorage.save.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
    const pending = io.handleOpenInTracker();
    expect(scope.onSwitch).not.toHaveBeenCalled();
    expect(scope.saveProjectToDB).not.toHaveBeenCalled();
    finish('project-test');
    await pending;
    assertRecord(scope.ProjectStorage.save.mock.calls[0][0]);
    assertRecord(scope.onSwitch.mock.calls[0][0].project);
    expect(scope.saveProjectToDB).toHaveBeenCalledTimes(1);
  });
  test('active autosave and explicit backup flush serialise the latest snapshot', async () => {
    state = { ...state, isActive: true };
    // Avoid a mode-reactivation read in this fixture; it is independent of saving.
    scope.ProjectStorage.get = jest.fn(() => Promise.resolve(null));
    await scope.render();
    assertRecord(scope.ProjectStorage.save.mock.calls[0][0]);
    state = { ...state, partialStitches: new Map([[8, { BR: { id: '403', brand: 'anchor', rgb: [4, 5, 6] } }]]) };
    await scope.render();
    scope.ProjectStorage.save.mockClear();
    await scope.__flushProjectToIDB();
    expect(scope.ProjectStorage.save.mock.calls[0][0].partialStitches)
      .toEqual([[8, { BR: { id: '403', rgb: [4, 5, 6] } }]]);
    expect(scope.saveProjectToDB).toHaveBeenLastCalledWith(expect.any(Object), { strict: true });
  });
  test('flush rejects a refused primary save before attempting the legacy write', async () => {
    scope.CrossTabResolution = { saveWithConflictResolution: jest.fn(() => Promise.resolve({ ok: false })) };
    await expect(scope.__flushProjectToIDB()).rejects.toThrow('The current project was not saved.');
    expect(scope.saveProjectToDB).not.toHaveBeenCalled();
  });
  test('failed handoff persistence logs the error but still supplies the in-page Tracker', async () => {
    const failure = new Error('primary write failed');
    const error = jest.spyOn(console, 'error').mockImplementation(() => {});
    scope.ProjectStorage.save.mockRejectedValueOnce(failure);
    await io.handleOpenInTracker();
    expect(error).toHaveBeenCalledWith('ProjectStorage.save failed before switch-to-tracker:', failure);
    assertRecord(scope.onSwitch.mock.calls[0][0].project);
    expect(scope.saveProjectToDB).toHaveBeenCalledTimes(1);
  });
  test('a conflict reload stops the handoff before legacy persistence or switching', async () => {
    scope.CrossTabResolution = { saveWithConflictResolution: jest.fn(() => Promise.resolve({ reason: 'reloaded' })) };
    await io.handleOpenInTracker();
    expect(scope.saveProjectToDB).not.toHaveBeenCalled();
    expect(scope.onSwitch).not.toHaveBeenCalled();
  });
  test('backup flush propagates a strict legacy write failure', async () => {
    const failure = new Error('legacy write failed');
    scope.saveProjectToDB.mockRejectedValueOnce(failure);
    await expect(scope.__flushProjectToIDB()).rejects.toBe(failure);
  });
  test('missing optional brand helper retains the original id/RGB-only shape', async () => {
    scope.cellBrandForSave = undefined;
    io.doSaveProject('Rose');
    const record = JSON.parse(await download.text());
    expect(record.partialStitches[0][1].TR).toEqual({ id: '310', rgb: [0, 0, 0] });
  });
});
