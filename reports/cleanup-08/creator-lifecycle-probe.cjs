/* Fingerprints Creator's UnifiedApp lifecycle in a real browser (reads React fibres; diagnostic only, not part of npm test).
 * Usage: NODE_PATH=<repo>/node_modules E2E_LOCAL_CDN=1 OUT=<file.json> node reports/cleanup-08/creator-lifecycle-probe.cjs <repo> <variant-label> [compiled-override.js]
 * Needs `node serve.js <PORT>` running (PORT env, default 8011). */
const path = require('path');
const fs = require('fs');
const repo = process.argv[2];
const label = process.argv[3];
const override = process.argv[4];
const { chromium } = require('playwright');
const { installLocalCdn } = require(path.join(repo, 'tests/e2e/local-cdn'));
const { makeTrackerFixture } = require(path.join(repo, 'tests/_helpers/trackerFixture'));
const base = 'http://127.0.0.1:' + (process.env.PORT || 8011);

(async () => {
  const browser = await chromium.launch(process.env.CHROMIUM_PATH?{executablePath:process.env.CHROMIUM_PATH}:{});
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, serviceWorkers: 'block' });
  await installLocalCdn(context);
  if (override) {
    await context.route('**/compiled/creator-main.compiled.js*', route =>
      route.fulfill({ contentType: 'application/javascript', body: fs.readFileSync(override) }));
  }
  await context.addInitScript(() => {
    localStorage.setItem('cs_stitchStyle', 'block');
    ['tracker', 'creator', 'manager', 'home'].forEach(k => localStorage.setItem('cs_welcome_' + k + '_done', '1'));
    localStorage.setItem('cs_sessionOnboardingDone', '1');
    ['firstStitch_tracker', 'rectSelect_tracker', 'import', 'undo', 'progress', 'save'].forEach(k => localStorage.setItem('cs_pref_onboarding.coached.' + k, 'true'));
    sessionStorage.setItem('cs_eviction_warned', '1');
  });
  // Attribute window/document listeners, intervals and timeouts to creator-main by stack.
  await context.addInitScript(() => {
    const own = () => /compiled\/creator-main/.test((new Error().stack.split('\n')[3] || '') + (new Error().stack.split('\n')[2] || ''));
    window.__lc = { roots: [], listeners: [], intervals: new Set(), timeouts: [] };
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
    const st = window.setTimeout;
    window.setTimeout = function (fn, d, ...a) { if (own()) window.__lc.timeouts.push(d || 0); return st.call(window, fn, d, ...a); };
  });

  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(String(e.message)));
  page.on('console', m => { if (m.type() === 'error') errors.push('console: ' + m.text()); });

  // 1. Import a chart in the Tracker so an active project exists for the Creator route.
  await page.goto(base + '/stitch.html?from=home');
  await page.locator('input[type=file]').first().setInputFiles(makeTrackerFixture({ sW: 40, sH: 40, nColours: 20 }));
  await page.locator('canvas[role="application"]').waitFor();
  await page.waitForFunction(() => typeof __flushProjectToIDB === 'function');
  await page.evaluate(() => __flushProjectToIDB());

  // 2. Creator route.
  await page.goto(base + '/create.html');
  await page.waitForFunction(() => typeof window.__switchToStats === 'function', null, { timeout: 30000 });
  await page.waitForTimeout(1500);

  const snap = await page.evaluate(() => {
    // Locate UnifiedApp's fiber from the React root container.
    const rootEl = document.getElementById('root');
    const key = Object.keys(rootEl).find(k => k.startsWith('__reactContainer$'));
    let fiber = rootEl[key];
    const stack = [fiber]; let uni = null;
    while (stack.length) { const f = stack.pop(); if (!f) continue;
      if (f.type && f.type.name === 'UnifiedApp') { uni = f; break; }
      if (f.sibling) stack.push(f.sibling); if (f.child) stack.push(f.child); }
    window.__uniFiberGetter = () => { // always return current fiber (alternate swapping)
      const r = document.getElementById('root'); const k = Object.keys(r).find(x => x.startsWith('__reactContainer$'));
      const st = [r[k]]; while (st.length) { const f = st.pop(); if (!f) continue;
        if (f.type && f.type.name === 'UnifiedApp') return f; if (f.sibling) st.push(f.sibling); if (f.child) st.push(f.child); }
      return null; };
    return !!uni;
  });
  if (!snap) throw new Error('UnifiedApp fiber not found');

  const ids = new WeakMap(); // function identity ids live in the page
  await page.evaluate(() => { window.__fnId = (() => { const m = new WeakMap(); let n = 0; return f => { if (typeof f !== 'function') return null; if (!m.has(f)) m.set(f, ++n); return m.get(f); }; })(); });

  async function state(step) {
    return page.evaluate(step => {
      const f = window.__uniFiberGetter();
      const hooks = []; let h = f ? f.memoizedState : null;
      while (h) {
        const ms = h.memoizedState; let kind;
        if (ms && typeof ms === 'object' && 'tag' in ms && 'create' in ms && 'deps' in ms) kind = 'effect:deps' + (ms.deps ? ms.deps.length : 'null') + ':destroy=' + (typeof ms.destroy);
        else if (Array.isArray(ms) && ms.length === 2 && (typeof ms[0] === 'function' || ms[1] === null || Array.isArray(ms[1]))) kind = 'memo:' + (typeof ms[0]) + ':deps' + (ms[1] ? ms[1].length : 'null');
        else if (ms && typeof ms === 'object' && 'current' in ms && Object.keys(ms).length === 1) kind = 'ref';
        else kind = 'state:' + typeof ms;
        hooks.push({ kind, fn: Array.isArray(ms) && typeof ms[0] === 'function' ? window.__fnId(ms[0]) : null });
        h = h.next;
      }
      return {
        step, url: location.search || '(none)',
        globals: ['__switchToTrack', '__switchToDesign', '__switchToCreate', '__switchToEdit', '__switchToStats', '__goHome', '__csActiveTool', '__pendingCreatorFile', '__pendingCreatorJsonFile', '__pendingTrackerImportFile', '__pendingCreatorAction']
          .map(g => g + '=' + (typeof window[g] === 'function' ? 'fn#' + window.__fnId(window[g]) : window[g] === undefined ? 'undef' : String(window[g]))),
        hookCount: hooks.length, hooks,
        liveListeners: window.__lc.listeners.filter(x => !x.removed).map(x => x.t + ':' + x.type + (x.capture ? ':c' : '')).sort(),
        intervals: window.__lc.intervals.size,
        activeProject: localStorage.getItem('crossstitch_active_project') ? 'set' : 'none',
        designDisplay: (document.querySelector('.cs-design-root') || {}).style ? document.querySelector('.cs-design-root').style.display || 'shown' : 'n/a',
      };
    }, step);
  }
  const settle = () => page.evaluate(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(() => setTimeout(r, 120)))));

  const steps = [];
  steps.push(await state('mounted'));
  // Rerender with a preference update (real preference event).
  await page.evaluate(() => { window.dispatchEvent(new CustomEvent('cs:prefchange', { detail: { key: 'creator.pdfWorkshopTheme', value: true } })); });
  await settle(); steps.push(await state('after cs:prefchange'));
  // Navigation away and back via the registered globals.
  await page.evaluate(() => window.__switchToTrack()); await settle(); steps.push(await state('switchToTrack'));
  await page.evaluate(() => window.__switchToDesign()); await settle(); steps.push(await state('switchToDesign'));
  await page.evaluate(() => window.__switchToStats()); await settle(); steps.push(await state('switchToStats'));
  await page.evaluate(() => window.__switchToStats()); await settle(); steps.push(await state('switchToStats again (close)'));
  await page.evaluate(() => window.__switchToCreate()); await settle(); steps.push(await state('switchToCreate'));
  await page.evaluate(() => window.__switchToEdit()); await settle(); steps.push(await state('switchToEdit'));
  await page.evaluate(() => { window.dispatchEvent(new CustomEvent('cs:openShortcuts')); window.dispatchEvent(new CustomEvent('cs:openHelp')); });
  await settle(); steps.push(await state('after cs:openHelp/openShortcuts'));
  // Unmount.
  await page.evaluate(() => window.__lc.roots[0].unmount()); await settle();
  const after = await page.evaluate(() => ({
    globals: ['__switchToTrack', '__switchToDesign', '__switchToCreate', '__switchToEdit', '__switchToStats', '__goHome', '__csActiveTool'].map(g => g + '=' + (window[g] === undefined ? 'undef' : 'present')),
    liveListeners: window.__lc.listeners.filter(x => !x.removed).map(x => x.t + ':' + x.type).sort(),
    intervals: window.__lc.intervals.size,
  }));
  steps.push({ step: 'unmounted', ...after });

  // Normalise function ids to first-seen order so base/head are comparable.
  const out = { label, errors, steps };
  fs.writeFileSync(process.env.OUT || (label + '.json'), JSON.stringify(out, null, 1));
  console.log(label, 'steps', steps.length, 'errors', errors.length, 'hooks@mount', steps[0].hookCount);
  await browser.close();
})().catch(e => { console.error(e); process.exit(1); });
