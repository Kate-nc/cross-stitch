/* Fingerprints StatsPage's lifecycle in a real browser (reads React fibres; diagnostic only, not part of npm test).
 * Usage: NODE_PATH=<repo>/node_modules E2E_LOCAL_CDN=1 OUT=<file.json> node reports/cleanup-09/stats-lifecycle-probe.cjs <repo> <variant-label> [stats-page-override.js]
 * Needs `node serve.js <PORT>` running (PORT env, default 8011).
 * Two routes are fingerprinted: Creator (create.html) opening and closing the Stats overlay twice, and the
 * direct Stats route (index.html?mode=stats) unmounted from its root. A seeded project and stash make the
 * data path, including the stash-derived memos, run. */
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const repo = process.argv[2];
const label = process.argv[3];
const override = process.argv[4];
const { chromium } = require('playwright');
const { installLocalCdn } = require(path.join(repo, 'tests/e2e/local-cdn'));
const { makeTrackerFixture } = require(path.join(repo, 'tests/_helpers/trackerFixture'));
const base = 'http://127.0.0.1:' + (process.env.PORT || 8011);

(async () => {
  const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, serviceWorkers: 'block' });
  await installLocalCdn(context);
  if (override) {
    await context.route('**/stats-page.js*', route =>
      route.fulfill({ contentType: 'application/javascript', body: fs.readFileSync(override) }));
  }
  await context.addInitScript(() => {
    localStorage.setItem('cs_stitchStyle', 'block');
    ['tracker', 'creator', 'manager', 'home'].forEach(k => localStorage.setItem('cs_welcome_' + k + '_done', '1'));
    localStorage.setItem('cs_sessionOnboardingDone', '1');
    ['firstStitch_tracker', 'rectSelect_tracker', 'import', 'undo', 'progress', 'save'].forEach(k => localStorage.setItem('cs_pref_onboarding.coached.' + k, 'true'));
    sessionStorage.setItem('cs_eviction_warned', '1');
  });
  // Attribute window/document listeners and intervals to stats-page.js by stack.
  await context.addInitScript(() => {
    const own = () => /stats-page\.js/.test((new Error().stack.split('\n')[2] || '') + (new Error().stack.split('\n')[3] || ''));
    window.__lc = { roots: [], listeners: [], intervals: new Set() };
    Object.defineProperty(window, 'ReactDOM', { configurable: true,
      get() { return this.__rd; },
      set(value) {
        let wrapped;
        const wrap = fn => function (...a) { const r = fn.apply(this, a); window.__lc.roots.push(r); return r; };
        if (value.createRoot) wrapped = wrap(value.createRoot);
        Object.defineProperty(value, 'createRoot', { configurable: true, get: () => wrapped, set: fn => { wrapped = wrap(fn); } });
        this.__rd = value;
      } });
    const add = EventTarget.prototype.addEventListener, rem = EventTarget.prototype.removeEventListener;
    EventTarget.prototype.addEventListener = function (type, fn, o) {
      if ((this === window || this === document) && own()) {
        const capture = typeof o === 'boolean' ? o : !!(o && o.capture);
        window.__lc.listeners.push({ t: this === window ? 'window' : 'document', type, fn, capture, removed: false });
      }
      return add.call(this, type, fn, o);
    };
    EventTarget.prototype.removeEventListener = function (type, fn, o) {
      const capture = typeof o === 'boolean' ? o : !!(o && o.capture);
      for (const x of window.__lc.listeners) if (x.fn === fn && x.type === type && x.capture === capture) x.removed = true;
      return rem.call(this, type, fn, o);
    };
    const si = window.setInterval, ci = window.clearInterval;
    window.setInterval = function (fn, d, ...a) { const id = si.call(window, fn, d, ...a); if (own()) window.__lc.intervals.add(id); return id; };
    window.clearInterval = function (id) { window.__lc.intervals.delete(id); return ci.call(window, id); };
  });

  // Record which stats-page script the browser really received, so a route override that silently fails to apply cannot make two runs look alike.
  const served = [];
  context.on('response', r => { if (/\/stats-page\.js/.test(r.url())) r.body().then(b => served.push(crypto.createHash('sha256').update(b).digest('hex'))).catch(() => {}); });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(String(e.message)));
  page.on('console', m => { if (m.type() === 'error') errors.push('console: ' + m.text()); });

  // 1. Seed a project (Tracker import) and a stash so the data path and stash-derived memos run.
  await page.goto(base + '/stitch.html?from=home');
  await page.locator('input[type=file]').first().setInputFiles(makeTrackerFixture({ sW: 40, sH: 40, nColours: 20 }));
  await page.locator('canvas[role="application"]').waitFor();
  await page.waitForFunction(() => typeof __flushProjectToIDB === 'function');
  await page.evaluate(() => __flushProjectToIDB());
  await page.evaluate(async () => {
    for (const [id, n] of [['310', 2], ['321', 1], ['typo-not-a-thread', 1], ['436', 3], ['550', 1], ['700', 2], ['727', 1], ['B5200', 1], ['3865', 4], ['E3821', 1]]) await StashBridge.updateThreadOwned(id, n);
  });

  const helpers = () => {
    window.__fnId = (() => { const m = new WeakMap(); let n = 0; return f => { if (typeof f !== 'function') return null; if (!m.has(f)) m.set(f, ++n); return m.get(f); }; })();
    window.__statsFiber = () => {
      const r = document.getElementById('root'); if (!r) return null;
      const k = Object.keys(r).find(x => x.startsWith('__reactContainer$')); if (!k) return null;
      const st = [r[k]];
      while (st.length) { const f = st.pop(); if (!f) continue;
        if (f.type && f.type.name === 'StatsPage') return f;
        if (f.sibling) st.push(f.sibling); if (f.child) st.push(f.child); }
      return null;
    };
  };

  async function state(step) {
    return page.evaluate(step => {
      const f = window.__statsFiber();
      const hooks = []; let h = f ? f.memoizedState : null;
      while (h) {
        const ms = h.memoizedState; let kind;
        if (ms && typeof ms === 'object' && 'tag' in ms && 'create' in ms && 'deps' in ms) kind = 'effect:deps' + (ms.deps ? ms.deps.length : 'null') + ':destroy=' + (typeof ms.destroy);
        else if (Array.isArray(ms) && ms.length === 2 && (typeof ms[0] === 'function' || ms[1] === null || Array.isArray(ms[1]))) kind = 'memo:' + (typeof ms[0]) + ':deps' + (ms[1] ? ms[1].length : 'null');
        else if (ms && typeof ms === 'object' && 'current' in ms && Object.keys(ms).length === 1) kind = 'ref';
        else kind = 'state:' + (Array.isArray(ms) ? 'array' + ms.length : ms === null ? 'null' : typeof ms === 'object' ? 'object' + Object.keys(ms).length : typeof ms);
        // Memo results: record their JSON so the stash-derived values (including the unread one) are compared too.
        let value = null;
        if (kind.startsWith('memo:') && Array.isArray(ms) && typeof ms[0] !== 'function') { try { value = JSON.stringify(ms[0]); } catch (e) { value = 'unserialisable'; } if (value && value.length > 400) value = value.slice(0, 400); }
        hooks.push({ kind, fn: Array.isArray(ms) && typeof ms[0] === 'function' ? window.__fnId(ms[0]) : null, value });
        h = h.next;
      }
      const root = document.getElementById('root');
      // Only the Stats tree is fingerprinted; with Stats closed the root holds the host app's own UI.
      const text = f && root ? root.innerText.replace(/\s+/g, ' ') : '';
      let hash = 0; for (let i = 0; i < text.length; i++) hash = (hash * 31 + text.charCodeAt(i)) | 0;
      return {
        step, mounted: !!f, hookCount: hooks.length, hooks,
        liveListeners: window.__lc.listeners.filter(x => !x.removed).map(x => x.t + ':' + x.type + (x.capture ? ':c' : '')).sort(),
        intervals: window.__lc.intervals.size,
        textLength: text.length, textHash: hash,
      };
    }, step);
  }
  const settle = () => page.evaluate(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(() => setTimeout(r, 250)))));
  const clickTab = async name => { await page.getByRole('button', { name, exact: true }).click(); await settle(); };
  const runTabs = async (steps, prefix) => {
    for (const t of ['Stash', 'Showcase', 'Activity', 'Insights', 'Stitching']) {
      await clickTab(t);
      if (t === 'Activity') await page.waitForFunction(() => typeof StatsActivity === 'function');
      if (t === 'Insights') await page.waitForFunction(() => typeof StatsInsights === 'function');
      await settle(); await page.waitForTimeout(1000); steps.push(await state(prefix + 'tab ' + t));
    }
  };

  // Wait until the stored projects stop changing (Stats' own V3 migration and Creator's autosave both write asynchronously).
  const stableProjects = async () => {
    let last = null, same = 0;
    for (let i = 0; i < 60 && same < 3; i++) {
      const now = await page.evaluate(async () => JSON.stringify(await ProjectStorage.listProjects()));
      same = now === last ? same + 1 : 0; last = now;
      await page.waitForTimeout(700);
    }
    if (same < 3) throw new Error('project storage never settled');
  };

  // Warm-up (not fingerprinted): the first Stats open on a fresh database migrates the seeded project.
  await page.goto(base + '/index.html?mode=stats&from=home');
  await page.getByRole('button', { name: 'Stitching', exact: true }).waitFor({ timeout: 30000 });
  await stableProjects();

  const routes = {};

  // 2. Creator route: open Stats, rerender on a preference update, tab and data events, close, reopen, close.
  {
    const steps = [];
    await page.goto(base + '/create.html');
    await page.waitForFunction(() => typeof window.__switchToStats === 'function', null, { timeout: 30000 });
    await page.evaluate(helpers);
    // Let Creator finish loading and autosaving the seeded project before Stats opens.
    await stableProjects();
    await page.evaluate(() => window.__switchToStats());
    await page.getByRole('button', { name: 'Stitching', exact: true }).waitFor({ timeout: 30000 });
    await settle(); await page.waitForTimeout(1500);
    steps.push(await state('creator: mounted'));
    await page.evaluate(() => window.dispatchEvent(new CustomEvent('cs:prefchange', { detail: { key: 'creator.pdfWorkshopTheme', value: true } })));
    await settle(); steps.push(await state('creator: after cs:prefchange'));
    await runTabs(steps, 'creator: ');
    await page.evaluate(() => { window.dispatchEvent(new Event('cs:stashChanged')); window.dispatchEvent(new Event('cs:projectsChanged')); });
    await settle(); await settle(); steps.push(await state('creator: after cs:stashChanged + cs:projectsChanged'));
    await page.evaluate(() => window.__switchToStats()); await settle(); steps.push(await state('creator: closed (away)'));
    await page.evaluate(() => window.__switchToStats());
    await page.getByRole('button', { name: 'Stitching', exact: true }).waitFor({ timeout: 30000 });
    await settle(); await settle(); steps.push(await state('creator: reopened (back)'));
    await page.evaluate(() => window.__switchToStats()); await settle(); steps.push(await state('creator: closed again'));
    routes.creator = steps;
  }

  // 3. Direct Stats route, unmounted from its React root.
  {
    const steps = [];
    await page.goto(base + '/index.html?mode=stats&from=home');
    await page.waitForFunction(() => typeof StatsPage === 'function' && window.__lc.roots.length > 0);
    await page.evaluate(helpers);
    await page.getByRole('button', { name: 'Stitching', exact: true }).waitFor({ timeout: 30000 });
    await settle(); await page.waitForTimeout(1500); steps.push(await state('direct: mounted'));
    await page.evaluate(() => window.dispatchEvent(new CustomEvent('cs:prefchange', { detail: { key: 'creator.pdfWorkshopTheme', value: false } })));
    await settle(); steps.push(await state('direct: after cs:prefchange'));
    await runTabs(steps, 'direct: ');
    await page.evaluate(() => window.__lc.roots[0].unmount()); await settle();
    steps.push(await state('direct: unmounted'));
    routes.direct = steps;
  }

  const out = { label, scriptSha256: served.slice(-1)[0] || null, errors, routes };
  fs.writeFileSync(process.env.OUT || (label + '.json'), JSON.stringify(out, null, 1));
  console.log(label, 'sha', (out.scriptSha256 || 'none').slice(0, 12), 'creator steps', routes.creator.length, 'direct steps', routes.direct.length, 'errors', errors.length, 'hooks@mount', routes.creator[0].hookCount, routes.direct[0].hookCount);
  await browser.close();
})().catch(e => { console.error(e); process.exit(1); });
