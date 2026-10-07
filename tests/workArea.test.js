/**
 * Work area — geometry, validation, stepping and sync (work-area.js and
 * sync-engine.js). See reports/track-view-performance-plan.md, Phase 3.
 *
 * A work area is a group of whole Spotlight sections, saved on the project
 * and synced: the newer choice (by `setAt`) wins on merge, independently of
 * the project's updatedAt, which stitching alone keeps bumping.
 */
const fs = require('fs');
const pako = require('pako');
const WA = require('../work-area.js');

// ── sync-engine in Node (same harness as syncMergeFieldCoverage.test.js) ──
global.window = global.window || {};
global.localStorage = global.localStorage || (() => {
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
eval(fs.readFileSync('./sync-engine.js', 'utf8')); // eslint-disable-line no-eval
const SE = global.SyncEngine || global.window.SyncEngine;

const area = (x0, y0, x1, y1, setAt, active = true) => ({ active, x0, y0, x1, y1, setAt });

describe('normalise', () => {
  test('keeps a valid area', () => {
    expect(WA.normalise(area(10, 20, 60, 70, 5), 100, 100)).toEqual(area(10, 20, 60, 70, 5));
  });
  test('clamps to the pattern', () => {
    expect(WA.normalise(area(-5, 90, 50, 130, 5), 100, 100)).toEqual(area(0, 90, 50, 100, 5));
  });
  test('rejects what cannot be used', () => {
    for (const bad of [null, undefined, 'x', {}, area(10, 10, 10, 20, 1), area(50, 0, 40, 10, 1),
      area(200, 0, 300, 10, 1), { x0: 1.5, y0: 0, x1: 4, y1: 4 }, { x0: '1', y0: 0, x1: 4, y1: 4 }]) {
      expect(WA.normalise(bad, 100, 100)).toBeNull();
    }
    expect(WA.normalise(area(0, 0, 10, 10, 1), 0, 0)).toBeNull();
  });
  test('a missing or bad setAt becomes 0 (oldest), active is coerced', () => {
    expect(WA.normalise({ x0: 0, y0: 0, x1: 5, y1: 5 }, 10, 10)).toEqual(area(0, 0, 5, 5, 0, false));
    expect(WA.normalise({ x0: 0, y0: 0, x1: 5, y1: 5, setAt: -3, active: 1 }, 10, 10)).toEqual(area(0, 0, 5, 5, 0, true));
  });
  test('preserves the section geometry that created an area', () => {
    expect(WA.normalise({ active: true, x0: 0, y0: 0, x1: 10, y1: 20, bw: 1, bh: 1, gridW: 10, gridH: 20, setAt: 1 }, 100, 100))
      .toMatchObject({ bw: 1, bh: 1, gridW: 10, gridH: 20 });
  });
});

describe('sections', () => {
  test('fromSections covers whole sections, clipped at the pattern edge', () => {
    expect(WA.fromSections(1, 2, 3, 2, 10, 10, 100, 100)).toEqual({ x0: 10, y0: 20, x1: 40, y1: 40, bw: 3, bh: 2 });
    expect(WA.fromSections(9, 9, 3, 3, 10, 10, 95, 98)).toEqual({ x0: 90, y0: 90, x1: 95, y1: 98, bw: 3, bh: 3 });
  });
  test('sectionRange and snapToSections: an off-grid area grows to whole sections', () => {
    const a = { x0: 13, y0: 7, x1: 41, y1: 20 };
    expect(WA.sectionRange(a, 10, 10)).toEqual({ bx0: 1, by0: 0, bx1: 5, by1: 2 });
    expect(WA.snapToSections(a, 10, 10, 100, 100)).toEqual({ x0: 10, y0: 0, x1: 50, y1: 20, bw: 4, bh: 2 });
    // Tall sections (Royal Rows' 10 x 20).
    expect(WA.snapToSections(a, 10, 20, 100, 100)).toEqual({ x0: 10, y0: 0, x1: 50, y1: 20, bw: 4, bh: 1 });
  });
});

describe('bounds, contains', () => {
  test('margin is added on each side and clipped', () => {
    expect(WA.bounds({ x0: 10, y0: 0, x1: 50, y1: 40 }, 3, 52, 100)).toEqual({ x0: 7, y0: 0, x1: 52, y1: 43 });
    expect(WA.bounds({ x0: 10, y0: 10, x1: 20, y1: 20 }, 0, 100, 100)).toEqual({ x0: 10, y0: 10, x1: 20, y1: 20 });
  });
  test('contains is half-open', () => {
    const a = { x0: 10, y0: 10, x1: 20, y1: 20 };
    expect(WA.contains(a, 10, 10)).toBe(true);
    expect(WA.contains(a, 19, 19)).toBe(true);
    expect(WA.contains(a, 20, 15)).toBe(false);
    expect(WA.contains(null, 0, 0)).toBe(false);
    expect(WA.containsIndex(a, 15 * 100 + 12, 100)).toBe(true);
    expect(WA.containsIndex(a, 15 * 100 + 25, 100)).toBe(false);
  });
  test('describe uses the ruler numbers', () => {
    expect(WA.describe({ x0: 100, y0: 150, x1: 150, y1: 200 })).toBe('Columns 101–150 · Rows 151–200');
  });
});

describe('step', () => {
  // 100 x 60 pattern, 10 x 10 sections, areas of 3 x 2 sections (30 x 20).
  const grid = (a) => WA.step(a, 1, 10, 10, 100, 60, null);
  test('reading order, with a clipped area at the right edge', () => {
    let a = WA.fromSections(0, 0, 3, 2, 10, 10, 100, 60);
    const seen = [];
    while (a) { seen.push([a.x0, a.y0, a.x1, a.y1]); a = grid(a); }
    expect(seen).toEqual([
      [0, 0, 30, 20], [30, 0, 60, 20], [60, 0, 90, 20], [90, 0, 100, 20],
      [0, 20, 30, 40], [30, 20, 60, 40], [60, 20, 90, 40], [90, 20, 100, 40],
      [0, 40, 30, 60], [30, 40, 60, 60], [60, 40, 90, 60], [90, 40, 100, 60],
    ]);
  });
  test('backwards, and none past either end', () => {
    const first = WA.fromSections(0, 0, 3, 2, 10, 10, 100, 60);
    expect(WA.step(first, -1, 10, 10, 100, 60, null)).toBeNull();
    const second = WA.step(first, 1, 10, 10, 100, 60, null);
    expect(WA.step(second, -1, 10, 10, 100, 60, null)).toEqual({ x0: 0, y0: 0, x1: 30, y1: 20, bw: 3, bh: 2 });
    const last = WA.fromSections(9, 4, 3, 2, 10, 10, 100, 60);
    expect(WA.step(last, 1, 10, 10, 100, 60, null)).toBeNull();
  });
  test('a clipped edge area keeps the nominal size for the steps after it', () => {
    // 100 wide, areas of 3 sections: the 4th is clipped to 1 section wide.
    const edge = WA.fromSections(9, 0, 3, 2, 10, 10, 100, 60);
    expect(edge).toEqual({ x0: 90, y0: 0, x1: 100, y1: 20, bw: 3, bh: 2 });
    expect(WA.step(edge, 1, 10, 10, 100, 60, null)).toEqual({ x0: 0, y0: 20, x1: 30, y1: 40, bw: 3, bh: 2 });
    // ...and normalise keeps bw/bh through a save.
    expect(WA.normalise(Object.assign({ active: true, setAt: 1 }, edge), 100, 60)).toMatchObject({ bw: 3, bh: 2 });
  });
  test('the grid is aligned to the current area, not to zero', () => {
    const a = WA.fromSections(1, 1, 2, 2, 10, 10, 100, 60);
    expect(WA.step(a, 1, 10, 10, 100, 60, null)).toEqual({ x0: 30, y0: 10, x1: 50, y1: 30, bw: 2, bh: 2 });
  });
  test('finished areas are skipped', () => {
    const a = WA.fromSections(0, 0, 3, 2, 10, 10, 100, 60);
    const finished = (r) => r.x0 === 30 || r.x0 === 60;
    expect(WA.step(a, 1, 10, 10, 100, 60, finished)).toEqual({ x0: 90, y0: 0, x1: 100, y1: 20, bw: 3, bh: 2 });
  });
});

describe('merge', () => {
  test('newer setAt wins, either way round', () => {
    const a = area(0, 0, 10, 10, 100), b = area(20, 20, 30, 30, 200);
    expect(WA.merge(a, b)).toBe(b);
    expect(WA.merge(b, a)).toBe(b);
  });
  test('null is "never used" and loses to anything', () => {
    const a = area(0, 0, 10, 10, 0);
    expect(WA.merge(null, a)).toBe(a);
    expect(WA.merge(a, null)).toBe(a);
    expect(WA.merge(null, null)).toBeNull();
  });
  test('a tie keeps local, so merging twice changes nothing', () => {
    const a = area(0, 0, 10, 10, 100), b = area(20, 20, 30, 30, 100);
    expect(WA.merge(a, b)).toBe(a);
    expect(WA.merge(WA.merge(a, b), b)).toBe(a);
  });
  test('leaving an area is a choice too: a newer inactive area wins', () => {
    const picked = area(0, 0, 10, 10, 100, true), left = area(0, 0, 10, 10, 300, false);
    expect(WA.merge(picked, left).active).toBe(false);
  });
});

describe('sync: mergeTrackingProgress carries the work area', () => {
  const OLD = '2026-07-01T09:00:00.000Z', NEW = '2026-08-23T10:00:00.000Z';
  function proj(updatedAt, workArea) {
    const pattern = [];
    for (let i = 0; i < 100; i++) pattern.push({ id: String(310 + (i % 3)) });
    const p = { id: 'proj_1', name: 'Shared', updatedAt, settings: { sW: 10, sH: 10, fabricCt: 14 }, pattern,
      done: new Array(100).fill(0), statsSessions: [], sessions: [], totalTime: 0,
      threadOwned: {}, parkMarkers: [], achievedMilestones: [], halfDone: {} };
    if (workArea !== undefined) p.workArea = workArea;
    return p;
  }

  test('an area chosen on the other device arrives', () => {
    const remote = proj(NEW, area(0, 0, 5, 5, 2000));
    expect(SE.mergeTrackingProgress(proj(OLD), remote).workArea).toEqual(area(0, 0, 5, 5, 2000));
  });
  test('by setAt, not updatedAt: stitching elsewhere does not undo a newer local choice', () => {
    // Remote saved later (it was stitching) but chose its area earlier.
    const local = proj(OLD, area(5, 5, 10, 10, 3000));
    const remote = proj(NEW, area(0, 0, 5, 5, 1000));
    expect(SE.mergeTrackingProgress(local, remote).workArea).toEqual(area(5, 5, 10, 10, 3000));
  });
  test('a newer remote choice replaces the local one', () => {
    const local = proj(NEW, area(5, 5, 10, 10, 1000));
    const remote = proj(OLD, area(0, 0, 5, 5, 3000, false));
    expect(SE.mergeTrackingProgress(local, remote).workArea).toEqual(area(0, 0, 5, 5, 3000, false));
  });
  test('neither side has used it: stays absent-or-null, never invented', () => {
    expect(SE.mergeTrackingProgress(proj(OLD), proj(NEW)).workArea == null).toBe(true);
  });
  test('idempotent', () => {
    const local = proj(OLD, area(5, 5, 10, 10, 3000)), remote = proj(NEW, area(0, 0, 5, 5, 1000));
    const once = SE.mergeTrackingProgress(local, remote);
    const twice = SE.mergeTrackingProgress(once, remote);
    expect(twice.workArea).toEqual(once.workArea);
  });
  test('sync-engine\'s inline rule agrees with WorkArea.merge', () => {
    const vals = [null, area(0, 0, 1, 1, 0), area(0, 0, 2, 2, 5), area(0, 0, 3, 3, 5), area(0, 0, 4, 4, 9), { x0: 0, y0: 0, x1: 1, y1: 1 }];
    for (const l of vals) for (const r of vals) {
      const viaSync = SE.mergeTrackingProgress(proj(OLD, l), proj(NEW, r)).workArea;
      expect(viaSync == null ? null : viaSync).toEqual(WA.merge(l, r));
    }
  });
});
