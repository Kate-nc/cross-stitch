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

  it('zooms on pinch gestures', () => {
    const state = makeState();
    const handlers = useCanvasInteraction(state, {});
    const firstDown = makePointerEvent({ pointerId: 1, clientX: 20, clientY: 20 });
    const secondDown = makePointerEvent({ pointerId: 2, clientX: 60, clientY: 20 });
    const moveSecond = makePointerEvent({ pointerId: 2, clientX: 100, clientY: 20, target: secondDown.target });

    handlers.handlePatPointerDown(firstDown);
    handlers.handlePatPointerDown(secondDown);
    handlers.handlePatPointerMove(moveSecond);

    expect(state.setZoom).toHaveBeenCalledWith(2);
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
});