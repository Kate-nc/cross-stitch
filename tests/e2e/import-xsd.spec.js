const {test,expect}=require('@playwright/test');
const {installLocalCdn}=require('./local-cdn');
const {chart}=require('../fixtures/xsd/generate');
test.beforeEach(async({context,page})=>{
  await installLocalCdn(context);
  await page.addInitScript(()=>{['tracker','creator','manager','home'].forEach(k=>localStorage.setItem('cs_welcome_'+k+'_done','1'));});
});
test('Home picker reviews XSD limitations, preserves source and publishes only on confirmation',async({page})=>{
  await page.goto('/home.html?tab=create');
  const {bytes}=chart({joints:[{kind:2,x:0,y:0,x2:3,y2:2,pi:1},{kind:6,x:1,y:1,rotation:90}]});
  await page.locator('input.home-import-file-input').setInputFiles({name:'tiny.xsd',mimeType:'image/jpeg',buffer:bytes});
  await expect(page.getByText('Review imported pattern').first()).toBeVisible();
  await expect(page.getByText('Usable import with limitations').first()).toBeVisible();
  await expect(page.getByRole('region',{name:'Import verification'})).toContainText('XSD binary dimensions');
  const before=await page.evaluate(async()=>window.ProjectStorage.listProjects());expect(before).toHaveLength(0);
  await page.locator('.import-review-stitch').click();
  await expect(page).toHaveURL(/stitch\.html/);
  await page.waitForFunction(()=>window.ProjectStorage && window.pako);
  const project=await page.evaluate(async()=>window.ProjectStorage.getActiveProject());
  expect(project.pattern.slice(0,2).map(t=>t.id)).toEqual(['310','321']);
  expect(project.bsLines[0].colorId).toBe('321');expect(project.beads).toHaveLength(1);
  expect(project._import.verification.status).toBe('limited');
  expect(project.meta.attachments.originalFile.name).toBe('tiny.xsd');
  const restored=await page.evaluate(async()=>{const p=await window.ProjectStorage.getActiveProject();const f=p.meta.attachments.originalFile;return Array.from(f.encoding==='pako-deflate'?window.pako.inflate(f.bytes):f.bytes);});
  expect(restored).toEqual([...bytes]);
});
test('unknown XSD versions and XML schemas show exact errors without a review or saved project',async({page})=>{
  await page.goto('/home.html?tab=create');
  const bytes=chart().bytes;bytes.writeUInt16LE(5,8);
  await page.locator('input.home-import-file-input').setInputFiles({name:'future.xsd',mimeType:'application/octet-stream',buffer:bytes});
  await expect(page.getByText(/unsupported Pattern Maker version 5\.8\.4\.12/).first()).toBeVisible();
  await expect(page.getByText('Review imported pattern')).toHaveCount(0);
  await page.locator('input.home-import-file-input').setInputFiles({name:'schema.xsd',mimeType:'text/xml',buffer:Buffer.from('<?xml version="1.0"?><schema/>')});
  await expect(page.getByText(/XML Schema documents are not charts/).first()).toBeVisible();
  expect(await page.evaluate(async()=>window.ProjectStorage.listProjects())).toHaveLength(0);
});

test('Tracker file open reaches the same XSD verification review',async({page})=>{
  await page.goto('/home.html');
  await page.waitForFunction(()=>window.ProjectStorage);
  await page.evaluate(async()=>{
    await window.ProjectStorage.save({id:'existing-xsd-control',v:8,w:3,h:2,name:'Existing chart',settings:{sW:3,sH:2,fabricCt:14},pattern:Array.from({length:6},()=>({id:'310',type:'solid'})),bsLines:[],done:null,sessions:[]});
    window.ProjectStorage.setActiveProject('existing-xsd-control');
  });
  await page.goto('/stitch.html');
  await page.waitForFunction(()=>window.ImportEngine && window.ImportEngine.importAndReview);
  await page.locator('input[type="file"][accept*=".xsd"]').setInputFiles({name:'tracker.xsd',mimeType:'application/octet-stream',buffer:chart().bytes});
  await expect(page.getByText('Review imported pattern').first()).toBeVisible();
  await expect(page.getByText('Usable import with limitations').first()).toBeVisible();
  const existing=await page.evaluate(()=>window.ProjectStorage.get('existing-xsd-control'));
  expect(existing.pattern).toHaveLength(6);expect(existing.name).toBe('Existing chart');
});
