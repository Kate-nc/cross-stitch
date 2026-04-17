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
