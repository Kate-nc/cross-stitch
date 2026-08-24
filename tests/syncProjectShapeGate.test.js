// Regression tests for sync fix #2 — the auto-apply integrity gate must
// recognise the project shape the app actually produces.
//
// The bug: _isProjectShapeValid required top-level numeric `w` / `h`, but the
// Creator persists dimensions ONLY as settings.sW / settings.sH (see
// creator/useProjectIO.js). Every Creator-authored project therefore failed
// the gate, _isPlanAutoApplicable returned false for the entire batch, and
// the first sync to a new device was pushed to manual review.

const fs = require('fs');
const pako = require('pako');

global.window = global.window || {};
global.localStorage = (() => {
  const store = {};
  return {
    getItem(k) { return store[k] !== undefined ? store[k] : null; },
    setItem(k, v) { store[k] = String(v); },
    removeItem(k) { delete store[k]; },
    clear() { Object.keys(store).forEach(k => delete store[k]); }
  };
})();
global.pako = pako;
global.indexedDB = undefined;
global.ProjectStorage = { listProjects: async () => [], get: async () => null, save: async p => p.id };

eval(fs.readFileSync('./sync-engine.js', 'utf8'));
const SE = global.SyncEngine || global.window.SyncEngine;

function pattern(n) {
  const out = [];
  for (let i = 0; i < n; i++) out.push({ id: String(310 + (i % 3)) });
  return out;
}

// Exactly what creator/useProjectIO.js builds: settings.sW/sH, no w/h.
function creatorProject(overrides) {
  return Object.assign({
    version: 11, id: 'proj_1755000000000_ab12', page: 'creator', name: 'Roses',
    createdAt: '2026-07-01T09:00:00.000Z', updatedAt: '2026-08-23T10:00:00.000Z',
    settings: { sW: 80, sH: 80, fabricCt: 14 },
    pattern: pattern(6400), bsLines: [], done: new Array(6400).fill(0)
  }, overrides || {});
}

// Tracker/importer shape: top-level w/h present as well.
function trackerProject(overrides) {
  return Object.assign(creatorProject({ id: 'proj_1755000000001_cd34' }), { w: 80, h: 80 }, overrides || {});
}

describe('sync fix #2 — dimension accessors agree with computeFingerprint', () => {
  test('reads dimensions from settings.sW/sH when top-level w/h is absent', () => {
    const p = creatorProject();
    expect(p.w).toBeUndefined();
    expect(SE._test.projectWidth(p)).toBe(80);
    expect(SE._test.projectHeight(p)).toBe(80);
  });

  test('falls back to top-level w/h when settings has no dimensions', () => {
    const p = { w: 40, h: 30, settings: { fabricCt: 14 } };
    expect(SE._test.projectWidth(p)).toBe(40);
    expect(SE._test.projectHeight(p)).toBe(30);
  });

  test('settings wins when both are present, matching computeFingerprint', () => {
    const p = { settings: { sW: 80, sH: 80 }, w: 12, h: 12 };
    expect(SE._test.projectWidth(p)).toBe(80);
    // computeFingerprint has always preferred settings — stay consistent.
    const fp = SE.computeFingerprint({ settings: { sW: 80, sH: 80 }, w: 12, h: 12, pattern: pattern(16) });
    expect(fp).toContain('80x80');
  });
});

describe('sync fix #2 — Creator projects pass the integrity gate', () => {
  test('a Creator-authored project is now shape-valid', () => {
    expect(SE._test.isProjectShapeValid(creatorProject())).toBe(true);
  });

  test('a Tracker-authored project is still shape-valid', () => {
    expect(SE._test.isProjectShapeValid(trackerProject())).toBe(true);
  });

  test('a first-ever sync of Creator projects is auto-applicable', () => {
    const plan = {
      conflicts: [], mergeTracking: [],
      newRemote: [
        { remote: { data: creatorProject() } },
        { remote: { data: trackerProject() } }
      ]
    };
    expect(SE._test.isPlanAutoApplicable(plan)).toBe(true);
  });
});

describe('sync fix #2 — genuinely malformed records are still rejected', () => {
  test('rejects a project with no dimensions anywhere', () => {
    const p = creatorProject();
    delete p.settings;
    expect(SE._test.isProjectShapeValid(p)).toBe(false);
  });

  test('rejects non-numeric settings dimensions', () => {
    expect(SE._test.isProjectShapeValid(creatorProject({ settings: { sW: '80', sH: '80' } }))).toBe(false);
  });

  test('rejects zero, negative and absurd dimensions', () => {
    expect(SE._test.isProjectShapeValid(creatorProject({ settings: { sW: 0, sH: 80 } }))).toBe(false);
    expect(SE._test.isProjectShapeValid(creatorProject({ settings: { sW: -5, sH: 80 } }))).toBe(false);
    expect(SE._test.isProjectShapeValid(creatorProject({ settings: { sW: 99999, sH: 80 } }))).toBe(false);
  });

  test('rejects NaN dimensions', () => {
    expect(SE._test.isProjectShapeValid(creatorProject({ settings: { sW: NaN, sH: 80 } }))).toBe(false);
  });

  test('rejects a missing or non-array pattern', () => {
    expect(SE._test.isProjectShapeValid(creatorProject({ pattern: undefined }))).toBe(false);
    expect(SE._test.isProjectShapeValid(creatorProject({ pattern: 'nope' }))).toBe(false);
  });

  test('rejects an obviously truncated pattern, sized against settings dims', () => {
    // 80x80 = 6400 expected; anything under 3200 is treated as corrupt.
    expect(SE._test.isProjectShapeValid(creatorProject({ pattern: pattern(100) }))).toBe(false);
    expect(SE._test.isProjectShapeValid(creatorProject({ pattern: pattern(4000) }))).toBe(true);
  });

  test('rejects a missing id', () => {
    expect(SE._test.isProjectShapeValid(creatorProject({ id: '' }))).toBe(false);
    expect(SE._test.isProjectShapeValid(null)).toBe(false);
  });
});
