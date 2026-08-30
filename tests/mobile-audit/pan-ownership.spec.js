/* Who owns a one-finger drag on the chart — R6 in
   reports/mobile-freeze-large-patterns.md.
   ═══════════════════════════════════════════════════════════════════════════
   The chart used to set `touch-action: none` and call preventDefault on every
   touchstart, so the compositor never scrolled it: every pan frame was a JS
   handler writing scrollLeft/scrollTop.

   That is correct in **track** mode, where a one-finger drag is drag-marking
   and handing it to the compositor would break the app's primary interaction.
   It is wrong everywhere else, where the same gesture is only ever a pan.

   So the two assertions that matter are a pair, and neither means much alone:

     - nav mode pans natively, with the JS pan path not running;
     - track mode still marks, and still does *not* pan natively.

   A change that made everything native would pass the first and fail the
   second; the old code passes the second and fails the first. */
const { test, expect } = require('@playwright/test');
const { fixtureFor } = require('../_helpers/trackerFixture');

async function openTracker(page) {
  await page.addInitScript(() => {
    try {
      for (const k of ['tracker', 'creator', 'manager', 'home']) localStorage.setItem('cs_welcome_' + k + '_done', '1');
      localStorage.setItem('cs_stitchStyle', 'block');
      for (const k of ['firstStitch_tracker', 'rectSelect_tracker', 'firstStitch_creator',
        'import', 'undo', 'progress', 'save']) {
        localStorage.setItem('cs_pref_onboarding.coached.' + k, 'true');
      }
    } catch (e) {}
    // Count JS-driven scroll writes. The compositor scrolling an element does
    // NOT go through this setter, so a native pan leaves the count at zero
    // while the scroll position still changes — which is exactly the
    // distinction this spec is built on.
    window.__scrollWrites = 0;
    const d = Object.getOwnPropertyDescriptor(Element.prototype, 'scrollLeft');
    Object.defineProperty(Element.prototype, 'scrollLeft', {
      configurable: true,
      get() { return d.get.call(this); },
      set(v) { window.__scrollWrites++; return d.set.call(this, v); },
    });
  });
  await page.goto('/stitch.html?from=home', { waitUntil: 'load', timeout: 120000 });
  await page.locator('input[type="file"]').first().setInputFiles(fixtureFor('large'));
  await page.waitForSelector('canvas', { timeout: 90000 });
  await page.waitForTimeout(3000);
}

const scroller = () => {
  const all = [...document.querySelectorAll('.canvas-area div, .canvas-area')];
  return all.find(e => e.scrollWidth > e.clientWidth + 50 || e.scrollHeight > e.clientHeight + 50) || null;
};

/** Click one of the mode buttons in the phone palette dock. */
async function setMode(page, name) {
  const btn = page.getByRole('button', { name: new RegExp('^' + name + '$', 'i') }).first();
  await btn.click({ timeout: 10000 });
  await page.waitForTimeout(600);
}

const touchAction = (page) => page.evaluate(() =>
  getComputedStyle(document.querySelector('canvas')).touchAction);

async function swipe(page) {
  const box = await page.evaluate((fn) => {
    const el = eval('(' + fn + ')')();
    const b = el.getBoundingClientRect();
    return { x: b.x, y: b.y, w: b.width, h: b.height };
  }, scroller.toString());
  const cdp = await page.context().newCDPSession(page);
  const x0 = Math.round(box.x + box.w * 0.6);
  const y0 = Math.round(box.y + box.h * 0.5);
  await page.evaluate(() => { window.__scrollWrites = 0; });
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: x0, y: y0, id: 1, radiusX: 6, radiusY: 6, force: 1 }] });
  for (let k = 1; k <= 10; k++) {
    await cdp.send('Input.dispatchTouchEvent', {
      type: 'touchMove',
      touchPoints: [{ x: x0 - k * 14, y: y0 - k * 9, id: 1, radiusX: 6, radiusY: 6, force: 1 }],
    });
    await page.waitForTimeout(16);
  }
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await page.waitForTimeout(500);
  await cdp.detach().catch(() => {});
  return page.evaluate((fn) => {
    const el = eval('(' + fn + ')')();
    return { scrollLeft: el.scrollLeft, scrollTop: el.scrollTop, scrollWrites: window.__scrollWrites };
  }, scroller.toString());
}

test('track mode keeps the one-finger drag, because that gesture marks', async ({ page }) => {
  await openTracker(page);
  await setMode(page, 'Mark');
  const ta = await touchAction(page);
  console.log('TOUCH_ACTION_TRACK ' + ta);
  // `none` is what lets preventDefault suppress the browser's scroll so the
  // drag can mark instead.
  expect(ta).toBe('none');
});

test('nav mode hands the one-finger drag to the compositor', async ({ page }) => {
  await openTracker(page);
  await setMode(page, 'Nav');
  const ta = await touchAction(page);
  const r = await swipe(page);
  console.log('NAV_PAN ' + JSON.stringify({ touchAction: ta, ...r }));

  expect(ta, 'nav mode must allow native panning').toMatch(/pan-x|pan-y|auto|manipulation/);
  // The gesture actually moved the chart...
  expect(r.scrollLeft + r.scrollTop, 'the swipe did not scroll at all').toBeGreaterThan(0);
  // ...and did so without the main thread writing the scroll position, which
  // is the whole point of the change.
  expect(r.scrollWrites, 'the JS pan path still ran — this is not a native pan').toBe(0);
});

test('a nav-mode tap still lands on one cell, and only one', async ({ page }) => {
  // Dropping the unconditional preventDefault means the browser now
  // synthesises mouse events from a nav-mode tap where it previously did not.
  // That could plausibly place the guide crosshair twice, or at the wrong
  // cell. hlRow/hlCol are part of the saved project, so the app's own record
  // is the oracle — checked against a cell index computed independently from
  // the scroller's offsets.
  await openTracker(page);
  await setMode(page, 'Nav');

  const target = await page.evaluate((fn) => {
    const el = eval('(' + fn + ')')();
    const sr = el.getBoundingClientRect();
    const px = Math.round(sr.left + sr.width * 0.5);
    const py = Math.round(sr.top + sr.height * 0.5);
    const G = 28, scs = 20;
    return {
      px, py,
      gx: Math.floor((el.scrollLeft + (px - sr.left) - G) / scs),
      gy: Math.floor((el.scrollTop + (py - sr.top) - G) / scs),
    };
  }, scroller.toString());

  await page.mouse.click(target.px, target.py);
  await page.waitForTimeout(7000);   // past the 5 s autosave debounce

  const saved = await page.evaluate(() => new Promise((resolve) => {
    const req = indexedDB.open('CrossStitchDB');
    req.onerror = () => resolve({ error: 'open failed' });
    req.onsuccess = () => {
      const tx = req.result.transaction('projects', 'readonly');
      const all = tx.objectStore('projects').getAll();
      all.onsuccess = () => {
        const rows = (all.result || []).filter(p => p && p.settings && p.hlRow !== undefined);
        if (!rows.length) return resolve({ error: 'no saved project' });
        const p = rows.sort((a, b) => String(b.updatedAt || '').localeCompare(String(a.updatedAt || '')))[0];
        resolve({ hlRow: p.hlRow, hlCol: p.hlCol });
      };
      all.onerror = () => resolve({ error: 'read failed' });
    };
  }));
  console.log('NAV_TAP ' + JSON.stringify({ target, saved }));

  expect(saved.error).toBeUndefined();
  expect({ gx: saved.hlCol, gy: saved.hlRow }).toEqual({ gx: target.gx, gy: target.gy });
});

test('track mode still pans from the main thread, deliberately', async ({ page }) => {
  // The complement of the test above. Track mode cannot use native panning
  // without giving up drag-marking, so its pan is still JS — and this asserts
  // that on purpose, so a future "just make it all native" change has to
  // confront the trade-off rather than silently break marking.
  await openTracker(page);
  await setMode(page, 'Mark');
  const r = await swipe(page);
  console.log('TRACK_PAN ' + JSON.stringify(r));
  expect(r.scrollLeft + r.scrollTop, 'the swipe did not scroll at all').toBeGreaterThan(0);
  expect(r.scrollWrites, 'track mode should still be panning from JS').toBeGreaterThan(0);
});
