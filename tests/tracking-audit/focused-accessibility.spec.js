const { test, expect } = require('@playwright/test');
const { prepare, importChart, GRID } = require('../perf/focused-journey.cjs');
const axePath = require.resolve('axe-core/axe.min.js');
test.beforeEach(async ({ context }) => prepare(context));
async function open(page, size=[400,500]) { await importChart(page,size); await page.waitForTimeout(600); }
async function saved(page) {
  return page.evaluate(async () => { await __flushProjectToIDB(); const p=await ProjectStorage.get(localStorage.getItem('crossstitch_active_project'));return p.done.reduce((n,v)=>n+!!v,0); });
}
async function more(page, tab) {
  await page.locator('button[title="More controls"]').click();
  if(tab) await page.locator('#ppal-more-panel .ppal-more-tab').filter({hasText:new RegExp('^'+tab+'$')}).click();
}
test('keyboard import, select thread, mark, undo, save and reopen; bounded status', async ({ page }) => {
  await open(page,[600,800]);
  const first=page.locator('.ppal-tile-select').first();await first.focus();await page.keyboard.press('Enter');
  await expect(first).toHaveAttribute('aria-pressed','true');
  // Return to all threads so arbitrary guide cells can be marked.
  await more(page,'Highlight');await page.getByRole('button',{name:'Clear focus',exact:true}).click();await page.keyboard.press('Escape');
  const grid=page.locator(GRID);await grid.focus();await page.keyboard.press('ArrowRight');
  const status=page.locator('#tracker-chart-status');await expect(status).toContainText('not done');
  await page.keyboard.press('Enter');await expect(status).toContainText(/full cross done/);
  expect(await saved(page)).toBe(1);
  await page.keyboard.press('Control+z');await expect(status).toContainText('not done');expect(await saved(page)).toBe(0);
  await page.keyboard.press('Enter');await page.keyboard.press('ArrowRight');await page.keyboard.press('Enter');
  expect(await saved(page)).toBe(2);
  await page.reload();await page.locator(GRID).waitFor();expect(await saved(page)).toBe(2);
  expect(await page.locator(`${GRID} *`).count()).toBe(0);
  expect(await page.locator('[role=gridcell]').count()).toBe(0);
});
test('rapid marking coalesces announcements and undo counts stay current', async ({ page }) => {
  await open(page);await page.locator(GRID).focus();await page.keyboard.press('ArrowRight');await page.waitForTimeout(350);
  await page.evaluate(()=>{window.statusWrites=0;window.statusObserver=new MutationObserver(()=>window.statusWrites++);window.statusObserver.observe(document.querySelector('#tracker-chart-status'),{childList:true,subtree:true,characterData:true});});
  for(let i=0;i<8;i++){await page.keyboard.press('ArrowRight');await page.keyboard.press('Enter');}
  await expect(page.locator('#tracker-chart-status')).toContainText('8 of 200,000');
  expect(await page.evaluate(()=>statusWrites)).toBeLessThanOrEqual(3);
  expect(await saved(page)).toBe(8);
  for(let i=0;i<8;i++)await page.keyboard.press('Control+z');
  await expect(page.locator('#tracker-chart-status')).toContainText('0 of 200,000');expect(await saved(page)).toBe(0);
  await page.evaluate(()=>statusObserver.disconnect());
});
test('More moves, contains and restores focus, including Escape from a field', async ({ page }) => {
  await open(page);const opener=page.locator('button[title="More controls"]');
  for(let i=0;i<3;i++){
    await more(page,'View');const panel=page.locator('#ppal-more-panel');
    await expect(panel).toHaveAttribute('aria-modal','true');
    expect(await panel.evaluate(e=>e.contains(document.activeElement))).toBe(true);
    // Last and first controls wrap, even as different tabs replace content.
    const buttons=panel.locator('button:visible, input:visible, select:visible');
    await buttons.last().focus();await page.keyboard.press('Tab');expect(await panel.evaluate(e=>e.contains(document.activeElement))).toBe(true);
    await buttons.first().focus();await page.keyboard.press('Shift+Tab');expect(await panel.evaluate(e=>e.contains(document.activeElement))).toBe(true);
    await page.keyboard.press('Escape');await expect(opener).toBeFocused();await expect(panel).toHaveAttribute('aria-hidden','true');
  }
});
test('hidden full crosses cannot be marked by keyboard; zoom and clear guide remain usable', async ({ page }) => {
  await open(page);await more(page,'Layers');await page.getByLabel('Full Cross', {exact:false}).uncheck();await page.keyboard.press('Escape');
  await page.locator(GRID).focus();await page.keyboard.press('ArrowRight');await page.keyboard.press('Enter');
  expect(await saved(page)).toBe(0);await expect(page.locator('#tracker-chart-status')).toContainText('Full crosses hidden');
  await page.keyboard.press('=');await expect(page.locator('#tracker-chart-summary')).toContainText('110%');
  await page.getByRole('button',{name:'Clear the guide crosshair'}).click();await expect(page.locator(GRID)).toBeFocused();
  await expect(page.locator('#tracker-chart-status')).toContainText('No guide');
});
for(const theme of ['light','dark'])test(`axe, targets and focus indication in ${theme}`,async({page})=>{
  await open(page);await page.evaluate(t=>{window.UserPrefs.set('a11yDarkMode',t);window.dispatchEvent(new CustomEvent('cs:prefsChanged',{detail:{key:'a11yDarkMode',value:t}}));},theme);await page.waitForTimeout(350);
  await page.addScriptTag({path:axePath});
  const audit=()=>page.evaluate(async()=> (await axe.run({runOnly:{type:'tag',values:['wcag2a','wcag2aa','wcag21aa']}})).violations.map(v=>({id:v.id,targets:v.nodes.map(n=>n.target)})));
  expect(await audit()).toEqual([]);
  const sizes=await page.locator('.ppal-tile button').evaluateAll(es=>es.filter(e=>e.getBoundingClientRect().height).map(e=>{const r=e.getBoundingClientRect();return {label:e.getAttribute('aria-label'),w:r.width,h:r.height};}));
  expect(sizes.every(r=>r.w>=24&&r.h>=24),JSON.stringify(sizes.filter(r=>r.w<24||r.h<24))).toBe(true);
  await page.keyboard.press('Tab');await page.locator(GRID).focus();const outline=await page.locator('.tracker-chart-scroll').evaluate(e=>getComputedStyle(e).outlineStyle);expect(outline).not.toBe('none');
  await more(page,'View');await page.waitForTimeout(350);expect(await audit()).toEqual([]);await page.keyboard.press('Escape');
});
test('invalid import is announced persistently and can be corrected',async({page})=>{
  await page.goto('/stitch.html?from=home');await page.locator('input[type=file]').first().setInputFiles({name:'broken.json',mimeType:'application/json',buffer:Buffer.from('{broken')});
  const error=page.getByRole('alert').filter({hasText:'Could not load'});await expect(error).toBeVisible();await page.waitForTimeout(4500);await expect(error).toBeVisible();
  // A real subsequent file selection clears the error and opens the chart.
  const {makeTrackerFixture}=require('../_helpers/trackerFixture');await page.locator('input[type=file]').first().setInputFiles(makeTrackerFixture({sW:40,sH:40,nColours:4}));await page.locator(GRID).waitFor();await expect(error).toHaveCount(0);
});

test('Chromium accessibility tree exposes status, selection and a single chart application',async({page,browserName})=>{
  test.skip(browserName!=='chromium','CDP accessibility tree is Chromium-only; this is not a spoken screen-reader test.');
  await open(page,[600,800]);await page.locator(GRID).focus();await page.keyboard.press('ArrowRight');
  await expect(page.locator('#tracker-chart-status')).toContainText('not done');
  const cdp=await page.context().newCDPSession(page);const tree=await cdp.send('Accessibility.getFullAXTree');
  const apps=tree.nodes.filter(n=>!n.ignored&&n.role?.value==='application');expect(apps).toHaveLength(1);
  expect(apps[0].name.value).toContain('Cross stitch pattern grid');
  expect(apps[0].description.value).toContain('600 columns by 800 rows');
  expect(tree.nodes.filter(n=>!n.ignored&&n.role?.value==='status').length).toBeGreaterThan(0);
  expect(tree.nodes.length).toBeLessThan(4000);
});
test('reopen cycles release large-chart memory and canvas allocations',async({page,browserName})=>{
  test.skip(browserName!=='chromium','Deterministic GC and heap reporting require CDP.');
  await open(page,[600,800]);const cdp=await page.context().newCDPSession(page),heaps=[],canvases=[];
  for(let i=0;i<5;i++){
    await page.reload();await page.locator(GRID).waitFor();await page.waitForTimeout(700);
    await cdp.send('HeapProfiler.collectGarbage');heaps.push((await cdp.send('Runtime.getHeapUsage')).usedSize);
    canvases.push(await page.locator('canvas').evaluateAll(es=>es.reduce((n,c)=>n+c.width*c.height*4,0)));
  }
  console.log('REOPEN_MEMORY',JSON.stringify({heaps,canvases}));
  expect(heaps.at(-1)).toBeLessThan(heaps[0]*1.25+8*1024*1024);expect(new Set(canvases).size).toBe(1);
});
