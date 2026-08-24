// Bug-hunt regression tests for the merge engine.
//
// Auto-applying merge-tracking (fix #4) means mergeTrackingProgress now runs
// unattended every time a peer publishes a change, instead of only when a user
// clicked "merge". That makes idempotency a hard requirement: merging the same
// pair twice must equal merging it once, or values drift on every sync.
//
// Found by the hunt: merged.totalTime was a plain sum (local + remote), so each
// peer edit re-added the peer's entire accumulated total to ours.

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

function proj(overrides) {
  const pattern = [];
  for (let i = 0; i < 100; i++) pattern.push({ id: String(310 + (i % 3)) });
  return Object.assign({
    id: 'proj_1', name: 'Shared', updatedAt: '2026-08-01T00:00:00.000Z',
    settings: { sW: 10, sH: 10 }, pattern,
    done: new Array(100).fill(0), statsSessions: [], sessions: [],
    totalTime: 0, threadOwned: {}, parkMarkers: [], achievedMilestones: [], halfDone: {}
  }, overrides || {});
}

describe('merge idempotency — repeating a merge must not drift', () => {
  test('totalTime does not compound when the peer edits repeatedly', () => {
    // Device B has absorbed A's 100s already. A then stitches 10s more.
    const local = proj({ totalTime: 100, updatedAt: '2026-08-02T00:00:00.000Z' });
    const remote = proj({ totalTime: 110, updatedAt: '2026-08-03T00:00:00.000Z' });
    const merged = SE.mergeTrackingProgress(local, remote);
    // The old sum produced 210.
    expect(merged.totalTime).toBe(110);
  });

  test('merging the same pair twice equals merging it once', () => {
    const local = proj({ totalTime: 100 });
    const remote = proj({ totalTime: 110, updatedAt: '2026-08-03T00:00:00.000Z' });
    const once = SE.mergeTrackingProgress(local, remote);
    const twice = SE.mergeTrackingProgress(once, remote);
    expect(twice.totalTime).toBe(once.totalTime);
  });

  test('ten consecutive merges stay stable', () => {
    const remote = proj({ totalTime: 110, updatedAt: '2026-08-03T00:00:00.000Z' });
    let acc = proj({ totalTime: 100 });
    for (let i = 0; i < 10; i++) acc = SE.mergeTrackingProgress(acc, remote);
    expect(acc.totalTime).toBe(110);
  });

  test('genuine cross-device time is recovered from the deduplicated sessions', () => {
    // Each device recorded its own distinct session; the union is the truth.
    const local = proj({
      totalTime: 100,
      statsSessions: [{ start: '2026-08-01T10:00:00.000Z', durationSeconds: 100, date: '2026-08-01' }]
    });
    const remote = proj({
      totalTime: 30, updatedAt: '2026-08-03T00:00:00.000Z',
      statsSessions: [{ start: '2026-08-02T10:00:00.000Z', durationSeconds: 30, date: '2026-08-02' }]
    });
    const merged = SE.mergeTrackingProgress(local, remote);
    expect(merged.statsSessions.length).toBe(2);
    // max(100, 30, 100+30) — the session union recovers the real total.
    expect(merged.totalTime).toBe(130);
  });

  test('overlapping sessions are not double counted', () => {
    const shared = { start: '2026-08-01T10:00:00.000Z', durationSeconds: 100, date: '2026-08-01' };
    const local = proj({ totalTime: 100, statsSessions: [shared] });
    const remote = proj({ totalTime: 100, updatedAt: '2026-08-03T00:00:00.000Z', statsSessions: [shared] });
    const merged = SE.mergeTrackingProgress(local, remote);
    expect(merged.statsSessions.length).toBe(1);
    expect(merged.totalTime).toBe(100);
  });

  test('durationMinutes sessions are converted to seconds', () => {
    const local = proj({ totalTime: 0, statsSessions: [{ start: 's1', durationMinutes: 2, date: '2026-08-01' }] });
    const remote = proj({ totalTime: 0, updatedAt: '2026-08-03T00:00:00.000Z', statsSessions: [] });
    expect(SE.mergeTrackingProgress(local, remote).totalTime).toBe(120);
  });

  test('legacy projects with no sessions still keep the larger recorded total', () => {
    const local = proj({ totalTime: 500, statsSessions: [] });
    const remote = proj({ totalTime: 200, updatedAt: '2026-08-03T00:00:00.000Z', statsSessions: [] });
    expect(SE.mergeTrackingProgress(local, remote).totalTime).toBe(500);
  });

  test('malformed session durations are ignored rather than producing NaN', () => {
    const local = proj({
      totalTime: 50,
      statsSessions: [{ start: 's1', durationSeconds: 'oops' }, { start: 's2' }, null]
    });
    const remote = proj({ totalTime: 10, updatedAt: '2026-08-03T00:00:00.000Z' });
    const merged = SE.mergeTrackingProgress(local, remote);
    expect(Number.isFinite(merged.totalTime)).toBe(true);
    expect(merged.totalTime).toBe(50);
  });
});

describe('merge idempotency — the other merged fields', () => {
  const remote = proj({
    updatedAt: '2026-08-03T00:00:00.000Z',
    done: (() => { const d = new Array(100).fill(0); d[5] = 1; d[6] = 1; return d; })(),
    threadOwned: { 310: 'owned' },
    parkMarkers: [{ idx: 3 }],
    achievedMilestones: [{ pct: 25 }],
    halfDone: { 7: { TL: { id: '310' } } },
    statsSessions: [{ start: 'r1', durationSeconds: 60, date: '2026-08-02' }]
  });

  function localWithWork() {
    const d = new Array(100).fill(0); d[1] = 1;
    return proj({
      done: d, threadOwned: { 550: 'tobuy' }, parkMarkers: [{ idx: 9 }],
      achievedMilestones: [{ pct: 10 }],
      statsSessions: [{ start: 'l1', durationSeconds: 40, date: '2026-08-01' }]
    });
  }

  test('done, sessions, markers and milestones are all stable under repetition', () => {
    const once = SE.mergeTrackingProgress(localWithWork(), remote);
    const twice = SE.mergeTrackingProgress(once, remote);

    expect(twice.done).toEqual(once.done);
    expect(twice.statsSessions.length).toBe(once.statsSessions.length);
    expect(twice.parkMarkers.length).toBe(once.parkMarkers.length);
    expect(twice.achievedMilestones.length).toBe(once.achievedMilestones.length);
    expect(twice.threadOwned).toEqual(once.threadOwned);
    expect(twice.halfDone).toEqual(once.halfDone);
  });

  test('the union still preserves both sides of the work', () => {
    const merged = SE.mergeTrackingProgress(localWithWork(), remote);
    expect(merged.done[1]).toBe(1); // local's stitch
    expect(merged.done[5]).toBe(1); // remote's stitch
    expect(merged.threadOwned).toEqual({ 550: 'tobuy', 310: 'owned' });
    expect(merged.parkMarkers.length).toBe(2);
    expect(merged.statsSessions.length).toBe(2);
  });

  test('merging does not mutate either input', () => {
    const local = localWithWork();
    const localBefore = JSON.stringify(local);
    const remoteBefore = JSON.stringify(remote);
    SE.mergeTrackingProgress(local, remote);
    expect(JSON.stringify(local)).toBe(localBefore);
    expect(JSON.stringify(remote)).toBe(remoteBefore);
  });
});
