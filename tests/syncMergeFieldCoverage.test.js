// Tests for sync fix #7 — merge field coverage.
//
// mergeTrackingProgress takes the LOCAL project as its base, so any field it
// does not explicitly merge keeps the local value forever. That is why a
// pattern could merge "successfully" and still look stale: per-day stitch
// history, fractional stitches, completion status, thumbnail, notes, designer,
// description and colour never crossed between devices.

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

const OLD = '2026-07-01T09:00:00.000Z';
const NEW = '2026-08-23T10:00:00.000Z';

function proj(updatedAt, overrides) {
  const pattern = [];
  for (let i = 0; i < 100; i++) pattern.push({ id: String(310 + (i % 3)) });
  return Object.assign({
    id: 'proj_1', name: 'Shared', updatedAt,
    settings: { sW: 10, sH: 10, fabricCt: 14 }, pattern,
    done: new Array(100).fill(0), statsSessions: [], sessions: [], totalTime: 0,
    threadOwned: {}, parkMarkers: [], achievedMilestones: [], halfDone: {}
  }, overrides || {});
}

describe('fix #7 — per-day stitch history crosses devices', () => {
  test('distinct days from both devices survive', () => {
    const local = proj(OLD, { stitchLog: [{ date: '2026-07-01', count: 100 }] });
    const remote = proj(NEW, { stitchLog: [{ date: '2026-08-20', count: 250 }] });
    const merged = SE.mergeTrackingProgress(local, remote);
    expect(merged.stitchLog).toEqual([
      { date: '2026-07-01', count: 100 },
      { date: '2026-08-20', count: 250 }
    ]);
  });

  test('a shared day takes the larger count and does not compound', () => {
    const local = proj(OLD, { stitchLog: [{ date: '2026-08-20', count: 100 }] });
    const remote = proj(NEW, { stitchLog: [{ date: '2026-08-20', count: 250 }] });
    const once = SE.mergeTrackingProgress(local, remote);
    expect(once.stitchLog).toEqual([{ date: '2026-08-20', count: 250 }]);
    // Idempotent: re-merging must not grow it.
    const twice = SE.mergeTrackingProgress(once, remote);
    expect(twice.stitchLog).toEqual([{ date: '2026-08-20', count: 250 }]);
  });

  test('ten re-merges leave the log stable', () => {
    const remote = proj(NEW, { stitchLog: [{ date: '2026-08-20', count: 250 }] });
    let acc = proj(OLD, { stitchLog: [{ date: '2026-07-01', count: 100 }] });
    for (let i = 0; i < 10; i++) acc = SE.mergeTrackingProgress(acc, remote);
    expect(acc.stitchLog).toEqual([
      { date: '2026-07-01', count: 100 },
      { date: '2026-08-20', count: 250 }
    ]);
  });

  test('malformed entries are skipped without producing NaN', () => {
    const merged = SE.mergeStitchLogs(
      [{ date: '2026-08-01', count: 'oops' }, null, { count: 5 }],
      [{ date: '2026-08-01', count: 10 }]
    );
    expect(merged).toEqual([{ date: '2026-08-01', count: 10 }]);
  });
});

describe('fix #7 — fractional stitches cross devices', () => {
  test('halfStitches from both sides are unioned by index', () => {
    const local = proj(OLD, { halfStitches: [[5, { fwd: { id: '310' } }]] });
    const remote = proj(NEW, { halfStitches: [[9, { bck: { id: '550' } }]] });
    const merged = SE.mergeTrackingProgress(local, remote);
    expect(merged.halfStitches.length).toBe(2);
    expect(merged.halfStitches.map(p => p[0]).sort()).toEqual([5, 9]);
  });

  test('a shared index merges sub-keys with local winning', () => {
    const merged = SE.mergeIndexedPairs(
      [[5, { fwd: { id: '310' } }]],
      [[5, { fwd: { id: '999' }, bck: { id: '550' } }]]
    );
    expect(merged.length).toBe(1);
    expect(merged[0][1].fwd.id).toBe('310');  // local kept
    expect(merged[0][1].bck.id).toBe('550');  // remote contributed
  });

  test('partialStitches are merged the same way', () => {
    const local = proj(OLD, { partialStitches: [['3', { TL: { id: '310' } }]] });
    const remote = proj(NEW, { partialStitches: [['3', { BR: { id: '550' } }]] });
    const merged = SE.mergeTrackingProgress(local, remote);
    expect(merged.partialStitches[0][1].TL.id).toBe('310');
    expect(merged.partialStitches[0][1].BR.id).toBe('550');
  });

  test('the union is idempotent', () => {
    const remote = [[5, { fwd: { id: '310' } }], [9, { bck: { id: '550' } }]];
    let acc = [[1, { fwd: { id: '666' } }]];
    for (let i = 0; i < 10; i++) acc = SE.mergeIndexedPairs(acc, remote);
    expect(acc.length).toBe(3);
  });

  test('merging does not mutate the inputs', () => {
    const local = [[5, { fwd: { id: '310' } }]];
    const remote = [[5, { bck: { id: '550' } }]];
    SE.mergeIndexedPairs(local, remote);
    expect(local[0][1].bck).toBeUndefined();
    expect(remote[0][1].fwd).toBeUndefined();
  });
});

describe('fix #7 — metadata newest-wins', () => {
  test('completion status propagates from the newer side', () => {
    const local = proj(OLD, { finishStatus: 'active' });
    const remote = proj(NEW, { finishStatus: 'completed' });
    expect(SE.mergeTrackingProgress(local, remote).finishStatus).toBe('completed');
  });

  test('the older side does not overwrite the newer', () => {
    const local = proj(NEW, { finishStatus: 'completed' });
    const remote = proj(OLD, { finishStatus: 'active' });
    expect(SE.mergeTrackingProgress(local, remote).finishStatus).toBe('completed');
  });

  test('notes, designer, description and colour all travel', () => {
    const local = proj(OLD, { notes: '', designer: '', description: '', projectColor: null });
    const remote = proj(NEW, {
      notes: 'finished the border', designer: 'Kate',
      description: 'a rose', projectColor: '#ff0000'
    });
    const merged = SE.mergeTrackingProgress(local, remote);
    expect(merged.notes).toBe('finished the border');
    expect(merged.designer).toBe('Kate');
    expect(merged.description).toBe('a rose');
    expect(merged.projectColor).toBe('#ff0000');
  });

  test('a deliberately cleared note is respected when the remote is newer', () => {
    const local = proj(OLD, { notes: 'old note' });
    const remote = proj(NEW, { notes: '' });
    expect(SE.mergeTrackingProgress(local, remote).notes).toBe('');
  });

  test('gate overrides still pin a field', () => {
    const local = proj(OLD, { name: 'Local name' });
    const remote = proj(NEW, { name: 'Remote name' });
    expect(SE.mergeTrackingProgress(local, remote, { name: 'keep-local' }).name).toBe('Local name');
    const l2 = proj(NEW, { name: 'Local name' });
    const r2 = proj(OLD, { name: 'Remote name' });
    expect(SE.mergeTrackingProgress(l2, r2, { name: 'keep-remote' }).name).toBe('Remote name');
  });
});

describe('fix #7 — expensive assets are never wiped by an absent value', () => {
  test('a newer remote with no thumbnail does not clear the local one', () => {
    const local = proj(OLD, { thumbnail: 'LOCAL-THUMB' });
    const remote = proj(NEW, { thumbnail: null });
    expect(SE.mergeTrackingProgress(local, remote).thumbnail).toBe('LOCAL-THUMB');
  });

  test('a newer remote with no source image does not clear the local one', () => {
    const local = proj(OLD, { imgData: 'data:image/png;base64,AAA' });
    const remote = proj(NEW, { imgData: null });
    expect(SE.mergeTrackingProgress(local, remote).imgData).toBe('data:image/png;base64,AAA');
  });

  test('but a newer remote WITH a thumbnail does replace it', () => {
    const local = proj(OLD, { thumbnail: 'LOCAL-THUMB' });
    const remote = proj(NEW, { thumbnail: 'REMOTE-THUMB' });
    expect(SE.mergeTrackingProgress(local, remote).thumbnail).toBe('REMOTE-THUMB');
  });

  test('newer settings win wholesale', () => {
    const local = proj(OLD, { settings: { sW: 10, sH: 10, fabricCt: 14 } });
    const remote = proj(NEW, { settings: { sW: 10, sH: 10, fabricCt: 18 } });
    expect(SE.mergeTrackingProgress(local, remote).settings.fabricCt).toBe(18);
  });
});

describe('fix #7 — lifecycle timestamps', () => {
  test('earliest start, latest touch, first completion', () => {
    const local = proj(OLD, {
      startedAt: '2026-06-01T00:00:00.000Z',
      lastTouchedAt: '2026-07-01T00:00:00.000Z',
      completedAt: null
    });
    const remote = proj(NEW, {
      startedAt: '2026-05-01T00:00:00.000Z',
      lastTouchedAt: '2026-08-20T00:00:00.000Z',
      completedAt: '2026-08-19T00:00:00.000Z'
    });
    const merged = SE.mergeTrackingProgress(local, remote);
    expect(merged.startedAt).toBe('2026-05-01T00:00:00.000Z');
    expect(merged.lastTouchedAt).toBe('2026-08-20T00:00:00.000Z');
    expect(merged.completedAt).toBe('2026-08-19T00:00:00.000Z');
  });

  test('lifecycle timestamps are idempotent', () => {
    const remote = proj(NEW, { startedAt: '2026-05-01T00:00:00.000Z', lastTouchedAt: '2026-08-20T00:00:00.000Z' });
    let acc = proj(OLD, { startedAt: '2026-06-01T00:00:00.000Z', lastTouchedAt: '2026-07-01T00:00:00.000Z' });
    for (let i = 0; i < 5; i++) acc = SE.mergeTrackingProgress(acc, remote);
    expect(acc.startedAt).toBe('2026-05-01T00:00:00.000Z');
    expect(acc.lastTouchedAt).toBe('2026-08-20T00:00:00.000Z');
  });
});

describe('fix #7 — the whole merge stays idempotent', () => {
  test('a fully-populated merge repeated ten times does not drift', () => {
    const local = proj(OLD, {
      stitchLog: [{ date: '2026-07-01', count: 100 }],
      halfStitches: [[1, { fwd: { id: '666' } }]],
      notes: 'local', thumbnail: 'LOCAL', finishStatus: 'active',
      startedAt: '2026-06-01T00:00:00.000Z'
    });
    const remote = proj(NEW, {
      stitchLog: [{ date: '2026-08-20', count: 250 }],
      halfStitches: [[5, { fwd: { id: '310' } }]],
      notes: 'remote', thumbnail: 'REMOTE', finishStatus: 'completed',
      startedAt: '2026-05-01T00:00:00.000Z'
    });
    const once = SE.mergeTrackingProgress(local, remote);
    let acc = once;
    for (let i = 0; i < 10; i++) acc = SE.mergeTrackingProgress(acc, remote);
    expect(JSON.stringify(acc)).toBe(JSON.stringify(once));
  });
});
