const fs=require('fs');
const FDBFactory=require('fake-indexeddb/lib/FDBFactory');
const {A,bridge,dbFor,store,op,marks,cost,key}=require('./support/consumption-harness');
const src=fs.readFileSync('tracker-app.js','utf8');
const start=src.indexOf('const flushRtStashWrite=useCallback');
const body=src.slice(start,src.indexOf('const flushRtStashWriteRef=',start));
async function harness(){
 const idb=new FDBFactory();await store(idb,{threads:{[key]:{owned:1}},schema_version:3});
 const ctx={projectId:'p',initialMarks:{},outbox:[{...op(1),token:'test'}],sequences:{},ready:Promise.resolve(),outboxKey:'recovery'};
 const refs={write:{current:{ctx,enabled:true}},context:{current:ctx}};
 const stash=bridge(idb),display={current:null},localStorage={setItem(){}};
 const debounce={current:null},flushRef={current:null};
 const flush=new Function('useCallback','rtWriteSnapshotRef','rtContextRef','StashBridge','savesBlockedRef','setGlobalStash','setRtAccountingVersion','window','rtDebounceRef','flushRtStashWriteRef','localStorage',body+'return flushRtStashWrite;')(fn=>fn,refs.write,refs.context,stash,{current:false},s=>display.current=s,()=>{},{Toast:{show(){}},ThreadAccounting:A},debounce,flushRef,localStorage);
 flushRef.current=flush;
 return {idb,ctx,refs,stash,display,flush};
}
test('switch during awaiting write charges departing project and leaves current display alone',async()=>{
 const h=await harness();let release;h.ctx.ready=new Promise(resolve=>release=resolve);
 const pending=h.flush();h.refs.context.current={projectId:'q'};release();await pending;
 const s=await store(h.idb);expect(A.quantity(s.threads[key])).toBeCloseTo(1-cost,14);
 expect(Object.values(s[A.KEY].events)[0].projectId).toBe('p');expect(h.display.current).toBeNull();
});
test('live tracking off records history with zero debit; subsequent enabled marks charge normally',async()=>{
 const h=await harness();h.ctx.outbox[0].enabled=false;await h.flush();
 let s=await store(h.idb);expect(A.quantity(s.threads[key])).toBe(1);expect(Object.values(s[A.KEY].events)[0].description).toContain('off');
 h.ctx.outbox.push({...op(1,'mark','d:1'),token:'next'});await h.flush();s=await store(h.idb);
 expect(A.quantity(s.threads[key])).toBeCloseTo(1-cost,14);expect(Object.values(s[A.KEY].events)).toHaveLength(2);
});
test('ambiguous commit retains operations; retry and outbox replay keep one debit and one history event',async()=>{
 jest.useFakeTimers({doNotFake:['setImmediate','nextTick']});const warning=jest.spyOn(console,'warn').mockImplementation(()=>{});
 try{
  const h=await harness(),real=h.stash.applyConsumptionEvents;
  let fail=true;h.stash.applyConsumptionEvents=async(...args)=>{const r=await real(...args);if(fail){fail=false;throw Error('lost acknowledgement');}return r;};
  await expect(h.flush()).rejects.toThrow('lost acknowledgement');expect(h.ctx.outbox).toHaveLength(1);
  await h.flush();expect(h.ctx.outbox).toEqual([]);
  const s=await store(h.idb);expect(A.quantity(s.threads[key])).toBeCloseTo(1-cost,14);expect(Object.values(s[A.KEY].events)).toHaveLength(1);
  await bridge(h.idb).applyConsumptionEvents('p',marks(),[op(1)]);
  expect(A.quantity((await store(h.idb)).threads[key])).toBeCloseTo(1-cost,14);
 }finally{warning.mockRestore();jest.clearAllTimers();jest.useRealTimers();}
});
test('switching projects during completion does not finish or disable the new project',async()=>{
 const start=src.indexOf('const finishingCtx=rtContextRef.current;');
 const code=src.slice(start,src.indexOf("}} style={{width:'100%'",start));
 let release;const wait=new Promise(resolve=>release=resolve);
 const ctx={current:{projectId:'p'}},project={current:'p'},finish=jest.fn(),deducted=jest.fn(),modal=jest.fn();
 new Function('rtContextRef','projectIdRef','rtDebounceRef','flushRtStashWriteRef','ProjectStorage','v3FieldsRef','setStashDeducted','setModal',code)(ctx,project,{current:null},{current:()=>wait},{markProjectFinished:finish},{current:{}},deducted,modal);
 ctx.current={projectId:'q'};project.current='q';release();await wait;await Promise.resolve();
 expect(finish).not.toHaveBeenCalled();expect(deducted).not.toHaveBeenCalled();
});

test('duplicate recovered outboxes do not leave gaps in later occurrence sequences',async()=>{
 const h=await harness();
 h.ctx.outbox=[{...op(1),seq:undefined,token:'same'},{...op(1),seq:undefined,token:'same'}];
 await h.flush();
 h.ctx.outbox.push({...op(2,'unpick'),seq:undefined,token:'next'});await h.flush();
 const s=await store(h.idb);expect(Object.values(s[A.KEY].events).map(e=>e.seq)).toEqual([1,2]);
 expect(A.quantity(s.threads[key])).toBeCloseTo(1-cost,14);
});
