const {test,expect}=require('@playwright/test');
const {prepare,importChart,GRID}=require('../perf/focused-journey.cjs');
test.beforeEach(async({context})=>prepare(context));
test('Space activates native tracker controls and still marks on the chart',async({page})=>{
  await importChart(page,[40,40]);await page.waitForTimeout(400);
  const select=page.locator('.ppal-tile-select').first();await select.press('Space');await expect(select).toHaveAttribute('aria-pressed','true');
  await page.locator('button[title="More controls"]').press('Space');const panel=page.locator('#ppal-more-panel');await expect(panel).toHaveAttribute('aria-hidden','false');
  await panel.getByRole('button',{name:'Clear focus',exact:true}).press('Space');await expect(select).toHaveAttribute('aria-pressed','false');
  await panel.locator('.ppal-more-tab').filter({hasText:/^Layers$/}).press('Space');
  const layer=page.getByLabel('Full Cross',{exact:false});await layer.press('Space');await expect(layer).not.toBeChecked();await layer.press('Space');await expect(layer).toBeChecked();
  await panel.locator('.ppal-more-tab').filter({hasText:/^View$/}).press('Space');
  await panel.getByRole('button',{name:'Zoom in',exact:true}).press('Space');await expect(page.locator('#tracker-chart-summary')).toContainText('125%');
  await page.keyboard.press('Escape');await page.locator(GRID).focus();await page.keyboard.press('ArrowRight');await page.keyboard.press('Space');
  const count=()=>page.evaluate(async()=>{await __flushProjectToIDB();const p=await ProjectStorage.get(localStorage.getItem('crossstitch_active_project'));return p.done.reduce((n,v)=>n+!!v,0);});
  expect(await count()).toBe(1);await page.locator('.ppal-mode-btn[title="Undo (Ctrl+Z)"]').press('Space');expect(await count()).toBe(0);
});
