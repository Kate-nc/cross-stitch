// Run from the checkout root: node reports/cleanup-19/browser-comparison.cjs BASE_SHA OUTPUT_JSON
// Requires the repository's Playwright Chromium. A private HTTP server owns an ephemeral port.
const fs=require('fs'),http=require('http'),{execFileSync}=require('child_process');
const {chromium}=require('playwright');
const {webdavServer}=require('../../tests/support/webdav-server');
const base=process.argv[2],output=process.argv[3];
if(!base||!output)throw new Error('Expected BASE_SHA OUTPUT_JSON');
const files=['pako/dist/pako.min.js','helpers.js','beads.js','progress-units.js','tracking-sync.js','thread-accounting.js','project-storage.js','sync-merge-helpers.js','sync-attachment-codec.js','sync-engine.js','blob-store.js','webdav-sync.js'];
const source=(side,file)=>file.startsWith('pako/')?fs.readFileSync(require.resolve(file),'utf8'):
  side==='base'?execFileSync('git',['show',base+':'+file],{encoding:'utf8',stdio:['ignore','pipe','ignore']}):fs.readFileSync(file,'utf8');
const sources={};for(const side of ['base','head'])sources[side]=files.filter(f=>side!=='base'||f!=='sync-attachment-codec.js').map(f=>({file:f,code:source(side,f)}));
const server=http.createServer((_req,res)=>{res.setHeader('content-type','text/html');res.end('<!doctype html><title>Attachment comparison</title>');});
(async()=>{
 await new Promise(r=>server.listen(0,'127.0.0.1',r));
 const browser=await chromium.launch();const results=[];
 try {
  for(const [index,side] of ['base','head','head','base','head','base','base','head'].entries()){
   const context=await browser.newContext(),page=await context.newPage();
   await context.grantPermissions(['local-network-access']);
   await page.goto('http://127.0.0.1:'+server.address().port);
   for(const {code}of sources[side])await page.addScriptTag({content:code});
   const cdp=await context.newCDPSession(page);await cdp.send('HeapProfiler.collectGarbage');
   let peakHeap=0,peakBacking=0,sampling=true,sampleError;
   const sample=async()=>{while(sampling){const m=await cdp.send('Runtime.getHeapUsage');peakHeap=Math.max(peakHeap,m.usedSize);peakBacking=Math.max(peakBacking,m.backingStorageSize||0);await new Promise(r=>setTimeout(r,5));}};
   const samples=sample().catch(e=>{sampleError=e;});
   const result=await page.evaluate(async()=>{
    Date.now=()=>1792647152000;
    const order=[],digest=crypto.subtle.digest.bind(crypto.subtle);
    crypto.subtle.digest=async(...args)=>{order.push('digest:start');const value=await digest(...args);order.push('digest:end');return value;};
    await ProjectStorage.save({id:'proj_perf',version:11,name:'Attachment comparison',settings:{sW:1,sH:1},pattern:[{id:'310'}],done:[0]});
    const bytes=new Uint8Array(8*1024*1024);for(let i=0;i<bytes.length;i++)bytes[i]=i%251;
    const blob=new Blob([bytes],{type:'image/png'});
    // One shared payload referenced by a tracing picture and a photo pair.
    for(const id of ['trace:proj_perf','photo:proj_perf:one','photothumb:proj_perf:one'])await BlobStore.put(id,{projectId:'proj_perf',blob,description:'binary £ ×'});
    let payload;
    const start=performance.now();
    await SyncEngine.exportToFolder({queryPermission:async()=>'granted',getFileHandle:async()=>({createWritable:async()=>({write:async b=>{order.push('write');payload=b;},close:async()=>order.push('close')})})});
    const exported=performance.now();
    const rows=await SyncEngine.checkForUpdates({queryPermission:async()=>'granted',async *values(){yield {kind:'file',name:'peer.csync',getFile:async()=>{order.push('file');return {size:payload.length,lastModified:1,arrayBuffer:async()=>{order.push('read');return payload;}};}};}});
    // The scan sees our own identity; prepare the decompressed bytes through the same facade a remote peer uses.
    const sync=SyncEngine.decompress(payload);sync._deviceId='comparison-peer';
    if(sync.attachments.manifest.filter(e=>e.required).length!==3)throw new Error('Expected three exported binary attachments');
    const plan=await SyncEngine.prepareImport(sync);await SyncEngine.executeImport(plan);
    const end=performance.now();
    const saved=await BlobStore.get('photo:proj_perf:one'),restored=new Uint8Array(await saved.blob.arrayBuffer());
    if(restored.length!==bytes.length||restored.some((v,i)=>v!==bytes[i]))throw new Error('Byte mismatch');
    const attachmentPayloadHash=Array.from(new Uint8Array(await digest('SHA-256',pako.deflate(JSON.stringify(sync.attachments))))).map(b=>b.toString(16).padStart(2,'0')).join('');
    return {exportMs:exported-start,totalMs:end-start,compressedBytes:payload.length,attachmentPayloadHash,manifest:sync.attachments.manifest,order,scanOwnUpdates:rows.length};
   });
   sampling=false;await samples;if(sampleError)throw sampleError;await cdp.send('HeapProfiler.collectGarbage');
   const retained=await cdp.send('Runtime.getHeapUsage');
   const dav=await webdavServer('http://127.0.0.1:'+server.address().port);
   const peerContext=await browser.newContext();await peerContext.grantPermissions(['local-network-access']);
   let webdav;
   try {
    const startUpload=performance.now();await page.evaluate(o=>WebDAVSync.connect(o),dav.options());
    const uploadMs=performance.now()-startUpload;
    const peer=await peerContext.newPage();await peer.goto('http://127.0.0.1:'+server.address().port);
    for(const {code}of sources[side])await peer.addScriptTag({content:code});
    const peerCDP=await peerContext.newCDPSession(peer);await peerCDP.send('HeapProfiler.collectGarbage');
    let active=true,heap=0,backing=0,peerSampleError;
    const samplingPeer=(async()=>{while(active){const m=await peerCDP.send('Runtime.getHeapUsage');heap=Math.max(heap,m.usedSize);backing=Math.max(backing,m.backingStorageSize||0);await new Promise(r=>setTimeout(r,5));}})().catch(e=>{peerSampleError=e;});
    const startReceive=performance.now();await peer.evaluate(o=>WebDAVSync.connect(o),dav.options());
    const receiveMs=performance.now()-startReceive;active=false;await samplingPeer;if(peerSampleError)throw peerSampleError;
    const valid=await peer.evaluate(async()=>{const r=await BlobStore.get('photo:proj_perf:one');if(!r)throw new Error('No received photo');const bytes=new Uint8Array(await r.blob.arrayBuffer());return {size:bytes.length,valid:bytes.every((b,i)=>b===i%251),state:WebDAVSync.getStatus().state};});
    if(valid.size!==8*1024*1024||!valid.valid||valid.state!=='idle')throw new Error('WebDAV transfer mismatch');
    await peer.evaluate(()=>WebDAVSync.disconnect());await page.evaluate(()=>WebDAVSync.disconnect());
    webdav={uploadMs,receiveMs,peakHeap:heap,peakBacking:backing,requests:dav.requests.map(r=>r.method)};
   } finally {await peerContext.close();await dav.close();}
   results.push({side,warmup:index<2,...result,peakHeap,peakBacking,retained,webdav});await context.close();
  }
  // Compare all deterministic data and every observable digest/transfer event.
  // Compressed size includes nondeterministic envelope timestamps/IDs, so compare compressed attachment hashes, metadata and order instead.
  for(const r of results)if(JSON.stringify({manifest:r.manifest,hash:r.attachmentPayloadHash,order:r.order,scanOwnUpdates:r.scanOwnUpdates})!==JSON.stringify({manifest:results[0].manifest,hash:results[0].attachmentPayloadHash,order:results[0].order,scanOwnUpdates:results[0].scanOwnUpdates}))throw new Error('Metadata/order mismatch');
  for(const r of results)if(JSON.stringify(r.webdav.requests)!==JSON.stringify(results[0].webdav.requests))throw new Error('WebDAV request order mismatch');
  fs.writeFileSync(output,JSON.stringify({base,browser:browser.version(),samples:results,limitations:'CDP sampled JS heap and backing storage are not true peak renderer/process memory; synchronous allocation spikes can fall between samples. Folder handles are controlled doubles, not a cloud-mounted directory.'},null,2)+'\n');
  console.log(results.map(r=>({side:r.side,exportMs:r.exportMs,totalMs:r.totalMs,peakHeap:r.peakHeap,peakBacking:r.peakBacking})));
 } finally {await browser.close();await new Promise(r=>server.close(r));}
})().catch(e=>{console.error(e);server.close();process.exitCode=1;});
