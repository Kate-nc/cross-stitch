// Audit B-10 (name prompt on every reload) and B-11 (fast strokes left gaps).
const { test, expect } = require('@playwright/test');
const { device, quietOnboarding, generateLogo, pickDarkSwatch, startBlankGrid } = require('./creator-helpers');

const pixel5 = device('Pixel 5');

const nameDialog = (page) => page.getByRole('heading', { name: 'Name Your Project' });

// Colour of every chart cell in [x0..x1] x [y0..y1], read off the canvas.
async function sampleCells(page, x0, y0, x1, y1) {
  return page.evaluate(function(a) {
    const canvas = document.querySelector('.canvas-area canvas');
    const box = canvas.getBoundingClientRect();
    const scale = canvas.width / box.width;
    const cell = (box.width - a.G - 2) / a.sW;
    const ctx = canvas.getContext('2d');
    const out = {};
    for (let y = a.y0; y <= a.y1; y++) {
      for (let x = a.x0; x <= a.x1; x++) {
        const px = Math.round((a.G + (x + 0.5) * cell) * scale);
        const py = Math.round((a.G + (y + 0.5) * cell) * scale);
        out[x + ',' + y] = Array.from(ctx.getImageData(px, py, 1, 1).data).slice(0, 3).join(',');
      }
    }
    return out;
  }, { x0: x0, y0: y0, x1: x1, y1: y1, G: 28, sW: 80 });
}

async function cellPoint(page, gx, gy) {
  return page.evaluate(function(a) {
    const box = document.querySelector('.canvas-area canvas').getBoundingClientRect();
    const cell = (box.width - a.G - 2) / a.sW;
    return { x: box.left + a.G + (a.gx + 0.5) * cell, y: box.top + a.G + (a.gy + 0.5) * cell };
  }, { gx: gx, gy: gy, G: 28, sW: 80 });
}

test.describe('Creator behaviour on Pixel 5', function() {
  test.use(pixel5);

  test('a fast diagonal swipe paints a continuous line', async function({ page }) {
    await generateLogo(page);
    await page.waitForTimeout(500);

    // On a phone a new pattern opens in Navigate (P0-1, P1-1): pick Paint first.
    await page.getByRole('button', { name: 'Paint tool' }).tap();
    // A dark thread, so every cell on the line changes colour.
    await pickDarkSwatch(page);
    const before = await sampleCells(page, 5, 5, 55, 55);

    // 12 touch moves across 40 cells: about three cells per sample.
    const from = await cellPoint(page, 10, 10);
    const to = await cellPoint(page, 50, 50);
    const cdp = await page.context().newCDPSession(page);
    const touch = (type, p) => cdp.send('Input.dispatchTouchEvent', {
      type: type, touchPoints: p ? [{ x: Math.round(p.x), y: Math.round(p.y), id: 1, radiusX: 2, radiusY: 2, force: 1 }] : [],
    });
    await touch('touchStart', from);
    for (let i = 1; i <= 12; i++) {
      await touch('touchMove', { x: from.x + (to.x - from.x) * i / 12, y: from.y + (to.y - from.y) * i / 12 });
    }
    await touch('touchEnd');
    await page.waitForTimeout(400);

    const after = await sampleCells(page, 5, 5, 55, 55);
    const changed = Object.keys(after).filter((k) => after[k] !== before[k])
      .map((k) => k.split(',').map(Number));
    expect(changed.length).toBeGreaterThanOrEqual(36);

    // One 8-connected run of painted cells, not separate dabs.
    const key = (c) => c[0] + ',' + c[1];
    const set = new Set(changed.map(key));
    const seen = new Set([key(changed[0])]);
    const queue = [changed[0]];
    while (queue.length) {
      const [x, y] = queue.pop();
      for (let dx = -1; dx <= 1; dx++) {
        for (let dy = -1; dy <= 1; dy++) {
          const k = (x + dx) + ',' + (y + dy);
          if (set.has(k) && !seen.has(k)) { seen.add(k); queue.push([x + dx, y + dy]); }
        }
      }
    }
    expect(seen.size).toBe(set.size);

    // The whole stroke is one undo step. (Clicked rather than tapped: after a
    // CDP-dispatched swipe, Chrome turns the next tap into no click at all.)
    await page.evaluate(() => document.querySelector('[aria-label=Undo]').click());
    await page.waitForTimeout(300);
    const undone = await sampleCells(page, 5, 5, 55, 55);
    expect(Object.keys(undone).filter((k) => undone[k] !== before[k]).length).toBe(0);
  });

  test('generating names the project after the image, with no prompt', async function({ page }) {
    await generateLogo(page);
    await page.waitForTimeout(2500);
    await expect(nameDialog(page)).toHaveCount(0);
    // The phone top bar shows the name (P1-2).
    await expect(page.locator('.cc-name__text')).toHaveText('logo');
  });

  test('a blank grid opens with no name prompt', async function({ page }) {
    await quietOnboarding(page);
    await startBlankGrid(page);
    await page.waitForSelector('.creator-rail', { timeout: 15000 });
    await page.waitForTimeout(2500);
    await expect(page.getByRole('heading', { name: /Name/ })).toHaveCount(0);
    await expect(page.locator('.cc-name__text')).toHaveText('Untitled design');
  });

  test('Print PDF offers a name once for an auto-named project', async function({ page }) {
    await generateLogo(page);
    const prompt = page.getByRole('heading', { name: 'Name this pattern' });
    // On a phone Print PDF is in the top bar's More sheet (P1-2).
    const printPdf = async function() {
      await page.locator('.cc-more').click();
      await page.getByRole('dialog', { name: 'Pattern actions' }).getByRole('button', { name: 'Print PDF' }).click();
    };
    await printPdf();
    await expect(prompt).toBeVisible();
    await expect(page.getByText('Give this pattern a name? It will appear on the PDF and in your library.')).toBeVisible();
    await expect(page.locator('.name-prompt-input')).toHaveValue('logo');
    await page.getByRole('button', { name: 'Skip', exact: true }).click();
    await expect(prompt).toHaveCount(0);
    await page.waitForTimeout(1500);
    await printPdf();
    await page.waitForTimeout(1000);
    await expect(prompt).toHaveCount(0);
  });
});
