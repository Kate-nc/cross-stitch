// tests/syncKnots.test.js — French knots across devices (P4-4).

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
    id: 'proj_k', name: 'Knots', updatedAt: '2026-10-01T09:00:00.000Z',
    settings: { sW: 10, sH: 10, fabricCt: 14 }, pattern,
    done: new Array(100).fill(0), threadOwned: {}, parkMarkers: [], achievedMilestones: [], halfDone: {}
  }, overrides || {});
}
const KNOTS = [{ x: 1, y: 1, id: '310' }, { x: 4, y: 6, id: '666' }];

describe('fingerprint', () => {
  test('a chart without knots keeps its fingerprint', () => {
    expect(SE.computeFingerprint(proj({ knots: [] }))).toBe(SE.computeFingerprint(proj()));
  });
  test('knots are chart content: adding or moving one changes the fingerprint', () => {
    const plain = SE.computeFingerprint(proj());
    const withKnots = SE.computeFingerprint(proj({ knots: KNOTS }));
    const moved = SE.computeFingerprint(proj({ knots: [KNOTS[0], { x: 5, y: 5, id: '666' }] }));
    expect(withKnots).not.toBe(plain);
    expect(moved).not.toBe(withKnots);
    // Order doesn't matter.
    expect(SE.computeFingerprint(proj({ knots: KNOTS.slice().reverse() }))).toBe(withKnots);
  });
});

describe('mergeTrackingProgress', () => {
  test('keeps the knots and unions the done marks', () => {
    const local = proj({ knots: KNOTS, knotsDone: ['1,1'] });
    const remote = proj({ knots: KNOTS, knotsDone: ['4,6', '1,1'] });
    const merged = SE.mergeTrackingProgress(local, remote);
    expect(merged.knots).toEqual(KNOTS);
    expect(merged.knotsDone.sort()).toEqual(['1,1', '4,6']);
    // Idempotent.
    expect(SE.mergeTrackingProgress(merged, remote).knotsDone.sort()).toEqual(['1,1', '4,6']);
  });
  test('a device that has never seen knots takes them from the other', () => {
    const merged = SE.mergeTrackingProgress(proj(), proj({ knots: KNOTS, knotsDone: ['1,1'] }));
    expect(merged.knots).toEqual(KNOTS);
    expect(merged.knotsDone).toEqual(['1,1']);
  });
  test('projects without knots gain no knot fields', () => {
    const merged = SE.mergeTrackingProgress(proj(), proj());
    expect('knots' in merged).toBe(false);
    expect('knotsDone' in merged).toBe(false);
  });
});

describe('beads across sync devices',()=>{
  const B=require('../beads');
  const beads=B.normalise([{x:1,y:1,label:'Gold',rgb:[200,180,40]},{x:1,y:1,label:'Blue',rgb:[0,0,200]}]);
  test('bead edits/deletion/identity change need chart review; completion alone does not',()=>{
    const p=proj({beads});const fp=SE.computeFingerprint(p);
    expect(SE.computeFingerprint({...p,beadsDone:[beads[0].uid]})).toBe(fp);
    expect(SE.computeFingerprint({...p,beads:beads.slice().reverse()})).toBe(fp);
    for(const b of [{...beads[0],x:4},{...beads[0],label:'Red'},{...beads[0],uid:'copy'}]){
      expect(SE.computeFingerprint({...p,beads:[b,beads[1]]})).not.toBe(fp);
    }
    expect(SE.computeFingerprint({...p,beads:[]})).not.toBe(fp);
    expect(SE.computeFingerprint(proj({beads:[]}))).toBe(SE.computeFingerprint(proj()));
  });
  test('sync merge preserves identities/references and independently merges completion registers',()=>{
    const p=proj({beads,beadsDone:[]});
    const l=TrackingSync.record(p,{...p,beadsDone:[beads[0].uid]},'left');
    const r=TrackingSync.record(p,{...p,beadsDone:[beads[1].uid]},'right');
    const merged=SE.mergeTrackingProgress(l,r);
    expect(merged.beads).toEqual(beads);
    expect(new Set(merged.beadsDone)).toEqual(new Set(beads.map(b=>b.uid)));
  });
});
