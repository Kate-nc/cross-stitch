// Convert laid out like Edit (step tabs that fall through with Next), and a
// preview that shows the finished piece: stitched on the fabric by default,
// whole, saying what each change did, and still live once a chart exists.
const { test, expect } = require('@playwright/test');
const { installLocalCdn } = require('./local-cdn');
test.beforeEach(async ({ context, page }) => {
  await installLocalCdn(context);
  // The Creator's state, for checks the screen can't show directly.
  await page.addInitScript(() => {
    let hook;
    Object.defineProperty(window, 'useCreatorState', { configurable: true, get: () => hook, set: fn => {
      hook = function() { const state = fn(); window.__cs = state; return state; };
    } });
  });
});
const { device, openConvertWithLogo, clickGenerate, waitForEdit, convertStep, previewView } = require('./creator-helpers');

const settled = (page) => expect(page.getByRole('status', { name: 'Updating preview' })).toHaveCount(0, { timeout: 20000 });

test.describe('Convert steps and preview on desktop', function() {
  test.use(device('desktop'));
  test.setTimeout(90000);

  test('the steps run Picture, Size, Threads, Detail, and Next falls through them', async function({ page }) {
    await openConvertWithLogo(page);
    const tabs = page.getByRole('tablist', { name: 'Convert steps' }).getByRole('tab');
    await expect(tabs).toHaveText(['Picture', 'Size', 'Threads', 'Detail', 'Project']);
    await expect(page.locator('#convert-tab-picture')).toHaveAttribute('aria-selected', 'true');
    await expect(page.getByRole('radiogroup', { name: 'What kind of picture is this?' })).toBeVisible();
    await page.getByRole('button', { name: 'Next: Size and fabric' }).click();
    await expect(page.locator('.size-field').getByLabel('Width in stitches')).toBeVisible();
    await page.getByRole('button', { name: 'Next: Threads' }).click();
    await expect(page.getByRole('slider', { name: 'Threads (max)' })).toBeVisible();
    await page.getByRole('button', { name: 'Next: Detail and tidiness' }).click();
    await expect(page.getByRole('radiogroup', { name: 'Detail and tidiness' })).toBeVisible();
    await page.getByRole('button', { name: 'Next: Project' }).click();
    await expect(page.getByLabel('Pattern name')).toBeVisible();
    // Generate stays at the foot with what it will make.
    await expect(page.locator('[data-convert-summary]')).toContainText('stitches');
    await expect(page.locator('[data-convert-summary]')).toContainText('DMC threads');
  });

  test('the preview is stitched on the fabric by default, and Flat and Before / after show the same chart', async function({ page }) {
    await page.addInitScript(function() { try { localStorage.setItem('cs_pref_creatorFabricColour', JSON.stringify('#1F2A44')); } catch (e) {} });
    await openConvertWithLogo(page);
    await settled(page);
    const stitched = page.getByTestId('cvp-stitched').locator('canvas');
    await expect(stitched).toBeVisible();
    // Drawn, at the width it is shown, with the navy fabric between stitches.
    const px = await stitched.evaluate(function(c) {
      const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
      let navy = 0, other = 0;
      for (let i = 0; i < d.length; i += 4) {
        if (Math.abs(d[i] - 31) < 12 && Math.abs(d[i + 1] - 42) < 12 && Math.abs(d[i + 2] - 68) < 12) navy++; else other++;
      }
      return { navy, other, cssW: c.getBoundingClientRect().width, boxW: c.parentNode.parentNode.clientWidth };
    });
    // The logo's background is left unstitched, so much of it is fabric; the
    // rest is stitches.
    expect(px.navy).toBeGreaterThan(0);
    expect(px.other).toBeGreaterThan((px.navy + px.other) * 0.1);
    expect(Math.abs(px.cssW - px.boxW)).toBeLessThan(4);
    await previewView(page, 'flat');
    await expect(page.getByTestId('cvp-flat').locator('img[alt="Preview"]')).toBeVisible();
    await previewView(page, 'compare');
    await expect(page.getByTestId('cmp-preview-layer')).toBeVisible();
    // The choice is remembered for next time.
    expect(await page.evaluate(function() { return window.UserPrefs.get('creator.convertPreviewView'); })).toBe('compare');
  });

  test('a change says what it did to the preview', async function({ page }) {
    await openConvertWithLogo(page);
    await settled(page);
    await convertStep(page, 'threads');
    await page.getByRole('slider', { name: 'Threads (max)' }).fill('3');
    await settled(page);
    const line = page.locator('[data-preview-change]');
    await expect(line).toContainText('Threads (max):');
    await expect(line).toContainText(/stitch(es)? changed|no stitches changed/);
    await expect(page.locator('[data-threads-used]')).toContainText(/In the preview: [1-3] threads?/);
  });

  test('once a chart exists, Convert still shows the live preview and says when it differs', async function({ page }) {
    await openConvertWithLogo(page);
    await clickGenerate(page);
    await waitForEdit(page);
    await page.getByRole('button', { name: 'Back to Convert' }).click();
    await expect(page.locator('.cvp')).toBeVisible();
    await expect(page.locator('.cs-chart-scroll')).toHaveCount(0);
    await settled(page);
    await expect(page.locator('.cv-footer__state')).toHaveText('Your chart was made with these settings.');
    await convertStep(page, 'threads');
    await page.getByRole('slider', { name: 'Threads (max)' }).fill('3');
    await expect(page.getByText('This preview shows your new settings. Your chart changes when you Regenerate.')).toBeVisible();
    await expect(page.locator('.cv-footer__state')).toContainText('Regenerate to replace your chart');
  });

  test('a new thread brand reads as a change from the chart', async function({ page }) {
    await openConvertWithLogo(page);
    await clickGenerate(page);
    await waitForEdit(page);
    await page.getByRole('button', { name: 'Back to Convert' }).click();
    await settled(page);
    await expect(page.locator('.cv-footer__state')).toHaveAttribute('data-chart-state', 'same');
    await convertStep(page, 'threads');
    await page.locator('[data-thread-brand="anchor"]').click();
    await expect(page.locator('.cv-footer__state')).toHaveAttribute('data-chart-state', 'changed');
    await expect(page.getByText('This preview shows your new settings. Your chart changes when you Regenerate.')).toBeVisible();
  });

  test('the top bar\'s Regenerate asks before replacing an edited chart', async function({ page }) {
    await openConvertWithLogo(page);
    await clickGenerate(page);
    await waitForEdit(page);
    await page.evaluate(() => { window.__patBefore = window.__cs.pat; window.__cs.setEditHistory([{ type: 'test-edit' }]); });
    // Regenerate is in Convert's top bar; going back with edits asks first.
    await page.getByRole('button', { name: 'Back to Convert' }).click();
    await page.getByRole('button', { name: 'Go to Convert' }).click();
    await expect(page.locator('.cv-footer__state')).toContainText('then edited');
    await clickGenerate(page);
    const dialog = page.getByRole('dialog').filter({ hasText: 'Replace your chart?' });
    await expect(dialog).toBeVisible();
    await expect(dialog).toContainText('discards the 1 edit you made');
    await dialog.getByRole('button', { name: 'Cancel' }).click();
    await page.waitForTimeout(500);
    // Cancel leaves the chart and its edits as they were.
    expect(await page.evaluate(() => window.__cs.pat === window.__patBefore)).toBe(true);
    expect(await page.evaluate(() => window.__cs.editHistory.length)).toBe(1);
  });

  test('Show tidied stitches shows in every preview view', async function({ page }) {
    await openConvertWithLogo(page);
    await settled(page);
    // The logo no longer needs this cleanup after edge folding. Use a
    // deterministic field of similar grey shades that actually gets tidied.
    await page.evaluate(async () => {
      const canvas=document.createElement('canvas');canvas.width=40;canvas.height=40;
      const ctx=canvas.getContext('2d');
      for(let y=0;y<40;y++)for(let x=0;x<40;x++){const v=100+(x*17+y*31+x*y*7)%61;ctx.fillStyle='rgb('+v+','+v+','+v+')';ctx.fillRect(x,y,1,1);}
      const image=new Image();image.src=canvas.toDataURL();await image.decode();
      const state=window.__cs;state.setImg(image);state.setSW(40);state.setSH(40);state.setSkipBg(false);state.setDithMode('off');
      state.setStitchCleanup({enabled:true,strength:'balanced',protectDetails:false});state.setOrphans(3);
    });
    await settled(page);
    await expect.poll(() => page.evaluate(() => !!window.__cs.previewTidied), { timeout: 20000 }).toBe(true);
    await page.getByRole('button', { name: 'Show tidied stitches' }).click();
    await expect(page.getByTestId('cvp-stitched').getByTestId('cvp-tidied')).toHaveCount(1);
    await previewView(page, 'flat');
    await expect(page.getByTestId('cvp-flat').getByTestId('cvp-tidied')).toHaveCount(1);
    await previewView(page, 'compare');
    await expect(page.getByTestId('cmp-tidied')).toHaveCount(1);
    await expect(page.getByTestId('cmp-tidied')).toHaveCSS('clip-path', /50%/);
  });
});

test.describe('Crop to the stitches on desktop', function() {
  test.use(device('desktop'));
  test.setTimeout(90000);

  test('crops the chart, keeps its stitches and progress, and Undo puts the edges back', async function({ page }) {
    await openConvertWithLogo(page);
    await clickGenerate(page);
    await waitForEdit(page);
    const before = await page.evaluate(() => {
      const s = window.__cs;
      const done = new Uint8Array(s.pat.length);
      const first = s.pat.findIndex(c => c.id !== '__skip__' && c.id !== '__empty__');
      done[first] = 1; s.setDone(done);
      return { w: s.sW, h: s.sH, stitched: s.pat.filter(c => c.id !== '__skip__' && c.id !== '__empty__').length };
    });
    await page.locator('.creator-sidebar-tab[data-tab-id="tools"]').click();
    await page.getByRole('button', { name: 'Crop to the stitches' }).click();
    await expect.poll(() => page.evaluate(() => window.__cs.sW)).toBeLessThan(before.w);
    const after = await page.evaluate(() => {
      const s = window.__cs;
      return { pat: !!s.pat, len: s.pat.length, w: s.sW, h: s.sH, mode: s.appMode,
        stitched: s.pat.filter(c => c.id !== '__skip__' && c.id !== '__empty__').length,
        done: Array.from(s.done || []).filter(Boolean).length, undo: s.editHistory.length };
    });
    expect(after).toMatchObject({ pat: true, mode: 'edit', stitched: before.stitched, done: 1, undo: 1 });
    expect(after.len).toBe(after.w * after.h);
    await page.keyboard.press('Control+z');
    await expect.poll(() => page.evaluate(() => [window.__cs.sW, window.__cs.sH])).toEqual([before.w, before.h]);
  });
});
