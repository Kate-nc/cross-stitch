// Exercise the real scripts, storage and facade before and after extraction.
const {device,project,cleanup,close} = require('./support/webdav-device');
const {IDBObjectStore} = require('fake-indexeddb');
const crypto = require('crypto').webcrypto;
const json = x => JSON.parse(JSON.stringify(x));
async function store(c, mode, action) {
  await c.ProjectStorage.listProjects();
  const db = await new Promise((resolve,reject) => {
    const q=c.indexedDB.open('CrossStitchDB',5); q.onsuccess=()=>resolve(q.result); q.onerror=()=>reject(q.error);
  });
  try { return await new Promise((resolve,reject) => {
    const tx=db.transaction('pendingImports',mode), q=action(tx.objectStore('pendingImports'));
    tx.oncomplete=()=>resolve(q && q.result); tx.onabort=tx.onerror=()=>reject(tx.error);
  }); } finally { db.close(); }
}
async function seeded(size=256) {
  const a=device('attachment-A'); const p=project(); p.imgData='data:image/png;base64,YWJj';
  await a.ProjectStorage.save(p);
  const bytes=Uint8Array.from({length:size},(_,i)=>i%256);
  for(const id of ['trace:proj_shared','photo:proj_shared:one','photothumb:proj_shared:one']) {
    await store(a,'readwrite',s=>s.put({id,projectId:p.id,description:'Picture £ ×',syncRevision:'local-only',blob:new Blob([bytes],{type:'image/png'})}));
  }
  return {a,bytes,file:await a.SyncEngine.exportSync({includeSourceImages:true})};
}
afterEach(cleanup);
afterAll(close);

test.each([0,1,4*1024*1024])('round-trip %i-byte shared content preserves manifest, binary bytes and metadata',async size=>{
  const {a,bytes,file}=await seeded(size), b=device('attachment-B');
  const manifest=file.attachments.manifest;
  expect(manifest.map(e=>e.id)).toEqual(['photo:proj_shared:one','photothumb:proj_shared:one','source:proj_shared','trace:proj_shared']);
  expect(new Set(manifest.filter(e=>!e.id.startsWith('source:')).map(e=>e.contentId)).size).toBe(1);
  expect(Object.keys(file.attachments.blobs)).toHaveLength(2);
  const packed=a.SyncEngine.compress(file), unpacked=b.SyncEngine.decompress(packed);
  expect(unpacked.attachments).toEqual(file.attachments);
  const before=json(unpacked);
  await b.SyncEngine.executeImport(await b.SyncEngine.prepareImport(unpacked));
  expect(unpacked.attachments).toEqual(before.attachments);
  const rows=await store(b,'readonly',s=>s.getAll());
  for(const e of manifest.filter(e=>!e.id.startsWith('source:'))) {
    const row=rows.find(r=>r.id===e.id);
    expect(Buffer.from(await row.blob.arrayBuffer()).equals(Buffer.from(bytes))).toBe(true);
    expect(row.blob.type).toBe('image/png');
    expect(row.description).toBe('Picture £ ×');
    expect(e.record.syncRevision).toBeUndefined();
    expect(row.syncRevision).toMatch(/^import_/);
  }
  const again=await b.SyncEngine.exportSync({includeSourceImages:true});
  expect(again.attachments).toEqual(file.attachments);
},30000);

test('empty current and absent legacy manifests remain distinct; legacy import preserves local attachments',async()=>{
  const a=device('empty-A'),b=device('empty-B');await a.ProjectStorage.save(project());await b.ProjectStorage.save(project());
  const file=await a.SyncEngine.exportSync();
  expect(file.attachments.manifest).toEqual([{id:'source:proj_shared',projectId:'proj_shared',optional:true,excluded:true}]);
  await b.SyncEngine.prepareImport(json(file));
  await store(b,'readwrite',s=>s.put({id:'trace:proj_shared',blob:new Blob(['keep'])}));
  delete file.attachments;
  await expect(b.SyncEngine.prepareImport(json(file))).rejects.toThrow('Sync file is missing its attachment manifest.');
  file._version=1;
  await b.SyncEngine.executeImport(await b.SyncEngine.prepareImport(file));
  expect(await (await store(b,'readonly',s=>s.get('trace:proj_shared'))).blob.text()).toBe('keep');
});

test('single trace and excluded source remain byte exact',async()=>{
  const a=device('single-A'),b=device('single-B');await a.ProjectStorage.save(project());
  await store(a,'readwrite',s=>s.put({id:'trace:proj_shared',blob:new Blob(['trace only'])}));
  const file=await a.SyncEngine.exportSync();await b.SyncEngine.executeImport(await b.SyncEngine.prepareImport(file));
  expect(await (await store(b,'readonly',s=>s.get('trace:proj_shared'))).blob.text()).toBe('trace only');
});

const failures = [
  ['manifest version', f=>f.attachments.version=999,'failed','Invalid attachment manifest.'],
  ['duplicate ID', f=>f.attachments.manifest.push(json(f.attachments.manifest[0])),'failed','Duplicate or orphaned attachment.'],
  ['orphan ID', f=>f.attachments.manifest[0].projectId='other','failed','Duplicate or orphaned attachment.'],
  ['missing content', f=>delete f.attachments.blobs[f.attachments.manifest[0].contentId],'pending','Missing required attachment:'],
  ['encoding', f=>f.attachments.blobs[f.attachments.manifest[0].contentId]='!','failed','Invalid attachment encoding:'],
  ['length', f=>f.attachments.manifest[0].bytes++,'failed','Attachment integrity check failed:'],
  ['hash', f=>f.attachments.blobs[f.attachments.manifest[0].contentId]=Buffer.alloc(256).toString('base64'),'failed','Attachment integrity check failed:'],
  ['source mismatch', f=>f.projects[0].data.imgData='different','failed','Source image does not match its manifest.'],
  ['source excluded', f=>f.attachments.optional.sourceImages='excluded','failed','Source image exclusion contradicts its manifest.'],
  ['unused content', f=>f.attachments.blobs.extra='AA==','failed','Unreferenced attachment content.'],
  ['missing pair', f=>f.attachments.manifest=f.attachments.manifest.filter(e=>!e.id.startsWith('photothumb:')),'pending','Missing required photo pair:'],
  ['missing trace', f=>{f.projects[0].data.settings.traceImage=true;f.attachments.manifest=f.attachments.manifest.filter(e=>!e.id.startsWith('trace:'));},'pending','Missing required tracing picture:'],
];
test.each(failures)('%s failure rejects before any attachment writes',async(_name,change,state,message)=>{
  const {file}=await seeded(),b=device('failure-B');b.atob=atob;change(file);
  await expect(b.SyncEngine.prepareImport(file)).rejects.toMatchObject({name:'SyncProtocolError',state,message:expect.stringContaining(message)});
  expect(b.SyncEngine.getSyncStatus().protocol.state).toBe(state);
  expect(await store(b,'readonly',s=>s.getAll())).toEqual([]);
});

test('digest rejection propagates before later reads and does not gain a retry',async()=>{
  const {file}=await seeded(),b=device('digest-B'),calls=[];
  const error=new Error('digest unavailable');
  b.crypto={subtle:{digest:async()=>{calls.push('digest');throw error;}}};
  const list=jest.spyOn(b.ProjectStorage,'listProjects');
  await expect(b.SyncEngine.prepareImport(file)).rejects.toBe(error);
  expect(calls).toEqual(['digest']);expect(list).not.toHaveBeenCalled();
});

test('digest calls are serial and project reads wait for full verification',async()=>{
  const {file}=await seeded(),b=device('serial-B'),calls=[];
  let release, entered;
  const first=new Promise(r=>entered=r), gate=new Promise(r=>release=r);
  b.crypto={subtle:{digest:async(...args)=>{calls.push('start');if(calls.length===1){entered();await gate;}const v=await crypto.subtle.digest(...args);calls.push('end');return v;}}};
  const list=jest.spyOn(b.ProjectStorage,'listProjects');
  const pending=b.SyncEngine.prepareImport(file);await first;
  expect(calls).toEqual(['start']);expect(list).not.toHaveBeenCalled();
  release();await pending;
  expect(calls).toEqual(Array.from({length:4},()=>['start','end']).flat());
});

test('aborted application rolls back attachments and retry succeeds without changing partial project success',async()=>{
  const {file}=await seeded(),b=device('abort-B'),original=IDBObjectStore.prototype.put;
  let aborted=false;
  IDBObjectStore.prototype.put=function(value,...args){
    if(this.name==='pendingImports'&&value.id==='trace:proj_shared'&&!aborted){aborted=true;this.transaction.abort();throw new Error('abort');}
    return original.call(this,value,...args);
  };
  try {await expect(b.SyncEngine.executeImport(await b.SyncEngine.prepareImport(file))).rejects.toThrow('Attachment transfer interrupted');}
  finally {IDBObjectStore.prototype.put=original;}
  expect(await store(b,'readonly',s=>s.getAll())).toEqual([]);
  expect(await b.ProjectStorage.get('proj_shared')).not.toBeNull();
  await b.SyncEngine.executeImport(await b.SyncEngine.prepareImport(file));
  expect((await store(b,'readonly',s=>s.getAll())).filter(r=>r.blob)).toHaveLength(3);
});

test('encrypted and compressed payload restores the same attachments',async()=>{
  const {a,file}=await seeded(),b=device('encrypted-B');
  a.SyncEngine.setEncryptionPassphrase('test-passphrase');a.SyncEngine.setEncryptionEnabled(true);
  const encrypted=await a.SyncEngine.exportSync({includeSourceImages:true});
  expect(encrypted.attachments).toBeUndefined();b.SyncEngine.setEncryptionPassphrase('test-passphrase');
  const decrypted=await b.SyncEngine.decryptSyncObj(b.SyncEngine.decompress(a.SyncEngine.compress(encrypted)));
  expect(decrypted.attachments).toEqual(file.attachments);
  await b.SyncEngine.executeImport(await b.SyncEngine.prepareImport(encrypted));
  expect((await store(b,'readonly',s=>s.getAll())).filter(r=>r.blob)).toHaveLength(3);
});

test('folder entry points retain read/write/close order and surface transport failure without completion',async()=>{
  const {a,file}=await seeded(),b=device('folder-B'),events=[];
  let compressed;
  const output={queryPermission:async()=>'granted',getFileHandle:async()=>({createWritable:async()=>({
    write:async bytes=>{events.push('write');compressed=bytes;},close:async()=>events.push('close')
  })})};
  await a.SyncEngine.exportToFolder(output);
  expect(events).toEqual(['write','close']);expect(a.SyncEngine.getSyncStatus().lastExportAt).toBeTruthy();
  const input={queryPermission:async()=>'granted',async *values(){for(const name of ['first.csync','second.csync'])yield {
    kind:'file',name,getFile:async()=>{events.push('file:'+name);return {size:compressed.length,lastModified:1,arrayBuffer:async()=>{events.push('read:'+name);return compressed;}};}
  };}};
  const entries=await b.SyncEngine.checkForUpdates(input);
  expect(events.slice(2)).toEqual(['file:first.csync','read:first.csync','file:second.csync','read:second.csync']);
  await b.SyncEngine.executeImport(await b.SyncEngine.prepareImport(entries[0].syncObj));
  expect((await store(b,'readonly',s=>s.getAll())).filter(r=>r.blob)).toHaveLength(3);
  const failing={...output,getFileHandle:async()=>({createWritable:async()=>({write:async()=>{},close:async()=>{throw new Error('close refused');}})})};
  const before=a.SyncEngine.getSyncStatus().lastExportAt;
  await expect(a.SyncEngine.exportToFolder(failing)).rejects.toThrow('close refused');
  expect(a.SyncEngine.getSyncStatus().lastExportAt).toBe(before);
  expect(a.SyncEngine.getSyncStatus().exportProtocol.state).toBe('failed');
  expect(file.attachments.manifest).toHaveLength(4);
});
