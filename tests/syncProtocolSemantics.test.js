const fs = require('fs');
const vm = require('vm');
const {IDBFactory, IDBKeyRange, IDBObjectStore} = require('fake-indexeddb');
const crypto = require('crypto').webcrypto;
const pako = require('pako');

function device(id) {
  const values = new Map();
  const c = {console, indexedDB:new IDBFactory(), IDBKeyRange, Blob, crypto, pako, TextEncoder, TextDecoder,
    structuredClone, Uint8Array, ArrayBuffer, setTimeout, clearTimeout, setInterval, clearInterval,
    btoa:s=>Buffer.from(s,'binary').toString('base64'),atob:s=>Buffer.from(s,'base64').toString('binary'),
    localStorage:{getItem:k=>values.get(k)||null,setItem:(k,v)=>values.set(k,String(v)),removeItem:k=>values.delete(k)},
    ensurePersistence(){},dispatchEvent(){},addEventListener(){},CustomEvent:class {},
    Beads:require('../beads'),ProgressUnits:require('../progress-units')};
  c.window=c; c.globalThis=c;
  vm.createContext(c);
  for (const file of ['tracking-sync.js','thread-accounting.js','project-storage.js','sync-merge-helpers.js','sync-attachment-codec.js','sync-engine.js','blob-store.js']) {
    vm.runInContext(fs.readFileSync(file,'utf8') + (file==='project-storage.js'?'\nthis.ProjectStorage=ProjectStorage;':''),c);
  }
  c.BlobStore._setOpener(()=>new Promise((r,j)=>{const q=c.indexedDB.open('CrossStitchDB',5);q.onsuccess=()=>r(q.result);q.onerror=()=>j(q.error);}));
  c.localStorage.setItem('cs_sync_deviceId',id);
  return c;
}
const project = () => ({id:'proj_shared',name:'Shared',version:11,updatedAt:'2026-01-01T00:00:00Z',
  settings:{sW:2,sH:2},pattern:Array.from({length:4},()=>({id:'310'})),done:[0,0,0,0],notes:'base',
  halfDone:[],partialDone:[],knotsDone:[],bsDone:[],specialtyDone:[],beadsDone:[]});
const json=x=>JSON.parse(JSON.stringify(x));
async function transfer(from,to,choices) {
  const file=await from.SyncEngine.exportSync();
  const plan=await to.SyncEngine.prepareImport(json(file));
  await to.SyncEngine.executeImport(plan,{},choices);
  return file;
}
async function seed(a,b) {await a.ProjectStorage.save(project());await transfer(a,b);}
async function rows(c,store='pendingImports',dbName='CrossStitchDB') {
  const db=await new Promise((r,j)=>{const q=c.indexedDB.open(dbName);q.onsuccess=()=>r(q.result);q.onerror=()=>j(q.error);});
  try{return await new Promise((r,j)=>{const q=db.transaction(store).objectStore(store).getAll();q.onsuccess=()=>r(q.result);q.onerror=()=>j(q.error);});}finally{db.close();}
}
async function put(c,value,key,store='pendingImports',dbName='CrossStitchDB') {
  const db=await new Promise((r,j)=>{const q=c.indexedDB.open(dbName);q.onsuccess=()=>r(q.result);q.onerror=()=>j(q.error);});
  try{await new Promise((r,j)=>{const tx=db.transaction(store,'readwrite');tx.objectStore(store).put(value,key);tx.oncomplete=r;tx.onabort=tx.onerror=()=>j(tx.error);});}finally{db.close();}
}
async function del(c,key) {
  const db=await new Promise(r=>{const q=c.indexedDB.open('CrossStitchDB');q.onsuccess=()=>r(q.result);});
  await new Promise((r,j)=>{const tx=db.transaction('pendingImports','readwrite');tx.objectStore('pendingImports').delete(key);tx.oncomplete=r;tx.onerror=()=>j(tx.error);});db.close();
}

test('offline progress converges with replay, reversed order, unpicks and specialised marks',async()=>{
  const a=device('A'),b=device('B');await seed(a,b);
  let pa=await a.ProjectStorage.get('proj_shared'),pb=await b.ProjectStorage.get('proj_shared');
  pa.done=[1,0,0,0];pa.halfDone=[[1,{fwd:1}]];pa.beadsDone=['bead-1'];await a.ProjectStorage.save(pa);
  const old=await a.SyncEngine.exportSync();
  pb.done=[0,1,0,0];pb.partialDone=[[2,['TL']]];pb.specialtyDone=['long-1'];await b.ProjectStorage.save(pb);
  await transfer(a,b);await transfer(b,a);
  pa=await a.ProjectStorage.get('proj_shared');pa.done[0]=0;pa.beadsDone=[];await a.ProjectStorage.save(pa);
  await transfer(a,b);await b.SyncEngine.executeImport(await b.SyncEngine.prepareImport(json(old)),{});
  await transfer(b,a);await transfer(a,b);
  pa=await a.ProjectStorage.get('proj_shared');pb=await b.ProjectStorage.get('proj_shared');
  expect(pa.done).toEqual([0,1,0,0]);expect(pb.done).toEqual(pa.done);
  for(const f of ['trackingSync','halfDone','partialDone','specialtyDone','beadsDone'])expect(json(pb[f])).toEqual(json(pa[f]));
  expect(pb.beadsDone).toEqual([]);
});

test('concurrent notes remain unresolved despite clock skew; explicit choice dominates stale replay',async()=>{
  const a=device('A'),b=device('B');await seed(a,b);
  let pa=await a.ProjectStorage.get('proj_shared'),pb=await b.ProjectStorage.get('proj_shared');
  pa.notes='device A';pb.notes='device B';pa.updatedAt='2099-01-01';pb.updatedAt='1999-01-01';
  await a.ProjectStorage.save(pa);await b.ProjectStorage.save(pb);
  const old=await a.SyncEngine.exportSync(), plan=await b.SyncEngine.prepareImport(json(old));
  expect(plan.semanticConflicts.map(c=>c.field)).toContain('notes');
  expect(b.SyncEngine._test.partitionPlan(plan).autoPlan).toBeNull();
  await expect(b.SyncEngine.executeImport(plan)).rejects.toMatchObject({state:'conflicted'});
  expect((await b.ProjectStorage.get('proj_shared')).notes).toBe('device B');
  await b.SyncEngine.executeImport(plan,{}, {'meta:proj_shared:notes':'keep-local'});
  await transfer(b,a);await b.SyncEngine.executeImport(await b.SyncEngine.prepareImport(json(old)));
  expect((await a.ProjectStorage.get('proj_shared')).notes).toBe('device B');
  expect((await b.ProjectStorage.get('proj_shared')).notes).toBe('device B');
});

test('deletion versus future-dated update requires explicit restore; replay cannot resurrect',async()=>{
  const a=device('A'),b=device('B');await seed(a,b);
  await a.ProjectStorage.delete('proj_shared');
  let p=await b.ProjectStorage.get('proj_shared');p.notes='offline edit';p.updatedAt='2099-01-01';await b.ProjectStorage.save(p);
  const stale=await b.SyncEngine.exportSync(), plan=await a.SyncEngine.prepareImport(json(stale));
  expect(plan.skippedTombstoned).toHaveLength(1);await a.SyncEngine.executeImport(plan);
  expect(await a.ProjectStorage.get('proj_shared')).toBeNull();
  const incoming=await b.SyncEngine.prepareImport(await a.SyncEngine.exportSync());
  expect(incoming.semanticConflicts.map(c=>c.id)).toContain('delete:proj_shared');
  await expect(b.SyncEngine.executeImport(incoming)).rejects.toMatchObject({state:'conflicted'});
  await b.SyncEngine.executeImport(incoming,{}, {'delete:proj_shared':'keep-remote'});
  expect(await b.ProjectStorage.get('proj_shared')).toBeNull();
});

test('manifest deduplicates content, excludes optional source images, verifies blobs and retries interruption',async()=>{
  const a=device('A'),b=device('B');await seed(a,b);
  const id='trace:proj_shared';let p=await a.ProjectStorage.get('proj_shared');p.settings.traceImage=true;await a.ProjectStorage.save(p);
  await put(a,{id,blob:new Blob(['attachment bytes'],{type:'image/png'})});
  const file=await a.SyncEngine.exportSync();
  expect(file.attachments.optional.sourceImages).toBe('excluded');
  expect(file.attachments.manifest.find(e=>e.id===id).contentId).toMatch(/^sha256:/);
  const missing=json(file);missing.attachments.blobs={};
  await expect(b.SyncEngine.prepareImport(missing)).rejects.toMatchObject({state:'pending'});
  expect(b.SyncEngine.getSyncStatus().protocol.state).toBe('pending');
  const bad=json(file);bad.attachments.blobs[file.attachments.manifest.find(e=>e.id===id).contentId]=Buffer.from('bad').toString('base64');
  await expect(b.SyncEngine.prepareImport(bad)).rejects.toMatchObject({state:'failed'});
  const plan=await b.SyncEngine.prepareImport(json(file));
  const original=IDBObjectStore.prototype.put;let interrupted=false;
  IDBObjectStore.prototype.put=function(value,...args){
    if(this.name==='pendingImports'&&value.id===id&&!interrupted){interrupted=true;this.transaction.abort();throw new Error('Injected interruption');}
    return original.call(this,value,...args);
  };
  try{await expect(b.SyncEngine.executeImport(plan)).rejects.toThrow('Attachment transfer interrupted');}finally{IDBObjectStore.prototype.put=original;}
  expect((await rows(b)).some(r=>r.id===id)).toBe(false);
  expect(b.SyncEngine.getSyncStatus().protocol.state).toBe('failed');
  await b.SyncEngine.executeImport(await b.SyncEngine.prepareImport(json(file)));
  const saved=(await rows(b)).find(r=>r.id===id);expect(await saved.blob.text()).toBe('attachment bytes');
  expect(b.SyncEngine.getSyncStatus().protocol.state).toBe('completed');
  await a.BlobStore.delete(id);p=await a.ProjectStorage.get('proj_shared');p.settings.traceImage=false;await a.ProjectStorage.save(p);
  await transfer(a,b);expect((await rows(b)).some(r=>r.id===id)).toBe(false);
  await b.SyncEngine.executeImport(await b.SyncEngine.prepareImport(json(file)));
  expect((await rows(b)).some(r=>r.id===id)).toBe(false);
});

test('distinct project identifiers with identical chart content stay distinct in protocol 2',async()=>{
  const a=device('A'),b=device('B');await seed(a,b);
  const p=project();p.id='proj_other';await a.ProjectStorage.save(p);await transfer(a,b);
  expect((await b.ProjectStorage.listProjects()).map(p=>p.id).sort()).toEqual(['proj_other','proj_shared']);
});

test('inventory reductions are conflicts rather than max(stock), and stale review never overwrites a purchase',async()=>{
  const a=device('A'),b=device('B');await seed(a,b);
  await put(a,{'dmc:310':{owned:4}},'threads','manager_state','stitch_manager_db');
  await transfer(a,b);
  await put(a,{'dmc:310':{owned:2}},'threads','manager_state','stitch_manager_db');
  await put(b,{'dmc:310':{owned:7}},'threads','manager_state','stitch_manager_db');
  const file=await a.SyncEngine.exportSync(),plan=await b.SyncEngine.prepareImport(json(file));
  expect(plan.semanticConflicts.map(c=>c.id)).toContain('stash:inventory');
  await expect(b.SyncEngine.executeImport(plan)).rejects.toMatchObject({state:'conflicted'});
  await put(b,{'dmc:310':{owned:8}},'threads','manager_state','stitch_manager_db');
  await expect(b.SyncEngine.executeImport(plan,{}, {'stash:inventory':'keep-remote'})).rejects.toMatchObject({state:'conflicted'});
  const fresh=await b.SyncEngine.prepareImport(json(file));await b.SyncEngine.executeImport(fresh,{}, {'stash:inventory':'keep-remote'});
  await transfer(b,a);await transfer(a,b);
  for(const c of [a,b])expect((await rows(c,'manager_state','stitch_manager_db')).find(x=>x['dmc:310'])['dmc:310'].owned).toBe(2);
});

test('independent durable consumption events union once and replay never consumes inventory again',async()=>{
  const a=device('A'),b=device('B');await seed(a,b);
  const A=a.ThreadAccounting,key='dmc:310',estimate=A.snapshot({settings:{fabricCt:14},pattern:[{id:'310'}],done:[1]},{tailAllowanceIn:0,generalWasteMultiplier:1})['d:0'];
  const ledger=A.empty(),stock={[key]:{owned:1}};
  A.baseline(ledger,'pa',{},null,'2026-01-01');A.baseline(ledger,'pb',{},null,'2026-01-01');
  await put(a,ledger,A.KEY,'manager_state','stitch_manager_db');await put(a,stock,'threads','manager_state','stitch_manager_db');await transfer(a,b);
  async function consume(c,pid) {
    const data=await rows(c,'manager_state','stitch_manager_db');
    const l=json(data.find(x=>x.version===2)),s=json(data.find(x=>x[key]));
    c.ThreadAccounting.apply(l,s,[{projectId:pid,unit:'d:0',seq:1,kind:'mark',estimate,enabled:true}],'2026-01-02');
    await put(c,l,A.KEY,'manager_state','stitch_manager_db');await put(c,s,'threads','manager_state','stitch_manager_db');
  }
  await consume(a,'pa');await consume(b,'pb');
  const old=await a.SyncEngine.exportSync();await transfer(a,b);await transfer(b,a);
  for(let i=0;i<3;i++){await b.SyncEngine.executeImport(await b.SyncEngine.prepareImport(json(old)));await transfer(b,a);}
  for(const c of [a,b]){
    const data=await rows(c,'manager_state','stitch_manager_db'),l=data.find(x=>x.version===2),s=data.find(x=>x[key]);
    expect(Object.keys(l.events)).toHaveLength(2);expect(s[key].owned).toBeCloseTo(1-2*estimate.amounts[key],10);
  }
});

test('session notes on a shared session need a choice; independent sessions and deletions survive replay',async()=>{
  const a=device('A'),b=device('B');await seed(a,b);
  let p=await a.ProjectStorage.get('proj_shared');p.statsSessions=[{id:'common',start:'2026-01-01',notes:'base',durationSeconds:20}];await a.ProjectStorage.save(p);await transfer(a,b);
  let pa=await a.ProjectStorage.get(p.id),pb=await b.ProjectStorage.get(p.id);
  pa.statsSessions[0].notes='A';pb.statsSessions[0].notes='B';await a.ProjectStorage.save(pa);await b.ProjectStorage.save(pb);
  const file=await a.SyncEngine.exportSync(),plan=await b.SyncEngine.prepareImport(json(file));
  const c=plan.semanticConflicts.find(c=>c.field.startsWith('journal_'));expect(c).toBeDefined();
  await b.SyncEngine.executeImport(plan,{}, {[c.id]:'keep-local'});await transfer(b,a);
  expect((await a.ProjectStorage.get(p.id)).statsSessions[0].notes).toBe('B');
  pb=await b.ProjectStorage.get(p.id);pb.deletedSessionIds=['common'];pb.statsSessions=[];await b.ProjectStorage.save(pb);
  await transfer(b,a);await a.SyncEngine.executeImport(await a.SyncEngine.prepareImport(json(file)));
  expect((await a.ProjectStorage.get(p.id)).statsSessions).toEqual([]);
});

test('attachment deletion before export cannot be undone by an incoming stale file',async()=>{
  const a=device('A'),b=device('B');await seed(a,b);
  const id='trace:proj_shared';await put(a,{id,projectId:'proj_shared',blob:new Blob(['trace'])});
  const file=await transfer(a,b);await b.BlobStore.delete(id);
  await b.SyncEngine.executeImport(await b.SyncEngine.prepareImport(json(file)));
  expect((await rows(b)).some(r=>r.id===id)).toBe(false);
});

test('deletion evidence is bounded without evicting old IDs or deleting a project on failure',async()=>{
  const a=device('A');await a.ProjectStorage.save(project());
  const tombs=Array.from({length:10000},(_,i)=>({id:'removed_'+i,deletedAt:null}));
  a.localStorage.setItem('cs_deleted_project_ids',JSON.stringify(tombs));
  await expect(a.ProjectStorage.delete('proj_shared')).rejects.toThrow('Deletion record limit');
  expect(await a.ProjectStorage.get('proj_shared')).not.toBeNull();
  expect(a.SyncEngine.getTombstones()).toHaveLength(10000);
  expect(a.SyncEngine.classifyProjects([{id:'removed_0',updatedAt:'2099-01-01',data:project()}],{})).toHaveLength(0);
});

test('delivery identity detects a same-peer update even when its clock moves backwards',async()=>{
  const a=device('A'),b=device('B');await seed(a,b);
  const file=await a.SyncEngine.exportSync();file._createdAt='1990-01-01';
  const bytes=b.SyncEngine.compress(file);
  const dir={queryPermission:async()=> 'granted',async *values(){yield {kind:'file',name:'a.csync',getFile:async()=>({size:bytes.length,lastModified:1,arrayBuffer:async()=>bytes})};}};
  expect(await b.SyncEngine.checkForUpdates(dir)).toHaveLength(1);
  await b.SyncEngine.executeImport(await b.SyncEngine.prepareImport(json(file)));
  expect(await b.SyncEngine.checkForUpdates(dir)).toHaveLength(0);
});

test('v1 compatibility retains legacy completeness as unknown and rejects future schemas',async()=>{
  const a=device('A'),b=device('B');await seed(a,b);
  const file=await a.SyncEngine.exportSync();file._version=1;delete file.attachments;
  await b.SyncEngine.executeImport(await b.SyncEngine.prepareImport(json(file)));
  file._version=999;await expect(b.SyncEngine.prepareImport(file)).rejects.toThrow('Unsupported sync file version');
  file._version=1;file.projects[0].data.trackingSync={version:999,marks:{}};
  await expect(b.SyncEngine.prepareImport(file)).rejects.toThrow('Unsupported tracking sync schema');
});

test('an edit arriving after merge read is rejected by the project write transaction',async()=>{
  const a=device('A'),b=device('B');await seed(a,b);
  let p=await a.ProjectStorage.get('proj_shared');p.done[0]=1;await a.ProjectStorage.save(p);
  const file=await a.SyncEngine.exportSync(),plan=await b.SyncEngine.prepareImport(json(file));
  const original=b.ProjectStorage.save;let raced=false;
  b.ProjectStorage.save=async function(p,opts){
    if(opts&&opts.syncExpected&&!raced){raced=true;const edit=await b.ProjectStorage.get(p.id);edit.notes='saved during import';await original.call(this,edit);}
    return original.call(this,p,opts);
  };
  await expect(b.SyncEngine.executeImport(plan)).rejects.toMatchObject({state:'conflicted'});
  expect((await b.ProjectStorage.get('proj_shared')).notes).toBe('saved during import');
});

test('attachment identifier collisions preserve the local bytes and never complete',async()=>{
  const a=device('A'),b=device('B');await seed(a,b);const id='trace:proj_shared';
  await put(a,{id,blob:new Blob(['from A'])});await put(b,{id,blob:new Blob(['from B'])});
  const file=await a.SyncEngine.exportSync();
  await expect(b.SyncEngine.prepareImport(json(file))).rejects.toMatchObject({state:'conflicted'});
  expect(await (await rows(b)).find(r=>r.id===id).blob.text()).toBe('from B');
});

test('chart brand edits cannot hide behind the legacy fingerprint hint',async()=>{
  const a=device('A'),b=device('B');await seed(a,b);
  const p=await a.ProjectStorage.get('proj_shared');p.pattern[0].brand='anchor';await a.ProjectStorage.save(p);
  const file=await a.SyncEngine.exportSync(),local=await b.ProjectStorage.get(p.id);
  // The historical fingerprint uses cell IDs; the complete structure check supplies the missing evidence.
  expect(a.SyncEngine.computeFingerprint(local)).toBe(a.SyncEngine.computeFingerprint(p));
  expect((await b.SyncEngine.prepareImport(file)).conflicts).toHaveLength(1);
});

test('folder close failure never stamps completion; whole-file retry succeeds',async()=>{
  const a=device('A');await a.ProjectStorage.save(project());let fail=true;
  const dir={queryPermission:async()=> 'granted',getFileHandle:async()=>({createWritable:async()=>({write:async()=>{},close:async()=>{if(fail)throw new Error('Interrupted close');}})})};
  await expect(a.SyncEngine.exportToFolder(dir)).rejects.toThrow('Interrupted close');
  expect(a.SyncEngine.getSyncStatus().lastExportAt).toBeNull();expect(a.SyncEngine.getSyncStatus().exportProtocol.state).toBe('failed');
  fail=false;await a.SyncEngine.exportToFolder(dir);expect(a.SyncEngine.getSyncStatus().exportProtocol.state).toBe('completed');
});

test('explicit project restore includes its required trace attachment',async()=>{
  const a=device('A'),b=device('B');await seed(a,b);const id='trace:proj_shared';
  let p=await a.ProjectStorage.get('proj_shared');p.settings.traceImage=true;await a.ProjectStorage.save(p);await put(a,{id,blob:new Blob(['required trace'])});
  const file=await transfer(a,b);await b.ProjectStorage.delete('proj_shared');
  const plan=await b.SyncEngine.prepareImport(json(file));expect(plan.skippedTombstoned).toHaveLength(1);
  expect((await b.SyncEngine.restoreSkippedPatterns(plan)).restored).toBe(1);
  expect(await (await rows(b)).find(r=>r.id===id).blob.text()).toBe('required trace');
});

test('informational accounting dates converge while contradictory receipts remain explicit conflicts',()=>{
  const c=device('A'),A=c.ThreadAccounting,a=A.empty(),b=A.empty();
  A.baseline(a,'p',{},null,'2026-02-01');A.baseline(b,'p',{},null,'2026-01-01');
  expect(json(A.merge(a,b))).toEqual(json(A.merge(b,a)));
  const estimate=A.snapshot({pattern:[{id:'310'}],done:[1],settings:{fabricCt:14}}, {})['d:0'];
  const stock={'dmc:310':{owned:1}},l=A.empty();A.baseline(l,'p',{},null,'2026-01-01');
  A.apply(l,stock,[{projectId:'p',unit:'d:0',seq:1,kind:'mark',estimate,enabled:true,token:'token-a'},
    {projectId:'p',unit:'d:0',seq:2,kind:'correction',estimate,enabled:true,token:'token-b'}],'2026-01-02');
  const r=json(l);r.receipts['token-a']=r.receipts['token-b'];
  expect(()=>A.merge(l,r)).toThrow('Conflicting consumption receipt');
});

// Controllable completions characterise the async boundaries without wall-clock waits.
function deferred() {
  let resolve, reject;
  const promise = new Promise((a,b) => { resolve=a; reject=b; });
  return {promise,resolve,reject};
}

test('snapshot waits for the live flush and records the state committed by it',async()=>{
  const a=device('snapshot');await a.ProjectStorage.save(project());
  const gate=deferred(), entered=deferred();
  a.__flushProjectToIDB=async()=>{entered.resolve();await gate.promise;
    const p=await a.ProjectStorage.get('proj_shared');p.name='After flush';await a.ProjectStorage.save(p);
  };
  const pending=a.SyncEngine.writeSnapshot();await entered.promise;
  expect(await a.SyncEngine.readSnapshot()).toBeNull();
  gate.resolve();const snapshot=await pending;
  expect(snapshot.projects.proj_shared.name).toBe('After flush');
  expect(json(await a.SyncEngine.readSnapshot())).toEqual(json(snapshot));
});

test('export propagates a failed flush before reading or delivering a sync file',async()=>{
  const a=device('flush-error'), gate=deferred(), entered=deferred();
  a.__flushProjectToIDB=()=>{entered.resolve();return gate.promise;};
  const list=jest.spyOn(a.ProjectStorage,'listProjects');
  const delivery=jest.fn();a.Platform={shareOrDownload:delivery};
  const pending=a.SyncEngine.downloadSync();
  const rejected=expect(pending).rejects.toThrow('flush refused');
  await entered.promise;expect(list).not.toHaveBeenCalled();gate.reject(new Error('flush refused'));
  await rejected;expect(delivery).not.toHaveBeenCalled();
  expect(a.localStorage.getItem('cs_sync_lastExportAt')).toBeNull();
});

test.each([false,true])('folder export stamps completion only after close settles (reject=%s)',async(fail)=>{
  const a=device('close'), gate=deferred(), entered=deferred();
  await a.ProjectStorage.save(project());
  const write=jest.fn(async()=>{});
  const dir={queryPermission:async()=>'granted',getFileHandle:async()=>({createWritable:async()=>({write,close:()=>{entered.resolve();return gate.promise;}})})};
  const pending=a.SyncEngine.exportToFolder(dir);
  const settled=fail?expect(pending).rejects.toThrow('close failed'):pending;
  await entered.promise;expect(write).toHaveBeenCalledTimes(1);
  expect(a.localStorage.getItem('cs_sync_lastExportAt')).toBeNull();
  if(fail)gate.reject(new Error('close failed'));else gate.resolve();
  const result=await settled;
  expect(a.localStorage.getItem('cs_sync_lastExportAt')).toBe(fail?null:result.syncObj._createdAt);
  expect(a.SyncEngine.getSyncStatus().exportProtocol.state).toBe(fail?'failed':'completed');
});

test('cancelled share resolves without advancing the export timestamp or leaking delivery into the file',async()=>{
  const a=device('cancel'), gate=deferred(), entered=deferred();
  let bytes;
  a.Platform={shareOrDownload:blob=>{bytes=blob;entered.resolve();return gate.promise;}};
  const pending=a.SyncEngine.downloadSync();await entered.promise;
  expect(a.localStorage.getItem('cs_sync_lastExportAt')).toBeNull();
  gate.resolve({cancelled:true});const result=await pending;
  expect(result._delivery).toBe('cancelled');
  expect(a.SyncEngine.decompress(await bytes.arrayBuffer())._delivery).toBeUndefined();
  expect(a.localStorage.getItem('cs_sync_lastExportAt')).toBeNull();
});

test('known behaviour: snapshot still records metadata when the live flush rejects',async()=>{
  const a=device('snapshot-flush-error');await a.ProjectStorage.save(project());
  a.__flushProjectToIDB=async()=>{throw new Error('saving paused');};
  const snapshot=await a.SyncEngine.writeSnapshot();
  expect(snapshot.projects.proj_shared.name).toBe('Shared');
  expect(json(await a.SyncEngine.readSnapshot())).toEqual(json(snapshot));
});
