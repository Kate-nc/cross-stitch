/**
 * UX-020: the Creator's phone bars say what each control is, the fill icon reads as "pour paint in", the hint
 * under the chart wraps, and notices come one at a time. Real files, rendered in jsdom where it matters.
 */
const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');

const ROOT = path.join(__dirname, '..');
const read = f => fs.readFileSync(path.join(ROOT, f), 'utf8');
const css = read('styles.css');

function makeWindow() {
  const dom = new JSDOM('<!doctype html><html><body><div id="root"></div></body></html>', { runScripts: 'outside-only', pretendToBeVisual: true });
  const w = dom.window;
  w.eval(read('node_modules/react/umd/react.development.js'));
  w.eval(read('node_modules/react-dom/umd/react-dom.development.js'));
  return w;
}
const iconStub = `
  window.Icons = new Proxy({}, { get: function (_, name) { return function () { return React.createElement('i', { 'data-icon': String(name) }); }; } });
  var Icons = window.Icons;`;

describe('bucketPour icon', () => {
  const calls = [];
  const React = { createElement: (type, props, ...kids) => { const n = { type, props, kids }; calls.push(n); return n; } };
  const win = {};
  new Function('window', 'React', read('icons.js'))(win, React);

  test('exists, and is a 24x24 outline at 1.6 stroke in currentColor', () => {
    expect(typeof win.Icons.bucketPour).toBe('function');
    const svg = win.Icons.bucketPour();
    expect(svg.type).toBe('svg');
    expect(svg.props.viewBox).toBe('0 0 24 24');
    expect(svg.props.strokeWidth).toBe('1.6');
    expect(svg.props.stroke).toBe('currentColor');
    expect(svg.props.fill).toBe('none');
    expect(svg.props.strokeLinecap).toBe('round');
    const leaves = svg.kids.map(k => k.props);
    expect(leaves.length).toBeGreaterThanOrEqual(3);
    leaves.forEach(p => { expect(p.fill == null || p.fill === 'none').toBe(true); });   // outline only, no fills
  });

  test('the Fill tool uses it, on the rail and in the context menu', () => {
    expect(read('creator/ToolStrip.js')).toMatch(/railBtn\("fill", "Fill tool", "Fill", window\.Icons\.bucketPour\(\)/);
    expect(read('creator/ContextMenu.js')).toMatch(/Icons\.bucketPour/);
  });
});

describe('rail labels', () => {
  const strip = read('creator/ToolStrip.js');
  const rail = strip.slice(strip.indexOf('if (compact) {'), strip.indexOf('return h(React.Fragment, null,', strip.indexOf('if (compact) {')));

  test('every rail control has a visible word under its icon', () => {
    for (const [aria, word] of [['Paint tool', 'Paint'], ['Fill tool', 'Fill'], ['Erase tool', 'Erase'], ['Undo', 'Undo']]) {
      expect(rail).toContain('railBtn("' + aria.toLowerCase().split(' ')[0] + '", "' + aria + '", "' + word + '"');
    }
    expect(rail).toMatch(/creator-rail__label"\}, "Colour"/);
    expect(strip).toMatch(/creator-rail__label"\}, "More"/);
  });

  test('visible words are inside the accessible names (label in name)', () => {
    const calls = Array.from(rail.matchAll(/railBtn\("\w+", "([^"]+)", "([^"]+)"/g));
    expect(calls.length).toBe(4);
    calls.forEach(m => expect(m[1]).toContain(m[2]));
    expect(strip).toMatch(/"aria-label":"More tools"/);
  });

  test('Navigate | Draw show their words on the rail, and the compact toggle elsewhere stays icon-only', () => {
    expect(css).toMatch(/\.creator-rail__mode\.mode-toggle--compact \.mode-toggle__label\{position:static;/);
    expect(css).toMatch(/\.mode-toggle--compact \.mode-toggle__label\{position:absolute;/);
  });

  test('eight 44px controls fit a 360px screen with no gap to spare for an overflow', () => {
    expect(css).toMatch(/\.creator-rail__row\{[^}]*gap:0;[^}]*padding:0 1px;/);
    expect(css).toMatch(/\.creator-rail__btn\{[^}]*flex:1 1 44px;min-width:44px;[^}]*min-height:44px;/);
    expect(css).toMatch(/\.creator-rail__mode \.mode-toggle__btn\{[^}]*min-width:44px;/);
    expect(css).toMatch(/\.creator-rail__row\{[^}]*overflow-x:auto;/);    // below 358px it scrolls rather than clipping
  });

  test('the rail words are 10px, not the Tracker rail\'s 9px', () => {
    expect(css).toMatch(/\.creator-rail__label\{font-size:10px;/);
  });
});

describe('Convert / Edit / Materials switcher', () => {
  function render(props) {
    const w = makeWindow();
    w.eval(iconStub);
    w.eval(read('creator/CompactBar.js'));
    w.__props = Object.assign({ pat: [{}], totalStitchable: 10, appMode: 'edit', tab: 'pattern', sourceTab: 'convert', hasImage: true, onTabChange() {} }, props);
    w.eval(`
      var root = ReactDOM.createRoot(document.getElementById('root'));
      ReactDOM.flushSync(function () { root.render(React.createElement(window.CreatorCompactTopBar, window.__props)); });`);
    return w;
  }

  test('each step is an icon over its word, with a 44px-wide target', () => {
    const w = render();
    const tabs = Array.from(w.document.querySelectorAll('.cc-modes [role="tab"]'));
    expect(tabs.map(t => t.querySelector('.cc-mode__label').textContent)).toEqual(['Convert', 'Edit', 'Materials']);
    tabs.forEach(t => { expect(t.querySelector('[data-icon]')).not.toBeNull(); expect(t.getAttribute('aria-label')).toBe(t.querySelector('.cc-mode__label').textContent); });
    expect(css).toMatch(/\.cc-mode\{[^}]*min-width:44px;/);
    expect(css).not.toMatch(/\.cc-mode\{[^}]*min-width:40px;/);
    w.close();
  });

  test('the selected step is still announced', () => {
    const w = render({ appMode: 'edit', tab: 'materials' });
    const on = Array.from(w.document.querySelectorAll('.cc-modes [aria-selected="true"]')).map(t => t.querySelector('.cc-mode__label').textContent);
    expect(on).toEqual(['Materials']);
    w.close();
  });
});

describe('status hint under the chart', () => {
  test('wraps on the phone bars, with the readout on its own line', () => {
    expect(css).toMatch(/body\.creator-compact \.tb-status\{[^}]*font-size:12px;[^}]*overflow-wrap:anywhere;/);
    expect(css).toMatch(/body\.creator-compact \.tb-status > span:first-child\{flex:1 1 100%;min-width:0;\}/);
  });

  test('the room reserved for it under the chart is one variable, shared with the toast banner', () => {
    expect(css).toMatch(/--creator-status-h:72px;/);
    expect(css).toMatch(/- var\(--creator-status-h\)\)!important;max-height:none!important;/);
    expect(css).toMatch(/creator-toast-container--phone[^{]*\{bottom:calc\(var\(--creator-rail-h\) \+ env\(safe-area-inset-bottom,0px\) \+ var\(--creator-status-h\)\)!important;\}/);
  });

  test('landscape phones drop it for real (the bar sets display inline) and give the room back', () => {
    expect(css).toMatch(/@media \(max-height: 500px\) \{[^@]*body\.creator-compact \.tb-status\{display:none!important;\}/);
    expect(css).toMatch(/body\.creator-compact\{--creator-status-h:8px;\}/);
  });
});

describe('Creator toasts on a phone', () => {
  function mount(compact, toasts) {
    const w = makeWindow();
    w.eval(iconStub);
    const t = { opened: 0, closed: 0, dismissed: [] };
    w.Coaching = { overlayOpened() { t.opened++; }, overlayClosed() { t.closed++; } };
    w.useCreatorCompact = () => compact;
    w.useApp = () => ({ toasts, dismissToast: id => t.dismissed.push(id) });
    w.eval(read('creator/Toast.js'));
    w.eval(`
      var root = ReactDOM.createRoot(document.getElementById('root'));
      window.__render = function () { ReactDOM.flushSync(function () { root.render(React.createElement(window.CreatorToastContainer)); }); };
      window.__unmount = function () { ReactDOM.flushSync(function () { root.unmount(); }); };`);
    w.__render();
    return { w, t, texts: () => Array.from(w.document.querySelectorAll('.creator-toast-container > div')).map(e => e.textContent) };
  }
  const list = [
    { id: 1, type: 'info', message: 'First', duration: 2500, action: null },
    { id: 2, type: 'warning', message: 'Careful', duration: 2500, action: null },
    { id: 3, type: 'error', message: 'Broken', duration: 2500, action: { label: 'Retry', onClick() {} } },
    { id: 4, type: 'success', message: 'Fine', duration: 2500, action: null }
  ];

  test('phone: one banner, the most important first', () => {
    const m = mount(true, list);
    expect(m.texts().length).toBe(1);
    expect(m.texts()[0]).toContain('Broken');
    m.w.close();
  });

  test('phone: with no error, a warning goes ahead of information; otherwise the oldest', () => {
    const a = mount(true, [list[0], list[1], list[3]]);
    expect(a.texts()[0]).toContain('Careful');
    a.w.close();
    const b = mount(true, [list[0], list[3]]);
    expect(b.texts()[0]).toContain('First');
    b.w.close();
  });

  test('phone: full width, with 44px buttons and a live region', () => {
    const m = mount(true, [list[2]]);
    const c = m.w.document.querySelector('.creator-toast-container');
    expect(c.className).toContain('creator-toast-container--phone');
    expect(c.getAttribute('aria-live')).toBe('polite');
    expect(c.style.left).toBe('0px');
    expect(c.style.right).toBe('0px');
    const card = c.firstChild;
    expect(card.style.width).toBe('100%');
    const btns = Array.from(card.querySelectorAll('button'));
    expect(btns.length).toBe(2);
    btns.forEach(b => { expect(b.style.minWidth).toBe('44px'); expect(b.style.minHeight).toBe('44px'); });
    m.w.close();
  });

  test('phone: holds coachmarks back while a banner shows, and releases them when it goes', () => {
    const m = mount(true, [list[0]]);
    expect(m.t.opened).toBe(1);
    m.w.__unmount();
    expect(m.t.closed).toBe(1);
    m.w.close();
  });

  test('wider than a phone: every toast shows, as before, and Coaching is left alone', () => {
    const m = mount(false, list);
    expect(m.texts().length).toBe(4);
    expect(m.w.document.querySelector('.creator-toast-container').className).not.toContain('--phone');
    expect(m.t.opened).toBe(0);
    m.w.close();
  });

  test('a waiting toast does not run out its clock unseen', () => {
    const s = read('creator/useCreatorState.js');
    expect(s).toMatch(/toastsRef\.current\.forEach\(function\(t\) \{ wait \+= t\.duration; \}\)/);
    expect(s).toMatch(/\}, wait \+ toast\.duration\);/);
    expect(s).toMatch(/var dismissToast = useCallback\(function\(id\) \{\s*toastsRef\.current = /);
  });
});

describe('Tracker banner position', () => {
  test('above the Focus bar, which floats 16px up and is 62px tall', () => {
    expect(css).toMatch(/body\.cs-focus \[data-toast-container\]\[data-toast-phone="1"\]\{bottom:calc\(max\(16px, env\(safe-area-inset-bottom, 0px\)\) \+ 62px \+ 8px\)!important;\}/);
  });
});
