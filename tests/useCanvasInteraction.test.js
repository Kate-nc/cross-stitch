const fs = require('fs');

function loadHook() {
  delete global.window;
  global.window = global;
  global.React = {
    useRef(initialValue) {
      return { current: initialValue };
    }
  };
  global.drawCk = jest.fn();
  global.drawPatternOnCanvas = jest.fn();
  global.gridCoord = jest.fn(function(_canvasRef, e) {
    return { gx: e.gx != null ? e.gx : 1, gy: e.gy != null ? e.gy : 1 };
  });
  global.requestAnimationFrame = function(cb) {
    cb();
    return 1;
  };
  global.cancelAnimationFrame = jest.fn();

  const code = fs.readFileSync('./creator/useCanvasInteraction.js', 'utf8');
  eval(code); // eslint-disable-line no-eval
  return global.window.useCanvasInteraction;
}

function makePointerEvent(overrides) {
  const target = {
    setPointerCapture: jest.fn(),
    releasePointerCapture: jest.fn()
  };
  return Object.assign({
    button: 0,
    pointerId: 1,
    pointerType: 'touch',
    clientX: 0,
    clientY: 0,
    gx: 1,
    gy: 1,
    target,
    preventDefault: jest.fn()
  }, overrides || {});
}

function makeState(overrides) {
  const canvasContext = { fillRect: jest.fn(), strokeRect: jest.fn() };
  const pcRef = {
    current: {
      style: {},
      getContext: jest.fn(function() { return canvasContext; }),
      getBoundingClientRect: jest.fn(function() {
        return { left: 0, top: 0, width: 200, height: 200 };
      })
    }
  };
  const scrollRef = {
    current: {
      scrollLeft: 80,
      scrollTop: 40
    }
  };
  const cropRef = {
    current: {
      getBoundingClientRect: jest.fn(function() {
        return { left: 10, top: 20, width: 100, height: 80 };
      })
    }
  };

  const state = {
    pat: [
      { id: '310', rgb: [0, 0, 0] },
      { id: '321', rgb: [1, 1, 1] },
      { id: '310', rgb: [0, 0, 0] },
      { id: '321', rgb: [1, 1, 1] }
    ],
    halfStitches: new Map(),
    bsLines: [],
    sW: 2,
    sH: 2,
    cs: 20,
    G: 28,
    zoom: 1,
    activeTool: null,
    halfStitchTool: null,
    selectedColorId: '310',
    cmap: {
      '310': { id: '310', rgb: [0, 0, 0] },
      '321': { id: '321', rgb: [1, 1, 1] }
    },
    brushSize: 1,
    showOverlay: false,
    overlayOpacity: 0.3,
    pcRef,
    scrollRef,
    cropRef,
    cropStartRef: { current: null },
    isCropping: false,
    hoverCoords: null,
    bsStart: null,
    bsContinuous: false,
    brushMode: 'paint',
    EDIT_HISTORY_MAX: 50,
    buildPaletteWithScratch: jest.fn(function(pat) {
      return { pal: [], cmap: state.cmap, pat };
    }),
    setPat: jest.fn(),
    setHalfStitches: jest.fn(),
    setBsLines: jest.fn(),
    setEditHistory: jest.fn(),
    setRedoHistory: jest.fn(),
    setPal: jest.fn(),
    setCmap: jest.fn(),
    setHoverCoords: jest.fn(function(value) { state.hoverCoords = value; }),
    setSelectedColorId: jest.fn(function(value) { state.selectedColorId = value; }),
    setBrushAndActivate: jest.fn(function(value) { state.activeTool = value; }),
    setBsStart: jest.fn(function(value) { state.bsStart = value; }),
    setZoom: jest.fn(function(value) { state.zoom = value; }),
    setCropRect: jest.fn(function(value) { state.cropRect = value; }),
    cropRect: null,
    setImg: jest.fn(),
    setOrigW: jest.fn(),
    setOrigH: jest.fn(),
    setAr: jest.fn(),
    arLock: false,
    setSH: jest.fn(),
    setIsCropping: jest.fn(function(value) { state.isCropping = value; }),
    img: { width: 100, height: 80 },
    pickBg: false,
    setBgCol: jest.fn(),
    setPickBg: jest.fn()
  };

  return Object.assign(state, overrides || {});
}

describe('useCanvasInteraction pointer support', () => {
  let useCanvasInteraction;

  beforeEach(() => {
    jest.useFakeTimers();
    jest.clearAllMocks();
    useCanvasInteraction = loadHook();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('pans the scroll container with one touch when no tool is active', () => {
    const state = makeState();
    const handlers = useCanvasInteraction(state, {});
    const down = makePointerEvent({ clientX: 100, clientY: 50 });
    const move = makePointerEvent({ pointerId: 1, clientX: 130, clientY: 65, target: down.target });
    const up = makePointerEvent({ pointerId: 1, target: down.target });

    handlers.handlePatPointerDown(down);
    handlers.handlePatPointerMove(move);
    handlers.handlePatPointerUp(up);

    expect(state.scrollRef.current.scrollLeft).toBe(50);
    expect(state.scrollRef.current.scrollTop).toBe(25);
    expect(state.setHoverCoords).toHaveBeenCalledWith(null);
  });

  it('creates a backstitch point from a touch tap on pointer up', () => {
    const state = makeState({ activeTool: 'backstitch' });
    const handlers = useCanvasInteraction(state, {});
    const down = makePointerEvent({ gx: 1, gy: 1 });
    const up = makePointerEvent({ pointerId: 1, gx: 1, gy: 1, target: down.target });

    handlers.handlePatPointerDown(down);
    handlers.handlePatPointerUp(up);

    expect(state.setBsStart).toHaveBeenCalledWith({ x: 1, y: 1 });
  });

  it('cancels an in-progress backstitch on long press', () => {
    const state = makeState({ activeTool: 'backstitch', bsStart: { x: 1, y: 1 } });
    const handlers = useCanvasInteraction(state, {});
    const down = makePointerEvent({ clientX: 40, clientY: 60 });

    handlers.handlePatPointerDown(down);
    jest.advanceTimersByTime(500);

    expect(state.setBsStart).toHaveBeenCalledWith(null);
  });

  it('zooms on pinch gestures: the chart is scaled while the fingers move, and zoomed when they lift', () => {
    const state = makeState();
    const handlers = useCanvasInteraction(state, {});
    const firstDown = makePointerEvent({ pointerId: 1, clientX: 20, clientY: 20 });
    const secondDown = makePointerEvent({ pointerId: 2, clientX: 60, clientY: 20 });
    const moveSecond = makePointerEvent({ pointerId: 2, clientX: 100, clientY: 20, target: secondDown.target });

    handlers.handlePatPointerDown(firstDown);
    handlers.handlePatPointerDown(secondDown);
    handlers.handlePatPointerMove(moveSecond);

    // A preview: no redraw at each step.
    expect(state.setZoom).not.toHaveBeenCalled();
    expect(state.pcRef.current.style.transform).toMatch(/scale\(2\)/);

    handlers.handlePatPointerUp(makePointerEvent({ pointerId: 2, clientX: 100, clientY: 20, target: secondDown.target }));
    expect(state.setZoom).toHaveBeenCalledWith(2);
    // Once the chart has been drawn at the new zoom, the preview goes.
    jest.advanceTimersByTime(1000);
    expect(state.pcRef.current.style.transform).toBe('');
  });

  it('updates crop rectangle through pointer drag', () => {
    const state = makeState({ isCropping: true });
    const handlers = useCanvasInteraction(state, {});
    const down = makePointerEvent({ clientX: 20, clientY: 30 });
    const move = makePointerEvent({ pointerId: 1, clientX: 70, clientY: 75, target: down.target });

    handlers.handleCropPointerDown(down);
    handlers.handleCropPointerMove(move);

    expect(state.setCropRect).toHaveBeenNthCalledWith(1, { x: 10, y: 10, w: 0, h: 0 });
    expect(state.setCropRect).toHaveBeenNthCalledWith(2, { x: 10, y: 10, w: 50, h: 45 });
  });

  it('pans with a steady two-finger drag (zoom unchanged)', () => {
    const state = makeState();
    const handlers = useCanvasInteraction(state, {});
    const a = makePointerEvent({ pointerId: 1, clientX: 20, clientY: 20 });
    const b = makePointerEvent({ pointerId: 2, clientX: 60, clientY: 20 });
    handlers.handlePatPointerDown(a);
    handlers.handlePatPointerDown(b);
    handlers.handlePatPointerMove(makePointerEvent({ pointerId: 1, clientX: 70, clientY: 50, target: a.target }));
    handlers.handlePatPointerMove(makePointerEvent({ pointerId: 2, clientX: 110, clientY: 50, target: b.target }));
    // (Moving one finger first changed the spread for a moment; the chart is
    // panned for good when the fingers lift.)
    handlers.handlePatPointerUp(makePointerEvent({ pointerId: 2, clientX: 110, clientY: 50, target: b.target }));

    expect(state.scrollRef.current.scrollLeft).toBe(30);
    expect(state.scrollRef.current.scrollTop).toBe(10);
    expect(state.pcRef.current.style.transform).toBe('');
  });
});

describe('computePinchScroll', () => {
  let computePinchScroll;
  beforeEach(() => {
    loadHook();
    computePinchScroll = global.window.computePinchScroll;
  });

  const base = { startScrollLeft: 200, startScrollTop: 100, startMidX: 150, startMidY: 120,
    originX: 10, originY: 20, padX: 28, padY: 28 };

  it('moves the scroll by the midpoint movement when the distance is constant', () => {
    const r = computePinchScroll(base, 200, 120, 1);
    expect(r.scrollLeft).toBe(150);
    expect(r.scrollTop).toBe(100);
  });

  it('keeps the chart point under the midpoint while zooming', () => {
    const r = computePinchScroll(base, 150, 120, 2);
    // focal chart point (start zoom) = 200 + 140 - 28 = 312 → 624 at 2x
    expect(r.scrollLeft).toBe(624 + 28 - 140);
  });

  it('never returns a negative scroll', () => {
    const r = computePinchScroll(base, 900, 900, 1);
    expect(r.scrollLeft).toBe(0);
    expect(r.scrollTop).toBe(0);
  });
});

describe('tablet pointer ownership and interrupted edits', () => {
  let hook;
  beforeEach(() => { jest.useFakeTimers(); hook = loadHook(); });
  afterEach(() => jest.useRealTimers());
  function drawing(extra) {
    const s = makeState(Object.assign({activeTool:'paint', partialStitches:new Map(), pal:[]}, extra));
    s.setPartialStitches = jest.fn();
    s.setPat = jest.fn(p => { s.pat = p; });
    s.history = [];
    s.setEditHistory = jest.fn(fn => { s.history = fn(s.history); });
    return s;
  }
  test.each(['mouse', 'pen'])('%s cancellation commits one undoable stroke and releases capture', pointerType => {
    const s = drawing(), h = hook(s, {}), original = s.pat.slice();
    const e = makePointerEvent({pointerType});
    h.handlePatPointerDown(e);
    expect(h.isDraggingRef.current).toBe(true);
    h.handlePatPointerCancel(e);
    expect(h.isDraggingRef.current).toBe(false);
    expect(e.target.releasePointerCapture).toHaveBeenCalledWith(e.pointerId);
    expect(s.history).toHaveLength(1);
    const restored = s.pat.slice();
    s.history[0].changes.forEach(c => { restored[c.idx] = c.old; });
    expect(restored).toEqual(original);
    h.handlePatPointerCancel(e); // lostpointercapture after release is idempotent
    h.handlePatPointerUp(e);
    expect(s.history).toHaveLength(1);
    h.handlePatPointerDown(e); h.handlePatPointerUp(e);
    expect(h.isDraggingRef.current).toBe(false);
  });
  test('finger pans with Paint selected in pen navigation; pen still paints', () => {
    const s = drawing({penNavigationRef:{current:true}}), h = hook(s, {});
    const finger = makePointerEvent({clientX:100, clientY:100});
    h.handlePatPointerDown(finger);
    h.handlePatPointerMove(makePointerEvent({clientX:140,clientY:120}));
    h.handlePatPointerUp(finger);
    expect(s.scrollRef.current.scrollLeft).toBe(40);
    expect(s.history).toHaveLength(0);
    const pen = makePointerEvent({pointerType:'pen',pointerId:2});
    h.handlePatPointerDown(pen); h.handlePatPointerUp(pen);
    expect(s.history).toHaveLength(1);
  });
  test.each(['touch', 'pen'])('second contact interrupts %s; remaining contact cannot resume painting', pointerType => {
    const s = drawing(), h = hook(s, {});
    const first = makePointerEvent({pointerType, pointerId:1});
    const second = makePointerEvent({pointerId:2,clientX:40});
    h.handlePatPointerDown(first); h.handlePatPointerDown(second);
    h.handlePatPointerUp(second);
    h.handlePatPointerMove(first); h.handlePatPointerUp(first);
    expect(s.history).toHaveLength(0);
    expect(h.isDraggingRef.current).toBe(false);
  });
  test('Fill waits until lift, so a pinch never fills the starting cell', () => {
    const s = drawing({activeTool:'fill'}), h = hook(s, {});
    const first = makePointerEvent(), second = makePointerEvent({pointerId:2,clientX:40});
    h.handlePatPointerDown(first);
    expect(s.history).toHaveLength(0);
    h.handlePatPointerDown(second); h.handlePatPointerUp(second); h.handlePatPointerUp(first);
    expect(s.history).toHaveLength(0);
    h.handlePatPointerDown(first); h.handlePatPointerUp(first);
    expect(s.history).toHaveLength(1);
  });
  test('unknown pointer-up and pen barrel button cannot finish or start painting', () => {
    const s = drawing(), h = hook(s, {});
    h.handlePatPointerDown(makePointerEvent({pointerType:'pen',button:2}));
    expect(h.isDraggingRef.current).toBe(false);
    const pen = makePointerEvent({pointerType:'pen'});
    h.handlePatPointerDown(pen);
    h.handlePatPointerUp(makePointerEvent({pointerId:99}));
    expect(h.isDraggingRef.current).toBe(true);
    h.handlePatPointerUp(pen);
    expect(s.history).toHaveLength(1);
  });
  test('cancelled aiming tap releases capture and never places a stitch', () => {
    const s = drawing(), h = hook(s, {}), e = makePointerEvent();
    h.handlePatPointerDown(e); h.handlePatPointerCancel(e);
    expect(e.target.releasePointerCapture).toHaveBeenCalledWith(1);
    expect(s.history).toHaveLength(0);
  });
  test('pinch cancels temporary selection gestures without clearing the selection', () => {
    const mask = new Uint8Array([1,0,0,0]);
    const s = drawing({activeTool:'move',selectionMask:mask,cancelMove:jest.fn(),cancelLasso:jest.fn(),clip:{cancelDrag:jest.fn()},startMove:jest.fn()}), h = hook(s, {});
    h.handlePatPointerDown(makePointerEvent());
    h.handlePatPointerDown(makePointerEvent({pointerId:2,clientX:40}));
    expect(s.cancelMove).toHaveBeenCalled(); expect(s.clip.cancelDrag).toHaveBeenCalled();
    expect(s.selectionMask).toBe(mask);
    expect(s.history).toHaveLength(0);
  });
});

test('crop cancellation clears the preview and releases the owning capture', () => {
  const hook=loadHook(),s=makeState({isCropping:true}),h=hook(s,{});
  const e=makePointerEvent({pointerType:'pen',clientX:20,clientY:30});
  h.handleCropPointerDown(e);h.handleCropPointerMove(makePointerEvent({pointerType:'pen',clientX:80,clientY:70}));
  expect(s.cropStartRef.current).not.toBeNull();
  h.handleCropPointerCancel(e);
  expect(s.cropStartRef.current).toBeNull();expect(s.cropRect).toBeNull();
  expect(e.target.releasePointerCapture).toHaveBeenCalledWith(e.pointerId);
  h.handleCropPointerMove(makePointerEvent({clientX:90,clientY:90}));
  expect(s.cropRect).toBeNull();
});

test('cancelling a backstitch aiming gesture hides its loupe and clears the anchor', () => {
  const hook=loadHook(),s=makeState({activeTool:'backstitch'}),h=hook(s,{});
  global.creatorLoupe={show:jest.fn(),hide:jest.fn()};
  const e=makePointerEvent();h.handlePatPointerDown(e);h.handlePatPointerCancel(e);
  expect(global.creatorLoupe.hide).toHaveBeenCalled();expect(s.bsStart).toBeNull();
  delete global.creatorLoupe;
});
