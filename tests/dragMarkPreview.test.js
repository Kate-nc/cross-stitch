const {useDragMark}=require('../useDragMark');

describe('isolated drag preview scheduling',()=>{
  let oldWindow,oldRaf,oldCancel,frames,setState,cleanups;
  beforeEach(()=>{
    oldWindow=global.window;oldRaf=global.requestAnimationFrame;oldCancel=global.cancelAnimationFrame;
    frames=[];setState=jest.fn();cleanups=[];
    global.requestAnimationFrame=jest.fn(cb=>{frames.push(cb);return frames.length;});
    global.cancelAnimationFrame=jest.fn();
    global.window={React:{useRef:value=>({current:value}),useState:value=>[value,setState],
      useCallback:fn=>fn,useEffect:fn=>{cleanups.push(fn());}}};
  });
  afterEach(()=>{
    cleanups.forEach(fn=>fn&&fn());global.window=oldWindow;
    global.requestAnimationFrame=oldRaf;global.cancelAnimationFrame=oldCancel;
  });
  function hook(){
    const commit=jest.fn();
    return {commit,...useDragMark({w:12,h:12,pattern:Array(144).fill({id:'310'}),done:new Uint8Array(144),
      cellAtPoint:x=>x,isolatedPreview:true,onCommitDrag:commit})};
  }
  const event=x=>({clientX:x,clientY:0,pointerType:'mouse',pointerId:1,button:0});

  test('same-cell samples do not publish state or schedule new frames',()=>{
    const h=hook(),listener=jest.fn();h.previewStore.subscribe(listener);
    h.handlers.onPointerDown(event(25));frames.shift()();
    setState.mockClear();global.requestAnimationFrame.mockClear();
    for(let i=0;i<20;i++)h.handlers.onPointerMove(event(25));
    expect(setState).not.toHaveBeenCalled();expect(global.requestAnimationFrame).not.toHaveBeenCalled();
  });

  test('path updates share one frame while save state and release commit stay synchronous',()=>{
    const h=hook(),listener=jest.fn();h.previewStore.subscribe(listener);
    h.handlers.onPointerDown(event(25));
    h.handlers.onPointerMove(event(26));h.handlers.onPointerMove(event(29));
    expect(global.requestAnimationFrame).toHaveBeenCalledTimes(1);
    expect(listener).not.toHaveBeenCalled();
    expect([...h.getDragState().path]).toEqual([25,26,27,28,29]);
    // Pending and drag mode transitions update controls, path-only changes do not.
    expect(setState).toHaveBeenCalledTimes(2);
    h.handlers.onPointerUp(event(30));
    expect(h.commit).toHaveBeenCalledTimes(1);
    expect([...h.commit.mock.calls[0][0]]).toEqual([25,26,27,28,29,30]);
    expect(h.getDragState().mode).toBe('idle');
    frames.shift()();expect(listener).toHaveBeenCalledTimes(1);
    expect(h.previewStore.getSnapshot().mode).toBe('idle');
  });

  test('unsubscribed previews receive no callback and unmount cancels the queued frame',()=>{
    const h=hook(),listener=jest.fn(),unsubscribe=h.previewStore.subscribe(listener);
    h.handlers.onPointerDown(event(25));unsubscribe();frames.shift()();
    expect(listener).not.toHaveBeenCalled();
    h.previewStore.subscribe(listener);h.handlers.onPointerMove(event(26));
    cleanups.forEach(fn=>fn&&fn());cleanups=[];
    expect(global.cancelAnimationFrame).toHaveBeenCalled();
  });
});
