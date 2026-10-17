/** @jest-environment jsdom */
const fs=require('fs'),path=require('path');
const {IDBFactory}=require('fake-indexeddb');
global.indexedDB=new IDBFactory();global.IDBKeyRange=require('fake-indexeddb/lib/FDBKeyRange');window.indexedDB=global.indexedDB;
global.structuredClone=v=>require('v8').deserialize(require('v8').serialize(v));
global.ensurePersistence=()=>Promise.resolve();
eval(fs.readFileSync(path.join(__dirname,'../project-storage.js'),'utf8'));
window.ProjectStorage=ProjectStorage;
window.ChartUpdates=require('../chart-updates.js');
const A=require('../thread-accounting.js');
const p=(w=2)=>({id:'proj_update',name:'P',settings:{sW:w,sH:1},pattern:Array.from({length:w},()=>({id:'310'})),done:new Array(w).fill(0),notes:'original note'});
const pending=async()=>{const db=await getDB();return new Promise((resolve,reject)=>{const r=db.transaction('pendingImports').objectStore('pendingImports').getAll();r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});};
const apply=(base,incoming=p(3),o={})=>ProjectStorage.applyChartUpdate('proj_update',base.token,incoming,o,{},new Uint8Array([1,2,3]));
beforeEach(async()=>{await ProjectStorage.clearAllProjects();await ProjectStorage.clearAllProgress();ProjectStorage._deletedIds.clear();window.CrossTabCoord=undefined;});

test('commits project, summaries, raw source and pre-update snapshot atomically; includes progress overlays',async()=>{
  await ProjectStorage.save(p());let saved=await ProjectStorage.get('proj_update');
  await ProjectStorage.saveProgress(saved.id,{done:[1,0],baseWriteAt:saved.lastWriteAt});
  const base=await ProjectStorage.prepareChartUpdate(saved.id),snapshotId=await apply(base);
  const after=await ProjectStorage.get(saved.id),snap=(await pending()).find(r=>r.id===snapshotId);
  expect(after.done).toEqual([1,0,0]);expect(after.notes).toBe('original note');expect(after.chartRevision).toBeTruthy();
  expect(snap.before.done).toEqual([1,0]);expect(Array.from(snap.source)).toEqual([1,2,3]);expect(snap.incoming.pattern).toHaveLength(3);
  const list=await ProjectStorage.listProjects();expect(list.find(r=>r.id===saved.id).dimensions).toEqual({width:3,height:1});
});
test('concurrent notes or progress changes reject the stale review without overwriting or creating snapshots',async()=>{
  await ProjectStorage.save(p());const base=await ProjectStorage.prepareChartUpdate('proj_update');
  await ProjectStorage.save({...p(),notes:'edited concurrently'});
  const beforeCount=(await pending()).filter(r=>r.id.startsWith('chart-update:')).length;
  await expect(apply(base)).rejects.toThrow(/changed during review/);
  expect((await ProjectStorage.get('proj_update')).notes).toBe('edited concurrently');
  expect((await pending()).filter(r=>r.id.startsWith('chart-update:'))).toHaveLength(beforeCount);
  const next=await ProjectStorage.prepareChartUpdate('proj_update');
  await ProjectStorage.saveProgress('proj_update',{done:[0,1],baseWriteAt:next.project.lastWriteAt});
  await expect(apply(next)).rejects.toThrow(/changed during review/);
});
test('stale tracker/creator saves and progress cannot overwrite migrated chart or newer marks',async()=>{
  await ProjectStorage.save(p());const old=await ProjectStorage.get('proj_update'),base=await ProjectStorage.prepareChartUpdate(old.id);
  await apply(base);const migrated=await ProjectStorage.get(old.id);
  await expect(ProjectStorage.save(old)).rejects.toThrow(/chart was updated/);
  await ProjectStorage.saveProgress(old.id,{done:[0,0,1],baseWriteAt:migrated.lastWriteAt});
  await ProjectStorage.saveProgress(old.id,{done:[1,0],baseWriteAt:old.lastWriteAt});
  expect((await ProjectStorage.get(old.id)).done).toEqual([0,0,1]);
  await ProjectStorage.save({...migrated,done:[1,0,0]});expect((await ProjectStorage.get(old.id)).done).toEqual([1,0,0]);
});
test('unresolved substitutions reject without writes',async()=>{
  await ProjectStorage.save(p());const base=await ProjectStorage.prepareChartUpdate('proj_update'),incoming=p();incoming.pattern[0]={id:'666'};
  await expect(apply(base,incoming)).rejects.toThrow(/Resolve every/);
  expect((await ProjectStorage.get('proj_update')).pattern[0].id).toBe('310');
});
test('write failure after snapshot scheduling aborts the entire transaction',async()=>{
  await ProjectStorage.save(p());const base=await ProjectStorage.prepareChartUpdate('proj_update'),db=await getDB();
  const ObjectStore=require('fake-indexeddb/lib/FDBObjectStore');
  const put=ObjectStore.prototype.put;
  const spy=jest.spyOn(ObjectStore.prototype,'put').mockImplementation(function(...args){
    if(this.name==='project_meta')throw Error('Injected summary failure');
    return put.apply(this,args);
  });
  const count=(await pending()).length;
  await expect(apply(base)).rejects.toThrow(/Injected/);spy.mockRestore();
  expect((await ProjectStorage.get('proj_update')).settings.sW).toBe(2);expect((await pending()).length).toBe(count);
  await expect(apply(base)).resolves.toMatch(/^chart-update:/);
});
test('rollback restores progress, notes and dimensions; rollback itself creates recovery snapshot',async()=>{
  await ProjectStorage.save({...p(),done:[1,0]});let base=await ProjectStorage.prepareChartUpdate('proj_update');
  const snap=await apply(base);
  const updated=await ProjectStorage.get('proj_update');await ProjectStorage.save({...updated,notes:'post-update note',done:[1,1,1]});
  base=await ProjectStorage.prepareChartUpdate('proj_update');
  const reverse=await ProjectStorage.applyChartUpdate('proj_update',base.token,null,null,null,null,snap);
  const restored=await ProjectStorage.get('proj_update');expect(restored.done).toEqual([1,0]);expect(restored.notes).toBe('original note');expect(restored.settings.sW).toBe(2);
  expect((await pending()).find(r=>r.id===reverse).before.notes).toBe('post-update note');
  expect(restored.chartRevision).not.toBe(updated.chartRevision);
});
test('rollback rejects a missing snapshot, wrong-project snapshot and stale token',async()=>{
  await ProjectStorage.save(p());const base=await ProjectStorage.prepareChartUpdate('proj_update');
  await expect(ProjectStorage.applyChartUpdate('proj_update',base.token,null,null,null,null,'missing')).rejects.toThrow(/snapshot is missing/);
  const snap=await apply(base),current=await ProjectStorage.prepareChartUpdate('proj_update');
  await ProjectStorage.save({...current.project,notes:'latest'});
  await expect(ProjectStorage.applyChartUpdate('proj_update',current.token,null,null,null,null,snap)).rejects.toThrow(/changed during review/);
});
test('inventory events and deductions are unchanged by moved completion or rollback; future marks charge once',async()=>{
  await ProjectStorage.save({...p(),done:[1,0]});const base=await ProjectStorage.prepareChartUpdate('proj_update');
  const ledger=A.empty(),threads={'dmc:310':{owned:2}};A.baseline(ledger,base.project.id,{},null,'date');
  const estimate=A.snapshot(base.project)['d:0'];
  A.apply(ledger,threads,[{projectId:base.project.id,unit:'d:0',seq:1,kind:'mark',estimate,enabled:true}],'date');
  const stock=structuredClone(threads),events=structuredClone(ledger.events);
  const incoming=p(3);incoming.pattern[0]={id:'__skip__'};
  const snap=await ProjectStorage.applyChartUpdate(base.project.id,base.token,incoming,{dx:1},{},null);
  const migrated=await ProjectStorage.get(base.project.id);
  expect(migrated.done).toEqual([0,1,0]);expect(A.snapshot(migrated)).toHaveProperty('d:0');
  expect(threads).toEqual(stock);expect(ledger.events).toEqual(events);
  const newMark={...migrated,done:[0,1,1]},marks=A.snapshot(newMark),unit=newMark.chartAccountingUnits['d:2'];
  const op={projectId:base.project.id,unit,seq:1,kind:'mark',estimate:marks[unit],enabled:true};
  A.apply(ledger,threads,[op,op],'date');expect(Object.keys(ledger.events)).toHaveLength(2);expect(threads['dmc:310'].owned).toBeLessThan(stock['dmc:310'].owned);
  const curr=await ProjectStorage.prepareChartUpdate(base.project.id),stockBeforeRollback=structuredClone(threads);
  await ProjectStorage.applyChartUpdate(base.project.id,curr.token,null,null,null,null,snap);expect(threads).toEqual(stockBeforeRollback);
});

test('bug hunt: rollback failure is atomic and retryable, preserving current annotations',async()=>{
  await ProjectStorage.save({...p(),notes:'before',parkMarkers:[{x:1,y:0,colorId:'310',note:'park'}]});
  let base=await ProjectStorage.prepareChartUpdate('proj_update');const snap=await apply(base);
  base=await ProjectStorage.prepareChartUpdate('proj_update');
  const ObjectStore=require('fake-indexeddb/lib/FDBObjectStore'),put=ObjectStore.prototype.put;
  const spy=jest.spyOn(ObjectStore.prototype,'put').mockImplementation(function(...args){if(this.name==='stats_summaries')throw Error('Injected rollback failure');return put.apply(this,args);});
  const count=(await pending()).length;
  await expect(ProjectStorage.applyChartUpdate('proj_update',base.token,null,null,null,null,snap)).rejects.toThrow(/Injected rollback/);
  spy.mockRestore();expect((await pending()).length).toBe(count);expect((await ProjectStorage.get('proj_update')).settings.sW).toBe(3);
  await ProjectStorage.applyChartUpdate('proj_update',base.token,null,null,null,null,snap);
  expect((await ProjectStorage.get('proj_update')).parkMarkers).toEqual([{x:1,y:0,colorId:'310',note:'park'}]);
});
