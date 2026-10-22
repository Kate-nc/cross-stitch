// The Convert preview must show what the pattern will be: skipped (background)
// cells are the fabric colour, not the original picture showing through; the
// "what changed" overlay is opt-in and covers only the preview half; and the
// comparison box keeps the shape of the picture on screen while a size change
// is still being worked out.
const zlib = require('zlib');
const { test, expect } = require('@playwright/test');
const { installLocalCdn } = require('./local-cdn');
test.beforeEach(async ({ context, page }) => {
  await installLocalCdn(context);
  await page.addInitScript(() => {
    let hook;
    Object.defineProperty(window, 'useCreatorState', { configurable: true, get: () => hook, set: fn => {
      hook = function() { const state = fn(); window.__previewState = state; return state; };
    } });
  });
});
const { device, quietOnboarding, skipTourIfShown, clickGenerate, waitForEdit } = require('./creator-helpers');

const FABRIC = '#E8D9B5';
const FABRIC_RGB = 'rgb(232, 217, 181)';

// A 160x100 picture: plain white border round a colourful middle. The Creator
// leaves a plain border unstitched, so the preview has skipped cells.
function borderedPng() {
  const w = 160, h = 100, border = 14;
  const raw = Buffer.alloc((w * 4 + 1) * h);
  for (let y = 0; y < h; y++) {
    raw[y * (w * 4 + 1)] = 0;
    for (let x = 0; x < w; x++) {
      const o = y * (w * 4 + 1) + 1 + x * 4;
      const inside = x >= border && x < w - border && y >= border && y < h - border;
      raw[o] = inside ? (x * 255 / w) | 0 : 255;
      raw[o + 1] = inside ? (y * 255 / h) | 0 : 255;
      raw[o + 2] = inside ? 160 : 255;
      raw[o + 3] = 255;
    }
  }
  const crcTable = []; for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; crcTable[n] = c >>> 0; }
  const crc = (b) => { let c = 0xffffffff; for (const v of b) c = crcTable[(c ^ v) & 255] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
  const chunk = (type, data) => {
    const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
    const td = Buffer.concat([Buffer.from(type), data]);
    const c = Buffer.alloc(4); c.writeUInt32BE(crc(td));
    return Buffer.concat([len, td, c]);
  };
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 6;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}

async function openConvert(page) {
  await quietOnboarding(page);
  await page.addInitScript(function(c) { try { localStorage.setItem('cs_pref_creatorFabricColour', JSON.stringify(c)); } catch (e) {} }, FABRIC);
  await page.goto('/home.html?tab=create');
  await skipTourIfShown(page);
  await page.locator('input.home-create-file-input').setInputFiles({ name: 'bordered.png', mimeType: 'image/png', buffer: borderedPng() });
  await page.waitForURL(/create\.html/);
  await page.waitForSelector('.rpanel', { state: 'attached' });
  await skipTourIfShown(page);
  await expect(page.getByTestId('cmp-preview-layer')).toBeVisible({ timeout: 20000 });
  // The first pass is the quick one; wait for the settled picture and spinner.
  await expect(page.getByRole('status', { name: 'Updating preview' })).toHaveCount(0, { timeout: 20000 });
}

const previewPixels = (page) => page.evaluate(async function() {
  const img = document.querySelector('img[alt="Preview"]');
  await img.decode();
  const c = document.createElement('canvas'); c.width = img.naturalWidth; c.height = img.naturalHeight;
  const x = c.getContext('2d'); x.drawImage(img, 0, 0);
  const d = x.getImageData(0, 0, c.width, c.height).data;
  let clear = 0; for (let i = 3; i < d.length; i += 4) if (d[i] === 0) clear++;
  return { w: c.width, h: c.height, clear };
});

test.describe('Convert preview fidelity', function() {
  test.use(device('desktop'));
  test.setTimeout(90000);

  test('skipped cells are the fabric colour, not the original picture', async function({ page }) {
    await openConvert(page);
    const px = await previewPixels(page);
    expect(px.clear).toBeGreaterThan(0);   // the border really is skipped, so this matters
    await expect(page.getByTestId('cmp-preview-layer')).toHaveCSS('background-color', FABRIC_RGB);
  });

  test('the what-changed overlay never appears on its own, and covers only the preview half', async function({ page }) {
    await openConvert(page);
    await page.getByLabel('Width in stitches').fill('70');
    await page.keyboard.press('Tab');
    for (let i = 0; i < 22; i++) {            // 2.2 s: past the debounce and the full pass
      await expect(page.getByTestId('cmp-diff')).toHaveCount(0);
      await page.waitForTimeout(100);
    }
    await expect(page.getByRole('status', { name: 'Updating preview' })).toHaveCount(0, { timeout: 20000 });
    const toggle = page.getByRole('button', { name: 'Show what changed' });
    await expect(toggle).toBeVisible({ timeout: 10000 });
    await toggle.click();
    const diff = page.getByTestId('cmp-diff');
    await expect(diff).toHaveCount(1);
    await expect(diff).toHaveCSS('clip-path', /inset\(0px 0px 0px 50%\)/);
    await page.getByRole('button', { name: 'Hide what changed' }).click();
    await expect(diff).toHaveCount(0);
  });

  test('the comparison box keeps the picture\'s shape while a size change is pending', async function({ page }) {
    await openConvert(page);
    const shape = () => page.evaluate(function() {
      const img = document.querySelector('img[alt="Preview"]');
      const box = document.querySelector('[data-testid="cmp-box"]').getBoundingClientRect();
      return { box: box.width / box.height, picture: img.naturalWidth / img.naturalHeight };
    });
    const before = await shape();
    await page.getByLabel('Lock aspect ratio').uncheck();
    await page.getByLabel('Height in stitches').fill('10');
    await page.keyboard.press('Tab');
    await page.waitForTimeout(120);            // inside the 400 ms debounce: the old picture is still showing
    const during = await shape();
    expect(Math.abs(during.box / during.picture - 1)).toBeLessThan(0.03);
    expect(Math.abs(during.box / before.box - 1)).toBeLessThan(0.03);
    await expect(page.getByRole('status', { name: 'Updating preview' })).toHaveCount(0, { timeout: 20000 });
    const after = await shape();
    expect(Math.abs(after.box / after.picture - 1)).toBeLessThan(0.03);
  });

  test('a replacement or cropped source clears the old result before the next pass', async ({ page }) => {
    await openConvert(page);
    await page.clock.install({time:new Date('2026-01-01T00:00:00Z')});
    await page.clock.pauseAt(new Date('2026-01-01T00:01:00Z'));
    await page.evaluate(async () => {
      const c = document.createElement('canvas'); c.width = 30; c.height = 20;
      const x = c.getContext('2d'); x.fillStyle = 'red'; x.fillRect(0, 0, 30, 20);
      const image = new Image(); image.src = c.toDataURL(); await image.decode();
      ReactDOM.flushSync(() => window.__previewState.setImg(image));
    });
    // Let React commit the effect's invalidation without reaching the 400 ms debounce.
    await page.clock.runFor(1);
    const pending = await page.evaluate(() => {
      const s = window.__previewState;
      return {url:s.previewUrl, stats:s.previewStats, mapped:s.previewMapped, dims:s.previewDims, heat:s.previewHeatmap, highlight:s.previewHighlight, loading:s.previewLoading};
    });
    expect(pending).toEqual({url:null, stats:null, mapped:null, dims:null, heat:null, highlight:null, loading:true});
    await page.clock.runFor(450);
    await expect(page.getByTestId('cmp-preview-layer')).toBeVisible();
    await expect(page.getByRole('status', {name:'Updating preview'})).toHaveCount(0);
  });

  test('a conversion exception shows recovery and Retry preview produces a complete result', async ({ page }) => {
    const errors = []; page.on('pageerror', e => errors.push(e.message));
    await openConvert(page);
    // The conversion runs in a worker; the step on the page (the picture
    // shrunk to stitches) is where a failure can be injected.
    await page.evaluate(() => {
      window.__savedGridPixels = window.gridPixels;
      window.gridPixels = () => { throw new Error('injected preview failure'); };
      window.__previewState.setBri(15);
    });
    await expect(page.getByRole('alert').filter({hasText:'Could not update the preview'})).toBeVisible();
    await expect(page.getByRole('status', {name:'Updating preview'})).toHaveCount(0);
    expect(await page.evaluate(() => window.__previewState.previewStats)).toBeNull();
    await page.evaluate(() => { window.gridPixels = window.__savedGridPixels; });
    await page.getByRole('button', {name:'Retry preview'}).click();
    await expect(page.getByTestId('cmp-preview-layer')).toBeVisible();
    await expect(page.getByRole('status', {name:'Updating preview'})).toHaveCount(0);
    expect(await page.evaluate(() => window.__previewState.previewError)).toBeNull();
    expect(errors).toEqual([]);
  });

  // The preview is converted in a worker at the chart's own size, so a chart
  // bigger than 200 by 200 is previewed stitch for stitch, as Generate makes it.
  test('a large chart is previewed at its own size and matches the generated chart', async ({ page }) => {
    await openConvert(page);
    await page.evaluate(() => { const s = window.__previewState; s.setArLock(false); s.setSW(320); s.setSH(200); });
    await expect.poll(() => page.evaluate(() => {
      const s = window.__previewState; return s.previewLoading ? null : s.previewDims;
    }), {timeout:60000}).toEqual({pw:320, ph:200});
    expect(await page.evaluate(() => window.__previewState.previewMapped.length)).toBe(64000);
    const before = await page.evaluate(() => window.__previewState.previewMapped.map(c => c.id));
    await clickGenerate(page); await waitForEdit(page);
    expect(await page.evaluate(() => window.__previewState.pat.map(c => c.id))).toEqual(before);
  });

  // Detail and tidiness: one choice sets shading and tidying together; a
  // change under Fine-tune shows Custom; the picture type is unaffected.
  test('the Detail and tidiness choice sets shading and tidying together', async ({ page }) => {
    await openConvert(page);
    const step = (name) => page.getByRole('radiogroup', {name:'Detail and tidiness'}).getByRole('radio', {name, exact:true});
    const type = await page.evaluate(() => window.__previewState.pictureType);
    await step('Easiest to stitch').click();
    await expect(step('Easiest to stitch')).toHaveAttribute('aria-checked', 'true');
    expect(await page.evaluate(() => {
      const s = window.__previewState; return [s.stitchStyle, s.dithMode, s.stitchCleanup.enabled, s.stitchCleanup.protectDetails];
    })).toEqual(['easiest', 'off', true, false]);
    expect(await page.evaluate(() => window.__previewState.pictureType)).toBe(type);
    await expect(page.getByText(/^In the preview: [\d,]+ confetti stitch/)).toBeVisible({timeout:20000});
    await page.evaluate(() => window.__previewState.setOrphans(3));
    await expect(page.getByText(/^Custom: your own mix/)).toBeVisible();
    await step('Balanced').click();
    await expect(step('Balanced')).toHaveAttribute('aria-checked', 'true');
  });

  // Adjustments are applied to the stitch-sized picture by one formula on
  // every browser (gridPixels), so there is no separate ctx.filter fallback.
  test('adjusted preview agrees with generated cells', async ({ page }) => {
    await openConvert(page);
    const oldUrl = await page.evaluate(() => window.__previewState.previewUrl);
    await page.evaluate(() => {
      const s = window.__previewState;
      s.setBri(20); s.setCon(-15); s.setSat(25); s.setDithMode('bayer4');
    });
    await expect.poll(() => page.evaluate(oldUrl => {
      const s = window.__previewState; return {changed:s.previewUrl !== oldUrl,bri:s.bri,con:s.con,sat:s.sat,loading:s.previewLoading,error:s.previewError};
    }, oldUrl), {timeout:30000}).toEqual({changed:true,bri:20,con:-15,sat:25,loading:false,error:null});
    const before = await page.evaluate(() => window.__previewState.previewMapped.map(c => c.id));
    await clickGenerate(page); await waitForEdit(page);
    expect(await page.evaluate(() => window.__previewState.pat.map(c => c.id))).toEqual(before);
  });
});

// Exercise the real browser component with tiny deterministic images so that
// scheduling and alpha comparisons cannot be hidden by a photographic fixture.
test.describe('Comparison overlay lifecycle', () => {
  test.use(device('desktop'));
  async function mount(page) {
    await quietOnboarding(page);
    await page.goto('/create.html?action=new-blank');
    await page.waitForFunction(() => typeof window.ComparisonSlider === 'function');
    await page.evaluate(() => {
      const host = document.createElement('div'); host.id = 'comparison-test';
      host.style.cssText = 'position:fixed;inset:0;background:white;z-index:999999;width:400px;height:400px';
      document.body.appendChild(host);
      window.__cmpRoot = ReactDOM.createRoot(host);
      window.__pixelUrl = (colour) => {
        const c = document.createElement('canvas'); c.width = 4; c.height = 4;
        if (colour) { const x = c.getContext('2d'); x.fillStyle = colour; x.fillRect(0,0,4,4); }
        return c.toDataURL();
      };
      window.__cmpProps = {originalSrc:__pixelUrl('white'), previewSrc:__pixelUrl('red'), width:4, height:4, fabricColour:'#E8D9B5'};
      ReactDOM.flushSync(() => __cmpRoot.render(React.createElement(ComparisonSlider, __cmpProps)));
    });
    await expect(page.locator('#comparison-test img[alt="Preview"]')).toBeVisible();
  }
  async function update(page, values) {
    await page.evaluate(values => {
      const {colour, originalColour, ...rest} = values;
      if (colour !== undefined) rest.previewSrc = __pixelUrl(colour);
      if (originalColour !== undefined) rest.originalSrc = __pixelUrl(originalColour);
      Object.assign(__cmpProps, rest);
      ReactDOM.flushSync(() => __cmpRoot.render(React.createElement(ComparisonSlider, __cmpProps)));
    }, values);
  }
  async function changedPixels(page) {
    await page.locator('#comparison-test').getByRole('button', {name:'Show what changed'}).click();
    return page.locator('#comparison-test [data-testid="cmp-diff"] img').evaluate(async img => {
      await img.decode(); const c = document.createElement('canvas'); c.width=4; c.height=4;
      const x=c.getContext('2d'); x.drawImage(img,0,0);
      return Array.from(x.getImageData(0,0,4,4).data).filter((v,i)=>i%4===3&&v>0).length;
    });
  }
  test('the diff compares completed results and ignores the intermediate quick pass', async ({page}) => {
    await mount(page);
    await update(page, {colour:'blue', previewLoading:true});
    await expect(page.locator('#comparison-test').getByRole('button', {name:'Show what changed'})).toHaveCount(0);
    await update(page, {colour:'red', previewLoading:false});
    // Identical settled results need no comparison overlay at all.
    await expect(page.locator('#comparison-test').getByRole('button', {name:'Show what changed'})).toHaveCount(0);
    await update(page, {colour:'blue', previewLoading:true});
    await update(page, {colour:'green', previewLoading:false});
    expect(await changedPixels(page)).toBe(16);
  });
  test('changes in transparency are visible and a replacement source resets the baseline', async ({page}) => {
    await mount(page);
    await update(page, {colour:'black'});
    await expect(page.locator('#comparison-test').getByRole('button', {name:'Show what changed'})).toBeVisible();
    await update(page, {colour:null});
    expect(await changedPixels(page)).toBe(16);
    await update(page, {colour:'green', originalColour:'yellow'});
    await expect(page.locator('#comparison-test [data-testid="cmp-diff"]')).toHaveCount(0);
    await expect(page.locator('#comparison-test').getByRole('button', {name:/what changed/})).toHaveCount(0);
  });
  test('heatmap and highlight stay on the preview side and disappear while updating', async ({page}) => {
    await mount(page);
    await page.evaluate(() => {
      Object.assign(__cmpProps, {heatmapSrc:__pixelUrl('orange'),highlightSrc:__pixelUrl('white')});
      ReactDOM.flushSync(() => __cmpRoot.render(React.createElement(ComparisonSlider,__cmpProps)));
    });
    await page.locator('#comparison-test').getByRole('button', {name:'Heatmap',exact:true}).click();
    for(const id of ['cmp-heatmap','cmp-highlight']) await expect(page.locator('#comparison-test').getByTestId(id)).toHaveCSS('clip-path', /50%/);
    await update(page, {previewLoading:true});
    for(const id of ['cmp-heatmap','cmp-highlight']) await expect(page.locator('#comparison-test').getByTestId(id)).toHaveCount(0);
  });

  test('the magnifier divider follows the sampled pixels and retains fabric behind empty cells', async ({page}) => {
    await mount(page);
    await update(page, {colour:null});
    await page.locator('#comparison-test').getByRole('button', {name:'Magnifier',exact:true}).click();
    const box = await page.locator('#comparison-test').getByTestId('cmp-box').boundingBox();
    // At 60% across, the entire 2.5x magnified sample is to the right of the 50% divider.
    await page.mouse.move(box.x + box.width * .6, box.y + box.height * .5);
    const lensPreview = page.locator('#comparison-test div[style*="background-image"]').last();
    await expect(lensPreview).toHaveCSS('clip-path', 'inset(0px 0px 0px 0%)');
    await expect(lensPreview).toHaveCSS('background-color', FABRIC_RGB);
  });
});
