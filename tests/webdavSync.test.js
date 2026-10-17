const {device,project,cleanup,close} = require('./support/webdav-device');
const {webdavServer} = require('./support/webdav-server');
let server;
beforeEach(async()=>{server=await webdavServer();});
afterEach(async()=>{await cleanup();await server.close();});
afterAll(close);
const cycle=c=>c.WebDAVSync.retry();
const value=c=>c.ProjectStorage.get('proj_shared');

test('two isolated clients transfer attachments, offline edits converge on reconnect and repeated polls do not upload loops',async()=>{
  const a=device('A'),b=device('B');await a.ProjectStorage.save(project());
  await a.BlobStore.put('photo:proj_shared:one',{projectId:'proj_shared',blob:new Blob(['original'],{type:'image/jpeg'}),type:'image/jpeg'});
  await a.BlobStore.put('photothumb:proj_shared:one',{projectId:'proj_shared',blob:new Blob(['thumb'],{type:'image/jpeg'}),type:'image/jpeg'});
  await a.WebDAVSync.connect(server.options());await b.WebDAVSync.connect(server.options());
  expect((await value(b)).notes).toBe('base');
  expect(await (await b.BlobStore.get('photo:proj_shared:one')).blob.text()).toBe('original');
  await cycle(a);await cycle(b);await cycle(a);await cycle(b);
  const uploads=server.requests.filter(r=>r.method==='PUT').length;
  await cycle(a);await cycle(b);
  expect(server.requests.filter(r=>r.method==='PUT')).toHaveLength(uploads);
  for(const c of [a,b]){c.navigator.onLine=false;c.dispatchEvent(new c.CustomEvent('offline'));}
  let pa=await value(a),pb=await value(b);pa.done=[1,0,0,0];pb.done=[0,1,0,0];
  await a.ProjectStorage.save(pa);await b.ProjectStorage.save(pb);
  for(const c of [a,b])c.navigator.onLine=true;
  await cycle(a);await cycle(b);await cycle(a);
  expect((await value(a)).done).toEqual([1,1,0,0]);expect((await value(b)).done).toEqual([1,1,0,0]);
  expect(a.WebDAVSync.getStatus().lastUploadAt).toBeTruthy();
});

test('concurrent notes require existing review; explicit resolution survives retry and disconnect preserves local work',async()=>{
  const a=device('A'),b=device('B');await a.ProjectStorage.save(project());
  await a.WebDAVSync.connect(server.options());await b.WebDAVSync.connect(server.options());
  const pa=await value(a),pb=await value(b);pa.notes='Alice device A';pb.notes='Alice device B';
  await a.ProjectStorage.save(pa);await b.ProjectStorage.save(pb);
  await cycle(a);await cycle(b);
  expect(b.WebDAVSync.getStatus().state).toBe('review');
  expect((await value(b)).notes).toBe('Alice device B');
  const plan=b.SyncEngine.getPendingPlan();expect(plan.semanticConflicts.some(c=>c.field==='notes')).toBe(true);
  await b.SyncEngine.executeImport(plan,{}, {'meta:proj_shared:notes':'keep-local'});
  await cycle(b);await cycle(a);
  expect((await value(a)).notes).toBe('Alice device B');
  await b.WebDAVSync.disconnect();expect(await value(b)).toBeTruthy();
  expect(b.WebDAVSync.getStatus().state).toBe('disconnected');
});

test('revocation stops retries, credentials never enter storage/status, valid reconnection recovers and accounts are isolated',async()=>{
  const a=device('A'),b=device('B');await a.ProjectStorage.save(project());await a.WebDAVSync.connect(server.options());
  expect(JSON.stringify(a.WebDAVSync.getStatus())).not.toContain('alice-test-password');
  expect(a.localStorage.getItem('password')).toBeNull();
  server.passwords.delete('alice');await cycle(a);expect(a.WebDAVSync.getStatus().state).toBe('credentials');
  const count=server.requests.length;await cycle(a);expect(server.requests).toHaveLength(count);
  server.passwords.set('alice','alice-test-password');await a.WebDAVSync.connect(server.options());
  await b.WebDAVSync.connect(server.options('bob'));expect(await value(b)).toBeNull();
  await b.WebDAVSync.connect({...server.options('bob'),url:server.options().url});
  expect(b.WebDAVSync.getStatus().state).toBe('credentials');expect(await value(b)).toBeNull();
  expect(await value(a)).toBeTruthy();
});

test('interrupted download publishes no attachment, retry transfers all bytes and lost PUT acknowledgement is idempotent',async()=>{
  const a=device('A'),b=device('B');const p=project();p.settings.traceImage=true;await a.ProjectStorage.save(p);
  await a.BlobStore.put('trace:proj_shared',{blob:new Blob(['trace bytes'],{type:'image/png'}),type:'image/png'});
  server.faults.dropPutAck=true;await a.WebDAVSync.connect(server.options());
  expect(a.WebDAVSync.getStatus().state).toBe('retrying');expect(a.WebDAVSync.getStatus().lastUploadAt).toBeNull();
  await cycle(a);expect(a.WebDAVSync.getStatus().state).toBe('idle');
  server.faults.interruptGet=true;await b.WebDAVSync.connect(server.options());
  expect(b.WebDAVSync.getStatus().state).toBe('retrying');await b.ProjectStorage.listProjects();expect(await b.BlobStore.get('trace:proj_shared')).toBeNull();
  await cycle(b);expect(await (await b.BlobStore.get('trace:proj_shared')).blob.text()).toBe('trace bytes');
  await cycle(b);expect((await b.ProjectStorage.listProjects()).filter(p=>p.id==='proj_shared')).toHaveLength(1);
});

test('cancel and disconnect abort a held network request, retain local attachments and resume explicitly',async()=>{
  const a=device('A');await a.ProjectStorage.save(project());
  await a.BlobStore.put('trace:proj_shared',{blob:new Blob(['local'])});
  let seen;const held=new Promise(r=>seen=r);
  server.faults.hold=async(req,res)=>{if(req.method==='PROPFIND'){seen();return true;}return false;};
  const connecting=a.WebDAVSync.connect(server.options());await held;await a.WebDAVSync.cancel();await connecting;
  expect(a.WebDAVSync.getStatus().state).toBe('paused');expect(await value(a)).toBeTruthy();
  server.faults.hold=null;await cycle(a);expect(a.WebDAVSync.getStatus().state).toBe('idle');
  await a.WebDAVSync.disconnect();expect(await (await a.BlobStore.get('trace:proj_shared')).blob.text()).toBe('local');
});

test('hidden/offline transitions defer requests and reconnect sends changes; conditional collision cannot overwrite remote bytes',async()=>{
  const a=device('A');await a.ProjectStorage.save(project());a.document.visibilityState='hidden';
  await a.WebDAVSync.connect(server.options());expect(server.requests).toHaveLength(0);
  a.document.visibilityState='visible';await cycle(a);
  const before=[...server.resources.values()][0].data;
  const p=await value(a);p.done=[1,0,0,0];await a.ProjectStorage.save(p);server.faults.collide=true;
  await cycle(a);expect(a.WebDAVSync.getStatus().state).toBe('conflict');
  expect([...server.resources.values()][0].data).toEqual(before);
  const collisionRequests=server.requests.length;await cycle(a);
  expect(server.requests).toHaveLength(collisionRequests);expect(a.WebDAVSync.getStatus().state).toBe('conflict');
  await a.WebDAVSync.disconnect();expect((await value(a)).done).toEqual([1,0,0,0]);
});

test('rejects credential URLs and remote listing paths cannot redirect credentials or fetch another collection',async()=>{
  const a=device('A');
  await expect(a.WebDAVSync.connect({...server.options(),url:'https://user:secret@example.test/stitchx/'})).rejects.toThrow();
  await expect(a.WebDAVSync.connect({...server.options(),url:'http://example.test/stitchx/'})).rejects.toThrow();
  server.faults.extraHref='http://evil.example/stitchx-X.csync';
  await a.WebDAVSync.connect(server.options());
  expect(server.requests.some(r=>r.path.includes('evil'))).toBe(false);
  server.faults.extraHref='/bob/stitchx/stitchx-B.csync';await cycle(a);
  expect(server.requests.some(r=>r.path.startsWith('/bob/'))).toBe(false);
});

// Separate bug-hunting probes added after the primary transport scenarios.
test('interrupted upload cannot publish partial bytes or advance status; explicit retry sends a full snapshot',async()=>{
  const a=device('A');await a.ProjectStorage.save(project());server.faults.interruptPut=true;
  await a.WebDAVSync.connect(server.options());
  expect(server.resources.size).toBe(0);expect(a.WebDAVSync.getStatus().lastUploadAt).toBeNull();
  expect(a.WebDAVSync.getStatus().state).toBe('retrying');
  await cycle(a);expect(server.resources.size).toBe(1);expect(a.WebDAVSync.getStatus().lastUploadAt).toBeTruthy();
  const file=a.SyncEngine.decompress([...server.resources.values()][0].data);
  expect(file.projects[0].id).toBe('proj_shared');
});

test('queued saves are never labelled transferred and cancellation during import is drained before disconnect returns',async()=>{
  const a=device('A'),b=device('B');await a.ProjectStorage.save(project());await a.WebDAVSync.connect(server.options());
  const p=await value(a);p.done=[1,0,0,0];await a.ProjectStorage.save(p);
  expect(a.WebDAVSync.getStatus().state).toBe('pending');await cycle(a);
  let start,release;const started=new Promise(r=>start=r),gate=new Promise(r=>release=r);
  const save=b.ProjectStorage.save.bind(b.ProjectStorage);
  b.ProjectStorage.save=async(...args)=>{start();await gate;return save(...args);};
  const connecting=b.WebDAVSync.connect(server.options());await started;
  let returned=false;const disconnecting=b.WebDAVSync.disconnect().then(()=>{returned=true;});
  await Promise.resolve();expect(returned).toBe(false);release();await disconnecting;await connecting;
  expect((await value(b)).done).toEqual([1,0,0,0]);expect(b.WebDAVSync.getStatus().state).toBe('disconnected');
  expect(server.requests.some(r=>r.method==='PUT'&&r.path.includes('stitchx-B'))).toBe(false);
});

test('corrupt attachment delivery fails before project/blob publication and repair with same delivery identity retries safely',async()=>{
  const a=device('A'),b=device('B');const p=project();p.settings.traceImage=true;await a.ProjectStorage.save(p);
  await a.BlobStore.put('trace:proj_shared',{blob:new Blob(['integrity bytes'],{type:'image/png'}),type:'image/png'});
  await a.WebDAVSync.connect(server.options());
  const [key,resource]=[...server.resources.entries()][0],good=resource.data;
  const obj=a.SyncEngine.decompress(good);obj.attachments.manifest.find(e=>e.id==='trace:proj_shared').bytes=999;
  // Different bytes under the same delivery ID cannot be acknowledged on failure.
  resource.data=Buffer.from(a.SyncEngine.compress(obj));resource.etag='"corrupt"';
  await b.WebDAVSync.connect(server.options());
  expect(b.WebDAVSync.getStatus().state).toBe('retrying');expect(await value(b)).toBeNull();
  expect(b.WebDAVSync.getStatus().lastDownloadAt).toBeNull();
  server.resources.set(key,{data:good,etag:'"repaired"'});await cycle(b);
  expect((await value(b)).name).toBe('Shared');
  expect(await(await b.BlobStore.get('trace:proj_shared')).blob.text()).toBe('integrity bytes');
});

test('retry has bounded backoff, no overlapping cycles, no stored secrets and disconnect emits plan invalidation',async()=>{
  const a=device('A');await a.ProjectStorage.save(project());server.faults.failPut=true;
  await a.WebDAVSync.connect(server.options());const before=server.requests.filter(r=>r.method==='PUT').length;
  await Promise.all([cycle(a),cycle(a),cycle(a)]);
  expect(server.requests.filter(r=>r.method==='PUT')).toHaveLength(before+1);
  expect(a.WebDAVSync.getStatus().lastUploadAt).toBeNull();
  const stores=[];
  if ((await a.indexedDB.databases()).some(d=>d.name==='cross_stitch_sync_meta')) {
    const db=await new Promise(r=>{const q=a.indexedDB.open('cross_stitch_sync_meta');q.onsuccess=()=>r(q.result);});
    if(db.objectStoreNames.contains('sync_state'))await new Promise(r=>{const q=db.transaction('sync_state').objectStore('sync_state').getAll();q.onsuccess=()=>{stores.push(q.result);r();};});db.close();
  }
  expect(JSON.stringify(stores)).not.toContain('alice-test-password');
  let invalidated=false;a.addEventListener('cs:syncPlanPending',e=>{if(e.detail.plan===null)invalidated=true;});
  a.SyncEngine.setPendingPlan({_transportSource:'webdav:old',conflicts:[]});await a.WebDAVSync.disconnect();
  expect(invalidated).toBe(true);expect(a.SyncEngine.getPendingPlan()).toBeNull();expect(await value(a)).toBeTruthy();
});

test('foreground events resume aborted requests, explicit cancellation stays paused and offline does not hide revoked access',async()=>{
  const a=device('A');await a.ProjectStorage.save(project());
  let started;const held=new Promise(r=>started=r);
  server.faults.hold=async req=>{if(req.method==='PROPFIND'){started();return true;}return false;};
  const connecting=a.WebDAVSync.connect(server.options());await held;
  a.document.visibilityState='hidden';a.dispatchEvent(new a.CustomEvent('visibilitychange'));await connecting;
  expect(a.WebDAVSync.getStatus().state).toBe('paused');
  const before=server.requests.length;await a.WebDAVSync.retry();expect(server.requests).toHaveLength(before);
  server.faults.hold=null;a.document.visibilityState='visible';a.dispatchEvent(new a.CustomEvent('visibilitychange'));
  await cycle(a);expect(a.WebDAVSync.getStatus().state).toBe('idle');
  await a.WebDAVSync.cancel();const cancelledAt=server.requests.length;
  a.dispatchEvent(new a.CustomEvent('online'));a.dispatchEvent(new a.CustomEvent('visibilitychange'));
  await Promise.resolve();expect(server.requests).toHaveLength(cancelledAt);
  server.passwords.delete('alice');await cycle(a);expect(a.WebDAVSync.getStatus().state).toBe('credentials');
  a.dispatchEvent(new a.CustomEvent('offline'));expect(a.WebDAVSync.getStatus().state).toBe('credentials');
});

test('retry recovers a removed own resource with conditional creation rather than a stale replacement ETag',async()=>{
  const a=device('A');await a.ProjectStorage.save(project());await a.WebDAVSync.connect(server.options());
  const p=await value(a);p.done=[1,0,0,0];await a.ProjectStorage.save(p);
  server.faults.failPut=true;await cycle(a);expect(a.WebDAVSync.getStatus().state).toBe('retrying');
  server.resources.clear();server.faults.failPut=false;await cycle(a);
  expect(a.WebDAVSync.getStatus().state).toBe('idle');expect(server.resources.size).toBe(1);
  expect(a.SyncEngine.decompress([...server.resources.values()][0].data).projects[0].data.done).toEqual([1,0,0,0]);
});
