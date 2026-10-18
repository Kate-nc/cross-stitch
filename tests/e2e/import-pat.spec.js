const {test,expect}=require('@playwright/test');
const {installLocalCdn}=require('./local-cdn');
const {fixture}=require('../fixtures/pat/make-fixture');
test.beforeEach(async({context,page})=>{
  await installLocalCdn(context);
  await page.addInitScript(()=>{['tracker','creator','manager','home'].forEach(k=>localStorage.setItem('cs_welcome_'+k+'_done','1'));});
});
test('Home reviews PAT geometry and limits before saving, then preserves source and existing work',async({page})=>{
  await page.goto('/home.html?tab=create');
  await page.waitForFunction(()=>window.ProjectStorage);
  await page.evaluate(()=>window.ProjectStorage.save({id:'proj_pat_control',v:8,w:1,h:1,name:'Existing chart',settings:{sW:1,sH:1},pattern:[{id:'321',type:'solid'}]}));
  const {bytes}=fixture({runs:[[6,255,255]],extras:[{x:3,y:2,stitches:[[1,9],[2,12],[255,255],[255,255]]}],lines:[[1,1,1,3,2,9,2]]});
  await page.locator('input.home-import-file-input').setInputFiles({name:'geometry.pat',mimeType:'image/jpeg',buffer:bytes});
  await expect(page.getByText('Review imported pattern').first()).toBeVisible();
  await expect(page.getByText('Usable import with limitations').first()).toBeVisible();
  await expect(page.getByRole('region',{name:'Import verification'})).toContainText('PCStitch 7 dimensions');
  await expect(page.getByRole('region',{name:'Import verification'})).toContainText('blends');
  expect(await page.evaluate(()=>window.ProjectStorage.listProjects())).toHaveLength(1);
  await page.locator('.import-review-stitch').click();
  await expect(page).toHaveURL(/stitch\.html/);
  await page.waitForFunction(()=>window.ProjectStorage && window.pako);
  const p=await page.evaluate(()=>window.ProjectStorage.getActiveProject());
  expect(p.settings.sW).toBe(3);expect(p.settings.sH).toBe(2);
  expect(p.partialStitches[0][0]).toBe(5);
  expect(p.partialStitches[0][1].TL.id).toBe('310');expect(p.partialStitches[0][1].BR.id).toBe('321');
  expect(p.bsLines[0]).toMatchObject({x1:0,y1:0,x2:3,y2:2,colorId:'321'});
  const original=await page.evaluate(async()=>{const p=await window.ProjectStorage.getActiveProject(),f=p.meta.attachments.originalFile;return Array.from(f.encoding==='pako-deflate'?window.pako.inflate(f.bytes):f.bytes);});
  expect(original).toEqual([...bytes]);
  expect((await page.evaluate(()=>window.ProjectStorage.get('proj_pat_control'))).pattern[0].id).toBe('321');
});
test('unsupported versions and unrelated PAT formats show actionable errors and save nothing',async({page})=>{
  await page.goto('/home.html?tab=create');
  await page.locator('input.home-import-file-input').setInputFiles({name:'future.pat',mimeType:'application/octet-stream',buffer:fixture({version:8}).bytes});
  await expect(page.getByText(/PCStitch PAT version 8 is unsupported/).first()).toBeVisible();
  await expect(page.getByText('Review imported pattern')).toHaveCount(0);
  await page.locator('input.home-import-file-input').setInputFiles({name:'gimp.pat',mimeType:'application/octet-stream',buffer:Buffer.from('GPAT unrelated pattern')});
  await expect(page.getByText(/other .pat formats are unrelated/).first()).toBeVisible();
  expect(await page.evaluate(()=>window.ProjectStorage.listProjects())).toHaveLength(0);
});
test('Tracker PAT open reaches verification without replacing the existing project on cancellation',async({page})=>{
  await page.goto('/home.html');
  await page.waitForFunction(()=>window.ProjectStorage);
  await page.evaluate(async()=>{
    await window.ProjectStorage.save({id:'proj_pat_control',v:8,w:3,h:2,name:'Existing chart',settings:{sW:3,sH:2,fabricCt:14},pattern:Array.from({length:6},()=>({id:'310',type:'solid'})),bsLines:[],done:null,sessions:[]});
    window.ProjectStorage.setActiveProject('proj_pat_control');
  });
  await page.goto('/stitch.html');
  await page.waitForFunction(()=>window.ImportEngine && window.ImportEngine.importAndReview);
  await page.locator('input[type="file"]').first().setInputFiles({name:'tracker.pat',mimeType:'application/octet-stream',buffer:fixture().bytes});
  await expect(page.getByText('Review imported pattern').first()).toBeVisible();
  await expect(page.getByText('Usable import with limitations').first()).toBeVisible();
  await page.getByRole('button',{name:'Close',exact:true}).last().click();
  expect((await page.evaluate(()=>window.ProjectStorage.get('proj_pat_control'))).name).toBe('Existing chart');
});
