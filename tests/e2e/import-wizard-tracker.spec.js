const path = require('path');
const {test, expect} = require('@playwright/test');
const {installLocalCdn} = require('./local-cdn');
const {quietOnboarding, skipTourIfShown} = require('./creator-helpers');

test('guided import in Tracker saves the same cells and dimensions as its live preview', async({page,context})=>{
  await installLocalCdn(context);await quietOnboarding(page);
  await page.addInitScript(()=>{
    localStorage.setItem('cs_pref_experimental.importWizard','true');
    localStorage.setItem('cs_styleOnboardingDone','1');
  });
  await page.goto('/home.html');
  await page.waitForFunction(()=>window.ProjectStorage);
  await page.evaluate(async()=>{
    await ProjectStorage.save({id:'proj_wizard_control',v:8,w:1,h:1,name:'Existing project',settings:{sW:1,sH:1,fabricCt:14},pattern:[{id:'310',type:'solid'}]});
    ProjectStorage.setActiveProject('proj_wizard_control');
  });
  await page.goto('/stitch.html');await skipTourIfShown(page);
  await page.waitForFunction(()=>typeof window.ImportWizard==='function');
  await page.evaluate(()=>{
    const parser=window.parseImagePattern;
    window.__imports=[];
    window.parseImagePattern=(img,opts)=>{const result=parser(img,opts);__imports.push({opts,result});return result;};
  });
  await page.locator('input[type="file"]').first().setInputFiles(path.join(__dirname,'../fixtures/logo.png'));
  await expect(page.getByRole('heading',{name:'Step 1 of 5: Crop & orient'})).toBeVisible();
  await page.getByRole('button',{name:'Rotate 90°'}).click();
  await page.getByRole('radio',{name:'1:1',exact:true}).check();
  await page.getByRole('button',{name:'Next',exact:true}).click();
  await page.getByRole('button',{name:'Next',exact:true}).click();
  await page.getByLabel('Width (stitches)',{exact:true}).fill('20');
  await page.getByRole('button',{name:'Next',exact:true}).click();
  await page.locator('#iw-dith').selectOption('bayer');
  await page.locator('#iw-contrast').focus();await page.keyboard.press('End');
  await page.getByRole('button',{name:'Next',exact:true}).click();
  await expect(page.getByRole('button',{name:'Generate pattern'})).toBeEnabled({timeout:30000});
  const expected=await page.evaluate(()=>{const r=__imports.at(-1).result;return {width:r.width,height:r.height,ids:r.pattern.map(c=>c.id)};});
  expect([expected.width,expected.height]).toEqual([20,20]);
  await page.getByRole('button',{name:'Generate pattern'}).click();
  await expect(page.getByRole('heading',{name:'Step 5 of 5: Confirm'})).toHaveCount(0);
  await expect.poll(()=>page.evaluate(async()=>{
    const p=await ProjectStorage.getActiveProject();return p&&{width:p.settings.sW,height:p.settings.sH,ids:p.pattern.map(c=>c.id)};
  })).toEqual(expected);
  const finalOptions=await page.evaluate(()=>__imports.at(-1).opts);
  expect(finalOptions.crop).toMatchObject({rotate:90,aspect:'1:1'});
  expect(finalOptions.settings).toMatchObject({dithAlgo:'bayer',contrast:50});
  await page.reload();
  await expect.poll(()=>page.evaluate(async()=>{
    if(!window.ProjectStorage)return null;
    const p=await ProjectStorage.getActiveProject();return p&&p.pattern.map(c=>c.id);
  })).toEqual(expected.ids);
});
