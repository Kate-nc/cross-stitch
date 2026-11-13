// sw-register.js: a waiting build is only switched to when the person asks
// (window.AppUpdate.apply), and other tabs are asked to reload, never reloaded.
const fs = require('fs');
const vm = require('vm');
const source = fs.readFileSync('sw-register.js', 'utf8');

function emitter() {
  const handlers = {};
  return {
    addEventListener: (name, fn) => (handlers[name] = handlers[name] || []).push(fn),
    removeEventListener: (name, fn) => { handlers[name] = (handlers[name] || []).filter(f => f !== fn); },
    fire: (name, event) => (handlers[name] || []).slice().forEach(fn => fn(event || {})),
  };
}
function worker(state) {
  const w = Object.assign(emitter(), { state, messages: [] });
  w.postMessage = data => w.messages.push(data);
  w.setState = next => { w.state = next; w.fire('statechange'); };
  return w;
}
async function boot({ waiting = null, controlled = true, update, session = new Map() } = {}) {
  const reg = Object.assign(emitter(), { scope: 'https://example.test/', waiting, installing: null, active: worker('activated') });
  reg.update = update || (async () => reg);
  const sw = Object.assign(emitter(), { controller: controlled ? reg.active : null, register: async () => reg });
  const win = emitter();
  const reloads = [];
  const toasts = [];
  const timers = [];
  Object.assign(win, {
    location: { reload: () => reloads.push(true) },
    Toast: { show: opts => toasts.push(opts) },
  });
  const context = vm.createContext({
    window: win, navigator: { serviceWorker: sw, onLine: true }, console: { log() {}, error() {} },
    sessionStorage: { getItem: k => session.get(k) || null, setItem: (k, v) => session.set(k, String(v)), removeItem: k => session.delete(k) },
    setInterval: () => 0, setTimeout: (fn, ms) => timers.push({ fn, ms }), Promise,
  });
  vm.runInContext(source, context);
  win.fire('load');
  await new Promise(r => setTimeout(r, 0));
  return { reg, sw, win, reloads, toasts, session, timers, api: win.AppUpdate };
}
const flush = () => new Promise(r => setTimeout(r, 0));

test('loading the page never reloads or activates a waiting build', async () => {
  const waiting = worker('installed');
  const t = await boot({ waiting });
  expect(t.reloads).toHaveLength(0);
  expect(waiting.messages).toHaveLength(0);
  expect(t.api.getState().status).toBe('ready');
  // Offered once per tab, with an Update now action.
  expect(t.toasts).toHaveLength(1);
  expect(t.toasts[0].actions[0].label).toBe('Update now');
});

test('the notice is not repeated on every page of the same tab, but a new download is announced', async () => {
  const session = new Map();
  const first = await boot({ waiting: worker('installed'), session });
  expect(first.toasts).toHaveLength(1);
  const next = await boot({ waiting: worker('installed'), session });
  expect(next.toasts).toHaveLength(0);
  // A further build finishing its download while the page is open is news.
  const newer = worker('installing');
  next.reg.installing = newer;
  next.reg.fire('updatefound');
  next.reg.installing = null;
  next.reg.waiting = newer;
  newer.setState('installed');
  expect(next.toasts).toHaveLength(1);
  expect(next.toasts[0].actions[0].label).toBe('Update now');
});

test('Update now activates the waiting build and reloads this tab once it takes over', async () => {
  const waiting = worker('installed');
  const t = await boot({ waiting });
  expect(await t.api.apply()).toBe(true);
  expect(waiting.messages).toEqual([{ type: 'stitchx:activate-update' }]);
  expect(t.api.getState().status).toBe('applying');
  expect(t.reloads).toHaveLength(0);
  t.sw.fire('controllerchange');
  waiting.setState('activated');
  expect(t.reloads).toHaveLength(1);
  expect(t.session.has('stitchx_update_applying')).toBe(false);
});

test('if the fallback reload beats a slow activation, the reloaded page still reloads quietly', async () => {
  const session = new Map();
  const waiting = worker('installed');
  const t = await boot({ waiting, session });
  await t.api.apply();
  // Activation is held up (the old worker still has requests in flight).
  const fallback = t.timers.find(x => x.ms === 15000);
  fallback.fn();
  expect(t.reloads).toHaveLength(1);
  const reloaded = await boot({ waiting, session });
  reloaded.sw.fire('controllerchange');
  expect(reloaded.reloads).toHaveLength(1);
  expect(reloaded.toasts.find(x => /another tab/.test(x.message))).toBeUndefined();
  expect(session.has('stitchx_update_applying')).toBe(false);
});

test('a stale marker from an abandoned update does not hide a later notice', async () => {
  const session = new Map([['stitchx_update_applying', String(Date.now() - 10 * 60 * 1000)]]);
  const t = await boot({ session });
  expect(session.has('stitchx_update_applying')).toBe(false);
  t.sw.fire('controllerchange');
  expect(t.reloads).toHaveLength(0);
  expect(t.toasts.find(x => /another tab/.test(x.message))).toBeDefined();
});

test('another tab updating asks this tab to reload instead of reloading it', async () => {
  const t = await boot();
  t.sw.fire('controllerchange');
  expect(t.reloads).toHaveLength(0);
  const notice = t.toasts.find(x => /another tab/.test(x.message));
  expect(notice.duration).toBe(0);
  notice.actions[0].onClick();
  expect(t.reloads).toHaveLength(1);
});

test('apply with nothing waiting does nothing', async () => {
  const t = await boot();
  expect(await t.api.apply()).toBe(false);
  expect(t.reloads).toHaveLength(0);
  expect(t.api.getState().status).toBe('current');
});

test('check reports a new build once it has downloaded, and failures', async () => {
  let installing;
  const t = await boot({ update: async () => { installing = worker('installing'); t.reg.installing = installing; return t.reg; } });
  const states = [];
  t.api.subscribe(s => states.push(s.status));
  const done = t.api.check();
  await flush();
  expect(t.api.getState().status).toBe('downloading');
  t.reg.installing = null;
  t.reg.waiting = installing;
  installing.setState('installed');
  expect((await done).status).toBe('ready');
  expect(states).toContain('checking');

  const offline = await boot({ update: async () => { throw new Error('offline'); } });
  expect((await offline.api.check()).status).toBe('failed');
  expect(offline.api.getState().error).toMatch(/Could not reach/);
});
