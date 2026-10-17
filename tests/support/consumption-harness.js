const fs=require('fs');
const FDBFactory=require('fake-indexeddb/lib/FDBFactory');
const A=require('../../thread-accounting');
global.ProgressUnits=require('../../progress-units');
const clone=x=>JSON.parse(JSON.stringify(x));
const key='dmc:310', prefs={tailAllowanceIn:0,generalWasteMultiplier:1};
const marks=(done=[1],wp=prefs)=>A.snapshot({pattern:[{id:'310',brand:'dmc'}],done,fabricCt:14},wp);
const estimate=marks()['d:0'];
const cost=estimate.amounts[key];
function bridge(indexedDB,window={}) {
  window.ThreadAccounting=A;
  return new Function('window','indexedDB','console',fs.readFileSync('stash-bridge.js','utf8').replace(/\/\/ Auto-run migrations on script load[\s\S]*$/, '')+'\nreturn StashBridge;')(window,indexedDB,{warn(){},error(){},log(){}});
}
async function dbFor(idb){return new Promise((res,rej)=>{const r=idb.open('stitch_manager_db');r.onupgradeneeded=()=>r.result.createObjectStore('manager_state');r.onsuccess=()=>res(r.result);r.onerror=()=>rej(r.error);});}
async function store(idb,entries){const db=await dbFor(idb);try{return await new Promise((res,rej)=>{const tx=db.transaction('manager_state',entries?'readwrite':'readonly'),s=tx.objectStore('manager_state');let out={};if(entries)Object.entries(entries).forEach(([k,v])=>s.put(v,k));else{const r=s.openCursor();r.onsuccess=()=>{const c=r.result;if(c){out[c.key]=c.value;c.continue();}};}tx.oncomplete=()=>res(out);tx.onabort=()=>rej(tx.error||Error('aborted'));tx.onerror=()=>rej(tx.error);});}finally{db.close();}}
function op(seq,kind='mark',unit='d:0',est=estimate,pid='p'){return {projectId:pid,unit,seq,kind,estimate:est,enabled:true};}
function syncEngine(window,idb,storage){return new Function('window','localStorage','pako','indexedDB','ProjectStorage',fs.readFileSync('sync-engine.js','utf8')+'\nreturn SyncEngine;')(window,{getItem(){return null;},setItem(){},removeItem(){}},require('pako'),idb,storage||{listProjects:async()=>[],get:async()=>null});}
module.exports={A,bridge,dbFor,store,op,marks,estimate,cost,key,syncEngine,clone,prefs};
