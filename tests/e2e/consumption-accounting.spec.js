const {test,expect}=require('@playwright/test');
const fs=require('fs'),path=require('path');
const {loadTrackerFixture,ensureTrackerProjectFixture,trackerCellPoint}=require('./touch-helpers');

async function accounting(page){return page.evaluate(async()=>{
 const db=await openManagerDB();try{return await new Promise((resolve,reject)=>{
  const tx=db.transaction('manager_state','readonly'),s=tx.objectStore('manager_state');let threads,ledger;
  s.get('threads').onsuccess=e=>threads=e.target.result;
  s.get('thread_consumption_v2').onsuccess=e=>ledger=e.target.result;
  tx.oncomplete=()=>resolve({owned:threads['dmc:310'].owned,events:Object.values(ledger.events)});tx.onerror=()=>reject(tx.error);
 });}finally{db.close();}
});}

test('Tracker mark, correction, redo, history and reload preserve balances',async({page})=>{
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 const project=JSON.parse(fs.readFileSync(ensureTrackerProjectFixture(),'utf8'));
 project.settings.wastePrefs={enabled:true,tailAllowanceIn:0,generalWasteMultiplier:1};
 const file=path.join(__dirname,'../.tmp/consumption-project.json');fs.writeFileSync(file,JSON.stringify(project));
 await loadTrackerFixture(page,file);
 await page.evaluate(()=>StashBridge.updateThreadOwned('dmc:310',1));
 const point=await trackerCellPoint(page,2,2);
 await page.mouse.click(point.x,point.y);
 await expect.poll(async()=> (await accounting(page)).events.length).toBe(1);
 const cost=4.8*2/14/1890;
 expect((await accounting(page)).owned).toBeCloseTo(1-cost,12);
 await page.keyboard.press('Control+z');
 await expect.poll(async()=> (await accounting(page)).events.length).toBe(2);
 expect((await accounting(page)).owned).toBeCloseTo(1,12);
 await page.keyboard.press('Control+Shift+z');
 await expect.poll(async()=> (await accounting(page)).events.length).toBe(3);
 expect((await accounting(page)).owned).toBeCloseTo(1-cost,12);
 // Establish a fresh rectangle anchor after Redo (Shift release clears it).
 const other=await trackerCellPoint(page,3,2);await page.mouse.click(other.x,other.y);
 await expect.poll(async()=> (await accounting(page)).events.length).toBe(4);
 await page.keyboard.down('Shift');
 await page.mouse.move(point.x,point.y);await page.mouse.down();
 await page.keyboard.down('Alt');await page.mouse.up();
 await page.keyboard.up('Alt');await page.keyboard.up('Shift');
 await expect.poll(async()=> (await accounting(page)).events.length).toBe(6);
 expect((await accounting(page)).events.slice(-2).map(e=>e.kind)).toEqual(['unpick','unpick']);
 expect((await accounting(page)).owned).toBeCloseTo(1-2*cost,12);
 await page.keyboard.press('Control+z');
 await expect.poll(async()=> (await accounting(page)).events.length).toBe(8);
 expect((await accounting(page)).events.slice(-2).map(e=>e.kind)).toEqual(['undo-unpick','undo-unpick']);
 expect((await accounting(page)).owned).toBeCloseTo(1-2*cost,12);
 await page.keyboard.press('Control+Shift+z');
 await expect.poll(async()=> (await accounting(page)).events.length).toBe(10);
 await page.mouse.click(point.x,point.y);
 await expect.poll(async()=> (await accounting(page)).events.length).toBe(11);
 expect((await accounting(page)).owned).toBeCloseTo(1-3*cost,12);
 await page.getByTitle('More controls',{exact:true}).click();
 await page.getByRole('button',{name:'Tools',exact:true}).click();
 await page.getByRole('button',{name:'Thread consumption history',exact:true}).click();
 await expect(page.getByRole('heading',{name:'Thread consumption history'})).toBeVisible();
 await expect(page.getByText(/Corrected accidental progress; only recorded stock debit returned/)).toBeVisible();
 await page.evaluate(()=>window.__flushProjectToIDB());
 await page.reload();
 await page.waitForSelector('canvas[aria-label^="Cross stitch pattern grid"]');
 await expect.poll(async()=> (await accounting(page)).events.length).toBe(11);
 expect((await accounting(page)).owned).toBeCloseTo(1-3*cost,12);
 expect(errors).toEqual([]);
});
