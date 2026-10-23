const {A,bridge,store,op,cost:consumptionCost,key,prefs,clone}=require('./support/consumption-harness');
const R=require('../material-reservations');
// Independent planning benchmark: 1 aggregate inch/cross, 20%, 48 m/skein.
const cost=1.2/(48/0.0254);
const FDBFactory=require('fake-indexeddb/lib/FDBFactory');
const project=(id,n=100)=>({id,name:id,settings:{fabricCt:14,wastePrefs:prefs},pattern:Array.from({length:n},()=>({id:'310',brand:'dmc'})),done:null});
const request=(extra={})=>({enabled:true,limits:{},substitutions:{},revision:0,...extra});
const requests=(...ids)=>({version:1,projects:Object.fromEntries(ids.map(id=>[id,request()]))});

test('substituting a longer skein converts material length before purchases and preserves accounting units',()=>{
 const p=project('p',5000);
 const intent=request({substitutions:{[key]:{key:'madeira:1000',confirmed:true}}});
 const r=R.plan({}, {version:1,projects:{p:intent}},[p]);
 expect(r.groups[0].rows[0].estimatedNeeded).toBeCloseTo(2.54,12);
 expect(r.groups[0].rows[0].skeinLengthM).toBe(10);
 expect(r.combined[0].buySkeins).toBe(3);
 // Event remapping keeps historical model-2 quantities unchanged.
 expect(R.remap({[key]:3.175},intent)['madeira:1000']).toBe(3.175);
});

test('shorter-skein replacements and shared replacement identities conserve material length',()=>{
 const p=project('p',5000);p.pattern=p.pattern.map(t=>({...t,brand:'madeira',id:'1000'}));
 const intent=request({substitutions:{'madeira:1000':{key,confirmed:true}}});
 const r=R.plan({}, {version:1,projects:{p:intent}},[p]);
 expect(r.groups[0].rows[0].estimatedNeeded).toBeCloseTo(3.175,12);
 expect(r.combined[0].buySkeins).toBe(4);
 const merged=R.remap({[key]:1,'madeira:1000':1},request({substitutions:{[key]:{key:'madeira:1000',confirmed:true}}}),true);
 expect(merged['madeira:1000']).toBeCloseTo(1.8,12);
});
let idb,projects,a,b;
beforeEach(async()=>{
 idb=new FDBFactory();projects=[project('p'),project('q')];
 const win=()=>({MaterialReservations:R,ProjectStorage:{listProjects:async()=>projects.map(p=>({id:p.id})),get:async id=>projects.find(p=>p.id===id)}});
 a=bridge(idb,win());b=bridge(idb,win());await store(idb,{threads:{[key]:{owned:0,partialStatus:'about-half'}},schema_version:3});
});
test('several projects share fractional stock once; combined purchases round only after summing',()=>{
 const ps=[project('q',1000),project('p',1000),project('r',1000)];const r=R.plan({[key]:{owned:0,partialStatus:'about-half'}},requests('p','q','r'),ps,prefs);
 expect(r.groups.map(g=>g.id)).toEqual(['p','q','r']);expect(r.reserved[key]).toBeCloseTo(.5,14);expect(r.available[key]).toBe(0);
 expect(r.groups[0].rows[0].reserved).toBeCloseTo(.5,14);expect(r.groups[1].rows[0].reserved).toBe(0);expect(r.groups[2].rows[0].reserved).toBe(0);
 expect(r.combined[0].shortage).toBeCloseTo(3000*cost-.5,12);expect(r.combined[0].buySkeins).toBe(2);
});
test('reserving, adjusting and releasing never debit stock or create consumption history',async()=>{
 const original=(await store(idb)).threads;
 let p=await a.projectMaterials('p',request());expect(p.groups[0].rows[0].reserved).toBeCloseTo(100*cost,14);
 p=await a.projectMaterials('p',{...p.groups[0].request,limits:{[key]:.01}});expect(p.groups[0].rows[0].reserved).toBe(.01);
 await a.projectMaterials('p',{...p.groups[0].request,enabled:false});
 expect((await store(idb)).threads).toEqual(original);expect((await store(idb))[A.KEY]).toBeUndefined();
});
test('concurrent tabs reserve separate projects without claiming the same stock twice',async()=>{
 projects=projects.map(p=>project(p.id,1000));
 await Promise.all([a.projectMaterials('p',request()),b.projectMaterials('q',request())]);
 const p=await a.projectMaterials();expect(p.reserved[key]).toBeCloseTo(.5,14);expect(p.available[key]).toBe(0);
 await expect(b.projectMaterials('p',request())).rejects.toThrow('another tab');
});
test('changed estimates, marked units and lifecycle states immediately release excess claims',async()=>{
 await a.projectMaterials('p',request());projects[0]=project('p',10);
 expect((await a.projectMaterials()).groups[0].rows[0].reserved).toBeCloseTo(10*cost,14);
 projects[0].done=Array(10).fill(1);expect((await a.projectMaterials()).groups[0].rows).toEqual([]);
 for(const status of ['completed','UFO','archived','abandoned']){
  projects[0]=project('p');projects[0].finishStatus=status;expect((await a.projectMaterials()).groups.map(g=>g.id)).toEqual(['q']);
 }
 expect((await store(idb))[R.KEY].projects.p.enabled).toBe(false);
 projects=projects.filter(p=>p.id!=='p');expect((await a.projectMaterials()).groups).toHaveLength(1);
});
test('purchases satisfy recalculated shortages and cannot leave a stale purchase row',async()=>{
 projects=[project('p',2000)];await a.projectMaterials('p',request());expect((await a.projectMaterials()).combined).toHaveLength(1);
 await a.addToStash(key,1);expect((await a.projectMaterials()).combined).toEqual([]);
 projects=[];expect((await a.projectMaterials()).combined).toEqual([]);
});
test('unreserved free stock covers only one project shopping allocation',()=>{
 const ps=[project('p',1000),project('q',1000)];const p=R.plan({[key]:{owned:.5}},R.empty(),ps,prefs);
 expect(p.combined[0].shortage).toBeCloseTo(2000*cost-.5,12);expect(p.reserved[key]).toBe(0);
});
test('brands stay distinct; confirmed substitutions deduplicate into the actual purchasing identity',async()=>{
 projects[1].pattern=projects[1].pattern.map(t=>({...t,brand:'anchor'}));
 const sub=request({substitutions:{[key]:{key:'anchor:310',confirmed:true}}});
 await a.projectMaterials('p',sub);const p=await a.projectMaterials();
 expect(p.combined.map(r=>r.key)).toEqual(['anchor:310']);expect(p.combined[0].shortage).toBeCloseTo(200*cost,14);
 const bad=request({substitutions:{[key]:{key:'anchor:310',confirmed:false}}});expect(()=>R.validate({version:1,projects:{p:bad}})).toThrow('confirmation');
});
test('stitching cannot consume another project reservation; own stock and corrections remain accounting events',async()=>{
 projects=[project('p',2000),project('q')];await a.projectMaterials('p',request());
 await b.applyConsumptionEvents('q',{},[op(1,'mark','d:0',undefined,'q')]);
 expect(A.quantity((await store(idb)).threads[key])).toBe(.5);
 expect(Object.values((await store(idb))[A.KEY].events)[0].debit[key]).toBe(0);
 await a.applyConsumptionEvents('p',{},[op(1)]);expect(A.quantity((await store(idb)).threads[key])).toBeCloseTo(.5-consumptionCost,14);
 await a.applyConsumptionEvents('p',{},[op(2,'correction')]);expect(A.quantity((await store(idb)).threads[key])).toBeCloseTo(.5,14);
});
test('confirmed replacement consumption and correction use replacement stock without rewriting original chart',async()=>{
 await store(idb,{threads:{[key]:{owned:1},'anchor:310':{owned:1}}});
 await a.projectMaterials('p',request({substitutions:{[key]:{key:'anchor:310',confirmed:true}}}));
 await a.applyConsumptionEvents('p',{},[op(1)]);let data=await store(idb);
 expect(data.threads[key].owned).toBe(1);expect(data.threads['anchor:310'].owned).toBeCloseTo(1-consumptionCost,14);A.validate(data[A.KEY]);
 await a.applyConsumptionEvents('p',{},[op(2,'correction')]);expect((await store(idb)).threads['anchor:310'].owned).toBeCloseTo(1,14);
});
test('fractional, blends, lines, over-two and dimensions use unrounded single-strand inch accounting',()=>{
 const p=project('p',1);p.pattern=[{id:'310+403',type:'blend',threads:[{id:'310',brand:'dmc'},{id:'403',brand:'anchor'}],blendRatio:[1,3]}];
 let needed=R.estimate(p,prefs);expect(needed[key]).toBeCloseTo(cost/2,14);expect(needed['anchor:403']).toBeCloseTo(cost*3/2,14);
 p.settings.fabricCt=28;expect(R.estimate(p,prefs)).toEqual(needed);
 const q={id:'q',settings:{fabricCt:14},halfStitches:[[0,{fwd:{id:'310'}}]],partialStitches:[[1,{TL:{id:'310'}}]],bsLines:[{x1:0,y1:0,x2:3,y2:4,colorId:'310'}]};
 expect(R.estimate(q,prefs)[key]).toBeCloseTo(cost*.75+10/14/(48/0.0254)*1.2,14);
 q.halfDone=[[0,{fwd:true}]];expect(R.estimate(q,prefs)[key]).toBeCloseTo(cost*.25+10/14/(48/0.0254)*1.2,14);
});
test('old stash migration preserves partial skeins and legacy shopping flags exactly',async()=>{
 const legacy={'310':{owned:2,partialStatus:'remnant',tobuy:true,tobuy_qty:3}};
 await store(idb,{threads:legacy,schema_version:3});const p=await a.projectMaterials();
 expect((await store(idb)).threads).toEqual({[key]:legacy['310']});expect(p.reserved[key]).toBe(0);
});
test('invalid quantities and malformed reservation records abort without modifying stock',async()=>{
 const old=await store(idb);
 for(const n of [-1,NaN,Infinity])await expect(a.projectMaterials('p',request({limits:{[key]:n}}))).rejects.toThrow('quantity');
 expect((await store(idb)).threads).toEqual(old.threads);
});
test('compressed backup and staged restore preserve stock, claims and resulting shopping lists',async()=>{
 const {load}=require('./setup/backup-harness');
 await a.projectMaterials('p',request({limits:{[key]:.01}}));const original=await store(idb);
 const source=load(idb,{ThreadAccounting:A,MaterialReservations:R});
 const backup=await source.api.createBackup(),file=source.api.serializeBackupFile(backup,{compressed:true});
 const dest=load(undefined,{ThreadAccounting:A,MaterialReservations:R});await dest.api.createBackup();
 await dest.api.restore(dest.api.parseBackupText(file.text));const restored=await store(dest.idb);
 expect(restored[R.KEY]).toEqual(original[R.KEY]);expect(restored.threads).toEqual(original.threads);
 expect(R.plan(restored.threads,restored[R.KEY],projects,prefs)).toEqual(R.plan(original.threads,original[R.KEY],projects,prefs));
 expect((await dest.api.restore(backup)).unchanged).toBe(true);
});
test('bug hunt: archived dashboard states and completed dashboard states release claims',()=>{
 for(const state of ['paused','complete'])expect(R.plan({[key]:{owned:1}},requests('p'),[{...project('p'),materialState:state}],prefs).groups).toEqual([]);
});
test('bug hunt: concurrent stitching cannot overdraw stock protected for a third project',async()=>{
 projects=[project('p',1000),project('q',1000),project('r',1000)];await a.projectMaterials('p',request());
 const large={...require('./support/consumption-harness').estimate,amounts:{[key]:.5}};
 await Promise.all([a.applyConsumptionEvents('q',{},[op(1,'mark','d:0',large,'q')]),b.applyConsumptionEvents('r',{},[op(1,'mark','d:0',large,'r')])]);
 const data=await store(idb);expect(A.quantity(data.threads[key])).toBeCloseTo(.5,12);A.validate(data[A.KEY]);
 expect((await a.projectMaterials()).available[key]).toBeGreaterThanOrEqual(0);
});
test('bug hunt: corrections return the recorded replacement after the substitution was removed',async()=>{
 await store(idb,{threads:{[key]:{owned:1},'anchor:310':{owned:1}}});
 let p=await a.projectMaterials('p',request({substitutions:{[key]:{key:'anchor:310',confirmed:true}}}));
 await a.applyConsumptionEvents('p',{},[op(1)]);
 await a.projectMaterials('p',{...p.groups[0].request,substitutions:{}});
 await a.applyConsumptionEvents('p',{},[op(2,'correction')]);
 const data=await store(idb);expect(data.threads['anchor:310'].owned).toBeCloseTo(1,14);expect(data.threads[key].owned).toBe(1);A.validate(data[A.KEY]);
});
test('bug hunt: many source colours confirmed as one replacement make one purchase row',()=>{
 const p=project('p',2);p.pattern[1]={id:'550'};
 const r=request({substitutions:{[key]:{key:'anchor:403',confirmed:true},'dmc:550':{key:'anchor:403',confirmed:true}}});
 const plan=R.plan({}, {version:1,projects:{p:r}},[p],prefs);expect(plan.combined).toHaveLength(1);expect(plan.combined[0].shortage).toBeCloseTo(cost*2,14);expect(plan.combined[0].buySkeins).toBe(1);
});
test('custom catalogue identities retain slug digits, case, spaces, leading zeros and Unicode',async()=>{
 projects=[project('p',1)];projects[0].pattern=[{id:'001 É+Red',brand:'hand-dyed-2',type:'solid'}];
 const custom='hand-dyed-2:001 É+Red';await store(idb,{threads:{[custom]:{owned:1}}});
 const p=await a.projectMaterials('p',request());expect(p.groups[0].rows[0].key).toBe(custom);
 expect(p.groups[0].rows[0].reserved).toBeCloseTo(cost,14);
 const estimate=A.snapshot({...projects[0],done:[1]},prefs)['d:0'];
 await a.applyConsumptionEvents('p',{},[op(1,'mark','d:0',estimate)]);
 const data=await store(idb);expect(data.threads[custom].owned).toBeCloseTo(1-consumptionCost,14);A.validate(data[A.KEY]);
});
test('no reservations means consumption does not hydrate or estimate the project library',async()=>{
 const c=bridge(idb,{MaterialReservations:R,ProjectStorage:{listProjects(){throw Error('must not hydrate');}}});
 await expect(c.applyConsumptionEvents('p',{},[op(1)])).resolves.toBeDefined();
});
test('legacy compact charts estimate original brands and skip markers without losing fractional needs',()=>{
 const p={id:'old',fc:14,settings:{threadBrand:'anchor'},p:[['403'],['','k'],['403+404','b']],done:[0,0,1]};
 expect(R.estimate(p,prefs)).toEqual({'anchor:403':cost});
});
test('malformed stored reservations fail promptly instead of hanging consumption',async()=>{
 await store(idb,{[R.KEY]:{version:99}});await expect(a.applyConsumptionEvents('p',{},[op(1)])).rejects.toThrow('Invalid material');
 expect((await store(idb))[A.KEY]).toBeUndefined();
});
test('backup retires local-only dashboard archive state so restore cannot reactivate its claims',async()=>{
 await a.projectMaterials('p',request());
 const c=bridge(idb,{MaterialReservations:R,ProjectStorage:{listProjects:async()=>projects,get:async id=>projects.find(p=>p.id===id),getProjectStates:()=>({p:'paused'})}});
 const {load}=require('./setup/backup-harness');
 const source=load(idb,{ThreadAccounting:A,MaterialReservations:R,StashBridge:c,ProjectStorage:{}});
 const backup=await source.api.createBackup();const row=backup.databases.stitch_manager_db.manager_state.find(e=>e.key===R.KEY);
 expect(row.value.projects.p.enabled).toBe(false);
 const dest=load(undefined,{ThreadAccounting:A,MaterialReservations:R});await dest.api.createBackup();await dest.api.restore(backup);
 const restored=await store(dest.idb);expect(R.plan(restored.threads,restored[R.KEY],projects,prefs).reserved[key]).toBe(0);
});
test('invalid estimates cannot produce non-finite portable shopping quantities',()=>{
 const p=project('p',1);p.settings.fabricCt=1e-320;expect(()=>R.estimate(p,prefs)).toThrow('Cannot estimate');
});
test('sync keeps identical reservation intent, accepts old stash and rejects competing plans',()=>{
 const {syncEngine}=require('./support/consumption-harness');const se=syncEngine({ThreadAccounting:A,MaterialReservations:R},idb);
 const local={threads:{[key]:{owned:.5}},[R.KEY]:requests('p')};
 expect(se.mergeStash(local,clone(local))[R.KEY]).toEqual(local[R.KEY]);
 expect(se.mergeStash(local,{threads:{}})[R.KEY]).toEqual(local[R.KEY]);
 const remote=clone(local);remote[R.KEY].projects.p.limits[key]=.01;
 expect(()=>se.mergeStash(local,remote)).toThrow('Conflicting project reservations');
});
test('a claim enabled between hydration and consumption aborts for retry without debit',async()=>{
 projects=[project('p',2000),project('q')];const read=a.getMaterialReservationRequests.bind(a);
 a.getMaterialReservationRequests=async()=>{const r=await read();await b.projectMaterials('p',request());return r;};
 await expect(a.applyConsumptionEvents('q',{},[op(1,'mark','d:0',undefined,'q')])).rejects.toThrow('Retry');
 expect((await store(idb))[A.KEY]).toBeUndefined();expect(A.quantity((await store(idb)).threads[key])).toBe(.5);
 a.getMaterialReservationRequests=read;await a.applyConsumptionEvents('q',{},[op(1,'mark','d:0',undefined,'q')]);
 expect(A.quantity((await store(idb)).threads[key])).toBe(.5);
});
