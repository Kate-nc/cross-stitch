const fs=require('fs'),path=require('path');
const src=fs.readFileSync(path.join(__dirname,'../tracker-app.js'),'utf8');
const start=src.indexOf('const flushRtStashWrite=useCallback');
const body=src.slice(start,src.indexOf('const flushRtStashWriteRef=',start));
function flushHarness(){
 const ctx={projectId:'p',initial:{'dmc:310':0},ready:Promise.resolve()};
 const refs={write:{current:{ctx,amounts:{'dmc:310':.2},enabled:true}},context:{current:ctx}};
 const bridge={applyProjectConsumption:jest.fn().mockResolvedValue({accounting:{threads:{}},threads:{'dmc:310':{owned:.8}}})};
 const stock=jest.fn(),version=jest.fn(),debounce={current:null},flushRef={current:null};
 const flush=new Function('useCallback','rtWriteSnapshotRef','rtContextRef','StashBridge','savesBlockedRef','setGlobalStash','setRtAccountingVersion','window','rtDebounceRef','flushRtStashWriteRef',body+'return flushRtStashWrite;')(fn=>fn,refs.write,refs.context,bridge,{current:false},stock,version,{Toast:{show:jest.fn()}},debounce,flushRef);
 flushRef.current=flush;
 return {ctx,refs,bridge,stock,flush};
}
test('switching projects during an awaited write keeps the captured project id and does not publish stale results',async()=>{
 const h=flushHarness();let release;h.ctx.ready=new Promise(resolve=>{release=resolve;});
 const pending=h.flush();h.refs.context.current={projectId:'q'};release();await pending;
 expect(h.bridge.applyProjectConsumption).toHaveBeenCalledWith('p',{'dmc:310':.2},{'dmc:310':0});expect(h.stock).not.toHaveBeenCalled();
});
test('disabled writes do not debit; re-enable retains the same project accounting',async()=>{
 const h=flushHarness();h.refs.write.current.enabled=false;await h.flush();expect(h.bridge.applyProjectConsumption).not.toHaveBeenCalled();
 h.refs.write.current.enabled=true;await h.flush();expect(h.bridge.applyProjectConsumption).toHaveBeenCalledTimes(1);expect(h.ctx.accounting).toEqual({threads:{}});
});
test('initialisation failure can retry rather than permanently poisoning the write context',async()=>{
 const h=flushHarness();h.ctx.ready=Promise.reject(Error('interrupted init'));await h.flush();expect(h.stock).toHaveBeenCalledTimes(1);
});

test('a failed write schedules one retry and a successful retry publishes the committed result',async()=>{
 jest.useFakeTimers();
 const warning=jest.spyOn(console,'warn').mockImplementation(()=>{});
 try {
  const h=flushHarness();h.bridge.applyProjectConsumption.mockRejectedValueOnce(Error('interrupted write'));
  await expect(h.flush()).rejects.toThrow('interrupted write');expect(jest.getTimerCount()).toBe(1);
  await jest.advanceTimersByTimeAsync(30000);
  expect(h.bridge.applyProjectConsumption).toHaveBeenCalledTimes(2);expect(h.stock).toHaveBeenCalledTimes(1);
 } finally {warning.mockRestore();jest.useRealTimers();}
});
test('switching projects during completion does not finish or disable the new project',async()=>{
 const start=src.indexOf('const finishingCtx=rtContextRef.current;');
 const code=src.slice(start,src.indexOf("}} style={{width:'100%'",start));
 let release;const wait=new Promise(resolve=>{release=resolve;});
 const ctx={current:{projectId:'p'}},project={current:'p'},finish=jest.fn(),deducted=jest.fn(),modal=jest.fn();
 new Function('rtContextRef','projectIdRef','rtDebounceRef','flushRtStashWriteRef','ProjectStorage','v3FieldsRef','setStashDeducted','setModal',code)(ctx,project,{current:null},{current:()=>wait},{markProjectFinished:finish},{current:{}},deducted,modal);
 ctx.current={projectId:'q'};project.current='q';release();await wait;await Promise.resolve();
 expect(finish).not.toHaveBeenCalled();expect(deducted).not.toHaveBeenCalled();expect(modal).not.toHaveBeenCalled();
});
