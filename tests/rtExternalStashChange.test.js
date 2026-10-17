const FDBFactory=require('fake-indexeddb/lib/FDBFactory');
const {A,bridge,store,op,cost,key,clone}=require('./support/consumption-harness');
test('stale stash refreshes and manager saves retain committed consumption history',async()=>{
 const idb=new FDBFactory();await store(idb,{threads:{[key]:{owned:2,history:[]}},schema_version:3});
 const a=bridge(idb),b=bridge(idb),baseline=await b.getGlobalStash(),edited=clone(baseline);edited[key].owned=3;
 await a.applyConsumptionEvents('p',{},[op(1)]);await b.saveThreadEdits(edited,baseline);
 await b.saveThreadEdits(edited,edited);const result=await store(idb);
 expect(A.quantity(result.threads[key])).toBeCloseTo(3-cost,14);
 expect(Object.values(result[A.KEY].events)).toHaveLength(1);
 expect(result.threads[key].history.some(e=>e.eventId&&e.reason.includes('Stitched full'))).toBe(true);
});
