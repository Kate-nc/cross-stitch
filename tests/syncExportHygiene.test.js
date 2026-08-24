// Tests for sync fix #9 — export hygiene.
//
// Two independent problems, both measured on a real device:
//   • Source photos (project.imgData, base64 data URLs) dominated the payload:
//     a 17-pattern library serialised to 5.93 MB.
//   • The auto-export debounce leaked. The timer handle was cleared at the
//     START of its callback, before the async write finished, and the cooldown
//     was measured from the last *completed* export. A save arriving mid-write
//     saw no scheduled timer and a stale "last export", so it scheduled another
//     write on the 2s fast path — 20 exports in 3.5 minutes.

const fs = require('fs');
const path = require('path');
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

const BIG_IMAGE = 'data:image/png;base64,' + 'A'.repeat(200000);

function mkProject(id) {
  const pattern = [];
  for (let i = 0; i < 400; i++) pattern.push({ id: String(310 + (i % 4)) });
  return {
    id, name: id, updatedAt: '2026-08-23T10:00:00.000Z',
    settings: { sW: 20, sH: 20 }, pattern, done: new Array(400).fill(0),
    imgData: BIG_IMAGE
  };
}

const PROJECTS = ['proj_1', 'proj_2', 'proj_3'].map(mkProject);
global.ProjectStorage = {
  listProjects: async () => PROJECTS.map(p => ({ id: p.id, updatedAt: p.updatedAt })),
  get: async id => PROJECTS.find(p => p.id === id) || null,
  save: async p => p.id
};

eval(fs.readFileSync('./sync-engine.js', 'utf8'));
const SE = global.SyncEngine || global.window.SyncEngine;

const _origWarn = console.warn;
beforeAll(() => {
  console.warn = function () {
    if (String(arguments[0] || '').indexOf('SyncEngine:') === 0) return;
    _origWarn.apply(console, arguments);
  };
});
afterAll(() => { console.warn = _origWarn; });

beforeEach(() => localStorage.clear());

describe('fix #9 — source photos are excluded by default', () => {
  test('exported projects carry no imgData', async () => {
    const syncObj = await SE.exportSync();
    expect(syncObj.projects.length).toBe(3);
    for (const entry of syncObj.projects) {
      expect(entry.data.imgData).toBeUndefined();
    }
  });

  test('the in-memory project keeps its image — we only strip the copy', async () => {
    await SE.exportSync();
    for (const p of PROJECTS) expect(p.imgData).toBe(BIG_IMAGE);
  });

  test('the payload shrinks dramatically', async () => {
    const withImages = await SE.exportSync({ includeSourceImages: true });
    const without = await SE.exportSync({ includeSourceImages: false });
    const bigger = JSON.stringify(withImages).length;
    const smaller = JSON.stringify(without).length;
    expect(smaller * 10).toBeLessThan(bigger);
  });

  test('opting in restores the images', async () => {
    const syncObj = await SE.exportSync({ includeSourceImages: true });
    for (const entry of syncObj.projects) {
      expect(entry.data.imgData).toBe(BIG_IMAGE);
    }
  });

  test('stripping does not change the fingerprint, so classification is unaffected', async () => {
    const stripped = await SE.exportSync({ includeSourceImages: false });
    const full = await SE.exportSync({ includeSourceImages: true });
    for (let i = 0; i < stripped.projects.length; i++) {
      expect(stripped.projects[i].fingerprint).toBe(full.projects[i].fingerprint);
      expect(stripped.projects[i].fingerprint).not.toBe('empty');
    }
  });

  test('a project without an image is passed through untouched', async () => {
    const plain = mkProject('proj_plain');
    delete plain.imgData;
    PROJECTS.push(plain);
    try {
      const syncObj = await SE.exportSync();
      const entry = syncObj.projects.find(e => e.id === 'proj_plain');
      expect(entry.data).toBe(plain); // same reference — no needless copy
    } finally {
      PROJECTS.pop();
    }
  });

  test('a device never loses an image it already has to a stripped import', () => {
    // mergeTrackingProgress treats imgData as prefer-present, so an incoming
    // copy with the image omitted cannot wipe the local one.
    const local = Object.assign(mkProject('proj_1'), { updatedAt: '2026-07-01T00:00:00.000Z' });
    const remote = Object.assign(mkProject('proj_1'), { updatedAt: '2026-08-23T10:00:00.000Z' });
    delete remote.imgData;
    expect(SE.mergeTrackingProgress(local, remote).imgData).toBe(BIG_IMAGE);
  });
});

describe('fix #9 — the auto-export debounce actually coalesces', () => {
  const SRC = fs.readFileSync(path.join(__dirname, '..', 'sync-engine.js'), 'utf8');

  test('an in-flight export blocks scheduling instead of stacking writes', () => {
    const idx = SRC.indexOf('function _scheduleAutoExport');
    expect(idx).toBeGreaterThan(0);
    const body = SRC.slice(idx, idx + 700);
    expect(body).toMatch(/if\s*\(_exportInFlight\)\s*\{\s*_exportQueued\s*=\s*true;\s*return;/);
  });

  test('the cooldown is measured from the START of a write, not its completion', () => {
    const idx = SRC.indexOf('function _scheduleAutoExport');
    const body = SRC.slice(idx, idx + 700);
    expect(body).toMatch(/_lastExportStartedAt/);
    // The old completion-based field is gone entirely.
    expect(SRC).not.toMatch(/_lastExportFiredAt/);
  });

  test('the timer handle is not cleared before the async write finishes', () => {
    // _runAutoExport clears the handle then immediately guards with
    // _exportInFlight, so the window the old code left open is closed.
    const idx = SRC.indexOf('function _runAutoExport');
    expect(idx).toBeGreaterThan(0);
    const body = SRC.slice(idx, idx + 900);
    expect(body).toMatch(/_exportInFlight\s*=\s*true/);
    expect(body).toMatch(/_exportQueued\s*=\s*false/);
  });

  test('a queued change triggers exactly one follow-up write', () => {
    const idx = SRC.indexOf('function _runAutoExport');
    const body = SRC.slice(idx, idx + 1200);
    // settle() clears the flag before rescheduling, so the follow-up cannot
    // itself re-queue and loop.
    expect(body).toMatch(/function settle\(\)[\s\S]{0,220}_exportQueued\s*=\s*false;[\s\S]{0,60}_scheduleAutoExport\(\)/);
  });

  test('a permission failure does not consume the cooldown', () => {
    const idx = SRC.indexOf('function _runAutoExport');
    const body = SRC.slice(idx, idx + 1600);
    const permIdx = body.indexOf('Write permission not granted');
    const stampIdx = body.indexOf('_lastExportStartedAt = Date.now()');
    // The stamp happens only on the granted path, after the early return.
    expect(permIdx).toBeGreaterThan(0);
    expect(stampIdx).toBeGreaterThan(permIdx);
  });

  test('settle runs on both success and failure', () => {
    const idx = SRC.indexOf('function _runAutoExport');
    const body = SRC.slice(idx, idx + 2000);
    expect(body).toMatch(/\.then\(settle,\s*settle\)/);
  });
});
