// Loads each page that carries sync-engine.js in real Chromium and checks the helper script loaded first, that
// SyncEngine's merge facade works there (including the browser's own structuredClone), and that nothing threw.
// Needs the app on http://127.0.0.1:8000 (node serve.js) and E2E_LOCAL_CDN-style CDN substitution when cdnjs is
// unreachable. Usage: E2E_LOCAL_CDN=1 node reports/cleanup-18/page-smoke.cjs <chromium-executable>
const { chromium } = require('@playwright/test');
const { installLocalCdn } = require('../../tests/e2e/local-cdn');
const cases = require('../../tests/support/syncMergePrimitiveCases.js');
const fs = require('fs');
const golden = require('../../tests/fixtures/syncMergePrimitives.golden.json');

(async () => {
  const browser = await chromium.launch({ executablePath: process.argv[2] });
  const context = await browser.newContext();
  await installLocalCdn(context);
  let bad = 0;
  for (const page of ['home.html', 'index.html', 'create.html', 'stitch.html', 'manager.html']) {
    const p = await context.newPage();
    const errors = [];
    p.on('pageerror', e => errors.push(String(e)));
    p.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
    await p.goto('http://127.0.0.1:8000/' + page);
    await p.waitForTimeout(1500);
    const info = await p.evaluate(() => {
      const order = Array.from(document.scripts).map(s => s.getAttribute('src')).filter(Boolean);
      return {
        helper: typeof window.SyncMergeHelpers, engine: typeof window.SyncEngine,
        helperBeforeEngine: order.indexOf('sync-merge-helpers.js') > -1 && order.indexOf('sync-merge-helpers.js') < order.indexOf('sync-engine.js'),
        sample: window.SyncEngine && JSON.stringify([
          SyncEngine.mergeSessions([{ id: 'a', start: '2026-07-02' }], [{ id: 'b', start: '2026-07-01' }, { id: 'a', editedAt: '2026-08-01', start: '2026-07-02' }], []),
          SyncEngine.mergeIndexedPairs([[1, { fwd: true }]], [[1, { bck: true }], [2, { fwd: true }]]),
          SyncEngine.mergeStitchLogs([{ date: '2026-07-01', count: 2 }], [{ date: '2026-07-01', count: 5 }]),
          SyncEngine.mergeDoneArrays([1, 0], [0, 1], 2)])
      };
    });
    const expected = JSON.stringify([
      [{ id: 'b', start: '2026-07-01' }, { id: 'a', editedAt: '2026-08-01', start: '2026-07-02' }],
      [[1, { fwd: true, bck: true }], [2, { fwd: true }]], [{ date: '2026-07-01', count: 5 }], [1, 1]]);
    const ok = info.helper === 'object' && info.engine === 'object' && info.helperBeforeEngine && info.sample === expected && !errors.some(e => /SyncMergeHelpers|sync-merge|sync-engine/.test(e));
    if (!ok) bad++;
    console.log(page.padEnd(12), ok ? 'ok ' : 'BAD', JSON.stringify({ helper: info.helper, engine: info.engine, helperBeforeEngine: info.helperBeforeEngine, sampleMatches: info.sample === expected }), errors.length ? 'page errors: ' + errors.slice(0, 3).join(' | ') : 'no page errors');
    await p.close();
  }
  // The whole battery, run inside the browser against the page's own SyncEngine.
  const p = await context.newPage();
  await p.goto('http://127.0.0.1:8000/stitch.html');
  await p.waitForTimeout(1000);
  await p.addScriptTag({ content: 'window.__cases = (function(){ var module = { exports: {} }; ' + fs.readFileSync(require.resolve('../../tests/support/syncMergePrimitiveCases.js'), 'utf8') + '\n return module.exports; })();' });
  const inBrowser = await p.evaluate(() => window.__cases.run(window.SyncEngine));
  const mismatches = Object.keys(golden).filter(k => JSON.stringify(inBrowser[k]) !== JSON.stringify(golden[k]));
  console.log('battery in Chromium:', Object.keys(golden).length, 'cases,', mismatches.length, 'differ from the recorded base behaviour', mismatches.slice(0, 5));
  if (mismatches.length) bad++;
  await browser.close();
  process.exit(bad ? 1 : 0);
})();
