/**
 * @jest-environment jsdom
 *
 * listProjects() rows say whether anything has been stitched, half stitches included
 * (completedStitches counts full stitches and knots only), so Home can decide whether a backup
 * reminder is worth showing.
 */
const fs = require('fs');
const path = require('path');
const { IDBFactory } = require('fake-indexeddb');

global.indexedDB = new IDBFactory();
global.IDBKeyRange = require('fake-indexeddb/lib/FDBKeyRange');
window.indexedDB = global.indexedDB;
global.ensurePersistence = () => {};
const v8 = require('v8');
global.structuredClone = v => v8.deserialize(v8.serialize(v));
// eslint-disable-next-line no-eval
eval(fs.readFileSync(path.join(__dirname, '..', 'helpers.js'), 'utf8'));
// eslint-disable-next-line no-eval
eval(fs.readFileSync(path.join(__dirname, '..', 'project-storage.js'), 'utf8'));

const pattern = () => Array.from({ length: 6 }, () => ({ id: '310', type: 'solid', rgb: [0, 0, 0] }));
const proj = (id, over) => Object.assign({ id, name: id, settings: { sW: 3, sH: 2 }, pattern: pattern(), done: [0, 0, 0, 0, 0, 0] }, over);

beforeEach(async () => { await ProjectStorage.clearAllProjects(); ProjectStorage._deletedIds.clear(); });

test('anyProgress is true for full stitches, for half stitches alone, and false for an untouched project', async () => {
  await ProjectStorage.save(proj('proj_full', { done: [1, 0, 0, 0, 0, 0] }));
  await ProjectStorage.save(proj('proj_half', { halfStitches: [[2, { fwd: {id:'310'} }]], halfDone: [[2, { fwd: true }]] }));
  await ProjectStorage.save(proj('proj_none'));
  await ProjectStorage.save(proj('proj_emptyhalf', { halfDone: [[2, {}]] }));
  const rows = Object.fromEntries((await ProjectStorage.listProjects()).map(r => [r.id, r]));
  expect(rows.proj_full.anyProgress).toBe(true);
  expect(rows.proj_half.anyProgress).toBe(true);
  expect(rows.proj_half.completedStitches).toBe(0.5);    // exact fractional units in metadata
  expect(rows.proj_half.totalStitches).toBe(6.5);       // six full cells plus one half
  expect(rows.proj_none.anyProgress).toBe(false);
  expect(rows.proj_emptyhalf.anyProgress).toBe(false);
});

test('refreshProgressRows rewrites rows from before units once, leaves the project alone, and then does nothing', async () => {
  const withHalves = proj('proj_old', {
    done: [1, 1, 0, 0, 0, 0],
    halfStitches: [[2, { fwd: { id: '310' }, bck: { id: '310' } }], [3, { fwd: { id: '310' } }]],   // 3 sides = 1.5 units
    halfDone: [[2, { fwd: true, bck: true }]]
  });
  await ProjectStorage.save(withHalves);
  // Make the row look as it did before: full stitches only, no unitsV.
  const db = await getDB();
  await new Promise(r => { const tx = db.transaction(['project_meta', 'stats_summaries'], 'readwrite'); ['project_meta', 'stats_summaries'].forEach(n => { const st = tx.objectStore(n); const q = st.get('proj_old'); q.onsuccess = () => { const v = q.result; v.unitsV = 2; v.completedStitches = 3; v.totalStitches = 8; st.put(v, 'proj_old'); }; }); tx.oncomplete = r; });
  const before = (await ProjectStorage.get('proj_old')).lastWriteAt;
  expect(await ProjectStorage.refreshProgressRows({ idle: cb => cb() })).toBe(1);
  const row = (await ProjectStorage.listProjects()).find(r => r.id === 'proj_old');
  expect(row.unitsV).toBe(4);
  expect(row.paceDaily).toEqual({});          // the rows now carry what the finish estimate needs (no sessions here)
  expect(row.activeDaysTotal).toBe(0);
  expect(row.totalStitches).toBe(7.5);        // 6 cells + 3 half sides, without rounding
  expect(row.completedStitches).toBe(3);      // 2 full + 2 half sides (1 unit)
  expect((await ProjectStorage.get('proj_old')).lastWriteAt).toBe(before);    // the project itself was not written
  expect(await ProjectStorage.refreshProgressRows({ idle: cb => cb() })).toBe(0);
});

test('opening global Stats directly migrates rounded v2 summaries without rewriting the project',async()=>{
  await ProjectStorage.save(proj('proj_stats',{done:[1,0,0,0,0,0],halfStitches:[[2,{fwd:{id:'310'}}]]}));
  const before=(await ProjectStorage.get('proj_stats')).lastWriteAt;
  const db=await getDB();
  await new Promise(resolve=>{const tx=db.transaction(['project_meta','stats_summaries'],'readwrite');for(const name of ['project_meta','stats_summaries']){const store=tx.objectStore(name),req=store.get('proj_stats');req.onsuccess=()=>store.put({...req.result,unitsV:2,totalStitches:7},'proj_stats');}tx.oncomplete=resolve;});
  const summary=(await ProjectStorage.getAllStatsSummaries()).find(p=>p.id==='proj_stats');
  expect(summary.totalStitches).toBe(6.5);expect(summary.unitsV).toBe(4);
  expect((await ProjectStorage.get('proj_stats')).lastWriteAt).toBe(before);
});

test('summary migration cannot restore a stale session fence or resurrect deleted metadata',async()=>{
  const id='proj_migrate_race';await ProjectStorage.save(proj(id));
  const db=await getDB();
  await new Promise(resolve=>{const tx=db.transaction('project_meta','readwrite'),store=tx.objectStore('project_meta'),q=store.get(id);q.onsuccess=()=>store.put({...q.result,unitsV:2},id);tx.oncomplete=resolve;});
  const original=ProjectStorage.get;
  const spy=jest.spyOn(ProjectStorage,'get').mockImplementation(async key=>{
    const stale=await original.call(ProjectStorage,key);
    await ProjectStorage.save(proj(id,{done:[1,0,0,0,0,0],statsSessions:[{id:'finished',durationSeconds:60}]}));
    return stale;
  });
  try{expect(await ProjectStorage.refreshProgressRows({idle:cb=>cb()})).toBe(1);}finally{spy.mockRestore();}
  const row=(await ProjectStorage.listProjects()).find(r=>r.id===id);
  expect(row.completedStitches).toBe(1);
  expect(row.checkpointFence.statsSessions).toEqual([{id:'finished',groupId:undefined}]);
  await ProjectStorage.saveSessionCheckpoint(id,{v:1,projectId:id,sessionId:'finished',checkpointAt:1000,records:[{id:'finished',durationSeconds:60}]});
  const pending=await new Promise(resolve=>{const r=db.transaction('pendingImports').objectStore('pendingImports').getAll();r.onsuccess=()=>resolve(r.result);});
  expect(pending.some(r=>r.sessionId==='finished'&&!r.closed)).toBe(false);
  // A deletion between the migration read and write must not recreate a list row.
  await new Promise(resolve=>{const tx=db.transaction('project_meta','readwrite'),store=tx.objectStore('project_meta'),q=store.get(id);q.onsuccess=()=>store.put({...q.result,unitsV:2},id);tx.oncomplete=resolve;});
  const deleted=jest.spyOn(ProjectStorage,'get').mockImplementation(async key=>{const stale=await original.call(ProjectStorage,key);await ProjectStorage.delete(key);return stale;});
  try{expect(await ProjectStorage.refreshProgressRows({idle:cb=>cb()})).toBe(0);}finally{deleted.mockRestore();}
  expect((await ProjectStorage.listProjects()).some(r=>r.id===id)).toBe(false);
});
