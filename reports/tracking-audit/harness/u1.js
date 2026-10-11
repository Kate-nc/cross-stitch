const T=require('./tk');
(async()=>{
  const { ctx, close } = await T.launch({viewport:{width:1440,height:1000}}, 'u1');
  const page = await ctx.newPage();
  await T.open(page,'history.json');
  await page.waitForSelector('.resume-recap-overlay',{timeout:5000}).catch(()=>{}); if(await page.locator('.resume-recap-overlay').count()){await page.locator('.resume-recap-overlay button',{hasText:/Continue/}).click();await page.waitForTimeout(300);}
  await page.getByRole('button',{name:/^More/i}).first().click(); await page.waitForTimeout(500);
  await T.shot(page,'track-more-panel-desktop');
  for (const t of ['Controls','Highlight','View','Session','Layers','Tools']) {
    const b=page.locator('.ppal-more-panel').getByText(t,{exact:true}).first();
    if(await b.count()){ await b.click().catch(()=>{}); await page.waitForTimeout(400); console.log('--',t,':',(await page.locator('.ppal-more-panel').innerText()).replace(/\n+/g,' | ').slice(0,900)); await T.shot(page,'track-more-'+t.toLowerCase()+'-desktop'); }
  }
  await close();
})();
