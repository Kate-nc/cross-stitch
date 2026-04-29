/* tests/saveStatusController.test.js — Proposal 2 auto-save state machine.
 * ════════════════════════════════════════════════════════════════════════
 * The controller is a pure ES5 module exported via window.SaveStatus and
 * module.exports, so we can require it directly. We exercise:
 *  - state-machine transitions: idle → pending → saving → saved → idle
 *  - debounce coalescing: many schedule() calls produce one save() call
 *  - error path: rejected promise sets status = 'error' and surfaces err
 *  - first-save callback: fires exactly once
 *  - flush(): runs the pending save immediately, bypassing the debounce
 *  - cancel(): drops the pending save without firing it
 *  - saved → idle fade after savedHoldMs
 *  - a fresh edit during the saved-fade clears the fade and re-arms pending
 * ════════════════════════════════════════════════════════════════════════ */
const path = require('path');
const SaveStatus = require(path.join('..', 'creator', 'saveStatus.js'));

describe('SaveStatus.createSaveController', () => {
  // Use Jest's fake timers so debounce / fade behave deterministically.
  beforeEach(() => { jest.useFakeTimers(); });
  afterEach(() => { jest.useRealTimers(); });

  function makeRecorder() {
    const calls = { status: [], savedAt: [], error: [], firstSave: [] };
    const callbacks = {
      onStatus:           s => calls.status.push(s),
      onSavedAt:          d => calls.savedAt.push(d),
      onError:            e => calls.error.push(e),
      onFirstSaveSuccess: id => calls.firstSave.push(id),
    };
    return { calls, callbacks };
  }

  test('happy path: idle → pending → saving → saved → idle', async () => {
    const { calls, callbacks } = makeRecorder();
    const ctrl = SaveStatus.createSaveController(callbacks, { debounceMs: 1000, savedHoldMs: 2500 });
    const saveFn = jest.fn().mockResolvedValue('proj_123');
    ctrl.schedule(saveFn);
    expect(calls.status).toEqual(['pending']);
    expect(saveFn).not.toHaveBeenCalled();
    // Advance past the debounce → save should run
    jest.advanceTimersByTime(1000);
    expect(saveFn).toHaveBeenCalledTimes(1);
    expect(calls.status).toEqual(['pending', 'saving']);
    // Flush the resolved save promise
    await Promise.resolve(); await Promise.resolve();
    expect(calls.status).toEqual(['pending', 'saving', 'saved']);
    expect(calls.savedAt.length).toBe(1);
    expect(calls.savedAt[0]).toBeInstanceOf(Date);
    expect(calls.firstSave).toEqual(['proj_123']);
    // Advance past the savedHoldMs → fade to idle
    jest.advanceTimersByTime(2500);
    expect(calls.status).toEqual(['pending', 'saving', 'saved', 'idle']);
  });

  test('debounce coalesces rapid edits into a single save', async () => {
    const { callbacks } = makeRecorder();
    const ctrl = SaveStatus.createSaveController(callbacks, { debounceMs: 1000 });
    const saveFn = jest.fn().mockResolvedValue(1);
    for (let i = 0; i < 10; i++) {
      ctrl.schedule(saveFn);
      jest.advanceTimersByTime(100); // less than debounceMs each
    }
    expect(saveFn).not.toHaveBeenCalled();
    jest.advanceTimersByTime(1000);
    expect(saveFn).toHaveBeenCalledTimes(1);
  });

  test('schedule() always uses the most recent saveFn supplied', async () => {
    const { callbacks } = makeRecorder();
    const ctrl = SaveStatus.createSaveController(callbacks, { debounceMs: 1000 });
    const stale = jest.fn().mockResolvedValue('stale');
    const fresh = jest.fn().mockResolvedValue('fresh');
    ctrl.schedule(stale);
    ctrl.schedule(fresh);
    jest.advanceTimersByTime(1000);
    expect(stale).not.toHaveBeenCalled();
    expect(fresh).toHaveBeenCalledTimes(1);
  });

  test('error path: rejected save sets status=error and reports the error', async () => {
    const { calls, callbacks } = makeRecorder();
    const ctrl = SaveStatus.createSaveController(callbacks, { debounceMs: 1000 });
    const boom = new Error('idb quota exceeded');
    const saveFn = jest.fn().mockRejectedValue(boom);
    // Suppress the deliberate console.error noise from the controller.
    const errSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    ctrl.schedule(saveFn);
    jest.advanceTimersByTime(1000);
    await Promise.resolve(); await Promise.resolve();
    expect(calls.status).toEqual(['pending', 'saving', 'error']);
    expect(calls.error[calls.error.length - 1]).toBe(boom);
    // First-save callback must NOT fire on error.
    expect(calls.firstSave).toEqual([]);
    errSpy.mockRestore();
  });

  test('error followed by successful retry flips error → saved and clears the error', async () => {
    const { calls, callbacks } = makeRecorder();
    const ctrl = SaveStatus.createSaveController(callbacks, { debounceMs: 1000 });
    const errSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    ctrl.schedule(jest.fn().mockRejectedValue(new Error('nope')));
    jest.advanceTimersByTime(1000);
    await Promise.resolve(); await Promise.resolve();
    expect(calls.status[calls.status.length - 1]).toBe('error');
    ctrl.schedule(jest.fn().mockResolvedValue('id'));
    jest.advanceTimersByTime(1000);
    await Promise.resolve(); await Promise.resolve();
    expect(calls.status[calls.status.length - 1]).toBe('saved');
    // Error must be cleared on success.
    expect(calls.error[calls.error.length - 1]).toBeNull();
    errSpy.mockRestore();
  });

  test('first-save callback fires exactly once across many saves', async () => {
    const { calls, callbacks } = makeRecorder();
    const ctrl = SaveStatus.createSaveController(callbacks, { debounceMs: 1000, savedHoldMs: 0 });
    for (let i = 0; i < 3; i++) {
      ctrl.schedule(jest.fn().mockResolvedValue('p' + i));
      jest.advanceTimersByTime(1000);
      await Promise.resolve(); await Promise.resolve();
    }
    expect(calls.firstSave.length).toBe(1);
    expect(calls.firstSave[0]).toBe('p0');
  });

  test('flush() runs the pending save immediately, bypassing the debounce', async () => {
    const { calls, callbacks } = makeRecorder();
    const ctrl = SaveStatus.createSaveController(callbacks, { debounceMs: 60_000 });
    const saveFn = jest.fn().mockResolvedValue('flushed');
    ctrl.schedule(saveFn);
    expect(saveFn).not.toHaveBeenCalled();
    const p = ctrl.flush();
    expect(saveFn).toHaveBeenCalledTimes(1);
    await p;
    expect(calls.status).toContain('saved');
  });

  test('cancel() drops the pending save without firing it', () => {
    const { callbacks } = makeRecorder();
    const ctrl = SaveStatus.createSaveController(callbacks, { debounceMs: 1000 });
    const saveFn = jest.fn();
    ctrl.schedule(saveFn);
    ctrl.cancel();
    jest.advanceTimersByTime(10_000);
    expect(saveFn).not.toHaveBeenCalled();
  });

  test('an edit during the saved-hold cancels the fade and arms a new pending', async () => {
    const { calls, callbacks } = makeRecorder();
    const ctrl = SaveStatus.createSaveController(callbacks, { debounceMs: 1000, savedHoldMs: 5000 });
    ctrl.schedule(jest.fn().mockResolvedValue('a'));
    jest.advanceTimersByTime(1000);
    await Promise.resolve(); await Promise.resolve();
    expect(calls.status[calls.status.length - 1]).toBe('saved');
    // Edit comes in mid-fade — must not appear as 'saved' once the next
    // schedule() runs, and the fade timer must be cancelled.
    ctrl.schedule(jest.fn().mockResolvedValue('b'));
    jest.advanceTimersByTime(5000); // would have fired the original fade
    // Status should be pending after the fresh schedule(); no idle in between.
    const idxSaved = calls.status.lastIndexOf('saved');
    const tail = calls.status.slice(idxSaved + 1);
    expect(tail[0]).toBe('pending');
    expect(tail).not.toContain('idle');
  });

  test('a synchronous throw inside saveFn is treated as an error', async () => {
    const { calls, callbacks } = makeRecorder();
    const ctrl = SaveStatus.createSaveController(callbacks, { debounceMs: 1000 });
    const errSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    ctrl.schedule(function () { throw new Error('synchronous boom'); });
    jest.advanceTimersByTime(1000);
    await Promise.resolve(); await Promise.resolve();
    expect(calls.status[calls.status.length - 1]).toBe('error');
    expect(calls.error[calls.error.length - 1]).toBeInstanceOf(Error);
    errSpy.mockRestore();
  });

  test('saveFn that returns a non-promise value is treated as success', async () => {
    const { calls, callbacks } = makeRecorder();
    const ctrl = SaveStatus.createSaveController(callbacks, { debounceMs: 0, savedHoldMs: 0 });
    ctrl.schedule(function () { return 'sync-id'; });
    jest.advanceTimersByTime(0);
    await Promise.resolve(); await Promise.resolve();
    expect(calls.status).toContain('saved');
    expect(calls.firstSave).toEqual(['sync-id']);
  });

  test('isPending / isInFlight / hasFirstSaveCompleted reflect the controller state', async () => {
    const { callbacks } = makeRecorder();
    const ctrl = SaveStatus.createSaveController(callbacks, { debounceMs: 1000 });
    expect(ctrl.isPending()).toBe(false);
    expect(ctrl.isInFlight()).toBe(false);
    expect(ctrl.hasFirstSaveCompleted()).toBe(false);
    let resolveSave;
    const slow = new Promise(r => { resolveSave = r; });
    ctrl.schedule(() => slow);
    expect(ctrl.isPending()).toBe(true);
    jest.advanceTimersByTime(1000);
    expect(ctrl.isPending()).toBe(false);
    expect(ctrl.isInFlight()).toBe(true);
    resolveSave('id');
    await Promise.resolve(); await Promise.resolve();
    expect(ctrl.isInFlight()).toBe(false);
    expect(ctrl.hasFirstSaveCompleted()).toBe(true);
  });
});

describe('Proposal 2 wiring: useProjectIO + creator-main integration points', () => {
  // These checks defend the contract that SaveStatusBadge / NamePromptModal
  // depend on. They read the source files directly so we don't need React /
  // IndexedDB to assert that the wiring is in place.
  const fs = require('fs');
  const useProjectIO  = fs.readFileSync(path.join(__dirname, '..', 'creator', 'useProjectIO.js'),  'utf8');
  const useCreator    = fs.readFileSync(path.join(__dirname, '..', 'creator', 'useCreatorState.js'), 'utf8');
  const creatorMain   = fs.readFileSync(path.join(__dirname, '..', 'creator-main.js'),               'utf8');
  const header        = fs.readFileSync(path.join(__dirname, '..', 'header.js'),                     'utf8');

  test('useCreatorState exposes the saveStatus / savedAt / saveError trio', () => {
    expect(useCreator).toMatch(/setSaveStatus/);
    expect(useCreator).toMatch(/setSavedAt/);
    expect(useCreator).toMatch(/setSaveError/);
    expect(useCreator).toMatch(/setNameModalReason/);
    // Returned by the hook (so consumers can read it).
    expect(useCreator).toMatch(/saveStatus,\s*setSaveStatus/);
    expect(useCreator).toMatch(/savedAt,\s*setSavedAt/);
    expect(useCreator).toMatch(/saveError,\s*setSaveError/);
  });

  test('useProjectIO drives the auto-save through SaveStatus.createSaveController', () => {
    expect(useProjectIO).toMatch(/window\.SaveStatus[\s\S]*createSaveController/);
    expect(useProjectIO).toMatch(/onFirstSaveSuccess/);
    expect(useProjectIO).toMatch(/setNameModalReason\("firstSave"\)/);
    // The legacy silent-error swallowers must be gone from the auto-save path.
    // (The whole auto-save effect block now goes through the controller, which
    // calls onError → setSaveError, so no `.catch(function() {})` should
    // appear inside `function persistAll`.)
    const persistMatch = useProjectIO.match(/function persistAll\(\) \{[\s\S]*?\n    \}/);
    expect(persistMatch).not.toBeNull();
    expect(persistMatch[0]).not.toMatch(/\.catch\(function\(\)\s*\{\s*\}\)/);
  });

  test('useProjectIO exposes retryAutoSave for the SaveStatusBadge Retry button', () => {
    expect(useProjectIO).toMatch(/retryAutoSave\s*:\s*function/);
  });

  test('creator-main routes the firstSave name-prompt without triggering a download', () => {
    expect(creatorMain).toMatch(/nameModalReason==='firstSave'/);
    // The legacy download-name path still calls io.doSaveProject.
    expect(creatorMain).toMatch(/io\.doSaveProject\(name\)/);
  });

  test('Header passes saveStatus / savedAt / saveError / onRetrySave through to the badge', () => {
    expect(header).toMatch(/SaveStatusBadge/);
    expect(header).toMatch(/saveStatus,\s*savedAt,\s*saveError,\s*onRetrySave/);
    // All five status branches must be handled.
    expect(header).toMatch(/effective === 'pending'/);
    expect(header).toMatch(/effective === 'saving'/);
    expect(header).toMatch(/effective === 'error'/);
    expect(header).toMatch(/effective === 'saved'/);
    // Retry button is wired only when status === 'error' AND onRetry is set.
    expect(header).toMatch(/effective === 'error' && typeof onRetry === 'function'/);
  });
});
