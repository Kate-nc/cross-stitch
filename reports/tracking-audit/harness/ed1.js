const T=require('./tk'); const fs=require('fs');
(async()=>{
  const p=JSON.parse(fs.readFileSync(T.S+'fx/history.json','utf8'));
  // simulate: user added one row in the Creator after stitching 1350 stitches (pattern 40x41, done array not resized)
  const row=p.pattern.slice(0,40); p.pattern=p.pattern.concat(row); p.settings.sW=40; p.settings.sH=41; p.id='proj_resized'; p.name='Resized After Tracking';
  fs.writeFileSync(T.S+'fx/resized.json',JSON.stringify(p));
  const { ctx, close } = await T.launch({viewport:{width:1440,height:1000}}, 'ed1');
  const page = await ctx.newPage();
  const id = await T.open(page,'resized.json');
  await page.waitForTimeout(800);
  console.log('strip:', await T.counts(page), '| overlay:', (await page.locator('.resume-recap-overlay').innerText().catch(()=>'')).replace(/\n+/g,' | ').slice(0,300));
  console.log('toasts:', await page.evaluate(()=>[...document.querySelectorAll('[class*=toast]')].map(e=>e.textContent.trim().slice(0,200))));
  await page.waitForTimeout(6000);
  const d=await page.evaluate(async id=>{const q=await ProjectStorage.get(id);return {doneLen:q.done.length,done:q.done.filter(v=>v).length,sessions:q.statsSessions.length};},id);
  console.log('after autosave IDB:', JSON.stringify(d));
  await close();
})();
