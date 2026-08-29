const { test } = require('@playwright/test');

const PROBE = () => {
  const icb = document.documentElement.clientWidth;
  const all = [];
  for (const el of document.querySelectorAll('body *')) {
    const rr = el.getBoundingClientRect();
    if (rr.width === 0 && rr.height === 0) continue;
    all.push({ el, r: rr.right + window.scrollX, w: rr.width });
  }
  all.sort((a, b) => b.r - a.r);
  const desc = (el) => el.tagName.toLowerCase() + (typeof el.className === 'string' && el.className ? '.' + el.className.trim().split(/\s+/).slice(0, 3).join('.') : (el.getAttribute && el.getAttribute('class') ? '[svg]' : ''));
  const chainOf = (el) => {
    const c = [];
    let p = el;
    while (p && p !== document.documentElement) {
      const cs = getComputedStyle(p);
      const rr = p.getBoundingClientRect();
      c.push({ sel: desc(p), w: Math.round(rr.width), right: Math.round(rr.right + window.scrollX), cssW: cs.width, minW: cs.minWidth, ox: cs.overflowX, disp: cs.display, ws: cs.whiteSpace, pos: cs.position });
      p = p.parentElement;
    }
    return c;
  };
  return {
    icb, layoutViewport: window.innerWidth, docScrollWidth: document.documentElement.scrollWidth,
    farthest: all.slice(0, 6).map(x => ({ sel: desc(x.el), right: Math.round(x.r), w: Math.round(x.w), text: (x.el.textContent || '').trim().slice(0, 40) })),
    chain: all.length ? chainOf(all[0].el) : [],
  };
};

for (const p of ['/manager.html?from=home', '/home.html?from=home', '/create.html?from=home', '/stitch.html?from=home']) {
  test(`overflow ${p}`, async ({ page }) => {
    await page.goto(p, { waitUntil: 'load', timeout: 120000 });
    await page.waitForTimeout(4000);
    const r = await page.evaluate(PROBE);
    console.log('OVF ' + p + ' ' + JSON.stringify(r, null, 1));
  });
}
