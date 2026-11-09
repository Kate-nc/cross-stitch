// Run the real scheduler, worker protocol, recommendation memo and completion
// effect together. Deliberately hold worker replies beyond the completion delay.
const fs=require('fs'),vm=require('vm');
const source=fs.readFileSync('tracker-app.js','utf8');
const helper=source.slice(source.indexOf('function encodeAnalysisPattern('),source.indexOf('// Boundary of every cell'));
const create=new Function(helper+';return createTrackerAnalysisScheduler;')();
const recommendationSource=source.slice(source.indexOf('const recommendations=useMemo('),source.indexOf('// ── Focus block helper'));
const completionSource=source.slice(source.indexOf('// ── Block auto-advance effect'),source.indexOf('statsSessionsLiveRef.current=statsSessionsRef.current;'));
const countSource=source.slice(source.indexOf('function _isFocusBlockComplete('),source.indexOf('// The sections Spotlight may visit'));
function setup(style='block'){
  const workerScope=vm.createContext({});vm.runInContext(fs.readFileSync('analysis-worker.js','utf8'),workerScope);
  const w={queue:[],postMessage(msg){this.queue.push(structuredClone(msg));},terminate(){},deliver(){for(const msg of this.queue.splice(0))workerScope.handleMessage(msg,data=>this.onmessage({data}));}};
  let cleanup,envelope=null;
  const nextFocus=jest.fn(),toast=jest.fn();
  const s={pat:Array.from({length:200},()=>({id:'310'})),done:Uint8Array.from({length:200},(_,i)=>i%20<10&&i!==189?1:0),sW:20,sH:10,blockW:10,blockH:10,
    focusBlock:{bx:0,by:0},focusEnabled:true,stitchingStyle:style,parkMarkers:[],countsVer:0,statsSessions:[],breadcrumbs:[],recDismissed:new Set(),areaOn:false,workArea:null,
    prevFocusBlockDoneRef:{current:false},blockAdvanceTimerRef:{current:null},analysisDynamic:true,analysisResult:null,
    setTimeout,clearTimeout,Date,useMemo:f=>f(),useEffect:f=>{cleanup=f();},window:{},
    setBreadcrumbs:f=>{s.breadcrumbs=f(s.breadcrumbs);},setBlockAdvanceToast:toast,setFocusBlock:nextFocus,_getRoyalRowsNext:()=>({bx:1,by:0})};
  vm.createContext(s);vm.runInContext(countSource,s);
  const scheduler=create(()=>w,value=>{envelope=value;render();});
  function render(){
    if(cleanup)cleanup();
    s.analysisResult=envelope&&envelope.snapshot.done===s.done?envelope.result:null;
    vm.runInContext(recommendationSource.replace('const recommendations=','recommendations='),s);
    vm.runInContext(completionSource,s);
  }
  function update(done){s.done=done;s.countsVer++;scheduler.update({pat:s.pat,done,sW:20,sH:10,blockW:10,projectId:'a',demand:style==='royal'?0:2});render();}
  update(s.done);if(style!=='royal')w.deliver();
  return{s,w,update,render,nextFocus,toast,complete(){const done=s.done.slice();done[189]=1;update(done);},dispose(){if(cleanup)cleanup();scheduler.dispose();}};
}
beforeEach(()=>jest.useFakeTimers());afterEach(()=>{jest.clearAllTimers();jest.useRealTimers();});
test('delayed analysis does not consume completion; its fresh reply advances exactly once',()=>{
 const x=setup();x.complete();jest.advanceTimersByTime(1200);
 expect(x.s.breadcrumbs).toHaveLength(0);expect(x.toast).not.toHaveBeenCalled();expect(x.s.prevFocusBlockDoneRef.current).toBe(false);
 x.w.deliver();jest.advanceTimersByTime(500);
 expect(x.s.breadcrumbs).toHaveLength(1);expect(x.toast).toHaveBeenLastCalledWith(expect.objectContaining({next:{bx:1,by:0}}));
 x.render();jest.advanceTimersByTime(1500);expect(x.nextFocus).toHaveBeenCalledTimes(1);expect(x.nextFocus).toHaveBeenCalledWith({bx:1,by:0});
 x.render();jest.advanceTimersByTime(3000);expect(x.s.breadcrumbs).toHaveLength(1);expect(x.nextFocus).toHaveBeenCalledTimes(1);x.dispose();
});
test('undo while waiting cancels completion, including a superseded worker reply',()=>{
 const x=setup();x.complete();jest.advanceTimersByTime(700);
 const undone=x.s.done.slice();undone[189]=0;x.update(undone);x.w.deliver();x.w.deliver();jest.advanceTimersByTime(3000);
 expect(x.s.breadcrumbs).toHaveLength(0);expect(x.toast).not.toHaveBeenCalled();expect(x.nextFocus).not.toHaveBeenCalled();expect(x.s.prevFocusBlockDoneRef.current).toBe(false);x.dispose();
});
test('Royal Rows completion remains independent of analysis',()=>{
 const x=setup('royal');x.complete();jest.advanceTimersByTime(500);expect(x.s.breadcrumbs).toHaveLength(1);expect(x.w.queue).toHaveLength(0);
 jest.advanceTimersByTime(1500);expect(x.nextFocus).toHaveBeenCalledWith({bx:1,by:0});x.dispose();
});
test('fresh analysis with no remaining section records completion without a destination',()=>{
 const x=setup();x.update(new Uint8Array(200).fill(1));jest.advanceTimersByTime(1200);expect(x.s.breadcrumbs).toHaveLength(0);
 x.w.deliver();jest.advanceTimersByTime(500);expect(x.s.breadcrumbs).toHaveLength(1);expect(x.toast).toHaveBeenLastCalledWith(expect.objectContaining({next:null}));
 jest.advanceTimersByTime(1500);expect(x.nextFocus).not.toHaveBeenCalled();x.dispose();
});
