/* Separate adversarial pass after the main journey audit. */
const {test,expect}=require('@playwright/test');
const {prepare,importChart,GRID}=require('../perf/focused-journey.cjs');
test.beforeEach(async({context})=>prepare(context));
async function count(page){return page.evaluate(async()=>{await __flushProjectToIDB();return (await ProjectStorage.get(localStorage.getItem('crossstitch_active_project'))).done.reduce((n,v)=>n+!!v,0);});}
test('keyboard File > Open, cancel bulk dialog, restore chart focus and continue tracking',async({page})=>{
  await page.goto('/stitch.html?from=home');
  // Exercise the keyboard-reachable command, then supply the OS picker response.
  await page.getByRole('button',{name:'File',exact:true}).press('Enter');
  const open=page.getByRole('button',{name:'Open…',exact:true});
  const chooser=page.waitForEvent('filechooser',{timeout:15000});await open.press('Enter');
  const {makeTrackerFixture}=require('../_helpers/trackerFixture');await (await chooser).setFiles(makeTrackerFixture({sW:400,sH:500,nColours:60}));
  await page.locator(GRID).waitFor();await page.waitForTimeout(600);await page.locator(GRID).focus();
  await page.keyboard.press('ArrowRight');await page.keyboard.press('Enter');
  await page.keyboard.press('Shift+ArrowRight');await page.keyboard.press('Shift+ArrowDown');await page.keyboard.press('Shift+Enter');
  const dialog=page.getByRole('dialog').filter({has:page.locator('#markall-title')});await expect(dialog).toBeVisible();
  expect(await dialog.evaluate(e=>e.contains(document.activeElement))).toBe(true);
  await page.keyboard.press('Shift+Tab');expect(await dialog.evaluate(e=>e.contains(document.activeElement))).toBe(true);
  await page.keyboard.press('Escape');await expect(dialog).toHaveCount(0);await expect(page.locator(GRID)).toBeFocused();
  expect(await count(page)).toBe(1);await page.keyboard.press('Enter');expect(await count(page)).toBe(2);
});
test('completed thread still has contrast and semantic state; no nested controls after completion',async({page})=>{
  const {makeTrackerFixture}=require('../_helpers/trackerFixture');await page.goto('/stitch.html?from=home');
  await page.locator('input[type=file]').first().setInputFiles(makeTrackerFixture({sW:40,sH:40,nColours:4}));await page.locator(GRID).waitFor();
  page.on('dialog',d=>d.accept());await page.locator('.ppal-tile-done-btn').first().click();
  const question=page.getByRole('button',{name:"Count as today's stitching",exact:true});if(await question.isVisible())await question.click();
  const completed=page.locator('.ppal-tile--done').first();await expect(completed).toBeVisible();
  expect(await completed.evaluate(e=>getComputedStyle(e).opacity)).toBe('1');
  await expect(completed.locator('.ppal-tile-select')).toHaveAccessibleName(/100 percent complete/);
  await page.addScriptTag({path:require.resolve('axe-core/axe.min.js')});
  for(const theme of ['light','dark']){
    await page.evaluate(t=>{window.UserPrefs.set('a11yDarkMode',t);window.dispatchEvent(new CustomEvent('cs:prefsChanged',{detail:{key:'a11yDarkMode',value:t}}));},theme);await page.waitForTimeout(350);
    expect(await page.evaluate(async()=> (await axe.run(document.querySelector('.ppal-tile-list'),{runOnly:{type:'tag',values:['wcag2a','wcag2aa','wcag21aa']}})).violations.map(v=>v.id))).toEqual([]);
  }
});
test.describe('touch palette and readable symbols',()=>{
  test.use({viewport:{width:820,height:1180},hasTouch:true,isMobile:false,deviceScaleFactor:2});
  test('coarse-pointer palette actions reach 44 px; large-chart symbols remain reachable at zoom',async({page})=>{
    await importChart(page,[600,800]);await page.waitForTimeout(600);
    // Narrow layouts start with the palette shut. Its toggle is a real button.
    await page.keyboard.press('g');await expect(page.locator('.ppal-tile-select').first()).toBeVisible();
    const targets=await page.locator('.ppal-tile button').evaluateAll(es=>es.filter(e=>e.getBoundingClientRect().width).map(e=>{const r=e.getBoundingClientRect();return [r.width,r.height];}));
    const coarse=await page.evaluate(()=>matchMedia('(pointer:coarse)').matches);console.log('TOUCH_TARGETS',JSON.stringify({coarse,targets:targets.slice(0,6)}));
    // CSS transforms can report 43.9998779 for a 44 px target. Allow
    // only floating-point/layout rounding, never a meaningful target shortfall.
    const minimum=44-0.01;
    expect(targets.length).toBeGreaterThan(0);expect(targets.every(([w,h])=>w>=minimum&&h>=minimum),JSON.stringify(targets.filter(([w,h])=>w<minimum||h<minimum))).toBe(true);
    await page.getByRole('button',{name:'Close palette panel',exact:true}).click();
    await page.locator(GRID).focus();await page.keyboard.press('=');await page.keyboard.press('=');
    const size=await page.locator('.tracker-chart-scroll > div').first().evaluate(e=>e.children[1].getBoundingClientRect().width);
    expect(size).toBeGreaterThanOrEqual(20);
    const tile=await page.locator(GRID).evaluate(c=>({w:c.width,h:c.height,t:c.__chartTile}));
    expect(tile.t.full).toBeFalsy();expect(tile.w).toBe(Math.round(tile.t.w*tile.t.scale));
    expect(tile.w*tile.h).toBeLessThan(600*800*size*size);
  });
});

test('nested preferences closes before More and returns focus to its trigger',async({page})=>{
  await importChart(page,[40,40]);await page.waitForTimeout(600);await page.locator(GRID).focus();await page.keyboard.press('ArrowRight');await page.keyboard.press('Enter');
  await page.locator('button[title="More controls"]').click();await page.locator('.ppal-more-tab').filter({hasText:/^Session$/}).click();
  const trigger=page.getByRole('button',{name:/^Session timing mode:/});await trigger.click();
  const preferences=page.getByRole('dialog',{name:'Settings',exact:true});await expect(preferences).toBeVisible();
  await page.keyboard.press('Escape');await expect(preferences).toHaveCount(0);await expect(page.locator('#ppal-more-panel')).toHaveAttribute('aria-hidden','false');await expect(trigger).toBeFocused();
  await page.keyboard.press('Escape');await expect(page.locator('#ppal-more-panel')).toHaveAttribute('aria-hidden','true');
});

test('keyboard thread selection, mark, undo, JSON download and reopen in fresh storage',async({page,browser})=>{
  await importChart(page,[400,500]);await page.locator(GRID).focus();await page.keyboard.press('ArrowRight');
  await expect(page.locator('.tracker-hover-bar')).toContainText(/DMC/);
  const thread=(await page.locator('.tracker-hover-bar').textContent()).match(/DMC\s+([A-Za-z0-9]+)/)[1];
  await page.getByRole('button',{name:new RegExp('^Select DMC '+thread+',')}).press('Enter');
  await page.keyboard.press('Shift+G');await expect(page.locator(GRID)).toBeFocused();
  await page.keyboard.press('Enter');await page.keyboard.press('Control+z');await page.keyboard.press('Enter');
  const downloadPromise=page.waitForEvent('download');await page.keyboard.press('Control+s');
  const download=await downloadPromise,file=await download.path();
  const exported=JSON.parse(require('fs').readFileSync(file,'utf8'));expect(exported.done.reduce((n,v)=>n+!!v,0)).toBe(1);
  const fresh=await browser.newContext({viewport:{width:1440,height:900},serviceWorkers:'block'});
  try{
    await prepare(fresh);const reopened=await fresh.newPage();await reopened.goto(new URL('/stitch.html?from=home',page.url()).href);
    await reopened.locator('input[type=file]').first().setInputFiles({name:download.suggestedFilename(),mimeType:'application/json',buffer:require('fs').readFileSync(file)});await reopened.locator(GRID).waitFor({timeout:20000});
    expect(await count(reopened)).toBe(1);await expect(reopened.locator('.info-strip-counts')).toContainText('1 done');
  }finally{await fresh.close();}
});
