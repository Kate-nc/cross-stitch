const T=require('./tk');
const readDone = (page,id)=>page.evaluate(async id=>{const p=await ProjectStorage.get(id);return p&&p.done?Array.from(p.done).filter(v=>v===1).length:null;},id);
const ind = page=>page.evaluate(()=>{const e=[...document.querySelectorAll('*')].filter(x=>x.children.length===0&&/saved|saving|unsaved|not saved/i.test(x.textContent)&&x.getBoundingClientRect().top<60).map(x=>x.textContent.trim());return e.join(' / ');});
async function dismiss(page,name){ if(await page.locator('.modal-overlay').count()){ if(name) await T.shot(page,name); await page.keyboard.press('Escape'); await page.waitForTimeout(300); if(await page.locator('.modal-overlay').count()){ await page.locator('.modal-overlay button').first().click().catch(()=>{}); await page.waitForTimeout(300);} return true;} return false; }
(async()=>{
  const { ctx, close } = await T.launch({}, 'e7');
  const page = await ctx.newPage();
  const id = await T.open(page,'small.json');
  await T.dragCells(page,2,2,11);
  console.log('A: indicator right after marking 10:', await ind(page), '| IDB done:', await readDone(page,id));
  await page.waitForTimeout(6000);
  console.log('A: after 6s:', await ind(page), '| IDB done:', await readDone(page,id));
  await T.dragCells(page,2,3,11);
  await page.reload(); await page.waitForSelector(T.TRACKER_CANVAS); await page.waitForTimeout(1500);
  console.log('B: modal on reload?', await dismiss(page,'track-resume-recap-desktop'));
  console.log('B: after mark 10 + immediate reload:', await T.counts(page));
  await T.dragCells(page,2,4,11);
  console.log('C: marked 10 more, strip', await T.counts(page));
  const page2 = await ctx.newPage(); await page2.goto('http://127.0.0.1:8000/home.html'); await page2.waitForFunction(()=>window.ProjectStorage);
  await page.close({runBeforeUnload:false}); await page2.waitForTimeout(500);
  console.log('C: IDB done after hard close (<1s after marking 10):', await readDone(page2,id));
  const sess = await page2.evaluate(async id=>{const p=await ProjectStorage.get(id);return {n:(p.statsSessions||[]).length,pending:Object.keys(localStorage).filter(k=>k.startsWith('cs_pending'))};},id);
  console.log('C: sessions saved', JSON.stringify(sess));
  await close();
})();
