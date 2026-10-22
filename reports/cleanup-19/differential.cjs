// Full-script facade comparison, not a source-body extractor.
// node reports/cleanup-19/differential.cjs BASE_SHA
const fs=require('fs'),vm=require('vm'),assert=require('assert/strict'),{execFileSync}=require('child_process');
const {IDBFactory,IDBKeyRange}=require('fake-indexeddb'),crypto=require('crypto');
const base=process.argv[2];if(!base)throw new Error('Expected BASE_SHA');
const files=['tracking-sync.js','thread-accounting.js','project-storage.js','sync-merge-helpers.js','sync-attachment-codec.js','sync-engine.js'];
const scripts={};for(const side of ['base','head'])scripts[side]=files.filter(f=>side!=='base'||f!=='sync-attachment-codec.js').map(file=>({file,code:side==='base'?execFileSync('git',['show',base+':'+file],{encoding:'utf8'}):fs.readFileSync(file,'utf8')}));
function device(side){
 const values=new Map(),events=[];
 const c={console,indexedDB:new IDBFactory(),IDBKeyRange,Blob,Uint8Array,ArrayBuffer,TextEncoder,TextDecoder,structuredClone,setTimeout,clearTimeout,setInterval,clearInterval,
  pako:require('pako'),atob,btoa,Beads:require('../../beads'),ProgressUnits:require('../../progress-units'),ensurePersistence(){},CustomEvent:class{constructor(type){this.type=type;}},
  dispatchEvent:e=>events.push(['event',e.type]),addEventListener(){},localStorage:{getItem:k=>values.get(k)||null,setItem:(k,v)=>values.set(k,String(v)),removeItem:k=>values.delete(k)},
  crypto:{subtle:{digest:async(...args)=>{events.push(['digest',Buffer.from(args[1]).toString('hex')]);return crypto.webcrypto.subtle.digest(...args);}}}};
 c.window=c;vm.createContext(c);for(const {file,code}of scripts[side])vm.runInContext(code+(file==='project-storage.js'?'\nthis.ProjectStorage=ProjectStorage;':''),c);
 return {c,events,values};
}
function fixture(n){
 const bytes=Buffer.from(Array.from({length:n%1024},(_,i)=>(i+n)%256)),hash='sha256:'+crypto.createHash('sha256').update(bytes).digest('hex');
 const manifest=['trace:p','photo:p:a','photothumb:p:a'].map(id=>({id,projectId:'p',contentId:hash,bytes:bytes.length,type:'image/png',required:true,record:{id,projectId:'p',title:'£ ×'}}));
 return {_format:'cross-stitch-sync',_version:2,_deviceId:'peer',_deliveryId:'fixed',_createdAt:'2026-01-01T00:00:00Z',projects:[{id:'p',data:{id:'p',version:11,name:'Test',settings:{sW:1,sH:1},pattern:[{id:'310'}],done:[0]}}],attachments:{version:1,manifest,blobs:{[hash]:bytes.toString('base64')},optional:{sourceImages:'excluded'}}};
}
const mutations=[()=>{},f=>{f._version=1;delete f.attachments;},f=>delete f.attachments,
 f=>f.attachments.manifest.push(f.attachments.manifest[0]),f=>f.attachments.manifest[0].bytes++,
 f=>f.attachments.manifest[0].required=false,f=>f.attachments.manifest[0].record.id='other',
 f=>delete f.attachments.blobs[f.attachments.manifest[0].contentId],f=>f.attachments.blobs[f.attachments.manifest[0].contentId]='!',
 f=>f.attachments.blobs.extra='AA==',f=>f.attachments.manifest[0].projectId='other',
 f=>f.attachments.manifest.shift(),f=>{f.projects[0].data.settings.traceImage=true;f.attachments.manifest.shift();},
 f=>f.attachments.manifest[0].deleted=true,f=>f.attachments.version=999,
 f=>{f.attachments.manifest=[];f.attachments.blobs={};},f=>{f.attachments.manifest=[{id:'source:p',projectId:'p',optional:true,excluded:true}];f.attachments.blobs={};},
 f=>{f.attachments.optional.sourceImages='invalid';},f=>{f.attachments.manifest[0].type='';},
 f=>{f.attachments.manifest[0].bytes=-1;}];
(async()=>{
 const devices={base:device('base'),head:device('head')};let count=0;
 for(let i=0;i<400;i++){
  const f=fixture(i);mutations[i%mutations.length](f);
  const results=[];
  for(const side of ['base','head']){
   const {c,events,values}=devices[side];events.length=0;values.clear();const input=JSON.parse(JSON.stringify(f));
   let result;
   try{const p=await c.SyncEngine.prepareImport(input);result={attachments:p.syncObj.attachments,summary:p.summary,projects:p.syncObj.projects};}
   catch(e){result={error:{name:e.name,message:e.message,state:e.state}};}
   results.push(JSON.parse(JSON.stringify({result,input,events,protocol:values.get('cs_sync_protocolState')})));
  }
  assert.deepEqual(results[1],results[0],'case '+i);count++;
 }
 console.log(JSON.stringify({base,cases:count,mismatches:0,compared:['facade result','input mutation','error name/message/state','serial digest bytes/order','protocol status/events']}));
})().catch(e=>{console.error(e);process.exitCode=1;});
