/* Exact old effects vs new scheduler, with a controlled clock and worker
   protocol running in a Node vm. Clone and execution timings are isolated
   Node costs, NOT browser postMessage/worker scheduling or user latency. */
const fs=require('fs'),vm=require('vm'),{execFileSync}=require('child_process');
const old=execFileSync('git',['show','08c78b4fa3d6e02974eacc43cc7b4cbc004c64c5:tracker-app.js'],{encoding:'utf8'});
const current=fs.readFileSync('tracker-app.js','utf8'),workerSource=fs.readFileSync('analysis-worker.js','utf8');
const pat=Array.from({length:200000},(_,i)=>({id:String(i%60)}));
function run(after,demand){
 let timer=0;const timers=new Map(),workers=[],published=[];
 const costs={analyses:0,patternTransfers:0,updates:0,workerMs:0,outCloneMs:0,inCloneMs:0};
 const scope={Uint8Array,Uint16Array,Map,Set,Object,clearTimeout:id=>timers.delete(id),setTimeout:fn=>{timers.set(++timer,fn);return timer;}};
 function flush(){const a=[...timers.values()];timers.clear();a.forEach(f=>f());for(const w of workers)w.run();}
 scope.Worker=class{constructor(){this.queue=[];this.ctx=vm.createContext({});vm.runInContext(workerSource,this.ctx);workers.push(this);}postMessage(msg,transfer){const t=performance.now();this.queue.push(structuredClone(msg,{transfer:transfer||[]}));costs.outCloneMs+=performance.now()-t;if(msg.type==='analyse')costs.analyses++;if(msg.type==='setPattern')costs.patternTransfers++;}terminate(){}run(){for(const msg of this.queue.splice(0)){const t=performance.now();let cloneMs=0;const replies=[];this.ctx.handleMessage(msg,(m)=>{const c=performance.now();const data=structuredClone(m);cloneMs+=performance.now()-c;replies.push(data);});costs.workerMs+=performance.now()-t-cloneMs;costs.inCloneMs+=cloneMs;for(const data of replies)if(this.onmessage)this.onmessage({data});}}};
 vm.createContext(scope);
 let update;
 if(after){vm.runInContext(current.slice(current.indexOf('function encodeAnalysisPattern('),current.indexOf('// Boundary of every cell')),scope);const scheduler=scope.createTrackerAnalysisScheduler(()=>new scope.Worker(),x=>{costs.updates++;published.push(x);});update=done=>scheduler.update({pat,done,sW:400,sH:500,blockW:10,projectId:'a',demand});}
 else{
  const refs={analysisWorkerRef:null,analysisRequestIdRef:0,analysisThrottleRef:null,analysisPatternRef:{pat:null,worker:null,id:0,sW:0,sH:0},analysisStaticsRef:{id:-1,perStitch:null},analysisPostedDoneRef:null};
  for(const [k,v]of Object.entries(refs))scope[k]={current:v};scope.setAnalysisResult=x=>{costs.updates++;published.push(x);};let running=false;scope.setAnalysisRunning=x=>{if(x!==running){costs.updates++;running=x;}};
  vm.runInContext(old.slice(old.indexOf('function encodeAnalysisPattern('),old.indexOf('// Boundary of every cell')),scope);
  const effects=old.slice(old.indexOf('// ═══ Analysis worker lifecycle'),old.indexOf('// Derived recommendations'));
  update=done=>{scope.pat=pat;scope.done=done;scope.sW=400;scope.sH=500;scope.blockW=10;const fx=[];scope.useEffect=fn=>fx.push(fn);vm.runInContext(effects,scope);if(!workers.length)fx[0]();fx[1]();};
 }
 let done=new Uint8Array(200000);for(let i=0;i<done.length;i++)done[i]=i%2;
 update(done);flush();const startup={...costs};for(const k of Object.keys(costs))costs[k]=0;
 for(let i=0;i<30;i++){done=done.slice();done[i]=1-done[i];update(done);flush();}
 return{startup,steady30Marks:costs,published:published.length};
}
const out={environment:'Node '+process.version+'; controlled debounce clock, vm worker protocol, structuredClone. No browser rendering, storage, worker scheduling or interaction latency.',before:run(false,0),afterInactive:run(true,0),afterStatic:run(true,1),afterDynamic:run(true,2)};
fs.writeFileSync('reports/track-mode-baseline/analysis-node.json',JSON.stringify(out,null,2));console.log(JSON.stringify(out,null,2));
