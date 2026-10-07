/* The tracker <-> analysis worker traffic, in the real app — F2 of
   reports/track-view-performance-plan.md.
   ═══════════════════════════════════════════════════════════════════════════
   tests/analysisWorkerProtocol.test.js covers the worker's side in Node. This
   covers the tracker's: that it sends the pattern once, transferred; that
   marking stitches posts only progress; and that the per-stitch arrays the
   worker returns once are kept and re-attached, so later results still carry
   them for the counting aids.

   Both directions are recorded by wrapping Worker.prototype.postMessage
   (tracker -> worker) and the onmessage handler the tracker installs
   (worker -> tracker). */
const { test, expect } = require('@playwright/test');
const { fixtureFor, patternCells } = require('../_helpers/trackerFixture');
const { suppressOnboarding, SCROLLER_FN } = require('../_helpers/deviceEmulation');

test('pattern sent once, progress-only posts, statics kept', async ({ page }) => {
  test.setTimeout(180000);
  await suppressOnboarding(page);
  await page.addInitScript(() => {
    const log = window.__wlog = [];
    const proto = Worker.prototype;
    const op = proto.postMessage;
    proto.postMessage = function (msg, transfer) {
      log.push({ dir: 'out', type: msg && msg.type, keys: Object.keys(msg || {}),
        codesLen: msg && msg.codes ? msg.codes.length : null,
        transferred: Array.isArray(transfer) ? transfer.length : 0 });
      const r = op.apply(this, arguments);
      // A transferred buffer is detached on the sending side.
      if (msg && msg.codes) log[log.length - 1].detachedAfter = msg.codes.byteLength === 0;
      return r;
    };
    const d = Object.getOwnPropertyDescriptor(proto, 'onmessage');
    Object.defineProperty(proto, 'onmessage', {
      configurable: true,
      get() { return d.get.call(this); },
      set(fn) {
        d.set.call(this, function (e) {
          const m = e.data || {};
          const ps = m.result && m.result.perStitch;
          log.push({ dir: 'in', type: m.type, patternId: m.patternId, requestId: m.requestId,
            perStitchLen: ps && ps.clusterSize ? ps.clusterSize.length : null });
          const out = fn.call(this, e);
          // After the tracker's handler ran: did the result it stored carry
          // the statics? The handler mutates msg.result in place.
          log[log.length - 1].perStitchAfterHandler = ps === undefined && m.result && m.result.perStitch
            ? m.result.perStitch.clusterSize.length : (ps ? ps.clusterSize.length : null);
          return out;
        });
      },
    });
  });
  await page.goto('/stitch.html?from=home', { waitUntil: 'load', timeout: 120000 });
  await page.locator('input[type="file"]').first().setInputFiles(fixtureFor('medium'));
  await page.waitForSelector('canvas', { timeout: 90000 });
  await page.waitForTimeout(3000);

  const cells = patternCells('medium');
  const box = await page.evaluate((src) => {
    const el = (new Function('return (' + src + ')()'))();
    const b = el.getBoundingClientRect();
    return { x: b.x, y: b.y, w: b.width, h: b.height };
  }, SCROLLER_FN.toString());
  for (let i = 0; i < 3; i++) {
    await page.mouse.click(Math.round(box.x + box.w * 0.3 + i * 40), Math.round(box.y + box.h * 0.4));
    await page.waitForTimeout(1500);
  }

  const log = await page.evaluate(() => window.__wlog);
  console.log('WORKER_LOG ' + JSON.stringify(log));
  const sets = log.filter(l => l.dir === 'out' && l.type === 'setPattern');
  const analyses = log.filter(l => l.dir === 'out' && l.type === 'analyse');
  const results = log.filter(l => l.dir === 'in' && l.type === 'result');

  expect(sets, 'the pattern should be sent exactly once').toHaveLength(1);
  expect(sets[0].codesLen).toBe(cells);
  expect(sets[0].transferred, 'setPattern should transfer its buffer').toBe(1);
  expect(sets[0].detachedAfter, 'the codes buffer was cloned, not transferred').toBe(true);

  expect(analyses.length, 'load + 3 marks should post at least 4 analyses').toBeGreaterThanOrEqual(4);
  analyses.forEach(a => expect(a.keys).not.toContain('pat'));

  expect(results.length).toBeGreaterThanOrEqual(2);
  expect(results.filter(r => r.perStitchLen != null), 'per-stitch arrays should arrive exactly once').toHaveLength(1);
  // Every result the tracker stored carries the statics, re-attached.
  results.forEach(r => expect(r.perStitchAfterHandler).toBe(cells));
});
