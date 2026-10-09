// P1-1 (audit DRAW-01): the Creator's Navigate | Draw mode.
const { loadSource } = require('./_helpers/loadSource');

const stateSrc = loadSource('creator/useCreatorState.js');

// Pull the three file-level helpers out of useCreatorState.js and run them
// against a mocked matchMedia / UserPrefs.
function loadInitialDrawMode(env) {
  const start = stateSrc.indexOf('function isFinePointerNow()');
  const end = stateSrc.indexOf('window.useCreatorState = function');
  const fn = new Function('window', 'UserPrefs', stateSrc.slice(start, end) + '\nreturn initialDrawMode;');
  return fn(env.window, env.UserPrefs);
}
function env(pointer, saved) {
  return {
    window: { matchMedia: (q) => ({ matches: q === '(pointer: fine)' ? pointer === 'fine' : pointer === 'coarse' }) },
    UserPrefs: { get: (k) => (k === 'creator.drawMode' ? saved : undefined) },
  };
}

describe('drawMode default', () => {
  test('touch screens start in Navigate', () => {
    expect(loadInitialDrawMode(env('coarse', null))()).toBe(false);
  });
  test('mouse and trackpad start in Draw', () => {
    expect(loadInitialDrawMode(env('fine', null))()).toBe(true);
  });
  test('the last choice on this device wins', () => {
    expect(loadInitialDrawMode(env('coarse', true))()).toBe(true);
    expect(loadInitialDrawMode(env('fine', false))()).toBe(false);
  });
  test('no matchMedia means Draw', () => {
    expect(loadInitialDrawMode({ window: {}, UserPrefs: { get: () => null } })()).toBe(true);
  });
  test('the preference key is declared with an automatic default', () => {
    expect(loadSource('user-prefs.js')).toMatch(/"creator\.drawMode": null,/);
  });
});

describe('Navigate hides the tool from the rest of the Creator', () => {
  test('exported tools are null in Navigate; choosing a tool switches to Draw', () => {
    expect(stateSrc).toMatch(/var effActiveTool = drawMode \? activeTool : null;/);
    expect(stateSrc).toMatch(/activeTool: effActiveTool, setActiveTool: chooseActiveTool/);
    expect(stateSrc).toMatch(/setBrushAndActivate: chooseBrush, setTool: chooseTool/);
    expect(stateSrc).toMatch(/function chooseActiveTool\(v\) \{\s*if \(v === "hand"\) \{ setDrawMode\(false\); return; \}\s*if \(v\) setDrawMode\(true\);/);
  });
  test('the choice is saved per device', () => {
    expect(stateSrc).toMatch(/UserPrefs\.set\("creator\.drawMode", v\)/);
  });
});

describe('canvas', () => {
  const src = loadSource('creator/useCanvasInteraction.js');
  test('Navigate pans with one finger or the mouse, and a tap opens the stitch menu', () => {
    expect(src).toMatch(/\(isTouchPointer\(e\) \|\| isPanTool\(\) \|\| isNavigate\(\)\) && \(isPanTool\(\) \|\| isNavigate\(\)/);
    expect(src).toMatch(/if \(panTap && isTouchPointer\(e\) && isNavigate\(\)\) openCellMenuAt\(e\.clientX, e\.clientY\);/);
    expect(src).toMatch(/if \(isPanTool\(\) \|\| isNavigate\(\)\) return;/);
  });
});

describe('ModeToggle', () => {
  test('is a shared component loaded on the Creator and Tracker pages and precached', () => {
    for (const page of ['create.html', 'index.html', 'stitch.html']) {
      expect(loadSource(page)).toMatch(/<script src="components\/ModeToggle\.js"><\/script>/);
    }
    expect(loadSource('sw.js')).toMatch(/'\.\/components\/ModeToggle\.js'/);
  });

  test('renders aria-pressed buttons with 44 px targets', () => {
    const React = { createElement: (type, props, ...children) => ({ type, props: props || {}, children }) };
    global.window = global.window || {};
    const w = {};
    new Function('window', 'React', loadSource('components/ModeToggle.js'))(w, React);
    const tree = w.ModeToggle({ value: 'navigate', onChange: () => {}, options: [{ value: 'navigate', label: 'Navigate' }, { value: 'draw', label: 'Draw' }] });
    const btns = tree.children[0];
    expect(btns.map(b => b.props['aria-pressed'])).toEqual(['true', 'false']);
    expect(loadSource('styles.css')).toMatch(/\.mode-toggle__btn\{[^}]*min-height:44px/);
  });
});
