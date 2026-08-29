/* Shared harness: render the OLD four-div gauge and the NEW one-element
   gauge against the live stylesheet and diff their pixels. Used from both the
   phone project (DPR 2.75) and the desktop project (DPR 1) — the two answer
   different questions, so both matter. */
const OLD_CSS = `
  .old-gauge{display:flex;gap:2px;flex-shrink:0;}
  .old-gauge .seg{width:4px;height:14px;border-radius:2px;background:var(--surface-tertiary);}
  .old-gauge .seg.full{background:var(--accent);}
  .old-gauge .seg.warn{background:var(--warning);}
`;

// Exactly the class logic the old JSX used.
const oldSegs = (level) => [0, 1, 2, 3].map(s =>
  `<div class="seg${(s < level && level < 4) ? ' full' : ''}${(level === 1 && s === 0) ? ' warn' : ''}${level === 4 ? ' full' : ''}"></div>`
).join('');

async function compareLevels(page) {
  await page.goto('/home.html?from=home', { waitUntil: 'load', timeout: 120000 });
  await page.waitForTimeout(1500);
  const results = [];
  for (const level of [0, 1, 2, 3, 4]) {
    await page.evaluate(({ level, OLD_CSS, oldHtml }) => {
      const prev = document.getElementById('gauge-harness');
      if (prev) prev.remove();
      const host = document.createElement('div');
      host.id = 'gauge-harness';
      host.style.cssText = 'position:fixed;top:0;left:0;z-index:2147483647;';
      // .tcard is needed only as an ANCESTOR (the rule is `.tcard .gauge`);
      // its own padding/border must not touch the capture window.
      const card = 'padding:0;border:0;margin:0;background:none;box-shadow:none;display:block;width:auto;height:auto;content-visibility:visible;border-radius:0;';
      const cell = 'width:22px;height:14px;overflow:hidden;background:var(--surface);display:flex;align-items:flex-start;padding:0;border:0;margin:0;';
      host.innerHTML = `<style>${OLD_CSS}</style>
        <div class="tcard" style="${card}"><div id="gauge-old" style="${cell}"><div class="old-gauge">${oldHtml}</div></div></div>
        <div class="tcard" style="${card}"><div id="gauge-new" style="${cell}"><div class="gauge" data-level="${level}"></div></div></div>`;
      document.body.appendChild(host);
    }, { level, OLD_CSS, oldHtml: oldSegs(level) });

    const a = (await page.locator('#gauge-old').screenshot()).toString('base64');
    const b = (await page.locator('#gauge-new').screenshot()).toString('base64');
    const diff = await page.evaluate(async ({ a, b }) => {
      const decode = async (b64) => {
        const bin = Uint8Array.from(atob(b64), c => c.charCodeAt(0));
        const bmp = await createImageBitmap(new Blob([bin], { type: 'image/png' }));
        const c = document.createElement('canvas');
        c.width = bmp.width; c.height = bmp.height;
        const cx = c.getContext('2d');
        cx.drawImage(bmp, 0, 0);
        return { w: bmp.width, h: bmp.height, d: cx.getImageData(0, 0, bmp.width, bmp.height).data };
      };
      const A = await decode(a), B = await decode(b);
      if (A.w !== B.w || A.h !== B.h) return { mismatch: `${A.w}x${A.h} vs ${B.w}x${B.h}` };
      let differing = 0, maxDelta = 0;
      for (let i = 0; i < A.d.length; i += 4) {
        let px = 0;
        for (let k = 0; k < 4; k++) {
          const dd = Math.abs(A.d[i + k] - B.d[i + k]);
          if (dd > maxDelta) maxDelta = dd;
          if (dd > 2) px = 1;
        }
        differing += px;
      }
      // Structural check that survives sub-pixel rounding: sample the CENTRE
      // of each of the four 4px pills and each of the three 2px gaps. Those
      // points are well inside solid colour, so they must match exactly even
      // when the antialiased edges do not.
      const dpr = A.w / 22;
      const centres = [2, 8, 14, 20, 5, 11, 17].map(cssX => Math.round(cssX * dpr));
      const midY = Math.floor(A.h / 2);
      let centreMismatches = 0;
      for (const x of centres) {
        const i = (midY * A.w + Math.min(x, A.w - 1)) * 4;
        for (let k = 0; k < 4; k++) if (Math.abs(A.d[i + k] - B.d[i + k]) > 2) { centreMismatches++; break; }
      }
      return { w: A.w, h: A.h, pixels: A.d.length / 4, differing, maxDelta, centreMismatches };
    }, { a, b });
    results.push({ level, ...diff });
  }
  await page.evaluate(() => { const h = document.getElementById('gauge-harness'); if (h) h.remove(); });
  return results;
}

module.exports = { compareLevels };
