const fs = require('fs');

// --- Load sync-engine.js in a Node-compatible way ---
// The module uses an IIFE that assigns to window.SyncEngine and module.exports.
// We need to provide stubs for browser globals it references.

// Minimal pako stub — only deflate/inflate for fingerprint + compress/decompress
const pako = require('pako');

// Provide browser globals that sync-engine.js expects
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
global.indexedDB = undefined; // Not available in Node — DB-dependent tests are skipped

// Silence console.warn from expected IndexedDB fallback paths
const originalWarn = console.warn;
beforeAll(() => {
  console.warn = function() {
    var msg = String(arguments[0] || '');
    if (msg.indexOf('SyncEngine:') === 0) return; // suppress expected sync warnings
    originalWarn.apply(console, arguments);
  };
});
afterAll(() => { console.warn = originalWarn; });

// Stub ProjectStorage (sync-engine reads from it during export/import)
global.ProjectStorage = {
  listProjects: async () => [],
  get: async () => null,
  save: async (p) => p.id
};

// Stub SyncEngine doesn't exist yet — load it
const code = fs.readFileSync('./sync-engine.js', 'utf8');
eval(code);

const SE = global.SyncEngine || global.window.SyncEngine;

// ---------------------------------------------------------------------------
// computeFingerprint
// ---------------------------------------------------------------------------

describe('computeFingerprint', () => {
  test('returns "empty" for null or missing pattern', () => {
    expect(SE.computeFingerprint(null)).toBe('empty');
    expect(SE.computeFingerprint({})).toBe('empty');
    expect(SE.computeFingerprint({ pattern: null })).toBe('empty');
  });

  test('produces a consistent fingerprint for the same pattern', () => {
    const project = {
      settings: { sW: 3, sH: 2 },
      pattern: [
        { id: '310', type: 'solid', rgb: [0, 0, 0] },
        { id: '550', type: 'solid', rgb: [128, 58, 153] },
        { id: '__skip__' },
        { id: '310', type: 'solid', rgb: [0, 0, 0] },
        { id: '__empty__' },
        { id: '310', type: 'solid', rgb: [0, 0, 0] }
      ]
    };
    const fp1 = SE.computeFingerprint(project);
    const fp2 = SE.computeFingerprint(project);
    expect(fp1).toBe(fp2);
    expect(fp1).toMatch(/^fp_3x2_/);
  });

  test('different patterns produce different fingerprints', () => {
    const p1 = {
      settings: { sW: 2, sH: 2 },
      pattern: [
        { id: '310' }, { id: '310' }, { id: '310' }, { id: '310' }
      ]
    };
    const p2 = {
      settings: { sW: 2, sH: 2 },
      pattern: [
        { id: '310' }, { id: '550' }, { id: '310' }, { id: '310' }
      ]
    };
    expect(SE.computeFingerprint(p1)).not.toBe(SE.computeFingerprint(p2));
  });

  test('same IDs but different dimensions produce different fingerprints', () => {
    const p1 = {
      settings: { sW: 4, sH: 1 },
      pattern: [{ id: '310' }, { id: '310' }, { id: '310' }, { id: '310' }]
    };
    const p2 = {
      settings: { sW: 2, sH: 2 },
      pattern: [{ id: '310' }, { id: '310' }, { id: '310' }, { id: '310' }]
    };
    expect(SE.computeFingerprint(p1)).not.toBe(SE.computeFingerprint(p2));
  });

  test('ignores tracking state (done array does not affect fingerprint)', () => {
    const base = {
      settings: { sW: 2, sH: 2 },
      pattern: [{ id: '310' }, { id: '550' }, { id: '310' }, { id: '550' }]
    };
    const withDone = {
      ...base,
      done: [1, 0, 1, 0],
      totalTime: 3600,
      sessions: [{ start: '2024-01-01' }]
    };
    expect(SE.computeFingerprint(base)).toBe(SE.computeFingerprint(withDone));
  });
});

// ---------------------------------------------------------------------------
// mergeDoneArrays
// ---------------------------------------------------------------------------

describe('mergeDoneArrays', () => {
  test('returns null when both are null', () => {
    expect(SE.mergeDoneArrays(null, null, 4)).toBeNull();
  });

  test('returns remote when local is null', () => {
    const remote = [1, 0, 1, 0];
    expect(SE.mergeDoneArrays(null, remote, 4)).toEqual(remote);
  });

  test('returns local when remote is null', () => {
    const local = [0, 1, 0, 1];
    expect(SE.mergeDoneArrays(local, null, 4)).toEqual(local);
  });

  test('unions done cells (OR logic)', () => {
    const local  = [1, 0, 0, 1, 0, 0];
    const remote = [0, 1, 0, 0, 1, 0];
    const result = SE.mergeDoneArrays(local, remote, 6);
    expect(result).toEqual([1, 1, 0, 1, 1, 0]);
  });

  test('does not lose any completed stitches', () => {
    const local  = [1, 1, 1, 0, 0, 0];
    const remote = [0, 0, 0, 1, 1, 1];
    const result = SE.mergeDoneArrays(local, remote, 6);
    expect(result).toEqual([1, 1, 1, 1, 1, 1]);
  });

  test('handles identical done arrays', () => {
    const done = [1, 0, 1, 0];
    const result = SE.mergeDoneArrays(done, [...done], 4);
    expect(result).toEqual([1, 0, 1, 0]);
  });
});

// ---------------------------------------------------------------------------
// mergeSessions
// ---------------------------------------------------------------------------

describe('mergeSessions', () => {
  test('returns remote sessions when local is empty', () => {
    const remote = [{ start: '2024-01-01T10:00:00Z' }];
    expect(SE.mergeSessions([], remote)).toEqual(remote);
    expect(SE.mergeSessions(null, remote)).toEqual(remote);
  });

  test('returns local sessions when remote is empty', () => {
    const local = [{ start: '2024-01-01T10:00:00Z' }];
    expect(SE.mergeSessions(local, [])).toEqual(local);
    expect(SE.mergeSessions(local, null)).toEqual(local);
  });

  test('deduplicates by start timestamp', () => {
    const s1 = { start: '2024-01-01T10:00:00Z', durationMinutes: 30 };
    const s2 = { start: '2024-01-02T10:00:00Z', durationMinutes: 45 };
    const s3 = { start: '2024-01-03T10:00:00Z', durationMinutes: 60 };
    const local  = [s1, s2];
    const remote = [s2, s3]; // s2 overlaps
    const result = SE.mergeSessions(local, remote);
    expect(result).toHaveLength(3);
    expect(result[0].start).toBe(s1.start);
    expect(result[1].start).toBe(s2.start);
    expect(result[2].start).toBe(s3.start);
  });

  test('sorts merged sessions chronologically', () => {
    const s1 = { start: '2024-01-03T10:00:00Z' };
    const s2 = { start: '2024-01-01T10:00:00Z' };
    const result = SE.mergeSessions([s1], [s2]);
    expect(result[0].start).toBe(s2.start);
    expect(result[1].start).toBe(s1.start);
  });
});

// ---------------------------------------------------------------------------
// mergeStash
// ---------------------------------------------------------------------------

describe('mergeStash', () => {
  test('merges threads with max owned and OR for tobuy', () => {
    const local = {
      threads: {
        '310': { owned: 2, tobuy: false, partialStatus: null, min_stock: 0 },
        '550': { owned: 1, tobuy: true, partialStatus: 'about-half', min_stock: 1 }
      }
    };
    const remote = {
      threads: {
        '310': { owned: 3, tobuy: true, partialStatus: null, min_stock: 1 },
        '666': { owned: 1, tobuy: false, partialStatus: null, min_stock: 0 }
      }
    };
    const result = SE.mergeStash(local, remote);
    expect(result.threads['310'].owned).toBe(3);     // max(2, 3)
    expect(result.threads['310'].tobuy).toBe(true);   // false OR true
    expect(result.threads['310'].min_stock).toBe(1);  // max(0, 1)
    expect(result.threads['550'].owned).toBe(1);      // local only
    expect(result.threads['550'].tobuy).toBe(true);   // local only
    expect(result.threads['550'].partialStatus).toBe('about-half');
    expect(result.threads['666'].owned).toBe(1);      // remote only
  });

  test('merges pattern library by ID, newer wins', () => {
    const local = {
      patterns: [
        { id: 'p1', title: 'Rose', updatedAt: '2024-01-01T00:00:00Z' },
        { id: 'p2', title: 'Lily', updatedAt: '2024-02-01T00:00:00Z' }
      ]
    };
    const remote = {
      patterns: [
        { id: 'p1', title: 'Rose Updated', updatedAt: '2024-03-01T00:00:00Z' },
        { id: 'p3', title: 'Daisy', updatedAt: '2024-01-15T00:00:00Z' }
      ]
    };
    const result = SE.mergeStash(local, remote);
    expect(result.patterns).toHaveLength(3);
    const p1 = result.patterns.find(p => p.id === 'p1');
    expect(p1.title).toBe('Rose Updated'); // remote is newer
    expect(result.patterns.find(p => p.id === 'p2').title).toBe('Lily');
    expect(result.patterns.find(p => p.id === 'p3').title).toBe('Daisy');
  });

  test('handles empty/null stash objects', () => {
    const result = SE.mergeStash(null, null);
    expect(result.threads).toEqual({});
    expect(result.patterns).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// classifyProjects
// ---------------------------------------------------------------------------

describe('classifyProjects', () => {
  const makeProject = (id, updatedAt, pattern) => ({
    id,
    updatedAt,
    settings: { sW: 2, sH: 2 },
    pattern: pattern || [{ id: '310' }, { id: '550' }, { id: '310' }, { id: '550' }]
  });

  test('classifies new-remote when local does not have project', () => {
    const remote = [{ id: 'proj_1', updatedAt: '2024-01-01', data: makeProject('proj_1', '2024-01-01') }];
    const result = SE.classifyProjects(remote, {});
    expect(result[0].classification).toBe('new-remote');
  });

  test('classifies identical when timestamps match', () => {
    const p = makeProject('proj_1', '2024-01-01T00:00:00Z');
    const remote = [{ id: 'proj_1', updatedAt: '2024-01-01T00:00:00Z', data: p }];
    const localMap = { 'proj_1': p };
    const result = SE.classifyProjects(remote, localMap);
    expect(result[0].classification).toBe('identical');
  });

  test('classifies merge-tracking when timestamps differ but pattern is same', () => {
    const localP = makeProject('proj_1', '2024-01-01T00:00:00Z');
    const remoteP = makeProject('proj_1', '2024-01-02T00:00:00Z');
    // Same pattern structure, different timestamps
    const remote = [{
      id: 'proj_1',
      updatedAt: '2024-01-02T00:00:00Z',
      fingerprint: SE.computeFingerprint(remoteP),
      data: remoteP
    }];
    const result = SE.classifyProjects(remote, { 'proj_1': localP });
    expect(result[0].classification).toBe('merge-tracking');
  });

  test('classifies conflict when pattern structure differs', () => {
    const localP = makeProject('proj_1', '2024-01-01', [{ id: '310' }, { id: '310' }, { id: '310' }, { id: '310' }]);
    const remoteP = makeProject('proj_1', '2024-01-02', [{ id: '550' }, { id: '550' }, { id: '550' }, { id: '550' }]);
    const remote = [{
      id: 'proj_1',
      updatedAt: '2024-01-02',
      fingerprint: SE.computeFingerprint(remoteP),
      data: remoteP
    }];
    const result = SE.classifyProjects(remote, { 'proj_1': localP });
    expect(result[0].classification).toBe('conflict');
  });
});

// ---------------------------------------------------------------------------
// mergeTrackingProgress
// ---------------------------------------------------------------------------

describe('mergeTrackingProgress', () => {
  test('merges done arrays and sessions from both sides', () => {
    const local = {
      id: 'proj_1',
      settings: { sW: 2, sH: 2 },
      pattern: [{ id: '310' }, { id: '550' }, { id: '310' }, { id: '550' }],
      done: [1, 0, 0, 0],
      totalTime: 100,
      statsSessions: [{ start: '2024-01-01T10:00:00Z', durationMinutes: 30 }],
      sessions: [{ start: '2024-01-01T10:00:00Z' }],
      threadOwned: { '310': 'owned' },
      updatedAt: '2024-01-01T12:00:00Z'
    };
    const remote = {
      id: 'proj_1',
      settings: { sW: 2, sH: 2 },
      pattern: [{ id: '310' }, { id: '550' }, { id: '310' }, { id: '550' }],
      done: [0, 1, 0, 1],
      totalTime: 200,
      statsSessions: [{ start: '2024-01-02T10:00:00Z', durationMinutes: 45 }],
      sessions: [{ start: '2024-01-02T10:00:00Z' }],
      threadOwned: { '550': 'tobuy' },
      updatedAt: '2024-01-02T12:00:00Z'
    };

    const merged = SE.mergeTrackingProgress(local, remote);

    // Done arrays unioned
    expect(merged.done).toEqual([1, 1, 0, 1]);

    // Sessions merged and deduped
    expect(merged.statsSessions).toHaveLength(2);
    expect(merged.sessions).toHaveLength(2);

    // Total time is max
    expect(merged.totalTime).toBe(200);

    // Thread owned merged
    expect(merged.threadOwned['310']).toBe('owned');
    expect(merged.threadOwned['550']).toBe('tobuy');

    // Updated to latest timestamp
    expect(merged.updatedAt).toBe('2024-01-02T12:00:00Z');
  });

  test('handles one side having null done array', () => {
    const local = {
      id: 'proj_1',
      settings: { sW: 2, sH: 1 },
      pattern: [{ id: '310' }, { id: '550' }],
      done: null,
      statsSessions: [],
      sessions: [],
      updatedAt: '2024-01-01'
    };
    const remote = {
      id: 'proj_1',
      settings: { sW: 2, sH: 1 },
      pattern: [{ id: '310' }, { id: '550' }],
      done: [1, 0],
      statsSessions: [],
      sessions: [],
      updatedAt: '2024-01-02'
    };

    const merged = SE.mergeTrackingProgress(local, remote);
    expect(merged.done).toEqual([1, 0]);
  });
});

// ---------------------------------------------------------------------------
// validate
// ---------------------------------------------------------------------------

describe('validate', () => {
  test('rejects null input', () => {
    expect(SE.validate(null).valid).toBe(false);
  });

  test('rejects wrong format', () => {
    expect(SE.validate({ _format: 'wrong' }).valid).toBe(false);
  });

  test('rejects wrong version', () => {
    expect(SE.validate({ _format: 'cross-stitch-sync', _version: 99, projects: [] }).valid).toBe(false);
  });

  test('rejects missing projects array', () => {
    expect(SE.validate({ _format: 'cross-stitch-sync', _version: 1 }).valid).toBe(false);
  });

  test('accepts valid sync object', () => {
    const obj = {
      _format: 'cross-stitch-sync',
      _version: 1,
      _createdAt: '2024-01-01T00:00:00Z',
      _deviceId: 'dev_test',
      _deviceName: 'Test',
      _mode: 'full',
      projects: [{ id: 'proj_1', updatedAt: '2024-01-01', data: {} }]
    };
    const result = SE.validate(obj);
    expect(result.valid).toBe(true);
    expect(result.summary.projectCount).toBe(1);
    expect(result.summary.deviceName).toBe('Test');
  });
});

// ---------------------------------------------------------------------------
// compress / decompress roundtrip
// ---------------------------------------------------------------------------

describe('compress + decompress', () => {
  test('roundtrips a sync object through compression', () => {
    const obj = {
      _format: 'cross-stitch-sync',
      _version: 1,
      projects: [
        { id: 'proj_1', data: { pattern: [{ id: '310' }, { id: '550' }] } }
      ]
    };
    const compressed = SE.compress(obj);
    expect(compressed).toBeInstanceOf(Uint8Array);
    expect(compressed.length).toBeGreaterThan(0);
    // Compressed should be smaller than raw JSON
    const jsonLen = JSON.stringify(obj).length;
    // (For very small objects compression overhead may exceed savings, so just check roundtrip)
    const decompressed = SE.decompress(compressed.buffer);
    expect(decompressed._format).toBe(obj._format);
    expect(decompressed.projects[0].id).toBe('proj_1');
  });

  test('handles large pattern data with good compression', () => {
    // Simulate a typical pattern with repetitive data
    const pattern = [];
    for (let i = 0; i < 6400; i++) {
      pattern.push({ id: i % 5 === 0 ? '__skip__' : '310', type: 'solid', rgb: [0, 0, 0] });
    }
    const obj = {
      _format: 'cross-stitch-sync',
      _version: 1,
      projects: [{ id: 'proj_1', data: { pattern } }]
    };
    const jsonLen = JSON.stringify(obj).length;
    const compressed = SE.compress(obj);
    // Repetitive cross-stitch data should compress well (at least 3x)
    expect(compressed.length).toBeLessThan(jsonLen / 3);
  });
});

// ---------------------------------------------------------------------------
// Device identity
// ---------------------------------------------------------------------------

describe('device identity', () => {
  test('generates and persists a device ID', () => {
    const id1 = SE.getDeviceId();
    expect(id1).toMatch(/^dev_/);
    const id2 = SE.getDeviceId();
    expect(id2).toBe(id1); // same across calls
  });

  test('get/set device name', () => {
    SE.setDeviceName("Katie's Laptop");
    expect(SE.getDeviceName()).toBe("Katie's Laptop");
  });
});

// ---------------------------------------------------------------------------
// prepareImport (full pipeline, mocked ProjectStorage)
// ---------------------------------------------------------------------------

describe('prepareImport', () => {
  const makeProject = (id, updatedAt, pattern, done) => ({
    id,
    name: 'Project ' + id,
    w: 2, h: 2,
    updatedAt,
    settings: { sW: 2, sH: 2 },
    pattern: pattern || [{ id: '310' }, { id: '550' }, { id: '310' }, { id: '550' }],
    done: done || null,
    sessions: [],
    statsSessions: [],
    totalTime: 0,
    threadOwned: {}
  });

  const makeSyncObj = (projects, stash) => ({
    _format: 'cross-stitch-sync',
    _version: 1,
    _createdAt: '2024-06-01T00:00:00Z',
    _deviceId: 'dev_remote',
    _deviceName: 'Remote Device',
    _mode: 'full',
    projects: projects,
    stash: stash || null
  });

  beforeEach(() => {
    // Reset stubs for each test
    global.ProjectStorage = {
      _store: {},
      listProjects: async function() {
        return Object.values(this._store).map(p => ({ id: p.id, name: p.name, updatedAt: p.updatedAt }));
      },
      get: async function(id) { return this._store[id] || null; },
      save: async function(p) { this._store[p.id] = p; return p.id; }
    };
  });

  test('plan includes new-remote for unknown projects', async () => {
    const remote = makeProject('proj_r1', '2024-06-01T00:00:00Z');
    const syncObj = makeSyncObj([{
      id: 'proj_r1',
      updatedAt: remote.updatedAt,
      fingerprint: SE.computeFingerprint(remote),
      data: remote
    }]);

    const plan = await SE.prepareImport(syncObj);
    expect(plan.newRemote).toHaveLength(1);
    expect(plan.newRemote[0].id).toBe('proj_r1');
    expect(plan.identical).toHaveLength(0);
    expect(plan.conflicts).toHaveLength(0);
  });

  test('plan marks identical projects', async () => {
    const proj = makeProject('proj_1', '2024-06-01T00:00:00Z');
    global.ProjectStorage._store['proj_1'] = proj;

    const syncObj = makeSyncObj([{
      id: 'proj_1',
      updatedAt: proj.updatedAt,
      fingerprint: SE.computeFingerprint(proj),
      data: proj
    }]);

    const plan = await SE.prepareImport(syncObj);
    expect(plan.identical).toHaveLength(1);
    expect(plan.newRemote).toHaveLength(0);
  });

  test('plan classifies merge-tracking when pattern unchanged', async () => {
    const local = makeProject('proj_1', '2024-06-01T00:00:00Z', undefined, [1, 0, 0, 0]);
    const remote = makeProject('proj_1', '2024-06-02T00:00:00Z', undefined, [0, 1, 0, 0]);
    global.ProjectStorage._store['proj_1'] = local;

    const syncObj = makeSyncObj([{
      id: 'proj_1',
      updatedAt: remote.updatedAt,
      fingerprint: SE.computeFingerprint(remote),
      data: remote
    }]);

    const plan = await SE.prepareImport(syncObj);
    expect(plan.mergeTracking).toHaveLength(1);
    expect(plan.conflicts).toHaveLength(0);
  });

  test('plan classifies conflict when pattern changed', async () => {
    const local = makeProject('proj_1', '2024-06-01T00:00:00Z', [{ id: '310' }, { id: '310' }, { id: '310' }, { id: '310' }]);
    const remote = makeProject('proj_1', '2024-06-02T00:00:00Z', [{ id: '550' }, { id: '550' }, { id: '550' }, { id: '550' }]);
    global.ProjectStorage._store['proj_1'] = local;

    const syncObj = makeSyncObj([{
      id: 'proj_1',
      updatedAt: remote.updatedAt,
      fingerprint: SE.computeFingerprint(remote),
      data: remote
    }]);

    const plan = await SE.prepareImport(syncObj);
    expect(plan.conflicts).toHaveLength(1);
    expect(plan.mergeTracking).toHaveLength(0);
  });

  test('plan includes localOnly projects not in sync file', async () => {
    const local = makeProject('proj_local', '2024-05-01T00:00:00Z');
    global.ProjectStorage._store['proj_local'] = local;

    const remote = makeProject('proj_r1', '2024-06-01T00:00:00Z');
    const syncObj = makeSyncObj([{
      id: 'proj_r1',
      updatedAt: remote.updatedAt,
      fingerprint: SE.computeFingerprint(remote),
      data: remote
    }]);

    const plan = await SE.prepareImport(syncObj);
    expect(plan.localOnly).toHaveLength(1);
    expect(plan.localOnly[0].id).toBe('proj_local');
    expect(plan.newRemote).toHaveLength(1);
  });

  test('plan includes stash merge when sync file has stash data', async () => {
    const syncObj = makeSyncObj(
      [{ id: 'proj_1', updatedAt: '2024-06-01', fingerprint: 'empty', data: makeProject('proj_1', '2024-06-01') }],
      { threads: { '310': { owned: 3, tobuy: false, min_stock: 0 } }, patterns: [] }
    );

    const plan = await SE.prepareImport(syncObj);
    expect(plan.stashMerge).not.toBeNull();
    expect(plan.stashMerge.threads['310'].owned).toBe(3);
  });

  test('plan has correct summary from validation', async () => {
    const syncObj = makeSyncObj([{
      id: 'proj_1',
      updatedAt: '2024-06-01',
      data: makeProject('proj_1', '2024-06-01')
    }]);

    const plan = await SE.prepareImport(syncObj);
    expect(plan.summary.deviceName).toBe('Remote Device');
    expect(plan.summary.projectCount).toBe(1);
    expect(plan.summary.createdAt).toBe('2024-06-01T00:00:00Z');
  });
});

// ---------------------------------------------------------------------------
// executeImport (mocked ProjectStorage)
// ---------------------------------------------------------------------------

describe('executeImport', () => {
  const makeProject = (id, updatedAt, pattern, done) => ({
    id,
    name: 'Project ' + id,
    w: 2, h: 2,
    updatedAt,
    settings: { sW: 2, sH: 2 },
    pattern: pattern || [{ id: '310' }, { id: '550' }, { id: '310' }, { id: '550' }],
    done: done || null,
    sessions: [],
    statsSessions: [],
    totalTime: 0,
    threadOwned: {}
  });

  beforeEach(() => {
    global.ProjectStorage = {
      _store: {},
      listProjects: async function() {
        return Object.values(this._store).map(p => ({ id: p.id }));
      },
      get: async function(id) { return this._store[id] || null; },
      save: async function(p) { this._store[p.id] = p; return p.id; }
    };
  });

  test('imports new-remote projects', async () => {
    const remote = makeProject('proj_r1', '2024-06-01T00:00:00Z');
    const plan = {
      newRemote: [{ id: 'proj_r1', remote: { data: remote } }],
      mergeTracking: [],
      conflicts: [],
      stashMerge: null
    };

    const result = await SE.executeImport(plan, {});
    expect(result.imported).toBe(1);
    expect(global.ProjectStorage._store['proj_r1']).toBeDefined();
    expect(global.ProjectStorage._store['proj_r1'].name).toBe('Project proj_r1');
  });

  test('merges tracking progress', async () => {
    const local = makeProject('proj_1', '2024-06-01T00:00:00Z', undefined, [1, 0, 0, 0]);
    const remote = makeProject('proj_1', '2024-06-02T00:00:00Z', undefined, [0, 1, 0, 0]);
    global.ProjectStorage._store['proj_1'] = local;

    const plan = {
      newRemote: [],
      mergeTracking: [{ id: 'proj_1', local: local, remote: { data: remote } }],
      conflicts: [],
      stashMerge: null
    };

    const result = await SE.executeImport(plan, {});
    expect(result.merged).toBe(1);
    const saved = global.ProjectStorage._store['proj_1'];
    expect(saved.done).toEqual([1, 1, 0, 0]);
  });

  test('resolves conflict with keep-local (no change)', async () => {
    const local = makeProject('proj_1', '2024-06-01T00:00:00Z', [{ id: '310' }, { id: '310' }, { id: '310' }, { id: '310' }]);
    const remote = makeProject('proj_1', '2024-06-02T00:00:00Z', [{ id: '550' }, { id: '550' }, { id: '550' }, { id: '550' }]);
    global.ProjectStorage._store['proj_1'] = local;

    const plan = {
      newRemote: [],
      mergeTracking: [],
      conflicts: [{ id: 'proj_1', local: local, remote: { data: remote } }],
      stashMerge: null
    };

    const result = await SE.executeImport(plan, { 'proj_1': 'keep-local' });
    expect(result.conflictsResolved).toBe(1);
    // Local should be unchanged
    expect(global.ProjectStorage._store['proj_1'].pattern[0].id).toBe('310');
  });

  test('resolves conflict with keep-remote (overwrites local)', async () => {
    const local = makeProject('proj_1', '2024-06-01T00:00:00Z', [{ id: '310' }, { id: '310' }, { id: '310' }, { id: '310' }]);
    const remote = makeProject('proj_1', '2024-06-02T00:00:00Z', [{ id: '550' }, { id: '550' }, { id: '550' }, { id: '550' }]);
    global.ProjectStorage._store['proj_1'] = local;

    const plan = {
      newRemote: [],
      mergeTracking: [],
      conflicts: [{ id: 'proj_1', local: local, remote: { data: remote } }],
      stashMerge: null
    };

    const result = await SE.executeImport(plan, { 'proj_1': 'keep-remote' });
    expect(result.conflictsResolved).toBe(1);
    expect(global.ProjectStorage._store['proj_1'].pattern[0].id).toBe('550');
  });

  test('resolves conflict with keep-both (creates copy)', async () => {
    const local = makeProject('proj_1', '2024-06-01T00:00:00Z', [{ id: '310' }, { id: '310' }, { id: '310' }, { id: '310' }]);
    const remote = makeProject('proj_1', '2024-06-02T00:00:00Z', [{ id: '550' }, { id: '550' }, { id: '550' }, { id: '550' }]);
    global.ProjectStorage._store['proj_1'] = local;

    const plan = {
      newRemote: [],
      mergeTracking: [],
      conflicts: [{ id: 'proj_1', local: local, remote: { data: remote } }],
      stashMerge: null
    };

    const result = await SE.executeImport(plan, { 'proj_1': 'keep-both' });
    expect(result.conflictsResolved).toBe(1);
    // Original should be untouched
    expect(global.ProjectStorage._store['proj_1'].pattern[0].id).toBe('310');
    // A new copy should exist
    const allIds = Object.keys(global.ProjectStorage._store);
    expect(allIds.length).toBe(2);
    const copyId = allIds.find(k => k !== 'proj_1');
    const copy = global.ProjectStorage._store[copyId];
    expect(copy.pattern[0].id).toBe('550');
    expect(copy.name).toContain('(synced)');
  });

  test('defaults unresolved conflicts to keep-local', async () => {
    const local = makeProject('proj_1', '2024-06-01T00:00:00Z');
    const remote = makeProject('proj_1', '2024-06-02T00:00:00Z', [{ id: '999' }, { id: '999' }, { id: '999' }, { id: '999' }]);
    global.ProjectStorage._store['proj_1'] = local;

    const plan = {
      newRemote: [],
      mergeTracking: [],
      conflicts: [{ id: 'proj_1', local: local, remote: { data: remote } }],
      stashMerge: null
    };

    // No resolutions provided — should default to keep-local
    const result = await SE.executeImport(plan, {});
    expect(result.conflictsResolved).toBe(1);
    expect(global.ProjectStorage._store['proj_1'].pattern[0].id).toBe('310');
  });

  test('handles mixed operations in one import', async () => {
    const existing = makeProject('proj_1', '2024-06-01T00:00:00Z', undefined, [1, 0, 0, 0]);
    global.ProjectStorage._store['proj_1'] = existing;

    const newRemote = makeProject('proj_new', '2024-06-01T00:00:00Z');
    const mergeRemote = makeProject('proj_1', '2024-06-02T00:00:00Z', undefined, [0, 1, 0, 0]);

    const plan = {
      newRemote: [{ id: 'proj_new', remote: { data: newRemote } }],
      mergeTracking: [{ id: 'proj_1', local: existing, remote: { data: mergeRemote } }],
      conflicts: [],
      stashMerge: null
    };

    const result = await SE.executeImport(plan, {});
    expect(result.imported).toBe(1);
    expect(result.merged).toBe(1);
    expect(global.ProjectStorage._store['proj_new']).toBeDefined();
    expect(global.ProjectStorage._store['proj_1'].done).toEqual([1, 1, 0, 0]);
  });
});

// ---------------------------------------------------------------------------
// getSyncStatus
// ---------------------------------------------------------------------------

describe('getSyncStatus', () => {
  test('returns device info and sync timestamps', () => {
    const status = SE.getSyncStatus();
    expect(status.deviceId).toMatch(/^dev_/);
    expect(typeof status.hasFolderWatch).toBe('boolean');
  });

  test('reflects updated device name', () => {
    SE.setDeviceName('My Test PC');
    const status = SE.getSyncStatus();
    expect(status.deviceName).toBe('My Test PC');
  });
});

// ---------------------------------------------------------------------------
// Edge cases
// ---------------------------------------------------------------------------

describe('edge cases', () => {
  test('computeFingerprint handles empty pattern array', () => {
    const proj = { settings: { sW: 0, sH: 0 }, pattern: [] };
    const fp = SE.computeFingerprint(proj);
    expect(typeof fp).toBe('string');
    expect(fp).toMatch(/^fp_/);
  });

  test('mergeStash handles one-sided data', () => {
    const localOnly = { threads: { '310': { owned: 2 } }, patterns: [{ id: 'p1', title: 'Test' }] };
    const result = SE.mergeStash(localOnly, null);
    expect(result.threads['310'].owned).toBe(2);
    expect(result.patterns[0].title).toBe('Test');
  });

  test('mergeStash handles remote-only data', () => {
    const remoteOnly = { threads: { '550': { owned: 1 } }, patterns: [] };
    const result = SE.mergeStash(null, remoteOnly);
    expect(result.threads['550'].owned).toBe(1);
  });

  test('mergeDoneArrays handles mismatched lengths gracefully', () => {
    const local = [1, 0, 1];
    const remote = [0, 1];
    // Should handle the shorter array without crashing
    const result = SE.mergeDoneArrays(local, remote, 3);
    expect(result.length).toBe(3);
    expect(result[0]).toBe(1);
    expect(result[1]).toBe(1);
    expect(result[2]).toBe(1);
  });

  test('validate rejects malformed input gracefully', () => {
    expect(SE.validate(undefined).valid).toBe(false);
    expect(SE.validate('string').valid).toBe(false);
    expect(SE.validate(42).valid).toBe(false);
    expect(SE.validate([]).valid).toBe(false);
  });

  test('compress handles empty projects array', () => {
    const obj = { _format: 'cross-stitch-sync', _version: 1, projects: [] };
    const compressed = SE.compress(obj);
    const back = SE.decompress(compressed.buffer);
    expect(back.projects).toEqual([]);
  });
});
// ---------------------------------------------------------------------------
// Folder watch helpers
// ---------------------------------------------------------------------------

describe('hasFolderWatchSupport', () => {
  test('returns false when showDirectoryPicker is not available', () => {
    delete global.window.showDirectoryPicker;
    expect(SE.hasFolderWatchSupport()).toBe(false);
  });

  test('returns true when showDirectoryPicker is a function', () => {
    global.window.showDirectoryPicker = function() {};
    expect(SE.hasFolderWatchSupport()).toBe(true);
    delete global.window.showDirectoryPicker;
  });
});

describe('isAutoSyncEnabled / setAutoSyncEnabled', () => {
  beforeEach(() => { global.localStorage.clear(); });

  test('defaults to false', () => {
    expect(SE.isAutoSyncEnabled()).toBe(false);
  });

  test('can be enabled and disabled', () => {
    SE.setAutoSyncEnabled(true);
    expect(SE.isAutoSyncEnabled()).toBe(true);
    SE.setAutoSyncEnabled(false);
    expect(SE.isAutoSyncEnabled()).toBe(false);
  });
});

describe('getSyncStatus includes folder watch fields', () => {
  beforeEach(() => { global.localStorage.clear(); });

  test('includes hasFolderWatch and autoSync fields', () => {
    const st = SE.getSyncStatus();
    expect(st).toHaveProperty('hasFolderWatch');
    expect(st).toHaveProperty('hasWatchDir');
    expect(st).toHaveProperty('autoSync');
    expect(typeof st.autoSync).toBe('boolean');
  });

  test('autoSync reflects localStorage setting', () => {
    SE.setAutoSyncEnabled(true);
    expect(SE.getSyncStatus().autoSync).toBe(true);
    SE.setAutoSyncEnabled(false);
    expect(SE.getSyncStatus().autoSync).toBe(false);
  });
});

describe('triggerAutoExport', () => {
  beforeEach(() => { global.localStorage.clear(); });

  test('does not throw when auto-sync is disabled', () => {
    expect(() => SE.triggerAutoExport()).not.toThrow();
  });

  test('does not throw when auto-sync is enabled but no folder handle', () => {
    SE.setAutoSyncEnabled(true);
    expect(() => SE.triggerAutoExport()).not.toThrow();
    SE.setAutoSyncEnabled(false);
  });
});

describe('exportToFolder', () => {
  test('throws when no directory handle is configured', async () => {
    await expect(SE.exportToFolder(null)).rejects.toThrow('No sync folder configured');
  });
});

describe('scanFolder', () => {
  test('returns empty array when no directory handle', async () => {
    const result = await SE.scanFolder(null);
    expect(result).toEqual([]);
  });

  test('scans a mock directory with .csync files', async () => {
    // Create a valid compressed sync file
    const syncObj = {
      _format: 'cross-stitch-sync',
      _version: 1,
      _createdAt: '2024-06-01T00:00:00Z',
      _deviceId: 'dev_other',
      _deviceName: 'Other PC',
      projects: [{ id: 'proj_1', data: { id: 'proj_1', pattern: [] } }]
    };
    const compressed = SE.compress(syncObj);

    // Mock FileSystemDirectoryHandle
    const mockFile = {
      arrayBuffer: async () => compressed.buffer,
      size: compressed.length,
      lastModified: Date.now()
    };
    const mockEntries = [
      { kind: 'file', name: 'test.csync', getFile: async () => mockFile },
      { kind: 'file', name: 'readme.txt', getFile: async () => ({}) },
      { kind: 'directory', name: 'subdir' }
    ];
    const mockDirHandle = {
      queryPermission: async () => 'granted',
      requestPermission: async () => 'granted',
      values: async function*() { for (const e of mockEntries) yield e; }
    };

    const results = await SE.scanFolder(mockDirHandle);
    expect(results.length).toBe(1);
    expect(results[0].fileName).toBe('test.csync');
    expect(results[0].deviceId).toBe('dev_other');
    expect(results[0].deviceName).toBe('Other PC');
    expect(results[0].projectCount).toBe(1);
  });
});

describe('checkForUpdates', () => {
  beforeEach(() => { global.localStorage.clear(); });

  test('returns only files from other devices newer than last import', async () => {
    const myDeviceId = SE.getDeviceId();
    const syncObj1 = {
      _format: 'cross-stitch-sync', _version: 1,
      _createdAt: '2099-01-01T00:00:00Z',
      _deviceId: 'dev_other', _deviceName: 'Other',
      projects: []
    };
    const syncObj2 = {
      _format: 'cross-stitch-sync', _version: 1,
      _createdAt: '2099-01-02T00:00:00Z',
      _deviceId: myDeviceId, _deviceName: 'Me',
      projects: []
    };
    const c1 = SE.compress(syncObj1);
    const c2 = SE.compress(syncObj2);

    const mkFile = (buf) => ({
      arrayBuffer: async () => buf.buffer,
      size: buf.length, lastModified: Date.now()
    });
    const entries = [
      { kind: 'file', name: 'other.csync', getFile: async () => mkFile(c1) },
      { kind: 'file', name: 'mine.csync', getFile: async () => mkFile(c2) }
    ];
    const dirHandle = {
      queryPermission: async () => 'granted',
      requestPermission: async () => 'granted',
      values: async function*() { for (const e of entries) yield e; }
    };

    const updates = await SE.checkForUpdates(dirHandle);
    // Should only return the file from 'dev_other', not our own
    expect(updates.length).toBe(1);
    expect(updates[0].deviceId).toBe('dev_other');
  });

  test('returns empty when all files are older than last import', async () => {
    global.localStorage.setItem('cs_sync_lastImportAt', '2100-01-01T00:00:00Z');
    const syncObj = {
      _format: 'cross-stitch-sync', _version: 1,
      _createdAt: '2024-01-01T00:00:00Z',
      _deviceId: 'dev_other', projects: []
    };
    const c = SE.compress(syncObj);
    const entries = [
      { kind: 'file', name: 'old.csync', getFile: async () => ({ arrayBuffer: async () => c.buffer, size: c.length, lastModified: 0 }) }
    ];
    const dirHandle = {
      queryPermission: async () => 'granted',
      requestPermission: async () => 'granted',
      values: async function*() { for (const e of entries) yield e; }
    };

    const updates = await SE.checkForUpdates(dirHandle);
    expect(updates.length).toBe(0);
  });
});