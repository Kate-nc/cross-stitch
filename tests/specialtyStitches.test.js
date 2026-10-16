const PU=require('../progress-units');
const S=PU.specialty;
const thread={id:'310',brand:'dmc',type:'solid',rgb:[0,0,0]};
const petite=(uid='p')=>({uid,type:'petite',x:0.5,y:0.5,thread});
const long=(uid='l')=>({uid,type:'long_stitch',x1:0,y1:0,x2:2,y2:2,thread});
const project=(objects,marks=[])=>({version:11,specialtyVersion:1,settings:{sW:2,sH:2},pattern:[thread,{id:'__skip__'},{id:'__skip__'},{id:'__skip__'}],done:[1,0,0,0],specialtyStitches:objects,specialtyDone:marks});

test('overlapping objects and the full cross count independently, once per object ID',()=>{
 const p=project([petite(),petite('p2'),long()],['p','p','l','deleted']);
 const r=PU.fromProject(p);
 expect(r.totalUnits).toBe(2);expect(r.doneUnits).toBe(1.75);expect(r.percent).toBe(87.5);expect(r.complete).toBe(false);
 p.specialtyDone.push('p2');expect(PU.fromProject(p).complete).toBe(true);
 expect(PU.colourProgress(PU.coloursFromProject(p)['310'])).toMatchObject({doneUnits:2,totalUnits:2});
 expect(PU.fromProject(p,{include:['full']})).toMatchObject({doneUnits:1,totalUnits:1});
});
test('identity survives JSON round trips, coordinate/thread edits, deletion, reorder and resize',()=>{
 const objects=S.normalise([petite(),long()],2,2);
 const saved=JSON.parse(JSON.stringify(project(objects,['l'])));
 expect(S.normalise(saved.specialtyStitches,2,2)).toEqual(objects);
 const moved=S.offset(objects,1,0,3,2);
 expect(moved.map(o=>o.uid)).toEqual(['p','l']);
 expect(S.live(saved.specialtyDone,moved)).toEqual(['l']);
 expect(S.live(['p','l','missing'],S.offset(objects,0,0,1,1))).toEqual(['p']);
 expect(S.normalise(objects.slice().reverse(),2,2).map(o=>o.uid)).toEqual(['l','p']);
 expect(S.normalise([{...objects[0],thread:{...thread,id:'666',rgb:[200,0,0]}}],2,2)[0].uid).toBe('p');
});
test('missing and colliding IDs receive deterministic unique persisted identities',()=>{
 const input=[petite(),petite(),{...long(),uid:null},{...long(),uid:'specialty-legacy-2'}];
 const a=S.normalise(input,2,2);expect(new Set(a.map(o=>o.uid)).size).toBe(4);
 expect(S.normalise(input,2,2)).toEqual(a);expect(S.normalise(JSON.parse(JSON.stringify(a)),2,2)).toEqual(a);
 expect(S.live(['p'],a)).toEqual(['p']);
});
test.each([
 [{...petite(),x:2},false],[{...petite(),x:1.5,y:1.5},true],
 [{...petite(),x:-0.5},false],[{...petite(),x:0.25},false],
 [{...long(),x2:2,y2:0},true],[{...long(),x2:2.5},false],
 [{...long(),x2:0,y2:0},false],[{...long(),x1:NaN},false],
 [{...long(),x1:'0'},false],[{...long(),thread:{id:'310'}},false]
])('strict geometry validates boundaries and thread data: %j',(o,valid)=>expect(S.valid(o,2,2)).toBe(valid));
test('legacy v8-v11 projects are unchanged; old petite cell spelling migrates once without a full-cross duplicate',()=>{
 for(const v of [8,9,10,11]){const p={...project([]),version:v};delete p.specialtyVersion;delete p.specialtyStitches;expect(S.migrate(p)).toBe(p);expect(PU.fromProject(p).totalUnits).toBe(1);}
 const p=project([]);delete p.specialtyVersion;p.pattern[0]={...thread,type:'petite'};
 const m=S.migrate(p);expect(m.pattern[0].id).toBe('__skip__');expect(m.done[0]).toBe(0);expect(m.specialtyDone).toEqual(['legacy-petite-cell-0']);expect(S.migrate(m)).toBe(m);
 expect(PU.fromProject(p)).toMatchObject({totalUnits:0.25,doneUnits:0.25,complete:true});
 expect(p.pattern[0].type).toBe('petite');
});
test('rendering hides objects in both the visible path and their selection outline',()=>{
 const ctx={save:jest.fn(),restore:jest.fn(),beginPath:jest.fn(),moveTo:jest.fn(),lineTo:jest.fn(),stroke:jest.fn(),setLineDash:jest.fn(),strokeRect:jest.fn()};
 S.draw(ctx,[petite(),long()],[],0,0,20,{petite:false,long_stitch:false},'p');
 expect(ctx.stroke).not.toHaveBeenCalled();expect(ctx.strokeRect).not.toHaveBeenCalled();
 S.draw(ctx,[petite(),long()],['l'],0,0,20,null,'p');expect(ctx.stroke).toHaveBeenCalledTimes(3);expect(ctx.strokeRect).toHaveBeenCalledTimes(1);
});
test('unpick includes only wholly contained specialty geometry, respects colour lock, and weighs each object',()=>{
 const U=require('../unpick');const p=U.plan({sW:2,sH:2,set:new Set([0]),specialtyStitches:[petite(),long()],specialtyDone:['p','l']});
 expect(p.specialty).toEqual(['p']);expect(p.units).toBe(0.25);expect(p.stitches).toBe(1);
 expect(U.plan({sW:2,sH:2,set:new Set([0,1,2,3]),specialtyStitches:[petite(),long()],specialtyDone:['p','l']}).units).toBe(0.75);
 expect(U.plan({sW:2,sH:2,set:new Set([0]),specialtyStitches:[petite()],specialtyDone:['p'],lockId:'666'}).empty).toBe(true);
});
test('sync retains unmark tombstones and does not conflate overlapping IDs',()=>{
 const T=require('../tracking-sync');const base=project([petite(),petite('p2')],['p']);
 const unmarked=T.record(base,{...base,specialtyDone:[]},'a');
 const marked=T.record(base,{...base,specialtyDone:['p','p2']},'b');
 expect(T.merge(unmarked,marked).specialtyDone).toEqual(['p2']);
});
test('PDF extraction refuses a petite label with no subcell geometry',()=>{
 const {materialiseProject}=require('../import-engine/pipeline/materialise');
 expect(()=>materialiseProject({width:2,height:2,cells:[{row:0,col:0,code:'310',type:'petite'}]})).toThrow(/explicit geometry/);
});

test('future schema versions fail explicitly and before editing data',()=>{
 expect(()=>S.read({...project([petite()]),specialtyVersion:2},2,2)).toThrow(/Unsupported.*version 2/);
});
test('PDF facade retains objects and rejects unsupported output before spawning its worker',async()=>{
 const fs=require('fs');const win={};const Worker=jest.fn(()=>{throw new Error('should not spawn');});
 new Function('window','Worker',fs.readFileSync(require.resolve('../creator/pdfExport.js'),'utf8'))(win,Worker);
 const exported=win.PdfExport.buildExportProject({pat:[thread],pal:[thread],sW:1,sH:1,specialtyStitches:[petite()]});
 expect(exported.specialtyStitches).toEqual([petite()]);
 await expect(win.PdfExport.runExport(exported,{})).rejects.toThrow(/PDF export does not support petite or long stitches/);
 expect(Worker).not.toHaveBeenCalled();
});

test('old catalogue-only petite cells recover their RGB before geometric validation',()=>{
 const saved=global.restoreStitch;global.restoreStitch=c=>({...c,rgb:[0,0,0]});
 try{const p=project([]);delete p.specialtyVersion;p.pattern[0]={id:'310',type:'petite'};expect(PU.fromProject(p).totalUnits).toBe(0.25);}
 finally{if(saved)global.restoreStitch=saved;else delete global.restoreStitch;}
});

test('object-only colour rows show their actual counts rather than a 0/0 full-cross label',()=>{
 const fs=require('fs'),src=fs.readFileSync(require.resolve('../tracker-app.js'),'utf8');
 const start=src.indexOf('function legendCountText('),end=src.indexOf('\nconst legendRows=',start);
 const label=new Function(src.slice(start,end)+';return legendCountText;')();
 expect(label({total:0,done:0,petiteTotal:2,petiteDone:1,longTotal:1,longDone:1})).toBe('1/2 petite · 1/1 long stitch');
});
