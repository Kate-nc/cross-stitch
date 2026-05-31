// INT-7 final wiring regression — saveChecked() must be used by the real
// Creator/Tracker save paths, not just exist in project-storage.js.

const fs = require('fs');
const path = require('path');

function read(rel) {
  return fs.readFileSync(path.join(__dirname, '..', rel), 'utf8');
}

const RES_SRC = read('cross-tab-resolution.js');
const CREATOR_IO_SRC = read('creator/useProjectIO.js');
const TRACKER_SRC = read('tracker-app.js');

function mkLocalStorage() {
  var store = {};
  return {
    getItem: function (k) { return Object.prototype.hasOwnProperty.call(store, k) ? store[k] : null; },
    setItem: function (k, v) { store[k] = String(v); },
    removeItem: function (k) { delete store[k]; }
  };
}

function loadResolutionInto(globalObj) {
  var fn = new Function(
    'window', 'localStorage', 'document', 'console',
    'try { ' + RES_SRC + ' } catch (e) { throw e; }'
  );
  fn(globalObj, globalObj.localStorage, globalObj.document, console);
  return globalObj.CrossTabResolution;
}

function mkGlobal(opts) {
  opts = opts || {};
  var ls = mkLocalStorage();
  var reloadCalls = 0;
  return {
    UserPrefs: opts.prefValue !== undefined
      ? { get: function (k) { return k === 'crossTabConflictPolicy' ? opts.prefValue : null; } }
      : null,
    ConfirmDialog: opts.confirmDialog || null,
    CrossTabCoord: {
      onProjectChanged: function () { return function () {}; },
      _suppressActiveToast: false
    },
    ProjectStorage: opts.projectStorage,
    localStorage: ls,
    document: { readyState: 'complete' },
    location: { reload: function () { reloadCalls++; } },
    _reloadCalls: function () { return reloadCalls; }
  };
}

describe('INT-7 saveWithConflictResolution helper', () => {
  test('is exposed on window.CrossTabResolution', () => {
    expect(RES_SRC).toMatch(/saveWithConflictResolution:\s*saveWithConflictResolution/);
  });

  test('successful saveChecked path sets active project and avoids plain save()', async () => {
    var save = jest.fn().mockResolvedValue('proj_ok');
    var saveChecked = jest.fn().mockResolvedValue({ ok: true, id: 'proj_ok' });
    var setActiveProject = jest.fn();
    var g = mkGlobal({
      prefValue: 'prompt',
      projectStorage: { save: save, saveChecked: saveChecked, setActiveProject: setActiveProject }
    });
    var R = loadResolutionInto(g);

    var result = await R.saveWithConflictResolution({ id: 'proj_ok' });

    expect(result).toEqual({ ok: true, id: 'proj_ok' });
    expect(saveChecked).toHaveBeenCalledTimes(1);
    expect(save).not.toHaveBeenCalled();
    expect(setActiveProject).toHaveBeenCalledWith('proj_ok');
  });

  test('conflict + keep decision performs a plain save overwrite', async () => {
    var save = jest.fn().mockResolvedValue('proj_keep');
    var saveChecked = jest.fn().mockResolvedValue({
      ok: false,
      reason: 'conflict',
      id: 'proj_keep',
      remoteWriteAt: 123,
      remoteWriteTabId: 'tab-other'
    });
    var setActiveProject = jest.fn();
    var g = mkGlobal({
      prefValue: 'prompt',
      confirmDialog: { show: function () { return Promise.resolve(false); } },
      projectStorage: { save: save, saveChecked: saveChecked, setActiveProject: setActiveProject }
    });
    var R = loadResolutionInto(g);

    var result = await R.saveWithConflictResolution({ id: 'proj_keep' });

    expect(saveChecked).toHaveBeenCalledTimes(1);
    expect(save).toHaveBeenCalledTimes(1);
    expect(result.ok).toBe(true);
    expect(result.resolvedConflict).toBe(true);
    expect(result.decision).toBe('keep');
    expect(setActiveProject).toHaveBeenCalledWith('proj_keep');
  });

  test('conflict + reload decision does not perform plain save overwrite', async () => {
    var save = jest.fn().mockResolvedValue('proj_reload');
    var saveChecked = jest.fn().mockResolvedValue({
      ok: false,
      reason: 'conflict',
      id: 'proj_reload',
      remoteWriteAt: 456,
      remoteWriteTabId: 'tab-other'
    });
    var setActiveProject = jest.fn();
    var g = mkGlobal({
      prefValue: 'reload',
      projectStorage: { save: save, saveChecked: saveChecked, setActiveProject: setActiveProject }
    });
    var R = loadResolutionInto(g);

    var result = await R.saveWithConflictResolution({ id: 'proj_reload' });

    expect(result).toEqual({ ok: false, id: 'proj_reload', reason: 'reloaded' });
    expect(saveChecked).toHaveBeenCalledTimes(1);
    expect(save).not.toHaveBeenCalled();
    expect(setActiveProject).not.toHaveBeenCalled();
    expect(g._reloadCalls()).toBe(1);
  });
});

describe('INT-7 wiring: Creator and Tracker save paths use the shared helper', () => {
  test('creator/useProjectIO defines persistProjectRecord via CrossTabResolution.saveWithConflictResolution', () => {
    expect(CREATOR_IO_SRC).toMatch(/persistProjectRecord\(project\)/);
    expect(CREATOR_IO_SRC).toMatch(/CrossTabResolution\.saveWithConflictResolution/);
  });

  test('creator autosave, flush, retry, and open-in-tracker route through persistProjectRecord', () => {
    expect(CREATOR_IO_SRC).toMatch(/function persistAll\(\)[\s\S]*?persistProjectRecord\(project5\)/);
    expect(CREATOR_IO_SRC).toMatch(/window\.__flushProjectToIDB = function\(\)[\s\S]*?persistProjectRecord\(p\)/);
    expect(CREATOR_IO_SRC).toMatch(/retryAutoSave:[\s\S]*?persistProjectRecord\(snap\)/);
    expect(CREATOR_IO_SRC).toMatch(/handleOpenInTracker[\s\S]*?persistProjectRecord\(project\)/);
  });

  test('tracker defines persistProjectRecord via CrossTabResolution.saveWithConflictResolution', () => {
    expect(TRACKER_SRC).toMatch(/function persistProjectRecord\(project\)/);
    expect(TRACKER_SRC).toMatch(/CrossTabResolution\.saveWithConflictResolution/);
  });

  test('tracker autosave, flush, handoff, and import saves route through persistProjectRecord', () => {
    expect(TRACKER_SRC).toMatch(/const saveTimer = setTimeout\(\(\) => \{[\s\S]*?persistProjectRecord\(project\)/);
    expect(TRACKER_SRC).toMatch(/window\.__flushProjectToIDB = async function\(\)[\s\S]*?persistProjectRecord\(project\)/);
    expect(TRACKER_SRC).toMatch(/handleEditInCreator\(\)[\s\S]*?persistProjectRecord\(project\)/);
    expect(TRACKER_SRC).toMatch(/persistProjectRecord\(projectData\)/);
    expect(TRACKER_SRC).toMatch(/persistProjectRecord\(project\)\.catch\(err => console\.error\("Import save failed:"/);
  });
});
