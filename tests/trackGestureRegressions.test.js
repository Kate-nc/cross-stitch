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
  const ctx={bsPressRef:{current:null},knotPressRef:{current:{stopPan:true,id:1}},_dragMarkHandlers:{onExtraTouchEnd:end}};
  const e={pointerId:1,pointerType:'touch'};
  new Function('ctx','e','with(ctx){'+body+'}')(ctx,e);
  expect(ctx.knotPressRef.current).toBeNull();expect(end).toHaveBeenCalledWith(e);
});
