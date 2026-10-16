const {test,expect}=require('@playwright/test');
const {installLocalCdn}=require('./local-cdn');
const {quietOnboarding}=require('./creator-helpers');
test.beforeEach(async({context,page})=>{
  await installLocalCdn(context);
  await quietOnboarding(page);
  await page.addInitScript(()=>{
    localStorage.setItem('cs_sessionOnboardingDone','1');
    localStorage.setItem('cs_stitchStyle','block');
    localStorage.setItem('cs_pref_onboarding.coached.firstStitch_tracker','true');
  });
});
async function open(page,beads=true){
  await page.goto('/home.html');
  await page.evaluate(async(has)=>{
    const p={id:'proj_beads_e2e',name:'Bead overlap',version:11,savedZoom:1,settings:{sW:10,sH:10,fabricCt:14},pattern:Array.from({length:100},()=>({id:'310',type:'solid',rgb:[0,0,0]})),done:Array(100).fill(0),knots:[{x:3,y:3,id:'310',rgb:[0,0,0]}],knotsDone:[],beads:has?[{x:3,y:3,label:'Gold',id:'MH-1',brand:'millhill',rgb:[200,180,40]},{x:3,y:3,label:'Blue',rgb:[0,0,200]}]:[],beadsDone:[]};
    await ProjectStorage.save(p,{resurrect:true});ProjectStorage.setActiveProject(p.id);
  },beads);
  await page.goto('/stitch.html');
  await page.locator('canvas[aria-label^="Cross stitch pattern grid"]').waitFor();
}
async function saved(page){return page.evaluate(()=>ProjectStorage.getActiveProject());}
test('overlap selection, completion, undo/redo, zoom, reload and Creator round trip',async({page})=>{
  await open(page);
  const region=page.getByRole('region',{name:'Bead progress'});
  await expect(region.getByRole('button',{name:'Beads 0/2',exact:true})).toBeVisible();
  await region.getByRole('button',{name:'Beads 0/2',exact:true}).click();
  const first=region.getByRole('button',{name:/Select bead 1:/});
  await first.focus();await page.keyboard.press('Enter');
  await expect(first).toHaveAttribute('aria-pressed','true');
  await region.getByRole('button',{name:'Complete bead 1',exact:true}).click();
  await region.getByRole('button',{name:'Unmark bead 1',exact:true}).click();
  await expect(region.getByRole('button',{name:'Beads 0/2',exact:true})).toBeVisible();
  await region.getByRole('button',{name:'Complete bead 1',exact:true}).click();
  await region.getByRole('button',{name:'Complete bead 2',exact:true}).click();
  await expect(region.getByRole('button',{name:'Beads 2/2',exact:true})).toBeVisible();
  await page.locator('canvas[aria-label^="Cross stitch pattern grid"]').focus();
  await page.keyboard.press('Control+z');
  await expect(region.getByRole('button',{name:'Beads 1/2',exact:true})).toBeVisible();
  await page.keyboard.press('Control+Shift+z');
  await expect(region.getByRole('button',{name:'Beads 2/2',exact:true})).toBeVisible();
  const cellSize=()=>page.evaluate(()=>document.querySelector('.tracker-chart-scroll > div').children[1].getBoundingClientRect().width);
  const baseline=await cellSize();
  for(const [steps,ratio] of [[-5,0.5],[5,1],[10,2]]){
    await page.locator('canvas[aria-label^="Cross stitch pattern grid"]').focus();
    for(let i=0;i<Math.abs(steps);i++)await page.keyboard.press(steps<0?'-':'=');
    await expect.poll(async()=>Math.round((await cellSize())/baseline*100)).toBe(ratio*100);
    await expect(region.getByRole('button',{name:'Beads 2/2',exact:true})).toBeVisible();
    await expect(page.locator('.info-strip-pct')).toHaveText('0.0%');
  }
  await expect.poll(async()=>((await saved(page)).beadsDone||[]).length).toBe(2);
  let p=await saved(page);
  expect(p.done.every(v=>!v)).toBe(true);expect(p.knotsDone||[]).toEqual([]);
  const uids=p.beads.map(b=>b.uid);
  await page.reload();await expect(region.getByRole('button',{name:'Beads 2/2',exact:true})).toBeVisible();
  await page.goto('/create.html');await page.locator('.cs-chart-scroll canvas').waitFor();
  await page.goto('/stitch.html');await expect(region.getByRole('button',{name:'Beads 2/2',exact:true})).toBeVisible();
  p=await saved(page);expect(p.beads.map(b=>b.uid)).toEqual(uids);
});
test('chart taps cycle overlapping beads without marking any stitch',async({page})=>{
  await open(page);
  const canvas=page.locator('canvas[aria-label^="Cross stitch pattern grid"]');
  const chartPoint=()=>page.evaluate(()=>{
    const c=document.querySelector('canvas[aria-label^="Cross stitch pattern grid"]'),r=c.getBoundingClientRect(),t=c.__chartTile||{x:0,y:0};
    const cs=document.querySelector('.tracker-chart-scroll > div').children[1].getBoundingClientRect().width;
    return{x:r.left-t.x+28+1.5*cs,y:r.top-t.y+28+1.5*cs};
  });
  // Pointer events use the same wrapper on touch and desktop.
  let point=await chartPoint();
  await page.mouse.click(point.x,point.y);
  await expect(page.getByRole('button',{name:/Select bead 1:/})).toHaveAttribute('aria-pressed','true');
  point=await chartPoint();
  await page.mouse.click(point.x,point.y);
  await expect(page.getByRole('button',{name:/Select bead 2:/})).toHaveAttribute('aria-pressed','true');
  const p=await saved(page);expect(p.done.every(v=>!v)).toBe(true);expect(p.knotsDone||[]).toEqual([]);expect(p.beadsDone).toEqual([]);
});
test('zero-bead project has no bead disclosure',async({page})=>{
  await open(page,false);await expect(page.getByRole('region',{name:'Bead progress'})).toHaveCount(0);
});
