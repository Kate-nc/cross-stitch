const T=require('./tk');
const readDone = (page,id)=>page.evaluate(async id=>{const p=await ProjectStorage.get(id);return p&&p.done?Array.from(p.done).filter(v=>v===1).length:null;},id);
async function dismiss(page){ if(await page.locator('.modal-overlay').count()){ await page.keyboard.press('Escape'); await page.waitForTimeout(300);} }
(async()=>{
  const { ctx, close } = await T.launch({}, 'e8');
  const page = await ctx.newPage();
  const id = await T.open(page,'small.json');
  await T.dragCells(page,2,2,11); console.log('marked 10:', await T.counts(page));
  await page.waitForTimeout(6500); console.log('IDB after 6.5s:', await readDone(page,id));
  await T.dragCells(page,2,3,11); console.log('marked 10 more:', await T.counts(page));
  const t0=Date.now();
  await page.reload({waitUntil:'domcontentloaded'});
  const p2 = ctx.pages()[0];
  await page.waitForSelector(T.TRACKER_CANVAS); await page.waitForTimeout(1500);
  await dismiss(page);
  console.log('after reload strip:', await T.counts(page), '| IDB:', await readDone(page,id));
  console.log('LS pending:', await page.evaluate(()=>Object.keys(localStorage).filter(k=>/pending|crossstitch_active/.test(k))));
  await close();
})();
