const T=require('./tk');
const {devices}=require('playwright');
(async()=>{
  const o=Object.assign({},devices['Pixel 5']); delete o.defaultBrowserType;
  const { ctx, close } = await T.launch(o, 'm2');
  const page = await ctx.newPage();
  await T.open(page,'small.json'); await page.waitForTimeout(500);
  const touch = await T.trackerTouchDriver(page);
  const size = await page.evaluate(()=>document.querySelector('.tracker-chart-scroll > div').children[1].getBoundingClientRect().width);
  console.log('cell CSS px at default zoom (phone):', size, '(Apple HIG min target 44, Material 48)');
  const p=await T.cellPt(page,5,5);
  await touch('touchStart',[p]); await page.waitForTimeout(50); await touch('touchEnd',[]); await page.waitForTimeout(300);
  console.log('tap:', await T.counts(page));
  // one-finger vertical swipe 120px "to scroll"
  const a=await T.cellPt(page,8,4); const sc0=await T.trackerScroll(page);
  await touch('touchStart',[a]); for(let i=1;i<=10;i++){await touch('touchMove',[{x:a.x,y:a.y+i*12}]); await page.waitForTimeout(16);} await touch('touchEnd',[]); await page.waitForTimeout(300);
  console.log('one-finger swipe 120px down (intending to scroll):', await T.counts(page), 'scroll moved?', JSON.stringify(sc0), JSON.stringify(await T.trackerScroll(page)));
  // two-finger pan
  const c=await T.cellPt(page,15,10); 
  await touch('touchStart',[{x:c.x,y:c.y,id:1},{x:c.x+30,y:c.y,id:2}]); for(let i=1;i<=8;i++){await touch('touchMove',[{x:c.x,y:c.y-i*12,id:1},{x:c.x+30,y:c.y-i*12,id:2}]); await page.waitForTimeout(16);} await touch('touchEnd',[]); await page.waitForTimeout(300);
  console.log('two-finger pan:', await T.counts(page), JSON.stringify(await T.trackerScroll(page)));
  // button sizes
  const btn = await page.evaluate(()=>[...document.querySelectorAll('button')].filter(b=>{const r=b.getBoundingClientRect();return r.width>0&&r.height>0&&r.top<innerHeight;}).map(b=>({t:(b.getAttribute('aria-label')||b.textContent||'').trim().slice(0,18),w:Math.round(b.getBoundingClientRect().width),h:Math.round(b.getBoundingClientRect().height)})).filter(x=>x.h<44||x.w<44));
  console.log('visible controls smaller than 44px:', JSON.stringify(btn));
  await close();
})();
