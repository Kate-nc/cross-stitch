const fs = require('fs');
const path = require('path');
const FDBFactory = require('fake-indexeddb/lib/FDBFactory');

const SB_SRC = fs.readFileSync(path.join(__dirname, '..', 'stash-bridge.js'), 'utf8');
const LOCK_SRC = fs.readFileSync(path.join(__dirname, '..', 'cross-tab-lock.js'), 'utf8');
const SB_SRC_NO_AUTORUN = SB_SRC.replace(
  /\/\/ Auto-run migrations on script load[\s\S]*?\.catch\(function\(\) \{ \/\* migrations log internally \*\/ \}\);\n/,
  ''
);

function makeWindow(overrides) {
  const listeners = Object.create(null);
  return Object.assign({
    __events: [],
    SyncEngine: { triggerAutoExport: jest.fn() },
    addEventListener(type, listener) {
      if (!listeners[type]) listeners[type] = [];
      listeners[type].push(listener);
    },
    removeEventListener(type, listener) {
      if (!listeners[type]) return;
      listeners[type] = listeners[type].filter(fn => fn !== listener);
    },
    dispatchEvent(event) {
      this.__events.push(event.type);
      (listeners[event.type] || []).slice().forEach(fn => fn(event));
      return true;
    },
  }, overrides || {});
}

function CustomEvent(type) {
  this.type = type;
}

function loadBridge(indexedDB, options) {
  const opts = options || {};
  const window = opts.window || makeWindow();
  const runtime = new Function(
    'window',
    'indexedDB',
    'CustomEvent',
    'console',
    'ensurePersistence',
    'invalidateStatsCache',
    SB_SRC_NO_AUTORUN + '\nreturn StashBridge;'
  );
  const StashBridge = runtime(
    window,
    indexedDB,
    CustomEvent,
    opts.console || { log() {}, warn() {}, error() {} },
    undefined,
    undefined
  );
  return { StashBridge, window };
}

function loadLock(windowObj, sharedStorage) {
  const localStorage = sharedStorage || {
    _store: {},
    getItem(k) { return this._store[k] != null ? this._store[k] : null; },
    setItem(k, v) { this._store[k] = String(v); },
    removeItem(k) { delete this._store[k]; },
  };
  new Function(
    'window', 'localStorage', 'BroadcastChannel', 'setTimeout',
    LOCK_SRC + '\n;'
  )(windowObj, localStorage, undefined, setTimeout);
  windowObj.localStorage = localStorage;
  return windowObj;
}

function openDb(indexedDB) {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open('stitch_manager_db', 1);
    req.onupgradeneeded = event => {
      const db = event.target.result;
      if (!db.objectStoreNames.contains('manager_state')) db.createObjectStore('manager_state');
    };
    req.onsuccess = event => resolve(event.target.result);
    req.onerror = event => reject(event.target.error);
  });
}

async function seedManagerState(indexedDB, entries) {
  const db = await openDb(indexedDB);
  try {
    await new Promise((resolve, reject) => {
      const tx = db.transaction('manager_state', 'readwrite');
      const store = tx.objectStore('manager_state');
      Object.keys(entries || {}).forEach(key => store.put(entries[key], key));
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error || new Error('Transaction aborted'));
    });
  } finally {
    db.close();
  }
}

async function readThreads(indexedDB) {
  const db = await openDb(indexedDB);
  try {
    return await new Promise((resolve, reject) => {
      const tx = db.transaction('manager_state', 'readonly');
      const req = tx.objectStore('manager_state').get('threads');
      req.onsuccess = () => resolve(req.result || {});
      req.onerror = () => reject(req.error);
    });
  } finally {
    db.close();
  }
}

describe('persistent real-time project accounting (actual IndexedDB)', () => {
  let indexedDB, a, b;
  const key='dmc:310';
  beforeEach(async()=>{
    indexedDB=new FDBFactory();
    await seedManagerState(indexedDB,{threads:{[key]:{owned:1},'anchor:310':{owned:1}},schema_version:3});
    a=loadBridge(indexedDB).StashBridge;
    b=loadBridge(indexedDB).StashBridge;
  });
  const usage=n=>({'dmc:310':n});
  const stock=async()=> (await readThreads(indexedDB))[key].owned;
  test('reload, unchanged application, retry and new stitches',async()=>{
    await a.applyProjectConsumption('p',usage(.2),usage(0));
    expect(await stock()).toBeCloseTo(.8);
    const reopened=loadBridge(indexedDB).StashBridge;
    await reopened.applyProjectConsumption('p',usage(.2),usage(.2),{initialise:true});
    await reopened.applyProjectConsumption('p',usage(.2),usage(.2));
    await reopened.applyProjectConsumption('p',usage(.2),usage(.2));
    expect(await stock()).toBeCloseTo(.8);
    await reopened.applyProjectConsumption('p',usage(.3),usage(.2));
    expect(await stock()).toBeCloseTo(.7);
  });
  test('legacy history is checkpointed without guessing a deduction',async()=>{
    await a.applyProjectConsumption('legacy',usage(.2),usage(.2));
    expect(await stock()).toBe(1);
    await a.applyProjectConsumption('legacy',usage(.3),usage(.2));
    expect(await stock()).toBeCloseTo(.9);
  });
  test('two projects, two tabs, cold migrations and retries retain both deductions without locks',async()=>{
    await Promise.all([a.applyProjectConsumption('p',usage(.2),usage(0)),b.applyProjectConsumption('q',usage(.3),usage(0))]);
    expect(await stock()).toBeCloseTo(.5);
    await Promise.all([a.applyProjectConsumption('p',usage(.2),usage(0)),b.applyProjectConsumption('p',usage(.2),usage(0))]);
    expect(await stock()).toBeCloseTo(.5);
  });
  test('external additions, edits and stale Manager autosaves retain deductions',async()=>{
    const baseline=await a.getGlobalStash();
    const edited=JSON.parse(JSON.stringify(baseline));edited[key].owned=2;
    await a.applyProjectConsumption('p',usage(.2),usage(0));
    await b.saveThreadEdits(edited,baseline);
    expect(await stock()).toBeCloseTo(1.8);
    await b.addToStash(key,1);
    await a.applyProjectConsumption('p',usage(.3),usage(0));
    expect(await stock()).toBeCloseTo(2.7);
    // Unchanged stale copy is never written wholesale.
    await b.saveThreadEdits(edited,edited);
    expect(await stock()).toBeCloseTo(2.7);
  });
  test('brands, zero consumption and missing stock stay independent',async()=>{
    await a.applyProjectConsumption('p',{[key]:.2,'anchor:310':.1,'dmc:missing':.5},{[key]:0,'anchor:310':0});
    let threads=await readThreads(indexedDB);
    expect(threads[key].owned).toBeCloseTo(.8);expect(threads['anchor:310'].owned).toBeCloseTo(.9);
    await a.addToStash('dmc:missing',1);
    await a.applyProjectConsumption('p',{'dmc:missing':.5},{});
    threads=await readThreads(indexedDB);expect(threads['dmc:missing'].owned).toBe(1);
    await expect(a.applyProjectConsumption('p',{[key]:NaN},{})).rejects.toThrow();
  });
  test('unmark/reset never refunds usable thread; explicit correction only credits recorded actual debits once',async()=>{
    await a.applyProjectConsumption('p',usage(.2),usage(0));
    await a.applyProjectConsumption('p',usage(0),usage(0));
    expect(await stock()).toBeCloseTo(.8);
    await b.addToStash(key,1);
    await b.applyProjectConsumption('q',usage(.3),usage(0));
    await a.applyProjectConsumption('p',usage(.2),usage(0),{restore:true});
    await a.applyProjectConsumption('p',usage(.2),usage(0),{restore:true});
    await a.applyProjectConsumption('p',usage(.2),usage(0));
    expect(await stock()).toBeCloseTo(1.7);
  });
  test('zero stock creates no future debt and partial skeins are consumed once',async()=>{
    await seedManagerState(indexedDB,{threads:{[key]:{owned:0,partialStatus:'about-half'}}});
    await a.applyProjectConsumption('p',usage(.2),usage(0));
    expect(await stock()).toBeCloseTo(.3);
    await a.applyProjectConsumption('p',usage(2),usage(0));
    expect(await stock()).toBe(0);
    await a.addToStash(key,1);
    await a.applyProjectConsumption('p',usage(2),usage(0));
    expect(await stock()).toBe(1);
    await a.applyProjectConsumption('p',usage(2),usage(0),{restore:true});
    expect(await stock()).toBeCloseTo(1.5);
  });
  test('transaction abort rolls back inventory AND checkpoint, then retry deducts once',async()=>{
    await a.migrateToLatest();
    const db=await openDb(indexedDB), proto=Object.getPrototypeOf(db.transaction('manager_state').objectStore('manager_state'));
    const original=proto.put;
    let abort=true;
    const spy=jest.spyOn(proto,'put').mockImplementation(function(value,keyArg){
      const req=original.call(this,value,keyArg);
      if(abort&&String(keyArg).startsWith('rt_deduction:')){abort=false;this.transaction.abort();}
      return req;
    });
    await expect(a.applyProjectConsumption('p',usage(.2),usage(0))).rejects.toThrow();
    spy.mockRestore();db.close();
    expect(await stock()).toBe(1);
    await a.applyProjectConsumption('p',usage(.2),usage(0));expect(await stock()).toBeCloseTo(.8);
    await a.applyProjectConsumption('p',usage(.2),usage(0));expect(await stock()).toBeCloseTo(.8);
  });
  test('disabled/reopen initialisation preserves the saved checkpoint; re-enable charges only new consumption',async()=>{
    await a.applyProjectConsumption('p',usage(.2),usage(0));
    await b.applyProjectConsumption('p',usage(.3),usage(.3),{initialise:true});
    expect(await stock()).toBeCloseTo(.8);
    await b.applyProjectConsumption('p',usage(.3),usage(.3));
    expect(await stock()).toBeCloseTo(.7);
  });
  test('concurrent stock additions and two-project writes are retained in either ordering',async()=>{
    const baseline=await b.getGlobalStash(),edited=JSON.parse(JSON.stringify(baseline));edited[key].owned=2;
    await Promise.all([a.applyProjectConsumption('p',usage(.2),usage(0)),b.saveThreadEdits(edited,baseline),b.applyProjectConsumption('q',usage(.3),usage(0))]);
    expect(await stock()).toBeCloseTo(1.5);
  });
  test('explicit zero and used-up stock edits are preserved and do not create a future debt',async()=>{
    let before=await b.getGlobalStash(),after=JSON.parse(JSON.stringify(before));after[key].owned=0;
    await b.saveThreadEdits(after,before);expect(await stock()).toBe(0);
    await a.applyProjectConsumption('p',usage(.2),usage(0));
    await b.addToStash(key,1);await a.applyProjectConsumption('p',usage(.2),usage(0));expect(await stock()).toBe(1);
    before=await b.getGlobalStash();after=JSON.parse(JSON.stringify(before));after[key].partialStatus='used-up';
    await b.saveThreadEdits(after,before);expect(await stock()).toBe(0);
  });
  test('ledger write failure in a multi-thread blend rolls all stock changes back',async()=>{
    await a.migrateToLatest();
    const db=await openDb(indexedDB),proto=Object.getPrototypeOf(db.transaction('manager_state').objectStore('manager_state'));
    const original=proto.put;
    const spy=jest.spyOn(proto,'put').mockImplementation(function(value,k){if(String(k).startsWith('rt_deduction:'))throw Error('quota');return original.call(this,value,k);});
    const amounts={[key]:.2,'anchor:310':.2};
    await expect(a.applyProjectConsumption('p',amounts,{})).rejects.toThrow('quota');
    spy.mockRestore();db.close();
    expect(await stock()).toBe(1);expect((await readThreads(indexedDB))['anchor:310'].owned).toBe(1);
    await a.applyProjectConsumption('p',amounts,{});expect(await stock()).toBeCloseTo(.8);
  });

  test('Manager refresh preserves pending user quantity edits across a committed deduction',async()=>{
    const source=fs.readFileSync(path.join(__dirname,'../manager-app.js'),'utf8');
    const start=source.indexOf('const handleStashChanged = async () => {');
    const code=source.slice(start,source.indexOf("window.addEventListener('cs:stashChanged'",start));
    const baseline={current:await a.getGlobalStash()},saving={current:false};
    let displayed=JSON.parse(JSON.stringify(baseline.current));displayed[key].owned=2;
    await a.applyProjectConsumption('p',usage(.2),usage(0));
    const refresh=new Function('threadsSavingRef','threadsBaselineRef','openManagerDB','setThreads',code+'return handleStashChanged;')(saving,baseline,()=>openDb(indexedDB),updater=>{displayed=updater(displayed);});
    await refresh();
    expect(displayed[key].owned).toBeCloseTo(1.8);
    await b.saveThreadEdits(displayed,baseline.current);
    expect(await stock()).toBeCloseTo(1.8);
  });
  test('Manager queued autosave/unload only applies each user delta once',async()=>{
    const source=fs.readFileSync(path.join(__dirname,'../manager-app.js'),'utf8');
    const start=source.indexOf('function persistThreadEdits(next)');
    const code=source.slice(start,source.indexOf('const [patterns',start));
    const baseline={current:await b.getGlobalStash()},queue={current:Promise.resolve()},saving={current:false};
    const save=new Function('threadsSaveQueueRef','threadsSavingRef','threadsBaselineRef','StashBridge',code+'return persistThreadEdits;')(queue,saving,baseline,b);
    const next=JSON.parse(JSON.stringify(baseline.current));next[key].owned=2;
    const newer=JSON.parse(JSON.stringify(next));newer[key].owned=3;
    await a.applyProjectConsumption('p',usage(.2),usage(0));
    await Promise.all([save(next),save(newer),save(newer)]);
    expect(await stock()).toBeCloseTo(2.8);
  });

});
