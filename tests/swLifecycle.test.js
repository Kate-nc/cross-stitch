const fs = require('fs');
const vm = require('vm');
const { webcrypto } = require('crypto');
const { createHash } = require('crypto');
const source = fs.readFileSync('sw.js', 'utf8');
const digest = value => createHash('sha256').update(value).digest('hex');
const origin = 'https://example.test/';
const fixture = { './home.html': '<html>old</html>', './app.js': 'old build' };
function harness(fail = () => false, scope = origin) {
  const stores = new Map();
  const deleted = [];
  const caches = {
    keys: async () => [...stores.keys()],
    delete: async name => { deleted.push(name); return stores.delete(name); },
    open: async name => {
      if (!stores.has(name)) stores.set(name, new Map());
      const store = stores.get(name);
      return {
        put: async (key, response) => store.set(String(key), response.clone()),
        match: async key => store.get(String(key))?.clone(),
      };
    },
  };
  const listeners = {};
  const self = { registration: { scope }, addEventListener: (name, fn) => listeners[name] = fn };
  const assets = Object.fromEntries(Object.entries(fixture).map(([url, value]) => [url, { sha256: digest(value) }]));
  const code = source.replace(/\/\/ BEGIN GENERATED BUILD MANIFEST[\s\S]*?\/\/ END GENERATED BUILD MANIFEST/,
    `var BUILD_ID = '${'a'.repeat(64)}'; var BUILD_ASSETS = ${JSON.stringify(assets)}; var REQUIRED_URLS = ${JSON.stringify(Object.keys(fixture))};`);
  const context = vm.createContext({ self, caches, URL, Request, Response, crypto: webcrypto, console,
    fetch: async request => {
      const key = './' + new URL(request.url).pathname.slice(new URL(scope).pathname.length);
      const failure = fail(key);
      if (failure === 'throw') throw new Error('network failed');
      return new Response(failure === 'mismatch' ? 'other build' : fixture[key], { status: failure === '404' ? 404 : 200 });
    },
  });
  vm.runInContext(code, context);
  const dispatch = name => { let task; listeners[name]({ waitUntil: value => task = value }); return task; };
  const fetch = async (url, mode = 'cors', method = 'GET') => {
    let task;
    listeners.fetch({ request: { url: new URL(url, origin).href, mode, method }, respondWith: value => task = value });
    return task;
  };
  return { caches, stores, deleted, dispatch, fetch, context };
}
async function seed(h, name, complete = false) {
  const cache = await h.caches.open(name);
  await cache.put(origin + 'home.html', new Response('working old version'));
  if (complete) await cache.put(origin + '__sw_ready__', new Response(JSON.stringify({ build: 'old', completed: 1 })));
}
test.each(['404', 'throw', 'mismatch'])('failed install (%s) preserves old and unrelated caches', async failure => {
  const h = harness(key => key === './app.js' && failure);
  await seed(h, 'cross-stitch-cache-v69');
  await seed(h, 'user-project-backups');
  await expect(h.dispatch('install')).rejects.toThrow();
  expect([...h.stores.keys()]).toEqual(['cross-stitch-cache-v69', 'user-project-backups']);
  expect(await (await (await h.caches.open('cross-stitch-cache-v69')).match(origin + 'home.html')).text()).toBe('working old version');
});
test('activation refuses an interrupted candidate; later success removes partials and keeps recovery', async () => {
  const h = harness();
  await seed(h, 'cross-stitch-cache-v68');
  await seed(h, 'cross-stitch-cache-v69', true);
  await seed(h, 'cross-stitch-cache-v70-' + 'b'.repeat(64));
  await seed(h, 'project-exports');
  await expect(h.dispatch('activate')).rejects.toThrow('Incomplete');
  expect(h.deleted).toEqual([]);
  await h.dispatch('install');
  await h.dispatch('activate');
  const names = [...h.stores.keys()];
  expect(names).toContain('cross-stitch-cache-v69');
  expect(names).toContain('project-exports');
  expect(names).toHaveLength(3);
  await h.dispatch('activate');
  await h.dispatch('install'); // duplicate installation cannot clear a complete build
  expect([...h.stores.keys()]).toEqual(names);
});
test('controlled fetches pin bytes, normalise aliases/queries and never search recovery caches', async () => {
  let failure = false;
  const h = harness(() => failure);
  await h.dispatch('install');
  failure = 'mismatch';
  expect(await (await h.fetch('app.js?bust=next')).text()).toBe('old build');
  for (const route of ['', 'home', 'home.html?project=1']) {
    expect(await (await h.fetch(route, 'navigate')).text()).toBe(fixture['./home.html']);
  }
  const redirect = await h.fetch('home/?project=1', 'navigate');
  expect(redirect.status).toBe(302);
  expect(redirect.headers.get('Location')).toBe(origin + 'home?project=1');
  const current = h.stores.get(h.context.BUILD_CACHE);
  current.delete(origin + 'app.js');
  await seed(h, 'cross-stitch-cache-v69');
  expect((await h.fetch('app.js')).status).toBe(503);
  expect((await h.fetch('unknown.js')).status).toBe(503);
  expect(await h.fetch('projects.csb')).toBeUndefined();
  expect(await h.fetch('app.js', 'cors', 'POST')).toBeUndefined();
});
test('worker has no forced activation or uncontrolled-page takeover', () => {
  expect(source).not.toMatch(/self\.skipWaiting\s*\(|clients\.claim\s*\(/);
  expect(fs.readFileSync('sw-register.js', 'utf8')).not.toMatch(/location\.reload|controllerchange|postMessage/);
});

test("a subpath deployment cannot clean another registration's caches", async () => {
  const h = harness(() => false, origin + 'nested/');
  await seed(h, 'cross-stitch-cache-v69');
  await seed(h, 'cross-stitch-cache-v70-' + 'b'.repeat(64));
  await h.dispatch('install');
  await h.dispatch('activate');
  expect(h.deleted).not.toContain('cross-stitch-cache-v69');
  expect(h.deleted).not.toContain('cross-stitch-cache-v70-' + 'b'.repeat(64));
  expect(h.context.BUILD_CACHE).toContain('-scope-%2Fnested%2F');
});
