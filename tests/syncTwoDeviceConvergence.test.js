// End-to-end two-device simulation.
//
// Drives the real export -> prepare -> execute pipeline between two isolated
// device contexts (separate localStorage + project stores) and asserts the
// properties the field bug violated: the receiving device's library matches
// the sender's, edits propagate in both directions without a manual review
// click, and repeated syncing converges instead of drifting.

const fs = require('fs');
const pako = require('pako');

const { IDBFactory } = require('fake-indexeddb');

global.window = global.window || {};
global.pako = pako;
// Each device gets its own IDBFactory so the stash store is genuinely
// per-device — the engine reads/writes it during export and import.
global.IDBKeyRange = require('fake-indexeddb/lib/FDBKeyRange');

// A monotonic clock shared by both devices so "save order" is observable.
let CLOCK = Date.parse('2026-08-24T09:00:00.000Z');
const tick = () => new Date((CLOCK += 1000)).toISOString();

function makeDevice(deviceId, deviceName) {
  const store = {};
  const ls = {
    getItem: k => (store[k] !== undefined ? store[k] : null),
    setItem: (k, v) => { store[k] = String(v); },
    removeItem: k => { delete store[k]; },
    clear: () => Object.keys(store).forEach(k => delete store[k])
  };
  const db = new Map();
  const ps = {
    listProjects: async () => [...db.values()]
      .map(p => ({ id: p.id, name: p.name, updatedAt: p.updatedAt }))
      .sort((a, b) => new Date(b.updatedAt || 0) - new Date(a.updatedAt || 0)),
    get: async id => {
      const p = db.get(id);
      return p ? JSON.parse(JSON.stringify(p)) : null;
    },
    save: async (p, options) => {
      const opts = options || {};
      if (!(opts.preserveUpdatedAt && p.updatedAt)) p.updatedAt = tick();
      db.set(p.id, JSON.parse(JSON.stringify(p)));
      return p.id;
    },
    markSynced: async () => {},
    delete: async id => { db.delete(id); }
  };
  ls.setItem('cs_sync_deviceId', deviceId);
  ls.setItem('cs_sync_deviceName', deviceName);
  return { ls, db, ps, deviceId, deviceName, idb: new IDBFactory() };
}

// sync-engine resolves `localStorage` / `ProjectStorage` / `indexedDB` from the
// global scope at call time, so swapping them switches which device we act as.
function use(dev) {
  global.localStorage = dev.ls;
  global.ProjectStorage = dev.ps;
  global.indexedDB = dev.idb;
}

const deviceA = makeDevice('dev_A', 'Sziedem');
const deviceB = makeDevice('dev_B', 'osiem');
use(deviceA);

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

function mkProject(id, name, updatedAt) {
  const pattern = [];
  for (let i = 0; i < 400; i++) pattern.push({ id: String(310 + (i % 4)) });
  return {
    id, name, updatedAt, createdAt: '2026-05-01T00:00:00.000Z',
    settings: { sW: 20, sH: 20, fabricCt: 14 }, // Creator shape: no top-level w/h
    pattern, done: new Array(400).fill(0),
    statsSessions: [], sessions: [], totalTime: 0,
    threadOwned: {}, parkMarkers: [], achievedMilestones: []
  };
}

// A's library, oldest to newest by updatedAt.
const A_LIBRARY = [
  ['proj_cerbii', 'Cerbii',             '2026-05-24T10:00:00.000Z'],
  ['proj_corgi',  'Corgi',              '2026-05-28T10:00:00.000Z'],
  ['proj_peacock', 'Peacock',           '2026-06-17T15:33:45.579Z'],
  ['proj_books',  'Books and Blossoms', '2026-08-23T14:12:36.486Z']
];

async function syncFromTo(src, dst) {
  use(src);
  const syncObj = await SE.exportSync();
  use(dst);
  const plan = await SE.prepareImport(syncObj);
  const parts = SE._test.partitionPlan(plan);
  if (parts.autoPlan) await SE.executeImport(parts.autoPlan);
  return { plan, parts };
}

beforeAll(() => {
  for (const [id, name, at] of A_LIBRARY) {
    deviceA.db.set(id, mkProject(id, name, at));
  }
});

describe('two-device sync — first contact', () => {
  let result;

  test('the whole library auto-applies with no review needed', async () => {
    result = await syncFromTo(deviceA, deviceB);
    expect(result.plan.newRemote.length).toBe(4);
    expect(result.plan.conflicts.length).toBe(0);
    // The Creator shape (settings.sW/sH, no w/h) must clear the integrity gate.
    expect(result.parts.autoPlan).not.toBeNull();
    expect(result.parts.reviewPlan).toBeNull();
    expect(deviceB.db.size).toBe(4);
  });

  test('every project keeps the authoring device\'s edit time', () => {
    for (const [id, , at] of A_LIBRARY) {
      expect(deviceB.db.get(id).updatedAt).toBe(at);
    }
  });

  test('B\'s library is in the same order as A\'s — newest first', async () => {
    use(deviceA);
    const onA = (await deviceA.ps.listProjects()).map(p => p.name);
    use(deviceB);
    const onB = (await deviceB.ps.listProjects()).map(p => p.name);
    expect(onB).toEqual(onA);
    expect(onB[0]).toBe('Books and Blossoms'); // the recent work, not the May dogs
    expect(onB[onB.length - 1]).toBe('Cerbii');
  });
});

describe('two-device sync — an edit propagates back without review', () => {
  test('B stitches, A receives it automatically', async () => {
    // B works on Peacock.
    use(deviceB);
    const p = await deviceB.ps.get('proj_peacock');
    p.done[10] = 1; p.done[11] = 1;
    p.totalTime = 600;
    p.statsSessions = [{ start: '2026-08-24T09:00:00.000Z', durationSeconds: 600, date: '2026-08-24' }];
    await deviceB.ps.save(p); // normal local save -> fresh updatedAt

    const { plan, parts } = await syncFromTo(deviceB, deviceA);

    // A already has the project, so this is merge-tracking — the class of
    // update that previously never auto-applied.
    expect(plan.mergeTracking.length).toBeGreaterThan(0);
    expect(parts.autoPlan).not.toBeNull();
    expect(parts.reviewPlan).toBeNull();

    const onA = deviceA.db.get('proj_peacock');
    expect(onA.done[10]).toBe(1);
    expect(onA.done[11]).toBe(1);
    expect(onA.totalTime).toBe(600);
  });

  test('A stitches elsewhere on the same project and both sides converge', async () => {
    use(deviceA);
    const p = await deviceA.ps.get('proj_peacock');
    p.done[20] = 1;
    p.totalTime = 900;
    p.statsSessions = (p.statsSessions || []).concat(
      [{ start: '2026-08-24T11:00:00.000Z', durationSeconds: 300, date: '2026-08-24' }]
    );
    await deviceA.ps.save(p);

    await syncFromTo(deviceA, deviceB);

    const onB = deviceB.db.get('proj_peacock');
    expect(onB.done[10]).toBe(1); // B's original work
    expect(onB.done[20]).toBe(1); // A's new work
    // Both sessions survive the union, and time is not double counted.
    expect(onB.statsSessions.length).toBe(2);
    expect(onB.totalTime).toBe(900);
  });
});

describe('two-device sync — repeated syncing is stable', () => {
  test('re-syncing unchanged data produces no work and no review prompt', async () => {
    // First push A -> B so both sides hold the same timestamps.
    await syncFromTo(deviceA, deviceB);
    const { plan, parts } = await syncFromTo(deviceA, deviceB);

    expect(plan.newRemote.length).toBe(0);
    expect(plan.mergeTracking.length).toBe(0);
    expect(plan.conflicts.length).toBe(0);
    expect(plan.identical.length).toBeGreaterThan(0);
    // Nothing to do and nothing to nag the user about.
    expect(parts.autoPlan).toBeNull();
    expect(parts.reviewPlan).toBeNull();
  });

  test('ten round trips do not drift totalTime or duplicate sessions', async () => {
    const before = deviceB.db.get('proj_peacock');
    const t0 = before.totalTime;
    const s0 = before.statsSessions.length;

    for (let i = 0; i < 10; i++) {
      await syncFromTo(deviceA, deviceB);
      await syncFromTo(deviceB, deviceA);
    }

    const afterB = deviceB.db.get('proj_peacock');
    const afterA = deviceA.db.get('proj_peacock');
    expect(afterB.totalTime).toBe(t0);
    expect(afterA.totalTime).toBe(t0);
    expect(afterB.statsSessions.length).toBe(s0);
    expect(afterA.statsSessions.length).toBe(s0);
  });

  test('both devices end up holding identical timestamps', async () => {
    for (const [id] of A_LIBRARY) {
      expect(deviceB.db.get(id).updatedAt).toBe(deviceA.db.get(id).updatedAt);
    }
  });

  test('no duplicate projects were created along the way', () => {
    expect(deviceA.db.size).toBe(4);
    expect(deviceB.db.size).toBe(4);
  });
});
