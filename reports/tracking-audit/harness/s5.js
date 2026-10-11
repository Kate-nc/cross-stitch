const T=require('./tk');
async function recap(page){ await page.waitForSelector('.resume-recap-overlay',{timeout:4000}).catch(()=>{}); if(await page.locator('.resume-recap-overlay').count()){await page.locator('.resume-recap-overlay button',{hasText:/Continue/}).click();await page.waitForTimeout(300);} }
(async()=>{
  const { ctx, close } = await T.launch({viewport:{width:1440,height:1000}}, 's5');
  const page = await ctx.newPage();
  const id = await T.open(page,'history.json'); await recap(page);
  // unmark 80 stitches (rows 1 and 2) -- frogging a section stitched on earlier days
  await T.dragCells(page,0,0,39); await T.dragCells(page,0,1,39);
  console.log('strip', await T.counts(page));
  await page.getByText('Progress info').click(); await page.waitForTimeout(300);
  console.log('POP:', (await page.locator('body').innerText()).match(/PROGRESS[\s\S]{0,300}/)[0].replace(/\n+/g,' | '));
  await page.keyboard.press('Escape');
  await page.evaluate(()=>window.__openTrackerStats()); await page.waitForTimeout(1200);
  const t=await page.locator('.stats-dashboard').innerText();
  console.log('STATS head:', t.replace(/\n+/g,' | ').slice(0,420));
  console.log('Streak part:', t.replace(/\n+/g,' | ').match(/Streaks[\s\S]{0,140}/)[0]);
  console.log('Journal top:', t.replace(/\n+/g,' | ').match(/Session journal[\s\S]{0,200}/)[0]);
  // finalise: reload
  await page.reload(); await page.waitForSelector(T.TRACKER_CANVAS); await recap(page); await page.waitForTimeout(800);
  const s=await page.evaluate(async id=>{const p=await ProjectStorage.get(id);return {n:p.statsSessions.length,last:p.statsSessions.slice(-1)[0],log:p.stitchLog&&p.stitchLog.slice(-2)};},id);
  console.log('persisted:', JSON.stringify(s));
  await page.evaluate(()=>window.__openTrackerStats()); await page.waitForTimeout(1200);
  const t2=(await page.locator('.stats-dashboard').innerText()).replace(/\n+/g,' | ');
  console.log('after reload:', t2.slice(0,330)); console.log(t2.match(/Streaks[\s\S]{0,140}/)[0]); console.log(t2.match(/Session journal[\s\S]{0,220}/)[0]);
  await T.shot(page,'stats-negative-day-desktop');
  await close();
})();
