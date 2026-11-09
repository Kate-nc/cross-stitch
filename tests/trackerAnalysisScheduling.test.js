const fs=require('fs'),vm=require('vm');
const source=fs.readFileSync('tracker-app.js','utf8');
const helper=source.slice(source.indexOf('function encodeAnalysisPattern('),source.indexOf('// Boundary of every cell'));
const create=new Function(helper+';return createTrackerAnalysisScheduler;')();
const workerSource=fs.readFileSync('analysis-worker.js','utf8');
function setup(){
  const workers=[],published=[];
  const createWorker=()=>{
    const ctx=vm.createContext({});vm.runInContext(workerSource,ctx);
    const w={messages:[],replies:[],terminated:false,postMessage(m,transfer){this.messages.push(structuredClone(m,{transfer:transfer||[]}));},terminate(){this.terminated=true;},run(){const messages=this.messages.splice(0);for(const m of messages)ctx.handleMessage(m,(msg)=>this.replies.push(structuredClone(msg)));},deliver(){for(const data of this.replies.splice(0))this.onmessage({data});}};
    workers.push(w);return w;
  };
  const scheduler=create(createWorker,x=>published.push(x));
  const snap={pat:Array.from({length:120},(_,i)=>({id:String(i%3)})),done:new Uint8Array(120),sW:12,sH:10,blockW:5,projectId:'a',demand:2};
  const update=over=>{Object.assign(snap,over);scheduler.update({...snap});};
  const settle=()=>{const w=workers.at(-1);w.run();w.deliver();};
  return{workers,published,scheduler,snap,update,settle};
}
beforeEach(()=>jest.useFakeTimers());afterEach(()=>jest.useRealTimers());
test('hidden features post nothing; activation immediately uses the newest marks',()=>{
 const x=setup();for(let i=0;i<20;i++){x.update({demand:0,done:Uint8Array.from({length:120},(_,j)=>j<i)});jest.advanceTimersByTime(650);}
 expect(x.workers).toHaveLength(0);expect(x.published).toHaveLength(0);
 x.update({demand:2});expect(x.workers[0].messages.map(m=>m.type)).toEqual(['setPattern','analyse']);x.settle();
 expect(x.published[0].result.perColour['0'].completedStitches).toBe(7);
});
test('rapid marks coalesce; superseded reply preserves statics but never publishes, including before the debounce',()=>{
 const x=setup();x.update({});const w=x.workers[0];w.run();
 for(let i=1;i<=15;i++)x.update({done:Uint8Array.from({length:120},(_,j)=>j<i)});
 expect(w.messages).toHaveLength(0);w.deliver();expect(x.published).toHaveLength(0);
 expect(w.messages).toHaveLength(1);expect(w.messages[0].done.reduce((a,b)=>a+b)).toBe(15);
 x.settle();expect(x.published).toHaveLength(1);expect(x.published[0].result.perStitch.clusterSize).toHaveLength(120);
 expect(x.published[0].result.perColour['0'].completedStitches).toBe(5);
 x.update({done:new Uint8Array(120)});x.update({done:new Uint8Array(120)});jest.advanceTimersByTime(499);expect(w.messages).toHaveLength(0);jest.advanceTimersByTime(1);expect(w.messages).toHaveLength(1);
});
test('static consumers reuse exact cluster arrays across marks and block size changes',()=>{
 const x=setup();x.update({demand:1});x.settle();const ps=x.published[0].result.perStitch;
 for(let i=0;i<10;i++){x.update({done:new Uint8Array(120),blockW:10});jest.advanceTimersByTime(650);}
 expect(x.workers[0].messages).toHaveLength(0);expect(x.published).toHaveLength(1);
 x.update({demand:2});x.settle();expect(x.published.at(-1).result.perStitch.clusterSize).toBe(ps.clusterSize);
 expect(x.published.at(-1).result.regionSize).toBe(10);
});
test('project replacement while a request overlaps cannot publish old arrays',()=>{
 const x=setup();x.update({});const old=x.workers[0];old.run();
 x.update({pat:Array.from({length:16},()=>({id:'new'})),done:new Uint8Array(16),sW:4,sH:4,projectId:'b'});
 old.deliver();expect(x.published).toHaveLength(0);expect(old.messages.map(m=>m.type)).toEqual(['setPattern','analyse']);x.settle();
 expect(Object.keys(x.published[0].result.perColour)).toEqual(['new']);expect(x.published[0].result.perStitch.clusterSize).toHaveLength(16);
});
test('turning demand off during work prevents reply UI updates; reactivation refreshes immediately',()=>{
 const x=setup();x.update({});x.workers[0].run();x.update({demand:0,done:new Uint8Array(120)});x.workers[0].deliver();expect(x.published).toHaveLength(0);
 x.update({demand:2});expect(x.workers[0].messages).toHaveLength(1);x.settle();expect(x.published).toHaveLength(1);
});
test('worker exceptions release flight; next input recreates worker and transfers pattern again',()=>{
 const x=setup();x.update({});const w=x.workers[0];w.run();w.onerror(new Error('crash'));expect(w.terminated).toBe(true);
 x.update({done:new Uint8Array(120)});jest.advanceTimersByTime(500);expect(x.workers).toHaveLength(2);w.deliver();expect(x.published).toHaveLength(0);x.settle();expect(x.published).toHaveLength(1);
});
test('protocol error drains newer work, ignores duplicate replies, and disposal cancels pending work',()=>{
 const x=setup();x.update({});const w=x.workers[0],id=w.messages.at(-1).requestId;w.messages=[];
 x.update({done:new Uint8Array(120)});w.onmessage({data:{type:'error',requestId:id}});expect(w.messages).toHaveLength(1);
 w.onmessage({data:{type:'error',requestId:id}});expect(w.messages).toHaveLength(1);
 x.scheduler.dispose();expect(w.terminated).toBe(true);jest.runAllTimers();expect(x.published).toHaveLength(0);
});
test('work-area filtering remains local; a region size change rejects the old result',()=>{
 expect(source).toContain('window.WorkArea.sectionRange(workArea,_recSize,_recSize)');
 expect(source).toContain('[analysisDynamic,analysisResult,pat,recDismissed,areaOn,workArea,blockW,blockH]');
 const x=setup();x.update({});x.workers[0].run();x.update({blockW:10});x.workers[0].deliver();expect(x.published).toHaveLength(0);x.settle();expect(x.published[0].result.regionSize).toBe(10);
});
test('changing work area immediately reranks existing exact region results without a worker request',()=>{
 const start=source.indexOf('const recommendations=useMemo('),end=source.indexOf('// ── Focus block helper',start);
 const derive=new Function('useMemo','analysisDynamic','analysisResult','pat','recDismissed','areaOn','workArea','blockW','blockH','window',source.slice(start,end)+';return recommendations;');
 const x=setup();x.update({});x.settle();const result=x.published[0].result;
 const get=area=>derive(f=>f(),true,result,x.snap.pat,new Set(),true,area,5,5,{WorkArea:{sectionRange:a=>a}});
 const left=get({bx0:0,bx1:1,by0:0,by1:2}),right=get({bx0:2,bx1:3,by0:0,by1:2});
 expect(left.top.length).toBeGreaterThan(0);expect(right.top.length).toBeGreaterThan(0);
 expect(left.top.every(r=>r.idx%result.regionCols===0)).toBe(true);expect(right.top.every(r=>r.idx%result.regionCols===2)).toBe(true);
 expect(x.workers[0].messages).toHaveLength(0);
});
test('activating dynamic consumption during a static request publishes matching data, not a lost cached reply',()=>{
 const x=setup();x.update({demand:1});x.workers[0].run();x.update({demand:2});x.workers[0].deliver();
 expect(x.published).toHaveLength(1);expect(x.published[0].demand).toBe(2);expect(x.workers[0].messages).toHaveLength(0);
});
test('same-input hide/show during a request can use its exact reply',()=>{
 const x=setup();x.update({});x.workers[0].run();x.update({demand:0});x.update({demand:2});x.workers[0].deliver();expect(x.published).toHaveLength(1);
});
