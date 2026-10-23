// A generated pattern keeps the picture type it was made as. Detail and
// tidiness reads its steps in that type, so reopening a logo and choosing
// Balanced must not give it photo shading (review of the style choice).
const { test, expect } = require('@playwright/test');
const { installLocalCdn } = require('./local-cdn');
test.beforeEach(async ({ context }) => { await installLocalCdn(context); });
const { device, generateLogo, clickGenerate, waitForEdit, skipTourIfShown } = require('./creator-helpers');

function savedSettings(page) {
  return page.evaluate(async function() {
    const p = await ProjectStorage.getActiveProject();
    return p && p.settings ? { pictureType: p.settings.pictureType ? p.settings.pictureType.id : null, dithMode: p.settings.dithMode || null, dith: !!p.settings.dith } : null;
  });
}

// The settings of the next project save after this call (the one Generate
// makes), so a poll can't pass on the save before it.
async function watchNextSave(page) {
  await page.evaluate(function() {
    window.__nextSaved = null;
    if (window.__saveWatched) return;
    window.__saveWatched = true;
    const save = ProjectStorage.save.bind(ProjectStorage);
    ProjectStorage.save = function(project) {
      if (project && project.settings) window.__nextSaved = JSON.parse(JSON.stringify(project.settings));
      return save.apply(null, arguments);
    };
  });
}
function nextSaved(page) {
  return page.evaluate(function() {
    const s = window.__nextSaved;
    return s ? { pictureType: s.pictureType ? s.pictureType.id : null, dithMode: s.dithMode || null, dith: !!s.dith } : null;
  });
}

async function reopenInConvert(page) {
  await page.reload();
  await skipTourIfShown(page);
  await waitForEdit(page);
  await page.getByRole('tab', { name: 'Convert' }).click();
}

function step(page, label) {
  return page.getByRole('radiogroup', { name: 'Detail and tidiness' }).getByRole('radio', { name: label });
}

test.describe('The picture type survives a reload', function() {
  test.use(device('desktop'));
  test.setTimeout(120000);

  test('a generated logo reopens as a graphic, and Balanced keeps it unshaded', async function({ page }) {
    await generateLogo(page);
    await expect.poll(async function() { const s = await savedSettings(page); return s && s.pictureType + ' ' + s.dithMode; }, { timeout: 15000 })
      .toBe('graphic off');

    await reopenInConvert(page);
    await expect(page.locator('.picture-type').getByRole('radio', { name: 'Graphic or logo' })).toHaveAttribute('aria-checked', 'true');
    await expect(step(page, 'Balanced')).toHaveAttribute('aria-checked', 'true');

    // The same step again, then a new pattern: still the graphic's Balanced.
    await step(page, 'More detail').click();
    await step(page, 'Balanced').click();
    await watchNextSave(page);
    await clickGenerate(page);
    await waitForEdit(page);
    await expect.poll(function() { return nextSaved(page); }, { timeout: 15000 }).not.toBeNull();
    expect(await nextSaved(page)).toEqual({ pictureType: 'graphic', dithMode: 'off', dith: false });
  });

  test('a project saved before picture types were kept follows what its picture looks like', async function({ page }) {
    await generateLogo(page);
    await expect.poll(function() { return savedSettings(page); }, { timeout: 15000 }).not.toBeNull();
    // As an older project: no picture type, shading saved only as on or off.
    await page.evaluate(async function() {
      const p = await ProjectStorage.getActiveProject();
      delete p.settings.pictureType;
      delete p.settings.dithMode;
      await ProjectStorage.save(p);
    });

    await reopenInConvert(page);
    await step(page, 'More detail').click();
    await step(page, 'Balanced').click();
    await expect(step(page, 'Balanced')).toHaveAttribute('aria-checked', 'true');
    await watchNextSave(page);
    await clickGenerate(page);
    await waitForEdit(page);
    await expect.poll(function() { return nextSaved(page); }, { timeout: 15000 }).not.toBeNull();
    // The graphic's Balanced has no shading (a photo's would).
    expect((await nextSaved(page)).dith).toBe(false);
  });
});
