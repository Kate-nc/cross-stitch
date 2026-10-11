const T=require('./tk');
(async()=>{
  const { ctx, close } = await T.launch({viewport:{width:1440,height:1000}}, 's1');
  const page = await ctx.newPage();
  const id = await T.open(page,'history.json');
  await page.waitForTimeout(500);
  const dis=async()=>{ await page.waitForSelector('.resume-recap-overlay',{timeout:5000}).catch(()=>{}); if(await page.locator('.modal-overlay').count()){ console.log('RECAP:',(await page.locator('.resume-recap-overlay').innerText()).replace(/\n+/g,' | ')); await T.shot(page,'track-resume-recap-desktop'); await page.keyboard.press('Escape'); await page.waitForTimeout(400); if(await page.locator('.resume-recap-overlay').count()){await page.locator('.resume-recap-overlay button').first().click();await page.waitForTimeout(300);} } };
  await dis();
  console.log('strip:', await T.counts(page));
  await page.getByText('Progress info').click(); await page.waitForTimeout(300);
  console.log('POPOVER:', (await page.locator('body').innerText()).match(/PROGRESS[\s\S]{0,420}/)[0].replace(/\n+/g,' | '));
  await T.shot(page,'track-progress-info-history-desktop'); await page.keyboard.press('Escape');
  await page.evaluate(()=>window.__openTrackerStats()); await page.waitForTimeout(1500);
  const txt=await page.locator('.stats-dashboard').innerText();
  console.log('STATS:', txt.replace(/\n+/g,' | ').slice(0,3500));
  await page.screenshot({path:T.SHOTS+'stats-project-dashboard-desktop-full.png',fullPage:true});
  await close();
})();
