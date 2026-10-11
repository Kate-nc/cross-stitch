const T=require('./tk');
(async()=>{
  const { ctx, close } = await T.launch({viewport:{width:1440,height:900}}, 'p1');
  const page = await ctx.newPage();
  page.on('pageerror',e=>console.log('pageerror',e.message.slice(0,200)));
  await page.addInitScript(T.SKIP_ADD||(()=>{}));
  const id = await T.seed(page,'large.json');
  await page.addInitScript(()=>{localStorage.setItem('cs_stitchStyle','block');['tracker','creator','manager','home'].forEach(k=>localStorage.setItem('cs_welcome_'+k+'_done','1'));localStorage.setItem('cs_sessionOnboardingDone','1');});
  const t0=Date.now();
  await page.goto('http://127.0.0.1:8000/stitch.html?id='+id);
  await page.waitForSelector(T.TRACKER_CANVAS,{timeout:90000});
  console.log('load to canvas ms', Date.now()-t0);
  await page.waitForTimeout(1500);
  await T.shot(page,'track-large-desktop');
  console.log('legend rows:', await page.locator('.lpanel').innerText().then(t=>(t.match(/\d+\/\d+/g)||[]).length));
  // marking latency: 20 clicks, measure frame time via rAF
  const lat = await page.evaluate(async()=>{ return await new Promise(res=>{ let n=0,max=0,last=performance.now(); function f(t){ max=Math.max(max,t-last); last=t; if(++n<120) requestAnimationFrame(f); else res(max);} requestAnimationFrame(f); }); });
  console.log('idle max frame gap ms', Math.round(lat));
  // drag-mark 30 cells and time
  const a=await T.cellPt(page,2,2), b=await T.cellPt(page,24,2);
  const t1=Date.now(); await page.mouse.move(a.x,a.y); await page.mouse.move(a.x+1,a.y); await page.mouse.down(); for(let i=1;i<=60;i++) await page.mouse.move(a.x+(b.x-a.x)*i/60,a.y); await page.mouse.up(); console.log('drag 60 moves ms', Date.now()-t1, await T.counts(page));
  // fit
  await page.keyboard.press('0'); await page.waitForTimeout(1200); await T.shot(page,'track-large-fit-desktop');
  // find rare colour: look in legend
  const rare = await page.evaluate(()=>[...document.querySelectorAll('.lpanel *')].filter(e=>e.children.length===0&&/^0\/14$/.test(e.textContent.trim())).length);
  console.log('rare legend entry (0/14) present:', rare);
  const lp = await page.evaluate(()=>{const e=document.querySelector('.lpanel'); return {scrollH:e.scrollHeight,clientH:e.clientHeight}}); console.log('legend panel',JSON.stringify(lp));
  await close();
})();
