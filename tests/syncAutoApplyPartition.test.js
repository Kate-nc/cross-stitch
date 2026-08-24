// Regression tests for sync fixes #3 and #4.
//
// #4 — merge-tracking is auto-applicable. After the first sync every shared
//      project lands in merge-tracking, so gating it there meant updates to an
//      existing pattern never propagated without a manual review click.
// #3 — the auto-apply decision is per-entry, not all-or-nothing. One malformed
//      record used to divert every healthy project in the same .csync with it.

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

function goodProject(id) {
  const pattern = [];
  for (let i = 0; i < 400; i++) pattern.push({ id: String(310 + (i % 3)) });
  return {
    id: id || 'proj_ok', name: id || 'ok', updatedAt: '2026-08-23T10:00:00.000Z',
    settings: { sW: 20, sH: 20 }, pattern, done: new Array(400).fill(0)
  };
}
function badProject(id) {
  // No dimensions anywhere and a stub pattern — the shape gate must reject it.
  return { id: id || 'proj_bad', name: 'bad', pattern: [], updatedAt: '2026-08-23T10:00:00.000Z' };
}
const entry = (p) => ({ id: p.id, remote: { data: p } });

function plan(overrides) {
  return Object.assign({
    newRemote: [], mergeTracking: [], conflicts: [], idRewrites: [],
    stashMerge: null, remoteTombstones: [], syncObj: { _deviceId: 'dev_A' }
  }, overrides || {});
}

describe('sync fix #4 — merge-tracking auto-applies', () => {
  test('a merge-tracking-only plan is auto-applicable', () => {
    expect(SE._test.isPlanAutoApplicable(plan({ mergeTracking: [entry(goodProject())] }))).toBe(true);
  });

  test('mixed new + merge is auto-applicable', () => {
    expect(SE._test.isPlanAutoApplicable(plan({
      newRemote: [entry(goodProject('proj_1'))],
      mergeTracking: [entry(goodProject('proj_2'))]
    }))).toBe(true);
  });

  test('structural conflicts still block auto-apply entirely', () => {
    expect(SE._test.isPlanAutoApplicable(plan({
      mergeTracking: [entry(goodProject())],
      conflicts: [entry(goodProject('proj_c'))]
    }))).toBe(false);
  });

  test('a malformed merge-tracking entry blocks the whole-plan check', () => {
    expect(SE._test.isPlanAutoApplicable(plan({ mergeTracking: [entry(badProject())] }))).toBe(false);
  });

  test('an empty plan is not auto-applicable', () => {
    expect(SE._test.isPlanAutoApplicable(plan())).toBe(false);
  });
});

describe('sync fix #3 — per-entry partition', () => {
  test('healthy entries apply while only the malformed one is queued', () => {
    const good1 = goodProject('proj_1'), good2 = goodProject('proj_2'), bad = badProject('proj_x');
    const { autoPlan, reviewPlan } = SE._test.partitionPlan(plan({
      newRemote: [entry(good1), entry(bad), entry(good2)]
    }));
    expect(autoPlan.newRemote.map(e => e.id)).toEqual(['proj_1', 'proj_2']);
    expect(reviewPlan.newRemote.map(e => e.id)).toEqual(['proj_x']);
  });

  test('conflicts go to the review half, merges to the auto half', () => {
    const { autoPlan, reviewPlan } = SE._test.partitionPlan(plan({
      mergeTracking: [entry(goodProject('proj_m'))],
      conflicts: [entry(goodProject('proj_c'))]
    }));
    expect(autoPlan.mergeTracking.map(e => e.id)).toEqual(['proj_m']);
    expect(autoPlan.conflicts).toEqual([]);
    expect(reviewPlan.conflicts.map(e => e.id)).toEqual(['proj_c']);
    expect(reviewPlan.mergeTracking).toEqual([]);
  });

  test('side effects ride with autoPlan and are stripped from reviewPlan', () => {
    const { autoPlan, reviewPlan } = SE._test.partitionPlan(plan({
      newRemote: [entry(goodProject('proj_1'))],
      conflicts: [entry(goodProject('proj_c'))],
      stashMerge: { threads: { 310: { owned: 2 } } },
      remoteTombstones: ['proj_dead'],
      syncObj: { _deviceId: 'dev_A', prefs: { cs_pref_units: 'cm' } }
    }));
    expect(autoPlan.stashMerge).not.toBeNull();
    expect(autoPlan.remoteTombstones).toEqual(['proj_dead']);
    expect(autoPlan.syncObj.prefs).toEqual({ cs_pref_units: 'cm' });
    // Must not be applied twice when the review half is later executed.
    expect(reviewPlan.stashMerge).toBeNull();
    expect(reviewPlan.remoteTombstones).toEqual([]);
    expect(reviewPlan.syncObj.prefs).toBeUndefined();
  });

  test('the original plan object is not mutated by partitioning', () => {
    const original = plan({
      newRemote: [entry(goodProject('proj_1'))],
      conflicts: [entry(goodProject('proj_c'))],
      stashMerge: { threads: {} },
      remoteTombstones: ['proj_dead'],
      syncObj: { _deviceId: 'dev_A', prefs: { cs_pref_units: 'cm' } }
    });
    SE._test.partitionPlan(original);
    expect(original.conflicts.length).toBe(1);
    expect(original.stashMerge).not.toBeNull();
    expect(original.remoteTombstones).toEqual(['proj_dead']);
    expect(original.syncObj.prefs).toEqual({ cs_pref_units: 'cm' });
  });

  test('when nothing is safe, the whole plan goes to review untouched', () => {
    const p = plan({ newRemote: [entry(badProject())] });
    const { autoPlan, reviewPlan } = SE._test.partitionPlan(p);
    expect(autoPlan).toBeNull();
    expect(reviewPlan).toBe(p);
  });

  test('when everything is safe, there is no review half', () => {
    const { autoPlan, reviewPlan } = SE._test.partitionPlan(plan({
      newRemote: [entry(goodProject('proj_1'))],
      mergeTracking: [entry(goodProject('proj_2'))]
    }));
    expect(autoPlan).not.toBeNull();
    expect(reviewPlan).toBeNull();
  });

  test('idRewrites follow their entry into the correct half', () => {
    const mGood = entry(goodProject('proj_m'));
    const mBad = entry(badProject('proj_b'));
    mGood.idRewrite = { remoteId: 'proj_m', localId: 'proj_l', canonicalId: 'proj_l' };
    mBad.idRewrite = { remoteId: 'proj_b', localId: 'proj_l2', canonicalId: 'proj_l2' };
    const { autoPlan, reviewPlan } = SE._test.partitionPlan(plan({
      mergeTracking: [mGood, mBad], idRewrites: [mGood, mBad]
    }));
    expect(autoPlan.idRewrites).toEqual([mGood]);
    expect(reviewPlan.idRewrites).toEqual([mBad]);
  });
});

describe('sync fix #3 — empty deliveries stay silent', () => {
  test('an all-identical plan produces no auto work and no review prompt', () => {
    // Now that updatedAt is preserved, a peer re-exporting unchanged data
    // classifies everything as `identical`. That must not fire a banner.
    const { autoPlan, reviewPlan } = SE._test.partitionPlan(plan());
    expect(autoPlan).toBeNull();
    expect(reviewPlan).toBeNull();
  });

  test('a stash-only delivery is still surfaced for review', () => {
    const { autoPlan, reviewPlan } = SE._test.partitionPlan(plan({
      stashMerge: { threads: { 310: { owned: 3 } } }
    }));
    expect(autoPlan).toBeNull();
    expect(reviewPlan).not.toBeNull();
  });

  test('planHasProjectWork reflects all three project buckets', () => {
    expect(SE._test.planHasProjectWork(plan())).toBe(false);
    expect(SE._test.planHasProjectWork(plan({ newRemote: [entry(goodProject())] }))).toBe(true);
    expect(SE._test.planHasProjectWork(plan({ mergeTracking: [entry(goodProject())] }))).toBe(true);
    expect(SE._test.planHasProjectWork(plan({ conflicts: [entry(goodProject())] }))).toBe(true);
  });
});
