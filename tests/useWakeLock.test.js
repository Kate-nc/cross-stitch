/**
 * Phase 4 batch 5 (TRACK-11): the screen stays on while you stitch, without a hunt for a chip.
 * Mounts the real useWakeLock.js hook in jsdom with React 18 and a mocked Wake Lock API.
 */
const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');

const ROOT = path.join(__dirname, '..');
const read = f => fs.readFileSync(path.join(ROOT, f), 'utf8');

const windows = [];
// A held lock arms a 15-minute idle timer: closing each window stops it, so Jest can exit.
afterEach(() => { while (windows.length) windows.pop().close(); });

function setup({ pref, coarse = true, supported = true } = {}) {
  const dom = new JSDOM('<!doctype html><html><body><div id="root"></div></body></html>', { runScripts: 'outside-only', pretendToBeVisual: true, url: 'http://localhost/stitch.html' });
  const w = dom.window;
  windows.push(w);
  w.eval(read('node_modules/react/umd/react.development.js'));
  w.eval(read('node_modules/react-dom/umd/react-dom.development.js'));
  const prefs = { trackerWakeLock: pref === undefined ? 'auto' : pref };
  w.UserPrefs = { get: k => prefs[k], set: (k, v) => { prefs[k] = v; } };
  const toasts = [];
  w.Toast = { show: o => { toasts.push(o); } };
  w.matchMedia = () => ({ matches: coarse });
  const sentinels = [];
  if (supported) {
    Object.defineProperty(w.navigator, 'wakeLock', { configurable: true, value: { request: async () => {
      const s = { released: false, listeners: [], release: async () => { s.released = true; s.listeners.forEach(f => f()); }, addEventListener: (_, f) => s.listeners.push(f) };
      sentinels.push(s); return s;
    } } });
  }
  w.eval(read('useWakeLock.js'));
  let api = null;
  w.eval(`
    var h = React.createElement;
    function Probe() { window.__api = window.useWakeLock(); return null; }
    var root = ReactDOM.createRoot(document.getElementById('root'));
    window.__mount = function () { ReactDOM.flushSync(function () { root.render(h(Probe)); }); };
  `);
  w.__mount();
  return { w, prefs, toasts, sentinels, api: () => w.__api, tick: () => new Promise(r => setTimeout(r, 20)) };
}

describe('mode names', () => {
  test('older stored values read sensibly', () => {
    const { w } = setup();
    const m = w.useWakeLock.mode;
    expect([m(true), m(false), m(undefined), m('always'), m('never'), m('auto'), m('x')]).toEqual(['always', 'auto', 'auto', 'always', 'never', 'auto', 'auto']);
  });
});

describe('Automatic', () => {
  test('the first mark on a touch screen keeps the screen on and says so once', async () => {
    const t = setup();
    expect(t.sentinels.length).toBe(0);                      // nothing at open
    await t.api().keepAwakeOnMark(); await t.tick();
    expect(t.sentinels.length).toBe(1);
    expect(t.toasts.length).toBe(1);
    expect(t.toasts[0].message).toMatch(/screen on/i);
    expect(t.toasts[0].actions[0].label).toBe('Turn off');
    await t.api().keepAwakeOnMark(); await t.api().keepAwakeOnMark(); await t.tick();
    expect(t.sentinels.length).toBe(1);                      // one lock, one message
    expect(t.toasts.length).toBe(1);
  });
  test('the message is not repeated in a later session', async () => {
    const t = setup();
    t.w.localStorage.setItem('cs_wakelock_told', '1');
    await t.api().keepAwakeOnMark(); await t.tick();
    expect(t.sentinels.length).toBe(1);
    expect(t.toasts.length).toBe(0);
  });
  test('"Turn off" lets the screen sleep and remembers Never', async () => {
    const t = setup();
    await t.api().keepAwakeOnMark(); await t.tick();
    t.toasts[0].actions[0].onClick(); await t.tick();
    expect(t.sentinels[0].released).toBe(true);
    expect(t.prefs.trackerWakeLock).toBe('never');
  });
  test('a computer (no touch) is left alone', async () => {
    const t = setup({ coarse: false });
    await t.api().keepAwakeOnMark(); await t.tick();
    expect(t.sentinels.length).toBe(0);
  });
  test('a browser without the Wake Lock API does nothing and does not throw', async () => {
    const t = setup({ supported: false });
    await t.api().keepAwakeOnMark(); await t.tick();
    expect(t.sentinels.length).toBe(0);
    expect(t.toasts.length).toBe(0);
  });
});

describe('Never and Always', () => {
  test('Never never takes the lock, even on a touch screen', async () => {
    const t = setup({ pref: 'never' });
    await t.api().keepAwakeOnMark(); await t.tick();
    expect(t.sentinels.length).toBe(0);
  });
  test('Always takes it as the Tracker opens, on any device', async () => {
    const t = setup({ pref: 'always', coarse: false }); await t.tick();
    expect(t.sentinels.length).toBe(1);
  });
  test('an older stored true is Always', async () => {
    const t = setup({ pref: true, coarse: false }); await t.tick();
    expect(t.sentinels.length).toBe(1);
  });
});

describe('the chip and the lifecycle', () => {
  test('the chip releases the lock and remembers Never; tapping it again holds it and remembers Always', async () => {
    const t = setup();
    await t.api().keepAwakeOnMark(); await t.tick();
    expect(t.api().wakeLockActive).toBe(true);
    await t.api().toggleWakeLock(); await t.tick();
    expect(t.sentinels[0].released).toBe(true);
    expect(t.prefs.trackerWakeLock).toBe('never');
    await t.api().toggleWakeLock(); await t.tick();
    expect(t.sentinels.length).toBe(2);
    expect(t.prefs.trackerWakeLock).toBe('always');
  });
  test('when the browser takes the lock back (tab hidden) it returns as the tab is shown again', async () => {
    const t = setup();
    await t.api().keepAwakeOnMark(); await t.tick();
    // The browser releases the sentinel itself when the tab is hidden.
    t.sentinels[0].listeners.forEach(f => f()); await t.tick();
    expect(t.api().wakeLockActive).toBe(false);
    Object.defineProperty(t.w.document, 'visibilityState', { configurable: true, value: 'visible' });
    t.w.document.dispatchEvent(new t.w.Event('visibilitychange')); await t.tick();
    expect(t.sentinels.length).toBe(2);
  });
  test('a lock the person released is not brought back when the tab is shown', async () => {
    const t = setup();
    await t.api().keepAwakeOnMark(); await t.tick();
    await t.api().toggleWakeLock(); await t.tick();
    Object.defineProperty(t.w.document, 'visibilityState', { configurable: true, value: 'visible' });
    t.w.document.dispatchEvent(new t.w.Event('visibilitychange')); await t.tick();
    expect(t.sentinels.length).toBe(1);
  });
  test('a lock is dropped after 15 minutes without a mark', () => {
    expect(read('useWakeLock.js')).toMatch(/IDLE_RELEASE_MS = 15 \* 60 \* 1000/);
  });
});
