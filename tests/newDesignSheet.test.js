/**
 * New design sheet for designs drawn from scratch (P2-4, audit DRAW-02).
 */
const { loadSource } = require('./_helpers/loadSource');

const sheet = loadSource('creator/NewDesignSheet.js');
const stateSrc = loadSource('creator/useCreatorState.js');
const io = loadSource('creator/useProjectIO.js');
const main = loadSource('creator-main.js');

function loadSheetGlobals() {
  const win = {};
  // eslint-disable-next-line no-new-func
  new Function('window', 'React', sheet)(win, {});
  return win;
}

describe('size presets', () => {
  const win = loadSheetGlobals();

  test('Small motif, Card, Medium and Large', () => {
    expect(win.SCRATCH_SIZE_PRESETS.map((p) => [p.label, p.w, p.h])).toEqual([
      ['Small motif', 30, 30], ['Card', 50, 70], ['Medium', 100, 100], ['Large', 150, 150],
    ]);
  });

  test('Medium is chosen to start with', () => {
    expect(sheet).toMatch(/React\.useState\("medium"\)/);
  });

  test('custom sizes are kept between 10 and 500 stitches', () => {
    expect(win.clampScratchSize(4)).toBe(10);
    expect(win.clampScratchSize('77.4')).toBe(77);
    expect(win.clampScratchSize(900)).toBe(500);
    expect(win.clampScratchSize('abc')).toBe(10);
  });

  test('the tracing picture starts at 30 % opacity and is passed as 0 to 1', () => {
    expect(sheet).toMatch(/var _op = React\.useState\(30\);/);
    expect(sheet).toMatch(/trace: trace \? \{ file: trace, opacity: opacity \/ 100 \} : null/);
  });
});

describe('startScratch(w, h, opts)', () => {
  const fnSrc = stateSrc.match(/function startScratch\(w, h, opts\) \{[\s\S]*?\n {2}\}/)[0];

  function run(args, current) {
    const calls = {};
    const rec = (k) => (v) => { calls[k] = v; };
    const env = {
      sW: current.sW, sH: current.sH,
      resetAll: () => { calls.reset = true; },
      setIsScratchMode: rec('scratch'), setAutoProjectName: rec('name'),
      setSW: rec('sW'), setSH: rec('sH'), setFabricCt: rec('fabricCt'), setFabricColour: rec('fabricColour'),
      setImg: rec('img'), prevSW: {}, prevSH: {}, initBlankGrid: (w, h) => { calls.grid = [w, h]; },
      setPatternCreatedThisVisit: rec('created'), setAppMode: rec('mode'), setSidebarTab: rec('tab'),
      pendingFitRef: {}, window: {},
    };
    const names = Object.keys(env);
    // eslint-disable-next-line no-new-func
    const fn = new Function(...names, fnSrc + '\nreturn startScratch;')(...names.map((k) => env[k]));
    fn(...args);
    return calls;
  }

  test('makes a grid of the chosen size on the chosen fabric', () => {
    const c = run([30, 30, { fabricCt: 14, fabricColour: '#1A1A1A' }], { sW: 80, sH: 80 });
    expect(c.grid).toEqual([30, 30]);
    expect(c.fabricCt).toBe(14);
    expect(c.fabricColour).toBe('#1A1A1A');
    expect(c.scratch).toBe(true);
    // The fabric is set after resetAll, so it is not reset to the default.
    expect(fnSrc.indexOf('resetAll()')).toBeLessThan(fnSrc.indexOf('setFabricColour(opts.fabricColour)'));
  });

  test('with no arguments it still uses the current size', () => {
    const c = run([], { sW: 80, sH: 60 });
    expect(c.grid).toEqual([80, 60]);
    expect(c.fabricColour).toBeUndefined();
  });

  test('sizes are clamped', () => {
    expect(run([2, 9999], { sW: 80, sH: 80 }).grid).toEqual([10, 500]);
  });

  test('a scratch design never generates from its tracing picture', () => {
    expect(stateSrc).toMatch(/if \(isScratchModeRef\.current\) return;/);
    expect(loadSource('creator/ToolStrip.js')).toMatch(/!ctx\.isScratchMode/);
  });
});

describe('wiring', () => {
  test('Draw on a blank grid opens the sheet before the grid is made', () => {
    expect(io).toMatch(/if \(state\.setNewDesignOpen\) state\.setNewDesignOpen\(true\); else state\.startScratch\(\);/);
    expect(main).toMatch(/state\.startScratch\(o\.w, ?o\.h, ?\{ ?fabricCt: ?o\.fabricCt, ?fabricColour: ?o\.fabricColour ?\}\)/);
    expect(main).toMatch(/!state\.newDesignOpen&&<CreatorNoProjectRedirect\/>/);
  });

  test('every save records the tracing picture, and only for a scratch design with one', () => {
    expect((io.match(/traceImage: creatorHasTrace\(state\) \|\| undefined/g) || []).length).toBe(3);
    const has = new Function('state', io.match(/function creatorHasTrace\(state\) \{([\s\S]*?)\}/)[1]); // eslint-disable-line no-new-func
    expect(has({ isScratchMode: true, img: { src: 'blob:x' } })).toBe(true);
    expect(has({ isScratchMode: true, img: { src: null } })).toBe(false);
    expect(has({ isScratchMode: false, img: { src: 'blob:x' } })).toBe(false);
  });

  test('the tracing picture is kept as trace:<projectId> and loaded back', () => {
    expect(io).toMatch(/return 'trace:' \+ state\.projectIdRef\.current;/);
    expect(io).toMatch(/if \(s\.traceImage && project\.id && window\.BlobStore\) \{\s*window\.BlobStore\.get\('trace:' \+ project\.id\)/);
  });

  test('the sheet is in the Creator bundle before the Sidebar', () => {
    const order = loadSource('build-creator-bundle.js');
    expect(order.indexOf("'NewDesignSheet.js'")).toBeGreaterThan(order.indexOf("'FabricBlock.js'"));
    expect(order.indexOf("'NewDesignSheet.js'")).toBeLessThan(order.indexOf("'Sidebar.js'"));
  });
});
