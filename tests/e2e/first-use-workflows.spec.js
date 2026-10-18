const { test, expect } = require('@playwright/test');
const path = require('path');
const { installLocalCdn } = require('./local-cdn');
const { device, quietOnboarding, LOGO, startBlankGrid, openConvertWithLogo } = require('./creator-helpers');
const { ensureTrackerProjectFixture, TRACKER_CANVAS, trackerCellPoint, trackerDoneCount } = require('./touch-helpers');
test.beforeEach(async ({context}) => installLocalCdn(context));

async function storageSnapshot(page) {
  return page.evaluate(async () => {
    const projects = await ProjectStorage.listProjects();
    const records = await Promise.all(projects.map(p => ProjectStorage.get(p.id)));
    const db = await openManagerDB();
    const stash = await new Promise((resolve,reject) => {
      const r = db.transaction('manager_state').objectStore('manager_state').getAll();
      r.onsuccess = () => resolve(r.result); r.onerror = () => reject(r.error);
    });
    return {records,stash,active:localStorage.getItem('crossstitch_active_project')};
  });
}
for (const name of ['desktop','Pixel 5']) {
  test.describe('First use on '+name, () => {
    test.use(device(name));
    test('first visit exposes all paths; practice and tab Back never write real data', async ({page}) => {
      await page.goto('/home.html');
      await expect(page.getByRole('button',{name:/Stitch an existing chart/})).toBeVisible();
      await expect(page.getByRole('button',{name:/Convert a picture/})).toBeVisible();
      await expect(page.getByRole('link',{name:/Draw a pattern/})).toBeVisible();
      await expect(page.getByText(/A photograph of a printed chart is different/)).toBeVisible();
      const before = await storageSnapshot(page);
      await page.getByText('Try a sample project',{exact:true}).click();
      const sample = page.locator('.home-sample');
      await sample.getByRole('button',{name:'Mark next stitch'}).click();
      await expect(sample.getByRole('status')).toContainText('1 of');
      await sample.getByRole('button',{name:'Undo sample mark'}).click();
      await expect(sample.getByRole('status')).toContainText('0 of');
      await sample.getByRole('button',{name:'Mark next stitch'}).click();
      await page.getByRole('tab',{name:'Stash',exact:true}).click();
      await expect(page).toHaveURL(/tab=stash/);
      await page.goBack();
      await expect(page.getByRole('tab',{name:'Projects',exact:true})).toHaveAttribute('aria-selected','true');
      await expect(sample.getByRole('status')).toContainText('1 of');
      expect(await storageSnapshot(page)).toEqual(before);
      expect(await page.evaluate(()=>document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      await page.screenshot({path:'work/after-first-use-'+name.replace(' ','-')+'.png',fullPage:true});
      await page.reload();
      await page.getByText('Try a sample project',{exact:true}).click();
      await expect(sample.getByRole('status')).toContainText('0 of');
    });
    test('chart photograph warning cancels cleanly, then failed import leaves all paths usable', async ({page}) => {
      await quietOnboarding(page);
      await page.goto('/home.html?tab=create');
      await page.locator('.home-import-file-input').setInputFiles(LOGO);
      const dialog=page.getByRole('dialog');
      await expect(dialog).toHaveCount(1);
      await expect(dialog).toContainText('It does not read the grid, symbols or thread key');
      await dialog.getByRole('button',{name:'Cancel',exact:true}).click();
      await expect(dialog).toHaveCount(0);
      await page.locator('.home-import-file-input').setInputFiles(path.join(__dirname,'../fixtures/not-a-pattern.json'));
      await expect(page.locator('[data-toast-id]').filter({hasText:'isn’t a stitchx pattern'})).toBeVisible();
      await expect(page.locator('.import-review-modal')).toHaveCount(0);
      await expect(page.getByRole('button',{name:/Stitch an existing chart/})).toBeEnabled();
      expect((await storageSnapshot(page)).records).toEqual([]);
    });
  });
}

test.describe('Workflow switching', () => {
  test.use(device('desktop'));
  test('rapid Back saves conversion settings; drawing and explicit project resume retain the draft', async ({page}) => {
    await openConvertWithLogo(page);
    const width=page.locator('.size-field').getByLabel('Width in stitches');
    await width.fill('123'); await width.press('Enter');
    await page.goBack();
    await expect(page.getByRole('button',{name:/Convert a picture/})).toBeVisible();
    const drafts=await page.evaluate(()=>BlobStore.list('draft:'));
    expect(drafts).toHaveLength(1); expect(drafts[0].settings.sW).toBe(123);
    await page.getByRole('link',{name:/Draw a pattern/}).click();
    await startBlankGrid(page,{navigate:false,preset:'Small motif'});
    await expect.poll(()=>page.evaluate(()=>ProjectStorage.getActiveProjectId())).toMatch(/^proj_/);
    const id=await page.evaluate(()=>ProjectStorage.getActiveProjectId());
    await page.goto('/home.html');
    await expect(page.locator('.home-active-card')).toBeVisible();
    await page.locator('.home-active-card').getByRole('button',{name:/Edit/}).click();
    await expect(page.locator('.creator-rail, .toolbar-row').first()).toBeVisible();
    await expect(page.getByRole('dialog')).toHaveCount(0);
    expect(await page.evaluate(()=>ProjectStorage.getActiveProjectId())).toBe(id);
    expect((await page.evaluate(()=>BlobStore.list('draft:')))).toHaveLength(1);
    await page.goto('/home.html?tab=projects');
    await page.locator('.home-draft-row').getByRole('button',{name:'Continue',exact:true}).click();
    await expect(width).toHaveValue('123');
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await expect(page.getByRole('button',{name:'Clean-up',exact:true})).toHaveAttribute('aria-expanded','false');
    await page.getByRole('button',{name:'Show all conversion controls'}).click();
    await expect(page.getByRole('button',{name:'Clean-up',exact:true})).toHaveAttribute('aria-expanded','true');
    await page.screenshot({path:'work/after-convert-desktop.png',fullPage:true});
  });
  test('tracker marks survive leaving for another workflow; sample cannot affect real records', async ({page}) => {
    await quietOnboarding(page);
    await page.addInitScript(()=>{ localStorage.setItem('cs_stitchStyle','block'); localStorage.setItem('cs_sessionOnboardingDone','1'); });
    await page.goto('/stitch.html?from=home');
    await page.locator('input[type=file]').first().setInputFiles(ensureTrackerProjectFixture());
    await expect(page.locator(TRACKER_CANVAS)).toBeVisible();
    const at=await trackerCellPoint(page,2,3);
    await page.mouse.click(at.x,at.y);
    await expect.poll(()=>trackerDoneCount(page)).toBe(1);
    await page.goto('/home.html');
    await page.evaluate(async()=>{
      const db=await openManagerDB();
      await new Promise((resolve,reject)=>{const tx=db.transaction('manager_state','readwrite');tx.objectStore('manager_state').put({'dmc:310':{owned:2}},'threads');tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error);});
    });
    const before=await storageSnapshot(page);
    expect(before.records).toHaveLength(1);
    await page.getByRole('tab',{name:'Create new',exact:true}).click();
    await page.getByText('Try a sample project',{exact:true}).click();
    await page.getByRole('button',{name:'Mark next stitch'}).click();
    expect(await storageSnapshot(page)).toEqual(before);
    await page.getByRole('tab',{name:'Projects',exact:true}).click();
    await page.locator('.home-active-card').getByRole('button',{name:'Resume tracking'}).click();
    await expect.poll(()=>trackerDoneCount(page)).toBe(1);
    await expect(page.locator('.home-sample')).toHaveCount(0);
  });
});
