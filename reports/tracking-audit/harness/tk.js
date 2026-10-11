const lib = require('./lib');
const TH = require('../../../tests/e2e/touch-helpers.js');
const SKIP = () => { try { localStorage.setItem('cs_stitchStyle','block');
  ['tracker','creator','manager','home'].forEach(k => localStorage.setItem('cs_welcome_'+k+'_done','1'));
  localStorage.setItem('cs_sessionOnboardingDone','1');
  ['firstStitch_tracker','rectSelect_tracker','firstStitch_creator','import','undo','progress','save'].forEach(k => localStorage.setItem('cs_pref_onboarding.coached.'+k,'true'));
} catch(e){} };
async function open(page, file, {skipTour=true, viaId}={}) {
  if (skipTour) await page.addInitScript(SKIP);
  const id = viaId || await lib.seed(page, file);
  await page.goto('http://127.0.0.1:'+(process.env.AUDIT_PORT||'8000')+'/stitch.html?id='+id);
  await page.waitForSelector(TH.TRACKER_CANVAS, {timeout: 60000});
  await page.waitForTimeout(1200);
  return id;
}
const counts = page => page.evaluate(() => { const e=document.querySelector('.info-strip-counts'); return e? e.textContent.trim():null; });
const cellPt = (page,x,y,fx,fy)=>TH.trackerCellPoint(page,x,y,fx,fy);
async function clickCell(page,x,y,opts){ const p=await cellPt(page,x,y); await page.mouse.click(p.x,p.y,opts); await page.waitForTimeout(80); }
async function dragCells(page,x0,y,x1){ const a=await cellPt(page,x0,y), b=await cellPt(page,x1,y); await page.mouse.move(a.x,a.y); await page.mouse.down(); const n=Math.abs(x1-x0)*3+1; for(let i=1;i<=n;i++){await page.mouse.move(a.x+(b.x-a.x)*i/n,a.y+(b.y-a.y)*i/n);} await page.mouse.up(); await page.waitForTimeout(150); }
const shot = (page,name,opts)=>page.screenshot(Object.assign({path:lib.SHOTS+name+'.png'},opts||{}));
module.exports = Object.assign({}, lib, TH, { open, counts, cellPt, clickCell, dragCells, shot });
