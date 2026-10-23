const {test,expect}=require('@playwright/test');
const {installLocalCdn}=require('./local-cdn');
const {quietOnboarding}=require('./creator-helpers');

test.beforeEach(async({page,context})=>{await installLocalCdn(context);await quietOnboarding(page);});

test('Materials, partial stash and library sync share project demand despite profile fabric',async({page})=>{
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto('/home.html');await page.waitForFunction(()=>window.ProjectStorage&&window.StashBridge);
  await page.evaluate(async()=>{
    const pattern=Array.from({length:800},()=>({id:'310',type:'solid'}));
    const id=await ProjectStorage.save({id:'proj_thread_estimate',name:'Thread estimate regression',version:11,
      settings:{sW:40,sH:20,fabricCt:18,isScratchMode:true},pattern,bsLines:[]});
    ProjectStorage.setActiveProject(id);
    await StashBridge.updateThreadOwned('dmc:310',0);
    await StashBridge.saveThreadEdits({'dmc:310':{owned:0,partialStatus:'mostly-full'}},{'dmc:310':{owned:0,partialStatus:null}});
    const db=await openManagerDB();
    await new Promise((resolve,reject)=>{const tx=db.transaction('manager_state','readwrite');
      tx.objectStore('manager_state').put({fabric_count:11,strands_used:3,waste_factor:0},'userProfile');tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error);});db.close();
    UserPrefs.set('creator.materialsTab','threads');
  });
  await page.goto('/create.html');
  await page.getByRole('tab',{name:'Materials',exact:true}).click();
  await page.getByRole('tab',{name:'Threads',exact:true}).click();
  const purchases=page.getByRole('region',{name:'Thread purchases'});
  await expect(purchases).toBeVisible();
  const row=purchases.getByRole('row').filter({hasText:'DMC 310'});
  await expect(row.getByRole('cell').nth(1)).toContainText('0.4 skeins');
  await expect(row.getByRole('cell').nth(2)).toHaveText('0.75');
  await expect(row.getByRole('cell').nth(3)).toHaveText('0');
  await page.getByRole('tab',{name:'Stash status',exact:true}).click();
  await expect(page.getByText('All 1 colours in stash!',{exact:true})).toBeVisible();
  const result=await page.evaluate(async()=>{
    const p=await ProjectStorage.get('proj_thread_estimate');
    const plan=await StashBridge.projectMaterials();
    const raw=threadDemandRows(projectThreadEntries(p),{fabricCount:18})[0].estimatedNeeded;
    const db=await openManagerDB();
    const library=await new Promise(resolve=>{const req=db.transaction('manager_state').objectStore('manager_state').get('patterns');req.onsuccess=()=>resolve(req.result);});db.close();
    const linked=library.find(p=>p.linkedProjectId==='proj_thread_estimate');
    return {raw,planned:plan.groups.find(g=>g.id==='proj_thread_estimate').rows[0].estimatedNeeded,
      fabric:linked.fabricCt,quantity:linked.threads[0].qty};
  });
  expect(result.raw).toBeCloseTo(.3951111111111111,12);
  expect(result.planned).toBeCloseTo(result.raw,12);
  expect(result.fabric).toBe(18);expect(result.quantity).toBe(800);
  expect(errors).toEqual([]);
});

test('browser calculator preserves raw boundary and unequal blend brand lengths',async({page})=>{
  await page.goto('/manager.html?from=home');
  await page.waitForFunction(()=>typeof window.threadDemandRows==='function');
  const result=await page.evaluate(()=>{
    const blend={id:'310+1000',type:'blend',count:3000,blendRatio:[2,1],threads:[{id:'310',brand:'dmc'},{id:'1000',brand:'madeira'}]};
    const project={id:'replacement',settings:{fabricCt:14},pattern:Array(5000).fill({id:'310',brand:'dmc'})};
    const intent={version:1,projects:{replacement:{enabled:true,limits:{},substitutions:{'dmc:310':{key:'madeira:1000',confirmed:true}}}}};
    return {rows:threadDemandRows([blend]),key:threadKeyUsage(blend),boundary:threadUsageText(threadKeyUsage({id:'310',count:1575})),
      replacement:MaterialReservations.plan({},intent,[project]).combined[0]};
  });
  expect(result.rows.map(r=>r.needed)).toEqual([2,1]);
  expect(result.rows.map(r=>r.estimatedNeeded)).toEqual(result.key.skeins);
  expect(result.boundary).toContain('just over 1 skein');
  expect(result.replacement.shortage).toBeCloseTo(2.54,12);
  expect(result.replacement.buySkeins).toBe(3);
});
