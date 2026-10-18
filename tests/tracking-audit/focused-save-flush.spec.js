const {test,expect}=require('@playwright/test');
const {prepare,importChart,GRID}=require('../perf/focused-journey.cjs');
test.beforeEach(async({context})=>prepare(context));
test('an explicit flush retires unchanged autosave work and later marks still save',async({page})=>{
  await importChart(page,[40,40]);await page.waitForTimeout(700);
  const flushed=await page.evaluate(async()=>{
    const save=ProjectStorage.save.bind(ProjectStorage);window.fullSaveCalls=0;
    ProjectStorage.save=function(){window.fullSaveCalls++;return save(...arguments);};
    await __flushProjectToIDB();return window.fullSaveCalls;
  });
  await page.waitForTimeout(5600);
  expect(await page.evaluate(()=>fullSaveCalls),'no second full-chart write after a successful unchanged flush').toBe(flushed);
  await page.locator(GRID).focus();await page.keyboard.press('ArrowRight');await page.keyboard.press('Enter');
  await expect.poll(()=>page.evaluate(async()=>{
    const id=localStorage.getItem('crossstitch_active_project'),db=await getDB();
    return new Promise(r=>{const q=db.transaction('projects').objectStore('projects').get(id);q.onsuccess=()=>r(q.result.done.reduce((n,v)=>n+!!v,0));});
  }),{timeout:10000}).toBe(1);
  expect(await page.evaluate(()=>fullSaveCalls)).toBeGreaterThan(flushed);
});
