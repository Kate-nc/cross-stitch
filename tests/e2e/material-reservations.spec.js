const {test,expect}=require('@playwright/test');
const {installLocalCdn}=require('./local-cdn');
test('project reservations, shared shortages, limit edits, substitution confirmation and JSON export',async({page,context})=>{
 await installLocalCdn(context);await page.addInitScript(()=>localStorage.setItem('cs_welcome_manager_done','1'));
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto('/manager.html?from=home&tab=materials');
 await expect(page.getByRole('heading',{name:'Project materials and shopping lists'})).toBeVisible();
 await page.evaluate(async()=>{
  for(const [id,name] of [['proj_a','First chart'],['proj_b','Second chart']])await ProjectStorage.save({id,version:11,name,page:'tracker',settings:{sW:100,sH:10,fabricCt:14,wastePrefs:{tailAllowanceIn:0,generalWasteMultiplier:1}},pattern:Array.from({length:1000},()=>({id:'310'})),done:null});
  await StashBridge.updateThreadOwned('dmc:310',.5);
 });
 await page.getByRole('button',{name:'Refresh estimates',exact:true}).click();
 const first=page.getByRole('region',{name:'First chart',exact:true}),second=page.getByRole('region',{name:'Second chart',exact:true});
 await first.getByRole('button',{name:'Reserve estimated needs'}).click();await expect(first.getByRole('button',{name:'Release reservations'})).toBeEnabled();
 await second.getByRole('button',{name:'Reserve estimated needs'}).click();await expect(second.getByRole('button',{name:'Release reservations'})).toBeEnabled();
 const plan=await page.evaluate(()=>StashBridge.projectMaterials());expect(plan.reserved['dmc:310']).toBeCloseTo(.5,12);expect(plan.combined[0].buySkeins).toBe(1);
 await first.getByRole('spinbutton',{name:'Reservation limit for First chart dmc:310'}).fill('0.1');await first.getByRole('button',{name:'Set limit'}).click();
 await expect.poll(()=>page.evaluate(async()=> (await StashBridge.projectMaterials()).groups[0].rows[0].reserved)).toBe(.1);
 await first.getByRole('textbox',{name:'Substitute for First chart dmc:310'}).fill('anchor:403');await first.getByRole('button',{name:'Confirm substitution'}).click();
 await expect(first.getByText('Confirmed substitution: dmc:310 to anchor:403.')).toBeVisible();
 const download=page.waitForEvent('download');await page.getByRole('button',{name:'Export shopping list JSON'}).click();expect((await download).suggestedFilename()).toBe('stitchx-project-shopping-list.json');
 await first.getByRole('button',{name:'Release reservations'}).click();await expect(first.getByRole('button',{name:'Reserve estimated needs'})).toBeEnabled();
 await page.reload();await expect(page.getByText('Confirmed substitution: dmc:310 to anchor:403.')).toBeVisible();
 expect(errors).toEqual([]);
});
