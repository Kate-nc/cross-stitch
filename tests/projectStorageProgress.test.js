/**
 * @jest-environment jsdom
 *
 * The Tracker's small progress record (ProjectStorage.saveProgress): marked stitches
 * written about every 400 ms, in pendingImports as "progress:<id>", and believed only
 * while it is newer than the project record (tracking audit TRACK-01).
 */
const fs = require('fs');
const path = require('path');
const { IDBFactory } = require('fake-indexeddb');

global.indexedDB = new IDBFactory();
global.IDBKeyRange = require('fake-indexeddb/lib/FDBKeyRange');
window.indexedDB = global.indexedDB;
global.ensurePersistence = () => {};
// A real structured clone: the progress record holds a typed array, which a JSON round trip would turn into a plain object.
const v8 = require('v8');
global.structuredClone = v => v8.deserialize(v8.serialize(v));

// project-storage.js gets its DB through helpers.js getDB; use the real one.
// eslint-disable-next-line no-eval
eval(fs.readFileSync(path.join(__dirname, '..', 'helpers.js'), 'utf8'));
// eslint-disable-next-line no-eval
eval(fs.readFileSync(path.join(__dirname, '..', 'project-storage.js'), 'utf8'));
window.ProjectStorage = ProjectStorage;

const N = 6;
const pattern = () => Array.from({ length: N }, () => ({ id: '310' }));
const proj = (over) => Object.assign({ id: 'proj_p', name: 'P', settings: { sW: 3, sH: 2 }, pattern: pattern(), done: [0, 0, 0, 0, 0, 0] }, over);
const base = async (id) => (await ProjectStorage.get(id)).lastWriteAt;

beforeEach(async () => {
  await ProjectStorage.clearAllProjects();
  await ProjectStorage.clearAllProgress();
  ProjectStorage._deletedIds.clear();
});

test('progress newer than the project record is applied by get()', async () => {
  await ProjectStorage.save(proj());
  const b = await base('proj_p');
  expect(await ProjectStorage.saveProgress('proj_p', { done: Uint8Array.from([1, 1, 0, 0, 0, 1]), baseWriteAt: b })).toBe(true);
  const p = await ProjectStorage.get('proj_p');
  expect(p.done).toEqual([1, 1, 0, 0, 0, 1]);
  expect(p.pattern).toHaveLength(N);                    // everything else comes from the project record
});

test('half-stitch and knot marks come with it; empty knot marks read as absent', async () => {
  await ProjectStorage.save(proj({ halfDone: [], knotsDone: ['1,1'] }));
  const b = await base('proj_p');
  await ProjectStorage.saveProgress('proj_p', { done: new Uint8Array(N), halfDone: [[2, { fwd: true }]], knotsDone: [], baseWriteAt: b });
  const p = await ProjectStorage.get('proj_p');
  expect(p.halfDone).toEqual([[2, { fwd: true }]]);
  expect(p.knotsDone).toBeUndefined();
});

test('a later write to the project retires the progress record', async () => {
  await ProjectStorage.save(proj());
  const b = await base('proj_p');
  await ProjectStorage.saveProgress('proj_p', { done: Uint8Array.from([1, 1, 1, 1, 1, 1]), baseWriteAt: b });
  await new Promise(r => setTimeout(r, 5));
  await ProjectStorage.save(proj({ done: [1, 0, 0, 0, 0, 0] }));   // full save, or a sync import, restore or rename
  expect((await ProjectStorage.get('proj_p')).done).toEqual([1, 0, 0, 0, 0, 0]);
});

test('a record for a different pattern size is ignored', async () => {
  await ProjectStorage.save(proj());
  const b = await base('proj_p');
  await ProjectStorage.saveProgress('proj_p', { done: Uint8Array.from([1, 1, 1]), baseWriteAt: b });
  expect((await ProjectStorage.get('proj_p')).done).toEqual([0, 0, 0, 0, 0, 0]);
});

test('a project that has no write time yet matches a record written with none', async () => {
  const id = 'proj_legacy';
  // Put a record straight into the store without ProjectStorage.save (no lastWriteAt).
  const db = await getDB();
  await new Promise((res, rej) => {
    const tx = db.transaction('projects', 'readwrite');
    tx.objectStore('projects').put(proj({ id }), id);
    tx.oncomplete = res; tx.onerror = () => rej(tx.error);
  });
  await ProjectStorage.saveProgress(id, { done: Uint8Array.from([1, 0, 0, 0, 0, 0]), baseWriteAt: null });
  expect((await ProjectStorage.get(id)).done).toEqual([1, 0, 0, 0, 0, 0]);
});

test('deleting a project deletes its progress record, and none is written for a deleted id', async () => {
  await ProjectStorage.save(proj());
  const b = await base('proj_p');
  await ProjectStorage.saveProgress('proj_p', { done: Uint8Array.from([1, 1, 1, 1, 1, 1]), baseWriteAt: b });
  await ProjectStorage.delete('proj_p');
  const db = await getDB();
  const rec = await ProjectStorage._readProgress(db, 'proj_p');
  expect(rec).toBeNull();
  expect(await ProjectStorage.saveProgress('proj_p', { done: new Uint8Array(N), baseWriteAt: b })).toBe(false);
});

test('clearAllProjects and clearAllProgress remove progress records', async () => {
  await ProjectStorage.save(proj());
  await ProjectStorage.save(proj({ id: 'proj_q' }));
  const bp = await base('proj_p'), bq = await base('proj_q');
  await ProjectStorage.saveProgress('proj_p', { done: new Uint8Array(N), baseWriteAt: bp });
  await ProjectStorage.saveProgress('proj_q', { done: new Uint8Array(N), baseWriteAt: bq });
  expect(await ProjectStorage.clearAllProgress()).toBe(2);
  const db = await getDB();
  expect(await ProjectStorage._readProgress(db, 'proj_p')).toBeNull();
  await ProjectStorage.saveProgress('proj_p', { done: new Uint8Array(N), baseWriteAt: bp });
  await ProjectStorage.clearAllProjects();
  expect(await ProjectStorage._readProgress(db, 'proj_p')).toBeNull();
});

test('progress records never show up as projects', async () => {
  await ProjectStorage.save(proj());
  await ProjectStorage.saveProgress('proj_p', { done: new Uint8Array(N), baseWriteAt: await base('proj_p') });
  expect((await ProjectStorage.listProjects()).map(m => m.id)).toEqual(['proj_p']);
});

test('the full save of the project does not need to know about the record (the stale record is just ignored)', async () => {
  await ProjectStorage.save(proj());
  await ProjectStorage.saveProgress('proj_p', { done: Uint8Array.from([1, 1, 1, 1, 1, 1]), baseWriteAt: 12345 });  // based on some other write
  expect((await ProjectStorage.get('proj_p')).done).toEqual([0, 0, 0, 0, 0, 0]);
});

const journalKey = id => 'crossstitch_progress_recovery:' + id;
const rawProject = async id => {
  const db = await getDB();
  return new Promise(resolve => {
    const req = db.transaction('projects').objectStore('projects').get(id);
    req.onsuccess = () => resolve(req.result);
  });
};
test('navigation journal alone recovers all mark types into the full record once', async () => {
  await ProjectStorage.save(proj());
  const b = await base('proj_p');
  expect(ProjectStorage.saveProgressRecovery('proj_p', {
    done: [1, 0, 1, 0, 0, 0], halfDone: [[1, { fwd: true }]], knotsDone: ['1,1'],
    bsDone: ['line'], partialDone: [[3, ['tl']]], baseWriteAt: b
  })).toBe(true);
  expect((await rawProject('proj_p')).done).toEqual([0, 0, 0, 0, 0, 0]);
  const p = await ProjectStorage.get('proj_p');
  expect(p).toMatchObject({ done: [1, 0, 1, 0, 0, 0], halfDone: [[1, { fwd: true }]], knotsDone: ['1,1'], bsDone: ['line'], partialDone: [[3, ['tl']]], lastWriteAt: b });
  expect((await rawProject('proj_p')).done).toEqual(p.done);
  expect(localStorage.getItem(journalKey('proj_p'))).toBeNull();
});
test('stale navigation journal cannot override a full save or another project', async () => {
  await ProjectStorage.save(proj());
  const b = await base('proj_p');
  ProjectStorage.saveProgressRecovery('proj_p', { done: new Array(N).fill(1), baseWriteAt: b - 1 });
  await ProjectStorage.save(proj({ id: 'proj_q' }));
  expect((await ProjectStorage.get('proj_p')).done).toEqual(new Array(N).fill(0));
  expect((await ProjectStorage.get('proj_q')).done).toEqual(new Array(N).fill(0));
});
test('newer IndexedDB progress wins over a journal, including unpicks', async () => {
  await ProjectStorage.save(proj());
  const b = await base('proj_p');
  ProjectStorage.saveProgressRecovery('proj_p', { done: new Array(N).fill(1), baseWriteAt: b });
  const rec = JSON.parse(localStorage.getItem(journalKey('proj_p')));
  rec.updatedAt -= 1000;
  localStorage.setItem(journalKey('proj_p'), JSON.stringify(rec));
  await ProjectStorage.saveProgress('proj_p', { done: new Uint8Array(N), baseWriteAt: b });
  expect((await ProjectStorage.get('proj_p')).done).toEqual(new Array(N).fill(0));
  expect((await rawProject('proj_p')).done).toEqual(new Array(N).fill(0));
});
test('restore and deletion clear navigation journals', async () => {
  await ProjectStorage.save(proj());
  ProjectStorage.saveProgressRecovery('proj_p', { done: new Array(N).fill(1), baseWriteAt: await base('proj_p') });
  await ProjectStorage.clearAllProgress();
  expect(localStorage.getItem(journalKey('proj_p'))).toBeNull();
  ProjectStorage.saveProgressRecovery('proj_p', { done: new Array(N).fill(1), baseWriteAt: await base('proj_p') });
  await ProjectStorage.delete('proj_p');
  expect(localStorage.getItem(journalKey('proj_p'))).toBeNull();
  expect(ProjectStorage.saveProgressRecovery('proj_p', { done: new Array(N).fill(1) })).toBe(false);
});

test('a delayed older progress write cannot undo recovered marks', async () => {
  await ProjectStorage.save(proj());
  const b = await base('proj_p');
  ProjectStorage.saveProgressRecovery('proj_p', { done: new Array(N).fill(1), baseWriteAt: b });
  const rec = JSON.parse(localStorage.getItem(journalKey('proj_p')));
  rec.updatedAt += 1000; // stand in for a snapshot taken after the delayed caller
  localStorage.setItem(journalKey('proj_p'), JSON.stringify(rec));
  await ProjectStorage.get('proj_p');
  await ProjectStorage.saveProgress('proj_p', { done: new Uint8Array(N), baseWriteAt: b });
  expect((await ProjectStorage.get('proj_p')).done).toEqual(new Array(N).fill(1));
});

test('backup progress rows use the same validity checks and rebuild both summaries without mutating the source', () => {
  const p = proj({ lastWriteAt: 10 });
  const rec = { v: 1, baseWriteAt: 10, done: new Uint8Array([1, 1, 0, 0, 0, 1]) };
  const rows = ProjectStorage.backupProgressRows(p, rec);
  expect(rows.project.done).toEqual([1, 1, 0, 0, 0, 1]);
  expect(rows.meta.completedStitches).toBe(3);
  expect(rows.stats.completedStitches).toBe(3);
  expect(p.done).toEqual([0, 0, 0, 0, 0, 0]);
  expect(ProjectStorage.backupProgressRows(p, { ...rec, baseWriteAt: 9 })).toBeNull();
  expect(ProjectStorage.backupProgressRows(p, { ...rec, done: new Uint8Array(5) })).toBeNull();
});

test('strict backup flush propagates a legacy record write failure', async () => {
  const { IDBObjectStore } = require('fake-indexeddb');
  const original = IDBObjectStore.prototype.put;
  const failure = new DOMException('Injected quota failure', 'QuotaExceededError');
  const spy = jest.spyOn(IDBObjectStore.prototype, 'put').mockImplementation(function(value, key) {
    if (key === 'auto_save') throw failure;
    return original.apply(this, arguments);
  });
  try {
    await expect(saveProjectToDB(proj(), { strict: true })).rejects.toBe(failure);
  } finally { spy.mockRestore(); }
});

test('strict backup flush rejects a transaction aborted after its write request', async () => {
  const { IDBObjectStore } = require('fake-indexeddb');
  const original = IDBObjectStore.prototype.put;
  const spy = jest.spyOn(IDBObjectStore.prototype, 'put').mockImplementation(function(value, key) {
    const req = original.apply(this, arguments);
    if (key === 'auto_save') this.transaction.abort();
    return req;
  });
  try {
    await expect(saveProjectToDB(proj(), { strict: true })).rejects.toBeTruthy();
  } finally { spy.mockRestore(); }
});


test('backup includes navigation recovery without writing IDB, and newer persisted progress still wins', () => {
  const p = proj({ lastWriteAt: 10 });
  const rec = { v: 1, baseWriteAt: 10, updatedAt: 20, done: new Uint8Array(N) };
  const recovery = { projectId: p.id, v: 1, baseWriteAt: 10, updatedAt: 30, done: new Array(N).fill(1) };
  expect(ProjectStorage.backupProgressRows(p, null, recovery).project.done).toEqual(new Array(N).fill(1));
  expect(ProjectStorage.backupProgressRows(p, rec, recovery).meta.completedStitches).toBe(N);
  expect(ProjectStorage.backupProgressRows(p, { ...rec, updatedAt: 40 }, recovery).project.done).toEqual(new Array(N).fill(0));
  expect(ProjectStorage.backupProgressRows(p, null, { ...recovery, baseWriteAt: 9 })).toBeNull();
  expect(ProjectStorage.backupProgressRows(p, null, { ...recovery, projectId: 'proj_other' })).toBeNull();
});

test('Compare deletion records and remaining manual/recovery history survive full saves and progress writes', async () => {
  const snapshots=[{id:'m',label:'Manual'},{id:'r',label:'Before pattern change'}];
  await ProjectStorage.save(proj({doneSnapshots:snapshots,deletedSnapshotIds:['auto_1']}));
  const b=await base('proj_p');
  await ProjectStorage.saveProgress('proj_p',{done:Uint8Array.from([1,1,0,0,0,0]),baseWriteAt:b});
  const reloaded=await ProjectStorage.get('proj_p');
  expect(reloaded.doneSnapshots).toEqual(snapshots);
  expect(reloaded.deletedSnapshotIds).toEqual(['auto_1']);
  await ProjectStorage.save({...reloaded,doneSnapshots:[],deletedSnapshotIds:['auto_1','m','r']});
  const again=await ProjectStorage.get('proj_p');
  expect(again.doneSnapshots).toEqual([]);
  expect(again.deletedSnapshotIds).toEqual(['auto_1','m','r']);
});

test('specialty progress journal preserves additions and explicit unmarks across native save/reload',async()=>{
 const objects=[{uid:'p',type:'petite',x:0,y:0,thread:{id:'310',rgb:[0,0,0]}}];
 await ProjectStorage.save(proj({specialtyVersion:1,specialtyStitches:objects,specialtyDone:[]}));
 const b=await base('proj_p');
 await ProjectStorage.saveProgress('proj_p',{done:new Uint8Array(N),specialtyDone:['p'],baseWriteAt:b});
 expect((await ProjectStorage.get('proj_p')).specialtyDone).toEqual(['p']);
 await ProjectStorage.saveProgress('proj_p',{done:new Uint8Array(N),specialtyDone:[],baseWriteAt:b});
 const unmarked=await ProjectStorage.get('proj_p');expect(unmarked.specialtyDone||[]).toEqual([]);
 expect(unmarked.specialtyStitches).toEqual(objects);
 // A legacy writer omitting this field must preserve the current truth.
 await ProjectStorage.saveProgress('proj_p',{done:new Uint8Array(N),baseWriteAt:b});
 expect((await ProjectStorage.get('proj_p')).specialtyDone||[]).toEqual([]);
});

test('bead identities, references and progress survive full save, overlay reload, old writer and unmark', async () => {
  await ProjectStorage.save(proj({beads:[{x:1,y:1,id:'MH-1',label:'Gold',brand:'millhill',rgb:[200,180,40]}]}));
  let p=await ProjectStorage.get('proj_p');
  const uid=p.beads[0].uid;
  expect(uid).toEqual(expect.any(String));
  const b=p.lastWriteAt;
  await ProjectStorage.saveProgress(p.id,{done:new Uint8Array(N),beadsDone:[uid],baseWriteAt:b});
  p=await ProjectStorage.get(p.id);
  expect(p.beadsDone).toEqual([uid]);
  expect(p.done).toEqual([0,0,0,0,0,0]);
  await ProjectStorage.saveProgress(p.id,{done:new Uint8Array(N),baseWriteAt:b});
  expect((await ProjectStorage.get(p.id)).beadsDone).toEqual([uid]);
  await ProjectStorage.saveProgress(p.id,{done:new Uint8Array(N),beadsDone:[],baseWriteAt:b});
  p=await ProjectStorage.get(p.id);
  expect(p.beadsDone).toEqual([]);
  expect(p.beads[0]).toMatchObject({uid,id:'MH-1',brand:'millhill',x:1,y:1});
  await ProjectStorage.save({...p,beadsDone:[uid,uid]});
  p=await ProjectStorage.get(p.id);
  expect(p.beadsDone).toEqual([uid]);
  await ProjectStorage.save({...p,beads:[{...p.beads[0],x:4,y:4}]});
  expect((await ProjectStorage.get(p.id)).beadsDone).toEqual([uid]);
  await ProjectStorage.save({...p,beads:[]});
  expect((await ProjectStorage.get(p.id)).beadsDone).toEqual([]);
});

test('bead and petite/long progress coexist without overwriting either register or full stitches',async()=>{
  await ProjectStorage.save(proj({beads:[{x:1,y:1,label:'Gold',rgb:[200,180,40]}],specialtyVersion:1,specialtyStitches:[{uid:'petite',type:'petite',x:0,y:0,thread:{id:'310',rgb:[0,0,0]}}],specialtyDone:[]}));
  const initial=await ProjectStorage.get('proj_p'),uid=initial.beads[0].uid,b=initial.lastWriteAt;
  await ProjectStorage.saveProgress(initial.id,{done:new Uint8Array(N),beadsDone:[uid],specialtyDone:['petite'],baseWriteAt:b});
  let p=await ProjectStorage.get(initial.id);
  expect(p.beadsDone).toEqual([uid]);expect(p.specialtyDone).toEqual(['petite']);
  await ProjectStorage.saveProgress(initial.id,{done:new Uint8Array(N),beadsDone:[],baseWriteAt:b});
  p=await ProjectStorage.get(initial.id);
  expect(p.beadsDone).toEqual([]);expect(p.specialtyDone).toEqual(['petite']);expect(p.done.every(v=>!v)).toBe(true);
});

test('hot progress writes do not read chart cells; legacy metadata misses only once', async () => {
  await ProjectStorage.save(proj());
  const b=await base('proj_p'), db=await getDB();
  const Store=require('fake-indexeddb/lib/FDBObjectStore'), original=Store.prototype.get;
  let fullReads=0;
  const spy=jest.spyOn(Store.prototype,'get').mockImplementation(function(key){if(this.name==='projects')fullReads++;return original.call(this,key);});
  try {
    await ProjectStorage.saveProgress('proj_p',{done:new Uint8Array([1,0,0,0,0,0]),baseWriteAt:b});
    await ProjectStorage.saveProgress('proj_p',{done:new Uint8Array([1,1,0,0,0,0]),baseWriteAt:b});
    expect(fullReads).toBe(0);
    // An older writer has no cache token. Rebuild from the authoritative row,
    // then use the newly written token for subsequent progress transactions.
    await new Promise((resolve,reject)=>{const tx=db.transaction('project_meta','readwrite'),store=tx.objectStore('project_meta'),r=store.get('proj_p');r.onsuccess=()=>{const m=r.result;delete m.checkpointFence.token;store.put(m,'proj_p');};tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error);});
    await ProjectStorage.saveProgress('proj_p',{done:new Uint8Array([1,1,1,0,0,0]),baseWriteAt:b});
    expect(fullReads).toBe(1);
    await ProjectStorage.saveProgress('proj_p',{done:new Uint8Array([1,1,1,1,0,0]),baseWriteAt:b});
    expect(fullReads).toBe(1);
  } finally {spy.mockRestore();}
  expect((await ProjectStorage.get('proj_p')).done).toEqual([1,1,1,1,0,0]);
});

test('an external metadata token invalidates the compact base even at the same timestamp',async()=>{
  await ProjectStorage.save(proj({done:[1,0,0,0,0,0]}));
  const b=await base('proj_p'),db=await getDB();
  await new Promise((resolve,reject)=>{
    const tx=db.transaction(['projects','project_meta','pendingImports'],'readwrite');
    const projects=tx.objectStore('projects'),metas=tx.objectStore('project_meta');
    const p=projects.get('proj_p'),m=metas.get('proj_p');
    p.onsuccess=()=>{const v=p.result;v.done=[0,1,0,0,0,0];delete v.trackingSync;projects.put(v,'proj_p');};
    m.onsuccess=()=>{const v=m.result;v.checkpointFence.token='external-write';metas.put(v,'proj_p');};
    tx.objectStore('pendingImports').delete('progress:proj_p');
    tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error);
  });
  const Store=require('fake-indexeddb/lib/FDBObjectStore'),original=Store.prototype.get;let reads=0;
  const spy=jest.spyOn(Store.prototype,'get').mockImplementation(function(key){if(this.name==='projects')reads++;return original.call(this,key);});
  try{await ProjectStorage.saveProgress('proj_p',{done:new Uint8Array([0,1,1,0,0,0]),baseWriteAt:b});expect(reads).toBe(1);}finally{spy.mockRestore();}
  const p=await ProjectStorage.get('proj_p');expect(p.done).toEqual([0,1,1,0,0,0]);
  expect(p.trackingSync.marks['d:1']).toEqual([{value:1,clock:{}}]);
  expect(p.trackingSync.marks['d:2'][0].value).toBe(1);
});
