/** @jest-environment jsdom */
const React = require('react');
const {createRoot} = require('react-dom/client');
const {act} = require('react-dom/test-utils');
const fs=require('fs');
window.React=React;
eval(fs.readFileSync(require.resolve('../useStitchCounts.js'),'utf8'));
global.IS_REACT_ACT_ENVIRONMENT=true;
test('mark/unmark halves invalidates colours without scanning 500×500 full cells',()=>{
  const pat=Array.from({length:250000},(_,i)=>({id:String(i%100)}));
  const done=new Int8Array(pat.length), hs=new Map([[0,{fwd:{id:'0'}}]]);
  const el=document.createElement('div'),root=createRoot(el); let counts;
  function Harness({hd}){counts=window.useStitchCounts({pat,done,halfStitches:hs,halfDone:hd});return null;}
  act(()=>root.render(React.createElement(Harness,{hd:new Map()})));
  let reads=0;
  Object.defineProperty(pat,1,{get(){reads++;return {id:'1'};}});
  const start=performance.now();
  for(let i=0;i<100;i++)act(()=>root.render(React.createElement(Harness,{hd:new Map([[0,{fwd:i%2===0}]])})));
  const halfMs=performance.now()-start;
  expect(reads).toBe(0);expect(counts.colourDoneCountsRef.current['0'].halfDone).toBe(0);
  act(()=>root.render(React.createElement(Harness,{hd:new Map([[0,{fwd:true}]])})));
  expect(counts.colourDoneCountsRef.current['0'].halfDone).toBe(1);
  const fullStart=performance.now();
  for(let i=0;i<100;i++){const idx=i*100;done[idx]=1;act(()=>counts.applyDoneCountsDelta([{idx,oldVal:0}],pat,done));}
  process.stdout.write(JSON.stringify({fixture:'500x500, 100 colours',halfMarkUnmark100Ms:halfMs,fullMark100Ms:performance.now()-fullStart})+'\n');
  expect(counts.doneCountRef.current).toBe(100);expect(counts.colourDoneCountsRef.current['0'].done).toBe(100);
  expect(reads).toBe(0); act(()=>root.unmount());
});
