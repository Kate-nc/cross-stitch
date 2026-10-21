/** @jest-environment jsdom */
// Characterises StatsPage's hook sequence and the stash lookups of its derived memos through the real
// stats-page.js. The hue-bin memo result is not read by anything, so this pins that the hook is still
// called, in place, and still does its catalogue lookups (an unread result does not make the work unneeded).
const fs=require('fs');
const React=require('react');
const {createRoot}=require('react-dom/client');
const {act}=require('react-dom/test-utils');

const HOOKS=['useState','useEffect','useMemo','useCallback','useRef'];

test('StatsPage calls the same hooks in the same order on every render and still runs the hue-bin lookups',async()=>{
  const previousReact=global.React;global.React=React;
  global.IS_REACT_ACT_ENVIRONMENT=true;
  const calls=[];
  const spy=Object.assign({},React);
  for(const name of HOOKS)spy[name]=(...args)=>{calls.push(name);return React[name](...args);};
  const host=document.createElement('div');document.body.appendChild(host);
  const lookups=[];
  const findThreadInCatalog=(brand,id)=>{lookups.push(brand+':'+id);return {rgb:[200,30,30],name:'Test red'};};
  const stashData={'dmc:310':{owned:2},'dmc:321':{owned:1},'dmc:666':{owned:0},'anchor:9046':{owned:3}};
  const storage={
    migrateProjectsToV3:async()=>{},getLifetimeStitches:async()=>0,listProjects:async()=>[],
    getOldestWIP:async()=>null,getMostUsedColours:async()=>[],getProjectsReadyToStart:async()=>[],getOldestWIPs:async()=>[],
  };
  const stash={
    migrateSchemaToV3:async()=>{},getGlobalStash:async()=>stashData,getStashAgeDistribution:async()=>({}),
    getAcquisitionTimeseries:async()=>[],getManagerPatterns:async()=>[],LEGACY_EPOCH:'2020-01-01T00:00:00Z',
  };
  const previous=window.StatsPage;
  new Function('window','React',fs.readFileSync('icons.js','utf8'))(window,React);
  new Function('React','Icons','ProjectStorage','StashBridge','GlobalStatsDashboard','findThreadInCatalog',fs.readFileSync('stats-page.js','utf8'))(spy,window.Icons,storage,stash,()=>null,findThreadInCatalog);
  const root=createRoot(host);
  try{
    await act(async()=>{root.render(React.createElement(window.StatsPage,{onClose(){}}));});
    await act(async()=>{await new Promise(r=>setTimeout(r,50));});
    // Every render of one component instance calls an identical hook sequence, so the log is a whole number
    // of repeats of its first render. The first render ends where the sequence first starts over.
    const size=calls.findIndex((name,i)=>i>0&&calls.slice(i,i+HOOKS.length+8).join()===calls.slice(0,HOOKS.length+8).join());
    expect(size).toBeGreaterThan(0);
    const first=calls.slice(0,size);
    expect(calls.length%size).toBe(0);
    for(let at=0;at<calls.length;at+=size)expect(calls.slice(at,at+size)).toEqual(first);
    const count=name=>first.filter(n=>n===name).length;
    expect({total:first.length,useState:count('useState'),useEffect:count('useEffect'),useMemo:count('useMemo'),useCallback:count('useCallback'),useRef:count('useRef')})
      .toEqual({total:62,useState:25,useEffect:5,useMemo:26,useCallback:5,useRef:1});
    // Once the stash arrives, the hue-bin memo and the colour-family memo each look up every owned thread.
    // Zero-count threads are skipped by both.
    expect(lookups).toEqual(['dmc:310','dmc:321','anchor:9046','dmc:310','dmc:321','anchor:9046']);
  }finally{
    await act(async()=>root.unmount());host.remove();
    window.StatsPage=previous;global.React=previousReact;delete global.IS_REACT_ACT_ENVIRONMENT;
  }
});
