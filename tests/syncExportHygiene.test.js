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
global.indexedDB = new (require('fake-indexeddb').IDBFactory)();

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
  // The debounce lives in sync-export-scheduler.js. These drive it through its real timer and clock (jest's fake
  // ones), with a `run` whose completion the test controls; tests/syncSchedulerTrace.test.js covers the same rules
  // end to end through the engine.
  const Scheduler = require('../sync-export-scheduler.js');
  const ENGINE_SRC = fs.readFileSync(path.join(__dirname, '..', 'sync-engine.js'), 'utf8');

  // A run that records its calls and keeps each write open until finish()/fail() is called.
  function harness({ writes = true } = {}) {
    const calls = [];
    const open = [];
    const sched = Scheduler.create(markWriteStarted => {
      calls.push(Date.now());
      return new Promise((resolve, reject) => {
        if (writes) markWriteStarted();
        open.push({ resolve, reject });
      });
    });
    return { sched, calls, open, finish: () => open.shift().resolve(), fail: () => open.shift().reject(new Error('x')) };
  }
  const flush = async () => { for (let i = 0; i < 5; i++) await Promise.resolve(); };

  beforeEach(() => { jest.useFakeTimers(); jest.setSystemTime(new Date('2026-01-01T12:00:00Z')); });
  afterEach(() => { jest.clearAllTimers(); jest.useRealTimers(); });

  test('an in-flight export blocks scheduling instead of stacking writes', async () => {
    const h = harness();
    h.sched.schedule();
    jest.advanceTimersByTime(2000);
    expect(h.calls).toHaveLength(1);
    for (let i = 0; i < 5; i++) h.sched.schedule();
    expect(jest.getTimerCount()).toBe(0);
    jest.advanceTimersByTime(120000);
    expect(h.calls).toHaveLength(1);
  });

  test('the cooldown is measured from the START of a write, not its completion', async () => {
    const h = harness();
    h.sched.schedule();
    jest.advanceTimersByTime(2000);              // write starts at +2000
    h.sched.schedule();                           // queued
    jest.advanceTimersByTime(25000);              // the write is slow: completes at +27000
    h.finish(); await flush();
    // 25 s after the start, the 30 s cooldown has 5 s left; a completion-based clock would wait the full 30 s.
    expect(jest.getTimerCount()).toBe(1);
    jest.advanceTimersByTime(4999);
    expect(h.calls).toHaveLength(1);
    jest.advanceTimersByTime(1);
    expect(h.calls).toHaveLength(2);
  });

  test('the pending timer is single, and the write window is closed to new timers until it settles', async () => {
    const h = harness();
    h.sched.schedule(); h.sched.schedule(); h.sched.schedule();
    expect(jest.getTimerCount()).toBe(1);
    jest.advanceTimersByTime(2000);
    expect(jest.getTimerCount()).toBe(0);         // timer consumed, write running
    h.sched.schedule();
    expect(jest.getTimerCount()).toBe(0);         // ... and a save now only queues
  });

  test('a queued change triggers exactly one follow-up write', async () => {
    const h = harness();
    h.sched.schedule();
    jest.advanceTimersByTime(2000);
    h.sched.schedule(); h.sched.schedule();
    h.finish(); await flush();
    expect(jest.getTimerCount()).toBe(1);
    jest.advanceTimersByTime(30000);
    expect(h.calls).toHaveLength(2);
    h.finish(); await flush();
    // The follow-up did not itself re-queue: nothing more is scheduled.
    expect(jest.getTimerCount()).toBe(0);
    jest.advanceTimersByTime(120000);
    expect(h.calls).toHaveLength(2);
  });

  test('a run that wrote nothing does not consume the cooldown', async () => {
    const h = harness({ writes: false });
    h.sched.schedule();
    jest.advanceTimersByTime(2000);
    h.finish(); await flush();
    h.sched.schedule();
    jest.advanceTimersByTime(1999);
    expect(h.calls).toHaveLength(1);
    jest.advanceTimersByTime(1);
    expect(h.calls).toHaveLength(2);
  });

  test('settle runs on both success and failure', async () => {
    const h = harness();
    h.sched.schedule();
    jest.advanceTimersByTime(2000);
    h.sched.schedule();
    h.fail(); await flush();
    expect(jest.getTimerCount()).toBe(1);        // the queued follow-up was scheduled after the failure
    jest.advanceTimersByTime(30000);
    expect(h.calls).toHaveLength(2);
    h.finish(); await flush();
    h.sched.schedule();
    expect(jest.getTimerCount()).toBe(1);        // and the window is closed again after a success
  });

  test('a run with no folder starts no write, leaves nothing queued and does not block the next save', async () => {
    let folder = false;
    const calls = [];
    const sched = Scheduler.create(mark => { calls.push(1); if (!folder) return undefined; mark(); return Promise.resolve(); });
    sched.schedule();
    jest.advanceTimersByTime(2000);
    expect(calls).toHaveLength(1);
    folder = true;
    sched.schedule();
    jest.advanceTimersByTime(2000);
    expect(calls).toHaveLength(2);
  });

  test('the engine stamps the write start only after the permission check, and hands the scheduler its Promise', () => {
    const idx = ENGINE_SRC.indexOf('function _runAutoExport');
    expect(idx).toBeGreaterThan(0);
    const body = ENGINE_SRC.slice(idx, idx + 2000);
    expect(body.indexOf('markWriteStarted()')).toBeGreaterThan(body.indexOf('Write permission not granted'));
    expect(body).toMatch(/return Promise\.resolve\(\)\s*\.then\(function \(\) \{ return watchDirHandle\.queryPermission/);
    expect(ENGINE_SRC).not.toMatch(/_lastExportFiredAt|_exportInFlight|_autoExportTimer/);
  });
});
