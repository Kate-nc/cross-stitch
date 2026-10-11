const T=require('./tk');
const readDone = (page,id)=>page.evaluate(async id=>{const p=await ProjectStorage.get(id);return p&&p.done?Array.from(p.done).filter(v=>v===1).length:null;},id);
async function dismiss(page){ if(await page.locator('.modal-overlay').count()){ await page.keyboard.press('Escape'); await page.waitForTimeout(300);} }
(async()=>{
  const { ctx, close } = await T.launch({}, 'e9b');
  const A = await ctx.newPage();
  const id = await T.open(A,'small.json');
  const B = await ctx.newPage();
  await B.goto('http://127.0.0.1:8000/stitch.html?id='+id); await B.waitForSelector(T.TRACKER_CANVAS); await B.waitForTimeout(1500); await dismiss(B);
  await A.bringToFront(); await T.dragCells(A,2,2,11); await A.waitForTimeout(6500);
  await B.bringToFront(); await B.waitForTimeout(800);
  for (let k=0;k<3;k++){ const p=await T.cellPt(B,3+k,6); await B.mouse.move(p.x-5,p.y); await B.mouse.move(p.x,p.y); await B.mouse.down(); await B.mouse.up(); await B.waitForTimeout(300); console.log('B click',k, await T.counts(B)); }
  console.log('B toasts:', (await B.evaluate(()=>[...document.querySelectorAll('[class*=toast],[role=status],[role=alert],[role=dialog]')].map(e=>e.className+':'+e.textContent.trim().slice(0,150)))).join(' || '));
  await B.waitForTimeout(6500);
  console.log('IDB after B save:', await readDone(B,id));
  console.log('B toasts:', (await B.evaluate(()=>[...document.querySelectorAll('[class*=toast],[role=status],[role=alert],[role=dialog]')].map(e=>e.className+':'+e.textContent.trim().slice(0,200)))).join(' || '));
  await T.shot(B,'track-two-tabs-after-b-save-desktop');
  await close();
})();
