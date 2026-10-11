const T=require('./tk');
(async()=>{
  const { ctx, close } = await T.launch({}, 'e11');
  const page = await ctx.newPage();
  page.on('console',m=>{const t=m.text(); if(/load|fail|error|project/i.test(t)&&!/Service Worker|SW reg|Canvas2D/.test(t))console.log('console',m.type(),t.slice(0,250));});
  const id = await T.open(page,'small.json');
  await T.dragCells(page,2,2,11); await page.waitForTimeout(200);
  await page.reload({waitUntil:'domcontentloaded'}); await page.waitForTimeout(5000);
  console.log('canvas?', await page.locator(T.TRACKER_CANVAS).count(), '| body:', (await page.innerText('body')).replace(/\n+/g,' | ').slice(60,260));
  const st = await page.evaluate(async id=>{const p=await ProjectStorage.get(id);return p?{done:p.done&&p.done.filter(v=>v).length,sessions:(p.statsSessions||[]).length,keys:Object.keys(p).length, hasPattern:!!p.pattern}:'null'},id);
  console.log('IDB project:', JSON.stringify(st), 'active ptr', await page.evaluate(()=>localStorage.getItem('crossstitch_active_project')));
  await page.reload({waitUntil:'domcontentloaded'}); await page.waitForTimeout(4000);
  console.log('after 2nd reload canvas?', await page.locator(T.TRACKER_CANVAS).count(), await T.counts(page).catch(()=>null));
  await close();
})();
