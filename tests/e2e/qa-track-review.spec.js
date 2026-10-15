const {test,expect}=require('@playwright/test');
const {installLocalCdn}=require('./local-cdn');
const {TRACKER_CANVAS,trackerCellPoint}=require('./touch-helpers');
test.beforeEach(async({context,page})=>{
  await installLocalCdn(context);
  await page.addInitScript(()=>{
    localStorage.setItem('cs_stitchStyle','block');
    ['tracker','creator','manager','home'].forEach(k=>localStorage.setItem('cs_welcome_'+k+'_done','1'));
    localStorage.setItem('cs_sessionOnboardingDone','1');
    ['firstStitch_tracker','rectSelect_tracker','firstStitch_creator','import','undo','progress','save'].forEach(k=>localStorage.setItem('cs_pref_onboarding.coached.'+k,'true'));
  });
});
async function seed(page,near=false){
  await page.goto('/home.html');await page.waitForFunction(()=>window.ProjectStorage);
  await page.evaluate(async near=>{
    const c={id:'310',type:'solid',name:'Black',rgb:[0,0,0]};
    const W=near?50:2,H=near?50:1;
    const pattern=near?Array.from({length:2500},()=>({...c})):[c,{id:'__empty__'}];
    const p={id:'proj_qa_progress',name:'Fractional QA',settings:{sW:W,sH:H,fabricCt:14},pattern,done:near?Array.from({length:2500},(_,i)=>i<2499?1:0):[1,0],halfStitches:near?[]:[[1,{fwd:c}]],halfDone:[],originalPaletteState:[{...c,count:near?2500:1,symbol:'A'}]};
    await ProjectStorage.save(p);await ProjectStorage.save({...p,id:'proj_qa_other',name:'Other fractional QA'});ProjectStorage.setActiveProject(p.id);
  },near);
  await page.goto('/stitch.html?id=proj_qa_progress');await page.waitForSelector(TRACKER_CANVAS);
}
test('fractional units agree in Track, Stats, colours and another loaded project',async({page})=>{
  await seed(page);
  await expect(page.locator('.info-strip-pct')).toHaveText('66.7%');
  await expect(page.locator('.info-strip-counts')).toHaveText('1 done · 0.5 to go');
  await page.evaluate(()=>window.__openTrackerStats());
  await expect(page.getByText('of 1.5 stitches')).toBeVisible();
  await expect(page.locator('.progress-ring-label').first()).toHaveText('66.7%');
  await page.getByRole('tab',{name:'Visuals',exact:true}).click();
  await expect(page.locator('.colour-bar').first()).toHaveAttribute('aria-label','66.7% done');
  await expect(page.locator('.colour-remaining').first()).toHaveText('0.5 units left');
  await page.getByRole('button',{name:'Other fractional QA',exact:true}).click();
  await expect(page.locator('.colour-bar').first()).toHaveAttribute('aria-label','66.7% done');
  await page.getByRole('tab',{name:'Overview',exact:true}).click();
  await expect(page.getByText('of 1.5 stitches')).toBeVisible();
  const row=await page.evaluate(async()=> (await ProjectStorage.listProjects()).find(p=>p.id==='proj_qa_other'));
  expect(row.totalStitches).toBe(1.5);expect(row.completedStitches).toBe(1);expect(row.pct).toBe(66.7);
});
test('near complete chart never opens completion prompt, including a complete work area',async({page})=>{
  await seed(page,true);
  await expect(page.locator('.info-strip-pct')).toHaveText('99.9%');
  await expect(page.getByText('Project Complete!',{exact:true})).toHaveCount(0);
  await page.evaluate(()=>window.__workArea.enter({x0:0,y0:0,x1:1,y1:1}));
  await expect(page.getByText('Project Complete!',{exact:true})).toHaveCount(0);
  await page.reload();await page.waitForSelector(TRACKER_CANVAS);
  await expect(page.locator('.info-strip-pct')).toHaveText('99.9%');
  await expect(page.getByText('Project Complete!',{exact:true})).toHaveCount(0);
});
test('marking and unmarking a half refreshes the colour row and survives reload',async({page})=>{
  await seed(page);
  const p=await trackerCellPoint(page,1,0);
  // Click near the forward half, away from the cell centre's ambiguous-diagonal chooser.
  await page.mouse.click(p.x+5,p.y-5);
  await expect(page.locator('.info-strip-pct')).toContainText('Complete!');
  // Dismiss the legitimate completion prompt before opening the palette.
  await page.keyboard.press('Escape');
  await page.getByRole('button',{name:'Open colour palette',exact:true}).click();
  await page.getByRole('button',{name:'Expand sidebar',exact:true}).click();
  await expect(page.locator('.ppal-tile-count').first()).toContainText('1/1 half');
  await page.getByRole('button',{name:'Close palette panel',exact:true}).click();
  if(await page.getByRole('button',{name:'Hide sidebar',exact:true}).isVisible())await page.getByRole('button',{name:'Hide sidebar',exact:true}).click();
  const unmark=await trackerCellPoint(page,1,0);
  await page.mouse.click(unmark.x+5,unmark.y-5);
  await expect(page.locator('.info-strip-pct')).toHaveText('66.7%');
  await page.getByRole('button',{name:'Open colour palette',exact:true}).click();
  if(await page.getByRole('button',{name:'Expand sidebar',exact:true}).isVisible())await page.getByRole('button',{name:'Expand sidebar',exact:true}).click();
  await expect(page.locator('.ppal-tile-count').first()).toContainText('0/1 half');
  await page.evaluate(()=>window.__flushProjectToIDB());
  await page.reload();await page.waitForSelector(TRACKER_CANVAS);
  await expect(page.locator('.info-strip-pct')).toHaveText('66.7%');
});

test('hiding pending halves completes only the visible scope, never the project',async({page})=>{
  await seed(page);
  await page.evaluate(()=>localStorage.setItem('cs_layerVis_proj_qa_progress',JSON.stringify({full:true,half:false,quarter:true,french_knot:true,backstitch:true})));
  await page.reload();await page.waitForSelector(TRACKER_CANVAS);
  await expect(page.locator('.info-strip-pct')).toContainText('Complete!');
  await expect(page.getByText('Project Complete!',{exact:true})).toHaveCount(0);
  await page.evaluate(()=>window.__openTrackerStats());
  await expect(page.locator('.progress-ring-label').first()).toHaveText('66.7%');
});
