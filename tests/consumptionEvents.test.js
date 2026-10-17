const {A,bridge,dbFor,store,op,marks,estimate,cost,key,syncEngine,clone,prefs}=require('./support/consumption-harness');
const FDBFactory=require('fake-indexeddb/lib/FDBFactory');
let idb,a,b;
beforeEach(async()=>{idb=new FDBFactory();await store(idb,{threads:{[key]:{owned:1}},schema_version:3});a=bridge(idb);b=bridge(idb);});
const stock=async()=>A.quantity((await store(idb)).threads[key]);
const history=async()=>Object.values((await store(idb))[A.KEY].events);
test('committed retries, duplicates, reload and independent tabs debit exactly once',async()=>{
  await Promise.all([a.applyConsumptionEvents('p',{},[op(1)]),b.applyConsumptionEvents('p',{},[op(1)])]);
  await bridge(idb).applyConsumptionEvents('p',marks(),[op(1),op(1)]);
  expect(await stock()).toBeCloseTo(1-cost,14);expect(await history()).toHaveLength(1);
  expect((await history())[0]).toMatchObject({kind:'mark',debit:{[key]:cost},estimate});
  expect(Object.values((await b.getConsumptionAccounting()).events)).toEqual(await history());
});
test('concurrent projects and stale manager edits preserve both charges and purchases',async()=>{
  const base=await a.getGlobalStash(),edited=clone(base);edited[key].owned=2;
  await Promise.all([a.applyConsumptionEvents('p',{},[op(1)]),b.applyConsumptionEvents('q',{},[op(1,'mark','d:0',estimate,'q')]),b.saveThreadEdits(edited,base)]);
  expect(await stock()).toBeCloseTo(2-2*cost,14);expect(await history()).toHaveLength(2);
});
test('old project baseline preserves stock and v1 checkpoints without inventing history',async()=>{
  const old={version:1,threads:{[key]:{observed:.3,deducted:.2}}};await store(idb,{'rt_deduction:p':old});
  const r=await a.applyConsumptionEvents('p',marks(),[]);
  expect(await stock()).toBe(1);expect(await history()).toEqual([]);
  expect(r.accounting.projects.p).toMatchObject({baseline:{'d:0':true},legacy:old,reason:expect.stringContaining('historical consumption unknown')});
  await a.applyConsumptionEvents('p',{},[op(1,'correction')]);expect(await stock()).toBe(1);
  await a.applyConsumptionEvents('p',{},[op(2)]);expect(await stock()).toBeCloseTo(1-cost,14);
});
test('changing preferences does not revalue an existing event; later stitches retain new assumptions',async()=>{
  await a.applyConsumptionEvents('p',{},[op(1)]);
  const expensive=marks([1],{...prefs,strandCountOverride:4})['d:0'];
  await a.applyConsumptionEvents('p',{},[]);
  await a.applyConsumptionEvents('p',{},[op(1,'mark','d:1',expensive)]);
  expect(await stock()).toBeCloseTo(1-3*cost,14);
  const events=await history();expect(events.map(e=>e.estimate.assumptions.strands)).toEqual([2,4]);
});
test('physical unpick retains consumption, restitch charges again, correction returns only that debit',async()=>{
  await a.applyConsumptionEvents('p',{},[op(1),op(2,'unpick'),op(3),op(4,'correction')]);
  expect(await stock()).toBeCloseTo(1-cost,14);
  expect((await history()).map(e=>e.kind)).toEqual(['mark','unpick','mark','correction']);
  expect((await history())[1].description).toContain('used thread stays consumed');
  await a.applyConsumptionEvents('p',{},[op(4,'correction')]);expect(await stock()).toBeCloseTo(1-cost,14);
});
test('Undo/Redo of an accidental unpick uses no additional thread',async()=>{
  await a.applyConsumptionEvents('p',{},[op(1),op(2,'unpick'),op(3,'undo-unpick'),op(4,'unpick'),op(5,'undo-unpick')]);
  expect(await stock()).toBeCloseTo(1-cost,14);
  await a.applyConsumptionEvents('p',{},[op(6,'correction')]);expect(await stock()).toBeCloseTo(1,14);
});
test('zero stock observations never create debt against later additions; corrections credit actual debit',async()=>{
  await store(idb,{threads:{[key]:{owned:0,partialStatus:'remnant'}}});
  const large={...estimate,amounts:{[key]:.5}};
  await a.applyConsumptionEvents('p',{},[op(1,'mark','d:0',large)]);expect(await stock()).toBe(0);
  expect((await history())[0].debit[key]).toBe(.25);
  await b.addToStash(key,1);await a.applyConsumptionEvents('p',{},[op(1,'mark','d:0',large)]);expect(await stock()).toBe(1);
  await a.applyConsumptionEvents('p',{},[op(2,'correction')]);expect(await stock()).toBe(1.25);
});
test('aborted transaction rolls back stock and immutable history; retry commits once',async()=>{
  await a.migrateToLatest();const db=await dbFor(idb),proto=Object.getPrototypeOf(db.transaction('manager_state').objectStore('manager_state')),put=proto.put;
  const spy=jest.spyOn(proto,'put').mockImplementation(function(v,k){const r=put.call(this,v,k);if(k===A.KEY)this.transaction.abort();return r;});
  await expect(a.applyConsumptionEvents('p',{},[op(1)])).rejects.toThrow();spy.mockRestore();db.close();
  expect(await stock()).toBe(1);expect((await store(idb))[A.KEY]).toBeUndefined();
  await a.applyConsumptionEvents('p',{},[op(1)]);expect(await stock()).toBeCloseTo(1-cost,14);expect(await history()).toHaveLength(1);
});
test('fractional geometry, duplicate legacy halves, knots and backstitch use documented inch units',()=>{
  const t={id:'310'};const p={fabricCt:14,pattern:[t],done:[1],halfStitches:[[1,{fwd:t}]],halfDone:[[1,{fwd:true}]],
    partialStitches:[[1,{BL:t,TR:t}],[2,{TL:t,TR:t,BL:t}]],partialDone:[[1,['BL','TR']],[2,['TL','TR','BL']]],
    knots:[{x:2,y:2,id:'310'}],knotsDone:['2,2'],bsLines:[{x1:0,y1:0,x2:3,y2:4,colorId:'310'}],bsDone:['0,0,3,4,310']};
  const m=A.snapshot(p,prefs);expect(Object.keys(m)).toHaveLength(7);
  const total=Object.values(m).reduce((sum,e)=>sum+e.amounts[key],0);
  expect(total).toBeCloseTo((4.8*(1+.5+.75+1)+2*5)*2/14/1890,14);
  expect(A.snapshot({...p,fabricCt:28},prefs)).toEqual(Object.fromEntries(Object.entries(m).map(([k,v])=>[k,{...v,assumptions:{...v.assumptions,fabricCount:28,stitchOver:2}}])));
});
test('blend ratios, brands, tail allowance and finite quantities remain independent',()=>{
  const m=A.snapshot({fabricCt:14,pattern:[{id:'310+310',type:'blend',threads:[{id:'310',brand:'dmc'},{id:'310',brand:'anchor'}],blendRatio:[1,3]}],done:[1]}, {strandCountOverride:4,tailAllowanceIn:2,threadRunLength:10,generalWasteMultiplier:1.2});
  const e=m['d:0'];expect(e.amounts['anchor:310']).toBeCloseTo(e.amounts[key]*3,14);
  expect(Object.values(e.amounts).reduce((a,b)=>a+b,0)).toBeCloseTo((4.8*4/14+.4)*1.2/1890,14);
  [NaN,Infinity,-1].forEach(v=>{const l=A.empty();A.baseline(l,'p',{},null,'now');expect(()=>A.apply(l,{},[op(1,'mark','d:0',{...estimate,amounts:{[key]:v}})],'now')).toThrow();});
  expect(A.quantity({owned:Infinity})).toBe(0);
});
test('many stitch corrections do not accumulate rounding drift or truncate event history',async()=>{
  const ops=[];for(let i=0;i<550;i++)ops.push(op(i*2+1),op(i*2+2,'correction'));
  await a.applyConsumptionEvents('p',{},ops);expect(await stock()).toBeCloseTo(1,13);expect(await history()).toHaveLength(1100);
});
test('sync unions independent events, repeats idempotently, retains historical checkpoints and freezes assumptions',async()=>{
  await a.applyConsumptionEvents('p',{},[op(1)]);const left=await store(idb),right=clone(left);
  A.baseline(right[A.KEY],'q',{},null,'now');A.apply(right[A.KEY],right.threads,[op(1,'mark','d:0',estimate,'q')],'now');
  const se=syncEngine({ThreadAccounting:A});const merged=se.mergeStash(left,right);
  expect(merged.threads[key].owned).toBeCloseTo(1-2*cost,14);expect(Object.keys(merged[A.KEY].events)).toHaveLength(2);
  expect(se.mergeStash(merged,right).threads[key].owned).toBeCloseTo(1-2*cost,14);
  expect(se.mergeStash(right,merged)[A.KEY].events).toEqual(merged[A.KEY].events);
  await store(idb,merged);await a.applyConsumptionEvents('p',{},[op(1)]);expect(await stock()).toBeCloseTo(1-2*cost,14);
});
test('sync refuses incompatible immutable events and overdraw instead of rewriting history',async()=>{
  await a.applyConsumptionEvents('p',{},[op(1)]);const l=await store(idb),r=clone(l),se=syncEngine({ThreadAccounting:A});
  Object.values(r[A.KEY].events)[0].estimate.assumptions.strands=6;
  expect(()=>se.mergeStash(l,r)).toThrow('Conflicting consumption history');
  const large={...estimate,amounts:{[key]:.8}},x={threads:{[key]:{owned:1}},[A.KEY]:A.empty()},y=clone(x);
  A.baseline(x[A.KEY],'x',{},null,'now');A.apply(x[A.KEY],x.threads,[op(1,'mark','d:0',large,'x')],'now');
  A.baseline(y[A.KEY],'y',{},null,'now');A.apply(y[A.KEY],y.threads,[op(1,'mark','d:0',large,'y')],'now');
  expect(()=>se.mergeStash(x,y)).toThrow('exceeds recorded stock');
});


test('compressed backup and staged restore carry complete consumption history; replay and repeated restore are idempotent',async()=>{
  const load=require('./setup/backup-harness').load;
  const source=load(idb,{ThreadAccounting:A});
  await a.applyConsumptionEvents('p',{},[op(1),op(2,'unpick'),op(3)]);
  const original=await store(idb),backup=await source.api.createBackup(),file=source.api.serializeBackupFile(backup,{compressed:true});
  const dest=load(undefined,{ThreadAccounting:A});
  await dest.api.createBackup(); // initialise an empty, current storage schema
  await dest.api.restore(dest.api.parseBackupText(file.text));
  expect((await store(dest.idb))[A.KEY]).toEqual(original[A.KEY]);
  expect(A.quantity((await store(dest.idb)).threads[key])).toBeCloseTo(1-2*cost,14);
  // A new tab after publication is allowed to write to the published generation.
  dest.win.__restoringBackup=0;
  const reopened=bridge(dest.idb,dest.win);
  await reopened.applyConsumptionEvents('p',marks(),[op(1),op(2,'unpick'),op(3)]);
  expect(A.quantity((await store(dest.idb)).threads[key])).toBeCloseTo(1-2*cost,14);
  const again=await dest.api.restore(backup);expect(again.unchanged).toBe(true);
});

test('receipt identity prevents replaying a recovered operation under a later sequence',async()=>{
  await a.applyConsumptionEvents('p',{},[{...op(1),token:'one'},op(2,'unpick')]);
  await b.applyConsumptionEvents('p',{},[{...op(3),token:'one'}]);
  expect(await stock()).toBeCloseTo(1-cost,14);expect(await history()).toHaveLength(2);
});

test('malformed negative credits and incomplete or rewritten replay history cannot alter inventory',async()=>{
  await a.applyConsumptionEvents('p',{},[op(1),op(2,'correction')]);const original=await store(idb);
  const forged=clone(original[A.KEY]);Object.values(forged.events)[1].credit[key]=2;
  expect(()=>A.validate(forged)).toThrow('correction credit');
  const missing=clone(original[A.KEY]);delete missing.events[JSON.stringify(['p','d:0',1])];
  expect(()=>A.validate(missing)).toThrow('Incomplete');
  const negative=clone(original[A.KEY]);Object.values(negative.events)[0].debit[key]=-1;
  expect(()=>A.validate(negative)).toThrow('Invalid consumption quantity');
  expect(await stock()).toBe(1);expect((await store(idb))[A.KEY]).toEqual(original[A.KEY]);
});

test('actual sync import transaction preserves a debit arriving after prepare and repeated import',async()=>{
  await a.applyConsumptionEvents('p',{},[op(1)]);const remote=await store(idb);
  A.baseline(remote[A.KEY],'q',{},null,'now');A.apply(remote[A.KEY],remote.threads,[op(1,'mark','d:0',estimate,'q')],'now');
  const se=syncEngine({ThreadAccounting:A,openManagerDB:()=>dbFor(idb)},idb);
  const data={_format:se.SYNC_FORMAT,_version:1,_deviceId:'peer',_createdAt:new Date().toISOString(),projects:[],stash:remote};
  const plan=await se.prepareImport(data);
  await b.applyConsumptionEvents('r',{},[op(1,'mark','d:0',estimate,'r')]);
  await se.executeImport(plan);expect(await stock()).toBeCloseTo(1-3*cost,14);expect(await history()).toHaveLength(3);
  await se.executeImport(plan);expect(await stock()).toBeCloseTo(1-3*cost,14);expect(await history()).toHaveLength(3);
});

test('invalid owned edits cannot persist negative or infinite quantities',async()=>{
  await expect(a.updateThreadOwned(key,-1)).rejects.toThrow();await expect(a.updateThreadOwned(key,Infinity)).rejects.toThrow();
  const base=await a.getGlobalStash(),edited=clone(base);edited[key].owned=-1;
  await expect(a.saveThreadEdits(edited,base)).rejects.toThrow();expect(await stock()).toBe(1);
});

test('independent petites and long stitches consume physical geometry, independently of progress weights',async()=>{
  const objects=[{uid:'petite',type:'petite',x:0,y:0,thread:{id:'310'}},{uid:'long',type:'long_stitch',x1:0,y1:0,x2:3,y2:4,thread:{id:'310'}}];
  const m=A.snapshot({fabricCt:14,specialtyStitches:objects,specialtyDone:['petite','long']},prefs);
  expect(m['s:petite'].amounts[key]).toBeCloseTo(cost*.5,14);
  expect(m['s:long'].amounts[key]).toBeCloseTo(2*5*2/14/1890,14);
  await a.applyConsumptionEvents('p',{},[op(1,'mark','s:petite',m['s:petite']),op(1,'mark','s:long',m['s:long']),op(2,'unpick','s:petite'),op(3,'mark','s:petite',m['s:petite'])]);
  expect(await stock()).toBeCloseTo(1-cost-m['s:long'].amounts[key],14);expect(await history()).toHaveLength(4);
});
