// The Stats page scripts are plain <script> files. stats-page.js and stats-activity.js both declared
// top-level `const { useState, ... } = React`, `const h` and `function ymd`, so loading the second one
// failed with "Identifier 'useState' has already been declared" and the Activity tab never opened
// (tracking audit BUG-01).
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const read = f => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');

function makeContext() {
  const noop = () => {};
  const React = {
    createElement: noop, Fragment: 'fragment',
    useState: v => [v, noop], useEffect: noop, useMemo: f => f(), useCallback: f => f, useRef: v => ({ current: v }),
    useLayoutEffect: noop, useContext: noop, createContext: () => ({}), memo: f => f, forwardRef: f => f
  };
  const win = {};
  const ctx = vm.createContext({ window: win, React, document: { addEventListener: noop, createElement: () => ({ style: {} }) }, console, localStorage: { getItem: () => null, setItem: noop }, setTimeout, clearTimeout });
  win.window = win;
  return { ctx, win };
}

test('stats-insights, stats-activity and stats-page load into one page without a redeclaration error', () => {
  const { ctx, win } = makeContext();
  for (const f of ['stats-insights.js', 'stats-activity.js', 'stats-page.js']) {
    expect(() => vm.runInContext(read(f), ctx, { filename: f })).not.toThrow();
  }
  expect(typeof win.StatsActivity).toBe('function');
  expect(typeof win.StatsPage).toBe('function');
});

test('they load in either order', () => {
  const { ctx, win } = makeContext();
  for (const f of ['stats-page.js', 'stats-activity.js']) vm.runInContext(read(f), ctx, { filename: f });
  expect(typeof win.StatsActivity).toBe('function');
  expect(typeof win.StatsPage).toBe('function');
});

test('neither script leaks a top-level name onto the page', () => {
  const { ctx } = makeContext();
  vm.runInContext(read('stats-activity.js'), ctx);
  vm.runInContext(read('stats-page.js'), ctx);
  for (const name of ['useState', 'h', 'ymd', 'todayStr', 'fmtHours', 'StatsPage', 'StatsActivity']) {
    expect(vm.runInContext('typeof ' + name, ctx)).toBe('undefined');
  }
});
