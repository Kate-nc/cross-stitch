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

function setup({ pref, coarse = true, supported = true, slow = false } = {}) {
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
  // Long timers (the 15-minute idle release) are captured so a test can run them; short ones stay real.
  const timers = [];
  const realSet = w.setTimeout.bind(w), realClear = w.clearTimeout.bind(w);
  w.setTimeout = (fn, ms) => { if (ms >= 60000) { timers.push({ fn, ms, cleared: false }); return -timers.length; } return realSet(fn, ms); };
  w.clearTimeout = (id) => { if (id < 0) timers[-id - 1].cleared = true; else realClear(id); };
  const waiting = [];                                      // requests held open when `slow`
  if (supported) {
    Object.defineProperty(w.navigator, 'wakeLock', { configurable: true, value: { request: () => {
      const s = { released: false, listeners: [], release: async () => { s.released = true; s.listeners.forEach(f => f()); }, addEventListener: (_, f) => s.listeners.push(f) };
      sentinels.push(s);
      return slow ? new Promise(res => waiting.push(() => res(s))) : Promise.resolve(s);
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
  return { w, prefs, toasts, sentinels, timers, settle: () => { while (waiting.length) waiting.shift()(); }, api: () => w.__api, tick: () => new Promise(r => setTimeout(r, 20)) };
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
  test('a lock is dropped after 15 minutes without a mark, and a later mark takes it again', async () => {
    const t = setup();
    await t.api().keepAwakeOnMark(); await t.tick();
    const idle = t.timers.filter(x => !x.cleared && x.ms === 15 * 60 * 1000);
    expect(idle.length).toBe(1);
    idle[0].fn(); await t.tick();
    expect(t.sentinels[0].released).toBe(true);
    expect(t.api().wakeLockActive).toBe(false);
    await t.api().keepAwakeOnMark(); await t.tick();
    expect(t.sentinels.length).toBe(2);
    expect(t.api().wakeLockActive).toBe(true);
  });
  test('marks within half a minute leave the idle clock alone (the common case costs nothing)', async () => {
    const t = setup();
    await t.api().keepAwakeOnMark(); await t.tick();
    await t.api().keepAwakeOnMark(); await t.api().keepAwakeOnMark(); await t.tick();
    expect(t.timers.length).toBe(1);                           // one timer armed, none churned
    expect(t.timers[0].cleared).toBe(false);
  });
  test('a mark after more than half a minute restarts the idle clock', async () => {
    const t = setup();
    await t.api().keepAwakeOnMark(); await t.tick();
    const realNow = t.w.Date.now.bind(t.w.Date);
    t.w.Date.now = () => realNow() + 31000;
    await t.api().keepAwakeOnMark(); await t.tick();
    expect(t.timers.length).toBe(2);
    expect(t.timers[0].cleared).toBe(true);
    expect(t.timers[1].cleared).toBe(false);
  });
});

describe('requests in flight', () => {
  test('two quick marks share one request and one lock', async () => {
    const t = setup({ slow: true });
    const a = t.api().keepAwakeOnMark(), b = t.api().keepAwakeOnMark();
    await t.tick(); t.settle(); await a; await b; await t.tick();
    expect(t.sentinels.length).toBe(1);
    expect(t.toasts.length).toBe(1);
  });
  test('a lock that arrives after the person chose Never is released, not kept', async () => {
    const t = setup({ slow: true });
    const a = t.api().keepAwakeOnMark();
    await t.tick();                                          // the request is in flight
    t.prefs.trackerWakeLock = 'never';
    t.w.dispatchEvent(new t.w.CustomEvent('cs:prefchange', { detail: { key: 'trackerWakeLock' } }));
    await t.tick(); t.settle(); await a; await t.tick();
    expect(t.sentinels.length).toBe(1);
    expect(t.sentinels[0].released).toBe(true);
    expect(t.api().wakeLockActive).toBe(false);
    expect(t.toasts.length).toBe(0);                         // and nothing is announced for a lock that was not kept
  });
  test('a lock that arrives after the Tracker closed is released', async () => {
    const t = setup({ slow: true });
    const a = t.api().keepAwakeOnMark();
    await t.tick();
    t.w.eval("ReactDOM.flushSync(function () { root.unmount(); });");
    t.settle(); await a; await t.tick();
    expect(t.sentinels.length).toBe(1);
    expect(t.sentinels[0].released).toBe(true);
  });
});

describe('Preferences changes act at once', () => {
  const changed = t => t.w.dispatchEvent(new t.w.CustomEvent('cs:prefchange', { detail: { key: 'trackerWakeLock' } }));
  test('choosing Never lets go of a lock that is held', async () => {
    const t = setup();
    await t.api().keepAwakeOnMark(); await t.tick();
    t.prefs.trackerWakeLock = 'never'; changed(t); await t.tick();
    expect(t.sentinels[0].released).toBe(true);
    expect(t.api().wakeLockActive).toBe(false);
  });
  test('choosing Always takes the lock now', async () => {
    const t = setup({ coarse: false });
    expect(t.sentinels.length).toBe(0);
    t.prefs.trackerWakeLock = 'always'; changed(t); await t.tick();
    expect(t.sentinels.length).toBe(1);
    expect(t.api().wakeLockActive).toBe(true);
  });
  test('another preference changing does nothing', async () => {
    const t = setup({ pref: 'always', coarse: false }); await t.tick();
    t.w.dispatchEvent(new t.w.CustomEvent('cs:prefchange', { detail: { key: 'trackerHandedness' } })); await t.tick();
    expect(t.sentinels.length).toBe(1);
  });
});

describe('wiring in the Tracker', () => {
  const tracker = read('tracker-app.js');
  test('only a stitch or knot going onto the history takes the lock, not an undo or a parked thread', () => {
    expect(tracker).toMatch(/last!==prev\.last&&trackHistory\.length>=prev\.len&&last\.type!=="PARK"&&keepAwakeOnMark/);
  });
  test('the retired term is gone from the stash option, its warning and its confirmation', () => {
    expect(tracker).not.toMatch(/Turn off live tracking/);
    expect(tracker).toMatch(/Stop using up stash thread as you stitch\?/);
    expect(tracker).not.toMatch(/>Live tracking/);
  });
});
