const T=require('./tk');
(async()=>{
  const { ctx, close } = await T.launch({viewport:{width:1440,height:1000},timezoneId:'Europe/London'}, 'c1');
  const page = await ctx.newPage();
  await page.clock.install({time:new Date('2026-10-10T22:50:00Z')}); // 23:50 BST (UTC+1)
  const id = await T.open(page,'small.json');
  console.log('fake now', await page.evaluate(()=>new Date().toString()));
  await T.dragCells(page,2,2,11);                       // 23:50 mark 10
  await page.clock.fastForward('04:00');               // 23:54
  await T.dragCells(page,2,3,11);                       // mark 10 more at 23:54
  await page.clock.fastForward('08:00');               // 00:02 next day (gap 8min < 10 idle)
  await T.dragCells(page,2,4,11);                       // mark 10 more after midnight
  console.log('now', await page.evaluate(()=>new Date().toString()), await T.counts(page));
  await page.getByText('Progress info').click(); await page.waitForTimeout(300);
  console.log('POP:', (await page.locator('body').innerText()).match(/PROGRESS[\s\S]{0,200}/)[0].replace(/\n+/g,' | '));
  await page.keyboard.press('Escape');
  await page.clock.fastForward('11:00'); await page.waitForTimeout(500); // idle -> session finalised
  await page.evaluate(()=>window.__openTrackerStats()); await page.waitForTimeout(1200);
  const t=(await page.locator('.stats-dashboard').innerText()).replace(/\n+/g,' | ');
  console.log('STATS:', t.slice(0,260)); console.log(t.match(/Session journal[\s\S]{0,260}/)[0]);
  console.log('Streaks:', t.match(/Streaks[\s\S]{0,100}/)[0]);
  const s=await page.evaluate(async id=>{await window.__flushProjectToIDB&&0; const p=await ProjectStorage.get(id); return (p.statsSessions||[]).map(x=>({date:x.date,start:x.startTime,end:x.endTime,net:x.netStitches,dur:x.durationSeconds}));},id);
  console.log('stored sessions (may lag autosave):', JSON.stringify(s));
  await close();
})();
