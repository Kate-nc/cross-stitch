/* Execute the production handlers with real tile-aware coordinate conversion. */
const fs = require('fs');
const src = fs.readFileSync('tracker-app.js', 'utf8');
const helpers = fs.readFileSync('helpers.js', 'utf8');
function fn(source, name) {
  const start = source.indexOf('function ' + name + '(');
  if (start < 0) throw new Error('Missing handler ' + name);
  return source.slice(start, source.indexOf('\n}', start) + 2);
}
function harness(extra = {}) {
  const ctx = Object.assign({
    pat: [{id:'310'}, {id:'606'}, {id:'__skip__'}, {id:'__empty__'}, null, {id:'missing'}],
    cmap: {'310': {}, '606': {}}, sW: 3, sH: 2, scs: 24, G: 28,
    stitchRef: {current: {getBoundingClientRect: () => ({left: -60, top: -90})}},
    chartTileRef: {current: {x: 120, y: 96}}, isEditMode: false, stitchMode: 'track',
    lastPointerTypeRef: {current: 'mouse'}, lastSecondaryPressRef: {current: Date.now()},
    dragMarkHandlers: {onContextMenu: jest.fn(e => e.preventDefault())},
    toggleParkAt: jest.fn(), setStitchView: jest.fn(), setFocusColour: jest.fn(),
    setLeftSidebarOpen: jest.fn(), window: {matchMedia: () => ({matches: false}), Shortcuts: {isMac: () => true}},
    kbGuideRef: {current: true}, kbAnchorRef: {current: {idx: 1}},
    stopPanMomentum: jest.fn(), startPan: jest.fn(), isSpaceDownRef: {current: true},
    guideRef: {current: {row: 0, col: 1}}, GUIDE_KEYS: {},
  }, extra);
  const code = ['gridCoord'].map(n => fn(helpers,n)).concat(['selectTrackerColour','handleStitchContextMenu','isMacSecondaryClick','handleStitchMouseDown','handleStitchKeyDown'].map(n => fn(src,n))).join('\n');
  const handlers = new Function('ctx', 'with(ctx){' + code + '; return {handleStitchContextMenu,handleStitchMouseDown,handleStitchKeyDown};}')(ctx);
  return {ctx, ...handlers};
}
function event(h, x=0, y=0, extra={}) {
  const {ctx:c} = h, r = c.stitchRef.current.getBoundingClientRect(), t = c.chartTileRef.current;
  return Object.assign({clientX:r.left-t.x+c.G+(x+.75)*c.scs, clientY:r.top-t.y+c.G+(y+.75)*c.scs,
    shiftKey:false, ctrlKey:false, altKey:false, metaKey:false, button:2, defaultPrevented:false,
    preventDefault: jest.fn(function(){this.defaultPrevented=true;})}, extra);
}

test.each(['track','navigate'])('secondary click selects the exact colour in %s, even on a done stitch', stitchMode => {
  const h = harness({stitchMode, done: new Uint8Array([0,1,0,0,0,0])});
  h.handleStitchContextMenu(event(h,1));
  expect(h.ctx.setFocusColour).toHaveBeenCalledWith('606');
  expect(h.ctx.setStitchView).toHaveBeenCalledWith('highlight');
  expect(h.ctx.toggleParkAt).not.toHaveBeenCalled();
  expect(h.ctx.dragMarkHandlers.onContextMenu).not.toHaveBeenCalled();
});
test.each([3,12,48])('coordinates retain tile origin and pan offsets at cell size %s', scs => {
  const h=harness({scs}); h.handleStitchContextMenu(event(h,1));
  expect(h.ctx.setFocusColour).toHaveBeenCalledWith('606');
});
test('Shift secondary click parks instead of selecting', () => {
  const h=harness(); h.handleStitchContextMenu(event(h,1,0,{shiftKey:true}));
  expect(h.ctx.toggleParkAt).toHaveBeenCalledWith(1,0);
  expect(h.ctx.setFocusColour).not.toHaveBeenCalled();
});
test.each([[2,0],[0,1],[1,1],[2,1],[-1,0],[3,0],[0,-1],[0,2]])('invalid cell (%s,%s) changes neither colour nor parking', (x,y) => {
  const h=harness(); h.handleStitchContextMenu(event(h,x,y));
  expect(h.ctx.setFocusColour).not.toHaveBeenCalled(); expect(h.ctx.toggleParkAt).not.toHaveBeenCalled();
});
test('Edit mode and keyboard-generated contextmenu leave chart selection alone', () => {
  for (const extra of [{isEditMode:true},{lastSecondaryPressRef:{current:0}}]) {
    const h=harness(extra);h.handleStitchContextMenu(event(h));
    expect(h.ctx.setFocusColour).not.toHaveBeenCalled();expect(h.ctx.toggleParkAt).not.toHaveBeenCalled();
  }
});
test.each(['track','navigate'])('touch contextmenu retains long-press routing in %s', stitchMode => {
  const h=harness({stitchMode,lastPointerTypeRef:{current:'touch'}}), e=event(h);
  h.handleStitchContextMenu(e);
  expect(h.ctx.dragMarkHandlers.onContextMenu).toHaveBeenCalledWith(e);
  expect(h.ctx.setFocusColour).not.toHaveBeenCalled();expect(h.ctx.toggleParkAt).not.toHaveBeenCalled();
});
test.each([{button:2},{button:0,ctrlKey:true}])('secondary mousedown cannot start a Space-pan or surrender keyboard guide: %o', extra => {
  const h=harness(); h.handleStitchMouseDown(event(h,0,0,extra));
  expect(h.ctx.startPan).not.toHaveBeenCalled();expect(h.ctx.stopPanMomentum).not.toHaveBeenCalled();
  expect(h.ctx.kbGuideRef.current).toBe(true);
});
test.each(['ContextMenu','F10'])('keyboard %s still parks at guide, except in Edit', key => {
  for (const isEditMode of [false,true]) {
    const h=harness({stitchMode:'navigate',isEditMode});
    h.handleStitchKeyDown(event(h,0,0,{key,shiftKey:key==='F10'}));
    expect(h.ctx.toggleParkAt.mock.calls).toEqual(isEditMode?[]:[[1,0]]);
  }
});
test('Mac Ctrl-click cannot enter the knot, quarter or backstitch pointer handlers', () => {
  const start=src.indexOf('  onPointerDown:e=>{',src.indexOf('const dragMarkHandlers=Object.assign'));
  const body=src.slice(start+'  onPointerDown:e=>{'.length,src.indexOf('\n  },\n  onPointerMove:',start));
  const ctx={isMacSecondaryClick:e=>e.button===0&&e.ctrlKey,knotAtPoint:jest.fn(),bsHitAt:jest.fn(),quarterAtPoint:jest.fn()};
  const down=new Function('ctx','e','with(ctx){'+body+'}');
  for (const e of [{button:2},{button:0,ctrlKey:true}]) down(ctx,e);
  expect(ctx.knotAtPoint).not.toHaveBeenCalled();expect(ctx.bsHitAt).not.toHaveBeenCalled();expect(ctx.quarterAtPoint).not.toHaveBeenCalled();
});

test('Navigate touch hold parks once; movement, second touch and mode changes cancel it', () => {
  jest.useFakeTimers();
  try {
    for (const cancel of ['none','move','second','mode']) {
      const h=harness({stitchMode:'navigate'}), c=h.ctx;
      Object.assign(c,{navHoldRef:{current:null},suppressNavClickUntilRef:{current:0},navigator:{},
        window:{TouchConstants:{LONG_PRESS_MS:500,TAP_SLOP_PX:10}},useEffect:jest.fn(),
        zoomPreviewRef:{current:null},touchStateRef:{current:{mode:'none'}},commitZoomPreview:jest.fn()});
      const source=['isMacSecondaryClick','clearNavHold','handleCanvasPointerDownCapture','handleCanvasPointerMoveCapture'].map(n=>fn(src,n)).join('\n');
      const effect=src.match(/useEffect\(\(\)=>clearNavHold,\[stitchMode,isEditMode,pat\]\);/)[0];
      const handlers=new Function('ctx','with(ctx){'+source+effect+'return {handleCanvasPointerDownCapture,handleCanvasPointerMoveCapture};}')(c);
      const e=event(h,1,0,{pointerType:'touch',button:0,pointerId:1});
      handlers.handleCanvasPointerDownCapture(e);
      if(cancel==='move')handlers.handleCanvasPointerMoveCapture({...e,clientX:e.clientX+20});
      if(cancel==='second')handlers.handleCanvasPointerDownCapture({...e,pointerId:2,isPrimary:false});
      if(cancel==='mode')c.useEffect.mock.calls[0][0]()(); // React runs the cleanup when dependencies change
      jest.advanceTimersByTime(600);
      expect(c.toggleParkAt.mock.calls).toEqual(cancel==='none'?[[1,0]]:[]);
      expect(c.setFocusColour).not.toHaveBeenCalled();
    }
  } finally {jest.useRealTimers();}
});
