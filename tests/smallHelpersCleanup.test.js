/** @jest-environment jsdom */
const React = require('react');
const { createRoot } = require('react-dom/client');
const { act } = require('react-dom/test-utils');
const { browserScripts } = require('./_helpers/browserScripts');

describe('cleanup entry lookup through applyCleanup', () => {
  let scope, host, root, hook, previousAct;
  beforeEach(() => {
    previousAct = global.IS_REACT_ACT_ENVIRONMENT;
    global.IS_REACT_ACT_ENVIRONMENT = true;
    scope = browserScripts(['creator/cleanupSharedHelpers.js', 'creator/useCleanupMode.js'], {
      React, dE2000: (a, b) => Math.abs(a[0] - b[0])
    });
    host = document.createElement('div'); document.body.appendChild(host); root = createRoot(host);
  });
  afterEach(() => {
    act(() => root.unmount()); host.remove();
    if (previousAct === undefined) delete global.IS_REACT_ACT_ENVIRONMENT;
    else global.IS_REACT_ACT_ENVIRONMENT = previousAct;
  });
  function mount(pat, selected) {
    const state = {
      pat, sW: 3, sH: 3, pal: [], cmap: {}, activeTool: 'cleanup', cleanupSelTool: 'click',
      cleanupPendingMask: Uint8Array.from(pat, (_, i) => selected.includes(i) ? 1 : 0),
      buildPaletteWithScratch: jest.fn(() => ({ pal: [], cmap: {} })),
      setPat: jest.fn(), setPal: jest.fn(), setCmap: jest.fn(), setEditHistory: jest.fn(),
      setRedoHistory: jest.fn(), setCleanupPendingMask: jest.fn(), EDIT_HISTORY_MAX: 50
    };
    function Harness() { hook = scope.useCleanupMode(state, {}); return null; }
    act(() => root.render(React.createElement(Harness)));
    return state;
  }
  test.each(['solid', 'blend'])('winner uses the first matching %s cell with its full custom metadata', type => {
    const first = { id: type === 'blend' ? '310+550' : '403', type, brand: 'anchor', rgb: [12, 34, 56], lab: [20, 0, 0], custom: 'first' };
    const later = { ...first, custom: 'later' };
    const old = { id: '666', rgb: [200, 0, 0] };
    const pat = [first, null, { id: '__skip__' }, later, old, { id: '__empty__' }, later, later, null];
    const state = mount(pat, [4]);
    act(() => hook.applyCleanup());
    const result = state.setPat.mock.calls[0][0];
    expect(result[4]).toBe(first);
    expect(result[4]).not.toBe(later);
    expect(pat[4]).toBe(old);
    expect(state.buildPaletteWithScratch).toHaveBeenCalledWith(result);
    expect(state.setEditHistory.mock.calls[0][0]([])).toEqual([{ type: 'cleanup', changes: [{ idx: 4, old }], doneReset: undefined }]);
    expect(state.setRedoHistory).toHaveBeenCalledWith([]);
    expect(state.setCleanupPendingMask).toHaveBeenCalledWith(null);
  });
  test('no valid neighbours keeps the original cell', () => {
    const old = { id: '310', rgb: [0, 0, 0] };
    const state = mount([null, { id: '__skip__' }, null, { id: '__empty__' }, old, null, null, null, null], [4]);
    act(() => hook.applyCleanup());
    expect(state.setPat.mock.calls[0][0][4]).toBe(old);
  });
  test('selecting every cell preserves its original entry when no voting neighbours remain', () => {
    const pat = Array.from({ length: 9 }, (_, i) => ({ id: i % 2 ? '310' : '666', rgb: [i, 0, 0] }));
    const state = mount(pat, [0, 1, 2, 3, 4, 5, 6, 7, 8]);
    act(() => hook.applyCleanup());
    const result = state.setPat.mock.calls[0][0];
    result.forEach((cell, i) => expect(cell).toBe(pat[i]));
  });
  test('adjacent replacements look up entries in the original snapshot even when the first match is replaced', () => {
    const first = { id: '403', brand: 'anchor', rgb: [12, 34, 56], custom: 'first' };
    const later = { ...first, custom: 'later' };
    const black = { id: '310', rgb: [0, 0, 0] };
    const old = { id: '666', rgb: [200, 0, 0] };
    const pat = [first, old, later, black, black, later, { id: '__empty__' }, later, later];
    const state = mount(pat, [0, 1]);
    act(() => hook.applyCleanup());
    const result = state.setPat.mock.calls[0][0];
    expect(result[0]).toBe(black);
    // The wider-neighbourhood tie-break chooses 403 for cell 1. Its first
    // original entry is cell 0, even though cell 0 itself is being changed.
    expect(result[1]).toBe(first);
    expect(pat[0]).toBe(first); expect(pat[1]).toBe(old);
    expect(state.setEditHistory.mock.calls[0][0]([])[0].changes).toEqual([
      { idx: 0, old: first }, { idx: 1, old }
    ]);
  });
  test('public lookup skips null cells, returns the first match or null, and honours ignoreBlend', () => {
    const blend = { id: '310+550', type: 'blend', rgb: [1, 2, 3] };
    const solid = { id: '310+550', type: 'solid', rgb: [4, 5, 6] };
    const pat = [null, blend, solid];
    expect(scope.cleanupFindEntry(pat, '310+550')).toBe(blend);
    expect(scope.cleanupFindEntry(pat, '310+550', { ignoreBlend: true })).toBe(solid);
    expect(scope.cleanupFindEntry(pat, 'absent')).toBeNull();
  });
});
