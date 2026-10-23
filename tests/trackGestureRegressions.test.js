const {dragMarkReducer, initialState} = require('../useDragMark');

function gesture(actions, extra = {}) {
  const ctx = {w: 12, h: 12, pattern: Array.from({length: 144}, () => ({id:'310'})), done: new Uint8Array(144), ...extra};
  let state = initialState();
  const effects = [];
  for (const action of actions) {
    const result = dragMarkReducer(state, action, ctx);
    state = result.state;
    effects.push(...result.effects);
  }
  return {state, effects, commits: effects.filter(e => e.type === 'COMMIT_DRAG')};
}
const down = (idx, extra = {}) => ({type:'POINTER_DOWN', idx, time:0, pointerType:'mouse', pointerId:1, ...extra});
const move = idx => ({type:'POINTER_MOVE', idx, time:20});
const up = idx => ({type:'POINTER_UP', idx, time:50});

test('a sparse stroke includes every crossed cell and its release cell in one undo action', () => {
  const {commits} = gesture([down(25), move(30), up(33)]);
  expect(commits).toHaveLength(1);
  expect([...commits[0].set]).toEqual([25,26,27,28,29,30,31,32,33]);
});

test('release can be the only movement sample', () => {
  expect([...gesture([down(25), up(29)]).commits[0].set]).toEqual([25,26,27,28,29]);
});

test.each([[13,65,[13,26,39,52,65]], [65,13,[65,52,39,26,13]], [14,62,[14,26,38,50,62]]])(
  'sparse diagonal and vertical strokes %s to %s', (start, end, expected) => {
    expect([...gesture([down(start), move(end), up(end)]).commits[0].set]).toEqual(expected);
  }
);

test('interpolation excludes empty cells and keeps unmark intent from the start', () => {
  const pattern = Array.from({length:144}, () => ({id:'310'}));
  pattern[27]={id:'__skip__'}; pattern[28]={id:'__empty__'};
  const done = new Uint8Array(144); done[25]=1;
  const {commits} = gesture([down(25), move(30), up(30)], {pattern, done});
  expect([...commits[0].set]).toEqual([25,26,29,30]);
  expect(commits[0].intent).toBe('unmark');
});

test('leaving and reentering the grid does not bridge an unseen stroke', () => {
  expect([...gesture([down(25), move(26), move(-1), move(33), up(33)]).commits[0].set]).toEqual([25,26,33]);
});

test('cancelled sparse strokes commit nothing', () => {
  expect(gesture([down(25), move(33), {type:'POINTER_CANCEL'}]).commits).toHaveLength(0);
});

test.each([false,true])('off-centre strokes follow actual coordinates, reversed=%s', reverse => {
  const start={idx:26,point:{x:2.9,y:2.95}},end={idx:40,point:{x:4.1,y:3.9}};
  const [a,b]=reverse?[end,start]:[start,end];
  const {commits}=gesture([down(a.idx,{point:a.point}),{...up(b.idx),point:b.point}]);
  expect([...commits[0].set].sort((a,b)=>a-b)).toEqual([26,38,39,40]);
});

test('the next segment begins at the latest position within the current cell',()=>{
  const {commits}=gesture([
    down(26,{point:{x:2.1,y:2.1}}),
    {...move(26),point:{x:2.9,y:2.95}},
    {...up(40),point:{x:4.1,y:3.9}}
  ]);
  expect([...commits[0].set].sort((a,b)=>a-b)).toEqual([26,38,39,40]);
});

test('a segment ending on a corner does not step beyond its endpoint',()=>{
  const {commits}=gesture([down(15,{point:{x:3.5,y:1.5}}),{...up(38),point:{x:2,y:3}}]);
  expect([...commits[0].set].sort((a,b)=>a-b)).toEqual([15,26,38]);
});

test('an older drag state without a previous sample does not trace an invalid segment',()=>{
  const ctx={w:12,h:12,pattern:Array(144).fill({id:'310'}),done:new Uint8Array(144)};
  const state={...initialState(),mode:'drag',path:new Set([25]),startIdx:25,intent:'mark'};
  const result=dragMarkReducer(state,{...move(30),point:{x:6.2,y:2.4}},ctx);
  expect([...result.state.path]).toEqual([25,30]);
});

test('fractional strokes match independent segment/cell intersections in every direction',()=>{
  const fc=require('fast-check');
  const point=fc.record({x:fc.integer({min:0,max:1199}),y:fc.integer({min:0,max:1199})}).map(p=>({x:p.x/100,y:p.y/100}));
  const idx=p=>Math.floor(p.y)*12+Math.floor(p.x);
  fc.assert(fc.property(point,point,(a,b)=>{
    // Clip the segment against each cell independently. A corner-only touch
    // has zero length and does not paint either neighbouring side cell.
    const expected=new Set([idx(a),idx(b)]);
    for(let y=0;y<12;y++)for(let x=0;x<12;x++){
      let lo=0,hi=1;
      for(const [key,min] of [['x',x],['y',y]]){
        const delta=b[key]-a[key];
        if(!delta){if(a[key]<min||a[key]>=min+1)hi=-1;}
        else {
          const p=(min-a[key])/delta,q=(min+1-a[key])/delta;
          lo=Math.max(lo,Math.min(p,q));hi=Math.min(hi,Math.max(p,q));
        }
      }
      if(hi-lo>1e-10)expected.add(y*12+x);
    }
    const result=gesture([down(idx(a),{point:a}),{...up(idx(b)),point:b}]);
    const actual=new Set(result.effects.flatMap(e=>e.type==='COMMIT_DRAG'?[...e.set]:e.type==='TOGGLE_CELL'?[e.idx]:[]));
    expect([...actual].sort((a,b)=>a-b)).toEqual([...expected].sort((a,b)=>a-b));
  }),{seed:393,numRuns:200});
});

test('Space-pan claims the press before specialty hit tests or the marking hook', () => {
  const src = require('fs').readFileSync(require('path').join(__dirname,'../tracker-app.js'),'utf8');
  const start=src.indexOf('  onPointerDown:e=>{',src.indexOf('const dragMarkHandlers=Object.assign'));
  const body=src.slice(start+'  onPointerDown:e=>{'.length,src.indexOf('\n  },\n  onPointerMove:',start));
  const ctx={isMacSecondaryClick:()=>false,isSpaceDownRef:{current:true},dragMarkReset:jest.fn()};
  const setPointerCapture=jest.fn();
  // No other dependencies are supplied: reaching any marking branch fails.
  new Function('ctx','e','with(ctx){'+body+'}')(ctx,{button:0,pointerId:7,currentTarget:{setPointerCapture}});
  expect(ctx.dragMarkReset).toHaveBeenCalledTimes(1);
  expect(setPointerCapture).toHaveBeenCalledWith(7);
});

test.each(['mouse','touch','pen'])('drag-disabled %s taps still toggle and never arm a range', pointerType => {
  const {effects}=gesture([down(25,{pointerType}),up(25)],{dragEnabled:false});
  expect(effects.filter(e=>e.type==='TOGGLE_CELL')).toEqual([{type:'TOGGLE_CELL',idx:25}]);
  expect(effects.some(e=>e.type==='START_LONG_PRESS'||e.type==='START_HOLD')).toBe(false);
});

test('drag-disabled strokes do not mark even if they return to the starting cell', () => {
  const {effects}=gesture([down(25),move(30),move(25),up(25)],{dragEnabled:false});
  expect(effects.some(e=>e.type==='TOGGLE_CELL'||e.type.startsWith('COMMIT'))).toBe(false);
});

test('drag-disabled Shift-click is a single click, not a rectangle', () => {
  const {effects}=gesture([down(25),up(25),down(30,{shiftKey:true}),up(30)],{dragEnabled:false});
  expect(effects.filter(e=>e.type==='TOGGLE_CELL').map(e=>e.idx)).toEqual([25,30]);
  expect(effects.some(e=>e.type==='COMMIT_RANGE')).toBe(false);
});

test.each(['touch','pen'])('%s stationary release has no timing dead zone', pointerType => {
  for (const time of [199,200,201,350,499]) {
    const {effects}=gesture([down(25,{pointerType}),{type:'HOLD_ARMED'},{...up(25),time}]);
    expect(effects.filter(e=>e.type==='TOGGLE_CELL')).toHaveLength(1);
  }
});

test('a long-press that actually fired retains its range anchor and does not also toggle', () => {
  const {state,effects}=gesture([down(25,{pointerType:'touch'}),{type:'LONG_PRESS_FIRED'},{...up(25),time:550}]);
  expect(state.mode).toBe('range');
  expect(effects.some(e=>e.type==='TOGGLE_CELL')).toBe(false);
});

test('a quick touch swipe still scrolls without marking', () => {
  const {effects}=gesture([down(25,{pointerType:'touch',x:0,y:0}),{...move(30),x:50,y:0},up(30)]);
  expect(effects.some(e=>e.type==='TOGGLE_CELL'||e.type.startsWith('COMMIT'))).toBe(false);
});

test('a press consumed to stop momentum ends the touch count without marking a stitch',()=>{
  const src=require('fs').readFileSync(require('path').join(__dirname,'../tracker-app.js'),'utf8');
  const start=src.indexOf('  onPointerUp:e=>{',src.indexOf('const dragMarkHandlers=Object.assign'));
  const body=src.slice(start+'  onPointerUp:e=>{'.length,src.indexOf('\n  },\n  onPointerCancel:',start));
  const end=jest.fn();
  const ctx={bsPressRef:{current:null},knotPressRef:{current:{stopPan:true,id:1}},_dragMarkHandlers:{onExtraTouchEnd:end},dragMarkGetStateRef:{current:()=>({mode:'idle'})}};
  const e={pointerId:1,pointerType:'touch'};
  new Function('ctx','e','with(ctx){'+body+'}')(ctx,e);
  expect(ctx.knotPressRef.current).toBeNull();expect(end).toHaveBeenCalledWith(e);
});

test.each(['multi','idle'])('half release checks %s before ending the contact',mode=>{
  const src=require('fs').readFileSync(require('path').join(__dirname,'../tracker-app.js'),'utf8');
  const start=src.indexOf('  onPointerUp:e=>{',src.indexOf('const dragMarkHandlers=Object.assign'));
  const body=src.slice(start+'  onPointerUp:e=>{'.length,src.indexOf('\n  },\n  onPointerCancel:',start));
  let currentMode=mode;
  const toggleHalfAtPoint=jest.fn(),end=jest.fn(()=>{currentMode='idle';});
  const ctx={bsPressRef:{current:null},knotPressRef:{current:{half:{idx:25},id:1,x:0,y:0}},
    _dragMarkHandlers:{onExtraTouchEnd:end},dragMarkGetStateRef:{current:()=>({mode:currentMode})},toggleHalfAtPoint};
  const e={pointerId:1,pointerType:'touch',clientX:0,clientY:0};
  new Function('ctx','e','with(ctx){'+body+'}')(ctx,e);
  expect(end).toHaveBeenCalledWith(e);
  expect(toggleHalfAtPoint).toHaveBeenCalledTimes(mode==='multi'?0:1);
});
