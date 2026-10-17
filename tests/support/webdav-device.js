const fs = require('fs');
const vm = require('vm');
const {IDBFactory, IDBKeyRange, IDBObjectStore} = require('fake-indexeddb');
const crypto = require('crypto').webcrypto;
const pako = require('pako');
const {JSDOM} = require('jsdom');
const dom = new JSDOM();
const clients = [];

function device(id) {
  const values = new Map();
  const c = {console, indexedDB:new IDBFactory(), IDBKeyRange, Blob, crypto, pako, TextEncoder, TextDecoder,
    structuredClone, Uint8Array, ArrayBuffer, setTimeout, clearTimeout, setInterval, clearInterval,
    btoa:s=>Buffer.from(s,'binary').toString('base64'),atob:s=>Buffer.from(s,'base64').toString('binary'),
    localStorage:{getItem:k=>values.get(k)||null,setItem:(k,v)=>values.set(k,String(v)),removeItem:k=>values.delete(k)},
    ensurePersistence(){},dispatchEvent(){},addEventListener(){},CustomEvent:class {},
    Beads:require('../../beads'),ProgressUnits:require('../../progress-units')};
  const events = new Map();
  const on=(name,fn)=>{if(!events.has(name))events.set(name,[]);events.get(name).push(fn);};
  const fire=(event)=>{for(const fn of (events.get(event.type)||[]))fn(event);};
  Object.assign(c,{URL,AbortController,fetch,DOMParser:dom.window.DOMParser,
    navigator:{onLine:true},document:{visibilityState:'visible',addEventListener:on},
    addEventListener:on,dispatchEvent:fire,CustomEvent:class {constructor(type,init){this.type=type;this.detail=init&&init.detail;}}});
  c.window=c; c.globalThis=c;
  vm.createContext(c);
  for (const file of ['tracking-sync.js','thread-accounting.js','project-storage.js','sync-engine.js','blob-store.js','webdav-sync.js']) {
    vm.runInContext(fs.readFileSync(file,'utf8') + (file==='project-storage.js'?'\nthis.ProjectStorage=ProjectStorage;':''),c);
  }
  c.BlobStore._setOpener(()=>new Promise((r,j)=>{const q=c.indexedDB.open('CrossStitchDB',5);q.onsuccess=()=>r(q.result);q.onerror=()=>j(q.error);}));
  c.localStorage.setItem('cs_sync_deviceId',id);
  clients.push(c);return c;
}
const project = () => ({id:'proj_shared',name:'Shared',version:11,updatedAt:'2026-01-01T00:00:00Z',
  settings:{sW:2,sH:2},pattern:Array.from({length:4},()=>({id:'310'})),done:[0,0,0,0],notes:'base',
  halfDone:[],partialDone:[],knotsDone:[],bsDone:[],specialtyDone:[],beadsDone:[]});

async function cleanup(){for(const c of clients)await c.WebDAVSync.disconnect();clients.length=0;}
module.exports={device,project,cleanup,close:()=>dom.window.close()};
