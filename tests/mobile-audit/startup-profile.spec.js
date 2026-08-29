/* Where does mobile start-up time actually go: bytes, round trips, or parse?
   Measures cold vs warm load under a throttled 4G-ish link so the caching
   question can be answered with numbers rather than assumption. Mostly a
   diagnostic; the assertions at the bottom guard the two facts the numbers
   depend on. Run it before and after a change to compare. */
const { test, expect } = require('@playwright/test');

const PAGES = ['/home.html?from=home', '/manager.html?from=home', '/create.html?from=home'];

// Roughly Chrome DevTools "Fast 4G": 4 Mbps down, 100 ms RTT.
const NET = { offline: false, downloadThroughput: (4 * 1024 * 1024) / 8, uploadThroughput: (1 * 1024 * 1024) / 8, latency: 100 };

async function measure(page, url, { warm }) {
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Network.enable');
  await cdp.send('Network.emulateNetworkConditions', NET);
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });

  if (warm) {
    // Prime the HTTP cache with a first visit, then navigate again.
    await page.goto(url, { waitUntil: 'load', timeout: 180000 });
    await page.waitForTimeout(1500);
  }

  const t0 = Date.now();
  await page.goto(url, { waitUntil: 'load', timeout: 180000 });
  const wall = Date.now() - t0;
  await page.waitForTimeout(2500);

  const r = await page.evaluate(() => {
    const nav = performance.getEntriesByType('navigation')[0] || {};
    const res = performance.getEntriesByType('resource');
    let bytesOverWire = 0, decoded = 0, from304 = 0, fromCache = 0, netCount = 0;
    let scriptDur = 0;
    for (const e of res) {
      const wire = e.transferSize || 0;
      bytesOverWire += wire;
      decoded += e.decodedBodySize || 0;
      // transferSize 0 with a body => served from cache without a request.
      if (wire === 0 && (e.decodedBodySize || 0) > 0) fromCache++;
      // A small transferSize with a real body => 304 revalidation (headers only).
      else if (wire > 0 && wire < 400 && (e.decodedBodySize || 0) > 400) { from304++; netCount++; }
      else if (wire > 0) netCount++;
      if (/\.js(\?|$)/.test(e.name)) scriptDur += e.duration;
    }
    return {
      requests: res.length,
      networkRequests: netCount,
      revalidated304: from304,
      servedFromCache: fromCache,
      wireKB: Math.round(bytesOverWire / 1024),
      decodedKB: Math.round(decoded / 1024),
      domInteractive: Math.round(nav.domInteractive || 0),
      domContentLoaded: Math.round(nav.domContentLoadedEventEnd || 0),
      loadEvent: Math.round(nav.loadEventEnd || 0),
      // Sum of script fetch durations — overlapping, so an upper bound on
      // network time, not additive wall time.
      scriptFetchMs: Math.round(scriptDur),
      // Decoded bytes per script, biggest first: parse/execute cost scales
      // with decoded size, which neither gzip nor caching reduces.
      heaviest: res
        .filter(e => /\.js(\?|$)/.test(e.name) && (e.decodedBodySize || 0) > 0)
        .map(e => ({ f: e.name.split('/').slice(-1)[0], kb: Math.round(e.decodedBodySize / 1024), via: e.initiatorType }))
        .sort((a, b) => b.kb - a.kb).slice(0, 12),
      // initiatorType 'script' = a <script src> that is parsed and executed.
      // 'link' = rel=prefetch, downloaded into cache but never parsed. Only
      // the first costs CPU; both cost bandwidth.
      executedKB: Math.round(res.filter(e => e.initiatorType === 'script')
        .reduce((s, e) => s + (e.decodedBodySize || 0), 0) / 1024),
      prefetchedKB: Math.round(res.filter(e => e.initiatorType === 'link' && /\.js(\?|$)/.test(e.name))
        .reduce((s, e) => s + (e.decodedBodySize || 0), 0) / 1024),
      prefetchedWireKB: Math.round(res.filter(e => e.initiatorType === 'link' && /\.js(\?|$)/.test(e.name))
        .reduce((s, e) => s + (e.transferSize || 0), 0) / 1024),
    };
  });
  await cdp.detach().catch(() => {});
  return { wall, ...r };
}

for (const p of PAGES) {
  test(`startup ${p}`, async ({ page }) => {
    const cold = await measure(page, p, { warm: false });
    console.log('COLD ' + p + ' ' + JSON.stringify(cold));
    // This project is a phone, so the speculative prefetch of other pages'
    // assets (1.3 MB decoded / 345 KB wire on create.html) must be skipped.
    expect(cold.prefetchedWireKB, 'phones must not prefetch other pages').toBe(0);
  });
  test(`startup warm ${p}`, async ({ page }) => {
    const warm = await measure(page, p, { warm: true });
    console.log('WARM ' + p + ' ' + JSON.stringify(warm));
    // A repeat visit must reuse the cache rather than re-downloading. If this
    // regresses, the dev server has stopped sending a validator and every
    // measurement taken against it is misleading.
    expect(warm.wireKB, 'warm load should transfer almost nothing').toBeLessThan(200);
  });
}
